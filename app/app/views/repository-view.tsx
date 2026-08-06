"use client";

import { useState } from "react";
import type { CyberusScan } from "../../../db/cyberus";

export function RepositoryView({
  repositoryUrl,
  setRepositoryUrl,
  scan,
  scanning,
  error,
  onScan,
}: {
  repositoryUrl: string;
  setRepositoryUrl: (value: string) => void;
  scan: CyberusScan | null;
  scanning: boolean;
  error: string;
  onScan: () => void;
}) {
  const availableGoals = [
    "SAST",
    "IaC",
    "Secrets",
    "SCA",
    "Runtime protection",
    "Automated pentesting",
    "Code quality",
    "SBOM",
  ];
  const [goals, setGoals] = useState([
    "SAST",
    "Secrets",
    "SCA",
    "Code quality",
  ]);
  return (
    <div className="repository-workspace">
      <header className="view-intro">
        <div>
          <h1>Repositories</h1>
          <p>
            The code Cefense defends. Connecting a repository builds its
            reachability graph — everything in Feed, Fix, and Proof starts
            here.
          </p>
        </div>
        <span className="view-intro-tag assets">Assets</span>
      </header>
      <section className="workspace-card repository-connect-card">
        <div>
          <span>GitHub repository</span>
          <h2>Connect repository.</h2>
          <p>
            Public GitHub URL. Tree and relevant source only. Source is not
            stored.
          </p>
        </div>
        <div className="repository-input">
          <label>
            Repository URL
            <input
              value={repositoryUrl.startsWith("demo://") ? "" : repositoryUrl}
              onChange={(event) => setRepositoryUrl(event.target.value)}
              placeholder="https://github.com/owner/repository"
            />
          </label>
          <button
            type="button"
            disabled={
              scanning || !repositoryUrl || repositoryUrl.startsWith("demo://")
            }
            onClick={onScan}
          >
            {scanning
              ? "Indexing, matching, ranking…"
              : scan
                ? "Scan again"
                : "Connect and scan"}
          </button>
        </div>
        {error && (
          <p className="scan-error" role="alert">
            {error}
          </p>
        )}
        <small>Private repositories require GitHub OAuth.</small>
      </section>
      <section className="scan-goals-card">
        <div>
          <span>SCAN COVERAGE</span>
          <h2>Scan coverage.</h2>
          <p>Select checks for this repository.</p>
        </div>
        <div>
          {availableGoals.map((goal) => (
            <button
              type="button"
              className={goals.includes(goal) ? "selected" : ""}
              key={goal}
              onClick={() =>
                setGoals((current) =>
                  current.includes(goal)
                    ? current.filter((item) => item !== goal)
                    : [...current, goal],
                )
              }
            >
              <i />
              {goal}
            </button>
          ))}
        </div>
      </section>
      {scan && (
        <section className="workspace-card scan-result-card">
          <div className="scan-result-head">
            <div>
              <span>Latest saved scan</span>
              <h2>{scan.repositoryName}</h2>
              <p>
                {scan.defaultBranch} ·{" "}
                {new Date(scan.createdAt).toLocaleString()}
              </p>
            </div>
            <a href={scan.repositoryUrl} target="_blank" rel="noreferrer">
              Open on GitHub
            </a>
          </div>
          <div className="scan-metrics">
            <article>
              <strong>{scan.fileCount}</strong>
              <span>files inventoried</span>
            </article>
            <article>
              <strong>{scan.sourceFilesChecked}</strong>
              <span>source files inspected</span>
            </article>
            <article>
              <strong>
                {
                  scan.findings.filter((finding) => finding.severity !== "Info")
                    .length
                }
              </strong>
              <span>signals surfaced</span>
            </article>
          </div>
          <div className="language-row">
            {scan.languages.map((language) => (
              <span key={language.name}>
                {language.name} · {language.files}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
