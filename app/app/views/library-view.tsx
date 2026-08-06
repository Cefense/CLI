"use client";

import { useState } from "react";

export function LibraryView() {
  // DATA SOURCE: GET /api/library?q= (see API_CONTRACT.md)
  const articles = [
    [
      "Authentication",
      "Session replay and ownership boundaries",
      "CISA · Project Zero · incident research",
    ],
    [
      "Cloud",
      "Metadata SSRF across redirect chains",
      "Mandiant · Unit 42 · cloud advisories",
    ],
    [
      "Supply chain",
      "Package ownership-transfer risk",
      "OpenSSF · GitHub advisories · OSV",
    ],
    [
      "AI agents",
      "Delegated tool-permission boundaries",
      "Model security research · incident reports",
    ],
    [
      "Containers",
      "Base-image provenance and runtime drift",
      "NIST · vendor research · exploit intelligence",
    ],
    [
      "Post-quantum",
      "Cryptographic inventory and migration paths",
      "NIST PQC · standards bodies · research",
    ],
  ];
  const [query, setQuery] = useState("");
  const visible = articles.filter((article) =>
    article.join(" ").toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="view-shell">
      <header className="view-intro">
        <div>
          <h1>Security library</h1>
          <p>
            The primary-source research behind every match — advisories and
            incident work normalized per topic, so a finding is never a black
            box.
          </p>
        </div>
        <span className="view-intro-tag library">Library</span>
      </header>
      <div className="library-view">
        <section className="library-index">
        <strong>{visible.length}</strong>
        <span>
          {query
            ? `of ${articles.length} topics match your search`
            : "curated topics, each normalized from primary sources"}
        </span>
        <label>
          <i>⌕</i>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search attacks, controls, frameworks…"
          />
        </label>
      </section>
      <section className="article-list">
        {visible.map(([category, title, source]) => (
          <button type="button" key={title}>
            <span>{category}</span>
            <div>
              <strong>{title}</strong>
              <small>{source}</small>
            </div>
          </button>
        ))}
        {visible.length === 0 && (
          <div className="library-empty">
            <strong>No topics match “{query}”.</strong>
            <span>
              Try an attack class (authentication, supply chain) or a framework
              name.
            </span>
            <button type="button" onClick={() => setQuery("")}>
              Clear search
            </button>
          </div>
        )}
      </section>
      </div>
    </div>
  );
}
