import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  ATTENTION_LIMIT,
  ATTENTION_ROW,
  AUDIT_ROW,
  FINDING_ROW,
  FIX_ROW,
  PROJECT_ROW,
  PROOF_ROW,
  attentionList,
  compactFinding,
  compactFindingDetail,
  compactProject,
  latestWithFindings,
  repositoryCounts,
  shapeRow,
} from "../src/core/compact.js";
import { CefenseError, UsageError } from "../src/core/errors.js";
import { agentEmit, agentError, agentRemedy, setCommandName, setFieldFilter } from "../src/ui/output.js";
import type { Finding, Fix, Project, ScanSummary } from "../src/core/types.js";

function finding(over: Partial<Finding> = {}): Finding {
  return {
    id: "f-1",
    scanId: "s-1",
    filePath: "src/app.ts",
    severity: "high",
    title: "SQL injection",
    description: "User input reaches a query.",
    vulnerableCode: "db.query(input)",
    suggestedFix: null,
    startLine: 3,
    endLine: 5,
    category: "code",
    cveId: null,
    cwe: "CWE-89",
    ruleId: "SQLI-001",
    type: null,
    state: "CONFIRMED",
    confidence: 0.9,
    exploitPath: null,
    symbol: null,
    dataflow: null,
    remediation: { summary: "Bind parameters.", guidance: "Use a prepared statement." },
    vulnerabilityRefs: [],
    fingerprint: null,
    createdAt: "2026-09-25T00:00:00Z",
    intelligenceSources: [],
    reachability: "reachable",
    introducedIn: {
      sha: "9ab756c7aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      message: "add search",
      authorName: "A Maloo",
      committedAt: "2026-08-18T18:25:51.000Z",
    },
    ...over,
  } as Finding;
}

function fix(over: Partial<Fix> = {}): Fix {
  return {
    id: "x-1",
    findingId: "f-1",
    status: "opened",
    strategy: "model",
    filePath: "src/app.ts",
    baseSha: "abcdef0123",
    diff: "--- a\n+++ b",
    explanation: "Binds the parameter.",
    prUrl: "https://github.com/acme/api/pull/7",
    prNumber: 7,
    branch: "cefense-fix/f-1",
    error: null,
    model: null,
    behaviorChange: "none",
    createdAt: "2026-09-25T00:00:00Z",
    updatedAt: "2026-09-25T00:00:00Z",
    ...over,
  };
}

function scan(over: Partial<ScanSummary> = {}): ScanSummary {
  return {
    id: "s-1",
    status: "completed",
    fileCount: 10,
    filesScanned: 10,
    findingCount: 4,
    stage: null,
    error: null,
    createdAt: "2026-10-01T00:00:00Z",
    finishedAt: "2026-10-01T00:10:00Z",
    outcome: "clean",
    coverageGaps: null,
    ...over,
  };
}

function project(name: string, summary: ScanSummary | null): Project {
  return {
    id: name,
    provider: "github",
    githubRepoId: `${name.length}`,
    fullName: name,
    name: name.split("/")[1] ?? name,
    owner: name.split("/")[0] ?? name,
    private: true,
    defaultBranch: "main",
    htmlUrl: `https://github.com/${name}`,
    coverages: ["sast", "sca"],
    scanMode: "manual",
    scanDepth: "default",
    profile: null,
    connectedAt: "2026-09-01T00:00:00Z",
    scan: summary,
  };
}

