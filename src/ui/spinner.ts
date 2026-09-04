import { c } from "./theme.js";
import { isInteractive } from "./screen.js";
import { isAgentMode } from "./mode.js";

const ESC = String.fromCharCode(27);
const CLEAR_LINE = `${ESC}[2K${ESC}[1G`;
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;

const TRACK = 7;
const FRAME_MS = 90;

function sweepFrames(): string[] {
  const frames: string[] = [];
  const positions = [...Array(TRACK).keys(), ...[...Array(TRACK).keys()].reverse().slice(1, -1)];
  for (const head of positions) {
    let frame = "";
    for (let index = 0; index < TRACK; index += 1) {
      const distance = Math.abs(index - head);
      if (distance === 0) frame += c.cyan("▰");
      else if (distance === 1) frame += c.dim(c.cyan("▰"));
      else frame += c.dim("▱");
    }
    frames.push(frame);
  }
  return frames;
}

export type SpinnerTone = "ok" | "warn" | "fail" | "none";

export interface Spinner {
  start(message?: string): void;
  message(value: string): void;
  stop(message?: string, tone?: SpinnerTone): void;
}

function toneMark(tone: SpinnerTone): string {
  if (tone === "ok") return `${c.green("\u2713")} `;
  if (tone === "warn") return `${c.yellow("!")} `;
  if (tone === "fail") return `${c.red("\u2717")} `;
  return "";
}

export function createSpinner(): Spinner {
  if (isAgentMode()) {
    return { start() {}, message() {}, stop() {} };
  }

  if (!isInteractive()) {
    let last = "";
    return {
      start(message) {
        if (message) process.stderr.write(`  ${message}\n`);
      },
      message(value) {
        last = value;
      },
      stop(message, tone = "ok") {
        const final = message ?? last;
        if (final) process.stderr.write(`  ${toneMark(tone)}${final}\n`);
      },
    };
  }

  const frames = sweepFrames();
  let index = 0;
  let text = "";
  let timer: NodeJS.Timeout | null = null;
  let running = false;

  const draw = () => {
    process.stderr.write(`${CLEAR_LINE}  ${frames[index % frames.length]}  ${text}`);
    index += 1;
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
      timer = setInterval(draw, FRAME_MS);
      timer.unref();
    },
    message(value) {
      text = value;
      if (!running) return;
      draw();
    },
    stop(message, tone = "ok") {
      cleanup();
      process.stderr.write(`${CLEAR_LINE}${SHOW_CURSOR}`);
      if (message) process.stderr.write(`  ${toneMark(tone)}${message}\n`);
    },
  };
}
