import { strict as assert } from "node:assert";
import { test } from "node:test";
import { compactFinding, compactFix, progressOf } from "../src/core/compact.js";
import { reachabilityLabel, statusFor } from "../src/core/findingStatus.js";
import { trimValue } from "../src/commands/proofenv.js";
import type { Finding, Fix } from "../src/core/types.js";

function finding(over: Partial<Finding> = {}): Finding {
  return {
    id: "f-1",
    scanId: "s-1",
    filePath: "src/app.ts",
    severity: "high",
    title: "SQL injection",
    description: "",
    vulnerableCode: "",
    suggestedFix: null,
    startLine: 3,
    endLine: 3,
    category: "code",
    cveId: null,
    cwe: null,
    ruleId: null,
    type: null,
    state: "CONFIRMED",
    confidence: null,
    exploitPath: null,
    symbol: null,
    dataflow: null,
    remediation: null,
    vulnerabilityRefs: [],
    fingerprint: null,
    createdAt: "2026-09-25T00:00:00Z",
    intelligenceSources: [],
    ...over,
  };
}

function fix(over: Partial<Fix> = {}): Fix {
  return {
    id: "x-1",
    findingId: "f-1",
    status: "ready",
    strategy: "model",
    filePath: "src/app.ts",
    baseSha: "abcdef0123",
    diff: "--- a\n+++ b",
    explanation: null,
    prUrl: null,
    prNumber: null,
    branch: null,
    error: null,
    model: null,
    createdAt: "2026-09-25T00:00:00Z",
    updatedAt: "2026-09-25T00:00:00Z",
    ...over,
  };
}

test("a finding with no fix has no patch yet", () => {
  assert.equal(statusFor(null).kind, "none");
  assert.equal(statusFor({ fix: null, proof: null }).kind, "none");
});

test("a refuted proof outranks an open pull request", () => {
  const status = statusFor({
    fix: { status: "opened", prNumber: 12 },
    proof: { status: "settled", verdict: "refuted" },
  });
  assert.equal(status.kind, "refuted");
});

test("an argued proof reads as proven, and says it is an argument", () => {
  const status = statusFor({ fix: { status: "ready", prNumber: null }, proof: { status: "settled", verdict: "argued" } });
  assert.equal(status.kind, "proven");
  assert.match(status.title, /^Argued/);
});

test("progress falls back to the fix when an older API sends none", () => {
  const progress = progressOf(finding(), fix({ status: "merged", prNumber: 4 }));
  assert.deepEqual(progress, { fix: { status: "merged", prNumber: 4 }, proof: null });
  assert.equal(statusFor(progress).title, "Merged: Pull request #4");
});

test("the API's progress wins over the fix list", () => {
  const progress = { fix: { status: "ready" as const, prNumber: null }, proof: { status: "running" as const, verdict: null } };
  assert.equal(progressOf(finding({ progress }), fix({ status: "failed" })), progress);
});

test("a compact finding carries reachability, status and package", () => {
  const compact = compactFinding(
    finding({
      category: "dependency",
      reachability: "dev-only",
      dependency: {
        ecosystem: "npm",
        name: "lodash",
        installedVersion: "4.17.15",
        fixedVersion: "4.17.21",
        direct: false,
        scope: "dev",
        paths: [["app", "lodash"]],
        requiredBy: ["app"],
        pathsTruncated: false,
      },
    }),
    null,
  );
  assert.equal(compact.reachability, "dev-only");
  assert.equal(compact.reachabilityLabel, "Development only");
  assert.equal(compact.status, "none");
  assert.equal(compact.package, "lodash@4.17.15");
  assert.equal(compact.fixedIn, "4.17.21");
});

test("an older finding with no reachability leaves the keys absent", () => {
  const compact = compactFinding(finding(), null);
  assert.equal("reachability" in compact, false);
  assert.equal("reachabilityLabel" in compact, false);
  assert.equal(reachabilityLabel("sideways"), null);
});

test("a compact fix lists its files only when there is more than one", () => {
  assert.equal("files" in compactFix(fix({ files: [{ path: "src/app.ts" }] })), false);
  const many = compactFix(fix({ files: [{ path: "a.ts" }, { path: "b.ts" }], behaviorChange: "removed" }));
  assert.deepEqual(many.files, ["a.ts", "b.ts"]);
  assert.equal(many.behaviorChange, "removed");
});

test("a piped value loses exactly one trailing newline", () => {
  assert.equal(trimValue("secret\n"), "secret");
  assert.equal(trimValue("secret\r\n"), "secret");
  assert.equal(trimValue("a\n\n"), "a\n");
  assert.equal(trimValue("no-newline"), "no-newline");
});
