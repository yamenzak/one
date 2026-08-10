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

## 153. Energy is derived, because a food that stores both disagrees with itself

A food row carrying `calories` AND its macros holds two numbers that part company
the moment anybody edits one — and every product that stores both ends up with a
diary whose totals do not match the sum of its rows. There is nothing to
reconcile if there is nothing to disagree with, so there is no `calories` field
and `energyOf` is arithmetic over the only numbers anybody actually measured.

Fibre counts at two rather than four, taken out of the carbohydrate it is part
of: it is a carbohydrate by measurement and mostly not absorbed, and counting it
at four overstates every high-fibre day for somebody who is acting on the number.

## 154. The basis is a field, or one egg is 620 calories

A tin declares its numbers per 100 g and an egg declares them per egg. Assuming
100 everywhere is a single constant that produces a wrong answer for a whole
class of food, and the wrongness scales with how small the item is.

## 155. Two fields, because one number cannot say both things

"You are 300 over" and "draw the bar full" are different questions. A single
value clamped for the bar tells somebody they are exactly on target while they
are not; unclamped, it draws a bar 140% long. `left` is signed and `filled` is
clamped, and they are separate because they answer separately.

## 156. A weekly average divides by the days somebody recorded, not by seven

Dividing by seven turns "I logged three days carefully" into "you ate 800
calories a day" — wrong, alarming, and produced by a product that mistook silence
for abstinence. The count travels with the average so a reader can see what it is
worth.

## 157. One current thing per KIND, not per person

A person follows a way of training and a way of eating at the same time, so "the
current programme" is a question with two answers. Standing down every programme
on publish would take somebody's eating away for publishing their training — a
data loss they would discover in a supermarket. The mutation that removed the
`kind` predicate was caught, which is the only reason to write it that way rather
than to remember it.

## 158. A report freezes the words and never the numbers

The old check-in wrote COPIES of that week's weight, sleep and mood into its own
columns so a coach would see what was reported at the time, then read those
copies back beside the originals, merging per date and per field. Three
documented bug classes came out of that one decision.

The separation that removes it: what must not change is what somebody SAID. A
number they later corrected was simply wrong, and a coach reading last month's
check-in should see the right weight rather than the typo. So the document
freezes the narrative, the entries keep one home, and there is nothing to merge —
the old shape is not merely avoided, it is unrepresentable, because there is
nowhere on a check-in to put a weight.

## 159. Submitting a document was the one moment that could not raise an event

`docStatus` had no `emits`, so the most notification-worthy thing a document ever
does — somebody FINISHING it — was silent. Every app wanting to be told had to
add a second operation beside the lifecycle, which then had to be kept in step
with it: two ways to finish a document, one of which tells people.

Found by the third app slice rather than by reading the type. The check that came
with it matters as much: a derived transition's event is invisible in
`operations`, because nobody wrote those operations — so `raisedEvents` reads the
collections too, and an undeclared one is refused rather than arriving as an
anonymous bell.

## 160. Half of all goals count downwards, and the obvious formula is backwards

`current / target` says somebody at 90 kg aiming for 75 is 120% done before they
have lost a gram, and that somebody who GAINED weight is doing better. Progress
measured from the BASELINE towards the target is the only formula that reads
correctly in both directions — which is why a goal records where somebody
started, not only where they are going.

Three smaller rules fell out of it, each wrong in a way nobody would notice:
reached means PAST the target rather than equal to it (an overshoot would sit at
99% forever); a target equal to the baseline is "hold" rather than a division by
zero, because keeping a weight is a real goal; and a deadline goes NEGATIVE
rather than resting at zero, because "0 days left" and "11 days late" are
different things to say to somebody.

## 161. A goal stores no progress, for the same reason a food stores no calories

Where somebody is now is a question about the entries they have recorded. A
stored `current` is a second copy that goes stale the moment a weigh-in is
corrected — and it goes stale SILENTLY, because nothing about a number that is
merely old looks wrong. Two versions of Kova in a row have now reached the same
conclusion from different directions: the derived value is the one that cannot
lie.

## 162. Recognition is the caller's, even when staff act on somebody's behalf

A coach filing a check-in for a client does not earn the client's milestone. That
is the rule working rather than a gap — a badge handed to whoever typed it is
recognition for the wrong person — but it is worth stating, because the opposite
reading is available and would have been implemented by accident.

The consequence to know: a client's milestones are earned by a client's own
sessions. Whether a coach's entry on their behalf should count towards them is a
product question, and the honest answer today is that it does not.

## 163. A deployment that cannot charge was punished for its own configuration

The parking state deliberately sits BELOW the entry plan — not paying must never
buy more than the cheapest plan does — and finding 116 is the guard that keeps it
there. The other half of the rule had no guard at all: where there is no payment
provider, there is no plan to buy, so the parking allowances become permanent.
Kova parks at one client; a self-host, or any deployment before its payment step,
could coach exactly one person forever with no way out.

The standing gate already knew this. `standingFor` takes `chargeable` and stands
down precisely so an unpaid workspace is not held to setup over OUR missing
configuration — and it then opened onto a product that permitted one of
everything. Fail closed on their non-payment, open on ours, is a rule that has to
be applied to the allowances and to the gate, not to one of them.

Found by an ordinary test fixture: a suite needing five clients on a roster got
back an empty attention list rather than a refusal, because the quota check
answered `402` inside a fixture nobody asserted on. That is the second time a
quota has been tested by accident here.

## 164. The floor gets its own source, because "plan" would be a lie

Resolving the cheapest plan for such a deployment could have reported
`from: "plan"`, and every screen would then tell an operator the workspace is on
Starter. It is on nothing; Starter is what we serve when we cannot sell. The walk
gained a fifth source rather than borrowing the fourth — one extra word in a
union against a console that quietly misreports what somebody is paying for.

## 165. A hand-written table name is a 503 that no other test can see

`entry` derives `entrys`, and a handler that spelled it `entries` typechecked,
passed every collection test, and answered every route correctly — because the
collection surface never names its own table. Only the one hand-written query
failed, and it failed as `platform.unavailable` two steps from its cause.

It survived one round of testing too: the query sat behind an early return that
was taken whenever no goal was overdue, so the first fixture that exercised the
feature did not exercise the query. The fix is not a rule about care —
`tableNameFor` is exported and the app derives all ten names from the
collections, so a renamed collection is a compile error rather than a runtime one.

## 166. Somebody who never started is the quietest person on the roster

"Days since they last did anything" has no answer for a person who has never done
anything, and the honest-looking `null` reads downstream as nothing to report —
so the one client who never began was the one client who never appeared on the
list of people needing attention. Silence is counted from their last activity or
from the day they joined, whichever exists, and the fact stopped being nullable
so the wrong answer is no longer expressible.

The settling rule survived that change and is NOT redundant beneath it, which was
the tempting conclusion: a coach onboarding somebody enters the training they
already did, so a person who joined on Tuesday can carry a six-week-old last
session. Silence measured from the training alone flags them, and nothing about
the row looks wrong.

## 167. A distinction nothing observes is a distinction nothing protects

`prescribedPerWeek` returns null for a programme that asks for nothing, which is
not zero — zero flows into a consistency figure as nought per cent and accuses
somebody of missing sessions an empty block invented. Every mutation that
replaced the null with a zero survived, because `expectedOver(0, days)` and
`expectedOver(null, days)` are both zero and `consistency(_, 0)` is null either
way. The distinction was real, correct, and unobservable.

Deleting it would have been wrong; the number is what a coach wants. Reporting
`prescribedPerWeek` beside the ratio — "the block asks for three and a half a
week" answers a different question from "nine of fourteen" — made it observable,
and the mutation died. The general shape: when a mutation of a correct
distinction survives, the fix is usually to surface it rather than to remove it
or to assert it artificially.

## 168. Every app resolved its caller with an authorization bypass

`resolveCaller` was the app's answer to "what may this person do here", and all
three apps in this repository answered it identically:

    permissions: new Set(session ? app.access.roles.owner : [])

Anybody signed in, on any workspace's own address, held the owner's powers over
it. It typechecks, it passes every other test, and no suite can distinguish it
from a working roster — because the fixtures sign in as somebody who ought to be
an owner. The comment above it said "a real app reads a membership row here",
which is the shape of the problem: the seam was correct and the only
implementations of it were scaffolds.

Memberships are the platform's now. What made that the right call was not the
duplication — it was that the duplicated thing was a security decision, and the
version an app writes to make its first test pass is always the permissive one.

## 169. A workspace whose creator is not a member is unreachable, not empty

