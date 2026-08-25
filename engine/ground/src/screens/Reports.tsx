/**
 * REPORTS — where the chart vocabulary is judged.
 *
 * ⚠️ A FIGURE CANNOT BE JUDGED FROM A CATALOGUE, WHICH IS WHY THIS SCREEN
 * EXISTS. Rendered on its own a chart always looks fine: the series is tidy, the
 * axis fits, the number beside it is short. What a chart has to survive is a
 * real screen — a gap in the run, a period control in the panel's aside, a
 * headline figure that has to agree with the plot under it, a neighbour it
 * shares a row with, and a phone.
 *
 * ⚠️ EVERY FORM IS HERE AND EACH IS ON THE QUESTION IT IS FOR. That is the
 * discipline the sheet is testing: a bar for magnitude, a line for trend, a
 * diverging bar for which side of a target, a dumbbell for before and after, a
 * heatmap for a grid, a donut for parts of one whole. Putting them all on the
 * same numbers would look tidier and would prove nothing — the mistake this
 * catches is a form used for the wrong question, and that is only visible when
 * the question is real.
 *
 * ⚠️ AND THE PERIOD IS THE STATE THIS SCREEN OWNS. Choosing one reports both the
 * name and the dates it resolves to, so what filters the data is never a word
 * whose meaning each caller works out again.
 */

import * as React from "react";
import {
  Agenda, Arc, AreaChart, BarChart, ChartPanel, ChartTable, ChartWaiting, ColumnChart,
  CompositionBar, Delta, DivergingChart, DonutChart, DumbbellChart, Gauge, Grid,
  HeatmapChart, Hero, LineChart, Meter, PeriodInput, Reveal, Ring, Rings, Row,
  ScatterChart, Screen, Section, Segmented, Sparkline, Stack, StackedChart, Stat,
  StatRow, glyphOf, spanOf, type Dates, type Loaded, type PeriodId,
} from "@engine/design";
import {
  AGAINST_TARGET, BY_KIND, KIND_BY_WEEK, LENGTH_AGAINST_TIME, MONTH_ON_MONTH,
  LATELY, RECENT, WHEN, WRITTEN, type Reading,
} from "./sample.js";

/** What the top half is counting. Two words each — see `Segmented`. */
const LENS = [
  { id: "written", label: "Written" },
  { id: "read", label: "Read" },
] as const;

/** What a period's worth of reading is, once it has arrived. */
export interface Figures {
  readonly written: readonly Reading[];
  readonly read: readonly Reading[];
}

