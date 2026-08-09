# CLAUDE.md

Guidance for Claude Code working in this repository.

## Project

**Kova** — a multi-tenant, multi-trainer platform for personal-training
businesses, and the first app on this repo's shared platform. Everything Kova is
lives in **[KOVA.md](KOVA.md)**: Part I the product + technical spec, Part II the
design mapping, Part III the screen index, Part IV the body-scan design.

**Looking for the file that draws a screen?** [KOVA.md](KOVA.md) **Part III**
maps every surface — routes, sub-tabs, and the sheets/drawers that aren't routes
— to `file:line`, per persona. Grepping for a screen's name usually fails: one
path renders different files per persona, and most surfaces live inside their
parent's file. **Update it in the same commit as any screen you add or move.**

**UI: two files, and the order matters.** [UI-LANGUAGE.md](UI-LANGUAGE.md) is the
interface language — hierarchy, layout, tokens, motion, copy, component grammar —
written product-agnostically because it is the extraction target for the shared
UI package other 4DL apps will consume. [KOVA.md](KOVA.md) Part II maps Kova's
screens onto it. **When they disagree, UI-LANGUAGE.md wins.** Part II lists the
remaining deltas and UI-LANGUAGE.md §13 gives the order to close them.

**The design system is `@4dl/ui`, not Kova's.** It is shared across 4DL apps, so
it carries no product vocabulary: no clients, workouts, meals, or coaches, and no
router. Kova's registries (`METRICS`, `MACRO_KEYS`, `FASTING_ZONES`, personas,
`MetricChip`/`MacroBar`) live in `apps/app/src/registry/`, and
`registry.conformance.test.ts` keeps them there. `Tone` is now five STATUS tones
plus anything the app registers by convention — Kova's eleven accents and their
tokens live in `apps/app/src/registry/tones.ts` + `tokens.accents.css`. The
package's boundary ALLOW list is EMPTY. Read
[packages/ui/README.md](packages/ui/README.md) before adding anything to it.

## Stack

Cloudflare Workers + Hono + Durable Objects + D1 + KV + R2 + Workers AI ·
Better Auth (**100% passwordless: email OTP + passkeys**) · Vite + React 19 PWA
(**one app for all roles**) · shadcn-style UI + Tailwind v4 · Stripe (platform
rail only — tenants pay Kova). **Tenants are paid by their OWN customers on their
OWN provider**; Stripe Connect is gone. Package manager: **pnpm** (Node ≥22).

## Layout

```
apps/
  api/   # THE worker — Hono router + TenantBillingDO; serves the app SPA
  app/   # ONE role-adaptive PWA (client / trainer / owner / platform admin)
  www/   # marketing site (dependency-free static generator)
  e2e/   # Playwright — the golden paths, in a browser against the real worker
  _template/ # a NEW 4DL app, WORKER half: every shared package wired AND
             # MOUNTED, no product vocabulary. Typechecks + tests in this
             # workspace so it cannot rot.
  _template-app/ # ...and its BROWSER half. Copy BOTH. The doors, the session,
             # the theme, `pickScreen`, the Shell, the console binding, the
             # accent registry and five conformance tests — every file carrying
             # the bug it exists to prevent. This directory is why a fifth app
             # does not re-derive the UI: every divergence in this repo happened
             # while it did not exist.
packages/
  core/      # @4dl/core — the floor every 4DL package stands on: ids, defensive
             # JSON columns, the STRUCTURAL BINDINGS CONTRACT (HasDb/HasMedia/…),
             # the COMPOSED SCHEMA RUNNER (SchemaModule/applySchema), the
             # app_config table AND the SHARED PLATFORM-CONFIG STORE under it
             # (one KV, same id in every worker — set the Google key once, not
             # once per product), plus the boundary checker at
             # @4dl/core/boundary. See its README.
  ai/        # @4dl/ai — the METERED generation path: model catalog, Workers AI +
             # Gemini, reserve→run→settle against the credit DO, the dev-only
             # mock lane, pricing parsers. Prompts are the app's. See its README.
  auth/      # @4dl/auth — PASSWORDLESS identity + authorization: the Better Auth
             # factory (email OTP + passkeys, org = tenant), the request identity,
             # the five-gate route-guard ENGINE, the grant algebra, staff seats +
             # the staff ROUTES (roster with pending invitations, invite, revoke,
             # re-role, remove — roles, copy and the invite email injected),
             # step-up codes. Nothing here depends on billing. See its README.
  commerce/  # @4dl/commerce — the ACCESS ECONOMY a tenant sells to its own
             # customers: budgets (queue, never sum), the customer-lapse ladder,
             # website-native discount codes. See its README.
  billing/   # @4dl/billing — the entitlement ENGINE (quotas/gates/grants, keys
             # injected), the catalog STORE (version-stamped seeding, plan/pack
             # reads, subscription resolution, the two ceilings — the catalog's
             # CONTENTS are the app's), credit metering, the per-tenant credit
             # Durable Object (CreditLedgerDO — the class NAME is load-bearing),
             # the Stripe client, the dunning ladder, BOTH OPERATOR route trees
             # (the plan catalog, and the Stripe lane — status/credentials/sync,
             # two lanes, the mode-flip catalog swap and the price rebuild; the
             # catalog TABLES stay the app's, so `syncCatalog` is injected), and
             # the refund/dispute CREDIT REVERSAL (proportional, clamped, and
             # incremental against Stripe's cumulative `amount_refunded`).
             # See its README.
  storage/   # @4dl/storage — R2 + the media ledger + the quota gate (resolver
             # injected, so it does not depend on billing), plus the three media
             # ROUTES: upload, the storage meter, the authed read. The closed
             # `purpose` set is the app's — it is a path segment. See its README.
  email/     # @4dl/email — transactional mail: the provider decision, the MIME
             # builder, the tenant lane (platform | own Brevo key | off) and the
             # HTML component kit. Brand injected; the credit METER is a
             # parameter, not a global. `@4dl/email/model` is the pure half.
  notify/    # @4dl/notify — the inbox, whole: the CHANNEL ALGEBRA (role ×
             # category → inbox/email, prefs, the owner's email veto), the one
             # DISPATCH path (email is an optional hook), the four ROUTES, and
             # InboxDO (one DO per user, hibernating WebSockets, push =
             # "refetch"). The TYPES and their copy are the app's, handed over
             # once via `configureNotify`. The BELL is `@4dl/app-kit`'s.
             # See its README.
  purge/     # @4dl/purge — ERASURE DERIVED from every module's `scoped`
             # declaration, plus the two conformance checks that make a
             # forgotten table and a renamed column test failures instead of
             # silent no-ops. Pure. See its README.
  tenancy/   # @4dl/tenancy — multi-tenant ADDRESSING: the five doors, host→tenant
             # resolution + KV cache, custom domains (Cloudflare for SaaS + DCV),
             # the standing/host-gate model, the deployment-wide MAINTENANCE
             # switch, and the tenant-CLOSE routes (leaving is always allowed —
             # the state transition is the app's). `@4dl/tenancy/model` is the
             # pure half the browser may import. See its README.
  domain/    # @kova/domain — Kova's pure logic (no I/O): nutrition/TDEE, body-fat,
             # activity/workout math, progress, plus the product registries
             # (entitlements, perms, budgets, notifications, features). Tested.
  protocol/  # zod wire schemas shared api <-> app (plan bodies, log payloads, context)
  ui/        # @4dl/ui — the SHARED design system: tokens + product-agnostic
             # primitives. No product vocabulary, no router. See its README.
  billing-rail/ # @4dl/billing-rail — ONE STRIPE ACCOUNT, MANY APPS: event→app
             # attribution (metadata.app, legacy <prefix>_* keys, or an app's own
             # `claims` lookup), the app-tagged catalog, rail_parked_events —
             # the dead letter an unattributable event lands in INSTEAD of being
             # answered 200 and forgotten — and the OPERATOR ROUTES over it,
             # because a dead letter nobody can read is the same silent success
             # with an extra table. See its README.
  admin/     # @4dl/admin — the OPERATOR CONSOLE on every app's `admin.` door:
             # the router-free section-registry shell, plus panels for config a
             # shared package owns (email delivery, maintenance, Stripe, domains,
             # Turnstile, AI, shared config, the rail's dead letter, and the PLAN
             # CATALOG — price, limits, features, grant and the free TRIAL, which
             # no app could edit before it moved). The SECTIONS are the app's.
             # See its README.
  app-kit/   # @4dl/app-kit — the BROWSER runtime: the typed fetch layer and its
             # three-way offline outcome (queued | offline | HTTP error), host
             # resolution across the five doors, prefixed storage, the passkey
             # ceremony + PasskeysCard, Stripe.js + PaymentSheet, Turnstile,
             # ErrorBoundary, hard-refresh, the OFFLINE build config
             # (@4dl/app-kit/pwa), and the INBOX SURFACE
             # (NotificationBell + InboxScreen, registry injected). Router-free
             # on purpose — `onOpen` hands the notification back. See its README.
  i18n/      # @4dl/i18n — TRANSLATION, and deliberately small: typed dictionaries,
             # `{name}` interpolation, one plural rule (en/de share it), a locale
             # from the browser that the person can override. No ICU, no lazy
             # bundles, no RTL — each is real work a real requirement would
             # justify, and none is justified by "English and German". Raised as a
             # PLATFORM question by Tessa (TESSA.md §2.4), not a Tessa one.
             # ⚠️ `@4dl/ui`'s own strings are NOT translated — see its README.
  brand/     # (reserved) logos, illustrations
```

## The app registry — `apps.json`

**Every deployable thing in this monorepo is declared once, in
[`apps.json`](apps.json), and no workflow names an app.** CI, deploys and
provisioning all derive their app list from it, so shipping a second product is a
registry entry and a workflow run — not four YAML edits.

