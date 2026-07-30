# CLAUDE.md

Guidance for Claude Code working in this repository.

## Project

**Kova** — a multi-tenant, multi-trainer platform for personal-training
businesses. Product + technical spec in [SPEC.md](SPEC.md); the ByShujaa feature
inventory Kova is modeled on is in
[docs/BY-SHUJAA-FEATURES.md](docs/BY-SHUJAA-FEATURES.md).

**Looking for the file that draws a screen?** [docs/SCREENS.md](docs/SCREENS.md)
maps every surface — routes, sub-tabs, and the sheets/drawers that aren't routes
— to `file:line`, per persona. Grepping for a screen's name usually fails: one
path renders different files per persona, and most surfaces live inside their
parent's file. **Update it in the same commit as any screen you add or move.**

**UI: two files, and the order matters.** [UI-LANGUAGE.md](UI-LANGUAGE.md) is the
interface language — hierarchy, layout, tokens, motion, copy, component grammar —
written product-agnostically because it is the extraction target for the shared
UI package other 4DL apps will consume. [DESIGN.md](DESIGN.md) maps Kova's
screens onto it. **When they disagree, UI-LANGUAGE.md wins.** DESIGN.md lists the
remaining deltas and UI-LANGUAGE.md §13 gives the order to close them.

**The design system is `@4dl/ui`, not Kova's.** It is shared across 4DL apps, so
it carries no product vocabulary: no clients, workouts, meals, or coaches, and no
router. Kova's registries (`METRICS`, `MACRO_KEYS`, `FASTING_ZONES`, personas,
`MetricChip`/`MacroBar`) live in `apps/app/src/registry/`, and
`registry.conformance.test.ts` keeps them there. The boundary rule — plus the one
documented leak (`Tone`) — is in [packages/ui/README.md](packages/ui/README.md).
Read it before adding anything to that package.

## Stack

Cloudflare Workers + Hono + Durable Objects + D1 + KV + R2 + Workers AI ·
Better Auth (**100% passwordless: email OTP + passkeys**) · Vite + React 19 PWA
(**one app for all roles**) · shadcn-style UI + Tailwind v4 · Stripe (platform
rail + Connect tenant rail). Package manager: **pnpm** (Node ≥22).

## Layout

```
apps/
  api/   # THE worker — Hono router + TenantBillingDO; serves the app SPA
  app/   # ONE role-adaptive PWA (client / trainer / owner / platform admin)
  www/   # marketing site (dependency-free static generator)
  e2e/   # Playwright — the golden paths, in a browser against the real worker
packages/
  core/      # @4dl/core — the floor every 4DL package stands on: ids, defensive
             # JSON columns, the STRUCTURAL BINDINGS CONTRACT (HasDb/HasMedia/…)
             # and the COMPOSED SCHEMA RUNNER (SchemaModule/applySchema), plus
             # the boundary checker at @4dl/core/boundary. See its README.
  auth/      # @4dl/auth — PASSWORDLESS identity + authorization: the Better Auth
             # factory (email OTP + passkeys, org = tenant), the request identity,
             # the five-gate route-guard ENGINE, the grant algebra, staff seats,
             # step-up codes. Nothing here depends on billing. See its README.
  tenancy/   # @4dl/tenancy — multi-tenant ADDRESSING: the five doors, host→tenant
             # resolution + KV cache, custom domains (Cloudflare for SaaS + DCV),
             # the standing/host-gate model. `@4dl/tenancy/model` is the pure half
             # the browser may import. See its README.
  platform/  # @4dl/platform — BEING DISSOLVED (credits→billing, promo→commerce,
             # ai-mock→ai). Do not add to it. See its README.
  domain/    # @kova/domain — Kova's pure logic (no I/O): nutrition/TDEE, body-fat,
             # activity/workout math, progress, plus the product registries
             # (entitlements, perms, budgets, notifications, features). Tested.
  protocol/  # zod wire schemas shared api <-> app (plan bodies, log payloads, context)
  ui/        # @4dl/ui — the SHARED design system: tokens + product-agnostic
             # primitives. No product vocabulary, no router. See its README.
  brand/     # (reserved) logos, illustrations
```

