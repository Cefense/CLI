export { CefenseClient } from "./client.js";
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
  readRepoDefault,
  resolveApiUrl,
  writePreferences,
  writeRepoDefault,
  clearRepoDefault,
} from "./config.js";
export {
  defaultScope,
  gitRemote,
  gitToplevel,
  matchProject,
  parseGithubRemote,
  parseRepoArgument,
  resolveProject,
  type RepoLocation,
  type Resolution,
} from "./repo.js";
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
