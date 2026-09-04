import { compactFix } from "../core/compact.js";
import { UsageError } from "../core/errors.js";
import { openSession, type GlobalOptions, type Session } from "../core/session.js";
import type { Fix } from "../core/types.js";
import { isAgentMode } from "../ui/mode.js";
import * as out from "../ui/output.js";
import { confirmByTyping, spinner } from "../ui/prompts.js";
import { isInteractive } from "../ui/screen.js";
import { c, glyph } from "../ui/theme.js";
import { renderDiff } from "./fixactions.js";
import { resolveLinkedProject } from "./link.js";

const SETTLED = new Set(["ready", "failed", "skipped", "opened"]);

async function waitForFix(
  session: Session,
  findingId: string,
  attempts = 90,
): Promise<Fix | null> {
  let latest: Fix | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const { fix } = await session.client
      .fixForFinding(findingId)
      .catch(() => ({ fix: null as Fix | null }));
    latest = fix;
    if (fix && SETTLED.has(fix.status)) return fix;
  }
  return latest;
}

function renderFix(fix: Fix): void {
  out.line();
  out.line(`  ${c.bold(fix.filePath)}   ${c.dim(`base ${fix.baseSha.slice(0, 7)}`)}`);
  out.line();
  if (fix.status === "failed") {
    out.line(`  ${c.red(fix.error ?? "Generation failed.")}`);
    out.line();
    return;
  }
  if (fix.diff) {
    for (const diffLine of renderDiff(fix.diff).slice(0, 200)) out.line(`  ${diffLine}`);
    out.line();
  }
  if (fix.explanation) {
    out.line(`  ${c.dim(fix.explanation)}`);
    out.line();
  }
  if (fix.prUrl) {
    out.line(`  ${c.dim("pull request")}  ${c.cyan(fix.prUrl)}`);
    out.line();
  }
}

export async function fixShow(globals: GlobalOptions, findingId: string): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const { fix } = await session.client.fixForFinding(findingId);

  if (isAgentMode()) {
    out.agentEmit(
      { findingId, fix: fix ? compactFix(fix, { diff: true }) : null },
      fix?.status === "ready"
        ? [`cf fix publish ${findingId} --yes --agent`]
        : fix
          ? []
          : [`cf fix generate ${findingId} --wait --agent`],
    );
    return 0;
  }

  if (out.isJsonMode()) {
    out.json({ findingId, fix });
    return 0;
  }

  if (!fix) {
    out.line();
    out.info("No fix has been generated for that finding.");
    out.hint(`cf fix generate ${findingId}`);
    out.line();
    return 0;
  }

  renderFix(fix);
  return 0;
}

export async function fixGenerate(
  globals: GlobalOptions,
  findingId: string,
  options: { wait?: boolean } = {},
): Promise<number> {
  const session = await openSession(globals, { auth: true });

  const existing = await session.client
    .fixForFinding(findingId)
    .catch(() => ({ fix: null as Fix | null }));
  if (existing.fix?.status === "generating" || existing.fix?.status === "publishing") {
    throw new UsageError(
      `A fix for ${findingId} is already ${existing.fix.status}.`,
      `Run cf fix show ${findingId} to check on it.`,
      "fix_in_progress",
    );
  }

  const progress = spinner();
  progress.start("Generating a patch");
  let fix: Fix;
  try {
    const result = await session.client.generateFix(findingId);
    fix = result.fix;
  } catch (error) {
    progress.stop("Could not generate a patch", "fail");
    throw error;
  }

  if (options.wait) {
    progress.message("Generating a patch, this can take a minute");
    fix = (await waitForFix(session, findingId)) ?? fix;
  }
  progress.stop(
    fix.status === "failed" ? "Generation failed" : "Patch generated",
    fix.status === "failed" ? "fail" : "ok",
  );

  if (isAgentMode()) {
    out.agentEmit(
      { findingId, fix: compactFix(fix, { diff: true }) },
      fix.status === "ready"
        ? [`cf fix publish ${findingId} --yes --agent`]
        : fix.status === "generating"
          ? [`cf fix show ${findingId} --agent`]
          : [],
    );
    return 0;
  }

  if (out.isJsonMode()) {
    out.json({ findingId, fix });
    return 0;
  }

  renderFix(fix);
  if (fix.status === "ready") {
    out.info("Next: open a pull request");
    out.line(`    ${c.dim(`cf fix publish ${findingId}`)}`);
    out.line();
  }
  return 0;
}

export async function fixPublish(globals: GlobalOptions, findingId: string): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const { fix } = await session.client.fixForFinding(findingId);

  if (!fix) {
    throw new UsageError(
      `No patch has been generated for ${findingId}.`,
      `Run cf fix generate ${findingId} --wait first.`,
      "fix_not_found",
    );
  }
  if (fix.status === "opened") {
    if (isAgentMode()) {
      out.agentEmit({ findingId, alreadyOpen: true, fix: compactFix(fix) });
      return 0;
    }
    out.line();
    out.info(`Already open: ${fix.prUrl ?? "pull request"}`);
    out.line();
    return 0;
  }
  if (fix.status !== "ready") {
    throw new UsageError(
      `The patch for ${findingId} is ${fix.status}, so it cannot be published.`,
      fix.status === "failed"
        ? `Run cf fix generate ${findingId} --wait to try again.`
        : `Run cf fix show ${findingId} to check on it.`,
      "fix_not_ready",
    );
  }

  if (!globals.yes) {
    if (!isInteractive()) {
      throw new UsageError(
        "Publishing opens a real pull request on GitHub.",
        `Pass --yes to confirm: cf fix publish ${findingId} --yes`,
        "confirmation_required",
      );
    }
    const { project } = await resolveLinkedProject(session, globals);
    out.line();
    out.warn(`This opens a real pull request on ${c.bold(project.fullName)}.`);
    out.hint(`Branch from ${fix.baseSha.slice(0, 7)}, patching ${fix.filePath}.`);
    out.line();
    const confirmed = await confirmByTyping({
      message: `Type ${project.name} to confirm`,
      expected: project.name,
    });
    if (!confirmed) {
      out.line();
      out.info("Nothing was published.");
      out.line();
      return 0;
    }
  }

  const progress = spinner();
  progress.start("Opening a pull request");
  let published: Fix;
  try {
    const result = await session.client.publishFix(findingId);
    published = result.fix;
  } catch (error) {
    progress.stop("Could not open a pull request", "fail");
    throw error;
  }
  progress.stop(published.prUrl ? `Opened ${published.prUrl}` : "Published");

  if (isAgentMode()) {
    out.agentEmit({ findingId, fix: compactFix(published) });
    return 0;
  }

  if (out.isJsonMode()) {
    out.json({ findingId, fix: published });
    return 0;
  }

  out.line();
  out.success(`${glyph.check} ${published.prUrl ?? "Pull request opened"}`);
  out.line();
  return 0;
}
