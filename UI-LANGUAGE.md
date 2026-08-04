# UI LANGUAGE

> The interface language for every app Four Degree Labs ships. Product-agnostic
> on purpose: **nothing in this file may mention a domain** — no clients, no
> workouts, no invoices. Kova maps its screens onto this language in
> [KOVA.md](KOVA.md) Part II; the next app will map its own. When this file and a
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
geometry exactly — a skeleton that does not match is worse than a spinner) ·
`ActionResult` (the outcome of the last write in a section) · `SaveBar`
(result + button, in that order).

### Every outcome is a toast. Nothing is announced in place.

**After an action, the answer appears in one place — the toaster at the top —
and it is the same place every time.** Success and failure both.

This replaces an earlier rule ("a write that fails says so, in the place it
failed"), which was right that a silent failure is the worst outcome and wrong
about where to say it. Inline text lands wherever the section happens to be: at
the bottom of a long settings page, in a sheet scrolled to its footer, on a row
three screens down. It is frequently OFF-SCREEN at the moment it appears, so the
reader sees no change and no message — indistinguishable from the write having
worked. It also pushes the layout down under the thumb, moving the button they
were about to press again.

- **`ActionResult` routes both** and renders nothing. Every existing call site
  already hands it a `msg`/`err`, which is why the conversion is one component
  and not a hundred screens.
- **`toast.error` is assertive and dwells 8s** — the reader has to read it,
  understand what did not happen, and decide what to do. `toast.success` is
  polite and 3.5s.
- **Identical messages collapse** rather than stack. One problem firing from
  three rows at once is one toast.
- **`<Toaster/>` mounts once, at the app root**, outside the router and outside
  every screen transition. A toast that unmounts with the screen that caused it
  is the bug this replaces.
- **A validation error on a FIELD is not this.** It stays under its own field,
  because it names which input is wrong and the reader is looking at that input.
  Toasts are for the outcome of an ACTION.
- **A persistent STATE is not this either.** "Your studio is paused" is a
  banner: it is true until something changes, and a toast that disappears would
  be a worse account of it.

### A write that fails is never silent — two hooks make that structural

The rule above says WHERE the outcome appears. This one says that there is
always an outcome, and it is the older half of the same idea. Which hook applies
depends on whether the control has a Save button:

| The control | Use | Because |
|---|---|---|
| has a Save button | `useAction` | `try { await …} finally { setSaving(false) }` with no catch rejects into the app-wide "something didn't load" notice — generic words, and identical to a failed *read*. `run` cannot leave a rejection unhandled or a button stuck busy, and its result is what the toaster announces. |
| is instant (toggle, segmented picker) | `useConfirmedState` | `setState(next)` + a swallowed write leaves the control showing a value the server refused, until a reload silently reverts it. `commit` rolls back to the pre-apply snapshot and reports. |

**Enforced by a lint.** `apps/app/src/save-lifecycle.conformance.test.ts` fails on
either hand-rolled shape in a settings surface. Escape with
`save-lifecycle-exempt: <why>`. It was written against nine catch-less saves and
five swallowed optimistic writes that were live at the time.

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
- **An index nests.** A section that is itself five settings gets its own index
  rather than a longer page — same rows, same value-carrying sub-lines, one
  level down. The studio's Brand section is the case that proves it: 5,599px in
  a single card became five rows reading "Emerald · Brand surfaces", "0.95rem
  corners · Soft · Hairline", "Tab bar and page wash".
- **A split section keeps ONE save** *when it had one*. Brand's five sub-pages
  share a form, so the submit is reachable from every one of them — splitting it
  would let a half-applied theme exist. Sections whose parts save independently
  (Email's three, Sign-in's three) get no shared footer, because there is no
  shared state to half-apply. `SectionSplit` takes the footer as a prop for
  exactly this reason.
- **An unbounded list is not a screen, and truncating it silently is worse.**
  The operator console rendered every studio ever created — 61,541px in one
  scroll, with six other sections behind it. §1 chunks at seven; a list with
  nowhere to navigate TO grows in place instead, and the control says what it is
  holding back ("Showing 25 of 312 — show 25 more"). A list that quietly stops
  reads as a complete list that happens to be short.
- **A table of contents may not lie.** The console's Security row promised
  "sessions, admin access, and the nuclear reset" — it has never had the first
  two. And the section carried a starter EXERCISE LIBRARY, which is content
  seeding filed under security because it had nowhere else to be. Both fixed by
  saying the true thing and giving the orphan its own row.
- **Derive the row's value from the real flag, not from a lookalike.** The email
  templates row counted every template that HAD a subject — which is all of
  them, from the defaults — and told a studio that had changed nothing it had
  rewritten all thirty. The server already sends `customized`. A value that is
  confidently wrong is worse than no value: it is the only thing on the row, so
  there is nothing to contradict it.
- **One header per screen.** When a surface renders its own back + title for a
  section, its container must not render another — the two stack into a pair of
  back buttons, one of which goes somewhere the user did not ask for.
- **The page already has a title. Nothing inside it may say the title again.**
  The storefront page carried, in order: its own title, a page description, a
  `MARKETPLACE` eyebrow, a "Studio" scope badge, and a card headed "Your Shop"
  with its own two-line description — five layers of chrome and three different
  names for one thing, above the two switches you came for. A section header
  belongs on a page that genuinely holds more than one section, and nowhere
  else.
- **A scope badge is a symptom of a merged screen.** "Studio" on every studio
  section made sense while studio and personal settings shared a surface. Once
  each has its own titled page reached through its own door, the badge answers a
  question nobody is asking.
- **A settings screen configures what exists.** A card with an icon, a "Coming
  later" badge and four lines about an unbuilt feature is a roadmap entry taking
  a third of a page. If the absence needs explaining, explain it in one muted
  line at the bottom.
- **The ways out are rows, like everything else.** "Sign out" as a row beside
  "Delete my account" as a card with a heading, a paragraph and a button is two
  spellings of one idea. The consequence belongs on the confirmation, at the
  moment you are asked to accept it — not two taps earlier where it is only
  furniture.

### A component ships its own loading state, or it is not finished

**Loading is part of a component's definition, not something a screen bolts on.**
A component that renders data owes a `Skeleton` in the same file, exported
beside it, matching its real geometry — same heights, same gaps, same column
edges — so the arrival is a fill, not a re-layout.

- **Never a spinner where a skeleton fits.** A spinner throws the page away and
  rebuilds it; the reader loses their place every time. A spinner is for an
  action in flight inside a control, not for a surface.
- **The skeleton is the layout, not a grey blob.** Wrong geometry is worse than
  none: it teaches the eye a shape and then moves everything.
- **A failed load renders the FAILURE, never an endless shimmer.** `useLoad` and
  `LoadError` exist for this; a skeleton with no timeout is a screen that lies
  about still trying.
- **Screens do not hand-roll skeletons.** If a screen needs one the component
  did not ship, the component is unfinished — fix it there, where every other
  app gets the fix too.

### Motion comes from the registry, never from a number

Every duration, easing and spring in the product is in `lib/animation.ts`, and
**a hand-written `duration:` or `type: "spring"` is a lint failure** (§8, and
the `motion` rule in `@4dl/ui/conformance`). This is not pedantry: motion is how
an app feels consistent, and three screens with three timings feel like three
apps. Use the tier variants (`anchorIn`, `contentIn`, `chromeIn`,
`contentStagger`) so entrances are choreographed rather than simultaneous, and
respect `prefers-reduced-motion` through `MotionConfig` — never by branching in
a component.

### Collections: search, view, and a preference that is remembered

Any surface that lists things a person accumulates — people, plans, files,
templates — is a COLLECTION, and they all behave the same way. Consistency here
is worth more than per-screen cleverness: the reader learns one set of controls
and then knows every list in the product.

- **The search box is PINNED, not conditional.** It was previously revealed at
  eight items, on the reasoning that a search above four rows is a control
  asking to be used on a list you can already see. True of the control, false of
  the HEADER: one that grows a field when the ninth item arrives changes shape
  under someone who has already learned it, and until then the screen looks like
  a screen you cannot search — which is the thing people ask about. It also
  removed the box mid-keystroke, because the query changes the count that
  decided whether to show the box.
- **List and grid are both first-class**, and the choice is the reader's. A list
  favours identity and status; a grid favours images and scanning. Neither is
  correct for everyone, which is why it is a toggle and not a decision.
- **The toggle is ONE button carrying the icon of the other view**, labelled
  with the destination ("Show as a grid"). A two-button segmented pill is the
  shape for a setting; this is not one — there are exactly two views and you are
  always in one, so half the pill is permanently a no-op occupying the width the
  search field wants. No `aria-pressed`: it is a button that switches, not a
  toggle holding a state.
- **The choice is REMEMBERED, per collection, per device.** A view that resets
  on every visit is a view nobody switches twice. It is a display preference —
  it survives sign-out, like the theme, and it is never account data.
- **One header row holds them all**: search, the view toggle, and at most one
  primary action — the last as an ICON BUTTON, not a full-width filled one. A
  full-width primary above a collection is the loudest thing on a screen whose
  subject is the list, and it pushes that list a whole row down. The reader who
  needs the label is the one with an EMPTY collection, and the empty state
  already carries a labelled button; anyone with a list in front of them knows
  how it got there.
- **Every collection has four states and owes all four**: loading (skeleton in
  the chosen view's geometry), empty (one line of why, one action), no-results
  (different from empty — the reader typed something, so offer to clear it), and
  failed (what broke, and a retry).
- **Sort and filter are additive, never the default experience.** If the list
  needs a filter to be useful, the wrong things are in it. When it does have
  facets, they collapse to one `Filters` button on the same header row — see
  "Facets collapse to one button" below.
- **A row's actions go behind `···` once they are not the row's own job.** The
  row already opens the thing; anything else is rarer, and two unlabelled glyphs
  per row is eight on a screen of four, squeezing the name they sit beside. Two
  inline icons are *allowed* (§7 "How many actions a row may show") — they are
  not the default, and consistency across a product's lists beats saving a tap
  on an action taken twice a month.

### A detail screen's sections: a rail up to four, the header past that

A screen about ONE thing, cut into parts. Which control switches them is decided
by the COUNT, and there are only two answers:

| Sections | Control | Why |
|---|---|---|
| 2–4 | `SegmentedControl`, or `IconTabs` when the labels are long | one tap, every option visible, labels fit |
| 5+ | `SectionSwitcher` — the header IS the menu | a rail past four breaks in three ways at once |

**The three ways a rail breaks past four**, all of which shipped on one screen:

- **The targets go under the floor.** Six cells across 412px is 68px each, and
  after padding it is a 34×30 hit area. §12 says 44.
- **The labels go.** They stop fitting, so the rail becomes icons — six glyphs
  with no words is a guessing game the first ten times and a memory test after
  that.
- **It costs a row.** The identity of the thing needs a line and the rail needs
  another, both sticky. That is a fifth of a phone spent on chrome above any
  content.

`SectionSwitcher` puts them in the header: the bar carries the leading mark, the
title, and the CURRENT SECTION as its second line; tapping it opens every
section with a real label, a tone and a line saying what is inside.

- **It costs a second tap, and that is the trade.** The tap buys a readable
  label on every option, a 72px row instead of a 30px cell, a whole row of the
  screen back, and an eighth section without a redesign. Under five sections it
  is not worth it.
- **The header's second line is the one thing on it that changes.** The screen
  this came from wrote "COACH VIEW" there — true, permanent, and under a header
  only a coach can reach. A caption that is always the same is furniture.
- **In the menu, a check on the current one and nothing on the rest.** A chevron
  says "there is more inside this", which is wrong when what is inside is the
  screen you are already on; and shading the current row reads as disabled.

### Sectioning: how a long screen becomes a short one

A screen is long because it holds a lot, and that is allowed. A screen is
*unusable* because the reader cannot tell where one idea ends and the next
begins, and that is not. The rules below are what turn the first into a
navigable page instead of the second.

**The ladder, in order.** Reach for the smallest unit that works, and only step
up when the one below it has actually run out:

| The content is | Use | Never |
|---|---|---|
| one value or one switch | a `Row` in a `Group` | a card with a heading |
| 2–7 related controls | a `Group` under a `Section` title | seven cards |
| 2–5 groups on one topic | a `Section` | a page |
| more than 5 groups, or unrelated topics | an INDEX and a page each (above) | a longer page |

- **Seven is the chunking limit, everywhere.** More than seven rows in a group
  needs a "See all"; more than seven sections on an index needs grouping; more
  than seven items in a sentence needs a list. §1 sets it, and it applies to
  prose as well as to elements.
- **A section title is a NOUN PHRASE naming what is inside**, in sentence case,
  and it earns its place only when there is more than one section. "Rest timers"
  is a title. "Settings", on the settings page, is furniture.
- **Two levels of heading, at most, on any screen.** Section, then sub-section.
  A third level means the screen is two screens.
- **A sub-section has no chrome of its own.** It is a `caption`-weight label and
  the gap above it — not a card inside a card, not a second border, not an
  eyebrow. The gap is what makes it a sub-section; the box is what makes it
  noise.
- **Order by what the reader came for, then by what they change most.** Never by
  what the data model happens to return, and never alphabetically unless the
  reader arrives knowing the name.
- **Every section is independently comprehensible.** If a section only makes
  sense after reading the one above it, they are one section with a bad break in
  the middle.

### Cards are a boundary, not decoration

A `Card` says "these things belong together and are separate from what is around
them". That is its whole meaning, and it is spent the moment everything is a
card.

- **One idea per card** (§0.1). If it needs a sub-heading, it is two cards — or,
  far more often, it is a `Group` of rows and never needed the card.
- **A card with one control is a row.** The border adds a rectangle and no
  information.
- **Two levels of nesting, maximum**, and the second level must be a different
  shape (a group inside a card, not a card inside a card).
- **A card does not repeat the page.** If the page is titled "Notifications",
  the card is not headed "Notifications" — see the storefront case above, which
  stacked five names for one thing above two switches.
- **Sequential steps are not cards.** A flow is a flow: one thing at a time,
  with a way back. A column of five bordered boxes is a form pretending to be a
  wizard.
- **A card is not a way to add padding.** If something needs air, give it air.

### Every tab of one subject opens the same way

A tabbed surface is several screens sharing chrome (§1), and the fastest way to
make it feel like several *products* is to let each tab invent its own opening.
One client's tabs had, between them: an eyebrow with no control, a bare
segmented control with no eyebrow, a scrolling chip row, and a `SectionHeader` —
four devices in the space above the fold on four tabs of one person's record.

**Every one of them opens with an `Eyebrow` naming the surface, and its ONE
quiet control in the action slot.** A range picker, a lane picker, an add
button — whatever that tab's single scoping decision is. If a tab has two such
controls, one of them is not a scoping decision and belongs in the content.

### The assistant speaks on arrival, not on request

A generated note behind a **Generate** button is a feature nobody uses twice.
Two surfaces shipped that way — the coach's read of a client, and the check-in
summary — on screens the reader had opened *in order to* read exactly that.

So it generates on mount, and the button becomes **Refresh**. The cost is real
(a generation is metered), and the answer is a **content-hash cache**, not
restraint: key the result on a hash of the inputs, serve it for an hour, and let
the explicit Refresh bypass it. Arriving is then free, a material change
regenerates on its own, and the reader never presses anything.

Two rules go with it: while the first generation is in flight the surface shows
a **skeleton in the shape of the text**, not a spinner or a sentence about
waiting; and an auto-generated draft must never **overwrite something the user
is typing** — seed a reply box only on an explicit Refresh, and only when it is
empty.

### Creating a thing is an event. It does not live on the screen.

A form the reader is not filling in must not be on screen. This sounds obvious
and is broken constantly, because the form is the part someone built first and
the readouts got added above it.

The screen that made the rule: a client's goal. Reading the goal in force is
something a coach does every visit; setting a new one happens every six or eight
weeks. The screen was eleven inputs, three selects and a Save button occupying
its middle **permanently**, with the live goal as a card above them and every
past one as a paragraph of dense text at the bottom. The thing you came for was
the smallest element on it.

- **The current state is the page.** In full, first, as the anchor (§1).
- **Creating or replacing it is a `Sheet`** behind one button, prefilled **at
  open time** — not once at mount. A composer prefilled at mount shows numbers
  from before whatever the user just went and did.
- **The consequence goes on the sheet's footer button**, in words: `Replace
  "Cut — 8 weeks"`, not `Save`.
- **The outcome is a toast** and the sheet closes. Both, or neither — a sheet
  that stays open after a success reads as a failure.

The same shape applies to any screen whose subject has one live version and a
history: a plan, a price list, a policy, a goal.

### Facets collapse to one button

A browsable collection grows facets, and the obvious rendering — one
horizontally-scrolling chip row per facet, under the search box — is what
everyone reaches for and it costs the screen twice: two facets is two extra
rows above the first result, and each row is a scroller, so half of every
facet's options are off the edge with nothing saying so.

`Filters` (§13) is one button carrying the active count, opening a sheet where
the options WRAP and all of them are visible at once. Same trade as
`RangePicker`: a facet is set and then read from for a while.

Three rules go with it, and the component enforces the first two:

- **One option per facet.** Multi-select reads as "narrower" and behaves as
  "wider", which nobody predicts.
- **A facet that cannot split the set is dropped.** One option filters nothing —
  tapping it narrows the list to everything already on screen.
- **The button says how many are on.** A control that hides state must say it
  has some, or the list looks broken.

### A history is a series. One picker drives the chart AND the list.

When a screen holds several versions of the same thing over time, the question
is never "what were they" — it is "how did they move". So:

- **The list is chronological and every row carries the same value**, with its
  change from the row before it (`Delta`, §13).
- **A chart above it, from two entries.** One is not a comparison — the same
  floor `GlanceStrip` has — and a one-bar chart is worse than the sentence
  "there is only one so far".
- **ONE control picks the metric, and it drives both.** Two controls let them
  disagree, and a list whose right-hand column silently means something other
  than the chart above it is worse than no column at all.

### The component you want already exists

The registry (§13) is the answer to "how do I build this". Before writing a
`div`, find the row in that table. Hand-rolling is how the same idea ends up
with three spellings, and the drift is never noticed at the moment it happens —
it is noticed a year later, as "the app feels inconsistent", with no single
change to point at.

| You are about to build | Use instead |
|---|---|
| a bordered box with a title and children | `Card` + `Section` |
| a list of label→value lines | `Group` of `Row`s |
| a `<select>` | `Select` — it cannot render a value that is not in its options |
| a loading spinner over a whole screen | `Skeleton` matching the real geometry |
| a "no data yet" paragraph | `Empty` — one line of why, one action |
| a toast for a failed save | the section's own `ActionResult` (§7) |
| a modal for a sub-task | `Sheet` (§7) |
| a coloured dot for status | a `Badge` with a WORD in it |
| a number rendered large | `Anchor` or `Stat` |
| a tab strip over settings | an index and a page each (above) |

If nothing fits, the language needs a change — propose the component, do not
add a local one. A component that exists in one screen is a component that will
be re-invented differently in the next.

### It has to feel like an app, not a website with an account

This is the difference between "works" and "good", and it is almost entirely
about what happens between the tap and the result.

- **A tap gets a response inside one frame.** Not the result — the
  acknowledgement: the pressed state, the disabled button, the optimistic value.
  Anything that waits for the network to acknowledge a tap feels like a web page.
- **Never a full-screen spinner where a skeleton fits.** A skeleton in the
  real layout keeps the reader oriented; a spinner throws the page away and
  rebuilds it, and the reader loses their place every time.
- **A sub-task is a sheet, not a navigation.** Going somewhere and coming back
  is for changing subject. Picking a value, confirming, editing one field —
  those happen in front of the screen you are on, so the context stays visible
  and Back does what Back means.
- **Back never surprises.** Every overlay, sub-page and step is addressable and
  closes in the order it opened. A Back that exits the whole surface from three
  levels in is the single most disorienting thing an app can do.
- **State survives the trip.** Scroll position, the open section, the typed
  draft. Losing them on a rotate, a reload or a Back is what "web page" feels
  like.
- **Nothing moves after the reader starts reading.** Content that arrives late
  reserves its space first (§9). A layout that reflows under the thumb causes
  mis-taps, and a mis-tap on a destructive row is a bug report.
- **One primary action per screen, and it is reachable by thumb.** If two things
  compete for primary, one of them is not.

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
- **Say what it DOES, not what it IS.** Every string on a control answers "what
  happens if I use this", from the reader's side. "Clients can sign themselves
  up" beats "Self-registration enabled"; "Nobody can sign in until this is set"
  beats "Required field". A description of the mechanism is documentation
  written in the wrong place.
- **A 1–5 scale must say which end is which.** Five faces with no endpoint
  captions is only guessable for mood; on Energy it is a coin flip and on Stress
  it was *wrong*, because the stored direction (5 = worst) was the opposite of
  what the ascending glyphs implied. Every scale names its ends, shows the
  chosen step in words, and any inverted scale renders inverted everywhere it
  is read back. The words live in one registry — `screens/client/scales.ts` —
  because three surfaces render them and they diverged the moment they didn't.

### Budgets — the numbers that make "concise" enforceable

"Be concise" is advice nobody has ever failed to agree with and nobody can be
held to. These can be counted, which is the point. Over budget is not a style
opinion; it is a defect with a number attached.

| Where | Budget | If you are over |
|---|---|---|
| Section intro | **1 sentence**, ≤ 15 words, and only on a section page | the sections are named wrong — fix the names |
| Field hint | **≤ 12 words**, one line at 375px | the label is wrong, or it belongs in the Help Center |
| Empty state | **1 line of why + 1 action** | you are writing documentation inside a screen |
| Error | **1 sentence**: what happened, then what to do | split the causes and say the one that happened |
| Confirmation | **1 sentence naming the consequence** + the verb on the button | the action is doing more than one thing |
| Row sub-line | **the current value**, not a description | you have put the index's job on the page |
| Tooltip | **≤ 10 words** | it is not a tooltip |

Two rules that outrank all of them:

- **Nothing explains a control the reader can just try.** Reversible, obvious
  actions get no prose. Prose is for what is IRREVERSIBLE, what costs money, and
  what will not be obvious afterwards.
- **When it genuinely needs more, it needs a different surface.** A paragraph on
  a settings page is a Help Center article that lost its way. Link to it; do not
  inline it.

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

**Every component in `@4dl/ui`, what it is for, and — more usefully — what it is
NOT for.** This section is the working reference: check here before building
anything, and add to it in the same commit that adds a component. A component
that is not listed here does not exist as far as the next screen is concerned.

Marked **✅** where the component is language-conformant today, **◻︎** where it
works but predates the language and is still on the list (KOVA.md Part II tracks the
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

`Row`'s `iconTone` tints the squircle when the **kind** of a row is meaningful
and repeated — a feed of mixed event types, an index, a picker — so the list is
scannable by colour as well as by word. Reach for it instead of
`leading={<IconBadge …/>}`: `leading` is the avatar slot and forces the row to
its 72px height, and two row heights in one list is exactly what §2's fixed
heights exist to prevent.

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

**`SegmentedControl` and `IconTabs` are one control at two label densities, and
they share a physical standard**: `min-h-11` (the §12 floor), the same
`border-border/50` hairline, the same spring. They had drifted — the icon rail
was 44px inside a real border with equal-share segments, the segmented control
was 30px in a borderless fill sized by its text — so a tabbed surface with a
filter on it read as two unrelated widgets. Pick between them on LABELS, never
on looks: up to four that fit, `SegmentedControl`; more than four,
`IconTabs`.

| Component | Use it when | Do NOT use it for | State |
|---|---|---|---|
| `Sheet` | **Doing** — anything with inputs. The mobile default. Title is `title-2`: it sits in the content and names the surface. | A yes/no question. | ✅ |
| `FixedDrawer` | A multi-step form where an accidental dismiss would lose input. Title is `title-3`: it sits in a header bar and is chrome. | Anything dismissible. | ✅ |
| `Dialog` / `ConfirmDialog` | **Deciding** — a confirmation, ≥`md`. | Forms. | ✅ |
| `DropdownMenu` | A short list of actions on an element. | Navigation between sections. | ✅ |
| `SegmentedControl` | 2–4 mutually exclusive views of the same data. | More than 4 — above the cap it truncates its own labels. Use `IconTabs`. | ✅ |
| `IconTabs` | **Exactly 4**, where the labels are too long to sit side by side. Every tab is its icon; only the active one keeps its label, and the label grows in beside it — the same grammar as the bottom nav. Each tab is an equal share of the bar and 44px tall. | Two or three, where labels fit and icons are decoration. **Five or more** — that is `SectionSwitcher`. | ✅ |
| `SectionSwitcher` | **5+ sections** on a detail screen about one thing. The header carries the leading mark, the title and the CURRENT SECTION; tapping it lists them all with labels, tones and a line each. One row of chrome instead of two. | Fewer than five, where a rail still labels everything in one tap. Top-level navigation — that is the tab bar. | ✅ |
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
| `Delta` | A change between two versions of a number: its size, its direction, and whether that direction is good. | A value. A delta is always secondary to the thing that changed. | ✅ |
| `NoData` | Rendered *by* the components above when their `value` is `null`. Call it directly only in a hand-rolled value slot. | A dash. Ever. See §5. | ✅ |

`isBlank(v)` is the shared predicate — `null`, `undefined` or `""`, and
deliberately **not** `0`.

`Delta` settles three things every hand-rolled version decided differently:
the direction is an **icon** (a `+`/`−` at caption size is one pixel wide and
vanishes beside a numeral); the tone comes from **`goodWhen`**, not from the
sign, because a rise is good for protein and bad for body fat; and **zero says
so in words** rather than rendering `+0`, which is a badge drawing attention to
the news that nothing happened. `goodWhen` defaults to neutral — most changes a
product shows are neither good nor bad, and a component that guessed would be
confidently wrong half the time.

### Tiles — `tiles.tsx`

The shapes a placed widget can take in a hero grid. The grid is 2 columns × 3
rows; `TILE_FOOTPRINT` is the single source of truth for how much of it each
form occupies, read by the packer, the renderer AND the builder's preview, so
the three cannot drift.

| Component | Footprint | Use it when | Do NOT use it for | State |
|---|---|---|---|---|
| `TileCard` | 1 × 1 | A compact labelled number. | A value that needs a shape to be read. | ✅ |
| `TileStat` | 1 × 2 | A number with **no denominator**. | Anything with a target — that is a ring. | ✅ |
| `TileRing` | 1 × 3 | A value against a target. | A target-less number. See below. | ✅ |
| `TileTrend` | 2 × 1 | A direction over time. | Fewer than 2 points — it renders `NoData`. | ✅ |
| `TileBars` | 2 × 1 | A handful of discrete periods. | A continuous series — that is a trend. | ✅ |
| `TileWeek` | 2 × 1 | Which days of a week are done. | Any other period. | ✅ |

**`TileStat` exists because of `progress={0.001}`.** Every target-less metric —
weight change, calories burned, sets logged, body fat, pending labs, and all
eight coach roster counts — was drawn as a ring with a token progress value, to
borrow the ring's size without claiming a target. But a ring IS a claim that
there is a whole to fill, and an always-empty one is indistinguishable from a
real target the client is failing. A number with no denominator now gets a form
that does not draw one.

**A widget declares which forms suit it**, and the picker only offers those, so
the rule above is structural rather than a convention to remember: a metric with
no target has no `ring` in its `forms`, and there is no way to select one.

**A tile's colour comes from a registry, never from the tile.** Kova's widgets
read `METRICS[...].tone`, and the coach tiles that count an attention type read
`attentionCoding()` — the same SSOT the roster feed uses, because the hero and
the feed sit on one screen and one number must not have two colours. Enforced by
`widget-coding.conformance.test.ts`; note that every tone it was written to catch
was already a legal token, so the check is provenance, not validity.

**A form the page cannot fit is offered greyed, with the reason.** `fits()`
answers whether a form still has room; a disabled chip with no explanation is a
dead end (switch a ring to a card and the way back becomes invisible), so the
toolbar says what would free the space instead.

### Collections — `collection.tsx`, `filters.tsx`

| Component | Use it when | Do NOT use it for | State |
|---|---|---|---|
| `Collection` | ANY list of things a person accumulates. Owns the header row and all five states; `renderList`/`renderGrid` stay yours. | A fixed set of options — that is a `Group` of `Row`s. | ✅ |
| `useCollectionView` | The list/grid preference. Keyed on the COLLECTION, prefixed `4dl.view.`, deliberately outside any app's sign-out sweep. | Anything that is account data. | ✅ |
| `ViewToggle` | Rendered *by* `Collection`. Call it directly only in a header you own. | A two-button pill — see §7. | ✅ |
| `Filters` | Browse facets. One button + a sheet; drops facets that cannot narrow, counts the ones that are on. | A single either/or — that is a `SegmentedControl`. | ✅ |

The header row is fixed in this order: **search · filters · view · action**.
Every collection in the product then puts the same control in the same place,
which is the entire point of the component — four screens that each invented
their own arrangement is what it replaced.

`Collection` takes `items: T[] | null`, and `null` is what makes the loading
state work. Passing `[]` while a request is in flight renders the EMPTY state
for a moment — "no clients yet" flashing on a studio with forty of them.

### Dates — `dates.tsx`

| Component | Use it when | Do NOT use it for | State |
|---|---|---|---|
| `DatePill` | One date the user can change — a range endpoint, a single field in a filter row. | A date you only *display*. That is text. | ✅ |
| `DayNav` | The whole screen is scoped to one day and the user steps through days. | Two-way range selection — that is `RangePicker`. | ✅ |
| `RangePicker` | A screen scoped to a **window**. One chip in the section header; presets and a custom start→end live in the sheet it opens. | A single date (`DatePill`) or a day-stepper (`DayNav`). | ✅ |
| `useDateRange` | The state behind it: the preset, the custom window, and the query string — computed from one value. | Holding `range` + `customStart` + `customEnd` yourself and rebuilding the query at the fetch site. | ✅ |

`RangePicker` is **one chip in the section header**, not a bar. Three versions
came before it and each failed differently: 7/30/90 and nothing else (no way to
ask for "since the phase started"); a fourth cell that GREW A ROW of date pills
when pressed, pushing the screen down under the reader; and a bar that WRAPPED —
presets plus a calendar button is ~200px of chrome, so next to a lens rail on a
390px phone the screen opened with two rows of controls stacked above any
content.

So the chip says what window is in force ("Last 30 days", "4 Jul – 3 Aug") and
the sheet holds everything else: the presets as rows, each showing the dates it
covers, and a custom start→end under them with the whole-calendar shortcuts a
row never had space for ("This month", "Last month", "Year to date" — the
windows people name out loud, none of which is expressible as "N days back").

The cost is a tap to change range, and it is the right trade: a range is
something you set and then read from for a while, not a switch you flip every
few seconds. Presets apply on tap and close; the footer button applies the
custom draft only — so the footer never means two different things depending on
what you touched last.

`useDateRange` exists because the two screens that had a range held it
differently and one of them built its query string from a ternary at the fetch
site, two hundred lines from the control. `props` and `query` come from the same
value, so a bar showing "45d" cannot be fetching thirty.

`today` is a **required prop** on both, for the same reason `DayNav` does no
date math: the app's day is the user's local day, and a component that read the
clock would be a day out for anyone whose device is not on the server's
timezone.

`surface` is the one decision they share: `"solid"` on ordinary background,
`"translucent"` where the control sits over the T0 atmosphere (§1: "T4 is
translucent"). Both existed as hand-rolled copies on Today and Progress with
different radii and different surfaces before this — the difference was real
(one is over atmosphere) but nobody had decided it, so it read as drift.

Everything in the bar is `rounded-full` and 44px tall — the arrows AND the
centre. The centre pill is a button (pressing it opens the picker), and
`tokens.css` is explicit that `radius-full` is the ACTION radius while
`radius-sm`/`xl` is the IDENTITY one, and that the two are never mixed. Today's
hand-rolled version had the centre at `rounded-xl` between two round arrows —
one row, two pressable shapes — and its arrows at 36px, under any usable touch
floor (§4 holds rows to 48).

Three more rules `DayNav` encodes, each from a defect it shipped with:
- **The forward arrow disables at the boundary, it does not disappear.** A
  vanishing control teaches nothing; a dimmed one teaches the edge.
- **The reset sits in an always-reserved slot.** It used to be a row that only
  existed off-today, so every step backwards pushed the screen down a line.
- **The reset is muted, not accented.** It is chrome (§1, T4), and T4 is never
  accented.

Neither does date math. The caller owns the calendar, because the app's day is
the *client's local* day (`date_local` from the device) and a UTC shift inside a
shared component would be off by one for everyone outside UTC.

### Settings — `settings.tsx`

| Component | Use it when | Do NOT use it for | State |
|---|---|---|---|
| `SettingsIndex` | The table of contents for a configuration surface. Groups of rows; each row's sub-line says **what is inside**. | A list of data (that is `Group`/`Row`). An index's rows are doors, not records. | ✅ |
| `SettingsPage` | The frame around one section: back, title, and **one** line of description. | A section that needs a paragraph — if it does, its rows are named wrong. | ✅ |
| `SectionDetail` | A section that is itself several settings: an index of sub-pages, one open at a time, each row stating its **current value**. | Two or three controls that fit on one page. Splitting those buys a tap and costs a screen. | ✅ |
| `SaveBar` | The bottom of an editable section: result, then a full-width button. Pass `dirty` and it disables itself when nothing changed. | A section with no explicit save. An instant control belongs on `useConfirmedState`, whose failure surface is `ActionResult`. | ✅ |

`SectionDetail` is **controlled and router-free**: `openKey` + `onOpen` are
props, because this package has no router dependency and must not gain one — a
design system that imports one cannot be consumed by an app using a different
one. The product binds it to whatever its navigation is (Kova: a query param per
section, so Back steps out one level at a time). `SettingsIndex` and
`SectionDetail` are the same rows at two depths, which is why this file is thin.

`footer` on `SectionDetail` renders under the index and every sub-page. Pass one
**only** when the sub-pages share form state and must therefore share a submit;
a split that gives each sub-page its own save can leave a half-applied
configuration behind. Sections whose parts save independently pass nothing.

### Product-side registries (in the app, not the package)

These are not components — they are the single source for a *vocabulary* that
more than one screen renders. They live in the product because they name domain
things, and they exist because in every case the copies had already drifted.

| Registry | Owns | Read by |
|---|---|---|
| `screens/client/scales.ts` | The 1–5 wellness scales: the word for each step, the endpoint captions, and which scales are **inverted** (`stress`). | The check-in / mood / sleep forms, the check-in detail sheet, the Wellness history rows. |
| `attention-ui.ts` | Icon + tone per attention type. | Coach Today, the roster, the client header. |
| `screens/SectionSplit.tsx` | Binding `SectionDetail` to the router — the open sub-page in a query param. | Every split settings section. |
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
- [ ] ≤2 heading levels; every section independently comprehensible
- [ ] Every card holds one idea; no card with a single control
- [ ] Nothing hand-rolled that §13 already ships
- [ ] Every string is within its budget (§10)
- [ ] Screenshot-ready with real data: no empty state, no lorem, no placeholder
      name, nothing cut off (§16)

---

## 15. The upgrade, page by page

The product is being brought up to this document one surface at a time, and the
method matters as much as the standard — a sweep that changes forty screens
shallowly leaves forty screens still wrong.

**One page per pass, and the pass is not done until all of it is done:**

1. **Read the screen against §0 and the review checklist.** Name what is wrong
   before touching anything.
2. **Whatever is generic goes to `@4dl/ui` first.** If the fix is a component,
   it is built or extended in the package — not in the screen. Every other app
   gets it in the same commit. A fix that lands in a screen is a fix the next
   app re-invents.
3. **Rebuild the screen on the shared components.** Delete the local
   equivalents; a leftover local copy is what drift is made of.
4. **All four states**: loading (skeleton, real geometry), empty, error, full.
5. **Both themes, both widths.**
6. **Photograph it** (§16 below) and look at the images. The suite finds what
   the browser you built it in does not.
7. **Document it** — the Help Center topic for that surface, with those images.

The order is deliberate: the shared component before the screen, the screen
before the picture, the picture before the words. Reverse any two and the
documentation describes something that is about to change.

**The reference for feel is a modern consumer finance app** — Revolut in
particular: one grouped card holding a list, generous rows, a search and the
view controls on a single line above it, an identity mark at 44–56px with a
small status badge over its corner, the value stack on the right, and a floating
pill tab bar. Not to copy pixel for pixel; to match the standard of restraint
and the amount of air.

---

## 16. Screens as evidence

Every screen is photographed. Not occasionally — **systematically**, by the
screenshot suite, in both themes and both widths, on a studio seeded with a
realistic amount of realistic data. Those images are the marketing site, the
Help Center, and the design review, and they are all the same images.

This is a design rule, not a tooling note, because of what it forces:

- **A screen you cannot screenshot is not finished.** If it only looks right
  with three items and the real number is thirty; if the copy wraps to four
  lines at 375px; if a name longer than "Sam" breaks the row — the screenshot
  shows it, every time, and it shows it before a customer finds it.
- **Empty states are photographed too, and separately.** They are a real state
  with real readers (day one of every account) and they are the state every
  review used to be conducted in by accident. Both are captured; neither stands
  in for the other.
- **The data is plausible, never uniform.** Perfectly regular seed data hides
  layout problems — every row the same width, every number the same digit count.
  Missed days, drifting values, one very long name and one very short one: that
  is where cramming and bad wrapping live.
- **No placeholder ever reaches an image.** No "Lorem", no "Test Client 1", no
  `1234`. A screenshot with a placeholder in it teaches the reader that the
  product is a demo.
- **The same screen, both themes, side by side.** Half of what breaks in light
  mode is invisible to whoever built it in dark, and the pairing is the only
  reliable way to see it.

**A caption is part of the screenshot.** An image in the Help Center or on the
marketing site carries one line saying what the reader is looking at and what
they would do next. An uncaptioned screenshot is decoration, and decoration is
what a reader skips.
