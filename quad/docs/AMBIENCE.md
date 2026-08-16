# Ambience

kind: guide

**How a screen gets a world behind it.** There is one engine — `web/src/scene/` —
and everything on this page is either how to use it or a decision inside it that
cost something to learn. `web/src/tokens/ambience.ts` is where a scene is mounted
on a page, and that is now the only thing left in that file.

## The system in one paragraph

A ground is a **composition**, not a gradient.

```
family + seed + settings  →  a ground, a field, and the colour type sits on
```

- **A FAMILY** declares what a kind of world is made of: named colour SLOTS, a
  GROUND built from them, MARKS (scattered, laid on a lattice, or drawn whole),
  optional shared `defs`, and the `veil` type sits against. There are seven.
- **A SEED** decides which world you get. Same seed, same world, forever — a
  scene is an identity, and `Math.random` appears nowhere in the directory.
- **SETTINGS** are density and motion. Nothing else.

**A screen names a family; it never draws one (D7).** That is the same rule the
old system enforced, arriving at a much smaller surface.

## What replaced what

This used to be **twenty-four hand-written grounds** — roughly 1,400 lines of
gradient stacks, drawn line art, per-ambience field weights, five per-theme
multipliers and a bespoke composer. All of it is gone.

| was | is | why |
|---|---|---|
| `calm` `focus` `lift` `mesh` `veil` `tide` `spotlight` `bloom` `aurora` | **`glow`** | nine afternoons placing two to four soft poles at different strengths. The difference between any two is where the poles are and how hard they burn — which is a seed |
| `weave` `drape` `silk` `linen` `wire` `ridge` `flow` | **`cloth`** | seven ways of saying "very fine marks on a nearly black ground". Three already shared a generator and were called "one material at three settings" |
| `dots` `grid` `arc` `prism` `terrace` `rays` `streak` | **`etch`** | six repeating gradients at six pitches. A `repeating-linear-gradient` can only be one pitch at one angle; a lattice tile can be anything |
| — | **`space` `aura` `loops` `blobs`** | the four a SUBJECT gets, one per kind of face |

⚠️ **The ratio is the argument.** Each of the twenty-four was one world drawn
once, so the twenty-fifth was the same afternoon again and none of them could
vary per workspace at all. Each of the seven is *every* world in its own space.

## The seven families

`FAMILIES` in `web/src/scene/index.ts` is the whole list, and a family not in it
is a family nothing can reach.

### Four belong to a SUBJECT

The world falls out of what the subject IS — nothing picks it per screen
(`worldFor` reads the kind off the face).

| | **space** — a workspace | **aura** — a person | **loops** — a product | **blobs** — the deployment |
|---|---|---|---|---|
| what it is | a landscape you look AT | an atmosphere you stand IN | a system, so a lattice | the thing all of them are inside |
| the marks | ~190 tiny sharp stars per megapixel | ~7 enormous soft blooms | one tile in four rotations, edge to edge | ~4 generated silhouettes |
| the beat | a twinkle — most of the way out, in 3–5s | a breath — a fifth of a stop, over 13–19s | a quarter TURN, in 47–71s | a breath |
| the colours | read from its planet | read from its mood | the theme | the theme |

### Three a SCREEN may name

`glow`, `cloth` and `etch` — plus `loops` and `blobs`, which a screen may name too.

| family | what it is | reach for it when |
|---|---|---|
| **glow** | pure light — three seeded poles and a crush. The only family with no marks at all | most screens. It is what a page wants behind it when it wants anything |
| **cloth** | a swept field of fine lines, drawn whole, tiling by construction | a premium dark ground; a screen somebody works on for a while |
| **etch** | ruled geometry — a lattice whose tile draws some subset of its own edges and diagonals | technical: a console, a deployment, monitoring, planning |

```tsx
<Layout sky="cloth" seedling={`hub|${where.at}`}>
```

⚠️ **`plain` is still the default, and that did not change with the engine.**
Ambience everywhere is ambience nowhere: the reason the rich screens in a good
product land is that most screens are flat. What earns a ground is a screen
somebody ARRIVES at — a balance, a home, a result — never a form and never a list.

⚠️ **The seed is the screen's own identity, and it is the whole gain over a
name.** `Shell` passes `${appId}|${route}`, so every screen in a product has its
own world inside the product's material, for free, with nobody choosing anything.
Passing nothing means every `glow` page is the same page, which is also a
legitimate answer and is why the parameter has a default.

