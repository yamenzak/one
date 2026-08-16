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

## Start here

Three documents, and they are in this directory on purpose: everything needed to
build a screen is one `ls` away rather than split between a package and a docs
folder above it.

| | | |
|---|---|---|
| **This file** | what exists, where it lives, and what an app may not do | the index |
| [DESIGN.md](DESIGN.md) | the design language — the rules, the screen shapes, where the one action goes, the checks a screen has to pass | read once |
| [AMBIENCE.md](AMBIENCE.md) | the world behind the screen — the families, the three ways to make a field, the hem, what a seed reaches | read when a screen needs a ground |

**Building a screen? Pick the shape (DESIGN.md §4), reach for what already exists
(below), and let the guards say the rest.** None of this needs reading end to
end — a guard fails with the reason and the section, which is the whole point of
writing them down.

## The engines

Six directories, and three of them are engines rather than component folders.
An engine takes a DECLARATION and produces a result nobody hand-assembles.

| | takes | produces | read |
|---|---|---|---|
| **scene** | a family, a seed, a density | a ground, a field of live marks, and the colour type sits on | [AMBIENCE.md](AMBIENCE.md) |
| **frame** | a shape, a subject, an act | a page: width, crown, skeleton, empty state, arrival, where the one action lands | [DESIGN.md](DESIGN.md) §4 |
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

## What it ships

⚠️ **DERIVED, NEVER TYPED.** A hand-written list of a package's exports is wrong
within a week, and a list that is mostly right is one somebody trusts about the
part that is not. Refresh with `node engine/scripts/docs.test.mjs --write`.

<!-- generated: node scripts/inventory.mjs vocabulary -->
| Home | What it is for | Ships |
|---|---|---|
| `tokens/` | colour, type, spacing, motion, the chrome and hem rules | 56 |
| `scene/` | the ambience engine — families, marks, the world behind a screen | internal |
| `frame/` | page, shape, crown, nav, dock, overlays — what wraps a screen | 46 |
| `parts/` | rows, cards, lists, controls, the four outcomes | 109 |
| `rendered/` | whole surfaces drawn from a kernel declaration | 44 |
| `chart/` | the data vocabulary — a number as a shape | 39 |

**294 exports.** Every one is reachable as `import { … } from "@engine/design"`;
there is no deep import, and a guard says so.

### `tokens/`

- `tokens/ambience.ts` — `ambienceStylesheet`, `FADE`, `MATTE`, `ON_SCENE`, `REACH`, `skyWorld`, `World`, `worldCss`
- `tokens/appearance.ts` — `Appearance`, `APPEARANCE_KEY`, `APPEARANCE_SCRIPT`, `APPEARANCES`, `applyAppearance`, `preferred`, `remember`, `resolve`, `stored`
- `tokens/ground.ts` — `CONTROL_TINT`, `FOCUS`, `GROUND`, `GROUND_CSS`, `GROUND_TINT`, `MIN_DELTA`, `TINT`
- `tokens/motion.ts` — `ARRIVE`, `ARRIVE_MARK`, `ARRIVE_MOTION`, `ARRIVE_RISE`, `arriveAt`, `BEAT`, `DOOR_MOTION`, `doorAt`, `Duration`, `DURATION`, `Ease`, `EASE`, `Intent`, `MOTION`, `REDUCED`, `transition`, `turns`, `useStill`
- `tokens/theme.ts` — `brandCss`, `brandCssFor`, `colorFor`, `readable`, `SKY_MOTION`
- `tokens/type.ts` — `FACE_CSS`, `FACE_STACK`, `MARK_STACK`, `MONO_STACK`, `Role`, `ROLES`, `sentence`, `text`, `TYPE`

### `frame/`

- `frame/arrival.tsx` — `Arrival`, `AsideRoute`, `Mark`, `MarkSize`
- `frame/chrome.tsx` — `Docked`, `Island`
- `frame/crown.tsx` — `Crown`, `CrownClaim`, `crownFor`, `CrownProps`, `CrownSocketProvider`, `LeaveChip`, `PageCrown`, `Slot`, `useCrownSocket`
- `frame/overlay.tsx` — `Confirm`, `Dialog`, `Menu`, `MenuItem`, `notice`, `NoticeHost`, `Over`, `Peek`, `Tray`
- `frame/page.tsx` — `Band`, `BandProps`, `Bleed`, `Page`, `PageProps`, `useNight`
- `frame/screen.tsx` — `Act`, `Board`, `Frame`, `Framed`, `Layout`, `LayoutProps`, `Screen`, `ScreenProps`, `Shape`, `Tile`, `Whichever`
- `frame/shell.tsx` — `CrownInfo`, `glyphOf`, `reachable`, `Shell`, `ShellProps`

### `parts/`

