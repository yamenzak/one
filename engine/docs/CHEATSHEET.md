# What OneEngine gives you

kind: guide

**Everything the engine already does, on one page, so you do not build it
again.** Every table below is generated from the source; nothing here is typed
by hand, because a list that is mostly right is one somebody trusts about the
part that is not.

⚠️ **THIS IS THE ANSWER TO "DOES THIS ALREADY EXIST".** It is the one thing that
actually prevents reinvention — [ENFORCEMENT.md](ENFORCEMENT.md) §3a measured
the alternatives and both failed: "a screen imports a HeroUI component, so it is
a bypass" flagged three files and all three were correct code, and "a surface
defines a name the design system exports" flagged three and all three were false.
Reinvention is a semantic fact. What works is a current index, read before
starting.

⚠️ **AND IT IS THREE QUESTIONS, NOT ONE.** What an app **declares**, what the
platform **does** with that, and what a screen **draws**. Reaching past any of
the three is the same mistake: a concern that becomes something a handler calls
is a concern a handler can forget, and a forgotten one is invisible — no error,
no failing test, a capability that silently does not apply (D12).

- **Declaring** → §1, and the whole surface is `AppSpec` in `kernel/src/manifest.ts`
- **Serving** → §2, and nothing above the runtime may touch a binding
- **Drawing** → [../design/README.md](../design/README.md), which is the same
  index for `@engine/design` and is where a screen starts

---

## 1. What an app declares — `@engine/kernel`

An app is one literal. Every field on it produces surfaces nobody writes: the
settings screens, the policy screen, the flag console, the plan shelf, the
consent sheet, the record of processing, the job console, the help centre and
the onboarding checklist all exist as a consequence of a declaration.

**So the first question is never "how do I build this" — it is "which field is
it".** If the answer is none, that is a change to `AppSpec`, in review, and not
a call site over in a product.

<!-- generated: node scripts/inventory.mjs declares -->
| Module | What it is for | Ships | Waiting |
|---|---|---|---|
| `primitives` | ids, days, instants, slugs — the words everything else is spelled in | 10 | 2 |
| `field` | what a value is: its kind, its bounds, what it holds, whether it is the app's to keep | 8 | — |
| `collection` | what a thing an app keeps is — and the six operations it gets for free | 13 | — |
| `operation` | one declaration carrying every cross-cutting concern (D12) | 10 | 1 |
| `access` | permissions, roles, and what an app may never claim | 15 | 1 |
| `gate` | the eight gates, in the order that decides which sentence somebody reads first | 3 | 1 |
| `manifest` | the whole app, and the composition that refuses a broken one | 8 | — |
| `entitlement` | what a plan includes, and the allowance algebra over it | 7 | 1 |
| `credit` | metered work: the reserve, the rate, the ceiling | 7 | 1 |
| `dunning` | the ladder from past due to erased | 5 | — |
| `package` | a priced bundle of timed grants | 8 | 1 |
| `tenancy` | workspaces, kinds, shards, placement, standing | 14 | 3 |
| `door` | the five doors, and which host is which | 2 | 1 |
| `setting` | a switch a workspace owns, and the page it lives on | 10 | 1 |
| `flag` | a switch WE own, with a date it stops being one | 7 | — |
| `notify` | what somebody is told, through which channel, and who may narrow it | 12 | 1 |
| `problem` | the one refusal shape, and the platform's own catalogue | 6 | — |
| `tone` | the voice — the rules a written string has to pass | 2 | 1 |
| `vault` | the facts that are not an app's to keep (D11) | 8 | — |
| `legal` | documents, purposes, sub-processors, the record of processing | 5 | 1 |
| `guide` | help, onboarding, the milestones a workspace passes | 5 | — |
| `job` | scheduled work, and the record that it ran | 5 | — |
| `brand` | which surfaces a workspace may put its own mark on | 10 | 1 |
| `ai` | a generating action: its lane, its prompt, its ceiling | 11 | 1 |
| `mcp` | an operation projected as a tool an agent may call | 3 | — |
| `signin` | the shape of a sign-in code — the four facts the server and the page must agree on | 4 | — |

**198 of them**, 180 reached by something today.
Read the file for why each exists; every one is `import { … } from "@engine/kernel"`.
<!-- /generated -->

⚠️ **"Waiting" is not a gap in the table — it is the honest column.** A
capability nothing reaches yet carries a `DEFER(engine-N)` marker naming the
stage that wires it, and `scripts/capability.test.mjs` fails on one that does
not. It is a schedule, not a waiver: the number can only go down without a
stage moving, and a marker naming a stage PROGRESS.md does not carry is itself a
failure.

---

## 2. What the platform does — `@engine/runtime`