Creating one places a directory row and applies a schema; nothing made the
creator anything. The result is not an empty workspace — it is one that answers
403 to every request, from the person who just made it, with the routing row, the
tables and the session all perfectly correct. There is no later step that could
repair it either: inviting somebody requires already being a member.

The founding membership is written by the creation itself, and the role it uses
is chosen by CAPABILITY rather than by name — the one that holds `member:manage`.
An app is free to call its administrators anything, and a platform matching on
the word `owner` would found unreachable workspaces for any app that did.

## 170. The first write a region ever takes is the one that finds it unbooted

Booting a regional database is lazy and keyed on the region a REQUEST resolved
to. A workspace is created on the setup door, which resolved whatever region
that door defaults to, and the creator may have asked for a different one — so
the founding membership is written into a store nothing has ever opened.

The runtime's own comment warns about exactly this ("a tenant placed there
resolves correctly, reaches the right database, and finds nothing in it"), and
the gap survived because until there was a founding membership, nothing wrote to
a fresh region until somebody made a request that resolved to it. Adding the
first cross-region write is what turned a documented hazard into a red test.

## 171. An invitation is the membership row, and there is no "accept"

Two tables — members and invitations — make a roster a UNION every screen has to
remember, so the pending half is missing from at least one of them, an owner
re-invites somebody already invited, and a seat ceiling counts one table while
the other grows. `accepted_at IS NULL` is "invited"; there is nothing to keep in
step.

And signing in with the address IS the acceptance. A separate accept step is one
a person can only complete from a link in an email they may no longer have. The
predicate that makes it safe is `account_id IS NULL`: a claim may take an
unclaimed row and nothing else, or an address that has changed hands becomes a
way into its previous owner's workspace.

## 172. A seat counted on acceptance is a ceiling anybody can pass

Invite twenty people and wait. Every one of them is a promise the workspace has
made, and none of them counts until the day they happen to sign in — at which
point the overage arrives all at once, as a bill rather than as a refusal. The
count is `revoked_at IS NULL`, accepted or not.

The mirror-image mistake is counting the wrong roles: Kova's clients are members
of a studio, and counting them would price a coaching business by its customers
twice, since it already pays per client. Which roles count is a pricing decision
and is declared per app.

## 173. "The customer is the signed-in account" is right in one shape and silently wrong in the other

Every app's caller resolver returned the account id as the customer-rail subject.
That is correct where the signed-in person IS the customer, and in a product
where staff act on somebody's behalf it makes a coach their own customer —
holding their client's package while the client holds nothing. Nothing throws,
and the capabilities screen agrees with the gate because both are wrong together.

It is a declaration now (`customerRail: "member" | "record"`), which is the
smallest thing that could carry the difference — and it is the same lesson as
the caller resolver: what looked like an app's answer was one of two shapes, and
neither app was choosing between them.

## 174. A declared permission is not a held one

An operation naming a permission the manifest does not declare was already
refused. The next failure along was not: a permission that IS declared and that
no role and no personal set holds refuses every caller, forever, including the
workspace owner — and a 403 from that is indistinguishable from a permission
somebody forgot to grant, on a feature that reads as one nobody uses.

It is checked in the runtime rather than in the manifest, because the surface an
app declares is not the surface it has: files, the inbox, billing, the roster and
the checklist all arrive from the platform, and half the keys this catches belong
to operations nobody in the app wrote.

## 175. `personal` is the permission set that has no role to live in

Somebody has to create their first workspace before belonging to one, and a role
cannot express that — a role is held inside a tenant and this caller is outside
every tenant. Leaving it to the caller resolver is precisely what produced the
scaffold in finding 168: "give a signed-in person the owner role" is the shortest
way to make the setup door work, and it is a bypass on every other door.

The empty list is a real answer — an app nobody may join except by invitation —
which is why it is required rather than optional.

## 176. The row-level rule was returned as an obligation and discharged by nobody

`check` reports `scopeRequired` rather than performing the narrowing, because
performing it needs the parsed input and the gate is pure so a whole tool
catalogue can be filtered without touching a store. The comment beside it says a
gate that silently skipped this "would be the worst failure in the file", which
is why it is a returned obligation rather than an omission.

Nothing in the runtime read it. Every row-scoped operation — a customer's
capabilities, their purchase history, their report — accepted whatever id the
caller named. In Kova that is a roster of paying customers able to read each
other's packages, remaining days and purchases, using an ordinary read
permission every client holds.

The same class as the quota obligation one line below it, which WAS discharged.
One of two obligations acted on is the shape that reads as done.

## 177. The customer gate refused everybody who was not a customer

`caller.customerFlags?.has(flag) ?? false` — an absent set defaulted to refused.
An absent set means the caller is not a customer at all: staff, an operator, a
machine. So the gate withheld the product from the workspace paying for it and
admitted the customers it was written to withhold from, in exactly the arrangement
the second rail exists for.

It could not be seen until the second app, because the first made every signed-in
person their own customer — so the absent case never occurred. That is the third
time in this project that a defect was invisible until a second product had the
shape the first happened not to have.

## 178. `shape` resolved the wrong rail, and a coach was shown an empty report

`shapeFor` read the entitlement first and fell back to the customer set, which
answers `false` for every staff caller on a key that is a customer capability —
so the report a coach opens about their client came back with every lens
withheld. The fix is to dispatch on which registry the key belongs to: the
resolved entitlements carry every key the app DECLARED, so a name missing from
them is a customer capability rather than a workspace one.

## 179. The shape mechanism was declared, resolved, and reachable by nobody

`check` computed `included` on every request and nothing ever read it. An
operation could declare `shape`, the platform would resolve exactly who may see
what, and the handler had no way to ask and the response no way to say. Three
layers of a feature, and the only missing one was the wire.

It is `ctx.included` now, and the platform MERGES the same map into the answer.
Merged rather than returned by the handler, because an operation that had to
remember to report it is one that will not — and then a thinner payload and an
empty one are the same answer again, which is the thing shaping exists to avoid.

## 180. A customer flag gates writes; an entitlement gates everything

They look like the same mechanism on two rails and they are not. An entitlement
is "this workspace never bought that", so there is usually nothing to read. A
customer flag is "this person's access has run out", and their history is
something they recorded themselves — every meal, set and measurement. Withholding
it is holding somebody's own records hostage over a payment, which is a different
act from withholding a product.

The same argument already spares reads from a quota, one field along. Two of the
three ceilings now agree; the entitlement is the odd one, and it is odd for a
reason rather than by oversight.

## 181. The one number a coach must not be shown is the headline

A customer's runway is a MAXIMUM across scopes, and that is the right number to
show the person themselves — "you have ninety days". It is exactly the wrong one
for a list of people whose access is running out: somebody with ninety days of
training and three of nutrition reads as fully covered, right up until the part
they use every day stops working.

`soonest` is the minimum, and null when they hold nothing. Null rather than zero
matters as much: counting "no access at all" as "no days left" puts every client
who never bought anything at the top of the list, which is the fastest way to
teach a coach to stop opening it.

## 182. Clearing an exception has to remove the key, and nothing could tell

`explainCustomerFlags` reads a stored `null` as "no exception", so deleting the
key and storing a null resolve identically — the mutation that replaced the
delete survived every test. The distinction is real anyway: a workspace's list of
the people it has made exceptions for otherwise grows forever with entries that
mean nothing.

Same resolution as finding 167. The fix was to surface it — `commerce.override`
reports the exceptions in force — rather than to assert on a store nobody reads
or to delete a correct distinction because nothing observed it.

## 183. The platform is never in the money path, and the abstraction survives because of it

A workspace is paid on ITS OWN provider, in its own country, on a page it owns.
What is recorded here is that somebody said they wanted to buy something, and
separately that somebody with authority said it was paid for. Storing a payment
would be storing a claim nobody here can check.

The consequence worth stating is what that BUYS. Tokenization, 3DS, retries,
chargebacks and the money itself stay on the other side of a URL — so a provider
this platform has never heard of is a checkout address and a signing secret,
rather than a client library, a country list and a compliance surface.

## 184. `manual` is the default, not the fallback, and that is why both lanes settle through one path

Most workspaces have configured nothing, and a product that needs a payment
provider before anybody can buy anything is a setup screen with a product behind
it. So the manual lane is the ordinary case: the workspace takes money however it
already does, and somebody confirms.

The design rule that follows: a signed notification and a coach pressing confirm
arrive at the SAME function. A shape where the automated path is the real one and
the manual path is a bolt-on ends with two settlement routes that disagree, and
the disagreement is always about money.

## 185. The conditional write is the lock, and a read-then-write is the same bug with more steps

