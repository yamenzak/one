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

### The ladder between a carton and a tablet

A product has exactly **one** base unit and stock is only ever counted in it. A
shelf holds 600 tablets however they arrived — as a carton, as three boxes or as
a handful — so there is nothing to break open, no partial-carton state, and no
second balance that can disagree with the first.

`product.levels` is an ordered list of **named multipliers**: the way somebody
says "two boxes" while holding two boxes, and the way a number reads back in the
words they think in. `per` is per the rung BELOW — a box holds 3 sheets, not 30
tablets — because that is what the person entering it knows; read as base units
the second rung is silently wrong by a factor of the first and renders perfectly.

⚠️ **IT IS THE ONLY PLACE A BLISTER SHEET CAN EXIST.** A sheet inside a box
carries no barcode, so it can never be a `code` — before this there was nowhere
to put it at all, and anybody issuing by the sheet typed 10 every time and hoped.
A rung needs a name and a number, not a symbol somebody can scan.

⚠️ **THE MULTIPLICATION HAPPENS EXACTLY ONCE, ON THE SERVER.** A client sends a
rung NAME and never a multiplier — a stale screen holding last week's ladder
would otherwise move a different amount than the one written on it. And a rung
the product does not declare is **refused** rather than read as one: falling back
to a single receives a carton as one tablet, a wrong number nothing downstream
can detect, because one is what a real entry looks like.

**Nesting each rung as its own product was considered and rejected.** It splits
the balance across levels so every read becomes a rollup; it multiplies `batch`,
`code`, `stock`, `ledger`, `item` and `kit` by the depth of the ladder; and it
forces a lot number printed on a box to belong either to the box (so a tablet
cannot be recalled) or to the tablet (so the box row bought nothing). Nesting is
right where a level has its own IDENTITY and lifecycle — and that is `item` and
`kit`, which already exist.

### What is set once

**A product's `unit` and its `tracking` are `settled`** — given a value when the
product is made, and refused by the generated update after that. The unit is what
every other number is counted in: edited from "box" to "sheet" it turns twenty
boxes on a shelf into twenty sheets, with no write anywhere near a quantity.

`product.recount` is the deliberate change, and it asks a different question of
each:

- **the unit** is refused once any stock **or any movement** exists. An empty
  shelf is not an uncounted product — its ledger is full of numbers in the old
  unit, and a report over that mixes the two without any row being wrong. Before
  anything is counted the change is free, which is when a typo is actually
  noticed.
- **the rung** may only go deeper — `promotes`. Forty gloves become forty gloves
  in an unrecorded batch, which is what happened; the other way discards the
  batches, their expiries and their suppliers.

The way to count the same physical thing in a second unit is a second product.
That is usually what somebody asking for this means: the sheets are a different
thing from the boxes, ordered and counted separately.

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

### Registering a thing is a quiz, not a form

**Ten questions, one a screen, each about the object rather than about the
record.** "What is one of them?", "Do they arrive packed?", "Does it go out of
date?", "How much do you need to know about each one?" — and every answer is
repeated straight back in the same words: *"You count these in litres, and half a
litre is a real amount"*, *"A case of 4 boxes of 10 screws — 40 screws in all"*,
*"You will know which delivery any of it came from"*.

⚠️ **THE SENTENCES ARE THE DOCUMENTATION, AND THAT IS THE POINT.** This flow was
four headings over groups of fields, and under the third sat `Tracked as:
[Listed] [Counted] [Batched] [Itemised]` — the single most consequential field on
the record, offered as four adjectives that mean nothing to anybody who has not
been taught them. Being taught is an induction, a wiki page and a person in the
warehouse who knows; a new employee costs all three, every time.

The four options are named by **what you will be able to answer later** — *That
we have it* / *How many we have* / *Which delivery it came from* / *Every single
one* — and each carries the kind of thing it suits: screws and paper against
medicine and chemicals against machines and cylinders. An example settles the
question for somebody holding a bottle in a way no definition ever will.

Their explanations had in fact been written and reached nobody: the control was a
`Segmented`, which draws `o.label` and nothing else. Its own header says segments
are for a choice worn on the surface — a view, a period, a mode — and never for
data entry. It is `OneOf` now.

⚠️ **EVERY LABEL AND PLACEHOLDER IS BUILT FROM THE ANSWERS ALREADY GIVEN.** Say
you count in metres and the next screen asks whether you can have half **a
metre**, the one after that asks how many **metres** are in a box, and the
barcode step asks how many **metres** it covers. The packing editor used to be
headed "The smallest one has a name" with the placeholders `sheet` and `box`
hardcoded — fixed strings that stayed put whatever anybody counted in, so the
control read as broken at exactly the moment somebody corrected themselves.

⚠️ **AND AN ANSWER REMOVES THE QUESTIONS IT CONTRADICTS.** *That we have it*
means nothing is ever counted, so packs, barcodes and dates are not asked at all
and the flow is six screens rather than ten. *Every single one* means each is
followed separately, so a pack size is meaningless and that step goes too.
Skipped, never greyed out — and dropped from the payload, so somebody who filled
in packs and then changed their mind does not register a shape they have just
denied.

**The clauses are `src/saying.ts`, pure and tested**, because a sentence
assembled inline in a screen reads "1 tablets in a box" on the one path nobody
clicked through — and a customer meets that path on their first product. The test
that keeps them honest asserts something unusual: that **no clause contains a
word somebody would have to be taught**.

**The summary is the last step.** Every screen before it is the question and
nothing else; the review reads the whole story as short sentences, shows what is
still unset, and puts every line one press from the step that wrote it. That is
what makes the camera lane checkable — six photographs come back as twenty fields
across ten screens, which nobody audits, and as one screen of sentences, which
anybody reads.

