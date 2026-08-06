import { requireChatGPTUser } from "../chatgpt-auth";
import { getCyberusProfile, getLatestCyberusScan, type CyberusPlan } from "../../db/cyberus";
import { WorkspaceClient } from "./workspace-client";
import "./workspace.css";
import "./command-workspace.css";
import "./workstation.css";
import "./immunity.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WorkspacePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const requestedPlan: CyberusPlan = params?.plan === "immunity" ? "immunity" : "signal";
  const requestedView = typeof params?.view === "string" ? params.view : "feed";
  const returnTo = `/app?plan=${requestedPlan}&view=${encodeURIComponent(requestedView)}`;
  const user = await requireChatGPTUser(returnTo);
  const [profile, latestScan] = await Promise.all([getCyberusProfile(user.email), getLatestCyberusScan(user.email)]);

  return <WorkspaceClient user={user} initialProfile={profile} initialScan={latestScan} requestedPlan={requestedPlan} requestedView={requestedView} />;
}
