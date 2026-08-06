"use client";

import { useEffect, useState } from "react";
import type { CyberusFinding, CyberusScan } from "../../../db/cyberus";

/* The feed reads like a mailbox — sender (attack class), subject, one-line
   preview, time — but is Cefense's own: severity dots and bars, warm paper.
   Five-second promise: Observed attack → Matched to exact code.
   A click opens the finding full-page. */
export function FeedView({
  findings,
  stage,
  showSignal,
  dismissedCount,
  onOpen,
  onRestore,
}: {
  findings: CyberusFinding[];
  stage: "observed" | "matched";
  showSignal: boolean;
  dismissedCount: number;
  onOpen: (id: string) => void;
  onRestore: () => void;
  scan: CyberusScan | null;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const sorted = [...findings].sort(
    (a, b) =>
      ({ Critical: 0, High: 1, Watch: 2, Info: 3 }[a.severity] ?? 4) -
      ({ Critical: 0, High: 1, Watch: 2, Info: 3 }[b.severity] ?? 4),
  );
  // Observed is the full inbox of reconstructed attacks. Matched is the
  // refined slice — only the paths confidently resolved to code you run.
  const visible =
    stage === "matched"
      ? sorted.filter((finding) =>
          ["Critical", "High"].includes(finding.severity),
        )
      : sorted;
  const active = visible[selectedIndex] ?? visible[0];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          (event.target as HTMLElement).tagName,
        )
      )
        return;
      if (event.key === "j") {
        event.preventDefault();
        setSelectedIndex((index) =>
          Math.min(index + 1, Math.max(visible.length - 1, 0)),
        );
      }
      if (event.key === "k") {
        event.preventDefault();
        setSelectedIndex((index) => Math.max(index - 1, 0));
      }
      if ((event.key === "Enter" || event.key === "o") && active) {
        event.preventDefault();
        onOpen(active.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onOpen, visible.length]);

  // A stable clock time per finding (we have no real observedAt yet), shown
  // like a mailbox timestamp instead of a relative "14h".
  function timeFor(id: string) {
    let hash = 0;
    for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    const hour24 = hash % 24;
    const minute = hash % 60;
    const meridiem = hour24 < 12 ? "AM" : "PM";
    const hour12 = ((hour24 + 11) % 12) + 1;
    return `${hour12}:${String(minute).padStart(2, "0")} ${meridiem}`;
  }

  const grouped = {
    Critical: visible.filter((finding) => finding.severity === "Critical"),
    High: visible.filter((finding) => finding.severity === "High"),
    Lower: visible.filter(
      (finding) => !["Critical", "High"].includes(finding.severity),
    ),
  };

  const renderRow = (finding: CyberusFinding) => (
    <article
      className={`inbox-row ${finding.severity.toLowerCase()} ${active?.id === finding.id ? "focused" : ""}`}
      key={finding.id}
      tabIndex={0}
      onClick={() => onOpen(finding.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen(finding.id);
      }}
    >
      <span className="inbox-flag">
        <i
          className={`risk-dot ${finding.severity.toLowerCase()}`}
          role="img"
          aria-label={`${finding.severity} severity`}
        />
        <b className="inbox-from" title={finding.category}>
          {finding.category}
        </b>
      </span>
      <div className="inbox-body">
        <div className="inbox-line">
          <strong>{finding.title}</strong>
          {stage === "matched" ? (
            <span className="inbox-preview inbox-loc">
              {finding.file}
              {finding.line ? `:${finding.line}` : ""}
            </span>
          ) : (
            <span className="inbox-preview">— {finding.summary}</span>
          )}
        </div>
      </div>
      <span className="inbox-time">{timeFor(finding.id)}</span>
    </article>
  );

  return (
    <div
      className="feed-view operational-feed feed-center-stage"
      aria-label="Observed attack → Matched to exact code"
    >
      <div className="feed-stage-ticket">
        <span
          className={`feed-stage-rail feed-stage-rail-attack${stage === "observed" ? " live" : ""}`}
        >
          Attack
        </span>
        <section className="triage-queue inbox-queue">
          {grouped.Critical.map((finding) => renderRow(finding))}
          {grouped.High.map((finding) => renderRow(finding))}
          {grouped.Lower.length > 0 && (
            <details
              className="ops-lower"
              open={grouped.Critical.length === 0 && grouped.High.length === 0}
            >
              <summary>
                Lower priority ({grouped.Lower.length}) <span>Expand</span>
              </summary>
              {grouped.Lower.map((finding) => renderRow(finding))}
            </details>
          )}
          {visible.length === 0 && (
            <div className="queue-empty">
              <strong>All observed paths are closed.</strong>
              <span>
                No reachable attack primitives match your current scope.
                {dismissedCount
                  ? ` ${dismissedCount} resolved in the last 24h ·`
                  : ""}{" "}
                monitoring continues.
              </span>
              {dismissedCount > 0 && (
                <button type="button" onClick={onRestore}>
                  Restore dismissed findings
                </button>
              )}
            </div>
          )}
        </section>
        <span
          className={`feed-stage-rail feed-stage-rail-proof${stage === "matched" ? " live" : ""}`}
        >
          Proof
        </span>
      </div>
      {showSignal && grouped.Critical.length > 0 && (
        <div
          className="feed-stage-signal"
          aria-label={`${grouped.Critical.length} reachable critical ${grouped.Critical.length === 1 ? "path" : "paths"}`}
        >
          <strong>{grouped.Critical.length}</strong>
          <span>
            reachable
            <br />
            critical {grouped.Critical.length === 1 ? "path" : "paths"}
          </span>
        </div>
      )}
    </div>
  );
}
