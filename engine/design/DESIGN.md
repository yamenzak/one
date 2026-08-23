# The design language

kind: guide

**Who this is for: a sixty-year-old who runs a business, is not a technical
person, and opened this because something needs doing.** They are competent,
busy, and have never read a manual for anything. They will not explore. They
will not read your paragraph. If they cannot see what to do in about two
seconds they will decide the software is difficult and ask somebody else to do
it — and they will be right, because a screen that needs explaining is a screen
that was designed wrong.

Everything below is downstream of that one person.

---

## 1. The rules, shortest first

Read these as tests you can apply to a screenshot without knowing the codebase.

1. **If it needs explaining, it is wrong.** Explanation is a symptom. Before
   writing a sentence under a control, change the control, the label, or where
   it lives. A screen with no description lines on it at all is normal and good.
2. **One screen, one job.** If you can say "this screen does X *and* Y", it is
   two screens. Six actions and three lists on one page is a filing cabinet, not
   a screen.
3. **Related is not together.** Two things being *about* the same subject does
   not put them on the same screen. Ask who does it, how often, and with what
   authority — those three answers decide where a thing lives, not the topic.
4. **Nothing is capped.** There is no budget on screens, sections, or steps. A
   screen that is cramped because somebody was avoiding a second screen is the
   most common failure in this product's history.
5. **Where would they look first?** Put it there. Not where it is tidy, not
   where the data model says.
6. **Verbs, not nouns; specifics, not categories.** "Invite somebody" not
   "Member management". "Sign out" not "Session". A button says what will happen
   when it is pressed, and the confirmation says it happened.
7. **Never make somebody count.** If the answer is a number, show the number.
8. **The default is safe.** A destructive thing is never the easy one to hit,
   and never a colour on its own.
9. **Never print the value the code branches on.** `eu`, `d1`, `no_tenant`,
   `owner`, `bind`, `seats` — each is a key in a closed set, and each was on a
   screen where a place, a thing, a reason, a role, an act or a limit was meant.
   The name lives beside the set it names (`sayWhere`, `sayKind`, `LANES`), so
   there is one wording and the next reader inherits it; `sentence()` is the
   floor, never the plan.

---

## 2. Language

**Actionable, short, and about them.**

| Instead of | Write |
|---|---|
| "Member management" | "People" |
| "Configure notification preferences" | "How you are told" |
| "No data available" | "Nothing here yet" |
| "This action is irreversible" | "This cannot be undone" |
| "Session terminated successfully" | "Signed out" |

- A label is one to three words. A row's second line, if it exists at all, is
  a **fact** — a state, a count, a date — never an explanation of the row.
- No product vocabulary. Nobody outside the building knows what a *tenant*, an
  *entitlement*, a *sub-processor* or a *shard* is. If the operator console must
  use a word like that, it is the one place allowed, and only because its reader
  built the thing.
- No marketing anywhere inside the product. Somebody already signed in is not
  being sold to.
- No em-dashed compound headings. "Hello — the documents" is two labels wearing
  one; pick the one that varies.
- **A wire value is not copy.** `comfortable`, `past_due`, `hello` are keys. Say
  "Comfortable", "Payment failed", "Hello".

### A date, a time, a number and a price are said in the reader's conventions

**A stored value printed as it is stored is the database's spelling, shown to
somebody who told us how they write one.** `2026-08-01` is a `Day`; what the
reader gets is "1 August 2026", or "01.08.2026", or whatever their account says —
and the same for `1.234,56` against `1,234.56`, for 24-hour against 12, and for
kilograms against pounds.

| Instead of | Write |
|---|---|
| `{of.version}` | `sayDate(shown, of.version, "long")` |
| `` `${n.minutes} min · ${n.at}` `` | `` `${n.minutes} min · ${sayDate(shown, n.at, "short")}` `` |
| `cell: (n) => n.at` | `cell: (n) => <Dated at={n.at} />` |
| `at.toLocaleDateString("en-US")` | `useShown()` and a `say*` |

`kernel/src/present.ts` is the ONLY file that may build an `Intl` formatter or
call a `toLocale*`; everything else goes through `useShown()`, the `say*`
functions, or an element from `said.tsx` (`<Dated>`, `<Clock>`, `<Num>`,
`<Amount>`, `<Size>`). `scripts/present.test.mjs` refuses all four shapes above,
and derives the date-shaped field names from the kernel's own `: Day` and
`: Instant` declarations so the list grows by itself — a hand-kept one had
already stopped covering `version`.

⚠️ **THE ISO SLICE IS THE ONE THAT DOES NOT LOOK LIKE FORMATTING.**
`at.slice(0, 10)` is correct for a database key and wrong for a person: it is
UTC, so it names the wrong day for anybody whose evening is another date. `dayOf`
for a key, `dayIn` for a person.

---

## 3. Where a thing lives

Ask three questions in this order. They resolve nearly every placement argument.

1. **Whose is it?** Mine, my workspace's, or the deployment's. Three different
   authorities, therefore at least three different places. *My* notification
   settings and *the workspace's* notification ceiling are not two halves of one
   screen — they are two operations with different consequences, done by
   different people, at different times.
2. **How often?** Daily things are one tap from where somebody starts. Yearly
   things are two or three taps away and that is correct. Putting a
   twice-a-year setting beside a daily one costs the daily one its prominence.
3. **What does it change?** A screen where every control changes the same kind
   of thing is a screen. A screen where one control changes a price, one changes
   a person's access and one changes a colour is three screens.

**Scale is the test.** Design every list for the customer with six products
and two branches, not the demo with one. A screen that is fine with one product
and unusable with six is a screen that will be rewritten. When there are many of
something, **group by the thing the reader is holding in their head** — the
workspace, the person — and let them descend into it. Do not flatten every
product's settings into one column and repeat the product's name as a heading:
that is a report, not a screen.

**Descend, don't cram.** A row that opens a screen costs one tap. A screen with
everything on it costs a scroll, a scan, and a mistake.

---

## 4. Layout — you do not write one, you name one

### First: the five names, and two of them are not layers

The obvious model is a stack — shell, then ambience, then chrome, then layout,
then components — and it is wrong in a way that matters, because two of those
five are not containers at all. Nothing is ever *inside* the ambience. Nothing is
ever *inside* the chrome. They are **materials**: what a container is made of and
what floats on top of it, and they cut across every level rather than sitting at
one.

**Three containers, and they nest:**

