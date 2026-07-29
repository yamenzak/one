# UI LANGUAGE

> The interface language for every app Four Degree Labs ships. Product-agnostic
> on purpose: **nothing in this file may mention a domain** — no clients, no
> workouts, no invoices. Kova maps its screens onto this language in
> [DESIGN.md](DESIGN.md); Scena and Bocca will map theirs. When this file and a
> product file disagree, **this file wins**.
>
> This is the extraction target. Everything specified here belongs in the shared
> UI package. Everything a product needs *beyond* here belongs to that product.
>
> **§13 is the component registry** — every component, what it is for, and what
> it is not for. Check it before building anything; add to it in the same commit
> that adds a component. It is also the fastest way back into this document after
> a break.

---

## 0. The bar

Seven rules. Every one is testable, and every review question below reduces to
one of them.

1. **One idea per surface.** A card says one thing. If it needs a sub-heading,
   it is two cards.
2. **The number is the story.** Data is the largest thing on screen. Labels
   serve the number; the number never serves the label.
3. **Chrome recedes.** Navigation, search and headers are the quietest pixels on
   the screen and the last to animate in. The user came for the content.
4. **Space is a feature, not waste.** Density is the enemy of comprehension.
   Anything cramped is wrong even when it fits.
5. **Say the thing.** Product language, never system language. If a word exists
   only because of how we built it, it does not ship. (§10)
6. **Motion settles, never announces.** Things arrive by coming to rest, not by
   growing, sliding far, or bouncing. (§8)
7. **A 70-year-old can use it, and a designer would screenshot it.** Both. If
   only one is true, it is not done.

---

## 1. The hierarchy model

Every screen is exactly five tiers. This is the core of the language — the rest
is detail. Before designing a screen, assign every element a tier. **An element
placed above its true tier is the single most common way a screen rots.**

| Tier | Name | What lives here | Count |
|---|---|---|---|
| **T0** | **Atmosphere** | The canvas and its gradient. Carries identity and, rarely, global state. | 1 |
| **T1** | **Anchor** | The one thing this screen is about. The largest type on the page. | **exactly 1** |
| **T2** | **Primary actions** | What you came here to *do*. | 3–5 |
| **T3** | **Content** | Grouped rows, tiles, charts. What you came here to *read*. | unbounded, chunked |
| **T4** | **Chrome** | App bar, tab bar, search, back. | fixed |

**Rules that fall out of this:**

- **T0 never carries information.** A gradient may express brand or a global
  state (suspended, offline). It may never encode a value — nobody reads colour
  as a number.
- **T1 is singular and non-negotiable.** Two competing hero elements means the
  screen has two jobs and should be two screens. If you cannot name the anchor
  in one noun, the screen is unclear.
- **A tabbed surface is N screens sharing chrome**, so the anchor belongs to the
  TAB, not to the page. Each tab names its own subject and gets its own anchor;
  the page's own title drops to an eyebrow, because the tab bar already says it
  and a title is navigation rather than content. This is the honest reading of
  "one anchor per screen" — not an exception to it.
- **Some surfaces have no T1, and that is the correct answer.** Two kinds:
  **list surfaces** (settings, admin consoles) — a screen that is only a set of
  rows has no single value to promote, and forcing one gives you a display
  numeral counting something nobody came to count. And **task surfaces** — a
  workout player mid-session, a plan builder, a camera flow. A task surface's
  subject *changes as you work through it*, so a fixed T1 would be stale by the
  second interaction; its progress belongs in persistent chrome, where it stays
  visible, rather than at the top of a spine that scrolls away. Reach for this
  deliberately, not as an excuse: a browse surface that merely *feels* busy
  still has an anchor, and finding it is the work. The workout player is both in
  one file — its day picker is a browse surface and has an anchor; its session
  view is a task surface and does not.
- **A screen's FIRST RUN may be a different screen.** The no-T1 rule applies per
  *state*, not only per surface. A front desk with no session types defined has
  no schedule to anchor: "Booked in — 0" is the least informative number on a
  page whose whole subject is setup, and stacking it over a button over an empty
  state gives you three elements saying one thing. In that state the empty state
  **is** the surface and carries the action; the anchor appears once there is
  something to count. Same test as always — can you name the anchor in one noun
  *in this state*.
- **The first step is the primary action.** If the thing a screen needs first
  lives at the bottom, the screen is upside down. Sessions shipped a disabled
  "Schedule" at the top and the instruction "add a consultation type below" —
  the impossible action promoted, the required one demoted to prose. T2 is
  whatever step is genuinely next, and it changes with state.
- **T2 tops out at five.** Four is better. The fifth slot, when needed, is
  always **More** — never a fifth real action.
- **T2 has a floor of three.** A cluster of one is a single circle adrift in the
  middle of a screen, and a cluster of two reads as an unfinished row. One or two
  actions is a `Button` (full width) — the cluster is a *set*, and a set needs
  enough members to read as one.
- **T3 chunks at seven.** More than ~7 rows in one group gets truncated with a
  **See all** row. Scroll is fine; an un-chunked wall is not.
- **T4 is translucent, unlabelled where an icon suffices, and never accented.**
  The tab bar does not use the brand colour except on the active item.
- **Nothing spans two tiers.** A card that is both the anchor and a list is two
  components stacked, not one clever one.
- **The anchor's value appears ONCE.** Restating it in a tile, a card headline or
  a ring further down the screen reads as a second thought about the first one,
  and the copy is always the louder of the two because it brings a chart with it.
  If a component below the anchor needs that number for context, it gets the
  *split*, the *delta* or the *trend* — never the number itself. This was the
  single most repeated defect of the rewrite: Today, Eat and Business all shipped
  it, and all three looked fine in the diff.
