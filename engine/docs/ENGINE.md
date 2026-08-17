# OneEngine

kind: guide

**Everything the engine already does, on one page, derived from the engine.**
Every table below is generated — from the composer that actually mounts the
operations, from the ledger both erasure walks read, from the guard registry, and
from the source itself. Nothing here is typed by hand, because a list that is
mostly right is one somebody trusts about the part that is not.

⚠️ **THIS IS THE ANSWER TO "DOES THIS ALREADY EXIST", AND IT IS THE ONLY THING
THAT PREVENTS REINVENTION.** The derived alternatives were tried and both failed:
"a screen imports a HeroUI component, so it is a bypass" flagged three files and
all three were correct code; "a surface defines a name the design system exports"
flagged three and all three were false. Reinvention is a semantic fact. What works
is a current index, read before starting.

⚠️ **AND IT ANSWERS THREE QUESTIONS, NOT ONE.** What an app **declares**, what the
platform **does** with that, and what a screen **draws**. Reaching past any of the
three is the same mistake: a concern that becomes something a handler calls is a
concern a handler can forget, and a forgotten one is invisible — no error, no
failing test, a capability that silently does not apply (D12).

| | |
|---|---|
| **This file** | what exists, and whether it is reachable |
| [BUILDING.md](BUILDING.md) | why it is shaped this way, and how to add to it |
| [DECISIONS.md](DECISIONS.md) | what is forbidden, and why — cited by number from code and guards |
| [../design/README.md](../design/README.md) | what a screen draws, and where a screen starts |

---

## 1. What an app gets for declaring nothing

An `AppSpec` with an id, a name, a mark and one role composes into a live product
with a roster, an inbox, a brand, a catalogue and a bill. None of it is declared;
all of it is refused, gated, audited and erasable on the same terms as everything
an app writes itself.

<!-- generated: node scripts/inventory.mjs surface -->
**24 operations for declaring nothing.** A roster, an inbox and its
two-level policy, the workspace's brand, the package rail it sells with, its
settings, its bill, and the one bootstrap read every screen stands on.

| Operation | | Permission |
|---|---|---|
| `member.list` | read | `member:read` |
| `member.invite` | write | `member:manage` |
| `member.role` | write | `member:manage` |
| `inbox.list` | read | *the session* |
| `inbox.seen` | write | *the session* |
| `inbox.preference` | write | *the session* |
| `inbox.policy` | write | `tenant:manage` |
| `inbox.settings` | read | *the session* |
| `member.remove` | write | `member:manage` |
| `brand.read` | read | `tenant:manage` |
| `brand.write` | write | `tenant:manage` |
| `brand.icon` | write | `tenant:manage` |
| `package.list` | read | `member:read` |
| `package.create` | write | `tenant:manage` |
| `package.archive` | write | `tenant:manage` |
| `package.held` | read | `member:read` |
| `package.grant` | write | `member:manage` |
| `package.revoke` | write | `member:manage` |
| `setting.read` | read | *the session* |
| `ai.wording` | read | *the session* |
| `ai.word` | write | *the session* |
| `setting.write` | write | *the session* |
| `money.view` | read | `billing:read` |
| `centre.view` | read | *the session* |

**+5 per collection**, generated from the declaration —
the scope column is written by the platform, so a subject-scoped collection is
the caller's own records by construction rather than by a `WHERE` somebody
remembered.

| Operation | | Permission |
|---|---|---|
| `thing.list` | read | `thing:read` |
| `thing.read` | read | `thing:read` |
| `thing.create` | write | `thing:write` |
| `thing.update` | write | `thing:write` |
| `thing.delete` | write | `thing:write` |

**+4 the moment one field is a file.** Not before: three
routes about files on a product that holds none answer "no bucket" for ever,
which reads as broken rather than absent.

| Operation | | Permission |
|---|---|---|
| `media.upload` | write | *the session* |
| `media.list` | read | *the session* |
| `media.read` | read | *the session* |
| `media.delete` | write | *the session* |

**+9 the moment one fact is not the app's to keep** (D11) —
consent, grants, who looked, the processing record, export and erasure.

| Operation | | Permission |
|---|---|---|
| `vault.consents` | read | *the session* |
| `vault.processing` | read | *the session* |
| `vault.consent` | write | *the session* |
| `vault.grants` | read | *the session* |
| `vault.grant` | write | *the session* |
| `vault.revoke` | write | *the session* |
| `vault.looks` | read | *the session* |
| `vault.export` | read | *the session* |
| `vault.forget` | write | *the session* |
<!-- /generated -->

⚠️ **A GENERATED OPERATION IS INDISTINGUISHABLE DOWNSTREAM FROM A WRITTEN ONE.**
Same gates, same audit entry, same replay, same tool catalogue. The moment they
carried less, every one of those would need a branch — and a branch is where a
concern goes missing.

---

## 2. Yourself, on every door

The operations that resolve no workspace. Somebody has to be able to act before
they belong to anything: signing in, making a first workspace, seeing which ones
they are in, leaving one, taking a copy, deleting themselves.

<!-- generated: node scripts/inventory.mjs personal -->
| Operation | | Needs | Doors |
|---|---|---|---|
| `me.agreements` | read | session | *every door* |
| `me.accept` | write | session | *every door* |
| `me.code` | write | **nobody** | *every door* |
| `me.session` | write | **nobody** | *every door* |
| `me.signout` | write | session | *every door* |
| `me.who` | read | session | *every door* |
| `me.tenant.create` | write | session | `setup` `account` |
| `me.tenant.commercial` | write | session | `setup` `account` `tenant` |
| `me.leave` | write | session | *every door* |
| `me.export` | read | session | *every door* |
| `me.forget` | write | session + recent proof | *every door* |
| `me.token.create` | write | session | `account` |
| `me.token.list` | read | session | `account` |
| `me.token.revoke` | write | session | `account` |
| `me.push.key` | read | session | `account` `tenant` `setup` |
| `me.push.subscribe` | write | session | `account` `tenant` `setup` |
| `me.push.forget` | write | session | `account` `tenant` `setup` |
<!-- /generated -->

⚠️ **THIS LANE IS OUTSIDE THE STANDING GATE, AND THAT IS THE POINT.** A workspace
in arrears must not be a trap: paying has to be a way out rather than the only
one.

---

## 3. The operator's own

The deployment looking at itself. Two bounds, both per operation: the `admin.`
door, and an address the deployment names. A role could not express it — roles
live inside workspaces and an operator stands outside all of them.

<!-- generated: node scripts/inventory.mjs operator -->
| Operation | |
|---|---|
| `op.tenants` | read |
| `op.tenant.adjust` | write |
| `op.account.commercial` | write |
| `op.flags` | read |
| `op.flag.set` | write |
| `op.ai` | read |
| `op.ai.bind` | write |
| `op.jobs` | read |
| `op.shards` | read |
| `op.shard.dedicate` | write |
| `op.infra` | read |
| `op.infra.apply` | write |
| `op.infra.verify` | read |
| `op.tenant.move` | write |
| `op.moves` | read |
| `op.maintenance` | read |
| `op.maintenance.set` | write |
| `op.push` | read |
| `op.push.generate` | write |
<!-- /generated -->

---

## 4. The doors

The host **is** the tenancy. An unrecognised host is nothing rather than a
default, and a workspace can never hold a label that is infrastructure.

<!-- generated: node scripts/inventory.mjs doors -->
| Host | Door | What answers there |
|---|---|---|
| *the root* | `signpost` | the root itself — a signpost, and no product |
| `id.` | `account` | who you are: your details, your inbox, your data, your tokens |
| `admin.` | `operator` | the deployment looking at itself — and `op.*` answers nowhere else |
| `setup.` | `setup` | the one place a workspace is created |
| `play.` | `device` | a screen with no session — opt-in per deployment, because `play` is a slug |
| `<slug>.` | `tenant` | the product, and OneSpace over it |
| *a custom domain* | `tenant` | the product, and OneSpace over it |
<!-- /generated -->

⚠️ **THE PAGE NEVER CLASSIFIES ITS OWN HOSTNAME.** `/health` reports the door,
because the runtime already decided it with the reserved labels, the one-label
rule and the custom-domain test. A second classifier in the browser is a second
copy of all three, and when they disagree the page offers a control the runtime
refuses.

---

## 5. Every request goes through the same gates, in the same order

Applied by `performOperation` and nowhere else, so both the HTTP door and the
agent door obey them identically.

