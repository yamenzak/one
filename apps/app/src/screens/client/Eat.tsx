/** Eat tab — the nutrition diary: intake vs target, meals, per-entry macros. */

import { useCallback, useEffect, useState } from "react";
import { fmtEnergy, fmtVolume, volumeDisplayToMl, kcalToDisplay } from "@mossa/domain";
import {
  Button, Card, Field, Chip, Sheet, Skeleton, IconBadge, MacroBar, MetricChip, ProgressRing, METRICS, toneSoft, Page, Stagger, EmptyState, motion,
  Plus, ClipboardList, Utensils, Croissant, Soup, Apple, Dumbbell, Droplet, Beef, Camera, Trash2, type LucideIcon,
} from "@mossa/ui";
import type { UnitPrefs } from "@mossa/domain";
import { api, todayLocal } from "../../api.js";
import { useUnits } from "../../units.js";
import { FoodRow, normFood } from "../food.js";
import { FoodSearchSheet } from "./FoodSearchSheet.js";
import { MealPlanDrawer } from "./MealPlanDrawer.js";
import { CoachNote } from "./CoachNote.js";

interface Entry { id: string; meal_type: string; label: string | null; calories: number; protein_g: number; carbs_g: number; fat_g: number; quantity: number | null; unit: string | null; image_url: string | null }
interface Targets { targetCalories?: number; targetProteinG?: number; targetCarbsG?: number; targetFatG?: number; targetWaterMl?: number }
interface WeekDay { date: string; calories: number; proteinG: number; waterMl: number; logged: boolean }
interface Week { days: WeekDay[]; targets: { calories: number | null; proteinG: number | null; waterMl: number | null } }

const MEAL_META: Record<string, { label: string; icon: LucideIcon }> = {
  breakfast: { label: "Breakfast", icon: Croissant },
  lunch: { label: "Lunch", icon: Soup },
  dinner: { label: "Dinner", icon: Utensils },
  snack: { label: "Snack", icon: Apple },
  pre_workout: { label: "Pre-workout", icon: Dumbbell },
  post_workout: { label: "Post-workout", icon: Dumbbell },
  free: { label: "Free meal", icon: Utensils },
};
const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack", "pre_workout", "post_workout", "free"];
const metaFor = (m: string) => MEAL_META[m] ?? { label: m.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()), icon: Utensils };

