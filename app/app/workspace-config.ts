import type { CyberusFinding } from "../../db/cyberus";

export const topics = [
  "Authentication",
  "Cloud",
  "Supply chain",
  "AI agents",
  "Post-quantum",
  "Data exposure",
];

// DATA SOURCE: GET /api/feed (see API_CONTRACT.md). Served as the workspace
// fallback and returned verbatim by /api/feed, so the same set is what a wired
// backend replaces. ~45 findings so the queue reads like a live workspace.
const f = (
  id: string,
  severity: CyberusFinding["severity"],
  category: string,
  title: string,
  summary: string,
  file: string,
  line: number,
): CyberusFinding => ({ id, severity, category, title, summary, file, line });

export const demoFindings: CyberusFinding[] = [
  f("f01", "Critical", "Authentication", "Session token reaches a privileged route after expiry", "The refresh path accepts a stale device-code session before the guard rechecks ownership.", "src/auth/session.service.ts", 87),
  f("f02", "Critical", "Injection", "Account lookup reaches the SQL sink unsanitized", "Request input crosses two calls before a dynamically constructed query.", "src/accounts/account.repository.ts", 142),
  f("f03", "Critical", "Cloud", "Metadata endpoint reachable through an open redirect", "A permissive redirect lets a request reach the instance metadata service.", "src/gateway/proxy.ts", 64),
  f("f04", "Critical", "Identity", "Object authorization skipped on ownership transfer", "The admin transfer path never rechecks that the caller owns the object.", "src/admin/ownership.ts", 210),
  f("f05", "Critical", "Supply chain", "Postinstall script runs in the production image", "A transferred dependency executes during production image assembly.", "package-lock.json", 3812),
  f("f06", "Critical", "AI agents", "Tool call reaches an internal host from model output", "Model output steers a tool into an unrestricted internal request.", "src/agents/tool-router.ts", 96),
  f("f07", "Critical", "Data exposure", "Customer PII returned on an unauthenticated route", "A public profile route returns fields that require authentication.", "src/api/profile.public.ts", 38),
  f("f08", "High", "Authentication", "Device-code replay reaches an admin handoff", "A replayed device code walks a low-privilege login into an admin route.", "src/auth/device-code.ts", 120),
  f("f09", "High", "Injection", "Template render evaluates attacker-controlled input", "User input reaches a template evaluator without escaping.", "src/render/template.ts", 54),
  f("f10", "High", "Cloud", "IAM role chain grants a confused-deputy path", "A trusted service can assume a role it was never meant to reach.", "src/cloud/iam.ts", 77),
  f("f11", "High", "Supply chain", "Dependency confusion on an internal package name", "An internal name resolves to a public package under the default registry.", ".npmrc", 12),
  f("f12", "High", "Containers", "Build cache restores an untrusted layer", "A restored cache layer can smuggle a change past review.", "ci/build.yml", 44),
  f("f13", "High", "Identity", "Role drift leaves a stale admin grant", "An admin grant outlives the person and the reason it was created.", "src/identity/roles.ts", 188),
  f("f14", "High", "Authentication", "JWT audience is not verified on refresh", "The refresh path accepts a token minted for a different audience.", "src/auth/jwt.ts", 71),
  f("f15", "High", "Cloud", "Public bucket resolves through a CNAME", "A bucket reads as private but resolves as reachable via an alias.", "infra/storage.tf", 23),
  f("f16", "High", "Injection", "NoSQL operator injection in the search filter", "Query operators pass through the search filter unvalidated.", "src/search/query.ts", 133),
  f("f17", "High", "AI agents", "Agent inherits a broader tool scope than granted", "Tool scopes are not isolated per delegation.", "src/agents/scopes.ts", 40),
  f("f18", "High", "Data exposure", "Debug endpoint leaks environment variables", "A debug route echoes the process environment.", "src/api/debug.ts", 9),
  f("f19", "High", "Supply chain", "Transitive package pulls an unpinned postinstall", "A second-level dependency runs an unpinned install script.", "package-lock.json", 9021),
  f("f20", "High", "Containers", "Image runs as root with a writable mount", "The container runs privileged against a writable host path.", "k8s/deployment.yaml", 57),
  f("f21", "High", "Authentication", "Password reset token does not expire on use", "A reset token remains valid after it has been redeemed.", "src/auth/reset.ts", 88),
  f("f22", "Watch", "Cloud", "Overly permissive CORS on the public API", "The API reflects any origin on credentialed requests.", "src/api/cors.ts", 14),
  f("f23", "Watch", "Supply chain", "Two dependencies away from a yanked release", "A transitive dependency points at a yanked version.", "package.json", 31),
  f("f24", "Watch", "Post-quantum", "RSA-2048 in the token signing path", "Token signatures rely on a quantum-vulnerable primitive.", "src/crypto/sign.ts", 22),
  f("f25", "Watch", "Post-quantum", "ECDH key exchange without a PQ fallback", "The key exchange has no post-quantum hybrid mode.", "src/crypto/kex.ts", 47),
  f("f26", "Watch", "Identity", "Service account shared across two environments", "One credential spans staging and production.", "src/identity/service.ts", 63),
  f("f27", "Watch", "Data exposure", "Verbose error returns a stack trace", "An unhandled error returns internal detail to the client.", "src/middleware/error.ts", 29),
  f("f28", "Watch", "Containers", "Base image is 40 days behind its patch line", "The base image has drifted from its current patch release.", "Dockerfile", 1),
  f("f29", "Watch", "AI agents", "Prompt log stores raw tool arguments", "Tool arguments, including secrets, are written to logs.", "src/agents/logging.ts", 52),
  f("f30", "Watch", "Cloud", "Security group allows 0.0.0.0/0 on 5432", "The database port is open to the internet.", "infra/network.tf", 88),
  f("f31", "Watch", "Injection", "Path traversal possible in the file export", "An export path joins user input without normalization.", "src/export/files.ts", 71),
  f("f32", "Watch", "Authentication", "Session cookie missing the SameSite flag", "The session cookie omits SameSite, widening CSRF surface.", "src/auth/cookies.ts", 18),
  f("f33", "Watch", "Supply chain", "Lockfile drift between CI and local", "CI resolves a different tree than local installs.", "package-lock.json", 1),
  f("f34", "Watch", "Data exposure", "Analytics payload includes email addresses", "An analytics event carries raw email addresses.", "src/analytics/track.ts", 34),
  f("f35", "Watch", "Containers", "Secrets passed as build args in the image", "Build arguments bake secrets into image history.", "Dockerfile", 22),
  f("f36", "Watch", "Identity", "MFA not enforced for the billing role", "A high-value role can sign in without a second factor.", "src/identity/billing.ts", 12),
  f("f37", "Watch", "Cloud", "Cloud function has no egress restriction", "A function can reach arbitrary external hosts.", "functions/handler.ts", 5),
  f("f38", "Watch", "Post-quantum", "Certificate uses SHA-1 in the chain", "A chain certificate is signed with a deprecated hash.", "tls/chain.pem", 1),
  f("f39", "Watch", "AI agents", "Tool router lacks a per-call rate limit", "Tool calls are not bounded per session.", "src/agents/tool-router.ts", 150),
  f("f40", "Info", "Data exposure", "Response includes an internal request-id header", "An internal correlation id is exposed to clients.", "src/middleware/headers.ts", 8),
  f("f41", "Info", "Cloud", "Region pinned to a single availability zone", "The deployment has no cross-zone redundancy.", "infra/region.tf", 3),
  f("f42", "Info", "Supply chain", "Dev dependency flagged as deprecated", "A development-only dependency is deprecated upstream.", "package.json", 58),
  f("f43", "Info", "Containers", "Healthcheck missing on a long-running worker", "A worker has no liveness probe configured.", "k8s/worker.yaml", 20),
  f("f44", "Info", "Authentication", "Login page lacks a rate-limit header", "The login route advertises no rate limiting.", "src/auth/login.ts", 5),
  f("f45", "Info", "Identity", "Unused service token older than 90 days", "A service token has not been used in over a quarter.", "src/identity/tokens.ts", 44),
];

