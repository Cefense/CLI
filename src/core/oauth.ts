import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { CefenseError, CancelledError } from "./errors.js";
import { USER_AGENT } from "../version.js";
import type { CliConfigResponse, StoredCredentials } from "./types.js";

const LOGIN_TIMEOUT_MS = 5 * 60_000;

function base64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function challengeFor(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  return { verifier, challenge: challengeFor(verifier) };
}

export function constantTimeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function redirectPorts(redirectUris: string[]): number[] {
  const ports: number[] = [];
  for (const uri of redirectUris) {
    try {
      const parsed = new URL(uri);
      const port = Number.parseInt(parsed.port, 10);
      if (Number.isInteger(port) && port > 0) ports.push(port);
    } catch {
      continue;
    }
  }
  return ports;
}

function resultPage(title: string, message: string, ok: boolean): string {
  const accent = ok ? "#1f9d55" : "#c53030";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Cefense</title><style>
:root{color-scheme:light dark}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d10;color:#e6e8eb;
font:16px/1.6 ui-sans-serif,-apple-system,Segoe UI,Roboto,sans-serif}
.card{max-width:26rem;padding:2.5rem;text-align:center}
h1{font-size:1.25rem;margin:0 0 .5rem;color:${accent}}
p{margin:0;color:#9aa3ad}
</style></head><body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;
}

async function listenOnFirstFreePort(server: Server, ports: number[]): Promise<number> {
  const candidates = ports.length > 0 ? ports : [0];
  let lastError: unknown = null;
  for (const port of candidates) {
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: unknown) => {
          server.removeListener("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          server.removeListener("error", onError);
          resolve();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, "127.0.0.1");
      });
      return (server.address() as AddressInfo).port;
    } catch (error) {
      lastError = error;
    }
  }
  throw new CefenseError(
    `Could not open a local callback listener on any of ports ${candidates.join(", ")}.`,
    {
      remedy: "Free one of those ports and try again.",
      cause: lastError,
    },
  );
}

export interface AuthorizationCode {
  code: string;
  redirectUri: string;
  verifier: string;
}

export async function requestAuthorizationCode(
  config: CliConfigResponse,
  handlers: { onUrl: (url: string) => void },
): Promise<AuthorizationCode> {
  const { verifier, challenge } = createPkcePair();
  const state = base64url(randomBytes(16));

  let settle: ((value: AuthorizationCode) => void) | null = null;
  let fail: ((error: unknown) => void) | null = null;
  const pending = new Promise<AuthorizationCode>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });

  let redirectUri = "";

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/callback") {
      response.writeHead(404).end();
      return;
    }

    const send = (status: number, title: string, message: string, ok: boolean) => {
      response.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(resultPage(title, message, ok));
    };

    const error = url.searchParams.get("error");
    if (error) {
      send(400, "Sign-in failed", url.searchParams.get("error_description") ?? error, false);
      fail?.(new CefenseError(`Authorization failed: ${url.searchParams.get("error_description") ?? error}`));
      return;
    }

    const returnedState = url.searchParams.get("state") ?? "";
    if (!constantTimeEquals(returnedState, state)) {
      send(400, "Sign-in failed", "The security check on this response did not match.", false);
      fail?.(new CefenseError("The authorization response failed its state check."));
      return;
    }

    const issuer = url.searchParams.get("iss");
    if (issuer && issuer.replace(/\/+$/, "") !== config.auth.issuer.replace(/\/+$/, "")) {
      send(400, "Sign-in failed", "This response came from an unexpected identity provider.", false);
      fail?.(new CefenseError("The authorization response came from an unexpected issuer."));
      return;
    }

    const code = url.searchParams.get("code");
    if (!code) {
      send(400, "Sign-in failed", "No authorization code was returned.", false);
      fail?.(new CefenseError("The authorization response carried no code."));
      return;
    }

    send(200, "You are signed in", "Return to your terminal to continue.", true);
    settle?.({ code, redirectUri, verifier });
  });

  const port = await listenOnFirstFreePort(server, redirectPorts(config.auth.redirectUris));
  redirectUri = `http://127.0.0.1:${port}/callback`;

  const authorizeUrl = new URL(config.auth.authorizationEndpoint);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", config.auth.clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", config.auth.scopes.join(" "));
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", config.auth.codeChallengeMethod || "S256");

  handlers.onUrl(authorizeUrl.toString());

  const timeout = setTimeout(() => {
    fail?.(
      new CefenseError("Timed out waiting for the browser sign-in to finish.", {
        remedy:
          `If the browser showed an OAuth error instead of a sign-in page, ${redirectUri} ` +
          "is probably not registered on the Clerk OAuth application.",
      }),
    );
  }, LOGIN_TIMEOUT_MS);

  const onInterrupt = () => fail?.(new CancelledError("Sign-in cancelled."));
  process.once("SIGINT", onInterrupt);

  try {
    return await pending;
  } finally {
    clearTimeout(timeout);
    process.removeListener("SIGINT", onInterrupt);
    server.close();
  }
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

async function postForm(url: string, body: Record<string, string>): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
      "user-agent": USER_AGENT,
    },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(30_000),
  });
}

function toCredentials(config: CliConfigResponse, token: TokenResponse, previousRefresh: string | null): StoredCredentials {
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? previousRefresh,
    expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : null,
    subject: null,
    email: null,
    clientId: config.auth.clientId,
    issuer: config.auth.issuer,
  };
}

export async function exchangeCode(
  config: CliConfigResponse,
  authorization: AuthorizationCode,
): Promise<StoredCredentials> {
  const response = await postForm(config.auth.tokenEndpoint, {
    grant_type: "authorization_code",
    code: authorization.code,
    redirect_uri: authorization.redirectUri,
    code_verifier: authorization.verifier,
    client_id: config.auth.clientId,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new CefenseError(`The identity provider rejected the sign-in (${response.status}).`, {
      remedy: detail ? `It said: ${detail.slice(0, 300)}` : "Run cf auth login again.",
    });
  }
  return toCredentials(config, (await response.json()) as TokenResponse, null);
}

export async function refreshCredentials(
  config: CliConfigResponse,
  refreshToken: string,
): Promise<StoredCredentials> {
  const response = await postForm(config.auth.tokenEndpoint, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.auth.clientId,
  });
  if (!response.ok) {
    throw new CefenseError("Your saved sign-in could not be refreshed.", {
      remedy: "Run cf auth login.",
    });
  }
  return toCredentials(config, (await response.json()) as TokenResponse, refreshToken);
}

export async function revokeToken(config: CliConfigResponse, token: string): Promise<boolean> {
  try {
    const response = await postForm(config.auth.revocationEndpoint, {
      token,
      token_type_hint: "refresh_token",
      client_id: config.auth.clientId,
    });
    return response.ok;
  } catch {
    return false;
  }
}
