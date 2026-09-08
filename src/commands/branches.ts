import { openSession, type GlobalOptions } from "../core/session.js";
import type { BranchesResponse, Project } from "../core/types.js";
import { providerLabel, providerOf } from "../core/providers.js";
import { resolveLinkedProject } from "./link.js";
import { printList } from "../ui/list.js";
import * as out from "../ui/output.js";
import { relativeTime } from "../ui/format.js";
import { c, scanStatusLabel } from "../ui/theme.js";
import { isAgentMode } from "../ui/mode.js";
import { compactBranch } from "../core/compact.js";

export async function branchesCommand(globals: GlobalOptions): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const { project }: { project: Project } = await resolveLinkedProject(session, globals);
  const host = providerLabel(providerOf(project));

  const listing: BranchesResponse = await session.client.branches(project.githubRepoId);

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

  const unscanned = listing.branches.find((branch) => !branch.scanId)?.name ?? "<name>";

  printList({
    noun: "branch",
    scope: project.fullName,
    rows: listing.branches,
    columns: [
      {
        header: "branch",
        value: (branch) =>
          branch.name === listing.defaultBranch ? `${branch.name} ${c.cyan("*")}` : branch.name,
        min: 12,
        max: 44,
      },
      { header: "status", value: (branch) => scanStatusLabel(branch.scanStatus), min: 8 },
      {
        header: "findings",
        value: (branch) => (branch.findingCount === null ? c.dim("-") : String(branch.findingCount)),
        align: "right",
        min: 5,
      },
      { header: "last scan", value: (branch) => c.dim(relativeTime(branch.scannedAt)), min: 9 },
    ],
    pipeColumns: [
      { header: "branch", value: (branch) => branch.name },
      { header: "status", value: (branch) => branch.scanStatus ?? "never" },
      {
        header: "findings",
        value: (branch) => (branch.findingCount === null ? "" : String(branch.findingCount)),
      },
      { header: "last scan", value: (branch) => branch.scannedAt ?? "" },
    ],
    empty: `${project.fullName} has no branches Cefense can see on ${host}.`,
    footnote: listing.defaultBranch ? `${c.cyan("*")} default branch` : null,
    next: [
      { command: `cf scan --branch ${unscanned}`, purpose: "scan a branch" },
      { command: `cf observed --branch ${unscanned}`, purpose: "read a branch's findings" },
    ],
  });

  return 0;
}
