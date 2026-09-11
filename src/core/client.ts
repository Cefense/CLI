import { CefenseError, AuthRequiredError, FeatureRequiredError } from "./errors.js";
import { translateWireCode } from "./codes.js";
import { refreshCredentials } from "./oauth.js";
import { saveCredentials } from "./credentials.js";
import { activeOrganization, type OrganizationsResponse } from "./organizations.js";
import { USER_AGENT } from "../version.js";
import { isAgentMode } from "../ui/mode.js";
import type {
  Article,
  AuditResponse,
  ArticleDetail,
  ArticlesResponse,
  BranchesResponse,
  CefenseProfile,
  CliConfigResponse,
  CommitsResponse,
  Fix,
  FindingsResponse,
  GithubRepo,
  GithubReposResponse,
  GithubStatus,
  HealthResponse,
  MergeResult,
  MeResponse,
  ProfileResponse,
  Project,
  ProjectsResponse,
  Provider,
  ProviderStatus,
  SbomFormat,
  ScanDepth,
  ScanInterval,
  ScanMode,
  StoredCredentials,
  TriageResponse,
  TriageStatus,
} from "./types.js";

export interface RepoSettings {
  coverages?: string[];
  scanMode?: ScanMode;
  scanInterval?: ScanInterval;
  scanDepth?: ScanDepth;
}

const RETRYABLE = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const EXPIRY_SKEW_MS = 30_000;

interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  signal?: AbortSignal;
  allowUnauthenticated?: boolean;
  accept?: string;
  raw?: boolean;
  unscoped?: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelay(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const seconds = Number.parseInt(retryAfter, 10);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 15_000);
  }
  return Math.min(2 ** attempt * 250, 4000) + Math.floor(Math.random() * 200);
}

export class CefenseClient {
  readonly apiUrl: string;
  readonly config: CliConfigResponse | null;
  private credentials: StoredCredentials | null;
  private refreshing: Promise<StoredCredentials> | null = null;

  constructor(options: {
    apiUrl: string;
    config?: CliConfigResponse | null;
    credentials?: StoredCredentials | null;
  }) {
    this.apiUrl = options.apiUrl;
    this.config = options.config ?? null;
    this.credentials = options.credentials ?? null;
  }

  get authenticated(): boolean {
    return Boolean(this.credentials?.accessToken);
  }

  get token(): string | null {
    return this.credentials?.accessToken ?? null;
  }

  get refreshToken(): string | null {
    return this.credentials?.refreshToken ?? null;
  }

  private get expired(): boolean {
    const expiresAt = this.credentials?.expiresAt;
    if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return false;
    return Date.now() >= expiresAt - EXPIRY_SKEW_MS;
  }

