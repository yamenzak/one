# OneInventory — the plan

**kind:** plan · **written:** 2026-08-20 · **status:** settled — this is the
blueprint the build follows

**Everything, counted.** General-purpose inventory — the first app on One.

One app for the boxes in your basement, a clinic's stock room, a hospital's
wards and an old factory's stores. Not three products sharing a login: **one
model, with the setting demoted from premise to profile.**

Parts I–IX are the product. **Part X is how it is built**, and it is the half
that decides whether any of the rest arrives: OneInventory is the first app on
OneEngine, so almost everything above is a declaration rather than a feature to
write. Read Part X before writing a line.

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

---

## Part X — How it is built, on OneEngine

**The source of truth is not this document.** `engine/docs/ENGINE.md` is what
exists (generated from the real composer, so it cannot go stale),
`engine/docs/BUILDING.md` is how to add to it, `engine/docs/DECISIONS.md` is
D1–D43, and `engine/design/{README,DESIGN,AMBIENCE}.md` is everything a screen
is made of. This part says how OneInventory lands on them, and nothing else.

### 10.1 The two questions left open, and why both dissolve

They were left open because part 3 changes the question. It does.

**1. "One workspace per site, or one workspace with many sites?"**

Neither — the question assumes a workspace is a PLACE, and it is not. **D1: the
tenant is primary; an app is a capability switched on for it.** A workspace is a
business: one roster, one address, one bill, one brand, one installable tile. A
workspace per site means a hospital with four buildings has four rosters, four
subscriptions and four inboxes, and needs a switcher to paper over the seam —
which is the exact failure D1 was written after.

> **One business = one workspace. A site is a `location` row.** Part IV's tree
> already models it, and §7.2's location-scoped roles are what make a ward
> manager's view a ward.

The question is also answered a second time by cost: a shard holds many
workspaces of mixed products (D5), so "many workspaces" saves nothing and
forfeits every cross-site question — *where else do we have this* is one query
inside a workspace and impossible across four.

**2. "Should a GTIN identified in one workspace help every other one?"**

Yes, and One already has two mechanisms for it — because it is not a
cross-tenant question at all. **A GTIN is a fact about the world**, in the same
category as a model's price (D24, D34): discovered, not owned, identical
everywhere, and therefore never a tenant's to hold privately.

| | Mechanism | Holds |
|---|---|---|
| **The code book** | `need({ kind: "kv", perResidency: false })` | `code → name · brand · pack size · category`. The engine's own words for this need are *"a cache of public reference data is legitimately global"* |
| **Anything queryable** | a collection with `scope: { of: "global" }` | the escape hatch the kernel names as *"a catalogue every tenant reads, owned by the deployment"* |

⚠️ **AND WHAT IS PUBLISHED IS THE CODE, NEVER THE WORKSPACE.** A learned entry
carries the barcode and what it turned out to be. It never carries who scanned
it, how many they hold, where, what they paid, or their supplier. That line is
not a policy note — it is the difference between a moat and a disclosure, and it
is what `holds` on the need declares.

⚠️ **A LEARNED ENTRY IS A CANDIDATE, NOT A PUBLICATION.** One workspace's typo
becoming everybody's product name is the failure this feature has. An entry is
promoted when independent workspaces agree, or when an operator confirms it from
the console — the same shape as the AI catalogue, where the world's facts sync
themselves and the deployment's decisions never do.

⚠️ **AND `scope: "global"` LIVES ON THE SHARD, WHICH IS HONEST RATHER THAN
GLOBAL.** `statementsFor` puts an app's collections in that app's shard schema
module, so a global-scoped collection is shared by every workspace *on that
shard*. With one shard today that is the whole deployment; with three it is
three catalogues. The KV need is the one that is genuinely deployment-wide, and
it is why the code book is a need rather than a collection.

### 10.2 What is not built, because declaring it is enough

Before any OneInventory-specific work: an `AppSpec` with an id, a name, a mark
and one role composes into a live product with all of this.

