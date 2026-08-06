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
  _template/ # a NEW 4DL app: every shared package wired, no product vocabulary.
             # Typechecks + tests in this workspace so it cannot rot. Copy it.
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
             # the Stripe client, and the dunning ladder. See its README.
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
             # shared package owns (email delivery, maintenance). The SECTIONS
             # are the app's.
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

## Commands

- `pnpm dev` — turbo: api (`wrangler dev` on :8787) + app (vite on :5173, proxies /api)
- `pnpm typecheck` / `pnpm test` — across the workspace
- `pnpm --filter @kova/api test` — the Miniflare integration suite. **Build the
  SPA first** (`pnpm --filter @kova/app build`) — the worker's `assets` dir is
  `apps/app/dist`, and Miniflare aborts (reporting "no tests") without it. The
  same holds for `@4dl/tessa` and `@tessa/app`.
  ⚠️ An `assets.directory` is a filesystem path, not a package dependency, so
  nothing in the graph connects a worker's tests to its app's build — forgetting
  Tessa's is what turned the merge that added `apps/tessa-app` red. `turbo.json`
  now declares BOTH edges by hand (`@kova/api#test`, `@4dl/tessa#test`), so
  anything going through turbo — the root `pnpm test`, `pnpm turbo run test`, both
  CI workflows — builds the SPA first and CACHES it. `pnpm --filter <pkg> test`
  bypasses turbo and still does not.
  ⚠️ Under a *parallel* root `pnpm test` this suite can fail with
  `Isolated storage failed` — or `Network connection lost` thrown from
  `updateStackedStorage` / `onAfterTryTask`, which is the same fault with a
  different message: Miniflare storage contention with the sibling tasks, not a
  real failure. All three Workers-pool configs (`apps/api`, `apps/tessa`,
  `apps/_template`) now set `retry: 1`, which absorbs it — ONE retry, so a
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
    oversight.
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

Three things are still Kova's on purpose, and each README says why: `Shell.tsx`
(role-adaptive nav is a product decision, extraction plan §3.2), the presentation
halves of `StudioPausedBanner`/`NotificationBell`/`StudioSwitcher`/`FeatureLock`
(a registry read wrapped around a few `@4dl/ui` primitives — injecting the
registry leaves a `Card` with a parameter), and the Stripe **route trees**, whose
handlers are woven through Kova's notification registry, entitlement gates and
`requireClientAccess`. Only the reconciliation logic moved.

**Tests** — recount with `pnpm test` before quoting a figure anywhere; the suite
moves. Measured 2026-08-02, per package: **548 kova/api + 197 kova/domain +
146 tessa/api + 87 tessa/domain + 85 tenancy + 70 kova/app + 54 commerce +
48 ai + 47 ui + 45 billing + 35 billing-rail + 24 notify + 17 template +
14 core + 14 purge + 13 tessa/app + 12 auth + 7 protocol + 7 i18n + 3 admin +
3 app-kit + 21 storage + 3 email** (1,497 total, 31 skipped). The older figure
quoted here counted Kova and the packages only — Tessa's 240 were never in it.
The ui count DROPPED and the kova/app count rose by the same shape: Stage 0b
moved Kova's eleven accent tones — and the contrast tests that guard them — out
of `@4dl/ui` and into the app. The template's 17 are 11 conformance (plain Node,
no fixtures) + 6 integration (the real worker through Miniflare, on the real
`*.localhost` host topology).
Package counts shift as the extraction proceeds — Stage 1 moved 68 tests from
`@4dl/platform` to `@4dl/tenancy`; the split moves tests, it does not add any.
The pricing and normalizer suites live
in `apps/api/test` and are already *inside* the API count — the older
"protocol/pricing/normalizer" phrasing double-counted them. **E2E is separate**
(`pnpm e2e`, not part of `pnpm test`): 3 Playwright specs, ~40 s all in, all green.

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
