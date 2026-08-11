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

## 0a. The one derivation — why an app declares nothing

⚠️ **AN APP SAYS WHAT A THING IS. IT NEVER SAYS HOW A THING LOOKS.** That is the
whole contract. Everything else in this document is machinery for keeping it
true: a screen hands over a role, a position and some content, and the colour,
elevation, spacing, timing and shape are computed from where that thing ended up
standing.

⚠️ **THIS IS A PHYSICS, NOT A THEME.** `scene.ts` holds the four laws, and every
other rule here is a consequence of them — which is why there are no
per-component decisions to keep in step. There is nothing to keep in step.

| law | means | replaces |
|---|---|---|
| **There is one light** | a brand + theme is a light source; everything visible is that light falling on something | a palette — a list of colours somebody picked, which cannot answer what a **new** surface should be |
| **Surfaces are lit, never painted** | a surface is one perceptual step from its parent, toward the headroom | named greys: `surface-2` is a decision at the call site, so nesting collides and nobody sees it coming |
| **Ink is measured** | the on-colour of a fill is computed against that exact fill | a `*-foreground` token, which lets somebody pair a colour with ink that fails on it |
| **Position decides, not the caller** | depth from nesting, spacing from the container, timing from the role, size from the frame | props — a `depth`, `margin`, `duration` or `size` prop is the same screen looking different in two places |

### What an app may say

Four questions, and none is answerable with a colour:

```
role        ground · anchor · content · chrome · overlay      what it IS
archetype   crown · topic · title · identity · feed           what the SCREEN is        §5.6
sky         aurora · photo · dots · waves · grid · rings      what it is ABOUT          §5.5
state       idle · busy · locked · disabled ·
            unknown · empty · partial · error · ready         what is TRUE right now    §3
tone        accent · success · warning · danger · info        what it MEANS             §2
```

⚠️ **AND WHAT DECIDES INSTEAD**, kept beside it — because a prohibition with no
replacement is a rule people route around, and with one it is a signpost.

| an app cannot say | because it is derived from |
|---|---|
| `colour` · `background` | the light and the surface it lands on |
| `foreground` | measurement against that exact fill |
| `elevation` | depth, in the direction with more headroom |
| `margin` | **nothing.** Spacing is the container's gap, never a child's margin |
| `duration` · `easing` | the role, on one clock — §4 |
| `fontSize` | the text role, on one ladder — §5.1 |
| `width` | the container, asked with a container query and never the viewport |

⚠️ **THE VALUE OF A CLOSED DECLARATION IS THAT IT CAN BE SWEPT.** The list is
short on purpose: a surface small enough to enumerate is one that can be *proved*
safe for every tenant, and that proof is the product feature. One escape hatch
and the sweep stops being a guarantee and becomes a sample.

`declarationProblems()` refuses anything off-list and names what decides instead;
it reports **every** mistake rather than the first, because an author fixing six
things one round trip at a time stops reading the messages. The sweep runs every
depth × both themes × brands at each end of the declared range, and asserts the
contrast floor — a range nobody walked is a range with a hole in the middle.

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

⚠️ **ELEVATION IS TOWARD THE LIGHT IN BOTH THEMES, AND THE TWO THEMES USE
DIFFERENT ARITHMETIC BECAUSE THE PHYSICS DIFFER.** The first version stepped in
whichever direction had more headroom, which on a near-white page means *down* —
so a light theme's cards came out grey on a white page. That is the dusty look
that makes a light theme read as cheap, and it was the rule rather than an
accident.

| | page | card | above it | what separates them |
|---|---|---|---|---|
| **dark** | `l 0.17` | `+0.045` | `+0.045` each | **lightness** — there is unlimited room above |
| **light** | `l 0.93` | near-white | near-white | **elevation** — there is almost none |

⚠️ **A BRIGHT ROOM TELLS THINGS APART BY WHAT THEY CAST; A DARK ONE BY WHAT THEY
CATCH.** So `--elevation-1..3` is a graded shadow in light and `none` in dark, and
the light ladder spends most of its remaining room on the *page-to-card* step —
the one that carries the design. Asserting a lightness gap for all four depths in
both themes, which the tests used to, is only satisfiable with grey cards.

⚠️ **AND THE LIGHT PAGE CARRIES LESS OF THE TINT AT THE SAME SETTING.** The same
chroma reads roughly twice as strong at `l 0.93` as at `0.975`, and the ambience
slot promises "a hue, and how much of it" — a promise about what somebody *sees*,
not about the number in the file. Dropping the page to make the cards white would
otherwise have tripled every tenant's tint at an unchanged setting.

⚠️ **TRANSLUCENCY WAS CONSIDERED AND REFUSED, AGAIN.** A frosted surface needs a
backdrop filter, which is a full-screen GPU composite on every scroll frame —
paid for by the cheapest device in the fleet, permanently, on a rule that only
looks good on top of a photograph. §1.5 is the long form. The whiter cards are
what was actually wanted, and they cost nothing.

