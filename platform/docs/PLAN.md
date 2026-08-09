---
kind: plan
---

# ONE — the platform, and the decisions that shape it

> **Status: PLAN, and stages 0–3 are partly built.** `platform/README.md` is
> generated and says which. This is the design for a new
> framework directory that becomes the home of every 4DL app and the standard
> for future ones. It supersedes nothing yet: `packages/@4dl/*` and `apps/*`
> remain the shipping system until a stage below says otherwise.
>
> **[MANIFEST.md](MANIFEST.md) is what an app actually declares** — the full
> surface, and §9 there is the split between what must exist in the types before
> the first table and what is safe to add later. It is the specification stage 0
> implements.
>
> **[UI.md](UI.md) is the interface language** — Northlight: what a tenant may
> theme and why the list is closed, how furniture is lit by its ground rather
> than painted, semantics on branded surfaces, the state matrix, one
> choreographer, the overlay ladder and live surfaces. It is what §3.6's
> renderer column actually contains.
>
> **[STANDARDS.md](STANDARDS.md) is how we write while building it** — the
> invariant-not-the-incident rule, deferral markers, help, release notes and the
> per-app test budget. Read it before the first commit; it governs `platform/**`
> absolutely and the legacy tree not at all.
>
> [../README.md](../README.md) is the directory map.
>
> Read [PLATFORM.md](../../PLATFORM.md) for what exists today, and
> [docs/PLATFORM-AUDIT.md](../../docs/PLATFORM-AUDIT.md) for the three-app
> assessment this grew out of. Those two are the evidence; this is the response.

---

## 0. What this is, and what it is not

**It is:** one framework that owns the runtime, the data model, the surface
(HTTP + AI + webhooks), the chrome and the operations story, driven by a typed
manifest per app, with the apps living inside it.

**It is not a rewrite of what the apps DO.** Kova's TDEE maths, Scena's
`position(t) = (t − T0) mod cycleLength`, Tessa's sterilisation logic are pure
modules with tests and they move across unchanged. What is being rewritten is
everything around them — and "everything around them" is, measured below, about
four fifths of the code.

**The one-sentence goal:** a new app should be a manifest, a schema, a handful
of pure domain modules and the screens that are genuinely its own — and be
production-ready on day zero, with billing, auth, permissions, notifications,
help, legal, offline, whitelabel, an API, AI tool-calling and an operator
console it did not write.

---

## 1. What the three apps measured (2026-08-09)

Not estimates. `wc -l` over `src`, `grep` over route registrations and DDL.

| | worker | SPA | routes | tables | notes |
|---|---:|---:|---:|---:|---|
| Kova | 19,070 | 34,468 | 489 | 35 | B2B **and** B2C (client packages), production tenants |
| Scena | 16,100 | 27,212 + 3,738 player | 379 | 36 | device door, 7 DOs, offline player, second worker |
| Tessa | 6,803 | 6,641 | 109 | 12 | single plan, no customer rail |
| template | 2,114 | 2,041 | — | — | the current "new app" starting point |
| **`packages/@4dl/*`** | **46,764** | | | 39 | fourteen packages |

**~165,000 lines. ~977 route registrations. ~122 tables.**

Three numbers matter for planning:

- **Tessa is 13,444 lines and does almost everything a SaaS must do.** That is
  roughly the floor for a real product on today's platform. Most of it is not
  Tessa.
- **Kova's SPA is 34,468 lines — bigger than its worker, and bigger than every
  shared package except `@4dl/ui`.** The UI is where the mass is, and the UI is
  where the inconsistency you keep noticing lives. A platform that shares the
  backend and not the screens shares the easy half.
- **`packages/ui` is already 10,887 lines and product-agnostic.** The renderer
  is not starting from zero; it is starting from a component library that has
  already had the product vocabulary argued out of it.

### What the audit found, restated as design pressure

The three-app audit's headline was not "a missing mechanism". It was **a shared
capability that shipped, and an app that did not mount it** — eight instances,
the sharpest being that `otpSendGuard`, the only gate in front of the emailed
sign-in code, was mounted by one app out of three. `capability-reachable.test.mjs`
turned that class into a guard; step 5.2 of the audit found a ninth instance
(`apps/_template` had a plan catalog and no route to enter a Stripe key) within
a day of widening it.

**That is the whole argument for a manifest.** Wiring that must be remembered is
wiring that will be forgotten, and a guard that catches it afterwards is a worse
version of never being able to express it wrong.

---

## 2. The four decisions

Answered 2026-08-09. Each carries consequences that are cheap now and expensive
later.

### 2.1 UI: declarative shell + code screens

The manifest owns the shell, nav, permissions, plans, settings, admin, and
generic collection/document scaffolds. Product screens are React on the shared
kit.

**Why not fully declarative.** A renderer that tries to express Scena's `rAF`
playout loop, Kova's camera-and-pose body scan or Tessa's cycle timelines grows
a registered-widget escape hatch, and the escape hatch becomes the real API
within two quarters. You would have paid for a renderer and be writing React
inside it.

**Why not wiring-only.** That is what exists today. It shares the backend and
leaves 34,468 lines of Kova SPA to drift against 27,212 of Scena's, which is
precisely the inconsistency this project is for.

⚠️ **This decision is only safe if the boundary is enforced, not documented.**
§3.6 has the rule and the guard. Without the guard this option decays into
wiring-only within a year, one "just this once" at a time.

### 2.2 The fourteen `@4dl/*` packages are absorbed and deleted

The framework rewrites them as its own modules. `packages/@4dl/*` is deleted
when the last app leaves.

**The cost is real and should be stated once:** 46,764 lines of working,
tested, argued-over code, much of which is *correct* and carries scars this
repo paid for. None of it is thrown away — it is the specification. The
`@4dl/billing` dunning ladder, `@4dl/tenancy`'s five doors, `@4dl/purge`'s
derived erasure, `@4dl/ai`'s reserve-is-a-ceiling arithmetic: each is a solved
problem whose solution moves, with its tests, into a module that no longer has
to negotiate with an app about who owns which table.

**The benefit is the one thing "wrap" cannot give:** the seams that exist purely
because an app might have a different shape (`syncCatalog` injected because one
app stored cents; `defaultSubscription` because one app parked on `incomplete`;
`materialiseOnRead` because one app wrote a row on read) all collapse. Every one
of those seams is a place two products can still differ, which is what you asked
to stop.

### 2.3 Kova migrates first

⚠️ **This is the highest-risk of the four options and I want the risk named
plainly, once, before the plan accommodates it.** Kova is the only app with
production tenants. It is also the largest (53,538 lines across two packages),
the only one with a B2C rail underneath the B2B one, and the one whose data
model is most entangled (35 tables, `requireClientAccess` on every coaching
route as a security invariant).

