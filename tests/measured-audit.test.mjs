import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("keeps the 40-persona artifact measured and adversarial", async () => {
  const [report, measurements, personas] = await Promise.all([
    readFile(new URL("reports/CEFENSE-MEASURED-UX-AUDIT.md", root), "utf8"),
    readFile(new URL("reports/public-route-measurements.json", root), "utf8").then(JSON.parse),
    readFile(new URL("tests/personas.json", root), "utf8").then(JSON.parse),
  ]);

  const personaSection = report.split("## Detailed locked profiles")[0];
  const personaRows = personaSection.match(/^\| \d{2} /gm) ?? [];

  assert.equal(personas.length, 40);
  assert.equal(personaRows.length, 40);
  assert.equal(measurements.routes.length, 5);
  assert.ok(measurements.routes.every((route) => route.viewportControls <= 7));
  assert.ok(measurements.routes.every((route) => route.blackSurfaces === 0));
  assert.ok(measurements.routes.every((route) => route.horizontalOverflow === false));
  assert.equal(measurements.mobile.menuOpenControls, 7);
  assert.ok(measurements.mobile.routes.every((route) => route.horizontalOverflow === false));
  assert.ok(measurements.mobile.routes.every((route) => route.minTextPx >= 15));
  assert.match(report, /MEASURED: NO/);
  assert.match(report, /Human-moderated participants: \*\*NO\*\*/);
  assert.doesNotMatch(report, /40\/40.*pass|overall the app is strong/i);
});