### 1.2a The step, as arithmetic

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
--t-tap       140ms   press. must read as instant
--t-move      260ms   a thing changing place or state on screen
--t-enter     420ms   something arriving on a screen that already exists
--t-entrance  600ms   the screen itself, composing
--t-exit      220ms   something leaving
--stagger      85ms   between two members of one group

--e-out    cubic-bezier(.33,1,.68,1)  decelerating — things arriving
--e-in     cubic-bezier(.4,0,1,1)     accelerating — things leaving
--e-spring linear(0,.402 7.4%,…,1)    a real spring, for the RELEASE of a press
```

⚠️ **FIVE DURATIONS, AND THE FIFTH WAS EARNED.** A screen *composing itself* is a
different event from an object *arriving on a composed screen*. One number for
both is a choice between a cheap page and a slow sheet.

### 4.1 Weight, and why the first version had none

The first clock was 320ms and a 10px rise under `cubic-bezier(.16,1,.3,1)`.
Every number looked reasonable and the result read as **cheap** — the reviewer's
words were "no heavy premium feel". Filmed at 8×, the cause was not that the
motion was fast. **Every frame was identical: it had finished before the eye
could find it.**

⚠️ **WEIGHT IS DISTANCE × *VISIBLE* DURATION, AND "VISIBLE" IS THE WORD THAT WAS
MISSING.** A timing function's tail below the perceptual threshold is latency,
not motion — and it hides every other fix, because raising the duration under
that curve adds time in which nothing appears to happen. Measured, as a
percentage of the window at which each curve reaches 95% of its distance:

| curve | 10% | 25% | 40% | 50% | 60% | reaches 95% at |
|---|---|---|---|---|---|---|
| expo `(.16,1,.3,1)` | 49 | 83 | 94 | 97 | 99 | **43%** |
| old `(.2,.8,.2,1)` | 40 | 77 | 90 | 95 | 97 | **52%** |
| **cubic `(.33,1,.68,1)`** | 27 | 58 | 78 | 87 | 93 | **64%** |
| quad `(.25,.46,.45,.94)` | 19 | 45 | 67 | 77 | 85 | 79% |

Under expo, a 600ms entrance visibly **stops at 260ms** and the remaining 340ms
is a number in a stylesheet. The house curve is the cubic: decisive at the start,
and still moving through two thirds of its window.

⚠️ **AND THE RELEASE SPRINGS WHILE THE PRESS DOES NOT.** A control that
overshoots on the way *down* feels loose — the finger is still on it, and nothing
physical overshoots under a thumb. Press is `--t-tap` on `--e-in`; release is
`--t-move` on `--e-spring`. Two directions, two curves, which is why they are not
one shared transition.

⚠️ **A BOUNCE ON AN ENTRANCE READS AS PLAYFUL, WHICH IS THE OPPOSITE OF
EXPENSIVE.** The spring is for a press and for a travelling indicator. Things
arriving settle; they do not land twice.

**`ui/test/motion.test.ts` solves the bezier and asserts all of it** — that the
house curve spends at least 55% of its window moving, that the durations are
ordered by what each event is, that the rise travels at least 16px, and that the
press is damped while the release springs. All five mutation-tested, because
every one of them is a number that looks fine and reads wrong.

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

⚠️ **AND ALL OF IT LIVES IN `motion.ts` — INCLUDING THE CSS.** The choreographer
emits the clock as tokens and every animation and transition the sheet applies,
so `styles.ts` contains no timing at all. It held the clock for one increment and
that was already a *second* definition of durations `motion.ts` defines: nothing
would have failed when one of them was re-tuned, which is precisely how two
things moving at once come to disagree. The interface guard enforces it — a
duration, a curve or a transition anywhere else in the package fails `one lint`.

⚠️ **THE WEATHER IS ON THE SAME CLOCK AND OFF THE SAME SCALE.** The sky's drift
is 52 seconds and its breath 26–38, deliberately far from every interaction
timing: it is the one motion in the product that is not a response to anything a
person did. It is a token in `motion.ts` all the same, because "somewhere else"
is where a second clock starts.

⚠️ **MOTION IS REVIEWED AS A FILMSTRIP, NOT AS A SCREENSHOT.** A still cannot
show choreography, so the suite films each transition at 4× and labels frames in
real time. Two defects found that way and by no other means: a stagger whose
delays landed on the wrong elements (`nth-of-type` counting every div rather than
`nth-child` on the section list — it renders as "too subtle", which leads to the
wrong fix), and a scrim arriving after its sheet.

---

## 5. The scale — verified against a reference, never chosen by eye

> The prototype these numbers were measured from is
> [](../ui/reference/) — plain HTML and CSS, no build.
> It exists so they can be re-derived rather than trusted.

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


### 5.4 The hero has no bottom edge

⚠️ **THE BACKDROP RUNS BEHIND THE CONTENT AND FADES; IT IS NEVER A BAND.** This
is the single thing that most separates the reference from a stack of cards, and
it is invisible until you look for it: in the reference the promo card, the
transaction card and the tab bar are all translucent **over** the photograph, and
the photograph never stops — it gives out. A hero with a hard bottom edge makes
every screen read as two pages stacked.

The backdrop spans the whole scrolled height and is masked out, so two numbers
describe it and nothing has an edge:

```
--solid   how far down it is at full strength
--reach   where it has gone entirely

