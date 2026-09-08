import { openSession, type GlobalOptions } from "../core/session.js";
import { UsageError } from "../core/errors.js";
import type { Finding, Fix, Project } from "../core/types.js";
import type { Session } from "../core/session.js";
import { blobUrl, providerLabel, providerOf } from "../core/providers.js";
import { printGrouped } from "../ui/list.js";
import { resolveBranch, resolveLinkedProject } from "./link.js";
import { fixLabel, renderFixSection } from "./fixactions.js";
import * as out from "../ui/output.js";
import { relativeTime, shortId, terminalWidth, wrapText } from "../ui/format.js";
import { c, displaySeverity, glyph, severityColor, severityRank } from "../ui/theme.js";
import { isAgentMode } from "../ui/mode.js";
import { compactFinding, compactFindingDetail } from "../core/compact.js";
import { CODE_HOSTS, openIfRequested } from "../ui/open.js";
import { page } from "../ui/pager.js";

export interface ObservedOptions {
  severity?: string;
  category?: string;
  matched?: boolean;
  limit?: number;
  exitCode?: boolean;
  branch?: string;
  scanId?: string;
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

/**
 * A branch or an explicit scan id turns the findings read into a read of that
 * scan rather than the newest one, which is what makes a branch switch show the
 * branch's own findings instead of the default branch's.
 */
async function resolveScope(
  session: Session,
  project: Project,
  options: { branch?: string; scanId?: string },
): Promise<{ scanId?: string; label: string | null }> {
  if (options.scanId) return { scanId: options.scanId, label: null };
  if (!options.branch) return { label: null };

  const branch = await resolveBranch(session, project, options.branch);
  if (!branch.scanId) {
    throw new UsageError(
      `${branch.name} has not been scanned yet.`,
      `Run cf scan --repo ${project.fullName} --branch ${branch.name}.`,
      "branch_not_scanned",
    );
  }
  return { scanId: branch.scanId, label: branch.name };
}

function locationOf(finding: Finding): string {
  return finding.startLine ? `${finding.filePath}:${finding.startLine}` : finding.filePath;
}

function sourceUrlFor(project: Project, finding: Finding, ref?: string | null): string | null {
  const branch = ref ?? project.defaultBranch ?? "HEAD";
  return blobUrl(project, finding.filePath, branch, {
    start: finding.startLine,
    end: finding.endLine,
  });
}

function renderDetail(project: Project, row: Row, width: number, ref?: string | null): string[] {
  const finding = row.finding;
  const wrap = Math.min(96, width - 2);
  const lines: string[] = [];
  const head = (value = "") => lines.push(value);
  const body = (value = "") => lines.push(value ? `  ${value}` : "");
  const dotted = (parts: Array<string | null | undefined>) =>
    parts.filter(Boolean).join(c.dim(` ${glyph.sep} `));

  head(`${c.bold(finding.title)} ${c.dim(shortId(finding.id))}`);
  head(
    dotted([
      severityColor(finding.severity)(displaySeverity(finding.severity)),
      locationOf(finding),
      finding.ruleId,
      finding.confidence !== null ? `confidence ${finding.confidence.toFixed(2)}` : null,
      finding.symbol ? `in ${finding.symbol}` : null,
    ]),
  );
  const refs = dotted([
    finding.cveId ? c.yellow(finding.cveId) : null,
    finding.cwe ? c.yellow(finding.cwe) : null,
    finding.category,
    finding.state && finding.state !== "CANDIDATE" ? finding.state.toLowerCase() : null,
    finding.introducedIn
      ? `introduced in ${finding.introducedIn.sha.slice(0, 7)} by ${finding.introducedIn.authorName}, ${relativeTime(finding.introducedIn.committedAt)}`
      : null,
  ]);
  if (refs) head(c.dim(refs));

  if (finding.description) {
    head();
    for (const wrapped of wrapText(finding.description, wrap)) body(wrapped);
  }

  if (finding.vulnerableCode?.trim()) {
    head();
    head(c.bold("Code"));
    const start = finding.startLine ?? 1;
    finding.vulnerableCode
      .split("\n")
      .slice(0, 20)
      .forEach((codeLine, index) => {
        body(`${c.dim(String(start + index).padStart(4))} ${c.dim("|")} ${codeLine}`);
      });
  }

  if (finding.exploitPath) {
    head();
    head(c.bold("Exploit path"));
    for (const wrapped of wrapText(finding.exploitPath, wrap)) body(wrapped);
  }

  if (finding.dataflow) {
    head();
    head(c.bold("Data flow"));
    body(`${c.dim("source")}  ${finding.dataflow.sourceKind}`);
    for (const step of finding.dataflow.steps ?? []) {
      const where = step.location ? c.dim(`${step.location.file}:${step.location.startLine}`) : "";
      body(`  ${c.dim(glyph.arrow)} ${step.label}   ${c.dim(step.role)}   ${where}`);
    }
    body(`${c.dim("sink")}    ${finding.dataflow.sinkKind}`);
    if (finding.dataflow.ineffectiveSanitizers?.length) {
      body(c.yellow(`ineffective: ${finding.dataflow.ineffectiveSanitizers.join(", ")}`));
    }
  }

  if (finding.intelligenceSources.length > 0) {
    head();
    head(c.bold("Research"));
    for (const source of finding.intelligenceSources) {
      body(
        dotted([c.magenta(source.source), source.title ?? "untitled", c.dim(`${source.confidence}%`)]),
      );
      for (const wrapped of wrapText(source.rationale, wrap - 2, "  ")) body(c.dim(wrapped));
      body(c.dim(`  ${source.sourceUrl}`));
    }
  }

  if (finding.remediation?.summary || finding.remediation?.guidance) {
    head();
    head(c.bold("Remediation"));
    for (const wrapped of wrapText(finding.remediation.summary ?? "", wrap)) body(wrapped);
    if (finding.remediation.guidance && finding.remediation.guidance !== finding.remediation.summary) {
      body();
      for (const wrapped of wrapText(finding.remediation.guidance, wrap)) body(c.dim(wrapped));
    }
  }

  for (const fixLine of renderFixSection(row.fix, width, finding.id)) lines.push(fixLine);

  const link = sourceUrlFor(project, finding, ref);
  if (link) {
    head();
    head(`View this finding on ${providerLabel(providerOf(project))}: ${c.cyan(link)}`);
  }
  head();
  return lines;
}

export async function observedCommand(
  globals: GlobalOptions,
  options: ObservedOptions & { onlyMatched?: boolean },
): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const { project } = await resolveLinkedProject(session, globals);
  const scope = await resolveScope(session, project, options);