| Free | Count |
|---|---|
| Roster, invitations, seats, roles · inbox, its two-level policy and push · the workspace's brand and installable tile · settings · the package rail · the bill and the wallet · flags · `centre.view` | **32 operations** |
| Per collection — `list` `read` `create` `update` `delete`, with the scope column written by the platform | **+5 each** |
| The moment one field is a file — upload, list, read, delete, and a bucket per jurisdiction created by the reconciler | **+4** |
| Sign in, agreements, name, presentation, leave, export, erase, API tokens, push subscriptions — on every door | **27 personal** |

And, without an app writing a screen: the settings screens (from `settings` +
`settingAreas`), the notification policy screen, the flag console, the plan
shelf, the consent sheet, the processing record, the job console, the help
centre, the onboarding checklist, the MCP tool catalogue, the audit entry on
every write, idempotent replay, and erasure derived from every collection's
`scope` and `onClose`.

> **So the work in Parts I–IX that is actually CODE is: the ledger chokepoint,
> the resolution rule, the count session, the expiry clocks, the process release
> rail, the AI prompts, and the screens.** Everything else is a literal.

### 10.3 Which of Tessa's eleven tables survive as declarations

Eighteen collections. Every table in Part II is one; nothing is "just a table
over there", because the schema, the CRUD, the export, the ROPA row and the
erasure cascade all derive from the literal.

| Collection | scope | `without` | quota | why |
|---|---|---|---|---|
| `product` | tenant | — | `products` | one `media` field (the photo) is what earns the bucket |
| `product-code` | tenant | — | — | many per product; each knows its pack level |
| `product-pack` | tenant | — | — | conversions above the base unit |
| `location` | tenant | — | `locations` | the tree |
| `batch` | tenant | — | — | one delivery |
| `unit` | tenant | — | — | one object for life; carries the `set` ref |
| `set` | tenant | — | — | recipe as a `json` field — a set has no join table |
| `supplier` | tenant | — | — | Tessa had an advisor and no list |
| `stock` | tenant | `create` `update` `delete` | — | **a projection. Only the chokepoint writes it** |
| `ledger` | tenant | `create` `update` `delete` | — | **append-only, and the opt-out is what makes that true rather than intended** |
| `process` · `process-item` | tenant | `delete` on both | — | evidence is not deletable |
| `job` · `job-line` | tenant | — | — | |
| `count` · `count-line` | tenant | `delete` | — | a session is closed, never removed |
| `code-book` | **global** | `create` `update` `delete` | — | the shared catalogue; written by the promotion job |

⚠️ **`without` IS THE WHOLE OF "APPEND-ONLY".** It is an opt-OUT list on
purpose — a collection whose author forgot `delete` has no way to remove a
record and finds out from a customer, while an omission written down is visible
in review. `ledger.create` being absent is what stops a client posting its own
history; the chokepoint writes the row in a handler, through `db`, the way
hello's `note.publish` does.

⚠️ **NO VAULT FIELD, AND THAT IS A DECISION RATHER THAN AN OVERSIGHT.**
OneInventory holds stock, not people. §2.6's `job` **references** something
outside the system — a case number, a work order, a room — and a reference is a
label the workspace chose. It is declared `holds: "contact"` so it reaches the
processing record, the export and the retention clock; it is not `sensitive`,
and declaring a vault field this product does not need would put the custody
machinery in front of a work-order number. If a profile ever wants a patient
identifier on a job line, **that is a vault field and a purpose**, added then.

⚠️ **AND `searchable` NAMES FIELDS, NEVER `true`.** `product.name`,
`product.description` and the OCR'd `product.label_text` leave this database to
be chunked and embedded, and a chunk cannot be un-said. §4.2's *"the blue stuff
we use for the moulds"* is that one line and no retrieval code — the index, the
re-index on edit, the removal on delete, the removal on erasure and the
`product.search` operation all derive from it.

### 10.4 Access — the six roles are two offices and four app roles

The plan's §7.2 table cannot be declared as written, and the engine is right.
**D15: one membership, two authorities.**

