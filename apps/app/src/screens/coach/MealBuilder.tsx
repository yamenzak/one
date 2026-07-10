/**
 * Meal plan builder (SPEC §8.4) — the bank-of-options model. Options grouped
 * by meal type, each with foods (live macro totals) or a free-meal calorie
 * cap. Draft/publish lifecycle + AI Meal Draft.
 */

import { useCallback, useEffect, useState } from "react";
import type { MealBody, MealOption } from "@mossa/protocol";
import { optionMacroTotals, type FoodLike } from "@mossa/protocol";
import { Button, Card, Chip, Field, Sheet, Skeleton, SubCard } from "@mossa/ui";
import { api } from "../../api.js";

interface Plan {
  id: string;
  clientId: string;
  name: string;
  status: string;
  body: MealBody;
}
interface FoodRow {
  id: string;
  name: string;
  serving_size: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "pre_workout", "post_workout"];

export function MealBuilder({ planId, onBack }: { planId: string; onBack: () => void }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [options, setOptions] = useState<MealOption[]>([]);
  const [foods, setFoods] = useState<Map<string, FoodLike>>(new Map());
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [foodPicker, setFoodPicker] = useState<{ optIdx: number } | null>(null);

  const load = useCallback(async () => {
    const [p, f] = await Promise.all([
      api.get<{ plan: Plan }>(`/api/meal-plans/${planId}`),
      api.get<{ foods: FoodRow[] }>("/api/foods"),
    ]);
    setPlan(p.plan);
    setOptions(p.plan.body.mealOptions ?? []);
    setFoods(new Map(f.foods.map((x) => [x.id, { id: x.id, servingSize: x.serving_size, caloriesPerServing: x.calories, proteinG: x.protein_g, carbsG: x.carbs_g, fatG: x.fat_g }])));
    setNames(new Map(f.foods.map((x) => [x.id, x.name])));
  }, [planId]);

  const nameOf = useCallback((id: string) => names.get(id) ?? "Food", [names]);

  useEffect(() => {
    void load();
  }, [load]);

  const mutate = (fn: (draft: MealOption[]) => void) => {
    const next = structuredClone(options);
    fn(next);
    setOptions(next);
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/api/meal-plans/${planId}`, { body: { customMealTypes: [], mealOptions: options } });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };
  const publish = async () => {
    await save();
    await api.post(`/api/meal-plans/${planId}/publish`);
    await load();
  };

  if (!plan) return <Skeleton className="m-4 h-96" />;

  const byType = new Map<string, { opt: MealOption; idx: number }[]>();
  options.forEach((opt, idx) => {
    const list = byType.get(opt.mealType) ?? [];
    list.push({ opt, idx });
    byType.set(opt.mealType, list);
  });

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 pb-32">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="grid size-10 place-items-center rounded-full bg-surface-2">←</button>
        <h1 className="flex-1 text-xl font-bold">{plan.name}</h1>
        <Chip tone={plan.status === "published" ? "good" : "neutral"}>{plan.status}</Chip>
      </div>

      {MEAL_TYPES.map((type) => {
        const opts = byType.get(type) ?? [];
        return (
          <Card key={type} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold capitalize">{type.replace("_", " ")}</h2>
              <button
                onClick={() => mutate((d) => d.push({ mealType: type, mealName: "", isFree: false, foods: [] }))}
                className="text-sm text-primary"
              >
                ＋ Option
              </button>
            </div>
            {opts.length === 0 && <p className="text-sm text-fg-muted">No options yet.</p>}
            {opts.map(({ opt, idx }) => {
              const totals = optionMacroTotals(opt, foods);
              return (
                <SubCard key={idx} className="space-y-2 bg-surface-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={opt.mealName}
                      placeholder="Option name"
                      onChange={(e) => mutate((d) => (d[idx]!.mealName = e.target.value))}
                      className="flex-1 rounded-lg bg-surface-3 px-3 py-2 text-sm"
                    />
                    <button onClick={() => mutate((d) => d.splice(idx, 1))} className="text-xs text-bad">✕</button>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      onClick={() => mutate((d) => ((d[idx]!.isFree = !d[idx]!.isFree), d[idx]!.isFree && (d[idx]!.foods = [])))}
                      className={`rounded-full px-3 py-1 ${opt.isFree ? "bg-nutrition-container text-nutrition" : "bg-surface-3 text-fg-muted"}`}
                    >
                      Free meal
                    </button>
                    <span className="numeral ml-auto text-fg-muted">{totals.calories} kcal · P{totals.proteinG} C{totals.carbsG} F{totals.fatG}</span>
                  </div>
                  {opt.isFree ? (
                    <input
                      type="number"
                      placeholder="Max calories"
                      value={opt.freeMealMaxCalories ?? ""}
                      onChange={(e) => mutate((d) => (d[idx]!.freeMealMaxCalories = e.target.value ? Number(e.target.value) : null))}
                      className="w-full rounded-lg bg-surface-3 px-3 py-2 text-sm"
                    />
                  ) : (
                    <>
                      {opt.foods.map((mf, fi) => (
                        <div key={fi} className="flex items-center gap-2 text-sm">
                          <span className="flex-1 truncate">{nameOf(mf.foodId)}</span>
                          <input
                            type="number"
                            value={mf.quantity}
                            onChange={(e) => mutate((d) => (d[idx]!.foods[fi]!.quantity = Number(e.target.value)))}
                            className="w-16 rounded-lg bg-surface-3 px-2 py-1"
                          />
                          <span className="text-xs text-fg-muted">{mf.unit}</span>
                          <button onClick={() => mutate((d) => d[idx]!.foods.splice(fi, 1))} className="text-xs text-bad">✕</button>
                        </div>
                      ))}
                      <button onClick={() => setFoodPicker({ optIdx: idx })} className="text-xs text-primary">＋ Food</button>
                    </>
                  )}
                </SubCard>
              );
            })}
          </Card>
        );
      })}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-surface-2 bg-bg/95 p-3 backdrop-blur md:pl-20">
        <div className="mx-auto flex max-w-xl gap-3">
          <Button variant="outline" className="flex-1" disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? "Saving…" : dirty ? "Save draft" : "Saved"}
          </Button>
          <Button className="flex-1" onClick={() => void publish()}>{plan.status === "published" ? "Re-publish" : "Publish"}</Button>
        </div>
      </div>

      {foodPicker && (
        <FoodPicker
          onClose={() => setFoodPicker(null)}
          onPick={(id, name) => {
            mutate((d) => d[foodPicker.optIdx]!.foods.push({ foodId: id, quantity: 100, unit: "g" }));
            setNames((prev) => new Map(prev).set(id, name));
            setFoodPicker(null);
          }}
        />
      )}
    </div>
  );
}

function FoodPicker({ onClose, onPick }: { onClose: () => void; onPick: (id: string, name: string) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    const t = setTimeout(() => {
      void api.get<{ foods: { id: string; name: string }[] }>(`/api/foods?q=${encodeURIComponent(q)}`).then((r) => setResults(r.foods));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <Sheet open onClose={onClose} title="Add food">
      <Field label="Search" icon="🔍" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3" />
      <div className="max-h-80 space-y-1 overflow-y-auto">
        {results.map((f) => (
          <button key={f.id} onClick={() => onPick(f.id, f.name)} className="w-full rounded-2xl px-3 py-3 text-left hover:bg-surface-2">
            {f.name}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
