# Funnel Runtime

A small platform for running, versioning and analyzing multi-step web funnels: a backend-driven
funnel engine (no hardcoded screens), version pinning with rollback, an A/B experiment, an event
ingestion API, and an analytics dashboard built on unique sessions rather than raw event counts.

Built for the "Funnel Runtime" fullstack take-home. Live URL: _TODO — fill in after deploy_.
Repo: _TODO_.

## Stack

- **TypeScript** everywhere, npm workspaces monorepo (`packages/shared`, `apps/server`, `apps/web`).
- **Backend:** Fastify + [`node:sqlite`](https://nodejs.org/api/sqlite.html) (Node's built-in SQLite
  driver, currently experimental). No ORM — the schema is a handful of tables and the queries are
  plain parameterized SQL in `apps/server/src/db/repo.ts`.
- **Frontend:** React + Vite + `react-router-dom`. No component library, no chart library — the
  dashboard is plain tables plus a CSS progress bar, which is all this data needs.
- **Shared package:** `packages/shared` holds the funnel config types and the branching/variant
  resolution engine, imported by both the server (to validate transitions) and the traffic
  generator. The frontend intentionally does **not** re-implement branching logic — it just renders
  whatever step the server says is current.
- **Tests:** Vitest, using Fastify's `app.inject()` against an in-memory SQLite DB (no real network,
  no port binding).

**Why `node:sqlite` instead of `better-sqlite3`:** it's zero-install (no native binary to compile or
match to a deploy target's Node/OS/arch), which removes a whole class of "works on my machine but
not on the deploy host" problems for a 48h project. The tradeoff is that the API is still
experimental and can change between Node versions — noted in Limitations below.

## Running locally

Requires Node 24+ (for `node:sqlite`).

```bash
npm install                 # installs all workspaces, builds packages/shared (postinstall)
npm run dev:server          # http://localhost:4000 — seeds the v1 config on first boot
npm run dev:web             # http://localhost:5173
```

Open `http://localhost:5173` for the funnel, `/admin` for version management, `/analytics` for the
dashboard.

Generate synthetic traffic (backend must be running):

```bash
npm run seed:traffic        # creates 130 synthetic sessions with varied UTM/branches/dropoff
```

Run tests / build:

```bash
npm run test                # apps/server: vitest (version pinning, A/B stability, dedup, publish/rollback, analytics)
npm run build                # builds packages/shared, apps/server, apps/web
```

Environment variables (all optional, sensible defaults for local dev):

| Var | Where | Default |
| --- | --- | --- |
| `PORT` | server | `4000` |
| `DB_PATH` | server | `apps/server/data/funnel.sqlite` |
| `VITE_API_URL` | web | `http://localhost:4000` |
| `API_URL` | traffic generator | `http://localhost:4000` |
| `SESSION_COUNT` | traffic generator | `130` |

## Data model

```
funnels            (id, key, name)
funnel_versions    (id, funnel_id, version, status: active|archived, config_json, published_at)
sessions           (id, funnel_id, funnel_version_id, version, variant, answers_json,
                     current_step_id, visited_steps_json, utm_*)
events             (event_id PK, session_id, funnel_id, funnel_version_id, version, variant,
                     type, step_id, utm_campaign, client_ts, server_ts, properties_json)
```

- A funnel has many **versions**; exactly one is `active` at a time. `POST /api/admin/funnels/:key/versions`
  publishes a new version (archives the previous active one, `version` numbers keep incrementing).
  `POST /api/admin/funnels/:key/versions/:version/activate` reactivates any existing version — this
  is rollback, and it never deletes a version row, so history and past analytics stay intact.
- A **session** is created with the funnel's currently-active version and is pinned to
  `funnel_version_id` for its whole lifetime — publishing a new version afterwards does not move it.
  `current_step_id` and `visited_steps_json` are the server-side source of truth for "where is this
  user right now", so refresh/reopen/back all resolve from the DB, not client state.
- **Events** are denormalized with `funnel_id`, `version`, `variant` and `utm_campaign` copied from
  the session at ingestion time, so analytics queries never need to join back to `sessions` — they
  just `COUNT(DISTINCT session_id)` on `events` (or on `sessions` directly for the "started" count).

## Event schema & ingestion rules

`POST /api/events` accepts `{ events: TrackedEvent[] }`, up to 500 per batch.

```ts
TrackedEvent = {
  event_id: string;        // client-generated, e.g. crypto.randomUUID()
  session_id: string;
  type: string;             // session_started | step_viewed | answer_submitted |
                             // step_completed | back_clicked | result_viewed | cta_clicked
                             // (custom types are accepted too — see onViewEvent/onSubmitEvent
                             //  in the funnel config, used by v2's "vegan_tip_shown")
  client_ts: number;
  step_id?: string;
  properties?: Record<string, unknown>;
}
```

`funnel_id`, `funnel_version_id`, `version`, `variant` and `utm_campaign` are **not** sent by the
client — the server looks them up from `session_id` at ingestion time and stamps them on the row.
Raw answer values only ever reach the events table if the client explicitly puts them in
`properties` (nothing does this automatically), which is the "raw answers don't leak into analytics
by default" requirement.

Invariants, and how they're actually enforced (see `apps/server/src/db/repo.ts#insertEventsBatch`):

- **Idempotency:** `event_id` is the primary key; insertion uses `INSERT OR IGNORE`, so resubmitting
  the same `event_id` (retry after a timeout, or a duplicate in the same batch) is a no-op. The
  response reports which ids were newly `accepted` vs. already `duplicates`.
- **Partial failure isolation:** each event in a batch is inserted independently in a loop with its
  own try/catch; one event referencing an unknown `session_id` (or any other per-row error) is
  reported in `failed` without rolling back or blocking the rest of the batch.