| | What it is | How many per address |
|---|---|---|
| **Page** | the floor: a ground, a tone, and the room a nav needs | **exactly one, always** |
| **Shell** or **Layout** | a Page, dressed — see below | one, and which of the two is the question |
| **Screen** | the shape: width, skeleton, empty state, arrival, where the one action goes | one per Page |

**Two materials, and they cut across:**

| | What it is | Who applies it |
|---|---|---|
| **Ambience** | what a Page's ground is made of — a family, a seed, a density | `Page` and `Band`, and nothing else (guarded) |
| **Chrome** | the treatment on anything floating over a ground — `data-chrome`, `data-capsule`, `data-here` | one stylesheet, read by every control that floats |

So the order is not `shell > ambience > chrome > layout`. It is
**Page → (Shell | Layout) → Screen → components**, with ambience *inside* the
Page and chrome *on top of* whatever floats.

⚠️ **"EXACTLY ONE, ALWAYS" IS A CLAIM THE PAGE HAS TO MAKE, AND IT IS ABOUT THE
INK AND THE TOP EDGE AS MUCH AS THE GROUND.** A page is presented over a product
as often as it is routed to, and a presenting surface is a component with
opinions: HeroUI's modal body is a paragraph's body, so it brings `text-muted`
and three pixels of padding. Both arrive as symptoms nowhere near their cause —
the padding is a strip of the dialog's own ground along the very top of the
screen, which looks exactly like a hem that stops a few pixels short, and the ink
repaints every word that states none of its own, so a workspace's name is right
and the line under it is a dusty grey. The rule is the same one at both ends:
**the surface contributes nothing (`p-0`) and the page states everything** — its
ground, its type and its colour. `presented.seen` measures a real presentation
and asserts the world starts at zero and the quiet line is written in the page's
ink, not the surface's.

### The two crowns, and the one bar

Chrome pins to an edge, and there are three pieces of it — **one component
each**: a **crown** at the top, a **nav** at the bottom, and a **docked action**
where a screen has one. All wear the hem (see [AMBIENCE.md](AMBIENCE.md)), so
none of them needs a plate.

⚠️ **The docked action is declared, never wrapped.** A screen says `does`; the
frame puts it in the crown above `md` where the eye is, docks it below where the
thumb is, and shows exactly one. It was two components — `StickyAction` wrapped
by hand and the bar `Screen` renders — which had already drifted on both things
there were to drift on: one was `max-w-md` and the other took the shape's width,
one showed on a desktop and the other did not. A guard now refuses a hand-rolled
dock, because wrapping one skips the three rules the declaration carries: **no
dock over a skeleton** (a press against data that has not arrived), **none over a
refusal** (the only useful control is "try again"), and **none over an empty
state** that already offers the same words.

⚠️ **A screen has a dock or a nav, never both** — they pin to the same place. So
where there IS a nav, the nav takes the act: `Island.act`, arriving through the
crown socket the screen already publishes itself through. The bar then carries
the destinations as glyphs and the act as the one thing wearing a word, because
the crown says where you are and the bar is at the thumb.

⚠️ **A PINNED BAR THAT TRAVELS MUST CLIP THE TRAVEL, OR THE PAGE MOVES ON ITS
OWN.** A transformed box still counts toward the document's scrollable overflow,
so a `sticky bottom-0` nav translated out of the way makes the page taller by its
own height while it is gone and shorter again when it returns — and at the foot
of a long page that shrink is a CLAMP, so the scroll jumps upward with nobody
touching it. The nav carries `overflow-clip` and the transform sits on the bar
inside it, because clipping cannot help an element against its own transform.
`scripts/motion.test.mjs` refuses the shape. It is invisible until a page is long
enough to reach the bottom of, which is why it shipped.

⚠️ **THAT RULE SURVIVED BEING OVERRIDDEN, WHICH IS THE BEST EVIDENCE FOR IT.**
For one day a product screen rendered both, stacked, the dock lifted onto the nav
to escape its hem. Two floating objects, 180px of an 844px phone, and a content
column reserving room for one of them — so the last row of the last card sat
under the other permanently, at the top of the scroll and still at the bottom of
it. What the rule had been missing was not an exception; it was somewhere for the
act to go.

⚠️ **AND WHAT A PAGE RESERVES FOR A PINNED BAR GROWS WITH THE BAR.** The bar pads
its own bottom by `env(safe-area-inset-bottom)`, so on a phone with a gesture
handle it is taller than it is anywhere a test can see it — headless Chromium
reports a zero inset, and so does every desktop. A reserve written as a flat
number is therefore correct in every measurement this repository can take and
short by exactly the inset on the devices the safe area exists for, which puts
the last row of the last card under a pinned control at the very bottom of the
page. `NAV_SPACE` and `ACTION_SPACE` name the same `env()` the bar does; two
numbers that have to move together should not be two numbers.

**There is one `Crown`, and its shape is its slots.** Three slots, one height:

```
( lead )( middle                        )( also )( does )
```

| slot | what goes in it |
|---|---|
| **lead** | `who` — the account, which opens OneSpace · **or** `back` / `dismiss`. Never both. |
| **middle** | one-line `name` (optionally `collapses`) · **or** `find`, the wide search slot. Never both. |
| **trail** | up to two `also` (bare ink, optionally carrying a `dot`) and one `does` (the only fill up there) |

**And there are two shapes it is ever in.** Everything else was clutter:

| shape | lead | middle | trail | used by |
|---|---|---|---|---|
| **find** | account | search | `also`, `does` | a product's destinations, the shell |
| **name** | back / dismiss | the name, **collapsing** | `also`, `does` | a page, a sub-page, a presented surface |

⚠️ **THE ROW IS ONE HEIGHT AND SO IS EVERY MARK IN IT.** The controls were
already 44px each — matching hit boxes — while the marks inside them were not: a
32px avatar beside a 44px field beside a 44px filled disc is three visual sizes
in a row of four, and that is what "the heights look inconsistent" is. A face is
`FACE_PX.row`, every glyph is `ICON.crown`, and neither changes with the window.

### When there is already a crown above you

A `Shell` draws the product's crown; a `Screen` draws its own. Inside a shell,
both would stack. **Which one wins is decided by whether the screen has a way
out**, because "provides a crown" and "renders a crown" are not the same
question — every `Screen` renders one, so a shell that stood down whenever one
appeared would never draw its own again and the account, the workspace and the
inbox would be gone from every screen in the product.

| the screen | has a way out | what happens |
|---|---|---|
| a **sub-page** — somewhere you *went* | yes | it owns the row: back, its name, its actions. **The product's crown stands down.** The account and the inbox are one tap behind it. |
| a **destination** — somewhere you *are* | no | the product's crown stands. The screen's name becomes a heading in the content, and it hands the crown its **actions**. |