Migrating it first means the framework's first real consumer is also the one
where a mistake reaches paying customers.

**I am not arguing against it** — it is defensible, and it has one genuine
advantage the alternatives do not: Kova is where the inconsistencies you want
gone actually live, so any other first mover proves the framework against a
problem you were not complaining about. But the plan below buys that choice back
with three things that are not optional:

1. **Kova-on-ONE is built to parity in parallel, never in place.** The shipping
   Kova keeps shipping from `apps/api` + `apps/app` throughout.
2. **The cutover is rehearsed against a copy of production**, repeatedly, until
   the rehearsal is boring.
3. **The parity gate is the screenshot suite**, not a checklist. `pnpm shots`
   already photographs every surface at phone/desktop × light/dark from a seeded
   studio. Run it against both stacks and diff. That is the only parity check
   that scales to a 34,468-line SPA.

§7 has the mechanics.

### 2.4 One 4DL account — one credential, separate sessions, no IdP

One person, one identity, memberships in many tenants across many products.

⚠️ **"SSO" is three separable things, and you want two of them.** Conflating
them is what makes this look like a large project; separated, most of it is a
configuration change.

| | Build it | What it buys |
|---|---|---|
| **Single account** — one `user` record, shared | **yes** | the data & subscription centre, one avatar, one export, one erasure, cross-sell |
| **Single credential** — passkey RP = `4dl.app` | **yes** | first sign-in to a second product is one biometric tap, on that product's own branded screen |
| **Single session** — one cookie across products | **no** | nothing needed, in exchange for an XSS in signage reaching a health record |

#### Why there is no `id.4dl.app`, and no redirect to hide

Google runs `accounts.google.com` because its properties sit on **different
registrable domains** — `google.com`, `youtube.com`, `android.com`. Neither
cookies nor WebAuthn can span those, so a central origin and a redirect dance is
the only option available; "headless" is Google concealing machinery it cannot
avoid.

Every 4DL app is a subdomain of **one** registrable domain. `rpIdFor`'s own
comment states the consequence: *"the RP ID may be any registrable-domain suffix
of the origin — and it is the whole reason cross-tenant identity works here at
all."* Raising the RP from `<app>.4dl.app` to `4dl.app` extends that sentence
from cross-tenant to cross-product, and the ceremony still runs **on the app's
own origin**. No redirect, no brand mismatch, nothing to conceal. This design is
more headless than the one it is imitating, because there is no step to hide.

⚠️ **The trade being made knowingly.** `rpIdFor` documents, as a load-bearing
property, that today's scoping *"does not leak sideways: `kova.4dl.app` is not a
suffix of `otherapp.4dl.app`, so an unrelated app sharing the `4dl.app` zone
cannot assert this RP ID and cannot be offered these credentials."* Raising the
RP reverses that deliberately. It is defensible because all four relying parties
are ours and one worker serves each — but it must be a decision recorded here,
not a side effect of an edit, and it means **anything third-party must never be
hosted under `4dl.app`.**

#### The migration is additive

A credential bound to `<app>.4dl.app` keeps working on that app. New
registrations bind to `4dl.app` and work everywhere. Nobody is locked out, and
nobody is forced to re-register under duress. This requires per-credential RP ID
at verification time — a detail, but one to design in rather than discover.

#### Where identity lives, and why it stays cheap

A **shared identity D1, bound with the same id into every worker** — precisely
the pattern `PLATFORM_CONFIG` KV already proves in this repo. It holds `user`,
`passkey`, `account`, `verification` and the global tenant directory. It does
**not** hold sessions or memberships: those are about one product's tenants and
stay in that product's own regional database.

⚠️ **The property that makes a single global store viable: identity is read at
SIGN-IN; sessions are read on EVERY request.** Each app's session row carries a
denormalised snapshot of the user (id, email, name, avatar), so per-request
validation never leaves the region. The shared store is authoritative and
low-traffic; a profile change propagates on next sign-in or via a version stamp.
Get this backwards and you have put a cross-region round trip on the hot path of
every request in the platform.

#### Custom domains are excluded, and that is correct

`coaching.byshujaa.com` has no suffix relationship with our root, so it gets a
host-scoped RP and its own session. That is a WebAuthn invariant rather than a
choice — and it is also exactly what whitelabel demands: a studio's client is
never bounced to a domain they do not recognise, which would read as phishing.
Kova's B2C clients live on studio subdomains and custom domains and never see
"4DL" at all.

#### GDPR gets better

One identity means one erasure request, one export, one place a person manages
what they have. That is the Google-style data centre from your list, and it is
only buildable on a single account record.

---

## 3. The shape

### 3.1 Directory and naming

The repository root is already `one`, so a directory called `one/` nests badly
(`/home/user/one/one/kova`). Recommendation:

```
platform/            # the new world. Package scope @one/*
  kernel/            # @one/kernel  — runtime, identity, tenancy, standing, config
  data/              # @one/data    — collections, ledgers, files, jobs, search
  surface/           # @one/surface — operations → routes + tools + webhooks + OpenAPI
  ui/                # @one/ui      — primitives, chrome, the renderer
  cli/               # @one/cli     — manifest lint, codegen, provisioning, shots
  kova/              # @one/kova
  tessa/             # @one/tessa
  scena/             # @one/scena
```

`@one/kova` reads as "one/kova" everywhere it matters (imports, package names,
CI job names) without the path being silly. **Decide this before the first
import is written** — it is free today and a repo-wide rename later.

### 3.1a How this ships — trunk-based, and safe because of `apps.json`

**No long-lived branch, and no fork.** Short-lived branches, small pull
requests, straight into `main`.

That sounds reckless for a rewrite and is not, because this repository already
solved it: **`deploy.yml` derives its app list from `apps.json`**, so a directory
absent from that registry cannot be selected by `affected.mjs` and cannot be
shipped. `platform/` is therefore **inert by construction** — it compiles, its
tests run in CI, and it deploys nothing. `apps/_template` is the standing proof:
in the repo, tested on every push, never deployed.

The alternative is a months-long branch carrying a rewrite of 165,000 lines,
drifting against a moving `main`, with no CI signal until a big-bang merge. That
is risk #1 in §9, and small pull requests into an inert directory avoid it
outright.

⚠️ **Two things keep the inertness structural rather than incidental**, and both
are already in place: `platform/*` is in `pnpm-workspace.yaml` so turbo actually
runs its tests, and `discoverWorkerDirs` walks `platform/` as well as `apps/` so
a `wrangler.jsonc` there cannot ship unregistered. Without the first, a package's
tests are silently not run at all; without the second, a worker could deploy with
nothing saying why.

