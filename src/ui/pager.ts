import { spawnSync } from "node:child_process";
import { terminalHeight } from "./format.js";
import { isAgentMode } from "./mode.js";
import { isPiped, lines } from "./output.js";

let enabled = true;

export function setPagerEnabled(value: boolean): void {
  enabled = value;
}

function pagerCommand(): string[] | null {
  const raw = (process.env.CEFENSE_PAGER ?? process.env.PAGER ?? "less -FIRX").trim();
  if (!raw || raw === "cat") return null;
  const parts = raw.split(/\s+/);
  return parts.length > 0 ? parts : null;
}

export function page(content: string[]): void {
  if (!enabled || isAgentMode() || isPiped() || content.length < terminalHeight() - 1) {
    lines(content);
    return;
  }

  const command = pagerCommand();
  if (!command) {
    lines(content);
    return;
  }

  const result = spawnSync(command[0]!, command.slice(1), {
    input: `${content.join("\n")}\n`,
    stdio: ["pipe", "inherit", "inherit"],
    env: { ...process.env, LESSCHARSET: "utf-8" },
  });

  if (result.error) lines(content);
}
