# OneInventory — the plan

**kind:** plan · **written:** 2026-08-20 · **status:** parts 1–2 settled, part 3 open

**Everything, counted.** General-purpose inventory — the first app on One.

One app for the boxes in your basement, a clinic's stock room, a hospital's
wards and an old factory's stores. Not three products sharing a login: **one
model, with the setting demoted from premise to profile.**

This is the plan agreed in parts 1 and 2 of planning. Part 3 settles how it is
addressed and how the catalogue is shared, and then this becomes the blueprint
the build follows.

---

## Part 0 — The one paragraph

Most inventory is kept in somebody's head, a spreadsheet and a whiteboard. It
fails the same way everywhere: the thing you needed is gone, and nobody knows
when, or who took it, or whether it expired first. OneInventory replaces that
with a phone camera and a ledger. Point it at a shelf; point it at a thing; say
a number. Everything else — what it is, what it costs to hold, when it expires,
what to reorder, where it went — the app works out. **What makes it one product
rather than eight is that depth is a choice per product, not per company.**

---

## Part I — The idea that makes it work everywhere

### 1.1 The tracking ladder

Tessa forced everything into batch, unit or pack. A basement does not want that
and a pharmacy needs more. So **tracking depth is a per-product choice on a
ladder** — never a per-workspace mode.

| Level | You get | You must | Example |
|---|---|---|---|
| **listed** | it exists, where it lives, its manual, its next service | nothing | the ladder, the fire extinguisher, the compressor |
| **counted** | a number per location | adjust the number | gloves, screws, A4 paper |
| **batched** | + expiry · lot · supplier, per delivery | scan or type on receive | gauze, flour, resin, vaccines |
| **itemised** | + one identity per object, for its whole life | label each one | forceps, laptop, mould, forklift |
| **assembled** | + composed sets with their own lifecycle | build them | surgery tray, tool kit, service kit |

**This is the whole answer to "one app for a basement and a hospital."**
Everything starts at `counted`; only what earns it is promoted.

- **Promotion is safe.** 40 gloves become 40 gloves in an unrecorded batch —
  which is honest, and is what actually happened.
- **Demotion loses history**, so it asks twice.
- **`listed` matters more than it looks.** A thing you never count still has a
  location, a photo, a manual and a service date. That is most of what a home
  or an office actually needs, and no inventory product offers it.

### 1.2 Profiles — how one app serves every setting

> **A profile is a bundle of defaults and vocabulary applied at setup. It is
> never a different code path.**

Chosen at setup: *Home & garage · Clinic · Hospital · Workshop & factory ·
Food & kitchen · Lab · Warehouse · Office & IT*. It seeds:

- **vocabulary** — does a `job` say **case**, **work order**, **cook**, **ticket**?
- **which surfaces are visible** — a basement never sees processes or jobs
- **the default tracking level** for new products
- **label templates**, starter categories, notification defaults

**The profile changes what is SHOWN. It never changes what is POSSIBLE.** A
garage that grows into a business turns things on; nothing is migrated.

That, plus progressive disclosure, is the real answer to *"an old factory, no
training"*: the app shows three things until somebody needs a fourth.

---

## Part II — The model

### 2.1 The tables

| | Holds |
|---|---|
| `product` | the *type* — names, codes, tracking level, base unit, consumption mode, hazards, storage & handling, photos, shelf lives, par level, category |
| `product_code` | every code that identifies it, and at which pack level |
| `product_pack` | alternative units above the base — box, carton, pallet |
| `location` | site → building → room → aisle → rack → shelf → bin. A tree; every node labelled |
| `batch` | one delivery — code, expiry, supplier, received when and by whom |
| `unit` | one object for life — serial, label, acquired, status, service count, retirement |
| `set` · `set_member` · `set_recipe` | composed groups |
| `stock` | the materialised balance: product × location × batch → quantity |
| `ledger` | **every state change, append-only.** The chokepoint |
| `process` · `process_item` | **← a generalisation, see 2.5** |
| `job` · `job_line` | **← the other one, see 2.6** |
| `count` · `count_line` | a stocktake session and what it found |

### 2.2 Base units and packs

**One base unit per product. Packs are conversions above it. Stock is always
held in base units.**

```
product: nitrile glove          base unit: glove
  pack "box"    = 100 gloves    ean 5012345678900
  pack "carton" = 10 boxes      ean 5012345678917
```

A pack is not a thing you hold. It is three conventions at once: an **input**
convention (scan the box code, it means +100), a **display** convention
("10 boxes"), and a **print** convention.

