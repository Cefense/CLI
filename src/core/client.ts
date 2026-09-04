import { CefenseError, AuthRequiredError, FeatureRequiredError } from "./errors.js";
import { refreshCredentials } from "./oauth.js";
import { saveCredentials } from "./credentials.js";
import { USER_AGENT } from "../version.js";
import { isAgentMode } from "../ui/mode.js";
import type {
  Article,
  ArticleDetail,
  ArticlesResponse,
  BillingCatalog,
  BillingFeature,
  BillingMe,
  CefenseProfile,
  CliConfigResponse,
  Fix,
  FindingsResponse,
  GithubRepo,
  GithubReposResponse,
  GithubStatus,
  HealthResponse,
  MeResponse,
  ProfileResponse,
  Project,
  ReferralsResponse,
  StoredCredentials,
} from "./types.js";

const RETRYABLE = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  signal?: AbortSignal;
  allowUnauthenticated?: boolean;
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
    for (let attempt = 0; ; attempt += 1) {
      const headers: Record<string, string> = {
        accept: "application/json",
        "user-agent": USER_AGENT,
      };
      if (isAgentMode()) headers["x-cefense-client"] = "agent";
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
          remedy: "Check your connection, or point somewhere else with --api-url.",
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
    if (response.status === 404) {
      return new CefenseError(message ?? "Not found.", {
        remedy: "Check the repository is connected with cf repo list.",
      });
    }
    if (response.status === 409) {
      return new CefenseError(message ?? "The request conflicted with the current state.", {
        remedy: /github/i.test(message ?? "")
          ? `Reconnect GitHub at ${webUrl}/app/repositories.`
          : null,
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

  githubStatus(): Promise<GithubStatus> {
    return this.request<GithubStatus>("GET", "/api/github/status");
  }

  githubRepos(): Promise<GithubReposResponse> {
    return this.request<GithubReposResponse>("GET", "/api/github/repos");
  }

  projects(): Promise<{ projects: Project[] }> {
    return this.request<{ projects: Project[] }>("GET", "/api/github/projects");
  }

  connectRepo(repo: GithubRepo): Promise<{ project: Project; scanId: string }> {
    return this.request("POST", "/api/github/repos/connect", {
      body: {
        githubRepoId: repo.githubRepoId,
        fullName: repo.fullName,
        name: repo.name,
        owner: repo.owner,
        private: repo.private,
        defaultBranch: repo.defaultBranch,
        htmlUrl: repo.htmlUrl,
      },
    });
  }

  disconnectRepo(githubRepoId: string): Promise<{ ok: boolean }> {
    return this.request("POST", "/api/github/repos/disconnect", { body: { githubRepoId } });
  }

  disconnectGithubAccount(): Promise<{ ok: boolean }> {
    return this.request("POST", "/api/github/account/disconnect");
  }

  startScan(githubRepoId: string): Promise<{ scanId: string }> {
    return this.request("POST", `/api/github/projects/${encodeURIComponent(githubRepoId)}/scan`);
  }

  findings(
    githubRepoId: string,
    query: { limit?: number; offset?: number; severity?: string; category?: string; matched?: boolean } = {},
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

  billing(): Promise<BillingMe> {
    return this.request<BillingMe>("GET", "/api/billing/me");
  }

  billingCatalog(): Promise<BillingCatalog> {
    return this.request<BillingCatalog>("GET", "/api/billing/catalog", { allowUnauthenticated: true });
  }

  checkout(feature: BillingFeature): Promise<{ url: string }> {
    return this.request("POST", "/api/billing/checkout", { body: { feature } });
  }

  billingPortal(): Promise<{ url: string }> {
    return this.request("POST", "/api/billing/portal");
  }

  referrals(): Promise<ReferralsResponse> {
    return this.request<ReferralsResponse>("GET", "/api/referrals/me");
  }

  redeem(code: string): Promise<unknown> {
    return this.request("POST", "/api/referrals/redeem", { body: { code } });
  }
}

export type { Article, Project, Fix };
