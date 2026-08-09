---
kind: contract
verified: 2026-08-09
---

# How we write on ONE

> Governs **`platform/**` only**, and absolutely. Enforced by
> `platform/scripts/docs.test.mjs` in `pnpm gate`.
>
> ⚠️ **The legacy tree is not governed and will not be.** `apps/*`,
> `packages/@4dl/*`, `KOVA.md`, `docs/help/**` and the rest are scheduled for
> deletion at stage 9. Grandfathering them would mean maintaining an exemption
> list for files we intend to delete, and an exemption list is a promise to fix
> something. We are not going to fix them; we are going to delete them.

---

## 0. Why this exists at all

A standard enforced by convention rots exactly like the documents it governs.
Every rule below is either checked by a script or is explicitly marked as a
review convention — there is no third category.

**The ranking that is the whole standard.** Prefer, in descending order of
resistance to rot:

| | mechanism | how it rots |
|---|---|---|
| 1 | **a test** | loudly — the build goes red |
| 2 | **a guard script** | loudly |
| 3 | **a comment beside the code** | it is deleted *with* the code |
| 4 | **a generated block** | it cannot — it is verified against its command |
| 5 | **hand-written prose** | ⚠️ silently, and this is the only kind that does |

When about to write a paragraph, ask which of the five you are reaching for and
whether you could move one row up.

---

## 1. ⚠️ Write the invariant, never the incident

**This is the most important rule here, and the easiest to break while feeling
diligent.**

A comment explains the code **as it is**. It does not narrate how it got there.

```ts
// ✅ THE INVARIANT — true forever, independent of history
// `settle` caps the charge at the reserve, so the reserve is a CEILING ON
// REVENUE rather than an estimate: every token it fails to count is a token
// the platform pays for and the tenant does not.

// ❌ THE INCIDENT — describes a codebase that will not exist
// Scena's old copy under-counted four ways: the run asked Gemini for 32,768
// output tokens while the reserve budgeted 8,000, the system prompt was a flat
// +200 pad, the ratio was 4 chars per token, and nothing widened for thinking.
```

Both feel like careful documentation. Only the first is still true after the
thing it describes is deleted. The second becomes a live-sounding warning about
a problem that can no longer occur, written in the voice of someone who knows
something you do not — which is worse than no comment, because it is
*expensive* to disprove.

**If a past defect is genuinely worth preventing, that is a test.** Level 1 of
the ranking, not level 5. Name the test after the property, not after the bug:
`the reserve covers the run` rather than `regression: scena under-reserved`.

**Where history goes:** git, and `record` documents with dates. Not code.

⚠️ **Including during the migration.** While `apps/*` still ships, it will be
tempting to write "this differs from Kova's old shape" in platform code. Do not.
Platform code describes platform behaviour, full stop; migration notes belong in
the migration's own `record` document, which is deleted with the migration.

*Enforced by review, not by script — no regex can tell an invariant from an
anecdote. But this document is the thing to point at.*

---

## 2. The one rule for documents

> **A document may hold intentions and invariants. It may not hold state.
> State is derived.**

Every document declares its kind in front matter. **No exemptions, no
grandfathering** — this tree starts clean and stays clean.

```md
---
kind: contract | plan | record | index | guide
verified: 2026-08-09        # required for `contract`
superseded_by: path.md      # optional; marks a document as history
---
```

| kind | holds | rule |
|---|---|---|
| `contract` | invariants, rationale | ⚠️ if it describes ONE file, it belongs in that file's header instead |
| `plan` | intentions with open items | every open item is a `DEFER` marker (§3). No open DEFERs ⇒ becomes a `record` or is deleted |
| `record` | what happened and why, dated | past tense. **Never** describes current state |
| `index` | inventories, maps, counts | ⚠️ **generated** (§5). Never hand-written |
| `guide` | user-facing help | §6 |

**No orphans.** A document nothing links to is a document nobody maintains. The
generated index deliberately does **not** count as a link — an index that lists
everything would make nothing an orphan, and the question worth asking is
whether a person thought a document was worth pointing at.

---

## 3. ⚠️ A deferral is a marker, never a sentence

**The rule that answers context compression.** A marker lives in the repository
and is *found* by a script. It does not need to be remembered, which is the only
property that survives a compressed conversation.

You may not write "later", "for now", "in stage 4", or "TODO" in prose. Write,
in a comment — markdown or code alike:

```
<!-- DEFER(one-142) stage:4 — grouped rows in the collection view. Blocks: the plan-editor week view. -->
```
```ts
// DEFER(one-143) stage:5 — metering for package entitlements.
```

Code is where most of them belong: a gap in `collection()` is a fact about
`collection.ts`, and a marker there is deleted by whoever fills the gap.

