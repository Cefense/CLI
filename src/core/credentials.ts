import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import {
  DEFAULT_API_URL,
  credentialsFilePath,
  ensureDataDir,
  normaliseApiUrl,
  removeCredentialsFile,
} from "./config.js";
import { CefenseError } from "./errors.js";
import type { CliConfigResponse, StoredCredentials } from "./types.js";

const SERVICE = "cefense-cli";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function assertCredentialOrigin(apiUrl: string): string {
  let url: URL;
  try {
    url = new URL(apiUrl);
  } catch {
    throw new CefenseError(`${apiUrl} is not a URL Cefense can send a token to.`, {
      remedy: "Set CEFENSE_API_URL to a full https URL.",
      code: "insecure_api_url",
    });
  }
  if (url.protocol === "https:") return url.origin;
  if (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)) return url.origin;
  throw new CefenseError(`Cefense will not send your token to ${url.origin}.`, {
    remedy:
      "Credentials are only sent over https, or over http to localhost. Point CEFENSE_API_URL at an https origin.",
    code: "insecure_api_url",
  });
}

function environmentTokenOrigin(): string {
  const declared =
    process.env.CEFENSE_TOKEN_ORIGIN?.trim() || process.env.CEFENSE_API_URL?.trim() || DEFAULT_API_URL;
  try {
    return assertCredentialOrigin(normaliseApiUrl(declared));
  } catch (error) {
    if (error instanceof CefenseError) throw error;
    throw new CefenseError(`CEFENSE_TOKEN_ORIGIN is not a URL: ${declared}.`, {
      remedy: "Set it to the https origin the token was issued for.",
      code: "insecure_api_url",
    });
  }
}

function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export type CredentialBackend = "keychain" | "file" | "environment" | "none";

export interface CredentialState {
  credentials: StoredCredentials | null;
  backend: CredentialBackend;
}

interface KeyringEntry {
  getPassword(): string | null;
  setPassword(password: string): void;
  deletePassword(): boolean;
}

let keyringModule: { Entry: new (service: string, account: string) => KeyringEntry } | null | undefined;

async function loadKeyring() {
  if (keyringModule !== undefined) return keyringModule;
  try {
    keyringModule = (await import("@napi-rs/keyring")) as unknown as {
      Entry: new (service: string, account: string) => KeyringEntry;
    };
  } catch {
    keyringModule = null;
  }
  return keyringModule;
}

export function keychainName(): string {
  if (process.platform === "darwin") return "the macOS Keychain";
  if (process.platform === "win32") return "Windows Credential Manager";
  return "the system keyring";
}

function parse(raw: string | null | undefined): StoredCredentials | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as StoredCredentials;
    return typeof value?.accessToken === "string" ? value : null;
  } catch {
    return null;
  }
}

type FileStore = Record<string, StoredCredentials>;

function readFileStore(): FileStore {
  try {
    if (!existsSync(credentialsFilePath())) return {};
    return JSON.parse(readFileSync(credentialsFilePath(), "utf8")) as FileStore;
  } catch {
    return {};
  }
}

function writeFileStore(store: FileStore): void {
  ensureDataDir();
  const path = credentialsFilePath();
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, path);
  try {
    chmodSync(path, 0o600);
  } catch {
    return;
  }
}

export function credentialsFromEnvironment(apiUrl: string): StoredCredentials | null {
  const token = process.env.CEFENSE_TOKEN?.trim();
  if (!token) return null;
  const target = assertCredentialOrigin(apiUrl);
  const issued = environmentTokenOrigin();
  if (issued !== target) {
    throw new CefenseError(`CEFENSE_TOKEN was issued for ${issued}, not ${target}.`, {
      remedy: `Set CEFENSE_TOKEN_ORIGIN to ${target} if the token really belongs there, or unset CEFENSE_API_URL.`,
      code: "token_origin_mismatch",
    });
  }
  return {
    accessToken: token,
    refreshToken: null,
    expiresAt: null,
    subject: null,
    email: null,
    clientId: "",
    issuer: target,
  };
}

export function assertIssuerMatches(
  credentials: StoredCredentials | null,
  config: CliConfigResponse,
): void {
  if (!credentials?.issuer) return;
  const stored = originOf(credentials.issuer);
  const expected = originOf(config.auth.issuer);
  if (!stored || !expected || stored === expected) return;
  throw new CefenseError(
    `The stored token was issued by ${stored}, but this instance now signs in with ${expected}.`,
    {
      remedy: "Run cf auth login --force to sign in again.",
      code: "token_issuer_changed",
    },
  );
}

export async function loadCredentialsOrNone(apiUrl: string): Promise<CredentialState> {
  try {
    return await loadCredentials(apiUrl);
  } catch {
    return { credentials: null, backend: "none" };
  }
}

export async function loadCredentials(apiUrl: string): Promise<CredentialState> {
  assertCredentialOrigin(apiUrl);

  const fromEnvironment = credentialsFromEnvironment(apiUrl);
  if (fromEnvironment) return { credentials: fromEnvironment, backend: "environment" };

  const keyring = await loadKeyring();
  if (keyring) {
    let stored: StoredCredentials | null = null;
    try {
      stored = parse(new keyring.Entry(SERVICE, apiUrl).getPassword());
    } catch {
      stored = null;
    }
    if (stored) return { credentials: stored, backend: "keychain" };
  }

  const stored = readFileStore()[apiUrl] ?? null;
  if (stored) return { credentials: stored, backend: "file" };
  return { credentials: null, backend: "none" };
}

export interface SaveResult {
  backend: CredentialBackend;
  warning: string | null;
}

export async function saveCredentials(
  apiUrl: string,
  credentials: StoredCredentials,
): Promise<SaveResult> {
  assertCredentialOrigin(apiUrl);
  const keyring = await loadKeyring();
  if (keyring) {
    try {
      new keyring.Entry(SERVICE, apiUrl).setPassword(JSON.stringify(credentials));
      return { backend: "keychain", warning: null };
    } catch (error) {
      if (process.platform === "win32") {
        throw error;
      }
      const store = readFileStore();
      store[apiUrl] = credentials;
      writeFileStore(store);
      return {
        backend: "file",
        warning: `${keychainName()} was unavailable, so the token was written to ${credentialsFilePath()} with owner-only permissions.`,
      };
    }
  }

  const store = readFileStore();
  store[apiUrl] = credentials;
  writeFileStore(store);
  return {
    backend: "file",
    warning: `No system keyring was available, so the token was written to ${credentialsFilePath()} with owner-only permissions.`,
  };
}

export async function deleteCredentials(apiUrl: string): Promise<void> {
  const keyring = await loadKeyring();
  if (keyring) {
    try {
      new keyring.Entry(SERVICE, apiUrl).deletePassword();
    } catch {
      void 0;
    }
  }
  const store = readFileStore();
  if (apiUrl in store) {
    delete store[apiUrl];
    if (Object.keys(store).length === 0) removeCredentialsFile();
    else writeFileStore(store);
  }
}

export async function listStoredOrigins(): Promise<string[]> {
  return Object.keys(readFileStore());
}
