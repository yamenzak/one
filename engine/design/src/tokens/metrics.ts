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
 *
 * ⚠️ THE SENTENCE ABOVE WAS TRUE OF THE ROWS AND FALSE OF THE BUTTONS, and only
 * a browser could say so — the library ships 40px, 36 above the breakpoint and
 * 32 for `sm`, and none of that is written in any file here. The floor is one
 * CSS rule in `one-space/src/styles.css`, because a class on every call site is
 * what this file exists to prevent, and it is measured across every screen of a
 * real product rather than asserted.
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
  /**
   * WHAT A PRESS LOOKS LIKE, AND IT IS THE CARD'S WIDTH RATHER THAN THE TEXT'S.
   *
   * ⚠️ THE FILL WAS THE TEXT COLUMN'S WIDTH, NOT THE CARD'S. A row is `px-0`
   * because the card owns the gutter (`ROW.flush`), so the pressed fill stopped
   * 16px short of the card on both sides — measured at 21px once the button's
   * own `scale(0.97)` had pulled it in further. That is a shape floating INSIDE
   * the card with no relationship to it, which is what "it sticks to the
   * content" describes.
   *
   * ⚠️ SO IT BLEEDS BACK OUT TO THE CARD'S EDGE, undoing the gutter for the FILL
   * while the content keeps it. `.button`'s own `scale(0.97)` then pulls the row
   * off the card's edges as it goes down, so the press reads as this row lifting
   * out of this card rather than as a pill dropped on it — geometry, not a
   * border D7 would refuse anyway.
   *
   * ⚠️ AND THE RADIUS IS THE LIBRARY'S, DELIBERATELY. `.button` is `rounded-3xl`
   * and 24px is large for an 89px row — but a radius is APPEARANCE, so setting
   * one here is a component restyled behind the theme's back and a workspace's
   * branding stops reaching it. `heroui.test.mjs` refused exactly that, and it
   * was right to: the fix for a radius is the theme, never a class.
   *
   * ⚠️ THE WIDTH IS EXPLICIT BECAUSE `w-full` WOULD WIN. Same property, same
   * specificity, and the negative margin then shifts the row left instead of
   * widening it — which measured as a fill hanging 32px off the right edge.
   */
  press: "-mx-4 w-[calc(100%_+_2rem)] px-4",
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
 * ⚠️ WHERE AN EMPTY STATE GOES WHEN IT IS THE WHOLE SCREEN: centred in what is
 * left, rather than under the heading with the viewport blank beneath it. The
 * second reads as a page that stopped loading, and the sentence explaining the
 * emptiness is the one thing nobody trusts on a page that looks broken.
 */
export const WHOLE = "flex grow flex-col justify-center" as const;

/**
 * ⚠️ HOW MUCH OF A ROW THE CONTROL MAY TAKE, AND IT IS A RATIO BECAUSE THE ROW
 * IS NOT A FIXED WIDTH. A `Select` sizes itself to its longest option and stays
 * inline; a text or number field ships `w-full` and takes everything, so it
 * pushed the label under the floor and the row wrapped. Measured in one card at
 * 390px: heights of 64, 100, 67 and 100 — two shapes, four rows, no rhythm at
 * all. At 900px the same card was 64, 64, 67, 64, which is why it read as
 * correct on the screen it was built on.
 *
 * ⚠️ 45% IS WHAT LEAVES THE LABEL ITS FLOOR AT THE NARROWEST WIDTH WE DRAW. A
 * phone's row is 278px inside the card: the control takes 125 and the words keep
 * 141, clear of the 128 floor, so nothing wraps. A fixed pixel cap would be
 * generous on a phone and mean than one line of a desktop's roomy row.
 *
 * ⚠️ AND A CONTROL THAT GENUINELY NEEDS THE WIDTH SAYS SO — `ControlRow`'s
 * `wide`, which a textarea already used. The cap is the default because the
 * default should be the shape a card of settings has.
 */
export const CONTROL_SHARE = "max-w-[45%]" as const;

/**
 * ⚠️ AN INSTALLED TILE IS A SQUIRCLE, AND THE RADIUS IS A PLATFORM CONVENTION
 * RATHER THAN OUR TASTE. iOS and Android both mask an app icon to roughly a
 * quarter of its side; drawing anything else in a preview shows somebody a shape
 * their phone will not give them. Two sizes and no third: the thing being chosen
 * (`panel`) and the thing beside a workspace's name in a list (`chip`).
 */
