import Link from "next/link";
import { SiteFooter, SiteHeader } from "../components/site-shell";

export default function PricingPage() {
  return (
    <main className="public-page inner-page">
      <SiteHeader />
      <section className="page-hero pricing-page-hero">
        <p className="section-label">Pricing</p>
        <h1>Pay for awareness. Upgrade for change.</h1>
        <p>
          Start without repository access. Move to codebase immunity only when
          you want Cefense to trace, repair, and verify.
        </p>
      </section>
      <section className="pricing-page-grid">
        <article className="pricing-panel signal">
          <div>
            <span>Signal</span>
            <i>Threat intelligence</i>
          </div>
          <p className="price">
            <strong>$3</strong>
            <span>/ month</span>
          </p>
          <p>
            Personalized attack intelligence without connecting source code.
          </p>
          <ul>
            <li>Live threat desk</li>
            <li>Personal watchlists</li>
            <li>Framework and variant notes</li>
            <li>Critical alerts</li>
          </ul>
          <Link href="/login?return_to=%2Fapp%3Fplan%3Dsignal">
            Choose Signal
          </Link>
        </article>
        <article className="pricing-panel immunity">
          <div>
            <span>Immunity</span>
            <i>Codebase security</i>
          </div>
          <p className="price">
            <strong>$49</strong>
            <span>/ developer / month</span>
          </p>
          <p>
            Repository graph, live attack matching, prepared repairs, and
            evidence.
          </p>
          <ul>
            <li>Everything in Signal</li>
            <li>Repository inventory and scan</li>
            <li>Reachability and taint paths</li>
            <li>Reviewable repair preparation</li>
            <li>Verification evidence</li>
          </ul>
          <Link href="/login?return_to=%2Fapp%3Fplan%3Dimmunity">
            Choose Immunity
          </Link>
        </article>
        <article className="enterprise-panel">
          <div>
            <span>Enterprise</span>
            <p>
              Compliance exports, supply chain, private-repository deployment,
              post-quantum migration, custom rules, and SLA.
            </p>
          </div>
          <a href="mailto:team@cefense.com?subject=Cefense%20enterprise">
            Talk to the founders
          </a>
        </article>
      </section>
      <SiteFooter />
    </main>
  );
}
