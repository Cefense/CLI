import open from "open";
import { openSession, type GlobalOptions } from "../core/session.js";
import type { CommitEntry, Project } from "../core/types.js";
import { resolveLinkedProject } from "./link.js";
import { observedCommand } from "./observed.js";
import { browse } from "../ui/browser.js";
import * as out from "../ui/output.js";
import { keyValue, renderTable } from "../ui/table.js";
import { padEnd, relativeTime, terminalWidth, truncate, wrapText } from "../ui/format.js";
import { c, glyph, scanStatusLabel } from "../ui/theme.js";
import { isAgentMode } from "../ui/mode.js";
import { compactCommit } from "../core/compact.js";

export interface CommitsOptions {
  limit?: number;
}

function subject(commit: CommitEntry): string {
  return commit.message.split("\n")[0]?.trim() || "(no commit message)";
}

function delta(commit: CommitEntry): string {
  const parts = [
    commit.counts.introduced > 0 ? c.red(`+${commit.counts.introduced}`) : "",
    commit.counts.resolved > 0 ? c.green(`-${commit.counts.resolved}`) : "",
    commit.counts.suppressed > 0 ? c.dim(`~${commit.counts.suppressed}`) : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : c.dim("no change");
}

function commitUrl(project: Project, commit: CommitEntry): string | null {
  return project.htmlUrl ? `${project.htmlUrl}/commit/${commit.sha}` : null;
}

function commitDetail(project: Project, commit: CommitEntry, width: number): string[] {
  const lines: string[] = [];
  const push = (value = "") => lines.push(value ? `  ${value}` : "");
  const body = Math.min(96, width - 4);

  push();
  push(`${c.bold(subject(commit))}`);
  push();
  push(
    c.dim(
      [
        commit.sha.slice(0, 12),
        commit.authorLogin ?? commit.authorName,
        relativeTime(commit.committedAt),
      ].join("      "),
    ),
  );

  const rest = commit.message.split("\n").slice(1).join("\n").trim();
  if (rest) {
    push();
    for (const wrapped of wrapText(rest, body)) push(c.dim(wrapped));
  }

  push();
  push(c.dim("SCAN"));
  push();
  const facts: Array<[string, string]> = [
    ["Status", scanStatusLabel(commit.scanStatus)],
    ["Findings", String(commit.findingCount)],
    ["Introduced", commit.counts.introduced > 0 ? c.red(String(commit.counts.introduced)) : "0"],
    ["Resolved", commit.counts.resolved > 0 ? c.green(String(commit.counts.resolved)) : "0"],
    ["Suppressed", String(commit.counts.suppressed)],
    ["Scan id", c.dim(commit.scanId)],
  ];
  for (const row of keyValue(facts, 11)) push(row);

  push();
  push(c.dim("Press f to read the findings this scan recorded."));

  const url = commitUrl(project, commit);
  if (url) {
    push();
    push(c.dim(url));
  }
  push();
  return lines;
}

export async function commitsCommand(
  globals: GlobalOptions,
  options: CommitsOptions = {},
): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const { project } = await resolveLinkedProject(session, globals);

  let commits = (await session.client.commits(project.githubRepoId, { limit: options.limit })).commits;

  if (isAgentMode()) {
    out.agentEmit(
      {
        repository: project.fullName,
        commits: commits.map(compactCommit),
      },
      commits[0]
        ? [
            `cf observed --repo ${project.fullName} --scan ${commits[0].scanId} --agent`,
            `cf scan --repo ${project.fullName} --wait --agent`,
          ]
        : [`cf scan --repo ${project.fullName} --wait --agent`],
    );
    return 0;
  }

  if (out.isJsonMode()) {
    out.json({ repository: project.fullName, commits });
    return 0;
  }

  if (commits.length === 0) {
    out.line();
    out.info(`No scan of ${c.bold(project.fullName)} has a commit recorded yet.`);
    out.hint("Run cf scan, then look again.");
    out.line();
    return 0;
  }

  if (out.isPiped()) {
    out.lines(
      renderTable(
        commits,
        [
          { header: "commit", value: (commit) => commit.sha.slice(0, 7), min: 7, max: 7 },
          { header: "subject", value: subject, min: 20 },
          { header: "author", value: (commit) => commit.authorLogin ?? commit.authorName, min: 8 },
          { header: "findings", value: (commit) => String(commit.findingCount), align: "right", min: 5 },
          { header: "delta", value: delta, min: 9 },
          { header: "when", value: (commit) => relativeTime(commit.committedAt), min: 9 },
        ],
        { width: terminalWidth() - 4 },
      ).map((row) => `  ${row}`),
    );
    out.line();
    return 0;
  }

  let followUp: CommitEntry | null = null;

  await browse(commits, {
    header: (visible) => {
      const introduced = visible.reduce((sum, commit) => sum + commit.counts.introduced, 0);
      const resolved = visible.reduce((sum, commit) => sum + commit.counts.resolved, 0);
      return [
        "",
        `  ${c.bold(project.fullName)}   ${c.dim(`${visible.length} scanned ${visible.length === 1 ? "commit" : "commits"}`)}`,
        `  ${c.red(`${introduced} introduced`)}${c.dim("  ·  ")}${c.green(`${resolved} resolved`)}`,
        "",
      ];
    },
    renderRow: (commit, selected, width) => {
      const marker = selected ? c.cyan(glyph.arrow) : " ";
      const title = truncate(subject(commit), Math.max(20, width - 60));
      return [
        `${marker} ${c.dim(commit.sha.slice(0, 7))} ${padEnd(selected ? c.bold(title) : title, Math.max(20, width - 60))}  ${padEnd(delta(commit), 14)}${c.dim(relativeTime(commit.committedAt))}`,
      ];
    },
    renderDetail: (commit, width) => commitDetail(project, commit, width),
    filterText: (commit) => `${commit.sha} ${commit.message} ${commit.authorLogin ?? commit.authorName}`,
    emptyMessage: "No commit matches that filter.",
    refresh: async () => {
      commits = (await session.client.commits(project.githubRepoId, { limit: options.limit })).commits;
      return commits;
    },
    actions: [
      {
        key: "f",
        label: "findings",
        run: (commit, context) => {
          if (!commit) return;
          followUp = commit;
          context.close();
        },
      },
      {
        key: "o",
        label: "github",
        run: (commit) => {
          if (!commit) return;
          const url = commitUrl(project, commit);
          if (url) void open(url).catch(() => undefined);
        },
      },
    ],
  });

  const pending = followUp as CommitEntry | null;
  if (pending) {
    return observedCommand({ ...globals, repo: project.fullName }, { scanId: pending.scanId });
  }
  return 0;
}