export const TILE = {
  panel: "size-20 rounded-[1.25rem] text-4xl font-semibold",
  chip: "size-8 rounded-[0.5rem] text-sm font-semibold",
  /**
   * ⚠️ THE HEIGHT OF A TILE IN `TileGrid`, AND ITS PLACEHOLDER'S. Two elements
   * are drawn at it — the tile and the bones it waits behind — so it is a
   * number reviewed once here rather than a literal in each, which is what a
   * placeholder drifting from its content looks like at the start.
   */
  tall: "h-28",
} as const;

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
 *
 * ⚠️ NUMBERS, NOT CLASSES, BECAUSE THE CLASS IS THE LIBRARY'S. `face.tsx` asks
 * HeroUI for `sm`/`md`/`lg` — which ARE these three — rather than writing a
 * size utility of its own, because `.avatar` sizes the box and the letter inside
 * it TOGETHER: a class that widened the box alone left the fallback initial at
 * whatever the variant set, and produced an 88px panel with a 14px letter adrift
 * in the middle of it. What is written here is the only place the numbers exist,
 * and what reads them is the resolution a face is baked at.
 */
export const FACE_PX = { chip: 32, row: 40, panel: 48 } as const;

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
 * WHERE THE DESKTOP RAIL PINS ITSELF: directly under the crown.
 *
 * ⚠️ IT IS `CROWN`'S HEIGHT PLUS THE INSET THE CROWN WEARS, and both halves are
 * load-bearing. Pinned at zero the rail slides under a crown that is also pinned
 * at zero, so the first destination in the product is the one nobody can read;
 * without the inset it starts under a notch on the one class of device that has
 * both a notch and a wide window.
 */
export const RAIL_TOP = "top-[calc(4rem+env(safe-area-inset-top))]" as const;

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
 *
 * ⚠️ AND IT IS `SPACE.airy`, THE SAME 40px A PAGE'S WIDEST GAP IS. A title's air
 * was 32 and a hero's was 32 and a section's gap is 24 — three numbers off two
 * ladders, close enough that nothing looked wrong and far enough apart that
 * nothing looked deliberate. The page has ONE ladder (8 / 12 / 24 / 40); a
 * heading takes the top rung of it, a section takes the one below, and the
 * distance between a title and the page is then a step rather than a rounding.
 */
export const TITLE_PAD = "pb-10" as const;

/**
 * ⚠️ THE ISLAND HOLDS ITS ITEMS AT ARM'S LENGTH AND NOTHING MORE. `Card` is
 * `p-4`, so the nav came out 63px tall against a reference that is 54 with its
 * labels and 40 without — a bar with sixteen pixels of nothing around a row of
 * pills. Four is what a pill needs to not touch the edge it sits in.
 */
export const ISLAND_PAD = "p-1.5" as const;

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
/**
 * ⚠️ TWO SHAPES NOW, BECAUSE THE ITEMS ARE NO LONGER ALL THE SAME. Four hold a
 * glyph and one holds a glyph and a word, so one padding for both makes the open
 * pill either cramped or the closed ones fat. The closed one is square-ish
 * around its icon; the open one has room at both ends of what it says.
 *
 * ⚠️ AND THE VERTICAL IS THE SAME ON BOTH, or the pill is a different height
 * from the bar it sits in — which is the single most visible way this shape goes
 * wrong, because the eye reads the mismatch as a rendering fault.
 */
export const ISLAND_ITEM = "px-2 py-2.5" as const;
export const ISLAND_HERE = "px-4 py-2.5" as const;

/**
 * ⚠️ A CODE BOX IS TALLER THAN IT IS WIDE, AND THE LIBRARY'S DEFAULT IS NOT.
 * Six slots sharing a form's width come out around 52px across; at the library's
 * own 40px height that is a landscape box holding one digit, and a row of them
 * reads as a control that was stretched to fit rather than sized. 64 puts each
 * box back on the portrait side of square — the proportion every code field
 * anybody trusts uses — and matches the tap target every other row here has.
 */