The frame is the engine's — `Story` in `@engine/design` (DESIGN.md). This app
supplies the ten questions and their sentences and nothing else.

### Five verbs, not one with a parameter

`receive`, `take`, `adjust`, `undo`, `move`. Collapsed into `change(delta)` they
become indistinguishable in the history, and a shrinkage report over that history
is a list of numbers nobody can explain.

⚠️ **`move` IS A VERB OF ITS OWN BECAUSE A TRANSFER IS NOT A CONSUMPTION.**
Carrying a carton from the back store to a ward shelf as a take plus a receive
puts the whole carton into the usage report — so "we used 600 tablets this month"
is a sentence about a trolley, and the one measure that says how fast stock
actually goes is made partly of stock that went nowhere.

It is **two rows sharing one cause**, not one row naming both ends. A transfer
genuinely changes two balances and `stockMove` is the one function allowed to
change one; a single-row transfer would be a second implementation of the reach
check, the quarantine check, the shortfall and the compare-and-set, and a second
implementation is where they drift. `against` carries the transfer's id on both
halves, which is the question that column already answers. **An undo reverses the
whole movement** — undoing one half would put the stock back where it left AND
leave it where it arrived, the same boxes counted twice, from a button whose
entire promise is that nothing happened.

### Goods in

⚠️ **THE THING DONE FIFTY TIMES BEFORE LUNCH WAS REACHABLE FROM NOWHERE.**
`stock.arrive` puts a delivery away in ONE write — make the product if the code
is new, attach the code, open the batch, move the balance — which matters
because a client doing those in sequence on a warehouse phone leaves a nameless
product with no code the first time the signal drops, and because one write is
one queued item offline. It was built, driven end to end, and named by no screen
at all.

⚠️ **IT IS A ROW ON HOME AND NOT A SCREEN, AND THE PHOTOGRAPH IS WHAT DECIDED
IT.** Given its own route it drew one action on an otherwise empty page — a
whole navigation, a title and a way back, to reach a single control — while
being the thing somebody does fifty times before lunch. The most frequent act in
the product earns zero taps of travel, not one. It sits under **Add a product**,
and the difference in shape between them is honest rather than an inconsistency:
adding is a FLOW — ten questions, its own frame, its own way back — so it goes
somewhere and wears a chevron; receiving is one act with three answers, so it
opens a form where it stands. The hero above both says "Receive a delivery and
it will be here" over an empty workspace, which was the third promise in this
product made by an empty state with no control behind it.

⚠️ **THE CODE IS TYPED OR SCANNED AND THE FIELD DOES NOT CARE, WHICH IS WHY
THERE IS NO CAMERA.** A warehouse scanner is a keyboard — it types the barcode
into whatever is focused and presses enter — so an ordinary text field IS the
scanner for most of the hardware people own. A viewfinder is a phone affordance
and a block the declared vocabulary does not have; building the lane around one
would have meant shipping neither.

⚠️ **AND AN UNKNOWN CODE IS STILL RECEIVED.** Take it now, name it later: the
thing lands on the shelf under a name taken from its own code and marked
unnamed, and whoever looks after the catalogue names it afterwards. The worst
outcome in this product is somebody not recording something because a form
demanded a field they did not have.

### The codes, and the labels that make scanning possible

⚠️ **EVERY CAMERA PATH IN THIS PRODUCT RESOLVES AGAINST `code`, AND NOTHING DREW
IT.** A product wears as many codes as the world has printed on it — the GTIN on
the box, the wholesaler's part number, the national code — and until the product
page listed them, "the scanner says unknown" was a dead end: no way to see what
a product already answers to, no way to tell a missing code from a mistyped one,
and no way to give a thing that arrived with no barcode one of its own.

⚠️ **AND A SHELF HAD NO LABEL AT ALL.** `location.code` is what makes the single
highest-leverage behaviour in counting possible — point a phone at a shelf and
the session moves to it — and `location.label`, the only thing that has ever
minted one, was callable by nobody. Every workspace's shelves were unlabelled and
the count session asked for a place by name all day. `/place` is where a shelf is
labelled, and it is also the first screen a row on `/places` has ever led to.

⚠️ **PRINTING IS THE ACT OF LABELLING, WHICH IS WHY THE CODE IS NOT MINTED WITH
THE ROW.** A workspace with four hundred locations has not printed four hundred
labels, and a code on a shelf nothing is stuck to resolves to a place nobody can
find. It is derived when somebody asks for it, once, and never re-issued — a
re-used label is two places with one history, and a re-numbered one is a sticker
on a wall that now points at nothing. So the act is offered only while there is
no code; a second press would find the same string and write nothing, which is a
control that has stopped doing anything and does not say so.

⚠️ **AND THE CODE IS A ROW SOMEBODY CAN COPY, BECAUSE THE NEXT STEP IS OUTSIDE
THIS PRODUCT.** What a person does with a label is write it on tape or paste it
into a printer we do not own. A confirmation toast saying "Labelled." over a
string the screen never shows is an act that reports success and delivers
nothing — and a code re-typed off a screen is a code that will be typed wrong
onto a shelf and resolve to nothing forever.

### The release rail

⚠️ **SEVEN VERBS WERE BUILT, DRIVEN END TO END, AND CALLABLE BY NOBODY.** The
release rail is the compliance half of this product — a batch is made,
quarantined, and used only after somebody reads the evidence and puts their name
to it — and it shipped with no address at all. `process.result` was the one thing
wired, which is what put the subject in the reach guard's sights and started the
countdown this closes.

