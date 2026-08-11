---
kind: contract
verified: 2026-08-09
---

# Northlight — the interface language

> The design system every ONE app renders through. [PLAN.md](PLAN.md) §3.6 draws
> the line between what the renderer owns and what an app owns; this is what the
> renderer owns, and why it is shaped this way.
>
> ⚠️ **§1 is the section everything else falls out of.** It answers what is
> themeable, and the answer is the mechanism rather than a list: *the ground is
> painted, the furniture is lit by it, and ink is measured.* §2's semantics, §4's
> motion and §7's ambience are consequences of it, not separate policies.

---

## 0. The name

**Northlight.** North light is the studio painter's window: constant, indirect,
colour-true, unchanged from morning to evening. It is the light you judge a
colour in — which is exactly what this system is. A tenant supplies the pigment;
the system supplies a light in which any pigment reads correctly.

Shortened to **north** in conversation. The three alternates and why they lose:

| | argument against |
|---|---|
| `mocha` | a colour name on a system whose central claim is that it holds no colour of its own — and `mocha` is a JavaScript test runner, so in a repository it reads as one |
| `timeless` | naming yourself your own aspiration. It can only ever be falsified |
| `oneui` | Samsung's, and one character from `@one/ui`, which is the package |

⚠️ **The package stays `@one/ui` whatever the language is called.** The name is
for the language, the documentation and the design conversation — not for an
import path — so changing it later costs a find-and-replace in prose. Do not let
it become load-bearing.

---

## 1. What is themeable

Three layers. Only the first is painted.

| | | themeable |
|---|---|---|
| **Ground** | canvas, surfaces, the ambience wash, the rails, the shell | **yes — this is where brand lives** |
| **Furniture** | cards, rows, buttons, inputs, sheets, chips | **shape only.** Colour is *derived from the ground it stands on* |
| **Ink** | text, icons, semantic signals, focus rings | **never.** Always computed against whatever it lands on |

The one-sentence version: **a component never names a colour and never receives
one — it names a role, and the role resolves against its ground at render time.**

### 1.1 The brand contract — a bounded set of slots, each with a safe range

A tenant may set exactly these. The list is closed, and closing it is what makes
whitelabel a feature rather than a support burden.

| slot | range | what it moves |
|---|---|---|
| `accent` | any hue; chroma and lightness are re-fitted per ground (§1.3) | the one accent — primary action, active nav, focus |
| `ambience` | a **family** (hue + intensity), chroma-capped | the ground wash behind an anchor (§7) |
| `radius` | 8 – 24 | the whole shape ladder, proportionally |
| `edge` | `none` \| `hairline` \| `defined` | border weight and where borders appear at all |
| `elevation` | `flat` \| `soft` | whether floating things carry a shadow in light mode |
| `density` | `comfortable` \| `compact` | one step on the spacing scale; never on the type scale |
| `type` | from a curated set | the family only — never the size, weight or tracking ladder |
| `logo` | mark + wordmark, light and dark | identity slots in the shell, auth, email, PWA, error pages |

⚠️ **Every value in every range is safe, and that is the invariant, not the
aspiration.** A slot's range is chosen so no combination inside it can produce an
unreadable screen. "A tenant's bad palette is not their problem" is a claim that
has to be true by construction — and it is only true if the brand surface is
small enough to prove exhaustively. Eight bounded slots can be swept; an
open token map cannot.

**What is deliberately NOT themeable, and why each would break something:**

- **Semantic hues.** Danger is not a brand decision. A tenant who could set it
  could make a delete confirmation read as a success. §2.
- **The type scale.** Sizes, weights, tracking and line-heights are one ladder.
  A family swaps; the rhythm does not.
- **Spacing.** `density` moves the whole scale one step. Individual values are
  not exposed, because the 40% ink rule (§5) cannot survive them being.
- **Motion.** §4 — the whole argument there is that timing is global.
- **`*-foreground` tokens.** Derived by measurement (§1.3). Offering them would
  let a tenant pair a colour with ink that fails against it, which is the one
  thing the token exists to prevent.

### 1.2 Furniture is lit, not painted — relative surface stepping

A component does not ask for `surface-2`. It asks for **one step from its
parent**, and the step is computed in a perceptual colour space from the ground.