export const CODE_SLOT = "h-16" as const;

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
 * ⚠️ THE ONE GAP MEASURED IN `em` RATHER THAN PIXELS, and it is a different
 * scale on purpose. Everything above is the rhythm BETWEEN things, which is a
 * property of the page and should not change with a font size. This is the space
 * inside a single set piece of type — a currency mark and the digits it belongs
 * to — where a fixed number is wrong everywhere except the one size it was
 * chosen at: too tight on a hero balance, too loose in a table cell.
 *
 * ⚠️ IT LIVES HERE ANYWAY. A component picking its own is how a balance in the
 * crown and a balance on the money screen come to sit differently, which is the
 * exact drift the rest of this file exists to prevent.
 */
export const GLYPH_GAP = "gap-[0.3em]" as const;

/**
 * ⚠️ A BLOCK'S OWN INSET. Absent from the first version of this file, which is
 * precisely why nine components invented one — and one of them chose `gap-4`, a
 * step that is not in the scale at all. A missing metric is not a smaller
 * problem than a wrong one: it guarantees everybody picks separately.
 */
export const PAD = "p-4" as const;

/**
 * ⚠️ AN EMPTY STATE IS GIVEN ROOM, BECAUSE ROOM IS WHAT IT IS MADE OF. At `PAD`
 * it is a short stack of centred text pinned to the top of whatever space it was
 * dropped into, which reads as content that failed to arrive. The height is what
 * turns it into a considered pause — and it is vertical only, because the words
 * take their own measure below.
 */
export const EMPTY_PAD = "px-6 py-14" as const;

/**
 * ⚠️ THE LINE UNDER IT IS NARROWER THAN THE SCREEN. A centred sentence set to a
 * phone's full width breaks into three ragged lines; held near forty characters
 * it breaks into two even ones, which is the difference between a caption and a
 * sentence somebody reads.
 */
export const EMPTY_READ = "max-w-[22rem]" as const;

/**
 * A CARD'S OWN INSET, AND IT IS THE SAME NUMBER A ROW USES.
 *
 * ⚠️ THE END CAP MUST EQUAL THE GAP BETWEEN ROWS, WHICH IS THE WHOLE
 * ARITHMETIC. Every row is `py-3`, so two adjacent rows put 24px between their
 * texts. A card that adds `py-3` puts 12 + 12 = 24 at each end too, and the
 * rhythm is one number from the first line to the last. `p-4` made the ends 28
 * against 24 in the middle, which is what "given room twice" looked like; the
 * fix for that was `py-0`, and it overshot into something worse.
 *
 * ⚠️ BECAUSE `py-0` ASSUMES EVERYTHING INSIDE IS A ROW, AND NOTHING ENFORCED
 * THAT. A card holding a paragraph, a `Choice` or a `Lookup` — three screens do
 * — had its first line 1–2px from the top edge and its last flush against the
 * bottom, on a card with a 24px corner radius, so the text ran into the curve.
 * Measured, not guessed: `Your data` was `T2`, `Dates and numbers` was `T1 B0`.
 * A padding that is correct only for one kind of child is a padding that is
 * wrong on the first screen that has another.
 *
 * ⚠️ HORIZONTAL PADDING IS THE CARD'S ALONE, because nothing else supplies it:
 * the rows are flush by design (see `ROW.flush`) so a separator lines up with
 * the labels rather than with the card.
 */
export const CARD_ROWS = "px-4 py-3" as const;

/**
 * WHAT A CARD DOES TO A CHILD THAT IS NOT A ROW.
 *
 * ⚠️ A CARD'S RHYTHM IS THE ROW'S, AND EVERY ROW BRINGS IT — so a `Choice`, a
 * `Lookup` or a paragraph dropped into one brought nothing and sat at half the
 * spacing of the rows beside it. On `Dates and numbers` that put two pickers
 * hard against each other with no air between the first one's control and the
 * second one's label, which is what "sticking together" looks like.
 *
 * ⚠️ SO THE CARD GIVES IT, RATHER THAN EVERY CALLER REMEMBERING TO. `data-row`
 * is stamped by the row components on their OUTERMOST element (the `Button`,
 * not the `span` inside it — the selector matches a direct child of the card,
 * so a marker one level in matches nothing). Anything without it gets exactly
 * what a row has, so the spacing between any two children of a card is one
 * number whatever they are.
 */
export const CARD_OTHERS = "[&>*:not([data-row])]:py-3" as const;

