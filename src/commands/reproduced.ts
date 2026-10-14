import { openSession, type GlobalOptions } from "../core/session.js";
import { UsageError } from "../core/errors.js";
import type { AttackStep, Chain, Finding, Fix, Project, RouteHop } from "../core/types.js";
import type { Session } from "../core/session.js";
import { blobUrl, providerLabel, providerOf } from "../core/providers.js";
import { hintLine, printGrouped, type NextStep } from "../ui/list.js";
import { resolveBranch, resolveLinkedProject } from "./link.js";
import { renderFixBody, statusLabel, statusState } from "./fixactions.js";
import * as out from "../ui/output.js";
import { datedLabel, padEnd, pathFloor, shortId, terminalWidth, wrapText } from "../ui/format.js";
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
import {
  FINDING_ROW,
  compactFinding,
  compactFindingDetail,
  coverageEnvelope,
  progressOf,
  verdictLabel,
} from "../core/compact.js";
import {
  REACHABILITY_LEDES,
  isReachabilityVerdict,
  reachabilityLabel,
  statusFor,
  type FindingStatus,
} from "../core/findingStatus.js";
import {
  WEAKNESS_ONLY_NOTE,
  assetKindLabel,
  formatDollarRange,
  hasFullChain,
  isSeen,
  sourceLabel,
  tacticLabel,
} from "../core/chain.js";
import { coverageLines, isPartialScan, scanIfSame } from "../core/coverage.js";
import { CODE_HOSTS, openIfRequested } from "../ui/open.js";
import { page } from "../ui/pager.js";

