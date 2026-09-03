import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CliConfigResponse } from "./types.js";

export const DEFAULT_API_URL = "https://cefense.com";

export interface CliPreferences {
  apiUrl?: string;
  colour?: boolean;
}

export interface RepoDefault {
  githubRepoId: string;
  fullName: string;
}

const DISCOVERY_TTL_MS = 5 * 60_000;

export function dataDir(): string {
  return join(homedir(), ".cefense-cli");
}

export function ensureDataDir(): string {
  const dir = dataDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function filePath(name: string): string {
  return join(dataDir(), name);
}

function readJson<T>(name: string): T | null {
  try {
    return JSON.parse(readFileSync(filePath(name), "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJson(name: string, value: unknown, mode = 0o600): void {
  ensureDataDir();
  writeFileSync(filePath(name), `${JSON.stringify(value, null, 2)}\n`, { mode });
}

export function readPreferences(): CliPreferences {
  return readJson<CliPreferences>("config.json") ?? {};
}

export function writePreferences(preferences: CliPreferences): void {
  writeJson("config.json", preferences);
}

export function normaliseApiUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return new URL(withScheme).origin;
}

export function resolveApiUrl(flag?: string): string {
  const candidate = flag ?? process.env.CEFENSE_API_URL ?? readPreferences().apiUrl ?? DEFAULT_API_URL;
  return normaliseApiUrl(candidate);
}

type DefaultsFile = Record<string, RepoDefault>;

export function readRepoDefault(scope: string): RepoDefault | null {
  return (readJson<DefaultsFile>("defaults.json") ?? {})[scope] ?? null;
}

export function writeRepoDefault(scope: string, value: RepoDefault): void {
  const all = readJson<DefaultsFile>("defaults.json") ?? {};
  all[scope] = value;
  writeJson("defaults.json", all);
}

export function clearRepoDefault(scope: string): boolean {
  const all = readJson<DefaultsFile>("defaults.json") ?? {};
  if (!(scope in all)) return false;
  delete all[scope];
  writeJson("defaults.json", all);
  return true;
}

interface DiscoveryCache {
  [apiUrl: string]: { fetchedAt: number; config: CliConfigResponse };
}

export function readCachedDiscovery(apiUrl: string): CliConfigResponse | null {
  const entry = (readJson<DiscoveryCache>("discovery.json") ?? {})[apiUrl];
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > DISCOVERY_TTL_MS) return null;
  return entry.config;
}

export function writeCachedDiscovery(apiUrl: string, config: CliConfigResponse): void {
  const all = readJson<DiscoveryCache>("discovery.json") ?? {};
  all[apiUrl] = { fetchedAt: Date.now(), config };
  writeJson("discovery.json", all);
}

export function credentialsFilePath(): string {
  return filePath("credentials.json");
}

export function removeCredentialsFile(): void {
  try {
    rmSync(credentialsFilePath(), { force: true });
  } catch {
    return;
  }
}