**But the base unit is itself a choice, and usually it is the box.**

| | Base unit | Because |
|---|---|---|
| Basement, workshop | **box** | you never open one for accounting purposes |
| Hospital ward | **box** | you issue boxes to rooms |
| Pharmacy, controlled stock | **tablet** | you genuinely issue singles |

This is Tessa's `divisible` flag doing real work. **`whole`** means the pack IS
the base unit and there is no smaller number; **`divisible`** means you care
about the contents. Get this wrong and the app reports "9.97 boxes", which is
nonsense a person stops trusting immediately.

Promotable, like the ladder: *"we do need to count singles"* converts 10 boxes →
1,000 gloves and keeps the history.

**A pack and a set are different, and the line is clean:**

> **pack** = N of the *same* product · a unit of measure · no identity
> **set** = a composed group of *different* things · has identity · has a lifecycle

A 6-pack of water is a pack. A carton of 10 boxes of gloves is a pack. A surgery
tray is a set. A tool kit is a set.

### 2.3 Codes, and which one to care about

**A product has many codes. Each code knows which pack level it identifies.**

```
product_code { product, value, kind, packLevel, source }
kind: gtin · ean · upc · gs1-datamatrix · national (PZN/NDC/CIP)
    · manufacturer-part · ours
```

> **THE RESOLUTION RULE.** A scan resolves to **(product, pack level, plus
> whatever extra the carrier happened to carry)**. The app never prefers a code.
> It takes what it got and asks only for what is missing.

| Scanned | Resolves to | For a *batched* product |
|---|---|---|
| GS1 DataMatrix | product + pack + **lot + expiry** | **complete — zero typing** |
| EAN-13 on the outer box | product + pack | asks for expiry |
| National code (PZN, NDC) | product | asks for pack + expiry |
| **our own label** | the exact batch or unit | **always complete** |

Two consequences worth naming:

- **Counting mostly does not need the rich code.** A count asks *"how many of
  this, here"*. Any code that resolves to the product is enough. Only a
  batch-level count needs the lot, and that comes from our label or a DataMatrix.
- **Unknown codes are learned.** Scan something unknown → *"what is this?"* →
  pick or create → **the code is attached to that product forever.** The second
  scan is instant. **The catalogue teaches itself**, and that is most of the
  onboarding tax gone.

### 2.4 Consumables, durables, assets — no new concept needed

| | Is | Tracking | Consumption |
|---|---|---|---|
| **Consumable** | goes down, does not come back | counted / batched | discrete · divisible · whole-on-open |
| **Durable** | one object, comes back | itemised | — |
| **Issued** | a durable out with somebody | itemised + `issued`/`returned` | — |
| **Asset** | a durable you never count but do service | itemised + a due date | — |

A forklift, a fire extinguisher and a laptop are the same shape: one object, a
location, a next-service date. This falls out of the ladder plus one flag, which
is one fewer concept for a person to learn.

### 2.5 `process` — the generalisation Tessa was hiding

Tessa's sterilisation cycle, with the clinic removed:

> **A batch run over a set of things, producing evidence, ending in a named
> human release, revocable later by a result that arrives afterwards.**

That one shape is sterilisation, **calibration**, heat treatment, curing, a QA
hold, a cold-chain excursion review, a cleaning validation, a food safety check.
Tessa built it once and could only sell it to clinics.

Everything Tessa learned about it is kept:

- **`ended` and `released` are separate states.** The gap is where a qualified
  person weighs the evidence. Collapsing them makes the machine the releaser.
- **A late result that contradicts an earlier one is REFUSED, never applied** —
  overwriting it rewrites the evidence a release was justified by.
- **A recall freezes what it can reach and NAMES what it cannot.** A report
  showing only what it froze reads as a finished job.
- **A quarantine can always be lifted, and never into a READY state.** Back to
  "needs work", never to "good to go".

### 2.6 `job` — the other one

Tessa's case, with the patient removed:

> **A consuming context that references something outside the system.**

A patient case, a work order, a build number, a service call, a cook, a room
turnaround. Its trace reads backwards: *what did this consume, and is any of it
now in doubt* — joined to the processes rather than trusting a status stored at
close time, because **a job correct on Tuesday can acquire a concern on Thursday
without anything about the job changing.**

### 2.7 Expiry — clocks that compose

```
effective_expiry = min(
  printed_expiry,                  // manufacturer, or GS1 AI (17)
  opened_at   + post_opening_days, // opened containers
  processed_at + process_shelf_days // sterilised, treated, cured
)
```

