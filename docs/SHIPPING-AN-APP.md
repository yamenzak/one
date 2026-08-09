# Shipping an app on the platform

From nothing to deployed. This is the walkthrough; [`PLATFORM.md`](../PLATFORM.md)
is the architecture behind it and [`apps/_template/README.md`](../apps/_template/README.md)
is the file-by-file reference.

The whole point is that you write your product and nothing else. Tenancy,
passwordless auth, the route guard, billing, credit metering, media, email,
notifications, erasure and the operator console already exist and are already
proven in production by Kova.

---

## 0. What you get for free, and what you must decide

**Free, working, tested:** five-door host routing, email-OTP + passkey sign-in,
organizations as tenants, the five-gate route guard, the entitlement engine,
credit metering with a per-tenant Durable Object, Stripe on both rails, R2 with a
quota gate, transactional email, a real-time inbox, derived erasure, custom
domains, and an operator console.

**Yours to decide, and nobody can decide it for you:**

| | |
|---|---|
| the **nouns** | what your app sells and stores — the one thing a `@4dl/*` package may never know |
| **roles + permissions** | `access.ts`. Who counts as an owner is a product decision |
| **entitlement keys** | `entitlements.ts`. `staffSeats` means nothing to the engine |
| **your tables** | `db.ts`, as a `SchemaModule` |
| the **route table** | `route-guard.ts` — which routes fall in which of the five gates |
| **row-level scope** | the one function every scoped route goes through. See step 5 |

---

## 1. Copy the template

```sh
cp -r apps/_template apps/inventory
```

Then rename, in this order:

1. `package.json` — `name`
2. `wrangler.jsonc` — `name`, `ROOT_DOMAIN`, `BETTER_AUTH_URL`, `ADMIN_EMAILS`,
   and the three placeholder resource ids
3. `src/host-context.ts` — `DEFAULT_ROOT` and your brand's reserved labels
4. `src/mailer.ts` — brand and sender

```sh
pnpm install && pnpm --filter @<scope>/inventory test
```

Sixteen tests should pass immediately: eleven conformance (plain Node) and five
integration (the real worker through Miniflare). If they do, every package is
wired correctly. **Do not start writing routes until they pass** — a wiring
failure found now is ten minutes; found later it is a day.

## 2. Name your tenants

The template says "workspace". Kova says "studio". Pick your word and use it
everywhere a person reads it — but note that **`@4dl/tenancy` says `tenant`
internally and will not change**, because a type name is the worst place for
product vocabulary: every consuming app is forced to adopt the word.

Set your root domain explicitly. Deriving it silently reclassifies every tenant
subdomain as a foreign custom domain, which fails closed as "every tenant 404s"
with nothing naming the cause.

## 3. Declare your schema

`db.ts` composes modules in dependency order, app last. Yours is one
`SchemaModule`:

```ts
export const INVENTORY_SCHEMA: SchemaModule = {
  id: "inventory",
  version: "1",              // bump whenever ddl/alters/backfills change
  ddl: [ "CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, tenant_id TEXT, …);" ],
  scoped: { tenantColumn: "tenant_id", tenantTables: ["items"] },
};
```

Four rules, and every one of them fails **silently**:

- **Bumping `version` is not optional.** The marker row short-circuits the whole
  module, so a new `CREATE TABLE IF NOT EXISTS` without a bump is invisible on a
  fresh database and fatal on every existing one.
- Statements are idempotent, terminate with `;`, contain no `--` comment and no
  newline. ALTERs are `ADD COLUMN` only.
- `scoped` is what `@4dl/purge` derives erasure from. Declare a table there and
  forgetting it later becomes a test failure; hand-write a list instead and a
  forgotten table reads as a clean erasure forever.
- A table with **no** tenant column is not tenant-scoped. Declaring one anyway
  makes every purge issue `WHERE tenant_id = ?` against a column that does not
  exist — an error a purge swallows.

## 4. Roles, permissions, entitlements

`access.ts` is your RBAC registry; `entitlements.ts` is your quota and feature
keys. Both are plain data. The engines resolving them are shared and already
tested — only the vocabulary is yours.

If your app never takes a payment, pass nothing: the standing gate returns `ok`,
storage is unlimited, email sends are free. **Nothing depends on billing**, which
is what lets an internal tool use the whole auth and tenancy boundary without a
payment provider anywhere in its dependency graph.

## 5. Write ONE row-level scope function

The route guard proves the caller is a member of *this host's* tenant with the
right grant. **It cannot know that row 47 belongs to them.** Every app needs one
function every scoped route goes through, and it must never be bypassed.

Kova's is `requireClientAccess`. Four separate Kova routes shipped the bug this
prevents — an unassigned trainer could change a prescription or write fabricated
lab values — and every one of them was a handler that loaded a row, read its
owner id, and wrote without re-checking.

`WHERE id = ? AND tenant_id = ?` is **not sufficient** for anything a customer
owns.

## 6. Add your routes — and keep the ones you inherited

Mount after `sessionMiddleware` and `guard`, in that order. Routes mounted before
them are ungoverned; the one legitimate exception is a provider webhook that
carries its own signature and no session.

⚠️ **The template already mounts a route tree for every schema module it
applies** — the inbox, the roster, media, leaving, the plan catalog, the AI
catalog, and `otpSendGuard` in front of the sign-in code. Do not delete one
because the product "does not need it yet". A capability with tables and no route
is the single most common defect in this repo's history: nothing fails, every
suite stays green, and the feature is simply absent until somebody goes looking
years later.

