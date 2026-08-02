# What is still an app's that should be the platform's

Assessed 2026-08-02, with two apps live. One app cannot tell a platform concern
from a habit — every decision looks essential when there is nothing to compare
it against. Two can, and this is what the comparison says.

Everything below is measured, not guessed. The commands are in the section
headings so any claim can be re-checked, and the numbers will drift.

---

## The pattern that keeps recurring

Five times now, in five unrelated subsystems, the same thing has happened:

> A shared package ships a **mechanism**. No package ships the **surface**. So
> the first app writes one, the second app writes a worse one or none at all,
> and nobody can see the problem from inside either app.

- `@4dl/email` shipped the mailer and the admin routes; the panel was missing,
  so a fresh deploy could not send its own sign-in code and DEPLOY.md carried a
  hand-edit-D1 step instead.
- `@4dl/tenancy` shipped `domainAdminRoutes` at Stage 10a; the panel was
  missing, so *every* app — the template included — had a working custom-domain
  feature and no way to configure it.
- `@4dl/auth` shipped `turnstileAdminRoutes`; the panel was missing, so a
  security control was configurable only by writing to `app_config` by hand.
- `@4dl/app-kit` shipped the entire passkey ceremony at Stage 8; the card was
  missing, so Tessa had no passkey UI anywhere and its users were on email codes
  only — on a platform whose own README says "email OTP + passkeys".
- `@4dl/notify` shipped `InboxDO`, four tables and a permanent DO-name migration;
  the model, the routes and the bell were missing, so Tessa carried the whole
  apparatus and could reach none of it. This is the fifth, it is Tier 1 below,
  and it is the most expensive shape of the pattern — a Durable Object class name
  is permanent, so it was already load-bearing for a feature that did not exist.

All five are now closed. The lesson is not "we forgot five panels", it is that
**a mechanism with no surface reads as done and is not**, and nothing in the
repo could see it. The `@4dl/admin/conformance` check is the first thing that
can, for one class of it.

The list below is what the same lens finds next.

---

## Tier 1 — a capability that is wired up and unreachable

### Notifications: Tessa carries the whole apparatus and surfaces none of it

```
grep -n "InboxDO" apps/tessa/src/index.ts        # exported
grep -n "NOTIFY_SCHEMA" apps/tessa/src/db.ts     # tables applied
grep -rn "notifyRoutes\|/notifications" apps/tessa/src   # → nothing
grep -rli "inbox\|notification" apps/tessa-app/src       # → nothing
```

Tessa exports `InboxDO`, binds it in `wrangler.jsonc`, declares a migration
pinning the class name to durable storage, and applies `NOTIFY_SCHEMA` — four
tables. There are **no routes, no dispatch and no UI**. A Durable Object and
four tables that nothing on earth reaches.

This is the most expensive shape of the pattern, because a DO class name is
permanent: it is already load-bearing for a feature that does not exist.

`@4dl/notify` is 143 lines — the smallest package here — and a closer look says
why. **The model is not missing, it is in the wrong package**:

```
wc -l packages/domain/src/notifications.ts   # 441 — in @kova/domain
wc -l packages/notify/src/model.ts           #   1 — a re-export of the schema
```

`@kova/domain/notifications.ts` holds the channel algebra: `resolveChannels`
(role × category → inbox/email), the stored-preference and tenant-policy
parsers, the transactional set that never consults preferences. None of that is
about coaching. What IS Kova's, in the same file, is the vocabulary the algebra
runs on — thirteen categories named "Check-ins & feedback" and "Client
activity", four roles, and the `NOTIF_TYPES` registry.

So the split is the one `@4dl/ai` already uses, and the work is bigger than
"move the bell":

| moves to `@4dl/notify` | stays in the app |
|---|---|
| `resolveChannels`, prefs/policy parsing, the transactional set | `NOTIF_CATEGORIES`, `NOTIF_ROLES`, `NOTIF_TYPES` |
| `notify()` / `notifyOwners()` dispatch, with the registry injected | the call sites |
| the three `/notifications` routes + `/inbox/ws` | — |
| the bell + inbox surface → `@4dl/app-kit` (it already owns `useInbox`) | per-type icons and labels |

**~810 lines to work through**, and the D1 rows, the DO and the schema are
already shared, so an app that adopts it inherits a working inbox rather than an
empty one. That last part is the whole point: moving only the bell would give
Tessa a box with nothing in it.

**DONE (2026-08-02).** The split above is the split that landed.
`@4dl/notify` grew `model.ts` (the algebra, with `configureNotify`),
`dispatch.ts` (`dispatchNotification`, email as an optional hook) and `routes.ts`
(the four endpoints); `@4dl/app-kit` grew `NotificationBell` + `InboxScreen`.
Kova's registry — thirteen categories, four roles, thirty-odd types — stayed put
and its call sites did not change.

