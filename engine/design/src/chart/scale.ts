/**
 * THE ARITHMETIC EVERY CHART SHARES, WITH NO DOM IN IT.
 *
 * ⚠️ A CHART IS TWO THINGS AND ONLY ONE OF THEM IS HARD. Drawing an SVG path is
 * trivial; deciding where the path goes — the domain, the nice ticks, the stack
 * offsets, the band positions — is where charts are wrong, and it is wrong
 * silently: a bar at the correct pixel for the wrong number looks exactly like a
 * bar at the correct pixel for the right one. So the deciding is pure functions
 * in this file, unit-tested, and the drawing is a component that does no
 * arithmetic at all.
 *
 * ⚠️ NO LIBRARY, AND THAT IS A DECISION RATHER THAN A CONSTRAINT. A charting
 * library is 40–150 KB on every cold load, brings its own idea of typography and
 * colour that a design system then has to fight, and renders through a canvas or
 * a virtual DOM that neither the theme tokens nor the reduced-motion setting
 * reach. Everything here is an SVG element with our own classes on it, so the
 * ambience, the palette and the motion vocabulary apply to a chart exactly as
 * they apply to a card.
 */

import { sayNumber, type Shown } from "@engine/kernel";

/** A closed numeric range. */
export interface Span { readonly min: number; readonly max: number }

/** One point of one series. `y` may be null — a gap is not a zero. */
export interface Point { readonly x: number; readonly y: number | null }

/**
 * ⚠️ A GAP IS NOT A ZERO, AND CONFLATING THEM IS THE MOST COMMON WAY A CHART
 * LIES. A sensor that reported nothing is not a sensor that reported nothing
 * happening; drawing a line down to the baseline and back invents an event. A
 * `null` breaks the path here and leaves the axis alone.
 */
export const isGap = (p: Point): boolean => p.y === null;

/* ------------------------------------------------------------------ domain --- */

/**
 * The extent of some values, with `0` included unless told otherwise.
 *
 * ⚠️ A BAR CHART THAT DOES NOT START AT ZERO EXAGGERATES EVERY DIFFERENCE IN IT,
 * because the reader compares LENGTHS and the lengths are then measuring the
 * wrong thing. So zero is in the domain by default and leaving it out is a
 * decision the caller makes explicitly — which is right for a line, where the
 * reader compares SLOPE and a forced zero can flatten the whole story.
 */
export function extent(values: readonly (number | null)[], zero = true): Span {
  const real = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (!real.length) return { min: 0, max: 1 };
  let min = Math.min(...real);
  let max = Math.max(...real);
  if (zero) { min = Math.min(min, 0); max = Math.max(max, 0); }
  /* A flat series still needs a band to sit in, or every point lands on one row. */
  if (min === max) { min -= 1; max += 1; }
  return { min, max };
}

/** Where a value sits in a span, 0…1. */
export const norm = (v: number, s: Span): number =>
  s.max === s.min ? 0 : (v - s.min) / (s.max - s.min);

/* ------------------------------------------------------------------- ticks --- */

/**
 * ⚠️ ROUND NUMBERS, NOT EVENLY SPACED ONES. Dividing a domain into five equal
 * parts gives ticks like 1,237 and 2,474, which nobody can use to read a value
 * off the chart — the axis exists to carry the numbers that were not directly
 * labelled, and it can only do that if its numbers are ones a person holds in
 * their head. 1 / 2 / 5 × a power of ten is the whole rule.
 */
