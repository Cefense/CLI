import { openSession, type GlobalOptions, type Session } from "../core/session.js";
import { UsageError } from "../core/errors.js";
import type { Project, ScanInterval, ScanMode } from "../core/types.js";
import { resolveLinkedProject } from "./link.js";
import * as out from "../ui/output.js";
import { browse } from "../ui/browser.js";
import { padEnd } from "../ui/format.js";
import { c, glyph } from "../ui/theme.js";
import { isInteractive } from "../ui/screen.js";
import { multiselect, select } from "../ui/prompts.js";
import { isAgentMode } from "../ui/mode.js";

export const SCAN_MODES: Array<{ id: ScanMode; label: string; detail: string; ready: boolean }> = [
  { id: "manual", label: "Manual", detail: "Scans run only when you ask for one.", ready: true },
  {
    id: "push",
    label: "On every push",
    detail: "Each commit to the default branch is scanned as it lands.",
    ready: true,
  },
  {
    id: "pull-request",
    label: "On pull requests",
    detail: "Scan the diff before it merges.",
    ready: false,
  },
  {
    id: "scheduled",
    label: "Periodically",
    detail: "On a fixed schedule, whether or not anything changed.",
    ready: true,
  },
];

export const SCAN_INTERVALS: Array<{ id: ScanInterval; label: string }> = [
  { id: "1h", label: "Every hour" },
  { id: "6h", label: "Every 6 hours" },
  { id: "12h", label: "Every 12 hours" },
  { id: "24h", label: "Every day" },
  { id: "168h", label: "Every week" },
];

export const CHECKS: Array<{ id: string; name: string; detail: string; available: boolean }> = [
  { id: "sast", name: "SAST", detail: "Static analysis of source", available: true },
  { id: "sca", name: "SCA", detail: "Dependency vulnerabilities", available: true },
  { id: "secrets", name: "Secrets", detail: "Keys and tokens in source", available: true },
  { id: "iac", name: "IaC", detail: "Terraform and Helm configs", available: true },
  { id: "quality", name: "Code quality", detail: "Smells and complexity", available: true },
  { id: "sbom", name: "SBOM", detail: "Component inventory export", available: true },
  { id: "runtime", name: "Runtime protection", detail: "Needs a workload agent", available: false },
  { id: "pentest", name: "Automated pentesting", detail: "Needs an authorized target", available: false },
];

export const CHECK_PRESETS: Record<string, string[]> = {
  essentials: ["sast", "sca", "secrets"],
  balanced: ["sast", "sca", "secrets", "iac", "quality"],
  everything: ["sast", "sca", "secrets", "iac", "quality", "sbom"],
};

const AVAILABLE = CHECKS.filter((check) => check.available);

function modeLabel(mode: ScanMode | undefined): string {
  return SCAN_MODES.find((entry) => entry.id === mode)?.label ?? "Manual";
}

function intervalLabel(interval: ScanInterval | undefined): string {
  return SCAN_INTERVALS.find((entry) => entry.id === interval)?.label ?? "Every day";
}

export function parseScanMode(value: string): ScanMode {
  const wanted = value.trim().toLowerCase();
  const match = SCAN_MODES.find((entry) => entry.id === wanted);
  if (!match) {
    throw new UsageError(
      `${value} is not a scan mode.`,
      `Use ${SCAN_MODES.map((entry) => entry.id).join(", ")}.`,
      "invalid_scan_mode",
    );
  }
  if (!match.ready) {
    throw new UsageError(
      `${match.label} scanning is not available yet.`,
      "Use manual, push, or scheduled.",
      "invalid_scan_mode",
    );
  }
  return match.id;
}

export function parseScanInterval(value: string): ScanInterval {
  const wanted = value.trim().toLowerCase();
  const match = SCAN_INTERVALS.find((entry) => entry.id === wanted);
  if (!match) {
    throw new UsageError(
      `${value} is not a scan interval.`,
      `Use ${SCAN_INTERVALS.map((entry) => entry.id).join(", ")}.`,
      "invalid_scan_interval",
    );
  }
  return match.id;
}