A provider retrying a success it timed out on is the ordinary case rather than
the strange one, and a coach pressing confirm twice because the first press
looked slow is ordinary too. Settling is therefore `UPDATE … WHERE status =
'open'` and the caller applies the package only when it changed a row.

Checking whether it is already settled and then writing leaves a window that both
deliveries fit through, and the window is exactly as wide as one database round
trip — which is where redeliveries land.

## 186. A public endpoint that grants paid access must refuse what it cannot verify

The customer webhook has no session by construction, so the signature is the
whole of the authentication. The case that matters is the workspace with NO
secret configured — which is most of them, because manual is the default. Reading
that as "nothing to check, carry on" turns the endpoint into a way to grant paid
access to anybody who can guess a purchase id, for the majority of workspaces on
the deployment.

No secret is a refusal. The same reasoning as the platform's own webhook, one
rail down, and it had to be made twice because the two rails resolve their secret
from different places.

## 187. A once-only package is refused before the money moves

Refusing at settlement is correct and useless: the payment already happened on a
page this platform does not control, and there is nothing here that could give it
back. Somebody who can pay and not receive is worse off than somebody who cannot
buy, so `mayPurchase` runs when the intent is OPENED.

It still runs at settlement too, through `applyPackage`'s ledger — the check at
checkout is about not taking somebody's money, and the one at settlement is about
not granting twice. They are different questions that happen to share a function.

## 188. A filter a customer can point at somebody else is not a filter

`commerce.purchases` takes an optional `subjectId`, which reads as a convenience
and is the hole with a parameter in front of it. Who a caller may see is decided
from the SESSION: a caller who is a customer sees their own and the request's
filter is ignored; a caller who is not one is staff, and their reach is their
permissions.

It survived one round of mutation testing because the fixture had a single
customer with purchases — filtering by nobody and filtering by them return the
same rows. A second person buying something is what made the two implementations
distinguishable.

## 189. Tenant-scope discount codes are DROPPED, not pending

A discount has to be applied by whoever owns the checkout page, and the workspace
owns it. Kova opens an intent and hands over an address; it never sees the price
the customer is actually charged, so a percentage stored here would be a number
nothing enforces and a report nothing could reconcile.

Recorded as dropped with the reason rather than left on the list, because an
outstanding item nobody intends to build is indistinguishable from one nobody has
got to yet. Access codes — which grant DAYS rather than reduce a price — are the
honest version of the same want, and are unaffected.

## 190. Two test files signing in the same address is an order-dependent suite

A sign-in code is delivered against an EMAIL. Two suites using `ro@example.test`
pass alone and fail together: the second request overwrites the first's code, the
verify fails, and what a reader sees is a 403 from a caller who looks perfectly
signed in — with no hint that the cause is in another file.

Every fixture address is now its own suite's. The general rule: a fixture keyed
on something global is a fixture that works until the suite grows.

## 191. `skipped` meant two things, and the runner read the wrong one

`JobResult.skipped` is documented as "anything skipped for a reason worth
knowing", and the runner has a rule that a run where nothing succeeded and
something was skipped is a FAILURE — correct, because that is a broken job
wearing a partial success's clothes.

The first real sweep on this platform reported one skip per workspace that had
not configured the feature. Most workspaces have not configured most features, so
every run went red on a deployment where nothing was wrong at all — and an alarm
that is always on is an alarm nobody reads, which costs the real failure it was
built for.

`idle` is the second meaning, split out: deliberately not swept, reported so
"the ladder ran and there was nothing to do" stays distinguishable from "the
ladder did not run", and excluded from the failure rule.

## 192. A sweep is global, so its test cannot share a database

The scheduled handler visits every workspace in the directory. Run beside other
suites on shared storage it archives their clients, deletes their records, and
races them for the run row that decides whether it is due — and the symptom is
four unrelated suites failing on data that was correct when they wrote it.

The repository already had the answer: `*.solo.test.ts` in its own invocation,
introduced for the maintenance switch. The line is "does this act on the whole
deployment", not the subject, and the lapse sweep is the second thing to qualify.

## 193. A refused claim must not write

`claimCode` decided whether a code had uses left AFTER issuing the decrement, so
a spent code went to −1, then −2, and the "uses left" a workspace is shown
counted down every time somebody tried a code that no longer worked. The refusal
was correct throughout; the store was not.

The general shape, and the second time it has come up: when a check and a write
are the same statement, the check has to be part of the WHERE clause. When they
are separate, the check goes first — and "first" means before anything is
written, not before the answer is returned.

## 194. A ladder that goes backwards is not a ladder

Deleting before archiving means the archive rung never happens, which reads on a
settings screen as a step somebody configured and gets. Refused rather than
reordered, for the same reason the destructive floor is refused rather than
clamped: quietly doing something other than what an operator typed leaves a
screen showing a number the sweep does not use, and the number they meant was
about deleting people's records.

## 195. Lapsed is measured from the LAST thing to expire

Taking the earliest starts the clock on somebody who is still paying for
something else, and the rungs at the end of this ladder are archive and delete.
And "holds nothing" is null rather than zero: a customer who never bought
anything has not lapsed, so a workspace switching the ladder on for the first
time would otherwise archive every record it had ever created, on day one.

The second case is reachable through an ordinary product path — an exception set
by hand opens a customer's access row with no budgets in it — which is why it is
a test rather than a comment.

## 196. Erasure reached the rows and not the bytes

`files.ts` opens with the rule: an object written behind the ledger is invisible
to the quota and to erasure forever, it costs money every month, and the only way
to find it again is to list the bucket by hand. The platform then committed
exactly that failure itself — `eraseTenant` ran the derived cascade, which
includes the `media` table, and deleted every row naming an object while the
objects stayed where they were.

The rows are the ONLY index of the keys, so the order is the opposite of deleting
a single file. There the row goes first, because an orphaned object costs money
and a row pointing at nothing is a broken image somebody reports. Here the bytes
go first, and a row is dropped only when its object is gone.

## 197. A ceiling on the sweep reintroduces the leak it bounds

The first version took one page of five hundred, deleted those objects, and
reported a clean run — after which the cascade behind it dropped the rows naming
every other one. A bound is necessary and it is not a stopping condition: what is
left when the ceiling is genuinely reached has to be REPORTED, and reported in a
way that stops the cascade rather than one that is merely logged.

`stranded > 0` is that report, and it makes the operation re-runnable instead of
partial — which matters because the alternative to refusing is a workspace whose
files we cannot find and cannot say we still hold.

## 198. A declared policy that nothing reads does not exist

`field.media({ accept, maxBytes })` compiles to a text column. Every reader of
the manifest — the form, the API document, anybody working out what a face may
be — takes it as a rule, and nothing enforced it: a face could be a video that
uploaded perfectly well under a different purpose, a file deleted last week, or a
string somebody typed. All three render identically, as a broken image on a
screen a long way from the write that caused it.

The check reads the LEDGER rather than the value, because the type and the size
are facts only where the upload wrote them down after stripping and measuring.

## 199. The create is not where a form saves

Landing the media check on `create` alone leaves the same unverified id one
`update` away — and the save after the first is the write a real form actually
makes, so the version with the hole would have passed every fixture that sets a
photograph while creating a record and failed for everybody who added one later.

## 200. Deleting a file is a question about the whole manifest

A file the library deletes cleanly is a broken image somewhere else, and nothing
connects the two: the delete succeeds, and the failure surfaces later on a screen
whose own code is correct. What points at a file is derivable — every media field
on every collection — so the refusal is derived and a media field added next year
is covered by the same commit that adds it.

Archived rows deliberately do not count. A soft-deleted record is on nobody's
screen, and counting it would hold a workspace's storage against records it has
already thrown away, permanently, since an archived row never comes back to
release it.

## 201. A field no upload can fill is a composition error

A media field whose `accept` shares no type with any declared purpose is a form
control that cannot be used — and the failure arrives at the worst possible
moment, after the person has chosen a file and the upload has already succeeded.
It is decidable from the manifest alone, so it is refused at composition.

⚠️ ONE TYPE IN COMMON IS ENOUGH. Requiring all of them refuses a field that takes
both a photograph and a scan beside a purpose that takes only the photograph,
which is perfectly fillable — and a mutation from `some` to `every` survived
until the fixture had a field wider than its purpose to distinguish them.

## 202. The mock was the vulnerability, not the fallback

A shipping product had three ways to generate without metering: a console
switch, a missing binding, and a provider failure falling back. All three
typechecked, passed every test, and in production fabricated output — including
clinical values read from a photographed lab report — while still charging for
it. Every one of them reached the same platform-side mock.

