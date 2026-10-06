import { openSession, type GlobalOptions, type Session } from "../core/session.js";
import type { Fix, NotificationSeverity, Project } from "../core/types.js";
import { providerLabel } from "../core/providers.js";
import { connectionState, loadConnections, type Connection } from "./provider.js";
import { readRepoDefault } from "../core/config.js";
import { defaultScope } from "../core/repo.js";
import { hintLine, hintLines, printList, sectionLine, type NextStep } from "../ui/list.js";
import * as out from "../ui/output.js";
import { countOf, durationBetween, firstLine, formatCount, pathFloor, plural, relativeTime, shortId, terminalWidth } from "../ui/format.js";
import { badge, c, glyph, scanTone, toneMark } from "../ui/theme.js";
import { renderTable, type Column } from "../ui/table.js";
import { spinner } from "../ui/prompts.js";
import { isAgentMode } from "../ui/mode.js";
import { attentionList, compactProject, latestWithFindings, prune } from "../core/compact.js";
import { openIfRequested } from "../ui/open.js";
import { allowanceMessage, readAllowanceNotice, type AllowanceNotice } from "../core/allowance.js";
import { resolveOrganization } from "../core/organizations.js";
import { isPartialScan } from "../core/coverage.js";
import { fixLabel } from "./fixactions.js";

const SHOWN = 5;
const INDENT = "  ";

type Counts = Record<NotificationSeverity, number>;

interface Attention {
  mark: string;
  subject: string;
  what: string;
  detail: string;
}

interface Waiting {
  project: Project;
  fix: Fix;
}

function isActive(project: Project): boolean {
  return project.scan?.status === "queued" || project.scan?.status === "running";
}

function scanWhen(project: Project): string {
  const scan = project.scan;
  return scan ? relativeTime(scan.finishedAt ?? scan.createdAt) : "never";
}

function progressCell(project: Project): string {
  const scan = project.scan;
  if (!scan) return "";
  const done = scan.filesScanned ?? 0;
  const total = scan.fileCount ?? 0;
  const stage = scan.stage ?? (scan.status === "queued" ? "queued" : "starting");
  return total > 0 ? `${stage} ${formatCount(done)}/${formatCount(total)} files` : stage;
}

async function eachLimited<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index]!);
    }
  });
  await Promise.all(lanes);
  return results;
}

async function loadCounts(session: Session): Promise<Map<string, Counts>> {
  const response = await session.client.notifications().catch(() => null);
  const counts = new Map<string, Counts>();
  for (const repository of response?.repositories ?? []) {
    if (repository.lastScanCounts) counts.set(repository.id, repository.lastScanCounts);
  }
  return counts;
}

async function loadWaiting(session: Session, projects: Project[]): Promise<Waiting[]> {
  const scanned = projects.filter((project) => project.scan && project.scan.findingCount > 0);
  const batches = await eachLimited(scanned, 16, async (project) => {
    const { fixes } = await session.client
      .fixesForScan(project.scan!.id)
      .catch(() => ({ fixes: [] as Fix[] }));
    return fixes
      .filter((fix) => fix.status === "ready" || fix.status === "opened")
      .map((fix) => ({ project, fix }));
  });
  return batches.flat().sort((left, right) => right.fix.updatedAt.localeCompare(left.fix.updatedAt));
}

function hostsLine(connections: Connection[]): string {
  const cells = connections
    .filter((entry) => connectionState(entry) !== "unconfigured")
    .map((entry) => {
      const label = c.dim(providerLabel(entry.provider));
      switch (connectionState(entry)) {
        case "connected":
          return `${label} ${entry.status.login ?? "connected"}`;
        case "reconnect":
          return `${label} ${c.yellow("reconnect needed")}`;
        case "unavailable":
          return `${label} ${c.yellow("status unavailable")}`;
        default:
          return `${label} ${c.dim("not connected")}`;
      }
    });
  return cells.join(c.dim(`  ${glyph.sep}  `));
}