export function Reports({ title, of, again, today, period, onPeriod }: {
  /** ⚠️ The declared label — see `screens/index.tsx`. */
  readonly title?: string;
  readonly of: Loaded<Figures>;
  readonly again?: () => void;
  /** `YYYY-MM-DD`, passed in so what a period resolves to is a pure function. */
  readonly today: string;
  readonly period: PeriodId;
  readonly onPeriod: (id: PeriodId, dates: Dates) => void;
}) {
  const [lens, setLens] = React.useState<string>("written");
  const dates = spanOf(period, today);

  return (
    /* ⚠️ `board`, NOT `figure`. A figure screen is one number with support under
       it; this is a sheet of measures read side by side, which is what decides
       the width — charts at reading width are a column of postcards. */
    <Screen
      shape="board"
      title={title}
      of={of}
      again={again}
      isNothing={(f) => f.written.length === 0}
      nothing={{
        icon: glyphOf("chart"),
        says: "Nothing to report yet",
        under: "A week of notes is enough for the shape of a week to appear",
      }}
      /* ⚠️ THE SKELETON IS SHAPED LIKE A CHART, not like the tiles this shape
          usually holds. A plot's placeholder is a plot's proportions — a grid of
          tiles that becomes a line chart is a layout that jumps once the data
          arrives, on the screen where the jump is largest. */
      waiting={<ChartWaiting />}
      then={({ written, read }) => {
      const sum = (points: readonly Reading[]) => points.reduce((n, p) => n + (p.y ?? 0), 0);
      const total = sum(lens === "written" ? written : read);
      return (
      <Stack space="roomy">
        {/* ⚠️ ONE HERO, AND THE SEGMENT CHOOSES WHAT IT IS. Two headline figures
            side by side is no headline: the eye picks one and nobody designed
            which. The lens moves the number rather than adding a second. */}
        <Hero
          eyebrow={`Notes ${lens} · ${dates.from} to ${dates.to}`}
          value={total}
          delta={{ value: lens === "written" ? 12 : -4, of: "the period before" }}
        />

        <Row space="snug">
          <Segmented label="Counting" value={lens} onChange={setLens} options={LENS} />
          <PeriodInput value={period} today={today} onChange={onPeriod} />
        </Row>

        {/* ⚠️ THE STATS SAY WHAT THE HERO DOES NOT. The first render had `316` as
            the headline and `316` again as the first stat, four lines apart —
            which reads as a rendering fault rather than as emphasis. A figure
            repeated is a figure somebody checks twice and trusts less. */}
        <StatRow>
          <Stat label="A day" value={Math.round(total / 30)} trend={RECENT} delta={{ value: 8, of: "the week before" }} />
          <Stat label="Published" value={3} delta={{ value: -1, of: "the week before" }} />
          <Stat label="Longest" value={120} suffix=" min" />
        </StatRow>

        <Section label="Over the period">
          <Stack space="roomy">
            <ChartPanel
              label="Notes a day"
              under="Written against read"
            >
              {/* ⚠️ TWO SERIES, ONE SUBJECT. Both drawn at equal weight is a chart
                  that asks the reader to decide which one it is about. */}
              <LineChart
                describes="Notes written and read each day over the chosen period"
                series={[
                  { id: "written", label: "Written", points: written, subject: true },
                  { id: "read", label: "Read", points: read },
                ]}
              />
            </ChartPanel>

            {/* ⚠️ A SECOND DELTA ON A SCREEN HAS TO SAY SOMETHING THE HERO
                DOES NOT. The first draft put the hero's own figure in this
                aside — the same arrow and the same number, twice, four inches
                apart, which reads as a rendering fault rather than emphasis. */}
            <ChartPanel
              label="Reading, cumulative"
              under="One series, so the fill is the quantity"
              aside={<Delta value={-9} of="the same weeks last quarter" />}
            >
              {/* ⚠️ AN AREA IS A QUANTITY AND A LINE IS A RATE, which is why this
                  one includes zero and the one above does not. Filling under a
                  line whose baseline is not zero shades an area that means
                  nothing. */}
              <AreaChart
                describes="Notes read each day over the chosen period"
                series={{ id: "read", label: "Read", points: read, subject: true }}
              />
            </ChartPanel>
          </Stack>
        </Section>

        <Section label="What gets written">
          <Grid least="card" space="roomy">
            <ChartPanel label="By kind" under="Every note has exactly one">
              <ColumnChart
                describes="How many notes of each kind"
                data={BY_KIND.map((d) => ({ label: d.label, value: d.value }))}
                subject={0}
              />
            </ChartPanel>

            <ChartPanel label="Share of the notebook" under="The same four, as one whole">
              {/* ⚠️ A DONUT IS FOR PARTS OF ONE WHOLE and this is the only place
                  on the sheet where the parts add up to something. Four slices
                  is its ceiling in practice — past that the legend is doing all
                  the work and a bar would have been kinder. */}
              <DonutChart
                describes="Share of the notebook by kind of note"
                data={BY_KIND}
                total="76 notes"
              />
            </ChartPanel>

            <ChartPanel label="Kinds over four weeks" under="Part-to-whole, week by week">
              <StackedChart
                describes="Notes of each kind, stacked by week"
                groups={[...KIND_BY_WEEK.groups]}
                series={KIND_BY_WEEK.series.map((s) => ({ ...s, values: [...s.values] }))}
              />
            </ChartPanel>

            <ChartPanel label="Who wrote them" under="This month">
              <BarChart
                describes="Notes written by each person this month"
                data={[
                  { label: "Priya", value: 21 },
                  { label: "Tomas", value: 11 },
                  { label: "Aisha", value: 9 },
                  { label: "Jonas", value: 0 },
                ]}
                subject={0}
              />
            </ChartPanel>
          </Grid>
        </Section>

        <Section label="Rhythm">
          <Grid least="card" space="roomy">
            <ChartPanel label="When people write" under="Blank means never, not none">
              {/* ⚠️ THE HOLES ARE THE TEST. A grid that shades a missing reading
                  the same as a quiet one invents data, and the invention is
                  invisible — it looks like a cold cell either way. */}
              <HeatmapChart
                describes="Notes written by weekday and time of day"
                rows={[...WHEN.rows]}
                columns={[...WHEN.columns]}
                values={WHEN.values}
              />
            </ChartPanel>

            <ChartPanel label="Against twenty a week" under="The target, not the total">
              {/* ⚠️ DIVERGING IS ABOUT THE SIGN. Drawing this as a column chart of
                  "notes per week" would be the same numbers and a different
                  question — the reader would have to hold the target in their
                  head and subtract. */}
              <DivergingChart
                describes="Notes written each week against a target of twenty"
                data={AGAINST_TARGET}
              />
            </ChartPanel>

            <ChartPanel label="Last month against this" under="One hue, two shades">
              <DumbbellChart
                describes="Notes written last month against this month, per person"
                data={MONTH_ON_MONTH}
              />
            </ChartPanel>

            <ChartPanel label="Length against time spent" under="Words by minutes">
              <ScatterChart
                describes="How long a note took against how long it ended up"
                series={LENGTH_AGAINST_TIME.map((s) => ({ ...s, points: [...s.points] }))}
              />
            </ChartPanel>
          </Grid>
        </Section>

        <Section label="What the plan allows">
          <Grid least="panel" space="roomy">
            <ChartPanel label="This month">
              <Stack space="roomy">
                {/* ⚠️ A METER AND A RING ARE THE SAME FACT AT TWO SIZES, and the
                    choice is about the row rather than the number: a meter
                    stacks with a label beside it, a ring holds a corner. Four
                    quantities is a meter's job — see `Rings`, which caps at
                    three for a reason it states. */}
                <Meter label="Notes" value={76} limit={200} />
                <Meter label="People" value={4} limit={10} />
                <Meter label="Credits this month" value={1240} limit={5000} />
              </Stack>
            </ChartPanel>

            <ChartPanel label="Quotas">
              <Rings
                describes="Notes, people and credits against what the plan allows"
                items={[
                  { id: "notes", label: "Notes", value: 76, limit: 200 },
                  { id: "seats", label: "People", value: 4, limit: 10 },
                  { id: "credits", label: "Credits", value: 1240, limit: 5000 },
                ]}
              />
            </ChartPanel>

            <ChartPanel label="Storage">
              <Stack space="roomy">
                <Ring label="Used" value={7.4} limit={10} suffix=" GB" describes="Storage used against the plan" />
                {/* ⚠️ A GAUGE IS A FRACTION WITH NO UNIT — a percentage of
                    something finished. It is not a small `Ring`: a ring carries
                    a value AND a limit, and severity, because running out of one
                    is a problem. Being 62% through a checklist is not. */}
                <Gauge value={62} label="Workspace set up" note="Three steps left" />
              </Stack>
            </ChartPanel>

            <ChartPanel label="Where it is kept">
              {/* ⚠️ AN `Arc` RATHER THAN A `Ring`, AND THE FLOOR IS WHY. A cold
                  room runs between 2 and 8 degrees; "62% of 8" is arithmetic
                  nobody performs and a ring would print it. What a reader wants
                  is where in the safe band this sits, which is the one question
                  an open arc with its ends labelled answers. */}
              <Arc label="Cold room" value={5.2} from={2} to={8} suffix="°C" />
            </ChartPanel>
          </Grid>
        </Section>

        <Section label="Everything, as numbers">
          <Stack space="roomy">
            <ChartPanel label="Where it goes" under="Credits this month, by what spent them">
              <CompositionBar
                describes="Credits spent this month by what spent them"
                data={[
                  { label: "Drafting", value: 810 },
                  { label: "Summaries", value: 310 },
                  { label: "Search", value: 120 },
                ]}
                suffix=" credits"
              />
            </ChartPanel>

            {/* ⚠️ EVERY CHART CAN BECOME A TABLE AND THAT IS NOT A COURTESY —
                three of the light palette's slots carry a contrast warning, and
                a screen reader gets nothing at all out of an `<svg>`. Folded
                because most readers rightly skip it; present because some
                cannot. */}
            <Reveal label="Read the numbers instead">
              <ChartTable
                columns={["Week", "Written", "Read", "Against target"]}
                rows={[
                  ["Wk 29", 14, 96, -6],
                  ["Wk 30", 14, 118, -6],
                  ["Wk 31", 23, 141, 3],
                  ["Wk 32", 19, 132, -1],
                  ["Wk 33", 28, 164, 8],
                ]}
              />
            </Reveal>

            {/* ⚠️ A SPARKLINE HAS NO AXIS AND THAT IS WHAT MAKES IT READABLE HERE
                — it is the shape of the last while beside the number, not a
                small chart. It is the one data mark that belongs in a row of
                text. */}
            <Row space="snug">
              <span>Last twelve days</span>
              <Sparkline points={RECENT} />
              <Sparkline points={WRITTEN.slice(-12)} tone="quiet" />
            </Row>
          </Stack>
        </Section>

        {/* ⚠️ THE LAST SECTION IS THE ONE WITH NO CHART IN IT, DELIBERATELY. A
            sheet of aggregates answers "how much" and never "which one" — and
            the question somebody has after reading a chart is always which one.
            grouped by day rather than listed flat, because a report is read
            downwards and a date repeated on forty rows is forty facts nobody
            asked for. */}
        <Section label="What happened, day by day">
          <Agenda days={LATELY} />
        </Section>
      </Stack>
      );
      }}
    />
  );
}