That is what a phone has always done with a pushed view, and it is the only
split under which nothing is lost at either end.

⚠️ **A destination's actions come first in the trail** and the product's fill
what is left. A destination's own acts are what somebody came to the screen to
do; the inbox is always there and can afford to be the one that falls off a full
row. Ordered the other way, a screen with two actions of its own would show
neither.

⚠️ **The rule is `crownFor`, a pure function, and that is deliberate.** Left as a
ternary inside the shell's JSX it is two crowns that have to agree about widths,
hems and the order of a merged trail — checkable only by rendering a shell around
a screen and reading the markup. As a function it is four assertions, and the
publish itself lands in a layout effect so neither crown is ever painted in the
wrong place.

⚠️ **A SECOND LINE AND A SECOND MARK ARE NOT A SHAPE, THEY ARE CLUTTER.** The
shell's crown drew a face, then a product mark, then a workspace name stacked
over a product name — two circles and a paragraph in a 64px row. What a crown
owes is *whose* data this is; which product is the nav underneath, and choosing
between them is OneSpace.

⚠️ **There is no `kind` prop, and that is the point.** What a crown *is* falls
out of what it was handed. A variant enum would be a fifth way of saying the
same thing and the first place the four would start drifting apart again — which
is what they did: `Crown`, `AppCrown`, `PageCrown`'s row and a hand-rolled
`<header>` inside the Shell were one shape written four times, at four heights,
with four answers to what a secondary action looks like.

⚠️ **AND THE MECHANISM IS SEALED, not merely shared.** The chrome has two homes
— `design/src/frame` composes it, `design/src/tokens` holds the numbers and emits
the CSS — and `chrome.test.mjs` refuses five things to everything else: the safe
area, the hem's strength property, the hem's marker, the scroll reading, and the
veil's own depth. Nothing there stops a product looking different; what it stops
is a product ANSWERING those questions again. Each is one line, each looks local,
and each produces two chromes that agree until the day the shared one is retuned
— which is the whole risk, because the geometry is a set of RELATIONSHIPS: the
veil's solid part is the height of the controls standing on that edge, the
hand-off is the heading's box against that same depth, and what a page reserves
for a pinned bar grows by the same `env()` the bar pads by. Every one of those
was got wrong at least once by changing one of the two numbers.

⚠️ **`PageCrown` RETURNS A FRAGMENT, AND THAT IS LOAD-BEARING.** A `sticky`
element travels only within its parent, so a wrapper `div` around the crown and
the title card pinned the row for exactly as long as the card it introduced was
on screen — and then took it away. A header that leaves, on every page that draws
its own crown (the workspace centre, the whole operator console), while the same
component under a `Shell` stayed up for ever because there it is a direct child
of the page. Nothing about the crown differs between the two; only what encloses
it. So nothing may wrap it: a ref, a class, a motion wrapper — each is one line,
each looks harmless, and each un-sticks the row with identical markup and no
symptom until a page is long enough to scroll past its own heading.
`handover.seen` scrolls well past one and asks where the row actually is.

⚠️ **`PageCrown` is `Crown` plus a block, not a second crown.** The row is the
same component; what it adds is the part that is not chrome — the display
heading, the subject's title card, and any scope row under them. A page's name is
both the biggest thing on it and something you still need four screens down, and
one element cannot be both, so the big one lives in the content and the crown
carries the compact copy that replaces it once it has scrolled away.

⚠️ **The hand-off is ONE crossing, it is a POSITION rather than a distance, and
the thing measured is the HEADING.** Every version of this that failed measured a
fraction of something that is not what is being handed over — 56px flat, 62% of
the block, 85% of the card, then the name's whole block. The block is the
instructive one: it includes the line under the name and the block's own bottom
padding, so on a recording of the live screen the crown waited about 150px of
scroll after the heading itself had gone, and the product had no name anywhere
for two seconds.

What is actually being asked is whether the name has reached the thing about to
hide it, which is one rect against another and has no fraction in it: the
heading's box against the veil at the top of the page. The line is
`max(crown height, HEM_HOLD)` — the hem is what removes a heading and the crown's
row is drawn on top of it, and they differ, because a crown grows with the safe
area under a notch and the veil does not. The block asks it once and hands the
answer to the crown as `carried`; the crown reads that and nothing else, because
with both of them answering separately the small name arrived at 45px while the
planet was still filling the page. What travels is the SUBJECT, face and all —
and only the name fades, because fading the whole card takes the picture out in
front of somebody still looking at it.

⚠️ **And the rule that actually holds is about the OUTCOME, not the mechanism**
(`handover.seen`): scrolling a page about a named thing, the name is either on
the page or in the crown, and there is no moment where it is in neither. Two
mechanisms passed their own tests while failing that.

⚠️ **`find` is a typed declaration, not children**, for the reason `who` is: the
widest, most-seen element in the product is exactly the one that otherwise
becomes whatever the third caller needed that afternoon.

### Shell and Layout are siblings, not levels

This is the answer to "does every screen get a layout, even a full-screen
modal?" — **yes, every address gets a Page, and there are exactly two ways to
dress one:**

- **`Layout`** — a Page with a SUBJECT (or a material) and a frame. Used where an
  address stands on its own: OneSpace, a full-screen surface, a sheet promoted to
  a page, a door. **It has no nav, because most addresses are not destinations.**
- **`Shell`** — a Page with a product's chrome: the crown, the desktop sidebar,
  and the island over five destinations. Used where an address is one of a
  product's screens.

**Five is what the island HOLDS, not what a product may have (D46).** An app with
more destinations than that spends the fifth slot on the way to the rest: a
destination-shaped item wearing the app's own mark, which opens and says WHICH
place you are in when you are inside one — so the bar answers "where am I" from
every screen rather than going blank past the fourth. It is never labelled More.
Read the rule as a fact about thumbs, because that is all it ever was; read it as
a fact about products and a third of an app ends up reachable on a desktop alone,
which is what happened.

Both render `Page`. Neither wraps the other, and an address gets one of them —
which is why a full-screen modal is a `Layout` with no nav rather than a Shell
with its nav suppressed. Suppression is where a nav that should not be there
comes back.

