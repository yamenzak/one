# Tessa

**Scan it, count it, prove it.** Sterile-supply and consumable traceability for
medical centres — the second app on the 4DL platform.

The name is *tessera*: the Roman counting token, and the single tile in a mosaic.
Both halves are the product — you count small things, and the small things only
mean something assembled.

---

## Part 0 — The one paragraph

A medical centre's stock room, its CSSD, and its treatment rooms run on paper,
memory, and a whiteboard. Tessa replaces that with a phone camera. Every box that
arrives is scanned; every instrument tray is packed, sterilised and released
against a named person; every case records what was actually used. When a spore
test comes back positive on Thursday, the centre can name every pack from that
load and every case it touched — in one query, not one bad afternoon.

---

## Part I — What this is, and what it deliberately is not

### 1.1 The scenario the product exists for

> Thursday morning. The biological indicator from Tuesday's autoclave load #47
> reads **positive**. Every pack in that load is potentially non-sterile. The
> centre must now find: every pack from cycle 47 still sitting on a shelf, every
> pack already opened and used, which cases those were, and it must be able to
> show a regulator that it did all of this.

Counting boxes is table stakes; a spreadsheet does that. **Answering the recall
question is the product.** Every design decision below is downstream of it, and
it is also the reason a centre will pay: the alternative is a paper logbook and a
hope.

### 1.2 The three rules that define the boundary

These are the Tessa equivalent of Kova's "one fact, one home" — invariants, not
preferences, and each one is enforced rather than documented.

---

**RULE 1 — Tessa holds a case reference and nothing else about a person.**

No name, no date of birth, no diagnosis, no procedure description beyond a code
the centre itself chose. The app never displays anything about a patient that it
did not receive as a bare string typed by staff.

*Why it is a rule:* the moment this app holds clinical data it inherits the
entire weight of the health sector — and it gains nothing, because the question
it answers ("what did we use") never needs to know who the patient was. The case
reference is a foreign key into a system Tessa cannot read.

*Enforced by:* a conformance test asserting no column in the schema matches
`/(^|_)(name|dob|birth|diagnos|mrn|nhs|insur)/` on any table carrying a case
reference. A forgotten column becomes a test failure rather than a discovery.

---

**RULE 2 — Tessa records a decision. It never makes one.**

Tessa never declares an instrument sterile, a material safe, or a pack released.
It records that **a named, qualified person did so, at a time, with the evidence
in front of them.**

*Why it is a rule, and this one is load-bearing:* under EU MDR, software with a
medical purpose is a medical device with everything that follows — conformity
assessment, notified body, technical documentation. Administrative and logistics
software is not. The line runs almost exactly along this rule. Software that
*computes a release decision* is arguing to be regulated; software that *captures
a human's release decision and makes it auditable* is a logbook with a camera.

It is also simply correct. In German practice the **Freigabe** (release after
reprocessing) is a named act by a qualified person — the RKI/BfArM recommendation
on reprocessing medical devices is explicit about documented release. Tessa's job
is to make that act fast, complete and searchable, not to perform it.

*Enforced by:* every release, every quarantine lift, every expiry override
carries `decided_by` (a user id) and `decided_at`, and there is no code path that
writes any of them from a system actor.

---

**RULE 3 — AI never auto-commits a safety-relevant value.**

An expiry date, lot code, or instrument count read by a model is a **pre-filled
suggestion a human confirms**, always, with the source image retained.

*Why it is a rule:* a wrong expiry here is not a bad user experience, it is a
patient outcome. This is the same shape as Kova's "a write that fails says so,
where it failed" — the failure mode is silent, so the guard has to be structural.

*Enforced by:* AI-derived fields land in a `suggested_*` shape that the commit
path cannot read. Confirming is what moves them.

### 1.3 Not in scope, on purpose

- **Patient records, scheduling, billing of patients.** Not our sector.
- **Purchasing/ERP integration** — later, maybe, via export. Not v1.
- **Being a medical device.** See Rule 2.
- **Instrument repair workflow** beyond marking a unit out of service.

---

