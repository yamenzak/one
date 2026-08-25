# The declared surface

kind: plan

**An app stops shipping screens. It declares them, and the engine draws them.**

This is the plan for that, in ten stages. It is written before any of it is built
so the shape can be argued with cheaply, and it names the two things that decide
whether it works — the BINDING design and the GUARD migration — up front rather
than as discoveries.

---

## Why, in one paragraph

Every UI defect fixed in the redesign was one shape: **a capability declared in
one place and drawn in another, where the drawing could disagree.** A selection
tick folded into a row's `aside` and forgotten in the table's columns. `Menu`
rendering `{item.icon}` that no caller ever passed. `--on` declared and resolving
to an empty string. A depth layer appended under an opaque one. None of those
were carelessness; they are what hand-written screens structurally permit. And
the cost compounds the other way too: this redesign took a week because 10,130
lines of screens each had to be visited. Declared, it would have been one change.

## What is already true

**This is not a new mechanism. It is an unfinished one.** `design/src/rendered/`
already draws eleven surfaces from data that no app writes a line of:

| | | |
|---|---|---|
| `settings.tsx` | `money.tsx` | `console.tsx` |
| `legal.tsx` | `vault.tsx` | `policy.tsx` |
| `inbox.tsx` | `guide.tsx` | `ai.tsx` |
| `edit.tsx` | `field.tsx` | |

2,569 lines, consuming declarations from `@engine/kernel` — `SettingBook`,
`AreaBook`, `FieldSpec`. And the chrome is already declared: `AppSpec.hue`,
`ScreenSpec.route/label/icon/nav/chrome`, the sky, the gate.

**So the line today is not "declared vs not". It is: platform surfaces are
declared, product surfaces are hand-written.** The whole bet is whether that is a
principled line or just where the work stopped. This plan says it is the latter,
and stage 2 is designed to find out cheaply if that is wrong.

**The workload is `engine/apps/inventory`: 25 screens, 10,130 lines.**

---

## The two decisions everything else rests on

### 1. How a declaration expresses a BINDING

This is where declarative UI systems die. The failure is always the same: the
declaration needs a conditional, then a derived value, then a loop, and a bad
programming language grows inside JSON.

Read the simplest hand-written screen in OneInventory — `Where.tsx`, 110 lines —
and the split is exact. The SHAPE is entirely declarative already: a `detail`
screen with a title, a back, one action, a loaded source, an empty state, and
three blocks. What is not shape is four things, and they are the whole content:

- `places.filter((p) => p.of === place.id)` — a **query**
- `place.lines === 1 ? "1 line" : "N lines"` — a **formatter**
- `below.length ? <Section> : null` — a **presence test**
- `lines.map(...)` — a **projection**

**None of those needs an expression language, and this plan refuses to build
one.** Each gets a narrow, closed answer:

- **Queries are declared on collections.** `CollectionSpec` already carries
  `fields`, `scope`, `searchable`. A screen names a VIEW; a view is a declared
  filter/sort/limit over a collection. The kernel already validates collections
  and can validate these the same way.
- **Formatters are the closed set of components that already exist** — `Num`,
  `Unit`, `Size`, `Tally`, `When`, `Money`. A binding names one; it cannot
  compose them.
- **A presence test is `{ has: path }` / `{ empty: path }` / `{ not: … }`, and
  nothing else.** No arithmetic, no comparison, no equality.
- **A projection is the block's own business.** A list block takes a view and a
  field map; it does not take a function.

⚠️ **And the escape valve is deliberately not an escape hatch.** A screen that
needs a real predicate — a comparison, a sum, a threshold — declares a DERIVED
FIELD on the collection, in the kernel, where it is typed and testable. The
guard forces it there. That pushes logic into the data layer rather than into a
template language, which is the whole difference between this working and this
becoming a second, worse React.

### 2. What happens to the guards

⚠️ **84 of the 86 gate guards read source text. 69 of them scan JSX and
classNames.** `heroui.test.mjs` reads `className` strings; `blocks.test.mjs`
finds hand-rolled filter rows in JSX; `menu.test.mjs` parses literal arrays;
`cards.test.mjs` looks for `<Card>`. **The day screens become data, that entire
layer has nothing left to read.**

This is not a reason to stop — a schema is far easier to check than JSX, and the
guards get sharper, not weaker. But it is a large piece of work, and if it is
left until after the apps move there is a window where the drift-prevention
machinery points at an empty tree. **That window is exactly when drift returns.**
So it is stage 7, before any app is ported, and it is not optional.

---

## The arc

