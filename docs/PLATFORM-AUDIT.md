# The three-app assessment

Audited 2026-08-08, with three products live (Kova, Tessa, Scena) and a
template. [docs/PLATFORM-GAPS.md](PLATFORM-GAPS.md) is the **two-app**
assessment and everything on it is closed; this is what the same lens finds
with a third app in the workspace — one that was **built outside the platform
and brought in**, which is a different and more informative test than an app
grown inside it.

Everything below is measured. The command is in the heading or the body so any
claim can be re-checked, and the numbers will drift.

**State of the tree at the time of writing:** `pnpm typecheck` — 60 tasks,
green. `pnpm gate` — all thirteen structural guards, green. `pnpm test` — 58
turbo tasks, green in 5m55s. Nothing here is a build break; every finding is
something that compiles, passes, and is wrong or absent anyway. That is the only
failure class this repo has ever actually had.

---

## The verdict, on one page

**The platform's mechanisms are in very good shape.** Fifteen `@4dl/*`
packages, fourteen with a boundary test and eleven of those with an EMPTY allow
list. Erasure is derived in all four workers. The composed schema runner,
the bindings contract, registry injection and "nothing depends on billing" are
real and are honoured by every app including the one that arrived from
elsewhere. The five doors, the standing model, the credit DO, the shared config
store and the Stripe rail are all single implementations with three consumers.

**What is not in good shape is the MOUNT.** The two-app audit found a repeating
pattern — *a package ships a mechanism, no package ships the surface*. All five
instances of it were closed by shipping the surfaces. The three-app audit finds
the sequel, and it is worse because it is invisible in a way the first one was
not:

> **The surface now exists, is shared, is good — and an app simply does not
> mount it.** Nothing fails. The package's tests pass, the app's tests pass, the
> boundary holds, the typecheck is green. The capability is just not there, and
> the only way to see it is to line the apps up next to each other.

Seven instances, all found by the same lens:

| # | Shared thing that exists | Apps that mount it | Consequence where it is missing |
|---|---|---|---|
| 1 | `otpSendGuard` (`@4dl/auth`) | **Kova only** | Tessa & Scena's sign-in has no bot check, no per-IP ceiling, no 30s cooldown, no eligibility check — and tells a user "we sent you a code" when mail is unconfigured |
| 2 | `Turnstile` widget (`@4dl/app-kit`) | **Kova only** | The bot check is configurable in three consoles, from a **shared** key, and enforced in one app |
| 3 | `NotificationBell` + `InboxScreen` (`@4dl/app-kit`) | Kova, Tessa | Scena dispatches 13 kinds of notification that nobody can see |
| 4 | `MaintenanceBanner` (`@4dl/app-kit`) + a maintenance screen | **Kova only** | An operator closing the deployment gets silent write failures in two of three apps |
| 5 | The `gate` on `/api/host` | Kova, Tessa (partly) | Scena's SPA re-declares `HostInfo` **without** `gate` or `maintenance` — the exact mistake the route's own comment warns about, on the client side of the wire |
| 6 | `sharedPanelViolations` (`@4dl/admin/conformance`) | Kova, Tessa | Scena has 2 live violations and no test that would say so |
| 7 | `checkActorDailyBudget` (`@4dl/ai`) | **Kova only** | In Tessa & Scena, one user can burn the tenant's whole credit balance in an afternoon |

**And one structural finding that outranks all seven**, because it is why there
will be an eighth: `apps/_template` **has no SPA**. It is a 1,230-line worker
and nothing else. Every browser surface a new app needs — shell, session, host
probe, theme, admin console, doors, conformance tests, vite/tailwind/PWA config
— is hand-built per app today. That is where roughly two thirds of an app's
code lives (Kova 34.7k SPA lines vs 19.3k worker; Scena 27.2k vs 15.3k), and it
is where every divergence in this document happened.

---

## Tier 0 — the front door is guarded in one app out of three

```
grep -rn "otpSendGuard" apps/*/src/index.ts      # → apps/api only
grep -rn "verifyTurnstile" apps/*/src            # → apps/api/src/otp-guard.ts only
```

