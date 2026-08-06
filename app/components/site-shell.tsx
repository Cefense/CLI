"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const coreNavigation = [
  { href: "/", label: "Home", accent: "mint" },
  { href: "/product", label: "Product", accent: "blue" },
  { href: "/docs", label: "Docs", accent: "mint" },
];

export function SiteHeader({ mode = "marketing" }: { mode?: "marketing" | "core" }) {
  const pathname = usePathname() || "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/profile", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<{
          viewer?: { displayName?: string; email?: string };
        }>;
      })
      .then((data) => {
        const identity = data?.viewer?.displayName || data?.viewer?.email;
        if (identity) setViewer(identity);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const items = coreNavigation;
  const accountAction = viewer ? (
    <>
      <span className="viewer-name">{viewer}</span>
      <Link className="workspace-link" href="/app">
        Open workspace
      </Link>
    </>
  ) : (
    <Link className="login-link" href="/login?return_to=%2Fapp">
      Log in
    </Link>
  );

  return (
    <>
      <header className={`site-header command-header public-glass-header${mode === "core" ? " core-header" : ""}`}>
        <Link className="wordmark" href="/" aria-label="Cefense home">
          <span className="wordmark-dot" aria-hidden="true" /> CEFENSE
        </Link>
        <button
          className="command-menu-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="public-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          Menu
        </button>
        <div
          id="public-navigation"
          className={`command-nav-wrap${menuOpen ? " is-open" : ""}`}
        >
          <nav className="command-nav-group" aria-label="Main navigation">
            {items.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={active ? "active" : ""}
                  data-accent={item.accent}
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        {mode !== "core" && <div className="site-actions">{accountAction}</div>}
      </header>
      {mode === "core" && <div className="core-login-action">{accountAction}</div>}
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer cyberus-footer">
      <div className="footer-brand">
        <Link className="wordmark footer-wordmark" href="/">
          <span className="wordmark-dot" /> CEFENSE
        </Link>
        <p>Attack-to-code immunity. Observed once, closed for good.</p>
        <div className="footer-social">
          <a aria-label="GitHub" href="https://github.com/greenarnav/Cefense" target="_blank" rel="noreferrer">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>
            </svg>
          </a>
          <a aria-label="LinkedIn" href="https://www.linkedin.com/company/cefense/?viewAsMember=true" target="_blank" rel="noreferrer">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path fill="currentColor" d="M13.63 0H2.37A2.35 2.35 0 0 0 0 2.32v11.36A2.35 2.35 0 0 0 2.37 16h11.26A2.35 2.35 0 0 0 16 13.68V2.32A2.35 2.35 0 0 0 13.63 0ZM4.84 13.63H2.4V6.03h2.44v7.6ZM3.62 4.97a1.42 1.42 0 1 1 0-2.83 1.42 1.42 0 0 1 0 2.83Zm10.01 8.66h-2.44V9.94c0-.91-.02-2.08-1.27-2.08-1.27 0-1.46.99-1.46 2.01v3.76H6.02V6.03h2.34v1.04h.03c.33-.62 1.12-1.27 2.31-1.27 2.47 0 2.93 1.63 2.93 3.74v4.09Z"/>
            </svg>
          </a>
        </div>
      </div>
      <nav className="footer-cols">
        <div>
          <span>Product</span>
          <Link href="/">Home</Link>
          <Link href="/product">Product</Link>
          <Link href="/docs">Docs</Link>
          <Link href="/pricing">Pricing</Link>
        </div>
        <div>
          <span>Resources</span>
          <Link href="/docs">Docs</Link>
          <Link href="/company">Company</Link>
          <a href="mailto:team@cefense.com">team@cefense.com</a>
          <a href="mailto:hello@cefense.com">hello@cefense.com</a>
        </div>
        <div>
          <span>Legal</span>
          <a href="#privacy">Privacy</a>
          <a href="#terms">Terms</a>
        </div>
      </nav>
    </footer>
  );
}