⚠️ **ENDING AND RELEASING ARE TWO ACTS BY TWO PARTIES, AND THE SCREEN SHOWS IT.**
A machine finishing its cycle is a fact about a machine; "this may be used" is a
judgement somebody puts their name to after reading the printout. Collapsing them
makes the green light the qualification. So `process:run` opens a run, fills it
and ends it, `process:release` decides — two grants, two cards, and the person at
the machine is not the person who signs for it.

⚠️ **EVERY ACT IS GATED ON THE STANDING, AND THAT MIRRORS `refuseRun` RATHER THAN
RESTATING IT.** The handler refuses regardless — releasing from `open` is the
single most tempting shortcut in the rail and it fails at the door — so what the
condition buys is that nobody is offered a control whose only outcome is a
refusal. Both halves read the same five words.

⚠️ **AND THE LIST IS THE RECORD, NOT A QUEUE.** `/runs` shows every run rather
than the open ones, because what this rail exists to produce is something an
auditor reads two years later — which is also why the collection refuses
`delete`. Newest first puts the one awaiting a decision at the top without the
screen claiming to be a worklist.

⚠️ **`/runs` IS A DESTINATION AND THE ENTITLEMENT IS WHY THAT IS SAFE.** A
workspace that does runs does them all day, so it is somewhere somebody stands;
a workspace whose plan does not include `processes` never sees it, and the bar
is built to look deliberate at three, four or five for exactly this reason.

⚠️ **LIFTING IS PER ITEM, AND IT LIFTS TO "NEEDS WORK" RATHER THAN TO "GOOD TO
GO".** A recall reaches the boxes still on a shelf and not the ones already used,
so the verdict lives on the item. Holding stock frozen for ever because a form
cannot be completed is how a rule gets worked around — and the honest description
of a tray whose steriliser failed is that it is unfrozen and still not released.

### Bringing in a catalogue

⚠️ **`product.import` HAS EXISTED SINCE THE APP WAS BUILT AND WAS REACHABLE FROM
NOWHERE**, which made the honest answer to "how do I get my stock in" a shrug —
or eight hundred passes through the register flow. `/import` is the way in, and
it is reached from the catalogue rather than from home: home is where the daily
acts are, and this is done once, in the first hour, by somebody standing in front
of an empty list wondering how to fill it.

⚠️ **IT IS A FLOW BECAUSE PASTING IS NOT THE DECISION.** A column read wrongly
puts a supplier's name in eight hundred product names, and the only place anybody
could notice is before it happens — so a paste box and an Import button would be
a control that gives somebody nothing to decide with. The flow asks for the rows,
and the review says what applying them would do: how many added, how many
changed, how many put on a shelf, how many refused. `StorySpec.shows` is the
engine feature under it and D112 is why it is shaped that way.

⚠️ **THE COLUMN MAPPING IS A GUESS AND CORRECTING IT IS NOT ASKED FOR.**
`product.preview` works one out and is right most of the time, which is why the
guess is worth making. What this flow cannot yet do is let somebody fix it; what
it does instead is show the guess's consequences, so being wrong is survivable
rather than invisible. A mapping editor is a surface of its own.

⚠️ **AND `stock:adjust` IS THE GRANT.** An import carrying quantities SETS
numbers rather than moving them, and this product's sharpest access rule is that
taking and correcting are different grants — so the person on the floor who moves
stock all day cannot paste a spreadsheet over it.

### The way back is beside the act, not in the log

⚠️ **AND FOR A MONTH THERE WAS NO WAY BACK AT ALL.** `undo` was built,
rule-complete and reachable from nothing — no screen named it, and every suite
was green. The obvious home is the history, and it is wrong twice: `/history`
answers to `ledger:read`, which the person who mis-scans does not hold, so the
one role that needs the button cannot open the screen it would be on; and a
reversal is not something somebody goes looking for. They know within a second
and they are holding the phone that did it.

So the four movements that a thumb can get wrong — **receiving, taking, carrying
and scanning in** — offer **Undo** on the confirmation itself, for eight seconds,
which is about the span of "wait, that was the wrong shelf". It is declared
(`Outcome.back`, D109), not written: the operation names its own reversal and
where that reversal's input comes from, and the press goes through the door so
`undo`'s own rules answer it. Refusing somebody else's movement, one that is no
longer the last on its line, or one from an hour ago is `undo`'s business and
never the button's.

⚠️ **A CORRECTION OFFERS NONE, AND THAT IS THE DECISION.** It demanded a written
reason — a sentence somebody composed about what was wrong — and undoing it would
take that out of the ledger with the number, leaving a shrinkage report that
cannot explain itself. Correcting a correction is another correction, with its
own reason, and the record stays readable.

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

### What the shelf is worth

A receive may carry **what the line cost** — the total on the delivery note, not
a per-unit price, because the person holding the note should not have to divide
by three hundred. The server does, against the base quantity the packing ladder
resolved, and holds the result as a **rate per unit** on the line.

**One method, and the other three are refused.** ERPNext offers FIFO, LIFO,
moving average and standard cost. FIFO and LIFO need a queue of `[qty, rate]`
bins per key, replayed from the beginning whenever anything lands out of order —
and that queue is the whole reason a mature stock ledger grows a reposting
subsystem, a job runner, concurrency gates and six reports whose only job is to
find ledgers that have gone wrong. A moving average holds one number and needs
none of it. The price is that it cannot tell you which delivery a unit came from;
where that matters the product already has **batches**, and the rate is per
batch, which is FIFO's answer to the only question FIFO is better at.

**The rate is per (product × place × batch)** — the same key the balance uses.
Per product alone would make "what is this shelf worth" unanswerable, which is a
question somebody standing in a doorway actually asks. Per place means a transfer
has to **carry the rate across**, or moving a pallet would change what a
warehouse is worth without anything being bought or sold.