- **An EmptyState earns its 350px by adding something.** It exists to *explain*
  and to *offer a way in*. When the anchor already says "Nothing booked" and a
  full-width primary button sits between them, an illustrated block titled
  "Nothing booked" is the anchor's value restated at hero size with an icon —
  the rule above, wearing a component. Either the block carries the whole state
  (no anchor, no separate button — the first-run case above) or it collapses to
  one muted caption saying the thing neither of the other two can.
- **Relative in the anchor, absolute in the record.** When an anchor's sub-line
  and the first row below it describe the same event, the sub-line must add the
  dimension the row cannot afford: "Next in 2 days" over a card that says
  "Fri, Jul 31, 4:30 PM". Printing the same timestamp twice turns the anchor
  into a caption for the thing underneath it.

### The vertical spine

Top to bottom, in this order, always:

```
T0  atmosphere (behind everything, anchored to the top of the scroll container)
T4  app bar                      ← translucent, blurs content beneath it
T1  anchor                       ← centred, the biggest thing on screen
T2  action cluster               ← directly under the anchor, breathing room above
T3  content groups               ← separated by section rhythm
    …
T4  tab bar                      ← fixed, translucent
```

Deviating from this order requires a reason you can write in one sentence.

---

## 2. Layout & rhythm

### The grid

**4px base unit.** Every spacing value is a multiple. No exceptions, no
one-off `13px`.

| Token | px | Used for |
|---|---|---|
| `space-1` | 4 | icon↔text in dense chips |
| `space-2` | 8 | inside a control |
| `space-3` | 12 | icon↔text in a row; between stacked cards |
| `space-4` | 16 | card padding (compact); page gutter (mobile) |
| `space-5` | 20 | card padding (default) |
| `space-6` | 24 | page gutter (≥md); card padding (roomy) |
| `space-8` | 32 | **between sections** |
| `space-10` | 40 | anchor ↔ action cluster |
| `space-12` | 48 | above a screen's first section |

### The column

**There is one content column and it never stretches.** This is the rule that
makes one design work on every screen size (§11).

| Breakpoint | Gutter | Column max |
|---|---|---|
| base (mobile) | 16 | 100% |
| `md` ≥768 | 24 | 640 |
| `lg` ≥1100 | 24 | 720 |
| `xl` ≥1400 | 32 | 720 (+ side columns) |

Wider viewports get **more columns**, never wider cards. A card is designed once
at ~360–720 and is pixel-correct everywhere because it never has to reflow.

### Rows — the most repeated element in the product

| Variant | Height | Anatomy |
|---|---|---|
| `row/single` | 56 | `[icon 24] gap-3 [label] ——— [value] [chevron?]` |
| `row/double` | 64 | `[icon 24 or badge 32] gap-3 [primary / secondary] ——— [value / sub]` |
| `row/media` | 72 | `[avatar 40] gap-3 [primary / secondary] ——— [value]` |

- Vertical padding is derived from the height, not added to it. A row is a fixed
  height so a list has a rhythm you can feel while scrolling.
- **Primary** is `body-lg`/500. **Secondary** is `caption`/400 muted. Right-hand
  **value** is `body-lg`/500 with `tabular-nums`, and its sub-line is `caption`
  muted.
- Separators: a hairline **inset to the text origin** (left-padded past the
  icon), or nothing. Never a full-bleed divider inside a group.
- The whole row is the tap target. Minimum 48.

### Density

- **The 40% rule.** At rest, at least ~40% of any viewport is not ink. Measure
  by squinting: if the screen reads as a solid block, split it.
- **Three weights maximum per viewport.** One display numeral, one accent fill,
  one image. A third heavy element competing is one too many.
- **Two levels of nesting maximum.** Group → card is fine. Group → card → card
  is not.

---

## 3. Surfaces & depth

A **four-step tonal ladder**, and separation comes from tone, radius and space —
**not from borders or shadows** in dark mode.

| Role | Purpose |
|---|---|
| `canvas` | the page. Near-black in dark, near-white in light. |
| `surface-1` | cards, groups, sheets |
| `surface-2` | a card inside a card; inputs; pressed states |
| `surface-3` | hover, dragging, the top of a stack |

**Light mode inverts the polarity, not the structure:** canvas is a hair grey,
`surface-1` is pure white, and hairlines *do* appear (a white card on a white
page needs an edge; a dark card on a dark page does not).

### Atmosphere (T0) — the signature

The one non-negotiable brand surface: **a saturated brand wash at the top of the
scroll container, decaying to canvas by ~55% of the viewport height.**

- It belongs to the **scroll container**, not the viewport. It scrolls away. It
  is not a fixed backdrop.
- Content sits **on canvas**, not on the wash. The wash exists behind the anchor
  and nothing else, which is exactly what makes the anchor read as the anchor.
- Exactly **one** atmosphere per screen. Nested atmospheres are noise.
- Full-bleed — it must reach the physical edges and under the status bar.
- Two intensities: **`brand`** (the default, on primary surfaces) and **`quiet`**
  (a ~30% wash, for secondary screens that should feel connected but not shout).
- A **state** atmosphere replaces the brand one when the whole screen is in a
  degraded state (read-only, offline, expired). It is the only case where T0
  carries meaning, and it is always accompanied by a T3 explanation in words.

Elevation shadows exist **only in light mode** and only on floating things
(sheets, dialogs, the floating CTA). In dark mode, floating is expressed by
`surface-2` + a 1px top highlight.

---

## 4. Colour

### The rules

1. **Components never name a colour.** They name a *role*. There is no `blue` in
   any component file.
2. **One accent per screen.** The brand colour appears on the atmosphere, the
   primary action, and the active nav item. Nowhere else.
3. **Status is never colour alone.** Every status is a tone **plus a word**.
   Colour-blind users and greyscale screenshots must both work.
4. **Domain accents are the product's, not the language's.** The shared package
   ships the *mechanism* (a tone + its soft container, resolved per theme);
   Kova ships the list of domains, Bocca ships a different one.