```
step(n) from the current surface:
  ΔL    a fixed perceptual lightness delta, in the direction with more headroom
  ΔC    a fraction of the ground's chroma, so branded ground tints its furniture
  H     the ground's hue, unchanged
```

Three consequences, and all three are the point:

- **A card on a coloured ground is a coloured card, automatically.** Nobody
  chooses a green card colour for the green screen. The tint is inherited.
- **Nesting cannot collide.** Each step is a guaranteed perceptual distance from
  the one below it, so a card inside a card inside a sheet is legible without
  anybody counting levels. The direction flips when a step runs out of headroom
  — near-white grounds step down, near-black grounds step up — which is why the
  ladder does not saturate at either end of either theme.
- **A wild accent cannot break it**, because no step is expressed as a constant.

⚠️ **THE ACCENT IS RE-LIT AGAINST THE GROUND; IT IS NEVER RECOMPUTED PER
SCREEN.** `accentOn(ground)` keeps the tenant's hue and re-fits lightness and
chroma until it clears its contrast floor on that exact ground. The brand colour
is therefore recognisably itself on every surface in the product, and legible on
all of them.

This is the honest answer to "how does a button stay readable on a coloured
page". The tempting answer is to let the page choose a new primary — which
produces a product whose brand colour is a different colour on every screen,
where the button you press is a different button each time, and where the tenant
who set their accent does not see it. Re-lighting solves the readability problem
without giving up the identity.

### 1.3 Ink is measured, never chosen

The on-colour for any fill is computed: the contrast ratio of near-white **and**
near-dark against that exact resolved colour, keep the winner. Not a lightness
threshold — a threshold mis-calls mid-lightness saturated colours, where both
candidates are borderline and the rule picks the wrong one silently.

The floor is **AA (4.5:1) for text and 3:1 for meaningful non-text**, everywhere,
including on a tenant's worst legal accent. This is checked, not assumed: §10.

### 1.4 What "premium" is, materially

Stated concretely so it can be reviewed rather than felt.

1. **Depth from tone, not from blur or shadow.** Separation is a surface step, a
   radius and space. Shadows exist only in light mode, only on floating things,
   and only when `elevation: soft`.
2. **Restraint with the accent.** One accent per screen: the ambience, the
   primary action, the active nav item. Colour used sparingly is what reads as
   expensive; colour used everywhere reads as a template.
3. **Optical hairlines.** A border is a token that resolves against device pixel
   ratio. A literal `1px` is heavy at 1×, invisible at 3×, and a system that
   hardcodes it looks different on every screen it ships to.
4. **Type does the work.** Large numerals, tight tracking, tabular figures, one
   family, never a weight above 700. The number is the story.
5. **Space is structural.** At rest, at least ~40% of any viewport is not ink.
6. **Motion settles.** Things arrive by coming to rest, never by growing or
   bouncing. §4.
7. **No gradient on furniture.** Gradients belong to the ground and to nothing
   else. A gradient button is the single fastest way to date an interface.

### 1.5 Why not glassmorphism

It is the obvious answer to "what works on any background" and it is the wrong
one, for a reason that is structural rather than stylistic: **translucency makes
contrast a property of whatever happens to be behind an element**, which is
exactly the thing a design system cannot leave unbounded. A blurred panel over a
photograph, over a chart, over a dense list and over an empty canvas produces
four different contrast ratios for the same component, and only measurement at
render time could tell you which of them fails.

Relative surface stepping answers the same question — *what works on any
background* — with a computed opaque surface whose contrast is known before it
paints. It is the same idea done in the colour space instead of in the
compositor: cheaper, provable, and it does not date.

Translucency survives in exactly two places, both where it is a *statement about
layering* rather than a way of avoiding a colour decision: the app bar and tab
island blur the content scrolling beneath them, and a scrim dims what an overlay
is covering.

---

## 2. Semantics on branded ground

The sharp case: a success message on a green ambience.

⚠️ **Contrast is not distinguishability.** Green-on-green can pass AA and still
fail completely, because a signal's job is to differ from its *context*, not
merely to be readable. A rule that only checks contrast ratios ships this bug.

**The rule: a semantic signal differs from its ground on at least two axes.**

