export const EXIT_OK = 0;
export const EXIT_FINDINGS = 1;
export const EXIT_USAGE = 2;
export const EXIT_AUTH = 3;
export const EXIT_API = 4;
export const EXIT_INTERRUPTED = 130;

export class CefenseError extends Error {
  readonly remedy: string | null;
  readonly exitCode: number;
  override readonly cause: unknown;

  constructor(
    message: string,
    options: { remedy?: string | null; exitCode?: number; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "CefenseError";
    this.remedy = options.remedy ?? null;
    this.exitCode = options.exitCode ?? EXIT_API;
    this.cause = options.cause;
  }
}

export class AuthRequiredError extends CefenseError {
  constructor(message = "You are not signed in.", remedy = "Run cf auth login.") {
    super(message, { remedy, exitCode: EXIT_AUTH });
    this.name = "AuthRequiredError";
  }
}

export class UsageError extends CefenseError {
  constructor(message: string, remedy?: string) {
    super(message, { remedy: remedy ?? null, exitCode: EXIT_USAGE });
    this.name = "UsageError";
  }
}

export class CancelledError extends CefenseError {
  constructor(message = "Cancelled.") {
    super(message, { exitCode: EXIT_INTERRUPTED });
    this.name = "CancelledError";
  }
}

export class FeatureRequiredError extends CefenseError {
  readonly feature: string;

  constructor(feature: string, pricingUrl: string | null, webUrl: string) {
    super(`The ${feature} feature pack is required.`, {
      remedy: `Unlock it at ${pricingUrl ? new URL(pricingUrl, webUrl).toString() : `${webUrl}/pricing`}, or run cf billing upgrade ${feature}.`,
      exitCode: EXIT_API,
    });
    this.name = "FeatureRequiredError";
    this.feature = feature;
  }
}

export function isCefenseError(value: unknown): value is CefenseError {
  return value instanceof CefenseError;
}

export function messageOf(value: unknown): string {
  if (value instanceof Error) return value.message;
  return String(value);
}