⚠️ **`Shell` did NOT render `Page` until the commit that added this section.** It
called `worldCss` and hand-rendered its own field element — the same picture by a
second route, so it got the ground and would have missed everything `Page` learns
next. `NAV_SPACE`, the tone stamp and the reduced-motion opt-out already lived on
`Page` and none of them reached the chrome around every product's screens. The
`mount:` check in `scripts/scene.test.mjs` is what makes that a test failure
rather than a thing somebody notices a year later.

### Why ambience is not a level

A level is something you enter. You cannot enter the ambience — a screen never
says "put me inside the world", it says **`sky="cloth"`** or **`subject={face}`**
and the Page it is already inside changes what it is made of. The engine
(`design/src/scene`) turns that into a ground, a field and a veil; `Page` mounts all
three. That is why the guard names exactly two mounters: a third would be a
second version of the material with no file that is wrong.

### Why chrome is not a level either

Chrome is what a control wears when it floats over a ground it does not control:
the back chip, the compact title, the crown's actions, the nav island. It is a
`data-` attribute and one stylesheet rule, so **both** Shell and Layout draw
chrome and neither owns it. Making it a level would mean a "chrome layer" between
the page and its content — which is a plate across the top of every screen, and
that is the exact thing the glass pass removed.


**A screen declares what KIND of page it is and hands over its content.** That
is the whole of the layout system, and it exists because the alternative was
measured: twenty screens each hand-assembling the same five decisions — column
width, waiting skeleton, what "nothing here" says, how blocks arrive, and where
the one action goes — and every one of them getting four right and one wrong.
Nobody can point at the file that is wrong, because none of them is. The product
is wrong in aggregate, and the only fix that holds is to stop asking.

```tsx
<Screen
  shape="list"
  does={{ label: "Invite somebody", onDo: open }}
  of={members.of} again={members.again}
  nothing={{ says: "Nobody here yet", under: "An invitation arrives by email" }}
  then={(data) => <Listing … />}
/>
```

Everything else is decided: the width, the skeleton, the stack and its gaps, the
arrival stagger, the crown and its collapse, and where "Invite somebody" lands
at each size. The screen's author chose a shape and wrote the content.

### The page around it names a SUBJECT, or a material

One level out, `Layout` is what a router renders for an address — the ground, the
frame and the screen inside it:

```tsx
<Layout sky="cloth" subject={placeFace(slug)} frame={{ title, under, back }}>
```

**`subject` is the one thing this page is about, and it decides three things at
once**: the ground becomes that subject's own world, the crown becomes a title
card wearing its face rather than a heading with a thumbnail over it, and the
density becomes an arrival's rather than a working screen's. Absent, the page
wears a named material and its crown is an ordinary display heading.

**Which world follows from what the subject IS.** A workspace's face is a planet,
so its ground is `space` seen large — somewhere you look at from outside. A
person's face is a mood, so theirs is an `aura`: light with no horizon in it,
which is what standing in somebody's own place looks like rather than visiting
it. A product is a SYSTEM, so it gets `loops` — a lattice that re-routes itself.
The deployment is what all of them are inside, so it gets `blobs`, which has no
grid at all. Nothing picks this; `worldFor` reads the kind off the face.

**And a page with no subject names a FAMILY, not a picture.** `glow`, `cloth` or
`etch`, plus a `seedling` — so two screens naming the same one are two grounds of
one material rather than the same background twice. There is no list of
twenty-four named ambiences any more; there is an engine.

⚠️ **Three consequences of one fact, and that is the point.** They used to be
three expressions in the router deriving from the same slug, each of which had to
agree with the other two and none of which could tell when it did not. See
[AMBIENCE.md](AMBIENCE.md) for what a world is made of and why the halo over a
title is derived rather than chosen.

### The eight shapes

| Shape | The page is about | Primary action |
|---|---|---|
| `list` | a collection somebody scans and adds to | usually "add one of these" |
| `detail` | one subject and its facts | usually the thing you do TO it |
| `figure` | one number, everything else supporting it | often none — a figure is read |
| `board` | destinations or measures as tiles, some wider | often none |
| `settings` | many independent controls, each saving itself | **refused** — see below |
| `form` | a sequence of fields and one submit | the submit |
| `reader` | prose — a policy, a document | often "accept" |
| `decision` | one object, one choice | the choice |

They are kinds of PURPOSE, not kinds of arrangement. "Two columns" is not a
shape; it is a consequence, and naming consequences is how a preset system
becomes a second CSS with worse names.

**Two of the eight have no screen on them yet — `form` and `reader` — and that
is deliberate rather than an oversight.** Everywhere else in this system an
unused thing is a smell (an ambience no row wants is wallpaper), and the reason
this is different is what a shape IS: somewhere for the *next* screen to land. A
table a screen's author cannot find their page in is one they opt out of, and
the screen after that is hand-built with the whole argument re-run. Six is the
floor the guard enforces; a ninth needs a page nobody could file today.

**A door is not a screen.** The sign-in, the signpost and the setup wizard have
no router above them and nowhere to go back to — a crown there is a control
that closes onto a backdrop. They keep `Arrival`, and the guard exempts them by
name.

**A `settings` screen cannot have a primary action, and that is the most useful
row in the table.** Every control on one saves itself the moment it changes
(`useAction`, `useConfirmedState`). A Save button beside them makes it a screen
where half the controls save themselves and half do not, and nobody can tell
which by looking. The shape refuses it; a guard catches it before it runs.

### Where the primary action goes

**Never at the foot of the content.** The roster shipped "Invite somebody" as
the last row of the roster. With three members that is fine. With thirty it is
invisible: whoever is at the bottom of a long page scrolls to the top to act, or
whoever is at the top scrolls to the bottom, and which of the two happens was
never decided by anybody.

It lands in three places and the shape picks between them:

- **Phone** — docked above the thumb, at the bottom of the viewport on a short
  page and the bottom of the scroll on a long one.
- **Desktop** — in the crown, labelled, where the eye already is.
- **Empty screen** — inside the empty state, and the dock stands down. Two
  copies of the same button on a page with nothing else on it is the fault the
  whole system exists to remove.

**The action appears when there is something to act on.** No dock over a
skeleton — a press against data that has not arrived. None over a refusal — the
only useful control is "try again", and it is in the refusal where the
explanation is. None over an empty state, which already carries it.

### One screen, one primary, two secondaries at most

Not a style rule — a definition. A page with two things it is for is two pages,
and the moment a second `does` would be needed the right edit is a second screen
or a sheet. `also` is for the two or three things somebody might reach for
*while* doing the primary one, and it is capped in the type.

### Five outcomes, not four