The guard fails on: no id, a duplicate id, no description, an unknown stage —
and ⚠️ **a stage whose status is `shipped`**. That last one is the mechanism.
Flipping a stage to shipped is what forces every deferral pointing at it to be
done, re-targeted with a stated reason, or dropped on purpose. **A stage is not
finished when the code works; it is finished when it owes nothing.**

`platform/docs/DEFERRED.md` is generated from every marker in the tree.

---

## 3a. ⚠️ A claim of enforcement is a registry entry, never a sentence

**The same rule as §3, aimed at the other thing prose gets away with.** A
deferral is work somebody said they would do; a *guard* is work somebody says is
already done. The second is worse when it is untrue, because a deferral at least
admits to being outstanding.

"Enforced by a lint", "fails the build", "the guard catches this" — each costs
one sentence, reads as safety, and is expensive to disprove. So it survives
review indefinitely, and the platform comes to believe it is stricter than it is.

Every enforcement promise is an entry in [`guards.json`](guards.json):

```json
{ "id": "unknown-not-empty", "group": "interface",
  "fails": "a data container whose pending and empty states resolve to the same render",
  "stage": "4", "status": "owed" }
```

The guard over the registry (`scripts/guards.test.mjs`) fails on:

- a **`live`** entry whose `proves` string no longer appears in its `impl` — ⚠️
  **a guard dies by rename, not by deletion.** Nobody removes a check on
  purpose; a refactor renames the assertion and the registry goes on describing
  enforcement that left.
- a **`live`** entry no script invokes. A check nobody calls is a green line
  produced by nothing.
- an **`owed`** entry naming a stage that is `shipped` — §3's mechanism, applied
  to enforcement. **A stage is not finished when its code works; it is finished
  when it owes nothing**, and the guards it promised are exactly what gets
  dropped while a stage is being closed.

**And the tables in the documents are GENERATED from it** (§5), so a document
cannot name a guard with no entry. That is what makes this a mechanism rather
than another convention: the prose does not write itself.

---

## 4. A number in prose carries the command that produced it

Not `2,468 passing` but ``2,468 passing (`pnpm one:test`, 2026-08-09)``. The
reader learns both that it is a snapshot and how to re-check it.

Better: do not put the number in prose. Put it in a generated block, or leave it
out. **Settle it with the command, not with a sentence.**

---

## 5. Generated blocks are verified, not trusted

```md
<!-- generated: node platform/scripts/manifest.mjs surfaces -->
…
<!-- /generated -->
```

The guard re-runs the command and fails on any difference, so **a hand-edited
inventory is a build failure** rather than a quiet lie. The command must be fast
(it runs in `pnpm gate`) and deterministic (no timestamps, no network).

Under ONE this deletes the largest rot source the legacy tree has: hand-written
screen indexes mapping surfaces to `file:line`, which rot on *any* edit above the
line. The manifest declares nav; the index is generated from it.

---

## 6. Help — written with the code, generated where it can be

Help is **product** documentation. It rots when the product changes, which is
why it is authored in the same change as the behaviour it describes, never
afterwards.

**Structure: a generated frame plus written intent.**

- **Generated** — what the manifest already knows: which screens exist, what
  fields a collection has, which permission an action needs, what a plan
  includes. Emitted into a verified block, so it cannot disagree with the app.
- **Written** — *why* somebody would do this, and what to watch out for. A
  person writes this; nothing can derive it.

**Enforced limits, because walls of text are the failure mode:**

| rule | limit |
|---|---|
| one article = one task a person is trying to do | — |
| `summary` stands alone and is the search result | ≤ 160 chars |
| written body | ≤ 400 words |
| an article names a surface the manifest declares | link-checked |
| no developer vocabulary — no file paths, no type names, no PR numbers | token list |

### Screenshots: yes — by **id**, never by path

```md
<!-- shot: clients.list -->
```

⚠️ **A pasted screenshot is prose at level 5, and worse than text**, because a
stale image looks authoritative and nobody re-reads it critically. A shot id
resolves to an image the Playwright suite produces, so it is regenerated when the
UI changes.

- The guard fails on a shot id the suite does not produce.
- Before the UI exists, an id may be declared with nothing behind it: the guard
  **warns** and lists it. That is the placeholder — a declared intent, tracked,
  not an empty `![]()` nobody notices.
- The same images serve the marketing site, the help centre and the design
  review. Using one set is what keeps them honest.

---

## 7. Release notes are user-facing, structured, and written with the change

⚠️ **A release note is not a commit message and must never read like one.** The
reader is a person using the product who wants to know what is different today.

**Written in the same change that causes it**, as a small file — never
reconstructed at release time from a commit log, which is exactly how a
changelog becomes a wall of text nobody reads.

```ts
// platform/kova/changes/2026-08-09-week-view.ts
export default note({
  kind: "added",                       // added | changed | fixed
  summary: "Plans can now be viewed a week at a time.",   // ≤ 120 chars
  help: "plans.week-view",             // cross-link, do not inline the detail
  shot: "plans.week",                  // optional
});
```