**The rate is in thousandths of a minor unit.** A rate in whole pence cannot hold
£0.023: a thousand screws would value at £20 against a real £23 — wrong by 13%,
in the direction that flatters. The **value** is in minor units, because that is
what a person reads and what a money field holds.

**Only a receive may reprice.** Taking leaves the rate where it was; a correction
moves value at the standing rate, because finding two more on a shelf is not
buying two more; an undo reprices nothing; a transfer carries the source's rate.

**A line's value is derived, never accumulated.** What a shelf is worth is
`quantity × rate`, computed fresh. What the ledger carries is a different fact —
what each movement cost at the moment it happened, which is what a cost-of-goods
question needs and what a repricing must never rewrite. The two are not required
to reconcile, and not requiring them to is why there is no invariant here to
drift.

**`null` is "nobody has said", never nought,** on both the rate and the value. A
workspace that has never entered a price has an unknown value; "£0" over a full
warehouse is the confident empty with a currency symbol on it.

The currency those minor units are in is the **workspace's**, set from its
country at founding and changeable in its own money screen (D117).

**Where it appears.** The product page says what a product is worth across its
shelves; the place page says what is on one shelf; the report says what the whole
building is holding. All three read one operation — `stock.lines` — because a
total and the lines under it must be answers to the same narrowed question, and
two operations could be given two.

**The figure never stands alone.** A total is the sum of the lines that HAVE a
rate, so it is answered with how many do not, and with the sentence saying so.
Over a catalogue nobody has finished costing, a lone figure is a confident number
wrong by however much is missing — on the one screen somebody would take to an
accountant.

**And the value column is the fourth,** which means a phone does not draw it at
all: `Listing` folds to three. A stockroom sees where, when and how many; a desk
sees those and what it is worth. Nobody standing at a shelf is auditing a
valuation, and nobody auditing one is doing it on a handset.

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

### Buying it in

Reports has worked out what to buy since the day it shipped — the product, the
quantity, the reason and who to ring — and there was nothing to press. Somebody
wrote the list out somewhere else and whatever happened next was invisible to
the product that worked it out.

An order goes to **one supplier**, is written as a **draft**, and is **placed**
— and from then on what it asked for cannot change. A delivery lands against a
line, the line's arrived figure rises, and the order **closes itself** when the
last one lands.

⚠️ **RECEIVING AGAINST AN ORDER IS THE SAME MOVEMENT AS ANY OTHER RECEIPT.** It
goes through the one chokepoint, writes one ledger row, counts against one quota
and carries the order in the movement's `against` — so there is one arrival path
and one history. A purchasing feature with its own way of putting things on a
shelf is two records that will disagree about the same carton.

⚠️ **MORE THAN WAS ORDERED IS ALLOWED.** Suppliers over-ship; a case of 12
against an order for 10 is an ordinary Tuesday. Refusing it would mean the shelf
could not be told what is physically on it — a product making its own paperwork
more important than the stock it exists to count. The shelf is the fact and the
order is the promise; where they disagree, the promise was what was wrong.

⚠️ **AND `closed` MEANS "NOTHING MORE IS COMING", NOT "EVERYTHING ARRIVED".** A
supplier who sends eight of ten and never sends the rest leaves an order that is
finished and short. Cancelling is reached only while nothing has arrived — the
way out of a part-received order is to close it short, because cancelling one
half of which is on the shelf would erase the record of why that stock is there.

⚠️ **ORDERING IS ITS OWN GRANT, AND IT IS THE ONE THAT SPENDS MONEY.** Every
other write moves a number between two places a workspace already owns; placing
an order commits it to paying somebody. Receiving is `stock:move` — the person
on the floor books the van in — and committing the workspace to the next one is
`order:write`.

### Who you buy from

A supplier is a name, somebody to ask for, a way to reach them, **what they call
us**, and how long they take. `sourcing` links them to a product with **their**
reference for it, which is what goes on an order and is almost never what this
workspace calls it.

⚠️ **BOTH WERE WRITTEN FOR MONTHS AND READ BY NOTHING.** Adding a product asks
who supplies it and the handler writes both rows; no screen ever showed either
back, so the honest description of that step was that it asked somebody to do
work and discarded it politely. The reach guard's collection pass is what found
it, the day it was widened to ask whether a person can see a row of a table at
all.

### Things that are one of a kind

A drill, a probe, a surgical tray. An **item** has a life — `held`, `issued`,
`retired` — and it keeps its place while it is out with somebody, which is what
makes taking it back one press rather than a question about which rack it came
from. Who has it is a person's name, declared as `contact` so it reaches the
processing record and the retention clock; it is text rather than a reference
because most of the people things are issued to are not in the system.

⚠️ **THE NEXT SERVICE IS THE WHOLE OF THE ASSET CASE** — a thing nobody counts
and everybody has to maintain. `/items` leads with what is due, because it is the
only fact here with a clock on it and the only one nothing else in the product
will ever raise.

A **kit** is a set made of items with a recipe: a surgery tray, a tool roll.
Putting an item in takes it off its shelf; taking it out puts it back.

⚠️ **AND "IT IS COMPLETE" IS A CLAIM SOMEBODY SIGNS, WHICH IS WHY IT IS
REFUSED WHILE ANYTHING IS SHORT.** A tray drawn as the things in it looks
complete whatever is absent, so what is MISSING is its own list on the screen —
and the empty state there is the one place in this product where nothing is good
news.

⚠️ **ELEVEN VERBS WERE BUILT FOR THESE IN OI-8 AND NEITHER HAD A SCREEN.** They
were gated, audited, tested at the door and callable by nobody, and the guard
written to catch that excused them for having no surface at all — which is the
case where the surface is what is missing. The widened reach guard is what said
so.

### What a case, a work order or a build number used

