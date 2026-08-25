/**
 * TYPOGRAPHY AS SEVEN ROLES AND ONE FACE, AND A SCREEN PICKS A ROLE RATHER THAN
 * A SIZE.
 *
 * ⚠️ THE PROBLEM IS NOT THAT `text-2xl` IS WRONG. It is that one screen picks
 * `text-2xl`, the next picks `text-xl`, both are defensible, and a product
 * assembled from thirty such decisions has no typographic system at all —
 * nothing is broken, everything is slightly out of step, and no reviewer can
 * name the fault. Naming the ROLE moves the decision to one place, once.
 *
 * ⚠️ AND THE ROLES ARE ABOUT THE READER, NOT THE PAGE. `display` is the one
 * thing a screen exists to show; `title` is what this screen is; `section` is
 * what this part of it is; `body` is prose; `label` names a control; `note` is
 * secondary; `figure` is a number in a row or a stat. An eighth is a decision
 * somebody makes on purpose, in review.
 *
 * ⚠️ THE SCALE HAD NO TOP, AND THAT WAS THE WHOLE PROBLEM WITH IT. `title` and
 * `figure` were both 24px, so the number a whole screen was built around came
 * out the same size as the heading above it — every hero read as a slightly
 * larger caption. A hero figure is 40px and lands near 48 on a desktop, at 700
 * with the tracking pulled in: at that size the default letter-spacing is
 * visibly loose, and loose tracking on a large figure is most of what separates
 * a considered screen from a scaled-up one.
 *
 * ⚠️ NOTHING HERE SETS A COLOUR EXCEPT THROUGH A TOKEN. `text-muted` is the
 * library's own; a literal would be a screen a workspace's branding does not
 * reach (D7).
 *
 * ⚠️ AND THE LOUD ROLES STATE THEIR INK RATHER THAN INHERITING IT. `display`,
 * `wordmark` and `figure` are the thing a screen exists to show; inheriting
 * makes the loudest element on a page whatever colour its ancestors happened to
 * hand it, which came out a dusty grey under a quiet block and looked like a
 * design decision. A role that is *deliberately* secondary says so (`note`), and
 * everything between the two inherits on purpose — a paragraph takes its
 * container's voice, a headline does not.
 *
 * ⚠️ AND THESE GO ON OUR OWN ELEMENTS, NEVER ONTO A HEROUI COMPONENT.
 * `Card.Title` already knows what a card title looks like; putting a role class
 * on it is overriding the library, which the restyle guard refuses.
 */

/* ------------------------------------------------------------------ scale --- */

/**
 * EVERY SIZE IN THE PRODUCT, FROM ONE NUMBER AND ONE RATIO.
 *
 * ⚠️ THE ROLES WERE RIGHT AND THEIR SIZES WERE TEN LITERALS. `text-sm`,
 * `text-base`, `text-xl`, `text-2xl`, `text-6xl`, `text-[2rem]`, `text-[2.75rem]`,
 * `text-[3.25rem]`, `text-[3.5rem]`, `text-[5.5rem]` — six mechanisms and ten
 * numbers, each defensible where it was written and none of them in a
 * relationship with any other. Naming the role moved the decision to one file;
 * it did not make the file itself a system, and the gap showed: `section` at 20
 * and `group` at 16 read as one rank, while `title` at 32 sat two steps above
 * `section` with nothing between them.
 *
 * ⚠️ SO A SIZE IS AN INDEX ON A LADDER, AND THE LADDER IS ARITHMETIC. 1.25 is
 * the major third — wide enough that two neighbouring rungs are visibly
 * different at reading sizes, narrow enough that eight of them span 13px to
 * 61px without a gap somebody has to fill with an eleventh literal. Chosen
 * because the sizes already here cluster on it: 16, 20, 25, 31, 39, 49, 61
 * against the 16, 20, 24, 32, 44, 52, 60 that were typed.
 *
 * ⚠️ AND IT IS `rem`, WITH THE ROUNDING DONE ONCE HERE. A ladder recomputed at
 * each call site is a ladder with rounding differences in it; a ladder rounded
 * to whole pixels is a ladder that stops being geometric. Two decimal places of
 * a rem is a twentieth of a pixel at the default root size, which no screen can
 * show and no two rungs can collide over.
 */
