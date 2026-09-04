# Funnel Runtime

A small platform for running, versioning and analyzing multi-step web funnels: a backend-driven
funnel engine (no hardcoded screens), version pinning with rollback, an A/B experiment, an event
ingestion API, and an analytics dashboard built on unique sessions rather than raw event counts.

Built for the "Funnel Runtime" fullstack take-home, driven by the `workstyle-planner` funnel config
supplied with the assignment.

- **Live app:** https://web-production-a5dde.up.railway.app
- **Live API:** https://server-production-55d28.up.railway.app
- **Repo:** https://github.com/NativeDrift/FUNNEL-PLATFORMA

Deployed on Railway as two services from this repo: `server` (Fastify API) and `web` (Vite-built
React app served via `vite preview`), each built with Railway's Railpack builder using
`RAILPACK_INSTALL_CMD` / `RAILPACK_BUILD_CMD` / `RAILPACK_START_CMD` overrides to target the right
npm workspace. `VITE_API_URL` on the `web` service points at the `server` service's public domain.

## Stack

- **TypeScript** everywhere, npm workspaces monorepo (`packages/shared`, `apps/server`, `apps/web`).
- **Backend:** Fastify + [`node:sqlite`](https://nodejs.org/api/sqlite.html) (Node's built-in SQLite
  driver, currently experimental). No ORM — the schema is a handful of tables and the queries are
  plain parameterized SQL in `apps/server/src/db/repo.ts`.
- **Frontend:** React + Vite + `react-router-dom`. No component library, no chart library — the
  dashboard is plain tables plus a CSS progress bar, which is all this data needs.
- **Shared package:** `packages/shared` holds the funnel config types and the branching/variant
  resolution engine (`packages/shared/src/funnel-engine.ts`), imported by the server, the frontend
  (for the `answer_kind` privacy helper) and the traffic generator. Branching itself is only ever
  evaluated server-side — the frontend just renders whatever step the server says is current.
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
npm run dev:server          # http://localhost:4000 — seeds workstyle-planner v1 on first boot
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
| `FUNNEL_ID` | traffic generator | `workstyle-planner` |
| `SESSION_COUNT` | traffic generator | `130` |

## Funnel config format

`configs/workstyle-planner.v1.json` is the config supplied with the assignment; `POST
/api/admin/funnels/:funnelId/versions` publishes any config in this shape as a new version. Shape,
in brief (see the file itself for the full example):

- `funnelId`, `title` — identify the funnel; `funnelId` is also the URL/API key.
- `experiment.variants.A` / `.B` — each has its own `weight` (assignment ratio), its own ordered
  `stepSequence` (variants can fully reorder steps, not just remove one), optional `stepOverrides`
  (per-step `content` overrides) and `resultOverrides` (per-result `title`/`summary`/`cta`
  overrides). `experiment.overrideQueryParam` names the query param used to force a variant for QA.
- `steps` — a map of step id → step definition (`type`, `content`, and for interactive types an
  `input` + `validation`). A step can carry a `visibleWhen` condition (`{answer, operator, value}`,
  or `{any:[...]}` / `{all:[...]}` of those) — the step is skipped when it evaluates false against
  the answers collected so far. This is the funnel's branching mechanism, alongside per-variant step
  order.
- `resultRules` (evaluated in order, same condition shape, first match wins) + `defaultResultId` +
  `results` — determine which result screen a session lands on based on its answers.
- `events.privacy.storeRawAnswers: false` — honored literally (see Event schema below).

## Data model

```
funnels            (id, key, name)              -- key = the config's funnelId
funnel_versions    (id, funnel_id, version, status: active|archived, config_json, published_at)
sessions           (id, funnel_id, funnel_version_id, version, variant, answers_json,
                     current_step_id, visited_steps_json, utm_*)
events             (event_id PK, session_id, funnel_id, funnel_version_id, version, variant,
                     type, step_id, utm_campaign, client_ts, server_ts, properties_json)
```

- A funnel has many **versions**; exactly one is `active` at a time. Publishing archives the
  previous active one and keeps incrementing `version`. `POST
  /api/admin/funnels/:funnelId/versions/:version/activate` reactivates any existing version — that's
  rollback, and it never deletes a version row, so history and past analytics stay intact.
- A **session** is created against the funnel's currently-active version and pinned to
  `funnel_version_id` for its whole lifetime — publishing a new version afterwards does not move it.
  `current_step_id` and `visited_steps_json` (a simple back/forward stack of step ids) are the
  server-side source of truth for "where is this user right now", so refresh/reopen/back all resolve
  from the DB, never from client state.
- **Events** are denormalized with `funnel_id`, `version`, `variant` and `utm_campaign` copied from
  the session at ingestion time (indexed columns, since these are what filtering/aggregation uses);
  everything else the config's `events.baseProperties` asks for (`experiment_id`, `utm_source`,
  `utm_medium`) is folded into `properties_json` instead of given its own column, since analytics
  never filters on it — see `insertEventsBatch` in `apps/server/src/db/repo.ts`.