## Commands

- `pnpm dev` — turbo: api (`wrangler dev` on :8787) + app (vite on :5173, proxies /api)
- `pnpm typecheck` / `pnpm test` — across the workspace
- `pnpm --filter @kova/api test` — the Miniflare integration suite. **Build the
  SPA first** (`pnpm --filter @kova/app build`) — the worker's `assets` dir is
  `apps/app/dist`, and Miniflare aborts (reporting "no tests") without it. The
  root `pnpm test` handles this automatically (turbo builds the app first).
  ⚠️ Under a *parallel* root `pnpm test` this suite can fail with
  `Isolated storage failed` — Miniflare storage contention with the sibling
  tasks, not a real failure. Re-run it on its own filter before believing it.
- `pnpm --filter @kova/app build` — build the SPA (the api worker serves `apps/app/dist`)
- `pnpm e2e` — the Playwright golden paths (`apps/e2e`). One command from a clean
  checkout: turbo builds the SPA, Playwright boots `wrangler dev --local` on :8787
  and drives **that** origin (not vite :5173 — see the config header for why), and
  each spec creates its own studio + users, so runs never collide. Stop any
  `wrangler dev` you started with `pnpm dev` first — it shares `.wrangler` state.
  `E2E_SERVER_LOGS=1 pnpm e2e` un-mutes the worker's request log.

**Local dev needs no Cloudflare account** — but it needs one file. Copy
`apps/api/.dev.vars.example` → `apps/api/.dev.vars` before your first `pnpm dev`.
D1/KV/R2 are Miniflare-simulated, and `ENVIRONMENT=development` in that file is
what unlocks the mock lanes: the AI mock (`ai.ts` gates it on
`ENVIRONMENT === "development"`, so **without `.dev.vars` every AI call returns
"AI provider not configured" / "unavailable"** — not a bug, missing config) and
the mock mailer that logs OTP codes to the `wrangler dev` console (sign-in OTP
also has a localhost-Origin fallback; invites/notifications/action codes do not).
It also enables the `isPlatformAdmin` dev convenience.

⚠️ **`ENVIRONMENT` must never be added to `wrangler.jsonc`'s top-level `vars`** —
that block is the *deployed* config. In production the dev lane would put
sign-in OTPs in retained logs, accept the repo-public auth-secret fallback
(forgeable sessions), and turn on the AI mock — which fabricates output,
including clinical lab values from `lab-extract`, **and still bills the tenant
credits for it**. See DEPLOY.md §8.

The `ai` binding is enabled in `wrangler.jsonc`; for a fully credential-free
`wrangler dev` you can re-comment it — or just pass `--local`, which disables
remote bindings without editing the config (this is what the E2E suite does).

## Architecture notes (read before changing these)

- **Auth**: the engine is `@4dl/auth`; `apps/api/src/auth.ts`, `auth-context.ts`,
  `route-guard.ts`, `otp-guard.ts` and `action-otp.ts` are thin bindings that
  supply Kova's RBAC registry, copy, seat quota and route tables. Org = tenant,
  OTP + passkey only (no password provider). The route guard's STANDING gate is
  injected (`gate: (c) => c.get("host").gate`), which is what keeps auth
  independent of billing. Read `packages/auth/README.md` before changing any of
  the five — particularly the three seat doors and the grant-bounding rule.
- **Row-level scope**: every coaching route goes through
  `requireClientAccess(c, clientId)` in `clients.ts` — owner/assistant = tenant
  match, trainer = `client_trainers` assignment, client = own record. This is
  the security invariant; never bypass it.
- **Credits**: `TenantBillingDO` (`billing-do.ts`) is the authoritative balance;
  AI goes through `ai.ts` `generate()` = reserve → run (Workers AI | mock) →
  settle. Metering math is pure in `@4dl/platform` credits.ts (moves to `@4dl/billing` in Stage 3).
- **Access economy**: `commerce-routes.ts` + `@kova/domain` budgets.ts —
  budgets carry `expiresAt`, days derive at read time, purchases QUEUE not sum,
  status reconciles lazily on read. No domain cron.