photo hero    --solid 34%  --reach 100%   carries the whole screen
pattern hero  --solid 22%  --reach  52%   gives out just past the hero
```

⚠️ **AND THE CARD IS WHITE-ALPHA, NOT A COLOUR.** One value —
`rgb(255 255 255 / .085)` with a backdrop blur — explains both screens: over
black it reads as `#1b1b1e`, over a photograph the photograph reads through it.
A card with a literal colour cannot do the second thing, which is why the first
attempt needed a hard edge to hide behind.

**One stated stacking order, because fixing one overlap creates another:**

```
0  backdrop
1  content
3  floating chrome — the tab bar
```

Giving the content a stacking context so it sits on the backdrop also put it
above the floating bar, so a list showed *through* a bar that is 86% opaque.

⚠️ **THE INSET THAT CLEARS THE FLOATING BAR IS THE SCREEN'S, DECLARED ONCE.** As
a spacer at the end of one list it is the thing everybody forgets, and the
symptom is the last row of every long screen sitting under the bar where it
cannot be tapped. It has been written down twice in this repository and
reintroduced both times, which is the argument for it being structural.


### 5.5 The sky — where the ambience slot finally lives

⚠️ **THE BRAND CONTRACT HAS CARRIED A HUE AND AN INTENSITY SINCE §1.1 WAS
WRITTEN, AND EVERY SCREEN SPENT IT ON A TINT NOBODY COULD SEE.** The backdrop is
where it goes: a slow aurora behind the whole scroll, or a pattern lit by the
same colour. This is the section that makes the language's name literal — the
tenant's light, indirect, constant, behind everything.

**A page declares a sky. The colour is never the page's decision.**

| sky | what it is |
|---|---|
| `aurora` | three soft blooms, drifting |
| `photo` | the same, reaching the whole screen — for a hero about one number |
| `dots` · `waves` · `grid` · `rings` | the aurora, masked |

⚠️ **IT IS BLOOMS, NEVER A WASH.** The colour arrives as three soft radial
sources on a dark ground — low chroma, wide falloff — because a flat tint reads
as a screen somebody coloured in, and blooms read as light in a room. That is the
whole difference between ambience and paint.

⚠️ **THE HUE NEVER CYCLES.** It is the tenant's, fixed. What moves is where the
light falls, never what colour it is. A hue that animates is a screensaver.

**Motion: drift and breath, on the same clock as everything else.**

- **Drift** — 52s, `transform` on the lit layer. Slow enough to be weather: under
  ~30s it reads as an animation somebody added; past ~45s it reads as light
  changing in a room, which is the point.
- **Breath** — the mask scales a few percent. ⚠️ A pattern **breathes, it does not
  travel**: a moving pattern is a texture somebody is dragging past the screen.
- ⚠️ **`transform`, never `background-position`.** One is composited on the GPU
  and one repaints the whole layer every frame. At 52s nobody sees the difference
  in motion and every device sees it in battery.

⚠️ **A MASKED SKY NEEDS A DIFFERENT AMOUNT OF LIGHT, AND THE CORRECTION FOLLOWS
THE GROUND.** Dots at 9px keep about 2% of their pixels, so at the gradient's own
brightness the pattern is invisible — and the temptation is to raise the tenant's
`ambience`, which washes every unmasked screen to fix one masked one. The light
is corrected where the mask is: **brighter on a dark ground, darker on a pale
one.** Raising it in both directions blows a light pattern out to white, which is
the same defect with the opposite sign — a mask is legible by *distance* from its
ground, not by absolute brightness.

Every value is derived from `groundFor` and `accentOn`, so a new tenant gets
their own weather without anybody choosing a gradient. Swept across three
deliberately awkward accents — a blue, a green whose hue collides with the
success tone, and a mid-lightness saturated orange — in both themes.


### 5.6 The five page archetypes

⚠️ **A PRODUCT HAS FIVE PAGE SHAPES, NOT ONE PER SCREEN.** Extracted from eight
reference screens, which collapse into these without remainder. A new screen
picks one; it does not invent a sixth.

| | top | when |
|---|---|---|
| **A · crown** | photo sky, centred number, quick actions | the screen is about **one number** |
| **B · topic** | pattern sky, centred title + glyph, quick actions | the screen is about **one subject** |
| **C · title** | back, big **left** title, optional search | the screen is a **list** |
| **D · identity** | close + one action, centred face and name | the screen is about **one person** |
| **E · feed** | app bar only | the screen is **independent sections** |

⚠️ **THE TOP IS DECIDED BY WHAT THE SCREEN IS, NEVER BY TASTE.** Giving every
screen the same top is what makes a product read as a settings page throughout —
and giving each screen its own is what makes it read as four products.

### 5.7 The section patterns

The archetypes are assembled from these and nothing else.

