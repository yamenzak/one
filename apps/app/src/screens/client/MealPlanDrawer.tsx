/**
 * Meal plan — the client's full-screen plan experience. A published plan is a
 * BANK OF OPTIONS grouped by meal: for each meal you pick one option, see its
 * macros, get an AI recipe, and log it in a tap. A second tab turns the same
 * options into a day-weighted shopping list. Full-screen (not a cramped sheet)
 * with a hero, clear "pick one per meal" framing, and premium motion.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MealBody, MealOption } from "@mossa/protocol";
import { optionMacroTotals, type FoodLike } from "@mossa/protocol";
import { fmtEnergy, kcalToDisplay } from "@mossa/domain";
import { Button, Card, Badge, Sheet, Skeleton, EmptyState, SegmentedControl, MacroInline, METRICS, toneSoft, cn, motion, type LucideIcon, Reveal, SkeletonHero, SkeletonLine, Utensils, ShoppingCart, Plus, Minus, Sparkles, Check, ArrowLeft, History, Croissant, Soup, Apple, Dumbbell, RotateCcw } from "@mossa/ui";
import { api, todayLocal } from "../../api.js";
import { useUnits } from "../../units.js";
import { useSession } from "../../session.js";
import { useTour } from "../../tour.js";
import { Markdown } from "../../Markdown.js";
import { AiAnalyzing } from "../../AiAnalyzing.js";
import { AiAvatar } from "../../AiAvatar.js";
import { FoodThumb, MacroSplitBar, FoodRow as FoodRowUI } from "../food.js";

interface Plan { id: string; name: string; status: string; publishedAt?: string | null; body: MealBody }
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

export function MealPlanDrawer({ clientId, onClose, onLogged }: { clientId: string; onClose: () => void; onLogged: () => void }) {
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  const [allPlans, setAllPlans] = useState<Plan[]>([]);
  const [viewId, setViewId] = useState<string | null>(null); // null = the current published plan
  const [histOpen, setHistOpen] = useState(false);
  const [foods, setFoods] = useState<Map<string, FoodRow>>(new Map());
  const [targets, setTargets] = useState<Targets | null>(null);
  const [loggedIdx, setLoggedIdx] = useState<Set<number>>(new Set());
  const [logging, setLogging] = useState<number | null>(null);
  const [view, setView] = useState<"plan" | "shop">("plan");
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<{ opt: MealOption; index: number } | null>(null);
  const [recipe, setRecipe] = useState<{ title: string; text: string } | null>(null);
  const [recipeBusy, setRecipeBusy] = useState<number | null>(null);
  const units = useUnits();
  const { ctx } = useSession();
  const { startIfNew, active: tourActive, tour, stepSelector } = useTour();
  const aiSuite = !!ctx?.entitlements?.features?.aiSuite;
  const date = todayLocal();
  const shopKey = plan ? `mossa.shop.${plan.id}` : null;
  const shopReady = useRef<string | null>(null);

  // First time a client opens their meal plan, walk them through it.
  useEffect(() => {
    if (!plan || tourActive) return;
    const t = setTimeout(() => startIfNew("meal"), 550);
    return () => clearTimeout(t);
  }, [plan, tourActive, startIfNew]);

  // Shopping list persists on-device per plan — what you've got vs still need,
  // and how many days of each option you're buying. Hydrate when the plan loads.
  useEffect(() => {
    if (!shopKey) return;
    try {
      const raw = localStorage.getItem(shopKey);
      const s = raw ? (JSON.parse(raw) as { counts?: Record<number, number>; checked?: string[] }) : {};
      setCounts(s.counts ?? {});
      setChecked(new Set(s.checked ?? []));
    } catch { setCounts({}); setChecked(new Set()); }
    shopReady.current = shopKey;
  }, [shopKey]);
  // Persist on change (never while the tour is driving sample state).
  useEffect(() => {
    if (!shopKey || shopReady.current !== shopKey || tourActive) return;
    try { localStorage.setItem(shopKey, JSON.stringify({ counts, checked: [...checked] })); } catch { /* private mode */ }
  }, [counts, checked]); // eslint-disable-line react-hooks/exhaustive-deps
  const resetShop = () => { setCounts({}); setChecked(new Set()); if (shopKey) try { localStorage.removeItem(shopKey); } catch { /* ignore */ } };

  // During the meal tour, drive the view (and seed a few days) so the shopping
  // list is populated when its steps come up.
  useEffect(() => {
    if (tour !== "meal" || !stepSelector) return;
    if (stepSelector === "mp-shop-add" || stepSelector === "mp-shop-item" || stepSelector === "mp-shop-reset") {
      setView("shop");
      // The check-off / reset steps need at least one item to point at, in case
      // the "add a day" step was skipped.
      if (stepSelector !== "mp-shop-add") {
        const first = (plan?.body.mealOptions ?? []).findIndex((o) => !o.isFree);
        setCounts((c) => (Object.values(c).some((n) => n > 0) || first < 0 ? c : { [first]: 1 }));
      }
    } else if (stepSelector.startsWith("mp-")) {
      setView("plan");
    }
  }, [tour, stepSelector, plan]);

  const load = useCallback(async () => {
    const [pl, f, today, log] = await Promise.all([
      api.get<{ plans: Plan[] }>(`/api/meal-plans?clientId=${clientId}`),
      api.get<{ foods: FoodRow[] }>("/api/foods?scope=all"),
      api.get<{ goal: { targets: Targets | null } | null }>(`/api/today?clientId=${clientId}&date=${date}`).catch(() => ({ goal: null })),
      api.get<{ entries: { meal_plan_id?: string | null; meal_option_index?: number | null }[] }>(`/api/logs/food?clientId=${clientId}&date=${date}`).catch(() => ({ entries: [] })),
    ]);
    const published = pl.plans.find((p) => p.status === "published") ?? null;
    setPlan(published);
    setAllPlans(pl.plans);
    setFoods(new Map(f.foods.map((x) => [x.id, x])));
    setTargets(today.goal?.targets ?? null);
    setLoggedIdx(new Set((log.entries ?? []).filter((e) => e.meal_plan_id === published?.id && e.meal_option_index != null).map((e) => e.meal_option_index as number)));
  }, [clientId, date]);
  useEffect(() => void load(), [load, tourActive]); // reload through the api interceptor when a tour toggles

  const foodMap = useMemo(() => new Map([...foods.entries()].map(([id, f]) => [id, { id: f.id, servingSize: f.serving_size, caloriesPerServing: f.calories, proteinG: f.protein_g, carbsG: f.carbs_g, fatG: f.fat_g } as FoodLike])), [foods]);

  // `active` is the plan being viewed — the current published one by default, or
  // a past (superseded) plan the client picked from history. Logging always
  // targets the current plan, so past plans render read-only.
  const active = (viewId ? allPlans.find((p) => p.id === viewId) : plan) ?? plan ?? null;
  const isPast = !!active && !!plan && active.id !== plan.id;
  const firstShopIdx = (active?.body.mealOptions ?? []).findIndex((o) => !o.isFree);
  const pastPlans = allPlans.filter((p) => p.status === "superseded");
  const pickPlan = (id: string | null) => { setViewId(id); setHistOpen(false); setView("plan"); setCounts({}); setChecked(new Set()); };

  const groups = useMemo(() => {
    const g = new Map<string, { opt: MealOption; index: number }[]>();
    (active?.body.mealOptions ?? []).forEach((opt, index) => { const arr = g.get(opt.mealType) ?? []; arr.push({ opt, index }); g.set(opt.mealType, arr); });
    return [...g.entries()].sort((a, b) => (MEAL_ORDER.indexOf(a[0]) + 99 * (MEAL_ORDER.indexOf(a[0]) < 0 ? 1 : 0)) - (MEAL_ORDER.indexOf(b[0]) + 99 * (MEAL_ORDER.indexOf(b[0]) < 0 ? 1 : 0)));
  }, [active]);

  const contrib = (mf: MealOption["foods"][number]) => {
    const f = foods.get(mf.foodId);
    const factor = f && f.serving_size > 0 ? mf.quantity / f.serving_size : 0;
    return { f, factor };
  };
  // The card hero: the AI plated render, else the first food photo, else none.
  const optionImage = (opt: MealOption): string | null => opt.imageUrl || opt.foods.map((mf) => foods.get(mf.foodId)?.image_url).find((x): x is string => !!x) || null;

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
    (active?.body.mealOptions ?? []).forEach((opt, index) => {
      const days = counts[index] ?? 0;
      if (days <= 0 || opt.isFree) return;
      for (const mf of opt.foods) {
        const f = foods.get(mf.foodId);
        const prev = acc.get(mf.foodId);
        acc.set(mf.foodId, { name: f?.name ?? "Item", qty: (prev?.qty ?? 0) + mf.quantity * days, unit: mf.unit, img: f?.image_url ?? null });
      }
    });
    return [...acc.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => a.name.localeCompare(b.name));
  }, [active, counts, foods]);

  const weekTotals = useMemo(() => {
    let cal = 0, pro = 0, days = 0;
    (active?.body.mealOptions ?? []).forEach((opt, index) => {
      const n = counts[index] ?? 0; days += n;
      if (opt.isFree) { cal += (opt.freeMealMaxCalories ?? 0) * n; return; }
      const t = optionMacroTotals(opt, foodMap); cal += t.calories * n; pro += t.proteinG * n;
    });
    return { cal, pro, days };
  }, [active, counts, foodMap]);

  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-background">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/40 bg-background/85 px-4 py-3 backdrop-blur-xl">
        <button onClick={onClose} aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-foreground transition-colors hover:bg-surface-3 [&_svg]:size-[1.15rem]"><ArrowLeft /></button>
        <div className="min-w-0 flex-1"><div className="truncate text-base font-bold tracking-tight">{isPast ? "Past plan" : "Meal plan"}</div>{active && <div className="truncate text-xs text-muted-foreground">{active.name}</div>}</div>
        {pastPlans.length > 0 && <button onClick={() => setHistOpen(true)} aria-label="Past plans" className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-foreground transition-colors hover:bg-surface-3 [&_svg]:size-[1.15rem]"><History /></button>}
      </div>

      <div className="mx-auto max-w-xl space-y-5 p-4 pb-28">
        <Reveal loading={plan === undefined} className="space-y-5" skeleton={
          <>
            <SkeletonHero height={128} />
            <Skeleton className="h-10 w-full rounded-full" />
            {[0, 1].map((s) => (
              <div key={s} className="space-y-2.5">
                <div className="flex items-center gap-2 px-1">
                  <Skeleton className="size-7 rounded-xl" />
                  <SkeletonLine w="6rem" h="text" />
                </div>
                <div className="flex gap-3 overflow-hidden py-2">
                  {[0, 1].map((i) => (
                    <div key={i} className="w-[74%] shrink-0 overflow-hidden rounded-2xl bg-card sm:w-[52%]">
                      <Skeleton className="h-36 w-full rounded-none" />
                      <div className="space-y-2.5 p-2.5">
                        <Skeleton className="h-1.5 w-full rounded-full" />
                        <Skeleton className="h-8 w-full rounded-xl" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        }>
          {plan !== undefined && (!active ? (
          <EmptyState icon={Utensils} title="No meal plan yet" description="Your coach hasn't published a meal plan. You can still log food from the Eat tab." />
        ) : (
          <>
            {/* Hero — the plan at a glance + daily target context */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} data-tour="mp-hero">
              <Card className="relative overflow-hidden">
                <div className="pointer-events-none absolute -right-10 -top-10 size-36 rounded-full bg-nutrition/10 blur-2xl" />
                <div className="relative">
                  <div className={cn("text-xs font-medium uppercase tracking-wide", isPast ? "text-muted-foreground" : "text-nutrition")}>{isPast ? "Past plan" : "Your plan"}</div>
                  <h2 className="mt-0.5 text-xl font-semibold tracking-tight">{active?.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{groups.length} meal{groups.length === 1 ? "" : "s"} · {active?.body.mealOptions?.length ?? 0} options{active?.publishedAt ? ` · ${new Date(active.publishedAt).toLocaleDateString()}` : ""}</p>
                  {isPast ? (
                    <button onClick={() => pickPlan(null)} className="mt-3 inline-flex items-center gap-1 rounded-full bg-nutrition-soft px-3 py-1 text-xs font-semibold text-nutrition [&_svg]:size-3.5"><ArrowLeft /> Back to current plan</button>
                  ) : (targets?.targetCalories || targets?.targetProteinG) ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {targets?.targetCalories ? <span className="rounded-full bg-calories-soft px-2.5 py-1 text-xs font-semibold text-calories">{fmtEnergy(targets.targetCalories, units)} / day</span> : null}
                      {targets?.targetProteinG ? <span className="rounded-full bg-protein-soft px-2.5 py-1 text-xs font-semibold text-protein">{targets.targetProteinG} g protein</span> : null}
                    </div>
                  ) : null}
                </div>
              </Card>
            </motion.div>

            <div data-tour="mp-tabs"><SegmentedControl options={[{ value: "plan", label: "My meals" }, { value: "shop", label: "Shopping list" }]} value={view} onChange={setView} /></div>

            {view === "plan" ? (
              groups.length === 0 ? <EmptyState icon={Utensils} title="No options yet" /> : (
                <div className="space-y-6">
                  <p className="-mt-1 px-1 text-sm text-muted-foreground">{isPast ? "A plan you were on before — browse the meals and recipes." : <>Pick one option per meal each day, then tap <span className="font-medium text-foreground">Log</span> when you eat it.</>}</p>
                  {groups.map(([type, opts], gi) => {
                    const meta = metaFor(type);
                    return (
                      <section key={type} data-tour={gi === 0 ? "mp-section" : undefined} className="space-y-2.5">
                        <div className="flex items-center gap-2 px-1">
                          <span className="grid size-7 place-items-center rounded-xl bg-nutrition-soft text-nutrition [&_svg]:size-4"><meta.icon /></span>
                          <span className="font-semibold">{meta.label}</span>
                          <span className="text-xs text-muted-foreground">{opts.length} option{opts.length === 1 ? "" : "s"}</span>
                        </div>
                        <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 py-2">
                          {opts.map(({ opt, index }, oi) => (
                            <OptionPhotoCard
                              key={index} opt={opt} index={index} units={units} image={optionImage(opt)} totals={optionMacroTotals(opt, foodMap)} readOnly={isPast} anchor={gi === 0 && oi === 0}
                              logged={!isPast && loggedIdx.has(index)} logging={logging === index} onLog={() => void logOption(opt, index)} onOpen={() => setDetail({ opt, index })}
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
                {(active?.body.mealOptions ?? []).map((opt, index) => (
                  opt.isFree ? null : (
                    <div key={index} data-tour={index === firstShopIdx ? "mp-shop-days" : undefined} className="flex items-center gap-3 rounded-2xl bg-card px-3 py-2.5">
                      <FoodThumb src={opt.foods.map((mf) => foods.get(mf.foodId)?.image_url).find(Boolean)} size={38} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{opt.mealName || `Option ${index + 1}`}</div>
                        <div className="text-xs text-muted-foreground">{metaFor(opt.mealType).label}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="icon-sm" variant="secondary" disabled={(counts[index] ?? 0) === 0} onClick={() => bump(index, -1)} aria-label="Fewer days"><Minus /></Button>
                        <span className="numeral w-5 text-center font-semibold">{counts[index] ?? 0}</span>
                        <Button size="icon-sm" variant="secondary" data-tour={index === firstShopIdx ? "mp-shop-add" : undefined} onClick={() => bump(index, 1)} aria-label="More days"><Plus /></Button>
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
                  <div className="flex items-center gap-2">
                    {(weekTotals.days > 0 || checked.size > 0) && <button data-tour="mp-shop-reset" onClick={resetShop} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-3.5"><RotateCcw /> Start over</button>}
                    {grocery.length > 0 && <Badge tone="nutrition">{grocery.filter((g) => !checked.has(g.id)).length} to buy</Badge>}
                  </div>
                </div>
                {grocery.length === 0 ? (
                  <EmptyState icon={ShoppingCart} title="Nothing yet" description="Add days to some options above." />
                ) : (
                  <Card data-tour="mp-shop-list" className="space-y-0.5 p-2">
                    {grocery.map((g, gi) => {
                      const done = checked.has(g.id);
                      return (
                        <button key={g.id} data-tour={gi === 0 ? "mp-shop-item" : undefined} onClick={() => setChecked((s) => { const n = new Set(s); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n; })} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface-2">
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
          ))}
        </Reveal>
      </div>

      {detail && (
        <OptionDetailSheet
          opt={detail.opt} index={detail.index} units={units} foods={foods} foodMap={foodMap} image={optionImage(detail.opt)} readOnly={isPast}
          logged={!isPast && loggedIdx.has(detail.index)} logging={logging === detail.index} onLog={() => void logOption(detail.opt, detail.index)}
          aiSuite={aiSuite} recipeBusy={recipeBusy === detail.index} onRecipe={() => void recommendRecipe(detail.opt, detail.index)}
          onClose={() => setDetail(null)}
        />
      )}

      {histOpen && (
        <Sheet open onClose={() => setHistOpen(false)} title="Past plans">
          <div className="space-y-1.5">
            {plan && (
              <button onClick={() => pickPlan(null)} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2", !isPast && "bg-nutrition-soft/40")}>
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-nutrition-soft text-nutrition [&_svg]:size-4"><Utensils /></span>
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{plan.name}</div><div className="text-xs text-muted-foreground">Current plan</div></div>
                {!isPast && <Check className="size-4 shrink-0 text-nutrition" strokeWidth={3} />}
              </button>
            )}
            {pastPlans.map((p) => (
              <button key={p.id} onClick={() => pickPlan(p.id)} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2", viewId === p.id && "bg-surface-2")}>
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted-foreground [&_svg]:size-4"><History /></span>
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{p.name}</div><div className="text-xs text-muted-foreground">{p.publishedAt ? `Until ${new Date(p.publishedAt).toLocaleDateString()}` : "Superseded"}</div></div>
                {viewId === p.id && <Check className="size-4 shrink-0 text-foreground" strokeWidth={3} />}
              </button>
            ))}
          </div>
        </Sheet>
      )}

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

/** A meal option as a photo-hero carousel card — cover, name, calories, macro
 *  split, Log button. Tapping the cover opens the full detail sheet. */
function OptionPhotoCard({ opt, index, units, image, totals, logged, logging, onLog, onOpen, readOnly, anchor }: {
  opt: MealOption; index: number; units: ReturnType<typeof useUnits>; image: string | null;
  totals: { calories: number; proteinG: number; carbsG: number; fatG: number }; logged: boolean; logging: boolean; onLog: () => void; onOpen: () => void; readOnly?: boolean; anchor?: boolean;
}) {
  return (
    <div data-tour={anchor ? "mp-option" : undefined} className="w-[74%] shrink-0 snap-start sm:w-[52%]">
      <div className={cn("overflow-hidden rounded-2xl bg-card", logged && "ring-1 ring-nutrition/50")}>
        <button onClick={onOpen} className="relative block h-36 w-full text-left transition-opacity active:opacity-90">
          {image ? <img src={image} alt="" className="absolute inset-0 size-full object-cover" /> : <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-nutrition/20 to-surface-2 text-nutrition/50 [&_svg]:size-9"><Utensils /></div>}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
          {logged ? <span className="absolute right-2 top-2 inline-flex items-center gap-0.5 rounded-full bg-nutrition px-2 py-0.5 text-[0.6rem] font-semibold text-white [&_svg]:size-2.5"><Check strokeWidth={3} /> Logged</span> : opt.isFree ? <span className="absolute right-2 top-2 rounded-full bg-white/20 px-2 py-0.5 text-[0.6rem] font-semibold text-white backdrop-blur-md">Free</span> : null}
          <div className="absolute inset-x-0 bottom-0 p-3">
            <div className="truncate font-semibold text-white">{opt.mealName || (opt.isFree ? "Free meal" : `Option ${index + 1}`)}</div>
            {opt.isFree ? (
              <div className="numeral truncate text-xs text-white/85">≤ {opt.freeMealMaxCalories != null ? fmtEnergy(opt.freeMealMaxCalories, units) : "—"}</div>
            ) : (
              <div className="mt-0.5 flex items-center gap-2">
                <span className="numeral shrink-0 text-xs font-semibold text-white">{fmtEnergy(totals.calories, units)}</span>
                <MacroInline proteinG={totals.proteinG} carbsG={totals.carbsG} fatG={totals.fatG} className="shrink-0 text-[0.7rem] drop-shadow" />
              </div>
            )}
          </div>
        </button>
        {!opt.isFree && <div className={cn("px-2.5 pt-2.5", readOnly && "pb-2.5")}><MacroSplitBar proteinG={totals.proteinG} carbsG={totals.carbsG} fatG={totals.fatG} /></div>}
        {readOnly ? (
          <button onClick={onOpen} className="w-full px-2.5 py-2 text-center text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">View details</button>
        ) : (
          <div data-tour={anchor ? "mp-log" : undefined} className="p-2.5">
            <Button size="sm" className="w-full" variant={logged ? "secondary" : opt.isFree ? "tonal" : "default"} disabled={logging} onClick={onLog}>{logging ? "…" : logged ? "Log again" : "Log this"}</Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** The full option breakdown — cover, macro tiles, foods, notes, recipe, micros. */
function OptionDetailSheet({ opt, index, units, foods, foodMap, image, logged, logging, onLog, aiSuite, recipeBusy, onRecipe, onClose, readOnly }: {
  opt: MealOption; index: number; units: ReturnType<typeof useUnits>; foods: Map<string, FoodRow>; foodMap: Map<string, FoodLike>; image: string | null;
  logged: boolean; logging: boolean; onLog: () => void; aiSuite: boolean; recipeBusy: boolean; onRecipe: () => void; onClose: () => void; readOnly?: boolean;
}) {
  const t = optionMacroTotals(opt, foodMap);
  const contrib = (mf: MealOption["foods"][number]) => { const f = foods.get(mf.foodId); return { f, factor: f && f.serving_size > 0 ? mf.quantity / f.serving_size : 0 }; };
  const micro = { fiberG: 0, sugarG: 0, saturatedFatG: 0, sodiumMg: 0, cholesterolMg: 0, potassiumMg: 0, calciumMg: 0, ironMg: 0 };
  for (const mf of opt.foods) { const { f, factor } = contrib(mf); if (!f) continue; micro.fiberG += (f.fiber_g ?? 0) * factor; micro.sugarG += (f.sugar_g ?? 0) * factor; micro.saturatedFatG += (f.saturated_fat_g ?? 0) * factor; micro.sodiumMg += (f.sodium_mg ?? 0) * factor; micro.cholesterolMg += (f.cholesterol_mg ?? 0) * factor; micro.potassiumMg += (f.potassium_mg ?? 0) * factor; micro.calciumMg += (f.calcium_mg ?? 0) * factor; micro.ironMg += (f.iron_mg ?? 0) * factor; }
  const microRows: [string, number, string][] = [["Fiber", micro.fiberG, "g"], ["Sugar", micro.sugarG, "g"], ["Sat. fat", micro.saturatedFatG, "g"], ["Sodium", micro.sodiumMg, "mg"], ["Cholesterol", micro.cholesterolMg, "mg"], ["Potassium", micro.potassiumMg, "mg"], ["Calcium", micro.calciumMg, "mg"], ["Iron", micro.ironMg, "mg"]];
  const hasMicros = microRows.some(([, v]) => v > 0);

  return (
    <Sheet open onClose={onClose} title={opt.mealName || (opt.isFree ? "Free meal" : `Option ${index + 1}`)}>
      <div className="space-y-3">
        {image && <img src={image} alt="" className="h-44 w-full rounded-2xl object-cover" />}
        {opt.isFree ? (
          <p className="text-sm text-muted-foreground">A free meal up to {opt.freeMealMaxCalories != null ? fmtEnergy(opt.freeMealMaxCalories, units) : "your cap"} — eat what you like within it.</p>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2">
              {MACRO_TILES.map(([metric, key]) => {
                const M = METRICS[metric];
                return (
                  <div key={metric} className={cn("flex flex-col items-center gap-1 rounded-xl p-2.5", toneSoft[M.tone])}>
                    <M.icon className="size-4" />
                    <div className="numeral text-lg font-semibold leading-none">{metric === "calories" ? kcalToDisplay(t[key], units).toLocaleString() : Math.round(t[key])}</div>
                  </div>
                );
              })}
            </div>
            {opt.foods.length > 0 && (
              <div className="space-y-1">
                {opt.foods.map((mf, k) => {
                  const { f, factor } = contrib(mf);
                  return (
                    <div key={k} className="rounded-xl bg-surface-2 px-2 py-1.5">
                      <FoodRowUI
                        name={f?.name ?? "Food"}
                        image={f?.image_url}
                        calories={(f?.calories ?? 0) * factor}
                        proteinG={Math.round((f?.protein_g ?? 0) * factor)}
                        carbsG={Math.round((f?.carbs_g ?? 0) * factor)}
                        fatG={Math.round((f?.fat_g ?? 0) * factor)}
                        sub={`${Math.round(mf.quantity)} ${mf.unit}`}
                        thumbSize={34}
                      />
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
          </>
        )}
        {!readOnly && <Button size="lg" className="w-full" variant={logged ? "secondary" : "default"} disabled={logging} onClick={() => { onLog(); onClose(); }}>{logging ? "Logging…" : logged ? "Log again" : "Log this meal"}</Button>}
      </div>
    </Sheet>
  );
}
