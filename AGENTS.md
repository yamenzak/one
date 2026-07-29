# AGENTS.md

Instructions for AI coding agents working in this repository. [CLAUDE.md](CLAUDE.md)
is the short orientation; this is the working manual. Read both.

Everything here was derived from auditing the running code, and most of it exists
because something already went wrong in exactly that place. The traps are real
traps, not hypotheticals.

---

## 1. The seven invariants

Break any of these and you ship a security hole, a money bug, or a dead screen.

1. **Row-level scope goes through `requireClientAccess(c, clientId)`**
   (`apps/api/src/clients.ts`). It resolves `isOwnRecord` / `isAssignedCoach` and
   delegates to `canAccessClient` (`packages/domain/src/coaching.ts`):
   owner/assistant = tenant match, trainer = `client_trainers` assignment, client
   = own record. Unknown roles fail closed. **Never restate this rule in SQL at a
   route.**

2. **`WHERE id = ? AND tenant_id = ?` is not sufficient for anything a client
   owns.** If a handler loads a row and reads `row.client_id`, it must call
   `requireClientAccess(c, row.client_id)` *before writing*. Four separate routes
   shipped this bug (`PATCH /supplements/:id`, `/labs/:id`, `/sessions/:id`, and
   the exercise-swap surface); an unassigned trainer could change a prescription,
   write fabricated lab values, or burn a paid consultation. Reference shape:
   `apps/api/src/health-routes.ts` (`PATCH /swaps/:id`).

3. **The route guard is an action-level outer wall only.** `route-guard.ts`
   answers "may this role touch this *kind* of resource"; it never answers "which
   rows". Both layers are always required.

4. **`TenantBillingDO` is the authoritative credit balance** — not D1.
   `credit_ledger` is an append-only mirror written best-effort. Never read it to
   make a spend decision, never write it directly.

5. **Every AI call goes through `ai.ts` `generate()` / `generateImage()` /
   `generateSpeech()`**: reserve → run → settle. Never call `env.AI.run` or a
   provider `fetch` from a route — you would bypass metering, the mock-lane
   production gate, and the `ai_generations` audit row the per-client cap is
   computed from.

6. **Two flag systems, never merged.** Platform entitlements (the tenant bought
   from Kova, `entitlements.ts`) vs per-package client flags (the client bought
   from the tenant, `clientFlags.ts`). A client's capability is the *intersection*.

7. **Access economy: budgets carry `expiresAt`, days derive at read time,
   purchases QUEUE rather than sum, status reconciles lazily on read.** There is
   no domain cron. Don't add day counters.

---

## 2. Layout and route ownership

