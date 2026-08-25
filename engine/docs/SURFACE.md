# The declared surface

kind: plan

**An app stops shipping screens. It declares them, and the engine draws them.**

This is the plan for that, in ten stages. It is written before any of it is built
so the shape can be argued with cheaply, and it names the two things that decide
whether it works — the BINDING design and the GUARD migration — up front rather
than as discoveries.

---

## Why, in one paragraph

Every UI defect fixed in the redesign was one shape: **a capability declared in
one place and drawn in another, where the drawing could disagree.** A selection
tick folded into a row's `aside` and forgotten in the table's columns. `Menu`
rendering `{item.icon}` that no caller ever passed. `--on` declared and resolving
to an empty string. A depth layer appended under an opaque one. None of those
were carelessness; they are what hand-written screens structurally permit. And
the cost compounds the other way too: this redesign took a week because 10,130
lines of screens each had to be visited. Declared, it would have been one change.

## What is already true

**This is not a new mechanism. It is an unfinished one.** `design/src/rendered/`
already draws eleven surfaces from data that no app writes a line of:

| | | |
|---|---|---|
| `settings.tsx` | `money.tsx` | `console.tsx` |
| `legal.tsx` | `vault.tsx` | `policy.tsx` |
| `inbox.tsx` | `guide.tsx` | `ai.tsx` |
| `edit.tsx` | `field.tsx` | |

2,569 lines, consuming declarations from `@engine/kernel` — `SettingBook`,
`AreaBook`, `FieldSpec`. And the chrome is already declared: `AppSpec.hue`,
`ScreenSpec.route/label/icon/nav/chrome`, the sky, the gate.

**So the line today is not "declared vs not". It is: platform surfaces are
declared, product surfaces are hand-written.** The whole bet is whether that is a
principled line or just where the work stopped. This plan says it is the latter,
and stage 2 is designed to find out cheaply if that is wrong.

**The workload is `engine/apps/inventory`: 25 screens, 10,130 lines.**

---

## The two decisions everything else rests on

### 1. How a declaration expresses a BINDING

This is where declarative UI systems die. The failure is always the same: the
declaration needs a conditional, then a derived value, then a loop, and a bad
programming language grows inside JSON.

Read the simplest hand-written screen in OneInventory — `Where.tsx`, 110 lines —
and the split is exact. The SHAPE is entirely declarative already: a `detail`
screen with a title, a back, one action, a loaded source, an empty state, and
three blocks. What is not shape is four things, and they are the whole content:

- `places.filter((p) => p.of === place.id)` — a **query**
- `place.lines === 1 ? "1 line" : "N lines"` — a **formatter**
- `below.length ? <Section> : null` — a **presence test**
- `lines.map(...)` — a **projection**

**None of those needs an expression language, and this plan refuses to build
one.** Each gets a narrow, closed answer:

- **Queries are declared on collections.** `CollectionSpec` already carries
  `fields`, `scope`, `searchable`. A screen names a VIEW; a view is a declared
  filter/sort/limit over a collection. The kernel already validates collections
  and can validate these the same way.
- **Formatters are the closed set of components that already exist** — `Num`,
  `Unit`, `Size`, `Tally`, `When`, `Money`. A binding names one; it cannot
  compose them.
- **A presence test is `{ has: path }` / `{ empty: path }` / `{ not: … }`, and
  nothing else.** No arithmetic, no comparison, no equality.
- **A projection is the block's own business.** A list block takes a view and a
  field map; it does not take a function.

⚠️ **And the escape valve is deliberately not an escape hatch.** A screen that
needs a real predicate — a comparison, a sum, a threshold — declares a DERIVED
FIELD on the collection, in the kernel, where it is typed and testable. The
guard forces it there. That pushes logic into the data layer rather than into a
template language, which is the whole difference between this working and this
becoming a second, worse React.

### 2. What happens to the guards

⚠️ **84 of the 86 gate guards read source text. 69 of them scan JSX and
classNames.** `heroui.test.mjs` reads `className` strings; `blocks.test.mjs`
finds hand-rolled filter rows in JSX; `menu.test.mjs` parses literal arrays;
`cards.test.mjs` looks for `<Card>`. **The day screens become data, that entire
layer has nothing left to read.**

This is not a reason to stop — a schema is far easier to check than JSX, and the
guards get sharper, not weaker. But it is a large piece of work, and if it is
left until after the apps move there is a window where the drift-prevention
machinery points at an empty tree. **That window is exactly when drift returns.**
So it is stage 7, before any app is ported, and it is not optional.

---

## The arc

### S1 — The contract · **stage 89, shipped**
`kernel/src/surface.ts`. `ScreenSpec` grows an `of` and a `body`; `AppSpec` grows
`views`. `ScreenShape`, `Layout`, `Span`, `BlockSpec`, `Binding`, `Read`,
`Format`, `Presence`, `ViewSpec`, `BlockEntry`. Every refusal a manifest can
already raise, raised here too — refused at `defineApp`, on the same path as
every other manifest check. **No renderer. No components. Types and refusals
only.**

