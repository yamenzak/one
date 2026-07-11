/**
 * Client Today — hero ring + metric pills, action row, timeline feed.
 */

import { useCallback, useEffect, useState } from "react";
import { currentStreak, fmtVolume, kcalToDisplay, energyLabel, weightLabel, kgToDisplay, type UnitPrefs } from "@mossa/domain";
import {
  Button, Card, SubCard, Skeleton, ProgressRing, MetricPill, MacroBar, InsightCard, WavyDivider, Badge,
  Page, Stagger, METRICS, toneVar, Plus, Play, PencilLine, Flame, Trophy, ClipboardList, Dumbbell, FlaskConical, type Tone,
} from "@mossa/ui";
import { api, todayLocal } from "../../api.js";
import { useUnits } from "../../units.js";
import { LogSheet } from "./LogSheet.js";

export interface TodayBundle {
  date: string;
  nutrition: { calories: number; proteinG: number; carbsG: number; fatG: number };
  waterMl: number;
  burnedKcal: number;
  workout: { loggedSets: number; sessions: unknown[] };
  checkedIn: boolean;
  goal: { targets: Record<string, number> | null; weeklyLoadTarget: number | null } | null;
  publishedWorkoutPlan: { id: string; name: string; body: { days: { name: string; isRestDay?: boolean }[] } } | null;
  checkInDates?: string[];
  pendingLabs?: number;
  weightSeries?: { kg: number; date: string }[];
}

export function Today({ clientId, onStart }: { clientId: string; onStart?: () => void }) {
  const [data, setData] = useState<TodayBundle | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const units = useUnits();
  const date = todayLocal();

  const load = useCallback(async () => {
    setData(await api.get<TodayBundle>(`/api/today?clientId=${clientId}&date=${date}`));
  }, [clientId, date]);
  useEffect(() => void load(), [load]);

  if (!data) {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-4">
        <Skeleton className="h-52" />
        <Skeleton className="h-14" />
        <Skeleton className="h-36" />
      </div>
    );
  }

  const targets = data.goal?.targets ?? null;
  const calTarget = targets?.targetCalories ?? 0;
  const net = data.nutrition.calories - data.burnedKcal;
  const waterTarget = targets?.targetWaterMl ?? 2500;

  return (
    <Page className="mx-auto max-w-xl space-y-5 p-4 pb-28">
      <Stagger className="flex items-center gap-4">
        <ProgressRing
          progress={calTarget > 0 ? net / calTarget : 0.001}
          size={188}
          tone="calories"
          label={units.energy === "kJ" ? "Energy" : METRICS.calories.label}
          value={kcalToDisplay(Math.max(0, net), units).toLocaleString()}
          sublabel={calTarget > 0 ? `of ${kcalToDisplay(calTarget, units).toLocaleString()} ${energyLabel(units)}` : "set a goal"}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <MetricPill icon={METRICS.protein.icon} label={METRICS.protein.label} tone={METRICS.protein.tone} value={`${data.nutrition.proteinG} g`} progress={targets?.targetProteinG ? data.nutrition.proteinG / targets.targetProteinG : undefined} />
          <MetricPill icon={METRICS.water.icon} label={METRICS.water.label} tone={METRICS.water.tone} value={fmtVolume(data.waterMl, units)} progress={data.waterMl / waterTarget} />
          <MetricPill icon={METRICS.burned.icon} label={METRICS.burned.label} tone={METRICS.burned.tone} value={kcalToDisplay(data.burnedKcal, units).toLocaleString()} />
        </div>
      </Stagger>

      <Stagger>
        <MacroBar
          proteinG={data.nutrition.proteinG}
          carbsG={data.nutrition.carbsG}
          fatG={data.nutrition.fatG}
          targets={targets ? { proteinG: targets.targetProteinG, carbsG: targets.targetCarbsG, fatG: targets.targetFatG } : null}
        />
      </Stagger>

      <Stagger className="flex items-center gap-2.5">
        <Button size="lg" className="flex-1" onClick={() => setLogOpen(true)}>
          <Plus /> Log
        </Button>
        <Button size="lg" variant="tonal" className="flex-1" onClick={onStart} disabled={!data.publishedWorkoutPlan}>
          <Play /> Start
        </Button>
        <Button size="icon" variant="secondary" aria-label="Customize">
          <PencilLine />
        </Button>
      </Stagger>

      {/* Home widgets */}
      <Stagger className="grid grid-cols-3 gap-2.5">
        <Widget icon={METRICS.streak.icon} tone={METRICS.streak.tone} value={data.checkInDates ? currentStreak(new Set(data.checkInDates), date) : 0} label="Day streak" />
        <Widget icon={METRICS.weight.icon} tone={METRICS.weight.tone} value={weightDelta(data.weightSeries, units)} label={`7-day ${weightLabel(units)}`} />
        <Widget icon={FlaskConical} tone="cardio" value={data.pendingLabs ?? 0} label="Labs due" />
      </Stagger>

      <Stagger>
        {!data.checkedIn && (
          <InsightCard timestamp="Today" title="Check in" ai>
            <SubCard>
              <p className="text-sm text-muted-foreground">A 30-second check-in keeps your coach in the loop — weight, mood, sleep.</p>
              <Button className="mt-3" onClick={() => setLogOpen(true)}>
                <ClipboardList /> Check in now
              </Button>
            </SubCard>
          </InsightCard>
        )}
        {data.workout.loggedSets > 0 && (
          <InsightCard timestamp="Today" title="Workout logged">
            <SubCard className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-xl bg-activity-soft text-activity [&_svg]:size-5">
                <Trophy />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Sets completed</div>
                <div className="numeral text-2xl font-semibold">{data.workout.loggedSets}</div>
              </div>
            </SubCard>
          </InsightCard>
        )}
        {data.publishedWorkoutPlan && (
          <InsightCard timestamp="Your plan" title={data.publishedWorkoutPlan.name}>
            <SubCard className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-xl bg-primary/15 text-primary [&_svg]:size-5">
                <Dumbbell />
              </div>
              <p className="text-sm text-muted-foreground">{data.publishedWorkoutPlan.body.days.length} training days — head to Train to start today's session.</p>
            </SubCard>
          </InsightCard>
        )}
        <WavyDivider label="Yesterday" />
        <Card className="text-center text-sm text-muted-foreground">Your history grows here as you log.</Card>
      </Stagger>

      <LogSheet open={logOpen} onClose={() => setLogOpen(false)} clientId={clientId} onLogged={() => void load()} />
    </Page>
  );
}

function Widget({ icon: Icon, tone, value, label }: { icon: typeof Flame; tone: Tone; value: number | string; label: string }) {
  return (
    <Card className="flex flex-col items-center gap-1 p-3 text-center">
      <Icon className="size-4" style={{ color: toneVar[tone] }} />
      <div className="numeral text-xl font-semibold">{value}</div>
      <div className="text-[0.65rem] text-muted-foreground">{label}</div>
    </Card>
  );
}

function weightDelta(series: { kg: number; date: string }[] | undefined, units: UnitPrefs): string {
  if (!series || series.length < 2) return "—";
  const last = series[series.length - 1]!;
  const target = Date.parse(last.date) - 7 * 86400000;
  let ref = series[0]!;
  for (const p of series) if (Math.abs(Date.parse(p.date) - target) < Math.abs(Date.parse(ref.date) - target)) ref = p;
  const d = Math.round((kgToDisplay(last.kg, units) - kgToDisplay(ref.kg, units)) * 10) / 10;
  return `${d > 0 ? "+" : ""}${d}`;
}
