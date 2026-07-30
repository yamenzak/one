# @4dl/commerce

A tenant selling **timed access to capabilities** to its own customers. The
second rail: `@4dl/billing` is what the platform charges a tenant; this is what a
tenant charges the people it serves.

| Module | What it is |
|---|---|
| `budgets.ts` | The access economy. Runways queue, never sum; days derive from `expiresAt` at read time. |
| `lapse.ts` | What happens to a customer whose access ran out — the tenant's own policy. |
| `promo.ts` | Website-native discount math. No provider coupon objects, ever. |
| `schema.ts` | `packages`, `client_subscriptions`, `redemption_codes`, `redemption_uses`, `promo_codes`, `addon_types`. |

Entry points: **`@4dl/commerce`** (adds the schema module), **`/model`** (budgets
+ promo), **`/lapse`** (on its own, so an app can wrap it with its own copy
without two star-exports colliding on one name).

## Three properties worth understanding before you change anything

**Purchases QUEUE, they do not sum.** Buying twice extends the runway rather than
pooling days. A new budget starts at `max(now, latest active expiry for that
scope)` — so a customer who renews early keeps what they had and adds to the end.

**Days are DERIVED, never counted.** There is no `days_remaining` column and no
cron decrementing one. `expiresAt` is the truth and everything reads from it, so
there is nothing to drift and nothing to run. Status reconciles lazily on read.

**A wildcard purchase expands per scope.** A single queued wildcard budget starts
behind the LONGEST existing runway, which strands every shorter one: with scope A
covered to day 40 and scope B not covered at all, a wildcard purchase would start
at day 40 and leave B — which the buyer just paid for — uncovered until then.
`buildBudgetsForPurchase` expands it into one budget per scope, each queued
behind its own runway. `buildRedemptionBudget` deliberately does NOT, and says so
in a footgun note: redemption routes use the former.

## What the app supplies

| | |
|---|---|
| **Scopes** | The package holds no scope list. `BudgetFeature` is `string` and the wildcard defaults to `"all"`; the concrete list is needed in exactly one place — expanding a wildcard — so the app binds it once (`@kova/domain` `budgets.ts`) rather than passing it at nine call sites. |
| **Lapse copy** | `LAPSE_META` — "Keeps using a client seat" — is the app's wording, in the app. The package takes a `label` resolver. A settings screen that reads a shared package's copy is one that will one day say the wrong noun to a real customer. |

## Naming

`subject`, everywhere — TypeScript, SQL columns, table names, wire codes:

| Was | Is |
|---|---|
| `client_subscriptions` | `subject_subscriptions` |
| `client_id` | `subject_id` |
| `restricted_client_id` | `restricted_subject_id` |
| `wrong_client` (wire code) | `wrong_subject` |

The SQL rename was frozen as debt at first — "a column name is live data,
renaming it is a migration for a cosmetic gain" — which is true, and true only
**after a deploy**. Kova had not deployed yet, so the window was open exactly
once and it was paid rather than documented.

⚠️ **The rename is not a migration.** Bumping `COMMERCE_SCHEMA.version` creates
the new tables; nothing moves rows out of the old ones and nothing drops them. On
a database that already held `client_subscriptions`, the old table survives with
its data while the app reads the new, empty one. Correct for a fresh deploy,
wrong for anything else — which is how the E2E suite found it, running against a
persisted local D1 whose marker said commerce was already applied.

## The lapse ladder is not the dunning ladder

They are separate rails and confusing them is the failure this module exists to
prevent:

| | Who decides | Where |
|---|---|---|
| platform → tenant | us | `@4dl/billing` `dunning.ts` — fixed at 7/30/37 days |
| tenant → customer | the tenant | here — a **setting**, because a tenant with seasonal customers and one running a six-week programme both have legitimate and opposite answers |

`archive` keeps the customer's row and therefore **keeps using a seat**; `delete`
removes it and **frees one**. That is the rule people get wrong, so it is stated
on both actions and in opposite directions. The destructive pair carries a
14-day floor: a tenant cannot configure same-day deletion of someone who was one
day late.
