/**
 * THE ROUND FORMS, AND THE ARGUMENT FOR EACH OF THEM IS DIFFERENT.
 *
 * ⚠️ A CIRCLE IS A GOOD PICTURE OF A RATIO AND A BAD PICTURE OF A COMPARISON.
 * People read angle and area far worse than they read length — that is measured,
 * repeatedly, and it is why `charts.tsx` has no pie. Nothing here overturns it.
 * What it does is separate the two jobs a round chart is asked to do:
 *
 *   ONE ratio against its whole ......... `Ring` — nothing to compare, so the
 *                                          weakness never applies, and the shape
 *                                          says "out of a fixed total" better
 *                                          than a bar does.
 *   A FEW independent ratios ............ `Rings` — concentric, each its own
 *                                          number, never summed.
 *   Part-to-whole where the WHOLE is
 *   the subject ........................ `DonutChart`, hard-capped and always
 *                                          with its values printed.
 *   Part-to-whole over TIME or across
 *   categories ......................... NOT here. `StackedChart`, every time.
 *
 * ⚠️ SO THE DONUT IS ALLOWED AND FENCED, WHICH IS AN HONEST POSITION AND
 * "NEVER USE ONE" IS NOT. Five slices maximum, the rest folded into Other, a
 * legend carrying the actual numbers, and the total in the middle — because the
 * only question a donut answers well is "what is this made of, roughly", and
 * every slice a reader has to rank instead of recognise is a slice that should
 * have been a bar. Above five it stops being roughly.
 *
 * ⚠️ AND THE COMPOSITION BAR IS THE ONE TO REACH FOR FIRST. One horizontal bar
 * of the same data is more accurate to read, costs a fraction of the height, and
 * is what the reference product actually ships for its own "total assets". It is
 * in this file rather than beside the columns because it answers the donut's
 * question, and putting the alternative next to the temptation is the point.
 */

import * as React from "react";
import { CHART_TYPE, TYPE } from "../tokens/type.js";
import { SPACE } from "../tokens/metrics.js";
import { GRID, QUIET, assign, seriesColour } from "./palette.js";
import { arcPath, arcs, compact } from "./scale.js";
import { useFigures } from "../parts/said.js";

/* ⚠️ One coordinate space for every round chart — see `charts.tsx`'s `W`/`H`. */
const BOX = 120;
const MID = BOX / 2;

/**
 * ⚠️ THE STROKE IS A CONSTANT, NOT A PROPORTION OF THE RADIUS. A ring whose
 * thickness scales with its size is a ring that is a hairline in a tile and a
 * doughnut on a dashboard, so the same component reads as two different marks.
 */
const THICK = 10;

/**
 * ⚠️ A ROUND CHART HAS A CEILING AND THE RECTANGULAR ONES DO NOT, WHICH IS NOT AN
 * INCONSISTENCY. A 320×120 frame stretched to any width stays a chart; a 120×120
 * one stretched to a phone's full column becomes a 358px circle with a two-digit
 * number floating in an enormous hole — which is what it did. A ring is read at a
 * glance and never measured, so past about ten rem more pixels buy nothing and
 * cost the whole fold. Centred rather than left, because a circle in a box that
 * is wider than it reads as pushed to one side.
 */
const ROUND = "w-full max-w-40 self-center";

/* ⚠️ Redeclared rather than imported so this file draws nothing `charts.tsx`
   does not — the reveal is one class, defined once, in `CHART_MOTION`. */
const draw = { "data-draw": "true" } as const;

/* ------------------------------------------------------------------- ring --- */

/**
 * ONE RATIO, WITH THE NUMBER IN THE MIDDLE.
 *
 * ⚠️ THE CENTRE IS THE READING AND THE ARC IS THE CONTEXT, in that order. A ring
 * with no number in it makes somebody estimate an angle to recover a figure the
 * component already had — which is the whole reason a gauge on a dashboard is
 * usually worse than the text it replaced.
 *
 * ⚠️ AND IT NEVER EXCEEDS ITS TRACK. Past the limit the arc is full and the
 * colour carries the overrun, because a second lap around the circle is
 * indistinguishable from a first one.
 */
