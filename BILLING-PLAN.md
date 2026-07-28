# Billing Centralization — Design Plan

Status: **shipped** — all 8 slices implemented, tested, and pushed to
`claude/full-app-audit-fb3oya` (credits two-bucket, inline Stripe on both rails,
website-native promo codes, installments, redemption-code scoping, private-to-
client enforcement, and the billing UI). Full suite green: 151 domain / 118 API /
6 app / 7 protocol.

This is the same discipline we used for the registry refactor: map the ground
truth first, agree the target model, then implement in reviewable slices. Two
read-only audit passes established exactly what exists today; this plan turns
your requirements into a concrete build.

---

## 0. What exists today (ground truth)

### Platform rail — Kova → tenant (`billing-store.ts`, `billing-do.ts`, `stripe-routes.ts`)

- **Plans**: `plans` table, one `subscriptions` row per tenant (PK `tenant_id`),
  statuses `active/trialing/past_due/suspended/canceled/unpaid`. Dunning sweep in
  `index.ts` `dailySweep` (grace 7d → suspend, 30d → cancel→free). Solid.
- **Credits**: `TenantBillingDO` holds **one flat `balance` integer**. Credit
  packs (`topUp`) and the monthly grant (`grantMonthly`) both add into the *same*
  number. `grantMonthly` is a **floor top-up keyed by period** — it never resets,
  never expires. → **Everything effectively rolls over forever.** There is no
  purchased-vs-granted distinction.
- **Stripe**: 100% redirect — `checkout-plan` (subscription), `checkout-pack`
  (payment), Billing Portal. **Zero inline / PaymentIntent / Elements.**
  `publishable_key` is stored in config but unused. Keys live in `app_config`.

### Tenant rail — tenant → client (`commerce-routes.ts`, `stripe-routes.ts`, `session-routes.ts`)

- **Packages**: `one_time_price_cents`, `monthly_price_cents`, `installment_months`,
  `budgets_json`, `flags_json`, `visibility (private|marketplace|client_specific)`,
  `restricted_client_id`, `once_per_customer`. Soft-delete via `active=0`.
- **Access economy**: `budgets.ts` queue-not-sum engine, `expiresAt` derives days
  at read time, lazy status reconcile. Clean and reusable.
- **Client subscriptions**: `client_subscriptions` rows. Grant/purchase **extends
  in place (queues)** or spawns a parallel row for recurring.
- **Promo codes**: table has `discount_type (percent|amount)`, `percent_off`,
  `amount_off_cents`, `restricted_package_id`, `max_redemptions`. **INERT** — the
  create route doesn't even persist `restricted_package_id`, no per-client column
  exists, and **no checkout path ever applies a code.** Redemption count never moves.
- **Redemption codes**: add-days engine with a **well-built atomic guard**
  (per-client claim + guarded cap UPDATE + compensation). Scoping today: only
  `target_feature`, global `max_uses`, one-per-client.
- **Stripe (Connect)**: Standard connected accounts, hosted Checkout redirect,
  direct charges with optional `application_fee`. **No inline.**

### Gaps vs your target
| Requirement | Today |
| --- | --- |
| Granted credits don't roll over | ❌ single balance, all rolls over |
| Inline Stripe (both rails) | ❌ all redirect |
| Installments (limited-term) | ❌ schema stub, never charged |
| Website-native promo codes (%/fixed, per-client + per-package, both rails) | ❌ inert stub, no per-client col, no apply path |
| Redemption codes scoped to package/client | ⚠️ engine solid, scoping thin |
| Private-to-a-client packages | ⚠️ stored, **not enforced** (security gap) |
| Archive-never-delete | ✅ already holds |
| Marketplace-public packages | ✅ already holds |

---

## 1. Credits: two buckets (platform rail)

**Requirement:** purchased credits (packs) persist forever; plan-granted credits
do **not** roll over.

Split `TenantBillingDO` storage into two counters:

- `purchased` — credit packs, promos, admin top-ups. **Never expires.**
- `granted` — the monthly plan grant. **Reset (overwrite), not added.**

