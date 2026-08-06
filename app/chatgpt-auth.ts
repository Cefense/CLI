import { env as workerEnv } from "cloudflare:workers";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export type ChatGPTUser = {
  displayName: string;
  email: string;
  fullName: string | null;
};

const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER =
  "oai-authenticated-user-full-name-encoding";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";
const SIGN_IN_PATH = "/signin-with-chatgpt";
const SIGN_OUT_PATH = "/signout-with-chatgpt";
const CALLBACK_PATH = "/callback";
const LOGIN_PATH = "/login";
const SESSION_COOKIE = "cyberus_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

type CefenseSession = {
  email: string;
  displayName: string;
  fullName: string | null;
  provider: "email" | "google" | "guest";
};

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const devUser = devChatGPTUser();
  if (devUser) return devUser;

  const requestHeaders = await headers();
  const email = requestHeaders.get(USER_EMAIL_HEADER);
  if (!email) return getCyberusSessionUser();

  const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
  const fullName =
    encodedFullName &&
    requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
      ? safeDecodeURIComponent(encodedFullName)
      : null;

  return {
    displayName: fullName ?? email,
    email,
    fullName,
  };
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  redirect(await absoluteServerPath(cyberusLoginPath(returnTo)));
}

export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = "/"): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function cyberusLoginPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${LOGIN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function createCyberusSessionCookie(session: CefenseSession) {
  return {
    name: SESSION_COOKIE,
    value: encodeURIComponent(JSON.stringify(session)),
    options: {
      httpOnly: true,
      maxAge: SESSION_MAX_AGE,
      path: "/",
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
    },
  };
}

export function clearCyberusSessionCookie() {
  return {
    name: SESSION_COOKIE,
    value: "",
    options: {
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
    },
  };
}

export function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";
  if (isReservedAuthPath(url.pathname)) return "/";

  return `${url.pathname}${url.search}${url.hash}`;
}

export function absoluteRequestUrl(request: Request, path: string): URL {
  const requestUrl = new URL(request.url);
  const headers = request.headers;
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? requestUrl.host;
  const protocol = isLocalHost(host)
    ? "http"
    : headers.get("x-forwarded-proto") ?? requestUrl.protocol.replace(":", "");
  return new URL(path, `${protocol}://${host}`);
}

async function absoluteServerPath(path: string): Promise<string> {
  if (!path.startsWith("/") || path.startsWith("//")) return "/";

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) return path;

  const forwardedProtocol = requestHeaders.get("x-forwarded-proto");
  const protocol = isLocalHost(host)
    ? "http"
    : host.endsWith(".run.app") ? "https" : forwardedProtocol ?? "https";
  return new URL(path, `${protocol}://${host}`).toString();
}

function isLocalHost(host: string): boolean {
  const hostname = host.split(":")[0];
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function isReservedAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CALLBACK_PATH ||
    pathname === LOGIN_PATH ||
    pathname.startsWith("/api/auth/")
  );
}

async function getCyberusSessionUser(): Promise<ChatGPTUser | null> {
  const cookieStore = await cookies();
  const rawSession = cookieStore.get(SESSION_COOKIE)?.value;
  if (!rawSession) return null;

  let session: CefenseSession;
  try {
    session = JSON.parse(decodeURIComponent(rawSession)) as CefenseSession;
  } catch {
    return null;
  }

  if (!isValidSession(session)) return null;
  return {
    displayName: session.displayName,
    email: session.email,
    fullName: session.fullName,
  };
}

function isValidSession(value: Partial<CefenseSession>): value is CefenseSession {
  return (
    typeof value.email === "string" &&
    value.email.length <= 160 &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.email) &&
    typeof value.displayName === "string" &&
    value.displayName.length > 0 &&
    value.displayName.length <= 120 &&
    (value.fullName === null || typeof value.fullName === "string") &&
    (value.provider === "email" ||
      value.provider === "google" ||
      value.provider === "guest")
  );
}

// Local-dev-only bypass: the Sites proxy that injects the auth headers doesn't
// exist under `vinext dev`, so an explicit CEFENSE_DEV_USER_EMAIL var (set via
// .dev.vars, which is local-only) can stand in for a signed-in user. Dead in
// production (NODE_ENV guard + the var is never deployed).
function devChatGPTUser(): ChatGPTUser | null {
  if (process.env.NODE_ENV === "production") return null;
  const email =
    process.env.CEFENSE_DEV_USER_EMAIL ??
    (workerEnv as Record<string, unknown>)["CEFENSE_DEV_USER_EMAIL"];
  if (typeof email !== "string" || !email) return null;
  return { displayName: "Dev User", email, fullName: "Dev User" };
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
