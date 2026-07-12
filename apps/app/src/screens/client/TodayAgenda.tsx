/**
 * Today's agenda — the "what should I do today" checklist on the home screen.
 * Pulls the day's expected tasks from the client's actual plans: a daily
 * check-in, today's workout (if a plan is published), one line per meal in the
 * meal plan, and each prescribed supplement dose. Every row is a real checkbox
 * — supplements toggle in place; meals/workout/check-in mark done from the
 * day's logs and tap through to where you complete them.
 */

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Card, IconBadge, Skeleton, cn, toneVar, Check, ClipboardList, Dumbbell, Utensils, Pill, ChevronRight, type LucideIcon, type Tone,
} from "@mossa/ui";
import { api } from "../../api.js";
import type { TodayBundle } from "./Today.js";

interface Supp { id: string; name: string; dose: string | null; schedule: { slot: string }[] }
interface MealPlan { status: string; body: { mealOptions?: { mealType: string }[] } }

const MEAL_LABEL: Record<string, string> = { breakfast: "breakfast", lunch: "lunch", dinner: "dinner", snack: "snack", pre_workout: "pre-workout", post_workout: "post-workout", free: "free meal" };
const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack", "pre_workout", "post_workout", "free"];
const slotLabel = (s: string) => (s === "daily" ? "" : s.replace(/_/g, " "));

/** A single agenda line: a checkbox + label; tapping runs `onClick` (toggle a
 *  supplement, or jump to where a task is completed). */
export function CheckRow({ icon: Icon, tone, label, sub, done, actionable, onClick }: { icon: LucideIcon; tone: Tone; label: string; sub?: string; done: boolean; actionable: boolean; onClick: () => void }) {
  return (
    <motion.button onClick={onClick} whileTap={{ scale: 0.99 }} className="flex w-full items-center gap-3 py-2.5 text-left">
      <CheckBox tone={tone} done={done} />
      <IconBadge icon={Icon} tone={tone} size="sm" />
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-sm font-medium transition-colors", done && "text-muted-foreground line-through")}>{label}</div>
        {sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}
      </div>
      {!done && actionable && <ChevronRight className="size-4 shrink-0 text-muted-foreground/40" />}
    </motion.button>
  );
}

/** An animated, theme-toned checkbox: the ring fills with the row's metric
 *  color (a tenant-themeable token), springs with a satisfying pop, then the
 *  check settles in. */
function CheckBox({ tone, done }: { tone: Tone; done: boolean }) {
  return (
    <span className={cn("relative grid size-6 shrink-0 place-items-center overflow-hidden rounded-full border-2 transition-colors duration-300", done ? "border-transparent" : "border-surface-3")}>
      <motion.span aria-hidden className="absolute inset-0 rounded-full" style={{ backgroundColor: toneVar[tone] }} initial={false} animate={{ scale: done ? 1 : 0, opacity: done ? 1 : 0 }} transition={{ type: "spring", stiffness: 480, damping: 26 }} />
      <AnimatePresence initial={false}>
        {done && (
          <motion.span key="check" className="relative text-white [&_svg]:size-3.5" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={{ type: "spring", stiffness: 620, damping: 20, delay: 0.06 }}>
            <Check strokeWidth={3.5} />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

export function TodayAgenda({ clientId, date, bundle, onChanged, onNavigate, onCheckIn, onStartWorkout }: {
  clientId: string; date: string; bundle: TodayBundle; onChanged: () => void; onNavigate?: (route: string) => void; onCheckIn: () => void; onStartWorkout?: () => void;
}) {
  const [supps, setSupps] = useState<Supp[]>([]);
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [mealTypes, setMealTypes] = useState<string[]>([]);
  const [loggedMeals, setLoggedMeals] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [s, sl, mp, food] = await Promise.all([
      api.get<{ supplements: Supp[] }>(`/api/supplements?clientId=${clientId}`).catch(() => ({ supplements: [] })),
      api.get<{ taken: { supplement_id: string; slot: string }[] }>(`/api/supplements/logs?clientId=${clientId}&date=${date}`).catch(() => ({ taken: [] })),
      api.get<{ plans: MealPlan[] }>(`/api/meal-plans?clientId=${clientId}`).catch(() => ({ plans: [] })),
      api.get<{ entries: { meal_type: string }[] }>(`/api/logs/food?clientId=${clientId}&date=${date}`).catch(() => ({ entries: [] })),
    ]);
    setSupps(s.supplements);
    setTaken(new Set(sl.taken.map((t) => `${t.supplement_id}:${t.slot}`)));
    const pub = mp.plans.find((p) => p.status === "published");
    const types = pub?.body.mealOptions ? [...new Set(pub.body.mealOptions.map((o) => o.mealType))] : [];
    const ord = (x: string) => { const i = MEAL_ORDER.indexOf(x); return i < 0 ? 99 : i; };
    setMealTypes(types.sort((a, b) => ord(a) - ord(b)));
    setLoggedMeals(new Set(food.entries.map((e) => e.meal_type)));
    setLoaded(true);
  }, [clientId, date]);
  useEffect(() => void load(), [load]);

  const toggleSupp = async (id: string, slot: string) => {
    const key = `${id}:${slot}`;
    const r = await api.post<{ taken: boolean }>(`/api/supplements/${id}/log`, { clientId, date, slot });
    setTaken((p) => { const n = new Set(p); r.taken ? n.add(key) : n.delete(key); return n; });
    onChanged();
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
      items.push({ key: `supp:${key}`, icon: Pill, tone: "activity", label: `Take ${s.name}`, sub: [s.dose, slotLabel(sc.slot)].filter(Boolean).join(" · ") || undefined, done: taken.has(key), actionable: false, onClick: () => void toggleSupp(s.id, sc.slot) });
    }
  }

  if (!loaded) return <Skeleton className="h-40" />;
  if (items.length === 0) return null;
  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Today</h3>
        <span className={cn("numeral text-xs font-semibold", allDone ? "text-success" : "text-muted-foreground")}>{allDone ? "All done 🎉" : `${doneCount}/${items.length}`}</span>
      </div>
      <Card className="divide-y divide-border/40 py-0.5">
        {items.map((i) => <CheckRow key={i.key} icon={i.icon} tone={i.tone} label={i.label} sub={i.sub} done={i.done} actionable={i.actionable} onClick={i.onClick} />)}
      </Card>
    </section>
  );
}
