import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const screens = {
  Home: await readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  Feed: await readFile(
    new URL("../app/app/views/feed-view.tsx", import.meta.url),
    "utf8",
  ),
  AutoFix: await readFile(
    new URL("../app/app/views/fix-view.tsx", import.meta.url),
    "utf8",
  ),
  Evidence: await readFile(
    new URL("../app/app/views/reports-view.tsx", import.meta.url),
    "utf8",
  ),
};

const scoreFivePromise = {
  Home: "Real attacks become proven code fixes",
  Feed: "Observed attack → Matched to exact code",
  AutoFix: "Matched → Fix prepared",
  Evidence: "Path closed with evidence",
};

function normalize(value) {
  return value
    .replace(/<[^>]+>/g, " ")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim();
}

test("keeps the five-second Cefense promise explicit on every core screen", () => {
  for (const [screen, source] of Object.entries(screens)) {
    const promise = scoreFivePromise[screen];
    assert.ok(
      normalize(source).includes(normalize(promise)),
      `${screen} must visibly deliver the score-5 promise: ${promise}`,
    );
  }
});

test("keeps the core loop visible from attack through proof", () => {
  assert.match(screens.Home, /Observe\. Match\. Fix\. Prove\./);
  assert.match(screens.Feed, /Observed attack → Matched to exact code/);
  assert.match(screens.AutoFix, /Matched → Fix prepared/);
  assert.match(screens.AutoFix, /Proven closed/);
  assert.match(screens.Evidence, /Observed/);
  assert.match(screens.Evidence, /Matched/);
  assert.match(screens.Evidence, /Fix prepared/);
  assert.match(screens.Evidence, /Proven closed/);
});

test("uses one vocabulary for the four-step product spine", () => {
  const joined = Object.values(screens).join("\n");
  for (const step of ["Observed", "Matched", "Fix prepared", "Proven closed"]) {
    assert.match(joined, new RegExp(step), `${step} must stay visible in the product`);
  }
  assert.doesNotMatch(screens.Home, />Located</);
  assert.doesNotMatch(screens.Home, />Changed</);
  assert.doesNotMatch(screens.Evidence, />Changed</);
  assert.doesNotMatch(screens.Evidence, />Verified</);
});
