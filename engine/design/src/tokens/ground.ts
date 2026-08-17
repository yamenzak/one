/**
 * THE GROUND AND THE SURFACES ON IT — no borders, no shadows, and a card that
 * belongs to the screen it is on.
 *
 * ⚠️ A BORDER AND A SHADOW ARE BOTH WAYS OF SAYING "THIS IS A SEPARATE THING",
 * AND A DESIGN NEEDS ONE WAY. Using both, or using either on some surfaces and
 * not others, is where the inconsistency comes from: a hairline here, a soft
 * shadow there, and the eye reads the two as different KINDS of thing when they
 * are the same thing twice. Both are banned. Elevation is a difference of VALUE.
 *
 * ⚠️ WHICH IS ONLY POSSIBLE IF THE VALUES ARE ACTUALLY DIFFERENT, AND IN LIGHT
 * THEY WERE NOT. The library's light theme is `--background: oklch(0.9702)` with
 * `--surface: white` — a three percent gap, held apart entirely by
 * `--surface-shadow`. Its DARK theme sets that shadow to `transparent`, because
 * at nine percent it does not need one. So "ban shadows" and "design the ground"
 * are not two changes; the first is impossible without the second, and doing it
 * without noticing would make every light card disappear.
 *
 * ⚠️ AND A PURE-WHITE CARD ON A TINTED GROUND IS THE "DUSTY" ONE. Translucency is
 * what a good product uses here, and it is genuinely expensive: `backdrop-filter`
 * forces a readback of everything behind the element and a blur, per frame, per
 * layer — acceptable for four fixed chips in a crown, ruinous for a scrolling
 * list of cards on a phone with a weak GPU. So every surface takes a SHARE OF THE
 * BRAND instead. It is not translucency and it does not track the gradient
 * behind it, but it buys the thing translucency is actually for: the card is made
 * of the same colours as the screen it is on, rather than cut out of paper and
 * dropped onto it.
 */

/**
 * ⚠️ EVERY VALUE IS A NUMBER HERE, NOT A COLOUR IN A STYLESHEET, so a guard can
 * check the gaps rather than trust them. The whole argument above is arithmetic;
 * a rule that lives only in a comment is one the next palette change breaks
 * silently, and the failure — cards that vanish — looks like a rendering fault
 * rather than a decision.
 */
export const GROUND = {
  light: {
    /** ⚠️ DOWN FROM 0.9702, so a card can be seen without a shadow under it. */
    background: 0.915,
    surface: 1.0,
    /**
     * ⚠️ A FLOATING SURFACE GOES AWAY FROM THE PAGE, AND WHICH WAY THAT IS
     * DEPENDS ON THE THEME. In dark it is lighter than a card; in light it is
     * DARKER than the page — because the light ladder already ends at white, so
     * "raised" has nowhere above to go. Putting it between the page and a card,
     * which is the tidy-looking answer, is the worst place available: it then
     * matches whichever of the two happens to be behind it, and a nav island
     * that vanishes over half the screens it floats on is exactly the failure
     * dropping shadows is supposed to make impossible.
     */
    raised: 0.865,
    /**
     * ⚠️ THE FILL OF A CONTROL, AND IT HAS TO CLEAR EVERYTHING A CONTROL SITS
     * ON — which is three grounds, not two. The library's `--default` is the
     * fill of every secondary and tertiary button: on a CARD (surface, 1.0), on
     * the ISLAND (raised, 0.865), and — the one this value forgot — directly on
     * the PAGE (background, 0.915), which is where a hero's quick actions live.
     * At 0.94 it cleared the first two and sat 0.025 from the page, so four
     * chips on the light ground read as smudges: WHERE a control sits decided
     * whether it was visible. The window that clears all three by the 0.04
     * floor is [0.955, 0.96]; this is its middle. A palette is a set of
     * RELATIONSHIPS, and this tier has three of them.
     */
    control: 0.9575,
  },
  dark: {
    background: 0.12,
    surface: 0.21,
    raised: 0.28,
    control: 0.36,
  },
} as const;

/**
 * ⚠️ THE FLOOR THE TIERS MUST CLEAR, AND IT IS NOT A ROUND NUMBER FOR A REASON.
 * Four percent of lightness is about where a boundary stops being findable
 * without an edge on it — below that a shadow is doing the work whether anybody
 * admits it or not, which is the state this file exists to leave.
 */
export const MIN_DELTA = 0.04;

/**
 * How much of the BRAND each surface is made of.
 *
 * ⚠️ LIGHT TAKES MORE THAN DARK, and that is not symmetry lost. A tint on white
 * has nowhere to go but toward the hue, so a small share reads; the same share on
 * a near-black surface is mostly swallowed. These are the numbers at which a card
 * looks made of the screen rather than tinted.
 */
