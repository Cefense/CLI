import type {
  AuditEvent,
  Branch,
  CommitEntry,
  Finding,
  FindingDependency,
  FindingProgress,
  FindingProof,
  Fix,
  Project,
  ProofVerdict,
  ScanSummary,
  WireSeverity,
} from "./types.js";
import type { Organization } from "./organizations.js";
import { providerOf } from "./providers.js";
import { reachabilityLabel, statusFor } from "./findingStatus.js";

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
    files: (fix.files ?? []).length > 1 ? (fix.files ?? []).map((file) => file.path) : null,
    behaviorChange: fix.behaviorChange ?? null,
    behaviorNote: fix.behaviorNote ?? null,
    hasDiff: Boolean(fix.diff),
    diff: options.diff ? fix.diff : null,
  });
}

/**
 * How a verdict reads in a sentence, for output an agent quotes back to a user.
 *
 * The labels match the workspace's proof strip, so a person reading the
 * dashboard and an agent reading the CLI are told the same word.
 */
export function verdictLabel(verdict: ProofVerdict | string): string {
  if (verdict === "proven") return "Proven";
  if (verdict === "argued") return "Argued";
  if (verdict === "incomplete") return "Incomplete";
  if (verdict === "refuted") return "Refuted";
  if (verdict === "unprovable") return "Nothing to prove";
  return verdict;
}

/**
 * `blocksPublish` reports what the API actually enforces, which is that a
 * refuted proof against this exact patch stops the pull request. The workspace
 * holds its button on more than that, but stating the stricter rule here would
 * have the CLI refusing things the server would have allowed.
 */
export function compactProof(
  proof: FindingProof,
  options: { checks?: boolean } = {},
): Record<string, unknown> {
  return prune({
    id: proof.id,
    findingId: proof.findingId,
    kind: proof.kind,
    status: proof.status,
    verdict: proof.verdict,
    verdictLabel: proof.verdict ? verdictLabel(proof.verdict) : null,
    blocksPublish: proof.verdict === "refuted" ? true : null,
    summary: proof.summary,
    checks:
      options.checks === false
        ? []
        : proof.checks.map((check) =>
            prune({
              id: check.id,
              label: check.label,
              verdict: check.verdict,
              evidence: check.evidence,
              model: check.model ?? null,
            }),
          ),
    witness: proof.witness
      ? prune({
          entry: proof.witness.entry,
          attackInput: proof.witness.attackInput,
          expectedFailure: proof.witness.expectedFailure,
          assertions: proof.witness.assertions ?? [],
          target: proof.witness.target
            ? prune({
                callable: proof.witness.target.callable,
                module: proof.witness.target.module,
                argShape: proof.witness.target.argShape,
              })
            : null,
          httpRequest: proof.witness.httpRequest
            ? prune({ method: proof.witness.httpRequest.method, path: proof.witness.httpRequest.path })
            : null,
        })
      : null,
    baseSha: proof.baseSha,
    patchHash: proof.patchHash,
    attestedBy: proof.attestedBy,
    attestedAt: proof.attestedAt,
    attestationNote: proof.attestationNote,
    model: proof.model,
    error: proof.error,
    updatedAt: proof.updatedAt,
  });
}

export function progressOf(finding: Finding, fix: Fix | null): FindingProgress {
  if (finding.progress) return finding.progress;
  return { fix: fix ? { status: fix.status, prNumber: fix.prNumber } : null, proof: null };
}

export function compactDependency(dependency: FindingDependency | null | undefined): Record<string, unknown> | null {
  if (!dependency) return null;
  return prune({
    ecosystem: dependency.ecosystem,
    name: dependency.name,
    installed: dependency.installedVersion,
    fixedIn: dependency.fixedVersion,
    direct: dependency.direct,
    scope: dependency.scope,
    requiredBy: dependency.requiredBy,
    paths: dependency.paths,
    pathsTruncated: dependency.pathsTruncated ? true : null,
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
    reachability: finding.reachability ?? null,
    reachabilityLabel: reachabilityLabel(finding.reachability),
    status: statusFor(progressOf(finding, fix)).kind,
    package: finding.dependency
      ? `${finding.dependency.name}@${finding.dependency.installedVersion}`
      : null,
    fixedIn: finding.dependency?.fixedVersion ?? null,
    matchedSources: finding.intelligenceSources.length || null,
    introducedIn: finding.introducedIn
      ? prune({
          sha: finding.introducedIn.sha,
          shortSha: finding.introducedIn.sha.slice(0, 7),
          message: finding.introducedIn.message.split("\n")[0] ?? "",
          author: finding.introducedIn.authorName,
          committedAt: finding.introducedIn.committedAt,
        })
      : null,
    fix: fix ? compactFix(fix, options) : null,
  });
}