### Roles

| Role | Meaning |
|---|---|
| `primary` | the brand. The one accent. Themed per tenant. |
| `foreground` / `muted-foreground` | text; muted for anything secondary |
| `success` / `warning` / `danger` | states, each with a `-soft` container |
| `<tone>` / `<tone>-soft` | product-defined categorical accents |

Every tone ships as a **pair**: a foreground tone and a `-soft` container. The
pair is theme-aware — the foreground darkens in light mode so that tone-on-soft
always clears **AA (4.5:1)**. This is already how the tokens work; keep it.

### Tenant theming

A tenant may override **`primary`, `radius`, and border weight**. Nothing else.
That is enough to re-skin the whole product and too little to break it. Any new
token must be checked against this: *if a tenant sets a wild primary, does this
still work?*

---

## 5. Typography

One geometric sans. Sentence case everywhere. **No all-caps except the `micro`
overline.** Never a weight above 700.

| Role | Size / line | Tracking | Weight | Use |
|---|---|---|---|---|
| `display` | 56 / 1.0 | −0.03em | 700 | the anchor numeral, once per screen |
| `title-1` | 34 / 1.1 | −0.02em | 700 | screen title |
| `title-2` | 24 / 1.2 | −0.02em | 600 | section / card title |
| `title-3` | 20 / 1.25 | −0.015em | 600 | sub-section |
| `body-lg` | 17 / 1.4 | 0 | 500 | row primary, values |
| `body` | 15 / 1.45 | 0 | 400 | prose, descriptions |
| `caption` | 13 / 1.35 | 0 | 400 | row secondary, helper |
| `micro` | 11 / 1.2 | +0.02em | 600 | overline, badge |

**Enforced by a lint.** `apps/app/src/type-scale.conformance.test.ts` reads the
source and fails on any hand-rolled spelling of a role that already exists — the
scale is worth nothing if a screen can quietly opt out. Escape with a
`type-scale-exempt: <why>` comment; the reason is mandatory, because the point is
that the decision is argued in the diff rather than assumed.

**Numerals:** `tabular-nums` and `−0.02em` on every number, always. A number
that reflows as it ticks is a bug.

**Never render a dash where a number belongs.** An em-dash at 56px/700 with
−0.03em tracking is not a placeholder, it is a horizontal rule — it reads as a
divider with a caption under it, which looks broken rather than empty. The same
thing happens at 26px in a stat card, and four of them in a 2×2 grid look like
the layout failed. It is also the one placeholder assistive tech cannot convey:
"em dash" is what gets announced, if anything.

So: **a value slot with nothing in it takes `null`, and the component renders
`NoData`.** Callers say what they know; components decide how absence looks.
`StatCard`, `MetricPill`, `GlanceStrip` and `ProgressRing` all do this already,
and `ChartCard` distinguishes three states deliberately — omit `value` for a
card with no headline number at all, pass `null` for one that hasn't got a
number *yet*, pass a value otherwise.

Two more rules that follow from it:
- **A zero is not the same as nothing.** `0` is a real measurement and renders as
  a numeral. But a computed score that is zero *because there is no input* is
  absence wearing a number's clothes — a brand-new client's wellness score is
  `0`, and 0 at display size reads as a verdict on the person. Say the words.
- **When the container already explains the emptiness, don't say it twice.** A
  `ChartCard` whose chart prints "Not enough data yet" does not also need a
  headline saying so.

**Enforced by a lint.** `apps/app/src/no-data.conformance.test.ts` fails on a
dash reaching a value slot or a `numeral`-classed element. Escape with
`no-data-exempt: <why>`. A dash in ordinary muted caption text — an empty cell
in a dense metadata line — is exactly what a dash is for, and is not flagged.

**Units are subordinate:** render the unit at ~55% of the value's size and in
`muted-foreground`, on the same baseline. `1,905` `GBP`, never `1,905 GBP` at
one size.

**Line length:** prose caps at ~68 characters. Beyond that, it is not prose, it
is a wall.

---

## 6. Shape

Base radius **16**, tenant-adjustable 12–24. The ladder is proportional so the
tenant slider moves everything coherently.

| Token | Value | Use |
|---|---|---|
| `radius-xs` | base − 8 | chips inside a row, small badges |
| `radius-sm` | base − 4 | inputs, small tiles |
| `radius-md` | base | default |
| `radius-lg` | base + 4 | cards |
| `radius-xl` | base + 12 | grouped containers, hero cards |
| `radius-sheet` | base + 16 | sheet/drawer top corners |
| `radius-full` | 999 | **pills, icon buttons, avatars — always** |

**Nothing has a sharp corner.** The only 0-radius surface in the product is a
full-bleed atmosphere.

**Icon containers are squircles** (`radius-sm`) at 32/40; **action buttons are
circles** at 48/56. The distinction is meaningful: a squircle is an *identity*
(what this row is about), a circle is an *action* (something you press).

---

## 7. The component grammar

The canonical set. A screen that cannot be built from these needs a language
change, not a bespoke component.

### Structure
| Component | Anatomy |
|---|---|
| `Screen` | atmosphere + scroll container + safe-area padding + the vertical spine (§1) |
| `Section` | optional `title-2` header + optional trailing action + children, `space-8` below |
| `Group` | `surface-1`, `radius-xl`, rows inside, inset hairlines, no padding of its own |
| `Row` | §2, three variants |
| `Tile` | square-ish card for a 2-up/3-up grid: icon, label, optional value |
| `Board` | the responsive column manager (§11) |

### Identity
| Component | Anatomy |
|---|---|
| `Atmosphere` | §3. Props: `tone` (brand / quiet / state), nothing else |
| `Anchor` | eyebrow (`caption` muted) · value (`display`, counts up) · optional pill beneath |
| `Stat` | label · value+unit · optional status chip · optional right-side mini chart |
| `Ring` / `Spark` / `Bars` | the viz set — stroke draw-in, path draw, staggered bar rise |