const BASE = 1;
const RATIO = 1.25;

/** ⚠️ The rung, as a `rem` string. `step(0)` is the base; negative goes down. */
export const step = (n: number): string => `${(BASE * RATIO ** n).toFixed(3)}rem`;

/**
 * THE LEADING OF A RUNG, WHICH IS PART OF THE RUNG AND NOT A SECOND DECISION.
 *
 * ⚠️ LEADING TIGHTENS AS TYPE GROWS, AND THE RAMP IS THE WHOLE OF IT. A line of
 * 13px prose wants half again its own height between baselines; a 61px name
 * wants less than one, because at that size the space between two lines is
 * measured in tens of pixels and the default reads as two separate things. Every
 * design system does this and most of them do it by hand, once per heading.
 *
 * ⚠️ AND IT IS HERE BECAUSE THE LADDER DROPPING IT WAS A REAL REGRESSION. A
 * named Tailwind size carries a line-height (`text-base` is `1rem/1.5`); an
 * arbitrary one carries none — so the moment the roles moved onto the ladder,
 * every one of them started INHERITING its leading from wherever it was
 * dropped. Measured: the same `label` came out 22.86px tall inside a pressable
 * row, whose button sets 1.4286, and 24px inside an identical row that was not
 * pressable and took the page's 1.5. Two rows, one component, three pixels, and
 * the placeholder that stands in for them was suddenly the wrong height. That is
 * the argument this file makes about SIZE, one property over.
 *
 * ⚠️ SO NO ROLE NAMES ITS OWN, and `type.test.mjs` refuses one that does. A role
 * with a hand-picked leading is a role outside the ladder in the property nobody
 * checks — which is exactly how it got here.
 */
const LEAD_BASE = 1.5;
const LEAD_TIGHTEN = 0.09;
const LEAD_FLOOR = 0.95;

export const lead = (n: number): string =>
  Math.max(LEAD_FLOOR, LEAD_BASE - LEAD_TIGHTEN * n).toFixed(3);

/**
 * ⚠️ THE SAME RUNG IN PIXELS, FOR THE ONE THING THAT CANNOT TAKE A CLASS — an
 * icon, whose size is set on its box as a number (`--icon`). A ladder that stops
 * at the edge of the DOM is a ladder with a second, undeclared ladder beside it:
 * `ICON` held 20, 20, 22, 24, 26 and 28, six numbers with no relationship to the
 * type they stand next to or to each other.
 *
 * ⚠️ AND 16 IS THE ROOT SIZE, WHICH IS AN ASSUMPTION WORTH STATING. Everything
 * here is `rem`, so a person who has enlarged their browser's text gets larger
 * type — and their icons scale with it only if the icon is a `rem` too. It is
 * not: an icon in a fixed 44px circle that grows past the circle is worse than
 * one that holds. The number is what the rung is AT THE DEFAULT, and the box
 * around it is measured in the same units.
 */
export const ROOT = 16;

export const pixels = (n: number): number => Math.round(ROOT * RATIO ** n);

/**
 * ⚠️ THE RUNGS HAVE NAMES BECAUSE AN INDEX AT A CALL SITE IS A LITERAL AGAIN.
 * `step(3)` and `text-[2rem]` are the same decision made in the same place; what
 * a role names is the RANK, and the rank is what a reader compares.
 */
export const RANK = {
  /** ⚠️ 13px. Secondary text, and the only rung below the base. */
  aside: -1,
  /** ⚠️ 16px. What running text and a control's own name are set in. */
  base: 0,
  /** ⚠️ 20px. A card's heading. */
  block: 1,
  /** ⚠️ 25px. A part of a screen, and a figure standing in a row. */
  part: 2,
  /** ⚠️ 31px. What this screen is. */
  page: 3,
  /** ⚠️ 39px. The one thing a screen exists to show, on a phone. */
  hero: 4,
  /** ⚠️ 49px. That same thing on a desk, and an arrival's own mark on a phone. */
  loud: 5,
  /** ⚠️ 61px. An arrival on a desk. Nothing in the product goes above it. */
  door: 6,
} as const;

