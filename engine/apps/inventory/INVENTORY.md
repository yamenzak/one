<!-- kind: product -->

# OneInventory — everything, counted

**Everything OneInventory is lives here.** Part I is what it is and why it is
shaped that way. Part II is how it is built. **Part III is the screen index** —
every surface, per route, mapped to `file:line`.

⚠️ **Looking for the file that draws a screen? Part III.** Grepping for a
screen's name usually fails: a screen is a pure component in `src/screens/` and a
container in `live.tsx`, and most sub-surfaces live inside their parent's file.
**Update Part III in the same commit as any screen you add or move.**

It is the second app on **OneEngine** and the first one built on it rather than
migrated onto it. The framework is
[engine/docs/ENGINE.md](../../docs/ENGINE.md); why it is shaped that way is
[engine/docs/BUILDING.md](../../docs/BUILDING.md); the design language is
[engine/design/DESIGN.md](../../design/DESIGN.md).

---

## Part I — the product

### What it is

An inventory for **everything**: the boxes in a basement, a clinic's stock room,
a hospital's ward stock and theatre trays, a workshop's consumables, a kitchen's
walk-in, a laboratory's reagents, a warehouse's bins.

⚠️ **THE SETTING IS A PROFILE, NOT A PREMISE.** Its predecessor was a clinic
product, and a clinic product cannot become a workshop product without a rewrite.
Here the model is one model and the setting chooses two things and only two: what
a new product starts as, and **the words** — a ward is not a shelf, a pallet is
not a delivery. Nothing is migrated when a garage grows into a business, because
a profile was never a code path. `src/words.ts`.

### The one number, and the one that makes the product look bad

Everything here exists to answer **what is where, and how many** — and then to be
honest about how much of that anybody actually wrote down. The reports screen
leads with the **recorded share**: of everything that left the shelves, how much
was scanned out and how much a count later found gone. It is the figure an
inventory product is never willing to show, and it is the only one that says
whether the others mean anything.

### Five ways to track a thing

The ladder is a property of the product, and it goes up only:

| | What it is | What the shelf holds |
|---|---|---|
| `listed` | a thing you never count | nothing — it is a catalogue entry |
| `counted` | a number | one balance per place |
| `batched` | deliveries kept apart | one balance per place **per lot** |
| `itemised` | one row per object, labelled at arrival | the objects themselves |
| `assembled` | a kit made of itemised things | the kit, and what is in it |

⚠️ **THE MOMENT IDENTITY IS CREATED IS THE MOMENT IT ARRIVES, and there is no
second chance at it.** A workspace that received forty drills as a *number* and
wants them itemised afterwards has forty objects with no history and no way to
tell them apart.

### Four clocks, and the earliest one wins

A delivery expires on the date **printed** on it; on the day it was **made** plus
how long the product keeps; on the day it was **opened** plus the same; or on the
day it was **processed** plus that shelf life — whichever comes first. A box with
a 2029 date that somebody opened last month is out next week, and the screen says
*which clock decided*, because "expires Tuesday" with no reason is a shelf nobody
trusts.

⚠️ **THE DATE IS THE DELIVERY'S AND THE DURATION IS THE PRODUCT'S**, and that
split is what makes the `made` clock work at all. "MFD 2026-03-14" on a box with
"24 months from manufacture" on the back is a complete shelf life — and it is how
most of the world outside EU retail labels a product, so a delivery that arrived
with only a manufacture date had no expiry at all and the nightly sweep never saw
it. `batch.made` carries the date; `product.shelfDays` carries the duration. A
sheet that asked for an expiry DATE against a catalogue row would put one
delivery's date on every future one.

An itemised object has a second clock of its own: its **service**. It is a
different working day from an expiry, which is why the two never share a list.

### Four verbs, not one with a parameter

`receive`, `take`, `adjust`, `undo`. Collapsed into `change(delta)` they become
indistinguishable in the history, and a shrinkage report over that history is a
list of numbers nobody can explain.

⚠️ **TAKING AND CORRECTING ARE DIFFERENT GRANTS, AND IT IS THE PRODUCT'S
SHARPEST ACCESS RULE.** Somebody on the floor takes things all day and must never
be able to make a number agree with what they took — that is the difference
between an inventory that can be audited and one that reports whatever the last
person said. `stock:move` against `stock:adjust`.

### One chokepoint

