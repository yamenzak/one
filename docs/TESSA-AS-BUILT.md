# Tessa, as built — the record kept after the code was deleted

**kind:** record · **written:** 2026-08-20 · **status:** closed

Tessa was the second app on the 4DL platform: sterile-supply and consumable
traceability for medical centres. It was deleted on 2026-08-20, whole, to make
room for **OneInventory** — the first app on One.

This document exists because the code is going and the *thinking* should not.
`git log` has every line; nobody plans from `git log`. What follows is what
Tessa learned, in the order a successor needs it.

**Why it was deleted rather than ported.** Two reasons, and the second is the
one that decided it:

1. **It was not built for One.** It is a Hono worker on `@4dl/*` — the previous
   platform. Every seam it uses (route guard, entitlement engine, tenancy doors,
   billing rail) has a different shape under OneEngine. A port would have been a
   rewrite wearing a migration's clothes.
2. **Its domain model is narrower than its idea.** Tessa's spec opens on a
   positive spore test in a clinic's autoclave. Everything downstream is correct
   *for that* and quietly assumes it — reprocessing classes, Freigabe, cases,
   MDR. The general product underneath ("scan it, count it, prove it") was
   never allowed to be general. OneInventory is that product with the clinic
   demoted from premise to profile.

---

## 1. The one paragraph

A stock room, a CSSD and a set of treatment rooms run on paper, memory and a
whiteboard. Tessa replaced that with a phone camera. Every box that arrives is
scanned; every instrument tray is packed, sterilised and released against a
named person; every case records what was actually used. When a spore test comes
back positive on Thursday, the centre can name every pack from that load and
every case it touched — in one query, not one bad afternoon.

**Counting boxes is table stakes; a spreadsheet does that. Answering the recall
question is the product.** Every design decision was downstream of that sentence,
and it is the reason a centre would pay.

---

## 2. The three rules — the invariants, and how each was enforced

These were Tessa's equivalent of Kova's "one fact, one home". Each was
*enforced*, not documented. **All three generalise; see §11.**

### RULE 1 — Tessa holds a case reference and nothing else about a person

No name, no date of birth, no diagnosis, no procedure description beyond a code
the centre chose. The case reference was a foreign key into a system Tessa could
not read.

*Why:* the moment the app holds clinical data it inherits the whole weight of the
health sector — and gains nothing, because "what did we use" never needs to know
who the patient was.

*Enforced by:* a conformance test asserting no column on any table carrying a
case reference matches `/(^|_)(name|dob|birth|diagnos|mrn|nhs|insur)/`. A
forgotten column was a test failure rather than a discovery.

### RULE 2 — Tessa records a decision, it never makes one

Tessa never declared an instrument sterile, a material safe or a pack released.
It recorded that **a named, qualified person did so, at a time, with the evidence
in front of them**.

*Why, and this one is load-bearing:* under EU MDR, software with a medical
purpose is a medical device — conformity assessment, notified body, technical
documentation. Administrative and logistics software is not. The line runs almost
exactly along this rule. Software that *computes a release decision* argues to be
regulated; software that *captures a human's decision and makes it auditable* is
a logbook with a camera.

*Enforced by:* every release, quarantine lift and expiry override carries
`decided_by` and `decided_at`, and no code path writes either from a system
actor. `releaseCheck` reports what the evidence permits and **releases nothing**.

### RULE 3 — AI never auto-commits a safety-relevant value

An expiry date, lot code or instrument count read by a model was a **pre-filled
suggestion a human confirms**, always, with the source image retained.

*Why:* a wrong expiry is not a bad experience, it is a patient outcome.

*Enforced by:* AI-derived fields were to land in a `suggested_*` shape the commit
path cannot read. ⚠️ **This half was never built** — the label reader returned
fields into a form instead. The rule held by convention, which is exactly what
the rule says not to rely on.

---

## 3. The domain model

### 3.1 Three identity granularities — the central decision

> Most inventory systems pick one and then fight it forever.

**Catalog item** is the *type* — "Sterile gauze 10×10", "Kelly forceps 14cm".
It carries handling rules, warnings, storage class, images, default shelf lives
and (for instruments) the reprocessing class. Physical things are then tracked at
one of three granularities:

