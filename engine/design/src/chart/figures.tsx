/**
 * WHEN THE FORM IS A NUMBER RATHER THAN A CHART.
 *
 * ⚠️ THE MOST COMMON CHART MISTAKE IS DRAWING ONE AT ALL. A single current value
 * is a stat tile, not a one-bar bar chart. A handful of headline numbers is a row
 * of tiles, not a grouped bar chart. A ratio against a limit is a meter, not a
 * pie of two slices. Each of those substitutions costs the reader a decode step
 * to learn something they could have read.
 *
 * ⚠️ SO THESE COME FIRST IN THE VOCABULARY, and a chart is what you reach for
 * when the shape of the change is the point rather than the number.
 */

import * as React from "react";
import { TYPE } from "../tokens/type.js";
import { SPACE } from "../tokens/metrics.js";
import { Tally } from "../parts/tally.js";
import { Sparkline } from "./charts.js";
import { type Point, compactLike } from "./scale.js";
import { useFigures, useShown } from "../parts/said.js";
import { Group } from "../parts/surfaces.js";

/* ------------------------------------------------------------------ delta --- */

/**
 * ⚠️ A DELTA'S COLOUR IS DIRECTION × WHETHER UP IS GOOD, WHICH IS TWO FACTS AND
 * NOT ONE. Spend went up is red; revenue went up is green; churn went down is
 * green. A component that paints every rise green is one that congratulates
 * somebody on their costs, and it is the single most common way a dashboard is
 * confidently wrong.
 *
 * ⚠️ AND IT CARRIES AN ARROW AS WELL AS A COLOUR. Status by hue alone fails the
 * readers this whole palette is chosen to protect.
 */
export function Delta({ value, of, upIsGood = true, unit = "" }: {
  readonly value: number;
  /** ⚠️ Named, always: "vs last month" — a delta against nothing is a number. */
  readonly of: string;
  readonly upIsGood?: boolean;
  readonly unit?: string;
}) {
  const say = useFigures();
  if (!value) return <span className={TYPE.note}>No change {of}</span>;
  const up = value > 0;
  const good = up === upIsGood;
  return (
    <span
      className={`inline-flex items-center ${SPACE.tight} ${TYPE.note}`}
      data-ink={good ? "success" : "danger"}
    >
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      {unit}{say.compact(Math.abs(value))}
      <span className="text-muted">{of}</span>
    </span>
  );
}

/* ------------------------------------------------------------------- stat --- */

/**
 * A LABEL, A VALUE, AN OPTIONAL DELTA AND AN OPTIONAL TWELVE-POINT TREND.
 *
 * ⚠️ THE VALUE USES PROPORTIONAL FIGURES, NOT TABULAR ONES. `tabular-nums` gives
 * every digit a zero's width, which is exactly right in a column and visibly
 * loose at display size — a standalone `121` set in tabular figures has a gap
 * either side of the ones. Tabular is for things that must align vertically.
 */
export function Stat({ label, value, unit = "", suffix = "", delta, trend, upIsGood = true }: {
  readonly label: string;
  readonly value: number | string;
  /** ⚠️ What goes BEFORE the number, which is a currency and nothing else. */
  readonly unit?: string;
  /**
   * ⚠️ AND WHAT GOES AFTER, WHICH IS EVERY OTHER UNIT THERE IS. `Meter` and
   * `Ring` were given this split and the two figures were not — so a stat
   * handed `unit="min"` rendered "min120", on the screen the whole chart
   * vocabulary is judged on. A component cannot tell a currency symbol from a
   * unit of measure by looking at the string, and guessing produces the same
   * fault in the other direction.
   */
  readonly suffix?: string;
  readonly delta?: { readonly value: number; readonly of: string };
  readonly trend?: readonly Point[];
  readonly upIsGood?: boolean;
}) {
  const say = useFigures();
  return (
    <div className={`flex flex-col ${SPACE.tight}`}>
      <span className={TYPE.note}>{label}</span>
      <span className={`flex items-baseline ${SPACE.tight}`}>
        <span className={TYPE.figure} style={{ fontVariantNumeric: "proportional-nums" }}>
          {unit}{typeof value === "number" ? say.compact(value) : value}{suffix}
        </span>
        {delta ? <Delta value={delta.value} of={delta.of} upIsGood={upIsGood} unit={unit} /> : null}
      </span>
      {trend ? <Sparkline points={trend} /> : null}
    </div>
  );
}

/**
 * ⚠️ A ROW OF TILES, AND IT WRAPS RATHER THAN SCROLLS. A KPI row that scrolls
 * sideways hides the number somebody came for on a phone, and nothing tells them
 * it is there.
 */
export function StatRow({ children }: { readonly children: React.ReactNode }) {
  return (
    <div
      className={`grid ${SPACE.roomy}`}
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(8rem, 45%), 1fr))" }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------- hero --- */

/**
 * ⚠️ EXACTLY ONE PER VIEW, AND IT IS THE NUMBER THE SCREEN EXISTS FOR. Two heroes
 * is no hero — the eye has to choose, and whichever it picks was not the
 * decision anybody designed. It takes `display` from the type scale, which is
 * where the ≥ 48px rule already lives.
 */
