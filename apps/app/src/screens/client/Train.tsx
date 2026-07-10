/** Train tab: today's plan days + quick-start (player lands next phase). */

import { useEffect, useState } from "react";
import { Card, Chip, Skeleton, SubCard } from "@mossa/ui";
import { api } from "../../api.js";

interface Plan {
  id: string;
  name: string;
  status: string;
  body: { days: { name: string; isRestDay?: boolean; blocks?: unknown[] }[] };
}

export function Train({ clientId }: { clientId: string }) {
  const [plans, setPlans] = useState<Plan[] | null>(null);

  useEffect(() => {
    void api.get<{ plans: Plan[] }>(`/api/workout-plans?clientId=${clientId}`).then((r) => setPlans(r.plans));
  }, [clientId]);

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
          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{published.name}</h2>
              <Chip tone="good">Active plan</Chip>
            </div>
          </Card>
          <div className="space-y-3">
            {published.body.days.map((day, i) => (
              <SubCard key={i} className="flex items-center justify-between bg-surface-1">
                <div>
                  <div className="font-semibold">{day.name || `Day ${i + 1}`}</div>
                  <div className="text-sm text-fg-muted">
                    {day.isRestDay ? "Rest day" : `${day.blocks?.length ?? 0} blocks`}
                  </div>
                </div>
                {day.isRestDay ? <Chip>😴 Rest</Chip> : <Chip tone="activity">▶ Start</Chip>}
              </SubCard>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