On a **100% passwordless** platform, `POST /api/auth/email-otp/send-verification-otp`
is the only way anybody gets in. `@4dl/auth` owns the gate in front of it —
`otpSendGuard`, whose own header calls itself "THE ONE GATE in front of the
sign-in code". Kova mounts it. Tessa and Scena mount Better Auth's handler bare:

```ts
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))   // tessa, scena
```

**What every app does get**, from `createAuth` itself: a 6-codes-per-hour
per-address cap and the `auth_logs` trail. That is real and it is not nothing.

**What only Kova gets:**

| control | why it matters where it is missing |
|---|---|
| Turnstile human check | see Tier 0b — the keys are already shared platform-wide |
| 30s per-address cooldown | the resend button has no countdown to show; codes are silently dropped instead |
| per-IP hourly ceiling (20) | the per-address cap only slows an attacker **rotating addresses**, which is the actual attack, and at a tenant allowing self-registration each new address can cost a seat |
| eligibility verdict | "invite only" and "we are full" are the app's answers; without the seam neither can be given |
| deliverability pre-flight | **this is the sharpest one.** Better Auth runs `sendVerificationOTP` through a wrapper that catches and merely logs, then answers `200 {"success":true}` regardless. The guard's header says it plainly: on a fresh deploy with no mail provider, the first sign-in shows "we sent you a code" **forever** and nobody — the operator included — can get in |

That last row is not theoretical: it is the exact bootstrap failure
`@4dl/admin`'s README and DEPLOY.md §6 are both written around. Kova is
protected from it by a 503 with a reason. Tessa and Scena are not.

**The fix is a mount, not a design.** `otpSendGuard` takes four injected
functions (`eligibility`, `deliverable`, `humanCheck`, `forward`) and a `db`
accessor. Kova's binding is `apps/api/src/otp-guard.ts`, 110 lines, most of it
Kova's eligibility policy. Tessa's and Scena's eligibility policies are simpler
than Kova's, not harder.

### Tier 0b — Turnstile is configured platform-wide and enforced in one app

```
grep -n "turnstile" packages/core/src/config.ts   # site_key, secret, hostnames — ALL SHARED
grep -rl "Turnstile" apps/*/src                   # widget rendered: apps/app only
```

`turnstile.site_key`, `turnstile.secret` and `turnstile.hostnames` are on
`SHARED_CONFIG_KEYS`, commented *"One Turnstile widget, hostname-scoped across
the whole apex."* All three consoles ship `PlatformTurnstileSection`, whose blurb
promises "the bot check on sign-in". So an operator who configures it **once,
from any console**, has every reason to believe the platform's sign-in is
protected.

It is protected on Kova. On Tessa and Scena the widget is never rendered and
`verifyTurnstile` is never called. The control reads as ON and does nothing, and
there is no screen anywhere that could tell the operator otherwise.

Note the asymmetry with the hazard the panel already warns about: a secret with
no site key **locks everybody out**, loudly, and the panel says so. This is the
inverse — it **protects nobody**, silently. Only one of the two is discoverable.

---

## Tier 1 — capabilities that are wired up and unreachable

### Scena's inbox: complete on the server, invisible in the browser

```
grep -rc "notifyUser\|notifyRole\|dispatchNotification" apps/scena/src   # 13 dispatch sites
grep -n "notifyRoutes" apps/scena/src/index.ts                          # mounted
grep -rl "NotificationBell\|InboxScreen" apps/scena-app/src             # → nothing
```

This is the one gap CLAUDE.md already names, and the measurement confirms both
halves of it: the server side is **done** — `NOTIFY_SCHEMA`, `InboxDO` (class
name permanent since migration v5), `configureNotify` with Scena's registry, the
four routes mounted, and 13 real dispatch sites including screen alerts, the
dunning ladder and the emergency takeover. The browser side is **zero**.

Thirteen kinds of notification are written to a table and reachable only at
`GET /api/notifications`. It is a mount plus an `onOpen` handler — the kit is
router-free on purpose and hands the notification back — and that is the whole
job. It has been "landing with the next stage" for two stages.

