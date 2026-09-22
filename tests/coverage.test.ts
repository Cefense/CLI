import { strict as assert } from "node:assert";
import { test } from "node:test";
import { coverageEnvelope } from "../src/core/compact.js";
import { coverageLines, isPartialScan, scanIfSame } from "../src/core/coverage.js";
import type { ScanSummary } from "../src/core/types.js";

function scan(over: Partial<ScanSummary> = {}): ScanSummary {
  return {
    id: "scan-1",
    status: "completed",
    fileCount: 100,
    filesScanned: 100,
    findingCount: 0,
    stage: null,
    error: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:05:00.000Z",
    ...over,
  };
}

test("a scan from a scanner that never reported coverage is not called partial", () => {
  // Unknown and complete are different claims. Treating the first as the
  // second is how a half-read repository gets presented as a clean one.
  assert.equal(isPartialScan(scan()), false);
  assert.deepEqual(coverageEnvelope(scan()), {});
});

test("a clean scan says so in the envelope", () => {
  // Emitted even though it carries no gaps: without it an agent cannot tell a
  // complete scan from one too old to report.
  assert.deepEqual(coverageEnvelope(scan({ outcome: "clean" })), { coverage: "clean" });
});

test("a partial scan carries its gaps", () => {
  const settled = scan({
    outcome: "partial",
    coverageGaps: [
      { kind: "files-truncated", detail: "8000 files were not read", count: 8000 },
      { kind: "call-budget-exhausted", detail: "the analysis budget ran out" },
    ],
  });
  assert.deepEqual(coverageEnvelope(settled), {
    coverage: "partial",
    coverageGaps: [
      { kind: "files-truncated", detail: "8000 files were not read", count: 8000 },
      { kind: "call-budget-exhausted", detail: "the analysis budget ran out" },
    ],
  });
});

test("a clean scan's gaps are dropped rather than emitted as an empty promise", () => {
  const settled = scan({
    outcome: "clean",
    coverageGaps: [{ kind: "files-truncated", detail: "left over from somewhere" }],
  });
  assert.deepEqual(coverageEnvelope(settled), { coverage: "clean" });
  assert.deepEqual(coverageLines(settled), []);
});

test("a partial scan with no detail still announces itself", () => {
  // The flag is the load-bearing part; gaps are the explanation. A scanner
  // that reports one without the other must not read as complete.
  const settled = scan({ outcome: "partial", coverageGaps: null });
  assert.equal(isPartialScan(settled), true);
  assert.deepEqual(coverageEnvelope(settled), { coverage: "partial" });
});

test("no scan at all is not a partial scan", () => {
  assert.equal(isPartialScan(null), false);
  assert.deepEqual(coverageEnvelope(null), {});
});

test("coverage is only attached to the scan it belongs to", () => {
  // cf reproduced can be pointed at a branch or an explicit scan id while the
  // project still carries its newest scan. Labelling one scan's findings with
  // another scan's coverage would be the same lie in the other direction.
  const newest = scan({ id: "scan-newest", outcome: "partial" });
  assert.equal(scanIfSame(newest, "scan-newest"), newest);
  assert.equal(scanIfSame(newest, "scan-older"), null);
  assert.equal(scanIfSame(newest, null), null);
  assert.deepEqual(coverageEnvelope(scanIfSame(newest, "scan-older")), {});
});
