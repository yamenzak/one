/**
 * Meal plan drawer — the bank of options, shown in full: each meal's options
 * with exactly what's inside, one-tap logging, and a day-weighted grocery
 * planner ("3× option 1, 2× option 2 …" → the shopping list it adds up to).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MealBody, MealOption } from "@mossa/protocol";
import { optionMacroTotals, type FoodLike } from "@mossa/protocol";
import { fmtEnergy } from "@mossa/domain";
import { Button, Card, Badge, Sheet, Skeleton, EmptyState, SegmentedControl, MacroInline, Utensils, ShoppingCart, Plus, Minus } from "@mossa/ui";
import { api, todayLocal } from "../../api.js";
import { useUnits } from "../../units.js";

interface Plan { id: string; name: string; status: string; body: MealBody }
interface FoodRow { id: string; name: string; serving_size: number; serving_unit: string; calories: number; protein_g: number; carbs_g: number; fat_g: number }

const mealLabel = (t: string) => t.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function MealPlanDrawer({ clientId, onClose, onLogged }: { clientId: string; onClose: () => void; onLogged: () => void }) {
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  const [foods, setFoods] = useState<Map<string, FoodRow>>(new Map());
  const [logging, setLogging] = useState<number | null>(null);
  const [view, setView] = useState<"options" | "grocery">("options");
  const [counts, setCounts] = useState<Record<number, number>>({});
  const units = useUnits();

  const load = useCallback(async () => {
    const [pl, f] = await Promise.all([api.get<{ plans: Plan[] }>(`/api/meal-plans?clientId=${clientId}`), api.get<{ foods: FoodRow[] }>("/api/foods")]);
    setPlan(pl.plans.find((p) => p.status === "published") ?? null);
    setFoods(new Map(f.foods.map((x) => [x.id, x])));
  }, [clientId]);
  useEffect(() => void load(), [load]);

  const foodMap = useMemo(() => new Map([...foods.entries()].map(([id, f]) => [id, { id: f.id, servingSize: f.serving_size, caloriesPerServing: f.calories, proteinG: f.protein_g, carbsG: f.carbs_g, fatG: f.fat_g } as FoodLike])), [foods]);

  // Options grouped by meal slot, keeping each option's real index.
  const groups = useMemo(() => {
    const g = new Map<string, { opt: MealOption; index: number }[]>();
    (plan?.body.mealOptions ?? []).forEach((opt, index) => {
      const arr = g.get(opt.mealType) ?? [];
      arr.push({ opt, index });
      g.set(opt.mealType, arr);
    });
    return [...g.entries()];
  }, [plan]);

  const logOption = async (opt: MealOption, index: number) => {
    if (!plan) return;
    setLogging(index);
    try {
      if (opt.isFree) {
        const cap = opt.freeMealMaxCalories ?? 0;
        await api.post("/api/logs/food", { clientId, data: { date: todayLocal(), mealType: opt.mealType, foodId: null, label: opt.mealName || "Free meal", quantity: 1, unit: "meal", calories: cap, proteinG: 0, carbsG: 0, fatG: 0, source: "free_meal", mealPlanId: plan.id, mealOptionIndex: index } });
      } else {
        for (const mf of opt.foods) {
          const f = foods.get(mf.foodId);
          if (!f || f.serving_size <= 0) continue;
          const factor = mf.quantity / f.serving_size;
          await api.post("/api/logs/food", { clientId, data: { date: todayLocal(), mealType: opt.mealType, foodId: mf.foodId, label: f.name, quantity: mf.quantity, unit: mf.unit, calories: Math.round(f.calories * factor), proteinG: Math.round(f.protein_g * factor), carbsG: Math.round(f.carbs_g * factor), fatG: Math.round(f.fat_g * factor), source: "prescribed", mealPlanId: plan.id, mealOptionIndex: index } });
        }
      }
      onLogged(); onClose();
    } finally { setLogging(null); }
  };

  const bump = (index: number, delta: number) => setCounts((c) => ({ ...c, [index]: Math.max(0, (c[index] ?? 0) + delta) }));

  // Shopping list = every food × (its qty) × (days chosen for its option).
  const grocery = useMemo(() => {
    const acc = new Map<string, { name: string; qty: number; unit: string }>();
    (plan?.body.mealOptions ?? []).forEach((opt, index) => {
      const days = counts[index] ?? 0;
      if (days <= 0 || opt.isFree) return;
      for (const mf of opt.foods) {
        const f = foods.get(mf.foodId);
        const prev = acc.get(mf.foodId);
        acc.set(mf.foodId, { name: f?.name ?? "Item", qty: (prev?.qty ?? 0) + mf.quantity * days, unit: mf.unit });
      }
    });
    return [...acc.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [plan, counts, foods]);
  const totalDays = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <Sheet open onClose={onClose} title="Your meal plan">
      {plan === undefined ? <Skeleton className="h-40" /> : !plan ? <EmptyState icon={Utensils} title="No meal plan yet" /> : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-sm text-muted-foreground">{plan.name}</div>
            <SegmentedControl options={[{ value: "options", label: "Options" }, { value: "grocery", label: "Grocery" }]} value={view} onChange={setView} />
          </div>

          {view === "options" ? (
            groups.length === 0 ? <EmptyState icon={Utensils} title="No options yet" /> : groups.map(([type, opts]) => (
              <div key={type} className="space-y-2">
                <div className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{mealLabel(type)}</div>
                {opts.map(({ opt, index }) => {
                  const t = optionMacroTotals(opt, foodMap);
                  return (
                    <Card key={index} className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{opt.mealName || (opt.isFree ? "Free meal" : `Option ${index + 1}`)}</div>
                          <div className="numeral text-xs text-muted-foreground">{opt.isFree ? `≤ ${opt.freeMealMaxCalories != null ? fmtEnergy(opt.freeMealMaxCalories, units) : "—"}` : <><span className="text-calories">{fmtEnergy(t.calories, units)}</span> · <MacroInline proteinG={t.proteinG} carbsG={t.carbsG} fatG={t.fatG} /></>}</div>
                        </div>
                        <Button size="sm" variant={opt.isFree ? "tonal" : "default"} disabled={logging === index} onClick={() => void logOption(opt, index)}>{logging === index ? "…" : "Log"}</Button>
                      </div>
                      {opt.isFree ? (
                        <p className="text-xs text-muted-foreground">{opt.notes || "Anything you like, up to the cap."}</p>
                      ) : opt.foods.length > 0 ? (
                        <div className="space-y-1 rounded-xl bg-surface-2 p-2.5">
                          {opt.foods.map((mf, k) => (
                            <div key={k} className="flex items-center justify-between gap-2 text-sm">
                              <span className="min-w-0 truncate">{foods.get(mf.foodId)?.name ?? "Food"}</span>
                              <span className="numeral shrink-0 text-muted-foreground">{Math.round(mf.quantity)} {mf.unit}</span>
                            </div>
                          ))}
                          {opt.notes && <p className="pt-1 text-xs text-muted-foreground">{opt.notes}</p>}
                        </div>
                      ) : null}
                    </Card>
                  );
                })}
              </div>
            ))
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Set how many days you'll eat each option — the list below adds up what to buy.</p>
              {(plan.body.mealOptions ?? []).map((opt, index) => (
                opt.isFree ? null : (
                  <div key={index} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{opt.mealName || `Option ${index + 1}`}</div>
                      <div className="text-xs text-muted-foreground">{mealLabel(opt.mealType)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="icon-sm" variant="secondary" disabled={(counts[index] ?? 0) === 0} onClick={() => bump(index, -1)} aria-label="Fewer days"><Minus /></Button>
                      <span className="numeral w-5 text-center font-semibold">{counts[index] ?? 0}</span>
                      <Button size="icon-sm" variant="secondary" onClick={() => bump(index, 1)} aria-label="More days"><Plus /></Button>
                    </div>
                  </div>
                )
              ))}

              <div className="flex items-center justify-between px-1 pt-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shopping list</div>
                {totalDays > 0 && <Badge tone="nutrition">{totalDays} {totalDays === 1 ? "day" : "days"}</Badge>}
              </div>
              {grocery.length === 0 ? (
                <EmptyState icon={ShoppingCart} title="Nothing yet" description="Add days to some options above." />
              ) : (
                <Card className="divide-y divide-border p-0">
                  {grocery.map((g, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5">
                      <span className="truncate text-sm">{g.name}</span>
                      <Badge tone="neutral">{Math.round(g.qty)} {g.unit}</Badge>
                    </div>
                  ))}
                </Card>
              )}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