## Part II — The regulatory frame (EU / Germany first)

Tessa is sold into EU clinics, Germany first, and this shapes the model rather
than merely the copy. **None of the below is legal advice** — it is the
engineering read, and every claim in marketing copy needs a lawyer before it
ships.

### 2.1 UDI and the barcode you will actually meet

EU MDR (2017/745) drives **UDI** onto device labels, and in Europe that is
overwhelmingly **GS1**. A UDI carrier splits into:

| | | |
|---|---|---|
| **UDI-DI** | which product it is | GS1 AI `(01)` GTIN |
| **UDI-PI** | which production run | `(17)` expiry · `(10)` lot · `(21)` serial · `(11)` manufacture date |

**One scan of a DataMatrix gives product + expiry + lot.** That is the single
highest-leverage thing in the whole app for "less typing", and it is a pure
parsing function with no I/O — so it is also the first thing to build and the
easiest to test exhaustively.

HIBC exists as a second standard and appears on some devices. GS1 first; HIBC
when a real customer shows us one.

### 2.2 Germany specifics that change the schema

- **MPBetreibV** — the operator ordinance. Certain devices require a
  *Medizinproduktebuch* and documented instruction of the people using them.
  Tessa's instrument record is the natural home for this: acquisition, serial,
  instruction records, service events.
- **RKI/BfArM reprocessing recommendation** — classifies instruments as
  *unkritisch · semikritisch A/B · kritisch A/B/C*, and the class determines
  which reprocessing steps are required and how they must be documented. That
  classification is therefore a **field on the instrument catalog item, and it
  drives the workflow**, not a label.
- **Freigabe** — see Rule 2. A named release, per load.

### 2.3 GDPR

- Tessa is a **processor**; the clinic is the controller. Ship a template
  **AVV / DPA** as part of onboarding — an EU clinic will ask on day one and not
  having one loses the deal.
- `@4dl/purge` already derives erasure from the schema. That machinery transfers
  intact.
- **Data residency is a real constraint, not a checkbox.** German clinics will
  ask where the data sits. Cloudflare offers jurisdictional restriction for
  Durable Objects and location hints for D1 — **this needs to be verified against
  current Cloudflare capabilities before any promise is made**, and it may
  constrain which platform pieces can be used as-is. Flagged as an open risk in
  §7.

### 2.4 Language

**German is table stakes, not a nice-to-have**, and retrofitting i18n is
miserable. Kova is English-only, so this is the first genuine *platform* question
Tessa raises: does i18n become a shared `@4dl/*` concern, or does Tessa carry its
own? See §7.

---

## Part III — The domain model

### 3.1 Three identity granularities

The central decision. Most inventory systems pick one and then fight it forever.

**Catalog item** — the *type*. "Sterile gauze 10×10", "Kelly forceps 14cm".
Carries handling rules, warnings, storage class, images, default shelf lives,
and (for instruments) the reprocessing class.

Physical things are then tracked at one of three granularities:

| | Identity is | Example | Carries |
|---|---|---|---|
| **Lot** | a batch | gauze, sutures, saline | expiry · lot code · **quantity** · supplier |
| **Unit** | one object, for life | a specific forceps | cycle count · service history · retirement |
| **Pack** | a *composed set* with its own identity | "minor surgery tray" | recipe · member units · sterilisation state |

The **pack** is the interesting one, and it is why a single-granularity model
fails: a pack is built from units, sterilised as a whole, opened as a whole, and
has a lifecycle its members do not individually have. Opening a pack returns its
units to the dirty pool — that transition is the heart of the CSSD loop.

### 3.2 The ledger

**Every state change is an append-only event; current state is a materialised
projection.** This is the same shape as `@4dl/billing`'s credit ledger with the
DO holding the authoritative balance, for the same reason and with the same
trade-off.

```
received · moved · opened · consumed · wasted · packed
sterilised · released · quarantined · issued · returned · retired
```

*Why not just mutable rows:* the questions this product exists to answer are
**temporal**. "What was the sterilisation state of this pack **at the moment it
was opened**" cannot be answered from a row that has since been overwritten. A
recall is a query over history, not over the present.