### Action
| Component | Anatomy |
|---|---|
| `ActionCluster` | 3–5 × (circle icon button 48 + `caption` label beneath), evenly distributed |
| `Button` | filled / tonal / outline / ghost / destructive × sm 36 / md 44 / lg 52. **Pill radius always.** |
| `FloatingAction` | one per screen max, bottom-centred, `radius-full`, high-contrast fill, sits above the tab bar |

### Input
`Field` · `Search` · `Select` · `Switch` · `Segmented` · `Stepper` · `Slider`.
Labels sit **above** the control, never inside it as a placeholder. Helper text
sits below and is `caption` muted. Errors replace helper text in `danger` and
say what to do.

### Feedback
`Callout` (tone + icon + text; the only place a coloured block of text lives) ·
`Toast` (transient, bottom, one line) · `EmptyState` (illustration/icon +
one-line explanation + one action) · `Skeleton` (matches the real layout's
geometry exactly — a skeleton that does not match is worse than a spinner).

### Overlay
`Sheet` (bottom, drag-to-dismiss, grabber, `radius-sheet` top — the default on
mobile) · `Dialog` (centred, ≥md only, for confirmations) · `Menu` · `Popover`.

**One rule governs all overlays:** a sheet is for *doing*, a dialog is for
*deciding*. If it has inputs, it is a sheet.

### The sheet is three parts, and its height is quantized

A sheet is a **pinned header, a scrolling body, and a pinned footer**. Only the
body scrolls. Every part of that is load-bearing:

- **The primary action lives in the footer, never at the end of the body.** On a
  long form an unpinned action sits below the fold, so the way to submit is to
  scroll back past everything you just filled in. Pinned, it is in the same
  place in every sheet in the product — which is the actual definition of
  consistency here: not that the sheets are the same size, but that your thumb
  lands on the same spot.
- **The footer follows the branch.** A sheet that is two surfaces sharing a
  frame — a confirmation then a receipt, a form then a "saved" state — gets a
  conditional footer. Hoisting one branch's button into a shared footer makes it
  render in the other branch too, which is a silent bug: it type-checks, and it
  only shows up on screen.
- **A floor and a ceiling, not a content-driven height.** Heights used to range
  from ~25vh to 92vh depending on what was inside, so opening three sheets in a
  row moved the surface by half a screen each time. The floor stops a two-field
  form reading as a popup; the ceiling stops anything touching the top of the
  display. `size="tall"` pins the height at the ceiling for pickers and
  filterable lists, where a sheet that resizes as you type is worse than one
  that doesn't.
- **The header takes its hairline on scroll only**, exactly like the `AppBar`.
  Chrome recedes until it has something to separate.
- **The sheet owns the title.** A form that renders its own `<h2>` inside the
  body has two headings — one of them invisible to the accessibility tree — and
  once the header is pinned, the visible one scrolls away under an empty bar.
- **Not every sheet has a footer, and forcing one is worse than none.** A detail
  sheet is for reading. A field-scoped action ("Or enter the digits" → *Look up
  product*) belongs beside its field, not at the sheet's edge, because pinning
  it orphans it from the label that explains it. Pin the sheet's action; leave
  a field's action where its label is.
- **Shortcuts go under the general path, never over it.** The food picker put
  Snap-a-meal, a barcode tile, a manual tile, a segmented control and four
  recents above its search field — so the one way to find a food that *isn't* in
  your recents was the last thing on the sheet, and at `tall` its filter chips
  fell off the bottom entirely. Recents are a shortcut past search, which means
  they sit below it. Same family as "the first step is the primary action" (§1):
  a surface that buries its general-purpose control under its conveniences has
  the hierarchy upside down.
- **A control that cannot change anything on screen should not be on screen.**
  That picker also rendered its All/Whole/Branded filter on the landing, where
  there were no results to filter.

### Settings surfaces: an index, and a page per section

**Configuration is never a tab strip.** Tabs cap at 2–4 before they truncate,
they put every sibling one flick away from the one you want, and they force a
whole section onto a single page — so the page grows without limit and nothing
on it can be found. Kova shipped seven tabs on studio settings (two off the
right edge at phone width) where the first tab alone was 5,599px of one card
holding fifteen unrelated controls under one Save; the operator console's first
tab reached 61,541px with no chunking at all.

The shape every phone OS converged on, and why each half works:

| | The index | A section page |
|---|---|---|
| Component | `SettingsIndex` | `SettingsPage` |
| Rows | grouped, tinted icon + name | the section's own controls |
| The sub-line says | **what is inside** — "Colours, corners, logos" | **the current value** — "Elevation · Soft" |
| Purpose | aim before you tap | answer "what is this set to" by reading |

- **The value in the sub-line is the whole trick.** It lets someone check a
  setting without opening it, and therefore without risking changing it.
- **A binary with nothing else to say gets an inline switch and no page.**
  Anything with more than a value gets a page.
- **One line of introduction, at most, and only on the section page.** The old
  surfaces stacked four — a page intro, a tab intro, a card intro and a
  sub-section intro — before the first control. If a section needs more than a
  line, its rows are named wrong.
- **Colour is navigation.** A section keeps its tone everywhere it appears, so
  the index becomes a map you aim at from memory. A grey badge in a row of toned
  ones reads as disabled, not as neutral — every row gets a real tone.
- **Destructive sections take their own group**, below a break, in `danger`.

### Two rules about repetition

- **A glyph repeated down a list is texture, not identity.** An icon earns its
  place by *distinguishing* — so it belongs where the neighbours differ. The
  activity picker resolved its icon by category, which meant a section already
  headed CARDIO showed the same footprints mark nine times, on Rowing and
  Elliptical too, while eating the width the labels needed (three chips a row,
  bottom row clipped). Removing it fitted four a row and lost nothing. The same
  icon is *correct* one level up — on the selected-activity header, and in a
  mixed feed where rows come from different categories. Test: **if every visible
  sibling would show the same glyph, delete it.**