The fix is not a better guard on the mock. There is no mock: a deployment with
no model runner refuses, and a test that wants deterministic output supplies the
runner itself, in its own bindings, exactly as production supplies a real one.
One of those is reachable by getting a config wrong; the other is not reachable
at all.

⚠️ AND THAT MAKES THE RUNNER THE ONE STORE A DEPLOYMENT MAY LEGITIMATELY LACK.
Treated like a missing database it takes every route down with it, so a
workspace with no AI answers 503 on everything it has. Declared optional, a
missing one costs the studio its generation and nothing else — which is the
whole difference between a supported configuration and an outage.

## 203. Reading a balance and then running is not a check

The first version read the balance, refused if it was short, and ran. Two calls
that both read a sufficient balance both proceed — and the overspend is not a
wrong number on a screen: it is a second call to a provider that the platform
pays for in full and can never bill.

The rule is the one finding 193 already stated on the other rail: when a check
and a write are the same decision, the check has to be part of the WHERE clause.
`hold` is a conditional insert; `false` is a refusal rather than an error.

⚠️ AND THE TEST HAS TO COUNT PROVIDER CALLS, NOT ANSWERS. A debit taken after
the run refuses the second caller too — after it has already run — so asserting
on the two results cannot tell the implementations apart. The mutation survived
until the fake counted what the provider was asked to do.

## 204. A rate of zero is not free, it is unmetered

A model priced at zero holds nothing, charges nothing and moves no balance,
while the provider invoices as usual. It reads, in every report, as the cheapest
model in the catalogue right up to the end of the month.

That and three siblings are decidable from the manifest alone — a feature naming
an undeclared model, an empty system text, an absent output bound, an absent
per-person ceiling — so all four are refused at composition. None of them throws
at runtime; each produces a perfectly successful generation.

## 205. A per-person ceiling is what makes a balance a budget

A workspace balance is spent by whoever asks first. One person looping a draft
empties it before anybody else opens the product, and the only signal is a bill
— so the ceiling is declared per feature, per person, per day, and it is not
optional in the type.

⚠️ FAILED ATTEMPTS COUNT TOWARDS IT. Recording only the successes makes a
failing provider something somebody can loop past for free, and leaves the
question "why did this stop working" with nowhere to look — while still
answering "why was I charged".

## 206. The catalogue is the platform's and the prompt is the app's

Rates are a fact about a provider's price list, identical in every product, and
getting one wrong is a transfer rather than a bug. What to ask for is the whole
of what makes a product different. So the platform derives no operation per
feature — it would have to guess the input shape, the output shape, the
permission and what to do with the answer, and each of those is the product's.

⚠️ THE SEAM TAKES THE CATALOGUE, NOT THE APP. An operation reaching into the
manifest that contains it is a circular type, and the catalogue is exactly the
small thing it actually needs — which is what makes an app's own AI operation
expressible at all.

## 207. A product rule beside the derived write is a rule with a door next to it

A coach cannot be in two places at once, and the obvious place to say so is a
`booking.book` operation that checks for a clash. That leaves the derived
`booking.create` standing beside it, making the same row, without the check —
and the derived one is what a form actually calls. Every product rule written
that way is one screen away from being bypassed, and nothing anywhere reports
that there are two ways to make the row.

So a rule is declared ON the collection and every derived write runs it. It
refuses rather than corrects: moving a booking to the next free hour is the
product deciding something on somebody's behalf and then showing them a screen
that does not match what they typed.

## 208. A rule handed the changes alone is a rule that always passes

An update carries only what somebody edited. A clash check given that sees a
booking with no coach and no time, takes its "not enough to judge" branch, and
accepts the move — silently, every time the coach was not part of the edit.

⚠️ AND THE MERGE HAS TO BE IN THE DECLARATION'S OWN NAMES. The stored row is
columns (`starts_at`); the rule was written against the field (`startsAt`).
Merged under the wrong keys every lookup is `undefined` and the same branch is
taken. A mutation swapping one for the other survived the first suite, because
every case it had changed the field in question — it only shows on an edit that
changes something else.

## 209. A subject-scoped row that does not say whose it is

The derived list left the subject column out. For the customer reading their own
records that is invisible — every row is theirs — which is exactly why it went
unnoticed: staff read the WHOLE workspace's rows through the same list, so a
coach's diary was a column of appointments with nobody's name against any of
them.

## 210. A draft a client can read

The ordinary shape of the mistake is one permission and one filter: give clients
the collection's read permission, filter the list to published in the screen,
and every half-written piece in the studio is one request away. The feed is a
separate operation behind a permission staff and clients hold, and the
collection's own read is one clients do not — because a correct feed is no
defence if the door beside it is open.

## 211. A deployment key held inside a workspace

`billing:operate` guarded the payment dead letter and the scheduler's run table.
Both read the WHOLE deployment — every workspace any sweep visited, every event
nobody could attribute, each carrying a provider's raw payload — and the key was
in every app's OWNER role. So any workspace owner, on their own origin, could
read other workspaces' operations and other workspaces' payment payloads.

It had a test. The test drove it as an owner and passed, because the defect was
in the declaration rather than in the code — which is the shape a permission bug
takes: nothing throws, nothing 403s, and the assertion says the surface works.

The fix is not a narrower role. There is one key now — `platform:operate`, held
by the operator role, which is applied on the operator door and nowhere else —
because two names for "acts on the deployment" is how an app comes to half-grant
one. What these operations have in common is not money; it is acting on ANOTHER
workspace from outside it, which is the one power no member of a workspace holds.

⚠️ IT WAS FOUND BY A TEST WRITTEN TO CONFIRM SOMETHING ELSE. The assertion was
"a studio owner cannot reach the dead letter", added to earn a capability flip,
and it failed. The inventory flip is what forced somebody to check.

## 212. Five mechanisms with no surface, in the platform itself

The directory knew every workspace and nothing listed them.
`subscription.adjusted_json` was read by the entitlement walk, explained by
`explainEntitlements`, and written by nobody. The ledger summed a balance
nothing could add to. The maintenance switch was read on every request,
enforced above the public gate, and had no way to be turned on.

Each was declared, tested, correct and unreachable — which is precisely the
failure this platform is a reaction to, committed by the platform, four times,
while a guard existed for exactly that class in the app tree it replaces.

⚠️ AND A COMP HAS TO CLEAR THE DUNNING ANCHOR. A workspace comped while the
ladder was counting keeps `past_due_at` and is suspended on schedule for an
invoice nobody is waiting for. The row reads `active` throughout, and the
operator who comped them has no reason to look again.

## 213. A registry with no store is a design nobody can use

`config.ts` had the whole of the two-layer resolution — non-empty wins, the
shared allow-list enforced on write as well as on read, redaction for secrets —
and not one caller. No table, no surface, no consumer. It was correct, tested at
the unit level, and a deployment could not set a single key.

That is the fourth instance of the same class found inside the platform in two
increments, and it has a shape worth naming: the pure half is the enjoyable part
to write and the part that survives review, so it gets written first and then
looks finished.

## 214. `chargeable` was a boolean an app passed in

The gate that holds an unpaid workspace to setup asked the app whether the
deployment could take money — so it could answer yes while the payment provider
had no key at all. The failure is not a 500: it is every workspace on a
self-host stranded in setup over OUR misconfiguration, which is precisely the
thing the "fail closed on their non-payment, open on ours" rule was written to
prevent, defeated by the flag it was implemented with.

Reading the same rows the payment lane reads is the only version that cannot
drift. And the mode picks the lane: both keys are stored at once so going live
is a switch rather than a re-paste, and live mode holding only a test key is NOT
chargeable — the alternative is a checkout that fails at the till.

## 215. A refusal and a crash are the same status

Removing the "no shared store bound" check left `d.shared!` reaching for null,
which throws, which the runtime turns into the same 503 the stated refusal
produces. The mutation survived a test asserting the status.

⚠️ THE ASSERTION HAS TO BE ON WHAT WAS SAID, not on what came back. A crash
carries no `meta` and writes nothing while saying nothing either — so the test
now checks the reason AND that the value did not quietly land in the app's own
store instead.

## 216. A price list in a manifest is a price list that waits for a release

The model catalogue — ids, providers, rates — was in each app's manifest, in
code. So correcting a rate meant editing every app and shipping every app, and
while that waited the reserve under-counted: it caps what may be charged, so
every unit an out-of-date rate fails to anticipate is a unit the platform pays
for and nobody is billed, silently, on every call.

A manifest is a deploy and a price change is not. So the declared catalogue is a
FLOOR — what an app ships knowing — and a shared, correctable rate wins over it.
The console shows both, so a stale number is visible rather than merely wrong.