⚠️ **Only some families are nameable, and it is a constraint rather than a
policy.** `space` and `aura` read two colours out of a generated PICTURE and
paint marks with them. There is no picture behind a screen, only the theme, and
`var(--brand)` inside an SVG is a string rather than a colour — it resolves to
nothing and the field is silently absent. `SKIES` is derived from `Family.ink`,
so a family that changes its ink moves between the two sets on its own.

## The three ways to make a field

| primitive | what it is | who uses it |
|---|---|---|
| **`specks`** | scattered marks, blue noise, `per` megapixel | `space`, `aura`, `blobs` |
| **`tiles`** | an exact lattice, `cell` in tile units, each tile drawn in the unit square | `loops`, `etch` |
| **`drawn`** | one composition sized to the whole tile | `cloth` |

⚠️ **A scatter cannot make a pattern.** `scatter` jitters on purpose — evenness
from the cells, irregularity from the offset — which is right for stars and
destroys anything whose marks have to MEET. A truchet three pixels out is a field
of curves ending in mid-air. Adjacency is the mark.

⚠️ **A drawn field must tile by construction, which is a constraint on the math
rather than a note.** The field repeats at the tile, so a curve whose value at
`x = 0` differs from its value at `x = w` shows a vertical crack down every
repeat — one pixel wide, perfectly straight, and the single most visible thing on
a quiet ground. `cloth` uses whole numbers of cycles across the tile, and
quantises its diagonal fall to whole line spacings, for that reason and no other.

⚠️ **Density means the opposite thing to a lattice.** For a scatter, presence is
HOW MANY, so `quiet` is fewer marks. A lattice has no count — it fills what it is
given — so presence is HOW BIG. Dividing by the density produced a coarse bold
weave under the setting that asks for calm.

## Decisions worth knowing before adding a family

- **Density is a rate, and a screen names an intent.** `quiet` for a page of
  rows, `even` by default, `rich` for an arrival. A count is right for one canvas
  and wrong for every other.
- **Scatter is a jittered grid, which is blue noise for free.** Independent x and
  y produce clumps and bald patches and the eye reads both as structure.
- **Only a share of the marks that CAN move actually do.** A field where
  everything moves is a field nobody can read over — the movement stops reading
  as life and starts reading as noise.
- ⚠️ **The field is an ELEMENT, not a background image.** It was a
  `background-image` carrying its own `<style>` — the better design, and it does
  not work: **Chromium renders an SVG used as `background-image` statically.**
  Measured, the same file animates as an `<img>` and as inline SVG and does not
  animate as a background, so every star in this product was frozen from the day
  the field was written — with a guard checking the keyframes were
  compositor-only, a test checking the still bake differed, and nothing anywhere
  checking that anything moved. The field is an inline `<svg>` laying one
  `<pattern>` now, so the browser still lays out two elements whatever it
  contains, and the beats are ordinary rules in `ambienceStylesheet`. That also
  deleted the two-bake requirement.
- **A beat animates opacity or a quarter TURN, and nothing else.** How far it
  dips is the beat's (`BEAT.dip`), because `1 → .3` is right for a star and is
  the whole page throbbing when the mark is a fifth of the screen wide. A turn
  needs `transform-box: fill-box` or the tile orbits the page rather than
  spinning in place, and it needs its own `<g>` — in SVG2 the transform attribute
  IS the CSS transform property, so a keyframe would replace the translate that
  put the mark where it belongs.
- ⚠️ **A light is not a hue.** Turn a hue up and you get more of that hue; turn a
  real source up and it goes toward WHITE. `moods` picks faces from twelve
  saturated colours, and mixing one straight into a dark teal ground gives
  KHAKI — a chroma problem, not a strength one, so no opacity fixes it.
- ⚠️ **And a family on the theme's palette carries its presence in VALUE**,
  because a monochrome theme has no other channel. Numbers tuned against a hue
  read as flat against `var(--brand)`; the same numbers doubled read as a grey
  wall if the family is a line field. Both mistakes were made here, one each way.
- **The vignette is a MASK, not a wash.** A ground that has to be covered to be
  readable is a ground that is too loud, and the cover is a grey film over
  somebody's brand. A scene's own alpha drops where content sits. A guard refuses
  the scrim.
- **Light mode is a real sky rather than a rule.** For one build a world was a
  dark room in both themes, because every attempt at a pale night came out grey
  and "space is dark, so commit" looked like a decision. It was three failed
  attempts wearing one. Every family declares a `day` of its own.

## The layout binding — one subject, three consequences

