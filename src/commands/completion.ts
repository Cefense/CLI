import type { Command } from "commander";
import { UsageError } from "../core/errors.js";
import { isHidden } from "../ui/help.js";

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
    .filter((long): long is string => Boolean(long))
    .concat("--help");
}

function walk(command: Command, path: string[], acc: Node[]): Node[] {
  const commands = command.commands.filter((entry) => !entry.name().startsWith("_") && entry.name() !== "help");
  const subs = commands
    .filter((entry) => !isHidden(entry))
    .map((entry) => ({
      name: entry.name(),
      description: entry.description().replace(/'/g, "").replace(/:/g, " -"),
    }));
  acc.push({ path, subs, flags: optionsOf(command) });
  for (const entry of commands) walk(entry, [...path, entry.name()], acc);
  return acc;
}

function knownPaths(nodes: Node[]): string {
  return `|${nodes
    .filter((node) => node.path.length > 0)
    .map((node) => node.path.join(" "))
    .join("|")}|`;
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
  local cur word candidate path __cf_words
  local __cf_paths="${knownPaths(nodes)}"
  cur="\${COMP_WORDS[COMP_CWORD]}"
  path=""
  for word in "\${COMP_WORDS[@]:1:COMP_CWORD-1}"; do
    case "$word" in -*) continue ;; esac
    if [ -z "$path" ]; then candidate="$word"; else candidate="$path $word"; fi
    case "$__cf_paths" in *"|$candidate|"*) path="$candidate" ;; esac
  done
  case "$path" in
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
  local word candidate line
  local paths="${knownPaths(nodes)}"
  line=""
  for word in "\${(@)words[2,CURRENT-1]}"; do
    [[ "$word" == -* ]] && continue
    if [[ -z "$line" ]]; then candidate="$word"; else candidate="$line $word"; fi
    [[ "$paths" == *"|$candidate|"* ]] && line="$candidate"
  done
  case "$line" in
${arms}
  esac
}
compdef _cf_completion ${names.join(" ")}
`;
}

function fishCondition(path: string[]): string {
  if (path.length === 0) return "__fish_use_subcommand";
  return path.map((part) => `__fish_seen_subcommand_from ${part}`).join("; and ");
}

function fish(program: Command, names: string[]): string {
  const nodes = walk(program, [], []);
  const out: string[] = [];
  for (const name of names) {
    for (const node of nodes) {
      const condition = fishCondition(node.path);
      const childNames = node.subs.map((sub) => sub.name).join(" ");
      const subCondition =
        node.path.length > 0 && childNames
          ? `${condition}; and not __fish_seen_subcommand_from ${childNames}`
          : condition;
      for (const sub of node.subs) {
        out.push(
          `complete -c ${name} -n "${subCondition}" -a "${sub.name}" -d "${sub.description.replace(/"/g, "")}"`,
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
