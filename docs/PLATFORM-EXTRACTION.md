# The 4DL platform extraction

**Goal.** Turn this repository from "Kova, which happens to have two shared
packages" into "the 4DL platform, on which Kova is the first app". Three more
apps are queued — a medical inventory system (urgent), Scena (display
management), Bocca (AI-assisted document management) — and none of them should
re-derive tenancy, auth, billing, permissions, storage or notifications.

**The rule that decides everything below:** a `@4dl/*` package may not know what
the app sells. It may know that *something* is sold, that *someone* is a tenant,
that *some* capability is gated. The nouns — client, workout, meal, SKU, lot
number, document — stay in the app.

---

## 1. Audit

### 1.1 What exists today

| Area | Lines | Where |
|---|---|---|
| API worker | 22,656 | `apps/api/src` (68 files) |
| Pure packages | 7,110 | `domain` 3,3xx · `ui` 1,3xx · `platform` 6xx · `protocol` 6xx |
| App (top level, excl. screens) | 5,505 | `apps/app/src` |
| Schema | 66 tables · 40 indexes · 52 ALTERs | one block in `apps/api/src/db.ts` |
| Tests | 875 (473 API · 212 domain · 98 platform · 61 ui · 52 app · 7 protocol) + 3 E2E | |

Two shared packages already exist and work: `@4dl/ui` and `@4dl/platform`. They
prove the pattern. They are also, on inspection, not as clean as claimed — see
§1.4.

### 1.2 What is infrastructure, hiding in the app

Read file by file, the API splits roughly in half. These modules contain no
coaching vocabulary in their logic — only in their comments and a few strings:

| Module | Lines | Verdict |
|---|---|---|
| `ai.ts` | 1215 | Model registry, Workers AI + Gemini providers, reserve→run→settle, mock lane, image, TTS, per-actor daily budget. **Fully generic.** |
| `stripe-routes.ts` | 1524 | Platform rail (we bill tenants) + Connect rail (tenants bill customers). Generic; the plan names are data. |
| `stripe.ts` | 402 | Lane config, webhook verification, catalog sync. **Fully generic.** |
| `billing-store.ts` | 488 | Plans, quotas, `withinQuota`, `hasFeature`, ledger. Generic engine + Kova's `DEFAULT_PLANS`. |
| `billing-do.ts` | 317 | Two-bucket credit DO. **Fully generic** (its own header says "transplanted from Scena"). |
| `host-context.ts` | 447 | Hostname → tenant, host cache, gate attach. **Fully generic.** |
| `auth.ts` | 432 | Better Auth factory, org=tenant, OTP+passkey, seat hooks. Generic engine + Kova's roles/brand/quota name. |
| `purge.ts` | 415 | GDPR cascade. Generic engine + a hand-maintained table list. |
| `digest.ts` | 410 | Scheduled email digest. Generic scheduler + Kova's content. |
| `billing-routes.ts` | 410 | Owner billing surface + admin tenant lane. Generic. |
| `mailer.ts` | 465 | Send + an HTML email component kit (bars, rings, sparklines, stat rows). **Generic**, one `KOVA_BRAND` constant aside. |
| `domain-routes.ts` | 358 | Custom-domain binding + DCV. **Fully generic.** |
| `route-guard.ts` | 348 | Five-gate boundary. Engine generic; `permissionFor()` is Kova's route table. |
| `downgrade-routes.ts` | 343 | Downgrade compliance checklist. Generic. |
| `commerce-routes.ts` | 459 | Packages, budgets, redemption. Generic "sell timed access to capabilities". |
| `session-routes.ts` | 281 | Add-on balance consumption. Generic. |
| `ai-pricing.ts` | 263 | Provider catalog/pricing parsers. **Fully generic.** |
| `otp-guard.ts` `org-guard.ts` `action-otp.ts` `turnstile.ts` `access.ts` | 595 | Guards, step-up OTP, bot check, RBAC statement. Generic. |
| `cloudflare.ts` | 208 | Cloudflare for SaaS API client. **Fully generic.** |
| `notify.ts` `inbox-do.ts` | 290 | Fan-out + WebSocket push DO. Generic engine + Kova's notif registry. |
| `storage.ts` `media-routes.ts` `media-library-routes.ts` | 407 | R2 + quota ledger + serving. **Fully generic.** |
| `db.ts` | 480 | ~27 of 66 tables are platform tables (auth, org, plans, subs, credits, AI, media, notifications, settings, domains, audit). |
| `email-provider.ts` `integrations.ts` `audit.ts` `ids.ts` `env.ts` | 295 | Generic. |

