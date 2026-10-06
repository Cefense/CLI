import { compactFix, prune } from "../core/compact.js";
import { UsageError } from "../core/errors.js";
import { openSession, type GlobalOptions, type Session } from "../core/session.js";
import type { Finding, Fix, Project } from "../core/types.js";
import { isAgentMode } from "../ui/mode.js";
import * as out from "../ui/output.js";
import { confirmByTyping, select, spinner } from "../ui/prompts.js";
import { isInteractive } from "../ui/screen.js";
import { c, displaySeverity, severityColor, stateWord } from "../ui/theme.js";
import { behaviorLine, fixFiles, fixTone, fixWord, renderDiff } from "./fixactions.js";
import { resolveLinkedProject } from "./link.js";
import { resolveFindingId } from "./reproduced.js";
import { CODE_HOSTS, openIfRequested } from "../ui/open.js";
import { datedLabel, relativeTime, shortId, terminalWidth } from "../ui/format.js";
import { hintLine, hintLines, type NextStep } from "../ui/list.js";
import { details } from "../ui/table.js";
import { page } from "../ui/pager.js";
import { BODY_INDENT, heading, indent, joinDots, paragraph, readingWidth, titleLine, viewOn } from "../ui/detail.js";
import { providerLabel, providerOf } from "../core/providers.js";

const SETTLED = new Set(["ready", "failed", "skipped", "opened", "merged", "closed"]);

function fixNext(findingId: string, repo: string, fix: Fix | null): string[] {
  if (!fix || fix.status === "failed" || fix.status === "skipped") {
    return [`cf fix generate ${findingId} ${repo} --wait --agent`];
  }
  if (fix.status === "ready") {
    return [`cf proof show ${findingId} ${repo} --agent`, `cf fix publish ${findingId} ${repo} --yes --agent`];
  }
  if (fix.status === "generating" || fix.status === "publishing") return [`cf fix show ${findingId} ${repo} --agent`];
  return [];
}

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

function fixHint(fix: Fix, findingId: string, flag: string): NextStep | null {
  const id = shortId(findingId);
  if (fix.status === "ready") return { command: `cf fix publish ${id}${flag}`, purpose: "open a pull request with this patch" };
  if (fix.status === "opened") return { command: `cf fix merge ${id}${flag}`, purpose: "merge the pull request" };
  if (fix.status === "failed" || fix.status === "closed") return { command: `cf fix generate ${id}${flag}`, purpose: "write the patch again" };
  if (fix.status === "generating" || fix.status === "publishing") return { command: `cf fix show ${id}${flag}`, purpose: "check on it" };
  if (fix.status === "merged") return { command: `cf scan${flag}`, purpose: "confirm the finding is gone" };
  return null;
}

function fixDetail(
  fix: Fix,
  finding: Finding | null,
  options: { flag: string; host: string; next?: boolean },
): string[] {
  const width = terminalWidth();
  const body = readingWidth(width);
  const files = fixFiles(fix);
  const lines: string[] = [
    titleLine(finding ? `Patch for ${finding.title}` : `Patch for ${fix.filePath}`, shortId(fix.findingId)),
    joinDots([
      stateWord(fixTone(fix), fixWord(fix)),
      finding ? severityColor(finding.severity)(displaySeverity(finding.severity)) : null,
      files.length > 1 ? `${files.length} files` : files[0],
      c.dim(`updated ${relativeTime(fix.updatedAt)}`),
    ]),
    "",
    ...details([
      ["Files", files.join(", ")],
      ["Base", fix.baseSha.slice(0, 7)],
      ["Branch", fix.branch],
      ["Strategy", fix.strategy === "dependency" ? "dependency upgrade" : fix.model ? `model, ${fix.model}` : "model"],
      ["Updated", datedLabel(fix.updatedAt)],
    ]),
  ];

  if (fix.status === "failed") {
    lines.push("", heading("Error"), ...paragraph(fix.error ?? "The patch could not be written.", body, c.red));
  } else if (fix.status === "generating") {
    lines.push("", `${BODY_INDENT}${c.cyan("Writing the patch, this can take a minute.")}`);
  }

  if (fix.diff) {
    const diff = renderDiff(fix.diff, body);
    lines.push("", heading("Diff"), ...indent(diff.slice(0, 400)));
    if (diff.length > 400) lines.push(`${BODY_INDENT}${c.dim(`${diff.length - 400} more lines`)}`);
  }
  if (fix.explanation) lines.push("", heading("Why this patch"), ...paragraph(fix.explanation, body));

  const behavior = behaviorLine(fix);
  if (behavior) {
    lines.push("", `${BODY_INDENT}${behavior}`);
    if (fix.behaviorNote) lines.push(...paragraph(fix.behaviorNote, body - 2, c.dim).map((value) => `  ${value}`));
  }

  lines.push("");
  const step = options.next === false ? null : fixHint(fix, fix.findingId, options.flag);
  const hint = hintLine(step);
  if (hint) lines.push(hint);
  const view = viewOn("pull request", options.host, fix.prUrl);
  if (view) lines.push(view);
  lines.push("");
  return lines;
}

