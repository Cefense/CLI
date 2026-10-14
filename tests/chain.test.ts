import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, test } from "node:test";
import { stripAnsi } from "../src/ui/format.js";
import { compactFindingDetail } from "../src/core/compact.js";
import { mergeContext, parseCostRange, parseCents, parseRecords } from "../src/commands/orgcontext.js";
import { UsageError } from "../src/core/errors.js";
import type { BusinessContextResponse, Chain, Finding, GuardResponse } from "../src/core/types.js";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "index.js");

const sqliChain: Chain = {
  weakness: {
    cwe: "CWE-89",
    cweName: "Improper Neutralization of Special Elements used in an SQL Command ('SQL Injection')",
    cweIds: ["CWE-89"],
  },
  attack: {
    capec: { id: "CAPEC-66", name: "SQL Injection" },
    route: [
      { label: "GET /api/orders", file: "src/routes/orders.ts", line: 31, role: "entry" },
      { label: "db.query(sql)", file: "src/db/orders.ts", line: 14, role: "sink" },
    ],
    steps: [
      { id: "T1190", name: "Exploit Public-Facing Application", tactics: ["initial-access"], source: "mitre" },
      {
        id: "T1213",
        name: "Data from Information Repositories",
        tactics: ["collection"],
        source: "cefense",
        observedAt: "2026-10-14T10:00:00Z",
        observedFrom: "203.0.113.7",
      },
    ],
  },
  impact: {
    assets: [{ kind: "table", name: "users", detail: "email, password_hash", recordShare: 1 }],
  },
  fix: { d3fend: [{ id: "D3-SCH", name: "Source Code Hardening", tactic: "Harden" }] },
  mappingVersion: "cwe-4.20+capec-3.9+attack-20.0+d3fend-1.6.0+bridge-1",
  shown: "full",
};

const weaknessOnlyChain: Chain = {
  weakness: {
    cve: "CVE-2021-23337",
    cwe: "CWE-77",
    cweName: "Improper Neutralization of Special Elements used in a Command ('Command Injection')",
    cweIds: ["CWE-77", "CWE-94"],
  },
  attack: { route: [], steps: [] },
  impact: { assets: [] },
  fix: { d3fend: [] },
  mappingVersion: "cwe-4.20+capec-3.9+attack-20.0+d3fend-1.6.0+bridge-1",
  shown: "weakness-only",
};

function finding(over: Partial<Finding>): Finding {
  return {
    id: "3b84f10c-1111-2222-3333-444444444444",
    scanId: "scan-1",
    filePath: "src/db/orders.ts",
    severity: "high",
    title: "SQL injection in order search",
    description: "The search term is concatenated into the query.",
    vulnerableCode: "db.query(sql)",
    suggestedFix: null,
    startLine: 14,
    endLine: 14,
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
    fingerprint: "fp-sqli",
    createdAt: "2026-10-01T00:00:00Z",
    reachability: "reachable",
    progress: { fix: null, proof: null },
    ...over,
  };
}

const full = finding({
  chain: sqliChain,
  loss: {
    low: 85_200_000,
    high: 280_000_000,
    inputs: [
      { label: "Records held", value: "180,000" },
      { label: "Cost per record", value: "$4-$14" },
    ],
    formulaVersion: "fair-1",
  },
  likelihood: {
    score: 80,
    signals: [{ kind: "reachability", label: "Reachable from an HTTP route the application exposes" }],
  },
});

const weaknessOnly = finding({
  id: "7c1a92e0-1111-2222-3333-444444444444",
  title: "lodash@4.17.20: CVE-2021-23337",
  filePath: "package-lock.json",
  category: "dependency",
  cveId: "CVE-2021-23337",
  cwe: "CWE-77",
  fingerprint: "fp-lodash",
  reachability: "imported",
  chain: weaknessOnlyChain,
  loss: null,
  likelihood: { score: 50, signals: [{ kind: "reachability", label: "The vulnerable code is imported by code that runs" }] },
});

const project = {
  id: "project-1",
  provider: "github",
  githubRepoId: "4242",
  fullName: "acme/api",
  name: "api",
  owner: "acme",
  private: true,
  defaultBranch: "main",
  htmlUrl: "https://github.com/acme/api",
  coverages: [],
  profile: null,
  connectedAt: "2026-09-01T00:00:00Z",
  scan: null,
};

let server: Server;
let apiUrl = "";
let home = "";
let context: BusinessContextResponse = { context: null, canEdit: true };
let guard: GuardResponse = { decoys: [], events: [] };
const requests: Array<{ method: string; path: string; body: unknown }> = [];

