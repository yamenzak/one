# OneDesign

kind: guide

**One design for every app.** Everything an app draws with, and nothing an app is
about: router-free (an app brings its own), product-vocabulary-free (no clients,
no workspaces, no invoices), and never restyled — consistency comes from using
HeroUI as it ships and theming it through tokens.

⚠️ **The name is `OneDesign`; the package is `@engine/design`, and the two differ on
purpose.** *One* is the DEPLOYMENT — what a customer types. *OneEngine* is the
FRAMEWORK — what a contributor imports. Every app imports this, including
OneEngine's own reference apps, so it is scoped to the framework rather than to a
deployment; the *name* is the family it was designed for. Scoping it `@one/*`
would bind the design system to one deployment, which is the exact split
[DECISIONS.md](../docs/DECISIONS.md) D2 exists to keep.

**One public surface: `import { … } from "@engine/design"`.** There is no deep
import and a guard says so — the directories below are for a person reading the
package, not for its callers.

## The engines

Six directories, and three of them are engines rather than component folders.
An engine takes a DECLARATION and produces a result nobody hand-assembles.

| | takes | produces | read |
|---|---|---|---|
| **scene** | a family, a seed, a density | a ground, a field of live marks, and the colour type sits on | [AMBIENCE.md](../docs/AMBIENCE.md) |
| **frame** | a shape, a subject, an act | a page: width, crown, skeleton, empty state, arrival, where the one action lands | [DESIGN.md](../docs/DESIGN.md) §4 |
| **rendered** | a kernel declaration | a whole working surface — settings, a policy, a console, a shelf | — |

## The six directories, and what decides which one a file is in

| Directory | What is in it | The test |
|---|---|---|
| `tokens/` | colour, type, spacing, motion, the chrome and hem rules | Does it export VALUES rather than elements? |
| `scene/` | the ambience engine — seven families, three mark primitives | Is it about what a GROUND is made of? |
| `frame/` | page, shape, crown, nav, dock, overlays | Does it wrap a screen rather than sit inside one? |
| `parts/` | rows, cards, lists, controls, the four outcomes | Could an app of any kind use it without explaining? |
| `rendered/` | surfaces drawn from a kernel declaration | Does it take a *book* and draw the whole thing? |
| `chart/` | the data vocabulary | Does it show a number as a shape? |

**`rendered/` is the one worth understanding.** Nobody wrote the settings
screen, the notification policy, the flag console or the plan shelf — each takes
a declaration from `@engine/kernel` and draws every control in it. That is why a
new setting reaches a screen with no screen edited, and it is a different kind
of thing from a `Group` or a `TextInput`, which know nothing and are told
everything.

**The line between `parts/` and `rendered/` is what the component KNOWS.** A
`Listing` is handed rows and columns. A `Settings` is handed a book and works out
the rows, the columns, which controls a permission hides and which an
entitlement locks. Put a file in `parts/` if an app could use it without ever
having heard of a `SettingSpec`.

## What is guarded

`scripts/` holds the checks; each names the decision it protects and fails on a
consequence rather than on a style. The ones about this package:

- **`shape`** — no screen draws its own crown or pins its own action; at most one
  primary per screen; a `settings` screen carries none; no block comment renders
  as page text.
- **`face`** — every face comes from the one resolver; a seed is an identity
  rather than a label; the movement is asked for by name; no face is fetched from
  a third party.
- **`heroui`** — no component is restyled. Layout utilities only, on an
  allow-list rather than a deny-list.
- **`ground`** — no borders, no shadows; the interface is monochrome and only
  data is coloured; the hairline and the full-screen dialog are neutralised.
- **`states`** — four outcomes everywhere, skeletons shaped like what is coming.
- **`motion`** — no screen writes its own curve or duration; every keyframe is
  switched off both ways.
- **`metrics`** — no screen contains a measurement.
- **`tone`** — label length, sentence case, full stops.
- **`surface`** — every declaration reaches a screen; every field kind has a
  control.

## Where the rules live

- [`engine/docs/DESIGN.md`](../docs/DESIGN.md) — the design language: the eight
  rules, the eight screen shapes, where the primary action goes, the checks a
  screen has to pass.
- [`engine/docs/AMBIENCE.md`](../docs/AMBIENCE.md) — the world behind the screen:
  the seven families, the three ways to make a field, the hem, and what a seed
  reaches.

## What an app may not do

The point of naming this is that an app stops having a choice. Guarded today:

- **No deep import.** `@engine/design` has one entry; reaching into `src/` is how a
  package stops being able to move anything.
- **No app draws its own ground** — `Page` and `Band` mount a scene and nothing
  else does (`scene`, `mount:`).
- **No app pins its own chrome** — one crown, one nav, one docked action, and the
  dock is declared rather than wrapped (`shape`, `heroui` `dock:`).
- **No app writes a measurement, a curve, a duration or a colour** (`metrics`,
  `motion`, `ground`).
- **No app restyles a component** (`heroui`).

⚠️ **A guard is what makes a rule real.** Everything above was also written in a
paragraph at some point, and the paragraphs did not hold: the shell's crown
scrolled away for months under a document saying crowns do not, and `loops`
carried a comment about arc strength over code that ignored it. What separates a
rule from a wish is that something fails.
