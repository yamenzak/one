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
 * ACCENT instead. It is not translucency and it does not track the gradient
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
     * ⚠️ THE FILL OF A CONTROL, AND IT HAS TO CLEAR THE RAISED TIER TOO. The
     * library's `--default` is the ground of every secondary button — including
     * the pill behind the nav's current destination, which sits ON the island.
     * Left at its shipped value it landed 0.033 from the raised tier this file
     * had just moved, so the one thing telling somebody where they are was
     * invisible in dark. A palette is a set of RELATIONSHIPS; changing one tier
     * without the things that sit on it is how a fix becomes a different bug.
     */
    control: 0.94,
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
 * How much of the accent each surface is made of.
 *
 * ⚠️ LIGHT TAKES MORE THAN DARK, and that is not symmetry lost. A tint on white
 * has nowhere to go but toward the hue, so a small share reads; the same share on
 * a near-black surface is mostly swallowed. These are the numbers at which a card
 * looks made of the screen rather than tinted.
 */
export const TINT = { light: 5, dark: 8 } as const;

/** The page's own ground carries more of it: it is the thing being belonged TO. */
export const GROUND_TINT = { light: 9, dark: 6 } as const;

const grey = (l: number) => `oklch(${l} 0 0)`;

/** A value with a share of the accent mixed into it. */
const tinted = (l: number, pct: number) =>
  `color-mix(in oklab, ${grey(l)} ${100 - pct}%, var(--accent))`;

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
    /* ⚠️ A FIELD IS A SURFACE TOO. Left alone it stays pure white on a tinted
       card, which is the one place the old palette's dustiness would survive. */
    `--field-background: ${tinted(g.surface, t)};`,
    `--default: ${tinted(g.control, t)};`,
    /* ⚠️ NO EDGES. Both are ways of saying "separate", and a design needs one. */
    `--surface-shadow: none;`,
    `--overlay-shadow: none;`,
    `--field-shadow: none;`,
    `--border: transparent;`,
    `--field-border: transparent;`,
  ].join(" ");
}

/**
 * ⚠️ THE SEPARATOR IS NOT A BORDER AND IS NOT BANNED. A rule BETWEEN two rows of
 * one card is structure — it says where one row ends — while a rule AROUND a card
 * says something the card's own colour already says. Keeping the distinction is
 * what stops the ban becoming "no lines anywhere", which is a different design
 * and a worse one.
 */
export const GROUND_CSS = [
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
    only way a workspace's accent reaches the page itself.

    ⚠️ ON `html` AND NOT ON THE PAGE. The ambience is a `::before` at
    `z-index: -1`, which paints BELOW its parent's own background — so giving
    `[data-sky]` a background would hide every gradient behind it.
  */
  `html { background-color: var(--background); }`,
].join("\n");
