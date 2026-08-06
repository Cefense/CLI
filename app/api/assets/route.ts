import { NextResponse } from "next/server";
import type { AssetKind, AssetRow } from "../../../db/api-types";

// GET /api/assets?kind=containers|clouds|domains
// TODO(cto): replace MOCK with real inventory (cloud APIs, registry, DNS).
export const dynamic = "force-dynamic";

const MOCK: Record<AssetKind, AssetRow[]> = {
  containers: [
    { name: "api-gateway:production", context: "Production", status: "2 critical", meta: "Scanned 6m ago" },
    { name: "payments-worker:v42", context: "Production", status: "1 high", meta: "Scanned 18m ago" },
    { name: "report-renderer:latest", context: "Staging", status: "Clean", meta: "Scanned 1h ago" },
  ],
  clouds: [
    { name: "AWS · production", context: "18 services", status: "2 exposed", meta: "Connected" },
    { name: "GCP · cefense-prod", context: "11 services", status: "1 high", meta: "Connected" },
    { name: "Cloudflare · edge", context: "7 zones", status: "Clean", meta: "Connected" },
  ],
  domains: [
    { name: "app.cefense.com", context: "Product", status: "Protected", meta: "Platform" },
    { name: "api.cefense.com", context: "Public API", status: "2 findings", meta: "Engineering" },
    { name: "hooks.cefense.com", context: "Webhook intake", status: "Review", meta: "Integrations" },
  ],
};

export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("kind") as AssetKind | null;
  if (!kind || !(kind in MOCK))
    return NextResponse.json({ error: "Unknown asset kind" }, { status: 400 });
  return NextResponse.json({ kind, rows: MOCK[kind] });
}