export function compactOrganization(
  organization: Organization,
  active: string | null,
): Record<string, unknown> {
  return prune({
    id: organization.id,
    slug: organization.slug,
    name: organization.name,
    role: organization.role,
    active: organization.slug === active ? true : null,
  });
}

/**
 * Coverage fields for a scan, for splicing into an agent envelope.
 *
 * `coverage` is emitted whenever the scan reported one, `"clean"` included:
 * an agent that only ever saw the field on partial scans could not tell a
 * complete scan from one run by a scanner too old to say. Absent means
 * unknown. Gaps are only meaningful when something was missed.
 */
export function coverageEnvelope(scan: ScanSummary | null): Record<string, unknown> {
  if (!scan?.outcome) return {};
  const gaps = scan.outcome === "partial" ? (scan.coverageGaps ?? []) : [];
  return prune({
    coverage: scan.outcome,
    coverageGaps: gaps.map((gap) => prune({ kind: gap.kind, detail: gap.detail, count: gap.count })),
  });
}

export function compactProject(project: Project): Record<string, unknown> {
  return prune({
    repository: project.fullName,
    provider: providerOf(project),
    githubRepoId: project.githubRepoId,
    private: project.private,
    defaultBranch: project.defaultBranch,
    url: project.htmlUrl,
    scanMode: project.scanMode ?? null,
    scanInterval: project.scanMode === "scheduled" ? (project.scanInterval ?? null) : null,
    scanDepth: project.scanDepth ?? null,
    checks: project.coverages ?? [],
    scan: project.scan
      ? prune({
          id: project.scan.id,
          status: project.scan.status,
          findings: project.scan.findingCount,
          ...coverageEnvelope(project.scan),
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
    exploitPath: finding.exploitPath,
    symbol: finding.symbol,
    statusDetail: statusFor(progressOf(finding, fix)).title,
    proof: finding.progress?.proof ? prune({ ...finding.progress.proof }) : null,
    reachabilityEvidence: finding.reachabilityEvidence
      ? prune({
          method: finding.reachabilityEvidence.method,
          why: finding.reachabilityEvidence.why,
          entryPoint: finding.reachabilityEvidence.entryPoint,
          path: finding.reachabilityEvidence.path.map((step) =>
            step.symbol ? `${step.path}#${step.symbol}` : step.path,
          ),
          importedFrom: finding.reachabilityEvidence.importedFrom,
          symbols: finding.reachabilityEvidence.symbols,
          scope: finding.reachabilityEvidence.scope,
        })
      : null,
    dependency: compactDependency(finding.dependency),
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

export function compactBranch(branch: Branch, defaultBranch: string | null): Record<string, unknown> {
  return prune({
    name: branch.name,
    default: branch.name === defaultBranch ? true : null,
    protected: branch.protected ? true : null,
    scanId: branch.scanId,
    scanStatus: branch.scanStatus,
    findings: branch.findingCount,
    scannedAt: branch.scannedAt,
  });
}

export function compactCommit(commit: CommitEntry): Record<string, unknown> {
  return prune({
    sha: commit.sha,
    shortSha: commit.sha.slice(0, 7),
    message: commit.message.split("\n")[0] ?? "",
    author: commit.authorLogin ?? commit.authorName,
    committedAt: commit.committedAt,
    scanned: commit.scanned,
    scanId: commit.scanId,
    scanStatus: commit.scanStatus,
    findings: commit.findingCount,
    introduced: commit.counts?.introduced ?? null,
    resolved: commit.counts?.resolved ?? null,
    suppressed: commit.counts?.suppressed ?? null,
  });
}

export function compactAuditEvent(event: AuditEvent): Record<string, unknown> {
  return prune({
    id: event.id,
    at: event.at,
    action: event.action,
    category: event.category,
    outcome: event.outcome,
    actor: `${event.actor.kind}:${event.actor.name}`,
    target: prune({ type: event.target.type, id: event.target.id, label: event.target.label }),
    summary: event.summary,
    changes: event.changes ?? [],
  });
}