The axes are: **word**, **icon**, **container**, **tone**. Tone is the least
load-bearing of the four and the first to be given up.

- On neutral ground: tone + word. The familiar case.
- On branded ground where the semantic hue is close to the ground's, the
  renderer **demotes the tone to an edge and an icon** and raises the signal onto
  a neutral stepped surface. Same component, contained form, no author decision.

**Collision is detected, not guessed.** The renderer compares the semantic hue
and chroma against the resolved ground; under a hue-distance threshold at
comparable chroma, the contained form is selected. An app never writes a
conditional about this and never learns the threshold.

Two policies that make the case rare in the first place:

- ⚠️ **Outcomes do not live on the ambience.** Toasts, dialogs and callouts are
  platform surfaces on neutral ground — the platform owns the surface for a
  result (MANIFEST.md §2), so "success on a green page" is mostly a question
  that does not arise. Where it does arise it is an *inline* status — a chip in a
  row, a badge on a tile — and that is precisely what the contained form is for.
- **Ambience is chroma-capped.** A wash cannot reach the saturation of a
  semantic fill, so the two are separated by construction as well as by rule.

**Never colour alone, at any saturation.** Every state carries a word. A
greyscale screenshot and a person with deuteranopia must both read the same
screen, and that is the floor, not an accommodation.

---

## 3. States — declared, exhaustive, and photographed

A component is not finished when it renders; it is finished when every state it
can be in has been designed. That has to be structural, because "did you do the
loading state" is a review question that is asked in the first month and not in
the sixth.

**Interaction states — seven, closed:**

`idle` · `hover` · `pressed` · `focus` · `busy` · `disabled` · `invalid`

**Container data-states — five, closed:**

`unknown` · `empty` · `partial` · `error` · `ready`

⚠️ **`unknown` is not `empty`, and this is the state most systems omit.** A
container that has not been answered yet is not a container with no results.
Collapsing them makes a failed load, a pending load and a genuinely empty
collection render identically — a confident, wrong fact, wearing a loading
state's excuse. `null` until known; `[]` only when the answer is `[]`.

**`partial` exists because responses are shaped.** An operation may withhold what
the caller did not buy and say so (PLAN.md §3.4, `included`). The renderer turns
that into a visible, explained absence — never a silently thinner screen, which
would make "withheld" and "empty" the same pixel.

### Three rules about refusal

1. **A disabled control says why.** `disabled` without a reason is not
   permitted — the reason is required alongside it and rendered (adjacent on
   coarse pointers, on hover and focus on fine ones). A control that refuses
   without explaining is the most common product failure there is.
2. **Gated is not disabled — it is `locked`.** Anything withheld by a plan, an
   entitlement or a permission renders as locked with the route out of it, not
   as greyed-out furniture. A disabled control cannot explain itself, cannot be
   focused, and cannot sell anything.
3. **Busy belongs to the control that started the write, not to the screen.** It
   is resolved by the outcome contract, so it cannot be left stuck: a rejected
   write that leaves a button spinning is the same defect as a rejected write
   that reports nothing.

### The states are proved by photograph

Every registered component declares its state map, and the conformance suite
renders each component in each declared state, at both themes, and photographs
it. A component with an undeclared state fails the build; a state whose image
changes is a visible diff in review. This is the same suite that produces help
screenshots and the marketing images (STANDARDS.md §6) — one set of images,
which is what keeps them honest.


---

## 4. Motion — one clock, four durations, three curves

⚠️ **The failure to design out is a jungle: forty elements each running their own
tasteful 240ms animation, arriving at forty different times.** No individual
animation is wrong and the screen is chaos. The fix is not taste — it is that a
component never holds a duration. Every timing is a token, so two things moving
at once physically cannot disagree.

```
--t-tap    120ms   press. must read as instant
--t-move   220ms   a thing changing place or state on screen
--t-enter  320ms   something arriving
--t-exit   170ms   something leaving

--e-out    cubic-bezier(.2,.8,.2,1)   decelerating — things arriving
--e-in     cubic-bezier(.4,0,1,1)     accelerating — things leaving
--e-spring linear(0,.402 7.4%,…,1)    a real spring, for press
```