export function ticks(s: Span, count = 4): readonly number[] {
  const raw = (s.max - s.min) / Math.max(1, count);
  if (!Number.isFinite(raw) || raw <= 0) return [s.min];

  /*
    ⚠️ THE NEAREST NICE STEP, NOT THE FIRST ONE BIG ENOUGH. Taking the first of
    1/2/5/10 that exceeds the raw interval always rounds UP, so a domain of
    0–1000 asked for four intervals came back with two: raw 250 jumps straight to
    500. Choosing by which boundary the error is nearer gives 200 and five
    intervals — an axis with the density that was asked for. The thresholds are
    the geometric means of the neighbouring steps, which is what "nearer" means
    on a log scale.
  */
  const power = 10 ** Math.floor(Math.log10(raw));
  const error = raw / power;
  const step = power * (error >= Math.SQRT2 * 5 ? 10 : error >= Math.SQRT2 * 2 ? 5 : error >= Math.SQRT2 ? 2 : 1);

  /*
    ⚠️ COUNTED FROM THE START RATHER THAN ACCUMULATED, AND ROUNDED BY THE STEP'S
    OWN PRECISION. Adding a step repeatedly accumulates error, and the obvious
    correction — `Math.round(t / step) * step` — reintroduces it on the way back:
    3 × 0.1 is 0.30000000000000004 whichever direction you compute it from. The
    axis then reads `0.30000000000000004`, which is a chart that looks broken
    because it is printing the truth about binary fractions.
  */
  const places = Math.max(0, -Math.floor(Math.log10(step)));
  const first = Math.ceil(s.min / step);
  const last = Math.floor((s.max + step / 1e6) / step);
  const out: number[] = [];
  for (let i = first; i <= last; i++) out.push(Number((i * step).toFixed(places)));
  return out.length ? out : [s.min];
}

/* -------------------------------------------------------------------- band --- */

/**
 * One slot of a categorical axis: where it starts and how wide the mark may be.
 *
 * ⚠️ THE MARK IS CAPPED AND THE LEFTOVER IS AIR. A bar that fills its whole slot
 * makes a chart of six categories read as a solid block with lines in it; the
 * cap is what keeps the marks reading as separate things. 24px is the ceiling
 * from the mark spec, and on a crowded axis the slot is narrower than that and
 * wins.
 */
export function band(width: number, count: number, cap = 24, pad = 0.3): {
  readonly step: number; readonly thick: number; readonly offset: number;
} {
  const step = count > 0 ? width / count : width;
  const thick = Math.min(cap, step * (1 - pad));
  return { step, thick, offset: (step - thick) / 2 };
}

/* -------------------------------------------------------------------- path --- */

/** A point placed in a box, in SVG user units with y already flipped. */
export interface Placed { readonly x: number; readonly y: number }

/**
 * ⚠️ THE `y` FLIP HAPPENS ONCE, HERE. SVG's origin is top-left and every chart's
 * is bottom-left, so somewhere a `h - y` has to happen. Doing it in each
 * component is how one chart ends up upside down.
 */
export function place(
  points: readonly Point[], x: Span, y: Span, w: number, h: number,
): readonly (Placed | null)[] {
  return points.map((p) => (p.y === null
    ? null
    : { x: norm(p.x, x) * w, y: h - norm(p.y, y) * h }));
}

/**
 * A polyline through placed points, broken at every gap.
 *
 * ⚠️ `M` AFTER A GAP, NOT `L`. Continuing the path across a null draws a straight
 * line over the missing days as though the value had been interpolated, which is
 * a claim about data nobody has.
 */
export function linePath(placed: readonly (Placed | null)[]): string {
  let out = "";
  let pen = false;
  for (const p of placed) {
    if (!p) { pen = false; continue; }
    out += `${pen ? "L" : "M"}${p.x.toFixed(2)} ${p.y.toFixed(2)} `;
    pen = true;
  }
  return out.trim();
}

/** The same line, closed down to a baseline, for an area fill. */
export function areaPath(placed: readonly (Placed | null)[], base: number): string {
  const runs: Placed[][] = [];
  let run: Placed[] = [];
  for (const p of placed) {
    if (!p) { if (run.length) runs.push(run); run = []; continue; }
    run.push(p);
  }
  if (run.length) runs.push(run);

  return runs.map((r) => {
    const head = r.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
    const last = r[r.length - 1]!;
    return `${head} L${last.x.toFixed(2)} ${base.toFixed(2)} L${r[0]!.x.toFixed(2)} ${base.toFixed(2)} Z`;
  }).join(" ");
}

/**
 * A BAR, ROUNDED AT THE DATA END AND SQUARE AT THE BASELINE.
 *
 * ⚠️ `rx` ON A `<rect>` ROUNDS ALL FOUR CORNERS, WHICH IS THE WRONG SHAPE AND
 * READS AS ONE. A bar rounded at both ends floats: it has no origin, so the eye
 * stops treating its base as the zero line and starts comparing the middles.
 * The spec is a rounded data end and a square baseline, and that is a path
 * rather than a rectangle.
 *
 * ⚠️ AND THE RADIUS IS CLAMPED TO HALF THE SHORT SIDE, or a bar shorter than the
 * radius comes out as a lozenge that is taller than its value.
 */