- **Two flag systems** (don't merge): platform entitlements (tenant bought from
  Kova, `entitlements.ts`) vs per-package client flags (client bought from the
  tenant, `clientFlags.ts`). Client capability = the intersection.
- **The host IS the tenancy** (read this before touching routing or auth).
  `@4dl/tenancy` `hosts.ts` classifies every hostname into five doors:
  `kova.4dl.app` = a signpost (not an app, refuses to send a sign-in code),
  `setup.` = the only place a studio is created, `admin.` = the operator console
  (`/api/admin/*` answers there and nowhere else), `<slug>.` = a studio, a tenant's
  own domain = the same studio. Anything else under the root 404s. `host-context.ts`
  turns that into a tenant; `auth-context.ts` pins the tenancy from it, so a session
  pointed at the wrong studio grants nothing. `/t/<slug>` is gone.
  - Studio slugs are DNS LABELS: validated server-side in `org-guard.ts`, which
    is a security control (a studio at `admin.` or `autodiscover.` would be a
    takeover). The list is in TWO halves and both are load-bearing:
    `RESERVED_LABELS` in `@4dl/tenancy` (universal — other doors, mail
    autoconfig, ACME, Workers plumbing, money words) plus `KOVA_RESERVED_LABELS`
    in `host-context.ts` (our brand names, which mean nothing to another app).
    `org-guard.ts` is the one place they meet; `apps/api/test/tenancy-adapter.test.ts`
    keeps the brand half covered. Adding a label is cheap; removing one changes a
    live studio's URL.
  - One passkey and one session across every door under the root (`rpIdFor`,
    `cookieDomainFor`). A custom domain gets its own — WebAuthn allows nothing else.
  - The console is reachable at `admin.` and NOWHERE else. There used to be an
    `/admin` route inside the studio Shell too; in production it rendered the
    whole console and then 404'd on every call, because `/api/admin/*` answers
    on the operator door only. It is gone — the avatar menu now hops to the door
    (`adminUrl()`), which is the one address the console has.
  - `wrangler.jsonc` declares NO `routes`, deliberately: declaring them makes
    `wrangler dev` rewrite the incoming Host to the route's hostname, which collapses
    every door onto the root. The two production routes are a dashboard step
    (DEPLOY.md §11). Read the header comment before adding them back.
- **Two access ladders, and they must not be confused.**
  - **Kova → tenant** (`@4dl/tenancy` standing.ts, `DUNNING_DAYS`): past_due →
    **7d read-only** → **30d blocked** → **37d purged**, all anchored on
    `past_due_at` and driven by `dailySweep`. `resolveHostGate` turns the status
    into a gate that `route-guard.ts` enforces once for every route; `readOnly`
    still serves the whole app, `blocked` makes the Shell replace it with
    `StudioBlocked`. Reads are NEVER gated, at any rung — withholding the product
    is not the same as holding a client's logbook over their coach's invoice.
    Stripe webhooks are exempt (blocking them would make suspension
    unrecoverable), and so are `/api/me/*` and `/api/tenant/close`: **leaving is
    always allowed.** Paying must be a way out, not the only one.
  - **tenant → client** (`@kova/domain` lapse.ts): the STUDIO's own rule for a
    client whose package ran out — read_only / blocked / archive / delete after N
    days, in studio settings. `archive` KEEPS a client seat, `delete` FREES one.
    The destructive pair carries a 14-day floor, and the sweep **freezes this
    whole rail unless the studio is itself in good standing** — a studio Kova
    suspended must not be shredding a roster it can no longer see.
  - Serialise the gate by spreading it (`{ ...host.gate }`). Hand-picking fields
    is how `blocked` reached the model, the resolver and the Shell while
    `/api/host` still sent only `{ readOnly, reason }`, so the app read
    `gate.blocked` as undefined and rendered the ordinary read-only app.
- **One UI, three roles**: `apps/app/src/Shell.tsx` swaps nav by persona + mode;
  the trainer's client-detail renders the *same* client surfaces scoped to that
  client. Role changes scope + powers + nav, never screens.

## Conventions