`pnpm one:test`, `one:typecheck` and `one:gate` run the platform alone, so a
platform change never waits on three apps.

### 3.2 Six layers, and what may depend on what

```
L5  App          product screens, product domain modules
L4  Renderer     shell, nav, collection views, settings, admin, whitelabel
L3  Surface      operations → HTTP + AI tools + webhooks + audit + OpenAPI
L2  Data         collections, ledgers, files, jobs, search
L1  Kernel       identity, tenancy, doors, regions, standing, entitlements, config
L0  Runtime      Cloudflare bindings — bound by the manifest, touched by nobody
```

Downward only, no skipping more than one layer, and **L0 has exactly one
consumer**. An app that reaches `env.DB` has left the platform; the guard says
so. This is `storage-chokepoint.test.mjs`'s rule generalised from R2 to every
binding, and the reason is the same: an object written behind the ledger is
invisible to the quota and to erasure, forever, and nothing else notices.

### 3.3 The manifest

**TypeScript, not JSON.** You asked for "powerful linting and enforcing to
ensure everything is production ready from day 0", and the majority of that
description is `tsc`, which you already run and which costs nothing. A JSON
manifest requires re-implementing autocomplete, refactor-safety, exhaustiveness
checking and cross-reference validation in a bespoke linter — and a bespoke
linter is a thing that has bugs, as `pnpm gate` discovered twice this month when
a widened guard's first two failures were the parser's rather than the apps'.

