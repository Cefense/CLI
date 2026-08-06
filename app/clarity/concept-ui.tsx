import Link from "next/link";
import concepts from "./concepts.json";

export type ClarityConcept = (typeof concepts)[number];

const steps = [
  ["01", "Observed", "Session boundary bypass"],
  ["02", "Matched", "session.service.ts:87"],
  ["03", "Fix prepared", "Ownership guard · +18 −30"],
  ["04", "Proven closed", "Replay blocked · 6 variants"],
];

function Brand() {
  return (
    <Link href="/" className="prototype-brand">
      <span /> CEFENSE
    </Link>
  );
}

function Header({ concept, mode = "top" }: { concept: ClarityConcept; mode?: string }) {
  return (
    <header className={`prototype-header header-${mode}`}>
      <Brand />
      <span className="prototype-number">{concept.id} / 20</span>
      <nav>
        <Link href="/clarity">All concepts</Link>
        <Link className="prototype-open" href={`/clarity/${concept.id}/app`}>
          Open prototype
        </Link>
      </nav>
    </header>
  );
}

function Copy({ concept, compact = false }: { concept: ClarityConcept; compact?: boolean }) {
  return (
    <section className={`prototype-copy${compact ? " compact" : ""}`}>
      <p className="prototype-eyebrow">{concept.name}</p>
      <h1>{concept.promise}</h1>
      <p className="prototype-explanation">{concept.explanation}</p>
      <Link className="prototype-primary" href={`/clarity/${concept.id}/app`}>
        Open {concept.name}
      </Link>
    </section>
  );
}

function Flow({ mode = "stack" }: { mode?: string }) {
  return (
    <section className={`prototype-flow flow-${mode}`} aria-label="Attack-to-code flow">
      {steps.map(([number, label, value]) => (
        <article key={number}>
          <i>{number}</i>
          <div><span>{label}</span><strong>{value}</strong></div>
        </article>
      ))}
    </section>
  );
}

function LiveSignal() {
  return (
    <div className="live-signal">
      <span>LIVE ATTACK · AUTHENTICATION</span>
      <b>Network → repository</b>
      <strong>96s</strong>
    </div>
  );
}

function ProofStamp({ large = false }: { large?: boolean }) {
  return (
    <div className={`proof-stamp${large ? " large" : ""}`}>
      <span>REPLAY CHECK · PASSED</span>
      <strong>PATH CLOSED</strong>
      <small>6 variants blocked · evidence recorded</small>
    </div>
  );
}

function CodeWindow() {
  return (
    <div className="code-window">
      <header><span>session.service.ts</span><b>focused repair</b></header>
      <code><i>−</i> return session.user</code>
      <code><i>+</i> assertFresh(session)</code>
      <code><i>+</i> return authorizeOwner(session)</code>
      <footer>Replay blocked · path closed</footer>
    </div>
  );
}

function QueuePreview() {
  return (
    <div className="queue-preview">
      <header><strong>1 critical</strong><span>3 open</span></header>
      <article><b>Session token reaches privileged route</b><span>Review fix</span></article>
      <article><b>Dynamic lookup reaches query sink</b><span>High</span></article>
      <footer>Reachable paths first</footer>
    </div>
  );
}

function ConceptFooter({ previous, next }: { previous: ClarityConcept; next: ClarityConcept }) {
  return (
    <footer className="prototype-footer">
      <Link href={`/clarity/${previous.id}`}>← {previous.id}</Link>
      <span>Exact 5-word promise · exact 50-word explanation</span>
      <Link href={`/clarity/${next.id}`}>{next.id} →</Link>
    </footer>
  );
}

