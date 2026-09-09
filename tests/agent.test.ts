import { strict as assert } from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  ERROR_CODES,
  PRECONDITION_CODES,
  WIRE_ERROR_CODES,
  errorCode,
  translateWireCode,
} from "../src/core/codes.js";
import { EXIT_API, EXIT_AUTH, EXIT_INTERRUPTED, EXIT_USAGE } from "../src/core/errors.js";

function sourceRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(dir, "src", "core", "codes.ts");
    try {
      statSync(candidate);
      return join(dir, "src");
    } catch {
      dir = dirname(dir);
    }
  }
  throw new Error("could not locate the CLI source tree from the test");
}

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(full));
    else if (entry.name.endsWith(".ts")) found.push(full);
  }
  return found;
}

/**
 * Every code thrown must be a code an agent has been told about.
 *
 * The catalogue is what `cf agent schema` publishes and what the agent
 * documentation is written from. A code added at a throw site without an entry
 * is a failure an agent has no branch for, which is exactly the case that
 * makes it fall back to parsing error.message.
 */
test("every error code thrown by the CLI is in the published catalogue", () => {
  const known = new Set(ERROR_CODES.map((entry) => entry.code));
  const thrown = new Map<string, string>();

  for (const file of sourceFiles(sourceRoot())) {
    if (file.endsWith(join("core", "codes.ts"))) continue;
    const source = readFileSync(file, "utf8");

    // Only codes handed to an error constructor count. A `code:` key in an
    // ordinary payload is a different vocabulary, and folding the two together
    // is what made this check fire on cf agent check's blockers.
    for (const match of source.matchAll(/new (?:CefenseError|UsageError)\(/g)) {
      const window = source.slice(match.index ?? 0, (match.index ?? 0) + 600);
      const keyed = window.match(/code:\s*"([a-z][a-z0-9_]+)"/);
      if (keyed) {
        thrown.set(keyed[1]!, file);
        continue;
      }
      const trailing = [...window.matchAll(/"([a-z][a-z0-9_]+)",?\n\s*\);/g)].at(0);
      if (trailing) thrown.set(trailing[1]!, file);
    }

    // agentError builds its fallback envelope by hand rather than throwing.
    for (const match of source.matchAll(/code:\s*"(internal_error|api_error)"/g)) {
      thrown.set(match[1]!, file);
    }
  }

  const missing = [...thrown.entries()].filter(([code]) => !known.has(code));
  assert.deepEqual(
    missing.map(([code, file]) => `${code} (${file})`),
    [],
    "add these to ERROR_CODES in src/core/codes.ts",
  );
});

test("catalogue entries carry a usable exit code and remedy", () => {
  const allowed = new Set([EXIT_USAGE, EXIT_AUTH, EXIT_API, EXIT_INTERRUPTED]);
  for (const entry of ERROR_CODES) {
    assert.ok(allowed.has(entry.exitCode), `${entry.code} has exit code ${entry.exitCode}`);
    assert.ok(entry.meaning.length > 10, `${entry.code} needs a meaning`);
    assert.ok(entry.remedy.length > 10, `${entry.code} needs a remedy`);
  }
});

test("codes are unique", () => {
  const codes = ERROR_CODES.map((entry) => entry.code);
  assert.equal(new Set(codes).size, codes.length);
});

test("every wire code translates to a catalogued code", () => {
  for (const [wire, mapped] of Object.entries(WIRE_ERROR_CODES)) {
    assert.ok(errorCode(mapped), `${wire} maps to ${mapped}, which is not catalogued`);
    assert.equal(translateWireCode(wire)?.code, mapped);
  }
  assert.equal(translateWireCode("something_else"), null);
  assert.equal(translateWireCode(undefined), null);
});

test("the codes the skill tells agents to branch on all exist", () => {
  const documented = [
    "auth_required",
    "usage_error",
    "confirmation_required",
    "finding_not_found",
    "finding_not_triageable",
    "branch_not_scanned",
    "fix_not_found",
    "fix_not_ready",
    "fix_not_published",
    "fix_in_progress",
    "pull_request_blocked",
    "pull_request_conflicted",
    "pull_request_draft",
    "pull_request_closed",
    "provider_not_connected",
    "provider_reconnect_required",
    "sbom_unavailable",
    "feature_required",
    "api_error",
  ];
  for (const code of documented) {
    assert.ok(errorCode(code), `${code} is documented but not catalogued`);
  }
});

test("agent check blockers are a published vocabulary", () => {
  const known = new Set(PRECONDITION_CODES.map((entry) => entry.code));
  const source = readFileSync(join(sourceRoot(), "commands", "agent.ts"), "utf8");
  const used = new Set(
    [...source.matchAll(/code:\s*"([a-z][a-z0-9_]+)",\n\s*what:/g)].map((match) => match[1]!),
  );
  assert.ok(used.size > 0, "the blocker scan found nothing, so it is not checking anything");
  for (const code of used) {
    assert.ok(known.has(code), `${code} is emitted as a blocker but not in PRECONDITION_CODES`);
  }
  for (const entry of PRECONDITION_CODES) {
    assert.ok(["agent", "user"].includes(entry.resolvedBy), `${entry.code} needs resolvedBy`);
    assert.ok(entry.remedy.length > 10, `${entry.code} needs a remedy`);
  }
});