export function barPath(
  x: number, y: number, w: number, h: number, r = 4, up = true,
): string {
  const k = Math.max(0, Math.min(r, w / 2, h));
  return up
    ? `M${x} ${y + h} L${x} ${y + k} Q${x} ${y} ${x + k} ${y} `
      + `L${x + w - k} ${y} Q${x + w} ${y} ${x + w} ${y + k} L${x + w} ${y + h} Z`
    : `M${x} ${y} L${x} ${y + h - k} Q${x} ${y + h} ${x + k} ${y + h} `
      + `L${x + w - k} ${y + h} Q${x + w} ${y + h} ${x + w} ${y + h - k} L${x + w} ${y} Z`;
}

/** The same, lying down: rounded at the tip, square at the axis. */
export function barPathX(x: number, y: number, w: number, h: number, r = 4): string {
  const k = Math.max(0, Math.min(r, h / 2, w));
  return `M${x} ${y} L${x + w - k} ${y} Q${x + w} ${y} ${x + w} ${y + k} `
    + `L${x + w} ${y + h - k} Q${x + w} ${y + h} ${x + w - k} ${y + h} L${x} ${y + h} Z`;
}

/* --------------------------------------------------------------------- arcs --- */

/**
 * ⚠️ TWELVE O'CLOCK IS ZERO AND CLOCKWISE IS FORWARD. SVG's own angles start at
 * three o'clock and run the other way, so every circular chart that does its own
 * trigonometry starts a quarter turn out and mirrored — which does not look like
 * a bug, it looks like a design decision somebody made badly. It is corrected
 * once, here.
 */
export const polar = (cx: number, cy: number, r: number, turn: number): Placed => {
  const a = (turn - 0.25) * Math.PI * 2;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
};

/**
 * An arc as a stroked path, `from` and `to` in TURNS (0…1).
 *
 * ⚠️ A FULL CIRCLE CANNOT BE DRAWN AS ONE ARC, and this is the bug every hand-
 * rolled donut has. `A` interpolates between two points; when they are the same
 * point the renderer draws NOTHING, so a segment at 100% — the single most
 * likely value in any "one category is everything" dataset — vanishes entirely
 * and the chart reads as empty. The gap below is what keeps two distinct points.
 */
export function arcPath(
  cx: number, cy: number, r: number, from: number, to: number,
): string {
  const span = Math.min(Math.max(to - from, 0), 0.9999);
  if (span <= 0) return "";
  const a = polar(cx, cy, r, from);
  const b = polar(cx, cy, r, from + span);
  return `M${a.x} ${a.y} A${r} ${r} 0 ${span > 0.5 ? 1 : 0} 1 ${b.x} ${b.y}`;
}

/**
 * Values → arcs around the circle, each starting where the last ended.
 *
 * ⚠️ THE GAP IS TAKEN OUT OF EVERY SEGMENT, NOT ADDED BETWEEN THEM. Adding
 * pushes the total past a full turn, so the last slice overlaps the first and
 * the biggest category eats the smallest — silently, and only when the data
 * happens to be ordered that way. Taking it out keeps the sum exact.
 *
 * ⚠️ AND A SEGMENT NEVER SHRINKS BELOW THE GAP. A 0.2% slice with a 0.01-turn
 * gap either side would come out negative and disappear, which is the same lie
 * as rounding it to zero; it is drawn at the minimum instead, and the number
 * beside it is what carries the magnitude.
 */
export function arcs(values: readonly number[], gap = 0.006): readonly Segment[] {
  const total = values.reduce((a, v) => a + Math.max(0, v), 0);
  if (total <= 0) return values.map(() => ({ from: 0, to: 0 }));
  const shown = values.filter((v) => v > 0).length;
  const room = Math.max(0, 1 - gap * (shown > 1 ? shown : 0));
  let at = 0;
  return values.map((v) => {
    if (v <= 0) return { from: at, to: at };
    const span = Math.max((Math.max(0, v) / total) * room, gap);
    const seg = { from: at, to: at + span };
    at = seg.to + (shown > 1 ? gap : 0);
    return seg;
  });
}

