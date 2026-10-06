import { openSession, type GlobalOptions } from "../core/session.js";
import { UsageError } from "../core/errors.js";
import type { Finding, Fix, Project } from "../core/types.js";
import type { Session } from "../core/session.js";
import { blobUrl, providerLabel, providerOf } from "../core/providers.js";
import { hintLine, printGrouped, type NextStep } from "../ui/list.js";
import { resolveBranch, resolveLinkedProject } from "./link.js";
import { renderFixSection, statusLabel, statusState } from "./fixactions.js";
import * as out from "../ui/output.js";
import { datedLabel, pathFloor, shortId, terminalWidth } from "../ui/format.js";
import { c, displaySeverity, glyph, severityColor, severityRank, toneMark } from "../ui/theme.js";
import { details } from "../ui/table.js";
import {
  BODY_INDENT,
  codeBlock,
  heading,
  indent,
  joinDots,
  paragraph,
  readingWidth,
  titleLine,
  viewOn,
} from "../ui/detail.js";
import { isAgentMode } from "../ui/mode.js";
import { compactFinding, compactFindingDetail, coverageEnvelope, progressOf } from "../core/compact.js";
import { REACHABILITY_LEDES, isReachabilityVerdict, reachabilityLabel, statusFor } from "../core/findingStatus.js";
import { coverageLines, isPartialScan, scanIfSame } from "../core/coverage.js";
import { CODE_HOSTS, openIfRequested } from "../ui/open.js";
import { page } from "../ui/pager.js";