| Workflow | Reads the registry for |
|---|---|
| `ci.yml` | every SPA to build before the unit lanes; one E2E job per **affected** Playwright suite |
| `deploy.yml` | every app **the push actually changed** — and it **skips** one whose `wrangler.jsonc` still holds placeholder ids |
| `boot-check.mjs` | each app's `BETTER_AUTH_URL`, probed at `/health` after deploy and after provisioning |
| `provision.yml` | the app id you type: creates missing D1/KV/R2, commits the real ids, deploys, mints `BETTER_AUTH_SECRET` if absent, seeds email |

`scripts/apps.mjs` is the reader (plain Node, no dependencies — the workflows
call it *before* `pnpm install`). `scripts/bind-resource-ids.mjs` is what writes
a resource id into a JSONC config, structurally and verified.
`scripts/affected.mjs` is what decides which apps a push touched.

**Only what changed is deployed, and the filter FAILS OPEN.** A push to main
still typechecks, tests and builds EVERYTHING — narrowing the safety net is how
a cross-package break gets through, and it is not the expensive part. What is
wasteful is redeploying a product that did not change: a new Worker version, a
cold start in every colo, a history entry recording that nothing happened.
`affected.mjs` walks the workspace dependency graph (`packages/ui` → both SPAs →
both apps; `apps/api` → Kova alone) and resolves **every** ambiguity to "deploy
everything" — an unresolvable base, an unrecognised path, any root-level file.
Under-deploying is a fix that silently does not ship behind a green run, which
is the failure class every other guard here exists to catch, so
`scripts/affected.test.mjs` asserts each fail-open path by name and runs in
`pnpm gate`. A manual `deploy.yml` run deploys everything by default: pressing
the button is a request, not a question — and it is how to re-ship an app whose
last deploy failed.

**The shared config namespace binds itself.** `deploy.yml`'s `wire` job
find-or-creates `PLATFORM_CONFIG` by title, writes the id into every app's
config and commits it — so nobody has to be told to go and run provisioning for
it. Safe on the deploy path where creating D1 or R2 would not be: the worst case
is an empty KV, it is idempotent, and a commit pushed with `GITHUB_TOKEN` starts
no new workflow run, so it cannot loop. It fails OPEN in every direction (no
token, no permission, a failed list) — a config feature must never be the reason
an app stops shipping.

**`spa` is the field that bites.** The worker serves its app through an `assets`
binding, and turbo **cannot** infer that dependency — an `assets.directory` is a
filesystem path, not a package dependency. A missing build makes the worker's
Miniflare suite abort reporting **"no tests"**, which reads as a pass. That is
what turned the merge adding `apps/tessa-app` red; naming the SPA here is the fix.

**One resource in the registry is NOT per-app: `sharedConfig`.** A single KV
namespace bound with the same id into every worker, holding the credentials the
whole platform has in common. Provisioning creates it once — whichever app runs
first — and binds the id it finds into every app after that. It is deliberately
ABSENT from a `wrangler.jsonc` until its id is real: `apps.mjs ready` reads every
id in the file, so a placeholder would mark a live app un-provisioned and
`deploy.yml` would silently SKIP it.

**Email is one address for the whole platform: `noreply@4dl.app`**, with a per-app
display name (`Kova <noreply@4dl.app>`). Onboarding a sender in Cloudflare Email
Sending is per-zone manual work, so sharing the address means a new app inherits
one that already works instead of a plausible-looking one that bounces.
Provisioning seeds it with `ON CONFLICT DO NOTHING` — an automation that upserted
would reset a live deployment's configured sender on every re-run.

**"Deployed" is not "working", and the workflows now check.** `scripts/apps.mjs
ready` only asks whether an app binds REAL resource ids — a question about the
*config*. Tessa passed it and shipped green from `deploy.yml` for a day while
`createAuth` threw `BETTER_AUTH_SECRET is not set` in the first middleware, so
every route 500'd including `/health`, and the SPA still loaded because static
assets never reach the worker. `scripts/boot-check.mjs` closes that: both
workflows probe `BETTER_AUTH_URL` + `/health` after deploying, and a hostname
that does not *resolve* is a notice (DNS/ACM are dashboard steps) while one that
resolves and answers wrongly is a failure.

**CI runtime is turbo's cache, and it is the whole story.** Measured on this
repo from cold: tests 4m25s, typecheck 1m17s, the SPA builds 24s. Warm, all of it
replays in under a second. Both workflows now persist `.turbo/cache` between runs
(`actions/cache`, ~16 MB), so a push that changed one app pays for that app only —
a Tessa-only change went 5m → **27s**. Restoring a build cache is safe here in a
way it usually is not: turbo keys each task on the content of its inputs, so a
package that changed misses and re-runs. A stale cache cannot make a broken
commit pass; it can only fail to save time. The one lane it does not shrink is
`@kova/api`'s own suite — 548 tests, each provisioning its world through real
OTP sign-ins — which is ~2.5 min whenever Kova's API changes, and is the price of
the coverage.

**Three dependency-free guards, and all are in `pnpm test`:**
`scripts/apps-manifest.test.mjs` fails on anything under `apps/` with a
`wrangler.jsonc` and no registry entry (`_template` exempt) — and on two apps
binding the SAME resource id, which is never a design and has happened once:
provisioning matched its KV namespace by title SUFFIX (`kova-CACHE` and
`tessa-CACHE` both end in `CACHE`), took the first hit, and pointed Kova's cache
at Tessa's namespace. `PLATFORM_CONFIG` is the one exemption, read from the
registry rather than hardcoded. Provisioning now matches the exact
`<worker>-<binding>` title,
`scripts/affected.test.mjs` on a deploy filter that would skip an app it should
have shipped, and `.github/workflows/workflows-parse.test.mjs` on a workflow
that would not parse —
a broken workflow does not *fail*, it does not *run*, and GitHub lists it by
filename with nothing saying why. Both guard failures that are silent rather than
loud, which is the only kind this repo has actually had.

**And every OTHER `pnpm gate` guard derives its app list from the registry too,
as of 2026-08-08.** Four of them did not, and each was hiding something:
`entitlement-enforcement` and `flag-enforcement` checked `apps/api` only — so
Tessa and Scena sold entitlements with nothing asserting a route enforced them,
and running the widened guard found six such keys (the sharpest being Scena's
`resyncIntervalSec`, where the number a paid tier buys never reaches the
player's fetch loop). `storage-chokepoint` named two apps by hand, so **Tessa's
R2 bucket and its `ai.ts` were unchecked**. `scena-fetch-chokepoint` is
`api-door.test.mjs` now and covers every registered SPA, with `@scena/player`
exempt in writing — a paired device has no session, so it has no 401 for a hook
to catch.

Two things that came out of widening them are worth knowing before writing the
next guard. **The narrow check is the one that gets waived:** matching Kova's
five gate shapes reported eight of Scena's entitlements as ungated and every one
of them was gated, because a destructured `Features` object and a dynamic
`features[needed]` lookup are invisible to call-shape matching. And **a widened
guard finds bugs in itself first** — two of the first failures were the parser's,
not the apps'. The unenforced keys are carried in `KNOWN_UNENFORCED` with a
reason each, and that list can only SHRINK: an entry that becomes enforced fails
the guard until it is deleted, so it cannot rot into a permanent exemption.

## Commands

- `pnpm dev` — turbo: api (`wrangler dev` on :8787) + app (vite on :5173, proxies /api)
- `pnpm typecheck` / `pnpm test` — across the workspace
- `pnpm --filter @kova/api test` — the Miniflare integration suite. **Build the
  SPA first** (`pnpm --filter @kova/app build`) — the worker's `assets` dir is
  `apps/app/dist`, and Miniflare aborts (reporting "no tests") without it. The
  same holds for `@4dl/tessa`/`@tessa/app` and `@4dl/scena`/`@scena/app`.
  ⚠️ An `assets.directory` is a filesystem path, not a package dependency, so
  nothing in the graph connects a worker's tests to its app's build — forgetting
  Tessa's is what turned the merge that added `apps/tessa-app` red. `turbo.json`
  now declares all THREE edges by hand (`@kova/api#test`, `@4dl/tessa#test`,
  `@4dl/scena#test`), so
  anything going through turbo — the root `pnpm test`, `pnpm turbo run test`, both
  CI workflows — builds the SPA first and CACHES it. `pnpm --filter <pkg> test`
  bypasses turbo and still does not.
  ⚠️ Under a *parallel* root `pnpm test` this suite can fail with
  `Isolated storage failed` — or `Network connection lost` thrown from
  `updateStackedStorage` / `onAfterTryTask`, which is the same fault with a
  different message: Miniflare storage contention with the sibling tasks, not a
  real failure. All four Workers-pool configs (`apps/api`, `apps/tessa`,
  `apps/scena`, `apps/_template`) now set `retry: 1`, which absorbs it — ONE retry, so a
  genuine assertion failure still fails twice and turns the run red. If a
  failure survives the retry, re-run the suite on its own filter before
  believing it.
- `pnpm --filter @kova/app build` — build the SPA (the api worker serves `apps/app/dist`)
- `pnpm e2e` — the Playwright golden paths (`apps/e2e`). One command from a clean
  checkout: turbo builds the SPA, Playwright boots `wrangler dev --local` on :8787
  and drives **that** origin (not vite :5173 — see the config header for why), and
  each spec creates its own studio + users, so runs never collide. Stop any
  `wrangler dev` you started with `pnpm dev` first — it shares `.wrangler` state.
  `E2E_SERVER_LOGS=1 pnpm e2e` un-mutes the worker's request log.
  `pnpm e2e` runs EVERY app's suite through turbo — Kova's on :8787, Tessa's on
  :8788, Scena's on :8789 (plus :8790 for its player, which is a second worker
  because a screen is a device with its own pinned origin). The ports are not
  taste: sharing one makes whichever suite runs second drive another product's
  worker, and it fails as "element not found" rather than as a conflict.
  ⚠️ **Scena has a SECOND config, `pnpm --filter @scena/e2e wall`**, and the
  split is the same one Kova draws between its gate and its shots suite. `free`
  allows ONE screen, so the two-screens-same-slide spec cannot run on the plan a
  fresh workspace lands on — and the only route to a paid plan without Stripe is
  a platform admin comping it. The GATE must never have that lane, so
  `wall.config.ts` boots the worker with `--var ADMIN_EMAILS:` (an empty
  allow-list turns on the development admin fallback) and never reuses a running
  worker, because one already up is almost certainly the gate's.
  ⚠️ **Scena's suite rebuilds `apps/scena-player/dist` against `play.localhost`**
  (in `globalSetup` — see there for why not in the `webServer` command). CI
  builds and deploys from separate clean checkouts so production is unaffected,
  but a local checkout that has just run the suite holds a player pointed at a
  test port: build again before deploying by hand.
  **Scena has a THIRD config, `pnpm --filter @scena/e2e shots`** — the same
  split again, and for the same two reasons: it needs the operator lane (so the
  images are of the plan being sold rather than of the free tier's one screen
  and locked boards), and it takes minutes. It builds a furnished workspace
  through the real API, pairs two REAL players on the device door, and sweeps
  every surface at desktop/narrow × light/dark into `apps/scena-e2e/shots-out/`.