The read returns **which clock won**, not only the date. A shelf that says
"expires Tuesday" and cannot say why is a shelf nobody trusts.

⚠️ **A shelf life is counted in LOCAL days.** Tessa truncated to the UTC calendar
day: east of Greenwich that lands expiry a day early (safe), west a day late
(not). Take the device's local date at the moment of the act. **Closed on day
one, not deferred.**

---

## Part III — Counting, reconciliation and the ledger

### 3.1 The stocktake — completely absent from Tessa

It is how every real customer starts, and how they stay honest.

**Double counting is prevented by SCOPE, not by identity** — you cannot tell one
generic EAN from another, and you do not need to:

1. Scan the **shelf label** → a session opens *for that shelf*. Everything
   scanned now belongs here.
2. Scan products. The same EAN thirty times is thirty items — correct.
3. **Close the shelf.** Marked counted: when, by whom.
4. Somebody else opens it → *"Ana started counting this shelf 4 minutes ago."*
5. On close, compare to expected and show **only the differences**.

You do not count a shelf twice for the same reason you never did on paper: **you
ticked the shelf off.** Three supports on top:

- **Blind vs informed.** Blind hides the expected number — better data, catches
  errors. Informed is faster. Per session; auditors insist on blind.
- **Stutter detection.** The same code three times in two seconds is probably one
  item and a jumpy finger. Flag it, never block it.
- **Coverage.** The session shows **which shelves have not been counted** —
  because missing a shelf entirely is far more common than counting one twice,
  and much more damaging.

For **itemised** things there is real uniqueness: our label, scanned twice, is
detectably the same object — *"already counted"*.

### 3.2 Consumption vs adjustment — and they must never blur

| | Is | Event | Who |
|---|---|---|---|
| **Consumption** | somebody took or used it | `used` | anyone |
| **Adjustment** | the number was wrong | `adjusted` — **reason required** | keeper+ |
| **Count** | shelf says 37, we thought 40 | `counted`, then an explicit `adjusted −3` | keeper+, on close |

> **A count never silently overwrites.** Closing with a discrepancy writes an
> adjustment naming the count session as its cause.

So the history reads: *"we thought 40 · counted 37 · adjusted −3 on 20 Aug,
count #14, by Ana."* That is the line between an inventory you can audit and one
you can only believe. Unexplained adjustments become a shrinkage report.

**Consumption is captured three ways and all three are legitimate:**

- **Explicit** — scan and take. Best data.
- **By job** — consumed against a work order or case. Best data *and* purpose.
- **Implied by count** — nobody logged it; the count found it gone.

The third is the basement and the busy factory, and the app must not shame
anybody for it. But it **labels it as implied**, so a manager can see *"61% of
consumption this month was recorded, 39% inferred."* That single number is the
best measure of whether the system is actually being used.

### 3.3 The ledger

Tessa's strongest part, kept wholesale.

- **Append-only. Nothing is updated in place.** The balance is a projection with
  a rebuild path.
- **One chokepoint function.** Writes the event and applies the projection in a
  single transaction, compare-and-set on the state, **refuses rather than
  clamps**. Its whole value is in never being bypassed.
- **Corrections are events, never edits.** The wrong number stays visible with
  *"corrected by …"* beside it.
- **Undo** — your own last action, reversible by you, for a window, without
  asking a manager. They will mis-scan. Beyond the window a keeper can, with a
  reason.

**Every event carries: who · when (server instant *and* the device's local
date) · where · what · how many · why · and how it was captured.**

⚠️ **Capture provenance is new versus Tessa and earns its place.**
`scanned · typed · voice · ai-assisted · imported`. *"Was this scanned or
typed?"* is exactly the question somebody asks when a count looks wrong — and it
lets the app report data quality honestly instead of presenting every number as
equally solid.

---

## Part IV — Locations and findability

### 4.1 Depth

**Arbitrary, 3–4 typical.** `site → building → room → aisle → rack → shelf →
bin`. A garage is one level; a warehouse might be five. No artificial cap — but
the app notices when it has become silly (*"1,400 locations and 200 products"*).

Every node gets a printable label. And the detail that matters most:

> **When the camera sees a LOCATION code it does not add stock — it moves the
> session to that location.**

A stocktake becomes: point at shelf → scan, scan, scan → point at the next shelf
→ scan, scan. **Nobody touches the screen to change where they are.** That is
what turns a two-hour count into forty minutes, and it is the highest-leverage
thing in the whole counting flow.

For it to work: location labels are **QR** (readable at an angle, upside down,
from two metres), physically larger than product labels, with a distinguishable
prefix so the app knows instantly which kind of code it has.