| pattern | shape |
|---|---|
| **menu group** | bare glyph · label · chevron. Groups separated by space, never a rule |
| **record list** | medallion · title + detail · value |
| **header outside** | title left, **total right**, then the card. The default |
| **header inside** | title + chevron inside the card, `See all` at its foot. **Feed only** |
| **quick actions** | 3–4 circles in a well, label always beneath |
| **tile grid** | 4 across, label beneath the tile |
| **segmented** | a track with a sliding indicator, inside a card |
| **scroller** | horizontal, and the one place content leaves the page inset |
| **trailing action** | a row ending in a pill button rather than a chevron |
| **promo** | a lit card, art bleeding off the right edge |

⚠️ **THE HEADER IS INSIDE THE CARD ONLY ON A FEED**, because there the card *is*
the section rather than a list the section contains. Everywhere else it sits
outside: put inside, the title becomes an item in the list it names.

⚠️ **A SCROLLER IS THE ONE THING THAT LEAVES THE PAGE INSET**, so its first item
lines up with everything above it and its last is cut — which is what says there
is more. A scroller that fits inside the inset looks like a row that failed to
fill.

### 5.8 The archetypes, as code

`archetype.ts` is the table above with nothing added: per archetype a top, a sky,
how far the light reaches, and whether a section header sits inside its card.
`<Page archetype="crown">` is the entire declaration — an app never names a
backdrop, a padding or a title size.

| | top | sky | solid → reach | header |
|---|---|---|---|---|
| **crown** | photo hero | `photo` | 34% → 82% | outside |
| **topic** | pattern hero | `dots` | 26% → 58% | outside |
| **title** | big left title | `aurora` | 14% → 40% | outside |
| **identity** | portrait | `rings` | 30% → 62% | outside |
| **feed** | app bar | `aurora` | 10% → 34% | **inside** |

**Five things are refused rather than written down**, because each of them
renders perfectly well and is only wrong beside the four screens it was meant to
match:

- a **top that belongs to another archetype** — a crown on a list page is a
  screen about one number that has no number;
- a **hero on a feed** — ⚠️ but *not* its app bar. Refusing every top was the
  first version and it was wrong in the direction that matters: it made the one
  archetype whose top **is** an app bar unable to have one;
- a **header inside the card** anywhere but a feed. The component cannot see what
  page it is on, which is exactly why this rule kept being broken — so the
  archetype travels down a context and the section reads it;
- a **fifth quick action** (that is a toolbar) and a **fifth tile across** (that
  is smaller than the hit-area floor);
- a **sky a page is not entitled to choose.** A page may name a *mask*; the
  *ground* belongs to the shape. Naming the shape's own ground is refused too —
  it reads as a choice, and the next edit to the shape leaves it behind as one.

⚠️ **THE VALUE IS PUSHED TO THE EDGE AND THE BODY TAKES THE SLACK.** Without it a
row's value sits against its title and a column of them does not line up, which
is what makes a list read as a paragraph with numbers in it. The separator
between rows is drawn from the surface ladder — a rule *inside* the card is not
an outline *around* it, and §5.1 forbids the second while needing the first.

⚠️ **THE EDGE BELONGS TO THE ONE KIND WITH NO FILL.** Drawn on all four kinds, a
ghost button is an outlined button and the hierarchy between them is gone.

**Photographed from the shipped code**, not from the prototype:
[`reference/screens.tsx`](../ui/reference/screens.tsx) renders the real
components through the real stylesheet, three tenants × both themes. `build.mjs`
beside it is the prototype the numbers were measured from, and a prototype that
keeps being photographed is one the shipped code is free to drift from.

### 5.9 Icons — lucide's geometry, our names, and motion on interaction

**Twenty-two icons, generated from `lucide-static` into `src/icons.ts`.** The
geometry is **copied rather than imported**: this package is loaded by workers
rendering on a server, and a runtime dependency for twenty-two shapes that never
change is a dependency in every one of them. `test/icons.test.ts` re-derives the
file from the package and compares, so a hand-edited path is a test failure
rather than a glyph that is subtly not the one every other product draws.

⚠️ **THE SET IS CLOSED, AND SMALL.** lucide ships two thousand icons; a product
that can reach all of them has no icon language, it has a search box. Adding one
is an edit to the map in the generator, on purpose, in review — the same shape as
`borrowed.ts`, and for the same reason: one file knows the library's names.

⚠️ **AN ICON NEVER CARRIES A SIZE OR A COLOUR.** Both come from where it is
standing — 20px in a row's lead, 21 in a quick action, 24 in a tile, 16 as a
chevron: the five roles of §5.2. A `size` prop is the same glyph at two sizes on
two screens, which is exactly what makes a set look assembled rather than drawn.

⚠️ **AN ICON BESIDE ITS OWN LABEL IS HIDDEN; ONE STANDING ALONE IS THE LABEL.**
Getting that backwards reads "Back, Back" on every app bar, or nothing at all.

**Motion plays on INTERACTION — press and keyboard focus — and never on hover.**