`waiting`, `nothing`, `trouble`, the content — and **`refused`**. "You may not
see this" is a fact about the person, known before any request is made; a
`Problem` is a fact about a request that failed. Five screens used to answer it
with a bare sentence returned EARLY, above the frame, which took the crown with
it: no title, no way back, a sentence alone on a page. A refusal is content.

### The skeleton is this screen, not this shape

A shape's placeholder stands in for every screen that names the shape, and eight
shapes cover twenty-odd screens — so a console page of three headed cards
holding one, two and no rows waited behind one un-headed card of four rows with
a face on each. Right vocabulary, wrong drawing, and it is the exact fault a
skeleton exists to prevent: the content lands and every block is somewhere else.

**So it is measured.** `useRecalledShape` reads the real DOM after the real
render — per top-level block, the heading's height, the row count and the
block's height — keeps it under the address, and draws that on the next visit.
Nothing is declared per screen and nothing is derived from source: a declaration
goes stale the first time a card is added, and no script can predict how a
component composes.

**And the FIRST visit is measured too, somewhere else.** `shots.mjs` already
drives every surface in a real browser holding real data, so it reads back what
`useRecalledShape` measured and writes `one-space/src/shapes.ts`. A screen
nobody has opened on this device starts from what that screen actually drew
rather than from its shape's generic preset, and `recall` still replaces it on
the first render after arrival — so a screen changed since the harness last ran
costs one frame of slightly-wrong bars, never a wrong drawing that persists. A
key holding a generated id is a failure: an address is starred at the varying
segment (`/space/w/*/brand`) or it matches nothing on anybody else's account.

- **The heading is a HEIGHT, never a boolean.** A name with a line under it and
  a name without are twenty pixels apart, and a bar drawn at the wrong one moves
  the card beneath it.
- **The block is drawn at exactly the height it was, and clipped to it.**
  Everything inside is an approximation, and approximations compose into a
  column sixty pixels short — which is the jump again, arriving by way of the
  fix.

### A component draws its own placeholder

`recall` is for the PAGE. Inside it, the pieces draw themselves: a component
under `Waiting` returns its own bars, from its own container, its own classes and
its own tokens, in its own file. Nothing is passed down — the flag is read from
context, because a prop means every list, row and grid on a waiting screen has to
be handed the same value by whoever composed it, which is twenty places to forget.

**A skeleton written BESIDE a component is a copy of its measurements, and copies
drift.** Both of the ones this replaced had. `TilesWaiting` laid its grid out at
`minmax(min(8rem, 100%), 1fr)` against `TileGrid`'s `min(6rem, 45%)`: measured at
390 with six tiles, the real thing is 236px in three columns and the placeholder
was 360px in two — half a screen taller, in the wrong shape, so the page jumped
124px when the content landed. That is the whole fault a skeleton exists to
prevent, wearing the fix's clothes. `RowsWaiting` was 24px short over three rows
because a bar drawn at `h-4` is shorter than the line box it stands in; a bar is
`1lh` now, which is the line it actually sits in and stays right if a role's size
ever changes.

- **The count is the one thing bones cannot know**, so it is the only thing
  passed as data. What is IN each item is the component's business; how many
  there are is the caller's.
- **A screen's placeholder is then composition, not a drawing.** Wrapping a real
  tree in `Waiting` gives back that tree's layout with every leaf as bones — the
  spacing, the widths and the wrapping are the screen's own, which is exactly
  what nobody can copy correctly by hand.
- ⚠️ **It is not a way to draw a screen with no data.** Half a screen's structure
  is a function of what it fetched — rows come from a `map`, blocks from a
  condition — so a real tree rendered with nothing is a shorter, emptier page
  than the real one. That is the jump again. Pieces get bones; the page gets
  `recall`.

`design/test/bones.seen.test.tsx` measures the pair in a browser at two widths and
fails on a difference in height OR in `gridTemplateColumns` — the column count is
the half a height check misses, and it is the half that was wrong.

### Three kinds of motion, and a product with a fourth has none

Everything that moves in this product is one of exactly three things, and the
list is closed:

| Kind | What it is | Where it comes from |
|---|---|---|
| **Arriving** | content entering a screen | HeroUI's `enter` keyframe |
| **Changing** | a value, a state, an open/close | a transition on a `MOTION` token |
| **Waiting** | the answer is not here yet | the library's `Skeleton` / `Spinner` |

A fourth is not built deliberately. It accretes one defensible `animation:` at a
time — each correct where it was written, and together a jungle nobody chose. So
the three are the vocabulary and a screen writes none of them: `motion.ts`,
`ambience.ts` and `charts.tsx` are the only files that may define a keyframe, and
the `states` guard fails on an `animation:` anywhere else.

Every keyframe is switched off both ways under `prefers-reduced-motion` — not
softened, answered — and no pinned element may travel in a way that changes the
page's height. Both are `motion`'s.

⚠️ **AND A TRANSITION IS THE ARRIVAL, NOT A FOURTH THING ON TOP OF IT.** See
below: while a page is travelling, nothing inside it arrives separately.

### Going from one screen to the next

**Two mechanisms, and no screen declares either.** The ROUTE decides direction:
descending into an address slides the screen away to the left and brings the
next in from the right, going up mirrors it, and a sibling counts as forward
because it is somebody choosing to go somewhere. The AMBIENCE decides the
gesture: within one family the two grounds cross-fade while the page slides —
the same place from a different position — and crossing into another family does
not slide at all, it opens on a scale, because a place has no direction.

- **The direction is a fact about the two addresses**, not about the history
  stack: the crown's back arrow is a `pushState` like any other. The phone's
  back gesture is answered from a step number kept in `history.state`, because a
  `popstate` says the address changed and never says which way.
- **The world is read off the DOM**, before the swap and again after it. Written
  as a prop, every router would have to know every ambience family — and a
  family nobody added to that list would transition wrongly, silently.
- **The world cross-fades in place and only the column slides**, which is what
  makes it continuous: two screens of one family are two seeds of one material,
  so dissolving one into the other while the column moves over it reads as the
  same place from a different position. Translating the root moved the ground
  with the page, which is the same picture sliding.
- **It is the browser's own view transition**, which is the only way the screen
  somebody is LEAVING exists at all: React has replaced it before any animation
  could run, and keeping the old tree mounted means a second copy of a screen,
  its scene and its requests for a quarter of a second.
- ⚠️ **THE ROOT HAS TO BE GIVEN ITS NAME BACK.** `@heroui/styles` ships
  `:root { view-transition-name: none }` so its toast queue does not capture the
  page. With no name there is no `root` group at all — the transition runs,
  captures nothing, and the swap is a hard cut, with every rule attached to an
  element the browser never created. `:root[data-travel]` names it for the length
  of a page change and leaves it nameless otherwise.