⚠️ **LEAVING IS ALWAYS FASTER THAN ARRIVING.** Nobody waits to watch something
go. Symmetric durations are the single most common reason an interface feels
sluggish, and it is invisible in review because each half looks correct.

⚠️ **THE SPRING IS THE ONE PLACE EASING IS NOT ENOUGH.** `linear()` expresses a
real overshoot in pure CSS, and the overshoot is what makes a press feel
physical rather than merely fast.

**The rules, in order of how often they apply:**

1. **Press is the one universal.** Everything pressable scales to `.97` over
   `--t-tap`. One answer, everywhere, no exceptions.
2. **Arriving is staggered; leaving is not.** Sections enter at `--stagger` 40ms
   intervals, **capped at six** — past that a stagger stops reading as
   choreography and starts reading as the list being slow to load.
3. **The hero leads.** It is what the screen is about, so it arrives first and
   from further away. It is the only element allowed a longer distance.
4. **A moving indicator travels; the things it points at do not.** One element
   behind the tab row, positioned by index — not one pill fading out while
   another fades in.
5. **A sheet and its scrim land together.** Two elements, one duration, or the
   sheet appears to drag the scrim behind it.
6. **A number that changes rolls**, because there the movement IS the
   information. It is the only content worth animating.
7. **Nothing animates that the person did not cause**, except a screen's first
   paint.

⚠️ **REDUCED MOTION REMOVES MOVEMENT, NEVER INFORMATION.** Opacity and colour
survive; transforms do not. Somebody who turns it on must still be able to see
that something happened.

⚠️ **MOTION IS REVIEWED AS A FILMSTRIP, NOT AS A SCREENSHOT.** A still cannot
show choreography, so the suite films each transition at 4× and labels frames in
real time. Two defects found that way and by no other means: a stagger whose
delays landed on the wrong elements (`nth-of-type` counting every div rather than
`nth-child` on the section list — it renders as "too subtle", which leads to the
wrong fix), and a scrim arriving after its sheet.

---

## 5. The scale — verified against a reference, never chosen by eye

⚠️ **A TYPE SIZE IS MEANINGLESS WITHOUT THE FRAME IT SITS IN.** "17px body" is
not a decision, it is half of one — the other half is the screen width. The first
attempt at this used an iPhone body size on an iPhone frame while matching
screenshots from a ~412dp Android device, and every element came out **1.28×**
too large. Nothing in the design was wrong. The check was missing.

**The check: measure each element as a percentage of screen width, and compare
against the reference.** It is mechanical, it takes one run, and it is the only
way an eye is not the instrument.

| | reference | ours |
|---|---|---|
| page title | 6.9% | 6.67% |
| row label | 3.5% | 3.59% |
| quick-action label | 3.0% | 3.08% |
| back circle | 10.7% | 10.3% |
| quick-action circle | 12.1% | 12.3% |
| row height | 13.2% | 13.6% |

⚠️ **THE RATIO IS A VERIFICATION TOOL, NOT AN IMPLEMENTATION.** Shipping type
that scales with the viewport breaks Dynamic Type and reads wrong on a tablet.
Fixed values, *verified* by ratio.

### 5.1 The values, at a 390pt frame

```
type     hero 34 · page 26 · body 14 · secondary 12 · meta 10
weight   700 titles · 600 section heads · 500 row titles · 400 detail
space    page inset 14 · between sections 12 · row inset 14
radius   card 16 · tile 14 · pill and circle 999
round    back/close 40 · quick action 48 · medallion 36 · notice well 40
glyph    nav 20 · quick 21 · row lead 20 · chevron 16
row      50 minimum, and the whole row is the target — never the glyph
ground   page #000 · card #1b1b1e · ink 100% / 62% / 38%
```

⚠️ **FIVE TYPE SIZES AND NO MORE.** The calm in the reference is not the
typeface; it is that a screen contains four sizes and one big number. A sixth
size is a decision somebody made on one screen.

⚠️ **THE CARD IS A LIFT, NEVER AN OUTLINE.** There is not one border anywhere in
the reference. A hairline is what a design reaches for when its surfaces are not
actually different, and drawing it removes the pressure to fix that.

### 5.2 Icons — five roles, and the row's JOB decides which