What it refuses, and every one of them draws a page today: a block nothing
registers · a block that has not implemented all four states · a slot given a
kind of source it cannot draw · a slot a block does not have · a required slot
left unbound · a field bound on a screen that is about nothing · a field the
subject does not have · a formatter that will say `Invalid Date` · a view over a
collection nobody declares · a view narrowing or sorting on a field that is not
there · a span wider than its grid · a grid wide enough to be a coordinate
system · a body with nothing on it · a view no screen reads.

Three things the contract settled that the plan had left open:

- **`ScreenShape` is the kernel's, not the design package's.** Both had the same
  eight-value union and only one of them was consulted by `SHAPES`, the preset
  table. A screen DECLARES its shape now, so two lists would be a manifest
  composing with a shape the table has never heard of — which does not throw: it
  falls through and draws a settings page as a form.
- **`kernel/src/blocks.ts` is empty and refuses everything, deliberately.** A
  screen may not name what nothing registers, and an index that let unknown names
  through would be worse than no index — the failure would be a blank region in
  production rather than a refusal at composition. Stage 91 generates it.
- **The escape valve is a `Match` with no comparison operator in it.** `is`,
  `isnt`, `set`, `unset`. The test that asserts that list is exhaustive is the
  one protecting the whole design: the day `gt` is added to make one screen
  easier, the manifest has become a query language.

### S2 — The spike, and it comes second on purpose
Express the THREE HARDEST screens against the S1 contract, on paper, with no
renderer: `Register.tsx` (1,089 lines), `Receive.tsx` (465), `Scan.tsx` (374).
Not the easy ones — the ceiling is only where the hard ones are, and finding it
at stage 8 is finding it too late.

⚠️ **No escape hatch during the spike.** The moment one exists the spike stops
teaching anything. If a screen cannot be expressed, the finding is the contract's
and S1 is revised — which at this stage costs a day and after stage 6 costs a
month.

### S3 — The block registry
Every `@engine/design` export that can be a block gets an entry: its name, the
props it takes as a schema, the states it must implement. Generated from the
source, refusing rather than skipping, like `inventory.mjs` and `guards.json`
already do. This is what makes *"if an app needs a complex component we add it to
the engine and then use it"* a two-line operation rather than a negotiation.

### S4 — Blocks reflow by their own size
⚠️ **Container queries, not slot coordinates.** A block that knows it is "in a
2×1" breaks in the first layout that does not use that vocabulary; a block that
responds to its own measured box works in every container forever, including ones
nobody has designed yet. Guarded by measurement: render at two widths, assert the
geometry actually differs in the intended way — `geometryOf` already does this.

### S5 — Every block ships its whole state set
waiting · nothing · trouble · denied. Partly exists — `Loaded`, `Await`,
`Nothing`, `Trouble`, `useGate` — and is currently the CALLER's job to wire,
which is exactly the class of thing a caller forgets. Made total, moved inside
the block, guarded by the registry from S3 refusing a block that lacks one.

### S6 — The layouts
The declared arrangements: the stack, the grid, the split, the board. Container
queries throughout, so a layout is a set of relationships rather than a set of
breakpoints.

### S7 — The guards, re-founded
The 69 source-scanning guards become schema-scanning guards. Each one keeps its
QUESTION and changes what it reads. Where a question no longer applies — a rule
about `className` on a component nobody hand-writes any more — it is deleted with
its reason recorded, not left passing over an empty set.

⚠️ **Before any app is ported.** See decision 2 above.

### S8 — The renderer
The screen renderer joins `design/src/rendered/`: it takes a `ScreenSpec.body`
and the app's declared sources, and draws the screen. This is the generalisation of the eleven
surfaces that already work, not a new idea — and it arrives after the contract
has survived the spike, the blocks exist, and the guards can see it.

### S9 — OneInventory, ported
All 25 screens, 10,130 lines, no escape hatch. Photographed before and after at
both widths and both themes, because the port is only correct if the product is
unchanged.

### S10 — The door closes
`engine/ground` ported, the app-side UI deleted, and a guard that refuses a
`.tsx` under `apps/*/src` at all.

⚠️ **The invariant is "no PRIVATE UI in an app", not "no UI".** A screen that
genuinely needs code is a component in `@engine/design` with its own entry in
the ledger — which is the rule already, one level up. Stated as an absolute it is
a rule that gets quietly broken; stated this way it is one that gets obeyed.

---

## What this is not

- **Not a theme system.** The palette, the ladder, the ambience and the type
  ladder are already declared and already guarded. This is about STRUCTURE.
- **Not a page builder.** Nobody drags anything. A declaration is written by
  whoever builds the app, reviewed in a diff, and refused by the kernel when it
  is wrong.
- **Not a way to avoid design.** It is a way to make one design decision reach
  every app at once, which is the thing this redesign proved is currently
  impossible.
