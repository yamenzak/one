/**
 * A CHART SAYS WHAT IT IS, WHERE SOMEBODY CAN SEE IT.
 *
 * ⚠️ `describes` LIVED IN `<title>` AND `aria-label` ALONE for the whole life of
 * the chart vocabulary — read aloud to anybody listening, invisible to everybody
 * looking. Every one of the nine forms drew an unlabelled plot, while the file's
 * own header called that sentence "the thing meant to be read first". A name a
 * sighted reader cannot see is not a name, it is a comment in the DOM, and the
 * kernel exempts a chart from `lists_unheaded` on the strength of it.
 *
 * ⚠️ AND THE FIRST FIX REACHED SIX OF NINE. `BarChart`, `DumbbellChart` and
 * `HeatmapChart` size their own viewBox to the row count, so they build their
 * `<figure>` by hand rather than through `Frame` — which is why the roll call
 * below is DERIVED from the source rather than typed here. A tenth form is asked
 * this question on the day it is written, or this file fails.
 */

import { readFileSync } from "node:fs";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import * as CHARTS from "../src/chart/charts.js";

/* ⚠️ EVERY EXPORTED FORM THAT TAKES A NAME, off the source. Anything else in the
   module — `Sparkline` has no name to draw, `ChartTable` is not a plot — is not
   this rule's business and says so by not matching. */
const TAKES_A_NAME = /export function ([A-Z]\w+)\(\{ describes[,\s}]/g;
const FORMS = [...readFileSync(new URL("../src/chart/charts.tsx", import.meta.url), "utf8")
  .matchAll(TAKES_A_NAME)].map((m) => m[1] as string);

const SAYS = "Spend by day, this month against the forecast";

const points = [{ x: 0, y: 3 }, { x: 1, y: 7 }, { x: 2, y: 5 }];
const series = [{ id: "a", label: "This month", points }];
const data = [{ label: "Gloves", value: 9 }, { label: "Paper", value: 4 }];

/**
 * ⚠️ ONE ENTRY PER FORM, AND THE ROLL CALL BELOW IS WHAT KEEPS IT HONEST. A
 * table of props somebody forgets to extend is a form that silently stops being
 * checked, which is the shape of the bug this whole file is about.
 */
const PROPS: Readonly<Record<string, Record<string, unknown>>> = {
  LineChart: { series },
  AreaChart: { series: series[0] },
  ColumnChart: { data },
  BarChart: { data },
  StackedChart: {
    groups: ["Mon", "Tue"],
    series: [{ id: "a", label: "Gloves", values: [2, 5] }],
  },
  DivergingChart: { data: [{ label: "Gloves", value: 3 }, { label: "Paper", value: -2 }] },
  DumbbellChart: { data: [{ label: "Gloves", from: 2, to: 9 }] },
  HeatmapChart: { rows: ["Mon"], columns: ["Bay 1", "Bay 2"], values: [[1, 4]] },
  ScatterChart: { series },
};

/*
  ⚠️ THROUGH `unknown`, BECAUSE THE MODULE'S OWN TYPE IS NINE DIFFERENT PROP
  SHAPES. The roll call above is what makes this safe: every name reaching here
  is an export of the file, and the props beside it are checked by the test
  failing rather than by the compiler.

  ⚠️ AND IT IS MOUNTED AS AN ELEMENT RATHER THAN CALLED AS A FUNCTION. Several
  forms read the theme through `useState`, and a component invoked directly has
  no dispatcher — the failure is "Cannot read properties of null", which reads as
  a broken chart rather than as a test calling React the wrong way round.
*/
const drawn = (form: string): string => {
  const Chart = (CHARTS as unknown as
    Record<string, ComponentType<Record<string, unknown>> | undefined>)[form];
  if (!Chart) throw new Error(`${form} is exported by the source and not by the module`);
  return renderToStaticMarkup(<Chart describes={SAYS} {...PROPS[form]} />);
};

/** ⚠️ The caption ONLY — never the `<title>` or the `aria-label`, which are what
    were there all along and are what made this look covered. */
const CAPTION = /<figcaption[^>]*>([^<]*)</;

describe("a chart's own name", () => {
  /*
    ⚠️ THE ROLL CALL, AND IT REFUSES RATHER THAN SKIPS. Reading the forms out of
    the source and then testing whichever happen to have props here would report
    green on a form nobody had thought about — a check that shrinks to fit is a
    check that agrees with every change made to it.
  */
  it("asks every form in the file, and no fewer", () => {
    expect(FORMS.length).toBeGreaterThan(8);
    expect([...FORMS].sort()).toEqual(Object.keys(PROPS).sort());
  });

  for (const form of FORMS) {
    it(`draws it on ${form}, not only in the accessibility tree`, () => {
      expect(CAPTION.exec(drawn(form))?.[1]).toBe(SAYS);
    });

    /* ⚠️ AND THE HALF THAT WAS ALREADY RIGHT IS STILL ASSERTED. Removing the
       `<title>` in favour of the caption would leave a plot with no accessible
       name at all, which is a worse fault and an invisible one. */
    it(`still announces it on ${form}`, () => {
      expect(drawn(form)).toContain(`<title>${SAYS}</title>`);
    });
  }
});
