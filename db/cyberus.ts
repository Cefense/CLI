import { env } from "cloudflare:workers";

export type CyberusPlan = "signal" | "immunity";

export type CyberusProfile = {
  email: string;
  fullName: string | null;
  company: string;
  plan: CyberusPlan;
  stack: string;
  repositoryUrl: string;
  watchlist: string[];
  onboardingComplete: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CyberusFinding = {
  id: string;
  severity: "Critical" | "High" | "Watch" | "Info";
  category: string;
  title: string;
  summary: string;
  file: string;
  line: number | null;
};

export type CyberusScan = {
  id: number;
  repositoryUrl: string;
  repositoryName: string;
  defaultBranch: string;
  fileCount: number;
  sourceFilesChecked: number;
  languages: Array<{ name: string; files: number }>;
  findings: CyberusFinding[];
  createdAt: string;
};

type ProfileRow = {
  email: string;
  full_name: string | null;
  company: string;
  plan: string;
  stack: string;
  repository_url: string;
  watchlist: string;
  onboarding_complete: number;
  created_at: string;
  updated_at: string;
};

type ScanRow = {
  id: number;
  repository_url: string;
  repository_name: string;
  default_branch: string;
  file_count: number;
  source_files_checked: number;
  languages: string;
  findings: string;
  created_at: string;
};

type FallbackStore = {
  profiles: Map<string, CyberusProfile>;
  scans: Map<string, CyberusScan[]>;
  nextScanId: number;
};

declare global {
  var __cyberusFallbackStore: FallbackStore | undefined;
}

const profileSchema = `CREATE TABLE IF NOT EXISTS cyberus_profiles (
  email TEXT PRIMARY KEY NOT NULL,
  full_name TEXT,
  company TEXT NOT NULL DEFAULT '',
  plan TEXT NOT NULL DEFAULT 'signal',
  stack TEXT NOT NULL DEFAULT '',
  repository_url TEXT NOT NULL DEFAULT '',
  watchlist TEXT NOT NULL DEFAULT '[]',
  onboarding_complete INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

const activitySchema = `CREATE TABLE IF NOT EXISTS cyberus_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  owner_email TEXT NOT NULL,
  event_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL
)`;

const activityIndex = "CREATE INDEX IF NOT EXISTS cyberus_activity_owner_idx ON cyberus_activity (owner_email, created_at)";

const scanSchema = `CREATE TABLE IF NOT EXISTS cyberus_scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  owner_email TEXT NOT NULL,
  repository_url TEXT NOT NULL,
  repository_name TEXT NOT NULL,
  default_branch TEXT NOT NULL,
  file_count INTEGER NOT NULL,
  source_files_checked INTEGER NOT NULL,
  languages TEXT NOT NULL DEFAULT '[]',
  findings TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
)`;

const scanIndex = "CREATE INDEX IF NOT EXISTS cyberus_scans_owner_idx ON cyberus_scans (owner_email, created_at)";

export async function ensureCyberusSchema() {
  const d1 = env.DB;
  if (!d1) return null;
  await d1.batch([
    d1.prepare(profileSchema),
    d1.prepare(activitySchema),
    d1.prepare(activityIndex),
    d1.prepare(scanSchema),
    d1.prepare(scanIndex),
  ]);
  return d1;
}

export async function getLatestCyberusScan(email: string): Promise<CyberusScan | null> {
  const d1 = await ensureCyberusSchema();
  if (!d1) return latestFallbackScan(email);
  const row = await d1.prepare("SELECT * FROM cyberus_scans WHERE owner_email = ? ORDER BY id DESC LIMIT 1").bind(email).first<ScanRow>();
  return row ? mapScan(row) : null;
}

export async function saveCyberusScan(input: {
  ownerEmail: string;
  repositoryUrl: string;
  repositoryName: string;
  defaultBranch: string;
  fileCount: number;
  sourceFilesChecked: number;
  languages: Array<{ name: string; files: number }>;
  findings: CyberusFinding[];
}): Promise<CyberusScan> {
  const d1 = await ensureCyberusSchema();
  const createdAt = new Date().toISOString();
  if (!d1) return saveFallbackScan(input, createdAt);
  const result = await d1.prepare(`INSERT INTO cyberus_scans (
    owner_email, repository_url, repository_name, default_branch, file_count,
    source_files_checked, languages, findings, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    input.ownerEmail,
    input.repositoryUrl,
    input.repositoryName,
    input.defaultBranch,
    input.fileCount,
    input.sourceFilesChecked,
    JSON.stringify(input.languages),
    JSON.stringify(input.findings),
    createdAt,
  ).run();

  await d1.prepare("INSERT INTO cyberus_activity (owner_email, event_type, summary, created_at) VALUES (?, ?, ?, ?)")
    .bind(input.ownerEmail, "repository_scanned", `${input.repositoryName} scanned`, createdAt)
    .run();

  const row = await d1.prepare("SELECT * FROM cyberus_scans WHERE id = ? LIMIT 1").bind(result.meta.last_row_id).first<ScanRow>();
  if (!row) throw new Error("Cyberus scan could not be saved.");
  return mapScan(row);
}