<!-- generated: node scripts/inventory.mjs gates -->
| | Gate | Asks | |
|---|---|---|---|
| 1 | `accepted` | Has this person agreed to the terms and the privacy notice? | First, and above the bill: until somebody has agreed there is no basis to process anything about them. `beforeAccepting` is the way out — read, agree, export, delete, sign out. |
| 2 | `standing` | Is this workspace paid up? | Reads pass every rung. Withholding a workspace's own records is leverage over an invoice, and leaving is never something an unpaid bill can prevent. |
| 3 | `permission` | May this caller do this here? | Resolved against the roster for the app the operation belongs to — never a flat set, or a role in the second product grants nothing. |
| 4 | `kind` | Is this workspace a business? | Above entitlement, because no plan a personal workspace can buy unlocks a commercial-only capability. Below permission, because a refusal about the workspace tells a stranger it exists. |
| 5 | `proof` | Was it proved recently that this is really them? | Fifteen minutes, for what cannot be undone. A machine token never satisfies it, by design. |
| 6 | `entitlement` | Does the plan include this at all? | A yes/no capability, before any counting. |
| 7 | `flag` | Is this switched on for this deployment? | Ours to turn off, with a date it stops being a switch. |
| 8 | `quota` | Is there room left under the plan's number? | Counted against what is in use, so the sentence says the limit and the count. |
| 9 | `credits` | Is there a balance to reserve against? | The reserve is a ceiling on revenue rather than an estimate — every token an estimate misses is one the platform pays for. |
<!-- /generated -->

---

## 6. What a refusal says

One shape for every failure, carrying a sentence written for the person reading
it. A caller's job is to show it, never to invent one from a status code.

<!-- generated: node scripts/inventory.mjs problems -->
| Code | HTTP | What somebody reads | Retry |
|---|---|---|---|
| `platform.invalid` | 400 | That does not look right | — |
| `platform.unauthorized` | 401 | Sign in to continue | — |
| `platform.forbidden` | 403 | You do not have access to that | — |
| `platform.not_found` | 404 | That is not here | — |
| `platform.conflict` | 409 | Something else changed first | — |
| `platform.maintenance` | 503 | One is being looked after | yes |
| `platform.too_many` | 429 | Too quickly | yes |
| `platform.quota_reached` | 402 | Your plan includes {limit}, and {used} are in use | — |
| `platform.payment_required` | 402 | This needs a plan that includes it | — |
| `platform.commercial_required` | 402 | This is for business workspaces | — |
| `platform.proof_required` | 401 | Confirm it is you | yes |
| `platform.must_accept` | 451 | There is something to agree to first | — |
| `platform.read_only` | 402 | This workspace is read-only | — |
| `platform.no_credits` | 402 | Not enough credits | — |
| `platform.unavailable` | 503 | Something went wrong on our side | yes |
<!-- /generated -->

An app may add its own catalogue; these are the platform's, and a refusal raised
before an app is resolved draws on them.

---

## 7. Where the records are, and what leaving takes with it

<!-- generated: node scripts/inventory.mjs stores -->
**`directory`** — One global database: who exists, where they belong, what the deployment has made for itself.

| Table | In a person's export | When they are forgotten | When the workspace closes |
|---|---|---|---|
| `account` | Your account | `id: delete` | kept |
| `shard` | — *the deployment's placement map* | — | kept |
| `shard_app` | — *the deployment's placement map* | — | kept |
| `tenant` | — *a workspace is a business's record, not a member's* | — | `id: keep` |
| `tenant_app` | — *which products a workspace enabled* | — | `tenant_id: delete` |
| `belongs` | The workspaces you are in | `account_id: delete` | `tenant_id: delete` |
| `invited` | Invitations sent to you | `email: delete` | `tenant_id: delete` |
| `session` | Where you have been signed in | `account_id: delete` | kept |
| `code` | Sign-in codes sent to you | `email: delete` | kept |
| `api_token` | The access tokens you minted | `account_id: delete` | kept |
| `billing_account` | — *a workspace's own account with us* | — | `tenant_id: delete` |
| `subscription` | — *a workspace's own plan* | — | `tenant_id: delete` |
| `credit_ledger` | — *a workspace's own spending* | — | `tenant_id: delete` |
| `tenant_branding` | — *a workspace's own theme* | — | `tenant_id: delete` |
| `tenant_icon` | — *a workspace's own logo* | — | `tenant_id: delete` |
| `push_subscription` | The devices you asked to be notified on | `account_id: delete` | kept |
| `push_key` | — *the deployment's own sending identity* | — | kept |
| `job_run` | — *the deployment's own clock* | — | kept |
| `deployment_flag` | — *the deployment's own switches* | — | kept |
| `maintenance` | — *the deployment's own switches* | — | kept |
| `ai_binding` | — *which model an action runs on* | — | kept |
| `ai_wording` | — *a workspace's own prompt letterheads* | — | `tenant_id: delete` |
| `resource` | — *the databases and buckets the deployment made for itself* | — | kept |
| `move` | — *where a workspace's records were carried from, and what is left to clear* | — | kept |
| `acceptance` | What you agreed to, and when | `account_id: delete` | `tenant_id: delete` |

**`shard`** — One per region. A workspace's own records, and everything scoped to it.

| Table | In a person's export | When they are forgotten | When the workspace closes |
|---|---|---|---|
| `membership` | Your place in each workspace | `account_id: delete` | `tenant_id: delete` |
| `custom_role` | — *a workspace's own roles* | — | `tenant_id: delete` |
| `package` | — *a workspace's own catalogue* | — | `tenant_id: delete` |
| `purchase` | — *a workspace's own sale, named by membership rather than by account* | — | `tenant_id: delete` |
| `setting` | Your own preferences | `account_id: delete` | `tenant_id: delete` |
| `ai_binding` | — *which model an action runs on* | — | kept |
| `ai_wording` | — *a workspace's own prompt letterheads* | — | `tenant_id: delete` |
| `audit` | What you did here | `actor: anonymise` | `tenant_id: delete` |
| `replay` | — *an idempotency key, not a record about anybody* | — | `tenant_id: delete` |
| `inbox` | Your notifications | `account_id: delete` | `tenant_id: delete` |
| `notify_policy` | — *a workspace's own routing* | — | `tenant_id: delete` |
| `notify_preference` | What you asked to be told about | `account_id: delete` | `tenant_id: delete` |
| `vault_subject` | Your vault | `subject_id: delete` | `tenant_id: delete` |
| `vault_fact` | The facts held encrypted for you | `subject_id: delete` | `tenant_id: delete` |
| `vault_consent` | What you consented to | `subject_id: delete` | `tenant_id: delete` |
| `vault_grant` | Who you let read them | `subject_id: delete`<br>`grantee: anonymise` | `tenant_id: delete` |
| `vault_look` | Who looked, and when | `subject_id: delete`<br>`grantee: anonymise` | `tenant_id: delete` |
| `media` | The files you uploaded | `subject_id: delete` | `tenant_id: delete` |

Both walks read one ledger (`HOLDINGS` in `runtime/src/dossier.ts`), and a table
declared by a schema module with no row in it fails `pnpm engine:gate` — which is
the only version of "provably complete" that stays true after the person who
wrote it has moved on.
<!-- /generated -->

---

## 8. What an app declares — `@engine/kernel`

Pure. No I/O, no bindings, no React; every rule in it is provable with no fixture
at all. The whole declaration surface is `AppSpec` in `kernel/src/manifest.ts`,
and a manifest that does not compose refuses to boot.

<!-- generated: node scripts/inventory.mjs declares -->
| Module | What it is for | Ships | Waiting |
|---|---|---|---|
| `primitives` | ids, days, instants, slugs — the words everything else is spelled in | 10 | 2 |
| `infra` | what a product needs underneath it, and what each kind can promise | 10 | — |
| `field` | what a value is: its kind, its bounds, what it holds, whether it is the app's to keep | 8 | — |
| `collection` | what a thing an app keeps is — and the six operations it gets for free | 13 | — |
| `operation` | one declaration carrying every cross-cutting concern (D12) | 10 | 1 |
| `access` | permissions, roles, and what an app may never claim | 15 | 1 |
| `gate` | the eight gates, in the order that decides which sentence somebody reads first | 3 | 1 |
| `manifest` | the whole app, and the composition that refuses a broken one | 9 | — |
| `entitlement` | what a plan includes, and the allowance algebra over it | 7 | 1 |
| `credit` | metered work: the reserve, the rate, the ceiling | 7 | 1 |
| `dunning` | the ladder from past due to erased | 5 | — |
| `package` | a priced bundle of timed grants | 8 | 1 |
| `tenancy` | workspaces, kinds, shards, placement, standing | 14 | 3 |
| `door` | the five doors, and which host is which | 3 | 1 |
| `setting` | a switch a workspace owns, and the page it lives on | 10 | 1 |
| `flag` | a switch WE own, with a date it stops being one | 7 | — |
| `notify` | what somebody is told, through which channel, and who may narrow it | 12 | 1 |
| `problem` | the one refusal shape, and the platform's own catalogue | 6 | — |
| `tone` | the voice — the rules a written string has to pass | 2 | 1 |
| `vault` | the facts that are not an app's to keep (D11) | 8 | — |
| `legal` | documents, purposes, sub-processors, the record of processing | 5 | — |
| `guide` | help, onboarding, the milestones a workspace passes | 5 | — |
| `job` | scheduled work, and the record that it ran | 5 | — |
| `brand` | which surfaces a workspace may put its own mark on | 10 | 1 |
| `mark` | the logo as geometry, so the browser and the Worker draw one shape | 6 | — |
| `ai` | a generating action: its lane, its prompt, its ceiling | 11 | 1 |
| `mcp` | an operation projected as a tool an agent may call | 3 | — |
| `signin` | the shape of a sign-in code — the four facts the server and the page must agree on | 4 | — |

