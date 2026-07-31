# @4dl/auth

Passwordless identity and authorization. **Emailed code + passkey, no password
provider** — not a simplification to be relaxed later, but the thing that makes
the rest coherent: there is no password to phish, reset, reuse or store, and
"verify this address" and "sign in" are the same act.

| Module | What it is |
|---|---|
| `better-auth.ts` | The auth instance factory. Passwordless plugin set, org = tenant, host-derived rpID and cookie Domain, fail-closed secret handling, the three seat doors. |
| `context.ts` | The request identity: host → session → membership of the **host's** tenant, in that order. Plus `requireTenant` / `can` / `owns` / `isPlatformAdminFor`. |
| `route-guard.ts` | The five-gate outer wall. Route tables and the standing gate are injected. |
| `grants.ts` | The permission algebra — sanitize, intersect, satisfy, resolve-bounded-by-role. |
| `seats.ts` | Staff-seat accounting across all three doors that claim one. |
| `otp-guard.ts` | The one gate in front of the sign-in code: human check → cooldown → per-source ceiling → eligibility → deliverability. |
| `action-otp.ts` | Step-up confirmation codes for irreversible actions. |
| `audit.ts` | The auth trail, which is also the rate limiter's store. |
| `turnstile.ts` | The optional human check. |

Two entry points: **`@4dl/auth`** for the worker, **`@4dl/auth/model`** for the
browser (the grant algebra only — a UI needs `grantSatisfies` to decide whether
to render an action, and must never reach the session middleware).

## The three things worth knowing before you use it

**The host pins the tenancy; the session only proves identity.** A session's
active organization is stamped once at creation, to the user's oldest membership.
If that decided scope, a user in two tenants could enter through tenant B's
branded door and have every call scoped to tenant A — the right brand over the
wrong tenancy, with nothing in the UI to show it. So the role and grant come from
a `member` row for `(hostTenant, user)`, and a stranger to that tenant gets
`tenantId: null`: signed in, with no scope.

**A custom grant is bounded by the role.** `member.permissions_json` may NARROW
within the role's preset and never exceed it. Without that intersection, editing
a JSON column would be a privilege-escalation primitive. One role is unbounded
(the app names it) because letting a stored grant clip the top role is how a
tenant locks itself out of its own billing with nothing left that can undo it.

**A staff seat has three doors, not one.** Creating an invitation, accepting one,
and promoting an existing member. Kova shipped with only the first checked, so
the other two were free seats — and both are reachable directly over HTTP through
the org plugin's own endpoints. All three are enforced inside the plugin's hooks
so they cannot be bypassed by talking to the library instead of the app. Pending
invitations count when creating (a reserved seat) and must NOT count when
accepting (the invitation would count itself and refuse the last seat).

## What the app supplies

```ts
createAuth(env, origin, shape, {
  ac, roles, creatorRole: "owner",
  customerRole: "client",        // the role that is NOT a staff seat
  rpName: "Kova", cookiePrefix: "kova",
  seats: (env) => ({ customerRole: "client", quota: … }),
  sendOtp, sendInvitation, checkInviteRole,
})

routeGuard({
  isPublic, permissionFor, allowedOnRoot, allowedWithoutTenant,
  allowedWhileReadOnly, isPersonal, isBillingWrite,
  isPlatformAdmin,
  gate: (c) => c.get("host").gate,   // ← an app with no billing passes () => null
})
```

That last line is the point of the whole design: **nothing here depends on
billing.** The standing gate is a function, so an internal app gets the entire
five-gate boundary with no Stripe anywhere near it.

`allowedOnRoot` and `allowedWithoutTenant` are deliberately separate and the
second is much narrower. The root door is *ours* and can serve identity and
webhooks; a well-formed subdomain nobody owns is *nobody's*. Collapsing them
re-opens a real hole: the auth lane is public, so on an unclaimed hostname a
stranger could request a code, verify it, and create an organization — minting a
tenant from an address that appears nowhere and belongs to nobody.

`apps/api` is the reference adapter: `auth.ts`, `auth-context.ts`,
`route-guard.ts`, `otp-guard.ts` and `action-otp.ts` are each a thin binding, and
every one of the ~60 call sites across that worker kept the signature it had.

## Schema

`AUTH_SCHEMA` owns Better Auth's eight tables plus `auth_logs` and `action_otps`,
and composes **first**:

```ts
schemaGate([AUTH_SCHEMA, TENANCY_SCHEMA, MY_APP_SCHEMA])
```

Better Auth's tables are mirrored 1:1 from its own SQLite definitions. **Do not
"improve" the column names or types** — the adapter generates SQL from its own
model, so a divergence does not fail loudly, it fails as a query that silently
returns nothing.

`scoped` deliberately lists only `member` and `invitation`. `user`, `session`,
`account`, `verification` and `passkey` are keyed on a USER, who is cross-tenant:
sweeping them with a tenant purge would delete a stranger's account as a side
effect of someone else closing theirs.

## Boundary

Empty ALLOW list. The checker caught two wire-contract strings on the way in —
the guard returned `no_studio` and `studio_read_only`. Error codes are the worst
kind of leak, because they are a *contract*: every consuming app's client would
have to match on a noun from a fitness product to detect "this tenant is behind
on its bill". They are `no_tenant` and `tenant_read_only`.
