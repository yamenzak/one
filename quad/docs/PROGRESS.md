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
| 3 | Runtime — manifest → live worker | building |
| 4 | Identity + tenancy | not started |
| 5 | Surface — HeroUI shell, nav, sky, rendered settings | not started |
| 6 | Money — plans, entitlements, credits | not started |
| 7 | Services — ai and notify over RPC | not started |
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

The guard registry, its six checks, and the standards that bind them.

## Decisions, and how well each is defended

<!-- generated: node scripts/inventory.mjs decisions -->
| # | Decision | Guarded by |
|---|---|---|
| D1 | The tenant is primary; an app is a capability switched on for it | 1 |
| D2 | The name is Quad; packages are `@quad/*` | 1 |
| D3 | One worker on the request path; heavy work splits over RPC service bindings | 1 |
| D4 | Composition is lazy: a request composes the app it is for, and no other | 1 |
| D5 | Storage is placed, not owned. The directory carries every cross-tenant fact | 3 |
| D6 | Jurisdiction is a workspace fact, derived from the business's country | 1 |
| D7 | HeroUI v3 is the component layer, and its components are not restyled | 1 |
| D8 | Declarations are typed object literals; not decorators, not a custom format | 2 |
| D9 | Libraries encode decisions; we write invariants | 1 |
| D10 | Five primary destinations, maximum | 1 |
| D11 | The vault is encrypted rows in the shard, keyed by a destroyable salt | 2 |
| D12 | Every cross-cutting concern is a field on a declaration, never a call site | 14 |
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
| `no-more-than-five-primary-destinations` | D10 | a bottom bar that stopped being tappable and became a menu |
| `no-cross-tenant-query-fans-out-over-shards` | D5 | an operator console that gets slower with every shard, until the sweep it runs times out |
| `a-declaration-is-a-literal-a-script-can-walk` | D8 | a declaration that has to be executed before it can be read, so every generated surface stops being derivable |
| `a-library-decides-it-does-not-rule` | D9 | one of our own rules living inside somebody else's package, re-learned from their release notes |
| `a-notification-nobody-can-receive-is-refused` | D12 | a message switched on in the policy screen that never arrives, so people stop trusting the ones that do |
| `a-switch-nothing-is-behind-is-refused` | D12 | somebody turning on a control that does nothing, and no longer watching for the problem it promised to solve |
| `everything-sold-is-withheld-somewhere` | D12 | money taken for a capability every customer already has, failing in the generous direction so nobody reports it |
| `a-sensitive-fact-is-never-an-ordinary-column` | D11 | somebody's health record in a product table, outside consent, outside the grant log and outside crypto-shredding |
| `erasure-follows-a-column-a-declaration-named` | D12 | a deletion request that reports success and leaves the rows, because the sweep had nothing to follow |
| `a-schema-runner-never-migrates-destructively` | D12 | a DROP running itself on every shard at 3am because somebody edited a declaration |
| `an-identifier-that-is-not-a-name-never-reaches-a-statement` | D8 | a generated schema built from something a request supplied, which is the injection this whole design forecloses |
| `no-heroui-component-is-restyled` *(owed)* | D7 | consistency that is maintained by care rather than enforced, which lasts until the first hurried screen |
| `every-declaration-reaches-a-surface` *(owed)* | D12 | a mechanism built, tested and wired with nowhere a person can look — every suite green |
| `every-surface-control-changes-behaviour` *(owed)* | D12 | a switch somebody turns on that does nothing, so they stop watching the thing it promised |
| `no-handler-raises-its-own-cross-cutting-concern` *(owed)* | D12 | a concern an app can forget, forgotten invisibly — no error, no failing test, a capability that silently does not apply |
| `a-vault-fact-is-never-stored-by-an-app` *(owed)* | D11 | an app writing the vault's own tables directly, so a fact exists with no grant, no consent record and no way to shred it |
| `composition-is-lazy` *(owed)* | D4 | cold start growing with the catalogue, until the catalogue that was meant to grow cannot |
| `no-service-call-is-made-over-fetch` *(owed)* | D3 | a wrong payload becoming a production error where it had been a compile error |
<!-- /generated -->

## Commands

```
pnpm quad:typecheck    every package
pnpm quad:test         every suite
pnpm quad:gate         the guards: docs, registry, layers
node quad/scripts/docs.test.mjs --write    refresh the generated blocks above
```