**216 of them**, 199 reached by something today.
Read the file for why each exists; every one is `import { … } from "@engine/kernel"`.
<!-- /generated -->

---

## 9. What the platform does — `@engine/runtime`

The only code that touches a binding. A handler is given its own workspace's
database, who is asking, the time and a way to refuse — never the request, the
env or a binding.

<!-- generated: node scripts/inventory.mjs does -->
| Module | What it is for | Ships | Waiting |
|---|---|---|---|
| `schema` | the composed schema runner — declarations become tables | 7 | — |
| `sql` | the one typed seam onto D1 | 4 | — |
| `directory` | accounts, workspaces, placement, enablement, allowances | 25 | 3 |
| `handles` | which binding holds which shard | 3 | — |
| `locate` | who is asking, where they are, and what they hold | 2 | — |
| `identity` | sign-in codes, sessions, tokens, proof | 21 | 2 |
| `membership` | the roster and what each member may do | 12 | — |
| `compose` | a manifest becomes a live surface of operations | 3 | 1 |
| `serve` | the one path every request ends in — both doors | 4 | — |
| `records` | the generated reads and writes behind a collection | 6 | — |
| `settings` | reading and writing a workspace's own switches | 4 | — |
| `billing` | plans, subscriptions, the bill, the ladder | 10 | 4 |
| `credits` | the balance, and reserve → settle → release | 7 | 3 |
| `packages` | granting, revoking and expiring a bought bundle | 8 | — |
| `inbox` | notifications: the policy, the audience, the read | 10 | — |
| `services` | the lane out to a provider — AI and mail | 5 | 1 |
| `webpush` | the two specifications a notification travels on — VAPID, and the sealed body | 6 | — |
| `push` | who has turned notifications on, on which device, at which door | 8 | — |
| `vault` | encrypted facts, consent, grants, and who looked | 13 | — |
| `audit` | what happened, and the replay that stops it happening twice | 7 | — |
| `jobs` | the scheduler and the record that it ran | 6 | 1 |
| `branding` | a workspace's own theme and marks | 4 | — |
| `icon` | the picture a business uploads, and where a public route can read it | 8 | — |
| `raster` | a PNG drawn in a Worker, for the tabs and home screens an SVG cannot reach | 3 | — |
| `ai-actions` | which model an action runs on, and in whose words | 7 | — |
| `operator` | the deployment looking at itself | 6 | — |
| `deployment` | what is wrong with this deployment, asked at boot | 1 | — |
| `mcp` | the agent door | 1 | — |
| `member-ops` | the roster's own operations | 1 | — |
| `money-ops` | the bill and the balance, as a read | 1 | — |
| `centre-ops` | the one bootstrap read the tenant door stands on | 1 | — |
| `personal` | the operations about yourself, on every door | 2 | — |
| `installable` | the manifest and the icon a workspace is installed as | 6 | — |
| `platform-schema` | the platform's own tables, in dependency order, listed once | 2 | — |
| `dispatch` | an event an operation raises becomes a note in somebody's inbox | 1 | — |
| `sweep` | the daily clock: erase what is past the ladder's last rung | 4 | — |
| `vault-ops` | consent, grants, who looked, the processing record, export and erasure | 1 | — |
| `dossier` | everything we hold about one person, and everything of theirs we delete | 8 | — |
| `legal` | who agreed to what version, and the wall until they have | 6 | — |
| `cloudflare` | the one door out to the account — create, destroy, and add a binding | 7 | — |
| `storage` | files: the object, the row that knows its key, and the erasure of both | 6 | — |
| `move` | a workspace's records change shard — the only way its jurisdiction can | 8 | — |
| `media-ops` | upload, list, fetch and delete — generated for any app with a media field | 2 | — |
| `resources` | wanted → created → bound → live → draining → gone, and the reaper | 8 | — |

**265 of them**, 250 reached by something today.
Read the file for why each exists; every one is `import { … } from "@engine/runtime"`.
<!-- /generated -->

---

## 10. What a screen draws — `@engine/design`

[../design/README.md](../design/README.md) is the same index for the drawing
half, with its own generated list of everything the package ships. It is in that
directory rather than this one so that everything needed to build a screen is one
`ls` away from the code that draws it: the design language
([DESIGN.md](../design/DESIGN.md)) and the ambience engine
([AMBIENCE.md](../design/AMBIENCE.md)) are beside it.

---

## 11. What is already refused for you

Every kernel rule, and the lane that actually applies it. A rule with a passing
test and no caller is the most dangerous state a rule can be in — argued for in
its own header, cited by other files, and doing nothing.

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
| `refuseNeeds` | `infra` | composition |
| `refuseJob` | `job` | composition |
| `refuseJobs` | `job` | composition |
| `stalled` | `job` | surface |
| `missingDocuments` | `legal` | runtime |
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

### Every guard, and what breaks without it