**≈ 10,000–11,000 of 22,656 API lines (45%) are infrastructure a second app
would otherwise rewrite.**

Plus, in `@kova/domain`, ~1,900 lines that are *registry-shaped* — a generic
engine welded to a Kova registry: `entitlements.ts` (321), `notifications.ts`
(430), `clientFlags.ts` (274), `features.ts` (254), `budgets.ts` (206), `perms.ts`
(135), `lapse.ts` (145), `audit.ts` (76), `settings.ts` (63). Each splits into
*engine → `@4dl/*`* and *registry → the app*.

Plus, in `apps/app/src`, ~1,750 lines of frontend runtime that is not Kova's:
`api.ts` (190), `session.tsx` (358), `StudioSwitcher` (202), `notices.tsx` (219),
`PaymentSheet` (143), `NotificationBell` (132), `theme.tsx` (106), `passkey.ts`
(104), `FeatureLock` (69), `stripe.ts` (66), `hard-refresh.ts` (66), `Turnstile`
(61), `ErrorBoundary` (52).

### 1.3 What must stay Kova's

`log-routes` (1767), `clients` (918), `client-knowledge` (670), `health-routes`
(653), `plan-routes`, `library-routes`, `external-routes`, `report-routes`,
`body-scan-routes`, `content-routes`, `progress-routes`, `attention-routes`,
`goal-routes`, `plan-variants`, `exercise-seed`, the 21 product AI endpoints in
`ai-routes.ts`, and all of `@kova/domain`'s actual math (nutrition, body-fat,
workout, progress, wellness). Roughly 12,000 lines. That is the app, and it
should stay that size — the win is that the *next* app starts at 12,000 lines of
its own domain instead of 22,000 including infrastructure.

### 1.4 The existing shared packages are not actually clean

Found by grepping `packages/{ui,platform}/src` for product nouns:

**`@4dl/platform`** *(fixed in Stage 1, on the way into `@4dl/tenancy`)*
- `StudioStanding`, `studioStandingOf`, `studioStandingOfGate`, and the
  `StandingFacts.studio` field. "Studio" is Kova's word for a tenant. A warehouse
  is not a studio.
