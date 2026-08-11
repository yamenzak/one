/**
 * THE FIVE PAGE ARCHETYPES, AND THE PATTERNS THEY ARE ASSEMBLED FROM.
 *
 * ⚠️ A PRODUCT HAS FIVE PAGE SHAPES, NOT ONE PER SCREEN. A new screen picks one;
 * it does not invent a sixth. Giving every screen the same top is what makes a
 * product read as a settings page throughout — and giving each screen its own is
 * what makes it read as four products.
 *
 * ⚠️ THE TOP IS DECIDED BY WHAT THE SCREEN IS. `crown` is about one NUMBER,
 * `topic` about one SUBJECT, `title` is a LIST, `identity` is one PERSON, `feed`
 * is independent SECTIONS. That is the whole question a screen answers, and
 * everything else here follows from the answer.
 *
 * ⚠️ AND THE LIMITS ARE REFUSALS IN CODE, NOT SENTENCES IN A DOCUMENT. Four
 * quick actions, five tabs, four tiles across, one hero: a limit written down is
 * a limit nobody has read, and every one of these has a screen somewhere that
 * would like to be the exception.
 */

import type { Sky } from "./sky.js";

export const ARCHETYPES = ["crown", "topic", "title", "identity", "feed"] as const;
export type Archetype = (typeof ARCHETYPES)[number];

export interface Shape {
  /** What the top of the screen IS. Never a choice at the call site. */
  readonly top: "photo-hero" | "pattern-hero" | "big-title" | "portrait" | "app-bar";
  /** The sky this shape is drawn on, unless the page names another masked one. */
  readonly sky: Sky;
  /**
   * How far the light survives, in REM FROM THE TOP OF THE SCREEN.
   *
   * ⚠️ A PHOTOGRAPH CARRIES A WHOLE SCREEN AND A PATTERN GIVES OUT PAST THE
   * HERO. `solid` is where the fade begins and `reach` is where it is gone —
   * both on the light itself, so nothing ever gets a bottom EDGE (§5.4).
   *
   * ⚠️ A LENGTH, NOT A PERCENTAGE, AND THAT WAS A CORRECTION. As a percentage of
   * the page these were a fact about how much CONTENT a screen happened to have:
   * the same archetype gave a short list a modest backdrop and a long one a wash
   * over the entire scroll, and at a desktop width — where the page is far
   * taller — every screen came out tinted end to end. How far the light survives
   * is a fact about the screen's TOP, so it is measured from there.
   */
  readonly solid: number;
  readonly reach: number;
  /** Whether the screen's title is centred over the light or set left, big. */
  readonly title: "centred" | "left" | "none";
  /**
   * ⚠️ THE SECTION HEADER SITS INSIDE THE CARD ONLY ON A FEED, because there the
   * card IS the section rather than a list the section contains. Put inside
   * anywhere else, the title becomes an item in the list it names.
   */
  readonly headerInside: boolean;
}

export const SHAPE: Readonly<Record<Archetype, Shape>> = {
  crown: { top: "photo-hero", sky: "photo", solid: 16, reach: 40, title: "centred", headerInside: false },
  topic: { top: "pattern-hero", sky: "dots", solid: 10, reach: 26, title: "centred", headerInside: false },
  title: { top: "big-title", sky: "aurora", solid: 7, reach: 20, title: "left", headerInside: false },
  identity: { top: "portrait", sky: "rings", solid: 13, reach: 30, title: "centred", headerInside: false },
  feed: { top: "app-bar", sky: "aurora", solid: 5, reach: 17, title: "none", headerInside: true },
};

/* ------------------------------------------------------------- patterns --- */

/**
 * ⚠️ THE ARCHETYPES ARE ASSEMBLED FROM THESE AND NOTHING ELSE. The list is the
 * boundary: a screen that needs an eleventh pattern is a screen making a decision
 * the language has not made, and the right answer is to add it HERE — once, for
 * every app — rather than in the screen.
 */
