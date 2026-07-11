/**
 * Meal plan drawer — the bank of options, shown the way the Eat tab shows food:
 * metric-coded macro tiles, food thumbnails, micros, one-tap logging, and a
 * day-weighted grocery planner ("3× option 1, 2× option 2 …" → the list).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MealBody, MealOption } from "@mossa/protocol";
import { optionMacroTotals, type FoodLike } from "@mossa/protocol";
import { fmtEnergy } from "@mossa/domain";
import { Button, Card, Badge, Sheet, Skeleton, EmptyState, SegmentedControl, MacroInline, METRICS, toneSoft, cn, Utensils, ShoppingCart, Plus, Minus, ChevronDown } from "@mossa/ui";
import { api, todayLocal } from "../../api.js";
import { useUnits } from "../../units.js";

interface Plan { id: string; name: string; status: string; body: MealBody }
interface FoodRow {
  id: string; name: string; serving_size: number; serving_unit: string; calories: number;
  protein_g: number; carbs_g: number; fat_g: number; fiber_g: number; sugar_g: number; sodium_mg: number;
  saturated_fat_g: number; cholesterol_mg: number; potassium_mg: number; calcium_mg: number; iron_mg: number;
  image_url: string | null;
}

const mealLabel = (t: string) => t.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const MACRO_TILES = [["calories", "calories"], ["protein", "proteinG"], ["carbs", "carbsG"], ["fat", "fatG"]] as const;

/** Small food thumbnail — image when present, tinted utensils fallback. */
function FoodThumb({ src, size = 38 }: { src?: string | null; size?: number }) {
  return (
    <div className="grid shrink-0 place-items-center overflow-hidden rounded-lg bg-nutrition-soft text-nutrition" style={{ width: size, height: size }}>
      {src ? <img src={src} alt="" className="size-full object-cover" /> : <Utensils className="size-1/2" />}
    </div>
  );
}

/** Thin protein/carbs/fat proportion bar — premium macro glance, tiny footprint. */
function MacroSplitBar({ p, c, f }: { p: number; c: number; f: number }) {
  const total = p + c + f || 1;
  return (
    <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-3">
      <span className="bg-protein" style={{ width: `${(p / total) * 100}%` }} />
      <span className="bg-carbs" style={{ width: `${(c / total) * 100}%` }} />
      <span className="bg-fat" style={{ width: `${(f / total) * 100}%` }} />
    </div>
  );
}

