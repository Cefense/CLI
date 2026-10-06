import { strict as assert } from "node:assert";
import { test } from "node:test";
import { stripAnsi, visibleLength } from "../src/ui/format.js";
import { fitWidths, renderTable, type Column } from "../src/ui/table.js";
import { hintLine, sectionLine, summaryLine } from "../src/ui/list.js";
import { badge, scanStatusLabel, stateWord } from "../src/ui/theme.js";
import { fixLabel, statusLabel } from "../src/commands/fixactions.js";
import { statusFor } from "../src/core/findingStatus.js";
import type { Fix } from "../src/core/types.js";

interface Row {
  id: string;
  title: string;
  location: string;
  status: string;
}

const rows: Row[] = [
  {
    id: "1885c309",
    title: "JWT signature verification disabled in insecure_verify()",
    location: "app/app.py:96",
    status: "patch ready",
  },
  {
    id: "13f27680",
    title: "PyYAML@3.12: CVE-2017-18342",
    location: "app/requirements.txt",
    status: "",
  },
  {
    id: "f7f33eb0",
    title: "GitHub Actions pinned to mutable tags instead of commit SHAs",
    location: "old-workflows/nested/deeper/semgrep.yml:10",
    status: "",
  },
];

const columns: Column<Row>[] = [
  { header: "id", value: (row) => row.id, overflow: "never" },
  { header: "title", value: (row) => row.title, flex: true, min: 16 },
  { header: "location", value: (row) => row.location, min: 18, max: 40, overflow: "path" },
  { header: "status", value: (row) => row.status, overflow: "never" },
];

function cellsOf(line: string): string[] {
  return stripAnsi(line).split(/\s{2,}/);
}

test("renderTable never truncates an id or a status", () => {
  for (const width of [60, 80, 100, 140]) {
    const lines = renderTable(rows, columns, { width, header: false });
    for (const line of lines) assert.ok(visibleLength(line) <= width, `width ${width}: ${line}`);
    assert.equal(cellsOf(lines[0]!)[0], "1885c309");
    assert.ok(stripAnsi(lines[0]!).trimEnd().endsWith("patch ready"), lines[0]);
  }
});

test("renderTable shortens paths from the left and keeps the filename", () => {
  const lines = renderTable(rows, columns, { width: 80, header: false });
  const location = cellsOf(lines[2]!)[2]!;
  assert.ok(location.startsWith("\u2026/"), location);
  assert.ok(location.endsWith("semgrep.yml:10"), location);
});

test("renderTable gives the title whatever the other columns leave", () => {
  const wide = renderTable(rows, columns, { width: 140, header: false });
  assert.ok(stripAnsi(wide[0]!).includes("JWT signature verification disabled in insecure_verify()"));
  const narrow = renderTable(rows, columns, { width: 80, header: false });
  const title = cellsOf(narrow[0]!)[1]!;
  assert.ok(title.endsWith("\u2026"), title);
  assert.ok(title.length >= 16, title);
});

test("renderTable drops a column that has nothing to show", () => {
  const empty = rows.map((row) => ({ ...row, status: "" }));
  const lines = renderTable(empty, columns, { width: 120, header: false });
  for (const line of lines) assert.equal(cellsOf(line).length, 3, line);
});

test("renderTable headers carry no trailing padding", () => {
  const [header] = renderTable(rows, columns, { width: 120 });
  assert.equal(stripAnsi(header!), stripAnsi(header!).trimEnd());
  assert.ok(stripAnsi(header!).startsWith("ID"));
});

test("fitWidths shrinks path columns before the flexible one and fixed columns last", () => {
  const widths = fitWidths(
    [
      { natural: 8, min: 8, flex: false, overflow: "never" },
      { natural: 60, min: 16, flex: true, overflow: "end" },
      { natural: 40, min: 18, flex: false, overflow: "path" },
      { natural: 12, min: 12, flex: false, overflow: "never" },
    ],
    96,
  );
  assert.deepEqual(widths, [8, 58, 18, 12]);
  const tight = fitWidths(
    [
      { natural: 8, min: 8, flex: false, overflow: "never" },
      { natural: 60, min: 16, flex: true, overflow: "end" },
      { natural: 12, min: 12, flex: false, overflow: "never" },
    ],
    30,
  );
  assert.equal(tight.reduce((sum, value) => sum + value, 0), 30);
});

test("hint lines read as one sentence that ends with the command", () => {
  const hint = stripAnsi(hintLine({ command: "cf reproduced show 1885c309", purpose: "read a finding in full" })!);
  assert.equal(hint, "To read a finding in full, run cf reproduced show 1885c309");
  assert.equal(hintLine(undefined), null);
});

test("summary and section lines count with thousands separators", () => {
  assert.equal(summaryLine(179, 1179, "finding", "we45/app"), "Showing 179 of 1,179 findings in we45/app");
  assert.equal(summaryLine(1, 1, "repository", "cefense.com"), "Showing 1 of 1 repository in cefense.com");
  assert.equal(stripAnsi(sectionLine("Critical", 12)), "Critical  12");
  assert.equal(stripAnsi(sectionLine("Needs attention")), "Needs attention");
});

test("every status uses the same glyph for the same meaning", () => {
  assert.equal(stripAnsi(scanStatusLabel("completed")), "\u2713 ready");
  assert.equal(stripAnsi(scanStatusLabel("failed")), "\u2717 failed");
  assert.equal(stripAnsi(scanStatusLabel("running")), "\u25B0 scanning");
  assert.equal(stripAnsi(scanStatusLabel("queued")), "\u25CB queued");
  assert.equal(stripAnsi(scanStatusLabel("cancelled")), "! cancelled");
  assert.equal(stripAnsi(scanStatusLabel(null)), "\u00B7 never");

  const fix = (status: Fix["status"], prNumber: number | null = null) => ({ status, prNumber }) as Fix;
  assert.equal(stripAnsi(fixLabel(null)), "\u00B7 no patch yet");
  assert.equal(stripAnsi(fixLabel(fix("ready"))), "\u25CB patch ready");
  assert.equal(stripAnsi(fixLabel(fix("opened", 12))), "\u25CB PR #12 open");
  assert.equal(stripAnsi(fixLabel(fix("merged", 12))), "\u2713 PR #12 merged");
  assert.equal(stripAnsi(fixLabel(fix("failed"))), "\u2717 patch failed");
  assert.equal(stripAnsi(fixLabel(fix("closed", 4))), "! PR #4 closed");

  assert.equal(stripAnsi(statusLabel(statusFor({ fix: { status: "ready", prNumber: null }, proof: null }))), "\u25CB patch ready");
  assert.equal(stripAnsi(statusLabel(statusFor({ fix: { status: "failed", prNumber: null }, proof: null }))), "! needs review");
  assert.equal(
    stripAnsi(statusLabel(statusFor({ fix: { status: "opened", prNumber: 3 }, proof: null }), 3)),
    "\u25CB PR #3 open",
  );
});

test("state words capitalise and leave the empty state unmarked", () => {
  assert.equal(stripAnsi(stateWord("none", "no patch yet")), "No patch yet");
  assert.equal(stripAnsi(stateWord("done", "ready")), "\u2713 Ready");
  assert.equal(stripAnsi(badge("attention", "partial")), "! partial");
});
