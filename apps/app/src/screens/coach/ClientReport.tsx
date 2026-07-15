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
  Button, Card, Badge, Skeleton, SegmentedControl, Page, Stagger, StatCard, ChartCard, AreaChart, SectionHeader, toneVar,
  Flame, Gauge, Dumbbell, Utensils, Scale, Moon, Smile, Trophy, Sparkles, TrendingUp, cn,
} from "@mossa/ui";
import { api, todayLocal } from "../../api.js";
import { useUnits } from "../../units.js";
import { AiAvatar } from "../../AiAvatar.js";
import { ExerciseRow, type ExerciseInfo } from "../exercise.js";

interface Report {
  compliance: { checkInDays: number; foodDays: number; workoutDays: number; checkInConsistencyPct: number; currentStreak: number; calorieAdherencePct: number | null };
  averages: { mood: number | null; sleepHours: number | null };
  weightSeries: { date: string; kg: number }[];
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
  const maxE1 = report?.prs[0]?.e1rm ?? 1;

  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <SegmentedControl options={[{ value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }, { value: "90d", label: "90 days" }]} value={range} onChange={(v) => setRange(v as RangePreset)} />

      <Stagger>
        <Card className="space-y-3">
          <SectionHeader icon={Sparkles} tone="primary" title="AI status"
            action={<Button size="sm" variant="tonal" disabled={summaryBusy} onClick={() => void genSummary()}><Sparkles /> {summary ? "Refresh" : "Generate"}</Button>} />
          {summaryBusy ? (
            <p className="text-sm text-muted-foreground">Reading this client's context…</p>
          ) : summary ? (
            <div className="flex items-start gap-3"><AiAvatar className="mt-0.5 size-8 shrink-0" /><p className="text-sm leading-relaxed text-foreground/85">{summary}</p></div>
          ) : (
            <p className="text-sm text-muted-foreground">Generate a coach-facing read: current phase, adherence, trajectory, and the single most important thing to address next.</p>
          )}
        </Card>
      </Stagger>

      {!report ? (
        <div className="space-y-4"><Skeleton className="h-28" /><Skeleton className="h-44" /></div>
      ) : (
        <>
          <Stagger className="grid grid-cols-2 gap-3">
            <StatCard stack label="Check-in streak" value={report.compliance.currentStreak} unit={report.compliance.currentStreak === 1 ? "day" : "days"} icon={Flame} tone="calories"
              badge={<Badge tone="neutral">{report.compliance.checkInDays} check-ins</Badge>} />
            <StatCard stack label="Consistency" value={report.compliance.checkInConsistencyPct} unit="%" icon={Gauge} tone="activity" />
            <StatCard stack label="Workouts" value={report.compliance.workoutDays} unit="days" icon={Dumbbell} tone="activity" />
            <StatCard stack label="Days logged" value={report.compliance.foodDays} unit="days" icon={Utensils} tone="nutrition" />
            <StatCard stack label="Cal adherence" value={report.compliance.calorieAdherencePct ?? "—"} unit={report.compliance.calorieAdherencePct != null ? "%" : undefined} icon={Flame} tone="calories" />
            <StatCard stack label="Tonnage" value={Math.round(kgToDisplay(report.totalTonnage, units) / 1000).toLocaleString()} unit={`k ${weightLabel(units)}`} icon={TrendingUp} tone="activity" />
          </Stagger>

          {weightVals.length >= 2 && (
            <Stagger>
              <ChartCard title="Weight trajectory" icon={Scale} tone="cardio" value={weightVals.at(-1)!.toFixed(1)} unit={weightLabel(units)}
                delta={wDelta != null && wDelta !== 0 ? <Badge tone="neutral"><TrendingUp className={cn("size-3", wDelta < 0 && "rotate-180")} />{wDelta > 0 ? "+" : ""}{wDelta} {weightLabel(units)}</Badge> : undefined}>
                <AreaChart values={weightVals} tone="cardio" trend label={(i) => shortDate(weight[i]!.date)} format={(v) => v.toFixed(1)} />
              </ChartCard>
            </Stagger>
          )}

          <Stagger className="grid grid-cols-2 gap-3">
            <StatCard stack label="Avg mood" value={report.averages.mood ?? "—"} unit={report.averages.mood != null ? "/ 5" : undefined} icon={Smile} tone="nutrition" />
            <StatCard stack label="Avg sleep" value={report.averages.sleepHours ?? "—"} unit={report.averages.sleepHours != null ? "h" : undefined} icon={Moon} tone="sleep" />
          </Stagger>

          {report.prs.length > 0 && (
            <Stagger>
              <Card className="space-y-3">
                <SectionHeader icon={Trophy} tone="activity" title="Top lifts · est. 1RM" />
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
          )}
        </>
      )}
    </Page>
  );
}