*The pragmatic half:* stock levels are read constantly and projecting them per
request does not scale, so balances are materialised alongside — ledger is truth,
balance is cache, and there is a rebuild path. Exactly Kova's arrangement.

### 3.3 Location is a dimension, not a field

**Site → Room → Shelf/Bin**, each with its own QR code.

- Stock is per-location. "Do we have gauze **in Clinic A**" is the only question
  anyone actually asks.
- Movement is an event, so provenance survives a transfer.
- Expiry sweeps and par-level alerts are per-location.
- Scanning a bin then an item is what makes receiving a two-scan operation with
  no dropdowns.

### 3.4 Expiry is three rules that compose

```
effective_expiry = min(
  printed_expiry,                    // manufacturer, or GS1 AI (17)
  opened_at   + post_opening_days,   // multi-dose vials, opened solutions
  sterilised_at + sterile_shelf_days // packs
)
```

The middle one matters more than it looks: **post-opening expiry is frequently
shorter than printed expiry**, and that gap is exactly where a patient gets hurt.
`opened_at` is inferred from first consumption **but always overridable** —
someone who opened it yesterday and is logging it today must be able to say so.

Pure function, no I/O, exhaustively testable — this is `@tessa/domain`'s first
inhabitant.

### 3.5 How a thing is consumed

A catalog flag, because these are genuinely different behaviours:

- `divisible` — a bottle. Partial use; remainder still valid.
- `discrete` — count whole units down.
- `single_use_on_open` — a sterile pack. Opening commits the whole thing.

---

## Part IV — The flows

Ordered by how much they matter, not by build order.

| Flow | Shape |
|---|---|
| **Receive** | scan bin → scan box *(GS1 gives lot + expiry)* → confirm qty → done |
| **Consume** | scan bin or item → qty → done |
| **Pack** *(CSSD)* | pick recipe → scan each instrument in → pack gets id + printed label |
| **Sterilise** | open cycle *(machine, program, operator)* → scan packs into load → record indicator results → **release** or **quarantine the whole load** |
| **Prep** | checklist template per procedure type → instance per case → tick/scan through |
| **Case** | type case ref → scan · scan · scan → close |
| **Trace** | case ref → everything used, with lots, expiries, cycles, operators, **as at that moment** |
| **Recall** | cycle → every pack → shelves *and* cases → quarantine + report |

Two notes:

**Prep checklists** are structurally identical to Kova's plan → session:
a template that instantiates. The pattern is already proven in this codebase.

**The case flow is the UX centrepiece.** Type the file number, then it is pure
scanning until "done". Everything else in the app is in service of that screen
being fast in a room where nobody has a spare hand.

---

## Part V — Build order

Phase 1 is commodity — a spreadsheet does most of it. **Do not linger there.**
Phases 2 and 3 are the reason anyone buys.

### Phase 1 — the spine
Catalog · locations · GS1 receive · stock levels · consume · expiry alerts.
*Sellable alone, and every competitor has it.*

### Phase 2 — the differentiator
Instruments · pack recipes · sterilisation cycles · indicator results · label
printing · **release** · **recall**.

### Phase 3 — the moat
Case logging · trace queries · prep checklists · **offline**.

### Phase 4 — the delight
Vision label reading · tray counting · voice logging · reorder suggestions.

Offline lands in Phase 3 by decision — the OR is where wifi dies, but the stock
room and CSSD are fine, and Kova's background-sync write queue is ready when we
get there.

---

## Part VI — What the platform gives, and what is actually new

**Free, already proven in production by Kova:** five-door host routing,
passwordless auth (email OTP + passkeys), organisations as tenants, the five-gate
route guard, RBAC, the entitlement engine, credit metering with a per-tenant DO,
Stripe on the platform rail, R2 + media quota, transactional email, the real-time
inbox, derived erasure, custom domains, the operator console, the offline write
queue, and the whole design system.

**New — and it is a short list:**