<!-- generated: node scripts/inventory.mjs guards -->
| Guard | Protects | What breaks without it |
|---|---|---|
| `an-icon-control-is-a-circle` | D7 | a crown of four controls at three different widths, because a button with only a glyph in it still lays out w-fit px-4 |
| `an-icon-only-control-is-named-to-a-pointer-too` | D7 | forty-four glyphs with an aria-label each and no tooltip anywhere, so the product reads correctly aloud and shows everybody else a shape — sharpest on the crown's trail, whose icons are the app's own and whose row is on every screen |
| `every-tailwind-source-path-resolves` | D7 | a @source naming a directory that no longer exists, which is not an error but a smaller stylesheet — 185 utility classes the design package alone used were never emitted, .md:hidden and .absolute among them, with every component still mounting and every test still green |
| `no-screen-assembles-a-control-the-package-ships` | D7 | a screen writing out six <InputOTP.Slot> under a comment saying the number of boxes is the server's, so raising it leaves a form that refuses every valid code and blames the person |
| `no-app-keeps-a-drawer-of-shared-furniture` | D7 | a ui.tsx inside an app, which is where a second app's components accumulate one at a time — the one that existed had already lost two of its three exports to the package and recorded that in its own header |
| `no-source-holds-a-character-nothing-renders` | D8 | a literal backspace inside a guard's regex, which makes the pattern unmatchable while diff, grep and review all render the line as correct — the check then reports green about the one defect it was written to catch |
| `a-table-is-inside-the-collection-it-needs` | D7 | a Table.Column outside Table.Content throwing during render, so the whole screen is blank |
| `a-row-of-equals-shares-its-width` | D7 | a nav of four destinations at four widths, with the current one inheriting whichever width its own label happened to make |
| `the-nav-marks-here-by-moving` | D10 | the nav's fill and its label come from two expressions, so it highlights one destination and names another — or a closed label is removed rather than narrowed, which is five unnamed buttons to the one group the icon carries nothing for |
| `the-type-scale-has-a-top` | D7 | a hero that renders at the size of the heading above it, because two roles resolved to the same size and neither looked wrong alone |
| `the-grain-is-noise-not-a-pattern` | D7 | a visible lattice across every light screen, drawn by the layer whose whole job is to be invisible |
| `a-tenant-is-never-placed-where-its-schema-is-missing` | D5 | every request for one customer answering "no such table", after a move that reported success |
| `residency-is-a-promise-capacity-cannot-break` | D6 | a business told their customers' records stay in the EU, and a rebalance that moved them out |
| `a-capacity-ceiling-never-evicts-a-resident` | D5 | a number an operator typed becoming an outage trigger at whatever hour it is crossed |
| `a-disabled-app-still-counts-towards-a-shard` | D1 | records stranded by a move, readable again the day the product is switched back on — in a database that cannot read them |
| `every-document-declares-what-it-is` | D12 | a document nothing links to, drifting unread until somebody quotes it back as current |
| `a-deferral-is-found-by-a-script-not-by-memory` | D12 | a stage marked shipped with unfinished work inside it, so "shipped" stops meaning anything |
| `an-inventory-is-generated-or-it-does-not-exist` | D12 | a hand-typed count wrong within a week, and a document that stops being read for the parts that are right |
| `every-guard-names-the-decision-it-protects` | D12 | a guard whose reason nobody can find, deleted as noise by somebody who cannot see what it was for |
| `the-kernel-touches-nothing` | D12 | a contract layer that needs a binding to test, so the rules stop being provable and start being fixtures |
| `the-shared-layers-carry-no-product-vocabulary` | D12 | a shared module that knows what a client is, which has stopped being shared |
| `the-framework-name-is-reserved-inside-the-framework` | D2 | `engine` meaning the scene engine, the frame engine or the rendered engine, inside the thing called OneEngine |
| `no-heroui-component-is-restyled` | D7 | consistency that is maintained by care rather than enforced, which lasts until the first hurried screen |
| `no-more-than-five-primary-destinations` | D10 | a bottom bar that stopped being tappable and became a menu |
| `every-declaration-reaches-a-surface` | D12 | a mechanism built, tested and wired with nowhere a person can look — every suite green |
| `every-declared-field-kind-reaches-a-control` | D12 | a declared kind falling through to a text box, which looks finished and accepts anything |
| `every-surface-control-changes-behaviour` | D12 | a switch somebody turns on that does nothing, so they stop watching the thing it promised |
| `no-handler-raises-its-own-cross-cutting-concern` | D12 | a concern an app can forget, forgotten invisibly — no error, no failing test, a capability that silently does not apply |
| `a-vault-fact-is-never-stored-by-an-app` | D11 | an app writing the vault's own tables directly, so a fact exists with no grant, no consent record and no way to shred it |
| `no-cross-tenant-query-fans-out-over-shards` | D5 | an operator console that gets slower with every shard, until the sweep it runs times out |
| `composition-is-lazy` | D4 | cold start growing with the catalogue, until the catalogue that was meant to grow cannot |
| `every-test-gets-its-own-world` | D12 | a suite that is wrong half the time and green every time, with the next real intermittent failure absorbed by the same line |
| `every-surface-has-four-outcomes` | D7 | a screen that says "you have nothing" while it is still loading, and says it again when the request failed |
| `a-collection-never-starts-as-a-fact` | D7 | a confident zero on the first paint — a badge, an all-caught-up, a no-media-yet — every one of them a wrong answer wearing a loading state's excuse |
| `a-skeleton-is-the-shape-of-its-content` | D7 | a layout that jumps the moment data lands, which is worse than one that was briefly blank |
| `three-kinds-of-motion-and-no-fourth` | D7 | a product with a dozen animation techniques and therefore no motion design, accreted one defensible animation at a time |
| `a-shared-stylesheet-reaches-the-document` | D7 | an effect that is exported, imported, and never injected — so it has never once run, and looks exactly like a design decision |
| `no-container-picks-its-own-rhythm` | D7 | twenty screens at gap-2, gap-3, gap-4 and gap-10, each defensible, with nobody able to point at which one is wrong |
| `the-interface-is-monochrome-and-the-data-is-not` | D7 | an accent that is the button, the link, the nav pill and the ramp all at once — present on every screen, meaning nothing, and needing a second colour before anything can stand out |
| `a-control-clears-every-ground-it-sits-on` | D7 | four quick-action chips 0.025 from the light page reading as smudges, while a hand-picked pair list reported the palette sound |
| `no-service-call-is-made-over-fetch` | D3 | a wrong payload becoming a production error where it had been a compile error |
| `a-declaration-is-a-literal-a-script-can-walk` | D8 | a declaration that has to be executed before it can be read, so every generated surface stops being derivable |
| `a-library-decides-it-does-not-rule` | D9 | one of our own rules living inside somebody else's package, re-learned from their release notes |
| `a-notification-nobody-can-receive-is-refused` | D12 | a message switched on in the policy screen that never arrives, so people stop trusting the ones that do |
| `a-switch-nothing-is-behind-is-refused` | D12 | somebody turning on a control that does nothing, and no longer watching for the problem it promised to solve |
| `everything-sold-is-withheld-somewhere` | D12 | money taken for a capability every customer already has, failing in the generous direction so nobody reports it |
| `a-sensitive-fact-is-never-an-ordinary-column` | D11 | somebody's health record in a product table, outside consent, outside the grant log and outside crypto-shredding |
| `erasure-follows-a-column-a-declaration-named` | D12 | a deletion request that reports success and leaves the rows, because the sweep had nothing to follow |
| `a-schema-runner-never-migrates-destructively` | D12 | a DROP running itself on every shard at 3am because somebody edited a declaration |
| `an-identifier-that-is-not-a-name-never-reaches-a-statement` | D8 | a generated schema built from something a request supplied, which is the injection this whole design forecloses |
| `an-app-imports-the-kernel-and-nothing-else-of-ours` | D12 | a manifest that can call the machinery, which is a manifest that can leave a gate out of the next handler |
| `a-workspace-never-holds-an-infrastructure-label` | D2 | a customer answering on the hostname a certificate authority validates against, or on the operator's own door |
| `every-gate-is-applied-by-the-runtime-not-the-app` | D12 | a handler that runs for somebody who was never allowed to call it, because one call site forgot the check |
| `a-replay-spends-nothing` | D12 | a phone that retried in a basement getting a second charge, a second notification and two of what it made once |
| `a-write-is-recorded-whether-it-succeeded-or-was-refused` | D12 | an incident review asking who tried and finding silence, because only the successes were recorded |
| `nobody-may-grant-a-role-they-could-not-grant-key-by-key` | D12 | a two-step escalation: invite a second address of your own as an owner, then sign in as it |
| `an-invitation-is-claimed-by-address-and-nothing-else` | D12 | anybody holding an account id adding themselves to a workspace they were never invited to |
| `permissions-are-resolved-on-every-request` | D12 | a role taken away that keeps working until the person signs out, which is exactly when it matters that it does not |
| `a-workspace-is-created-in-one-place` | D1 | somebody who followed a colleague's link being invited to start a second workspace on that workspace's own branded page |
| `a-code-cannot-be-guessed-or-used-to-flood-an-inbox` | D12 | a six-digit password with unlimited attempts, and a sign-in endpoint anybody can use to mail somebody a hundred times |
| `nothing-hand-rolls-a-control-the-library-ships` | D7 | a control missing the focus ring, the pressed state and the keyboard behaviour, which looks fine and so survives review |
| `every-positioned-component-sits-inside-its-anchor` | D7 | a count that lands on top of the time beside it, because a positioned component written without its anchor still compiles, still renders, and still looks like a component |
| `a-stored-secret-is-never-rendered-back` | D11 | a live credential handed to every script in the page and to whatever the browser saved |
| `a-destination-nobody-can-reach-is-never-drawn` | D10 | a nav item that leads to a 403, which the person cannot tell from something simply broken |
| `branding-is-tokens-and-never-a-stylesheet` | D7 | a workspace able to break its own customers' screens on our infrastructure, and to make a page look like something it is not |
| `one-workspace-with-two-products-pays-one-bill` | D1 | a customer of two products becoming two customers - two cards, two renewal dates, two companies as far as they can tell |
| `a-reserve-is-a-ceiling-on-revenue` | D12 | every unit an estimate fails to anticipate charged to a customer instead of absorbed, or absorbed silently on every call |
| `a-hold-is-taken-in-the-statement-that-checks-it` | D12 | two concurrent calls both passing the same balance check, and a balance that went negative long after the calls that did it |
| `arrears-take-writes-and-never-reads` | D12 | a business locked out of its own records over an unpaid invoice, which is holding their data hostage |
| `a-signup-in-progress-is-never-read-as-arrears` | D12 | a brand-new workspace held read-only over an invoice that never existed, in its first minute |
| `grandfathering-and-an-adjustment-are-separate-columns` | D12 | give this workspace ten seats becoming a one-way door whose only reverse discards what they were originally sold |
| `a-fabricating-lane-is-development-only` | D3 | invented output served as fact in production, billed for, with every suite green because the suites run where mocking is correct |
| `a-failed-generation-gives-the-credits-back` | D12 | a customer whose balance shrank for a call that returned nothing, with the hold never released |
| `the-inbox-is-written-whatever-the-policy-says` | D12 | somebody who muted email having no record at all of what happened while they were not looking |
| `a-notification-audience-is-a-permission` | D12 | a workspace that made its own role silently receiving nothing, with every dispatch reporting success against an empty audience |
| `one-persons-inbox-is-one-persons` | D11 | a workspace filter without the account, which is everybody reading everybody else's notifications |
| `no-app-carries-its-own-encryption` | D11 | a field that looks safer than a plain column and survives an erasure - key not shredded, reads unrecorded, export unaware it exists |
| `erasing-destroys-the-key-not-just-the-rows` | D11 | telling somebody they were forgotten while a readable copy sits in a backup that already left the building |
| `consent-is-the-ceiling-and-a-grant-is-the-specific` | D11 | an operator-written grant standing in for the subject's own agreement, which is a lawful-basis failure wearing an access-control shape |
| `every-look-is-recorded-including-the-refused-ones` | D11 | the question "did anybody try to look at this" answered with silence, which is the question actually asked after something goes wrong |
| `erasure-is-not-a-pause` | D11 | a fresh salt after a shredding, making everything written afterwards a second collection nobody agreed to |
| `a-real-product-needs-no-infrastructure-of-its-own` | D12 | a product that has to write its own router, schema, gates and audit, which is a product that can leave one of them out |
| `a-persons-own-records-are-theirs-by-construction` | D11 | somebody's own records readable by anybody in the workspace, because a handler forgot a WHERE |
| `a-seat-ceiling-only-counts-roles-that-cost-a-seat` | D12 | a workspace on the smallest plan unable to add the customers it exists to serve, refused for staff seats it was not asking for |
| `a-workspace-becomes-a-business-once-and-never-back` | D21 | a business quietly rolled back to personal — its brand gone one morning with no event that removed it, and its records due to move off a shard it was promised |
| `no-plan-a-personal-workspace-buys-unlocks-a-business-capability` | D21 | a customer sent to a price list where nothing they can buy would help, which is selling something that does not exist |
| `the-kind-gate-is-declared-read-and-in-the-right-place` | D21 | a gate position that refuses nothing for ever, reading on every screen as a limit that is working |
| `one-statement-writes-what-a-workspace-is` | D21 | the one-way door opened from the side by a second UPDATE that never asked whether the direction was allowed |
| `what-commercial-buys-is-asked-rather-than-compared` | D21 | two screens in one product disagreeing about what a business may do, because one asked and the other compared |
| `a-brand-belongs-to-the-workspace-and-not-to-one-app` | D22 | a business with three products holding three branding switches, three places to change them, and two of them stale |
| `a-personal-workspace-cannot-brand-itself` | D22 | somebody else's logo on an installable icon, written past a control that was only hidden |
| `one-installable-tile-per-workspace-served-without-a-session` | D22 | every workspace installing as a browser default, silently, on every phone that ever adds it |
| `isolation-is-never-sold-over-somebody-elses-records` | D5 | a database of one's own sold over a shard full of strangers, with every workspace on it working perfectly and nothing downstream noticing |
| `a-field-is-never-the-colour-of-the-card-it-sits-on` | D7 | a control that exists, is focusable, and cannot be seen until somebody types into it — in both themes, with no border anywhere to draw its edge |
| `a-business-only-screen-is-not-offered-to-a-workspace-that-is-not-one` | D21 | a destination drawn in the nav, navigable and reachable by URL, whose every action refuses — the declaration correct, the manifest composing, and no mechanism behind it |
| `the-space-has-one-door-to-the-api` | D12 | an expired session that does not look expired — every screen showing the empty state its failed load produced, and every save failing into a toast |
| `the-browser-never-classifies-its-own-door` | D3 | a page offering a control the runtime refuses, answered as a 404 with nothing on it to explain why |
| `every-screen-the-picker-names-is-drawn` | D10 | a blank page, which is the same picture as a page that failed to load — so somebody reloads for a minute and then gives up |
| `a-code-that-could-not-be-sent-holds-no-cooldown` | D12 | somebody locked out for a minute waiting on a code that was never delivered, told they are asking too often |
| `the-deployment-answers-on-every-door-it-serves` | D3 | a deploy reporting green while the isolate throws in its first middleware — the page still loads, because static assets never reach the worker |
| `engine-is-off-the-production-deploy-path` | D3 | the framework shipping to the account a paying tenant is served from, selected by a workflow that derives its app list from a file somebody tidily added it to |
| `one-shares-no-name-with-a-live-product` | D5 | one product reading another's rows, or a deploy replacing a live worker — a worker name is account-wide and provisioning finds a database by name |
| `ones-wildcard-never-covers-a-live-tenants-address` | D3 | route precedence rather than intent deciding who answers a paying customer's own subdomain |
| `a-deployment-that-cannot-sign-refuses-to-serve` | D12 | every sign-in code signed with a constant anybody reading the repository already has, on a deployment where nothing looks wrong |
| `no-screen-writes-its-own-easing-or-duration` | D7 | a product where a drawer, a toast and a card each decelerate differently — nothing broken, nothing nameable, and it reads as cheap |
| `motion-answers-to-the-reduced-motion-setting` | D7 | an animation that keeps running for somebody who asked it to stop, which for some people is a symptom rather than a preference |
| `typography-is-a-role-not-a-size` | D7 | thirty screens each choosing a defensible heading size, and a product with no typographic system at all |
| `every-collection-records-who-and-when` | D12 | a record nobody can attribute, discovered at the moment somebody needs to know who changed it |
| `the-generated-edit-actually-writes` | D12 | an edit that passes the gate, writes an audit entry saying it happened, answers 200 — and changes nothing |
| `an-edit-cannot-land-on-somebody-elses-record` | D5 | a guessed id from another workspace answering 200 as though the change landed |
| `the-product-talks-in-one-voice` | D7 | a product that sounds like several products — a caption with a full stop beside four without one, a control that says Submit, an error that says Oops |
| `the-tone-rules-still-fire` | D12 | a green run that means nothing, because the checker's own rules stopped matching anything |
| `nothing-draws-a-border-or-a-shadow` | D7 | a hairline here and a soft shadow there, read as two different kinds of thing when they are the same claim twice |
| `every-surface-tier-is-findable-without-an-edge` | D7 | cards that vanish in one theme when shadows are dropped, looking like a rendering fault rather than a decision |
| `the-library-draws-no-edges-of-its-own` | D7 | a ban kept in our files while the components draw their own, so the rule reads as held and is not |
| `the-page-ground-is-ours` | D7 | a palette that is entirely correct and reaches nothing, because the page is the user agent canvas and a light card comes out darker than it |
| `the-agent-door-ends-in-the-one-operation-path` | D13 | a gate that silently does not apply to agents, because the MCP door ran the handler itself and the first forgotten concern is invisible |
| `an-opted-out-operation-is-invisible-on-the-agent-door` | D13 | a tool hidden from the list and still callable — or a distinct refusal that confirms the name to the model that was refused it |
| `the-tool-catalogue-means-callable` | D13 | an agent shown every tool including the refusals, taught to try them, with an audit row per call that was never going to run |
| `the-rosters-granting-operations-are-not-tools` | D13 | a model that can invite somebody to a workspace from a sentence in a document it was asked to summarise |
| `the-gate-resolves-keys-for-the-operations-own-app` | D15 | a role in the second product grants nothing, silently, for everybody — every suite green because every suite has one app |
| `every-assignment-is-bounded-per-authority` | D15 | anybody who can edit access escalates in two steps: grant yourself the role you lack through the authority nobody bounds, then use it |
| `a-notifications-audience-is-per-app` | D15 | a role in one product rings bells about another product's events for people who cannot even open it |
| `a-package-cannot-sell-what-cannot-be-delivered` | D16 | money taken for a key nothing reads, discovered at the customer's first 403 weeks after the editor said saved |
| `a-package-grant-always-carries-its-clock` | D16 | a purchase that sells access for ever, because a bare grant is a standing exception and the resolver is correct to honour it |
| `a-renewal-extends-and-never-stacks` | D16 | two overlapping windows for one purchase, and which one the resolver reads decides what somebody paid for |
| `the-rails-granting-operations-are-not-tools` | D16 | a model composes or applies what a payment buys from a sentence in a document |
| `every-centre-stop-has-a-branch` | D10 | a path the parser can produce renders a blank page, which is the same picture as a page that failed to load |
| `an-unreachable-area-resolves-away-before-it-renders` | D15 | a customer opens Money and every call on the screen is a 403 dressed as a broken page |
| `every-space-screen-has-an-address` | D20 | a screen held in component state cannot be linked to, landed on or reloaded, and a refusal saying "read this first" has nowhere to send anybody |
| `leaving-is-decided-by-where-a-screen-sits` | D20 | two screens get the way out right by hand and the third goes home from three levels in, or a cycle makes the back button never leave |
| `the-space-prefix-is-never-a-products-path` | D20 | an app ships a screen under /space, it is unreachable, and its author finds out from somebody who could not open it |
| `a-cross-app-operation-names-its-target` | D15 | the second product's packages and settings are unreachable for ever, because the route resolves whichever app is first on the tenant's list |
| `the-console-is-on-the-operator-door-and-asks-who-is-there` | D18 | the deployment's own console answers at a workspace's address, or admits anybody holding a session, and looks exactly like working software |
| `maintenance-is-asked-in-the-one-operation-path` | D18 | a closed deployment serves right through the agent door, or an unprovisioned switch refuses every request over our own missing row |
| `an-app-names-a-lane-never-a-model` | D19 | a deployment decision shipped through a product release — wrong the day the provider retires the row, and different in every app, with nothing failing |
| `an-edited-prompt-is-bounded-at-both-levels` | D19 | a variable nothing offers is sent to a model as a literal brace, and the answer comes back subtly wrong with nobody the wiser |
| `the-run-and-the-screens-read-one-resolution` | D19 | the bill stops matching what anybody was shown, because the run used a different model or different words than the console reported |
| `a-screen-names-a-shape-and-the-shape-places-the-action` | D7 | the one thing a screen is for lands somewhere different on every screen — buried at the foot of a long list on one, pinned on the next — so somebody has to hunt for it and the product reads as assembled by different people; and a block comment written between two tags ships four lines of design rationale to production as body text |
| `one-subject-wears-one-face-everywhere` | D7 | the same person is a picture in the crown, a letter in the roster and a different letter in a table — because each surface seeded a face from whatever field it happened to hold, and every one of them looks correct on its own |
| `a-face-is-seeded-on-an-identity-not-a-label` | D7 | somebody gets a new face the day they correct the spelling of their name, and a workspace gets a new one the day it is renamed — so a picture people had learned to recognise means nothing; and a face fetched from api.dicebear.com puts a third party in the request path of every roster, unnamed on the trust screen |
| `a-products-mark-wears-the-plate-every-face-wears` | D7 | a product appears beside a person as a bare character somebody typed — no ground under it, a different optical weight from every face in the same bar — so a workspace with six products is six identical glyphs and the label does all the work |
| `a-workspaces-sky-is-its-planets-own-colours` | D7 | the ground somebody lands on is a different world from the planet in the row they pressed — because the sky's colours were re-derived by a hash of ours instead of read out of the picture, and the two agreed until one of them was edited |
| `a-world-is-the-same-world-twice` | D7 | a workspace's sky is a different place on every reload, which nobody reports because nobody can hold two of them side by side |
| `a-ground-animates-on-the-compositor-only` | D7 | a full-viewport layer repaints every frame for ever on a phone — invisible on the laptop it was written on, and the first thing a reviewer blames on the device |
| `a-ground-is-masked-rather-than-washed` | D7 | one screen's contrast problem is fixed with a scrim, and every workspace's brand is grey behind a film nobody outside that file can see |
| `a-scene-is-sized-by-area-not-by-count` | D7 | the same world is sparse on a desktop and crowded on a phone, and whichever screen it was tuned on is the only one it looks right on |
| `a-scene-is-bound-to-a-subject-not-built-by-a-screen` | D7 | a screen derives the ground, the hero face and the density separately from one fact, and the day one of them is edited the crown wears one workspace's planet over another workspace's sky |
| `a-family-renders-every-mark-it-references` | D7 | a soft mark fills with a gradient id nothing defines — a valid SVG, a rendered page, and a family's whole atmosphere silently absent |
| `a-family-fills-every-slot-it-declares` | D7 | an unfilled slot interpolates `undefined` into CSS, the browser drops that one declaration, and a four-layer ground quietly becomes three |
| `a-family-has-two-skies-and-a-veil` | D7 | one sky registered twice is the made-up rule coming back — a night ground turned down for light mode, which is grey every time |
| `a-fixed-ink-family-bakes-no-custom-property` | D7 | `var(--brand)` inside an SVG is a string rather than a colour — the mark is painted with nothing and the whole field is absent, with a valid document and no error anywhere |
| `a-lattice-repeats-on-whole-cells` | D7 | a cell that does not divide the tile leaves half-cells down every seam — a ruled line across the page at the one pitch the eye is best at finding, and invisible in the source |
| `one-door-into-the-design-system` | D7 | a file path inside the design system becomes public, so nothing in it can be renamed, split or folded away again |
| `one-docked-action-declared-not-wrapped` | D7 | a hand-rolled dock skips the rules the declaration carries — a primary over a skeleton, over a refusal, or duplicated inside an empty state |
| `one-source-for-every-measurement` | D7 | a component picking its own padding or gap, so a list ends up with three rhythms and no wrong line to point at — the check existed and ran nowhere, with sixteen findings accumulated behind it |
| `a-pressable-row-clears-the-touch-floor` | D7 | a row somebody taps rendering under 64px, which reads as a mis-tap rather than as a small target |
| `a-pressable-row-drops-the-button-s-own-metrics` | D7 | a row satisfying the touch floor with a string that changes nothing, because the button's own height and gutter still win |
| `the-page-reserves-room-for-its-nav` | D7 | a sticky island floating over the last card on every screen — the island cannot fix it, since by the time it lays out the content above is already sized |
| `every-component-shipped-is-drawn-somewhere` | D7 | a component exported, tested, documented and rendered by nobody — an absence, which typechecks and has no failing test, and whose first caller is the one who finds out it nests a button, draws its arc in a monochrome accent, or prints "min120" |
| `the-test-ground-draws-most-of-the-package` | D7 | apps/hello quietly ceasing to be where this package is tried, which would leave the excuse list as the only thing keeping the check green |
| `a-changeable-fact-is-a-value-and-an-edit` | D7 | a settings card that is a column of live inputs — nothing saying which row is dirty, a stray tap on a phone editing a setting somebody was scrolling past, and a failure reported in a toast beside a control already showing the value the server threw away |
| `a-refused-change-keeps-what-was-typed` | D7 | the sheet closing on a refusal, so somebody who spent a minute on a value watches it disappear and reads why in a toast that is gone before they look back |
| `every-refusal-comes-from-a-catalogue` | D5 | one code meaning three things — three screens stamping platform.invalid on three sentences they wrote themselves, so a client switching on the code cannot, and the wording of a refusal lives wherever it was last edited |
| `a-refusal-naming-an-input-is-shown-on-that-input` | D5 | every refusal about one value rendered as a banner over the whole form, so somebody with six inputs is told that something does not look right and has to re-read all six to find which |
| `a-refusals-values-are-supplied-where-it-is-raised` | D5 | a person hitting a seat limit reading "your plan includes {limit}" — the sentence survives because leaving an unknown token visible is deliberately correct, which is exactly what lets an unsupplied one reach a screen |
| `a-settings-page-is-a-declared-destination` | D12 | a settings screen carded by a free-text heading again — a page nobody can link to, with no mark to find it by, no line saying what is behind it, and an order that shifts every time a setting is added |
| `settings-descend-rather-than-stack` | D12 | one scroll holding a switch, a colour and an email address — three kinds of consequence on one screen, which is the filing cabinet DESIGN.md §3 exists to refuse |
| `an-authority-is-a-screen-not-a-tab` | D12 | a person's own preferences living inside the workspace's administration surface, so they sit behind whatever permission guards that screen and a member without it cannot reach their own |
| `every-glyph-a-declaration-names-exists` | D7 | a neutral circle sitting in a list where every other row has a shape — an icon is a STRING in a manifest so no compiler sees the typo, and this map has now been out of step with its callers twice, both times described in full by its own header |
| `every-rule-the-kernel-states-is-one-something-runs` | D12 | a rule written down, argued for in its own header, unit-tested and cited elsewhere as though it were in force, with no caller anywhere — which is how an API came to silence a notification whose whole point is that it cannot be silenced |
| `no-lane-re-derives-what-the-kernel-decides` | D12 | two answers to one question — a runtime that works out for itself whether two colours can be read, and diverges from the kernel in whichever direction nobody tests |
| `no-page-imports-a-product` | D17 | one product's whole manifest and every screen shipped to every customer of every other one — measured in the built bundle, behind a dev-only branch that reads as dev-only and is not, because a module graph is decided before a branch is |
| `the-test-ground-cannot-reach-production` | D17 | a chunk emitted for a screen nobody in production requests, which pins every symbol that chunk could reach as an export of the shared one and stops the design system tree-shaking — measured at +147 KB |
| `every-provider-call-goes-through-one-lane` | D14 | a generation the gateway never sees, so its real token count and real cost are invisible to the half of metering that pays for them and the reserve settles against a guess |
| `a-document-points-only-at-files-that-exist` | D12 | an instruction that sends a reader somewhere empty — the standards document told people deferrals were found by a script that does not exist, so anybody who followed it found nothing and could reasonably conclude they are not tracked |
| `the-layering-check-can-actually-match` | D2 | a green run asserting nothing — the pattern named a package scope the tree stopped using at the rename, so eighty cross-package imports went unexamined while the check printed a confident sentence about all of them |
| `the-design-system-navigates-nothing` | D7 | the package deciding navigation for every app that uses it — and OneSpace, which is not one app, having two routers in one page |
| `a-guard-that-walks-reports-what-it-walked` | D12 | a green run over an empty corpus reading exactly like a green run over a full one — three checks in this tree printed a confident sentence for months while examining nothing, and each was found by accident rather than by the gate |
| `a-build-edge-names-a-package-that-exists` | D12 | a worker's integration suite running against whichever SPA build happened to be lying around — turbo ignores a task key for a package it does not have, in silence, and the edge that connects a suite to its own build is exactly the one nothing else in the graph can express |
| `a-runtime-capability-is-mounted-or-is-waiting-on-a-named-stage` | D12 | a capability with tables, tests and a document describing it, that no route reaches — the whole vault, the AI lane and the inbox's one write were all in that state at once, and every signal a reader has said they were there |
| `a-deferral-names-a-stage-that-exists` | D12 | a marker that reads as a plan and points at nothing, so the gap is neither enumerable nor scheduled |
| `the-index-of-what-exists-cannot-be-silently-incomplete` | D12 | a generated index missing a module — the one page whose job is answering “does this already exist” telling a reader, in a table, that it does not |
| `a-scheduled-handler-has-a-trigger` | D12 | a sweep that compiles, typechecks, passes its own tests and is called by Cloudflare exactly never — so nothing is ever erased, behind a green run |
| `a-special-category-never-reaches-a-product-column` | D11 | health data in plaintext beside the ordinary fields, outside consent, outside the record of who looked and outside erasure — with the manifest's refusal satisfied and every other test green |
| `a-vault-field-names-a-person` | D11 | a vault fact on a row that names nobody — the write would invent a subject, and whatever it invented is who the consent, the grants and the erasure belonged to |
| `every-table-is-in-the-erasure-ledger` | D11 | a platform table an export never reads and an erasure never deletes from — both answering "here is everything we hold" and "it is all gone" over rows nobody walked |
| `a-ledger-row-says-who-is-in-it` | D11 | a table nobody decided about, indistinguishable from one somebody forgot to look at |
| `the-copy-and-the-deletion-are-reachable` | D11 | a complete ledger walked by no operation — the third whole mechanism in this repository to ship with no address |
| `agreed-before-the-product-opens` | D12 | somebody using a product under terms they never saw, with a record that says they agreed to a version that did not exist yet |
| `an-acceptance-scope-is-derived` | D12 | a guest answering the data-processing agreement for a business they do not run, recorded for ever as that business having signed it |
| `one-door-out-to-the-account` | D12 | a second caller reaching the account token's API, inheriting none of the bounds written in cloudflare.ts |
| `bindings-are-added-never-repointed` | D12 | a leaked account token repointing DIRECTORY at somebody else's database, taking every account, session and workspace with it, with nothing looking wrong |
| `the-current-bindings-are-read-first` | D12 | a computed binding set replacing the array rather than adding to it, deleting every binding the computation did not know about |
| `a-residency-verdict-per-resource-kind` | D6 | a queue or a KV namespace carrying somebody's name under an EU promise the vendor offers no way to keep |
| `live-is-written-only-where-the-binding-is-seen` | D12 | a resource reported usable while its binding still reads undefined, which is an empty answer rather than an error |
| `a-resource-drains-before-it-is-destroyed` | D12 | an app removed by a typo taking its database with it in the same minute, behind a green log line |
| `no-person-in-a-log-line` | D6 | somebody's address or account id disclosed to a store that leaves the jurisdiction, is retained on a vendor's schedule, and survives every erasure this platform performs |
| `the-residency-promise-excludes-logs` | D6 | promising a jurisdiction for logs the vendor offers no residency control over — broken by the first request |
| `a-file-goes-when-its-row-does` | D11 | somebody's uploads left in a bucket after their account was erased, invisible to every check and visible only on a bill |
| `an-object-key-is-derived-never-supplied` | D5 | a caller choosing a key outside their own workspace's prefix, one string from reading somebody else's file, with an ordinary-looking ledger row |
| `a-workspace-is-read-only-while-it-moves` | D5 | a copy taken from a live database losing every row written after the table was read — silently, and only for whoever happened to be working |
| `a-move-verifies-both-sides-before-it-flips` | D5 | flipping onto a copy with rows missing, after which the intact source is never consulted again |
| `a-moved-source-drains-before-it-is-cleared` | D5 | a move emptying its source, unrecoverable the moment the copy turns out to have been wrong |
| `what-moves-is-what-erasure-takes` | D12 | a second list of a workspace's tables, so a moved workspace arrives without its roster while every row that did copy is reported successfully |
| `a-binding-is-keyed-by-its-jurisdiction` | D6 | two per-residency resources collapsing onto one key, so a workspace resolves another jurisdiction's store — both working, and nothing reporting it |
| `a-sealed-push-body-comes-back-out-as-what-went-in` | D12 | a swapped HKDF salt or a padding byte of 0x00 — bytes every push service accepts, forwards and 201s on, that no browser can decrypt and nobody ever sees |
| `a-vapid-header-is-raw-r-s-scoped-to-an-origin` | D12 | a DER-wrapped signature or an audience scoped to the endpoint, which every push service rejects at once |
| `a-push-subscription-belongs-to-the-door-it-was-made-at` | D22 | one business's notification arriving on a device wearing another business's logo and opening a link into the wrong workspace — with the send reporting success |
| `a-gone-device-is-pruned-where-the-answer-is` | D12 | a table of uninstalled browsers retried for ever, because sending is the only moment the platform learns a subscription is dead |
| `replacing-the-keypair-takes-every-subscription-with-it` | D12 | a fleet of devices counted as reachable that answer 403 for ever, because a browser subscribed to the public key that was replaced |
| `a-channel-is-what-is-bound-not-what-is-claimed` | D12 | a switch offered for a channel the deployment cannot send on, so somebody waits for a notification nothing attempted |
| `an-interruption-goes-only-to-whoever-asked-for-one` | D12 | a phone lighting up for a type that declared inbox and email, and for a person who switched push off — the setting saved, read by nothing |
| `what-the-engine-offers-is-emitted-by-the-engine` | D12 | an index of what an app gets for free, typed by hand and wrong within a week — so the same capability is written twice by somebody who read that it did not exist |
| `an-app-that-declares-nothing-still-has-a-roster-and-a-bill` | D1 | an operation quietly leaving the set every app gets without asking, so the next product writes its own roster, its own inbox and its own two doors bounding an invitation |
| `a-stage-is-read-from-one-registry` | D12 | four checks parsing one markdown table four ways, so a reformatted row is a stage nothing can be deferred against and a guard that can be owed for ever — silently, because each check reports green about a row it never saw |
<!-- /generated -->

