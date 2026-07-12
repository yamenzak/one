/** Meal plan builder — bank-of-options with live macro totals + free meals. */

import { useCallback, useEffect, useState } from "react";
import type { MealBody, MealOption } from "@mossa/protocol";
import { optionMacroTotals, type FoodLike } from "@mossa/protocol";
import { fmtEnergy } from "@mossa/domain";
import { Button, Card, Badge, Field, Sheet, Skeleton, SubCard, MacroInline, Page, Stagger, ArrowLeft, Plus, Sparkles, Utensils, X } from "@mossa/ui";
import { api } from "../../api.js";
import { AiErrorBox } from "../../AiError.js";
import { useUnits } from "../../units.js";
import { FoodSearchSheet } from "../client/FoodSearchSheet.js";

interface Plan { id: string; clientId: string; name: string; status: string; body: MealBody; targetGoal?: { targets?: Record<string, number> | null } | null }
interface FoodRow { id: string; name: string; serving_size: number; calories: number; protein_g: number; carbs_g: number; fat_g: number }
const BUILTIN_TYPES = ["breakfast", "lunch", "dinner", "snack", "pre_workout", "post_workout"];

export function MealBuilder({ planId, onBack }: { planId: string; onBack: () => void }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [options, setOptions] = useState<MealOption[]>([]);
  const [customTypes, setCustomTypes] = useState<{ label: string }[]>([]);
  const [foods, setFoods] = useState<Map<string, FoodLike>>(new Map());
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [foodPicker, setFoodPicker] = useState<{ optIdx: number } | null>(null);
  const units = useUnits();
  const [aiOpen, setAiOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [newType, setNewType] = useState("");

  const load = useCallback(async () => {
    const [p, f] = await Promise.all([api.get<{ plan: Plan }>(`/api/meal-plans/${planId}`), api.get<{ foods: FoodRow[] }>("/api/foods")]);
    setPlan(p.plan); setOptions(p.plan.body.mealOptions ?? []); setCustomTypes(p.plan.body.customMealTypes ?? []);
    setFoods(new Map(f.foods.map((x) => [x.id, { id: x.id, servingSize: x.serving_size, caloriesPerServing: x.calories, proteinG: x.protein_g, carbsG: x.carbs_g, fatG: x.fat_g }])));
    setNames(new Map(f.foods.map((x) => [x.id, x.name])));
  }, [planId]);
  useEffect(() => void load(), [load]);
  const nameOf = useCallback((id: string) => names.get(id) ?? "Food", [names]);

  const mutate = (fn: (d: MealOption[]) => void) => { const next = structuredClone(options); fn(next); setOptions(next); setDirty(true); };
  const save = async () => { setSaving(true); try { await api.patch(`/api/meal-plans/${planId}`, { body: { customMealTypes: customTypes, mealOptions: options } }); setDirty(false); } finally { setSaving(false); } };
  const publish = async () => { await save(); await api.post(`/api/meal-plans/${planId}/publish`); await load(); };
  const addCustomType = () => { const label = newType.trim(); if (label && !customTypes.some((t) => t.label === label)) { setCustomTypes((p) => [...p, { label }]); setDirty(true); } setNewType(""); setTypeOpen(false); };
  const runAi = async (instructions: string) => {
    if (!plan) return;
    const res = await api.post<{ draft: MealBody }>("/api/ai/draft-meal", { clientId: plan.clientId, instructions });
    setOptions((prev) => [...prev, ...(res.draft.mealOptions ?? [])]); setDirty(true); setAiOpen(false);
  };

  if (!plan) return <Skeleton className="m-4 h-96" />;
  const byType = new Map<string, { opt: MealOption; idx: number }[]>();
  options.forEach((opt, idx) => byType.set(opt.mealType, [...(byType.get(opt.mealType) ?? []), { opt, idx }]));
  const targets = plan.targetGoal?.targets ?? null;
  const allTypes = [...BUILTIN_TYPES, ...customTypes.map((t) => t.label)];

  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-32">
      <div className="flex items-center gap-3">
        <Button size="icon" variant="secondary" onClick={onBack}><ArrowLeft /></Button>
        <h1 className="flex-1 truncate text-xl font-bold tracking-tight">{plan.name}</h1>
        <Badge tone={plan.status === "published" ? "success" : "neutral"}>{plan.status}</Badge>
      </div>

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
          <Card key={type} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold capitalize">{type.replace("_", " ")}</h2>
              <button onClick={() => mutate((d) => d.push({ mealType: type, mealName: `Option ${opts.length + 1}`, isFree: false, foods: [] }))} className="text-sm font-medium text-primary">+ Option</button>
            </div>
            {opts.length === 0 && <p className="text-sm text-muted-foreground">No options yet.</p>}
            {opts.map(({ opt, idx }) => {
              const t = optionMacroTotals(opt, foods);
              return (
                <SubCard key={idx} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input value={opt.mealName} placeholder="Option name" onChange={(e) => mutate((d) => (d[idx]!.mealName = e.target.value))} className="flex-1 rounded-lg bg-surface-3 px-3 py-2 text-sm outline-none" />
                    <button onClick={() => mutate((d) => d.splice(idx, 1))} className="text-muted-foreground hover:text-danger [&_svg]:size-4"><X /></button>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <button onClick={() => mutate((d) => { d[idx]!.isFree = !d[idx]!.isFree; if (d[idx]!.isFree) d[idx]!.foods = []; })} className={`rounded-full px-3 py-1 ${opt.isFree ? "bg-nutrition-soft text-nutrition" : "bg-surface-3 text-muted-foreground"}`}>Free meal</button>
                    <span className="numeral ml-auto flex items-center gap-2"><span className="text-calories">{fmtEnergy(t.calories, units)}</span><MacroInline proteinG={t.proteinG} carbsG={t.carbsG} fatG={t.fatG} /></span>
                  </div>
                  {opt.isFree ? (
                    <input type="number" placeholder="Max calories" value={opt.freeMealMaxCalories ?? ""} onChange={(e) => mutate((d) => (d[idx]!.freeMealMaxCalories = e.target.value ? Number(e.target.value) : null))} className="w-full rounded-lg bg-surface-3 px-3 py-2 text-sm outline-none" />
                  ) : (
                    <>
                      {opt.foods.map((mf, fi) => (
                        <div key={fi} className="flex items-center gap-2 text-sm">
                          <span className="flex-1 truncate">{nameOf(mf.foodId)}</span>
                          <input type="number" value={mf.quantity} onChange={(e) => mutate((d) => (d[idx]!.foods[fi]!.quantity = Number(e.target.value)))} className="w-16 rounded-lg bg-surface-3 px-2 py-1 outline-none" />
                          <span className="text-xs text-muted-foreground">{mf.unit}</span>
                          <button onClick={() => mutate((d) => d[idx]!.foods.splice(fi, 1))} className="text-muted-foreground hover:text-danger [&_svg]:size-3.5"><X /></button>
                        </div>
                      ))}
                      <button onClick={() => setFoodPicker({ optIdx: idx })} className="text-xs font-medium text-primary">+ Food</button>
                    </>
                  )}
                </SubCard>
              );
            })}
          </Card>
        );
      })}
      </Stagger>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/40 bg-background/90 p-3 backdrop-blur-xl md:pl-24">
        <div className="mx-auto flex max-w-xl gap-3">
          <Button variant="outline" className="flex-1" disabled={!dirty || saving} onClick={() => void save()}>{saving ? "Saving…" : dirty ? "Save draft" : "Saved"}</Button>
          <Button className="flex-1" onClick={() => void publish()}>{plan.status === "published" ? "Re-publish" : "Publish"}</Button>
        </div>
      </div>

      {foodPicker && <FoodSearchSheet onClose={() => setFoodPicker(null)} onPick={(id, name) => { mutate((d) => d[foodPicker.optIdx]!.foods.push({ foodId: id, quantity: 100, unit: "g" })); setNames((p) => new Map(p).set(id, name)); setFoodPicker(null); }} />}
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