### 4.2 The virtual inventory

- **Search → where.** *"torque wrench"* → **Site A · Workshop · Rack 3 · Shelf B**
  · 1 item · last seen 3 days ago
- **Location → what.** Scan a shelf → everything on it, with photos
- **The map** — the tree with counts and value, drillable

Two things make it trustworthy rather than decorative:

- **"Last seen."** *"Last seen 4 months ago"* is the app admitting the record may
  now be fiction. Hiding staleness is how people stop believing a system.
- **Search covers the label text.** OCR the registration photo once and index it,
  so *"the blue stuff we use for the moulds"* finds it. Cheap, and it is how
  people actually search.

---

## Part V — Barcodes and labels

### 5.1 Theirs, ours, and the shelf

1. **If the manufacturer labelled it, use their label.** Never re-label what
   already scans. A UDI on a medical device is one of these, not a special path.
2. **If we made it, we label it.** A set assembled this morning, a decanted
   bottle, a registered tool, a repackaged part.
3. **Every location gets a label, always.** That is what makes *scan bin → scan
   thing → number* work with no dropdowns.
4. **The scanner takes both and knows which is which** by format and prefix.

**Symbology:** QR for locations and sets (scanned constantly, at angles, from a
distance); Code 128 for small item tags where there is no room. Read everything —
EAN, UPC, GTIN, GS1-128, DataMatrix, QR, Code 128/39.

### 5.2 Label printing, including hazards

A genuine gap in almost every inventory product, and compliance-relevant:

- **Decant labels.** Pour solvent from a 20 L drum into a 500 ml bottle and that
  bottle needs its own hazard label in most jurisdictions. GHS pictograms, signal
  word, H and P statements — pulled from the product record.
- **Opened-on labels.** *"Opened 20 Aug · use by 27 Aug"* — kitchens, labs,
  pharmacies.
- **Location, set and asset tags.**

Templates per profile, sized in millimetres, printed to whatever the browser can
reach.

---

## Part VI — AI

### 6.1 The ten, ranked by value × feasibility

| | What | Why it is worth it |
|---|---|---|
| 1 | **Barcode → prefilled product** | The onboarding tax is why people quit inventory apps. One scan and the record exists |
| 2 | **Photo of a label → a product record** | No barcode, or it will not scan. Reads name, brand, size, **hazard pictograms**, storage text |
| 3 | **Photo of a delivery note → receive lines** | One photo instead of thirty scans. Enormous at a goods-in desk |
| 4 | **Ask it in words** | *"do we have blue resin"* · *"what expires this month"* · *"where is the torque wrench"* — replaces navigation for people who will not learn navigation |
| 5 | **Voice capture** | *"add twelve boxes of nitrile gloves to B3."* Gloves on, hands full, cold. The factory-floor input, not a nicety |
| 6 | **Datasheet fetch** | GHS statements for a chemical, storage temperature for a medicine, allergens for food |
| 7 | **Reorder advisor** | consumption rate × lead time → what to buy |
| 8 | **Anomaly watch** | *"40 gloves yesterday, normally 8."* Catches theft, waste and mis-scans |
| 9 | **Count from a photo** | Real for separated countable objects, poor for occluded piles. **Suggestion only** |
| 10 | **Shelf / spatial recognition** | Least reliable. Scoped to *"what changed since last time"*, never *"here is your count"* |

### 6.2 The rule that governs all ten

> **AI may fill anything. It may commit nothing that carries consequence.**

Expiry, quantity, batch code, hazard class, release: **confirm**.
Name, category, description, photo: **just fill it**.

This is a deliberate sharpening of Tessa's Rule 3, which confirmed everything —
and an app that asks you to confirm a category guess is one where people stop
using the camera at all.

### 6.3 What AI fills at registration

| Field | From | Commit |
|---|---|---|
| name · brand · category · description | barcode lookup, label photo | **auto** |
| image | the photo just taken | auto |
| pack size / base unit | label text ("100 pcs") | suggest |
| storage · handling · GHS hazards | pictograms, datasheet | **suggest, source cited** |
| expiry *format* | label pattern | auto — a parsing hint |
| expiry *value* | this batch's label | **confirm, always** |
| shelf life after opening | datasheet | suggest |
| **tracking level** | inference | **suggest, with the reason** |

**It can pick the tracking level**, and the rules are genuinely inferable:

- printed expiry → at least **batched**
- hazardous or controlled → **batched**
- has a serial, is durable equipment → **itemised**
- cheap, high volume, no expiry → **counted**
- a fixture or a tool that never moves → **listed**

