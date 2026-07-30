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

## Naming, and one deliberate inconsistency

The TypeScript says `subjectId`; the SQL still says `client_id`. That is not an
oversight. A column name is **live data** — renaming it is a migration over every
tenant's purchase history — and it buys nothing, because a second app compiles
against the TypeScript, not against Kova's column labels. The boundary test
carries one frozen entry for exactly this, with the reason written down, rather
than silently excluding the file.

`wrong_client` → `wrong_subject` *was* worth changing: it is a wire code the app
maps to user-facing copy, so it would have been inherited by every future app's
client. That rename landed in two screens alongside the package.

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