```
view()          → balance = purchased + granted ; available = balance − held
topUp(n)        → purchased += n                    // packs, promo, admin
grantMonthly(n, periodKey)
                → if grantKey === periodKey: no-op  // idempotent per month
                  else: grantKey = periodKey; granted = n   // RESET, use-it-or-lose-it
settle / charge → drain `granted` first, then `purchased`   // grant is use-it-or-lose-it
```

- Spend order **granted-first** is what makes "don't roll over" real: each month
  the unused grant is overwritten, but the tenant never loses a credit they paid for.
- **Migration is safe by construction:** on first load, an existing single
  `balance` becomes `purchased` (we never take away credits a tenant already has);
  `granted` starts at 0 and fills on the next grant. No tenant loses anything.
- `view()` returns the breakdown so the UI can show "1,240 purchased + 500 monthly".
- The cron (`dailySweep` step 1) and period-keying already exist — only the
  reset-vs-topUp semantics and the second counter are new.

---

## 2. Inline Stripe (both rails)

**Requirement:** "I always prefer inline Stripe." Feasible on **both** rails
without changing the merchant-of-record / liability model. Add `@stripe/stripe-js`
+ Payment Element to the app; keep raw-`fetch` `stripeCall` on the server.

### Platform rail (our own account)
- **Credit pack** → create a **PaymentIntent** (`amount`, metadata
  `kova_tenant/pack/credits`), return `client_secret`, confirm inline with Payment
  Element. Webhook `payment_intent.succeeded` → `topUp(purchased)`.
- **Plan subscription** → create Subscription `payment_behavior:
  default_incomplete`, expand `latest_invoice.payment_intent`, return its
  `client_secret`, confirm inline. Existing subscription webhooks unchanged.

### Tenant rail (Connect, Standard, direct charges — unchanged liability)
- Frontend loads Stripe.js as `Stripe(PLATFORM_PUBLISHABLE_KEY, { stripeAccount:
  connectedAccountId })` — this is the supported way to run **inline Elements for a
  direct charge** on a Standard account. Tenant stays merchant of record.
- **One-time** → PaymentIntent on the connected account (`Stripe-Account` header)
  with `application_fee_amount`. Confirm inline.
- **Subscription** → Subscription on the connected account,
  `payment_behavior: default_incomplete`, `application_fee_percent`, confirm the
  first invoice's PaymentIntent inline.
- **Installments** → a **Subscription Schedule** with a fixed number of iterations
  (N months) that completes itself — see §4.
- Hosted-Checkout routes stay as a **fallback** (nothing is ripped out until the
  inline path is proven).

---

## 3. Promo codes — website-native, both rails

**Requirement:** apply in our website (not Stripe promo objects), %/fixed, can be
exclusive to a **specific client** and/or a **specific package**, on both rails.

- **Schema**: reuse `promo_codes`; add `restricted_client_id`; add a rail
  discriminator (a platform promo has `tenant_id = NULL`, meaning Kova→tenant).
  `discount_type/percent_off/amount_off_cents/restricted_package_id/max_redemptions`
  already exist — wire the create route to actually persist package + client scope.
- **Apply (pure domain fn)** `applyPromo(amountCents, promo, ctx)`:
  validate active · not expired · `redemption_count < max_redemptions` · package
  matches · client matches → return `{ discountedCents, discountCents }`.
- **Where**: validated server-side **before** we create the PaymentIntent/first
  invoice; we charge the discounted amount ourselves (and scale the
  `application_fee` proportionally). `redemption_count` increments in the webhook on
  successful payment (atomic guarded UPDATE, same pattern as redemption codes).
- **Scope note (recurring):** website-native promos apply to **one-time charges,
  installment plans, and the first cycle of a subscription.** A perpetual
  every-cycle discount isn't expressible without a baked-in discounted price, so
  it's out of scope for v1 — flagged, not silently dropped.

---

## 4. Package pricing model — one-time / subscription / installments

Per package, exactly one pricing mode:

- **one_time** — single charge, grants the package's fixed budget runway.
- **subscription** — recurring monthly; each `invoice.paid` renews the runway
  (existing `renewClientSubscription` path).
- **installments** — a **limited-term subscription**: charge monthly for N months,
  then the schedule completes. Implemented as a Stripe **Subscription Schedule**
  with `iterations: N`.

**Recommended installment access semantics:** each paid installment unlocks its
share of the term (per-cycle grant, reusing the renewal path). Miss a payment and
access rides out what's already been paid — **no clawback of granted days.** This
is the fair, self-healing model and reuses the queue engine. (Alternative: grant
the whole runway on payment #1 and revoke on default — matches the "you bought the
whole thing" intuition but requires clawing back queued days the engine never
removes. I recommend against it.) → **decision needed, see below.**

---

## 5. Redemption codes — richer scoping

Keep the atomic engine as-is; extend scoping:

- add `restricted_client_id` (only that client may redeem) and
  `restricted_package_id` (redeemable only against / grants that package's
  features). Both optional; null = unrestricted.
- `target_feature`, `max_uses`, one-per-client, `expires_at` stay.
- Redemption codes remain a **tenant→client** primitive (they add *days*; the
  platform rail deals in *credits*, so a Kova→tenant redemption code is out of scope).

---

## 6. Package lifecycle — visibility & archive

- **visibility** `private` (grant-only, hidden from marketplace) ·
  `marketplace` (public storefront, already enforced) · `client_specific` +
  `restricted_client_id` (private to one client).
- **Fix the security gap:** enforce `restricted_client_id` at **grant and
  checkout** (today it's stored but never checked), and let `PATCH` update it.
- **Archive-never-delete** already holds (`active=0`). Archived packages: not
  purchasable, not in marketplace; **existing client subscriptions are honored.**

---

## 7. Client upgrade semantics (your open question)

> "can clients upgrade their package? do they get added benefits and days add up?"

**Recommendation — stack, don't replace:**

- **Days/budgets → add up (queue).** Buying another package while one is active
  extends the runway via the existing queue engine. Nothing is lost or overwritten.
- **Capabilities/flags → union.** The client gets the superset of every active
  package's flags for as long as any granting package is live (this already falls
  out of the entitlement ∩ client-flag intersection).
- **No proration, no swap primitive in v1.** "Upgrade" is just another purchase
  that queues behind the current runway. It's the least-surprising behavior and
  needs zero new engine work. → **confirm.**

---

## 8. Implementation slices (each independently reviewable & mergeable)

1. **Credits two-bucket** — `billing-do.ts` split + migration + `view()`
   breakdown + tests. (No UI, no Stripe.) Lowest risk, highest-value correctness fix.
2. **Inline platform rail** — PaymentIntent for packs + `default_incomplete`
   subscription, Payment Element in the app, webhook wiring. Hosted stays as fallback.
3. **Inline tenant rail** — connected-account PaymentIntent/Subscription inline +
   Payment Element with `stripeAccount`.
4. **Installments** — Subscription Schedule + per-cycle grant.
5. **Website-native promo codes** — schema, persist scope, `applyPromo` domain fn,
   checkout wiring, redemption-count guard, both rails. Domain-tested.
6. **Redemption code scoping** — add client/package restrictions.
7. **Package lifecycle** — enforce `restricted_client_id`, PATCH it, archive UX.
8. **UI** — credit breakdown, promo/redemption managers, package pricing-mode
   editor, inline checkout sheets.

Domain math (`applyPromo`, bucket spend order, installment grant) is pure and
unit-tested; the route/Stripe flows get Miniflare integration tests, matching the
repo's testing convention.

---

## Decisions (locked)

1. **Installments** — ✅ **per-cycle unlock**: each paid month unlocks its share of
   the term; miss a payment and access rides out what's paid; no clawback.
2. **Upgrade** — ✅ **stack days + union flags**, no proration.
3. **Promo scope** — ✅ **first-charge scope**: one-time, installment plans, and the
   first cycle of a subscription. No perpetual every-cycle discount in v1.