function attentionRows(connections: Connection[], projects: Project[]): { items: Attention[]; aggregate: Attention | null } {
  const rows: Attention[] = [];
  for (const entry of connections) {
    if (connectionState(entry) === "reconnect") {
      rows.push({
        mark: toneMark("attention"),
        subject: providerLabel(entry.provider),
        what: "connection expired",
        detail: `run cf provider connect ${entry.provider}`,
      });
    }
  }
  const byRecent = [...projects].sort((left, right) =>
    (right.scan?.finishedAt ?? right.scan?.createdAt ?? "").localeCompare(left.scan?.finishedAt ?? left.scan?.createdAt ?? ""),
  );
  for (const project of byRecent) {
    const scan = project.scan;
    if (scan?.status === "failed") {
      rows.push({
        mark: toneMark("failed"),
        subject: project.fullName,
        what: `scan failed ${scanWhen(project)}`,
        detail: firstLine(scan.error) || "no reason reported",
      });
    } else if (scan?.status === "cancelled") {
      rows.push({
        mark: toneMark("attention"),
        subject: project.fullName,
        what: `scan cancelled ${scanWhen(project)}`,
        detail: "the repository was not fully covered",
      });
    }
  }
  const partial = byRecent.filter((project) => project.scan?.status === "completed" && isPartialScan(project.scan));
  const only = partial.length === 1 ? partial[0]! : null;
  const aggregate: Attention | null = only
    ? {
        mark: toneMark("attention"),
        subject: only.fullName,
        what: `partial scan ${scanWhen(only)}`,
        detail: firstLine(only.scan?.coverageGaps?.[0]?.detail) || "part of the repository was not read",
      }
    : partial.length > 1
      ? {
          mark: toneMark("attention"),
          subject: countOf(partial.length, "repository"),
          what: "partial scans",
          detail: "not every file was read",
        }
      : null;
  return { items: rows, aggregate };
}

function table<T>(rows: T[], columns: Column<T>[], width: number): string[] {
  return renderTable(rows, columns, { width: width - INDENT.length, header: false }).map((row) => `${INDENT}${row}`);
}

function more(hidden: number, noun: string | null, command: string): string[] {
  if (hidden <= 0) return [];
  const what = noun ? ` ${plural(hidden, noun)}` : "";
  return [`${INDENT}${c.dim(`and ${formatCount(hidden)} more${what}, run ${command}`)}`];
}

function moreFixes(hidden: Waiting[]): string[] {
  if (hidden.length === 0) return [];
  const repositories = [...new Set(hidden.map((entry) => entry.project.fullName))];
  const where =
    repositories.length === 1
      ? `in ${repositories[0]}, run cf fix --repo ${repositories[0]}`
      : `across ${countOf(repositories.length, "repository")}, run cf fix --repo ${repositories[0]}`;
  return [`${INDENT}${c.dim(`and ${formatCount(hidden.length)} more ${plural(hidden.length, "fix")} ${where}`)}`];
}

function countCell(value: number, word: string, style: (value: string) => string): string {
  return value > 0 ? style(`${formatCount(value)} ${word}`) : c.dim(`0 ${word}`);
}

function summaryLines(projects: Project[], available: number, width: number): string[] {
  const tally = new Map<string, number>();
  for (const project of projects) {
    const word = project.scan ? (project.scan.status === "completed" ? "ready" : project.scan.status === "running" ? "scanning" : project.scan.status) : "never scanned";
    tally.set(word, (tally.get(word) ?? 0) + 1);
  }
  const order = ["ready", "scanning", "queued", "failed", "cancelled", "never scanned"];
  const parts = order.filter((word) => tally.has(word)).map((word) => `${formatCount(tally.get(word)!)} ${word}`);
  const findings = projects.reduce((sum, project) => sum + (project.scan?.findingCount ?? 0), 0);
  const lead = `${countOf(projects.length, "repository")}: ${parts.join(", ")}. ${countOf(findings, "finding")} in all.`;
  if (available === 0) return [lead];
  const extra = `${formatCount(available)} more can be connected.`;
  return lead.length + extra.length + 1 <= width ? [`${lead} ${c.dim(extra)}`] : [lead, c.dim(extra)];
}

