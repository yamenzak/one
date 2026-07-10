/**
 * Workout plan builder (DESIGN.md §3, SPEC §8.3) — days → blocks → slots →
 * sets editor. Exercise picker from the library, block types, weight modes,
 * draft/publish lifecycle, and AI Plan Draft. Persists the WorkoutBody JSON.
 */

import { useCallback, useEffect, useState } from "react";
import type { WorkoutBody, WorkoutDay, WorkoutBlock, ExerciseSlot, WorkoutSet, WeightMode } from "@mossa/protocol";
import { Button, Card, Chip, Field, Sheet, Skeleton, SubCard } from "@mossa/ui";
import { api } from "../../api.js";

interface Plan {
  id: string;
  clientId: string;
  name: string;
  status: string;
  body: WorkoutBody;
}
interface ExerciseLite {
  id: string;
  name: string;
  muscle_groups?: string | null;
}

const WEIGHT_MODES: { value: WeightMode; label: string }[] = [
  { value: "unspecified", label: "Client picks" },
  { value: "absolute", label: "Set weight" },
  { value: "bodyweight", label: "Bodyweight" },
  { value: "percent_1rm", label: "% 1RM" },
  { value: "previous_plus", label: "Prev + kg" },
];

const emptySet = (): WorkoutSet => ({ setType: "working", weightMode: "unspecified", restAfterSec: 90, reps: 10 });
const emptySlot = (exerciseId: string): ExerciseSlot => ({ exerciseId, measurementMode: "reps", sets: [emptySet(), emptySet(), emptySet()] });
const emptyBlock = (): WorkoutBlock => ({ type: "single", slots: [] });
const emptyDay = (name: string): WorkoutDay => ({ name, isRestDay: false, blocks: [] });