export async function getCyberusProfile(email: string): Promise<CyberusProfile | null> {
  const d1 = await ensureCyberusSchema();
  if (!d1) return fallbackStore().profiles.get(email) ?? null;
  const row = await d1.prepare("SELECT * FROM cyberus_profiles WHERE email = ? LIMIT 1").bind(email).first<ProfileRow>();
  return row ? mapProfile(row) : null;
}

export async function saveCyberusProfile(input: {
  email: string;
  fullName: string | null;
  company: string;
  plan: CyberusPlan;
  stack: string;
  repositoryUrl: string;
  watchlist: string[];
  onboardingComplete: boolean;
}): Promise<CyberusProfile> {
  const d1 = await ensureCyberusSchema();
  const now = new Date().toISOString();
  if (!d1) return saveFallbackProfile(input, now);
  await d1.prepare(`INSERT INTO cyberus_profiles (
    email, full_name, company, plan, stack, repository_url, watchlist,
    onboarding_complete, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(email) DO UPDATE SET
    full_name = excluded.full_name,
    company = excluded.company,
    plan = excluded.plan,
    stack = excluded.stack,
    repository_url = excluded.repository_url,
    watchlist = excluded.watchlist,
    onboarding_complete = excluded.onboarding_complete,
    updated_at = excluded.updated_at`).bind(
      input.email,
      input.fullName,
      input.company,
      input.plan,
      input.stack,
      input.repositoryUrl,
      JSON.stringify(input.watchlist),
      input.onboardingComplete ? 1 : 0,
      now,
      now,
    ).run();

  await d1.prepare("INSERT INTO cyberus_activity (owner_email, event_type, summary, created_at) VALUES (?, ?, ?, ?)")
    .bind(input.email, "profile_saved", `${input.plan} onboarding saved`, now)
    .run();

  const profile = await getCyberusProfile(input.email);
  if (!profile) throw new Error("Cyberus profile could not be saved.");
  return profile;
}

function fallbackStore(): FallbackStore {
  globalThis.__cyberusFallbackStore ??= {
    profiles: new Map<string, CyberusProfile>(),
    scans: new Map<string, CyberusScan[]>(),
    nextScanId: 1,
  };
  return globalThis.__cyberusFallbackStore;
}

function saveFallbackProfile(input: {
  email: string;
  fullName: string | null;
  company: string;
  plan: CyberusPlan;
  stack: string;
  repositoryUrl: string;
  watchlist: string[];
  onboardingComplete: boolean;
}, now: string): CyberusProfile {
  const store = fallbackStore();
  const existing = store.profiles.get(input.email);
  const profile: CyberusProfile = {
    email: input.email,
    fullName: input.fullName,
    company: input.company,
    plan: input.plan,
    stack: input.stack,
    repositoryUrl: input.repositoryUrl,
    watchlist: input.watchlist,
    onboardingComplete: input.onboardingComplete,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  store.profiles.set(input.email, profile);
  return profile;
}

function latestFallbackScan(email: string): CyberusScan | null {
  const scans = fallbackStore().scans.get(email);
  return scans?.at(-1) ?? null;
}

function saveFallbackScan(input: {
  ownerEmail: string;
  repositoryUrl: string;
  repositoryName: string;
  defaultBranch: string;
  fileCount: number;
  sourceFilesChecked: number;
  languages: Array<{ name: string; files: number }>;
  findings: CyberusFinding[];
}, createdAt: string): CyberusScan {
  const store = fallbackStore();
  const scan: CyberusScan = {
    id: store.nextScanId,
    repositoryUrl: input.repositoryUrl,
    repositoryName: input.repositoryName,
    defaultBranch: input.defaultBranch,
    fileCount: input.fileCount,
    sourceFilesChecked: input.sourceFilesChecked,
    languages: input.languages,
    findings: input.findings,
    createdAt,
  };
  store.nextScanId += 1;
  const scans = store.scans.get(input.ownerEmail) ?? [];
  scans.push(scan);
  store.scans.set(input.ownerEmail, scans.slice(-10));
  return scan;
}

function mapProfile(row: ProfileRow): CyberusProfile {
  let watchlist: string[] = [];
  try {
    const parsed = JSON.parse(row.watchlist);
    if (Array.isArray(parsed)) watchlist = parsed.filter((item): item is string => typeof item === "string");
  } catch {
    watchlist = [];
  }
  return {
    email: row.email,
    fullName: row.full_name,
    company: row.company,
    plan: row.plan === "immunity" ? "immunity" : "signal",
    stack: row.stack,
    repositoryUrl: row.repository_url,
    watchlist,
    onboardingComplete: Boolean(row.onboarding_complete),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapScan(row: ScanRow): CyberusScan {
  return {
    id: row.id,
    repositoryUrl: row.repository_url,
    repositoryName: row.repository_name,
    defaultBranch: row.default_branch,
    fileCount: row.file_count,
    sourceFilesChecked: row.source_files_checked,
    languages: parseArray<{ name: string; files: number }>(row.languages),
    findings: parseArray<CyberusFinding>(row.findings),
    createdAt: row.created_at,
  };
}

function parseArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}
