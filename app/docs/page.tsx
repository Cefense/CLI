import Link from "next/link";
import { DocsExplorer } from "../components/docs-explorer";
import { SiteFooter, SiteHeader } from "../components/site-shell";

/* DOCS — a long editorial library: the research, the live primitive explorer,
   and the full source layer. Big type, one moment per screen. Green. */

const primitives: [string, string, string, string, string, string, string][] = [
  ["18s", "Authentication", "Session-boundary bypass variant observed", "Node and edge-auth stacks", "98", "BleepingComputer", "6 variants"],
  ["7m", "Cloud", "Redirect-assisted metadata SSRF", "Three frameworks · replay available", "84", "The Hacker News", "4 variants"],
  ["22m", "Supply chain", "Package behavior changed after ownership transfer", "Two dependencies away", "71", "OSV.dev", "9 variants"],
  ["41m", "AI agents", "Tool-permission boundary escape", "Agentic runtimes and tool routers", "67", "Google Project Zero", "3 variants"],
  ["58m", "Authentication", "Device-code replay reaches an admin handoff", "OAuth and SSO middleware", "63", "CISA Advisories", "5 variants"],
  ["1h", "Containers", "Build cache restores an untrusted layer", "CI runners and image promotion", "58", "Unit 42", "7 variants"],
];

const sources = [
  "CISA Advisories", "NIST NVD", "CVE.org", "MITRE ATT&CK", "FIRST EPSS",
  "BleepingComputer", "The Hacker News", "Krebs on Security", "Dark Reading",
  "SecurityWeek", "The Record", "PortSwigger Daily Swig", "Google Project Zero",
  "Unit 42", "The DFIR Report", "Mandiant", "Microsoft Security",
  "Google Security Blog", "Cisco Talos", "CrowdStrike", "SentinelOne Labs",
  "Elastic Security Labs", "VirusTotal", "AlienVault OTX", "GreyNoise", "Shodan",
  "Censys", "URLhaus", "ThreatFox", "Malpedia", "Exploit DB",
  "Zero Day Initiative", "Packet Storm", "Hybrid Analysis", "ANY.RUN",
  "Joe Sandbox", "AbuseIPDB", "Spamhaus", "Cloudflare Radar", "Shadowserver",
];

export default function DocsPage() {
  return (
    <main className="public-page inner-page public-light selection-surface selection-docs mk-page docs-page">
      <SiteHeader mode="core" />

      <section className="mk-hero docs-hero">
        <p className="section-label">Docs</p>
        <h1>
          Everything Cefense
          <br />
          knows, written down.
        </h1>
        <p className="mk-hero-sub">
          The research behind every match — attack classes, control points, and
          the reasoning Cefense uses to decide a path is reachable. Open to read
          and search.
        </p>
      </section>

      <section className="mk-statement">
        <p className="mk-overline">No black boxes</p>
        <h2>
          Security should never
          <br />
          be a black box.
        </h2>
      </section>

      <section className="mk-split">
        <h2>Every match points back to a page.</h2>
        <div>
          <p>
            When Cefense flags a path, it isn&apos;t asking you to trust a score.
            Behind the finding is the research you can read here.
          </p>
          <p>
            The attack class, the control point, and why the code was reachable
            — nothing in the product happens that isn&apos;t written down.
          </p>
        </div>
      </section>

      <section className="mk-statement">
        <p className="mk-overline">The library</p>
        <h2>
          So we wrote
          <br />
          all of it down.
        </h2>
      </section>

      <section className="docs-explorer-section">
        <DocsExplorer />
      </section>

      <section className="mk-statement">
        <p className="mk-overline">Living intelligence</p>
        <h2>
          The same signal the
          <br />
          product runs on.
        </h2>
        <p className="mk-statement-sub">
          Every entry below is a reconstructed attack primitive — its source,
          when it was observed, and the semantic variants available for replay.
        </p>
      </section>

      <section className="threat-desk-page docs-desk">
        <div className="threat-desk-head">
          <div>
            <span>Living attack primitive explorer</span>
            <h2>Six primitives, continuously normalized.</h2>
            <p>
              Reconstructed from the source layer, deduplicated, and ranked for
              relevance before anything reaches you.
            </p>
          </div>
          <i>Updated seconds ago</i>
        </div>
        {primitives.map(([time, category, title, note, score, source, variants]) => (
          <article key={title}>
            <b>{time}</b>
            <div>
              <span>
                {category} · {source}
              </span>
              <strong>{title}</strong>
              <p>
                {note} · <em>{variants}</em>
              </p>
            </div>
            <i>{score}</i>
          </article>
        ))}
      </section>

      <section className="mk-statement">
        <p className="mk-overline">The source layer</p>
        <h2>
          Two hundred feeds.
          <br />
          One useful signal.
        </h2>
        <p className="mk-statement-sub">
          Cefense does not turn 254 feeds into 254 inboxes. It reconstructs
          attacker behavior, groups duplicates, and surfaces a primitive only
          when it changes your risk.
        </p>
      </section>

      <section className="source-directory docs-sources">
        {sources.map((source, index) => (
          <p key={source}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {source}
          </p>
        ))}
        <p className="source-more">
          <strong>+ more</strong> research, malware, infrastructure, cloud,
          identity, OT, and OSINT sources
        </p>
      </section>

      <section className="mk-statement">
        <p className="mk-overline">The point of it all</p>
        <h2>
          Coverage is table stakes.
          <br />
          Reduction is the product.
        </h2>
      </section>

      <section className="mk-split">
        <h2>Reachability, in plain language.</h2>
        <div>
          <p>
            The single idea the whole product rests on — how a live attack
            becomes a line in your code.
          </p>
          <p>
            Written for anyone who needs to understand a finding, not only the
            person who wrote the code it lives in.
          </p>
        </div>
      </section>

      <section className="mk-tracks">
        <div className="mk-stage-head">
          <span>Reading tracks</span>
          <h2>Learn one attack class, end to end.</h2>
        </div>
        <div className="mk-track-grid">
          <article>
            <b>Authentication</b>
            <p>Session boundaries, device-code flows, and JWT confusion.</p>
            <span>3 articles</span>
          </article>
          <article>
            <b>Cloud</b>
            <p>Metadata SSRF, IAM role chaining, and quiet public exposure.</p>
            <span>3 articles</span>
          </article>
          <article>
            <b>Supply chain</b>
            <p>Ownership transfer, postinstall scripts, and dependency confusion.</p>
            <span>3 articles</span>
          </article>
          <article>
            <b>AI agents</b>
            <p>Delegated tool permissions and prompt-routed requests.</p>
            <span>2 articles</span>
          </article>
        </div>
      </section>

      <section className="mk-statement">
        <p className="mk-overline">Always current</p>
        <h2>
          New attack.
          <br />
          Same day.
        </h2>
      </section>

      <section className="mk-cta">
        <h2>Put the research to work.</h2>
        <Link
          className="public-primary-action"
          href="/login?return_to=%2Fapp%3Fview%3Dfeed"
        >
          Open Cefense
        </Link>
      </section>

      <SiteFooter />
    </main>
  );
}
