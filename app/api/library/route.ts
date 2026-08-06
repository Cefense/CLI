import { NextResponse } from "next/server";
import type { LibraryTopic } from "../../../db/api-types";

// GET /api/library?q=... — research normalized from primary sources.
// TODO(cto): replace MOCK with the real research index / search.
export const dynamic = "force-dynamic";

const MOCK: LibraryTopic[] = [
  { category: "Authentication", title: "Session replay and ownership boundaries", source: "CISA · Project Zero · incident research" },
  { category: "Cloud", title: "Metadata SSRF across redirect chains", source: "Mandiant · Unit 42 · cloud advisories" },
  { category: "Supply chain", title: "Package ownership-transfer risk", source: "OpenSSF · GitHub advisories · OSV" },
];

export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").toLowerCase();
  const topics = q
    ? MOCK.filter((t) => `${t.category} ${t.title} ${t.source}`.toLowerCase().includes(q))
    : MOCK;
  return NextResponse.json({ topics });
}
