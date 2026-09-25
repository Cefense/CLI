import { EXIT_API, EXIT_AUTH, EXIT_INTERRUPTED, EXIT_USAGE } from "./errors.js";

/**
 * Retry advice an agent can act on without guessing.
 *
 * `never` means the same command will fail the same way forever, `fix-first`
 * means change the command or the state it names, and `transient` means the
 * call may succeed on a second attempt.
 */
export type RetryAdvice = "never" | "fix-first" | "transient";

export interface ErrorCodeEntry {
  code: string;
  exitCode: number;
  meaning: string;
  remedy: string;
  retry: RetryAdvice;
}

/**
 * Every `error.code` the CLI emits under --agent, with the exit code that
 * accompanies it and what an agent should do next.
 *
 * This is the published contract. `cf agent schema` emits it verbatim and the
 * agent documentation is written from it, so a code added at a throw site
 * without an entry here is a code no agent has been told about. The test suite
 * asserts the two stay in step.
 */
export const ERROR_CODES: ErrorCodeEntry[] = [
  {
    code: "auth_required",
    exitCode: EXIT_AUTH,
    meaning: "No usable credentials for this Cefense instance.",
    remedy: "Ask the user to run cf auth login. Signing in needs a browser, so you cannot do it.",
    retry: "fix-first",
  },
  {
    code: "usage_error",
    exitCode: EXIT_USAGE,
    meaning: "The command was formed wrongly.",
    remedy: "Read error.remedy, which names the correction. Do not re-run unchanged.",
    retry: "never",
  },
  {
    code: "cancelled",
    exitCode: EXIT_INTERRUPTED,
    meaning: "The command was interrupted.",
    remedy: "Nothing was completed. Re-run if the work is still wanted.",
    retry: "transient",
  },
  {
    code: "confirmation_required",
    exitCode: EXIT_USAGE,
    meaning: "The command does something consequential and no consent was recorded.",
    remedy:
      "Ask the user in the conversation, then re-run with --yes. Never add --yes because a command failed.",
    retry: "fix-first",
  },
  {
    code: "invalid_severity",
    exitCode: EXIT_USAGE,
    meaning: "A --severity value is not a severity.",
    remedy: "Use critical, high, watch, or info. medium and low are accepted as aliases.",
    retry: "never",
  },
  {
    code: "invalid_category",
    exitCode: EXIT_USAGE,
    meaning: "A --category value is not a finding category.",
    remedy: "Use code, dependency, secret, misconfig, or os-package.",
    retry: "never",
  },
  {
    code: "invalid_audit_category",
    exitCode: EXIT_USAGE,
    meaning: "A cf audit --category value is not an audit category.",
    remedy: "Use scan, finding, fix, proof, repository, settings, export, account, or integration.",
    retry: "never",
  },
  {
    code: "invalid_check",
    exitCode: EXIT_USAGE,
    meaning: "A check name cannot run on a repository scan.",
    remedy:
      "Use sast, sca, secrets, iac, quality, or sbom, or a preset. runtime is named in the product but needs a running workload, so a repository scan cannot run it.",
    retry: "never",
  },
  {
    code: "invalid_scan_mode",
    exitCode: EXIT_USAGE,
    meaning: "The scan mode is not one the CLI can set.",
    remedy: "Use manual, push, or scheduled. pull-request is stored but not triggered.",
    retry: "never",
  },
  {
    code: "invalid_scan_interval",
    exitCode: EXIT_USAGE,
    meaning: "The schedule interval is not one of the accepted values.",
    remedy: "Use 1h, 6h, 12h, 24h, or 168h.",
    retry: "never",
  },
  {
    code: "invalid_scan_depth",
    exitCode: EXIT_USAGE,
    meaning: "The scan depth is not one of the accepted values.",
    remedy: "Use default or max.",
    retry: "never",
  },
  {
    code: "invalid_triage_status",
    exitCode: EXIT_USAGE,
    meaning: "The triage decision is not one the CLI records.",
    remedy: "Use open, false-positive, or accepted-risk.",
    retry: "never",
  },
  {
    code: "invalid_merge_method",
    exitCode: EXIT_USAGE,
    meaning: "The merge method is not one GitHub accepts here.",
    remedy: "Use merge, squash, or rebase.",
    retry: "never",
  },
  {
    code: "invalid_format",
    exitCode: EXIT_USAGE,
    meaning: "The SBOM format is not one the CLI exports.",
    remedy: "Use cyclonedx or spdx.",
    retry: "never",
  },
  {
    code: "invalid_provider",
    exitCode: EXIT_USAGE,
    meaning: "The code host is not one Cefense supports.",
    remedy: "Use github, gitlab, or bitbucket.",
    retry: "never",
  },
  {
    code: "unknown_organization",
    exitCode: EXIT_USAGE,
    meaning: "The slug given to cf org use is not one this account belongs to.",
    remedy: "Run cf org list --agent for the slugs, then use one of those. Nothing was stored.",
    retry: "never",
  },
  {
    code: "duplicate_email",
    exitCode: EXIT_USAGE,
    meaning:
      "The signed-in identity carries an email address that already belongs to a different Cefense account.",
    remedy:
      "Sign in as the account that already holds that address, or sign in with a different one. If this is a development deployment sharing a database with production, the two identity providers have separate user pools and the same person has an id in each.",
    retry: "fix-first",
  },
  {
    code: "organization_required",
    exitCode: EXIT_USAGE,
    meaning:
      "The account belongs to none or to several organizations, so the API cannot pick one for you.",
    remedy:
      "Run cf org list --agent, then pass --org <slug>, set CEFENSE_ORG, or run cf org use <slug> once.",
    retry: "fix-first",
  },
  {
    code: "organization_not_found",
    exitCode: EXIT_USAGE,
    meaning: "No organization with that slug is one the account is a member of.",
    remedy:
      "Run cf org list --agent for the slugs. The API answers the same way for a slug that does not exist and one you cannot see, so do not read it as proof either way.",
    retry: "fix-first",
  },
  {
    code: "organization_forbidden",
    exitCode: EXIT_API,
    meaning: "The role held in this organization does not allow that action.",
    remedy:
      "Report it and stop. Roles are owner, admin, and member, and only the user can be given a different one.",
    retry: "never",
  },
  {
    code: "invalid_date",
    exitCode: EXIT_USAGE,
    meaning: "A timestamp could not be read.",
    remedy: "Pass an ISO 8601 timestamp, for example 2026-09-01T00:00:00Z.",
    retry: "never",
  },
  {
    code: "unknown_column",
    exitCode: EXIT_USAGE,
    meaning: "A --columns entry is not a column of this view.",
    remedy: "error.remedy lists the columns. --columns has no effect under --agent; use --fields.",
    retry: "never",
  },
  {
    code: "unknown_shell",
    exitCode: EXIT_USAGE,
    meaning: "Completions are not generated for that shell.",
    remedy: "Use bash, zsh, or fish.",
    retry: "never",
  },
  {
    code: "unknown_target",
    exitCode: EXIT_USAGE,
    meaning: "The named coding agent is not one cf skill knows about.",
    remedy: "Run cf skill list --agent to see the supported ids.",
    retry: "never",
  },
  {
    code: "no_targets",
    exitCode: EXIT_USAGE,
    meaning: "No coding agent was named and none was detected in this directory.",
    remedy: "Run cf skill list --agent, then name one explicitly.",
    retry: "fix-first",
  },
  {
    code: "global_unsupported",
    exitCode: EXIT_USAGE,
    meaning: "That agent has no user-wide skill location, only a per-repository one.",
    remedy: "Drop --global, or use it with an agent that supports it.",
    retry: "never",
  },
  {
    code: "no_web_url",
    exitCode: EXIT_USAGE,
    meaning: "There is no web page for what --web was asked to open.",
    remedy: "Drop --web. It is not useful under --agent, which has no browser.",
    retry: "never",
  },
  {
    code: "finding_not_found",
    exitCode: EXIT_USAGE,
    meaning: "No finding with that id is in the scan being read.",
    remedy:
      "Finding ids belong to one scan and are replaced by a rescan. List again rather than reusing an old id.",
    retry: "fix-first",
  },
  {
    code: "finding_id_ambiguous",
    exitCode: EXIT_USAGE,
    meaning: "A shortened finding id matched more than one finding, or was too short.",
    remedy: "Pass the full id from data.findings[].id.",
    retry: "never",
  },
  {
    code: "finding_not_triageable",
    exitCode: EXIT_API,
    meaning: "The finding has no fingerprint, so a decision would not survive the next scan.",
    remedy: "Report this and stop. There is nothing durable to attach a decision to.",
    retry: "never",
  },
  {
    code: "branch_not_found",
    exitCode: EXIT_USAGE,
    meaning: "The code host has no branch by that name.",
    remedy: "Run cf branches --agent for the names the host actually has.",
    retry: "fix-first",
  },
  {
    code: "branch_not_scanned",
    exitCode: EXIT_USAGE,
    meaning: "The branch exists but has never been scanned.",
    remedy:
      "Run cf scan --branch <name> --wait --agent first. The CLI refuses to silently read the default branch instead.",
    retry: "fix-first",
  },
  {
    code: "fix_not_found",
    exitCode: EXIT_USAGE,
    meaning: "No patch has been generated for that finding.",
    remedy: "Run cf fix generate <finding-id> --wait --agent.",
    retry: "fix-first",
  },
  {
    code: "fix_not_ready",
    exitCode: EXIT_USAGE,
    meaning: "The patch exists but is not in the ready state.",
    remedy:
      "Read data.fix.status with cf fix show. Only ready can be published, and a proof needs ready, opened or merged.",
    retry: "fix-first",
  },
  {
    code: "fix_not_published",
    exitCode: EXIT_USAGE,
    meaning: "There is no pull request to merge.",
    remedy: "Run cf fix publish <finding-id> --yes --agent first, once the user has agreed.",
    retry: "fix-first",
  },
  {
    code: "fix_in_progress",
    exitCode: EXIT_USAGE,
    meaning: "A patch for that finding is already generating or publishing.",
    remedy: "Poll cf fix show <finding-id> --agent. Do not start a second one.",
    retry: "fix-first",
  },
  {
    code: "proof_not_found",
    exitCode: EXIT_USAGE,
    meaning: "No proof has been run for that finding.",
    remedy: "Run cf proof run <finding-id> --wait --agent. A patch has to exist first.",
    retry: "fix-first",
  },
  {
    code: "proof_in_progress",
    exitCode: EXIT_USAGE,
    meaning: "A proof for that finding is already running.",
    remedy: "Poll cf proof show <finding-id> --agent. Do not start a second one.",
    retry: "fix-first",
  },
  {
    code: "proof_not_settled",
    exitCode: EXIT_USAGE,
    meaning: "The proof has not finished, so it has no verdict yet.",
    remedy: "Poll cf proof show <finding-id> --agent until status is settled or failed.",
    retry: "transient",
  },
  {
    code: "proof_not_attestable",
    exitCode: EXIT_USAGE,
    meaning:
      "Only a settled secret rotation proof that came back incomplete can be attested, and only by an organization admin.",
    remedy:
      "Read data.proof.kind and data.proof.verdict with cf proof show. Nothing else can be attested by hand.",
    retry: "never",
  },
  {
    code: "invalid_env_name",
    exitCode: EXIT_USAGE,
    meaning: "An environment variable name is letters, digits and underscores, not starting with a digit.",
    remedy: "Rename it, for example DATABASE_URL.",
    retry: "fix-first",
  },
  {
    code: "env_value_required",
    exitCode: EXIT_USAGE,
    meaning: "No value was given for the environment variable.",
    remedy:
      "Pipe the value on stdin with --stdin, or pass --from-env to read the variable of the same name from your shell. The value is never taken as an argument.",
    retry: "fix-first",
  },
  {
    code: "env_var_not_found",
    exitCode: EXIT_USAGE,
    meaning: "No environment variable of that name is stored for this repository.",
    remedy: "Run cf proof env --agent to list the names that are stored.",
    retry: "never",
  },
  {
    code: "proof_env_unavailable",
    exitCode: EXIT_API,
    meaning: "Encryption is not configured on this deployment, so a value cannot be stored safely.",
    remedy: "Report it and stop. An operator has to configure encryption on the server.",
    retry: "never",
  },
  {
    code: "fix_unsafe_path",
    exitCode: EXIT_API,
    meaning: "The patch would write outside the repository, or to a path the server will not touch.",
    remedy: "Report it and stop. This is a refusal, not a transient failure.",
    retry: "never",
  },
  {
    code: "fix_proof_refuted",
    exitCode: EXIT_API,
    meaning: "Verification decided the patch does not close the finding.",
    remedy: "Report it. Regenerating may produce a different patch, but do not publish this one.",
    retry: "fix-first",
  },
  {
    code: "fix_model_unavailable",
    exitCode: EXIT_API,
    meaning:
      "This deployment has no model configured, so patches cannot be written and attacks cannot be replayed.",
    remedy: "Report it to the user. Nothing an agent runs will change it.",
    retry: "never",
  },
  {
    code: "pull_request_blocked",
    exitCode: EXIT_API,
    meaning: "A required review or status check is pending on the pull request.",
    remedy: "A person set that rule. Report it and stop. Branch protection is respected, not bypassed.",
    retry: "fix-first",
  },
  {
    code: "pull_request_conflicted",
    exitCode: EXIT_API,
    meaning: "The pull request branch conflicts with its base.",
    remedy: "Report it. Resolving the conflict is work for a person or for you in the working tree.",
    retry: "fix-first",
  },
  {
    code: "pull_request_draft",
    exitCode: EXIT_API,
    meaning: "The pull request is still a draft.",
    remedy: "Report it. Marking it ready is the user's call.",
    retry: "fix-first",
  },
  {
    code: "pull_request_closed",
    exitCode: EXIT_API,
    meaning: "The pull request was closed without merging.",
    remedy: "Report it and stop. Do not open a replacement without asking.",
    retry: "never",
  },
  {
    code: "provider_not_connected",
    exitCode: EXIT_API,
    meaning: "No account for that code host is connected to Cefense.",
    remedy:
      "Connecting an account needs a browser. Give the user the URL in error.remedy. Do not try to work around it.",
    retry: "fix-first",
  },
  {
    code: "provider_reconnect_required",
    exitCode: EXIT_API,
    meaning: "The code host token has expired.",
    remedy: "The user must reconnect in a browser. Give them the URL in error.remedy.",
    retry: "fix-first",
  },
  {
    code: "provider_unavailable",
    exitCode: EXIT_API,
    meaning: "That code host is not configured on this Cefense deployment.",
    remedy: "Report it. Run cf provider list --agent to see what is available.",
    retry: "never",
  },
  {
    code: "provider_forbidden",
    exitCode: EXIT_API,
    meaning: "The connected account may not act on that repository.",
    remedy:
      "The installation is missing the repository, or lacks write access. The user must grant it.",
    retry: "fix-first",
  },
  {
    code: "repository_unavailable",
    exitCode: EXIT_API,
    meaning: "The code host cannot serve the repository right now.",
    remedy: "Report it. It may have been renamed, deleted, or made private.",
    retry: "transient",
  },
  {
    code: "sbom_unavailable",
    exitCode: EXIT_API,
    meaning: "The scan carries no component inventory.",
    remedy: "The sbom check has to be on and the repository rescanned before there is one to export.",
    retry: "fix-first",
  },
  {
    code: "skill_missing",
    exitCode: EXIT_API,
    meaning: "The bundled Cefense skill is missing from this installation.",
    remedy: "Reinstall with npm install -g @cefense-npm/cefense-cli.",
    retry: "fix-first",
  },
  {
    code: "insecure_api_url",
    exitCode: EXIT_API,
    meaning: "CEFENSE_API_URL is not an origin the CLI will send a token to.",
    remedy: "Point it at an https origin, or at http on localhost. Nothing was sent.",
    retry: "fix-first",
  },
  {
    code: "token_origin_mismatch",
    exitCode: EXIT_API,
    meaning: "CEFENSE_TOKEN was issued for a different origin than the one being called.",
    remedy: "Report it. Do not paper over it by changing CEFENSE_TOKEN_ORIGIN without asking.",
    retry: "fix-first",
  },
  {
    code: "token_issuer_changed",
    exitCode: EXIT_API,
    meaning: "The stored token was issued by a different sign-in service than this instance now uses.",
    remedy: "The user must run cf auth login --force.",
    retry: "fix-first",
  },
  {
    code: "untrusted_discovery",
    exitCode: EXIT_API,
    meaning: "The instance advertised a sign-in configuration the CLI will not trust.",
    remedy: "Report it verbatim. This is a security refusal, and nothing was sent.",
    retry: "never",
  },
  {
    code: "feature_required",
    exitCode: EXIT_API,
    meaning: "The account does not include this capability.",
    remedy: "Tell the user, with the URL in error.remedy. Nothing you run will unlock it.",
    retry: "never",
  },
  {
    code: "allowance_exhausted",
    exitCode: EXIT_API,
    meaning: "The organization has spent its token allowance for the period.",
    remedy:
      "Run cf plan --agent to see what is left and when it resets. Nothing you run will start a scan until the period resets or the plan changes, and only the user can pay for a plan.",
    retry: "never",
  },
  {
    code: "repository_limit",
    exitCode: EXIT_API,
    meaning: "The plan covers fewer repositories than the account is trying to connect.",
    remedy:
      "Run cf plan --agent for the limit. Tell the user to disconnect a repository or move up a plan. Connecting another will keep failing until one of those happens.",
    retry: "never",
  },
  {
    code: "depth_unavailable",
    exitCode: EXIT_API,
    meaning: "The plan does not include max-depth scans.",
    remedy: "Re-run without max depth, which scans at default depth. cf plan --agent says which plans include it.",
    retry: "fix-first",
  },
  {
    code: "unknown_notification_kind",
    exitCode: EXIT_USAGE,
    meaning: "The notification named is not one the product sends.",
    remedy:
      "Use connection, scan_report, scan_failed, advisory, or fix_pr_opened. Run cf notifications --agent to read the current settings and their exact names.",
    retry: "never",
  },
  {
    code: "notification_mandatory",
    exitCode: EXIT_API,
    meaning:
      "That notification is a security notice and cannot be turned off. It is how the account owner finds out a credential for their account was granted.",
    remedy:
      "Do not retry. Tell the user it cannot be disabled, and that every other notification can be.",
    retry: "never",
  },
  {
    code: "notification_no_severity",
    exitCode: EXIT_USAGE,
    meaning: "That notification does not carry findings, so it has no severity floor.",
    remedy:
      "Only scan_report and advisory take --severity. The others are single events: a scan stopped, a pull request opened, an account was connected.",
    retry: "never",
  },
  {
    code: "notification_no_cadence",
    exitCode: EXIT_USAGE,
    meaning: "That notification happens once per event, so it has no cadence.",
    remedy: "Only scan_report takes --cadence, because it is the only one that repeats.",
    retry: "never",
  },
  {
    code: "invalid_cadence",
    exitCode: EXIT_USAGE,
    meaning: "The cadence named is not one the product models.",
    remedy: "Use every for one email per event, or daily for at most one a day.",
    retry: "never",
  },
  {
    code: "repository_not_found",
    exitCode: EXIT_USAGE,
    meaning: "The repository named is not connected to this organization.",
    remedy:
      "Run cf repo list --agent for the names that are, and pass one of those as owner/name.",
    retry: "never",
  },
  {
    code: "ambiguous_repository",
    exitCode: EXIT_USAGE,
    meaning: "The repository name given matches more than one connected repository.",
    remedy: "Name it in full as owner/name. Run cf repo list --agent to read the exact names.",
    retry: "never",
  },
  {
    code: "invalid_plan",
    exitCode: EXIT_USAGE,
    meaning: "The plan named is not one that can be bought.",
    remedy: "Use plus, pro, or max. free is what an organization falls back to, not something to buy.",
    retry: "never",
  },
  {
    code: "invalid_seats",
    exitCode: EXIT_USAGE,
    meaning: "The --seats value is not a seat count.",
    remedy: "Pass a whole number from 0 to 500. It counts seats beyond the ones the plan already includes.",
    retry: "never",
  },
  {
    code: "billing_unavailable",
    exitCode: EXIT_API,
    meaning: "This Cefense deployment has no billing configured, so nothing can be bought on it.",
    remedy: "Report it. cf plan --agent still reports the plan and the meter, and no flag turns billing on.",
    retry: "never",
  },
  {
    code: "billing_forbidden",
    exitCode: EXIT_API,
    meaning: "Only an owner or admin of the organization may change what it pays.",
    remedy:
      "Report it and stop. cf plan --agent reads the meter from any role, and data.canAdministerBilling says whether this account could have changed it.",
    retry: "never",
  },
  {
    code: "no_subscription",
    exitCode: EXIT_API,
    meaning: "The organization has never subscribed, so there is no billing account to manage.",
    remedy:
      "There is no portal until something has been bought. Run cf plan upgrade <plan> --agent and give the user the checkout URL it prints.",
    retry: "fix-first",
  },
  {
    code: "plan_unavailable",
    exitCode: EXIT_API,
    meaning: "That plan, or the extra seats asked for, is not on sale on this deployment yet.",
    remedy:
      "Report it verbatim. The price does not exist in the payment provider, which only an operator can create.",
    retry: "never",
  },
  {
    code: "already_subscribed",
    exitCode: EXIT_API,
    meaning: "The organization already has a subscription, so a new one cannot be started.",
    remedy:
      "Changing an existing plan happens in the workspace, under Plan and usage, because it is prorated and charged immediately. Tell the user rather than retrying.",
    retry: "never",
  },
  {
    code: "api_error",
    exitCode: EXIT_API,
    meaning: "The Cefense API failed and gave no more specific code.",
    remedy: "Retry once. If it fails again, report error.message verbatim.",
    retry: "transient",
  },
  {
    code: "internal_error",
    exitCode: EXIT_API,
    meaning: "The CLI itself threw something it did not expect.",
    remedy: "Report error.message verbatim. This is a bug worth telling the user about.",
    retry: "transient",
  },
];

