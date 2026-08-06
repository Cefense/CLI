"use client";

/* Opening an inventory row expands it — like a feed finding opening full page.
   It lists the underlying items (the 18 services, the endpoints, the findings)
   and flags the ones that need attention. */

const ITEM_POOL: Record<string, string[]> = {
  clouds: [
    "s3-artifacts", "rds-payments", "lambda-auth", "cloudfront-edge",
    "ec2-worker", "sqs-events", "secrets-manager", "api-gateway",
    "dynamo-sessions", "elasticache", "cloudwatch-logs", "kms-root",
    "route53-zone", "vpc-egress", "ecr-registry", "step-functions",
    "athena-audit", "sns-alerts", "eventbridge", "waf-rules",
  ],
  containers: [
    "web", "api", "worker", "scheduler", "migrator", "proxy", "cache",
    "cron", "exporter", "ingest", "renderer", "gateway",
  ],
  domains: [
    "/", "/login", "/api", "/webhooks", "/admin", "/status", "/assets",
    "/callback", "/health", "/metrics",
  ],
  pentests: [
    "session-boundary bypass", "token replay", "CSRF on transfer",
    "rate-limit gap", "open redirect", "IDOR on export", "verbose error",
  ],
};

const DEFAULTS: Record<string, { count: number; unit: string }> = {
  clouds: { count: 12, unit: "services" },
  containers: { count: 6, unit: "images" },
  domains: { count: 6, unit: "endpoints" },
  pentests: { count: 5, unit: "findings" },
};

function tone(status: string) {
  const value = status.toLowerCase();
  if (value.includes("critical") || value.includes("exposed")) return "critical";
  if (
    value.includes("high") ||
    value.includes("finding") ||
    value.includes("review") ||
    value.includes("medium") ||
    value.includes("running")
  )
    return "warn";
  return "ok";
}

export function InventoryDetailView({
  name,
  meta,
  status,
  kind,
  onBack,
}: {
  name: string;
  meta: string;
  status: string;
  kind: keyof typeof ITEM_POOL;
  onBack: () => void;
}) {
  const fallback = DEFAULTS[kind] ?? { count: 8, unit: "items" };
  const countMatch = meta.match(/^(\d+)\s*([a-z]+)/i);
  const count = countMatch ? Number(countMatch[1]) : fallback.count;
  const unit = countMatch ? countMatch[2] : fallback.unit;
  const flaggedMatch = status.match(/^(\d+)/);
  const flagged = flaggedMatch ? Number(flaggedMatch[1]) : 0;

  const pool = ITEM_POOL[kind] ?? ITEM_POOL.clouds;
  const items = Array.from({ length: count }, (_, index) => {
    const base = pool[index % pool.length];
    const suffix = index >= pool.length ? `-${Math.floor(index / pool.length) + 1}` : "";
    return { name: `${base}${suffix}`, flagged: index < flagged };
  });
  const singular = unit.replace(/s$/, "");

  return (
    <div className="inventory-detail">
      <button className="inv-back" type="button" onClick={onBack}>
        Back
      </button>
      <div className="inv-detail-head">
        <h1>{name}</h1>
        <p>
          {count} {unit}
          {flagged ? ` · ${flagged} need attention` : " · all clean"}
        </p>
      </div>
      <div className="inventory-view">
        {items.map((item) => (
          <div
            className={`inventory-row inv-item ${item.flagged ? "flagged" : ""}`}
            key={item.name}
          >
            <span className="inventory-name">{item.name}</span>
            <span className="inventory-meta">{singular}</span>
            <b
              className={`asset-status ${item.flagged ? "critical" : "ok"}`}
            >
              {item.flagged ? "exposed" : "clean"}
            </b>
          </div>
        ))}
      </div>
    </div>
  );
}

export const inventoryTone = tone;
