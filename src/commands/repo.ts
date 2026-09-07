import { openSession, type GlobalOptions, type Session } from "../core/session.js";
import { clearRepoDefault, readRepoDefault, writeRepoDefault } from "../core/config.js";
import { CefenseError, UsageError } from "../core/errors.js";
import { defaultScope, gitRemote, gitToplevel, matchProject, parseRepoArgument, resolveProject } from "../core/repo.js";
import { parseProvider, providerLabel, providerOf, type Provider } from "../core/providers.js";
import { ensureProviderConnected, loadConnections, providerDisconnect } from "./provider.js";
import type { GithubRepo, Project } from "../core/types.js";
import * as out from "../ui/output.js";
import { confirm, confirmByTyping, multiselect, select } from "../ui/prompts.js";
import { renderTable } from "../ui/table.js";
import { relativeTime, terminalWidth } from "../ui/format.js";
import { c, glyph, scanStatusLabel } from "../ui/theme.js";
import { pickProject } from "./pick.js";
import { watchScan } from "./scan.js";
import { isAgentMode } from "../ui/mode.js";
import { compactProject } from "../core/compact.js";

/**
 * Which host a connect is about.
 *
 * A repository can live on any of the three, so the host is taken from the
 * flag, then from what the argument or the git remote says, then from the one
 * account that is actually connected. Asking is the last resort, because in the
 * common case exactly one host is connected and the answer is not in doubt.
 */
async function resolveProvider(
  session: Session,
  globals: GlobalOptions,
  options: { provider?: string; target?: string },
): Promise<Provider> {
  if (options.provider) return parseProvider(options.provider);

  const fromTarget = options.target ? parseRepoArgument(options.target)?.provider : undefined;
  if (fromTarget) return fromTarget;

  const connections = await loadConnections(session);
  const connected = connections.filter((entry) => entry.status.connected);
  if (connected.length === 1) return connected[0]!.provider;

  const remote = gitRemote()?.provider;
  if (remote && connected.some((entry) => entry.provider === remote)) return remote;

  if (connected.length === 0) return remote ?? "github";
  if (globals.yes || isAgentMode() || out.isJsonMode()) return connected[0]!.provider;

  return parseProvider(
    await select({
      message: "Which host is the repository on?",
      choices: connected.map((entry) => ({
        value: entry.provider,
        label: providerLabel(entry.provider),
        hint: entry.status.login ?? undefined,
      })),
    }),
  );
}

export async function repoConnect(
  globals: GlobalOptions,
  target: string | undefined,
  options: { watch?: boolean; provider?: string } = {},
): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const provider = await resolveProvider(session, globals, { provider: options.provider, target });
  const host = providerLabel(provider);
  await ensureProviderConnected(session, provider, { assumeYes: Boolean(globals.yes) });

  const raw = await session.client.providerRepos(provider);
  if (raw.needsReconnect) {
    throw new CefenseError(`Your ${host} connection has expired.`, {
      remedy: `Reconnect with cf provider connect ${provider}.`,
      code: "provider_reconnect_required",
    });
  }
  // The listing routes do not echo the host back, so it is stamped on here and
  // travels with the repository into the connect call.
  const listing = { ...raw, repos: raw.repos.map((repo) => ({ ...repo, provider })) };

  let chosen: GithubRepo[] = [];

  if (target) {
    const wanted = parseRepoArgument(target)?.fullName.toLowerCase() ?? target.toLowerCase();
    const repo = listing.repos.find((entry) => entry.fullName.toLowerCase() === wanted);
    if (!repo) {
      throw new UsageError(
        `${target} is not available to Cefense on ${host}.`,
        listing.manageUrl
          ? `Check the spelling, or grant access at ${listing.manageUrl}.`
          : `Check the spelling, or grant Cefense access to it on ${host}.`,
      );
    }
    if (repo.connected) {
      if (isAgentMode()) {
        out.agentEmit({ repository: repo.fullName, alreadyConnected: true }, [
          `cf observed --repo ${repo.fullName} --agent`,
        ]);
        return 0;
      }
      out.line();
      out.info(`${c.bold(repo.fullName)} is already connected.`);
      out.line();
      return 0;
    }
    chosen = [repo];
  } else {
    const available = listing.repos.filter((repo) => !repo.connected);
    if (available.length === 0) {
      if (isAgentMode()) {
        out.agentEmit({ availableToConnect: 0, alreadyConnected: true }, ["cf repo list --agent"]);
        return 0;
      }
      out.line();
      out.info(`Every ${host} repository Cefense can see is already connected.`);
      if (listing.manageUrl) out.hint(`Grant access to more at ${listing.manageUrl}`);
      out.line();
      return 0;
    }

    const remote = gitRemote();
    const suggested = remote
      ? available.find((repo) => repo.fullName.toLowerCase() === remote.fullName.toLowerCase())
      : undefined;

    const picked = await multiselect({
      message: `Connect a ${host} repository${listing.login ? `   ${listing.login}` : ""}`,
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
      if (
        error instanceof CefenseError &&
        /token is unavailable|connection unavailable|connection expired/i.test(error.message)
      ) {
        out.success(`Connected ${c.bold(repo.fullName)}`);
        out.warn(`The scan did not start: your ${host} connection has expired.`);
        out.hint(`Reconnect with cf provider connect ${provider}`);
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
  // The host column only earns its width once more than one host is in play.
  const hosts = new Set(projects.map((project) => providerOf(project)));

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
        ...(hosts.size > 1
          ? [
              {
                header: "host",
                value: (project: Project) => providerLabel(providerOf(project)),
                min: 7,
              },
            ]
          : []),
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
  options: { account?: boolean; provider?: string } = {},
): Promise<number> {
  if (options.account) {
    // One implementation of "forget this account", so the confirmation and the
    // warning do not drift between the two ways of reaching it.
    return providerDisconnect(globals, options.provider ?? "github");
  }

  const session = await openSession(globals, { auth: true });
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
