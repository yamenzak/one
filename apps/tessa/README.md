# apps/_template — a new 4DL app

Every shared package wired up, and nothing product-specific. Copy the directory,
rename it, and start adding routes.

```
cp -r apps/_template apps/inventory
# then: package.json name, wrangler.jsonc name + ids + ROOT_DOMAIN,
#       src/access.ts roles, src/entitlements.ts plan keys,
#       src/host-context.ts DEFAULT_ROOT + reserved labels,
#       src/mailer.ts brand + sender, src/db.ts your tables
pnpm install && pnpm --filter @<scope>/inventory test
```

It typechecks and its tests pass **in this workspace**, which is deliberate: a
template that is not built is a template that rots.

## What each file is for

| File | Yours to change | Why it exists at all |
|---|---|---|
| `env.ts` | the vars | The binding NAMES are fixed by `@4dl/core`'s contract. Rename one and packages stop matching, silently, at the type level. |
| `access.ts` | **yes** — roles + permissions | `@4dl/auth` owns the grant algebra; who counts as an owner is a product decision. |
| `entitlements.ts` | **yes** — quota + feature keys | `@4dl/billing` owns resolution; `staffSeats` means nothing to it. |
| `db.ts` | **yes** — your tables | The composed schema runner, in dependency order, app last. |
| `host-context.ts` | root + reserved labels | The three things `@4dl/tenancy` refuses to guess. |
| `auth.ts` | brand, seat rule, two emails | The passwordless factory. |
| `auth-context.ts` | rarely | The request identity. The ORDER inside it is the security model. |
| `route-guard.ts` | **yes** — the route table | The five gates, and which routes fall where. |
| `billing-do.ts` | the class name (once) | The credit authority. |
| `inbox-do.ts` | no | Re-export only; wrangler needs the entry export. |
| `storage.ts` `ai.ts` `mailer.ts` `email-provider.ts` | the registries | Where each package learns which app it is. |
| `org-guard.ts` | the noun in the copy | A tenant's slug becomes an ORIGIN, so the DNS-label + reserved-label check is a security control, not validation. |
| `domain-routes.ts` | the feature key gating it | Custom-domain binding: `@4dl/tenancy`'s routes, with authorization passed in. |
| `purge.ts` | the non-D1 side effects | The D1 cascade is DERIVED. Do not add a table list. |
| `index.ts` | **yes** — your routes | The worker. |
| `test/conformance.test.ts` | **keep** | See below. |
| `test/integration.test.ts` | **keep, and grow it** | See below. |

## Six things that will bite you

Each has cost a real debugging session, and every one fails **silently**.

**1. Adding DDL means bumping `version`.** The marker row short-circuits the
whole module, so a new `CREATE TABLE IF NOT EXISTS` without a bump is invisible
on a fresh database and fatal on every existing one — the table is never created
and every route touching it 500s.

**2. `ENVIRONMENT` must never reach `wrangler.jsonc`'s `vars`.** That block is
the *deployed* config. The dev lane puts sign-in codes in retained logs, accepts
the repo-public auth-secret fallback (forgeable sessions), and turns on the AI
mock — which fabricates output and still bills the tenant credits for it.

**3. Do not declare `routes`.** `wrangler dev` then rewrites the incoming Host,
collapsing every door onto the root, and no tenant subdomain can be tested. The
header comment in `wrangler.jsonc` has the second reason, which is worse.

**4. Do not re-declare a shape a package already owns.** Spread it
(`{ ...host.gate }`). Hand-picking fields is how a new gate rung reached the
model, the resolver and the server while the client still read the old shape and
rendered the wrong state for a tenant whose access was withheld.

**5. Row-level scope is the route's job, not the guard's.** The guard proves the
caller is a member of *this host's* tenant with the right grant. It cannot know
that row 47 belongs to them. Every app needs one function every scoped route
goes through, and it must never be bypassed — Kova's is `requireClientAccess`.

**6. Reads are never gated.** The standing ladder withholds the *product*; it
does not hold a customer's data hostage over their tenant's invoice. Paying must
be a way out, not the only one — which is why the account-close and export paths
survive every rung, and why provider webhooks are exempt (blocking those makes
suspension unrecoverable).

## Keep the conformance tests

`test/conformance.test.ts` runs in plain Node — no database, no fixtures, no
Workers pool — so it works from the first commit. Every check in it catches
something invisible at runtime, which is the entire selection criterion:

- DDL that is not idempotent, or that fuses/swallows the rest of its batch
- an ALTER shape the runner cannot tolerate
- two modules claiming the same table
- a module ordered before the one whose table it extends
- **a table carrying a scope column that no erasure cascade clears**
- **a cascade step naming a column the table does not have**

The last two are why `@4dl/purge` exists. Kova maintained three table lists by
hand and accumulated three real defects: a table in none of them, and two
renamed columns that stayed. A purge swallows every delete error — it has to,
since an old database may legitimately lack a table — so all three read as a
clean erasure.

## Keep the integration suite too

`test/integration.test.ts` drives the real worker through Miniflare — the same
Hono app, the same Better Auth, the same D1. The conformance tests read
declarations; this one exercises the wiring, and that is a different class of
bug. Every one of these **typechecks perfectly**:

- a middleware in the wrong ORDER, so the guard runs before the identity
- a route mounted on the wrong PREFIX, so it 404s on the door it needs
- a schema module missing from the composed list, so a table never exists
- an auth callback that throws, which Better Auth **swallows** while still
  returning `200 {"success":true}` — the slug guard lives there

The five it ships with are the golden path: the host probe answers with its door;
an unowned hostname serves the probe and nothing else; sign-up → workspace create
→ subdomain row → tenant door resolves → a scoped write lands and reads back; a
slug that would take over `admin`/`setup`/`autodiscover` is refused; and an
unauthenticated caller reaches the public lane only.

Two things about the environment, both real rather than simulated:

- **The host IS the tenancy, in tests too.** Miniflare preserves the Host header
  and `*.localhost` resolves to loopback, so sign-in happens on
  `setup.localhost` and tenant behaviour is asserted on `<slug>.localhost` —
  the shipped topology. `vitest.config.ts` overrides `ROOT_DOMAIN` to
  `localhost` for exactly this reason.
- **Every test user is a platform admin** (`ADMIN_EMAILS: ""` +
  `ENVIRONMENT: "development"`), so a route-guard action gate cannot be observed
  failing there. Assert authorization through something that does not consult
  platform-admin status: row-level scope, or an in-handler check.

Read the sign-in code out of the `verification` table, never out of a log. The
mock mailer prints it, but a test that scrapes stdout passes for the wrong reason
the moment the provider changes.

## What this template does NOT include

- **A frontend.** `@4dl/app-kit` + `@4dl/ui` are the runtime and the design
  system; the shell, nav and session provider are still per-app (see that
  package's README for exactly which files stayed in Kova and why).
- **Stripe routes.** Both rails' reconciliation logic is extracted —
  `@4dl/billing/webhook.ts` is the platform rail (subscription sync, the dunning
  clamp, refund reversal), `@4dl/commerce/connect.ts` is the connected-account
  rail. What did NOT move is the route TREE: Kova's handlers are woven through
  its notification registry, its entitlement gates and its row-level scope
  function, and each of those has to become an injection first. Copy from
  `apps/api/src/stripe-routes.ts` when the app starts charging, and take the two
  packages rather than re-deriving what they already hold.