- ⚠️ **AND WHILE A PAGE IS TRAVELLING, NOTHING INSIDE IT ARRIVES SEPARATELY.**
  This is the whole of "one engine". The block stagger, a chart drawing itself
  and a mark playing its character are each correct on mount and are four
  entrances at once on top of a transition. The transition IS the arrival: what
  moves is the content column, once, as one thing.

### Within the shape

Use the whole width. A phone is one column, a desktop is not — `Grid`, `Columns`
and `Split` exist and are under-used, and `board` widens the page for them. Two
figures that answer one question belong side by side, not stacked with a gap.

**But a grid of two on a phone is not width, it is halves.** `Grid` takes a
`min`, so the column count follows what the content needs to be readable and
collapses to one when it cannot have it. A grid with a fixed column count says
"two, whatever that is worth here" — measured on the shard screen, it was 190
pixels a tile: a label wrapped onto three lines and no two tiles were the same
height. Several bars stacked in ONE card compare better than several cards
holding one bar each, because they start at the same x and are the same width.

**A card holds one kind of thing.** A fact you can change as the first row of a
five-row menu makes the reader read each row to find out which it is. Two cards
with a gap between them already say "these are different kinds of thing", which
is why a `Group`'s label is optional.

**Peer blocks are cards, not sections.** A `Section` heading is nearly as loud as
the screen's own title, so four of them stacked reads as four pages rather than
one screen — and on the infrastructure screen the two blocks with a deadline on
them were third and fourth. What happens NOW goes above what is merely true, and
a block that only exists while something is happening (a workspace being copied)
goes first or not at all.

**A column of amounts shares a right edge, or it is not a column.** Everything
after a row's growing label is packed to the right, so a marker on one row in
four pushes that row's amount left by its own width. `AmountRow.mark` is the slot
for a state marker and sits BEFORE the amount; `aside` stays after it and stays a
control, because a control is on every row of its list or on none.

**A finder appears once there is something to find.** `Listing.find` is
permission rather than an instruction: over five rows a labelled search box is
taller than two of the rows it filters, at the top of a screen where everything
is already visible. The component decides, because a screen cannot know how many
rows a deployment will have.

**Density is a decision.** Not everything is a full-width row. A count belongs in
the corner of the row it counts. A rarely-used action belongs in a menu on the
block it acts on. Three related toggles are a `ToggleButtonGroup`, not three
rows.

**Never wrap a single control in a card.** A card is a container for a *group*.
One button inside a card is a button with a box drawn round it — put it where it
belongs: in the crown, at the end of the row it acts on, or under the block it
finishes.

**And never put a card inside a card.** Not a style rule — an arithmetic one.
Every card is `CARD_ROWS` (`px-4 py-3`) and every row is `ROW.pad` (`py-3`), so
the space from the card's edge to its first line is 12 + 12 = 24, exactly what
sits between two rows. Two cards make it 48, and because they are the same
colour what somebody SEES is one card whose first row starts twice as far down
as every other card in the product — which reads as a spacing fault in the row.
It shipped on the legal screen for exactly that reason, with every suite green.

⚠️ **IT IS THE LIBRARY'S PROBLEM, NOT THE SCREEN'S, BECAUSE IT ARRIVES FROM TWO
CORRECT DECISIONS.** A rendered list owns a `Group` so it can stand on a screen
alone; a screen owns a `Group` so it can head the block. Neither is wrong and
their composition is the defect, so a nested `Group` now renders its rows into
the card it is already in. It stands down rather than throwing because the
nestings this codebase actually has are a waiting state or a rendered list inside
a card — `RowsWaiting` under an `Await`, a `Listing` inside a section — and each
of those wants precisely that.

**Charts are part of the vocabulary and are barely used.** `@engine/design/chart`
ships nine chart forms, five figure blocks and four round ones, with the rule for
picking between them written at the top of the file. Anywhere the product shows a
trend, a share, or a ratio against a limit as a number in text, it is throwing
away the one thing that reads instantly.

---

## 5. Controls: which one, and where

| The thing | The control | Where it goes |
|---|---|---|
| On or off | `ToggleRow` | The row, switch at the end |
| One of two or three | `ToggleButtonGroup` | At the end of the row |
| One of many | `Select` | At the end of the row |
| A value to type | `ControlRow` + bare field | At the end of the row |
| Something that opens | `NavRow` | The whole row, chevron at the end |
| The screen's main action | `does` on the `Screen` | The shape decides — §4 |
| A rare action on a block | A menu (`⋯`) | The block's corner |
| Something destructive | `ActionRow tone="danger"` | Its own card, last |

**A card that offers an act says so with a button** — `Group.does`. `ActionRow`
carries no chevron by design, because it does something rather than going
somewhere, so its whole affordance is the danger tone: right for "Sign out",
and for a neutral act it is an ordinary row of words with nothing saying it can
be pressed. "Take a copy" shipped that way directly above "Delete everything",
which offers its act as a button.

**A disclosure reads as a row.** A full-width button centres its content, so
`Reveal`'s trigger sat in the middle of a card whose every other row began at
the inset. Name on the left, chevron on the right, flush — which is what the
accordion beside it already did.

**An icon replaces a word only when the icon is unambiguous** — close, back,
more, add. Everything else gets the word. An icon-only button that needs a
tooltip to be understood has failed; a tooltip is for a shortcut, not for a
meaning.

**A count is a chip in the corner of the row it belongs to**, never a sentence.
Zero is not a chip — zero is nothing at all.

**There is no line between rows.** Rows in a card are separated by rhythm: 24px
between two rows against 4px inside one, and a six-to-one ratio already says
"these two lines are one thing and that is another". The hairline was the last
edge in a product that banned borders and shadows everywhere else, and it was
asymmetric — inset past the glyph on the left, flush to the card on the right —
which is what made every list look hand-assembled.

**A press is the card's width, not the text's.** A row is `px-0` because the card
owns the gutter, so a pressed fill drawn on the row stopped 16px short of the
card on both sides — a shape floating INSIDE the card with no relationship to it,
which is what "it sticks to the content" describes. `ROW.press` pulls the fill
back out to the card's own edges. Note the two things that make it work and are
each one edit from being wrong: the row must DROP `w-full` (it wins on the same
property at the same specificity, so the negative margin shifts the row left
instead of widening it), and the width is spelled `w-[calc(100%_+_2rem)]` because
CSS needs whitespace around the `+` and Tailwind spells that `_`.

