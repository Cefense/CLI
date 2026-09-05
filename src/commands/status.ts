import open from "open";
import { openSession, type GlobalOptions } from "../core/session.js";
import type { GithubRepo, GithubStatus, Project } from "../core/types.js";
import { readRepoDefault } from "../core/config.js";
import { defaultScope } from "../core/repo.js";
import { browse } from "../ui/browser.js";
import * as out from "../ui/output.js";
import { keyValue, renderTable } from "../ui/table.js";
import { elapsed, padEnd, progressBar, relativeTime, terminalWidth } from "../ui/format.js";
import { c, glyph, scanStatusLabel } from "../ui/theme.js";
import { confirmByTyping } from "../ui/prompts.js";
import { observedCommand } from "./observed.js";
import { branchesCommand } from "./branches.js";
import { commitsCommand } from "./commits.js";
import { watchScan } from "./scan.js";
import { SCAN_INTERVALS, SCAN_MODES } from "./settings.js";
import { isAgentMode } from "../ui/mode.js";
import { compactProject, prune } from "../core/compact.js";

type Row =
  | { kind: "project"; project: Project }
  | { kind: "available"; repo: GithubRepo }
  | { kind: "divider" };

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

function headerLines(github: GithubStatus | null, projects: Project[], email: string, apiUrl: string): string[] {
  const scanning = projects.filter(isActive).length;
  const summary = [
    `${projects.length} connected`,
    scanning > 0 ? c.cyan(`${scanning} scanning`) : "",
  ]
    .filter(Boolean)
    .join(c.dim("  ·  "));

  return [
    "",
    `  ${c.bold("Cefense")}   ${c.dim(`${email}  ·  ${apiUrl.replace(/^https?:\/\//, "")}`)}`,
    "",
    `  ${c.dim(padEnd("GitHub", 10))}${github?.connected ? `connected as ${github.login}` : c.yellow("not connected")}`,
    `  ${c.dim(padEnd("Repos", 10))}${summary}`,
    "",
  ];
}

function projectDetail(project: Project, width: number): string[] {
  const lines: string[] = [];
  const push = (value = "") => lines.push(value ? `  ${value}` : "");
  const scan = project.scan;

  push();
  push(
    `${c.bold(project.fullName)}   ${c.dim(`${project.private ? "private" : "public"}  ·  ${project.defaultBranch ?? "default branch"}`)}`,
  );
  push();

  const facts: Array<[string, string]> = [
    ["Scan", scan ? `${scanStatusLabel(scan.status)}   ${c.dim(relativeTime(scan.createdAt))}` : c.dim("never scanned")],
  ];
  if (scan) {
    if (scan.stage) facts.push(["Stage", scan.stage]);
    if (scan.fileCount) {
      const done = scan.filesScanned ?? 0;
      facts.push([
        "Files",
        `${progressBar(done, scan.fileCount, Math.min(24, width - 30))}  ${done} / ${scan.fileCount}`,
      ]);
    }
    facts.push(["Findings", String(scan.findingCount)]);
    if (scan.finishedAt) facts.push(["Duration", elapsed(scan.createdAt, scan.finishedAt)]);
    if (scan.error) facts.push(["Error", c.red(scan.error)]);
  }
  const mode = SCAN_MODES.find((entry) => entry.id === (project.scanMode ?? "manual"));
  const interval = SCAN_INTERVALS.find((entry) => entry.id === (project.scanInterval ?? "24h"));
  facts.push([
    "Mode",
    project.scanMode === "scheduled"
      ? `${mode?.label ?? "Manual"}   ${c.dim(interval?.label.toLowerCase() ?? "")}`
      : (mode?.label ?? "Manual"),
  ]);
  if ((project.coverages ?? []).length > 0) {
    facts.push(["Checks", c.dim(project.coverages.join(", "))]);
  }
  facts.push(["Connected", relativeTime(project.connectedAt)]);

  for (const row of keyValue(facts, 10)) push(row);

  const languages = project.profile?.languages ?? [];
  const frameworks = project.profile?.frameworks ?? [];
  if (languages.length > 0 || frameworks.length > 0) {
    push();
    push(c.dim("DETECTED STACK"));
    push();
    if (languages.length > 0) push(`${c.dim(padEnd("Languages", 12))}${languages.join(", ")}`);
    if (frameworks.length > 0) push(`${c.dim(padEnd("Frameworks", 12))}${frameworks.join(", ")}`);
  }

  if (project.htmlUrl) {
    push();
    push(c.dim(project.htmlUrl));
  }
  push();
  return lines;
}

export async function statusCommand(
  globals: GlobalOptions,
  options: { watch?: boolean } = {},
): Promise<number> {
  const session = await openSession(globals, { auth: true });

  const [me, github, listing, initial] = await Promise.all([
    session.client.me(),
    session.client.githubStatus().catch(() => null),
    session.client.githubRepos().catch(() => null),
    session.client.projects(),
  ]);

  let projects = initial.projects;
  const available = (listing?.repos ?? []).filter((repo) => !repo.connected);

  if (isAgentMode()) {
    out.agentEmit(
      {
        apiUrl: session.apiUrl,
        email: me.user.email,
        github: github ? prune({ connected: github.connected, login: github.login }) : null,
        repositories: projects.map(compactProject),
        availableToConnect: available.length,
      },
      ["cf observed --agent", "cf scan --agent"],
    );
    return 0;
  }

  if (out.isJsonMode()) {
    out.json({ apiUrl: session.apiUrl, user: me.user, github, projects, available: available.length });
    return 0;
  }

  if (out.isPiped()) {
    out.lines(headerLines(github, projects, me.user.email, session.apiUrl));
    if (projects.length > 0) {
      out.lines(
        renderTable(
          projects,
          [
            { header: "repository", value: (project) => project.fullName, min: 16 },
            { header: "status", value: (project) => scanStatusLabel(project.scan?.status), min: 8 },
            {
              header: "findings",
              value: (project) => (project.scan ? String(project.scan.findingCount) : "-"),
              align: "right",
              min: 5,
            },
            { header: "last scan", value: scanCell, min: 10 },
          ],
          { width: terminalWidth() - 4 },
        ).map((row) => `  ${row}`),
      );
    }
    out.line();
    return 0;
  }

  const scope = defaultScope();
  const fallback = readRepoDefault(scope);

  const buildRows = (list: Project[]): Row[] => {
    const rows: Row[] = list.map((project) => ({ kind: "project" as const, project }));
    if (available.length > 0) {
      rows.push({ kind: "divider" });
      for (const repo of available.slice(0, 8)) rows.push({ kind: "available" as const, repo });
    }
    return rows;
  };

  let followUp: { action: "findings" | "scan" | "branches" | "commits"; project: Project } | null = null;

  await browse(buildRows(projects), {
    header: () => headerLines(github, projects, me.user.email, session.apiUrl),
    renderRow: (row, selected, width) => {
      if (row.kind === "divider") {
        return ["", `  ${c.dim(glyph.rule.repeat(Math.max(8, width - 4)))}`];
      }
      const marker = selected ? c.cyan(glyph.arrow) : " ";
      if (row.kind === "available") {
        return [`${marker} ${c.dim(padEnd(row.repo.fullName, 34))}${c.dim("not connected")}`];
      }
      const project = row.project;
      const isDefault = fallback?.githubRepoId === project.githubRepoId;
      const name = selected ? c.bold(project.fullName) : project.fullName;
      const findings = project.scan ? String(project.scan.findingCount) : "-";
      return [
        `${marker} ${padEnd(name + (isDefault ? c.cyan(" *") : ""), 34)}${padEnd(scanStatusLabel(project.scan?.status), 12)}${padEnd(findings, 10)}${c.dim(scanCell(project))}`,
      ];
    },
    renderDetail: (row, width) =>
      row.kind === "project"
        ? projectDetail(row.project, width)
        : row.kind === "available"
          ? ["", `  ${c.bold(row.repo.fullName)} is not connected.`, "", `  ${c.dim("Press c to connect it.")}`, ""]
          : [""],
    filterText: (row) =>
      row.kind === "project" ? row.project.fullName : row.kind === "available" ? row.repo.fullName : "",
    emptyMessage: "No repositories are connected. Run cf repo connect.",
    refresh: async () => {
      const next = await session.client.projects();
      projects = next.projects;
      return buildRows(projects);
    },
    refreshIntervalMs: 2000,
    shouldKeepRefreshing: () => options.watch === true || projects.some(isActive),
    actions: [
      {
        key: "f",
        label: "findings",
        run: (row, context) => {
          if (row?.kind !== "project") return;
          followUp = { action: "findings", project: row.project };
          context.close();
        },
      },
      {
        key: "r",
        label: "rescan",
        run: async (row, context) => {
          if (row?.kind !== "project") return;
          followUp = { action: "scan", project: row.project };
          context.close();
        },
      },
      {
        key: "b",
        label: "branches",
        run: (row, context) => {
          if (row?.kind !== "project") return;
          followUp = { action: "branches", project: row.project };
          context.close();
        },
      },
      {
        key: "h",
        label: "history",
        run: (row, context) => {
          if (row?.kind !== "project") return;
          followUp = { action: "commits", project: row.project };
          context.close();
        },
      },
      {
        key: "o",
        label: "open",
        run: (row) => {
          const url =
            row?.kind === "project" ? row.project.htmlUrl : row?.kind === "available" ? row.repo.htmlUrl : null;
          if (url) void open(url).catch(() => undefined);
        },
      },
      {
        key: "d",
        label: "disconnect",
        run: async (row, context) => {
          if (row?.kind !== "project") return;
          const project = row.project;
          const confirmed = await context.suspend(async () => {
            out.line();
            out.warn(`Disconnecting ${c.bold(project.fullName)} removes its scan history from Cefense.`);
            out.line();
            return confirmByTyping({
              message: `Type ${project.fullName} to confirm`,
              expected: project.fullName,
            });
          });
          if (!confirmed) {
            context.setStatus("Left connected.");
            return;
          }
          await session.client.disconnectRepo(project.githubRepoId);
          await context.refresh();
          context.setStatus(`Disconnected ${project.fullName}`);
        },
      },
      {
        key: "c",
        label: "connect",
        run: async (row, context) => {
          if (row?.kind !== "available") return;
          const repo = row.repo;
          await session.client.connectRepo(repo);
          await context.refresh();
          context.setStatus(`Connected ${repo.fullName}. A first scan has started.`);
        },
      },
    ],
  });

  const pending = followUp as {
    action: "findings" | "scan" | "branches" | "commits";
    project: Project;
  } | null;
  if (pending?.action === "findings") {
    return observedCommand({ ...globals, repo: pending.project.fullName }, {});
  }
  if (pending?.action === "branches") {
    return branchesCommand({ ...globals, repo: pending.project.fullName });
  }
  if (pending?.action === "commits") {
    return commitsCommand({ ...globals, repo: pending.project.fullName });
  }
  if (pending?.action === "scan") {
    await session.client.startScan(pending.project.githubRepoId);
    out.line();
    await watchScan(session.client, pending.project.githubRepoId, pending.project.fullName);
    out.line();
  }
  return 0;
}
