import { NextResponse } from "next/server";
import type { AuditRow } from "../../../db/api-types";

// GET /api/audit — merges checked for newly reachable risk before they ship.
// TODO(cto): replace MOCK with real PR analysis from the VCS provider.
export const dynamic = "force-dynamic";

const MOCK: AuditRow[] = [
  { ref: "PR #184", title: "Tighten refresh-session ownership", file: "src/auth/session.service.ts", impact: { added: 46, removed: 28 }, severity: "Critical" },
  { ref: "PR #181", title: "Upgrade payment worker dependencies", file: "workers/payments/package.json", impact: { added: 122, removed: 71 }, severity: "High" },
  { ref: "PR #179", title: "Add agent tool routing", file: "src/platform/agent.ts", impact: { added: 310, removed: 94 }, severity: "Medium" },
];

export async function GET() {
  return NextResponse.json({ changes: MOCK });
}
