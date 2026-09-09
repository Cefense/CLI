import { openSession, type GlobalOptions, type Session } from "../core/session.js";
import { UsageError } from "../core/errors.js";
import type { Project, ScanDepth, ScanInterval, ScanMode } from "../core/types.js";
import { resolveLinkedProject } from "./link.js";
import * as out from "../ui/output.js";
import { nextSteps } from "../ui/list.js";
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

export const SCAN_DEPTHS: Array<{ id: ScanDepth; label: string; detail: string }> = [
  {
    id: "default",
    label: "Default",
    detail: "The full pipeline on every scan: sweep, verify, correlate. Balanced depth and speed.",
  },
  {
    id: "max",
    label: "Max",
    detail: "Keeps sending fresh passes until nothing new turns up. Slower, built for audits.",
  },
];

export const CHECKS: Array<{ id: string; name: string; detail: string; available: boolean }> = [
  { id: "sast", name: "SAST", detail: "Static analysis of source", available: true },
  { id: "sca", name: "SCA", detail: "Dependency vulnerabilities", available: true },
  { id: "secrets", name: "Secrets", detail: "Keys and tokens in source", available: true },
  { id: "iac", name: "IaC", detail: "Terraform and Helm configs", available: true },
  { id: "quality", name: "Code quality", detail: "Smells and complexity", available: true },
  { id: "sbom", name: "SBOM", detail: "Component inventory export", available: true },
  { id: "runtime", name: "Runtime protection", detail: "Needs a workload agent", available: false },
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

function depthLabel(depth: ScanDepth | undefined): string {
  return SCAN_DEPTHS.find((entry) => entry.id === depth)?.label ?? "Default";
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

export function parseScanDepth(value: string): ScanDepth {
  const wanted = value.trim().toLowerCase();
  const match = SCAN_DEPTHS.find((entry) => entry.id === wanted);
  if (!match) {
    throw new UsageError(
      `${value} is not a scan depth.`,
      `Use ${SCAN_DEPTHS.map((entry) => entry.id).join(", ")}.`,
      "invalid_scan_depth",
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
    scanDepth: project.scanDepth ?? "default",
    checks: project.coverages ?? [],
    lastScheduledAt: project.lastScheduledAt ?? null,
  };
}

async function apply(
  session: Session,
  project: Project,
  changes: {
    coverages?: string[];
    scanMode?: ScanMode;
    scanInterval?: ScanInterval;
    scanDepth?: ScanDepth;
  },
): Promise<Project> {
  const result = await session.client.updateRepoSettings(project, changes);
  return { ...project, ...result.project, scan: project.scan };
}

function headerLines(project: Project): string[] {
  const mode = SCAN_MODES.find((entry) => entry.id === (project.scanMode ?? "manual"));
  const summary = [
    mode?.label ?? "Manual",
    project.scanMode === "scheduled" ? intervalLabel(project.scanInterval).toLowerCase() : "",
    `${depthLabel(project.scanDepth).toLowerCase()} depth`,
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

function optionRows(
  entries: Array<{ id: string; label: string; detail?: string; ready?: boolean }>,
  current: string,
): string[] {
  return entries.map((entry) => {
    const usable = entry.ready !== false;
    const bullet = !usable ? c.dim(glyph.track) : entry.id === current ? c.cyan(glyph.dot) : c.dim(glyph.ring);
    const label = usable ? entry.label : c.dim(entry.label);
    const detail = usable ? (entry.detail ?? "") : `${entry.detail ?? ""} Not available yet.`;
    return `  ${bullet} ${padEnd(label, 22)}${c.dim(detail)}`;
  });
}

function printSettings(project: Project): void {
  out.lines(headerLines(project));

  out.line(`  ${c.dim("TRIGGER")}`);
  out.lines(optionRows(SCAN_MODES, project.scanMode ?? "manual"));

  if (project.scanMode === "scheduled") {
    out.line();
    out.line(`  ${c.dim("SCHEDULE")}`);
    out.lines(
      optionRows(
        SCAN_INTERVALS.map((entry) => ({ ...entry, detail: entry.id })),
        project.scanInterval ?? "24h",
      ),
    );
  }

  out.line();
  out.line(`  ${c.dim("DEPTH")}`);
  out.lines(optionRows(SCAN_DEPTHS, project.scanDepth ?? "default"));

  const active = new Set(project.coverages ?? []);
  out.line();
  out.line(`  ${c.dim("CHECKS")}`);
  out.lines(
    CHECKS.map((check) => {
      const box = !check.available
        ? c.dim(glyph.track)
        : active.has(check.id)
          ? c.green(glyph.check)
          : c.dim(glyph.ring);
      const name = check.available && active.has(check.id) ? check.name : c.dim(check.name);
      const detail = check.available ? check.detail : `${check.detail}, not available`;
      return `  ${box} ${padEnd(name, 22)}${c.dim(detail)}`;
    }),
  );

  nextSteps([
    { command: "cf settings mode push", purpose: "change what triggers a scan" },
    { command: "cf settings depth max", purpose: "change how hard each scan looks" },
    { command: "cf settings checks sast,sca,secrets", purpose: "change which analyses run" },
  ]);
  out.line();
}

export async function settingsShow(globals: GlobalOptions): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const { project } = await resolveLinkedProject(session, globals);

  if (isAgentMode()) {
    out.agentEmit(settingsPayload(project), [
      `cf settings mode scheduled --every 6h --repo ${project.fullName} --agent`,
      `cf settings depth max --repo ${project.fullName} --agent`,
      `cf settings checks sast,sca,secrets --repo ${project.fullName} --agent`,
    ]);
    return 0;
  }
  if (out.isJsonMode()) {
    out.json(settingsPayload(project));
    return 0;
  }

  printSettings(project);
  return 0;
}

export async function settingsMode(
  globals: GlobalOptions,
  value: string | undefined,
  options: { every?: string } = {},
): Promise<number> {
  const requested = value ? parseScanMode(value) : null;
  const every = options.every ? parseScanInterval(options.every) : null;
  const session = await openSession(globals, { auth: true });
  const { project } = await resolveLinkedProject(session, globals);

  let mode: ScanMode;
  if (requested) {
    mode = requested;
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

  let interval: ScanInterval | undefined = every ?? undefined;
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
  const requested = value ? parseScanInterval(value) : null;
  const session = await openSession(globals, { auth: true });
  const { project } = await resolveLinkedProject(session, globals);

  const interval = requested
    ? requested
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
  const requested = values.length > 0 ? parseChecks(values) : null;

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
    const named = requested ?? [];
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

export async function settingsDepth(
  globals: GlobalOptions,
  value: string | undefined,
): Promise<number> {
  const requested = value ? parseScanDepth(value) : null;
  const session = await openSession(globals, { auth: true });
  const { project } = await resolveLinkedProject(session, globals);

  const depth = requested
    ? requested
    : parseScanDepth(
        await select({
          message: `How hard should ${project.fullName} be scanned?`,
          initialValue: project.scanDepth ?? "default",
          choices: SCAN_DEPTHS.map((entry) => ({
            value: entry.id,
            label: entry.label,
            hint: entry.detail,
          })),
        }),
      );

  const updated = await apply(session, project, { scanDepth: depth });

  if (isAgentMode()) {
    out.agentEmit(settingsPayload(updated), [`cf scan --repo ${project.fullName} --wait --agent`]);
    return 0;
  }
  if (out.isJsonMode()) {
    out.json(settingsPayload(updated));
    return 0;
  }

  out.line();
  out.success(`${c.bold(project.fullName)} scans at ${depthLabel(depth).toLowerCase()} depth`);
  out.hint(
    depth === "max"
      ? "Max keeps sending passes until nothing new turns up, so scans take longer."
      : "Default is the balanced pipeline every scan runs.",
  );
  out.hint("The change applies from the next scan.");
  out.line();
  return 0;
}
