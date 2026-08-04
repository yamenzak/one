/**
 * Coach client report — the per-client decision view: the studio assistant's
 * summary (current phase, adherence, trajectory, next action), a compliance
 * grid, the weight trajectory, wellness averages, and a top-lifts leaderboard.
 * Reads the pure-domain report aggregate. The assistant's summary is generated
 * ON ARRIVAL and cached server-side on the client's signal hash, so opening the
 * tab is free and only a material change (or Refresh) spends a credit.
 */

import { useCallback, useEffect, useState } from "react";
import { kgToDisplay, weightLabel } from "@kova/domain";
import {
  Button, Card, Badge, RangePicker, useDateRange, Page, Stagger, StatCard, ChartCard, AreaChart, SectionHeader, Eyebrow, GlanceStrip, Sparkline, toneVar,
  Anchor, CountUp, Unit,
  Reveal, SkeletonStatGrid, SkeletonChart, SkeletonList, SkeletonLine, SkeletonHero,
  Flame, Gauge, Dumbbell, Utensils, Scale, Moon, Smile, TrendingUp, Percent, cn,
} from "@4dl/ui";
import { api, errorText, todayLocal } from "../../api.js";
import { RANGE_PRESETS } from "../../ranges.js";
import { useCan } from "../../FeatureLock.js";
import { useUnits } from "../../units.js";
import { AiAvatar, useAiIdentity } from "../../AiAvatar.js";
import { InsightFeedback } from "../client/InsightFeedback.js";
import { Markdown } from "../../Markdown.js";
import { ExerciseRow, type ExerciseInfo } from "../exercise.js";

interface Report {
  compliance: { checkInDays: number; foodDays: number; workoutDays: number; checkInConsistencyPct: number; currentStreak: number; calorieAdherencePct: number | null };
  averages: { mood: number | null; sleepHours: number | null };
  weightSeries: { date: string; kg: number }[];
  bodyFatSeries: { date: string; pct: number }[];
  totalTonnage: number;
  prs: { exerciseId: string; e1rm: number; weight: number; reps: number }[];
}

