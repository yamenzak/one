---
kind: plan
---

# Kova on ONE — a new product, an old tenant

> **Status: PLAN.** Nothing below is built. It is the strategy for stages 6.5, 7
> and 8, decided 2026-08-09, and it exists because the obvious reading of
> "migrate Kova" produces the wrong product.
>
> [PLAN.md](PLAN.md) is the platform's own design and stage map; this document is
> the one app-shaped plan that hangs off it. [MANIFEST.md](MANIFEST.md) is what
> an app declares and [UI.md](UI.md) is the interface language the new product is
> written in.

---

## 1. The thing that looks like a contradiction

The requirement, as stated:

- The one live tenant must survive, with its data and its files.
- Everything a person can do in Kova today, they must still be able to do.
- **Do not** port the interface. **Do not** port the logic.

That reads as a contradiction only while "feature" and "implementation" are the
same word. They are not, and separating them is the whole strategy:

| | Must persist | Free to change |
|---|---|---|
| **Data** | every row and file a person can see | how it is shaped, named, split, joined |
| **Capability** | what a person can accomplish | how they accomplish it |
| **Implementation** | nothing | schema, code, screens, navigation, vocabulary |

⚠️ **THE OLD REPOSITORY IS A REFERENCE, NEVER A SOURCE.** Nothing is copied —
not a component, not a route, not a domain function. It is read to answer two
questions and no others: *what can a person do*, and *what is stored*. Anything
else it has to say is about a codebase written before the platform existed and
is not evidence about what the new one should be.

Kova was two months of work with no platform in mind. Its inconsistencies are
not accidents to be preserved; they are the reason this project exists.

### 1.1 The bridge is an inventory, not a diff

Step one of stage 7 is a **capability inventory**: every action a person can
complete today, per persona, as a flat checked list. It becomes the acceptance
contract for the new product, and it is the only artefact that crosses from the
old codebase to the new one.

⚠️ **IT LISTS OUTCOMES, NOT SCREENS.** "A coach can see how a client's strength
is trending" is a capability. "The Progress tab has four lenses" is an
implementation, and writing it down that way is how a rewrite becomes a port
wearing different colours.

---

## 2. What was decided

| Decision | Answer |
|---|---|
| Identity at cutover | **Same URL, same passkeys, no re-signup.** The tenant's people notice a new product, not a new account. |
| Data fidelity | **Everything a person can see.** Machine exhaust — AI generation logs, cache rows, webhook seen-sets — does not travel. |
| Gamification | **Platform.** A milestone engine over the event stream, with the milestones themselves the app's. |
| Guidance | **A derived checklist, not a tour.** §4.3. |

### 2.1 Same passkeys is a constraint on the schema, not on the cutover

A passkey is bound to a relying party, and ONE's is the platform root — the same
root Kova already uses. So credentials carry **if and only if** the account and
credential rows migrate with their identifiers intact.

⚠️ **THAT MAKES THE IDENTITY TABLES THE ONE PLACE THE NEW SCHEMA IS NOT FREE.**
Everything else may be reshaped; an account id and a credential id are what a
person's authenticator signs against, and a new id is a new account. The
migration therefore preserves them exactly, and stage 8 proves it by signing in
with a real authenticator that was registered against the old deployment.

---

## 3. How an app on ONE writes its logic

Asked and answered here so it is not re-derived. Four layers, and nothing else.

**1. The manifest.** Collections, plans, entitlements, notifications, help,
releases. This is most of the product: the tables, the indexes, CRUD, the routes,
the AI tools, the webhook catalogue, the API document, the inbox, the ceilings,
the erasure cascade and the export are all derived from it.

**2. `operation()`** — only for what a collection cannot imply. One declaration
becomes the route, the tool, the webhook event, the audit entry and the inbox
dispatch. A handler is thin by construction: its input is already parsed, the
standing, permission, entitlement, ceiling and row-scope gates already ran, and
what remains is the I/O and the answer.

**3. A pure domain package.** No I/O, no runtime imports, exhaustively unit
tested. Nutrition maths, progression rules, streak arithmetic, body composition.

**4. Nothing else.**

### 3.1 What is deliberately absent, and why