function dashboard(options: {
  email: string;
  apiUrl: string;
  connections: Connection[];
  projects: Project[];
  counts: Map<string, Counts>;
  waiting: Waiting[];
  allowance: AllowanceNotice | null;
  linked: Project | null;
  available: number;
}): string[] {
  const { connections, projects, counts, waiting, allowance, linked } = options;
  const width = terminalWidth();
  const organization = resolveOrganization(options.apiUrl)?.slug;
  const lines: string[] = [
    "",
    `Signed in to ${new URL(options.apiUrl).host} as ${c.bold(options.email)}${organization ? c.dim(` (${organization})`) : ""}`,
  ];
  const hosts = hostsLine(connections);
  if (hosts) lines.push(hosts);
  if (linked) lines.push(c.dim(`This directory is linked to ${linked.fullName}`));

  if (allowance) {
    lines.push("", `${toneMark("attention")} ${allowanceMessage(allowance)}`);
  }

  if (projects.length === 0) {
    lines.push("", "No repositories are connected.", ...hintLines([{ command: "cf repo connect", purpose: "connect one" }]), "");
    return lines;
  }

  const { items, aggregate } = attentionRows(connections, projects);
  const attention = [...items.slice(0, SHOWN), ...(aggregate ? [aggregate] : [])];
  if (attention.length > 0) {
    lines.push("", sectionLine("Needs attention"));
    lines.push(
      ...table(
        attention,
        [
          { header: "", value: (row) => `${row.mark} ${row.subject}`, max: 42 },
          { header: "", value: (row) => row.what },
          { header: "", value: (row) => c.dim(row.detail), flex: true, min: 12 },
        ],
        width,
      ),
      ...more(items.length - SHOWN, null, "cf repo list"),
    );
  }

  const active = projects.filter(isActive);
  if (active.length > 0) {
    lines.push("", sectionLine("Scanning", active.length));
    lines.push(
      ...table(
        active.slice(0, SHOWN),
        [
          { header: "", value: (project) => badge(scanTone(project.scan?.status), project.fullName), max: 44 },
          { header: "", value: progressCell, flex: true },
          { header: "", value: (project) => c.dim(durationBetween(project.scan?.createdAt)) },
        ],
        width,
      ),
      ...more(active.length - SHOWN, "scan", "cf status --watch"),
    );
  }

  const risky = projects
    .filter((project) => project.scan?.status === "completed")
    .map((project) => ({ project, counts: counts.get(project.id) }))
    .filter((entry): entry is { project: Project; counts: Counts } => Boolean(entry.counts && entry.counts.critical + entry.counts.high > 0))
    .sort(
      (left, right) =>
        right.counts.critical - left.counts.critical ||
        right.counts.high - left.counts.high ||
        left.project.fullName.localeCompare(right.project.fullName),
    );
  if (risky.length > 0) {
    lines.push("", sectionLine("Critical and high findings", `in ${countOf(risky.length, "repository")}`));
    lines.push(
      ...table(
        risky.slice(0, SHOWN),
        [
          { header: "", value: (entry) => entry.project.fullName, flex: true, min: 16 },
          { header: "", value: (entry) => countCell(entry.counts.critical, "critical", c.red), align: "right" },
          { header: "", value: (entry) => countCell(entry.counts.high, "high", c.yellow), align: "right" },
          { header: "", value: (entry) => c.dim(countOf(entry.project.scan?.findingCount ?? 0, "finding")), align: "right" },
          { header: "", value: (entry) => c.dim(scanWhen(entry.project)) },
        ],
        width,
      ),
      ...more(risky.length - SHOWN, "repository", "cf repo list"),
    );
  }

  if (waiting.length > 0) {
    lines.push("", sectionLine("Fixes waiting on you", waiting.length));
    lines.push(
      ...table(
        waiting.slice(0, SHOWN),
        [
          { header: "", value: (entry) => c.dim(shortId(entry.fix.findingId)) },
          { header: "", value: (entry) => fixLabel(entry.fix) },
          { header: "", value: (entry) => entry.project.fullName, max: 40 },
          {
            header: "",
            value: (entry) => entry.fix.filePath,
            flex: true,
            min: pathFloor(waiting.slice(0, SHOWN).map((entry) => entry.fix.filePath), Math.round(width / 4)),
            overflow: "path",
          },
          { header: "", value: (entry) => c.dim(relativeTime(entry.fix.updatedAt)) },
        ],
        width,
      ),
      ...moreFixes(waiting.slice(SHOWN)),
    );
  }

  if (attention.length === 0 && active.length === 0 && risky.length === 0 && waiting.length === 0) {
    lines.push("", `${toneMark("done")} Nothing needs attention.`);
  }

  lines.push("", ...summaryLines(projects, options.available, width));
  const hint = hintLine(nextFor({ linked, risky: risky.map((entry) => entry.project), waiting, attention: projects.filter((project) => project.scan?.status === "failed") }));
  if (hint) lines.push(hint);
  lines.push("");
  return lines;
}

