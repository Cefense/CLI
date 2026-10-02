import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CefenseClient } from "../core/client.js";
import { CefenseError, UsageError } from "../core/errors.js";
import { openSession, type GlobalOptions } from "../core/session.js";
import type { Project, ScanSummary } from "../core/types.js";
import { isAgentMode } from "../ui/mode.js";
import * as out from "../ui/output.js";
import { confirm } from "../ui/prompts.js";

type BatchStatus = "pending" | "submitting" | "running" | "completed" | "failed" | "cancelled" | "displaced";

interface BatchEntry {
  repo: string;
  url: string;
  expectedSha?: string;
  actualSha?: string | null;
  inputStatus?: "match" | "mismatch" | "unknown";
  status: BatchStatus;
  scanId?: string;
  githubRepoId?: string;
  findings?: number;
  outcome?: string | null;
  coverageGaps?: ScanSummary["coverageGaps"];
  error?: string | null;
}

interface BatchState {
  version: 1;
  manifestHash: string;
  apiUrl: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  entries: BatchEntry[];
}

export interface BatchOptions {
  state?: string;
  maxActive?: number;
  pollSeconds?: number;
  timeoutMinutes?: number;
  dryRun?: boolean;
  status?: boolean;
}

function githubRepository(value: unknown): { repo: string; url: string; expectedSha?: string } {
  if (!value || typeof value !== "object") throw new UsageError("Each manifest entry must be an object.");
  const item = value as Record<string, unknown>;
  if (typeof item.url !== "string") throw new UsageError("Each manifest entry needs a GitHub URL.");
  let parsed: URL;
  try { parsed = new URL(item.url); } catch { throw new UsageError(`Invalid repository URL: ${item.url}`); }
  const parts = parsed.pathname.replace(/\/$/, "").split("/").filter(Boolean);
  if (parsed.protocol !== "https:" || parsed.hostname !== "github.com" || parts.length !== 2 ||
      !parts.every((part) => /^[A-Za-z0-9_.-]+$/.test(part)) || parsed.search || parsed.hash) {
    throw new UsageError(`Expected https://github.com/owner/repo: ${item.url}`);
  }
  const repo = parts.join("/");
  if (item.repo !== undefined && item.repo !== repo) throw new UsageError(`Manifest repo and URL disagree: ${String(item.repo)}`);
  const expectedSha = item.default_head_sha ?? item.expectedSha;
  if (expectedSha !== undefined && (typeof expectedSha !== "string" || !/^[a-fA-F0-9]{40}$/.test(expectedSha))) {
    throw new UsageError(`Invalid expected commit SHA for ${repo}.`);
  }
  return { repo, url: `https://github.com/${repo}`,
    ...(expectedSha ? { expectedSha: expectedSha.toLowerCase() } : {}) };
}

export function readBatchManifest(path: string): { repositories: Array<{ repo: string; url: string; expectedSha?: string }>; hash: string } {
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(path, "utf8")); }
  catch { throw new UsageError(`Cannot read JSON manifest: ${path}`); }
  const values = Array.isArray(parsed) ? parsed : (parsed as { repositories?: unknown })?.repositories;
  if (!Array.isArray(values) || values.length === 0) throw new UsageError("Manifest must contain a nonempty repositories array.");
  const repositories = values.map(githubRepository);
  const names = repositories.map((entry) => entry.repo.toLowerCase());
  if (new Set(names).size !== names.length) throw new UsageError("Manifest contains a duplicate repository.");
  const hash = createHash("sha256").update(JSON.stringify(repositories)).digest("hex");
  return { repositories, hash };
}

function saveState(path: string, state: BatchState): void {
  state.updatedAt = new Date().toISOString();
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, path);
}

function loadState(path: string, manifest: ReturnType<typeof readBatchManifest>, apiUrl: string, email: string): BatchState {
  if (!existsSync(path)) {
    const now = new Date().toISOString();
    const state: BatchState = {
      version: 1, manifestHash: manifest.hash, apiUrl, email: email.toLowerCase(),
      createdAt: now, updatedAt: now,
      entries: manifest.repositories.map((entry) => ({ ...entry, status: "pending" })),
    };
    saveState(path, state);
    return state;
  }
  let state: BatchState;
  try { state = JSON.parse(readFileSync(path, "utf8")) as BatchState; }
  catch { throw new UsageError(`Cannot read batch state: ${path}`); }
  if (state.version !== 1 || state.manifestHash !== manifest.hash || state.apiUrl !== apiUrl ||
      state.email !== email.toLowerCase() || !Array.isArray(state.entries) ||
      state.entries.length !== manifest.repositories.length) {
    throw new UsageError("Batch state belongs to a different manifest, account, or Cefense instance.",
      "Use its original manifest and account, or choose a new --state path.");
  }
  if (state.entries.some((entry, index) => entry.repo !== manifest.repositories[index]?.repo)) {
    throw new UsageError("Batch state entries do not match the manifest.");
  }
  return state;
}