function capture(run: () => void): Record<string, unknown> {
  const original = process.stdout.write.bind(process.stdout);
  let written = "";
  process.stdout.write = ((chunk: string | Uint8Array) => {
    written += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  try {
    run();
  } finally {
    process.stdout.write = original;
  }
  assert.equal(written.split("\n").filter(Boolean).length, 1, "an envelope is exactly one line");
  return JSON.parse(written) as Record<string, unknown>;
}

test("a finding row keeps what picks the next call and drops what the detail carries", () => {
  const full = compactFinding(finding(), fix());
  const row = shapeRow(full, FINDING_ROW);
  assert.deepEqual(Object.keys(row), [
    "id",
    "severity",
    "severityLabel",
    "title",
    "file",
    "line",
    "category",
    "cwe",
    "rule",
    "reachability",
    "status",
    "fix",
  ]);
  assert.deepEqual(row.fix, { status: "opened", prUrl: "https://github.com/acme/api/pull/7", prNumber: 7 });
  const detail = compactFindingDetail(finding(), fix());
  for (const key of ["description", "code", "guidance", "introducedIn", "endLine", "reachabilityLabel"]) {
    assert.equal(key in row, false, `${key} left the list row`);
    assert.ok(key in detail, `${key} is still in cf reproduced show`);
  }
});

test("a repository row is a name, a host and the last scan", () => {
  const partial = scan({ outcome: "partial", coverageGaps: [{ kind: "file-too-large", detail: "2 files", count: 2 }] });
  const row = shapeRow(compactProject(project("acme/api", partial)), PROJECT_ROW);
  assert.deepEqual(row, {
    repository: "acme/api",
    provider: "github",
    scan: { id: "s-1", status: "completed", findings: 4, coverage: "partial", finishedAt: "2026-10-01T00:10:00Z" },
  });
  const full = compactProject(project("acme/api", partial));
  for (const key of ["githubRepoId", "private", "defaultBranch", "url", "scanMode", "scanDepth", "checks"]) {
    assert.ok(key in full, `${key} is still reachable through cf agent check and --fields`);
  }
});

test("list shapes never name a key the full row does not have", () => {
  const findingKeys = new Set([
    ...Object.keys(compactFinding(finding({ category: "dependency", cveId: "CVE-1" }), fix())),
    "package",
    "fixedIn",
    "matchedSources",
  ]);
  for (const key of FINDING_ROW.keys) assert.ok(findingKeys.has(key), `finding row names ${key}`);
  const projectKeys = new Set(Object.keys(compactProject(project("acme/api", scan()))));
  for (const key of PROJECT_ROW.keys) assert.ok(projectKeys.has(key), `project row names ${key}`);
  for (const key of ATTENTION_ROW.keys) assert.ok(projectKeys.has(key), `attention row names ${key}`);
  for (const shape of [FIX_ROW, PROOF_ROW, AUDIT_ROW]) assert.ok(shape.keys.length > 0);
});

test("agentEmit leans the named lists and --fields reaches past the lean row", () => {
  setCommandName("reproduced");
  setFieldFilter(undefined);
  const data = { repository: "acme/api", findings: [compactFinding(finding(), null)] };
  const lean = capture(() => agentEmit(data, ["cf reproduced show f-1 --repo acme/api --agent", ""], { findings: FINDING_ROW }));
  assert.equal(lean.schemaVersion, 1);
  assert.equal(lean.ok, true);
  assert.equal(lean.command, "reproduced");
  assert.deepEqual(lean.next, ["cf reproduced show f-1 --repo acme/api --agent"]);
  const row = (lean.data as { findings: Array<Record<string, unknown>> }).findings[0]!;
  assert.equal("description" in row, false);

  setFieldFilter("title,description,introducedIn");
  try {
    const wide = capture(() => agentEmit(data, [], { findings: FINDING_ROW }));
    const widened = (wide.data as { findings: Array<Record<string, unknown>> }).findings[0]!;
    assert.deepEqual(Object.keys(widened), ["id", "title", "description", "introducedIn"]);
    assert.equal("next" in wide, false);
  } finally {
    setFieldFilter(undefined);
  }
});

test("status counts every repository and lists only the ones that need attention", () => {
  const projects = [
    project("acme/done", scan({ findingCount: 3, finishedAt: "2026-10-02T00:00:00Z" })),
    project("acme/older", scan({ findingCount: 9, finishedAt: "2026-09-02T00:00:00Z" })),
    project("acme/broken", scan({ status: "failed", error: "Scan timed out" })),
    project("acme/new", null),
    project("acme/busy", scan({ status: "running", finishedAt: null })),
    project("acme/partial", scan({ outcome: "partial", findingCount: 0 })),
  ];
  assert.deepEqual(repositoryCounts(projects), {
    repositories: 6,
    scanning: 1,
    failed: 1,
    cancelled: 0,
    neverScanned: 1,
    partial: 1,
    findings: 3 + 9 + 4 + 4 + 0,
  });
  const attention = attentionList(projects).map((entry) => entry.fullName);
  assert.deepEqual(attention, ["acme/busy", "acme/broken", "acme/new"]);
  const failed = shapeRow(compactProject(projects[2]!), ATTENTION_ROW);
  assert.equal((failed.scan as Record<string, unknown>).error, "Scan timed out");
  assert.equal(latestWithFindings(projects)?.fullName, "acme/done");
  const many = Array.from({ length: 30 }, (_, index) => project(`acme/r${index}`, null));
  assert.equal(attentionList(many).length, ATTENTION_LIMIT);
});

test("a remedy that names a safe command becomes that command, ready to run", () => {
  assert.equal(
    agentRemedy("Run cf reproduced --repo acme/api to list finding ids.", "finding_not_found"),
    "cf reproduced --repo acme/api --agent",
  );
  assert.equal(
    agentRemedy("Run cf repo connect acme/apx, or cf repo list to see what is.", "usage_error"),
    "cf repo list --agent",
  );
  assert.equal(
    agentRemedy("Run cf scan --repo acme/api --branch first.", "branch_not_scanned"),
    "cf scan --repo acme/api --branch first --agent",
  );
  assert.equal(agentRemedy("Run cf org list --agent for the slugs.", "unknown_organization"), "cf org list --agent");
  assert.equal(agentRemedy(null, "allowance_exhausted"), "cf plan --agent");
  assert.equal(agentRemedy(null, "scan_in_flight"), "cf status --agent");
});

test("a remedy that needs the user, a placeholder, or prose stays prose", () => {
  const kept = [
    "Run cf auth login.",
    "Pass --yes to confirm: cf fix publish f-1 --yes",
    "Run cf fix publish f-1 --repo acme/api --yes first.",
    "Run cf settings checks sbom --add --repo acme/api, then rescan.",
    "Use critical, high, watch (medium), or info (low).",
    "Re-run without max depth, which scans at default depth. cf plan --agent says which plans include it.",
    "Run cf fix generate <finding-id> --repo <owner/name> --wait --agent.",
  ];
  for (const remedy of kept) assert.equal(agentRemedy(remedy, "usage_error"), remedy);
  assert.equal(agentRemedy(null, "usage_error"), null);
  assert.equal(agentRemedy(null, "api_error"), "Retry once. If it fails again, report error.message verbatim.");
});

test("an error envelope is one line with a code, a one-line message and a runnable remedy", () => {
  setCommandName("reproduced show");
  const failure = capture(() =>
    agentError(
      new UsageError(
        "deadbeef is not a finding\n  in the scan being read.",
        "Run cf reproduced --repo acme/api to list finding ids.",
        "finding_not_found",
      ),
    ),
  );
  assert.deepEqual(failure, {
    schemaVersion: 1,
    ok: false,
    command: "reproduced show",
    error: {
      code: "finding_not_found",
      message: "deadbeef is not a finding in the scan being read.",
      remedy: "cf reproduced --repo acme/api --agent",
      exitCode: 2,
    },
  });
  const crash = capture(() => agentError(new TypeError("boom")));
  assert.deepEqual(Object.keys(crash.error as object), ["code", "message", "remedy", "exitCode"]);
  assert.equal((crash.error as { code: string }).code, "internal_error");
  assert.equal(JSON.stringify(crash).includes("at "), false, "no stack text");
  const wire = capture(() => agentError(new CefenseError("Not found.", { code: "api_error" })));
  assert.equal((wire.error as { exitCode: number }).exitCode, 4);
});

function sourceDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 6; depth += 1) {
    try {
      readdirSync(join(dir, "src", "commands"));
      return join(dir, "src", "commands");
    } catch {
      dir = dirname(dir);
    }
  }
  throw new Error("could not locate src/commands from the test");
}

test("next hints are literal: no placeholders, and finding commands name their repository", () => {
  const offenders: string[] = [];
  for (const name of readdirSync(sourceDir())) {
    if (!name.endsWith(".ts") || name === "agent.ts") continue;
    const source = readFileSync(join(sourceDir(), name), "utf8");
    for (const match of source.matchAll(/[`"](cf [^`"]*--agent)[`"]/g)) {
      const command = match[1]!;
      if (/<[a-z-]+>/.test(command)) offenders.push(`${name}: ${command}`);
      if (/^cf (fix (show|generate|publish|merge)|proof (run|show|attest)|reproduced show|triage) /.test(command) && !command.includes("--repo")) {
        offenders.push(`${name}: ${command}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});
