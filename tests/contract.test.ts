import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { AUDIT_CATEGORIES } from "../src/commands/audit.js";
import {
  BILLING_INTERVALS,
  BILLING_PLANS,
  BILLING_STATUSES,
  PAID_BILLING_PLANS,
} from "../src/commands/plan.js";
import {
  NOTIFICATION_CADENCES,
  NOTIFICATION_KINDS,
  NOTIFICATION_SEVERITIES,
} from "../src/commands/notifications.js";
import { CHECKS, SCAN_DEPTHS, SCAN_INTERVALS, SCAN_MODES } from "../src/commands/settings.js";
import { ORGANIZATION_ROLES } from "../src/core/organizations.js";
import { verdictLabel } from "../src/core/compact.js";

/**
 * The CLI is published standalone and cannot import @cefense/schemas, so every
 * enum it knows is a hand-typed copy of one the product already owns. That is
 * how `pentest` survived in the CLI after the product dropped it, how the
 * `proof` audit category never arrived, and how a `cancelled` scan went
 * unrecognised for the full ten minute wait.
 *
 * When the CLI is checked out inside the monorepo, these tests read the real
 * definitions off disk and fail on divergence. In a standalone checkout there
 * is nothing to compare against and they skip, which is the correct behaviour
 * rather than a false pass: the drift is only detectable where both halves
 * exist.
 */
/** The CLI's own src, found by walking up out of .test-build at runtime. */
function cliSource(...parts: string[]): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(join(dir, "src", "core", "types.ts"))) return join(dir, "src", ...parts);
    dir = dirname(dir);
  }
  throw new Error("could not locate the CLI source tree");
}

function monorepo(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 6; depth += 1) {
    dir = dirname(dir);
    if (existsSync(join(dir, "packages", "schemas", "src", "workspace.ts"))) return dir;
  }
  return null;
}

const ROOT = monorepo();
const skip = ROOT ? false : "not inside the Cefense monorepo, nothing to compare against";

function workspaceSchema(): string {
  return readFileSync(join(ROOT!, "packages", "schemas", "src", "workspace.ts"), "utf8");
}

function controlSchema(): string {
  return readFileSync(join(ROOT!, "packages", "database", "src", "schema", "control.ts"), "utf8");
}

function notificationSchema(): string {
  return readFileSync(join(ROOT!, "packages", "schemas", "src", "notifications.ts"), "utf8");
}

function billingSchema(): string {
  return readFileSync(join(ROOT!, "packages", "schemas", "src", "billing.ts"), "utf8");
}

