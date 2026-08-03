/**
 * A MARK FOR A STUDIO THAT DOES NOT HAVE ONE.
 *
 * Most studios on a product like this are one person with a business name and
 * no design file. Until they have one the app shows an initial in a coloured
 * square, which is fine in the nav and useless everywhere it matters: the
 * browser tab, the installed home-screen icon, the top of every email their
 * clients receive. Those places take an image or they take the platform's.
 *
 * So this draws one from the two things a studio always has — its NAME and the
 * accent it already picked in the branding editor.
 *
 * ── PNG, not SVG ────────────────────────────────────────────────────────────
 *
 * SVG is the obvious output and the wrong one here. An SVG in an `<img>` is an
 * isolated document: it cannot see the page's fonts, so the mark would render
 * in whatever `system-ui` means on the viewer's device — a different mark per
 * visitor. Worse, the two destinations that most need this are the ones with
 * the least SVG support: Gmail strips SVG entirely, and iOS refuses SVG for an
 * Add-to-Home-Screen icon.
 *
 * Drawing to a canvas in the page solves all three. The app's own font is
 * already loaded, so the mark matches the product; the output is a real raster
 * every mail client and launcher accepts; and 512px is the size the manifest
 * wants for an install tile.
 */

/**
 * The letters to put in a square, guessed from a studio's name.
 *
 * A RECOMMENDATION, not a rule — the editor shows it in a field the owner can
 * overwrite, because a monogram is a branding decision and any algorithm will
 * be wrong for somebody.
 *
 * The rule that matters is preserving the owner's own capitalisation. A studio
 * called "byShujaa" wrote it that way on purpose, and a monogram of "BS" is
 * subtly not their brand where "bS" is. So the case is taken from the name and
 * never normalised — the one thing that would make every generated mark look
 * slightly wrong at once.
 */
export function monogramFor(name: string): string {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) return "";
  // Several words: the initial of the first two ("Iron Temple" → "IT").
  const words = clean.split(/[\s\-_/&]+/).filter(Boolean);
  if (words.length > 1) return (words[0]![0]! + words[1]![0]!).slice(0, 2);
  // One word with an internal capital, which is how most one-word brands mark
  // their own second syllable ("byShujaa" → "bS", "TrueForm" → "TF").
  const inner = /^(.)(?:.*?)([A-Z])/.exec(clean);
  if (inner) return inner[1]! + inner[2]!;
  // Otherwise the first two characters, as written.
  return clean.slice(0, 2);
}

/**
 * WHICH CHARACTERS OF A WORDMARK ARE NOT LIKE THE OTHERS.
 *
 * A name set in one weight and one colour is a caption, not a wordmark. What
 * makes a text logo read as a logo is almost always the same two moves: a piece
 * of it carries the brand colour, and a piece of it is quieter than the rest —
 * "by" small and grey against "Shujaa", a full stop in the accent.
 *
 * Expressed as COUNTS FROM EACH END rather than as a list of characters, and
 * that is the whole design decision. Per-character styling is more expressive
 * and breaks the moment the owner edits their name: the highlight silently
 * lands on the wrong letters, and nothing tells them. Head/tail counts survive
 * a rename, are four numbers instead of an array, and cover essentially every
 * text logo of this kind — the prefix, the suffix, the trailing punctuation.
 *
 * Every count is clamped to the name's length, so an over-long value styles
 * everything rather than throwing.
 */
export interface WordmarkStyle {
  /** Leading characters drawn in the accent colour. */
  accentHead?: number | null;
  /** Trailing characters drawn in the accent colour — the "byShujaa**.**" case. */
  accentTail?: number | null;
  /** Leading characters drawn quieter — the "**by**Shujaa" case. */
  softHead?: number | null;
  /** Trailing characters drawn quieter. */
  softTail?: number | null;
}

/** The generation inputs a studio keeps: the icon's letters and the two moves above. */
export interface MarkStyle extends WordmarkStyle {
  /** The letters a generated icon uses. Blank = derive from the name. */
  monogram?: string | null;
}

/** A stretch of the name that shares one colour and one weight. */
export interface MarkRun {
  text: string;
  /** Drawn in the accent colour rather than the foreground. */
  accent: boolean;
  /** Drawn quieter — lighter weight, slightly transparent. */
  soft: boolean;
}

/**
 * Cut a name into styled runs. PURE, and exported for that reason: the settings
 * screen previews the wordmark in live DOM before anything is drawn, and a
 * preview computed by different code from the output is a preview that lies.
 */