| treatment | when |
|---|---|
| **bare outline glyph**, 20px, no circle | a **setting** in a menu list |
| **filled colour medallion**, 36px | a **thing with a value** — an account, a merchant |
| **translucent well**, 40–48px | a **quick action** on a hero, or a notice's icon |
| **rounded-square tile**, label beneath | a **destination** in a small fixed set |
| **status glyph** beside a word | never the only carrier — a label is required |

An icon appears alone only in the app bar and the tab bar, where the target is
fixed and learned. **Four quick actions, five tabs, four tiles across** — each a
refusal in code, because a limit in a document is a sentence nobody has read.

### 5.3 The top of a screen is decided by what the screen IS

| | when |
|---|---|
| **photo hero**, full-bleed, centred | the screen is about **one number** |
| **pattern hero**, full-bleed, centred title | the screen is about a **topic** |
| **no hero**, big left-aligned title | the screen is a **list** |

⚠️ Giving every screen the same top is what made the first attempt read as a
settings page throughout. A crown holding a count is a heading pretending to be a
fact.

---

## 6. Navigation, and the overlay ladder

### Three levels, and they are not interchangeable

| level | what it is | where it lives | how many |
|---|---|---|---|
| **Destination** | a place in the product. A noun. Survives a reload | the tab island (phone) or the rail (≥md) — **one surface per width, never both** | **3–5.** Six means two are the same place |
| **Section** | a view of ONE destination — a lens, a filter, a sub-tab | inside the content column | any, scrolling rather than wrapping |
| **Record** | one thing from a collection | a page (phone) or the detail pane (≥lg) | — |

- **One navigation surface at a time.** A rail *and* a top nav bar is two answers
  to "where am I". The top bar carries identity, the account and this page's
  chrome — never destinations.
- **Depth is capped at destination → record → overlay.** A third pushed page
  means the record needed sections, not more pages.
- **A destination's icon and its label travel together.** An icon-only rail item
  is unnamed to voice control and ambiguous to everybody else.

### The overlay ladder

**The question is what the user is doing, not what the content is.**

| | for | dismissed by | stacking |
|---|---|---|---|
| **Popover** | choosing one value, anchored to the thing it changes | outside press, Esc | never stacks |
| **Menu** | verbs on one specific thing | select, Esc | never stacks |
| **Sheet** / **Panel** | *doing* — a form, a picker, a flow | drag, close, Esc | at most one |
| **Dialog** | *deciding* — a question with two answers and a consequence | ⚠️ an explicit answer only | at most one; may cover a sheet |
| **Drawer** | navigation, and nothing else | anywhere | at most one |

The invariants:

- **A sheet and a panel are one component with two placements** — bottom below
  `md`, side above it. Not two components. This is where "the mobile version
  looks different" comes from when it is allowed to be two.
- **A sheet is a pinned header, a scrolling body and a pinned footer.** Only the
  body scrolls, and the primary action is in the footer — so that on every sheet
  in the product, the thumb lands in the same place. That is the real definition
  of consistency here: not that sheets are the same size, but that they answer in
  the same spot.
- **Overlay depth is capped at two, and the second must be a dialog.** A sheet
  opened from a sheet is a screen that should have been a route.
- **Only a dialog blocks.** Everything else yields to Esc and to a gesture. A
  dialog demands an answer because a decision is what it is for.
- **Nothing destructive happens without a dialog, and the confirm names the
  object.** "Delete" is wrong. "Delete Marion's plan" is right — it is the last
  place a mistake can be caught, and a generic verb catches nothing.
- **A drawer never contains content.** The moment it does it is a second
  navigation surface, which rule one already refused.
- **Configuration is never a tab strip.** An index of sections, each with its
  current value in the sub-line, and a page per section. That lets somebody check
  a setting by reading it — without opening it, and therefore without risking
  changing it.

---

## 7. Layout, sections, disclosure, tabs, ambience

### The column, and what a wider viewport is for

**There is one content column and it never stretches.** Wider viewports get
**more columns**, never wider cards — which is what makes a card designed once
pixel-correct everywhere: it is never asked to be a different shape.