export function Eat({ clientId }: { clientId: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [targets, setTargets] = useState<Targets | null>(null);
  const [week, setWeek] = useState<Week | null>(null);
  const [waterMl, setWaterMl] = useState(0);
  const [logMeal, setLogMeal] = useState<string | undefined>(undefined);
  const [logOpen, setLogOpen] = useState(false);
  const [logCamera, setLogCamera] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [mealPlan, setMealPlan] = useState<{ name: string; meals: number; options: number } | null>(null);
  const [edit, setEdit] = useState<Entry | null>(null);
  const units = useUnits();
  const date = todayLocal();

  const load = useCallback(async () => {
    const [e, today, wk, mp] = await Promise.all([
      api.get<{ entries: Entry[] }>(`/api/logs/food?clientId=${clientId}&date=${date}`),
      api.get<{ goal: { targets: Targets | null } | null }>(`/api/today?clientId=${clientId}&date=${date}`),
      api.get<Week>(`/api/logs/nutrition/week?clientId=${clientId}&date=${date}`),
      api.get<{ plans: { status: string; name: string; body?: { mealOptions?: { mealType: string }[] } }[] }>(`/api/meal-plans?clientId=${clientId}`).catch(() => ({ plans: [] })),
    ]);
    setEntries(e.entries); setTargets(today.goal?.targets ?? null);
    setWeek(wk); setWaterMl(wk.days[wk.days.length - 1]?.waterMl ?? 0);
    const published = mp.plans.find((p) => p.status === "published");
    const opts = published?.body?.mealOptions ?? [];
    setMealPlan(published ? { name: published.name, meals: new Set(opts.map((o) => o.mealType)).size, options: opts.length } : null);
  }, [clientId, date]);
  useEffect(() => void load(), [load]);

  const waterTarget = targets?.targetWaterMl ?? week?.targets.waterMl ?? 2500;
  const waterPresets = units.volume === "oz" ? [8, 12, 16] : [250, 500, 750];
  const addWater = async (displayAmount: number) => {
    const ml = Math.round(volumeDisplayToMl(displayAmount, units));
    setWaterMl((w) => w + ml);
    await api.post("/api/logs/water", { clientId, data: { date, amountMl: ml } });
  };

  const openLog = (meal?: string, camera = false) => { setLogMeal(meal); setLogCamera(camera); setLogOpen(true); };

  if (!entries) return <Skeleton className="m-4 h-64" />;

  const byMeal = new Map<string, Entry[]>();
  for (const e of entries) byMeal.set(e.meal_type, [...(byMeal.get(e.meal_type) ?? []), e]);
  const meals = [...MEAL_ORDER.filter((m) => byMeal.has(m)), ...[...byMeal.keys()].filter((m) => !MEAL_ORDER.includes(m))];
  const sum = (f: (e: Entry) => number) => entries.reduce((n, e) => n + (f(e) || 0), 0);
  const total = sum((e) => e.calories);
  const proteinTotal = Math.round(sum((e) => e.protein_g));
  const proteinTarget = targets?.targetProteinG ?? 0;
  const calTarget = targets?.targetCalories ?? 0;
  const pct = calTarget > 0 ? total / calTarget : 0;
  const remaining = calTarget - total;
  const waterPct = Math.min(100, Math.max(3, (waterMl / waterTarget) * 100));

  return (
    <Page className="mx-auto max-w-xl space-y-5 p-4 pb-28">
      <h1 className="text-2xl font-bold tracking-tight">Eat</h1>

      <Stagger><CoachNote clientId={clientId} surface="eat" /></Stagger>

      {/* Hero — today's intake, the visual anchor */}
      <Stagger>
        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-calories/10 blur-2xl" />
          <div className="relative flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-medium uppercase tracking-wide text-calories">Today's intake</div>
              <div className="numeral mt-1.5 text-3xl font-bold leading-none">{fmtEnergy(total, units)}</div>
              <div className="mt-1.5 text-sm text-muted-foreground">
                {calTarget > 0 ? (remaining >= 0 ? `${fmtEnergy(remaining, units)} left` : `${fmtEnergy(-remaining, units)} over`) : "Log your meals to track intake"}
              </div>
            </div>
            {calTarget > 0 && (
              <ProgressRing size={92} strokeWidth={9} tone={remaining < 0 ? "danger" : "calories"} progress={pct} value={`${Math.round(pct * 100)}%`} className="shrink-0" />
            )}
          </div>
          <MacroBar
            className="relative mt-4"
            proteinG={sum((e) => e.protein_g)}
            carbsG={sum((e) => e.carbs_g)}
            fatG={sum((e) => e.fat_g)}
            targets={targets ? { proteinG: targets.targetProteinG, carbsG: targets.targetCarbsG, fatG: targets.targetFatG } : null}
          />
        </Card>
      </Stagger>

      {/* Your meal plan — the primary entry (parity with Train's active-plan hero) */}
      {mealPlan && (
        <Stagger>
          <button onClick={() => setPlanOpen(true)} className="w-full text-left">
            <Card interactive className="relative overflow-hidden">
              <div className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-nutrition/10 blur-2xl" />
              <div className="relative flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium uppercase tracking-wide text-nutrition">Your meal plan</div>
                  <h2 className="mt-0.5 truncate text-xl font-semibold tracking-tight">{mealPlan.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{mealPlan.meals} meal{mealPlan.meals === 1 ? "" : "s"} · {mealPlan.options} options to choose from</p>
                </div>
                <div className="grid size-12 shrink-0 place-items-center rounded-full bg-nutrition-soft text-nutrition [&_svg]:size-6"><Utensils /></div>
              </div>
            </Card>
          </button>
        </Stagger>
      )}

      {/* Primary actions — directly available */}
      <Stagger className="flex flex-wrap gap-2">
        <Chip icon={Plus} selected onClick={() => openLog()}>Log food</Chip>
        <Chip icon={Camera} onClick={() => openLog(undefined, true)}>Snap a meal</Chip>
        {!mealPlan && <Chip icon={ClipboardList} onClick={() => setPlanOpen(true)}>My plan</Chip>}
      </Stagger>

      {/* Today — hydration + protein at a glance */}
      <section className="space-y-2">
        <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Today</h3>
        <Stagger className="grid grid-cols-2 gap-3">
          <div className="relative flex flex-col gap-2.5 overflow-hidden rounded-2xl bg-card p-4">
            <div className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-hydration/10 blur-2xl" />
            <div className="relative flex items-center gap-2 text-sm text-muted-foreground"><Droplet className="size-4 text-hydration" /><span>Water</span></div>
            <div className="numeral relative text-[1.6rem] font-semibold leading-none">{fmtVolume(waterMl, units)}<span className="ml-1 text-sm font-medium text-muted-foreground">/ {fmtVolume(waterTarget, units)}</span></div>
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-hydration transition-all duration-500" style={{ width: `${waterPct}%` }} /></div>
            <div className="relative flex gap-1.5">
              {waterPresets.map((v) => <button key={v} onClick={() => void addWater(v)} className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-transform active:scale-95 ${toneSoft.hydration}`}>+{v}</button>)}
            </div>
          </div>
          <div className="relative flex flex-col gap-2.5 overflow-hidden rounded-2xl bg-card p-4">
            <div className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-protein/10 blur-2xl" />
            <div className="relative flex items-center gap-2 text-sm text-muted-foreground"><Beef className="size-4 text-protein" /><span>Protein</span></div>
            <div className="numeral relative text-[1.6rem] font-semibold leading-none">{proteinTotal}<span className="ml-1 text-sm font-medium text-muted-foreground">{proteinTarget > 0 ? `/ ${proteinTarget} g` : "g"}</span></div>
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-2">{proteinTarget > 0 && <div className="h-full rounded-full bg-protein transition-all duration-500" style={{ width: `${Math.min(100, Math.max(3, (proteinTotal / proteinTarget) * 100))}%` }} />}</div>
            <div className="relative text-xs text-muted-foreground">{proteinTarget > 0 ? (proteinTotal >= proteinTarget ? "Goal reached" : `${proteinTarget - proteinTotal} g to go`) : "No target set"}</div>
          </div>
        </Stagger>
      </section>

      {/* Today's meals */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Today's meals</h3>
          {entries.length > 0 && <button onClick={() => openLog()} className="inline-flex items-center gap-1 text-sm font-medium text-primary [&_svg]:size-4"><Plus /> Log</button>}
        </div>
        {entries.length === 0 ? (
          <EmptyState icon={Utensils} title="Nothing logged today" description="Log your first meal — search, barcode, snap a photo, or your plan." action={<Button onClick={() => openLog()}><Plus /> Log food</Button>} />
        ) : (
          <Stagger className="space-y-3">
            {meals.map((meal) => {
              const list = byMeal.get(meal)!;
              const meta = metaFor(meal);
              const mealCal = list.reduce((n, e) => n + e.calories, 0);
              return (
                <Card key={meal} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5"><IconBadge icon={meta.icon} tone="nutrition" size="sm" /><span className="font-semibold">{meta.label}</span></div>
                    <span className="numeral text-sm font-semibold text-calories">{fmtEnergy(mealCal, units)}</span>
                  </div>
                  <div className="divide-y divide-border/40">
                    {list.map((e) => (
                      <FoodRow
                        key={e.id}
                        {...normFood(e)}
                        sub={e.quantity ? `${Math.round(e.quantity)} ${e.unit ?? "g"}` : undefined}
                        thumbSize={36}
                        onClick={() => setEdit(e)}
                        className="py-2.5"
                      />
                    ))}
                  </div>
                  <button onClick={() => openLog(meal)} className="pt-0.5 text-xs font-semibold text-primary">+ Add to {meta.label.toLowerCase()}</button>
                </Card>
              );
            })}
          </Stagger>
        )}
      </section>

      {/* This week */}
      {week && (
        <section className="space-y-2">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">This week</h3>
          <Stagger><WeekStrip week={week} /></Stagger>
        </section>
      )}

      {logOpen && <FoodSearchSheet clientId={clientId} mealType={logMeal} autoCamera={logCamera} onClose={() => setLogOpen(false)} onLogged={() => void load()} />}
      {planOpen && <MealPlanDrawer clientId={clientId} onClose={() => setPlanOpen(false)} onLogged={() => void load()} />}
      {edit && <EditEntrySheet entry={edit} clientId={clientId} units={units} onClose={() => setEdit(null)} onSaved={() => void load()} />}
    </Page>
  );
}

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

/** Compact 7-day nutrition reflection: calorie-adherence bars + streak/on-target/protein. */
function WeekStrip({ week }: { week: Week }) {
  const days = week.days;
  if (!days.some((d) => d.logged)) return null;
  const ct = week.targets.calories;
  const pt = week.targets.proteinG;
  const logged = days.filter((d) => d.logged);
  const onTarget = ct ? days.filter((d) => d.logged && d.calories >= ct * 0.85 && d.calories <= ct * 1.15).length : logged.length;
  const avgProtein = logged.length ? Math.round(logged.reduce((n, d) => n + d.proteinG, 0) / logged.length) : 0;
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) { if (days[i]!.logged) streak++; else break; }
  const max = Math.max(ct ?? 0, ...days.map((d) => d.calories), 1);

  return (
    <Card className="space-y-3">
      {streak > 0 && <div className="flex justify-end"><MetricChip metric="streak" value={`${streak}d streak`} /></div>}
      <div>
        <div className="relative flex h-11 items-end gap-1.5">
          {ct ? <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-foreground/25" style={{ bottom: `${(ct / max) * 44}px` }} /> : null}
          {days.map((d, i) => {
            const over = ct ? d.calories > ct * 1.15 : false;
            const today = i === days.length - 1;
            const h = d.logged ? Math.max(4, (d.calories / max) * 44) : 4;
            return (
              <div key={d.date} className="flex flex-1 justify-center">
                <motion.div
                  initial={{ height: 4, opacity: 0 }}
                  animate={{ height: h, opacity: d.logged ? 1 : 0.6 }}
                  transition={{ delay: i * 0.04, type: "spring", stiffness: 300, damping: 26 }}
                  className={`w-full max-w-6 rounded-md ${!d.logged ? "bg-surface-2" : over ? "bg-danger" : "bg-calories"} ${today ? "ring-2 ring-calories/30" : ""}`}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex gap-1.5">
          {days.map((d, i) => (
            <span key={d.date} className={`flex-1 text-center text-[0.65rem] ${i === days.length - 1 ? "font-bold text-foreground" : "text-muted-foreground"}`}>{DOW[new Date(`${d.date}T00:00:00Z`).getUTCDay()]}</span>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-around border-t border-border/50 pt-3 text-center">
        <div>
          <div className="numeral text-lg font-bold leading-none">{onTarget}<span className="text-sm font-medium text-muted-foreground">/7</span></div>
          <div className="mt-1 text-[0.7rem] text-muted-foreground">{ct ? "on target" : "days logged"}</div>
        </div>
        <div className="h-8 w-px bg-border/50" />
        <div>
          <div className="numeral text-lg font-bold leading-none text-protein">{avgProtein}<span className="text-sm font-medium text-muted-foreground"> g</span></div>
          <div className="mt-1 text-[0.7rem] text-muted-foreground">avg protein{pt ? ` / ${pt}` : ""}</div>
        </div>
      </div>
    </Card>
  );
}

const EDIT_MEALS = ["breakfast", "lunch", "dinner", "snack", "pre_workout", "post_workout"];

function EditEntrySheet({ entry, clientId, units, onClose, onSaved }: { entry: Entry; clientId: string; units: UnitPrefs; onClose: () => void; onSaved: () => void }) {
  const [qty, setQty] = useState(entry.quantity != null ? String(entry.quantity) : "");
  const [meal, setMeal] = useState(entry.meal_type);
  const [busy, setBusy] = useState(false);
  const scalable = entry.quantity != null && entry.quantity > 0;
  const factor = scalable && qty ? Number(qty) / entry.quantity! : 1;
  const s = (v: number) => Math.round(v * factor);

  const save = async () => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { clientId, mealType: meal };
      if (scalable && qty) { body.quantity = Number(qty); body.calories = s(entry.calories); body.proteinG = s(entry.protein_g); body.carbsG = s(entry.carbs_g); body.fatG = s(entry.fat_g); }
      await api.patch(`/api/logs/food/${entry.id}`, body);
      onSaved(); onClose();
    } finally { setBusy(false); }
  };
  const remove = async () => { setBusy(true); try { await api.del(`/api/logs/food/${entry.id}?clientId=${clientId}`); onSaved(); onClose(); } finally { setBusy(false); } };

  return (
    <Sheet open onClose={onClose} title={entry.label ?? "Edit food"}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface-2">
            {entry.image_url ? <img src={entry.image_url} alt="" className="size-full object-cover" /> : <Utensils className="size-5 text-muted-foreground" />}
          </div>
          <div className="grid grid-cols-4 gap-2 flex-1">
            {([["calories", entry.calories], ["protein", entry.protein_g], ["carbs", entry.carbs_g], ["fat", entry.fat_g]] as const).map(([m, v]) => {
              const M = METRICS[m];
              return <div key={m} className={`flex flex-col items-center gap-0.5 rounded-lg py-1.5 ${toneSoft[M.tone]}`}><M.icon className="size-3.5" /><span className="numeral text-sm font-semibold leading-none">{m === "calories" ? kcalToDisplay(s(v), units).toLocaleString() : s(v)}</span></div>;
            })}
          </div>
        </div>

        {scalable && <Field label={`Quantity (${entry.unit ?? "g"})`} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ""))} />}

        <div>
          <div className="mb-1.5 text-sm text-muted-foreground">Meal</div>
          <div className="flex flex-wrap gap-2">{EDIT_MEALS.map((m) => <Chip key={m} selected={meal === m} onClick={() => setMeal(m)}>{metaFor(m).label}</Chip>)}</div>
        </div>

        <div className="flex gap-3">
          <Button variant="ghost" className="text-danger" disabled={busy} onClick={() => void remove()}><Trash2 /> Delete</Button>
          <Button size="lg" className="flex-1" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </Sheet>
  );
}