### Every mark animates, and it animates as its purpose

**A bell rings by its clapper. A calendar turns its days over. Leaving is the
arrow leaving, and the door stays put.** A rotate, a nudge or a scale on the
whole glyph is the cheap version and it shows: rotating a bell is a picture of a
bell being moved, not a bell ringing. The motion is in the icon's PARTS, at
`DURATION.stately`, and no amount of easing on the outside produces it.

- **The registry is the only door.** `glyphOf(name)` wraps every mark in `Glyph`,
  which carries the character and both reduced-motion opt-outs. A component
  importing an icon straight from lucide gets none of that, and gets it silently
   — the difference is only visible to somebody who presses it.
- **Every mark is accounted for.** A name with an entry in `LIVELY` moves; one in
  `STILL` deliberately does not. A mark in neither is indistinguishable from one
  somebody forgot, so `scripts/glyphs.test.mjs` refuses it.
- **A mark whose motion is inside it is drawn here.** `parts/marks.tsx` — 24×24,
  `currentColor`, stroke 2, round caps, the same skeleton lucide uses, with the
  moving parts named by `data-part`. Selecting `svg > path:nth-child(2)` animates
  whatever the library happens to put second and silently animates the wrong
  thing the day it redraws the icon.

### A reported state wears `data-ink`, and nothing else carries a tone

A monochrome product has one channel left for "this is the one that is wrong",
and it is the colour of the VALUE — the amount, the sentence, the figure. So a
`Tone` lands on the thing that says it: `data-ink="danger"` on the span, styled
once in `TONE_CSS`. `neutral` has no rule on purpose; it is the ink the row
already has.

⚠️ **A CARD, A PAGE AND A BAND TOOK A `tone` AND ALL THREE ARE GONE.** A tone on
a card paints every word inside it, which is not what any of them meant — and
none of them was ever passed one. What they had instead was `data-tone`, stamped
in seven places and styled in none: measured in a browser, `danger` and
`neutral` computed to the same colour, so a failed nightly job drew in exactly
the grey a successful one drew in. `scripts/attrs.test.mjs` refuses that shape
now.

⚠️ **AND IT IS AN ATTRIBUTE RATHER THAN A UTILITY CLASS FOR A REASON.**
`text-danger` works because something in the product uses it; `text-warning` and
`text-success` generate no CSS at all, because Tailwind emits only what it finds
written down. A component reaching for a utility that does not exist is the same
silence one level down.

**A neutral chip must not out-shout a toned one.** Measured in the dark theme,
the library's `default` chip label computes to white — so on a list of nightly
jobs the cadence ("Daily") was brighter than the job's name and brighter than the
red line saying its last run failed. A chip is an annotation; a neutral one is by
definition the case with nothing to report, so it takes the ink a quiet line
takes (`NEUTRAL_CHIP`). The toned chips are untouched: being louder than the
neutral is the whole of their job.

**A card's verdict is the one line that wears a tone.** `Group.under` takes a
node for exactly this — "a key with no signing secret takes money and never
hears that it landed" is about the whole card, and the rows under it stay grey.
Four toned lines in one card is a card with no verdict in it.

**One hue is a convention rather than a choice, and it is the seal.** This theme
is monochrome — `info` resolves to a grey — so a "verified" tick drawn in the
theme's own colours is the same value as the words beside it and reads as
decoration. `AgreedMark` carries its own blue, in one place, because verified is
blue everywhere anybody has seen it. If a second thing ever needs it, that is
when it becomes a token; not before.

### Faces

**A person, a workspace and a product each have one face, and it comes from one
resolver.** `<Face of={whoFace(accountId)} />`, `placeFace(slug)`,
`appFace(id, mark)` — nothing else draws an avatar, and a guard says so.

|  | What is drawn | Why |
|---|---|---|
| A person | an animated mood | a face is what people recognise each other by |
| A workspace | an animated planet | a workspace is its own world, seen from outside |
| A product | the glyph its manifest declared | a generated mark would read as a logo nobody chose |
| One | the framework's four-cell plate | the deployment is not one of the products in it |

**A product wears its plate wherever it is a row, a card or a section** — the
crown, the switcher, the chooser, the bill, every per-product console. Never as a
bare `{app.mark}`: a glyph dropped into JSX is a character somebody typed, with
no ground under it and a different optical weight from every face beside it. A
guard refuses it. In prose — "Hello · owner" under a workspace's name — a product
stays a word, because a mark inside a sentence is a second lead in a row that
already has one.

Three things follow from that and are decided for you.

- **A seed is an identity, never a label.** The resolvers take an account id and
  a slug because both outlive every edit; seeding on a name or an email gives
  somebody a new face the day they fix their spelling. This is the payoff of
  accounts living under the deployment rather than under each workspace — one
  person, one face, in every workspace and every product.
- **The size decides the movement.** A breathing face reads as alive at 40px and
  as a twitch at 32px, so a `chip` is still and a `row` is not. Nobody passes a
  flag. Under reduced motion every face is still, and that has to be a different
  PICTURE — the animation lives inside the SVG, where no stylesheet of ours
  reaches.
- **Absent is a real answer.** An invitation nobody has claimed has no account.
  It gets the initial, because a face for somebody who has not arrived yet is a
  picture of nobody.

**And a workspace's screen is its planet's sky, with the planet as the screen.**
Opening one puts you on the world its face showed — same deep, its own stars —
and the world is drawn at the size of the page with the name across it. A page
about one named thing that has a picture of itself does not want a heading above
a thumbnail; that is a caption over an icon. The picture at the size of the
screen with the name on it is a title card, and it is the composition that says
"here" rather than "about here".

Only the arrival: its People, Money and Settings keep OneSpace's working material,
because an arrival nobody leaves is not an arrival. See
[`AMBIENCE.md`](AMBIENCE.md) — the four subject families.

### Two faces, and the split is the oldest one in typography

A text face is drawn to disappear at 16px over many lines; a display face is
drawn to be looked at, once, large. One face doing both is the compromise every
design system starts with and every distinctive one leaves.

- **Headings wear the mark** — `wordmark`, `display`, `title`, `section`,
  `figure`. Onest: squared bowls, tight apertures, a high x-height, so a word at
  44px locks into one shape rather than reading as a row of letters. It also
  rhymes with the interface's own geometry, where every plate and card is a
  squircle.
- **Running text wears the text face** — `body`, `label`, `note`. Geist, as
  before.
