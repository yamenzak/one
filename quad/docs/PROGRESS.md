# Progress

kind: progress

**What exists today. Read this after [PLAN.md](PLAN.md) §1–§3 and
[DECISIONS.md](DECISIONS.md), and nothing else is required to resume the work.**

⚠️ **THE STAGE TABLE IS THE CONTRACT AND `shipped` IS LOAD-BEARING.** A stage may
not be marked shipped while any `DEFER(quad-N)` marker in the tree names it —
`scripts/docs.test.mjs` fails the build if one does. That is the only reason a
reader can trust this table instead of re-reading the code.

## Stages

| # | Stage | Status |
|---|---|---|
| 0 | Ground — workspace, docs, guard registry, standards | shipped |
| 1 | Kernel — entities, declarations, gate algebra, problems | shipped |
| 2 | Directory + placement | shipped |
| 3 | Runtime — manifest → live worker | shipped |
| 4 | Identity + tenancy | shipped |
| 5 | Surface — HeroUI shell, nav, sky, rendered settings | shipped |
| 6 | Money — plans, entitlements, credits, jobs | shipped |
| 7 | Services — ai and notify over RPC | building |
| 8 | Vault + legal | not started |
| 9 | Kova on Quad | not started |

## What is built

**`@quad/kernel` — the whole declaration surface, and it is pure.** Twenty-one
files, no I/O, no bindings, no React; every rule in it is provable with no
fixture at all.

- `tenancy.ts` — accounts, tenants, enablement, placement, standing, and the
  rule that refuses a tenant on a shard that cannot hold it.
- `field.ts` · `collection.ts` · `operation.ts` — what a value is, what a thing
  an app keeps is, and the one declaration that carries every cross-cutting
  concern (D12).
- `access.ts` · `gate.ts` — permissions, custom roles, and the seven gates in
  the order that decides which sentence somebody is shown first.
- `entitlement.ts` · `credit.ts` — the plan → grandfathered → adjusted → clamped
  walk, and the reserve that is a ceiling on revenue rather than an estimate.
- `notify.ts` · `setting.ts` · `flag.ts` — the two-level notification policy
  addressed by permission, the three settings screens, and the kill switch a
  tenant cannot beat.
- `vault.ts` · `legal.ts` — consent as the ceiling and a grant as the specific,
  and a processing record derived rather than written.
- `job.ts` · `brand.ts` · `guide.ts` · `ai.ts` — work nobody watches, a theme
  that cannot be made unreadable, a checklist derived from events, and one lane
  whatever a provider calls it.
- `manifest.ts` — the composition. Everything above, cross-checked in one pass,
  and a manifest that does not compose refuses to boot.

**`@quad/runtime` — the directory, the shards, and a schema nobody versions.**
The only code that touches a binding.

- `directory.ts` — one global D1: accounts, tenants, enablement, the membership
  INDEX (never a grant), shards and what each has applied. Creating a tenant
  provisions nothing: a row and a placement.
- `schema.ts` — the schema is DERIVED from the collections and stamped with a
  hash of itself, so nobody bumps a version and forgets. A field added to a
  collection is found by asking `pragma_table_info` and added on the next boot,
  on a database whose history nobody knows.
- `records.ts` — writes built from the declaration with values bound, the scope
  column written by the platform rather than the caller, and an erasure cascade
  walked from `scope` instead of a hand-written list.
- `sql.ts` · `handles.ts` — the one place an identifier is interpolated, and the
  shard id → binding derivation that throws rather than improvising.

- `compose.ts` — a manifest becomes a surface. One collection produces five
  operations, their routes, their permissions and their quota, and a generated
  operation is indistinguishable downstream from a written one. Composition is
  lazy and memoised per app (D4).
- `serve.ts` — one request, one path: the door, the tenancy, the replay, all
  seven gates in the kernel's order, the handler, the audit entry, the refusal.
  A handler is given its own tenant's database, who is asking, the time and a
  way to refuse — never the request, the env or a binding.
- `audit.ts` — the entry is written by the runtime, for successes and refusals
  alike, and a replay is answered before anything is spent.
