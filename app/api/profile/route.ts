import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getCyberusProfile, saveCyberusProfile, type CyberusPlan } from "../../../db/cyberus";

export const dynamic = "force-dynamic";

const allowedTopics = new Set(["Authentication", "Cloud", "Supply chain", "AI agents", "Post-quantum", "Data exposure"]);

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  return NextResponse.json({
    viewer: { displayName: user.displayName, email: user.email },
    profile: await getCyberusProfile(user.email),
  });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const plan: CyberusPlan = body.plan === "immunity" ? "immunity" : "signal";
  const company = cleanText(body.company, 100);
  const stack = cleanText(body.stack, 100);
  const repositoryUrl = cleanText(body.repositoryUrl, 300);
  const watchlist = Array.isArray(body.watchlist)
    ? body.watchlist.filter((item): item is string => typeof item === "string" && allowedTopics.has(item)).slice(0, 6)
    : [];
  const onboardingComplete = Boolean(stack && watchlist.length && (plan === "signal" || repositoryUrl));

  const profile = await saveCyberusProfile({
    email: user.email,
    fullName: user.fullName,
    company,
    plan,
    stack,
    repositoryUrl,
    watchlist,
    onboardingComplete,
  });
  return NextResponse.json({ profile });
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