It must say **why**: *"Batched — it has an expiry date."* That is the difference
between a magic guess and a suggestion somebody can agree with in half a second.
Disagree, and the workspace remembers the correction for that category.

---

## Part VII — The people

### 7.1 The UX rules for somebody who will never be trained

1. **The camera is the home screen**, not a menu. Point at anything; it says what
   it is and what you can do with it.
2. **Everything has a photo.** Untrained people navigate by picture, never by code.
3. ⚠️ **Take it now, name it later.** An unknown thing is received as "unknown,
   photo attached" and sorted out afterwards. **The worst outcome is somebody not
   recording something because a form demanded a field they did not have.**
4. **Undo, by the person who did it, without asking a manager.**
5. **Offline on the counting path.** Tessa deferred this and should not have. The
   back of an old factory has no signal, and that is exactly where the stock is.
6. **No dropdown where a scan works. Voice where hands are full.**
7. **Every screen answers one question.** One's design language already enforces it.

### 7.2 Roles

Tessa's sharpest split generalises — **doing and signing off are different
grants** — and one thing Tessa never had is added: **location scoping.**

| Role | |
|---|---|
| **Owner** | everything, including money and people |
| **Manager** | everything operational |
| **Keeper** | receive, move, count, adjust |
| **User** ← the common one | take things, use things, log jobs. *Cannot* adjust counts or edit the catalogue |
| **Approver** | the release / sign-off grant — orthogonal to the rest |
| **Viewer** | read and reports |

**Scoped to locations:** a ward manager sees their ward, a line lead their line,
your kid the garage. This is what makes hospital scale work, and Tessa's
single-centre assumption could not express it.

### 7.3 Notifications

Expiring soon · expired · low stock · out of stock · process failed · release
pending · recall issued · item overdue back · service or calibration due · count
discrepancy · unusual usage · reorder suggested — plus the platform's own
billing and staff types.

Inbox, push and email through One's channel algebra, **filtered by location** so
the ward manager is not told about the kitchen.

---

## Part VIII — What Tessa never had

| | |
|---|---|
| **Stocktake / cycle counting** | absent from Tessa. How every real customer starts |
| **Spreadsheet import** | ditto. Nobody types in 800 products |
| **The tracking ladder, including "do not track"** | Tessa forced batch/unit/pack |
| **Multi-site + location-scoped roles** | Tessa was one centre |
| **Offline** | deferred |
| **Reorder + suppliers** | Tessa had an AI advisor and no list |
| **Issue & return to a person** | the events existed; no screen used them |
| **Kits / BOM** | "making one widget consumes four screws" — the factory case |
| **Hazard labelling** | Tessa printed generic labels |
| **Undo** | the ledger allowed it; nothing surfaced it |
| **Capture provenance** | scanned vs typed vs voice vs AI vs imported |
| **Local-day expiry** | Tessa's known, never-closed bug |

---

## Part IX — Decisions taken

| | Decision |
|---|---|
| **Tracking depth** | a ladder, per product, promotable |
| **Base unit** | one per product, packs convert above it; usually the box |
| **Codes** | many per product, each knowing its pack level; richer is better, nothing is required; unknown codes are learned |
| **`process`** | the generalised batch-run-with-release. Sterilisation is one instance |
| **`job`** | the generalised consuming context with an external reference |
| **Profiles** | defaults and vocabulary at setup. Never a code path |
| **AI** | fills anything, commits nothing consequential |
| **Counting** | scoped by location, closed per shelf, blind by default for auditors |
| **Adjustments** | always explicit, always with a reason, never silent |
| **Ledger** | append-only, one chokepoint, corrections as events |
| **Expiry** | composing clocks, reporting which won, counted in **local** days |
| **Roles** | six, location-scoped, with sign-off orthogonal |
| **The mark** | the One stem and beak with six counters — a barcode cut into the numeral. **The beak is amber** |
| **Money** | ⏳ **deferred.** Cost, stock value and spend belong to **OneBook**, a future accounting app. OneInventory is built to modularise into it rather than growing its own ledger of money |

### Still open — part 3 settles these

1. **Addressing.** One workspace per site, or one workspace many sites? Asked in
   part 2 and deliberately not answered — part 3 changes the question.
2. **The shared code → product catalogue.** Whether a GTIN identified in one
   workspace helps every other one. The strongest moat available here, and a
   cross-tenant path One does not currently have. Part 3 changes this question too.

---

*Tessa's record is `docs/TESSA-AS-BUILT.md`, and it is deleted once this plan is
confirmed to cover everything it did.*
