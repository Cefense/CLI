"use client";

import { useState } from "react";

const before = [
  "const session = await store.read(token)",
  "return session.user",
];

const after = [
  "const session = await store.readAndConsume(token)",
  "assertFresh(session, MAX_SESSION_AGE)",
  "return authorizeOwner(session)",
];

export function ProductDemo() {
  const [verified, setVerified] = useState(false);

  return (
    <section className="product-window" aria-label="Interactive Cefense repair review">
      <header className="window-header">
        <div className="window-brand">CEFENSE</div>
        <div className="window-repo">acme / payments-api</div>
        <div className={verified ? "window-state safe" : "window-state active"}>
          {verified ? "PATH CLOSED" : "REPAIR READY"}
        </div>
      </header>

      <div className="window-body review-body">
        <div className="code-panel comparison-panel">
          <div className="comparison-heading">
            <span>auth/session.service.ts</span>
            <strong>Current / proposed</strong>
          </div>
          <div className="comparison-grid">
            <div>
              <span>CURRENT</span>
              {before.map((line, index) => (
                <code className="code-line removed" key={line}>
                  <i>{85 + index}</i>{line}
                </code>
              ))}
            </div>
            <div>
              <span>PROPOSED</span>
              {after.map((line, index) => (
                <code className="code-line added" key={line}>
                  <i>{85 + index}</i>{line}
                </code>
              ))}
            </div>
          </div>
        </div>

        <aside className="security-panel decision-panel">
          <span>CONSEQUENCE</span>
          <h3>{verified ? "Replay blocked." : "Stale sessions reach an owner route."}</h3>
          <p>
            The repair closes the shared session boundary without changing the
            login flow.
          </p>
          <ul>
            <li>Scope isolated</li>
            <li>Regression test included</li>
            <li>Six variants replayed</li>
          </ul>
          <button type="button" onClick={() => setVerified(true)} disabled={verified}>
            {verified ? "Verified ✓" : "Verify repair"}
          </button>
        </aside>
      </div>
    </section>
  );
}