A destination declares its **kind**, and the kind picks the shape at every width:
`overview` (one column, an aside when wide), `collection` (two-pane from
desktop — the list is how somebody works through ten records without going back
nine times), `task` (full bleed, brings its own chrome, may not invent a second
navigation surface).

⚠️ **Inside a pane, a viewport breakpoint is a lie.** A record built for a
full-width panel and dropped into a narrow pane keeps every one of its
breakpoints answering yes, and nothing on it is wrong — it is answering a
question about the wrong box. **Any surface that can appear in a pane sizes
itself against its container.** Breakpoints remain for what is genuinely about
the device: the shell's own shape, and whether a pane exists at all.

### Sections

**A section is a question somebody could ask in one breath.** If describing it
needs "and", it is two sections. Sections are the unit of rhythm — the widest
space step separates them, and nothing else in the layout gets that step.

### Disclosure

**A disclosure is for the exceptional, never for the required.** If most people
need it open, it is a section with extra clicks.

Two kinds, and only one of them may nest:

| | shows collapsed | may nest |
|---|---|---|
| **summary** | the current value, so it can be read without opening | no |
| **detail** | a label only — advanced or rare options | one level, and no more |

⚠️ **A disclosure that is open by default is a bug in the information
architecture**, not a configuration.

### Tabs

**Tabs are peer views of one subject.** Not steps, not configuration, not
navigation.

- **Four visible, maximum.** More means the subject is two subjects.
- **A tab is a section**, so it does not appear in the rail and does not change
  the breadcrumb's first segment.
- **A tabbed surface's anchor belongs to the tab, not the page.** Each tab names
  its own subject; the page's own title drops to an eyebrow, because the tab bar
  already said it.

### Ambience

The signature ground: a brand wash at the top of a scroll container, decaying to
canvas partway down.

- **It belongs to the scroll container**, not the viewport. It scrolls away.
- **Content sits on canvas, not on the wash.** The wash is behind the anchor and
  nothing else, which is what makes the anchor read as the anchor.
- **One per scroll container.** A pane has its own; nested ambiences are noise.
- **⚠️ It never carries a value.** Nobody reads a colour as a number. The single
  exception is a whole-surface degraded state — read-only, offline, expired —
  where a state ground *replaces* the brand one and always arrives with words.
- **⚠️ It never changes the accent.** A destination may name an ambience family,
  which is a ground choice; the accent stays the tenant's and is re-lit against
  it (§1.2). No screen recomputes a palette, ever.

---

## 8. Live surfaces — dock, pane, and detach

A running workout, a playing channel preview, a sterilisation cycle timer, an
upload, a long generation: surfaces that represent *an ongoing thing*, where
navigating away today means losing it or hiding it.

This is a platform primitive rather than a per-app trick, for one technical
reason: **the tree must never be unmounted between presentations.** An app-level
implementation re-renders and takes the render loop, the camera stream, the media
element and the elapsed timer with it. Only whoever owns the shell can move a
mounted subtree.

A surface declares itself live in the manifest and gets four presentations of the
same instance:

| | where | fidelity |
|---|---|---|
| **full** | the task surface as designed | complete |
| **dock** | above the tab island (phone) or a corner card (desktop) | the live value and the two controls that matter |
| **pane** | the aside column at wide widths | complete, beside other work |
| **detach** | an OS-level always-on-top window, via document Picture-in-Picture | complete, outside the browser |

The invariants:

- **At most one live surface per app.** Starting a second asks, explicitly, to
  replace the first. Two running timers is a product bug, not a layout problem.
- **The tree is moved, never remounted.** This is the whole reason it is here.
- **The dock is the surface, smaller — not a notification about it.** Tapping it
  restores full. It carries live state, not a summary of live state.
- **It survives navigation; it does not survive a reload** — and where unsaved
  work would be lost, it says so before the tab closes.
- **`detach` degrades to absence.** Where document Picture-in-Picture is
  unavailable, the control is not rendered. It is never emulated with a window
  that behaves differently.
- **Native media Picture-in-Picture is a separate thing** and stays with the
  video element. Do not conflate the two; a live surface is an application
  surface, not a video.


---

## 9. Where the boundary sits