⚠️ AND A RATE NEVER INVENTS A MODEL. The system text, the output ceiling and the
daily bound are the app's, and nothing in a catalogue can supply them — so a row
for something an app does not declare is ignored on read and refused on write.
The read-side half survived a mutation until the kernel had its own test: the
console refuses the write, so no such row was ever there to expose it.

## 217. The line between shared and per-app is not "is it a secret"

Three keys that look shareable are not, and each fails differently when shared:
a payment webhook secret is per ENDPOINT, so sharing one makes every app fail
verification but the last to save; a sender's display name is per PRODUCT, so
sharing it renames the sender for everybody; a maintenance switch is per
PRODUCT, so sharing it takes the others down. Requiring a `why` on every
unshared key is what forces that distinction to be written where the next
person adding a key will read it.

The reverse line is just as sharp: what a model costs, and the credentials
behind it, are the same everywhere — so they belong in one store, and holding a
copy per app is how one product quietly keeps yesterday's key.

## 218. `hello` binds no shared store, on purpose

Both apps binding it would leave the unbound path — a self-host, a
single-product deployment — untested, and that path has a real failure in it: a
console offering a shared scope that quietly writes somewhere else is a key that
works here and nowhere, discovered by the second app. So the reference app is
the unshared one and Kova is the shared one, and each proves what the other
cannot.

## 219. A package belonged to whoever saved it last

`customer_package` was keyed on `id` alone, and the id is the STUDIO'S OWN WORD —
every other table here generates its key, and this one is right not to. Keyed on
the word alone, two workspaces that both call something `full` share one row: the
second to save overwrites the first's price, its capabilities and its days, and
takes the row's `tenant_id` with it. The package does not merely change, it
MOVES — out of one workspace's list and into another's.

`full`, `standard`, `monthly` are the names people actually pick.

⚠️ IT WAS FOUND BY THE SECOND CUSTOMER, not by a clever test. A new suite named a
package `full` in a second studio because that is the obvious name, and three
assertions in an unrelated file went red — a client's days halved, a write
refused, and a grant ledger with entries nobody made. Nothing in the commerce
suite could have found it: one workspace cannot collide with itself.

## 220. Every app shipped a Map instead of a mailer

`deliverCode` was injected "because an app owns how it travels", and every app
that owned it wrote `new Map()`. So nothing this platform sends had ever left a
worker: not one sign-in code, not one notification. The seam was real and the
implementation behind it was a stub in every instance of it.

The lane is the deployment's now, chosen from its own configuration, and a
deployment that has chosen nothing SENDS NOTHING and says so — a code that could
not be sent is not a code that was, and answering the request cleanly is what
tells somebody to check their inbox for a message that was never addressed to
anybody.

⚠️ AND THE MOCK IS A PROVIDER SOMEBODY CHOOSES. `email.provider = "recorded"` is
a row, not a branch this file takes when something is missing — because a
fallback reachable by getting config wrong is how a production deployment comes
to record its sign-in codes and answer as though the mail went out. The same
argument as the AI runner, one lane over, and it is the second time the shape has
come up in three increments.

## 221. A rule was handed a row belonging to nobody

The subject column is not one of a collection's declared fields, so the merge
that builds the row a rule sees on an UPDATE walked `fields` and dropped it. A
rule that narrows by customer then finds no customer, takes its "not enough to
judge" branch, and passes every update — silently, for every subject-scoped
collection with a rule.

It is the same defect as merging under column names, one column over, and it
survived until a test edited a row in a way that had to be refused BECAUSE of
whose row it was.

## 222. A SQL keyword found a whole batch's worth of the same shape

`instead` — the obvious name for the movement a stand-in stands in for — is a
SQLite keyword, and the derivation refused it at boot with the collection and
the field named. One rename, thirty seconds, and it is the LAST cheap finding in
this batch: everything below was found by writing tests that assumed the
platform kept a promise it was only making.

## 223. The subject column belonged to the module, not the table

A collection declares which person its rows hang off. The derivation kept ONE
such column per module and overwrote it per collection, so an app scoping one
table to a client and another to a coach ends up with whichever was declared
last.

The failure is silent in the worst available way. Erasing a client runs
`DELETE … WHERE coach_id = ?` against a table whose column is `client_id`;
SQLite throws; the purge catches — it MUST, because an older database
legitimately lacks a module's tables — and reports the table as "absent". So a
person asked to be forgotten, we said yes, and every row is still there under a
heading that reads like an old database.

Kova has one subject today, so nothing was wrong in the running product. It was
wrong in the mechanism, which is the thing three more apps will inherit.

## 224. Reads spoke storage while writes spoke the declaration

A collection took `howItWent`, a real boolean and a real object on the way in,
and handed back `how_it_went`, `1`, and a JSON column as the TEXT it is stored
in. Every consumer had to know both vocabularies.

That is not untidy, it is a corruption path with no error anywhere on it. The
obvious client — read a record, change one field, send it back — takes a JSON
column out as a string and puts it back as one. The column then holds an encoded
encoding; the next read returns a string that parses to a string; the read after
that returns a string that parses to a string that parses to an object. Nothing
throws at any point and every response is a 200.

## 225. `field.json("programme.weeks")` validated nothing

The schema name was a comment. Nothing read it, so the column took any shape at
all — and the failure that follows has no exception in it: code that reads the
body walks the keys it expects, finds none of them, and returns its input
unchanged.

Kova had TWO readers of that column and they disagreed about its key.
`progressWeek` reads `days[].movements`; `prescribedPerWeek` read `days[].items`.
So depending on which shape the writer happened to produce, either copying a week
applied no progression, or the report said nothing was prescribed — each with
every number correct, saved cleanly, reported as a success.

⚠️ AND DROPPING AN UNDECLARED KEY IS RIGHT FOR A REQUEST AND WRONG FOR A RECORD.
An object shape silently discards what it was not told about, which is correct
for an envelope a newer client sends — and wrong for a body stored WHOLE, where
what is dropped is not ignored but LOST: the caller sent it, the write answered
200, and the record they believe they saved is not the one in the column.
`strict` is that difference, and it is declared per shape rather than imposed on
every request.

## 226. The operation was locked and the window beside it was open

`swap.decide` carried a careful comment about why answering a swap request is the
coach's act and not the client's — written while the derived `swap.update` took
the same three fields behind the permission the client must hold to ASK.

`read` and `write` have been on a field since stage 0 and were enforced by
nothing, so the narrower declaration that would have closed it was available,
documented, and dead. The half that was genuinely missing is `initial`: a field
that is required AND write-restricted is a collection the person the feature is
for cannot write a row into, so the two declarations together produced a
refusal of their own use.

## 227. Forgetting somebody left a dated record that they existed

The erasure cascade is subject-scoped and the activity trail is tenant-scoped, so
the derived walk could not see it. What stayed behind was every time their record
was touched and by whom — which is the shape of the thing somebody asks to be rid
of, kept under a heading that says it was removed.

⚠️ AND THE IDS HAVE TO BE READ BEFORE THE ROWS GO. A trail entry names the row it
is about; once the row is deleted there is nothing left to join to, so a run that
erased first and looked afterwards finds nothing to remove and reports a complete
erasure over entries nobody can attribute — including us.

## 228. A photograph was metered as though it were the sentence describing it

A provider bills a picture as a flat block of input units — a thousand or more,
larger than most prompts — and none of it appears in the text. So a vision
feature metered by the existing arithmetic held what its words came to, the
settle capped there, and the platform paid the rest.

Every property that makes a defect survive is present: it SUCCEEDS, the answer
is good, nothing throws, nothing logs, and the amount is plausible. And it
scales with use — photographing a meal is the feature people reach for most, so
the cheapest-looking line in the catalogue is the one running up the largest
invoice.

⚠️ THE PICTURE IS DECLARED ON THE FEATURE, NOT DECIDED PER CALL. Deciding per
call means an image can be attached to a feature whose reserve was computed
without one, which is the same transfer arriving through a door the catalogue
cannot be checked at. Declared, `aiProblems` can refuse a vision feature whose
model prices no picture — before anybody calls anything.

## 229. An image is a different metering shape, not a different content type

Priced per picture, with no input side worth counting and no output ceiling that
means anything. Through the token arithmetic it holds the cost of the sentence
that asked for it. And a usage block cannot be allowed to settle it: there are no
units to report, so a provider that returns one for its text models would
discount every image by whatever happened to be in it.

⚠️ THE BYTES HAVE TO LAND SOMEWHERE ACCOUNTED FOR. A generated image handed back
as data is an object nothing counts against the workspace's storage, nothing
erases when it closes, and nothing can serve again tomorrow — so the only way to
keep it is to generate it again and pay again. It goes through the same store
every upload does, which is what keeps "what does this workspace hold" a question
with one answer.

