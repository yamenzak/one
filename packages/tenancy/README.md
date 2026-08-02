# @4dl/tenancy

Multi-tenant addressing: what a hostname *is*, which tenant owns it, and whether
that tenant's whole origin is currently writable.

| Module | What it is |
|---|---|
| `hosts.ts` | The five doors, slug rules, `rpIdFor`, `cookieDomainFor`. Pure. |
| `standing.ts` | `resolveStanding` (what a person may do in one tenancy) and `resolveHostGate` (does this tenant's host serve a working app), plus the dunning ladder. Pure. |
| `maintenance.ts` | The same question for the WHOLE deployment, from an operator's switch rather than anyone's subscription: `off` / `readonly` / `full`. Pure. |
| `maintenance-routes.ts` | That switch over `app_config` — the per-request middleware and the two operator routes. D1 + Hono. |
| `close-routes.ts` | A tenant CLOSING itself: status, step-up code, schedule, undo. The state transition is injected. D1 + Hono. |
| `dcv.ts` | Turning Cloudflare's certificate errors into a record an owner can add. Pure. |
| `host-context.ts` | Host → tenant resolution, the KV identity cache, subdomain provisioning, `canonicalHost`. D1. |
| `cloudflare.ts` | The Cloudflare for SaaS custom-hostname + worker-route client. |

Two entry points, and the split is load-bearing:

- **`@4dl/tenancy`** — everything, including the D1 and Cloudflare halves. For the
  worker.
- **`@4dl/tenancy/model`** — `hosts` + `standing` + `dcv` + the maintenance MODEL
  only. No bindings, no
  Workers types, safe in a browser build. The app needs `tenantStandingOfGate` to
  render a suspended tenant and `checkSlug` to validate an address as it is typed;
  it must never reach the resolver. Importing the root from a browser build is a
  type error rather than a subtle bundling accident.

## The five doors

```
root      <root>              a dead end. Not an app, not a sign-up, not a login.
setup     setup.<root>        the ONLY place a tenant is created.
admin     admin.<root>        the operator console.
tenant    <slug>.<root>       a tenant. `slug` is carried out.
custom    app.acme.com        a tenant on its own domain (from `tenant_domains`).
invalid   api.<root>          under the root but reserved, or nested too deep.
```

`invalid` is a distinct answer from `custom` on purpose. A hostname under our own
root that we do not serve must NOT fall through to the custom-domain lookup —
that lookup is keyed on a column an owner can write to, so treating
`api.<root>` as a candidate would let a tenant claim an infrastructure host by
typing it into a form.

## Maintenance — the host gate, one level up

`resolveHostGate` closes ONE tenant's origin because of that tenant's bill.
`maintenance.ts` closes EVERY door at once because an operator said so: a
migration, a schema change, an incident.

```
off        nothing is withheld
readonly   reads served, every write refused, nobody signed out
full       the app is withheld, signing in is disabled, every session ends
```

The state lives in three `app_config` rows, is read once per request by
`maintenanceMiddleware`, reported on `/api/host` (so the app can render the
notice rather than a broken login), and enforced in `@4dl/auth`'s route guard as
gate 1b — **above** the public gate, because "signing in is disabled" is a claim
about a public lane.

**The exemptions are the feature.** A switch that can lock out the person who has
to turn it off is a trap, not a control, so four things always answer: the
`admin.` door, a platform admin on any door, `/health`, and whatever the app
lists in `maintenanceExempt` (its host probe and its signature-verified payment
webhooks — a dropped webhook is money no retry recovers). At `readonly` the
sign-in lane answers too, or "read-only" would refuse the one act that lets
anyone read anything.

An unparseable level resolves to `off`, deliberately: the row is free text, and
failing closed on a typo would take the deployment down for a reason nobody chose
— with the fix being to edit the very row causing the lockout.

## What the app supplies

Three things this package refuses to guess. All of them arrive through
`TenancyConfig`, and `apps/api/src/host-context.ts` is the reference adapter.

| Field | Why it isn't here |
|---|---|
| `root` | `rootDomain()` returns `""` when neither `ROOT_DOMAIN` nor `BETTER_AUTH_URL` is set. A shared package guessing a hostname is how every tenant 404s — the shipped default belongs to the app that ships it. |
| `reserved` | `RESERVED_LABELS` covers what is true of any product on any zone (other doors, mail autoconfig, ACME, Workers plumbing, money words). An app's own brand names are its own: `"kova"` means nothing to a warehouse app, and a shared list accumulating every app's brands is one nobody can safely edit. |
| `statusOf` | The tenant's standing lives in a **billing** table this package must not read. **Omit it and every gate resolves `ok`** — which is the correct behaviour for an app that never takes a payment, and the reason the host gate is not a hard dependency on `@4dl/billing`. |

⚠️ **`statusOf` returning `null` resolves to `ok`, not to `incomplete`.** That is
correct for an app with no billing and a trap for one that has it: if the
subscription row is written LAZILY, a tenant that never opened billing has no
row, so the `incomplete` rung — which exists to hold an unconfigured tenant
read-only until it picks a plan — never fires. It shipped that way in one app.
An app whose row is lazy must map "no row" to unpaid inside its own `statusOf`,
and both live apps now do, both with the fail-open rule: closed on the tenant's
non-payment, open on the deployment's misconfiguration.

Branding is a type parameter (`HostTenant<B>`): tenancy stores and returns
whatever blob the app puts in `tenant_settings.branding_json` and has no opinion
about what a brand is.

## Schema

`TENANCY_SCHEMA` owns `tenant_domains` and `tenant_settings`, and must be
composed **before** the app's module:

```ts
schemaGate([TENANCY_SCHEMA, MY_APP_SCHEMA])
```

`tenant_settings` is a **shared row**. Tenancy creates it and owns
`branding_json` + `marketplace_json`; billing, AI, email, notifications and
commerce each own columns on it. They live on one row because that is what they
are — a tenant's configuration, read together, written rarely. Two rules keep it
from becoming a shared mutable blob:

- a package adds **its own** columns through **its own** module's `alters`
  (which works because tenancy applies first);
- a package reads and writes **only** its own columns.

Drop `TENANCY_SCHEMA` from the composition and the app's ALTERs abort with
`no such table: tenant_settings` — the ordering is enforced, not assumed.

## Boundary

Zero entries in the frozen ALLOW list, and that is the point. This package was
carved out of `@4dl/platform`, which named a tenant a *studio* in its own **type
names** (`StudioStanding`, `studioStandingOf`, `StandingFacts.studio`) and
hard-coded the first app's brand into a security control. Type names are the
worst place for product vocabulary — every consuming app is forced to adopt the
word. The rename rode along with the move, so this starts clean and the empty
list is a load-bearing assertion.

## Shipping routes without importing auth

`domain-routes.ts` and `org-guard.ts` belong here by subject — they are entirely
about hostnames, certificates and DNS labels. They stayed in the app for four
stages anyway, because every route needs the request identity, and `@4dl/auth`
already depends on THIS package. Importing it back is a cycle.

`route-deps.ts` is the fix, and it is the same injection shape as everything
else:

```ts
export type RouteEnv = { Bindings: RouteBindings; Variables: RouteVars }

export interface RouteGuards {
  requireTenant:      (c) => { tenantId; userId } | null
  requirePermission:  (c, perms) => Response | null
  isPlatformAdmin:    (c) => boolean
  gateCustomDomain?:  (c) => Promise<Response | null>   // optional; permissive
  turnstile?:         (db) => Promise<{ siteKey; enabled } | null>
}

domainRoutes(guards, { config, workerName })
```

`RouteVars` names only the two variables these routes READ — `host` and `user` —
and Hono's context is structurally typed, so an app with twenty more satisfies it
by shape. The guards are functions, so `@4dl/auth`'s implementations bind in one
line and an app with no authorization passes stubs.

Two things fell out of doing this:

**Turnstile's admin endpoints moved to `@4dl/auth`.** They lived in the app's
`domain-routes.ts` because they sat next to the Cloudflare-for-SaaS credentials
and both are "Cloudflare things an operator configures". They are unrelated — a
bot check on the sign-in path is auth's — and that accidental neighbouring was
the *only* thing that would have forced tenancy to import auth.

**`workerName` is a parameter, not a constant.** It must match `name` in the
app's `wrangler.jsonc`, and it is the one value whose wrong setting fails
silently: the route is created, the certificate issues, the domain reports
ACTIVE, and every request reaches a script that is not there.

`orgSlugGuards(config, noun)` needs no guards at all — Better Auth decides who
may create or rename an organization; these only decide what a slug may BE. That
is why they could move first.


## `close-routes.ts` — leaving is always allowed, and that has to be true

`standing.ts`'s ladder exempts the exit path from every rung *specifically* so
that paying is A way out and not the ONLY one. An invariant only one app
implements is not an invariant: in the other, the route the guard exempted did
not exist, so the exemption protected nothing and a suspended tenant was in a
trap — every write refused, the copy saying "settle the invoice", no way to shut
the thing down instead.

**Two mistakes this file's shape prevents, both of which shipped:**

- **The exemption needs a PREFIX, not an equality.** Scheduling a close flips
  the tenant to `closing`, which is itself a read-only rung — so an exact match
  on `/api/tenant/close` refuses `/close/cancel`, `/close/request-otp` and
  `/close/status`. The undo is unreachable exactly when it is needed, and a
  close you cannot cancel is not a grace window.
- **`cancel` takes NO step-up code.** Undoing a destructive act is not itself
  destructive; a second factor in front of the undo is how a mistake becomes
  permanent because the confirmation email was slow.

Close is SCHEDULED, not immediate: billing stops at once — nobody should be
charged for a product they have ended — and the data is held so a 2am decision
can be undone and an accountant can take one last export.

The state transition is injected because it is genuinely the app's: it cancels
subscriptions on rails this package knows nothing about.