The rule: **typed TS authoring, JSON-serialisable subset for anything that
crosses a wire** (the tenant-visible changelog, the help index, the operator
console's view of the app). `one build` emits the serialised form; `one lint`
checks what types cannot.

**Several files, one namespace.** A single god-manifest for Kova would be
thousands of lines. `platform/kova/manifest/{app,plans,permissions,collections,
notifications,nav,legal,offline}.ts`, composed by one `defineApp()`. Composition
is a language feature here; that is the point of choosing a language.

**Versioned and content-hashed.** Every deploy stamps `manifestVersion` and a
hash. The diff between two versions is a real artifact — it drives the
tenant-facing changelog, the operator's "what changed", and the migration
check ("this deploy removes a plan two tenants are on").

**What it generates.** Not "describes" — *generates*, so drift is impossible:

| From the manifest | Generated |
|---|---|
| bindings | `wrangler.jsonc` — no hand-edited config, no placeholder-id class of bug |
| collections | DDL + schema module + scope declaration for erasure |
| operations | HTTP routes, AI tool catalog, webhook events, OpenAPI, typed client |
| permissions | typed keys, the role builder's vocabulary, the UI's gate helpers |
| plans + entitlements | catalog seed, Stripe sync input, the entitlement engine's registry |
| notifications | types, copy, channel matrix, the bell's registry |
| nav + collections | the shell, the routes, the screen index (which stops being hand-maintained) |
| legal | the documents, their versions, the acceptance ledger |
| offline | the precache list and the Background Sync policy |

⚠️ The screen index in `KOVA.md` Part III and `SCENA.md` Part III is maintained
by hand today, with a standing instruction to update it in the same commit. Once
nav is declared, it is generated. That is one whole category of documentation
drift deleted rather than policed.

### 3.4 ⚠️ One declaration, three transports — the highest-leverage idea here

This is the piece that makes half your list fall out for free, so it is worth
stating precisely.

You declare an **operation** once:

```ts
export const publishPlan = operation({
  id: "training.plan.publish",
  summary: "Publish a training plan to a client.",
  input:  z.object({ planId: id("plan"), clientId: id("client") }),
  output: z.object({ publishedAt: iso() }),

  permission:  "plan:publish",          // RBAC
  entitlement: "trainingPlans",         // what the tenant bought
  clientFlag:  "trainingPlans",         // what the CUSTOMER bought (B2C rail)
  scope:       (i) => ({ client: i.clientId }),   // row-level access
  meter:       { credits: 0 },

  audit:  (i) => ({ subject: i.planId, verb: "publish" }),
  emits:  ["plan.published"],

  async handler(ctx, input) { /* … */ },
});
```

The framework derives, from that one object:

- the **HTTP route**, with the five gates already applied
- the **AI tool** — same input schema, **filtered by the caller's permissions and
  entitlements at resolution time**
- the **webhook event** for tenant subscribers
- the **activity-log entry** on the document
- the **OpenAPI** entry and the typed client method
- the **optimistic-update contract** the renderer uses

⚠️ **The safety property that must be structural, not disciplined: the AI's tool
surface is the route surface masked by the caller.** Not a second list that is
kept in sync — a filter over one registry. Two registries is how you ship an
agent that can do more than the person operating it, and there would be no
failing test anywhere.

This single abstraction answers, from your list: ready CRUD and API endpoints,
AI tool-calling parity with the UI, ready webhooks, the unified activity log,
and the permission masking. Today none of the three apps has an external API,
tool-calling over its own surface, or a webhook dispatcher — the `integrations`
entitlement is `reserved: true` in Kova and enforced nowhere, and SPEC §11
promises a data export that does not exist.

### 3.5 Collections — the Frappe-shaped part

```ts
export const clients = collection({
  id: "client",
  label:   { one: "Client", many: "Clients" },
  scope:   { tenant: "tenant_id" },
  subject: true,                       // an erasure root in its own right
  naming:  { series: "CL-.YYYY.-.####" },
  docstatus: false,                    // draft/submit/cancel/amend, off here
  onDelete:  "archive",                // vs "purge"
  fields:  { /* typed, with per-field read/write permissions */ },
  views:   { list: { … }, grid: { … }, detail: { tabs: [ … ] } },
  activity: true,
  offline:  "cache",
  search:   ["name", "email"],
});
```

Derives the table, the erasure scope, full CRUD as operations (and therefore as
routes, tools and webhooks), the naming counter, the docstatus state machine with
amendment, soft-delete semantics, the activity table, and the list/grid/detail
screens.

**This is where the manifest actually pays.** Kova's clients, packages, foods,
exercises; Tessa's trays, cycles, loads, instruments; Scena's channels,
playlists, slides, feeds, ads — all collections. Estimated from the three screen
indexes: **75–80% of all surfaces are chrome or collection views.** The
remaining fifth is §5.

⚠️ **Docstatus is not free and should be opt-in per collection.** Frappe's
draft → submitted → cancelled → amended is exactly right for a sterilisation
cycle record and exactly wrong for a client profile. Making it universal is how
a framework starts enforcing limitations you have to hack around.

### 3.6 The renderer boundary, and the guard that holds it

**The renderer owns the chrome. The app owns the canvas.**
[UI.md](UI.md) is what the left column is made of.

| Renderer (manifest-driven) | App (React) |
|---|---|
| shell, nav, breadcrumbs, page header, tabs | the content region of a non-collection page |
| list / grid / detail / activity / settings / admin | bespoke visualisations, players, editors, camera |
| empty, loading, error, permission-denied, offline states | — |
| dialogs, sheets, drawers, popovers — and the *policy* for which | — |
| forms, filters, pagination, bulk actions, save lifecycle | — |
| toasts, confirmations, destructive-action patterns | — |
| animation, skeletons, disabled/busy states | — |

⚠️ **Enforced by `one lint`, failing the build**, on: an app defining a shell, a
dialog, a toast, an empty state or a form primitive; an app importing a raw
`<button>`/`<input>`; a route not declared in the manifest; a handler not going
through `operation()`; a `fetch` outside the door; a binding touched outside L0.

Every one of these has a working precedent in `pnpm gate` today —
`ui-ownership`, `api-door`, `save-lifecycle`, `storage-chokepoint`. The
difference is that they would now be *the framework's* rules rather than one
app's, and they would fail at `one lint` rather than in a script somebody has to
remember to widen.

---

## 4. The subsystems

Your list, answered. Where a row says **new**, no app has it today.

| Subsystem | Design | Source today |
|---|---|---|
| **Identity** | Shared identity D1 bound into every worker; passkey RP raised to `4dl.app`; sessions stay per-app and per-region. No IdP, no redirect (§2.4). | `@4dl/auth`, per-app RP |
| **Tenancy + doors** | Five doors kept — they are correct. Region added as a tenant property resolved at the host gate. | `@4dl/tenancy` |
| **Regions (EU/global)** | §4.1 — the hardest item on the list | **new** |
| **Standing + dunning** | One ladder, one set of rungs, per-app copy in the manifest. Reads never gated at any rung; leaving always allowed. | `@4dl/billing` + `@4dl/tenancy` |
| **Plans + entitlements** | Manifest-declared. Grandfathering (raise-only) and operator adjustment (absolute) stay two lanes — they want opposite rules. | `@4dl/billing` |
| **Feature flags** | One resolver, three layers (plan → grant → override), same gate shape for route, tool and UI. A flag that hides a tab but no route is a lint failure. | `@kova/domain` clientFlags |
| **Permissions + roles** | Granular keys from the manifest; a tenant-facing role builder over them; the AI tool filter reads the same resolution. | `@4dl/auth` grant algebra |
| **Billing rail** | One Stripe account, one webhook, event→app attribution, dead-letter for the unattributable. Already solved; moves as-is. | `@4dl/billing-rail` |
| **B2C / customer rail** | Kova's access economy generalised: packages, budgets that queue rather than sum, lapse ladder, redemption codes. Available to any app that declares it. | `@4dl/commerce` |
| **Ledger + metering** | One append-only ledger for every billable unit — AI credits, storage, seats, and a package's metered entitlements. Reserve → run → settle, where **settle caps at the reserve**. | `@4dl/billing` + `@4dl/ai` |
| **Storage** | One chokepoint, ledgered, quota-gated, erasure-derived. Content-hash keys stay possible (Scena needs them). | `@4dl/storage` |
| **Notifications** | Channel algebra (role × category → inbox / email / **web push**), one dispatch path, InboxDO. Push is new. | `@4dl/notify` |
| **Help centre** | Per-app docs from the manifest's nav, in-app search, support chat, ticketing. | **new** |
| **Versioning + changelog** | Manifest diff → tenant-visible release notes, with screenshots rendered by the existing Playwright shots suite. | **new** (shots exist) |
| **Settings** | Three scopes — tenant app settings, user preferences, operator console — all declared, all rendered. | partial |
| **Data & subscription centre** | Export, membership cancellation, tenancy close, erasure — one surface per person, across products. Only possible on unified identity. | partial |
| **Whitelabel** | Palette, logos, fonts, custom domains; reaches auth screens, error pages, emails, the PWA manifest and the offline shell. | `@4dl/ui` Branding |
| **PWA / offline** | Declared per collection (`offline: "cache" \| "queue" \| "none"`); app-shell precache + Background Sync replay. | Kova only |
| **AI** | Model catalog, metered generation, tool-calling over the operation registry, per-actor budgets. | `@4dl/ai` |
| **Legal** | ToS, privacy, cookies, DPA, sub-processors — versioned in the manifest, with an acceptance ledger per user per version. | **new** |
| **Jobs / cron** | Declared, per-tenant, idempotent, with a visible failure surface. Replaces per-app `scheduled()` handlers. | ad hoc |
| **Maintenance** | Deployment-wide read-only / full, plus per-tenant standing. Already right. | `@4dl/tenancy` |
| **Datetime + units** | Store UTC and metric, convert at display from the person's preference, browser-derived default. | `@kova/domain` units |

### 4.1 Regions — the one thing that must be right from the first table

⚠️ **This is the only item on the list that cannot be retrofitted cheaply.**
Everything else is a feature you can add late. Residency constrains every
binding, every schema, the tenant lookup and the identity store — retrofitting
it means touching all ~122 tables and every data access in the platform, at a
point where there is production traffic on it.

The recommendation is not "build two regions". It is: **build the indirection
now, run one region, and make the second a configuration change.** The
indirection is perhaps 200 lines. Adding it later is a rewrite.

#### The four rules

**1. A tenant lives in exactly one region, and the region is resolved before
anything regional is touched.** This is the host gate's job and it already has
the shape — `@4dl/tenancy` resolves host → tenant with a KV cache on every
request. Region becomes a property of that resolution.

**2. The tenant directory is GLOBAL and holds routing data only** — slug →
tenant id → region → standing → custom domains. Nothing in it is personal data,
which is exactly why it can be global; the moment somebody adds an owner's email
"for convenience" the whole model breaks. Guard it: the directory's schema is
allow-listed, and a column outside the list fails the build.

**3. Stateful bindings are region-tuples, never singletons.** ⚠️ **This is the
rule that must exist from the first table.** One worker script (Workers run
everywhere); the manifest declares one *logical* binding (`db`, `media`,
`inbox`) and the framework resolves the regional instance per request from the
tenant's region.

⚠️ **But not everything duplicates, and two exceptions matter** — §4.3 has the
inventory. Durable Objects pick a jurisdiction at CALL time on a single
namespace, so DO bindings do not multiply by region at all. KV is globally
replicated by design and cannot be regionalised, so it may never hold anything
personal.

```ts
// what an operation sees — never a raw binding, never a region
async handler(ctx, input) {
  await ctx.db.insert(clients, { … })   // ctx.db is already the tenant's region
}
```

The guard in §6 ("binding chokepoint") is what keeps it true: an app that
reaches `env.DB` has just written a query that will hit the wrong continent the
day a second region exists, and nothing else would notice.

**4. Put the identity store in the EU, for everybody.** Three reasons, and the
third is the one that decides it:

- EU residency is the strictest regime, so it is always *sufficient*. A US or
  Gulf subject has no legal objection to their record being held in the EU; the
  reverse is not true.
- It costs one cross-region hop **per sign-in**, not per request — see §2.4's
  read/write split, which exists precisely to make this affordable.
- ⚠️ **A person can belong to an EU tenant and a non-EU tenant at the same
  time**, and with unified identity that is not hypothetical — it is the normal
  case for anyone with two customers. One identity store makes that a
  non-question. Per-region identity makes it an unanswerable one: the record has
  to be in both places, or the sign-in has to know which region before it knows
  who you are.

**The escape hatch, if a customer ever contractually demands non-EU identity
residency:** identity region becomes a property, resolved through a global
directory of `hash(email) → region`. Build the *lookup indirection* now — one
function with one implementation — and the second implementation is a day's
work rather than a redesign.

#### What is NOT solved here

- **AI provider residency.** Workers AI and Gemini have their own answers, and
  they are contractual rather than architectural. Whoever signs the DPA needs to
  know which models may see tenant data in which region; the framework can
  *enforce* a per-region model allow-list, but it cannot create one.
- **Stripe.** One account, one jurisdiction for the money. Payment data
  residency is Stripe's problem and the answer is "not ours" — which is exactly
  why the tenant-to-customer rail was designed to never touch card data.
- **Email deliverability.** `noreply@4dl.app` is one zone. A regional sender is
  a DNS decision, not a code one.

#### The cost of getting this wrong, stated plainly

Retrofitted after Kova migrates, this is: every table gains a region dimension
or is copied; every query is audited for which database it meant; the tenant
lookup changes shape while serving traffic; and the identity store has to be
split or moved while people are signed in. Done in Stage 1, it is a resolver, a
directory table and a lint rule.

### 4.2 Moving a tenant — the engine, not the upsell

The proposal was a paid on-demand switch between regions. **Build the mechanism,
and build it earlier than a region feature would justify — but do not ship it as
a €25 microtransaction.** Both halves of that need arguing.

#### It is not a region feature. It is six features.

"Move one tenant's entire footprint from store A to store B, verifiably, with a
rollback" is the same operation as:

| | |
|---|---|
| region change | the thing that was asked for |
| **the GDPR data export** | on your list, and unbuilt in all three apps |
| **backup and restore per tenant** | nobody has this today; it is a real gap |
| tenant clone | demo studios, sandboxes, support reproduction |
| evacuation | a degraded region, or a database that must be split |
| ⚠️ **Kova's own per-tenant cutover** | §7 step 6 — *this is the same operation* |

That last row is the argument for building it in Stage 3 rather than as a later
add-on. §7 already requires moving production tenants one at a time from the old
stack to `platform/kova` with a rollback. If the framework owns "relocate a
tenant", that migration is a *call*, not a bespoke script written once under
pressure against live customer data.

#### Two thirds of it is already derived

`tenantCascade(SCHEMA_MODULES)` returns every table holding a tenant's rows,
derived from the `scoped` declaration each module carries. `applyCascade` runs
`DELETE` over those steps. **The same steps with `SELECT` are a complete tenant
export**, and `purge-cascade.test.ts` already fails on a table that carries a
scope column and declares none — so a table added later cannot be silently
skipped by the migration any more than it can be silently skipped by erasure.

R2 is the same story: the media ledger already lists every object per tenant,
because the quota needed it.

⚠️ **Content-addressed objects are COPIED, never moved.** Scena's R2 key is the
content hash and `library_tracks` is a platform-wide catalog, so one object may
be referenced by many tenants. The ledger already models this correctly
(`ledgerKey` = `<tenantId>:<hash>` — one row per tenant, one copy in the bucket).
A migration that moves the object instead of the reference silently breaks every
other tenant pointing at it, and the manifests those tenants' screens replay
offline for weeks.

#### The cost is the Durable Objects, and it compounds

Eleven DO classes across four apps today — `TenantBillingDO` and `InboxDO`
everywhere, plus Scena's `ScreenDO`, `ChannelDO`, `QueueDO`, `RoomBoardDO` and
`ScoreDO`. **None of them can export or import its state.** DO storage cannot be
relocated between jurisdictions, and a jurisdiction-scoped namespace mints
different ids, so a move is: seal → export → create in the target jurisdiction →
import → verify → repoint.

⚠️ **This has to be a framework contract from Stage 1**, because every DO written
before the rule exists is one that has to be retrofitted:

```ts
interface Relocatable {
  seal(): Promise<{ hash: string }>;   // refuse further writes, return a fingerprint
  exportState(): Promise<Uint8Array>;
  importState(b: Uint8Array): Promise<void>;
}
```

`seal()` is not ceremony. **`TenantBillingDO` holds the authoritative credit
balance**, and a move that gets it wrong either mints credits or destroys them —
silently, on the money path, which is the failure class this repo has the most
scars from. The source must refuse writes and must never be reopened; that is a
state machine on the object, not a discipline in a script.

#### The window is a mechanism you already have

Do not build dual-write or a change-log replay. **Put the tenant in `readOnly`
for the duration** — a first-class standing state with a resolver, a gate, copy
and a banner already shipped. Reads are served throughout, which is the rule this
platform already keeps at every rung of the dunning ladder. For an operation the
tenant *asked for and can schedule*, a few minutes read-only is honest and
cheap; dual-write across regions is neither.

Order: seal → copy → verify (row counts per cascade step, object count and bytes,
DO state hashes) → **one write to the global directory** → cooling period →
delete the source. The flip is the only non-idempotent step; everything before it
is re-runnable, and the source is not deleted until somebody could still change
their mind.

#### Two corrections to the framing

⚠️ **"Global edge" is not a thing you can promise.** The *Worker* runs
everywhere; D1 has a primary location, R2 has a bucket, a DO has a home. What a
tenant chooses is where their data LIVES, not whether it is everywhere. Telling a
DPO their data is "on the global edge" is a claim you cannot support in a
procurement questionnaire, and that questionnaire is exactly who is asking.

⚠️ **A jurisdiction is not a location hint.** Cloudflare's `jurisdiction: "eu"`
is a contractual guarantee that data does not leave the EU; a location hint is
best-effort placement. They read similarly in a config file and differently in a
DPA. Sell the first; the second will not survive review by the customer who
cares.

So the axis is not "global edge vs EU" but **where is this tenant's home** —
`auto` (Cloudflare places it, the default) or `eu` (jurisdiction-pinned), with
`us` and `apac` later if anyone pays for them.

#### On charging €25

**€25 is priced for a customer who does not exist.** Someone who needs EU
residency needs it at contract time, has it in their procurement checklist, and
would pay very much more; someone who does not need it will not pay €25 for it
either. The price does not gate the people you want to gate and does not earn
from the people who would pay.

⚠️ **And "pay us to comply" reads badly to precisely the buyer who asks.** GDPR
does not require EU residency — that is a widespread misconception — so a fee
attached to it invites the reading that you were non-compliant before, or that a
right is being monetised. A hospital's DPO evaluating Tessa is the wrong audience
for that conversation.

The shape that works instead:

- **Region at signup: free.** This is the 90% case and it costs nothing once
  §4.1's resolver exists. It is also the one that wins deals.
- **Region change: free, rate-limited** (once a year, say). It is a real
  operation with real cost, and a rate limit stops idle switching without
  putting a price on residency.
- **If residency is to earn**, make it a plan attribute — an EU-resident tier
  with the DPA, the sub-processor list and the support terms that actually go
  with it — not a €25 button. That is what the buyer is trying to purchase.

### 4.3 What actually duplicates — and what "100% EU" can honestly mean

Two questions that decide the provisioning story, answered against the bindings
these workers hold today: `AI`, `CACHE`/`PAIRING`, `PLATFORM_CONFIG`, `DB`,
`MEDIA`, plus 11 Durable Object classes.

#### It is not 2× everything. It is 2× the two stores that hold tenant data.

| Binding | Per region? | Why |
|---|---|---|
| `DB` (D1) | **yes** | it *is* the tenant's data |
| `MEDIA` (R2) | **yes** | and the EU one must be created **with** `jurisdiction: eu`, not merely hinted |
| Durable Objects | **no** | a namespace is per-script; the jurisdiction is chosen at CALL time — `env.BILLING.jurisdiction("eu").idFromName(tenantId)`. Scena's seven classes stay seven, not fourteen |
| `CACHE` / `PAIRING` (KV) | **no** | and not because it is cheap — see below |
| `PLATFORM_CONFIG` (KV) | **no** | already one namespace shared by every worker |
| `AI` | **no** | one binding; what becomes region-aware is the *model allow-list* |
| identity D1 | **no** | one, EU, for everybody (§4.1 rule 4) |
| tenant directory | **no** | one, global, routing data only |

**Three apps × two regions is 8 databases and 6 buckets** — six regional app
databases plus identity plus the directory — against 3 and 3 today. Kova's worker
goes from 8 bindings to about 13. That is comfortable; worth noting in passing
that bindings are static in `wrangler.jsonc`, so at five or six regions the
topology to reach for is a worker deployment per region instead, with identity
called over HTTP rather than bound.

⚠️ **Nobody hand-manages 8 databases.** `apps.json` already drives provisioning
and `bind-resource-ids.mjs` already writes a real id into a JSONC config
structurally and verifiably. Adding a region dimension to the registry is a loop
over a list, not a redesign — and a region should be provisioned only once a
tenant is in it, so `apps.mjs ready` becomes a question about `(app, region)`
rather than about an app.

⚠️ **`applySchema` then runs per (app × region)** — six gates, not one. The
composed runner is already idempotent per database, so this is cheap, but it has
to be designed rather than discovered. So does the test story, where a second D1
under Miniflare is now a proven pattern: `apps/scena/vitest.config.ts` binds one
for the billing-reconcile suite.

#### KV is the sharp edge

**KV is globally replicated by design and has no jurisdiction option.** An EU
tenant's data in KV is that tenant's data in every Cloudflare PoP on earth.

That is survivable given what is in there today — `CACHE` holds host→tenant
routing, `PAIRING` holds ephemeral device codes, `PLATFORM_CONFIG` holds operator
credentials, none of it a tenant's personal data. But it has to become **a rule
with a guard** rather than a happy accident: KV writes through one chokepoint
with a typed, allow-listed key space, and anything not on the list fails the
build. That is `storage-chokepoint.test.mjs`'s shape applied to the one store
that cannot be regionalised.

#### So: can a tenant get "100% EU"?

**Data at rest in the EU: yes, and it is sellable.** Everything else needs
qualifying, and the qualification is the difference between a DPA you can sign
and one you cannot.

| Layer | EU-only | Note |
|---|---|---|
| R2 | ✅ | `jurisdiction: eu` is a contractual guarantee, not a hint |
| Durable Objects | ✅ | the same, chosen per call |
| D1 | ⚠️ | a location hint at creation. **Read replication must be off or EU-constrained** — a replica on another continent is precisely the transfer you sold against |
| KV | ❌ | globally replicated. Nothing personal, ever |
| Worker compute / TLS | ⚠️ | a Worker runs where the request lands and TLS terminates at the nearest PoP. EU-only termination needs Cloudflare's **Data Localization Suite / Regional Services**, an Enterprise add-on with a real price |
| Workers AI | ⚠️ | inference GPU location is not EU-guaranteed |
| Gemini | ⚠️ | needs a Vertex EU endpoint, or AI is off for EU tenants |
| Analytics Engine | ❌ | global |
| Stripe | ❌ | a US processor under SCCs. Not ours to fix — and the tenant→customer rail deliberately never touches card data, which is the strongest thing you can say here |
| Email | ⚠️ | Brevo is French; the Cloudflare sender needs checking |
| Logs | ⚠️ | tail and Logpush transit global infrastructure |

⚠️ **Do not sell "100% EU".** Sell **"EU data residency"** — data at rest in the
EU, a DPA, an SCC-covered transfer list, a named sub-processor list. That is what
a hospital DPO's questionnaire actually asks for, it is achievable, and it
survives review. "100% EU" promised alongside inference on a GPU in Virginia is
worse than the accurate claim, because it is the one they will check.

**And the framework's job here is bigger than storage.** Residency is also *which
sub-processors a tenant permits*, so a region carries an allow-list: an EU tenant
may resolve a different (or empty) AI model set, a different mailer, no
analytics. That is a manifest declaration and a gate, exactly like an
entitlement — which is what makes the promise enforceable rather than
aspirational.

⚠️ **Verify the Cloudflare specifics before quoting them.** These products move
quickly and the table above is a snapshot. The two most worth confirming: whether
D1 offers a contractual jurisdiction as opposed to a location hint, and what
Regional Services costs at your plan.

---

## 5. What cannot be declarative — named, so nobody re-litigates it

Written down per app so that the boundary in §3.6 is a fact rather than a
judgement call in a code review.

**Scena:** the player render loop, the timeline engine, the manifest compiler,
the widget renderer, the pairing/device door, the board and kiosk surfaces.
**Kova:** the body scan (camera + pose), Snap-a-Meal and the label reader
(camera + vision), the workout player, the plan editor's copy-week and
superset/circuit round-logging, the progress charts.
**Tessa:** cycle timelines, the load builder.

Everything else — rosters, packages, foods, exercises, channels, playlists,
feeds, media, settings, billing, admin, help — is chrome and collections.

⚠️ **Two rules about this list.** It may grow only by a deliberate edit with a
reason, in review; and anything on it still uses the platform's chrome, states,
motion and data access. "Canvas" means the content region, not a licence to
re-implement a dialog.

---

## 6. The guards

Types cover most of the manifest. These are the things they cannot, each of
which has already happened here at least once.

⚠️ **The table is GENERATED from [`guards.json`](guards.json)**, which is what
stops this section from being a wish list. A guard named here has a registry
entry; a `live` one is bound to a literal assertion in a real file and to the
script that runs it, so it cannot be renamed away silently; and an outstanding
one names the stage that owes it — which a **shipped** stage may not do.
[UI.md](UI.md) §10 carries the interface half the same way.

<!-- generated: node scripts/guards.mjs table docs kernel platform -->
| guard | fails on | |
|---|---|---|
| `docs-kind` | a governed document with no `kind` in its front matter, or a contract with no `verified:` date | **live** |
| `docs-defer` | a deferral with no id, a duplicate id, no description, an unknown stage — or a stage that is SHIPPED | **live** |
| `docs-generated` | a generated block whose command now produces different output — a hand-edited inventory | **live** |
| `docs-orphan` | a document no other document links to | **live** |
| `guard-registry` | a guard claimed in prose with no registry entry, a live guard whose check has been renamed or deleted, a live guard nothing invokes, or a shipped stage still owing one | **live** |
| `kernel-layering` | a module importing one at its own layer or above | **live** |
| `kernel-day-zero` | a day-zero declaration from MANIFEST.md §9 with no type expressing it, or one expressed as optional | **live** |
| `kernel-vocabulary` | a product noun in kernel code — an identifier, a type or a string literal | **live** |
| `kernel-no-escape` | an escape hatch on a manifest type — a passthrough, a raw blob, an unchecked extension point | **live** |
| `kernel-unproved-export` | an exported symbol no proof or test exercises | **live** |
| `kernel-unstated-any` | an `any` with no stated reason beside it | **live** |
| `binding-chokepoint` | any runtime binding touched outside its owner — a query that will hit the wrong continent the day a second region exists | **live** |
| `kv-key-space` | a KV write outside the allow-listed key space — the one store that cannot be regionalised may never hold anything personal | **live** |
| `directory-columns` | a column on the global tenant directory outside the routing-data allow-list | **live** |
| `schema-idempotent` | a schema module that is not re-runnable, a duplicate table across modules, or a module ordered before something it declares it needs | **live** |
| `boot-per-region` | a deployment that composes one region's schema and serves another — the tenant resolves, reaches the right database, and finds nothing in it | **live** |
| `standing-not-permission` | an always-allowed lane that skips the permission check with the standing gate | **live** |
| `capability-reachable` | a module applied with no surface mounted to reach it | stage 1 |
| `operation-registry` | a route, tool or webhook that did not come from `operation()` | stage 2 |
| `tool-subset-route` | an AI tool reachable where the equivalent route is not | stage 2 |
| `problem-envelope` | a failure body that is not a `Problem`, a code with no copy, or a `catch` that re-throws or serialises a provider's error | stage 2 |
| `erasure-derived` | a table carrying a scope column and declaring none | stage 3 |
| `schema-adjacency` | a module ordered where its dependency has not run | stage 3 |
| `relocatable-do` | a Durable Object class that cannot seal, export and import its state | stage 3 |
| `no-silent-cap` | a bounded sweep that does not log what it dropped | stage 3 |
| `entitlement-enforced` | a sold entitlement no gate names | stage 5 |
| `flag-enforced` | a sold capability the UI hides and no route withholds | stage 5 |
| `manifest-diff` | a deploy removing a plan, permission or entitlement somebody holds | stage 6 |
| `app-test-budget` | an app's own suite crossing its duration cap — the fixture problem gets solved rather than tolerated | stage 6 |
| `help-limits` | a help article over its length limit, naming a surface the manifest does not declare, or using developer vocabulary | stage 6 |
| `release-note-shape` | a release note reading like a commit message — a file path, a type name, a PR number, an internal id | stage 6 |
| `shot-id-resolves` | a screenshot id the suite does not produce | stage 6 |
<!-- /generated -->

⚠️ **A widened guard finds bugs in itself first.** Two of the first failures
when `pnpm gate`'s guards were widened to all apps were the parser's, not the
apps'; step 5.2 found two more in `capability-reachable` (an import satisfying a
mount check, and a comment stripper fooled by `"/api/auth/*"`). Budget for it.
Mutation-test every guard — the repo already does this and it has caught a guard
that passed a defect twice.