## 230. `refusalProblem` wrote the code over the reason

`{ ...(g.meta ?? {}), reason: g.why }` — so a refusal carrying "that picture is
not in this workspace" was answered with the word `unconfigured`, and so was one
carrying "this asks for a picture and none was given", and so was a missing model
binding. Three different things to go and do, computed correctly, discarded on
the way out.

It cost about twenty minutes here: three new features failed with one message
that pointed at none of the three causes. The actual cause was the region's
sub-processor allow-list, which names every model an app may reach — a catalogue
entry added without a matching line there is a feature that refuses everything
and says nothing about why.

## 231. An entitlement key that is a customer flag resolves to nothing

`entitlement: "nutrition"` on a new operation, where `nutrition` is a flag a
CLIENT buys from a studio and not a capability a studio buys from us. Two rails,
never merged — so the gate looked the key up on the tenant rail, found nothing,
and refused the feature for everybody.

⚠️ It fails CLOSED, which is why it is a finding and not an incident: the
symptom is a feature nobody can use rather than one nobody is charged for. The
same mistake on `customerFlag` would fail the other way.

## 232. A workspace's own choices had nowhere to live

Config is the DEPLOYMENT's — one Stripe key, one mail provider, set by an
operator, the same for everybody. There was no counterpart for the WORKSPACE's:
its name, its colour, how often it expects somebody to check in. Every app would
have grown its own table, its own write endpoint and its own defaults — and the
default is the part that goes wrong, because three readers each deciding what an
absent row means is three decisions and the one that differs is a policy that
says fourteen days on the screen and never in the sweep.

⚠️ AND ONE OF THEM IS A COLOUR, WHICH IS AN INJECTION SITE. Anything a CSS parser
would accept is also a way to put a `url(...)` or a variable reference into a
stylesheet this product renders for other people. A hex triple or nothing.

⚠️ THE THREE BRANDING KEYS ARE COPIED TO THE DIRECTORY, and that is the one place
a setting is written twice on purpose: the sign-in screen wears them and renders
BEFORE there is a session, therefore before there is a tenancy whose regional
store could be read. `DIRECTORY_FIELDS` and its conformance test made adding the
column a deliberate act, which is exactly what that test is for.

## 233. `grandfathered_json` was read by the resolver and written by nothing

The column has existed since the beginning, the resolution walk has always
honoured it, and the comment above it explains at length why it may only ratchet
up. Nothing ever wrote a value into it — because until an operator could edit a
plan there was nothing to protect anybody from.

Making the catalogue editable is what turns that from an unused column into a
live promise. A workspace bought three seats; the plan becomes two, for good
reasons about what is sold from now on; and without the snapshot that workspace
loses a seat it paid for, mid-period, with no notice. The symptom is a colleague
who cannot sign in and a support conversation nobody can explain, because the
plan says two and appears always to have.

⚠️ AND `UNLIMITED` IS THE TOP, NOT A SMALL NUMBER. Stored as -1, an arithmetic
comparison reads unlimited as lower than one — so "you had unlimited and now have
five" records no snapshot at all, silently, for exactly the workspaces with the
most to lose.

## 234. "Your plan includes undefined, and undefined are in use"

A problem's `detail` is a template over the meta a raise site supplies, and the
seat ceiling raised `platform.quota_reached` with neither number in it. Nothing
throws when that happens and nothing can: the template is a function and the
missing value is a legal `undefined`. It is customer-facing copy, on a refusal,
at the moment somebody is trying to add a colleague.

Two fixes, because one is not enough. The raise site now carries both numbers;
and a detail that cannot be completed is WITHHELD on the way out, leaving the
title and the code — both of which are still true. A sentence with a hole in it
is worse than no sentence.

It was found by a fixture that hit the seat limit by accident.

## 235. A retried test file conflicted with its own first attempt

Kova's suite shares storage across files on purpose and retries a file once. Put
together, a fixture that creates a FIXED slug takes the address on its first
attempt and is told the address is taken on its second — so whatever actually
failed is replaced by "the studio must have been created", about a workspace the
same file made ninety seconds earlier.

It cost most of an afternoon and three wrong hypotheses: a module-level seeding
flag, a stale recorded message, and file parallelism. All three were plausible,
two produced real improvements worth keeping, and none was the cause.

⚠️ THE FIXTURES NOW SAY WHAT WENT WRONG WHERE IT WENT WRONG. `signIn` returning
`""` on a refusal is what made this expensive: the failure surfaced three calls
later in a different assertion with nothing naming the sign-in. Every fixture
assertion in this repo exists because of one of these.

⚠️ AND NOTHING MAY CLEAR `recorded`. It is a module-level map several files are
mid-sign-in against; a tidy-up that emptied it took another file's undelivered
code with it — which was one of the three wrong hypotheses, added as a fix and
removed as a cause.

## 236. A client could not upload anything, so every camera feature was unreachable

`file:write` was staff-only, with a comment on the test that pinned it: "their
photographs arrive through the surfaces built for them". No such surface existed.

So `ai.snap-meal`, `ai.label-reader` and progress photographs all carried a
client's permission and a client's customer flag, and were refused at their first
step — the upload — on a DIFFERENT operation. Nothing could report that: each
feature's own gate said yes, and the 403 arrived from an endpoint whose failure
looks like an ordinary permission decision.

⚠️ THE FIX IS THAT A PURPOSE SAYS WHO MAY UPLOAD UNDER IT. A purpose is already a
policy — what a file is for, which types, how large — and "who may put one here"
is the same question. One permission on the operation forces one answer for every
kind of file a product holds, and the ends of that range are not close: a movement
demonstration is the studio's and a photograph of a client's own body is theirs.

The composition check that came with it refuses a purpose naming a permission
nobody can hold, because that is an upload nobody can make failing as a 403 on a
screen that offered the control.

## 237. The check-in nearly regained the columns it was designed without

Writing the wellness score, the obvious move was to put sleep, mood, energy and a
weight on the weekly check-in — and an existing test refused it by name, with the
reason: numbers live in `entry`, one fact one home, and a figure copied onto a
report is a second version nobody can correct.

Reading them from `entry` instead is both correct and better: correcting a
mistyped weigh-in now moves the score, which is the property the original
decision was protecting and which the copy would have broken. `energy` joined
`sleep` and `mood` as an entry kind rather than as a column on a report.

⚠️ IT WAS CAUGHT BY A TEST WRITTEN TO PIN A DECISION, not by one describing
behaviour. That is what those are for, and it is the second time this session
that an old assertion has stopped a plausible new mistake.

## 238. Making the catalogue editable left the storefront reading the old one

The previous increment made plans editable and wired the GATE to the result. Six
other read sites kept reading `app.access.plans` — the shelf, the preview, the
standing screen and the plan chooser among them.

So an operator raising a price would have changed what is charged and not what is
shown; lowering a ceiling would have changed what is enforced and not what is
promised. A customer reads three on the pricing page, is given ten, and the
receipt agrees with neither. Every number involved is a perfectly ordinary
number, and nothing throws.

⚠️ THE FIX IS THAT THE CATALOGUE IS RESOLVED ONCE PER REQUEST AND HANDED DOWN,
beside the entitlements, from the same call the gate resolves through. Two reads
of the same overrides would agree today and disagree the first time either is
touched — which is the shape this platform keeps finding, and the shape it keeps
answering the same way.

⚠️ AND IT IS THE COST OF THE PREVIOUS INCREMENT'S OWN WORK. Adding an override
layer means every reader of the thing overridden is now a candidate. The gate was
the one that felt like the answer; it was the one the tests were about.

## 239. A request that could answer itself, twice

Two records in this product are shaped like a question — a client asking to swap
a movement, and a coach asking to be released from a client. In both, the asker
must hold the collection's write permission in order to ask at all, which puts
the answering fields on the same row behind the same derived update.

The swap was closed in an earlier increment. The release was written new, in this
one, and the field-level narrowing was easy to get right BECAUSE the earlier one
existed to copy. What was missing was anything that would catch the third.

⚠️ SO THE CHECK WALKS THE SHAPE RATHER THAN NAMING THE TWO. A test that asserted
`swap` and `release` passes forever while somebody adds a fourth request-shaped
record with an open answer. `asking.test.ts` insists that every collection with an
`asked` state has a narrower write on its state AND on every field carrying the
answer — because a decision with an open "what we agreed" field is one the asker
writes for themselves.

## 240. A hook the platform documented and nobody implemented

`send` on the runtime options carried this comment: *"The decision is the
platform's; the sending is not — but 'not sending at all' is not a third option.
Absent, the deployment's own mail lane carries it."*