- **The mark's fallback is the text face, never a system one.** A heading in
  Geist because the display file has not arrived is the product looking like
  itself at a slightly different weight; a heading in whatever the device serves
  is a face nobody chose, at the largest size on the screen.

⚠️ **A HERO HAS TO WIN AGAINST A SECTION NAME AT THE GUTTER, WHICH IS A HARDER
FIGHT THAN THE RATIO SUGGESTS.** `display` is centred and captioned above and
below in the quiet ink; `section` is bold, full contrast, and sits where the eye
starts a line. At twice the size the number still lost the screen — the first
thing anybody's eye landed on was the heading below it. `display` is 3.25rem on a
phone and 3.75 on a desktop, and the rule that got it there is **mass, not
multiple**.

**A break between two runs is a second CARD.** That is how the workspace screen
separates what you come back to from what you set up once, and how the account
screen separates the two places that are yours from the way out. Two cards read
as two things because they ARE two things, at every size, with nothing to align
to anything.

---

## 6. Rhythm

Vary the block. A screen of five identical cards has no shape; a screen with a
figure, then a group of rows, then a quiet note has a beginning, a middle and an
end. Reach for a different block when the *content* is a different kind of
thing, not to be interesting — but notice when three blocks in a row are the
same and ask whether they are really the same kind of thing.

Air is structural. `roomy` between kinds of thing, `snug` within one. A heading
belongs to what is under it, never floating equidistant between two blocks.

⚠️ **One ladder — 4 / 8 / 12 / 24 / 40 — and a heading's own air is a rung of it,
not a number near one.** A hero and a title card both take `airy` below;
sections take `roomy` between them. They were 32 against a section's 24 for a
while, which is close enough that nothing looked wrong and far enough that
nothing looked decided — and the answer to "why this much" was nobody. Whether a
hero has *enough* air is taste and will move again; that its air is a step of the
same ladder is structure, and `metrics.test.mjs` asks only the second question.

⚠️ **And a hero and a title card take the SAME rung**, because they are one block
on two kinds of screen. Two numbers for one idea is how a product ends up with a
roomier home page than its own detail pages for no reason anybody chose.

---

## 7. The checks a screen has to pass

Before a screen is done, look at a screenshot of it at phone width and answer:

- [ ] What is this screen for? One sentence, no "and".
- [ ] What can I do here? If more than about three kinds of thing, split it.
- [ ] Is any sentence on it explaining a control? Fix the control.
- [ ] Would this still work with six products and forty people?
- [ ] Is there a single control wrapped in a card?
- [ ] Is every heading earning its line? (One of something needs no heading.)
- [ ] Does it look different from the screen before it?
- [ ] Is there a number here that should be a chart, or a chart that should be
      a number?
- [ ] Would a sixty-year-old who has never seen it know what to press?

---

## 8. Where the rules are enforced

Some of this is guarded and some is judgement. What is checked today:

<!-- generated: node scripts/enforced.mjs -->
- `attrs` — every `data-` attribute the markup stamps is read by a selector, a Tailwind variant or a DOM query.
- `cards` — only `surfaces.tsx` builds a `<Card`, and every one names `CARD_ROWS`, so a card's inset is one number rather than a component's opinion.
- `chrome` — one crown, one foot, and nothing else pinned to an edge — the head carries slots, the foot carries the navigation or the one act.
- `descend` — a settings page is a declared destination, a level lists its pages rather than stacking them, and an authority is a screen rather than a tab.
- `doors` — a screen the account door renders decides for itself which door it is on, in its own file.
- `edit` — outside a form, a generic surface shows a value and a way to change it, never the control itself.
- `face` — one resolver draws every face, and a seed is an identity rather than a label.
- `fixture` — the test ground is never mounted, never sold and never loaded by a browser.
- `gates` — a gate the kernel can apply is never handed a constant — every input the check reads is resolved per request.
- `glyphs` — every mark in the registry is animated or deliberately still, and no screen draws a registered mark itself.
- `ground` — no borders, no shadows, one monochrome interface and one coloured data.
- `heroui` — no component is restyled — layout utilities and tokens only.
- `metrics` — one source for every measurement: no screen picks its own padding, gap or tap target, and a pressable row has a floor under it.
- `motion` — one set of curves and roles, reduced motion answered both ways, and no pinned element whose travel changes the page's height.
- `present` — one formatter, one store, and every reader is the person reading.
- `problem` — every refusal comes from a catalogue, and one naming an input is rendered on that input.
- `rhythm` — one rhythm per container, and a screen's is the DOM's rather than a walk over React children.
- `scene` — seeded, compositor-only, masked rather than washed, sized by area, bound rather than built.
- `shape` — every screen declares one, the shape places the action, and no screen draws its own crown or pins its own dock.
- `showcase` — everything this package ships is drawn somewhere, or the reason it is not is written down.
- `space` — one API door, one door classifier, and no screen that is never drawn.
- `states` — four outcomes, a placeholder the component draws itself, three kinds of motion, one rhythm.
- `surface` — every declaration reaches a screen, and every field kind has a control.
- `tone` — one voice — label length, description length, sentence case, full stops.
- `travel` — the route decides the direction and the world decides the gesture; nothing else moves the page.
<!-- /generated -->

⚠️ **THAT LIST IS GENERATED, AND IT IS GENERATED BECAUSE IT HAD DRIFTED.** It was
typed by hand for months and five guards were missing from it — the sharpest
being `metrics`, which holds card padding, the spacing scale, the page gutter and
the floor under a pressable row. So the section answering "is spacing enforced?"
did not mention the guard enforcing spacing, and somebody reading it to decide
whether they could pick their own padding would have concluded that they could.
Each sentence now lives in its own guard's header as an `@design` line, so adding
a guard and describing it are one edit in one file, and a guard that draws the
interface and carries no line REFUSES to generate rather than being left out.

What is **not** checked, and is therefore on the person writing the screen:
placement, density, whether a screen is doing two jobs, and whether the reader
would have looked here. Those are §3 and §7, and they are the ones that make the
difference between a product and a filing cabinet.

⚠️ **§3 was prose for months and the generated settings screen broke it** — one
column of every declared row, carded by a free-text heading, holding a switch, a
colour and an email address. A rule nothing can check is a rule that survives
only where somebody happened to remember it, so the parts of §3 that ARE
mechanical now have a guard, and `descend` is that guard. The parts that are
judgement stay judgement; the difference is that the judgement is now about
screens somebody wrote, not about the ones the platform generates.
