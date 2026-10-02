import { strict as assert } from "node:assert";
import { test } from "node:test";
import { awaitScan } from "../src/commands/scan.js";
import type { Session } from "../src/core/session.js";
import type { Project, ScanSummary } from "../src/core/types.js";

function scan(id: string, status: ScanSummary["status"]): ScanSummary {
  return {
    id,
    status,
    fileCount: 1,
    filesScanned: status === "completed" ? 1 : 0,
    findingCount: 0,
    stage: null,
    error: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    finishedAt: status === "completed" ? "2026-01-01T00:01:00.000Z" : null,
  };
}

function sessionWithScans(scans: ScanSummary[]): Session {
  let index = 0;
  return {
    client: {
      projects: async () => ({
        projects: [{
          githubRepoId: "repo-1",
          scan: scans[Math.min(index++, scans.length - 1)],
        } as Project],
      }),
    },
  } as Session;
}

test("waiting follows the scan that was just queued instead of the previous completed scan", async () => {
  const previous = scan("previous", "completed");
  const running = scan("new", "running");
  const completed = scan("new", "completed");
  const seen: Array<string | null> = [];
  const result = await awaitScan(
    sessionWithScans([previous, running, completed]),
    "repo-1",
    "new",
    3,
    (current) => seen.push(current?.id ?? null),
    0,
  );
  assert.equal(result, completed);
  assert.deepEqual(seen, [null, "new", "new"]);
});

test("waiting never treats another scan's terminal status as this scan's result", async () => {
  const result = await awaitScan(
    sessionWithScans([scan("previous", "completed")]),
    "repo-1",
    "new",
    2,
    null,
    0,
  );
  assert.equal(result, null);
});
