/** Meal plan builder — bank-of-options with live macro totals + free meals. */

import { useCallback, useEffect, useState } from "react";
import type { MealBody, MealOption, MealFood } from "@kova/protocol";
import { optionMacroTotals, type FoodLike } from "@kova/protocol";
import { fmtEnergy, scaleFood, servingsToQuantity, SERVING_PRESETS } from "@kova/domain";
import { Button, Card, Badge, Field, Sheet, Skeleton, SubCard, MacroInline, MacroBar, ProgressRing, Eyebrow, Chip, IconBadge, ConfirmDialog, EmptyState, Page, Stagger, Reveal, SkeletonLine, SkeletonRow, colorToHex, toneVar, cn, AlertTriangle, ArrowLeft, Plus, PencilLine, Utensils, Flame, History, LayoutGrid, ChevronRight, Trash2, X } from "@kova/ui";
import { api, ApiError, errorText } from "../../api.js";
import { useCan } from "../../FeatureLock.js";
import { AiAvatar } from "../../AiAvatar.js";
import { ClientPrefsStrip } from "./ClientPrefsStrip.js";
import { AiErrorBox } from "../../AiError.js";
import { useUnits } from "../../units.js";
import { FoodSearchSheet } from "../client/FoodSearchSheet.js";
import { FoodThumb } from "../food.js";

/** Client daily targets (flat shape, as stored on the active goal). */
interface Targets { targetCalories?: number; targetProteinG?: number; targetCarbsG?: number; targetFatG?: number }
interface Plan { id: string; clientId: string; name: string; status: string; body: MealBody; targetGoal?: Record<string, unknown> | null; variantId?: string | null }
interface FoodRow { id: string; name: string; serving_size: number; calories: number; protein_g: number; carbs_g: number; fat_g: number }
const BUILTIN_TYPES = ["breakfast", "lunch", "dinner", "snack", "pre_workout", "post_workout"];

/** Normalize a plan's snapshotted goal (flat or `{targets}`-nested) into flat targets. */
function asTargets(src: unknown): Targets | null {
  if (!src || typeof src !== "object") return null;
  const o = src as Record<string, unknown>;
  const t = (o.targets && typeof o.targets === "object" ? o.targets : o) as Targets;
  return typeof t.targetCalories === "number" ? t : null;
}

