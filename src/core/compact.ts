import type { Finding, Fix, Project, WireSeverity } from "./types.js";

export const AGENT_SCHEMA_VERSION = 1;

export function severityLabel(severity: WireSeverity | string): string {
  if (severity === "critical") return "Critical";
  if (severity === "high") return "High";
  if (severity === "medium") return "Watch";
  return "Info";
}

export function prune<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === null || entry === undefined) continue;
    if (Array.isArray(entry) && entry.length === 0) continue;
    result[key] = entry;
  }
  return result;
}

export function compactFix(fix: Fix, options: { diff?: boolean } = {}): Record<string, unknown> {
  return prune({
    id: fix.id,
    findingId: fix.findingId,
    status: fix.status,
    file: fix.filePath,
    baseSha: fix.baseSha,
    branch: fix.branch,
    prUrl: fix.prUrl,
    prNumber: fix.prNumber,
    error: fix.error,
    explanation: fix.explanation,
    hasDiff: Boolean(fix.diff),
    diff: options.diff ? fix.diff : null,
  });
}

export function compactFinding(
  finding: Finding,
  fix: Fix | null,
  options: { diff?: boolean } = {},
): Record<string, unknown> {
  return prune({
    id: finding.id,
    severity: finding.severity,
    severityLabel: severityLabel(finding.severity),
    title: finding.title,
    file: finding.filePath,
    line: finding.startLine,
    endLine: finding.endLine === finding.startLine ? null : finding.endLine,
    category: finding.category,
    cve: finding.cveId,
    cwe: finding.cwe,
    rule: finding.ruleId,
    description: finding.description,
    code: finding.vulnerableCode,
    guidance: finding.remediation?.guidance ?? finding.remediation?.summary ?? null,
    matchedSources: finding.intelligenceSources.length || null,
    fix: fix ? compactFix(fix, options) : null,
  });
}

export function compactProject(project: Project): Record<string, unknown> {
  return prune({
    repository: project.fullName,
    githubRepoId: project.githubRepoId,
    private: project.private,
    defaultBranch: project.defaultBranch,
    url: project.htmlUrl,
    scan: project.scan
      ? prune({
          id: project.scan.id,
          status: project.scan.status,
          findings: project.scan.findingCount,
          finishedAt: project.scan.finishedAt ?? project.scan.createdAt,
        })
      : null,
  });
}

export function compactFindingDetail(
  finding: Finding,
  fix: Fix | null,
): Record<string, unknown> {
  const base = compactFinding(finding, fix, { diff: true });
  return prune({
    ...base,
    state: finding.state,
    confidence: finding.confidence,
    symbol: finding.symbol,
    remediation: finding.remediation
      ? prune({
          summary: finding.remediation.summary,
          guidance: finding.remediation.guidance,
        })
      : null,
    dataflow: finding.dataflow
      ? prune({
          source: finding.dataflow.sourceKind,
          sink: finding.dataflow.sinkKind,
          steps: (finding.dataflow.steps ?? []).map((step) =>
            prune({
              label: step.label,
              role: step.role,
              file: step.location?.file ?? null,
              line: step.location?.startLine ?? null,
            }),
          ),
          ineffectiveSanitizers: finding.dataflow.ineffectiveSanitizers ?? [],
        })
      : null,
    research: finding.intelligenceSources.map((source) =>
      prune({
        source: source.source,
        title: source.title,
        confidence: source.confidence,
        rationale: source.rationale,
        url: source.sourceUrl,
      }),
    ),
    references: finding.vulnerabilityRefs.map((ref) =>
      prune({ kind: ref.kind, id: ref.identifier, title: ref.title, url: ref.url }),
    ),
  });
}
