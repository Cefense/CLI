import type { Fix } from "../core/types.js";
import type { FindingStatus, StatusKind } from "../core/findingStatus.js";
import { relativeTime, truncate, wrapText } from "../ui/format.js";
import { BODY_INDENT, heading, joinDots, readingWidth } from "../ui/detail.js";
import { badge, c, glyph, stateWord, type Tone } from "../ui/theme.js";

function pr(prNumber: number | null | undefined, rest: string, bare: string): string {
  return prNumber ? `PR #${prNumber} ${rest}` : bare;
}

export function fixTone(fix: Fix | null): Tone {
  if (!fix) return "none";
  switch (fix.status) {
    case "generating":
    case "publishing":
      return "running";
    case "ready":
    case "opened":
      return "open";
    case "merged":
      return "done";
    case "closed":
    case "skipped":
      return "attention";
    case "failed":
      return "failed";
    default:
      return "none";
  }
}

export function fixWord(fix: Fix | null): string {
  if (!fix) return "no patch yet";
  switch (fix.status) {
    case "generating":
      return "writing patch";
    case "ready":
      return "patch ready";
    case "publishing":
      return "opening PR";
    case "opened":
      return pr(fix.prNumber, "open", "PR open");
    case "merged":
      return pr(fix.prNumber, "merged", "merged");
    case "closed":
      return pr(fix.prNumber, "closed", "PR closed");
    case "failed":
      return "patch failed";
    case "skipped":
      return "no automatic patch";
    default:
      return fix.status;
  }
}

export function fixLabel(fix: Fix | null): string {
  return badge(fixTone(fix), fixWord(fix));
}

const KIND_TONES: Record<StatusKind, Tone> = {
  none: "none",
  working: "running",
  ready: "open",
  proven: "done",
  pr: "open",
  merged: "done",
  refuted: "failed",
  review: "attention",
};

const KIND_WORDS: Record<StatusKind, string> = {
  none: "no patch yet",
  working: "in progress",
  ready: "patch ready",
  proven: "proven",
  pr: "PR open",
  merged: "merged",
  refuted: "not fixed",
  review: "needs review",
};

export function statusTone(status: FindingStatus): Tone {
  return KIND_TONES[status.kind];
}

export function statusWord(status: FindingStatus, prNumber?: number | null): string {
  if (status.kind === "pr") return pr(prNumber, "open", KIND_WORDS.pr);
  if (status.kind === "merged") return pr(prNumber, "merged", KIND_WORDS.merged);
  return KIND_WORDS[status.kind];
}

export function statusLabel(status: FindingStatus, prNumber?: number | null): string {
  return badge(statusTone(status), statusWord(status, prNumber));
}

export function statusState(status: FindingStatus, prNumber?: number | null): string {
  return stateWord(statusTone(status), statusWord(status, prNumber));
}

export function behaviorLine(fix: Fix): string | null {
  if (fix.behaviorChange === "removed") {
    return c.yellow(`${glyph.warn} This patch removes behavior legitimate callers relied on.`);
  }
  if (fix.behaviorChange === "narrowed") {
    return c.yellow(`${glyph.warn} This patch narrows what legitimate callers can do.`);
  }
  return null;
}

export function renderDiff(diff: string, width?: number): string[] {
  return diff
    .replace(/\s+$/, "")
    .split("\n")
    .map((raw) => {
      const line = raw.replace(/\t/g, "  ");
      const clipped = width ? truncate(line, width) : line;
      if (line.startsWith("+++") || line.startsWith("---")) return c.dim(clipped);
      if (line.startsWith("@@")) return c.cyan(clipped);
      if (line.startsWith("+")) return c.green(clipped);
      if (line.startsWith("-")) return c.red(clipped);
      return clipped;
    });
}

export function fixFiles(fix: Fix): string[] {
  const files = (fix.files ?? []).map((file) => file.path);
  return files.length > 0 ? files : [fix.filePath];
}

export function fixSummary(fix: Fix): string {
  const files = fixFiles(fix);
  return joinDots([
    fixLabel(fix),
    files.length > 1 ? `${files.length} files` : files[0],
    c.dim(`base ${fix.baseSha.slice(0, 7)}`),
    c.dim(relativeTime(fix.updatedAt)),
  ]);
}

export function renderFixSection(fix: Fix | null, width: number, status?: FindingStatus): string[] {
  const body = readingWidth(width);
  const lines: string[] = ["", heading("Fix")];
  const push = (value = "") => lines.push(value ? `${BODY_INDENT}${value}` : "");

  if (!fix) {
    push(c.dim("No patch has been generated."));
    return lines;
  }

  push(fixSummary(fix));
  if (status && status.kind !== "none") push(c.dim(status.title));

  if (fix.status === "failed") {
    push();
    push(c.red(fix.error ?? "The patch could not be written."));
    return lines;
  }
  if (fix.status === "generating" || fix.status === "publishing") {
    push();
    push(c.cyan(fix.status === "generating" ? "Writing the patch, this can take a minute." : "Opening the pull request."));
    return lines;
  }

  if (fix.diff) {
    push();
    const diff = renderDiff(fix.diff, body);
    for (const line of diff.slice(0, 120)) push(line);
    if (diff.length > 120) push(c.dim(`${diff.length - 120} more lines, run cf fix show to read the whole patch`));
  }
  if (fix.explanation) {
    push();
    for (const wrapped of wrapText(fix.explanation, body)) push(wrapped);
  }
  const behavior = behaviorLine(fix);
  if (behavior) {
    push();
    push(behavior);
    if (fix.behaviorNote) for (const wrapped of wrapText(fix.behaviorNote, body - 2)) push(c.dim(`  ${wrapped}`));
  }
  if (fix.prUrl) {
    push();
    push(`${c.dim("Pull request")}  ${fix.prUrl}`);
  }
  return lines;
}
