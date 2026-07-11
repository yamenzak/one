/** Eat tab — the nutrition diary: intake vs target, meals, per-entry macros. */

import { useCallback, useEffect, useState } from "react";
import { fmtEnergy } from "@mossa/domain";
import {
  Button, Card, Field, Chip, Sheet, Skeleton, IconBadge, MacroBar, MacroInline, MetricChip, METRICS, toneSoft, Page, Stagger, EmptyState,
  Plus, ClipboardList, Utensils, Croissant, Soup, Apple, Dumbbell, Trash2, type LucideIcon,
} from "@mossa/ui";
import type { UnitPrefs } from "@mossa/domain";
import { api, todayLocal } from "../../api.js";
import { useUnits } from "../../units.js";
import { FoodSearchSheet } from "./FoodSearchSheet.js";
import { MealPlanDrawer } from "./MealPlanDrawer.js";

interface Entry { id: string; meal_type: string; label: string | null; calories: number; protein_g: number; carbs_g: number; fat_g: number; quantity: number | null; unit: string | null; image_url: string | null }
interface Targets { targetCalories?: number; targetProteinG?: number; targetCarbsG?: number; targetFatG?: number }

const MEAL_META: Record<string, { label: string; icon: LucideIcon }> = {
  breakfast: { label: "Breakfast", icon: Croissant },
  lunch: { label: "Lunch", icon: Soup },
  dinner: { label: "Dinner", icon: Utensils },
  snack: { label: "Snack", icon: Apple },
  pre_workout: { label: "Pre-workout", icon: Dumbbell },
  post_workout: { label: "Post-workout", icon: Dumbbell },
  free: { label: "Free meal", icon: Utensils },
};
const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack", "pre_workout", "post_workout", "free"];
const metaFor = (m: string) => MEAL_META[m] ?? { label: m.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()), icon: Utensils };