function reply(method: string, path: string, body: unknown): { status: number; body: unknown } {
  if (path === "/api/cli/config") {
    return {
      status: 200,
      body: {
        apiVersion: 1,
        minimumCliVersion: "0.0.0",
        webUrl: apiUrl,
        auth: {
          issuer: apiUrl,
          authorizationEndpoint: `${apiUrl}/oauth/authorize`,
          tokenEndpoint: `${apiUrl}/oauth/token`,
          revocationEndpoint: `${apiUrl}/oauth/revoke`,
          clientId: "test",
          scopes: [],
          codeChallengeMethod: "S256",
          redirectUris: [],
        },
      },
    };
  }
  if (path === "/api/github/projects") return { status: 200, body: { projects: [project] } };
  if (path.startsWith("/api/github/projects/4242/findings")) {
    return {
      status: 200,
      body: { scanId: "scan-1", findings: [full, weaknessOnly], chains: [], total: 2, limit: 2, offset: 0, hasMore: false },
    };
  }
  if (path.startsWith("/api/fix/findings/")) return { status: 200, body: { fix: null } };
  if (path === "/api/organization/business-context" && method === "GET") return { status: 200, body: context };
  if (path === "/api/organization/business-context" && method === "PUT") {
    context = {
      context: {
        ...(body as BusinessContextResponse["context"] & object),
        updatedAt: "2026-10-14T09:00:00Z",
        updatedBy: { id: "u1", name: "Aarav Maloo" },
      },
      canEdit: true,
    };
    return { status: 200, body: context };
  }
  if (path.startsWith("/api/guard")) return { status: 200, body: guard };
  return { status: 404, body: { error: "Not found." } };
}

before(async () => {
  home = mkdtempSync(join(tmpdir(), "cf-chain-"));
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      const url = new URL(req.url ?? "/", apiUrl);
      const body = raw ? (JSON.parse(raw) as unknown) : undefined;
      requests.push({ method: req.method ?? "GET", path: `${url.pathname}${url.search}`, body });
      const answer = reply(req.method ?? "GET", url.pathname, body);
      res.writeHead(answer.status, { "content-type": "application/json" });
      res.end(JSON.stringify(answer.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
  rmSync(home, { recursive: true, force: true });
});

beforeEach(() => {
  requests.length = 0;
  context = { context: null, canEdit: true };
  guard = { decoys: [], events: [] };
});

function cf(args: string[], env: Record<string, string> = {}): Promise<{ stdout: string; stderr: string; status: number | null }> {
  const base: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    CEFENSE_API_URL: apiUrl,
    CEFENSE_TOKEN: "test-token",
    CEFENSE_ORG: "acme",
    NO_COLOR: "1",
    CEFENSE_AGENT: "0",
    ...env,
  };
  delete base.FORCE_COLOR;
  delete base.CEFENSE_REPO;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { env: base, cwd: home });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => resolve({ stdout, stderr, status }));
  });
}

function envelope(stdout: string): { ok: boolean; data: Record<string, unknown>; next?: string[]; error?: { code: string } } {
  const lines = stdout.trimEnd().split("\n");
  assert.equal(lines.length, 1, stdout);
  return JSON.parse(lines[0]!);
}

test("cf finding view prints the five stages of a full chain", async () => {
  const result = await cf(["finding", "view", "3b84f10c", "--repo", "acme/api"]);
  assert.equal(result.status, 0, result.stderr);
  const text = stripAnsi(result.stdout);
  const headings = text.split("\n").filter((line) => ["Weakness", "Attack", "Impact", "Fix", "Proof"].includes(line));
  assert.deepEqual(headings, ["Weakness", "Attack", "Impact", "Fix", "Proof"]);
  assert.match(text, /CWE-89 {2}Improper Neutralization of Special Elements used in an SQL Command/);
  assert.match(text, /CAPEC-66 {2}SQL Injection/);
  assert.match(text, /T1190 {2}Exploit Public-Facing Application {2}initial access {2}predicted {2}MITRE/);
  assert.match(text, /T1213 {2}Data from Information Repositories {2}collection {2}seen .* from 203\.0\.113\.7 {2}Cefense/);
  assert.match(text, /table users {2}email, password_hash/);
  assert.match(text, /\$852,000-\$2,800,000 for one incident \(estimate, fair-1\)/);
  assert.match(text, /Records held: 180,000/);
  assert.match(text, /Likelihood 80 of 100/);
  assert.match(text, /Reachable from an HTTP route the application exposes/);
  assert.match(text, /D3-SCH {2}Source Code Hardening {2}Harden/);
  assert.match(text, /No proof has run|Nothing to prove until there is a patch/);
  assert.doesNotMatch(text, /Attack and Impact appear/);
});

