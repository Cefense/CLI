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
    if (cached?.auth) {
      assertDiscoveryTrustworthy(apiUrl, cached);
      return cached;
    }
  }

  let response: Response;
  try {
    response = await fetch(`${apiUrl}/api/cli/config`, {
      headers: { accept: "application/json", "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (cause) {
    throw new CefenseError(`Could not reach the Cefense API at ${apiUrl}.`, {
      remedy: "Check your connection, or set CEFENSE_API_URL to point somewhere else.",
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
  assertDiscoveryTrustworthy(apiUrl, config);
  writeCachedDiscovery(apiUrl, config);
  return config;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function endpointHost(apiUrl: string, field: string, value: string | undefined): string {
  let url: URL;
  try {
    url = new URL(String(value));
  } catch {
    throw new CefenseError(`The Cefense API at ${apiUrl} returned an unusable ${field}.`, {
      remedy: "Confirm the URL points at a Cefense deployment.",
      code: "untrusted_discovery",
    });
  }
  const loopback = LOOPBACK_HOSTS.has(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new CefenseError(`The ${field} advertised by ${apiUrl} is not https.`, {
      remedy: "A sign-in that is not over https would put the authorization code on the wire in clear.",
      code: "untrusted_discovery",
    });
  }
  return url.host;
}

function sameSite(host: string, expected: string): boolean {
  return host === expected || host.endsWith(`.${expected}`);
}

export function assertDiscoveryTrustworthy(apiUrl: string, config: CliConfigResponse): void {
  const expected = new URL(apiUrl).host;
  const { auth } = config;

  if (auth.codeChallengeMethod !== "S256") {
    throw new CefenseError(
      `The Cefense API at ${apiUrl} asked for the ${auth.codeChallengeMethod || "plain"} PKCE method.`,
      {
        remedy: "Only S256 is accepted, because plain leaves the verifier readable in the request.",
        code: "untrusted_discovery",
      },
    );
  }

  const fields: Array<[string, string | undefined]> = [
    ["issuer", auth.issuer],
    ["authorization endpoint", auth.authorizationEndpoint],
    ["token endpoint", auth.tokenEndpoint],
    ["revocation endpoint", auth.revocationEndpoint],
  ];

  for (const [field, value] of fields) {
    if (field === "revocation endpoint" && !value) continue;
    const host = endpointHost(apiUrl, field, value);
    if (!sameSite(host, expected)) {
      throw new CefenseError(
        `The ${field} advertised by ${apiUrl} points at ${host}.`,
        {
          remedy: `Sign-in only happens against ${expected} or a subdomain of it. Nothing was sent to ${host}.`,
          code: "untrusted_discovery",
        },
      );
    }
  }
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