### Neither Scena nor Tessa has any standing or maintenance surface

```
grep -rn "gate\b\|readOnly\|suspended\|blocked" apps/scena-app/src   # → nothing (all matches are 'navigate'/'feature-gate')
grep -rn "Maintenance" apps/tessa-app/src                            # → the admin panel only
```

Three separate things converge here and each is a different flavour of the same
absence.

**Scena's SPA re-declares the host shape and drops the gate.** The server is
correct — `@4dl/tenancy`'s `/host` spreads `{ ...host.gate }` and adds
`maintenance`, and Scena's own `domain-routes.ts` carries a ⚠️ comment saying
exactly why. The client then does this:

```ts
// apps/scena-app/src/host.ts
export interface HostInfo {
  role: HostRole; rootDomain: string; setupUrl: string;
  tenant: { … } | null;          // ← no `gate`, no `maintenance`
}
```

That is the invariant "a shape a package owns is spread, not re-declared"
violated on the receiving side. The consequence is the whole standing model
being invisible in the product: a workspace on the read-only rung, a workspace
blocked for non-payment, and a workspace whose owner scheduled a close all look
identical — every write just fails into a toast.

**Scena's `Shell.tsx` documents a banner that does not exist.** Its header
comment lists, as item 5 of what came across from Kova, *"The standing and
maintenance banners ABOVE the bar."* There is no such code in the file. This is
the same failure mode as the bell note CLAUDE.md already had to correct: a
comment describing intent becomes a reason for the next reader not to look.

**Tessa renders a `readOnly` badge, and its comment promises the rest.** It reads
`gate.readOnly` into a `<Badge>`, beside this:

```tsx
// apps/tessa-app/src/Shell.tsx:87
* `blocked` is a different matter and is handled before the Shell ever mounts.
```

```
grep -rn "blocked" apps/tessa-app/src   # → session.ts:35, the type. Nothing reads it.
```

Nothing handles it, before the Shell or anywhere else. `session.ts` declares
`gate: { readOnly?, blocked?, reason? }` — hand-picked again, and with no
`maintenance` — and `blocked` is read by no code in the app. A centre 30 days
past due gets the ordinary read-only app.

