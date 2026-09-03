import { strict as assert } from "node:assert";
import { test } from "node:test";
import { progressBar, stripAnsi, truncate, visibleLength, wrapText } from "../src/ui/format.js";
import { renderTable } from "../src/ui/table.js";
import { displaySeverity, severityRank } from "../src/ui/theme.js";

const RED = String.fromCharCode(27) + "[31m";
const RESET = String.fromCharCode(27) + "[39m";

test("visibleLength ignores colour codes", () => {
  assert.equal(visibleLength(RED + "critical" + RESET), 8);
  assert.equal(stripAnsi(RED + "critical" + RESET), "critical");
});

test("truncate never exceeds the requested width", () => {
  for (const width of [1, 5, 12, 40]) {
    assert.ok(visibleLength(truncate("a repository name that is far too long", width)) <= width);
  }
  assert.equal(truncate("short", 40), "short");
});

test("renderTable fits inside the given width at every terminal size", () => {
  const rows = [
    { repo: "cefense/backend-infrastructure", status: "scanning", findings: "148" },
    { repo: "cefense/ui", status: "ready", findings: "3" },
  ];
  for (const width of [60, 80, 200]) {
    const lines = renderTable(
      rows,
      [
        { header: "repository", value: (row) => row.repo, min: 10 },
        { header: "status", value: (row) => row.status, min: 6 },
        { header: "findings", value: (row) => row.findings, align: "right", min: 3 },
      ],
      { width },
    );
    for (const line of lines) assert.ok(visibleLength(line) <= width, `width ${width}: ${line}`);
  }
});

test("severity mapping matches the workspace vocabulary", () => {
  assert.equal(displaySeverity("critical"), "Critical");
  assert.equal(displaySeverity("high"), "High");
  assert.equal(displaySeverity("medium"), "Watch");
  assert.equal(displaySeverity("low"), "Info");
  assert.equal(displaySeverity("informational"), "Info");
  assert.ok(severityRank("critical") < severityRank("high"));
  assert.ok(severityRank("high") < severityRank("medium"));
  assert.ok(severityRank("medium") < severityRank("low"));
});

test("progressBar stays within its width and clamps out-of-range input", () => {
  assert.equal(progressBar(0, 10, 10).length, 10);
  assert.equal(progressBar(10, 10, 10).length, 10);
  assert.equal(progressBar(50, 10, 10).length, 10);
  assert.equal(progressBar(5, 0, 10), "");
});

test("wrapText respects the width and keeps every word", () => {
  const source = "user controlled archive filenames reach a shell invocation without quoting";
  const lines = wrapText(source, 24);
  for (const line of lines) assert.ok(line.length <= 24, line);
  assert.equal(lines.join(" ").split(/\s+/).length, source.split(/\s+/).length);
});