Tessa now has five categories, twelve types, and dispatch on the four events
that actually reach somebody who is not standing at the machine: a load that
failed its fast evidence, a **recall** on a late biological failure, a load
waiting on a Freigabe, and a release given. Plus the two dunning rungs, which
used to arrive unannounced — a centre discovered it was read-only by trying to
record a load, which in a CSSD is the worst possible moment to find out.

Three things worth recording, because each was found by a check rather than by
reading:

- **The boundary checker caught the extraction mid-move.** Nine violations: the
  package had acquired `client`, `staff` and `studioName` as string literals
  along with the model. The fix is `audiences: { customer, member }` in the
  registry — and those names turn out to be load-bearing rather than cosmetic,
  because they are the keys a tenant's stored email policy is written under.
- **A comment was already promising a fix nobody had made.** Kova's
  `allowedWhileReadOnly` header has said "personal, non-tenant surfaces like
  notification read-receipts" since it was written; only the *socket* was in the
  list. A suspended studio's bell filled with a badge nobody could clear for
  seven days. Both apps now exempt `/api/notifications/`.
- **`@4dl/notify` had no test of its own.** Kova's 30 notification tests
  exercised the same code, but only ever proved it worked for the vocabulary it
  was extracted *from*. `test/model.test.ts` runs the algebra against a library —
  `borrower`/`librarian`, `{{branchName}}` — and three of its assertions fail if
  any Kova noun survives as a literal.

---

## Tier 2 — written twice, and the second time was not better

### `billing-store` — 11 of 13 exports are the same name in both apps

```
grep -oE 'export (async )?(function|const) \w+' apps/{api,tessa}/src/billing-store.ts
```

| in both | Kova only | Tessa only |
|---|---|---|
| `getPlan` `getSubscription` `hasFeature` `listPlans` `listPacks` `seedBilling` `tenantEntitlements` `withinQuota` `DEFAULT_PLANS` `DEFAULT_PACKS` `PLAN_CATALOG_VERSION` | `GRANDFATHERED_PLANS` `appendLedger` | `ensureSubscription` |

**817 lines across the two files.** `@4dl/billing` owns the entitlement *engine*
— quotas, gates, grants, with keys injected — and none of the *store*: the D1
reads and writes over `plans`, `credit_packs` and `subscriptions`.

The split to draw is not "billing is shared": it is that **the catalog's
CONTENTS are the product's and the catalog's SHAPE is not.** Kova sells
Starter/Light/Pro/Max; Tessa sells one plan. Both then wrote the same
`listPlans`, the same `withinQuota`, the same seeding, the same
`tenantEntitlements` merge. `DEFAULT_PLANS` stays in the app; everything that
reads it moves.

This is the single largest remaining duplication on the server.

**DONE (2026-08-02).** `bindBillingStore` in `@4dl/billing/store.ts`. The apps'
two files went 817 → 490 lines, and what is left in them is almost entirely the
catalog data and the comments explaining why each tier is priced as it is —
which is what should have been there all along.

Two seams, and both exist because the apps genuinely differ rather than to be
configurable. `defaultSubscription` is `free`/`active` in one and
`free`/`incomplete` in the other, because the second's gate needs "never chose a
plan" apart from "cancelled". `materialiseOnRead` says whether resolving
entitlements for a tenant with no row WRITES one — one app has always done that
from its `/api/context` hot path, the other writes it once at tenant creation.
Dropping the write would be tidier and was explicitly not this move's call.

Two things the move settled that reading either file alone could not:

- **A failed read was being laundered into "no plan" in one app.** `getPlan` and
  `getSubscription` caught D1 errors into `null` in Tessa and propagated in Kova.
  `null` resolves to the free baseline, so the catching version silently
  downgrades a PAYING tenant during a D1 blip and shows them the
  finish-setting-up gate. Both propagate now; "the database was briefly
  unavailable" and "you have not bought anything" must not be the same answer on
  the money path.
- **`active` was hard-coded to 1 in the reconcile.** Harmless in the app it was
  written for — every row in that list is active — and wrong for the other, whose
  parking state sits in the same list at `active: 0`. It is bound from the seed
  now, and Tessa's `free` moved to the `retired` list where "insert it, hold it
  inactive, never reconcile it" is what actually happens.

`packages/billing/test/store.test.ts` is 18 tests against a recording fake D1.
It exists for the three rules that are invisible from outside a route: the
price-change Stripe-id null-out (miss it and a repriced plan charges the old
amount forever, with no error anywhere), retired plans being deactivated and
nothing else, and a failed read never becoming an answer.

