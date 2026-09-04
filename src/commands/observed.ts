import open from "open";
import { openSession, type GlobalOptions } from "../core/session.js";
import { UsageError } from "../core/errors.js";
import type { Finding, Fix, Project } from "../core/types.js";
import type { Session } from "../core/session.js";
import { browse } from "../ui/browser.js";
import { resolveLinkedProject } from "./link.js";
import { fixActions, fixLabel, renderFixSection } from "./fixactions.js";
import * as out from "../ui/output.js";
import { relativeTime, terminalWidth, wrapText } from "../ui/format.js";
import { c, displaySeverity, glyph, severityColor, severityRank } from "../ui/theme.js";
import { isAgentMode } from "../ui/mode.js";
import { compactFinding, compactFindingDetail } from "../core/compact.js";

export interface ObservedOptions {
  severity?: string;
  category?: string;
  matched?: boolean;
  limit?: number;
  exitCode?: boolean;
}

export interface Row {
  finding: Finding;
  fix: Fix | null;
}

function sortRows(rows: Row[]): Row[] {
  return [...rows].sort(
    (left, right) =>
      severityRank(left.finding.severity) - severityRank(right.finding.severity) ||
      left.finding.filePath.localeCompare(right.finding.filePath),
  );
}

async function fixesFor(session: Session, scanId: string | null): Promise<Map<string, Fix>> {
  if (!scanId) return new Map();
  const { fixes } = await session.client.fixesForScan(scanId).catch(() => ({ fixes: [] as Fix[] }));
  return new Map(fixes.map((fix) => [fix.findingId, fix]));
}

function locationOf(finding: Finding): string {
  return finding.startLine ? `${finding.filePath}:${finding.startLine}` : finding.filePath;
}

function githubUrlFor(project: Project, finding: Finding): string | null {
  if (!project.htmlUrl) return null;
  const branch = project.defaultBranch ?? "HEAD";
  const anchor = finding.startLine
    ? `#L${finding.startLine}${finding.endLine && finding.endLine !== finding.startLine ? `-L${finding.endLine}` : ""}`
    : "";
  return `${project.htmlUrl}/blob/${branch}/${finding.filePath}${anchor}`;
}

function renderRow(row: Row, selected: boolean, width: number): string[] {
  const finding = row.finding;
  const marker = selected ? c.cyan(glyph.arrow) : " ";
  const severity = severityColor(finding.severity)(
    `${glyph.dot} ${displaySeverity(finding.severity).toLowerCase().padEnd(8)}`,
  );
  const title = selected ? c.bold(finding.title) : finding.title;
  const sources = finding.intelligenceSources.length;
  const meta = [
    c.dim(locationOf(finding)),
    finding.ruleId ? c.dim(finding.ruleId) : "",
    sources > 0 ? c.magenta(`${glyph.star} ${sources} ${sources === 1 ? "source" : "sources"}`) : "",
    row.fix ? fixLabel(row.fix) : "",
    c.dim(relativeTime(finding.createdAt)),
  ]
    .filter(Boolean)
    .join("   ");
  void width;
  return [`${marker} ${severity} ${title}`, `    ${meta}`, ""];
}

