/**
 * Workout plan builder — days → blocks → slots → sets. Exercise picker, block
 * types, weight modes, draft/publish, ✦ AI Plan Draft, duplicate-day.
 */

import { useCallback, useEffect, useState } from "react";
import type { WorkoutBody, WorkoutDay, WorkoutBlock, ExerciseSlot, WorkoutSet, WeightMode } from "@mossa/protocol";
import { Button, Card, Badge, Field, Sheet, Skeleton, SubCard, EmptyState, Search, ArrowLeft, Plus, Copy, Trash2, Sparkles, Dumbbell, Moon, X } from "@mossa/ui";
import { api } from "../../api.js";

interface Plan { id: string; clientId: string; name: string; status: string; body: WorkoutBody }
interface ExerciseLite { id: string; name: string; muscle_groups?: string | null }

const WEIGHT_MODES: { value: WeightMode; label: string }[] = [
  { value: "unspecified", label: "Client picks" }, { value: "absolute", label: "Set weight" }, { value: "bodyweight", label: "Bodyweight" }, { value: "percent_1rm", label: "% 1RM" }, { value: "previous_plus", label: "Prev + kg" },
];
const emptySet = (): WorkoutSet => ({ setType: "working", weightMode: "unspecified", restAfterSec: 90, reps: 10 });
const emptySlot = (exerciseId: string): ExerciseSlot => ({ exerciseId, measurementMode: "reps", sets: [emptySet(), emptySet(), emptySet()] });
const emptyBlock = (): WorkoutBlock => ({ type: "single", slots: [] });
const emptyDay = (name: string): WorkoutDay => ({ name, isRestDay: false, blocks: [] });
const selectCls = "rounded-lg bg-surface-3 px-2.5 py-1.5 text-sm outline-none";

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
    const [p, ex] = await Promise.all([api.get<{ plan: Plan }>(`/api/workout-plans/${planId}`), api.get<{ exercises: ExerciseLite[] }>("/api/exercises")]);
    setPlan(p.plan); setDays(p.plan.body.days ?? []); setLibrary(ex.exercises);
  }, [planId]);
  useEffect(() => void load(), [load]);

  const mutate = (fn: (d: WorkoutDay[]) => void) => { const next = structuredClone(days); fn(next); setDays(next); setDirty(true); };
  const save = async () => { setSaving(true); try { await api.patch(`/api/workout-plans/${planId}`, { body: { days } }); setDirty(false); } finally { setSaving(false); } };
  const publish = async () => { await save(); await api.post(`/api/workout-plans/${planId}/publish`); await load(); };
  const runAi = async (instructions: string) => { if (!plan) return; const res = await api.post<{ draft: WorkoutBody }>("/api/ai/draft-plan", { clientId: plan.clientId, instructions }); setDays(res.draft.days); setDirty(true); setAiOpen(false); };

  if (!plan) return <Skeleton className="m-4 h-96" />;
  const day = days[dayIdx];

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 pb-32">
      <div className="flex items-center gap-3">
        <Button size="icon" variant="secondary" onClick={onBack}><ArrowLeft /></Button>
        <h1 className="flex-1 truncate text-xl font-bold tracking-tight">{plan.name}</h1>
        <Badge tone={plan.status === "published" ? "success" : "neutral"}>{plan.status}</Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        {days.map((d, i) => <button key={i} onClick={() => setDayIdx(i)} className={`rounded-full px-4 py-2 text-sm transition-colors ${i === dayIdx ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{d.name || `Day ${i + 1}`}</button>)}
        <button onClick={() => { mutate((d) => d.push(emptyDay(`Day ${days.length + 1}`))); setDayIdx(days.length); }} className="inline-flex items-center gap-1 rounded-full bg-secondary px-4 py-2 text-sm text-muted-foreground [&_svg]:size-4"><Plus /> Day</button>
        {day && <button onClick={() => { mutate((d) => d.splice(dayIdx + 1, 0, { ...structuredClone(d[dayIdx]!), name: `${d[dayIdx]!.name || `Day ${dayIdx + 1}`} (copy)` })); setDayIdx(dayIdx + 1); }} className="inline-flex items-center gap-1 rounded-full bg-secondary px-4 py-2 text-sm text-muted-foreground [&_svg]:size-4"><Copy /> Duplicate</button>}
      </div>

      {days.length === 0 ? (
        <EmptyState icon={Dumbbell} title="Empty plan" description="Add a day, or let AI draft one from the client's intake." action={<Button onClick={() => setAiOpen(true)}><Sparkles /> AI draft plan</Button>} />
      ) : day ? (
        <>
          <Card className="space-y-3">
            <div className="flex items-center gap-2">
              <Field label="Day name" value={day.name} onChange={(e) => mutate((d) => (d[dayIdx]!.name = e.target.value))} className="flex-1" />
              <button onClick={() => mutate((d) => (d[dayIdx]!.isRestDay = !d[dayIdx]!.isRestDay))} className={`mt-6 inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm [&_svg]:size-4 ${day.isRestDay ? "bg-sleep-soft text-sleep" : "bg-secondary text-muted-foreground"}`}><Moon /> Rest</button>
            </div>
          </Card>

          {!day.isRestDay && day.blocks.map((block, blockIdx) => (
            <Card key={blockIdx} className="space-y-3">
              <div className="flex items-center justify-between">
                <select value={block.type} onChange={(e) => mutate((d) => (d[dayIdx]!.blocks[blockIdx]!.type = e.target.value as WorkoutBlock["type"]))} className="rounded-full bg-secondary px-3 py-1.5 text-sm outline-none">
                  <option value="single">Single</option><option value="superset">Superset</option><option value="circuit">Circuit</option><option value="hiit">HIIT</option>
                </select>
                <button onClick={() => mutate((d) => d[dayIdx]!.blocks.splice(blockIdx, 1))} className="grid size-8 place-items-center rounded-full text-danger hover:bg-danger-soft [&_svg]:size-4"><Trash2 /></button>
              </div>
              {block.slots.map((slot, slotIdx) => (
                <SubCard key={slotIdx} className="space-y-2">
                  <div className="flex items-center justify-between"><span className="font-medium">{library.find((e) => e.id === slot.exerciseId)?.name ?? "Exercise"}</span><button onClick={() => mutate((d) => d[dayIdx]!.blocks[blockIdx]!.slots.splice(slotIdx, 1))} className="text-muted-foreground hover:text-danger [&_svg]:size-4"><X /></button></div>
                  {slot.sets.map((set, setIdx) => (
                    <div key={setIdx} className="flex items-center gap-2 text-sm">
                      <span className="w-8 text-muted-foreground">#{setIdx + 1}</span>
                      <input type="number" placeholder="reps" value={set.reps ?? ""} onChange={(e) => mutate((d) => (d[dayIdx]!.blocks[blockIdx]!.slots[slotIdx]!.sets[setIdx]!.reps = e.target.value ? Number(e.target.value) : null))} className={`${selectCls} w-16`} />
                      <select value={set.weightMode} onChange={(e) => mutate((d) => (d[dayIdx]!.blocks[blockIdx]!.slots[slotIdx]!.sets[setIdx]!.weightMode = e.target.value as WeightMode))} className={`${selectCls} flex-1`}>{WEIGHT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
                    </div>
                  ))}
                  <button onClick={() => mutate((d) => d[dayIdx]!.blocks[blockIdx]!.slots[slotIdx]!.sets.push(emptySet()))} className="text-xs font-medium text-primary">+ Set</button>
                </SubCard>
              ))}
              <button onClick={() => setPicker({ blockIdx })} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-secondary py-2.5 text-sm text-muted-foreground [&_svg]:size-4"><Plus /> Add exercise</button>
            </Card>
          ))}

          {!day.isRestDay && (
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => mutate((d) => d[dayIdx]!.blocks.push(emptyBlock()))}><Plus /> Block</Button>
              <Button variant="ghost" className="flex-1" onClick={() => setAiOpen(true)}><Sparkles /> AI draft</Button>
            </div>
          )}
        </>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/40 bg-background/90 p-3 backdrop-blur-xl md:pl-24">
        <div className="mx-auto flex max-w-xl gap-3">
          <Button variant="outline" className="flex-1" disabled={!dirty || saving} onClick={() => void save()}>{saving ? "Saving…" : dirty ? "Save draft" : "Saved"}</Button>
          <Button className="flex-1" onClick={() => void publish()}>{plan.status === "published" ? "Re-publish" : "Publish"}</Button>
        </div>
      </div>

      {picker && <ExercisePicker library={library} onClose={() => setPicker(null)} onPick={(id) => { mutate((d) => d[dayIdx]!.blocks[picker.blockIdx]!.slots.push(emptySlot(id))); setPicker(null); }} />}
      {aiOpen && <AiDraftSheet onClose={() => setAiOpen(false)} onRun={runAi} />}
    </div>
  );
}

function ExercisePicker({ library, onClose, onPick }: { library: ExerciseLite[]; onClose: () => void; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const filtered = library.filter((e) => e.name.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
  return (
    <Sheet open onClose={onClose} title="Add exercise">
      <Field label="Search" icon={Search} value={q} onChange={(e) => setQ(e.target.value)} className="mb-3" />
      <div className="max-h-96 space-y-1 overflow-y-auto">
        {filtered.map((e) => <button key={e.id} onClick={() => onPick(e.id)} className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition-colors hover:bg-secondary"><span>{e.name}</span><span className="text-xs text-muted-foreground">{(e.muscle_groups ?? "").split(",")[0]}</span></button>)}
      </div>
    </Sheet>
  );
}

function AiDraftSheet({ onClose, onRun }: { onClose: () => void; onRun: (i: string) => Promise<void> }) {
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open onClose={onClose} title="AI Plan Draft">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Generate a starting draft from this client's intake and your library. You'll review and edit before publishing.</p>
        <Field label="Instructions (optional)" icon={Sparkles} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. 4-day upper/lower, dumbbells only" />
        <Button size="lg" className="w-full" disabled={busy} onClick={async () => { setBusy(true); try { await onRun(instructions); } finally { setBusy(false); } }}>{busy ? "Drafting…" : "Generate draft"}</Button>
      </div>
    </Sheet>
  );
}