/** Values from a `export const NAME = [ "a", "b" ] as const` block. */
function constArray(source: string, name: string): string[] {
  const match = source.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\]`));
  if (!match) throw new Error(`${name} not found in the shared schema`);
  return [...match[1]!.matchAll(/"([a-z_-]+)"/g)].map((entry) => entry[1]!);
}

/** Values from a Postgres `in ('a', 'b')` CHECK constraint. */
function checkConstraint(source: string, column: string): string[] {
  const match = source.match(new RegExp(`\\$\\{table\\.${column}\\} in \\(([^)]*)\\)`));
  if (!match) throw new Error(`no CHECK constraint found for ${column}`);
  return [...match[1]!.matchAll(/'([a-z-]+)'/g)].map((entry) => entry[1]!);
}

test("coverage checks match the product's shared vocabulary", { skip }, () => {
  const schema = workspaceSchema();
  const available = constArray(schema, "COVERAGE_CHECKS");
  const unavailable = constArray(schema, "UNAVAILABLE_COVERAGE_CHECKS");

  assert.deepEqual(
    CHECKS.filter((check) => check.available).map((check) => check.id).sort(),
    [...available].sort(),
    "CLI available checks differ from COVERAGE_CHECKS",
  );
  assert.deepEqual(
    CHECKS.filter((check) => !check.available).map((check) => check.id).sort(),
    [...unavailable].sort(),
    "CLI unavailable checks differ from UNAVAILABLE_COVERAGE_CHECKS",
  );
});

test("scan modes match the database constraint", { skip }, () => {
  assert.deepEqual(
    SCAN_MODES.map((mode) => mode.id).sort(),
    checkConstraint(controlSchema(), "scanMode").sort(),
  );
});

test("scan intervals match the database constraint", { skip }, () => {
  const allowed = [
    ...checkConstraint(controlSchema(), "scanInterval"),
    // The constraint values are digit-prefixed, which the letter-only matcher
    // above cannot see, so read them with their own pattern.
  ];
  const source = controlSchema();
  const match = source.match(/\$\{table\.scanInterval\} in \(([^)]*)\)/);
  const real = [...match![1]!.matchAll(/'([0-9]+h)'/g)].map((entry) => entry[1]!);
  void allowed;
  assert.deepEqual(SCAN_INTERVALS.map((entry) => entry.id).sort(), real.sort());
});

test("scan depths match the database constraint", { skip }, () => {
  assert.deepEqual(
    SCAN_DEPTHS.map((depth) => depth.id).sort(),
    checkConstraint(controlSchema(), "scanDepth").sort(),
  );
});

test("organization roles match the database constraint", { skip }, () => {
  const source = controlSchema();
  // Two tables have a role column, and users_role_check comes first in the
  // file, so the search starts at the constraint this is actually about.
  const at = source.indexOf("organization_members_role_check");
  assert.ok(at > 0, "organization_members_role_check moved, update this test");
  assert.deepEqual(
    [...ORGANIZATION_ROLES].sort(),
    checkConstraint(source.slice(at), "role").sort(),
  );
});

test("billing plans match the product's shared vocabulary", { skip }, () => {
  const schema = billingSchema();
  assert.deepEqual([...BILLING_PLANS], constArray(schema, "BILLING_PLANS"));
  assert.deepEqual([...PAID_BILLING_PLANS], constArray(schema, "PAID_BILLING_PLANS"));
});

test("billing intervals match the product's shared vocabulary", { skip }, () => {
  assert.deepEqual([...BILLING_INTERVALS], constArray(billingSchema(), "BILLING_INTERVALS"));
});

test("billing statuses cover every status the product models", { skip }, () => {
  const real = constArray(billingSchema(), "BILLING_STATUSES");
  assert.ok(real.length > 1, "BILLING_STATUSES moved, so this test is asserting nothing");
  const missing = real.filter((status) => !BILLING_STATUSES.includes(status as never));
  assert.deepEqual(missing, [], "the product models billing statuses the CLI does not");
});

test("audit categories match the backend's own type", { skip }, () => {
  const source = readFileSync(join(ROOT!, "apps", "backend", "src", "db", "audit.ts"), "utf8");
  const match = source.match(/export type AuditCategory =([\s\S]*?);/);
  const real = [...match![1]!.matchAll(/"([a-z]+)"/g)].map((entry) => entry[1]!);
  assert.deepEqual([...AUDIT_CATEGORIES].sort(), real.sort());
});

test("fix statuses cover every state the database allows", { skip }, () => {
  // Anchored on 'generating' because several tables have a status column and
  // the fix one is not the first in the file.
  const constraint = controlSchema().match(/\$\{table\.status\} in \('generating'[^)]*\)/);
  assert.ok(constraint, "the fix status CHECK constraint moved, update this test");
  const allowed = [...constraint[0].matchAll(/'([a-z]+)'/g)].map((entry) => entry[1]!);
  const source = readFileSync(cliSource("core", "types.ts"), "utf8");
  const declared = source.match(/status:\s*("(?:generating)[^;]*);/);
  assert.ok(declared, "the Fix status union moved, update this test");
  const known = [...declared[1]!.matchAll(/"([a-z]+)"/g)].map((entry) => entry[1]!);
  const missing = allowed.filter((status) => !known.includes(status));
  assert.deepEqual(missing, [], "the database can store fix statuses the CLI does not model");
});

/** Values from a named `check("name", sql`... in ('a','b')`)` constraint. */
function namedCheckConstraint(source: string, name: string): string[] {
  const match = source.match(new RegExp(`"${name}"[\\s\\S]{0,200}?in \\(([^)]*)\\)`));
  if (!match) throw new Error(`no CHECK constraint found named ${name}`);
  return [...match[1]!.matchAll(/'([a-z-]+)'/g)].map((entry) => entry[1]!);
}

/** A `export type Name = "a" | "b";` union in the CLI's own types. */
function typeUnion(name: string): string[] {
  const source = readFileSync(cliSource("core", "types.ts"), "utf8");
  const declared = source.match(new RegExp(`export type ${name} =([^;]*);`));
  assert.ok(declared, `the ${name} union moved, update this test`);
  return [...declared[1]!.matchAll(/"([a-z-]+)"/g)].map((entry) => entry[1]!);
}

/**
 * The CLI spells a verdict for a person, and so does the workspace's proof
 * strip. A user reading the dashboard and an agent reading the CLI have to be
 * given the same word, and "Nothing to prove" for `unprovable` is exactly the
 * kind of label that gets reworded in one place only.
 */
test("proof verdict labels match the workspace's", { skip }, () => {
  const source = readFileSync(
    join(ROOT!, "apps", "cefense-ui", "src", "app", "app", "views", "fix-view.tsx"),
    "utf8",
  );
  const table = source.match(/STRIP_VERDICTS[^=]*=\s*\{([\s\S]*?)\n\};/);
  assert.ok(table, "STRIP_VERDICTS moved, update this test");
  const pairs = [...table[1]!.matchAll(/(\w+):\s*\{\s*label:\s*"([^"]+)"/g)];
  assert.ok(pairs.length >= 5, "the workspace verdict table shrank, update this test");
  for (const [, verdict, label] of pairs) {
    assert.equal(verdictLabel(verdict!), label, `the CLI and the workspace disagree on ${verdict}`);
  }
});

test("proof kinds match the database constraint", { skip }, () => {
  assert.deepEqual(
    typeUnion("ProofKind").sort(),
    namedCheckConstraint(controlSchema(), "finding_proofs_kind_check").sort(),
  );
});

test("proof statuses match the database constraint", { skip }, () => {
  assert.deepEqual(
    typeUnion("ProofStatus").sort(),
    namedCheckConstraint(controlSchema(), "finding_proofs_status_check").sort(),
  );
});

test("proof verdicts match the database constraint", { skip }, () => {
  assert.deepEqual(
    typeUnion("ProofVerdict").sort(),
    namedCheckConstraint(controlSchema(), "finding_proofs_verdict_check").sort(),
  );
});

test("scan statuses cover every state the database allows", { skip }, () => {
  const source = controlSchema();
  const match = source.match(/\$\{table\.status\} in \('queued'[^)]*\)/);
  const allowed = [...match![0].matchAll(/'([a-z]+)'/g)].map((entry) => entry[1]!);
  const types = readFileSync(cliSource("core", "types.ts"), "utf8");
  const declared = types.match(/export type ScanStatus =([^;]*);/);
  const known = [...declared![1]!.matchAll(/"([a-z]+)"/g)].map((entry) => entry[1]!);
  const missing = allowed.filter((status) => !known.includes(status));
  assert.deepEqual(missing, [], "the database can store scan statuses the CLI does not model");
});

test("notification kinds match the product's shared vocabulary", { skip }, () => {
  assert.deepEqual(
    [...NOTIFICATION_KINDS],
    constArray(notificationSchema(), "NOTIFICATION_KINDS"),
    "the CLI knows a different set of notifications than the product sends",
  );
});

test("notification kinds match the database constraint", { skip }, () => {
  // Several tables carry a `kind` column, so the search starts at the named
  // constraint rather than at the first match in the file.
  const source = controlSchema();
  const at = source.indexOf("notification_preferences_kind_check");
  assert.ok(at > 0, "notification_preferences_kind_check moved, update this test");
  const constraint = source.slice(at).match(/\$\{table\.kind\} in \(([^)]*)\)/);
  assert.ok(constraint, "the notification kind CHECK constraint moved, update this test");
  const allowed = [...constraint[1]!.matchAll(/'([a-z_]+)'/g)].map((entry) => entry[1]!);
  assert.deepEqual(
    [...NOTIFICATION_KINDS].sort(),
    allowed.sort(),
    "the database can store notification kinds the CLI does not model",
  );
});

test("notification cadences match the product's shared vocabulary", { skip }, () => {
  assert.deepEqual(
    [...NOTIFICATION_CADENCES],
    constArray(notificationSchema(), "NOTIFICATION_CADENCES"),
  );
});

test("the notification severity floor uses the product's display severities", { skip }, () => {
  assert.deepEqual(
    [...NOTIFICATION_SEVERITIES],
    constArray(workspaceSchema(), "DISPLAY_SEVERITIES"),
    "the severity floor the CLI offers is not the set the product grades findings on",
  );
});