export type Rank = keyof typeof RANK;

/**
 * THE LADDER REACHES THE PAGE AS VARIABLES, AND THE CLASS NAMES ARE LITERAL.
 *
 * ⚠️ A COMPUTED CLASS NAME IS A CLASS NAME TAILWIND NEVER EMITS, and the failure
 * is silent and total. The first draft returned `text-[${step(n)}]` — correct
 * arithmetic, correct string, and invisible to the scanner, which reads SOURCE
 * text and never runs it. So no size rule was generated for any role, every
 * heading inherited, and the whole product rendered at one size with every check
 * green. This is the same trap the harness's own note describes one layer down:
 * a class used only where the scanner cannot see it does not exist.
 *
 * ⚠️ SO THE ARITHMETIC IS EMITTED AS CSS AND THE CLASS POINTS AT IT. `TYPE_CSS`
 * goes out with the other runtime tokens; these eight strings are written out in
 * full so the scanner finds them, and each one is the only place its rank is
 * spelled. The values behind them are still `step(n)` and nothing else.
 *
 * ⚠️ AND `length:` IS LOAD-BEARING, WHICH IS THE SAME TRAP ONE LAYER IN.
 * `text-[…]` sets a size or an ink depending on what is inside the brackets, and
 * Tailwind decides by LOOKING at the value: `text-[0.58em]` is a size because it
 * carries a unit, and `text-[var(--rank-page)]` is a COLOUR, because a bare
 * variable could be either and ink is the default. That draft compiled to
 * `color: var(--rank-page)` — a rem string used as a colour, which every browser
 * discards in silence — so once again no size rule reached any role and every
 * check was green. The hint is what makes the class unambiguous.
 */
export const TYPE_CSS = `:root { ${(Object.keys(RANK) as Rank[])
  .map((rank) => `--rank-${rank}: ${step(RANK[rank])}; --lead-${rank}: ${lead(RANK[rank])};`)
  .join(" ")} }`;

/**
 * AND THE LIBRARY'S OWN SIZES ARE POINTED AT THE SAME LADDER.
 *
 * ⚠️ HEROUI SETS TYPE FROM TAILWIND'S NAMED SCALE — `.button--md` is
 * `--text-sm` and `.chip` is `--text-xs` — so a screen made of our roles and its
 * controls was serving TWO ladders: measured on one dense screen, 31, 25, 20,
 * 16 and 13 from here and 14 and 12 from there, none of the second four
 * derivable from anything. That is the fault this file is about, arriving
 * through the one door D7 says we must not shut by hand: a `className` on a
 * library component is a restyle.
 *
 * ⚠️ SO THE VARIABLE IS REDEFINED RATHER THAN THE COMPONENT. Tailwind's scale is
 * a set of custom properties; pointing each at a rung leaves every library rule
 * exactly as the library wrote it and changes only what its numbers resolve to.
 * Nothing is overridden, nothing is `!important`, and a component the library
 * adds tomorrow is on the ladder the day it ships.
 *
 * ⚠️ `sm` LANDS ON THE BASE, WHICH IS THE ONE JUDGEMENT HERE. A control's own
 * name is not secondary text — it is the word somebody presses — and the ladder
 * has no 14. Rounding it DOWN to `aside` would put every button's label at
 * 12.8px on a phone; rounding up puts it level with a row's label, which is what
 * it is.
 */
const LIBRARY: readonly (readonly [string, Rank])[] = [
  ["xs", "aside"], ["sm", "base"], ["base", "base"], ["lg", "block"],
  ["xl", "block"], ["2xl", "part"], ["3xl", "page"], ["4xl", "hero"],
  ["5xl", "loud"], ["6xl", "door"], ["7xl", "door"], ["8xl", "door"], ["9xl", "door"],
];

export const LIBRARY_TYPE_CSS = `:root { ${LIBRARY
  .map(([named, rank]) =>
    `--text-${named}: var(--rank-${rank}); --text-${named}--line-height: var(--lead-${rank});`)
  .join(" ")} }`;

