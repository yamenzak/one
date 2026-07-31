# The 4DL platform

Thirteen shared packages, and one rule that decides what goes in them:

> **A `@4dl/*` package may not know what the app sells.** It may know that
> *something* is sold, that *someone* is a tenant, that *some* capability is
> gated. The nouns — client, workout, SKU, lot number, document — stay in the app.

That rule is machine-checked. Every package has a boundary test
(`@4dl/core/boundary`) that fails on a product noun or an app-scope import, with
a frozen ALLOW list that can only shrink. Twelve of the thirteen are empty —
`@4dl/core`'s is the only one with entries.

**Starting a new app?** → [`apps/_template/README.md`](apps/_template/README.md).
It typechecks and its tests pass in this workspace, so it cannot rot.

---

## The packages

| Package | What it owns | What the APP supplies |
|---|---|---|
| [`@4dl/core`](packages/core/README.md) | ids, defensive JSON, the **bindings contract**, the **composed schema runner**, the boundary checker | its `SchemaModule`s |
| [`@4dl/tenancy`](packages/tenancy/README.md) | the five doors, host→tenant + KV cache, custom domains (CF for SaaS + DCV), the standing/gate model | root domain, reserved labels, `statusOf` |
| [`@4dl/auth`](packages/auth/README.md) | passwordless identity (OTP + passkeys), the request identity, the **five-gate route guard**, the grant algebra, staff seats, step-up codes | the RBAC registry, the route table, brand, seat quota |
| [`@4dl/billing`](packages/billing/README.md) | the entitlement engine, credit metering, `CreditLedgerDO`, the Stripe client, the dunning ladder | quota + feature keys, the plan catalog |
| [`@4dl/commerce`](packages/commerce/README.md) | what a tenant sells its own customers: budgets (queue, never sum), the customer-lapse ladder, discount codes | the scope list, the lapse copy |
| [`@4dl/ai`](packages/ai/README.md) | the metered path: reserve → run → settle, the model catalog, pricing parsers, the dev-only mock lane | the feature registry (prompts), where images go |
| [`@4dl/storage`](packages/storage/README.md) | R2 + the media ledger + the quota gate | the quota resolver (or nothing) |
| [`@4dl/email`](packages/email/README.md) | the provider decision, MIME, the tenant lane, the HTML component kit | brand + sender, and a meter if it resells sending |
| [`@4dl/notify`](packages/notify/README.md) | `InboxDO` (hibernating WebSockets, push = "refetch"), notifications, per-user prefs | the notification types |
| [`@4dl/purge`](packages/purge/README.md) | **erasure derived** from every module's `scoped` declaration, plus two conformance checks | the non-D1 side effects |
| [`@4dl/ui`](packages/ui/README.md) | the design system: tokens + product-agnostic primitives | its own registries and router |
| [`@4dl/app-kit`](packages/app-kit/README.md) | the browser runtime: fetch + the three-way offline outcome, host resolution, prefixed storage, passkeys, Stripe.js, Turnstile | the queued-write pattern, the shell |
| [`@4dl/admin`](packages/admin/README.md) | the operator console on the `admin.` door: the router-free section-registry shell, and panels for config a shared package owns (email delivery) | the SECTION LIST — every section names something the app manages |

Kova keeps [`@kova/domain`](packages/domain/README.md) (its math and its
registries) and [`@kova/protocol`](packages/protocol/README.md) (its wire
schemas). Both are per-app by design.

---

## The four mechanisms everything rests on

Understand these and the rest follows.

### 1. The bindings contract — packages declare a SLICE, structurally

A worker's `Env` names every binding one app has. A package that imports it is
welded to that app. So packages declare only what they touch:

```ts
export async function putMedia<E extends HasDb & HasMedia>(env: E, …)
```

An app's own `Env` satisfies that **by shape** — no import, no registration. The
price of admission is one convention: every 4DL app binds the same names — `DB`,
`CACHE`, `MEDIA`, `AI`, `EMAIL`. The payoff is least privilege for free: a
function typed `HasDb` cannot reach R2 even by accident.

### 2. The composed schema — one D1, several owners

A package does not run migrations. It exports a `SchemaModule` (`ddl`, `alters`,
`backfills`, `scoped`), and the app composes them in dependency order. Each gets
its **own marker row**, so a version bump re-applies one package rather than all
110 statements — and forgetting a bump breaks one module instead of the database.

Modules compose onto each other's tables: `tenant_settings` is tenancy's, and
email, notify, billing and AI each add a column. That is intended, and it costs
one ordering rule — dependencies first, the app last.

### 3. Registry injection — the machinery is shared, the keys are the app's

Every package with a "what exists" question takes it as a parameter:
`bindGrants`, `bindEntitlements`, `bindBudgets`, `configureAi`,
`configureEmailBrand`, `StorageQuota`, `EmailMeter`. Kova has 21 AI features; an
inventory app has "read this label" and "match this SKU". They are metered,
audited and rate-limited identically — only the registry differs.

### 4. Nothing depends on billing

The standing gate, the storage quota and the email meter are all **injected
functions**. An app that never takes a payment passes nothing and gets sane
defaults: gate `ok`, storage unlimited, sends free. This is what lets an internal
tool use the whole auth and tenancy boundary without a payment provider anywhere
in its dependency graph.

---

## Five invariants to know before you touch anything

**The host IS the tenancy.** Every hostname is classified into five doors, and
the tenant is pinned from it *before* the session is read — so a session pointed
at the wrong tenant grants nothing. There is no `/t/<slug>`, no remembered door
in local storage, and no post-sign-in switch. Anything that reintroduces a
client-side memory of the tenancy reintroduces the class of bug where the brand
and the tenancy disagree.

**Row-level scope is the route's job.** The guard proves membership and grant. It
cannot know that row 47 belongs to this caller. Every app needs one function every
scoped route goes through; Kova's is `requireClientAccess`, and it is never
bypassed.

**Reads are never gated, at any rung.** The dunning ladder withholds the
*product*. It does not hold a customer's records hostage over their tenant's
invoice. Account-close and export survive every rung, and provider webhooks are
exempt — blocking those makes suspension unrecoverable. Paying must be a way out,
not the only one.

**A shape a package owns is spread, not re-declared.** `{ ...host.gate }`.
Hand-picking fields is how `blocked` reached the model, the resolver and the
server while the client still read `{ readOnly, reason }` and rendered the
ordinary read-only app for a tenant whose access was withheld.

**Erasure is derived.** `@4dl/purge` computes both cascades from every module's
`scoped` declaration. Do not write a table list: a purge must swallow delete
errors (an old database may lack a table), so a forgotten table and a renamed
column both read as a clean erasure. Kova kept three lists by hand and
accumulated three real defects before the derivation replaced them.

---

## Where the history is

[`docs/PLATFORM-EXTRACTION.md`](docs/PLATFORM-EXTRACTION.md) — the audit that
started this, the nine stages, and what moved in each. Read it before moving
anything between an app and a package. It also records what did **not** move and
why, which is the more useful half.
