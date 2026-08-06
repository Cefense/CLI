import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const personas = JSON.parse(
  await readFile(new URL("personas.json", import.meta.url), "utf8"),
);
const [
  workspaceClient,
  workspaceConfig,
  workspacePage,
  workspaceCss,
  home,
  product,
  pricing,
  company,
  threats,
] = await Promise.all([
  readFile(new URL("app/app/workspace-client.tsx", root), "utf8"),
  readFile(new URL("app/app/workspace-config.ts", root), "utf8"),
  readFile(new URL("app/app/page.tsx", root), "utf8"),
  readFile(new URL("app/app/workstation.css", root), "utf8"),
  readFile(new URL("app/page.tsx", root), "utf8"),
  readFile(new URL("app/product/page.tsx", root), "utf8"),
  readFile(new URL("app/pricing/page.tsx", root), "utf8"),
  readFile(new URL("app/company/page.tsx", root), "utf8"),
  readFile(new URL("app/threats/page.tsx", root), "utf8"),
]);
const workspaceViews = await Promise.all(
  (await readdir(new URL("app/app/views/", root)))
    .filter((name) => name.endsWith(".tsx"))
    .sort()
    .map((name) => readFile(new URL(`app/app/views/${name}`, root), "utf8")),
);
const workspace = [workspaceClient, ...workspaceViews, workspaceConfig].join(
  "\n",
);

const sources = { home, product, pricing, company, threats };
const transitions = {
  home: new Set(["product", "pricing", "company", "threats", "signin"]),
  product: new Set(["home", "signin"]),
  pricing: new Set(["home", "signin"]),
  company: new Set(["home", "signin"]),
  threats: new Set(["home", "signin"]),
  signin: new Set([
    "connect",
    "feed",
    "autofix",
    "repositories",
    "clouds",
    "integrations",
    "pentests",
    "reports",
  ]),
  connect: new Set(["repositories", "feed"]),
  repositories: new Set(["feed", "repositories"]),
  clouds: new Set(["feed"]),
  integrations: new Set(["feed"]),
  pentests: new Set(["feed"]),
  feed: new Set(["feed", "autofix", "reports"]),
  autofix: new Set(["feed", "reports", "autofix"]),
  reports: new Set(["feed", "reports"]),
};

function assertJourney(persona) {
  assert.ok(persona.context.length > 35, "context must be detailed");
  assert.ok(persona.behavior.length > 30, "behavior must be detailed");
  assert.ok(persona.friction.length > 30, "friction must be documented");
  assert.ok(persona.lesson.length > 30, "lesson must be actionable");
  assert.ok(persona.result.length > 25, "result must describe the outcome");
  assert.ok(persona.journey.length >= 2 && persona.journey.length <= 6);

  for (let index = 0; index < persona.journey.length - 1; index += 1) {
    const from = persona.journey[index];
    const to = persona.journey[index + 1];
    assert.ok(
      transitions[from]?.has(to),
      `${from} must lead directly to ${to}`,
    );
  }

  for (const entry of persona.journey.filter((step) => sources[step])) {
    assert.ok(sources[entry].length > 0, `${entry} must be implemented`);
  }

  assert.match(workspace, /label: "Feed"/);
  assert.match(workspace, /label: "Repositories"/);
  assert.match(workspace, /label: "Immunity"/);
  assert.doesNotMatch(workspace, /label: "Workspace overview"/);
  assert.doesNotMatch(workspace, /label: "System status"/);
  assert.doesNotMatch(workspace, /count: "\d+"/);

  if (persona.journey.includes("autofix")) {
    assert.match(workspace, /onPrepare/);
    assert.match(workspace, /selectView\("autofix"\)/);
    assert.match(workspace, /repair-workbench/);
    assert.doesNotMatch(workspace, /Exploit path closed/);
  }
  if (persona.journey.includes("reports")) {
    assert.match(workspace, /selectView\("reports"\)/);
    assert.match(workspace, /Immunity/);
  }
  if (persona.device === "Phone") {
    assert.match(workspaceCss, /max-width: 820px/);
    assert.match(workspaceCss, /overflow: auto/);
  }
  if (/keyboard/i.test(persona.role + persona.behavior)) {
    assert.match(workspace, /event\.key === "j"/);
    assert.match(workspace, /event\.key === "k"/);
    assert.match(workspace, /event\.key === "Enter"/);
  }
  if (/screen.reader|assistive/i.test(persona.role + persona.context)) {
    assert.match(workspace, /aria-live="polite"/);
    assert.match(workspace, /role="status"/);
  }
  if (/scan|bandwidth|blocking|loader/i.test(persona.goal + persona.friction)) {
    const scanFunction =
      workspace.match(/async function scanRepository\(\)[\s\S]*?\n  }/)?.[0] ??
      "";
    assert.match(scanFunction, /Scan started\. You can keep working\./);
    assert.match(scanFunction, /Scan complete\./);
    assert.doesNotMatch(scanFunction, /selectView\("feed"\)/);
    assert.match(workspacePage, /export default async function WorkspacePage/);
    assert.match(workspacePage, /requireChatGPTUser\(returnTo\)/);
    assert.doesNotMatch(workspacePage, /<Suspense fallback=\{null\}>/);
  }
  if (
    /motion|animation|completion|feedback/i.test(
      persona.friction + persona.lesson,
    )
  ) {
    assert.match(workspaceCss, /workspace-feedback[\s\S]*140ms/);
    assert.match(workspace, /workspace-feedback/);
  }
}

assert.equal(personas.length, 40);

for (const persona of personas) {
  test(`persona ${String(persona.id).padStart(2, "0")} — ${persona.role}`, () => {
    assertJourney(persona);
  });
}