export interface PreconditionEntry {
  code: string;
  meaning: string;
  resolvedBy: "agent" | "user";
  remedy: string;
}

/**
 * What `cf agent check` reports in `data.blockers[].code`.
 *
 * A separate vocabulary from ERROR_CODES on purpose: these are states, not
 * failures, and nothing threw. `resolvedBy` is the part that matters, because
 * it says whether an agent can clear the blocker itself or has to stop and ask
 * the user for something only a browser can do.
 */
export const PRECONDITION_CODES: PreconditionEntry[] = [
  {
    code: "auth_required",
    meaning: "No usable credentials for this Cefense instance.",
    resolvedBy: "user",
    remedy: "Ask the user to run cf auth login, then poll cf auth status --agent.",
  },
  {
    code: "no_repositories",
    meaning: "The account has no connected repository.",
    resolvedBy: "agent",
    remedy:
      "cf repo connect `owner/name` --agent, once a code host account is connected. Connecting the account needs a browser.",
  },
  {
    code: "repository_not_connected",
    meaning: "The requested repository is not one of the connected ones.",
    resolvedBy: "agent",
    remedy: "cf repo list --agent for the names that are.",
  },
  {
    code: "repository_not_specified",
    meaning: "No repository was named, and agent mode does not infer one from the directory.",
    resolvedBy: "agent",
    remedy: "Pass --repo owner/name, or set CEFENSE_REPO once for the session.",
  },
  {
    code: "not_scanned",
    meaning: "The repository has never been scanned, so there are no findings to read.",
    resolvedBy: "agent",
    remedy: "cf scan --repo `owner/name` --wait --agent.",
  },
  {
    code: "api_error",
    meaning: "The Cefense instance could not be reached at all.",
    resolvedBy: "agent",
    remedy: "Retry once, then report it. Check CEFENSE_API_URL if it is set.",
  },
];