export function parseChecks(values: string[]): string[] {
  const ids: string[] = [];
  for (const raw of values.flatMap((value) => value.split(","))) {
    const wanted = raw.trim().toLowerCase();
    if (!wanted) continue;
    const preset = CHECK_PRESETS[wanted];
    if (preset) {
      ids.push(...preset);
      continue;
    }
    const check = CHECKS.find((entry) => entry.id === wanted);
    if (!check) {
      throw new UsageError(
        `${raw} is not a check.`,
        `Use ${AVAILABLE.map((entry) => entry.id).join(", ")}, or a preset: ${Object.keys(CHECK_PRESETS).join(", ")}.`,
        "invalid_check",
      );
    }
    if (!check.available) {
      throw new UsageError(
        `${check.name} cannot run on a repository scan.`,
        check.detail,
        "invalid_check",
      );
    }
    ids.push(check.id);
  }
  return [...new Set(ids)];
}

function settingsPayload(project: Project): Record<string, unknown> {
  return {
    repository: project.fullName,
    scanMode: project.scanMode ?? "manual",
    scanInterval: project.scanInterval ?? "24h",
    checks: project.coverages ?? [],
    lastScheduledAt: project.lastScheduledAt ?? null,
  };
}

async function apply(
  session: Session,
  project: Project,
  changes: { coverages?: string[]; scanMode?: ScanMode; scanInterval?: ScanInterval },
): Promise<Project> {
  const result = await session.client.updateRepoSettings(project, changes);
  return { ...project, ...result.project, scan: project.scan };
}

type Row =
  | { kind: "section"; label: string }
  | { kind: "mode"; mode: (typeof SCAN_MODES)[number] }
  | { kind: "interval"; interval: (typeof SCAN_INTERVALS)[number] }
  | { kind: "check"; check: (typeof CHECKS)[number] };

function buildRows(project: Project): Row[] {
  const rows: Row[] = [{ kind: "section", label: "trigger" }];
  for (const mode of SCAN_MODES) rows.push({ kind: "mode", mode });
  if (project.scanMode === "scheduled") {
    rows.push({ kind: "section", label: "schedule" });
    for (const interval of SCAN_INTERVALS) rows.push({ kind: "interval", interval });
  }
  rows.push({ kind: "section", label: "checks" });
  for (const check of CHECKS) rows.push({ kind: "check", check });
  return rows;
}

function renderRow(row: Row, project: Project, selected: boolean): string[] {
  if (row.kind === "section") {
    return ["", `  ${c.dim(row.label.toUpperCase())}`, ""];
  }

  const marker = selected ? c.cyan(glyph.arrow) : " ";

  if (row.kind === "mode") {
    const on = (project.scanMode ?? "manual") === row.mode.id;
    const bullet = !row.mode.ready
      ? c.dim(glyph.track)
      : on
        ? c.cyan(glyph.dot)
        : c.dim(glyph.ring);
    const label = row.mode.ready ? (selected ? c.bold(row.mode.label) : row.mode.label) : c.dim(row.mode.label);
    const detail = row.mode.ready ? row.mode.detail : `${row.mode.detail} Not available yet.`;
    return [`${marker} ${bullet} ${padEnd(label, 22)}${c.dim(detail)}`];
  }

  if (row.kind === "interval") {
    const on = (project.scanInterval ?? "24h") === row.interval.id;
    const bullet = on ? c.cyan(glyph.dot) : c.dim(glyph.ring);
    const label = selected ? c.bold(row.interval.label) : row.interval.label;
    return [`${marker} ${bullet} ${padEnd(label, 22)}${c.dim(row.interval.id)}`];
  }

  const on = (project.coverages ?? []).includes(row.check.id);
  const box = !row.check.available ? c.dim(glyph.track) : on ? c.green(glyph.check) : c.dim(glyph.ring);
  const name = row.check.available
    ? on
      ? selected
        ? c.bold(row.check.name)
        : row.check.name
      : c.dim(row.check.name)
    : c.dim(row.check.name);
  const detail = row.check.available ? row.check.detail : `${row.check.detail}, not available`;
  return [`${marker} ${box} ${padEnd(name, 22)}${c.dim(detail)}`];
}

function headerLines(project: Project): string[] {
  const mode = SCAN_MODES.find((entry) => entry.id === (project.scanMode ?? "manual"));
  const summary = [
    mode?.label ?? "Manual",
    project.scanMode === "scheduled" ? intervalLabel(project.scanInterval).toLowerCase() : "",
    `${(project.coverages ?? []).length} of ${AVAILABLE.length} checks`,
  ]
    .filter(Boolean)
    .join(c.dim("  ·  "));

  return [
    "",
    `  ${c.bold(project.fullName)}   ${c.dim("scan settings")}`,
    `  ${c.dim(padEnd("Branch", 9))}${project.defaultBranch ?? "default"}`,
    `  ${c.dim(padEnd("Now", 9))}${summary}`,
    "",
  ];
}

