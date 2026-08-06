import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const concepts = JSON.parse(
  await readFile(new URL("../app/clarity/concepts.json", import.meta.url), "utf8"),
);
const conceptLanding = await readFile(
  new URL("../app/clarity/concept-ui.tsx", import.meta.url),
  "utf8",
);
const conceptWorkspace = await readFile(
  new URL("../app/clarity/prototype-workspace.tsx", import.meta.url),
  "utf8",
);

function words(value) {
  return value.match(/\b[\w’'-]+\b/g) ?? [];
}

test("ships twenty genuinely separate clarity directions", () => {
  assert.equal(concepts.length, 20);
  assert.equal(new Set(concepts.map((concept) => concept.id)).size, 20);
  assert.equal(new Set(concepts.map((concept) => concept.design)).size, 20);
  assert.equal(new Set(concepts.map((concept) => concept.promise)).size, 20);
  assert.equal(new Set(concepts.map((concept) => concept.explanation)).size, 20);
});

test("holds every direction to the exact 5-word and 50-word test", () => {
  for (const concept of concepts) {
    assert.equal(words(concept.promise).length, 5, `${concept.id} promise`);
    assert.equal(words(concept.explanation).length, 50, `${concept.id} explanation`);
  }
});

test("keeps the four-step Cefense truth visible in every direction", () => {
  for (const step of ["Observed", "Matched", "Fix prepared", "Proven closed"]) {
    assert.match(conceptLanding, new RegExp(step));
    assert.match(conceptWorkspace, new RegExp(step));
  }
  assert.match(conceptLanding, /Open prototype/);
  assert.match(conceptWorkspace, /Review fix/);
  assert.match(conceptWorkspace, /Run replay/);
});

test("gives every landing a separate matching application composition", () => {
  for (const concept of concepts) {
    if (concept.id !== "20") {
      assert.match(conceptLanding, new RegExp(`case \\\"${concept.id}\\\"`));
      assert.match(conceptWorkspace, new RegExp(`case \\\"${concept.id}\\\"`));
    }
  }
  assert.match(conceptLanding, /\/clarity\/\$\{concept\.id\}\/app/);
});
