# @quad/web

kind: guide

**The browser half of the framework: everything an app draws with, and nothing
an app is about.** Router-free (an app brings its own), product-vocabulary-free
(no clients, no workspaces, no invoices), and never restyled — consistency comes
from using HeroUI as it ships and theming it through tokens.

One public surface: `import { … } from "@quad/web"`. The directories below are
for a person reading the package, not for its callers.

## The five directories, and what decides which one a file is in

| Directory | What is in it | The test |
|---|---|---|
| `tokens/` | colour, type, spacing, motion, the ambience | Does it export VALUES rather than elements? |
| `frame/` | page, shape, crown, shell, overlays | Does it wrap a screen rather than sit inside one? |
| `parts/` | rows, cards, lists, controls, the four outcomes | Could an app of any kind use it without explaining? |
| `rendered/` | surfaces drawn from a kernel declaration | Does it take a *book* and draw the whole thing? |
| `chart/` | the data vocabulary | Does it show a number as a shape? |

**`rendered/` is the one worth understanding.** Nobody wrote the settings
screen, the notification policy, the flag console or the plan shelf — each takes
a declaration from `@quad/kernel` and draws every control in it. That is why a
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

- [`quad/docs/DESIGN.md`](../docs/DESIGN.md) — the design language: the eight
  rules, the eight screen shapes, where the primary action goes, the checks a
  screen has to pass.
- [`quad/docs/AMBIENCE.md`](../docs/AMBIENCE.md) — the world behind the screen:
  the twenty-four grounds, which one a screen kind earns, and the three that
  move.
