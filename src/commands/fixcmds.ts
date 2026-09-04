import { compactFix, prune } from "../core/compact.js";
import { UsageError } from "../core/errors.js";
import { openSession, type GlobalOptions, type Session } from "../core/session.js";
import type { Finding, Fix } from "../core/types.js";
import { isAgentMode } from "../ui/mode.js";
import * as out from "../ui/output.js";
import { confirmByTyping, select, spinner } from "../ui/prompts.js";
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

async function pickOpenPullRequest(
  session: Session,
  globals: GlobalOptions,
): Promise<string | null> {
  const { project } = await resolveLinkedProject(session, globals);
  const response = await session.client.findings(project.githubRepoId);
  if (!response.scanId) return null;

  const { fixes } = await session.client
    .fixesForScan(response.scanId)
    .catch(() => ({ fixes: [] as Fix[] }));
  const open = fixes.filter((fix) => fix.status === "opened" && fix.prNumber);
  if (open.length === 0) {
    throw new UsageError(
      `No pull request is open for ${project.fullName}.`,
      "Run cf fix to generate and publish one.",
      "fix_not_published",
    );
  }

  const titles = new Map<string, Finding>(
    response.findings.map((finding) => [finding.id, finding]),
  );
  if (open.length === 1) return open[0]!.findingId;

  return await select({
    message: `Merge a pull request on ${project.fullName}`,
    choices: open.map((fix) => ({
      value: fix.findingId,
      label: `#${fix.prNumber}  ${titles.get(fix.findingId)?.title ?? fix.filePath}`,
      hint: fix.filePath,
    })),
  });
}

export async function fixMerge(
  globals: GlobalOptions,
  findingId: string | undefined,
  options: { method?: string; deleteBranch?: boolean } = {},
): Promise<number> {
  const session = await openSession(globals, { auth: true });

  if (!findingId) {
    if (!isInteractive()) {
      throw new UsageError(
        "cf fix merge needs a finding id when it cannot prompt.",
        "Pass one: cf fix merge <finding-id> --yes",
        "usage_error",
      );
    }
    const picked = await pickOpenPullRequest(session, globals);
    if (!picked) {
      out.line();
      out.info("Nothing to merge.");
      out.line();
      return 0;
    }
    findingId = picked;
  }

  const method = (options.method ?? "squash").toLowerCase();
  if (method !== "merge" && method !== "squash" && method !== "rebase") {
    throw new UsageError(
      `${options.method} is not a merge method.`,
      "Use merge, squash, or rebase.",
      "invalid_merge_method",
    );
  }

  const { fix } = await session.client.fixForFinding(findingId);
  if (!fix) {
    throw new UsageError(
      `No patch has been generated for ${findingId}.`,
      `Run cf fix generate ${findingId} --wait first.`,
      "fix_not_found",
    );
  }
  if (!fix.prNumber) {
    throw new UsageError(
      `No pull request has been opened for ${findingId}.`,
      `Run cf fix publish ${findingId} --yes first.`,
      "fix_not_published",
    );
  }

  if (!globals.yes) {
    if (!isInteractive()) {
      throw new UsageError(
        "Merging lands code on the repository's default branch.",
        `Pass --yes to confirm: cf fix merge ${findingId} --yes`,
        "confirmation_required",
      );
    }
    const { project } = await resolveLinkedProject(session, globals);
    out.line();
    out.warn(
      `This merges pull request #${fix.prNumber} into ${c.bold(project.defaultBranch ?? "the default branch")} of ${c.bold(project.fullName)}.`,
    );
    out.hint(`${method} merge of ${fix.filePath}${options.deleteBranch === false ? ", keeping the branch" : ", then delete the branch"}.`);
    if (fix.prUrl) out.hint(fix.prUrl);
    out.line();
    const confirmed = await confirmByTyping({
      message: `Type ${project.name} to confirm`,
      expected: project.name,
    });
    if (!confirmed) {
      out.line();
      out.info("Left open.");
      out.line();
      return 0;
    }
  }

  const progress = spinner();
  progress.start(`Merging pull request #${fix.prNumber}`);
  let result;
  try {
    result = await session.client.mergeFix(findingId, {
      method: method as "merge" | "squash" | "rebase",
      deleteBranch: options.deleteBranch !== false,
    });
  } catch (error) {
    progress.stop("Could not merge the pull request", "fail");
    throw error;
  }
  progress.stop(result.alreadyMerged ? "Already merged" : "Pull request merged");

  if (isAgentMode()) {
    out.agentEmit(
      prune({
        findingId,
        merged: result.merged,
        alreadyMerged: result.alreadyMerged,
        prNumber: fix.prNumber,
        prUrl: fix.prUrl,
        commitSha: result.commitSha,
        branch: fix.branch,
        branchDeleted: result.branchDeleted,
        fix: result.fix ? compactFix(result.fix) : null,
      }),
      [`cf scan --wait --agent`],
    );
    return 0;
  }

  if (out.isJsonMode()) {
    out.json(result);
    return 0;
  }

  out.line();
  out.success(
    result.alreadyMerged
      ? `Pull request #${fix.prNumber} was already merged`
      : `Merged pull request #${fix.prNumber}`,
  );
  if (result.branchDeleted && fix.branch) out.hint(`Deleted ${fix.branch}`);
  if (fix.prUrl) out.hint(fix.prUrl);
  out.line();
  out.info("Next: confirm the finding is gone");
  out.line(`    ${c.dim("cf scan --wait")}`);
  out.line();
  return 0;
}