  private async renew(): Promise<StoredCredentials> {
    if (!this.config || !this.credentials?.refreshToken) {
      throw new AuthRequiredError("Your session has expired.");
    }
    if (!this.refreshing) {
      const refreshToken = this.credentials.refreshToken;
      this.refreshing = refreshCredentials(this.config, refreshToken)
        .then(async (next) => {
          const merged: StoredCredentials = {
            ...next,
            subject: this.credentials?.subject ?? null,
            email: this.credentials?.email ?? null,
          };
          this.credentials = merged;
          await saveCredentials(this.apiUrl, merged);
          return merged;
        })
        .finally(() => {
          this.refreshing = null;
        });
    }
    return this.refreshing;
  }

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(path, this.apiUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    if (!options.allowUnauthenticated && !this.credentials?.accessToken) {
      throw new AuthRequiredError();
    }

    let renewed = false;
    if (this.expired && this.credentials?.refreshToken && this.config) {
      renewed = true;
      await this.renew();
    }

    // Every resource is scoped to an organization, so the header belongs here
    // rather than on the routes that happen to need it today. The listing of
    // organizations is the one exception: it is what the user reads to recover
    // from a stale selection, so scoping it would make a slug they have left
    // impossible to replace from the CLI.
    const organization = options.unscoped ? null : activeOrganization(this.apiUrl);

    for (let attempt = 0; ; attempt += 1) {
      const headers: Record<string, string> = {
        accept: options.accept ?? "application/json",
        "user-agent": USER_AGENT,
      };
      if (isAgentMode()) headers["x-cefense-client"] = "agent";
      if (organization) headers["x-cefense-org"] = organization;
      if (this.credentials?.accessToken) {
        headers.authorization = `Bearer ${this.credentials.accessToken}`;
      }
      if (options.body !== undefined) headers["content-type"] = "application/json";

      let response: Response;
      try {
        response = await fetch(url, {
          method,
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: options.signal ?? AbortSignal.timeout(60_000),
        });
      } catch (cause) {
        if (method === "GET" && attempt + 1 < MAX_ATTEMPTS) {
          await sleep(backoffDelay(attempt, null));
          continue;
        }
        throw new CefenseError(`Could not reach ${url.origin}.`, {
          remedy: "Check your connection, or set CEFENSE_API_URL to point somewhere else.",
          cause,
        });
      }

      if (response.status === 401 && !renewed && this.credentials?.refreshToken && this.config) {
        renewed = true;
        await this.renew();
        continue;
      }

      if (RETRYABLE.has(response.status) && method === "GET" && attempt + 1 < MAX_ATTEMPTS) {
        await sleep(backoffDelay(attempt, response.headers.get("retry-after")));
        continue;
      }

      if (response.ok) {
        if (response.status === 204) return undefined as T;
        const text = await response.text();
        if (options.raw) return text as T;
        return (text ? JSON.parse(text) : undefined) as T;
      }

      throw await this.toError(response, url);
    }
  }

  private async toError(response: Response, url: URL): Promise<CefenseError> {
    let payload: Record<string, unknown> = {};
    try {
      payload = (await response.json()) as Record<string, unknown>;
    } catch {
      payload = {};
    }
    const message = typeof payload.error === "string" ? payload.error : null;
    const webUrl = this.config?.webUrl ?? this.apiUrl;

    if (response.status === 401) {
      return new AuthRequiredError("Your session has expired.");
    }
    if (response.status === 403 && payload.code === "feature_required") {
      return new FeatureRequiredError(
        String(payload.feature ?? "required"),
        typeof payload.pricingUrl === "string" ? payload.pricingUrl : null,
        webUrl,
      );
    }

    // The API names its refusals precisely: a merge stopped by branch
    // protection is pull_request_blocked, not "a 409". Carrying that code
    // through is what lets an agent branch on it, and without this every one
    // of them arrived as api_error while the skill told agents to expect the
    // specific code.
    const wire = translateWireCode(payload.code);
    if (wire) {
      return new CefenseError(message ?? wire.meaning, {
        remedy: wire.remedy,
        exitCode: wire.exitCode,
        code: wire.code,
      });
    }
    if (response.status === 404) {
      return new CefenseError(message ?? "Not found.", {
        remedy: "Check the repository is connected with cf repo list.",
      });
    }
    if (response.status === 409) {
      // The host names itself in the message, so the remedy can point at the
      // right account instead of always telling a GitLab user to fix GitHub.
      const host = /gitlab/i.test(message ?? "")
        ? "GitLab"
        : /bitbucket/i.test(message ?? "")
          ? "Bitbucket"
          : /github/i.test(message ?? "")
            ? "GitHub"
            : null;
      return new CefenseError(message ?? "The request conflicted with the current state.", {
        remedy: host ? `Reconnect ${host} with cf provider connect ${host.toLowerCase()}.` : null,
      });
    }
    if (response.status === 503) {
      return new CefenseError(message ?? "The Cefense API is not fully configured.", {
        remedy: "Run cf status to see what is missing.",
      });
    }
    return new CefenseError(message ?? `${url.pathname} returned ${response.status}.`);
  }

  health(): Promise<HealthResponse> {
    return this.request<HealthResponse>("GET", "/health", { allowUnauthenticated: true });
  }

  me(): Promise<MeResponse> {
    return this.request<MeResponse>("GET", "/api/me");
  }

