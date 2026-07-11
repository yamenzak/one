/**
 * Workout player — day picker → session with set-log drawers, rest timer, and
 * client-side Epley PR detection. Premium, animated.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { WorkoutBody, WorkoutDay, WorkoutBlock, ExerciseSlot, WorkoutSet } from "@mossa/protocol";
import { detectPrs, recommendNextDay, displayToKg, kgToDisplay, weightLabel, fmtWeight, type ExerciseBests } from "@mossa/domain";
import {
  Button, Card, Badge, Field, Sheet, Skeleton, SubCard, ProgressRing, EmptyState,
  ArrowLeft, ArrowLeftRight, Trophy, Timer, Dumbbell, ChevronRight, Check, Info, Play,
} from "@mossa/ui";
import { api, todayLocal } from "../../api.js";
import { useUnits } from "../../units.js";
import { ExerciseThumb, ExerciseMeta, splitList, pretty, type ExerciseInfo } from "../exercise.js";

interface PublishedPlan { id: string; name: string; body: WorkoutBody }
interface LoggedSet { setIndex: number; reps?: number | null; weightKg?: number | null; durationSeconds?: number | null; effortLabel?: "easy" | "perfect" | "hard" | null; completed: boolean }
interface SessionEntry { blockIndex: number; slotIndex: number; exerciseId: string; sets: LoggedSet[] }
type ExerciseLite = ExerciseInfo;

export function WorkoutPlayer({ clientId, initialDay, onExit }: { clientId: string; initialDay?: number; onExit?: () => void }) {
  const [plan, setPlan] = useState<PublishedPlan | null>(null);
  const [exercises, setExercises] = useState<Map<string, ExerciseLite>>(new Map());
  const [session, setSession] = useState<Map<string, LoggedSet[]>>(new Map());
  const [dayIndex, setDayIndex] = useState<number | null>(initialDay ?? null);
  const [logSlot, setLogSlot] = useState<{ blockIndex: number; slotIndex: number; slot: ExerciseSlot } | null>(null);
  const [roundBlock, setRoundBlock] = useState<{ blockIndex: number; block: WorkoutBlock; roundIndex: number } | null>(null);
  const [swapSlot, setSwapSlot] = useState<{ blockIndex: number; slotIndex: number; exerciseId: string } | null>(null);
  const [detailSlot, setDetailSlot] = useState<ExerciseSlot | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [bests, setBests] = useState<Map<string, ExerciseBests>>(new Map());
  const units = useUnits();
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
        <div className="flex items-center gap-3">
          {onExit && <Button size="icon" variant="secondary" onClick={onExit} aria-label="Back"><ArrowLeft /></Button>}
          <h1 className="text-2xl font-bold tracking-tight">{plan.name}</h1>
        </div>
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
    if (broke.includes("weight")) { setToast(`New weight PR — ${fmtWeight(set.weightKg, units)}`); navigator.vibrate?.([30, 40, 60]); setTimeout(() => setToast(null), 3000); }
    else if (broke.includes("reps")) { setToast(`Rep PR — ${set.reps} reps`); setTimeout(() => setToast(null), 3000); }
  };

  // Superset/circuit/hiit: log every exercise of one round together. Persist each
  // slot's set, then update session + PRs once so the round applies atomically.
  const saveRound = async (blockIndex: number, roundIndex: number, entries: { slotIndex: number; exerciseId: string; set: LoggedSet }[]) => {
    for (const e of entries) {
      await api.post("/api/logs/workout-sets", { clientId, data: { date, workoutPlanId: plan.id, planDayIndex: dayIndex, blockIndex, slotIndex: e.slotIndex, exerciseId: e.exerciseId, sets: [e.set] } });
    }
    const nextSession = new Map(session);
    for (const e of entries) {
      const key = `${blockIndex}:${e.slotIndex}`;
      const cur = nextSession.get(key) ?? [];
      nextSession.set(key, cur.filter((s) => s.setIndex !== e.set.setIndex).concat(e.set).sort((a, b) => a.setIndex - b.setIndex));
    }
    setSession(nextSession);
    const nextBests = new Map(bests);
    let pr: string | null = null;
    for (const e of entries) {
      const b = nextBests.get(e.exerciseId) ?? { prWeightKg: null, prReps: null, prDurationSeconds: null, bestE1Rm: null };
      const { bests: nb, broke } = detectPrs(b, e.set);
      nextBests.set(e.exerciseId, nb);
      if (broke.includes("weight")) pr = `New weight PR — ${fmtWeight(e.set.weightKg, units)}`;
      else if (!pr && broke.includes("reps")) pr = `Rep PR — ${e.set.reps} reps`;
    }
    setBests(nextBests);
    if (pr) { setToast(pr); navigator.vibrate?.([30, 40, 60]); setTimeout(() => setToast(null), 3000); }
  };

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <div className="flex items-center gap-3">
        <Button size="icon" variant="secondary" onClick={() => setDayIndex(null)}><ArrowLeft /></Button>
        <h1 className="flex-1 truncate text-xl font-bold tracking-tight">{day.name || `Day ${dayIndex + 1}`}</h1>
        <ProgressRing progress={totalSets ? loggedSets / totalSets : 0} size={52} strokeWidth={6} tone="activity" value={<span className="text-sm">{loggedSets}</span>} />
      </div>

      {day.blocks.map((block, blockIndex) => {
        // Singles log set-by-set per exercise; supersets/circuits/HIIT log a
        // whole round (one set of every exercise) at a time.
        const rounds = block.type === "single" ? null : block.rounds ?? 1;
        if (rounds === null) {
          return (
            <Card key={blockIndex} className="space-y-3">
              <div className="flex items-center gap-2"><Badge tone="activity">{blockLabel(block.type)}</Badge></div>
              {block.slots.map((slot, slotIndex) => {
                const ex = exercises.get(slot.exerciseId);
                const logged = session.get(`${blockIndex}:${slotIndex}`)?.filter((s) => s.completed).length ?? 0;
                const done = logged >= slot.sets.length;
                return (
                  <SubCard key={slotIndex} className="flex items-center gap-3">
                    <button onClick={() => setDetailSlot(slot)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <ExerciseThumb thumb={ex?.thumb_url} size={44} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 truncate font-medium">{ex?.name ?? "Exercise"}<Info className="size-3.5 shrink-0 text-muted-foreground" /></div>
                        <div className="text-sm text-muted-foreground">{ex ? <ExerciseMeta ex={ex} className="after:mx-1 after:content-['·']" /> : null}{logged}/{slot.sets.length} sets</div>
                      </div>
                    </button>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button size="icon-sm" variant="ghost" onClick={() => setSwapSlot({ blockIndex, slotIndex, exerciseId: slot.exerciseId })} aria-label="Swap"><ArrowLeftRight /></Button>
                      <Button size="sm" variant={done ? "secondary" : "default"} onClick={() => setLogSlot({ blockIndex, slotIndex, slot })}>{done ? <Check /> : "Log"}</Button>
                    </div>
                  </SubCard>
                );
              })}
            </Card>
          );
        }
        // Completed rounds = the fewest completed sets across the block's slots.
        const roundsDone = block.slots.length ? Math.min(...block.slots.map((_, si) => session.get(`${blockIndex}:${si}`)?.filter((s) => s.completed).length ?? 0)) : 0;
        const blockDone = roundsDone >= rounds;
        return (
          <Card key={blockIndex} className="space-y-3">
            <div className="flex items-center gap-2"><Badge tone="activity">{blockLabel(block.type)}</Badge><span className="text-sm text-muted-foreground">{roundsDone}/{rounds} rounds</span></div>
            {block.slots.map((slot, slotIndex) => {
              const ex = exercises.get(slot.exerciseId);
              return (
                <SubCard key={slotIndex} className="flex items-center gap-3">
                  <button onClick={() => setDetailSlot(slot)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <ExerciseThumb thumb={ex?.thumb_url} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 truncate font-medium">{ex?.name ?? "Exercise"}<Info className="size-3.5 shrink-0 text-muted-foreground" /></div>
                      <div className="text-sm text-muted-foreground">{ex ? <ExerciseMeta ex={ex} className="after:mx-1 after:content-['·']" /> : null}{slot.sets[0]?.reps ? `${slot.sets[0].reps} reps` : slot.measurementMode}</div>
                    </div>
                  </button>
                  <Button size="icon-sm" variant="ghost" onClick={() => setSwapSlot({ blockIndex, slotIndex, exerciseId: slot.exerciseId })} aria-label="Swap"><ArrowLeftRight /></Button>
                </SubCard>
              );
            })}
            <Button className="w-full" variant={blockDone ? "secondary" : "default"} disabled={blockDone} onClick={() => setRoundBlock({ blockIndex, block, roundIndex: roundsDone })}>
              {blockDone ? <><Check /> Rounds complete</> : `Log round ${roundsDone + 1} of ${rounds}`}
            </Button>
          </Card>
        );
      })}

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
      {roundBlock && (
        <RoundLogDrawer block={roundBlock.block} roundIndex={roundBlock.roundIndex} exercises={exercises} onClose={() => setRoundBlock(null)} onSave={(entries) => saveRound(roundBlock.blockIndex, roundBlock.roundIndex, entries)} />
      )}
      {swapSlot && (
        <SwapDrawer clientId={clientId} planId={plan.id} dayIndex={dayIndex} coords={swapSlot} currentName={exercises.get(swapSlot.exerciseId)?.name ?? "Exercise"} onClose={() => setSwapSlot(null)} onDone={(m) => { setSwapSlot(null); void load(); setToast(m); setTimeout(() => setToast(null), 3000); }} />
      )}
      {detailSlot && <ExerciseDetailSheet ex={exercises.get(detailSlot.exerciseId)} slot={detailSlot} onClose={() => setDetailSlot(null)} />}
    </div>
  );
}

/** Read-only exercise detail: how-to instructions + media + the trainer's
 *  full prescription for this slot (SPEC §8.3 — client sees what's configured). */
