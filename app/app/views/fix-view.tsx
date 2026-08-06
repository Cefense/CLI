"use client";

import { useState } from "react";
import type { CyberusFinding } from "../../../db/cyberus";

/* The fix is specific to the finding, not a single canned session diff.
   Per attack class we render a plausible focused change at the finding's own
   file, a plain-language summary, the change list, and the decision trace. */
/* Five-second promise: Matched → Fix prepared. */

type FixTemplate = {
  summary: string;
  points: [string, string, string];
  before: string[];
  after: string[];
  trace: [string, string, string, string];
};

const FIX: Record<string, FixTemplate> = {
  Authentication: {
    summary:
      "Stale sessions are consumed on refresh, so an expired token can no longer reach a privileged route.",
    points: [
      "Session tokens are consumed on read, not reusable",
      "Freshness is asserted before any privileged access",
      "Ownership is authorized at the shared boundary",
    ],
    before: ["- const session = await store.read(token)", "- return session.user"],
    after: [
      "+ const session = await store.readAndConsume(token)",
      "+ assertFresh(session, MAX_SESSION_AGE)",
      "+ return authorizeOwner(session)",
    ],
    trace: [
      "Stale session crosses the ownership guard",
      "Variants: renamed token, middleware reorder, refresh replay",
      "Control point closed without changing the login flow",
      "Tests: replay, expiry boundary, owner mismatch",
    ],
  },
  Injection: {
    summary:
      "Untrusted input is bound as a parameter instead of concatenated, so it can no longer alter the query.",
    points: [
      "Input is parameterized, never interpolated",
      "The query shape is fixed at the call site",
      "A regression test asserts the operator is inert",
    ],
    before: ['- const rows = await db.query(`SELECT * FROM a WHERE id = ${id}`)'],
    after: [
      "+ const rows = await db.query('SELECT * FROM a WHERE id = $1', [id])",
      "+ assertScalar(id)",
    ],
    trace: [
      "Request input reaches the query sink across two calls",
      "Variants: operator injection, nested field, batch endpoint",
      "Sink parameterized without changing the caller",
      "Tests: operator payload, encoding, null bytes",
    ],
  },
  Cloud: {
    summary:
      "The redirect target is checked against an allowlist, so the path can no longer reach the metadata endpoint.",
    points: [
      "Redirect targets are matched against an allowlist",
      "Internal ranges are refused before the request is made",
      "A test replays the redirect chain end to end",
    ],
    before: ["- const res = await fetch(req.query.url)"],
    after: [
      "+ assertAllowedHost(req.query.url)",
      "+ const res = await fetch(req.query.url, { redirect: 'error' })",
    ],
    trace: [
      "Open redirect reaches the metadata service",
      "Variants: nested redirect, alternate scheme, IPv6 literal",
      "Egress constrained at the shared fetch boundary",
      "Tests: redirect chain, link-local, DNS rebinding",
    ],
  },
  "Supply chain": {
    summary:
      "Install scripts are disabled and the dependency is pinned, so untrusted code can no longer run in the build.",
    points: [
      "Postinstall scripts are ignored during CI",
      "The dependency is pinned to a verified digest",
      "A provenance check gates the production image",
    ],
    before: ['- "install": "npm ci"'],
    after: [
      '+ "install": "npm ci --ignore-scripts"',
      '+ "verify": "npm audit signatures"',
    ],
    trace: [
      "Transferred package runs a postinstall in the image",
      "Variants: transitive install hook, lifecycle alias",
      "Execution removed from the build boundary",
      "Tests: script gate, digest pin, provenance",
    ],
  },
};

const fallback = (finding: CyberusFinding): FixTemplate => ({
  summary: `The reachable path in ${finding.file.split("/").pop()} is closed at its control point without changing the surrounding behavior.`,
  points: [
    "A guard is added at the shared control point",
    "The reachable path no longer resolves",
    "A regression test replays the original attack",
  ],
  before: ["- return handler(input)"],
  after: ["+ assertSafe(input)", "+ return handler(input)"],
  trace: [
    `Input reaches ${finding.file.split("/").pop()}:${finding.line}`,
    "Variants: reordering, encoding, alternate route",
    "Control point closed without collateral change",
    "Tests: reachability, boundary, regression",
  ],
});