### S1 — The contract · **stage 89, shipped**
`kernel/src/surface.ts`. `ScreenSpec` grows an `of` and a `body`; `AppSpec` grows
`views`. `ScreenShape`, `Layout`, `Span`, `BlockSpec`, `Binding`, `Read`,
`Format`, `Presence`, `ViewSpec`, `BlockEntry`. Every refusal a manifest can
already raise, raised here too — refused at `defineApp`, on the same path as
every other manifest check. **No renderer. No components. Types and refusals
only.**

What it refuses, and every one of them draws a page today: a block nothing
registers · a block that has not implemented all four states · a slot given a
kind of source it cannot draw · a slot a block does not have · a required slot
left unbound · a field bound on a screen that is about nothing · a field the
subject does not have · a formatter that will say `Invalid Date` · a view over a
collection nobody declares · a view narrowing or sorting on a field that is not
there · a span wider than its grid · a grid wide enough to be a coordinate
system · a body with nothing on it · a view no screen reads.

Three things the contract settled that the plan had left open:

- **`ScreenShape` is the kernel's, not the design package's.** Both had the same
  eight-value union and only one of them was consulted by `SHAPES`, the preset
  table. A screen DECLARES its shape now, so two lists would be a manifest
  composing with a shape the table has never heard of — which does not throw: it
  falls through and draws a settings page as a form.
- **`kernel/src/blocks.ts` is empty and refuses everything, deliberately.** A
  screen may not name what nothing registers, and an index that let unknown names
  through would be worse than no index — the failure would be a blank region in
  production rather than a refusal at composition. Stage 91 generates it.
- **The escape valve is a `Match` with no comparison operator in it.** `is`,
  `isnt`, `set`, `unset`. The test that asserts that list is exhaustive is the
  one protecting the whole design: the day `gt` is added to make one screen
  easier, the manifest has become a query language.

### S2 — The spike · **stage 90, shipped** — and it found something

Expressed `Register.tsx` (1,089 lines), `Receive.tsx` (465) and `Scan.tsx` (374)
against the S1 contract, on paper, with no renderer and no escape hatch.

**None of the three can be expressed, and that is the correct answer.** Two
distinct things are missing, not one, and only one of them is a gap in the
contract.

#### What the workload actually is

The plan said "25 screens, 10,130 lines" as though they were one kind of thing.
Measured, they are three:

| | files | lines | |
|---|---|---|---|
| **Reads** | 12 | 2,829 | no state, no effects, no capture at all |
| **Wiring** | 2 | 3,518 | `live.tsx` + `index.tsx` — not screens |
| **Capture** | 11 | 3,783 | hold unsaved answers before a write |

`Where.tsx`, the sample the plan reasoned from, is one of the twelve. **It was
the easy case being mistaken for the general one** — which is exactly the failure
the spike exists to catch, and why it is stage 2 rather than stage 8.

#### Class A — value dispatch. A real gap, closed.

`Presence` could say "is there a code". It could not say **what the code turned
out to be**, which is what three of these screens are about: a scanned label that
is a shelf sends the session there, a known product is a thing to open, an
unknown one is a question. Three cards, three different acts, one `does`.

`Presence` gained one arm — `{ is: <read>, one: [names] }` — and it stays closed
because **it may only be asked of an `enum`.** The field has declared its
possible values, so both failures are refused at composition: a branch on a value
the column can never hold (a card nobody will ever see, which reads as a case
somebody has not hit yet) and a dispatch over free text (a comparison against a
string, which is the operator this design exists without). A screen wanting to
branch on something that is not an enum makes it one on the collection — the same
direction the derived field goes, and for the same reason.

#### Class B — capture. Not a gap. A second kind of screen.

`Receive` holds four answers re-seeded per scan, computes a cumulative pack
multiplier the server also computes, and derives a validation message that
disables the one action. `Register` holds twenty-four pieces of state and narrates
each one as a clause. **Nothing declarative should express that, and the framework
already says so:** `ScreenSpec.story` exists, `Register` already is one, and its
header already draws the line in the right place — *"a camera, a barcode
viewfinder and a packing editor are not fields, and a manifest that could express
them would be a second React."*

So the taxonomy goes in the contract now rather than being discovered at S9: **a
screen is a `body` or a `story`, and `two_kinds_of_screen` refuses both.** A
screen carrying both has two answers to what it is, and a renderer would pick one
silently, by whichever it checked first.

#### And the biggest finding was not in the three screens

**`live.tsx` is 2,579 lines — a quarter of the app — and it is not a screen.** It
fetches, joins and hands props. Its own header says why it exists: *"Three lists
and a lookup is the honest shape while the platform's generated `list` answers a
whole collection; the alternative is an operation per screen, which is a query
language with extra steps."*