- **A scroll area never hard-cuts through a row.** A container clipped mid-chip
  reads as broken, not as "there is more". Fade the last ~24px with a
  `mask-image` gradient and pad the scroller so the final row can clear it.

### How many actions a row may show

| Trailing actions | Shape |
|---|---|
| 0 | the row itself is the action — tap it |
| 1–2 | inline icon buttons |
| 3+ | one `···` opening a menu |

And the rule underneath: **never render an icon for the thing the row already
does.** The exercise library gave every row Edit / Alternatives / Archive — 96px
of trailing controls squeezing the name, twelve unlabelled glyphs on a screen of
four rows — while the row *and* the grid card already opened the editor on tap.
The pencil was a second button for the row's own job. A list whose cards are not
tappable is the case where that icon is the only way in and belongs there.

### Chrome
`AppBar` (blur + hairline on scroll only) · `TabBar` (≤5 items, active = filled
pill behind the icon) · `NavRail` (≥md) · `Header` (large screen title that
collapses into the app bar on scroll).

---

## 8. Motion & choreography

Motion is **90% of the premium feeling and 100% of the risk.** Wrong motion
reads as cheap faster than any static mistake.

### Durations & curves

| Token | ms | Use |
|---|---|---|
| `instant` | 100 | colour/state change |
| `fast` | 160 | press, hover, toggle |
| `base` | 240 | element enter/exit |
| `slow` | 360 | screen and sheet transitions |

- **`ease-out: cubic-bezier(0.22, 1, 0.36, 1)`** — the house curve. Almost
  everything. Fast start, long settle.
- **`ease-in-out: cubic-bezier(0.65, 0, 0.35, 1)`** — only for things that
  return to where they came from.
- **Spring** (layout / shared-element only): `stiffness 380, damping 34, mass 0.9`.
  Critically damped on purpose — **no visible overshoot, ever.** Bounce reads as
  toy, not premium.

### The entrance choreography

The signature. Four tiers, in this order, on every screen entrance:

```
t=0     T0 atmosphere       opacity 0→1                     240ms
t=60    T1 anchor           scale 1.06→1.00, opacity 0→1    360ms  ← settles DOWN
t=140   T3 content          y 12→0, opacity 0→1             280ms, stagger 45ms
t=260   T4 chrome           opacity 0→1                     200ms  ← always last
```

**Enter by scaling down, never up.** Content arrives already slightly too large
and comes to rest. This one detail is the difference between "an app opened" and
"an app was assembled in front of me". *(Note: the current `popIn` variant scales
**up** from 0.96 — it must be inverted.)*

- The **anchor is the transform origin** of the whole content layer. Everything
  settles toward the number.
- **Stagger is shallow:** 45ms, maximum 3 tiers deep. Deeper looks like a slow
  network.
- **Exit is 60% of enter, with no stagger.** Leaving should feel decisive.

### Interaction physics

| Gesture | Response |
|---|---|
| press | `scale 0.97`, `fast`, spring back on release |
| toggle | the *indicator* moves with a shared-element spring; the container does not animate |
| sheet drag | 1:1 with the finger; release velocity decides dismiss vs settle; scrim opacity tracks position |
| list item enter | `y 8→0` + fade, stagger 30ms, **only on first paint** — never on re-render |
| value change | count up over 850ms cubic-out; never re-animate on an unrelated re-render |
| pull to refresh | the atmosphere stretches; the content does not |

### Reduced motion

`prefers-reduced-motion` collapses **all** transforms to opacity-only at 120ms.
Not "reduced" — **removed.** Layout must never depend on an animation having run.

---

## 9. Visual flow

How the eye moves. The rules that make a screen feel designed rather than
assembled.

1. **One entry point.** The eye lands on the anchor because it is the largest,
   highest-contrast, most centred thing. If it lands anywhere else, fix the
   contrast, not the copy.
2. **Left edge is the spine.** Every text origin in the column aligns to one
   left edge. Icons hang left of it; nothing else does.
3. **Right edge carries values.** Numbers, chevrons and switches align right.
   The eye reads the left column for *what* and the right for *how much*.
4. **Alternate weight.** A heavy block (chart, image, display numeral) is
   followed by a light one (rows, text). Two heavy blocks in a row is a wall.
5. **Group by answerable question.** A group holds things a user would ask about
   in one breath. If you need "and" to describe a group, split it.
6. **The fold is real.** The anchor and the primary action are above it on the
   smallest supported device (iPhone SE, 375×667). Verify, don't assume.
7. **Context decides emphasis.** The same value is `display` on its own detail
   screen, `body-lg` in a row, and `caption` in a summary. **A component never
   decides its own importance — its container does.** This is why `Row`, `Stat`
   and `Anchor` are separate components rather than one with a `size` prop.

---

## 10. Words

The interface speaks the user's language and never ours.

**Banned outright** — if a word exists because of how we built it, it does not
ship:

> sync · payload · endpoint · token · entitlement · provisioned · cache ·
> webhook · tenant · instance · config · schema · nullable · queue · retry ·
> validate · authenticate · initialize

**Translations:**

| Never | Always |
|---|---|
| OTP / verification code | your code |
| credential / WebAuthn | passkey |
| entitlement / feature flag | what's included in your plan |
| provisioning your tenant | setting up your space |
| add-on type / consultation type | session type |
| add-on balance / add-on unit | their prepaid sessions |
| configured on this deployment | *say the consequence: "card payments aren't switched on yet"* |
| (opt) | (optional) |
| an error occurred | *say what happened* |
| invalid input | *say which field and why* |
| are you sure? | *name the consequence* |

**Rules:**

- **Buttons are verbs.** "Add money", "Send invite", "Save changes" — never
  "Continue", "OK", "Submit".
