"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { CyberusFinding } from "../../../db/cyberus";
import { immunityThreats } from "../immunity-threats";

const threatTones = ["coral", "violet", "green", "amber", "cyan", "blue", "gold", "plum"] as const;
const alphabet = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"] as const;
const sortedThreats = [...immunityThreats].sort((a, b) =>
  a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }),
);

const markPalette = ["#b97918", "#8c6a24", "#a85e35", "#66734b", "#986f3c", "#7b6446", "#b38b2d"] as const;

const symbolRules = [
  { match: /trojan|horse/i, kind: "horse", symbol: "♞" },
  { match: /python|snake|viper|cobra|serpent/i, kind: "snake", symbol: "∿" },
  { match: /phish|email|mail|spoof/i, kind: "phish", symbol: "✉" },
  { match: /auth|authorization|access|privilege|credential|token|session|identity|password|account/i, kind: "shield", symbol: "⬟" },
  { match: /injection|code|xss|scripting|rce|execution|overflow|deserializ|xxe/i, kind: "code", symbol: "</>" },
  { match: /lock|ransom|encrypt|crypto|key|secret|certificate/i, kind: "lock", symbol: "⌑" },
  { match: /cloud|metadata|iam|s3|lambda|azure|aws|gcp|serverless/i, kind: "cloud", symbol: "☁" },
  { match: /dns|network|c2|command-and-control|tunnel|proxy|vpn|hijack|spoofing/i, kind: "network", symbol: "◌" },
  { match: /supply|dependency|package|npm|pypi|nuget|docker|container|build/i, kind: "package", symbol: "▣" },
  { match: /command|shell|powershell|bash|wmi|terminal|admin/i, kind: "terminal", symbol: ">_" },
  { match: /data|sql|database|exfiltration|dump|clipboard|browser/i, kind: "database", symbol: "▤" },
  { match: /botnet|rat|remote|loader|malware|rootkit|spyware|stealer|keylogger|worm/i, kind: "malware", symbol: "⌬" },
  { match: /web|http|apache|confluence|wordpress|cors|csrf|redirect|browser/i, kind: "web", symbol: "◫" },
  { match: /exploit|vulnerability|cve|zero.?day|arbitrary|weak|overflow/i, kind: "exploit", symbol: "⧉" },
  { match: /ddos|denial|flood|amplification|wiper|destruction/i, kind: "impact", symbol: "✦" },
] as const;

const fallbackKinds = ["radar", "signal", "barrier", "graph"] as const;

function threatMark(threat: string, index: number) {
  let hash = 2166136261;
  for (const character of threat) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const safeHash = hash >>> 0;
  const matchedSymbol = symbolRules.find(({ match }) => match.test(threat));
  const fallbackKind = fallbackKinds[safeHash % fallbackKinds.length];
  const radii = ["50%", "42%", "18px", "12px 22px 22px 12px", "8px 18px"] as const;
  return {
    symbolKind: matchedSymbol?.kind ?? fallbackKind,
    style: {
      "--mark-color": markPalette[safeHash % markPalette.length],
      "--mark-secondary": markPalette[(safeHash >>> 5) % markPalette.length],
      "--mark-angle": `${(safeHash % 120) - 60}deg`,
      "--mark-radius": radii[safeHash % radii.length],
      "--mark-width": `${24 + (safeHash % 16)}px`,
      "--mark-height": `${20 + ((safeHash >>> 7) % 16)}px`,
      "--mark-scale": `${0.78 + ((safeHash >>> 8) % 18) / 100}`,
      "--mark-bar": `${1 + ((safeHash >>> 16) % 2)}px`,
      "--mark-dot": `${3 + ((safeHash >>> 22) % 5)}px`,
      "--mark-index": index,
      "--symbol-variant": safeHash % 5,
      "--icon-url": `url("/immunity/threat-icons/threat-${String(index).padStart(4, "0")}.svg")`,
    } as CSSProperties,
  };
}

type ThreatProfile = {
  family: string;
  summary: string;
  lens: string;
  watch: string[];
  boundaries: string[];
  response: string;
};

type ThreatRule = Omit<ThreatProfile, "lens"> & { match: RegExp };

