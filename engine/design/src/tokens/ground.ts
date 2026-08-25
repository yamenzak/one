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
    /**
     * ⚠️ THE ONE A PERSON HAS CHOSEN, AND IT HAS TO GO THE OTHER WAY IN EACH
     * THEME. A segmented control is a track with one segment lifted out of it —
     * so in dark the chosen one is LIGHTER than the track and in light it is the
     * only thing that can still go lighter, which is white. Both readings are
     * the same reading: the chosen segment is nearer the viewer.
     *
     * ⚠️ AND IT IS NOT `--accent`. That is the primary button's near-white, and
     * a segmented control painted with it is four primary buttons with three of
     * them switched off. This is a MATERIAL step, not a call to action.
     *
     * ⚠️ IT IS NOT PURE WHITE EITHER, AND THE BRAND IS THE REASON. This carries a
     * real share of the workspace's colour (`CHOSEN_TINT`), and a mix into white
     * has nowhere to go: the result is white with a suggestion in it. A step down
     * leaves the hue somewhere to be.
     *
     * ⚠️ AND IT IS AN ANCHOR RATHER THAN THE FILL'S VALUE now that the share is
     * most of the mix — the lightness that survives is mostly the brand's own.
     */
    chosen: 0.88,
  },
  /**
   * ⚠️ THE DARK LADDER IS PITCHED FOR AN OLED PANEL, WHICH IS A DIFFERENT GROUND
   * FROM A DARK LCD. A backlit panel cannot reach black, so its "dark" theme is
   * built around a lifted floor and every tier has to clear it — which is where
   * `0.12 / 0.21 / 0.28 / 0.36` came from, and on a phone that switches pixels
   * off it reads as four shades of grey card laid on a grey page. An emissive
   * panel gives the floor away for free: the page can go nearly to nothing, and
   * the whole ladder moves down with it while keeping the SAME steps.
   *
   * ⚠️ IT IS THE STEPS THAT ARE THE PALETTE, NOT THE VALUES. Every tier moved by
   * about the same amount, so a card is still raised off the page by more than
   * the floor and a control still clears all three grounds it can sit on. What
   * changed is where the bottom is.
   */
  dark: {
    /* ⚠️ NOT ZERO, AND `CURTAIN.edge` HAS THE ARGUMENT: an OLED switches a pure
       black pixel off, and the boundary between an off pixel and a lit one reads
       as a hole rather than as depth. This is as low as the ground goes. */
    background: 0.055,
    surface: 0.135,
    raised: 0.195,
    control: 0.255,
    /*
     * ⚠️ THIS IS NO LONGER A GREY THE BRAND IS TINTED INTO — see `CHOSEN_TINT`.
     * The number is the ANCHOR the mix pulls toward, and it is high because the
     * thing it is anchoring is nearly all brand: its job is to keep a dark
     * workspace colour from landing under its own near-black ink, not to set the
     * value of the fill.
     */
    chosen: 0.72,
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
 * THE DOCK — the one plate in the product, and it is deliberately not on the
 * ladder above.
 *
 * ⚠️ THE LADDER ANSWERS "WHICH SURFACE IS ABOVE WHICH", AND THE DOCK IS NOT IN
 * THAT STACK. Every tier in `GROUND` is a step in one elevation: a card over a
 * page, a control over a card, an overlay over both. The dock is over ALL of it,
 * always, on every screen, and it is the only object in the product that never
 * goes away. Giving it a rung would mean choosing which content it is one step
 * above, and the answer is all of it.
 *
 * ⚠️ SO IT IS THE SAME OBJECT IN BOTH THEMES, WHICH IS THE PROPERTY WORTH
 * HAVING. It is dark on a light page and dark on a dark one — a step LIGHTER
 * than a near-black ground so it separates, a long way DARKER than a cream one
 * so it reads as hardware laid on the page rather than as another card. Both
 * readings are the same reading, and because the plate is dark either way its
 * ink is near-white either way: one dock, not two that happen to share a shape.
 *
 * ⚠️ THE PLATE IS WHY THE DESTINATIONS CAN BE CIRCLES AT ALL. Without it a nav
 * item is a glyph on the page's own ground and a ring around it is an edge (D7);
 * on a plate the circle is a hole in a surface, which is a different thing and
 * the one the reference material is made of.
 *
 * ⚠️ AND THE HEM IS STILL THE ANSWER TO CONTENT ARRIVING AT ITS ENDS. The
 * earlier plate was removed because the page's next row was sliced by the
 * capsule's rounded ends — a face cut in half, a heading reappearing in the gaps
 * either side. The hem on the `nav` around it is full width and dissolves that
 * content before it reaches either the plate or the gaps, so what killed the
 * plate is fixed rather than reintroduced.
 */
export const DOCK = {
  /** Near the ink, so it is the highest-contrast object on a cream page. */
  light: 0.215,
  /** One step off the floor — the same distance a raised surface goes. */
  dark: 0.195,
  /** Its own ink, and it is the same in both themes because the plate is. */
  ink: 0.97,
} as const;

/**
 * How much of the BRAND each surface is made of.
 *
 * ⚠️ LIGHT TAKES MORE THAN DARK, and that is not symmetry lost. A tint on white
 * has nowhere to go but toward the hue, so a small share reads; the same share on
 * a near-black surface is mostly swallowed. These are the numbers at which a card
 * looks made of the screen rather than tinted.
 */
/**
 * ⚠️ AND DARK TAKES LESS THAN IT USED TO, WHICH IS THE OTHER HALF OF THE OLED
 * PITCH. The share was tuned against a floor of 0.12, where a tint has a lifted
 * grey to sit in and reads as warmth. Against 0.055 the same share is the
 * brightest thing in the surface, so every card, field and control came out
 * visibly BROWN on an amber workspace — a page of tinted slabs rather than a
 * dark interface with a coloured light on it. Lower ground, smaller share.
 */
export const TINT = { light: 5, dark: 5 } as const;

/** The page's own ground carries more of it: it is the thing being belonged TO. */
export const GROUND_TINT = { light: 9, dark: 4 } as const;

/**
 * THE CURTAIN — the ground of the opening, and the one surface in the product
 * that is the same on every device.
 *
 * ⚠️ IT DOES NOT FOLLOW THE THEME, AND THAT IS THE DECISION RATHER THAN AN
 * OVERSIGHT. Every other surface here belongs to a ladder that answers to light
 * or dark because somebody is going to WORK on it for an hour. The opening is
 * not worked on: it is a held moment before the product exists, closer to the
 * black a film leads with than to a page — and a curtain that is white on one
 * phone and black on the next is not one moment, it is two.
 *
 * ⚠️ AND IT IS A GRADIENT RATHER THAN A FLAT FILL, WHICH IS THE WHOLE OF WHY IT
 * READS AS DEPTH. Flat black is a screen that is off; a ground that is faintly
 * lighter where the name sits puts the name IN something. The lift is small on
 * purpose — nine hundredths of lightness across the whole viewport is under the
 * banding threshold of an 8-bit panel at this size, and twice that is a visible
 * halo.
 *
 * ⚠️ ON THE LADDER, LIKE EVERY OTHER VALUE HERE. A full-bleed gradient is the
 * first place a hue nobody chose shows up, and it is the first thing anybody
 * sees of the product.
 */
export const CURTAIN = {
  /** Behind the name. */
  centre: 0.115,
  /** The corners. Not pure black: an OLED panel switches those pixels off, and
      the edge of the gradient then reads as a hole rather than as a shadow. */
  edge: 0.025,
  /** The name itself, and the one thing on the curtain at full strength. */
  ink: 0.97,
  /** The line under it — present, and clearly the second thing. */
  said: 0.62,
} as const;

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
export const CONTROL_TINT = { light: 9, dark: 5 } as const;

/**
 * ⚠️ THE ONE PLACE A CONTROL IS ALLOWED TO CARRY THE BRAND, AND THE MONO RULE IS
 * WHY RATHER THAN WHY NOT. That rule says the interface is values so that COLOUR
 * BECOMES INFORMATION — the one coloured thing on a screen is, by construction,
 * the thing that matters. "This is the one you chose" is exactly that: it is the
 * only fact a segmented control carries, and drawing it as a slightly different
 * grey spends the interface's whole colour budget on nothing and then reports the
 * choice in the channel with the least signal left.
 *
 * ⚠️ AND IT IS A SHARE OF THE WORKSPACE'S OWN BRAND, not a colour chosen here. On
 * an amber deployment the chosen segment is amber; on a green one it is green.
 * The alternative — a fixed hue for "selected" — is a second brand every
 * workspace has to live beside, which is the thing `--brand` exists to prevent.
 *
 * ⚠️ THE SHARE IS LARGER IN DARK BECAUSE A TINT ON A LIFTED GREY IS SWALLOWED.
 * At the control tier's 8% the chosen segment came out a warm grey somebody read
 * as brown — present enough to muddy the mono palette, not present enough to say
 * anything. Read as a colour or do not carry one.
 *
 * ⚠️ AND "READ AS A COLOUR" MEANS MOSTLY BRAND, WHICH 26/38 WAS NOT. A quarter
 * of a hue mixed into a grey is a grey with a cast; beside a control tier that a
 * lit sky was ALSO washing with the same brand, the chosen segment came out the
 * LESS coloured of the two — a segmented control whose selected option looked
 * like the one nobody had picked. That is the same defect as the recessed fill
 * this token was introduced to fix, arrived at from the other direction.
 *
 * ⚠️ SO THE GREY IS NOW THE MINORITY, AND ITS ONLY JOB IS A FLOOR. What is left
 * of it holds a very dark workspace colour up far enough for near-black ink
 * (`CHOSEN_INK`) to stay readable on it. The fill's hue, chroma and most of its
 * value are the brand's.
 */
export const CHOSEN_TINT = { light: 78, dark: 88 } as const;

/**
 * THE NEUTRAL IS WARM, AND IT IS THE ONE EDIT THAT CHANGES EVERY SURFACE.
 *
 * ⚠️ ZERO CHROMA IS NOT NEUTRAL, IT IS A CHOICE — and the choice reads as
 * clinical. `oklch(l 0 0)` is the grey of a spreadsheet and of every fintech
 * built in the last five years; three people looking at this product named the
 * same competitor without being asked, and this function is most of why. A
 * ground with a hue in it is a ground somebody made.
 *
 * ⚠️ IT IS ONE HUE FOR THE WHOLE LADDER, WHICH IS WHAT KEEPS IT MONO. Mono was
 * never "colourless": it is that the interface carries ONE colour family so the
 * one thing outside that family is information. A warm ladder holds that rule
 * exactly as a grey one did, and gives the accent something to be warm AGAINST.
 *
 * ⚠️ AND IT IS SMALL ON PURPOSE. Nobody shown a surface at 0.010 would call it
 * brown; everybody shown one at 0.000 beside it can tell which of the two is
 * made of something. Doubling it is a sepia product, halving it is the grey this
 * replaces with extra arithmetic, and `ground.test.mjs`'s `warm:` holds both
 * ends so the drift has to be deliberate.
 */
const WARMTH = { hue: 66, chroma: 0.01 } as const;

/**
 * ⚠️ THE CHROMA FADES OUT AT THE TOP OF THE LADDER AND NOWHERE ELSE. A card in
 * the light theme is L=1 — pure white — and a hue at that lightness is not a
 * warm white, it is out of gamut and clips to whatever the panel decides. The
 * PAGE behind it carries the warmth, the card stays paper, and the difference
 * between them is what makes a card read as laid ON something.
 *
 * ⚠️ THE DARK END KEEPS ALL OF IT, which is the half people notice. A warm
 * near-black is the whole character of the dark theme here; tapered at both ends
 * for symmetry it would come out at a third of the intended cast exactly where
 * the reference material is warmest.
 */
const warmth = (l: number): number =>
  (l >= 0.97 ? Math.max(0, (1 - l) / 0.03) * WARMTH.chroma : WARMTH.chroma);

/**
 * ONE LIGHTNESS ON THE WARM LADDER, AND IT IS EXPORTED BECAUSE A SECOND COPY OF
 * IT IS HOW HALF THE PRODUCT STAYED GREY.
 *
 * ⚠️ `opening.tsx` HAD ITS OWN, AND IT WAS THE FIRST THING ANYBODY SEES. The
 * curtain declared `oklch(l 0 0)` locally with a comment arguing for zero chroma
 * — correct while the whole ladder was colourless, and exactly backwards after
 * it stopped being: a neutral curtain handing over to a warm app is the hue
 * arriving late, on the one screen whose entire job is the first impression.
 *
 * ⚠️ SO THERE IS ONE FUNCTION AND NOTHING ELSE MAY WRITE A NEUTRAL. That is what
 * `warm:` refuses — including the interpolated spelling, which is what let this
 * one live: a guard matching `oklch(0.115 0 0)` sees nothing wrong with
 * `oklch(${l} 0 0)`, and the second is the form a helper is written in.
 */
export const grey = (l: number) => `oklch(${l} ${warmth(l).toFixed(4)} ${WARMTH.hue})`;

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
/**
 * ⚠️ THE ONE TIER THAT IS STATED TWICE, AND THE SECOND PLACE IS THE ONE THAT
 * WORKS. See the `[data-sky]` rules in `GROUND_CSS` for why a tier declared on
 * `:root` can never carry a product's hue. It is still emitted in `tier()` so a
 * surface outside a `Page` — a test specimen, a fragment rendered on its own —
 * has a value rather than nothing.
 */
const chosen = (mode: "light" | "dark"): string => [
  `--tier-chosen: ${tinted(GROUND[mode].chosen, CHOSEN_TINT[mode])};`,
  /*
    ⚠️ `--on` IS THE SEMANTIC NAME, AND IT IS WORTH HAVING ONE. `--accent-soft`
    is the library's word for the fill of a selected toggle and nothing else;
    what a switch, a ticked box, a chosen radio, an open tab and a slider's
    travelled part all share is that they are ON. Named once, every rule in
    `ON_STATE` reads as the same statement rather than as eight overrides.
  */
  `--on: var(--tier-chosen);`,
  /* ⚠️ THE INK ON IT, AS A TOKEN RATHER THAN A LITERAL REPEATED PER SELECTOR —
     `ON_STATE` sets it on seven things now, and seven copies of a colour is
     six chances to change one of them. */
  `--on-ink: ${grey(0.18)};`,
  /*
    ⚠️ AND A FIELD SOMEBODY IS TYPING IN IS LIT, NOT FILLED. The library's
    `--input-bg-focus` is `var(--default)` — the SAME value as the resting
    field, so a focused field changed by nothing but its ring, which is what
    "the input is still grey when selected" is. A full `--on` fill would be a
    text field the colour of a button; a fifth of it over the field tier reads
    as warm without touching legibility.
  */
  `--on-lit: color-mix(in oklab, var(--tier-chosen) 18%, var(--tier-field));`,
  `--accent-soft: var(--on);`,
  `--accent-soft-hover: var(--on);`,
].join(" ");

function tier(mode: "light" | "dark"): string {
  const g = GROUND[mode];
  const t = TINT[mode];
  return [
    /*
      ⚠️ EACH TIER IS NAMED ONCE AND THEN ALIASED, AND THE ALIAS IS WHAT MAKES A
      WASH POSSIBLE AT ALL. A scene tints the surfaces standing in it by
      redefining the library's tokens further down the tree — and a custom
      property cannot be defined in terms of itself at any depth, so
      `--surface-secondary: color-mix(…, var(--surface-secondary))` is a cycle
      and computes to nothing. `--tier-*` is the UNWASHED value, stated here and
      never overridden, so the ambience has something to mix FROM.

      ⚠️ AND THE ALIASES ARE THE ONLY PLACE A TIER'S VALUE IS WRITTEN. Restating
      a literal in the wash block would be two answers to what a card is made of,
      and they would agree until somebody edited one.
    */
    `--tier-page: ${tinted(g.background, GROUND_TINT[mode])};`,
    `--tier-base: ${tinted(g.surface, t)};`,
    `--tier-card: ${tinted((g.surface + g.raised) / 2, t)};`,
    `--tier-raised: ${tinted(g.raised, t)};`,
    `--tier-field: ${tinted(g.control, t)};`,
    `--tier-control: ${tinted(g.control, CONTROL_TINT[mode])};`,
    /* ⚠️ A REAL SHARE OF THE BRAND — see `CHOSEN_TINT`. This is the one control
       fill in the product that is a colour rather than a value, and the mono rule
       is the argument for it rather than against it. */
    `--tier-chosen: ${tinted(g.chosen, CHOSEN_TINT[mode])};`,
    /*
      ⚠️ THE DOCK CARRIES THE BRAND LIKE EVERY OTHER SURFACE, at the ground's own
      share rather than a card's. It is the surface nearest the page in the
      reading the design has of it — a plate laid ON the world rather than a
      thing cut out of paper — so it is made of the same mix the world is.

      ⚠️ AND ITS INK IS STATED HERE RATHER THAN INHERITED. `--foreground` is the
      ink for the page's own ground, which in light is near-black; on a plate at
      0.215 that is invisible. Nothing about the plate's darkness is knowable
      from inside a component, so the pair travels together.
    */
    `--tier-dock: ${tinted(DOCK[mode], GROUND_TINT[mode])};`,
    `--dock-ink: ${grey(DOCK.ink)};`,

    `--background: var(--tier-page);`,
    `--surface: var(--tier-base);`,
    /* ⚠️ The library derives `--surface-secondary`/`-tertiary` as literals rather
       than from `--surface`, so leaving them would give one tinted tier and two
       neutral ones — a card and its own panel in different colour families. */
    `--surface-secondary: var(--tier-card);`,
    `--surface-tertiary: var(--tier-raised);`,
    /* An overlay is a surface that floats; it is the raised tier, not a shadow. */
    `--overlay: var(--tier-raised);`,
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
    `--field-background: var(--tier-field);`,
    /*
      ⚠️ `--default` IS THE ONE TOKEN EVERY CONTROL IN THE LIBRARY IS MADE OF,
      which is worth knowing before touching it. Measured across the built
      stylesheet: `--switch-control-bg`, `--input-bg`, `--chip-bg`,
      `--toggle-button-bg`, `--select-trigger-bg`, `--radio-control-bg`,
      `--checkbox-control-bg`, `--badge-bg`, `--textarea-bg`,
      `--input-otp-slot-bg`, `--autocomplete-trigger-bg`, the progress track and
      `.button--tertiary` all resolve to it and to nothing else. So a change here
      is a change to every control at once — and so is a wash over it.
    */
    `--default: var(--tier-control);`,
    /*
      ⚠️ THE SELECTED HALF OF EVERY CONTROL, AND NOTHING HERE BOUND IT UNTIL NOW.
      `--default` above is what the library paints an UNSELECTED control with —
      and a SELECTED toggle, a chosen segment and a soft chip are painted with
      `--accent-soft`, which is a different token that was never ours. So the
      track was our tier and the chosen segment was HeroUI's own palette: in
      dark that is a dark tint, which put the segment somebody had chosen BELOW
      the three they had not. Reported as the selected option looking disabled,
      and it was — the interface was drawing "recessed" for "chosen".

      ⚠️ IT IS A TIER RATHER THAN A TINT OF THE ACCENT, because the accent is
      mono here (see below) and a mix of it with the track is a value with no
      relationship to either. `chosen` sits in the same ladder as every other
      surface and clears `control` by a real step in both themes.

      ⚠️ AND THE FOREGROUND IS BOUND WITH IT. A fill changed without its ink is
      how a control comes to be the right colour and unreadable — the light
      theme's chosen tier is white, where the library's own soft foreground is
      a pale tint of its accent.
    */
    `--accent-soft: var(--tier-chosen);`,
    `--accent-soft-hover: var(--tier-chosen);`,
    /*
      ⚠️ AND THE INK FOR IT IS NOT SET HERE, WHICH IS THE PART THAT BIT. The
      obvious move is `--accent-soft-foreground`, and that token is OVERLOADED in
      the library: it is the ink on an `--accent-soft` fill AND the ink on a
      `.button--secondary`, which is filled with `--default`. Bound once for the
      new light fill it turned every secondary button in dark into near-black on
      the control tier — measured at 1.86:1 by the browser reading, which is the
      one channel that could have caught it. The three fills that actually use
      `--accent-soft` take their ink in `CHOSEN_INK`, by selector, because the
      library sets these inside its own component rules and a `:root` variable
      loses to that.
    */
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
      THE ONE HUE THE DATA IS ALLOWED TO BE WHEN IT IS NOT NAMING ANYTHING —
      a line, an area, a meter fill, an emphasised series: marks that MEASURE
      rather than identify.

      ⚠️ IT IS THE WORKSPACE'S, AND THAT IS THE ORIGINAL INTENT RATHER THAN A NEW
      ONE. `palette.ts` has always said magnitude carries the brand while
      identity does not; this was `--accent` for exactly that reason, and it was
      cut loose to a fixed hue when the accent went monochrome, because a grey
      magnitude ramp and a grey de-emphasis are the same language on one plot.
      `--brand` is where the accent's colour went, so this is where the data
      belongs. The categorical eight are untouched: they are validated for CVD
      separation, they only appear once there are two series to tell apart, and a
      workspace recolouring THOSE would be a workspace whose charts a colourblind
      reader cannot use.

      ⚠️ AND IT IS PULLED TOWARD THE FAR END OF THE GROUND, WHICH IS WHAT THE
      SELECTED PAIR WAS DOING. A brand is somebody else's choice: pale yellow on
      a near-white page and deep navy on a near-black one are both a chart line
      nobody can see, and neither is a state the workspace can be expected to
      notice. Mixing a fixed share of the opposite end guarantees the DIRECTION of
      the contrast without hand-picking a value per theme — which is the half a
      selected pair could not do once the hue stopped being ours.
    */
    `--data: color-mix(in oklab, var(--brand) 72%, ${mode === "light" ? "black" : "white"});`,
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
    ⚠️ THE DEPLOYMENT'S OWN, AND IT IS NOT THE LIBRARY'S BLUE ANY MORE. That blue
    was inherited rather than chosen — it was HeroUI's default accent, kept
    verbatim so the split that made the interface mono changed nothing visible.
    It is also the single most common colour in software, and a warm ladder with
    a cold hue on it is two products arguing.

    ⚠️ THE LIGHTNESS IS THE BLUE'S, TO THE FOURTH DECIMAL, AND THAT IS THE POINT.
    Every floor in this file was measured against `L=0.6204` — the ink on a
    chosen segment, the fill of a lit field, the tint on six tiers. Changing the
    HUE at the same lightness leaves all of it standing; picking a nicer orange a
    tenth brighter would silently move every one of those relationships and the
    guard would report the damage one screen at a time.
  */
  `:root { --brand: oklch(0.6204 0.19 40); }`,
  `:root { ${tier("light")} }`,
  `[data-theme="dark"] { ${tier("dark")} }`,
  /*
    ⚠️ THE CHOSEN FILL IS RE-DERIVED ON THE PAGE, AND WITHOUT THIS IT CANNOT
    CARRY A PRODUCT'S COLOUR AT ALL. A custom property is substituted where it is
    DECLARED, and every tier above is declared on `:root` — so `var(--brand)` in
    them resolves against the DEPLOYMENT's brand, once, and what descendants
    inherit is an already-resolved colour. `Page` sets a product's own hue as an
    inline `--brand` on itself (`PageProps.hue`), which is below `:root` and
    therefore reaches nothing that was already resolved above it.

    ⚠️ THE FAILURE IS SILENT AND LOOKS LIKE A TUNING PROBLEM, WHICH IS WHY IT
    SURVIVED. One's own brand is MONO, so `tinted()` at `:root` mixes grey into
    grey and every tier comes out a clean neutral — correct, and indistinguishable
    from working. Raising `CHOSEN_TINT` to make the selected segment vivid then
    made it a LIGHTER GREY, because 88% of a neutral is a neutral. The wash
    escapes the same trap only by accident of where it lives: it re-declares
    `--default` on `[data-wash]`, which is the page element, so the unselected
    track picked the product's amber up and the chosen segment did not.

    ⚠️ AND THIS IS THE SECOND OF TWO MECHANISMS, NOT THE FIX. `Page` stamps the
    hue on `documentElement` as well (`useHue`), which is what makes every tier
    above resolve against it — including for a modal or a drawer, which is
    portalled to `body` and is outside this selector entirely. That stamp is the
    general answer; this rule is what covers a page rendered without it: static
    markup with no effects, and a NESTED page declaring a hue of its own, where
    the document carries the outer product's colour and this one carries its own.

    ⚠️ ONLY THIS TIER IS RESTATED, THOUGH, AND THAT IS THE DECISION. A nested
    page differing from the document in its whole surface ladder would be a card
    made of one product inside a screen made of another; what it needs to differ
    in is the one token that says "chosen", because that is the only one carrying
    information rather than material.

    ⚠️ `--accent-soft` IS RESTATED HERE TOO, NOT JUST THE TIER. It is declared on
    `:root` as `var(--tier-chosen)` and so is ALREADY RESOLVED there — moving the
    tier alone would change a value nothing reads again. This is the same trap
    one level down, and it is the one that would have been missed.
  */
  `[data-sky] { ${chosen("light")} }`,
  /* ⚠️ HIGHER SPECIFICITY, BECAUSE THE RULE ABOVE HITS EVERY PAGE IN BOTH THEMES.
     A direct declaration on the element beats anything inherited from `:root`, so
     without this a dark page would wear the light theme's chosen fill. */
  `[data-theme="dark"] [data-sky], [data-theme="dark"][data-sky] { ${chosen("dark")} }`,
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
    a 390px screen gave 278px to text and 112px to nesting. The OneSpace is presented
    OVER a product whose own screens run at 16 + 16, so the same card came out
    narrower inside OneSpace than outside it, on the same phone, for no reason
    anybody could see.

    ⚠️ AND IT IS THE `--full` VARIANT ONLY. A `Confirm` is a centred dialog and
    keeps its inset; a drawer keeps its own for the same reason — its content
    sits directly against the sheet with no band under it.
  */
  `.modal__dialog--full { padding: 0; }`,

  /*
    ⚠️ A TAB PANEL IS NOT A GUTTER, AND ITS 8px MADE ONE SCREEN NARROWER THAN
    EVERY OTHER. `Band` is the page gutter and the only one; a screen that
    happens to use tabs was inheriting a third inset from the library, so the
    same card was 8px in from the column on Settings and flush with it
    everywhere else — measured as a card at 40px from the edge against 16px on
    the screen beside it.

    ⚠️ THE INLINE AXIS ONLY. A panel's vertical padding is the air under the tab
    row, which is the library's business and is right.
  */
  `.tabs__panel { padding-inline: 0; }`,

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
