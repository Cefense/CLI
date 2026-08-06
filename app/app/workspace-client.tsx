"use client";

/* eslint-disable @next/next/no-html-link-for-pages */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatGPTUser } from "../chatgpt-auth";
import type {
  CyberusFinding,
  CyberusPlan,
  CyberusProfile,
  CyberusScan,
} from "../../db/cyberus";
import {
  demoFindings,
  navGroups,
  normalizeView,
  secondaryNavGroups,
  type AppView,
} from "./workspace-config";
import { ConnectScreen } from "./views/connect-screen";
import { FeedView } from "./views/feed-view";
import { FindingDetailView } from "./views/finding-detail-view";
import { FixView } from "./views/fix-view";
import { ReportsView } from "./views/reports-view";
import { RepositoryView } from "./views/repository-view";
import { AssetInventoryView } from "./views/assets-view";
import { PentestsView } from "./views/pentests-view";
import { CodeAuditView } from "./views/code-audit-view";
import { IntegrationsView } from "./views/integrations-view";
import { LibraryView } from "./views/library-view";

type Props = {
  user: ChatGPTUser;
  initialProfile: CyberusProfile | null;
  requestedPlan: CyberusPlan;
  requestedView: string;
  initialScan: CyberusScan | null;
};

type CaseStage = "observed" | "matched" | "fix" | "proof";

const caseStages: Array<[string, CaseStage]> = [
  ["Observed", "observed"],
  ["Matched", "matched"],
  ["Fix", "fix"],
  ["Proof", "proof"],
];

