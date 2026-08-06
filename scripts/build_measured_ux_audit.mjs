import { mkdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const personas = JSON.parse(await readFile(new URL("tests/personas.json", root), "utf8"));
const measurements = JSON.parse(await readFile(new URL("reports/public-route-measurements.json", root), "utf8"));

const routeMap = {
  home: "/",
  product: "/product",
  threats: "/threats",
  pricing: "/pricing",
  company: "/company",
  signin: "/signin-with-chatgpt",
  connect: "/app (setup)",
  feed: "/app?view=feed",
  autofix: "/app?view=autofix",
  repositories: "/app?view=repositories",
  clouds: "/app?view=clouds",
  integrations: "/app?view=integrations",
  pentests: "/app?view=pentests",
  reports: "/app?view=reports",
};

const secondFailure = [
  "The public-repository field cannot validate a private production repository; GitHub OAuth is explicitly deferred.",
  "Assign owner still opens a native window.prompt, breaking keyboard context and structured handle validation.",
  "The Feed source-to-production claim cannot be verified without a completed repository scan in the authenticated session.",
  "AutoFix shows the focused diff but does not expose a runnable regression-test log in the reviewed pane.",
  "The critical row uses security terms such as ownership guard without an inline beginner definition.",
  "Ownership is hidden inside the row overflow menu instead of being visible in the default manager scan.",
  "Immunity records do not expose an executive-only summary before the technical evidence body.",
  "The evidence record is labeled preview and cannot prove cryptographic signing in this environment.",
  "Background scan feedback confirms start and completion but exposes no cancel control.",
  "Cloud-to-code scope persistence cannot be verified because the authenticated Clouds route was unavailable.",
  "Pentest-to-AutoFix selection persistence cannot be verified across the protected route boundary.",
  "The setup supports public GitHub only; the private-repository evaluation path remains blocked.",
  "Intelligence rows expose source and variants, but no public control opens a primitive directly into a repository match.",
  "The critical queue and replay result cannot be exercised together without authenticated workspace DOM.",
  "Dismiss is optimistic but offers no visible undo action; Restore queue resets every dismissed row at once.",
  "The review package does not show a policy approval requirement for regulated payment code.",
  "Owner entry is free text, so team membership and accountable identity are not validated.",
  "The evidence download explicitly remains a preview artifact, not a signed formal record.",
  "Integrations can be toggled visually, but connector credential validation is not shown in the client flow.",
  "Pricing CTAs enter authentication before showing procurement details such as billing terms or SLA.",
  "The public product demonstration verifies local UI state only; it does not expose backend evidence to an investor.",
  "Repeated finding review cannot be timed because authenticated queue state was unavailable in the test browser.",
  "Replay success is represented in client state; an executed test-log payload is not visible in AutoFix.",
  "The phone layout stacks AutoFix panes, so full diff-to-reasoning comparison requires internal scrolling.",
  "The default demo queue is TypeScript-centric and does not demonstrate Python package reachability.",
  "Agent and dependency risk are categories, but the demo AutoFix change is an authentication example only.",
  "Run scan retains the current screen, but the queue cannot be opened from a completed scan in this unauthenticated run.",
  "The session finding explains backend ownership but does not connect the change to frontend logout behavior.",
  "The evidence record lacks a compact client-export mode separate from the full technical proof.",
  "The repository switcher cannot be measured across customer environments without authenticated multi-workspace data.",
  "The evidence record says preview, so source finding and replay provenance cannot be treated as audit-grade signing.",
  "Open demo workspace writes a profile before entry; the consent and persistence consequences are not explained inline.",
  "The nontechnical path still exposes code-file names before an executive interpretation is available.",
  "The morning queue has one clear priority, but cross-session restoration of filter and selected finding is not implemented.",
  "The public purpose is measurable, but reaching the first working result crosses an unmeasured authentication boundary.",
  "j/k and Enter are implemented, but the row overflow actions have no documented keyboard shortcuts.",
  "State feedback uses aria-live, but the native owner prompt and dynamic menu focus behavior remain unverified with a screen reader.",
  "A scan is non-blocking in source, but retry/backoff behavior on a dropped connection is not surfaced.",
  "The repository switcher shows one name but offers no measurable all-repository critical queue after redundant scope chips were removed.",
  "The incident path cannot prove end-to-end closure time because replay and evidence require authenticated state.",
];

const esc = (value) => String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
const rows = personas.map((persona, index) => {
  const route = persona.journey.map((step) => routeMap[step] ?? step).join(" → ");
  const failureOne = `Protected workspace interaction was not measurable: ${measurements.workspace.reason}`;
  const fields = [
    `${String(persona.id).padStart(2, "0")} ${persona.name}, ${persona.role}`,
    route,
    "0 — TTFA MEASURED: NO; total MEASURED: NO",
    "0 — actual/minimum MEASURED: NO",
    "0 — count MEASURED: NO",
    "0 — flow maximum MEASURED: NO",
    "0 — flow maximum MEASURED: NO",
    "0 — path minimum MEASURED: NO",
    "0 — MEASURED: NO",
    "5 — applied interaction transitions 120–160ms; blocking N; violations 0 (source)",
    "0 — MEASURED: NO; requires human observation",
    `${failureOne} ${secondFailure[index]}`,
    "Speed N; clicks N; decisions N; visual N; alarm N; contrast N; color-only N; motion Y; fit N",
  ];
  return `| ${fields.map(esc).join(" | ")} |`;
});

const profileRows = personas.map((p) =>
  `| ${String(p.id).padStart(2, "0")} ${esc(p.name)} | ${esc(p.role)} | ${esc(p.context)} | ${esc(p.device)} | ${esc(p.behavior)} | ${esc(p.goal)} |`,
);

const publicRows = measurements.routes.map((r) =>
  `| ${r.path} | ${r.navigationMs} ms | ${r.viewportControls} | ${r.blackSurfaces} | ${r.horizontalOverflow ? "Y" : "N"} | ${r.minTextPx}px |`,
);

const report = `# Cefense measured UX audit

Date: 19 July 2026

## Step 0 — evidence available

- Repo access: **YES**, verified from the local checkout.
- Live public routes: **YES**, inspected in the Codex in-app browser against \`http://localhost:3000\` at 1280×720.
- Authenticated workspace DOM: **NO**. The protected \`/app?view=feed\` route navigated in 65 ms but returned an empty inspectable DOM snapshot in this session. No authenticated completion time, click count, decision count, visual maximum, alarm maximum, or full-path contrast is claimed.
- Human-moderated participants: **NO**. These are 40 locked persona audits against implementation evidence, not 40 recruited humans.
- Source inspection: **YES**, including TypeScript, CSS, tests, and build output.

## Fresh public-route measurements

Literal browser measurement set: [public-route-measurements.json](./public-route-measurements.json).

| Route | DOM navigation | Max controls in viewport | Black surfaces | Horizontal overflow | Minimum rendered text |
|---|---:|---:|---:|---:|---:|
${publicRows.join("\n")}

Hard threshold result: every tested public first viewport contained exactly 7 controls, so none exceeded the **>7** flag threshold. All five routes returned zero black surfaces and zero horizontal overflow. Header geometry was separately measured as 732×60 px on every route.

Phone check: at 390×844 the expanded menu contained exactly 7 visible controls; all five routes had zero horizontal overflow and a 15px minimum rendered text size.

Contrast tool output: \`#686b65\` on \`#f3f2ed\` at 16px/720 = **4.83:1**; \`#62645e\` on \`#f3f2ed\` at 16px/400 = **5.35:1**; \`#666963\` on \`#f2f1ec\` at 15px/400 = **4.93:1**; \`#ffffff\` on \`#20221e\` at 15px/720 = **16.04:1**. Formula: relative luminance per WCAG sRGB linearization, ratio \`(Lmax + .05) / (Lmin + .05)\`. Source colors: \`app/command.css:5-15\`, \`app/app/workstation.css:5-12\`.

## Locked 40-persona audit

Scoring rule: 0 means the required field was not measurable; 5 is used only for the source-measured motion contract. No composite score or verdict is produced.

| Persona | Route | Speed (score + ms) | Click efficiency (score + ratio) | Decision load (score + count) | Visual load (score + max elements) | Alarm integrity (score + max colors) | Contrast (score + ratio + hex + font size) | Color-only signaling (score) | Motion discipline (score + violations list) | First-impression/repeat-use fit (score) | Failure modes found (min 2, named elements) | MEASURED: YES/NO per field |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
${rows.join("\n")}

## Detailed locked profiles

| Persona | Role | Context | Device | Behavior | Goal |
|---|---|---|---|---|---|
${profileRows.join("\n")}

## Real failure modes found

1. The authenticated route could not be instrumented in the active local browser session. This blocks honest end-to-end time, click, decision, visual-load, alarm-load, contrast, color-only, and repeat-use measurements.
2. Owner assignment still uses \`window.prompt\` (\`app/app/workspace-client.tsx:800\`), which has weak validation and uncertain focus behavior.
3. GitHub OAuth for private repositories remains explicitly unavailable in setup, blocking a core enterprise evaluation path.
4. The evidence download describes itself as a preview rather than a cryptographically signed record.
5. Multi-repository scope is named by the switcher but an all-repository critical queue is not implemented.
6. Mobile AutoFix intentionally stacks panes; it avoids page scrolling but requires internal pane scrolling for the full comparison.
7. Scan work is non-blocking (\`app/app/workspace-client.tsx:302\`), but cancellation and retry/backoff states are absent.
8. Screen-reader status is present (\`app/app/workspace-client.tsx:635\`), but focus behavior for the row menu and owner prompt was not executed with assistive technology.

## MEASURED: YES

| Field | Evidence |
|---|---|
| Public route DOM navigation | Literal browser output in \`reports/public-route-measurements.json\` |
| Public first-viewport controls | 7 on all five routes; literal browser output |
| Public black surfaces | 0 on all five routes; literal browser output |
| Public horizontal overflow | false on all five routes; literal browser output |
| Public minimum text | 16px on all five routes after the Intelligence inheritance defect was fixed |
| Public header consistency | 732×60px on all five tested desktop routes; literal browser output |
| Phone breakpoint | 390×844; expanded menu 7 controls; 0 horizontal-overflow routes; 15px minimum text |
| Static contrast samples | Formula and exact inputs above; literal Node calculation output |
| Motion source contract | Public 120–140ms at \`app/command.css:21,99,122\`; workspace 120–160ms at \`app/app/workstation.css:28,100,120,200,203\`; all are non-blocking CSS transitions |
| Page-level workspace scroll lock | \`app/app/workstation.css:17-25\` and runtime lock at \`app/app/workspace-client.tsx:209-220\` |
| Keyboard queue controls | j/k/Enter at \`app/app/workspace-client.tsx:761-778\` |
| Non-blocking scan start | \`app/app/workspace-client.tsx:302\` |

## MEASURED: NO

| Field | Reason |
|---|---|
| Authenticated TTFA and total completion time for all 40 personas | Protected route returned no inspectable DOM in the active local browser session. |
| Actual/minimum clicks for all 40 personas | No authenticated interaction trace was available. |
| Decision-point count for all 40 personas | Cannot be derived from source without observing a real participant. |
| Full-flow maximum controls for all 40 personas | Public first viewport was measured; protected busy steps were not. |
| Full-flow alarm element maximum for all 40 personas | Protected Feed and AutoFix were not rendered in the instrumented browser. |
| Full-flow minimum contrast for all 40 personas | Exact palette samples were computed; every runtime composite surface was not sampled. |
| Exhaustive color-only signaling result | Static inspection cannot prove every runtime state. |
| First-impression comprehension within 5 seconds | Requires a participant who has not seen Cefense. |
| Repeat-use fatigue and daily desirability | Requires repeated use over time. |
| Screen-reader completion | Requires an assistive-technology run with the protected UI. |
| Scan completion under limited bandwidth | Requires controlled network throttling and an authenticated scan. |

## What this report cannot tell you

This artifact cannot establish that people understand the category claim, trust repository handling, complete the protected workflow, or want to return daily. Those require moderated first-time sessions, repeated-use diary study, authenticated browser instrumentation, screen-reader testing, and throttled-network testing. The 40 persona rows are distinct adversarial audits anchored to the locked profiles; they are not evidence that 40 humans used the product.
`;

await mkdir(new URL("reports/", root), { recursive: true });
await writeFile(new URL("reports/CEFENSE-MEASURED-UX-AUDIT.md", root), report);
console.log(`Wrote ${personas.length} persona rows to reports/CEFENSE-MEASURED-UX-AUDIT.md`);