- **Numbers before words.** "3 left" beats "You have 3 remaining".
- **Errors: what happened, then what to do, in one sentence.** "That code
  expired — request a new one."
- **Destructive confirmations name the consequence, not the action.** "Delete 4
  years of training history?" not "Are you sure?"
- **No exclamation marks. No "Oops". No emoji.** Ever.
- **Empty states explain and offer.** One line of why it is empty, one action to
  fill it. Never just "No data".
- **Never apologise for a working feature.** No "Unfortunately, you'll need to…".
- **The API's nouns are not the product's nouns.** Routes, columns and types keep
  whatever the data model calls them; the glass says what a person at a front
  desk says. `addon_types` / `/api/addon-types` stayed exactly as they are while
  every string above them became "session type" — renaming the schema to match
  the copy is a migration, and renaming the copy to match the schema is how the
  billing model ends up in the scheduling tool.
- **Name the count, not three of the names.** "AI suite, Body-fat camera,
  Supplements & labs and 1 more are locked" costs three clauses, ends in an
  opaque number, and still sends the reader looking for the rest. Either
  enumerate in full — in the component whose job that is — or say "3 features
  locked" and let the full list be one scroll away. Half a list is worse than
  none.
- **A 1–5 scale must say which end is which.** Five faces with no endpoint
  captions is only guessable for mood; on Energy it is a coin flip and on Stress
  it was *wrong*, because the stored direction (5 = worst) was the opposite of
  what the ascending glyphs implied. Every scale names its ends, shows the
  chosen step in words, and any inverted scale renders inverted everywhere it
  is read back. The words live in one registry — `screens/client/scales.ts` —
  because three surfaces render them and they diverged the moment they didn't.

---

## 11. Desktop

Not a second design. **The mobile column is the unit; desktop adds columns
around it.**

**The column is one class.** `.column` (tokens.css) is this table, and it is the
only place these numbers appear. A screen that writes its own `max-w-*` inside
the shell's column silently wins the cascade and pins the whole app narrower
than the language says — which is exactly what happened, app-wide, unnoticed,
because every screen agreed on the same wrong number.

### Three shapes

| Shape | From | Layout |
|---|---|---|
| **Focus** | `md` 768 | nav rail (72) + one centred column (max 640). Sheets → right panel (420). |
| **Two-pane** | `lg` 1100 | nav rail + list pane (340) + detail column (max 720). **The detail pane is literally the mobile screen.** |
| **Board** | `xl` 1400 | the above + a right column (320) of secondary cards |

### The rules that make it work

1. **Cards never stretch.** A card fills its column; columns multiply. This is
   why a card designed once is pixel-correct at every width — it is never asked
   to be a different shape.
2. **Panes are independent scroll containers**, each with its own atmosphere
   anchored to its own top.
3. **The detail pane is the same component tree as the mobile screen.** If
   desktop needs a different component, the abstraction is wrong.
4. **Hover exists only under `@media (pointer: fine)`.** Touch devices must never
   inherit a hover state that sticks after a tap.
5. **Keyboard is a first-class input at `md` and above:**
   `/` focus search · `Esc` closes the topmost layer · `↑/↓` move within a list ·
   `Enter` opens · `⌘K` command palette (when the product has one).
6. **Everything focusable has a visible ring** — the same ring token, never
   `outline: none`.

### What desktop must NOT do

- Stretch a row to 1400px with a value floating in the void.
- Add a data table where mobile has rows. Same rows, more columns.
- Introduce a top nav bar in addition to the rail.
- Show more than one atmosphere per pane.

---

## 12. Accessibility floor

Non-negotiable, checked on every screen:

- **Tap targets ≥ 48×48**, even when the visual is smaller.
- **Text ≥ 13px.** `caption` is the floor; there is nothing below it.
- **Contrast:** body text AA (4.5:1), large text and non-text AA (3:1). Every
  tone-on-soft pair is validated in both themes.
- **Status never by colour alone** (§4).
- **Visible focus ring** on every interactive element.
- **Reduced motion removes transforms**, and layout never depends on animation.
- **Every icon-only control has an accessible name.**
- **Dynamic type:** the layout survives 200% text scale without clipping —
  rows grow, they do not truncate the primary line.

---

## 13. The registry

**Every component in `@kova/ui`, what it is for, and — more usefully — what it is
NOT for.** This section is the working reference: check here before building
anything, and add to it in the same commit that adds a component. A component
that is not listed here does not exist as far as the next screen is concerned.

Marked **✅** where the component is language-conformant today, **◻︎** where it
works but predates the language and is still on the list (DESIGN.md tracks the
deltas).

### Spine — `layout.tsx`

| Component | Use it when | Do NOT use it for | State |
|---|---|---|---|
| `Screen` | Every top-level screen. Owns the scroll container, safe areas, column and choreography. | Anything inside the app shell — the shell supplies the frame there. | ✅ |
| `Atmosphere` | Automatic inside `Screen`. Place directly only on a surface that owns its own scroll. | A decorative gradient. It is identity, and there is exactly one per screen. | ✅ |
| `Anchor` | The one thing a screen is about, at `display`. **Exactly one.** | A section heading, a card title, or any value that is not the screen's subject. | ✅ |
| `Unit` | The unit beside an anchor value (`kJ`, `kg`, `%`). | Units inside rows — those are part of the value string. | ✅ |
| `ActionCluster` | **3–5** primary verbs under the anchor. | Navigation, or fewer than three actions — one or two is a full-width `Button`. | ✅ |
| `Section` | A titled block with the standard rhythm. `action` is one quiet affordance. | Wrapping a single row — that is just a `Group`. | ✅ |
| `Group` | The container rows live in. Rounded, inset hairlines, no padding of its own. | Free-form content. If it is not rows, it is a `Card`. | ✅ |
| `Row` | Any scannable list line. Three heights by content. | Prose. A row truncates; a sentence in one is a bug (found the hard way on the doorway screens). | ✅ |
| `Tile` | A browsable 2-up/3-up grid item. | A list. Tiles are browsed, rows are scanned — a list of tiles has no left edge to scan. | ✅ |
| `TileGrid` | The grid `Tile` sits in. | — | ✅ |
| `GroupNote` | One quiet line under a group. | Two sentences. That is a `Callout`. | ✅ |
| `StepHeader` | A multi-step flow's header — progress track **and** sentence. | A page title. Wizards only. | ✅ |
| `StepPanel` | One step's content. **Always** — it guarantees variant propagation. | Never hand-roll a keyed `motion.div` here; an object `animate` silently hides every variant-driven child beneath it. | ✅ |
| `StepActions` | The sticky bar at the bottom of a flow. | A screen's primary action — that belongs in the flow, not floating. | ✅ |

