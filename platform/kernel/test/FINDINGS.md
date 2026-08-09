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

## 15. The schema version is computed now, and the scar is designed out

The previous runner carried a hand-written version per module and short-circuited
on a marker row. Forgetting the bump made a new table INVISIBLE on a fresh
database and fatal on every existing one — never created, and every route
touching it answering 500. The mitigation was a paragraph asking people to
remember, and it shipped anyway at least once.

Hashing the content removes the choice: a module that changed re-runs, one that
did not does not, and there is nothing to forget. Per SECTION, so editing a
backfill does not re-run the DDL.

⚠️ Re-running has to be safe by construction for this to work, so
`validateModule` refuses anything that is not — non-`IF NOT EXISTS` DDL, an
`ALTER` that is not `ADD COLUMN`. **A module that cannot be re-run cannot be
declared.** The hash is only sound because that rule is enforced above it.

FNV-1a rather than a cryptographic hash: the question is "did this change", not
"can an adversary forge a collision", and a synchronous pure function keeps the
whole module testable without Web Crypto.

## 16. Dependencies are declared, not implied by array order

The previous runner took order from the array and explained the rule in a
comment. A wrong order did not fail — the `ALTER` hit a table that did not exist,
the runner swallowed it, and a column silently never appeared. `after` makes it a
validation error at composition time.

Two modules creating the same table is caught the same way, and it is the more
expensive one: `CREATE TABLE IF NOT EXISTS` is won by whichever runs first, the
loser's columns never exist, and the failure surfaces as a query error on one
route long after the change that caused it.

## 17. `unscopedTables` reports rather than refuses

An unscoped table is not automatically wrong. A plan catalogue, a licensed
library and a webhook seen-set are all correctly outside a tenant cascade —
putting one in deletes it for everybody on the first erasure.

So the check surfaces the list rather than failing on it. The decision belongs to
the app, made once, in the open, instead of by omission — which is what the
hand-written delete list it replaces was.

## 18. Config falls through on EMPTY, not on ABSENT

Every consumer reads `""` as unconfigured, so a blank local row must fall
through to the shared value rather than mask it. Otherwise an operator who opens
a settings screen and saves it without typing anything silently switches off a
key that was working.

⚠️ The consequence is real and worth stating at the declaration: you cannot turn
a shared key off for one app by blanking it. Give that app its own value, or do
not share the key.

Sharing is also enforced on WRITE, not only on read. An unshared key that reaches
the shared store is invisible until a second app resolves it, and by then it is
another product's problem with no trace of where it came from.

And a secret is write-only: settable, its *set-ness* visible, its value never
returned. A console that can display a secret key leaks one through any read
vulnerability, a screen share, or a support session.

## What stage 1 still owes

`DEFER` markers carry these; they are not prose here. The WebAuthn ceremony and
the real regional resolver — both library bindings rather than design.

---

# Stage 2 findings — the surface

## 19. `kind: "read" | "write"` had to be added, and stage 0 missed it

Three things depend on it at once: the HTTP method, whether the standing gate
refuses the call, and whether a response may be cached. Stage 0's operation had
none of them, because nothing yet consumed the declaration.

Inferring it from `outcome` or `audit` being present was the tempting
alternative, and wrong: one subtle signal deciding three things, whose failure
mode is a write treated as a read — a mutation surviving a read-only workspace.

## 20. The operation id IS the path, deliberately against REST

A resource-and-verb mapping has to decide which segment is an identifier, and
which verb expresses "publish", "grant" or "reconcile". Those decisions have no
right answer and must then be made IDENTICALLY by the router, the typed client,
the OpenAPI document and whoever writes the tool description.

The id is already unique and already the name. `GET /api/<id>` for a read,
`POST /api/<id>` for a write. There is no mapping to get wrong in four places,
which matters more here than REST's conventions do.

## 21. ⚠️ Row scope is REPORTED, not skipped

`check` is pure so that `toolsFor` can filter a catalogue without touching a
store. Row-level scope needs a database read, so a pure gate cannot perform it.

Returning `scopeRequired` makes it an OBLIGATION the runner must discharge rather
than an omission nobody sees. A gate that silently dropped it would be the worst
failure in the module — every other refusal is visible, and that one is not.

## 22. The equivalence is asserted, not sampled

Stage 2's exit criterion is that the assistant "is refused exactly what the user
would be", which is an equivalence — so the test compares the tool catalogue
against the gate for every operation against every caller, rather than checking
a few cases.

Mutation-tested by deleting the gate from `toolsFor`: the equivalence fails
immediately, where a sampled test might not have covered the caller that
exposed it.

⚠️ The design point underneath: `toolsFor` calls `check`. It does not reimplement
it, and it does not read a parallel list. Two registries kept in step by hand is
how a product ships an assistant that can do more than the person operating it,
with nothing failing anywhere.