A **job** is a consuming context that references something outside the system —
a patient case, a work order, a build number, a service call, a cook, a room
turnaround. What makes it general is that the reference is a **label the
workspace chose** rather than a record this app holds: the moment it became a
patient it stopped being sellable to a factory.

Open one at `/jobs`, take stock against it from `/job`, and close it when the
work is done. Nothing else changes about a movement — it comes off the shelf
through the same chokepoint, writes the same ledger row and counts against the
same quota. What the job adds is which promise the movement answered.

⚠️ **AND A JOB HAS NO LINE TABLE, DELIBERATELY.** What it consumed is already in
the ledger against its id, so the trace is a QUERY. That is why a job correct on
Tuesday acquires a concern on Thursday — a recall lands on a lot it used — and
why the screen leads with what is **in doubt** rather than with how many lines
it took. A status written when the job closed can never learn that.

⚠️ **THREE VERBS AND A PRICED ENTITLEMENT, AND NOT ONE DOOR UNTIL NOW.** `jobs`
is sold — a gate every tier that carries it names — so this was a capability a
workspace could pay for and never see. That is sharper than an unreached verb,
because somebody was charged for it.

### The words a catalogue is filed under

A **tag** is a word this workspace uses for a kind of thing, and it is a
vocabulary rather than a string on each product. Asking a model to categorise
something against nothing produces "Cleaning", "Cleaning products", "Cleaning
supplies" and "Janitorial" across four mornings — every one defensible, and the
catalogue is then unfilterable by the thing it was categorised for. A table can
be READ before it is written to, so registering a product asks "which of these
does it belong to" rather than "what would you call this".

`/words` is the list, `/word` is one of them with everything filed under it, and
a product's own page says what kind of thing it is. Renaming lands in one place
and every product under it follows — which is the whole argument for the table,
and which nothing could do until `tag.rename` existed.

⚠️ **RENAMING ONTO A WORD THAT EXISTS IS REFUSED**, which is the match-before-mint
rule read the other way round. Registration matches a word before it makes one,
so "Cleaning" and "cleaning" are one row; a rename that ignored the match would
put the second word back and undo it, quietly, on the one table whose value is
that it holds each word once.

⚠️ **AND THE REGISTER FLOW HAD BEEN ASKING SINCE OI-18a WITH NOTHING SHOWING IT
BACK.** Every word somebody typed was matched, minted and filed, and no screen in
the product ever displayed one — so the honest description of that step was that
it asked for work and discarded it politely.

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

**And a gate reaches the nav, not only the operation.** Two screens name the
capability they are for — `/runs` and `/run`, both `processes` — and one the plan
does not include never leaves the server, so it has no nav row, no route and no
way in by typing. Runs open at Plus, so a garage on Solo gets four primary
destinations and a clinic on Plus gets five.

⚠️ **THIS PARAGRAPH NAMED `/work` AND `/case` FOR MONTHS AND NEITHER EXISTED.**
They were emptied in the surface rewrite and never came back; the sentence went
on describing a product that had changed underneath it, which is the same fault
the two plan-gating suites had at the same time — a claim about gating that was
true when written and asserted by nothing after.

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

### Twenty collections

`product` · `supplier` · `code` · `location` · `batch` · `unit` · `kit` ·
`process` · `process-item` · `job` · `count` · `tally` · `stock` · `ledger` ·
`shot` · `tag` · `tagging` · `sourcing` · `buying` · `buying-line`

Erasure is derived from what each one declares; nothing here carries a
hand-written cascade.

### Sixty-one operations

Grouped by what they are about: the shelf (`stock.*`), the code book (`code.*`),
deliveries (`batch.*`), objects (`unit.*`), kits (`kit.*`), counting
(`count.*`), the rail (`process.*`), jobs (`job.*`), buying (`buying.*`), the
words a catalogue is filed under (`tag.*`), the catalogue (`product.*`), the
workspace's own defaults (`inventory.*`), and the report.

⚠️ **RECOUNT IT RATHER THAN TRUSTING THIS SENTENCE.** It said fifty for two
rounds after the purchasing rail landed, which is what every hand-kept figure in
this repository eventually does.

### Six settings

`inventory.profile`, `inventory.default_tracking`, `inventory.default_unit`,
`inventory.warn_days`, `inventory.service_days`, `inventory.lead_days` — all
tenant-level, all in the `stock` area, all read by a handler or a screen (which
the `settings` guard enforces).

### Tests

| Where | What it holds |
|---|---|
| `apps/inventory/test/*.test.ts` | the pure halves — 292 tests over thirteen files |
| `one/test/inventory.test.ts` | the golden path through the **real worker** — 16 |
| `one/test/inventory-deep.test.ts` | batches, items, kits, the rail, the night — 19 |

⚠️ **THE SUITES THAT RENDERED A SCREEN WENT WITH THE SCREENS, AND THEY ARE NAMED
HERE RATHER THAN QUIETLY ABSENT.** Four stood in this table: every screen
rendering and saying the true thing; every screen MEASURED in real Chromium at a
phone and a desk; every primary action naming a real operation; and every hazard
name whole inside its diamond. Not one of them is about any particular screen —
all four are about whether a screen can be trusted — so all four come back as the
rebuild produces something for them to check. A suite that shrinks while the run
stays green is how coverage is lost.

⚠️ **AND A DATE ON A SCREEN IS THE READER'S, NOT THE RECORD'S.** The render sweep
failed any screen showing a stored `2026-08-19` — five did, and on one screen the
two formats were in ADJACENT rows of a single card. The printed label is the one
exemption and it is the opposite rule: a sticker may be read in another country
by somebody who reads dates the other way round, so ISO is right there and only
there. That is the first thing the sweep re-asserts.

