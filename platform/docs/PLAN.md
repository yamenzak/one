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
> **[KOVA.md](KOVA.md) is the first app-shaped plan** — why migrating Kova means
> writing a new product, how its one live tenant travels with its passkeys, and
> the seven mechanisms the platform owes before it can be written.
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

#### Why there is no IdP at `id.4dl.app`, and no redirect to hide

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

#### ⚠️ There IS an `id.4dl.app`, and it is not what the section above rejects

**Answered 2026-08-12, and the two questions are genuinely different.** What is
rejected above is an *identity provider* — a place a product SENDS you to sign in
and then sends you back. Nothing does that here: the ceremony still runs on each
product's own origin against a credential scoped to the platform root.

What is BUILT is a **destination**. A person's relationship with their own data
does not end when they stop using a product — their facts, their grants, their
credentials, the record of who read what — so there has to be an address for it
that no app owns. `identity` is a door in `classifyHost`, it resolves no tenant,
and it is where the account centre and the vault answer.

Three consequences worth stating once:

- **One passkey reaches it with no second registration.** `relyingPartyFor`
  returns the platform root there, which is the whole point of raising the RP.
- **It does NOT share a session with any product.** `id.4dl.app` sits beside
  `kova.4dl.app` rather than under it, so the cookie does not travel and signing
  in there is one tap rather than a widened session. That is the §2.4 trade
  applied consistently rather than a gap.
- **A second registrable domain cannot share the credential, and no configuration
  changes that.** `4dl.app` is not a registrable-domain suffix of
  `fourdegreelabs.com`, so `tenancy.aliases` declares what an alias IS: `redirect`
  (canonical, nothing served, nothing to sign into) or `origin` (its own relying
  party, its own cookie jar, and a person needs a second passkey). Redirect is the
  default and should stay that way for almost every alias — a serving origin buys
  a nicer URL and costs somebody a credential.

⚠️ **Declaring them is also a security control.** A hostname the classifier does
not recognise falls through to the CUSTOM-DOMAIN lookup, which asks which tenant
registered it — so a domain we own and did not declare is one a tenant's claim can
be served at. `id.4dl.app` and every sibling product's root are `unclaimed` now.

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

⚠️ **What was actually built is four packages, not seven, and the difference is
worth recording rather than quietly reading as the plan.** `data/` and
`surface/` do not exist: both are inside `@one/runtime`, because both are the
same dispatcher over the same per-request binding resolution, and splitting them
would have meant exporting that resolver across a package boundary purely to
honour a diagram. The LAYERS are unchanged and still enforced — `kernel-layering`
reads a per-module registry rather than a per-package one, so a module importing
one at its own layer or above still fails.

The cost of the divergence is real and small: `@one/runtime` is 12,435 lines,
which is the largest thing here, and "which layer is this file" is a lookup
rather than a directory. Revisit if it passes 20,000.

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

