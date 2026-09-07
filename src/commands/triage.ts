import { openSession, type GlobalOptions, type Session } from "../core/session.js";
import { CefenseError, UsageError } from "../core/errors.js";
import type { TriageStatus } from "../core/types.js";
import * as out from "../ui/output.js";
import { c } from "../ui/theme.js";
import { isAgentMode } from "../ui/mode.js";

const ALIASES: Record<string, TriageStatus> = {
  open: "open",
  reopen: "open",
  restore: "open",
  "false-positive": "false_positive",
  false_positive: "false_positive",
  "false positive": "false_positive",
  dismiss: "false_positive",
  dismissed: "false_positive",
  "accepted-risk": "accepted_risk",
  accepted_risk: "accepted_risk",
  "accepted risk": "accepted_risk",
  accept: "accepted_risk",
};

export const TRIAGE_LABELS: Record<TriageStatus, string> = {
  open: "Open",
  false_positive: "False positive",
  accepted_risk: "Accepted risk",
};

export function parseTriageStatus(value: string): TriageStatus {
  const status = ALIASES[value.trim().toLowerCase()];
  if (!status) {
    throw new UsageError(
      `${value} is not a triage decision.`,
      "Use open, false-positive, or accepted-risk.",
      "invalid_triage_status",
    );
  }
  return status;
}

/**
 * Records the decision, translating the two refusals the route has.
 *
 * A finding with no fingerprint has no identity that survives a rescan, so
 * there is nothing to attach a decision to and the route says so rather than
 * writing a row that the next scan would orphan.
 */
export async function applyTriage(
  session: Session,
  findingId: string,
  status: TriageStatus,
  note?: string,
): Promise<TriageStatus> {
  try {
    const result = await session.client.triageFinding(findingId, status, note);
    return result.status;
  } catch (error) {
    if (error instanceof CefenseError && /no durable identity/i.test(error.message)) {
      throw new CefenseError("This finding cannot be triaged.", {
        remedy: "It has no fingerprint, so a decision would not survive the next scan.",
        code: "finding_not_triageable",
      });
    }
    if (error instanceof CefenseError && /finding not found/i.test(error.message)) {
      throw new UsageError(
        `${findingId} is not a finding on any repository you own.`,
        "Run cf observed to list finding ids.",
        "finding_not_found",
      );
    }
    throw error;
  }
}

export async function triageCommand(
  globals: GlobalOptions,
  findingId: string,
  decision: string,
  options: { note?: string } = {},
): Promise<number> {
  const status = parseTriageStatus(decision);
  const session = await openSession(globals, { auth: true });
  const applied = await applyTriage(session, findingId, status, options.note);

  if (isAgentMode()) {
    out.agentEmit({ findingId, status: applied, note: options.note ?? null }, [
      "cf observed --agent",
    ]);
    return 0;
  }
  if (out.isJsonMode()) {
    out.json({ findingId, status: applied, note: options.note ?? null });
    return 0;
  }

  out.line();
  out.success(`Marked ${c.bold(TRIAGE_LABELS[applied].toLowerCase())}`);
  out.hint(
    applied === "open"
      ? "It counts against this repository again."
      : "It stays recorded on every rescan until you reopen it.",
  );
  out.line();
  return 0;
}
