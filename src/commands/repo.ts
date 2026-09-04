import open from "open";
import { openSession, type GlobalOptions, type Session } from "../core/session.js";
import { clearRepoDefault, readRepoDefault, writeRepoDefault } from "../core/config.js";
import { CefenseError, UsageError } from "../core/errors.js";
import { defaultScope, gitRemote, gitToplevel, matchProject, parseRepoArgument, resolveProject } from "../core/repo.js";
import type { GithubRepo, Project } from "../core/types.js";
import * as out from "../ui/output.js";
import { confirm, confirmByTyping, multiselect, spinner } from "../ui/prompts.js";
import { renderTable } from "../ui/table.js";
import { relativeTime, terminalWidth } from "../ui/format.js";
import { c, glyph, scanStatusLabel } from "../ui/theme.js";
import { pickProject } from "./pick.js";
import { watchScan } from "./scan.js";
import { isAgentMode } from "../ui/mode.js";
import { compactProject } from "../core/compact.js";

async function ensureGithubConnected(session: Session, assumeYes: boolean): Promise<void> {
  const status = await session.client.githubStatus();
  if (status.connected) return;

  if (!status.configured) {
    throw new CefenseError("GitHub is not configured on this Cefense instance.", {
      remedy: "Run cf status for the full picture.",
    });
  }

  const webUrl = session.config?.webUrl ?? session.apiUrl;
  const target = `${webUrl}/app/repositories`;

  out.line();
  out.warn("Your GitHub account is not connected to Cefense.");
  out.line();
  out.line(`    ${c.cyan(target)}`);
  out.line();

  if (!assumeYes) {
    const proceed = await confirm({
      message: "Open that page in your browser now?",
      initialValue: true,
      assumeYes,
    });
    if (!proceed) {
      throw new UsageError("GitHub must be connected before a repository can be added.");
    }
  }

  void open(target).catch(() => undefined);

  const progress = spinner();
  progress.start("Waiting for the GitHub connection");
  const deadline = Date.now() + 5 * 60_000;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const next = await session.client.githubStatus().catch(() => null);
    if (next?.connected) {
      progress.stop(`GitHub connected as ${next.login}`);
      return;
    }
    if (Date.now() > deadline) {
      progress.stop("Gave up waiting for the GitHub connection.", "fail");
      throw new CefenseError("GitHub was not connected in time.", {
        remedy: `Finish the connection at ${target}, then run cf repo connect again.`,
      });
    }
  }
}

