/**
 * Goal manager (SPEC §8.2) — set a phase with the TDEE calculator. The server
 * derives targets from the inputs and returns the full derivation to explain
 * every number.
 */

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Chip, Field, Skeleton } from "@mossa/ui";
import { api } from "../../api.js";

interface Goal {
  id: string;
  label: string;
  status: string;
  targets: Record<string, number> | null;
  created_at: string;
}

export function GoalManager({ clientId }: { clientId: string }) {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [form, setForm] = useState({
    label: "",
    gender: "male" as "male" | "female",
    ageYears: "",
    heightCm: "",
    weightKg: "",
    activityLevel: "moderate",
    primaryGoal: "maintain",
    dietaryApproach: "balanced",
  });
  const [busy, setBusy] = useState(false);
  const [lastDerivation, setLastDerivation] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    const r = await api.get<{ goals: Goal[] }>(`/api/goals?clientId=${clientId}`);
    setGoals(r.goals);
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ derivation: Record<string, unknown> }>("/api/goals", {
        clientId,
        label: form.label || "New phase",
        calculator: {
          gender: form.gender,
          ageYears: Number(form.ageYears),
          heightCm: Number(form.heightCm),
          weightKg: Number(form.weightKg),
          activityLevel: form.activityLevel,
          primaryGoal: form.primaryGoal,
          dietaryApproach: form.dietaryApproach,
        },
      });
      setLastDerivation(res.derivation);
      await load();
    } catch {
      /* validation errors surface via disabled button; keep it simple */
    } finally {
      setBusy(false);
    }
  };

  if (!goals) return <Skeleton className="m-4 h-64" />;
  const active = goals.find((g) => g.status === "active");
  const valid = form.ageYears && form.heightCm && form.weightKg;

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      {active?.targets && (
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{active.label}</h2>
            <Chip tone="good">Active</Chip>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <Target label="Calories" value={active.targets.targetCalories} unit="kcal" />
            <Target label="Protein" value={active.targets.targetProteinG} unit="g" />
            <Target label="Carbs" value={active.targets.targetCarbsG} unit="g" />
            <Target label="Fat" value={active.targets.targetFatG} unit="g" />
            <Target label="Water" value={active.targets.targetWaterMl} unit="ml" />
            <Target label="Fiber" value={active.targets.targetFiberG} unit="g" />
          </div>
        </Card>
      )}

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">New goal phase</h2>
        <Field label="Phase label" icon="🎯" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Cut — 8 weeks" />
        <div className="grid grid-cols-2 gap-3">
          <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as "male" | "female" })} className="rounded-[--radius-field] border border-fg-muted/40 bg-transparent px-4 py-3">
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
          <Field label="Age" icon="🎂" inputMode="numeric" value={form.ageYears} onChange={(e) => setForm({ ...form, ageYears: e.target.value.replace(/\D/g, "") })} />
          <Field label="Height (cm)" icon="📏" inputMode="numeric" value={form.heightCm} onChange={(e) => setForm({ ...form, heightCm: e.target.value })} />
          <Field label="Weight (kg)" icon="⚖️" inputMode="decimal" value={form.weightKg} onChange={(e) => setForm({ ...form, weightKg: e.target.value })} />
        </div>
        <select value={form.activityLevel} onChange={(e) => setForm({ ...form, activityLevel: e.target.value })} className="w-full rounded-[--radius-field] border border-fg-muted/40 bg-transparent px-4 py-3">
          <option value="sedentary">Sedentary</option>
          <option value="light">Lightly active</option>
          <option value="moderate">Moderately active</option>
          <option value="very_active">Very active</option>
        </select>
        <select value={form.primaryGoal} onChange={(e) => setForm({ ...form, primaryGoal: e.target.value })} className="w-full rounded-[--radius-field] border border-fg-muted/40 bg-transparent px-4 py-3">
          <option value="lose_weight">Lose weight</option>
          <option value="maintain">Maintain</option>
          <option value="build_muscle">Build muscle</option>
          <option value="improve_fitness">Improve fitness</option>
        </select>
        <select value={form.dietaryApproach} onChange={(e) => setForm({ ...form, dietaryApproach: e.target.value })} className="w-full rounded-[--radius-field] border border-fg-muted/40 bg-transparent px-4 py-3">
          <option value="balanced">Balanced</option>
          <option value="high_protein">High protein</option>
          <option value="low_carb">Low carb</option>
          <option value="keto">Keto</option>
          <option value="vegan">Vegan</option>
          <option value="vegetarian">Vegetarian</option>
        </select>
        <Button size="lg" className="w-full" disabled={!valid || busy} onClick={() => void create()}>
          {busy ? "Calculating…" : "Set goal + calculate targets"}
        </Button>
        {lastDerivation && (
          <p className="text-xs text-fg-muted">
            {String(lastDerivation.bmrFormula)} · BMR {String(lastDerivation.bmr)} · TDEE {String(lastDerivation.tdee)} kcal
          </p>
        )}
      </Card>
    </div>
  );
}

function Target({ label, value, unit }: { label: string; value?: number; unit: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 p-3">
      <div className="text-xs text-fg-muted">{label}</div>
      <div className="numeral text-xl font-semibold">
        {value ?? "—"}
        <span className="ml-1 text-xs text-fg-muted">{unit}</span>
      </div>
    </div>
  );
}
