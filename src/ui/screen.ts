import { isAgentMode } from "./mode.js";
const ESC = String.fromCharCode(27);
const CTRL_C = String.fromCharCode(3);
const CTRL_D = String.fromCharCode(4);
const DELETE = String.fromCharCode(127);
const CSI = ESC + "[";

export interface Key {
  name: string;
  sequence: string;
  ctrl: boolean;
  printable: string | null;
}

export const ansi = {
  altScreenOn: CSI + "?1049h",
  altScreenOff: CSI + "?1049l",
  hideCursor: CSI + "?25l",
  showCursor: CSI + "?25h",
  clear: CSI + "2J" + CSI + "H",
  home: CSI + "H",
  clearBelow: CSI + "0J",
};

export function write(value: string): void {
  process.stdout.write(value);
}

const NAMED_SEQUENCES: Record<string, string> = {
  A: "up",
  B: "down",
  C: "right",
  D: "left",
  H: "home",
  F: "end",
  Z: "shift-tab",
  "5~": "pageup",
  "6~": "pagedown",
  "1~": "home",
  "4~": "end",
  "3~": "delete",
};

export function parseKey(sequence: string): Key {
  const base = { sequence, ctrl: false, printable: null as string | null };

  if (sequence === CTRL_C) return { ...base, name: "ctrl-c", ctrl: true };
  if (sequence === CTRL_D) return { ...base, name: "ctrl-d", ctrl: true };
  if (sequence === "\r" || sequence === "\n") return { ...base, name: "enter" };
  if (sequence === "\t") return { ...base, name: "tab" };
  if (sequence === DELETE || sequence === "\b") return { ...base, name: "backspace" };
  if (sequence === " ") return { ...base, name: "space", printable: " " };
  if (sequence === ESC) return { ...base, name: "escape" };

  if (sequence.startsWith(CSI) || sequence.startsWith(ESC + "O")) {
    return { ...base, name: NAMED_SEQUENCES[sequence.slice(2)] ?? "unknown" };
  }

  if (sequence.length === 1) {
    const code = sequence.charCodeAt(0);
    if (code < 32) return { ...base, name: "ctrl-" + String.fromCharCode(code + 96), ctrl: true };
    return { ...base, name: sequence.toLowerCase(), printable: sequence };
  }

  return { ...base, name: "unknown" };
}

export interface InputSession {
  close(): void;
}

const SEQUENCE_PATTERN = new RegExp("^" + ESC + "(?:\\[[0-9;]*[A-Za-z~]|O[A-Za-z])");

export function readKeys(handler: (key: Key) => void): InputSession {
  const stdin = process.stdin;
  const wasRaw = Boolean(stdin.isRaw);
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  const onData = (chunk: string) => {
    let index = 0;
    while (index < chunk.length) {
      let sequence: string;
      if (chunk[index] === ESC) {
        const match = chunk.slice(index).match(SEQUENCE_PATTERN);
        sequence = match ? match[0] : ESC;
      } else {
        sequence = chunk[index]!;
      }
      handler(parseKey(sequence));
      index += sequence.length;
    }
  };

  stdin.on("data", onData);

  return {
    close() {
      stdin.removeListener("data", onData);
      if (stdin.isTTY) stdin.setRawMode(wasRaw);
      stdin.pause();
    },
  };
}

let exitHookInstalled = false;
let active = false;

export function enterFullScreen(): void {
  if (active) return;
  active = true;
  write(ansi.altScreenOn + ansi.hideCursor + ansi.clear);
  if (!exitHookInstalled) {
    exitHookInstalled = true;
    process.on("exit", exitFullScreen);
  }
}

export function exitFullScreen(): void {
  if (!active) return;
  active = false;
  write(ansi.showCursor + ansi.altScreenOff);
}

export function isFullScreen(): boolean {
  return active;
}

export function paint(lines: string[]): void {
  const rows = process.stdout.rows ?? lines.length;
  write(ansi.home + ansi.clearBelow + lines.slice(0, rows).join("\n"));
}

export function isInteractive(): boolean {
  if (isAgentMode()) return false;
  return Boolean(process.stdout.isTTY && process.stdin.isTTY);
}
