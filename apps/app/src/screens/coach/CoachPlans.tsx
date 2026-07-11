/** Coach: workout + meal plans for a client — list, create, open builder. */

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Badge, Field, Sheet, Skeleton, SegmentedControl, Page, Stagger, EmptyState, Dumbbell, Utensils, Plus } from "@mossa/ui";
import { api } from "../../api.js";
import { WorkoutBuilder } from "./WorkoutBuilder.js";
import { MealBuilder } from "./MealBuilder.js";

interface Plan { id: string; name: string; status: string; publishedAt: string | null }
type Kind = "workout" | "meal";

export function CoachPlans({ clientId }: { clientId: string }) {
  const [kind, setKind] = useState<Kind>("workout");
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const endpoint = kind === "workout" ? "workout-plans" : "meal-plans";

  const load = useCallback(async () => { setPlans((await api.get<{ plans: Plan[] }>(`/api/${endpoint}?clientId=${clientId}`)).plans); }, [clientId, endpoint]);
  useEffect(() => { setPlans(null); void load(); }, [load]);

  const create = async () => { const r = await api.post<{ plan: Plan }>(`/api/${endpoint}`, { clientId, name }); setCreateOpen(false); setName(""); setEditing(r.plan.id); };

  if (editing) {
    const back = () => { setEditing(null); void load(); };
    return kind === "workout" ? <WorkoutBuilder planId={editing} onBack={back} /> : <MealBuilder planId={editing} onBack={back} />;
  }

  return (
    <Page className="mx-auto max-w-xl space-y-3 p-4 pb-28">
      <SegmentedControl options={[{ value: "workout", label: "Workout" }, { value: "meal", label: "Meal" }]} value={kind} onChange={setKind} />
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold capitalize">{kind} plans</h2>
        <Button size="sm" onClick={() => setCreateOpen(true)}><Plus /> New</Button>
      </div>
      {!plans ? <Skeleton className="h-64" /> : plans.length === 0 ? (
        <EmptyState icon={kind === "workout" ? Dumbbell : Utensils} title={`No ${kind} plans`} description={kind === "workout" ? "Create one and build it — or use ✦ AI draft inside the builder." : "Create one and build the options bank."} />
      ) : (
        <Stagger className="space-y-2">
          {plans.map((p) => (
            <Card key={p.id} interactive onClick={() => setEditing(p.id)} className="flex items-center justify-between">
              <div><div className="font-semibold">{p.name}</div>{p.publishedAt && <div className="text-xs text-muted-foreground">Published {new Date(p.publishedAt).toLocaleDateString()}</div>}</div>
              <Badge tone={p.status === "published" ? "success" : p.status === "draft" ? "neutral" : "warning"}>{p.status}</Badge>
            </Card>
          ))}
        </Stagger>
      )}
      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title={`New ${kind} plan`}>
        <div className="space-y-4">
          <Field label="Plan name" icon={kind === "workout" ? Dumbbell : Utensils} value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "workout" ? "Push Pull Legs" : "Cutting Plan"} />
          <Button size="lg" className="w-full" disabled={name.trim().length < 2} onClick={() => void create()}>Create &amp; build</Button>
        </div>
      </Sheet>
    </Page>
  );
}
