/** Eat tab — the nutrition diary: intake vs target, meals, per-entry macros. */

import { useCallback, useEffect, useState } from "react";
import { fmtEnergy } from "@mossa/domain";
import {
  Button, Card, Skeleton, IconBadge, MacroBar, MacroInline, MetricChip, Page, Stagger, EmptyState,
  Plus, ClipboardList, Utensils, Croissant, Soup, Apple, Dumbbell, Trash2, type LucideIcon,
} from "@mossa/ui";
import { api, todayLocal } from "../../api.js";
import { useUnits } from "../../units.js";
import { FoodSearchSheet } from "./FoodSearchSheet.js";
import { MealPlanDrawer } from "./MealPlanDrawer.js";

interface Entry { id: string; meal_type: string; label: string | null; calories: number; protein_g: number; carbs_g: number; fat_g: number; quantity: number | null; unit: string | null }
interface Targets { targetCalories?: number; targetProteinG?: number; targetCarbsG?: number; targetFatG?: number }

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
  const [logMeal, setLogMeal] = useState<string | undefined>(undefined);
  const [logOpen, setLogOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const units = useUnits();
  const date = todayLocal();

  const load = useCallback(async () => {
    const [e, today] = await Promise.all([
      api.get<{ entries: Entry[] }>(`/api/logs/food?clientId=${clientId}&date=${date}`),
      api.get<{ goal: { targets: Targets | null } | null }>(`/api/today?clientId=${clientId}&date=${date}`),
    ]);
    setEntries(e.entries); setTargets(today.goal?.targets ?? null);
  }, [clientId, date]);
  useEffect(() => void load(), [load]);

  const del = async (id: string) => { await api.del(`/api/logs/food/${id}?clientId=${clientId}`); await load(); };
  const openLog = (meal?: string) => { setLogMeal(meal); setLogOpen(true); };

  if (!entries) return <Skeleton className="m-4 h-64" />;

  const byMeal = new Map<string, Entry[]>();
  for (const e of entries) byMeal.set(e.meal_type, [...(byMeal.get(e.meal_type) ?? []), e]);
  const meals = [...MEAL_ORDER.filter((m) => byMeal.has(m)), ...[...byMeal.keys()].filter((m) => !MEAL_ORDER.includes(m))];
  const sum = (f: (e: Entry) => number) => entries.reduce((n, e) => n + (f(e) || 0), 0);
  const total = sum((e) => e.calories);
  const calTarget = targets?.targetCalories ?? 0;
  const pct = calTarget > 0 ? total / calTarget : 0;
  const remaining = calTarget - total;

  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <h1 className="text-2xl font-bold tracking-tight">Eat</h1>

      {/* Intake vs target */}
      <Stagger>
        <Card className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-sm text-muted-foreground">Today's intake</div>
              <div className="numeral mt-0.5 text-3xl font-bold leading-none">
                {fmtEnergy(total, units)}
                {calTarget > 0 && <span className="ml-1.5 text-base font-medium text-muted-foreground">of {fmtEnergy(calTarget, units)}</span>}
              </div>
            </div>
            {calTarget > 0 && (
              <MetricChip metric="calories" value={remaining >= 0 ? `${fmtEnergy(remaining, units, false)} left` : `${fmtEnergy(-remaining, units, false)} over`} />
            )}
          </div>
          {calTarget > 0 && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
              <div className={`h-full rounded-full transition-all ${remaining < 0 ? "bg-danger" : "bg-calories"}`} style={{ width: `${Math.min(100, Math.max(2, pct * 100))}%` }} />
            </div>
          )}
          <MacroBar
            proteinG={sum((e) => e.protein_g)}
            carbsG={sum((e) => e.carbs_g)}
            fatG={sum((e) => e.fat_g)}
            targets={targets ? { proteinG: targets.targetProteinG, carbsG: targets.targetCarbsG, fatG: targets.targetFatG } : null}
          />
        </Card>
      </Stagger>

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
                    <div key={e.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{e.label ?? "Food"}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          {e.quantity ? <span className="numeral shrink-0">{Math.round(e.quantity)} {e.unit ?? "g"}</span> : null}
                          <MacroInline proteinG={e.protein_g} carbsG={e.carbs_g} fatG={e.fat_g} className="text-[0.7rem]" />
                        </div>
                      </div>
                      <span className="numeral shrink-0 text-sm">{fmtEnergy(e.calories, units)}</span>
                      <button onClick={() => void del(e.id)} className="shrink-0 text-muted-foreground/50 transition-colors hover:text-danger [&_svg]:size-4" aria-label="Delete"><Trash2 /></button>
                    </div>
                  ))}
                </div>
                <button onClick={() => openLog(meal)} className="pt-0.5 text-xs font-semibold text-primary">+ Add to {meta.label.toLowerCase()}</button>
              </Card>
            );
          })}
        </Stagger>
      )}

      <div className="flex gap-3">
        <Button size="lg" className="flex-1" onClick={() => openLog()}><Plus /> Log food</Button>
        <Button size="lg" variant="tonal" className="flex-1" onClick={() => setPlanOpen(true)}><ClipboardList /> My plan</Button>
      </div>

      {logOpen && <FoodSearchSheet clientId={clientId} mealType={logMeal} onClose={() => setLogOpen(false)} onLogged={() => void load()} />}
      {planOpen && <MealPlanDrawer clientId={clientId} onClose={() => setPlanOpen(false)} onLogged={() => void load()} />}
    </Page>
  );
}
