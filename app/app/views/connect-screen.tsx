"use client";

/* eslint-disable @next/next/no-html-link-for-pages */
import { useState } from "react";
import type { ChatGPTUser } from "../../chatgpt-auth";
import type { CyberusPlan, CyberusProfile } from "../../../db/cyberus";
import { topics } from "../workspace-config";
import { IntegrationsView } from "./integrations-view";

export function ConnectScreen({
  user,
  profile,
  repositoryUrl,
  setRepositoryUrl,
  stack,
  setStack,
  watchlist,
  toggleTopic,
  saving,
  error,
  showSignal = true,
  onToggleSignal,
  connectAndScan,
  persistWorkspace,
}: {
  user: ChatGPTUser;
  profile: CyberusProfile | null;
  repositoryUrl: string;
  setRepositoryUrl: (value: string) => void;
  stack: string;
  setStack: (value: string) => void;
  watchlist: string[];
  toggleTopic: (topic: string) => void;
  saving: boolean;
  error: string;
  showSignal?: boolean;
  onToggleSignal?: () => void;
  connectAndScan: () => void;
  persistWorkspace: (options?: {
    repository?: string;
    plan?: CyberusPlan;
    stayInWorkspace?: boolean;
  }) => void;
}) {
  const [name, setName] = useState(user.displayName);
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");

  if (profile) {
    const planName = profile.plan === "immunity" ? "Immunity" : "Signal";
    const planPrice = profile.plan === "immunity" ? "$49 / developer / month" : "$3 / month";
    // Settings is a canvas view like every other tab — same paper, same
    // cards, no overlay, no color shift.
    return (
        <section
          className="settings-canvas"
          aria-labelledby="workspace-settings-title"
        >
          <header className="view-intro">
            <div>
              <h1 id="workspace-settings-title">Settings</h1>
              <p>Your account, plan, connections, and how Cefense watches this workspace.</p>
            </div>
          </header>

          <section className="settings-drawer-section settings-account">
            <span>Account</span>
            <div className="account-grid">
              <label>
                Name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label>
                Email
                <input value={user.email} readOnly />
              </label>
              <label>
                Role
                <input
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                  placeholder="e.g. Security engineer"
                />
              </label>
              <label>
                Based in
                <input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="e.g. San Francisco"
                />
              </label>
            </div>
          </section>

          <section className="settings-drawer-section settings-usage">
            <span>Usage · last 30 days</span>
            <div className="usage-grid">
              <article>
                <strong>128</strong>
                <small>findings observed</small>
              </article>
              <article>
                <strong>41</strong>
                <small>matched to code</small>
              </article>
              <article>
                <strong>17</strong>
                <small>fixes prepared</small>
              </article>
              <article>
                <strong>14</strong>
                <small>paths proven closed</small>
              </article>
            </div>
          </section>
          <section className="settings-drawer-section settings-arch">
            <span>How Cefense works</span>
            <div className="arch-grid">
              <article>
                <b>1 · The engine</b>
                <p>
                  A system that never stops — it finds live vulnerabilities and
                  their variants across the security web, around the clock.
                </p>
              </article>
              <article>
                <b>2 · Your node</b>
                <p>
                  Indexes your codebase and turns it into signatures the engine
                  can match against — read-only, source never stored.
                </p>
              </article>
              <article>
                <b>3 · Connectors</b>
                <p>
                  Wire matches, approvals, and evidence into the tools you
                  already use. Configured below under Connections.
                </p>
              </article>
            </div>
          </section>

          <section className="settings-drawer-section settings-plans">
            <span>Your plan · currently {planName} ({planPrice})</span>
            <div className="plan-two">
              <article className={profile.plan === "signal" ? "selected" : ""}>
                <header>
                  <b>Signal</b>
                  <i>$3 / mo</i>
                </header>
                <p>Know the moment your code is exposed.</p>
                <ul>
                  <li>An alert the instant a live signature matches your stack</li>
                  <li>The research article behind every match, linked and readable</li>
                  <li>Personalized to your repository and stack</li>
                </ul>
                <button
                  type="button"
                  disabled={saving || profile.plan === "signal"}
                  onClick={() => persistWorkspace({ plan: "signal", stayInWorkspace: true })}
                >
                  {profile.plan === "signal" ? "Current plan" : "Switch to Signal"}
                </button>
              </article>
              <article className={profile.plan === "immunity" ? "selected" : ""}>
                <header>
                  <b>Immunity</b>
                  <i>$49 / dev / mo</i>
                </header>
                <p>Everything in Signal — and Cefense closes it.</p>
                <ul>
                  <li>A focused, reviewable fix prepared at the exact line</li>
                  <li>The original attack and its variants replayed and blocked</li>
                  <li>A signed record that proves the path is closed</li>
                </ul>
                <button
                  type="button"
                  disabled={saving || profile.plan === "immunity"}
                  onClick={() => persistWorkspace({ plan: "immunity", stayInWorkspace: true })}
                >
                  {profile.plan === "immunity" ? "Current plan" : "Upgrade to Immunity"}
                </button>
              </article>
            </div>
          </section>
          <section className="settings-drawer-section settings-form">
            <label>
              Repository
              <input
                value={repositoryUrl.startsWith("demo://") ? "" : repositoryUrl}
                onChange={(event) => setRepositoryUrl(event.target.value)}
                placeholder="https://github.com/owner/repository"
              />
              <small className="field-help">
                Read-only. Used to build the reachability graph — source is
                never stored.
              </small>
            </label>
            <label>
              Primary stack
              <input
                value={stack}
                onChange={(event) => setStack(event.target.value)}
                placeholder="Node.js / TypeScript"
              />
              <small className="field-help">
                Decides which attack primitives are matched against this
                repository first.
              </small>
            </label>
            <div className="settings-topics">
              <span>Watch topics</span>
              <small className="field-help">
                Attack classes prioritized in your feed.
              </small>
              <div>
                {topics.map((topic) => (
                  <button
                    className={watchlist.includes(topic) ? "selected" : ""}
                    type="button"
                    key={topic}
                    onClick={() => toggleTopic(topic)}
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>
            <div className="settings-toggle">
              <div>
                <b>Reachable-critical-paths counter</b>
                <small>The large number beside the feed.</small>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={showSignal}
                aria-label="Show the reachable-critical-paths counter"
                className={showSignal ? "settings-switch on" : "settings-switch"}
                onClick={onToggleSignal}
              >
                <i />
              </button>
            </div>
            {error && <p className="workspace-error" role="alert">{error}</p>}
            <button
              className="settings-save"
              type="button"
              disabled={saving}
              onClick={() => persistWorkspace({ stayInWorkspace: true })}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </section>
          <section className="settings-drawer-section">
            <span>CONNECTIONS</span>
            <p className="settings-section-note">
              Where findings, approvals, and evidence flow. Cefense meets your
              existing tools instead of becoming another inbox.
            </p>
            <IntegrationsView embedded />
          </section>
        </section>
    );
  }

  // First run: a pop-up over the live workspace — never a separate page
  // between "Open workspace" and the app.
  return (
    <div
      className="connect-modal-scrim"
      role="dialog"
      aria-modal="true"
      aria-labelledby="connect-modal-title"
    >
      <section className="connect-modal">
        <header className="connect-modal-head">
          <span className="wordmark">
            <span className="wordmark-dot" /> CEFENSE
          </span>
          <div>
            <strong id="connect-modal-title">Connect code. See risk.</strong>
            <small>
              Signed in · {user.email} ·{" "}
              <a href="/api/auth/signout?return_to=%2F">Sign out</a>
            </small>
          </div>
          <div className="connect-trust">
            <span>✓ Read-only</span>
            <span>✓ Source not stored</span>
            <span>✓ No card</span>
          </div>
        </header>
        <div className="connect-panel">
          <div className="provider-tabs">
            <button className="active" type="button">
              <span>⌘</span> GitHub
            </button>
            <button type="button" disabled>
              GitLab <small>soon</small>
            </button>
            <button type="button" disabled>
              Bitbucket <small>soon</small>
            </button>
          </div>
          <label>
            Public GitHub repository
            <input
              value={repositoryUrl.startsWith("demo://") ? "" : repositoryUrl}
              onChange={(event) => setRepositoryUrl(event.target.value)}
              placeholder="https://github.com/owner/repository"
            />
            <small className="field-help">
              Read-only. Used to build the reachability graph — source is never
              stored.
            </small>
          </label>
          <label>
            Primary stack
            <input
              value={stack}
              onChange={(event) => setStack(event.target.value)}
              placeholder="Node.js / TypeScript"
            />
            <small className="field-help">
              Decides which attack primitives are matched first.
            </small>
          </label>
          <div className="connect-topics">
            {topics.map((topic) => (
              <button
                className={watchlist.includes(topic) ? "selected" : ""}
                type="button"
                key={topic}
                onClick={() => toggleTopic(topic)}
              >
                {topic}
              </button>
            ))}
          </div>
          <div className="curated-repos">
            <span>Examples</span>
            <div>
              {[
                ["Trivy", "https://github.com/aquasecurity/trivy"],
                ["WebGoat", "https://github.com/WebGoat/WebGoat"],
                ["Juice Shop", "https://github.com/juice-shop/juice-shop"],
              ].map(([name, url]) => (
                <button
                  type="button"
                  key={name}
                  onClick={() => setRepositoryUrl(url)}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
          <button
            className="scan-command"
            type="button"
            disabled={
              saving || !repositoryUrl || repositoryUrl.startsWith("demo://")
            }
            onClick={connectAndScan}
          >
            {saving ? "Building repository graph…" : "Connect and start scan"}
          </button>
          <div className="connect-divider">
            <span>or</span>
          </div>
          <button
            className="demo-command"
            type="button"
            disabled={saving}
            onClick={() =>
              persistWorkspace({
                repository: "demo://cefense-security-site",
                plan: "immunity",
              })
            }
          >
            <span>
              <b>Open demo workspace</b>
              <small>Feed · AutoFix · evidence</small>
            </span>
          </button>
          <div className="beta-boundary">
            <span>
              Public scan · prioritized findings · reviewable patch · evidence
              record
            </span>
            <small>Private repositories require GitHub OAuth.</small>
          </div>
          {error && (
            <p className="workspace-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