- `door.ts` (kernel) — the host IS the tenancy: five doors, an unrecognised host
  is nothing rather than a default, and a workspace can never hold a label that
  is infrastructure.

**`@quad/hello` — the smallest complete app, and the reference.** A manifest and
nothing else: no router, no schema, no migration, no gate call, no audit call.
It declares every cross-cutting concern on purpose, because the next app is
copied from it and anything absent here is absent everywhere.

- `identity.ts` — email codes and sessions. A session is a ROW, not a signed
  claim, because a signed token cannot be revoked before it expires and "sign
  out everywhere" has to mean something. A code is stored as a hash, spent
  whether the guess was right or wrong, and rate-limited per address.
- `membership.ts` · `member-ops.ts` — the roster lives in the tenant's own
  shard and the directory only indexes it. Every app gets `member.list`,
  `member.invite`, `member.role` and `member.remove` without declaring them,
  because the two doors that bound an invitation must be bounded once rather
  than per product.
- `personal.ts` — the operations about yourself, which resolve no workspace:
  sign in, sign out, who am I, make a workspace, leave one. Deliberately outside
  the standing gate, because leaving must never be something an unpaid invoice
  can prevent.

⚠️ **PASSKEYS ARE NOT BUILT.** Sign-in is an emailed code. There is deliberately
no `credential` table waiting for one: a table nothing writes, behind a
capability nothing implements, is the exact shape this framework exists to
refuse — it reads as built and passes every test.

**`@quad/web` — the screens nobody writes.** HeroUI v3, router-free.

- `shell.tsx` — the crown, a desktop sidebar and a bottom island of at most five
  (D10). A destination somebody cannot reach is not drawn: a nav item leading to
  a 403 is a promise the product does not keep.
- `settings.tsx` · `policy.tsx` · `console.tsx` · `guide.tsx` — the three
  settings screens, the two-level notification policy, the flag console, the
  plan shelf, the onboarding checklist and help. Every one rendered from the
  declarations; no app writes a screen.
- `theme.ts` — a workspace's branding is a handful of CSS variables in HeroUI's
  own names, and the ambience behind every page derives from those same tokens.
  A page declares a sky by NAME, never by colour, so a brand change reaches
  every background with nothing else edited.
- `field.tsx` — a declared field becomes a control, and a stored secret is never
  rendered back.

**Money — one workspace, several products, one bill.**

- `billing.ts` — a subscription is per PRODUCT and the account is per BUSINESS.
  The plan a workspace is on is a fact about a product; the card, the balance
  and the invoice are facts about the business, and conflating them is what
  makes the second product a second bill. Grandfathering and an operator's
  adjustment are separate columns because they want opposite rules.
- `credits.ts` — one wallet, whatever product spends from it, with the ledger
  carrying which one did. The hold is taken in the statement that checks it, so
  two concurrent calls cannot both pass the same balance check.
- `jobs.ts` — every run recorded, successes and failures alike, and the console
  reads the LAST run: a job that is scheduled tells you nothing, a job whose
  last run was three days ago has stopped.
- `dunning.ts` (kernel) — the ladder, anchored on one timestamp and derived on
  every read. Arrears take writes, never reads, and never the ability to leave.
- `locate.ts` — one function turns a door into everything a request needs, so a
  deployment cannot wire a gate to read something else.
- `web/money.tsx` — the bill, the wallet with its per-product breakdown, and the
  job console.

The guard registry, its eleven checks, and the standards that bind them.

## Decisions, and how well each is defended

