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

## 42. `const` on the wrong parameter destroys inference

Preserving `fails: ["a.b"]` as a literal looked like a job for `const S extends
OperationSpec<B,I,O>`. It works, and it takes `I` and `O` with it: every
`scope: (i) => …` and `audit: (i) => …` callback loses its parameter type,
because `I` is now inferred from `S` rather than from `input`.

The fix is to give the ONE field that needs literals its own type parameter.
General advice with a specific edge: `const` on a whole spec is a blunt
instrument, and the blast radius is every other inference site in it.

## 43. A widened literal makes a type-level check vacuous, silently

`defineApp` refuses an operation that fails with an undeclared code. It compiled,
passed, and proved nothing: `fails` was typed `readonly string[]`, so the check
computed `Exclude<string, "a" | "b">`, which is `string`, which satisfies the
index signature it was compared against.

⚠️ **A type-level assertion needs a negative case exactly as much as a runtime
one does.** `@ts-expect-error` on a deliberately-wrong composition is what caught
this — the directive reported itself unused, which is the type system saying the
check was not firing.

## 44. A `declare const` symbol is `undefined` at runtime

The optional-field marker was `declare const OPTIONAL: unique symbol`, which is a
type-only declaration. The type worked; the runtime lookup became
`obj[undefined]`, so `isOptional` returned false for everything and every
optional field silently became required.

The rule: **a brand read at runtime must exist at runtime.** `const X: unique
symbol = Symbol.for(…)` gives both halves; `declare const` gives only the type.

## 45. The layering test refuses a module it has no layer for

Adding `validate.ts` turned the suite red — not because it violated the
direction, but because it was absent from the map. That is the check working:
the alternative is a new module that quietly belongs to no layer and may import
anything, which is how a layered design stops being one.

## 46. Deriving the operations is where the manifest actually pays

`hello` declares two collections and writes no routing at all. List, read,
create, update, archive, the document lifecycle and the activity log are all
derived — and with them the tenant predicate, the archived-row clause, the
version check and the audit entry, each applied in exactly one place.

The value is not the lines saved. It is that a hand-written list which forgets
the tenant predicate returns every tenant's rows through the same code path, in
the same shape, with more results — and there is no version of that a reviewer
reliably catches on the four hundredth route.

## 47. Deriving them in the APP makes "declare and forget to mount" expressible

The first version had the app compose `collectionOperations` and pass the result
to `createRuntime`. That is the failure this platform was started over, one layer
up: a collection declared, its table applied, and no route to reach any of it,
with every suite green.

The runtime derives them from `app.collections` now, so the mistake cannot be
written. It also fixed a typing problem for free — mixing `AnyOperation` into a
typed `operations` array widened the binding generic and lost `ctx.bind.db`.

## 48. A product rule in a handler was a field declaration in disguise

Replacing the hand-written writer removed a check on an empty title, and the
first instinct was to put it back in the derived one. It belonged in the field:
`required` asks whether the key is present, `min: 1` asks whether the value is
worth storing, and a record titled `""` is one nobody can find again.

The general form: **before adding a rule to a handler, ask whether the
declaration could carry it.** One that can is enforced on every transport, shown
in the API document, and inherited by every app.

## 49. Mutation testing found two coverage gaps a green suite hid

Two mutations survived, and both were absences rather than weak assertions.

**Nothing asserted tenant isolation within a region.** The cross-tenant test used
two workspaces in DIFFERENT regions, so separate databases separated them for
free and removing the predicate entirely changed nothing. Two tenants in one
database is the case that needed writing.

**Nothing proved `copyTenant` verifies.** The verification test called
`verifyTenant` directly, so replacing the call inside the copy with a hardcoded
success passed. A relocation reporting a success it never checked sends a
workspace to a region missing part of itself.

⚠️ Both suites were green, both properties were "obviously" covered, and neither
was. A mutation that survives is the only reliable way to find a test that
asserts the wrong subject.

## 50. An exhaustive sweep that verifies with the function under test proves consistency, not correctness

The contrast sweep walks every hue at every ambience intensity in both themes and
asserts that ink clears its floor everywhere. Replacing `bestForeground` with a
lightness threshold — the exact rule the design rejects — left it green.

Because the sweep reads its ratios back through `inkOn`, which calls
`bestForeground`. With the wrong rule in place it was measuring the result of the
wrong rule with the wrong rule, and agreeing with itself. Every one of the eleven
other mutations was caught; this one survived a suite built specifically to catch
it.

⚠️ **A verifier that shares an implementation with the thing it verifies checks
that they agree.** The fix is one assertion that computes both candidates in the
test and demands the function return the better — the only check in the file that
does not depend on what it is checking. Worth asking of any property test: if the
implementation were wrong in the most plausible way, would this still fail?

## 51. Two constraints on the accent, and the second is invisible until swept

An accent must be visible AGAINST its surface and able to carry INK when used as
a fill. Satisfying only the first passes every review: the colour looks right on
the page. It fails for 74 of 144 hue-and-theme pairs at the moment somebody puts
a label on the button — mid-lightness saturated colours, where near-white and
near-dark are both borderline, so neither ink works.

A hand-picked palette never meets this because a designer chose colours that
happened to work. A tenant choosing their own hue meets it immediately.

## 52. A cap on top of a range makes the range's upper half do nothing

`RANGE.ambienceIntensity` allowed 0–0.06 and the ground resolver quietly capped
it at 0.02. So a tenant could move the control across half its travel and see no
change, and the sweep proved the safety of a range the product did not offer.

⚠️ **A bound belongs in one place.** A second one downstream is not defence in
depth — it is a different contract, silently winning.

## 53. The hue-distance comparison was inverted, and it read as working

`Math.abs(((a - b + 540) % 360) - 180)` is the circular distance: 0 for identical
hues, 180 for opposites. The collision check tested `180 - distance < 30`, which
fires on COMPLEMENTARY colours — the pairs least likely to be confused — and
never on the identical ones it exists for.

It looked like a considered piece of modular arithmetic. Nothing about reading it
suggested the direction was backwards; the test that asserted "green on a green
ground collides" is what said so.

## 54. Two states that render identically are two states one of which is a lie

The state matrix's obvious assertion is that every declared state renders without
throwing. That passes for a component whose `busy` looks exactly like its `idle`
— and so does the photograph, because the two images match.

The assertion worth having is DISTINGUISHABILITY: every declared state produces
different output from every other. A declaration says a state was considered; the
render is what says it was designed.

## 55. A locked control is not disabled, including to assistive technology

Marking a plan-gated control `aria-disabled` announces the opposite of what it
does. It is actionable — pressing it is how somebody reaches the plan that would
unlock it — so it stays focusable, stays announced, and carries the way out.

