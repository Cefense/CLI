import { NextResponse } from "next/server";
import type { ImmunityRecord } from "../../../db/api-types";

// GET /api/evidence?pathId=... — the signed immunity record for a closed path.
// TODO(cto): generate from the real fix + replay run and sign with the
// evidence service. Keep the ImmunityRecord shape (db/api-types.ts).
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const pathId = new URL(request.url).searchParams.get("pathId") ?? "demo-auth";
  const record: ImmunityRecord = {
    pathId,
    title: "Session boundary replay",
    status: "draft",
    hash: "9e8c77a4",
    chain: [
      { stage: "observed", label: "Live attack primitive reconstructed", detail: "BleepingComputer", at: "2026-07-21T04:17:00Z" },
      { stage: "matched", label: "auth/session.service.ts:87", detail: "reachability 94%", at: "2026-07-21T04:18:36Z" },
      { stage: "fix", label: "Focused patch + replay test", detail: "3 files · +18 −30", at: "2026-07-21T04:19:00Z" },
      { stage: "proof", label: "Original path and 6 variants closed", detail: "graph replay", at: "2026-07-21T04:19:20Z" },
    ],
  };
  return NextResponse.json({ record });
}