### And how well each decision is defended

<!-- generated: node scripts/inventory.mjs decisions -->
| # | Decision | Guarded by |
|---|---|---|
| D1 | The tenant is primary; an app is a capability switched on for it | 4 |
| D2 | The framework is OneEngine; the deployment is One; packages are `@engine/*` | 3 |
| D3 | One worker on the request path; heavy work splits over RPC service bindings | 6 |
| D4 | Composition is lazy: a request composes the app it is for, and no other | 1 |
| D5 | Storage is placed, not owned. The directory carries every cross-tenant fact | 13 |
| D6 | Jurisdiction is a workspace fact, derived from the business's country | 5 |
| D7 | HeroUI v3 is the component layer, and its components are not restyled | 57 |
| D8 | Declarations are typed object literals; not decorators, not a custom format | 3 |
| D9 | Libraries encode decisions; we write invariants | 1 |
| D10 | Five primary destinations, maximum | 5 |
| D11 | The vault is encrypted rows in the shard, keyed by a destroyable salt | 16 |
| D12 | Every cross-cutting concern is a field on a declaration, never a call site | 68 |
| D13 | The agent surface is derived: every operation is an MCP tool unless it says why not | 4 |
| D14 | Provider AI calls go through the unified AI binding and its gateway, never direct fetch | 1 |
| D15 | One membership, two authorities: a platform role for the workspace, a role per app inside it | 5 |
| D16 | A package is a role with a clock: timed grants on the membership, resolved by the same resolver | 4 |
| D17 | The tenant centre is one bundle for every product, and declarations reach the page as data | 2 |
| D18 | The operator stands outside every workspace, and the console is a door rather than a role | 2 |
| D19 | An AI action declares a lane and a letterhead; the operator binds the model, and words narrow downward | 3 |
| D20 | OneSpace is one surface presented over the product, reachable from every door, and it is a route | 3 |
| D21 | A workspace is personal or commercial, and that is what it IS rather than what it bought | 6 |
| D22 | Branding and the installable app belong to the workspace, never to one app inside it | 4 |
<!-- /generated -->