### Staff and members — two route trees over the same Better Auth tables

```
grep -oE '\.(get|post|patch|delete)\("[^"]+"' apps/api/src/member-routes.ts apps/tessa/src/staff-routes.ts
```

Kova: list, re-role, set-permissions. Tessa: list, **invite**, **revoke
invitation**, re-role, remove. 429 lines, one job, and the two disagree about
what the job includes.

> ⚠️ **CORRECTION (2026-08-02).** This section first said "Kova has no invitation
> flow at all". That is **wrong**, and the user caught it. Kova has had staff
> invitations all along: `Staff.tsx` posts to Better Auth's
> `organization/invite-member`, `auth.ts`'s `sendInvitation` delivers a branded
> email on the studio's own rail, `beforeCreateInvitation` holds the seat
> (counting pending, correctly), and `/api/context` auto-accepts a matching
> invite as a belt-and-braces second path. None of that was missing.
>
> The real gap was narrower and entirely on the far side of *sending*: Kova could
> not SEE a pending invitation (`GET /members` joins `member` alone), could not
> REVOKE one, and could not remove a member at all. So an invite to a mistyped
> address was invisible, held a seat, and stayed until it expired.
>
> The lesson is about this document, not about the code: "Tessa has routes Kova
> does not" was read as "Kova cannot do the thing", and the two are not the same
> — Kova reached the same capability through the auth plugin instead of through
> its own route tree. An audit that greps for routes finds route-shaped answers.

Worth naming plainly: I wrote Tessa's from scratch earlier in this same session,
having read Kova's member routes days before. Knowing about the duplication is
not the same as being stopped from creating it.

`@4dl/auth` already owns the seat quota, the three Better Auth seat hooks and
the grant algebra. The routes belong with them, with the role catalog injected.

**DONE (2026-08-02).** `staffRoutes` in `@4dl/auth`, taking Tessa's shape. The
apps' halves went 499 → 291 lines, and what is left in each is its roles, its
role copy, and its invitation email.

Kova gains the three it lacked — pending invitations in the roster, revoke, and
remove — plus server-side seat counters, so the screen stops deriving a number it
could not compute (the derived version could not see pending invitations, and
therefore reported a free seat that the invite button would refuse).

Four seams, and each exists because the two apps genuinely differ:

| seam | why |
|---|---|
| `assignableRoles` | Kova demotes to `client`, a valid re-role target that must never be invitable — a `client` membership from the staff invite is a member with no client record |
| `checkRole` | `frontDesk` sells the assistant role. Returns a **Response**, not a message, so Kova hands over its existing `gateFeature` unchanged and the refusal body keeps naming the feature — that is what lets a client tell a plan refusal from a seat refusal, since both are 403 |
| `claimsSeat` | Kova has a seat-free customer role, so only `client → staff` claims a seat. Tessa's roles are all seats, so the default is never |
| `copy` | one calls its tenant a studio and the other a centre |

Retiring Kova's own `PATCH /members/:userId/role` closed an escalation surface
rather than just a duplicate: it was gated by `member:update`, a grant an owner
can hand to staff, so it needed its own "only an actual owner may hand out the
owner role" check. The shared route requires OWNER for every write, so that class
of self-escalation is gone by construction. `/members` keeps the plain roster
read (`ClientManage` picks a coach from it) and the custom per-member grant,
which is a Kova permission feature and not a staff-management primitive.

### Five generic surfaces Kova has and Tessa simply does not

798 lines, all of them things any multi-tenant app needs and none of them
Kova-shaped:

| module | what it is | Tessa |
|---|---|---|
| `account-routes` | change your own name / email / avatar | absent — a Tessa user cannot edit their own profile |
| `tenant-close-routes` | a tenant closing itself | absent — and "**leaving is always allowed**" is a documented invariant of the standing model |
| `session-routes` | list and revoke active sessions | absent |
| `action-otp` | step-up confirmation for destructive acts | absent |
| `audit` | who did what | absent |
| `media-routes` | upload over `@4dl/storage` | absent — Tessa binds an R2 bucket it never writes to |

The `tenant-close` one is the sharpest: the ladder in `@4dl/tenancy` exempts
`/api/tenant/close` from every gate *specifically* so that leaving is always
possible, and in Tessa that route does not exist. The exemption protects
nothing.

---

## Tier 3 — the UI bar is enforced in one app and nowhere else

This is the direct answer to "unified UI experience", and it is not about
components.

```
ls apps/app/src/*.conformance.test.ts        # 12
ls apps/tessa-app/src/*.conformance.test.ts  # 3
```

Kova is policed by seven generic lints — **900 lines** — over its whole
rendering surface:

| lint | what it refuses |
|---|---|
| `design-tokens` | a hard-coded radius, elevation or hairline colour |
| `type-scale` | spelling out a size the scale already names |
| `focus` | removing an outline without replacing it |
| `motion` | writing your own spring or duration |
| `primitive-adoption` | hand-rolling an anchor instead of the primitive |
| `no-data` | rendering a dash where a number belongs |
| `save-lifecycle` | a write that can fail silently |

Every one enforces [UI-LANGUAGE.md](../UI-LANGUAGE.md) — which is written
product-agnostically *because it is the extraction target* — and every one
carries its own mutation self-test ("the lint can actually see a violation"), so
none of them can rot into a vacuous pass.

**Tessa has none of them.** Its drift today is small — 2 raw hex values, 2
arbitrary text sizes, no hand-rolled anchors — but that is because the app is
six days old, not because anything is stopping it. Kova's numbers were small
once too.

**DONE (2026-08-02).** The seven rules are `@4dl/ui/conformance`, as data rather
than as seven test files, each carrying the samples that prove it still fires.
Both apps assert them; each keeps its own waivers. Tessa's four violations were
all in its label PRINT sheet — black ink on white adhesive stock, where the
tokens are actively wrong — and now carry stated exemptions instead of being
invisible.

Two clauses were nearly lost in the move and are worth recording, because they
are the reason to re-read an extraction rather than trust it: `motion` skips
lines carrying `repeat:` (an ambient loop has no start or end for the duration
scale to describe) and `primitive` skips comment lines (a comment explaining why
`<select>` is banned is not a `<select>`). Dropping them turned ten correct
animations and two comments into failures.

`save-lifecycle` still runs over Kova's four settings screens rather than the
whole app, unchanged. Widening it surfaces nine pre-existing instances — worth
doing, worth doing on its own rather than inside a move.

---

## Tier 4 — the asymmetries that run the other way

Extraction is not only Kova → platform. Tessa is ahead in two places, and both
are worse in Kova:

- **Internationalisation.** Tessa is EN + DE through `@4dl/i18n`. Kova has zero
  `@4dl/i18n` imports — every string is hard-coded English. The package exists,
  works, and has one consumer.
- **Nothing yet, but watch:** Tessa's scan-first surfaces (`Barcode`, `scan`)
  are the first real camera-input primitives outside Kova's body-scan, and the
  two will want the same thing.

And one where Kova is ahead in a way that matters more for Tessa than for Kova:

- **Offline / PWA.** Kova has VitePWA — app-shell precache and Background-Sync
  replay of failed log writes. Tessa has none. Tessa is a **scanner used on a
  shop floor**, which is the environment where connectivity actually fails. The
  app that needs offline most is the one without it.

---

## What is NOT worth extracting

Equally important, and a shorter list than it looks:

- **The thin bindings.** `env.ts`, `storage.ts`, `stripe.ts`, `mailer.ts`,
  `org-guard.ts`, `inbox-do.ts`, `billing-do.ts` are 20–60 lines each in both
  apps and *should* be. A binding that supplies an app's config is the seam
  working, not duplication.
- **`Shell.tsx`.** Role-adaptive navigation is a product decision. Already
  argued in the extraction plan §3.2 and still true.
- **The catalog contents.** `DEFAULT_PLANS`, `AI_FEATURES`, the entitlement and
  permission registries. These are the product. Only the code that *reads* them
  moves.
- **Route trees woven through product authorization.** Kova's Stripe handlers
  run through `requireClientAccess` and its notification registry; that weaving
  is the app's.

---

## Suggested order

Ranked by (breakage prevented) ÷ (risk of the move):

1. ~~**UI conformance into `@4dl/ui`.**~~ **DONE** — one file, no runtime change,
   and it stops the divergence everything else on this list is an example of.
2. ~~**The notification surface.**~~ **DONE** — closed a live dead-capability,
   and the DO name was already permanent.
3. ~~**`billing-store` into `@4dl/billing`.**~~ **DONE** — largest prize, highest
   care. It is the money path, and the catalog/store split had to be drawn
   precisely.
4. ~~**Staff/members into `@4dl/auth`.**~~ **DONE** — took Tessa's shape, gave
   Kova the three parts it lacked (see the correction above: it was never the
   invitation itself).
5. **The five generic surfaces**, cheapest first: `tenant-close` (an invariant
   is currently unenforceable), then account, sessions, step-up OTP, audit,
   media.
6. **Offline into `@4dl/app-kit`**, and Kova onto `@4dl/i18n`.

Nothing here is urgent in the sense of "production is broken". All of it is
urgent in the sense that **the third app pays for every one of these twice** —
once by writing it, and once by writing it differently.