export interface ReproducedOptions {
  severity?: string;
  category?: string;
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

function sub(label: string): string {
  return `${BODY_INDENT}${c.dim(label)}`;
}

function stepState(step: AttackStep): string {
  if (!isSeen(step)) return c.dim("predicted");
  const from = step.observedFrom ? ` from ${step.observedFrom}` : "";
  return c.red(`seen ${datedLabel(step.observedAt)}${from}`);
}

export function stepLine(step: AttackStep, idWidth = step.id.length): string {
  return `${BODY_INDENT}${joinColumns([
    padEnd(step.id, idWidth),
    step.name,
    step.tactics.length > 0 ? c.dim(step.tactics.map(tacticLabel).join(", ")) : null,
    stepState(step),
    c.dim(sourceLabel(step.source)),
  ])}`;
}

function joinColumns(parts: Array<string | null | undefined>): string {
  return parts.filter((part): part is string => Boolean(part)).join("  ");
}

function packageLines(dependency: NonNullable<Finding["dependency"]>): string[] {
  const lines = [
    "",
    sub("Package"),
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
  ];
  for (const chain of dependency.paths.filter((entry) => entry.length > 1).slice(0, 3)) {
    lines.push(`${BODY_INDENT}${c.dim(chain.join(` ${glyph.arrow} `))}`);
  }
  return lines;
}

function reachabilityLines(finding: Finding, wrap: number): string[] {
  if (!isReachabilityVerdict(finding.reachability)) return [];
  const evidence = finding.reachabilityEvidence;
  const lines = ["", sub("Reachability"), ...paragraph(evidence?.why ?? REACHABILITY_LEDES[finding.reachability], wrap)];
  const path = evidence?.path ?? [];
  if (path.length > 1) {
    for (const step of path) {
      lines.push(`${BODY_INDENT}${c.dim(glyph.arrow)} ${step.path}${step.symbol ? c.dim(` ${step.symbol}`) : ""}`);
    }
  }
  if (evidence && evidence.symbols.length > 0) {
    lines.push(
      `${BODY_INDENT}${c.dim(`vulnerable ${evidence.symbols.length === 1 ? "export" : "exports"}: ${evidence.symbols.join(", ")}`)}`,
    );
  }
  return lines;
}

function dataflowLines(finding: Finding): string[] {
  if (!finding.dataflow) return [];
  const lines = ["", sub("Data flow")];
  lines.push(`${BODY_INDENT}${c.dim("source")}  ${finding.dataflow.sourceKind}`);
  for (const step of finding.dataflow.steps ?? []) {
    const where = step.location ? c.dim(`${step.location.file}:${step.location.startLine}`) : "";
    lines.push(`${BODY_INDENT}${c.dim(glyph.arrow)} ${joinDots([step.label, c.dim(step.role), where])}`);
  }
  lines.push(`${BODY_INDENT}${c.dim("sink")}    ${finding.dataflow.sinkKind}`);
  if (finding.dataflow.ineffectiveSanitizers?.length) {
    lines.push(`${BODY_INDENT}${c.yellow(`ineffective: ${finding.dataflow.ineffectiveSanitizers.join(", ")}`)}`);
  }
  return lines;
}

function routeLines(route: RouteHop[]): string[] {
  if (route.length === 0) return [];
  const lines = ["", sub("Route")];
  for (const hop of route) {
    const where = hop.file ? c.dim(hop.line ? `${hop.file}:${hop.line}` : hop.file) : null;
    lines.push(`${BODY_INDENT}${c.dim(glyph.arrow)} ${joinDots([hop.label, c.dim(hop.role), where])}`);
  }
  return lines;
}

export function weaknessBlock(finding: Finding, wrap: number, evidence: boolean): string[] {
  const weakness = finding.chain?.weakness;
  const cve = weakness?.cve ?? finding.cveId;
  const cwe = weakness?.cwe ?? finding.cwe;
  const lines = ["", heading("Weakness")];
  if (cve) lines.push(`${BODY_INDENT}${cve}`);
  if (cwe) lines.push(`${BODY_INDENT}${joinColumns([cwe, weakness?.cweName ?? null])}`);
  const also = (weakness?.cweIds ?? []).filter((id) => id !== cwe);
  if (also.length > 0) lines.push(`${BODY_INDENT}${c.dim(`also ${also.join(", ")}`)}`);
  if (!cve && !cwe) lines.push(`${BODY_INDENT}${c.dim("No CVE or CWE is recorded for this finding.")}`);

  if (finding.vulnerableCode?.trim()) {
    lines.push("", sub("Code"), ...codeBlock(finding.vulnerableCode, finding.startLine, wrap));
  }
  if (finding.dependency) lines.push(...packageLines(finding.dependency));
  lines.push(...reachabilityLines(finding, wrap));
  if (evidence) {
    if (finding.exploitPath) lines.push("", sub("Exploit path"), ...paragraph(finding.exploitPath, wrap));
    lines.push(...dataflowLines(finding));
  }
  if (finding.chain?.shown === "weakness-only") lines.push("", `${BODY_INDENT}${c.dim(WEAKNESS_ONLY_NOTE)}`);
  return lines;
}

export function attackBlock(finding: Finding & { chain: Chain }, wrap: number): string[] {
  const attack = finding.chain.attack;
  const lines = ["", heading("Attack")];
  if (attack.capec) lines.push(`${BODY_INDENT}${joinColumns([attack.capec.id, attack.capec.name])}`);
  const idWidth = Math.max(0, ...attack.steps.map((step) => step.id.length));
  for (const step of attack.steps) lines.push(stepLine(step, idWidth));
  if (!attack.capec && attack.steps.length === 0) {
    lines.push(`${BODY_INDENT}${c.dim("No attack pattern is mapped for this weakness.")}`);
  }
  if (attack.route.length > 0) lines.push(...routeLines(attack.route));
  else lines.push(...dataflowLines(finding));
  if (finding.dataflow?.ineffectiveSanitizers?.length && attack.route.length > 0) {
    lines.push(`${BODY_INDENT}${c.yellow(`ineffective: ${finding.dataflow.ineffectiveSanitizers.join(", ")}`)}`);
  }
  if (finding.exploitPath) lines.push("", sub("Exploit path"), ...paragraph(finding.exploitPath, wrap));
  return lines;
}

export function impactBlock(finding: Finding & { chain: Chain }, wrap: number): string[] {
  const lines = ["", heading("Impact")];
  const assets = finding.chain.impact.assets;
  for (const asset of assets) {
    lines.push(`${BODY_INDENT}${joinColumns([`${assetKindLabel(asset.kind)} ${asset.name}`, asset.detail ? c.dim(asset.detail) : null])}`);
  }
  if (assets.length === 0) lines.push(`${BODY_INDENT}${c.dim("No asset is mapped for this finding.")}`);

  const loss = finding.loss;
  if (loss) {
    lines.push("", `${BODY_INDENT}${formatDollarRange(loss.low, loss.high)} for one incident ${c.dim(`(estimate, ${loss.formulaVersion})`)}`);
    for (const input of loss.inputs) {
      for (const wrapped of wrapText(`${input.label}: ${input.value}`, wrap - 2)) lines.push(`${BODY_INDENT}  ${c.dim(wrapped)}`);
    }
  } else {
    lines.push("", `${BODY_INDENT}${c.dim("No cost estimate yet. cf org context shows what it needs.")}`);
  }

  const likelihood = finding.likelihood;
  if (likelihood) {
    lines.push("", `${BODY_INDENT}Likelihood ${likelihood.score} of 100`);
    for (const signal of likelihood.signals) {
      for (const wrapped of wrapText(signal.label, wrap - 2)) lines.push(`${BODY_INDENT}  ${c.dim(wrapped)}`);
    }
  }
  return lines;
}

function fixBlock(finding: Finding, fix: Fix | null, width: number, status: FindingStatus): string[] {
  const wrap = readingWidth(width);
  const lines = ["", heading("Fix")];
  for (const ref of finding.chain?.fix.d3fend ?? []) {
    lines.push(`${BODY_INDENT}${joinColumns([ref.id, ref.name, c.dim(ref.tactic)])}`);
  }
  if (finding.remediation?.summary || finding.remediation?.guidance) {
    if (lines.length > 2) lines.push("");
    lines.push(...paragraph(finding.remediation.summary, wrap));
    if (finding.remediation.guidance && finding.remediation.guidance !== finding.remediation.summary) {
      lines.push("", ...paragraph(finding.remediation.guidance, wrap, c.dim));
    }
  }
  const body = renderFixBody(fix, width, status);
  if (lines.length > 2 && body.length > 0) lines.push("");
  lines.push(...body);
  return lines;
}

export function proofBlock(finding: Finding, fix: Fix | null): string[] {
  const proof = finding.progress?.proof ?? null;
  const lines = ["", heading("Proof")];
  if (!proof) {
    lines.push(`${BODY_INDENT}${c.dim(fix ? "No proof has run on this patch yet." : "Nothing to prove until there is a patch.")}`);
  } else if (proof.status === "running") {
    lines.push(`${BODY_INDENT}${c.cyan("Proving the patch.")}`);
  } else if (proof.status === "failed") {
    lines.push(`${BODY_INDENT}${c.red("The proof could not run.")}`);
  } else if (proof.verdict) {
    const tone = proof.verdict === "refuted" ? c.red : proof.verdict === "proven" || proof.verdict === "argued" ? c.green : c.yellow;
    lines.push(`${BODY_INDENT}${tone(verdictLabel(proof.verdict))}  ${c.dim(proof.verdict)}`);
  }
  return lines;
}

export function renderDetail(
  project: Project,
  row: Row,
  width: number,
  ref: string | null | undefined,
  flag: string,
): string[] {
  const finding = row.finding;
  const wrap = readingWidth(width);
  const status = statusFor(progressOf(finding, row.fix));
  const full = hasFullChain(finding);
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
      ["Rule", finding.ruleId],
      ["Confidence", finding.confidence !== null ? finding.confidence.toFixed(2) : null],
      ["State", finding.state && finding.state !== "CANDIDATE" ? finding.state.toLowerCase() : null],
      ["Introduced", finding.introducedIn ? originLabel(finding.introducedIn) : null],
      ["Found", datedLabel(finding.createdAt)],
    ]),
  );

  if (finding.description) push("", ...paragraph(finding.description, wrap));

  push(...weaknessBlock(finding, wrap, !full));
  if (full) {
    push(...attackBlock(finding, wrap));
    push(...impactBlock(finding, wrap));
  }
  push(...fixBlock(finding, row.fix, width, status));
  push(...proofBlock(finding, row.fix));

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
  options: ReproducedOptions,
): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const { project } = await resolveLinkedProject(session, globals);
  const scope = await resolveScope(session, project, options);

  const query = {
    limit: options.limit,
    severity: normaliseSeverity(options.severity),
    category: normaliseCategory(options.category),
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
    const pick =
      rows.find(
        (row) =>
          row.finding.reachability === "reachable" &&
          statusFor(progressOf(row.finding, row.fix)).kind === "none",
      ) ?? rows[0];
    const repo = `--repo ${project.fullName}`;
    const scoped = `${repo}${scope.label ? ` --branch ${scope.label}` : ""}${options.scanId ? ` --scan ${options.scanId}` : ""}`;
    const filters = [
      query.severity ? `--severity ${query.severity}` : "",
      query.category ? `--category ${query.category}` : "",
    ]
      .filter(Boolean)
      .map((flag) => ` ${flag}`)
      .join("");
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
      pick
        ? [
            `cf reproduced show ${pick.finding.id} ${scoped} --agent`,
            first.hasMore
              ? `cf reproduced ${scoped}${filters} --limit ${Math.min(1000, first.total)} --agent`
              : "",
          ]
        : [first.scanId ? "" : `cf scan ${repo} --wait --agent`],
      { findings: FINDING_ROW },
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
    : `No findings in ${project.fullName}.`;

  const banner = isPartialScan(readScan)
    ? [
        `${toneMark("attention")} The scan behind these findings did not cover the whole repository.`,
        ...coverageLines(readScan).map((detail) => `  ${c.dim(detail)}`),
      ]
    : [];

  printGrouped<Row>({
    noun: "finding",
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
    const repo = `--repo ${project.fullName}`;
    const proof = finding.progress?.proof ?? null;
    out.agentEmit(
      { repository: project.fullName, finding: compactFindingDetail(finding, fix) },
      !fix || fix.status === "failed" || fix.status === "skipped"
        ? [`cf fix generate ${resolved} ${repo} --wait --agent`]
        : fix.status !== "ready"
          ? [`cf fix show ${resolved} ${repo} --agent`]
          : !proof
            ? [`cf proof run ${resolved} ${repo} --wait --agent`]
            : proof.status === "running"
              ? [`cf proof show ${resolved} ${repo} --agent`]
              : proof.verdict === "refuted"
                ? [`cf fix generate ${resolved} ${repo} --wait --agent`]
                : [`cf fix publish ${resolved} ${repo} --yes --agent`],
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