⚠️ **THE WHOLE ANIMATED-ICON GENRE IS BUILT ON HOVER,** and hover is a capability
half the devices this ships to do not have: the animation is invisible on a
phone, and `one lint` fails anything reachable only that way. Press is what
everybody has, and focus is what a keyboard has.

⚠️ **FOUR MOTIONS, ASSIGNED BY WHAT THE ICON MEANS** — something that travels
(`nudge`), something that rings (`swing`), something that appears (`pop`),
something that turns (`turn`). Per-icon timelines would be twenty-two decisions
nobody could keep in step, and they would each be a duration living outside the
choreographer. All four are `@keyframes` in `motion.ts` on the shared clock.

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
  drives it directly; 28 variables, a near 1:1 map.
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


### 9c. The bridge

`daisy.ts` is the whole integration: twenty-eight CSS variables, handed over
once. No plugin, no Tailwind, no build step — sixty-one components then draw
themselves in a tenant's light without knowing a tenant exists.

⚠️ **NOTHING IN THE BRIDGE PICKS A COLOUR.** Every value is read off the scene.
The single thing it decides is *naming* — which of our tokens answers to which of
theirs — and that is checked exhaustively, because a name they read and we never
write is **not** a missing colour: it is that one component falling back to the
library's stock theme, on a tenant's screen, beside components that are correct.

⚠️ **THE THREE ACCENT SLOTS ARE ONE HUE AT THREE DEPTHS.** The library offers
`primary`, `secondary` and `accent`; this language has one accent, deliberately.
Filling the other two with invented hues hands every author a second and third
brand colour to reach for, and the restraint that makes one accent read as
expensive is gone in a week.

⚠️ **CONTRAST IS RE-PROVED ON THE OTHER SIDE.** Proving it in our own tokens
proves nothing about what the library renders — what it renders is these pairs,
so these pairs clear the floor, swept across brands at each end of the declared
range in both themes.

⚠️ **AND `toHex` IS IMPORTED, NEVER RE-WRITTEN.** A second one written during the
bridge assumed 0–255 while `Rgb` here is 0–1, so it encoded white as `#010101` —
a near-black. Nothing threw: `inkOn` reported its true ratio of 5.43 while
handing back a colour that measured 3.68, so the engine looked correct and only
the pixels were wrong. Two implementations of one conversion is the same defect
as two implementations of "what colour is this", one layer down.


### 9d. The one door

⚠️ **A CLASS REACHES THE DOM ONLY THROUGH `borrow`.** `borrowed.ts` is the single
file that knows the library's names; a component asks for an *object* and gets
the class back. The library draws the object — the pill, the card, the track —
and our sheet places it with `data-one`, because layout is the half a component
library cannot have an opinion about: it does not know what screen it is on.

⚠️ **THE FAILURE IS GRADUAL AND EVERY STEP OF IT IS REASONABLE.** One component
spells `btn-primary` inline because it is right there; the next needs a variant
the mapping lacks, so it spells that too; six months later the library's names
are load-bearing in forty files and swapping it is a rewrite. `packages/ui` is
what that looks like finished — 3,275 class literals in one app, 942 written
exactly once.

⚠️ **`danger` IS OURS AND `error` IS THEIRS**, which is the whole reason `TONE`
exists rather than the words being shared. A component that knew both names is a
component where somebody eventually writes theirs, and then a sixth tone exists
that the language never declared.

⚠️ **AND THE CHECK STANDS AT THE DOOR RATHER THAN SEARCHING FOR WORDS.** The
first version searched the package for the class names and was wrong twice: it
flagged `borrow("card")`, where the string is a key into the map rather than a
class, and it flagged our own registry — which legitimately has components called
`tabs`, `skeleton` and `input`, because those are the names of the things, and a
library choosing the same words does not make them the library's.

### 9d1. The boundary provides what it forbids

⚠️ **A BOUNDARY IS A PROMISE IN BOTH DIRECTIONS.** `RENDERER_OWNS` forbids an app
to build its own shell, dialog, toast, form, field, select, checkbox, pagination,
save bar or bulk-action bar. That is only defensible if the package **has** them
— otherwise the rule reads as "you may not have this", the first product that
needs one breaks the boundary with a good reason, and the boundary is over.

**Nine of those were promised and absent for four stages.** Nothing failed,
because nothing asked. `scripts/interface.test.mjs` asks now: a surface on the
list with no component behind it fails `one lint`. Four entries are *placements*
rather than components — `dialog`, `sheet`, `drawer` and `popover` are `Overlay`'s
five kinds, which is the design — and that mapping is written in the guard rather
than inferred.

**The package is complete against its own list**, and the component set that
closed it is the form (`Field`, `Input`, `Textarea`, `Select`, `Switch`, `Check`,
`Choose`, `Dial`, `Form`, `SaveBar`, `BulkActions`) and the reading surfaces
(`PageHeader`, `Breadcrumbs`, `Steps`, `Pagination`, `Table`, `Stat`, `Progress`,
`Disclosure`, `Menu`, `Toast`, `Tooltip`, `Spinner`, `Divider`).

