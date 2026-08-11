/**
 * THE LOCKUP'S OWN RULES — how the mark is set with a word.
 *
 * ⚠️ IT LIVES WITH THE MARK RATHER THAN WITH A SCREEN. The relationship between
 * the four and the word beside it is a fact about the BRAND: the same spacing,
 * weight and footing wherever it appears. Left in a screen's stylesheet it would
 * be re-derived, slightly differently, by the second surface that needed it.
 */

export const MARK_CSS = `
/* ⚠️ ONE OBJECT, NOT A MARK WITH A CAPTION BESIDE IT. Everything below is in
   service of that: the same face as the mark's construction, the same weight as
   its strokes, a gap measured against its own stem rather than against a word
   space, and no second colour or opacity to tell the two halves apart. */
/* ⚠️ THE GAP IS A STEM, NOT A SPACE. At a word space the pair reads as two
   things that happen to be adjacent; at roughly the width of the mark's own
   stroke it reads as the spacing INSIDE a piece of lettering, which is what a
   lockup is. */
.lockup { display: inline-flex; align-items: center; gap: 0.26em; }
/* ⚠️ ALIGNED ON THE FOUR'S BASELINE, NOT ON THE BOX. The star hangs below the
   figure and the degree sits above it, so the mark's box is taller than the mark
   READS — centred by boxes, the four floats above the word it is set with. The
   nudge is the overhang, and it is what makes the two share a footing. */
.brand-mark { display: block; translate: 0 0.02em; }
/* ⚠️ THE SAME WEIGHT AS THE MARK'S STROKES, AND THE SAME INK. A lighter or
   greyed word is a caption; the mark and the name of the surface are one object
   here, so neither is allowed to be the quiet one. */
.lockup-word { font-family: var(--font-brand); font-weight: 600; letter-spacing: -0.035em; }
`.trim();
