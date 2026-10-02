import type { CefenseClient } from "./client.js";
import type { BillingResponse } from "./types.js";
import { CefenseError, EXIT_API } from "./errors.js";

export const ALLOWANCE_WARN_PERCENT = 80;

export interface AllowanceNotice {
  state: "low" | "exhausted";
  percentUsed: number | null;
  resetsAt: string | null;
  renews: boolean;
}

export function allowanceNotice(billing: BillingResponse | null): AllowanceNotice | null {
  if (!billing || billing.usage.unlimited) return null;
  const percentUsed = billing.usage.percentUsed;
  const state = billing.usage.exhausted
    ? "exhausted"
    : (percentUsed ?? 0) >= ALLOWANCE_WARN_PERCENT
      ? "low"
      : null;
  if (!state) return null;
  const renews = billing.subscription.plan !== "free";
  return {
    state,
    percentUsed,
    resetsAt: renews ? billing.usage.periodEnd : null,
    renews,
  };
}

function resetSentence(notice: AllowanceNotice, verb: string): string {
  if (!notice.renews) return "The free grant does not renew.";
  if (!notice.resetsAt) return "";
  return `${verb} on ${notice.resetsAt.slice(0, 10)} (UTC).`;
}

export function allowanceMessage(notice: AllowanceNotice): string {
  if (notice.state === "exhausted") {
    const resets = resetSentence(notice, "Scanning resumes");
    return `This organization has used its scan allowance for the period, so no scan will start.${resets ? ` ${resets}` : ""}`;
  }
  const resets = resetSentence(notice, "It resets");
  return `${notice.percentUsed ?? ALLOWANCE_WARN_PERCENT}% of this period's scan allowance is used. Scans stop starting when it runs out.${resets ? ` ${resets}` : ""}`;
}

export async function readAllowanceNotice(client: CefenseClient): Promise<AllowanceNotice | null> {
  const billing = await client.billing().catch(() => null);
  return allowanceNotice(billing);
}

export async function assertScanAllowance(client: CefenseClient): Promise<AllowanceNotice | null> {
  const notice = await readAllowanceNotice(client);
  if (notice?.state === "exhausted") {
    throw new CefenseError(allowanceMessage(notice), {
      code: "allowance_exhausted",
      exitCode: EXIT_API,
      remedy: notice.renews
        ? "Run cf plan to see usage. Wait for the reset date, or move up a plan with cf plan upgrade."
        : "Run cf plan upgrade to choose a plan.",
    });
  }
  return notice;
}
