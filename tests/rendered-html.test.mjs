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

test("keeps the public homepage focused and moves detail to dedicated routes", async () => {
  const [page, layout, product, threats, pricing, company] = await Promise.all([
    source("app/page.tsx"),
    source("app/layout.tsx"),
    source("app/product/page.tsx"),
    source("app/threats/page.tsx"),
    source("app/pricing/page.tsx"),
    source("app/company/page.tsx"),
  ]);

  assert.match(page, /Real attacks become/);
  assert.match(page, /proven code fixes/);
  assert.doesNotMatch(page, /254/);
  assert.doesNotMatch(page, /\$3|\$49|Simple pricing|Live threat desk/);
  assert.doesNotMatch(page, /requireChatGPTUser|getChatGPTUser/);
  assert.match(product, /Observed/);
  assert.match(product, /Match/);
  assert.match(product, /Fix/);
  assert.match(product, /Prove/);
  assert.match(product, /One control point/);
  assert.match(threats, /Every closed path/);
  assert.match(pricing, /\$3|\$49/);
  assert.match(company, /Operational/);
  assert.doesNotMatch(company, /investor-deck|investor brief/i);
  assert.match(layout, /Cefense — The internet learns an attack once/);
  assert.match(layout, /og-v4\.png/);
});

test("protects the workspace and persists real repository scan results", async () => {
  const [
    workspace,
    clientSource,
    config,
    profileRoute,
    scanRoute,
    storage,
    hosting,
  ] = await Promise.all([
    source("app/app/page.tsx"),
    source("app/app/workspace-client.tsx"),
    source("app/app/workspace-config.ts"),
    source("app/api/profile/route.ts"),
    source("app/api/repository/scan/route.ts"),
    source("db/cyberus.ts"),
    source(".openai/hosting.json"),
  ]);
  const views = await viewSources();
  const client = [clientSource, ...views, config].join("\n");

  assert.match(workspace, /requireChatGPTUser/);
  assert.match(workspace, /getCyberusProfile/);
  assert.match(client, /fetch\("\/api\/profile"/);
  assert.doesNotMatch(client, /Reachable paths first\./);
  assert.doesNotMatch(client, /Observed on the network/);
  assert.match(client, /Repositories/);
  assert.match(client, /Containers/);
  assert.match(client, /Pentests/);
  assert.match(client, /Integrations/);
  assert.doesNotMatch(client, /Workspace overview|System status/);
  assert.doesNotMatch(client, /All systems normal|className="sidebar-health"/);
  assert.doesNotMatch(client, /All repos|Assigned to me|net lines/);
  assert.match(client, /repair-tab-strip/);
  assert.match(client, /Open demo workspace/);
  assert.match(client, /Restore dismissed findings/);
  assert.match(client, /window\.history\.pushState/);
  assert.match(client, /popstate/);
  assert.match(client, /fetch\("\/api\/repository\/scan"/);
  assert.match(profileRoute, /getChatGPTUser/);
  assert.match(profileRoute, /saveCyberusProfile/);
  assert.match(scanRoute, /api\.github\.com\/repos/);
  assert.match(scanRoute, /raw\.githubusercontent\.com/);
  assert.match(scanRoute, /saveCyberusScan/);
  assert.match(storage, /INSERT INTO cyberus_profiles/);
  assert.match(storage, /ON CONFLICT\(email\) DO UPDATE/);
  assert.match(storage, /INSERT INTO cyberus_scans/);
  assert.equal(JSON.parse(hosting).d1, "DB");
});

test("offers login choices that can reach the workspace", async () => {
  const [login, auth, shell, home, pricing] = await Promise.all([
    source("app/login/page.tsx"),
    source("app/chatgpt-auth.ts"),
    source("app/components/site-shell.tsx"),
    source("app/page.tsx"),
    source("app/pricing/page.tsx"),
  ]);

  assert.match(login, /Continue with Google/);
  assert.match(login, /Continue with ChatGPT/);
  assert.match(login, /name="email"/);
  assert.match(login, /Continue as guest/);
  assert.match(auth, /cyberusLoginPath/);
  assert.match(auth, /getCyberusSessionUser/);
  assert.match(shell, /\/login\?return_to=%2Fapp/);
  assert.match(home, /\/login\?return_to=%2Fapp%3Fview%3Dfeed/);
  assert.match(pricing, /\/login\?return_to=%2Fapp%3Fplan%3Dsignal/);
  assert.match(pricing, /\/login\?return_to=%2Fapp%3Fplan%3Dimmunity/);
});
