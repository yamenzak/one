# Ambience

kind: guide

**How a screen gets a world behind it — which one to reach for, at which of the
three levels the choice is made, and the rules that keep colour meaning
something.** The implementation is `web/src/ambience.ts`; this is the
judgment the implementation cannot make for you.

## The system in one paragraph

An ambience is a NAMED SHAPE (`drape`, `tide`, `aurora`…) drawn from five knobs
it never chooses itself: the HUE comes from the tone (`neutral`/`info` → the
workspace's `--brand`, `success`/`warning`/`danger` → the status tokens), the
STRENGTH from `--sky` (1 in dark, 0.55 in light), the FIBRES from `--thread`
(1 in dark, 0 in light — micro-texture reads as sheen on near-black and as
grime on paper, which is a sign problem no multiplier fixes), the FIELD from
`--field` (the full-height colour the shapes are lights on), and the dither
from the grain layer. A screen names a shape and a tone; it never names a
colour, a gradient or an opacity. That is why one brand change re-paints every
screen of every app and nothing else edits.

**The world owns the screen.** Under every ambience runs a full-height FIELD of
the same hue — the shapes (poles, folds, sweeps) are lights ON that world, not
decorations on the page's bare ground. Two consequences worth knowing:

- **Light keeps its saturation.** The field mixes toward paper (`--lumen`), not
  toward transparent — so light mode is the same colour at a higher VALUE
  (lilac, not faded violet). The value lightens; the hue stays committed. A
  light ambience that looks like a stain got this backwards.
- **The field's weight is per ambience** (`FIELD_WEIGHT` in `ambience.ts`),
  because one strength drowned eleven identities: at full field, drape's fold
  and veil's sweep sat inside the field's own value range and vanished. The
  field-led ambiences (`calm`, `lift`, `tide`) run at full; the shape-led ones
  give their graphic darkness to stand against, `spotlight` most of all —
  staging IS darkness. Tuning a weight is a design change to that ambience's
  identity, not a knob a screen may touch.

**The interface on top is monochrome.** The ambience is where colour lives —
the ONE place a workspace's hue reaches at full strength — and the controls
sitting on it are values. Whatever ambience a screen picks, the reading rule
holds: the only saturated things on a screen are the world behind it and the
data in front of it.

## The three levels, and who decides at each

**The APP picks a signature — one material, once.** An app's personality is one
"material" family it wears on its home and its hero moments, chosen when the
app is born and changed the way a logo is changed. Kova might wear `drape`
(fabric, worth, premium); a signage product might wear `dots` (technical,
measured); a finance product `tide` (calm, patient). One app, one material —
an app that wears drape on Monday's screen and aurora on Tuesday's has no
material at all.

**The SCREEN picks from its KIND, not from taste.** Within an app, which
ambience a screen carries falls out of what kind of screen it is — the table
below. Two screens of the same kind carry the same ambience; a designer's
choice happens once per kind, not once per screen.

**A MODULE (a `Band`) may lift — at most one per screen.** `Band` accepts its
own `sky`, and the budget is ONE non-plain band per screen, for a section that
is genuinely a moment: an upsell, a celebration strip, a locked feature's
pitch. Two lifted bands beside each other are two competing worlds on one page,
and the eye reads the seam between them as a mistake. If two sections both feel
like moments, the screen is two screens.

## Which ambience, by screen kind

| Screen kind | Ambience | Why |
|---|---|---|
| Home / today / the hero | the app's signature (`drape`, `dots`, `weave`…) | the one place the material is worn at full presence |
| Reports, charts, tables | `tide` | wide, calm, low-frequency — nothing behind the data competes with the data |
| Settings, forms, admin | `veil` or `calm` | directional light, no texture; the page is for reading and pressing |
| A single task / flow / wizard | `focus` | the vignette pulls to the middle, which is where the task is |
| Sign-in, arrival, the front door | `calm` or the signature | first contact: quiet, or the material — never busy |
| Celebration, milestone, reward | `aurora` | the only multi-hue ambience; spend it on somebody ELSE's achievement |
| One object, one decision (paywall, confirm-delete) | `spotlight` | staged on purpose; use where the screen IS one thing |
| An arrival — the hub root, a product's front page | `silk` | swept 1px contours on near-black, breathing so slowly nobody catches it. The premium ground, and the one an arrival earns |
| A screen somebody works ON for a while | `linen` | the same cloth pulled flat: fewer lines, half the bend, more air. Darker than the arrival, not lighter |
| The operator's side — a deployment rather than a business | `wire` | near-straight and fanned. Schematic rather than woven, which says where you are before a word is read |
| A premium tier, a flagship pitch | `streak` | the one pure graphic: a neon ribbon whose drama is the darkness around it |
| An announcement, a launch | `rays` | beams from above — something new arrived |
| Devices, monitoring, live status | `arc` | concentric rings on a measure; reads as sonar, technical without being busy |
| Planning boards, technical dashboards | `grid` | etched graph paper — the one pattern that survives light at half voice |
| Levels, tiers, a progression ladder | `terrace` | stepped strata: the shape IS the concept |
| A journey, terrain, long-run progress | `ridge` | drawn topographic contours — distance travelled, distance left |
| Shared money, activity, anything with a current | `flow` | drawn parallel streams; movement without animation |
| People, profiles, warmth | `bloom` | a tight organic cluster of light — a presence, not a place |
| Creative tools, galleries | `prism` | two crisp slabs crossing; the overlap is the light |
| Empty/blocked/maintenance interstitials | `plain` or `veil` | a big mood behind "nothing here" reads as sarcasm |
| Everything else | `plain` | **the default.** Ambience everywhere is ambience nowhere |

The twenty-four brand-hued ambiences fall into five families — soft light (the
original twelve), geometry (`rays`, `arc`, `prism`, `terrace`, `grid`), drawn
line art (`ridge`, `flow`), staged graphics (`streak`), and a drawn ground that
moves (`silk`, `linen`, `wire`) — and the family is part of the choice: an app whose signature
is soft light can still spend `streak` on its one flagship screen, but two
families on one SCREEN is two worlds fighting.

**The premium dark ground is a LINE FIELD, not a light**, and that correction
cost a round. The obvious reading of "make it feel high dynamic range" is a
bright source on black. It was built: at any strength that reads as a source it
is a BLOB — a smudge on the lens, pulling the eye to a place with nothing in
it. What the products that do this well actually ship is the opposite. The
ground is essentially black; the only thing on it is very fine lines at a
hundredth of the contrast of anything else on screen; and the eye reads
MATERIAL rather than light, so nothing competes with the one figure the screen
is for. `silk` is that, and its field weight is the lowest in the table because
a lit colour across the screen is the single thing that destroys it.

**A line field bunches or it is a pattern.** Evenly spaced curves are wallpaper
however wavy each one is; curves whose spacing opens and closes across the
frame read as a surface with a shape under it, the way a contour map has a hill
in it. In `weaveArt` that comes from a power curve on the line index and a
swell whose amplitude varies per line — two terms, neither decorative.

**A surface wears ONE material, so the three drawn grounds are one generator at
three settings.** The hub shipped a drawn field on its arrival and a soft grey
wash one step in, and walking into a workspace changed what the product
appeared to be made of — while the wash, being a lit colour behind eight rows
of content, read as dust rather than as a world. Variation belongs in the
DRAWING: how many lines, how far they bend, how hard they bunch (`Weave`,
`WEAVES`). Two rules came out of that and both generalise:

- **A working ground is DARKER than an arrival, never lighter.** The instinct
  when a screen feels busy is to soften its ground by lifting it. Lifting it is
  what makes the grey; take the light away instead.
- **A drawing is sized `cover`, never `100% 100%`.** Stretching to the viewport
  squeezes the drawing's width into a phone while pulling its height over a tall
  screen, so the slope multiplies and the lines close up — a calm field on a
  desktop and corduroy on a phone, from one stylesheet. And it is sampled
  coarsely and drawn as curves rather than finely as a polyline: same bytes, and
  the faceting a polyline shows when scaled UP is the phone's problem, not the
  laptop's.

Rules of thumb that outrank the table:

- **`plain` is not a failure to choose — it is the choice** for most screens.
  The ambiences read as considered precisely because most of the app is quiet;
  the ratio to hold is roughly one ambient screen per three plain ones.
- **Depth of content beats mood.** A screen a person works IN (long lists,
  dense tables, editors) stays `plain` or `tide` no matter what kind it is —
  the material belongs on screens a person looks AT.
- **`aurora` is annual, not daily.** It is the loudest thing in the system;
  on a screen somebody sees every morning it is wallpaper within a week.

## Colour

- **A screen names a TONE, never a colour.** `neutral`/`info` resolve to the
  workspace's `--brand`; `success`/`warning`/`danger` resolve to the status
  tokens. There is no fourth way and no hex anywhere in an app.
- **A toned ambience is a sentence, not a theme.** `tone="warning"` behind a
  screen says "something here needs attention" — it is for arrears banners,
  degraded-state dashboards, dunning screens. Do not decorate with status
  tones; a warning-coloured sky over a healthy screen is a false alarm somebody
  eventually stops believing.
- **The brand default is the platform blue** until a workspace chooses;
  un-branded must look designed, not unfinished.
- **A context may one day carry its own hue — as a registered token, never a
  hex.** The reference product gives each account its own world (violet
  personal, blue groceries, green online), and that is a real pattern: the
  colour tells you WHERE you are before a word is read. If an app wants it,
  the road is the tone channel — the app registers named tones that resolve to
  tokens, exactly as Kova's eleven accents do — so the screen still says
  `tone="groceries"` and never `#4477ff`. Nothing today needs this; it is
  written down so the first app that does builds it the right way instead of
  the obvious way.
- **Data ignores all of it.** Chart hues are the platform's (`--data`, the
  categorical eight, the diverging poles) whatever the ambience does — a brand
  may recolour the world, never a reading.