---

## 7. Migration — Kova first, safely

### 7.1 The rule

**The shipping Kova ships from `apps/api` + `apps/app` until the day it does
not.** `platform/kova` is built beside it, never on top of it. No production
tenant sees the new stack until the rehearsal is boring.

### 7.2 The four migration classes, in increasing difficulty

1. **Pure domain** — `@kova/domain`'s TDEE, body-fat, activity, progress maths.
   Moves unchanged with its 237 tests. Do it first; it is free confidence.
2. **Schema** — 35 Kova tables plus 39 shared ones onto collections. Mechanical
   but wide.
3. **Surface** — 489 route registrations onto operations. The bulk of the work,
   and where the API, tools and webhooks arrive as a side effect.
4. **Screens** — 34,468 lines, of which ~75–80% becomes manifest and ~20–25%
   becomes canvas. The long pole, and the reason this is a multi-stage project
   rather than a sprint.

### 7.3 The data migration

⚠️ **The pattern is already proven in this repo and should be copied exactly.**
Audit step 5.2 migrated Scena's billing tables onto the shared shape last week,
and everything that made it safe generalises:

- **Reconcile before compose.** The reconciler runs *before* `applySchema`,
  because the shared module indexes a column the old shape does not have — the
  index throws, the batch throws, and every route touching D1 answers 500. That
  outage has now been met twice (`AI_LEGACY_RESET`, then `credit_ledger.at`).
