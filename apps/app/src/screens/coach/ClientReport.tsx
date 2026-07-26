/**
 * Coach client report — the per-client decision view: an on-demand AI status
 * summary (current phase, adherence, trajectory, next action), a compliance
 * grid, the weight trajectory, wellness averages, and a top-lifts leaderboard.
 * Reads the pure-domain report aggregate; the AI summary spends a credit, so
 * it's generated on demand.
 */

import { useEffect, useState } from "react";
import { kgToDisplay, weightLabel, type RangePreset } from "@mossa/domain";
import {
  Button, Card, Badge, SegmentedControl, Page, Stagger, StatCard, ChartCard, AreaChart, SectionHeader, Eyebrow, GlanceStrip, Sparkline, toneVar,
  Reveal, SkeletonStatGrid, SkeletonChart, SkeletonList,
  Flame, Gauge, Dumbbell, Utensils, Scale, Moon, Smile, Sparkles, TrendingUp, Percent, cn,
} from "@mossa/ui";
import { api, todayLocal } from "../../api.js";
import { useUnits } from "../../units.js";
import { AiAvatar } from "../../AiAvatar.js";
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
  const [range, setRange] = useState<RangePreset>("30d");
  const [report, setReport] = useState<Report | null>(null);
  const [exMap, setExMap] = useState<Map<string, ExerciseInfo>>(new Map());
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const units = useUnits();
  const today = todayLocal();

  useEffect(() => { setReport(null); void api.get<Report>(`/api/reports/client/${clientId}?range=${range}&today=${today}`).then(setReport).catch(() => setReport(null)); }, [clientId, range, today]);
  useEffect(() => { void api.get<{ exercises: ExerciseInfo[] }>("/api/exercises?scope=all").then((r) => setExMap(new Map(r.exercises.map((e) => [e.id, e])))).catch(() => undefined); }, []);

  const genSummary = async () => {
    setSummaryBusy(true);
    try { setSummary((await api.post<{ summary: string }>("/api/ai/client-summary", { clientId, today })).summary); }
    catch { setSummary("AI status isn't available on your studio's plan."); }
    finally { setSummaryBusy(false); }
  };

  const weight = report?.weightSeries ?? [];
  const weightVals = weight.map((w) => kgToDisplay(w.kg, units));
  const wDelta = weight.length >= 2 ? Math.round((weightVals.at(-1)! - weightVals[0]!) * 10) / 10 : null;
  const bf = report?.bodyFatSeries ?? [];
  const bfVals = bf.map((b) => b.pct);
  const bfDelta = bf.length >= 2 ? Math.round((bfVals.at(-1)! - bfVals[0]!) * 10) / 10 : null;
  const maxE1 = report?.prs[0]?.e1rm ?? 1;

  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <SegmentedControl options={[{ value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }, { value: "90d", label: "90 days" }]} value={range} onChange={(v) => setRange(v as RangePreset)} />

      <Stagger>
        <Card className="space-y-3">
          <SectionHeader icon={Sparkles} tone="primary" title="AI status"
            action={<Button size="sm" variant="tonal" disabled={summaryBusy} onClick={() => void genSummary()}><AiAvatar className="size-5" /> {summary ? "Refresh" : "Generate"}</Button>} />
          {summaryBusy ? (
            <p className="text-sm text-muted-foreground">Reading this client's context…</p>
          ) : summary ? (
            <div className="flex items-start gap-3"><AiAvatar className="mt-0.5 size-8 shrink-0" /><Markdown className="min-w-0 flex-1 text-sm text-foreground/85">{summary}</Markdown></div>
          ) : (
            <p className="text-sm text-muted-foreground">Generate a coach-facing read: current phase, adherence, trajectory, and the single most important thing to address next.</p>
          )}
        </Card>
      </Stagger>

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
          {/* Compliance — card-less glance strips (two rows of three) so the
              headline adherence numbers read as a summary, not a card grid. */}
          <section className="space-y-2">
            <Eyebrow>Compliance</Eyebrow>
            <Stagger className="space-y-3">
              <GlanceStrip items={[
                { icon: Flame, tone: "calories", value: report.compliance.currentStreak, label: "Day streak" },
                { icon: Gauge, tone: "activity", value: `${report.compliance.checkInConsistencyPct}%`, label: "Consistency" },
                { icon: Dumbbell, tone: "activity", value: report.compliance.workoutDays, label: "Workout days" },
              ]} />
              <GlanceStrip items={[
                { icon: Utensils, tone: "nutrition", value: report.compliance.foodDays, label: "Days logged" },
                { icon: Flame, tone: "calories", value: report.compliance.calorieAdherencePct != null ? `${report.compliance.calorieAdherencePct}%` : "—", label: "Cal adherence" },
                { icon: TrendingUp, tone: "activity", value: `${Math.round(kgToDisplay(report.totalTonnage, units) / 1000).toLocaleString()}k`, label: `Volume ${weightLabel(units)}` },
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
              <StatCard stack label="Avg mood" value={report.averages.mood ?? "—"} unit={report.averages.mood != null ? "/ 5" : undefined} icon={Smile} tone="nutrition" />
              <StatCard stack label="Avg sleep" value={report.averages.sleepHours ?? "—"} unit={report.averages.sleepHours != null ? "h" : undefined} icon={Moon} tone="sleep" />
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