---

## 12. What is built and reached by nothing

⚠️ **THIS IS THE SECTION TO READ BEFORE BELIEVING ANY OTHER ONE.** A capability
with tables, tests and no address is invisible — no error, no failing test, every
suite green — and it is the failure this whole framework is a catalogue of. Each
row below is a declaration that exists, compiles, is tested, and is reached by
nothing yet.

<!-- generated: node scripts/inventory.mjs waiting -->
| Waiting on | Where | How many |
|---|---|---|
| **21** — Payment — something takes a card | `runtime/src/billing.ts` | 4 |
| **21** — Payment — something takes a card | `runtime/src/credits.ts` | 3 |
| **23** — Mail that leaves the process — a letter, its variables, and a provider | `kernel/src/notify.ts` | 1 |
| **24** — A workspace composes its own roles out of one app's keys | `kernel/src/access.ts` | 1 |
| **27** — The AI lane runs — an action reaches a provider and the reserve settles | `kernel/src/ai.ts` | 1 |
| **27** — The AI lane runs — an action reaches a provider and the reserve settles | `kernel/src/credit.ts` | 1 |
| **27** — The AI lane runs — an action reaches a provider and the reserve settles | `runtime/src/services.ts` | 1 |
| **30** — A workspace's apps are turned on and off, and a workspace can move shard | `kernel/src/tenancy.ts` | 2 |
| **30** — A workspace's apps are turned on and off, and a workspace can move shard | `runtime/src/directory.ts` | 3 |
| **31** — Account security — sign out everywhere, and proving it is you again before something irreversible | `runtime/src/identity.ts` | 2 |
| **32** — A manifest changes while the deployment is up, and the composed surface forgets | `runtime/src/compose.ts` | 1 |
| **33** — A setting reaches the code — a handler reads one, and a guard refuses a switch that changes nothing | `kernel/src/setting.ts` | 1 |
| **34** — The kernel's remaining conveniences are each used by a lane or removed | `kernel/src/brand.ts` | 1 |
| **34** — The kernel's remaining conveniences are each used by a lane or removed | `kernel/src/door.ts` | 1 |
| **34** — The kernel's remaining conveniences are each used by a lane or removed | `kernel/src/entitlement.ts` | 1 |
| **34** — The kernel's remaining conveniences are each used by a lane or removed | `kernel/src/gate.ts` | 1 |
| **34** — The kernel's remaining conveniences are each used by a lane or removed | `kernel/src/operation.ts` | 1 |
| **34** — The kernel's remaining conveniences are each used by a lane or removed | `kernel/src/primitives.ts` | 2 |
| **34** — The kernel's remaining conveniences are each used by a lane or removed | `kernel/src/tenancy.ts` | 1 |
| **34** — The kernel's remaining conveniences are each used by a lane or removed | `kernel/src/tone.ts` | 1 |
| **35** — A workspace runs its own retention ladder against its own customers, and ours freezes it | `kernel/src/package.ts` | 1 |
| **35** — A workspace runs its own retention ladder against its own customers, and ours freezes it | `runtime/src/jobs.ts` | 1 |