- **Order independence:** all aggregation is existence-based (`COUNT(DISTINCT session_id) WHERE type = ...`),
  never "the Nth event chronologically", so events arriving out of `client_ts` order don't skew
  counts — a `step_viewed` that happens to be inserted after `result_viewed` is still just "this
  session viewed this step at some point".

## Analytics aggregation rules

`GET /api/analytics?funnelKey=&version=&variant=&utmCampaign=`

- `sessionsStarted` is `COUNT(DISTINCT id)` on the **sessions** table (not on `session_started`
  events) — a session row only ever exists if a session was actually created, so this is robust even
  if the client never got to send that first event.
- `resultReached` / `ctaClicks` are `COUNT(DISTINCT session_id)` on `events` for
  `result_viewed` / `cta_clicked`. `ctaCTR = ctaClicks / resultReached` (i.e. "of the people who saw
  the result, how many clicked the CTA" — not `/ sessionsStarted`; documented here since either
  definition is defensible).
- **Per-step funnel:** step order is derived from the shared branching engine's "likely path" (the
  path you'd walk from the entry step always taking the default branch), computed for the filtered
  version + variant (or the active version / variant A if unfiltered). `viewedSessions` /
  `completedSessions` are unique-session counts per step; `dropOff` for step _i_ is
  `viewedSessions[i] - viewedSessions[i+1]` (the last step's "next" is `resultReached`). This is a
  simplification: with heavy branching, "canonical order" for the *combined* (all-variants,
  all-versions) view is necessarily one variant's path — filtering by `version`/`variant` gives the
  exact order for that slice.
- `byVariant` / `byVersion` repeat the same summary metrics grouped by variant (A/B, ignoring any
  variant filter) and by version, so both comparisons are always available regardless of the active
  filters.

## A/B experiment

**Hypothesis:** the "Building your plan" interstitial screen (`s_plan_preview`, a pure loading/info
step with no new information) adds friction right before the result without adding value. Variant B
removes it and goes straight from the last question to the result screen, with a slightly more
direct CTA copy ("Show me the plan" vs. "Get my plan").

**Primary metric:** CTA click-through rate, defined as `cta_clicked` unique sessions ÷
`result_viewed` unique sessions, compared between A and B via `/api/analytics` `byVariant`.
Secondary/guardrail metric: `resultReached ÷ sessionsStarted`, to confirm removing the screen doesn't
just move the drop-off point earlier for some other reason.

Variant assignment (`apps/server/src/lib/variant.ts`) is 50/50 random at session creation, stored on
the session row (so it's stable across refresh/resume), with a `?variant=A` / `?variant=B` query
override for QA.

## Traffic generator

`scripts/generate-traffic.ts` drives the funnel through the same public HTTP API the frontend uses
(session create → answer → ... → result/CTA), so it's exercising real branching and real variant
resolution, not a canned fixture. Per run it produces: mixed UTM source/medium/campaign, a natural
~50/50 A/B split (plus the first 20 sessions force-alternate A/B via the query override, so both
variants are always represented even on a tiny run), drop-off at a random step for ~30% of sessions,
occasional back-then-forward navigation, and — every 11th/13th/17th session respectively — an
out-of-order two-batch delivery, a duplicated `event_id` inside one batch, and a resent batch, to
exercise the ingestion invariants above.

## Timeline

- **Iteration 1** (2026-09-04): monorepo scaffold, shared funnel-engine + types, SQLite schema,
  session/versioning/events/analytics API, React runtime + admin + analytics pages, traffic
  generator, Vitest suite (12 tests across the 5 required areas). Config: `fitness-onboarding.v1.json`
  (9 steps, single/multi/number/info/result, two branch points, variant B removes one screen).
- **Iteration 2** (2026-09-04, same session): `fitness-onboarding.v2.json` adds a `contains`-based
  branch (vegan diet → an extra info step with a new `vegan_tip_shown` custom event), extends
  variant B's removed-screens list to cover the new step, published through the running server,
  verified existing v1 sessions kept resolving against v1 unchanged, then rolled back to v1 — all
  through the admin API, no manual DB edits.

## Known limitations & assumptions

- `node:sqlite` is an experimental Node API; a Node upgrade could change its behavior. If that
  becomes a blocker, swapping in `better-sqlite3` only touches `apps/server/src/db/client.ts`.
- No auth on `/admin`, `/analytics` or the admin API — acceptable for an internal tool in a take-home,
  not for a real deployment.
- The canonical step order used for the combined (unfiltered) per-step funnel view is a best-effort
  "default path" through one variant/version; drill into a specific `version`/`variant` for an exact
  order when branches diverge a lot.
- The "answer" endpoint only accepts an answer for the session's current step (no skipping ahead by
  guessing future step ids); going back and answering differently is supported and simply continues
  from there, but revisited branches past the new current step aren't specially reconciled beyond
  that.
- WAL-mode SQLite is a single-writer store; fine for this workload/scale, not meant to be scaled
  horizontally as-is.
- No visual config editor, as explicitly out of scope — versions are published by pasting/uploading
  JSON on `/admin`.

## Agent process

Built with Claude Code end-to-end. Roughly: shared types/engine first (so backend and frontend agree
on one branching implementation), then the SQL schema and repo layer, then routes, verified against
a running server with `curl` before writing anything else (this caught two real bugs: a missing
`Content-Type` guard on bodyless requests that broke `back`, and a `node:sqlite`-vs-Vite module
resolution issue that broke `vitest`), then the Vitest suite for the five required areas, then the
frontend, then the traffic generator, run against the live server to confirm the whole chain
(session → version → variant → events → analytics) produces sane aggregate numbers. Iteration 2 was
done by extending the config and replaying publish → verify → rollback against the already-running
server rather than trusting it blind.