  /** Every organization the account is a member of, with the role it holds. */
  organizations(): Promise<OrganizationsResponse> {
    return this.request<OrganizationsResponse>("GET", "/api/organizations", { unscoped: true });
  }

  /**
   * Account state for one code host.
   *
   * Every provider answers the same three routes under its own prefix, so the
   * host is a path segment rather than three near-identical methods.
   */
  providerStatus(provider: Provider): Promise<ProviderStatus> {
    return this.request<ProviderStatus>("GET", `/api/${provider}/status`);
  }

  providerRepos(provider: Provider): Promise<GithubReposResponse> {
    return this.request<GithubReposResponse>("GET", `/api/${provider}/repos`);
  }

  /** Starts an authorization, returning the URL the user has to visit. */
  startProviderConnect(
    provider: Provider,
    options: { reauthorize?: boolean } = {},
  ): Promise<{ authorizeUrl: string }> {
    return this.request("POST", `/api/${provider}/connect`, {
      body: provider === "github" && options.reauthorize ? { mode: "reauthorize" } : {},
    });
  }

  disconnectProviderAccount(provider: Provider): Promise<{ ok: boolean }> {
    return this.request("POST", `/api/${provider}/account/disconnect`);
  }

  githubStatus(): Promise<GithubStatus> {
    return this.providerStatus("github");
  }

  githubRepos(): Promise<GithubReposResponse> {
    return this.providerRepos("github");
  }

  projects(): Promise<ProjectsResponse> {
    return this.request<ProjectsResponse>("GET", "/api/github/projects");
  }

  /**
   * Connects a repository by URL and scans it in one step.
   *
   * GitHub only: the route resolves the URL against GitHub's API, so a GitLab
   * or Bitbucket project has to be connected through its own account listing.
   */
  scanPublicRepo(url: string): Promise<{ project: Project; scanId: string }> {
    return this.request("POST", "/api/github/scan-public-repo", { body: { url } });
  }

  connectRepo(
    repo: GithubRepo,
    settings: RepoSettings = {},
  ): Promise<{ project: Project; scanId: string }> {
    return this.request("POST", "/api/github/repos/connect", {
      body: {
        provider: repo.provider ?? "github",
        githubRepoId: repo.githubRepoId,
        fullName: repo.fullName,
        name: repo.name,
        owner: repo.owner,
        private: repo.private,
        defaultBranch: repo.defaultBranch,
        htmlUrl: repo.htmlUrl,
        ...(settings.coverages ? { coverages: settings.coverages } : {}),
        ...(settings.scanMode ? { scanMode: settings.scanMode } : {}),
        ...(settings.scanInterval ? { scanInterval: settings.scanInterval } : {}),
        ...(settings.scanDepth ? { scanDepth: settings.scanDepth } : {}),
      },
    });
  }

  /**
   * Repository settings are written through the same upsert that connects one,
   * because that route already owns the row and its validation. The identity
   * fields are resent unchanged; only the settings differ.
   */
  updateRepoSettings(
    project: Project,
    settings: RepoSettings,
  ): Promise<{ project: Project; scanId: string | null }> {
    return this.request("POST", "/api/github/repos/connect", {
      body: {
        provider: project.provider ?? "github",
        githubRepoId: project.githubRepoId,
        fullName: project.fullName,
        name: project.name,
        owner: project.owner,
        private: project.private,
        defaultBranch: project.defaultBranch,
        htmlUrl: project.htmlUrl,
        coverages: settings.coverages ?? project.coverages ?? [],
        ...(settings.scanMode ? { scanMode: settings.scanMode } : {}),
        ...(settings.scanInterval ? { scanInterval: settings.scanInterval } : {}),
        ...(settings.scanDepth ? { scanDepth: settings.scanDepth } : {}),
      },
    });
  }

  disconnectRepo(githubRepoId: string): Promise<{ ok: boolean }> {
    return this.request("POST", "/api/github/repos/disconnect", { body: { githubRepoId } });
  }

  disconnectGithubAccount(): Promise<{ ok: boolean }> {
    return this.request("POST", "/api/github/account/disconnect");
  }