| §7.2 says | Actually is | Where it is declared |
|---|---|---|
| Owner | platform `owner` | the platform's. An app naming `member:*`, `tenant:*` or `billing:*` **does not boot** |
| Manager | platform `manager` | same |
| Keeper | app role `keeper` | `access.roles` |
| User | app role `user` | `access.roles` — the common one, and `founding` is **not** this |
| Approver | app role `approver` | `access.roles`; sign-off is orthogonal, so it is its own role and its own key |
| Viewer | app role `viewer` | `access.roles` |

Keys: `product:read` `product:write` `stock:read` `stock:adjust` `count:run`
`count:close` `process:run` `process:release` `job:read` `job:write`
`ledger:read` `catalogue:import`.

⚠️ **`stock:adjust` AND `process:release` ARE SEPARATE KEYS BECAUSE DOING AND
SIGNING OFF ARE DIFFERENT GRANTS** — Tessa's sharpest split, and here it is
enforced by the resolver rather than by a handler. `unholdable` warns about a
key no role holds, which is the check that catches `process:release` being
declared and reachable by nobody.

⚠️ **SEATS COUNT PLATFORM STAFF, NOT APP ROLES.** `seats: { counts: ["owner",
"manager", "staff"], entitlement: "seats" }` — a person is on the team or they
are not, however many products the team uses. Charging per keeper would be a
second answer to how many people a workspace has.

**Location scoping is the one thing in this plan the engine cannot express, and
it is a stage.** `Scope` is `tenant | subject | global`; a ward manager is none
of the three. The shape is already in the tree, one axis over — `subject` scope
names a column and the platform composes the `WHERE` from who is asking, so a
person's records are theirs by construction rather than by a handler remembering
a filter. The proposal is the same seam:

```ts
within?: { readonly column: string; readonly tree: string }
```

The platform composes `column IN (descendants of the caller's granted nodes)`
from location grants on the membership (D16's `{ key, app?, until?, source }`
already carries `at:<locationId>`), and **no grants means the whole workspace**,
which is the common case and must stay the default. Written per handler this is
the failure mode D12 exists for: a wrong filter returns MORE rows, silently.

### 10.5 Profiles are the first real consumer of a planned stage

§1.2's rule — *"the profile changes what is SHOWN, never what is POSSIBLE"* — is
the same sentence as **engine stage 24, "a workspace composes its own roles out
of one app's keys"**, which is declared in `kernel/src/access.ts` and reached by
nothing (ENGINE.md §12).

A screen is hidden by exactly three things: a permission, a flag, or the
workspace kind. Of those:

- **A flag is wrong.** A flag is temporary by construction — `retire` is
  required while it is being tried, because a permanent branch is one nobody
  dares delete. "This basement does not do sterilisation" is not temporary.
- **An entitlement is wrong.** An unset flag says "no such thing"; an
  entitlement says "pay us". Telling a garage to upgrade for a process rail it
  will never want is selling somebody something that does not help them.
- **A permission is right**, and it is already filtered by `reachable`.

> **A profile seeds the workspace's composed roles.** Home & garage composes a
> `keeper` without `process:*` or `job:*`, so those screens are not reachable —
> for anybody, including the owner. Growing into a business means adding the
> keys, which is a screen the workspace already has, and nothing is migrated.

⚠️ **UNTIL STAGE 24 SHIPS, A PROFILE SEEDS SETTINGS AND VOCABULARY ONLY AND
EVERY SCREEN IS VISIBLE.** That degrades correctly and is worth saying out loud,
because the alternative — a `profile` check written into each screen — is a
cross-cutting concern at a call site, which is the thing the framework is a
catalogue of.

Everything else a profile carries IS a setting today, and settings draw their
own screens: `inventory.profile` (tenant enum), `inventory.default_tracking`,
`inventory.job_word`, `inventory.label_template`, `inventory.count_blind`,
`inventory.expiry_warn_days`, `inventory.reorder_lead_days`. Areas:
**Stock · Counting · Labels · Alerts**.

### 10.6 What it sells, and the build turns red until every plan prices it