⚠️ **This was predicted and then not done: `kova/src/manifest.ts` is 4,003
lines.** Nothing broke, which is why it kept not being done — the file
typechecks, the composition refusals fire, and the guards read it fine. What it
costs is the thing a plan cannot measure: every increment appends, nobody reads
it whole, and two declarations about the same feature can sit six hundred lines
apart. The split is mechanical and is worth doing before the second app, because
the second app will copy whatever shape the first one has.

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
| **Identity** | Shared identity D1 bound into every worker; passkey RP raised to `4dl.app`; sessions stay per-app and per-region. No IdP, no redirect (§2.4). The account centre has its own DOOR at `id.4dl.app` — a destination, not an IdP (§2.4a). | `@4dl/auth`, per-app RP |
| **The 4° Vault** | A person's sensitive facts held once, at the ACCOUNT, disclosed per app at a rung they chose and for as long as they chose. Readings computed inside it, granted separately from their inputs. [VAULT.md](VAULT.md). | **new** |
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
| **Notifications** | Channel algebra (role × category → inbox / email), one dispatch path, the workspace's own wording and sign-off. ⚠️ **Web push is deliberately absent**: it was declared as a third `Channel` with a preference somebody could switch on and nothing that delivered one, which is a settings toggle that silently does nothing — worse than an absent feature, because it stops somebody watching their inbox. It returns with the offline work below, which is what gives it a device to reach. | `@4dl/notify` |
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
| `capability-reachable` | a module applied with no surface mounted to reach it | **live** |
| `binding-chokepoint` | any runtime binding touched outside its owner — a query that will hit the wrong continent the day a second region exists | **live** |
| `kv-key-space` | a KV write outside the allow-listed key space — the one store that cannot be regionalised may never hold anything personal | **live** |
| `directory-columns` | a column on the global tenant directory outside the routing-data allow-list | **live** |
| `operation-registry` | a route, tool or webhook that did not come from `operation()` | **live** |
| `tool-subset-route` | an AI tool reachable where the equivalent route is not | **live** |
| `problem-envelope` | a failure body that is not a `Problem`, a code with no copy, or a `catch` that re-throws or serialises a provider's error | **live** |
| `erasure-derived` | a table carrying a scope column and declaring none | **live** |
| `schema-adjacency` | a module ordered where its dependency has not run | **live** |
| `relocatable-do` | a Durable Object class that cannot seal, export and import its state | **live** |
| `no-silent-cap` | a bounded sweep that does not log what it dropped | **live** |
| `entitlement-enforced` | a sold entitlement no gate, quota or shaped response names — a capability on a price list that every workspace has anyway | **live** |
| `flag-enforced` | a sold customer capability the interface hides and no route withholds, so anybody who calls it directly receives it | **live** |
| `manifest-diff` | a manifest that stopped offering a plan, permission, entitlement, collection or operation somebody holds, without naming it as retired | **live** |
| `app-test-budget` | an app's own suite crossing its duration cap — measured, not asked, because a budget nobody times is a comment | **live** |
| `help-limits` | a help article over its length limit, naming a surface the manifest does not declare, or written in developer vocabulary | **live** |
| `release-note-shape` | a release note reading like a commit message — a file path, a type name, a pull-request number, an internal id | **live** |
| `schema-idempotent` | a schema module that is not re-runnable, a duplicate table across modules, or a module ordered before something it declares it needs | **live** |
| `boot-per-region` | a deployment that composes one region's schema and serves another — the tenant resolves, reaches the right database, and finds nothing in it | **live** |
| `standing-not-permission` | an always-allowed lane that skips the permission check with the standing gate | **live** |
| `session-per-origin` | a session accepted at an origin it was not issued for — an account is shared across products and a bearer token is not | **live** |
| `passkey-needs-session` | a credential registered with no session behind it, which turns the strongest factor into the cheapest account takeover | **live** |
| `ceremony-refusals` | an assertion accepted for the wrong origin, the wrong relying party, a replayed challenge, a stalled counter or the wrong ceremony type | **live** |
| `no-membership-oracle` | a sign-in endpoint that answers differently for an address with an account — type an address, learn whether that person uses the product | **live** |
| `one-dispatcher` | a second path that invokes a handler — two dispatchers is how an agent ends up able to do something a route cannot | **live** |
| `fails-declared` | an operation naming a failure code no catalogue declares, which becomes a generic 503 wearing the shape of a specific answer | **live** |
| `agent-equals-caller` | a tool offered where the equivalent route would refuse, or an operation withheld from every model that is reachable by name | **live** |
| `input-parsed` | an operation whose input is asserted rather than parsed — a type assertion compiles, reads like validation, and lets a number reach a text column | **live** |
| `tenant-predicate-derived` | a list that filters by tenant in its own code — one that forgets returns every tenant's rows and looks completely ordinary | **live** |
| `copy-before-flip` | a relocation that deletes from the source, or one with no verification before the directory write | **live** |
| `collection-reachable` | a collection declared and left without a surface — a table applied, rows written by some other path, and no route to reach any of it | **live** |
| `parking-below-floor` | a parking state more generous than the cheapest paid plan — not paying buys more than paying does | **live** |
| `quota-countable` | an operation counting against a ceiling nothing can count, which reports an obligation on every request and refuses nothing | **live** |
| `one-entitlement-walk` | a second implementation of what a workspace or a customer may do, which is how a screen comes to promise what a route refuses | **live** |
| `clamp-is-last` | an operator adjustment applied after the standing clamp, which turns a support gesture into a way around the payment ladder | **live** |
| `reserve-is-a-ceiling` | a settlement that recounts an unreported call, or a reserve computed from a different text than the one that was sent | **live** |
| `constant-time-signature` | a computed digest compared with ===, whose timing measures how much of the secret was right — a forgery no functional test can observe | **live** |
| `event-applied-or-parked` | an unattributable payment event answered 200 with its id claimed, so the provider never retries — or parked where nobody can read it | **live** |
| `webhook-region` | a webhook settling against the region the request arrived in rather than the one the workspace lives in — the row lands in the wrong database and nothing throws | **live** |
| `ladder-anchor` | a ladder anchor re-stamped on every retry, so a workspace never advances past the first rung however long it stays unpaid | **live** |
| `query-coercion` | a query string coerced by inspecting the value rather than the declaration, which turns ?code=0123 into 123 | **live** |
| `renewal-claimable` | a webhook that never records the customer it just placed, so every renewal — which carries no metadata of ours — parks and the workspace's plan quietly lapses | **live** |
| `emits-declared` | an operation raising an event no notification declares — a subscription nobody can make, and a notification with no copy, icon or destination | **live** |
| `notification-link` | a notification linking somewhere the app does not have, which renders and then goes nowhere | **live** |
| `inbox-never-optional` | a preference that removes the RECORD rather than the interruption, so 'I never got that' has no answer that does not depend on a mail provider | **live** |
| `action-not-mutable` | an `action` notification that can be switched off, which makes the product silently stop working for whoever switched it off | **live** |
| `notification-audience` | a dispatch that names its own recipients rather than reading the registry — 'everybody' and 'nobody' have both shipped | **live** |
| `help-link-resolves` | a help cross-link naming an article that does not exist — rendered beside an error, so it is the second failure in a row | **live** |
| `lock-exists` | an app with no manifest lock, so removing something somebody holds is a diff nobody reads and a failure the customer finds | **live** |
| `leaving-always-allowed` | an exit route that is itself gated by standing — a workspace that cannot be closed while suspended is a trap | **live** |
| `export-erasure-one-plan` | an export or an erasure that reads a hand-written table list — one named seven tables against a declaration of twenty-five and reported success | **live** |
| `maintenance-above-public` | a maintenance check placed after the session read, which leaves open exactly the doors a full stop exists to close | **live** |
| `maintenance-fails-open` | an unreadable maintenance row read as closed, which takes a whole deployment down over a malformed string an operator would need a working request to fix | **live** |
| `template-day-zero` | a scaffold missing a field `AppSpec` requires — read from the type itself, so a day-zero field added to the platform is a red run until the template sets it | **live** |
| `template-mounts-modules` | a scaffold that imports a schema module and never composes it — the name is present, the reader sees it, and the table is never created | **live** |
| `app-id-is-a-label` | an app id that is not a DNS label, or one that is a door — it is the relying party's subdomain, the value stamped into every payment object, and not renameable | **live** |
| `object-door` | a write to the object store outside the media ledger — an object with no ledger row is invisible to the quota and to erasure forever, costs money every month, and nothing else would ever notice | **live** |
| `metadata-stripped` | a stored file recorded as stripped when its format was never parsed — a written claim that somebody's location was removed when it was not, and stripping later never fixes what is already stored | **live** |
| `storage-counts-stored` | a storage ceiling checked as 'are we full', which admits one more file of any size — the difference between a limit and a suggestion | **live** |
| `file-read-is-bytes` | a file served through a JSON envelope, or one a shared cache may keep — a shared cache holding one workspace's photograph is the one place a caching header is a disclosure | **live** |
| `job-bounded` | a sweep with no ceiling on one run — it works until the largest tenant crosses the runtime's time limit, then fails, is retried, fails at the same size, and the work never happens again | **live** |
| `job-emits-declared` | a job raising an event no notification declares — found on the night it finally has something to say, rather than the first time somebody uses a feature | **live** |
| `job-clock-on-success` | a scheduler clock advanced by a failed run, or by one where every tenant was skipped — the run table fills with healthy-looking rows and the work stops | **live** |
| `job-isolation` | one workspace's malformed row stopping a sweep for every other workspace, or one job's failure stopping the others | **live** |
| `guide-answerable` | a checklist step counting a collection the app does not have — answered 'no' forever, so a new workspace is told to do something impossible, and a required one is a wizard nobody can finish | **live** |
| `hint-cap` | more hints than the cap — a hint is the one tracked thing in the guide, and tracked is what makes a tour bad, so the number is bounded to stop one being rebuilt gradually | **live** |
| `checklist-derived` | a checklist step that stays ticked after the thing it counts is gone — the property no tour has, and the whole reason an item is derived rather than tracked | **live** |
| `no-marking-done` | an operation that could mark a checklist step done, which is a way to tell somebody something untrue about their own workspace | **live** |
| `milestone-earnable` | a milestone waiting on an event nothing in the app raises — unearnable, and indistinguishable from one that is merely hard, so somebody works towards it forever | **live** |
| `milestone-announced` | a milestone earned in silence — notifications are delivered by role, so one a customer can earn with an announcement addressed to owners is a row in a table and nothing else | **live** |
| `milestone-once` | an award made on satisfaction rather than on the first write — a rule stays satisfied forever, so it congratulates somebody on every call for the rest of the account's life | **live** |
| `milestone-counts-nothing-else` | a tally row per person per event — a permanent record of everything anybody ever did, written on the hot path of every write in the product | **live** |
| `milestone-earner-is-a-person` | recognition credited to a sweep or a webhook — a badge handed to whichever account happened to be on the request, for work nobody did | **live** |
| `streak-is-their-day` | a streak bucketed in UTC — midnight UTC is four in the afternoon in California, so it breaks halfway through somebody's day and they lose it having done nothing wrong | **live** |
| `permission-reachable` | an operation naming a permission no role can hold — it refuses everybody, forever, including the workspace owner, and reads exactly like a feature nobody uses | **live** |
| `platform-events-have-copy` | an app with no notification for an event the platform raises — dispatch answers an unknown type by returning nothing, so a workspace creation, a plan choice and a grant announce nothing at all | **live** |
| `no-app-celebrations` | an operation that can celebrate on every call — a celebration belongs to a milestone, earned once per person, and the first one an app declares would be on whatever the product most wants people to do | **live** |
| `no-chime-over-loss` | a moment on a danger outcome — the tone already says this is the destructive one, so punctuating it is the product being pleased about somebody's lost work | **live** |
| `sound-is-derived` | a moment and a sound chosen separately, which pairs a celebration with the error chime the first time somebody copies a declaration and edits half of it | **live** |
| `outcome-delivered` | an outcome declared on every write and delivered to nobody — the mechanism-with-no-surface failure, inside the platform, invisible because nothing consuming it exists yet | **live** |
| `outcome-fits-a-header` | an outcome message a header cannot carry — a character above U+00FF throws when the header is set, in the success path after the write already happened, so German, Arabic and every emoji turn a completed operation into a 503 | **live** |
| `wizard-is-the-checklist` | a wizard kept as a second list — how a setup flow and the guidance come to disagree about what a new workspace still needs, always discovered by somebody stuck in the flow | **live** |
| `wizard-stands-where-they-are` | a wizard position derived from how many steps are finished — somebody who satisfied a later step out of order is walked past work they have not done | **live** |
| `outer-setup-leads` | a person walked carefully through their own profile inside a workspace that is not set up and cannot do anything yet | **live** |
| `person-step-is-theirs` | a person's setup step counting the workspace's rows — done the moment a colleague does it, so a new arrival is told their setup is complete having done nothing | **live** |
| `deployment-step-has-no-tenant` | a deployment step counting rows in a workspace the operator is not in, answered by whichever one happened to resolve | **live** |
| `step-the-manifest-can-answer` | a checklist step the rest of the manifest makes unanswerable — no plans to choose or no upload surface mounted — which looks exactly like a step nobody has got to yet | **live** |
| `subject-rows-are-theirs` | one customer's subject-scoped rows visible to another — a whole Scope variant that had DDL, an index and an erasure cascade while no derived operation ever wrote or filtered its column | **live** |
| `subject-row-needs-a-subject` | a subject-scoped row written with no subject — the column is NOT NULL, so the failure is a constraint violation surfacing as an unavailable on a request that was simply not this caller's to make | **live** |
| `setup-follows-the-door` | an operator shown a workspace's checklist, or a workspace shown the deployment's — a task nobody there can do and would not understand | **live** |
| `degrade-lane-finishes` | a mandatory paid step that strands every workspace on a self-host or before the payment provider is configured — failing closed on our own misconfiguration rather than on theirs | **live** |
| `shelf-is-the-declaration` | a price list written beside the declarations rather than from them — it drifts from what the gate enforces, and the drift is found by somebody who bought a thing the product then refuses | **live** |
| `unlimited-is-the-top` | -1 compared as a number — every upgrade to an unlimited plan reported as a loss of everything, and every price list printing 'minus one' | **live** |
| `no-plan-is-the-parking-state` | a comparison treating 'no plan' as zero — advertising every plan as pure gain, including the ones that take something away from what a workspace already had | **live** |
| `strain-is-over-not-at` | a ceiling reported as strained when the usage exactly meets it — a warning on every workspace that is precisely where it is supposed to be | **live** |
| `plans-sell-what-exists` | a plan naming an entitlement nobody declared — sold, paid for, resolved by nothing at the gate, and indistinguishable from a capability that happens to be generous | **live** |
| `shelf-counts-what-the-gate-counts` | a storefront counting usage its own way — it promises a downgrade the very next write then refuses, which is a surface that is not the mechanism | **live** |
| `price-list-survives-a-failed-count` | a failed usage count taking the price list down — somebody looking at plans is doing the one thing the business wants, and a broken count is not a reason to show them an error | **live** |
| `packages-card-every-flag` | a package shown as the features it enables rather than as its position among all of them, so a customer cannot see what a more expensive one would add | **live** |
| `inventory-is-outcomes` | the capability inventory becoming a screen list — risk #1 of the whole migration, because the moment a capability is written as an interface the rewrite is a port and every inconsistency the platform exists to end comes back with it | **live** |
| `dropped-carries-a-reason` | a capability quietly not rebuilt — a removal and an oversight look identical in a diff, and the inventory is the only place the difference can be recorded | **live** |
| `inventory-covers-the-client` | an inventory written from the studio's side only, so the half of the product that is used every day is not part of the acceptance contract | **live** |
| `no-reserved-column` | a field or collection whose derived name is a SQL keyword — the DDL is generated, so nobody reads it, and the syntax error throws out of the boot-time schema apply, answering 503 on every route with no mention of a column | **live** |
| `subject-write-on-behalf` | staff unable to write a record on somebody's behalf — a coach recording a workout for a client is the core loop of a coaching product, and a subject taken only from the caller refuses it outright | **live** |
| `subject-cannot-be-argued` | one customer writing a row into another's history by naming them in the body — the row scope narrowed on read and not on write | **live** |
| `energy-is-derived` | a food row carrying both an energy figure and the macros it comes from — two numbers that disagree the moment anybody edits one, producing a diary whose totals do not match the sum of its rows | **live** |
| `portion-uses-its-own-basis` | a portion scaled as though every food were declared per 100 — which is how a product tells somebody one egg was 620 calories | **live** |
| `over-is-visible` | an overage clamped away by the same number that draws the bar, so somebody 300 calories over is told they are exactly on target | **live** |
| `week-counts-recorded-days` | a weekly average divided by seven rather than by the days with entries — turning three carefully logged days into an alarming number produced by mistaking silence for abstinence | **live** |
| `publish-per-kind` | publishing a way of training removing somebody's way of eating — a data loss they discover in a supermarket | **live** |
| `document-transition-emits` | a document's own transition raising an event no notification declares — invisible in `operations` because nobody wrote those, and arriving at the single most notification-worthy moment the product has | **live** |
| `checkin-freezes-words-not-numbers` | a report copying the numbers it was written beside — the shape that produced three documented bug classes, where correcting a weigh-in left the old value in every check-in that copied it | **live** |
| `submitted-words-stop-moving` | a report that can be quietly rewritten after somebody replied to it, which makes the reply meaningless | **live** |
| `goal-measures-from-the-baseline` | progress computed as current over target — it says somebody at 90 kg aiming for 75 is 120% done before they have lost a gram, and that somebody who gained is doing better | **live** |
| `overdue-is-not-clamped` | a deadline clamped at zero, so a product says '0 days left' forever instead of '11 days late' | **live** |
| `deployment-that-cannot-charge-serves-its-floor` | a self-host, or a deployment before its payment step, held at the parking allowances forever — one of everything, with no plan to buy and therefore no way out, punished for OUR missing configuration | **live** |
| `floor-plan-never-displaces-a-real-one` | a deployment that starts charging quietly re-pricing every workspace that had already bought something | **live** |
| `new-arrival-is-not-a-quiet-one` | somebody who joined on Tuesday listed as having gone silent, because their coach entered the training they already did — a list that cries wolf is worse than none | **live** |
| `silence-counts-from-arrival` | the quietest person on a roster reading as fine forever, because 'days since they last did anything' has no answer and an absent fact reads as nothing to report | **live** |
| `reached-early-is-not-overdue` | a goal past its date raised as missed for somebody who reached it early — a product telling a coach off for a success | **live** |
| `waiting-on-a-reply-comes-first` | the one person waiting on us buried under people who never wrote, which is what a sort by days-since-anything produces | **live** |
| `no-hand-written-table-name` | a table name typed into a handler — every collection route keeps working and only the one query that spells it out 503s, which is how `entrys` shipped as `entries` | **live** |
| `report-average-over-days-logged` | two carefully logged days divided by a twenty-eight-day window — a product telling somebody they ate sixty calories a day, which is wrong, alarming, and produced by mistaking silence for abstinence | **live** |
| `best-set-is-worth-not-weight` | a personal best sorted by what was on the bar, which tells somebody their hardest session was their easiest — and a report showing the estimate rather than the set they actually did | **live** |
| `no-programme-is-not-nought-per-cent` | a consistency bar at 0% for somebody nobody prescribed anything to — an accusation about sessions that a parsing failure or an empty block invented | **live** |
| `report-is-computed-never-kept` | a report written to a table, which is wrong the moment anybody corrects an entry and is wrong silently — nothing about a stale number looks stale | **live** |
| `a-signed-in-stranger-holds-nothing` | the scaffold every app in this repository shipped — `permissions: new Set(roles.owner)` for anybody signed in, which typechecks, passes every other test, and hands any account that finds a workspace's address the owner's powers over it | **live** |
| `a-workspace-has-a-founding-member` | a workspace nobody can enter — directory row correct, tables created, every request 403, and no later step could fix it because inviting somebody requires already being a member | **live** |
| `an-invitation-is-claimed-by-signing-in` | an invitation redeemable only from a link in an email somebody may no longer have, and a roster whose pending half is a second table every screen has to remember to union | **live** |
| `a-member-holds-their-own-role` | a client reaching the roster, the billing lane and every other client's record, because the caller resolver answered with the owner's set for anybody it recognised | **live** |
| `the-last-administrator-stays` | a workspace with its data intact, routing correctly, and nobody able to invite anybody into it — which is not closing it, and has no undo | **live** |
| `a-pending-invitation-occupies-a-seat` | a ceiling anybody passes by inviting twenty people and waiting — the overage arriving days later, all at once, as a bill rather than a refusal | **live** |
| `a-claim-may-only-take-an-unclaimed-row` | signing in with an address that once belonged to somebody else becoming a way into their workspace — identities are global and long-lived, and an address changes hands | **live** |
| `the-customer-is-declared-not-guessed` | a coach resolving as their own customer — holding their client's package while the client holds nothing, with the capabilities screen agreeing with the gate because both are wrong together | **live** |
| `the-founding-role-is-a-capability` | matching on the word `owner`, so an app that calls its administrators anything else founds workspaces whose creator cannot invite anybody | **live** |
| `a-workspace-nobody-could-enter-is-refused` | a manifest that founds unreachable workspaces, discovered by the first person who signs up rather than at composition | **live** |
| `a-declared-permission-is-a-held-one` | an operation refusing every caller forever, including the owner, with a 403 indistinguishable from a permission somebody forgot to grant | **live** |
| `nobody-grants-what-they-lack` | a two-step escalation — anybody who can edit permissions grants themselves the key they lack, then uses it, and the only sign is that somebody has been an owner for a month | **live** |
| `a-narrowing-is-a-diff` | a stored permission set instead of an exception — so a role gaining a key next month reaches nobody who was ever narrowed, and one losing a key keeps working for them | **live** |
| `row-scope-is-discharged` | the obligation `check` returns and nothing performs — any customer holding an ordinary read permission names somebody else's id and is answered, which for a studio's roster is every client reading every other client's packages, days and purchases | **live** |
| `row-scope-does-not-narrow-staff` | a coach locked out of their own clients because the rule was applied to callers it says nothing about | **live** |
| `a-customer-flag-withholds-from-customers` | the customer gate exactly backwards — an absent set defaulting to refused, so the product is withheld from the workspace paying for it while its customers sail through | **live** |
| `a-lapsed-customer-keeps-their-history` | holding somebody's own records hostage over a payment — a customer flag that gated reads would take away every meal, set and measurement they logged themselves | **live** |
| `a-withheld-lens-is-absent-not-empty` | a quietly thinner payload, which makes 'not in your package' and 'nothing recorded' the same answer — so no screen can tell them apart either | **live** |
| `an-exception-is-a-diff` | a replacement set, which freezes somebody at whatever the package said the day the exception was written — so editing the package reaches everybody except the people somebody took the trouble to think about | **live** |
| `a-repair-is-not-a-purchase` | a correction written into the grant ledger, after which 'what have they bought from us' has no answer — and a once-per-customer package can never be sold again | **live** |
| `the-soonest-scope-is-what-warns` | warning on the headline runway, which is a maximum — so somebody with ninety days of training and three of nutrition reads as fully covered | **live** |
| `no-expiry-is-not-an-expiry` | every client who never bought anything at the top of the attention list, which is the fastest way to teach a coach to stop opening it | **live** |
| `a-workspace-with-nothing-configured-can-be-paid` | a manual lane treated as a fallback rather than the default — most workspaces have configured nothing, and a product that needs a provider before anybody can buy anything is a setup screen with a product behind it | **live** |
| `an-intent-grants-nothing` | saying you will pay counting as paying — access applied on the strength of a customer pressing a button, on a platform that is never in the money path and cannot check | **live** |
| `settling-twice-buys-once` | a provider retrying a success it timed out on, or a coach pressing confirm twice, buying the package again — and a read-then-write lets both through on the same second | **live** |
| `an-unverifiable-notice-is-refused` | a public endpoint that grants paid access answering 200 to a workspace with no secret — which is most of them, and turns it into a way in for anybody who can guess a purchase id | **live** |
| `a-stored-credential-may-verify-never-act` | a database of live merchant keys — a signing secret checks a notification came from the workspace's provider; an API key would let this platform charge their customers | **live** |
| `a-once-only-package-is-refused-before-paying` | somebody paying on a page this platform does not control and receiving nothing, with no way here to give it back | **live** |
| `a-customers-purchases-are-their-own` | an optional filter a customer can point at somebody else's id, which is not a filter — it is the hole with a parameter in front of it | **live** |
| `a-destructive-rung-has-a-floor` | archiving somebody a fortnight after a payment slipped — a card expires, somebody is on holiday, an invoice sits in a spam folder — and it is a support incident with no undo | **live** |
| `the-furthest-rung-not-the-next` | a sweep that missed a week walking somebody through every rung it skipped — which for the destructive pair means archiving on the way past to deleting, in one run | **live** |
| `a-lapse-sweep-freezes-on-our-own-arrears` | a workspace the platform suspended quietly shredding a roster it can no longer see — whatever dispute is going on, it is not a reason to act on their customers' records for them | **live** |
| `holding-nothing-is-not-lapsed` | a ladder switched on for the first time archiving every record the workspace ever created, because 'nothing has expired' was read as 'everything expired long ago' | **live** |
| `idle-is-not-a-failed-sweep` | one skip per workspace that has not configured the feature — which is most of them — turning an ordinary deployment into a permanently failing job, the alarm nobody ends up reading | **live** |
| `a-code-tops-up-never-creates` | a leaked code minting access for anybody holding the string — and every attempt burning a use belonging to the person it was given to | **live** |
| `a-refused-claim-spends-nothing` | a spent code decremented past zero on every further attempt, so the uses a workspace is shown counts down forever for a code that no longer works | **live** |
| `erasure-reaches-the-bucket` | a forgotten workspace's files left in the store with nothing naming them — money every month, somebody's photographs on our disks after they were told they were gone, and no way to find either short of listing the bucket by hand | **live** |
| `the-rows-outlive-the-bytes-or-nothing-does` | one failed object delete turning into a permanent leak, because the cascade behind it drops the only index of the key and reports a complete erasure | **live** |
| `a-media-field-is-checked-against-the-ledger` | a declared accept list enforcing nothing, so a face can be a video or a file that is not there — and it renders as a broken image on a screen a long way from the write that caused it | **live** |
| `every-write-that-sets-a-file-checks-it` | the check landing on the create alone, leaving the same unverified id one save away — and the save after the first is the write a form actually makes | **live** |
| `a-file-in-use-is-not-deleted` | a delete pressed in the library leaving a broken image on a screen somewhere else, with nothing connecting the two | **live** |
| `a-media-field-no-upload-can-fill` | a form control nobody can use, discovered at the save after the upload has already succeeded | **live** |
| `no-model-without-a-hold` | a generation path that reaches a provider before anything is held, so every call the balance could not cover is one the platform pays for and can never bill | **live** |
| `a-missing-runner-never-invents` | a platform-side mock reachable by getting a binding wrong — the shape that had a product returning fabricated clinical values and charging for them | **live** |
| `a-missing-runner-costs-only-generation` | a model runner treated like a missing database, so a deployment that simply has no AI answers 503 on every route it has | **live** |
| `one-call-at-a-time-against-one-balance` | two callers both reading a sufficient balance and both running — an overspend that is not a wrong number but a second provider call nobody can be billed for | **live** |
| `a-ceiling-per-person-per-day` | a balance spent by whoever asks first, emptied by one person looping a draft, with a bill as the only signal | **live** |
| `the-declared-prompt-is-the-sent-prompt` | a reserve computed from one document and a request made with another — the shape unit tests over each half separately stay green through | **live** |
| `an-unmetered-model-is-refused-at-composition` | a rate of zero holding nothing and charging nothing while the provider still invoices, so the model looks like the cheapest in the catalogue until the end of the month | **live** |
| `a-product-rule-runs-on-every-derived-write` | a rule written into a bespoke operation while the derived create stands beside it making the same row without the check — which is what a form actually calls | **live** |
| `a-rule-sees-the-merged-row` | a rule handed only the changes, or handed them under column names, so every lookup is undefined and every update passes | **live** |
| `a-subject-scoped-row-says-whose-it-is` | staff reading a whole workspace's subject-scoped rows through the same list and getting a column of records with nobody's name against any of them | **live** |
| `a-draft-is-not-in-the-feed` | a studio's unfinished thinking sent to the people it coaches | **live** |
| `the-door-beside-the-feed-is-shut` | a correct feed beside a collection read the same person holds, so every draft in the studio is one request away | **live** |
| `the-operator-door-is-the-only-door` | a console rendered inside a workspace by somebody who holds none of it — the previous generation shipped exactly that, drawing every panel and 404ing on every call | **live** |
| `a-comp-stops-the-ladder` | a comped workspace keeping its dunning anchor and being suspended on schedule for an invoice nobody is waiting for, with the row reading active throughout | **live** |
| `an-adjustment-is-absolute-and-clearable` | an operator setting shared with the grandfathering blob, where raising a ceiling is a one-way door whose only undo discards what a workspace was originally sold | **live** |
| `one-intent-is-one-grant` | a double-submitted form giving a workspace twice what somebody meant to give them, behind two identical 200s | **live** |
| `a-closed-deployment-says-something` | a product that has simply vanished, with nothing for whoever is holding it to tell the person in front of them | **live** |
| `the-switch-does-not-close-its-own-door` | a maintenance switch nobody can turn off, because the way out of maintenance is a request | **live** |
| `a-deployment-key-is-not-held-inside-a-workspace` | a workspace owner holding the key to the payment dead letter and the scheduler's run table — both of which are the whole deployment's, so it is a cross-tenant read with a screen in front of it | **live** |
| `a-secret-is-write-only` | a console that can display a payment provider's key — leaked through a screen share, a support session, or any read vulnerability | **live** |
| `an-unshared-key-cannot-reach-the-shared-store` | a per-endpoint secret written where every app resolves it, invisible until a second product fails verification with no trace of where the value came from | **live** |
| `chargeable-is-read-not-declared` | a gate claiming the deployment can charge while the payment provider has no key — every workspace on a self-host stranded in setup over our own misconfiguration | **live** |
| `the-mode-picks-the-lane` | a checkout that fails at the till, because both lanes are stored at once and a deployment answered yes on the strength of the wrong one | **live** |
| `an-undeclared-key-is-refused-not-stored` | a row an operator can see on a screen and no consumer will ever read, which is indistinguishable from a setting that does not work | **live** |
| `a-refusal-is-not-a-crash` | reaching for a store that is not there, which throws into the same 503 a stated refusal produces — so the status alone cannot tell 'we told you' from 'it fell over' | **live** |
| `a-rate-is-corrected-in-one-place` | a price change that waits for a deploy per app — and while it waits, the reserve under-counts and the platform pays the difference on every call | **live** |
| `a-published-rate-cannot-be-unmetered` | one row making a model free for every app behind the store, while the provider invoices as usual | **live** |
| `a-catalogue-row-cannot-become-a-feature` | a rate saved for something no reserve reads, because the system text, the output ceiling and the daily bound are the app's and nothing here supplies them | **live** |
| `unbound-changes-nothing` | a single-app deployment broken by a sharing mechanism it does not use | **live** |
| `nothing-leaves-while-anything-is-missing` | a best-effort send to nobody, or a queued retry — either way a person waiting for a code that was never addressed to anybody | **live** |
| `the-recorded-provider-is-a-choice` | a fallback reachable by getting config wrong — a production deployment recording its sign-in codes in a map and answering as though the mail went out | **live** |
| `a-sender-is-split-the-way-the-provider-wants` | a MIME message the send binding rejects outright — bare newlines, a missing Message-ID, or a Content-Transfer-Encoding header that disagrees with the body, which shows the person the base64 of their own sign-in code | **live** |
| `a-code-that-could-not-be-sent-is-not-a-code` | telling somebody to check their inbox for a message that was never addressed to anybody | **live** |
| `a-rule-sees-whose-row-it-is` | a rule that narrows by customer handed a row belonging to nobody, taking its 'not enough to judge' branch and passing every update | **live** |
| `reading-what-was-prescribed-is-not-prescribing` | a coaching record turned self-service by one line, because `supplement:write` sat next to `dose:write` in a list | **live** |
| `a-package-belongs-to-one-workspace` | two workspaces that both name something `full` sharing one row — the second to save overwriting the first's price, capabilities and days, and taking the row's tenant with it, so the package MOVES between workspaces | **live** |
| `a-subject-table-carries-its-own-column` | an app scoping one table to a client and another to a coach, where the module keeps whichever was declared last — so forgetting a client runs `DELETE … WHERE coach_id = ?` against a table that has no such column, the purge catches the throw as "this table is absent", and a complete erasure is reported over rows that are all still there | **live** |
| `a-collection-speaks-one-vocabulary` | reads handing back storage while writes take declarations — `how_it_went` for a field called `howItWent`, `1` for a bool, a JSON column as its own text — so the obvious read-edit-write client sends a string back into a json column, the next read parses to a string, and nothing throws at any point | **live** |
| `a-json-column-says-what-it-holds` | a `json` field whose named schema is a comment, so the column takes any shape — and a reader walking keys it never finds returns its input unchanged, copying a week with no progression and reporting success with every number correct | **live** |
| `a-key-nobody-declared-is-not-dropped-from-a-record` | a body stored WHOLE quietly losing what the caller sent — the write answers 200 and the record in the column is not the one they believe they saved | **live** |
| `a-field-may-be-narrower-than-its-row` | an answer only the studio may give, put behind its own operation while the derived update beside it still takes the field — a lock beside an open window, so the person who asked the question marks it allowed themselves | **live** |
| `a-starting-value-is-declared-not-demanded` | a field that is required AND write-restricted, which is a collection the person the feature is for cannot write a row into — the declaration refusing its own use | **live** |
| `forgetting-somebody-takes-the-trail` | the activity trail being tenant-scoped where the cascade is subject-scoped, so "forget this person" leaves a dated list of every time their record was touched — and reading the ids after the rows go finds nothing to attribute, to anyone, including us | **live** |
| `an-answer-is-not-given-by-the-person-asking` | a swap request the client opens with `swap:write` and then allows with the same permission through the derived update | **live** |
| `a-photograph-is-metered-as-a-photograph` | a vision call metered on its words alone — the provider bills a flat block of input units for the picture, the reserve holds none of them, the cap settles at the words, and the platform pays the difference on every photograph while every call succeeds | **live** |
| `a-vision-feature-needs-a-model-that-prices-pictures` | a catalogue where the cheapest-looking line is the one running up the largest invoice, because nothing at runtime would ever report it | **live** |
| `a-picture-is-priced-per-picture` | an image forced through the token arithmetic, holding the cost of the sentence that asked for it — and a request for four that held the price of one | **live** |
| `the-picture-and-the-declaration-agree` | an image attached to a feature whose reserve was computed for text — which SUCCEEDS, answers well, charges a fraction, and leaves the provider's bill with us | **live** |
| `a-generated-picture-lands-in-the-library` | bytes handed to a browser that nothing counts against the workspace's storage, nothing erases when it closes, and nothing can serve again — so keeping it means generating it a second time and paying again | **live** |
| `a-picture-read-is-a-picture-the-workspace-holds` | one workspace's photograph read by another's request — and a lookup that forgot its tenant binding refuses an invented id while serving a real one, so only a real foreign id finds it | **live** |
| `a-refusal-keeps-its-own-words` | the generic code written over the specific reason, so "that picture is not in this workspace", "this asks for a picture and none was given" and a missing model binding all read as one word nobody can act on | **live** |
| `a-setting-is-declared-not-scattered` | three readers each deciding what an absent row means — a lapse policy read as "never" by a sweep and "fourteen days" by the screen that shows it, neither throwing | **live** |
| `a-tenant-colour-is-a-colour` | anything a CSS parser would take being stored as a workspace's accent — a `url(...)` or a variable reference injected into a stylesheet this product renders for other people, which is a stored injection wearing a colour picker's clothes | **live** |
| `a-setting-may-be-narrower-than-its-screen` | one control on a settings screen that withdraws something from every customer of the workspace, reachable by anybody who may open the screen at all | **live** |
| `branding-reaches-the-screen-that-cannot-ask` | a sign-in screen wearing the product's name and correcting itself, because the branding lives only in a regional store the pre-session screen cannot reach | **live** |
| `a-claimed-domain-routes-nothing` | a hostname served on the strength of somebody typing it — and the thing typed may belong to a competitor, a bank, or another workspace on the same deployment | **live** |
| `the-dns-verdict-is-ours` | a caller reporting its own verification result — a custom domain anybody takes by sending {verified: true} | **live** |
| `a-verification-token-survives-a-second-claim` | somebody who has already published the DNS record pressing the button again and never being able to verify, because what they published no longer matches what we look for | **live** |
| `a-domain-is-released-by-its-own-workspace` | a claim table keyed on the hostname alone, where a delete without the tenant binding takes somebody else's address down | **live** |
| `a-price-is-not-a-deploy` | a catalogue screen the resolver never reads — raising a limit for a customer who paid for it changes nothing, and the only symptom is a refusal they were told would not happen | **live** |
| `editing-a-plan-down-holds-existing-subscribers` | a workspace losing seats it paid for mid-period with no notice, because `grandfathered_json` was read by the resolver and written by nothing | **live** |
| `unlimited-is-the-top-not-a-small-number` | -1 compared arithmetically, so "you had unlimited and now have five" records no snapshot at all — silently, for exactly the workspaces with the most to lose | **live** |
| `a-problem-sentence-has-no-holes` | "Your plan includes undefined, and undefined are in use" — a detail template rendered against meta a raise site never supplied, which nothing throws on because the missing value is a legal undefined | **live** |
| `a-score-says-what-it-was-computed-from` | a wellness score of 82 from two inputs looking exactly like one from five — somebody told they are doing well because they slept once | **live** |
| `an-absent-input-is-not-a-zero` | a score that falls hardest in the weeks people log least — which are the hard ones, and the ones the score is read in | **live** |
| `a-fast-nobody-started-is-not-hour-zero` | "Fed — still digesting" shown to somebody who has not begun, which reads as a working timer stuck at zero | **live** |
| `a-finished-fast-stops-counting` | a timer that keeps counting a fast somebody stopped last week, which reads as one nobody can turn off | **live** |
| `two-photographs-are-the-same-pose-or-nothing` | a front and a side compared as though they were the same angle — a change shown to somebody about their own body that is not there | **live** |
| `one-photograph-is-not-a-comparison` | the same picture shown twice, which reads as "no change" to the one person who most wants there to be some | **live** |
| `a-file-purpose-says-who-may-upload` | one permission on the upload operation giving every kind of file the same answer — which shipped as a client who could not upload at all, so every camera feature built for them was refused at its first step on a different operation | **live** |
| `a-purpose-names-a-permission-somebody-holds` | an upload nobody can make, failing as a 403 on a screen that offered the control | **live** |
| `a-number-is-read-from-its-one-home` | a score computed from a copy on a weekly report — correcting the original then leaves the score saying something else, and neither throws | **live** |
| `a-shelf-shows-what-is-sold` | a price list showing what the app was declared with while the gate enforces what the deployment currently sells — a customer told a plan includes three and given ten, with a receipt that agrees with neither | **live** |
| `a-preview-reads-the-sold-catalogue` | somebody told what they would gain under ceilings the deployment stopped selling — a promise broken at the moment it is made | **live** |
| `buying-credits-grants-none` | a balance anybody refills by calling the purchase endpoint | **live** |
| `an-unpayable-purchase-refuses` | a pending purchase nothing will ever settle — a workspace waiting for credits that are not coming, with no signal at all | **live** |
| `a-billing-link-goes-somewhere` | "manage billing" opening nothing, which is a bug somebody reports where a sentence would have been an answer | **live** |
| `self-registration-is-off-until-a-studio-says` | anybody who guesses a workspace's address becoming a client of it — consuming a seat, appearing on the roster, a stranger among the people it coaches | **live** |
| `an-open-door-has-a-ceiling-of-its-own` | a plan quota checked against the CALLER's entitlements where the caller belongs to nothing yet — so an open studio is one anybody can push past its own plan | **live** |
| `registration-is-not-a-membership-oracle` | type an address, learn whether that person is coached here — a disclosure on its own for a health product | **live** |
| `a-roster-count-is-not-an-active-count` | the number that flatters — it only ever goes up, and it goes up fastest when nobody is being coached | **live** |
| `a-request-is-not-its-own-answer` | a client marking their own swap allowed and a coach agreeing to their own release — both open because the asker must hold the collection's write permission in order to ask at all | **live** |
| `a-credit-pack-grants-something-and-costs-something` | a purchase that succeeds and moves no balance, or a tap anybody refills from for free | **live** |
| `an-outbound-request-is-a-declared-host` | server-side request forgery through a caller's own value — a barcode carrying `../`, a query, or a whole other host, pasted into a URL template and requested from inside our network | **live** |
| `a-service-is-declared-by-host-not-by-url` | a declaration carrying a path, a scheme, a wildcard or a query — every one of them somewhere a caller's escaped value ends up meaning something | **live** |
| `somebody-elses-answer-is-bounded` | a third party having a bad day becoming a worker that runs out of memory, on a request nobody could have predicted | **live** |
| `a-queued-write-lands-once` | a phone that lost the ANSWER to a write replaying it and logging the set twice — in the record, forever, with nothing throwing | **live** |
| `a-replay-key-belongs-to-one-person` | two clients whose apps mint keys the same way swallowing each other's writes | **live** |
| `a-notification-actually-leaves-the-process` | every notification whose channel says email being resolved, rendered, counted and dropped — the mechanism-with-no-surface failure, inside the platform | **live** |
| `a-workspace-rewords-only-what-it-sends` | a business rewriting its own arrears notice into something reassuring, for staff who then do not act on it | **live** |
| `a-rephrasing-cannot-invent-a-value` | an email reading `You paid {amount}` to a paying customer, because render leaves an unknown token in place | **live** |
| `every-platform-table-is-in-a-scope` | an erased workspace keeping its purchase history, its lapse policy, its unspent codes and its payment provider's verify secret, while the sweep reports success | **live** |
| `a-public-page-does-not-name-a-roster` | a shopfront answering before there is a session and carrying a customer's name, address or id to the whole internet | **live** |
| `a-workspace-list-is-intersected-with-membership` | the directory being global, so a list built from it alone hands everybody the name of every business on the deployment | **live** |
| `last-time-is-not-this-time` | the first set somebody logs becoming what they are told they did last time — so the number they work against climbs with them all session | **live** |
| `a-discount-is-spent-when-money-moves` | a code for twenty exhausted by twenty people who looked at a price and closed the tab | **live** |
| `a-code-that-does-not-work-is-refused` | quietly charging full price to somebody who typed a code, discovered from a receipt on a page we do not own | **live** |
| `a-discount-rounds-towards-the-customer` | a business quietly charging one minor unit more than its own poster said, on every sale, forever | **live** |
| `ci-runs-the-guards` | a workflow that decides whether a change merges and ships without running the command a third of the guards live behind — which is how 36 of them ran only on the machine of whoever remembered | **live** |
| `a-declared-registry-is-read` | a registry declared, validated, guarded and unreachable — help checked for length and vocabulary that no route served, legal documents with mustAccept roles against no ledger, and twenty-one versions of release notes the runtime never read | **live** |
| `a-collection-does-not-shadow-a-lane` | a collection named after a word the platform already uses silently replacing a platform operation — nobody wrote the colliding line, and the only symptom is a route answering about the wrong thing | **live** |
| `consent-is-per-version` | an acceptance recorded against a document rather than a version, so publishing new terms silently inherits every consent ever given | **live** |
| `consent-comes-from-a-person` | a model agreeing to terms on somebody's behalf, which makes the ledger worthless as evidence — the only thing it is for | **live** |
| `a-channel-is-a-promise-about-delivery` | a switch in a settings screen that silently does nothing — somebody turns it on and stops watching their inbox | **live** |
| `a-declaration-is-consumed` | a manifest field an app can write that changes nothing — declared, validated in the file that declares it, and read by no other code, which is the shape that shipped help, legal, releases, an unenforced rate limit, an unread retention policy and an impersonation contract with no surface | **live** |
| `a-door-not-declared-is-closed` | a manifest declaring which doors an app has while host resolution ignores it — an app that says it has no setup door creating workspaces there, and one that says it has no custom door resolving anybody's domain | **live** |
| `a-session-reaches-what-was-declared` | every session widening to the app root whatever the manifest asked for, so a product that wanted one jar per workspace silently got one for all of them | **live** |
| `export-then-purge-is-an-obligation` | reading a promise about the ORDER of two operations as a ban on one of them — which withholds from an export exactly what the declaration asked to be exported first | **live** |
| `a-retention-limit-deletes` | a per-collection retention limit that nothing enforces — a number in a manifest against rows that are still on disk, which is the difference between what a privacy notice says and what a subpoena finds | **live** |
| `a-sweep-reports-what-it-removed` | a sweep reporting its ceiling rather than its count, which makes one that removed nothing indistinguishable from one that removed five hundred | **live** |
| `the-audit-is-written-down` | every operation's audit entry built, collected into an array and thrown away at the end of the request — every operator action, every money movement, recorded nowhere, with the code producing the entries perfectly correct | **live** |
| `acting-as-somebody-is-bounded` | a support session with no ceiling, or one whose ceiling the request decides — a time box a caller sets is not one | **live** |
| `acting-as-somebody-is-announced` | a support session nobody inside the workspace is told about, which is indistinguishable from somebody having got in | **live** |
| `ending-keeps-the-evidence` | an operator who can delete their own support session, and with it the only record of what they did in it | **live** |
| `a-query-names-its-tenant` | a hand-written query that forgets its tenant predicate — it returns every workspace's rows, answers 200, renders perfectly and looks entirely ordinary in review | **live** |
| `a-read-is-bounded` | a list whose size is the workspace's own row count — it works until the largest one crosses a limit, then fails, is retried, fails at the same size, and the feature stops for the customer who uses it most | **live** |
| `no-wall-clock-in-a-handler` | a handler reading the wall clock, whose behaviour cannot be pinned by a test and whose replay does not reproduce the run it is replaying | **live** |
| `a-write-speaks` | a write somebody cannot see happen that says nothing — five of them spent a workspace's credits and answered with nothing a screen was told to say, so the person does it again | **live** |
| `a-consent-refers-to-something` | a legal document declared with no text and no address for it, so every row in the consent ledger is evidence that somebody agreed to something nobody can produce — which is the one thing it would ever be asked for | **live** |
| `a-collection-says-what-it-holds` | a collection declaring it holds nothing personal while carrying an email address — the declaration is one line, and one line is exactly what somebody writes to make a check go away, so without this it measures diligence rather than truth | **live** |
| `a-special-category-names-its-condition` | health, biometric or genetic data held with a lawful basis and no Article 9 condition — which is not undocumented processing, it is prohibited processing | **live** |
| `a-health-vocabulary-cannot-declare-itself-usage` | a collection whose own field names are weight, sleep or bodyfat declaring only ordinary categories, which understates the whole regime that applies to it | **live** |
| `every-recipient-is-disclosed` | a model, an outbound service or a payment rail the manifest reaches and the sub-processor list does not name — the failure every hand-maintained list has, because nothing anywhere connects adding a feature to disclosing where its data goes | **live** |
| `no-disclosure-nothing-reaches` | a company disclosed as receiving data that receives none — a false disclosure in the direction that looks careful, and the entry nobody ever removes. It found one on its first run | **live** |
| `personal-data-obliges-a-dpa` | a product holding personal data with no privacy notice and no Article 28 processing agreement, both owed at a moment nothing anywhere marks | **live** |
| `a-special-category-obliges-an-assessment` | an app storing health data answering that no impact assessment is required — not a judgement, but the one claim the collections in front of it contradict | **live** |
| `the-record-of-processing-is-produced` | an Article 30 record that exists as a spreadsheet rather than as a computed answer, describing the product as it was when somebody last had time | **live** |
| `the-recipients-are-public` | a sub-processor list published behind a session, which is publishing it after the moment Articles 13 and 14 oblige it | **live** |
| `a-mail-lane-is-disclosed` | a mail provider a deployment may choose that no sub-processor list names — a provider is added in a file about HTTP and a recipient is declared in a file about the law, and nothing else connects them | **live** |
| `a-removed-lane-is-refused-not-replaced` | a deployment still configured with a dropped provider silently falling through to whichever lane remains — a sign-in code sent through a company the operator did not choose, while the disclosure stays technically correct | **live** |
| `a-region-is-a-different-store` | residency that is a column rather than a database — a workspace told its records are in the EU while every query reads the same store as everybody else | **live** |
| `an-undeclared-region-is-refused` | a workspace quietly placed somewhere other than where it asked to be, which is the one failure residency cannot have and a default is exactly how it happens | **live** |
| `the-model-is-the-workspace-s-decision` | a manifest naming one model for every workspace on every deployment — 'which company reads my clients' records' decided by whoever wrote the catalogue | **live** |
| `a-stale-choice-does-not-pin-a-workspace` | a workspace pinned to a model an operator disabled or a region stopped permitting, surfacing as a provider error months after the change that caused it | **live** |
| `the-region-outranks-the-manifest` | a product's default model running in a region that does not permit it, for every workspace that never chose one — which is the exact promise residency is | **live** |
| `a-model-is-never-substituted` | quietly running a different model than the one decided — a workspace's data sent to a company it did not choose, at a price nobody quoted, with the bill as the only signal | **live** |
| `the-reserve-budgets-what-runs` | a reserve computed for the manifest's model while a workspace's dearer choice runs — the cap settles at the cheap price and the platform pays the difference on every call, silently | **live** |
| `a-model-suits-what-it-is-priced-for` | a vision feature pointed at a text model, whose reserve is computed from the prompt alone and settles at almost nothing while the platform pays for every picture | **live** |
| `every-region-says-what-it-permits` | a residency promise that stops at storage — the allow-list mechanism existed, generate enforced it, and no app ever declared one, so an EU workspace's photographs went to exactly the same models as everybody else | **live** |
| `the-region-s-model-list-is-published` | a workspace choosing a region without being able to read what still leaves it — and a published claim that can differ from the binding the runtime enforces | **live** |
| `a-consent-is-enforced-not-merely-recorded` | a consent ledger nothing gates — outstandingFor was computed by one read operation and read by no route, so a person could use an entire product forever without accepting the terms, the privacy notice or the processing agreement while the ledger faithfully recorded that they never had | **live** |
| `a-consent-gate-never-withholds-reads` | somebody's own records withheld because they have not clicked anything — punitive, helps nobody, and not what Articles 13 and 14 ask for, which is about the moment of collection | **live** |
| `agreeing-does-not-require-having-agreed` | a gate that refuses the acceptance itself, or the sign-in that reaches the document, or the exit a person who declines needs — each of which makes the product unusable rather than compliant | **live** |
| `the-product-s-own-lanes-are-not-exempt` | an exemption list that grew until it covered the writes that actually collect data, leaving a gate that refuses nothing anybody does | **live** |
| `special-category-needs-explicit-consent` | fifteen collections declaring condition: explicit_consent while nothing anywhere collected any — a manifest asserting a legal basis the product did not have, which is worse than declaring the wrong one because it reads as diligence | **live** |
| `consent-can-be-withdrawn` | a basis that cannot be withdrawn, which is not consent but a different basis wearing the word — Article 7(3) requires withdrawing to be as easy as giving | **live** |
| `a-withdrawal-keeps-the-evidence` | deleting the row on withdrawal, which destroys exactly the evidence needed to show the processing that already happened was lawful | **live** |
| `self-registration-records-its-own-consent` | a self-registered person on the roster whose every log, measurement and check-in is refused, with no screen anywhere explaining why | **live** |
| `the-transfer-register-is-a-join` | a transfer register written from what recipients CLAIM to receive rather than from what the product holds — over-disclosure in the direction nobody checks, making a transfer look larger than it is | **live** |
| `every-recipient-appears-in-the-transfers` | a sub-processor disclosed in one place and absent from the transfer register — the artefact every questionnaire asks for, answerable only by joining what is held to who receives it, and wrong by the next feature in every company that writes it by hand | **live** |
| `a-missing-send-binding-has-its-own-name` | a deployment configured to send through Cloudflare on a worker with no send_email binding, reported as a refused send — which sends an operator to look at DNS for one line of wrangler.jsonc | **live** |
| `vault-registry-is-coherent` | a fact declared twice, a reading not namespaced under its fact or not listing it as an input, a device-sealed fact claiming a server-side derivation, or a recommendation with no argument beside it | **live** |
| `vault-reading-states-what-it-hides` | a derivation that does not say in writing what it cannot reveal — a derivation discloses less than its input only if somebody checked, and that sentence is the check | **live** |
| `vault-sealed-facts-derive-nothing` | a fact sealed to the person's own device that declares a reading, which no server can compute — a promise the arithmetic cannot keep rather than one merely unimplemented | **live** |
| `vault-owns-the-fact` | a collection field that shadows a vault fact — a second copy is a disclosure that outlives every grant over it, and the consent controls go on working against data no screen reads | **live** |
| `vault-want-says-why` | an app asking for a fact with no reason, asking twice for one fact, or recommending more exposure than the fact's own registry entry does | **live** |
| `vault-columns-exist` | a statement in the vault store naming a column its table does not have — a rename swept every occurrence of one word except the one inside an ON CONFLICT clause, which typechecked, passed fifty resolver tests and threw only on a re-share | **live** |
| `a-reading-discloses-less-than-its-input` | a derivation that hands back a value it was built to withhold — the natural way to write "how much have they changed" is to return the two endpoints | **live** |
| `emptiness-is-not-disclosed-to-a-stranger` | a reader with no grant being told the person has recorded nothing, which is itself a fact about them and one nobody granted | **live** |
| `a-session-is-revoked-in-both-stores` | an account-scoped delete on one store paired with an unscoped one on the other — anybody signed in could end any session in their region whose id they had, leaving the row listed and the session dead | **live** |
| `our-own-domains-are-not-a-tenant-claim` | a hostname we own falling through to the custom-domain lookup, which asks which TENANT registered it — the sharpest form of the takeover the reserved list exists to prevent | **live** |
| `an-alias-cannot-borrow-a-credential` | a second registrable domain asserting the platform's relying party — WebAuthn cannot span registrable domains, so the sign-in screen would offer a passkey the browser will never find | **live** |
| `vault-a-want-asks-at-its-reader` | an app whose only reader is its own assistant having to ask for the human rung. Inferred from the need alone, every raw want asked at `staff` — so a model that needed a value could only reach it by the person first exposing it to everybody with a role. Over-asking is what the ladder exists to prevent, and the platform was structurally forcing it | **live** |
| `vault-a-reader-is-refused-where-it-does-nothing` | a reader named on a compute or derived want, where nothing but the server ever reads the value. The field would change no rung, refuse no read and appear in no sheet — a declaration that quietly does nothing is one somebody believes is working | **live** |
| `vault-offers-no-rung-a-want-cannot-spend` | the offered rungs listed beside the asked rung rather than derived from it. Written as its own table the two disagreed within a day — a derived want asked at `compute` while the table offered all four, so the vault invited somebody to hand over a raw number for a feature that had only ever asked for a direction | **live** |
| `a-member-can-leave` | a workspace nobody but an administrator can get out of — `member.remove` wants `member:manage`, which somebody removing themselves does not have, and `exit.close` wants `workspace:close` and takes the workspace down for everybody, so a reader invited once was in for life | **live** |
| `leaving-cannot-strand-a-workspace` | a workspace that is not closed but unreachable — records intact, bill running, and nobody left who can invite anybody into it. One rule (`wouldStrand`) asked by both doors, so it cannot hold on the administrator's and not on the account's | **live** |
| `leaving-is-not-an-existence-oracle` | any signed-in account discovering which workspace ids are real, one guess at a time, from a door every account can reach | **live** |
| `a-founder-is-in-their-own-workspace` | `invite` writes an address with no account behind it — right for an invitation, wrong for the founder, who is standing there. Every cross-workspace question is asked by account, so an unclaimed founding row makes somebody absent from their own account centre and lets closing their account strand a workspace nothing can see they are alone in | **live** |
| `closing-an-account-never-closes-a-workspace` | an account closure that takes colleagues offline with it — a workspace has people, records and a bill, and the person surprised by it pressed nothing. Refused and NAMED, so it is a decision the person can act on rather than an opaque no | **live** |
| `closing-an-account-is-reversible` | a delete behind a confirmation dialog, which is a reflex rather than a decision. The way back is cancelling, not signing up again — that would be a different account | **live** |
| `leaving-is-on-the-lane-that-always-survives` | naming these `me.*` — a write outside the `exit` lane is refused by the standing gate on a suspended workspace and by the consent gate for anybody who has not accepted a new document, so leaving would be withheld from exactly the two groups most likely to want it, and neither refusal mentions leaving | **live** |
| `a-person-can-take-their-own-data` | the only export in the product being the WORKSPACE's — `exit.export` wants `workspace:close`, so an ordinary member may not ask for it, and what it returns is mostly not theirs | **live** |
| `an-export-includes-who-read-the-vault` | an export missing the only part somebody cannot reconstruct. Their own facts they know; who looked at them, and when, exists nowhere else | **live** |
| `an-export-is-nobody-elses-to-ask-for` | an export keyed by an id in the input, where the access check is a line somebody has to remember. Keyed by the session there is nothing to forget | **live** |
| `no-membership-is-no-role` | calling every signed-in person an owner on a door with no workspace. The consent gate believed it: a Kova client opening the account centre was told they owed the Terms of service and the data processing agreement — both `mustAccept: ["owner"]` — and answered 451 on their own preferences until they agreed to a contract between the platform and a studio | **live** |
| `a-person-owing-nothing-can-use-their-account` | 451 `platform.consent_required` on the account door — not a permission failure, does not read like one, and about a document that was never theirs | **live** |
| `agreeing-survives-a-closed-gate` | a deadlock: `legal` was exempt from the CONSENT gate and not from the STANDING one. A workspace held read-only cannot write, accepting is a write, and the document is what stands between it and being able to act — so a studio that never chose a plan could not accept the terms that would let it choose one, and the refusal said nothing about documents | **live** |
| `a-declaration-reaches-the-account-centre` | `publishVaultSpec` binding its parameters as an ARRAY where `run` takes them one at a time — D1 answered D1_TYPE_ERROR and a bare `catch {}` swallowed it, so `vault_specs` was empty for the life of the feature and the account centre showed nobody's vault. Every suite was green: the publish is total by design, the read falls back to an empty list, and an empty account centre looks exactly like one belonging to somebody who has shared nothing | **live** |
| `legal-answers-for-every-product` | `legal.list` answering for the app behind whichever door was used. A person is an owner in one studio, a client in another and a member of a third product, and they owe three different sets — so the one screen that exists to answer across products could not | **live** |
| `legal-says-nothing-about-a-product-you-are-not-in` | every app on the deployment publishes here, so listing all of them tells somebody about products they have never used — and asks them to agree to the terms of one they do not | **live** |
| `a-workspace-you-left-is-not-yours` | `mineIn` reading membership without `revoked_at IS NULL`. The row is revoked rather than deleted — deliberately, so who was in a workspace and when survives — so every reader has to say it means a PAST membership, or a workspace somebody left stays on their list for ever | **live** |
| `a-disclosure-belongs-to-its-own-product` | cross-app documents over a single-app disclosure — a person in three products reading one product's recipients under all three products' terms, with nothing on the screen saying which. Each app publishes its ASSEMBLED disclosure beside its documents, assembled because the regions, the inference map and the transfers are computed from the deployment rather than declared | **live** |
| `shot-id-resolves` | a screenshot id the suite does not produce. RE-TARGETED to stage 7: a screenshot suite needs screens worth photographing, and the only app on the platform has one | stage 7 |
<!-- /generated -->

