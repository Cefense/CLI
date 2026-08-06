import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../chatgpt-auth";
import { demoFindings } from "../../app/workspace-config";

// GET /api/feed — observed/matched attack paths for the signed-in workspace.
// Serves the seeded findings today; TODO(cto): replace the source with real
// detection + repo-graph matching. The response shape ({ findings }) is exactly
// what the Feed renders, so a wired backend can drop data in here and the UI
// starts using it live — no frontend change needed.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user)
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  return NextResponse.json({ findings: demoFindings });
}