`disabled` is for a control that is genuinely inapplicable, and it still says
why. Neither may render a refusal with no reason: that is not a degraded button,
it is a dead end, and shipping one silently is how a product accumulates controls
nobody can get past and nobody can describe.

## 56. An app's screen is where the boundary is provable rather than stated

The renderer-boundary guard passed with zero apps having any `.tsx` at all — a
green line produced by nothing, which is what the guard registry exists to make
visible. Giving `hello` one screen made it real, and the screen is the argument:
no shell, no navigation, no dialog, no empty state, no loading state, no button.

Four distinct states — not yet, nothing, failed, ready — come out of one prop,
and the app wrote none of them.

## 57. The invoked check did not know about `.tsx`, so a whole suite could be inert

Registering the component tests as guards failed on the invocation rule, which
matched `.test.ts` only. Widening it exposed the sharper question: vitest's
default include does not pick up `.tsx` either, so a suite of component tests can
sit in the tree, be registered, and never run.

The check now reads the package's own vitest config and refuses a `.tsx` guard in
a project that does not include one. Same shape as every other guard here — the
failure it prevents produces a green line rather than a red one.

## 58. A lookahead after `\s*` inspects the wrong characters

The motion guard forbids a literal `transition:` outside `motion.ts`, and the
reduced-motion reset legitimately writes `transition: none !important`. The
exemption was a negative lookahead — and placed after the whitespace class it
backtracked past it, so the regex matched with `\s*` consuming nothing and the
lookahead inspected `" non"` rather than `"none"`. It refused the very line it
was written to allow.

A lookahead belongs at the position whose alternatives it is describing. Anything
variable-width before it means the engine gets to choose where "there" is.

## 59. A selector exported so a guard can compare against it is a second copy

The shell first exported the string a stylesheet also contains, so the guard
could assert the two agreed. That is two declarations of one fact, and the
reachability graph correctly reported the export as unproved: nothing in the
platform used it except a check about it.

The structural form is the honest one — the guard reads the source and asserts
the shape it needs. A named constant to keep in step with the CSS it describes is
one more thing that can drift, added in order to detect drift.

## 60. Server rendering cannot distinguish a moved subtree from a remounted one

"The live surface is moved, never remounted" is the whole promise of a picture-in-
picture host: the video keeps playing, the timer keeps counting, the scroll
position survives. The natural implementation failure is a branch per
presentation — one host inside the dock, another inside the pane — which React
unmounts and rebuilds on every transition.

`renderToStaticMarkup` produces byte-identical output for both. The mutation
survived every behavioural test, and would survive any test that can be written
against static output, because the difference is in the reconciler and not in the
markup.

So the check is structural: the host element and the slot it renders each appear
exactly once in the shell's source. A property no runtime assertion can observe
is one a reader of the file can, and the guard reads the file.

## 61. Shipping a stage is what forces its deferrals to be discharged

Stage 4 flipped to `shipped` and three markers came due at once — shared-element
continuity, the persistent live host, the contained form. None was forgotten;
each was waiting on the shell, which is the surface that owns both halves of a
transition, hosts a subtree across presentations, and emits the tokens.

That is the mechanism working as designed rather than a coincidence. A deferral
attached to a stage cannot outlive it, so the last increment of a stage is
always the one that collects everything the stage promised and could not do
until its final piece existed.

## 62. A capability that is sold and enforced nowhere is worse than one that is free

It appears on a price list, a workspace pays the difference for it, and every
workspace that did not pay has it anyway. Nothing fails, no test goes red, and
the only signal is a support conversation about why the cheap plan does the
expensive thing.

Two products shipped exactly that, and one shipped it through a builder that
rendered a switch for every declared capability — so adding one was a single
line and forgetting to enforce it was invisible.

The fix is not a grep over source, which is what the legacy repo used and what
gets waived the first time a destructured lookup defeats it. An entitlement
declares HOW it is withheld — a gate, a ceiling, a shaped response — and the
mechanism it names is a field on an operation, so composition can ask whether an
operation really names it. The manifest that would sell something nothing
withholds does not boot.

## 63. The honest exemption carries a reason, and that is what makes it survive

`reserved: true` and `uiOnly: true` are the same decision as `{ unenforced:
"no plan in the catalogue enables it" }`, and only one of them is still legible
after its author has left. A boolean exemption is indistinguishable from an
oversight; a sentence is a decision somebody made, and the next reader can tell
whether it still holds.

## 64. A coverage check that reads `operations` alone passes every app it matters to

The first version walked the operation list. `hello`'s is empty — every surface
it has is derived from two collections — so the check reported full coverage over
nothing and passed.

That is not an edge case, it is the shape the platform exists to encourage. A
whole-manifest question has to read the whole manifest, and the parts an app
writes least are the parts most likely to be the only ones there.

## 65. A set of entitlement names cannot answer the question half of them are

Half of what a plan sells is a number. A gate holding only the keys can answer
"is this included" and never "is there room for one more" — so the count gets
asked somewhere else, against some other copy of the plan, and the two answers
drift. Carrying the resolved VALUES makes the second lookup unnecessary and the
drift unrepresentable.

The mutation that caught this was replacing `grants(value)` with `key in
entitlements`: a caller holding `reports: false` was admitted, and every test
passed, because no caller in any test carried a falsey entitlement.

## 66. A returned obligation nobody discharges reads exactly like an enforced limit

`check` is pure so a tool catalogue can be filtered without touching a store, so
a ceiling is REPORTED — `quotaRequired` — for the runner to count. The code
reads as though the limit is enforced from the moment the field exists, and the
runner not acting on it is invisible at both ends.

Two things close it. The runner counts, and a mutation proves it does. And a
ceiling nobody CAN count is refused at composition: an operation naming a key
that no collection counts and no app supplies a counter for is a limit on a
price list that refuses nothing, so the deployment does not start.

## 67. The parking state is not a verdict, and materialising it is how that is forgotten

A workspace with no subscription row and one whose row says "never started
paying" are the same situation, and the honest answer for both is `active` —
because the alternative is a deployment with no payment provider holding every
workspace read-only over a bill nobody could have paid.

A product wrote that paragraph, at length, and shipped the bug anyway: the
fallback branch returned the stored status verbatim, so the moment anything
materialised the row, the parking DEFAULT was read as a decision. Here the
parked subscription is a VALUE and never a row, and whether non-payment gates
anything is one boolean the deployment answers rather than a fact a handler
infers.

## 68. Two override stores that share one write path make a support gesture a one-way door

Grandfathering holds an existing workspace at what it was sold when a plan is
edited down, so it may only ratchet up. An operator adjustment is deliberate,
absolute and reversible per key. Sharing one blob and one raise-only merge meant
"give this workspace ten seats" could only be undone by a reset that discarded
the grandfathering with it.