  const query = {
    limit: options.limit,
    severity: normaliseSeverity(options.severity),
    category: normaliseCategory(options.category),
    matched: options.onlyMatched ? true : options.matched,
    scanId: scope.scanId,
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
        branch: scope.label,
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
      branch: scope.label,
      scanId: first.scanId,
      total: first.total,
      hasMore: first.hasMore,
      findings: rows.map((row) => ({ ...row.finding, fix: row.fix })),
    });
    return options.exitCode && worst ? 1 : 0;
  }

  if (await openIfRequested(globals.web, project.htmlUrl, { hosts: CODE_HOSTS, what: "this repository" })) {
    return 0;
  }

  const head = rows[0];
  const marker = head ? shortId(head.finding.id) : "<finding-id>";

  const empty = !first.scanId
    ? `${project.fullName} has not been scanned yet.`
    : options.onlyMatched
      ? `No findings in ${project.fullName} are joined to research yet.`
      : `No findings in ${project.fullName}.`;

  printGrouped<Row>({
    noun: options.onlyMatched ? "matched finding" : "finding",
    scope: scope.label ? `${project.fullName}#${scope.label}` : project.fullName,
    total: first.total,
    groups: WIRE_SEVERITIES.map((severity) => ({
      label: displaySeverity(severity),
      tint: severityColor(severity),
      rows: rows.filter((row) => row.finding.severity === severity),
    })),
    columns: [
      { header: "id", value: (row) => c.dim(shortId(row.finding.id)), min: 8, max: 8 },
      { header: "location", value: (row) => locationOf(row.finding), min: 16, max: 38 },
      { header: "title", value: (row) => row.finding.title, min: 28 },
      { header: "fix", value: (row) => (row.fix ? fixLabel(row.fix) : c.dim("-")), min: 1 },
    ],
    pipeColumns: [
      { header: "severity", value: (row) => displaySeverity(row.finding.severity).toLowerCase() },
      { header: "location", value: (row) => locationOf(row.finding) },
      { header: "rule", value: (row) => row.finding.ruleId ?? "" },
      { header: "fix", value: (row) => row.fix?.status ?? "no-fix" },
      { header: "title", value: (row) => row.finding.title },
    ],
    empty,
    emptyHint: first.scanId ? null : `Run cf scan --repo ${project.fullName}.`,
    footnote: first.hasMore ? `Use --limit ${Math.min(1000, first.total)} to see them all.` : null,
    next: head
      ? [
          { command: `cf observed show ${marker}`, purpose: "read one in full" },
          { command: `cf fix generate ${marker}`, purpose: "write a patch for it" },
          { command: `cf triage ${marker} false-positive`, purpose: "record a decision" },
        ]
      : [],
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

const WIRE_SEVERITIES = ["critical", "high", "medium", "low"] as const;

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveFindingId(
  session: Session,
  project: Project,
  candidate: string,
  options: { branch?: string; scanId?: string } = {},
): Promise<string> {
  if (UUID.test(candidate)) return candidate;

  const needle = candidate.replace(/-/g, "").toLowerCase();
  if (needle.length < 4) {
    throw new UsageError(
      `${candidate} is too short to identify a finding.`,
      "Use at least four characters of the id shown by cf observed.",
      "finding_id_ambiguous",
    );
  }

  const scope = await resolveScope(session, project, options);
  const response = await session.client.findings(project.githubRepoId, { scanId: scope.scanId });
  const matches = response.findings.filter((finding) =>
    finding.id.replace(/-/g, "").toLowerCase().startsWith(needle),
  );

  if (matches.length === 1) return matches[0]!.id;
  if (matches.length === 0) {
    throw new UsageError(
      `${candidate} is not a finding in the scan being read of ${project.fullName}.`,
      `Run cf observed --repo ${project.fullName} to list finding ids.`,
      "finding_not_found",
    );
  }
  throw new UsageError(
    `${candidate} matches ${matches.length} findings in ${project.fullName}.`,
    `Use more characters: ${matches.slice(0, 3).map((finding) => shortId(finding.id)).join(", ")}.`,
    "finding_id_ambiguous",
  );
}

export async function observedShow(
  globals: GlobalOptions,
  findingId: string,
  options: { branch?: string; scanId?: string } = {},
): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const { project } = await resolveLinkedProject(session, globals);
  const scope = await resolveScope(session, project, options);

  const resolved = await resolveFindingId(session, project, findingId, options);
  const response = await session.client.findings(project.githubRepoId, { scanId: scope.scanId });
  const finding = response.findings.find((entry) => entry.id === resolved);
  if (!finding) {
    throw new UsageError(
      `${findingId} is not a finding in the scan being read of ${project.fullName}.`,
      `Run cf observed --repo ${project.fullName} to list finding ids.`,
      "finding_not_found",
    );
  }

  const { fix } = await session.client
    .fixForFinding(resolved)
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

  if (
    await openIfRequested(globals.web, sourceUrlFor(project, finding, scope.label), {
      hosts: CODE_HOSTS,
      what: "this finding",
    })
  ) {
    return 0;
  }

  page(renderDetail(project, { finding, fix }, terminalWidth(), scope.label));
  return 0;
}
