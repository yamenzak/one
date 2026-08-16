# OneEngine

kind: plan

**One worker. Many products. Many tenants. A tenant may hold several products,
and everything a product needs beyond its own logic is declared once and wired
by the framework.**

---

## 0. How to read this, and how to resume work from it

⚠️ **THIS DOCUMENT IS WRITTEN FOR SOMEBODY WITH NO MEMORY OF WRITING IT.** That
is not a style choice. The work is long, the context that holds it is finite, and
the failure this document exists to prevent is: a decision gets made, the
conversation that made it is compressed away, and the next session re-derives it
differently. Two answers to one question is how a platform rots.

So three rules govern everything written here:

1. **Every decision states its own reason, inline.** Never "as discussed", never
   "see above", never a reference to a conversation. If the reason is not on the
   page, the decision is not recorded.
2. **Every decision is numbered and citable** — `D7` — in
   [DECISIONS.md](DECISIONS.md). Code comments and guards cite the number. A
   guard that fails names the decision it was protecting.
3. **What is not built yet says so, in a marker a script can find** —
   `DEFER(engine-N)` — never in prose somebody has to remember. See
   [STANDARDS.md](STANDARDS.md).

**To pick this work up cold, in order:** this file §1–§3 for the shape,
[DECISIONS.md](DECISIONS.md) for what is settled and what it forbids, then
[PROGRESS.md](PROGRESS.md) for what exists today. Nothing else is required reading.

⚠️ **AND THERE WAS A PREDECESSOR, WHICH IS NOW ONLY IN `git log`.** OneEngine is
not a rescue — it is a second attempt made possible by the first having answered
the hard questions. That first attempt lived in `platform/` and was the reference
implementation of nearly every mechanism here; it was deleted on 2026-08-16,
because a superseded framework kept beside its successor is a second answer to
every structural question with nothing saying which one is live. §1 is what it
got wrong, and that is the part worth keeping.

---

## 1. What changed, and why there is a second attempt

The predecessor got the mechanisms right and the **topology** wrong. Three consequences, and each is the reason for one of OneEngine's decisions:

**An app was a deployment.** Every product had its own worker, its own D1, KV and
R2, its own domain binding, its own secrets, its own row in a registry, and a
provisioning workflow to create all of it. That machinery — `apps.json`,
`provision.yml`, `bind-resource-ids.mjs`, `boot-check.mjs`, `affected.mjs` —
exists *only* because resources are per-app. It is a checklist where it should be
a function.

**A tenant was per-app.** A business using two products had two workspaces, two
addresses, two custom domains, two rosters, two bills. The hub was built to paper
over that — one account, memberships across products, one credit balance — which
made the seam visible rather than closing it.

**Every database was per-app, so nothing could be balanced.** A product hammering
D1 and a product barely touching it sat on separate databases with no way to mix
them, and no way to move a tenant off a hot shard.

OneEngine inverts all three: **the tenant is primary, apps are enabled on it, and
storage is placed rather than owned.**

---

## 2. The shape

### 2.1 Entities

| Entity | What it is | Where it lives |
|---|---|---|
| **Account** | A person. One identity across every product. | Directory (global) |
| **Tenant** | A workspace. A business. Holds one or more apps. | Directory row + records in its placement |
| **App** | A product, as a manifest. Not a deployment. | Code |
| **Enablement** | This tenant has this app switched on. | Directory |
| **Placement** | Which shard set holds this tenant's records. | Directory |
| **Membership** | A person is in a tenant, in a role. | Placement, indexed in Directory |

⚠️ **AN APP IS NOT A TENANT'S OWNER, IT IS ITS CAPABILITY.** `tenant_app` is the
enablement row, and turning a product on for a workspace is a write to it —
nothing is provisioned, no domain is bound, no resource is created. That is the
whole of what "provisioning becomes a feature flag" means, and it is only true
because of D1 (the tenant is primary) and D4 (storage is placed, not owned).

### 2.2 Addressing

```
<slug>.one.4dl.app         a tenant. Every app it has, from one address.
<their-own-domain>         the same tenant, their branding, their whole suite.
id.4dl.app                 the account centre. Who you are, everywhere.
admin.4dl.app              the operator console. The deployment itself.
setup.4dl.app              the only place a tenant is created.
```

⚠️ **ONE ADDRESS PER TENANT, NOT PER PRODUCT.** A customer with three of our
products signs in once, at one address, with one team and one bill, and switches
between products inside the shell. This is the product argument the whole
inversion is for; the infrastructure savings are a consequence, not the point.

### 2.3 Stores