⚠️ **THE ONLY CODE THAT TOUCHES A BINDING.** Everything above this layer is pure
and everything below it is a database — which is what makes the kernel's rules
provable with no fixture, and why a screen or an app reaching for a binding is a
layering failure rather than a shortcut. A guard says so.

<!-- generated: node scripts/inventory.mjs does -->
| Module | What it is for | Ships | Waiting |
|---|---|---|---|
| `schema` | the composed schema runner — declarations become tables | 6 | — |
| `sql` | the one typed seam onto D1 | 4 | — |
| `directory` | accounts, workspaces, placement, enablement, allowances | 25 | 4 |
| `handles` | which binding holds which shard | 3 | — |
| `locate` | who is asking, where they are, and what they hold | 2 | — |
| `identity` | sign-in codes, sessions, tokens, proof | 21 | 2 |
| `membership` | the roster and what each member may do | 12 | — |
| `compose` | a manifest becomes a live surface of operations | 3 | 1 |
| `serve` | the one path every request ends in — both doors | 3 | — |
| `records` | the generated reads and writes behind a collection | 6 | — |
| `settings` | reading and writing a workspace's own switches | 4 | — |
| `billing` | plans, subscriptions, the bill, the ladder | 10 | 4 |
| `credits` | the balance, and reserve → settle → release | 7 | 3 |
| `packages` | granting, revoking and expiring a bought bundle | 8 | — |
| `inbox` | notifications: the policy, the audience, the read | 10 | — |
| `services` | the lane out to a provider — AI and mail | 5 | 2 |
| `vault` | encrypted facts, consent, grants, and who looked | 13 | — |
| `audit` | what happened, and the replay that stops it happening twice | 7 | — |
| `jobs` | the scheduler and the record that it ran | 6 | 1 |
| `branding` | a workspace's own theme and marks | 4 | — |
| `ai-actions` | which model an action runs on, and in whose words | 7 | — |
| `operator` | the deployment looking at itself | 6 | — |
| `deployment` | what is wrong with this deployment, asked at boot | 1 | — |
| `mcp` | the agent door | 1 | — |
| `member-ops` | the roster's own operations | 1 | — |
| `money-ops` | the bill and the balance, as a read | 1 | — |
| `centre-ops` | the one bootstrap read the tenant door stands on | 1 | — |
| `personal` | the operations about yourself, on every door | 2 | — |
| `installable` | the manifest and the icon a workspace is installed as | 3 | — |
| `platform-schema` | the platform's own tables, in dependency order, listed once | 2 | — |
| `dispatch` | an event an operation raises becomes a note in somebody's inbox | 1 | — |
| `sweep` | the daily clock: erase what is past the ladder's last rung | 3 | — |
| `vault-ops` | consent, grants, who looked, the processing record, export and erasure | 1 | — |
| `dossier` | everything we hold about one person, and everything of theirs we delete | 8 | — |
| `legal` | who agreed to what version, and the wall until they have | 6 | — |

**203 of them**, 186 reached by something today.
Read the file for why each exists; every one is `import { … } from "@engine/runtime"`.
<!-- /generated -->

---

## 3. What is already refused for you

You do not have to remember these. They are asked before an app boots, or while
the request is being served, and each one names the failure it exists to catch.

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
| `unrecordedWrites` | `operation` | composition |
| `refusePackage` | `package` | runtime |
| `unknownProblems` | `problem` | composition |
| `refuseSetting` | `setting` | composition |
| `refuseSettings` | `setting` | composition |
| `unread` | `setting` | deferred to stage 33 |
| `refuseCommercial` | `tenancy` | runtime |
| `refusePlacement` | `tenancy` | runtime |
| `refuseCopy` | `tone` | guard |
| `refuseRead` | `vault` | runtime |
| `refuseVault` | `vault` | composition |
| `strayFacts` | `vault` | composition |
<!-- /generated -->

The full argument, the three states a rule can be in, and what is deliberately
left to judgement: [ENFORCEMENT.md](ENFORCEMENT.md).

---

## 4. Where to start

| You are about to… | Read |
|---|---|
| build a screen | [../design/README.md](../design/README.md), then [../design/DESIGN.md](../design/DESIGN.md) |
| add a capability to an app | §1 above, then `apps/hello/src/index.ts` — the reference app is the template |
| add something to the platform | [ENFORCEMENT.md](ENFORCEMENT.md) §4, which is how to add a rule so it stays in force |
| understand a decision | [DECISIONS.md](DECISIONS.md) |
| find out what is not built | [PROGRESS.md](PROGRESS.md) |

⚠️ **The reference app is the template, and that is load-bearing.** Anything
absent from `apps/hello` is absent from every app copied out of it — which is
how the entire custody half of the framework came to have no instance anywhere:
no vault field, no purpose, no sub-processor, so nothing that used them could be
exercised by any test. Adding a capability means adding an instance there too.
