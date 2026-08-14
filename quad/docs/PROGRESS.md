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
| 7 | Services — ai and notify over RPC | shipped |
| 8 | Vault + legal | shipped |
| 9 | Kova on Quad | shipped |
| 10 | One — the deployment and the Hub | shipped |

## What is NOT built, and where to pick it up

⚠️ **EVERY STAGE IN [PLAN.md](PLAN.md) §7 IS SHIPPED, WHICH IS NOT THE SAME AS
FINISHED.** The framework holds together end to end and refuses the whole class
of faults it was built to refuse; what it has not yet met is a customer. Naming
that here is the point of the document — the failure this framework is a
catalogue of is a thing that looks complete because nothing is red.

Honestly outstanding, in the order it will bite:

1. **Nothing is deployed to Cloudflare — but the workflow that would is built.**
   `.github/workflows/quad.yml` gates, provisions and deploys One; the only thing
   left is a run. The D1 ids in `quad/one/wrangler.jsonc` are placeholders, and
   the deploy SKIPS on them rather than shipping a worker bound to nothing —
   Actions → **Quad** → Run workflow with `provision` ticked is what creates the
   databases, writes their ids back and mints `AUTH_SECRET`.
   - ⚠️ **Two dashboard steps it cannot do**: the DNS records for
     `one.4dl.app` / `*.one.4dl.app`, and the two Worker routes. `wrangler.jsonc`
     declares no `routes` deliberately — declaring them makes `wrangler dev`
     rewrite the incoming Host, which collapses every door onto one.
   - ⚠️ **The isolation from the live product is a guard, not a habit.**
     `quad/scripts/inert.test.mjs` fails if One is registered in `apps.json` (the
     file all three legacy workflows derive their app list from), if its worker
     or database name collides with a live one, or if `ROOT` overlaps a route a
     paying tenant answers on. All five of those mutations were tried; all five
     fail the guard.
2. **Passkeys.** Sign-in is an emailed code. There is deliberately no credential
   table waiting for a ceremony — see the note under identity below.
3. **A workspace's own screens are components, not an application.** The Hub is
   real: the signpost, the sign-in, the workspace list and the wizard are screens
   a person opens (`quad/one-hub`). What no page assembles yet is the surface
   BEHIND a workspace's door — `@quad/web` renders every declared screen and both
   reference apps prove it against their real manifests, but the tenant door's
   shell is not built, and it is what needs the router the shared shell
   deliberately does not have.
   - ⚠️ **And the account door is thinner than it sounds, for a reason worth
     knowing.** It lists workspaces and nothing else, because the notification
     policy, the consent sheet, the audit of who looked and "your data" are all
     scoped to a workspace in this runtime — the preference row is per
     `(tenant, account)` and the vault lives on a shard. They belong to a
     workspace's own surface today. An account-WIDE version of any of them is a
     new account-scoped operation, not a screen somebody forgot to add.
4. **The service workers are contracts, not deployments.** `AiService` and
   `NotifyService` are the typed seam, and the runtime implements both — but they
   are called in-process today. Splitting them into bound workers is a
   `wrangler.jsonc` change and no code change, which is the property the seam was
   built for.
5. **Payment.** The bill is assembled and the ladder walks; nothing takes a card.
   That is a provider integration, and it is deliberately the last thing.
6. **The template.** A second app is copied from `apps/kova` today. A real
   `apps/_template` with the conformance tests that catch a bad copy is the
   cheapest thing on this list and the one that decides whether app #3 diverges.

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
- `chart/` — nine chart forms, five figures, and the arithmetic under them, as
  inline SVG with no library. `scale.ts` decides (a domain that includes zero for
  a length and excludes it for a slope, nice ticks, a mark capped at 24px, a
  stack that keeps each sign on its own side) and is TESTED, because a bar at the
  correct pixel for the wrong number looks exactly like one at the correct pixel
  for the right number. `palette.ts` splits the four colour jobs and settles the
  one that matters: **identity is the platform's and magnitude is the brand's** —
  the eight categorical hues are fixed, ordered, never cycled and validated to
  stay separable under protanopia and deuteranopia, so a workspace cannot recolour
  a chart into one a colourblind reader cannot use. The diverging poles are
  measured for the same reason and are deliberately NOT `--success`/`--danger`.
  `charts.tsx` draws; `figures.tsx` is the number a screen exists for, the delta
  beside it, and a meter. There is no pie and no second y-axis, and the API has
  nowhere to put either. `circles.tsx` is the round half, and it splits the jobs
  rather than offering the pie back: `Ring` for one ratio against a limit,
  `Rings` for up to three that do not sum, `DonutChart` for composition where the
  whole is the subject — five slices then `Other` — and `CompositionBar`, which
  answers the donut's question more accurately and is the one to reach for first.
- `layout.tsx`'s `PageCrown` — an inner page's header, where the page's name is
  the biggest thing on it at rest and comes back small beside the way out once it
  has scrolled away. **The glass is on the CONTROLS, never on the bar**: a
  full-width frosted strip has a boundary where the blur stops, which is a border
  by another name, and it is the thing the no-edges pass exists to remove.
