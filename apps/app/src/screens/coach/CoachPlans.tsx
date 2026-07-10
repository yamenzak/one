/** Coach: workout plans for a client — list, create, open the builder. */

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Chip, Field, Sheet, Skeleton } from "@mossa/ui";
import { api } from "../../api.js";
import { WorkoutBuilder } from "./WorkoutBuilder.js";

interface Plan {
  id: string;
  name: string;
  status: string;
  publishedAt: string | null;
}

export function CoachPlans({ clientId }: { clientId: string }) {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    const r = await api.get<{ plans: Plan[] }>(`/api/workout-plans?clientId=${clientId}`);
    setPlans(r.plans);
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    const r = await api.post<{ plan: Plan }>("/api/workout-plans", { clientId, name });
    setCreateOpen(false);
    setName("");
    setEditing(r.plan.id);
  };

  if (editing) return <WorkoutBuilder planId={editing} onBack={() => (setEditing(null), void load())} />;
  if (!plans) return <Skeleton className="m-4 h-64" />;

  return (
    <div className="mx-auto max-w-xl space-y-3 p-4 pb-28">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Workout plans</h2>
        <Button onClick={() => setCreateOpen(true)}>＋ New plan</Button>
      </div>
      {plans.length === 0 ? (
        <Card className="text-center text-sm text-fg-muted">
          No plans yet. Create one and build it block by block — or use ✦ AI draft inside the builder.
        </Card>
      ) : (
        plans.map((p) => (
          <button key={p.id} onClick={() => setEditing(p.id)} className="flex w-full items-center justify-between rounded-[--radius-card] bg-surface-1 p-4 text-left">
            <div>
              <div className="font-semibold">{p.name}</div>
              {p.publishedAt && <div className="text-xs text-fg-muted">Published {new Date(p.publishedAt).toLocaleDateString()}</div>}
            </div>
            <Chip tone={p.status === "published" ? "good" : p.status === "draft" ? "neutral" : "warn"}>{p.status}</Chip>
          </button>
        ))
      )}
      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title="New workout plan">
        <div className="space-y-4">
          <Field label="Plan name" icon="🏋️" value={name} onChange={(e) => setName(e.target.value)} placeholder="Push Pull Legs" />
          <Button size="lg" className="w-full" disabled={name.trim().length < 2} onClick={() => void create()}>
            Create & build
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