- the catalog + three-granularity instance model
- the event ledger + materialised balances
- locations
- sterilisation cycles, loads, indicator results, release
- pack recipes
- the GS1 parser *(pure)*
- expiry composition *(pure)*
- label printing
- checklist templates
- trace + recall queries

Roughly ten new tables and one genuinely interesting pure-logic package. The
plumbing that took Kova months already exists.

### 6.1 Personas

| | Does |
|---|---|
| **Owner / manager** | everything, plus reports, costs, expiry risk |
| **Stock keeper** | receive, move, count, par levels |
| **CSSD tech** | pack, sterilise, **release** |
| **Clinical staff** | prep checklists, consume, case logging |
| **Read-only / auditor** | trace queries, no writes |

### 6.2 Pricing shape

**Per site, not per seat.** Everyone in a clinic touches this app — a per-user
price makes the customer ration access to a safety system, which is the wrong
incentive and an easy objection to lose on.

**Shipped as ONE plan, not a ladder.** A practice with three treatment rooms and
one with eight run the same loop, receive the same stock and answer to the same
regulator — so a tier ladder would make a clinic choose by counting rooms, and
re-choose every time it opened one. Instead: one plan sized so nobody meets a
ceiling doing ordinary work, with **AI credits as the axis that scales with
use**, which is the honest one. `catalogItems` is deliberately unlimited; a
ceiling there would make a centre choose which instruments to track, defeating
the trace the product exists to produce.

A sterilisation feature flag is still available in the entitlement registry if a
centre that outsources reprocessing ever asks not to pay for CSSD — but nothing
sells it today, and an unsold flag is inert by construction.

---

## Part VII — Open risks and decisions not yet made

1. **Data residency.** German clinics will ask where the data lives. Cloudflare's
   EU jurisdictional options need verifying against current capability **before
   any claim is made**. This is the largest unknown and it could constrain the
   architecture.
2. **i18n is a platform question.** German is required. Does i18n become a shared
   `@4dl/*` concern — which is the right long-term answer and a real piece of
   work — or does Tessa carry its own and the platform absorbs it later?
3. **The MDR line.** Rule 2 is the engineering position and it is a sound one,
   but it should be confirmed by someone qualified before the first German
   customer, not after.
4. **Label printing hardware.** Which printers, what protocol, and does the
   browser reach them? Likely a small print-service or a PDF-to-a-network-printer
   path. Unresolved.
5. **Autoclave integration.** Deliberately *not* depended on: formats vary, many
   machines print only a cycle number, and plenty of centres have no printer.
   Tessa prints its own pack labels and photographs the machine's printout as
   evidence. Revisit only if a customer's machine makes it cheap.
6. **AVV / DPA template** — a sales blocker, not an engineering one, but it
   blocks all the same.
7. **The day boundary is UTC, and a shelf life is counted in local days.**
   `opened_at` and `sterilised_at` are written server-side as UTC instants and
   truncated to the UTC calendar day by `effectiveExpiry`; `/api/stock` compares
   against the server's UTC "today". For Germany and the rest of the EU — every
   offset positive — truncation lands the expiry a day EARLY at worst, which is
   the safe direction. West of Greenwich it can land a day LATE, which is not.
   The fix is Kova's: take the device's local date (`date_local`) at the moment
   of the act and count from that. Cheap to do, but it touches the write path,
   the projection and every read, so it is recorded here rather than half-done.
   Close it before the first customer outside Europe.

---

## Status

Be conservative here — this section is read as ground truth. Verify before
editing it.

**Built:**

- `@tessa/domain` — GS1/UDI element-string parsing, three-clock expiry
  composition and the event registry. 63 tests, verified by mutation rather than
  assumed.
- The schema: 11 tables covering catalog, locations, the three instance
  granularities, pack recipes, sterilisation cycles, cases and the ledger. Every
  table carries `tenant_id` so the erasure cascade is complete; there is
  deliberately no subject scope.
- Roles: owner · stock keeper · CSSD · clinical · auditor. `sterilisation:run`
  and `sterilisation:release` are separate permissions, because Freigabe is a
  qualified act and frequently not the person who ran the machine. **No customer
  role** — everyone who touches Tessa works at the centre, so every member
  consumes a staff seat.
