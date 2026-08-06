"use client";

import Link from "next/link";
import { useState } from "react";
import type { ClarityConcept } from "./concept-ui";

type Stage = "feed" | "fix" | "proof";

function Mark() {
  return <span className="workspace-mark" aria-hidden="true" />;
}

function WorkspaceNav({ concept, stage, setStage, mode = "side" }: {
  concept: ClarityConcept;
  stage: Stage;
  setStage: (stage: Stage) => void;
  mode?: string;
}) {
  return (
    <nav className={`workspace-nav nav-${mode}`} aria-label="Prototype navigation">
      <Link href={`/clarity/${concept.id}`}><Mark /><strong>CEFENSE</strong></Link>
      <div>
        <button className={stage === "feed" ? "active" : ""} onClick={() => setStage("feed")}>Feed</button>
        <button className={stage === "fix" ? "active" : ""} onClick={() => setStage("fix")}>Fix</button>
        <button className={stage === "proof" ? "active" : ""} onClick={() => setStage("proof")}>Proof</button>
      </div>
      <span>{concept.id} · {concept.name}</span>
    </nav>
  );
}

function Queue({ onReview, mode = "rows" }: { onReview: () => void; mode?: string }) {
  return (
    <section className={`prototype-queue queue-${mode}`}>
      <header><div><strong>1 critical</strong><span>3 open</span></div><small>Matched 96s after observation</small></header>
      <article className="critical-finding">
        <div><i>CRITICAL</i><span>14h ago</span></div>
        <section>
          <h2>Session token reaches a privileged route</h2>
          <p>Stale session remains valid after logout — reachable from a public endpoint.</p>
          <code>src/auth/session.service.ts:87</code>
        </section>
        <button onClick={onReview}>Review fix</button>
      </article>
      <article>
        <div><i>HIGH</i><span>1d ago</span></div>
        <section><h3>Dynamic lookup reaches the query sink</h3><code>src/accounts/repository.ts:142</code></section>
        <button onClick={onReview}>Review</button>
      </article>
      <footer>Lower priority · 1</footer>
    </section>
  );
}

function AttackContext() {
  return (
    <aside className="attack-context">
      <span>WHAT HAPPENED</span>
      <strong>Session boundary bypass</strong>
      <p>Observed in the wild · reconstructed from live behavior.</p>
      <div><b>ATT&CK</b><span>T1550</span></div>
      <div><b>Reachability</b><span>94%</span></div>
      <div><b>Matched</b><span>96s</span></div>
    </aside>
  );
}

function Repair({ onVerify, mode = "split" }: { onVerify: () => void; mode?: string }) {
  return (
    <section className={`prototype-repair repair-${mode}`}>
      <header><span>FOCUSED REPAIR</span><strong>3 files · +18 −30</strong></header>
      <div className="repair-code">
        <span>session.service.ts</span>
        <code><i>84</i> async function refreshSession(token) &#123;</code>
        <code className="removed"><i>85</i> − return session.user</code>
        <code className="added"><i>85</i> + assertFresh(session)</code>
        <code className="added"><i>86</i> + return authorizeOwner(session)</code>
        <code><i>87</i> &#125;</code>
      </div>
      <aside>
        <span>WHY THIS CHANGE</span>
        <h2>Close the shared control point.</h2>
        <p>Blocks stale, renamed, and reordered session variants without changing login behavior.</p>
        <ul><li>Scope isolated</li><li>Replay test added</li><li>Owner mismatch covered</li></ul>
        <button onClick={onVerify}>Run replay</button>
      </aside>
    </section>
  );
}

function Proof({ onReset, mode = "record" }: { onReset: () => void; mode?: string }) {
  return (
    <section className={`prototype-proof proof-${mode}`}>
      <div className="closed-mark"><span>REPLAY CHECK · PASSED</span><strong>PATH CLOSED</strong><small>Original path + 6 variants blocked</small></div>
      <ol>
        <li><span>01</span><div><b>Observed</b><small>Live session bypass</small></div></li>
        <li><span>02</span><div><b>Matched</b><small>session.service.ts:87</small></div></li>
        <li><span>03</span><div><b>Fix prepared</b><small>Focused ownership guard</small></div></li>
        <li><span>04</span><div><b>Proven closed</b><small>Replay evidence recorded</small></div></li>
      </ol>
      <footer><code>9e8c…77a4</code><button onClick={onReset}>Replay prototype</button></footer>
    </section>
  );
}

function StagePanel({ stage, setStage, queueMode, repairMode, proofMode }: {
  stage: Stage;
  setStage: (stage: Stage) => void;
  queueMode?: string;
  repairMode?: string;
  proofMode?: string;
}) {
  if (stage === "fix") return <Repair mode={repairMode} onVerify={() => setStage("proof")} />;
  if (stage === "proof") return <Proof mode={proofMode} onReset={() => setStage("feed")} />;
  return <Queue mode={queueMode} onReview={() => setStage("fix")} />;
}