- `pnpm shots` — the SCREENSHOT suite (`apps/e2e/shots`,
  `shots.config.ts`). Seeds one demo studio through the real API — a comped
  `pro` plan, a ten-person roster, six weeks of a client's history, a published
  plan — and photographs every surface at phone/desktop × light/dark. The images
  are the marketing site, the Help Center and the design review, and they are
  all the same images, which is what keeps them honest (UI-LANGUAGE §16).
  Output: `apps/e2e/shots-out/<project>/<shot-id>.png`, gitignored; the ones
  that ship are copied out by id (`docs/help/README.md`).
  ⚠️ Run it through **turbo** (`pnpm shots`), never `pnpm --filter @kova/e2e
  shots`. The worker serves `apps/app/dist`, and unlike the test suites a stale
  build here does not fail — it produces convincing photographs of the PREVIOUS
  design filed under the current shot ids. `turbo.json` declares the
  `@kova/app#build` edge; the raw filter bypasses it.
  ⚠️ Separate from `pnpm e2e` on purpose: that is the launch gate and runs on
  every push; this takes minutes and is run when images are wanted. It is also
  the ONE suite that sets `ADMIN_EMAILS:` empty, because comping the demo studio
  onto a plan goes through the operator route — the gate must never do that.
  ⚠️ `src/d1.ts` demands EXACTLY ONE Miniflare D1 file, so a stale database from
  an older run fails the seed with a confusing "found: 2". `rm -rf
  apps/api/.wrangler/state` and re-run.

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
- **Two config layers, and the app's own wins.** `getConfig` reads this app's
  `app_config` first and falls back to a SHARED KV (`PLATFORM_CONFIG`) bound with
  the same id into every 4DL worker. There is one Google account, one Stripe
  account, one Cloudflare account and one Turnstile widget behind every product,
  and each app used to hold its own copy — so a rotated key had to be re-pasted
  per app or one app quietly kept the old one. The store is SHARED; no worker
  writes another worker's database. The alternative (a central admin that pushes
  config into each app) is a privileged config-write endpoint in every product,
  authenticated by a machine token, accepting Stripe secret keys — strictly worse
  than the passkey/OTP human session on the doors today.
  - **Non-empty wins, not present wins.** Every consumer already reads `""` as
    unconfigured, so a blank local row falls THROUGH rather than masking the
    shared value. The consequence: you cannot switch a shared key off for one app
    by blanking it — give that app its own value, or do not share the key.
  - **`SHARED_CONFIG_KEYS` is an explicit allow-list**, enforced on read AND
    write. `email.from` (per-app display name), `stripe.*.webhook_secret`
    (per-endpoint), `cf.saas.worker_name` (the script a custom hostname's route
    points at) and `platform.maintenance*` are deliberately excluded; so
    are `schema:*`, `plans.catalog_version` and `stripe.catalog_stash.*`, which
    would corrupt state rather than merely misconfigure it.
  - **`admin.<app>` is not going away.** Every app's console writes the same
    shared store — that is what removes the "configure it N times" problem — but
    maintenance, the plan catalog and custom domains are genuinely per-app. The
    per-app panels stay LOCAL-only on purpose: they save every field they display,
    so showing the merged value would copy a shared key into one app as a
    permanent override on the next save.
  - **Unbound changes nothing.** No binding, no behaviour change — which is what
    every `wrangler dev` and the whole test suite run.
- **The AI model CATALOG is the platform's; the SELECTION is the app's.** The
  rates in `ai_models` are parsed from two public pricing pages and are identical
  everywhere, so a successful sync PUBLISHES them to the shared store
  (`@4dl/ai` shared-catalog.ts) — a new app then seeds its whole priced catalog
  when its AI panel is first opened, instead of living on `DEFAULT_MODELS`'
  twelve hardcoded rows until somebody presses Sync. `enabled`/`is_default`
  stay the app's — which models a product turns on is a product decision — but
  the AI panel's **"Apply to every 4DL app"** switch BROADCASTS a toggle or a
  lane default to the others (`shared-selection.ts`). A broadcast, not a shared
  default: each app applies it once from its console or its daily sweep and then
  owns its row again, so there is no precedence layer under the column the
  credit math reads. `markup` is never broadcast. When both
  pricing pages fail, the sync applies the last published catalog rather than
  applying nothing. `ai.markup` is the DEFAULT bound into new rows, not the
  authority — metering reads the per-row `ai_models.markup` column.
- **Row-level scope**: every coaching route goes through
  `requireClientAccess(c, clientId)` in `clients.ts` — owner/assistant = tenant
  match, trainer = `client_trainers` assignment, client = own record. This is
  the security invariant; never bypass it.
- **The Stripe rail is shared; the BALANCE is not.** `@4dl/billing-rail` sits in
  front of `/api/stripe/webhook`: it verifies once, attributes the event to an
  app, and parks what it cannot attribute in `rail_parked_events` — because the
  old handler answered an unattributable event `200 {received: true}` with its id
  already claimed, so Stripe never retried (money captured, nothing granted).
  Attribution is `metadata.app` → a legacy `<prefix>_*` key → the app's own
  `claims` lookup, and a claim resolves SILENCE, never a contradiction. Kova's
  `claims` is `tenantByCustomer`, which is load-bearing: `invoice.paid` often
  carries no Kova metadata at all. Credits stay in `TenantBillingDO` per app —
  routing crosses workers, a metered reserve→settle must not.
- **The Stripe CONSOLE routes are the platform's, and the two lanes are the
  reason.** `@4dl/billing`'s `stripeAdminRoutes` answers `/admin/stripe/status`,
  `/admin/stripe/config` and `/admin/stripe/sync` in all three apps — the surface
  above them (`@4dl/admin`'s `PlatformStripeSection`) had already moved, and
  leaving the handlers behind produced three copies that drifted. Test and live
  keys are stored SEPARATELY and both at once, so going live is a mode change
  rather than a re-paste; a key whose prefix contradicts its lane is refused at
  the door; and **the mode flip SWAPS the catalog's per-lane Stripe ids**, which
  Tessa's copy did not do — pressing its own console's live switch left every
  plan pointing at the test lane's price and every checkout failed with "No such
  price". A mismatch is REPORTED, never corrected: relabelling what an operator
  typed is how a live key ends up active by accident. `syncCatalog` / `seed` /
  `clearCatalogIds` stay injected, because the catalog TABLE is still the app's
  (Scena's `price_cents` against the shared store's `price_usd_month`).
- **A RESERVE IS A CEILING ON REVENUE, not an estimate.** `settle` caps the
  charge at what was held (`Math.min(held.credits, actual)`), so every token an
  estimate fails to count is a token the platform pays for and the tenant does
  not — silently, on every call. Scena's own copy under-counted four ways at
  once, all measured: the run asked Gemini for **32,768** output tokens on a
  slide while the reserve budgeted **8,000**; the system prompt was a flat
  `+200` pad against 3,207 chars (`SLIDE_SYSTEM`) and 6,875
  (`layoutSystem()`); the char→token ratio was 4 (the English average — Arabic
  runs nearer 2); and nothing widened for a thinking model. `@4dl/ai`'s
  `estimateUsage` is all four fixes and the token lanes delegate to it. **A
  missing usage report falls back to the RESERVE, never to a character count** —
  a guess can only ever under-charge, because the cap catches the other
  direction.
  - ⚠️ **The fix is a SHAPE, not a test.** `planRun` returns the system prompt
    AND the reserve it implies from one call, so a caller cannot hand a different
    text to each. Unit tests on the two halves separately passed a mutation that
    restored the original defect — which is what the defect WAS.
- **Credits**: `TenantBillingDO` (`billing-do.ts`) is the authoritative balance;
  AI goes through `@4dl/ai` `generate()` = reserve → run (Workers AI | Gemini |
  the dev-only mock) → settle; `apps/api/src/ai.ts` binds Kova's feature registry
  and its bucket. Metering math and the DO base class are `@4dl/billing`; Kova's
  `TenantBillingDO` is a subclass and **its class name must never change** —
  `wrangler.jsonc` migrations bind it to durable storage.
- **Access economy**: `commerce-routes.ts` + `@4dl/commerce` (Kova's scopes are
  bound in `@kova/domain` budgets.ts). The buyer is a `subject` there —
  `subject_subscriptions.subject_id` — while Kova's own tables keep `client_id`.
  Both are correct: one is a shared package's vocabulary, the other is Kova's. —
  budgets carry `expiresAt`, days derive at read time, purchases QUEUE not sum,
  status reconciles lazily on read. No domain cron.
  - ⚠️ **A REPEAT PURCHASE FOLDS INTO THE LIVE ROW, so the row's `package_id` is
    only ever the package that OPENED it.** `subject_package_grants` is the
    append-only ledger of what was actually applied, and it is what
    `hasPriorPurchase` reads — without it `once_per_customer` asked "is there a
    row with package_id = X", got `no` forever for every package after the first,
    and the same once-only package stacked without limit. Every path that applies
    a package's budgets MUST call `recordPackageGrant`: the staff grant (new row
    AND extend), both webhook lanes, the manual confirmation.
  - **A redemption code TOPS UP; it never creates access.** `/redeem` is
    client-callable, so a code that leaked used to mint a package-less
    subscription for anyone holding the string. It now requires the client to
    hold a package, refused before the use slot is claimed.
  - **`updateSubscriptionRunway` returns whether the write landed, and a `false`
    is a FAILED GRANT.** Ignoring it answers 200 with an audit row, a
    notification, and zero days added.
  - **The headline day count is a MAX across scopes** (`overallDaysRemaining`).
    Ship `daysByFeature` beside it or a client with a lapsed scope reads as fully
    covered.
  - **Repair is `setRemainingDays`** (pure, `@4dl/commerce`) behind
    `POST /api/subscriptions/:id/days` — owner-only, reason required, audited as
    `access.days_set`. It is the only write in the economy with no price behind
    it.
