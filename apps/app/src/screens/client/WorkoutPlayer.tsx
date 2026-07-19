/**
 * Workout player — day picker → session with set-log drawers, rest timer, and
 * client-side Epley PR detection. Premium, animated.
 */

import { useCallback, useEffect, useMemo, useRef, useState, Fragment, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { WorkoutBody, WorkoutDay, WorkoutBlock, ExerciseSlot, WorkoutSet } from "@mossa/protocol";
import { detectPrs, recommendNextDay, displayToKg, kgToDisplay, weightLabel, fmtWeight, type ExerciseBests } from "@mossa/domain";
import {
  Button, Card, Badge, Field, Sheet, SubCard, ProgressRing, EmptyState,
  Reveal, SkeletonLine, SkeletonList, useModalOverlay,
  ArrowLeft, ArrowLeftRight, Trophy, Timer, Dumbbell, Moon, Check, Info, History, LifeBuoy, cn,
} from "@mossa/ui";
import { api, todayLocal } from "../../api.js";
import { useUnits } from "../../units.js";
import { useTour } from "../../tour.js";
import { Markdown } from "../../Markdown.js";
import { ExerciseRow, ExerciseThumb, metaText, splitList, pretty, type ExerciseInfo } from "../exercise.js";

interface PublishedPlan { id: string; name: string; body: WorkoutBody }
type PlanRow = PublishedPlan & { status: string; publishedAt?: string | null };
interface LoggedSet { setIndex: number; reps?: number | null; weightKg?: number | null; durationSeconds?: number | null; distanceM?: number | null; effortLabel?: "easy" | "perfect" | "hard" | null; completed: boolean }
interface SessionEntry { blockIndex: number; slotIndex: number; exerciseId: string; sets: LoggedSet[] }
type ExerciseLite = ExerciseInfo;

export function WorkoutPlayer({ clientId, initialDay, onExit }: { clientId: string; initialDay?: number; onExit?: () => void }) {
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [allPlans, setAllPlans] = useState<PlanRow[]>([]);
  const [viewId, setViewId] = useState<string | null>(null); // null = current published plan
  const [histOpen, setHistOpen] = useState(false);
  const [preview, setPreview] = useState<{ day: WorkoutDay; index: number } | null>(null);
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
  const { startIfNew, start: startTour, active: tourActive } = useTour();

  // First time a client actually trains, walk them through the session player.
  useEffect(() => {
    if (dayIndex == null || !plan || tourActive) return;
    const t = setTimeout(() => startIfNew("workout"), 550);
    return () => clearTimeout(t);
  }, [dayIndex, plan, tourActive, startIfNew]);

  // During the tour, land on a real training day of the (sample) plan so the
  // exercise/set/timer highlights always have something to point at.
  useEffect(() => {
    if (!tourActive || !plan) return;
    const training = plan.body.days.findIndex((d) => !d.isRestDay);
    setDayIndex(training >= 0 ? training : 0);
  }, [tourActive, plan]);

  // Guards stale writes when clientId/date change mid-flight (fast client swap
  // in coach view): only the newest request is allowed to commit its result.
  const reqRef = useRef(0);
  const load = useCallback(async () => {
    const rid = ++reqRef.current;
    const [plansRes, exRes, sessRes] = await Promise.all([
      api.get<{ plans: PlanRow[] }>(`/api/workout-plans?clientId=${clientId}`),
      api.get<{ exercises: ExerciseLite[] }>("/api/exercises?scope=all"),
      api.get<{ sessions: { entries: SessionEntry[] }[] }>(`/api/logs/workout-sessions?clientId=${clientId}&from=${date}&to=${date}`),
    ]);
    if (rid !== reqRef.current) return;
    setPlan(plansRes.plans.find((p) => p.status === "published") ?? null);
    setAllPlans(plansRes.plans);
    setExercises(new Map(exRes.exercises.map((e) => [e.id, e])));
    const sess = new Map<string, LoggedSet[]>();
    for (const s of sessRes.sessions) for (const e of s.entries) sess.set(`${e.blockIndex}:${e.slotIndex}`, e.sets);
    setSession(sess);
  }, [clientId, date]);
  useEffect(() => void load(), [load, tourActive]); // reload through the api interceptor when a tour toggles

  // On a client switch, clear the previous client's plan/session/bests so their
  // data can't linger under the new client while the reload is in flight.
  useEffect(() => {
    setPlan(null); setAllPlans([]); setSession(new Map()); setBests(new Map()); setViewId(null);
  }, [clientId]);

  useEffect(() => {
    let alive = true;
    void api.get<{ sessions: { entries: SessionEntry[] }[] }>(`/api/logs/workout-sessions?clientId=${clientId}&from=2000-01-01&to=${date}`).then((r) => {
      const map = new Map<string, ExerciseBests>();
      for (const s of r.sessions) for (const e of s.entries) {
        let b = map.get(e.exerciseId) ?? { prWeightKg: null, prReps: null, prDurationSeconds: null, bestE1Rm: null };
        for (const set of e.sets) b = detectPrs(b, set).bests;
        map.set(e.exerciseId, b);
      }
      if (alive) setBests(map);
    });
    return () => { alive = false; };
  }, [clientId, date]);

  const recommendedDay = useMemo(() => {
    if (!plan) return null;
    const setsToday = [...session.values()].reduce((n, sets) => n + sets.filter((s) => s.completed).length, 0);
    const logsByDay = plan.body.days.map((_, i) => (i === dayIndex ? { lastLoggedDate: date, loggedSetsOnLastDate: setsToday } : null));
    return recommendNextDay(plan.body.days.map((d) => ({ isRestDay: d.isRestDay, prescribedSets: countSets(d) })), logsByDay, date);
  }, [plan, session, dayIndex, date]);

  // `active` is the plan being viewed — the current published one by default, or
  // a past (superseded) plan the client picked from history. Training always
  // targets the current plan, so past plans render read-only (preview only).
  const active = (viewId ? allPlans.find((p) => p.id === viewId) : plan) ?? plan ?? null;
  const isPast = !!active && !!plan && active.id !== plan.id;
  const pastPlans = allPlans.filter((p) => p.status === "superseded");
  const pickPlan = (id: string | null) => { setViewId(id); setHistOpen(false); };

  if (!plan) return (
    <PlanShell onEscape={onExit}>
      <HeaderBar title="Workout plan" onBack={onExit} />
      <div className="mx-auto max-w-xl p-4"><EmptyState icon={Dumbbell} title="No published plan" description="Your coach hasn't published a workout plan yet." /></div>
    </PlanShell>
  );

  if (dayIndex === null) {
    const trainingDays = active ? active.body.days.filter((d) => !d.isRestDay).length : 0;
    return (
      <PlanShell onEscape={onExit}>
        <HeaderBar title={isPast ? "Past plan" : "Workout plan"} subtitle={active?.name} onBack={onExit}
          right={
            <div className="flex items-center gap-2">
              <button onClick={() => startTour("workout")} aria-label="Replay workout plan tour" className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-foreground transition-colors hover:bg-surface-3 [&_svg]:size-[1.15rem]"><LifeBuoy /></button>
              {pastPlans.length > 0 && <button onClick={() => setHistOpen(true)} aria-label="Past plans" className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-foreground transition-colors hover:bg-surface-3 [&_svg]:size-[1.15rem]"><History /></button>}
            </div>
          } />
        <div className="mx-auto max-w-xl space-y-5 p-4 pb-28">
        {/* Hero — the plan at a glance. */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute -right-10 -top-10 size-36 rounded-full bg-primary/10 blur-2xl" />
            <div className="relative">
              <div className={cn("text-xs font-medium uppercase tracking-wide", isPast ? "text-muted-foreground" : "text-activity")}>{isPast ? "Past plan" : "Your plan"}</div>
              <h2 className="mt-0.5 text-xl font-semibold tracking-tight">{active?.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{trainingDays} training day{trainingDays === 1 ? "" : "s"}{active?.publishedAt ? ` · ${new Date(active.publishedAt).toLocaleDateString()}` : ""}</p>
              {isPast ? (
                <button onClick={() => pickPlan(null)} className="mt-3 inline-flex items-center gap-1 rounded-full bg-activity-soft px-3 py-1 text-xs font-semibold text-activity [&_svg]:size-3.5"><ArrowLeft /> Back to current plan</button>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">{isPast ? "" : "Pick a day to train."}</p>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Day covers — 2 per row, branded art, recommended highlighted. */}
        <div className="grid grid-cols-2 gap-3">
          {(active?.body.days ?? []).map((day, i) => {
            const sets = day.isRestDay ? 0 : countSets(day);
            const exercises = day.isRestDay ? 0 : day.blocks.reduce((n, b) => n + b.slots.length, 0);
            const rec = !isPast && recommendedDay === i && !day.isRestDay;
            const onPick = () => { if (day.isRestDay) return; if (isPast) setPreview({ day, index: i }); else setDayIndex(i); };
            return (
              <motion.button key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} onClick={onPick} disabled={day.isRestDay} className="text-left disabled:opacity-80">
                <div className={`relative aspect-[4/5] overflow-hidden rounded-2xl bg-card transition-transform ${day.isRestDay ? "" : "active:scale-[0.98]"} ${rec ? "ring-2 ring-activity ring-offset-2 ring-offset-background" : ""}`}>
                  {day.imageUrl ? <img src={day.imageUrl} alt="" className="absolute inset-0 size-full object-cover" /> : <div className={`absolute inset-0 ${day.isRestDay ? "bg-gradient-to-br from-sleep/20 to-surface-2" : "bg-gradient-to-br from-primary/25 via-primary/5 to-surface-2"}`} />}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
                  {!day.imageUrl && <div className="absolute inset-0 grid place-items-center text-white/35 [&_svg]:size-9">{day.isRestDay ? <Moon /> : <Dumbbell />}</div>}
                  {day.isRestDay ? <span className="absolute right-2 top-2 rounded-full bg-sleep-soft px-2 py-0.5 text-[0.6rem] font-semibold text-sleep">Rest</span> : rec ? <span className="absolute right-2 top-2 rounded-full bg-activity px-2 py-0.5 text-[0.6rem] font-semibold text-white">Recommended</span> : null}
                  <div className="absolute inset-x-0 bottom-0 p-3">
                    <div className="truncate font-semibold text-white">{day.name || `Day ${i + 1}`}</div>
                    <div className="truncate text-xs text-white/75">{day.isRestDay ? "Rest day" : `${exercises} exercise${exercises === 1 ? "" : "s"} · ${sets} sets`}</div>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
        </div>

        {histOpen && (
          <Sheet open onClose={() => setHistOpen(false)} title="Past plans">
            <div className="space-y-1.5">
              {plan && (
                <button onClick={() => pickPlan(null)} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2", !isPast && "bg-activity-soft/40")}>
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-activity-soft text-activity [&_svg]:size-4"><Dumbbell /></span>
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{plan.name}</div><div className="text-xs text-muted-foreground">Current plan</div></div>
                  {!isPast && <Check className="size-4 shrink-0 text-activity" strokeWidth={3} />}
                </button>
              )}
              {pastPlans.map((p) => (
                <button key={p.id} onClick={() => pickPlan(p.id)} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2", viewId === p.id && "bg-surface-2")}>
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted-foreground [&_svg]:size-4"><History /></span>
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{p.name}</div><div className="text-xs text-muted-foreground">{p.publishedAt ? `Until ${new Date(p.publishedAt).toLocaleDateString()}` : "Superseded"}</div></div>
                  {viewId === p.id && <Check className="size-4 shrink-0 text-foreground" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </Sheet>
        )}

        {preview && <DayPreviewSheet day={preview.day} index={preview.index} exercises={exercises} onClose={() => setPreview(null)} />}
      </PlanShell>
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
    else if (broke.includes("duration")) { setToast(`Time PR — ${fmtDuration(set.durationSeconds!)}`); navigator.vibrate?.([30, 40, 60]); setTimeout(() => setToast(null), 3000); }
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
      else if (!pr && broke.includes("duration")) pr = `Time PR — ${fmtDuration(e.set.durationSeconds!)}`;
      else if (!pr && broke.includes("reps")) pr = `Rep PR — ${e.set.reps} reps`;
    }
    setBests(nextBests);
    if (pr) { setToast(pr); navigator.vibrate?.([30, 40, 60]); setTimeout(() => setToast(null), 3000); }
  };

  // Flatten the day into a linear timeline: each single-exercise slot is its own
  // step; each superset/circuit/HIIT block is one grouped step. Steps run in
  // order, so a vertical timeline reads exactly how you train the day.
  type Step = { blockIndex: number; block: WorkoutBlock } & ({ kind: "single"; slot: ExerciseSlot; slotIndex: number } | { kind: "group" });
  const steps: Step[] = [];
  day.blocks.forEach((block, blockIndex) => {
    if (block.type === "single") block.slots.forEach((slot, slotIndex) => steps.push({ kind: "single", block, blockIndex, slot, slotIndex }));
    else steps.push({ kind: "group", block, blockIndex });
  });

  return (
    <PlanShell onEscape={() => setDayIndex(null)}>
      <HeaderBar title={day.name || `Day ${dayIndex + 1}`} subtitle={`${loggedSets} of ${totalSets} set${totalSets === 1 ? "" : "s"} logged`} onBack={() => setDayIndex(null)}
        right={<span data-tour="wp-progress"><ProgressRing progress={totalSets ? loggedSets / totalSets : 0} size={40} strokeWidth={5} tone="activity" value={<span className="text-xs font-semibold">{loggedSets}</span>} /></span>} />

      <ol className="mx-auto max-w-xl p-4 pb-28">
        {steps.map((step, i) => {
          const last = i === steps.length - 1;
          const single = step.kind === "single";
          const logged = single ? session.get(`${step.blockIndex}:${step.slotIndex}`)?.filter((s) => s.completed).length ?? 0 : 0;
          const roundsDone = single ? 0 : (step.block.slots.length ? Math.min(...step.block.slots.map((_, si) => session.get(`${step.blockIndex}:${si}`)?.filter((s) => s.completed).length ?? 0)) : 0);
          const rounds = single ? 0 : step.block.rounds ?? 1;
          const done = single ? logged >= step.slot.sets.length : roundsDone >= rounds;
          return (
            <li key={i} className="flex gap-3">
              {/* Timeline rail — numbered node + connector down to the next step. */}
              <div className="flex flex-col items-center">
                <div className={cn("z-10 grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold ring-4 ring-background transition-colors [&_svg]:size-4", done ? "bg-activity text-white" : "bg-surface-3 text-muted-foreground")}>
                  {done ? <Check strokeWidth={3} /> : i + 1}
                </div>
                {!last && <div className="w-px flex-1 bg-border/60" />}
              </div>

              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="min-w-0 flex-1 pb-4">
                {single ? (() => {
                  const ex = exercises.get(step.slot.exerciseId);
                  const mode = step.slot.measurementMode;
                  const mods = slotModifiers(step.slot, units);
                  return (
                  // Rich single-exercise card — thumbnail, per-set dots + rest clocks, actions.
                  <div data-tour={i === 0 ? "wp-exercise" : undefined} className={cn("overflow-hidden rounded-2xl bg-card ring-1 ring-inset transition-colors", done ? "ring-activity/25" : "ring-border/50")}>
                    <button data-tour={i === 0 ? "wp-details" : undefined} onClick={() => setDetailSlot(step.slot)} className="flex w-full items-center gap-3 p-2.5 text-left transition-opacity active:opacity-80">
                      <ExerciseThumb thumb={ex?.thumb_url} thumb2={ex?.thumb2_url} size={60} className="rounded-xl" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 font-semibold"><span className="truncate">{ex?.name ?? "Exercise"}</span><Info className="size-3.5 shrink-0 text-muted-foreground" /></div>
                        {metaText(ex) && <div className="truncate text-xs text-muted-foreground">{metaText(ex)}</div>}
                      </div>
                    </button>
                    {/* Prescription — one dot per set with its target beneath, a tappable
                        rest clock in every gap, then the loading/effort modifiers. */}
                    <div className="px-2.5 pb-1">
                      <div data-tour={i === 0 ? "wp-sets" : undefined} className="flex flex-wrap items-start gap-x-1.5 gap-y-2">
                        {step.slot.sets.map((set, k) => (
                          <Fragment key={k}>
                            <div className="flex flex-col items-center gap-1">
                              <span className={cn("size-2.5 rounded-full transition-colors", setDotClass(set, k < logged))} />
                              <span className="text-[0.62rem] font-semibold leading-none tabular-nums text-muted-foreground">{setMeasureShort(set, mode)}</span>
                            </div>
                            {k < step.slot.sets.length - 1 && <RestTimer seconds={set.restAfterSec ?? 60} />}
                          </Fragment>
                        ))}
                      </div>
                      {mods.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{mods.map((m) => <span key={m} className="rounded bg-surface-2 px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground">{m}</span>)}</div>}
                      {step.slot.slotNotes && <p className="mt-2 text-[0.72rem] italic leading-snug text-muted-foreground">“{step.slot.slotNotes}”</p>}
                    </div>
                    <div className="mt-2 flex items-center gap-2 border-t border-border/50 p-2">
                      <Button size="icon-sm" variant="ghost" onClick={() => setSwapSlot({ blockIndex: step.blockIndex, slotIndex: step.slotIndex, exerciseId: step.slot.exerciseId })} aria-label="Swap"><ArrowLeftRight /></Button>
                      <Button data-tour={i === 0 ? "wp-log" : undefined} size="sm" className="flex-1" variant={done ? "secondary" : "default"} onClick={() => setLogSlot({ blockIndex: step.blockIndex, slotIndex: step.slotIndex, slot: step.slot })}>{done ? <><Check /> Done</> : `Log · ${logged}/${step.slot.sets.length}`}</Button>
                    </div>
                  </div>
                  ); })() : (
                  // Grouped block — superset/circuit/HIIT, logged one round at a time.
                  <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-inset ring-border/50">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pt-3"><Badge tone="activity">{blockLabel(step.block.type)}</Badge><span className="text-xs text-muted-foreground">{roundsDone}/{rounds} rounds</span>{step.block.restBetweenRoundsSec ? <span className="text-xs text-muted-foreground">· {fmtClock(step.block.restBetweenRoundsSec)} between</span> : null}</div>
                    {step.block.blockNotes && <p className="px-3 pt-1 text-[0.72rem] italic leading-snug text-muted-foreground">“{step.block.blockNotes}”</p>}
                    <div className="space-y-1.5 p-3">
                      {step.block.slots.map((slot, slotIndex) => (
                        <div key={slotIndex} className="rounded-xl bg-surface-2 p-2">
                          <ExerciseRow ex={exercises.get(slot.exerciseId)} info thumbSize={40} sub={measureSummary(slot)} onClick={() => setDetailSlot(slot)}
                            trailing={<Button size="icon-sm" variant="ghost" onClick={() => setSwapSlot({ blockIndex: step.blockIndex, slotIndex, exerciseId: slot.exerciseId })} aria-label="Swap"><ArrowLeftRight /></Button>} />
                        </div>
                      ))}
                      <Button className="w-full" variant={done ? "secondary" : "default"} disabled={done} onClick={() => setRoundBlock({ blockIndex: step.blockIndex, block: step.block, roundIndex: roundsDone })}>
                        {done ? <><Check /> Rounds complete</> : `Log round ${roundsDone + 1} of ${rounds}`}
                      </Button>
                    </div>
                  </div>
                )}
                {!last && (
                  <div data-tour={i === 0 ? "wp-timer" : undefined} className="mt-2.5 flex items-center gap-2 pl-0.5">
                    <span className="h-px w-4 bg-border/60" />
                    <RestTimer seconds={single ? stepRestSeconds(step.block, step.slot) : stepRestSeconds(step.block)} label />
                    <span className="text-[0.65rem] text-muted-foreground">before next</span>
                  </div>
                )}
              </motion.div>
            </li>
          );
        })}
      </ol>

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
    </PlanShell>
  );
}

/** Full-screen focused plan overlay — covers the app chrome (top bar + tab bar)
 *  and owns its own scroll, exactly like the meal-plan drawer, so a plan is a
 *  distraction-free surface rather than a page inside the shell. */
function PlanShell({ children, onEscape }: { children: ReactNode; onEscape?: () => void }) {
  const ref = useModalOverlay(onEscape);
  return (
    <motion.div ref={ref} role="dialog" aria-modal="true" aria-label="Workout plan" tabIndex={-1} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-background outline-none">
      {children}
    </motion.div>
  );
}

/** Sticky, blurred plan header — one bar for both the day picker and the active
 *  session, matching the meal-plan drawer so plans feel identical app-wide. */
function HeaderBar({ title, subtitle, onBack, right }: { title: string; subtitle?: ReactNode; onBack?: () => void; right?: ReactNode }) {
  return (
    <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/40 bg-background/85 px-4 py-3 backdrop-blur-xl">
      {onBack && <button onClick={onBack} aria-label="Back" className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-foreground transition-colors hover:bg-surface-3 [&_svg]:size-[1.15rem]"><ArrowLeft /></button>}
      <div className="min-w-0 flex-1"><div className="truncate text-base font-bold tracking-tight">{title}</div>{subtitle != null && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}</div>
      {right}
    </div>
  );
}

/** Read-only day preview for a PAST plan — the client browses what a day of a
 *  superseded plan prescribed (blocks, exercises, sets) without logging. */
function DayPreviewSheet({ day, index, exercises, onClose }: { day: WorkoutDay; index: number; exercises: Map<string, ExerciseLite>; onClose: () => void }) {
  const total = countSets(day);
  return (
    <Sheet open onClose={onClose} title={day.name || `Day ${index + 1}`}>
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">{day.blocks.reduce((n, b) => n + b.slots.length, 0)} exercise{day.blocks.reduce((n, b) => n + b.slots.length, 0) === 1 ? "" : "s"} · {total} sets</div>
        {day.blocks.map((block, bi) => (
          <div key={bi} className="space-y-2">
            <div className="flex items-center gap-2"><Badge tone="activity">{blockLabel(block.type)}</Badge>{block.type !== "single" && <span className="text-xs text-muted-foreground">{block.rounds ?? 1} rounds</span>}</div>
            {block.slots.map((slot, si) => {
              const ex = exercises.get(slot.exerciseId);
              return (
                <SubCard key={si}>
                  <ExerciseRow ex={ex} sub={measureSummary(slot)} />
                </SubCard>
              );
            })}
          </div>
        ))}
      </div>
    </Sheet>
  );
}

/** Read-only exercise detail: how-to instructions + media + the trainer's
 *  full prescription for this slot (SPEC §8.3 — client sees what's configured). */
function ExerciseDetailSheet({ ex, slot, onClose }: { ex?: ExerciseInfo; slot: ExerciseSlot; onClose: () => void }) {
  const units = useUnits();
  const primary = splitList(ex?.muscle_groups).map(pretty);
  const secondary = splitList(ex?.secondary_muscle_groups).map(pretty);
  const equipment = splitList(ex?.equipment).map(pretty);
  // Library attributes the trainer/library set: difficulty, movement type…
  const attrs = [ex?.difficulty, ex?.mechanic, ex?.force, ex?.category].filter(Boolean).map((a) => pretty(a!));
  const setLine = (s: WorkoutSet, i: number): string => {
    const parts: string[] = [];
    if (s.setType === "warmup") parts.push("Warm-up");
    else if (s.setType === "amrap") parts.push("AMRAP");
    parts.push(measurePart(s, slot.measurementMode));
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
    if (s.restAfterSec) parts.push(`rest ${fmtClock(s.restAfterSec)}`);
    return `Set ${i + 1} · ${parts.join(" · ")}`;
  };
  const Attr = ({ label, chips, tone }: { label: string; chips: string[]; tone: "primary" | "activity" | "neutral" }) => chips.length ? (
    <div className="flex items-start gap-2">
      <span className="mt-1 w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5">{chips.map((c) => <Badge key={c} tone={tone}>{c}</Badge>)}</div>
    </div>
  ) : null;
  return (
    <Sheet open onClose={onClose} title={ex?.name ?? "Exercise"}>
      <div className="space-y-4">
        {(ex?.thumb2_url || ex?.thumb_url) && (
          <div className="flex gap-2">
            {([["Start", ex?.thumb_url], ["End", ex?.thumb2_url]] as const).filter(([, src]) => src).map(([label, src]) => (
              <div key={label} className="relative min-w-0 flex-1 overflow-hidden rounded-2xl bg-surface-2">
                <img src={src!} alt="" className="h-40 w-full object-contain" />
                {ex?.thumb_url && ex?.thumb2_url && <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[0.65rem] font-semibold text-white">{label}</span>}
              </div>
            ))}
          </div>
        )}
        {ex?.video_url && (
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Demo video</div>
            <video src={ex.video_url} controls playsInline preload="metadata" className="w-full rounded-2xl bg-black" />
          </div>
        )}
        {(primary.length > 0 || secondary.length > 0 || equipment.length > 0 || attrs.length > 0) && (
          <div className="space-y-2">
            <Attr label="Muscles" chips={primary} tone="activity" />
            <Attr label="Also works" chips={secondary} tone="neutral" />
            <Attr label="Equipment" chips={equipment} tone="neutral" />
            <Attr label="Type" chips={attrs} tone="neutral" />
          </div>
        )}
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prescribed</div>
          <SubCard className="space-y-1.5">
            {slot.sets.map((s, i) => (
              <div key={i}>
                <div className="text-sm">{setLine(s, i)}</div>
                {s.notes && <div className="text-xs italic text-muted-foreground">{s.notes}</div>}
              </div>
            ))}
            {slot.slotNotes && <p className="border-t border-border/50 pt-1.5 text-xs italic text-muted-foreground">Coach: {slot.slotNotes}</p>}
          </SubCard>
        </div>
        {ex?.instructions_md ? (
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">How to</div>
            <Markdown className="text-[0.95rem] text-foreground/90">{ex.instructions_md}</Markdown>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No instructions yet — ask your coach for cues.</p>
        )}
      </div>
    </Sheet>
  );
}

function SetLogDrawer({ slot, exerciseName, logged, onClose, onSave }: { slot: ExerciseSlot; exerciseName: string; logged: LoggedSet[]; onClose: () => void; onSave: (s: LoggedSet) => Promise<void> }) {
  const units = useUnits();
  const mode = slot.measurementMode;
  const completed = logged.filter((s) => s.completed).sort((a, b) => a.setIndex - b.setIndex);
  const [setIndex, setSetIndex] = useState(completed.length);
  const [reps, setReps] = useState("");
  const [duration, setDuration] = useState("");
  const [distance, setDistance] = useState("");
  const [weight, setWeight] = useState("");
  const [effort, setEffort] = useState<"easy" | "perfect" | "hard" | null>(null);
  const prescribed = slot.sets[Math.min(setIndex, slot.sets.length - 1)];
  const showWeight = prescribed?.weightMode !== "bodyweight";
  const editing = completed.some((s) => s.setIndex === setIndex);

  // Tap a logged set to pull it back into the inputs and correct it.
  const edit = (s: LoggedSet) => {
    setSetIndex(s.setIndex);
    setReps(s.reps != null ? String(s.reps) : "");
    setDuration(s.durationSeconds != null ? String(s.durationSeconds) : "");
    setDistance(s.distanceM != null ? String(s.distanceM) : "");
    setWeight(s.weightKg != null ? String(kgToDisplay(s.weightKg, units)) : "");
    setEffort(s.effortLabel ?? null);
  };

  const save = async () => {
    const wasEditing = editing;
    // Guard a bad decimal (e.g. "70.5.5" → NaN): drop it rather than posting NaN
    // and feeding a bogus PR into detectPrs.
    const wNum = Number(weight);
    await onSave({
      setIndex,
      reps: needsReps(mode) ? (reps ? Number(reps) : prescribed?.reps ?? null) : null,
      durationSeconds: needsDuration(mode) ? (duration ? Number(duration) : prescribed?.timeSec ?? null) : null,
      distanceM: needsDistance(mode) ? (distance ? Number(distance) : prescribed?.distanceM ?? null) : null,
      weightKg: showWeight && weight && Number.isFinite(wNum) ? Math.round(displayToKg(wNum, units) * 100) / 100 : null,
      effortLabel: effort,
      completed: true,
    });
    setReps(""); setDuration(""); setDistance(""); setWeight(""); setEffort(null);
    if (wasEditing) setSetIndex(completed.length);
    else setSetIndex((i) => i + 1);
  };

  const canLog = editing || setIndex < slot.sets.length;
  const target = prescribed ? measurePart(prescribed, mode) : "";

  return (
    <Sheet open onClose={onClose} title={exerciseName}>
      <div className="space-y-4">
        {completed.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {completed.map((s) => (
              <button key={s.setIndex} onClick={() => edit(s)} className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${s.setIndex === setIndex ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-surface-3"}`}>
                {loggedLabel(s, units)}
              </button>
            ))}
          </div>
        )}
        <div className="text-sm text-muted-foreground">{editing ? `Editing set ${setIndex + 1}` : `Set ${setIndex + 1} of ${slot.sets.length}`}{target ? ` · target ${target}` : ""}</div>
        <div className="grid grid-cols-2 gap-3">
          {needsReps(mode) && <Field label="Reps" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value.replace(/\D/g, ""))} />}
          {needsDuration(mode) && <Field label="Duration (sec)" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value.replace(/\D/g, ""))} />}
          {needsDistance(mode) && <Field label="Distance (m)" inputMode="numeric" value={distance} onChange={(e) => setDistance(e.target.value.replace(/\D/g, ""))} />}
          {showWeight && <Field label={`Weight (${weightLabel(units)})`} inputMode="decimal" value={weight} onChange={(e) => setWeight(setDec(e.target.value))} />}
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
  type Vals = { reps: string; duration: string; distance: string; weight: string };
  const [vals, setVals] = useState<Record<number, Vals>>({});
  const [busy, setBusy] = useState(false);
  const units = useUnits();
  const rounds = block.rounds ?? 1;
  const setV = (si: number, patch: Partial<Vals>) => setVals((v) => ({ ...v, [si]: { reps: "", duration: "", distance: "", weight: "", ...v[si], ...patch } }));

  const save = async () => {
    setBusy(true);
    try {
      const entries = block.slots.map((slot, si) => {
        const mode = slot.measurementMode;
        const prescribed = slot.sets[Math.min(roundIndex, slot.sets.length - 1)];
        const v = vals[si] ?? { reps: "", duration: "", distance: "", weight: "" };
        const showWeight = prescribed?.weightMode !== "bodyweight";
        const wNum = Number(v.weight);
        return {
          slotIndex: si,
          exerciseId: slot.exerciseId,
          set: {
            setIndex: roundIndex,
            reps: needsReps(mode) ? (v.reps ? Number(v.reps) : prescribed?.reps ?? null) : null,
            durationSeconds: needsDuration(mode) ? (v.duration ? Number(v.duration) : prescribed?.timeSec ?? null) : null,
            distanceM: needsDistance(mode) ? (v.distance ? Number(v.distance) : prescribed?.distanceM ?? null) : null,
            weightKg: showWeight && v.weight && Number.isFinite(wNum) ? Math.round(displayToKg(wNum, units) * 100) / 100 : null,
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
          const mode = slot.measurementMode;
          const prescribed = slot.sets[Math.min(roundIndex, slot.sets.length - 1)];
          const showWeight = prescribed?.weightMode !== "bodyweight";
          const v = vals[si] ?? { reps: "", duration: "", distance: "", weight: "" };
          const target = prescribed ? measurePart(prescribed, mode) : "";
          return (
            <SubCard key={si} className="space-y-2">
              <ExerciseRow ex={exercises.get(slot.exerciseId)} meta={false} thumbSize={36}
                trailing={target ? <span className="shrink-0 text-xs text-muted-foreground">target {target}</span> : null} />
              <div className="grid grid-cols-2 gap-3">
                {needsReps(mode) && <Field label="Reps" inputMode="numeric" value={v.reps} onChange={(e) => setV(si, { reps: e.target.value.replace(/\D/g, "") })} />}
                {needsDuration(mode) && <Field label="Duration (sec)" inputMode="numeric" value={v.duration} onChange={(e) => setV(si, { duration: e.target.value.replace(/\D/g, "") })} />}
                {needsDistance(mode) && <Field label="Distance (m)" inputMode="numeric" value={v.distance} onChange={(e) => setV(si, { distance: e.target.value.replace(/\D/g, "") })} />}
                {showWeight && <Field label={`Weight (${weightLabel(units)})`} inputMode="decimal" value={v.weight} onChange={(e) => setV(si, { weight: setDec(e.target.value) })} />}
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
        <Reveal loading={alts === null} skeleton={
          <div>
            <SkeletonLine w="70%" h="xs" className="mb-2.5" />
            <SkeletonList rows={3} thumb={40} />
          </div>
        }>
          {alts !== null && (alts.length > 0 ? (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Instant swaps — coach-approved alternatives</div>
              <div className="space-y-1">
                {alts.map((e) => (
                  <button key={e.id} disabled={busy} onClick={() => void swapTo(e)} className="w-full rounded-xl bg-surface-2 px-2.5 py-2 text-left transition-colors hover:bg-surface-3 disabled:opacity-50">
                    <ExerciseRow ex={e} thumbSize={40} trailing={<ArrowLeftRight className="size-4 shrink-0 text-activity" />} />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No instant alternatives set for this exercise.</p>
          ))}
        </Reveal>

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

// ── Measurement-mode helpers: the plan can measure a set by reps, time,
//    distance, or reps-in-time — the UI reads/writes only the relevant fields.
type MeasureMode = ExerciseSlot["measurementMode"];
const needsReps = (m: MeasureMode) => m === "reps" || m === "reps_in_time";
const needsDuration = (m: MeasureMode) => m === "time" || m === "reps_in_time";
const needsDistance = (m: MeasureMode) => m === "distance";

/** Sanitize a decimal weight field: digits + a single dot, mirroring Eat's LogSheet. */
const setDec = (v: string) => v.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");

/** Seconds → "45s" or "1:30". */
function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/** The prescribed measure for a set, e.g. "10 reps", "30s", "500 m", "20 reps in 60s". */
function measurePart(s: WorkoutSet, mode: MeasureMode): string {
  const bits: string[] = [];
  if (needsReps(mode)) bits.push(s.reps != null ? `${s.reps} reps` : "reps");
  if (needsDuration(mode)) bits.push(s.timeSec != null ? fmtDuration(s.timeSec) : "time");
  if (needsDistance(mode)) bits.push(s.distanceM != null ? `${s.distanceM} m` : "distance");
  return bits.join(" in ");
}

/** Short slot prescription, e.g. "3 × 10 reps" / "4 × 30s" / "3 × 500 m". */
function measureSummary(slot: ExerciseSlot): string {
  const first = slot.sets[0];
  if (!first) return needsDistance(slot.measurementMode) ? "distance" : needsDuration(slot.measurementMode) ? "time" : "reps";
  return `${slot.sets.length} × ${measurePart(first, slot.measurementMode)}`;
}

/** What a logged set reads back as, e.g. "10 · 60 kg" / "45s" / "500m". */
function loggedLabel(s: LoggedSet, units: Parameters<typeof fmtWeight>[1]): string {
  const bits: string[] = [];
  if (s.reps != null) bits.push(`${s.reps}`);
  if (s.durationSeconds != null) bits.push(fmtDuration(s.durationSeconds));
  if (s.distanceM != null) bits.push(`${s.distanceM}m`);
  const measure = bits.join(" × ") || "–";
  return s.weightKg != null ? `${measure} · ${fmtWeight(s.weightKg, units)}` : measure;
}
function blockLabel(type: string): string {
  return type === "single" ? "Exercise" : type === "hiit" ? "HIIT" : type[0]!.toUpperCase() + type.slice(1);
}

/** Very short per-set measure for the dot labels: "10" / "30s" / "500m" / "10·30s". */
function setMeasureShort(s: WorkoutSet, mode: MeasureMode): string {
  const bits: string[] = [];
  if (needsReps(mode)) bits.push(s.reps != null ? `${s.reps}` : "–");
  if (needsDuration(mode)) bits.push(s.timeSec != null ? fmtDuration(s.timeSec) : "–");
  if (needsDistance(mode)) bits.push(s.distanceM != null ? `${s.distanceM}m` : "–");
  return bits.join("·") || "–";
}

/** The dot color encodes set type: logged (solid), warm-up, AMRAP, or a plain
 *  working set still to do. */
function setDotClass(s: WorkoutSet, done: boolean): string {
  if (done) return "bg-activity";
  if (s.setType === "warmup") return "bg-warning/60";
  if (s.setType === "amrap") return "bg-activity/40 ring-1 ring-inset ring-activity/60";
  return "bg-surface-3";
}

/** The trainer's loading/effort modifiers for a slot, as compact chips — read
 *  off the working set (or the first set): weight target, RPE/RIR, tempo, plus
 *  warm-up / AMRAP flags. Only what's actually set shows. */
function slotModifiers(slot: ExerciseSlot, units: Parameters<typeof fmtWeight>[1]): string[] {
  const out: string[] = [];
  const work = slot.sets.find((s) => s.setType === "working") ?? slot.sets[0];
  if (work) {
    const wm = work.weightMode;
    if (wm === "absolute" && work.weightValue != null) out.push(fmtWeight(work.weightValue, units));
    else if (wm === "percent_1rm" && work.percent1rm != null) out.push(`${work.percent1rm}% 1RM`);
    else if (wm === "bodyweight") out.push("Bodyweight");
    else if (wm === "previous_plus" && work.weightValue != null) out.push(`Prev +${fmtWeight(work.weightValue, units)}`);
    else if (wm === "previous_times" && work.weightValue != null) out.push(`Prev ×${work.weightValue}`);
    else if (wm === "dropset") out.push("Dropset");
    if (work.rpe != null) out.push(`RPE ${work.rpe}`);
    else if (work.rir != null) out.push(`RIR ${work.rir}`);
    if (work.tempo) out.push(`Tempo ${work.tempo}`);
  }
  if (slot.sets.some((s) => s.setType === "warmup")) out.push("Warm-up incl.");
  if (slot.sets.some((s) => s.setType === "amrap")) out.push("AMRAP");
  return out;
}

/** The rest to suggest after a whole step (for the between-exercise timer):
 *  a group rests by its block config; a single rests by its last set. */
function stepRestSeconds(block: WorkoutBlock, slot?: ExerciseSlot): number {
  if (slot) return slot.sets[slot.sets.length - 1]?.restAfterSec ?? 90;
  return block.restAfterBlockSec ?? block.restBetweenExercisesSec ?? block.restBetweenRoundsSec ?? 90;
}

/** mm:ss / Ns clock label. */
function fmtClock(sec: number): string {
  if (sec <= 0) return "0s";
  return sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}` : `${sec}s`;
}

/**
 * A self-contained rest timer chip: shows the prescribed rest, tap to start the
 * countdown, tap again to reset. Buzzes and flashes "Go" when it lands on zero.
 * Used between the set dots (per-set rest) and between exercises (step rest).
 */
function RestTimer({ seconds, label, className }: { seconds: number; label?: boolean; className?: string }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (left === null) return;
    if (left <= 0) { navigator.vibrate?.([40, 30, 60]); const t = setTimeout(() => setLeft(null), 1100); return () => clearTimeout(t); }
    const t = setInterval(() => setLeft((r) => (r == null ? null : r - 1)), 1000);
    return () => clearInterval(t);
  }, [left]);
  const running = left !== null && left > 0;
  const done = left === 0;
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); setLeft((r) => (r === null ? seconds : null)); }}
      aria-label={running ? "Reset rest timer" : "Start rest timer"}
      className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold tabular-nums transition-colors [&_svg]:size-3",
        done ? "bg-activity text-white" : running ? "bg-cardio text-white" : "bg-surface-3 text-muted-foreground hover:bg-surface-2", className)}>
      <Timer />{done ? "Go!" : `${label ? "Rest " : ""}${fmtClock(running ? left! : seconds)}`}
    </button>
  );
}
