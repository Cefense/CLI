import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readBatchManifest, runBatch } from "../src/commands/scan-batch.js";
import type { CefenseClient } from "../src/core/client.js";
import { CefenseError } from "../src/core/errors.js";
import type { Project, ScanSummary } from "../src/core/types.js";

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "cefense-batch-"));
  const manifestPath = join(dir, "manifest.json");
  const statePath = join(dir, "state.json");
  writeFileSync(manifestPath, JSON.stringify({ repositories: [
    { repo: "acme/one", url: "https://github.com/acme/one" },
    { repo: "acme/two", url: "https://github.com/acme/two" },
  ] }));
  const manifest = readBatchManifest(manifestPath);
  const state = {
    version: 1 as const, manifestHash: manifest.hash, apiUrl: "https://cefense.com", email: "test@example.com",
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    entries: manifest.repositories.map((entry) => ({ ...entry, status: "pending" as const })),
  };
  return { dir, manifestPath, statePath, state };
}

function project(repo: string, scanId: string, status: ScanSummary["status"], outcome: ScanSummary["outcome"] = "clean"): Project {
  return {
    fullName: repo, githubRepoId: repo, scan: {
      id: scanId, status, outcome, fileCount: 1, filesScanned: 1, findingCount: 2,
      stage: null, error: null, createdAt: "2026-01-01T00:00:00Z", finishedAt: "2026-01-01T00:00:10Z",
    },
  } as Project;
}