- **Read `pragma_table_info`, do not attempt-and-swallow.** A declarative
  backfill that names a column existing on only one of two shapes fails to
  *parse* on the other, and the warning is noise on every fresh deploy forever.
- **Convert values, not just names.** SQLite types are per-value, so a
  millisecond integer sits happily in a TEXT column and `past_due_at + grace` is
  string concatenation. Nothing throws; the ladder simply fires on the wrong day.
- **Assert bytes, not parseability.** ISO comparison in SQL is lexicographic.
- **Mutation-test the migration.** All four behaviours of the Scena reconciler
  were verified by breaking them one at a time.

### 7.4 The cutover

1. **Parity build** — `platform/kova` reaches feature parity behind a flag.
2. **Rehearsal** — restore a copy of production D1/R2 into a staging region, run
   the reconcilers, boot the new stack against it. Repeat until nothing is
   learned.
3. **Screenshot parity** — `pnpm shots` against both stacks, diffed by shot id.
   This is the only parity check that covers a 34k-line SPA honestly, and the
   suite already exists.
4. **Golden-path E2E** on the new stack: the three existing specs plus the
   client-persona intake path that caught the 403 the integration suite
   structurally could not see.
5. **Dark launch** — the new worker serves a small allow-list of internal
   tenants on the real data path.
