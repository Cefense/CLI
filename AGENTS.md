# AGENTS.md — read this before touching anything

## This folder is THE working app

`/Users/test/Documents/pitchdecks/cyberus-site`, branch **`agent/cyberus-latest`**,
is the canonical Cyberus codebase. It is what the owner runs locally
(127.0.0.1:3000) and what all design/UX rework applies to. Owner decision,
2026-07-21.

The sibling checkout `/Users/test/Documents/pitchdecks/cyberus-site-claude`
(same GitHub remote, `main`) is a **parked design-pass reference** — do not
apply new work there, do not compare against it to claim "nothing changed",
and do not merge either direction without the owner asking explicitly.

Remote for both: `https://github.com/anshul3782/cyberus-site.git`

## Before claiming "no changes were made"

Check LOCAL history of THIS folder on THIS branch:

```bash
git log --oneline -5            # local agent/cyberus-latest
```

Cloud-sandboxed assistants cannot push (no GitHub credentials). They commit
locally; the human pushes. A commit that exists only locally is the expected
end state of an AI session, not a failure.

## Design system rules (2026-07-21 rework)

- Primary nav is the loop: Feed / Fix / Proof. Everything else is secondary.
- The top flow strip (Observed · Matched · Fix · Proof) is the ONE header and
  carries the current attack path (title + file) — never add a second nav.
- Summary first, raw diff behind the "View focused diff" expander. Never make
  raw code the default view.
- One accent family: green (`--ws-accent` in app/app/workstation.css rework
  layer). No purple, no terracotta, no per-tab colors.
- Status is semantic and consistent: green safe / amber attention / red act.
- Every view ships its edge states (empty, loading-with-context, error,
  partial). Ambiguous states are bugs.
- New workspace styles go at the END of `app/app/workstation.css` (it loads
  last after workspace.css and command-workspace.css).

## Quirks that will bite you

- Sandboxed shells cannot delete files in this folder; git leaves stale
  `.git/*.lock` files ("Operation not permitted"). `mv` them into
  `_to_delete/` and retry. Keep `_to_delete/` untracked; humans empty it.
- Git identity may be absent in sandbox shells:
  `git -c user.name="Arnav" -c user.email="strarnv@gmail.com" commit …`
- `.dev.vars` auto-authenticates a dev user locally if `CYBERUS_DEV_USER_EMAIL`
  is set; otherwise use the guest login.
- `app/clarity/` holds design prototypes, not product surfaces.

## Run locally

```bash
npm install   # first time only
npm run dev   # open the printed URL, go to /app
```
