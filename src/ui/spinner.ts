import { c, toneMark } from "./theme.js";
import { isInteractive } from "./screen.js";
import { isAgentMode } from "./mode.js";
import { sanitizeForTerminal, truncate } from "./format.js";

const ESC = String.fromCharCode(27);
const CLEAR_LINE = `${ESC}[2K${ESC}[1G`;
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const FRAME_MS = 100;

export type SpinnerTone = "ok" | "warn" | "fail" | "none";

export interface Spinner {
  start(message?: string): void;
  message(value: string): void;
  stop(message?: string, tone?: SpinnerTone): void;
}

export function stopLine(message: string, tone: SpinnerTone): string {
  if (tone === "ok") return `${toneMark("done")} ${message}`;
  if (tone === "warn") return `${toneMark("attention")} ${message}`;
  if (tone === "fail") return `${toneMark("failed")} ${message}`;
  return message;
}

function streamWidth(): number {
  const width = process.stderr.columns;
  return typeof width === "number" && width > 20 ? width : 80;
}

export function createSpinner(): Spinner {
  if (isAgentMode()) {
    return { start() {}, message() {}, stop() {} };
  }

  if (!isInteractive()) {
    let last = "";
    return {
      start(message) {
        if (message) process.stderr.write(`${sanitizeForTerminal(message)}\n`);
      },
      message(value) {
        last = value;
      },
      stop(message, tone = "ok") {
        const final = message ?? last;
        if (final) process.stderr.write(`${sanitizeForTerminal(stopLine(final, tone))}\n`);
      },
    };
  }

  let index = 0;
  let text = "";
  let timer: NodeJS.Timeout | null = null;
  let running = false;

  const draw = () => {
    const frame = c.cyan(FRAMES[index % FRAMES.length]!);
    const body = truncate(sanitizeForTerminal(text), streamWidth() - 3);
    process.stderr.write(`${CLEAR_LINE}${frame} ${body}`);
  };

  const tick = () => {
    index += 1;
    draw();
  };

  const cleanup = () => {
    if (timer) clearInterval(timer);
    timer = null;
    running = false;
  };

  process.on("exit", () => {
    if (running) process.stderr.write(`${CLEAR_LINE}${SHOW_CURSOR}`);
  });

  return {
    start(message = "") {
      if (running) return;
      running = true;
      text = message;
      process.stderr.write(HIDE_CURSOR);
      draw();
      timer = setInterval(tick, FRAME_MS);
      timer.unref();
    },
    message(value) {
      text = value;
      if (!running) return;
      draw();
    },
    stop(message, tone = "ok") {
      const wasRunning = running;
      cleanup();
      if (wasRunning) process.stderr.write(`${CLEAR_LINE}${SHOW_CURSOR}`);
      if (message) process.stderr.write(`${sanitizeForTerminal(stopLine(message, tone))}\n`);
    },
  };
}