export function Hero({ eyebrow, value, unit = "", suffix = "", delta, upIsGood = true, count = true }: {
  readonly eyebrow?: string;
  readonly value: number | string;
  /** ⚠️ Before the number — a currency. See `Stat` for why there are two. */
  readonly unit?: string;
  /** ⚠️ After it — every other unit of measure there is. */
  readonly suffix?: string;
  readonly delta?: { readonly value: number; readonly of: string };
  readonly upIsGood?: boolean;
  /**
   * ⚠️ ON BY DEFAULT HERE AND NOWHERE ELSE. A hero is BY DEFINITION the one
   * number a screen is about, which is the whole rule for when a count earns its
   * place — see `tally.tsx`. Turn it off for a value that is not really a
   * quantity: a version, a year, an account number that happens to be digits.
   */
  readonly count?: boolean;
}) {
  const shown = useShown();
  return (
    <div className={`flex flex-col items-center ${SPACE.tight} text-center`}>
      {eyebrow ? <span className={TYPE.note}>{eyebrow}</span> : null}
      <span className={TYPE.display}>
        {unit}
        {typeof value === "number"
          ? <Tally value={value} format={compactLike(shown, value)} count={count} />
          : value}
        {suffix}
      </span>
      {delta ? <Delta value={delta.value} of={delta.of} upIsGood={upIsGood} unit={unit} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ meter --- */

/**
 * A RATIO AGAINST A LIMIT — storage used, budget spent, seats taken.
 *
 * ⚠️ THE TRACK IS A LIGHTER STEP OF THE FILL'S OWN RAMP, NOT A GREY. Blue on
 * blue means the state reads across the whole bar rather than only where the
 * fill has got to, which is what lets somebody see "nearly full" without
 * measuring it against the end.
 *
 * ⚠️ AND THE FILL CARRIES SEVERITY. A meter that is the same colour at 40% and
 * at 99% is a meter that never told anybody anything.
 */
export function Meter({ label, value, limit, unit = "", suffix = "" }: {
  readonly label: string;
  readonly value: number;
  readonly limit: number;
  /** ⚠️ What goes BEFORE the number, which is a currency and nothing else. */
  readonly unit?: string;
  /**
   * ⚠️ AND WHAT GOES AFTER, WHICH IS EVERY OTHER UNIT THERE IS. One prop could
   * not carry both, and the one that existed was a prefix — so a meter given
   * `unit="GB"` read "GB12 of GB50". A component cannot tell a currency symbol
   * from a unit of measure by looking at the string, and guessing produces the
   * same fault in the other direction.
   */
  readonly suffix?: string;
}) {
  const say = useFigures();
  const share = limit > 0 ? Math.max(0, Math.min(1, value / limit)) : 0;
  /* ⚠️ `data`, NOT `accent` — a meter fill MEASURES, and the accent is
     monochrome now. See `DATA` in `palette.ts`. */
  const tone = share >= 0.9 ? "danger" : share >= 0.75 ? "warning" : "data";
  return (
    <div className={`flex w-full flex-col ${SPACE.tight}`}>
      <span className={`flex items-baseline justify-between ${SPACE.tight}`}>
        <span className={TYPE.label}>{label}</span>
        <span className={`${TYPE.note} tabular-nums`}>
          {unit}{say.compact(value)}{suffix} of {unit}{say.compact(limit)}{suffix}
        </span>
      </span>
      <span
        role="meter"
        aria-valuenow={value} aria-valuemin={0} aria-valuemax={limit} aria-label={label}
        className="flex h-2 w-full overflow-hidden rounded-full"
        style={{ background: `color-mix(in oklab, var(--${tone}) 18%, var(--surface))` }}
      >
        <span
          data-draw="true"
          className="flex h-full rounded-full"
          style={{ width: `${share * 100}%`, background: `var(--${tone})` }}
        />
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ panel --- */

/**
 * ⚠️ A CHART GOES IN A CARD LIKE ANYTHING ELSE, AND THAT CARD IS `Group`. This
 * said so in its own header while rendering a bare padded `<section>`, so on a
 * screen mixing the two — which every reports screen is — the cards sat on a
 * surface and the charts sat on the page's ground beside them, inset from the
 * gutter by padding with nothing under it. Its heading was a fourth rank BELOW
 * the card label's, so a chart read as a sub-item of the block above it.
 *
 * ⚠️ IT IS A THIN WRAPPER RATHER THAN A SECOND IMPLEMENTATION, so the inset, the
 * arrival, the nesting stand-down and the world all stay in one place — the
 * double padding a card and a chart both supply is the fault a chart is most
 * likely to repeat, because it arrives with a viewBox and looks like it should
 * own its own margins.
 */
export function ChartPanel({ label, under, aside, at, children }: {
  readonly label: string;
  readonly under?: string;
  /** A range picker, a filter, a delta — the far end of the heading row. */
  readonly aside?: React.ReactNode;
  /** ⚠️ Its place in a sequence of blocks — see `Group.at`. */
  readonly at?: number;
  readonly children: React.ReactNode;
}) {
  /* ⚠️ THE PANEL ARRIVES AND THE MARKS DRAW. Two animations on one card would be
     a jungle in miniature; they are sequenced instead — the card eases in on the
     library's `enter`, and `data-draw` reveals the marks inside it. */
  return (
    <Group label={label} under={under} aside={aside} at={at}>
      {children}
    </Group>
  );
}
