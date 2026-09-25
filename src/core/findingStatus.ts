import type { FindingProgress, ReachabilityVerdict } from "./types.js";

export const REACHABILITY_VERDICTS: readonly ReachabilityVerdict[] = [
  "reachable",
  "imported",
  "dev-only",
  "unimported",
  "unknown",
];

export const REACHABILITY_LABELS: Record<ReachabilityVerdict, string> = {
  reachable: "Reachable",
  imported: "Imported",
  "dev-only": "Development only",
  unimported: "Not imported",
  unknown: "Not determined",
};

export const REACHABILITY_LEDES: Record<ReachabilityVerdict, string> = {
  reachable: "A path runs from an entry point to the vulnerable code.",
  imported: "The code is used here, but no route, job or command was found that reaches it.",
  "dev-only": "Reached only from tests, fixtures or build tooling, so it does not ship.",
  unimported: "Nothing in the scanned source uses it.",
  unknown: "Cefense did not establish whether this runs here.",
};

export function isReachabilityVerdict(value: unknown): value is ReachabilityVerdict {
  return typeof value === "string" && (REACHABILITY_VERDICTS as readonly string[]).includes(value);
}

export function reachabilityLabel(verdict: string | null | undefined): string | null {
  return isReachabilityVerdict(verdict) ? REACHABILITY_LABELS[verdict] : null;
}

export type StatusKind = "none" | "working" | "ready" | "proven" | "pr" | "merged" | "refuted" | "review";

export const STATUS_KINDS: readonly StatusKind[] = [
  "none",
  "working",
  "ready",
  "proven",
  "pr",
  "merged",
  "refuted",
  "review",
];

export interface FindingStatus {
  kind: StatusKind;
  title: string;
}

function pullRequest(number: number | null): string {
  return number ? `Pull request #${number}` : "The pull request";
}

export function statusFor(progress: FindingProgress | null | undefined): FindingStatus {
  const fix = progress?.fix ?? null;
  const proof = progress?.proof ?? null;
  if (!fix) return { kind: "none", title: "No patch yet" };
  if (fix.status === "generating") return { kind: "working", title: "Writing the patch" };
  if (fix.status === "publishing") return { kind: "working", title: "Opening the pull request" };
  if (proof?.status === "running") return { kind: "working", title: "Proving the patch" };
  if (fix.status === "failed") return { kind: "review", title: "Needs review: the patch could not be written." };
  if (fix.status === "skipped") {
    return { kind: "review", title: "Needs review: there is no automatic patch for this finding." };
  }
  if (proof?.status === "settled" && proof.verdict === "refuted") {
    return { kind: "refuted", title: "Refuted: the proof shows this patch does not close the finding." };
  }
  if (fix.status === "closed") {
    return { kind: "review", title: `Needs review: ${pullRequest(fix.prNumber)} was closed without merging.` };
  }
  if (fix.status === "merged") return { kind: "merged", title: `Merged: ${pullRequest(fix.prNumber)}` };
  if (fix.status === "opened") return { kind: "pr", title: `${pullRequest(fix.prNumber)} is open for review` };
  if (proof?.status === "failed") return { kind: "review", title: "Needs review: the proof could not run." };
  if (proof?.status === "settled") {
    if (proof.verdict === "proven") {
      return { kind: "proven", title: "Proven: path closed, checked against the data itself." };
    }
    if (proof.verdict === "argued") {
      return {
        kind: "proven",
        title: "Argued: the replayed attack no longer works. A model's argument, not a runtime execution.",
      };
    }
    if (proof.verdict === "incomplete") {
      return { kind: "review", title: "Needs review: the proof is incomplete and one step still needs a person." };
    }
    if (proof.verdict === "unprovable") {
      return { kind: "ready", title: "Patch ready. There is no exploit to replay for this finding." };
    }
  }
  return { kind: "ready", title: "Patch ready, not proved yet" };
}

export const STATUS_WORDS: Record<StatusKind, string> = {
  none: "no patch yet",
  working: "in progress",
  ready: "patch ready",
  proven: "proven",
  pr: "pull request open",
  merged: "merged",
  refuted: "refuted",
  review: "need review",
};
