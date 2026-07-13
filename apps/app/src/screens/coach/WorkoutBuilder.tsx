/**
 * Workout plan builder — days → blocks → slots → sets. Full set richness
 * (all weight modes, rpe/rir/tempo/rest, measurement modes), block config
 * (rounds/rests), exercise picker, draft/publish, ✦ AI draft, duplicate-day,
 * export-to-template.
 */

import { useCallback, useEffect, useState } from "react";
import type { WorkoutBody, WorkoutDay, WorkoutBlock, ExerciseSlot, WorkoutSet, WeightMode, MeasurementMode } from "@mossa/protocol";
import { Button, Card, Badge, Field, Sheet, Skeleton, SubCard, EmptyState, SegmentedControl, Chip, Switch, Page, Stagger, Search, ArrowLeft, Plus, Copy, Trash2, Sparkles, Dumbbell, Moon, ChevronRight, Save, X } from "@mossa/ui";
import { api } from "../../api.js";
import { AiErrorBox } from "../../AiError.js";
import { ExerciseThumb, ExerciseMeta, splitList, pretty, type ExerciseInfo } from "../exercise.js";
import { ExerciseEditor } from "./ExerciseEditor.js";

interface Plan { id: string; clientId: string; name: string; status: string; body: WorkoutBody }
type ExerciseLite = ExerciseInfo;

const WEIGHT_MODES: { value: WeightMode; label: string; unit?: string }[] = [
  { value: "unspecified", label: "Client picks" },
  { value: "absolute", label: "Set weight", unit: "kg" },
  { value: "bodyweight", label: "Bodyweight" },
  { value: "percent_1rm", label: "% 1RM", unit: "%" },
  { value: "previous_plus", label: "Prev + kg", unit: "+kg" },
  { value: "previous_times", label: "Prev × mult", unit: "×" },
  { value: "dropset", label: "Dropset from", unit: "kg" },
];
const MEASURE_MODES: { value: MeasurementMode; label: string }[] = [
  { value: "reps", label: "Reps" }, { value: "time", label: "Time" }, { value: "distance", label: "Distance" }, { value: "reps_in_time", label: "Reps in time" },
];
const SET_TYPES = ["warmup", "working", "amrap"] as const;

const emptySetFor = (mode: MeasurementMode): WorkoutSet => ({
  setType: "working", weightMode: "unspecified", restAfterSec: 90,
  reps: mode === "reps" || mode === "reps_in_time" ? 10 : null,
});
const emptySlot = (exerciseId: string): ExerciseSlot => ({ exerciseId, measurementMode: "reps", sets: [emptySetFor("reps"), emptySetFor("reps"), emptySetFor("reps")] });

/** Drop the measure fields that don't apply to a mode, so a set never carries
 *  stale reps/time/distance after the coach switches how it's measured. */
function normalizeSetForMode(set: WorkoutSet, mode: MeasurementMode): void {
  if (mode !== "reps" && mode !== "reps_in_time") set.reps = null;
  if (mode !== "time" && mode !== "reps_in_time") set.timeSec = null;
  if (mode !== "distance") set.distanceM = null;
}
const emptyBlock = (): WorkoutBlock => ({ type: "single", slots: [] });
const emptyDay = (name: string): WorkoutDay => ({ name, isRestDay: false, blocks: [] });
const inputCls = "rounded-lg bg-surface-3 px-2.5 py-1.5 text-sm outline-none ring-ring focus:ring-2";