[PLAN.md](PLAN.md) §3.6 is the table. The one-sentence version: **the renderer
owns the chrome and every state; the app owns the canvas.** "Canvas" means the
content region of a surface that genuinely cannot be declared — a player, an
editor, a camera flow, a visualisation. It is not a licence to re-implement a
dialog, a toast, an empty state or a form control, and a canvas surface still
uses the platform's chrome, states, motion and data access.

⚠️ **This decision only survives if it is enforced rather than documented.**
The failure is gradual and each individual step is reasonable: one bespoke
dialog, one hand-rolled empty state, one `<button>`. §10 is what stops it.

### 9a. What is borrowed, and what is never borrowed

**Behaviour and components are borrowed. Styling and layout are not.**

`packages/ui` in the legacy tree already ran the other experiment — shadcn:
Radix, `cva`, Tailwind, ~11k lines, three apps, a conformance test. On top of it
one app carries **3,275 `className` literals, 942 of them used exactly once**, and
**88 distinct spacing values against a scale of 8**. That is not a discipline
failure — the same people wrote the guard file. It is structural: `className` is
an open string, so it cannot be swept, and every guard in §10 works by
enumerating a closed space.

**The decision is daisyUI**, and the deciding facts are measurable:

- **It is CSS. There is no JavaScript to fail.** `@one/ui` is imported by workers
  that render on the server; Radix broke every app's suite through
  `react-remove-scroll`'s deep ESM subpaths. A stylesheet cannot do that.
- **Its theme variables are OKLCH and its `--color-*-content` is measured ink on
  the fill** — which is exactly what `ground.ts` computes. Our colour engine
  drives it directly; 27 variables, a near 1:1 map.
- **It needs no Tailwind and no build step.** The docs say Tailwind is required;
  that is about `@plugin "daisyui"` generating a customised bundle. `daisyui.css`
  contains **no Tailwind utility class at all** — verified — so components are
  imported individually. Sixteen of them is **22.6 kB gzipped**.

| | owner |
|---|---|
| components — btn, card, list, modal, dock, badge, toggle, tab… | **daisyUI** |
| theme variables — OKLCH, measured ink, bounded slots, the sweep | **ours** |
| layout, spacing, the scale, the hero — what utilities would do | **ours** |
| React wrappers, so no call site ever writes a class string | **ours** |

⚠️ **WITHOUT TAILWIND YOU GET daisyUI'S COMPONENTS AND NONE OF ITS UTILITIES.**
That is the correct boundary and it is worth stating because it is invisible
until something silently does nothing: `class="text-xs opacity-60"` renders at
full size.

⚠️ **A BORROWED PRIMITIVE THAT NEEDS A BROWSER IS IMPORTED FROM
`@one/ui/browser`, NEVER FROM THE INDEX.** One re-export from the index turned
every app's suite red with a module-resolution error naming a file nobody here
had written.

---

## 10. The guards

Each fails `one lint`, and each covers something that produces no error at
runtime and no failing test anywhere.

⚠️ **The table is GENERATED from [`guards.json`](guards.json)**, so this section
cannot promise enforcement that has no registry entry — and the registry cannot
carry one owed by a stage that has already shipped. That is deliberate: a
document claiming a guard nobody built reads as safety, costs nothing to write,
and is expensive to disprove, so it survives review indefinitely.