`DEFER` markers carry these; they are not prose here. Identity and Better Auth,
config, schema composition, and turning `regionalBindings` from a shape into a
real resolver.

---

# Stage 3 findings — data

## 23. The derived DDL is put through the runner's own validator

Stage 1's rules exist because each fails SILENTLY: a missing terminator
concatenates statements, a `--` swallows the batch, a non-idempotent `CREATE`
breaks the second run. A generator is precisely the thing that could violate them
at scale and consistently.

So `deriveSchema`'s output is fed to `validateModule` and `validateComposition`
rather than trusted alongside them. That assertion is where stages 1 and 3 meet,
and it is the cheapest possible way to keep a generator honest.

## 24. A column collision has to be caught by us, not by SQLite

`lastSeen` and `last_seen` both become `last_seen`. SQLite would reject the
`CREATE` naming the column but not the two declarations that produced it — and a
field colliding with a SYSTEM column (`version`, `id`, `tenant_id`) would shadow
machinery the platform depends on, which is worse than a rejection.

`deriveSchema` returns problems rather than throwing, because a generator that
stops at the first one reports one of five.

## 25. Money becoming two columns is what makes the type real

`Money` as a type is a promise; `total_minor INTEGER` + `total_currency TEXT` is
the promise kept. A single `REAL` column would reintroduce the floating-point
total the type exists to prevent, and an amount stored without its currency is a
number somebody eventually adds to a different currency's number.

Mutation-tested by collapsing it to one column.

## 26. ⚠️ The naming series had a real bug on the first attempt

`.YYYY.` is delimited on both sides because something follows it. The counter is
written `.####` at the END of a series — `INV-.YYYY.-.####` — where there is
nothing to delimit against, and requiring the closing dot left the placeholder in
the output verbatim.

Every document would have been named `INV-2026-.####`. Caught by a test written
against the convention people actually write rather than against the
implementation, which is the argument for writing the assertion from the
requirement.

## 27. Optimistic concurrency is about the tool, not the two humans

Two people editing one record is the case everybody pictures when arguing for a
version column. The case that actually bites is a tool call racing a person:
same defect, worse timing, and nobody watching. The assistant reads, the person
saves, the assistant writes back what it read, and the person's change is gone
with no error anywhere.

The expected version must come from the READ the writer based its change on,
which is why it is a parameter rather than something the function could look up
for itself — a lookup would compare the row to itself and always succeed.

## 28. Relocation and erasure derive from one declaration, and media is COPIED

A relocation is the purge with `SELECT` instead of `DELETE`, so a collection
cannot be forgotten by one without being forgotten by the other.

⚠️ Media is copy-only. A content-addressed object is referenced by every tenant
whose content hashed the same; moving it breaks all of them, and the breakage
surfaces weeks later on a device replaying a cached manifest offline. The bucket
deduplicates; the accounting does not.

## 29. `defineApp` had never been tried, and it was the only type that mattered

Every other proof exercised one type against one hard surface. Nothing assembled
a whole app — so the entry point every app touches first was the one piece with
no evidence behind it. Writing `proof.app.ts` cost an afternoon and immediately
surfaced a day-zero field (`seats`) that was optional, which is the same as
absent: an app that omits it is indistinguishable from an app with no ceiling,
right up until somebody is billed for the difference.

The general form: **a composition root is the last thing anybody proves and the
first thing everybody uses.** Prove it early.

## 30. The platform root fell through to the custom-domain lookup

`classifyHost` matched this app's root, then its labels, then treated everything
remaining as a tenant's own domain. The platform root — `4dl.app`, one level
ABOVE the app root — matched neither, so it landed in the custom-domain branch
and would have been resolved by a lookup in the directory of domains tenants own.

That is the address every product's credentials are scoped to. A fallthrough
whose default is "somebody else's domain" needs the cases above it to be
exhaustive, and "ours but not this app's" was the case nobody enumerated.

Found by a test asserting that every tenantless door resolves no tenant — a
property, not a case. The case would not have been guessed.

## 31. A guard registry is a guard, and the thing it catches is prose

Documents claim enforcement. "Enforced by a lint", "fails the build", "the guard
says so" — each costs nothing to write, reads as safety, and is expensive to
disprove, so an unbuilt one survives review indefinitely.

`docs/guards.json` makes every claim an entry, and three rules make the entry
worth something: a live guard names a literal string its implementation
contains, so a rename cannot silently retire it; a live guard must be reachable
from a script that actually runs; and an outstanding one names a stage, which
may not be `shipped`. The tables in the documents are GENERATED from it, so
prose cannot name a guard that does not exist.

⚠️ The registry immediately caught six of its own entries pointing at checks
nothing invoked, because `pnpm gate` did not yet call them.

## 32. The directory read is itself a query, so boot cannot run after resolution

