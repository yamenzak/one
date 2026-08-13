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
| 0 | Ground — workspace, docs, guard registry, standards | building |
| 1 | Kernel — entities, declarations, gate algebra, problems | building |
| 2 | Directory + placement | not started |
| 3 | Runtime — manifest → live worker | not started |
| 4 | Identity + tenancy | not started |
| 5 | Surface — HeroUI shell, nav, sky, rendered settings | not started |
| 6 | Money — plans, entitlements, credits | not started |
| 7 | Services — ai and notify over RPC | not started |
| 8 | Vault + legal | not started |
| 9 | Kova on Quad | not started |

## What is built

- `@quad/kernel` — `tenancy.ts`: accounts, tenants, enablement, placement, and
  the rule that refuses a tenant on a shard that cannot hold it.
- The guard registry, its three checks, and the standards that bind them.

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
| D8 | Declarations are typed object literals; not decorators, not a custom format | 0 |
| D9 | Libraries encode decisions; we write invariants | 0 |
| D10 | Five primary destinations, maximum | 1 |
| D11 | The vault is encrypted rows in the shard, keyed by a destroyable salt | 1 |
| D12 | Every cross-cutting concern is a field on a declaration, never a call site | 9 |
<!-- /generated -->

⚠️ **A DECISION WITH NO GUARD IS A PREFERENCE.** D8 and D9 are undefended today —
both are about how code is written rather than what it does, which is exactly the
kind that erodes without a check. Their guards are owed at the stage that first
makes them checkable.

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
| `no-heroui-component-is-restyled` *(owed)* | D7 | consistency that is maintained by care rather than enforced, which lasts until the first hurried screen |
| `no-more-than-five-primary-destinations` *(owed)* | D10 | a bottom bar that stopped being tappable and became a menu |
| `every-declaration-reaches-a-surface` *(owed)* | D12 | a mechanism built, tested and wired with nowhere a person can look — every suite green |
| `every-surface-control-changes-behaviour` *(owed)* | D12 | a switch somebody turns on that does nothing, so they stop watching the thing it promised |
| `no-handler-raises-its-own-cross-cutting-concern` *(owed)* | D12 | a concern an app can forget, forgotten invisibly — no error, no failing test, a capability that silently does not apply |
| `a-vault-fact-is-never-stored-by-an-app` *(owed)* | D11 | somebody's health record in a product table, outside consent, outside the grant log and outside crypto-shredding |
| `no-cross-tenant-query-fans-out-over-shards` *(owed)* | D5 | an operator console that gets slower with every shard, until the sweep it runs times out |
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