export function Eat({ clientId }: { clientId: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [targets, setTargets] = useState<Targets | null>(null);
  const [logMeal, setLogMeal] = useState<string | undefined>(undefined);
  const [logOpen, setLogOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [edit, setEdit] = useState<Entry | null>(null);
  const units = useUnits();
  const date = todayLocal();

  const load = useCallback(async () => {
    const [e, today] = await Promise.all([
      api.get<{ entries: Entry[] }>(`/api/logs/food?clientId=${clientId}&date=${date}`),
      api.get<{ goal: { targets: Targets | null } | null }>(`/api/today?clientId=${clientId}&date=${date}`),
    ]);
    setEntries(e.entries); setTargets(today.goal?.targets ?? null);
  }, [clientId, date]);
  useEffect(() => void load(), [load]);

  const openLog = (meal?: string) => { setLogMeal(meal); setLogOpen(true); };

  if (!entries) return <Skeleton className="m-4 h-64" />;

  const byMeal = new Map<string, Entry[]>();
  for (const e of entries) byMeal.set(e.meal_type, [...(byMeal.get(e.meal_type) ?? []), e]);
  const meals = [...MEAL_ORDER.filter((m) => byMeal.has(m)), ...[...byMeal.keys()].filter((m) => !MEAL_ORDER.includes(m))];
  const sum = (f: (e: Entry) => number) => entries.reduce((n, e) => n + (f(e) || 0), 0);
  const total = sum((e) => e.calories);
  const calTarget = targets?.targetCalories ?? 0;
  const pct = calTarget > 0 ? total / calTarget : 0;
  const remaining = calTarget - total;

  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <h1 className="text-2xl font-bold tracking-tight">Eat</h1>

      {/* Intake vs target */}
      <Stagger>
        <Card className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-sm text-muted-foreground">Today's intake</div>
              <div className="numeral mt-0.5 text-3xl font-bold leading-none">
                {fmtEnergy(total, units)}
                {calTarget > 0 && <span className="ml-1.5 text-base font-medium text-muted-foreground">of {fmtEnergy(calTarget, units)}</span>}
              </div>
            </div>
            {calTarget > 0 && (
              <MetricChip metric="calories" value={remaining >= 0 ? `${fmtEnergy(remaining, units, false)} left` : `${fmtEnergy(-remaining, units, false)} over`} />
            )}
          </div>
          {calTarget > 0 && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
              <div className={`h-full rounded-full transition-all ${remaining < 0 ? "bg-danger" : "bg-calories"}`} style={{ width: `${Math.min(100, Math.max(2, pct * 100))}%` }} />
            </div>
          )}
          <MacroBar
            proteinG={sum((e) => e.protein_g)}
            carbsG={sum((e) => e.carbs_g)}
            fatG={sum((e) => e.fat_g)}
            targets={targets ? { proteinG: targets.targetProteinG, carbsG: targets.targetCarbsG, fatG: targets.targetFatG } : null}
          />
        </Card>
      </Stagger>

      {entries.length === 0 ? (
        <EmptyState icon={Utensils} title="Nothing logged today" description="Log your first meal — search, barcode, snap a photo, or your plan." action={<Button onClick={() => openLog()}><Plus /> Log food</Button>} />
      ) : (
        <Stagger className="space-y-3">
          {meals.map((meal) => {
            const list = byMeal.get(meal)!;
            const meta = metaFor(meal);
            const mealCal = list.reduce((n, e) => n + e.calories, 0);
            return (
              <Card key={meal} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5"><IconBadge icon={meta.icon} tone="nutrition" size="sm" /><span className="font-semibold">{meta.label}</span></div>
                  <span className="numeral text-sm font-semibold text-calories">{fmtEnergy(mealCal, units)}</span>
                </div>
                <div className="divide-y divide-border/40">
                  {list.map((e) => (
                    <button key={e.id} onClick={() => setEdit(e)} className="flex w-full items-center gap-3 py-2.5 text-left transition-colors active:opacity-70">
                      <div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-2">
                        {e.image_url ? <img src={e.image_url} alt="" className="size-full object-cover" /> : <Utensils className="size-4 text-muted-foreground" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{e.label ?? "Food"}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          {e.quantity ? <span className="numeral shrink-0">{Math.round(e.quantity)} {e.unit ?? "g"}</span> : null}
                          <MacroInline proteinG={e.protein_g} carbsG={e.carbs_g} fatG={e.fat_g} className="text-[0.7rem]" />
                        </div>
                      </div>
                      <span className="numeral shrink-0 text-sm">{fmtEnergy(e.calories, units)}</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => openLog(meal)} className="pt-0.5 text-xs font-semibold text-primary">+ Add to {meta.label.toLowerCase()}</button>
              </Card>
            );
          })}
        </Stagger>
      )}

      <div className="flex gap-3">
        <Button size="lg" className="flex-1" onClick={() => openLog()}><Plus /> Log food</Button>
        <Button size="lg" variant="tonal" className="flex-1" onClick={() => setPlanOpen(true)}><ClipboardList /> My plan</Button>
      </div>

      {logOpen && <FoodSearchSheet clientId={clientId} mealType={logMeal} onClose={() => setLogOpen(false)} onLogged={() => void load()} />}
      {planOpen && <MealPlanDrawer clientId={clientId} onClose={() => setPlanOpen(false)} onLogged={() => void load()} />}
      {edit && <EditEntrySheet entry={edit} clientId={clientId} units={units} onClose={() => setEdit(null)} onSaved={() => void load()} />}
    </Page>
  );
}

const EDIT_MEALS = ["breakfast", "lunch", "dinner", "snack", "pre_workout", "post_workout"];

function EditEntrySheet({ entry, clientId, units, onClose, onSaved }: { entry: Entry; clientId: string; units: UnitPrefs; onClose: () => void; onSaved: () => void }) {
  const [qty, setQty] = useState(entry.quantity != null ? String(entry.quantity) : "");
  const [meal, setMeal] = useState(entry.meal_type);
  const [busy, setBusy] = useState(false);
  const scalable = entry.quantity != null && entry.quantity > 0;
  const factor = scalable && qty ? Number(qty) / entry.quantity! : 1;
  const s = (v: number) => Math.round(v * factor);

  const save = async () => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { clientId, mealType: meal };
      if (scalable && qty) { body.quantity = Number(qty); body.calories = s(entry.calories); body.proteinG = s(entry.protein_g); body.carbsG = s(entry.carbs_g); body.fatG = s(entry.fat_g); }
      await api.patch(`/api/logs/food/${entry.id}`, body);
      onSaved(); onClose();
    } finally { setBusy(false); }
  };
  const remove = async () => { setBusy(true); try { await api.del(`/api/logs/food/${entry.id}?clientId=${clientId}`); onSaved(); onClose(); } finally { setBusy(false); } };

  return (
    <Sheet open onClose={onClose} title={entry.label ?? "Edit food"}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface-2">
            {entry.image_url ? <img src={entry.image_url} alt="" className="size-full object-cover" /> : <Utensils className="size-5 text-muted-foreground" />}
          </div>
          <div className="grid grid-cols-4 gap-2 flex-1">
            {([["calories", entry.calories], ["protein", entry.protein_g], ["carbs", entry.carbs_g], ["fat", entry.fat_g]] as const).map(([m, v]) => {
              const M = METRICS[m];
              return <div key={m} className={`flex flex-col items-center gap-0.5 rounded-lg py-1.5 ${toneSoft[M.tone]}`}><M.icon className="size-3.5" /><span className="numeral text-sm font-semibold leading-none">{s(v)}</span></div>;
            })}
          </div>
        </div>

        {scalable && <Field label={`Quantity (${entry.unit ?? "g"})`} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ""))} />}

        <div>
          <div className="mb-1.5 text-sm text-muted-foreground">Meal</div>
          <div className="flex flex-wrap gap-2">{EDIT_MEALS.map((m) => <Chip key={m} selected={meal === m} onClick={() => setMeal(m)}>{metaFor(m).label}</Chip>)}</div>
        </div>

        <div className="flex gap-3">
          <Button variant="ghost" className="text-danger" disabled={busy} onClick={() => void remove()}><Trash2 /> Delete</Button>
          <Button size="lg" className="flex-1" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </Sheet>
  );
}
