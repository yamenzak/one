---
kind: contract
verified: 2026-08-09
---

# The documentation standard

> Enforced by `scripts/docs.test.mjs` in `pnpm gate`. A standard that is not
> enforced rots exactly like the documents it governs — that is the entire
> lesson this file exists to encode.

## The problem, measured

This repository holds **44 markdown files and 18,105 lines of prose**, and at
least six of them carry a standing instruction to *"update this in the same
commit"*. That instruction is the failure, not the fix. This is a codebase whose
own guards exist because **wiring that must be remembered is wiring that will be
forgotten** — and 18,000 lines maintained by remembering is the largest instance
of that pattern in the repo.

Two failure modes, both already observed here:

**Deferral evaporation.** Work begins on a stage, something is deferred to a
later one, and the deferral is written as a sentence in a document. Then the
conversation's context is compressed. The sentence survives; the intent does
not. Either the work is done and the sentence is left claiming it is pending, or
the sentence is never read again and the work never happens. Nothing fails.

**Accumulation.** Documents pile up and nobody can tell which are current.
`AUDIT.md`, `BILLING-PLAN.md`, `DESIGN.md`, `NOTIFICATIONS-PLAN.md` and `SPEC.md`
all lived at the repository root, went stale, and were eventually deleted by
hand — which worked only because a person noticed. `docs/PLATFORM-GAPS.md` is
467 lines describing work that is entirely finished, and the only thing marking
it as history is one sentence in another file.

---

## The ranking that is the whole standard in one idea

Prefer, in descending order of resistance to rot:

| | mechanism | how it rots |
|---|---|---|
| 1 | **a test** | loudly — the build goes red |
| 2 | **a guard script** | loudly |
| 3 | **a comment beside the code** | it is deleted *with* the code |
| 4 | **a generated document section** | it cannot — it is verified against its command |
| 5 | **hand-written prose** | ⚠️ silently, and this is the only kind that does |

**Every rule below is an application of that ranking.** When you are about to
write a paragraph, ask which of the five you are reaching for and whether you
could move one row up.

⚠️ **The clearest example in this repo is level 3.** When `syncCatalog` was
deleted from `apps/scena/src/stripe.ts`, the sixty lines of comment explaining
its behaviour went with it, in the same diff, because they lived in the same
file. A standalone document describing the same function would still be here,
still confident, and wrong.

---

## The one rule

> **A document may hold intentions and invariants. It may not hold state.
> State is derived.**

- **Invariant** — "reads are never gated at any rung, because withholding the
  product is not the same as holding a client's logbook hostage over a bill they
  did not incur." Does not rot. Highest-value content in the repo.
- **Intention** — "the dunning ladder moves onto `DUNNING_DAYS` in stage 3."
  Rots when done or abandoned, which is why §2 makes it a marker rather than a
  sentence.
- **State** — "Scena has 282 tests", "all four workers bind real ids",
  "`BILLING_SCHEMA` is deliberately absent". ⚠️ **Rots the moment it is written.**
  CLAUDE.md already contains the correct instinct — *"Settle it with the command,
  not with this sentence"* — and then quotes thirty-one per-package figures
  anyway. Derive it or delete it.

---

## 1. Every document declares its kind

YAML front matter, first thing in the file:

```md
---
kind: contract | plan | record | index
verified: 2026-08-09        # required for `contract`, optional elsewhere
superseded_by: docs/X.md    # optional; makes a document read-only history
---
```

| kind | holds | rule |
|---|---|---|
| `contract` | invariants, rationale, "why it must be this way" | ⚠️ if it describes ONE file, it belongs in that file's header instead. Documents carry only cross-cutting contracts. |
| `plan` | intentions, with open items | every open item is a `DEFER` marker (§2). A plan with no open DEFERs must become a `record` or be deleted. |
| `record` | what happened and why, dated | past tense about a decision. **Never** describes current state. |
| `index` | inventories, maps, counts | ⚠️ **generated** (§3). Never hand-written. |

**No orphans.** Every document must be reachable from `docs/README.md` or from a
root-level document. A file nobody links is a file nobody maintains, and the
guard fails on it — which is how five root-level plans came to be deleted by
hand instead of by a rule.

---

