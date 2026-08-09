---
kind: plan
---

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

Eight instances, all found by the same lens:

| # | Shared thing that exists | Apps that mount it | Consequence where it is missing |
|---|---|---|---|
| 1 | `otpSendGuard` (`@4dl/auth`) | **Kova only** | Tessa & Scena's sign-in has no bot check, no per-IP ceiling, no 30s cooldown, no eligibility check — and tells a user "we sent you a code" when mail is unconfigured |
| 2 | `Turnstile` widget (`@4dl/app-kit`) | **Kova only** | The bot check is configurable in three consoles, from a **shared** key, and enforced in one app |
| 3 | `NotificationBell` + `InboxScreen` (`@4dl/app-kit`) | Kova, Tessa | Scena dispatches 13 kinds of notification that nobody can see — ✅ **closed 2026-08-08**, and mounting it found five dead links |
| 4 | `MaintenanceBanner` (`@4dl/app-kit`) + a maintenance screen | **Kova only** | An operator closing the deployment gets silent write failures in two of three apps — ✅ **closed 2026-08-08** |
| 5 | The `gate` on `/api/host` | Kova, Tessa (partly) | Scena's SPA re-declares `HostInfo` **without** `gate` or `maintenance` — the exact mistake the route's own comment warns about, on the client side of the wire |
| 6 | `sharedPanelViolations` (`@4dl/admin/conformance`) | Kova, Tessa | Scena has 2 live violations and no test that would say so |
| 7 | `checkActorDailyBudget` (`@4dl/ai`) | **Kova only** | In Tessa & Scena, one user can burn the tenant's whole credit balance in an afternoon |
| 8 | `syncStripeSubscription` (`@4dl/billing/webhook`) | Kova, Tessa | Scena wrote its own reconciler: no ladder guard, no stale-sub guard, no refund reversal. See "The money path" below — this one is money |

**And one that is not a missing mount but a missing panel:** `@4dl/admin` ships
eight sections and **none of them is the plan catalog** — so Kova and Scena wrote
one each and Tessa has none at all. Trial length is not editable in any of them.

> ### ✅ Step 4b is DONE (2026-08-08)
>
> Rows 7 and 8 above and the plan-catalog paragraph are the shape of the problem
> as it was found; three of them are now closed. What landed:
>
> - **`reverseChargedCredits` is `@4dl/billing`'s**, and Kova, Tessa and Scena
>   all call it. A refunded or disputed credit pack now has its credits clawed
>   back proportionally and incrementally in every app; before this it happened
>   in one. 9 tests.
> - **Scena's reconciler gained the three guards** — the `LADDER_OWNED` clamp
>   (as a SQL condition on `updateSubscription`, so it cannot race the sweep),
>   the stale-subscription guard, and the card-less-trial refusal. 9 tests
>   against a real D1, including that paying still clears `past_due`.
> - **`PlatformPlansSection` + `planAdminRoutes` ship**, mounted in all three
>   consoles. Kova's editor moved into the package, Tessa gained a plan editor it
>   never had, Scena's was replaced — and gained the grandfathering it lacked,
>   which is the one that was actively taking capability away from live
>   workspaces. **`trialDays` is editable for the first time anywhere.** 14 tests.
> - `/api/admin/plans/` (the EDIT, trailing slash) is now in
>   `SHARED_ADMIN_ENDPOINTS`, so rebuilding this panel is a test failure. The
>   bare list read stays allowed — a promo dialog needs the names.
>
> Rows 1–6 are open, and so is Scena's console conformance test (its two
> remaining violations are the Stripe and Email panels, which is step 2).

> ### ✅ Step 1 is DONE (2026-08-08), and it found a live outage
>
> Rows 1, 2 and 7 are closed. `otpSendGuard` is mounted in Tessa and Scena with
> their own eligibility rules, the two bypass siblings are shut in both, the
> Turnstile widget renders on both sign-in screens, and
> `checkActorDailyBudget` gates every AI generation in both.
> `scripts/otp-gate.test.mjs` derives its app list from `apps.json` and
> mutation-tests three ways an app could be unguarded, so #4 cannot repeat it.
>
> **Scena's `HostInfo` is now the kit's type rather than a lookalike**, which
> closes row 5's server→client half: `gate`, `maintenance` and `turnstile` all
> arrive at the client instead of being dropped by a four-field re-declaration.
> Rendering the standing and maintenance banners is still step 2.
>
> **And writing the test for row 7 uncovered something worse than row 7.** See
> "The column a package read and did not ship", below.

**And one structural finding that outranks all eight**, because it is why there
will be a ninth: `apps/_template` **has no SPA**. It is a 1,230-line worker
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

## Tier 0c — the column a package read and did not ship

```
grep -rn "ADD COLUMN ai_config_json" apps/*/src packages/*/src   # → apps/api only
```

Found by writing a test for the per-actor credit cap, not by looking for it, and
it is the most expensive thing in this document.

`@4dl/ai`'s `generate()` and `generateImage()` both OPEN with `loadTenantAi` —
an unguarded `SELECT ai_config_json, ai_toggles_json FROM tenant_settings`. It is
the first statement, before the model resolve, before the reserve.
`perActorDailyCreditCap` reads the same blob.

**`ai_config_json` was declared by exactly one app**, in Kova's own schema
module. `ai_toggles_json` happens to live on `tenant_settings`' own CREATE, which
is why only half of this was visible. So in Tessa — and in every future app that
composes `AI_SCHEMA` — the entire AI suite threw `no such column: ai_config_json`
on **every call**. Four features (`read-label`, `reorder-advisor`,
`recall-report`, `read-document`), gated behind a paid `ai` entitlement, dead.

What makes it the sharpest instance of this document's thesis is how completely
invisible it was:

- `@4dl/ai`'s own tests pass — they run against a database its own module built.
- Tessa's tests pass. Its one AI test asserts that an **unauthenticated** call is
  refused, and a refusal returns before the query ever runs.
- The typecheck is clean, because a column name is a string.
- A 500 on a feature nobody has tried yet is indistinguishable from a feature
  nobody has tried yet.

**Fixed by making the package ship what it reads**: the ALTER moved into
`AI_SCHEMA` (version 4 → 5, and the alters are idempotent so Kova's duplicate is
a no-op). Tessa's suite now asserts the exact select `generate()` makes, rather
than the column list, because the select is what breaks.

**The rule this leaves behind, and it is a contribution rule, not a bug fix:**

> **A package that READS a column must DECLARE it.** Composing schema modules
> makes it easy for a package to depend on a column some app happens to have —
> and the first app always happens to have it, because that is where the code was
> written.

`packages/tenancy`'s `tenant_settings` is worth a second look on the same
grounds: it carries `ai_toggles_json` and `marketplace_json` on its own CREATE,
which are two product-shaped columns in the package that owns addressing.

---

## Tier 1 — capabilities that are wired up and unreachable

### Scena's inbox: complete on the server, invisible in the browser — ✅ FIXED

> **Closed 2026-08-08.** `apps/scena-app/src/Notifications.tsx` mounts the bell
> and `/inbox`. Mounting it found what only a rendered notification could:
> **five of the registry's links were dead** — four types pointed at `/screens`,
> which is not a route (the fleet list is `/`), and one at `/sources`, whose
> route is `/feeds`. An integration test was asserting `/screens`, so it was
> pinning the bug and passed for as long as nothing rendered a notification.
>
> The first draft of the icon map was wrong in the same direction: three keys
> named types that do not exist and three real types had no entry, all of which
> fall back to a generic bell without erroring.
> `notifications.conformance.test.ts` checks all three edges — every type is
> coded, no coding is an orphan, every link is a real route — and is
> mutation-tested. It is the assertion that generalises; the integration test
> keeps the narrower claim it can own.

The section below is the finding as it was found.


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

> ### ✅ Rows 4 and 5 closed (2026-08-08)
>
> Kova's `Maintenance.tsx` was 71 lines whose own comment reads "This is about
> US. Nobody reading it did anything, nobody can pay to end it" — nothing
> product-specific in it but the name over the door. It is `@4dl/app-kit`'s
> `MaintenanceScreen` now, and all three apps render it.
>
> Tessa gained a `blocked` screen and the maintenance banner; Scena gained both
> banners (the ones its Shell header had claimed for three stages), a
> `WorkspaceBlocked` screen, and the `full`-maintenance branch.
>
> **`pickScreen` moved out of `main.tsx` to be testable at all.** It sat beside
> a `createRoot(document…)` call, so importing it outside a browser threw —
> which is a large part of why two of its inputs were declared and never read.
> Nine tests now pin the order, including that maintenance outranks a centre's
> own standing (telling somebody to settle an invoice during OUR outage sends
> them to fix the wrong thing) and that `readOnly` still serves the app.

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

### The money path: one rail, one catalog shape — and three reconcilers

This is the deepest divergence in the repo and the one with real money behind
it, so it gets its own accounting. **Everything up to the webhook is shared and
in good shape:**