```ts
entitlements: {
  products:  { label: "Products",  withheld: "quota" },
  locations: { label: "Locations", withheld: "quota" },
  processes: { label: "Processes", withheld: "gate"  },
  jobs:      { label: "Jobs",      withheld: "gate"  },
  imports:   { label: "Import",    withheld: "gate"  },
}
```

Four rules, each a build failure rather than a review comment: `withheld` names
the mechanism; every live key is named by a gate or counted by a collection;
**every live key is priced by every tier**; `reserved: true` is the one written
exemption.

⚠️ **SO ADDING OneInventory TO `engine/one/src/index.ts` IS A RED BUILD UNTIL
`PLANS` NAMES A NUMBER FOR ALL FIVE, ON EVERY TIER.** That is the feature. A key
no plan mentions resolves to `false` for everybody — built, gated, sold to
nobody, silently — and the catalogue discovering itself is what makes that
unreachable.

⚠️ **AND STORAGE IS NOT ON THAT LIST, DELIBERATELY.** Product photos accumulate
as a side effect of ordinary work, and refusing an upload because a colleague
filled the bucket punishes the wrong person at the worst moment. `storage` is a
platform key and a METER: the plan's amount is where the meter starts, the daily
sweep prices the excess against the wallet, and **nothing is ever deleted to
settle a bill** — an unpayable debt costs the writes, never the files.

### 10.7 AI — ten capabilities, and none of them names a model

