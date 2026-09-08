import { openSession, type GlobalOptions } from "../core/session.js";
import type { GithubRepo, Project } from "../core/types.js";
import { providerLabel, providerOf } from "../core/providers.js";
import { connectionSummary, loadConnections, type Connection } from "./provider.js";
import { readRepoDefault } from "../core/config.js";
import { defaultScope } from "../core/repo.js";
import { printList } from "../ui/list.js";
import * as out from "../ui/output.js";
import { padEnd, relativeTime } from "../ui/format.js";
import { c, scanStatusLabel } from "../ui/theme.js";
import { spinner } from "../ui/prompts.js";
import { isAgentMode } from "../ui/mode.js";
import { compactProject, prune } from "../core/compact.js";
import { openIfRequested } from "../ui/open.js";

function isActive(project: Project): boolean {
  return project.scan?.status === "queued" || project.scan?.status === "running";
}

function scanCell(project: Project): string {
  const scan = project.scan;
  if (!scan) return c.dim("never");
  if (scan.status === "running" || scan.status === "queued") {
    const done = scan.filesScanned ?? 0;
    const total = scan.fileCount ?? 0;
    return total > 0 ? `${scan.stage ?? "running"} ${done}/${total}` : (scan.stage ?? "queued");
  }
  if (scan.status === "failed") return c.red(scan.error ?? "failed");
  return relativeTime(scan.finishedAt ?? scan.createdAt);
}

function headerLines(
  connections: Connection[],
  projects: Project[],
  email: string,
  apiUrl: string,
): string[] {
  const scanning = projects.filter(isActive).length;
  return [
    "",
    `Signed in to ${new URL(apiUrl).host} as ${c.bold(email)}`,
    scanning > 0 ? c.cyan(`${scanning} ${scanning === 1 ? "scan" : "scans"} running`) : "",
    "",
    ...connectionSummary(connections),
  ].filter((entry, index) => entry !== "" || index !== 2);
}

export async function statusCommand(
  globals: GlobalOptions,
  options: { watch?: boolean } = {},
): Promise<number> {
  const session = await openSession(globals, { auth: true });

  const [me, connections, initial] = await Promise.all([
    session.client.me(),
    loadConnections(session),
    session.client.projects(),
  ]);

  let projects = initial.projects;

  // Repositories worth offering are on every connected host, not only GitHub,
  // so the listing is one call per connected account rather than one call.
  const listings = await Promise.all(
    connections
      .filter((entry) => entry.status.connected)
      .map(async (entry) => {
        const repos = await session.client
          .providerRepos(entry.provider)
          .catch(() => null);
        return (repos?.repos ?? []).map((repo) => ({ ...repo, provider: entry.provider }));
      }),
  );
  const available = listings.flat().filter((repo) => !repo.connected);

  if (isAgentMode()) {
    out.agentEmit(
      {
        apiUrl: session.apiUrl,
        email: me.user.email,
        providers: connections.map((entry) =>
          prune({
            provider: entry.provider,
            configured: entry.status.configured,
            connected: entry.status.connected,
            needsReconnect: entry.status.needsReconnect || undefined,
            login: entry.status.login ?? null,
            statusUnavailable: entry.unreachable || undefined,
          }),
        ),
        repositories: projects.map(compactProject),
        availableToConnect: available.length,
      },
      ["cf observed --agent", "cf scan --agent"],
    );
    return 0;
  }

  if (out.isJsonMode()) {
    out.json({
      apiUrl: session.apiUrl,
      user: me.user,
      providers: connections,
      projects,
      available: available.length,
    });
    return 0;
  }

  const scope = defaultScope();
  const fallback = readRepoDefault(scope);

  if (await openIfRequested(globals.web, session.apiUrl, { what: "the dashboard" })) return 0;

  if (options.watch && projects.some(isActive)) {
    const progress = spinner();
    progress.start("Scanning");
    for (let attempt = 0; attempt < 300 && projects.some(isActive); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      projects = (await session.client.projects()).projects;
      const active = projects.filter(isActive).map((project) => `${project.fullName} ${scanCell(project)}`);
      if (active.length > 0) progress.message(active.join("   "));
    }
    progress.stop("Scans settled.");
  }

  if (!out.isPiped()) out.lines(headerLines(connections, projects, me.user.email, session.apiUrl));

  const first = projects[0];

  printList({
    noun: "repository",
    scope: new URL(session.apiUrl).host,
    rows: projects,
    columns: [
      {
        header: "repository",
        value: (project) =>
          fallback?.githubRepoId === project.githubRepoId
            ? `${project.fullName} ${c.cyan("*")}`
            : project.fullName,
        min: 16,
        max: 44,
      },
      { header: "status", value: (project) => scanStatusLabel(project.scan?.status), min: 8 },
      {
        header: "findings",
        value: (project) => (project.scan ? String(project.scan.findingCount) : c.dim("-")),
        align: "right",
        min: 5,
      },
      { header: "last scan", value: scanCell, min: 10 },
    ],
    pipeColumns: [
      { header: "repository", value: (project) => project.fullName },
      { header: "status", value: (project) => project.scan?.status ?? "never" },
      { header: "findings", value: (project) => (project.scan ? String(project.scan.findingCount) : "") },
      { header: "last scan", value: (project) => project.scan?.finishedAt ?? "" },
    ],
    empty: "No repositories are connected.",
    emptyHint: "Run cf repo connect to add one.",
    footnote: [
      fallback ? `${c.cyan("*")} default for this directory` : "",
      available.length > 0
        ? `${available.length} more ${available.length === 1 ? "repository" : "repositories"} available to connect.`
        : "",
    ]
      .filter(Boolean)
      .join("   "),
    next: first
      ? [
          { command: "cf observed", purpose: "read the findings" },
          { command: "cf scan", purpose: "rescan" },
          { command: "cf repo connect", purpose: "connect another repository" },
        ]
      : [{ command: "cf repo connect", purpose: "connect a repository" }],
  });

  return 0;
}