⚠️ **`Dial`, NOT `Slider`** — `slide` is another product's core noun, and the
kernel's vocabulary guard refuses it in shared code precisely so a shared control
and a product's own object cannot end up one letter apart in the same file.

⚠️ **THE PACKAGE HAS DOM *TYPES* AND TOUCHES NO DOM *GLOBAL*.** A component that
renders a form control cannot be typed without `HTMLInputElement`; the moment
that lib is on, `document.querySelector` typechecks and then throws on the server,
where half of this package runs. A second guard closes that.

### 9e. What we kept, and why — `OURS`

⚠️ **"WE WROTE OUR OWN" DECAYS INTO "SOMEBODY DID NOT KNOW THE LIBRARY HAD ONE."**
So the objects daisyUI ships and we deliberately do not use are a list with a
reason each, beside the map of what we borrow, and the two cannot overlap.

| kept | because |
|---|---|
| **field** | `input` clamps its own width at 20rem and draws its own border — one decision belongs to the container, the other to §5.1, where the card is a lift and there is not a single outline in the reference |
| **row** | `list-row` distributes its columns only inside a `.list`, and needs a `list-col-grow` modifier on a **child** to know which one stretches |
| **amount** | the cents are smaller and the figures tabular — a balance is read as a magnitude |
| **segmented** | one indicator that **travels**. `tab-active` cross-fades two pills, which reads as two things happening |
| **overlay** | five placements, one component. `modal` is one placement with its own open/close mechanics |
| **face / medallion** | the §5.2 icon roles are a rule about *rows*, which no avatar component has |
| **tile · quick-action** | the label is not optional and the count is capped — both refusals in code |
| **nav** | one navigation surface at a time. `dock` plus a rail is two answers to "where am I" |
| **sky · section** | no library has an ambience slot, or can see what archetype a section is on |

**Five objects are borrowed** — `btn`, `card`, `badge`, `alert`, `skeleton` — and
the map is held to **zero unused entries**, so it grows with a
component and never before one. It carried six speculative names for a while,
claiming the library's `tabs`, `dock` and `stat` were in use when every one of
them had already been replaced by something of ours.

⚠️ **AND A NAME COLLIDES WITH THEIRS EVENTUALLY.** The review harness called its
phone-frame clock `.status`, which is one of daisyUI's own component classes, and
the clock rendered as an 8px dot. Nothing in the package can prevent that for
code outside it; it is the reason ours is `data-one` rather than a class at all.

### 9f. The bridge has to be IN the sheet

⚠️ **`sheetFor` EMITS `daisySheet`, AND ITS ABSENCE BREAKS NOTHING.** That is the
whole danger. With the variables missing, daisyUI does not fail — it falls back
to its own stock theme, and every borrowed object on the page renders in somebody
else's brand *beside* components of ours that are correct, so the screen reads as
a design disagreement rather than as a missing import.

It shipped that way. The bridge, its twenty-eight variables and its exhaustive
completeness sweep all existed and passed, and nothing put the result in the
stylesheet — found by photographing an orange tenant and seeing a violet badge.
The sheet is one call now, and a test asserts every variable and the tenant's own
accent are in what it returns.

---

### 9f1. Three defects a photograph found and no test did

⚠️ **THE REFUSAL'S REASON WAS INSIDE THE PILL, AND IT CONCATENATED.** A locked
button rendered `PublishNot in your plan`, because a pill is a one-line inline
box and nothing in the markup said otherwise. **Every accessibility assertion
passed** — `aria-describedby` pointed at the right id, the control stayed
focusable, the words were present — because those tests ask what the tree
*means*, and the meaning was right. The reason is a caption under the control
now, and the new check is about STRUCTURE: it fails if the text is a descendant
of the `<button>`.

⚠️ **THE OVERLAY'S OWN PARTS HAD NO RULES AT ALL.** Header, body, footer, dismiss,
confirm-cancel and confirm-go were `data-one` attributes the sheet never
mentioned, so a dialog rendered as three unstyled words and two grey boxes.
Nothing failed, because every test asserted the tree and none of them looked.

⚠️ **AND THE HARNESS INLINED NO BUTTON CSS.** daisyUI's file names are not its
class names — `btn` lives in `button.css` — and the first version guessed from
the class and swallowed the miss with a `catch`. Four kinds of button rendered as
one grey pill in the library's un-themed default. `BORROWED_FILES` sits beside
`BORROWED` now, because an app assembling its own bundle needs exactly that list,
and the harness throws on a file that is not there.

**The pattern in all three: a test that asks what the markup MEANS cannot see
what it LOOKS LIKE.** That is the whole reason the gallery exists, and the reason
its conformance test insists every declared state appears in it.

---

## 9g. The gallery is the deliverable, not a demo screen

⚠️ **DEMO SCREENS PHOTOGRAPH A PRODUCT THAT DOES NOT EXIST.** They look finished,
they agree to nothing, and they hide every component that was never built — which
is exactly how nine surfaces the boundary *forbids* an app to build sat
unimplemented while five very convincing screens were being reviewed.

