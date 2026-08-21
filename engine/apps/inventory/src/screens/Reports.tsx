/**
 * REPORTS — what went, what was wrong, and what to buy.
 *
 * ⚠️ THE HERO IS THE NUMBER THAT MAKES THE PRODUCT LOOK BAD, and that is the
 * decision this screen is built on. "Sixty-one per cent of what left was
 * recorded" is the honest measure of whether anybody is actually scanning, and
 * it is the one figure an inventory product is never willing to lead with.
 * Hiding it does not make the stock come back — it makes every other number here
 * unfalsifiable, because there is no way to tell a quiet month from a month
 * nobody logged.
 *
 * ⚠️ AND WHAT TO BUY IS ORDERED BY WHAT RUNS OUT FIRST, never by what is
 * smallest. A product with two weeks of stock and a three-week lead time is gone
 * before the order lands; one with two days and a next-day supplier is fine. A
 * list sorted by quantity puts those in the wrong order, which is how a store
 * room runs out of the one thing that takes a month to get.
 *
 * ⚠️ CONSUMPTION AND CORRECTION NEVER SHARE A PANEL. Somebody took it, or the
 * number was wrong — different events, different causes, different people. A
 * screen that summed them reports theft as usage.
 */

import {
  AmountRow, ChartPanel, ColumnChart, Group, Hero, LineChart, NoteRow, Num,
  Screen, Section, Segmented, Stat, StatRow, glyphOf, type Loaded,
} from "@engine/design";

/** Everything one period answers — see `stock.report`, which reads it once. */
export interface Reported {
  readonly told: { readonly recorded: number; readonly inferred: number; readonly share: number };
  readonly used: readonly { readonly product: string; readonly name: string; readonly quantity: number }[];
  readonly losses: readonly {
    readonly product: string; readonly name: string;
    readonly lost: number; readonly found: number;
  }[];
  readonly buy: readonly {
    readonly product: string; readonly name: string; readonly onHand: number;
    readonly cover: number; readonly order: number; readonly why: string; readonly unit: string;
  }[];
  readonly daily: readonly { readonly day: string; readonly quantity: number }[];
}

export type Span = "week" | "month" | "quarter";

export interface ReportsProps {
  readonly title?: string;
  readonly of: Loaded<Reported>;
  readonly span: Span;
  readonly onSpan: (of: Span) => void;
  readonly again: () => void;
  readonly onOpen: (product: string) => void;
}

const SPANS: readonly { readonly id: Span; readonly label: string }[] = [
  { id: "week", label: "7 days" },
  { id: "month", label: "30 days" },
  { id: "quarter", label: "90 days" },
];

/* ⚠️ THE TOP TEN, BECAUSE A COLUMN CHART OF FOUR HUNDRED PRODUCTS IS A GREY
   BAND. What is below the tenth is on the product's own screen, where somebody
   went looking for it. */
const TOP = 10;

/*
  ⚠️ "NEVER" RATHER THAN "∞". A cover of Infinity is the honest arithmetic for a
  thing that does not move, and printing the symbol at somebody is showing them a
  division rather than an answer.
*/
export const sayCover = (days: number): string => {
  if (!Number.isFinite(days)) return "Not moving";
  if (days < 1) return "Gone today";
  return `${Math.floor(days)} days left`;
};

