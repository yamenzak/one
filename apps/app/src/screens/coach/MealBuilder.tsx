/** Meal plan builder — bank-of-options with live macro totals + free meals. */

import { useCallback, useEffect, useState } from "react";
import type { MealBody, MealOption, MealFood } from "@mossa/protocol";
import { optionMacroTotals, type FoodLike } from "@mossa/protocol";
import { fmtEnergy, scaleFood, servingsToQuantity, SERVING_PRESETS } from "@mossa/domain";
import { Button, Card, Badge, Field, Sheet, Skeleton, SubCard, MacroInline, Chip, Page, Stagger, Reveal, SkeletonLine, SkeletonRow, colorToHex, cn, ArrowLeft, Plus, Sparkles, Utensils, History, X } from "@mossa/ui";
import { api, ApiError } from "../../api.js";
import { ClientPrefsStrip } from "./ClientPrefsStrip.js";
import { AiErrorBox } from "../../AiError.js";
import { useUnits } from "../../units.js";
import { FoodSearchSheet } from "../client/FoodSearchSheet.js";
import { FoodThumb } from "../food.js";

/** Client daily targets (flat shape, as stored on the active goal). */
interface Targets { targetCalories?: number; targetProteinG?: number; targetCarbsG?: number; targetFatG?: number }
interface Plan { id: string; clientId: string; name: string; status: string; body: MealBody; targetGoal?: Record<string, unknown> | null }
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
  const [foods, setFoods] = useState<Map<string, FoodLike>>(new Map());
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [targets, setTargets] = useState<Targets | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [foodPicker, setFoodPicker] = useState<{ optIdx: number } | null>(null);
  const units = useUnits();
  const [aiOpen, setAiOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [newType, setNewType] = useState("");

  const foodsFromRows = (rows: FoodRow[]): Map<string, FoodLike> =>
    new Map(rows.map((x) => [x.id, { id: x.id, servingSize: x.serving_size, caloriesPerServing: x.calories, proteinG: x.protein_g, carbsG: x.carbs_g, fatG: x.fat_g }]));

  const load = useCallback(async () => {
    const [p, f] = await Promise.all([api.get<{ plan: Plan }>(`/api/meal-plans/${planId}`), api.get<{ foods: FoodRow[] }>("/api/foods?scope=all")]);
    setPlan(p.plan); setOptions(p.plan.body.mealOptions ?? []); setCustomTypes(p.plan.body.customMealTypes ?? []);
    setFoods(foodsFromRows(f.foods));
    setNames(new Map(f.foods.map((x) => [x.id, x.name])));
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

  const mutate = (fn: (d: MealOption[]) => void) => { const next = structuredClone(options); fn(next); setOptions(next); setDirty(true); };
  const save = async () => { setSaving(true); try { await api.patch(`/api/meal-plans/${planId}`, { body: { customMealTypes: customTypes, mealOptions: options } }); setDirty(false); } finally { setSaving(false); } };
  const publish = async () => { await save(); await api.post(`/api/meal-plans/${planId}/publish`); await load(); };
  // Superseded/archived plans are read-only (PATCH 409s). "Make active" re-publishes
  // WITHOUT a save first (which would 409); rollback returns it to an editable draft.
  const makeActive = async () => { await api.post(`/api/meal-plans/${planId}/publish`); await load(); };
  const rollback = async () => { await api.post(`/api/meal-plans/${planId}/status`, { status: "draft" }); await load(); };
  const addCustomType = () => { const label = newType.trim(); if (label && !customTypes.some((t) => t.label === label)) { setCustomTypes((p) => [...p, { label }]); setDirty(true); } setNewType(""); setTypeOpen(false); };
  const runAi = async (instructions: string) => {
    if (!plan) return;
    const res = await api.post<{ draft: MealBody }>("/api/ai/draft-meal", { clientId: plan.clientId, instructions });
    setOptions((prev) => [...prev, ...(res.draft.mealOptions ?? [])]); setDirty(true); setAiOpen(false);
    void refreshFoods();
  };

  const readOnly = plan?.status === "superseded" || plan?.status === "archived";
  const byType = new Map<string, { opt: MealOption; idx: number }[]>();
  options.forEach((opt, idx) => byType.set(opt.mealType, [...(byType.get(opt.mealType) ?? []), { opt, idx }]));
  const allTypes = [...BUILTIN_TYPES, ...customTypes.map((t) => t.label)];

  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-32">
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
        <h1 className="flex-1 truncate text-xl font-bold tracking-tight">{plan.name}</h1>
        <Badge tone={plan.status === "published" ? "success" : "neutral"}>{plan.status}</Badge>
      </div>

      <ClientPrefsStrip clientId={plan.clientId} focus="meal" />

      {targets?.targetCalories ? (
        <Card className="flex items-center justify-between py-3 text-sm">
          <span className="text-muted-foreground">Daily target</span>
          <span className="numeral flex items-center gap-2 font-medium"><span className="text-calories">{fmtEnergy(targets.targetCalories, units)}</span><MacroInline proteinG={targets.targetProteinG ?? 0} carbsG={targets.targetCarbsG ?? 0} fatG={targets.targetFatG ?? 0} /></span>
        </Card>
      ) : null}

      <div className="flex gap-2">
        <Button variant="tonal" className="flex-1" onClick={() => setAiOpen(true)}><Sparkles /> AI meal draft</Button>
        <Button variant="secondary" onClick={() => setTypeOpen(true)}><Plus /> Meal type</Button>
      </div>

      <Stagger className="space-y-4">
      {allTypes.map((type) => {
        const opts = byType.get(type) ?? [];
        return (
          <Card key={type} className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold capitalize">{type.replace("_", " ")}</h2>
              <button onClick={() => mutate((d) => d.push({ mealType: type, mealName: `Option ${opts.length + 1}`, isFree: false, foods: [] }))} className="inline-flex items-center gap-1 text-sm font-medium text-primary [&_svg]:size-4"><Plus /> Option</button>
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
                        <button onClick={() => setFoodPicker({ optIdx: idx })} className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-xs font-medium text-primary transition-colors hover:bg-surface-3 [&_svg]:size-4"><Plus /> Add food</button>
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
        <div className="mx-auto max-w-xl space-y-2">
          {readOnly && (
            <div className="flex items-center gap-2 rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning [&_svg]:size-3.5"><History /> This plan is {plan.status} — read-only. Roll it back to a draft to edit, or make it active again.</div>
          )}
          <div className="flex gap-3">
            {readOnly ? (
              <>
                <Button variant="outline" className="flex-1" onClick={() => void rollback()}>Roll back to draft</Button>
                <Button className="flex-1" onClick={() => void makeActive()}>Make active</Button>
              </>
            ) : (
              <>
                <Button variant="outline" className="flex-1" disabled={!dirty || saving} onClick={() => void save()}>{saving ? "Saving…" : dirty ? "Save draft" : "Saved"}</Button>
                <Button className="flex-1" onClick={() => void publish()}>{plan.status === "published" ? "Re-publish" : "Publish"}</Button>
              </>
            )}
          </div>
        </div>
      </div>
        </>
        )}
      </Reveal>

      {foodPicker && <FoodSearchSheet onClose={() => setFoodPicker(null)} onPick={(id, name) => { mutate((d) => d[foodPicker.optIdx]!.foods.push({ foodId: id, quantity: 100, unit: "g" })); setNames((p) => new Map(p).set(id, name)); setFoodPicker(null); void refreshFoods(); }} />}
      {aiOpen && <AiMealSheet onClose={() => setAiOpen(false)} onRun={runAi} />}
      <Sheet open={typeOpen} onClose={() => setTypeOpen(false)} title="New meal type">
        <div className="space-y-4">
          <Field label="Name" icon={Utensils} value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="e.g. Second breakfast" autoFocus />
          <Button size="lg" className="w-full" disabled={newType.trim().length < 2} onClick={addCustomType}>Add meal type</Button>
        </div>
      </Sheet>
    </Page>
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
          <button onClick={() => void gen()} disabled={busy} className="inline-flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md transition-colors hover:bg-black/70 [&_svg]:size-3.5"><Sparkles /> {busy ? "…" : "Redo"}</button>
          <button onClick={() => onChange(null)} aria-label="Remove photo" className="grid size-7 place-items-center rounded-full bg-black/50 text-white backdrop-blur-md transition-colors hover:bg-black/70 [&_svg]:size-3.5"><X /></button>
        </div>
      </div>
    );
  }
  return (
    <>
      <button onClick={() => void gen()} disabled={busy} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface-3 text-xs text-muted-foreground transition-colors hover:bg-surface-2 disabled:opacity-50 [&_svg]:size-3.5">
        {busy ? <><span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> Plating…</> : <><Sparkles /> Generate plated-meal photo</>}
      </button>
      {err && <p className="text-xs text-warning">{err}</p>}
    </>
  );
}

function AiMealSheet({ onClose, onRun }: { onClose: () => void; onRun: (i: string) => Promise<void> }) {
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const run = async () => { setBusy(true); setErr(null); try { await onRun(instructions); } catch (e) { setErr(e); } finally { setBusy(false); } };
  return (
    <Sheet open onClose={onClose} title="AI meal draft">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Drafts meal options from this client's targets and intake. You'll fill exact foods and review before publishing.</p>
        <Field label="Instructions (optional)" icon={Sparkles} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. high-protein, no dairy, 4 meals" />
        <Button size="lg" className="w-full" disabled={busy} onClick={() => void run()}>{busy ? "Drafting…" : "Generate options"}</Button>
        {err ? <AiErrorBox error={err} /> : null}
      </div>
    </Sheet>
  );
}