⚠️ **AND A LEGAL DOCUMENT CARRIES ITS TEXT.** `LegalDoc` was
`{ id, version, mustAccept }`, so the consent ledger recorded that somebody
agreed to `terms@2026-01-01` and the text of `terms@2026-01-01` existed nowhere —
not in the manifest, not on a page, not in the repository. **A ledger pointing at
nothing is worse than no ledger**: it manufactures evidence that somebody agreed
to something that cannot be produced, which is exactly the document anybody would
ask for it about. `legalProblems` refuses a document carrying neither text nor an
address for it, and Kova now declares both notices in full.

⚠️ **RESIDENCY STAYS AT THE TENANT, and per-user residency inside a tenancy is
refused rather than deferred.** Four reasons, none of which changes: the
CONTROLLER is the tenant, so residency is a controller-level commitment and
modelling it per person would be us promising on behalf of somebody who did not;
a workspace's data is relational and does not split, so one workspace across two
databases makes every list a cross-region join and runs the erasure cascade twice
with no transaction spanning them; routing per person needs the region BEFORE the
identity, which is a global map of email → region — precisely the personal data
`directory-columns` exists to keep out; and GDPR requires a lawful basis for
transfer plus the rights already built, not that each subject's rows live in
their own region. What earns instead is §4.2's own conclusion — residency as a
PLAN attribute, with a per-region sub-processor allow-list, which is a manifest
declaration and a gate exactly like an entitlement.