| | Identity is | Example | Carries |
|---|---|---|---|
| **Lot** | a batch | gauze, sutures, saline | expiry · lot code · **quantity** · supplier |
| **Unit** | one object, for life | a specific forceps | cycle count · service history · retirement |
| **Pack** | a *composed set* with its own identity | "minor surgery tray" | recipe · member units · sterilisation state |

**The pack is why a single-granularity model fails.** A pack is built from units,
sterilised as a whole, opened as a whole, and has a lifecycle its members do not
individually have. Opening a pack returns its units to the dirty pool — that
transition is the heart of the CSSD loop.

### 3.2 The ledger — every state change is an event

**Append-only events; current state is a materialised projection.** Same shape as
`@4dl/billing`'s credit ledger, for the same reason.

*Why not mutable rows:* the questions the product exists to answer are
**temporal**. "What was the sterilisation state of this pack *at the moment it
was opened*" cannot be answered from a row that has since been overwritten. **A
recall is a query over history, not over the present.**

*The pragmatic half:* stock levels are read constantly and projecting per request
does not scale, so balances are materialised alongside — ledger is truth, balance
is cache, and there is a rebuild path.

**The chokepoint** (`apps/tessa/src/ledger.ts`) was the design's whole value.
`applyEvent` was the ONLY way a lot, unit or pack changed: it wrote the ledger row
and applied the state change in a single `db.batch()`, guarded the state update
with a compare-and-set, and **refused rather than clamped**. `applyEvents` was the
plural form — one act over N+1 rows, all of it or none, with an unwind when a
member lost its compare-and-set. Tessa's equivalent of Kova's
`requireClientAccess`: the value is entirely in it never being bypassed.

### 3.3 The event registry — the state machine

Sixteen events. `kinds` says which granularities the event means anything for;
`quantity` how it moves a lot's count; `terminal` that the thing has no further
life.

| Event | Kinds | Qty | Notes |
|---|---|---|---|
| `received` | lot, unit | increase | |
| `moved` | lot, unit, pack | none | provenance survives a transfer |
| `opened` | lot, pack | none | **same word, two consequences** — a lot starts the post-opening clock; a pack commits the whole thing and returns members to dirty. This is why the projection is per-kind, not per-event |
| `consumed` | lot | decrease | |
| `wasted` | lot | decrease | |
| `cleaned` | unit | none | closes the CSSD loop — a dirty instrument becomes available. **Must be an act somebody performs, not a status a route may set**: without it an instrument out of an opened tray is stuck dirty forever, and the pressure to "just set it back to clean" is how an instrument gets from a patient into the next tray unreprocessed |
| `packed` | unit, pack | none | **both halves needed** — the pack gets "assembled", each unit gets "I went into tray T on Tuesday", which is the half a recall reads backwards |
| `loaded` | pack | none | into the machine. Separate from `sterilised` so "which trays are in cycle 47" is answerable *before* the cycle ends — otherwise a load failing mid-run has no recoverable membership |
| `sterilised` | pack | none | |
| `released` | pack | none | |
| `quarantined` | lot, unit, pack | none | |
| `issued` | unit, pack | none | |
| `returned` | unit, pack | none | |
| `cleared` | lot, unit, pack | none | a quarantine lifted, by a person. ⚠️ **Never returns something to a READY state** — a tray from a failed load goes to `packed`, an instrument to `dirty`, a lot to `active`. Every one lands in "needs work". Clearing straight to `sterile` would put a failed load on a shelf with one click |
| `retired` | unit | none, **terminal** | |

Two ideas here are worth more than the table. **A one-way door is one people stop
walking through** — quarantine is reversible precisely so that freezing stays
cheap. And **`terminal` exists so the app refuses**: without it a retired
instrument can be packed into a tray, an error obvious in a sentence and
invisible in a table.

### 3.4 Location is a dimension, not a field

**Site → Room → Shelf/Bin**, each with its own QR code.

- Stock is per-location. "Do we have gauze **in Clinic A**" is the only question
  anyone actually asks.
