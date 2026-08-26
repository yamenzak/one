# The blueprint

kind: standards

**How a product is built on this engine, in the order it is built.**
[ENGINE.md](ENGINE.md) is what exists and
[BUILDING.md](BUILDING.md) is why the engine is shaped that way;
this is what to DO with it, from an empty manifest to a screen somebody opens.
[../design/DESIGN.md](../design/DESIGN.md) is the language every surface here is
drawn in.

⚠️ **THIS DOCUMENT NAMES NO PRODUCT, EVER, AND THAT IS ITS ONE RULE.** The
moment a blueprint cites the app it was written beside, every reader after that
has to work out which parts were general and which were that app's — and the
honest answer becomes "nobody knows", so the whole thing is read as one app's
notes. Everything below is either true of every product on this engine or it does
not belong here. An example is a shape, never a screen: *a number that matters*,
never *the number on the home screen of the thing we happened to build first*.

⚠️ **AND IT IS WRITTEN FROM DECISIONS ACTUALLY TAKEN, NOT FROM THEORY.** Every
section arrived because a real screen forced the question, and several arrived
because the composer refused something and named what was missing. A blueprint
written in advance of building is a guess with headings; one written as the work
happens is the only kind that has been tested. Sections appear here as they are
earned, so gaps in the numbering are honest.

---

## 1 · The order

The order matters more than any single rule in this document, because most of
what goes wrong on a product is a thing built before the thing it depends on and
then bent to fit.

1. **What is kept.** The collections and their fields — the nouns, and what is
   true about each. Nothing about a surface.
2. **What can be done.** The operations. What the product can DO is settled
   before anything is drawn, because a screen that binds to an operation which
   does not exist is a screen designed around a feature nobody built.
3. **The chrome.** What every screen sits inside — see §3. It is built once,
   before the first screen, because it is the thing every screen is judged
   against and because a screen designed against provisional chrome is a screen
   designed twice.
4. **One screen at a time.** Each from the question in §4, drawn to the skeleton
   in §2, photographed as it lands.

⚠️ **A SCREEN BINDS TO AN OPERATION THAT ALREADY EXISTS, OR IT NAMES ONE THAT
HAS TO BE WRITTEN — AND THE SECOND IS A FINDING WORTH HAVING.** It means the
surface has discovered something the product cannot do, which is a far better
thing to learn while drawing than after shipping. What it must never become is a
reason to reach behind the declaration.

---

## 2 · The skeleton

Every screen has the same skeleton. This is not a constraint on design; it is
what MAKES design affordable — one place per screen earns real investment and
everything else is the system, consistent and cheap.

```
  crown                    quiet, floating, no bar          56
 ╔═══════════════════════════════════════════╗
 ║  H E R O          full bleed, bespoke     ║   200 … 44vh
 ╚═══════════════════════════════════════════╝
  ◉ All   Something   Another   Anot⋯        narrowing      44
                                                          ↑ bleeds off the edge
  Section heading                  View all
  ┌─────────────────────────────────────┐
  │  content — rows, or tiles           │    the system
  └─────────────────────────────────────┘
  ┌───────────────┐ ┌───────────────┐
  └───────────────┘ └───────────────┘
      ◍     ▬▬▬▬▬▬▬▬▬▬▬▬▬            the verb, and the dock
```

Gutter 20. Card radius 24, gap 12 within a group and 28 between groups. The dock
sits 20 above the safe area; the verb is detached beside it.

⚠️ **THE NARROWING ROW BLEEDS OFF THE EDGE, AND THE CUT PILL IS THE
AFFORDANCE.** A row that ends flush inside the gutter looks complete, so nobody
scrolls it and the choices past the fourth are never seen. Half a pill at the
edge says there is more with no chevron, no arrow and no word — which is why a
row that fits should still start scrolled hard against the left rather than
centring itself.

⚠️ **TILES FOR A SMALL CLOSED SET, ROWS FOR A LONG OPEN ONE, AND THIS IS NOT A
MATTER OF TASTE.** A tile is recognised by shape and is right for a handful of
things somebody has memorised. A row is scanned, and the reason is arithmetic:
values a person compares — counts, totals, dates — have to sit in a column,
right-aligned, in the same typeface at the same size, or the comparison is not
available at any speed. A grid scatters them into a mosaic, so finding the zero
means reading every cell instead of looking down one edge. Every product built
from a reference designed for twelve memorised objects has to make this decision
consciously, because the reference will not have had to.

