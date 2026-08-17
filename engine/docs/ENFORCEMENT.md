# Enforcement

kind: standards

**What stops this tree going off its own rails, and where each rule is actually
applied.** Read [STANDARDS.md](STANDARDS.md) first — this is §3 and §7 with the
inventory attached.

---

## 1. The three kinds of rule, and only one of them is safe

A rule in this tree is in one of three states, and the difference is the whole
subject of this document.

**Structural** — the shape makes the wrong thing unwriteable. `Loaded<T>` has no
value to seed with, so "`[]` is not *not yet*" cannot be got wrong. `planRun`
returns the system prompt and the reserve it implies from one call, so a caller
cannot hand a different text to each. This is the best kind and it is rarely
available.

**Guarded** — the wrong thing is writeable and a check refuses it at build time.
Everything in `docs/guards.json`. This is the working kind.

**Written down** — the rule is in a comment, a document, or a `refuse*` function,
and nothing runs it.

⚠️ **The third state is not a weaker version of the second; it is the most
dangerous state a rule can be in.** A rule that is merely absent gets noticed the
first time somebody needs it. A rule that is *written down and not in force*
reads as settled: it is argued for in a header, unit-tested, and cited by other
files as though it applied. `refusePolicy` spent months saying — in its own
comment — that the `action` rule "is enforced here rather than hidden in a
screen … a screen that simply does not render the switch is a rule that lasts
until the second screen, or the API, or the import that sets preferences in
bulk". Nothing called it. The API silenced action notifications for as long as
that comment existed.

---

## 2. Where each kernel rule is applied

⚠️ **A test is not enforcement.** A test proves a rule is CORRECT. Putting it in
force means something a request goes through calls it — composition (before an
app boots), the runtime (while somebody is making the write), a surface (before
it is sent), or a guard (at build time). Four of the rules below were only ever
reached by a test, and every one of them was unenforced in the product.

<!-- generated: node scripts/inventory.mjs enforcement -->
| Rule | Declared in | In force through |
|---|---|---|
| `claimsPlatform` | `access` | composition |
| `refuseRole` | `access` | deferred to stage 24 |
| `undeclared` | `access` | composition |
| `unholdable` | `access` | composition |
| `refuseCatalogue` | `ai` | runtime |
| `refusePrompt` | `ai` | runtime |
| `unknownInPrompt` | `ai` | composition |
| `refuseSurfaces` | `brand` | composition |
| `refuseTheme` | `brand` | runtime |
| `danglingRefs` | `collection` | composition |
| `refuseCollection` | `collection` | composition |
| `refusePacks` | `credit` | composition |
| `unbounded` | `credit` | composition |
| `refuseLadder` | `dunning` | composition |
| `refuseCatalog` | `entitlement` | composition |
| `unenforced` | `entitlement` | composition |
| `refuseField` | `field` | composition |
| `overdue` | `flag` | surface |
| `refuseFlag` | `flag` | composition |
| `refuseFlags` | `flag` | composition |
| `unreadFlags` | `flag` | composition |
| `orphanHelp` | `guide` | composition |
| `refuseGuide` | `guide` | composition |
| `refuseJob` | `job` | composition |
| `refuseJobs` | `job` | composition |
| `stalled` | `job` | surface |
| `missingDocuments` | `legal` | deferred to stage 25 |
| `refuseLegal` | `legal` | composition |
| `refuseApp` | `manifest` | composition |
| `refuseLetter` | `notify` | deferred to stage 23 |
| `refusePolicy` | `notify` | runtime |
| `unaddressable` | `notify` | composition |
| `unknownVariables` | `notify` | deferred to stage 23 |
| `unraisable` | `notify` | composition |
| `refuseOperation` | `operation` | composition |
| `unreachable` | `operation` | composition |
| `refusePackage` | `package` | runtime |
| `unknownProblems` | `problem` | composition |
| `refuseSetting` | `setting` | composition |
| `refuseSettings` | `setting` | composition |
| `unread` | `setting` | surface |
| `refuseCommercial` | `tenancy` | runtime |
| `refusePlacement` | `tenancy` | runtime |
| `refuseCopy` | `tone` | guard |
| `refuseRead` | `vault` | runtime |
| `refuseVault` | `vault` | composition |
| `strayFacts` | `vault` | composition |
<!-- /generated -->

`scripts/rules.test.mjs` fails on any row that would read `—`. The only three
honest answers to a rule nothing runs are **wire it**, **defer it with a marker**
so it is in the deferral list rather than in the silence, or **delete it**.

---

## 3. What the guards actually cover