**A page names its SUBJECT and everything else follows.** `Layout` is the
outermost piece a screen sits in, and it is the only thing that may assemble a
scene:

```tsx
<Layout sky="cloth" subject={placeFace(slug)} frame={{ title, under, back }}>
```

From that one face: **the GROUND** is that subject's own world, **the CROWN**
becomes a title card wearing its face, and **the DENSITY** becomes an arrival's.

⚠️ **This is a fix, not a convenience.** The hub derived all three separately
from the same slug — three expressions that have to agree, none of which can tell
when they do not: edit one and the crown wears one workspace's planet over
another workspace's sky, invisible in a screenshot of either.
`scripts/scene.test.mjs` refuses `worldOf`/`worldCss`/`worldFor` outside the
vocabulary.

⚠️ **And the subject travels by CONTEXT, which is the enforcement.** It was a
`face` on `Frame` — a prop, so any router could set one — and a face set there
gets the title card WITHOUT the sky it is supposed to be standing on: a planet
floating on linen, which looks deliberate.

### Type on a scene: `ON_SCENE`

**The one place a scene can lose is words laid directly on it.** A name crossing
the lit limb of a planet has the same value on both sides of every stroke.

The obvious fix was tried and removed: a plate behind the words is wider than the
subject, so its edges sit on plain sky as two dark patches either side of it.
What works is a **halo in the ground's own colour** — invisible as a shape, a few
pixels out from every edge, dimming nothing.

The family declares that colour (`Family.veil`), because `ground` is a list of
gradients and nothing downstream can read a value out of it. ⚠️ It is per SKY,
not per scene — a night's veil is near its deep and a day's near paper, and the
same halo under both would outline the letters on one of them. ⚠️ And it is
opt-in, never a rule on the page: text inside a card is already on a surface.

### Chrome on a scene: `data-chrome` and `data-hem`

Two treatments, and they solve different problems. Reaching for the wrong one is
why the nav shipped as a plate for a while.

**`data-chrome` is for CONTRAST — a control that has to stay legible over a
moving field.** It fills with the ground's own colour a step denser
(`--surface-tertiary` for the value, `--scene-veil` for the hue) so it reads as
the ground thickening rather than a plate laid on top. Not glass: a
`backdrop-filter` over a live field re-reads and re-blurs on every frame of every
beat, and it *smears* as the marks move under it.

**`data-hem` is for COLLISION — the page's own content arriving at pinned
chrome's edge.** That is a different fault and no fill on the control can reach
it, because it happens *outside* the control: a face halved down the gutter, a
heading reappearing in the gaps either side of a capsule, a card running clean
through the workspace's name in the crown. The hem is a short fade built from
`--scene-veil`, opaque at the screen's own edge and gone about 7rem in, so
content dissolves into the ground on its way past.

⚠️ **It names its edge — `data-hem="top"` or `"bottom"` — and there are seven of
them**: four crowns and three docks. A person sees *one* crown and *one* dock,
so which of the seven they landed on decides whether their page is cut. That is
what the `hem:` check in `scripts/scene.test.mjs` is for, and it is the state the
check was written in: three docks wore it and four crowns did not.

⚠️ **`hold` is where the CONTROLS end, not where the box does**, and the
difference between those is what made the first version bite. A crown is
`min-h-16` with `h-11` controls centred in it, so the last pixel of a button is
at 54px — while the header's own box runs to 64 and the hold was set to 96.
Forty-two pixels of full opacity below anything anybody can see, with the falloff
*on top of that*: the chrome stopped blending with the screen and started sitting
on a panel with a soft edge, which is the plate the hem exists to replace. It is
measured per edge now (3.5rem at the top, 4.75rem at the bottom) and it barely
reaches the control — a hem that clears the control by a margin is a bar again.

⚠️ **The falloff is the number with the tension in it.** Too short and the fade's
own top edge becomes a visible line, which is the border being removed; too long
and content dies halfway up a screen nobody has scrolled. 3.5rem, shared. An
earlier version ran to 12rem at both ends on a theory about pages being read
downwards — shot both ways, no visible difference, and both were too much.

⚠️ **A fade is not the plate the no-glass pass removed, and the difference is
the edge.** Every treatment that pass deleted was a band with a *boundary* — a
line across the screen where it stopped, which is a border by another name. This
has no boundary anywhere: it is opaque only where the screen ends and there is
nothing to have an edge against.

⚠️ **It travels with what it hems.** The pseudo belongs to the docked element, so
when the nav leaves downwards the fade goes with it. A hem left behind by a bar
that has gone is a dark band with no cause.