/** Between a section's heading and the card under it. */
export const HEAD_GAP = "gap-2" as const;

/**
 * THE PAGE GUTTER, AND THE ONLY ONE.
 *
 * ⚠️ `Band` APPLIES IT AND NOTHING ELSE MAY. It was applied three times over —
 * the shell's `main`, this, and HeroUI's own tab panel — so measured on one app
 * at 390px a card sat 40px from the edge on the settings screen and 16px on the
 * list beside it. Nothing failed; the screens simply did not line up, which is
 * the kind of fault nobody can point at and everybody feels.
 *
 * Wider on a desktop, because there the column is not the screen.
 */
export const GUTTER = "px-4 md:px-6" as const;

/**
 * ⚠️ A SNAPPING SCROLLER NEEDS THE GUTTER TWICE — ONCE AS PADDING AND ONCE AS
 * SCROLL PADDING — AND THE SECOND IS INVISIBLE UNTIL IT IS NOT THERE.
 * `snap-start` aligns an item to the scroller's BORDER edge, not its padding
 * box, so the browser scrolls the first card left by exactly the gutter and it
 * lands flush against the screen. Measured: `scrollLeft` of 16 on a rail whose
 * padding was 16.
 *
 * ⚠️ AND IT HID BEHIND THE DOUBLE PADDING FOR AS LONG AS THAT EXISTED — the
 * card ate one of the two gutters and still had one left, so it looked right.
 * Fixing the padding is what made this visible, which is the ordinary way a
 * second fault surfaces.
 */
export const SCROLL_GUTTER = "scroll-pl-4 md:scroll-pl-6" as const;

/** Above and below a band's content. */
/**
 * ⚠️ A DROP TARGET IS TALLER THAN A CARD, AND THAT IS THE POINT OF IT. It has to
 * read as somewhere to aim at from across the page while a file is under the
 * cursor — a control padded like a row is one a person misses and drops onto the
 * document behind, which navigates away to the file.
 */
export const DROP_PAD = "px-6 py-8" as const;

export const BAND_PAD = "py-6" as const;

/**
 * THE ROOM A HERO CLAIMS, AND IT IS MORE BELOW THAN A SECTION GETS.
 *
 * ⚠️ A HERO IS SEPARATED FROM THE PAGE BY MORE THAN IT USES INSIDE ITSELF, OR IT
 * IS THE PAGE'S FIRST ROW. It was `pt-6` and nothing below, on the argument that
 * a stack's own gap IS the spacing under a block — true, and it stopped being
 * enough the moment a hero grew a second part. A figure, a caption and a row of
 * quick actions separated from the first section by the same 24px the caption is
 * separated from the acts reads as four things in a list, and the one that is
 * supposed to be the answer to "why did I open this" is simply the top one.
 *
 * ⚠️ AND IT IS BELOW ONLY, BECAUSE THE CROWN ALREADY SETS THE TOP. Padding at
 * both ends is the doubling this file exists to prevent; what was missing was
 * never air above.
 *
 * ⚠️ BOTH NUMBERS ARE RUNGS OF `SPACE`, WHICH IS WHAT MAKES IT THE SAME SYSTEM.
 * `airy` at both ends — the same step a page's own stack uses, so a hero is
 * separated from the first section by the widest gap the product has plus that
 * stack's own, and the answer to "why this much" is a rung rather than a number
 * somebody liked. The BOTTOM matches `TITLE_PAD` exactly, because a title card
 * and a hero are the same block on two kinds of screen.
 *
 * ⚠️ AND THE TOP IS THE SAME RUNG RATHER THAN THE ONE BELOW IT, BECAUSE OF WHAT
 * IS ABOVE IT. A title card arrives under its own name; a hero arrives under the
 * crown, and the crown is a control on a veil rather than a line of type — so
 * the number lands against 64px of chrome and a hem, and a rung that reads as
 * air under a heading reads as a figure pushed up against the bar. Only the top
 * is free here: the ladder guard asks the two blocks agree BELOW, which is where
 * a difference would give the product a roomier home page than its own detail
 * pages.
 */
export const HERO_PAD = "pt-10 pb-10" as const;

/**
 * ⚠️ ONE THIRD DOWN, NOT HALF — the optical centre of a door screen. A sign-in
 * placed at true centre reads as low, because the eye puts the middle of a page
 * above its geometric one; the phone value and the desktop value differ because
 * a phone has a keyboard about to take the bottom third.
 */
