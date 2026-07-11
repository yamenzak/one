/**
 * Client Today — hero ring + metric pills, action row, timeline feed.
 */

import { useCallback, useEffect, useState } from "react";
import { currentStreak } from "@mossa/domain";
import {
  Button, Card, SubCard, Skeleton, ProgressRing, MetricPill, InsightCard, WavyDivider, Badge,
  Page, Stagger, Plus, Play, PencilLine, Zap, Droplet, Flame, Trophy, ClipboardList, Dumbbell, FlaskConical, TrendingUp,
} from "@mossa/ui";
import { api, todayLocal } from "../../api.js";
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
          tone="nutrition"
          label="Calories"
          value={Math.max(0, Math.round(net)).toLocaleString()}
          sublabel={calTarget > 0 ? `of ${calTarget.toLocaleString()}` : "set a goal"}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <MetricPill icon={Zap} label="Protein" tone="activity" value={`${data.nutrition.proteinG} g`} progress={targets?.targetProteinG ? data.nutrition.proteinG / targets.targetProteinG : undefined} />
          <MetricPill icon={Droplet} label="Water" tone="hydration" value={`${(data.waterMl / 1000).toFixed(1)} L`} progress={data.waterMl / waterTarget} />
          <MetricPill icon={Flame} label="Burned" tone="cardio" value={`${data.burnedKcal.toLocaleString()}`} />
        </div>
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
        <Widget icon={Flame} tone="nutrition" value={data.checkInDates ? currentStreak(new Set(data.checkInDates), date) : 0} label="Day streak" />
        <Widget icon={TrendingUp} tone="activity" value={weightDelta(data.weightSeries)} label="7-day kg" />
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

const TONE_TEXT = { nutrition: "text-nutrition", activity: "text-activity", cardio: "text-cardio" } as const;
function Widget({ icon: Icon, tone, value, label }: { icon: typeof Flame; tone: keyof typeof TONE_TEXT; value: number | string; label: string }) {
  return (
    <Card className="flex flex-col items-center gap-1 p-3 text-center">
      <Icon className={`size-4 ${TONE_TEXT[tone]}`} />
      <div className="numeral text-xl font-semibold">{value}</div>
      <div className="text-[0.65rem] text-muted-foreground">{label}</div>
    </Card>
  );
}

function weightDelta(series?: { kg: number; date: string }[]): string {
  if (!series || series.length < 2) return "—";
  const last = series[series.length - 1]!;
  const target = Date.parse(last.date) - 7 * 86400000;
  let ref = series[0]!;
  for (const p of series) if (Math.abs(Date.parse(p.date) - target) < Math.abs(Date.parse(ref.date) - target)) ref = p;
  const d = Math.round((last.kg - ref.kg) * 10) / 10;
  return `${d > 0 ? "+" : ""}${d}`;
}