/**
 * The screen edits in place, so every keystroke is a write.
 *
 * Saves are chained rather than fired in parallel: each one sends the whole
 * desired state, so the last request to land is the one that is right, and two
 * quick presses cannot leave the row set and the row's server state disagreeing.
 */
function saver(session: Session, project: Project) {
  let chain: Promise<unknown> = Promise.resolve();
  return (next: Project): Promise<Project> => {
    const run = chain.then(() =>
      session.client
        .updateRepoSettings(project, {
          coverages: next.coverages ?? [],
          scanMode: (next.scanMode ?? "manual") as ScanMode,
          scanInterval: (next.scanInterval ?? "24h") as ScanInterval,
        })
        .then((result) => ({ ...next, ...result.project, scan: next.scan })),
    );
    chain = run.catch(() => undefined);
    return run;
  };
}

async function settingsScreen(session: Session, initial: Project): Promise<void> {
  let project = initial;
  const save = saver(session, initial);

  await browse(buildRows(project), {
    header: () => headerLines(project),
    renderRow: (row, selected) => renderRow(row, project, selected),
    filterText: (row) =>
      row.kind === "mode"
        ? row.mode.label
        : row.kind === "interval"
          ? row.interval.label
          : row.kind === "check"
            ? row.check.name
            : "",
    emptyMessage: "Nothing matches that filter.",
    selectLabel: (row) => {
      if (!row || row.kind === "section") return null;
      if (row.kind === "check") return row.check.available ? "toggle" : null;
      if (row.kind === "mode") return row.mode.ready ? "choose" : null;
      return "choose";
    },
    onSelect: async (row, context) => {
      let next: Project | null = null;

      if (row.kind === "mode") {
        if (!row.mode.ready) {
          context.setStatus(`${row.mode.label} scanning is not available yet.`);
          return;
        }
        if ((project.scanMode ?? "manual") === row.mode.id) return;
        next = { ...project, scanMode: row.mode.id };
      } else if (row.kind === "interval") {
        if ((project.scanInterval ?? "24h") === row.interval.id) return;
        next = { ...project, scanInterval: row.interval.id };
      } else if (row.kind === "check") {
        if (!row.check.available) {
          context.setStatus(`${row.check.name}: ${row.check.detail}.`);
          return;
        }
        const active = new Set(project.coverages ?? []);
        if (active.has(row.check.id)) active.delete(row.check.id);
        else active.add(row.check.id);
        next = {
          ...project,
          coverages: CHECKS.filter((check) => active.has(check.id)).map((check) => check.id),
        };
      }

      if (!next) return;

      project = next;
      await context.refresh();
      context.setStatus("Saving");
      try {
        project = await save(next);
        context.setStatus(
          row.kind === "check"
            ? `Checks: ${(project.coverages ?? []).join(", ") || "none"}`
            : row.kind === "mode"
              ? `Scanning ${modeLabel(project.scanMode).toLowerCase()}`
              : `Scanning ${intervalLabel(project.scanInterval).toLowerCase()}`,
        );
      } catch (error) {
        project = initial;
        await context.refresh();
        context.setStatus(error instanceof Error ? error.message : String(error));
        return;
      }
      await context.refresh();
    },
    refresh: async () => buildRows(project),
  });
}

export async function settingsShow(globals: GlobalOptions): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const { project } = await resolveLinkedProject(session, globals);

  if (isAgentMode()) {
    out.agentEmit(settingsPayload(project), [
      `cf settings mode scheduled --every 6h --repo ${project.fullName} --agent`,
      `cf settings checks sast,sca,secrets --repo ${project.fullName} --agent`,
    ]);
    return 0;
  }
  if (out.isJsonMode()) {
    out.json(settingsPayload(project));
    return 0;
  }

  await settingsScreen(session, project);

  if (!isInteractive()) {
    out.line();
    out.hint("cf settings mode <manual|push|scheduled>");
    out.hint("cf settings every <1h|6h|12h|24h|168h>");
    out.hint("cf settings checks <sast,sca,secrets,iac,quality,sbom>");
    out.line();
  }
  return 0;
}

