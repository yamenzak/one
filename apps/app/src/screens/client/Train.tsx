/** Train tab — plan overview → workout player. */

import { useEffect, useState } from "react";
import { Card, Badge, Skeleton, Page, Stagger, EmptyState, Dumbbell, Play, Moon, ChevronRight } from "@mossa/ui";
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
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <h1 className="text-2xl font-bold tracking-tight">Train</h1>
      {!published ? (
        <EmptyState icon={Dumbbell} title="No plan yet" description="Your coach hasn't published a workout plan. Freestyle logging still works from Today." />
      ) : (
        <>
          <Stagger>
            <button onClick={() => setPlaying(true)} className="w-full text-left">
              <Card interactive className="relative overflow-hidden">
                <div className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-primary/10 blur-2xl" />
                <div className="relative flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-primary">Active plan</div>
                    <h2 className="mt-0.5 text-xl font-semibold tracking-tight">{published.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{published.body.days.length} training days</p>
                  </div>
                  <div className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground [&_svg]:size-5">
                    <Play />
                  </div>
                </div>
              </Card>
            </button>
          </Stagger>
          <Stagger className="space-y-2">
            {published.body.days.map((day, i) => (
              <Card key={i} className="flex items-center justify-between py-3.5">
                <div className="flex items-center gap-3">
                  <div className={`grid size-10 place-items-center rounded-xl [&_svg]:size-[1.1rem] ${day.isRestDay ? "bg-sleep-soft text-sleep" : "bg-activity-soft text-activity"}`}>
                    {day.isRestDay ? <Moon /> : <Dumbbell />}
                  </div>
                  <div>
                    <div className="font-medium">{day.name || `Day ${i + 1}`}</div>
                    <div className="text-sm text-muted-foreground">{day.isRestDay ? "Rest day" : `${day.blocks?.length ?? 0} blocks`}</div>
                  </div>
                </div>
                {day.isRestDay ? <Badge tone="sleep">Rest</Badge> : <ChevronRight className="size-5 text-muted-foreground" />}
              </Card>
            ))}
          </Stagger>
        </>
      )}
    </Page>
  );
}