## Patterns and texture

- **Fibres are a dark-theme material.** The 1px threads (`weave`, `drape`) and
  dot fields (`dots`) exist only where marks are lighter than the ground —
  light mode gets the folds, poles and sweeps of the same ambience with
  `--thread: 0`. Never re-enable fibres in light "because they look subtle on
  my screen"; they are grime on somebody's brighter one. Guarded (`threads:`).
- **Etched lines are not fibres, and pitch is the boundary.** Rings at 56px
  (`arc`) and graph lines at 44px (`grid`) are sparse enough that each line
  reads as printing, the way a ruled notebook is not a dirty page — so light
  DIMS them (`--etch: 0.5`) instead of killing them, and the pattern survives
  the theme at half voice. Below ~24px pitch it is micro-texture and must be a
  fibre. The same guard enforces both, by pitch.
- **Line art is drawn, achromatic, and theme-flipped.** `ridge` and `flow` are
  computed SVG — an SVG data URI cannot carry a token, so the drawing carries
  no colour at all: white strokes over the hue field in dark (light catching a
  ridge), near-black strokes over the pastel in light (printing). Both work
  over every brand because neither names one. A new drawing is new MATH in
  `ambience.ts`, never a hand-authored path and never a bitmap.
- **New patterns must be aperiodic or single-pitch.** Two repeating layers at
  close pitches beat into a moiré lattice — the grain is `feTurbulence` for
  exactly this reason. Guarded (`grain:`).