6. **Cutover per tenant**, not per deployment, with the old stack still bootable.
   ⚠️ Use §4.2's relocation engine — this step IS a tenant relocation, and a
   bespoke script written once, under pressure, against live customer data is the
   worst possible place to discover that the cascade missed a table.
7. **Reverse migration written and rehearsed before step 5.** If it does not
   exist, step 5 does not happen.

⚠️ **Do not migrate a tenant and a schema in the same step.** Reconcile the data
in place first while `apps/api` still serves it; move the traffic second. Two
reversible steps beat one that is not.

---

## 8. Stages

Every stage ends with something that runs. That is the only defence against the
second-system effect, which is the largest risk here by a distance.

| # | Stage | Ends when |
|---|---|---|
| 0 | **Contracts** — manifest schema, layer boundaries, naming, the operation and collection types. Types only. | ✅ built in `platform/kernel` — the four types compile, six real surfaces from two shipping products are expressed in them, and eight mistakes are rejected by the compiler. [FINDINGS.md](../kernel/test/FINDINGS.md) is what did not fit. Open: review |
| 1 | **Kernel** — bindings from manifest, config, schema composition, shared identity + root-scoped passkeys, tenancy + doors, **region resolution and the global tenant directory**, standing. | A generated `hello` app boots, signs in with one passkey usable from a second app's origin, creates a tenant, answers `/health` — and no handler has seen a raw binding. **Done except identity:** `platform/hello` boots through `platform/runtime` on the real host topology, composes its schema per region, creates a workspace and serves it. The passkey ceremony is the remainder |
| 2 | **Surface** — operations → routes + tools + webhooks + audit + OpenAPI. | An AI agent completes a CRUD round trip through tools, and is refused exactly what the user would be |
| 3 | **Data** — collections, docstatus, naming, activity, soft delete, ledger, files, jobs, search, **and tenant relocation (§4.2) with the `Relocatable` DO contract**. | `hello` has a real collection with an activity log and a metered ledger — and a tenant can be copied to a second region and back, verified, with the source still bootable |
| 4 | **Renderer** — shell, nav, collection views, settings, admin, whitelabel, PWA. The language is [UI.md](UI.md). | `pnpm shots` photographs `hello` at 4 viewports × 2 themes and it looks like the product — and the state matrix, the contrast sweep over every legal brand and the boundary guard all pass |
| 5 | **Commerce** — plans, entitlements, flags, Stripe on one webhook, B2C packages, metering, parking state. | `hello` sells a plan and a package end to end in Stripe test mode |
| 6 | **Ops** — notifications incl. web push, help centre, versioning + changelog, data & subscription centre, maintenance, provisioning, CI. | A new app is `one new` + a manifest + a deploy, with nothing hand-wired |
| 7 | **Kova** — §7. The long one. | Production tenants are served by `platform/kova` and `apps/api` is unrouted |
| 8 | **Tessa, then Scena** | Both migrated; Scena's player proves the canvas boundary |
| 9 | **Delete** `packages/@4dl/*` and `apps/*` | The repo has one platform |

