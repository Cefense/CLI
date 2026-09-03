import open from "open";
import type { Session } from "../core/session.js";
import type { Fix, Project } from "../core/types.js";
import type { BrowserAction, BrowserContext } from "../ui/browser.js";
import { confirmByTyping } from "../ui/prompts.js";
import { wrapText } from "../ui/format.js";
import * as out from "../ui/output.js";
import { c, glyph } from "../ui/theme.js";

export interface FixTarget {
  findingId: string;
  fix: Fix | null;
}

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
    case "failed":
      return c.red(`${glyph.cross} fix failed`);
    default:
      return c.dim(fix.status);
  }
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

export function renderFixSection(fix: Fix | null, width: number): string[] {
  const lines: string[] = [];
  const push = (value = "") => lines.push(value ? `  ${value}` : "");
  const body = Math.min(96, width - 4);

  push();
  push(c.dim("FIX"));
  push();

  if (!fix) {
    push(c.dim(`No patch has been generated. Press ${c.bold("g")} to generate one.`));
    push();
    return lines;
  }

  push(
    c.dim(
      [fix.filePath, `base ${fix.baseSha.slice(0, 7)}`].join("      "),
    ),
  );
  push();

  if (fix.status === "failed") {
    push(c.red(fix.error ?? "Generation failed."));
    push();
    return lines;
  }
  if (fix.status === "generating" || fix.status === "publishing") {
    push(c.cyan(`${fix.status}, this can take a minute.`));
    push();
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
  if (fix.prUrl) {
    push(`${c.dim("pull request")}  ${c.cyan(fix.prUrl)}`);
  } else {
    push(c.dim(`Press ${c.bold("p")} to open a pull request with this patch.`));
  }
  push();
  return lines;
}

async function pollUntilSettled<T>(
  session: Session,
  findingId: string,
  context: BrowserContext<T>,
): Promise<void> {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const { fix } = await session.client.fixForFinding(findingId).catch(() => ({ fix: null }));
    await context.refresh();
    if (!fix) continue;
    if (fix.status === "generating" || fix.status === "publishing") continue;
    context.setStatus(
      fix.status === "failed"
        ? `Generation failed: ${fix.error ?? "no reason given"}`
        : "Fix ready. Press p to open a pull request.",
    );
    return;
  }
  context.setStatus("Still working. Come back in a moment.");
}

export function fixActions<T>(
  session: Session,
  project: Project,
  target: (item: T | null) => FixTarget | null,
): BrowserAction<T>[] {
  return [
    {
      key: "g",
      label: (item) => {
        const found = target(item);
        if (!found) return null;
        const status = found.fix?.status;
        if (status === "generating" || status === "publishing") return null;
        if (status === "opened") return null;
        if (status === "failed") return "retry fix";
        if (status === "ready") return "regenerate";
        return "generate fix";
      },
      run: async (item, context) => {
        const found = target(item);
        if (!found) return;
        if (found.fix?.status === "generating") {
          context.setStatus("Already generating.");
          return;
        }
        context.setStatus("Requesting a fix.");
        await session.client.generateFix(found.findingId);
        await context.refresh();
        context.setStatus("Generating. This can take a minute.");
        await pollUntilSettled(session, found.findingId, context);
      },
    },
    {
      key: "p",
      label: (item) => {
        const status = target(item)?.fix?.status;
        if (status === "opened") return "view pull request";
        if (status === "ready") return "open pull request";
        return null;
      },
      run: async (item, context) => {
        const found = target(item);
        if (!found) return;

        if (found.fix?.status === "opened" && found.fix.prUrl) {
          void open(found.fix.prUrl).catch(() => undefined);
          context.setStatus(`Opened ${found.fix.prUrl}`);
          return;
        }
        if (found.fix?.status !== "ready") {
          context.setStatus("Generate a fix first with g, then publish it with p.");
          return;
        }

        const patch = found.fix;
        const confirmed = await context.suspend(async () => {
          out.line();
          out.warn(`This opens a real pull request on ${c.bold(project.fullName)}.`);
          out.hint(`Branch from ${patch.baseSha.slice(0, 7)}, patching ${patch.filePath}.`);
          out.line();
          return confirmByTyping({
            message: `Type ${project.name} to confirm`,
            expected: project.name,
          });
        });
        if (!confirmed) {
          context.setStatus("Nothing was published.");
          return;
        }

        context.setStatus("Opening a pull request.");
        const result = await session.client.publishFix(found.findingId);
        await context.refresh();
        context.setStatus(
          result.fix.prUrl ? `Opened ${result.fix.prUrl}` : "Published, but no URL was returned.",
        );
      },
    },
  ];
}
