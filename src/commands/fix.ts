import open from "open";
import { openSession, type GlobalOptions, type Session } from "../core/session.js";
import type { Finding, Fix, Project } from "../core/types.js";
import { browse } from "../ui/browser.js";
import { resolveLinkedProject } from "./link.js";
import * as out from "../ui/output.js";
import { relativeTime, wrapText } from "../ui/format.js";
import { c, displaySeverity, glyph, severityColor, severityRank } from "../ui/theme.js";
import { fixActions, fixLabel, renderDiff } from "./fixactions.js";

interface Row {
  finding: Finding;
  fix: Fix | null;
}

function detail(row: Row, width: number): string[] {
  const lines: string[] = [];
  const push = (value = "") => lines.push(value ? `  ${value}` : "");
  const body = Math.min(96, width - 4);

  push();
  push(
    `${c.bold(row.finding.title)}   ${severityColor(row.finding.severity)(displaySeverity(row.finding.severity))}`,
  );
  push();

  if (!row.fix) {
    push(c.dim(`${row.finding.filePath}   ${row.finding.ruleId ?? ""}`));
    push();
    push("No fix has been generated for this finding yet.");
    push();
    push(c.dim("Press g to generate one."));
    push();
    return lines;
  }

  push(
    c.dim(
      [row.fix.filePath, `base ${row.fix.baseSha.slice(0, 7)}`].join("      "),
    ),
  );
  push();

  if (row.fix.status === "failed") {
    push(c.red(row.fix.error ?? "Generation failed."));
    push();
    return lines;
  }

  if (row.fix.status === "generating" || row.fix.status === "publishing") {
    push(c.cyan(`${row.fix.status}, this can take a minute.`));
    push();
    return lines;
  }

  if (row.fix.diff) {
    push(c.dim("PATCH"));
    push();
    for (const diffLine of renderDiff(row.fix.diff).slice(0, 200)) push(diffLine);
    push();
  }

  if (row.fix.explanation) {
    push(c.dim("WHY"));
    push();
    for (const wrapped of wrapText(row.fix.explanation, body)) push(wrapped);
    push();
  }

  if (row.fix.prUrl) {
    push(c.dim("PULL REQUEST"));
    push();
    push(c.cyan(row.fix.prUrl));
    push();
  } else {
    push(c.dim("Press p to open a pull request with this patch."));
    push();
  }

  return lines;
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

  if (out.isJsonMode()) {
    out.json({ repository: project.fullName, scanId, fixes: rows.map((row) => row.fix).filter(Boolean) });
    return 0;
  }

  if (rows.length === 0) {
    out.line();
    out.info(
      scanId
        ? `No findings in ${c.bold(project.fullName)} to fix.`
        : `${c.bold(project.fullName)} has not been scanned yet.`,
    );
    if (!scanId) out.hint("Run cf scan.");
    out.line();
    return 0;
  }

  if (out.isPiped()) {
    for (const row of rows) {
      out.line(
        [
          displaySeverity(row.finding.severity).toLowerCase(),
          row.finding.filePath,
          row.fix?.status ?? "none",
          row.fix?.prUrl ?? "",
          row.finding.title,
        ].join("\t"),
      );
    }
    return 0;
  }

  const refresh = async () => (await loadRows(session, project)).rows;

  await browse(rows, {
    header: (visible) => {
      const ready = visible.filter((row) => row.fix?.status === "ready").length;
      const opened = visible.filter((row) => row.fix?.status === "opened").length;
      const summary = [
        `${visible.length} ${visible.length === 1 ? "finding" : "findings"}`,
        ready > 0 ? c.green(`${ready} ready`) : "",
        opened > 0 ? c.green(`${opened} in a pull request`) : "",
      ]
        .filter(Boolean)
        .join(c.dim("  ·  "));
      return ["", `  ${c.bold(project.fullName)}   ${c.dim(summary)}`, ""];
    },
    renderRow: (row, selected) => {
      const marker = selected ? c.cyan(glyph.arrow) : " ";
      const severity = severityColor(row.finding.severity)(
        `${glyph.dot} ${displaySeverity(row.finding.severity).toLowerCase().padEnd(8)}`,
      );
      const title = selected ? c.bold(row.finding.title) : row.finding.title;
      return [
        `${marker} ${severity} ${title}`,
        `    ${c.dim(row.finding.filePath)}   ${fixLabel(row.fix)}`,
        "",
      ];
    },
    renderDetail: detail,
    filterText: (row) => `${row.finding.title} ${row.finding.filePath} ${row.fix?.status ?? ""}`,
    emptyMessage: "Nothing matches that filter.",
    refresh,
    actions: [
      ...fixActions<Row>(session, project, (row) =>
        row ? { findingId: row.finding.id, fix: row.fix } : null,
      ),
      {
        key: "u",
        label: "refresh",
        run: async (_row, context) => {
          await context.refresh();
          context.setStatus("Refreshed.");
        },
      },
    ],
  });

  return 0;
}
