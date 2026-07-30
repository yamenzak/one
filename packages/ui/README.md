# @4dl/ui

The shared design system for 4DL apps. Kova is the first consumer, not the owner.

The interface language it implements is [UI-LANGUAGE.md](../../UI-LANGUAGE.md) —
hierarchy, tokens, motion, copy, component grammar — which is written
product-agnostically for exactly this reason. [DESIGN.md](../../DESIGN.md) maps
Kova's screens onto it and lives outside this package.

## The boundary

**A name belongs in this package if a second app could plausibly import it.**
That is the whole test. It rules out more than it sounds like it does.

| Belongs here | Belongs in the consuming app |
| --- | --- |
| `Sheet`, `Anchor`, `SettingsIndex`, `StatCard`, `Ring`, `Field` | `MetricChip`, `MacroBar` — they render Kova's registries |
| `Tone` and the tonal token machinery | `METRICS`, `MACRO_KEYS`, `FASTING_ZONES` — the registries themselves |
| `cn`, `toneVar`, `toneText`, `toneSoft` | `personaLabel`, `personaTone` — Kova's four roles |
| Layout, motion, typography, focus | Anything that names a client, a workout, a meal, or a coach |

Kova's half lives in [`apps/app/src/registry/`](../../apps/app/src/registry).
`registry.conformance.test.ts` is what keeps it there.

### No router

This package has **zero router dependency**, deliberately: a design system that
imports one cannot be consumed by an app using another. Navigational components
are therefore *controlled* — `SectionDetail` takes `openKey` / `onOpen` and the
app supplies the glue (`apps/app/src/screens/SectionSplit.tsx` binds it to
`useSearchParams`). Keep new navigational primitives controlled the same way.

### The one known leak: `Tone`

`Tone` in `primitives.tsx` still carries fitness-flavoured members —
`nutrition`, `cardio`, `hydration`, `supplement`, `lab` — alongside the neutral
ones (`success` `warning` `danger` `primary` `neutral`) and the macro set
(`calories` `protein` `carbs` `fat`).

This is left as-is on purpose. The *machinery* is product-agnostic (a tone is a
name bound to a CSS custom property in `tokens.css`); only the member list is
Kova's. Making it generic means a type parameter threaded through every
component that accepts a tone, which is a large churn for no current consumer.
**When the second app lands**, resolve it by making the palette per-product
config — the app declares its tone names and the package accepts them — not by
adding that app's tone names next to Kova's here.

## Conformance

Eight layers: contrast, design-tokens, type-scale, no-data, motion, focus,
primitive-adoption, widget-coding. Each has an escape hatch that requires a
written reason on the line. See UI-LANGUAGE.md §13.

The last one is worth understanding because it is not about tokens. Every tone
it caught was a *legal* tone from this package — the defect was that the colour
was written down twice, and the two copies disagreed. A coach tile counting
"clients gone quiet" was sleep-blue while the roster feed on the same screen
drew the same number danger-red. So the check is not "is this a valid tone" but
"does this colour come from the one registry that owns it".