- `state.tsx` — **the four outcomes, decided once**. Every surface that fetches
  can be waiting, empty, refused or full, and most products ship two of those
  because in development the request is instant and it succeeds. `Loaded<T>` has
  no value to seed it with, so `[]` cannot masquerade as "not yet"; `Await` makes
  the four-way choice in one place, in the one order that is right (trouble
  outranks emptiness, waiting outranks both); `Trouble` renders a kernel
  `Problem` and offers a retry only where `retryable` says one could work; and
  the placeholders are SHAPED — a row skeleton is `ROW.tap` tall, a chart
  skeleton is 320×120, because a placeholder of the wrong size adds a jump that
  would not otherwise have happened.
- `layout.tsx`'s frames — `Stack`, `Row`, `Grid`, `Columns`, `Rail`, `Cluster`,
  `Center`. A container that picks its own gap is a layout nobody designed: the
  Hub had twenty-three of them at four different values, each defensible, with
  nobody able to point at which was wrong.
- **The twelve ambiences are governed by [AMBIENCE.md](AMBIENCE.md)** — which
  of them a screen reaches for, at which of the three levels (app signature,
  screen kind, one lifted band), the colour and texture rules, and why `plain`
  is the default rather than a failure to choose.
- **The interface is monochrome and the data is not**, which is the palette's
  whole shape. `--accent` — what the library paints every control, switch and
  selected row with — is a VALUE at zero chroma, so the one coloured thing on a
  screen is by construction the thing that matters. A workspace's colour is
  `--brand`: the page, the surfaces and the ambience those controls sit on. Two
  things are pinned against it and both are the half people forget: `--focus`,
  because HeroUI defines it as the accent and a monochrome focus ring on a
  monochrome interface is where it is least findable; and `--data`, because a
  chart mark that measures would otherwise be grey, and grey already means
  de-emphasis on a plot.
- **Three kinds of motion and no fourth**, in `motion.ts`. A thing that ARRIVES
  uses HeroUI's own `enter` keyframe (`ARRIVE`), one that CHANGES uses a
  transition on a `MOTION` token, one that WAITS uses the library's `Skeleton` or
  `Spinner`. The block arrives, never its rows — twelve rows each on their own
  delay is the effect everybody builds once and nobody enjoys twice.

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

**Services — the work that leaves the request path.**

- `services.ts` — the contract is an INTERFACE both sides import, which is the
  whole reason the seam is RPC rather than `fetch`: a method renamed on one side
  fails to compile on the other. Generation is reserve → run → settle, with the
  reserve computed from the same text that is sent, and a failure releases the
  hold. The mock lane is gated on the environment structurally, because no test
  can check it — the suites run where mocking is correct.
- `inbox.ts` — the inbox, the two-level policy and the dispatch. The row is
  filed for everybody in the audience whatever the policy narrowed away: email
  and push are interruptions a person may refuse, the inbox is the record.
- `web/inbox.tsx` · `web/ai.tsx` — the bell, the inbox, and the screen that
  shows which model answers which lane. A previous platform had the schema, the
  Durable Object, the routes and sixteen dispatch sites with nowhere to look.

**The vault, and the record.**

- `runtime/vault.ts` — encrypted rows keyed by a per-subject salt, so erasure is
  ONE write and what it destroys is the only thing that could turn the
  ciphertext back into facts — here and in any backup that already left. Every
  look is recorded, refusals included, with no opt-out anywhere: "who looked at
  my health record, and when" is the question the design exists to answer.
- Consent is the ceiling and a grant is the specific; withdrawing is a timestamp
  rather than a deleted row, because the row is the evidence that the reads
  before it were lawful. A grant expires.
- `web/vault.tsx` · `web/legal.tsx` — the consent sheet, who looked, export and
  erasure (which says plainly what it cannot undo), the derived processing
  record, the documents and the sub-processors with their countries.

**`@quad/kova` — the first real product, as a manifest.** Six collections, three
handlers, and no infrastructure of its own: no router, no schema, no migration,
no gate call, no audit call, no settings screen, no billing code, no erasure
cascade. Thirty-eight routes derived, the roster and the inbox among them
without Kova declaring either. A client's conditions and weight are vault-backed,
because a health fact in a product table is outside consent, outside the grant
log and outside crypto-shredding.

**`@quad/one` — the deployment, and it is one file.** One worker answers every
door for every product (D3): adding a product is a line in `APPS` and a row in a
database — no worker, no domain binding, no provisioning workflow, no secret. It
applies the platform's tables once per isolate and AWAITS it, because a request
served while the schema is still being created answers "no such table" to
whoever happened to be first, which is a fault that appears once per deploy and
never reproduces. Everything else in the file is a value handed to `serve`.

- Its suite is the one a previous platform did not have, and that cost a day: an
  app shipped green from its deploy workflow while the auth factory threw in the
  first middleware, so every route answered 500 — `/health` included — and the
  page still loaded, because static assets never reach the worker. Nine tests,
  driving the real host topology through Miniflare, which preserves the Host
  exactly as the edge does.
