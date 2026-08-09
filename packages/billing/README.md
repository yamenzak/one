# @4dl/billing

What the platform charges a tenant, and what that buys them.

| Module | What it is |
|---|---|
| `entitlements.ts` | The engine: resolve a plan blob, merge a per-tenant override, clamp on suspension, snapshot a downgrade. Generic over the app's quota/feature keys. |
| `credits.ts` | Credit economics. Meters on **neurons**, so gross margin is identical for every model and `markup` is the only lever. |
| `credit-do.ts` | `CreditLedgerDO` — the per-tenant Durable Object that is the authoritative balance. |
| `stripe.ts` | Lane config (test/live + mismatch detection), webhook signature verification, catalog sync, customer creation. |
| `dunning.ts` | The ladder: 7 days → read-only, 30 → blocked, 37 → purged. |
| `store.ts` | The catalog STORE: version-stamped seeding, the plan/pack reads, subscription resolution and the two ceilings. The catalog's *contents* are injected. |
| `plan-admin-routes.ts` | The plan catalog's OPERATOR routes — read the catalog with its key registry, edit a plan. `@4dl/admin`'s `PlatformPlansSection` is the surface. |
| `stripe-admin-routes.ts` | The Stripe lane's OPERATOR routes — status, credentials, catalog sync + the price rebuild. `@4dl/admin`'s `PlatformStripeSection` is the surface. The catalog TABLES are the app's, so `syncCatalog` and `clearCatalogIds` are injected. |
| `schema.ts` | `plans`, `subscriptions`, `credit_packs`, `credit_ledger`, `stripe_events`. |

Two entry points: **`@4dl/billing`** for the worker, **`@4dl/billing/model`** for
the browser (credits, entitlements, dunning — all pure; a UI needs all three to
price a top-up, decide whether a feature is bought, and tell an owner how long
they have).

## Three things that will cost real money if you get them wrong

**The DO's class name is load-bearing.** Wrangler's `migrations` bind a class
NAME to durable storage, and every tenant's balance lives under that binding. An
app subclasses `CreditLedgerDO`, implements `mirror`, and re-exports under
whatever name its migration already declared. Kova's is `TenantBillingDO` and
must stay that — renaming it comes up empty and silently puts every tenant at
zero.

**`settle` is capped at the hold and idempotent.** The charge can never exceed
what `reserve` held, so real usage that overruns the estimate cannot push a
tenant past what was reserved — the platform absorbs the overrun and *logs it*,
because a cap that fires silently is margin leaking with no signal. And a settle
against a missing hold is a no-op, so a retried or replayed request never debits
twice.

**Spending drains `granted` before `purchased`.** Purchased credits never
expire; the monthly grant is overwritten (not added) each period, so it lapses.
Draining in the other order would let a periodic reset confiscate units a tenant
paid for. This is not a rounding detail.

## Stripe metadata is live data

```ts
export const STRIPE_BRANDING: StripeBranding = { metadataPrefix: "kova", productPrefix: "Kova" };
```

`metadataPrefix` becomes `metadata[<prefix>_tenant]` on every customer, checkout
session and subscription, and the **webhook handlers read those keys back** to
decide which tenant a payment belongs to. It is a join key, not a label. Changing
it on a deployment that already has customers orphans all of them: events keep
arriving, the lookup finds nothing, and payments succeed while nothing is
activated. Pick it once, at the start.

`productPrefix` is cosmetic — it is what the buyer sees on their receipt.

## Entitlements

```ts
const engine = bindEntitlements<Entitlements>(FREE_ENTITLEMENTS, { suspendedStatuses: SUSPENDED_STATUSES })
```

The baseline doubles as the **key registry**: a quota or feature absent from it
does not exist, which is what makes every merge fail closed. Three rules, all
pointing the same way:

- **Resolution coerces by type.** A feature is enabled only by a literal `true`,
  a quota only by a finite number, so `"aiSuite": 1` in operator-edited JSON
  cannot switch on a paid capability.
