# Ambience

kind: guide

**How a screen gets a world behind it — which of the twelve to reach for, at
which of the three levels the choice is made, and the rules that keep colour
meaning something.** The implementation is `web/src/ambience.ts`; this is the
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
| Empty/blocked/maintenance interstitials | `plain` or `veil` | a big mood behind "nothing here" reads as sarcasm |
| Everything else | `plain` | **the default.** Ambience everywhere is ambience nowhere |

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
- **New patterns must be aperiodic or single-pitch.** Two repeating layers at
  close pitches beat into a moiré lattice — the grain is `feTurbulence` for
  exactly this reason. Guarded (`grain:`).
- **A new ambience is a vocabulary change**: it needs a name that is a
  material or a light (not a feeling), every angular stop ramped (no seams), a
  light-mode pass at `--sky: 0.55` with fibres off, and a row in this table
  saying which screen kind it serves. If no row wants it, it is a wallpaper,
  not an ambience.

## Motion

The ambience drifts a few percent on hover and never more — it is a world, not
an animation. Both reduced-motion switches stop it, non-negotiably. Nothing in
an ambience may ever pulse, cycle or loop: a background that moves on its own
schedule is a background somebody cannot stop watching.

## What this file does not govern

The mono interface (`ground.ts`, guarded by `mono:`/`kin:`/`tiers:`), the
chart palette (`chart/palette.ts`), and the glass on chrome (`ambience.ts`,
crown and island only). An ambience decision never changes a control.