- `/api/catalog` — the first real routes, and the shape later ones copy.
- **The ledger chokepoint** (`apps/tessa/src/ledger.ts`). `applyEvent` is the
  ONLY way a lot, unit or pack changes: it writes the ledger row and applies the
  state change in a single `db.batch()`, guards the state update with a
  compare-and-set, and refuses rather than clamps. Tessa's equivalent of Kova's
  `requireClientAccess` — the value is entirely in it never being bypassed.
- **The sterilisation loop and the RECALL** (`apps/tessa/src/cycle-routes.ts`,
  `packages/tessa-domain/src/sterilisation.ts`). A load runs, ends with its two
  fast indicators recorded, and is RELEASED by a named person — `ended` and
  `released` are separate states because the gap between them is where a
  qualified person weighs the evidence, and collapsing them would make the
  autoclave the releaser. The biological indicator arrives a day or two later,
  and when it fails on a load already released, the recall freezes every tray it
  can still reach and NAMES the ones it cannot: the opened ones, with the case
  reference the clinic typed. That second list is the point — a report showing
  only what it froze would read as a finished job. `releaseCheck` reports what
  the evidence permits and never releases anything; a second biological reading
  that disagrees with the first is REFUSED rather than applied, because
  overwriting it rewrites the evidence a release was justified by. A quarantine
  can be lifted, always into "needs work" and never into "ready".
- **The stock routes** (`apps/tessa/src/stock-routes.ts`) — locations, the
  two-scan receive, move/use/discard/quarantine/open, the shelf read and one
  lot's history. The receive takes product, expiry and lot code from a real GS1
  element string and types only the count; an unrecognised GTIN answers 409 with
  everything it *did* read, so the next screen is a pre-filled confirmation
  rather than a blank form. The shelf computes `effectiveExpiry` per row and
  returns the winning clock alongside the date.
- **Cases, and the trace read BACKWARDS** (`apps/tessa/src/case-routes.ts`,
  `cases.ts`). A case is opened, consumed and opened into, and closed. Its
  `/api/trace/case/:id` answers the reverse of the recall: what did this
  procedure use, and — the reason it exists — is any of it from a load that has
  since failed. A case correct on Tuesday can acquire a concern on Thursday
  without anything about the case changing, so the query joins the trays to the
  cycles rather than trusting a status stored at close time. A closed case
  REFUSES new lines and can be reopened by a person; `reopen_count > 0` is what
  marks an amended record as amended. `resolveCase` is the one guard both
  writing routes run — an unchecked case id resolves to nothing and leaves the
  trace quietly incomplete forever.
- **The CSSD loop** (`apps/tessa/src/pack-routes.ts`): instruments, pack recipes,
  tray build, and the open transition that returns every member to the DIRTY
  pool. Building a tray goes through `applyEvents`, the plural chokepoint — one
  act over N+1 rows, all of it or none of it, with an unwind when a member loses
  its compare-and-set.
- 84 app tests (12 conformance, 6 integration, 17 ledger, 9 stock, 13 packs,
  15 cycles, 12 cases) + 78 in `@tessa/domain`. The load-bearing behaviours are
  verified by MUTATION rather than assumed: unreachable packs named rather than
  dropped, a contradicting indicator refused, a cleared quarantine landing in
  `packed`, the case guard, the preserved close time, and the concerns join.

- **The app** (`apps/tessa-app`) — a scan-first PWA the worker serves at the same
  origin. Five surfaces: Today (what needs attention), Stock, CSSD (trays and
  loads), Cases, and the Recall report, which is a ROUTE rather than a sheet
  because it is a document a centre works through over days. Scanning uses the
  native `BarcodeDetector` where it exists and lazily imports ZXing where it does
  not; the typed field beside it is not a fallback but the path a hand-held USB
  scanner takes, since those present as a keyboard.

