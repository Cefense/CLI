import type { CefenseClient } from "../core/client.js";
import type { Project, ScanSummary } from "../core/types.js";
import { openSession, type GlobalOptions, type Session } from "../core/session.js";
import { resolveLinkedProject } from "./link.js";
import * as out from "../ui/output.js";
import { spinner } from "../ui/prompts.js";
import { elapsed, progressBar } from "../ui/format.js";
import { c } from "../ui/theme.js";
import { isAgentMode } from "../ui/mode.js";

const POLL_MS = 2000;

function terminal(scan: ScanSummary | null): boolean {
  return !scan || scan.status === "completed" || scan.status === "failed";
}

function describe(scan: ScanSummary): string {
  const stage = (scan.stage ?? scan.status).padEnd(10);
  const done = scan.filesScanned ?? 0;
  const total = scan.fileCount ?? 0;
  const bar = total > 0 ? `${progressBar(done, total)}  ${done} / ${total} files` : "starting";
  const clock = elapsed(scan.createdAt);
  const findings = scan.findingCount > 0 ? `   ${scan.findingCount} so far` : "";
  return `${stage} ${bar}   ${clock}${findings}`;
}

export async function watchScan(
  client: CefenseClient,
  githubRepoId: string,
  label: string,
): Promise<ScanSummary | null> {
  const progress = spinner();
  progress.start(`Scanning ${label}`);

  let interrupted = false;
  const onInterrupt = () => {
    interrupted = true;
  };
  process.once("SIGINT", onInterrupt);

  let latest: ScanSummary | null = null;
  try {
    for (;;) {
      if (interrupted) {
        progress.stop(`Still scanning ${label} in the background.`, "none");
        return latest;
      }
      const { projects } = await client.projects();
      latest = projects.find((project) => project.githubRepoId === githubRepoId)?.scan ?? null;
      if (terminal(latest)) break;
      progress.message(describe(latest!));
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  } finally {
    process.removeListener("SIGINT", onInterrupt);
  }

  if (!latest) {
    progress.stop(`No scan is recorded for ${label}.`, "warn");
    return null;
  }
  if (latest.status === "failed") {
    progress.stop(`Scan failed: ${latest.error ?? "no reason reported"}`, "fail");
    return latest;
  }
  progress.stop(
    `Scanned ${label} in ${elapsed(latest.createdAt, latest.finishedAt)} · ${latest.findingCount} ${latest.findingCount === 1 ? "finding" : "findings"}`,
  );
  return latest;
}

async function awaitScan(
  session: Session,
  githubRepoId: string,
  attempts = 300,
): Promise<ScanSummary | null> {
  let latest: ScanSummary | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    const { projects } = await session.client
      .projects()
      .catch(() => ({ projects: [] as Project[] }));
    const project = projects.find((entry) => entry.githubRepoId === githubRepoId);
    latest = project?.scan ?? latest;
    if (latest && terminal(latest)) return latest;
  }
  return latest;
}

export async function scanCommand(
  globals: GlobalOptions,
  options: { watch?: boolean; wait?: boolean } = {},
): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const { project } = await resolveLinkedProject(session, globals);

  const running = project.scan && !terminal(project.scan);
  const { scanId } = await session.client.startScan(project.githubRepoId);

  if (isAgentMode()) {
    if (!options.wait) {
      out.agentEmit({ repository: project.fullName, scanId }, [
        `cf scan --repo ${project.fullName} --wait --agent`,
        `cf observed --repo ${project.fullName} --agent`,
      ]);
      return 0;
    }
    const settled = await awaitScan(session, project.githubRepoId);
    out.agentEmit(
      {
        repository: project.fullName,
        scanId,
        status: settled?.status ?? "running",
        findings: settled?.findingCount ?? null,
        error: settled?.error ?? null,
      },
      [`cf observed --repo ${project.fullName} --severity critical,high --agent`],
    );
    return settled?.status === "failed" ? 4 : 0;
  }

  if (out.isJsonMode()) {
    out.json({ repository: project.fullName, scanId });
    return 0;
  }

  out.line();
  if (running) {
    out.warn("Abandoned the scan already in progress and started a new one.");
  }

  if (options.watch === false) {
    out.success(`Scan queued for ${c.bold(project.fullName)}`);
    out.hint(`scan ${scanId}`);
    out.line();
    return 0;
  }

  const scan = await watchScan(session.client, project.githubRepoId, project.fullName);
  out.line();
  if (scan?.status === "completed" && scan.findingCount > 0) {
    out.info("Next: review the findings");
    out.line(`    ${c.dim(`cf observed --repo ${project.fullName}`)}`);
    out.line();
  }
  return scan?.status === "failed" ? 4 : 0;
}

export function projectScanSummary(project: Project): string {
  const scan = project.scan;
  if (!scan) return c.dim("never scanned");
  if (scan.status === "running" || scan.status === "queued") {
    const done = scan.filesScanned ?? 0;
    const total = scan.fileCount ?? 0;
    return total > 0 ? `${scan.stage ?? "running"} ${done}/${total}` : (scan.stage ?? "queued");
  }
  if (scan.status === "failed") return c.red(scan.error ?? "failed");
  return "";
}