const BY_CODE = new Map(ERROR_CODES.map((entry) => [entry.code, entry]));

export function errorCode(code: string): ErrorCodeEntry | null {
  return BY_CODE.get(code) ?? null;
}

/**
 * Codes the API uses on the wire, and the CLI code each becomes.
 *
 * The API names a failure from its own side of the boundary (`in_progress`,
 * `not_ready`), which says nothing about which of several things is in
 * progress once it reaches an agent. Translating here is what lets an agent
 * branch on one vocabulary rather than two, and it is why these codes reach
 * --agent output at all instead of collapsing into api_error.
 */
export const WIRE_ERROR_CODES: Record<string, string> = {
  pull_request_blocked: "pull_request_blocked",
  pull_request_conflicted: "pull_request_conflicted",
  pull_request_draft: "pull_request_draft",
  pull_request_closed: "pull_request_closed",
  in_progress: "fix_in_progress",
  not_ready: "fix_not_ready",
  fix_not_ready: "fix_not_ready",
  unsafe_path: "fix_unsafe_path",
  proof_refuted: "fix_proof_refuted",
  fix_required: "fix_not_found",
  not_attestable: "proof_not_attestable",
  proof_in_progress: "proof_in_progress",
  model_required: "fix_model_unavailable",
  github_required: "provider_not_connected",
  github_reconnect: "provider_reconnect_required",
  github_forbidden: "provider_forbidden",
  repo_unavailable: "repository_unavailable",
  feature_required: "feature_required",
  allowance_exhausted: "allowance_exhausted",
  repository_limit: "repository_limit",
  depth_unavailable: "depth_unavailable",
  billing_unavailable: "billing_unavailable",
  billing_forbidden: "billing_forbidden",
  no_subscription: "no_subscription",
  already_subscribed: "already_subscribed",
  plan_unavailable: "plan_unavailable",
  unknown_notification_kind: "unknown_notification_kind",
  notification_mandatory: "notification_mandatory",
  notification_no_severity: "notification_no_severity",
  notification_no_cadence: "notification_no_cadence",
  invalid_plan: "invalid_plan",
  duplicate_email: "duplicate_email",
  organization_required: "organization_required",
  organization_not_found: "organization_not_found",
  organization_forbidden: "organization_forbidden",
};

export function translateWireCode(value: unknown): ErrorCodeEntry | null {
  if (typeof value !== "string") return null;
  const mapped = WIRE_ERROR_CODES[value];
  return mapped ? errorCode(mapped) : null;
}