export function ConceptLanding({
  concept,
  previous,
  next,
}: {
  concept: ClarityConcept;
  previous: ClarityConcept;
  next: ClarityConcept;
}) {
  let content;
  switch (concept.id) {
    case "01":
      content = <><Header concept={concept} /><main className="split-stage"><Copy concept={concept} /><div><LiveSignal /><Flow /></div></main></>;
      break;
    case "02":
      content = <><Header concept={concept} mode="floating" /><main className="relay-stage"><Copy concept={concept} /><Flow mode="rail" /><ProofStamp /></main></>;
      break;
    case "03":
      content = <><Header concept={concept} mode="side" /><main className="ledger-stage"><div><LiveSignal /><Flow mode="ledger" /><ProofStamp /></div><Copy concept={concept} compact /></main></>;
      break;
    case "04":
      content = <><Header concept={concept} mode="minimal" /><main className="agency-stage"><Copy concept={concept} /><LiveSignal /><Flow mode="rail" /></main></>;
      break;
    case "05":
      content = <><Header concept={concept} mode="side" /><main className="rail-stage"><Flow mode="tower" /><Copy concept={concept} /><ProofStamp large /></main></>;
      break;
    case "06":
      content = <><Header concept={concept} /><main className="outside-stage"><div className="outside-map"><LiveSignal /><CodeWindow /><ProofStamp /></div><Copy concept={concept} /></main></>;
      break;
    case "07":
      content = <><Header concept={concept} mode="floating" /><main className="outcome-stage"><ProofStamp large /><Copy concept={concept} compact /><Flow mode="compact" /></main></>;
      break;
    case "08":
      content = <><Header concept={concept} mode="side" /><main className="evidence-stage"><Copy concept={concept} /><div className="evidence-stack"><LiveSignal /><CodeWindow /><ProofStamp /></div></main></>;
      break;
    case "09":
      content = <><LiveSignal /><Header concept={concept} mode="minimal" /><main className="signal-stage"><Copy concept={concept} /><Flow mode="grid" /><ProofStamp /></main></>;
      break;
    case "10":
      content = <><Header concept={concept} /><main className="metric-stage"><div className="metric-one"><span>1</span><p>reachable critical path</p></div><Copy concept={concept} compact /><ProofStamp large /></main></>;
      break;
    case "11":
      content = <><Header concept={concept} mode="floating" /><main className="io-stage"><section><span>INPUT</span><h2>Real attack</h2><LiveSignal /></section><Copy concept={concept} compact /><section><span>OUTPUT</span><h2>Closed path</h2><ProofStamp /></section></main></>;
      break;
    case "12":
      content = <><Header concept={concept} mode="minimal" /><main className="gap-stage"><Copy concept={concept} /><div className="gap-bridge"><span>ATTACK</span><Flow mode="compact" /><span>PROOF</span></div></main></>;
      break;
    case "13":
      content = <><Header concept={concept} /><main className="source-stage"><div className="source-count"><strong>254</strong><span>live sources</span></div><Copy concept={concept} /><Flow mode="rail" /></main></>;
      break;
    case "14":
      content = <><Header concept={concept} mode="floating" /><main className="path-stage"><CodeWindow /><Copy concept={concept} compact /><Flow mode="compact" /></main></>;
      break;
    case "15":
      content = <><Header concept={concept} mode="minimal" /><main className="delta-stage"><section><span>BEFORE</span><h2>47 findings</h2><QueuePreview /></section><Copy concept={concept} compact /><section><span>AFTER</span><h2>1 closed path</h2><ProofStamp /></section></main></>;
      break;
    case "16":
      content = <><Header concept={concept} mode="side" /><main className="sequence-stage"><Copy concept={concept} compact /><Flow mode="sequence" /></main></>;
      break;
    case "17":
      content = <><Header concept={concept} /><main className="reconstruction-stage"><div className="report-sheet"><LiveSignal /><CodeWindow /><Flow mode="compact" /></div><Copy concept={concept} compact /></main></>;
      break;
    case "18":
      content = <><Header concept={concept} mode="floating" /><main className="focus-stage"><Copy concept={concept} compact /><QueuePreview /><ProofStamp /></main></>;
      break;
    case "19":
      content = <><Header concept={concept} mode="minimal" /><main className="chain-stage"><Copy concept={concept} /><Flow mode="chain" /><ProofStamp /></main></>;
      break;
    default:
      content = <><Header concept={concept} /><main className="collective-stage"><Copy concept={concept} /><div className="repo-grid"><span>payments-api</span><span>identity-core</span><span>edge-auth</span><span>admin-console</span><strong>1 attack → 4 protected repositories</strong></div><Flow mode="rail" /></main></>;
  }

  return (
    <div className={`prototype-landing concept-${concept.id} design-${concept.design}`}>
      {content}
      <ConceptFooter previous={previous} next={next} />
    </div>
  );
}
