# UI LANGUAGE

> The interface language for every app Four Degree Labs ships. Product-agnostic
> on purpose: **nothing in this file may mention a domain** — no clients, no
> workouts, no invoices. Kova maps its screens onto this language in
> [DESIGN.md](DESIGN.md); Scena and Bocca will map theirs. When this file and a
> product file disagree, **this file wins**.
>
> This is the extraction target. Everything specified here belongs in the shared
> UI package. Everything a product needs *beyond* here belongs to that product.

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
- **T2 tops out at five.** Four is better. The fifth slot, when needed, is
  always **More** — never a fifth real action.
- **T3 chunks at seven.** More than ~7 rows in one group gets truncated with a
  **See all** row. Scroll is fine; an un-chunked wall is not.
- **T4 is translucent, unlabelled where an icon suffices, and never accented.**
  The tab bar does not use the brand colour except on the active item.
- **Nothing spans two tiers.** A card that is both the anchor and a list is two
  components stacked, not one clever one.

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

**Numerals:** `tabular-nums` and `−0.02em` on every number, always. A number
that reflows as it ticks is a bug.

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

---

## 11. Desktop

Not a second design. **The mobile column is the unit; desktop adds columns
around it.**

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

## 13. Extraction map

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