Absent meant nobody carried it. `dispatch` was handed `opts.send`, which no app
passed, so every notification whose channel resolved to `email` was rendered,
counted, returned as a `Delivery` — and dropped. The inbox row was written, so
nothing looked broken, and the only observable symptom is a person saying they
were not told.

⚠️ THE COMMENT IS WHAT MADE IT INVISIBLE. It describes the behaviour precisely
and reads as a statement about the code beneath it. This is the same class as a
mechanism with no surface, one level down: a mechanism with a documented default
and no default.

It surfaced only because a test asked for something else entirely — that a
studio's sign-off appears at the bottom of what its client is sent. There was no
message to put a sign-off on.

## 241. And the audience said everybody was an owner

Under the missing delivery was a second one. Kova supplied its own `audienceFor`,
which read every distinct `account_id` out of `sessions` and returned each with
the role `"owner"`.

Every client-facing notification this product declares — a published programme,
an answered check-in — has `roles: ["client"]`, and matched nobody. Every
staff-facing one reached anybody who had ever signed in, including customers.
Both halves are silent: an inbox empty where it should have a row, and full where
it should not.

⚠️ THE FIX WAS TO DELETE THE OVERRIDE. The platform's default is the membership
roster with each person's real role, which is the answer this app was standing in
front of with something worse. An `audienceFor` is for a product whose audience
genuinely is not its members; supplying one because the option exists is how a
default that was right gets replaced by a guess.

## 242. Idempotency was declared on every write and enforced on none

Every operation in this platform declares an `Idempotency`. Nothing read it.

The declaration is not decoration — a payment webhook, a credit grant and an
offline queue all depend on it — so the honest reading is that a hundred writes
carried a promise about retry behaviour that nothing kept.

⚠️ AND THE OBVIOUS IMPLEMENTATION WOULD HAVE BEEN WORSE THAN NOTHING. `natural`
names an input field, and caching a response against it would break `update`:
two genuine edits to one row carry the same key, and the second would be answered
with the first one's result and never applied. `natural` is a claim that the
operation is idempotent BY CONSTRUCTION — publishing a plan that is published,
deleting a row that is deleted — and needs no table at all.

`client-supplied` is the one with something to enforce, and `create` is the one
write that needs it: an update names the row it changes, a delete names the row it
removes, a create names nothing. The key comes from the caller because only the
caller knows two attempts were one intent — three sets of ten really is three
identical rows, and a gym is where somebody does the same thing twice on purpose.

## 243. Five tables the platform created and never scoped

Erasure here is derived from what each module declares. The commerce module
declared four tables and creates nine.

`customer_purchase`, `customer_lapse`, `access_code`, `discount_code` and
`tenant_payments` were in no scope, so erasing a workspace left its purchase
history, its lapse policy, its unspent codes — and the secret its own payment
provider signs webhooks with — in the regional store. Every statement the sweep
was given succeeded, and it reported that the workspace was erased.

⚠️ `unscopedTables` ALREADY EXISTED AND WAS TESTED AS A FUNCTION. Nothing ever
ran it over the platform's own modules. A helper written for apps to use, that the
platform did not use on itself, which is worth noticing as a shape.

`runtime/test/scope.test.ts` walks `PLATFORM_REGIONAL` and allows exactly one
exemption, with a reason: `sessions` belongs to an account rather than to a
workspace and has no tenant column to cascade on. The list may only shrink — an
entry for a table that has since been scoped fails the test, so an excuse written
once cannot come to cover an oversight added under it.

## 244. A catch that answered a broken query with a confident fact

The public shopfront read a studio's packages with `WHERE active = 1`. There is
no `active` column. The read was wrapped in `.catch(() => [])`, so the query
failed on every request and the page told every stranger that this studio sells
nothing — which is indistinguishable from a studio that sells nothing.

⚠️ THE CATCH WAS THE BUG, NOT THE WRAPPER AROUND IT. It was written to keep a
public page from 500ing, which is a real concern; what it actually bought was a
plausible lie in place of an error nobody could see. The read is unwrapped now: a
shopfront that cannot answer says so.

## 245. An SSRF defence that is a shape rather than a validation

The three public-catalogue lookups added here take a barcode and a search term
from a customer. The classic failure is not exotic — build
`https://api.example/v1/${code}`, be handed a code containing `../` or a whole
other host, and make that request from inside the network the worker sits in.

⚠️ SO THERE IS NO ARGUMENT ANYWHERE THAT COULD CARRY A URL. An app declares the
services it may reach BY HOST; a caller supplies path SEGMENTS, each escaped; the
URL is assembled in one function. Validation would be a promise to have thought
of every character that means something in a URL, and the first version of the
host check made exactly that promise and lost: it blocked `/`, `:` and `*`, and
accepted `example.test?a=1`, which puts the whole escaped path inside a query
string. It is an allow-list now — labels and dots — because a hostname has a
shape and everything else is a mistake whatever it would have done.

## 246. A third of the guards ran only where somebody remembered

`ci.yml` and `deploy.yml` both ran `pnpm turbo run typecheck` and
`pnpm turbo run test`. Neither ran `pnpm test`, which is `pnpm gate && turbo run
test`, and no package's own `test` script invokes a gate script.

So the 36 guards whose implementation is a script rather than a vitest file ran
only when a person typed the command on their own machine — including all eight
platform checks: the documentation kinds, the deferral markers, the generated
blocks, kernel layering, the vocabulary rule, the day-zero declarations, the
binding chokepoint, the surface rules, the interface rules, the test budget and
the capability inventory.

⚠️ AND THE REGISTRY SAID THEY WERE FINE. Its "invoked" check asks whether a
SCRIPT names each guard, and `pnpm gate` did — so a guard could be correctly
registered, correctly implemented, correctly named by a command, and reached by
nothing that runs. The check that guards the guards had the guards' own failure
in it.

The fix is a check rather than a line in a document: `guards.test.mjs` now reads
both workflows and requires each to name every command a live guard depends on —
`pnpm gate`, `turbo run test`, `turbo run typecheck`. Comments are stripped
first, because this file explains the rule in its own prose and a check
satisfied by a sentence about itself proves nothing.

## 247. Three registries declared, validated, guarded and unreadable

`help`, `governance.legal` and `releases` were all declared by the manifest,
checked at composition, covered by guards, and served by no route.

- Eleven help articles. `helpProblems` checked their length, their step count and
  their vocabulary; `danglingHelp` refused a cross-link to one that did not
  exist; `help-limits` was live in `pnpm gate`. Nothing served a word of any of
  them.
- Two legal documents with `mustAccept` roles, against no acceptance ledger and
  no endpoint. A compliance obligation expressed as a type.
- Twenty-one versions of release notes, shape-checked by `release-note-shape`,
  read by nothing in the runtime.

⚠️ THE CHECKING IS WHAT MADE IT INVISIBLE. Thorough validation of a thing nobody
can reach reads exactly like coverage, and the more careful the validation the
more convincing it is — a guard that asks whether an article is short enough and
free of developer vocabulary cannot ask whether anybody can open it.

`capability-reachable` catches this shape for a schema module. It did not ask the
same question of a manifest REGISTRY, so `scripts/surface.test.mjs` now
classifies every field on `AppSpec` as either read by a person — with the
expression an operation reads it by — or consumed by the platform, with what acts
on it. A field added later fails until somebody says which, which is the only
moment the question is cheap.

## 248. A collection quietly replaced a platform operation

Adding a changelog reader called `release.list` produced a 403. Kova declares a
collection called `release` — a coach asking to be let go of a client — and its
derived `release.list` had taken the route.

The runtime already refused an app's HAND-WRITTEN operation colliding with a
platform one, with a comment explaining why last-registration-wins would let a
manifest replace tenant creation or erasure with its own version. The derived
surface was registered with a bare `byPath.set` and no check at all.

⚠️ A DERIVED COLLISION IS WORSE THAN A DECLARED ONE, because nobody wrote the
colliding line. It appears the day somebody names a collection after a word the
platform already uses, and the symptom is a route answering, with the wrong
permission, about the wrong thing.

The refusal now covers both, and names the collection and the operation. The
changelog reader is `changelog.list`: the collision is refused, but a platform
lane that reads like an ordinary noun is one every app has to avoid naming a
collection after, and that is a cost worth not imposing.

## 249. A test that asserted an array of undefined did not contain a string

The consent test checked that `legal.accept` is not offered to a model:

```ts
const tools = (await owner.get("/api/tools.list")).body.tools as { id: string }[];
expect(tools.map((t) => t.id)).not.toContain("legal.accept");
```