export async function repoConnect(
  globals: GlobalOptions,
  target: string | undefined,
  options: { watch?: boolean } = {},
): Promise<number> {
  const session = await openSession(globals, { auth: true });
  await ensureGithubConnected(session, Boolean(globals.yes));

  const listing = await session.client.githubRepos();
  if (listing.needsReconnect) {
    throw new CefenseError("Your GitHub connection has expired.", {
      remedy: `Reconnect at ${session.config?.webUrl ?? session.apiUrl}/app/repositories.`,
    });
  }

  let chosen: GithubRepo[] = [];

  if (target) {
    const wanted = parseRepoArgument(target)?.fullName.toLowerCase() ?? target.toLowerCase();
    const repo = listing.repos.find((entry) => entry.fullName.toLowerCase() === wanted);
    if (!repo) {
      throw new UsageError(
        `${target} is not available to Cefense on GitHub.`,
        listing.manageUrl
          ? `Check the spelling, or grant access at ${listing.manageUrl}.`
          : "Check the spelling, or grant Cefense access to it on GitHub.",
      );
    }
    if (repo.connected) {
      out.line();
      out.info(`${c.bold(repo.fullName)} is already connected.`);
      out.line();
      return 0;
    }
    chosen = [repo];
  } else {
    const available = listing.repos.filter((repo) => !repo.connected);
    if (available.length === 0) {
      out.line();
      out.info("Every repository Cefense can see is already connected.");
      if (listing.manageUrl) out.hint(`Grant access to more at ${listing.manageUrl}`);
      out.line();
      return 0;
    }

    const remote = gitRemote();
    const suggested = remote
      ? available.find((repo) => repo.fullName.toLowerCase() === remote.fullName.toLowerCase())
      : undefined;

    const picked = await multiselect({
      message: `Connect a repository${listing.login ? `   ${listing.login}` : ""}`,
      choices: available.map((repo) => ({
        value: repo.githubRepoId,
        label: repo.fullName,
        hint: [repo.private ? "private" : "public", repo.defaultBranch ?? undefined]
          .filter(Boolean)
          .join("  "),
      })),
      initialValues: suggested ? [suggested.githubRepoId] : [],
      required: true,
    });
    chosen = available.filter((repo) => picked.includes(repo.githubRepoId));
  }

  if (chosen.length === 0) {
    out.line();
    out.info("Nothing selected.");
    out.line();
    return 0;
  }

  out.line();
  const connected: Array<{ project: Project; scanId: string | null }> = [];
  for (const repo of chosen) {
    try {
      const result = await session.client.connectRepo(repo);
      out.success(`Connected ${c.bold(repo.fullName)}`);
      connected.push({ project: result.project, scanId: result.scanId });
    } catch (error) {
      if (error instanceof CefenseError && /token is unavailable|GitHub connection/i.test(error.message)) {
        out.success(`Connected ${c.bold(repo.fullName)}`);
        out.warn("The scan did not start: your GitHub connection has expired.");
        out.hint(`Reconnect at ${session.config?.webUrl ?? session.apiUrl}/app/repositories`);
        continue;
      }
      throw error;
    }
  }

  if (isAgentMode()) {
    out.agentEmit(
      {
        connected: connected.map((entry) => ({
          repository: entry.project.fullName,
          scanId: entry.scanId,
        })),
      },
      connected[0] ? [`cf observed --repo ${connected[0].project.fullName} --agent`] : [],
    );
    return 0;
  }

  if (out.isJsonMode()) {
    out.json(connected.map((entry) => ({ repository: entry.project.fullName, scanId: entry.scanId })));
    return 0;
  }

  const scope = defaultScope();
  if (connected.length === 1 && gitToplevel() && !readRepoDefault(scope)) {
    const only = connected[0]!.project;
    writeRepoDefault(scope, { githubRepoId: only.githubRepoId, fullName: only.fullName });
    out.hint(`Set as the default repository for ${scope}`);
  }

  if (options.watch !== false) {
    for (const entry of connected) {
      if (!entry.scanId) continue;
      out.line();
      await watchScan(session.client, entry.project.githubRepoId, entry.project.fullName);
    }
  }

  out.line();
  out.info("Next: review the findings");
  out.line(`    ${c.dim("cf observed")}`);
  out.line();
  return 0;
}

export async function repoList(globals: GlobalOptions): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const { projects } = await session.client.projects();

  if (isAgentMode()) {
    out.agentEmit(
      { repositories: projects.map(compactProject) },
      projects[0]
        ? [`cf observed --repo ${projects[0].fullName} --agent`]
        : ["cf repo connect <owner/name>"],
    );
    return 0;
  }

  if (out.isJsonMode()) {
    out.json(projects);
    return 0;
  }

  if (projects.length === 0) {
    out.line();
    out.info("No repositories are connected.");
    out.hint("Run cf repo connect.");
    out.line();
    return 0;
  }

  const scope = defaultScope();
  const fallback = readRepoDefault(scope);

  out.line();
  out.lines(
    renderTable(
      projects,
      [
        {
          header: "",
          value: (project) =>
            fallback?.githubRepoId === project.githubRepoId ? c.cyan(glyph.arrow) : " ",
          min: 1,
          max: 1,
        },
        { header: "repository", value: (project) => project.fullName, min: 16 },
        { header: "visibility", value: (project) => (project.private ? "private" : "public"), min: 7 },
        { header: "status", value: (project) => scanStatusLabel(project.scan?.status), min: 8 },
        {
          header: "findings",
          value: (project) => (project.scan ? String(project.scan.findingCount) : "-"),
          align: "right",
          min: 5,
        },
        {
          header: "last scan",
          value: (project) =>
            project.scan ? relativeTime(project.scan.finishedAt ?? project.scan.createdAt) : "never",
          min: 9,
        },
      ],
      { width: terminalWidth() - 4 },
    ).map((row) => `  ${row}`),
  );
  out.line();
  return 0;
}

