/**
 * Meal plan — the client's full-screen plan experience. A published plan is a
 * BANK OF OPTIONS grouped by meal: for each meal you pick one option, see its
 * macros, get an AI recipe, and log it in a tap. A second tab turns the same
 * options into a day-weighted shopping list. Full-screen (not a cramped sheet)
 * with a hero, clear "pick one per meal" framing, and premium motion.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MealBody, MealOption } from "@mossa/protocol";
import { optionMacroTotals, type FoodLike } from "@mossa/protocol";
import { fmtEnergy, kcalToDisplay } from "@mossa/domain";
import { Button, Card, Badge, Sheet, Skeleton, EmptyState, SegmentedControl, MacroInline, METRICS, toneSoft, cn, motion, type LucideIcon, Utensils, ShoppingCart, Plus, Minus, ChevronDown, Sparkles, Check, ArrowLeft, Croissant, Soup, Apple, Dumbbell } from "@mossa/ui";
import { api, todayLocal } from "../../api.js";
import { useUnits } from "../../units.js";
import { useSession } from "../../session.js";
import { Markdown } from "../../Markdown.js";
import { AiAnalyzing } from "../../AiAnalyzing.js";
import { AiAvatar } from "../../AiAvatar.js";

interface Plan { id: string; name: string; status: string; body: MealBody }
interface FoodRow {
  id: string; name: string; serving_size: number; serving_unit: string; calories: number;
  protein_g: number; carbs_g: number; fat_g: number; fiber_g: number; sugar_g: number; sodium_mg: number;
  saturated_fat_g: number; cholesterol_mg: number; potassium_mg: number; calcium_mg: number; iron_mg: number;
  image_url: string | null;
}
interface Targets { targetCalories?: number; targetProteinG?: number }

const MEAL_META: Record<string, { label: string; icon: LucideIcon }> = {
  breakfast: { label: "Breakfast", icon: Croissant }, lunch: { label: "Lunch", icon: Soup }, dinner: { label: "Dinner", icon: Utensils },
  snack: { label: "Snack", icon: Apple }, pre_workout: { label: "Pre-workout", icon: Dumbbell }, post_workout: { label: "Post-workout", icon: Dumbbell }, free: { label: "Free meals", icon: Utensils },
};
const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack", "pre_workout", "post_workout", "free"];
const metaFor = (m: string) => MEAL_META[m] ?? { label: m.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()), icon: Utensils };
const MACRO_TILES = [["calories", "calories"], ["protein", "proteinG"], ["carbs", "carbsG"], ["fat", "fatG"]] as const;

function FoodThumb({ src, size = 38 }: { src?: string | null; size?: number }) {
  return (
    <div className="grid shrink-0 place-items-center overflow-hidden rounded-lg bg-nutrition-soft text-nutrition" style={{ width: size, height: size }}>
      {src ? <img src={src} alt="" className="size-full object-cover" /> : <Utensils className="size-1/2" />}
    </div>
  );
}

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
  const [targets, setTargets] = useState<Targets | null>(null);
  const [loggedIdx, setLoggedIdx] = useState<Set<number>>(new Set());
  const [logging, setLogging] = useState<number | null>(null);
  const [view, setView] = useState<"plan" | "shop">("plan");
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [recipe, setRecipe] = useState<{ title: string; text: string } | null>(null);
  const [recipeBusy, setRecipeBusy] = useState<number | null>(null);
  const units = useUnits();
  const { ctx } = useSession();
  const aiSuite = !!ctx?.entitlements?.features?.aiSuite;
  const date = todayLocal();

  const load = useCallback(async () => {
    const [pl, f, today, log] = await Promise.all([
      api.get<{ plans: Plan[] }>(`/api/meal-plans?clientId=${clientId}`),
      api.get<{ foods: FoodRow[] }>("/api/foods?scope=all"),
      api.get<{ goal: { targets: Targets | null } | null }>(`/api/today?clientId=${clientId}&date=${date}`).catch(() => ({ goal: null })),
      api.get<{ entries: { meal_plan_id?: string | null; meal_option_index?: number | null }[] }>(`/api/logs/food?clientId=${clientId}&date=${date}`).catch(() => ({ entries: [] })),
    ]);
    const published = pl.plans.find((p) => p.status === "published") ?? null;
    setPlan(published);
    setFoods(new Map(f.foods.map((x) => [x.id, x])));
    setTargets(today.goal?.targets ?? null);
    setLoggedIdx(new Set((log.entries ?? []).filter((e) => e.meal_plan_id === published?.id && e.meal_option_index != null).map((e) => e.meal_option_index as number)));
  }, [clientId, date]);
  useEffect(() => void load(), [load]);

  const foodMap = useMemo(() => new Map([...foods.entries()].map(([id, f]) => [id, { id: f.id, servingSize: f.serving_size, caloriesPerServing: f.calories, proteinG: f.protein_g, carbsG: f.carbs_g, fatG: f.fat_g } as FoodLike])), [foods]);

  const groups = useMemo(() => {
    const g = new Map<string, { opt: MealOption; index: number }[]>();
    (plan?.body.mealOptions ?? []).forEach((opt, index) => { const arr = g.get(opt.mealType) ?? []; arr.push({ opt, index }); g.set(opt.mealType, arr); });
    return [...g.entries()].sort((a, b) => (MEAL_ORDER.indexOf(a[0]) + 99 * (MEAL_ORDER.indexOf(a[0]) < 0 ? 1 : 0)) - (MEAL_ORDER.indexOf(b[0]) + 99 * (MEAL_ORDER.indexOf(b[0]) < 0 ? 1 : 0)));
  }, [plan]);

  const contrib = (mf: MealOption["foods"][number]) => {
    const f = foods.get(mf.foodId);
    const factor = f && f.serving_size > 0 ? mf.quantity / f.serving_size : 0;
    return { f, factor };
  };

  const recommendRecipe = async (opt: MealOption, index: number) => {
    setRecipeBusy(index);
    setRecipe({ title: opt.mealName || `Option ${index + 1}`, text: "" });
    try {
      const list = opt.foods.map((mf) => ({ name: foods.get(mf.foodId)?.name ?? "food", quantity: mf.quantity, unit: mf.unit })).filter((f) => f.name);
      const r = await api.post<{ recipe: string }>("/api/ai/recipe", { clientId, mealName: opt.mealName || "", foods: list });
      setRecipe({ title: opt.mealName || `Option ${index + 1}`, text: r.recipe });
    } catch {
      setRecipe({ title: opt.mealName || `Option ${index + 1}`, text: "Sorry — couldn't whip up a recipe just now. Try again." });
    } finally { setRecipeBusy(null); }
  };

  const logOption = async (opt: MealOption, index: number) => {
    if (!plan) return;
    setLogging(index);
    try {
      if (opt.isFree) {
        await api.post("/api/logs/food", { clientId, data: { date, mealType: opt.mealType, foodId: null, label: opt.mealName || "Free meal", quantity: 1, unit: "meal", calories: opt.freeMealMaxCalories ?? 0, proteinG: 0, carbsG: 0, fatG: 0, source: "free_meal", mealPlanId: plan.id, mealOptionIndex: index } });
      } else {
        for (const mf of opt.foods) {
          const { f, factor } = contrib(mf);
          if (!f) continue;
          await api.post("/api/logs/food", { clientId, data: { date, mealType: opt.mealType, foodId: mf.foodId, label: f.name, quantity: mf.quantity, unit: mf.unit, calories: Math.round(f.calories * factor), proteinG: Math.round(f.protein_g * factor), carbsG: Math.round(f.carbs_g * factor), fatG: Math.round(f.fat_g * factor), source: "prescribed", mealPlanId: plan.id, mealOptionIndex: index } });
        }
      }
      setLoggedIdx((s) => new Set(s).add(index));
      onLogged();
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
    return [...acc.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => a.name.localeCompare(b.name));
  }, [plan, counts, foods]);

  const weekTotals = useMemo(() => {
    let cal = 0, pro = 0, days = 0;
    (plan?.body.mealOptions ?? []).forEach((opt, index) => {
      const n = counts[index] ?? 0; days += n;
      if (opt.isFree) { cal += (opt.freeMealMaxCalories ?? 0) * n; return; }
      const t = optionMacroTotals(opt, foodMap); cal += t.calories * n; pro += t.proteinG * n;
    });
    return { cal, pro, days };
  }, [plan, counts, foodMap]);

  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-background">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/40 bg-background/85 px-4 py-3 backdrop-blur-xl">
        <button onClick={onClose} aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-foreground transition-colors hover:bg-surface-3 [&_svg]:size-[1.15rem]"><ArrowLeft /></button>
        <div className="min-w-0 flex-1"><div className="truncate text-base font-bold tracking-tight">Meal plan</div>{plan && <div className="truncate text-xs text-muted-foreground">{plan.name}</div>}</div>
      </div>

      <div className="mx-auto max-w-xl space-y-5 p-4 pb-28">
        {plan === undefined ? (
          <div className="space-y-3"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-40 rounded-2xl" /></div>
        ) : !plan ? (
          <EmptyState icon={Utensils} title="No meal plan yet" description="Your coach hasn't published a meal plan. You can still log food from the Eat tab." />
        ) : (
          <>
            {/* Hero — the plan at a glance + daily target context */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="relative overflow-hidden">
                <div className="pointer-events-none absolute -right-10 -top-10 size-36 rounded-full bg-nutrition/10 blur-2xl" />
                <div className="relative">
                  <div className="text-xs font-medium uppercase tracking-wide text-nutrition">Your plan</div>
                  <h2 className="mt-0.5 text-xl font-semibold tracking-tight">{plan.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{groups.length} meal{groups.length === 1 ? "" : "s"} · {plan.body.mealOptions?.length ?? 0} options to choose from</p>
                  {(targets?.targetCalories || targets?.targetProteinG) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {targets?.targetCalories ? <span className="rounded-full bg-calories-soft px-2.5 py-1 text-xs font-semibold text-calories">{fmtEnergy(targets.targetCalories, units)} / day</span> : null}
                      {targets?.targetProteinG ? <span className="rounded-full bg-protein-soft px-2.5 py-1 text-xs font-semibold text-protein">{targets.targetProteinG} g protein</span> : null}
                    </div>
                  )}
                </div>
              </Card>
            </motion.div>

            <SegmentedControl options={[{ value: "plan", label: "My meals" }, { value: "shop", label: "Shopping list" }]} value={view} onChange={setView} />

            {view === "plan" ? (
              groups.length === 0 ? <EmptyState icon={Utensils} title="No options yet" /> : (
                <div className="space-y-6">
                  <p className="-mt-1 px-1 text-sm text-muted-foreground">Pick one option per meal each day, then tap <span className="font-medium text-foreground">Log</span> when you eat it.</p>
                  {groups.map(([type, opts]) => {
                    const meta = metaFor(type);
                    return (
                      <section key={type} className="space-y-2.5">
                        <div className="flex items-center gap-2 px-1">
                          <span className="grid size-7 place-items-center rounded-xl bg-nutrition-soft text-nutrition [&_svg]:size-4"><meta.icon /></span>
                          <span className="font-semibold">{meta.label}</span>
                          <span className="text-xs text-muted-foreground">{opts.length} option{opts.length === 1 ? "" : "s"}</span>
                        </div>
                        <div className="space-y-2.5">
                          {opts.map(({ opt, index }) => (
                            <OptionCard
                              key={index} opt={opt} index={index} units={units} foods={foods} foodMap={foodMap}
                              expanded={openIdx === index} onToggle={() => setOpenIdx(openIdx === index ? null : index)}
                              logged={loggedIdx.has(index)} logging={logging === index} onLog={() => void logOption(opt, index)}
                              aiSuite={aiSuite} recipeBusy={recipeBusy === index} onRecipe={() => void recommendRecipe(opt, index)}
                            />
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )
            ) : (
              <div className="space-y-4">
                <p className="-mt-1 px-1 text-sm text-muted-foreground">How many days will you eat each option this week? We'll total up your shopping list.</p>
                {(plan.body.mealOptions ?? []).map((opt, index) => (
                  opt.isFree ? null : (
                    <div key={index} className="flex items-center gap-3 rounded-2xl bg-card px-3 py-2.5">
                      <FoodThumb src={opt.foods.map((mf) => foods.get(mf.foodId)?.image_url).find(Boolean)} size={38} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{opt.mealName || `Option ${index + 1}`}</div>
                        <div className="text-xs text-muted-foreground">{metaFor(opt.mealType).label}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="icon-sm" variant="secondary" disabled={(counts[index] ?? 0) === 0} onClick={() => bump(index, -1)} aria-label="Fewer days"><Minus /></Button>
                        <span className="numeral w-5 text-center font-semibold">{counts[index] ?? 0}</span>
                        <Button size="icon-sm" variant="secondary" onClick={() => bump(index, 1)} aria-label="More days"><Plus /></Button>
                      </div>
                    </div>
                  )
                ))}

                {weekTotals.days > 0 && (
                  <Card className="flex items-center justify-around py-3 text-center">
                    <div><div className="numeral text-lg font-bold leading-none">{weekTotals.days}</div><div className="mt-1 text-[0.7rem] text-muted-foreground">meals</div></div>
                    <div className="h-8 w-px bg-border/50" />
                    <div><div className="numeral text-lg font-bold leading-none text-calories">{fmtEnergy(Math.round(weekTotals.cal), units)}</div><div className="mt-1 text-[0.7rem] text-muted-foreground">total</div></div>
                    <div className="h-8 w-px bg-border/50" />
                    <div><div className="numeral text-lg font-bold leading-none text-protein">{Math.round(weekTotals.pro)} g</div><div className="mt-1 text-[0.7rem] text-muted-foreground">protein</div></div>
                  </Card>
                )}

                <div className="flex items-center justify-between px-1 pt-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shopping list</div>
                  {grocery.length > 0 && <Badge tone="nutrition">{grocery.filter((g) => !checked.has(g.id)).length} to buy</Badge>}
                </div>
                {grocery.length === 0 ? (
                  <EmptyState icon={ShoppingCart} title="Nothing yet" description="Add days to some options above." />
                ) : (
                  <Card className="space-y-0.5 p-2">
                    {grocery.map((g) => {
                      const done = checked.has(g.id);
                      return (
                        <button key={g.id} onClick={() => setChecked((s) => { const n = new Set(s); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n; })} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface-2">
                          <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border transition-colors [&_svg]:size-3", done ? "border-nutrition bg-nutrition text-white" : "border-border")}>{done && <Check strokeWidth={3} />}</span>
                          <FoodThumb src={g.img} size={32} />
                          <span className={cn("min-w-0 flex-1 truncate text-sm transition-colors", done && "text-muted-foreground line-through")}>{g.name}</span>
                          <Badge tone="neutral">{Math.round(g.qty)} {g.unit}</Badge>
                        </button>
                      );
                    })}
                  </Card>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {recipe && (
        <Sheet open onClose={() => setRecipe(null)} title="Recipe">
          {recipe.text === "" ? (
            <AiAnalyzing label="Cooking up a recipe" sub="Turning your foods into something tasty…" />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <AiAvatar className="size-9" />
                <div className="min-w-0">
                  <div className="text-[0.65rem] font-semibold uppercase tracking-wide text-primary">Chef's suggestion</div>
                  <div className="truncate text-base font-bold tracking-tight">{recipe.title}</div>
                </div>
              </div>
              <Markdown className="text-[0.95rem] text-foreground/90">{recipe.text}</Markdown>
            </div>
          )}
        </Sheet>
      )}
    </motion.div>
  );
}

/** A single meal option — thumbnail, macros, expandable foods + micros, recipe + log. */
function OptionCard({ opt, index, units, foods, foodMap, expanded, onToggle, logged, logging, onLog, aiSuite, recipeBusy, onRecipe }: {
  opt: MealOption; index: number; units: ReturnType<typeof useUnits>; foods: Map<string, FoodRow>; foodMap: Map<string, FoodLike>;
  expanded: boolean; onToggle: () => void; logged: boolean; logging: boolean; onLog: () => void; aiSuite: boolean; recipeBusy: boolean; onRecipe: () => void;
}) {
  const t = optionMacroTotals(opt, foodMap);
  const contrib = (mf: MealOption["foods"][number]) => { const f = foods.get(mf.foodId); return { f, factor: f && f.serving_size > 0 ? mf.quantity / f.serving_size : 0 }; };
  const micro = { fiberG: 0, sugarG: 0, saturatedFatG: 0, sodiumMg: 0, cholesterolMg: 0, potassiumMg: 0, calciumMg: 0, ironMg: 0 };
  for (const mf of opt.foods) { const { f, factor } = contrib(mf); if (!f) continue; micro.fiberG += (f.fiber_g ?? 0) * factor; micro.sugarG += (f.sugar_g ?? 0) * factor; micro.saturatedFatG += (f.saturated_fat_g ?? 0) * factor; micro.sodiumMg += (f.sodium_mg ?? 0) * factor; micro.cholesterolMg += (f.cholesterol_mg ?? 0) * factor; micro.potassiumMg += (f.potassium_mg ?? 0) * factor; micro.calciumMg += (f.calcium_mg ?? 0) * factor; micro.ironMg += (f.iron_mg ?? 0) * factor; }
  const microRows: [string, number, string][] = [["Fiber", micro.fiberG, "g"], ["Sugar", micro.sugarG, "g"], ["Sat. fat", micro.saturatedFatG, "g"], ["Sodium", micro.sodiumMg, "mg"], ["Cholesterol", micro.cholesterolMg, "mg"], ["Potassium", micro.potassiumMg, "mg"], ["Calcium", micro.calciumMg, "mg"], ["Iron", micro.ironMg, "mg"]];
  const hasMicros = microRows.some(([, v]) => v > 0);
  const thumb = opt.foods.map((mf) => foods.get(mf.foodId)?.image_url).find(Boolean);

  return (
    <Card className={cn("space-y-2.5 p-3 transition-shadow", logged && "ring-1 ring-nutrition/40")}>
      <div className="flex items-center gap-3">
        <button onClick={() => !opt.isFree && onToggle()} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <FoodThumb src={opt.isFree ? null : thumb} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold">{opt.mealName || (opt.isFree ? "Free meal" : `Option ${index + 1}`)}</span>
              {logged && <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-nutrition-soft px-1.5 py-0.5 text-[0.6rem] font-semibold text-nutrition [&_svg]:size-2.5"><Check strokeWidth={3} /> Logged</span>}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="numeral shrink-0 text-calories">{opt.isFree ? `≤ ${opt.freeMealMaxCalories != null ? fmtEnergy(opt.freeMealMaxCalories, units) : "—"}` : fmtEnergy(t.calories, units)}</span>
              {!opt.isFree && <MacroInline proteinG={t.proteinG} carbsG={t.carbsG} fatG={t.fatG} className="shrink-0 text-[0.7rem]" />}
            </div>
          </div>
          {!opt.isFree && <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />}
        </button>
        <Button size="sm" variant={logged ? "secondary" : opt.isFree ? "tonal" : "default"} disabled={logging} onClick={onLog}>{logging ? "…" : logged ? "Again" : "Log"}</Button>
      </div>

      {!opt.isFree && <MacroSplitBar p={t.proteinG} c={t.carbsG} f={t.fatG} />}

      {expanded && !opt.isFree && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-2.5 overflow-hidden pt-0.5">
          <div className="grid grid-cols-4 gap-2">
            {MACRO_TILES.map(([metric, key]) => {
              const M = METRICS[metric];
              return (
                <div key={metric} className={cn("flex flex-col items-center gap-1 rounded-xl p-2", toneSoft[M.tone])}>
                  <M.icon className="size-4" />
                  <div className="numeral text-base font-semibold leading-none">{metric === "calories" ? kcalToDisplay(t[key], units).toLocaleString() : Math.round(t[key])}</div>
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
                        <span className="numeral shrink-0 text-calories">{fmtEnergy((f?.calories ?? 0) * factor, units)}</span>
                      </div>
                    </div>
                    <MacroInline proteinG={Math.round((f?.protein_g ?? 0) * factor)} carbsG={Math.round((f?.carbs_g ?? 0) * factor)} fatG={Math.round((f?.fat_g ?? 0) * factor)} className="shrink-0 text-[0.7rem]" />
                  </div>
                );
              })}
            </div>
          )}
          {opt.notes && <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted-foreground">{opt.notes}</p>}
          {aiSuite && opt.foods.length > 0 && (
            <Button size="sm" variant="tonal" className="w-full" disabled={recipeBusy} onClick={onRecipe}>
              <Sparkles /> {recipeBusy ? "Cooking up a recipe…" : "Recommend a recipe"}
            </Button>
          )}
          {hasMicros && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl bg-surface-2 p-3 text-xs">
              {microRows.filter(([, v]) => v > 0).map(([l, v, u]) => (
                <div key={l} className="flex items-center justify-between"><span className="text-muted-foreground">{l}</span><span className="numeral">{Math.round(v * 10) / 10} {u}</span></div>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </Card>
  );
}
