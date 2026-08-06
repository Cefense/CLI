import Link from "next/link";
import { SiteFooter, SiteHeader } from "../components/site-shell";

/* PROOF — the third tab. Shows the real signed record, not a promise. Blue. */
export default function ThreatsPage() {
  return (
    <main className="public-page inner-page public-light selection-surface selection-proof mk-page">
      <SiteHeader mode="core" />

      <section className="mk-hero">
        <p className="section-label">The proof</p>
        <h1>
          Every closed path
          <br />
          leaves a record.
        </h1>
        <p className="mk-hero-sub">
          The observed attack, the matched code, the change, and the replay that
          confirms closure — kept together as one signed record.
        </p>
      </section>

      <section className="mk-stage">
        <div className="mk-stage-head">
          <span>The real thing</span>
          <h2>This is the evidence, not a promise.</h2>
          <p>Buyer-ready and audit-ready the moment a path closes.</p>
        </div>

        <article className="mk-record">
          <header>
            <div>
              <span>CEFENSE IMMUNITY RECORD</span>
              <strong>Session boundary replay</strong>
            </div>
            <b>SIGNED</b>
          </header>
          <ol>
            <li>
              <span>Observed</span>
              <div>
                <strong>Live attack primitive reconstructed</strong>
                <small>19 Jul 2026 · 04:17 UTC · BleepingComputer</small>
              </div>
            </li>
            <li>
              <span>Matched</span>
              <div>
                <strong>auth/session.service.ts:87</strong>
                <small>96s after network observation · reachability 94%</small>
              </div>
            </li>
            <li>
              <span>Changed</span>
              <div>
                <strong>Focused patch + replay test</strong>
                <small>3 files · +18 −30 · owner approved</small>
              </div>
            </li>
            <li className="ok">
              <span>Verified</span>
              <div>
                <strong>Original path and 6 variants closed</strong>
                <small>Graph replay · signed 04:19 UTC</small>
              </div>
            </li>
          </ol>
          <footer>
            <span>Record hash · 9e8c…77a4</span>
            <span>Download JSON ↓</span>
          </footer>
        </article>
      </section>

      <section className="mk-note">
        <div>
          <span>SOC 2 · DORA · CRA</span>
          <h3>Compliance without a second system</h3>
          <p>
            The record is the evidence export — no separate narrative to
            assemble at audit time.
          </p>
        </div>
        <div>
          <span>Enterprise buyers</span>
          <h3>Prove it, don&apos;t claim it</h3>
          <p>
            Hand a security reviewer a signed record instead of a status page
            and a promise.
          </p>
        </div>
      </section>

      <section className="mk-cta">
        <h2>Turn a fix into proof.</h2>
        <Link
          className="public-primary-action"
          href="/login?return_to=%2Fapp%3Fview%3Dreports"
        >
          Open Cefense
        </Link>
      </section>

      <SiteFooter />
    </main>
  );
}