Every one of §6.1's ten is `ai: { lane, prompt, variables, maxOutput,
brandable? }` on an operation (D19). The model is the operator's binding from
that lane's enabled catalogue; the lane's own election answers when nobody has
bound one.

| Capability | lane | brandable | commits |
|---|---|---|---|
| Barcode → prefilled product | `vision` | no | name, brand, category **auto** |
| Label photo → product record | `vision` | no | as above; hazards **suggest, source cited** |
| Delivery note → receive lines | `vision` | no | **confirm every line** |
| Ask it in words | `text` | yes | nothing — it answers |
| Voice capture | `listen` | no | **confirm the quantity** |
| Datasheet fetch | `text` | no | storage & handling **suggest** |
| Reorder advisor | `text` | yes | nothing — it proposes |
| Anomaly watch | `text` | yes | nothing — it reports |
| Count from a photo | `vision` | no | **suggestion only** |
| Shelf recognition | `vision` | no | *what changed*, never *your count* |

`lanes: ["text", "vision", "listen"]`. `meters` names each with its ceiling.

⚠️ **§6.2'S RULE IS THE SETTLE CAP RESTATED, AND BOTH DIRECTIONS MATTER.** *AI
may fill anything, and commit nothing that carries consequence* is the product
half. The money half is that **a reserve is a ceiling on revenue** — settlement
charges `min(held, actual)`, so every token an estimate fails to anticipate is a
token the platform pays for. `maxOutput` on each meter is what makes the reserve
real; a generating action with no ceiling is refused at composition.

⚠️ **AND A WORKSPACE PICKS ITS OWN MODEL, BECAUSE IT PAYS FOR IT** (D25) — cheap
and fast for a stocktake, slow and clever for a datasheet. A workspace may
reword a `brandable` action and only by ADDING to our instructions, never
replacing them (D26): "Ask it in words" is a voice; "read this GHS pictogram" is
not.

⚠️ **THE VOICE LANE IS THE ONE WITH A COST SHAPE OF ITS OWN.** §7.1 rule 6 puts
voice where hands are full, which is exactly where people talk for a long time.
The reserve is computed from the audio's duration, not from a character count,
and the true-up corrects it downward against the gateway's own bill.

### 10.8 The twelve notifications, and the two that must interrupt

Each is a `NotificationDef`: `category · author · tone · icon · needs · on ·
link · variables · channels`. The audience is a PERMISSION, never a role name.

| | category | channels | why |
|---|---|---|---|
| expiring soon · low stock · reorder suggested | `activity` | inbox, email | worth knowing, not worth a phone lighting up |
| expired · out of stock · count discrepancy · unusual usage · item overdue back | `activity` | inbox, email, push | |
| **release pending** · **recall issued** | `action` | inbox, email, push | **may not be silenced** — `refusePolicy` refuses a preference that leaves an `action` with no interrupting channel |
| process failed · service due | `activity` | inbox, email, push | |
| the daily expiry digest | `digest` | email | needs **stage 23** — see 10.11 |

⚠️ **EVERY `link` MUST RESOLVE TO A DECLARED SCREEN'S ROUTE.** Four of Scena's
pointed at `/screens`, which was not a route, and the test asserting it was
pinning the bug — it passed for as long as nothing rendered a notification.

⚠️ **AND §7.3'S "FILTERED BY LOCATION" IS THE SAME GAP AS 10.4.** The audience
test is a permission; narrowing it to a ward is the `within` work. Until then
the ward manager is told about the kitchen, which is a nuisance rather than a
disclosure — the notification names a location they can already read.

### 10.9 The screens — five destinations, and where everything else lives

**D10: five primary, maximum.** Depth happens inside a destination.

| # | Screen | `shape` | `sky` | Notes |
|---|---|---|---|---|
| 1 | **Scan** | `decision` | `glow` | the home screen (§7.1 rule 1). Point at anything; it says what it is and what you can do |
| 2 | **Stock** | `list` | — | products and locations, one finder, `Listing.find` decides when it appears |
| 3 | **Counts** | `list` | — | sessions, coverage, differences |
| 4 | **Work** | `list` | — | processes and jobs. Not reachable under a Home profile |
| 5 | **Reports** | `figure` | `etch` | ruled geometry, which is what AMBIENCE.md points at monitoring |

Secondary and `nav: "none"`: a product, a location, a batch, a unit, a set, a
count session, a process, a job, receive, the label sheet, getting started.

⚠️ **AND OneInventory DECLARES NO PEOPLE SCREEN, NO BILLING SCREEN, NO BRAND
SCREEN AND NO SETTINGS SCREEN.** All four are the WORKSPACE's, in the centre and
OneSpace (D17, D22). A product declaring a brand editor is how a business with
three products gets three of them — and the reference app made exactly that
mistake within a day of the decision being written.

**What OneDesign already draws**, so nothing here is built twice:

| Need | Component |
|---|---|
| every list | `Listing` · `Col` · `Paged` · `SeeAll` |
| every row | `NavRow` `ActionRow` `AmountRow` `ToggleRow` `FieldRow` `ControlRow` `PersonRow` `NoteRow` |
| every card | `Group` — and never a card inside a card |
| every declared field | `Field` picks the control from the kind. Fourteen kinds, all covered |
| changing a value outside a form | `Edit`'s sheet — a row shows the value and a pencil |
| the receive flow, the count session | `Steps` · `Step` · `StepRow` |
| the ledger | `Timeline` · `Moment` |
| the location trail | `Crumbs` |
| par level, coverage | `Meter` · `Ring` · `Gauge` · `CompositionBar` |
| consumption, shrinkage | `LineChart` `ColumnChart` `StackedChart` `HeatmapChart` + `ChartPanel` |
| the one number a screen is about | `Hero` · `Stat` · `Tally` |
| a photo | `PickFile` |
| typing a code | `CodeEntry` · `SearchInput` · `Lookup` |
| dates | `DateInput` · `Dates` · `PeriodInput` |
| the two-step | `Confirm` (a sheet, `role="alertdialog"`) |
| four outcomes + refused | `Await` `Loaded` `Nothing` `Trouble` `Working` |
| onboarding, help | `Guide` · `Milestones` · `Help` |
| a location as a place | `Place`, which may wear a world |

**What has to be added, and the whole list is three:**

1. **`Viewfinder`** — a live camera surface that hands back a decoded string and
   owns the torch. Nothing in the package touches a camera, and every scanning
   path in this product needs it. Product-vocabulary-free by construction: it
   returns a string and knows nothing about stock.
2. **`Tree`** — a navigable nested hierarchy. `Crumbs` is the trail, not the
   tree. Locations drive it; categories and folders are the general case.
3. **`Printable`** — a millimetre-sized sheet that renders to a print
   stylesheet. The weakest of the three; argue it at the time rather than now.

⚠️ **A LARGE QUANTITY CONTROL IS NOT ON THAT LIST UNTIL IT IS MEASURED.**
HeroUI's `NumberField` ships steppers and `NumberInput` wraps it; D7 forbids
restyling it. Measure it at tap scale first — the answer may be that nothing is
missing.

⚠️ **AND ADDING TO OneDesign MEANS ADDING AN INSTANCE TO `hello`.**
`scripts/showcase.test.mjs` refuses a component nothing draws, and the excuse
list can only shrink. A `Viewfinder` in hello is a note carrying a scanned
reference — which is the kind of thing that has to be arranged, not waived.

### 10.10 What it costs, and the two numbers to watch

Nothing in this design bills by time or by connection. **No Durable Object, no
polling, one cron.** Against Cloudflare's included allowances, a thousand active
people is $5/month and the first ceiling is REQUESTS, not the database.

⚠️ **THE ONE NUMBER THIS PRODUCT ACTUALLY MOVES IS ROWS WRITTEN — $1.00 per
million, a thousand times the price of a read.** Every write already records an
audit row; the ledger adds a second. A 5,000-line stocktake is ~10,000 rows
written, against 50 million included: two hundred full stocktakes a day, free.
The arithmetic is worth having because the instinct — *"an append-only ledger
will be expensive"* — is wrong by three orders of magnitude.

⚠️ **AND THE COUNTING PATH IS WHERE `runaway.test.mjs` WILL BITE.** A count
session commits in batches; a per-line query in a loop is the shape the guard
refuses, and it is correct in isolation and a fault at five thousand lines.
The same guard refuses the poll a "live count" screen would reach for.

### 10.11 What the engine owes this app, honestly

Five things, each named rather than assumed.

| | State | Consequence if it does not land |
|---|---|---|
| **`offline`** | ⚠️ **declared in `kernel/src/collection.ts`, set by `hello`, and read by NOTHING.** Measured: `grep -rln offline --include=*.ts --include=*.tsx engine/` returns two files, both declarations | §7.1 rule 5 fails. The back of an old factory has no signal and that is exactly where the stock is. **This is the one that blocks a real customer** |
| **`within`** — location narrowing | does not exist. 10.4 has the shape | multi-site is one workspace seeing everything. A nuisance at four sites, unusable at forty |
| **Stage 24** — composed roles | planned, reached by nothing | profiles seed settings only and every screen is visible. Degrades correctly |
| **Stage 23** — mail | planned | no expiry digest, no reorder email. The inbox and push still work |
| **Stage 42** — the gate asked before a control is drawn | planned | a control is drawn and then refuses. Ugly, not wrong |

⚠️ **THE FIRST ROW IS THE FINDING, AND IT IS EXACTLY THE CLASS BUILDING.md §2 IS
ABOUT.** `offline: "queue"` is a declaration that compiles, is set by the
reference app, is documented as a capability — and no code reads it. It is not
in ENGINE.md §12's list because it carries no `DEFER` marker, which means the
capability guard has nothing to find. **Adding the marker and the stage is the
first commit of this build**, before any OneInventory file exists, because a
declaration that reaches no surface is the failure this framework exists to
prevent and this one has been sitting in the reference app.

### 10.12 The guards this app adds

BUILDING.md §6: write the rule as a `refuse*` returning what is wrong, call it
from a lane a request goes through, give it an instance, register it with the
decision it protects and the consequence in the world, **and mutation-test it —
break the thing, watch it fire, restore.**

| Guard | Fails when |
|---|---|
| `ledger-chokepoint` | a `ledger` or `stock` write anywhere but the one function. A row written past it is a balance nothing can rebuild and an audit nobody can trust |
| `local-day` | an expiry computed from a UTC slice. West of Greenwich that expires stock a day late — Tessa's known, never-closed bug. **`present` already refuses `at.slice(0, 10)`; this extends it to shelf-life arithmetic** |
| `ai-commits` | a generating operation whose output writes an expiry, a quantity, a batch code, a hazard class or a release without a confirm step |
| `release-ladder` | a `process` transition from quarantined to ready. A quarantine may always be lifted, and never into "good to go" |
| `code-book` | a published catalogue row carrying a tenant id, a quantity, a location, a price or a supplier |
| `tracking-demotion` | a demotion path that does not ask twice. Demotion loses history |

⚠️ **A GUARD THAT WALKS A DIRECTORY MUST REPORT WHAT IT WALKED.** "No violations
found" and "nothing was looked at" are the same sentence without a number.

⚠️ **AND THE DECISIONS SPLIT.** `within`, the code book and the offline lane
change the ENGINE, so they are D44+ in `engine/docs/DECISIONS.md`, append-only,
each stating what it forbids. Everything else in this document is
OneInventory's, and lives here.

### 10.13 The order it is built in

Every stage ships something reachable. Nothing is declared without a surface —
that is the rule, and it is why there is no "wire it up later" stage.

| # | Stage | Ships |
|---|---|---|
| 0 | **The offline lane** | 10.11's first row. A marker, a stage, a runtime that honours `offline: "queue"`, an instance in `hello` |
| 1 | **The manifest** | id, mark, access, entitlements, five settings. It composes, it boots, `PLANS` prices every key. Nothing to do in it yet — and a roster, an inbox, a brand and a bill already work |
| 2 | **`product` · `location` · `stock` · `ledger`** | the four collections and the chokepoint. Stock exists, moves, and is auditable. **Twenty free operations arrive with them** |
| 3 | **The Stock screen and the tree** | `Tree` lands in OneDesign; a location is a `Place`; search finds a thing and says where it is |
| 4 | **`Viewfinder` and the resolution rule** | scan → product + pack + whatever the carrier carried. Unknown codes are learned. **This is the stage the product becomes itself** |
| 5 | **`batch` and the expiry clocks** | the three composing clocks, reporting which won, in local days |
| 6 | **Receive** | scan, quantity, done. `Steps`, capture provenance, undo |
| 7 | **The count session** | shelf-scoped, blind or informed, coverage, close-with-adjustment |
| 8 | **`unit` and `set`** | itemised objects, issue and return, service due |
| 9 | **The AI lane** | the four that pay for themselves first: barcode, label photo, delivery note, ask-in-words |
| 10 | **`process` and `job`** | the release rail and the consuming context, behind their entitlements |
| 11 | **Labels** | `Printable`, the templates, the GHS decant label |
| 12 | **Reports** | consumption, shrinkage, the recorded-vs-inferred number, reorder |
| 13 | **Profiles** | stage 24 lands; profiles compose roles; the basement stops seeing a Processes tab |
| 14 | **Import and suppliers** | nobody types in 800 products |

⚠️ **STAGES 2 AND 4 ARE THE TWO THAT MATTER.** Everything before 2 is a
declaration; everything after 4 is a surface over a model that already works.
If the schedule slips, it slips after 4 — not before it.

### 10.14 The six-minute checklist, every commit

1. `pnpm engine:typecheck`
2. `pnpm engine:test`
3. `pnpm engine:gate`
4. New behaviour has a guard, and the guard names its decision and its stage.
5. New engine decisions are in `DECISIONS.md` with what they forbid.
6. Anything unfinished carries a `DEFER(engine-N)` marker — never a sentence.
7. If the engine's surface changed: `EMIT=1 pnpm --filter @engine/hello test`,
   then `node engine/scripts/docs.test.mjs --write`.

---

*Tessa's record is [TESSA-AS-BUILT.md](TESSA-AS-BUILT.md). Part X's §10.3, §10.4
and §10.12 are where each of its eleven tables, its three enforced rules and its
one never-closed bug land here. It stays as the account of what happened, and is
not a second answer to anything above — the code it describes is in `git log`.*