export function MealPlanDrawer({ clientId, onClose, onLogged }: { clientId: string; onClose: () => void; onLogged: () => void }) {
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  const [foods, setFoods] = useState<Map<string, FoodRow>>(new Map());
  const [logging, setLogging] = useState<number | null>(null);
  const [view, setView] = useState<"options" | "grocery">("options");
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const units = useUnits();

  const load = useCallback(async () => {
    const [pl, f] = await Promise.all([api.get<{ plans: Plan[] }>(`/api/meal-plans?clientId=${clientId}`), api.get<{ foods: FoodRow[] }>("/api/foods")]);
    setPlan(pl.plans.find((p) => p.status === "published") ?? null);
    setFoods(new Map(f.foods.map((x) => [x.id, x])));
  }, [clientId]);
  useEffect(() => void load(), [load]);

  const foodMap = useMemo(() => new Map([...foods.entries()].map(([id, f]) => [id, { id: f.id, servingSize: f.serving_size, caloriesPerServing: f.calories, proteinG: f.protein_g, carbsG: f.carbs_g, fatG: f.fat_g } as FoodLike])), [foods]);

  const groups = useMemo(() => {
    const g = new Map<string, { opt: MealOption; index: number }[]>();
    (plan?.body.mealOptions ?? []).forEach((opt, index) => {
      const arr = g.get(opt.mealType) ?? [];
      arr.push({ opt, index });
      g.set(opt.mealType, arr);
    });
    return [...g.entries()];
  }, [plan]);

  /** Per-food contribution + per-option micro totals (metric units). */
  const contrib = (mf: MealOption["foods"][number]) => {
    const f = foods.get(mf.foodId);
    const factor = f && f.serving_size > 0 ? mf.quantity / f.serving_size : 0;
    return { f, factor };
  };
  const microTotals = (opt: MealOption) => {
    const m = { fiberG: 0, sugarG: 0, saturatedFatG: 0, sodiumMg: 0, cholesterolMg: 0, potassiumMg: 0, calciumMg: 0, ironMg: 0 };
    for (const mf of opt.foods) {
      const { f, factor } = contrib(mf);
      if (!f) continue;
      m.fiberG += (f.fiber_g ?? 0) * factor; m.sugarG += (f.sugar_g ?? 0) * factor; m.saturatedFatG += (f.saturated_fat_g ?? 0) * factor; m.sodiumMg += (f.sodium_mg ?? 0) * factor;
      m.cholesterolMg += (f.cholesterol_mg ?? 0) * factor; m.potassiumMg += (f.potassium_mg ?? 0) * factor; m.calciumMg += (f.calcium_mg ?? 0) * factor; m.ironMg += (f.iron_mg ?? 0) * factor;
    }
    return m;
  };

  const logOption = async (opt: MealOption, index: number) => {
    if (!plan) return;
    setLogging(index);
    try {
      if (opt.isFree) {
        const cap = opt.freeMealMaxCalories ?? 0;
        await api.post("/api/logs/food", { clientId, data: { date: todayLocal(), mealType: opt.mealType, foodId: null, label: opt.mealName || "Free meal", quantity: 1, unit: "meal", calories: cap, proteinG: 0, carbsG: 0, fatG: 0, source: "free_meal", mealPlanId: plan.id, mealOptionIndex: index } });
      } else {
        for (const mf of opt.foods) {
          const { f, factor } = contrib(mf);
          if (!f) continue;
          await api.post("/api/logs/food", { clientId, data: { date: todayLocal(), mealType: opt.mealType, foodId: mf.foodId, label: f.name, quantity: mf.quantity, unit: mf.unit, calories: Math.round(f.calories * factor), proteinG: Math.round(f.protein_g * factor), carbsG: Math.round(f.carbs_g * factor), fatG: Math.round(f.fat_g * factor), source: "prescribed", mealPlanId: plan.id, mealOptionIndex: index } });
        }
      }
      onLogged(); onClose();
    } finally { setLogging(null); }
  };

  const bump = (index: number, delta: number) => setCounts((c) => ({ ...c, [index]: Math.max(0, (c[index] ?? 0) + delta) }));

  const grocery = useMemo(() => {
    const acc = new Map<string, { name: string; qty: number; unit: string; img: string | null }>();
    (plan?.body.mealOptions ?? []).forEach((opt, index) => {
      const days = counts[index] ?? 0;
      if (days <= 0 || opt.isFree) return;
      for (const mf of opt.foods) {
        const f = foods.get(mf.foodId);
        const prev = acc.get(mf.foodId);
        acc.set(mf.foodId, { name: f?.name ?? "Item", qty: (prev?.qty ?? 0) + mf.quantity * days, unit: mf.unit, img: f?.image_url ?? null });
      }
    });
    return [...acc.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [plan, counts, foods]);
  const totalDays = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <Sheet open onClose={onClose} title="Your meal plan">
      {plan === undefined ? <Skeleton className="h-40" /> : !plan ? <EmptyState icon={Utensils} title="No meal plan yet" /> : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-sm text-muted-foreground">{plan.name}</div>
            <SegmentedControl options={[{ value: "options", label: "Options" }, { value: "grocery", label: "Grocery" }]} value={view} onChange={setView} />
          </div>

          {view === "options" ? (
            groups.length === 0 ? <EmptyState icon={Utensils} title="No options yet" /> : groups.map(([type, opts]) => (
              <div key={type} className="space-y-1.5">
                <div className="flex items-center gap-2 px-1">
                  <span className="grid size-6 place-items-center rounded-lg bg-nutrition-soft text-nutrition [&_svg]:size-3.5"><Utensils /></span>
                  <span className="text-sm font-semibold">{mealLabel(type)}</span>
                  <span className="text-xs text-muted-foreground">{opts.length} option{opts.length === 1 ? "" : "s"}</span>
                </div>
                {opts.map(({ opt, index }) => {
                  const t = optionMacroTotals(opt, foodMap);
                  const mi = microTotals(opt);
                  const microRows: [string, number, string][] = [
                    ["Fiber", mi.fiberG, "g"], ["Sugar", mi.sugarG, "g"], ["Sat. fat", mi.saturatedFatG, "g"], ["Sodium", mi.sodiumMg, "mg"],
                    ["Cholesterol", mi.cholesterolMg, "mg"], ["Potassium", mi.potassiumMg, "mg"], ["Calcium", mi.calciumMg, "mg"], ["Iron", mi.ironMg, "mg"],
                  ];
                  const hasMicros = microRows.some(([, v]) => v > 0);
                  const expanded = openIdx === index;
                  const thumbs = opt.foods.map((mf) => foods.get(mf.foodId)?.image_url).filter(Boolean).slice(0, 1);
                  return (
                    <Card key={index} className="space-y-2.5 p-3">
                      {/* Compact header — tap to expand; Log is its own target. */}
                      <div className="flex items-center gap-3">
                        <button onClick={() => !opt.isFree && setOpenIdx(expanded ? null : index)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                          <FoodThumb src={opt.isFree ? null : thumbs[0]} size={40} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold">{opt.mealName || (opt.isFree ? "Free meal" : `Option ${index + 1}`)}</div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="numeral shrink-0 text-calories">{opt.isFree ? `≤ ${opt.freeMealMaxCalories != null ? fmtEnergy(opt.freeMealMaxCalories, units) : "—"}` : fmtEnergy(t.calories, units)}</span>
                              {!opt.isFree && <MacroInline proteinG={t.proteinG} carbsG={t.carbsG} fatG={t.fatG} className="shrink-0 text-[0.7rem]" />}
                            </div>
                          </div>
                          {!opt.isFree && <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />}
                        </button>
                        <Button size="sm" variant={opt.isFree ? "tonal" : "default"} disabled={logging === index} onClick={() => void logOption(opt, index)}>{logging === index ? "…" : "Log"}</Button>
                      </div>

                      {!opt.isFree && <MacroSplitBar p={t.proteinG} c={t.carbsG} f={t.fatG} />}

                      {expanded && !opt.isFree && (
                        <div className="space-y-2.5 pt-0.5">
                          <div className="grid grid-cols-4 gap-2">
                            {MACRO_TILES.map(([metric, key]) => {
                              const M = METRICS[metric];
                              return (
                                <div key={metric} className={cn("flex flex-col items-center gap-1 rounded-xl p-2", toneSoft[M.tone])}>
                                  <M.icon className="size-4" />
                                  <div className="numeral text-base font-semibold leading-none">{Math.round(t[key])}</div>
                                </div>
                              );
                            })}
                          </div>
                          {opt.foods.length > 0 && (
                            <div className="space-y-1">
                              {opt.foods.map((mf, k) => {
                                const { f, factor } = contrib(mf);
                                return (
                                  <div key={k} className="flex items-center gap-3 rounded-xl bg-surface-2 px-2 py-1.5">
                                    <FoodThumb src={f?.image_url} size={34} />
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate text-sm">{f?.name ?? "Food"}</div>
                                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <span className="numeral shrink-0">{Math.round(mf.quantity)} {mf.unit}</span>
                                        <span className="numeral shrink-0 text-calories">{Math.round((f?.calories ?? 0) * factor)} kcal</span>
                                      </div>
                                    </div>
                                    <MacroInline proteinG={Math.round((f?.protein_g ?? 0) * factor)} carbsG={Math.round((f?.carbs_g ?? 0) * factor)} fatG={Math.round((f?.fat_g ?? 0) * factor)} className="shrink-0 text-[0.7rem]" />
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {opt.notes && <p className="text-xs text-muted-foreground">{opt.notes}</p>}
                          {hasMicros && (
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl bg-surface-2 p-3 text-xs">
                              {microRows.filter(([, v]) => v > 0).map(([l, v, u]) => (
                                <div key={l} className="flex items-center justify-between"><span className="text-muted-foreground">{l}</span><span className="numeral">{Math.round(v * 10) / 10} {u}</span></div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
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
                <Card className="space-y-1 p-2">
                  {grocery.map((g, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
                      <FoodThumb src={g.img} size={34} />
                      <span className="min-w-0 flex-1 truncate text-sm">{g.name}</span>
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