- **One fact, one home.** A metric a client can record has exactly one owning
  table (`sleep_logs`, `mood_logs`, `steps_logs`, `water_logs`, `measurements`),
  and a check-in is a REPORT that writes THROUGH to those (`writeThroughCheckIn`
  in log-routes.ts) while keeping its own columns as a frozen as-at-submission
  snapshot for the coach. Readers merge per DATE and per FIELD with the dedicated
  table winning. This is not stylistic: when only weight was mirrored, sleep
  logged from the log drawer never appeared on the Progress chart, the wellness
  score double-counted a day rated in both places, and `check_ins.sleep_quality`
  was read by Progress while nothing ever wrote it.
- **Adding DDL means bumping `KOVA_SCHEMA.version` in `db.ts`.** The marker row
  short-circuits the entire module, so a new `CREATE TABLE IF NOT EXISTS`
  without a bump is invisible on a fresh database and fatal on every existing
  one — the table is never created and every route touching it 500s. The schema
  is now a `SchemaModule` in `@4dl/core`'s composed runner; the other rules its
  statements must satisfy (terminate with `;`, no `--`, ALTERs are ADD COLUMN
  only) are asserted by `apps/api/test/schema-module.test.ts` because every one
  of them fails silently. Read `packages/core/README.md` before editing the DDL.
- Store metric, convert at display (`@kova/domain` units.ts). Day-bucketed
  rows use the client's local date (`date_local`, YYYY-MM-DD) from the device.
- Plan/meal bodies are JSON columns validated by `@kova/protocol` at the route.
- Pure domain logic gets unit tests; API flows get Miniflare integration tests.
  Run tests with the `wrangler dev` server stopped (they share `.wrangler` state).
- Prettier-ish: no semicolons aren't enforced here — match surrounding style.

## Status

Be conservative here: this section is read as ground truth by future agents, so
an over-claim costs more than an under-claim. Verify before editing it.

**The platform extraction is under way** — [docs/PLATFORM-EXTRACTION.md](docs/PLATFORM-EXTRACTION.md)
is the audit and the staged plan for turning this repo from "Kova with two shared
packages" into "the 4DL platform, on which Kova is the first app". Three more apps
are queued. **Stages 0 (the mechanisms), 1 (`@4dl/tenancy`) and 2 (`@4dl/auth`) are done**;
stages 3–9 are not. Read it
before moving anything between `apps/api` and `packages/`.

**Tests** — recount with `pnpm test` before quoting a figure anywhere; the suite
moves. Measured most recently, per package: **486 API + 212 domain + 73 tenancy +
64 ui + 52 app + 33 platform + 14 core + 12 auth + 7 protocol** (953 total,
38 skipped).
Package counts shift as the extraction proceeds — Stage 1 moved 68 tests from
`@4dl/platform` to `@4dl/tenancy`; the split moves tests, it does not add any.
The pricing and normalizer suites live
in `apps/api/test` and are already *inside* the API count — the older
"protocol/pricing/normalizer" phrasing double-counted them. **E2E is separate**
(`pnpm e2e`, not part of `pnpm test`): 3 Playwright specs, ~40 s all in, all green.

**Built and tested:** foundation, auth (OTP + passkeys, incl. autofill /
conditional UI), tenancy + row-level scope, the AI suite (credits reserve →
run → settle), commerce (platform rail + Connect rail), content, reports, media,
tenant custom domains (Cloudflare for SaaS, per-domain WebAuthn RP — SPEC §14.1),
the vision suite (Snap-a-Meal + Label Reader) on a real Gemini path, InboxDO
real-time notification push (WebSocket DO; the bell keeps a slow poll as a
backstop), plan-editor affordances (copy-week with progression, superset/circuit
round-logging), the workout UI parity pass, the rebuilt Train tab, and the
offline-first PWA (app-shell precache + Background-Sync replay of failed
log-write POSTs).

**E2E (Playwright) — three golden paths, `apps/e2e`, run with `pnpm e2e`.** What
they cover, precisely:
1. owner sign-up → studio create → invite a client by email → the client signs in
   with their own OTP, auto-links, and completes the 5-step intake wizard → the
   coach sees the entered profile. (The path that 403'd on the client persona's
   first write; the integration suite structurally cannot see that class of bug —
   AGENTS.md §4.)