`reference/specimens.tsx` is the other half of `registry.ts`: that file declares
what exists and what states each thing has been designed in, and this one is the
proof that somebody drew every one of them. `test/specimens.test.ts` fails on

- a **registered component with no specimen** — a declared state nobody has looked
  at is indistinguishable, in the registry, from one that was designed;
- a **specimen for something the registry does not declare** — that is how a
  component gets built, drawn and shipped without a state matrix or a boundary;
- a **group with no stated rule** — a gallery of components with no reasons is a
  picture book, and the next person picks by appearance, which is the decision the
  language exists to have already made;
- and a **refusal that is never drawn**: `locked`, `disabled`, `busy`, `invalid`,
  `empty`, `unknown` and `error` are the states a product ships most often and
  reviews least.

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
| `ladder-never-collapses` | a page and a card that collapse into one surface for some brand in range — and in dark, any step above it too. It used to assert a lightness gap for all four in both themes, which is only satisfiable with grey cards on a white page: a light ground has no room above it, so depth there is carried by elevation instead | **live** |
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
| `an-app-cannot-name-a-look` | a colour, background, margin, duration, font size or width declared by an app — the declaration surface is only provably safe for every tenant while it is closed, and one escape hatch turns the exhaustive sweep into a sample | **live** |
| `the-light-clears-the-floor-everywhere` | a depth, theme or in-range brand whose measured ink falls under the contrast floor — swept rather than sampled, because a range nobody walked is a range with a hole in the middle of it | **live** |
| `the-accent-is-re-lit-per-surface` | a brand computed once per theme, which is legible on the page and not on the card — and whose tempting fix, letting each screen pick its own primary, produces a product whose brand colour differs on every screen | **live** |
| `every-borrowed-variable-is-written` | a variable the component library reads and the bridge never writes — which does not throw and does not look broken: that ONE component falls back to the library's stock theme and renders in somebody else's brand, beside components that are correct | **live** |
| `the-light-survives-the-crossing` | a fill-and-ink pair handed to the library under the floor — proving contrast in our own tokens proves nothing about what the library renders, and what it renders is these pairs | **live** |
| `one-accent-survives-three-slots` | an invented hue in the library's secondary or accent slot — which hands every author a second and third brand colour to reach for, and the restraint that makes one accent read as expensive is gone in a week | **live** |
| `a-class-reaches-the-dom-through-one-door` | a library class name written at a call site — the failure is gradual and every step of it is reasonable, and the finished shape is the legacy tree's 3,275 class literals in one app with 942 of them written exactly once | **live** |
| `no-component-accepts-a-look` | a className or style prop, or a spread of unknown props — a passthrough is an arbitrary look with a friendly name, and one of them turns the exhaustive tenant sweep into a sample | **live** |
| `every-tone-is-mapped` | a tone the language declares and the bridge never maps — it renders in the library's default, which is grey, on the one component whose whole job is to say something is wrong | **live** |
| `a-top-belongs-to-its-archetype` | a crown on a list page, or any other mismatched top — it renders perfectly well and is only wrong beside the four screens it was supposed to match, which is the one place nobody looks while building one | **live** |
| `a-feed-keeps-its-app-bar` | refusing every top on a feed — the first version did, which made the one archetype whose top IS an app bar unable to have one | **live** |
| `the-header-is-inside-only-on-a-feed` | a section header inside its card anywhere but a feed — the title becomes an item in the list it names, and the component cannot see what page it is on, which is why the rule kept being broken | **live** |
| `a-page-may-name-a-mask-not-a-ground` | a list page declaring a photo sky — its top third is unreadable, and the author who set it has no way to see that from the call site | **live** |
| `the-counts-that-change-what-a-pattern-is` | a fifth quick action (that is a toolbar) or a fifth tile across (that is smaller than the hit-area floor) — both read as a rendering fault rather than as the limit they are | **live** |
| `the-stagger-counts-by-position` | nth-of-type where nth-child is meant — every delay lands on the wrong element and the stagger silently does nothing, which renders as "the animation is too subtle" and leads to making the distance bigger | **live** |
| `no-duration-outside-the-clock` | a millisecond written where it is used — two things moving at once then disagree, which is the whole difference between an interface that feels built and one that feels assembled | **live** |
| `the-sky-drifts-on-a-transform` | a backdrop animated on background-position — it repaints the whole layer every frame, and at 52s nobody sees the difference in motion while every device sees it in battery | **live** |
| `the-mask-correction-follows-the-ground` | brightening a masked pattern on a pale ground as well as a dark one — it blows the pattern out to white, which is the same defect with the opposite sign | **live** |
| `every-bloom-is-the-tenants-hue` | a sky colour picked rather than derived — the ambience slot then does nothing again, which is the state it was in for the whole of stages 0 to 6 | **live** |
| `the-bridge-is-in-the-sheet` | a sheet without the bridge — nothing breaks, the library falls back to its stock theme, and every borrowed object renders in somebody else's brand beside components of ours that are correct | **live** |
| `the-borrow-map-is-not-a-wishlist` | a borrowed name with no component behind it — it reads as coverage the package does not have, and six of them sat here claiming the library's tabs, dock and stat were in use after all three had been replaced | **live** |
| `what-we-kept-says-why` | an object written in place of the library's with no reason recorded — "we wrote our own" decays into "somebody did not know the library had one" | **live** |
| `a-sky-literal-is-a-masks-opacity` | a colour picked in sky.ts — it sits on the interface guard's token layer because a mask is an alpha channel written in colour syntax, and that exemption is only safe while every literal in the file is inside a mask | **live** |
| `the-sky-holds-no-timing` | a duration in the sky — the weather is the choreographer's like every other timing, and a component that held one could drift from everything else moving at the same moment | **live** |
| `no-backtick-in-a-sheet` | a backtick written inside a CSS template literal's comment — it closes the literal, the file then fails to parse hundreds of lines away, and the error names a semicolon. It has ended a work session eleven times; the first version of this check searched for the backtick, passed its own mutation, and was the false comfort it exists to prevent | **live** |
| `the-icon-set-is-lucides-and-closed` | a hand-edited path in the generated icon file — the geometry is copied rather than imported, and a copy nothing re-derives drifts into a glyph that is subtly not the one every other product draws | **live** |
| `an-icon-carries-no-size-of-its-own` | an icon with its own width — the same glyph then appears at two sizes on two screens, which is what makes a set look assembled rather than drawn | **live** |
| `an-icon-plays-on-press-not-on-hover` | an icon animation behind hover — half the devices this ships to have no hover at all, so the animation is invisible on a phone and the interface guard would refuse it anyway | **live** |
| `every-icon-motion-is-defined` | a motion an icon names and the choreographer never defines — that glyph stands still while its neighbours move, which reads as a broken icon rather than as a missing rule | **live** |
| `the-house-curve-spends-its-window-moving` | a timing function whose tail sits below the perceptual threshold — an expo ease is at 95% of its distance after 43% of its time, so raising the duration adds milliseconds in which nothing appears to move, and the screen still reads as cheap after the fix looks applied | **live** |
| `the-durations-are-ordered-by-event` | a screen composing itself timed like an object arriving on one, or anything leaving as slowly as it arrived — the first makes the page cheap or the sheet slow, the second is the commonest reason an interface feels sluggish | **live** |
| `an-entrance-travels-far-enough-to-see` | a rise short enough to be a fade wearing a transform, or a stagger under about 60ms — which the eye registers as a smear rather than as an order | **live** |
| `the-press-is-damped-and-the-release-springs` | a control that overshoots on the way down — the finger is still on it, and nothing physical overshoots under a thumb | **live** |
| `depth-is-lightness-in-dark-and-shadow-in-light` | a light theme whose card is not near-white, or whose three depths share one shadow, or a dark theme that draws shadows at all — a bright room tells things apart by what they cast and a dark one by what they catch, and asserting one rule for both forces grey cards or invisible shadows | **live** |
| `the-boundary-provides-what-it-forbids` | a surface on RENDERER_OWNS with no component behind it — forbidding an app to build its own dialog is only defensible if the package HAS one, and nine of them were promised and absent for four stages because nothing asked | **live** |
| `dom-types-never-dom-globals` | a DOM global in a package that renders on the server — the types are a build-time convenience and the globals are a crash in a worker, and the moment the lib is on the first one typechecks | **live** |
| `every-component-has-been-drawn` | a registered component nobody has drawn — a declared state that was considered on paper and shipped unexamined is indistinguishable, in the registry, from one that was designed | **live** |
| `nothing-is-drawn-that-is-not-declared` | a specimen for a component the registry does not have — that is how one gets built, drawn, reviewed and shipped with no state matrix and outside the boundary | **live** |
| `the-refusals-are-drawn-too` | a gallery that shows only the happy path — locked, disabled, busy, invalid, empty, unknown and error are the states a product ships most often and reviews least | **live** |
| `every-group-states-its-rule` | a gallery of components with no reasons — a picture book, where the next person picks by appearance, which is the decision the language exists to have already made | **live** |
| `a-field-is-described-by-its-own-fault` | a field that drops its hint when it fails, or a label that is adjacent rather than attached — both render a form that looks finished and is unusable by voice control and by anybody whose first attempt failed validation | **live** |
| `a-trend-takes-its-tone-from-meaning` | an up arrow rendered as good news — spend up and weight down are both bad, and this is the thing every trend indicator gets wrong | **live** |
| `a-failure-in-a-toast-does-not-vanish` | a failure announced politely and timed out — a message that disappears cannot be how somebody learns something they needed | **live** |
| `a-refusals-reason-is-a-caption` | a refusal's reason rendered inside the pill — it concatenates with the label into "PublishNot in your plan", because a pill is a one-line inline box. Every accessibility assertion passed: they ask what the tree MEANS, and the meaning was right; only the shape was wrong, and only a photograph showed it | **live** |
| `every-borrowed-object-names-its-file` | a consumer assembling a bundle by class name — daisyUI ships `btn` in `button.css`, so the most-used object in the language silently gets no styles and every button falls back to the library's un-themed default | **live** |
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
