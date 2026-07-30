# @4dl/billing

What the platform charges a tenant, and what that buys them.

| Module | What it is |
|---|---|
| `entitlements.ts` | The engine: resolve a plan blob, merge a per-tenant override, clamp on suspension, snapshot a downgrade. Generic over the app's quota/feature keys. |
| `credits.ts` | Credit economics. Meters on **neurons**, so gross margin is identical for every model and `markup` is the only lever. |
| `credit-do.ts` | `CreditLedgerDO` — the per-tenant Durable Object that is the authoritative balance. |
| `stripe.ts` | Lane config (test/live + mismatch detection), webhook signature verification, catalog sync, customer creation. |
| `dunning.ts` | The ladder: 7 days → read-only, 30 → blocked, 37 → purged. |
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

## What has NOT moved yet

`stripe-routes.ts`, `billing-routes.ts` and `downgrade-routes.ts` are still in
`apps/api`. They mix two rails: the **platform rail** (we bill tenants) belongs
here, and the **Connect rail** (a tenant bills its own customers) belongs to
`@4dl/commerce`, which does not exist until Stage 4. Splitting a 1,500-line route
file down the middle before its other half has a home is how you get a package
that owns half a flow. They move in Stage 4.

## Boundary

Empty ALLOW list. The last thing to leave was the Stripe metadata prefix
described above — the one leak in this package that was live data rather than a
display string.
