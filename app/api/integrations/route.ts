import { NextResponse } from "next/server";
import type { Connector } from "../../../db/api-types";

// GET /api/integrations — connectors and their state.
// POST /api/integrations { id, connected } — toggle a connector.
// TODO(cto): replace MOCK with real connector registry + OAuth flows.
export const dynamic = "force-dynamic";

const MOCK: Connector[] = [
  { id: "github", name: "GitHub", description: "Repository import, checks, and pull requests", connected: true },
  { id: "gitlab", name: "GitLab", description: "Projects, pipelines, and merge requests", connected: false },
  { id: "jira", name: "Jira", description: "Issue ownership and remediation workflows", connected: false },
  { id: "slack", name: "Slack", description: "High-signal alerts and approvals", connected: false },
  { id: "vanta", name: "Vanta", description: "Compliance evidence sync", connected: false },
];

export async function GET() {
  return NextResponse.json({ connectors: MOCK });
}

export async function POST(request: Request) {
  let body: { id?: string; connected?: boolean };
  try {
    body = (await request.json()) as { id?: string; connected?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "Connector id required" }, { status: 400 });
  return NextResponse.json({ id: body.id, connected: Boolean(body.connected) });
}