That is `ViewSpec` describing itself, a stage early. **The largest single win in
this arc is not the screens — it is the container that disappears when a block
names a declared query.** S8 is where that lands.

### S3 — The block registry · **stage 91, shipped**

**Forty blocks in `kernel/src/blocks.ts`**, and the set was chosen by counting
rather than by surveying: every entry is a component the twelve reading screens
actually draw. Rows, lists, figures, thirteen charts, four marks.

**The membership is derived; the meaning is declared.** That is not what the plan
said, and it is the honest shape. `scripts/vocabulary.test.mjs` reads the design
package's source and refuses in both directions — an entry naming a component
that is not exported, and a component that could be a block and is classified as
nothing. A candidate is any exported component that takes no `children`, because
`children` means "the caller composes" and a declaration cannot. Every one of the
192 is a block or is named in one of seven categories with a reason, and the
lists can only shrink. What a generator could NOT derive is what a slot means —
"the rows" against "how many", and that this one takes a view and nothing else. A
`React.ReactNode` says none of that.

Three things the building settled, each a change to what S1 shipped:

- **A body nests exactly one level.** `Section` and `Group` are the two
  most-drawn components in the product by a wide margin, and the flat contract
  could not say so — every screen would have been one undivided column. A group
  holds blocks and never another group: one level is a layout, two is a tree, and
  the type is what refuses it.
- **The four outcomes are the frame's, not forty components'.** S1 had every
  block declaring which states it implemented, and the honest answer was almost
  none. Building them in would be thirty-nine copies of one decision — the shape
  this arc exists to remove. A block declares its SKELETON (`bones`); the frame
  draws waiting, nothing, trouble and denied around it. That makes S5 tractable:
  one implementation instead of forty.
- **`goes` — a row leads to a screen, named by id.** Half the rows in a product
  navigate, and `does` could only name operations. A route typed in a body would
  be a second spelling of an address the manifest already holds.

### S4 — A block reflows by its own box · **stage 92, shipped**

⚠️ **Container queries, not slot coordinates.** A block that knows it is "in a
2×1" breaks in the first layout that does not use that vocabulary; a block that
responds to its own measured box works in every container forever, including ones
nobody has designed yet. It is why a `Span` is what the layout is told and never
what the block reads.

`BOX` and `ROOM` in `metrics.ts` are the whole mechanism — one threshold, at the
width a table of real words actually needs, with every class written out whole
because Tailwind emits only what it has SEEN.

**Two real instances, and the second was found by the guard.** `Listing`
collapsed on `md:`: on a 1440px monitor the viewport says "wide", so four columns
get drawn into a 300px cell and every one is a word per line — and the reverse,
a list given the whole of a 700px tablet staying a phone list. `SubProcessors` in
`legal.tsx` had the identical collapse, on a disclosure whose own comment argues
at length why four columns in a phone's width is not a table.

**The measured half is what a static check cannot do.** A breakpoint and a
container query are indistinguishable in any reading that varies the window —
both collapse on a phone and open on a desk. `reflowOf` holds the viewport at
1440 and gives the block three boxes; only a container query answers differently.
The middle reading, 400px inside a 1440px window, is the single measurement that
separates the two mechanisms.

Two guards fell out of it, both of which had to be widened rather than waived:
`heroui` refused `@2xl:grow-0` as a restyle because its prefix pattern only knew
the viewport spelling, so obeying D92 failed the guard protecting D7; and the
`present` guard read `${ROOM.until}` as a stored date, because `until` is a
date-shaped field name in the kernel. The token is `ROOM.narrow`/`ROOM.wide` now,
which is better English anyway.

### S5 — The four outcomes, drawn once · **stage 93, shipped**

`Region` in `state.tsx`: waiting · nothing · trouble · denied, around whichever
block it is given, using the skeleton that block declares. One implementation
rather than forty — which is what S3's finding made possible.

**`nothing` is a required field, and that is the whole component.** Every surface
that rendered `[]` as a confident fact did so because saying what emptiness MEANS
was something a caller could leave out: a passkey card showing a "0" badge for
the length of a round trip, a bell saying "you're all caught up" mid-fetch, a
media library whose `catch(() => setItems([]))` turned a failed load into "no
media yet". A required field is how that stops being a thing to remember.

**Denied comes first, which is not the order `Await` uses.** The other three are
about a request; this one is about whether there should be a request at all. A
skeleton followed by a refusal is a promise the screen breaks a second later, and
it is worse than the refusal on its own — somebody has already started waiting.