2. coach builds + publishes a workout plan → the client sees it as their active
   plan, opens the player and logs a set → the coach sees the set on the client's
   day.
3. client creates a food by hand and logs a portion as a snack → their diary and
   day totals move and survive a reload → the coach sees the meal.

Each spec provisions its own studio and users (unique emails), so the suite is
re-runnable with no reset. The sign-in OTP is read out of the local Miniflare D1
`verification` table, never from a log. **NOT covered by E2E:** commerce/Stripe,
the AI suite, the camera paths (Snap-a-Meal, barcode, label, body scan), external
food/exercise search, notifications/inbox, staff invitations, custom domains, the
offline lane (the config blocks the service worker on purpose), and anything
desktop-width — the projects list is Chromium at a phone viewport only.

⚠️ **Both suites run on the real host topology, via `*.localhost`.** `wrangler dev`
and Miniflare preserve the Host, and browsers resolve `.localhost` to loopback, so
the integration suite signs in on `setup.localhost:8787` and asserts tenant
behaviour on `<slug>.localhost:8787`, and the E2E suite drives the same doors.
`apps/e2e/src/resolve-localhost.ts` supplies `.localhost` resolution for Node,
because some container images do not implement RFC 6761.

Two honest dev-only differences from production, both documented where they bite:
- **The session cookie is host-only locally.** `Domain=localhost` is rejected by
  browsers, so `cookieDomainFor` returns null for loopback and each `*.localhost`
  has its own jar. Production issues one cookie for the whole root, so one sign-in
  covers every studio. The E2E fixtures carry the real cookie across hosts rather
  than signing in twice (which the OTP cooldown would correctly refuse).
- **The operator-door restriction stands down in dev** (`isDevRoot`), because dev has
  a single root and therefore no separate door.

⚠️ Still :8787 (the worker serving the built SPA), never vite's :5173: with the vite
proxy the browser Origin is `localhost:5173` while the worker's is `localhost:8787`,
and Better Auth 1.6.23 ignores the `trustedOrigins` array `auth.ts` passes it — so
every *cookie-bearing* Better Auth POST 403s `INVALID_ORIGIN`. Production is
same-origin and unaffected.

**NOT built** (do not describe any of these as shipped):
- **Wearable import** (Health Connect).
- **Trainer ↔ client chat** — `chat` is `reserved: true` in
  `@kova/domain/entitlements.ts`. No plan in the current catalog (Solo/Light/Pro/
  Max) enables it; the retired `studio`/`team` rows still carry `chat: true` in
  their stored D1 JSON, left untouched so a grandfathered tenant keeps exactly what
  it was sold. Inert either way — reserved features are unenforced by construction.
- **Tenant API / webhooks / data exports** — the `integrations` entitlement is
  also `reserved: true`: no export route, no CSV serializer, no download UI, no
  tenant API-key issuance, no webhook dispatcher. SPEC §11 promises data export;
  it does not exist. (The www pricing page no longer advertises it.)
- **Tenant marketplace storefront** and the **public blog renderer**.
- **Analytics Engine `USAGE`** — binding referenced, not wired.
- **Six catalogued AI features**: voice logging, meal swap, menu scout,
  periodization assistant, the retention-radar per-client LLM line, and the
  business-digest narrative. The retention *report endpoint* exists but has no
  UI caller; the coach dashboard only shows a simpler "At risk" count.

**Shipped but thinner than it sounds:**
- The Train tab's "browsable library grid" is nearly empty in practice — the
  platform seed ships zero exercise thumbnails, only two real categories, and no
  favourites.
- "Training Load vs target" doesn't reach the client in production.

**Ops:** deployment is genuinely non-trivial — read DEPLOY.md before touching
anything deploy-shaped. Notably: a fresh deploy **cannot send email** until
`email.provider`/`email.from` are set directly in D1 (there is no admin email UI,
and the mock provider fails closed outside dev), and the whole vision suite is
dead until `google.gemini_key` is set.

See SPEC §13 for the phase map.
