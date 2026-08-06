"use client";

import { useState } from "react";

// DATA SOURCE: GET /api/integrations  ·  POST /api/integrations/:id/connect
// See API_CONTRACT.md. Replace the local `connectors` list + toggle with the
// endpoint response when the backend is wired.
const connectors: [string, string][] = [
  ["GitHub", "Repository import, checks, and pull requests"],
  ["GitLab", "Projects, pipelines, and merge requests"],
  ["Jira", "Issue ownership and remediation workflows"],
  ["Linear", "Engineering issue routing"],
  ["Slack", "High-signal alerts and approvals"],
  ["AWS", "Cloud assets and exposure context"],
  ["Vanta", "Compliance evidence sync"],
  ["Drata", "Control and evidence sync"],
];

/* Integrations is configuration, not a destination — it renders inside
   Settings (embedded), never as its own sidebar tab. */
export function IntegrationsView({ embedded = false }: { embedded?: boolean }) {
  const [connected, setConnected] = useState(["GitHub"]);
  const grid = (
    <section className="integration-grid">
      {connectors.map(([name, copy]) => {
        const active = connected.includes(name);
        return (
          <article key={name}>
            <i>{name.slice(0, 2).toUpperCase()}</i>
            <div>
              <h2>{name}</h2>
              <p>{copy}</p>
            </div>
            <button
              type="button"
              className={active ? "connected" : ""}
              onClick={() =>
                setConnected((current) =>
                  active
                    ? current.filter((item) => item !== name)
                    : [...current, name],
                )
              }
            >
              {active ? "Connected ✓" : "Connect"}
            </button>
          </article>
        );
      })}
    </section>
  );

  if (embedded) return grid;

  return (
    <div className="view-shell">
      <header className="view-intro">
        <div>
          <h1>Integrations</h1>
          <p>
            Where findings, approvals, and evidence flow — Cefense meets your
            existing tools instead of becoming another inbox.
          </p>
        </div>
        <span className="view-intro-tag library">Workflow</span>
      </header>
      {grid}
    </div>
  );
}
