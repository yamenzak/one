/**
 * EVERY MEASUREMENT IN THE SYSTEM, IN ONE FILE.
 *
 * ⚠️ THIS EXISTS BECAUSE THE VOCABULARY DRIFTED THE MOMENT IT HAD MORE THAN
 * THREE COMPONENTS. A `SPACE` scale was written for the layout and then not used
 * INSIDE the rows, so one row padded itself `py-1`, the next `py-2` and the next
 * `py-3` — each defensible, and the result a list with no rhythm at all. Nobody
 * can point at which one is wrong, which is the definition of drift.
 *
 * ⚠️ SO NOTHING OUTSIDE THIS FILE WRITES A SPACING UTILITY, and a guard says so.
 * A component asks for a named metric; if it needs one that is not here, the
 * answer is to add it here — in review, once — rather than to pick a number in
 * the file that needed it.
 *
 * ⚠️ AND THE TOUCH TARGET IS THE NON-NEGOTIABLE ONE. 44px is the floor below
 * which a control is measurably harder to hit, and it is a floor on a MOUSE too:
 * a 32px row is a row people miss on a laptop, not just on a phone. Every
 * pressable thing here is at least `ROW.tap`.
 */

/* ------------------------------------------------------------------- rows --- */

export const ROW = {
  /**
   * ⚠️ 64px. 44 is the accessibility floor and 56 was merely comfortable; 64 is
   * what a list of two-line rows actually needs before the description stops
   * crowding the label. Measured against a product that reads well, not chosen.
   */
  tap: "min-h-16",
  /** A row that is not pressable: a field, a note, a step. */
  still: "min-h-14",
  /** ⚠️ ONE value, on every row. This is the whole rhythm. */
  pad: "py-3",
  /** Between the lead glyph and the body. */
  gap: "gap-3",
  /**
   * ⚠️ A ROW OWNS NO HORIZONTAL PADDING, BECAUSE THE CARD AROUND IT ALREADY
   * DOES. The library's `Card` is `p-4` and its `Button` is `px-4`, so a row
   * built out of a button inside a card was indented 32px while its own
   * separator was drawn at 36px from the card — which is the misalignment that
   * made every list look hand-assembled. The gutter belongs to the container.
   */
  flush: "px-0",
  /**
   * ⚠️ AND IT OWNS NO FIXED HEIGHT EITHER — IT TELLS THE BUTTON TO DROP ITS OWN.
   * `.button` is `h-10 md:h-9`: a hard 40px that SHRINKS to 36 on a desktop. A
   * two-line row is 68px, so every list in the product was a 40px control with
   * its content hanging out of it, and the touch target the metrics guard
   * promised existed only in the markup.
   */
  free: "h-auto",
  /**
   * ⚠️ AND IT LETS THE WORDS WRAP. `.button` is `whitespace-nowrap`, which is
   * right for a control labelled with two words and ruinous for a row whose
   * second line is a sentence: the text sets the button's min-content width,
   * the button widens the card, the card widens the page, and a phone scrolls
   * sideways with a description hanging over the edge of its own card. Every
   * row and every place IS a button, so this rides wherever `free` does.
   */
  wrap: "whitespace-normal",
} as const;

/**
 * ⚠️ THE LEAD IS A FIXED BOX, NOT A GLYPH. Icons have different widths; letting
 * each set its own makes the text column ragged down the whole list, which is
 * the single most visible sign of a hand-built list. A box means every label
 * starts at the same x, whatever is in it.
 *
 * ⚠️ AND IT IS A 40px CHIP, NOT A 24px SLOT. A bare glyph beside two lines of
 * text has no weight — the row reads as text with a decoration, and a card of
 * them reads as a paragraph with bullets. Every product whose lists have
 * presence puts the mark in a filled circle at the height of the text block it
 * sits beside. It also settles a question that had two answers: at 40px a glyph
 * lead and a FACE are the same width, so a separator has one inset instead of
 * two, and the class of bug where a list of people was ruled at the glyph inset
 * cannot occur.
 */
export const LEAD =
  "flex size-10 shrink-0 items-center justify-center rounded-full" as const;

/**
 * ⚠️ THE ICON SIZE IS LOCKED HERE AND NOWHERE ELSE. Every glyph in the product
 * is drawn at these, so a list has one optical weight — the thing that was most
 * obviously missing while the icons were text characters at whatever size the
 * font gave them.
 */
export const ICON = { row: 20, crown: 20, quick: 22, nav: 24, face: 28, tile: 26 } as const;

/**
 * ⚠️ A FACE IS 40px, AND THE CROWN LOOKED EMPTY UNTIL IT WAS. A 24px avatar in a
 * 64px bar leaves the whole thing top-light and unbalanced — which is most of
 * why a crown reads as unfinished even when everything in it is correct.
 */
export const FACE = "size-10" as const;