The registry (`docs/guards.json`) is the list; PROGRESS.md holds the generated
table. What is worth knowing here is the SHAPE of what they catch, because that
is what tells you whether the next thing you write is covered.

| Class | Guard | The failure it refuses |
|---|---|---|
| A declaration reaching nobody | `surface` | a mechanism built, wired, tested, with nowhere anybody could look |
| A rule reaching nothing | `rules` | a refusal argued for in its own header and called by nothing |
| A capability reaching no route | `access`, `services` | tables applied, a DO bound, dispatch sites writing rows, no route to reach any of it |
| Two answers to one question | `rules`, `edit`, `problem` | a lane working out for itself what the kernel already decides |
| A grammar breaking quietly | `heroui`, `metrics`, `states`, `shape`, `descend`, `edit` | a screen that typechecks, renders, looks finished and reads as a filing cabinet |
| A name nobody mapped | `face` (`glyph:`), `hub` | a neutral circle in a list where every other row has a shape |
| Words drifting | `tone`, `problem` | the product speaking in two voices, or one code meaning three things |
| A document going stale | `docs` | a count typed by hand, wrong within a week, taking the rest of the page's credibility with it |

---

## 3a. Two failure modes, and only one of them is derived

The guards answer two different questions, and it is worth knowing which one you
are protected by, because they are not equally strong.

**"Is this thing wired to anything?"** — DERIVED, and effectively complete. The
checks walk the declarations themselves: every declaration reaches a screen
(`surface`), every kernel rule reaches a caller (`rules`), every capability
reaches a route (`access`, `services`, `agent`, `hub`), every destination
resolves. Nothing is listed by hand, so a declaration added tomorrow is covered
the day it is added, by nobody.

**"Does this already exist?"** — CURATED, and it is the weaker half. It rests on
three things and none of them is a walk over the code:

1. **A current index of what exists.** `design/README.md`'s export list is
   generated and the docs guard keeps it honest, so "does the package already
   ship this" has an answer that is right today rather than right when somebody
   last edited it. This is the mechanism that actually prevents reinvention, and
   it works by being read.
2. **Named traps for the duplications that have cost something** — `CodeEntry`,
   `TextInput`, `Lookup`, `Choice` in `heroui`; `refuseTheme` in `rules`. Each is
   a pair somebody actually wrote twice.
3. **Judgement**, for everything else.

⚠️ **AND TWO DERIVED VERSIONS OF (2) WERE TRIED AND MEASURED AS WRONG, so nobody
spends an afternoon rediscovering them.** "The design system imports a HeroUI
component, so a screen using it directly is a bypass" flagged 3 of 81 and all
three were correct code — D7 deliberately says use the library's components,
themed through tokens, so most of those imports are the pattern rather than a
breach of it. "A surface defines a component the design system exports" flagged
3, all false: a *screen* called `Money` is not the `Money` component. Reinvention
is a semantic fact, and the shapes that would catch it also catch the code that
is right.

---

## 4. How to add a rule so it stays in force

1. **Write it in the kernel as a `refuse*`** returning what is wrong, never
   throwing. That is what makes it enumerable, which is what makes §2's table
   possible at all.
2. **Call it from a lane a request goes through** — composition, the runtime, a
   surface, or a guard. If the capability does not exist yet, put a
   `DEFER(engine-N)` marker on the declaration and add the stage to PROGRESS.md.
3. **Give the reference app an instance.** `refusePolicy`'s sharpest branch —
   an `action` notification may not be silenced — had no instance in `hello`, so
   no test could reach it and the branch was unexercised for as long as it
   existed. Anything absent from the reference app is absent from every app
   copied out of it.
4. **Add a guard entry** naming the decision it protects and, in `fails`, the
   consequence in the world.
5. **Mutation-test it.** Break the thing, watch it fire, restore. Every guard in
   this tree has been through this, and it has never once been ceremony: the
   `rules` guard passed two mutations that deleted the only caller of a rule,
   because the explaining comment beside the call kept the identifier in the
   file. A file that argues for a rule at length is exactly the file most likely
   to have stopped calling it.

---

## 5. What is deliberately not guarded

Judgement. Whether a screen is doing two jobs, whether the reader would have
looked here, whether a number is the right number. DESIGN.md §3 and §7 are the
list, and they stay judgement — with one correction worth stating, because it
was got wrong:

⚠️ **The parts of a judgement rule that are mechanical must not shelter behind
the parts that are not.** §3 is judgement about screens somebody writes. It is
not judgement about the settings screen, which nobody writes — that one is
generated from declarations, so "one page, one thing" is a property of the
generator and is now `descend`. For months §3 was cited as the reason the
settings surface was fine, while that surface was a single column of every row an
app declared.
