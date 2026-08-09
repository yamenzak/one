---
kind: record
---

# Stage 0 findings

What the proofs changed. This is the output of stage 0 — the types compiling is
the easy half; what they could not express on the first attempt is the half
worth writing down.

Method: write the four types, then express Kova's three hardest routes and
Scena's three hardest collections in them, then assert the mistakes that must not
compile. Six real surfaces, eight negative assertions.

---

## 1. `shape` did not exist, and one route required it

The first `operation` had `permission`, `entitlement` and `customerFlag` as
all-or-nothing gates. Kova's progress read has four lenses in one payload, of
which a customer's package may include two.

All three obvious behaviours are wrong. Refusing takes the ungated lenses down
with the sold ones. Returning everything gives away what was not bought.
Returning a quietly thinner payload makes "withheld" and "empty" the same
answer, so the screen cannot tell either.

`shape: Record<key, flag>` was added, and the response reports `included`. A
type without it would have pushed this back into a hand-rolled per-app check,
which is where it currently lives and why it once shipped ungated.

## 2. `Scope` needed a `platform` variant, with a reason attached

A collection type that assumes tenancy cannot express a licensed catalogue every
workspace draws from. Making the scope a union forces the choice to be stated;
requiring `why` on the platform variant means a table outside the tenant cascade
carries its own justification, next to the declaration, where somebody adding a
cascade will read it.

Verified negatively: `scope: { of: "platform" }` with no `why` does not compile.

## 3. `@ts-expect-error` placement has three cases, not one

Where the directive goes depends on the KIND of mistake:

| mistake | error is reported on |
|---|---|
| a **missing** required field | the call, or the declaration line |
| a **wrong** value | the property |
| an **excess** property | the property |

Getting it backwards produces `TS2578: Unused '@ts-expect-error' directive`,
which reads exactly like the guard having failed to fire. Three of eleven
assertions across stages 0 and 1 were misplaced this way and every guard was
working.

Worth knowing before writing the next negative proof: the failure mode is a
false negative that looks precisely like a real one, and the instinct on seeing
it is to weaken the type rather than move the comment.

## 4. `AppSpec.operations` needs `any`, and that is a real gap

```ts
readonly operations: readonly OperationSpec<B, any, any>[];
```

A heterogeneous array of independently-generic operations has no clean type
without existentials. It works, but it means the app-level composition cannot
check that an operation's `fails` names a declared problem, or that `emits`
names a declared notification.

⚠️ **Those checks are why the manifest exists**, so they cannot be lost. Stage 1
resolves it one of two ways: a builder that accumulates a union as operations are
registered, or a lint that reads the declarations. The builder is better —
compiler over script — and is worth trying first.

## 5. `HelpId` cannot be constructed yet

The proof casts (`"plans.publishing" as never`) because help ids are branded and
no help registry exists. Correct in the long run and awkward now.

Stage 6 declares help, and `HelpId` becomes a key of that registry. Until then,
the cast is a marker: it appears exactly where a real cross-link belongs.

## 6. `exifStrip` is asked of media that has no EXIF

Scena's audio track declares `exifStrip: false`, which is meaningless for an
audio file and reads as a decision somebody made.

⚠️ Left as-is deliberately. The alternative — inferring it from the `accept`
list — makes the safe default depend on a MIME pattern, and the first time
somebody writes `accept: ["*/*"]` the inference silently picks the wrong answer
for images. A meaningless `false` on an audio field is cheaper than a wrong
`false` on a photograph, and this is the one day-zero field where arriving late
helps nothing: stripping metadata next year does not clean what was uploaded
this year.

## 7. Branded outputs are not yet used at the edges

`publishPlan` returns `{ publishedAt: string }` rather than `Instant`. The
branded types protect storage but the proof's own outputs bypass them.

Stage 2 should make the operation's `output` schema carry branded types so the
protection reaches the wire, not just the column. Cheap now, and exactly the
kind of thing that stops being cheap once fifty operations exist.

---

## What did NOT need changing

Worth recording, because it is evidence the shape is close:

- **`defineBindings`** expressed all five of Kova's stores, including a
  content-addressed bucket and a relocatable durable actor, unchanged.
- **`Problem`** covered both apps' failure vocabulary with no additions.
- **`Idempotency`'s three modes** covered every case in the proofs: a read
  (`none`), a natural key (`planId`), and a provider's event id
  (`client-supplied`).
- **`collection`** expressed a device, an ordered child row and a platform-wide
  catalogue without a special case beyond finding 2.

