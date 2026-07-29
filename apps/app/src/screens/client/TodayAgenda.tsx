/**
 * Today's agenda — the "what should I do today" checklist on the home screen.
 * Pulls the day's expected tasks from the client's actual plans: a daily
 * check-in, today's workout (if a plan is published), one line per meal in the
 * meal plan, and each prescribed supplement dose. Every row is a real checkbox
 * — supplements toggle in place; meals/workout/check-in mark done from the
 * day's logs and tap through to where you complete them.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Card, IconBadge, cn, Check, ClipboardList, Dumbbell, Utensils, Pill, ChevronRight, ChevronDown, type LucideIcon, type Tone, SPRING_SNAP, SPRING_SOFT, DUR,
} from "@kova/ui";
import { api, isQueued, errorText } from "../../api.js";
import { QueuedNotice } from "../../notices.js";
import type { TodayBundle } from "./Today.js";

interface Supp { id: string; name: string; dose: string | null; schedule: { slot: string }[] }
interface MealPlan { status: string; body: { mealOptions?: { mealType: string }[] } }

/** The agenda's own data, fetched with the rest of the Today page so it mounts
 *  complete — no skeleton→content swap that would stutter the page animation. */
export interface AgendaData { supps: Supp[]; taken: string[]; mealTypes: string[]; loggedMeals: string[] }

export async function fetchAgenda(clientId: string, date: string): Promise<AgendaData> {
  const [s, sl, mp, food] = await Promise.all([
    api.get<{ supplements: Supp[] }>(`/api/supplements?clientId=${clientId}`).catch(() => ({ supplements: [] })),
    api.get<{ taken: { supplement_id: string; slot: string }[] }>(`/api/supplements/logs?clientId=${clientId}&date=${date}`).catch(() => ({ taken: [] })),
    api.get<{ plans: MealPlan[] }>(`/api/meal-plans?clientId=${clientId}`).catch(() => ({ plans: [] })),
    api.get<{ entries: { meal_type: string }[] }>(`/api/logs/food?clientId=${clientId}&date=${date}`).catch(() => ({ entries: [] })),
  ]);
  const pub = mp.plans.find((p) => p.status === "published");
  const types = pub?.body.mealOptions ? [...new Set(pub.body.mealOptions.map((o) => o.mealType))] : [];
  const ord = (x: string) => { const i = MEAL_ORDER.indexOf(x); return i < 0 ? 99 : i; };
  return {
    supps: s.supplements,
    taken: sl.taken.map((t) => `${t.supplement_id}:${t.slot}`),
    mealTypes: types.sort((a, b) => ord(a) - ord(b)),
    loggedMeals: food.entries.map((e) => e.meal_type),
  };
}

const MEAL_LABEL: Record<string, string> = { breakfast: "breakfast", lunch: "lunch", dinner: "dinner", snack: "snack", pre_workout: "pre-workout", post_workout: "post-workout", free: "free meal" };
const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack", "pre_workout", "post_workout", "free"];
const slotLabel = (s: string) => (s === "daily" ? "" : s.replace(/_/g, " "));

/** A single agenda line: a checkbox + label; tapping runs `onClick` (toggle a
 *  supplement, or jump to where a task is completed). */
export function CheckRow({ icon: Icon, tone, label, sub, done, actionable, onClick }: { icon: LucideIcon; tone: Tone; label: string; sub?: string; done: boolean; actionable: boolean; onClick: () => void }) {
  return (
    <motion.button onClick={onClick} whileTap={{ scale: 0.99 }} className="flex w-full items-center gap-3 py-2.5 text-left">
      <CheckBox done={done} />
      <IconBadge icon={Icon} tone={tone} size="sm" />
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-sm font-medium transition-colors", done && "text-muted-foreground line-through")}>{label}</div>
        {sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}
      </div>
      {!done && actionable && <ChevronRight className="size-4 shrink-0 text-muted-foreground/40" />}
    </motion.button>
  );
}

/** An animated checkbox in the brand accent: the ring fills with the accent
 *  (a tenant-themeable token), springs with a satisfying pop, then the check
 *  settles in. */
