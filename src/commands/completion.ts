import type { Command } from "commander";
import { UsageError } from "../core/errors.js";

export const SHELLS = ["bash", "zsh", "fish"] as const;
export type Shell = (typeof SHELLS)[number];

interface Node {
  path: string[];
  subs: Array<{ name: string; description: string }>;
  flags: string[];
}

function optionsOf(command: Command): string[] {
  return command.options
    .map((option) => option.long)
    .filter((long): long is string => Boolean(long));
}

function walk(command: Command, path: string[], acc: Node[]): Node[] {
  const subs = command.commands
    .filter((entry) => !entry.name().startsWith("_"))
    .map((entry) => ({
      name: entry.name(),
      description: entry.description().replace(/'/g, "").replace(/:/g, " -"),
    }));
  acc.push({ path, subs, flags: optionsOf(command) });
  for (const entry of command.commands) walk(entry, [...path, entry.name()], acc);
  return acc;
}

function bash(program: Command, names: string[]): string {
  const nodes = walk(program, [], []);
  const arms = nodes
    .map((node) => {
      const words = [...node.subs.map((sub) => sub.name), ...node.flags].join(" ");
      if (!words) return "";
      return `    "${node.path.join(" ")}") __cf_words="${words}" ;;`;
    })
    .filter(Boolean)
    .join("\n");

  return `_cf_completion() {
  local cur line __cf_words
  cur="\${COMP_WORDS[COMP_CWORD]}"
  line="\${COMP_WORDS[*]:1:COMP_CWORD-1}"
  case "$line" in
${arms}
    *) __cf_words="" ;;
  esac
  COMPREPLY=( $(compgen -W "$__cf_words" -- "$cur") )
}
${names.map((name) => `complete -F _cf_completion ${name}`).join("\n")}
`;
}

function zsh(program: Command, names: string[]): string {
  const nodes = walk(program, [], []);
  const arms = nodes
    .map((node) => {
      const subs = node.subs.map((sub) => `'${sub.name}:${sub.description}'`).join(" ");
      const flags = node.flags.map((flag) => `'${flag}'`).join(" ");
      const body = [
        subs ? `local -a cmds\n      cmds=(${subs})\n      _describe 'command' cmds` : "",
        flags ? `local -a opts\n      opts=(${flags})\n      _describe 'option' opts` : "",
      ]
        .filter(Boolean)
        .join("\n      ");
      if (!body) return "";
      return `    "${node.path.join(" ")}")\n      ${body}\n      ;;`;
    })
    .filter(Boolean)
    .join("\n");

  return `#compdef ${names.join(" ")}
_cf_completion() {
  local line
  line="\${(j: :)words[2,CURRENT-1]}"
  case "$line" in
${arms}
  esac
}
compdef _cf_completion ${names.join(" ")}
`;
}

function fish(program: Command, names: string[]): string {
  const nodes = walk(program, [], []);
  const out: string[] = [];
  for (const name of names) {
    for (const node of nodes) {
      const condition =
        node.path.length === 0
          ? "__fish_use_subcommand"
          : `__fish_seen_subcommand_from ${node.path[node.path.length - 1]}`;
      for (const sub of node.subs) {
        out.push(
          `complete -c ${name} -n "${condition}" -a "${sub.name}" -d "${sub.description.replace(/"/g, "")}"`,
        );
      }
      for (const flag of node.flags) {
        out.push(`complete -c ${name} -n "${condition}" -l "${flag.replace(/^--/, "")}"`);
      }
    }
  }
  return `${out.join("\n")}\n`;
}

export function completionScript(program: Command, shell: string, names: string[]): string {
  switch (shell) {
    case "bash":
      return bash(program, names);
    case "zsh":
      return zsh(program, names);
    case "fish":
      return fish(program, names);
    default:
      throw new UsageError(
        `${shell} is not a shell the CLI can generate completions for.`,
        `Use ${SHELLS.join(", ")}.`,
        "unknown_shell",
      );
  }
}
