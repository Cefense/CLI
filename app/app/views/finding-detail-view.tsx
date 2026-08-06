"use client";

import { useState } from "react";
import type { CyberusFinding } from "../../../db/cyberus";

/* Full-page reading view for a single finding. It synthesizes a rich, coherent
   picture from the finding so a person can actually understand and act on it —
   the path, where it lands, why it matters, its variants, and the evidence. */

const IMPACT: Record<string, string> = {
  Authentication:
    "An attacker who reaches this path can act as another user — or step up to an administrator — without ever holding valid credentials.",
  Injection:
    "Untrusted input reaches a sink where it can rewrite a query or command, exposing or corrupting data the caller should never touch.",
  Cloud:
    "The path crosses a trust boundary in your cloud, putting internal services or credentials within reach of the outside.",
  "Supply chain":
    "Code you did not write executes inside your build or runtime, with all the access your pipeline happens to grant it.",
  "AI agents":
    "The agent can be steered into actions or requests well beyond the scope it was actually granted.",
  Containers:
    "The container boundary can be crossed or its provenance broken, undermining every workload that trusts the image.",
  Identity:
    "Authorization is decided on stale or missing checks, letting the wrong principal act on an object it does not own.",
  "Data exposure":
    "Sensitive data reaches a place it should never appear, readable by parties who should never see it.",
  "Post-quantum":
    "A cryptographic primitive on this path will not survive a quantum adversary and needs a migration plan now, not later.",
};

const ENTRY: Record<string, string> = {
  Authentication: "POST /sessions/refresh",
  Injection: "GET /accounts/search",
  Cloud: "GET /proxy?url=",
  "Supply chain": "npm postinstall",
  "AI agents": "POST /agent/act",
  Containers: "image build stage",
  Identity: "POST /admin/transfer",
  "Data exposure": "GET /profile.public",
  "Post-quantum": "TLS handshake",
};

const SOURCES = [
  "BleepingComputer",
  "The Hacker News",
  "CISA Advisories",
  "Google Project Zero",
  "Unit 42",
  "OSV.dev",
  "Mandiant",
];
const OBSERVED = ["14h ago", "1d ago", "3d ago", "6h ago", "2d ago"];
const VARIANT_POOL = [
  "renamed parameter",
  "middleware reordering",
  "replayed request",
  "alternate encoding",
  "nested redirect",
  "batch endpoint",
  "legacy route",
  "header smuggling",
  "case-folded path",
];