export function WorkspaceClient({
  user,
  initialProfile,
  initialScan,
  requestedPlan,
  requestedView,
}: Props) {
  const [profile, setProfile] = useState(initialProfile);
  const [editing, setEditing] = useState(!initialProfile?.onboardingComplete);
  const [plan, setPlan] = useState<CyberusPlan>(
    initialProfile?.plan ?? requestedPlan,
  );
  const [company] = useState(initialProfile?.company ?? "");
  const [stack, setStack] = useState(
    initialProfile?.stack ?? "Node.js / TypeScript",
  );
  const [repositoryUrl, setRepositoryUrl] = useState(
    initialProfile?.repositoryUrl ?? "",
  );
  const [watchlist, setWatchlist] = useState<string[]>(
    initialProfile?.watchlist ?? ["Authentication", "Supply chain"],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<AppView>(
    normalizeView(requestedView || "feed"),
  );
  const [caseStage, setCaseStage] = useState<CaseStage>("observed");
  const [stageDirection, setStageDirection] = useState<"forward" | "backward">("forward");
  const [stageHasTransitioned, setStageHasTransitioned] = useState(false);
  const [scan, setScan] = useState(initialScan);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [selectedFindingId, setSelectedFindingId] = useState(
    (initialScan?.findings[0] ?? demoFindings[0]).id,
  );
  const [repairReady, setRepairReady] = useState(false);
  const [evidenceReady, setEvidenceReady] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [repoMenuOpen, setRepoMenuOpen] = useState(false);
  // The big reachable-critical-paths counter is on by default; a workspace
  // preference (persisted locally) lets anyone who finds it loud switch it off.
  const [showSignal, setShowSignal] = useState(true);
  const [feedDetailOpen, setFeedDetailOpen] = useState(false);
  const [resolvedIds, setResolvedIds] = useState<string[]>([]);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("cyberus:showSignal");
      if (stored !== null) setShowSignal(stored === "1");
    } catch {
      /* localStorage unavailable — keep the default */
    }
  }, []);
  function toggleSignal() {
    setShowSignal((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("cyberus:showSignal", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }
  const [feedback, setFeedback] = useState("");
  const feedbackTimer = useRef<ReturnType<typeof window.setTimeout> | null>(
    null,
  );
  const settingsPushed = useRef(false);

  // The feed is wired to the backend: it pulls live findings from /api/feed and
  // falls back to the seeded set if the request hasn't returned. A real backend
  // only has to serve /api/feed — the UI already consumes it.
  const [liveFindings, setLiveFindings] = useState<CyberusFinding[] | null>(
    null,
  );
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/feed", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { findings?: CyberusFinding[] } | null) => {
        if (data?.findings?.length) setLiveFindings(data.findings);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const findings = scan?.findings.length
    ? scan.findings
    : (liveFindings ?? demoFindings);
  const feedFindings = findings.filter(
    (finding) => !resolvedIds.includes(finding.id),
  );
  const selectedFinding =
    findings.find((finding) => finding.id === selectedFindingId) ?? findings[0];
  const current = profile ?? { plan, stack, repositoryUrl, watchlist };
  const rememberedName = profile?.fullName ?? user.displayName;
  // Settings renders in the canvas like any other tab; first-run (no profile
  // yet) is the only overlay, and it is a pop-up, never a page.
  const settingsOpen = editing && Boolean(profile);

  function announce(message: string) {
    setFeedback(message);
    if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setFeedback(""), 2400);
  }

  useEffect(
    () => () => {
      if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
    },
    [],
  );

  useEffect(() => {
    const onBack = () => {
      const params = new URLSearchParams(window.location.search);
      const nextView = normalizeView(params.get("view") ?? "feed");
      setView(nextView);
      if (nextView === "feed") setCaseStage("observed");
      if (nextView === "autofix") setCaseStage("fix");
      if (nextView === "reports") setCaseStage("proof");
      const settingsOpen = params.get("settings") === "1";
      setEditing(settingsOpen);
      if (!settingsOpen) settingsPushed.current = false;
    };
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, []);

  // The authenticated product is a workstation, not a document. Lock the page
  // itself and let only purpose-built panes own overflow.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverscroll = html.style.overscrollBehavior;
    const previousBodyOverscroll = body.style.overscrollBehavior;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";

    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      html.style.overscrollBehavior = previousHtmlOverscroll;
      body.style.overscrollBehavior = previousBodyOverscroll;
    };
  }, []);

  const repositoryName = useMemo(() => {
    if (scan?.repositoryName) return scan.repositoryName;
    if (current.repositoryUrl?.startsWith("demo://"))
      return "cefense/demo-payments-api";
    return (
      current.repositoryUrl
        ?.replace(/^https?:\/\/(www\.)?github\.com\//, "")
        .replace(/\/$/, "") || "No repository connected"
    );
  }, [current.repositoryUrl, scan]);

  function selectView(next: AppView) {
    setView(next);
    // Settings is a workspace destination, not a persistent overlay. Clear
    // its local state before switching so the selected view can render.
    setEditing(false);
    setFeedDetailOpen(false);
    settingsPushed.current = false;
    if (next === "feed") setCaseStage("observed");
    if (next === "autofix") setCaseStage("fix");
    if (next === "reports") setCaseStage("proof");
    setNavigationOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    url.searchParams.delete("settings");
    window.history.pushState(
      { cyberusView: next },
      "",
      `${url.pathname}${url.search}`,
    );
  }

  function selectCaseStage(next: CaseStage) {
    // The strip is the story of the currently selected attack path. It always
    // operates on the feed's case system so the same object moves through the
    // four stages no matter which sidebar view the user came from.
    setEditing(false);
    setFeedDetailOpen(false);
    settingsPushed.current = false;
    if (view === "autofix" || view === "reports") {
      setView("feed");
      const url = new URL(window.location.href);
      url.searchParams.set("view", "feed");
      window.history.replaceState(
        { cyberusView: "feed" },
        "",
        `${url.pathname}${url.search}`,
      );
    }
    const currentIndex = caseStages.findIndex(([, stage]) => stage === caseStage);
    const nextIndex = caseStages.findIndex(([, stage]) => stage === next);
    setStageDirection(nextIndex >= currentIndex ? "forward" : "backward");
    setStageHasTransitioned(true);
    setCaseStage(next);
    announce(
      next === "observed"
        ? "Showing the observed attack."
        : next === "matched"
          ? "Showing the code match."
          : next === "fix"
            ? "Showing the focused fix."
            : "Showing closure proof.",
    );
  }

  // Power users move the path through its stages without the mouse: 1–4.
  useEffect(() => {
    const onStageKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = (event.target as HTMLElement).tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      const stageByKey: Record<string, CaseStage> = {
        "1": "observed",
        "2": "matched",
        "3": "fix",
        "4": "proof",
      };
      const next = stageByKey[event.key];
      if (next) {
        event.preventDefault();
        selectCaseStage(next);
      }
    };
    window.addEventListener("keydown", onStageKey);
    return () => window.removeEventListener("keydown", onStageKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, caseStage]);

  function openSettings() {
    if (editing) return;
    setEditing(true);
    settingsPushed.current = true;
    const url = new URL(window.location.href);
    url.searchParams.set("settings", "1");
    window.history.pushState(
      { cyberusSettings: true },
      "",
      `${url.pathname}${url.search}`,
    );
  }

  function closeSettings() {
    // If we pushed the settings entry ourselves, pop it so Back doesn't hit a
    // dead duplicate; the popstate handler restores editing=false. Direct
    // ?settings=1 loads have no entry of ours to pop, so rewrite in place.
    if (settingsPushed.current) {
      settingsPushed.current = false;
      window.history.back();
      return;
    }
    setEditing(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("settings");
    window.history.replaceState(
      { cyberusView: view },
      "",
      `${url.pathname}${url.search}`,
    );
  }

  function toggleTopic(topic: string) {
    setWatchlist((currentTopics) =>
      currentTopics.includes(topic)
        ? currentTopics.filter((item) => item !== topic)
        : [...currentTopics, topic],
    );
  }

  async function persistWorkspace(options?: {
    repository?: string;
    plan?: CyberusPlan;
    stayInWorkspace?: boolean;
  }) {
    const nextPlan = options?.plan ?? plan;
    const nextRepository = options?.repository ?? repositoryUrl;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plan: nextPlan,
          company,
          stack,
          repositoryUrl: nextRepository,
          watchlist,
        }),
      });
      const data = (await response.json()) as {
        profile?: CyberusProfile;
        error?: string;
      };
      if (!response.ok || !data.profile)
        throw new Error(data.error ?? "Could not save workspace");
      setPlan(nextPlan);
      setRepositoryUrl(nextRepository);
      setProfile(data.profile);
      if (options?.stayInWorkspace) closeSettings();
      else {
        setEditing(false);
        selectView("feed");
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save workspace",
      );
    } finally {
      setSaving(false);
    }
  }

  async function scanRepository() {
    setScanning(true);
    setScanError("");
    announce("Scan started. You can keep working.");
    try {
      const response = await fetch("/api/repository/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repositoryUrl }),
      });
      const data = (await response.json()) as {
        scan?: CyberusScan;
        error?: string;
      };
      if (!response.ok || !data.scan)
        throw new Error(data.error ?? "Repository scan failed");
      setScan(data.scan);
      setRepositoryUrl(data.scan.repositoryUrl);
      setSelectedFindingId(data.scan.findings[0]?.id ?? demoFindings[0].id);
      announce(
        `Scan complete. ${data.scan.findings.length} findings are ready in Feed.`,
      );
    } catch (caught) {
      setScanError(
        caught instanceof Error ? caught.message : "Repository scan failed",
      );
      announce("Scan could not complete. Check the repository and try again.");
    } finally {
      setScanning(false);
    }
  }

  async function connectAndScan() {
    if (!repositoryUrl || repositoryUrl.startsWith("demo://")) return;
    setSaving(true);
    setError("");
    try {
      const profileResponse = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plan: "immunity",
          company,
          stack,
          repositoryUrl,
          watchlist,
        }),
      });
      const profileData = (await profileResponse.json()) as {
        profile?: CyberusProfile;
        error?: string;
      };
      if (!profileResponse.ok || !profileData.profile)
        throw new Error(profileData.error ?? "Could not create workspace");
      const scanResponse = await fetch("/api/repository/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repositoryUrl }),
      });
      const scanData = (await scanResponse.json()) as {
        scan?: CyberusScan;
        error?: string;
      };
      if (!scanResponse.ok || !scanData.scan)
        throw new Error(scanData.error ?? "Repository scan failed");
      setPlan("immunity");
      setProfile(profileData.profile);
      setScan(scanData.scan);
      setSelectedFindingId(scanData.scan.findings[0]?.id ?? demoFindings[0].id);
      setEditing(false);
      selectView("feed");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not scan repository",
      );
    } finally {
      setSaving(false);
    }
  }

  // Nobody gets an extra page between "Open workspace" and the app. First-run
  // setup and settings both render OVER the live workspace — a pop-up, not a
  // detour — so the product is always the thing on screen.
  return (
    <main
      className={
        navigationOpen ? "product-workspace nav-open" : "product-workspace"
      }
    >
      <aside className="product-sidebar">
        <div className="product-sidebar-head">
          <a className="product-brand" href="/">
            <span className="wordmark-dot" /> CEFENSE
          </a>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setNavigationOpen(false)}
          >
            ×
          </button>
        </div>
        <div className="workspace-switcher-wrap">
          <button
            className={
              repoMenuOpen ? "workspace-switcher open" : "workspace-switcher"
            }
            type="button"
            aria-expanded={repoMenuOpen}
            aria-haspopup="menu"
            onClick={() => setRepoMenuOpen((open) => !open)}
          >
            <span>{repositoryName}</span>
          </button>
          {repoMenuOpen && (
            <>
              <button
                className="repo-menu-scrim"
                type="button"
                aria-label="Close"
                onClick={() => setRepoMenuOpen(false)}
              />
              <div className="repo-menu" role="menu">
                <p className="repo-menu-label">Repository</p>
                <div className="repo-menu-current">
                  <span className="repo-dot" />
                  <span>{repositoryName}</span>
                </div>
                <button
                  className="repo-menu-action"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setRepoMenuOpen(false);
                    selectView("repositories");
                  }}
                >
                  Manage repositories
                </button>
              </div>
            </>
          )}
        </div>
        <nav aria-label="Cefense workspace navigation">
          {navGroups.map((group) => (
            <section key={group.title || "primary"}>
              {group.title && <p>{group.title}</p>}
              {group.items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={view === item.id ? "active" : ""}
                  onClick={() => selectView(item.id)}
                >
                  <i>{item.icon}</i>
                  <span>{item.label}</span>
                </button>
              ))}
            </section>
          ))}
          <section className="secondary-navigation">
            {secondaryNavGroups.map((group) => (
              <div key={group.title}>
                <p>{group.title}</p>
                {group.items.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={view === item.id ? "active" : ""}
                    onClick={() => selectView(item.id)}
                  >
                    <i>{item.icon}</i>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </section>
        </nav>
        <button
          className={editing ? "sidebar-account active" : "sidebar-account"}
          type="button"
          onClick={openSettings}
        >
          <span>{rememberedName.slice(0, 1).toUpperCase()}</span>
          <div>
            <b>{rememberedName}</b>
            <small>Settings</small>
          </div>
        </button>
      </aside>
      <button
        className="nav-scrim"
        type="button"
        aria-label="Close navigation"
        onClick={() => setNavigationOpen(false)}
      />

      <section
        className={`product-canvas product-canvas-${view}`}
        data-case-stage={caseStage}
      >
        {!settingsOpen && <header className="product-topbar">
          <button
            className="mobile-nav-trigger"
            type="button"
            aria-label="Open navigation"
            onClick={() => setNavigationOpen(true)}
          >
            ☰
          </button>
          <nav className="workspace-flow-strip" aria-label="Attack to proof flow">
            {caseStages.map(([label, stage], index) => {
              const stageIndex = caseStages.findIndex(
                ([, value]) => value === caseStage,
              );
              const done =
                index < stageIndex ||
                (stage === "fix" && repairReady) ||
                (stage === "proof" && evidenceReady);
              return (
                <button
                  key={label}
                  type="button"
                  className={`${caseStage === stage ? "active" : done ? "done" : ""} flow-step-${index + 1}`}
                  aria-current={caseStage === stage ? "step" : undefined}
                  title={`${label} · press ${index + 1}`}
                  onClick={() => selectCaseStage(stage)}
                >
                  <i>{done && caseStage !== stage ? "✓" : index + 1}</i>
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>
        </header>}
        <div
          className={`workspace-feedback${feedback ? " visible" : ""}`}
          role="status"
          aria-live="polite"
        >
          {feedback}
        </div>

        <div
          key={`${view}-${caseStage}-${feedDetailOpen ? "detail" : "list"}`}
          className={`product-content ${!settingsOpen && view === "feed" && !feedDetailOpen ? "feed-content" : ""} ${!settingsOpen && feedDetailOpen ? "detail-content" : ""} ${!settingsOpen && view === "reports" ? "reports-content immunity-content" : ""} ${stageHasTransitioned && !settingsOpen && !feedDetailOpen && (view === "feed" || view === "autofix" || view === "reports") ? `stage-transition-${stageDirection}` : ""}`}
        >
          {settingsOpen ? (
            <ConnectScreen
              user={user}
              profile={profile}
              repositoryUrl={repositoryUrl}
              setRepositoryUrl={setRepositoryUrl}
              stack={stack}
              setStack={setStack}
              watchlist={watchlist}
              toggleTopic={toggleTopic}
              saving={saving}
              error={error}
              showSignal={showSignal}
              onToggleSignal={toggleSignal}
              connectAndScan={connectAndScan}
              persistWorkspace={persistWorkspace}
            />
          ) : (
          <>
            {view === "feed" &&
              (caseStage === "observed" || caseStage === "matched") &&
              (feedDetailOpen ? (
                <FindingDetailView
                  finding={selectedFinding}
                  stage={caseStage}
                  onBack={() => setFeedDetailOpen(false)}
                  onFix={() => {
                    setFeedDetailOpen(false);
                    announce("Opening the proposed fix.");
                    selectCaseStage("fix");
                  }}
                  onDismiss={(id) => {
                    setResolvedIds((current) => [...current, id]);
                    setFeedDetailOpen(false);
                    announce("Finding dismissed.");
                  }}
                  onFeedback={announce}
                />
              ) : (
                <FeedView
                  findings={feedFindings}
                  stage={caseStage}
                  showSignal={showSignal}
                  dismissedCount={resolvedIds.length}
                  onOpen={(id) => {
                    setSelectedFindingId(id);
                    setFeedDetailOpen(true);
                  }}
                  onRestore={() => setResolvedIds([])}
                  scan={scan}
                />
              ))}
            {(view === "autofix" || (view === "feed" && caseStage === "fix")) && (
              <FixView
                finding={selectedFinding}
                ready={repairReady}
                onPrepare={() => {
                  setRepairReady(true);
                  announce("Review package ready.");
                }}
                onVerify={() => {
                  announce("Verification complete.");
                  if (view === "feed") selectCaseStage("proof");
                  else selectView("reports");
                }}
              />
            )}
            {view === "repositories" && (
              <RepositoryView
                repositoryUrl={repositoryUrl}
                setRepositoryUrl={setRepositoryUrl}
                scan={scan}
                scanning={scanning}
                error={scanError}
                onScan={scanRepository}
              />
            )}
            {view === "containers" && <AssetInventoryView kind="containers" />}
            {view === "clouds" && <AssetInventoryView kind="clouds" />}
            {view === "domains" && <AssetInventoryView kind="domains" />}
            {view === "pentests" && <PentestsView />}
            {view === "code-audit" && (
              <CodeAuditView
                findings={findings}
                onFix={() => selectView("autofix")}
              />
            )}
            {view === "integrations" && <IntegrationsView />}
            {(view === "reports" || (view === "feed" && caseStage === "proof")) && (
              <ReportsView
                finding={selectedFinding}
                repairReady={repairReady}
                evidenceReady={evidenceReady}
                onGenerateEvidence={() => setEvidenceReady(true)}
                showCatalog={view === "reports"}
              />
            )}
            {view === "library" && <LibraryView />}
          </>
          )}
        </div>
      </section>
      {editing && !profile && (
        <ConnectScreen
          user={user}
          profile={profile}
          repositoryUrl={repositoryUrl}
          setRepositoryUrl={setRepositoryUrl}
          stack={stack}
          setStack={setStack}
          watchlist={watchlist}
          toggleTopic={toggleTopic}
          saving={saving}
          error={error}
          connectAndScan={connectAndScan}
          persistWorkspace={persistWorkspace}
        />
      )}
    </main>
  );
}