- Movement is an event, so provenance survives a transfer.
- Expiry sweeps and par-level alerts are per-location.
- Scanning a bin then an item is what makes receiving a two-scan operation with
  no dropdowns.

### 3.5 Expiry is three clocks that compose

```
effective_expiry = min(
  printed_expiry,                    // manufacturer, or GS1 AI (17)
  opened_at   + post_opening_days,   // multi-dose vials, opened solutions
  sterilised_at + sterile_shelf_days // packs
)
```

**The middle clock matters more than it looks.** Post-opening expiry is
frequently shorter than printed expiry, and that gap is exactly where somebody
gets hurt. `opened_at` is inferred from first consumption **but always
overridable** — a person who opened it yesterday and is logging it today must be
able to say so.

The read returns **which clock won**, not only the date. A shelf that says
"expires Tuesday" and cannot say why is a shelf nobody trusts.

### 3.6 How a thing is consumed — a catalog flag

- `divisible` — a bottle. Partial use; remainder still valid.
- `discrete` — count whole units down.
- `single_use_on_open` — a sterile pack. Opening commits the whole thing.

---

## 4. The flows

Ordered by how much they mattered, not by build order.

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

**The case flow was the UX centrepiece.** Type the file number, then it is pure
scanning until "done". Everything else in the app was in service of that screen
being fast in a room where nobody has a spare hand.

**Prep checklists** are structurally identical to Kova's plan → session: a
template that instantiates.

### 4.1 The sterilisation loop, in detail

A load runs, ends with its two fast indicators recorded, and is RELEASED by a
named person.

**`ended` and `released` are separate states**, and that gap is the product.
It is where a qualified person weighs the evidence; collapsing them would make
the autoclave the releaser.

The biological indicator arrives a day or two later. When it fails on a load
already released, the recall:

- **freezes every tray it can still reach**, and
- **NAMES the ones it cannot** — the opened ones, with the case reference the
  clinic typed.

**That second list is the point.** A report showing only what it froze reads as a
finished job.

A second biological reading that disagrees with the first is **REFUSED rather
than applied**, because overwriting it rewrites the evidence a release was
justified by.

### 4.2 The trace, read backwards

`/api/trace/case/:id` answers the reverse of the recall: what did this procedure
use, and — the reason it exists — **is any of it from a load that has since
failed**.

**A case correct on Tuesday can acquire a concern on Thursday without anything
about the case changing.** So the query joins the trays to the cycles rather than
trusting a status stored at close time.

A closed case REFUSES new lines and can be reopened by a person; `reopen_count >
0` is what marks an amended record as amended. `resolveCase` was the one guard
both writing routes ran — an unchecked case id resolves to nothing and leaves the
trace quietly incomplete forever.

---

## 5. The schema — 11 tables

Every table carried `tenant_id`, so the erasure cascade was complete. There was
deliberately **no subject scope**: everyone who touches Tessa works at the centre.

| Table | Holds |
|---|---|
| `catalog_items` | the type. kind, tracking (`lot`/`unit`/`pack`), name, code, gtin, manufacturer, consumption, unit_of_measure, `post_opening_days`, `sterile_shelf_days`, `reprocessing_class`, storage/handling notes, warnings, image, `par_level`, active |
| `locations` | tree — `parent_id`, kind (site/room/shelf/bin), name, code |
| `lots` | catalog_item, location, `lot_code`, gtin, `printed_expiry`, `opened_at`/`opened_by`, **quantity**, received_at/by, supplier, status, quarantine_reason |
| `units` | catalog_item, location, serial, `label_code`, acquired_at, `cycle_count`, status, retired_at/reason, notes |
| `pack_recipes` | name, code, `sterile_shelf_days`, notes, active |
| `pack_recipe_items` | recipe → catalog_item × quantity |
| `packs` | recipe, location, `label_code`, status, packed_at/by, `cycle_id`, sterilised_at, released_at/by, expiry, opened_at/by, `case_id`, quarantine_reason |
| `pack_members` | pack → unit, added_at |
| `sterilisation_cycles` | machine, program, `cycle_number`, started/ended, operator, status, `require_biological`, `physical_ok`, `chemical_ok`, `biological_ok`, biological_read_at/by, released_at/by, failed_at, failure_reason, `evidence_key`, notes |
| `cases` | `case_ref`, `procedure_code`, location, status, opened/closed/reopened at+by, `reopen_count`, notes |
| `ledger` | at, `actor_user_id`, event, `tracked_kind`, `tracked_id`, catalog_item, `quantity_delta`, from/to location, case, cycle, note, meta |