function ExerciseDetailSheet({ ex, slot, onClose }: { ex?: ExerciseInfo; slot: ExerciseSlot; onClose: () => void }) {
  const units = useUnits();
  const chips = [...splitList(ex?.muscle_groups), ...splitList(ex?.equipment)].map(pretty);
  const measure = slot.measurementMode === "reps" ? "reps" : slot.measurementMode === "time" ? "sec" : slot.measurementMode;
  const setLine = (s: WorkoutSet, i: number): string => {
    const parts: string[] = [];
    parts.push(s.reps != null ? `${s.reps} ${measure}` : measure);
    const wm = s.weightMode;
    if (wm === "absolute" && s.weightValue != null) parts.push(`${fmtWeight(s.weightValue, units)}`);
    else if (wm === "percent_1rm" && s.percent1rm != null) parts.push(`${s.percent1rm}% 1RM`);
    else if (wm === "bodyweight") parts.push("bodyweight");
    else if (wm === "previous_plus" && s.weightValue != null) parts.push(`prev +${fmtWeight(s.weightValue, units)}`);
    else if (wm === "previous_times" && s.weightValue != null) parts.push(`prev ×${s.weightValue}`);
    else if (wm === "dropset") parts.push("dropset");
    else parts.push("your choice");
    if (s.rpe != null) parts.push(`RPE ${s.rpe}`);
    else if (s.rir != null) parts.push(`RIR ${s.rir}`);
    if (s.tempo) parts.push(`tempo ${s.tempo}`);
    if (s.restAfterSec) parts.push(`rest ${s.restAfterSec}s`);
    return `Set ${i + 1} · ${parts.join(" · ")}`;
  };
  return (
    <Sheet open onClose={onClose} title={ex?.name ?? "Exercise"}>
      <div className="space-y-4">
        {(ex?.thumb2_url || ex?.thumb_url) && (
          <div className="flex gap-2">
            {[ex.thumb_url, ex.thumb2_url].filter(Boolean).map((src, i) => <img key={i} src={src!} alt="" className="h-40 w-full flex-1 rounded-2xl object-cover" />)}
          </div>
        )}
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {ex?.difficulty && <Badge tone="neutral">{ex.difficulty}</Badge>}
            {chips.map((c) => <Badge key={c} tone="activity">{c}</Badge>)}
          </div>
        )}
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prescribed</div>
          <SubCard className="space-y-1">
            {slot.sets.map((s, i) => <div key={i} className="text-sm">{setLine(s, i)}</div>)}
          </SubCard>
        </div>
        {ex?.instructions_md ? (
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">How to</div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{ex.instructions_md.replace(/[#*_>`]/g, "")}</div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No instructions yet — ask your coach for cues.</p>
        )}
        {ex?.video_url && <a href={ex.video_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary [&_svg]:size-4"><Play /> Watch demo</a>}
      </div>
    </Sheet>
  );
}