test("cf finding view of a weakness-only finding prints Weakness and says when the rest appears", async () => {
  const result = await cf(["finding", "view", "7c1a92e0", "--repo", "acme/api"]);
  assert.equal(result.status, 0, result.stderr);
  const text = stripAnsi(result.stdout);
  const headings = text.split("\n").filter((line) => ["Weakness", "Attack", "Impact", "Fix", "Proof"].includes(line));
  assert.deepEqual(headings, ["Weakness", "Fix", "Proof"]);
  assert.match(text, /CVE-2021-23337/);
  assert.match(text, /CWE-77 {2}Improper Neutralization/);
  assert.match(text, /also CWE-94/);
  assert.match(text, /Attack and Impact appear once this finding is confirmed\./);
  assert.doesNotMatch(text, /for one incident/);
});

test("cf finding view --json passes chain, loss and likelihood through untouched", async () => {
  const result = await cf(["finding", "view", "3b84f10c", "--repo", "acme/api", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout) as { finding: Finding };
  assert.deepEqual(parsed.finding.chain, full.chain);
  assert.deepEqual(parsed.finding.loss, full.loss);
  assert.deepEqual(parsed.finding.likelihood, full.likelihood);
});

test("cf finding view --agent stays compact and adds the chain ids", async () => {
  const result = await cf(["finding", "view", "3b84f10c", "--repo", "acme/api", "--agent"]);
  assert.equal(result.status, 0, result.stderr);
  const data = envelope(result.stdout).data as { finding: Record<string, unknown> };
  assert.deepEqual(data.finding.chain, {
    shown: "full",
    cweIds: ["CWE-89"],
    capec: "CAPEC-66",
    attack: ["T1190", "T1213"],
    seen: ["T1213"],
    assets: ["table:users"],
    d3fend: ["D3-SCH"],
  });
  assert.deepEqual(data.finding.loss, { lowCents: 85_200_000, highCents: 280_000_000 });
  assert.equal(data.finding.likelihood, 80);

  const lean = compactFindingDetail(weaknessOnly, null);
  assert.deepEqual(lean.chain, { shown: "weakness-only", cweIds: ["CWE-77", "CWE-94"] });
  assert.equal(lean.loss, undefined);
});

test("cf org context says when nothing is set and how to set it", async () => {
  const result = await cf(["org", "context"]);
  assert.equal(result.status, 0, result.stderr);
  const text = stripAnsi(result.stdout);
  assert.match(text, /Business context acme/);
  assert.match(text, /Not set, so findings show their chain without a cost estimate\./);
  assert.match(text, /cf org context set --records 180000 --revenue-per-hour 6000 --cost-per-record 4-14/);
  const agent = envelope((await cf(["org", "context", "--agent"])).stdout);
  assert.deepEqual(agent.data, { organization: "acme", set: false, canEdit: true });
});

test("cf org context set sends cents on the wire and prints dollars back", async () => {
  const result = await cf([
    "org",
    "context",
    "set",
    "--records",
    "180,000",
    "--revenue-per-hour",
    "6000",
    "--cost-per-record",
    "4-14",
    "--agent",
  ]);
  assert.equal(result.status, 0, result.stdout);
  const put = requests.find((request) => request.method === "PUT");
  assert.deepEqual(put?.body, {
    recordsHeld: 180_000,
    revenuePerHourCents: 600_000,
    costPerRecordLowCents: 400,
    costPerRecordHighCents: 1_400,
  });
  const agent = envelope(result.stdout);
  assert.equal(agent.data.set, true);
  assert.equal(agent.data.revenuePerHourCents, 600_000);
  assert.deepEqual(agent.next, ["cf org context --agent"]);

  const shown = stripAnsi((await cf(["org", "context"])).stdout);
  assert.match(shown, /Records held +180,000/);
  assert.match(shown, /Revenue per hour +\$6,000/);
  assert.match(shown, /Cost per record +\$4-\$14/);
});

test("cf org context set keeps the answers it was not given", async () => {
  context = {
    context: {
      recordsHeld: 180_000,
      revenuePerHourCents: 600_000,
      costPerRecordLowCents: 400,
      costPerRecordHighCents: 1_400,
      updatedAt: "2026-10-13T09:00:00Z",
      updatedBy: null,
    },
    canEdit: true,
  };
  const result = await cf(["org", "context", "set", "--revenue-per-hour", "7500.50", "--agent"]);
  assert.equal(result.status, 0, result.stdout);
  const put = requests.find((request) => request.method === "PUT");
  assert.deepEqual(put?.body, {
    recordsHeld: 180_000,
    revenuePerHourCents: 750_050,
    costPerRecordLowCents: 400,
    costPerRecordHighCents: 1_400,
  });
});

test("cf org context set refuses a bad answer before calling the API", async () => {
  const result = await cf(["org", "context", "set", "--cost-per-record", "14-4", "--agent"]);
  assert.equal(result.status, 2);
  assert.equal(envelope(result.stdout).error?.code, "invalid_business_context");
  assert.equal(requests.filter((request) => request.path.startsWith("/api/organization")).length, 0);

  const first = await cf(["org", "context", "set", "--records", "10", "--agent"]);
  assert.equal(first.status, 2);
  assert.equal(envelope(first.stdout).error?.code, "invalid_business_context");
  assert.equal(requests.filter((request) => request.method === "PUT").length, 0);
});

test("business context parsing is dollars in, cents out, within the product's limits", () => {
  assert.equal(parseRecords("1_000"), 1000);
  assert.equal(parseCents("$6,000", "--revenue-per-hour", 10_000_000_000_000), 600_000);
  assert.equal(parseCents("4.5", "--cost-per-record", 10_000_000), 450);
  assert.deepEqual(parseCostRange("$4 - $14"), { low: 400, high: 1_400 });
  assert.deepEqual(parseCostRange("10"), { low: 1_000, high: 1_000 });
  assert.throws(() => parseRecords("-1"), UsageError);
  assert.throws(() => parseRecords("1.5"), UsageError);
  assert.throws(() => parseRecords("1000000000001"), UsageError);
  assert.throws(() => parseCents("4.505", "--cost-per-record", 10_000_000), UsageError);
  assert.throws(() => parseCents("100001", "--cost-per-record", 10_000_000), UsageError);
  assert.throws(() => parseCostRange("-4-14"), UsageError);
  assert.throws(() => mergeContext(null, {}), UsageError);
  assert.throws(() => mergeContext(null, { records: "5" }), /--revenue-per-hour and --cost-per-record are needed too/);
});

test("cf guard lists decoys and their trips, scoped to a repository", async () => {
  guard = {
    decoys: [
      {
        id: "d1",
        findingId: full.id,
        findingFingerprint: "fp-sqli",
        d3fendId: "D3-DNR",
        d3fendName: "Decoy Network Resource",
        kind: "route",
        location: "route:/admin/backup",
        createdAt: "2026-10-12T00:00:00Z",
        retiredAt: null,
        trips: 1,
        lastTrippedAt: "2026-10-14T10:00:00Z",
      },
    ],
    events: [
      {
        id: "e1",
        kind: "decoy_tripped",
        decoyId: "d1",
        findingId: full.id,
        findingFingerprint: "fp-sqli",
        occurredAt: "2026-10-14T10:00:00Z",
        sourceIp: "203.0.113.7",
        detail: {},
      },
    ],
  };
  const result = await cf(["guard", "--repo", "acme/api"]);
  assert.equal(result.status, 0, result.stderr);
  const text = stripAnsi(result.stdout);
  assert.match(text, /Guard beta acme\/api/);
  assert.match(text, /1 decoy planted, 1 tripped/);
  assert.match(text, /decoy route +route:\/admin\/backup +D3-DNR/);
  assert.match(text, /203\.0\.113\.7 +decoy route route:\/admin\/backup +3b84f10c/);
  assert.ok(requests.some((request) => request.path === "/api/guard?repository=4242"));

  const agent = envelope((await cf(["guard", "--repo", "acme/api", "--agent"])).stdout);
  assert.equal(agent.data.beta, true);
  assert.equal(agent.data.repository, "acme/api");
  assert.deepEqual(agent.data.trips, [
    { id: "e1", kind: "decoy_tripped", at: "2026-10-14T10:00:00Z", from: "203.0.113.7", decoyId: "d1", findingId: full.id },
  ]);
  assert.deepEqual(agent.next, [`cf reproduced show ${full.id} --repo acme/api --agent`]);
});

test("cf guard without a repository reads the whole organization", async () => {
  const result = await cf(["guard", "--agent"]);
  assert.equal(result.status, 0, result.stdout);
  assert.ok(requests.some((request) => request.path === "/api/guard"));
  assert.deepEqual(envelope(result.stdout).data, { beta: true, organization: "acme" });
  const text = stripAnsi((await cf(["guard"])).stdout);
  assert.match(text, /No decoys are planted here yet\./);
  assert.match(text, /Nobody has touched a decoy\./);

  const missing = await cf(["guard", "--repo", "acme/nope", "--agent"]);
  assert.equal(missing.status, 2);
  assert.equal(envelope(missing.stdout).error?.code, "repository_not_found");
});
