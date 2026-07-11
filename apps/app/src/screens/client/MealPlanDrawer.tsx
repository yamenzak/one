/** Meal plan drawer — bank of options; one-tap logs a whole option's foods. */

import { useCallback, useEffect, useState } from "react";
import type { MealBody, MealOption } from "@mossa/protocol";
import { optionMacroTotals, type FoodLike } from "@mossa/protocol";
import { Button, Card, Badge, Sheet, Skeleton, EmptyState, SegmentedControl, MacroInline, Utensils, ShoppingCart } from "@mossa/ui";
import { api, todayLocal } from "../../api.js";

interface Plan { id: string; name: string; status: string; body: MealBody }
interface FoodRow { id: string; name: string; serving_size: number; serving_unit: string; calories: number; protein_g: number; carbs_g: number; fat_g: number }

export function MealPlanDrawer({ clientId, onClose, onLogged }: { clientId: string; onClose: () => void; onLogged: () => void }) {
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  const [foods, setFoods] = useState<Map<string, FoodRow>>(new Map());
  const [logging, setLogging] = useState<number | null>(null);
  const [view, setView] = useState<"options" | "grocery">("options");

  const load = useCallback(async () => {
    const [pl, f] = await Promise.all([api.get<{ plans: Plan[] }>(`/api/meal-plans?clientId=${clientId}`), api.get<{ foods: FoodRow[] }>("/api/foods")]);
    setPlan(pl.plans.find((p) => p.status === "published") ?? null);
    setFoods(new Map(f.foods.map((x) => [x.id, x])));
  }, [clientId]);
  useEffect(() => void load(), [load]);

  const foodMap = new Map([...foods.entries()].map(([id, f]) => [id, { id: f.id, servingSize: f.serving_size, caloriesPerServing: f.calories, proteinG: f.protein_g, carbsG: f.carbs_g, fatG: f.fat_g } as FoodLike]));

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

  // Aggregate every prescribed food across all options → a shopping list.
  const grocery = (() => {
    const acc = new Map<string, { name: string; qty: number; unit: string }>();
    for (const opt of plan?.body.mealOptions ?? []) {
      if (opt.isFree) continue;
      for (const mf of opt.foods) {
        const f = foods.get(mf.foodId);
        const key = mf.foodId;
        const prev = acc.get(key);
        acc.set(key, { name: f?.name ?? "Item", qty: (prev?.qty ?? 0) + mf.quantity, unit: mf.unit });
      }
    }
    return [...acc.values()].sort((a, b) => a.name.localeCompare(b.name));
  })();

  return (
    <Sheet open onClose={onClose} title="Your meal plan">
      {plan === undefined ? <Skeleton className="h-40" /> : !plan ? <EmptyState icon={Utensils} title="No meal plan yet" /> : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-sm text-muted-foreground">{plan.name}</div>
            <SegmentedControl options={[{ value: "options", label: "Options" }, { value: "grocery", label: "Grocery" }]} value={view} onChange={setView} />
          </div>
          {view === "options" ? plan.body.mealOptions.map((opt, i) => {
            const t = optionMacroTotals(opt, foodMap);
            return (
              <Card key={i} className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-xs uppercase text-muted-foreground">{opt.mealType.replace("_", " ")}</div>
                  <div className="truncate font-medium">{opt.mealName || (opt.isFree ? "Free meal" : "Meal")}</div>
                  <div className="numeral text-xs text-muted-foreground">{opt.isFree ? `≤${opt.freeMealMaxCalories ?? "—"} kcal` : <><span className="text-calories">{t.calories} kcal</span> · <MacroInline proteinG={t.proteinG} carbsG={t.carbsG} fatG={t.fatG} /></>}</div>
                </div>
                <Button size="sm" variant={opt.isFree ? "tonal" : "default"} disabled={logging === i} onClick={() => void logOption(opt, i)}>{logging === i ? "…" : "Log"}</Button>
              </Card>
            );
          }) : grocery.length === 0 ? <EmptyState icon={ShoppingCart} title="No items" description="This plan only has free meals." /> : (
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
    </Sheet>
  );
}