/* ⚠️ LITERAL, NOT BUILT — see `TYPE_CSS`. The scanner reads these. */
const AT: Readonly<Record<Rank, string>> = {
  aside: "text-[length:var(--rank-aside)] leading-[var(--lead-aside)]",
  base: "text-[length:var(--rank-base)] leading-[var(--lead-base)]",
  block: "text-[length:var(--rank-block)] leading-[var(--lead-block)]",
  part: "text-[length:var(--rank-part)] leading-[var(--lead-part)]",
  page: "text-[length:var(--rank-page)] leading-[var(--lead-page)]",
  hero: "text-[length:var(--rank-hero)] leading-[var(--lead-hero)]",
  loud: "text-[length:var(--rank-loud)] leading-[var(--lead-loud)]",
  door: "text-[length:var(--rank-door)] leading-[var(--lead-door)]",
};

const AT_WIDE: Readonly<Record<Rank, string>> = {
  aside: "md:text-[length:var(--rank-aside)] md:leading-[var(--lead-aside)]",
  base: "md:text-[length:var(--rank-base)] md:leading-[var(--lead-base)]",
  block: "md:text-[length:var(--rank-block)] md:leading-[var(--lead-block)]",
  part: "md:text-[length:var(--rank-part)] md:leading-[var(--lead-part)]",
  page: "md:text-[length:var(--rank-page)] md:leading-[var(--lead-page)]",
  hero: "md:text-[length:var(--rank-hero)] md:leading-[var(--lead-hero)]",
  loud: "md:text-[length:var(--rank-loud)] md:leading-[var(--lead-loud)]",
  door: "md:text-[length:var(--rank-door)] md:leading-[var(--lead-door)]",
};

/** ⚠️ A size utility from a rank — the only place one is asked for. */
const at = (rank: Rank): string => AT[rank];
/** ⚠️ …and the same at the breakpoint, for the roles that grow. */
const atWide = (rank: Rank): string => AT_WIDE[rank];