export function Ring({ label, value, limit, unit = "", suffix = "", severity = true, describes }: {
  readonly label: string;
  readonly value: number;
  readonly limit: number;
  /** ⚠️ Before the number — a currency. See `Meter` for why there are two. */
  readonly unit?: string;
  /** ⚠️ After it — every other unit of measure there is. */
  readonly suffix?: string;
  /** ⚠️ Off where "full" is the goal rather than the problem. */
  readonly severity?: boolean;
  readonly describes?: string;
}) {
  const say = useFigures();
  const t = limit > 0 ? Math.min(1, Math.max(0, value / limit)) : 0;
  const pct = Math.round(t * 100);
  /* ⚠️ THE TOKEN IS NAMED, NOT INHERITED. This first shipped stroking
     `var(--accent)` under a `data-tone` on the figure, on the assumption that
     the attribute remaps the accent — it does not, so a ring at 94% drew in the
     brand blue and the severity it had correctly computed reached nothing. The
     rest of the system names the token (`Meter` does), and so does this. */
  const tone = severity && t >= 0.95 ? "danger" : severity && t >= 0.8 ? "warning" : "data";
  const r = MID - THICK / 2;
  const reads = `${unit}${say.compact(value)}${suffix} of ${unit}${say.compact(limit)}${suffix}`;
  const name = describes ?? `${label}: ${reads}`;

  return (
    <figure className={`flex flex-col items-center ${SPACE.tight}`}>
      <svg
        viewBox={`0 0 ${BOX} ${BOX}`} className={ROUND} role="img"
        aria-label={name}
      >
        <title>{name}</title>
        {/* ⚠️ A FULL TRACK CIRCLE, NOT AN ARC. `arcPath` cannot close a loop —
            see its own note — and the track is the one mark here that genuinely
            is one. */}
        {/* ⚠️ THE TRACK IS A LIGHTER STEP OF THE FILL'S OWN RAMP, not a neutral
            grey — the same rule `Meter` follows. A ring turning red inside a
            grey track says "danger, somewhere"; one whose whole ring has shifted
            says it at a glance, without anybody measuring where the arc got to. */}
        <circle
          cx={MID} cy={MID} r={r} fill="none"
          stroke={`color-mix(in oklab, var(--${tone}) 18%, var(--surface))`}
          strokeWidth={THICK}
        />
        <path
          {...draw}
          d={arcPath(MID, MID, r, 0, t)}
          fill="none"
          stroke={`var(--${tone})`}
          strokeWidth={THICK}
          /* ⚠️ Rounded, because one arc has no neighbour to be confused with —
              the opposite of a donut segment, which must stay butt-ended so the
              gap between two slices is the separator and not a taper. */
          strokeLinecap="round"
        />
        <text
          x={MID} y={MID + 2} textAnchor="middle" dominantBaseline="middle"
          className={TYPE.figure} fill="currentColor" style={{ fontSize: CHART_TYPE.centre }}
        >
          {pct}
          <tspan className={TYPE.minor}>%</tspan>
        </text>
      </svg>
      <figcaption className={`flex flex-col items-center ${TYPE.note}`}>
        <span className={TYPE.label}>{label}</span>
        <span>{reads}</span>
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ rings --- */

const RINGS_MAX = 3;

/**
 * A FEW INDEPENDENT RATIOS, CONCENTRIC.
 *
 * ⚠️ THESE DO NOT SUM AND THE COMPONENT MUST NOT SUGGEST THEY DO. Three rings
 * are three separate questions — a budget, a quota, a target — sharing a centre
 * because they are read together, not because they are parts of anything. That
 * is why each one carries its own number below and there is no total.
 *
 * ⚠️ THREE, AND THE CAP IS THE WHOLE DESIGN. A fourth ring is 20px smaller than
 * the third and its arc subtends an angle nobody can compare with the first's;
 * at that point the picture is decoration over a list that would have been
 * easier to read. `Meter` stacked is the answer for four.
 */
export function Rings({ items, describes }: {
  readonly items: readonly {
    readonly id: string;
    readonly label: string;
    readonly value: number;
    readonly limit: number;
  }[];
  readonly describes: string;
}) {
  const say = useFigures();
  const shown = items.slice(0, RINGS_MAX);
  const dark = useDark();

  return (
    <figure className={`flex w-full flex-col ${SPACE.tight}`}>
      <svg viewBox={`0 0 ${BOX} ${BOX}`} className={ROUND} role="img" aria-label={describes}>
        <title>{describes}</title>
        {shown.map((item, i) => {
          /* ⚠️ Two pixels of air between rings, so a full one and the one inside
             it do not read as a single thicker band. */
          const r = MID - THICK / 2 - i * (THICK + 2);
          const t = item.limit > 0 ? Math.min(1, Math.max(0, item.value / item.limit)) : 0;
          return (
            <g key={item.id}>
              <circle cx={MID} cy={MID} r={r} fill="none" stroke={GRID} strokeWidth={THICK} />
              <path
                {...draw}
                d={arcPath(MID, MID, r, 0, t)}
                fill="none" stroke={seriesColour(i, dark)}
                strokeWidth={THICK} strokeLinecap="round"
              />
            </g>
          );
        })}
      </svg>
      <figcaption>
        <ul className={`flex flex-col ${SPACE.tight}`}>
          {shown.map((item, i) => (
            <li key={item.id} className={`flex items-center ${SPACE.tight} ${TYPE.note}`}>
              <span
                aria-hidden="true"
                className="inline-flex size-2 shrink-0 rounded-full"
                style={{ background: seriesColour(i, dark) }}
              />
              <span className="grow">{item.label}</span>
              <span className="tabular-nums">
                {say.compact(item.value)} / {say.compact(item.limit)}
              </span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ donut --- */

const SLICES_MAX = 5;

/**
 * PART-TO-WHOLE, WHERE THE WHOLE IS THE SUBJECT.
 *
 * ⚠️ FIVE SLICES AND THE REST IS `Other`, WHICH IS A FEATURE. The sixth slice is
 * where a donut stops being a shape somebody recognises and becomes a set of
 * angles they have to rank — and ranking angles is the thing people are worst
 * at. Folding is not data loss: the number is in the legend either way, and the
 * chart goes back to answering the question it is good at.
 *
 * ⚠️ THE LEGEND CARRIES THE VALUES, ALWAYS. A donut whose slices are only
 * labelled by colour asks a reader to match a hue to a key and then estimate an
 * angle, twice, to recover a number the component was given.
 */
export function DonutChart({ describes, data, unit = "", suffix = "", total: totalLabel }: {
  readonly describes: string;
  readonly data: readonly { readonly label: string; readonly value: number }[];
  /** ⚠️ Before the number — a currency. See `Ring` for why there are two. */
  readonly unit?: string;
  /** ⚠️ After it — every other unit of measure there is. */
  readonly suffix?: string;
  /** ⚠️ What the middle says. Defaults to the sum, which is usually right. */
  readonly total?: string;
}) {
  const say = useFigures();
  const dark = useDark();
  const shown = fold(data);
  const total = shown.reduce((a, d) => a + Math.max(0, d.value), 0);
  const segments = arcs(shown.map((d) => d.value));
  const colours = assign(shown.length, dark);
  const r = MID - THICK / 2;

  return (
    <figure className={`flex w-full flex-col ${SPACE.snug}`}>
      <svg viewBox={`0 0 ${BOX} ${BOX}`} className={ROUND} role="img" aria-label={describes}>
        <title>{describes}</title>
        {segments.map((s, i) => (
          <path
            {...draw}
            key={shown[i]!.label}
            d={arcPath(MID, MID, r, s.from, s.to)}
            fill="none" stroke={colours[i]} strokeWidth={THICK}
            /* ⚠️ BUTT ENDS, DELIBERATELY. A round cap on a segment adds half the
               stroke width to each end, which closes the gap the arc arithmetic
               carefully took out and makes two neighbours touch. */
            strokeLinecap="butt"
          />
        ))}
        <text
          x={MID} y={MID + 2} textAnchor="middle" dominantBaseline="middle"
          className={TYPE.figure} fill="currentColor" style={{ fontSize: CHART_TYPE.centre }}
        >
          {totalLabel ?? `${unit}${say.compact(total)}${suffix}`}
        </text>
      </svg>
      <figcaption>
        <ul className={`flex flex-col ${SPACE.tight}`}>
          {shown.map((d, i) => (
            <li key={d.label} className={`flex items-center ${SPACE.tight} ${TYPE.note}`}>
              <span
                aria-hidden="true"
                className="inline-flex size-2 shrink-0 rounded-full"
                style={{ background: colours[i] }}
              />
              <span className="grow">{d.label}</span>
              <span className="tabular-nums">{unit}{say.compact(d.value)}{suffix}</span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}

/**
 * ⚠️ THE FOLD IS BY SIZE, NOT BY POSITION. Keeping the first five in the order
 * they arrived would put whatever the caller happened to list last into `Other`
 * — so a chart's composition would change when somebody reordered an array, and
 * the biggest category could vanish into the fold.
 */
function fold(
  data: readonly { readonly label: string; readonly value: number }[],
): readonly { readonly label: string; readonly value: number }[] {
  if (data.length <= SLICES_MAX) return data;
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const keep = sorted.slice(0, SLICES_MAX - 1);
  const rest = sorted.slice(SLICES_MAX - 1).reduce((a, d) => a + d.value, 0);
  return [...keep, { label: "Other", value: rest }];
}

/* ------------------------------------------------------------ composition --- */

/**
 * ONE BAR, ONE HUNDRED PERCENT — the donut's question, answered more accurately.
 *
 * ⚠️ THIS IS THE DEFAULT AND THE DONUT IS THE EXCEPTION. Length is the encoding
 * people read best; it costs a fraction of the vertical space; it sits under a
 * headline figure without competing with it; and it degrades to a sensible shape
 * at any width. Every argument for the round version is about the picture, and
 * this one is about the reading.
 *
 * ⚠️ THE GAP IS THE SURFACE COLOUR, NOT A BORDER. Two touching fills need
 * separating, and drawing a line between them is data-weight ink that is not
 * data — the card's own colour does it and disappears.
 */
export function CompositionBar({ describes, data, unit = "", suffix = "" }: {
  readonly describes: string;
  readonly data: readonly { readonly label: string; readonly value: number }[];
  /** ⚠️ Before the number — a currency. See `Ring` for why there are two. */
  readonly unit?: string;
  /** ⚠️ After it — every other unit of measure there is. */
  readonly suffix?: string;
}) {
  const say = useFigures();
  const dark = useDark();
  const shown = fold(data);
  const total = shown.reduce((a, d) => a + Math.max(0, d.value), 0);
  const colours = assign(shown.length, dark);

  return (
    <figure className={`flex w-full flex-col ${SPACE.snug}`}>
      <div
        role="img" aria-label={describes}
        className="flex h-2 w-full overflow-hidden rounded-full"
        /* ⚠️ The track shows through wherever a segment is not, which is what
            makes an empty composition read as empty rather than as missing —
            and, at two pixels, it is also what separates one segment from the
            next. */
        style={{ background: GRID }}
      >
        {shown.map((d, i) => (
          <span
            {...draw}
            key={d.label}
            className="h-full"
            style={{
              width: total > 0 ? `${(Math.max(0, d.value) / total) * 100}%` : "0%",
              background: colours[i],
              /*
                ⚠️ A MARGIN, NOT A BORDER, AND THE DIFFERENCE IS NOT PEDANTRY.
                Two touching fills need separating and a 2px rule between them
                would do it — but a border is exactly the ink this whole design
                removed, and the first build of this reached for one INSIDE A
                STYLE OBJECT, where the guard that bans them was not looking. A
                margin lets the track show through, which is a gap rather than a
                line, and it is what the stacked columns already do.

                ⚠️ Not on the first, or the bar starts inset from its own edge.
              */
              marginInlineStart: i === 0 ? undefined : 2,
            }}
          />
        ))}
      </div>
      <figcaption>
        <ul className={`flex flex-wrap items-center ${SPACE.snug}`}>
          {shown.map((d, i) => (
            <li key={d.label} className={`flex items-center ${SPACE.tight} ${TYPE.note}`}>
              <span
                aria-hidden="true"
                className="inline-flex size-2 shrink-0 rounded-full"
                style={{ background: colours[i] }}
              />
              {d.label}
              {/* ⚠️ THE TEXT TOKEN, NOT THE CHART'S DE-EMPHASIS ONE. `QUIET` is
                  26% of the foreground and it is for a MARK — a dot-plot's
                  connector, a series that is not the subject — where being
                  barely there is the whole job. On a number somebody reads it
                  measured 2.31:1 in dark and 1.75 in light, which is the value
                  in a legend being the least legible thing on the panel. A
                  quiet number is `TYPE.note`'s ink; a quiet mark is `QUIET`. */}
              <span className={`tabular-nums ${TYPE.note}`}>
                {unit}{say.compact(d.value)}{suffix}
              </span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ theme --- */

/** ⚠️ The same hook `charts.tsx` has, and for the same reason — the categorical
    hexes are fixed per mode, so a component has to know which set it is in. */
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
