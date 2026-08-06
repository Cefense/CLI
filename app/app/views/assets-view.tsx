"use client";

import { useState } from "react";
import { InventoryDetailView } from "./inventory-detail-view";

// DATA SOURCE: GET /api/assets?kind=containers|clouds|domains (see API_CONTRACT.md)
const assetRecords = {
  containers: [
    ["api-gateway:production", "18 services", "2 critical"],
    ["payments-worker:v42", "6 workers", "1 high"],
    ["report-renderer:latest", "3 jobs", "Clean"],
    ["scanner-base:v18", "build image", "3 medium"],
  ],
  clouds: [
    ["AWS · production", "18 services", "2 exposed"],
    ["GCP · cefense-prod", "11 services", "1 high"],
    ["Cloudflare · edge", "7 zones", "Clean"],
  ],
  domains: [
    ["app.cefense.com", "product", "Protected"],
    ["api.cefense.com", "public API", "2 findings"],
    ["hooks.cefense.com", "webhook intake", "Review"],
    ["status.cefense.com", "service status", "Protected"],
  ],
} as const;

const HEADERS: Record<keyof typeof assetRecords, string> = {
  containers: "Running container images",
  clouds: "Connected cloud accounts",
  domains: "Public entry points",
};

function statusTone(status: string) {
  const value = status.toLowerCase();
  if (value.includes("critical") || value.includes("exposed")) return "critical";
  if (
    value.includes("high") ||
    value.includes("finding") ||
    value.includes("review") ||
    value.includes("medium")
  )
    return "warn";
  return "ok";
}

export function AssetInventoryView({
  kind,
}: {
  kind: keyof typeof assetRecords;
}) {
  const [open, setOpen] = useState<readonly [string, string, string] | null>(
    null,
  );

  if (open) {
    return (
      <InventoryDetailView
        name={open[0]}
        meta={open[1]}
        status={open[2]}
        kind={kind}
        onBack={() => setOpen(null)}
      />
    );
  }

  return (
    <div className="inventory-view">
      <div className="inventory-head">
        <h2>{HEADERS[kind]}</h2>
      </div>
      {assetRecords[kind].map((record) => (
        <button
          type="button"
          className="inventory-row"
          key={record[0]}
          onClick={() => setOpen(record)}
        >
          <span className="inventory-name" title={record[0]}>
            {record[0]}
          </span>
          <span className="inventory-meta">{record[1]}</span>
          <b className={`asset-status ${statusTone(record[2])}`}>{record[2]}</b>
        </button>
      ))}
    </div>
  );
}