A `Tool` has `operationId`, not `id`. So the assertion mapped every tool to
`undefined` and checked that a list of `undefined` did not contain a string,
which is true for every possible answer — including an empty list, a broken
endpoint, and the mutation that offers consent to a model. It survived that
mutation, which is how it was found.

⚠️ THE FIX IS THE POSITIVE HALF, not the corrected field name. A negative
assertion over a collection proves nothing until something proves the collection
is not empty and is the shape you think — so it now asserts an operation that
SHOULD be listed as well as the one that should not.

## 250. A channel that delivered nothing

`Channel` was `"inbox" | "email" | "push"`. `channelsFor` returned `push` when a
preference asked for it, `Preferences` carried the flag, `inbox_prefs` stored it,
and the settings operation took it on the wire.

There is no service worker in this platform, no subscription store and no device
to receive anything. What shipped was a switch somebody could turn on that
silently did nothing — which is worse than an absent feature, because turning it
on is a reason to stop watching the inbox.

⚠️ REMOVED RATHER THAN IMPLEMENTED, and that is the honest end of the decision. A
channel is a promise about delivery; it comes back with the offline work that
gives it something to reach. The `push` COLUMN stays on the preferences table —
dropping a column on a live table to reclaim a byte is a risk taken for tidiness.

## 251. Fifteen declarations an app can write that change nothing

The last three findings were three instances of one shape, found by hand, one
audit at a time. This is the shape stated generally and turned into a check.

Every field on every `*Spec` interface in the kernel must be READ by some file
other than the one declaring it. The declaring file does not count, and that
exclusion is the whole idea: validation lives exactly there, and validating
something nobody consumes is what made `help`, `legal` and `releases` look
covered for twenty-one versions.

Run over the kernel, 117 of 132 spec fields are acted on. The other fifteen are
carried with a reason each. Six are waiting on the renderer (`views`, `print`,
`realtime`, `offline`, `sounds`, `pack`) and one is consumed outside the
directories the check can see (`retired`, read by each app's lock comparison).
The remaining eight are real, and every one is a behaviour an app has already
been told it has:

- **`TenancySpec.doors`** — an app declares which doors it has and host
  resolution ignores the declaration, so an app that says it has no `setup` door
  has one anyway. A declared restriction that is not applied.
- **`CollectionSpec.retention`** — `days` and `onTenantClose` per collection,
  and the erasure cascade treats every collection alike. MANIFEST.md §9 lists
  retention as day-zero because it "informs the schema and the erasure cascade".
- **`OperationSpec.meter`** — generation meters through its own path; this field
  meters nothing, so an operation declaring `{ unit: "credits" }` is free.
- **`OperationSpec.rateLimit`** — nothing counts requests. §9 lists it day-zero
  because it "shapes the request pipeline".
- **`GovernanceSpec.impersonation`** — a time box and an announcement for
  operator access, with no impersonation surface at all. `Actor.impersonatedBy`
  exists in the primitives and nothing ever sets it. §9: "the audit trail must
  exist from the first support session."
- **`GovernanceSpec.auditRetentionDays`** — nothing prunes the audit.
- **`FormatSpec.weekStart`** — every weekly read picks its own boundary.
- **`IdentitySpec.sessionScope`** — the cookie logic does not consult it.

⚠️ THE LIST MAY ONLY SHRINK, and that is what makes it a plan rather than an
excuse: an entry that becomes consumed fails until it is deleted, and a NEW
unconsumed declaration fails on the commit that adds it rather than at the next
audit. Which is the point — this check exists so that the next one of these is
found by a script on a Tuesday instead of by a person reading a document.

## 252. Five generations that spent credits and said nothing

`readsAPicture` and `drafts` are operation factories in Kova — one builds "send
a picture to a model and return what it read", the other "draft something from a
sentence" — and between them they make seven of the AI operations.

Neither declared an `outcome`, so five writes that spend a workspace's credits
answered with nothing a screen is told to say. MANIFEST.md §2's own table has the
case: a result the user cannot see happen is a toast, and silence is reserved for
"something visibly happened already". A generation is the opposite of visible.

⚠️ AND THE FIX IS ONE LINE BECAUSE THE FACTORIES EXIST. Declared on the factory,
every reading and every draft built from it acknowledges the same way — which is
the argument for the factories being the platform's rather than one app's, since
the next app writes the same two.

## 253. The audit was built, collected, and thrown away

`auditFor` produced an entry for every operation declaring one. The entry was
pushed into an array in the request handler. The array was never read, and there
was no audit table.

Fifteen of Kova's operations declare an `audit:`. So does every operator action —
comping a workspace, adjusting its ceilings, topping up its credits, replaying a
payment event. None of it left a trace, and every line of code involved was
correct.

⚠️ A TEST OF THE ENTRY'S SHAPE WOULD HAVE PASSED THROUGHOUT. `auditFor` is pure
and does exactly what it says; what was missing was a caller. Which is why the
first assertion in `watching.test.ts` is that a row exists at all, before any
assertion about what is in it.

MANIFEST.md §9 lists audit as day-zero for the reason this demonstrates: it is "a
table, and evidence you cannot reconstruct". Everything before this commit is
gone.

## 254. A restriction written down and not applied

`TenancySpec.doors` has been declared by every app since the first one, and
`classifyHost` never took it. So an app declaring `["root", "setup", "slug"]`
still had an `admin.` console door, and one declaring no `custom` still resolved
any hostname through the custom-domain lookup.

⚠️ WORSE THAN NO DECLARATION, because somebody has read it and believes it. A
missing restriction is a question somebody asks; a stated one is a question
nobody asks again.

The fix makes `doors` required on `DoorConfig` rather than optional — an absent
list would have meant "all of them", which is the behaviour being removed. An
undeclared door under our root is `unclaimed`; a foreign hostname with no
`custom` door is `invalid`, because it is not under our root and never could have
been ours.

## 255. Reading an obligation as a prohibition

`retention.onTenantClose` is `"purge" | "export-then-purge"`, and the first
implementation of it here filtered every `purge` collection OUT of the export.

That is backwards. `export-then-purge` does not say "never export this" — it says
an export happens BEFORE this is destroyed, which is a promise about the ORDER of
two operations. `purge` is the absence of that promise, not a ban.

⚠️ AND THE CORRECT READING CANNOT BE HONOURED BY A FILTER. It also cannot be
honoured by telling somebody to take an export first: an instruction attached to
the one operation in this platform with no undo is a thing that gets skipped at
three in the morning. So `exit.erase` RETURNS the data from every collection that
asked for it, before deleting anything — the promise cannot be broken by
forgetting.

The near-miss is worth recording on its own. The wrong version passed
typechecking, read plausibly, and was caught by an existing test asserting that
the export covers every table — a test written for a different reason two stages
earlier.

## 256. Three declarations removed rather than implemented

`OperationSpec.meter`, `Channel = "push"` (finding 250) and a single-member
`sessionScope` were all fields an app could fill in that changed nothing.

`meter` was the clearest case. Every billable unit already meters through a typed
path that knows what it is counting — generation reserves against the credit
ledger before reaching a provider, storage checks stored bytes against the
ceiling, seats are counted from the roster — and each of those is guarded. A
fourth declaration naming a unit and doing nothing was not an unfinished feature;
it was a way to write `meter: { unit: "credits" }` and believe it was charging.

`sessionScope` went the other way and became real: `"origin" | "host"`, where
`host` is a cookie with no Domain at all. Both are postures a product might want,
and the one-value version meant every session widened to the app root whatever
the manifest said.

⚠️ THE TEST FOR WHICH: is there a second implementation somebody would plausibly
want? For `sessionScope` yes, and it took four lines. For `meter` no — writing
one would mean a fourth metering path competing with three that work.

## 257. A rate limit is per operation or it is a defence against nothing

`rateLimit` was day-zero in MANIFEST.md §9 and counted by nothing.

⚠️ AND IMPLEMENTING IT AS A GENERAL DEFENCE WOULD HAVE BEEN WRONG. A worker in
front of a global network already has a layer that absorbs volume; what a
declaration can do that the network cannot is know that THIS operation is
expensive when one caller repeats it — a code that can be guessed, a message sent
to somebody else, a generation that costs money. So it is counted only where
declared, and an operation naming none pays nothing.

Two decisions inside it are worth the words they cost. The window is part of the
KEY rather than a timestamp to compare, so a spent window stops being matched
when it rolls over and nothing has to expire anything — the sweep is a tidy-up
rather than the thing correctness depends on. And a store that cannot answer
ALLOWS the request: a limiter that fails closed turns one broken table into a
product nobody can use, which is a larger outage than the one it was preventing.