function count(state: BatchState): Record<BatchStatus, number> {
  const totals = { pending: 0, submitting: 0, running: 0, completed: 0, failed: 0, cancelled: 0, displaced: 0 };
  for (const entry of state.entries) totals[entry.status] += 1;
  return totals;
}

function coverageCount(state: BatchState): { noReportedGaps: number; partial: number; unknown: number } {
  const totals = { noReportedGaps: 0, partial: 0, unknown: 0 };
  for (const entry of state.entries) {
    if (entry.status !== "completed") continue;
    if (entry.outcome === "partial" || entry.coverageGaps?.length) totals.partial += 1;
    else if (entry.outcome === "clean") totals.noReportedGaps += 1;
    else totals.unknown += 1;
  }
  return totals;
}

function inputCount(state: BatchState): { match: number; mismatch: number; unknown: number } {
  const totals = { match: 0, mismatch: 0, unknown: 0 };
  for (const entry of state.entries) {
    if (entry.status === "completed" && entry.inputStatus) totals[entry.inputStatus] += 1;
  }
  return totals;
}

function result(state: BatchState, path: string, stopReason: string | null): object {
  return {
    stateFile: path, account: state.email, total: state.entries.length,
    counts: count(state), coverage: coverageCount(state), input: inputCount(state), stopReason,
    repositories: state.entries.map((entry) => ({
      repo: entry.repo, status: entry.status, scanId: entry.scanId, expectedSha: entry.expectedSha,
      actualSha: entry.actualSha, inputStatus: entry.inputStatus,
      findings: entry.findings, outcome: entry.outcome,
      coverageGaps: entry.coverageGaps, error: entry.error,
    })),
  };
}

function emit(data: object): void {
  if (isAgentMode()) out.agentEmit(data);
  else if (out.isJsonMode()) out.json(data);
  else {
    const payload = data as {
      counts?: Record<BatchStatus, number>; total: number; stateFile: string;
      stopReason?: string | null; account: string; dryRun?: boolean;
      coverage?: { noReportedGaps: number; partial: number; unknown: number };
      input?: { match: number; mismatch: number; unknown: number };
      allowance?: { exhausted: boolean; percentUsed: number | null; periodEnd: string | null };
    };
    out.heading("Batch scan", payload.counts ? `${payload.counts.completed}/${payload.total} completed` : `${payload.total} repositories`);
    out.line(`Account: ${payload.account}`);
    out.line(`State: ${payload.stateFile}`);
    if (payload.dryRun) {
      out.line(`Allowance: ${payload.allowance?.exhausted ? "exhausted" : "available"}`);
      out.hint("No scans submitted.");
    } else if (payload.counts) {
      out.line(`Running ${payload.counts.running}, pending ${payload.counts.pending}, failed ${payload.counts.failed}, displaced ${payload.counts.displaced}`);
      if (payload.coverage) out.line(`Coverage: ${payload.coverage.noReportedGaps} without reported gaps, ${payload.coverage.partial} partial, ${payload.coverage.unknown} unknown`);
      if (payload.input) out.line(`Expected commits: ${payload.input.match} matched, ${payload.input.mismatch} moved, ${payload.input.unknown} unverified`);
    }
    if (payload.stopReason) out.warn(payload.stopReason);
  }
}

function progress(entry: BatchEntry): void {
  process.stderr.write(`${JSON.stringify({ event: "batch.scan", repository: entry.repo, status: entry.status, scanId: entry.scanId })}\n`);
}

