import { CefenseError } from "./errors.js";
import { readCachedDiscovery, writeCachedDiscovery } from "./config.js";
import { USER_AGENT, VERSION } from "../version.js";
import type { CliConfigResponse } from "./types.js";

function compareVersions(left: string, right: string): number {
  const parse = (value: string) =>
    value
      .split("-")[0]!
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

export async function fetchDiscovery(
  apiUrl: string,
  options: { refresh?: boolean } = {},
): Promise<CliConfigResponse> {
  if (!options.refresh) {
    const cached = readCachedDiscovery(apiUrl);
    if (cached) return cached;
  }

  let response: Response;
  try {
    response = await fetch(`${apiUrl}/api/cli/config`, {
      headers: { accept: "application/json", "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (cause) {
    throw new CefenseError(`Could not reach the Cefense API at ${apiUrl}.`, {
      remedy: "Check your connection, or point somewhere else with --api-url.",
      cause,
    });
  }

  if (response.status === 503) {
    throw new CefenseError("The Cefense CLI is not configured on this instance.", {
      remedy: `Ask an operator to set CEFENSE_CLI_OAUTH_CLIENT_ID on ${apiUrl}.`,
    });
  }
  if (!response.ok) {
    throw new CefenseError(`The Cefense API at ${apiUrl} returned ${response.status} for /api/cli/config.`, {
      remedy: "Confirm the URL points at a Cefense deployment.",
    });
  }

  const config = (await response.json()) as CliConfigResponse;
  if (!config?.auth?.clientId || !config.auth.authorizationEndpoint) {
    throw new CefenseError(`The Cefense API at ${apiUrl} returned an unusable CLI configuration.`);
  }
  writeCachedDiscovery(apiUrl, config);
  return config;
}

export function assertVersionSupported(config: CliConfigResponse): void {
  if (!config.minimumCliVersion) return;
  if (compareVersions(VERSION, config.minimumCliVersion) >= 0) return;
  throw new CefenseError(
    `This Cefense deployment requires CLI ${config.minimumCliVersion} or newer, and this is ${VERSION}.`,
    { remedy: "Upgrade with npm install -g cefense@latest." },
  );
}

export { compareVersions };