/* ------------------------------------------------------------------- stack --- */

/** One stacked segment: where it starts and ends along the value axis. */
export interface Segment { readonly from: number; readonly to: number }

/**
 * ⚠️ STACKING IS A RUNNING TOTAL, AND NEGATIVE VALUES BREAK THE NAIVE ONE. A
 * segment that runs backwards over the one before it draws on top of it and the
 * chart quietly shows a smaller total than the data has. Each sign stacks on its
 * own side of the baseline, which is the only reading that stays true.
 */
export function stack(values: readonly number[]): readonly Segment[] {
  let up = 0;
  let down = 0;
  return values.map((v) => {
    if (v >= 0) { const from = up; up += v; return { from, to: up }; }
    const from = down; down += v; return { from: down, to: from };
  });
}

/** The span a whole stack needs, across every row of it. */
export function stackSpan(rows: readonly (readonly number[])[]): Span {
  const totals = rows.flatMap((r) => {
    const s = stack(r);
    return s.length ? [Math.min(...s.map((x) => x.from)), Math.max(...s.map((x) => x.to))] : [0];
  });
  return extent(totals);
}

/* ------------------------------------------------------------------ format --- */

/**
 * ⚠️ A HEADLINE NUMBER IS COMPACTED AND A COLUMN OF NUMBERS IS NOT. `12.9K` is
 * what somebody reads at a glance; `12,914` is what they read when comparing it
 * with the row below. Getting this backwards makes a dashboard either unreadable
 * or unusable, and which one you want depends on the mark, not on the value.
 */
/**
 * ⚠️ THE SAME FORMAT ALL THE WAY UP, FOR A NUMBER THAT IS BEING COUNTED. `compact`
 * chooses its unit from the value in front of it, which is right for a static
 * figure and visibly wrong for a moving one: a count to 12,914 runs `2,292` →
 * `9,554` → `12.7K`, changing NOTATION a third of the way through. The eye reads
 * that as a glitch rather than as a scale. Given the value it is heading for,
 * every step is written the way the destination will be.
 */
export const compactLike = (shown: Shown, destination: number) => (v: number): string => {
  const scale = Math.abs(destination);
  if (scale < 1e4) return compact(shown, v);
  const [at, suffix] = scale >= 1e9 ? [1e9, "B"] : scale >= 1e6 ? [1e6, "M"] : [1e3, "K"] as const;
  const n = v / at;
  /* ⚠️ Not `shown` — that is the reader now, and shadowing it here is what
     made the fallback above compact against a locale rather than a number. */
  const said = Math.abs(n) < 100 ? n.toFixed(1).replace(/\.0$/, "") : String(Math.round(n));
  return `${said}${suffix}`;
};

export function compact(shown: Shown, v: number): string {
  const abs = Math.abs(v);
  /*
    ⚠️ FOUR FIGURES ARE GROUPED, NOT COMPACTED. `1,284` is a number somebody
    reads; `1.3K` is the same number with information thrown away for no space
    saved — they are the same width. Compacting starts where grouping stops
    helping, which is five figures.
  */
  /* ⚠️ THE READER'S SEPARATOR, NOT THE BROWSER'S — see `present.ts`. An axis
     reading `1,284` to somebody who writes `1.284` is off by three orders of
     magnitude, and an axis is exactly where nobody checks. */
  if (abs < 1e4) return sayNumber(shown, v, Number.isInteger(v) ? undefined : 1);

  const unit = [[1e9, "B"], [1e6, "M"], [1e3, "K"]] as const;
  for (const [at, suffix] of unit) {
    if (abs >= at) {
      const n = v / at;
      /* ⚠️ One decimal while it still carries a digit of information: 12.9K
         distinguishes 12,914 from 12,400, while 121.4K over 121K does not — and
         a trailing `.0` carries none at all, so `25.0K` is `25K`. */
      const shown = Math.abs(n) < 100 ? n.toFixed(1).replace(/\.0$/, "") : String(Math.round(n));
      return `${shown}${suffix}`;
    }
  }
  return String(v);
}

/** Thousands-separated, for an axis tick or a table cell. */
export const grouped = (shown: Shown, v: number): string => sayNumber(shown, v);
