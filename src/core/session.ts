import { CefenseClient } from "./client.js";
import { assertVersionSupported, fetchDiscovery } from "./discovery.js";
import { loadCredentials, type CredentialBackend } from "./credentials.js";
import { resolveApiUrl } from "./config.js";
import { AuthRequiredError, CefenseError } from "./errors.js";
import type { CliConfigResponse, StoredCredentials } from "./types.js";

export interface GlobalOptions {
  apiUrl?: string;
  repo?: string;
  json?: boolean;
  color?: boolean;
  verbose?: boolean;
  yes?: boolean;
  noLink?: boolean;
}

export interface Session {
  apiUrl: string;
  config: CliConfigResponse | null;
  credentials: StoredCredentials | null;
  backend: CredentialBackend;
  client: CefenseClient;
}

export async function openSession(
  options: GlobalOptions = {},
  requirements: { auth?: boolean; discovery?: boolean } = {},
): Promise<Session> {
  const apiUrl = resolveApiUrl(options.apiUrl);
  const { credentials, backend } = await loadCredentials(apiUrl);

  let config: CliConfigResponse | null = null;
  if (requirements.discovery !== false) {
    try {
      config = await fetchDiscovery(apiUrl);
      assertVersionSupported(config);
    } catch (error) {
      if (requirements.auth || error instanceof CefenseError === false) throw error;
      config = null;
    }
  }

  if (requirements.auth && !credentials) {
    throw new AuthRequiredError(`You are not signed in to ${apiUrl}.`);
  }

  return {
    apiUrl,
    config,
    credentials,
    backend,
    client: new CefenseClient({ apiUrl, config, credentials }),
  };
}