**A photograph of every screen is NOT part of `test`:**
`pnpm --filter @engine/inventory shots` writes `shots-out/<look>/<screen>.png` at
a phone and a desk, in light and in dark. It takes minutes and answers no
question with a pass or a fail, so it runs when images are wanted rather than on
every push. It reads the manifest, and its floor — that it found something to
sweep — is correctly failing at zero while the surface is empty.

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

**Eleven, and every one of them is drawn by the engine from the declaration.** The
surface was emptied whole on 2026-08-26 and is being rebuilt one screen at a
time, each designed from what somebody standing in front of it is trying to do
rather than ported from what stood there before.
[../../docs/BLUEPRINT.md](../../docs/BLUEPRINT.md) is the order that rebuild
follows and the shape every screen is drawn to.

| Route | Name | Nav | Needs | Component | Container |
|---|---|---|---|---|---|
| `/` | Stock | primary | `stock:read` | `declared` | `declared` |
| `/out` | What ran out | — | `stock:read` | `declared` | `declared` |
| `/expiring` | Going out of date | — | `stock:read` | `declared` | `declared` |
| `/products` | Products | primary | `product:read` | `declared` | `declared` |
| `/places` | Places | primary | `location:read` | `declared` | `declared` |
| `/report` | Reports | primary | `ledger:read` | `declared` | `declared` |
| `/history` | History | — | `ledger:read` | `declared` | `declared` |
| `/counts` | Being counted | — | `stock:read` | `declared` | `declared` |
| `/count` | Count | — | `stock:read` | `declared` | `declared` |
| `/product` | Product | — | `product:read` | `declared` | `declared` |
| `/place` | Place | — | `location:read` | `declared` | `declared` |
| `/runs` | Runs | primary | `process:read` | `declared` | `declared` |
| `/run` | Run | — | `process:read` | `declared` | `declared` |
| `/jobs` | Jobs | — | `process:read` | `declared` | `declared` |
| `/job` | Job | — | `process:read` | `declared` | `declared` |
| `/orders` | Orders | — | `order:read` | `declared` | `declared` |
| `/order` | Order | — | `order:read` | `declared` | `declared` |
| `/suppliers` | Suppliers | — | `order:read` | `declared` | `declared` |
| `/supplier` | Supplier | — | `order:read` | `declared` | `declared` |
| `/items` | Items | — | `stock:read` | `declared` | `declared` |
| `/item` | Item | — | `stock:read` | `declared` | `declared` |
| `/kits` | Kits | — | `stock:read` | `declared` | `declared` |
| `/kit` | Kit | — | `stock:read` | `declared` | `declared` |
| `/words` | Tags | — | `product:read` | `declared` | `declared` |
| `/word` | Tag | — | `product:read` | `declared` | `declared` |
| `/add` | Add a product | — | `product:write` | `declared` | `declared` |
| `/import` | Bring in a spreadsheet | — | `stock:adjust` | `declared` | `declared` |

⚠️ **`declared` IN BOTH FILE COLUMNS IS THE ANSWER, NOT A GAP.** A declared body
has no component and no container — the renderer draws it from `src/index.ts`, and a
row naming a file here would send a reader to code the product does not run.
That is the fault this whole index nearly became: for a while it named a
hand-written file per route while the product drew the declaration.

**Places can be made from Places.** Its empty state has always read "Add a room,
an aisle or a shelf and it will be here" over a screen with no way to add one —
a list whose emptiness names the act that would end it, with no control to
perform it, which reads as a missing feature rather than a missing button. The
form is `location.create`'s own input, so nothing on the screen says what a place
is; the collection already did.

**What the home leads with, and why it is not a total.** `/` opens on how many
lines have run out — the one number that decides whether somebody walks to the
store room, asked every morning and answered differently every morning. The
reference app's home leads with the record somebody walked away from instead,
because a notebook's total is a question asked once; the hero region takes a
KIND so both are one contract. Under it are four tiles, each a `count` over the
view its own list draws, so a figure and the rows behind it cannot disagree.

**Every row opens the product it is about.** A catalogue row IS one; a shelf line
is one on a shelf, so it leads `by: "product"` rather than by its own id. The
product page leads with WHERE the thing is — the shelves it is on, and the
quantities under that — because somebody opening it is standing in front of a box
asking a question about the world rather than about the record.

**What is going out of date is the second question an inventory is opened with,
and it had no screen.** `/expiring` is two asked views over one operation
(`ViewSpec.asked`) — the figure counts what has already gone, the list draws
everything that is going, and neither can disagree with the other because they
are one declaration read twice. The list carries WHICH CLOCK decided, because
four of them compose and the earliest wins: a box with a 2029 date that somebody
opened last month is out next week, and "expires Tuesday" with no reason beside
it is a shelf nobody trusts. The nightly sweep's two notifications finally lead
here — they have been raised since the job was written and carried by nothing,
which from the console is indistinguishable from a night on which nothing
crossed.

⚠️ **AND `batch.due`'S DEFAULT ANSWER NOW MATCHES ITS OWN NAME.** It returned
every delivery with a clock on it, including the ones fine for two years, so the
list it backs was a page somebody scrolls past a hundred cartons of gloves to
find the one carton of anything that matters. `standing` narrows it, absent means
what runs out, and `fine` is still askable — a change to what it says by default
rather than to what it can say.

**And the recorded share can be drilled into.** `ledger:read` gated the report
and nothing else, so "who took this, and when" — the question the share raises —
was answered nowhere, and a number nobody can check is a number somebody has to
take on trust. `/history` is every movement, newest first, reached from the
report's own figure.