function renderDetail(project: Project, row: Row, width: number): string[] {
  const finding = row.finding;
  const body = Math.min(96, width - 4);
  const lines: string[] = [];
  const push = (value = "") => lines.push(value ? `  ${value}` : "");

  push();
  push(`${c.bold(finding.title)}   ${severityColor(finding.severity)(displaySeverity(finding.severity))}`);
  push();

  const facts = [
    locationOf(finding),
    finding.ruleId ?? "",
    finding.confidence !== null ? `confidence ${finding.confidence.toFixed(2)}` : "",
    finding.symbol ? `in ${finding.symbol}` : "",
  ].filter(Boolean);
  push(c.dim(facts.join("      ")));

  const refs = [
    finding.cveId ? c.yellow(finding.cveId) : "",
    finding.cwe ? c.yellow(finding.cwe) : "",
    finding.category ?? "",
    finding.state && finding.state !== "CANDIDATE" ? finding.state.toLowerCase() : "",
  ].filter(Boolean);
  if (refs.length > 0) push(c.dim(refs.join("      ")));

  if (finding.description) {
    push();
    for (const wrapped of wrapText(finding.description, body)) push(wrapped);
  }

  if (finding.vulnerableCode?.trim()) {
    push();
    push(c.dim("CODE"));
    push();
    const start = finding.startLine ?? 1;
    finding.vulnerableCode
      .split("\n")
      .slice(0, 20)
      .forEach((codeLine, index) => {
        push(`${c.dim(String(start + index).padStart(5))} ${c.dim("|")} ${codeLine}`);
      });
  }

  if (finding.dataflow) {
    push();
    push(c.dim("DATA FLOW"));
    push();
    push(`${c.dim("source")}  ${finding.dataflow.sourceKind}`);
    for (const step of finding.dataflow.steps ?? []) {
      const where = step.location ? c.dim(`${step.location.file}:${step.location.startLine}`) : "";
      push(`   ${c.dim(glyph.arrow)} ${step.label}   ${c.dim(step.role)}   ${where}`);
    }
    push(`${c.dim("sink")}    ${finding.dataflow.sinkKind}`);
    if (finding.dataflow.ineffectiveSanitizers?.length) {
      push();
      push(c.yellow(`ineffective: ${finding.dataflow.ineffectiveSanitizers.join(", ")}`));
    }
  }

  if (finding.intelligenceSources.length > 0) {
    push();
    push(c.dim("RESEARCH"));
    push();
    for (const source of finding.intelligenceSources) {
      push(
        `${c.magenta(glyph.star)} ${c.bold(source.source)}   ${source.title ?? "untitled"}   ${c.dim(`${source.confidence}%`)}`,
      );
      for (const wrapped of wrapText(source.rationale, body - 2, "  ")) push(c.dim(wrapped));
      push(c.dim(`  ${source.sourceUrl}`));
      push();
    }
  }

  if (finding.remediation?.summary || finding.remediation?.guidance) {
    push();
    push(c.dim("REMEDIATION"));
    push();
    for (const wrapped of wrapText(finding.remediation.summary ?? "", body)) push(wrapped);
    if (finding.remediation.guidance && finding.remediation.guidance !== finding.remediation.summary) {
      push();
      for (const wrapped of wrapText(finding.remediation.guidance, body)) push(c.dim(wrapped));
    }
  }

  for (const fixLine of renderFixSection(row.fix, width)) lines.push(fixLine);

  const link = githubUrlFor(project, finding);
  if (link) {
    push(c.dim(link));
    push();
  }
  return lines;
}

export async function observedCommand(
  globals: GlobalOptions,
  options: ObservedOptions & { onlyMatched?: boolean },
): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const { project } = await resolveLinkedProject(session, globals);

  const query = {
    limit: options.limit,
    severity: normaliseSeverity(options.severity),
    category: normaliseCategory(options.category),
    matched: options.onlyMatched ? true : options.matched,
  };

  const load = async (): Promise<{ rows: Row[]; scanId: string | null; total: number; hasMore: boolean }> => {
    const response = await session.client.findings(project.githubRepoId, query);
    const fixes = await fixesFor(session, response.scanId);
    return {
      rows: sortRows(response.findings.map((finding) => ({ finding, fix: fixes.get(finding.id) ?? null }))),
      scanId: response.scanId,
      total: response.total,
      hasMore: response.hasMore,
    };
  };

  const first = await load();
  const rows = first.rows;
  const worst = rows.some(
    (row) => row.finding.severity === "critical" || row.finding.severity === "high",
  );

  if (isAgentMode()) {
    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.finding.severity] = (counts[row.finding.severity] ?? 0) + 1;
    }
    out.agentEmit(
      {
        repository: project.fullName,
        scanId: first.scanId,
        total: first.total,
        hasMore: first.hasMore,
        counts,
        findings: rows.map((row) => compactFinding(row.finding, row.fix)),
      },
      rows[0]
        ? [
            `cf observed show ${rows[0].finding.id} --repo ${project.fullName} --agent`,
            `cf fix generate ${rows[0].finding.id} --wait --agent`,
            `cf scan --repo ${project.fullName} --agent`,
          ]
        : [`cf scan --repo ${project.fullName} --agent`],
    );
    return options.exitCode && worst ? 1 : 0;
  }

  if (out.isJsonMode()) {
    out.json({
      repository: project.fullName,
      scanId: first.scanId,
      total: first.total,
      hasMore: first.hasMore,
      findings: rows.map((row) => ({ ...row.finding, fix: row.fix })),
    });
    return options.exitCode && worst ? 1 : 0;
  }

  if (out.isPiped()) {
    for (const row of rows) {
      out.line(
        [
          displaySeverity(row.finding.severity).toLowerCase(),
          locationOf(row.finding),
          row.finding.ruleId ?? "",
          row.fix?.status ?? "no-fix",
          row.finding.title,
        ].join("\t"),
      );
    }
    return options.exitCode && worst ? 1 : 0;
  }

  if (rows.length === 0) {
    out.line();
    if (!first.scanId) {
      out.info(`${c.bold(project.fullName)} has not been scanned yet.`);
      out.hint("Run cf scan.");
    } else if (options.onlyMatched) {
      out.info(`No findings in ${c.bold(project.fullName)} are joined to research yet.`);
    } else {
      out.success(`No findings in ${c.bold(project.fullName)}.`);
    }
    out.line();
    return 0;
  }

  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = displaySeverity(row.finding.severity);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const matchedCount = rows.filter((row) => row.finding.intelligenceSources.length > 0).length;

  await browse(rows, {
    header: (visible) => {
      const summary = [...counts.entries()]
        .map(([label, count]) => severityColor(label.toLowerCase())(`${count} ${label.toLowerCase()}`))
        .join(c.dim("  ·  "));
      const scope = options.onlyMatched
        ? `${matchedCount} of ${first.total} joined to research`
        : `${visible.length} of ${first.total} ${first.total === 1 ? "finding" : "findings"}`;
      return ["", `  ${c.bold(project.fullName)}   ${c.dim(scope)}`, `  ${summary}`, ""];
    },
    renderRow,
    renderDetail: (row, width) => renderDetail(project, row, width),
    filterText: (row) =>
      `${row.finding.title} ${row.finding.filePath} ${row.finding.ruleId ?? ""} ${row.finding.cwe ?? ""} ${row.finding.cveId ?? ""}`,
    emptyMessage: "Nothing matches that filter.",
    refresh: async () => (await load()).rows,
    actions: [
      ...fixActions<Row>(session, project, (row) =>
        row ? { findingId: row.finding.id, fix: row.fix } : null,
      ),
      {
        key: "o",
        label: "github",
        run: (row) => {
          if (!row) return;
          const url = githubUrlFor(project, row.finding);
          if (url) void open(url).catch(() => undefined);
        },
      },
      {
        key: "a",
        label: (row) => {
          const count = row?.finding.intelligenceSources.length ?? 0;
          return count > 0 ? (count === 1 ? "research" : `research (${count})`) : null;
        },
        run: (row) => {
          const source = row?.finding.intelligenceSources[0];
          if (source) void open(source.sourceUrl).catch(() => undefined);
        },
      },
    ],
  });

  return options.exitCode && worst ? 1 : 0;
}