- **German** (§2.4 answered). `@4dl/i18n` is the platform's answer — typed
  dictionaries, one plural rule, a locale from the browser the person can
  override — and Tessa ships `en` + `de`. `Freigabe` and `Charge` are used as
  the regulatory terms of art rather than translated literally.
  `i18n.conformance.test.ts` makes an untranslated string a test failure, not a
  discovery. ⚠️ The German is an engineer's, reviewed for meaning and NOT
  certified; a native CSSD reader should see it before a customer does.
- **Label printing** (§7.4 closed). A pure Code 128 B encoder in
  `@tessa/domain`, checksum pinned against a published vector, rendered as SVG
  onto a print sheet sized in millimetres. Code 128 rather than DataMatrix
  because these labels only ever carry Tessa's own short ASCII identifiers, and
  the app's scanner already accepts the format — so a label it prints is read by
  the same camera that reads the manufacturer's box.
- **E2E** (`apps/tessa-e2e`, `pnpm e2e`): 6 Playwright specs on port 8788,
  covering the recall in both directions and the scan-first path. Verified by
  mutation — reverting the `isPersonal` fix or dropping the unreachable tray each
  fails a spec.

- **Billing** (§6.2). ONE paid plan, `practice`, at $39/month with a 14-day
  trial and a 2,000-credit monthly grant, plus three credit packs. `free` is the
  PARKING STATE of a centre that has not chosen, not a tier anyone is sold.
  Stripe rides the shared `@4dl/billing-rail` under `metadata.app = "tessa"`;
  the webhook is at `/api/webhooks/stripe`, which the route guard already exempts
  in the four places a provider callback has to survive. `dailySweep` drives the
  ladder — past_due → 7d read-only → 30d blocked → 37d purged — and reads are
  never gated at any rung, because withholding a centre's sterilisation records
  over an invoice puts a recall out of reach of the people who have to run it.
- **The four AI surfaces** (§5 Phase 4 opened). `read-label` (photo → GTIN, lot,
  expiry, when the barcode will not scan), `reorder-advisor`, `recall-report`
  and `read-document`, on Workers AI + Gemini through `@4dl/ai`'s metered
  reserve → run → settle. Three gates before a credit is spent: the plan, a
  per-feature switch in Practice Settings, and the `ai:use` grant.
  **None of them writes a record.** `read-label` fills a form a person confirms;
  the narratives are drafts a named person signs. That is Rule 3 and MPBetreibV,
  not caution about model quality.
- **Practice Settings + the operator console.** Branding (accent, logo, sign-in
  copy), the assistant switches, plan and credits; and `admin.tessa.4dl.app` now
  renders the console rather than "no centre at this address".

**Not built:** Rule 3's `suggested_*` shape still has nothing writing into it —
the label reader returns fields to a form rather than a suggestion row. No
expiry sweep. No offline lane (Phase 3): the app has no service worker,
deliberately, because caching a shell before the offline WRITE path exists would
fail every mutation the moment it was used without signal.

**Two honest gaps in the translation.** `@4dl/ui`'s own strings — "Couldn't load
…", "Try again", the date formats — are English and are NOT covered: translating
the design system is a separate piece of work that affects Kova too. And nothing
yet sets a centre's DEFAULT locale; the browser decides, and a person overrides.

**Provisioned, not yet reachable.** The D1/KV/R2 exist and their real ids are
committed; `deploy.yml` ships the worker on every push to `main`. What is left is
two dashboard steps nobody can automate: the `<root>/*` and `*.<root>/*` routes,
and verifying `noreply@4dl.app` under Cloudflare → Email → Email Sending (done
once for the whole platform — if Kova can send, so can Tessa). The Gemini key is
also unset, so `read-label` is the one assistant that cannot run yet; the
operator console says so on its AI panel rather than failing as "unavailable".

Data residency (§7.1) is unanswered and is the one open item that could change
the architecture rather than the config.

**The $39 price is a starting position, not a finding.** Something had to be set
for the catalog to exist; it is defensible against what the product replaces (a
paper Freigabe log and a spreadsheet) and it is admin-editable at runtime. The
credit GRANT is derived rather than guessed — see the per-action cost table in
`apps/tessa/src/billing-store.ts`.

Next: a native reader over the German, then the offline lane.