| stage | where it lives | all three apps? |
|---|---|---|
| Stripe credentials (`stripe.mode`, both lanes' secret + publishable keys) | `SHARED_CONFIG_KEYS` — set once from any `admin.` console | ✅ |
| the per-endpoint `stripe.*.webhook_secret` | deliberately **excluded** from sharing | ✅ |
| test/live lane flip, with catalog-id stash & restore | `@4dl/billing/stripe.ts` (`swapCatalogLane`) | ✅ |
| catalog → Stripe products/prices, and the **price-change id null-out** | `syncCatalog` | ✅ |
| catalog seeding, version-stamped; plan/pack reads; `tenantEntitlements`; `withinQuota` | `bindBillingStore` | Kova, Tessa (Scena pending the column reconciliation) |
| `trialDays` → `trialPeriodDays()` clamped to Stripe's 1..730 | `@4dl/billing/entitlements.ts` | ✅ |
| "selecting a plan never grants it" — `pending_plan_id` only | each app's onboarding | ✅ |
| signature verify once → attribute → park what it cannot | `@4dl/billing-rail` `dispatchEvent` | ✅ |
| idempotency (`firstSeen` claims, `unmarkSeen` releases on throw) | `@4dl/billing/webhook.ts` | ✅ |

**And then the reconciler forks.** `syncStripeSubscription` is `@4dl/billing`'s
answer to "what does this event mean for the row we hold". Kova and Tessa call
it. Scena wrote its own `handleWebhook`. Counting the event types each app
actually handles:

```
grep -oE 'case "[a-z_.]+":' apps/api/src/stripe-routes.ts apps/tessa/src/billing-routes.ts apps/scena/src/stripe.ts
   Kova 10 · Tessa 6 · Scena 5
```

| behaviour the shared reconciler has | Kova | Tessa | Scena |
|---|---|---|---|
| `LADDER_OWNED` guard — a payment event may not stamp over `suspended` / `blocked` / `canceled` / **`closing`** | ✅ | ✅ | ❌ |
| stale-subscription guard — only the tenant's *current* sub reconciles | ✅ | ✅ | ❌ |
| card-less `trialing` is refused, not entitled | ✅ | ✅ | ❌ |
| `charge.refunded` / `charge.dispute.created` → proportional, idempotent credit reversal | ✅ | ❌ | ❌ |
| `customer.subscription.trial_will_end` | ✅ | ❌ | ❌ |

Three of those are worth stating plainly, because each is money or state and
none of them fails visibly:

**Nobody but Kova reverses a refund.** All three apps sell the same four credit
packs (1k/5.5k/30k/130k). Refund one in Tessa or Scena and the credits stay in
the balance — there is no `charge.refunded` case to hear it. Kova's handling is
the non-obvious kind: Stripe fires the event for every *partial* refund carrying
a **cumulative** `amount_refunded`, so a naive handler double-reverses; the
shared code keys the reversal off the charge id and reads back what it already
took (`creditsAlreadyReversed`).

**Scena's `invoice.paid` can resurrect a closed workspace.** It writes
`status: "active"` unconditionally. `@4dl/billing`'s version excludes
`LADDER_OWNED` and comments on exactly this: a `closing` row stopped matching
`WHERE status = 'closing'` and *"a studio the owner had asked to close quietly
came back to life."* Scena has the `closing` rung — it is a documented feature
of SCENA.md §12a — and nothing protecting it from a late invoice.

**Scena stamps a card-less trial as `trialing` and grants the plan.** Its own
Checkout collects a card, so the ordinary path is safe; the exposure is a
subscription created from the Stripe dashboard with a trial and no payment
method. In Kova this exact shape once granted a free paid tier plus 3,000
credits, which is why the guard exists.

### Trials: a real mechanism with no operator surface

```
grep -c "trialDays" apps/app/src/screens/admin/AdminConsole.tsx    # 0
```

`trialDays` is a first-class member of `EntitlementShape`, clamped for Stripe by
the package, and reaches `trial_period_days` in all three apps. Shipped values:
Kova 30 days on Starter/Light and 0 above; Tessa 14; Scena 30 on Starter.

Kova's console section is labelled *"Plans — price, limits and **trials** owners
buy"*, and `PATCH /admin/plans/:id` accepts `entitlements.trialDays`. The editor
renders `EntitlementFields` from `featureKeys` + `quotaKeys` plus a field for
`aiCredits.monthlyGrant` — **every top-level key of `EntitlementShape` except
`trialDays`**. So the one screen that claims to set trial length is the one
place you cannot; it is an API call or a redeploy.

### The plan catalog editor is written twice and missing once — ✅ FIXED

| app | plan catalog surface |
|---|---|
| Kova | `PlansConfig` — on-sale / retired split, per-plan tenant counts, a grandfathering warning, generic quota + feature fields driven by the server's key list |
| Scena | `PlansTab` — its own, over `PUT /api/admin/plans/:id` (Kova's is `PATCH`) |
| Tessa | **none.** No `/admin/plans` route, no panel. Changing a price, a limit or the trial is a code edit, a deploy and a catalog sync |

`@4dl/admin` ships eight panels and a plans panel is not one of them, even
though `@4dl/billing`'s store already owns `listPlans`, the entitlement
resolution and the grandfathering snapshot, and even though the *shape* of the
editor is entirely generic — the server hands over `featureKeys`/`quotaKeys` and
their labels, which is precisely the registry-injection seam the platform uses
everywhere else. This is the next instance of the pattern in the pipeline, and
it is the one an operator meets on day one.

**Closed in two steps.** `@4dl/admin` gained `PlatformPlansSection` over
`@4dl/billing`'s `planAdminRoutes` (step 4b), which gave Tessa an editor it had
never had. Scena kept hand-written handlers behind that shared panel for one
more step — they spoke the shared wire contract over a table storing cents, so
they were a translation layer and said so — and 5.2's column reconciliation
deleted them. All three apps mount the same routes under the same panel now,
including the grandfathering and the reprice id null-out that neither app's own
editor had.

### The billing STORE — ✅ FIXED (2026-08-09) — and the dunning LADDER

```
grep -rn "bindBillingStore" apps/*/src   # api ✓  tessa ✓  scena ✓
grep -rn "dailySweep\|DUNNING_DAYS" apps/*/src   # api ✓  tessa ✓  _template ✓  scena ✗
```

The store half was **known and correctly deferred**: `BILLING_SCHEMA` was
deliberately absent from Scena's `SCHEMA_MODULES` because `plans`,
`subscriptions`, `credit_packs` and `credit_ledger` share a name with Scena's
and differ in columns (`price_cents`+`currency`+`interval` vs
`price_usd_month`; `sort` vs `ord`; `created_at` vs `at`; epoch milliseconds vs
ISO text). Adopting it was a **data migration**, not a wiring change.
`apps/scena/src/billing-reconcile.ts` is that migration — see step 5.2 in the
ordered plan for what it does, why it runs before `applySchema`, and the three
things Scena's own copies were getting wrong.

The **ladder** is a separate and softer problem. `@4dl/billing`'s
`DUNNING_DAYS` is four rungs — past_due → 7d read-only → 30d blocked → 37d
purged. Scena's `lifecycleSweep` (`billing-service.ts`) is its own two-rung
ladder — past_due → grace → suspended → delete — reading `billing.grace_days`
and `billing.delete_days` from config. Both are careful; they are simply
different products' answers to a question the platform has already answered
once, and a customer who buys two 4DL products gets two different arrears
experiences.

### The operator console: Scena rebuilt two panels the package ships — ✅ FIXED

```
node -e "…sharedPanelViolations…"   # app: 0 · tessa-app: 0 · scena-app: 2
```

Scena's console mounted six of `@4dl/admin`'s eight panels — email, shared
config, domains, Turnstile, rail, maintenance — which is genuinely good adoption.
It then rendered its **own** `StripeTab` and `ModelsTab` over
`/api/admin/stripe/*`, `/api/admin/email/test` and its own `/api/admin/models`,
instead of `PlatformStripeSection` and `PlatformAiSection`.

`sharedPanelViolations` exists to catch exactly this and reported **2 violations**
in `apps/scena-app/src/api.ts`. Scena was the only SPA with no
`admin-panels.conformance.test.ts`, so nothing ran it.

The AI panel is the more expensive of the two: `PlatformAiSection` is where
`@4dl/ai`'s catalog sync, the per-lane default picker, the markup column and —
critically — the **"Apply to every 4DL app"** broadcast live. Scena's local
`ModelsTab` over `/api/admin/models` could not participate in the shared
selection at all.

**What fixing it turned up, which is the part worth reading.** `StripeTab` was
three panels wearing one coat, and the middle one was the finding: an EMAIL form
writing the same `app_config` rows as `PlatformEmailSection`, which this console
already mounted three sections below it. Two screens answering "what is the
sender", with no rule about which wins.

And mounting `PlatformStripeSection` was blocked, because **Scena had no
`/admin/stripe/status` or `/admin/stripe/config` at all** — its console
configured Stripe through the generic `/api/admin/config` form, which stores
whatever string it is handed. A live secret key filed under a `test` mode, a
publishable key in the secret slot, a signing secret in either: all saved, none
reported.

So the route trees moved too, and they were the deeper duplication —
`@4dl/billing`'s `stripeAdminRoutes` now, bound by all three apps (18 new tests):

| | lanes stored | mode-flip catalog swap | price rebuild | credential screen |
|---|---|---|---|---|
| Kova (was) | both | ✅ | ✅ | ✅ |
| Tessa (was) | one | ❌ | ❌ | ✅ |
| Scena (was) | — | — | ❌ | ❌ |

Tessa's missing swap is the one that cost real money: Stripe products and prices
are per-lane objects, so pressing its own console's **live** switch left every
plan pointing at its test-lane price id, and every checkout after that failed
with "No such price" — a payments outage produced by the button the console
offers, with no repair path because there was no rebuild either.

`syncCatalog` / `seed` / `clearCatalogIds` stay injected: the catalog TABLE is
still the app's (`price_cents` here, `price_usd_month` in the shared store), and
that seam is what let Scena adopt the routes without the store migration. See
PLATFORM.md's new **"An operator route tree is not a product route tree"**.

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
all derive their app list from it. **Eight of the thirteen `pnpm gate` guards did
not** — four of them for reasons that turned out to be hiding real defects.

| guard | derives its app list | covers |
|---|---|---|
| `ui-ownership` | ✅ from `apps.json` | every app — and it is the model for the rest |
| `motion-config` | ✅ | every SPA |
| `apps-manifest`, `affected`, `workflows-parse`, `shared-config`, `sender-default`, `email-brand-origin` | ✅ n/a — repo-level | — |
| `entitlement-enforcement` | ✅ **fixed** | every app with a D1 |
| `flag-enforcement` | ✅ **fixed** | every app — and it now *reports* which have no customer rail |
| `storage-chokepoint` | ✅ **fixed** | every app with an R2 bucket, every app with an `ai.ts` |
| `api-door` (was `scena-fetch-chokepoint`) | ✅ **fixed** | every registered SPA |
| `player-api-base` | ❌ by nature | Scena's player (correctly single-app) |

The two that mattered most were `entitlement-enforcement` and `flag-enforcement`.
Their job is *"every live entitlement is named by a gate, every quota is counted
against, and the reserved list is pinned so it cannot grow to cover an
oversight"* — the check that a capability a plan **sells** is actually
**enforced by a route**. Kova had it. Tessa and Scena sold entitlements with no
such check. That is the same class of hole `/api/progress` was, and it was found
in Kova only because Kova had the guard.

### What running them across three apps found — ✅ **DONE (2026-08-08)**

Kova came out clean. The other two did not, and every one of these was sold on a
plan page with nothing enforcing it:

| app | key | what it means |
|---|---|---|
| tessa | `catalogItems` | 50 free / unlimited paid, no count before the insert |
| scena | `tickerAdvanced` | `gateWidgets` checks `ticker` and never this — the advanced config a paid tier buys works on any tier with a ticker |
| scena | `boardsPerStation` | 1/2/6 per tier, no count when a board is attached |
| scena | `resyncIntervalSec` | **the number IS the product** — a paid workspace's screens are meant to re-fetch sooner, and the quota never reaches the player's fetch loop |
| scena | `screenSaver`, `emergencyOverride` | `true` on every tier, so no tier withholds them — a registry question, not a route one. `emergencyOverride` is deliberate and documented; `screenSaver` looks like the same decision without the argument |

They are carried in `KNOWN_UNENFORCED` with a reason each, and **the list can
only shrink**: an entry that becomes enforced fails the guard until it is
deleted, so it cannot rot into a permanent exemption. Fixing them is product work
in each app — counting rows before a write, plumbing a number to a device — and
doing five of those inside the commit that widened a test script is how a diff
becomes unreviewable.

Two more holes closed on the way. **Tessa's R2 bucket was never checked** by
`storage-chokepoint`: it provisions `tessa-media`, it has a `storage.ts`, and a
bare `MEDIA.put` anywhere in it would have passed in silence. And Tessa's `ai.ts`
was in neither the deciders nor the delegates list, so nothing checked that it
kept delegating the mock decision.

`api-door` is the mirror image of the first two: a rule that is genuinely
platform-wide — *one door to the API, so an expired session says so* — that was
written against one app's file paths. Kova's and Tessa's SPAs satisfy it today,
and **that is exactly why nobody noticed**: a check that passes because of a habit
rather than because of a rule is one refactor away from meaning nothing. An
unrecognised SPA is now a failure rather than a silent skip, and `@scena/player`
is exempt *in writing* — a paired device with no session has no 401 for a hook to
catch.

---

## Tier 4 — `apps/_template` is half a template — ✅ **DONE (2026-08-08)**

```
ls apps/_template                       # README package.json src test tsconfig vitest.config wrangler.jsonc
grep -c "app.route(" apps/_template/src/index.ts        # 5
grep -c "app.route(" apps/api/src/index.ts              # 44
```

This is the highest-leverage item in the document, because it is the one that
decides what app #5 costs.

~~**There is no SPA.**~~ ✅ `apps/_template-app` exists. The browser half —
`Shell`, `session`, `theme`, `screen.ts`, the admin console binding, the doors'
screens, `main.tsx`, the accent registry, the build config and five conformance
tests — was copied by hand from whichever existing app the author happened to
open, and **every UI divergence in this document arrived that way.**

What it carries is chosen by the same rule as the worker half: each file exists
because of a bug that shipped, and says so in its header.

| File | The defect it prevents |
|---|---|
| `screen.ts` | `pickScreen` as a PURE function. Inline in `main.tsx` it cannot be imported by a test — which is why two of its inputs (`gate.blocked`, `maintenance.level`) were declared and never read. |
| `theme.tsx` | `<ThemeProvider branding={null}>`. Every layer upstream worked and the value was discarded at the last line, so a tenant's branding form saved, said "Saved", and changed nothing. |
| `Shell.tsx` | `BottomTabs` is `md:hidden`, so an app that renders only it has **no navigation at all** above 768px. |
| `screens/Login.tsx` | The Turnstile widget. `turnstile.*` is shared config, so an operator turning the check on from any console had every reason to think sign-in was covered; two apps never rendered the widget, so no token existed and the control did nothing. |
| `screens/Blocked.tsx` | Rung two of the ladder, with both exits — the gate exempts `/api/tenant/close` at every rung, and a screen with no way out makes that exemption protect nothing. |
| `screens/Admin.tsx` | Nine shared panels mounted, and the note that rebuilding one fails `admin-panels.conformance.test.ts`. |
| `tones.ts` + `tokens.accents.css` | An unregistered tone resolves to an undefined custom property and a class Tailwind never emitted. The badge mounts, typechecks, and renders grey. |
| `styles.css` | The `@source` list. A missed workspace package renders with a SUBSET of its classes and nothing warns. |

⚠️ **And the three SPA guards now check it.** `api-door`, `motion-config` and
`ui-ownership` derive from `apps.json`, which the template is deliberately absent
from — so the one SPA every future app is copied from would have been the only
unchecked one in the repo. That is this document's own thesis, one level up.

**And the worker mounts five route trees out of the twelve the packages ship.**
It applies `NOTIFY_SCHEMA`, `STORAGE_SCHEMA` and `BILLING_SCHEMA`, then mounts:

| package route tree | in the template |
|---|---|
| package route tree | was | now |
|---|---|---|
| `domainRoutes` / `domainAdminRoutes` | ✅ | ✅ |
| `emailAdminRoutes`, `sharedConfigRoutes`, `maintenanceAdminRoutes` | ✅ | ✅ |
| `turnstileAdminRoutes` | ✅ (via `domain-routes.ts`) | ✅ |
| `notifyRoutes` | ❌ tables and `InboxDO` present, unreachable | ✅ |
| `mediaRoutes` | ❌ `STORAGE_SCHEMA` present, no upload/meter/read | ✅ |
| `staffRoutes` | ❌ no roster, no invite, no revoke | ✅ |
| `accountRoutes` | ❌ no self-delete | ✅ |
| `tenantCloseRoutes` | ❌ and "leaving is always allowed" is an invariant of the gate it already enforces | ✅ |
| `aiCatalogAdminRoutes` | ❌ | ✅ |
| `planAdminRoutes` | ❌ | ✅ |
| `bindBillingStore` | ❌ hand-written lookups instead | ✅ |
| `otpSendGuard` | ❌ | ✅ |

A new app copying this inherited the **exact** "mechanism with no surface" bug
`PLATFORM-GAPS.md` is about — pre-installed, seven ways over, in the file that is
supposed to be the answer to it.

**What was hand-written and is now the package's.** `entitlements.ts` carried its
own `tenantEntitlements` / `hasFeature` / `withinQuota`. They read correctly and
were the wrong thing to ship in a template, because a re-implementation does not
arrive with the three rules the package's versions carry: a failed D1 read is not
an answer (these caught it into `null`, which resolves to the free baseline — so
a transient failure silently downgrades a PAYING tenant), a retired plan must
still resolve, and the parking row's status is a decision rather than a default.

**And the mounts are now a GUARD rather than a checklist.**
`scripts/capability-reachable.test.mjs` fails on any app — the template
included — that applies a package's `SchemaModule` and never mounts its route
tree, and the template's integration suite probes every surface for a 404.
Running it across all four apps found the template's seven and confirmed the
other three are complete, with one deliberate divergence: Scena keeps its own
asset door because **its R2 key is the content hash**, which the shared routes
cannot issue.

⚠️ **The SPA half is still open, and it is the bigger one.**

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

### 2. Give Scena the three missing surfaces — ✅ **DONE (2026-08-08)**

- ~~**The bell.**~~ `NotificationBell` + `InboxScreen` bound in
  `apps/scena-app/src/Notifications.tsx`, with a per-type icon map and a
  conformance test that checks it against the server registry **in both
  directions** and checks every `link` against the real route table. Which is how
  five dead links turned up: four types pointed at `/screens`, and the fleet
  lives at `/`.
- ~~**The gate.**~~ `HostInfo` is `KitHostInfo<WorkspaceBrand>` now instead of a
  four-field re-declaration that silently dropped `gate` and `maintenance`;
  `Shell.tsx` renders `MaintenanceBanner` + `WorkspacePausedBanner`, and
  `WorkspaceBlocked` replaces the app on the blocked rung. Tessa got the same
  through `pickScreen`, extracted to `screen.ts` and unit-tested.
- ~~**The console.**~~ `PlatformStripeSection` + `PlatformAiSection` + a new
  `ScenaSettingsTab` for what is genuinely Scena's, with
  `admin-panels.conformance.test.ts` so it stays swapped — and two new entries in
  `SHARED_ADMIN_ENDPOINTS` for the AI catalog routes, mutation-tested.

**It cost more than a swap, and the overrun is the finding.** Mounting the shared
Stripe panel needed endpoints Scena did not have, which is how the three
`/admin/stripe/*` route trees came to be compared side by side — see the Tier 2
entry above for the table and for Tessa's live-switch payments outage. They are
`@4dl/billing`'s `stripeAdminRoutes` now.

### 3. Make the guards derive their app list — ✅ **DONE (2026-08-08)**

All four ported, and they did fail on first run — see the Tier 3 findings table
above for the six unenforced keys and the two uncovered Tessa surfaces.

What each one derives, and the seam it hangs on:

- `entitlement-enforcement` — the app list from `apps.json` (`provision.d1`: an
  app with no database sells nothing), and the registry inside each app from the
  one call every one of them makes, `bindEntitlements<T>(BASELINE)`. Kova's is in
  `packages/domain`, the other two keep theirs in `src/`, and following each
  app's workspace dependencies finds both without naming either.
- `flag-enforcement` — the customer rail is **detected**, not assumed. An app
  declaring a `clientFlag` is checked; an app declaring none is *reported* as
  having no customer rail, which is the fact the old hardcoded path left
  unstated. If NO app declares one, that is a failure: it is far more likely the
  parser stopped finding the registry than that every rail was removed.
- `storage-chokepoint` — R2 owners from `provision.r2`, and every product app's
  `ai.ts` in the deciders list or the delegates list, so a fourth app is in one
  or the other the day it exists.
- `api-door` — every `spa` in the registry, with an explicit per-SPA rule; an
  unrecognised one fails.

Two lessons worth keeping. **The narrow check is the one that gets waived**:
matching Kova's five gate shapes reported eight of Scena's entitlements as
ungated and every one of them was gated — a destructured `Features` object and a
dynamic `features[needed]` lookup are invisible to call-shape matching, and a
guard that cries wolf eight times is off within a day. And **a widened guard
finds bugs in itself first**: two of the first failures were the parser's, not
the apps' — Kova passes a second argument to `bindEntitlements`, and Tessa writes
its whole baseline on one line.

### 4. Finish the template — *this is what makes app #5 cheap*

Two halves, **both done (2026-08-08).**

- ~~**Worker:**~~ ✅ All twelve trees mounted — `otpSendGuard`, `staffRoutes`,
  `mediaRoutes`, `notifyRoutes`, `tenantCloseRoutes`, `accountRoutes`,
  `planAdminRoutes`, `aiCatalogAdminRoutes` — plus `bindBillingStore` replacing
  three hand-written D1 lookups, and the supporting files each needed
  (`notifications.ts`, `action-otp.ts`, `billing-store.ts`, and the four route
  bindings). 17 → 20 tests.

  The part worth keeping is not the mounts, it is that **they stopped being a
  checklist.** `scripts/capability-reachable.test.mjs` (in `pnpm gate`) fails on
  any app that applies a package's `SchemaModule` and never mounts its route
  tree, and it reads `apps.json` plus the template — so app #5 is asked the same
  question the day it is registered. It found the template's seven immediately
  and confirmed the other three products are complete.

  Two things about writing that guard are worth carrying forward, because both
  made it pass while checking nothing. It first read `index.ts` alone and
  reported four FALSE failures — Kova binds `emailAdminRoutes` in
  `billing-routes.ts`, Scena binds `staffRoutes` in `member-routes.ts`, and both
  are correct. And once widened to the whole `src`, a rename to
  `notifyRoutesXX` still passed twice: once because `includes` matches
  substrings, and once because `notifications.ts` mentions `notifyRoutes` **in a
  comment**. A guard that matches its own documentation of a feature verifies
  only that the feature was once described.

- ~~**`apps/_template-app`:**~~ ✅ Shipped. 15 files, 19 tests, and the worker's
  `assets` binding now points at it — with the turbo edge declared by hand,
  because an `assets.directory` is a filesystem path rather than a package
  dependency and a missing build makes a Miniflare suite report **"no tests"**,
  which reads as a pass.

  Two things worth knowing. `ui-ownership` picked the new SPA up on its own
  (it derives from the presence of a `vite.config`, which is the better
  derivation); the other three had to be told, and that asymmetry is the
  argument for deriving from a FACT rather than from a list wherever there is
  one. And the `save-lifecycle` lint fired on the new `Records.tsx` — correctly,
  because an earlier draft of its header QUOTED both anti-patterns literally. A
  rule that scans source cannot tell a warning about a shape from a use of it;
  the fix is to describe rather than to exempt, since exempting the file would
  have turned the check off for the screen that demonstrates it.

### 4b. The money path — ✅ **DONE (2026-08-08)**

Independent of the `BILLING_SCHEMA` reconciliation in step 5, and higher
priority than it, because these are the findings with money behind them. All
three landed; what each turned up on the way is worth recording:

1. ~~**Add `charge.refunded` + `charge.dispute.created` to Tessa and Scena.**~~
   **DONE**, and it went further than adding two cases: the maths itself was
   Kova's, so `reverseChargedCredits` moved into `@4dl/billing` with the
   metadata prefix injected, and Kova now calls the shared one. An extraction is
   a move — the app kept only the sentence its owner reads, because notification
   copy is a registry and never a package's.

   `packages/billing/test/reversal.test.ts` is 9 tests, and the one that earns
   its keep is *"is INCREMENTAL — a second partial refund takes only the
   difference"*: Stripe re-sends `amount_refunded` **cumulative**, so the obvious
   implementation reverses twice for a customer owed one reversal.

2. ~~**Put Scena's reconciler on `syncStripeSubscription`**, or … add the
   `LADDER_OWNED` exclusion and the stale-sub guard.~~ **DONE — the second
   option**, because `BILLING_SCHEMA`'s column shapes still block the first.

   The clamp went into `updateSubscription` as an OPTIONAL SQL condition rather
   than a check above the call site, and that placement is the point: the
   function is a read-modify-write, so a guard in the handler would race the
   lifecycle sweep it exists to protect. Three tests assert a `suspended`,
   `closing` and `canceled` workspace all survive an `invoice.paid`, one asserts
   that paying still clears `past_due` (the rung where paying IS the way out),
   and one pins `LADDER_OWNED` against the shared constant so Scena's guard and
   the other apps' cannot drift.

3. ~~**Ship a plans panel in `@4dl/admin`**~~ **DONE**, and the routes with it —
   `planAdminRoutes` in `@4dl/billing`, because the panel needs one contract and
   there were two shapes and one absence.

   Kova's editor moved; Tessa gained one it never had; Scena's was replaced and
   picked up the **grandfathering it did not have** — its old editor wrote the
   new entitlements and stopped, so tightening a tier took the capability away
   from every workspace already on it, and the help text described that as
   intended. Scena's routes stay hand-written (its `plans` table is still
   `price_cents`) but now speak the shared wire contract, so the day the columns
   are reconciled that block is deleted rather than rewritten.

   **`trialDays` is editable for the first time in any of them.** The panel is
   driven by the server's `quotaKeys`/`featureKeys` and their labels, so it
   carries no product vocabulary, and `featureMeta.group` lets Scena's nine
   catalog categories survive the move. Kova's `PlansConfig` is the right shape to move; Scena's
   `PlansTab` and Tessa's absence both resolve into it.

### 5. Retire Scena's duplicated paths — *largest code win, lowest urgency*

In this order, because each unblocks the next:

1. **`ai.ts` + `gemini.ts` → `@4dl/ai`'s `generate`.** ⚠️ **Partly BLOCKED, and
   the reason is worth writing down before somebody re-attempts it.** What was
   done instead, and why, is below.
2. **`BILLING_SCHEMA` reconciliation → `bindBillingStore`.** ✅ **DONE
   (2026-08-09)** — 5.2 below.
3. **The dunning ladder** onto `DUNNING_DAYS` + `dailySweep`, which falls out of
   (2) nearly for free. Still open, and (2) narrowed it: the timestamps are now
   ISO on both sides, so what is left is a genuine PRODUCT question rather than a
   representation one. Scena's ladder is two rungs read from
   `billing.grace_days` / `billing.delete_days` in `app_config`; the shared
   `DUNNING_DAYS` is three fixed ones (7 read-only / 30 blocked / 37 purge).
   Adopting it removes an operator-configurable setting, so decide that before
   writing the code.
4. **Decide what a platform promo code is** — a discount (Kova) or a grant
   (Scena) — then put the winner in `@4dl/billing` and migrate the loser. This
   is a product decision before it is an extraction.

#### 5.1 The AI lane — what moved, what cannot, and the money it was losing — ✅ **DONE (2026-08-08)**

**Two of the four lanes cannot take the shared path, and both reasons are
structural rather than effort:**

- **Image.** `@4dl/ai`'s `generateImage` writes through `putMedia` and returns a
  tenant-prefixed media KEY. Scena's R2 key is the **content hash** — the
  compiled manifest references an asset by hash, the player caches
  `/api/assets/<hash>` immutably for months offline, and `library_tracks` is a
  platform-wide catalog every workspace draws from. Adopting the shared writer
  breaks all three. (Same reason `mediaRoutes` is in `capability-reachable`'s
  `KNOWN_UNMOUNTED`.)
- **Music.** The package has no `generateMusic` at all. Lyria bills per SONG
  rather than per second, which is a third metering shape.

So the wholesale replacement is not available, and pretending otherwise would
have produced a rewrite wearing an extraction's clothes — which the contribution
rules forbid for good reason.

**What DID move is the arithmetic, and measuring it found four defects that were
losing money on every generation.** `settle` caps the charge at the reserve, so
a reserve that lands under the real usage is revenue the platform silently
absorbs. There is no failing request, no log line, and no screen that looks
wrong.

| defect | measured |
|---|---|
| **The output cap disagreed with itself** | The run asked Gemini for **32,768** output tokens on a slide; the reserve budgeted **8,000**. Four-fold under-reserve on the most-used lane in the product. |
| **The system prompt was not counted** | A flat `+200` tokens stood in for `SLIDE_SYSTEM` (3,207 chars ≈ 1,283 tokens) and `+1500` for `layoutSystem()` (6,875 chars, most of it `describeWidgets(WIDGET_REGISTRY)` at 4,334). |
| **Four chars per token** | The English average, used as a bound. Arabic runs nearer two. `@4dl/ai` uses 2.5. |
| **No thinking budget** | Gemini 2.5+ bills `thoughtsTokenCount` at the output rate from a budget the request does not cap. |

The last three are `@4dl/ai`'s `estimateUsage`, which the token lanes now
delegate to. The unit-metered lanes (tts per character, image per tile, music per
second) stay Scena's: they are not token estimates, and the shapes do not
correspond.

⚠️ **And the settle side had the same bug.** A streaming response that reports no
usage used to fall back to `chars / 4`. It falls back to the RESERVE now, which
is the conservative direction: the reserve is the worst case the workspace
already had held, so charging it can never exceed what they agreed to.

**The fix is a SHAPE, not a test, and that distinction was earned.** The first
attempt was `outputCap()` plus a delegated estimator, with unit tests on each.
A mutation restoring the original defect — the system prompt replaced with `""`
inside `generate` — **passed every one of them**, because the tests called the
estimator directly and supplied a system prompt themselves. Two correct halves
and no assertion on the join, which is exactly what the defect was.

`planRun(req, provider, brief)` returns the system prompt **and** the reserve it
implies, from one call. The caller cannot hand a different text to each. The same
mutation now fails four assertions; a drifting cap fails one; restoring chars/4
fails five.

---

#### 5.2 The billing store — a column collision, and the outage it was hiding — ✅ **DONE (2026-08-09)**

Four tables shared a NAME with `@4dl/billing`'s and differed in COLUMNS:
`price_cents` + `currency` + `interval` against `price_usd_month`, `sort`
against `ord`, `created_at` against `at`, and — the one that mattered — five
subscription timestamps holding **epoch milliseconds** where the shared shape
holds **ISO-8601 text**.

**The migration is `apps/scena/src/billing-reconcile.ts`, and three decisions in
it are the whole of the work.**

⚠️ **It runs BEFORE `applySchema`, and that ordering is the difference between a
migration and an outage.** `BILLING_SCHEMA` declares `CREATE INDEX … ON
credit_ledger(tenant_id, at)`. On a pre-migration database that column is
`created_at`, so the index fails with `no such column: at`, the whole `db.exec`
throws, `applySchema` throws with it, and **every route that touches D1 answers
500** — not a degraded feature, a total outage, on precisely the databases this
migration exists for. It is `AI_LEGACY_RESET`'s failure one table over, and the
second time this repo has met it.

**It is a FUNCTION, not a `SchemaModule`.** Every statement names a column that
exists on exactly one of the two shapes, so as a declarative `backfill` each
would fail to *parse* on a database created after the migration — swallowed with
a warning, ten alarming lines on every fresh deploy and every test isolate about
columns that are correctly absent. Noise that is expected is noise nobody reads.
Reading `pragma_table_info` first makes each step a decision instead of an
attempt, and costs four small reads once per isolate.

**The timestamps are the half that would have failed silently and expensively.**
SQLite types are per-value, so a millisecond integer sits happily in a
TEXT-declared column. Then `sub.past_due_at + graceMs` is string CONCATENATION
and `past_due_at < ?` compares a number against ISO text. A workspace is either
never suspended or suspended the instant it goes past due, nothing throws, and
the only symptom is a support ticket a month later.
`apps/scena/test/billing-reconcile.test.ts` asserts the converted value is the
same **bytes** `toISOString` writes, because the SQL comparison is
lexicographic — a format that merely parses is a ladder that fires on the wrong
day.

**What came along, and what it was costing to keep:**

| Adopted | What Scena's copy did instead |
|---|---|
| `bindBillingStore`'s version-stamped seed | `INSERT OR IGNORE` — a no-op on any database that had booted once, so every price, rename and entitlement edit since launch reached fresh deployments and no live one |
| `planAdminRoutes` | two hand-written handlers translating dollars↔cents, whose own comment said they would be deleted rather than rewritten the day the columns moved |
| `@4dl/billing`'s `syncCatalog` | ~60 lines that never pushed a plan RENAME to Stripe (so a renamed tier kept its old name on every invoice forever) and let one stale id abort the entire sync with an information-free 500 |

`upsertPlan`, `setPlanStripe` and `setPackStripe` went with their callers.
`currency` and `interval` were dropped rather than migrated — every Scena plan
was always `usd`/`month`. The legacy COLUMNS are left in place on a migrated
database: nothing reads them, and `DROP COLUMN` on a live table to reclaim four
bytes a row is a risk taken for tidiness.

**And the guard grew two rules, which immediately found a third instance of the
Tier-1 shape.** `capability-reachable.test.mjs` now asks every app that applies
`BILLING_SCHEMA` for `planAdminRoutes` **and** `stripeAdminRoutes`.
**`apps/_template` had the first and not the second**: schema applied, a plan
catalog an operator could price, and no route anywhere to enter a secret key —
so `@4dl/admin`'s Stripe panel 404'd and every app copied from the template
inherited a product that could not be sold.

Strengthening the guard to see that exposed two defects in the guard itself,
both worth knowing:

- **An import satisfied the match.** The search runs over the app's whole `src`
  (a tree is often mounted outside `index.ts`), so `import { fooRoutes }` alone
  read as mounted. Imports are stripped now, and an ALIASED import is resolved
  (Scena mounts `staffRoutes as sharedStaffRoutes`) so the strictness does not
  become a false accusation.
- **The comment stripper was fooled by a string.** `"/api/auth/*"` was read as
  the start of a block comment, swallowing ninety lines of Kova's route mounts.
  Invisible for as long as imports counted; the moment they stopped, the guard
  accused Kova of never mounting its inbox. It is a character scanner now.

All four reconciler behaviours and all three guard rules are mutation-tested.

---

### 6. The standing items neither app has resolved

- **Widen `save-lifecycle`**, and first make it see `apiFetch`-shaped calls so it
  is not vacuous in Scena. Then fix Kova's six and Scena's swallowed writes.
- **Decide Scena's offline story**, either way, in writing — Tessa's
  `vite.config.ts` is the model for how to decline.
- **`@4dl/i18n` has one consumer out of three.** Kova's ~500 hard-coded strings
  remain product work, not platform work, and half-doing it is worse than not.
  Scena is the cheaper of the two and would make the package's seam real.
- **`@4dl/i18n` has no boundary test** — the only `@4dl/*` package without one.
- **A LIVE Stripe key check.** `/admin/stripe/status` reports what is stored and
  deliberately never touches the network, so a key that is present, in the right
  lane and **revoked** looks identical to a working one in every field it
  returns. Scena had a `GET /v1/account` ping for exactly this; it was deleted
  with the panel that called it rather than kept, because an endpoint with no
  caller is the defect this document catalogues, not an exception to it. The idea
  belongs in `stripeAdminRoutes` with a button in `PlatformStripeSection`, where
  all three apps would get it — roughly 25 lines, and the only reason it is on
  this list rather than in the diff is that it is a new capability rather than a
  consolidation.

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
