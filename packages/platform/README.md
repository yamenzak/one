# @4dl/platform — a holding pen, not a destination

**This package is being dissolved.** It was the right first cut — "the bits that
are obviously not Kova's" — and the wrong final shape: it grouped modules by *not
belonging to the app* rather than by *what they are*, so it accumulated tenancy,
metering, discount math and an AI test lane under one name that describes none of
them.

Three modules remain, each waiting for the package that will own it:

| Module | What it is | Goes to |
| --- | --- | --- |
| `credits` | AI credit metering. Meters on **neurons**, so gross margin is identical for every model and `markup` is the only lever. | `@4dl/billing` — Stage 3 |
| `promo` | Website-native discount math — percent or fixed, scoped to a package and/or a buyer. No Stripe coupon objects are ever created. | `@4dl/commerce` — Stage 4 |
| `ai-mock` | The mock-lane decision. The environment gate is the OUTER condition, so no admin toggle can make production fabricate output and bill for it. | `@4dl/ai` — Stage 5 |

When the last one leaves, delete the package. See
[docs/PLATFORM-EXTRACTION.md](../../docs/PLATFORM-EXTRACTION.md).

## What already left

`hosts`, `dcv` and `standing` went to **`@4dl/tenancy`** in Stage 1, and the move
paid for a rename that had been outstanding since this package was created:
`StudioStanding` → `TenantStanding`, `studioStandingOf` → `tenantStandingOf`,
`StandingFacts.studio` → `.tenant`, and `RESERVED_LABELS` stopped hard-coding the
first app's brand. A shared package that names a tenant a *studio* in its **type
names** forces every consuming app to adopt the word — which is why the boundary
checker (`@4dl/core/boundary`) now fails the build on it rather than trusting a
README.

## The lesson worth keeping

The original split test was: **a name belongs here if a second app could
plausibly import it.** That test is right, and it is not sufficient — it says
nothing about *which* package a name belongs in, so everything that passed it
ended up in one bag.

The rule that replaced it: **a package is named after what it does, and owns the
schema, routes and config for exactly that.** `@4dl/tenancy` owns addressing.
`@4dl/billing` will own money. Nothing owns "the leftovers".

The related call — that a module whose *machinery* is generic but whose
*registry* is the app's should stay with the app — still stands, but is now
resolved by injection rather than by leaving the module behind. `@4dl/tenancy`
takes its reserved labels and its status resolver as configuration; the registry
stays Kova's and the machinery is shared. That is the pattern every remaining
stage follows.