- ⚠️ **The D1 ids in `wrangler.jsonc` are placeholders on purpose.** A deploy
  with them in place binds databases that do not exist.

**`@quad/one-hub` — the page a person opens.** The signpost, sign-in with an
emailed code, the workspace list, and the wizard that makes one — HeroUI v3 as it
ships, themed through tokens, nothing restyled.

- **No router, and that is a measurement.** Every screen is picked by two facts —
  which door, and whether anybody is signed in — neither of which is in the path.
  `pickScreen` is pure, so "every door resolves to a screen" is a test rather
  than a walk through five hostnames; a state that resolves to nothing renders a
  blank page, which is the same picture as a page that failed to load.
- **The page never classifies its own hostname.** `/health` reports the door,
  because the runtime already decided it with the reserved labels, the one-label
  rule and the custom-domain test. A second classifier in the browser is a second
  copy of all three.
- **One door to the API**, with the expired-session decision made in it once —
  and `null` rather than `[]` until an answer arrives, so a failed load is never
  rendered as an empty one.

The guard registry, its checks, and the standards that bind them.

## Decisions, and how well each is defended

<!-- generated: node scripts/inventory.mjs decisions -->
| # | Decision | Guarded by |
|---|---|---|
| D1 | The tenant is primary; an app is a capability switched on for it | 3 |
| D2 | The name is Quad; packages are `@quad/*` | 2 |
| D3 | One worker on the request path; heavy work splits over RPC service bindings | 6 |
| D4 | Composition is lazy: a request composes the app it is for, and no other | 1 |
| D5 | Storage is placed, not owned. The directory carries every cross-tenant fact | 5 |
| D6 | Jurisdiction is a workspace fact, derived from the business's country | 1 |
| D7 | HeroUI v3 is the component layer, and its components are not restyled | 25 |
| D8 | Declarations are typed object literals; not decorators, not a custom format | 2 |
| D9 | Libraries encode decisions; we write invariants | 1 |
| D10 | Five primary destinations, maximum | 4 |
| D11 | The vault is encrypted rows in the shard, keyed by a destroyable salt | 10 |
| D12 | Every cross-cutting concern is a field on a declaration, never a call site | 39 |
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
| `an-icon-control-is-a-circle` | D7 | a crown of four controls at three different widths, because a button with only a glyph in it still lays out w-fit px-4 |
| `a-row-of-equals-shares-its-width` | D7 | a nav of four destinations at four widths, with the current one inheriting whichever width its own label happened to make |
| `the-nav-marks-here-by-moving` | D10 | a marker that appears where the sliding one is still arriving, because a filled per-item variant can only switch on and off where one element can travel |
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
| `the-framework-name-is-reserved-inside-the-framework` | D2 | `quad` meaning four different things inside the thing called Quad |
| `no-heroui-component-is-restyled` | D7 | consistency that is maintained by care rather than enforced, which lasts until the first hurried screen |
| `no-more-than-five-primary-destinations` | D10 | a bottom bar that stopped being tappable and became a menu |
| `every-declaration-reaches-a-surface` | D12 | a mechanism built, tested and wired with nowhere a person can look — every suite green |
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
| `micro-texture-dies-in-light` | D7 | fine dark fibres over light paper behind a hero — which a person described, accurately, as dusty and dirty |
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
| `a-persons-own-records-are-theirs-by-construction` | D11 | somebody's logbook readable by anybody in the workspace, because a handler forgot a WHERE |
| `a-seat-ceiling-only-counts-roles-that-cost-a-seat` | D12 | a studio on the smallest plan unable to add the customers it exists to serve, refused for staff seats it was not asking for |
| `the-hub-has-one-door-to-the-api` | D12 | an expired session that does not look expired — every screen showing the empty state its failed load produced, and every save failing into a toast |
| `the-browser-never-classifies-its-own-door` | D3 | a page offering a control the runtime refuses, answered as a 404 with nothing on it to explain why |
| `every-screen-the-picker-names-is-drawn` | D10 | a blank page, which is the same picture as a page that failed to load — so somebody reloads for a minute and then gives up |
| `a-code-that-could-not-be-sent-holds-no-cooldown` | D12 | somebody locked out for a minute waiting on a code that was never delivered, told they are asking too often |
| `the-deployment-answers-on-every-door-it-serves` | D3 | a deploy reporting green while the isolate throws in its first middleware — the page still loads, because static assets never reach the worker |
| `quad-is-off-the-production-deploy-path` | D3 | the framework shipping to the account a paying tenant is served from, selected by a workflow that derives its app list from a file somebody tidily added it to |
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
<!-- /generated -->

## Commands

```
pnpm quad:typecheck    every package
pnpm quad:test         every suite
pnpm quad:gate         the guards: docs, registry, layers
node quad/scripts/docs.test.mjs --write    refresh the generated blocks above
```