const threatRules: ThreatRule[] = [
  {
    match: /phish|social engineering|business email|voice phishing|evil twin/i,
    family: "Identity deception",
    summary: "A trust attack that makes a person, inbox, or sign-in surface part of the delivery path.",
    watch: ["Unusual sign-in or mailbox flows", "Look-alike destinations and sender context", "Session or token use after the initial click"],
    boundaries: ["identity handoff", "session creation", "email or browser trust"],
    response: "Cefense connects the observed lure to the identity and session boundaries it can actually reach, then keeps the replay evidence with the fix.",
  },
  {
    match: /ransom|locker|wiper|disk wipe|data destruction|double extortion/i,
    family: "Destructive operations",
    summary: "A destructive pattern that turns access into encryption, deletion, extortion, or operational downtime.",
    watch: ["Bulk file or record changes", "Privilege used immediately before destruction", "Recovery and backup paths exposed to the same identity"],
    boundaries: ["write authorization", "backup control", "privileged job runner"],
    response: "Cefense looks for the control point that lets a destructive action fan out, rather than treating every changed file as a separate alert.",
  },
  {
    match: /sql injection|command injection|code injection|xss|cross-site scripting|xxe|external entity|deserializ|template injection|expression language/i,
    family: "Untrusted input",
    summary: "Untrusted input crosses a parser, interpreter, or browser boundary and changes what the application executes.",
    watch: ["User-controlled values reaching a sink", "Missing encoding, validation, or parameterization", "A route that exposes the same sink from more than one entry point"],
    boundaries: ["request parser", "query or command sink", "rendering boundary"],
    response: "Cefense traces the input to the sink, narrows the repair to the control point, and replays mutations instead of trusting one clean test case.",
  },
  {
    match: /auth|authorization|account takeover|credential|token|cookie|session|identity|privilege escalation|default credentials|brute force|as-rep|dcsync|kerberoast|pass.?the.?hash/i,
    family: "Identity and authorization",
    summary: "A control failure lets the wrong principal enter, persist, or act beyond the scope the system intended.",
    watch: ["Missing ownership or role checks", "Session and token transitions", "Privilege changes that do not re-check context"],
    boundaries: ["authentication middleware", "authorization guard", "session or token service"],
    response: "Cefense follows the identity transition to the exact guard that can close it, then checks the original behavior and nearby mutations together.",
  },
  {
    match: /cloud|metadata|iam|s3|lambda|kubernetes|container|docker|escape|serverless|cloud account/i,
    family: "Cloud and workload boundaries",
    summary: "A workload or cloud trust boundary exposes credentials, control-plane access, or a path into a more privileged service.",
    watch: ["Metadata and service-account access", "Cross-workload or cross-tenant requests", "Build and runtime permissions that exceed the job"],
    boundaries: ["workload identity", "metadata service", "deployment or runtime policy"],
    response: "Cefense maps the request to the workload identity and policy boundary that owns the decision, so the repair is reviewable by the team that operates it.",
  },
  {
    match: /supply chain|dependency|package|npm|nuget|pypi|xcodeghost|typosquat|postinstall|malicious update/i,
    family: "Software supply chain",
    summary: "A dependency, build step, or update becomes an execution path inside software that trusts its provenance.",
    watch: ["Install and build lifecycle hooks", "Unexpected ownership or version changes", "Permissions inherited by package and CI contexts"],
    boundaries: ["package install", "build runner", "release or artifact promotion"],
    response: "Cefense keeps the dependency signal attached to the code and build boundary where a maintainer can make a small, provable change.",
  },
  {
    match: /dns|domain|c2|command-and-control|exfiltration over|tunneling|spoofing|hijacking/i,
    family: "Network and control channel",
    summary: "A network path hides control, redirects trust, or moves data through a channel the application considers ordinary.",
    watch: ["Rare destinations or unusual request shapes", "Encoded or high-volume egress", "Redirects that cross trust zones"],
    boundaries: ["egress policy", "resolver or redirect service", "telemetry and transport"],
    response: "Cefense connects the network behavior to the code path that authorizes it, giving the team a concrete place to verify the boundary.",
  },
  {
    match: /rat$|rat |remote access|backdoor|stealer|keylogger|botnet|loader|malware|spyware|trojan|rootkit|worm|emotet|cobalt strike|darkgate|asyncrat/i,
    family: "Malware execution",
    summary: "A malicious program or operator-controlled component turns a foothold into persistence, collection, or remote execution.",
    watch: ["New process and persistence behavior", "Credential, browser, or file collection", "Outbound control traffic from an unexpected component"],
    boundaries: ["process launch", "persistence registration", "credential or data store"],
    response: "Cefense asks which application boundary permits the behavior, then packages the smallest repair and the variants needed to prove it is closed.",
  },
  {
    match: /ddos|denial-of-service|amplification|flood|rate limit|resource exhaustion/i,
    family: "Availability abuse",
    summary: "A request pattern consumes shared capacity faster than the service can safely absorb it.",
    watch: ["Unbounded work per request", "Missing rate or cost controls", "Expensive paths reachable without a meaningful identity"],
    boundaries: ["request budget", "queue or worker", "rate-limit policy"],
    response: "Cefense traces the expensive path back to the guard that can bound it, instead of only counting the traffic after the service is already degraded.",
  },
];

