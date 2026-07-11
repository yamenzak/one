/** Meal plan drawer — bank of options; one-tap logs a whole option's foods. */

import { useCallback, useEffect, useState } from "react";
import type { MealBody, MealOption } from "@mossa/protocol";
import { optionMacroTotals, type FoodLike } from "@mossa/protocol";
import { Button, Card, Badge, Sheet, Skeleton, EmptyState, Utensils } from "@mossa/ui";
import { api, todayLocal } from "../../api.js";

interface Plan { id: string; name: string; status: string; body: MealBody }
interface FoodRow { id: string; name: string; serving_size: number; serving_unit: string; calories: number; protein_g: number; carbs_g: number; fat_g: number }

export function MealPlanDrawer({ clientId, onClose, onLogged }: { clientId: string; onClose: () => void; onLogged: () => void }) {
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  const [foods, setFoods] = useState<Map<string, FoodRow>>(new Map());
  const [logging, setLogging] = useState<number | null>(null);

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
      for (const mf of opt.foods) {
        const f = foods.get(mf.foodId);
        if (!f || f.serving_size <= 0) continue;
        const factor = mf.quantity / f.serving_size;
        await api.post("/api/logs/food", { clientId, data: { date: todayLocal(), mealType: opt.mealType, foodId: mf.foodId, label: f.name, quantity: mf.quantity, unit: mf.unit, calories: Math.round(f.calories * factor), proteinG: Math.round(f.protein_g * factor), carbsG: Math.round(f.carbs_g * factor), fatG: Math.round(f.fat_g * factor), source: "prescribed", mealPlanId: plan.id, mealOptionIndex: index } });
      }
      onLogged(); onClose();
    } finally { setLogging(null); }
  };

  return (
    <Sheet open onClose={onClose} title="Your meal plan">
      {plan === undefined ? <Skeleton className="h-40" /> : !plan ? <EmptyState icon={Utensils} title="No meal plan yet" /> : (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">{plan.name}</div>
          {plan.body.mealOptions.map((opt, i) => {
            const t = optionMacroTotals(opt, foodMap);
            return (
              <Card key={i} className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-xs uppercase text-muted-foreground">{opt.mealType.replace("_", " ")}</div>
                  <div className="truncate font-medium">{opt.mealName || (opt.isFree ? "Free meal" : "Meal")}</div>
                  <div className="numeral text-xs text-muted-foreground">{t.calories} kcal · P{t.proteinG}</div>
                </div>
                {opt.isFree ? <Badge tone="nutrition">≤{opt.freeMealMaxCalories ?? "—"} kcal</Badge> : <Button size="sm" disabled={logging === i} onClick={() => void logOption(opt, i)}>{logging === i ? "…" : "Log"}</Button>}
              </Card>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