## Event schema & ingestion rules

`POST /api/events` accepts `{ events: TrackedEvent[] }`, up to 500 per batch:

```ts
TrackedEvent = {
  event_id: string;   // client-generated, e.g. crypto.randomUUID()
  session_id: string;
  type: string;        // session_started | step_viewed | answer_submitted | step_completed |
                        // back_clicked | result_viewed | cta_clicked
  client_ts: number;    // the config calls this client_timestamp; same thing, shorter wire name
  step_id?: string;
  properties?: Record<string, unknown>;
}
```

The server looks up `funnel_id`, `version`, `variant` and `utm_campaign` from `session_id` and
stamps them on the row — the client never sends them. It also adds `experiment_id`, `utm_source`
and `utm_medium` into `properties_json` at ingestion (see Data model above). The client only ever
supplies the event-specific properties the config's `events.allowed[].properties` calls for:

| type | client-supplied properties |
| --- | --- |
| `step_viewed` | `step_type`, `visible_step_index`, `visible_step_count` |
| `answer_submitted` | `answer_kind` (see privacy below — never the raw value) |
| `step_completed` | `next_step_id` |
| `back_clicked` | `destination_step_id` |
| `result_viewed` | `result_id` |
| `cta_clicked` | `result_id`, `action` |

**Privacy (`events.privacy.storeRawAnswers: false`):** the frontend never puts a raw answer value
into an event. Instead both it and the traffic generator call the shared
`deriveAnswerKind(step, value)` helper (`packages/shared/src/funnel-engine.ts`): a `single-select`
answer passes through as-is (it's already one of a handful of author-defined categories, not
open-ended data), a `multi-select` answer becomes its sorted, `+`-joined set of chosen values, and a
`number` answer is bucketed into `low` / `mid` / `high` thirds of the input's configured range
rather than stored exactly — team size, tool count etc. never appear as precise numbers in an event.
This is a judgment call on what "raw" means for a bounded category vs. an open numeric input;
documented here since the config doesn't spell out the bucketing itself.

Invariants, and how they're enforced (`apps/server/src/db/repo.ts#insertEventsBatch`):

- **Idempotency:** `event_id` is the primary key; insertion uses `INSERT OR IGNORE`, so resubmitting
  the same `event_id` (retry after a timeout, or a duplicate in the same batch) is a no-op. The
  response reports which ids were newly `accepted` vs. already `duplicates`.
- **Partial failure isolation:** each event in a batch is inserted independently in a loop with its
  own try/catch; one event referencing an unknown `session_id` (or any other per-row error) is
  reported in `failed` without rolling back or blocking the rest of the batch.
- **Order independence:** all aggregation is existence-based (`COUNT(DISTINCT session_id) WHERE type = ...`),
  never "the Nth event chronologically", so events arriving out of `client_ts` order don't skew
  counts.

## Analytics aggregation rules

`GET /api/analytics?funnelId=&version=&variant=&utmCampaign=`

- `sessionsStarted` is `COUNT(DISTINCT id)` on the **sessions** table (not on `session_started`
  events) — a session row only ever exists if a session was actually created, so this is robust even
  if the client never got to send that first event.
- `resultReached` / `ctaClicks` are `COUNT(DISTINCT session_id)` on `events` for
  `result_viewed` / `cta_clicked`. `ctaCTR = ctaClicks / resultReached` ("of the people who saw the
  result, how many clicked the CTA" — not `/ sessionsStarted`; documented here since either
  definition is defensible).
