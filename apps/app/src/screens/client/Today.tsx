/**
 * Client Today (DESIGN.md §3): hero calorie ring + domain pills, Log/Start
 * action row, timeline feed. Scoped by clientId — the same component renders
 * for the client themself AND inside the trainer's client detail.
 */

import { useCallback, useEffect, useState } from "react";
import { Button, Card, InsightCard, MetricPill, ProgressRing, Skeleton, SubCard, WavyDivider } from "@mossa/ui";
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
}

export function Today({ clientId }: { clientId: string }) {
  const [data, setData] = useState<TodayBundle | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const date = todayLocal();

  const load = useCallback(async () => {
    const bundle = await api.get<TodayBundle>(`/api/today?clientId=${clientId}&date=${date}`);
    setData(bundle);
  }, [clientId, date]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-56" />
        <Skeleton className="h-14" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const targets = data.goal?.targets ?? null;
  const calTarget = targets?.targetCalories ?? 0;
  const net = data.nutrition.calories - data.burnedKcal;
  const waterTarget = targets?.targetWaterMl ?? 2500;

  return (
    <div className="mx-auto max-w-xl space-y-5 p-4 pb-28">
      {/* Hero: ring + pills */}
      <div className="flex items-center gap-4">
        <ProgressRing
          progress={calTarget > 0 ? net / calTarget : 0}
          size={190}
          tone="nutrition"
          value={<span>{Math.max(0, Math.round(net)).toLocaleString()}</span>}
          arcLabelTop="Calories"
          arcLabelBottom={calTarget > 0 ? `of ${calTarget.toLocaleString()}` : "no target yet"}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <MetricPill icon="🥩" label="Protein" tone="activity" value={`${data.nutrition.proteinG} g`} progress={targets?.targetProteinG ? data.nutrition.proteinG / targets.targetProteinG : undefined} />
          <MetricPill icon="💧" label="Water" tone="hydration" value={`${(data.waterMl / 1000).toFixed(1)} L`} progress={data.waterMl / waterTarget} />
          <MetricPill icon="🔥" label="Burned" tone="cardio" value={`${data.burnedKcal.toLocaleString()} kcal`} />
        </div>
      </div>

      {/* Action row */}
      <div className="flex items-center gap-3">
        <Button size="lg" className="flex-1" onClick={() => setLogOpen(true)}>
          ＋ Log
        </Button>
        <Button size="lg" className="flex-1" variant="tonal">
          🏃 Start
        </Button>
        <Button variant="circle" aria-label="Customize">
          ✏️
        </Button>
      </div>

      {/* Feed */}
      <div>
        {!data.checkedIn && (
          <InsightCard timestamp="Today" title="Check in" ai>
            <SubCard>
              <p className="text-sm text-fg-muted">
                A 30-second check-in keeps your coach in the loop — weight, mood, sleep.
              </p>
              <Button className="mt-3" onClick={() => setLogOpen(true)}>
                Check in now
              </Button>
            </SubCard>
          </InsightCard>
        )}
        {data.workout.loggedSets > 0 && (
          <InsightCard timestamp="Today" title="Workout logged">
            <SubCard>
              <div className="text-sm text-fg-muted">Sets completed</div>
              <div className="numeral text-4xl font-semibold">{data.workout.loggedSets}</div>
            </SubCard>
          </InsightCard>
        )}
        {data.publishedWorkoutPlan && (
          <InsightCard timestamp="Your plan" title={data.publishedWorkoutPlan.name}>
            <SubCard>
              <p className="text-sm text-fg-muted">
                {data.publishedWorkoutPlan.body.days.length} training days — head to Train to start
                today's session.
              </p>
            </SubCard>
          </InsightCard>
        )}
        <WavyDivider label="Yesterday" />
        <Card className="text-center text-sm text-fg-muted">
          Your history feed grows here as you log.
        </Card>
      </div>

      <LogSheet open={logOpen} onClose={() => setLogOpen(false)} clientId={clientId} onLogged={() => void load()} />
    </div>
  );
}