/**
 * ⚠️ WHERE A SEPARATOR STARTS. A rule that runs under the lead cuts the icon
 * column in half and makes a list read as a table; one that starts where the
 * labels start is what makes the leads read as a single column.
 *
 * ⚠️ `lead` AND `face` ARE THE SAME NUMBER NOW, AND THAT IS THE POINT RATHER
 * THAN AN OVERSIGHT. They were 36 and 52 while a glyph sat in a 24px slot beside
 * a 40px avatar, which is what made a list of people ruled at the glyph inset a
 * mistake anybody could make. A glyph chip is 40px too, so there is one column
 * and one inset; the names stay because a caller reading `face` should not have
 * to know they coincide, and the day a lead changes size only one of them moves.
 */
export const INSET = { lead: "ml-13", face: "ml-13", none: "" } as const;

export type Inset = keyof typeof INSET;

/** ⚠️ One crown, one height. Two of them at different heights is two products. */
export const CROWN = "min-h-16" as const;

/**
 * ⚠️ EVERY CONTROL IN THE CROWN IS THE SAME SIZE, AND THAT SIZE IS `lg`. Measured
 * against a product that reads well, the top row is a 40px band of equal
 * elements — avatar, field, actions — at around 17px type. The library's default
 * `md` is 40px tall but only 14px type, which is what made ours read as a
 * miniature of the same idea; `lg` is 44/16 and errs on the confident side.
 *
 * ⚠️ AND `isIconOnly` IS NOT OPTIONAL ON AN ICON CONTROL. Without it a `Button`
 * is `w-fit px-4`, so a 20px glyph comes out in a 52×44 LOZENGE — the single
 * clearest reason our crown looked like a cheap copy of one made of circles.
 * The library ships the modifier (`.button--icon-only` is `w-11 p-0`); we simply
 * were not asking for it.
 */
export const CROWN_SIZE = "lg" as const;

/**
 * ⚠️ A PIECE OF CROWN CHROME THAT IS NOT A CONTROL, AT THE SAME SIZE AS THE ONES
 * THAT ARE. The collapsed page title is the only thing in this shape today: it
 * needs a ground to stay readable over a card scrolling past it, and the ONE
 * ground the crown is allowed is the one its buttons already wear. Matching
 * `lg`'s box by hand is the cost of not being a `Button` — and it must not be
 * one, because a heading somebody can press is a heading that goes nowhere.
 */
export const CROWN_CHIP = "flex h-11 items-center rounded-full px-4" as const;

/**
 * ⚠️ AIR UNDER A PAGE TITLE, AND ONLY UNDER IT. A screen's name and the first
 * section heading below it are both left-aligned words at similar weight, so
 * with only a stack gap between them the eye reads them as one list — and on a
 * page whose title also carries a scope row, three rows of words arrive with
 * nothing saying which belongs to which. Padding at the TOP would fight the
 * crown, which already sets it.
 */
export const TITLE_PAD = "pb-6" as const;

/**
 * ⚠️ THE ISLAND HOLDS ITS ITEMS AT ARM'S LENGTH AND NOTHING MORE. `Card` is
 * `p-4`, so the nav came out 63px tall against a reference that is 54 with its
 * labels and 40 without — a bar with sixteen pixels of nothing around a row of
 * pills. Four is what a pill needs to not touch the edge it sits in.
 */
export const ISLAND_PAD = "p-1" as const;

/**
 * ⚠️ AND THE ITEM INSIDE IT HAS A HEIGHT, OR ITS CONTENT TOUCHES THE EDGES. With
 * the library's fixed height released the button became exactly as tall as an
 * icon plus a label, so a nav measured against a reference had 0.12 of its
 * height as padding below the words where the reference has 0.22 — the labels
 * sat on the rim. A minimum height and a centred column is the fix, because it
 * puts the air on both sides without anybody choosing two numbers.
 */
/*
 * ⚠️ AND IT OWNS ALMOST NO HORIZONTAL PADDING, FOR THE SAME REASON A ROW OWNS
 * NONE. `.button` is `px-4`: with five destinations on a 390px phone that is
 * 32 of the 78 pixels a column has, so every label truncated to four
 * characters — "Tod…", "Clie…", "Pro…" — while the bar itself fitted
 * perfectly. The gutter belongs to the island, not to each item inside it.
 */
export const ISLAND_ITEM = "px-1 py-2" as const;

/**
 * ⚠️ FOUR PIXELS, AND THE PILL IS INSET BY IT WITHOUT KNOWING IT IS. The pill is
 * absolutely positioned, and a percentage width on an absolute box resolves
 * against the containing block's PADDING box — so inset the bar and the pill
 * still starts at the padding edge. It sits inside a TRACK instead: a plain box
 * inside the padding, which the pill spans exactly and the bar's four pixels
 * surround. That is what keeps it off the rim while the arithmetic below stays
 * whole numbers.
 *
 * ⚠️ THE REST OF THE AIR IS ON THE ITEM, which makes the bar's height a
 * consequence of its content rather than a number: 8 + icon + gap + label + 8
 * when the labels are out, and 8 + icon + 8 when they are folded away. The bar
 * collapses because the label does, not because anything measured it.
 */

