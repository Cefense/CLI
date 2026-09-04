import { existsSync, mkdirSync, readFileSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { CefenseError, UsageError } from "../core/errors.js";
import { gitToplevel } from "../core/repo.js";
import type { GlobalOptions } from "../core/session.js";
import { terminalWidth } from "../ui/format.js";
import { isAgentMode } from "../ui/mode.js";
import * as out from "../ui/output.js";
import { confirm } from "../ui/prompts.js";
import { renderTable } from "../ui/table.js";
import { c, glyph } from "../ui/theme.js";

const BLOCK_START = "<!-- cefense:start -->";
const BLOCK_END = "<!-- cefense:end -->";
const REFERENCE_PATH = ".cefense/SKILL.md";

export interface SkillDoc {
  name: string;
  description: string;
  body: string;
}

interface Target {
  id: string;
  label: string;
  kind: "file" | "block";
  path: string;
  globalPath?: string;
  detect: string[];
  header?: (skill: SkillDoc) => string;
}

export type Action = "created" | "updated" | "unchanged" | "removed" | "absent";

export interface Change {
  target: string;
  path: string;
  action: Action;
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function frontmatter(entries: Array<[string, string]>): string {
  return ["---", ...entries.map(([key, value]) => `${key}: ${value}`), "---"].join("\n");
}

function ruleHeader(skill: SkillDoc): string {
  return frontmatter([
    ["trigger", "model_decision"],
    ["description", quote(skill.description)],
  ]);
}

const TARGETS: Target[] = [
  {
    id: "claude",
    label: "Claude Code",
    kind: "file",
    path: ".claude/skills/cefense/SKILL.md",
    globalPath: join(homedir(), ".claude", "skills", "cefense", "SKILL.md"),
    detect: [".claude", "CLAUDE.md"],
    header: (skill) =>
      frontmatter([
        ["name", skill.name],
        ["description", quote(skill.description)],
      ]),
  },
  {
    id: "cursor",
    label: "Cursor",
    kind: "file",
    path: ".cursor/rules/cefense.mdc",
    detect: [".cursor"],
    header: (skill) =>
      frontmatter([
        ["description", quote(skill.description)],
        ["alwaysApply", "false"],
      ]),
  },
  {
    id: "copilot",
    label: "GitHub Copilot",
    kind: "file",
    path: ".github/instructions/cefense.instructions.md",
    detect: [".github/instructions", ".github/copilot-instructions.md"],
    header: () => frontmatter([["applyTo", quote("**")]]),
  },
  {
    id: "antigravity",
    label: "Google Antigravity",
    kind: "file",
    path: ".agents/rules/cefense.md",
    detect: [".agents", ".agent"],
  },
  {
    id: "windsurf",
    label: "Windsurf",
    kind: "file",
    path: ".windsurf/rules/cefense.md",
    detect: [".windsurf", ".windsurfrules"],
    header: ruleHeader,
  },
  {
    id: "devin",
    label: "Devin Desktop",
    kind: "file",
    path: ".devin/rules/cefense.md",
    detect: [".devin"],
    header: ruleHeader,
  },
  {
    id: "cline",
    label: "Cline and Roo Code",
    kind: "file",
    path: ".clinerules/cefense.md",
    detect: [".clinerules", ".roo"],
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    kind: "block",
    path: "GEMINI.md",
    globalPath: join(homedir(), ".gemini", "GEMINI.md"),
    detect: ["GEMINI.md", ".gemini"],
  },
  {
    id: "agents",
    label: "Codex, Amp, OpenCode, Jules, and anything reading AGENTS.md",
    kind: "block",
    path: "AGENTS.md",
    globalPath: join(homedir(), ".codex", "AGENTS.md"),
    detect: ["AGENTS.md", ".codex"],
  },
];

function bundled(name: string): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(dir, "skills", "cefense", name);
    if (existsSync(candidate)) return readFileSync(candidate, "utf8");
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new CefenseError(`The bundled Cefense skill is missing from this installation.`, {
    remedy: "Reinstall with npm install -g @cefense-npm/cefense-cli.",
    code: "skill_missing",
  });
}

export function parseSkill(raw: string): SkillDoc {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return { name: "cefense", description: "", body: raw.trim() };
  const front = match[1] ?? "";
  const read = (key: string): string => {
    const found = front.match(new RegExp(`^${key}:[ \\t]*(.+)$`, "m"));
    return (found?.[1] ?? "").trim().replace(/^["']/, "").replace(/["']$/, "");
  };
  return {
    name: read("name") || "cefense",
    description: read("description"),
    body: raw.slice(match[0].length).trim(),
  };
}

function loadSkill(): SkillDoc {
  return parseSkill(bundled("SKILL.md"));
}

function renderFor(target: Target, skill: SkillDoc): string {
  const header = target.header?.(skill);
  return `${header ? `${header}\n\n` : ""}${skill.body}\n`;
}

function renderBlock(reference: string): string {
  const body = bundled("POINTER.md").trim().replaceAll("{{reference}}", reference);
  return `${BLOCK_START}\n\n${body}\n\n${BLOCK_END}`;
}

function root(): string {
  return gitToplevel() ?? process.cwd();
}

function pathFor(target: Target, global: boolean): string {
  if (!global) return join(root(), target.path);
  if (!target.globalPath) {
    const supported = TARGETS.filter((entry) => entry.globalPath)
      .map((entry) => entry.id)
      .join(", ");
    throw new UsageError(
      `${target.id} has no user-wide location, only a per-repository one.`,
      `Drop --global, or use it with ${supported}.`,
      "global_unsupported",
    );
  }
  return target.globalPath;
}

function display(absolute: string): string {
  const inside = relative(root(), absolute);
  return inside.startsWith("..") ? absolute.replace(homedir(), "~") : inside;
}

function detected(target: Target): boolean {
  const base = root();
  return target.detect.some((entry) => existsSync(join(base, entry)));
}

function write(file: string, content: string): Action {
  const existed = existsSync(file);
  if (existed && readFileSync(file, "utf8") === content) return "unchanged";
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content, { mode: 0o644 });
  return existed ? "updated" : "created";
}

function pruneEmpty(file: string, base: string): void {
  let dir = dirname(file);
  while (dir !== base && dir.startsWith(base)) {
    try {
      rmdirSync(dir);
    } catch {
      return;
    }
    dir = dirname(dir);
  }
}

function spliceBlock(original: string, block: string): string {
  const start = original.indexOf(BLOCK_START);
  const end = original.indexOf(BLOCK_END);
  if (start !== -1 && end > start) {
    const before = original.slice(0, start).replace(/\s+$/, "");
    const after = original.slice(end + BLOCK_END.length).replace(/^\s+/, "");
    return [before, block, after].filter(Boolean).join("\n\n").concat("\n");
  }
  const trimmed = original.replace(/\s+$/, "");
  return trimmed ? `${trimmed}\n\n${block}\n` : `${block}\n`;
}

function removeBlock(original: string): string | null {
  const start = original.indexOf(BLOCK_START);
  const end = original.indexOf(BLOCK_END);
  if (start === -1 || end <= start) return null;
  const before = original.slice(0, start).replace(/\s+$/, "");
  const after = original.slice(end + BLOCK_END.length).replace(/^\s+/, "");
  return [before, after].filter(Boolean).join("\n\n").replace(/\s*$/, "\n");
}

function hasBlock(file: string): boolean {
  return existsSync(file) && readFileSync(file, "utf8").includes(BLOCK_START);
}

function installed(target: Target, global: boolean): boolean {
  const file = target.globalPath || !global ? pathFor(target, global) : "";
  if (!file) return false;
  return target.kind === "block" ? hasBlock(file) : existsSync(file);
}

function resolveTargets(names: string[], options: { all?: boolean; global?: boolean }): Target[] {
  if (options.all) return TARGETS.filter((target) => !options.global || target.globalPath);

  if (names.length > 0) {
    return names.map((name) => {
      const target = TARGETS.find((entry) => entry.id === name.toLowerCase());
      if (!target) {
        throw new UsageError(
          `${name} is not a coding agent the CLI knows about.`,
          `Run cf skill list to see the ${TARGETS.length} it supports.`,
          "unknown_target",
        );
      }
      return target;
    });
  }

  const found = TARGETS.filter(
    (target) => detected(target) && (!options.global || target.globalPath),
  );
  if (found.length > 0) return found;

  const fallback = TARGETS.find((target) => target.id === "agents");
  return fallback ? [fallback] : [];
}

export async function skillInstall(
  globals: GlobalOptions,
  names: string[],
  options: { all?: boolean; global?: boolean } = {},
): Promise<number> {
  const targets = resolveTargets(names, options);
  if (targets.length === 0) {
    throw new UsageError(
      "No coding agent was named and none could be detected here.",
      "Run cf skill list, then cf skill install <agent>.",
      "no_targets",
    );
  }

  const skill = loadSkill();
  const global = Boolean(options.global);
  const planned = targets.map((target) => ({ target, file: pathFor(target, global) }));

  if (!globals.yes && !isAgentMode()) {
    out.line();
    out.info(`This writes the Cefense skill into ${planned.length === 1 ? "one file" : `${planned.length} files`}.`);
    out.line();
    for (const entry of planned) {
      out.line(`    ${c.cyan(display(entry.file))}   ${c.dim(entry.target.label)}`);
    }
    out.line();
    const proceed = await confirm({
      message: "Write them?",
      initialValue: true,
      assumeYes: globals.yes,
    });
    if (!proceed) {
      out.line();
      out.info("Nothing written.");
      out.line();
      return 0;
    }
  }

  const changes: Change[] = [];
  const reference = join(root(), REFERENCE_PATH);
  let referenceAction: Action | null = null;

  for (const { target, file } of planned) {
    if (target.kind === "file") {
      changes.push({
        target: target.id,
        path: display(file),
        action: write(file, renderFor(target, skill)),
      });
      continue;
    }

    if (referenceAction === null && !global) {
      referenceAction = write(reference, renderFor({ ...target, header: undefined }, skill));
    }
    const pointer = global ? "https://cefense.com/skill.md" : REFERENCE_PATH;
    const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
    changes.push({
      target: target.id,
      path: display(file),
      action: write(file, spliceBlock(existing, renderBlock(pointer))),
    });
  }

  if (referenceAction) {
    changes.push({ target: "reference", path: REFERENCE_PATH, action: referenceAction });
  }

  if (isAgentMode()) {
    out.agentEmit({ root: root(), global, changes }, ["cf status --agent"]);
    return 0;
  }

  out.line();
  for (const change of changes) {
    if (change.action === "unchanged") out.line(`  ${c.dim(glyph.ring)} ${change.path} ${c.dim("already current")}`);
    else out.success(`${change.path}   ${c.dim(change.action)}`);
  }
  out.line();
  out.info("Your coding agent will pick this up on its next session.");
  out.line();
  return 0;
}

export async function skillUninstall(
  globals: GlobalOptions,
  names: string[],
  options: { all?: boolean; global?: boolean } = {},
): Promise<number> {
  const targets = names.length === 0 && !options.all ? TARGETS : resolveTargets(names, options);
  const global = Boolean(options.global);
  const base = global ? homedir() : root();
  const changes: Change[] = [];

  for (const target of targets) {
    if (global && !target.globalPath) continue;
    const file = pathFor(target, global);

    if (target.kind === "file") {
      if (!existsSync(file)) {
        changes.push({ target: target.id, path: display(file), action: "absent" });
        continue;
      }
      rmSync(file, { force: true });
      pruneEmpty(file, base);
      changes.push({ target: target.id, path: display(file), action: "removed" });
      continue;
    }

    const stripped = existsSync(file) ? removeBlock(readFileSync(file, "utf8")) : null;
    if (stripped === null) {
      changes.push({ target: target.id, path: display(file), action: "absent" });
      continue;
    }
    if (stripped.trim()) writeFileSync(file, stripped, { mode: 0o644 });
    else rmSync(file, { force: true });
    changes.push({ target: target.id, path: display(file), action: "removed" });
  }

  const reference = join(root(), REFERENCE_PATH);
  const stillPointed = TARGETS.some(
    (target) => target.kind === "block" && hasBlock(join(root(), target.path)),
  );
  if (!global && !stillPointed && existsSync(reference)) {
    rmSync(reference, { force: true });
    pruneEmpty(reference, root());
    changes.push({ target: "reference", path: REFERENCE_PATH, action: "removed" });
  }

  const removed = changes.filter((change) => change.action === "removed");

  if (isAgentMode()) {
    out.agentEmit({ root: root(), global, changes });
    return 0;
  }

  out.line();
  if (removed.length === 0) {
    out.info("The Cefense skill was not installed here.");
  } else {
    for (const change of removed) {
      const kind = TARGETS.find((entry) => entry.id === change.target)?.kind;
      out.success(`${change.path}   ${c.dim(kind === "block" ? "section removed" : "removed")}`);
    }
  }
  out.line();
  return 0;
}

export async function skillList(globals: GlobalOptions): Promise<number> {
  const rows = TARGETS.map((target) => ({
    target,
    detected: detected(target),
    installed: installed(target, false),
  }));

  if (isAgentMode()) {
    out.agentEmit(
      {
        root: root(),
        targets: rows.map((row) => ({
          id: row.target.id,
          label: row.target.label,
          path: row.target.path,
          userWide: Boolean(row.target.globalPath),
          detected: row.detected,
          installed: row.installed,
        })),
      },
      ["cf skill install --agent"],
    );
    return 0;
  }

  if (out.isJsonMode()) {
    out.json(
      rows.map((row) => ({
        id: row.target.id,
        label: row.target.label,
        path: row.target.path,
        detected: row.detected,
        installed: row.installed,
      })),
    );
    return 0;
  }

  out.heading("Cefense skill", root());
  out.lines(
    renderTable(
      rows,
      [
        { header: "agent", value: (row) => row.target.id, min: 12 },
        { header: "writes", value: (row) => c.dim(row.target.path), min: 24 },
        {
          header: "here",
          value: (row) =>
            row.installed
              ? c.green(`${glyph.check} installed`)
              : row.detected
                ? c.yellow("detected")
                : c.dim(""),
          min: 12,
        },
      ],
      { width: terminalWidth() - 4 },
    ).map((line) => `  ${line}`),
  );
  out.line();
  out.info("Install into every agent detected here");
  out.line(`    ${c.dim("cf skill install")}`);
  out.line();
  return 0;
}

export async function skillShow(globals: GlobalOptions, name?: string): Promise<number> {
  const skill = loadSkill();
  const target = name ? resolveTargets([name], {})[0] : undefined;
  const markdown = target ? renderFor(target, skill) : renderFor({ ...TARGETS[0]!, header: undefined }, skill);

  if (isAgentMode()) {
    out.agentEmit({ target: target?.id ?? null, name: skill.name, description: skill.description, markdown });
    return 0;
  }

  process.stdout.write(markdown);
  return 0;
}
