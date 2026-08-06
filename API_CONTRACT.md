# Cefense data API — contract for wiring real sources

Every screen in the app currently renders from **mock data**. This document is
the map for the CTO: each mock has a matching stub route under `app/api/*` that
already returns the correct shape. To go live, replace the body of each handler
with a real source and keep the response shape unchanged.

All response types live in **`db/api-types.ts`** — that file is the single
source of truth. Don't invent new shapes in the handlers; import from there.

## Auth

Routes that are workspace-scoped call `getChatGPTUser()` (see
`app/api/profile/route.ts`) and return `401 { error }` when unauthenticated.
Public/marketing data (the `/threats` page) needs no auth.

## Endpoints

| Method | Path | Returns | Feeds which screen | Replace with |
| --- | --- | --- | --- | --- |
| GET | `/api/feed` | `{ paths: ObservedPath[] }` | Feed (Observed/Matched) | detection + repo-graph matching |
| GET | `/api/fix/:id`¹ | `{ fix: FixPackage }` | Fix view | the focused-fix generator |
| GET | `/api/evidence?pathId=` | `{ record: ImmunityRecord }` | Proof view | replay run + evidence signing |
| GET | `/api/assets?kind=` | `{ kind, rows: AssetRow[] }` | Containers / Clouds / Domains | cloud APIs, registry, DNS |
| GET | `/api/audit` | `{ changes: AuditRow[] }` | Code audit | PR analysis from the VCS |
| GET | `/api/pentests` | `{ jobs: PentestJob[] }` | Pentests | scanner/orchestrator |
| POST | `/api/pentests` | `{ job: PentestJob }` | Pentests (launch) | authorized scan launch |
| GET | `/api/library?q=` | `{ topics: LibraryTopic[] }` | Security library | research index / search |
| GET | `/api/integrations` | `{ connectors: Connector[] }` | Settings → Connections | connector registry |
| POST | `/api/integrations` | `{ id, connected }` | Settings → Connections | OAuth connect/disconnect |

¹ `/api/fix/:id` is specified in `db/api-types.ts` (`FixPackage`) but not yet
stubbed as a route — the Fix view still uses inline demo diff data. Add the
route when wiring; the shape is ready.

Existing production routes (already real): `/api/profile`,
`/api/repository/scan`, `/api/auth/*`.

## How the frontend consumes these

Today most views hold a local `MOCK`/demo constant and render it directly, so
the app works with zero backend. Each such constant is marked with a
`// DATA SOURCE: GET /api/...` comment pointing at its endpoint. To switch a
view to live data, fetch the endpoint (with a loading + error state) and drop
the local constant. Recommended order: `/api/feed` first (it drives the whole
loop), then `/api/evidence`, then the inventory routes.

## Shape stability

The frontend is typed against `db/api-types.ts`. If a real source can't fill a
field, return a sensible default rather than omitting it (e.g. `status: "Clean"`,
`variants: 0`). Additive fields are safe; renaming or removing fields is a
breaking change and must be done in `db/api-types.ts` first.