export function FixView({
  finding,
  ready,
  onPrepare,
  onVerify,
}: {
  finding: CyberusFinding;
  ready: boolean;
  onPrepare: () => void;
  onVerify: () => void;
}) {
  const [diffOpen, setDiffOpen] = useState(false);
  const template = FIX[finding.category] ?? fallback(finding);
  const shortFile = finding.file.split("/").pop() ?? finding.file;
  const startLine = finding.line || 84;

  return (
    <div className="stage-view fix-view" aria-label="Matched → Fix prepared">
      <section className="workspace-card repair-workbench">
        <div className="repair-editor">
          <div className="fix-plain-summary">
            <span>WHAT THIS CHANGE DOES</span>
            <strong>{template.summary}</strong>
            <p>
              One control point in {shortFile} is tightened. Surrounding
              behavior is unchanged, and a regression test replays the original
              attack and its variants against the new behavior.
            </p>
            <ul className="fix-change-list">
              {template.points.map((point, index) => (
                <li key={point}>
                  <b>{index + 1}</b> {point}
                </li>
              ))}
            </ul>
          </div>
          <details
            className="focused-diff"
            open={diffOpen}
            onToggle={(event) =>
              setDiffOpen((event.target as HTMLDetailsElement).open)
            }
          >
            <summary>
              <span>{diffOpen ? "Hide focused diff" : "View focused diff"}</span>
              <small>
                {shortFile}:{startLine} · {ready ? "proven closed" : "proposed"}
              </small>
            </summary>
            <div className="repair-tab-strip" aria-label="Files in repair">
              <button className="active" type="button">
                {shortFile}
              </button>
              <span>{ready ? "Proven closed" : "Fix prepared"}</span>
            </div>
            {template.before.map((line, index) => (
              <div className="diff-line removed" key={`b-${index}`}>
                <i>{startLine + index}</i>
                <code>{line}</code>
              </div>
            ))}
            {template.after.map((line, index) => (
              <div className="diff-line added" key={`a-${index}`}>
                <i>{startLine + index}</i>
                <code>{line}</code>
              </div>
            ))}
          </details>
          {ready && (
            <div className="verification-note">
              <span>✓ Proven closed</span>
              <strong>The reachable path no longer resolves.</strong>
            </div>
          )}
        </div>
        <aside className="repair-review">
          <span>REPAIR PACKAGE</span>
          <h3>{ready ? "Path closed with proof" : "Focused fix ready"}</h3>
          <p>
            Closes the control point at {shortFile}. Adds replay coverage.
            Leaves surrounding behavior unchanged.
          </p>
          <div className="reasoning-chain">
            <strong>DECISION TRACE</strong>
            {template.trace.map((step, index) => (
              <span key={step}>
                <b>{String(index + 1).padStart(2, "0")}</b> {step}
              </span>
            ))}
            <a className="research-link" href="/app?view=library">
              View the research behind this match
            </a>
          </div>
          <div>
            <span>
              <i className="done" /> Scope isolated
            </span>
            <span>
              <i className="done" /> Regression test added
            </span>
            <span>
              <i className={ready ? "done" : "pending"} /> Replay verification
            </span>
            <span>
              <i className={ready ? "done" : "pending"} /> Evidence attached
            </span>
          </div>
          {ready ? (
            <button type="button" onClick={onVerify}>
              Verify and create evidence
            </button>
          ) : (
            <button type="button" onClick={onPrepare}>
              Prepare review package
            </button>
          )}
          <small className="next-step-note">
            {ready
              ? "Replays the original path and its variants, then records closure in Proof. Nothing is committed to your repository."
              : "Bundles the diff, tests, and decision trace for owner review. Nothing is committed to your repository."}
          </small>
        </aside>
      </section>
    </div>
  );
}