### Choice — `choice.tsx`

| Component | Use it when | Do NOT use it for | State |
|---|---|---|---|
| `ChoiceGroup` + `Choice` | Pick exactly one from a small set: plans, units, delivery options. Real radios, arrow-key navigable, one tab stop. | Multi-select (use `Switch` rows) or navigation (use `Row`). | ✅ |

**Always pass `Choice`'s `label`** when the option carries `tags`. Without it the
accessible name is the title *plus* the badge *plus* the price *plus* every chip,
and comparing two options by ear becomes impossible.

### Motion — `lib/animation.ts`

Never write a duration, curve or spring inline. If a value is missing here, add
it here.

| Export | Use it for |
|---|---|
| `DUR` (`instant` · `fast` · `base` · `slow` · `draw`) | Every duration. `draw` (900ms) is the one exception to "nothing is longer than `slow`": a chart drawing itself in is *content*, and at UI speed it registers as a flicker. |
| `EASE_OUT` / `EASE_IN_OUT` | Every curve. |
| `SPRING` · `SPRING_SNAP` · `SPRING_SOFT` · `SPRING_DRAG` | Every spring. Layout · small high-frequency things (pills, checkboxes, badges) · large things changing size · a drag returning to rest. All near-critically damped (ζ ≈ 0.92–0.97). |
| `atmosphereIn` `anchorIn` `contentIn` `chromeIn` | The four-tier entrance, in that order. |
| `contentStagger` | The spine container. No `delayChildren` — see the note in the file. |
| `settle` | A card appearing in place. **Scales down from 1.04**, never up. |
| `rowIn` / `rowStagger` | List rows: shorter rise, tighter stagger. |
| `stepPanelVariants` | Flow steps — labelled variants, so propagation survives. |
| `pressProps` / `pressPropsSubtle` | Press feedback. Subtle for large surfaces. |
| `dialogVariants` / `scrimVariants` / `sheetTransition` | Overlays. |
| `prefersReducedMotion()` | Anything rAF-driven that motion cannot see. |

`popIn` is a deprecated alias of `settle`. It used to scale **up**; do not
reintroduce that shape anywhere.

**Enforced by a lint.** `apps/app/src/motion.conformance.test.ts` fails on a
spring or a raw duration written at a call site. It has teeth: §8 claimed a
single source from the day it was written, and the app was carrying 16
hand-rolled springs across 13 tunings, most of them well under critical damping
— one at ζ = 0.40, a visible three-bounce wobble, on the check-off a client sees
several times a day. Two carve-outs, both deliberate: `delay:` (a stagger offset
belongs to the list) and `repeat:` (an ambient loop's period belongs to the
effect; the entrance ladder means nothing to something that never ends).

### Overlays — `overlays.tsx`

| Component | Use it when | Do NOT use it for | State |
|---|---|---|---|
| `Sheet` | **Doing** — anything with inputs. The mobile default. Title is `title-2`: it sits in the content and names the surface. | A yes/no question. | ✅ |
| `FixedDrawer` | A multi-step form where an accidental dismiss would lose input. Title is `title-3`: it sits in a header bar and is chrome. | Anything dismissible. | ✅ |
| `Dialog` / `ConfirmDialog` | **Deciding** — a confirmation, ≥`md`. | Forms. | ✅ |
| `DropdownMenu` | A short list of actions on an element. | Navigation between sections. | ✅ |
| `SegmentedControl` | 2–4 mutually exclusive views of the same data. | More than 4 — above the cap it truncates its own labels. Use `IconTabs`. | ✅ |
| `IconTabs` | 5+ tabs on one surface. Every tab is its icon; only the active one keeps its label, and the label grows in beside it — the same grammar as the bottom nav, so it needs no explaining. | Two or three tabs, where labels fit and icons are just decoration. | ✅ |
| `Select` · `Tooltip` · `Tabs` · `Avatar` | As named. | — | ✅ |

`IconTabs` generates its own `layoutId`: two instances sharing a projection id
makes the pill fly between them. Every item needs a real `label` — it is the
accessible name and the tooltip, and an icon alone is not a name.

All of them share one `overlayCls` scrim and one `FOCUS` ring constant. Both
exist because the alternative was tried: the `Sheet` hard-coded its own scrim
and lost the fade, and three focusable controls set `outline-none` with nothing
in its place, so tabbing through a dialog or a segmented control moved an
invisible cursor.

### Chrome — `shell.tsx`

| Component | Use it when | Do NOT use it for | State |
|---|---|---|---|
| `AppBar` | The top bar. `bare` lets an ambient wash bleed through it. | Carrying primary actions — chrome is recessive. | ✅ |
| `BottomTabs` / `NavRail` | Top-level navigation, ≤5 items. Animates in **last**. | Actions. | ✅ |
| `EmptyState` | A surface with nothing in it yet: one line of why, one action. | An error. Errors say what happened and what to do. | ✅ |
| `SettingsList` | Sections of setting rows. Built on `Group`/`Row`, so a settings row and a roster row are the same object. | An anchored screen — settings surfaces are lists and take no display numeral (§1). | ✅ |
| `InsightCard` | One event in a timeline: time, title, optional detail, optional 👍/👎. Animates on scroll-into-view, not on mount — a timeline is unbounded. | A list row. A feed item is read; a row is scanned. | ✅ |
| `WavyDivider` | A day break in a timeline. | Separating sections — that is `Section`'s own rhythm. | ✅ |