---

## 6. Roles and permissions

Five roles. **No customer role** — everyone who touches Tessa works at the
centre, so every member consumed a staff seat.

| Permission | owner | stock keeper | CSSD | clinical | auditor |
|---|---|---|---|---|---|
| `catalog` | CRUD | create/read/update | read | read | read |
| `stock` | read receive move consume quarantine | ← same | read | read, consume | read |
| `instrument` | read manage retire | read | read manage retire | read | read |
| `pack` | read build open | read | read build open | read, open | read |
| `sterilisation` | read run release | — | read run release | — | read |
| `case` | read create close | — | — | read create close | read |
| `trace` | read | read | read | read | read |
| `report` | read | — | — | — | read |
| `billing` | read manage | — | — | — | — |
| `settings` | read manage | — | — | — | — |
| `ai` | use | use | use | use | — |

**`sterilisation:run` and `sterilisation:release` are separate permissions**,
because Freigabe is a qualified act and frequently not the person who ran the
machine. This is the sharpest permission split in the app and it generalises:
*doing the work* and *signing it off* are different grants.

---

## 7. What was sold

**Per site, not per seat.** Everyone in a clinic touches this app; a per-user
price makes the customer ration access to a safety system — the wrong incentive
and an easy objection to lose on.

**ONE plan, not a ladder.** A practice with three treatment rooms and one with
eight run the same loop, receive the same stock and answer to the same regulator.
A tier ladder would make a clinic choose by counting rooms, and re-choose every
time it opened one.

| | |
|---|---|
| Plan | `practice`, **$39/month**, 14-day trial |
| Grant | **2,000 AI credits**/month |
| Quotas | staffSeats 2, locations 2, catalogItems 50, storageMb 200 *(the `free` parking row)* |
| Packs | 1,000 cr / $1 · 5,500 cr / $5 · 30,000 cr / $25 |
| Features | `customDomain`, `ai` |

**`catalogItems` was deliberately unlimited on the paid plan** — a ceiling there
would make a centre choose which instruments to track, defeating the trace the
product exists to produce.

`free` was the **parking state** of a centre that had not chosen, not a tier
anyone was sold. **The $39 was a starting position, not a finding.**

### Credit costs — the grant was derived, not guessed

Anchor: **1 credit = $0.001**. Workers AI neuron at $0.000011 × 3 markup ⇒
1 credit ≈ 30 neurons.

| Action | Lane | Credits |
|---|---|---|
| read-label (photo → GS1) | vision | 2 |
| summarise-document | text | 11 |
| recall-narrative | text | 11 |
| reorder-advisor | text | 18 |

A busy centre's month ≈ **540 credits** (~$0.54 at retail). The grant of 2,000 is
~3.7× that and ~5% of the subscription — sized so nobody meets the ceiling doing
ordinary work.

**This method is the transferable part**: price the actions, model a real month,
grant a multiple of it, and say so in a comment beside the number.

---

## 8. The routes

```
GET  /health                        GET  /context           GET  /me
GET  /api/catalog                   POST /api/catalog
GET  /locations                     POST /locations
GET  /stock                         POST /stock/receive
GET  /stock/:lotId/history          POST /stock/:lotId/:action
GET  /instruments                   POST /instruments
GET  /instruments/:id/history       POST /instruments/:id/:action
GET  /recipes                       POST /recipes
GET  /packs        GET /packs/:id   POST /packs        POST /packs/:id/open
GET  /cycles       GET /cycles/:id  POST /cycles
POST /cycles/:id/end               POST /cycles/:id/biological
POST /cycles/:id/release
GET  /cases        GET /cases/:id   POST /cases        POST /cases/:id/:action
GET  /trace/case/:id                GET  /trace/cycle/:id
GET  /insights                      GET/PATCH /settings
POST /ai/read-label   POST /ai/reorder-advisor
POST /ai/recall-report POST /ai/read-document   GET /ai/features
GET  /billing  POST /billing/checkout-plan  POST /billing/checkout-pack
POST /billing/portal                POST /webhooks/stripe
GET  /me/onboarding/plans           POST /me/onboarding/plan
GET  /admin/tenants  POST /admin/tenants/:id/plan  POST /admin/tenants/:id/topup
GET  /admin/ai/features
```

