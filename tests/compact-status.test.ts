import { strict as assert } from "node:assert";
import { test } from "node:test";
import { compactProject } from "../src/core/compact.js";
import type { Project } from "../src/core/types.js";

function project(status: "running" | "completed", finishedAt: string | null): Project {
  return {
    id: "repo-id",
    fullName: "acme/api",
    name: "api",
    owner: "acme",
    githubRepoId: "123",
    private: false,
    defaultBranch: "main",
    htmlUrl: "https://github.com/acme/api",
    scan: {
      id: "scan-id",
      status,
      fileCount: 10,
      filesScanned: status === "completed" ? 10 : 5,
      findingCount: 2,
      stage: null,
      error: null,
      createdAt: "2026-10-02T07:00:00.000Z",
      finishedAt,
    },
  } as Project;
}

test("agent status does not invent a completion time for an active scan", () => {
  const compact = compactProject(project("running", null));
  assert.deepEqual(compact.scan, {
    id: "scan-id",
    status: "running",
    findings: 2,
    createdAt: "2026-10-02T07:00:00.000Z",
  });
});

test("agent status preserves distinct creation and completion times", () => {
  const compact = compactProject(project("completed", "2026-10-02T07:05:00.000Z"));
  assert.deepEqual(compact.scan, {
    id: "scan-id",
    status: "completed",
    findings: 2,
    createdAt: "2026-10-02T07:00:00.000Z",
    finishedAt: "2026-10-02T07:05:00.000Z",
  });
});
