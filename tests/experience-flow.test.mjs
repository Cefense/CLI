import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

async function viewSources() {
  const names = (await readdir(new URL("app/app/views/", root)))
    .filter((name) => name.endsWith(".tsx"))
    .sort();
  return Promise.all(names.map((name) => source(`app/app/views/${name}`)));
}

const personas = ["vc", "customer", "returning-user"];
const viewports = ["phone", "tablet", "laptop", "desktop"];
const entryPoints = [
  "/",
  "/product",
  "/threats",
  "/pricing",
  "/company",
  "/app",
  "/app?view=feed",
];
const navigationModes = ["forward", "browser-back"];

test("validates 168 persona, viewport, entry-point, and navigation combinations", async () => {
  const [home, shell, workspaceClient, workspaceConfig, workspaceCss] =
    await Promise.all([
      source("app/page.tsx"),
      source("app/components/site-shell.tsx"),
      source("app/app/workspace-client.tsx"),
      source("app/app/workspace-config.ts"),
      source("app/app/workstation.css"),
    ]);
  const workspace = [workspaceClient, ...(await viewSources()), workspaceConfig].join("\n");

  let scenarios = 0;
  for (const persona of personas) {
    for (const viewport of viewports) {
      for (const entry of entryPoints) {
        for (const navigation of navigationModes) {
          scenarios += 1;
          assert.match(home, /Real attacks become/);
          assert.match(home, /proven code fixes/);
          assert.doesNotMatch(home, /\$3|\$49/);
          assert.match(workspace, /label: "Feed"/);
          assert.match(workspace, /label: "Immunity"/);
          assert.match(workspace, /label: "Repositories"/);
          assert.doesNotMatch(shell, /label: "Pricing"/);
          assert.doesNotMatch(shell, /label: "Company"/);
          assert.match(workspace, /Feed/);
          assert.match(workspace, /AutoFix/);
          assert.match(workspace, /Reports/);
          assert.match(
            workspace,
            navigation === "browser-back" ? /popstate/ : /pushState/,
          );
          if (viewport === "phone")
            assert.match(workspaceCss, /max-width: 820px/);
          if (persona === "customer") assert.match(workspace, /Repositories/);
          if (persona === "returning-user")
            assert.match(workspace, /requestedView/);
          if (persona === "vc" && entry === "/")
            for (const stage of ["Observe", "Match", "Fix", "Prove"])
              assert.match(home, new RegExp(`"${stage}"`));
        }
      }
    }
  }

  assert.equal(scenarios, 168);
});

test("keeps the core product surface while removing redundant destinations", async () => {
  const workspace = [
    await source("app/app/workspace-client.tsx"),
    ...(await viewSources()),
    await source("app/app/workspace-config.ts"),
  ].join("\n");
  const primaryOrder = [
    "Feed",
    "Immunity",
    "Repositories",
  ].map((label) => workspace.indexOf(`label: \"${label}\"`));

  assert.ok(primaryOrder.every((index) => index >= 0));
  assert.deepEqual(
    primaryOrder,
    [...primaryOrder].sort((a, b) => a - b),
  );
  for (const surface of [
    "Repositories",
    "Containers",
    "Clouds",
    "Domains",
    "Pentests",
    "Code audit",
    "Integrations",
    "Immunity",
    "Security library",
  ]) {
    assert.match(workspace, new RegExp(surface));
  }
  assert.match(workspace, /<section\s+className="secondary-navigation"/);
  assert.doesNotMatch(workspace, /<span>More<\/span>/);
  assert.doesNotMatch(workspace, /Workspace overview|System status/);
  assert.doesNotMatch(workspace, /count: "\d+"/);
  assert.equal(
    (workspace.match(/className="product-topbar"/g) ?? []).length,
    1,
  );
  assert.doesNotMatch(workspace, /className="product-view-header"/);
});
