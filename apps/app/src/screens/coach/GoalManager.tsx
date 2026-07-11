/** Goal manager — TDEE calculator → server-derived targets with derivation. */

import { useCallback, useEffect, useState } from "react";
import { fmtEnergy, fmtVolume, weightLabel, displayToKg, feetInchesToCm } from "@mossa/domain";
import { Button, Card, Badge, Field, Select, Skeleton, Page, Stagger, METRICS, toneVar, Target, type MetricKey } from "@mossa/ui";
import { api } from "../../api.js";
import { useUnits } from "../../units.js";

interface Goal { id: string; label: string; status: string; targets: Record<string, number> | null; notes?: string | null; created_at: string }

const TARGET_ROWS: { metric: MetricKey; field: string }[] = [
  { metric: "calories", field: "targetCalories" },
  { metric: "protein", field: "targetProteinG" },
  { metric: "carbs", field: "targetCarbsG" },
  { metric: "fat", field: "targetFatG" },
  { metric: "water", field: "targetWaterMl" },
  { metric: "fiber", field: "targetFiberG" },
];

export function GoalManager({ clientId }: { clientId: string }) {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [form, setForm] = useState({ label: "", gender: "male" as "male" | "female", ageYears: "", heightCm: "", heightFt: "", heightIn: "", weightKg: "", activityLevel: "moderate", primaryGoal: "maintain", dietaryApproach: "balanced", weightMin: "", weightMax: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [derivation, setDerivation] = useState<Record<string, unknown> | null>(null);
  const units = useUnits();

  const load = useCallback(async () => { setGoals((await api.get<{ goals: Goal[] }>(`/api/goals?clientId=${clientId}`)).goals); }, [clientId]);
  useEffect(() => void load(), [load]);

  const create = async () => {
    setBusy(true);
    try {
      const heightCm = units.height === "ft_in" ? feetInchesToCm(Number(form.heightFt || 0), Number(form.heightIn || 0)) : Number(form.heightCm);
      const weightKg = displayToKg(Number(form.weightKg), units);
      const ranges = (form.weightMin || form.weightMax) ? { weightKg: { min: form.weightMin ? displayToKg(Number(form.weightMin), units) : null, max: form.weightMax ? displayToKg(Number(form.weightMax), units) : null } } : undefined;
      const res = await api.post<{ derivation: Record<string, unknown> }>("/api/goals", { clientId, label: form.label || "New phase", notes: form.notes || undefined, ranges, calculator: { gender: form.gender, ageYears: Number(form.ageYears), heightCm, weightKg, activityLevel: form.activityLevel, primaryGoal: form.primaryGoal, dietaryApproach: form.dietaryApproach } });
      setDerivation(res.derivation); setForm((f) => ({ ...f, label: "", notes: "", weightMin: "", weightMax: "" })); await load();
    } catch { /* validation surfaces via disabled */ } finally { setBusy(false); }
  };

  if (!goals) return <Skeleton className="m-4 h-64" />;
  const active = goals.find((g) => g.status === "active");
  const history = goals.filter((g) => g.status !== "active");
  const heightOk = units.height === "ft_in" ? form.heightFt : form.heightCm;
  const valid = form.ageYears && heightOk && form.weightKg;

  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      {active?.targets && (
        <Stagger>
          <Card>
            <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Target className="size-4 text-primary" /><h2 className="text-lg font-semibold">{active.label}</h2></div><Badge tone="success">Active</Badge></div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {TARGET_ROWS.map(({ metric, field }) => {
                const m = METRICS[metric];
                const v = active.targets![field];
                const display = v == null ? "—" : metric === "calories" ? fmtEnergy(v, units) : metric === "water" ? fmtVolume(v, units) : `${v} ${m.unit}`;
                return (
                  <div key={metric} className="rounded-xl bg-secondary p-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><m.icon className="size-3.5" style={{ color: toneVar[m.tone] }} /> {m.label}</div>
                    <div className="numeral mt-0.5 text-xl font-semibold">{display}</div>
                  </div>
                );
              })}
            </div>
          </Card>
        </Stagger>
      )}

      <Stagger>
        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">New goal phase</h2>
          <Field label="Phase label" icon={Target} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Cut — 8 weeks" />
          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1.5 block text-sm font-medium text-muted-foreground">Gender</label><Select value={form.gender} onChange={(v) => setForm({ ...form, gender: v })} options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]} /></div>
            <Field label="Age" inputMode="numeric" value={form.ageYears} onChange={(e) => setForm({ ...form, ageYears: e.target.value.replace(/\D/g, "") })} />
            {units.height === "ft_in" ? (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Height (ft)" inputMode="numeric" value={form.heightFt} onChange={(e) => setForm({ ...form, heightFt: e.target.value.replace(/\D/g, "") })} />
                <Field label="(in)" inputMode="numeric" value={form.heightIn} onChange={(e) => setForm({ ...form, heightIn: e.target.value.replace(/\D/g, "") })} />
              </div>
            ) : (
              <Field label="Height (cm)" inputMode="numeric" value={form.heightCm} onChange={(e) => setForm({ ...form, heightCm: e.target.value })} />
            )}
            <Field label={`Weight (${weightLabel(units)})`} inputMode="decimal" value={form.weightKg} onChange={(e) => setForm({ ...form, weightKg: e.target.value })} />
          </div>
          <div><label className="mb-1.5 block text-sm font-medium text-muted-foreground">Activity level</label><Select value={form.activityLevel} onChange={(v) => setForm({ ...form, activityLevel: v })} options={[{ value: "sedentary", label: "Sedentary" }, { value: "light", label: "Lightly active" }, { value: "moderate", label: "Moderately active" }, { value: "very_active", label: "Very active" }]} /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-muted-foreground">Primary goal</label><Select value={form.primaryGoal} onChange={(v) => setForm({ ...form, primaryGoal: v })} options={[{ value: "lose_weight", label: "Lose weight" }, { value: "maintain", label: "Maintain" }, { value: "build_muscle", label: "Build muscle" }, { value: "improve_fitness", label: "Improve fitness" }]} /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-muted-foreground">Dietary approach</label><Select value={form.dietaryApproach} onChange={(v) => setForm({ ...form, dietaryApproach: v })} options={[{ value: "balanced", label: "Balanced" }, { value: "high_protein", label: "High protein" }, { value: "low_carb", label: "Low carb" }, { value: "keto", label: "Keto" }, { value: "vegan", label: "Vegan" }, { value: "vegetarian", label: "Vegetarian" }]} /></div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Weight range min (${weightLabel(units)})`} inputMode="decimal" value={form.weightMin} onChange={(e) => setForm({ ...form, weightMin: e.target.value })} />
            <Field label={`Weight range max (${weightLabel(units)})`} inputMode="decimal" value={form.weightMax} onChange={(e) => setForm({ ...form, weightMax: e.target.value })} />
          </div>
          <Field label="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Context for this phase" />
          <Button size="lg" className="w-full" disabled={!valid || busy} onClick={() => void create()}>{busy ? "Calculating…" : "Set goal + calculate targets"}</Button>
          {derivation && <p className="text-xs text-muted-foreground">{String(derivation.bmrFormula)} · BMR {String(derivation.bmr)} · TDEE {String(derivation.tdee)} kcal</p>}
        </Card>
      </Stagger>

      {history.length > 0 && (
        <Stagger>
          <Card className="space-y-2">
            <h2 className="text-lg font-semibold">Goal history</h2>
            {history.map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-2 border-t border-border/40 pt-2 first:border-0 first:pt-0">
                <div className="min-w-0"><div className="truncate text-sm font-medium">{g.label}</div><div className="numeral text-xs text-muted-foreground">{g.targets?.targetCalories != null ? fmtEnergy(g.targets.targetCalories, units) : "—"} · {new Date(g.created_at).toLocaleDateString()}</div></div>
                <Badge tone="neutral">{g.status}</Badge>
              </div>
            ))}
          </Card>
        </Stagger>
      )}
    </Page>
  );
}