⚠️ **NO HOOKS ON DOCUMENT ACTIONS.** The Frappe-shaped model — `before_save`,
`on_submit`, a registry of listeners per doctype — is rejected. Ordering is
implicit, cascades are invisible, and the characteristic bug is "something wrote
this row and nothing in the code path mentions it". Every hook is action at a
distance, and a product accumulates them faster than anybody can hold them in
mind.

The replacement is `emits`, and the difference is that it is a DECLARATION: an
operation says what it raised, the runtime does the derived work, the notification
registry is checked against it at composition, and the flow is one-directional
and readable at the call site. There is exactly one dispatcher and an app cannot
add a second.

**No controllers, no service layer, no middleware chain.** The gates are the
middleware and they are declared; anything that would be a controller is either a
collection or an operation.

---

## 4. What the platform still owes — stage 6.5

Kova cannot be written on the platform as it stands. Two of these are gaps
nobody named until Kova was examined; five are the systems asked for. All seven
are product-agnostic, and none is a Kova feature wearing a platform hat.

### 4.1 Files

`field.media` exists, the R2 binding exists, `relocationPlan` copies objects —
**and there is no upload path.** Kova is media-heavy: body scans, meal
photographs, exercise demonstrations, progress galleries.

What it needs: an upload operation with progress (XHR, because no shipping
browser has a `fetch` upload-progress event), a media ledger row per object per
tenant, a quota gate reading the same entitlement mechanism everything else does,
an authed read, and EXIF stripping on by default — a photograph from a phone
carries GPS coordinates and a device serial, and stripping later never fixes what
is already stored.

### 4.2 Jobs

There is no way to declare scheduled work at all, and Kova is full of it: the
dunning ladder, budget expiry, the customer-lapse ladder, retention sweeps,
digest sends.

⚠️ **A JOB IS DECLARED, LIKE EVERYTHING ELSE**, and the reason is the same:
a cron entry in a deployment config is a capability with no surface, no test, no
audit and no way to tell whether it ran. A declared job carries its schedule, its
lane, what it emits, and a bound on what it may touch in one run — and
`no-silent-cap` already exists to make a sweep that drops work say so.

### 4.3 Guidance — the checklist, and why not a tour

⚠️ **A CHECKLIST ITEM IS DERIVED, A TOUR STEP IS TRACKED, AND THAT IS THE WHOLE
ARGUMENT.**

"Add your first client" is answered by counting clients. It needs no completion
ledger, cannot drift from what is actually true, survives somebody moving to
another device, and un-checks itself if the thing is deleted. A tour step can
only ever record "seen", which is a fact about our interface rather than about
their progress — and a person who dismissed it once has dismissed it forever, at
the exact moment they had the least context to judge.

A tour is also an interruption on a schedule the product chose. A checklist is a
surface: it waits, it shows progress, and it is there when somebody comes back.

**It is declarable the same way a notification is:** an item names a collection
the manifest already declares, a condition over it, the operation that satisfies
it, and the role it is for. An item pointing at a collection the app does not
have is refused at composition.

**Two surfaces, one declaration.** `required: true` items are the WIZARD —
nothing works until they are true. Everything else is the checklist — things that
make the product good. Splitting on a field rather than building two systems is
what stops the wizard and the guidance drifting apart.

**The exception, capped: hints.** One-off, dismissible, anchored to a single
element, for a surface that is genuinely non-obvious. Hard-capped per app so they
cannot become a tour by accretion.

Kova needs this in both directions — the studio learning Kova, and a client
learning what their coach set up — and because the list is per role and derived,
that is two declarations over one engine rather than two scripts that both rot.

### 4.4 Milestones

⚠️ **IT CONSUMES `emits`, WHICH IS WHY IT BELONGS TO THE PLATFORM.** The event
stream already exists, is already declared, and is already checked. A milestone
is a rule over it: a count, a streak, a first, a threshold. The RULES are the
app's — "seven sessions in a row" means nothing to a signage product — and the
engine is not.

That is the same shape as every other thing here that earned its place: the
mechanism is product-agnostic, the vocabulary is the app's.

⚠️ **AND IT IS RECOGNITION, NOT SCORE.** A points total invites a leaderboard,
a leaderboard invites comparison between clients, and comparison between people
being coached through their own bodies is a product decision with consequences
nobody asked for. Milestones are personal and are about a person against
themselves.

### 4.5 Moments