The `:action` shape (`/stock/:lotId/:action`, `/instruments/:id/:action`,
`/cases/:id/:action`) routed straight into the event registry — one handler, the
registry deciding what is legal. That is a good pattern and it survives.

---

## 9. The app — five surfaces

A scan-first PWA the worker served at the same origin.

| Screen | Is |
|---|---|
| **Today** | *not a dashboard.* "A dashboard shows you how things are going; this shows you what needs you." The one screen worth opening cold |
| **Stock** | the shelf as the person standing in front of it sees it — sorted by effective expiry, soonest first. **FEFO as a default rather than a feature** |
| **CSSD** | trays and loads, one screen with two tabs — two jobs at two benches, but the second is waiting on the first |
| **Cases** | what a procedure used, and whether any of it is now in doubt |
| **Recall** | **a ROUTE rather than a sheet**, because it is a document a centre works through over days |

Plus: `ScanSheet` (one camera, then a decision — the thing scanned could be four
kinds of object), `ReceiveSheet` (the two-scan flow), `Labels` (printing),
`Insights`, `Settings`, `Staff`, `Assistants`, `Admin`, `Doors`, `Login`,
`AcceptInvite`, `CentreBlocked`.

**Scanning** used the native `BarcodeDetector` where it exists and lazily
imported ZXing where it does not. **The typed field beside it was not a fallback**
— it is the path a hand-held USB scanner takes, since those present as a keyboard.

---

## 10. The pure package — `@tessa/domain`

No I/O, exhaustively testable, 78 tests verified by mutation. **This is the part
worth reading before writing OneInventory's.**

