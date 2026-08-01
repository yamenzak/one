# The 4DL platform

Fourteen shared packages, and one rule that decides what goes in them:

> **A `@4dl/*` package may not know what the app sells.** It may know that
> *something* is sold, that *someone* is a tenant, that *some* capability is
> gated. The nouns — client, workout, SKU, lot number, document — stay in the app.

That rule is machine-checked. Every package has a boundary test
(`@4dl/core/boundary`) that fails on a product noun or an app-scope import, with
a frozen ALLOW list that can only shrink. Thirteen of the fourteen are empty —
`@4dl/core`'s is the only one with entries.

**Starting a new app?** → [`apps/_template/README.md`](apps/_template/README.md).
It typechecks and its tests pass in this workspace, so it cannot rot.

---

## The packages

| Package | What it owns | What the APP supplies |
|---|---|---|
| [`@4dl/core`](packages/core/README.md) | ids, defensive JSON, the **bindings contract**, the **composed schema runner**, the boundary checker | its `SchemaModule`s |
| [`@4dl/tenancy`](packages/tenancy/README.md) | the five doors, host→tenant + KV cache, custom domains (CF for SaaS + DCV), the standing/gate model, the deployment-wide maintenance switch | root domain, reserved labels, `statusOf` |
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
| [`@4dl/admin`](packages/admin/README.md) | the operator console on the `admin.` door: the router-free section-registry shell, and panels for config a shared package owns (email delivery, maintenance mode) | the SECTION LIST — every section names something the app manages |
| [`@4dl/billing-rail`](packages/billing-rail/README.md) | one Stripe account, many apps: event→app attribution, the app-tagged catalog, and a dead-letter queue for what it cannot attribute | the app list, and a `claims` lookup for events its own metadata does not name |

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

## Contributing — where new code goes

The ten stages that built this platform are done; what they taught is below. Each
rule cost a real debugging session, and most of them describe a mistake that
**typechecks perfectly**.

### The one question, asked first

> **Does this code know what the app sells?**

If yes, it belongs in the app. If it only knows that *something* is sold, that
*someone* is a tenant, that *some* capability is gated — it can be a package. The
boundary test enforces the answer; you do not get to argue with it.

When the answer is "mostly no, but it needs one product fact", that fact is a
**parameter**, not an import. Every package here already does this: `bindGrants`,
`bindEntitlements`, `configureAi`, `StorageQuota`, `EmailMeter`, `RouteGuards`,
`ConsoleSection[]`, `RailApp[]`.

### Moving code into a package

**An extraction is a MOVE.** Anything retyped is a rewrite wearing a move's
clothes, and it loses the bugs the original had already fixed. Copy the file,
then delete the original — do not "port" it.

1. **Take the tests with it.** A split moves tests; it does not add any. If the
   count goes up, you rewrote something.
2. **Declare a binding SLICE, never an app's `Env`** (`HasDb & HasMedia`). An
   app's `Env` satisfies it by shape, so there is no import and no registration —
   and a function typed `HasDb` cannot reach R2 by accident.
3. **Ship schema as a `SchemaModule`, not a migration.** Own marker row, own
   version. Statements must be idempotent, terminate with `;`, carry no `--`
   comment and no newline, and ALTERs must be `ADD COLUMN` only. Every one of
   those fails silently, which is why they are asserted by a test.
4. **Declare `scoped`** so `@4dl/purge` derives erasure. Never hand-write a table
   list: a purge must swallow delete errors, so a forgotten table and a renamed
   column both read as a clean erasure. Kova kept three lists by hand and
   accumulated three real defects.
5. **Keep the ALLOW list empty.** If the boundary test wants an entry, the design
   is wrong — the vocabulary belongs in the app. The one legitimate exemption is a
   name a *spec or a vendor* chose (`clientExtensionResults` is WebAuthn's).
6. **Write the README as you go**, and put the *failure* in it. Every README here
   answers "what breaks if you get this wrong", because that is the part a reader
   cannot reconstruct.

### Shipping routes from a package

The thing that blocked this for four stages: routes need the request identity,
and `@4dl/auth` already depends on `@4dl/tenancy`, so importing it back is a
cycle. The seam that dissolved it (`route-deps.ts`) is the pattern for every
package that wants routes:

- **`RouteEnv`** names only the context variables the routes *read*. Hono's
  context is structurally typed, so an app with twenty more satisfies it by shape.
- **`RouteGuards`** takes authorization as injected **functions**. The app supplies
  its own; the package calls them without knowing what a permission is.

At the binding site you will need `c as never` — the seam is structural but Hono's
`Context` is invariant. That cast is the house idiom; threading a type parameter
through every handler would force each call site to name the app's full env, which
is the coupling the seam exists to avoid.

### What must NOT move, and why

- **`@kova/protocol`** — wire schemas are per-app by definition.
- **`Shell.tsx` and navigation** — role-adaptive nav is a product decision.
- **Presentation wrapped around a registry read** — a paused-studio banner, a
  notification bell, a feature lock. Inject the registry and you are left with a
  `Card` that takes a parameter, which is worse than the app owning it.
- **Prompts, notification copy, digest content** — registries.
- **A shared database.** Every app gets its own D1. Shared schema *modules*, never
  shared data.
- **The credit balance.** `TenantBillingDO` is per app. Routing crosses workers; a
  metered reserve→settle must not.

### Adding an app

Copy `apps/_template` — it typechecks and its tests run in this workspace, so it
cannot rot. Its README is the file-by-file guide;
[`docs/SHIPPING-AN-APP.md`](docs/SHIPPING-AN-APP.md) is the walkthrough from
nothing to deployed.

### Before you push

`pnpm typecheck && pnpm test` across the workspace, and `pnpm e2e` if you touched
a golden path. The Miniflare suite needs the SPA built first — the root `pnpm test`
handles it.

---

## Where the history is

The audit that started the extraction, its ten stages and what moved in each were
tracked in `PLATFORM.md`, alongside the round-1/2/3 pre-release
audits and the billing, notifications and registry design plans. All of it is
**in git history** — the work is finished and the durable lessons are above, in
the package READMEs, and in the comments at the sites they describe.