- **Overrides are grant-only.** They raise and enable, never lower or disable —
  so gifting is always safe and a plan edit can never bite a tenant through their
  own override blob.
- **A suspended status clamps to free**, applied once at resolution, so every
  gate inherits it. This is the single place delinquency bites capability.

`quotas` and `features` are typed `object` rather than `Record<string, …>` on
purpose: a TypeScript *interface* has no implicit index signature, so an app
declaring `interface Quotas { staffSeats: number }` — which is what you want, for
autocomplete and typo protection — would not satisfy a Record constraint. The
engine narrows internally; the app keeps precise types at every call site.

## `store.ts` — the catalog's SHAPE, not its contents

The line, and it is not "billing is shared":

> **The catalog's CONTENTS are the product's. Its SHAPE is not.**

One app sells a four-rung ladder because a solo trainer and a twelve-coach studio
are different businesses; the other sells one plan because a practice with three
treatment rooms and one with eight are not. That stays in the app as a
`CatalogSeed`. What both then need — the ordered active-only list, the by-id
lookup that must still resolve a retired tier, the version-stamped migration, the
entitlement merge, the two ceilings, the ledger mirror — was written twice,
near-identically, across 817 lines with 11 of 13 exports sharing a name.

```ts
const store = bindBillingStore<Entitlements>({
  entitlements,                                  // the engine, already bound
  catalog: { plans, retired, packs, version },   // the product's decisions
  defaultSubscription: { plan_id, status },      // what a tenant holds before a row exists
  materialiseOnRead,                             // whether a read WRITES that row
})
```

**Both seams exist because the apps genuinely differ, not to be configurable.**
Kova's default is `free`/`active`; Tessa's is `free`/`incomplete`, because its
gate needs "never chose a plan" apart from "cancelled" — nothing was taken from
the first and there is no arrears to settle, so the copy cannot be shared.
Kova materialises the row from its `/api/context` hot path; Tessa writes it once
at tenant creation. Hard-coding either silently re-gates the other's tenants.

**Three rules in `applyPlanCatalog`, and each is silent when broken:**

1. A **price change NULLS the Stripe id pair** before writing the new price.
   `syncCatalog` skips any plan that already has a `stripe_price_id`, so without
   this a repriced plan keeps charging the OLD amount forever.
2. **Live plans reconcile in full** — name, price, entitlements, `ord`, `active`.
   `active` is bound from the seed rather than hard-coded to 1, because one app
   carries a row at `active: 0` in this list.
3. **Retired plans are only deactivated.** Never their entitlements or price: a
   grandfathered tenant keeps what they were sold, and one of the real retired
   tiers has a storage ceiling 2.5× the current one. Nobody is migrated off a
   retired tier by this code.

**A failed read is not an answer.** `getPlan` and `readSubscription` let a D1
error propagate rather than catching it into `null`. The two apps disagreed and
one was wrong: `null` means "no such plan", which resolves to the free baseline,
so laundering a transient failure into it silently downgrades a *paying* tenant
and shows them the finish-setting-up gate. A 500 is visible and retried.

## What has NOT moved

The **customer-facing route trees** — checkout, the webhook listener, the
downgrade flow — are still each app's. Their handlers are woven through product
authorization and the app's notification registry; only the reconciliation logic
moved (`webhook.ts`, below). See PLATFORM.md's contribution rules before moving
one.

The **OPERATOR** routes are a different case and both have now moved
(`plan-admin-routes.ts`, `stripe-admin-routes.ts`). The test is whether the
handler reads a product registry. A plan editor and a Stripe credential form
read neither — they speak `@4dl/admin`'s wire contract, which is identical in
every app — and leaving them behind is what produced three copies that had
drifted: one with a mode-flip catalog swap and two without, one with a price
rebuild and two without, one app with no credential screen at all. What each app
still supplies is the part a package cannot know: which TABLES hold its catalog.