⚠️ **A ROW IS A SENTENCE, WHICH IS WHY IT IS AN OPERATION AND NOT THE GENERATED
LIST.** A `Listing` has three slots and two are already the product and the
clock, so what happened, how many and where are one phrase — and a declaration
cannot build one: the verb depends on the move, and for three of the five the
DIRECTION depends on the sign. A transfer is two rows sharing one cause, and
"Carried 4 out of Back store" beside "Carried 4 into Bench two" is the pair that
would otherwise print identically. `saysMove` is pure and tested.

⚠️ **AND IT IS ITS OWN SCREEN RATHER THAN A SECTION ON THE PRODUCT PAGE, decided
by the door rather than by taste.** A screen is refused WHOLE if any collection it
reads is outside the caller's grants, so one `ledger` view on the product page
would 403 the product page for every floor worker in the building.

**The count session can be opened, worked and closed from the product, which for
a long time it could not.** Four operations were built, gated, audited and
reachable through the API and through an agent, and `/counts` listed the open
sessions and gave nobody a way into one.

⚠️ **AND THE VERB THAT BEGINS ONE WAS THE LAST TO GET A CONTROL, ONE ROUND
AFTER THE OTHER THREE.** Wiring `/count` gave `count.tally` and `count.close`
their surfaces and left `count.open` called by nothing — so the product had a
list of counts, a way to work one, a way to settle one, and no way to start one,
under an empty state that said "Open a count on a shelf". It is an `ActionRow` on
`/counts` now, asking the two questions a person has an answer to (which shelf,
and whether the expected number is hidden) with the day filled from the device.
This is exactly the fault `reached.test.mjs` was widened to catch, and it caught
this one the day it was written. `/count` is the shelf somebody is
standing at with a phone, and its order is the order of the job: count one more
(the thing done forty times), what you have counted (the running check), what
closing would change (read once, near the end), and the close.

⚠️ **THE TALLY IS NOT THE SHELF, AND THE TWO LISTS SAY SO.** Until the session
closes, what has been scanned is a running total and the balance is still
whatever `stock` holds; reading them as one would make a half-finished count
visible to everybody as fact. The differences are the two read against each other
and include **the lines the count did not find**, which go to zero — the rows a
person most has to see before pressing close, because a session somebody
abandoned half way through empties the rest of the rack.

⚠️ **AND `stock:read` OPENS IT WHILE `stock:adjust` CLOSES IT.** Counting is open
to everybody on the floor; SETTLING a count writes corrections, and somebody who
takes things all day must never be able to make a number agree with what they
took. The close row asks the gate and says why it cannot be pressed rather than
disappearing.

⚠️ **`count.tally` NEEDED THE DEVICE'S YEAR, AND NO DECLARED BODY COULD SUPPLY
ONE.** A six-digit expiry has its century inferred from a window around now, so
reading one needs the year where the box is — and four operations here take it as
required input. `today` is a date string and a manifest cannot hold a year
without being edited every January, so `Fill` gained `year`, derived from the
same day both ends already send rather than read off a second clock.

**The recorded share has a screen at last, which is the figure Part I opens
with.** `/report` is five asked views over ONE operation: consumption, shrinkage,
how much of it was written down and what to buy are four readings of the same
movements over the same period, so they are one `stock.report` and the runtime
holds one answer for all five (`runViews`). Four separate reads could be given
four different periods, and a screen showing a month's usage beside a fortnight's
losses would say nothing anywhere about disagreeing.

⚠️ **THE PERIOD IS A CONTROL, AND IT IS THE FIRST `PickSpec` IN THE TREE.** 7 · 30
· 90 days above everything it changes, opening on 30 — which is what the operation
itself defaults to, so the same question asked through the door and through the
screen gives the same answer. Making that possible needed `PickSpec.opens`: four
options or fewer are drawn as a segmented control, so the ORDER is what somebody
reads left to right and the DEFAULT is a separate decision, and one slot for both
forces a period list running 30 · 7 · 90 or a report that opens on the wrong
month.

**Straight under the figure is what to buy — the one list on the screen somebody
acts on**, ordered soonest-to-run-out rather than by how little is left, because a
product with two weeks of stock and a three-week supplier is out before the order
lands. Each row carries how long, why, and who to ring, so a line can be acted on
without leaving it. It sat below the two stats that explain the hero and
photographed with the only actionable thing on the screen under the fold, behind a
number the hero had already said.

⚠️ **AND `ledger:read` IS WHAT OPENS IT.** The common role moves stock and may not
read the record of who moved it, which is why this is a screen of its own rather
than a group on the home: a block that vanishes for most of a workspace leaves a
hole in a screen everybody opens, and the nav already drops a destination somebody
cannot reach.

⚠️ **AND THE SENTENCE UNDER THE FIGURE HAS A THIRD BRANCH NOW.** "The rest went
unscanned" was said whenever anything had moved at all — so a workspace that
scanned every movement was told, at 100 %, that a count had found the rest
missing. There is no rest. The figure exists to be pushed up; congratulating
somebody who reached it costs a line.

**And it is where a product is CORRECTED and where it is FINISHED, not only where
it is read.** Two of its facts carry a pencil — the brand and the reorder line,
which are the two people actually change; the row opens the field's own sheet,
drawn from the field's own declaration, and the save goes through the generated
update. `unit` and `tracking` carry none: both are `settled`, `product.recount` is
the way through, and the manifest is refused for offering either. Under the
figure is the receiving — the hero says "Receive some and it will be here", and
until 2026-08-27 nothing on the screen could. At the foot is the way out, which
no screen declares: every detail screen in every product gets Delete and the
thirty-day sheet behind it from the frame.