async function findingFor(session: Session, project: Project, findingId: string): Promise<Finding | null> {
  return session.client
    .findings(project.githubRepoId)
    .then((response) => response.findings.find((entry) => entry.id === findingId) ?? null)
    .catch(() => null);
}

async function resolveFinding(
  session: Session,
  globals: GlobalOptions,
  candidate: string,
): Promise<{ findingId: string; repo: string }> {
  const { project } = await resolveLinkedProject(session, globals);
  return { findingId: await resolveFindingId(session, project, candidate), repo: `--repo ${project.fullName}` };
}

export async function fixShow(globals: GlobalOptions, findingId: string): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const { project } = await resolveLinkedProject(session, globals);
  findingId = await resolveFindingId(session, project, findingId);
  const located = { findingId, repo: `--repo ${project.fullName}` };
  const { fix } = await session.client.fixForFinding(findingId);

  if (isAgentMode()) {
    out.agentEmit(
      { findingId, fix: fix ? compactFix(fix, { diff: true }) : null },
      fixNext(findingId, located.repo, fix),
    );
    return 0;
  }

  if (out.isJsonMode()) {
    out.json({ findingId, fix });
    return 0;
  }

  const flag = globals.repo ? ` --repo ${project.fullName}` : "";
  if (!fix) {
    out.line();
    out.info("No patch has been written for that finding yet.");
    out.lines(hintLines([{ command: `cf fix generate ${shortId(findingId)}${flag}`, purpose: "write one" }]));
    out.line();
    return 0;
  }

  if (await openIfRequested(globals.web, fix.prUrl, { hosts: CODE_HOSTS, what: "this fix" })) {
    return 0;
  }

  const finding = await findingFor(session, project, findingId);
  page(fixDetail(fix, finding, { flag, host: providerLabel(providerOf(project)) }));
  return 0;
}

export async function fixGenerate(
  globals: GlobalOptions,
  findingId: string,
  options: { wait?: boolean } = {},
): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const { project } = await resolveLinkedProject(session, globals);
  findingId = await resolveFindingId(session, project, findingId);
  const located = { findingId, repo: `--repo ${project.fullName}` };

  const existing = await session.client
    .fixForFinding(findingId)
    .catch(() => ({ fix: null as Fix | null }));
  if (existing.fix?.status === "generating" || existing.fix?.status === "publishing") {
    throw new UsageError(
      `A fix for ${findingId} is already ${existing.fix.status}.`,
      `Run cf fix show ${findingId} ${located.repo} to check on it.`,
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
    out.agentEmit({ findingId, fix: compactFix(fix, { diff: true }) }, fixNext(findingId, located.repo, fix));
    return 0;
  }

  if (out.isJsonMode()) {
    out.json({ findingId, fix });
    return 0;
  }

  const finding = await findingFor(session, project, findingId);
  out.line();
  page(fixDetail(fix, finding, { flag: globals.repo ? ` --repo ${project.fullName}` : "", host: providerLabel(providerOf(project)) }));
  return 0;
}

export async function fixPublish(globals: GlobalOptions, findingId: string): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const located = await resolveFinding(session, globals, findingId);
  findingId = located.findingId;
  const { fix } = await session.client.fixForFinding(findingId);

  if (!fix) {
    throw new UsageError(
      `No patch has been generated for ${findingId}.`,
      `Run cf fix generate ${findingId} ${located.repo} --wait first.`,
      "fix_not_found",
    );
  }
  if (fix.status === "opened") {
    if (isAgentMode()) {
      out.agentEmit({ findingId, alreadyOpen: true, fix: compactFix(fix) }, fixNext(findingId, located.repo, fix));
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
        ? `Run cf fix generate ${findingId} ${located.repo} --wait to try again.`
        : `Run cf fix show ${findingId} ${located.repo} to check on it.`,
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
    out.agentEmit({ findingId, fix: compactFix(published) }, fixNext(findingId, located.repo, published));
    return 0;
  }

  if (out.isJsonMode()) {
    out.json({ findingId, fix: published });
    return 0;
  }

  out.line();
  out.success(published.prNumber ? `Opened pull request #${published.prNumber}` : "Opened a pull request");
  if (published.prUrl) out.hint(published.prUrl);
  out.lines(
    hintLines([
      { command: `cf fix merge ${shortId(findingId)}${globals.repo ? ` --repo ${globals.repo}` : ""}`, purpose: "merge it once it is reviewed" },
    ]),
  );
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
  let repo: string | null = null;
  if (findingId) {
    const located = await resolveFinding(session, globals, findingId);
    findingId = located.findingId;
    repo = located.repo;
  }

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
      `Run cf fix generate ${findingId}${repo ? ` ${repo}` : ""} --wait first.`,
      "fix_not_found",
    );
  }
  if (!fix.prNumber) {
    throw new UsageError(
      `No pull request has been opened for ${findingId}.`,
      `Run cf fix publish ${findingId}${repo ? ` ${repo}` : ""} --yes first.`,
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
      [repo ? `cf scan ${repo} --wait --agent` : ""],
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
  out.lines(hintLines([{ command: "cf scan --wait", purpose: "confirm the finding is gone" }]));
  out.line();
  return 0;
}
