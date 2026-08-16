/**
 * THE CHART FORMS — inline SVG, one per job, and a closed set.
 *
 * ⚠️ NINE FORMS, AND THE NUMBER IS THE POINT. A library with forty chart types is
 * a library where nobody can tell you which one to use, so everybody picks the
 * one they saw last. Each of these answers a question the reader has — how much,
 * which, over what time, which side of a line, before and after — and a tenth is
 * a decision somebody makes in review, having failed to fit the data into nine.
 *
 * ⚠️ WHAT IS DELIBERATELY MISSING: a pie and a donut. Part-to-whole is a stacked
 * bar here, because a reader compares angles far worse than lengths and a pie of
 * two slices is a sentence written as a picture. Also missing: a second y-axis.
 * Two measures at different scales are two charts, small multiples, or both
 * indexed to a common base — a dual axis lets whoever drew it choose where the
 * lines cross, which is the single most misleading thing a chart can do. Neither
 * is an omission to fill in later; the API has no place to put them.
 *
 * ⚠️ EVERY FORM TAKES ITS ARITHMETIC FROM `scale.ts` AND DOES NONE ITSELF. A bar
 * at the correct pixel for the wrong number looks exactly like a bar at the
 * correct pixel for the right one, so the deciding is pure and tested and the
 * drawing is this file.
 */

import * as React from "react";
import { TYPE } from "../tokens/type.js";
import { SPACE } from "../tokens/metrics.js";
import { MOTION } from "../tokens/motion.js";
import {
  AXIS, DATA, GRID, QUIET, SEPARATOR, assign, emphasis, magnitude, polarity, pole, seriesColour,
} from "./palette.js";
import {
  type Point, type Span, areaPath, band, barPath, barPathX, compact, extent, grouped,
  linePath, norm, place, stack, stackSpan, ticks,
} from "./scale.js";

/* ------------------------------------------------------------------ frame --- */

/**
 * ⚠️ ONE VIEWBOX FOR EVERY CHART, AND THE CALLER NEVER SEES A PIXEL. Charts are
 * drawn in a fixed coordinate space and scaled by CSS, so the same component is
 * right in a card, in a tile and at full width without anybody passing a size —
 * and a chart cannot end up at a different aspect on one screen because somebody
 * measured a container.
 */
const W = 320;
const H = 120;
const PAD = { top: 8, right: 8, bottom: 18, left: 30 };
const PLOT = { w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom };

export interface Series {
  readonly id: string;
  readonly label: string;
  readonly points: readonly Point[];
  /** ⚠️ Emphasis: one series is the story and the rest are context. */
  readonly subject?: boolean;
}

interface FrameProps {
  readonly describes: string;
  readonly y?: Span;
  readonly rules?: boolean;
  readonly children: React.ReactNode;
  readonly under?: React.ReactNode;
}

/**
 * ⚠️ THE NAME IS ON THE `<svg>` AND NOT ONLY ABOVE IT. A chart with no
 * accessible name is an image with no alt text to anybody not looking at it, and
 * a `<title>` child is the one thing every screen reader reads for an SVG.
 *
 * ⚠️ AND THE PROP IS `describes` RATHER THAN `title`, BECAUSE THE PROP NAME IS
 * THE VOICE (D8). "Spend by day, this month against the forecast" is exactly
 * right read aloud and would be a terrible screen title; calling it `title` held
 * it to the four-word noun phrase a back button needs, which would have cost the
 * sentence the only reader who ever hears it.
 */
