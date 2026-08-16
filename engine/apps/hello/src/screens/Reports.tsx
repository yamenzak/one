/**
 * REPORTS — where the chart vocabulary is judged.
 *
 * ⚠️ A FIGURE CANNOT BE JUDGED FROM A CATALOGUE, WHICH IS WHY THIS SCREEN
 * EXISTS. Rendered on its own a chart always looks fine: the series is tidy, the
 * axis fits, the number beside it is short. What a chart has to survive is a
 * real screen — a gap in the run, a period control in the panel's aside, a
 * headline figure that has to agree with the plot under it, and a phone.
 *
 * ⚠️ AND THE PERIOD IS THE STATE THIS SCREEN OWNS. Choosing one reports both the
 * name and the dates it resolves to, so what filters the data is never a word
 * whose meaning each caller works out again.
 */

import * as React from "react";
import {
  ChartPanel, Group, Hero, LineChart, PeriodInput, Screen, Stack, Stat, StatRow,
  spanOf, type Dates, type PeriodId, type Point,
} from "@engine/design";

export function Reports({ title, written, read, today, period, onPeriod }: {
  /** ⚠️ The declared label — see `screens/index.tsx`. */
  readonly title?: string;
  readonly written: readonly Point[];
  readonly read: readonly Point[];
  /** `YYYY-MM-DD`, passed in so what a period resolves to is a pure function. */
  readonly today: string;
  readonly period: PeriodId;
  readonly onPeriod: (id: PeriodId, dates: Dates) => void;
}) {
  const total = written.reduce((n, p) => n + (p.y ?? 0), 0);
  const dates = spanOf(period, today);

  return (
    <Screen shape="figure" title={title}>
      <Stack space="roomy">
        {/* ⚠️ THE HEADLINE IS THE NUMBER SOMEBODY CAME FOR, and it is above the
            plot rather than inside it: a figure buried in a panel header is one
            people read the chart to work out for themselves. */}
        <Hero eyebrow={`Notes written · ${dates.from} to ${dates.to}`} value={total} />

        {/* ⚠️ THE STATS SAY WHAT THE HERO DOES NOT. The first render had `316` as
            the headline and `316` again as the first stat, four lines apart —
            which reads as a rendering fault rather than as emphasis. A figure
            repeated is a figure somebody checks twice and trusts less. */}
        <StatRow>
          <Stat label="Read" value={read.reduce((n, p) => n + (p.y ?? 0), 0)} trend={read} delta={{ value: 8, of: "before" }} />
          <Stat label="Published" value={3} delta={{ value: -1, of: "before" }} />
          <Stat label="Drafts" value={2} />
        </StatRow>

        <Group label="Over the period">
          <ChartPanel
            label="Notes a day"
            under="Written against read"
            aside={<PeriodInput value={period} today={today} onChange={onPeriod} />}
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
        </Group>
      </Stack>
    </Screen>
  );
}
