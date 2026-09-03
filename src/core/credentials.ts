import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { credentialsFilePath, ensureDataDir, removeCredentialsFile } from "./config.js";
import type { StoredCredentials } from "./types.js";

const SERVICE = "cefense-cli";

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
  writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    return;
  }
}

export function credentialsFromEnvironment(apiUrl: string): StoredCredentials | null {
  const token = process.env.CEFENSE_TOKEN?.trim();
  if (!token) return null;
  return {
    accessToken: token,
    refreshToken: null,
    expiresAt: null,
    subject: null,
    email: null,
    clientId: "",
    issuer: apiUrl,
  };
}

export async function loadCredentials(apiUrl: string): Promise<CredentialState> {
  const fromEnvironment = credentialsFromEnvironment(apiUrl);
  if (fromEnvironment) return { credentials: fromEnvironment, backend: "environment" };

  const keyring = await loadKeyring();
  if (keyring) {
    try {
      const stored = parse(new keyring.Entry(SERVICE, apiUrl).getPassword());
      if (stored) return { credentials: stored, backend: "keychain" };
    } catch {
      void 0;
    }
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