export const TINT = { light: 5, dark: 8 } as const;

/** The page's own ground carries more of it: it is the thing being belonged TO. */
export const GROUND_TINT = { light: 9, dark: 6 } as const;

/**
 * ⚠️ A CONTROL IS NEVER GREYER THAN THE GROUND UNDER IT, and in light it was —
 * which is the other half of why the hero's chips looked DIRTY rather than
 * merely faint. The page carries 9% of the brand and the control carried 5%, so
 * a chip on the ground was both nearly the same VALUE and visibly less
 * SATURATED: a grey wash over a coloured field, which the eye reads as grime,
 * not as a surface. Matching the richest ground it can sit on makes a chip
 * "the same material, lighter" — the reading every other tier already has.
 * Dark stays at the surface share: tint on a near-black control is swallowed,
 * and the ground there carries less than the surfaces do, not more.
 */
export const CONTROL_TINT = { light: 9, dark: 8 } as const;

const grey = (l: number) => `oklch(${l} 0 0)`;

/**
 * A value with a share of the BRAND mixed into it.
 *
 * ⚠️ `--brand`, NOT `--accent`, AND THE SPLIT IS THE WHOLE DESIGN. The interface
 * is monochrome — every control, every fill, every focus ring is a value rather
 * than a hue — and a workspace's colour lives in the GROUND those controls sit
 * on. So the surfaces still carry the brand, at the same strengths as before,
 * and the buttons on them no longer do.
 *
 * ⚠️ THESE TWO WERE ONE TOKEN, AND THAT IS WHY THE ACCENT COULD NOT GO MONO.
 * Making it neutral would have taken the sky, the ground tint and the focus ring
 * with it — a mono UI on a grey page, which is not the thing anybody asked for.
 * The token had to be split before the decision could even be tried.
 */
const tinted = (l: number, pct: number) =>
  `color-mix(in oklab, ${grey(l)} ${100 - pct}%, var(--brand))`;

/**
 * ⚠️ THE TOKENS ARE REDEFINED, AND THE COMPONENTS ARE NOT TOUCHED. This is the
 * sanctioned way to change how the library looks (D7) — one place, every
 * component, and a workspace's own accent still reaches all of it because every
 * value below is a mix WITH `--accent` rather than a colour.
 */
function tier(mode: "light" | "dark"): string {
  const g = GROUND[mode];
  const t = TINT[mode];
  return [
    `--background: ${tinted(g.background, GROUND_TINT[mode])};`,
    `--surface: ${tinted(g.surface, t)};`,
    /* ⚠️ The library derives `--surface-secondary`/`-tertiary` as literals rather
       than from `--surface`, so leaving them would give one tinted tier and two
       neutral ones — a card and its own panel in different colour families. */
    `--surface-secondary: ${tinted((g.surface + g.raised) / 2, t)};`,
    `--surface-tertiary: ${tinted(g.raised, t)};`,
    /* An overlay is a surface that floats; it is the raised tier, not a shadow. */
    `--overlay: ${tinted(g.raised, t)};`,
    /*
      ⚠️ A FIELD IS A CONTROL, NOT A SURFACE, AND IT WAS ON THE WRONG TIER. At
      `surface` it is EXACTLY a card's own colour — measured on a real screen,
      `oklab(0.2428)` against `oklab(0.2428)` in dark and `oklab(0.981)` against
      `oklab(0.981)` in light — so an empty text field inside a card was
      invisible in both themes. There are no borders here, so nothing else was
      drawing its edge: the control existed, was focusable, and could not be
      seen until somebody typed into it.

      ⚠️ `control` IS THE TIER, and its own comment is the argument: it was
      chosen to clear ALL THREE grounds a control can sit on — a card, the
      island and the page — by the 0.04 floor. A field is exactly that, so it
      takes exactly that value, and `--default` beside it now means a filled
      control and a field read as the same kind of thing.
    */
    `--field-background: ${tinted(g.control, t)};`,
    `--default: ${tinted(g.control, CONTROL_TINT[mode])};`,
    /* ⚠️ NO EDGES. Both are ways of saying "separate", and a design needs one. */
    `--surface-shadow: none;`,
    `--overlay-shadow: none;`,
    `--field-shadow: none;`,
    `--border: transparent;`,
    `--field-border: transparent;`,
    /*
      ⚠️ THE INTERFACE IS MONOCHROME, AND THIS IS THE LINE THAT MAKES IT SO.
      `--accent` is what HeroUI paints a primary button, a switch, a selected
      row and a pressed control with — so at zero chroma every control in the
      product is a VALUE against the ground rather than a hue on it.

      ⚠️ AND THE POINT IS NOT RESTRAINT, IT IS THAT COLOUR BECOMES INFORMATION.
      While the accent was a hue it was also the button, the link, the nav pill
      and the sequential ramp — present on every screen, meaning nothing, and
      needing a SECOND colour before anything could stand out. Against a mono
      interface the one coloured thing on a screen is, by construction, the
      thing that matters: a warning, a danger, a series in a chart.

      ⚠️ IT IS NEAR-BLACK RATHER THAN BLACK, and near-white rather than white.
      Pure black on a tinted white ground reads as a hole; a step off the end
      keeps the control on the same material as everything around it.
    */
    `--accent: ${grey(mode === "light" ? 0.22 : 0.97)};`,
    `--accent-foreground: ${grey(mode === "light" ? 0.99 : 0.15)};`,
    /*
      ⚠️ FOCUS IS THE ONE THING THAT MUST NOT GO MONO, and HeroUI defines
      `--focus: var(--accent)` — so making the accent neutral would have made
      the focus ring neutral too, on a monochrome interface, which is where it
      is least findable. Somebody navigating by keyboard needs to see where they
      are against a page that is otherwise all values; a fixed hue is the only
      thing that guarantees it, and it is deliberately NOT the brand — a
      workspace must not be able to choose a focus ring nobody can see.
    */
    `--focus: ${FOCUS};`,
    /*
      ⚠️ THE ONE HUE THE DATA IS ALLOWED TO BE WHEN IT IS NOT NAMING ANYTHING.
      A line, an area, a meter fill, an emphasised series: marks that measure
      rather than identify. It used to be `--accent`, which made it grey the
      moment the interface went monochrome — and grey is already de-emphasis on
      a chart, so "more of it" and "not the subject" would have been the same
      language on the same plot.

      ⚠️ LIGHTER IN DARK, WHICH IS SELECTED RATHER THAN DERIVED — the same rule
      the categorical eight follow. One hue at one lightness reads correctly in
      exactly one theme.
    */
    `--data: ${mode === "light" ? "oklch(0.55 0.15 250)" : "oklch(0.66 0.15 250)"};`,
  ].join(" ");
}