`scripts/capability-reachable.test.mjs` (in `pnpm gate`) enforces this for every
app in `apps.json`, so deleting a mount fails the build with the reason. If your
app genuinely diverges — Scena keeps its own asset door because its R2 key is a
content hash the shared routes cannot issue — the entry goes in
`KNOWN_UNMOUNTED` with the argument, where it has to be re-read rather than
silently absent.

⚠️ **And the OTP guard goes BEFORE Better Auth's `/api/auth/*` catch-all.** Hono
matches in registration order, so mounting it after is a bypass that typechecks,
passes every test, and looks identical in a route list.
`scripts/otp-gate.test.mjs` asserts the order.

## 7. Wire the operator console

`@4dl/admin` gives you the shell; you supply `ConsoleSection[]`. Take
`PlatformEmailSection` from day one — `@4dl/email` fails closed until
`email.provider` and `email.from` are set, and an app that cannot configure its
mailer cannot send the sign-in code that is the only way in.

## 8. Register the app, then deploy

**Add an entry to [`apps.json`](../apps.json).** That is the whole wiring: CI,
the deploy, and provisioning all read the registry rather than repeating an app
list, so a new app needs no workflow edit. `scripts/apps-manifest.test.mjs` fails
the build if anything under `apps/` has a `wrangler.jsonc` and is not listed —
because the failure mode is silent, not loud. Tessa's SPA build was missing from
CI, so its Miniflare suite reported "no tests", which reads as a pass, and the
merge that added it went red on main.

```jsonc
{
  "id": "tessa",              // used in workflow inputs and job names
  "name": "Tessa",
  "dir": "apps/tessa",        // holds wrangler.jsonc
  "spa": "@tessa/app",        // built BEFORE tests and deploy — see below
  "e2e": "@tessa/e2e",        // gets its own Playwright job, or null
  "deploy": true,
  "provision": { "d1": "tessa", "kv": "CACHE", "r2": "tessa-media" },
  "email": { "name": "Tessa" } // display name only; the ADDRESS is the platform's
}
```

`spa` is the field that bit. The worker serves your app through an `assets`
binding, and turbo **cannot** infer the dependency — an `assets.directory` is a
filesystem path, not a package dependency, so nothing in the graph connects a
worker's tests to its app's build. Naming it here is what makes CI build it.

Then run **Actions → "Provision an app on Cloudflare" → your id.** One run takes
the app from nothing on the account to reachable and able to send its first
sign-in code: it creates the D1/KV/R2 it binds, writes the real ids into your
`wrangler.jsonc` and commits them, builds the SPA, deploys the worker, mints
`BETTER_AUTH_SECRET` if there is none, and seeds email delivery. Until it has
run, `deploy.yml` **skips** your app rather than deploying it against placeholder
ids — which does not error, it just binds the worker to nothing.

[`DEPLOY.md`](../DEPLOY.md) is the long form. It is written against Kova, so
substitute your worker, bucket and root domain. The parts that are the same for
every app:

- the API token scopes, and the fact that a missing scope surfaces on the
  *create* rather than the read;
- **the two worker routes are a dashboard step.** `wrangler.jsonc` declares none
  deliberately: declaring them makes `wrangler dev` rewrite the incoming Host and
  collapse every door onto the root. And `*.<root>` is a second-level wildcard
  that Universal SSL does not cover — it needs an ACM certificate and a proxied
  wildcard DNS record, or every tenant subdomain fails the TLS handshake on a
  green deploy;
- **`ENVIRONMENT` must never appear in `wrangler.jsonc`'s `vars`.** That block is
  the deployed config, and the dev lane opens every dev door at once: OTP codes
  into retained logs, the repo-public auth-secret fallback, and the AI mock —
  which fabricates output *and still bills for it*;
- seeding `email.provider` / `email.from`, which is the one thing a fresh deploy
  cannot do for itself.

## 9. Selling on the shared Stripe account

One Stripe account serves every app. Register with `@4dl/billing-rail` and stamp
`metadata.app` on your products. Skip that and your payments will **park** in
`rail_parked_events` rather than being silently accepted — which is the point:
before the rail existed, an event belonging to no known app was answered
`200 {received: true}` with its id already claimed, so Stripe never retried.

---

## The five things that will bite you

Each has cost a real debugging session, and each **typechecks perfectly**.

1. **Middleware order is the security model.** Host → session → membership, then
   the guard. The tenancy is pinned from the hostname *before* the session is
   read, so a session pointed at the wrong tenant grants nothing.
2. **Spread a shape a package owns** — `{ ...host.gate }`. Hand-picking fields is
   how a new gate rung reached the model, the resolver and the server while the
   client still read the old shape and rendered the wrong state for a tenant
   whose access was withheld.
3. **Reads are never gated.** The dunning ladder withholds the *product*; it does
   not hold a customer's records hostage over their tenant's invoice. Close and
   export survive every rung, and provider webhooks are exempt — blocking those
   makes suspension unrecoverable.
4. **A write that fails must say so, where it failed.** `useAction` for a control
   with a Save button, `useConfirmedState` for an instant one. Both alternatives
   are shorter than the correct code and both lie.
5. **Write the integration test on day one.** The conformance tests read
   declarations; only the integration suite catches a middleware in the wrong
   order, a route on the wrong prefix, a schema module missing from the composed
   list, or an auth callback that throws — which Better Auth **swallows** while
   still answering `200 {"success":true}`.