export function MealBuilder({ planId, onBack }: { planId: string; onBack: () => void }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [options, setOptions] = useState<MealOption[]>([]);
  const [customTypes, setCustomTypes] = useState<{ label: string }[]>([]);
  const [hiddenTypes, setHiddenTypes] = useState<string[]>([]);
  const [foods, setFoods] = useState<Map<string, FoodLike>>(new Map());
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [targets, setTargets] = useState<Targets | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // One in-flight name for the footer's three lifecycle actions — they share the
  // bar, and only one can sensibly run at a time.
  const [action, setAction] = useState<"publish" | "activate" | "rollback" | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [foodPicker, setFoodPicker] = useState<{ optIdx: number } | null>(null);
  const units = useUnits();
  const [aiOpen, setAiOpen] = useState(false);
  // Every AI affordance here posts to a route gated on the aiSuite entitlement.
  const canAi = useCan("aiSuite");
  const [typeOpen, setTypeOpen] = useState(false);
  const [newType, setNewType] = useState("");
  // Seed-the-draft: the client's most recent OTHER plan + a template picker.
  const [latestOther, setLatestOther] = useState<{ id: string; name: string; body: MealBody } | null>(null);
  const [plansLoaded, setPlansLoaded] = useState(false);
  const [seedTemplateOpen, setSeedTemplateOpen] = useState(false);
  // A pending destructive replace, held until the coach confirms.
  const [seedConfirm, setSeedConfirm] = useState<{ source: string; apply: () => void } | null>(null);

  const foodsFromRows = (rows: FoodRow[]): Map<string, FoodLike> =>
    new Map(rows.map((x) => [x.id, { id: x.id, servingSize: x.serving_size, caloriesPerServing: x.calories, proteinG: x.protein_g, carbsG: x.carbs_g, fatG: x.fat_g }]));

  // Two independent reads, so `allSettled`: the plan is required (nothing renders
  // without it) but the food library only powers the macro read-outs, and with
  // `all` a foods outage rejected the pair and left the whole builder a permanent
  // skeleton — the coach couldn't even see the meals they'd already written.
  // Losing foods alone just falls back to "Macros update after saving".
  const load = useCallback(async () => {
    setLoadError(false);
    const [p, f] = await Promise.allSettled([api.get<{ plan: Plan }>(`/api/meal-plans/${planId}`), api.get<{ foods: FoodRow[] }>("/api/foods?scope=all")]);
    if (f.status === "fulfilled") {
      setFoods(foodsFromRows(f.value.foods));
      setNames(new Map(f.value.foods.map((x) => [x.id, x.name])));
    }
    if (p.status === "rejected") { setLoadError(true); return; }
    setPlan(p.value.plan); setOptions(p.value.plan.body.mealOptions ?? []); setCustomTypes(p.value.plan.body.customMealTypes ?? []); setHiddenTypes(p.value.plan.body.hiddenMealTypes ?? []);
  }, [planId]);
  useEffect(() => void load(), [load]);

  // Live target feedback: the client's ACTIVE goal targets (canonical, guarded
  // by requireClientAccess). Drafts don't snapshot a goal — only published
  // plans do — so we read the live goal here and fall back to the plan's
  // snapshot. A quiet miss just hides the target cues.
  useEffect(() => {
    const cid = plan?.clientId;
    if (!cid) return;
    let alive = true;
    api.get<{ goals: { status: string; targets: Targets | null }[] }>(`/api/goals?clientId=${cid}`)
      .then((r) => { if (!alive) return; const g = r.goals?.find((x) => x.status === "active") ?? r.goals?.[0]; setTargets(g?.targets ?? asTargets(plan?.targetGoal)); })
      .catch(() => { if (alive) setTargets(asTargets(plan?.targetGoal)); });
    return () => { alive = false; };
  }, [plan?.clientId, plan?.targetGoal]);

  const nameOf = useCallback((id: string) => names.get(id) ?? "Food", [names]);

  // Pull the food reference map fresh WITHOUT touching plan/option edits — used
  // after a pick or AI draft so newly-imported foods get live macros + serving
  // presets immediately (onPick only hands back an id + name).
  const refreshFoods = useCallback(async () => {
    try {
      const f = await api.get<{ foods: FoodRow[] }>("/api/foods?scope=all");
      setFoods(foodsFromRows(f.foods));
      setNames((prev) => { const m = new Map(prev); for (const x of f.foods) m.set(x.id, x.name); return m; });
    } catch { /* keep optimistic names */ }
  }, []);

  // Fetch the client's plans (created_at DESC) to offer "Latest plan" as a
  // seed — the most recent plan that isn't THIS draft AND shares its lane
  // (variant), so a "Cutting" draft doesn't seed from a "Main" plan. A quiet
  // miss just disables it.
  useEffect(() => {
    const cid = plan?.clientId;
    if (!cid) return;
    const lane = plan?.variantId ?? null;
    let alive = true;
    api.get<{ plans: { id: string; name: string; body: MealBody; variantId?: string | null }[] }>(`/api/meal-plans?clientId=${cid}`)
      .then((r) => { if (!alive) return; setLatestOther(r.plans?.find((pl) => pl.id !== planId && (pl.variantId ?? null) === lane) ?? null); setPlansLoaded(true); })
      .catch(() => { if (alive) setPlansLoaded(true); });
    return () => { alive = false; };
  }, [plan?.clientId, plan?.variantId, planId]);

  // Replace the current draft's body with a seed body, then refresh the food
  // reference map so foods referenced by the seed resolve their macros.
  const applySeedBody = (body: MealBody) => {
    setOptions(body.mealOptions ?? []);
    setCustomTypes(body.customMealTypes ?? []);
    setHiddenTypes(body.hiddenMealTypes ?? []);
    setDirty(true);
    void refreshFoods();
  };
  // Guard: replacing is destructive, so confirm only when the draft has options.
  const seedDraft = (source: string, body: MealBody) => {
    const apply = () => applySeedBody(body);
    if (options.length > 0) setSeedConfirm({ source, apply });
    else apply();
  };

  const mutate = (fn: (d: MealOption[]) => void) => { const next = structuredClone(options); fn(next); setOptions(next); setDirty(true); };
  // The raw body write — publish composes it, so it must throw rather than
  // swallow (publishing an unsaved body would hand the client the wrong meals).
  const saveBody = async () => { await api.patch(`/api/meal-plans/${planId}`, { body: { customMealTypes: customTypes, hiddenMealTypes: hiddenTypes, mealOptions: options } }); setDirty(false); };
  const save = async () => {
    if (saving || action) return;
    setSaving(true); setActionErr(null);
    try { await saveBody(); }
    catch (e) { setActionErr(errorText(e, "Couldn't save the draft. Please try again.")); }
    finally { setSaving(false); }
  };
  /** Run one footer action with an in-flight guard + a visible failure. Without
   *  this a flaky POST changed nothing on screen: the coach walked away believing
   *  the client had the plan, and a double-tap fired the write twice. */
  const runAction = async (name: "publish" | "activate" | "rollback", fn: () => Promise<void>, fallback: string) => {
    if (action || saving) return;
    setAction(name); setActionErr(null);
    try { await fn(); }
    catch (e) { setActionErr(errorText(e, fallback)); }
    finally { setAction(null); }
  };
  // Remove a meal type from THIS plan: built-ins are hidden (restorable via
  // "+ Meal type"); custom types are dropped outright. Either way its options go.
  const removeType = (type: string) => {
    setOptions((prev) => prev.filter((o) => o.mealType !== type));
    if (BUILTIN_TYPES.includes(type)) setHiddenTypes((p) => (p.includes(type) ? p : [...p, type]));
    else setCustomTypes((p) => p.filter((t) => t.label !== type));
    setDirty(true);
  };
  const publish = () => runAction("publish", async () => { await saveBody(); await api.post(`/api/meal-plans/${planId}/publish`); await load(); }, "Couldn't publish this plan — the client hasn't received it. Please try again.");
  // Superseded/archived plans are read-only (PATCH 409s). "Make active" re-publishes
  // WITHOUT a save first (which would 409); rollback returns it to an editable draft.
  const makeActive = () => runAction("activate", async () => { await api.post(`/api/meal-plans/${planId}/publish`); await load(); }, "Couldn't make this plan active. Please try again.");
  const rollback = () => runAction("rollback", async () => { await api.post(`/api/meal-plans/${planId}/status`, { status: "draft" }); await load(); }, "Couldn't roll this plan back to a draft. Please try again.");
  const addCustomType = () => { const label = newType.trim(); if (label && !customTypes.some((t) => t.label === label)) { setCustomTypes((p) => [...p, { label }]); setDirty(true); } setNewType(""); setTypeOpen(false); };
  const runAi = async (instructions: string): Promise<string[]> => {
    if (!plan) return [];
    const res = await api.post<{ draft: MealBody; dropped?: string[] }>("/api/ai/draft-meal", { clientId: plan.clientId, instructions });
    setOptions((prev) => [...prev, ...(res.draft.mealOptions ?? [])]); setDirty(true);
    void refreshFoods();
    const dropped = res.dropped ?? [];
    if (!dropped.length) setAiOpen(false);
    return dropped;
  };

  const readOnly = plan?.status === "superseded" || plan?.status === "archived";
  const byType = new Map<string, { opt: MealOption; idx: number }[]>();
  options.forEach((opt, idx) => byType.set(opt.mealType, [...(byType.get(opt.mealType) ?? []), { opt, idx }]));
  const allTypes = [...BUILTIN_TYPES.filter((t) => !hiddenTypes.includes(t)), ...customTypes.map((t) => t.label)];
  const restorable = BUILTIN_TYPES.filter((t) => hiddenTypes.includes(t)); // hidden built-ins, offered for re-add

  return (
    <Page className="column space-y-4 p-4 pb-32">
      {loadError && !plan ? (
        <EmptyState icon={AlertTriangle} title="Couldn't load this plan" description="Something went wrong reaching the server. Check your connection and try again." action={<div className="flex gap-2"><Button variant="secondary" onClick={onBack}>Back</Button><Button onClick={() => void load()}>Try again</Button></div>} />
      ) : (
      <Reveal loading={!plan} className="space-y-4" skeleton={
        <>
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-xl" />
            <SkeletonLine w="40%" h="title" className="flex-1" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <Skeleton className="h-12 rounded-2xl" />
          <div className="flex gap-2"><Skeleton className="h-10 flex-1 rounded-xl" /><Skeleton className="h-10 w-32 rounded-xl" /></div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-2xl bg-card p-4">
              <SkeletonLine w="30%" h="title" />
              <div className="rounded-xl bg-surface-2 p-3"><SkeletonRow thumb={34} /></div>
            </div>
          ))}
        </>
      }>
        {plan && (
        <>
      <div className="flex items-center gap-3">
        <Button size="icon" variant="secondary" onClick={onBack}><ArrowLeft /></Button>
        <h1 className="flex-1 truncate text-title-3">{plan.name}</h1>
        <Badge tone={plan.status === "published" ? "success" : "neutral"}>{plan.status}</Badge>
      </div>

      <ClientPrefsStrip clientId={plan.clientId} focus="meal" />

      {targets?.targetCalories ? (
        <Card className="flex items-center justify-between py-3 text-sm">
          <span className="text-muted-foreground">Daily target</span>
          <span className="numeral flex items-center gap-2 font-medium"><span className="text-calories">{fmtEnergy(targets.targetCalories, units)}</span><MacroInline proteinG={targets.targetProteinG ?? 0} carbsG={targets.targetCarbsG ?? 0} fatG={targets.targetFatG ?? 0} /></span>
        </Card>
      ) : null}

      <PlanHealth allTypes={allTypes} byType={byType} foods={foods} targets={targets} />

      <div className="flex gap-2">
        {/* `/api/ai/draft-meal` is gated on aiSuite — don't offer a 403. */}
        {canAi && <Button variant="tonal" className="flex-1" onClick={() => setAiOpen(true)}><AiAvatar className="size-5" /> AI meal draft</Button>}
        <Button variant="secondary" className={canAi ? undefined : "flex-1"} onClick={() => setTypeOpen(true)}><Plus /> Meal type</Button>
      </div>

      {/* Seed the draft — load the client's most recent other plan, or a saved
          template, into this draft (each REPLACES the current meals). */}
      {!readOnly && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" disabled={!latestOther} onClick={() => latestOther && seedDraft(latestOther.name, latestOther.body)}><History /> Latest plan</Button>
            <Button variant="secondary" size="sm" onClick={() => setSeedTemplateOpen(true)}><LayoutGrid /> From template</Button>
          </div>
          {plansLoaded && !latestOther && <p className="px-1 text-[0.7rem] text-muted-foreground">No previous plan for this client — start from a template instead.</p>}
        </div>
      )}

      <Stagger className="space-y-4">
      {allTypes.map((type) => {
        const opts = byType.get(type) ?? [];
        return (
          <Card key={type} className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold capitalize">{type.replace("_", " ")}</h2>
              <div className="flex items-center gap-1">
                <button onClick={() => mutate((d) => d.push({ mealType: type, mealName: `Option ${opts.length + 1}`, isFree: false, foods: [] }))} className="inline-flex items-center gap-1 text-sm font-medium text-nutrition [&_svg]:size-4"><Plus /> Option</button>
                {!readOnly && <button onClick={() => removeType(type)} aria-label={`Remove ${type.replace("_", " ")}`} className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger [&_svg]:size-4"><Trash2 /></button>}
              </div>
            </div>
            {opts.length === 0 && <p className="text-sm text-muted-foreground">No options yet.</p>}
            {opts.map(({ opt, idx }) => {
              const t = optionMacroTotals(opt, foods);
              const over = !!(targets?.targetCalories && t.calories > targets.targetCalories);
              return (
                <SubCard key={idx} className="space-y-3">
                  {/* Header: name + macro summary vs target + remove */}
                  <div className="flex items-end gap-2">
                    <Field label="Option name" value={opt.mealName} placeholder="e.g. Oats & berries" onChange={(e) => mutate((d) => (d[idx]!.mealName = e.target.value))} className="flex-1" />
                    <Button size="icon-sm" variant="ghost" aria-label="Remove option" className="mb-0.5 text-muted-foreground hover:text-danger" onClick={() => mutate((d) => d.splice(idx, 1))}><X /></Button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <button onClick={() => mutate((d) => { d[idx]!.isFree = !d[idx]!.isFree; if (d[idx]!.isFree) d[idx]!.foods = []; })} className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors", opt.isFree ? "bg-nutrition-soft text-nutrition" : "bg-surface-3 text-muted-foreground hover:text-foreground")}>Free meal</button>
                    <span className="numeral flex items-center gap-2 text-xs">
                      {targets?.targetCalories ? (
                        <span className="flex items-center gap-1">
                          <span className={cn("font-semibold", over ? "text-warning" : "text-calories")}>{fmtEnergy(t.calories, units)}</span>
                          <span className="text-muted-foreground">/ {fmtEnergy(targets.targetCalories, units)}</span>
                        </span>
                      ) : (
                        <span className="font-semibold text-calories">{fmtEnergy(t.calories, units)}</span>
                      )}
                      <MacroInline proteinG={t.proteinG} carbsG={t.carbsG} fatG={t.fatG} />
                    </span>
                  </div>

                  {opt.isFree ? (
                    <Field label="Max calories" type="number" inputMode="numeric" placeholder="Optional cap" value={opt.freeMealMaxCalories ?? ""} onChange={(e) => mutate((d) => (d[idx]!.freeMealMaxCalories = e.target.value ? Number(e.target.value) : null))} className="max-w-[12rem]" />
                  ) : (
                    <div className="space-y-3">
                      {opt.foods.map((mf, fi) => (
                        <FoodPortionRow
                          key={fi}
                          mf={mf}
                          name={nameOf(mf.foodId)}
                          food={foods.get(mf.foodId)}
                          onQty={(q) => mutate((d) => (d[idx]!.foods[fi]!.quantity = q))}
                          onRemove={() => mutate((d) => d[idx]!.foods.splice(fi, 1))}
                        />
                      ))}
                      <div className="space-y-1.5">
                        <button onClick={() => setFoodPicker({ optIdx: idx })} className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-xs font-medium text-nutrition transition-colors hover:bg-surface-3 [&_svg]:size-4"><Plus /> Add food</button>
                        {opt.foods.length === 0 && <p className="px-1 text-center text-[0.7rem] text-muted-foreground">Search the library — or create a new food from the search if it's not there yet.</p>}
                      </div>
                      {opt.foods.length > 0 && <MealImage mealName={opt.mealName} foodNames={opt.foods.map((mf) => nameOf(mf.foodId))} value={opt.imageUrl} onChange={(url) => mutate((d) => (d[idx]!.imageUrl = url))} />}
                    </div>
                  )}
                </SubCard>
              );
            })}
          </Card>
        );
      })}
      </Stagger>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/40 bg-background/90 p-3 backdrop-blur-xl md:pl-24">
        <div className="column space-y-2">
          {readOnly && (
            <div className="flex items-center gap-2 rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning [&_svg]:size-3.5"><History /> This plan is {plan.status} — read-only. Roll it back to a draft to edit, or make it active again.</div>
          )}
          {actionErr && <p className="px-1 text-xs text-warning" role="alert">{actionErr}</p>}
          <div className="flex gap-3">
            {readOnly ? (
              <>
                <Button variant="outline" className="flex-1" disabled={action !== null} onClick={() => void rollback()}>{action === "rollback" ? "Rolling back…" : "Roll back to draft"}</Button>
                <Button className="flex-1" disabled={action !== null} onClick={() => void makeActive()}>{action === "activate" ? "Activating…" : "Make active"}</Button>
              </>
            ) : (
              <>
                <Button variant="outline" className="flex-1" disabled={!dirty || saving || action !== null} onClick={() => void save()}>{saving ? "Saving…" : dirty ? "Save draft" : "Saved"}</Button>
                <Button className="flex-1" disabled={saving || action !== null} onClick={() => void publish()}>{action === "publish" ? "Publishing…" : plan.status === "published" ? "Re-publish" : "Publish"}</Button>
              </>
            )}
          </div>
        </div>
      </div>
        </>
        )}
      </Reveal>
      )}

      {foodPicker && <FoodSearchSheet onClose={() => setFoodPicker(null)} onPick={(id, name) => { mutate((d) => d[foodPicker.optIdx]!.foods.push({ foodId: id, quantity: 100, unit: "g" })); setNames((p) => new Map(p).set(id, name)); setFoodPicker(null); void refreshFoods(); }} />}
      {aiOpen && <AiMealSheet onClose={() => setAiOpen(false)} onRun={runAi} />}
      <Sheet open={typeOpen} onClose={() => setTypeOpen(false)} title="Add meal type">
        <div className="space-y-4">
          {restorable.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Bring back a removed meal</span>
              <div className="flex flex-wrap gap-2">
                {restorable.map((t) => <Chip key={t} onClick={() => { setHiddenTypes((p) => p.filter((x) => x !== t)); setDirty(true); setTypeOpen(false); }}>{t.replace("_", " ")}</Chip>)}
              </div>
            </div>
          )}
          <Field label="Or add a custom meal" icon={Utensils} value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="e.g. Second breakfast" autoFocus />
          <Button size="lg" className="w-full" disabled={newType.trim().length < 2} onClick={addCustomType}>Add meal type</Button>
        </div>
      </Sheet>
      {seedTemplateOpen && <SeedTemplateSheet onClose={() => setSeedTemplateOpen(false)} onPick={(body, name) => { setSeedTemplateOpen(false); seedDraft(name, body); }} />}
      <ConfirmDialog
        open={!!seedConfirm}
        onOpenChange={(o) => { if (!o) setSeedConfirm(null); }}
        title="Replace this draft?"
        description={`The current meals will be replaced with “${seedConfirm?.source ?? ""}”.`}
        confirmLabel="Replace"
        destructive
        onConfirm={() => seedConfirm?.apply()}
      />
    </Page>
  );
}