function nextFor(state: { linked: Project | null; risky: Project[]; waiting: Waiting[]; attention: Project[] }): NextStep {
  if (state.linked?.scan && state.linked.scan.findingCount > 0) {
    return { command: "cf reproduced", purpose: `read the findings in ${state.linked.fullName}` };
  }
  const ready = state.waiting.find((entry) => entry.fix.status === "ready");
  if (ready) {
    return {
      command: `cf fix show ${shortId(ready.fix.findingId)} --repo ${ready.project.fullName}`,
      purpose: "read a patch before publishing it",
    };
  }
  const top = state.risky[0];
  if (top) return { command: `cf reproduced --repo ${top.fullName}`, purpose: `read the findings in ${top.fullName}` };
  const failed = state.attention[0];
  if (failed) return { command: `cf scan --repo ${failed.fullName}`, purpose: "retry a failed scan" };
  return { command: "cf repo list", purpose: "see every repository" };
}

export async function statusCommand(
  globals: GlobalOptions,
  options: { watch?: boolean } = {},
): Promise<number> {
  const session = await openSession(globals, { auth: true });

  const projectsRequest = session.client.projects();
  const extras =
    !isAgentMode() && !out.isJsonMode() && !globals.web && !out.isPiped()
      ? Promise.all([
          loadCounts(session),
          projectsRequest.then((response) => loadWaiting(session, response.projects)).catch(() => [] as Waiting[]),
        ])
      : null;

  const [me, connections, initial, allowance] = await Promise.all([
    session.client.me(),
    loadConnections(session),
    projectsRequest,
    readAllowanceNotice(session.client),
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
    const exhausted = allowance?.state === "exhausted";
    const attention = attentionList(projects);
    const target = attention[0];
    const latest = latestWithFindings(projects);
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
        allowance: allowance
          ? prune({ state: allowance.state, percentUsed: allowance.percentUsed, resetsAt: allowance.resetsAt })
          : undefined,
      },
      [
        exhausted ? "cf plan --agent" : "",
        target && isActive(target) ? "cf status --agent" : "",
        target && !isActive(target) && !exhausted ? `cf scan --repo ${target.fullName} --wait --agent` : "",
        latest ? `cf reproduced --repo ${latest.fullName} --severity critical,high --agent` : "",
        projects.length > 0 ? "cf repo list --agent" : "cf agent check --agent",
      ],
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
      allowance,
    });
    return 0;
  }

  const scope = defaultScope();
  const fallback = readRepoDefault(scope);

  if (await openIfRequested(globals.web, session.apiUrl, { what: "the dashboard" })) return 0;

  if (options.watch && projects.some(isActive)) {
    const progress = spinner();
    const describe = () => {
      const active = projects.filter(isActive);
      const lead = active[0];
      if (!lead) return "Scans settled";
      const rest = active.length > 1 ? c.dim(`  and ${countOf(active.length - 1, "other scan")}`) : "";
      return `Scanning ${lead.fullName}  ${c.dim(progressCell(lead))}${rest}`;
    };
    progress.start(describe());
    for (let attempt = 0; attempt < 300 && projects.some(isActive); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      projects = (await session.client.projects()).projects;
      progress.message(describe());
    }
    progress.stop(projects.some(isActive) ? "Still scanning, stopped watching" : "Scans settled", projects.some(isActive) ? "warn" : "ok");
  }

  if (out.isPiped()) {
    if (allowance) process.stderr.write(`${allowanceMessage(allowance)}\n`);
    printList({
      noun: "repository",
      scope: new URL(session.apiUrl).host,
      rows: projects,
      columns: [],
      pipeColumns: [
        { header: "repository", value: (project) => project.fullName },
        { header: "status", value: (project) => project.scan?.status ?? "never" },
        { header: "findings", value: (project) => (project.scan ? String(project.scan.findingCount) : "") },
        { header: "last scan", value: (project) => project.scan?.finishedAt ?? "" },
      ],
      empty: "No repositories are connected.",
    });
    return 0;
  }

  const [counts, waiting] = extras ? await extras : [new Map<string, Counts>(), [] as Waiting[]];
  const linked = fallback ? (projects.find((project) => project.githubRepoId === fallback.githubRepoId) ?? null) : null;

  out.lines(
    dashboard({
      email: me.user.email,
      apiUrl: session.apiUrl,
      connections,
      projects,
      counts,
      waiting,
      allowance,
      linked,
      available: available.length,
    }),
  );
  return 0;
}