export type AppView =
  | "feed"
  | "autofix"
  | "repositories"
  | "containers"
  | "clouds"
  | "domains"
  | "pentests"
  | "code-audit"
  | "integrations"
  | "reports"
  | "library";
export type NavigationGroup = {
  title: string;
  items: { id: AppView; label: string; icon: string }[];
};

/* Primary navigation is the lifecycle of one attack path — Feed, Fix, Proof.
   Everything else is supporting infrastructure in the secondary groups, so a
   first-time visitor can answer "what does this product do?" in one glance. */
/* The sidebar is where you GO; the top strip (Observed · Matched · Fix ·
   Proof) is the lifecycle of one finding. So Fix and Proof are not sidebar
   destinations — the sidebar carries Feed (live findings) and Immunity (the
   archive of proven-closed paths). No duplication with the strip. */
export const navGroups: NavigationGroup[] = [
  {
    title: "",
    items: [
      { id: "feed", label: "Feed", icon: "≡" },
      { id: "reports", label: "Immunity", icon: "▤" },
    ],
  },
];

/* Everything below the loop is subordinate to it. "Sources" is where attacks
   enter the pipeline; "Validation" is where closure is checked. Security
   library and Integrations are not destinations — Library hangs off findings,
   Integrations lives in Settings — so they are not in the sidebar. */
export const secondaryNavGroups: NavigationGroup[] = [
  {
    title: "Sources",
    items: [
      { id: "repositories", label: "Repositories", icon: "◇" },
      { id: "containers", label: "Containers", icon: "⬡" },
      { id: "clouds", label: "Clouds", icon: "☁" },
      { id: "domains", label: "Domains", icon: "◎" },
    ],
  },
  {
    title: "Validation",
    items: [
      { id: "pentests", label: "Pentests", icon: "⌁" },
      { id: "code-audit", label: "Code audit", icon: "{ }" },
    ],
  },
];

// All valid views, independent of the sidebar. `library` and `integrations`
// are reachable by URL (from a finding / from Settings) even though they are
// no longer sidebar destinations.
const allViews: AppView[] = [
  "feed",
  "autofix",
  "repositories",
  "containers",
  "clouds",
  "domains",
  "pentests",
  "code-audit",
  "integrations",
  "reports",
  "library",
];

export function normalizeView(value: string): AppView {
  const legacy: Record<string, AppView> = {
    ingest: "feed",
    match: "feed",
    fix: "autofix",
    prove: "reports",
  };
  if (legacy[value]) return legacy[value];
  return allViews.includes(value as AppView) ? (value as AppView) : "feed";
}