⚠️ **AND A DECLARATION NOTHING ACTS ON IS DECORATION.** `kernel-declaration-consumed`
is the general form of the failure this document keeps recording one instance of
at a time: every field on every `*Spec` must be read by some file other than the
one declaring it, because the declaring file is exactly where validation lives
and validating something nobody consumes is what made `help`, `legal` and
`releases` look covered. Fifteen fields are carried in its `UNCONSUMED` list with
what each would do — six waiting on the renderer, one consumed outside the
directories the check can see, and **eight real gaps**: an app's declared
`doors` that host resolution ignores, per-collection `retention` the erasure
cascade does not read, `meter` and `rateLimit` on an operation that meter and
limit nothing, `impersonation` with no surface at all, `auditRetentionDays` that
prunes nothing, `weekStart` that every weekly read ignores, and `sessionScope`
the cookie logic does not consult. The list may only shrink.

⚠️ **AND THE COMMAND HAS TO BE RUN BY SOMETHING NOBODY HAS TO REMEMBER.** The
registry checked that a script NAMED each guard, and said yes for all 36
script-implemented ones while neither workflow ran `pnpm gate` — both ran
`turbo run typecheck test`, which is not the root `test` script and never
reached it. So a third of the enforcement in this repository ran only on the
machine of whoever remembered, including every check that guards the guards.
`guards.test.mjs` now asserts that `ci.yml` and `deploy.yml` each name every
command a live guard depends on.

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
| 1 | **Kernel** — bindings from manifest, config, schema composition, shared identity + root-scoped passkeys, tenancy + doors, **region resolution and the global tenant directory**, standing. | A generated `hello` app boots, signs in with one passkey usable from a second app's origin, creates a tenant, answers `/health` — and no handler has seen a raw binding. ✅ `platform/hello` boots through `platform/runtime` on the real host topology, composes its schema per region, creates a workspace, signs a person in with an emailed code, registers a passkey at the ROOT relying party and signs in with it from a second origin. Open: review |
| 2 | **Surface** — operations → routes + tools + webhooks + audit + OpenAPI. | ✅ An agent lists tools, completes a CRUD round trip and is refused exactly what the user would be — asserted over the whole catalogue rather than sampled. Input is parsed at the boundary rather than asserted |
| 3 | **Data** — collections, docstatus, naming, activity, soft delete, ledger, files, jobs, search, **and tenant relocation (§4.2) with the `Relocatable` DO contract**. | ✅ `hello` declares two collections and writes no routing at all: list, read, create, update, archive, the document lifecycle and the activity log are derived. A metered ledger sums rather than stores, and a tenant copies to a second region, verifies by counting, and leaves the source bootable. Files and jobs landed in 6.5. Open: nothing |
| 4 | **Renderer** — shell, nav, collection views, settings, admin, whitelabel, PWA. The language is [UI.md](UI.md). | ✅ The contrast sweep walks every legal brand, the state matrix proves no two states render alike, the boundary guard holds, and `hello` has a screen that writes no chrome at all. A live surface moves between four presentations without remounting. ⚠️ Open, and all of it is SCREENS rather than mechanism: the settings and admin surfaces exist as operations and are not rendered, there is no PWA (so `OfflinePolicy` is declared on every collection and read by nothing), and `pnpm shots` does not exist — which is the parity gate §2.3 calls non-optional for the cutover, and the one guard still owed |
| 5 | **Commerce** — plans, entitlements, flags, the provider on one webhook, B2C packages, metering, parking state. | ✅ Both rails resolve through one explained walk each, and a manifest that would sell something nothing withholds does not boot. `hello` declares a catalogue, a ceiling and one sold capability; the ladder, the parking state, the quota, the package offer, the grant ledger, the intersection and the whole provider lane are derived. A signed event is applied or PARKED where an operator can read and replay it — there is no third answer — and one that belongs to a workspace on another continent settles there. Open: opening a checkout, which needs an account rather than a design |
| 6 | **Ops** — notifications incl. the inbox, help centre, versioning + changelog, data & subscription centre, maintenance, provisioning. | ✅ `one new <id>` produces an app that boots, passes its own suite and is missing nothing — measured by generating one for real. `emits` drives the inbox, the webhook catalogue and the audit entry from one declaration; help and the changelog are checked manifest content; a lock makes a removal a decision rather than a diff; export and erasure read ONE derived plan; leaving works from the bottom rung; maintenance closes every door above the public lane. The template is held to `AppSpec` and to the runtime's own module list, so it cannot fall behind. ⚠️ CI is CLOSED as of 2026-08-10 and was worse than this row said: both workflows ran `turbo run typecheck test` and neither ran `pnpm gate`, so 36 guards — every script-implemented one, including all eight platform checks — ran only when somebody typed the command. `guards.test.mjs` now asserts both workflows name every command a live guard depends on. Open: a deploy config, which needs an account rather than a design |
| 6.5 | **Batteries** — files, jobs, guidance (the checklist), milestones, moments, the wizard, the marketplace. Seven mechanisms, all product-agnostic. | `hello` uploads a file, runs a scheduled sweep, shows a derived checklist and celebrates a milestone. **[KOVA.md](KOVA.md) §4** is why each one is the platform's rather than Kova's. ✅ **DONE** — files, jobs, guidance, milestones, moments, the wizard and **the marketplace**: a shelf derived from the same declarations the gate enforces, counting usage with the same counters the quota gate uses |
| 7 | **Kova** — a NEW product on the platform, written version by version. §7 and **[KOVA.md](KOVA.md)**. The long one. | Production tenants are served by `platform/kova` and `apps/api` is unrouted. ▶ **The inventory is complete**: [KOVA-INVENTORY.md](KOVA-INVENTORY.md) — **153 of 153** capabilities built across six personas, at manifest version **0.21.0**, progress derived from the registry rather than narrated. ⚠️ **That is not the same as the stage being done.** What remains is §7.4: the rehearsal against a copy of production, the screenshot parity gate (which does not exist), the golden-path E2E on the new stack, the dark launch, and the per-tenant cutover through §4.2's relocation engine. There is also no `wrangler.jsonc` under `platform/`, so nothing here deploys yet — inert by construction, and the thing to change first |
| 8 | **The tenant**, then Tessa, then Scena | Kova's one live tenant is copied, verified and flipped with its passkeys intact ([KOVA.md](KOVA.md) §6); both other apps migrated; Scena's player proves the canvas boundary |
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