### Values — `metrics.tsx`, `rings.tsx`, `charts.tsx`

| Component | Use it when | Do NOT use it for | State |
|---|---|---|---|
| `StatCard` | A labelled number in a 1-up or 2-up grid, optionally with a chart under it. | The screen's subject — that is the `Anchor`. | ✅ |
| `MetricPill` | A compact tinted metric with an optional progress fill. | A row. A pill is glanced at; a row is scanned. | ✅ |
| `GlanceStrip` | 3 bare numbers split by hairlines — a deliberate break from the card rhythm. | More than 4 items, or anything needing a chart. | ✅ |
| `ProgressRing` / `TargetRing` | One value against a whole. | Restating the anchor. A ring under an anchor showing the same number is the §1 defect. | ✅ |
| `ChartCard` | A chart with a headline number. Three `value` states — see §5. | A chart with no story. If the title is the whole point, it is a `Section`. | ✅ |
| `NoData` | Rendered *by* the components above when their `value` is `null`. Call it directly only in a hand-rolled value slot. | A dash. Ever. See §5. | ✅ |

`isBlank(v)` is the shared predicate — `null`, `undefined` or `""`, and
deliberately **not** `0`.

### Product-side registries (in the app, not the package)

These are not components — they are the single source for a *vocabulary* that
more than one screen renders. They live in the product because they name domain
things, and they exist because in every case the copies had already drifted.

| Registry | Owns | Read by |
|---|---|---|
| `screens/client/scales.ts` | The 1–5 wellness scales: the word for each step, the endpoint captions, and which scales are **inverted** (`stress`). | The check-in / mood / sleep forms, the check-in detail sheet, the Wellness history rows. |
| `attention-ui.ts` | Icon + tone per attention type. | Coach Today, the roster, the client header. |
| `activityIcons.ts` | The glyph for an activity key, category default plus overrides. | The activity feed and the selected-activity header — **not** the picker chips (see §7). |

A screen that renders one of these must go through the registry, including for
`aria-label`s. "4 out of 5" as an accessible name is the same defect as "4/5"
on screen.

### Primitives and the rest

`Button` · `Card` · `Badge` · `Chip` · `Field` · `Input` · `Switch` · `Callout` ·
`IconBadge` · `Spinner` · `Skeleton` · `Separator` · `SectionHeader` ·
`FieldGroup` (form fields under a heading — **not** `Group`) · `ConfigRow`
(status + detail + state, for setup screens) · `Sparkline` · `MiniBars` ·
`WeekDots` · `MacroBar`.

### When you need something that is not here

1. **Compose first.** Most "new components" are a `Section` + `Group` + `Row`.
2. **Build it in the product** if it names a domain noun.
3. **Build it in the package** only on the second use, when you can see the diff
   between the two — and add a row to this table in the same commit.


---

## 14. Extraction map

What this language means for the packages, and the order to do it in.

### Goes to the shared UI package (product-agnostic)

**Tokens & theme** — the ladder, roles, type scale, radius ladder, motion
tokens, the tone-pair mechanism, tenant theming (`primary`/`radius`/border only).

**Structure** — `Screen` · `Section` · `Group` · `Row` · `Tile` · `Board` ·
`Atmosphere`.

**Controls** — `Button` · `Field` · `Search` · `Select` · `Switch` ·
`Segmented` · `Stepper` · `Slider` · `ActionCluster` · `FloatingAction`.

**Feedback & overlay** — `Callout` · `Toast` · `EmptyState` · `Skeleton` ·
`Sheet` · `Dialog` · `Menu` · `Popover`.

**Chrome** — `AppBar` · `TabBar` · `NavRail` · `Header`.

**Viz** — `Ring` · `Spark` · `Bars` · `Stat` · `Anchor` (the *shapes*; the
*meanings* are the product's).

**Motion** — the choreography (§8) as composable variants, not per-screen code.

### Stays in the product

Domain tone lists · every screen · every layout composition · copy · icon
choices · illustration · the nav configuration · anything whose name contains a
domain noun.

### The order

1. **Tokens first.** Nothing else can be right until the ladder, type scale,
   radius ladder and motion tokens are. Every current value in `tokens.css`
   gets re-derived against §2–§8.
2. **`Row` and `Group` second.** They are the most-repeated elements in the
   product; getting them right fixes more screens than anything else.
3. **`Atmosphere` and `Anchor` third.** These are the identity — the moment the
   product stops looking generic.
4. **Motion choreography fourth**, including inverting `popIn` to settle down.
5. **Then screen by screen**, top-tier surfaces first.

### The review checklist

Every screen, before it is called done:

- [ ] Exactly one T1 anchor, nameable in one noun
- [ ] ≤5 T2 actions; the 5th is "More" if present
- [ ] No group over 7 rows without "See all"
- [ ] ≥40% of the viewport is not ink
- [ ] ≤3 competing weights per viewport
- [ ] ≤2 levels of card nesting
- [ ] Text origins share one left edge; values share one right edge
- [ ] Anchor + primary action above the fold at 375×667
- [ ] Entrance follows the four-tier choreography; chrome is last
- [ ] No overshoot in any spring
- [ ] Zero banned words (§10); every button is a verb
- [ ] Status has a word, not just a colour
- [ ] Works at 200% text scale
- [ ] Correct in both themes
- [ ] Correct at 375, 768, 1100 and 1400
