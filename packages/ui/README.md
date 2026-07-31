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

### Tones: five are ours, the rest are the app's

`Tone` used to be a closed union carrying `nutrition`, `cardio`, `hydration`,
`supplement`, `lab`, `calories`, `protein`, `carbs`, `fat` — the README called
that "the one known leak" and left it. It is closed.

The package now owns exactly the five STATUS tones: `success`, `warning`,
`danger`, `primary`, `neutral`. Every product has those. Anything else is an
ACCENT the app registers, and it is resolved by CONVENTION:

```
tone "foo"  →  text-foo · bg-foo-soft text-foo · var(--foo)
```

`toneText` / `toneSoft` / `toneVar` are Proxy-backed so `toneText[tone]` and
`toneVar.danger` read exactly as they always did — the maps were already a
convention written out by hand, and this just stops writing it out.

**Registering an accent takes two things, both in the app** (Kova's are in
`apps/app/src/registry/tones.ts` and `tokens.accents.css`):

1. define `--foo` and `--foo-soft` for both modes, and map them in the app's own
   `@theme` block;
2. spell the class LITERALS out somewhere the app's Tailwind scan reaches.
   Tailwind cannot follow `text-${tone}` built at runtime, so without the
   literals the utility is never generated — the chip renders grey and nothing
   warns. This is the reason the literals cannot live in this package.

The token VALUES moved with them. `tokens.css` keeps surfaces, brand, radius,
elevation and the four status colours; `DEFAULT_TOKENS` and `THEME_TOKEN_GROUPS`
likewise cover only those, and an app concatenates its own. `deriveTokens` takes
an `accents` spec instead of knowing what a macronutrient is.

Splitting them found a real defect immediately: the light-mode accent values in
`DEFAULT_TOKENS` had drifted from `tokens.css`, which had been darkened so
tone-coloured text clears AA on its own pale tint. The branding editor was
showing a lighter swatch than the app painted, and a studio "restoring the
default" from the displayed value would have set a colour that fails AA. Nothing
had checked, because both copies lived here. Kova's now
(`apps/app/src/tokens.accents.test.ts`).

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