export const PATTERNS = [
  "menu-group", "record-list", "header-outside", "header-inside",
  "quick-actions", "tile-grid", "segmented", "scroller", "trailing-action", "promo",
] as const;
export type Pattern = (typeof PATTERNS)[number];

/**
 * ⚠️ THE LIMITS, WHERE THEY CAN BE ENFORCED RATHER THAN REMEMBERED.
 *
 * Each is a count past which the pattern stops being the thing it is: five quick
 * actions is a toolbar, six tabs is a menu, five tiles across is a grid nobody
 * can hit, and two heroes is a screen that is about two things.
 */
export const LIMIT = {
  quickActions: 4,
  tabs: 5,
  tilesAcross: 4,
  heroes: 1,
} as const;

export interface PageProblem { readonly at: string; readonly detail: string }

export interface PageDeclaration {
  readonly archetype: Archetype;
  /** ⚠️ A page may override the MASK, never the colour — and only a masked one. */
  readonly sky?: Sky;
  readonly quickActions?: number;
  readonly tabs?: number;
  readonly tilesAcross?: number;
  readonly patterns?: readonly Pattern[];
}

/**
 * Everything wrong with a page's declaration, at once.
 *
 * ⚠️ A REPORT RATHER THAN A THROW, for the same reason `declarationProblems` is:
 * this runs over a whole manifest, and the useful answer is all six mistakes
 * together rather than the first one somebody hits.
 */
export function pageProblems(page: PageDeclaration): readonly PageProblem[] {
  const out: PageProblem[] = [];
  const shape = SHAPE[page.archetype];
  if (!shape) {
    return [{ at: "archetype", detail: `"${page.archetype}" is not one of: ${ARCHETYPES.join(", ")}` }];
  }

  /*
    ⚠️ A PAGE MAY CHOOSE A MASK, NEVER A GROUND. `photo` and `aurora` belong to
    the shapes that need them — a list page on a photograph is a list page whose
    top third is unreadable, and the author who set it would have no way to know
    that from the call site. Naming the shape's OWN ground is refused too: it
    reads as a choice, and the next edit to the shape leaves it behind as one.
  */
  if (page.sky) {
    const maskable: readonly Sky[] = ["dots", "waves", "grid", "rings"];
    if (!maskable.includes(page.sky)) {
      out.push({ at: "sky", detail: `"${page.sky}" belongs to an archetype, not a page — a page may name only: ${maskable.join(", ")}` });
    }
  }

  if ((page.quickActions ?? 0) > LIMIT.quickActions) {
    out.push({ at: "quickActions", detail: `${page.quickActions}: past ${LIMIT.quickActions} a row of quick actions is a toolbar` });
  }
  if ((page.tabs ?? 0) > LIMIT.tabs) {
    out.push({ at: "tabs", detail: `${page.tabs}: past ${LIMIT.tabs} a tab bar is a menu, and nobody aims at it from memory` });
  }
  if ((page.tilesAcross ?? 0) > LIMIT.tilesAcross) {
    out.push({ at: "tilesAcross", detail: `${page.tilesAcross}: past ${LIMIT.tilesAcross} across, a tile is smaller than the hit-area floor` });
  }

  /*
    ⚠️ HEADER-INSIDE IS THE ONE PATTERN THAT IS NOT AVAILABLE EVERYWHERE, and the
    check is here rather than in the component because the component cannot see
    what page it is on — which is exactly why the rule kept being broken.
  */
  if (!shape.headerInside && page.patterns?.includes("header-inside")) {
    out.push({
      at: "header-inside",
      detail: `a ${page.archetype} page puts the header OUTSIDE the card — inside, the title becomes an item in the list it names`,
    });
  }

  for (const pattern of page.patterns ?? []) {
    if (!PATTERNS.includes(pattern)) {
      out.push({ at: "patterns", detail: `"${pattern}" is not a pattern — the language has: ${PATTERNS.join(", ")}` });
    }
  }
  return out;
}