export const TYPE = {
  /**
   * ⚠️ THE ONE THING A SCREEN EXISTS TO SHOW. A balance, a score, a count — never
   * a heading, and never twice on a screen. If two things want this, neither is
   * the answer to what the screen is for.
   */
  /*
    ⚠️ AND IT HAS TO WIN AGAINST A SECTION HEADING THAT IS LEFT-ALIGNED AT THE
    GUTTER, which is a harder fight than the ratio suggests. A hero is CENTRED
    and captioned above and below in the quiet ink; a section name is bold, full
    contrast, and sits where the eye starts a line. At 2.5rem against `section`'s
    1.25rem the number was twice the size and still lost the screen — the first
    thing anybody's eye landed on was "What needs you". Mass, not multiple.
  */
  display: `font-mark ${at("hero")} ${atWide("loud")} font-bold tabular-nums tracking-[-0.035em] text-foreground`,
  /**
   * ⚠️ A NAME THAT IS ACTING AS A MARK, AND THE TRACKING IS THE WHOLE ROLE. A
   * workspace's name over its own planet is not a heading somebody reads on the
   * way to the content — it IS the content of that moment, and at that job the
   * difference between a title and a wordmark is almost entirely letter-fit.
   * `display`'s `-0.03em` is tuned for a NUMBER, where the digits are already
   * even; a word set that loosely at 48px reads as a heading scaled up. Pulled
   * to `-0.055em` at 800 the letters lock into one shape, which is what a mark
   * is.
   *
   * ⚠️ AND `text-balance`, BECAUSE A TWO-WORD NAME MUST NOT ORPHAN ITS SECOND.
   * "Northwind Strength" breaking to leave "Strength" alone under a nine-letter
   * line is the single thing that makes a large name look unset.
   */
  wordmark: `font-mark ${at("hero")} ${atWide("door")} font-extrabold tracking-[-0.05em] text-balance text-foreground`,
  /**
   * THE TWO HALVES OF A LOCKUP, AND THE WEIGHT SPLIT IS THE WHOLE WORDMARK.
   *
   * ⚠️ `One` LIGHT AND THE PRODUCT BOLD says the two things a lockup has to say
   * at a glance: which family this belongs to, and which member it is. Set at
   * one weight, every product name becomes a slightly different long word.
   *
   * ⚠️ NO SIZE IN EITHER, DELIBERATELY. `wordmark` above bakes one in because it
   * is always the same thing at the same scale; a lockup is drawn at four sizes
   * from a nav row to a door, so the caller sets the scale and these set the fit.
   */
  lockupFamily: "font-mark font-light tracking-[-0.04em]",
  lockupMember: "font-mark font-bold tracking-[-0.04em]",
  /**
   * THE NAME ON THE CURTAIN, WHICH IS THE ONE PLACE IT IS ALONE ON THE SCREEN.
   *
   * ⚠️ LIGHT, NOT BOLD, AND THAT IS THE WHOLE DIFFERENCE FROM `wordmark`. A
   * workspace's name over its own planet is competing with a picture and has to
   * hold; the opening has nothing else on it at all, and weight there reads as
   * volume rather than as presence. `One` is the FAMILY half of the lockup, and
   * the family half has been light since the lockup was drawn — setting it bold
   * here would make the first thing anybody sees the one place the wordmark
   * disagrees with itself.
   *
   * ⚠️ AND IT IS THE LARGEST TYPE IN THE PRODUCT, WHICH IS THE POINT. Every other
   * role here is sized to be read on the way to something; this one is the thing.
   * At the size it started — just over two rem on a phone — the name read as a
   * label on a dark page rather than as a title card, which is what "bigger
   * logo" meant. Half the width of a 390 leaves the ring, the word and the line
   * reading as one object with air around them.
   */
  opening: `font-mark ${at("loud")} ${atWide("door")} font-light tracking-[-0.045em]`,
  /**
   * What this screen is. One per screen, at the top.
   *
   * ⚠️ 32px AND BOLD, WHICH WIDENS THE LADDER RATHER THAN SHOUTING. At 28px
   * semibold it was one step above `section` (20px semibold) in size and no
   * steps above it in weight, so a screen with two sections read as three
   * headings of roughly equal rank and the eye had to find the top of the page
   * by position. The gap is now 32 / 20 / 16 with the top rank a weight heavier,
   * which is the difference between a hierarchy and a list.
   *
   * ⚠️ THE TRACKING TIGHTENS WITH THE SIZE, because it has to. Letter-spacing
   * that reads as normal at 28px reads as loose at 32 — a display face's
   * sidebearings are a fraction of the em, so the same em value is more space
   * on a bigger word. Every other role here scales its tracking the same way.
   */
  title: `font-mark ${at("page")} font-bold tracking-[-0.03em] text-balance text-foreground`,
  /** What this part of the screen is. */
  section: `font-mark ${at("part")} font-semibold tracking-[-0.015em] text-balance text-foreground`,
  /**
   * ⚠️ WHAT ONE BLOCK INSIDE A PART IS, AND IT IS THE THIRD RANK BECAUSE THERE
   * ARE THREE. A screen is named, a section of it is named, and a card inside
   * that section is named — and a heading that does not outrank what it heads is
   * a heading doing no work. Two of the three sharing a size is a screen that
   * reads as three pages stacked, whichever two they are.
   *
   * ⚠️ THE MARK FACE AND SEMIBOLD ARE WHAT KEEP IT A HEADING. At the same size
   * as `label` it would be indistinguishable from the name of the control under
   * it, and a card would appear to start with one of its own rows.
   */
  group: `font-mark ${at("block")} font-semibold tracking-[-0.01em] text-balance text-foreground`,
  /** Prose. `text-pretty` is what stops a two-line paragraph orphaning a word. */
  body: `${at("base")} text-pretty text-foreground`,
  /** Names a control or a value. Not a heading — it labels something beside it. */
  label: `${at("base")} font-medium text-foreground`,
  /**
   * ⚠️ A WORD INSIDE A SENTENCE THAT IS LOUDER THAN THE REST, and it needs a
   * token because Tailwind's preflight resets `<strong>` to inherit. Written as
   * a bare `font-semibold` in the one component that renders somebody else's
   * writing, it is a weight nothing else in the system can see or agree with.
   */
  strong: "font-semibold",
  /** Secondary: a caption, a hint, a timestamp. Quieter, never smaller than 14px. */
  note: `${at("aside")} text-muted`,
  /**
   * ⚠️ A NUMBER MEANT TO BE COMPARED, WITH `tabular-nums`. Proportional digits
   * make a column of figures ripple, and the reader's eye does the arithmetic on
   * the ripple rather than on the values. This is the number in a ROW or a stat
   * block; the one a screen is built around is `display`.
   */
  figure: `font-mark ${at("part")} font-bold tabular-nums tracking-[-0.025em] text-foreground`,
  /**
   * ⚠️ THE NUMERALS WITHOUT THE SIZE — for a figure that lands INSIDE a row, a
   * heading or a sentence, and takes whatever size it lands in. `figure` is a
   * size AND a weight AND a face, so a date or a price wearing it inside a row
   * came out at 24px bold; the only part of it a value in flow needs is the
   * tabular digits, and that is the whole of this.
   */
  figures: "tabular-nums",
  /**
   * ⚠️ THE FRACTIONAL PART OF AN AMOUNT, RELATIVE TO ITS WHOLE. `€1,051.70` at
   * one size is a number; with a smaller `.70` it is a sum of money, because the
   * eye lands on the part that matters. `em` rather than a fixed size, so the
   * ratio holds wherever the figure is used — a fixed one would be right once.
   */
  minor: "text-[0.58em] font-semibold",
  /**
   * ⚠️ AN IDENTIFIER, AND IT IS THE ONLY THING IN THIS SYSTEM THAT IS MONO.
   * `req_8f21c04`, an IBAN, a seal number, an API key: strings nobody reads as
   * words, that get copied, quoted down a phone and compared character by
   * character. That is the one job a monospaced face is actually better at,
   * because it is the one place `0`/`O` and `1`/`l`/`I` have to be told apart —
   * and `CopyRow` was rendering exactly these in the body face.
   *
   * ⚠️ AND NUMBERS ARE DELIBERATELY NOT MONO, WHICH IS THE COMMON MISTAKE. The
   * problem a monospaced face solves for a column of figures is alignment, and
   * `tabular-nums` already solves it — on the brand face, at the brand's own
   * proportions. Setting money in mono buys the same alignment and pays for it
   * with the wrong connotation: a balance starts reading as terminal output, a
   * price as a config value. Every product that handles money well sets it in
   * its own sans with tabular figures, which is what `display` and `figure` do.
   */
  code: `font-mono ${at("aside")} tracking-tight text-foreground`,
} as const;