⚠️ **Three elements dock at that one address** — the nav island, `StickyAction`,
and a `Screen`'s docked primary — and a person sees *one* dock. Two of three
wearing it is exactly the shape `scene.test.mjs`'s `hem:` check exists to catch.

⚠️ **The stops are in `rem`, not percent**, because the element is bottom-anchored
and absolute stops hold full strength across the bar's own height whatever that
height is. In percent the falloff starts partway up the bar — measured, and it
left the ghost of a heading behind the icons.

⚠️ **And the last stop repeats the colour at zero alpha rather than saying
`transparent`.** `transparent` is transparent *black*, so a gradient
interpolating toward it darkens as it fades — a grey bloom above the bar on a
light page, from a rule that never names a grey.

### What the hem let the chrome stop being

Once content dissolves before it reaches a control, every fill that existed to
survive that content is doing nothing. Both crowns and the nav lost theirs:

| | was | is |
|---|---|---|
| nav bar | filled capsule | nothing — the hem |
| nav, where you are | `--default` pill | ink: full foreground vs thinned `--muted` |
| back / close | `data-chrome` chip | bare glyph |
| compact page title | chip + capsule | plain text |
| crown's secondary action | `tertiary` fill | bare glyph |
| crown's primary action | `tertiary` fill — *identical to the secondary* | `primary`, the one filled thing up there |
| crown's search | `data-chrome` fill | **unchanged** |
| shell's crown | scrolled away, with a `Separator` under it | pinned, hem, no rule |

⚠️ **Search keeps its fill, and that is not an exception — it is the point.** The
rule is about the *cause*: a field with no affordance in it is a label. The fill
and the lens are what make a row of words read as somewhere to type, and neither
is doing contrast work. Everything else in that table had a surface *for
contrast*, which is the job the hem took over.

⚠️ **The two crown actions were drawn identically**, so a destination's main act
— *New job*, *Admit*, *Export*; every caller's second slot without exception —
sat beside a date picker at the same weight. They are `also` and `does` now:

```
( face )( find                    )( also )( does )
```

**With the hem under it, nothing in the nav is a surface.** No bar and no pill:
the five items stand on the page, and "where am I" is answered entirely in ink —
full foreground against a distinctly thinned `--muted`, plus the one word. Every
surface the nav used to have was solving a problem the hem solves better: the bar
was holding contrast against a moving field, and the pill was clearing the bar.

⚠️ The dimming is a *colour* rather than an opacity, because the unread dot lives
inside the button — fading the button fades the one mark whose whole job is to be
noticed, and the dot carries its own tone token. And the floor on how far it can
be thinned is the **WCAG non-text 3:1**: a closed item is a glyph carrying a
destination with no word beside it.

## What the seed reaches, precisely

Because "endless variation" is the kind of claim that drifts.

| | varies by seed |
|---|---|
| where a mark lands | ✅ every family with `specks` |
| which variant it is | ✅ every family with marks |
| the SHAPE of the mark | ✅ `blobs` — a closed spline computed from the stream |
| the ground under it | ✅ `glow`, `cloth`, `etch`, `loops`, `blobs` — ❌ `space` and `aura`, which ignore the stream they are handed |
| how many, how loud | ⚠️ a SETTING (`density`), not the seed |

**The one thing with no code at all is per-instance settings over a shared
family** — the "every wallet is glass, each wallet is its own glass" case, where
two instances diverge by something a person CHOSE rather than by their seed. It
is deliberately unbuilt: nothing here yet needs it, and a mechanism with no
consumer is the failure this repository has a document about. The moment a second
consumer of one family wants to differ, that is the change.

## What this file no longer governs

- **The colour tokens themselves** — `tokens/theme.ts`. A family names slots; the
  brand fills them.
- **Chrome over a ground** — still in `ambience.ts`, because it is about what
  sits ON a page rather than what a world is made of. ⚠️ **It is no longer
  glass.** A `backdrop-filter` over a still gradient costs one readback; over a
  LIVE field it re-reads and re-blurs the layer under every chip on every frame
  of every beat, and the smear CHANGES as the marks move under it — which is the
  one thing a fixed control must never do. `--scene-veil` publishes the ground's
  own colour, and a chip is the world's hue at the palette's value: separable in
  both themes, over seven families, with no readback at all.
- **Twenty-four names.** They are gone from the code, from the type, from the
  gallery and from here. If a screen wants one back, the answer is a seed.
