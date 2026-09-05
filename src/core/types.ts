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
  stripeConfigured: boolean;
  adminConfigured: boolean;
  scannerConfigured: boolean;
  embeddingsConfigured: boolean;
  chromaConfigured: boolean;
  scannerPipelineConfigured: boolean;
  scanRunner: string;
}

export interface GithubStatus {
  configured: boolean;
  appConfigured: boolean;
  connected: boolean;
  login?: string | null;
  manageUrl?: string | null;
}

export interface GithubRepo {
  githubRepoId: string;
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  defaultBranch: string | null;
  htmlUrl: string | null;
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
  installations?: Array<{ installationId: string; accountLogin: string }>;
  repos: GithubRepo[];
}

export type ScanStatus = "queued" | "running" | "completed" | "failed";

export type ScanMode = "manual" | "push" | "pull-request" | "scheduled";

export type ScanInterval = "1h" | "6h" | "12h" | "24h" | "168h";

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
  lastScheduledAt?: string | null;
  profile: {
    languages?: string[];
    frameworks?: string[];
    dependencies?: Array<{ ecosystem: string; name: string; version: string }>;
  } | null;
  connectedAt: string;
  scan: ScanSummary | null;
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

export interface CommitEntry {
  sha: string;
  message: string;
  authorName: string;
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  committedAt: string;
  scanId: string;
  scanStatus: ScanStatus;
  findingCount: number;
  counts: {
    introduced: number;
    resolved: number;
    suppressed: number;
  };
}

export interface CommitsResponse {
  commits: CommitEntry[];
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
  intelligenceSources: IntelligenceSource[];
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
  status: "generating" | "ready" | "failed" | "skipped" | "publishing" | "opened";
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

export type BillingFeature = "observed" | "match" | "fix" | "proof";

export interface BillingMe {
  role: "user" | "admin";
  entitlements: Record<BillingFeature, boolean>;
  billingConfigured: boolean;
  subscriptions: Array<{
    feature: BillingFeature;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  }>;
}

export interface BillingCatalog {
  configured: boolean;
  features: Array<{
    feature: BillingFeature;
    name: string;
    description: string;
    available: boolean;
    currency: string | null;
    unitAmount: number | null;
    interval: string;
  }>;
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

export interface ReferralsResponse {
  access: { role: string; entitlements: Record<BillingFeature, boolean> };
  redemptions: Array<{
    id: string;
    code: string;
    label: string | null;
    observed: boolean;
    match: boolean;
    fix: boolean;
    proof: boolean;
    redeemedAt: string;
  }>;
}