/**
 * THE THREE SIZES A CHART SETS, IN SVG USER UNITS.
 *
 * ⚠️ A NUMBER RATHER THAN A CLASS, BECAUSE SVG TEXT IS SIZED IN THE VIEWBOX'S
 * UNITS. Every chart here draws into a 320-unit box and scales to the column, so
 * a Tailwind size on an `<svg>` label is a size in the wrong coordinate system —
 * which is why these were written inline in the first place.
 *
 * ⚠️ AND THAT IS EXACTLY WHY THEY DRIFTED. `TYPE` covers the DOM and nothing
 * covered this, so each chart picked the number that fitted the space it had:
 * measured, the package was setting SEVEN sizes — 7, 8, 9, 13, 20 and 22 —
 * across four files, for three jobs. Nothing was broken and no reviewer could
 * name the fault, which is the failure this whole file exists to prevent, one
 * coordinate system over.
 *
 * ⚠️ THEY WERE FOUND BY MEASURING RATHER THAN BY READING. `Geometry.type`
 * reports every size a rendered screen actually set; the reports screen came
 * back with sixteen, against four to seven everywhere else. A static check
 * cannot ask that question — the sizes are inline styles on `<text>` elements
 * that are individually defensible.
 */
export const CHART_TYPE = {
  /** Every name, tick and category on a chart. `clipTo` already assumes it. */
  label: 8,
  /**
   * ⚠️ WHERE A GRID OF MANY COLUMNS LEAVES NO ROOM FOR `label`. One exemption,
   * held by the heat map's column headings, which are as many as the data has.
   */
  dense: 7,
  /**
   * ⚠️ THE ONE NUMBER INSIDE A RING, and both rings take the same one. A gauge
   * shows a percentage (four characters at most) and a donut shows a compact
   * total (which can be six), so the fit is decided by the longer of the two —
   * sized separately, the same component at two sizes reads as a bug on a screen
   * holding both.
   */
  centre: 20,
} as const;

