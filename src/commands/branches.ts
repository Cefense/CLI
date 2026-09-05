import open from "open";
import { openSession, type GlobalOptions } from "../core/session.js";
import type { Branch, BranchesResponse, Project } from "../core/types.js";
import { resolveLinkedProject } from "./link.js";
import { watchScan } from "./scan.js";
import { observedCommand } from "./observed.js";
import { browse } from "../ui/browser.js";
import * as out from "../ui/output.js";
import { keyValue, renderTable } from "../ui/table.js";
import { padEnd, relativeTime, terminalWidth } from "../ui/format.js";
import { c, glyph, scanStatusLabel } from "../ui/theme.js";
import { isAgentMode } from "../ui/mode.js";
import { compactBranch } from "../core/compact.js";

function branchUrl(project: Project, branch: Branch): string | null {
  return project.htmlUrl ? `${project.htmlUrl}/tree/${branch.name}` : null;
}

function branchDetail(project: Project, branch: Branch, defaultBranch: string | null): string[] {
  const lines: string[] = [];
  const push = (value = "") => lines.push(value ? `  ${value}` : "");

  push();
  push(
    `${c.bold(branch.name)}   ${c.dim(
      [branch.name === defaultBranch ? "default branch" : "", branch.protected ? "protected" : ""]
        .filter(Boolean)
        .join("  ·  "),
    )}`,
  );
  push();

  const facts: Array<[string, string]> = [
    ["Scan", branch.scanId ? scanStatusLabel(branch.scanStatus) : c.dim("never scanned")],
  ];
  if (branch.scanId) {
    facts.push(["Findings", branch.findingCount === null ? "-" : String(branch.findingCount)]);
    facts.push(["Scanned", relativeTime(branch.scannedAt)]);
    facts.push(["Scan id", c.dim(branch.scanId)]);
  }
  for (const row of keyValue(facts, 9)) push(row);

  push();
  push(c.dim("Press s to scan this branch, f to read its findings."));

  const url = branchUrl(project, branch);
  if (url) {
    push();
    push(c.dim(url));
  }
  push();
  return lines;
}

export async function branchesCommand(globals: GlobalOptions): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const { project } = await resolveLinkedProject(session, globals);

  let listing: BranchesResponse = await session.client.branches(project.githubRepoId);

  if (isAgentMode()) {
    out.agentEmit(
      {
        repository: project.fullName,
        defaultBranch: listing.defaultBranch,
        branches: listing.branches.map((branch) => compactBranch(branch, listing.defaultBranch)),
      },
      [
        `cf scan --repo ${project.fullName} --branch <name> --wait --agent`,
        `cf observed --repo ${project.fullName} --branch <name> --agent`,
      ],
    );
    return 0;
  }

  if (out.isJsonMode()) {
    out.json({ repository: project.fullName, ...listing });
    return 0;
  }

  if (listing.branches.length === 0) {
    out.line();
    out.info(`${c.bold(project.fullName)} has no branches Cefense can see.`);
    out.line();
    return 0;
  }

  if (out.isPiped()) {
    out.lines(
      renderTable(
        listing.branches,
        [
          { header: "branch", value: (branch) => branch.name, min: 12 },
          { header: "status", value: (branch) => scanStatusLabel(branch.scanStatus), min: 8 },
          {
            header: "findings",
            value: (branch) => (branch.findingCount === null ? "-" : String(branch.findingCount)),
            align: "right",
            min: 5,
          },
          { header: "last scan", value: (branch) => relativeTime(branch.scannedAt), min: 9 },
        ],
        { width: terminalWidth() - 4 },
      ).map((row) => `  ${row}`),
    );
    out.line();
    return 0;
  }

  let followUp: { action: "findings" | "scan"; branch: Branch } | null = null;

  await browse(listing.branches, {
    header: (visible) => [
      "",
      `  ${c.bold(project.fullName)}   ${c.dim(`${visible.length} ${visible.length === 1 ? "branch" : "branches"}`)}`,
      `  ${c.dim(`default ${listing.defaultBranch ?? "unknown"}`)}`,
      "",
    ],
    renderRow: (branch, selected) => {
      const marker = selected ? c.cyan(glyph.arrow) : " ";
      const name = selected ? c.bold(branch.name) : branch.name;
      const badge = branch.name === listing.defaultBranch ? c.cyan(" *") : "";
      const findings = branch.findingCount === null ? "-" : String(branch.findingCount);
      return [
        `${marker} ${padEnd(name + badge, 34)}${padEnd(scanStatusLabel(branch.scanStatus), 12)}${padEnd(findings, 10)}${c.dim(relativeTime(branch.scannedAt))}`,
      ];
    },
    renderDetail: (branch) => branchDetail(project, branch, listing.defaultBranch),
    filterText: (branch) => branch.name,
    emptyMessage: "No branch matches that filter.",
    refresh: async () => {
      listing = await session.client.branches(project.githubRepoId);
      return listing.branches;
    },
    refreshIntervalMs: 3000,
    shouldKeepRefreshing: (branches) =>
      branches.some((branch) => branch.scanStatus === "queued" || branch.scanStatus === "running"),
    actions: [
      {
        key: "s",
        label: "scan",
        run: (branch, context) => {
          if (!branch) return;
          followUp = { action: "scan", branch };
          context.close();
        },
      },
      {
        key: "f",
        label: (branch) => (branch?.scanId ? "findings" : null),
        run: (branch, context) => {
          if (!branch?.scanId) return;
          followUp = { action: "findings", branch };
          context.close();
        },
      },
      {
        key: "o",
        label: "github",
        run: (branch) => {
          if (!branch) return;
          const url = branchUrl(project, branch);
          if (url) void open(url).catch(() => undefined);
        },
      },
    ],
  });

  const pending = followUp as { action: "findings" | "scan"; branch: Branch } | null;
  if (pending?.action === "findings") {
    return observedCommand({ ...globals, repo: project.fullName }, { branch: pending.branch.name });
  }
  if (pending?.action === "scan") {
    await session.client.startScan(project.githubRepoId, pending.branch.name);
    out.line();
    await watchScan(session.client, project.githubRepoId, `${project.fullName}#${pending.branch.name}`);
    out.line();
  }
  return 0;
}