function CheckBox({ done }: { done: boolean }) {
  return (
    <span className={cn("relative grid size-6 shrink-0 place-items-center overflow-hidden rounded-full border-2 transition-colors duration-300", done ? "border-transparent" : "border-surface-3")}>
      <motion.span aria-hidden className="absolute inset-0 rounded-full bg-primary" initial={false} animate={{ scale: done ? 1 : 0, opacity: done ? 1 : 0 }} transition={SPRING_SNAP} />
      <AnimatePresence initial={false}>
        {done && (
          <motion.span key="check" className="relative text-primary-foreground [&_svg]:size-3.5" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={{ ...SPRING_SNAP, delay: 0.06 }}>
            <Check strokeWidth={3.5} />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

export function TodayAgenda({ clientId, date, bundle, agenda, onChanged, onNavigate, onCheckIn, onStartWorkout }: {
  clientId: string; date: string; bundle: TodayBundle; agenda: AgendaData; onChanged: () => void; onNavigate?: (route: string) => void; onCheckIn: () => void; onStartWorkout?: () => void;
}) {
  const { supps, mealTypes } = agenda;
  const loggedMeals = useMemo(() => new Set(agenda.loggedMeals), [agenda.loggedMeals]);
  // Supplement checks toggle optimistically; re-sync to server truth when the
  // page reloads new agenda data.
  const [taken, setTaken] = useState<Set<string>>(() => new Set(agenda.taken));
  useEffect(() => { setTaken(new Set(agenda.taken)); }, [agenda.taken]);
  const [expanded, setExpanded] = useState(false);
  const [suppErr, setSuppErr] = useState<string | null>(null);
  const [suppQueued, setSuppQueued] = useState(false);

  /**
   * Per-slot in-flight guard. `/api/supplements/:id/log` is a TOGGLE: two fast
   * taps insert then delete, and if the first response resolves last the checkbox
   * settles ticked while the server holds no log. Supplement adherence feeds the
   * coach's report, so that desync shows the coach a missed dose the client is
   * certain they logged. So: one tap per slot at a time, the server's answer wins,
   * and a failure puts the tick back instead of leaving a comforting lie.
   */
  const inFlight = useRef<Set<string>>(new Set());
  const toggleSupp = async (id: string, slot: string) => {
    const key = `${id}:${slot}`;
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    const wasTaken = taken.has(key);
    setSuppErr(null); setSuppQueued(false);
    setTaken((p) => { const n = new Set(p); wasTaken ? n.delete(key) : n.add(key); return n; });
    try {
      const r = await api.post<{ taken: boolean }>(`/api/supplements/${id}/log`, { clientId, date, slot });
      setTaken((p) => { const n = new Set(p); r.taken ? n.add(key) : n.delete(key); return n; });
      onChanged();
    } catch (e) {
      // Queued: the toggle replays on reconnect, so keep the optimistic tick and
      // deliberately DON'T call onChanged() — re-reading now would pull down the
      // server's pre-queue truth and un-tick a dose that is going to land.
      if (isQueued(e)) { setSuppQueued(true); return; }
      setTaken((p) => { const n = new Set(p); wasTaken ? n.add(key) : n.delete(key); return n; });
      setSuppErr(errorText(e, "Couldn't log that dose — it wasn't saved."));
    } finally { inFlight.current.delete(key); }
  };

  interface Item { key: string; icon: LucideIcon; tone: Tone; label: string; sub?: string; done: boolean; actionable: boolean; onClick: () => void }
  const items: Item[] = [];
  items.push({ key: "checkin", icon: ClipboardList, tone: "nutrition", label: "Daily check-in", sub: bundle.checkedIn ? "Logged today" : "Weight, mood, sleep", done: bundle.checkedIn, actionable: true, onClick: onCheckIn });
  if (bundle.publishedWorkoutPlan) {
    const done = bundle.workout.loggedSets > 0;
    items.push({ key: "workout", icon: Dumbbell, tone: "activity", label: "Today's workout", sub: done ? `${bundle.workout.loggedSets} sets logged` : bundle.publishedWorkoutPlan.name, done, actionable: true, onClick: () => onStartWorkout?.() });
  }
  for (const mt of mealTypes) {
    items.push({ key: `meal:${mt}`, icon: Utensils, tone: "nutrition", label: `Log ${MEAL_LABEL[mt] ?? mt.replace(/_/g, " ")}`, done: loggedMeals.has(mt), actionable: true, onClick: () => onNavigate?.("/eat") });
  }
  for (const s of supps) {
    for (const sc of s.schedule.length ? s.schedule : [{ slot: "daily" }]) {
      const key = `${s.id}:${sc.slot}`;
      items.push({ key: `supp:${key}`, icon: Pill, tone: "supplement", label: `Take ${s.name}`, sub: [s.dose, slotLabel(sc.slot)].filter(Boolean).join(" · ") || undefined, done: taken.has(key), actionable: false, onClick: () => void toggleSupp(s.id, sc.slot) });
    }
  }

  if (items.length === 0) return null;
  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;
  // When everything's done the checklist collapses into the celebration banner;
  // tap it to expand the list back (e.g. to re-check or review).
  const showList = !allDone || expanded;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-micro uppercase text-muted-foreground">Today</h3>
        <AnimatePresence mode="wait" initial={false}>
          {allDone ? (
            <motion.span key="done" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={SPRING_SNAP} className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
              <Check strokeWidth={3} className="size-3" /> Complete
            </motion.span>
          ) : (
            <span key="count" className="numeral text-xs font-semibold text-muted-foreground">{doneCount}/{items.length}</span>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence initial={false}>
        {allDone && <CompletionBanner count={items.length} expanded={expanded} onToggle={() => setExpanded((e) => !e)} />}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {showList && (
          <motion.div key="list" initial={allDone ? { opacity: 0, height: 0 } : false} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={SPRING_SOFT} className="overflow-hidden">
            <Card className="divide-y divide-border/40 py-0.5">
              {items.map((i) => <CheckRow key={i.key} icon={i.icon} tone={i.tone} label={i.label} sub={i.sub} done={i.done} actionable={i.actionable} onClick={i.onClick} />)}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
      {suppQueued && <QueuedNotice className="px-1" />}
      {suppErr && <p role="alert" className="px-1 text-sm text-warning">{suppErr}</p>}
    </section>
  );
}

/** The celebratory "everything's done" banner — a spring-in check with a
 *  one-shot ripple burst and a soft accent glow. Replaces the emoji with
 *  something that actually feels earned. */
function CompletionBanner({ count, expanded, onToggle }: { count: number; expanded: boolean; onToggle: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onToggle}
      initial={{ opacity: 0, y: -6, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      exit={{ opacity: 0, y: -6, height: 0 }}
      transition={SPRING_SOFT}
      className="relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-success/15 to-primary/10 p-4 text-left transition-colors hover:from-success/20"
    >
      <div className="pointer-events-none absolute -right-6 -top-8 size-24 rounded-full bg-success/25 blur-2xl" />
      <div className="relative flex items-center gap-3">
        <div className="relative grid size-11 shrink-0 place-items-center">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              aria-hidden
              className="absolute inset-0 rounded-full border border-success/50"
              initial={{ scale: 0.5, opacity: 0.7 }}
              animate={{ scale: 2, opacity: 0 }}
              transition={{ duration: DUR.draw, ease: "easeOut", delay: 0.1 + i * 0.12 }}
            />
          ))}
          <motion.span
            className="relative grid size-11 place-items-center rounded-full bg-success text-[var(--tone-foreground)] [&_svg]:size-5"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={SPRING_SNAP}
          >
            <motion.span initial={{ scale: 0, rotate: -25 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...SPRING_SNAP, delay: 0.14 }}>
              <Check strokeWidth={3.5} />
            </motion.span>
          </motion.span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">All done for today</div>
          <div className="text-xs text-muted-foreground">{count} {count === 1 ? "task" : "tasks"} complete — {expanded ? "tap to hide" : "tap to review"}.</div>
        </div>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </div>
    </motion.button>
  );
}
