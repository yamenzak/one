/**
 * INSIGHTS — what this centre is doing, and what an inspector will ask about.
 *
 * ── Form follows the question, not the data type ────────────────────────────
 *
 * Every chart here was chosen against what its number is FOR:
 *
 *   throughput      change over time, one series → area with a trend line.
 *   turnaround      change over time, and the one number a centre can act on →
 *                   area, with GAPS where nothing was released. A zero there
 *                   would read as "released instantly", which flatters.
 *   expiry horizon  five ordered buckets, not a continuum → bars. "17 things
 *                   expire in 23 days" is not a decision; "6 this week" is.
 *   activity        one value per day over months → calendar heatmap.
 *   instruments     a ranked list of twelve → a list. A bar chart of twelve
 *                   serial numbers is a table wearing a costume.
 *
 * ── Colour does one job per chart ───────────────────────────────────────────
 *
 * Every series here is SINGLE — so there is no categorical palette to get wrong
 * and no legend to draw (the title names the series). Colour is carrying either
 * identity (a section's accent) or STATUS, never both, and the status tones are
 * never borrowed for a series.
 *
 * The expiry bars are the one place colour means state, and they run
 * danger → warning → neutral in a fixed order that a filter cannot repaint.
 */

import { useCallback, useState } from "react";
import {
  AlertTriangle,
  AreaChart,
  BarChart,
  Badge,
  CalendarHeatmap,
  ChartCard,
  ClipboardList,
  Group,
  LoadError,
  NoData,
  Row,
  RotateCcw,
  Screen,
  Section,
  Skeleton,
  SegmentedControl,
  StatCard,
  Timer,
  Wrench,
  useLoad,
} from "@4dl/ui";
import { fmt, insights as insightsApi, type ExpiryBucket } from "../data.js";
import { useT } from "../i18n.js";

/** The windows a centre actually reasons in. Not a date picker: nobody asks "the last 43 days". */
const WINDOWS = [30, 90, 365] as const;

