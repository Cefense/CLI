import type { Fix } from "../core/types.js";
import { STATUS_WORDS, type FindingStatus } from "../core/findingStatus.js";
import { shortId, wrapText } from "../ui/format.js";
import { c, glyph } from "../ui/theme.js";

export function fixLabel(fix: Fix | null): string {
  if (!fix) return c.dim("no fix yet");
  switch (fix.status) {
    case "generating":
      return c.cyan(`${glyph.pulse} generating`);
    case "ready":
      return c.green(`${glyph.check} fix ready`);
    case "publishing":
      return c.cyan(`${glyph.pulse} publishing`);
    case "opened":
      return c.green(fix.prNumber ? `${glyph.check} PR #${fix.prNumber}` : `${glyph.check} PR open`);
    case "merged":
      return c.green(fix.prNumber ? `${glyph.check} PR #${fix.prNumber} merged` : `${glyph.check} merged`);
    case "closed":
      return c.yellow(fix.prNumber ? `${glyph.ring} PR #${fix.prNumber} closed` : `${glyph.ring} PR closed`);
    case "failed":
      return c.red(`${glyph.cross} fix failed`);
    default:
      return c.dim(fix.status);
  }
}

export function statusLabel(status: FindingStatus, prNumber?: number | null): string {
  const word = STATUS_WORDS[status.kind];
  switch (status.kind) {
    case "working":
      return c.cyan(`${glyph.pulse} ${word}`);
    case "ready":
      return c.green(`${glyph.ring} ${word}`);
    case "proven":
      return c.green(`${glyph.check} ${word}`);
    case "pr":
      return c.green(prNumber ? `${glyph.check} PR #${prNumber} open` : `${glyph.check} ${word}`);
    case "merged":
      return c.green(prNumber ? `${glyph.check} PR #${prNumber} merged` : `${glyph.check} ${word}`);
    case "refuted":
      return c.red(`${glyph.cross} ${word}`);
    case "review":
      return c.yellow(`${glyph.warn} ${word}`);
    default:
      return c.dim(word);
  }
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

export function renderDiff(diff: string): string[] {
  return diff.split("\n").map((line) => {
    if (line.startsWith("+++") || line.startsWith("---")) return c.dim(line);
    if (line.startsWith("@@")) return c.cyan(line);
    if (line.startsWith("+")) return c.green(line);
    if (line.startsWith("-")) return c.red(line);
    return line;
  });
}

export function renderFixSection(fix: Fix | null, width: number, findingId?: string): string[] {
  const lines: string[] = [];
  const head = (value = "") => lines.push(value);
  const push = (value = "") => lines.push(value ? `  ${value}` : "");
  const body = Math.min(96, width - 2);
  const marker = findingId ? shortId(findingId) : "<finding-id>";

  head();
  head(c.bold("Fix"));

  if (!fix) {
    push(c.dim("No patch has been generated."));
    push(c.dim(`cf fix generate ${marker}`));
    return lines;
  }

  const files = (fix.files ?? []).map((file) => file.path);
  push(
    c.dim(
      files.length > 1
        ? `${files.length} files ${glyph.sep} base ${fix.baseSha.slice(0, 7)}`
        : `${fix.filePath} ${glyph.sep} base ${fix.baseSha.slice(0, 7)}`,
    ),
  );
  if (files.length > 1) for (const path of files) push(c.dim(`  ${path}`));
  push();

  if (fix.status === "failed") {
    push(c.red(fix.error ?? "Generation failed."));
    push(c.dim(`cf fix generate ${marker}`));
    return lines;
  }
  if (fix.status === "generating" || fix.status === "publishing") {
    push(c.cyan(`${fix.status}, this can take a minute.`));
    push(c.dim(`cf fix show ${marker}`));
    return lines;
  }

  if (fix.diff) {
    for (const line of renderDiff(fix.diff).slice(0, 120)) push(line);
    push();
  }
  if (fix.explanation) {
    for (const wrapped of wrapText(fix.explanation, body)) push(c.dim(wrapped));
    push();
  }
  const behavior = behaviorLine(fix);
  if (behavior) {
    push(behavior);
    if (fix.behaviorNote) for (const wrapped of wrapText(fix.behaviorNote, body - 2)) push(c.dim(`  ${wrapped}`));
    push();
  }
  if (fix.prUrl) {
    push(`${c.dim("pull request")}  ${c.cyan(fix.prUrl)}`);
  } else {
    push(c.dim(`cf fix publish ${marker}   open a pull request with this patch`));
  }
  return lines;
}