The pipeline resolved the host, read the tenant from the directory, then applied
the schema. On a fresh database that reads a table that does not exist — and the
failure is not a degraded feature, it is every request 500ing from the first line
of the pipeline, including the ones that would have created the schema.

The general shape: **a step that discovers where to look cannot come after the
step that prepares where to look.** Boot is memoised as a promise rather than a
boolean, because concurrent first requests would otherwise each start their own
composition, and two runners racing on one marker table leave a state neither of
them describes.

## 33. One composition per REGION, not one per deployment

`onBoot` was handed the default region's bindings, so a tenant placed in a second
region resolved correctly, reached the right database, and found nothing in it.
Every part of that is working except the one that matters.

Booting is now lazy per region: a region nobody is in costs nothing, and the
first request to one composes it. PLAN.md §4.3 predicted this ("`applySchema`
runs per app × region — six gates, not one"); it still had to be met to be
believed.

## 34. An always-allowed lane opens the STANDING gate and nothing else

Standing is a fact about a workspace; permission is a fact about a caller. The
pipeline skipped the whole of `check` for the lanes that survive every rung of
the billing ladder — so signing in, paying, leaving and every webhook would have
answered to anybody who asked for them.

The fix is one line and the lesson is the shape: a bypass must name the gate it
opens, not the function it skips. `check` is one call answering four questions,
and "this lane is exempt" was true of exactly one of them.

## 35. A guard's first failures are its own — again, four times out of four

The chokepoint guard's opening run reported four violations. Three were the
guard: it read comments (which state the rule and therefore name the very thing
being refused), and its pattern read the module specifier `./env.js` as a
property access, flagging every import of the chokepoint itself.

The fourth was real, and it is the one worth having: a second place indexed the
environment, for a reason that cannot be designed away — the directory is what
answers the region, so it cannot be reached through a resolver that requires one.
Moving it INTO the chokepoint kept the count of files that touch an environment
at one, which is the whole value of the word.

## 36. Reachability needs private declarations, and an entry file is a root

An "unproved export" check over exported symbols alone reports the base of a
hierarchy as dead: a private type is often how an exported one is reached. And an
app's worker is exercised by driving it over HTTP rather than by naming its
symbols, so an entry point's glue is a root — while a BARREL is not, because
re-exporting everything would make everything reachable and the check vacuous.

Neither refinement weakens it: only exports are reported, and an entry's root is
its imports and default export rather than its declarations, so an unused export
in an entry file is still found.

## 37. `permission: "public"` was not satisfiable, and the fix is a declaration

Signing in must work with no session, so the identity operations declared
`permission: "public"` — a string no caller could ever hold, so every one of them
answered 403 and the whole lane was unreachable.

The fix is not an optional `permission` field where omitting it means public.
That makes the most dangerous state in the system the one you get by forgetting
to type something. `PUBLIC` is a declared constant the gate knows: an operation
with no permission does not compile, and a public one says the word.

## 38. A cookie a browser drops is a sign-in that reports success

`cookieDomainFor` widened to the app root from any host under our own roots,
including the PLATFORM root — which sits above the app root. A host may only set
a `Domain` that is a suffix of itself, so that `Set-Cookie` is discarded without
a word: the request answers 200, no session exists, and the person trying to sign
in cannot tell it apart from a wrong code.

The general shape: **a header the browser silently ignores is worse than one it
rejects**, because there is no failure anywhere to attach a message to.

## 39. Registration must require a session, and that ordering is the design

The passkey lane looks like the strong one and the emailed code looks like the
weak one, which makes it tempting to build passkeys first. Done that way, anybody
who can type an address attaches a credential to it — and the strongest factor in
the product becomes the cheapest way to take an account over.

So the code lane is what proves an address, it is the only lane that may run with
no session behind it, and it is therefore the only one that needs a rate limit.
Passkey registration requires a session, always.

## 40. Delete-then-judge, not read-then-check-then-delete

A challenge read, validated and then deleted leaves a window where two requests
both see the same unused row — which is exactly the replay a challenge exists to
prevent, arrived at by being careful in the wrong order. `DELETE … RETURNING`
makes the delete the CLAIM and its result the verdict.

Mutation-tested by turning it back into a `SELECT`: the replay test fails.

## 41. Two more guard bugs, and both hid whole categories

`export async function` was invisible to the reachability graph — neither
reported nor able to prove what it referenced — so an entire file's exports read
as dead while the async functions that used them were never checked at all.

And the vocabulary check's case-insensitive flag made `[a-z]*` match uppercase,
so `clientDataJSON` matched the noun `client`. The narrow fix was a file-scoped
exemption naming ONE noun with a reason: a wire protocol's field names appear a
dozen times in the file implementing it, and a dozen line exemptions teach
everybody that exemptions are routine.