export async function runBatch(
  client: Pick<CefenseClient, "projects" | "scanPublicRepo">,
  state: BatchState,
  statePath: string,
  options: Required<Pick<BatchOptions, "maxActive" | "pollSeconds" | "timeoutMinutes">>,
): Promise<{ data: object; exitCode: number }> {
  const deadline = Date.now() + options.timeoutMinutes * 60_000;
  let stopReason: string | null = null;
  if (state.entries.some((entry) => entry.status === "submitting")) {
    stopReason = "A previous submission has no recorded response. Inspect the workspace and state file before resuming.";
  }
  while (!stopReason) {
    let projects: Project[];
    try { projects = (await client.projects()).projects; }
    catch (error) { stopReason = `Could not read scan status: ${error instanceof Error ? error.message : String(error)}`; break; }
    const byRepo = new Map(projects.map((project) => [project.fullName.toLowerCase(), project]));
    for (const entry of state.entries.filter((candidate) => candidate.status === "running")) {
      const observed = byRepo.get(entry.repo.toLowerCase())?.scan;
      if (observed && observed.id !== entry.scanId) {
        entry.status = "displaced";
        entry.error = "Another scan replaced this run as the repository's latest scan.";
        saveState(statePath, state);
        progress(entry);
        stopReason = "A tracked scan was displaced by another scan.";
        continue;
      }
      if (!observed || !["completed", "failed", "cancelled"].includes(observed.status)) continue;
      entry.status = observed.status as BatchStatus;
      entry.findings = observed.findingCount;
      entry.actualSha = observed.commitSha ?? null;
      if (entry.expectedSha) entry.inputStatus = !entry.actualSha ? "unknown" :
        entry.actualSha.toLowerCase() === entry.expectedSha ? "match" : "mismatch";
      entry.outcome = observed.outcome;
      entry.coverageGaps = observed.coverageGaps;
      entry.error = observed.error;
      saveState(statePath, state);
      progress(entry);
    }
    if (stopReason) break;
    let active = state.entries.filter((entry) => entry.status === "running").length;
    while (active < options.maxActive) {
      const entry = state.entries.find((candidate) => candidate.status === "pending");
      if (!entry) break;
      entry.status = "submitting";
      saveState(statePath, state);
      try {
        const response = await client.scanPublicRepo(entry.url);
        if (response.project.fullName.toLowerCase() !== entry.repo.toLowerCase()) {
          entry.error = `API resolved ${entry.repo} to ${response.project.fullName}; scan ${response.scanId} needs review.`;
          stopReason = "The API resolved a manifest URL to another repository.";
          saveState(statePath, state);
          break;
        }
        entry.status = "running";
        entry.scanId = response.scanId;
        entry.githubRepoId = response.project.githubRepoId;
        saveState(statePath, state);
        progress(entry);
        active += 1;
      } catch (error) {
        const code = error instanceof CefenseError ? error.code : "unknown";
        if (["allowance_exhausted", "repository_limit", "organization_forbidden", "rate_limited"].includes(code)) entry.status = "pending";
        entry.error = `${code}: ${error instanceof Error ? error.message : String(error)}`;
        stopReason = `Submission stopped at ${entry.repo}: ${entry.error}`;
        saveState(statePath, state);
        break;
      }
    }
    if (stopReason) break;
    const totals = count(state);
    if (totals.pending === 0 && totals.running === 0) break;
    if (Date.now() >= deadline) { stopReason = "Time limit reached. Re-run with the same state file to resume."; break; }
    await new Promise((resolveSleep) => setTimeout(resolveSleep, options.pollSeconds * 1000));
  }
  const totals = count(state);
  const coverage = coverageCount(state);
  const input = inputCount(state);
  return { data: result(state, statePath, stopReason), exitCode: stopReason || totals.failed || totals.cancelled || totals.displaced || totals.submitting || coverage.partial || coverage.unknown || input.mismatch || input.unknown ? 4 : 0 };
}

export async function scanBatchCommand(globals: GlobalOptions, manifestPath: string, options: BatchOptions = {}): Promise<number> {
  const manifest = readBatchManifest(resolve(manifestPath));
  const statePath = resolve(options.state ?? `${resolve(manifestPath)}.cefense-state.json`);
  const maxActive = options.maxActive ?? 3;
  const pollSeconds = options.pollSeconds ?? 10;
  const timeoutMinutes = options.timeoutMinutes ?? 60;
  if (!Number.isInteger(maxActive) || maxActive < 1 || maxActive > 25) throw new UsageError("--max-active must be 1-25.");
  if (!Number.isInteger(pollSeconds) || pollSeconds < 2 || pollSeconds > 120) throw new UsageError("--poll-seconds must be 2-120.");
  if (!Number.isInteger(timeoutMinutes) || timeoutMinutes < 1 || timeoutMinutes > 1440) throw new UsageError("--timeout-minutes must be 1-1440.");
  const session = await openSession(globals, { auth: true });
  const me = await session.client.me();
  const email = me.user.email;
  if (options.status) {
    if (!existsSync(statePath)) throw new UsageError(`No batch state exists at ${statePath}.`);
    emit({ ...result(loadState(statePath, manifest, session.apiUrl, email), statePath, null), readOnly: true });
    return 0;
  }
  if (options.dryRun) {
    const billing = await session.client.billing();
    const data = { account: email, apiUrl: session.apiUrl, total: manifest.repositories.length,
      stateFile: statePath, repositories: manifest.repositories, dryRun: true,
      allowance: { exhausted: billing.usage.exhausted, percentUsed: billing.usage.percentUsed,
        periodEnd: billing.usage.periodEnd, unlimited: billing.usage.unlimited } };
    emit(data);
    return 0;
  }
  if (!globals.yes) {
    if (isAgentMode() || out.isJsonMode()) throw new UsageError("Batch scanning needs explicit confirmation.",
      "With owner authorization and allowance approval, re-run with --yes.", "confirmation_required");
    const accepted = await confirm({ message: `Scan ${manifest.repositories.length} repositories as ${email}?` });
    if (!accepted) return 130;
  }
  const state = loadState(statePath, manifest, session.apiUrl, email);
  const outcome = await runBatch(session.client, state, statePath, { maxActive, pollSeconds, timeoutMinutes });
  emit(outcome.data);
  return outcome.exitCode;
}