That is the third comment in this section describing a feature that is not
there, and it is the same shape `PLATFORM-GAPS.md` already recorded once
(`allowedWhileReadOnly`'s header promising an exemption only the socket had).
Three instances is a pattern, not bad luck: **a comment written in the
imperative during a design pass survives as evidence the work was done.**

Neither app has a `full`-maintenance screen either. At `full`, `@4dl/tenancy`
withholds the app server-side and `/api/host` is the one read that still
answers — precisely so the client can render a closed sign. Kova has
`screens/Maintenance.tsx`. Tessa and Scena render a generic failure.

### The per-actor AI credit cap has one consumer out of three

```
grep -rl "checkActorDailyBudget\|perActorDailyCreditCap" apps/*/src
   → apps/api/src/ai-routes.ts, apps/api/src/settings-routes.ts
```

`@4dl/ai` ships `ACTOR_DAILY_REQUEST_LIMIT`, `perActorDailyCreditCap` and
`checkActorDailyBudget` — the control that stops **one user** inside a tenant
burning the tenant's whole credit balance in an afternoon. Kova calls it. Tessa
and Scena do not, so in both the only ceiling is the tenant's balance itself.
Scena is the more exposed of the two: image, music and speech generation are all
per-request flat-priced there, and its own reserve estimator has a comment about
Lyria needing "a reserve that covers a whole song".

---

## Tier 2 — written twice, and the second time was not better

Scena is where this concentrates, for a legitimate historical reason: it was
built in its own repo and imported at `0cff6c6`. The point of listing these is
not that the code is bad — most of it is good and some of it is better
commented than the platform's — it is that **there are now two of each**, and
the third app pays for that twice.

### `apps/scena/src/ai.ts` + `gemini.ts` — 1,161 lines beside `@4dl/ai`'s metered path

```
wc -l apps/scena/src/ai.ts apps/scena/src/gemini.ts   # 889 + 272
wc -l apps/api/src/ai.ts apps/tessa/src/ai.ts          # ~20 each — a binding
```

Kova's and Tessa's `ai.ts` are ~20-line bindings: `configureAi`,
`configureAiMedia`, `export * from "@4dl/ai"`. Scena's is a complete second
implementation of the same loop — resolve model → reserve on the credit DO → run
→ settle exact credits → cache → audit — plus its own Gemini client for text,
image, speech and music.

**To be fair to it: it is correct.** It reserves and settles against
`TenantBillingDO`, its mock decision is gated on `ENVIRONMENT` (the storage/mock
chokepoint guard verifies this and passes), and the catalog underneath it is
already `@4dl/ai`'s since the `AI_SCHEMA` migration. What is duplicated is the
*path*, and the cost is the ordinary cost of two implementations: the four
latent defects the catalog migration found (`lyria-3-clip` 404ing on every
music generation; `syncGeminiFromGoogle` pricing Pro models at flash rates)
were all in the half that had no second reader.

`@4dl/ai` already exports `generate`, `generateImage`, `generateSpeech`,
`modelForTask`, `perActorDailyCreditCap` and `checkActorDailyBudget`. Scena
uses none of them and has no equivalent of the last two — **there is no
per-actor daily credit cap in Scena at all.**

### The billing STORE and the dunning LADDER

```
grep -rn "bindBillingStore" apps/*/src   # api ✓  tessa ✓  scena ✗
grep -rn "dailySweep\|DUNNING_DAYS" apps/*/src   # api ✓  tessa ✓  _template ✓  scena ✗
```

The store half is **known and correctly deferred**: `BILLING_SCHEMA` is
deliberately absent from Scena's `SCHEMA_MODULES` because `plans`,
`subscriptions`, `credit_packs` and `credit_ledger` share a name with Scena's
and differ in columns (`price_cents`+`currency`+`interval` vs
`price_usd_month`; `at` vs `created_at`; TEXT vs INTEGER timestamps). Adopting
it is a **data migration**, not a wiring change, and `apps/scena/src/schema.ts`
says so at the site. That judgement is right and should not be reversed
casually — but it is the last thing standing between Scena and the shared
money path, and it has been the stated blocker since Stage 4.

The **ladder** is a separate and softer problem. `@4dl/billing`'s
`DUNNING_DAYS` is four rungs — past_due → 7d read-only → 30d blocked → 37d
purged. Scena's `lifecycleSweep` (`billing-service.ts`) is its own two-rung
ladder — past_due → grace → suspended → delete — reading `billing.grace_days`
and `billing.delete_days` from config. Both are careful; they are simply
different products' answers to a question the platform has already answered
once, and a customer who buys two 4DL products gets two different arrears
experiences.

### The operator console: Scena rebuilt two panels the package ships

```
node -e "…sharedPanelViolations…"   # app: 0 · tessa-app: 0 · scena-app: 2
```

Scena's console mounts six of `@4dl/admin`'s eight panels — email, shared
config, domains, Turnstile, rail, maintenance — which is genuinely good adoption.
It then renders its **own** `StripeTab` and `ModelsTab` over
`/api/admin/stripe/*`, `/api/admin/email/test` and its own `/api/admin/models`,
instead of `PlatformStripeSection` and `PlatformAiSection`.

`sharedPanelViolations` exists to catch exactly this and reports **2 violations**
in `apps/scena-app/src/api.ts`. Scena is the only SPA with no
`admin-panels.conformance.test.ts`, so nothing runs it.

The AI panel is the more expensive of the two: `PlatformAiSection` is where
`@4dl/ai`'s catalog sync, the per-lane default picker, the markup column and —
critically — the **"Apply to every 4DL app"** broadcast live. Scena's local
`ModelsTab` over `/api/admin/models` cannot participate in the shared selection
at all.

### Platform-scope promo codes: two tables, same name, different semantics

```
grep -rn "promo_codes" apps/api/src apps/scena/src
grep -rli "promo" packages/billing/src packages/commerce/src   # → nothing platform-scope
```

Kova: `promo_codes(scope, discount_type, percent_off, amount_off_cents,
restricted_package_id, …)` — a **discount on a price**.
Scena: `promo_codes(kind, credits, plan_id, plan_months, per_tenant_limit, …)`
— a **grant of credits or plan months**.

Both are operator-issued, platform-scope codes against plans and credit packs.
Both have an admin panel. Neither is in a package, and no package covers this:
`@4dl/commerce`'s discount codes are the *tenant's* codes for the tenant's own
customers, which is a different rail entirely. Tessa has neither.

This one is **not a straight extraction** — the two semantics are genuinely
different features that happen to share a table name — and the right first move
is to decide which one the platform sells, not to merge them.

---

## Tier 3 — the structural guards are per-app and hand-listed

```
grep -oE "apps/[a-z_-]+" scripts/*.test.mjs | sort -u
```

`apps.json` exists because *"every deployment problem in this repo so far was a
per-app step somebody forgot to duplicate"*, and CI, deploys and provisioning
all derive their app list from it. **Eight of the thirteen `pnpm gate` guards do
not.**

| guard | derives its app list | covers |
|---|---|---|
| `ui-ownership` | ✅ from `apps.json` | every app — and it is the model for the rest |
| `motion-config` | ✅ | every SPA |
| `apps-manifest`, `affected`, `workflows-parse`, `shared-config`, `sender-default`, `email-brand-origin` | ✅ n/a — repo-level | — |
| `entitlement-enforcement` | ❌ hardcoded | **`apps/api` only** |
| `flag-enforcement` | ❌ hardcoded | **`apps/api` only** |
| `storage-chokepoint` | ❌ hardcoded | `apps/api`, `apps/scena` — not Tessa, not the template |
| `scena-fetch-chokepoint` | ❌ hardcoded | `apps/scena-app` only |
| `player-api-base` | ❌ by nature | Scena's player (correctly single-app) |

The two that matter most are `entitlement-enforcement` and `flag-enforcement`.
Their job is *"every live entitlement is named by a gate, every quota is counted
against, and the reserved list is pinned so it cannot grow to cover an
oversight"* — the check that a capability a plan **sells** is actually
**enforced by a route**. Kova has it. Tessa and Scena sell entitlements with no
such check. That is the same class of hole `/api/progress` was, and it was found
in Kova only because Kova had the guard.

`scena-fetch-chokepoint` is the mirror image: a rule that is genuinely
platform-wide — *one door to the API, so an expired session says so* — written
against one app's file paths. Kova and Tessa satisfy it today by going through
`@4dl/app-kit`'s `api`; nothing stops the fourth app from not.

---

## Tier 4 — `apps/_template` is half a template

```
ls apps/_template                       # README package.json src test tsconfig vitest.config wrangler.jsonc
grep -c "app.route(" apps/_template/src/index.ts        # 5
grep -c "app.route(" apps/api/src/index.ts              # 44
```

This is the highest-leverage item in the document, because it is the one that
decides what app #5 costs.

**There is no SPA.** The template is a worker. A new app's browser half —
`Shell`, `session`, `theme`, `host`, the admin console binding, the five doors'
screens, `main.tsx`, the conformance tests, `vite.config.ts`, `tailwind`,
`tokens.accents.css`, the PWA config — is copied by hand from whichever existing
app the author happens to open. Every UI divergence in this document arrived
that way.

**And the worker mounts five route trees out of the twelve the packages ship.**
It applies `NOTIFY_SCHEMA`, `STORAGE_SCHEMA` and `BILLING_SCHEMA`, then mounts:

| package route tree | in the template |
|---|---|
| `domainRoutes` / `domainAdminRoutes` | ✅ |
| `emailAdminRoutes`, `sharedConfigRoutes`, `maintenanceAdminRoutes` | ✅ |
| `notifyRoutes` | ❌ — tables and `InboxDO` present, unreachable |
| `mediaRoutes` | ❌ — `STORAGE_SCHEMA` present, no upload/meter/read |
| `staffRoutes` | ❌ — no roster, no invite, no revoke |
| `accountRoutes` | ❌ — no self-delete |
| `tenantCloseRoutes` | ❌ — and "leaving is always allowed" is a documented invariant of the gate it already enforces |
| `aiCatalogAdminRoutes` | ❌ |
| `bindBillingStore` | ❌ |
| `turnstileAdminRoutes` | ✅ (via `domain-routes.ts`) |
| `otpSendGuard` | ❌ |

A new app copying this inherits the **exact** "mechanism with no surface" bug
`PLATFORM-GAPS.md` is about — pre-installed, five ways over, in the file that is
supposed to be the answer to it. The template's own README is excellent and its
17 tests are real; what it is missing is the mounts, and each one is between two
and fifteen lines.

---

## Tier 5 — the UI bar, measured

`@4dl/ui/conformance` is adopted by all three SPAs — that landed with the
two-app audit and it held. Run unwaived, over each app's whole source:

```
uiConformance({ roots: [<app>/src], repoRoot })
```

| app | violations, unwaived | breakdown |
|---|---|---|
| Kova | 40 | 34 `design-tokens` (media-overlay waiver, argued) + 6 `save-lifecycle` outside the four scoped screens |
| Tessa | **0** | — |
| Scena | 96 | 62 `design-tokens` + 34 `type-scale` — all covered by stated, reasoned exemptions (slide CSS, three-metre surfaces) |

Scena's 96 are **waived with arguments that are correct**: a slide's own CSS is
drawn on a television and no app rule has anything true to say about it. That is
fine. Two things behind the numbers are not.

**`save-lifecycle` is structurally vacuous in Scena.** The rule's regex keys on
`api.(patch|post|put|del)`:

```
grep -rEo '\bapi\.(get|post|patch|put|del)\b' <app>/src | wc -l
   Kova 337 · Tessa 53 · Scena 2
```

Scena calls `apiFetch`. The rule therefore **cannot fire** in Scena — it passes
because it is blind, not because Scena is clean. Behind it are ~50 swallowed
`.catch(() => …)` sites, and at least one is a swallowed **write**:

```ts
// apps/scena-app/src/App.tsx:155
await clearEmergency().catch(() => {});
```

Clearing an emergency takeover — a siren across every screen in a workspace —
that silently fails is precisely what the rule exists for.

**The Kova `save-lifecycle` widening is still outstanding.** Six real instances
in five files (`HomeWidgets`, `InsightFeedback`, `Onboarding`, `Today`,
`CoachToday`), unchanged since the two-app audit deliberately deferred it.

**Other measured UI/UX asymmetries:**

| capability | Kova | Tessa | Scena |
|---|---|---|---|
| `@4dl/app-kit` symbols used | 33 | 22 | 17 |
| upload progress (`useUpload`/`UploadProgress`) | ✅ | ✗ | ✗ (own uploader) |
| `PaymentSheet` (Stripe.js inline) | ✅ | ✗ | ✗ |
| offline / PWA (`offlinePwa`) | ✅ | ✗ (argued, correctly) | ✗ (**not** argued) |
| `@4dl/i18n` | ✗ | ✅ EN+DE | ✗ |
| local `components/` dir | 0 | 0 | 15 |
| `index.ts` inline route handlers | 0 (44 modules) | few | **102 (1,884-line `index.ts`)** |

Scena's PWA absence is worth a line of its own: a **digital-signage dashboard**
is the one product here where the operator is plausibly on a phone in a venue
with bad wifi, and Tessa's `vite.config.ts` carries a thorough argument for why
*it* declines offline. Scena carries no argument either way — which means nobody
has decided.

---

## What is NOT a gap, and should not be "fixed"

Recording these because each one looks like a gap from a grep:

- **Scena has no `@4dl/commerce`, and should not.** Commerce is the economy a
  tenant sells to *its own customers*. A signage workspace has screens, not
  customers. Correct absence.
- **Scena's `/api/assets/:hash` instead of `mediaRoutes`.** The R2 key is the
  content hash — the manifest references assets by it, the player caches
  `/api/assets/<hash>` immutably for months offline, and `library_tracks` is a
  platform-wide catalog. A tenant-prefixed key breaks all three. The ledger row
  is qualified instead (`ledgerKey = <tenantId>:<hash>`), which is the right
  seam. Correct divergence, already documented.
- **The player is dependency-free.** Deliberate, and it should stay that way.
- **`BILLING_SCHEMA` absent from Scena.** A column-shape reconciliation, not an
  oversight — see Tier 2.
- **Scena's `statusOf`, `purge`, `entitlements`, `action-otp`, `staffRoutes`,
  `accountRoutes`, `tenantCloseRoutes`, `onboarding`, storage chokepoint, brand
  kit and theme.** All correctly on the platform. Scena's readaptation is
  **mostly done**; this document is the remainder, and the remainder is smaller
  than the part that landed.
- **Thin per-app bindings** (`env.ts`, `mailer.ts`, `storage.ts`, `ai.ts`,
  `inbox-do.ts`, `billing-do.ts`, `org-guard.ts`). 20–60 lines each and they
  *should* be. That is the seam working.

---

## Tier 6 — documentation that has drifted from the code

Small, but this repo is unusually dependent on its prose being right: every
audit here starts by reading `CLAUDE.md` and `PLATFORM.md` as ground truth, and
CLAUDE.md's own Status section says an over-claim costs more than an
under-claim.

```
ls packages/*/  | wc -l                                  # 15 @4dl packages, not 14
grep -c "const ALLOW" packages/*/test/boundary.test.ts   # 14 boundary tests
```

- **"Fourteen shared packages"** — `PLATFORM.md` line 3 and `CLAUDE.md`'s Status
  section. There are **fifteen**; `PLATFORM.md`'s own table lists all fifteen,
  including the `@4dl/i18n` row, so the sentence contradicts the table below it.
- **"Thirteen of the fourteen are empty — `@4dl/core`'s is the only one with
  entries."** Three allow lists now have entries: `@4dl/core`,
  `@4dl/app-kit` (`src/pwa.ts:client`) and `@4dl/commerce`
  (`src/providers.stripe-link.ts:client`). Both new ones look defensible; the
  claim that they cannot exist does not.
- **`apps/app/src/save-lifecycle.conformance.test.ts`** — named in `CLAUDE.md`'s
  conventions. The file does not exist; the rule moved into
  `@4dl/ui/conformance` with the two-app audit.
- **`apps/scena-app/src/Shell.tsx` §5** — claims "the standing and maintenance
  banners ABOVE the bar" as landed. See Tier 1.
- **`@4dl/i18n` has no boundary test**, and is the only `@4dl/*` package
  without one.

None of these is expensive on its own. Together they are the mechanism by which
a future reader concludes something is done and does not look — which is exactly
how the Scena bell survived two stages, by CLAUDE.md's own account.

---

## The ordered plan

Ranked by (breakage prevented + consistency gained) ÷ (risk of the move). The
first three are days, not weeks, and they close everything user-visible.

### 1. Mount `otpSendGuard` in Tessa and Scena — *security, and a bootstrap trap*

Two `otp-guard.ts` bindings modelled on Kova's, two mounts. Each app supplies
its own `eligibility` (both are simpler than Kova's) and reuses the mailer's
`deliverable` check. **Do this first**: it is the only finding where the absence
is exploitable rather than merely inconsistent, and the deliverability
pre-flight removes a bootstrap failure that has no other guard.

Then render `<Turnstile>` on both sign-in screens, so the shared key an operator
sets means what the panel says it means.

While you are in each app's AI binding, add `checkActorDailyBudget` — it is one
call on the generation path and it is the difference between a runaway user
costing a tenant a day's credits and costing them everything.

### 2. Give Scena the three missing surfaces — *the app is otherwise done*

- **The bell.** `NotificationBell` + `InboxScreen` from `@4dl/app-kit`, plus an
  `onOpen` handler and a per-type icon map. The server side is complete.
- **The gate.** Add `gate` and `maintenance` to `HostInfo` by **spreading**, then
  render `MaintenanceBanner`, a standing banner and a blocked screen — the three
  Kova already has. Delete or fulfil `Shell.tsx`'s §5 comment.
- **The console.** Swap `StripeTab`/`ModelsTab` for `PlatformStripeSection`/
  `PlatformAiSection`, and add `admin-panels.conformance.test.ts` so it stays
  swapped. This is also what puts Scena on the shared-selection broadcast.

Tessa needs the maintenance banner and a `blocked` screen from the same list.

### 3. Make the guards derive their app list — *stops finding #7*

`ui-ownership.test.mjs` already reads `apps.json` and is the template. Port
`entitlement-enforcement` and `flag-enforcement` to it first: they are the
checks that a sold capability is an enforced one, and two apps currently sell
without them. Expect them to fail on first run — that is the finding, not a
regression. Then widen `storage-chokepoint` to every app and generalise
`scena-fetch-chokepoint` into "one API door per SPA".

### 4. Finish the template — *this is what makes app #5 cheap*

Two halves, and the second is the big one:

- **Worker:** mount the six missing route trees (`notifyRoutes`, `mediaRoutes`,
  `staffRoutes`, `accountRoutes`, `tenantCloseRoutes`, `aiCatalogAdminRoutes`),
  `bindBillingStore`, and `otpSendGuard`. Ten to fifteen lines each, and every
  one of them turns an already-applied schema into a reachable capability.
- **`apps/_template-app`:** a real SPA in the workspace, typechecked and tested
  like the worker, carrying the shell, the doors, the session, the theme, the
  admin console binding, the conformance tests and the build config — with the
  product vocabulary removed. This is the single change that most affects how
  fast the next app ships and how much it looks like the last one.

### 5. Retire Scena's duplicated paths — *largest code win, lowest urgency*

In this order, because each unblocks the next:

1. **`ai.ts` + `gemini.ts` → `@4dl/ai`'s `generate`.** 1,161 lines out, and
   Scena gains the per-actor daily credit cap it does not have. The catalog is
   already shared, so this is the last mile.
2. **`BILLING_SCHEMA` reconciliation → `bindBillingStore`.** The data migration
   the schema comment describes. Do it on its own, with a backfill test.
3. **The dunning ladder** onto `DUNNING_DAYS` + `dailySweep`, which falls out of
   (2) nearly for free.
4. **Decide what a platform promo code is** — a discount (Kova) or a grant
   (Scena) — then put the winner in `@4dl/billing` and migrate the loser. This
   is a product decision before it is an extraction.

### 6. The standing items neither app has resolved

- **Widen `save-lifecycle`**, and first make it see `apiFetch`-shaped calls so it
  is not vacuous in Scena. Then fix Kova's six and Scena's swallowed writes.
- **Decide Scena's offline story**, either way, in writing — Tessa's
  `vite.config.ts` is the model for how to decline.
- **`@4dl/i18n` has one consumer out of three.** Kova's ~500 hard-coded strings
  remain product work, not platform work, and half-doing it is worse than not.
  Scena is the cheaper of the two and would make the package's seam real.
- **`@4dl/i18n` has no boundary test** — the only `@4dl/*` package without one.

---

## The lesson, for the next audit

The two-app audit's lesson was *a mechanism with no surface reads as done and is
not*. The three-app lesson is one step further along the same road:

> **A surface no app is required to mount reads as adopted and is not.**

Every finding in Tiers 0–2 is an app that could have mounted a shared, working,
well-designed thing and did not — and in every case nothing anywhere failed. The
repo already knows the answer to this shape of problem, because `apps.json` is
that answer for deployment: **derive the list, do not repeat it.** Tier 3 and
Tier 4 are the same move applied to capability rather than to CI, and they are
the two items on this page that stop it recurring rather than fixing one
instance of it.
