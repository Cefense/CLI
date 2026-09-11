export { CefenseClient, type RepoSettings } from "./client.js";
export { openSession, type GlobalOptions, type Session } from "./session.js";
export { fetchDiscovery, assertVersionSupported, compareVersions } from "./discovery.js";
export {
  loadCredentials,
  saveCredentials,
  deleteCredentials,
  listStoredOrigins,
  credentialsFromEnvironment,
  keychainName,
  type CredentialBackend,
  type CredentialState,
} from "./credentials.js";
export {
  challengeFor,
  createPkcePair,
  exchangeCode,
  redirectPorts,
  refreshCredentials,
  requestAuthorizationCode,
  revokeToken,
} from "./oauth.js";
export {
  DEFAULT_API_URL,
  dataDir,
  normaliseApiUrl,
  readPreferences,
  readActiveOrganization,
  readRepoDefault,
  resolveApiUrl,
  writeActiveOrganization,
  writePreferences,
  writeRepoDefault,
  clearRepoDefault,
} from "./config.js";
export {
  compactAuditEvent,
  compactBranch,
  compactCommit,
  compactFinding,
  compactFindingDetail,
  compactFix,
  compactOrganization,
  compactProject,
  prune,
  AGENT_SCHEMA_VERSION,
} from "./compact.js";
export {
  defaultScope,
  gitRemote,
  gitToplevel,
  matchProject,
  parseGitRemote,
  parseGithubRemote,
  parseRepoArgument,
  resolveProject,
  type RepoLocation,
  type Resolution,
} from "./repo.js";
export {
  ORGANIZATION_ROLES,
  activeOrganization,
  resolveOrganization,
  setOrganizationFlag,
  type ActiveOrganization,
  type Organization,
  type OrganizationRole,
  type OrganizationsResponse,
  type OrganizationSource,
} from "./organizations.js";
export {
  PROVIDERS,
  blobUrl,
  commitUrl,
  parseProvider,
  providerFromRepoId,
  providerHost,
  providerLabel,
  providerOf,
  treeUrl,
  type Provider,
} from "./providers.js";
export {
  AuthRequiredError,
  CancelledError,
  CefenseError,
  FeatureRequiredError,
  UsageError,
  isCefenseError,
  EXIT_API,
  EXIT_AUTH,
  EXIT_FINDINGS,
  EXIT_INTERRUPTED,
  EXIT_OK,
  EXIT_USAGE,
} from "./errors.js";
export type * from "./types.js";