/**
 * ⚠️ ONE HUE, THE PLATFORM'S, THE SAME IN EVERY WORKSPACE AND BOTH THEMES. It
 * clears 3:1 against every tier in `GROUND` above — which is the actual
 * requirement for a non-text indicator, and the reason it cannot be a value.
 */
export const FOCUS = "oklch(0.6204 0.195 253.83)";

/**
 * ⚠️ THE SEPARATOR IS NOT A BORDER AND IS NOT BANNED. A rule BETWEEN two rows of
 * one card is structure — it says where one row ends — while a rule AROUND a card
 * says something the card's own colour already says. Keeping the distinction is
 * what stops the ban becoming "no lines anywhere", which is a different design
 * and a worse one.
 */
export const GROUND_CSS = [
  /*
    ⚠️ A DEFAULT BRAND, BECAUSE EVERY TIER IS A MIX WITH ONE. `--brand` is ours
    rather than the library's, so nothing defines it until a workspace does — and
    an undefined variable inside `color-mix` makes the whole declaration invalid,
    which would take every surface in the product with it. This is the colour a
    deployment has before anybody has chosen: present, quiet, and unmistakably a
    hue rather than a grey, so an un-branded install still looks designed.

    ⚠️ IT IS SET AT LOW SPECIFICITY AND FIRST, so a tenant's own `:root` block —
    written later in the same stylesheet — wins without needing `!important`.
  */
  /*
    ⚠️ THE LIBRARY'S OWN ACCENT, VERBATIM, so an un-branded deployment's ambience
    is exactly what it was before the split. A default that is merely NEAR the
    old one makes every screenshot in the repository subtly wrong and gives
    nobody a reason for the difference.
  */
  `:root { --brand: oklch(0.6204 0.195 253.83); }`,
  `:root { ${tier("light")} }`,
  `[data-theme="dark"] { ${tier("dark")} }`,
  /*
    ⚠️ AND SOMETHING HAS TO PAINT IT. Nothing did: `html`, `body`, the mount
    point and the `Page` were all transparent, so the ground was the BROWSER's
    canvas — dark only because `<meta name="color-scheme">` makes the user agent
    paint a dark one, and pure white in light. Every token above was correct and
    reached nothing.

    ⚠️ IT IS WHY THE LIGHT SURFACES LOOKED DUSTY, and the direction is the tell: a
    card at L 0.98 on a UA-white page is DARKER than the page it sits on, so
    cards read as grey panels laid on white rather than as light surfaces raised
    off a ground. Painting it puts them back the right way round — and it is the
    only way a workspace's brand reaches the page itself.

    ⚠️ ON `html` AND NOT ON THE PAGE. The ambience is a `::before` at
    `z-index: -1`, which paints BELOW its parent's own background — so giving
    `[data-sky]` a background would hide every gradient behind it.
  */
  `html { background-color: var(--background); }`,
  /*
    ⚠️ A SHEET IS A NEW PAGE, NOT A FLOATING CHIP, AND `--overlay` CANNOT BE BOTH.
    The library paints a popover, a menu and a drawer from the same token, and
    those two want opposite values. A popover floats OVER content, so it has to
    differ from the card behind it — which in light means going DARKER, because
    the ladder already ends at white (see `raised`). A drawer covers the screen
    and holds cards of its own, so at the raised value it came out as a muddy
    grey slab with white cards laid on it: the ground/card relationship inverted
    for the length of the sheet, which is exactly what it looked like.

    ⚠️ SO THE DRAWER TAKES THE PAGE'S OWN GROUND, and every card inside it reads
    against that ground the same way it does anywhere else. The backdrop dim is
    what says "above"; the ground does not have to say it a second time. This is
    a token rule in the shared stylesheet — the sanctioned way to change how the
    library looks (D7) — rather than a class on a component in a screen.
  */
  `.drawer__dialog { background: var(--background); }`,
  /*
    ⚠️ EVERY HAIRLINE IN THE PRODUCT WAS INVISIBLE IN DARK, AND IT WAS MEASURED
    RATHER THAN NOTICED. The library's separator is a literal —
    `oklch(0.25 0.006 286)` — and our dark card is `oklch(0.243 0 0)`. Seven
    thousandths of lightness apart: a rule that renders, occupies a pixel, and
    separates nothing. Light mode happened to work (0.92 against 0.98), which is
    why it survived every review: the person looking was in light.
    "Sign out" sat directly under two navigation rows in one card with the
    divider between them doing nothing at all.

    ⚠️ SO IT IS A VEIL OF THE FOREGROUND, WHICH IS THE ONLY THING THAT WORKS ON
    EVERY TIER. A fixed colour has to be right against the page, the card, the
    raised tier and a sheet; a tenth of whatever the text is made of is a
    hairline on all four, in both themes, and gets brighter exactly where the
    ground gets darker. It is also the technique the row chip already uses.

    ⚠️ AND IT CARRIED CHROMA — 0.006 at hue 286, a violet tint, in a product
    whose whole interface is a value. Nobody could name it and it was there on
    every list.
  */
  `.separator { background-color: color-mix(in oklab, var(--foreground) 12%, transparent); }`,
  /*
    ⚠️ A FULL-SCREEN DIALOG WITH A 24px INSET IS NOT A FULL-SCREEN DIALOG, AND
    THE PADDING IT KEEPS IS ONE OF THREE. `.modal__dialog` is `p-6` — right for
    a centred dialog, which floats and needs an edge — and the `--full` variant
    overrides its width, height, shadow and radius while leaving that padding
    alone. The library's own `.modal__container--full` sets padding to zero for
    exactly this reason; the dialog inside it was missed.

    ⚠️ THE COST IS MEASURED IN A PHONE'S WIDTH. 24px of dialog, then 16px of the
    band's gutter, then 16px of the card's own — 56px each side before a word, so
    a 390px screen gave 278px to text and 112px to nesting. The hub is presented
    OVER a product whose own screens run at 16 + 16, so the same card came out
    narrower inside the hub than outside it, on the same phone, for no reason
    anybody could see.

    ⚠️ AND IT IS THE `--full` VARIANT ONLY. A `Confirm` is a centred dialog and
    keeps its inset; a drawer keeps its own for the same reason — its content
    sits directly against the sheet with no band under it.
  */
  `.modal__dialog--full { padding: 0; }`,

  /*
    ⚠️ A PROGRESS CIRCLE MEASURES, SO IT DRAWS IN `--data`. The library's arc is
    `--accent`, and this interface's accent is monochrome — so its fill and its
    track were the same value, and a gauge at 62% drew the identical ring to a
    gauge at 0%. `Meter` and `Ring` name the token themselves because they are
    ours; this one is the library's, so the rule belongs here beside the other
    tokens it ships that we turn off (D7 — the fix is a theme rule, never a
    `className` or a `style` on the component).
  */
  `.progress-circle__track-circle { stroke: color-mix(in oklab, var(--foreground) 10%, transparent); }`,
  `.progress-circle__fill-circle { stroke: var(--data); stroke-linecap: round; }`,
].join("\n");
