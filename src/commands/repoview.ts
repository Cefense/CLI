import { openSession, type GlobalOptions } from "../core/session.js";
import { compactProject } from "../core/compact.js";
import { coverageLines, isPartialScan } from "../core/coverage.js";
import { providerLabel, providerOf } from "../core/providers.js";
import type { Project } from "../core/types.js";
import { resolveLinkedProject } from "./link.js";
import { CHECKS, SCAN_DEPTHS, SCAN_INTERVALS, SCAN_MODES } from "./settings.js";
import { CODE_HOSTS, openIfRequested } from "../ui/open.js";
import { nextSteps } from "../ui/list.js";
import { isAgentMode } from "../ui/mode.js";
import { relativeTime } from "../ui/format.js";
import { c, glyph, scanStatusLabel } from "../ui/theme.js";
import * as out from "../ui/output.js";

function triggerOf(project: Project): string {
  const mode = project.scanMode ?? "manual";
  const label = SCAN_MODES.find((entry) => entry.id === mode)?.label ?? mode;
  if (mode !== "scheduled") return label;
  const every = SCAN_INTERVALS.find((entry) => entry.id === (project.scanInterval ?? "24h"));
  return every ? `${label}, ${every.label.toLowerCase()}` : label;
}

function depthOf(project: Project): string {
  const depth = project.scanDepth ?? "default";
  return SCAN_DEPTHS.find((entry) => entry.id === depth)?.label ?? depth;
}

function checksOf(project: Project): string {
  const names = (project.coverages ?? []).map(
    (id) => CHECKS.find((check) => check.id === id)?.name ?? id,
  );
  return names.length > 0 ? names.join(", ") : c.dim("none");
}

interface Entry {
  label: string;
  value: string;
  notes: string[];
}

function renderProject(project: Project): void {
  const scan = project.scan;
  const entries: Entry[] = [];

  if (scan) {
    entries.push({
      label: "last scan",
      value: `${scanStatusLabel(scan.status)}  ${c.dim(relativeTime(scan.finishedAt ?? scan.createdAt))}`,
      notes: scan.status === "failed" && scan.error ? [scan.error] : [],
    });
    entries.push({ label: "findings", value: String(scan.findingCount), notes: [] });
    if (isPartialScan(scan)) {
      entries.push({ label: "coverage", value: c.yellow("part of the repository"), notes: coverageLines(scan) });
    } else if (scan.outcome === "clean") {
      entries.push({ label: "coverage", value: "the whole repository", notes: [] });
    }
  } else {
    entries.push({ label: "last scan", value: scanStatusLabel(null), notes: [] });
  }
  entries.push({ label: "trigger", value: triggerOf(project), notes: [] });
  entries.push({ label: "depth", value: depthOf(project), notes: [] });
  entries.push({ label: "checks", value: checksOf(project), notes: [] });

  const width = Math.max(...entries.map((entry) => entry.label.length));
  const gutter = " ".repeat(width);

  out.line();
  out.line(`  ${c.bold(project.fullName)}`);
  out.line(
    `  ${c.dim(
      [
        providerLabel(providerOf(project)),
        project.private ? "private" : "public",
        project.defaultBranch ? `default branch ${project.defaultBranch}` : null,
      ]
        .filter(Boolean)
        .join(` ${glyph.sep} `),
    )}`,
  );
  out.line();
  for (const entry of entries) {
    out.line(`  ${c.dim(entry.label.padEnd(width))}  ${entry.value}`);
    for (const note of entry.notes) out.line(`  ${gutter}  ${c.dim(note)}`);
  }
  if (project.htmlUrl) {
    out.line();
    out.line(`  ${c.cyan(project.htmlUrl)}`);
  }

  const steps: Array<{ command: string; purpose: string }> = scan
    ? [{ command: `cf finding list --repo ${project.fullName}`, purpose: "read its findings" }]
    : [{ command: `cf scan --repo ${project.fullName}`, purpose: "run its first scan" }];
  steps.push({ command: `cf settings --repo ${project.fullName}`, purpose: "change how it is scanned" });
  nextSteps(steps.map((step) => ({ command: `  ${step.command}`, purpose: step.purpose })));
  out.line();
}

export async function repoView(globals: GlobalOptions, target: string | undefined): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const { project } = await resolveLinkedProject(session, target ? { ...globals, repo: target } : globals);

  if (isAgentMode()) {
    out.agentEmit(compactProject(project), [
      project.scan
        ? `cf reproduced --repo ${project.fullName} --agent`
        : `cf scan --repo ${project.fullName} --wait --agent`,
      `cf settings --repo ${project.fullName} --agent`,
    ]);
    return 0;
  }

  if (out.isJsonMode()) {
    out.json(project);
    return 0;
  }

  if (await openIfRequested(globals.web, project.htmlUrl, { hosts: CODE_HOSTS, what: "this repository" })) {
    return 0;
  }

  renderProject(project);
  return 0;
}