- `StandingFacts` and `Standing` model a *client's* position in a tenancy —
  membership, access, purchase. That is genuinely generic ("a subject's standing
  in a tenancy") but is named and documented for coaching.
- `RESERVED_LABELS` hard-codes `"kova"` and repeats it twice.
- User-facing copy: `"Pick an address for your studio."`
- `promo.ts` `restrictedClientId`.

**`@4dl/ui`** *(still open — Stage 0b)*
- `Tone` carries `activity | nutrition | sleep | cardio | hydration | supplement
  | lab` — documented in the README as "the one known leak", still a leak. An
  inventory app has no `nutrition` tone.
- `icons.tsx` exports a `Domain` type with the same fitness members.
- `theme.ts`: `localStorage["kova-theme"]`, `<style id="kova-branding">`, copy
  reading "The Kova default", and `aiCoachAvatar` / `aiCoachName` fields.

None of these break Kova. All of them would be inherited verbatim by the
inventory app. **Fixing them is Stage 0**, not a footnote.

### 1.5 The five things that actually decide whether this works

1. **Schema ownership.** One `SCHEMA_VERSION` marker short-circuits 66 tables, 40
   indexes and 52 ALTERs. If a package owns tables, the marker must become
   per-module — and a botched split silently bricks every existing database
   (that exact failure mode already bit us once, with `steps_logs`).
2. **`Env` coupling.** Almost every infra module imports `./env.js`, a concrete
   interface naming Kova's bindings. A shared package cannot import that; it must
   declare the *slice* of bindings it needs, structurally.
3. **Durable Objects.** Wrangler requires the DO class exported from the worker's
   entry module, and `migrations` are per-app. A shared DO has to be a base class
   the app subclasses and re-exports — and the exported class name must not
   change for Kova, or existing DO storage is orphaned.
4. **Nothing may depend on billing.** The inventory app is internal; it may never
   take a payment. If `@4dl/auth`'s route guard hard-depends on a subscription
   status, every app inherits Stripe. The standing gate must be *injected*.
5. **Direction of dependency.** Today `@kova/domain` → `@4dl/platform`. The arrow
   must never reverse, and no `@4dl/*` may import any `@kova/*`. Enforced by test,
   not by intent.

---

## 2. Target shape

```
packages/
  core/      @4dl/core      ids · JSON/D1 helpers · the SCHEMA MODULE RUNNER ·
                            the bindings contract · audit trail · result types
  tenancy/   @4dl/tenancy   host classification (5 doors) · tenant resolution +
                            cache · custom domains (Cloudflare for SaaS + DCV) ·
                            tenant settings · the standing/gate MODEL
  auth/      @4dl/auth      Better Auth factory (OTP + passkey, org = tenant) ·
                            session/auth context · the route-guard ENGINE ·
                            RBAC (grants, presets, intersection) · step-up OTP ·
                            bot check · seat accounting
  billing/   @4dl/billing   plan/entitlement engine · quotas · subscriptions ·
                            Stripe platform rail + Connect rail · the credit DO ·
                            metering · the dunning ladder
  commerce/  @4dl/commerce  sellable packages · timed access budgets · redemption
                            + promo codes · add-on balances · the lapse ladder
  ai/        @4dl/ai        model registry · Workers AI + Gemini · generate /
                            image / TTS · credit reserve→settle · mock lane ·
                            pricing parsers · the admin AI console routes
  email/     @4dl/email     platform + per-tenant providers · the HTML email
                            component kit · digest scheduling
  notify/    @4dl/notify    inbox DO (WebSocket push) · preference resolution ·
                            fan-out
  storage/   @4dl/storage   R2 put/delete/prefix-purge · quota ledger · serving
  purge/     @4dl/purge     GDPR cascade, DERIVED from the schema modules
  ui/        @4dl/ui        (exists) tokens + product-agnostic primitives
  app-kit/   @4dl/app-kit   typed fetch · session provider · host bootstrap ·
                            passkey · tenant switcher · notification bell ·
                            payment sheet · offline replay · theme
  <app>/     @kova/domain, @kova/protocol — and the equivalents per app
```

`@4dl/platform` **dissolves**: hosts + dcv + standing → `tenancy`, credits →
`billing`, promo → `commerce`, ai-mock → `ai`. It was the right first cut; it is
not the right final shape.

### 2.1 How a package stays generic: three mechanisms

**Registries are injected, never owned.** The pattern `@4dl/platform` already
proves. `@4dl/billing` knows an entitlement set is `{ quotas, features,
aiCredits }`; Kova's `FREE_ENTITLEMENTS` and the inventory app's stay in their
apps. Typed via generics so `ent.features.aiSuite` still autocompletes.

**Bindings are structural, not nominal.** Instead of `import type { Env }`:

```ts
// @4dl/core
export interface HasDb { DB: D1Database }
export interface HasKv { CACHE: KVNamespace }
export interface HasR2 { MEDIA: R2Bucket }
// @4dl/ai
export type AiBindings = HasDb & HasKv & { AI?: Ai; BILLING: DurableObjectNamespace }
```

Kova's `Env` satisfies all of them by structure. A package can never reach a
binding it did not declare.

**Schema is composed from modules.** Each package exports:

```ts
export interface SchemaModule {
  id: string                    // "auth", "billing", "kova"
  version: string               // bumped when its DDL changes
  tables: string[]              // CREATE TABLE IF NOT EXISTS …
  indexes: string[]
  alters: string[]              // idempotent, failure-tolerated
  /** For @4dl/purge: which columns scope a row to a tenant / a subject. */
  scoped?: { tenantColumn?: string; subjectColumn?: string; tables: string[] }
}
```

`applySchema(db, [authSchema, tenancySchema, billingSchema, …, kovaSchema])`
keeps a per-module marker row, so bumping billing's DDL does not re-run all 66
tables — and `@4dl/purge` derives its cascade from `scoped`, which kills the
hand-maintained `TENANT_TABLES`/`CLIENT_TABLES` lists that must currently be kept
in step with `db.ts` by hand.

### 2.2 How routes compose

Each package exports route factories, not mounted routers:

```ts
export function billingRoutes<E extends BillingBindings>(cfg: BillingConfig): Hono<{ Bindings: E }>
```

and the app assembles them. The route guard inverts the same way — the engine is
shared, the *tables* are the app's:

```ts
routeGuard({
  publicRoutes, permissionFor, allowedOnRoot, allowedWhileReadOnly,
  gate: (c) => c.get("host").gate ?? null,   // ← injected; an app with no
})                                            //   billing passes () => null
```

That last line is how the inventory app gets the whole boundary without Stripe.

---

## 3. Sequence

Every stage ends at the same gate: `pnpm typecheck` · `pnpm test` · `pnpm
--filter @kova/app build` · `pnpm e2e` all green, plus the boundary conformance
test. **Kova is the proof harness** — 875 tests and 3 golden paths are what make
these moves safe, so Kova gets rewired onto each package as it lands, rather than
the new app being written against untested extractions.

| Stage | What moves | Why here |
|---|---|---|
| **0** ✅ | `@4dl/core` (ids, helpers, bindings contract, **schema-module runner**, `app_config`) · boundary conformance test in every `@4dl/*` package | Nothing can move until schema can be composed and the boundary is machine-checked. The runner shipped with Kova's DDL as a single module, byte-identical to today. |
| **1** ✅ | `@4dl/tenancy` — `hosts`, `dcv`, `standing`, `host-context`, `cloudflare`; the studio→tenant rename; `tenant_domains` + `tenant_settings` as the first non-app schema module | Everything else takes a tenant id. This is the root of the graph. |
| **2** ✅ | `@4dl/auth` — the auth factory, the request identity, the five-gate guard engine, the grant algebra, seats, step-up codes, Turnstile; Better Auth's 8 tables + `auth_logs` + `action_otps` as a schema module | Depends only on tenancy + core, and — critically — **not on billing**: the standing gate is injected, so an app that never takes a payment still gets the whole boundary. Unlocks a second app doing *nothing* but auth. |
| **3** ✅ | `@4dl/billing` — the entitlement engine, credit metering, the credit DO as a base class, the Stripe client, the dunning ladder, and 5 tables. **The route modules did not move**: `stripe-routes` mixes the platform rail (ours) with the Connect rail (commerce's), and splitting a 1,500-line file before its other half has a home is how a package ends up owning half a flow. They go in Stage 4. | The biggest single win and the highest risk (money + a DO with live storage). |
| **4** ✅ | `@4dl/commerce` — budget math, the customer-lapse ladder, discount codes, 6 tables. The scope list and the lapse COPY are the app's. `client` → `subject` throughout: types, the `wrong_client` wire code (which landed in two screens), and — in a follow-up, once a fresh deploy was confirmed — the SQL columns and the `client_subscriptions` table itself. | Sits beside billing, not on it: an app can take billing without commerce, and vice-versa. |
| **5** ✅ | `@4dl/ai` (runner, providers, pricing, mock lane) **and `@4dl/storage`**, pulled forward because the image path writes to R2. `@4dl/platform` deleted. Kova keeps its 21 prompts. | Barcode/OCR/document extraction is exactly what the inventory and Bocca apps need. |
| **6** ✅ | `@4dl/email` (mailer, MIME, the HTML component kit, the per-tenant lane, `email_templates`) and `@4dl/notify` (`InboxDO`, `notifications` + `user_prefs` + `digest_sent`). `@4dl/storage` was already taken in Stage 5. The credit charge per platform-lane send became an injected `EmailMeter` — a **parameter**, not module state, because it needs per-request bindings and a lazily-armed global would make "did anyone arm it?" the difference between a metered send and a free one. First stage where a PACKAGE alters another package's table (`tenant_settings`). | Independent of each other; the only ordering constraint is that both follow tenancy. |
| **7** | `@4dl/purge` derived from schema modules | Needs every module's `scoped` declaration, so it goes last of the API packages. |
| **8** | `@4dl/app-kit` — the frontend runtime | Independent of 1–7; could be pulled forward if the inventory app needs a UI before a backend. |
| **9** | `apps/_template` + per-package `README.md` + a `PLATFORM.md` index; then stand up the inventory app on it | The template is what stops app #3 from respawning logic. |

**Critical path for the inventory app:** 0 → 1 → 2 → 8, plus 6 (storage for
photos/labels) and 5 if it needs barcode/OCR. Billing and commerce can trail if
the app is internal.

### 3.0 Two route modules that could not move yet

`domain-routes.ts` (custom-domain binding) and `org-guard.ts` (slug validation)
belong to tenancy by subject, but both need the request identity — and
`@4dl/auth` depends on `@4dl/tenancy`, so putting them in tenancy is a cycle.

They stay in `apps/api` until a route factory generic over the Hono environment
lets tenancy declare only the context variables it reads (`host`, `user`,
`tenantId`) structurally, without importing auth. That is a small piece of type
work, scheduled with the template app in Stage 9 where the same pattern is needed
for every other package's routes. Recorded here rather than left as a surprise.

### 3.1 Honest sizing

This is roughly a 12,000-line reorganization across 10 new packages, and it will
take several working sessions. Stage 0 is the one that must be done carefully;
stages 6 and 8 are mostly mechanical. Nothing here adds a feature — the whole
value is that app #2, #3 and #4 do not rewrite it, and that the parts Kova has
already proven in production stay proven.

### 3.2 What I recommend *not* extracting

- **`@kova/protocol`** — wire schemas are per-app by definition. Each app gets its
  own; only the envelope conventions are shared, and those are two types.
- **`Shell.tsx`** and navigation — role-adaptive nav is a product decision.
- **The digest's content**, the AI prompts, the notification copy — registries.
- **A shared database.** Every app gets its own D1. Shared *schema modules*, not
  shared data.

### 3.3 Open decisions

- **One monorepo or four repos?** The plan works either way, so it is not a
  blocker: packages are being built *publishable-shaped* (self-contained, clean
  exports, no cross-imports, own tests) and consumed via `workspace:*` today. If
  the apps later split into separate repos, the packages publish to a private
  registry with no restructuring. Deferring this costs nothing; deciding it wrong
  early costs a lot.
- **Root domain per app.** Kova assumes `<slug>.kova.4dl.app`. `@4dl/tenancy`
  already parameterizes the root, so `<slug>.inventory.4dl.app` needs config, not
  code. Confirm each app gets its own subtree before Stage 1 lands the rename.