function Frame({ describes, y, rules = true, children, under }: FrameProps) {
  return (
    <figure className={`flex w-full flex-col ${SPACE.tight}`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={describes}>
        <title>{describes}</title>
        {rules && y ? (
          <g>
            {ticks(y).map((t) => {
              const at = PAD.top + PLOT.h - norm(t, y) * PLOT.h;
              return (
                <g key={t}>
                  {/* ⚠️ Hairline, SOLID, one step off the surface. A dashed grid
                      is a second kind of line on a chart whose subject is lines. */}
                  <line
                    x1={PAD.left} x2={W - PAD.right} y1={at} y2={at}
                    stroke={t === 0 ? AXIS : GRID} strokeWidth={1}
                  />
                  <text
                    x={PAD.left - 6} y={at + 3} textAnchor="end"
                    className={TYPE.note} fill="currentColor"
                    style={{ fontSize: 8 }}
                  >
                    {compact(t)}
                  </text>
                </g>
              );
            })}
          </g>
        ) : null}
        <g transform={`translate(${PAD.left} ${PAD.top})`}>{children}</g>
      </svg>
      {under}
    </figure>
  );
}

/**
 * ⚠️ A LEGEND IS ALWAYS PRESENT FOR TWO OR MORE SERIES AND NEVER FOR ONE. With
 * two it is the dependable identity channel — colour-matching alone fails for
 * the readers this palette is chosen to protect. With one it restates the description
 * and spends a line saying nothing.
 */
function Legend({ series, dark, emphasised }: {
  readonly series: readonly Series[];
  readonly dark: boolean;
  /** ⚠️ Whether the CHART is in emphasis mode — see below. */
  readonly emphasised?: boolean;
}) {
  if (series.length < 2) return null;
  return (
    <ul className={`flex flex-wrap items-center ${SPACE.snug}`}>
      {series.map((s, i) => (
        <li key={s.id} className={`flex items-center ${SPACE.tight} ${TYPE.note}`}>
          {/* ⚠️ THE SWATCH CARRIES THE COLOUR AND THE TEXT DOES NOT. A light hue
              is illegible as text; identity comes from the mark beside it. */}
          {/*
            ⚠️ THE SWATCH IS THE COLOUR THE CHART ACTUALLY DREW, which sounds
            obvious and was not true: in emphasis mode the non-subject series are
            drawn in the de-emphasis grey while the legend was painting them from
            the categorical slots. A forecast line drawn grey with an ORANGE key
            beside it is the exact failure a legend exists to prevent — the one
            dependable identity channel disagreeing with the marks.
          */}
          <span
            aria-hidden="true"
            className="inline-flex size-2 shrink-0 rounded-full"
            style={{ background: emphasised ? emphasis(!!s.subject) : seriesColour(i, dark) }}
          />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * ⚠️ ONE HOOK FOR THE THEME, BECAUSE THE PALETTE IS SELECTED PER MODE. Charts are
 * the one place a token cannot do the work: the categorical hexes are fixed, so
 * the component has to know which set it is in.
 */
function useDark(): boolean {
  const [dark, setDark] = React.useState(
    () => typeof document !== "undefined"
      && document.documentElement.getAttribute("data-theme") === "dark",
  );
  React.useEffect(() => {
    const root = document.documentElement;
    const read = () => setDark(root.getAttribute("data-theme") === "dark");
    read();
    const watch = new MutationObserver(read);
    watch.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => watch.disconnect();
  }, []);
  return dark;
}

/**
 * ⚠️ THE DRAW-ON ANIMATION IS A CLASS, NOT A LIBRARY, AND IT STANDS DOWN. Every
 * mark below carries `data-draw`, which the stylesheet turns into a short reveal
 * — and turns off entirely under `prefers-reduced-motion`. A chart that animates
 * through a JS tween cannot be switched off by the setting, which is the whole
 * reason no chart here is drawn by one.
 */
const draw = { "data-draw": "true" } as const;

/* ------------------------------------------------------------------- line --- */

/**
 * TREND OVER TIME, ONE SERIES OR SEVERAL.
 *
 * ⚠️ THE DOMAIN DOES NOT INCLUDE ZERO BY DEFAULT. A reader compares SLOPE on a
 * line, and forcing the baseline flattens a real movement into a straight line
 * near the top of the box — the opposite of the bar rule, and for the opposite
 * reason.
 */
export function LineChart({ describes, series, zero = false }: {
  readonly describes: string;
  readonly series: readonly Series[];
  readonly zero?: boolean;
}) {
  const dark = useDark();
  const all = series.flatMap((s) => s.points.map((p) => p.y));
  const y = extent(all, zero);
  const x = extent(series[0]?.points.map((p) => p.x) ?? [0], false);
  const some = series.some((s) => s.subject);

  return (
    <Frame describes={describes} y={y} under={<Legend series={series} dark={dark} emphasised={some} />}>
      {series.map((s, i) => {
        const placed = place(s.points, x, y, PLOT.w, PLOT.h);
        const colour = some ? emphasis(!!s.subject) : seriesColour(i, dark);
        const last = [...placed].reverse().find(Boolean);
        return (
          <g key={s.id}>
            <path
              {...draw}
              d={linePath(placed)}
              fill="none" stroke={colour}
              strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
            />
            {/* ⚠️ THE END DOT CARRIES A 2px SURFACE RING so it stays legible
                where two series cross — a stroke around it would be ink that is
                not data. */}
            {last ? (
              <circle
                cx={last.x} cy={last.y} r={4}
                fill={colour} stroke={SEPARATOR} strokeWidth={2}
              />
            ) : null}
          </g>
        );
      })}
    </Frame>
  );
}

/* ------------------------------------------------------------------- area --- */

/** A single series over time, where the volume under it is part of the story. */
export function AreaChart({ describes, series, zero = true }: {
  readonly describes: string;
  readonly series: Series;
  readonly zero?: boolean;
}) {
  const y = extent(series.points.map((p) => p.y), zero);
  const x = extent(series.points.map((p) => p.x), false);
  const placed = place(series.points, x, y, PLOT.w, PLOT.h);
  const base = PLOT.h - norm(Math.max(0, y.min), y) * PLOT.h;

  return (
    <Frame describes={describes} y={y}>
      {/* ⚠️ A WASH AT TEN PERCENT, NEVER A SATURATED BLOCK. The fill says "this
          is the same series"; the line says where the value is. A solid area
          makes the line invisible and the axis unreadable behind it. */}
      <path {...draw} d={areaPath(placed, base)} fill={DATA} fillOpacity={0.1} stroke="none" />
      <path
        {...draw}
        d={linePath(placed)}
        fill="none" stroke={DATA}
        strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      />
    </Frame>
  );
}

/* --------------------------------------------------------------- columns --- */

export interface Datum { readonly label: string; readonly value: number }

/** MAGNITUDE ACROSS A FEW CATEGORIES, or a short run of time. */
export function ColumnChart({ describes, data, subject }: {
  readonly describes: string;
  readonly data: readonly Datum[];
  /** ⚠️ Emphasis by index: one column is the story, the rest are context. */
  readonly subject?: number;
}) {
  const y = extent(data.map((d) => d.value));
  const { step, thick, offset } = band(PLOT.w, data.length);
  const zero = PLOT.h - norm(0, y) * PLOT.h;

  return (
    <Frame describes={describes} y={y}>
      {data.map((d, i) => {
        const top = PLOT.h - norm(d.value, y) * PLOT.h;
        const h = Math.abs(zero - top);
        return (
          <g key={d.label}>
            {/* ⚠️ ROUNDED AT THE DATA END AND SQUARE AT THE BASELINE — a bar
                rounded at both ends reads as floating and loses its origin. The
                radius is clamped so a short bar is not a lozenge. */}
            <path
              {...draw}
              d={barPath(i * step + offset, Math.min(top, zero), thick, Math.max(1, h), 4, d.value >= 0)}
              fill={subject === undefined
                ? magnitude(0.35 + 0.65 * norm(d.value, y))
                : emphasis(i === subject)}
            />
            <text
              x={i * step + step / 2} y={PLOT.h + 12} textAnchor="middle"
              className={TYPE.note} fill="currentColor" style={{ fontSize: 8 }}
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </Frame>
  );
}

/* ------------------------------------------------------------------- bars --- */

/**
 * THE SAME JOB, TURNED SIDEWAYS, AND IT IS THE RIGHT DEFAULT MORE OFTEN.
 * Category names are words, and words are horizontal — a column chart with eight
 * categories either rotates its labels to 45° or truncates them, and both are
 * worse than turning the chart.
 */
export function BarChart({ describes, data, subject }: {
  readonly describes: string;
  readonly data: readonly Datum[];
  readonly subject?: number;
}) {
  const x = extent(data.map((d) => d.value));
  const { step, thick, offset } = band(H, data.length, 20);
  const rows = data.length * step;

  return (
    <figure className={`flex w-full flex-col ${SPACE.tight}`}>
      <svg viewBox={`0 0 ${W} ${Math.max(H, rows)}`} className="w-full" role="img" aria-label={describes}>
        <title>{describes}</title>
        {data.map((d, i) => {
          const w = norm(d.value, x) * (PLOT.w - 40);
          return (
            <g key={d.label}>
              <text
                x={0} y={i * step + step / 2 + 3}
                className={TYPE.note} fill="currentColor" style={{ fontSize: 9 }}
              >
                {d.label}
              </text>
              <path
                {...draw}
                d={barPathX(80, i * step + offset, Math.max(1, w), thick)}
                fill={subject === undefined
                  ? magnitude(0.35 + 0.65 * norm(d.value, x))
                  : emphasis(i === subject)}
              />
              {/* ⚠️ THE VALUE RIDES THE TIP, WHICH IS WHY THIS FORM NEEDS NO
                  AXIS. Direct labels before gridlines; gridlines before a second
                  axis — and here the first of those is enough. */}
              <text
                x={80 + Math.max(1, w) + 6} y={i * step + step / 2 + 3}
                className={TYPE.note} fill="currentColor" style={{ fontSize: 9 }}
              >
                {compact(d.value)}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/* ---------------------------------------------------------------- stacked --- */

/** PART-TO-WHOLE, which is what a pie would have been for. */
export function StackedChart({ describes, groups, series }: {
  readonly describes: string;
  readonly groups: readonly string[];
  readonly series: readonly { readonly id: string; readonly label: string; readonly values: readonly number[] }[];
}) {
  const dark = useDark();
  const rows = groups.map((_, g) => series.map((s) => s.values[g] ?? 0));
  const y = stackSpan(rows);
  const { step, thick, offset } = band(PLOT.w, groups.length);

  return (
    <Frame
      describes={describes} y={y}
      under={<Legend series={series.map((s) => ({ ...s, points: [] }))} dark={dark} />}
    >
      {groups.map((g, gi) => (
        <g key={g}>
          {stack(rows[gi]!).map((seg, si) => {
            const top = PLOT.h - norm(seg.to, y) * PLOT.h;
            const bottom = PLOT.h - norm(seg.from, y) * PLOT.h;
            /* ⚠️ A 2px GAP IN THE SURFACE COLOUR SEPARATES TOUCHING SEGMENTS,
               one consistent width down the stack. Neighbours read as distinct
               because of the gap, not because of a stroke around them. */
            const h = Math.max(1, bottom - top - 2);
            /* ⚠️ THE TOP SEGMENT IS THE DATA END, NOT THE FIRST ONE. Rounding
               `si === 0` rounds the segment sitting ON the baseline, which is
               precisely the end that must stay square. */
            const cap = si === rows[gi]!.length - 1;
            return (
              <path
                {...draw}
                key={si}
                d={cap
                  ? barPath(gi * step + offset, top, thick, h, 4, true)
                  : barPath(gi * step + offset, top, thick, h, 0, true)}
                fill={seriesColour(si, dark)}
              />
            );
          })}
          <text
            x={gi * step + step / 2} y={PLOT.h + 12} textAnchor="middle"
            className={TYPE.note} fill="currentColor" style={{ fontSize: 8 }}
          >
            {g}
          </text>
        </g>
      ))}
    </Frame>
  );
}

/* -------------------------------------------------------------- diverging --- */

/** WHICH SIDE OF A BASELINE — a change against a target, a gain or a loss. */
export function DivergingChart({ describes, data }: {
  readonly describes: string; readonly data: readonly Datum[];
}) {
  const y = extent(data.map((d) => d.value));
  const { step, thick, offset } = band(PLOT.w, data.length);
  const zero = PLOT.h - norm(0, y) * PLOT.h;

  return (
    <Frame describes={describes} y={y}>
      {data.map((d, i) => {
        const top = PLOT.h - norm(d.value, y) * PLOT.h;
        const h = Math.max(1, Math.abs(zero - top));
        return (
          <g key={d.label}>
            <path
              {...draw}
              d={barPath(i * step + offset, Math.min(top, zero), thick, h, 4, d.value >= 0)}
              fill={pole(d.value)}
            />
            <text
              x={i * step + step / 2} y={PLOT.h + 12} textAnchor="middle"
              className={TYPE.note} fill="currentColor" style={{ fontSize: 8 }}
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </Frame>
  );
}

/* --------------------------------------------------------------- dumbbell --- */

/** BEFORE AND AFTER, PER ITEM — one hue in two shades, never two hues. */
export function DumbbellChart({ describes, data }: {
  readonly describes: string;
  readonly data: readonly { readonly label: string; readonly from: number; readonly to: number }[];
}) {
  const x = extent(data.flatMap((d) => [d.from, d.to]));
  const { step } = band(H, data.length, 20);
  const rows = data.length * step;
  const at = (v: number) => 80 + norm(v, x) * (PLOT.w - 40);

  return (
    <figure className="flex w-full flex-col">
      <svg viewBox={`0 0 ${W} ${Math.max(H, rows)}`} className="w-full" role="img" aria-label={describes}>
        <title>{describes}</title>
        {data.map((d, i) => {
          const mid = i * step + step / 2;
          return (
            <g key={d.label}>
              <text x={0} y={mid + 3} className={TYPE.note} fill="currentColor" style={{ fontSize: 9 }}>
                {d.label}
              </text>
              <line
                {...draw}
                x1={at(d.from)} x2={at(d.to)} y1={mid} y2={mid}
                stroke={QUIET} strokeWidth={2} strokeLinecap="round"
              />
              <circle cx={at(d.from)} cy={mid} r={4} fill={QUIET} stroke={SEPARATOR} strokeWidth={2} />
              <circle cx={at(d.to)} cy={mid} r={4} fill={DATA} stroke={SEPARATOR} strokeWidth={2} />
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/* ---------------------------------------------------------------- heatmap --- */

/**
 * MAGNITUDE OVER A GRID — a week by an hour, a cohort by a month.
 *
 * ⚠️ `signed` IS THE ONE PLACE THE DIVERGING RAMP BELONGS. A cell has no length,
 * so colour is the only channel it has: here the mix toward neutral IS the
 * magnitude rather than a second copy of it, which is why a diverging bar gets a
 * flat pole and a diverging cell gets the ramp.
 */
export function HeatmapChart({ describes, rows, columns, values, signed = false }: {
  readonly describes: string;
  readonly rows: readonly string[];
  readonly columns: readonly string[];
  /** `values[row][column]`; `null` is missing, which is not zero. */
  readonly values: readonly (readonly (number | null)[])[];
  /** Values sit either side of zero — read the ramp from a neutral middle. */
  readonly signed?: boolean;
}) {
  const flat = values.flat();
  const span = extent(flat, true);
  const worst = Math.max(...flat.map((v) => Math.abs(v ?? 0)), 1);
  /*
    ⚠️ THE COLDEST CELL IS STILL A CELL, AND FOR A WHILE IT WAS NOT. Passing the
    raw 0…1 through the ramp put the lowest reading at 12% of the accent over the
    surface, which in dark is a rectangle nobody can see — so a quiet hour and an
    hour with no reading at all looked identical, and the one thing this grid is
    careful about (a hole is not a zero) was undone by the shading.
  */
  const shade = (v: number) => (signed
    ? polarity(v / worst)
    : magnitude(0.22 + 0.78 * norm(v, span)));
  const cw = (W - 40) / columns.length;
  const ch = 14;

  return (
    <figure className="flex w-full flex-col">
      <svg
        viewBox={`0 0 ${W} ${rows.length * ch + 16}`}
        className="w-full" role="img" aria-label={describes}
      >
        <title>{describes}</title>
        {rows.map((r, ri) => (
          <g key={r}>
            <text x={0} y={ri * ch + 10} className={TYPE.note} fill="currentColor" style={{ fontSize: 8 }}>
              {r}
            </text>
            {columns.map((c, ci) => {
              const v = values[ri]?.[ci] ?? null;
              return (
                <rect
                  {...draw}
                  key={c}
                  x={40 + ci * cw + 1} y={ri * ch + 1}
                  width={cw - 2} height={ch - 2} rx={2}
                  /* ⚠️ A MISSING CELL IS NOT A COLD ONE. Nothing is drawn where
                     there is no number, so the grid shows a hole rather than a
                     value somebody never recorded. */
                  fill={v === null ? "transparent" : shade(v)}
                />
              );
            })}
          </g>
        ))}
        {columns.map((c, ci) => (
          <text
            key={c} x={40 + ci * cw + cw / 2} y={rows.length * ch + 10}
            textAnchor="middle" className={TYPE.note} fill="currentColor" style={{ fontSize: 7 }}
          >
            {c}
          </text>
        ))}
      </svg>
    </figure>
  );
}

/* ---------------------------------------------------------------- scatter --- */

/**
 * TWO MEASURES AGAINST EACH OTHER.
 *
 * ⚠️ THIS FORM CAPS AT THREE SERIES AND THE CAP IS MEASURED, NOT CHOSEN. In a
 * scatter any two marks can end up side by side, so the palette has to clear the
 * checks across ALL pairs rather than adjacent ones — and only the first three
 * slots do. A fourth series here is folded into "Other" or the chart becomes
 * small multiples.
 */
export const SCATTER_MAX = 3;

export function ScatterChart({ describes, series }: {
  readonly describes: string;
  readonly series: readonly Series[];
}) {
  const dark = useDark();
  const shown = series.slice(0, SCATTER_MAX);
  const x = extent(shown.flatMap((s) => s.points.map((p) => p.x)));
  const y = extent(shown.flatMap((s) => s.points.map((p) => p.y)));

  return (
    <Frame describes={describes} y={y} under={<Legend series={shown} dark={dark} />}>
      {shown.map((s, i) => (
        <g key={s.id}>
          {s.points.map((p, pi) => (p.y === null ? null : (
            <circle
              {...draw}
              key={pi}
              cx={norm(p.x, x) * PLOT.w} cy={PLOT.h - norm(p.y, y) * PLOT.h}
              r={4} fill={seriesColour(i, dark)} stroke={SEPARATOR} strokeWidth={2}
            />
          )))}
        </g>
      ))}
    </Frame>
  );
}

/* -------------------------------------------------------------- sparkline --- */

/**
 * ⚠️ A SPARKLINE IS NOT A SMALL CHART — IT HAS NO AXIS, NO GRID AND NO TICKS, and
 * that is what makes it readable at 24px. It says "the shape of the last while";
 * the value beside it says how much. Adding either half of an axis to it makes
 * something illegible that was doing its job.
 */
export function Sparkline({ points, tone = "accent" }: {
  readonly points: readonly Point[];
  readonly tone?: "accent" | "quiet";
}) {
  const y = extent(points.map((p) => p.y), false);
  const x = extent(points.map((p) => p.x), false);
  const placed = place(points, x, y, 72, 20);
  const colour = tone === "quiet" ? QUIET : DATA;
  const last = [...placed].reverse().find(Boolean);

  return (
    <svg viewBox="0 0 76 24" className="h-6 w-[76px] shrink-0" aria-hidden="true">
      <g transform="translate(2 2)">
        <path
          {...draw}
          d={linePath(placed)} fill="none" stroke={colour}
          strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        />
        {last ? <circle cx={last.x} cy={last.y} r={2.5} fill={colour} /> : null}
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ table --- */

/**
 * ⚠️ EVERY CHART CAN BECOME A TABLE, AND THAT IS NOT A COURTESY. The light
 * palette carries a contrast warning on three of its eight slots, which the
 * method allows only where the values are readable another way; and a reader
 * using a screen reader gets nothing at all from an `<svg>`. One component,
 * offered beside any chart, closes both.
 */
export function ChartTable({ columns, rows }: {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly (string | number)[])[];
}) {
  return (
    <table className={`w-full ${TYPE.note}`}>
      <thead>
        <tr>{columns.map((c) => <th key={c} className="text-left">{c}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((cell, ci) => (
              /* ⚠️ `tabular-nums` HERE AND NOT ON A HEADLINE. A column of numbers
                 has to align; a large standalone figure set in tabular figures
                 looks loose, because every digit takes a zero's width. */
              <td key={ci} className={ci ? "text-right tabular-nums" : "text-left"}>
                {typeof cell === "number" ? grouped(cell) : cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * ⚠️ THE MOTION IS A STYLESHEET RULE SO THE SETTING CAN REACH IT. Every mark
 * carries `data-draw`; this is what that means, injected once beside the rest of
 * the shared chrome. A tween in JavaScript would animate identically and could
 * not be switched off by `prefers-reduced-motion`, which is the reason there is
 * no tween in this file.
 */
export const CHART_MOTION = [
  `@keyframes quad-draw { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }`,
  `[data-draw="true"] { animation: quad-draw var(--default-transition-duration) var(--ease-out-fluid) both; transform-origin: bottom; }`,
  `@media (prefers-reduced-motion: reduce) { [data-draw="true"] { animation: none; } }`,
  `[data-reduce-motion="true"] [data-draw="true"] { animation: none; }`,
].join("\n");

export { MOTION as CHART_TRANSITIONS, assign as chartColours };
