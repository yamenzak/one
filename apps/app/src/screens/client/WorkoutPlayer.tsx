/**
 * Workout player (DESIGN.md §3, SPEC §8.3) — day picker → session view with
 * block/slot/set logging drawers, rest timer, and client-side PR detection
 * (Epley e1RM). Drives /api/logs/workout-sets (find-or-create per session).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { WorkoutBody, WorkoutDay, ExerciseSlot } from "@mossa/protocol";
import { detectPrs, recommendNextDay, type ExerciseBests } from "@mossa/domain";
import { Button, Card, Chip, Field, ProgressRing, Sheet, Skeleton, SubCard } from "@mossa/ui";
import { api, todayLocal } from "../../api.js";

interface PublishedPlan {
  id: string;
  name: string;
  body: WorkoutBody;
}

interface LoggedSet {
  setIndex: number;
  reps?: number | null;
  weightKg?: number | null;
  durationSeconds?: number | null;
  effortLabel?: "easy" | "perfect" | "hard" | null;
  completed: boolean;
}
interface SessionEntry {
  blockIndex: number;
  slotIndex: number;
  exerciseId: string;
  sets: LoggedSet[];
}

interface ExerciseLite {
  id: string;
  name: string;
}

export function WorkoutPlayer({ clientId }: { clientId: string }) {
  const [plan, setPlan] = useState<PublishedPlan | null>(null);
  const [exercises, setExercises] = useState<Map<string, ExerciseLite>>(new Map());
  const [session, setSession] = useState<Map<string, LoggedSet[]>>(new Map());
  const [dayIndex, setDayIndex] = useState<number | null>(null);
  const [logSlot, setLogSlot] = useState<{ blockIndex: number; slotIndex: number; slot: ExerciseSlot } | null>(null);
  const [swapSlot, setSwapSlot] = useState<{ blockIndex: number; slotIndex: number; exerciseId: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const date = todayLocal();

  const load = useCallback(async () => {
    const [plansRes, exRes, sessRes] = await Promise.all([
      api.get<{ plans: PublishedPlan[] }>(`/api/workout-plans?clientId=${clientId}`),
      api.get<{ exercises: ExerciseLite[] }>("/api/exercises"),
      api.get<{ sessions: { plan_day_index: number; entries: SessionEntry[] }[] }>(
        `/api/logs/workout-sessions?clientId=${clientId}&from=${date}&to=${date}`,
      ),
    ]);
    const published = (plansRes.plans as (PublishedPlan & { status: string })[]).find((p) => p.status === "published") ?? null;
    setPlan(published);
    setExercises(new Map(exRes.exercises.map((e) => [e.id, e])));
    const sess = new Map<string, LoggedSet[]>();
    for (const s of sessRes.sessions) {
      for (const e of s.entries) sess.set(`${e.blockIndex}:${e.slotIndex}`, e.sets);
    }
    setSession(sess);
  }, [clientId, date]);

  useEffect(() => {
    void load();
  }, [load]);

  // History for PR detection (last 90 days).
  const [bests, setBests] = useState<Map<string, ExerciseBests>>(new Map());
  useEffect(() => {
    void api
      .get<{ sessions: { entries: SessionEntry[] }[] }>(`/api/logs/workout-sessions?clientId=${clientId}&from=2000-01-01&to=${date}`)
      .then((r) => {
        const map = new Map<string, ExerciseBests>();
        for (const s of r.sessions) {
          for (const e of s.entries) {
            let b = map.get(e.exerciseId) ?? { prWeightKg: null, prReps: null, prDurationSeconds: null, bestE1Rm: null };
            for (const set of e.sets) b = detectPrs(b, set).bests;
            map.set(e.exerciseId, b);
          }
        }
        setBests(map);
      });
  }, [clientId, date]);

  const recommendedDay = useMemo(() => {
    if (!plan) return null;
    const logsByDay = plan.body.days.map((_, i) => {
      const sess = [...session.entries()].filter(() => true);
      const setsToday = sess.reduce((n, [, sets]) => n + sets.filter((s) => s.completed).length, 0);
      return i === dayIndex ? { lastLoggedDate: date, loggedSetsOnLastDate: setsToday } : null;
    });
    return recommendNextDay(
      plan.body.days.map((d) => ({ isRestDay: d.isRestDay, prescribedSets: countSets(d) })),
      logsByDay,
      date,
    );
  }, [plan, session, dayIndex, date]);

  if (!plan) {
    return (
      <div className="mx-auto max-w-xl p-4">
        <Card className="text-center">
          <div className="text-4xl">🏋️</div>
          <h2 className="mt-2 text-lg font-semibold">No published plan</h2>
          <p className="mt-1 text-sm text-fg-muted">Your coach hasn't published a workout plan yet.</p>
        </Card>
      </div>
    );
  }

  if (dayIndex === null) {
    return (
      <div className="mx-auto max-w-xl space-y-3 p-4 pb-28">
        <h1 className="text-2xl font-bold">{plan.name}</h1>
        {plan.body.days.map((day, i) => (
          <button
            key={i}
            onClick={() => !day.isRestDay && setDayIndex(i)}
            disabled={day.isRestDay}
            className="flex w-full items-center justify-between rounded-[--radius-card] bg-surface-1 p-4 text-left disabled:opacity-60"
          >
            <div>
              <div className="font-semibold">{day.name || `Day ${i + 1}`}</div>
              <div className="text-sm text-fg-muted">{day.isRestDay ? "Rest day" : `${countSets(day)} sets`}</div>
            </div>
            {day.isRestDay ? <Chip>😴</Chip> : recommendedDay === i ? <Chip tone="activity">Recommended</Chip> : <Chip tone="neutral">▶</Chip>}
          </button>
        ))}
      </div>
    );
  }

  const day = plan.body.days[dayIndex]!;
  const totalSets = countSets(day);
  const loggedSets = [...session.values()].reduce((n, sets) => n + sets.filter((s) => s.completed).length, 0);

  const saveSet = async (blockIndex: number, slotIndex: number, exerciseId: string, set: LoggedSet) => {
    await api.post("/api/logs/workout-sets", {
      clientId,
      data: { date, workoutPlanId: plan.id, planDayIndex: dayIndex, blockIndex, slotIndex, exerciseId, sets: [set] },
    });
    // Local session update.
    const key = `${blockIndex}:${slotIndex}`;
    const cur = session.get(key) ?? [];
    const next = cur.filter((s) => s.setIndex !== set.setIndex).concat(set).sort((a, b) => a.setIndex - b.setIndex);
    setSession(new Map(session).set(key, next));
    // PR check.
    const b = bests.get(exerciseId) ?? { prWeightKg: null, prReps: null, prDurationSeconds: null, bestE1Rm: null };
    const { bests: nb, broke } = detectPrs(b, set);
    setBests(new Map(bests).set(exerciseId, nb));
    if (broke.includes("weight")) {
      setToast(`🏆 New weight PR — ${set.weightKg} kg!`);
      if (navigator.vibrate) navigator.vibrate([30, 40, 60]);
      setTimeout(() => setToast(null), 3000);
    } else if (broke.includes("reps")) {
      setToast(`🏆 Rep PR — ${set.reps} reps!`);
      setTimeout(() => setToast(null), 3000);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <div className="flex items-center gap-3">
        <button onClick={() => setDayIndex(null)} className="grid size-10 place-items-center rounded-full bg-surface-2">
          ←
        </button>
        <h1 className="flex-1 text-xl font-bold">{day.name || `Day ${dayIndex + 1}`}</h1>
        <ProgressRing progress={totalSets ? loggedSets / totalSets : 0} size={56} strokeWidth={7} tone="activity" value={<span className="text-sm">{loggedSets}</span>} />
      </div>

      {day.blocks.map((block, blockIndex) => (
        <Card key={blockIndex} className="space-y-3">
          <div className="flex items-center gap-2">
            <Chip tone="activity">{blockLabel(block.type)}</Chip>
            {block.rounds && <span className="text-sm text-fg-muted">{block.rounds} rounds</span>}
          </div>
          {block.slots.map((slot, slotIndex) => {
            const key = `${blockIndex}:${slotIndex}`;
            const logged = session.get(key)?.filter((s) => s.completed).length ?? 0;
            const ex = exercises.get(slot.exerciseId);
            return (
              <SubCard key={slotIndex} className="flex items-center justify-between bg-surface-2">
                <div>
                  <div className="font-medium">{ex?.name ?? "Exercise"}</div>
                  <div className="text-sm text-fg-muted">
                    {logged}/{slot.sets.length} sets · {slot.measurementMode}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setSwapSlot({ blockIndex, slotIndex, exerciseId: slot.exerciseId })} className="text-xs text-fg-muted" aria-label="Request swap">
                    ⇄
                  </button>
                  <Button onClick={() => setLogSlot({ blockIndex, slotIndex, slot })}>{logged >= slot.sets.length ? "✓" : "Log"}</Button>
                </div>
              </SubCard>
            );
          })}
        </Card>
      ))}

      {toast && (
        <div className="fixed inset-x-0 bottom-24 z-40 mx-auto w-fit rounded-full bg-good-container px-5 py-3 font-semibold text-good shadow-lg">
          {toast}
        </div>
      )}

      {logSlot && (
        <SetLogDrawer
          slot={logSlot.slot}
          exerciseName={exercises.get(logSlot.slot.exerciseId)?.name ?? "Exercise"}
          logged={session.get(`${logSlot.blockIndex}:${logSlot.slotIndex}`) ?? []}
          onClose={() => setLogSlot(null)}
          onSave={(set) => saveSet(logSlot.blockIndex, logSlot.slotIndex, logSlot.slot.exerciseId, set)}
        />
      )}

      {swapSlot && (
        <SwapDrawer
          clientId={clientId}
          planId={plan.id}
          dayIndex={dayIndex}
          coords={swapSlot}
          library={[...exercises.values()]}
          currentName={exercises.get(swapSlot.exerciseId)?.name ?? "Exercise"}
          onClose={() => setSwapSlot(null)}
          onDone={(m) => {
            setSwapSlot(null);
            setToast(m);
            setTimeout(() => setToast(null), 3000);
          }}
        />
      )}
    </div>
  );
}

function SwapDrawer({
  clientId,
  planId,
  dayIndex,
  coords,
  library,
  currentName,
  onClose,
  onDone,
}: {
  clientId: string;
  planId: string;
  dayIndex: number;
  coords: { blockIndex: number; slotIndex: number; exerciseId: string };
  library: ExerciseLite[];
  currentName: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [q, setQ] = useState("");
  const [reason, setReason] = useState("");
  const [picked, setPicked] = useState<ExerciseLite | null>(null);
  const filtered = library.filter((e) => e.id !== coords.exerciseId && e.name.toLowerCase().includes(q.toLowerCase())).slice(0, 20);

  const submit = async () => {
    if (!picked) return;
    const r = await api.post<{ autoApproved: boolean }>("/api/swaps", {
      clientId,
      workoutPlanId: planId,
      dayIndex,
      blockIndex: coords.blockIndex,
      slotIndex: coords.slotIndex,
      currentExerciseId: coords.exerciseId,
      suggestedExerciseId: picked.id,
      reason: reason || null,
    });
    onDone(r.autoApproved ? "✓ Swapped — it was a listed alternative." : "Swap request sent to your coach.");
  };

  return (
    <Sheet open onClose={onClose} title={`Swap ${currentName}`}>
      <div className="space-y-3">
        {!picked ? (
          <>
            <Field label="Replace with" icon="🔍" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {filtered.map((e) => (
                <button key={e.id} onClick={() => setPicked(e)} className="w-full rounded-2xl px-3 py-3 text-left hover:bg-surface-2">
                  {e.name}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="rounded-2xl bg-surface-2 p-3">
              <div className="text-sm text-fg-muted">Swap to</div>
              <div className="font-semibold">{picked.name}</div>
            </div>
            <Field label="Reason (optional)" icon="💬" value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => setPicked(null)}>Back</Button>
              <Button size="lg" className="flex-1" onClick={() => void submit()}>Request swap</Button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

function SetLogDrawer({
  slot,
  exerciseName,
  logged,
  onClose,
  onSave,
}: {
  slot: ExerciseSlot;
  exerciseName: string;
  logged: LoggedSet[];
  onClose: () => void;
  onSave: (set: LoggedSet) => Promise<void>;
}) {
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
    await onSave({
      setIndex,
      reps: reps ? Number(reps) : (prescribed?.reps ?? null),
      weightKg: weight ? Number(weight) : null,
      effortLabel: effort,
      completed: true,
    });
    setSetIndex((i) => i + 1);
    setReps("");
    setWeight("");
    setEffort(null);
    setRestLeft(prescribed?.restAfterSec ?? 60);
  };

  return (
    <Sheet open onClose={onClose} title={exerciseName}>
      <div className="space-y-4">
        <div className="text-sm text-fg-muted">
          Set {setIndex + 1} of {slot.sets.length}
          {prescribed?.reps && ` · target ${prescribed.reps} reps`}
        </div>
        {restLeft !== null && restLeft > 0 && (
          <div className="rounded-2xl bg-cardio-container px-4 py-3 text-center font-semibold text-cardio">
            Rest: {restLeft}s
          </div>
        )}
        <div className="flex gap-3">
          <Field label="Reps" icon="🔢" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value.replace(/\D/g, ""))} className="flex-1" />
          <Field label="Weight (kg)" icon="🏋️" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} className="flex-1" />
        </div>
        <div>
          <div className="mb-2 text-sm text-fg-muted">How did it feel?</div>
          <div className="flex gap-2">
            {(["easy", "perfect", "hard"] as const).map((e) => (
              <button
                key={e}
                onClick={() => setEffort(effort === e ? null : e)}
                className={`flex-1 rounded-full py-3 text-sm font-medium capitalize ${effort === e ? "bg-primary-container text-on-primary-container" : "bg-surface-2 text-fg"}`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        <Button size="lg" className="w-full" onClick={() => void save()} disabled={setIndex >= slot.sets.length}>
          {setIndex >= slot.sets.length ? "All sets logged ✓" : "Log set"}
        </Button>
      </div>
    </Sheet>
  );
}

function countSets(day: WorkoutDay): number {
  let n = 0;
  for (const block of day.blocks) {
    const rounds = block.type === "single" ? 1 : (block.rounds ?? 1);
    for (const slot of block.slots) n += slot.sets.length * rounds;
  }
  return n;
}

function blockLabel(type: string): string {
  return type === "single" ? "Exercise" : type === "hiit" ? "HIIT" : type[0]!.toUpperCase() + type.slice(1);
}