**The Directory — one global D1, every product, every tenant.** It holds what a
cross-tenant question needs and nothing else:

- accounts, sessions, credentials
- tenants: slug, name, placement, standing, country
- `tenant_app`: enablement
- membership index (which accounts belong where — an index, never a grant)
- subscriptions, credits, entitlement adjustments
- api tokens, deployment config

⚠️ **EVERY FACT A CROSS-TENANT QUESTION FILTERS ON LIVES HERE (D5).** Once
tenants are spread across shards, the operator console, the dunning sweep,
analytics and the purge sweep cannot fan out over N databases to answer "which
tenants are past due". The directory answers; the shard holds the records. A new
question that needs a new column gets the column here — that is the standing rule
and it is what makes sharding payable.

**The Shards — many regional D1s, each holding many tenants of mixed products.**
A shard's schema is the union of the schemas of the apps its tenants have. Media
is the same story in R2.

⚠️ **PLACEMENT AND SCHEMA ARE COUPLED.** A tenant can only be placed on a shard
whose schema covers that tenant's apps. Enabling an app for a tenant may require
applying that app's schema to their shard first. This is a constraint, not a
blocker — but it is the one that is expensive to discover late.

### 2.4 Layers

```
@engine/kernel    Pure. Types, rules, decisions-as-functions. No I/O, no bindings,
                no React. Everything here is testable with no fixture at all.
@engine/runtime   The ONLY code that touches a binding. Turns a manifest into a
                live worker: routing, gates, storage, dispatch, jobs.
@engine/design       Browser screens. HeroUI v3. Router-free — an app brings its own.
apps/*          Manifests. Product vocabulary lives here and nowhere else.
services/*      Service-bound workers over RPC: ai, notify. See D3.
```

The dependency arrow points one way and a guard enforces it: `apps → web →
runtime → kernel`, never back.

---

## 3. The declaration surface

⚠️ **THIS IS THE CONTRACT AN APP WRITES AGAINST, AND IT IS THE WHOLE PRODUCT.**
Everything below is a plain typed object literal — not a decorator, not a custom
file format (D8). The reason is mechanical: guards *walk* these declarations to
prove things about them, and a declaration a script cannot enumerate is a
declaration nothing can check.

### 3.1 What a tenant declares (once, at signup)

name · slug · **country** → placement (D6) · branding · custom domain

### 3.2 What an app declares (the manifest)

| Field | What it produces, automatically |
|---|---|
| `id`, `name`, `mark` | the app switcher, the enablement row, the marketing shelf |
| `collections` | tables, CRUD operations, screens, purge cascade, export |
| `operations` | routes, AI tools, webhooks, audit, OpenAPI, typed client |
| `screens` | nav, routes, deep links from notifications |
| `permissions`, `roles` | the role builder, the custom-role registry, every gate |
| `entitlements`, `plans`, `packs` | the shelf, the gates, quotas, grandfathering |
| `settings` | three settings screens (person / workspace / operator), rendered |
| `ai` | model pickers per action, prompts, credit metering, audit |
| `notifications` | the inbox, the two-level policy screen, email, push |
| `flags` | the feature-flag console; per-deployment, per-tenant, per-person |
| `vault` | encrypted fields, consent, grants, the disclosure |
| `legal` | documents, ROPA, sub-processors, retention, acceptance |
| `jobs` | the scheduler, the run history, the job console |
| `credits` | what each action costs, the balance, the meter |
| `whitelabel` | which surfaces a tenant's package lets them brand |
| `help`, `guide`, `milestones` | the help centre, onboarding checklist, recognition |

### 3.3 What a collection declares

`fields` · `scope` (tenant / subject / global) · `retention` · `onDelete` ·
`quota` · `holding` (what personal data, for the ROPA) · `vault` (which fields
are vault-backed) · `media` purposes · `offline` policy · `search`

### 3.4 What an operation declares

`id` · `kind` · `input` / `output` · `permission` · `proof` · `entitlement` ·
`flag` · `quota` · `credits` · `idempotency` · `audit` · `emits` · `tool` ·
`outcome` · `fails` · `rate`

⚠️ **ONE DECLARATION, EVERY CROSS-CUTTING CONCERN.** This is the property the
whole framework is built to have, and it is the thing to protect above all else:
adding a capability must never mean visiting eight places. If a new concern is
introduced and it cannot be expressed as a field here, that is a design problem
to solve, not a call site to add.

### 3.5 What a screen declares

`route` · `nav` placement · `sky` + `tone` (see §5) · `permission` ·
which operations it calls

---

## 4. Autodiscovery — the set-and-forget rule

