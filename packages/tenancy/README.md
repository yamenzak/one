# @4dl/tenancy

Multi-tenant addressing: what a hostname *is*, which tenant owns it, and whether
that tenant's whole origin is currently writable.

| Module | What it is |
|---|---|
| `hosts.ts` | The five doors, slug rules, `rpIdFor`, `cookieDomainFor`. Pure. |
| `standing.ts` | `resolveStanding` (what a person may do in one tenancy) and `resolveHostGate` (does this tenant's host serve a working app), plus the dunning ladder. Pure. |
| `dcv.ts` | Turning Cloudflare's certificate errors into a record an owner can add. Pure. |
| `host-context.ts` | Host → tenant resolution, the KV identity cache, subdomain provisioning, `canonicalHost`. D1. |
| `cloudflare.ts` | The Cloudflare for SaaS custom-hostname + worker-route client. |

Two entry points, and the split is load-bearing:

- **`@4dl/tenancy`** — everything, including the D1 and Cloudflare halves. For the
  worker.
- **`@4dl/tenancy/model`** — `hosts` + `standing` + `dcv` only. No bindings, no
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

## What the app supplies

Three things this package refuses to guess. All of them arrive through
`TenancyConfig`, and `apps/api/src/host-context.ts` is the reference adapter.

| Field | Why it isn't here |
|---|---|
| `root` | `rootDomain()` returns `""` when neither `ROOT_DOMAIN` nor `BETTER_AUTH_URL` is set. A shared package guessing a hostname is how every tenant 404s — the shipped default belongs to the app that ships it. |
| `reserved` | `RESERVED_LABELS` covers what is true of any product on any zone (other doors, mail autoconfig, ACME, Workers plumbing, money words). An app's own brand names are its own: `"kova"` means nothing to a warehouse app, and a shared list accumulating every app's brands is one nobody can safely edit. |
| `statusOf` | The tenant's standing lives in a **billing** table this package must not read. **Omit it and every gate resolves `ok`** — which is the correct behaviour for an app that never takes a payment, and the reason the host gate is not a hard dependency on `@4dl/billing`. |

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