Every balance change in the product goes through `stockMove` — the balance and
the ledger row are written in one act, so the history is the whole story rather
than most of it. `refuseMove` is what makes a take that is short a **refusal**
rather than a landing on zero: a shelf that quietly agrees with whoever took the
last of it has destroyed the discrepancy that would have found the problem.

### The count session

A count is a job somebody spends an afternoon on, so it is a destination rather
than a mode. It is **scoped to a place** and driven by **what the camera read** —
a shelf's own label moves the session, a product's label tallies it, one of our
own object labels can be counted exactly once. Closing it is the only act that
writes corrections, and it needs `stock:adjust`.

⚠️ **THE CORRECTION IS ATTRIBUTED TO THE COUNT.** Written as an ordinary
adjustment it is indistinguishable from somebody fixing a typo, and the recorded
share reads a hundred per cent for ever — in the flattering direction, with every
test green.

### The release rail

A run is loaded, ends, and is then **released by somebody qualified to say its
output may be used**. The gap between the machine finishing and a person signing
for it is what this product has instead of deciding that a green light is a
qualification.

⚠️ **WHAT IS IN A RUN IS HELD.** Loading holds it; releasing stamps it; failing
or recalling freezes it with a reason; lifting unfreezes one item deliberately.
Receiving more of a held lot stays possible — a quarantine is about what may
*leave*. Running a process and releasing what it produced are different grants,
for the same reason taking and correcting are.

### Labels

A shelf has no manufacturer, so its code is always ours. A product usually has
one printed on it, and where it does not, we print one. **Minted when it is
printed**, never when the row is created: a code on a shelf nothing is stuck to
is a code that resolves to a place nobody can find. And **never re-issued** — our
label is the identity of a physical object for the rest of that object's life.

A product's label goes into the **code book** with every other code that names
it, not into a column of its own; a column would be a code the camera resolves to
nothing.

The sheet prints at real millimetres and the browser's own print dialogue is the
last step, because which printer, which roll and how many copies are questions
the operating system already asks better than a form could.
`engine/design/src/parts/qr.ts` is the encoder — ISO/IEC 18004, byte mode, level
M, versions 1–10, written rather than depended on.

### The import

⚠️ **NOBODY TYPES IN EIGHT HUNDRED PRODUCTS.** Every real customer arrives
holding a spreadsheet, and a product whose first instruction is "now enter your
catalogue" is one that is evaluated for an afternoon and abandoned.

Quotes are parsed rather than stripped, the separator is read off the heading,
and a number is read last-separator-wins so a European decimal is not a thousands
separator. The column mapping is **guessed and then shown, editable** — a guess
that puts the supplier's name in the product name for eight hundred rows is
indistinguishable from a successful import until somebody goes looking, months
later. Every refused row comes back with **its line number and its reason**, and
those survive onto the success screen.

**The preview and the commit are the same function.** `product.preview` and
`product.import` both call `planImport`; `one-planner.test.mjs` makes a second
implementation of "what will happen" a test failure.

### Suppliers

The last step of the reorder report's own workflow: it can say what to buy and
how long the shelf lasts, and without this it cannot say **who to ring**. A
supplier's own lead time beats the workspace's, which is the slowest supplier a
place has — applying that to a next-day consumable orders a month of stock every
time one dips.

**No prices.** What a workspace pays is a commercial relationship this product
has no business holding.

### The AI lane — the four that pay for themselves

`product.identify` (a barcode nobody has named), `product.read` (a label
photographed, including its GHS pictograms — a fact about a substance no
catalogue lookup will tell you and nobody types in), `stock.note` (a delivery
note read into lines) and `stock.ask` (a question in words). All four **suggest
and never commit**: a wrong hazard class on a printed label is a legal document
that is wrong, and the person who printed it answers for it.

### The night

`inventory.expiry` sweeps every workspace and tells somebody what **crossed a
line** overnight — never what the list currently is, because a sweep that
announced the state would announce the same twelve boxes every morning until they
expired, and the third morning is when somebody switches notifications off for
good. One note per pass, not one per box.

### What a workspace may do, and who may do it