export function markRuns(text: string, style?: WordmarkStyle | null): MarkRun[] {
  // By CODE POINT, so an emoji or an accented character is one unit to the
  // person counting them and not two halves of a surrogate pair.
  const chars = [...text];
  const n = chars.length;
  if (!n) return [];
  const clamp = (v: number | null | undefined) => Math.max(0, Math.min(n, Math.trunc(v ?? 0)));
  const aHead = clamp(style?.accentHead);
  const aTail = clamp(style?.accentTail);
  const sHead = clamp(style?.softHead);
  const sTail = clamp(style?.softTail);
  const runs: MarkRun[] = [];
  chars.forEach((ch, i) => {
    const accent = i < aHead || i >= n - aTail;
    const soft = i < sHead || i >= n - sTail;
    const last = runs[runs.length - 1];
    if (last && last.accent === accent && last.soft === soft) last.text += ch;
    else runs.push({ text: ch, accent, soft });
  });
  return runs;
}

/** The two weights a run can take. Exported so the DOM preview matches the canvas. */
export const MARK_WEIGHT = { normal: 700, soft: 300 } as const;
/** How far a soft run is faded, on top of the lighter weight. */
export const MARK_SOFT_ALPHA = 0.7;

export interface MarkOptions {
  /** The letters (icon) or the studio name (wordmark). */
  text: string;
  /** The plate colour for an icon; ignored for a wordmark. Any CSS colour. */
  bg: string;
  /** The letterform colour. */
  fg: string;
  /** The colour for accented runs of a wordmark. Defaults to `fg`. */
  accent?: string;
  /** A wide transparent wordmark instead of a square plate. */
  wide?: boolean;
  /** Which characters are accented or quieted. Wordmark only — an icon is two
   *  letters on a coloured plate and has nothing to contrast against. */
  style?: WordmarkStyle | null;
  /** Square edge in px. The manifest's install tile is 512. */
  size?: number;
  /** Corner rounding as a fraction of the edge. iOS masks its own, and a
   *  22% radius is what reads as "app icon" under every launcher's mask. */
  radius?: number;
}

/**
 * Draw the mark and hand back a PNG file, ready for the normal asset upload.
 *
 * A File rather than a data URL: it goes through exactly the path an uploaded
 * logo takes, so it lands in the same media store with the same quota, the same
 * authed read and the same public URL — and every consumer (manifest, favicon,
 * email) sees an ordinary image with no special case anywhere.
 *
 * Returns null where there is no DOM, which is every server render and every
 * test that has not asked for one.
 */
export async function renderMarkPng(opts: MarkOptions): Promise<File | null> {
  if (typeof document === "undefined") return null;
  const size = opts.size ?? 512;
  const w = opts.wide ? size * 3 : size;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  if (!opts.wide) {
    const r = size * (opts.radius ?? 0.22);
    ctx.fillStyle = opts.bg;
    ctx.beginPath();
    // `roundRect` is everywhere we run (Safari 16+), but a mark is not worth a
    // hard failure — fall back to the square, which a launcher masks anyway.
    if (typeof ctx.roundRect === "function") ctx.roundRect(0, 0, size, size, r);
    else ctx.rect(0, 0, size, size);
    ctx.fill();
  }

  // The page's own font, which is the whole reason this is a canvas: the mark
  // has to be set in the product's typeface, not the viewer's guess at one.
  const family = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  const text = opts.text.trim();
  // An icon is one run by construction: two letters on a coloured plate, with
  // nothing for a second colour to contrast against.
  const runs = opts.wide ? markRuns(text, opts.style) : [{ text, accent: false, soft: false }];
  const fontFor = (run: MarkRun, px: number) => `${run.soft ? MARK_WEIGHT.soft : MARK_WEIGHT.normal} ${px}px ${family}`;
  // Measured run by run and summed. That loses the kerning pair across a run
  // boundary, which is unavoidable — two runs are two `fillText` calls — and
  // invisible at the one or two boundaries a wordmark of this kind has.
  const widthAt = (px: number) =>
    runs.reduce((sum, run) => {
      ctx.font = fontFor(run, px);
      return sum + ctx.measureText(run.text).width;
    }, 0);

  // Fit to the box rather than pick a size: two letters and a nine-character
  // name want very different type, and a wordmark that overflows its own canvas
  // is worse than no wordmark.
  const box = opts.wide ? w * 0.9 : size * 0.56;
  let px = opts.wide ? size * 0.55 : size * 0.42;
  const measured = widthAt(px);
  if (measured > box) px = px * (box / measured);
  const total = widthAt(px);

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  // A hair above centre: capital letters sit optically low when centred on the
  // em box, which is what makes a hand-made icon look settled and a generated
  // one look like it slipped.
  const baseline = size / 2 + px * 0.02;
  let x = (w - total) / 2;
  for (const run of runs) {
    ctx.font = fontFor(run, px);
    ctx.fillStyle = run.accent ? opts.accent || opts.fg : opts.fg;
    ctx.globalAlpha = run.soft ? MARK_SOFT_ALPHA : 1;
    ctx.fillText(run.text, x, baseline);
    x += ctx.measureText(run.text).width;
  }
  ctx.globalAlpha = 1;

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return null;
  return new File([blob], opts.wide ? "wordmark.png" : "icon.png", { type: "image/png" });
}