export interface ReproducedOptions {
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

function rowStatus(row: Row): string {
  const progress = progressOf(row.finding, row.fix);
  return statusLabel(statusFor(progress), progress.fix?.prNumber ?? null);
}

function listStatus(row: Row): string {
  const progress = progressOf(row.finding, row.fix);
  const status = statusFor(progress);
  return status.kind === "none" ? "" : statusLabel(status, progress.fix?.prNumber ?? null);
}

function fileFloor(rows: Row[], width: number): number {
  return pathFloor(rows.map((row) => locationOf(row.finding)), Math.round(width / 4));
}

function reachStyle(finding: Finding): (value: string) => string {
  if (finding.reachability === "reachable") return c.red;
  if (finding.reachability === "imported") return c.yellow;
  return c.dim;
}

function reachCell(finding: Finding, full = false): string {
  if (!isReachabilityVerdict(finding.reachability)) return c.dim("-");
  const label = full ? reachabilityLabel(finding.reachability) ?? finding.reachability : finding.reachability;
  return reachStyle(finding)(label);
}

function locationOf(finding: Finding): string {
  return finding.startLine ? `${finding.filePath}:${finding.startLine}` : finding.filePath;
}

function spanOf(finding: Finding): string {
  if (!finding.startLine) return finding.filePath;
  const end = finding.endLine && finding.endLine !== finding.startLine ? `-${finding.endLine}` : "";
  return `${finding.filePath}:${finding.startLine}${end}`;
}

function sourceUrlFor(project: Project, finding: Finding, ref?: string | null): string | null {
  const branch = ref ?? project.defaultBranch ?? "HEAD";
  return blobUrl(project, finding.filePath, branch, {
    start: finding.startLine,
    end: finding.endLine,
  });
}

function repoFlag(globals: GlobalOptions, project: Project): string {
  return globals.repo ? ` --repo ${project.fullName}` : "";
}

function originLabel(origin: NonNullable<Finding["introducedIn"]>): string {
  return `${origin.sha.slice(0, 7)} by ${origin.authorName}, ${datedLabel(origin.committedAt)}`;
}

function originLine(dependency: NonNullable<Finding["dependency"]>): string {
  if (dependency.direct === true) return "Declared by this project";
  if (dependency.direct === false) return "Pulled in by another package";
  return "Not established";
}

function detailNext(finding: Finding, fix: Fix | null, flag: string): NextStep {
  const id = shortId(finding.id);
  if (!fix) return { command: `cf fix generate ${id}${flag}`, purpose: "write a patch for this finding" };
  if (fix.status === "ready") return { command: `cf fix publish ${id}${flag}`, purpose: "open a pull request with this patch" };
  if (fix.status === "failed") return { command: `cf fix generate ${id}${flag}`, purpose: "try writing the patch again" };
  if (fix.status === "opened" && fix.prUrl) return { command: `cf fix merge ${id}${flag}`, purpose: "merge the pull request" };
  return { command: `cf fix show ${id}${flag}`, purpose: "read the patch" };
}

function renderDetail(
  project: Project,
  row: Row,
  width: number,
  ref: string | null | undefined,
  flag: string,
): string[] {
  const finding = row.finding;
  const wrap = readingWidth(width);
  const status = statusFor(progressOf(finding, row.fix));
  const lines: string[] = [];
  const push = (...values: string[]) => lines.push(...values);

  push(titleLine(finding.title, shortId(finding.id)));
  push(
    joinDots([
      severityColor(finding.severity)(displaySeverity(finding.severity)),
      isReachabilityVerdict(finding.reachability) ? reachCell(finding, true) : null,
      statusState(status, row.fix?.prNumber ?? null),
    ]),
  );
  push("");
  push(
    ...details([
      ["Location", `${spanOf(finding)}${finding.symbol ? c.dim(` in ${finding.symbol}`) : ""}`],
      ["Category", finding.category],
      ["Advisory", finding.cveId],
      ["Weakness", finding.cwe],
      ["Rule", finding.ruleId],
      ["Confidence", finding.confidence !== null ? finding.confidence.toFixed(2) : null],
      ["State", finding.state && finding.state !== "CANDIDATE" ? finding.state.toLowerCase() : null],
      ["Introduced", finding.introducedIn ? originLabel(finding.introducedIn) : null],
      ["Found", datedLabel(finding.createdAt)],
    ]),
  );

  if (finding.description) push("", ...paragraph(finding.description, wrap));

  if (finding.vulnerableCode?.trim()) {
    push("", heading("Code"), ...codeBlock(finding.vulnerableCode, finding.startLine, wrap));
  }

  if (finding.dependency) {
    const dependency = finding.dependency;
    push("", heading("Package"));
    push(
      ...indent(
        details([
          ["Package", `${dependency.name} ${c.dim(`(${dependency.ecosystem})`)}`],
          ["Installed", dependency.installedVersion],
          ["Fixed in", dependency.fixedVersion ?? c.dim("no fixed release published yet")],
          ["Origin", originLine(dependency)],
          [
            "Required by",
            dependency.direct === false && dependency.requiredBy.length > 0
              ? dependency.requiredBy.slice(0, 5).join(", ")
              : null,
          ],
        ]),
      ),
    );
    for (const chain of dependency.paths.filter((entry) => entry.length > 1).slice(0, 3)) {
      push(`${BODY_INDENT}${c.dim(chain.join(` ${glyph.arrow} `))}`);
    }
  }

  if (isReachabilityVerdict(finding.reachability)) {
    const evidence = finding.reachabilityEvidence;
    push("", heading("Reachability"));
    push(...paragraph(evidence?.why ?? REACHABILITY_LEDES[finding.reachability], wrap));
    const path = evidence?.path ?? [];
    if (path.length > 1) {
      for (const step of path) {
        push(`${BODY_INDENT}${c.dim(glyph.arrow)} ${step.path}${step.symbol ? c.dim(` ${step.symbol}`) : ""}`);
      }
    }
    if (evidence && evidence.symbols.length > 0) {
      push(
        `${BODY_INDENT}${c.dim(`vulnerable ${evidence.symbols.length === 1 ? "export" : "exports"}: ${evidence.symbols.join(", ")}`)}`,
      );
    }
  }

  if (finding.exploitPath) push("", heading("Exploit path"), ...paragraph(finding.exploitPath, wrap));

  if (finding.dataflow) {
    push("", heading("Data flow"));
    push(`${BODY_INDENT}${c.dim("source")}  ${finding.dataflow.sourceKind}`);
    for (const step of finding.dataflow.steps ?? []) {
      const where = step.location ? c.dim(`${step.location.file}:${step.location.startLine}`) : "";
      push(`${BODY_INDENT}${c.dim(glyph.arrow)} ${joinDots([step.label, c.dim(step.role), where])}`);
    }
    push(`${BODY_INDENT}${c.dim("sink")}    ${finding.dataflow.sinkKind}`);
    if (finding.dataflow.ineffectiveSanitizers?.length) {
      push(`${BODY_INDENT}${c.yellow(`ineffective: ${finding.dataflow.ineffectiveSanitizers.join(", ")}`)}`);
    }
  }

  if (finding.intelligenceSources.length > 0) {
    push("", heading("Research"));
    for (const source of finding.intelligenceSources) {
      push(`${BODY_INDENT}${joinDots([c.magenta(source.source), source.title ?? "untitled", c.dim(`${source.confidence}% match`)])}`);
      push(...paragraph(source.rationale, wrap - 2, c.dim).map((value) => `  ${value}`));
      push(`${BODY_INDENT}  ${c.dim(source.sourceUrl)}`);
    }
  }

  if (finding.remediation?.summary || finding.remediation?.guidance) {
    push("", heading("Remediation"));
    push(...paragraph(finding.remediation.summary, wrap));
    if (finding.remediation.guidance && finding.remediation.guidance !== finding.remediation.summary) {
      push("", ...paragraph(finding.remediation.guidance, wrap, c.dim));
    }
  }

  push(...renderFixSection(row.fix, width, status));

  push("");
  const hint = hintLine(detailNext(finding, row.fix, flag));
  if (hint) push(hint);
  const view = viewOn("finding", providerLabel(providerOf(project)), sourceUrlFor(project, finding, ref));
  if (view) push(view);
  push("");
  return lines;
}

export async function reproducedCommand(
  globals: GlobalOptions,
  options: ReproducedOptions & { onlyMatched?: boolean },
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
  // An empty or short list is read as good news. If the scan behind it stopped
  // early, that reading is wrong, so the list carries the qualifier.
  const readScan = scanIfSame(project.scan, first.scanId);

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
        ...coverageEnvelope(readScan),
        counts,
        findings: rows.map((row) => compactFinding(row.finding, row.fix)),
      },
      rows[0]
        ? [
            `cf reproduced show ${rows[0].finding.id} --repo ${project.fullName} --agent`,
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
      ...coverageEnvelope(readScan),
      findings: rows.map((row) => ({ ...row.finding, fix: row.fix })),
    });
    return options.exitCode && worst ? 1 : 0;
  }

  if (await openIfRequested(globals.web, project.htmlUrl, { hosts: CODE_HOSTS, what: "this repository" })) {
    return 0;
  }

  const head = rows[0];
  const flag = repoFlag(globals, project);

  const empty = !first.scanId
    ? `${project.fullName} has not been scanned yet.`
    : options.onlyMatched
      ? `No findings in ${project.fullName} are joined to research yet.`
      : `No findings in ${project.fullName}.`;

  const banner = isPartialScan(readScan)
    ? [
        `${toneMark("attention")} The scan behind these findings did not cover the whole repository.`,
        ...coverageLines(readScan).map((detail) => `  ${c.dim(detail)}`),
      ]
    : [];

  printGrouped<Row>({
    noun: options.onlyMatched ? "matched finding" : "finding",
    scope: scope.label ? `${project.fullName}#${scope.label}` : project.fullName,
    total: first.total,
    banner,
    groups: WIRE_SEVERITIES.map((severity) => ({
      label: displaySeverity(severity),
      tint: severityColor(severity),
      rows: rows.filter((row) => row.finding.severity === severity),
    })),
    columns: [
      { header: "id", value: (row) => c.dim(shortId(row.finding.id)), min: 8, overflow: "never" },
      { header: "title", value: (row) => row.finding.title, min: 16, flex: true },
      { header: "location", value: (row) => locationOf(row.finding), min: fileFloor(rows, terminalWidth()), max: 40, overflow: "path" },
      { header: "reach", value: (row) => reachCell(row.finding), min: 7 },
      { header: "status", value: listStatus, overflow: "never" },
    ],
    pipeColumns: [
      { header: "severity", value: (row) => displaySeverity(row.finding.severity).toLowerCase() },
      { header: "location", value: (row) => locationOf(row.finding) },
      { header: "rule", value: (row) => row.finding.ruleId ?? "" },
      { header: "fix", value: (row) => row.fix?.status ?? "no-fix" },
      { header: "title", value: (row) => row.finding.title },
      { header: "reachability", value: (row) => row.finding.reachability ?? "" },
      { header: "status", value: (row) => statusFor(progressOf(row.finding, row.fix)).kind },
    ],
    empty,
    emptyHint: first.scanId ? null : `Run cf scan --repo ${project.fullName}.`,
    footnote: first.hasMore ? `Use --limit ${Math.min(1000, first.total)} to see them all.` : null,
    next: head
      ? [{ command: `cf reproduced show ${shortId(head.finding.id)}${flag}`, purpose: "read a finding in full" }]
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

export const SEVERITY_ALIASES: Record<string, string> = {
  critical: "critical",
  high: "high",
  watch: "medium",
  medium: "medium",
  info: "low",
  low: "low",
};

export const FINDING_CATEGORIES = ["code", "dependency", "secret", "misconfig", "os-package"];

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
    if (!FINDING_CATEGORIES.includes(part)) {
      throw new UsageError(
        `${part} is not a category.`,
        `Use ${FINDING_CATEGORIES.join(", ")}.`,
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
      "Use at least four characters of the id shown by cf reproduced.",
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
      `Run cf reproduced --repo ${project.fullName} to list finding ids.`,
      "finding_not_found",
    );
  }
  throw new UsageError(
    `${candidate} matches ${matches.length} findings in ${project.fullName}.`,
    `Use more characters: ${matches.slice(0, 3).map((finding) => shortId(finding.id)).join(", ")}.`,
    "finding_id_ambiguous",
  );
}

export async function reproducedShow(
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
      `Run cf reproduced --repo ${project.fullName} to list finding ids.`,
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

  page(renderDetail(project, { finding, fix }, terminalWidth(), scope.label, repoFlag(globals, project)));
  return 0;
}