⚠️ **A DECLARATION THAT REACHES NO SURFACE IS THE FAILURE THIS FRAMEWORK EXISTS
TO PREVENT.** The predecessor shipped it repeatedly: a mechanism fully built, tested
and wired, with nowhere a person could look — an entitlement nothing gated, a
notification registry with no bell, a schema applied and no route to reach it.
Every one of them passed every test.

So the rule is bidirectional and both halves are guarded:

- **Declared → surfaced.** Every declaration renders somewhere a person can see
  and change it, without an app writing a screen.
- **Surfaced → enforced.** Every switch a person can press changes behaviour. A
  control that does nothing is worse than an absent feature, because they stop
  looking for the thing it promised.

Autodiscovery targets, in full: settings screens · the flag console · the plan
catalogue · API docs · the AI tool catalogue · webhook events · the audit
vocabulary · the notification policy screen · the ROPA and disclosure · the purge
cascade · credit metering · the role builder · the help centre · the app switcher.

---

## 5. The interface

**HeroUI v3** (`@heroui/react`, Tailwind v4, React Aria) is the component layer.

⚠️ **COMPONENTS ARE NOT RESTYLED (D7).** Consistency comes from using the
library as it ships and theming it through tokens — not from every screen making
its own choices carefully. A guard refuses custom `className` styling on HeroUI
components in `@engine/design`. A tenant whose package includes whitelabel edits the
**theme**, and every component adapts with no screen changing.

**The working sequence, every time, no exceptions:** decide what is being built →
ask the HeroUI MCP what component fits (`list_components`, `get_component_docs`)
→ build with it. Never build a control that HeroUI already ships.

**The shell.**

- Mobile: a bottom navigation island, **maximum five destinations** (D10).
- Desktop: a sidebar carrying the same five as primary, plus room for more.
- Inside a destination: sub-areas, not more nav.
- The crown, the app switcher and the bell are chrome, not destinations.

**The sky.** Each page declares its own `sky` and `tone`; the gradients, patterns
and motion derive from **HeroUI theme tokens**, so a tenant's branding changes
the ambience of every screen without a screen knowing anything about it.

---

## 6. What we take, and what we write

⚠️ **THE TEST IS: DOES THE LIBRARY ENCODE A DECISION, OR OUR INVARIANT? (D9)**

A **decision** is something the world already settled — how a date is formatted,
how MIME is framed, what P-256 is. Take the library; writing it ourselves is
reinvention and the library has been battle-tested by more people than we will
ever have.

An **invariant** is a rule of *our* product — the gate order, how entitlements
resolve, who a notification is for, what a reserve is. No library enforces those.
Adopting one means writing them anyway, on top of it, which is strictly more
code and one more thing between us and the behaviour.

Both halves are load-bearing. Reinventing `Intl` is waste; delegating the
entitlement walk to a generic RBAC package is a rewrite that loses grandfathering
and then has to grow it back.

---

## 7. Stages

Each stage ends with something that runs and something that is guarded. No stage
is "shipped" while anything defers to it (STANDARDS.md).

| # | Stage | Ends when |
|---|---|---|
| 0 | **Ground** — workspace, docs, guard registry, the standards that bind them | `pnpm engine:gate` runs and passes with the first guards live |
| 1 | **Kernel** — entities, declarations, the gate algebra, problems | Every declaration type exists and is proved pure |
| 2 | **Directory + placement** — the global store, shards, the placement rule | A tenant is created, placed, and read back through a shard |
| 3 | **Runtime** — manifest → live worker: routes, gates, storage, audit | `hello` boots and serves a declared operation end to end |
| 4 | **Identity + tenancy** — accounts, doors, membership, roles, tokens | Somebody signs in, makes a tenant, invites a colleague |
| 5 | **Surface** — HeroUI shell, nav, sky, the rendered settings screens | The declared surfaces render with no app-written screen |
| 6 | **Money** — plans, entitlements, credits, the shelf | A tenant enables a second app and is billed once |
| 7 | **Services** — ai and notify over RPC | Both run off the hot path and the seam is typed |
| 8 | **Vault + legal** — encrypted facts, consent, ROPA, erasure | A person exports and erases themselves, provably |
| 9 | **A real product on OneEngine** | It runs with no app-specific infrastructure |
| 10 | **One** — the deployment and the Hub: a worker, its doors, and the page a person opens | Somebody signs in with an emailed code, sees their workspaces and makes one, in a browser |

---

## 8. Where the numbers are

Nothing in this document quotes a test count, a guard count or a timing. Those
live in generated blocks in [PROGRESS.md](PROGRESS.md), because a number typed by hand is
a number that is wrong within a week.