**Stage 6 is the real deliverable of this project.** Stages 7–8 are the payoff;
stage 6 is the promise. If stage 6 ships and stage 7 slips, you have still won —
new apps are cheap and the old ones keep working.

---

## 9. Risks, ranked

1. ⚠️ **The second-system effect.** Your list is ~35 subsystems. Building all of
   them before shipping anything is the canonical way a project like this dies at
   80% forever. Mitigation: §8's rule that every stage runs, and a willingness to
   cut items into "after stage 9".
2. ⚠️ **Kova first, with production tenants.** §2.3 and §7. The mitigation is
   rehearsal and per-tenant cutover; the failure mode is a big-bang date.
3. **The renderer boundary erodes.** One "just this once" at a time until you
   have a component library with extra steps. Mitigation: §3.6's guard, in CI,
   from stage 4 — not added later.
4. **Identity's blast radius**, if "single account" is ever implemented as a
   single *session*. The account is shared; the cookie must not be. §2.4.
5. **Regions retrofitted.** A resolver and a directory table in stage 1; every
   table, every query and a live identity store in stage 7. §4.1.
6. **Test time gets worse.** You named this. It is real: `@kova/api` is 632 tests
   each provisioning a world through real OTP sign-ins, ~2.5 minutes whenever
   Kova's API changes. The fix is a seeded-fixture harness with a shared
   provisioned world and per-test scoping — **not fewer tests**, and not a
   narrower CI net. Turbo's cache already took a Tessa-only change from 5m to
   27s; the same leverage applies here.
7. **The manifest becomes a second language.** If expressing something in the
   manifest is harder than writing it, people write it. Watch for the first
   `escapeHatch:` field and treat it as a design failure, not a feature.

---

## 10. What I would do next

Concretely, in order, and none of it is expensive:

1. **Settle the naming** (§3.1) — `platform/` + `@one/*` is my recommendation.
2. **Write the four core types** — `defineApp`, `operation`, `collection`,
   `defineBindings` — as types only, with no implementation, and try to express
   Kova's hardest three routes and Scena's hardest three collections in them. A
   type that cannot express a real case fails cheaply on a Tuesday.
3. **Write the region indirection before the first table.** Not the second
   region — the *resolver*: `ctx.db` / `ctx.media` / `ctx.inbox` derived from the
   tenant's region, a global directory holding routing data only, and the lint
   rule that fails any handler touching a raw binding. This is the one item where
   deferring the design costs real money, and it is roughly 200 lines.
4. **Prototype the operation → tool derivation** against three real Kova routes,
   including one that is entitlement-gated and one that is row-scoped. If tool
   masking is not clean there, the whole §3.4 story needs rethinking before
   anything is built on it.

Stage 0 is a week of types and arguments, and it is the highest-value week in
the project.