They are separate stores with opposite rules, and the standing clamp runs after
both — last, permanently, because an adjustment applied after it is a way around
the payment ladder wearing a support gesture's clothes.

## 69. A maximum and a sum agree whenever the other term is zero

"The headline day count is a maximum across scopes" was asserted with one live
scope and one spent one — 0 and 60 — where `Math.max` and `reduce((a,b)=>a+b)`
return the same 60. The mutation survived until a second live scope existed in
the fixture.

Any assertion about combining values needs at least two that are both
interesting. A zero is not a value, it is an identity, and an identity makes
every operator look like every other one.

## 70. An equivalent mutant is a dead expression, not a missing test

`current.packageId ?? pkg.id` survived every test — and it had to, because the
`ON CONFLICT` clause it feeds does not update that column, so the fallback is
reached only when there is no current row and `current.packageId` is therefore
always null.

The mutation was not a gap in the suite. It was the suite correctly reporting
that the expression has one branch. The mechanism that keeps the opening package
is the absence of `package_id` from the update clause, and now the code says so
instead of implying a choice that is never made.

## 71. A once-only package granted first cannot tell the two implementations apart

The defect being guarded against is asking the live access row whether a package
was bought before — which answers correctly for the package that OPENED the row
and "never" forever for everything after it.

A test that grants the once-only package first makes the row's own package id
equal to it, so the wrong implementation and the right one agree. The fixture has
to sell a repeatable package first. The property under test was never about one
purchase; it was about the second one.

## 72. An event that cannot be placed has two honest answers, and `200` is neither

A handler that could not work out whose payment event it was answered
`200 {received: true}` — with the id already recorded, so the provider marked it
delivered and never retried. Money captured, nothing granted, no error anywhere.
The only surviving trace was a customer asking why they had been charged for
something they did not have.

Applied, or parked where an operator can read and replay it. There is no third,
and a parked table nobody can read is the same silent success with an extra
table — which is why the dead letter's surface is registered as a guard rather
than left as a good intention.

## 73. A signature over the body alone is a recording anybody can replay

The timestamp is part of what is signed, and the tolerance is what makes it
matter. Without it a captured request stays valid forever, so one successful
payment notification can be posted back as often as somebody likes against as
many event ids as they can mint. The applied-event key catches a replay of the
*same* event; the tolerance is what stops the endpoint being a general-purpose
oracle.

An endpoint with no secret configured refuses. It is public by construction — a
provider cannot hold a session — so the signature is the whole of the
authentication, and a permissive default there is an open door that grants paid
access to whoever finds it.

## 74. A property no test can observe is still a property of the source

A digest compared with `===` returns as soon as two characters differ, so how
long the comparison takes measures how much of it was right — enough to forge a
signature without ever knowing the key. A fast compare and a constant-time one
agree on every input, so no functional test can tell them apart, and the
mutation survived every assertion in the suite.

Same shape as the live-surface host in stage 4: when behaviour cannot carry the
property, the guard reads the file. Two of these now exist, which is enough to
say it is a category rather than an exception.

## 75. A claim resolves silence, never a contradiction

One provider account serves every product here, so an event arrives that may
belong to any of them. Attribution is metadata we wrote, then a lookup on the
provider's customer reference — and the order is not a preference. If the event
names an app and it is not this one, the lookup is not consulted at all;
otherwise a reference that exists in two products lets one of them settle the
other's payment, which is the worst outcome available and the one that looks
most like it worked.

The test that proves it asserts the lookup was never CALLED, because a lookup
that returns the right answer for the wrong reason passes any assertion about
its result.

## 76. The renewal carries none of the metadata the checkout did

A checkout event carries the fields we wrote. The renewal a month later carries
the fields the provider thinks are interesting, which do not include ours — so
unless the customer is recorded the first time an event places itself, every
routine renewal parks. The dead letter fills with ordinary business and each row
is a workspace whose plan quietly lapsed.

The export was flagged as unproved before it was flagged as missing. A
reachability check found a functional gap by asking a structural question.

## 77. `retry: 1` absorbs a real failure in exactly the tests that assert idempotency

The ladder-anchor mutation survived a suite that asserts the anchor does not
move. The first attempt failed correctly; the retry reused the same event id,
took the already-applied branch, changed nothing, and passed.

The retry exists to absorb storage contention, and it does. It also absorbs any
failure in a test whose second run is a no-op — which is every test of an
idempotent path, which is every test of a payment webhook. A fresh key per
attempt makes the retry a real second run; without one, the safety net is
covering the assertions that need it least and hiding the ones that need it most.

## 78. Every query value is text, so a declared number could never be supplied

`?limit=1` arrives as `"1"`, the parser correctly refuses it, and a completely
well-formed request gets a 400. Nothing was wrong with the parser — it was being
handed a document the transport had flattened, and the flattening is what has to
be undone.

Coerced by the DECLARATION, never by looking at the value. Guessing from the
text turns `?code=0123` into 123 and loses a leading zero, which is a whole class
of identifier corrupted by helpfulness.

## 79. A preference must remove the interruption and never the record

Email can be declined, filtered, greylisted, or sent to an address somebody left
two jobs ago. Push can be revoked without telling anybody. If a preference can
suppress the inbox row too, then "I never got that" has no answer that does not
depend on a mail provider — and the honest answer is usually that we do not know.

So the inbox row is written first and unconditionally, and the preference
governs only what interrupts. The mutation that inverts this is one line and
produces a product that appears to work perfectly.

## 80. One category may never be muted, and it is the one that blocks the product

`action` means nothing proceeds until somebody does something: a plan lapsing, a
document waiting to be signed, a workspace about to be erased. Letting it be
switched off makes the product silently stop working for whoever switched it
off, and they will not connect the two — they turned off notifications months
ago and this is a different problem, as far as they can tell.

Categories rather than types, for the related reason: a per-type preference
screen is a list nobody maintains, where every notification added later arrives
switched to whatever the default is. Somebody who carefully turned eleven things
off has a twelfth they never asked for.

## 81. A missing interpolation value should be visibly wrong, not plausibly wrong

`undefined did a thing` reads as a bug in the data. `{who} did a thing` reads as
a bug in the copy, which is what it is, and the first person to see it says so.
The version that ships is the one that looks like somebody else's problem.

## 82. The copy is rendered on read, so a row cannot outlive its wording

Storing the finished sentence is faster and it is what most inboxes do. It also
means the text cannot be translated after the fact, cannot be corrected when it
turns out to be wrong, and keeps saying the old thing forever for everyone who
already received it. What is stored is the type and the values; the words come
from the manifest every time somebody looks.

The corollary is that a row whose type no longer exists is SKIPPED rather than
rendered blank. An anonymous entry with no words is worse than an absence — it
is a thing the reader has to open to discover it says nothing.

## 83. A failed interruption is not a failed operation

