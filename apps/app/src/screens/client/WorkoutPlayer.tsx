/**
 * Workout player — day picker → session with set-log drawers, rest timer, and
 * client-side Epley PR detection. Premium, animated.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { WorkoutBody, WorkoutDay, ExerciseSlot } from "@mossa/protocol";
import { detectPrs, recommendNextDay, type ExerciseBests } from "@mossa/domain";
import {
  Button, Card, Badge, Field, Sheet, Skeleton, SubCard, ProgressRing, EmptyState,
  ArrowLeft, ArrowLeftRight, Trophy, Timer, Dumbbell, ChevronRight, Check,
} from "@mossa/ui";
import { api, todayLocal } from "../../api.js";

interface PublishedPlan { id: string; name: string; body: WorkoutBody }
interface LoggedSet { setIndex: number; reps?: number | null; weightKg?: number | null; durationSeconds?: number | null; effortLabel?: "easy" | "perfect" | "hard" | null; completed: boolean }
interface SessionEntry { blockIndex: number; slotIndex: number; exerciseId: string; sets: LoggedSet[] }
interface ExerciseLite { id: string; name: string }

export function WorkoutPlayer({ clientId }: { clientId: string }) {
  const [plan, setPlan] = useState<PublishedPlan | null>(null);
  const [exercises, setExercises] = useState<Map<string, ExerciseLite>>(new Map());
  const [session, setSession] = useState<Map<string, LoggedSet[]>>(new Map());
  const [dayIndex, setDayIndex] = useState<number | null>(null);
  const [logSlot, setLogSlot] = useState<{ blockIndex: number; slotIndex: number; slot: ExerciseSlot } | null>(null);
  const [swapSlot, setSwapSlot] = useState<{ blockIndex: number; slotIndex: number; exerciseId: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [bests, setBests] = useState<Map<string, ExerciseBests>>(new Map());
  const date = todayLocal();

  const load = useCallback(async () => {
    const [plansRes, exRes, sessRes] = await Promise.all([
      api.get<{ plans: (PublishedPlan & { status: string })[] }>(`/api/workout-plans?clientId=${clientId}`),
      api.get<{ exercises: ExerciseLite[] }>("/api/exercises"),
      api.get<{ sessions: { entries: SessionEntry[] }[] }>(`/api/logs/workout-sessions?clientId=${clientId}&from=${date}&to=${date}`),
    ]);
    setPlan(plansRes.plans.find((p) => p.status === "published") ?? null);
    setExercises(new Map(exRes.exercises.map((e) => [e.id, e])));
    const sess = new Map<string, LoggedSet[]>();
    for (const s of sessRes.sessions) for (const e of s.entries) sess.set(`${e.blockIndex}:${e.slotIndex}`, e.sets);
    setSession(sess);
  }, [clientId, date]);
  useEffect(() => void load(), [load]);

  useEffect(() => {
    void api.get<{ sessions: { entries: SessionEntry[] }[] }>(`/api/logs/workout-sessions?clientId=${clientId}&from=2000-01-01&to=${date}`).then((r) => {
      const map = new Map<string, ExerciseBests>();
      for (const s of r.sessions) for (const e of s.entries) {
        let b = map.get(e.exerciseId) ?? { prWeightKg: null, prReps: null, prDurationSeconds: null, bestE1Rm: null };
        for (const set of e.sets) b = detectPrs(b, set).bests;
        map.set(e.exerciseId, b);
      }
      setBests(map);
    });
  }, [clientId, date]);

  const recommendedDay = useMemo(() => {
    if (!plan) return null;
    const setsToday = [...session.values()].reduce((n, sets) => n + sets.filter((s) => s.completed).length, 0);
    const logsByDay = plan.body.days.map((_, i) => (i === dayIndex ? { lastLoggedDate: date, loggedSetsOnLastDate: setsToday } : null));
    return recommendNextDay(plan.body.days.map((d) => ({ isRestDay: d.isRestDay, prescribedSets: countSets(d) })), logsByDay, date);
  }, [plan, session, dayIndex, date]);

  if (!plan) return <div className="mx-auto max-w-xl p-4"><EmptyState icon={Dumbbell} title="No published plan" description="Your coach hasn't published a workout plan yet." /></div>;

  if (dayIndex === null) {
    return (
      <div className="mx-auto max-w-xl space-y-3 p-4 pb-28">
        <h1 className="text-2xl font-bold tracking-tight">{plan.name}</h1>
        {plan.body.days.map((day, i) => (
          <motion.button key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} onClick={() => !day.isRestDay && setDayIndex(i)} disabled={day.isRestDay} className="w-full disabled:opacity-60">
            <Card interactive={!day.isRestDay} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`grid size-10 place-items-center rounded-xl [&_svg]:size-[1.1rem] ${day.isRestDay ? "bg-sleep-soft text-sleep" : "bg-activity-soft text-activity"}`}><Dumbbell /></div>
                <div className="text-left">
                  <div className="font-semibold">{day.name || `Day ${i + 1}`}</div>
                  <div className="text-sm text-muted-foreground">{day.isRestDay ? "Rest day" : `${countSets(day)} sets`}</div>
                </div>
              </div>
              {day.isRestDay ? <Badge tone="sleep">Rest</Badge> : recommendedDay === i ? <Badge tone="activity">Recommended</Badge> : <ChevronRight className="size-5 text-muted-foreground" />}
            </Card>
          </motion.button>
        ))}
      </div>
    );
  }

  const day = plan.body.days[dayIndex]!;
  const totalSets = countSets(day);
  const loggedSets = [...session.values()].reduce((n, sets) => n + sets.filter((s) => s.completed).length, 0);

  const saveSet = async (blockIndex: number, slotIndex: number, exerciseId: string, set: LoggedSet) => {
    await api.post("/api/logs/workout-sets", { clientId, data: { date, workoutPlanId: plan.id, planDayIndex: dayIndex, blockIndex, slotIndex, exerciseId, sets: [set] } });
    const key = `${blockIndex}:${slotIndex}`;
    const cur = session.get(key) ?? [];
    setSession(new Map(session).set(key, cur.filter((s) => s.setIndex !== set.setIndex).concat(set).sort((a, b) => a.setIndex - b.setIndex)));
    const b = bests.get(exerciseId) ?? { prWeightKg: null, prReps: null, prDurationSeconds: null, bestE1Rm: null };
    const { bests: nb, broke } = detectPrs(b, set);
    setBests(new Map(bests).set(exerciseId, nb));
    if (broke.includes("weight")) { setToast(`New weight PR — ${set.weightKg} kg`); navigator.vibrate?.([30, 40, 60]); setTimeout(() => setToast(null), 3000); }
    else if (broke.includes("reps")) { setToast(`Rep PR — ${set.reps} reps`); setTimeout(() => setToast(null), 3000); }
  };

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <div className="flex items-center gap-3">
        <Button size="icon" variant="secondary" onClick={() => setDayIndex(null)}><ArrowLeft /></Button>
        <h1 className="flex-1 truncate text-xl font-bold tracking-tight">{day.name || `Day ${dayIndex + 1}`}</h1>
        <ProgressRing progress={totalSets ? loggedSets / totalSets : 0} size={52} strokeWidth={6} tone="activity" value={<span className="text-sm">{loggedSets}</span>} />
      </div>

      {day.blocks.map((block, blockIndex) => (
        <Card key={blockIndex} className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge tone="activity">{blockLabel(block.type)}</Badge>
            {block.rounds && <span className="text-sm text-muted-foreground">{block.rounds} rounds</span>}
          </div>
          {block.slots.map((slot, slotIndex) => {
            const logged = session.get(`${blockIndex}:${slotIndex}`)?.filter((s) => s.completed).length ?? 0;
            const done = logged >= slot.sets.length;
            return (
              <SubCard key={slotIndex} className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{exercises.get(slot.exerciseId)?.name ?? "Exercise"}</div>
                  <div className="text-sm text-muted-foreground">{logged}/{slot.sets.length} sets · {slot.measurementMode}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="icon-sm" variant="ghost" onClick={() => setSwapSlot({ blockIndex, slotIndex, exerciseId: slot.exerciseId })} aria-label="Swap"><ArrowLeftRight /></Button>
                  <Button size="sm" variant={done ? "secondary" : "default"} onClick={() => setLogSlot({ blockIndex, slotIndex, slot })}>{done ? <Check /> : "Log"}</Button>
                </div>
              </SubCard>
            );
          })}
        </Card>
      ))}

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 20, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="fixed inset-x-0 bottom-24 z-40 mx-auto flex w-fit items-center gap-2 rounded-full bg-success-soft px-5 py-3 font-semibold text-success shadow-lg">
            <Trophy className="size-4" /> {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {logSlot && (
        <SetLogDrawer slot={logSlot.slot} exerciseName={exercises.get(logSlot.slot.exerciseId)?.name ?? "Exercise"} logged={session.get(`${logSlot.blockIndex}:${logSlot.slotIndex}`) ?? []} onClose={() => setLogSlot(null)} onSave={(s) => saveSet(logSlot.blockIndex, logSlot.slotIndex, logSlot.slot.exerciseId, s)} />
      )}
      {swapSlot && (
        <SwapDrawer clientId={clientId} planId={plan.id} dayIndex={dayIndex} coords={swapSlot} library={[...exercises.values()]} currentName={exercises.get(swapSlot.exerciseId)?.name ?? "Exercise"} onClose={() => setSwapSlot(null)} onDone={(m) => { setSwapSlot(null); setToast(m); setTimeout(() => setToast(null), 3000); }} />
      )}
    </div>
  );
}

function SetLogDrawer({ slot, exerciseName, logged, onClose, onSave }: { slot: ExerciseSlot; exerciseName: string; logged: LoggedSet[]; onClose: () => void; onSave: (s: LoggedSet) => Promise<void> }) {
  const [setIndex, setSetIndex] = useState(logged.filter((s) => s.completed).length);
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");
  const [effort, setEffort] = useState<"easy" | "perfect" | "hard" | null>(null);
  const [restLeft, setRestLeft] = useState<number | null>(null);
  const prescribed = slot.sets[Math.min(setIndex, slot.sets.length - 1)];

  useEffect(() => {
    if (restLeft === null || restLeft <= 0) return;
    const t = setInterval(() => setRestLeft((r) => (r === null ? null : r - 1)), 1000);
    return () => clearInterval(t);
  }, [restLeft]);

  const save = async () => {
    await onSave({ setIndex, reps: reps ? Number(reps) : prescribed?.reps ?? null, weightKg: weight ? Number(weight) : null, effortLabel: effort, completed: true });
    setSetIndex((i) => i + 1); setReps(""); setWeight(""); setEffort(null); setRestLeft(prescribed?.restAfterSec ?? 60);
  };

  return (
    <Sheet open onClose={onClose} title={exerciseName}>
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">Set {setIndex + 1} of {slot.sets.length}{prescribed?.reps ? ` · target ${prescribed.reps} reps` : ""}</div>
        {restLeft !== null && restLeft > 0 && (
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-cardio-soft px-4 py-3 font-semibold text-cardio"><Timer className="size-4" /> Rest {restLeft}s</div>
        )}
        <div className="flex gap-3">
          <Field label="Reps" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value.replace(/\D/g, ""))} className="flex-1" />
          <Field label="Weight (kg)" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} className="flex-1" />
        </div>
        <div>
          <div className="mb-2 text-sm text-muted-foreground">How did it feel?</div>
          <div className="flex gap-2">
            {(["easy", "perfect", "hard"] as const).map((e) => (
              <button key={e} onClick={() => setEffort(effort === e ? null : e)} className={`flex-1 rounded-xl py-3 text-sm font-medium capitalize transition-all active:scale-95 ${effort === e ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>{e}</button>
            ))}
          </div>
        </div>
        <Button size="lg" className="w-full" onClick={() => void save()} disabled={setIndex >= slot.sets.length}>{setIndex >= slot.sets.length ? "All sets logged" : "Log set"}</Button>
      </div>
    </Sheet>
  );
}

function SwapDrawer({ clientId, planId, dayIndex, coords, library, currentName, onClose, onDone }: { clientId: string; planId: string; dayIndex: number; coords: { blockIndex: number; slotIndex: number; exerciseId: string }; library: ExerciseLite[]; currentName: string; onClose: () => void; onDone: (m: string) => void }) {
  const [q, setQ] = useState("");
  const [reason, setReason] = useState("");
  const [picked, setPicked] = useState<ExerciseLite | null>(null);
  const filtered = library.filter((e) => e.id !== coords.exerciseId && e.name.toLowerCase().includes(q.toLowerCase())).slice(0, 20);

  const submit = async () => {
    if (!picked) return;
    const r = await api.post<{ autoApproved: boolean }>("/api/swaps", { clientId, workoutPlanId: planId, dayIndex, blockIndex: coords.blockIndex, slotIndex: coords.slotIndex, currentExerciseId: coords.exerciseId, suggestedExerciseId: picked.id, reason: reason || null });
    onDone(r.autoApproved ? "Swapped — a listed alternative" : "Swap request sent to your coach");
  };

  return (
    <Sheet open onClose={onClose} title={`Swap ${currentName}`}>
      {!picked ? (
        <div className="space-y-3">
          <Field label="Replace with" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {filtered.map((e) => (
              <button key={e.id} onClick={() => setPicked(e)} className="w-full rounded-xl px-3 py-3 text-left transition-colors hover:bg-secondary">{e.name}</button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <SubCard><div className="text-sm text-muted-foreground">Swap to</div><div className="font-semibold">{picked.name}</div></SubCard>
          <Field label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => setPicked(null)}>Back</Button>
            <Button size="lg" className="flex-1" onClick={() => void submit()}>Request swap</Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function countSets(day: WorkoutDay): number {
  let n = 0;
  for (const block of day.blocks) { const rounds = block.type === "single" ? 1 : block.rounds ?? 1; for (const slot of block.slots) n += slot.sets.length * rounds; }
  return n;
}
function blockLabel(type: string): string {
  return type === "single" ? "Exercise" : type === "hiit" ? "HIIT" : type[0]!.toUpperCase() + type.slice(1);
}