⚠️ **AND THE SECTION HEADING IS WHERE THE WAY OUT LIVES.** A list cut short
carries a text link beside its heading rather than a row at the bottom saying
"show more". A row that means "there are more rows" is a row somebody taps
believing it is a record.

---

## 3 · The hero

**Every screen has exactly one hero, and it is the one place per screen that
earns real design.** A screen without one opens flat: every block is peer to
every other, nothing leads, and a person arriving has to read in order to find
out what they are looking at.

⚠️ **IT IS A REGION IN THE DECLARATION, NOT WHATEVER IS FIRST IN THE LIST.**
Four things follow from naming it that cannot be had otherwise. The KIND DECIDES
ITS OWN BLEED — a figure is a card inside the gutter, a picture runs to the edges
of the screen — which is a decision no entry in a flat list of blocks can make
about itself. The crown COLLAPSES INTO IT, so the screen's name rises into the
chrome as the hero leaves, automatically, rather than every author remembering to
arrange it. It carries its own AMBIENCE, which no ordinary block does. And a
guard can REQUIRE one, so "this screen opens flat" is a test rather than a note
somebody writes in a review.

⚠️ **AND "IT IS FULL BLEED" IS WHAT THIS PARAGRAPH SAID**, which was true of one
kind and written as though it were true of the region. A blanket rule here would
have made every hero run to the edges: correct for a photograph, wrong for a
card — the sort of thing discovered by drawing the second kind rather than by
reading the first.

### A hero is a figure and the ways onward, not a big number

⚠️ **A FIGURE ALONE ANSWERS "HOW MUCH" AND LEAVES SOMEBODY TO GO AND FIND THE
THING IT IS ABOUT.** The same figure with three ways onward under it is the top
of the screen doing work the rest of it would otherwise have to. A hero kind that
takes no destinations is one every screen will need a row of shortcuts under, and
that row is then the app's to lay out, per screen, differently each time.

⚠️ **THE DESTINATIONS ARE SCREEN IDS AND NOTHING ELSE.** The words and the mark
come from the manifest, so a renamed screen renames its shortcut — a label typed
beside the id is a second spelling of something the manifest already holds, and
the two drift the first time anybody edits one. One the person may not open is
DROPPED rather than drawn: a shortcut to a refusal is a promise the product does
not keep, and it costs most at the top of a screen, where it is pressed most.

⚠️ **AND THEY SURVIVE AN EMPTY WORKSPACE.** They are what somebody presses to
MAKE the figure be something. A hero that hides its controls until there is a
number to show withholds them precisely when they are the only useful thing on
the page.

⚠️ **A UNIT IS A SLOT, NEVER PART OF THE VALUE.** Folded into the string it stops
being a number: nothing can count up to it, and two screens' heroes sit at
different left edges because one of them has three letters in front. The same is
true of the mark — a number alone is read as arithmetic; the same number beside a
mark is read as a subject.

### The hero is a KIND, and a figure is only one of them

⚠️ **THE FIRST KIND SHIPPED AND WAS TREATED AS THOUGH IT WERE THE HERO.** A screen
either had a big number or opened flat, and the whole region was built to take a
kind precisely so that would not be the choice. A count is a question asked once
and then known; nobody opens a tool to find out how many records are in it. What
somebody actually comes back for differs per product, and the kinds are where
that difference lives:

| The hero is… | The kind | When it is the right one |
|---|---|---|
| a number that matters | `figure` | the number changes and somebody checks it — a balance, an arrears, what is left |
| the record you were last in | `subject` | there is a thing to carry on with: a draft, an open count, an order arriving |

**Two, and the list grows only when a screen asks.** A kind with no screen behind
it is the mistake this engine has made twice already — thirteen charts and six
list shapes, registered by listing what a design package could export rather than
by counting what a product draws. Sketching six beautiful heroes is the same
mistake in a bigger box.

⚠️ **A `subject` HERO IS WORDS, AND THAT CHANGES THE TYPE.** A record's name is set
in the title role, not the display role: display is tuned for a NUMBER — tabular
figures, tracking pulled in hard — so a title in it comes out cramped and reads
as a serial rather than a sentence.

⚠️ **AND THE ONE COUPLING IS WRITTEN DOWN RATHER THAN INFERRED.** A subject hero
opens the record it is about, and the id comes off the same row its NAME came
from — there is no second place it could come from, and a hero whose name is a
literal has no record behind it at all. The composer refuses that pairing, so the
press can never reach a screen with no subject.