The inbox row is already written and the write already succeeded. Letting a mail
provider's outage throw out of the dispatcher reports a completed change as an
error, and the caller retries — which is how one grant becomes two.

## 84. Copy is read by people, so only scalars may reach it

A template with access to an arbitrary object renders `[object Object]` in the
best case and carries a nested value nobody vetted in the worst — into a
sentence a person reads, and that an email sometimes puts in a subject line.
The interpolation source is the operation's own input and result, filtered to
strings and numbers, and that filter is the whole of the boundary.

## 85. The dispatcher belongs to the runtime, because a handler can forget

`emits` already drove the webhook catalogue. Wiring the inbox to the same
declaration means one statement produces the subscription, the inbox row and the
audit entry — and there is no call site that can omit one of the three, send
something different from what the catalogue advertises, or put untranslatable
copy next to a database write.

What the app still owns is the roster: who is in a workspace, and in what role.
That is the one thing a framework genuinely cannot know, and it is passed in
rather than assumed — an app with no roster tells nobody, visibly, rather than
telling everybody by accident.

## 86. Length is a correctness property for help, not a style one

Help is read by somebody who is stuck, on a phone, in the middle of something
else. Past a screenful they stop reading and ask a human — which is the outcome
the article existed to prevent. A long article is not a thorough one, it is a
failed one, and the ceiling is set somewhere uncomfortable on purpose.

The step limit works the same way. An eighth step is not a documentation
problem; it is a missing feature, described.

## 87. Nine words are enough to catch the habit

"The endpoint returns null" is true and unusable. "Nothing is saved until you
press Save" is the same fact, for somebody who has to act on it. Every word on
the refused list means the author was describing the implementation rather than
the task, and the list is small and unambiguous on purpose — a large one becomes
a thesaurus argument in review, and the failure being caught is always the same
one: writing for us.

Word boundaries matter in both directions. `schematic` is not `schema`;
`database-backed` is `database` with punctuation in it, and is the same habit.

## 88. A help id that is only a branded type is still an arbitrary string

`HelpId` made two arbitrary strings different types and left both arbitrary. The
proof carried `help: "plans.publishing" as never` for six stages, and the article
did not exist — which nothing could have discovered, because there was nothing to
compare it against.

The reason it matters more than a normal dead link: it is rendered beside an
error. Whoever follows it is already stuck, so it is the second failure in a row,
and that is where people stop trying.

## 89. A changelog and a commit log describe the same change, and one is already written

That is the whole mechanism by which a changelog fills with file paths, type
names and pull-request numbers: the copy is right there, it is accurate, and
pasting it is free. Then nobody outside the team can read it, so somebody starts
a second hand-curated changelog for customers, and within a month the two
disagree about what shipped.

Five patterns catch it, and all five are about naming something the reader
cannot look up.

## 90. A deletion, a rename and a typo look identical in a diff

They need opposite fixes. So a manifest may add anything freely — nobody holds
what did not exist — and may only REMOVE something by naming it as retired, with
a reason. The lock is the last surface that shipped, committed beside the code.

It covers derived operations, which is the case a hand-kept list misses:
renaming a collection silently removes seven operations at once, and every
client calling any of them breaks together.

## 91. A rule that is implemented and not called is worse than one never written

The help and changelog checks were fully tested as pure functions and wired into
composition — and three mutations that deleted the wiring entirely survived,
because every test was of the function rather than of the manifest that has to
run it.

That is a category, not an oversight: a pure check has a natural home in a unit
test, and its call site has no natural home at all. Every check reachable from
`assertComposable` now has an assertion that goes through `assertComposable`.

## 92. A worker has no filesystem, so the check about the repository lives elsewhere

The manifest lock is a file the app commits, and the suite that can evaluate the
manifest runs inside the Workers pool, which can read it and cannot write it.

The split is on "does this need a worker", not on "is this a unit test" — one
project for behaviour against the real runtime, one for the checks about the
repository. Splitting on the other axis would put half the behavioural tests in
front of a mock, which is how a suite comes to test the mock.

## 93. Export and erasure differ by one verb, so they must read one plan

A table that can be forgotten and not exported is a workspace losing something
it was never offered a copy of. One that can be exported and not forgotten is a
promise broken. Two walks over the same declaration agree on the day they are
written and disagree the first time either is touched — silently, in both
directions.

There is no list here at all: every schema module already declares which of its
tables carry a tenant, and both paths read `tenantCascade`. A hand-written
version in a shipping product named seven tables against a declaration of
twenty-five, so a deleted workspace kept its media library, its history and its
generated content while the sweep reported success and emailed the owner to say
otherwise.

## 94. A truncated export that says nothing is a false claim about somebody's records

The ceiling is necessary — unbounded, one large workspace exhausts the worker and
the export fails entirely, which is worse than a partial one because a failed
export gets retried at exactly the same size. What is not optional is saying what
was left out. Silence there reads as "this is everything you had", made in
writing, at the moment somebody is leaving.

Same shape as the dead letter and the derived list: a bounded thing that does not
report its bound is indistinguishable from an unbounded one that happened to fit.

## 95. A half-erased workspace looks exactly like one where erasure did not run

Every delete is allowed to fail, because a database that predates a module
legitimately lacks its tables — and a purge that threw on the first absent one
would stop partway with no signal at all. So the failures are collected and
REPORTED: "that table never existed here" and "erasure has silently stopped
covering it" have to be different answers to whoever reads the result.

## 96. Maintenance is about us, and every decision follows from that

The standing ladder closes one workspace over one workspace's bill, and the
person seeing it can pay or leave. Maintenance closes every door because an
operator said so — nobody reading it did anything, nobody can pay to end it. So
the copy differs, the exemptions differ, and the check sits ABOVE the public lane
rather than after the session read: "sign-in is disabled" is a claim about a lane
that has no session yet.

Two exemptions, both machine lanes with no person behind them. A deployment
nobody can probe is one nobody can tell has recovered, and a payment provider
retries into a closed door until it gives up — on money.

## 97. A switch that fails closed on a malformed value cannot be turned off

The stored maintenance state is JSON, so it can be unparseable — from a partial
write, an older shape, or a hand edit during the incident it was set for.
Reading that as "closed" takes a whole deployment down, and the operator's way
to fix it is a request, which would be refused.

Fail open here and fail closed on the ladder. The difference is whose mistake it
is: theirs is non-payment, ours is a corrupt row.

## 98. A deployment-wide switch cannot be tested beside anything else

The maintenance suite turned every door off for whatever shared the database, and
three unrelated tests went red reporting a 503 from endpoints with nothing to do
with the one that closed the door. Serialising files did not fix it; the suite
now runs in its own invocation.