export async function settingsMode(
  globals: GlobalOptions,
  value: string | undefined,
  options: { every?: string } = {},
): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const { project } = await resolveLinkedProject(session, globals);

  let mode: ScanMode;
  if (value) {
    mode = parseScanMode(value);
  } else {
    mode = parseScanMode(
      await select({
        message: `How should ${project.fullName} be scanned?`,
        initialValue: project.scanMode ?? "manual",
        choices: SCAN_MODES.filter((entry) => entry.ready).map((entry) => ({
          value: entry.id,
          label: entry.label,
          hint: entry.detail,
        })),
      }),
    );
  }

  let interval: ScanInterval | undefined = options.every ? parseScanInterval(options.every) : undefined;
  if (mode === "scheduled" && !interval && !value && !globals.yes) {
    interval = parseScanInterval(
      await select({
        message: "How often?",
        initialValue: project.scanInterval ?? "24h",
        choices: SCAN_INTERVALS.map((entry) => ({ value: entry.id, label: entry.label })),
      }),
    );
  }

  const updated = await apply(session, project, { scanMode: mode, scanInterval: interval });

  if (isAgentMode()) {
    out.agentEmit(settingsPayload(updated), [`cf settings --repo ${project.fullName} --agent`]);
    return 0;
  }
  if (out.isJsonMode()) {
    out.json(settingsPayload(updated));
    return 0;
  }

  out.line();
  out.success(
    mode === "scheduled"
      ? `${c.bold(project.fullName)} now scans ${intervalLabel(updated.scanInterval).toLowerCase()}`
      : `${c.bold(project.fullName)} scan mode set to ${modeLabel(mode)}`,
  );
  if (mode === "push") out.hint("Every commit to the default branch is scanned as it lands.");
  if (mode === "scheduled") out.hint("The next sweep picks it up within a few minutes.");
  out.line();
  return 0;
}

export async function settingsInterval(
  globals: GlobalOptions,
  value: string | undefined,
): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const { project } = await resolveLinkedProject(session, globals);

  const interval = value
    ? parseScanInterval(value)
    : parseScanInterval(
        await select({
          message: `How often should ${project.fullName} be scanned?`,
          initialValue: project.scanInterval ?? "24h",
          choices: SCAN_INTERVALS.map((entry) => ({ value: entry.id, label: entry.label })),
        }),
      );

  const updated = await apply(session, project, {
    scanInterval: interval,
    scanMode: "scheduled",
  });

  if (isAgentMode()) {
    out.agentEmit(settingsPayload(updated), [`cf settings --repo ${project.fullName} --agent`]);
    return 0;
  }
  if (out.isJsonMode()) {
    out.json(settingsPayload(updated));
    return 0;
  }

  out.line();
  out.success(`${c.bold(project.fullName)} scans ${intervalLabel(interval).toLowerCase()}`);
  out.hint("Scan mode set to scheduled so the interval has something to drive.");
  out.line();
  return 0;
}

export async function settingsChecks(
  globals: GlobalOptions,
  values: string[],
  options: { add?: boolean; remove?: boolean } = {},
): Promise<number> {
  if (options.add && options.remove) {
    throw new UsageError("Pass either --add or --remove, not both.");
  }

  const session = await openSession(globals, { auth: true });
  const { project } = await resolveLinkedProject(session, globals);
  const current = new Set(project.coverages ?? []);

  let next: string[];
  if (values.length === 0) {
    if (options.add || options.remove) {
      throw new UsageError("Name the checks to change.", `Use ${AVAILABLE.map((check) => check.id).join(", ")}.`);
    }
    next = await multiselect({
      message: `Which checks should run on ${project.fullName}?`,
      choices: AVAILABLE.map((check) => ({
        value: check.id,
        label: check.name,
        hint: check.detail,
      })),
      initialValues: AVAILABLE.filter((check) => current.has(check.id)).map((check) => check.id),
    });
  } else {
    const named = parseChecks(values);
    if (options.add) next = [...new Set([...current, ...named])];
    else if (options.remove) next = [...current].filter((id) => !named.includes(id));
    else next = named;
  }

  const ordered = CHECKS.filter((check) => next.includes(check.id)).map((check) => check.id);
  const updated = await apply(session, project, { coverages: ordered });

  if (isAgentMode()) {
    out.agentEmit(settingsPayload(updated), [
      `cf scan --repo ${project.fullName} --wait --agent`,
    ]);
    return 0;
  }
  if (out.isJsonMode()) {
    out.json(settingsPayload(updated));
    return 0;
  }

  out.line();
  out.success(
    ordered.length > 0
      ? `Checks for ${c.bold(project.fullName)}: ${ordered.join(", ")}`
      : `${c.bold(project.fullName)} has no checks enabled`,
  );
  out.hint("The change applies from the next scan.");
  out.line();
  return 0;
}
