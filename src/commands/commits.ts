import { openSession, type GlobalOptions } from "../core/session.js";
import type { CommitEntry, CommitsResponse, Project } from "../core/types.js";
import { commitUrl, providerLabel, providerOf } from "../core/providers.js";
import { resolveLinkedProject } from "./link.js";
import { printList } from "../ui/list.js";
import * as out from "../ui/output.js";
import { relativeTime } from "../ui/format.js";
import { c } from "../ui/theme.js";
import { isAgentMode } from "../ui/mode.js";
import { compactCommit } from "../core/compact.js";

export interface CommitsOptions {
  limit?: number;
  branch?: string;
}

function subject(commit: CommitEntry): string {
  return commit.message.split("\n")[0]?.trim() || "(no commit message)";
}

/**
 * What a commit's scan changed.
 *
 * The history is the repository's, not Cefense's, so most commits have never
 * been scanned. Those say so rather than reading as a scan that found nothing.
 */
function delta(commit: CommitEntry): string {
  if (!commit.counts) return c.dim("not scanned");
  const parts = [
    commit.counts.introduced > 0 ? c.red(`+${commit.counts.introduced}`) : "",
    commit.counts.resolved > 0 ? c.green(`-${commit.counts.resolved}`) : "",
    commit.counts.suppressed > 0 ? c.dim(`~${commit.counts.suppressed}`) : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : c.dim("no change");
}

export async function commitsCommand(
  globals: GlobalOptions,
  options: CommitsOptions = {},
): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const { project } = await resolveLinkedProject(session, globals);
  const host = providerLabel(providerOf(project));

  // The route returns one page of the host's history, so a limit is a cut of
  // what came back rather than something the host is asked for.
  const cap = (listing: CommitsResponse): CommitEntry[] =>
    options.limit ? listing.commits.slice(0, options.limit) : listing.commits;

  const query = options.branch ? { branch: options.branch } : {};
  let listing = await session.client.commits(project.githubRepoId, query);
  let commits = cap(listing);

  if (isAgentMode()) {
    const scanned = commits.find((commit) => commit.scanId);
    out.agentEmit(
      {
        repository: project.fullName,
        branch: listing.branch,
        historyAvailable: listing.historyAvailable,
        commits: commits.map(compactCommit),
      },
      scanned
        ? [
            `cf observed --repo ${project.fullName} --scan ${scanned.scanId} --agent`,
            `cf scan --repo ${project.fullName} --wait --agent`,
          ]
        : [`cf scan --repo ${project.fullName} --wait --agent`],
    );
    return 0;
  }

  if (out.isJsonMode()) {
    out.json({ repository: project.fullName, ...listing, commits });
    return 0;
  }

  const scanned = commits.find((commit) => commit.scanId);

  printList({
    noun: "commit",
    scope: listing.branch ? `${project.fullName}#${listing.branch}` : project.fullName,
    footnote: `${commits.filter((commit) => commit.scanned).length} of ${commits.length} scanned by Cefense.`,
    rows: commits,
    columns: [
      { header: "commit", value: (commit) => c.dim(commit.sha.slice(0, 7)), min: 7, max: 7 },
      { header: "subject", value: subject, min: 20 },
      {
        header: "author",
        value: (commit) => c.dim(commit.authorLogin ?? commit.authorName),
        min: 8,
        max: 18,
      },
      {
        header: "findings",
        value: (commit) => (commit.findingCount === null ? c.dim("-") : String(commit.findingCount)),
        align: "right",
        min: 5,
      },
      { header: "delta", value: delta, min: 9 },
      { header: "when", value: (commit) => c.dim(relativeTime(commit.committedAt)), min: 9 },
    ],
    pipeColumns: [
      { header: "commit", value: (commit) => commit.sha },
      { header: "subject", value: subject },
      { header: "author", value: (commit) => commit.authorLogin ?? commit.authorName },
      {
        header: "findings",
        value: (commit) => (commit.findingCount === null ? "" : String(commit.findingCount)),
      },
      { header: "scanned", value: (commit) => (commit.scanned ? "yes" : "no") },
      { header: "when", value: (commit) => commit.committedAt },
    ],
    empty: listing.historyAvailable
      ? `${project.fullName} has no commits on ${listing.branch ?? "its default branch"}.`
      : `Cefense cannot read the commit history of ${project.fullName}.`,
    emptyHint: listing.historyAvailable
      ? null
      : `Reconnect ${host} with cf provider connect ${providerOf(project)}.`,
    next: scanned
      ? [
          {
            command: `cf observed --scan ${scanned.scanId}`,
            purpose: `findings at ${scanned.sha.slice(0, 7)}`,
          },
        ]
      : [],
  });

  return 0;
}