/* ------------------------------------------------------------------ stacks --- */

/**
 * ⚠️ FOUR GAPS, AND THEY ARE A RATIO RATHER THAN A LIST. 8 / 12 / 24 / 40 —
 * each step is far enough from the last that "which one is this" is never a
 * question. A scale with 16 and 20 in it is a scale where every choice is
 * arguable.
 */
export const SPACE = {
  /**
   * ⚠️ 4px, AND IT IS THE PAIR RATHER THAN THE GROUP. A label and the one line
   * under it are ONE thing said twice; at `tight` they read as two, and every
   * row in the product is built out of exactly that pair. It was missing from
   * the first version of this scale, so eleven components wrote `gap-1` by hand
   * — all of them agreeing, which is the good outcome of a bad situation and is
   * why nothing looked wrong. A step nobody can name is a step that drifts the
   * first time somebody has a reason.
   */
  hair: "gap-1",
  tight: "gap-2",
  snug: "gap-3",
  roomy: "gap-6",
  airy: "gap-10",
} as const;

export type Space = keyof typeof SPACE;

/**
 * ⚠️ A BLOCK'S OWN INSET. Absent from the first version of this file, which is
 * precisely why nine components invented one — and one of them chose `gap-4`, a
 * step that is not in the scale at all. A missing metric is not a smaller
 * problem than a wrong one: it guarantees everybody picks separately.
 */
export const PAD = "p-4" as const;

/**
 * ⚠️ A CARD FULL OF ROWS PADS SIDEWAYS ONLY, BECAUSE THE ROWS PAD THEMSELVES.
 * `.card` is `p-4` and every row is `py-3`, so the first row sat 28px below the
 * card's top edge and the last 28 above the bottom — a card of three rows with
 * a row and a half of air stacked at each end. It reads as a component that has
 * been given room twice, which is what it is.
 *
 * ⚠️ HORIZONTAL PADDING STAYS, because nothing else supplies it: the rows are
 * flush by design (see `ROW.flush`) so that a separator can line up with the
 * labels rather than with the card.
 */
export const CARD_ROWS = "px-4 py-0" as const;

/** Between a section's heading and the card under it. */
export const HEAD_GAP = "gap-2" as const;

/** The page gutter. Wider on a desktop because the column is not the screen. */
export const GUTTER = "px-4 md:px-6" as const;

/** Above and below a band's content. */
export const BAND_PAD = "py-6" as const;

/**
 * ⚠️ A HERO IS PADDED ABOVE AND NOT BELOW, AND THE REASON IS ARITHMETIC RATHER
 * THAN TASTE. It sits inside a gapped `Stack`, so its own bottom padding adds to
 * that gap — `py-6` under a `gap-6` is 48px of nothing between the figure and the
 * first section, which is what made the specimen look like a screen with a
 * missing block in it. Below a block in a stack, the stack's gap IS the spacing.
 */
export const HERO_PAD = "pt-6" as const;

/* -------------------------------------------------------------- the chrome --- */

/**
 * ⚠️ ROOM FOR THE NAV, RESERVED BY THE PAGE. A sticky island floats over
 * whatever precedes it, so the last card on every screen was cropped under the
 * nav — on both specimens, in the first render anybody looked at. The island
 * cannot fix this itself: by the time it is laid out, the content above it has
 * already been sized.
 */
export const NAV_SPACE = "pb-28" as const;

/** The same problem, for a screen whose one action is pinned instead. */
export const ACTION_SPACE = "pb-24" as const;

/**
 * ⚠️ THE SAFE AREA IS NOT OPTIONAL AND NOT A DETAIL. Without it a pinned control
 * sits under the home indicator on every modern phone — reachable, with the
 * gesture bar over it, which reads as a layout nobody tested.
 */
export const SAFE_BOTTOM = "pb-[max(0.75rem,env(safe-area-inset-bottom))]" as const;

/**
 * ⚠️ AND THE TOP, WHICH MATTERS THE MOMENT THE CROWN STICKS. A bar pinned to the
 * top of a phone sits under the status bar and the notch; the crown got away
 * with it while it scrolled off, and stops the moment it does not.
 */
export const SAFE_TOP = "pt-[env(safe-area-inset-top)]" as const;

/* ------------------------------------------------------------------ widths --- */

/**
 * ⚠️ THREE, NOT FIVE. `read` is prose and forms — near 65 characters, which is
 * where reading speed peaks. `work` is anything with columns. A scale nobody can
 * hold in their head is a scale people opt out of.
 *
 * ⚠️ AND `door` IS THE THIRD BECAUSE A DOOR IS NOT A DOCUMENT. An entry screen
 * at reading width is a 672px email field with a 672px button under it, which
 * reads as a form that has been stretched rather than laid out — the eye has no
 * reason to travel that far for one word. It is the one width a person is asked
 * to look at with nothing else on the screen.
 */
export const WIDTH = {
  door: "max-w-sm",
  read: "max-w-2xl",
  work: "max-w-6xl",
} as const;

export type Width = keyof typeof WIDTH;