## Verified as unrepresentable

Eight mistakes, each one this repository has paid for, now rejected by the
compiler rather than by review: epoch milliseconds as an instant, a wall date as
an instant, a float as money, money without a currency, a client id as a plan id,
a cache holding personal data, a collection without a version, an operation
without an idempotency decision, and a tool hidden with no stated reason.


---

# Stage 1 findings — the resolution spine

Doors, the global directory, region resolution, standing. Identity, config and
schema composition are still ahead; this is the part everything else hangs off.

## 8. The region brand works, and it replaces a lint

`ResolvedRegion` is `RegionId` intersected with a `unique symbol`, produced by
exactly one function and consumed by exactly one. So a handler cannot reach a
regional store by guessing a region, defaulting to one, or reading one from a
header — only by being handed the one its request resolved to.

Verified negatively in all three forms a mistake would take: a literal (`"eu"`),
a variable typed `RegionId`, and a bare `string`. And mutation-tested — deleting
the brand fails the build with two unused directives.

⚠️ **This is the rule the legacy tree enforces with a lint over source text**
(`storage-chokepoint.test.mjs`), moved up a level. Same guarantee, checked by the
compiler, no script to keep in step with the code.

## 9. `unclaimed` had to be its own door

A well-formed subdomain nobody owns and a *reserved* label must answer
identically to an outsider, or probing for `admin` and `_acme-challenge` tells
somebody which names are special. But the product needs the distinction
internally, to explain a refused signup rather than a mysterious 404.

Same status, same body, different `door`. A single `invalid` could not carry
both, and a boolean beside it would have been read as "which 404 is this" rather
than as a decision.

## 10. Tenantless doors must not read the directory at all

`root`, `setup`, `admin` and `device` resolve no tenant, and the test asserts
this by injecting a directory that **throws** — so "does not need the lookup"
is proved rather than assumed.

⚠️ `device` is the one worth knowing. A screen resolves no tenant from its host
because the tenant arrives from the pairing claim: a tenant subdomain would give
every workspace's screens a different address, and re-pairing would orphan a
cache that a television has been living on for months.

## 11. The credential and the session now return different scopes, deliberately

`relyingPartyFor` returns the PLATFORM root; `cookieDomainFor` returns the APP
root. The test asserts they differ, which reads oddly until you know why: one
passkey across every product is the feature, and one session across every product
is the blast radius.

A custom domain is excluded from both. WebAuthn requires the first — there is no
suffix relationship to our root — and whitelabel requires the second, because a
tenant's client bounced to a domain they do not recognise reads as phishing.

## 12. The relying party had to live on the CREDENTIAL, not in config

The obvious shape is one `relyingParty` constant per app. It makes raising the
scope to the platform root a flag day: every existing passkey is bound to the old
value, so the switch either invalidates them or requires a dual-read hack.

Storing it per credential makes the same change additive. An existing credential
keeps resolving exactly where it always did, new ones are created at the root and
work everywhere, and the only thing a person ever sees is a one-time offer to add
one. Nobody is locked out and nobody re-registers under duress.

⚠️ `offerableAt` must test a DOMAIN BOUNDARY, not a string suffix.
`evil4dl.app` ends with `4dl.app` and is a different registrable domain;
offering a credential there is a takeover. Asserted, and mutation-tested by
replacing the check with a naive `endsWith`.

## 13. `validateSession` must never be allowed to take an `Account`

The snapshot is what makes one global identity store affordable: everything the
hot path needs is in the session row, so validation never crosses a region.

That property survives only as long as the function cannot reach the account —
the moment its signature admits one, somebody will use it for something
reasonable and the cross-region read is back on every request in the platform.
It takes an optional `profileVersion` instead, which answers the staleness
question without opening the door.

⚠️ Staleness is advisory, not fatal. A behind-the-times snapshot is a VALID
session; signing somebody out because they changed their avatar would be absurd.

## 14. A role is a back door around a permission unless it is bounded too

`canGrant` alone is not enough. Anybody able to assign roles escalates in one
step — assign yourself the role carrying the permission you were just refused.
`canAssignRole` closes it by requiring the granter to hold every permission the
role carries.

Invisible without the check: no error, no log, and nobody notices until somebody
has been an owner for a month. Mutation-tested.

## What stage 1 still owes

`DEFER` markers carry these; they are not prose here. Identity and Better Auth,
config, schema composition, and turning `regionalBindings` from a shape into a
real resolver.
