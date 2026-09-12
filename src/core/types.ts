import type { Provider } from "./providers.js";

export type { Provider };

export interface CliConfigResponse {
  apiVersion: number;
  minimumCliVersion: string;
  webUrl: string;
  auth: {
    issuer: string;
    authorizationEndpoint: string;
    tokenEndpoint: string;
    revocationEndpoint: string;
    clientId: string;
    scopes: string[];
    codeChallengeMethod: string;
    redirectUris: string[];
  };
}

export interface StoredCredentials {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  subject: string | null;
  email: string | null;
  clientId: string;
  issuer: string;
}

export interface Viewer {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface MeResponse {
  user: Viewer;
  profile: Record<string, unknown> | null;
  dbConfigured: boolean;
}

export interface HealthResponse {
  ok: boolean;
  service: string;
  authConfigured: boolean;
  dbConfigured: boolean;
  githubConfigured: boolean;
  githubAppConfigured: boolean;
  githubWebhookConfigured: boolean;
  clerkWebhookConfigured?: boolean;
  scannerConfigured: boolean;
  cacheConfigured?: boolean;
  embeddingsConfigured: boolean;
  scannerPipelineConfigured: boolean;
  scanRunner: string;
}

/**
 * A code host account, as every provider's status route reports it.
 *
 * GitHub is the only one with an App to install, so `appConfigured` and
 * `manageUrl` are absent on the others rather than false.
 */
export interface ProviderStatus {
  configured: boolean;
  connected: boolean;
  needsReconnect?: boolean;
  login?: string | null;
  appConfigured?: boolean;
  manageUrl?: string | null;
  host?: string | null;
}

export type GithubStatus = ProviderStatus;

export interface GithubRepo {
  provider?: Provider;
  githubRepoId: string;
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  defaultBranch: string | null;
  htmlUrl: string | null;
  description?: string | null;
  language?: string | null;
  updatedAt?: string | null;
  stars?: number | null;
  connected: boolean;
}

export interface GithubReposResponse {
  connected: boolean;
  needsReconnect?: boolean;
  login?: string | null;
  manageUrl?: string | null;
  host?: string | null;
  installations?: Array<{ installationId: string; accountLogin: string }>;
  repos: GithubRepo[];
}

export type ScanStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type ScanMode = "manual" | "push" | "pull-request" | "scheduled";

export type ScanInterval = "1h" | "6h" | "12h" | "24h" | "168h";

/**
 * How hard a scan looks. The product calls this scan mode; the wire name is
 * `scanDepth` because `scanMode` already means what triggers a scan.
 */
export type ScanDepth = "default" | "max";

export type SbomFormat = "cyclonedx" | "spdx";

export interface ScanSummary {
  id: string;
  status: ScanStatus;
  fileCount: number | null;
  filesScanned: number | null;
  findingCount: number;
  stage: string | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface Project {
  id: string;
  provider?: Provider;
  githubRepoId: string;
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  defaultBranch: string | null;
  htmlUrl: string | null;
  coverages: string[];
  scanMode?: ScanMode;
  scanInterval?: ScanInterval;
  scanDepth?: ScanDepth;
  lastScheduledAt?: string | null;
  agentLastSeenAt?: string | null;
  profile: {
    languages?: string[];
    frameworks?: string[];
    dependencies?: Array<{ ecosystem: string; name: string; version: string }>;
  } | null;
  connectedAt: string;
  scan: ScanSummary | null;
}

export interface ProjectsResponse {
  projects: Project[];
  agentLastSeenAt?: string | null;
}

export interface Branch {
  name: string;
  protected: boolean;
  scanId: string | null;
  scanStatus: ScanStatus | null;
  findingCount: number | null;
  scannedAt: string | null;
}

export interface BranchesResponse {
  defaultBranch: string | null;
  branches: Branch[];
}

/**
 * A commit on the branch being read.
 *
 * The history comes from the host, not from Cefense's scans, so most entries
 * describe a commit nothing has scanned: everything below `committedAt` is null
 * until a scan of that exact commit exists.
 */
export interface CommitEntry {
  sha: string;
  message: string;
  authorName: string;
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  committedAt: string;
  scanned: boolean;
  scanId: string | null;
  scanStatus: ScanStatus | null;
  findingCount: number | null;
  counts: {
    introduced: number;
    resolved: number;
    suppressed: number;
  } | null;
}

export interface CommitsResponse {
  commits: CommitEntry[];
  branch: string | null;
  historyAvailable: boolean;
}

export type WireSeverity = "critical" | "high" | "medium" | "low";

export interface IntelligenceSource {
  articleId: string;
  source: string;
  sourceUrl: string;
  title: string | null;
  publishedAt: string | null;
  matchType: string;
  confidence: number;
  rationale: string;
}

/** The commit a finding was first seen in, when reconciliation recorded one. */
export interface FindingOrigin {
  sha: string;
  message: string;
  authorName: string;
  authorAvatarUrl: string | null;
  committedAt: string;
}

export interface EvidenceStep {
  label: string;
  role: string;
  location?: { file: string; startLine: number; endLine: number } | null;
}

export interface Finding {
  id: string;
  scanId: string;
  filePath: string;
  severity: WireSeverity;
  title: string;
  description: string;
  vulnerableCode: string;
  suggestedFix: string | null;
  startLine: number | null;
  endLine: number | null;
  category: string | null;
  cveId: string | null;
  cwe: string | null;
  ruleId: string | null;
  type: string | null;
  state: string;
  confidence: number | null;
  exploitPath: string | null;
  symbol: string | null;
  dataflow: {
    sourceKind: string;
    sinkKind: string;
    steps: EvidenceStep[];
    ineffectiveSanitizers: string[];
  } | null;
  remediation: {
    summary: string;
    rationale?: string | null;
    guidance: string;
    suggestedPatch?: { file: string; diff: string } | null;
  } | null;
  vulnerabilityRefs: Array<{
    kind: string;
    identifier: string;
    title?: string | null;
    url?: string | null;
    articleId?: string | null;
    relevance?: number | null;
  }>;
  fingerprint: string | null;
  createdAt: string;
  introducedIn?: FindingOrigin | null;
  intelligenceSources: IntelligenceSource[];
}

/** A user's decision about a finding, kept per repository and per fingerprint. */
export type TriageStatus = "open" | "false_positive" | "accepted_risk";

export interface TriageResponse {
  ok: boolean;
  status: TriageStatus;
}

export interface FindingChain {
  id: string;
  scanId: string;
  title: string;
  severity: string;
  description: string | null;
  steps: unknown[];
  createdAt: string;
}

export interface FindingsResponse {
  scanId: string | null;
  findings: Finding[];
  chains: FindingChain[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface MergeResult {
  fix: Fix | null;
  merged: boolean;
  alreadyMerged: boolean;
  commitSha: string | null;
  branchDeleted: boolean;
}

export interface Fix {
  id: string;
  findingId: string;
  status: "generating" | "ready" | "failed" | "skipped" | "publishing" | "opened" | "merged" | "closed";
  strategy: "model" | "dependency";
  filePath: string;
  baseSha: string;
  diff: string | null;
  explanation: string | null;
  prUrl: string | null;
  prNumber: number | null;
  branch: string | null;
  error: string | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Article {
  id: string;
  source: string;
  sourceUrl: string;
  title: string;
  author: string | null;
  publishedAt: string | null;
  excerpt: string | null;
  preview: string | null;
  tags: string[] | null;
  cveIds: string[] | null;
  summary: string | null;
  articleClass: string | null;
  technologies: string[];
  matched?: boolean;
  stackRelevant?: boolean;
}

export interface ArticlesResponse {
  articles: Article[];
  total: number;
  locked: boolean;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ArticleDetail extends Article {
  content?: string | null;
  contentText?: string | null;
  knowledge?: unknown;
}

export interface CefenseProfile {
  email: string;
  fullName: string | null;
  company: string;
  plan: "signal" | "immunity";
  stack: string;
  repositoryUrl: string;
  watchlist: string[];
  onboardingComplete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileResponse {
  viewer: { displayName: string; email: string };
  profile: CefenseProfile;
  latestScan: unknown;
  onboardingComplete: boolean;
}

export interface AuditEvent {
  id: string;
  at: string;
  action: string;
  category:
    | "scan"
    | "finding"
    | "fix"
    | "repository"
    | "settings"
    | "export"
    | "account"
    | "integration";
  outcome: "success" | "warning" | "failure";
  actor: { kind: string; id: string; name: string };
  target: { type: string; id: string; label: string };
  summary: string;
  changes?: Array<{ field: string; from: string; to: string }>;
  source?: Record<string, string>;
  metadata?: Record<string, string>;
}

export interface AuditResponse {
  events: AuditEvent[];
}

export type BillingPlan = "free" | "plus" | "pro" | "max";
export type PaidBillingPlan = "plus" | "pro" | "max";
export type BillingInterval = "month" | "year";
export type BillingStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused";

export interface PlanDefinition {
  id: BillingPlan;
  name: string;
  tagline: string;
  price: Record<BillingInterval, number | null>;
  monthlyTokens: number;
  grantIsOneTime: boolean;
  grantExpiryDays: number;
  seatsIncluded: number;
  repositories: number | null;
  maxDepthRuns: number | null;
  features: string[];
}

export interface BillingSubscription {
  plan: BillingPlan;
  status: BillingStatus;
  interval: BillingInterval;
  seats: number;
  extraSeats: number;
  entitled: boolean;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  hasCustomer: boolean;
}

/**
 * `allowance` and `remaining` arrive as null on an organization with an
 * internal unlimited grant: the API holds them as Infinity, which JSON renders
 * as null. Null is unlimited here, not unknown.
 */
export interface BillingUsage {
  tokens: number;
  allowance: number | null;
  exhausted: boolean;
  remaining: number | null;
  overTokens: number;
  costMicros: number;
  scans: number;
  periodStart: string;
  periodEnd: string | null;
}

export interface BillingResponse {
  configured: boolean;
  canAdminister: boolean;
  catalogue: {
    plans: PlanDefinition[];
    annualDiscountPercent: number;
    seatPriceCents: Record<BillingInterval, number>;
    tokensPerExtraSeat: number;
  };
  subscription: BillingSubscription;
  usage: BillingUsage;
}