const threatLensLines = [
  "The name is only the starting point. The useful question is where this behavior becomes reachable in real software.",
  "Cefense treats this as a path problem: one observed behavior, one control boundary, and a repair someone can review.",
  "A threat earns its place in the library when it can be connected to a boundary the team owns and can prove closed.",
];

function threatHash(threat: string) {
  let hash = 0;
  for (const character of threat) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash;
}

function buildThreatProfile(threat: string): ThreatProfile {
  const rule = threatRules.find(({ match }) => match.test(threat));
  const hash = threatHash(threat);
  const fallback: ThreatRule = {
    match: /.*/,
    family: /CVE-/i.test(threat) ? "Vulnerability research" : "Threat intelligence",
    summary: `A software threat pattern that can become reachable through ${threat.toLowerCase()}-related behavior.`,
    watch: ["The first external input or event", "The trust boundary that accepts it", "The change that would make the path stop resolving"],
    boundaries: ["public entry point", "application control", "evidence and replay"],
    response: "Cefense turns the research signal into a code question: where does this path land, who owns the control, and how do we prove the change worked?",
  };
  const selected = rule ?? fallback;
  return {
    family: selected.family,
    summary: selected.summary,
    lens: `${threatLensLines[hash % threatLensLines.length]} For ${threat}, that means we keep the explanation attached to the code path—not just the label.`,
    watch: selected.watch,
    boundaries: selected.boundaries,
    response: selected.response,
  };
}