  startScan(githubRepoId: string, ref?: string | null): Promise<{ scanId: string }> {
    return this.request("POST", `/api/github/projects/${encodeURIComponent(githubRepoId)}/scan`, {
      body: ref ? { ref } : {},
    });
  }

  branches(githubRepoId: string): Promise<BranchesResponse> {
    return this.request<BranchesResponse>(
      "GET",
      `/api/github/projects/${encodeURIComponent(githubRepoId)}/branches`,
    );
  }

  commits(githubRepoId: string, query: { branch?: string } = {}): Promise<CommitsResponse> {
    return this.request<CommitsResponse>(
      "GET",
      `/api/github/projects/${encodeURIComponent(githubRepoId)}/commits`,
      { query },
    );
  }

  /**
   * Records a decision about a finding.
   *
   * Keyed by the finding's fingerprint on the server, so the decision survives
   * the rescan that replaces this scan's rows.
   */
  triageFinding(
    findingId: string,
    status: TriageStatus,
    note?: string,
  ): Promise<TriageResponse> {
    return this.request("POST", `/api/github/findings/${encodeURIComponent(findingId)}/triage`, {
      body: note ? { status, note } : { status },
    });
  }

  auditEvents(query: { limit?: number; before?: string } = {}): Promise<AuditResponse> {
    return this.request<AuditResponse>("GET", "/api/audit", { query });
  }

  sbomForRepository(githubRepoId: string, format: SbomFormat): Promise<string> {
    return this.request<string>("GET", `/api/sbom/repository/${encodeURIComponent(githubRepoId)}`, {
      query: { format },
      accept: "application/json, application/xml",
      raw: true,
    });
  }

  sbomForScan(scanId: string, format: SbomFormat): Promise<string> {
    return this.request<string>("GET", `/api/sbom/scan/${encodeURIComponent(scanId)}`, {
      query: { format },
      accept: "application/json, application/xml",
      raw: true,
    });
  }

  findings(
    githubRepoId: string,
    query: {
      limit?: number;
      offset?: number;
      severity?: string;
      category?: string;
      matched?: boolean;
      scanId?: string;
    } = {},
  ): Promise<FindingsResponse> {
    return this.request<FindingsResponse>(
      "GET",
      `/api/github/projects/${encodeURIComponent(githubRepoId)}/findings`,
      { query },
    );
  }

  fixForFinding(findingId: string): Promise<{ fix: Fix | null }> {
    return this.request("GET", `/api/fix/findings/${encodeURIComponent(findingId)}`);
  }

  fixesForScan(scanId: string): Promise<{ fixes: Fix[] }> {
    return this.request("GET", `/api/fix/scans/${encodeURIComponent(scanId)}`);
  }

  generateFix(findingId: string): Promise<{ fix: Fix }> {
    return this.request("POST", `/api/fix/findings/${encodeURIComponent(findingId)}/generate`);
  }

  mergeFix(
    findingId: string,
    options: { method?: "merge" | "squash" | "rebase"; deleteBranch?: boolean } = {},
  ): Promise<MergeResult> {
    return this.request("POST", `/api/fix/findings/${encodeURIComponent(findingId)}/merge`, {
      body: options,
    });
  }

  publishFix(findingId: string): Promise<{ fix: Fix }> {
    return this.request("POST", `/api/fix/findings/${encodeURIComponent(findingId)}/publish`);
  }

  articles(query: { limit?: number; offset?: number; githubRepoId?: string } = {}): Promise<ArticlesResponse> {
    return this.request<ArticlesResponse>("GET", "/api/articles", { query });
  }

  article(id: string): Promise<{ article: ArticleDetail }> {
    return this.request("GET", `/api/articles/${encodeURIComponent(id)}`);
  }

  profile(): Promise<ProfileResponse> {
    return this.request<ProfileResponse>("GET", "/api/profile");
  }

  saveProfile(body: Partial<CefenseProfile>): Promise<{ profile: CefenseProfile }> {
    return this.request("POST", "/api/profile", { body });
  }
}

export type { Article, Project, Fix };
