# Building on OneEngine

kind: standards

**Why the engine is shaped this way, and how to add to it without breaking the
property that makes it worth using.** [ENGINE.md](ENGINE.md) is what exists;
this is everything a generator cannot derive.

⚠️ **THIS DOCUMENT IS WRITTEN FOR SOMEBODY WITH NO MEMORY OF WRITING IT.** That
is not a style choice. The work is long, the context that holds it is finite, and
the failure it exists to prevent is: a decision gets made, the conversation that
made it is compressed away, and the next session re-derives it differently. Two
answers to one question is how a platform rots.

So three rules govern everything written here:

1. **Every decision states its own reason, inline.** Never "as discussed", never
   "see above", never a reference to a conversation. If the reason is not on the
   page, the decision is not recorded.
2. **Every decision is numbered and citable** — `D7` — in
   [DECISIONS.md](DECISIONS.md). Code comments and guards cite the number, and a
   guard that fails names the decision it was protecting.
3. **What is not built yet says so in a marker a script can find** —
   `DEFER(engine-N)` — never in prose somebody has to remember.

---

## 1. The shape

### 1.1 The inversion

One worker. Many products. Many workspaces. A workspace may hold several
products, and everything a product needs beyond its own logic is declared once
and wired by the framework.

The attempt before this one got the mechanisms right and the **topology** wrong,
in three ways that each became a decision here:

- **An app was a deployment.** Every product had its own worker, its own
  databases and buckets, its own domain binding, its own secrets, its own row in
  a registry, and a provisioning workflow to create all of it. That machinery
  existed *only* because resources were per-app. It is a checklist where it
  should be a function.
- **A workspace was per-app.** A business using two products had two workspaces,
  two addresses, two custom domains, two rosters, two bills — and a switcher
  built to paper over the seam rather than close it.
- **Every database was per-app, so nothing could be balanced.** A product
  hammering the store and a product barely touching it sat on separate databases
  with no way to mix them and no way to move a workspace off a hot one.

The inversion is all three at once: **the workspace is primary, apps are enabled
on it, and storage is placed rather than owned.**

### 1.2 Entities

| Entity | What it is | Where it lives |
|---|---|---|
| **Account** | A person. One identity across every product. | Directory |
| **Tenant** | A workspace. Holds one or more apps. | Directory row, records in its placement |
| **App** | A product, as a manifest. Not a deployment. | Code |
| **Enablement** | This workspace has this app switched on. | Directory |
| **Placement** | Which shard holds this workspace's records. | Directory |
| **Membership** | A person is in a workspace, in a role. | Shard, indexed in the Directory |

⚠️ **AN APP IS NOT A WORKSPACE'S OWNER, IT IS ITS CAPABILITY** (D1). `tenant_app`
is the enablement row, and turning a product on is a write to it — nothing is
provisioned, no domain is bound, no resource is created. That is the whole of
what "provisioning becomes a feature flag" means, and it is only true because the
workspace is primary and storage is placed rather than owned.

### 1.3 The two stores, and why the split is load-bearing

**The Directory — one global database.** It holds what a cross-workspace
question needs and nothing else: accounts, sessions, tokens, workspaces and their
placement, enablement, the membership INDEX (never a grant), subscriptions,
credits, and what the deployment has made for itself.

⚠️ **EVERY FACT A CROSS-WORKSPACE QUESTION FILTERS ON LIVES HERE (D5).** Once
workspaces are spread across shards, the operator console, the dunning sweep and
the purge sweep cannot fan out over N databases to answer "which workspaces are
past due". The directory answers; the shard holds the records. A new question that
needs a new column gets the column here — that is the standing rule, and it is
what makes sharding payable.

**The Shards — one per region, each holding many workspaces of mixed products.**
A shard's schema is the union of the schemas of the apps its workspaces have.

⚠️ **PLACEMENT AND SCHEMA ARE COUPLED.** A workspace can only be placed on a shard
whose schema covers its apps, and enabling an app may mean applying that app's
schema to their shard first. It is a constraint rather than a blocker, and it is
the one that is expensive to discover late.