- **Per-step funnel:** step order is the filtered version+variant's full `stepSequence` from its
  config (or the active version / variant A if unfiltered) — deliberately *not* narrowed by
  `visibleWhen`, because a step like `office_days` only becomes visible after `work_mode` is
  answered; evaluating visibility against "no answers yet" would drop it from the table entirely.
  Showing the full possible sequence and letting a conditionally-visible step's `viewedSessions` come
  out lower than its neighbors is the more honest picture. `dropOff` for step _i_ is
  `viewedSessions[i] - viewedSessions[i+1]` (the last step's "next" is `resultReached`).
- `byVariant` / `byVersion` repeat the same summary metrics grouped by variant (A/B, ignoring any
  variant filter) and by version, so both comparisons are always available regardless of the active
  filters.

## A/B experiment (`question-order-and-result-framing-v1`)

Reverse-engineered from what variant B actually changes in the supplied config (it isn't spelled out
in prose there), so this is our interpretation of the intent, documented for the record:

**What B changes:** it reorders the sequence so `work_mode` (the identity-defining question — remote
/ hybrid / office) is asked second, right after the intro, instead of after the more effortful
numeric `team_size` question; `timezone_span` and `async_maturity` also move earlier, `priorities`
later. The intro and priorities copy are reframed to be more direct/benefit-led ("How should your
team really work?" / "Show me"). Every result's title and CTA are overridden to a more specific,
action-oriented framing ("Your team is ready to reduce meetings" / "See the 30-day action list") in
place of the generic base copy ("Async-native" / "View the action list").

**Hypothesis:** leading with the question most predictive of the eventual recommendation (rather
than a numeric-input question first) reduces early drop-off, and a more specific, benefit-framed
result + CTA increases the click-through once someone reaches it.

**Primary metric:** CTA click-through rate — `cta_clicked` unique sessions ÷ `result_viewed` unique
sessions, compared A vs. B via `/api/analytics` → `byVariant`.
**Secondary/guardrail metric:** overall completion rate, `resultReached ÷ sessionsStarted`, to check
the reordering doesn't just relocate the drop-off point rather than reducing it.

Variant assignment (`apps/server/src/lib/variant.ts`) is weighted-random at session creation (50/50
here, but reads each variant's `weight` from the config rather than assuming an even split), stored
on the session row so it's stable across refresh/resume, with the config's
`experiment.overrideQueryParam` (`?variant=A` / `?variant=B` here) as a query override for QA.

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

- **2026-09-04, first pass:** before any real config had been shared, built the whole system
  (monorepo scaffold, funnel engine, versioning/events/analytics API, React runtime + admin +
  analytics pages, traffic generator, 12-test Vitest suite) against a placeholder config schema of
  our own design, to have an end-to-end skeleton ready.
- **2026-09-04, same day, config received:** the assignment's actual `funnel-v1.json`
  (`workstyle-planner`) turned out to use a materially different, more specific format — fixed
  per-variant `stepSequence` + `visibleWhen` conditions instead of a `next`-pointer graph, separate
  `resultRules`/`results`, an explicit `events.privacy.storeRawAnswers: false`. Rather than adapt the
  invented schema to fit, `packages/shared`'s types and engine, the DB enrichment, both API routes,
  the frontend, and the traffic generator were rewritten to match the real config's contract exactly
  — verified step by step against the running server (branching, `visibleWhen`, result rules,
  variant content/result overrides, publish/rollback, event property enrichment, and a full 130
  synthetic-session run) before moving on. Full Vitest suite re-verified green throughout.
- **Iteration 2:** not started — the second config for the "add a branch / remove a screen for B /
  new event / old sessions keep working" exercise hasn't been provided yet.

## Known limitations & assumptions

- Only one config (`workstyle-planner.v1.json`) has been supplied so far; iteration 2 (a second
  config, published/verified/rolled-back per the assignment) is pending.
- `node:sqlite` is an experimental Node API; a Node upgrade could change its behavior. If that
  becomes a blocker, swapping in `better-sqlite3` only touches `apps/server/src/db/client.ts`.
- No auth on `/admin`, `/analytics` or the admin API — acceptable for an internal tool in a take-home,
  not for a real deployment.
- The numeric-answer → `low`/`mid`/`high` bucketing for `answer_kind` is our own choice (the config
  says *not* to store raw answers but doesn't specify the bucketing scheme).
- The "answer" endpoint only accepts an answer for the session's current step (no skipping ahead by
  guessing future step ids); going back and answering differently is supported and simply continues
  from there.
- WAL-mode SQLite is a single-writer store; fine for this workload/scale, not meant to be scaled
  horizontally as-is.
- No visual config editor, as explicitly out of scope — versions are published by pasting JSON on
  `/admin`.
- The Railway deploy of `server` has no attached volume, so the SQLite file lives on the container's
  ephemeral disk and resets on redeploy/restart — fine for reviewing this take-home, not for
  production. Run `npm run seed:traffic` (with `API_URL` pointed at the live API) again after any
  redeploy if the dashboard needs to show data.

## Agent process

Built with Claude Code. First pass: shared types/engine, SQL schema + repo layer, routes (verified
against a running server with `curl` before moving on — this caught two real bugs: a missing
`Content-Type` guard on bodyless requests that broke `back`, and a `node:sqlite`-vs-Vite module
resolution issue that broke `vitest`), the Vitest suite, the frontend, the traffic generator — all
against a config schema invented in the absence of a real one.

When the assignment's actual config arrived mid-session, it was read in full and diffed against what
had been assumed before touching any code, since it materially changed the branching model (fixed
`stepSequence` + `visibleWhen` vs. a `next`-pointer graph) and added an explicit privacy constraint
(`storeRawAnswers: false`) the original design didn't honor. The rework went shared package first (so
every consumer moves together), then server, then frontend, then the generator, re-verifying with
live `curl` calls and the full synthetic-traffic run at each stage rather than assuming the rewrite
was correct — including a manual walkthrough of the `office_days` conditional-visibility branch, the
`hybrid_structured` result rule, and variant B's content/result overrides against the real config,
plus inspecting raw DB rows to confirm `answer_kind` (not raw values) is what actually gets
persisted.
