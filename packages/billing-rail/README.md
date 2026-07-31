# @4dl/billing-rail

One Stripe account, many 4DL apps.

| Module | What it is |
|---|---|
| `routing.ts` | **Pure.** Which app does this event belong to — and a refusal when the answer is not certain. |
| `dispatch.ts` | Verify once, attribute, deliver. Three outcomes, and they must not be collapsed. |
| `catalog.ts` | The account's products, grouped by owning app, with the unclaimed ones called out. |
| `schema.ts` | `rail_parked_events` — the dead letter queue. |

## The bug this exists to prevent

Kova's platform webhook handler is a switch over `event.type` whose branches are
guarded like `if (meta.kova_pack && meta.kova_credits && meta.kova_tenant)`.

An event carrying a *different* app's metadata matches nothing, falls out of the
switch, and the endpoint answers `200 {received: true}` — with the event id
already claimed in the idempotency table, so **Stripe never retries**. Money
captured, nothing granted, no signal anywhere.

That is completely harmless while one app owns the account, which is precisely
why it would have shipped and stayed. The second app turns it into silent
revenue loss with no alert and no trail.

## Three outcomes

| | HTTP | Why |
|---|---|---|
| routed, handled | 200 | ordinary |
| routed, handler threw | **500**, claim released | a transient D1/DO failure is a problem *retrying solves*. Stripe redelivers and it processes cleanly. |
| **unroutable** | **200 + a parked row** | not 500, because no retry can fix an event whose app we do not know — Stripe would hammer it for days and give up. Not a bare 200, because that is the silent drop above. |

The distinction that matters is the last two against each other. An
unattributable event is a problem only a human solves, and pretending a retry
will fix it buries it.

The parked row keeps the **payload**, and attribution runs *before* the
idempotency claim — so a replay after the cause is fixed is not swallowed as a
duplicate. That ordering is load-bearing.

## Four ways an object names its app, in order

1. **`metadata.app`** — the contract going forward. Explicit, greppable, and
   filterable in Stripe's own dashboard (`metadata['app']:'kova'`).
2. **A legacy `<prefix>_*` key** — `kova_tenant`, `kova_plan`. This is what live
   objects already carry: `@4dl/billing`'s `StripeBranding.metadataPrefix`
   generates them, and its own doc comment calls it live data that can never
   change. Without inference, every subscription created before this package
   existed becomes unroutable on the day it ships.
3. **`claims`** — "is this mine?", asked only when metadata names *nobody*. Not
   optional politeness: Kova resolves several event types by Stripe customer id
   (`invoice.paid` falls back to `tenantByCustomer`), so a metadata-only rail
   would have parked events that work correctly today.
4. Nothing → parked.

**A claim resolves silence, never disagreement.** It is deliberately not
consulted for `unknown-app` or `ambiguous`, because a database lookup that
overrules an explicit tag is how a payment reaches the wrong tenant.

And when two apps both name themselves, that is not a tie to break — it is a
corrupted object, and guessing either way risks crediting the wrong tenant. It
parks.

## The catalog

`readCatalog` groups the account's products by owning app and separates the ones
**nothing claims**. That second list is the useful one, and it is useful before a
second app exists: untagged products are exactly the ones whose payments will
park. It is the pre-flight check for adding an app to an account that already has
one.

`classifyProduct` uses the same precedence as `resolveApp`, so the console's
answer and the webhook's answer cannot disagree.

`tagProduct` writes `metadata.app` onto a product that only has the legacy keys.
Additive — Stripe merges metadata on update, so the prefixed keys the existing
handlers read stay exactly where they are, and a rollback changes nothing.

## What did NOT move, and why

**The balance.** Credits live in `TenantBillingDO` — a Durable Object, per app,
with reserve → run → settle wrapped around each metered call. Putting that behind
a network hop would make every AI generation a cross-worker round trip on the hot
path, and would replace the DO's single-writer consistency with distributed
locking you would have to build. The rail routes; the ledger stays where the
spend happens.

**The Connect rail.** `/connect/webhook` attributes by connected-account id
(`event.account`), which is a different and already-correct mechanism. Routing it
through here would add a hop and no safety.

## Boundary

Empty ALLOW list. `RailApp` carries a slug and a legacy metadata prefix and
nothing else — the app list is injected precisely so that hardcoding the first
product's name here does not put it in the router every other product has to pass
through.