export const DOOR_PAD = "pt-12 pb-[14vh] md:pt-[22vh] md:pb-12" as const;

/**
 * ⚠️ THE PULL THAT LETS A RAIL BLEED PAST ITS GUTTER, and it is the exact
 * negative of `GUTTER`. Written out it was a second copy of those numbers, so
 * changing the gutter moved every column on every screen except the scrolling
 * ones — which would have looked like a rail bug rather than a mismatched pair.
 */
export const BLEED_PULL = "-mx-4 md:-mx-6" as const;

/** ⚠️ The crown's own centred block — a wordmark and a line, on the door. */
export const CROWN_HERO_PAD = "px-4 py-6" as const;

/** ⚠️ A screen's name, when the crown has stood down and the Band carries it. */
export const SCREEN_TITLE_PAD = "pt-2 pb-4" as const;

/**
 * ⚠️ WHAT A SURFACE PRESENTING A WHOLE PAGE OWES IT: NOTHING ON THE AXIS THE
 * LIBRARY DID NOT PAY FOR ITSELF. A modal body is a paragraph's container, so it
 * carries three pixels of padding to keep a focus ring inside it from clipping,
 * and offsets that on the sides with `margin-inline: -3px` — free there, three
 * pixels at the top and bottom. What the frame puts in that slot is a `Page`: a
 * floor that paints its world edge to edge, hems the top of it and holds every
 * control in by its own gutter. A container's density around one of those is a
 * strip of the container's ground above a world that is supposed to start at the
 * top of the screen, and it reads as a hem that stops a few pixels short.
 *
 * ⚠️ THE BLOCK AXIS ONLY — `p-0` HERE IS A BUG, NOT A TIDIER VERSION. Removing
 * the inline padding leaves the negative inline margin behind, and the body
 * comes out six pixels wider than the dialog holding it.
 */
export const PRESENTED_PAD = "py-0" as const;

/**
 * ⚠️ AN OPTICAL NUDGE INSIDE ONE COMPONENT, NAMED RATHER THAN INLINE. Four
 * pixels under a face that leads a card, eight above a card's own footer, and
 * the run under a timeline entry. None is a rhythm anything else can see — but
 * a number nobody can name is one that drifts the first time somebody has a
 * reason, which is the whole argument of this file.
 */
export const NUDGE = {
  under: "pb-1", over: "pt-2", entry: "pb-6", body: "pb-2",
} as const;

/* -------------------------------------------------------------- the chrome --- */

/**
 * ⚠️ ROOM FOR THE NAV, RESERVED BY THE PAGE. A sticky island floats over
 * whatever precedes it, so the last card on every screen was cropped under the
 * nav — on both specimens, in the first render anybody looked at. The island
 * cannot fix this itself: by the time it is laid out, the content above it has
 * already been sized.
 *
 * ⚠️ AND IT IS THE NAV ALONE, BECAUSE NOTHING STACKS ON IT. A screen's act goes
 * INTO the bar (`Island.act`) rather than onto a second one above it — see
 * `Docked`, whose "never both" rule this is the other half of. This number was
 * briefly the whole stack, which is what a page reserves when there is a stack.
 *
 * ⚠️ AND IT CARRIES THE SAME SAFE AREA THE BAR DOES, OR IT IS SHORT BY EXACTLY
 * THAT MUCH. The bar's own bottom padding is `SAFE_BOTTOM`, which GROWS on a
 * phone with a gesture handle — so a reserve written as a flat number is correct
 * on a desktop, correct in every headless test (where the inset resolves to
 * zero), and too small on the devices the whole rule exists for. Measured: the
 * foot is 84px with no inset, and on a handset reporting 30 it is 102 against a
 * 96px reserve — the last row of the last card sitting under a pinned control at
 * the very bottom of the page, which is precisely the fault this token was
 * written to prevent. Two numbers that have to move together, so they name the
 * same thing.
 */
export const NAV_SPACE = "pb-[calc(7rem_+_env(safe-area-inset-bottom))]" as const;


/** The same problem, and the same safe area, for a pinned single action. */
export const ACTION_SPACE = "pb-[calc(6rem_+_env(safe-area-inset-bottom))]" as const;

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