## 2. ⚠️ A deferral is a marker, never a sentence

**This is the rule that answers context compression.** A marker lives in the
repository and is found by a script on every run. It does not need to be
remembered, which is the only property that survives a compressed conversation.

You may not write "later", "in stage 4", "for now", or "TODO" in prose. Write:

```
<!-- DEFER(one-142) stage:4 — grouped rows in the collection view. Blocks: Kova's plan-editor week view. -->
```

and in TypeScript, where most of them belong:

```ts
// DEFER(one-143) stage:5 — metering for B2C package entitlements.
```

The guard fails when a marker:

- has no id, or a duplicate id
- names a stage absent from `docs/stages.json`
- ⚠️ **names a stage whose status is `shipped`** — this is the mechanism. A
  stage cannot be marked shipped while anything still defers to it, so closing a
  stage forces every deferral to be done, re-targeted with a reason, or dropped
  on purpose.
- carries no description

`docs/DEFERRED.md` is generated from every marker in the repository. It is the
one place to look for "what is still outstanding", and it cannot drift, because
nothing writes it by hand.

**Stage exit criterion:** a stage is not done when the code works. It is done
when `docs/stages.json` can be set to `shipped` without the guard failing.

---

## 3. Generated blocks are verified, not trusted

```md
<!-- generated: node scripts/apps.mjs table -->
| app | dir | deploys |
|---|---|---|
| kova | apps/api | yes |
<!-- /generated -->
```

The guard re-runs the command and fails if the block differs. **A hand-edited
fact becomes a build failure**, which is the only way an inventory stays true.

Two constraints: the command must be **fast** (it runs in `pnpm gate`) and
**deterministic** (no timestamps, no network). Anything requiring a full test run
is not a generated block — it is a number that should not be in a document at
all.

**What this deletes.** The screen indexes in `KOVA.md` Part III and `SCENA.md`
Part III are hand-maintained maps of surface → `file:line`, and `file:line`
references rot on *any* edit above the line. Under ONE they are generated from
the manifest's nav declaration. That is the single largest rot source in the
repo, removed rather than policed.

---

## 4. A number in prose carries the command that produced it

Not `2,468 passing` but ``2,468 passing (`pnpm turbo run test`, 2026-08-09)``.

The reader then knows both that it is a snapshot and how to re-check it, and the
`verified:` date makes staleness visible. The guard warns — does not fail — when
a `contract` document's `verified:` date is more than 90 days old.

⚠️ **Warn, not fail, and deliberately so.** A guard that fails the build over a
date teaches people to bump the date. One that prints a list of stale documents
gives a reviewer something to act on.

---

## 5. A document dies with its subject

When code is deleted, the prose describing it is deleted in the same commit.
Level 3 of the ranking gives this for free; a standalone document does not, which
is the strongest argument for keeping prose beside code.

When a `plan` completes, it becomes a `record` — front matter changed, tense
changed, `superseded_by` set if something replaced it — or it is deleted and
lives in git history. It does not sit at 467 lines of finished work with its
status recorded somewhere else.

---

## What this looks like in practice, during ONE

- Stage 1 hits something that needs the renderer. **Do not** write "we will come
  back to this in stage 4" in `ONE-PLATFORM.md`. Write a `DEFER(one-NNN)
  stage:4` marker in the file where the gap is, one line, naming what it blocks.
- Stage 4 begins. `docs/DEFERRED.md` — generated — lists everything that named
  it. Nothing was remembered; it was found.
- Stage 4 ends. `docs/stages.json` flips to `shipped`. If any marker still names
  stage 4, **the guard fails**, and the choice is explicit: do it, re-target it
  with a reason, or delete it deliberately.
- Kova's migration begins. Its screen index is generated from the manifest, so it
  cannot disagree with the app. The prose that survives is the prose that says
  *why* — which is the prose worth having.

---

## What is deliberately NOT enforced

- **Prose quality, length, or tone.** This repo's documents are dense and
  argumentative on purpose; a linter measuring readability would fight that.
- **That a contract is correct.** No script can check whether an invariant is
  true. Tests do that; documents explain why somebody bothered.
- **The `record` tense rule.** Checkable only by heuristic, and a heuristic that
  fires on "is" would be unusable. It stays a review convention.
