import Link from "next/link";
import {
  chatGPTSignInPath,
  safeRelativeReturnPath,
} from "../chatgpt-auth";
import { SiteFooter, SiteHeader } from "../components/site-shell";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const returnTo = safeRelativeReturnPath(
    typeof params?.return_to === "string" ? params.return_to : "/app",
  );
  const error = params?.error === "email";

  return (
    <main className="public-page login-page">
      <SiteHeader />
      <section className="login-shell" aria-labelledby="login-title">
        <div className="login-copy">
          <p className="section-label">Cefense access</p>
          <h1 id="login-title">Open the workspace.</h1>
          <p>
            Choose the path that works for this session. Every option lands in
            the Cefense app.
          </p>
        </div>
        <div className="login-panel">
          <Link
            className="login-provider google-provider"
            href={`/api/auth/google?return_to=${encodeURIComponent(returnTo)}`}
          >
            <span>G</span>
            Continue with Google
          </Link>
          <Link
            className="login-provider chatgpt-provider"
            href={chatGPTSignInPath(returnTo)}
          >
            <span>AI</span>
            Continue with ChatGPT
          </Link>
          <form
            className="email-login-form"
            action="/api/auth/email"
            method="post"
          >
            <input type="hidden" name="return_to" value={returnTo} />
            <label htmlFor="email-login">Email</label>
            <div>
              <input
                id="email-login"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@company.com"
                required
              />
              <button type="submit">Continue</button>
            </div>
            {error && (
              <p className="login-error" role="alert">
                Enter a valid email address.
              </p>
            )}
          </form>
          <Link
            className="guest-login-link"
            href={`/api/auth/guest?return_to=${encodeURIComponent(returnTo)}`}
          >
            Continue as guest
          </Link>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
