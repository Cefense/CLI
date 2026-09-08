import { openSession, type GlobalOptions, type Session } from "../core/session.js";
import type { Finding, Fix, Project } from "../core/types.js";
import { printGrouped } from "../ui/list.js";
import { resolveLinkedProject } from "./link.js";
import * as out from "../ui/output.js";
import { shortId } from "../ui/format.js";
import { c, displaySeverity, severityColor, severityRank } from "../ui/theme.js";
import { isAgentMode } from "../ui/mode.js";
import { compactFix } from "../core/compact.js";

interface Row {
  finding: Finding;
  fix: Fix | null;
}

async function loadRows(session: Session, project: Project): Promise<{ rows: Row[]; scanId: string | null }> {
  const response = await session.client.findings(project.githubRepoId);
  if (!response.scanId) return { rows: [], scanId: null };

  const { fixes } = await session.client.fixesForScan(response.scanId).catch(() => ({ fixes: [] as Fix[] }));
  const byFinding = new Map(fixes.map((fix) => [fix.findingId, fix]));

  const rows = response.findings
    .map((finding) => ({ finding, fix: byFinding.get(finding.id) ?? null }))
    .sort(
      (left, right) =>
        severityRank(left.finding.severity) - severityRank(right.finding.severity) ||
        left.finding.filePath.localeCompare(right.finding.filePath),
    );
  return { rows, scanId: response.scanId };
}

export async function fixCommand(globals: GlobalOptions): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const { project } = await resolveLinkedProject(session, globals);

  const { rows, scanId } = await loadRows(session, project);

  if (isAgentMode()) {
    out.agentEmit({
      repository: project.fullName,
      scanId,
      fixes: rows
        .filter((row) => row.fix)
        .map((row) => compactFix(row.fix as Fix, { diff: true })),
    });
    return 0;
  }

  if (out.isJsonMode()) {
    out.json({ repository: project.fullName, scanId, fixes: rows.map((row) => row.fix).filter(Boolean) });
    return 0;
  }

  const groups: Array<{ key: string; label: string; tint: (value: string) => string }> = [
    { key: "ready", label: "Ready to publish", tint: c.green },
    { key: "opened", label: "Pull request open", tint: c.green },
    { key: "merged", label: "Merged", tint: c.green },
    { key: "publishing", label: "Publishing", tint: c.cyan },
    { key: "generating", label: "Generating", tint: c.cyan },
    { key: "failed", label: "Failed", tint: c.red },
    { key: "closed", label: "Closed", tint: c.yellow },
    { key: "none", label: "No patch yet", tint: c.dim },
  ];

  const ready = rows.find((row) => row.fix?.status === "ready");
  const bare = rows.find((row) => !row.fix);
  const next: Array<{ command: string; purpose: string }> = [];
  if (bare) {
    next.push({
      command: `cf fix generate ${shortId(bare.finding.id)}`,
      purpose: "write a patch for a finding",
    });
  }
  if (ready) {
    next.push({
      command: `cf fix show ${shortId(ready.finding.id)}`,
      purpose: "read the patch before publishing",
    });
    next.push({
      command: `cf fix publish ${shortId(ready.finding.id)}`,
      purpose: "open a pull request with it",
    });
  }

  printGrouped<Row>({
    noun: "finding",
    scope: project.fullName,
    footnote: `${rows.filter((row) => row.fix).length} of ${rows.length} have a patch.`,
    groups: groups.map((group) => ({
      label: group.label,
      tint: group.tint,
      rows: rows.filter((row) => (row.fix?.status ?? "none") === group.key),
    })),
    columns: [
      { header: "id", value: (row) => c.dim(shortId(row.finding.id)), min: 8, max: 8 },
      {
        header: "severity",
        value: (row) =>
          severityColor(row.finding.severity)(displaySeverity(row.finding.severity).toLowerCase()),
        min: 8,
        max: 8,
      },
      { header: "file", value: (row) => row.finding.filePath, min: 16, max: 34 },
      { header: "title", value: (row) => row.finding.title, min: 28 },
      {
        header: "pr",
        value: (row) => (row.fix?.prNumber ? c.cyan(`#${row.fix.prNumber}`) : ""),
        min: 1,
      },
    ],
    pipeColumns: [
      { header: "severity", value: (row) => displaySeverity(row.finding.severity).toLowerCase() },
      { header: "file", value: (row) => row.finding.filePath },
      { header: "status", value: (row) => row.fix?.status ?? "none" },
      { header: "pr", value: (row) => row.fix?.prUrl ?? "" },
      { header: "title", value: (row) => row.finding.title },
    ],
    empty: scanId
      ? `No findings in ${project.fullName} to fix.`
      : `${project.fullName} has not been scanned yet.`,
    emptyHint: scanId ? null : `Run cf scan --repo ${project.fullName}.`,
    next,
  });

  return 0;
}
