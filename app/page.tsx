import Link from "next/link";
import { SiteFooter, SiteHeader } from "./components/site-shell";
import { ScrollSequence } from "./components/scroll-sequence";

const returnToFeed = "/login?return_to=%2Fapp%3Fview%3Dfeed";

export default function Home() {
  return (
    <main className="public-page public-home-selection evidence-home">
      <SiteHeader mode="core" />

      <section className="reference-home" aria-label="Cefense reference home experience">
        <section className="reference-home-hero" aria-labelledby="reference-home-title">
          <div>
            <h1 id="reference-home-title">From attack<br />to <em>proven fix.</em></h1>
            <p>Live attacks, matched to the exact code they can reach — closed with replay proof.</p>
          </div>
          <div className="reference-home-proof" aria-label="Observe, match, fix, and prove">
            <span>01 / OBSERVED</span><strong>Real attack</strong><small>One behavior reconstructed from the live security web.</small>
            <span>02 / MATCHED</span><strong>Exact code</strong><small>The reachable control point in your repository.</small>
            <span>03 / PROVEN</span><strong>Closed path</strong><small>A focused repair and replay evidence that it no longer resolves.</small>
          </div>
        </section>
        <section className="reference-home-how" aria-labelledby="reference-how-title">
          <p className="evidence-overline">How Cefense works</p>
          <h2 id="reference-how-title">Real attacks become proven code fixes.</h2>
          <div className="reference-home-how-grid">
            <article><span>01</span><small>Observed</small><h3>Real attack</h3><p>One behavior reconstructed from the live security web.</p></article>
            <article><span>02</span><small>Matched</small><h3>Exact code</h3><p>The reachable control point in your repository.</p></article>
            <article><span>03</span><small>Proven</small><h3>Closed path</h3><p>A focused repair and replay evidence that it no longer resolves.</p></article>
          </div>
        </section>
        <ScrollSequence />
        <section className="reference-home-close" aria-labelledby="reference-close-title">
          <h2 id="reference-close-title">The path is closed.</h2>
          <p>Observed attack, matched code, focused fix, and replay evidence—kept together.</p>
          <Link className="public-primary-action" href={returnToFeed}>Open Cefense</Link>
        </section>
      </section>

      <section className="evidence-proof-strip" id="proof" aria-labelledby="proof-title">
        <div className="evidence-proof-heading"><p className="evidence-overline">Evidence, not alert volume</p><h2 id="proof-title">One attack. A complete path to closure.</h2></div>
        <div className="evidence-metrics">
          <article><strong>01</strong><span>attack fixture reconstructed</span><small>public demonstration</small></article>
          <article><strong>94%</strong><span>mapping confidence</span><small>reachable code path</small></article>
          <article><strong>6×</strong><span>replay variants blocked</span><small>after the repair</small></article>
          <article className="metric-dark"><strong>03m</strong><span>from observed to reviewable</span><small>fixture 042 · illustrative</small></article>
        </div>
      </section>

      <section className="evidence-workflow" id="workflow" aria-labelledby="workflow-title">
        <div className="evidence-workflow-intro"><p className="evidence-overline">The immunity loop</p><h2 id="workflow-title">Security evidence that stays attached to the code.</h2><p>A replay is useful only when it tells the team where the behavior lands, what to change, and how to prove the path no longer resolves.</p></div>

        <article className="evidence-row" id="observed">
          <div className="evidence-row-copy"><span className="evidence-step">01 / Observed</span><h3>Start with what actually happened.</h3><p>Turn a live behavior into one reproducible fixture instead of another abstract severity label.</p><Link className="evidence-text-link" href={returnToFeed}>Open the attack feed <span>→</span></Link></div>
          <div className="evidence-card evidence-card-dark observed-card"><div className="evidence-card-bar"><span><i className="window-dot red" /><i className="window-dot amber" /><i className="window-dot green" /></span><span>network.capture</span><b>reconstructed</b></div><div className="observed-grid"><div><span className="evidence-mini-label">PAYLOAD</span><pre className="evidence-large-code"><span className="code-red">POST</span> /api/session{`\n\n`}<span className="code-muted">x-forwarded-for:</span> 10.0.0.7{`\n`}<span className="code-muted">body.role:</span> <span className="code-red">"admin"</span>{`\n`}<span className="code-muted">body.token:</span> <span className="code-red">null</span></pre></div><div className="behavior-log"><span className="evidence-mini-label">RECONSTRUCTED BEHAVIOR</span><strong>Privilege boundary skipped.</strong><div><small>09:42:16.203</small><b>auth.middleware</b><span>accepted</span></div><div className="log-danger"><small>09:42:16.219</small><b>admin.route</b><span>reached</span></div><div><small>09:42:16.231</small><b>fixture</b><span>saved</span></div></div></div></div>
        </article>

        <article className="evidence-row" id="matched">
          <div className="evidence-row-copy"><span className="evidence-step">02 / Matched</span><h3>Follow the behavior to its control point.</h3><p>The repository tree, path, line, and confidence arrive in one view so review starts with context.</p><span className="confidence-line"><i /><b>94% mapping confidence</b></span></div>
          <div className="evidence-card evidence-card-dark matched-card"><div className="repo-tree"><span className="evidence-mini-label">REPOSITORY / CEFENSE-API</span><span>⌄ src</span><span className="tree-indent">⌄ auth</span><span className="tree-indent-2 active-file">▣ session.service.ts</span><span className="tree-indent-2">□ session.test.ts</span><span>⌄ routes</span><span className="tree-indent">□ admin.route.ts</span><span>□ package.json</span></div><div className="code-panel"><div className="code-panel-bar"><span>src/auth/session.service.ts</span><b>L87</b></div><pre><span className="code-muted">84</span> export async function authorize(ctx) {'\n'}<span className="code-muted">85</span>   const session = await readSession(ctx);{'\n'}<span className="code-muted">86</span>   const role = session?.role;{'\n'}<mark className="code-line"><span className="code-muted">87</span>   return role === &apos;admin&apos; ? next() : deny();</mark>{'\n'}<span className="code-muted">88</span> {'}'}{'\n'}<span className="code-muted">90</span> // reached by fixture 042</pre><div className="reachability-line"><span>request</span><b>→</b><span>readSession</span><b>→</b><strong>authorize:87</strong><b>→</b><span>admin.route</span></div></div></div>
        </article>

        <article className="evidence-row" id="fixed">
          <div className="evidence-row-copy"><span className="evidence-step">03 / Fixed + proven</span><h3>Close the shared boundary. Replay the variants.</h3><p>Keep the patch, changed files, original fixture, and closure result together for review.</p><div className="closure-stamp"><span>✓</span><div><strong>Path closed</strong><small>verified against six variants</small></div></div></div>
          <div className="evidence-card evidence-card-dark fixed-card"><div className="diff-panel"><div className="evidence-card-bar"><span>PREPARED DIFF</span><b>reviewable</b></div><pre><span className="diff-remove">− return role === &apos;admin&apos; ? next() : deny();</span>{'\n'}<span className="diff-add">+ if (!ownsResource(ctx, session)) return deny();</span>{'\n'}<span className="diff-add">+ return next();</span></pre><div className="diff-meta"><span>3 files changed</span><span>+18 −30</span><span>owner: auth-team</span></div></div><div className="variant-panel"><div className="evidence-card-bar"><span>REPLAY PROOF</span><b className="proof-green">all clear</b></div>{["original fixture", "role mutation", "header mutation", "null-session", "replay × 6"].map((variant) => <div className="variant-row" key={variant}><span>{variant}</span><small>{variant === "replay × 6" ? "closed" : "blocked"}</small><b>✓</b></div>)}</div></div>
        </article>
      </section>

      <section className="evidence-connect" id="connect" aria-labelledby="connect-title"><div className="evidence-section-heading"><p className="evidence-overline">Fits the work already happening</p><h2 id="connect-title">The evidence can move with the team.</h2><p>Prototype connection surfaces for the systems that own the code, the fix, and the resulting record.</p></div><div className="integration-grid">{[["GH", "GitHub", "repository + review"], ["GL", "GitLab", "merge request context"], ["CI", "CI pipelines", "replay on change"], ["S", "Slack", "review notifications"], ["J", "Jira", "owner + work item"], ["∿", "SIEM", "evidence trail"]].map(([mark, name, detail]) => <div className="integration-card" key={name}><span className="integration-mark">{mark}</span><div><strong>{name}</strong><small>{detail}</small></div><b>surface</b></div>)}</div></section>

      <section className="evidence-icp" aria-labelledby="icp-title">
        <div className="evidence-icp-intro">
          <p className="evidence-overline">Ideal customer profile</p>
          <h2 id="icp-title">For teams that own the path from risk to repair.</h2>
          <p>
            Cefense is built for software companies with real production code,
            a security team close to engineering, and no patience for findings
            that stop at a dashboard.
          </p>
        </div>
        <div className="evidence-icp-grid">
          <article>
            <span>01 / Buyer</span>
            <h3>Product &amp; AppSec leaders</h3>
            <p>Responsible for reducing reachable risk and showing leadership what actually closed.</p>
          </article>
          <article>
            <span>02 / Operator</span>
            <h3>Security engineering teams</h3>
            <p>Working beside developers who need the exact file, line, owner, and smallest safe change.</p>
          </article>
          <article>
            <span>03 / Environment</span>
            <h3>Git-based product teams</h3>
            <p>Running customer-facing applications through code review and CI, with attacks worth replaying.</p>
          </article>
        </div>
        <div className="evidence-icp-fit">
          <span>Best fit</span>
          <strong>Growing software teams where one shared control point can close many variants.</strong>
          <small>Not another static scanner. Not a one-off report. A repeatable path from observed behavior to proven closure.</small>
        </div>
      </section>

      <section className="evidence-credibility" aria-labelledby="credibility-title"><div className="credibility-copy"><p className="evidence-overline">The honest problem</p><h2 id="credibility-title">Every scanner can see.<br />Almost none can close.</h2><p>This page uses a synthetic fixture so the product story is testable: start with a request, trace the reachable code, review the patch, and run the same behavior again.</p></div><div className="credibility-proof"><div><span>BEFORE</span><strong>admin.route reachable</strong><b className="proof-bad">OPEN</b></div><div><span>PATCH</span><strong>ownership guard at line 87</strong><b className="proof-neutral">REVIEW</b></div><div><span>AFTER</span><strong>original + 5 mutations</strong><b className="proof-good">CLOSED</b></div><small>FIXTURE 042 · public demonstration · no customer data</small></div></section>

      <div className="evidence-skyline" aria-hidden="true"><img src="/brand/sf-bay-haze.png" alt="" /></div>
      <SiteFooter />
    </main>
  );
}