<!-- generated: node scripts/guards.mjs table interface -->
| guard | fails on | |
|---|---|---|
| `contrast-sweep` | any brand-slot combination in range producing ink below its floor, at either theme, on any ground | **live** |
| `no-literal-colour` | a colour value anywhere outside the token layer | **live** |
| `no-literal-motion` | a duration, easing curve, `@keyframes` or transition property outside the choreographer | **live** |
| `state-completeness` | a registered component with a state it does not declare and photograph — the photograph half arrives with the component suite | **live** |
| `unknown-not-empty` | a data container whose pending and empty states resolve to the same render | **live** |
| `disabled-has-reason` | a `disabled` prop with no accompanying explanation | **live** |
| `gated-is-locked` | an entitlement or permission rendered as `disabled` rather than `locked` | **live** |
| `renderer-boundary` | an app defining a shell, dialog, toast, empty state or form primitive; a raw `<button>` or `<input>` | **live** |
| `hover-not-required` | an interaction reachable only by hover | **live** |
| `pane-container-queries` | a pane-capable surface sized by viewport breakpoints rather than by its container — every breakpoint answers yes about the wrong box | **live** |
| `one-navigation-surface` | a second destination surface at any width | **live** |
| `target-size` | an interactive element whose hit area resolves below the floor | **live** |
| `one-live-surface` | a second surface declared live, or a live surface remounted between presentations | **live** |
| `reduced-motion` | a layout that depends on an animation having run | **live** |
| `brand-closed` | a brand slot outside its declared range being clamped instead of refused, or a token emitted outside the closed set | **live** |
| `accent-relit` | a screen recomputing the accent instead of re-lighting it — a brand that is a different colour on every surface | **live** |
| `ladder-never-collapses` | a surface step that saturates against the end of its range, leaving nested surfaces indistinguishable | **live** |
| `one-clock` | a component holding its own duration, or a scene whose stagger grows without a budget | **live** |
| `state-declared` | a component registered with no resting state, or a container declaring `empty` without `unknown` | **live** |
| `overlay-ladder` | a third overlay layer, a non-dialog covering another overlay, two drawers, or a destructive confirm that does not name its object | **live** |
| `shape-from-kind` | a screen choosing its own layout instead of taking it from the destination's kind — which is how a collection replaces its list on open | **live** |
| `no-colour-on-the-wire` | a rendered component emitting a colour that is not a token reference | **live** |
| `refusal-has-reason` | a control rendering a refusal with no explanation — a dead end nobody can get past and nobody can describe | **live** |
| `theme-both-ways` | a palette defined only inside a media query, which has no value at all when the root carries an explicit theme | **live** |
| `contained-form` | a semantic tone rendered on a ground it would be confused with — decided by the renderer, never by an author's conditional | **live** |
| `continuity` | two copies of one record crossfading instead of one element travelling, or unrelated records animated as though related | **live** |
| `moment-hold-survives-reduced-motion` | reduced motion shortening how long somebody has to read — the one adaptation that makes the setting worse for the people who turn it on | **live** |
| `sound-needs-a-gesture` | a sound with no gesture behind it — every browser refuses it, so the design produces silence in production and a chime in every demo | **live** |
| `one-moment-at-a-time` | a queue of moments — a batch of writes producing four celebrations in a row, each meaning less than the last, long after the thing that caused them | **live** |
<!-- /generated -->

⚠️ **A widened guard finds bugs in itself first**, and the ones here are harder
than the repository's existing guards because several are questions about
*rendered output* rather than about source. The contrast sweep and the state
matrix both want the component suite running, which is why they belong to the
same stage as the renderer rather than to a script that could be written earlier.


---

## 11. Relationship to the existing UI language

`UI-LANGUAGE.md` in the legacy tree is the largest body of interface thinking in
this repository and most of it is right. It was written product-agnostically as
an extraction target, which means it is already most of the way to being this
document's ancestor rather than its competitor.

**What carries over, and should not be re-derived:** the five-tier hierarchy and
the vertical spine; the 4px grid and the row anatomy; the four-step tonal ladder;
the type scale and its enforcement; the shape ladder; the component grammar; the
sheet's three parts; the settings index; the entrance choreography; the
navigation model and the four widths; the accessibility floor; and the discipline
of stating a rule alongside the thing it prevents.

**What this document changes, and why:**

| | was | is |
|---|---|---|
| surfaces | four absolute tokens | relative steps computed from the ground (§1.2) |
| accent on coloured ground | a per-screen palette decision | one re-lit accent, no recomputation (§1.2) |
| semantics on brand | contrast checked | two-axis distinguishability, collision detected (§2) |
| motion | tokens each component reaches for | one choreographer; components hold a role (§4) |
| states | a review convention | declared, closed, and photographed (§3) |
| live surfaces | — | a platform primitive (§8) |

⚠️ **`UI-LANGUAGE.md` is not maintained against this document and will not be.**
It governs the legacy tree, which is deleted at stage 9 (STANDARDS.md's opening
note). Read it for the reasoning it carries; do not reconcile the two by hand.
When they disagree, this file wins for `platform/**` and that file wins for
everything else, and the disagreement resolves itself when the legacy tree goes.
