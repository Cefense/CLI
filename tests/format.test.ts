import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  absoluteDate,
  countOf,
  duration,
  pathFloor,
  plural,
  progressBar,
  relativeTime,
  shortenPath,
  stripAnsi,
  truncate,
  truncateStart,
  visibleLength,
  wrapText,
} from "../src/ui/format.js";
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

test("truncate ends with a single ellipsis character and keeps the start", () => {
  assert.equal(truncate("JWT signature verification disabled", 12), "JWT signatu\u2026");
  assert.equal(truncate("abc", 1), "\u2026");
  assert.equal(truncate("abc", 0), "");
});

test("truncate drops the space before the ellipsis rather than ending on one", () => {
  assert.equal(truncate("SQL injection in search", 15), "SQL injection\u2026");
});

test("truncate keeps colour codes and closes them", () => {
  const ESC = String.fromCharCode(27);
  const styled = `${ESC}[31ma finding title that is far too long${ESC}[39m`;
  const clipped = truncate(styled, 10);
  assert.equal(visibleLength(clipped), 10);
  assert.equal(stripAnsi(clipped), "a finding\u2026");
  assert.ok(clipped.startsWith(`${ESC}[31m`));
  assert.ok(clipped.endsWith(`\u2026${ESC}[0m`));
});

test("truncateStart keeps the end of the value", () => {
  assert.equal(truncateStart("app/requirements.txt", 10), "\u2026ments.txt");
  assert.equal(visibleLength(truncateStart("app/requirements.txt", 10)), 10);
  assert.equal(truncateStart("short", 10), "short");
});

test("shortenPath drops leading directories and keeps the filename", () => {
  assert.equal(shortenPath("app/app.py:96", 40), "app/app.py:96");
  assert.equal(shortenPath("site/app/api/admin/ml-stats/route.ts", 20), "\u2026/ml-stats/route.ts");
  assert.equal(shortenPath("site/app/api/admin/ml-stats/route.ts", 12), "\u2026/route.ts");
  assert.equal(shortenPath(".github/workflows/zap_test.yml:47", 18), "\u2026/zap_test.yml:47");
});

test("shortenPath falls back to the tail when even the filename is too long", () => {
  const shortened = shortenPath("src/a-really-long-generated-file-name.ts", 12);
  assert.equal(visibleLength(shortened), 12);
  assert.ok(shortened.endsWith("name.ts"));
});

test("pathFloor protects the longest filename up to a cap", () => {
  assert.equal(pathFloor(["app/app.py:96", "app/requirements.txt"], 25), 18);
  assert.equal(pathFloor(["a/check-active-status-of-everything.js"], 20), 20);
  assert.equal(pathFloor(["a/b.py"], 25), 12);
});

test("relativeTime is compact and floors rather than rounding up", () => {
  const now = Date.parse("2026-10-06T12:00:00Z");
  assert.equal(relativeTime("2026-10-06T11:59:58Z", now), "just now");
  assert.equal(relativeTime("2026-10-06T11:55:00Z", now), "5m ago");
  assert.equal(relativeTime("2026-10-06T02:30:00Z", now), "9h ago");
  assert.equal(relativeTime("2026-10-02T09:56:37Z", now), "4d ago");
  assert.equal(relativeTime("2026-10-04T00:00:01Z", now), "2d ago");
  assert.equal(relativeTime("2026-06-01T00:00:00Z", now), "4mo ago");
  assert.equal(relativeTime("2021-05-11T00:00:00Z", now), "5y ago");
  assert.equal(relativeTime("2026-10-09T12:00:00Z", now), "in 3d");
  assert.equal(relativeTime(null, now), "never");
  assert.equal(relativeTime("not a date", now), "never");
});

test("absoluteDate reads the same in every locale", () => {
  assert.match(absoluteDate("2026-09-14T12:00:00Z"), /^1[45] Sep 2026$/);
  assert.equal(absoluteDate(null), "never");
});

test("duration reads like a person would say it", () => {
  assert.equal(duration(4_000), "4s");
  assert.equal(duration(75_000), "1m 15s");
  assert.equal(duration(120_000), "2m");
  assert.equal(duration(3_840_000), "1h 4m");
});

test("plural and countOf handle the nouns the CLI uses", () => {
  assert.equal(plural(1, "repository"), "repository");
  assert.equal(plural(2, "repository"), "repositories");
  assert.equal(plural(2, "fix"), "fixes");
  assert.equal(plural(0, "finding"), "findings");
  assert.equal(countOf(9052, "finding"), "9,052 findings");
  assert.equal(countOf(1, "scan"), "1 scan");
});