export async function repoSetDefault(
  globals: GlobalOptions,
  target: string | undefined,
  options: { unset?: boolean } = {},
): Promise<number> {
  const scope = defaultScope();

  if (options.unset) {
    const cleared = clearRepoDefault(scope);
    if (isAgentMode()) {
      out.agentEmit({ scope, cleared, unset: true });
      return 0;
    }
    out.line();
    if (cleared) out.success(`Cleared the default repository for ${scope}`);
    else out.info(`No default repository was set for ${scope}`);
    out.line();
    return 0;
  }

  const session = await openSession(globals, { auth: true });
  const { projects } = await session.client.projects();
  if (projects.length === 0) {
    throw new UsageError("No repositories are connected yet.", "Run cf repo connect.");
  }

  let project: Project | null = null;

  if (target) {
    project = matchProject(projects, target);
    if (!project) {
      throw new UsageError(`${target} is not connected to Cefense.`, `Run cf repo connect ${target}.`);
    }
  } else {
    const toplevel = gitToplevel();
    const remote = gitRemote();
    const suggested = remote ? matchProject(projects, remote.fullName) : null;

    out.line();
    if (toplevel && remote) {
      out.info(`${c.bold(toplevel)} is a git repository`);
      out.hint(`origin  ${remote.fullName}`);
      out.line();
    }

    if (suggested) {
      const accept = await confirm({
        message: `Use ${suggested.fullName} as the default here?`,
        initialValue: true,
        assumeYes: globals.yes,
      });
      project = accept ? suggested : await pickProject(projects, "Which repository should be the default here?");
    } else {
      project = await pickProject(projects, "Which repository should be the default here?");
    }
  }

  if (!project) {
    out.info("Nothing selected.");
    return 0;
  }

  writeRepoDefault(scope, { githubRepoId: project.githubRepoId, fullName: project.fullName });

  if (isAgentMode()) {
    out.agentEmit({ scope, repository: project.fullName, unset: false }, ["cf observed --agent"]);
    return 0;
  }

  out.line();
  out.success(`Default set: ${c.bold(project.fullName)}`);
  out.hint(`Stored for ${scope}`);
  out.line();
  return 0;
}

export async function repoDisconnect(
  globals: GlobalOptions,
  target: string | undefined,
  options: { account?: boolean } = {},
): Promise<number> {
  const session = await openSession(globals, { auth: true });

  if (options.account) {
    const status = await session.client.githubStatus();
    if (!status.connected) {
      out.line();
      out.info("No GitHub account is connected.");
      out.line();
      return 0;
    }
    out.line();
    out.warn(`This disconnects the GitHub account ${c.bold(status.login ?? "")} from Cefense entirely.`);
    out.hint("Connected repositories stop scanning until you reconnect.");
    out.line();
    const ok = await confirmByTyping({
      message: `Type ${status.login} to confirm`,
      expected: status.login ?? "",
      assumeYes: globals.yes,
    });
    if (!ok) {
      out.info("Left connected.");
      out.line();
      return 0;
    }
    await session.client.disconnectGithubAccount();
    if (isAgentMode()) {
      out.agentEmit({ disconnectedAccount: status.login ?? true });
      return 0;
    }
    out.success("GitHub account disconnected");
    out.line();
    return 0;
  }

  const { projects } = await session.client.projects();
  if (projects.length === 0) {
    out.line();
    out.info("No repositories are connected.");
    out.line();
    return 0;
  }

  const resolution = target
    ? { project: matchProject(projects, target) }
    : await resolveProject(session.client, projects, {
        repo: globals.repo,
        pick: (candidates) => pickProject(candidates, "Disconnect which repository?"),
      }).catch(async () => ({
        project: await pickProject(projects, "Disconnect which repository?"),
      }));

  const project = resolution.project;
  if (!project) {
    throw new UsageError(`${target} is not connected to Cefense.`);
  }

  out.line();
  out.warn(`Disconnecting ${c.bold(project.fullName)}`);
  out.hint("This removes the repository and its scan history from Cefense.");
  out.hint("Your code and your GitHub account are not affected.");
  out.line();

  const ok = await confirmByTyping({
    message: `Type ${project.fullName} to confirm`,
    expected: project.fullName,
    assumeYes: globals.yes,
  });
  if (!ok) {
    out.info("Left connected.");
    out.line();
    return 0;
  }

  await session.client.disconnectRepo(project.githubRepoId);
  const scope = defaultScope();
  if (readRepoDefault(scope)?.githubRepoId === project.githubRepoId) clearRepoDefault(scope);

  if (isAgentMode()) {
    out.agentEmit({ disconnected: project.fullName }, ["cf repo list --agent"]);
    return 0;
  }

  out.success(`Disconnected ${project.fullName}`);
  out.line();
  return 0;
}