/* ------------------------------------------------------------- headings --- */

/**
 * A HEADING SAYS WHETHER IT HAS A LINE UNDER IT, AND ITS PEERS HAVE TO AGREE.
 *
 * ⚠️ THE FAULT IS NEVER ONE HEADING, IT IS TWO NEXT TO EACH OTHER. "The shelf,
 * as it was" carried a line and the three cards under it in the same stack did
 * not — so one card looked like the important one, for a reason nobody chose.
 * Photographed on a phone: the mixed column reads as a screen assembled from two
 * templates, and every heading in it is individually correct.
 *
 * ⚠️ SO IT IS A RULE ABOUT A GROUP, WHICH IS WHY NO COMPONENT CAN KEEP IT. A
 * `Group` knows what it was handed and nothing about its siblings; the page
 * decides, and the page is not an object. What a component CAN do is state its
 * answer where something looking at the whole rendered screen can compare them —
 * which is the shape every other rule in this file takes, one layer out.
 *
 * ⚠️ AND THE RANK IS PART OF THE KEY. Sections and the cards inside them are
 * different questions: a screen may head every section with a line and none of
 * its cards, which is a system. What it may not do is answer one of them twice.
 */
export const headed = (
  rank: "title" | "section" | "group",
  under: unknown,
): Record<string, string> => ({ "data-head": rank, "data-said": under ? "yes" : "no" });

export type Role = keyof typeof TYPE;

export const ROLES = Object.keys(TYPE) as readonly Role[];

/** ⚠️ Placement is the caller's; the role is ours. They compose, they do not fight. */
export const text = (role: Role, layout = ""): string =>
  layout ? `${TYPE[role]} ${layout}` : TYPE[role];

/**
 * ⚠️ THE FACE IS THE FRAMEWORK'S, NOT EACH APP'S, and it is self-hosted.
 *
 * A system stack is a different typeface on every device — so the one thing a
 * design system is FOR, looking like itself, is the one thing it cannot promise.
 * It is also why the scale above could not be tuned: `-0.03em` at 40px is right
 * for a grotesque and wrong for whatever Android happens to serve.
 *
 * ⚠️ SELF-HOSTED, NEVER A FONT CDN. A CDN link is a third party in the critical
 * path of the first paint, a request that fails closed to a fallback face
 * nobody designed against, and a privacy claim to defend. The variable file
 * ships with the bundle.
 *
 * ⚠️ AND THE FALLBACK STACK IS NOT DECORATION. It is what people read for the
 * first few hundred milliseconds of a cold start, so it is a real grotesque
 * rather than `sans-serif` — with `font-display: swap`, a bad fallback is a
 * visible reflow into a different-width face on every first visit.
 */
export const FACE_STACK = [
  '"Geist Variable"',
  '"Geist"',
  "-apple-system",
  "BlinkMacSystemFont",
  '"Segoe UI"',
  "Roboto",
  '"Helvetica Neue"',
  "Arial",
  "sans-serif",
].join(", ");

/**
 * ⚠️ NO `font-feature-settings`, AND THAT IS A DECISION RATHER THAN AN OMISSION.
 * The obvious line to write here is `"cv11", "ss03"` — those are INTER's
 * character variants, they do nothing at all in this face, and a declaration
 * that does nothing is worse than none: it reads as tuned, so nobody revisits
 * it. Add features when a face has them and somebody has looked at the
 * difference.
 *
 * ⚠️ `text-rendering` IS ALSO DELIBERATELY ABSENT. `optimizeLegibility` is the
 * classic thing to add here and it turns on ligatures and kerning at every size,
 * which is slower and, on long pages, occasionally wrong. The browser default is
 * already kerned.
 */
/**
 * ⚠️ THE MONO STACK IS THE SYSTEM'S, NOT A SECOND SELF-HOSTED FILE. It is used
 * by one role, for identifiers, at small sizes — so what it has to be is
 * fixed-width and unambiguous, and every platform already ships a face that is
 * both. Shipping a second variable font for a reference code would be a font
 * file per app for a string most people never see.
 */