## Stripe's operator routes, and the one thing they cannot own

`stripeAdminRoutes` owns the credential model whole — two lanes stored at once,
prefix validation per slot, the refusal of a mode whose active keys belong to the
other lane, the per-lane catalog swap on a flip. Those are facts about Stripe.

`syncCatalog` and `clearCatalogIds` are injected because the catalog TABLE need
not be this package's: `store.ts` reads `price_usd_month`, and an app that
predates the platform may read something else. Scena did — `price_cents` +
`currency` + `interval` — for four stages, which is exactly what the seam is for:
an app adopts the ROUTES long before it can afford the data migration that lets
it adopt the store. All three apps pass the package's own `syncCatalog` through
today; the seam stays because app #5 will not, on day one.

`clearCatalogIds` is **optional, and its absence is a refusal** — a rebuild
request in an app with no rebuild path answers 400 rather than reporting "0
rebuilt", which an operator would read as "nothing needed rebuilding".

## Boundary

Empty ALLOW list. The last thing to leave was the Stripe metadata prefix
described above — the one leak in this package that was live data rather than a
display string.

## `webhook.ts` — the reconciliation, not the reaction

A provider webhook handler is two things wearing one coat, and Kova's had them
interleaved across 1,556 lines.

**Reconciliation** reads a provider payload against our own row: event
idempotency, the shape of an id, which subscription an invoice belongs to,
whether an incoming status may overwrite the one we hold, how much of a refund
reverses how many credits. None of it knows what the app sells. That is here.

**Reaction** decides what to TELL people and what to GRANT them. That is the
app's registry, and it stayed there.

Two things in this module are subtle and both were learned the hard way:

`invoiceSubscriptionId` reads **three** places. Stripe's Basil API version
(2025-03-31+) moved `subscription` off the invoice root onto the line items, and
webhook payloads render at the **endpoint's** dashboard API version — not the one
this code pins for its own requests. Reading only the root silently produced
`null` on a real account.

`LADDER_OWNED` is why a payment webhook cannot stall a dunning ladder. Every rung
selects on the previous rung's status, and Stripe's retries exhaust around day 21
and flip the subscription to `unpaid` — squarely between the 7-day and 30-day
rungs. Writing that unconditionally overwrote `suspended`, the ladder stalled at
read-only forever, and it failed SAFE and therefore silently. Read its comment
before touching the status switch.

`reverseChargedCredits` is the other half of the money path, and it was in one
app out of three. A refunded credit pack must have its credits clawed back, and
three things make that harder than subtracting the pack: a PARTIAL refund is
proportional and clamped, every event carries the CUMULATIVE `amount_refunded`
(so the obvious implementation double-charges on the second partial refund —
`creditsAlreadyReversed` reads the ledger back by charge id and takes only the
difference), and a DISPUTE is not a charge (no customer, empty metadata, so the
underlying charge is fetched first — and that lookup throws rather than
returning empty, which is what makes an unattributable chargeback redelivered
rather than silently dropped). It returns the outcome instead of notifying,
because the sentence an owner reads is the app's registry.

**The subscription route trees did NOT move.** Both rails' handlers are woven through the
app's notification registry, its entitlement gates and its row-level scope
(`requireClientAccess`), and the `@4dl/tenancy` route seam would carry them only
after each of those became an injection too. That is a larger design job than
this one, on the one path where a mistake costs real money, and it is not started
rather than half-done.

The PLAN CATALOG's admin routes are the exception, and the exception proves the
rule: they touch no notification registry, no entitlement gate and no row-level
scope — only the console gate, which is already an injection everywhere else.
Three rules travelled with them, each invisible until it costs something: the
Stripe-id null-out on a reprice, the `snapshotDowngrade` grandfathering, and an
omitted `trialDays` meaning "leave it alone". Before the move, one app had all
three, one had none of them because it had no plan editor at all, and one had an
editor without the grandfathering — so tightening a tier stripped capability
from every live tenant on it.