export function requireLimit(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) {
    throw new UsageError("--limit must be a whole number between 1 and 1000.");
  }
  return parsed;
}

const SEVERITY_ALIASES: Record<string, string> = {
  critical: "critical",
  high: "high",
  watch: "medium",
  medium: "medium",
  info: "low",
  low: "low",
};

const CATEGORIES = ["code", "dependency", "secret", "misconfig", "os-package"];

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function normaliseSeverity(value: string | undefined): string | undefined {
  const parts = splitList(value);
  if (parts.length === 0) return undefined;
  const mapped = parts.map((part) => {
    const hit = SEVERITY_ALIASES[part];
    if (!hit) {
      throw new UsageError(
        `${part} is not a severity.`,
        "Use critical, high, watch (medium), or info (low).",
        "invalid_severity",
      );
    }
    return hit;
  });
  return [...new Set(mapped)].join(",");
}

export function normaliseCategory(value: string | undefined): string | undefined {
  const parts = splitList(value);
  if (parts.length === 0) return undefined;
  for (const part of parts) {
    if (!CATEGORIES.includes(part)) {
      throw new UsageError(
        `${part} is not a category.`,
        `Use ${CATEGORIES.join(", ")}.`,
        "invalid_category",
      );
    }
  }
  return [...new Set(parts)].join(",");
}

export async function observedShow(globals: GlobalOptions, findingId: string): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const { project } = await resolveLinkedProject(session, globals);

  const response = await session.client.findings(project.githubRepoId);
  const finding = response.findings.find((entry) => entry.id === findingId);
  if (!finding) {
    throw new UsageError(
      `${findingId} is not a finding in the latest scan of ${project.fullName}.`,
      `Run cf observed --repo ${project.fullName} to list finding ids.`,
      "finding_not_found",
    );
  }

  const { fix } = await session.client
    .fixForFinding(findingId)
    .catch(() => ({ fix: null as Fix | null }));

  if (isAgentMode()) {
    out.agentEmit(
      { repository: project.fullName, finding: compactFindingDetail(finding, fix) },
      fix?.status === "ready"
        ? [`cf fix publish ${findingId} --yes --agent`]
        : fix
          ? [`cf fix show ${findingId} --agent`]
          : [`cf fix generate ${findingId} --wait --agent`],
    );
    return 0;
  }

  if (out.isJsonMode()) {
    out.json({ repository: project.fullName, finding: { ...finding, fix } });
    return 0;
  }

  out.lines(renderDetail(project, { finding, fix }, terminalWidth()));
  return 0;
}