⚠️ **AND ALL FOUR WAYS STOCK MOVES ARE HERE, WHICH FOR A DAY WAS ONE.** Only
`receive` was reachable anywhere in the product — an inventory where stock goes
up and never comes down, in which every balance is the sum of what arrived. Take,
receive, carry and correct are one card, ordered by frequency rather than by the
story of a box; each supplies the three facts the screen is already standing on,
so what is left is the two questions a person has. Correcting is behind a
different grant from the other three, which is what forced the engine half: a
block's `does` asks the gate before it draws now, so the row a floor worker may
not press says so instead of refusing after the sheet is filled in.

**A flow ends here, on the product it just made.** Registration used to land on
the catalogue, which asks somebody to find in eight hundred rows the thing they
were holding a second ago — and which cannot say the one thing that is true of a
product a minute old: it is not on a shelf yet.

**Adding a product is a FLOW, and it is the third kind of screen.** A `body` is
read and drawn; a `story` is walked — one question a screen, a dock that carries
Back beside Next, and a review at the end where every clause is one press from
the step that wrote it. `product.register` takes twenty-one inputs, and as one
page that is a form somebody has to be taught; as five questions it is a thing
they can do standing at a shelf.

⚠️ **AND THE SAME FLOW ASKS FIVE QUESTIONS OR NONE.** The first step is the
camera. `product.see` runs over the pictures and answers ten of the twenty-one,
and every step whose fields arrive that way is not asked — it goes to the review
as a clause. Reading a paragraph about a box and correcting one word is a job
people do; confirming twenty fields is one they skip. `tracking` is the one step
that is asked either way: the rung decides whether a delivery can be expired or
recalled and it is `settled`, so a model may propose it and a person picks it.

**The review is a paragraph and then rows, and the photographs are a row.** A
step that `says` something joins one sentence; everything else is a row whose
label is its answer and whose sub-line is the question, because somebody scanning
a review is hunting for the ANSWER that is wrong. The camera step has no sentence
to make — a picture is not read back as words — so its row counts what it holds
(`{n} taken`, from `ASKS`). Without that count the row said "Nothing set" over six
photographs, on the one screen whose whole job is to show an omission.

⚠️ **ELEVEN OF THE TWENTY-ONE ARE NOT ASKED HERE AT ALL, deliberately.** Barcodes,
suppliers, the packing ladder, a reorder rule and the two shelf lives are facts
somebody adds when they have them, and the product page already draws every one.
A registration that demanded them is a registration nobody finishes.

**The look is settled, and it is one world on one screen.** `/` names `neon` and
nothing else names anything. Every other family in the engine is quiet by design,
and a quiet world on a screen this dense is a texture visible only in the gutters
— every surface below the crown is opaque, so a soft ground is a photograph of the
ground with nothing on it. `neon` carries a hard source that reaches the crown,
the hero's face and the tile edges, which is what puts the chrome and the content
in one room. The four narrowed lists behind it name none: the home is somewhere,
the pages behind it are the product.

**The ground under it is the deployment's, not this product's** — `GROUND.dark`
moved off near-black the same day (D99), which took page-to-card from 1.03:1 to
1.23:1 and is what makes a card read as a card here at all. It is written once in
`design/src/tokens/ground.ts` and every product on the engine wears it.

**AND IT IS TITLED BY THE PRODUCT NOW, NOT BY THE WORD "Product"** (D106). This
section used to describe the gap and the channel it needed, and the channel is
what was built: the screen door answers `Drawn.name`, resolved once by `namesIn`
from the collection's own `names` declaration. Nothing in this app declares it —
the collection already said which field names a row, and the browser holds this
app's screens rather than its collections, so the name comes back with the record
from the door that had both. The kind moves under the name, where "Product" is a
fact about what is on the screen instead of the screen's own title.

**And it leads back rather than to the account.** `nav: "none"` already said this
screen is somewhere somebody went, so the frame puts the way out where the avatar
is on a destination, and the crown takes the product's name once the heading has
scrolled past it — replacing the workspace/product pair, which on a page about
one particular tin is answering a question nobody asked. All of it is the
`detail` shape's, so the next screen of that shape in this product or any other
arrives with the three already done.

⚠️ **THE ENGINE UNDERNEATH IS UNTOUCHED, WHICH IS WHY THIS IS A SHORT SECTION
RATHER THAN A SHORT PRODUCT.** Part I is what this product does and Part II is
how, and neither changed: the collections, the operations and the pure logic are
all still here and still tested. What was emptied is the surface — and, because
the composer refuses each of them without a screen to point at, the views, the
notifications, the guide and the help entries that were claims about particular
screens.

**The index returns as the screens do**, one row per screen, naming the file only
where a file draws it. A screen the engine renders from a declaration has no
component and no container, and a row naming one would send a reader to code the
product does not run.


## What a mature warehouse system has that this does not

**[ERPNEXT.md](ERPNEXT.md) is the survey** — ERPNext's Stock module read from its
own source: 80 tables, 51 reports, every setting, and a comparison against this
product. It exists so that "does a real warehouse system do X" has a citable
answer while this one is being designed, and so that what we leave out is left
out on purpose.

⚠️ **IT IS A CATALOGUE, NOT A ROADMAP.** ERPNext's stock module exists to feed a
general ledger, and about a third of it is accounting machinery that only makes
sense if you are also the accounting system. Its own last section names the three
gaps that are load-bearing — **stock value**, **a warehouse tree that rolls up**,
and **reservation** — and the two that are traps.

## What is not built

- **The GHS pictograms are named, not drawn.** The decant label prints a named
  diamond and says so. Regulated artwork is a legal document; a hand-drawn
  approximation of one is worse than an honest gap. (Task #210.)
- **A list does not aggregate.** It narrows, pages and counts (engine 62), but
  "how much did each job use" is a group-by, and a group-by is a query language
  arriving through a door that deliberately has none. The reports compute their
  own.