[ENGINE.md §7](ENGINE.md#7-where-the-records-are-and-what-leaving-takes-with-it)
is the generated table of every table in both, with what each one's presence
means for a person's export and their erasure.

### 1.4 The layers, and the arrow

```
@engine/kernel    Pure. Types, rules, decisions-as-functions. No I/O, no
                  bindings, no React. Provable with no fixture at all.
@engine/runtime   The ONLY code that touches a binding. Turns a manifest into a
                  live worker: routing, gates, storage, dispatch, jobs.
@engine/design    OneDesign — what a screen draws. Router-free; an app brings
                  its own.
apps/*            Manifests. Product vocabulary lives here and nowhere else.
```

The arrow points one way and a guard enforces it: `apps → design → runtime →
kernel`, never back.

⚠️ **`runtime` AND `design` BOTH DEPEND ON `kernel` AND ON NEITHER OTHER**, which
is what decides where a shared thing goes. The logo's geometry is in the kernel
rather than in the design system precisely because the Worker draws it too.

`@engine/design` holds no product vocabulary — no clients, no invoices, no
workspaces — and the vocabulary guard refuses product nouns in shared code.

---

## 2. The rule the whole framework is built around

⚠️ **A DECLARATION THAT REACHES NO SURFACE IS THE FAILURE THIS FRAMEWORK EXISTS
TO PREVENT.** The predecessor shipped it repeatedly: a mechanism fully built,
tested and wired, with nowhere a person could look — an entitlement nothing
gated, a notification registry with no bell, a schema applied and no route to
reach it. Every one of them passed every test.

So the rule is bidirectional and both halves are guarded:

- **Declared → surfaced.** Every declaration renders somewhere a person can see
  and change it, without an app writing a screen.
- **Surfaced → enforced.** Every switch a person can press changes behaviour. A
  control that does nothing is worse than an absent feature, because people stop
  looking for the thing it promised.

[ENGINE.md §12](ENGINE.md#12-what-is-built-and-reached-by-nothing) is the live
list of what is currently on the wrong side of that, derived rather than
remembered. It is the section to read before believing any other one.

---

## 3. The three kinds of rule, and only one of them is safe

**Structural** — the shape makes the wrong thing unwriteable. `Loaded<T>` has no
value to seed with, so "`[]` is not *not yet*" cannot be got wrong. `planRun`
returns the system prompt and the reserve it implies from one call, so a caller
cannot hand a different text to each. This is the best kind and it is rarely
available.

**Guarded** — the wrong thing is writeable and a check refuses it at build time.
Everything in `docs/guards.json`. This is the working kind.

**Written down** — the rule is in a comment, a document, or a `refuse*` function,
and nothing runs it.

⚠️ **THE THIRD STATE IS NOT A WEAKER VERSION OF THE SECOND; IT IS THE MOST
DANGEROUS STATE A RULE CAN BE IN.** A rule that is merely absent gets noticed the
first time somebody needs it. A rule that is written down and not in force is
argued for in its own header, cited by other files, and does nothing — and it is
read by the next person as a reason not to check.
[ENGINE.md §11](ENGINE.md#11-what-is-already-refused-for-you) records every
kernel rule's lane, and `scripts/rules.test.mjs` fails on one that has none.

⚠️ **AND A MENTION IS NOT A USE — THE LANE MUST IMPORT THE RULE.** That walk
matched a bare identifier for a while and credited `unread` — the rule about a
setting nobody reads — to a surface, because the shell's crown has a notification
count of the same name. The one guard that genuinely applies a kernel rule
imports it and calls it, so the evidence is an import and there is nothing to
exempt.

---

## 4. What the guards catch, in shapes

The registry is the list; what is worth knowing here is the SHAPE of what they
catch, because that is what tells you whether the next thing you write is
covered.

| Class | Guard | The failure it refuses |
|---|---|---|
| A declaration reaching nobody | `surface` | a mechanism built, wired, tested, with nowhere anybody could look |
| A rule reaching nothing | `rules` | a refusal argued for in its own header and called by nothing |
| A capability reaching nothing | `capability` | tables applied on every deploy, a store with tests over it, a document describing the feature, and no address anybody could reach it at |
| A capability reaching no route | `access`, `services` | tables applied, a store bound, dispatch sites writing rows, no route to reach any of it |
| Two answers to one question | `rules`, `edit`, `problem` | a lane working out for itself what the kernel already decides |
| A grammar breaking quietly | `heroui`, `metrics`, `states`, `shape`, `descend`, `edit` | a screen that typechecks, renders, looks finished and reads as a filing cabinet |
| A name nobody mapped | `face`, `space` | a neutral circle in a list where every other row has a shape |
| Words drifting | `tone`, `problem` | the product speaking in two voices, or one code meaning three things |
| A document going stale | `docs` | a count typed by hand, wrong within a week, taking the rest of the page's credibility with it |

### 4a. Two failure modes, and only one of them is derived

**"Is this thing wired to anything?"** — DERIVED, and effectively complete. The
checks walk the declarations themselves, so a declaration added tomorrow is
covered the day it is added, by nobody.

**"Does this already exist?"** — CURATED, and it is the weaker half. It rests on
three things and none is a walk over the code:

1. **A current index of what exists** — [ENGINE.md](ENGINE.md) and
   [../design/README.md](../design/README.md), both generated. This is the
   mechanism that actually prevents reinvention, and it works by being read.
2. **Named traps for the duplications that have cost something.** Each is a pair
   somebody actually wrote twice.
3. **Judgement**, for everything else.

⚠️ **AND TWO DERIVED VERSIONS OF (2) WERE TRIED AND MEASURED AS WRONG**, so
nobody spends an afternoon rediscovering them. "The design system imports a
HeroUI component, so a screen using it directly is a bypass" flagged 3 of 81 and
all three were correct code — D7 deliberately says use the library's components,
themed through tokens, so most of those imports are the pattern rather than a
breach of it. "A surface defines a component the design system exports" flagged
3, all false: a *screen* called `Money` is not the `Money` component.
Reinvention is a semantic fact, and the shapes that would catch it also catch the
code that is right.

---

## 5. The standards

### 5.1 A comment states the invariant, never the incident

⚠️ **"The reserve is a ceiling on revenue" stays true forever. "That copy
under-counted four ways" describes a codebase that will not exist, and reads to a
future reader as a live warning about an impossible problem.**

Write what must always be so and what breaks if it is not. If a past defect is
worth preventing, that is a **test**, not a paragraph.

Comments carry weight where the code cannot: a rule that is invisible at the call
site, a refusal that looks like an oversight, an ordering that matters. They are
not narration.

### 5.2 A deferral is a marker, never a sentence

```ts
// DEFER(engine-14) stage:5 — the sky's motion is still a single gradient.
```

Found by `scripts/docs.test.mjs`, not by memory. **A stage cannot be marked
shipped while anything defers to it** — that is the mechanism that makes
"shipped" mean something, and it is the only reason the stage table can be read
instead of the code.

Prose saying "we will do this later" is a deferral nobody can enumerate, and the
docs guard refuses it.

### 5.3 Every guard names the decision it protects

`docs/guards.json` is the registry. Each entry:

```json
{
  "id": "a-tenant-is-never-keyed-by-its-app",
  "protects": "D1",
  "stage": "2",
  "status": "live",
  "impl": "kernel/test/tenancy.test.ts",
  "proves": "a literal string that implementation contains",
  "fails": "what goes wrong in the world when this breaks"
}
```

Four properties make this more than a list:

1. **`proves` must appear in the implementation.** Rename the assertion and the
   registry fails — a guard cannot quietly stop existing.
2. **A live guard must actually run**, reached by `pnpm engine:gate`,
   `engine:test` or `engine:typecheck`. A check nobody invokes is no check.
3. **`protects` must name a real decision.** A guard defending nothing recorded
   is one whose reason will be forgotten and then removed as noise.
4. **`stage` must name a row in `docs/stages.json`**, so a guard cannot protect
   work that is not on the map.

`fails` is written as a **consequence in the world**, never a restatement of the
assertion. "A workspace's records unreachable after a move", not "the key is
wrong".

### 5.4 An inventory is generated or it does not exist

Any table counting things lives in a generated block:

```md
<!-- generated: node scripts/inventory.mjs guards -->
...
<!-- /generated -->
```

Verified by the docs guard. **A hand-typed count is wrong within a week**, and a
document wrong in a checkable way stops being read for the parts that are right.

⚠️ **AND THE GENERATOR REFUSES RATHER THAN SKIPPING.** A module with no gloss
stops the whole page, because an index silently missing an entry tells the reader,
in a generated table, that the thing does not exist — which is how the same
capability gets built twice.

### 5.5 Every document declares a kind

`kind: plan | decisions | standards | progress | guide` on the second line. The
docs guard refuses one without it, and refuses one nothing links to — an orphan
document is a document that drifts unread.

There are two documents here and three registries, and that is deliberate.
[ENGINE.md](ENGINE.md) is what exists and is generated; this file is why and how,
and cannot be. `docs/guards.json`, `docs/stages.json` and
[DECISIONS.md](DECISIONS.md) are the registries that feed the first — the third
is prose because a decision's ARGUMENT is prose, and it is append-only: a
decision is never edited in place, only superseded by a later one that says so.

### 5.6 Tests prove behaviour; guards prove shape

A test asserts what the code does. A guard asserts what the code *is* — that
every write declares its audit, that every entitlement is named by a gate, that
every screen's destination resolves.

⚠️ **THE GUARDS ARE THE ASSET.** They are what makes a mistake fail at build time
rather than in production six weeks later, and they are why anything here can be
changed confidently. Any proposal that moves a check from build time to runtime
is trading the most valuable property this tree has, and must say so out loud.

⚠️ **A GUARD THAT WALKS A DIRECTORY MUST REPORT WHAT IT WALKED.** "No violations
found" and "nothing was looked at" are the same sentence without a number, and
three checks here printed the second for months. `gate.mjs` fails a walking guard
that reports no count.

⚠️ **AND A GUARD IS MUTATION-TESTED OR IT IS DECORATION.** Break the thing, watch
it fire, restore. This has never been ceremony: the rules guard passed two
mutations that deleted a rule's only caller, because the comment beside the call
kept the identifier in the file — and a file that argues for a rule at length is
exactly the file most likely to have stopped calling it.

### 5.7 What we take, and what we write

⚠️ **THE TEST IS: DOES THE LIBRARY ENCODE A DECISION, OR OUR INVARIANT? (D9)**

A **decision** is something the world already settled — how a date is formatted,
how MIME is framed, what P-256 is. Take the library; writing it ourselves is
reinvention, and the library has been battle-tested by more people than we will
ever have.

An **invariant** is a rule of *our* product — the gate order, how entitlements
resolve, who a notification is for, what a reserve is. No library enforces those.
Adopting one means writing them anyway, on top of it, which is strictly more code
and one more thing between us and the behaviour.

Both halves are load-bearing. Reinventing `Intl` is waste; delegating the
entitlement walk to a generic access package is a rewrite that loses
grandfathering and then has to grow it back.

⚠️ **AND A THIRD CASE SITS BETWEEN THEM: A DECISION IN A LIBRARY THAT CANNOT RUN
HERE.** Web Push is two published specifications and every implementation of them
is built on Node's `crypto`. A Worker has WebCrypto and no Node, so what gets
written is not the cryptography — it is the ASSEMBLY, and it is written out with a
test that performs the receiving half rather than checking it ran.

### 5.8 Before writing UI, ask the library

Decide what is being built → check what HeroUI ships → build with it. Never a
hand-built control the library already has, never a restyled one (D7).
[../design/DESIGN.md](../design/DESIGN.md) is the design language and governs
every screen in this tree; most of what it says is judgement no guard can hold,
which is exactly why it is written down.

---

## 6. How to add a rule so it stays in force

1. **Write it in the kernel as a `refuse*`** returning what is wrong, never
   throwing. That is what makes it enumerable, which is what makes the
   enforcement table possible at all.
2. **Call it from a lane a request goes through** — composition, the runtime, a
   surface, or a guard. If the capability does not exist yet, put a
   `DEFER(engine-N)` marker on the declaration and add the stage to
   `docs/stages.json`.
3. **Give the reference app an instance.** `refusePolicy`'s sharpest branch — an
   `action` notification may not be silenced — had no instance in `hello`, so no
   test could reach it and the branch was unexercised for as long as it existed.
   Anything absent from the reference app is absent from every app copied out of
   it.
4. **Add a guard entry** naming the decision it protects and, in `fails`, the
   consequence in the world.
5. **Mutation-test it.** Break the thing, watch it fire, restore.

---

## 7. How to add a capability so it is documented by itself

The index is generated, so a capability documents itself when it is put in the
places the generators read. Nothing here is a second description of the code.

1. **A new module** in `kernel/src` or `runtime/src` needs one line in
   `scripts/inventory.mjs` saying what it is FOR. Without it the generator
   refuses rather than skipping, so this cannot be forgotten quietly.
2. **A new table** needs a row in `HOLDINGS` (`runtime/src/dossier.ts`) saying
   who is in it, or why nobody is. `pnpm engine:gate` fails on one that has
   neither — which is the only version of "provably complete" that stays true
   after the person who wrote it has moved on.
3. **A new operation** that every app gets appears by itself, because
   `docs/surface.json` is emitted by the real composer. Run
   `EMIT=1 pnpm --filter @engine/hello test` and review the diff.
4. **A new door, gate or problem** appears by itself too, from the same file.
   A gate additionally needs its sentence in `inventory.mjs`, and the generator
   refuses without one.
5. **A new component** appears in `../design/README.md`'s generated list, and
   `scripts/showcase.test.mjs` fails on one nothing renders.

⚠️ **THE POINT OF ALL FIVE IS THAT THE DOCUMENT IS NEVER THE WORK.** Writing a
paragraph about a new capability is how a document comes to describe a codebase
that has moved. Putting the capability where the generator looks is how it comes
to describe the one that is there.

---

## 8. The six-minute checklist, before a commit

1. `pnpm engine:typecheck`
2. `pnpm engine:test`
3. `pnpm engine:gate`
4. New behaviour has a guard, and the guard names its decision and its stage.
5. New decisions are in [DECISIONS.md](DECISIONS.md) with what they forbid.
6. Anything unfinished carries a `DEFER(engine-N)` marker.
7. If the engine's surface changed, `EMIT=1 pnpm --filter @engine/hello test`
   and then `node engine/scripts/docs.test.mjs --write`.