export function Insights() {
  const t = useT();
  const [days, setDays] = useState<number>(90);
  const load = useCallback(() => insightsApi.read(days), [days]);
  const { data, error, loading, reload } = useLoad(load, t("insights.title"), fmt);

  if (loading) {
    return (
      <Screen>
        <Section><Skeleton className="h-24 w-full rounded-2xl" /></Section>
        <Section><Skeleton className="h-56 w-full rounded-2xl" /></Section>
        <Section><Skeleton className="h-56 w-full rounded-2xl" /></Section>
      </Screen>
    );
  }
  if (error || !data) {
    return <Screen><LoadError what={t("insights.title")} error={error ?? "—"} onRetry={reload} /></Screen>;
  }

  const { headline, series, expiry } = data;

  /**
   * A series with nothing in it renders as NO DATA, never as a chart.
   *
   * An `AreaChart` over all-zeros draws a flat line pinned to the floor under an
   * axis labelled "1, 0, 0, 0" — which reads as a broken chart rather than as an
   * empty one, and it is the FIRST thing a new centre sees. `@4dl/ui` already
   * has the right surface for this; the charts just have to be asked.
   */
  const hasAny = (vs: (number | null)[]) => vs.some((v) => v != null && v !== 0);
  const today = new Date().toISOString().slice(0, 10);
  const label = (i: number) => series.days[i] ?? "";

  /**
   * The expiry buckets, in a FIXED order with a fixed tone each.
   *
   * Colour follows the bucket, never its rank — so a quiet week where nothing
   * is expiring does not repaint "this month" red just because it is now the
   * worst one on screen.
   */
  const EXPIRY_TONE: Record<ExpiryBucket, "danger" | "warning" | "neutral"> = {
    expired: "danger",
    week: "danger",
    month: "warning",
    quarter: "neutral",
    later: "neutral",
  };

  return (
    <Screen>
      <Section>
        {/**
         * ONE ROW, above everything it filters.
         *
         * `ChoiceGroup` was wrong here and it showed: it renders a stacked list
         * of full-width cards, which is right for a decision you make once
         * (pick a plan) and absurd for a time range — three rows ate a third of
         * the screen above the charts they filter.
         */}
        <SegmentedControl
          fill
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
          options={WINDOWS.map((d) => ({ value: String(d), label: t("insights.window", { days: d }) }))}
        />
      </Section>

      {/**
       * The headline four. Stat tiles rather than charts: each is a single
       * current number with no shape to show, and a sparkline under a number
       * that has no trend is decoration.
       */}
      <Section>
        <div className="grid grid-cols-2 gap-3">
          <StatCard stack icon={RotateCcw} tone="cycle" label={t("insights.loads")} value={headline.loads} />
          {/* `null` is "no loads ran" — not 0% and not 100%. StatCard renders
              its own empty phrase rather than making us invent a dash. */}
          <StatCard
            stack
            icon={AlertTriangle}
            tone={headline.releaseRate == null ? "neutral" : headline.releaseRate >= 98 ? "success" : "warning"}
            label={t("insights.releaseRate")}
            value={headline.releaseRate}
            unit="%"
            emptyText={t("insights.noRuns")}
          />
          <StatCard
            stack
            icon={Timer}
            tone="primary"
            label={t("insights.turnaround")}
            value={headline.turnaroundHours}
            unit={t("insights.hours.unit")}
            emptyText={t("insights.noReleases")}
          />
          <StatCard
            stack
            icon={ClipboardList}
            tone={headline.expiringSoon > 0 ? "warning" : "success"}
            label={t("insights.expiringSoon")}
            value={headline.expiringSoon}
          />
        </div>
      </Section>

      <Section>
        <ChartCard
          title={t("insights.throughput")}
          icon={RotateCcw}
          tone="cycle"
          value={headline.loads}
          unit={t("insights.loads.unit")}
        >
          {/* A trend line over a noisy daily count: a centre runs four loads on
              Tuesday and none on Sunday, and the shape is what matters. */}
          {hasAny(series.loads) ? (
            <AreaChart values={series.loads} tone="cycle" trend height={170} label={label} format={(v) => `${Math.round(v)}`} />
          ) : (
            <NoData>{t("insights.empty.loads")}</NoData>
          )}
        </ChartCard>
      </Section>

      {/**
       * Turnaround gets its own card rather than sharing an axis with loads.
       *
       * Hours and counts are different scales, and a dual axis is the single
       * most misread chart there is — the crossing point where one line passes
       * the other is an artefact of the two scales, not a fact about the centre.
       */}
      <Section>
        <ChartCard
          title={t("insights.turnaround.title")}
          icon={Timer}
          tone="primary"
          value={headline.turnaroundHours ?? null}
          unit={t("insights.hours.unit")}
        >
          {hasAny(series.turnaround) ? (
            <>
            <AreaChart
              values={series.turnaround}
              tone="primary"
              height={170}
              label={label}
              format={(v) => t("insights.hours", { h: Math.round(v * 10) / 10 })}
            />
            {/* The note explains how to READ the chart, so it belongs with the
                chart. Under an empty state it reads as a second paragraph of
                apology for having no data. */}
              <p className="px-1 text-caption text-muted-foreground">{t("insights.turnaround.note")}</p>
            </>
          ) : (
            <NoData>{t("insights.empty.turnaround")}</NoData>
          )}
        </ChartCard>
      </Section>

      <Section>
        <ChartCard title={t("insights.expiry")} icon={AlertTriangle} tone="warning" value={headline.expiringSoon} unit={t("insights.items")}>
          {/* Bars, one per bucket, each carrying its own tone. Every bucket is
              drawn even at zero — a summary that omits the number when it is
              nothing teaches people to read its absence as "not applicable". */}
          {headline.expiringSoon === 0 && expiry.every((b) => b.n === 0) ? (
            <NoData>{t("insights.empty.expiry")}</NoData>
          ) : (
          <div className="grid grid-cols-5 gap-2">
            {expiry.map((b) => (
              <div key={b.bucket} className="space-y-1 text-center">
                <BarChart values={[b.n]} tone={EXPIRY_TONE[b.bucket]} height={90} />
                <div className="text-caption text-muted-foreground">{t(`insights.expiry.${b.bucket}` as "insights.expiry.week")}</div>
                {/* Direct-labelled: five bars is few enough that a value on each
                    beats an axis, and it is the number a person acts on. */}
                <div className="text-sm font-medium">{b.n}</div>
              </div>
            ))}
          </div>
          )}
        </ChartCard>
      </Section>

      <Section>
        <ChartCard title={t("insights.consumption")} icon={ClipboardList} tone="case">
          {hasAny(series.consumption) ? (
            <AreaChart values={series.consumption} tone="case" trend height={150} label={label} />
          ) : (
            <NoData>{t("insights.empty.consumption")}</NoData>
          )}
        </ChartCard>
      </Section>

      <Section>
        <ChartCard title={t("insights.activity")} icon={RotateCcw} tone="primary">
          <CalendarHeatmap days={data.activity} today={today} tone="primary" weeks={Math.min(26, Math.ceil(days / 7))} />
        </ChartCard>
      </Section>

      {data.instruments.length > 0 && (
        <Section title={t("insights.instruments")}>
          <p className="mb-2 px-1 text-caption text-muted-foreground">{t("insights.instruments.note")}</p>
          <Group>
            {data.instruments.map((u) => (
              <Row
                key={u.id}
                leading={<Wrench className="size-4" />}
                sub={u.serial ? t("common.serial", { serial: u.serial }) : undefined}
                trailing={<Badge tone="neutral">{t("common.cycles", { count: u.cycle_count })}</Badge>}
              >
                {u.name ?? u.id}
              </Row>
            ))}
          </Group>
        </Section>
      )}
    </Screen>
  );
}