### A hero has no plate, unless its kind says otherwise

⚠️ **A CARD IS A PLATE LAID ON A GROUND, AND THE HERO IS THE GROUND.** Put on
one, the loudest words on the screen start a gutter to the right of the crown
that names the screen — two of the three biggest things on the page at two
different left edges. That is the same fault as centring a figure, arriving
through padding instead of through alignment, and it is the harder one to see
because the padding looks tidy.

⚠️ **AND ON A LIGHT GROUND THE PLATE IS BUYING NOTHING** — a near-white card on a
near-white page is an edge nobody can see, charging a gutter for it. What
separates a hero from what follows is RANK and AIR, both of which it already has;
and the cards below then read as objects ON a ground rather than as the second of
five identical plates. That is the visual flow a screen either has or does not,
and it is mostly this one decision.

⚠️ **THE MARK IS A ROW OF ITS OWN, NOT A COLUMN BESIDE THE WORDS.** Beside them a
40px plate reserves its width for the WHOLE height of the block, so four lines of
prose each lose fifty pixels to something occupying the top forty — the longest
text on the screen narrowed most by the smallest thing on it. Above them it costs
one row, once.

⚠️ **AND THE EYEBROW RIDES ON THAT ROW.** A mark at one end and an affordance at
the other with nothing between them is two things a screen apart; the eyebrow is
the one line short enough to sit beside a plate and it says what the row IS, so
the three become one statement instead of three orphans.

### Bespoke, and a closed set, at the same time

**The KIND is a closed vocabulary. The CONTENT is the screen's own. Each kind is
drawn with real care, once.** That is what produces something that feels made for
the screen without producing a different snowflake per screen — and it is the
same trick the face uses, where a person gets one world and a workspace gets
another rather than every plate being a letter in a circle.

⚠️ **A KIND IS REGISTERED WHEN A SCREEN ASKS FOR IT AND NEVER BEFORE.** The
temptation is to sit down and name the six beautiful things a hero could be. That
is exactly how thirteen charts and six list shapes came to be registered in this
engine by listing what the design package could export rather than by counting
what a product draws — and eleven of the charts, then all six of the lists, were
removed once somebody asked what a declaration naming one would actually render.
A hero kind with no screen behind it is the same mistake with a bigger box.

### What each kind owes

A kind is not finished when it looks right with real data. It owes, every time:

- **What it says when there is nothing yet.** A hero is the first thing on a new
  workspace's first screen, so its empty state is the product's first
  impression — and it must read as *nothing has happened yet*, never as broken.
- **What it says while it is waiting.** A shape that matches what is coming, not
  a spinner and not a grey box of the wrong size.
- **What it says when the read failed.** Distinguishable from empty. A hero that
  answers a failure with a confident zero is the worst instance of the worst bug
  class in this codebase.
- **How it behaves as it scrolls away**, since the crown is collapsing into it.

---

## 3a · A supporting figure is a tile, and a tile is five things

**The hero is one number and a screen needs several.** A person arriving asks how
much there is, and then immediately how much of it needs them. Answering only the
first is a page that opens with a total and a table, where every follow-up
question is a scroll and a count.

⚠️ **ONLY ONE OF THEM IS LOUD.** The hero is on its own surface in display type;
the supporting figures are a rung down, on plain cards. Four numbers at one rank
is four numbers nobody reads — the eye has to choose, and whichever it picks was
not a decision anybody made. That is the hero's own "two heroes is no hero", one
step out.

**What a tile owes, and every one of these was found by comparing a screen of
ours against a screen we admired:**

1. **A mark.** A number with a label is text in a box; the same number beside a
   mark is a subject. The tint goes on the mark's GROUND and the glyph stays
   neutral — a tinted glyph stops reading the moment the ambience behind it
   moves.
2. **The number above the label, not under it.** Scanning four tiles you should
   get four numbers and glance down for what they are; label-first makes you read
   four captions to find four numbers. Label-first is right for a figure standing
   in a row of text and wrong for a tile, which is why they are different roles.
3. **A rank of its own** — under the hero, above a figure in a row. Ours sat at
   the in-a-row rank and read as the hero's caption.
4. **Somewhere to press.** A supporting figure is a count over a narrowed view,
   so the rows behind it ARE a screen. A count with no way through to what was
   counted is a dead end on the busiest part of the page — and declaring both
   halves from one view is what makes the number and the list agree by
   construction rather than by two queries that happen to match today.
