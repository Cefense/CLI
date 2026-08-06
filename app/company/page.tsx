import Link from "next/link";
import { SiteFooter, SiteHeader } from "../components/site-shell";

export default function CompanyPage() {
  return (
    <main className="public-page inner-page">
      <SiteHeader />
      <section className="page-hero company-hero">
        <p className="section-label">Company</p>
        <h1>Security software should finish the job.</h1>
        <p>
          Cefense is built around a stubborn product principle: a finding is not
          an outcome. The work ends when the reachable path is closed and the
          change is proven.
        </p>
      </section>
      <section className="company-proof">
        <p>Operational</p>
        <h2>Ingestion. Repository scan. AutoFix. Evidence.</h2>
        <div>
          <span>Open intelligence network</span>
          <span>Public repository scanning</span>
          <span>Reviewable repairs</span>
          <span>Evidence records</span>
        </div>
      </section>
      <section className="company-principles">
        <article>
          <span>01</span>
          <h3>Context over alert volume.</h3>
          <p>
            The codebase graph is the shared model for developers, security
            leaders, and evidence.
          </p>
        </article>
        <article>
          <span>02</span>
          <h3>Small changes over autonomous theater.</h3>
          <p>
            Repairs are focused, reviewable, and tied to the unsafe control
            point.
          </p>
        </article>
        <article>
          <span>03</span>
          <h3>Proof over promises.</h3>
          <p>
            Every claim should resolve into a product interaction, a result, or
            a signed record.
          </p>
        </article>
      </section>
      <section className="company-actions">
        <Link href="/app">
          Open workspace
        </Link>
        <a href="mailto:team@cefense.com">
          team@cefense.com
        </a>
      </section>
      <SiteFooter />
    </main>
  );
}
