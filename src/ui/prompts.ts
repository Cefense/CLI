import * as clack from "@clack/prompts";
import { CancelledError, UsageError } from "../core/errors.js";
import { isInteractive } from "./screen.js";
import { createSpinner, type Spinner } from "./spinner.js";

export function requireInteractive(what: string, flagHint: string): void {
  if (isInteractive()) return;
  throw new UsageError(`${what} needs an interactive terminal.`, flagHint);
}

function unwrap<T>(value: T | symbol): T {
  if (clack.isCancel(value)) throw new CancelledError();
  return value as T;
}

export interface Choice {
  value: string;
  label: string;
  hint?: string;
}

export async function select(options: {
  message: string;
  choices: Choice[];
  initialValue?: string;
}): Promise<string> {
  requireInteractive(options.message, "Pass the value as an argument instead.");
  return unwrap(
    await clack.select<string>({
      message: options.message,
      options: options.choices,
      initialValue: options.initialValue,
    }),
  );
}

export async function multiselect(options: {
  message: string;
  choices: Choice[];
  initialValues?: string[];
  required?: boolean;
}): Promise<string[]> {
  requireInteractive(options.message, "Pass the values as arguments instead.");
  return unwrap(
    await clack.multiselect<string>({
      message: options.message,
      options: options.choices,
      initialValues: options.initialValues ?? [],
      required: options.required ?? false,
    }),
  );
}

export async function confirm(options: {
  message: string;
  initialValue?: boolean;
  assumeYes?: boolean;
}): Promise<boolean> {
  if (options.assumeYes) return true;
  requireInteractive(options.message, "Pass --yes to confirm without prompting.");
  return unwrap(
    await clack.confirm({ message: options.message, initialValue: options.initialValue ?? false }),
  );
}

export async function text(options: {
  message: string;
  placeholder?: string;
  initialValue?: string;
  validate?: (value: string) => string | undefined;
}): Promise<string> {
  requireInteractive(options.message, "Pass the value as an argument instead.");
  return unwrap(
    await clack.text({
      message: options.message,
      placeholder: options.placeholder,
      initialValue: options.initialValue,
      validate: options.validate
        ? (value) => options.validate!(String(value ?? ""))
        : undefined,
    }),
  );
}

export async function confirmByTyping(options: {
  message: string;
  expected: string;
  assumeYes?: boolean;
}): Promise<boolean> {
  if (options.assumeYes) return true;
  requireInteractive(options.message, "Pass --yes to confirm without prompting.");
  const answer = await text({
    message: options.message,
    placeholder: options.expected,
  });
  return answer.trim() === options.expected;
}

export function spinner(): Spinner {
  return createSpinner();
}

export const intro = (message: string) => {
  if (isInteractive()) clack.intro(message);
};

export const outro = (message: string) => {
  if (isInteractive()) clack.outro(message);
};

export const note = (body: string, title?: string) => {
  if (isInteractive()) clack.note(body, title);
  else process.stdout.write(`${body}\n`);
};
