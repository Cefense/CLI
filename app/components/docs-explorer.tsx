"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

// DATA SOURCE: GET /api/library?q= (see API_CONTRACT.md).
type Article = { category: string; title: string; blurb: string };

const ARTICLES: Article[] = [
  { category: "Authentication", title: "Session replay and ownership boundaries", blurb: "Why a valid token isn't a valid session, and where the ownership recheck belongs." },
  { category: "Authentication", title: "Device-code flows and the admin handoff", blurb: "How a replayed device code walks a low-privilege login into an admin route." },
  { category: "Authentication", title: "JWT confusion: alg, kid, and audience", blurb: "The three claims attackers pivot on, and the checks that actually close them." },
  { category: "Cloud", title: "Metadata SSRF across redirect chains", blurb: "Reaching the instance metadata endpoint through a permissive redirect." },
  { category: "Cloud", title: "IAM role chaining and the confused deputy", blurb: "When a trusted service assumes a role it was never meant to reach." },
  { category: "Cloud", title: "Public exposure that scanners miss", blurb: "Buckets and services that read as private but resolve as reachable." },
  { category: "Supply chain", title: "Package ownership-transfer risk", blurb: "A dependency changes hands, then changes behavior in your build." },
  { category: "Supply chain", title: "Postinstall scripts in the production image", blurb: "Where untrusted code executes during image assembly, and how to gate it." },
  { category: "Supply chain", title: "Lockfile drift and dependency confusion", blurb: "How an internal name resolves to a public package under the wrong registry." },
  { category: "AI agents", title: "Delegated tool-permission boundaries", blurb: "An agent inherits more than it should when tool scopes aren't isolated." },
  { category: "AI agents", title: "Prompt-routed SSRF in tool calls", blurb: "Model output that steers a tool into an internal request." },
  { category: "Containers", title: "Base-image provenance and runtime drift", blurb: "Proving the image you scanned is the image that runs." },
  { category: "Containers", title: "Build-cache poisoning of untrusted layers", blurb: "A restored cache layer smuggles a change past review." },
  { category: "Identity", title: "Object authorization and role drift", blurb: "Per-object checks that quietly rot as roles accumulate." },
  { category: "Data exposure", title: "PII on the path to a public endpoint", blurb: "Tracing sensitive fields from store to response, one call at a time." },
  { category: "Post-quantum", title: "Cryptographic inventory and migration paths", blurb: "Finding every place a quantum-vulnerable primitive is still in use." },
  { category: "Post-quantum", title: "Where RSA and ECDH still hide", blurb: "Certificates, protocols, and libraries that outlive the migration plan." },
  { category: "Method", title: "How Cefense decides a path is reachable", blurb: "The reachability model behind every match, in plain language." },
];

export function DocsExplorer() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ARTICLES.map((article, index) => ({ article, index })).filter(
      ({ article }) =>
        q === "" ||
        `${article.category} ${article.title} ${article.blurb}`
          .toLowerCase()
          .includes(q),
    );
  }, [query]);

  return (
    <div className="docs-explorer">
      <div className="docs-glass-wrap">
        {/* Liquid-glass search — collapsed to a magnifier, expands on tap. */}
        <div className={`docs-glass${open || query ? " open" : ""}`}>
          <button
            type="button"
            className="docs-glass-btn"
            aria-label="Search the docs"
            onClick={() => setOpen(true)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
              <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onBlur={() => {
              if (!query) setOpen(false);
            }}
            placeholder="Search the docs…"
            aria-label="Search the docs"
          />
        </div>
      </div>

      <div className="docs-grid">
        {visible.map(({ article, index }, position) => (
          <a
            key={article.title}
            className="docs-card"
            href="#"
            style={{ "--i": Math.min(position, 14) } as CSSProperties}
          >
            <span className="docs-num">{String(index + 1).padStart(2, "0")}</span>
            <div className="docs-card-body">
              <strong>{article.title}</strong>
              <p>{article.blurb}</p>
            </div>
          </a>
        ))}
        {visible.length === 0 && (
          <div className="docs-empty">
            <strong>No docs match “{query}”.</strong>
            <span>Try another attack class, or clear the search.</span>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setOpen(false);
              }}
            >
              Reset
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