5. **Two things pinned to the top corners.** The mark at one end, the affordance
   at the other, the number beneath. A plain column reads as text that drifted
   into a box; the corner-pinning is most of what makes a tile look composed.

### Colour is a verdict, never variety

⚠️ **A TONE PER TILE FOR VARIETY IS HOW A ROW OF FIGURES BECOMES A ROW OF HUES
THAT MEAN NOTHING** — and it costs the one thing colour is for. In the reference
this section was written against, four tiles carry four hues; one of them is red
on a genuine problem, and because it sits in a rainbow it reads as the third
colour in a set rather than as an alarm.

So: a tone where the number is a VERDICT — something is out, something is
waiting, something is over — and neutral where it is a count. One coloured thing
on a screen is louder than four.

## 4 · Designing one screen

Before anything is declared, answer these four in order. They are not a
formality; each one has changed a screen's shape after somebody skipped it.

1. **Who is standing in front of this, and what are they trying to do?** Not
   what the screen shows — what the person came for. The honest answer is
   usually one thing, and the screen's job is to put that thing first and get out
   of the way.
2. **What are they holding, and where are they?** A screen used with two free
   hands at a desk and a screen used one-handed, in gloves, in bad light, on a
   cracked phone are not the same screen. This decides hit targets, contrast and
   where the verb sits — and it is the question most often answered by accident.
3. **What is the one number or fact they came for?** That is the hero. If there
   isn't one, the hero is a title and the screen is a board — which is a real
   answer, not a failure.
4. **What has gone wrong that they need to know about?** Most reference designs
   worth copying are built for calm, unurgent things and have no vocabulary for
   *this is wrong and you must act*. A product with a severity layer has to add
   it deliberately, and it has to be loud enough to survive the calm around it.

---

## 5 · The surface is bigger than the screens

⚠️ **A VIEW, A NOTIFICATION'S DESTINATION, A GUIDE STEP AND A HELP ENTRY ARE ALL
SURFACE FACTS, DECLARED SOMEWHERE ELSE.** Each is a claim that a particular
screen exists and does a particular thing:

- a **view** is the shape of a read chosen for one page to draw;
- a **notification** carries where the row goes when somebody presses it;
- a **guide step** names a screen to go and do the thing on;
- a **help entry** explains one.

The composer is bidirectional on all four: nothing may outlive what it points at,
and nothing may point at what is not there yet. So the four arrive and leave WITH
their screens, one at a time, and a screen is not finished until they do.

⚠️ **AND THE SEVERITY IS RIGHT.** A notification whose destination does not exist
is a row in somebody's inbox, on the day something actually happened, that leads
nowhere — which is worse than never having told them, because after that they
stop trusting the alerts that work.

---

## 6 · Pure logic does not live in a screen

If a rule is true about the thing itself — how a phrase breaks so it fits a
shape, what two figures mean together, when something counts as expired — it
belongs beside the collection it is about, not inside the file that happens to
draw it today.

⚠️ **THE TEST IS WHETHER A SECOND SURFACE WOULD WANT THE SAME ANSWER.** A print
sheet, a preview and a screen all break a phrase the same way; nothing about it
depends on which one is asking. A rule that lives in a screen leaves the tree
with that screen — which is how one gets found, because its own tests break, and
that is the good outcome rather than the bad one.

---

## 7 · The photograph is of the screen, or it is evidence of nothing

A product's screenshots are its design review, its help pages and its marketing,
and they are all the same images, which is what keeps them honest.

⚠️ **SO A SUITE PHOTOGRAPHS WHAT THE PRODUCT DRAWS, THROUGH WHAT DRAWS IT.** A
screen the engine renders from a declaration is photographed through the engine,
from that declaration. A screen that draws itself is photographed from where it
is drawn. The failure this prevents has happened here: a sweep walked a list of
routes and rendered each through the app's own board, so a screen moved to a
declaration went on being photographed as the hand-written file that shared its
name — images of screens no customer could open, filed under the ids of the ones
they could, with every check reporting green.

⚠️ **A PHOTOGRAPH OF THE PREVIOUS DESIGN UNDER THE CURRENT NAME IS WORSE THAN NO
PHOTOGRAPH.** One is a gap somebody fills. The other is evidence somebody trusts.
Every sweep therefore asserts a FLOOR — that it found something to sweep —
because assertions that never ran report exactly as green as assertions that
passed.