The split is on "does this affect the whole deployment", which is a property
anybody can check, rather than on subject — and exactly one thing qualifies. That
is the second axis this app has been split on (the first was "does this need a
worker"), and both are about what the test DOES rather than what it is about.

## 99. A slow suite is not run less often — it is not run

Skipped locally with a filter, waited out once in review and trusted after that,
and eventually the reason somebody proposes a fast lane that becomes the only one
anybody watches. So the budget is a guard rather than a preference, one number
for every app, and it MEASURES rather than asks: a budget nobody times is a
comment.

Every way of coming in under it is a good change — fewer fixtures, a shared
world, a unit test where an integration test was doing its work. The bad way,
deleting coverage, is visible in the same diff.

## 100. The value of a scaffold is not the typing it saves

It is that everything the platform learned arrives switched on. A hand-started
app is one where somebody chose which pieces to wire, and the pieces they did not
choose are invisible: an inbox with no surface, a maintenance switch nothing
reads, an erasure covering whichever tables were fashionable that week. Every
audit this repository has run found exactly that shape, in every app.

`one new` emits an app with the five doors, passkeys, a plan catalogue and the
standing ladder, an inbox wired to what its operations emit, derived export and
erasure, a maintenance switch and a manifest lock — before its author has made a
single decision.

## 101. A template rots silently and in one direction

The platform gains a required field, a schema module, a wired capability, and the
template keeps emitting what it emitted last year. Nothing fails: the generated
app compiles, boots, and is missing precisely the thing that was added since
anybody last looked at it.

So the scaffold checks read the PLATFORM and compare — the required fields come
from `AppSpec` itself, the schema modules from what the runtime exports. A list
of expected strings would be a second copy of the template, rotting beside it.

## 102. "Imported" is not "mounted", and searching the file cannot tell them apart

The module check first asked whether each schema module's name appeared in the
generated worker. A mutation that removed one from the composed array while
leaving the import survived — the name was there, a reader would see it, and the
table would never be created.

It reads the two `_MODULES = [...]` arrays now. The general form: when a check
asks "is X present", establish where present has to mean something.

## 103. Generating the app for real is the only test of a generator

Two template bugs surfaced on the first generated run and neither was findable by
inspection. The boot test asked a workspace address nobody had taken for a price
list and got a 404 — correct behaviour, wrong premise. And the manifest declared
one region while pointing its directory at another, so every tenantless door
resolved to a binding that did not exist and the sign-in screen answered 503.

Both are the kind of mistake a template makes once and every app inherits
forever.

## 104. The CLI is plain JavaScript because of when it runs

The first thing anybody does with this repository is scaffold an app, and that
happens in a fresh checkout before `pnpm install`. A CLI that needed the
workspace installed and built would be unable to do the one thing it exists for
at the only moment it matters.

## 105. Metadata is stripped on the way in or it is not stripped

A phone photograph carries GPS coordinates, a device serial, the owner's name
and a timestamp to the second. A client photographs a meal at home and the file
knows where they live; a coach shares a progress photo and it carries the model
and serial of the phone that took it.

Stripping later fixes nothing: every copy already taken, every cache, every
backup and every link already shared still has it. So it runs before the object
exists, and the pixels are copied byte for byte — no re-encode, because
re-compressing every photograph a product stores is something nobody asked for.

## 106. A format nobody parsed must not be recorded as stripped

`confident: false` means "this format was not understood", not "there was
nothing to remove". A ledger recording `true` for a format the stripper skipped
is a written claim that somebody's location was removed when it was not — which
is worse than not offering the feature at all, because it is believed.

The PNG rule is the general form: keep chunks whose first letter is uppercase,
because that is the format's own definition of critical, and every metadata
chunk is ancillary by construction. Naming the four that exist today would miss
the one somebody invents next year, which is exactly how a stripper goes quietly
out of date.

## 107. A storage ceiling checked as "are we full" admits one more file of any size

For rows that is a rounding error. For media it is the difference between a
limit and a suggestion: a workspace one byte under its limit can be handed a
gigabyte. The incoming file has to be counted, which means the check happens
after the bytes are in hand and before the object is written — and stripping
comes first, because the size that counts is the size that is stored.

Two ceilings, refusing with different codes. Over the per-file limit is a 400:
the file is wrong and a smaller one would work. Over the workspace's is a 402:
nothing about the file is wrong and the way out is deleting something or paying.

## 108. Deleting the ledger row first is choosing the better failure

If the object delete fails afterwards, an orphan stays in the bucket — money,
and a cleanup job. If the row went last and the object delete had succeeded, the
row would point at nothing: a broken image on somebody's screen with no way to
tell it from a bug. Of two failures, take the one that costs money over the one
that looks like a defect.

## 109. `put` and `delete` are the two most common method names in the language

The object-store chokepoint first matched on the method name and immediately
reported a correct file: a durable object's own storage has both. The
discriminator has to be the HANDLE'S TYPE — a file can only reach the object
store if it is holding one, and holding one means naming the type.

Third time a widened guard has found a bug in itself before finding one in the
code. Budget for it.

## 110. The returned record and the stored record can disagree

`storeMedia` returns a row it assembles in memory and writes a row to the
ledger, and a mutation that wrote the wrong value into one column while
returning the right one survived every assertion — because every assertion read
the return value.

What anybody looks at later is the stored row. A test that asserts the return
value proves the function agrees with itself, which it always does.

## 111. Scheduled work does not break, it stops

An operation that fails is reported by whoever was waiting. A sweep has nobody
waiting — so when it stops, the first anybody knows is a workspace that was
never suspended, a budget that never expired, or a digest nobody received for
five weeks.

Every rule in the job system follows from that: a run table so "did it run" has
an answer, a failure recorded rather than raised, a bound that reports when it
was hit, and an operator surface over all of it. A cron entry in a deployment
config has none of them.

## 112. An unbounded sweep works everywhere until it stops forever

It runs fine on every deployment until one tenant is large enough to cross the
runtime's time limit. Then it fails, is retried, fails at exactly the same size,
and the work never happens again — and the failure arrives long after the commit
that made it inevitable.

A bound with `more` is a sweep that catches up. A bound with nothing to report it
was hit is worse than none: the backlog builds at exactly the rate the ceiling
truncates it, and work-done-per-run looks healthy the whole time.

## 113. Isolating a tenant is right; treating every tenant failing as success is not

One malformed row must not stop a sweep for everybody else — that is how a
single bad record freezes a whole deployment's billing ladder. So a per-tenant
failure is caught and counted.

But a run where NOTHING succeeded and something was skipped is a broken job
wearing a partial success's clothes. Recorded as a success, its clock advances
and it never retries: the run table fills with healthy-looking rows while the
work has stopped completely. `skipped > 0 && done === 0` is the line, and a real
database is what found it — the fake was too forgiving to notice.

## 114. A fake that reimplements the query makes the query untestable

`lastSuccess` reads past failed runs to the last one that worked, and that
predicate is in SQL. The unit test's fake answered it in JavaScript, so mutating
the SQL changed nothing and the test passed either way.

The rule this generalises to: a fake may stand in for a STORE, but not for
logic that lives in the query. Anything expressed in SQL is asserted against a
real database, and the unit test says so in a comment pointing at where.

## 115. An interval is honest where a wall-clock time is not

A cron expression encodes a moment, and for a platform serving several regions
that is a question with no single answer: "02:00" is three different moments for
three tenants and none at all for a fourth on the day a clock changes.

Every sweep this platform has needed is "roughly this often", so that is what the
declaration can say. Never-run is always due, because a first deployment, a new
region and a job added later all have no last-run — and reading that as "not yet"
means a weekly job starts a week late, during which somebody assumes it works.

## 116. A checklist item is derived; a tour step is tracked

That is the whole argument, and everything else follows. "Add your first client"
is answered by counting clients: it needs no completion ledger, cannot drift
from what is true, survives somebody moving to another device, and un-checks
itself if the thing is deleted. A tour step can only ever record "seen", which
is a fact about our interface rather than about their progress — and somebody
who dismissed it once dismissed it forever, at the moment they had the least
context to judge.

A tour is an interruption on a schedule the product chose. A checklist waits,
shows progress, and is still there when somebody comes back.

## 117. The wizard is the `required` half of the same list

Two systems is how the setup flow and the guidance come to disagree about what a
new workspace still needs. One declaration split by a field means a step cannot
be blocking in one place and optional in the other, and `blocking` is a subset
of `steps` rather than a second list.

Required steps sort first, because a blocking step buried under optional ones is
a workspace that cannot proceed and cannot see why.

## 118. There is deliberately no way to mark a step done

A step is answered by counting, so a write that could set one would be a way to
tell somebody something untrue about their own workspace. The only write in the
guide is dismissing a HINT — and a hint is the one thing here that is genuinely
tracked, because it says something not derivable.

That is exactly the property that makes a tour bad, which is why hints are
capped. Five is what stops a tour being rebuilt one hint at a time.

## 119. A count that forgets soft-delete tells somebody their workspace has something it does not

The checklist counted archived rows, so a step stayed ticked after the only note
it counted had been deleted. The list operation had the predicate; the new
counter did not, because the predicate lived as a local helper next to the
first caller.

`liveClause` is in the kernel now, beside `tableNameFor`, so the next reader of
a row count inherits it. The general form: the moment a second place needs a
predicate, the predicate has no business being local to the first.

## 120. `retry: 1` is hostile to any test whose first attempt had side effects

Finding 77 found this in the payment webhook. It is in the boot suite too, and
worse: creating a workspace is not idempotent on its slug, so a retry was
refused by the very rule the next test asserts — a flake for any reason became a
confusing second failure that looked like a bug in workspace creation. A note
count had the same shape: the retry saw two rows and expected one.

Two habits fix it, and both are better tests anyway. Vary the key per attempt —
a fresh slug, a fresh event id — so a retry is a real second run. And assert by
CONTENT rather than by COUNT: a row count is an assertion about how many times
the test has run, which is the one thing it is never about.

## 121. Recognition is not score, and the difference is one field

A points total invites a leaderboard, a leaderboard invites comparison between
customers, and comparison between people being coached through their own bodies
is a product decision nobody asked for. There is no total here and no ranking:
a milestone is a person against themselves, `recognitionsFor` takes one role and
one person's tallies, and there is no argument anywhere that could name a second
person. Refusing the field is cheaper than refusing the feature later.

The same reasoning caps the rule shapes at three. An escape hatch — a predicate
the app supplies — would be a rule nobody can explain to the person who earned
it, and the first one written would read a table the engine knows nothing about.

## 122. A milestone consumes `emits`, which is why it is the platform's

The event stream already exists, is already declared, and is already checked
against the notification registry. So a rule over it needs no instrumentation
anybody has to remember to fire — `hello` awards two milestones and contains no
call to the engine at all. The RULES stay the app's, because "seven sessions in
a row" means nothing to a signage product.

The corollary is that composition can check them: a rule over an event nothing
raises is unearnable and looks exactly like one that is merely hard, so somebody
works towards it forever and the product never says a word.

## 123. The platform's own events were real and undeclarable

`workspace.created`, `plan.chosen` and `package.granted` are raised by operations
no app wrote. Nothing named them anywhere a manifest could see, and `dispatch`
answers an unknown type by returning nothing — so an app that did not happen to
write the same three strings announced none of them, from a registry lookup, with
every test green. It also meant "count the packages you granted" would have been
refused as a rule over an event nothing raises, which is the opposite of true.

`PLATFORM_EVENTS` is that list in the contract layer, required of every manifest
and pinned to the runtime by a test — because a transcription nobody checks is a
list that is right until somebody adds an event.

## 124. A permission no role can hold refuses everybody, forever

The gate compares an operation's permission against what the caller holds, and
what a caller can hold comes from `access.roles`, whose values come from
`access.permissions`. An operation naming something absent from that list 403s
for the workspace owner and reads exactly like a feature nobody uses.

It bites hardest on operations an app never wrote: a collection implies
`<id>:read` and `<id>:write`, the checklist implies `guide:read`, the shelf
implies `milestone:read`. None of them is named out loud in a manifest. The
check is in `createRuntime` rather than in `assertComposable` for that reason —
composition sees only what the app declared, and the chokepoint sees the whole
derived surface.

## 125. An award decided by satisfaction congratulates somebody forever

A rule stays satisfied: the hundredth plan satisfies "your first plan" exactly as
the first did. `INSERT OR IGNORE` cannot report which of those wrote anything, so
the write cannot decide either. Reading the row back and comparing its timestamp
to your own is what makes the announcement once-only — and it settles the
two-requests-at-once case that a read-then-skip cannot, where both read nothing
and both speak.

One decider, exercised on every award, rather than a fast path plus an unproved
backstop. A mutation confirmed the backstop version was unreachable.

## 126. A streak bucketed in UTC breaks halfway through somebody's day

Midnight UTC is four in the afternoon in California. The day comes from the
device, falls back to the manifest's zone, and never to UTC — an unknown zone
degrades rather than throwing, because the value arrives in a header a browser
fills in. And a second occurrence on the same day does not extend anything: a
streak counts days, not enthusiasm, or one keen afternoon earns a week.

## 127. A default parameter is applied when the argument is `undefined`

A test helper defaulting the announcement supplied one to the single case whose
whole point was that there was none — so the assertion passed by never asking
the question. Mutation caught it. Any helper whose absent-value case is the
interesting one must take the argument explicitly.

## 128. An outcome was declared on every write and delivered to nobody

Twelve operations in the runtime carry an `outcome`, every collection derives two
more, and the response was the handler's return value and nothing else. A
mechanism with no surface — the failure this whole platform was started over —
sitting inside the platform, invisible because nothing that consumed it existed
yet to notice it was missing.

The general form: a field that only producers touch is not verified by anything.
The moment a consumer exists it is either right or obviously absent, and until
then it is neither.

## 129. A header is bytes, and that is a 503 waiting on a translator

The outcome travels in `x-one-outcome` rather than in the body, because the body
is the operation's declared `output` and the API document, the typed client and
every test are written against it. A header is the honest place for presentation
metadata about a response.

But a header value is a **ByteString**: setting one containing a character above
U+00FF *throws*, in the success path, after the write has already happened —
turning a completed operation into a 503. Between U+0080 and U+00FF it does not
throw and is carried as latin-1, so it comes back mangled instead, which is worse
because a 503 is noticed.

So "Gespeichert ✓", every Arabic outcome and every emoji anybody will ever put in
a confirmation were a 503 or a corruption, decided by copy in a manifest, in a
code path with no error of its own. Escaping to pure ASCII is still valid JSON —
`\uXXXX` inside a string is exactly what JSON has for this.

## 130. Mutation testing found a defence that defended nothing

The first version escaped control characters, with a comment explaining that
`JSON.stringify` leaves a literal newline inside a string alone. It does not — it
escapes newline, carriage return and the whole C0 range. The mutation that
deleted the entire `replace` survived, which is what sent me to check the claim.

Two lessons, and the second is the one worth keeping. A surviving mutation is not
always a missing test: sometimes it is dead code, and the fastest way to tell is
that the justification is a claim about somebody else's library. And the real risk
was one range over from the one being defended — the alphabet, not the control
characters.

## 131. The sound is derived from the moment, so the two cannot part

An app that declared a moment AND a sound could pair a celebration with the error
chime, and would, the first time somebody copied a declaration and edited half of
it. There is no field to get out of step because there is no field — the same
reduction the design system makes for colour, where a component names a role and
never a value.

`error` and `alert` are unreachable from the moment vocabulary for the same
reason: a failure is a `Problem`, and dressing one in this vocabulary is how a
product ends up playing a chime over somebody's lost work.

## 132. Punctuation has to be rationed by the platform, not by taste

If everything is a moment, nothing is. Two rules do the rationing structurally
rather than asking an app to show restraint: `celebrate` is not an app's to
declare — it belongs to a milestone, which is a rule over an event, earned once
per person — and a `danger` tone may carry no moment at all.

The failure both prevent is the same shape as the leaderboard: a product where
the most-celebrated action is whichever one the business most wants people to
take, arriving one reasonable declaration at a time.

## 133. There are three setups and products keep shipping one

A deployment is set up once by whoever runs it. A workspace is set up once by
whoever opened it. A person is set up once by themselves, *every time a new one
arrives* — and that third one gets built as the second: a product ships a
workspace wizard, then a customer signs up under a tenant and is handed the
workspace's checklist, already finished, none of which was theirs.

Naming the scope is also what makes a step answerable. A deployment step has no
tenant to count rows in; a person step counting the workspace's rows is done the
moment a colleague does it. Both are refused at composition rather than
discovered by whoever arrives second.

## 134. The wizard is the required half of the checklist, given a position

Everything in it is derived from the same steps, the same answers and the same
role filter — narrowed to `required` and ordered. Two systems is how a setup flow
and a guidance surface come to disagree about what a workspace still needs, and
the disagreement is always found by somebody stuck in the flow.

The position is **the first unfinished step, not the count of finished ones**.
Somebody who satisfied a later step out of order — a plan chosen from a pricing
page, a passkey added at a prompt — is still at the earlier one, and a count
would walk them past work they have not done.

The outer scope leads while it is unfinished, and that is not an ordering
preference: a workspace that is not set up blocks everybody in it, so finishing
somebody's own profile first is a flow completed inside a workspace that cannot
do anything yet.

## 135. A whole Scope variant was declared and dead

`Scope` has had a `subject` variant since stage 0 — DDL, an index, a place in
the erasure cascade, a `NOT NULL` column — and no derived operation ever wrote
it, filtered on it, or mentioned it. Every subject-scoped collection was a table
that could not be written to, and nothing in the platform noticed, because
nothing in the platform declared one. `capability-reachable` cannot see this: the
routes ARE mounted, the tables ARE applied. What is missing is a column.

The general form, and it is the sharper version of the mechanism-with-no-surface
rule: **an option nobody has taken is an option nobody has tested.** A closed set
with an unused member is a claim, not a feature. The reference app now declares
one permanently, which is the only durable fix.

The read rule that came with it: a subject-scoped read narrows to the caller's
own subject **when they have one**. A customer means "mine" and a coach means
"this workspace's", and `resolveCaller` already draws that line — a staff caller
names no subject. It fails safe in the direction that matters: a caller who has a
subject cannot express a read of somebody else's rows.

## 136. The degrade lane is asserted, not hoped for

A mandatory paid step that refused would mean nobody can finish setup on a
self-host, or before a deployment's payment provider is configured — failing
closed on OUR misconfiguration rather than on their non-payment. It holds here
because choosing a plan RECORDS an intention and grants nothing: only the payment
provider may stamp a plan. That is now a test on a deployment that genuinely
cannot take money, rather than a paragraph saying it should be true.

## 137. A mutation harness with a fixed temp path is not safe to run twice

Two runs overlapped, both backing the file under mutation up to `/tmp/orig`, and
one restored the other's file: `runtime/src/runtime.ts` came back as a copy of
`kernel/src/guide.ts`. Typecheck caught it immediately, but it could have been
subtler — the restore is silent and the diff is enormous, so it reads as a bad
merge rather than as a tool bug.

A backup path is per-process and per-case now. The general form: any tool that
edits the working tree in place has to assume a second copy of itself is running.

## 138. A price list written beside the declarations drifts from what is enforced

Every plan's `entitlements` map went out to the client as-is — `{ receiptsStored: 5 }`
— which is a machine's answer. A screen showing that either prints the key or
carries a translation table of its own, and the second one drifts from what the
gate actually enforces. The drift is discovered by somebody who bought a thing
the product then refuses, which is the coverage rule's failure one layer up:
there a capability was sold and withheld by nothing; here it is ADVERTISED as
something other than what it is.

So `label` is required on an entitlement and on a customer flag, for the same
reason `enforcement` is: there is now nowhere to put the copy except the
declaration the gate reads.

## 139. A shelf card carries every declared key, not every key the plan mentions

A plan omitting a key is a plan on which the parking value applies. Walking the
plan's own map gives ragged columns, and a comparison table with different rows
per column is one nobody can read — the cheapest plan looks like it has fewer
*features* rather than smaller *numbers*, which is the opposite of true.

The same applies to a package on the other rail: two flags on is not two
features, it is two of eight, and a customer comparing packages has to see the
six.

## 140. Unlimited is the top, and it sorts as the bottom

`-1` is smaller than zero as a number and larger than everything as an allowance.
A comparison that forgets reports every upgrade to an unlimited plan as a loss of
everything — and a card that forgets prints "-1 receipts". Both are read once, in
the kernel, so no renderer ever sees the sentinel.

## 141. No plan is the parking state, not zero

A workspace that has never chosen anything is on the parking values. A comparison
treating "no plan" as nothing advertises every plan as pure gain, including the
ones that take something away from what a workspace already had without paying —
which is exactly the shape the parking-above-floor rule exists to catch, arriving
through the storefront instead of the catalogue.

## 142. The shelf and the gate count the same thing, or the shelf is lying

A preview that estimated usage its own way promises a downgrade the very next
write then refuses. That is a surface which is not the mechanism — harder to spot
than a mechanism with no surface, because everything renders and nothing throws.
So the preview takes the runtime's own quota counters as an argument; there is no
second way to count a ceiling.

Two smaller rules fell out. A key nothing can count is a switch rather than a
number, so an absent counter is absent rather than zero. And a counter that
throws must not take the price list down: somebody looking at plans is doing the
one thing the business wants them to do.

## 143. The storefront states, it never refuses

A downgrade below current usage strands nothing — reads are never gated, so the
rows stay and only the next one is refused. Somebody moving down deserves to know
that before they choose, and to be allowed to choose anyway: refusing traps them
on a plan they no longer want, which is the same shape as the rule that leaving
is always allowed.

Usage travels on the card as well as inside a strain. "5 of 5" is what somebody
needs to see BEFORE they are over, and a storefront that only speaks up once a
ceiling is breached mentions the problem at the moment it is already theirs.

## 144. The inventory caught its own author on the first run

`KOVA.md` §1.1 argues at length that a capability inventory must list outcomes
and never screens, because the moment it lists screens the rewrite is a port. The
paragraph existed for a day before the inventory was written — and three of the
first hundred and fifty-three entries said "page", "screen" and "screen",
written by the same hand that wrote the paragraph.

That is the whole argument for §3a in one incident. A rule that lives in prose is
one the author of the prose breaks within a sitting; the same rule as nine
forbidden words in a script is one nobody breaks twice. It cost four lines.

## 145. An acceptance contract belongs in a registry, not in a document

The inventory is what stage 8 is measured against, so "what is left" and "what
was dropped, and why" have to be answerable by a command rather than by reading.
It is `kova-capabilities.json` with a status per entry, the markdown table is
generated from it, and a `dropped` entry carries a reason — because a capability
quietly not rebuilt and one deliberately removed look identical in a diff.

Same shape as `guards.json`, for the same reason, and the third inventory in this
repository to arrive at it independently.

## 146. A survey asks whether a person can SEE a table, not what shape it is

The new schema is free, so "what columns does it have" is not a migration
question. The question is whether a row is something somebody can look at — those
travel — or the residue of how the old product worked, which does not. Thirty-five
tables split cleanly on that question, and the split took minutes because it is
the only question being asked.

Row counts are deliberately absent: they are a property of a deployment rather
than of a repository, and a number written into a document is wrong the day after.

## 147. Six tables became one, and three documented bug classes went with them

The old schema had `sleep_logs`, `mood_logs`, `water_logs`, `steps_logs`,
`activity_logs` and `measurements` — six shapes for "a person recorded a number
on a day" — plus a check-in that wrote COPIES into them, plus readers merging per
date and per field with the dedicated table winning. Its own documentation names
the consequences: sleep logged in one place never appeared in the other, a
wellness score double-counted a day rated twice, and one column was read by a
report nothing ever wrote.

One collection with a declared `kind` makes none of them expressible. The design
freedom asked for was spent here first, and it was the cheapest win available.

The same move collapsed four plan tables into one, where **a template is a plan
with no client** — not a different kind of thing, the same thing not yet
addressed to anybody.

## 148. Rows or JSON is decided per collection, and both answers appear in one manifest

A plan's body is a JSON column: weeks, days and items are read and written WHOLE,
and nobody queries "every plan whose Tuesday has a squat". A SET is rows: "what
did I lift last time" is the most-asked question in a gym and it is asked per
movement across every workout a person has ever done — an index or a scan of
every session's JSON.

The two look inconsistent and are not, and both arguments are written down beside
the declarations precisely so neither is copied to the wrong side.

## 149. The first real app hit three platform footguns in the first hour

**A field called `on`.** The day something happened — exactly what a coaching
product wants to call it — derives `on TEXT NOT NULL`, and SQLite answers
`near "on": syntax error`. That throws out of `applySchema`, which runs at boot,
so every route answers 503 with a reference number and no mention of a column.
The DDL is generated, so no human ever reads it. `deriveSchema` now refuses a
reserved word, and the same check immediately caught a second one — `current` on
the plan — which would have been the next 503.

**A collection called `plan`.** It derives `plans`, which is the billing
catalogue's table. The composed schema runner already refused that outright,
which is the only reason it took a minute rather than a week — and the rename to
`programme` is the better product word anyway, because an owner deals with both
senses of "plan" daily.

**A collection called `session`.** Same shape, colliding with the auth session
table. Renamed to `workout`, which is also what a person actually says.

The general form: the platform's own table names and SQL's keywords are a
namespace an app shares without being told. Two of the three were caught by
checks that already existed; the third is a check that exists now.

## 150. Staff write on somebody's behalf, and that is a hole a subject scope leaves

A subject-scoped create took the subject from the caller — which is right for a
customer and wrong for everybody else. A coach records a workout for a client
constantly, and under that rule they could not, at all: 403 on the core loop.

The rule now: the subject comes from the caller when they have one, and from the
body when they do not. A caller with no subject is staff by construction, and a
customer naming somebody else has their own used instead — the narrowing cannot
be argued out of over the wire.

## 151. The scaffold shipped an app that passed `test` and failed `typecheck`

`one new kova` produced a boot test importing `cloudflare:test` and no
`env.d.ts` to type it. The suite is green and the typecheck is red on the first
command anybody runs, which is the worst possible first impression of a
framework. Found by generating a real product rather than by reading the
template.

## 152. The vocabulary rule was eating the thing it protects

`kernel.test.mjs` refuses product nouns in `platform/**` source — a framework
that knows what a client is has a product's assumptions welded into it. Kova's
manifest failed on its first line, because a coaching product that cannot name
the person being coached is not a product.

The discriminator is declared rather than a list of directory names: **an app is
a package with a `src/manifest.ts`**, which is precisely what makes one on this
platform. Every other check still applies to it.
