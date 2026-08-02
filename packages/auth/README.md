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
| `staff-routes.ts` | The staff SCREEN's endpoints: roster + pending invitations + seat counters, invite, revoke, re-role, remove. Roles and copy injected. |
| `otp-guard.ts` | The one gate in front of the sign-in code: human check → cooldown → per-source ceiling → eligibility → deliverability. |
| `action-otp.ts` | Step-up confirmation codes for irreversible actions. |
| `account-routes.ts` | A person deleting their own account: step-up code, a double-checked block, erasure. |
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


## `staff-routes.ts` — why these are ours and not Better Auth's

The org plugin ships `invite-member`, `update-member-role` and `remove-member`,
and using them is less code. Two reasons not to, and both are lockouts rather
than preferences:

1. **The tenant comes from the HOST, never from the session.** Better Auth
   resolves the organization from `session.activeOrganizationId`, which
   `better-auth.ts` stamps as the user's FIRST membership by `createdAt`. For
   anyone in two tenants that is the wrong one — an owner standing on tenant-B's
   subdomain could invite into tenant-A.
2. **The guards it does not have.** Nothing in the plugin stops an owner demoting
   the last owner, or changing their own role. Both lock a tenant out of its own
   billing and settings, permanently, with a 200.

ACCEPTANCE still goes through Better Auth, so `beforeAcceptInvitation` re-checks
the seat at the moment it is actually claimed.

**A pending invitation is a RESERVED seat.** `GET /staff` reports
`{ used, pending, max, remaining }` and the invite counts pending against the
ceiling. Without that a tenant with one seat left sends five invitations and four
fail when a real person clicks accept — and a screen that derives the count from
the roster cannot see them at all.

**A failed send does NOT roll the invitation back.** The row *is* the invitation;
the email is only how the link travelled. `sendInvite` returns the accept `url`
and it is echoed in the response, so a misconfigured mailer leaves a manager a
working link to hand over in person rather than a toast.

### The four seams, and why each exists

| seam | default | why an app overrides it |
|---|---|---|
| `assignableRoles` | `roleNames` | an app that demotes to a customer role needs a re-role target that is never invitable |
| `checkRole` | none | a capability the plan sells has to close on the INVITE and the PROMOTION; gating one leaves the other. Returns a **Response**, so an app's existing entitlement gate is handed over unchanged and its body keeps naming the feature — otherwise a plan refusal and a seat refusal are both an opaque 403 |
| `claimsSeat` | never | correct where every role is a staff seat: a sideways move consumes nothing, so a tenant on its ceiling can still reshuffle. An app with a seat-free customer role counts only customer → staff |
| `copy` | English | one app's tenant is a studio, another's a centre, and one runs `@4dl/i18n` |


## `account-routes.ts` — the erasure every app owes

Two reasons this is the platform's rather than a product's. It is the route a
GDPR/DSGVO request lands on, and an app with no mechanism has an obligation it
cannot discharge. And "leaving is always allowed" is a documented invariant of
`@4dl/tenancy`'s standing ladder, which exempts the exit paths from every rung —
an invariant one app implements is not one.

`blockedReason` is checked **twice**: before the code is sent and again before
the erasure. Somebody can be made an owner in the minutes a confirmation email
takes to arrive, and an owner deleting themselves leaves a tenant nobody can
administer, still billing, holding other people's data. It returns a CODE rather
than a sentence, so the app can turn it into a link to the tenant-close flow.
