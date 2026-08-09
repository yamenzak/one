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