function ImmunityThreatDetail({
  threat,
  onBack,
}: {
  threat: string;
  onBack: () => void;
}) {
  const profile = buildThreatProfile(threat);
  const sortedIndex = sortedThreats.indexOf(threat);
  const tone = threatTones[sortedIndex % threatTones.length];
  const mark = threatMark(threat, sortedIndex);

  return (
    <div className="immunity-threat-detail">
      <header className="immunity-detail-toolbar">
        <button type="button" className="immunity-detail-back" onClick={onBack}>
          <span aria-hidden="true">←</span> Threat library
        </button>
        <span>CEFENSE / IMMUNITY / THREAT PROFILE</span>
        <b>{profile.family}</b>
      </header>

      <div className="immunity-detail-body">
        <section className={`immunity-detail-hero tone-${tone}`}>
          <div className="immunity-detail-mark" aria-hidden="true" style={mark.style}>
            <span className={`immunity-threat-icon image-icon symbol-${mark.symbolKind}`} />
          </div>
          <div className="immunity-detail-hero-copy">
            <p className="immunity-detail-kicker">{profile.family}</p>
            <h1>{threat}</h1>
            <p className="immunity-detail-summary">{profile.summary}</p>
            <div className="immunity-detail-tags">
              <span>CEFENSE LENS</span>
              <span>REPLAYABLE PATH</span>
              {threat.match(/CVE-\d{4}-\d+/i)?.[0] && <span>{threat.match(/CVE-\d{4}-\d+/i)?.[0]}</span>}
            </div>
          </div>
        </section>

        <div className="immunity-detail-grid">
          <main className="immunity-detail-main">
            <section className="immunity-detail-card immunity-detail-card-featured">
              <p className="immunity-detail-label">Our angle</p>
              <h2>A threat name is not the finish line.</h2>
              <p>{profile.lens}</p>
            </section>

            <section className="immunity-detail-card">
              <p className="immunity-detail-label">What we watch for</p>
              <h2>The signals that make this worth investigating.</h2>
              <ol className="immunity-detail-list">
                {profile.watch.map((item, index) => (
                  <li key={item}>
                    <span>0{index + 1}</span>
                    <strong>{item}</strong>
                  </li>
                ))}
              </ol>
            </section>

            <section className="immunity-detail-card">
              <p className="immunity-detail-label">Where it reaches code</p>
              <h2>Boundaries we connect before we call it closed.</h2>
              <div className="immunity-detail-boundaries">
                {profile.boundaries.map((boundary) => (
                  <span key={boundary}>{boundary}</span>
                ))}
              </div>
            </section>
          </main>

          <aside className="immunity-detail-aside">
            <section className="immunity-detail-card immunity-detail-response">
              <p className="immunity-detail-label">The Cefense response</p>
              <h2>Research becomes a reviewable change.</h2>
              <p>{profile.response}</p>
              <div className="immunity-detail-response-steps">
                <span><b>01</b> Observe the behavior</span>
                <span><b>02</b> Match it to a control point</span>
                <span><b>03</b> Replay and prove closure</span>
              </div>
            </section>
            <section className="immunity-detail-note">
              <span>WHY THIS LIBRARY EXISTS</span>
              <p>People should be able to see what Cefense is researching, how we frame risk, and where the product turns that work into action.</p>
              <button type="button" onClick={onBack}>Browse every threat <span aria-hidden="true">→</span></button>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function ImmunityCatalog() {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedThreat, setSelectedThreat] = useState<string | null>(null);
  const [activeLetter, setActiveLetter] = useState<string>("#");
  const [catalogMotion, setCatalogMotion] = useState<"idle" | "returning">("idle");
  const catalogRef = useRef<HTMLDivElement>(null);
  const groupRefs = useRef<Record<string, HTMLElement | null>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastOpenedThreatIndexRef = useRef<number | null>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleThreats = useMemo(
    () =>
      normalizedQuery
        ? sortedThreats.filter((threat) =>
            threat.toLowerCase().includes(normalizedQuery),
          )
        : sortedThreats,
    [normalizedQuery],
  );
  const visibleGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    visibleThreats.forEach((threat) => {
      const first = threat[0]?.toUpperCase() ?? "#";
      const letter = /^[A-Z]$/.test(first) ? first : "#";
      groups.set(letter, [...(groups.get(letter) ?? []), threat]);
    });
    return alphabet
      .filter((letter) => groups.has(letter))
      .map((letter) => ({ letter, threats: groups.get(letter) ?? [] }));
  }, [visibleThreats]);

  useEffect(() => {
    const root = catalogRef.current;
    if (!root || !visibleGroups.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const letter = visible?.target.getAttribute("data-letter");
        if (letter) setActiveLetter(letter);
      },
      { root, rootMargin: "-18% 0px -68% 0px", threshold: [0.05, 0.25, 0.6] },
    );
    visibleGroups.forEach((group) => {
      const node = groupRefs.current[group.letter];
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, [visibleGroups]);

  useEffect(() => {
    function handleLibraryShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        setSearchOpen(true);
        window.setTimeout(() => searchInputRef.current?.focus(), 0);
      }
      if (event.key === "Escape" && searchOpen) {
        setQuery("");
        setSearchOpen(false);
        searchInputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", handleLibraryShortcut);
    return () => window.removeEventListener("keydown", handleLibraryShortcut);
  }, [searchOpen]);

  useEffect(() => {
    if (catalogMotion !== "returning") return;
    const timer = window.setTimeout(() => {
      setCatalogMotion("idle");
      const index = lastOpenedThreatIndexRef.current;
      if (index === null) return;
      catalogRef.current
        ?.querySelector<HTMLButtonElement>(`[data-threat-index="${index}"]`)
        ?.focus({ preventScroll: true });
    }, 560);
    return () => window.clearTimeout(timer);
  }, [catalogMotion]);

  function scrollToLetter(letter: string) {
    const node = groupRefs.current[letter];
    if (!node) return;
    setActiveLetter(letter);
    node.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openThreat(threat: string, index: number) {
    lastOpenedThreatIndexRef.current = index;
    setCatalogMotion("idle");
    setSelectedThreat(threat);
  }

  function returnToCatalog() {
    setSelectedThreat(null);
    setCatalogMotion("returning");
  }

  const resolvedActiveLetter = visibleGroups.some((group) => group.letter === activeLetter)
    ? activeLetter
    : (visibleGroups[0]?.letter ?? "#");
  const activeAlphabetIndex = alphabet.indexOf(resolvedActiveLetter as (typeof alphabet)[number]);

  if (selectedThreat) {
    return (
      <ImmunityThreatDetail
        threat={selectedThreat}
        onBack={returnToCatalog}
      />
    );
  }

  return (
    <div className={`immunity-library-view${catalogMotion === "returning" ? " is-returning" : ""}`} ref={catalogRef}>
      <nav
        className="immunity-alphabet-nav"
        aria-label="Jump to threats by letter"
        style={
          {
            "--alphabet-index": activeAlphabetIndex < 0 ? 0 : activeAlphabetIndex,
            "--alphabet-count": alphabet.length,
          } as CSSProperties
        }
      >
        <div className="immunity-alphabet-track">
          <span className="immunity-index-glider" aria-hidden="true" />
          {alphabet.map((letter) => {
            const available = visibleGroups.some((group) => group.letter === letter);
            return (
              <button
                type="button"
                key={letter}
                className={resolvedActiveLetter === letter ? "active" : ""}
                disabled={!available}
                aria-current={resolvedActiveLetter === letter ? "true" : undefined}
                onClick={() => scrollToLetter(letter)}
              >
                {letter === "#" ? "0–9" : letter}
              </button>
            );
          })}
        </div>
        <div className={`immunity-library-search-compact${searchOpen ? " open" : ""}`}>
          <button
            type="button"
            aria-label={searchOpen ? "Close threat search" : "Search threats"}
            aria-keyshortcuts="/"
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((open) => !open)}
          >
            <span className="immunity-search-glyph" aria-hidden="true" />
          </button>
          {searchOpen && (
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
              onBlur={() => {
                if (!query) setSearchOpen(false);
              }}
              placeholder="Search threats"
              aria-label="Search threats"
            />
          )}
        </div>
      </nav>

      {visibleGroups.length > 0 ? (
        <div className="immunity-threat-groups">
          {visibleGroups.map((group) => (
            <section
              className="immunity-threat-group"
              data-letter={group.letter}
              key={group.letter}
              ref={(node) => {
                groupRefs.current[group.letter] = node;
              }}
              aria-labelledby={`immunity-letter-${group.letter}`}
            >
              <header className="immunity-letter-heading">
                <strong id={`immunity-letter-${group.letter}`}>
                  {group.letter === "#" ? "0–9" : group.letter}
                </strong>
                <span>{group.threats.length} threats</span>
              </header>
              <div className="immunity-threat-grid" role="list" aria-label={`${group.letter} threats`}>
                {group.threats.map((threat, groupIndex) => {
                  const sortedIndex = sortedThreats.indexOf(threat);
                  const tone = threatTones[sortedIndex % threatTones.length];
                  const mark = threatMark(threat, sortedIndex);
                  return (
                    <button
                      type="button"
                      className={`immunity-threat-card tone-${tone}`}
                      key={threat}
                      style={{ "--card-order": groupIndex % 18 } as CSSProperties}
                      data-threat-index={sortedIndex}
                      aria-label={`Open threat profile for ${threat}`}
                      onClick={() => openThreat(threat, sortedIndex)}
                    >
                      <span
                        className={`immunity-threat-icon image-icon symbol-${mark.symbolKind}`}
                        aria-hidden="true"
                        style={mark.style}
                      />
                      <strong>{threat}</strong>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="immunity-library-empty">
          <strong>No threats match “{query}”.</strong>
          <span>Try a malware family, technique, or CVE.</span>
        </div>
      )}
    </div>
  );
}

// Five-second promise: Path closed with evidence.

function ProveView({
  finding,
  repairReady,
  evidenceReady,
  onGenerate,
}: {
  finding: CyberusFinding;
  repairReady: boolean;
  evidenceReady: boolean;
  onGenerate: () => void;
}) {
  function downloadRecord() {
    const record = {
      format: "cyberus-immunity-record-preview",
      finding: finding.title,
      location: `${finding.file}${finding.line ? `:${finding.line}` : ""}`,
      observed: "19 Jul 2026 · 04:17 UTC",
      source: "BleepingComputer",
      status: evidenceReady ? "verified-preview" : "draft",
      repairReady,
      note: "Preview artifact. Cryptographic signing is not connected in this workspace.",
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(record, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "cyberus-immunity-record.json";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="stage-view prove-view">
      <div className="prove-layout">
        <section className="workspace-card evidence-record">
          <div className="record-head">
            <div>
              <span>CEFENSE IMMUNITY RECORD</span>
              <h2>Session boundary replay</h2>
            </div>
            <b>{evidenceReady ? "READY" : "DRAFT"}</b>
          </div>
          <div className="evidence-chain">
            <article>
              <span>Observed</span>
              <strong>Live attack primitive reconstructed</strong>
              <small>19 Jul 2026 · 04:17 UTC · BleepingComputer</small>
            </article>
            <article>
              <span>Matched</span>
              <strong>
                {finding.file}
                {finding.line ? `:${finding.line}` : ""}
              </strong>
              <small>96s after network observation · reachability 94%</small>
            </article>
            <article>
              <span>Fix prepared</span>
              <strong>
                {repairReady
                  ? "Focused patch + replay test"
                  : "Repair package awaiting review"}
              </strong>
              <small>3 files · +18 −30</small>
            </article>
            <article className={evidenceReady ? "verified" : ""}>
              <span>Proven closed</span>
              <strong>
                {evidenceReady
                  ? "Original and variant paths closed"
                  : "Run verification to sign"}
              </strong>
              <small>Graph replay · 6 variants</small>
            </article>
          </div>
          <div className="record-footer">
            <span
              title="Fingerprint of this record. Anyone holding the export can
verify it has not been altered."
            >
              Preview hash · 9e8c…77a4
              <button
                type="button"
                className="hash-copy"
                onClick={() => {
                  navigator.clipboard?.writeText("9e8c77a4").catch(() => {});
                }}
                aria-label="Copy preview hash"
              >
                Copy
              </button>
            </span>
            <button type="button" onClick={downloadRecord}>
              Download JSON record ↓
            </button>
          </div>
        </section>
        <section className="workspace-card proof-action-card">
          <span>Proof of closure</span>
          <h2>
            {evidenceReady
              ? "Path closed."
              : repairReady
                ? "Closure not yet verified."
                : "Fix first, then prove."}
          </h2>
          <p>
            {evidenceReady
              ? "6 variants replayed and blocked. Observed attack, matched code, focused fix, and replay proof are recorded together."
              : repairReady
                ? "The repair package is ready. Generate the evidence preview to replay the path and record closure."
                : "Prepare the review package in Fix, then generate the evidence record here."}
          </p>
          <button type="button" onClick={onGenerate} disabled={evidenceReady}>
            {evidenceReady
              ? "Evidence record ready ✓"
              : "Generate evidence preview"}
          </button>
          <small>
            {evidenceReady
              ? "The record is downloadable now. Production signing requires the Cefense evidence service."
              : "Builds a reviewable record from the observation, match, and fix already completed. Takes seconds; nothing leaves this workspace."}
          </small>
        </section>
      </div>
    </div>
  );
}

export function ReportsView({
  finding,
  repairReady,
  evidenceReady,
  onGenerateEvidence,
  showCatalog = false,
}: {
  finding: CyberusFinding;
  repairReady: boolean;
  evidenceReady: boolean;
  onGenerateEvidence: () => void;
  showCatalog?: boolean;
}) {
  if (showCatalog) return <ImmunityCatalog />;

  return (
    <div className="reports-view">
      <section className="evidence-details open">
        <header>
          <strong>Immunity evidence</strong>
          <span>{evidenceReady ? "Signed" : "Draft"}</span>
        </header>
        <ProveView
          finding={finding}
          repairReady={repairReady}
          evidenceReady={evidenceReady}
          onGenerate={onGenerateEvidence}
        />
      </section>
    </div>
  );
}