export function WorkoutBuilder({ planId, onBack }: { planId: string; onBack: () => void }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [days, setDays] = useState<WorkoutDay[]>([]);
  const [dayIdx, setDayIdx] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [library, setLibrary] = useState<ExerciseLite[]>([]);
  const [picker, setPicker] = useState<{ blockIdx: number } | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [copyWeekOpen, setCopyWeekOpen] = useState(false);

  const load = useCallback(async () => {
    const [p, ex] = await Promise.all([api.get<{ plan: Plan }>(`/api/workout-plans/${planId}`), api.get<{ exercises: ExerciseLite[] }>("/api/exercises")]);
    setPlan(p.plan); setDays(p.plan.body.days ?? []); setLibrary(ex.exercises);
  }, [planId]);
  useEffect(() => void load(), [load]);

  const mutate = (fn: (d: WorkoutDay[]) => void) => { const next = structuredClone(days); fn(next); setDays(next); setDirty(true); };
  const save = async () => { setSaving(true); try { await api.patch(`/api/workout-plans/${planId}`, { body: { days } }); setDirty(false); } finally { setSaving(false); } };
  const publish = async () => { await save(); await api.post(`/api/workout-plans/${planId}/publish`); await load(); };
  const runAi = async (instructions: string) => { if (!plan) return; const res = await api.post<{ draft: WorkoutBody }>("/api/ai/draft-plan", { clientId: plan.clientId, instructions }); setDays(res.draft.days); setDirty(true); setAiOpen(false); };

  // Copy week: duplicate every current day as a new mesocycle week, with an
  // optional linear progression (reps / load / %1RM) applied to each set.
  const copyWeek = (label: string, repBump: number, loadBump: number) => {
    const start = days.length;
    mutate((d) => {
      const clones = d.map((day) => ({
        ...structuredClone(day),
        name: `${day.name || "Day"}${label ? ` · ${label}` : ""}`,
        blocks: day.blocks.map((b) => ({
          ...structuredClone(b),
          slots: b.slots.map((s) => ({
            ...structuredClone(s),
            sets: s.sets.map((set) => ({
              ...set,
              reps: set.reps != null ? Math.max(1, set.reps + repBump) : set.reps,
              weightValue: set.weightValue != null && (set.weightMode === "absolute" || set.weightMode === "dropset") ? Math.round((set.weightValue + loadBump) * 100) / 100 : set.weightValue,
              percent1rm: set.percent1rm != null && set.weightMode === "percent_1rm" ? Math.min(100, set.percent1rm + loadBump) : set.percent1rm,
            })),
          })),
        })),
      }));
      d.push(...clones);
    });
    setDayIdx(start);
    setCopyWeekOpen(false);
  };

  if (!plan) return <Skeleton className="m-4 h-96" />;
  const day = days[dayIdx];
  const exOf = (id: string) => library.find((e) => e.id === id);
  const nameOf = (id: string) => exOf(id)?.name ?? "Exercise";

  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-32">
      <div className="flex items-center gap-3">
        <Button size="icon" variant="secondary" onClick={onBack}><ArrowLeft /></Button>
        <h1 className="flex-1 truncate text-xl font-bold tracking-tight">{plan.name}</h1>
        <Badge tone={plan.status === "published" ? "success" : "neutral"}>{plan.status}</Badge>
        <Button size="icon" variant="secondary" aria-label="Save as template" onClick={() => setExportOpen(true)}><Save /></Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {days.map((d, i) => <button key={i} onClick={() => setDayIdx(i)} className={`rounded-full px-4 py-2 text-sm transition-colors ${i === dayIdx ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{d.name || `Day ${i + 1}`}</button>)}
        <button onClick={() => { mutate((d) => d.push(emptyDay(`Day ${days.length + 1}`))); setDayIdx(days.length); }} className="inline-flex items-center gap-1 rounded-full bg-secondary px-4 py-2 text-sm text-muted-foreground [&_svg]:size-4"><Plus /> Day</button>
        {day && <button onClick={() => { mutate((d) => d.splice(dayIdx + 1, 0, { ...structuredClone(d[dayIdx]!), name: `${d[dayIdx]!.name || `Day ${dayIdx + 1}`} (copy)` })); setDayIdx(dayIdx + 1); }} className="inline-flex items-center gap-1 rounded-full bg-secondary px-4 py-2 text-sm text-muted-foreground [&_svg]:size-4"><Copy /> Duplicate</button>}
        {days.length > 0 && <button onClick={() => setCopyWeekOpen(true)} className="inline-flex items-center gap-1 rounded-full bg-secondary px-4 py-2 text-sm text-muted-foreground [&_svg]:size-4"><Copy /> Copy week</button>}
      </div>

      <Stagger className="space-y-4">
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

              {block.type !== "single" && (
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <label className="flex flex-col gap-1 text-muted-foreground">Rounds<input type="number" value={block.rounds ?? ""} placeholder="1" onChange={(e) => mutate((d) => (d[dayIdx]!.blocks[blockIdx]!.rounds = e.target.value ? Number(e.target.value) : null))} className={inputCls} /></label>
                  <label className="flex flex-col gap-1 text-muted-foreground">Rest/exercise<input type="number" value={block.restBetweenExercisesSec ?? ""} placeholder="s" onChange={(e) => mutate((d) => (d[dayIdx]!.blocks[blockIdx]!.restBetweenExercisesSec = e.target.value ? Number(e.target.value) : null))} className={inputCls} /></label>
                  <label className="flex flex-col gap-1 text-muted-foreground">Rest/round<input type="number" value={block.restBetweenRoundsSec ?? ""} placeholder="s" onChange={(e) => mutate((d) => (d[dayIdx]!.blocks[blockIdx]!.restBetweenRoundsSec = e.target.value ? Number(e.target.value) : null))} className={inputCls} /></label>
                </div>
              )}

              {block.slots.map((slot, slotIdx) => (
                <SubCard key={slotIdx} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <ExerciseThumb thumb={exOf(slot.exerciseId)?.thumb_url} thumb2={exOf(slot.exerciseId)?.thumb2_url} size={34} />
                    <span className="min-w-0 flex-1 truncate font-medium">{nameOf(slot.exerciseId)}</span>
                    <select value={slot.measurementMode} onChange={(e) => { const nm = e.target.value as MeasurementMode; mutate((d) => { const sl = d[dayIdx]!.blocks[blockIdx]!.slots[slotIdx]!; sl.measurementMode = nm; sl.sets.forEach((s) => normalizeSetForMode(s, nm)); }); }} className="rounded-lg bg-surface-3 px-2 py-1 text-xs outline-none">{MEASURE_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
                    <button onClick={() => mutate((d) => d[dayIdx]!.blocks[blockIdx]!.slots.splice(slotIdx, 1))} className="text-muted-foreground hover:text-danger [&_svg]:size-4"><X /></button>
                  </div>
                  {slot.sets.map((set, setIdx) => (
                    <SetRow key={setIdx} set={set} index={setIdx} mode={slot.measurementMode}
                      onPatch={(p) => mutate((d) => Object.assign(d[dayIdx]!.blocks[blockIdx]!.slots[slotIdx]!.sets[setIdx]!, p))}
                      onRemove={() => mutate((d) => d[dayIdx]!.blocks[blockIdx]!.slots[slotIdx]!.sets.splice(setIdx, 1))} />
                  ))}
                  <button onClick={() => mutate((d) => d[dayIdx]!.blocks[blockIdx]!.slots[slotIdx]!.sets.push(emptySetFor(slot.measurementMode)))} className="text-xs font-medium text-primary">+ Set</button>
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
      </Stagger>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/40 bg-background/90 p-3 backdrop-blur-xl md:pl-24">
        <div className="mx-auto flex max-w-xl gap-3">
          <Button variant="outline" className="flex-1" disabled={!dirty || saving} onClick={() => void save()}>{saving ? "Saving…" : dirty ? "Save draft" : "Saved"}</Button>
          <Button className="flex-1" onClick={() => void publish()}>{plan.status === "published" ? "Re-publish" : "Publish"}</Button>
        </div>
      </div>

      {picker && <ExercisePicker library={library} reloadLibrary={load} onClose={() => setPicker(null)} onPick={(id) => { mutate((d) => d[dayIdx]!.blocks[picker.blockIdx]!.slots.push(emptySlot(id))); setPicker(null); }} />}
      {aiOpen && <AiDraftSheet onClose={() => setAiOpen(false)} onRun={runAi} />}
      {exportOpen && <ExportTemplateSheet body={{ days }} defaultName={plan.name} onClose={() => setExportOpen(false)} />}
      {copyWeekOpen && <CopyWeekSheet dayCount={days.length} onClose={() => setCopyWeekOpen(false)} onCopy={copyWeek} />}
    </Page>
  );
}

/**
 * Copy week — duplicate the whole day-set as the next mesocycle week, with an
 * optional linear progression baked into every set (reps / load / %1RM).
 */
function CopyWeekSheet({ dayCount, onClose, onCopy }: { dayCount: number; onClose: () => void; onCopy: (label: string, repBump: number, loadBump: number) => void }) {
  const [label, setLabel] = useState("Week 2");
  const [reps, setReps] = useState("0");
  const [load, setLoad] = useState("0");
  return (
    <Sheet open onClose={onClose} title="Copy week">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Duplicates all {dayCount} {dayCount === 1 ? "day" : "days"} as a new week. A progression is added to every set that has that value — leave at 0 to copy as-is.</p>
        <Field label="Week label (added to each day name)" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Week 2" />
        <div className="space-y-1.5">
          <div className="text-sm text-muted-foreground">Reps per set</div>
          <SegmentedControl options={[{ value: "0", label: "Same" }, { value: "1", label: "+1" }, { value: "2", label: "+2" }]} value={reps} onChange={setReps} />
        </div>
        <div className="space-y-1.5">
          <div className="text-sm text-muted-foreground">Load (kg on set weights, % on %1RM)</div>
          <SegmentedControl options={[{ value: "0", label: "Same" }, { value: "2.5", label: "+2.5" }, { value: "5", label: "+5" }]} value={load} onChange={setLoad} />
        </div>
        <Button size="lg" className="w-full" onClick={() => onCopy(label.trim(), Number(reps), Number(load))}><Copy /> Copy {dayCount} {dayCount === 1 ? "day" : "days"}</Button>
      </div>
    </Sheet>
  );
}

function SetRow({ set, index, mode, onPatch, onRemove }: { set: WorkoutSet; index: number; mode: MeasurementMode; onPatch: (p: Partial<WorkoutSet>) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const wm = WEIGHT_MODES.find((m) => m.value === set.weightMode);
  const num = (v: string) => (v ? Number(v) : null);
  return (
    <div className="rounded-xl bg-surface-3/40 p-2">
      <div className="flex items-center gap-1.5 text-sm">
        <button onClick={() => setOpen((o) => !o)} className="w-6 shrink-0 text-muted-foreground"><ChevronRight className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} /></button>
        <span className="w-4 shrink-0 text-xs text-muted-foreground">{index + 1}</span>
        {(mode === "reps" || mode === "reps_in_time") && (
          <input type="number" placeholder="reps" value={set.reps ?? ""} onChange={(e) => onPatch({ reps: num(e.target.value) })} className={`${inputCls} w-14`} />
        )}
        {(mode === "time" || mode === "reps_in_time") && (
          <input type="number" placeholder="sec" value={set.timeSec ?? ""} onChange={(e) => onPatch({ timeSec: num(e.target.value) })} className={`${inputCls} w-14`} />
        )}
        {mode === "distance" && (
          <input type="number" placeholder="m" value={set.distanceM ?? ""} onChange={(e) => onPatch({ distanceM: num(e.target.value) })} className={`${inputCls} w-14`} />
        )}
        <select value={set.weightMode} onChange={(e) => onPatch({ weightMode: e.target.value as WeightMode })} className={`${inputCls} min-w-0 flex-1`}>{WEIGHT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
        {wm?.unit && wm.value !== "bodyweight" && wm.value !== "unspecified" && (
          <input type="number" placeholder={wm.unit} value={set.weightMode === "percent_1rm" ? (set.percent1rm ?? "") : (set.weightValue ?? "")} onChange={(e) => onPatch(set.weightMode === "percent_1rm" ? { percent1rm: num(e.target.value) } : { weightValue: num(e.target.value) })} className={`${inputCls} w-16`} />
        )}
        <button onClick={onRemove} className="text-muted-foreground hover:text-danger [&_svg]:size-3.5"><X /></button>
      </div>
      {open && (
        <div className="mt-2 grid grid-cols-2 gap-2 pl-6 text-xs sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-muted-foreground">Type
            <select value={set.setType} onChange={(e) => onPatch({ setType: e.target.value as WorkoutSet["setType"] })} className={inputCls}>{SET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1 text-muted-foreground">RPE
            <input type="number" min={1} max={10} value={set.rpe ?? ""} onChange={(e) => onPatch({ rpe: num(e.target.value) })} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-muted-foreground">RIR
            <input type="number" min={0} max={10} value={set.rir ?? ""} onChange={(e) => onPatch({ rir: num(e.target.value) })} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-muted-foreground">Rest s
            <input type="number" value={set.restAfterSec ?? ""} onChange={(e) => onPatch({ restAfterSec: num(e.target.value) })} className={inputCls} />
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-muted-foreground sm:col-span-2">Tempo
            <input value={set.tempo ?? ""} placeholder="3-1-1-0" onChange={(e) => onPatch({ tempo: e.target.value || null })} className={inputCls} />
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-muted-foreground sm:col-span-2">Notes
            <input value={set.notes ?? ""} onChange={(e) => onPatch({ notes: e.target.value || null })} className={inputCls} />
          </label>
        </div>
      )}
    </div>
  );
}

function ExercisePicker({ library, onClose, onPick, reloadLibrary }: { library: ExerciseLite[]; onClose: () => void; onPick: (id: string) => void; reloadLibrary: () => void }) {
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState<string | null>(null);
  const [equip, setEquip] = useState<string | null>(null);
  const [compose, setCompose] = useState(false);

  // Filter options derived from the loaded library (most common first).
  const opts = (get: (e: ExerciseLite) => string[]) => {
    const count = new Map<string, number>();
    for (const e of library) for (const v of get(e)) count.set(v, (count.get(v) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v).slice(0, 8);
  };
  const muscles = opts((e) => splitList(e.muscle_groups));
  const equipment = opts((e) => splitList(e.equipment));

  const filtered = library.filter((e) =>
    e.name.toLowerCase().includes(q.toLowerCase()) &&
    (!muscle || splitList(e.muscle_groups).concat(splitList(e.secondary_muscle_groups)).includes(muscle)) &&
    (!equip || splitList(e.equipment).includes(equip)),
  ).slice(0, 80);

  // "Create new" opens the unified composer (AI / web / manual) in plan mode.
  if (compose) {
    return <ExerciseEditor planMode onClose={() => setCompose(false)} onSaved={(id) => { setCompose(false); reloadLibrary(); if (id) onPick(id); }} />;
  }

  return (
    <Sheet open onClose={onClose} title="Add exercise">
      <Field label="Search your library" icon={Search} value={q} onChange={(e) => setQ(e.target.value)} className="mb-2" />
      <Button size="sm" variant="secondary" className="mb-3 w-full" onClick={() => setCompose(true)}><Plus /> Create a new exercise</Button>
      {muscles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {muscles.map((m) => <Chip key={m} selected={muscle === m} onClick={() => setMuscle(muscle === m ? null : m)}>{pretty(m)}</Chip>)}
        </div>
      )}
      {equipment.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {equipment.map((eq) => <Chip key={eq} selected={equip === eq} onClick={() => setEquip(equip === eq ? null : eq)}>{pretty(eq)}</Chip>)}
        </div>
      )}
      <div className="max-h-96 space-y-1 overflow-y-auto">
        {filtered.map((e) => (
          <button key={e.id} onClick={() => onPick(e.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-secondary">
            <ExerciseThumb thumb={e.thumb_url} thumb2={e.thumb2_url} size={40} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{e.name}</div>
              <ExerciseMeta ex={e} className="text-xs text-muted-foreground" />
            </div>
            {e.difficulty && <Badge tone="neutral">{e.difficulty}</Badge>}
          </button>
        ))}
        {filtered.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matches — create a new one above.</p>}
      </div>
    </Sheet>
  );
}

function AiDraftSheet({ onClose, onRun }: { onClose: () => void; onRun: (i: string) => Promise<void> }) {
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const run = async () => { setBusy(true); setErr(null); try { await onRun(instructions); } catch (e) { setErr(e); } finally { setBusy(false); } };
  return (
    <Sheet open onClose={onClose} title="AI Plan Draft">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Generate a starting draft from this client's intake and your library. You'll review and edit before publishing.</p>
        <Field label="Instructions (optional)" icon={Sparkles} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. 4-day upper/lower, dumbbells only" />
        <Button size="lg" className="w-full" disabled={busy} onClick={() => void run()}>{busy ? "Drafting…" : "Generate draft"}</Button>
        {err ? <AiErrorBox error={err} /> : null}
      </div>
    </Sheet>
  );
}

function ExportTemplateSheet({ body, defaultName, onClose }: { body: WorkoutBody; defaultName: string; onClose: () => void }) {
  const [name, setName] = useState(defaultName);
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const run = async () => {
    setBusy(true);
    try { await api.post("/api/workout-templates", { name, visibility: shared ? "tenant" : "private", body, stripWeights: true }); setDone(true); }
    finally { setBusy(false); }
  };
  return (
    <Sheet open onClose={onClose} title="Save as template">
      {done ? (
        <EmptyState icon={Save} title="Saved to your library" description="Client-specific loads were stripped so it's reusable." action={<Button onClick={onClose}>Done</Button>} />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Copies this plan's structure into a reusable template. Absolute and dropset weights are cleared.</p>
          <Field label="Template name" value={name} onChange={(e) => setName(e.target.value)} />
          <label className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3 text-sm"><span>Share with the whole team</span><Switch checked={shared} onCheckedChange={setShared} /></label>
          <Button size="lg" className="w-full" disabled={busy || !name.trim()} onClick={() => void run()}>{busy ? "Saving…" : "Save template"}</Button>
        </div>
      )}
    </Sheet>
  );
}