- **Cross-link, never inline.** One line of what changed; the help article
  carries the depth. This is what keeps release notes short by construction.
- **Banned tokens** (enforced): file paths, `refactor`, `bump`, `dependency`,
  type and function names, PR numbers, internal ids.
- Notes aggregate into a version at release. Nobody writes the changelog; it is
  assembled.

**Two version streams, and they are for different readers.**

| | who sees it | shape |
|---|---|---|
| **app version** | the tenant, in-app and in the notes | `major.minor` — the product changed |
| **platform version** | operators, in the console and About | `major.minor` — capability changed under every app |

A tenant reads their app's version. The platform version answers "which
generation of the shared capability is this app on", which matters when three
apps are on three different ones.

**Stored structured, rendered as markdown.** Structured so it can be filtered by
version, rendered in-app, diffed and eventually translated; markdown is the
*rendering*, not the storage. Hand-written changelog markdown is level 5 and
rots the moment a release is cut from it.

---

## 8. Tests: exhaustive in the platform, proportionate in an app

⚠️ **The failure to avoid is ten apps and a twenty-minute wait for a one-line
change.** The way out is not fewer tests; it is putting them where they are
paid for once.

**The principle: what is DECLARED does not need to be tested per app.** A
manifest is checked statically in milliseconds. An app should only test what is
genuinely its own.

| layer | coverage | runs when |
|---|---|---|
| platform kernel / data / surface / renderer | exhaustive — unit, integration, conformance | the platform changes |
| a manifest's validity | `one lint`, static, milliseconds | every app change |
| an app's own domain logic (pure) | unit, TDD | that app changes |
| an app's canvas screens | a **few** golden-path E2E specs | that app changes |
| cross-app | one smoke suite | platform change, and nightly |

⚠️ **An app is not test-free, and "the platform is safe" does not cover
composition.** Kova's E2E caught a 403 on the client persona's first write —
right pieces, wrong wiring — which its 632 integration tests structurally could
not see. Golden paths stay. Three specs is the right order of magnitude, not
thirty.

**The budget is enforced, not hoped for.**

- An app's own suite must complete in **under 60 seconds**. The guard records
  each suite's duration and fails when one crosses the cap, so the fixture
  problem gets solved rather than tolerated.
- ⚠️ The known cause, measured on the legacy tree: `@kova/api`'s 632 tests each
  provision a world through a real OTP sign-in — about 2.5 minutes. One shared
  provisioned fixture with per-test scoping is the fix, and it is a platform
  facility so every app inherits it.
- `pnpm one:test` runs the platform only. An app change never waits on another
  app, and turbo's cache already makes an unchanged package free.

---

## 9. ⚠️ Resuming — what to read when the conversation is gone

A long build outlives any single working session. Whoever picks this up next —
a person returning after a fortnight, or an assistant whose context was
compressed — starts from the repository, never from recall.

**That is not a hope, it is the design.** §3's whole argument is that a marker
lives in the repository and is *found* by a script, because being found is the
only property that survives a conversation ending. The same reasoning applies to
everything else here.

**The checklist, in order. Six minutes.**

1. **`platform/docs/README.md`** — generated. Which stage is active, what is
   deferred, every governed document by kind. Start here because it cannot be
   stale.
2. **`platform/docs/DEFERRED.md`** — generated. Everything outstanding, grouped
   by the stage that owes it. Nothing here was remembered; it was found.
   `node platform/scripts/guards.mjs list` is the same question about
   *enforcement*: what is guarded today, and which stage owes the rest.
3. **`PLAN.md` §2** — the four decisions and the consequence of each. Read
   before questioning one: they were argued, and §2.3 in particular records a
   risk that was accepted knowingly rather than missed.
4. **`STANDARDS.md` §1** — write the invariant, never the incident. The rule
   most easily broken while feeling diligent.
5. **`platform/kernel/test/FINDINGS.md`** — what did not fit, per stage. The
   record of what was learned the expensive way.
6. **`pnpm one:test && pnpm one:gate`** — under a second and a few seconds. Green
   means the ground is solid; red means read the failure before reading anything
   else.

Then `git log --oneline -20`. The commit messages in this repository carry the
reasoning, deliberately — they are the one record that cannot drift from the
change it describes.

⚠️ **What compression genuinely costs, stated plainly:** not the decisions, which
are all written above, but the *texture* — why a sentence was phrased one way, or
a half-formed idea that had not earned a commit yet. The mitigation is not better
recall. It is that anything worth keeping gets committed before it is needed
again, which is the discipline this whole document exists to impose.

## What is deliberately NOT enforced

- **Prose quality, length or tone in `contract` documents.** These are dense and
  argumentative on purpose.
- **Whether a contract is true.** No script can check an invariant. Tests do
  that; documents explain why somebody bothered.
- **§1, invariant-vs-incident.** No regex distinguishes them. It is a review
  rule, and this section is what a reviewer points at.