const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function ClientReport({ clientId }: { clientId: string }) {
  const ai = useAiIdentity();
  // The same control and the same wire contract as Progress. This tab used to
  // offer 7/30/90 and nothing else, so one client screen answered "since the
  // phase started" on one tab and refused on the next.
  const range = useDateRange(RANGE_PRESETS, todayLocal(), "30d");
  const [report, setReport] = useState<Report | null>(null);
  const [exMap, setExMap] = useState<Map<string, ExerciseInfo>>(new Map());
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const units = useUnits();
  const today = todayLocal();
  /** Inclusive day count of the window on screen — the denominator the anchor's
   *  sub-line reads against. Derived from the resolved window rather than from
   *  the preset id, so a custom start→end is counted the same way a preset is. */
  const windowDays = Math.round(
    (Date.parse(`${range.window.end}T00:00:00`) - Date.parse(`${range.window.start}T00:00:00`)) / 86_400_000,
  ) + 1;

  useEffect(() => { setReport(null); void api.get<Report>(`/api/reports/client/${clientId}?${range.query}&today=${today}`).then(setReport).catch(() => setReport(null)); }, [clientId, range.query, today]);
  useEffect(() => { void api.get<{ exercises: ExerciseInfo[] }>("/api/exercises?scope=all").then((r) => setExMap(new Map(r.exercises.map((e) => [e.id, e])))).catch(() => undefined); }, []);

  // `/api/ai/client-summary` is gated on aiSuite. The card used to render on
  // every plan and, on the 403, WRITE "AI status isn't available on your studio's
  // plan." into the summary body — an entitlement message dressed up as an AI
  // answer. Hide the card instead, and surface real failures as an error.
  const canAi = useCan("aiSuite");
  const [summaryErr, setSummaryErr] = useState<string | null>(null);
  const genSummary = useCallback(async (fresh: boolean) => {
    setSummaryBusy(true);
    setSummaryErr(null);
    try { setSummary((await api.post<{ summary: string }>("/api/ai/client-summary", { clientId, today, fresh })).summary); }
    // A failure the coach did not ask for stays QUIET — the card falls back to
    // its "no read yet" line. Auto-generation must not turn a studio with no AI
    // provider configured into an error message on every client they open; only
    // pressing Refresh is a request, and only a request gets an answer back.
    catch (e) { if (fresh) setSummaryErr(errorText(e, "Couldn't generate the status — try again.")); }
    finally { setSummaryBusy(false); }
  }, [clientId, today]);

  /*
   * Generated on arrival, like every other note this assistant writes.
   *
   * It used to sit behind a Generate button, which made the studio's assistant
   * the one thing on a client screen that only spoke when asked — and the
   * coach's read of a client is exactly what they came to this tab for. The
   * route caches on the client's signal hash for an hour, so arriving is free
   * and only a material change (or Refresh) pays again.
   */
  useEffect(() => {
    if (!canAi) return;
    void genSummary(false);
  }, [canAi, genSummary]);

  const weight = report?.weightSeries ?? [];
  const weightVals = weight.map((w) => kgToDisplay(w.kg, units));
  const wDelta = weight.length >= 2 ? Math.round((weightVals.at(-1)! - weightVals[0]!) * 10) / 10 : null;
  const bf = report?.bodyFatSeries ?? [];
  const bfVals = bf.map((b) => b.pct);
  const bfDelta = bf.length >= 2 ? Math.round((bfVals.at(-1)! - bfVals[0]!) * 10) / 10 : null;
  const maxE1 = report?.prs[0]?.e1rm ?? 1;

  return (
    <Page className="column space-y-4 p-4 pb-28">
      {/* Every client surface names itself in an eyebrow and hangs its one
          quiet control off the same slot (§7). This tab had neither — it opened
          on a bare segmented control, which is the only screen in the set that
          did. */}
      <Eyebrow action={<RangePicker format={shortDate} {...range.props} />}>Report</Eyebrow>

      {/*
        T1 — CONSISTENCY (§1).

        This tab had no anchor, on the reasoning that a period summary is a set
        of numbers rather than one. `coach/Sessions` was filed the same way and
        reversed on review, and the same test settles this one: what is the ONE
        question on arrival, and does it have a numeric answer? A coach opens a
        client's report to find out whether they have been showing up — every
        other figure here (trajectory, averages, lifts) is read THROUGH that
        answer, because a weight trend over a fortnight they barely logged is
        not a trend.

        It comes OUT of the compliance strip in the same move. §1: the anchor's
        value appears once, and a display numeral with the same figure in a
        strip 40px below it reads as a second thought about the first one.

        Zero is the case that matters. A client with no check-ins in the window
        scores 0%, and 0 at 56px over "of 30 days" is a verdict on the person
        rather than a gap in the record (§5) — so the absence says so in words,
        keyed on the COUNT rather than on the percentage, since 0% computed from
        real days is a real measurement and keeps its numeral.
      */}
      {/* Its own `Reveal`, so the anchor's height is reserved while the report
          loads — it sits above everything else on the tab, and a hero that
          appears late pushes the whole screen down under the reader's thumb
          (§9). The AI card below already loads independently. */}
      <Reveal loading={!report} skeleton={<SkeletonHero height={150} />}>
        {report && (
          <Anchor
            eyebrow="Consistency"
            className="pt-1"
            word={report.compliance.checkInDays === 0 ? "No check-ins" : undefined}
            sub={report.compliance.checkInDays === 0
              ? `Nothing logged in these ${windowDays} days`
              : `${report.compliance.checkInDays} of ${windowDays} days checked in`}
          >
            {report.compliance.checkInDays > 0 && (
              <>
                <CountUp value={report.compliance.checkInConsistencyPct} />
                <Unit>%</Unit>
              </>
            )}
          </Anchor>
        )}
      </Reveal>

      {canAi && (
      <Stagger>
        <Card className="space-y-3">
          {/* The studio's assistant, by name and face. "AI status" behind a
              sparkle said nothing about whose read this is or what it contains;
              the avatar already appears on the summary itself, so leading with
              it makes the whole card one voice. */}
          <div className="flex items-center gap-2.5">
            <AiAvatar className="size-9" />
            <h2 className="min-w-0 flex-1 truncate font-semibold">{ai.name}&rsquo;s read</h2>
            <Button size="sm" variant="tonal" disabled={summaryBusy} onClick={() => void genSummary(true)}>Refresh</Button>
          </div>
          {summaryBusy && !summary ? (
            <div className="space-y-2"><SkeletonLine w="100%" /><SkeletonLine w="92%" /><SkeletonLine w="60%" /></div>
          ) : summary ? (
            <div className="space-y-2">
              <div className="flex items-start gap-3"><AiAvatar className="mt-0.5 size-8 shrink-0" /><Markdown className="min-w-0 flex-1 text-sm text-foreground/85">{summary}</Markdown></div>
              {/* No `onMute` on a coach surface: this is the tab's own content
                  and there is nowhere for it to go — only a rating. */}
              <InsightFeedback insightType="client-summary" insightRef={clientId} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No read yet. Refresh to get the current phase, adherence, trajectory and the single most important thing to address next.</p>
          )}
          {summaryErr && <p role="status" aria-live="polite" className="text-sm text-warning">{summaryErr}</p>}
        </Card>
      </Stagger>
      )}

      <Reveal loading={!report} className="space-y-4" skeleton={
        <>
          <SkeletonStatGrid count={6} foot />
          <SkeletonChart height={160} />
          <SkeletonStatGrid count={2} />
          <SkeletonList card rows={5} thumb={40} />
        </>
      }>
        {report && (
        <>
          {/* Compliance — card-less glance strips so the adherence numbers read
              as a summary, not a card grid. Consistency is NOT here: it is the
              anchor, and §1 spends the anchor's value once. */}
          <section className="space-y-2">
            <Eyebrow>Compliance</Eyebrow>
            <Stagger className="space-y-3">
              <GlanceStrip items={[
                // One name per thing: the widget picker, the client's own Wellness tab and
                // this report were calling the same number "Check-in streak", "Day streak"
                // and "Day streak" respectively.
                { icon: Flame, tone: "calories", value: report.compliance.currentStreak, label: "Check-in streak" },
                { icon: Dumbbell, tone: "activity", value: report.compliance.workoutDays, label: "Workout days" },
                { icon: Utensils, tone: "nutrition", value: report.compliance.foodDays, label: "Days logged" },
              ]} />
              <GlanceStrip items={[
                { icon: Gauge, tone: "calories", value: report.compliance.calorieAdherencePct != null ? `${report.compliance.calorieAdherencePct}%` : null, label: "Cal adherence" },
                // "0k" was shipping — the k-suffix was unconditional, so a client with no
                // logged sets got a unit with nothing in front of it. Under 10,000 the
                // real figure fits and is more useful; the unit rides the value, not the
                // label (§5).
                {
                  icon: TrendingUp,
                  tone: "activity",
                  value: (() => {
                    const v = Math.round(kgToDisplay(report.totalTonnage, units));
                    return v >= 10_000 ? `${Math.round(v / 1000).toLocaleString()}k` : v.toLocaleString();
                  })(),
                  label: `Volume lifted (${weightLabel(units)})`,
                },
              ]} />
            </Stagger>
          </section>

          {/* Hero — weight is the anchor metric, kept full-width. */}
          {weightVals.length >= 2 && (
            <Stagger>
              <ChartCard title="Weight trajectory" icon={Scale} tone="cardio" value={weightVals.at(-1)!.toFixed(1)} unit={weightLabel(units)}
                delta={wDelta != null && wDelta !== 0 ? <Badge tone="neutral"><TrendingUp className={cn("size-3", wDelta < 0 && "rotate-180")} />{wDelta > 0 ? "+" : ""}{wDelta} {weightLabel(units)}</Badge> : undefined}>
                <AreaChart values={weightVals} tone="cardio" trend label={(i) => shortDate(weight[i]!.date)} format={(v) => v.toFixed(1)} />
              </ChartCard>
            </Stagger>
          )}

          {/* Body-fat — compact secondary: current value + delta + a sparkline,
              a deliberate break from a second full-width area chart. */}
          {bfVals.length >= 2 && (
            <Stagger>
              <StatCard stack tone="sleep" icon={Percent} label="Body-fat trajectory"
                value={bfVals.at(-1)!.toFixed(1)} unit="%"
                badge={bfDelta != null && bfDelta !== 0 ? <Badge tone={bfDelta < 0 ? "success" : "neutral"}><TrendingUp className={cn("size-3", bfDelta < 0 && "rotate-180")} />{bfDelta > 0 ? "+" : ""}{bfDelta}%</Badge> : undefined}
                chart={<Sparkline values={bfVals} tone="sleep" width={320} height={44} className="w-full" />} />
            </Stagger>
          )}

          <section className="space-y-2">
            <Eyebrow>Averages</Eyebrow>
            <Stagger className="grid grid-cols-2 gap-3">
              <StatCard stack label="Avg mood" value={report.averages.mood ?? null} unit="/ 5" icon={Smile} tone="nutrition" />
              <StatCard stack label="Avg sleep" value={report.averages.sleepHours ?? null} unit="h" icon={Moon} tone="sleep" />
            </Stagger>
          </section>

          {report.prs.length > 0 && (
            <section className="space-y-2">
              <Eyebrow action={<span className="text-xs font-medium text-muted-foreground">est. 1RM</span>}>Personal records</Eyebrow>
              <Stagger>
              <Card className="space-y-3">
                <div className="space-y-3">
                  {report.prs.slice(0, 8).map((p) => (
                    <div key={p.exerciseId} className="space-y-1.5">
                      <ExerciseRow
                        ex={exMap.get(p.exerciseId)} name="Exercise" thumbSize={40}
                        sub={<>{Math.round(kgToDisplay(p.weight, units))} {weightLabel(units)} × {p.reps}</>}
                        trailing={<span className="numeral shrink-0 font-semibold">{Math.round(kgToDisplay(p.e1rm, units))} <span className="text-xs font-medium text-muted-foreground">{weightLabel(units)}</span></span>}
                      />
                      <div className="ml-[52px] h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(6, (p.e1rm / maxE1) * 100)}%`, backgroundColor: toneVar.activity }} /></div>
                    </div>
                  ))}
                </div>
              </Card>
              </Stagger>
            </section>
          )}
        </>
        )}
      </Reveal>
    </Page>
  );
}