export const MONO_STACK = [
  "ui-monospace",
  "SFMono-Regular",
  '"SF Mono"',
  "Menlo",
  "Consolas",
  '"Liberation Mono"',
  "monospace",
].join(", ");

/**
 * ⚠️ A SECOND FACE, FOR HEADINGS ONLY, AND THE SPLIT IS THE OLDEST ONE IN
 * TYPOGRAPHY. A text face is drawn to disappear at 16px over many lines; a
 * display face is drawn to be LOOKED at, once, large. One face doing both is
 * the compromise every design system starts with and every distinctive one
 * leaves — a heading in the body face is legible and anonymous, which is
 * exactly what a workspace's name over its own planet must not be.
 *
 * ⚠️ ONEST, AND THE REASON IS THE COUNTERS. Squared bowls, tight apertures and
 * a high x-height mean a word at 44px locks into ONE shape rather than reading
 * as a row of letters — which is the whole difference between a heading and a
 * mark. It also rhymes with the interface's own geometry, where every plate and
 * card is a squircle.
 *
 * ⚠️ THE FALLBACK IS THE TEXT FACE, NOT A SYSTEM ONE. If the display file has
 * not arrived, a heading set in Geist is the product looking like itself at a
 * slightly different weight; a heading in whatever Android serves is a heading
 * in a face nobody chose, at the largest size on the screen.
 */
export const MARK_STACK = [
  '"Onest Variable"',
  '"Onest"',
  FACE_STACK,
].join(", ");

export const FACE_CSS = [
  `:root { --font-sans: ${FACE_STACK}; --font-mono: ${MONO_STACK}; --font-mark: ${MARK_STACK}; }`,
  `html, body { font-family: var(--font-sans); }`,
  /*
    ⚠️ A PLAIN CLASS, NOT A TAILWIND THEME ENTRY, AND THE REASON IS ONE SOURCE.
    `@theme { --font-mark: … }` would generate the utility, but the stack would
    then be written in a CSS file as well as here — two lists that agree until
    somebody edits one. A rule beside the stack it uses cannot disagree with it.

    ⚠️ AND IT BEATS INHERITANCE WHATEVER THE ORDER. `font-family` set on the
    element always wins over the `html, body` rule above, so this does not depend
    on where the injected sheet lands relative to Tailwind's.
  */
  `.font-mark { font-family: var(--font-mark); }`,
  /* ⚠️ A number is read, not spelled — every figure in the product is lining by
     default, so a column of them cannot sit at different heights. */
  `html { font-variant-numeric: lining-nums; }`,
  /* ⚠️ ANTIALIASING IS SET, BECAUSE THE DEFAULT IS THE WRONG ONE FOR LIGHT TEXT
     ON A DARK GROUND. Subpixel rendering fattens a white glyph on dark until a
     500 weight reads as a 600 — which is most of why light-on-dark UI text looks
     heavier than the same face in a design tool. */
  `html { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }`,
].join("\n");

/* ------------------------------------------------------------------ words --- */

/**
 * AN ID, SAID THE WAY A PERSON READS IT.
 *
 * ⚠️ A WIRE VALUE IS NOT COPY, AND RENDERING ONE VERBATIM IS THE TELL. `metric`,
 * `comfortable`, `not_started` and `past_due` are keys — chosen so a machine can
 * compare them — and a settings row showing "comfortable" in the middle of a
 * screen where every other word is capitalised reads as something unfinished.
 *
 * ⚠️ IT IS A FALLBACK, NEVER A TRANSLATION. `kg` becomes "Kg" and `RGB` would
 * become "Rgb", which is why every declaration that has a real name for its
 * options should say so — this is what happens when it does not, and it is right
 * far more often than the raw id.
 */
export const sentence = (id: string): string => {
  const words = id.replace(/[_-]+/g, " ").replace(/([a-z\d])([A-Z])/g, "$1 $2").trim();
  return words ? words[0]!.toUpperCase() + words.slice(1).toLowerCase() : id;
};