The celebration, the transition, the splash — the things that make an app feel
like it was built rather than assembled. Northlight already has the machinery:
scenes, continuity, a stagger, a motion budget, and `Outcome.sound` on every
operation.

What is missing is the vocabulary above it: a MOMENT — declared, tied to an
outcome or a milestone, with a shape the platform owns and a name the app
chooses. `SoundSpec` already exists on `AppSpec` (an audio pack, per surface),
so the sound half is a binding rather than a build.

⚠️ **THE BUDGET IS THE FEATURE.** Three simultaneous animations is a jungle;
what makes an interface feel expensive is restraint and continuity, not quantity.
The motion budget already refuses the fourth.

### 4.6 The wizard

Three shapes, one mechanism (§4.3): setting an app up on the platform for the
first time, a new tenant signing up, and a new customer arriving under a tenant.

⚠️ **THE DEGRADE LANE IS THE FEATURE.** With no payment provider there is no
checkout to be had, and a mandatory paid step that refused would mean nobody can
create a tenant on a self-host or before the provider is configured. The tenant
is created, the choice is recorded, nothing is charged, and the screen says so.
Choosing a plan never grants it — that is already true and already tested.

### 4.7 Marketplace

Mostly a surface over declarations that already exist: the plan catalogue, credit
packs, and — for an app with a customer rail — the packages a tenant sells its
own customers, which are already a stored offer with contradiction reporting.

What is genuinely new is the storefront: browsing, comparing, and the purchase
path a customer walks. Both audiences, one mechanism, because "what is for sale
here" is the same question asked at two levels.

---

## 5. Stage 7 — the product

**Written version by version, and the version log is a manifest field.** What was
asked for — a changelog and a knowledge base — are `releases` and `help`, which
already exist, are already checked, and already refuse a commit message and an
article written for developers. The record of how the product was built is a
consequence of building it correctly, not a document beside it.

The order is capability-first and it is not the old app's order:

1. **The inventory** (§1.1) and a **data survey** — what is actually in the live
   tenant, by table, with counts. Both read-only, both artefacts.
2. **The manifest** — collections designed from what the product IS, not from
   what the old tables are. This is where the freedom is spent.
3. **The core loop, end to end**, for one persona, shipped as version 0.1.
4. Each subsequent version: a slice of the inventory, its help articles, its
   release notes, its milestones and moments.

⚠️ **THE MANIFEST LOCK MAKES EVERY REMOVAL DELIBERATE FROM VERSION 0.1.** A new
app renames things constantly, which is exactly when a removal is invisible — so
the lock ships with the first commit rather than being added when it starts to
matter.

---

## 6. Stage 8 — the tenant

⚠️ **A TRANSFORM, NOT A PORT.** Old rows become new collections through a
declared mapping, and the mapping is code that is read once and thrown away —
not a compatibility layer that lives forever.

The pattern is the one the platform already proved for relocation, and the
reason it is that pattern is that the naive version is a total outage rather
than a degraded feature:

1. **Copy** — never move, never delete from the source.
2. **Verify** — count per collection, spot-check per collection, and a
   reconciliation report a person reads before anything flips.
3. **Flip** — the directory entry, last, once verification passed.
4. **Keep the source bootable** until somebody says otherwise.

Media travels by content, and the object store is the one place a copy is cheap
and a mistake is permanent.

⚠️ **THE ACCEPTANCE TEST IS THE INVENTORY, DRIVEN AS A PERSON.** Not a row count
— row counts pass while a product is unusable. Every line of the capability
inventory, performed against the migrated tenant, by each persona, in a browser.

---

## 7. What could go wrong, ranked

1. **The inventory becomes a screen list.** Then the rewrite is a port and every
   inconsistency comes back. The mitigation is that it is written before any new
   code exists, when there is nothing to describe it against.
2. **6.5 grows.** Seven systems is already a lot, and each one is a place where
   "while we are here" costs a week. Each ships when Kova can use it and not when
   it is complete.
3. **The passkey assumption is wrong.** If credential rows cannot migrate with
   their identifiers, "no re-signup" fails at the last step. It is checked FIRST
   in stage 8 — against a real authenticator, before any other data moves.
4. **The old product keeps running longer than planned.** That is fine and is not
   a risk to plan against: it is the fallback, and it stays bootable.