function SetLogDrawer({ slot, exerciseName, logged, onClose, onSave }: { slot: ExerciseSlot; exerciseName: string; logged: LoggedSet[]; onClose: () => void; onSave: (s: LoggedSet) => Promise<void> }) {
  const units = useUnits();
  const completed = logged.filter((s) => s.completed).sort((a, b) => a.setIndex - b.setIndex);
  const [setIndex, setSetIndex] = useState(completed.length);
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");
  const [effort, setEffort] = useState<"easy" | "perfect" | "hard" | null>(null);
  const [restLeft, setRestLeft] = useState<number | null>(null);
  const prescribed = slot.sets[Math.min(setIndex, slot.sets.length - 1)];
  const editing = completed.some((s) => s.setIndex === setIndex);

  useEffect(() => {
    if (restLeft === null || restLeft <= 0) return;
    const t = setInterval(() => setRestLeft((r) => (r === null ? null : r - 1)), 1000);
    return () => clearInterval(t);
  }, [restLeft]);

  // Tap a logged set to pull it back into the inputs and correct it.
  const edit = (s: LoggedSet) => {
    setSetIndex(s.setIndex);
    setReps(s.reps != null ? String(s.reps) : "");
    setWeight(s.weightKg != null ? String(kgToDisplay(s.weightKg, units)) : "");
    setEffort(s.effortLabel ?? null);
    setRestLeft(null);
  };

  const save = async () => {
    const wasEditing = editing;
    await onSave({ setIndex, reps: reps ? Number(reps) : prescribed?.reps ?? null, weightKg: weight ? Math.round(displayToKg(Number(weight), units) * 100) / 100 : null, effortLabel: effort, completed: true });
    setReps(""); setWeight(""); setEffort(null);
    if (wasEditing) { setSetIndex(completed.length); setRestLeft(null); }
    else { setSetIndex((i) => i + 1); setRestLeft(prescribed?.restAfterSec ?? 60); }
  };

  const canLog = editing || setIndex < slot.sets.length;

  return (
    <Sheet open onClose={onClose} title={exerciseName}>
      <div className="space-y-4">
        {completed.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {completed.map((s) => (
              <button key={s.setIndex} onClick={() => edit(s)} className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${s.setIndex === setIndex ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-surface-3"}`}>
                {s.reps ?? "–"}{s.weightKg != null ? ` · ${fmtWeight(s.weightKg, units)}` : ""}
              </button>
            ))}
          </div>
        )}
        <div className="text-sm text-muted-foreground">{editing ? `Editing set ${setIndex + 1}` : `Set ${setIndex + 1} of ${slot.sets.length}`}{prescribed?.reps ? ` · target ${prescribed.reps} reps` : ""}</div>
        {restLeft !== null && restLeft > 0 && (
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-cardio-soft px-4 py-3 font-semibold text-cardio"><Timer className="size-4" /> Rest {restLeft}s</div>
        )}
        <div className="flex gap-3">
          <Field label="Reps" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value.replace(/\D/g, ""))} className="flex-1" />
          <Field label={`Weight (${weightLabel(units)})`} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} className="flex-1" />
        </div>
        <div>
          <div className="mb-2 text-sm text-muted-foreground">How did it feel?</div>
          <div className="flex gap-2">
            {(["easy", "perfect", "hard"] as const).map((e) => (
              <button key={e} onClick={() => setEffort(effort === e ? null : e)} className={`flex-1 rounded-xl py-3 text-sm font-medium capitalize transition-all active:scale-95 ${effort === e ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>{e}</button>
            ))}
          </div>
        </div>
        <Button size="lg" className="w-full" onClick={() => void save()} disabled={!canLog}>{editing ? `Update set ${setIndex + 1}` : setIndex >= slot.sets.length ? "All sets logged" : "Log set"}</Button>
      </div>
    </Sheet>
  );
}

/** Round-grouped logging for supersets/circuits/HIIT: one set of every exercise. */
function RoundLogDrawer({ block, roundIndex, exercises, onClose, onSave }: { block: WorkoutBlock; roundIndex: number; exercises: Map<string, ExerciseLite>; onClose: () => void; onSave: (entries: { slotIndex: number; exerciseId: string; set: LoggedSet }[]) => Promise<void> }) {
  const [vals, setVals] = useState<Record<number, { reps: string; weight: string }>>({});
  const [busy, setBusy] = useState(false);
  const units = useUnits();
  const rounds = block.rounds ?? 1;
  const setV = (si: number, patch: Partial<{ reps: string; weight: string }>) => setVals((v) => ({ ...v, [si]: { reps: "", weight: "", ...v[si], ...patch } }));

  const save = async () => {
    setBusy(true);
    try {
      const entries = block.slots.map((slot, si) => {
        const prescribed = slot.sets[Math.min(roundIndex, slot.sets.length - 1)];
        const v = vals[si] ?? { reps: "", weight: "" };
        return {
          slotIndex: si,
          exerciseId: slot.exerciseId,
          set: {
            setIndex: roundIndex,
            reps: v.reps ? Number(v.reps) : prescribed?.reps ?? null,
            weightKg: v.weight ? Math.round(displayToKg(Number(v.weight), units) * 100) / 100 : null,
            effortLabel: null,
            completed: true,
          } as LoggedSet,
        };
      });
      await onSave(entries);
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Sheet open onClose={onClose} title={`Round ${roundIndex + 1} of ${rounds}`}>
      <div className="space-y-3">
        <div className="text-sm text-muted-foreground">Log one set of each — then rest and come back for the next round.</div>
        {block.slots.map((slot, si) => {
          const prescribed = slot.sets[Math.min(roundIndex, slot.sets.length - 1)];
          const v = vals[si] ?? { reps: "", weight: "" };
          return (
            <SubCard key={si} className="space-y-2">
              <div className="flex items-center gap-2.5">
                <ExerciseThumb thumb={exercises.get(slot.exerciseId)?.thumb_url} size={36} />
                <div className="min-w-0 flex-1 truncate font-medium">{exercises.get(slot.exerciseId)?.name ?? "Exercise"}</div>
                {prescribed?.reps ? <span className="shrink-0 text-xs text-muted-foreground">target {prescribed.reps} reps</span> : null}
              </div>
              <div className="flex gap-3">
                <Field label="Reps" inputMode="numeric" value={v.reps} onChange={(e) => setV(si, { reps: e.target.value.replace(/\D/g, "") })} className="flex-1" />
                <Field label={`Weight (${weightLabel(units)})`} inputMode="decimal" value={v.weight} onChange={(e) => setV(si, { weight: e.target.value })} className="flex-1" />
              </div>
            </SubCard>
          );
        })}
        <Button size="lg" className="w-full" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Complete round"}</Button>
      </div>
    </Sheet>
  );
}

/**
 * Swap sheet (SPEC §8.3): bound alternatives swap instantly (no approval); for
 * anything else the client just asks and the coach picks the replacement.
 */
function SwapDrawer({ clientId, planId, dayIndex, coords, currentName, onClose, onDone }: { clientId: string; planId: string; dayIndex: number; coords: { blockIndex: number; slotIndex: number; exerciseId: string }; currentName: string; onClose: () => void; onDone: (m: string) => void }) {
  const [alts, setAlts] = useState<ExerciseInfo[] | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.get<{ alternatives: ExerciseInfo[] }>(`/api/exercises/${coords.exerciseId}/alternatives`).then((r) => setAlts(r.alternatives)).catch(() => setAlts([]));
  }, [coords.exerciseId]);

  const post = (body: Record<string, unknown>) => api.post<{ autoApproved: boolean }>("/api/swaps", { clientId, workoutPlanId: planId, dayIndex, blockIndex: coords.blockIndex, slotIndex: coords.slotIndex, currentExerciseId: coords.exerciseId, ...body });

  const swapTo = async (alt: ExerciseInfo) => {
    setBusy(true);
    try { await post({ suggestedExerciseId: alt.id }); onDone(`Swapped to ${alt.name}`); } finally { setBusy(false); }
  };
  const request = async () => {
    setBusy(true);
    try { await post({ reason: reason || null }); onDone("Swap request sent to your coach"); } finally { setBusy(false); }
  };

  return (
    <Sheet open onClose={onClose} title={`Swap ${currentName}`}>
      <div className="space-y-4">
        {alts === null ? (
          <Skeleton className="h-24" />
        ) : alts.length > 0 ? (
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Instant swaps — coach-approved alternatives</div>
            <div className="space-y-1">
              {alts.map((e) => (
                <button key={e.id} disabled={busy} onClick={() => void swapTo(e)} className="flex w-full items-center gap-3 rounded-xl bg-surface-2 px-2.5 py-2 text-left transition-colors hover:bg-surface-3 disabled:opacity-50">
                  <ExerciseThumb thumb={e.thumb_url} size={40} />
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{e.name}</div><ExerciseMeta ex={e} className="text-xs text-muted-foreground" /></div>
                  <ArrowLeftRight className="size-4 shrink-0 text-activity" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No instant alternatives set for this exercise.</p>
        )}

        <div className="border-t border-border/50 pt-4">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ask your coach</div>
          <Field label="Why swap? (optional)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. shoulder pain, no cable machine" />
          <Button variant="outline" className="mt-3 w-full" disabled={busy} onClick={() => void request()}>Request a swap — coach will choose</Button>
        </div>
      </div>
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