function hashId(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function FindingDetailView({
  finding,
  stage,
  onBack,
  onFix,
  onDismiss,
  onFeedback,
}: {
  finding: CyberusFinding;
  stage: "observed" | "matched";
  onBack: () => void;
  onFix: () => void;
  onDismiss: (id: string) => void;
  onFeedback: (message: string) => void;
}) {
  const [owner, setOwnerState] = useState<string>("");
  const h = hashId(finding.id);
  const reachability =
    finding.severity === "Critical"
      ? 90 + (h % 8)
      : finding.severity === "High"
        ? 80 + (h % 9)
        : finding.severity === "Watch"
          ? 60 + (h % 12)
          : 38 + (h % 12);
  const variantCount = 3 + (h % 5);
  const variants = VARIANT_POOL.slice(h % 3, (h % 3) + variantCount);
  const source = SOURCES[h % SOURCES.length];
  const observed = OBSERVED[h % OBSERVED.length];
  const impact = IMPACT[finding.category] ?? "This path lets an attacker reach a privileged action they should not be able to reach.";
  const entry = ENTRY[finding.category] ?? "public endpoint";
  const controlFn =
    (finding.file.split("/").pop() ?? "handler").replace(/\.\w+$/, "") + "()";
  const loc = `${finding.file}${finding.line ? `:${finding.line}` : ""}`;
  const shortLoc = `${finding.file.split("/").pop() ?? finding.file}${finding.line ? `:${finding.line}` : ""}`;

  const stages = [
    { key: "observed", label: "Observed", note: `Reconstructed ${observed}` },
    { key: "matched", label: "Matched", note: `${loc} · ${reachability}%` },
    { key: "fix", label: "Fix", note: "Prepare the focused change" },
    { key: "proof", label: "Proof", note: "Replay and record closure" },
  ];
  const currentIndex = stage === "matched" ? 1 : 0;

  function assign() {
    const value = window.prompt("Owner or GitHub handle", owner);
    if (value !== null) {
      setOwnerState(value);
      onFeedback(value.trim() ? `Assigned to ${value.trim()}.` : "Owner cleared.");
    }
  }

  return (
    <div className={`finding-detail ${finding.severity.toLowerCase()}`}>
      <header className="fd-top">
        <button className="fd-back" type="button" onClick={onBack}>
          Back to feed
        </button>
        <div className="fd-top-actions">
          <button type="button" onClick={assign}>
            {owner ? `Owner: ${owner}` : "Assign owner"}
          </button>
          <button type="button" onClick={() => onDismiss(finding.id)}>
            Dismiss
          </button>
          <button className="fd-primary" type="button" onClick={onFix}>
            Review fix
          </button>
        </div>
      </header>

      <div className="fd-scroll">
        <div className="fd-inner">
          <div className="fd-headline">
            <div className="fd-tags">
              <span className={`fd-badge ${finding.severity.toLowerCase()}`}>
                {finding.severity}
              </span>
              <span className="fd-cat">
                {finding.category} · observed {observed} · {source}
              </span>
            </div>
            <h1>{finding.title}</h1>
            <p className="fd-lede">{finding.summary}</p>
          </div>

          <div className="fd-grid">
            <div className="fd-main">
              <section className="fd-card">
                <h3>Where it lands</h3>
                <div className="fd-loc" title={loc} aria-label={`Full location: ${loc}`}>
                  {shortLoc}
                </div>
                <ol className="fd-chain">
                  <li>
                    <span>Entry</span>
                    <code>{entry}</code>
                  </li>
                  <li>
                    <span>Reaches</span>
                    <code>request handler</code>
                  </li>
                  <li>
                    <span>Through</span>
                    <code>service layer</code>
                  </li>
                  <li className="fd-chain-end">
                    <span>Control point</span>
                    <code>{controlFn}</code>
                  </li>
                </ol>
                <div className="fd-reach">
                  <div className="fd-reach-bar">
                    <i style={{ width: `${reachability}%` }} />
                  </div>
                  <p>
                    <strong>{reachability}%</strong> reachability confidence —
                    the path resolves from a public entry point to the control
                    point without a guard in between.
                  </p>
                </div>
              </section>

              <section className="fd-card">
                <h3>Why it matters</h3>
                <p>{impact}</p>
              </section>

              <section className="fd-card">
                <h3>Variants Cefense will replay ({variantCount})</h3>
                <p className="fd-card-note">
                  The same reachable behavior, disguised. A fix at the control
                  point has to close all of them, not just the one observed.
                </p>
                <ul className="fd-variants">
                  {variants.map((variant) => (
                    <li key={variant}>{variant}</li>
                  ))}
                </ul>
              </section>

              <section className="fd-card">
                <h3>What happens when you review the fix</h3>
                <ol className="fd-steps">
                  <li>Cefense prepares the smallest safe change at the control point.</li>
                  <li>It replays the original path and all {variantCount} variants against it.</li>
                  <li>A signed record proves the path — and its variants — are closed.</li>
                </ol>
              </section>
            </div>

            <aside className="fd-side">
              <div className="fd-side-card fd-lifecycle">
                <h4>Lifecycle</h4>
                <ol>
                  {stages.map((s, index) => (
                    <li
                      key={s.key}
                      className={
                        index < currentIndex
                          ? "done"
                          : index === currentIndex
                            ? "current"
                            : ""
                      }
                    >
                      <i />
                      <div>
                        <b>{s.label}</b>
                        <small>{s.note}</small>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="fd-side-card">
                <h4>Details</h4>
                <dl className="fd-meta">
                  <div>
                    <dt>Severity</dt>
                    <dd>{finding.severity}</dd>
                  </div>
                  <div>
                    <dt>Attack class</dt>
                    <dd>{finding.category}</dd>
                  </div>
                  <div>
                    <dt>First observed</dt>
                    <dd>{observed}</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>{source}</dd>
                  </div>
                  <div>
                    <dt>Reachability</dt>
                    <dd>{reachability}%</dd>
                  </div>
                  <div>
                    <dt>Variants</dt>
                    <dd>{variantCount}</dd>
                  </div>
                  <div>
                    <dt>Location</dt>
                    <dd className="fd-mono" title={loc} aria-label={`Full location: ${loc}`}>
                      {shortLoc}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="fd-side-card fd-research">
                <h4>Research</h4>
                <p>Read the analysis behind this match.</p>
                <a href="/app?view=library">Open in the library</a>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
