import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { AUDIT_CATEGORIES } from "../src/commands/audit.js";
import { CHECKS, SCAN_DEPTHS, SCAN_INTERVALS, SCAN_MODES } from "../src/commands/settings.js";
import { ORGANIZATION_ROLES } from "../src/core/organizations.js";

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

/** Values from a `export const NAME = [ "a", "b" ] as const` block. */
function constArray(source: string, name: string): string[] {
  const match = source.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\]`));
  if (!match) throw new Error(`${name} not found in the shared schema`);
  return [...match[1]!.matchAll(/"([a-z-]+)"/g)].map((entry) => entry[1]!);
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