export function PrototypeWorkspace({ concept }: { concept: ClarityConcept }) {
  const [stage, setStage] = useState<Stage>("feed");
  const panel = <StagePanel stage={stage} setStage={setStage} />;
  let shell;

  switch (concept.id) {
    case "01": shell = <><WorkspaceNav concept={concept} stage={stage} setStage={setStage} /><main className="ws-split"><section>{panel}</section><AttackContext /></main></>; break;
    case "02": shell = <><WorkspaceNav concept={concept} stage={stage} setStage={setStage} mode="top" /><main className="ws-relay"><div className="relay-status"><span>Observed</span><span>Matched</span><span>Fix</span><span>Proof</span></div>{panel}</main></>; break;
    case "03": shell = <main className="ws-ledger"><WorkspaceNav concept={concept} stage={stage} setStage={setStage} mode="rail" /><header>CEFENSE INCIDENT LEDGER · 19 JUL 2026</header>{panel}</main>; break;
    case "04": shell = <><WorkspaceNav concept={concept} stage={stage} setStage={setStage} mode="minimal" /><main className="ws-agency"><div className="agency-count">01</div>{panel}</main></>; break;
    case "05": shell = <main className="ws-process"><WorkspaceNav concept={concept} stage={stage} setStage={setStage} mode="steps" /><section><span className="section-label">CURRENT WORK</span>{panel}</section></main>; break;
    case "06": shell = <><WorkspaceNav concept={concept} stage={stage} setStage={setStage} mode="top" /><main className="ws-outside"><AttackContext />{panel}<aside className="network-context"><b>NETWORK</b><strong>254 sources</strong><span>last match 96s</span></aside></main></>; break;
    case "07": shell = <><WorkspaceNav concept={concept} stage={stage} setStage={setStage} mode="dock" /><main className="ws-outcome"><header>ONE PATH NEEDS YOU</header>{panel}</main></>; break;
    case "08": shell = <main className="ws-bento"><WorkspaceNav concept={concept} stage={stage} setStage={setStage} mode="top" /><AttackContext /><section>{panel}</section><aside className="evidence-mini"><span>EVIDENCE</span><b>0 pending gaps</b></aside></main>; break;
    case "09": shell = <><WorkspaceNav concept={concept} stage={stage} setStage={setStage} mode="minimal" /><main className="ws-signal"><aside className="signal-timeline" aria-label="Attack provenance timeline">
      <article><time>04:17</time><div><b>Attack observed</b><small>BleepingComputer · “Session boundary bypass”</small><p>Public authentication endpoint · stale session after logout.</p></div></article>
      <article><time>04:18</time><div><b>Path matched</b><small>cefense/demo-payments-api</small><p><code>src/auth/session.service.ts:87</code> · <code>refreshSession(token)</code></p></div></article>
      <article><time>Now</time><div><b>Human review</b><small>Focused repair package ready</small><p>Ownership guard · 3 files · replay evidence queued.</p></div></article>
    </aside>{panel}</main></>; break;
    case "10": shell = <main className="ws-metric"><WorkspaceNav concept={concept} stage={stage} setStage={setStage} mode="top" /><header><strong>1</strong><span>reachable critical path</span></header>{panel}</main>; break;
    case "11": shell = <><WorkspaceNav concept={concept} stage={stage} setStage={setStage} mode="floating" /><main className="ws-io"><AttackContext /><div className="io-arrow">→</div>{panel}</main></>; break;
    case "12": shell = <><WorkspaceNav concept={concept} stage={stage} setStage={setStage} mode="dock" /><main className="ws-gap"><span>ATTACK</span><section>{panel}</section><span>PROOF</span></main></>; break;
    case "13": shell = <main className="ws-source"><WorkspaceNav concept={concept} stage={stage} setStage={setStage} mode="top" /><aside><strong>254</strong><span>live sources</span><small>CISA · NIST · CVE · MITRE</small></aside>{panel}</main>; break;
    case "14": shell = <><WorkspaceNav concept={concept} stage={stage} setStage={setStage} mode="minimal" /><main className="ws-code-first">{stage === "feed" ? <><AttackContext /><Queue mode="compact" onReview={() => setStage("fix")} /></> : panel}</main></>; break;
    case "15": shell = <><WorkspaceNav concept={concept} stage={stage} setStage={setStage} mode="top" /><main className="ws-delta"><aside><span>BEFORE</span><strong>47 alerts</strong></aside>{panel}<aside><span>AFTER</span><strong>1 closure</strong></aside></main></>; break;
    case "16": shell = <main className="ws-sequence"><WorkspaceNav concept={concept} stage={stage} setStage={setStage} mode="steps" /><div className="sequence-title">OBSERVE → MATCH → FIX → PROVE</div>{panel}</main>; break;
    case "17": shell = <><WorkspaceNav concept={concept} stage={stage} setStage={setStage} mode="rail" /><main className="ws-report"><header><span>CASE 9E8C</span><strong>SESSION BOUNDARY RECONSTRUCTION</strong></header><AttackContext />{panel}</main></>; break;
    case "18": shell = <><WorkspaceNav concept={concept} stage={stage} setStage={setStage} mode="floating" /><main className="ws-focus"><span>Do the next important thing.</span>{panel}</main></>; break;
    case "19": shell = <><WorkspaceNav concept={concept} stage={stage} setStage={setStage} mode="minimal" /><main className="ws-chain"><div><span>OBSERVED</span><i>→</i><span>MATCHED</span><i>→</i><span>FIX</span><i>→</i><span>PROOF</span></div>{panel}</main></>; break;
    default: shell = <><WorkspaceNav concept={concept} stage={stage} setStage={setStage} mode="top" /><main className="ws-collective"><aside><span>payments-api</span><span>identity-core</span><span>edge-auth</span><span>admin-console</span></aside>{panel}</main></>;
  }

  return <div className={`prototype-workspace workspace-${concept.id}`}>{shell}</div>;
}