**32 declarations** are built and reached by nothing, each waiting on a
stage it names in a `DEFER` marker. `scripts/capability.test.mjs` fails on one
that names no stage, so this list cannot grow by forgetting.
<!-- /generated -->

### The stages

<!-- generated: node scripts/inventory.mjs stages -->
| # | Stage | |
|---|---|---|
| 0 | Ground — workspace, docs, guard registry, standards | shipped |
| 1 | Kernel — entities, declarations, gate algebra, problems | shipped |
| 2 | Directory + placement | shipped |
| 3 | Runtime — manifest → live worker | shipped |
| 4 | Identity + tenancy | shipped |
| 5 | Surface — HeroUI shell, nav, sky, rendered settings | shipped |
| 6 | Money — plans, entitlements, credits, jobs | shipped |
| 7 | Services — ai and notify over RPC | shipped |
| 8 | Vault + legal | shipped |
| 9 | A real product on OneEngine, end to end | shipped |
| 10 | One — the deployment and the OneSpace | shipped |
| 11 | The agent surface — every operation an MCP tool, derived | shipped |
| 12 | Multi-app access — a platform role for the workspace, a role per app inside it | shipped |
| 13 | The package rail — a priced bundle of timed grants, one ledger, one clock | shipped |
| 14 | The tenant centre — the shell with the router: five areas + app screens inside | shipped |
| 15 | The operator console — the same shell on `admin.`, and the maintenance switch | shipped |
| 16 | AI actions — a lane per action, a model the operator binds, words that narrow | shipped |
| 17 | OneSpace — one surface over the product, reachable from every door, addressed | shipped |
| 19 | OneDesign — the design system named, packaged, documented and fenced | shipped |
| 20 | Workspaces — personal or commercial, one brand, one installable, a shard of their own | shipped |
| 21 | Payment — something takes a card | **planned** |
| 22 | OneSpace — `id`, `admin` and `setup` merge into one address off the workspace root | **planned** |
| 23 | Mail that leaves the process — a letter, its variables, and a provider | **planned** |
| 24 | A workspace composes its own roles out of one app's keys | **planned** |
| 25 | Agreements — versioned documents, an acceptance per person per version, and the wall until there is one | shipped |
| 26 | The vault is opened — consent, who looked, your data, and an erasure that shreds | shipped |
| 27 | The AI lane runs — an action reaches a provider and the reserve settles | **planned** |
| 28 | Notifications are filed — an event raised becomes a note in somebody's inbox | shipped |
| 29 | The daily sweep — erasure happens on a clock, and every run is recorded | shipped |
| 30 | A workspace's apps are turned on and off, and a workspace can move shard | **planned** |
| 31 | Account security — sign out everywhere, and proving it is you again before something irreversible | **planned** |
| 32 | A manifest changes while the deployment is up, and the composed surface forgets | **planned** |
| 33 | A setting reaches the code — a handler reads one, and a guard refuses a switch that changes nothing | **planned** |
| 34 | The kernel's remaining conveniences are each used by a lane or removed | **planned** |
| 35 | A workspace runs its own retention ladder against its own customers, and ours freezes it | **planned** |
| 36 | The deployment provisions itself — a product declares what it needs underneath it, and the reconciler makes it exist in the right jurisdiction, binds it, and reaps it after a drain | shipped |
| 37 | A workspace's records change shard, which is the only way its jurisdiction can — read-only while it copies, verified before it flips, and the source drained rather than emptied | shipped |
| 38 | A notification leaves the process — Web Push written out rather than depended on, a subscription filed under the door it was made at so it wears that workspace's own icon, and a keypair the console generates and never accepts | shipped |
| 39 | The documentation is two generated pages — what exists, derived from the engine; and how to add to it, which no generator can derive | shipped |

