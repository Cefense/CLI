"use client";

import type { CyberusFinding } from "../../../db/cyberus";

// DATA SOURCE: GET /api/audit (see API_CONTRACT.md). A full-width, holistic
// list of merges checked for newly reachable risk — no squeezed sidebar,
// no summary chrome. Each row opens the fix.
export function CodeAuditView({
  findings,
  onFix,
}: {
  findings: CyberusFinding[];
  onFix: () => void;
}) {
  const changes: [string, string, string, string][] = [
    ["PR #184", "Tighten refresh-session ownership", "net +18", "Critical"],
    ["PR #181", "Upgrade payment worker dependencies", "net +51", "High"],
    ["PR #179", "Add agent tool routing", "net +216", "Medium"],
    ["PR #176", "Rework export path handling", "net +32", "Watch"],
  ];
  function tone(sev: string) {
    const v = sev.toLowerCase();
    if (v === "critical") return "critical";
    if (v === "high" || v === "medium") return "warn";
    return "ok";
  }
  return (
    <div className="inventory-view">
      <div className="inventory-head">
        <h2>Merges under review</h2>
      </div>
      {changes.map(([ref, title, delta, sev], index) => (
        <button
          type="button"
          className="inventory-row audit-row"
          key={ref}
          onClick={onFix}
        >
          <span className="inventory-name">
            <b className="audit-ref">{ref}</b> {title}
          </span>
          <span className="inventory-meta">
            {findings[index]?.file ?? "src/platform/agent.ts"} · {delta}
          </span>
          <b className={`asset-status ${tone(sev)}`}>{sev}</b>
        </button>
      ))}
    </div>
  );
}