- **The tenant is paid on their OWN provider — Kova is not in the money path.**
  `payments-routes.ts` + `@4dl/commerce` providers.ts. Stripe Connect was removed
  in full, for three reasons that are not going to change: a Connect platform
  signs up for **losses from seller fraud and negative balances**; it may only
  onboard sellers its own platform country allows (the UAE is absent from
  Stripe's platform-country lists, so a German coach was unreachable); and half
  the world does not use Stripe. Kova now: opens a `purchase_intents` row, sends
  the customer to a URL the studio owns, and learns the outcome from a signed
  notification **or** from the studio confirming by hand. Both settle through the
  same path, so `manual` is not a second-class lane — it is the DEFAULT, it works
  in every country on day one, and every automated provider degrades to it.
  - The abstraction survives because it never CHARGES. Tokenization, 3DS, SCA and
    retries stay the provider's; only `checkoutUrl` + `verify` are ours. A new
    gateway (Tap, Telr, PayTabs, Ziina…) is one file and a registry entry.
  - **A stored credential may VERIFY, never ACT** — `assertSafeConfig` rejects any
    config key naming a secret key / API key / token. Storing one would make this
    database a vault of live merchant credentials, which is a strictly worse
    liability than the Connect exposure this design exists to avoid.
  - The webhook is PUBLIC by construction, so a provider that cannot verify must
    not accept: `manual`, or any tenant with no stored secret, is REFUSED. It
    answered 200 once, which made the endpoint an open door for every studio that
    had not configured anything — i.e. most of them.
  - **Not supported here, deliberately**: instalment plans (nothing can count to
    N and cancel on a link we do not own), cancelling a client's recurring charge
    (the studio does it in their own provider), and tenant-scope promo codes (a
    discount must be applied by whoever owns the checkout page). Kova's OWN
    platform-scope promos on plans and credit packs are unaffected, and so are
    access/redemption codes, which grant days rather than reduce a price.
  - Everything downstream was already decoupled and needed no change: the lapse
    ladder (`lapse.ts` has zero imports), client feature flags, budgets, expiry.
- **Two flag systems** (don't merge): platform entitlements (tenant bought from
  Kova, `entitlements.ts`) vs per-package client flags (client bought from the
  tenant, `clientFlags.ts`). Client capability = the intersection.
  - **The tenant rail has TWO override columns, and they want opposite rules.**
    `subscriptions.overrides_json` is GRANDFATHERING — written by
    `snapshotDowngrade` when a plan is edited down, to hold existing tenants at
    what they were sold — and it must only ratchet UP.
    `subscriptions.adjustments_json` is the OPERATOR's deliberate per-tenant
    setting: absolute, either direction, cleared per key. They shared one blob
    and one grant-only write path, so "give this studio 10 seats" was a one-way
    door: `raiseOverride` merges with `max`, `raiseQuota` makes `-1` absorbing,
    and the only way back was `reset` — which discarded the grandfathering too.
    Resolution order is plan → merge → **adjust** → clamp, in
    `@4dl/billing`'s `tenantEntitlements`; the clamp stays last so a suspended
    tenant cannot be adjusted back into service.
  - **`explainEntitlements` is that walk with its working shown** — per key:
    value, the plan's value, and `plan | grandfathered | adjusted`. The operator
    console renders it and only tags the rows that were MOVED, because a badge on
    every row is texture. Same shape as `explainClientFlags` on the other rail.
  - **Both rails have a wiring guard in `pnpm gate`, and both fail on a real
    break** (mutation-tested): `scripts/flag-enforcement.test.mjs` for what a
    tenant sells a client, `scripts/entitlement-enforcement.test.mjs` for what
    Kova sells a tenant — every live entitlement named by a gate, every quota
    counted against, and the reserved list pinned so it cannot grow to cover an
    oversight. **Both read `apps.json` now**, so the same question is asked of
    every product: the entitlement guard finds each app's registry by the one
    call all of them make (`bindEntitlements<T>(BASELINE)`), and the flag guard
    DETECTS whether an app has a customer rail at all rather than assuming one —
    Tessa and Scena have none, and it re-derives that on every run instead of
    inheriting it as a silence.
  - **A capability a package SELLS must be checked by a route, and hiding a tab
    is not checking it.** The package builder auto-renders a toggle for every
    entry in `SELLABLE_CLIENT_FLAG_KEYS`, so adding a flag is one line and
    forgetting to enforce it is invisible. `/api/progress` shipped that way: no
    gate at all, four lenses in one payload, and the app hiding three of them —
    so a client whose package excluded the strength report still received every
    PR and the whole tonnage series over the wire. `scripts/flag-enforcement.test.mjs`
    (in `pnpm gate`) now fails on any feature that names a `clientFlag` and is
    not named by a `gateFeature`/`featureShaper` call in `apps/api/src`.
  - **A route that answers with several features SHAPES, it does not 403** —
    `featureShaper` in `client-flags.ts`. Refusing `/api/progress` outright would
    take the ungated wellness and consistency lenses down with the sold ones.
    `included: {body, training, nutrition}` reports the shaping so a withheld
    lens is distinguishable from an empty one.
  - **`uiOnly` is the one honest exemption**, and it holds exactly one feature:
    `macroBreakdown` computes from the client's own food entries, so there is
    nothing a route could withhold without breaking logging. Adding a second
    entry means editing `EXPECTED_UI_ONLY` in the guard, on purpose, in review.
  - **Three flag layers, and only ONE of them is a diff.** Defaults → the
    package (live) → `subject_subscriptions.flags_json` → `overrides_json`, then
    the budget gate, then ∩ entitlements. `flags_json` is a SNAPSHOT the grant
    path copies whole from the package, so it masks later package edits for
    anyone already holding the row — that is existing behaviour, not a bug to
    "fix" casually. `overrides_json` is the sparse per-client exception a coach
    sets by hand; `null` on a key means "back to the package", which only works
    because it is a diff. Gates run AFTER both, so an override can never widen a
    lapsed budget or the studio's own Kova plan.
  - **`explainClientFlags` is the resolver with its working shown**, and
    `resolveClientFlags` is a projection of it — one merge, not two, because two
    implementations of "what can this client do" is how a screen comes to promise
    what a route refuses. It powers `GET /api/subscriptions/capabilities`
    (per-flag `value`/`source`/`granted`/`blockedBy`) and the coach's "What they
    can do" sheet. `PATCH /api/subscriptions/:id/overrides` is the write —
    staff-only **in the handler**, because the action gate is invisible to the
    integration suite (AGENTS.md §4) and `requireClientAccess` admits a client
    reading their own row.
  - **Budgets and flags can contradict, and the builder says so** —
    `packageContradictions` (pure, `clientFlags.ts`). Meal days sold with both
    meal-gated flags off buy nothing and still count down; a meal flag on with no
    meal days resolves off anyway. Reported in the package editor, never
    refused — a studio may have a reason, and the coach decides.
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
- **Maintenance is the host gate one level up** (`@4dl/tenancy` maintenance.ts).
  `resolveHostGate` closes ONE tenant's origin over ONE tenant's bill;
  `platform.maintenance` closes EVERY door because an operator said so —
  `readonly` (writes refused, reads served, nobody signed out) or `full` (the app
  withheld, sign-in disabled, every non-operator session ended). Read once per
  request by `maintenanceMiddleware`, reported on `/api/host`, enforced as gate 1b
  in the route guard — **above** the public gate, because "sign-in is disabled" is
  a claim about a public lane. The exemptions are the feature and none of them is
  optional: the `admin.` door, a platform admin anywhere, `/health`, the host
  probe and the Stripe webhooks. Unlike the console gate below it, this one does
  NOT stand down on `isDevRoot` — that would spare every request in dev and in the
  integration suite, so the switch would appear to work and withhold nothing.
- **Kova is B2B, and the catalog says so.** The floor is `solo` (shown as
  **"Starter"** — the id is stamped in Stripe metadata and must never change),
  3 clients at $4.99. It was 1 client, which is not a trainer plan at all; it was
  a self-coaching tier inside a product built out of staff seats, a client
  and client packages. There is **no free tier**: `free` is the PARKING STATE of
  a tenant that never chose a plan, and it used to carry THREE clients against
  Solo's one — so not paying bought you more than the cheapest tier did.
  **The GATE is the only enforcement** — `statusOf` reports `incomplete` for an
  un-comped tenant with no paid plan, once, in the route guard. `free`'s own
  entitlements are deliberately left usable: they are what a deployment with NO
  payment rail serves, and crippling them bricks exactly the configuration where
  the gate correctly stands down (see the next bullet). On a charging deployment
  they are unreachable, because the gate fires first.
- **A studio that never finished signing up is `readOnly`, not blocked.** Gate
  reason `"setup"`, distinct from `suspended` because the copy cannot be shared —
  nothing was taken from them and there is no arrears to settle. The wizard's
  three writes (`/api/auth/*`, `/api/me/*`, `/api/billing/*`) all survive the
  gate, which is what makes the state escapable; `apps/api/test/unconfigured-studio.test.ts`
  asserts both halves, because a gate that is merely closed strands every
  interrupted signup. **It only fires where Stripe is configured**: gating "has
  not paid" on a deployment that cannot take a payment — a self-host, anything
  before DEPLOY.md §10, the whole E2E suite — would strand every studio over our
  misconfiguration. Fail closed on their non-payment, open on ours.
  - ⚠️ **AND THE PARKING ROW'S OWN STATUS MUST NOT DEFEAT THAT.** Tessa's
    `defaultSubscription` is `{ plan_id: "free", status: "incomplete" }` and its
    fail-open branch returned the stored status verbatim — so the moment anything
    materialised the row, the gate read the parking DEFAULT as a verdict and held
    the centre read-only on a deployment with no Stripe at all. The paragraph
    above was written, at length, and did not work. It stayed invisible because
    nothing wrote the row on those deployments; the onboarding wizard does, and
    the E2E suite went red on an ordinary POST with
    `402 tenant_read_only, reason: setup`. `incomplete` is never a fact the
    dunning ladder produces, so the branch now maps it to `null`;
    `apps/tessa/test/onboarding.test.ts` pins it and the assertion is
    mutation-tested. Kova and Scena park on `active` and were never exposed.
- **ONE WIZARD SHAPE, THREE APPS, and creating a tenant lives in exactly one
  place per app.** Kova's `StudioOnboarding` is the grammar — `@4dl/ui`'s
  `StepHeader`/`StepPanel`/`StepActions`, name → plan → start, the tenant created
  *between* steps 2 and 3 so Back is lossless and a Stripe subscription has
  something to attach to. Scena (`apps/scena-app/src/pages/Onboarding.tsx`, 3
  steps) and Tessa (`Doors.tsx`'s `Start`, 2 — it sells one plan, so "choose a
  plan" is a question with one answer) now follow it. The server half is
  `onboarding-routes.ts` in each app, on the guard's `isPersonal` lane
  (`/api/me/onboarding/*`), because every `/api/billing*` path demands a tenancy
  and this caller has none yet.
  - **Selecting a plan never GRANTS it** — `pending_plan_id` and nothing else.
    Only the Stripe webhook may stamp `plan_id`/`status`.
  - **The degrade lane is the feature, not the fallback.** With no Stripe keys
    there is no session to be had, and a mandatory paid step that refused would
    mean *nobody can ever create a tenant* on a self-host or before the deploy
    guide's Stripe step. The tenant is created, the choice is recorded, nothing
    is charged, and the screen says so.
  - ⚠️ **Scena's sign-in screen no longer creates anything.** It carried a third
    lane that collected a workspace name and made the organization, offered on
    EVERY host — so somebody following a colleague's link to their workspace was
    invited, on that workspace's own branded sign-in, to start a second one. It
    also skipped billing, so everything it made landed on the read-only parking
    row. `canCreate` is all that survives, and it now changes only the copy.
- **Two access ladders, and they must not be confused.**
  - **Kova → tenant** (`@4dl/billing` dunning.ts + `@4dl/tenancy` standing.ts): past_due →
    **7d read-only** → **30d blocked** → **37d purged**, all anchored on
    `past_due_at` and driven by `dailySweep`. `resolveHostGate` turns the status
    into a gate that `route-guard.ts` enforces once for every route; `readOnly`
    still serves the whole app, `blocked` makes the Shell replace it with
    `StudioBlocked`. Reads are NEVER gated, at any rung — withholding the product
    is not the same as holding a client's logbook over their coach's invoice.
    Stripe webhooks are exempt (blocking them would make suspension
    unrecoverable), and so are `/api/me/*` and `/api/tenant/close`: **leaving is
    always allowed.** Paying must be a way out, not the only one.
  - **tenant → client** (`@4dl/commerce` lapse.ts; Kova's copy in
    `@kova/domain` lapse.ts): the STUDIO's own rule for a
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
- **A component that fetches owns its loading state, and `[]` is not "not yet".**
  Three surfaces seeded an empty array and rendered it as fact: `PasskeysCard`
  showed a confident "0" badge and "Add a passkey" for the length of the round
  trip, the notification bell said "You're all caught up" while still fetching,
  and the media library's `catch(() => setItems([]))` turned a FAILED load into
  "No media yet". All three are the same bug — a wrong answer wearing a loading
  state's excuse — and all three are fixed by making the state `null` until it
  is known. UI-LANGUAGE §7 has the rule; these were the surfaces that predated it.
- **An upload reports progress, and that is why `uploadMedia` is XHR.** `fetch`
  has no upload-progress event in any shipping browser (a ReadableStream body is
  Chromium-only and needs `duplex: "half"`), so the transport is chosen by what
  the UI has to be able to show. `@4dl/app-kit`'s `useUpload` owns the lifecycle
  — `sending` → `processing` (the gap between the last byte and the server's
  answer, where a determinate bar would otherwise sit at 100% looking stuck) —
  and `@4dl/ui`'s `UploadProgress` renders exactly that shape. A cancel is
  `UploadAbortedError` and is never reported as a failure.
- **One face per person, and the PAYLOAD has to carry it.**
  `apps/app/src/registry/avatars.ts` makes a face impossible to assemble from
  the wrong fields, and a conformance test keeps every `<Avatar>` spreading a
  resolver — but neither can make an endpoint SEND the fields, which is where
  this kept breaking. `apps/api/src/staff-faces.ts` is the one lookup, used by
  all three staff-shaped payloads (`/api/staff` through `@4dl/auth`'s
  `decorateMembers` seam, `/api/members`, and a client's assigned coaches);
  `apps/api/test/staff-faces.test.ts` asserts all three, because fixing one only
  moves which screen disagrees about somebody's face.
- **Preferences are current state; GOALS are the history.** `clients.preferences_json`
  is overwritten, deliberately — "I train at home, four times a week" is a fact
  about now, and `client_goals` already keeps the dated series a coach actually
  wants. What was missing was FRESHNESS, so `preferences_updated_at` records when
  they were last reviewed and the editor says so, with a nudge past six months. It
  is stamped only when `preferences` is in the body (a name change must not make a
  year-old profile look reviewed) and re-stamped even when the values are
  unchanged (reading it and agreeing IS a review).
- **A write that fails says so, where it failed.** Every mutating control on a
  settings surface goes through `@4dl/ui`'s `useAction` (has a Save button) or
  `useConfirmedState` (instant — it rolls back to the pre-apply snapshot). The
  two shapes they replace are shorter than the correct code and both fail
  silently: `try { await api.patch(…) } finally {}` with no catch rejects into
  the app-wide "Something didn't load" toast, and
  `setState(next); await write().catch(() => undefined)` leaves the control
  showing a value the server refused. `apps/app/src/save-lifecycle.conformance.test.ts`
  makes either one a test failure.
- Prettier-ish: no semicolons aren't enforced here — match surrounding style.

## Status

Be conservative here: this section is read as ground truth by future agents, so
an over-claim costs more than an under-claim. Verify before editing it.

**The platform extraction is DONE.** All ten stages landed: the mechanisms,
`@4dl/tenancy`, `@4dl/auth`, `@4dl/billing`, `@4dl/commerce`, `@4dl/ai` +
`@4dl/storage`, `@4dl/email` + `@4dl/notify`, `@4dl/purge`, `@4dl/app-kit`,
`apps/_template`, and Stage 10's four sweeps — the route seam
(`domainRoutes`/`orgSlugGuards` in `@4dl/tenancy`, `turnstileAdminRoutes` in
`@4dl/auth`; `RouteEnv`/`RouteGuards` is what broke the tenancy↔auth cycle), the
frontend runtime (`createSession`, `ThemeProvider`, the notices, `useInbox` in
`@4dl/app-kit`), the Stripe split (`@4dl/billing/webhook.ts` +
`@4dl/commerce/connect.ts`), and the template's custom-domain routes +
integration suite. `@4dl/platform` is gone. Since then: `@4dl/admin` (the
operator console shell) and `@4dl/billing-rail` (one Stripe account, many apps).

**[PLATFORM.md](PLATFORM.md) is the index** — the fourteen packages, the four
mechanisms, the five invariants, and the CONTRIBUTION RULES for moving anything
between an app and a package. Read it before you move code.
**[docs/SHIPPING-AN-APP.md](docs/SHIPPING-AN-APP.md)** is the walkthrough for a
new app. The staged extraction plan, the three pre-release audits and the
billing/notifications/registry design plans are finished work and live in git
history.

**[docs/PLATFORM-AUDIT.md](docs/PLATFORM-AUDIT.md) is the THREE-APP assessment,
and it is open work.** `docs/PLATFORM-GAPS.md` was the two-app one and every
item on it is closed; this is the sequel, and the question changed. That audit
found *a mechanism with no surface*. This one finds the surface shipped, shared
and good — and **an app that does not mount it**, which fails nothing anywhere.
Eight instances, the sharpest being that `otpSendGuard` — the one gate in front of
the emailed sign-in code, carrying the bot check, the per-IP ceiling and the
deliverability pre-flight — was mounted by Kova and by neither other app. Read it
before assuming a shared capability reaches every product, and before adding an
app.

⚠️ **[docs/DOCS-STANDARD.md](docs/DOCS-STANDARD.md) governs every document in
this repository, including this one.** 44 markdown files, 18,105 lines, and six
standing instructions to *"update this in the same commit"* — which is the
failure rather than the fix, in a repo whose guards all exist because wiring that
must be remembered is wiring that will be forgotten. The rules that bite:
**a deferral is a `DEFER(id) stage:N` marker, never a sentence** — a marker is
FOUND by a script rather than remembered, which is the only property that
survives a compressed conversation, and a stage cannot be flipped to `shipped`
while anything still defers to it; an inventory lives in a verified
`<!-- generated: cmd -->` block or not at all; and every document declares a
`kind`. [docs/README.md](docs/README.md) and
[docs/DEFERRED.md](docs/DEFERRED.md) are generated — regenerate with
`node scripts/docs.test.mjs --write`. Enforced by `scripts/docs.test.mjs` in
`pnpm gate`.

**[docs/ONE-PLATFORM.md](docs/ONE-PLATFORM.md) is the PLAN for what replaces all
of this, and nothing in it is built.** A new framework directory that owns the
runtime, the data model, the surface (HTTP + AI tools + webhooks) and the chrome,
driven by a typed manifest per app, with the apps living inside it. Four
decisions are settled there — a declarative shell with code screens, absorbing
`@4dl/*` rather than wrapping it, Kova migrating first, and one 4DL identity with
SSO — and each carries consequences that are cheap now and expensive later. Read
it before starting anything structural, and read §7 before touching Kova's data:
the migration pattern it prescribes is the one audit step 5.2 proved on Scena's
billing tables, and it exists because the naive version is a total outage rather
than a degraded feature.

**That whole class is a guard now.** `scripts/capability-reachable.test.mjs` (in
`pnpm gate`) fails on any app — the template included — that applies a package's
`SchemaModule` and never mounts its route tree. The shape it catches is the one
this document is a catalogue of: tables applied, a Durable Object bound, dispatch
sites writing rows, and no route to reach any of it, with every suite green. It
reads `apps.json`, so app #5 is asked the same question the day it is registered.

Three things are still Kova's on purpose, and each README says why: `Shell.tsx`
(role-adaptive nav is a product decision, extraction plan §3.2), the presentation
halves of `StudioPausedBanner`/`NotificationBell`/`StudioSwitcher`/`FeatureLock`
(a registry read wrapped around a few `@4dl/ui` primitives — injecting the
registry leaves a `Card` with a parameter), and the Stripe **route trees**, whose
handlers are woven through Kova's notification registry, entitlement gates and
`requireClientAccess`. Only the reconciliation logic moved.

⚠️ **The MAINTENANCE screen was on that list and should not have been.** It is
`@4dl/app-kit`'s `MaintenanceScreen` as of 2026-08-08. Its own header comment is
the argument — *"This is about US. Nobody reading it did anything, nobody can pay
to end it"* — so the only variable is the name over the door, and it sat in one
app while `platform.maintenance` closed all of them. The line above still holds
for the standing banners, which name a product's own arrears and say different
things per app; it did not hold for this one, and "presentation stays in the app"
is a rule that has to be re-argued per case rather than applied.

**Tests** — recount with `pnpm test` before quoting a figure anywhere; the suite
moves. **Measured 2026-08-09** from one `pnpm turbo run test --concurrency=1`,
per package:
**632 kova/api (+31 skipped) + 282 scena/api + 237 kova/domain + 163 tessa/api +
145 ui + 107 tenancy + 104 kova/app + 87 tessa/domain + 87 billing + 80 ai +
63 commerce + 61 scena/widgets + 45 billing-rail + 44 core + 40 scena/timeline +
35 auth + 35 scena/app + 24 notify + 23 scena/manifest + 23 tessa/app +
20 template + 19 template/app + 18 scena/protocol + 18 storage + 18 app-kit +
17 kova/protocol +
14 purge + 9 email + 7 i18n + 6 scena/brand + 5 admin** — **2,468 passing,
31 skipped**, 60 turbo tasks, all green.

⚠️ **`--concurrency=1`, and the reason is worth knowing before reading a red
run.** A parallel root `pnpm test` still loses one Workers-pool suite to
Miniflare storage contention now and then — `Isolated storage failed`, or
`Network connection lost` out of an after-hook, never an assertion. `retry: 1`
absorbs most of it; a serial run absorbs the rest. Re-run the failing suite on
its own filter before believing a failure that has no assertion in it.

The +81 since the earlier figure on the same day is all new coverage over
behaviour that was previously in one app or in none: `@4dl/billing` 45 → 87 (the
refund/dispute reversal, the plan-catalog routes and the Stripe console routes,
all three moved out of an app), `@4dl/scena` 234 → 261 (the webhook guards, the
OTP gate, the per-actor budget and the config-write refusal) and `@4dl/tessa`
152 → 163 (the OTP gate and the AI-column regression). A split moves tests; it
does not add any — so where a count went up, something is being checked that
was not.

Scena's 449 (234 api + 30 app + 185 across its five pure packages) were never in
the older figure at all; nor were Tessa's. `@scena/timeline`'s 40 are the ones
that matter most per line — they prove
`position(t) = (t − T0) mod cycleLength`, which is the whole product.
The template's 20 are 11 conformance (declarations only — no database, no
fixtures) + 9 integration (the real worker through Miniflare, on the real
`*.localhost` host topology). Three of the nine are the ones to copy into a new
app: they probe every shared surface for a 404, and assert the OTP guard is
registered BEFORE Better Auth's catch-all — mounting it after is a bypass that
typechecks, passes every other test, and looks identical in a route list.
`@4dl/template-app`'s 19 are the SPA half: the UI-language lints, Tailwind's
`@source` list, the shared admin panels, the accent tokens, and `pickScreen`'s
door/gate decision — which is a pure function precisely so it can be one.
Package counts shift as the extraction proceeds — Stage 1 moved 68 tests from
`@4dl/platform` to `@4dl/tenancy`; the split moves tests, it does not add any.
The pricing and normalizer suites live
in `apps/api/test` and are already *inside* the API count — the older
"protocol/pricing/normalizer" phrasing double-counted them. **E2E is separate**
(`pnpm e2e`, not part of `pnpm test`): 3 Playwright specs for Kova, ~40 s all in,
all green — plus **Tessa's 6 and Scena's 3**, each in its own package on its own port
(**8787 Kova, 8788 Tessa, 8789 Scena + 8790 its player**). Sharing a port makes
whichever suite runs second drive another product's worker, which fails as
"element not found" rather than as a conflict; the same is true of wrangler's
DEFAULT devtools inspector on 9229, so each suite past the first pins its own
(`--inspector-port`, Tessa 9230, Scena 9231/9232).
Scena has **two more configs outside the gate**, both because they need the
development platform-admin lane and the gate must never have it: `wall` (the
two-screens-same-slide spec, 1 spec, ~1 min) and `shots` (4 projects × 21
images, ~20 min). All measured green 2026-08-07.

**Built and tested:** foundation, auth (OTP + passkeys, incl. autofill /
conditional UI), tenancy + row-level scope, the AI suite (credits reserve →
run → settle), commerce (Kova's platform rail + the tenant's own payment rail), content, reports, media,
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
- The Train tab's "browsable library grid" is EMPTY until a studio fills it.
  **Kova ships no exercises at all** — the 40-row starter library and its
  operator button were removed: content a studio did not choose is something to
  delete, not a head start. The consequence to know about is `ai/draft-plan`,
  which whitelists library ids and so refuses with `empty_library` (409) until
  the studio has added some. That is the correct refusal, not a regression.
- "Training Load vs target" doesn't reach the client in production.

**Ops:** the first deploy of any app is **Actions → "Provision an app on
Cloudflare" → its id** (see the app-registry section above). DEPLOY.md is the
long form and still worth reading before touching anything deploy-shaped.

A fresh deploy **cannot send email** until `email.provider`/`email.from` exist in
D1 — the mock provider fails closed outside dev. There IS an operator screen for
it (Platform admin → **Email delivery**, `@4dl/admin`'s panel over
`@4dl/email/admin-routes`), but it cannot break the BOOTSTRAP deadlock and no UI
could: reaching it needs a platform-admin session, which needs an OTP, which
needs email. **Provisioning now seeds those rows** (`ON CONFLICT DO NOTHING`,
sender `noreply@4dl.app`), which is what breaks it — a workflow with database
access can do what a screen behind a login cannot.

**`noreply@4dl.app` is verified and DELIVERING — this is done, do not raise it
again.** The owner of `4dl.app` confirmed it on 2026-08-02 by receiving a Tessa
sign-in OTP at the address, which exercises the whole path end to end: the seeded
`app_config` rows, the Cloudflare Email Sending sender, and DNS on the zone.
Verification is per-zone and was done once for the whole platform, so every app
here inherits a working sender — that is the entire reason the address is shared
rather than per-app. The steps in DEPLOY.md §6 remain correct for a NEW zone;
they are not outstanding work on this one.

The vision suite is still dead until `google.gemini_key` is set
(Platform admin → AI).

See SPEC §13 for the phase map.

## Scena — the third app

**Scena is cloud digital-signage SaaS**, imported from its own repo at `0cff6c6`
and rewired onto the shared packages stage by stage.

**Everything Scena is lives in [SCENA.md](SCENA.md)**: Part I the product (the
clock, the doors, pairing, manifests, plans, roles), Part II how it is built
(layout, the seven DOs, the schema order, derived erasure, the theme, the test
suites), **Part III the screen index** — every surface, per door, mapped to
`file:line`. **Looking for the file that draws a screen? Part III.** Grepping
for a screen's name usually fails: several routes render different files per
persona, and most sub-surfaces live inside their parent's file. **Update it in
the same commit as any screen you add or move.**

Two neighbours: **[docs/SCENA-REWRITE.md](docs/SCENA-REWRITE.md) is the plan** —
what was kept, what was rewired, the six decisions and their rationale, and the
ten stages — and **[docs/SCENA-UI-INVENTORY.md](docs/SCENA-UI-INVENTORY.md)** is
the record of the UI rewrite, one section per sub-stage, each naming the defects
it closed. **[apps/scena/DEPLOY.md](apps/scena/DEPLOY.md)** is how it ships
(Tessa's own is [apps/tessa/DEPLOY.md](apps/tessa/DEPLOY.md)), and
it is genuinely different from the other two apps' — Scena deploys **two workers
and a marketing site**, and `tv.4dl.app` (where the player bundle is served) and
`play.scena.4dl.app` (the device door the bundle calls) are two different things
that both have to exist. Read the relevant one before touching anything under
`apps/scena*` or `packages/scena-*`.

**The idea the whole product rests on is one line**, and nothing in the migration
touches it:

```
position(t) = (t − T0) mod cycleLength
```

The server never says "show slide 3 now". Playout is a pure function of a synced
clock, which is why multi-screen sync, offline playback and live updates are one
mechanism rather than three features. Measured cross-screen skew: 0.3 ms.

```
apps/
  scena/        # THE worker — Hono + six DOs (Screen/Channel/Queue/RoomBoard/
                # Score/TenantBilling); serves the dashboard SPA
  scena-app/    # the operator dashboard (React 19 SPA)
  scena-player/ # the SCREEN. Its own worker and its own origin — see below
  scena-www/    # marketing
packages/
  scena-timeline/  # @scena/timeline — the pure clock engine. ZERO deps, byte-
                   # identical in the compiler, the player and the tests.
  scena-manifest/  # @scena/manifest — Zod schema + canonical JSON + SHA-256
  scena-widgets/   # @scena/widgets — the pure widget core, shared by the
                   # player's DOM renderer and the builder's React preview
  scena-protocol/  # @scena/protocol — screen⇄DO + board WS message types
  scena-brand/     # @scena/brand — mascot + marks (the player uses it)
  scena-ui/        # ⚠️ TEMPORARY. Deleted in Stage 7, replaced by @4dl/ui.
```

**Two things must not be "helpfully" improved:**

- **The player is dependency-free on purpose.** Its `package.json` lists only
  workspace packages. It is a TV render loop plus a Service Worker and needs
  full control of both; a well-meaning `@4dl/app-kit` import for its fetch layer
  would put React-shaped weight on a device with 512 MB of RAM.
- **The timeline engine stays pure** — no I/O, no DOM, no platform APIs.

**The player has its OWN worker and origin, and that is the design.** A screen is
a DEVICE: one pinned URL, Service-Worker-cached, running for months offline. It
resolves NO tenant from its host — the tenant arrives from the pairing claim. A
tenant subdomain would give every studio's screens a different address, so
re-pairing would orphan the cache and custom domains would multiply certificates
by the size of the fleet. Stage 3 added the `device` door to `@4dl/tenancy` for
exactly this (`play.` — opt-in per app, because `play` is a slug a Kova studio
can hold today); the player worker still binds no D1 or R2 of its own.

**Status: Stages 0–9 done, plus the two readaptation sweeps below.** The E2E
gate, the wall spec, the screenshot suite and the docs (`SCENA.md`,
`apps/scena/DEPLOY.md`, this section) all landed.

**The BRAND KIT is `@4dl/ui`'s `Branding` now** (SCENA.md §13a), in
`tenant_settings.branding_json` where `@4dl/tenancy` keeps it — so `/api/host`
carries it to the pre-auth client and there is no flash of shipped violet on a
cold start. The editor is the shared `BrandingEditor`; Scena passes two extras
(name & fonts, logo variants) and nothing else. Two seams to know about, both
silent if broken and both pinned by `apps/scena-app/src/brand-theme.test.ts`:
`@scena/manifest`'s `THEME_TOKENS` must be a SUPERSET of what the shared editor
writes (the server drops the rest without a word), and Scena's own CSS lives in
a SECOND style element because `applyBranding` rewrites its own wholesale on
every preview keystroke.

**And Scena can be LEFT** (SCENA.md §12a). `/api/tenant/close*` and
`/api/me/delete*` did not exist while `route-guard.ts` claimed paying was not
the only way out, so a suspended workspace was in a trap. `closing` is a rung of
its own — the owner's decision, cancellable for seven days, reversed by
cancelling rather than by paying — and it shares the sweep's erasure branch with
`suspended` so the two purge paths cannot drift.
`SCHEMA_MODULES` in
`apps/scena/src/db.ts` is the migration's progress bar — nine entries now
(`AUTH_SCHEMA`, `TENANCY_SCHEMA`, `BILLING_SCHEMA`, `BILLING_RAIL_SCHEMA`,
`STORAGE_SCHEMA`, `NOTIFY_SCHEMA`, `AI_LEGACY_RESET`, `AI_SCHEMA`,
`SCENA_SCHEMA`), and the diff
that removes a table from Scena's module is the same diff that adds its package
there. **Order in that
list IS dependency order**: `NOTIFY_SCHEMA` ALTERs `tenant_settings`, which
`@4dl/tenancy` creates, and a wrong order does not fail — the runner swallows
the ALTER and an owner's email veto silently never persists. `AI_SCHEMA` sits
before `SCENA_SCHEMA` for the mirror-image reason: the app's module used to
declare `ai_models`/`ai_cache`/`ai_generations` itself, and a `CREATE TABLE IF
NOT EXISTS` is won by whichever module runs first.
`apps/scena/test/schema-module.test.ts` fails if any of the three is declared
locally again.

⚠️ **`AI_LEGACY_RESET` is why the catalog migration works on a database that
already exists**, and it is the one destructive module in this repo. A
`CREATE TABLE IF NOT EXISTS` cannot rename a column, so on a pre-migration
database the old `ai_generations(created_at)` survives and `AI_SCHEMA`'s
`CREATE INDEX … (tenant_id, at)` fails with `no such column: at` — which does not
degrade a feature, it throws out of `ensureSchema` and makes **every route that
touches D1 answer 500**. It reproduced exactly that way against the E2E suite's
own `.wrangler` state. The module drops the three tables immediately before the
shared one rebuilds them; `AI_SCHEMA`'s version went 3 → 4 for no DDL reason at
all, purely so it RE-RUNS after the drop (a module already at its declared
version does not run, and the drop without the rebuild is strictly worse than the
bug). **Never bump `AI_LEGACY_RESET`'s version** — that would drop a live catalog
to fix nothing. A future migration needing the same treatment gets a new id.
`schema-module.test.ts` pins the adjacency, in both directions.

**All four workers bind REAL resource ids.** `node scripts/apps.mjs ready <id>`
reports `kova`, `tessa`, `scena` and `scena-player` all provisioned (measured
2026-08-08), so `deploy.yml` ships every one of them. This paragraph used to say
Scena's were still placeholders and that `deploy.yml` skipped it; that stopped
being true when the Provision workflow ran. Settle it with the command, not with
this sentence.

**The UI rewrite is done, and `docs/SCENA-UI-INVENTORY.md` is its record** —
one section per sub-stage, each naming the defects it closed rather than the
files it touched. Roughly twenty swallowed failures went with it, all the same
shape: a `catch` that answers a failure with a confident fact. `catch(() => [])`
on a two-second poll rendered "Create your first live board" over a workspace
with five; `catch(() => setFeed(null))` made a dropped connection
indistinguishable from a deleted record. **The rule that came out of it, and
that every polling screen now follows: a failed poll is only shown while there
is nothing to show.**

Two of those were regressions Stage 7a caused, both silent, and both worth
knowing about because the same trap is still open for anyone touching the
palette: 7a moved the theme from a `.dark` CLASS to a `data-theme` ATTRIBUTE,
which made `className="dark"` inert (the kiosk and the counter tablet stopped
being dark) and — worse — left `brandCss` emitting `:root { …light… }` /
`.dark { …dark… }`, so **a tenant's dark tokens applied nowhere and their light
tokens were injected into the dark theme.** `apps/scena-app` has a test suite
now whose whole job is that neither can come back.

⚠️ **`scripts/player-api-base.test.mjs` (in `pnpm gate`) exists because that
constant ships un-reviewed and has been wrong twice.** It asserts the fallback
is https, is not a local address, starts with `play.` and names `scena` — each
a mistake this repo has made or came one edit from making.

⚠️ **`apps/scena-e2e` builds the player itself, and must keep doing so.** The
player is a separate origin, so `API_BASE` is baked in at build time from
`VITE_API_BASE` — a variable set NOWHERE in this repo, which means the fallback
is what ships. It was `http://localhost:8787`: unreachable from a television,
and in this monorepo it is *Kova's* port. It must be the **device door**
(`play.`) — the pairing, manifest and asset routes answer there and
`{"error":"wrong_door"}` everywhere else, which the player surfaces as
"offline — no cached channel yet", two steps removed from its cause. It is
`https://play.scena.4dl.app` now, and the suite overrides it in `globalSetup` (not in the `webServer` command —
`reuseExistingServer` means that command does not run when a wrangler is already
listening, and the suite then drives yesterday's bundle).

⚠️ **Scena's erasure is DERIVED, and it has to stay that way.**
`apps/scena/src/purge.ts` reads `tenantCascade(SCHEMA_MODULES)`;
`apps/scena/test/purge-cascade.test.ts` fails on a table that carries a scope
column and declares none. The hand-written list it replaced named seven tables
against a declaration of twenty-five, so a deleted workspace kept its media
library, playlists, ads, tracks, manifest history and AI history — while the
sweep reported success and emailed the owner to say otherwise. A purge swallows
every delete error by construction (an old database may legitimately lack a
table), which is why the check is structural rather than behavioural.

⚠️ **The console is on `admin.` and NOWHERE else, as of Stage 7b.** It used to
render at `/admin` inside the studio Shell on any host, while `/api/admin/*` has
answered on the operator door only since Stage 3 — so in production it drew the
whole console and 404'd on every call, exactly as Kova's did before that route
was removed. `apps/scena-app/src/pages/AdminDoor.tsx` is the door;
`pages/Admin.tsx` is now panels only. The sidebar's Admin item is a full page
load to the other origin, because that is the console's only address.

**The inbox is COMPLETE now, bell included** (2026-08-08). `@4dl/notify` was
wired end-to-end for three stages — schema, `InboxDO` (migration `v5`, class
name permanent), the four routes, the registry in `notifications.ts`, and
sixteen dispatch sites — with no SURFACE, so a Scena notification was reachable
at `GET /api/notifications` and nowhere a person would look. This note used to
say the bell "lands with the Stage 7 UI rewrite"; Stage 7 shipped and it did
not, and the sentence then became a reason not to look.

`apps/scena-app/src/Notifications.tsx` is the binding (bell + `/inbox`), and
mounting it found **five dead links**: four types pointed at `/screens`, which
is not a route (the fleet list is `/`), and one at `/sources`, whose route is
`/feeds`. An integration test was asserting `/screens` — it was pinning the bug,
and it passed for as long as nothing rendered a notification.

⚠️ `notifications.conformance.test.ts` in the dashboard is what stops all of
that recurring, and it checks three things a runtime never will: every
dispatched type has an icon and tone (a missing one renders as an anonymous
bell), no coding survives a renamed type, and **every `link` in the registry
matches a real route**. All three are mutation-tested. It reads the worker's
registry as SOURCE rather than importing it — `apps/scena/src` is outside the
SPA's `rootDir`.

**The billing STORE is `@4dl/billing`'s now, and the column reconciliation it
was waiting for is `apps/scena/src/billing-reconcile.ts`.** This paragraph used
to say `BILLING_SCHEMA` was deliberately absent: its `plans`, `subscriptions`,
`credit_packs` and `credit_ledger` shared a NAME with Scena's and differed in
COLUMNS — `price_cents` + `currency` + `interval` against `price_usd_month`,
`sort` against `ord`, `created_at` against `at`, epoch milliseconds against ISO
text — and a `CREATE TABLE IF NOT EXISTS` is won by whichever module runs first
while the loser's columns silently never exist.

- ⚠️ **THE RECONCILER RUNS BEFORE `applySchema`, NOT AS A MODULE INSIDE IT.**
  `BILLING_SCHEMA` indexes `credit_ledger(tenant_id, at)`, and on a
  pre-migration database that column is `created_at` — so the index throws, the
  DDL batch throws, `applySchema` throws, and every route that touches D1
  answers 500. That is `AI_LEGACY_RESET`'s outage one table over.
  `ensureSchema` in `db.ts` is where the order lives.
- It is a FUNCTION rather than a `SchemaModule` because every statement names a
  column that exists on exactly one of the two shapes: as a `backfill` each
  would fail to PARSE on a fresh database, and the runner would print ten
  alarming warnings about columns that are correctly absent on every deploy and
  every test isolate. Reading `pragma_table_info` first makes each step a
  decision instead of an attempt.
- **The timestamps are the half that would have failed in silence.** SQLite
  types are per-value, so a millisecond integer sits happily in a TEXT-declared
  column — and then `sub.past_due_at + graceMs` is string CONCATENATION and
  `past_due_at < ?` compares a number against ISO text. A workspace is either
  never suspended or suspended the moment it goes past due, and nothing throws.
  `apps/scena/test/billing-reconcile.test.ts` asserts the converted value is the
  same BYTES `toISOString` writes, because the comparison is lexicographic.
- What came with it: the version-stamped catalog seed (Scena's `INSERT OR
  IGNORE` did nothing at all on any database that had booted once, so every
  price and entitlement edit since reached fresh deployments and no live one),
  `planAdminRoutes` and `@4dl/billing`'s `syncCatalog` — which pushes a RENAME
  to Stripe and survives one stale id, neither of which Scena's copy did.
  `upsertPlan`, `setPlanStripe`, `setPackStripe` and ~60 lines of sync went with
  their callers.
- `currency` and `interval` are gone rather than migrated: every Scena plan was
  always `usd`/`month`, so they were generality nothing used. The legacy COLUMNS
  are left in place on a migrated database — nothing reads them, and dropping a
  column on a live table to reclaim four bytes a row is a risk taken for tidiness.

**The `ai_models` CATALOG is `@4dl/ai`'s now** (`AI_SCHEMA` is entry eight of nine
in `SCHEMA_MODULES`, right after the legacy reset), and the reconciliation it needed is done:

- **`ai_models.id` IS the provider path** (`@cf/deepgram/aura-1`,
  `gemini-2.5-flash`), with `provider` naming the lane. Scena keyed on a short
  slug with the path in a `cf_model` column, and that one difference is what kept
  it off the shared catalog for three stages. `cf_model` is gone from all eight
  files; `apps/scena/src/ai-catalog-sync.ts` (the bespoke ~200-line syncer) is
  DELETED in favour of `syncModelCatalog`.
- **`ai_cache` and `ai_generations` moved too.** The shared cache gained
  `asset_hash` + `neurons` as alters — a cached generation may be an OBJECT in R2
  with a cost, which is true of any app generating images or audio. The audit row
  lost Scena's `prompt` and `output_ref`: nothing ever read either, so what they
  amounted to was a permanent record of what every workspace typed.
- **`configureAiFloor` is the seam that made it possible.** `@4dl/ai`'s own floor
  is eleven rows chosen for Kova with no Workers AI voice, poster or music model
  in it, so seeding Scena from it would leave three of its four lanes with
  nothing pickable. The app hands over its forty curated rows and keeps the whole
  mechanism — shared-catalog preference, runnability-gated `enabled`, lane
  election, retirement sweep.
- **`lanesFor` is the one to know about.** A catalog carrying both providers holds
  text-to-speech under TWO lane names — `tts` from Cloudflare's page, `speech`
  from Google's — so `WHERE task = 'tts'` silently cannot see any Gemini voice.
  Every selection path goes through it (`ai.ts`'s model match,
  `defaultModelForTask`, `PUT /api/ai/defaults`).
- **The RESERVE ARITHMETIC is the package's too, as of 2026-08-08** — see the
  "a reserve is a ceiling on revenue" note above for the four under-counts it
  fixed. What is NOT the package's, and cannot be: `generateImage` writes a
  tenant-prefixed media key and **Scena's R2 key is the content hash**, so the
  image lane keeps its own writer; and there is no `generateMusic` at all
  (Lyria bills per song, a third metering shape). The wholesale replacement of
  `ai.ts` is therefore blocked, and pretending otherwise would produce a rewrite
  wearing an extraction's clothes.
- Two latent defects went with it: `lyria-3-clip` was an id Google has never
  answered to (every music generation on that row 404'd), and
  `syncGeminiFromGoogle` priced each newly-discovered model by LANE — flash-tier
  rates for a Pro model, i.e. a reserve that under-estimates and a platform that
  eats the difference at settle time.

⚠️ **Scena's R2 key is the CONTENT HASH, and that is not a detail to tidy.** The
compiled manifest references an asset by hash, the player caches
`/api/assets/<hash>` immutably for months offline, and `library_tracks` is a
platform-wide catalog every workspace draws from — so a tenant-prefixed key
would break all three. `@4dl/storage`'s ledger row is qualified instead
(`PutMediaInput.ledgerKey` = `<tenantId>:<hash>`): one row per tenant per
object, one copy in the bucket. The bucket deduplicates; the accounting does
not. `apps/scena/src/storage.ts` is the ONE module that may touch `MEDIA`, and
`scripts/storage-chokepoint.test.mjs` (in `pnpm gate`) fails on a bare
`MEDIA.put` anywhere else — an object written behind the ledger is invisible to
the quota and to erasure, forever, and nothing else would notice.

That same guard asserts the AI MOCK LANE is gated on `ENVIRONMENT`, structurally,
because no Workers-pool test can change the binding it would need to observe.
Scena shipped three paths that fabricated output in production and billed for
it — `ai.mock = "on"` from the console, a missing `AI` binding, and a provider
failure falling back in `"auto"` — and all three typechecked and passed every
test, because the suites run in development where mocking is correct.

⚠️ **The dashboard has ONE door to the API: `apiFetch` in `apps/scena-app/src/api.ts`.**
It was 167 bare `fetch` calls, which is what an app written before the platform
looks like — and the consequence was not style. Kova and Tessa go through
`@4dl/app-kit`'s `api`, which has a hook for an expired session; Scena had none,
so a dead cookie did not LOOK dead: `getMe` is read once at boot, the Shell stayed
mounted, every screen rendered whatever empty state its failed poll produced, and
every save failed into a toast. An expired session was indistinguishable from a
deleted workspace. `apiFetch` is `fetch`-shaped, so adopting it was a rename
rather than 167 hand-edited calls, and `App.tsx` installs the handler.
`scripts/api-door.test.mjs` (in `pnpm gate`) fails on a bare
`fetch` anywhere in the SPA outside two stated exceptions — the definition
itself, and `host.ts`'s public `/api/host` probe, which runs before there is a
session and where a 401 is not an expiry. The 401 exemptions are `/api/auth/*`
(Better Auth self-reports 401 for a wrong OTP) and **`/api/me`, which is the
re-entrancy guard** — the handler re-reads the session, so without it one line in
`route-guard.ts` stands between this and a tab spinning until it is closed.
Moving the rest of the way to the kit's typed `api.get`/`api.post` is mechanical
from here and no longer urgent.