export function WorkoutBuilder({ planId, onBack }: { planId: string; onBack: () => void }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [days, setDays] = useState<WorkoutDay[]>([]);
  const [dayIdx, setDayIdx] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [library, setLibrary] = useState<ExerciseLite[]>([]);
  const [picker, setPicker] = useState<{ blockIdx: number } | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  const load = useCallback(async () => {
    const [p, ex] = await Promise.all([
      api.get<{ plan: Plan }>(`/api/workout-plans/${planId}`),
      api.get<{ exercises: ExerciseLite[] }>("/api/exercises"),
    ]);
    setPlan(p.plan);
    setDays(p.plan.body.days ?? []);
    setLibrary(ex.exercises);
  }, [planId]);

  useEffect(() => {
    void load();
  }, [load]);

  const mutate = (fn: (draft: WorkoutDay[]) => void) => {
    const next = structuredClone(days);
    fn(next);
    setDays(next);
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/api/workout-plans/${planId}`, { body: { days } });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    await save();
    await api.post(`/api/workout-plans/${planId}/publish`);
    await load();
  };

  const runAi = async (instructions: string) => {
    if (!plan) return;
    const res = await api.post<{ draft: WorkoutBody }>("/api/ai/draft-plan", { clientId: plan.clientId, instructions });
    setDays(res.draft.days);
    setDirty(true);
    setAiOpen(false);
  };

  if (!plan) return <Skeleton className="m-4 h-96" />;
  const day = days[dayIdx];

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 pb-32">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="grid size-10 place-items-center rounded-full bg-surface-2">←</button>
        <h1 className="flex-1 text-xl font-bold">{plan.name}</h1>
        <Chip tone={plan.status === "published" ? "good" : "neutral"}>{plan.status}</Chip>
      </div>

      {/* Day tabs */}
      <div className="flex flex-wrap gap-2">
        {days.map((d, i) => (
          <button key={i} onClick={() => setDayIdx(i)} className={`rounded-full px-4 py-2 text-sm ${i === dayIdx ? "bg-primary-container text-on-primary-container" : "bg-surface-2 text-fg"}`}>
            {d.name || `Day ${i + 1}`}
          </button>
        ))}
        <button onClick={() => (mutate((d) => d.push(emptyDay(`Day ${days.length + 1}`))), setDayIdx(days.length))} className="rounded-full bg-surface-2 px-4 py-2 text-sm text-fg-muted">
          ＋ Day
        </button>
      </div>

      {days.length === 0 ? (
        <Card className="text-center">
          <p className="text-fg-muted">Empty plan. Add a day, or let AI draft one from the client's intake.</p>
          <Button className="mt-3" onClick={() => setAiOpen(true)}>✦ AI draft plan</Button>
        </Card>
      ) : day ? (
        <>
          <Card className="space-y-3">
            <div className="flex items-center gap-2">
              <Field label="Day name" icon="📅" value={day.name} onChange={(e) => mutate((d) => (d[dayIdx]!.name = e.target.value))} className="flex-1" />
              <button
                onClick={() => mutate((d) => (d[dayIdx]!.isRestDay = !d[dayIdx]!.isRestDay))}
                className={`rounded-full px-4 py-2 text-sm ${day.isRestDay ? "bg-sleep-container text-sleep" : "bg-surface-2 text-fg-muted"}`}
              >
                😴 Rest
              </button>
            </div>
          </Card>

          {!day.isRestDay &&
            day.blocks.map((block, blockIdx) => (
              <Card key={blockIdx} className="space-y-3">
                <div className="flex items-center justify-between">
                  <select
                    value={block.type}
                    onChange={(e) => mutate((d) => (d[dayIdx]!.blocks[blockIdx]!.type = e.target.value as WorkoutBlock["type"]))}
                    className="rounded-full bg-surface-2 px-3 py-1.5 text-sm"
                  >
                    <option value="single">Single</option>
                    <option value="superset">Superset</option>
                    <option value="circuit">Circuit</option>
                    <option value="hiit">HIIT</option>
                  </select>
                  <button onClick={() => mutate((d) => d[dayIdx]!.blocks.splice(blockIdx, 1))} className="text-sm text-bad">Remove</button>
                </div>

                {block.slots.map((slot, slotIdx) => (
                  <SubCard key={slotIdx} className="space-y-2 bg-surface-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{library.find((e) => e.id === slot.exerciseId)?.name ?? "Exercise"}</span>
                      <button onClick={() => mutate((d) => d[dayIdx]!.blocks[blockIdx]!.slots.splice(slotIdx, 1))} className="text-xs text-bad">✕</button>
                    </div>
                    {slot.sets.map((set, setIdx) => (
                      <div key={setIdx} className="flex items-center gap-2 text-sm">
                        <span className="w-10 text-fg-muted">#{setIdx + 1}</span>
                        <input
                          type="number"
                          placeholder="reps"
                          value={set.reps ?? ""}
                          onChange={(e) => mutate((d) => (d[dayIdx]!.blocks[blockIdx]!.slots[slotIdx]!.sets[setIdx]!.reps = e.target.value ? Number(e.target.value) : null))}
                          className="w-16 rounded-lg bg-surface-3 px-2 py-1"
                        />
                        <select
                          value={set.weightMode}
                          onChange={(e) => mutate((d) => (d[dayIdx]!.blocks[blockIdx]!.slots[slotIdx]!.sets[setIdx]!.weightMode = e.target.value as WeightMode))}
                          className="flex-1 rounded-lg bg-surface-3 px-2 py-1"
                        >
                          {WEIGHT_MODES.map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                    <button onClick={() => mutate((d) => d[dayIdx]!.blocks[blockIdx]!.slots[slotIdx]!.sets.push(emptySet()))} className="text-xs text-primary">＋ Set</button>
                  </SubCard>
                ))}

                <button onClick={() => setPicker({ blockIdx })} className="w-full rounded-2xl bg-surface-2 py-2 text-sm text-fg-muted">
                  ＋ Add exercise
                </button>
              </Card>
            ))}

          {!day.isRestDay && (
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => mutate((d) => d[dayIdx]!.blocks.push(emptyBlock()))}>＋ Block</Button>
              <Button variant="ghost" className="flex-1" onClick={() => setAiOpen(true)}>✦ AI draft</Button>
            </div>
          )}
        </>
      ) : null}

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-surface-2 bg-bg/95 p-3 backdrop-blur md:pl-20">
        <div className="mx-auto flex max-w-xl gap-3">
          <Button variant="outline" className="flex-1" disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? "Saving…" : dirty ? "Save draft" : "Saved"}
          </Button>
          <Button className="flex-1" onClick={() => void publish()}>
            {plan.status === "published" ? "Re-publish" : "Publish"}
          </Button>
        </div>
      </div>

      {/* Exercise picker */}
      {picker && (
        <ExercisePicker
          library={library}
          onClose={() => setPicker(null)}
          onPick={(id) => {
            mutate((d) => d[dayIdx]!.blocks[picker.blockIdx]!.slots.push(emptySlot(id)));
            setPicker(null);
          }}
        />
      )}

      {aiOpen && <AiDraftSheet onClose={() => setAiOpen(false)} onRun={runAi} />}
    </div>
  );
}

// (clientId is carried on the fetched Plan and read directly in runAi.)

function ExercisePicker({ library, onClose, onPick }: { library: ExerciseLite[]; onClose: () => void; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const filtered = library.filter((e) => e.name.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
  return (
    <Sheet open onClose={onClose} title="Add exercise">
      <Field label="Search" icon="🔍" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3" />
      <div className="max-h-96 space-y-1 overflow-y-auto">
        {filtered.map((e) => (
          <button key={e.id} onClick={() => onPick(e.id)} className="flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left hover:bg-surface-2">
            <span>{e.name}</span>
            <span className="text-xs text-fg-muted">{(e.muscle_groups ?? "").split(",")[0]}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function AiDraftSheet({ onClose, onRun }: { onClose: () => void; onRun: (instructions: string) => Promise<void> }) {
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open onClose={onClose} title="✦ AI Plan Draft">
      <div className="space-y-4">
        <p className="text-sm text-fg-muted">
          Generate a starting draft from this client's intake and your exercise library. You'll review
          and edit before publishing — nothing goes live automatically.
        </p>
        <Field label="Instructions (optional)" icon="💬" value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. 4-day upper/lower, dumbbells only" />
        <Button
          size="lg"
          className="w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onRun(instructions);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Drafting…" : "Generate draft"}
        </Button>
      </div>
    </Sheet>
  );
}

