import { isAgentMode } from "./mode.js";

export function write(value: string): void {
  process.stdout.write(value);
}

export function isInteractive(): boolean {
  if (isAgentMode()) return false;
  return Boolean(process.stdout.isTTY && process.stdin.isTTY);
}