<!-- generated: node scripts/inventory.mjs decisions -->
| # | Decision | Guarded by |
|---|---|---|
| D1 | The tenant is primary; an app is a capability switched on for it | 3 |
| D2 | The name is Quad; packages are `@quad/*` | 2 |
| D3 | One worker on the request path; heavy work splits over RPC service bindings | 1 |
| D4 | Composition is lazy: a request composes the app it is for, and no other | 1 |
| D5 | Storage is placed, not owned. The directory carries every cross-tenant fact | 3 |
| D6 | Jurisdiction is a workspace fact, derived from the business's country | 1 |
| D7 | HeroUI v3 is the component layer, and its components are not restyled | 3 |
| D8 | Declarations are typed object literals; not decorators, not a custom format | 2 |
| D9 | Libraries encode decisions; we write invariants | 1 |
| D10 | Five primary destinations, maximum | 2 |
| D11 | The vault is encrypted rows in the shard, keyed by a destroyable salt | 3 |
| D12 | Every cross-cutting concern is a field on a declaration, never a call site | 27 |
<!-- /generated -->

⚠️ **A DECISION WITH NO GUARD IS A PREFERENCE**, and every one of the twelve now
has at least one. D8 and D9 were the two that did not, both being about how code
is written rather than what it does — `scripts/declarations.test.mjs` is what
closed them: no decorators, a builder that returns its literal untouched, no
classes in the kernel, and a kernel dependency list where each entry states what
the library decides FOR us.

## Every guard, live and owed

<!-- generated: node scripts/inventory.mjs guards -->
| Guard | Protects | What breaks without it |
|---|---|---|
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
| `the-framework-name-is-reserved-inside-the-framework` | D2 | `quad` meaning four different things inside the thing called Quad |
| `no-heroui-component-is-restyled` | D7 | consistency that is maintained by care rather than enforced, which lasts until the first hurried screen |
| `no-more-than-five-primary-destinations` | D10 | a bottom bar that stopped being tappable and became a menu |
| `every-declaration-reaches-a-surface` | D12 | a mechanism built, tested and wired with nowhere a person can look — every suite green |
| `every-surface-control-changes-behaviour` | D12 | a switch somebody turns on that does nothing, so they stop watching the thing it promised |
| `no-handler-raises-its-own-cross-cutting-concern` | D12 | a concern an app can forget, forgotten invisibly — no error, no failing test, a capability that silently does not apply |
| `no-cross-tenant-query-fans-out-over-shards` | D5 | an operator console that gets slower with every shard, until the sweep it runs times out |
| `composition-is-lazy` | D4 | cold start growing with the catalogue, until the catalogue that was meant to grow cannot |
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
| `a-stored-secret-is-never-rendered-back` | D11 | a live credential handed to every script in the page and to whatever the browser saved |
| `a-destination-nobody-can-reach-is-never-drawn` | D10 | a nav item that leads to a 403, which the person cannot tell from something simply broken |
| `branding-is-tokens-and-never-a-stylesheet` | D7 | a workspace able to break its own customers' screens on our infrastructure, and to make a page look like something it is not |
| `one-workspace-with-two-products-pays-one-bill` | D1 | a customer of two products becoming two customers - two cards, two renewal dates, two companies as far as they can tell |
| `a-reserve-is-a-ceiling-on-revenue` | D12 | every unit an estimate fails to anticipate charged to a customer instead of absorbed, or absorbed silently on every call |
| `a-hold-is-taken-in-the-statement-that-checks-it` | D12 | two concurrent calls both passing the same balance check, and a balance that went negative long after the calls that did it |
| `arrears-take-writes-and-never-reads` | D12 | a business locked out of its own records over an unpaid invoice, which is holding their data hostage |
| `a-signup-in-progress-is-never-read-as-arrears` | D12 | a brand-new workspace held read-only over an invoice that never existed, in its first minute |
| `grandfathering-and-an-adjustment-are-separate-columns` | D12 | give this workspace ten seats becoming a one-way door whose only reverse discards what they were originally sold |
| `a-vault-fact-is-never-stored-by-an-app` *(owed)* | D11 | an app writing the vault's own tables directly, so a fact exists with no grant, no consent record and no way to shred it |
| `no-service-call-is-made-over-fetch` *(owed)* | D3 | a wrong payload becoming a production error where it had been a compile error |
<!-- /generated -->

## Commands

```
pnpm quad:typecheck    every package
pnpm quad:test         every suite
pnpm quad:gate         the guards: docs, registry, layers
node quad/scripts/docs.test.mjs --write    refresh the generated blocks above
```