test("batch scans each URL once, waits for exact scan IDs, and saves final state", async () => {
  const { dir, statePath, state } = fixture();
  try {
    const scans = new Map<string, string>();
    const calls: string[] = [];
    const client = {
      projects: async () => ({ projects: [...scans].map(([repo, id]) => project(repo, id, "completed")) }),
      scanPublicRepo: async (url: string) => {
        const repo = url.replace("https://github.com/", "");
        calls.push(repo);
        const id = `scan-${calls.length}`;
        scans.set(repo, id);
        return { project: project(repo, id, "running"), scanId: id };
      },
    } as Pick<CefenseClient, "projects" | "scanPublicRepo">;
    const outcome = await runBatch(client, state, statePath, { maxActive: 2, pollSeconds: 0, timeoutMinutes: 1 });
    assert.equal(outcome.exitCode, 0);
    assert.deepEqual(calls, ["acme/one", "acme/two"]);
    assert.deepEqual(JSON.parse(readFileSync(statePath, "utf8")).entries.map((entry: { status: string }) => entry.status),
      ["completed", "completed"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("partial coverage is visible in the batch result and returns a nonzero exit code", async () => {
  const { dir, statePath, state } = fixture();
  try {
    const scans = new Map<string, string>();
    const client = {
      projects: async () => ({ projects: [...scans].map(([repo, id]) => project(repo, id, "completed", "partial")) }),
      scanPublicRepo: async (url: string) => {
        const repo = url.replace("https://github.com/", "");
        const id = `scan-${scans.size + 1}`;
        scans.set(repo, id);
        return { project: project(repo, id, "running"), scanId: id };
      },
    } as Pick<CefenseClient, "projects" | "scanPublicRepo">;
    const outcome = await runBatch(client, state, statePath, { maxActive: 2, pollSeconds: 0, timeoutMinutes: 1 });
    assert.equal(outcome.exitCode, 4);
    assert.deepEqual((outcome.data as { coverage: object }).coverage,
      { noReportedGaps: 0, partial: 2, unknown: 0 });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a partial pilot holds pending scans instead of flooding the cohort", async () => {
  const { dir, statePath, state } = fixture();
  try {
    const scans = new Map<string, string>();
    const client = {
      projects: async () => ({ projects: [...scans].map(([repo, id]) => project(repo, id, "completed", "partial")) }),
      scanPublicRepo: async (url: string) => {
        const repo = url.replace("https://github.com/", "");
        const id = `scan-${scans.size + 1}`;
        scans.set(repo, id);
        return { project: project(repo, id, "running"), scanId: id };
      },
    } as Pick<CefenseClient, "projects" | "scanPublicRepo">;
    const outcome = await runBatch(client, state, statePath, { maxActive: 1, pollSeconds: 0, timeoutMinutes: 1 });
    assert.equal(outcome.exitCode, 4);
    assert.equal(scans.size, 1);
    assert.deepEqual(state.entries.map((entry) => entry.status), ["completed", "pending"]);
    assert.match(JSON.stringify(outcome.data), /partial coverage/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("uncertain submission stops the batch and does not submit another repository", async () => {
  const { dir, statePath, state } = fixture();
  try {
    let calls = 0;
    const client = {
      projects: async () => ({ projects: [] }),
      scanPublicRepo: async () => { calls += 1; throw new Error("response lost"); },
    } as unknown as Pick<CefenseClient, "projects" | "scanPublicRepo">;
    const first = await runBatch(client, state, statePath, { maxActive: 2, pollSeconds: 0, timeoutMinutes: 1 });
    assert.equal(first.exitCode, 4);
    assert.equal(calls, 1);
    assert.equal(state.entries[0]?.status, "submitting");
    await runBatch(client, state, statePath, { maxActive: 2, pollSeconds: 0, timeoutMinutes: 1 });
    assert.equal(calls, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("allowance exhaustion leaves the entry pending and records a stop reason", async () => {
  const { dir, statePath, state } = fixture();
  try {
    const client = {
      projects: async () => ({ projects: [] }),
      scanPublicRepo: async () => { throw new CefenseError("exhausted", { code: "allowance_exhausted" }); },
    } as unknown as Pick<CefenseClient, "projects" | "scanPublicRepo">;
    const outcome = await runBatch(client, state, statePath, { maxActive: 2, pollSeconds: 0, timeoutMinutes: 1 });
    assert.equal(outcome.exitCode, 4);
    assert.equal(state.entries[0]?.status, "pending");
    assert.match(JSON.stringify(outcome.data), /allowance_exhausted/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("manifest rejects duplicate and mismatched GitHub repository names", () => {
  const { dir, manifestPath } = fixture();
  try {
    writeFileSync(manifestPath, JSON.stringify({ repositories: [
      { repo: "acme/one", url: "https://github.com/acme/one" },
      { repo: "ACME/ONE", url: "https://github.com/ACME/ONE" },
    ] }));
    assert.throws(() => readBatchManifest(manifestPath), /duplicate/);
    writeFileSync(manifestPath, JSON.stringify({ repositories: [
      { repo: "other/one", url: "https://github.com/acme/one" },
    ] }));
    assert.throws(() => readBatchManifest(manifestPath), /disagree/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("changing an expected commit changes the manifest identity", () => {
  const { dir, manifestPath } = fixture();
  try {
    const first = readBatchManifest(manifestPath).hash;
    writeFileSync(manifestPath, JSON.stringify({ repositories: [
      { repo: "acme/one", url: "https://github.com/acme/one", default_head_sha: "a".repeat(40) },
      { repo: "acme/two", url: "https://github.com/acme/two" },
    ] }));
    const second = readBatchManifest(manifestPath);
    assert.notEqual(first, second.hash);
    assert.equal(second.repositories[0]?.expectedSha, "a".repeat(40));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a completed scan reports a moved commit and cannot pass the batch", async () => {
  const { dir, statePath, state } = fixture();
  try {
    state.entries[0]!.expectedSha = "a".repeat(40);
    const scans = new Map<string, string>();
    const client = {
      projects: async () => ({ projects: [...scans].map(([repo, id]) => {
        const value = project(repo, id, "completed");
        value.scan!.commitSha = "b".repeat(40);
        return value;
      }) }),
      scanPublicRepo: async (url: string) => {
        const repo = url.replace("https://github.com/", "");
        const id = `scan-${scans.size + 1}`;
        scans.set(repo, id);
        return { project: project(repo, id, "running"), scanId: id };
      },
    } as Pick<CefenseClient, "projects" | "scanPublicRepo">;
    const outcome = await runBatch(client, state, statePath, { maxActive: 2, pollSeconds: 0, timeoutMinutes: 1 });
    assert.equal(outcome.exitCode, 4);
    assert.deepEqual((outcome.data as { input: object }).input, { match: 0, mismatch: 1, unknown: 0 });
    assert.equal(JSON.parse(readFileSync(statePath, "utf8")).entries[0].actualSha, "b".repeat(40));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
