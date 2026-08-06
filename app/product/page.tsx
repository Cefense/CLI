import Link from "next/link";
import { ProductDemo } from "../components/product-demo";
import { SiteFooter, SiteHeader } from "../components/site-shell";

/* PRODUCT — the fix, told as one continuous story. Every beat is a single
   line or a tight three-line paragraph. Big type, one moment per screen. */
export default function ProductPage() {
  return (
    <main className="public-page inner-page selection-surface selection-product mk-page">
      <SiteHeader mode="core" />

      <section className="mk-hero">
        <p className="section-label">The fix</p>
        <h1>
          One control point.
          <br />
          Closed for good.
        </h1>
        <p className="mk-hero-sub">
          Cefense doesn&apos;t hand you a report. It prepares the smallest safe
          change at the exact line the attack reaches — with the tests that
          prove it.
        </p>
      </section>

      <section className="mk-statement">
        <p className="mk-overline">The honest problem</p>
        <h2>
          Every scanner can see.
          <br />
          Almost none can close.
        </h2>
      </section>

      <section className="mk-split">
        <h2>The list was never the hard part.</h2>
        <div>
          <p>
            Two hundred findings by Friday, each ranked by a number that means
            something different in every tool.
          </p>
          <p>
            Seeing risk is easy. Closing it is the job nobody automated — the
            reading, the reachability, the one change that actually matters.
          </p>
        </div>
      </section>

      <section className="mk-statement">
        <p className="mk-overline">A different starting line</p>
        <h2>
          Cefense starts where
          <br />
          the list ends.
        </h2>
      </section>

      <section className="mk-split reverse">
        <h2>First, it finds the exact line.</h2>
        <div>
          <p>
            Before there is a fix, there is a match. Cefense traces the observed
            attack through your repository graph to the precise place it becomes
            reachable.
          </p>
          <p>
            The one path that can actually be reached is the one you see. No
            guessing which of two hundred findings is real.
          </p>
        </div>
      </section>

      <section className="mk-statement">
        <p className="mk-overline">Then it acts</p>
        <h2>
          And it writes
          <br />
          the change.
        </h2>
      </section>

      <section className="mk-stage">
        <div className="mk-stage-head">
          <span>The real thing</span>
          <h2>This is the fix, not a mockup.</h2>
          <p>Repository context. One focused diff. The decision beside it.</p>
        </div>
        <ProductDemo />
      </section>

      <section className="mk-statement">
        <p className="mk-overline">The smallest safe change</p>
        <h2>
          One line, if one line
          <br />
          is all it takes.
        </h2>
      </section>

      <section className="mk-split">
        <h2>Every variant crosses one boundary.</h2>
        <div>
          <p>
            An attack wears a hundred disguises and passes through a single
            choke point — where reachable code becomes a privileged action.
          </p>
          <p>
            Cefense closes the choke point, not the disguise. Fix the boundary
            once and every variant stops at the same door.
          </p>
        </div>
      </section>

      <section className="mk-statement">
        <p className="mk-overline">Nothing else moves</p>
        <h2>
          Your login flow
          <br />
          never moves.
        </h2>
      </section>

      <section className="mk-split reverse">
        <h2>The safest fix touches the least.</h2>
        <div>
          <p>
            The most dangerous change is the one that quietly breaks something
            else. Cefense scopes the repair to the boundary.
          </p>
          <p>
            It proves the blast radius is empty before you ever see it. No
            refactor. No sweeping rename.
          </p>
        </div>
      </section>

      <section className="mk-statement">
        <p className="mk-overline">Proof, not confidence</p>
        <h2>
          A fix you didn&apos;t test
          <br />
          is a guess.
        </h2>
      </section>

      <section className="mk-split">
        <h2>So it runs the attack again.</h2>
        <div>
          <p>
            Cefense replays the original path and every semantic variant against
            the change, and watches each one fail to reach the control point.
          </p>
          <p>
            What you approve has already survived the attack it was written for.
          </p>
        </div>
      </section>

      <section className="mk-stats">
        <article>
          <strong>1</strong>
          <span>shared control point per path — not a patch scattered across files.</span>
        </article>
        <article>
          <strong>6</strong>
          <span>semantic variants replayed before a fix is ever called closed.</span>
        </article>
        <article>
          <strong>0</strong>
          <span>files changed that you didn&apos;t review and approve first.</span>
        </article>
      </section>

      <section className="mk-statement">
        <p className="mk-overline">Why it&apos;s different</p>
        <h2>
          The finding is not
          <br />
          the product. Closure is.
        </h2>
      </section>

      <section className="mk-loop">
        <article>
          <b>Observed</b>
          <strong>The attack</strong>
          <p>A live attack is reduced to the behavior that made it work.</p>
        </article>
        <article>
          <b>Matched</b>
          <strong>Your code</strong>
          <p>Traced through the repository graph to the reachable line.</p>
        </article>
        <article>
          <b>Fixed</b>
          <strong>One boundary</strong>
          <p>The smallest safe change at the shared control point.</p>
        </article>
        <article>
          <b>Proven</b>
          <strong>Closed path</strong>
          <p>The original and every variant replayed and blocked.</p>
        </article>
      </section>

      <section className="mk-statement big">
        <p className="mk-overline">The whole loop</p>
        <h2>
          From attack
          <br />
          to proven fix.
        </h2>
        <p className="mk-statement-sub">
          Observed, matched, fixed, proven. One path, one chain of evidence, one
          closed door — kept together from the moment it appears.
        </p>
      </section>

      <section className="mk-cta">
        <h2>See the fix for your own code.</h2>
        <Link
          className="public-primary-action"
          href="/login?return_to=%2Fapp%3Fview%3Dautofix"
        >
          Open Cefense
        </Link>
      </section>

      <SiteFooter />
    </main>
  );
}
