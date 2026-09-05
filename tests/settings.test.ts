import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  CHECK_PRESETS,
  parseChecks,
  parseScanInterval,
  parseScanMode,
} from "../src/commands/settings.js";
import { UsageError } from "../src/core/errors.js";

test("parseScanMode accepts the modes the scanner can honour", () => {
  assert.equal(parseScanMode("manual"), "manual");
  assert.equal(parseScanMode(" PUSH "), "push");
  assert.equal(parseScanMode("scheduled"), "scheduled");
});

test("parseScanMode refuses a mode with no trigger behind it", () => {
  assert.throws(() => parseScanMode("pull-request"), UsageError);
  assert.throws(() => parseScanMode("nightly"), UsageError);
});

test("parseScanInterval takes only the intervals the column allows", () => {
  for (const interval of ["1h", "6h", "12h", "24h", "168h"]) {
    assert.equal(parseScanInterval(interval), interval);
  }
  assert.throws(() => parseScanInterval("3h"), UsageError);
});

test("parseChecks expands presets, splits lists, and drops duplicates", () => {
  assert.deepEqual(parseChecks(["balanced"]), CHECK_PRESETS.balanced);
  assert.deepEqual(parseChecks(["sast,sca", "sast"]), ["sast", "sca"]);
});

test("parseChecks rejects checks a repository scan cannot run", () => {
  assert.throws(() => parseChecks(["runtime"]), UsageError);
  assert.throws(() => parseChecks(["pentest"]), UsageError);
  assert.throws(() => parseChecks(["fuzzing"]), UsageError);
});