export function Reports({ title, of, span, onSpan, again, onOpen }: ReportsProps) {
  return (
    <Screen
      shape="figure"
      title={title}
      under="Everything here is read from the movements, every time"
      of={of}
      again={again}
      /* ⚠️ A PERIOD WITH NOTHING IN IT IS NOT AN EMPTY SCREEN. The reorder list
         reads the par levels rather than the movements, so a quiet fortnight
         still has something to say — and "nothing moved" is itself the answer
         somebody came for. */
      isNothing={() => false}
      then={(said) => (
        <>
          <Group>
            <Segmented
              label="Over"
              value={span}
              onChange={(next) => { onSpan(next as Span); }}
              options={SPANS.map((one) => ({ id: one.id, label: one.label }))}
            />
          </Group>

          {/*
            ⚠️ THE HERO IS THE RECORDED SHARE AND NOT THE CONSUMPTION. How much
            left is a fact about the business; how much of it anybody wrote down
            is a fact about whether these numbers mean anything, and only one of
            those two changes what somebody does on Monday.
          */}
          <Group>
            <Hero
              eyebrow="Recorded"
              value={Math.round(said.told.share * 100)}
              suffix="%"
              count={false}
            />
            <StatRow>
              <Stat label="Scanned out" value={said.told.recorded} />
              <Stat label="Found gone by a count" value={said.told.inferred} upIsGood={false} />
            </StatRow>
            {/* ⚠️ SAID IN WORDS, BECAUSE A PERCENTAGE ON ITS OWN IS A SCORE AND
                nobody knows what to do with a score. This one names the act. */}
            <NoteRow>
              {said.told.recorded + said.told.inferred === 0
                ? "Nothing left the shelves in this period"
                : "The rest went without anybody scanning it, and a count found it missing"}
            </NoteRow>
          </Group>

          <ChartPanel label="What left, day by day" under="Scanned out and found gone, together">
            <LineChart
              describes="What left the shelves each day"
              series={[{
                id: "left", label: "Left", subject: true,
                points: said.daily.map((one, i) => ({ x: i, y: one.quantity })),
              }]}
              zero
            />
          </ChartPanel>

          <ChartPanel label="What went most" under="The ten biggest, by quantity">
            {said.used.length
              ? (
                <ColumnChart
                  describes="The products that left the shelves most"
                  data={said.used.slice(0, TOP).map((one) => ({
                    label: one.name, value: one.quantity,
                  }))}
                  subject={0}
                />
              )
              : <NoteRow>Nothing left the shelves in this period</NoteRow>}
          </ChartPanel>

          {/*
            ⚠️ SHORT AND OVER STAY APART, and netting them off is what this
            section exists to refuse. A shelf that is forty short and thirty-eight
            over is a shelf somebody is counting badly, or two products being
            confused with each other; netted, it is a shelf that is two out and
            looks fine.
          */}
          <Section label="What the numbers were wrong by">
            <Group>
              {said.losses.slice(0, TOP).map((one) => (
                <AmountRow
                  key={one.product}
                  label={one.name}
                  under={one.found
                    ? `${one.lost} short · ${one.found} over`
                    : "short"}
                  amount={<span data-ink="danger"><Num value={one.lost} /></span>}
                  onOpen={() => { onOpen(one.product); }}
                />
              ))}
              {said.losses.length
                ? null
                : <NoteRow>Every count agreed with the record</NoteRow>}
            </Group>
          </Section>

          {/*
            ⚠️ SOONEST TO RUN OUT AT THE TOP, WHICH IS THE ORDER A BUYER WORKS IN
            — and it is the operation's ordering rather than this screen's, so a
            list and a notification cannot disagree about what is urgent.
          */}
          <Section label="What to buy">
            <Group>
              {said.buy.map((one) => (
                <AmountRow
                  key={one.product}
                  label={one.name}
                  under={(
                    <span data-ink={one.why === "runs out first" ? "warning" : undefined}>
                      {sayCover(one.cover)} · {one.why}
                    </span>
                  )}
                  amount={<Num value={one.order} />}
                  aside={<span>{one.unit}</span>}
                  onOpen={() => { onOpen(one.product); }}
                />
              ))}
              {said.buy.length
                ? null
                : (
                  <NoteRow icon={glyphOf("check")}>
                    Everything lasts longer than a delivery takes
                  </NoteRow>
                )}
            </Group>
          </Section>
        </>
      )}
      nothing={{ icon: glyphOf("chart"), says: "Nothing to report yet" }}
    />
  );
}
