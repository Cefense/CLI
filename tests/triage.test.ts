import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseTriageStatus } from "../src/commands/triage.js";
import { parseAuditCategories, parseBefore } from "../src/commands/audit.js";
import { UsageError } from "../src/core/errors.js";

test("parseTriageStatus accepts the wire values and the words people type", () => {
  assert.equal(parseTriageStatus("open"), "open");
  assert.equal(parseTriageStatus("false-positive"), "false_positive");
  assert.equal(parseTriageStatus("false_positive"), "false_positive");
  assert.equal(parseTriageStatus(" Dismiss "), "false_positive");
  assert.equal(parseTriageStatus("accepted-risk"), "accepted_risk");
  assert.equal(parseTriageStatus("accept"), "accepted_risk");
});

test("parseTriageStatus refuses a decision the route has no column for", () => {
  assert.throws(() => parseTriageStatus("wontfix"), UsageError);
  assert.throws(() => parseTriageStatus("fixed"), UsageError);
});

test("parseAuditCategories splits lists and drops duplicates", () => {
  assert.deepEqual(parseAuditCategories("scan,finding,scan"), ["scan", "finding"]);
  assert.deepEqual(parseAuditCategories(undefined), []);
  assert.throws(() => parseAuditCategories("everything"), UsageError);
});

test("parseBefore normalises a timestamp and rejects nonsense", () => {
  assert.equal(parseBefore("2026-09-01T00:00:00Z"), "2026-09-01T00:00:00.000Z");
  assert.equal(parseBefore(undefined), undefined);
  assert.throws(() => parseBefore("last tuesday"), UsageError);
});
