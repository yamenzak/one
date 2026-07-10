/** Train tab: plan overview → workout player. */

import { useEffect, useState } from "react";
import { Card, Chip, Skeleton, SubCard } from "@mossa/ui";
import { api } from "../../api.js";
import { WorkoutPlayer } from "./WorkoutPlayer.js";

interface Plan {
  id: string;
  name: string;
  status: string;
  body: { days: { name: string; isRestDay?: boolean; blocks?: unknown[] }[] };
}

export function Train({ clientId }: { clientId: string }) {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    void api.get<{ plans: Plan[] }>(`/api/workout-plans?clientId=${clientId}`).then((r) => setPlans(r.plans));
  }, [clientId]);

  if (playing) return <WorkoutPlayer clientId={clientId} />;
  if (!plans) return <Skeleton className="m-4 h-64" />;
  const published = plans.find((p) => p.status === "published");

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <h1 className="text-2xl font-bold">Train</h1>
      {!published ? (
        <Card className="text-center">
          <div className="text-4xl">🏋️</div>
          <h2 className="mt-2 text-lg font-semibold">No plan yet</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Your coach hasn't published a workout plan. Freestyle logging still works from Today → Log.
          </p>
        </Card>
      ) : (
        <>
          <button onClick={() => setPlaying(true)} className="w-full text-left">
            <Card>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{published.name}</h2>
                <Chip tone="good">Start ▶</Chip>
              </div>
              <p className="mt-1 text-sm text-fg-muted">{published.body.days.length} training days — tap to open the player</p>
            </Card>
          </button>
          <div className="space-y-2">
            {published.body.days.map((day, i) => (
              <SubCard key={i} className="flex items-center justify-between bg-surface-1">
                <div>
                  <div className="font-semibold">{day.name || `Day ${i + 1}`}</div>
                  <div className="text-sm text-fg-muted">{day.isRestDay ? "Rest day" : `${day.blocks?.length ?? 0} blocks`}</div>
                </div>
                {day.isRestDay ? <Chip>😴 Rest</Chip> : <Chip tone="activity">▶</Chip>}
              </SubCard>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
