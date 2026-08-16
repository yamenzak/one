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
- No em-dashed compound headings. "Kova — the documents" is two labels wearing
  one; pick the one that varies.
- **A wire value is not copy.** `comfortable`, `past_due`, `kova` are keys. Say
  "Comfortable", "Payment failed", "Kova".

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

⚠️ **A screen has a dock or a nav, never both** — they pin to the same place.

**There is one `Crown`, and its shape is its slots.** Three slots, one height:

```
( lead )( middle                        )( also )( does )
```

| slot | what goes in it |
|---|---|
| **lead** | `who` — the account, which opens the hub · **or** `back` / `dismiss`. Never both. |
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
between them is the hub.

⚠️ **There is no `kind` prop, and that is the point.** What a crown *is* falls
out of what it was handed. A variant enum would be a fifth way of saying the
same thing and the first place the four would start drifting apart again — which
is what they did: `Crown`, `AppCrown`, `PageCrown`'s row and a hand-rolled
`<header>` inside the Shell were one shape written four times, at four heights,
with four answers to what a secondary action looks like.

⚠️ **`PageCrown` is `Crown` plus a block, not a second crown.** The row is the
same component; what it adds is the part that is not chrome — the display
heading, the subject's title card, and any scope row under them. A page's name is
both the biggest thing on it and something you still need four screens down, and
one element cannot be both, so the big one lives in the content and the crown
carries the compact copy that replaces it once it has scrolled away.

⚠️ **`find` is a typed declaration, not children**, for the reason `who` is: the
widest, most-seen element in the product is exactly the one that otherwise
becomes whatever the third caller needed that afternoon.

### Shell and Layout are siblings, not levels

This is the answer to "does every screen get a layout, even a full-screen
modal?" — **yes, every address gets a Page, and there are exactly two ways to
dress one:**

- **`Layout`** — a Page with a SUBJECT (or a material) and a frame. Used where an
  address stands on its own: the hub, a full-screen surface, a sheet promoted to
  a page, a door. **It has no nav, because most addresses are not destinations.**
- **`Shell`** — a Page with a product's chrome: the crown, the desktop sidebar,
  and the island over five destinations. Used where an address is one of a
  product's screens.

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

### Within the shape

Use the whole width. A phone is one column, a desktop is not — `Grid`, `Columns`
and `Split` exist and are under-used, and `board` gives you a real grid where
`Tile` items can be `wide` or `tall`. Two figures that answer one question belong
side by side, not stacked with a gap.

**Density is a decision.** Not everything is a full-width row. A count belongs in
the corner of the row it counts. A rarely-used action belongs in a menu on the
block it acts on. Three related toggles are a `ToggleButtonGroup`, not three
rows.

**Never wrap a single control in a card.** A card is a container for a *group*.
One button inside a card is a button with a box drawn round it — put it where it
belongs: in the crown, at the end of the row it acts on, or under the block it
finishes.

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
guard refuses it. In prose — "Kova · owner" under a workspace's name — a product
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

Only the arrival: its People, Money and Settings keep the hub's working material,
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

- `tone` — label length, description length, sentence case, full stops.
- `heroui` — no component is restyled; layout utilities only.
- `states` — four outcomes, shaped skeletons, one rhythm.
- `surface` — every declaration reaches a screen; every field kind a control.
- `shape` — no screen draws its own crown or pins its own action; at most one
  primary per screen; a `settings` screen carries none.
- `face` — one resolver draws every face; a seed is an identity, not a label.

What is **not** checked, and is therefore on the person writing the screen:
placement, density, whether a screen is doing two jobs, and whether the reader
would have looked here. Those are §3 and §7, and they are the ones that make the
difference between a product and a filing cabinet.