/** Live "daily plan health" intelligence over the in-memory plan. A meal plan is a
 *  bank of options (the client picks ONE option per meal), so we derive a
 *  representative SAMPLE DAY = the first option of each meal type (meals with no
 *  options are skipped; free meals contribute their max-calories cap via
 *  optionMacroTotals). Pure derivation — no fetches, no plan mutation. */
function PlanHealth({ allTypes, byType, foods, targets }: {
  allTypes: string[];
  byType: Map<string, { opt: MealOption; idx: number }[]>;
  foods: Map<string, FoodLike>;
  targets: Targets | null;
}) {
  const units = useUnits();
  const meals = allTypes
    .map((type) => ({ type, opts: (byType.get(type) ?? []).map((o) => o.opt) }))
    .filter((m) => m.opts.length > 0);

  // Nothing to summarise until at least one meal has an option carrying food (or a
  // free-meal cap) — an all-empty draft gets no card, not a card full of zeroes.
  const hasContent = meals.some((m) => m.opts.some((o) => (!o.isFree && o.foods.length > 0) || (o.isFree && !!o.freeMealMaxCalories)));
  if (!hasContent) return null;

  // Sample day = FIRST option of each meal type, summed.
  const total = meals.reduce(
    (a, m) => { const t = optionMacroTotals(m.opts[0]!, foods); return { calories: a.calories + t.calories, proteinG: a.proteinG + t.proteinG, carbsG: a.carbsG + t.carbsG, fatG: a.fatG + t.fatG }; },
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
  // Per-meal calorie range across ALL that meal's options (shows the coach the
  // variability the client can pick within, e.g. "Lunch 520–740 kcal").
  const ranges = meals.map((m) => {
    const cals = m.opts.map((o) => optionMacroTotals(o, foods).calories);
    return { type: m.type, min: Math.min(...cals), max: Math.max(...cals) };
  });

  const target = targets?.targetCalories;
  const delta = target ? total.calories - target : 0;
  const onTarget = target ? Math.abs(delta) <= target * 0.05 : false;
  const over = delta > 0;
  const deltaTone = onTarget ? "success" : over ? "warning" : "neutral";
  const deltaLabel = !target ? null : onTarget ? "On target" : `${fmtEnergy(Math.abs(delta), units)} ${over ? "over" : "under"}`;

  return (
    <Card className="space-y-4 p-4">
      <Eyebrow action={<Badge tone="neutral">{meals.length} meal{meals.length > 1 ? "s" : ""}</Badge>}>Daily plan health</Eyebrow>
      <div className="flex items-center gap-4">
        {target ? (
          <ProgressRing
            size={104}
            strokeWidth={10}
            progress={total.calories / target}
            tone={over && !onTarget ? "warning" : "calories"}
            softTrack
            value={fmtEnergy(total.calories, units, false)}
            label="Sample day"
            sublabel={`of ${fmtEnergy(target, units)}`}
          />
        ) : (
          <div className="flex shrink-0 flex-col items-center justify-center gap-1 rounded-2xl bg-surface-2 px-5 py-4 text-center">
            <Flame className="size-5" style={{ color: toneVar.calories }} />
            <span className="numeral text-2xl font-bold leading-none">{fmtEnergy(total.calories, units, false)}</span>
            <span className="text-xs font-medium text-muted-foreground">Sample day</span>
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <MacroBar
            proteinG={total.proteinG}
            carbsG={total.carbsG}
            fatG={total.fatG}
            targets={target ? { proteinG: targets?.targetProteinG, carbsG: targets?.targetCarbsG, fatG: targets?.targetFatG } : null}
          />
          {deltaLabel && (
            <div className="flex justify-end"><Badge tone={deltaTone}>{deltaLabel}</Badge></div>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Eyebrow>Per-meal range</Eyebrow>
        {ranges.map((r) => (
          <div key={r.type} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-1.5 capitalize text-muted-foreground [&_svg]:size-3.5">
              <Flame style={{ color: toneVar.calories }} /> {r.type.replace("_", " ")}
            </span>
            <span className="numeral font-medium text-calories">
              {r.min === r.max ? fmtEnergy(r.min, units) : `${fmtEnergy(r.min, units, false)}–${fmtEnergy(r.max, units)}`}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** One food in an option: identity + live scaled macros, one-tap serving presets,
 *  and an exact-amount field. Portion math is shared (`scaleFood`/`servingsToQuantity`). */
function FoodPortionRow({ mf, name, food, onQty, onRemove }: { mf: MealFood; name: string; food?: FoodLike; onQty: (q: number) => void; onRemove: () => void }) {
  const units = useUnits();
  const scaled = food ? scaleFood({ servingSize: food.servingSize, calories: food.caloriesPerServing, proteinG: food.proteinG, carbsG: food.carbsG, fatG: food.fatG }, mf.quantity) : null;
  const serving = food?.servingSize ?? 0;
  return (
    <div className="space-y-2.5 border-t border-border/50 pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-3">
        <FoodThumb size={34} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium leading-tight">{name}</div>
          {scaled ? (
            <MacroInline proteinG={scaled.proteinG} carbsG={scaled.carbsG} fatG={scaled.fatG} className="mt-0.5 text-[0.7rem]" />
          ) : (
            <div className="mt-0.5 text-[0.7rem] text-muted-foreground">Macros update after saving</div>
          )}
        </div>
        {scaled && <div className="numeral shrink-0 text-sm font-semibold text-calories">{fmtEnergy(scaled.calories, units)}</div>}
        <button onClick={onRemove} aria-label="Remove food" className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-3 hover:text-danger [&_svg]:size-3.5"><X /></button>
      </div>
      <div className="space-y-2 pl-[calc(34px+0.75rem)]">
        {serving > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {SERVING_PRESETS.map((mult) => {
              const q = servingsToQuantity(serving, mult);
              return <Chip key={mult} selected={Math.abs(mf.quantity - q) < 0.05} onClick={() => onQty(q)} className="h-8 px-3 text-xs">{mult}×</Chip>;
            })}
          </div>
        )}
        <Field label={`Amount (${mf.unit})`} type="number" inputMode="decimal" value={mf.quantity} onChange={(e) => onQty(Number(e.target.value))} className="max-w-[10rem]" />
      </div>
    </div>
  );
}

/** The tenant's live accent colour as #rrggbb (from the applied --primary). */
const accentHex = (): string => { try { return colorToHex(getComputedStyle(document.documentElement).getPropertyValue("--primary").trim()); } catch { return "#10b981"; } };

/** Per-option plated-meal photo — an appetizing AI render of the option's foods. */
function MealImage({ mealName, foodNames, value, onChange }: { mealName: string; foodNames: string[]; value?: string | null; onChange: (url: string | null) => void }) {
  // `/api/ai/generate-image` is gated on aiSuite.
  const canAi = useCan("aiSuite");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const gen = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.post<{ url: string }>("/api/ai/generate-image", { feature: "meal-image", subject: mealName.trim() || "a healthy meal", hint: foodNames.length ? `made of ${foodNames.slice(0, 6).join(", ")}` : "", brandColor: accentHex() });
      onChange(r.url);
    } catch (e) {
      setErr(e instanceof ApiError && e.message.toLowerCase().includes("credit") ? "Out of AI credits." : "Couldn't generate — try again.");
    } finally { setBusy(false); }
  };
  if (value) {
    return (
      <div className="relative overflow-hidden rounded-xl">
        <img src={value} alt="" className="h-24 w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
        <div className="absolute right-2 top-2 flex gap-1.5">
          {canAi && <button onClick={() => void gen()} disabled={busy} className="inline-flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md transition-colors hover:bg-black/70 [&_svg]:size-3.5"><AiAvatar className="size-3.5" /> {busy ? "…" : "Redo"}</button>}
          <button onClick={() => onChange(null)} aria-label="Remove photo" className="grid size-7 place-items-center rounded-full bg-black/50 text-white backdrop-blur-md transition-colors hover:bg-black/70 [&_svg]:size-3.5"><X /></button>
        </div>
      </div>
    );
  }
  if (!canAi) return null;
  return (
    <>
      <button onClick={() => void gen()} disabled={busy} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface-3 text-xs text-muted-foreground transition-colors hover:bg-surface-2 disabled:opacity-50 [&_svg]:size-3.5">
        {busy ? <><span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> Plating…</> : <><AiAvatar className="size-3.5" /> Generate plated-meal photo</>}
      </button>
      {err && <p className="text-xs text-warning">{err}</p>}
    </>
  );
}

/** Pick a saved meal template to seed the draft with. Fetches on open; each row
 *  shows the template name + its option count. Picking hands the body up. */
function SeedTemplateSheet({ onClose, onPick }: { onClose: () => void; onPick: (body: MealBody, name: string) => void }) {
  const [templates, setTemplates] = useState<{ id: string; name: string; description?: string | null; body: MealBody }[] | null>(null);
  useEffect(() => {
    let alive = true;
    api.get<{ templates: { id: string; name: string; description?: string | null; body: MealBody }[] }>("/api/meal-templates")
      .then((r) => { if (alive) setTemplates(r.templates ?? []); })
      .catch(() => { if (alive) setTemplates([]); });
    return () => { alive = false; };
  }, []);
  return (
    <Sheet open onClose={onClose} title="Start from a template">
      <p className="mb-3 text-sm text-muted-foreground">Loads a saved template into this draft, replacing the current meals.</p>
      {templates === null ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : templates.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">No templates yet — save one from a plan's builder.</p>
      ) : (
        <div className="max-h-96 space-y-1.5 overflow-y-auto">
          {templates.map((t) => {
            const n = t.body.mealOptions?.length ?? 0;
            return (
              <button key={t.id} onClick={() => onPick(t.body, t.name)} className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card p-3 text-left transition-colors hover:bg-surface-2">
                <IconBadge icon={LayoutGrid} tone="nutrition" size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{t.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{n} option{n === 1 ? "" : "s"}{t.description ? ` · ${t.description}` : ""}</div>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}

function AiMealSheet({ onClose, onRun }: { onClose: () => void; onRun: (i: string) => Promise<string[]> }) {
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [dropped, setDropped] = useState<string[] | null>(null);
  const run = async () => { setBusy(true); setErr(null); setDropped(null); try { const d = await onRun(instructions); if (d.length) setDropped(d); } catch (e) { setErr(e); } finally { setBusy(false); } };
  return (
    <Sheet open onClose={onClose} title="AI meal draft">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Drafts meal options from this client's targets, body and dietary preferences — every food comes from your library. You'll review before publishing.</p>
        <Field label="Instructions (optional)" icon={PencilLine} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. high-protein, no dairy, 4 meals" />
        <Button size="lg" className="w-full" disabled={busy} onClick={() => void run()}>{busy ? "Drafting…" : "Generate options"}</Button>
        {dropped ? <div className="rounded-xl border border-border/60 bg-surface-2 p-3 text-xs text-muted-foreground">Options added. {dropped.length} suggested food{dropped.length === 1 ? "" : "s"} weren't in your library and {dropped.length === 1 ? "was" : "were"} skipped: {dropped.join(", ")}. Add {dropped.length === 1 ? "it" : "them"} to your library to include next time.</div> : null}
        {err ? <AiErrorBox error={err} /> : null}
      </div>
    </Sheet>
  );
}