```
apps/api/     THE worker. Hono router + TenantBillingDO + InboxDO. Also serves
              apps/app/dist via the assets binding (same origin, so cookie auth
              with no CORS).
apps/app/     ONE role-adaptive React 19 PWA for every persona.
apps/www/     Marketing site. ALL content is inline in apps/www/build.mjs.
packages/platform/  @4dl/platform — the SHARED multi-tenant substrate: hosts,
              DCV, credits, promo, standing, ai-mock. Pure, no product words.
packages/domain/    @kova/domain — Kova's pure logic (fitness + its registries:
              entitlements, perms, budgets, notifications). No I/O, no Date.now()
              — time enters as a param. May import @4dl/platform, never the reverse.
packages/protocol/  Zod wire schemas shared api <-> app.
packages/ui/        @4dl/ui — the SHARED design system: tokens, primitives, shell,
              charts. No product words, no router. Kova's registries live in
              apps/app/src/registry/.

Both `@4dl/*` packages carry a README stating the boundary rule and the leaks
left standing on purpose. Read it before adding a name to either.
```

**All ~30 routers mount at `/api`** (`apps/api/src/index.ts`). A router declaring
`.get("/packages")` serves `GET /api/packages`. There is no per-router prefix.

**The app has one real top-level route.** `apps/app/src/main.tsx` renders
`Login` / `Start` / `Shell` from session state; only `/accept-invitation/:id` is
registered pre-session. Every in-app route lives in `apps/app/src/Shell.tsx`.
`ClientArea` / `CoachArea` switch on *surface*, not role.

| File | Owns |
|---|---|
| `context-routes.ts` | `/context` bootstrap bundle, `/context/switch`, notifications, inbox WS. **Also lazily mints memberships.** |
| `clients.ts` | roster CRUD, `requireClientAccess`, `visibleClientIds` |
| `plan-routes.ts`, `plan-variants.ts` | plans + templates (one factory, two kinds), lanes |
| `log-routes.ts` | everything logged + the `/today` bundle |
| `library-routes.ts`, `external-routes.ts` | exercises, foods, provider fan-out |
| `goal-routes.ts` | goal phases + targets (**zod lives here, not in protocol**) |
| `commerce-routes.ts` | packages, subscriptions, budgets, redemption codes |
| `stripe-routes.ts`, `stripe.ts`, `subscription-runway.ts` | both rails, both webhooks |
| `billing-routes.ts`, `billing-store.ts`, `billing-do.ts` | plans, quotas, the credit authority |
| `ai-*.ts`, `client-knowledge.ts` | the AI suite; `ai-features.ts` is the registry |
| `session-routes.ts` | sessions + add-on types (`frontDesk`) — **also exports `promoRoutes`** |
| `health-routes.ts` | supplements + labs |
| `content-routes.ts` | content hub **and** the marketplace endpoints |
| `route-guard.ts`, `auth-context.ts`, `auth.ts`, `access.ts` | the three lanes |

---

## 3. Adding a feature end to end

The dominant failure mode in this repo is **half-wiring**: a route with no UI
caller, or a screen that compiles but is unreachable. There are ~15 live
instances. Do all six steps in one commit.

1. **Domain math** → `packages/domain/src/` + a unit test. Pure, no I/O.
2. **Wire schema** → `packages/protocol/src/`, exported from `index.ts`.
3. **Route** → the owning `*-routes.ts`, in this order:
   ```ts
   .post("/thing", async (c) => {
     const who = requireTenant(c)!;
     const parsed = Schema.safeParse(await c.req.json().catch(() => null));
     if (!parsed.success) return c.json({ error: "invalid body" }, 400);
     const access = await requireClientAccess(c, parsed.data.clientId);
     if ("response" in access) return access.response;
     { const g = await gateFeature(c, "<featureKey>", access.client.id); if (g) return g; }
     // Write with ids from the GUARD, never from the request body:
     //   access.client.id, access.client.tenant_id
   })
   ```
   For `PATCH /x/:id`: load `WHERE id = ? AND tenant_id = ?`, then
   `requireClientAccess(c, row.client_id)`, **then** write.
4. **Add the path to `permissionFor` in `route-guard.ts`.** Omit this and it
   falls through to `return null` = any authenticated member, including clients.
5. **Check the persona can actually satisfy what you demanded.** If a client
   reaches it, verify `ROLE_PRESETS.client` grants that resource — see §4.
6. **UI** → the screen *plus* a route in `Shell.tsx` *plus* a nav entry or
   explicit link for the intended persona. A screen file that compiles is not a
   shipped feature.

**Check for half-wiring before claiming done:**
```sh
rg -n "^\s*\.(get|post|patch|put|delete)\(" apps/api/src/<file>-routes.ts
rg -n "/trainers" apps/app/src        # grep the distinctive SEGMENT — paths are
                                      # built with template strings
rg -n "MyScreen" apps/app/src/Shell.tsx
```
A hit inside a comment is not a caller.

---

## 4. RBAC: the trap that shipped twice

`permissionFor` (`route-guard.ts`) names a resource + action; `ROLE_PRESETS`
(`packages/domain/src/perms.ts`) says which roles hold it; `access.ts` mirrors the
presets for Better Auth and `test/rbac-conformance.test.ts` enforces that they
match. **Change presets and `access.ts` together.**

Two things bit hard:

- **An over-tight gate is as much a launch blocker as a loose one.**
  `PATCH /api/clients/:id` demanded `client:["update"]`, which the `client` preset
  deliberately does not carry — so onboarding's first write 403'd and *no client
  could enter the product*. The preset also lacked `supplement`/`lab`/`package`/
  `session`/`goal` reads, so the Wellness tab and Plans & access were permanent
  skeletons.
- **`intersectGrant` caps custom grants at the role preset.** A non-owner can
  never acquire a resource absent from its preset, so `member`/`billing`/
  `settings` are structurally owner-only. Don't "fix" a 403 by widening a preset
  without checking what else that unlocks.

> **The integration suite cannot see the action gate.**
> `apps/api/vitest.config.ts` sets `ADMIN_EMAILS: ""` + `ENVIRONMENT: "development"`,
> which makes **every signed-in test user a platform admin**, and
> `route-guard.ts` short-circuits the gate for platform admins. So an
> integration test asserting "role X gets 403" passes vacuously or fails against
> a 201. Assert action-gate behaviour in **`test/route-gate.conformance.test.ts`**
> instead — pure, sessionless, no bypass. `requireClientAccess` rejections *are*
> observable in the integration suite, because that runs inside handlers and does
> not consult platform-admin status.

---

## 5. Money

- **Two buckets, one spend order.** `purchased` never expires; `granted` is
  overwritten per `periodKey` and lapses. `debit()` drains `granted` first. Any
  credit handed back must return to the bucket it came from — `topUp()` always
  credits `purchased`, so using it as a refund launders non-rolling credits into
  permanent ones.
- **`settle` is capped at the reservation and is idempotent**, which means an
  under-estimated reserve makes the *platform* eat the overrun. Estimates must be
  true upper bounds (see `IMAGE_TOKEN_EST`). On provider failure `release(hold)`;
  on settle failure swallow and return the output — the hold self-reaps.
- **Pricing math is pure** (`packages/platform/src/credits.ts`). Never hand-compute
  credits at a route. Provider usage numbers are untrusted.
- **Amounts are integer cents** (packages, promos) or float USD (plans, packs).
  Don't mix. Render with `fmtPrice` (`apps/app/src/money.ts`) — never `$${x}`.
  Any rounding on a per-installment amount must distribute the remainder, not
  repeat it N times.
- **Client input may never influence an amount.** Routes accept ids and re-derive
  the price from D1.

### Touching a client's budget — the CAS pattern

Never `SELECT budgets_json` … compute … `UPDATE`. Four uncoordinated writers
share those columns. `apps/api/src/subscription-runway.ts` is the only sanctioned
writer:

```ts
const ok = await updateSubscriptionRunway(db, rowId, (budgets, addOns) => ({
  budgets: [...budgets, ...buildBudgetsForPurchase(budgets, specs, now)],
  addOns:  mergeAddOnBalances(addOns, purchased),
  extra:   { sql: "status = 'active', updated_at = ?", binds: [now] },
}));
if (!ok) throw new Error("runway_cas_failed");
```

- Set every other column in the *same* guarded UPDATE via `extra`. A second
  UPDATE outside the CAS reintroduces the race.
- **Always check the boolean.** In a webhook, throw so `unmarkSeen` + 500 makes
  Stripe redeliver; ignoring it means money captured and zero days granted.
- Any other status write to `client_subscriptions` needs the same guard shape.
  `reconcile()` in `commerce-routes.ts` is the reference; the 15-minute reminder
  sweep in `index.ts` was the counter-example that clobbered renewals.
- **`expired → active` has no automatic path.** Wrongly stamping `expired` locks
  a paying client out until their next invoice. Treat it as destructive.

### Stripe webhooks

- Both endpoints share `firstSeen`/`unmarkSeen` over `stripe_events`: the id is
  claimed *before* handling and any throw releases it. So **every handler must be
  safe to re-run**, and nothing that can throw may run *after* a non-idempotent
  grant. Never `.catch(() => undefined)` a grant.
- On the Connect endpoint, resolve `accountTenantId` from `event.account` and
  assert `metadata.kova_tenant === accountTenantId` in every branch that grants
  value. A connected Standard account is controlled by its tenant; metadata is
  attacker-supplied. Scope every lookup with `AND tenant_id = ?`.
- **Know your event object.** `charge.refunded` → Charge. `charge.dispute.created`
  → **Dispute** (no `customer`, no inherited metadata) — assuming Charge there
  made the whole branch dead code. `checkout.session.completed` → Session, whose
  metadata is *not* copied to the PaymentIntent. Never pass a possibly-`undefined`
  value to `.bind()`.
- **Read subscription ids defensively:** `inv.subscription ??
  inv.parent?.subscription_details?.subscription ?? inv.lines?.data?.[0]?.subscription`.
  The API-version pin in `stripe.ts` covers requests Kova *makes*; webhook
  payload shape follows the endpoint's dashboard config, which nothing in the repo
  sets. Getting this wrong charges the card monthly and tops up nothing, silently,
  returning 200.
- **`charge.refunded` fires for partial refunds too.** Reverse proportionally and
  track cumulative reversal per charge id, or a $5 goodwill refund revokes the
  whole pack.

### Verified against real Stripe (`test/stripe-live.test.ts`)

Every bullet below was **observed**, not reasoned about. Re-run the suite before
changing anything it covers — see DEPLOY.md §10d for how, and §9 below for the
one-liner.

| Assumption | What Stripe really does |
|---|---|
| a `trial_period_days` sub is born card-less | `status: trialing`, `default_payment_method: null`, `pending_setup_intent` set (`requires_payment_method`) — **and `latest_invoice.payment_intent` is `null`**, so the client must confirm a *SetupIntent*, not a PaymentIntent |
| a trial's first invoice | `invoice.paid`, `amount_paid: 0`, `billing_reason: subscription_create`, emitted **not after** `customer.subscription.created` |
| confirming the SetupIntent | Stripe re-fires `customer.subscription.updated` with `default_payment_method: "pm_…"` + `pending_setup_intent: null`, still `trialing`. No new event type to subscribe to |
| a returning customer with a card on file | still gets a `pending_setup_intent` (status `requires_confirmation`) and the *subscription's* own `default_payment_method` stays `null` |
| trial end, no card, `missing_payment_method: cancel` | `customer.subscription.deleted`, status `canceled`, **no invoice, no charge** |
| trial end, carded | `customer.subscription.updated` → `active` plus `invoice.paid` `billing_reason: subscription_cycle` with the real amount |
| `trial_will_end` | fires for the card-less trial too, carrying `default_payment_method: null` — so the copy must branch on it |
| PaymentIntent metadata | **is inherited by the Charge**, which is the only reason `charge.refunded` can compute a proportional credit reversal |
| `charge.refunded` | Charge object; `amount` + a **cumulative** `amount_refunded`; `refunded: false` while partial |
| `charge.dispute.created` | a **Dispute**: no `customer` key at all, `metadata: {}`, carries `charge` / `payment_intent` / `amount` |
| webhook payload version | renders at the **endpoint / account** version, never at our request pin. On a current account `invoice.subscription` is absent and **`subscription.current_period_end` is absent** |
| losing the API pin | `expand=latest_invoice.payment_intent` **silently returns nothing** — no Stripe error — so `/billing/plan-intent` would 502 with nothing to debug |
| `application_fee_amount >= amount` | **accepted, and the charge succeeds.** Stripe does not reject it; the clamp in `/connect/pay-intent` is our rule, and it is the only thing stopping the platform taking the whole charge |
| `charges_enabled: false` | does **not** stop a direct charge in test mode. That gate is ours |

---

## 6. AI

Adding a metered call:

1. Register the feature in `ai-features.ts` (`key`, `defaultSystem`, `tonable`).
2. Route order: `requireTenant` → zod-parse (bound every string with `.max()`) →
   `requireClientAccess` → `gateFeature(c, "<key>", clientId)` →
   `clientBudgetGate(c, who.userId)` **before** spending.
3. Call `generate` from `ai.ts`. `mock` is mandatory and must return output that
   passes your own validation — otherwise dev exercises a path prod never does.
4. Parse with `extractJson<T>()` (never bare `JSON.parse` — real models fence and
   truncate), then validate. Return 422 with a truncated `raw`, never a partial
   object.
5. Map errors with `aiFail` so `insufficient_credits` → 402.
6. **Model output is untrusted input.** Never trust a model-supplied id:
   `draft-plan`/`draft-meal` whitelist ids against those fed in the prompt.
7. **All user-authored text entering a prompt must be fenced** with `untrusted()`
   (`client-knowledge.ts`). This covers check-in notes, `preferences.limitations`,
   `intake`, coach feedback. A client could otherwise steer the coach's supplement
   recommender with instruction-shaped text in their own injury field.

### The model catalog (`ai_models`) and its sync

`POST /api/admin/ai/models/sync` (`syncModelCatalog`, `ai-routes.ts`) reads the
two official pricing pages as markdown and reconciles the catalog **per
provider, independently**:

- **Discovery is real.** Anything priceable on a page is upserted, including ids
  the catalog has never seen. Runnable lanes (`text` / `text-small` / `vision` /
  `image` / `speech`) land `enabled = 1`; the lanes nothing here can execute
  (`embedding` / `transcribe` / `tts` / `classify`) land `enabled = 0` — priced
  and visible to an operator, never offered to a tenant as a model that would
  fail at call time. `modelSupportsTask` (`ai.ts`) is the **whitelist** that
  keeps them out of a generation; do not turn it back into a blacklist.
- **A refresh never re-routes.** The upsert updates label + rates only. `task`,
  `enabled`, `is_default` and `markup` are operator/seed decisions. Overwriting
  `task` used to retag `gemini-2.5-flash` as `text-small` from the page's own
  naming, which pushed every text feature onto `gemini-2.5-pro` (~8× the output
  rate) on the next sync.
- **Reconciliation disables, never deletes.** A model that vanished from its
  provider's page is set `enabled = 0, is_default = 0`; a tenant's
  `ai_config_json` may still name it and `ai_generations` must stay readable.
  It runs **only** for a provider whose fetch *and* parse succeeded — a fetched
  page that parses to zero models is treated as a doc-format change, not as an
  empty provider, or one bad deploy of Cloudflare's docs empties the catalog.
- **What it still cannot discover** is reported back per row in
  `unpriceable[]`, with the reason. Workers AI image models are the big one:
  they are priced on two additive dimensions (per 512×512 tile **and** per step,
  or per-MP tiers) and `ai_models` has exactly one `unit_rate`/`unit_kind`, so
  recording a tile-only figure would undercharge ~3× — and an under-estimate
  makes the platform eat the overrun at settle (§5). Also unpriceable: Gemini's
  tiered per-resolution image models, Live-API/native-audio models, and the
  Imagen/Veo/Lyria families (a different Google API surface entirely).

### The AI self-test

`GET|POST /api/admin/ai/selftest` (platform admin) runs six of the product's own
prompts — plan draft, food parse, check-in summary, exercise auto-fill, food
nutrition, Snap-a-Meal — through the **real metered `generate()`** and grades
each answer with the feature's own parser. Rules if you extend it:

- It **spends real credits** from whichever studio the admin is switched into.
  `GET` returns the plan and its upper-bound cost; never make `POST` cheaper by
  skipping the reserve → run → settle loop, or it stops testing the thing that
  breaks.
- **HTTP 200 is not a pass.** `evaluateSelfTestOutput` names the cause:
  `unparseable_json`, `schema`, `empty`, `provider`, `transport`,
  `not_supported`, `feature_off`, `not_configured`, `insufficient_credits`.
- Pin a model with `GenerateInput.modelId`. It overrides the tenant's config and
  the task default and **never falls back** — an incompatible or disabled id is
  an error, because the operator asked about *that* model.
- Every result carries `mocked`. In development the mock lane answers, and a
  green board that does not say so proves nothing.

**The mock lane may never activate in production.** The `auto` fallback is gated
on `env.ENVIRONMENT === "development"`. **Never add `ENVIRONMENT` to
`wrangler.jsonc`'s top-level `vars`** — that block is the *deployed* config, and
putting it there makes production bill real credits for fabricated output,
including fabricated clinical lab values from `lab-extract`.

---

## 7. Data

**Schema changes** (`apps/api/src/db.ts`, applied lazily per isolate):

1. Add the column to the `CREATE TABLE IF NOT EXISTS` string **and** as an
   `ALTER TABLE … ADD COLUMN` in `alters`. Both, always.
2. **Bump `SCHEMA_VERSION`.** Forget it and every existing deployment skips your
   DDL at the fast path and 500s on the missing column. Most dangerous omission
   in the repo.
3. `CREATE TABLE IF NOT EXISTS` a table *before* any ALTER/index targeting it —
   a fresh D1 runs the array top to bottom. Only `duplicate column` errors are
   swallowed; anything else aborts the run, the backfill and the version stamp.
4. Never write a destructive or non-idempotent migration there. It runs on every
   version bump, from multiple isolates concurrently. The path is forward-only.
5. Add the table to **both** `CLIENT_TABLES` and `TENANT_TABLES` in `purge.ts`.
   Any object carrying a `clientId` must live under `t/<tenant>/c/<clientId>/` or
   `purgeClient` will orphan it.
6. Unique indexes must not span a nullable identity column — SQLite treats NULLs
   as distinct, so `ON CONFLICT` silently stops deduping.

**Concurrency** — reference: `POST /logs/workout-sets` in `log-routes.ts`.
`INSERT OR IGNORE` + re-select rather than catching a unique violation; `IS` not
`=` in the CAS predicate (NULL-safe); bind the exact string you read; cap retries
and return 409. Where a counter suffices, prefer pure SQL (`water_logs` uses
`total_ml + excluded.total_ml` with `RETURNING`). Known RMWs still lacking CAS —
**do not copy them**: `applySwap` (`health-routes.ts`), plan bodies
(`plan-routes.ts`), `ai_config_json`/`branding_json` (`settings-routes.ts`),
`preferences_json` (`clients.ts`).

**Dates.** `date_local` is the client's local calendar day as `YYYY-MM-DD`,
computed device-side. Bucket and range-filter by string comparison. Compare a
stored instant against a local day by slicing to 10 chars (see `pickPlanForDate`).
Validate *and* range-guard any caller-supplied date — the regex alone is not
enough, `2026-13-45` matches it and throws `RangeError` inside
`new Date(NaN).toISOString()`.

**D1 access.** Prepared statements with `?` binds only. `${}` in SQL text is
permitted *only* for fixed table names from a literal map, fixed column lists, or
`ids.map(() => "?").join(",")` placeholder runs. Never interpolate a request value.

---

## 8. Frontend

**Dates — the most-repeated bug class here.** Get today from `todayLocal()` and
shift with the one shared `shiftDay()` (`apps/app/src/api.ts`). **Never build a
`YYYY-MM-DD` via `toISOString()` from a locally-parsed `Date`** — local midnight
is the previous day in UTC, so every result drifts a day east of UTC. Render a
stored `date_local` with `new Date(\`${d}T00:00:00\`)`; a bare
`new Date("2026-08-01")` parses as UTC and displays the previous day across the
Americas. This applies to every date-only column, including `lab_tests.due_by`.

**Units.** Store metric, convert at display via `@kova/domain` `units.ts` and the
`useUnits()` hook. Never post a display-unit number.

**Design system.** Use `@4dl/ui` primitives, never raw palette classes. **Text
or icons on a solid domain tone must be `text-[var(--tone-foreground)]`, never
`text-white`** — tones invert per mode, so white-on-tone is ~1.9:1 in dark. Never
add `[color-scheme:dark]` to an element; `tokens.css` owns it at the root.

**Fetch discipline.** Copy `client/Progress.tsx`, not `client/Today.tsx`:
an `alive` guard or request-sequence ref so a stale/wrong-client response cannot
commit; a `.catch` that sets an error state **and** clears loading; a retry.
`Reveal` renders the skeleton forever while `loading` is true, so a loader
without a catch is a permanent skeleton with no way out but a reload. Use
`Promise.allSettled` for independent fan-outs — one dead endpoint should degrade
one section, not blank the screen.

**Mutation discipline.** Every mutating control needs a `busy` state that
`disabled`s it and a `catch` that surfaces the error. `void handler()` with no
inner catch is an unhandled rejection and a dead button. Validate against the
protocol schema first — `LogWater.amountMl` and `LogSleep.durationMinutes` are
`int().positive()`, so a blank field is a guaranteed silent 400.

**Offline queue.** `apps/app/vite.config.ts` registers a Workbox
`BackgroundSyncPlugin` on POSTs matching a urlPattern. **Adding a log-write
endpoint means adding it to that regex** or it is silently lost offline. The
plugin enqueues *and re-throws*, so treat network-class errors as "queued", not
"failed" — otherwise the user retries and double-logs.

**Accessibility floors** (DESIGN.md §2.2): 48px tap targets, text ≥13px, an
`aria-label` on every icon-only control, `aria-pressed`/`role="radio"` for
selection state, `role="status" aria-live="polite"` for async and toast states. A
clickable `Card` must go through the `onClick` path in `primitives.tsx` or be
wrapped in a real `<button>`. `<MotionConfig reducedMotion="user">` in `main.tsx`
is load-bearing.

---

## 9. Commands, and the gotchas

```sh
pnpm install --frozen-lockfile   # always; a bare install can drift the lockfile
pnpm dev                         # api :8787 + app :5173 (develop against 5173)
pnpm typecheck                   # 9 turbo tasks
pnpm test                        # builds the SPA first, then every suite
pnpm --filter @kova/domain test # pure math, fast — run this constantly
pnpm --filter @kova/api test    # Miniflare integration
pnpm e2e                         # Playwright, 3 golden paths, ~35s. Builds the
                                 # SPA and boots the worker itself; stop any
                                 # `wrangler dev` first (shared .wrangler state)

# The real-Stripe billing suite — opt-in, ~110s, NOT part of `pnpm test`
export STRIPE_TEST_SECRET_KEY=sk_test_…   # test mode ONLY; never commit a key
pnpm --filter @kova/api exec vitest run test/stripe-live.test.ts
cd apps/api && npx wrangler deploy --dry-run --outdir /tmp/x   # validates bindings
```

- **Turbo caches aggressively.** `FULL TURBO` in 20 ms taught you nothing about
  your change. Use `--force` when you need real evidence.
- **The API suite needs `apps/app/dist` to exist.** Without it Miniflare aborts
  and reports **"no tests"** rather than failing — a silent green. `pnpm test`
  handles the ordering; a direct `--filter @kova/api test` does not.
- **Stop `wrangler dev` before running tests** — they share `.wrangler` state.
- **`test/stripe-live.test.ts` skips unless `STRIPE_TEST_SECRET_KEY` is exported.**
  Putting it in `apps/api/.dev.vars` is deliberately not enough: `vitest.config.ts`
  threads the binding from the shell and defaults it to `""`, so a keyless or
  offline `pnpm test` stays green. A non-`sk_test_` key **fails** rather than
  skips. It is the one place assumptions about Stripe's behaviour get proven —
  §5's table and DEPLOY.md §10d.
- **The Workers pool runs with `isolatedStorage`, so D1/DO writes are rolled back
  after every `it`.** A test that needs a previous test's rows must redo them
  itself; suite fixtures go in `beforeAll`. This is silent — it looks like a
  handler bug.
- Don't append `--force` to `pnpm --filter @kova/app build`; pnpm forwards it to
  vite, which dies with `CACError`.
- **There is no linter.** `turbo.json` declares a `lint` task no package
  implements. Match surrounding style by hand.

**Local dev needs no Cloudflare account, but it needs one file.** Copy
`apps/api/.dev.vars.example` → `apps/api/.dev.vars` first. D1/KV/R2 are
Miniflare-simulated and the mailer logs sign-in OTPs to the `wrangler dev`
console; without `ENVIRONMENT=development` every AI call returns "AI provider not
configured" — that is missing config, not a bug.

**Runtime configuration lives in three places.** Wrangler `vars`/bindings
(deployed config); exactly one wrangler secret (`BETTER_AUTH_SECRET`); and the
`app_config` D1 table for everything admin-editable at runtime — `email.*`,
`stripe.*`, `google.gemini_key`, `ai.mock`, `ai.markup`, `turnstile.*`,
`cf.saas.*`. Prefer `app_config` + an admin route **and a UI**. The
anti-pattern to avoid is live in the repo: `/api/admin/email` has a route, a test,
and no UI, which is why a fresh deploy could not be bootstrapped at all.

---

## 10. What "done" means

All four, actually executed, not assumed:

1. `pnpm typecheck` clean.
2. `pnpm test` green, with counts you looked at.
3. Pure logic has a domain unit test; a new API flow has a Miniflare integration
   test; a security boundary change has a test that proves the **negative** case.
4. If you touched `wrangler.jsonc` or `env.ts`, `wrangler deploy --dry-run`
   resolves every binding.

**If a fix depends on a third-party library's behaviour, prove it by running it.**
The repo has an expensive example. Round 2 fixed silent OTP-send failure by
throwing from Better Auth's `sendVerificationOTP` callback, committed it
unverified, and shipped a no-op: Better Auth invokes that callback through
`runInBackgroundOrAwait`, whose body is `try { await promise } catch { logger.error }`.
The endpoint still answered `200 {"success":true}`, so on a fresh production
deploy nobody could sign in and the UI said the code was sent. Reading the call
site was not enough; a four-line probe would have caught it.

Corollary: **a green suite is not evidence a security fix works.** Check what
your test would do if you reverted the fix. If it still passes, it proves nothing.