Eleven permissions, three declared roles (`keeper`, `user`, `viewer`) and **six
presets** a workspace adopts and then owns: `alone`, `floor`, `goods-in`,
`auditor`, `operator`, `signs-off`. A preset is an offer; the ceiling is the
person pressing the button (`refuseRole`'s `beyond_you`).

Five entitlements: `products` and `locations` are counted; `processes`, `jobs`
and `imports` are gates.

**And a person can be narrowed to part of the workspace** (engine 55, D45). A
membership names the locations somebody works in; a grant to a site covers every
aisle, rack and bin under it, including ones added later. `null` — which is every
membership until somebody is narrowed — is the whole workspace, so a business
with one site never meets the concept. Five collections say where their records
are (`stock`, `ledger`, `unit`, `kit`, `count`, plus `location` by its own id),
and `reach.test.mjs` fails on any statement over one of them that neither carries
the filter nor states why it is wide.

**And a gate reaches the nav, not only the operation.** Four screens name the
capabilities they are for — `/work` (runs *or* work orders), `/run`, `/case`,
`/import` — and one the plan does not include never leaves the server, so it has
no nav row, no route and no way in by typing. Runs open at Plus, work orders and
the import at Solo, so a garage gets four primary destinations and a clinic gets
five.

---

## Part II — how it is built

### Layout

```
engine/apps/inventory/
  src/index.ts        THE MANIFEST — collections, operations, screens, settings,
                      access, entitlements, notifications, the job. ~5,000 lines,
                      and it is the whole server half.
  src/words.ts        what this workspace calls things (eight profiles)
  src/code.ts         reading a scan: GS1, GTIN, our own labels, lots, expiry
  src/count.ts        settling a count — pure
  src/hazard.ts       GHS: nine pictograms, signal words, contradictions
  src/items.ts        an itemised object's life — pure
  src/ledger.ts       the expiry arithmetic, both clocks — pure
  src/reading.ts      what a model said, narrowed — pure
  src/release.ts      the release ladder's state machine — pure
  src/report.ts       recorded share, usage, losses, reorder, per-day — pure
  src/sheet.ts        the import: reading, mapping, planning — pure
  src/screens/*.tsx   one file per screen, each a function of its props
  src/screens/index.tsx   THE GROUND — every screen over a sample world
  src/screens/live.tsx    the containers that fetch and hand props over
```

⚠️ **THE GROUND AND THE LIVE HALF ARE SEPARATE FILES, AND THAT IS THE POINT.**
`index.tsx` renders every screen with no session, no worker and no database —
which is how anybody looks at the interface at all. An inventory is the hardest
product in this repository to photograph any other way: the interesting states
are a line that ran out, one nobody has touched since spring, and a shelf
somebody labelled and never filled.

### Fifteen collections

`product` · `supplier` · `code` · `location` · `batch` · `unit` · `kit` ·
`process` · `process-item` · `job` · `count` · `tally` · `stock` · `ledger`

Erasure is derived from what each one declares; nothing here carries a
hand-written cascade.

### Sixty operations

Grouped by what they are about: the shelf (`stock.*`), the code book (`code.*`),
deliveries (`batch.*`), objects (`unit.*`), kits (`kit.*`), counting
(`count.*`), the rail (`process.*`), jobs (`job.*`), the catalogue
(`product.*`), and the report.

### Six settings

`inventory.profile`, `inventory.default_tracking`, `inventory.default_unit`,
`inventory.warn_days`, `inventory.service_days`, `inventory.lead_days` — all
tenant-level, all in the `stock` area, all read by a handler or a screen (which
the `settings` guard enforces).

### Tests

| Where | What it holds |
|---|---|
| `apps/inventory/test/*.test.ts` | the pure halves — 193 tests over ten files |
| `apps/inventory/test/ground.screens.test.tsx` | every declared screen renders, and says the true thing — 97 |
| `apps/inventory/test/geometry.seen.test.tsx` | every declared screen MEASURED, in real Chromium, in the frame, at a phone and a desk — 56 |
| `apps/inventory/test/acts.screens.test.tsx` | every primary action names the operation it calls, and it is real — 31 |
| `apps/inventory/test/hazard.seen.test.tsx` | every hazard name, whole and inside its diamond, measured in a browser — 3 |

⚠️ **AND A DATE ON A SCREEN IS THE READER'S, NOT THE RECORD'S.** `ground.screens`
fails on any screen that renders a stored `2026-08-19` — five did, and on the run
screen the two formats were in ADJACENT rows of one card. The printed label is
the one exemption and it is the opposite rule: a decant sticker may be read in
another country by somebody who reads dates the other way round, so ISO is right
there and only there.
| `one/test/inventory.test.ts` | the golden path through the **real worker** — 16 |
| `one/test/inventory-deep.test.ts` | batches, items, kits, the rail, the night — 19 |

**And a photograph of every screen, which is NOT part of `test`:**
`pnpm --filter @engine/inventory shots` writes `shots-out/<look>/<screen>.png` —
nineteen screens at a phone and a desk, in light and in dark, from the same
ground data the suites use. It takes minutes and answers no question with a pass
or a fail, so it runs when images are wanted rather than on every push; what it
asserts is only that each file exists and is not blank.

⚠️ **BOTH THE SWEEP AND THE SHOTS MOUNT THE PRODUCT RATHER THAN RENDERING IT TO
A STRING.** A sub-page hands its name, its way back and its actions UP to the
shell's crown from a layout effect, and a static render runs no effects — so the
six screens somebody navigates INTO were measured and photographed with nothing
at all saying where they were. `shots/mount.tsx` is the entry both bundle.

⚠️ **AND THE GEOMETRY SWEEP IS THE ONE NOTHING ELSE COULD REPLACE.** Every other
guard in this repository reads SOURCE — which class was written, which component
was composed — and a screen that pushes a phone sideways or a button too small to
hit are computed values, produced between a stylesheet, a flex container and four
components that each did something defensible. It found that `ROW.tap` calls 44px
non-negotiable while every button in the library shipped 40.

⚠️ **THE TWO INTEGRATION SUITES ARE THE ONES THAT FOUND THINGS.** Fifty
operations were composed, typechecked, guarded and green without one of them ever
having been executed against a database; the first suite found seven defects and
the second found the one that mattered most. A declaration is not a behaviour,
and only a request can tell them apart.

### Guards it is behind

`one-planner` (the preview is the commit), `label-once` (a code is minted once),
`inferred-consumption` (a count's correction is recognised as consumption),
`job-tells` (a job that says it tells people tells people), `input-checked` (an
operation's declared input is enforced at the door), `reach` (a collection that
says where its records are is narrowed by every statement, not only by the
generated ones) — plus every platform guard in `pnpm engine:gate`.

---

## Part III — the screen index

**Twenty screens.** Each is a pure component in `src/screens/`, mounted by a
container in `src/screens/live.tsx`, and rendered over a sample world by
`src/screens/index.tsx`.

| Route | Name | Nav | Needs | Component | Container |
|---|---|---|---|---|---|
| `/` | Home | primary | `stock:read` | `screens/Home.tsx:132` | `screens/live.tsx:1944` |
| `/stock` | Stock | primary | `stock:read` | `screens/Stock.tsx:92` | `screens/live.tsx:424` |
| `/scan` | Scan | primary | `product:read` | `screens/Scan.tsx:127` | `screens/live.tsx:674` |
| `/receive` | Receive | primary | `stock:move` | `screens/Receive.tsx:101` | `screens/live.tsx:795` |
| `/count` | Count | primary | `stock:move` | `screens/Count.tsx:80` | `screens/live.tsx:948` |
| `/work` | Work | primary | `process:read` | `screens/Work.tsx:65` | `screens/live.tsx:1355` |
| `/thing` | A product | none | `product:read` | `screens/Thing.tsx:130` | `screens/live.tsx:478` |
| `/where` | A location | none | `location:read` | `screens/Where.tsx:34` | `screens/live.tsx:625` |
| `/item` | An item | none | `stock:read` | `screens/Item.tsx:84` | `screens/live.tsx:1105` |
| `/kit` | A kit | none | `stock:read` | `screens/Kit.tsx:66` | `screens/live.tsx:1212` |
| `/run` | A run | none | `process:read` | `screens/Run.tsx:73` | `screens/live.tsx:1412` |
| `/case` | A job | none | `process:read` | `screens/Case.tsx:58` | `screens/live.tsx:1495` |
| `/due` | Running out | secondary | `stock:read` | `screens/Due.tsx:80` | `screens/live.tsx:1555` |
| `/labels` | Labels | secondary | `location:read` | `screens/Labels.tsx:248` | `screens/live.tsx:1662` |
| `/reports` | Reports | none | `ledger:read` | `screens/Reports.tsx:84` | `screens/live.tsx:1623` |
| `/ask` | Ask | secondary | `stock:read` | `screens/Ask.tsx:54` | `screens/live.tsx:1302` |
| `/import` | Import | secondary | `product:write` | `screens/Import.tsx:131` | `screens/live.tsx:1789` |
| `/suppliers` | Suppliers | secondary | `product:write` | `screens/Suppliers.tsx:77` | `screens/live.tsx:1860` |
| `/register` | Add a product | none | `product:write` | `screens/Register.tsx:230` | `screens/live.tsx:2049` |
| `/start` | Getting started | secondary | `product:read` | `screens/Start.tsx:67` | `screens/live.tsx:1944` |

### The surfaces that are not routes

| Where | What | File |
|---|---|---|
| `/register` | the six photographs, and what a model read off them | `screens/Register.tsx` — `Photos`, `What it is` |
| `/suppliers` | the supplier editor (a tray) | `screens/Suppliers.tsx` — `SupplierTray` |
| `/labels` | the printable sheet and the four templates | `screens/Labels.tsx` — `Template`, `TEMPLATES` |
| `/labels` | the decant label's hazard diamonds | `screens/Labels.tsx` — `Diamond` |
| `/import` | the column mapping | `screens/Import.tsx` — `MAPPABLE` |
| `/count` | what closing would change | `screens/Count.tsx` |
| `/scan` | the viewfinder and what a model suggested | `screens/Scan.tsx` |
| `/thing` | deliveries, movements and pieces | `screens/Thing.tsx` |

### The grounds

`src/screens/index.tsx` chooses the state each screen is photographed in, and the
choices are deliberate: a month at **sixty-one per cent recorded** rather than a
hundred, a preview with a **refused row that is not last**, a decant label with a
**real classification** on it, and a due list with **one gone, one going and one
that is out because it was opened**.

### Five nav slots, and the fifth is the one a basement never opens

**Home, Stock, Scan, Count, Work.** The root answers "is everything all right" —
what is on the shelf, what is running out, what count is half done, what run is
waiting — and everything under it is one tap away with its own name on it. Stock
was the root for as long as this product had four screens, which made the first
thing anybody saw a page of rows they had to read to find out whether there was
anything to do.

**The three numbers in its hero are one request** — `totals.read`, which every
app on the engine gets the moment it declares a collection. They were three list
reads asked for one row each, because a list was the only thing on offer that
knew a total: three round trips, each carrying identity, workspace, membership
and standing, to run three `SELECT COUNT(*)`. A collection the reader may not
open is left out of the answer rather than counted as nought, so a role built by
hand without `product:read` gets the shelf figure with no caption under it.

**Reports gave up its seat to it**, because most of its figures are on Home
already, cut down to what a first screen holds: the recorded share, what left,
what was found short, and how many lines run out before a delivery lands. A bar
seat for a screen that is largely another screen's summary is the bar answering
"where am I" with two places that are the same place.

**Receiving is not a seat either, and never was** — it is Stock's own act. What
Home offers in its quick row is exactly what the bar does not: receiving,
labels, the spreadsheet and the people it is bought from. A shortcut to something
a thumb already reaches from every screen is a second answer to one question.

Runs and jobs are the regulated half of this product — a workshop tracking work
orders, a clinic releasing sterilisation loads — and nobody storing paint in a
garage. The `alone` preset holds no `process:*` key at all, so the destination is
not drawn for somebody on it, which is the difference between a screen that is
hidden and a screen that is not reachable. And the plan gates it too (engine 67):
on a tier with neither runs nor work orders the screen never leaves the server,
so the fifth slot goes back to the four a garage actually uses.

### The checklist knows whose step it is

Naming a place and building the catalogue happen once, for everybody; putting
something on a shelf is the gesture this product IS, and somebody who has not
done it has not learnt the product whatever their colleagues did last year. So
`first-count` is `who: "person"` and the other two are the workspace's — see
[DECISIONS.md](../../docs/DECISIONS.md) D54. An invited counter opening Home on
their first morning is shown their own first delivery and is not congratulated
for a year of somebody else's work.

---

## What is not built

- **The GHS pictograms are named, not drawn.** The decant label prints a named
  diamond and says so. Regulated artwork is a legal document; a hand-drawn
  approximation of one is worse than an honest gap. (Task #210.)
- **A list does not aggregate.** It narrows, pages and counts (engine 62), but
  "how much did each job use" is a group-by, and a group-by is a query language
  arriving through a door that deliberately has none. The reports compute their
  own.