**28 shipped, 11 planned.** A stage cannot be shipped while a `DEFER(engine-N)` marker names it — `scripts/docs.test.mjs` fails the build if one does, which is the only reason this table can be read instead of the code.
<!-- /generated -->

---

## 13. Whether any of it is deployed

<!-- generated: node scripts/inventory.mjs deployment -->
| Binding | Resource | |
|---|---|---|
| `DIRECTORY` | *not made yet* | **placeholder** |
| `SHARD_EU_1` | *not made yet* | **placeholder** |

**2 of 2 are placeholders, so nothing is deployed.** A deploy with them in place binds a worker to databases that do not exist, which is why the workflow SKIPS rather than shipping: Actions → **OneEngine** → Run workflow with `provision` ticked creates them, writes their ids back and mints the signing secret.

Two steps a workflow cannot take: the DNS records for the root and its
wildcard, and the Worker routes. `wrangler.jsonc` declares no `routes`
deliberately — declaring them makes `wrangler dev` rewrite the incoming Host,
which collapses every door onto one.
<!-- /generated -->

---

## 14. Running it

<!-- generated: node scripts/inventory.mjs commands -->
| Command | What it runs |
|---|---|
| `pnpm engine:dev` | the worker on :8080 and OneSpace on :5173, every door on `*.localhost` |
| `pnpm engine:typecheck` | every package |
| `pnpm engine:test` | every suite — kernel, runtime, design, OneSpace, the reference app |
| `pnpm engine:gate` | every guard in `docs/guards.json` |
<!-- /generated -->

`engine/` is inert to everything outside it: nothing in it is registered in the
repository's app manifest, so no deploy workflow can select it.
`scripts/inert.test.mjs` fails if that stops being true.

Two doors are worth knowing by hand. `pnpm engine:dev` serves every door on
`*.localhost` — the signpost at `:5173`, then `id.`, `setup.`, `admin.` and any
workspace slug. `engine/one/README.md` is how to run the deployment on its own.

⚠️ **AND ONE COMMAND WRITES RATHER THAN CHECKS.**
`EMIT=1 pnpm --filter @engine/hello test` recomputes `docs/surface.json` — the
file §1 through §7 are generated from. It is emitted by the real composer
(`apps/hello/test/surface.screens.test.tsx`) rather than parsed out of the source,
because a script that grepped for operation ids would be a second, worse composer
and would not know a route's method, its permission, or that two of the lanes
mount conditionally. The test FAILS on a stale file rather than rewriting it, so a
change to what the engine offers arrives as a diff somebody reads.