| Module | Does |
|---|---|
| `gs1.ts` | GS1/UDI element-string parsing — AI `(01)` GTIN, `(17)` expiry, `(10)` lot, `(21)` serial, `(11)` manufacture. GTIN check-digit validation, two-digit-year windowing, the `GS` separator |
| `expiry.ts` | the three-clock composition, `expiryStatus` (none/ok/soon/expired), `daysUntilExpiry`, `isUsable` — and it reports **which clock won** |
| `events.ts` | the sixteen-event registry above, `nextQuantity`, `isFinished`, `isFrozen`, `eventAppliesTo` |
| `sterilisation.ts` | `releaseCheck` (verdict + blocks, **releases nothing**), `biologicalOutcome` (confirmed/cleared/recall/fail/**contradiction**), `recallDisposition` (quarantine/already_quarantined/**unreachable**), `summariseRecall` |
| `code128.ts` | Code 128 B encoder, checksum pinned against a published vector, rendered as SVG onto a sheet sized in millimetres |

**Code 128 rather than DataMatrix** because these labels only ever carry the
app's own short ASCII identifiers, and the scanner already accepts the format —
so a label it prints is read by the same camera that reads the manufacturer's box.

---

## 11. Notifications

`cycle_failed` · `recall_issued` · `release_pending` · `load_released` ·
`stock_low` · `stock_expiring` · `staff_joined` · `staff_role_changed` ·
`billing_past_due` · `billing_suspended` · `billing_canceled` ·
`billing_trial_ending` · `payment_refunded` · `payment_disputed`

---

## 12. What was built, and what was not

**Built:** the domain package; the 11-table schema; roles; the ledger chokepoint;
the sterilisation loop and the recall in both directions; stock routes (locations,
two-scan receive, move/use/discard/quarantine/open, shelf read, lot history);
cases and the backwards trace; the CSSD loop (instruments, recipes, tray build,
the open transition); the five-surface app; German (`@4dl/i18n`, en+de, with
`Freigabe` and `Charge` as terms of art rather than translated literally); label
printing; billing; four AI surfaces; practice settings and the operator console.
84 app tests + 78 domain tests. 6 Playwright specs.

**Not built:**
- **Rule 3's `suggested_*` shape.** Nothing wrote into it; the label reader
  returned fields to a form. The rule held by convention.
- **No expiry sweep.** The alert existed as a read, not a job.
- **No offline lane.** Deliberately: caching a shell before the offline WRITE
  path exists fails every mutation the moment it is used without signal.
- **`@4dl/ui`'s own strings were never translated** — "Couldn't load…", "Try
  again", date formats. Translating a design system is separate work.
- **Nothing set a centre's DEFAULT locale**; the browser decided.
- **Never reachable in production.** Resources provisioned, worker deployed, but
  the `<root>/*` routes were a dashboard step nobody took. **Tessa never served a
  real customer.**

---

## 13. What generalises, and what was the clinic

The line OneInventory has to draw. Left column is inventory truth; right is a
clinic's version of it.

| General — keep | Clinical — demote to a profile |
|---|---|
| Three granularities: **batch · item · set** | "lot / unit / pack" as the only words |
| The **event ledger + materialised balance** | — |
| The **chokepoint**: one function, compare-and-set, refuse-don't-clamp | — |
| **Location as a dimension**, site→room→bin, QR per node | — |
| **Expiry as composing clocks** and *which one won* | the third clock being *sterilisation* specifically |
| **Consumption modes** divisible / discrete / single-use-on-open | — |
| **Barcode-first**, GS1 parse, USB-scanner-as-keyboard | GS1/UDI as *the* standard |
| **Record a decision, never make one** — `decided_by` + `decided_at` | Freigabe / MDR as the reason |
| **Doing ≠ signing off** as separate grants | `sterilisation:run` vs `:release` |
| **A process with evidence and a named release** | *sterilisation* as the only such process |
| **A recall that names what it cannot reach** | biological indicators, spore tests |
| **A consuming event that links to an external reference** | *case* / patient procedure |
| **Print your own labels** for what you created | — |
| Reversible quarantine that never returns to READY | — |
| One plan, per site, AI credits as the scaling axis | $39, "practice" |

**The generalisation that matters most:** Tessa's sterilisation cycle is one
instance of a shape — *a batch process, over a set of items, producing evidence,
ending in a named human release, revocable later by a late-arriving result.*
That is calibration in a lab, curing in a factory, a temperature excursion in a
cold chain, a QA hold in a kitchen. Building it once, generally, with the clinic
as a configured profile, is the whole thesis of OneInventory.

Likewise a **case** is one instance of *a consuming context that references
something outside the system* — a job, a work order, a patient procedure, a
build, a service call.

---

## 14. Open questions Tessa never answered

Carried forward, because they are still open.

1. **Data residency.** Flagged as the largest unknown and the one that could
   change the architecture rather than the config. ✅ **One answers this** —
   residency is a first-class dimension, fixed at creation, changed only by a
   move.
2. **i18n as a platform concern.** Answered by `@4dl/i18n` for the old platform.
   **Open again on One** — OneEngine has no i18n.
3. **The MDR line.** Rule 2 is the engineering position and a sound one; it was
   never confirmed by someone qualified. Still true.
4. **Label printing hardware.** Which printers, what protocol, does the browser
   reach them. Tessa punted to a print sheet. Unresolved.
5. **Autoclave / machine integration.** Deliberately not depended on: formats
   vary, many machines print only a number, plenty of sites have no printer. The
   app printed its own labels and photographed the machine's printout as
   evidence. **This decision was right and should be repeated.**
6. **The UTC day boundary.** `opened_at`/`sterilised_at` were UTC instants
   truncated to the UTC calendar day. East of Greenwich that lands the expiry a
   day EARLY (safe); west it lands a day LATE (not safe). The fix is Kova's:
   take the device's local date at the moment of the act. **A shelf life is
   counted in local days.** Never closed — close it in OneInventory from day one.

---

*Deleted 2026-08-20. `git log -- apps/tessa apps/tessa-app packages/tessa-domain`
has every line.*