- `parts/arrange.tsx` — `Center`, `Cluster`, `Columns`, `Grid`, `Rail`, `Row`, `Spacer`, `Stack`
- `parts/beside.tsx` — `Hint`, `Pip`
- `parts/blocks.tsx` — `Crumbs`, `Faq`, `Gauge`, `Hotkey`, `Moment`, `PageTabs`, `Reveal`, `Step`, `Steps`, `TabSpec`, `Timeline`
- `parts/face.tsx` — `appFace`, `Face`, `FaceKind`, `FaceOf`, `FaceProps`, `FaceSize`, `ONE_FACE`, `Orb`, `placeFace`, `whoFace`, `worldFor`
- `parts/forms.tsx` — `Agree`, `Choice`, `CodeEntry`, `DateInput`, `Dates`, `Dial`, `LongText`, `Lookup`, `MoneyInput`, `NumberInput`, `NumberInputProps`, `OneOf`, `Option`, `PeriodId`, `PeriodInput`, `PERIODS`, `Picks`, `Said`, `SearchInput`, `SecretInput`, `Segmented`, `spanOf`, `Tags`, `TextInput`, `TextInputProps`, `TimeInput`
- `parts/heads.tsx` — `Balance`, `distinguishing`, `Figure`, `Prose`, `Section`, `SectionTitle`, `Title`
- `parts/listing.tsx` — `Col`, `Listing`, `ListingProps`, `Paged`
- `parts/state.tsx` — `Await`, `AwaitProps`, `ChartWaiting`, `FigureWaiting`, `FormWaiting`, `Loaded`, `Nothing`, `nothingIn`, `ready`, `RowsWaiting`, `TableWaiting`, `TextWaiting`, `TilesWaiting`, `trouble`, `Trouble`, `waiting`, `Working`
- `parts/surfaces.tsx` — `ActionRow`, `AmountRow`, `ControlRow`, `CopyRow`, `FieldRow`, `Group`, `GroupProps`, `Identity`, `Money`, `NavRow`, `NavRowProps`, `NoteRow`, `OfferRow`, `PersonRow`, `Place`, `QuickActions`, `SeeAll`, `Sheet`, `StepRow`, `TileGrid`, `ToggleRow`
- `parts/tally.tsx` — `Tally`, `TallyProps`

### `rendered/`

- `rendered/ai.tsx` — `AiLanes`, `LanesProps`
- `rendered/console.tsx` — `FlagConsole`, `FlagConsoleProps`, `money`, `saying`, `Shelf`, `ShelfProps`
- `rendered/field.tsx` — `Field`, `FieldProps`
- `rendered/guide.tsx` — `Guide`, `GuideProps`, `Help`, `HelpProps`, `Milestones`, `MilestonesProps`
- `rendered/inbox.tsx` — `Bell`, `BellProps`, `Inbox`, `InboxProps`, `Note`
- `rendered/legal.tsx` — `Documents`, `DocumentsProps`, `Ropa`, `SubProcessors`
- `rendered/money.tsx` — `Bill`, `BillProps`, `Jobs`, `JobsProps`, `Wallet`, `WalletProps`
- `rendered/policy.tsx` — `NotificationPolicy`, `Offered`, `PolicyProps`, `policyShown`
- `rendered/settings.tsx` — `Settings`, `SettingsProps`, `settingsShown`
- `rendered/vault.tsx` — `ConsentProps`, `ConsentSheet`, `Look`, `MineProps`, `MyData`, `WhoLooked`

### `chart/`

- `chart/charts.tsx` — `AreaChart`, `BarChart`, `CHART_MOTION`, `ChartTable`, `ColumnChart`, `Datum`, `DivergingChart`, `DumbbellChart`, `HeatmapChart`, `LineChart`, `SCATTER_MAX`, `ScatterChart`, `Series`, `Sparkline`, `StackedChart`
- `chart/circles.tsx` — `CompositionBar`, `DonutChart`, `Ring`, `Rings`
- `chart/figures.tsx` — `ChartPanel`, `Delta`, `Hero`, `Meter`, `Stat`, `StatRow`
- `chart/palette.ts` — `assign`, `AXIS`, `DATA`, `emphasis`, `GRID`, `magnitude`, `polarity`, `pole`, `QUIET`, `SEPARATOR`, `seriesColour`, `SLOTS`
- `chart/scale.ts` — `Point`, `Span`
<!-- /generated -->

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
- **`metrics`** — no component picks its own padding or gap; a pressable row
  clears the touch floor and actually drops the button's own metrics to do it;
  the page reserves room for its nav.
- **`tone`** — label length, sentence case, full stops.
- **`surface`** — every declaration reaches a screen; every field kind has a
  control.

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
- **No app assembles a control this package ships** — a `TextField`, a
  `ComboBox`, a `Select` or an `InputOTP` put together by hand places the four
  sentences itself, and drifts (`heroui` `composed:`).
- **No app keeps a drawer of shared furniture** — no `ui.tsx`, no `components/`.
  That is where a second app's components accumulate one at a time
  (`heroui` `furniture:`).

⚠️ **A guard is what makes a rule real.** Everything above was also written in a
paragraph at some point, and the paragraphs did not hold: the shell's crown
scrolled away for months under a document saying crowns do not, and `loops`
carried a comment about arc strength over code that ignored it. What separates a
rule from a wish is that something fails.
