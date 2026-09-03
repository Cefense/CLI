import open from "open";
import { deleteCredentials, keychainName, listStoredOrigins, loadCredentials, saveCredentials } from "../core/credentials.js";
import { assertVersionSupported, fetchDiscovery } from "../core/discovery.js";
import { exchangeCode, requestAuthorizationCode, revokeToken } from "../core/oauth.js";
import { resolveApiUrl } from "../core/config.js";
import { CefenseClient } from "../core/client.js";
import { CefenseError } from "../core/errors.js";
import type { GlobalOptions } from "../core/session.js";
import { openSession } from "../core/session.js";
import * as out from "../ui/output.js";
import { confirm, spinner } from "../ui/prompts.js";
import { c, glyph } from "../ui/theme.js";
import { keyValue } from "../ui/table.js";
import { VERSION } from "../version.js";

export async function authLogin(
  globals: GlobalOptions,
  options: { force?: boolean } = {},
): Promise<number> {
  const apiUrl = resolveApiUrl(globals.apiUrl);
  const existing = await loadCredentials(apiUrl);

  if (existing.backend === "environment") {
    out.warn("CEFENSE_TOKEN is set, so the CLI is already authenticated from the environment.");
    out.hint("Unset it to sign in interactively.");
    return 0;
  }

  if (existing.credentials && !options.force) {
    out.line();
    out.success(`Already signed in to ${c.bold(apiUrl)}${existing.credentials.email ? ` as ${existing.credentials.email}` : ""}.`);
    out.hint("Run cf auth login --force to sign in again.");
    out.line();
    return 0;
  }

  const config = await fetchDiscovery(apiUrl, { refresh: true });
  assertVersionSupported(config);

  out.heading("Cefense", `${apiUrl}  ·  cli ${VERSION}`);

  const progress = spinner();
  let authorization;
  try {
    authorization = await requestAuthorizationCode(config, {
      onUrl: (url) => {
        out.info("Opening your browser to sign in. If it does not open, paste this:");
        out.line();
        out.line(`    ${c.cyan(url)}`);
        out.line();
        void open(url).catch(() => undefined);
        progress.start("Waiting for authentication in the browser");
      },
    });
  } catch (error) {
    progress.stop("Sign-in did not complete", "fail");
    throw error;
  }
  progress.stop("Browser sign-in complete");

  const credentials = await exchangeCode(config, authorization);

  const client = new CefenseClient({ apiUrl, config, credentials });
  const me = await client.me().catch((error: unknown) => {
    throw new CefenseError("Signed in, but that token could not read your Cefense account.", {
      remedy: "Run cf doctor to check the API, then try again.",
      cause: error,
    });
  });

  const saved = await saveCredentials(apiUrl, {
    ...credentials,
    subject: me.user.id,
    email: me.user.email,
  });

  out.line();
  out.success(`Signed in as ${c.bold(me.user.email)}`);
  out.hint(
    saved.backend === "keychain"
      ? `Token stored in ${keychainName()}.`
      : `Token stored in a local file.`,
  );
  if (saved.warning) out.warn(saved.warning);

  const github = await client.githubStatus().catch(() => null);
  out.line();
  if (github && !github.connected) {
    out.info("Next: connect a repository");
    out.line(`    ${c.dim("cf repo connect")}`);
  } else {
    out.info("Next: see what is connected");
    out.line(`    ${c.dim("cf status")}`);
  }
  out.line();
  return 0;
}

export async function authLogout(
  globals: GlobalOptions,
  options: { all?: boolean } = {},
): Promise<number> {
  const targets = options.all
    ? [...new Set([resolveApiUrl(globals.apiUrl), ...(await listStoredOrigins())])]
    : [resolveApiUrl(globals.apiUrl)];

  let signedOut = 0;
  for (const apiUrl of targets) {
    const { credentials, backend } = await loadCredentials(apiUrl);
    if (!credentials) continue;
    if (backend === "environment") {
      out.warn(`${apiUrl} is authenticated through CEFENSE_TOKEN, which the CLI cannot clear.`);
      out.hint("Unset CEFENSE_TOKEN in your shell.");
      continue;
    }

    if (!options.all && !globals.yes) {
      const proceed = await confirm({
        message: `Sign out of ${apiUrl}${credentials.email ? ` as ${credentials.email}` : ""}?`,
        initialValue: true,
        assumeYes: globals.yes,
      });
      if (!proceed) {
        out.line();
        out.info("Left signed in.");
        out.line();
        return 0;
      }
    }

    out.line();
    const config = await fetchDiscovery(apiUrl).catch(() => null);
    if (config) {
      const revoked = await revokeToken(config, credentials.refreshToken ?? credentials.accessToken);
      if (revoked) out.success("Token revoked");
      else out.warn("The token could not be revoked remotely, so it will expire on its own.");
    } else {
      out.warn("The Cefense API was unreachable, so the token could not be revoked remotely.");
    }

    await deleteCredentials(apiUrl);
    out.success(`Credentials removed for ${apiUrl}`);
    signedOut += 1;
  }

  if (signedOut === 0) {
    out.line();
    out.info("You were not signed in.");
  }
  out.line();
  return 0;
}

export async function authStatus(globals: GlobalOptions): Promise<number> {
  const session = await openSession(globals, { auth: false });

  if (!session.credentials) {
    if (out.isJsonMode()) {
      out.json({ apiUrl: session.apiUrl, authenticated: false });
      return 3;
    }
    out.line();
    out.warn(`Not signed in to ${session.apiUrl}.`);
    out.hint("Run cf auth login.");
    out.line();
    return 3;
  }

  const [me, github, billing] = await Promise.all([
    session.client.me(),
    session.client.githubStatus().catch(() => null),
    session.client.billing().catch(() => null),
  ]);

  if (out.isJsonMode()) {
    out.json({
      apiUrl: session.apiUrl,
      authenticated: true,
      user: me.user,
      credentialBackend: session.backend,
      github,
      billing,
    });
    return 0;
  }

  out.heading("Cefense", session.apiUrl);
  const rows: Array<[string, string]> = [
    ["Account", `${me.user.email}`],
    [
      "Credentials",
      session.backend === "keychain"
        ? keychainName()
        : session.backend === "environment"
          ? "CEFENSE_TOKEN environment variable"
          : "local file",
    ],
  ];
  if (github) {
    rows.push([
      "GitHub",
      github.connected ? `connected as ${github.login}` : c.yellow("not connected"),
    ]);
  }
  out.lines(keyValue(rows).map((row) => `  ${row}`));

  if (billing) {
    out.section("Entitlements");
    const entries = Object.entries(billing.entitlements).map(([feature, granted]) =>
      granted ? c.green(`${glyph.check} ${feature}`) : c.dim(`${glyph.ring} ${feature}`),
    );
    out.line(`  ${entries.join("   ")}`);
  }
  out.line();
  return 0;
}