- **A new ambience is a vocabulary change**: it needs a name that is a
  material or a light (not a feeling), every angular stop ramped (no seams), a
  light-mode pass at `--sky: 0.55` with fibres off, and a row in this table
  saying which screen kind it serves. If no row wants it, it is a wallpaper,
  not an ambience.

## Endless variety — the primitives, and bespoke worlds

A named ambience is a RECIPE over a small primitive vocabulary in
`ambience.ts`: `mix` (a sky-scaled tint), `pole` (a soft light), `hot` (a core
mixed toward white — a bright light is not a saturated one), `orb` (a source
with range in it), `crush` (darkness deeper than the page's own ground),
`thread` (micro-fibre, dark only), `etch` (macro line, dims in light), the
conic fold, the repeating ring/beam, the drawn `art`
layer, and the `field` under all of it. Twenty-four names is not the ceiling — a new ambience is a few lines of
recipe, and the checklist below is the whole cost.

**`bespokeCss(seed)` composes a world that belongs to nobody else.** A
deterministic seed picks an archetype (pure light, a sweep, a fold, rings,
beams) and jitters positions, angles and strengths within the ranges the named
ambiences were tuned in — so a workspace can have a home no other workspace
has, and it still obeys every rule on this page: hue from the tone, strength
from `--sky`, the field, the grain, the fade. Same seed, same world, forever;
a bespoke ambience is an identity, and identities do not drift. Use it for
workspace-level distinction, never to dodge the screen-kind table — a screen
inside an app still names a shape or `plain`.

## Motion

**Most ambiences do not move, and that is still the default.** A background
that moves on its own schedule is a background somebody cannot stop watching,
and twenty-one of the twenty-four are still.

**Two do, and the rule they answer to is that nobody may catch them.** A real
lit room is not still — the light has a source and the whole thing breathes —
and a world that is perfectly frozen reads as wallpaper however carefully it is
composed. `silk`, `linen` and `wire` declare a drift in `DRIFT`, and everything about it
is bounded:

- **It is a `transform` on the layer, never moving gradient stops.** A drifting
  gradient repaints a full viewport on every frame, on the main thread; a
  transform on that same layer is the compositor's work and costs approximately
  nothing. On a laptop the difference is invisible. On a phone it is the whole
  experience.
- **One keyframe, parameterised.** Two moving ambiences with two hand-written
  keyframes is how a third arrives with a third curve, and then the product has
  a motion vocabulary of one item per screen — the failure `motion.ts` exists to
  prevent, reintroduced by the file nobody thinks of as motion. The pace is
  `DURATION.ambient` and the curve is `EASE.plain`; neither is written here.
- **`alternate`, never a loop.** A drift that runs to its end and jumps back to
  the start is a twitch every N seconds, which is far more noticeable than the
  movement — the one thing a ground must never do is draw the eye.
- **The scale never goes below 1.1.** The layer is exactly a viewport tall, so a
  translate on an unscaled layer exposes bare ground and a hard edge at the top.
  The overscan is what keeps the world edgeless while it moves.
- **The amplitude is smaller for a drawing than for a wash.** Ten percent of
  scale on a soft gradient is a breath; the same on a field of 1px lines slides
  every line across its neighbour's place and reads as a crawl. `silk` moves a
  third as far as a gradient would.
- **Both reduced-motion switches stop it, non-negotiably** — the OS setting and
  a `data-reduce-motion` ancestor. Either alone leaves half the people who asked
  still watching it, and for some of them this is not a preference.

Nothing else in an ambience may pulse or cycle, and a third moving ambience
needs an argument, not a `DRIFT` entry.

## What this file does not govern

The mono interface (`ground.ts`, guarded by `mono:`/`kin:`/`tiers:`), the
chart palette (`chart/palette.ts`), and the glass on chrome (`ambience.ts`,
crown and island only). An ambience decision never changes a control.

## `world` — the one ambience that is not the brand's

**A workspace's face is a planet. Its own screen is that planet, at the size of
the screen, in its own sky.** Nothing else in the product has an identity a
ground can be built from, which is why this is one ambience rather than a family
— and why it is the prototype for everything in the next section.

- **The style is DECOMPOSED, not masked.** `planets` declares a planet, a
  surface, a shade, a ring, moons and twelve stars over a background, so the half
  that is the world is had by turning the other half off: every star to
  probability zero and a background whose alpha is zero (`#00000000`, the only
  spelling the schema accepts for "none"). The planet arrives on transparency —
  no crop, no seam, and the ring free to reach wherever it likes. The first build
  took the whole picture and faded its edge to hide the square it carried, which
  is a workaround for a picture that was never asked for correctly.
- **The space half is learned from, not rendered.** Twelve stars on a fixed grid
  is right inside a 40px disc and thin across a viewport, so the field scatters
  its own — at the style's five magnitudes, its weights and its twinkle periods.
  What comes from the picture is two colours; what comes from the style is a
  vocabulary.
- **The animation lives inside the generated SVG.** The style animates its own
  stars from a `<style>` element in its own document, behind its own
  `prefers-reduced-motion: no-preference` guard, so the motion travels with the
  image, survives being used as a background, and switches itself off without a
  rule from us. Ours does the same. The periods are still `motion.ts`'s: a
  generated picture is a place a duration could be invented, and it is not an
  exemption.
- **A world is a DARK ROOM in both themes,** and that is the answer to the one
  thing light mode could not do. Space is dark. Leading with the planet's body
  colour makes the ground compete with the planet; leading with its deep makes a
  near-black into white, which is a grey nobody chose. Neither is washed because
  it is tuned wrong — both are washed because the subject is a night and the
  ground was being asked to be day. So the page stamps its own theme, every token
  inside it resolves dark, and somebody in light mode walks from a paper hub into
  a lit room. It is the only screen in the product that does this.
- **Two addresses land; everything else wears a material.** A workspace's own
  screen and the hub's ROOT are the two identities in the product, so they get
  worlds. People, Money and Settings under the same workspace keep `linen` — an
  arrival somebody never leaves is not an arrival, and those are screens with
  eight rows on them. Landing is a moment; working is a material.
- **The root is YOUR world, and it is a different family.** Your face is a mood,
  so your ground is an `aura` rather than a starfield: light with no horizon in
  it, which is what standing in somebody's own place looks like rather than
  visiting it. Nothing chooses that — `worldFor` reads the kind off the face.

## The scene engine

**A ground is a COMPOSITION, not a gradient**, and `web/src/scene/` is the
engine that says so. It exists because the twenty-four named ambiences above are
twenty-four worlds each drawn once — the twenty-fifth is the same afternoon
again, and none of them can be varied per workspace at all.

```
family + seed + settings  →  a ground and a speck field
```

- **A FAMILY** declares what a kind of world is made of: named colour SLOTS, a
  GROUND built from them, SPECKS — each with weighted variants and, for the ones
  that may move, which beat and what share of them keep it — optional `defs` the
  marks share, and the `veil` type sits against. Two exist: `space` and `aura`,
  each with a `night` and a `day`.
- **A SEED** decides which world you get. Same seed, same world, forever — a
  scene is an identity, and `Math.random` appears nowhere in the directory.
- **SETTINGS** are density and motion. Nothing else.

Five decisions in it are worth knowing before adding a family.

- **Density is a rate per megapixel, and a screen names an intent.** `quiet` for
  a page of rows, `even` by default, `rich` for an arrival. A count would be
  right for one canvas and wrong for every other; an intent keeps the number out
  of the call site, where somebody would tune it for their own screen.
- **Scatter is a jittered grid, which is blue noise for free.** Independent x and
  y produce clumps and bald patches and the eye reads both as structure. Cells
  give evenness, the offset within each gives irregularity, and it costs one pass
  instead of the rejection sampling a true Poisson disc needs.
- **Only a share of the marks that CAN move actually do.** A field where
  everything twinkles is a field nobody can read over — the movement stops
  reading as life and starts reading as noise. About a third of the bright stars,
  half the sparkles, none of the faint.
- ⚠️ **The field is an ELEMENT, not a background image, and this is the one to
  know.** It was a `background-image: url("data:image/svg+xml,…")` carrying its
  own `<style>` — the better design, and it does not work: **Chromium renders an
  SVG used as `background-image` statically.** Measured, the same file animates
  as an `<img>` and as inline SVG and does not animate as a background, so every
  star in this product was frozen from the day the field was written — with a
  guard checking the keyframes were compositor-only, a test checking the still
  bake differed, and nothing anywhere checking that anything moved. The field is
  an inline `<svg>` laying one `<pattern>` now, so the browser still lays out two
  elements whatever the field contains, and the beats are ordinary rules in
  `ambienceStylesheet`. That also deletes the two-bake requirement: switching
  motion off used to mean rendering a second picture and is now the rule not
  applying.
- **A beat animates opacity only** — anything else on a layer this size repaints
  the viewport every frame, for ever, and looks identical on the machine it was
  written on. How far it dips is the beat's (`BEAT.dip`), because `1 → .3` is
  right for a star and is the whole page throbbing when the mark is a fifth of
  the screen wide.
- **The vignette is a MASK, not a wash.** A ground that has to be covered to be
  readable is a ground that is too loud, and the cover is a grey film over
  somebody's brand. A scene's own alpha drops where content sits, so the page's
  ground shows through and the world is at full strength at the edges. A guard
  refuses the scrim.

### Two families, and they are different in KIND

`FAMILIES` in `web/src/scene/index.ts` is the whole list, and a family not in it
is a family nothing can reach.

| | **space** — a workspace | **aura** — a person |
|---|---|---|
| what it is | a landscape you look AT | an atmosphere you stand IN |
| the base | linear: deep overhead, light at the horizon | radial: light in the middle, falling away everywhere |
| the marks | ~190 tiny sharp stars per megapixel | ~7 enormous soft blooms |
| the beat | a twinkle — most of the way out, in 3–5s | a breath — a fifth of a stop, over 13–19s |

⚠️ **The cheap second family is the first one with another palette, and it would
prove nothing.** A workspace is somewhere you visit; a person is not. One is a
view and the other is a room, and the two grounds say so before a word is read —
which is also how somebody knows whose screen they are on.

⚠️ **A light is not a hue, and this is where ignoring it shows worst.** `moods`
picks faces from twelve saturated colours, and mixing a yellow straight into a
dark teal ground gives KHAKI. It was built that way first and the top half of the
page was mud — a chroma problem, not a strength one, so no opacity fixes it. What
lights a night aura is the person's colour taken most of the way to WHITE, with
their hue surviving in the falloff. (The same argument as `hot`, arriving a
second time because it is about physics rather than about a file.)

⚠️ **A soft mark needs a gradient, which is why `Family.defs` exists.** A filled
circle at 8% alpha two hundred pixels wide is a visible disc — the eye finds a
hard edge at any opacity. Ids are safe inside a scene because each one is its own
SVG document inside its own data URI.

⚠️ **How deep a beat dips is the beat's, not the renderer's.** `1 → .3` is right
for a star and is the whole page throbbing when the mark is a fifth of the screen
wide. `BEAT` carries `dip` and `render` emits one keyframe per beat.

**`web/test/scene.test.ts` sweeps every family in the registry** — every
referenced mark resolves, every declared slot is filled, both skies exist and
differ, the veil is declared, the seed is stable, and the still bake carries no
motion. It renders rather than reads, because the ids are built from template
literals and a regex over the source passed cheerfully over zero files. It caught
a shared `defs` shipping a gradient only one sky used, on its first run.

**And light mode is a real sky rather than a rule.** For one build a world was a
dark room in both themes, because every attempt at a pale night came out grey and
"space is dark, so commit" looked like a decision. It was three failed attempts
wearing one. `day` is a different set of decisions — light from above rather than
underfoot, the deep surviving only as the blue a sky keeps at its zenith, the
horizon warmed most of the way to white, and haze instead of stars. That is what
a family is for.

## The layout binding — one subject, three consequences

**A page names its SUBJECT and everything else follows.** `Layout` is the
outermost piece a screen sits in, and it is the only thing that may assemble a
scene:

```tsx
<Layout sky="linen" subject={placeFace(slug)} frame={{ title, under, back }}>
```

From that one face:

- **the GROUND** is that subject's own world — `worldFor` reads the two colours
  out of the picture the face was drawn from,
- **the CROWN** becomes a title card wearing the same face rather than a display
  heading with a thumbnail over it,
- **the DENSITY** becomes an arrival's (`rich`) rather than a working screen's.

⚠️ **This is a fix, not a convenience.** The hub derived all three separately
from the same slug — `worldOf(where.slug)`, `placeFace(where.slug)`, and a
ternary on whether the first returned anything. Three expressions that have to
agree, none of which can tell when they do not: edit one and the crown wears one
workspace's planet over another workspace's sky, which is invisible in a
screenshot of either. `scripts/scene.test.mjs` refuses `worldOf`/`worldCss`/
`worldFor` anywhere outside the vocabulary.

⚠️ **And the subject travels by CONTEXT, which is the enforcement.** It was a
`face` on `Frame` — a prop, so any router could set one — and a face set there
gets the title card WITHOUT the sky it is supposed to be standing on: a planet
floating on linen, which looks deliberate. There is no prop to get wrong now.

⚠️ **A subject with no world is not an error.** A person and a product have faces
and no sky; the page keeps its material and the crown keeps the face.

### Type on a scene: `ON_SCENE`

**The one place a scene can lose is words laid directly on it.** A name crossing
the lit limb of a planet has the same value on both sides of every stroke, so no
single ink is legible over all of it.

The obvious fix was tried and removed: a plate behind the words is wider than the
subject, so its edges sit on plain sky as two dark patches either side of the
world. What works is a **halo in the ground's own colour** — invisible as a
shape, a few pixels out from every edge, dimming nothing.

The family declares that colour (`Family.veil`), because `ground` is a list of
gradients and nothing downstream can read a value out of it. `worldCss` turns it
into `--on-scene` at three radii — tight-and-strong for the stroke edges, wide
for the value underneath, one very wide to seat the block — and the hero sets
`textShadow: ON_SCENE` on the wrapper, where it inherits.

⚠️ **It is per SKY, not per scene.** A night's veil is near its deep and a day's
is near paper; the same halo under both would outline the letters on one of them.
⚠️ **And it is opt-in, never a rule on the page.** Text inside a card is already
on a surface — `[data-sky] *` would put a shadow under every word in the product.

## What this is a prototype of

**The next ambience system is this one, generalised** — and the four things
`world` had to solve are the four the generalisation needs.

1. **A ground is a COMPOSITION, not a gradient.** Components, each with weighted
   variants, over named colour slots, assembled by a seed. That is how a style
   yields endless distinct results that are all recognisably one family, and it is
   why every knob stays reviewable: nothing a seed can reach was not drawn by
   somebody.
2. **Motion belongs inside the picture.** A generated layer that carries its own
   `<style>` needs no rule, no keyframe registration and no opt-out plumbing — it
   is correct as a background, as an `<img>`, and in a document that has never
   heard of our stylesheet. This is the single most useful thing the avatar styles
   teach.
3. **Two bakes per seed, always.** Moving and still. The `<style>` inside an SVG
   is unreachable from outside, so switching motion off is a different picture —
   the same rule faces already follow.
4. **A family is a set of styles, not a set of gradients.** `blobs`, `glass`,
   `loops`, `squircles` and `waves` are five composition grammars with animation
   variants already in them; each is a candidate family, and a screen kind picks a
   family the way it picks a shape today.

⚠️ **What is NOT yet done, and should not be claimed.** TWO families exist —
`space` and `aura`, two skies each, on two screens. The twenty-four brand-hued
ambiences above are still hand-written gradient stacks and none of them has been
ported; `silk`/`linen`/`wire` are the obvious next, because they are already one
generator at three settings and would need the engine's one missing primitive (a
DRAWN mark rather than a scattered one). Three of the four things the engine was
designed for are done — the LAYOUT binding, type derived from the scene, and a
family that is not space. What has no code at all is per-instance settings on top
of a shared family (the "every wallet is glass, each wallet is its own glass"
case). It is deliberately unbuilt rather than forgotten: nothing in this product
yet needs two instances of one family to diverge beyond their seed, and a
mechanism with no consumer is the failure this repository has a document about.