Three call sites converted (Apps, Tried, Switches), each of which had been
hand-wiring the same three. Screens whose answer can never legitimately be empty
— the plan catalogue, the maintenance modes — keep `Await`, and that is the line:
`Region` is for a block whose answer can be nothing.

### S6 — The layouts · **stage 94, shipped**

Three arrangements, not four: `stack`, `grid`, `split`. The board was folded into
the grid — a board is a grid of tiles, and the only thing distinguishing the two
declarations was how wide a cell was allowed to be, which is now a field.

**A column count is a slot coordinate one level up, and it had to go the same
way.** `{ as: "grid", cols: 3 }` names a number that is right at exactly one
width; every other width needs a breakpoint, which is the thing S4 spent a whole
stage removing from the blocks. It is `{ as: "grid", least: "tile" | "panel" |
"card" }` now — the narrowest a cell may be, with `auto-fit` deciding how many
fit. `Grid`'s own header had already argued this and the layout contract had
gone the other way. The same edit ran through `split`, whose `lead: number` (a
percentage) became `aside: "start" | "end"` — which side it is DRAWN on, with the
reading order fixed — and through `Span`, whose `cols` became `cells`, bounded by
`CELLS_MOST = 3`.

**`beside: true` is how a block claims the aside**, and both directions refuse:
a `split` where nothing claims it (or two things do) is `split_without_an_aside`,
a `beside` on a stack or a grid is `aside_without_a_split`. A split with no aside
does not fail — it draws one column and an empty gutter, which reads as a screen
that loaded half of itself.

**And the measurement found a real regression I had introduced in S4.** `Columns`
and `Segmented` each carried `@container` and their `@2xl:` rules on the SAME
element. An element cannot query itself, so both rules were completely inert at
every width: the declaration typechecked, the classes shipped in the stylesheet,
and the columns never separated. Nothing static saw it — `reflow.test.mjs`'s
"every file that queries a box also declares one" was satisfied, because the file
did declare one. Only asking a browser how many columns actually came out could
answer it. Both are wrappers now, `reflow.test.mjs` has a fourth check for it,
and `arranged.seen.test.tsx` is the reading: a stack draws one column, a grid
draws more than one, tiles fit more across than cards at the same width, and a
split's aside is beside its main column rather than under it — found by
`querySelector("aside")` and `previousElementSibling`, because a reading that
counts DOM levels breaks on the correct fix and passes on the incorrect one.

### S7 — The guards, re-founded
The 69 source-scanning guards become schema-scanning guards. Each one keeps its
QUESTION and changes what it reads. Where a question no longer applies — a rule
about `className` on a component nobody hand-writes any more — it is deleted with
its reason recorded, not left passing over an empty set.

⚠️ **Before any app is ported.** See decision 2 above.

### S8 — The renderer
The screen renderer joins `design/src/rendered/`: it takes a `ScreenSpec.body`
and the app's declared sources, and draws the screen. This is the generalisation of the eleven
surfaces that already work, not a new idea — and it arrives after the contract
has survived the spike, the blocks exist, and the guards can see it.

### S9 — OneInventory, ported
Every screen is a `body` or a `story`, and nothing is a third thing. On the
numbers S2 measured, that is **12 screens declared, 11 already the right kind,
and `live.tsx` largely gone**. Photographed before and after at both widths and
both themes, because the port is only correct if the product is unchanged.

### S10 — The door closes
`engine/ground` ported, the app-side UI deleted, and a guard that refuses a
`.tsx` under `apps/*/src` at all.

⚠️ **The invariant is "no PRIVATE UI in an app", not "no UI".** A screen that
genuinely needs code is a component in `@engine/design` with its own entry in
the ledger — which is the rule already, one level up. Stated as an absolute it is
a rule that gets quietly broken; stated this way it is one that gets obeyed.

⚠️ **And S2 sharpened it further: a story's CONTROLS stay in the app.** The
guard's question is not "is there a `.tsx`" but "is there a screen that is
neither a declared body nor a declared story" — which is the thing that can
drift, and the only thing worth refusing.

---

## What this is not

- **Not a theme system.** The palette, the ladder, the ambience and the type
  ladder are already declared and already guarded. This is about STRUCTURE.
- **Not a page builder.** Nobody drags anything. A declaration is written by
  whoever builds the app, reviewed in a diff, and refused by the kernel when it
  is wrong.
- **Not a way to avoid design.** It is a way to make one design decision reach
  every app at once, which is the thing this redesign proved is currently
  impossible.
