/** Goal manager — the client's live body + preferences feed a TDEE calculator
 *  that derives server-side targets. Prefilled from the profile the client keeps
 *  in Settings, with BMI/BMR read-outs and a staleness nudge when the body has
 *  drifted from the active goal. */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fmtEnergy, fmtVolume, weightLabel, displayToKg, feetInchesToCm, kgToDisplay, cmToFeetInches,
  PRIMARY_GOAL_LABELS, ACTIVITY_LEVEL_LABELS, DIETARY_APPROACH_LABELS, WORKOUT_LOCATION_LABELS, BMI_CATEGORY_LABELS,
  type ClientPreferences, type BmiCategory,
} from "@mossa/domain";
import { Button, Card, Badge, Field, Select, Reveal, SkeletonStatGrid, SkeletonList, Page, Stagger, SectionHeader, METRICS, toneVar, Target, History, Activity, Scale, Flame, AlertTriangle, type MetricKey } from "@mossa/ui";
import { api } from "../../api.js";
import { useUnits } from "../../units.js";

interface Goal { id: string; label: string; status: string; targets: Record<string, number> | null; notes?: string | null; created_at: string }
interface ClientData { gender: string | null; heightCm: number | null; dateOfBirth: string | null; preferences: ClientPreferences }
interface Metrics {
  ageYears: number | null; weightKg: number | null; bodyFatPercent: number | null; measuredAt: string | null;
  bmi: number | null; bmiCategory: BmiCategory | null; bmr: number | null; bmrFormula: string | null;
  hasActiveGoal: boolean; staleness: { stale: boolean; weightDeltaKg: number | null; reason: string | null } | null;
}

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
  const [client, setClient] = useState<ClientData | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [form, setForm] = useState({ label: "", gender: "male" as "male" | "female", ageYears: "", heightCm: "", heightFt: "", heightIn: "", weightKg: "", bodyFatPercent: "", activityLevel: "moderate", primaryGoal: "maintain", dietaryApproach: "balanced", weightMin: "", weightMax: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [derivation, setDerivation] = useState<Record<string, unknown> | null>(null);
  const units = useUnits();
  const prefilled = useRef(false);

  const load = useCallback(async () => { setGoals((await api.get<{ goals: Goal[] }>(`/api/goals?clientId=${clientId}`)).goals); }, [clientId]);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    void api.get<{ client: ClientData; metrics: Metrics }>(`/api/clients/${clientId}`).then((r) => { setClient(r.client); setMetrics(r.metrics); }).catch(() => undefined);
  }, [clientId]);

  // Prefill the calculator once from the client's saved profile + latest body.
  useEffect(() => {
    if (prefilled.current || !client || !metrics) return;
    prefilled.current = true;
    const p = client.preferences ?? {};
    const h = client.heightCm != null ? cmToFeetInches(client.heightCm) : null;
    setForm((f) => ({
      ...f,
      gender: (client.gender as "male" | "female") || f.gender,
      ageYears: metrics.ageYears != null ? String(metrics.ageYears) : f.ageYears,
      heightCm: client.heightCm != null ? String(Math.round(client.heightCm)) : f.heightCm,
      heightFt: h ? String(h.ft) : f.heightFt,
      heightIn: h ? String(h.in) : f.heightIn,
      weightKg: metrics.weightKg != null ? String(kgToDisplay(metrics.weightKg, units)) : f.weightKg,
      bodyFatPercent: metrics.bodyFatPercent != null ? String(metrics.bodyFatPercent) : f.bodyFatPercent,
      activityLevel: p.activityLevel ?? f.activityLevel,
      primaryGoal: p.primaryGoal ?? f.primaryGoal,
      dietaryApproach: p.dietaryApproach ?? f.dietaryApproach,
      weightMax: p.targetWeightKg != null ? String(kgToDisplay(p.targetWeightKg, units)) : f.weightMax,
    }));
  }, [client, metrics, units]);

  const create = async () => {
    setBusy(true);
    try {
      const heightCm = units.height === "ft_in" ? feetInchesToCm(Number(form.heightFt || 0), Number(form.heightIn || 0)) : Number(form.heightCm);
      const weightKg = displayToKg(Number(form.weightKg), units);
      const ranges = (form.weightMin || form.weightMax) ? { weightKg: { min: form.weightMin ? displayToKg(Number(form.weightMin), units) : null, max: form.weightMax ? displayToKg(Number(form.weightMax), units) : null } } : undefined;
      const res = await api.post<{ derivation: Record<string, unknown> }>("/api/goals", { clientId, label: form.label || "New phase", notes: form.notes || undefined, ranges, calculator: { gender: form.gender, ageYears: Number(form.ageYears), heightCm, weightKg, bodyFatPercent: form.bodyFatPercent ? Number(form.bodyFatPercent) : undefined, activityLevel: form.activityLevel, primaryGoal: form.primaryGoal, dietaryApproach: form.dietaryApproach } });
      setDerivation(res.derivation); setForm((f) => ({ ...f, label: "", notes: "" })); await load();
      // Refresh metrics/staleness against the new goal snapshot.
      void api.get<{ metrics: Metrics }>(`/api/clients/${clientId}`).then((r) => setMetrics(r.metrics)).catch(() => undefined);
    } catch { /* validation surfaces via disabled */ } finally { setBusy(false); }
  };

  const active = goals?.find((g) => g.status === "active");
  const history = goals?.filter((g) => g.status !== "active") ?? [];
  const heightOk = units.height === "ft_in" ? form.heightFt : form.heightCm;
  const valid = form.ageYears && heightOk && form.weightKg;
  const prefs = client?.preferences ?? {};
  const prefRows: [string, string | null][] = [
    ["Goal", prefs.primaryGoal ? PRIMARY_GOAL_LABELS[prefs.primaryGoal] : null],
    ["Activity", prefs.activityLevel ? ACTIVITY_LEVEL_LABELS[prefs.activityLevel] : null],
    ["Target weight", prefs.targetWeightKg != null ? `${kgToDisplay(prefs.targetWeightKg, units)} ${weightLabel(units)}` : null],
    ["Workouts / week", prefs.workoutsPerWeek != null ? String(prefs.workoutsPerWeek) : null],
    ["Meals / day", prefs.mealsPerDay != null ? String(prefs.mealsPerDay) : null],
    ["Trains at", prefs.workoutLocation ? WORKOUT_LOCATION_LABELS[prefs.workoutLocation] : null],
    ["Diet", prefs.dietaryApproach ? DIETARY_APPROACH_LABELS[prefs.dietaryApproach] : null],
  ];
  const hasPrefs = prefRows.some(([, v]) => v != null) || prefs.limitations;

  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <Reveal loading={!goals} className="space-y-4" skeleton={
        <>
          <SkeletonStatGrid count={6} cols={3} />
          <SkeletonList card rows={6} thumb={0} />
        </>
      }>
      {goals && (<>
      {/* Staleness nudge — the body has drifted from the active goal. */}
      {metrics?.staleness?.stale && (
        <Stagger>
          <Card className="flex items-start gap-3 border border-warning/25 bg-warning-soft/50">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
            <div className="min-w-0"><div className="text-sm font-semibold">This goal may be stale</div><p className="text-sm text-muted-foreground">{metrics.staleness.reason ?? "The client's body has moved since this goal was set."}</p></div>
          </Card>
        </Stagger>
      )}

      {/* Live body read-out — recomputed on every weight/body-fat entry. */}
      {metrics && (metrics.bmi != null || metrics.bmr != null || metrics.weightKg != null) && (
        <Stagger>
          <Card className="space-y-3">
            <SectionHeader icon={Scale} tone="cardio" title="Body snapshot" action={metrics.measuredAt ? <Badge tone="neutral">{new Date(`${metrics.measuredAt}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Badge> : undefined} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-secondary p-3"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Scale className="size-3.5" style={{ color: toneVar.cardio }} /> Weight</div><div className="numeral mt-0.5 text-xl font-semibold">{metrics.weightKg != null ? kgToDisplay(metrics.weightKg, units) : "—"}<span className="ml-1 text-xs font-medium text-muted-foreground">{weightLabel(units)}</span></div></div>
              <div className="rounded-xl bg-secondary p-3"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Activity className="size-3.5" style={{ color: toneVar.activity }} /> BMI</div><div className="numeral mt-0.5 text-xl font-semibold">{metrics.bmi ?? "—"}</div>{metrics.bmiCategory && <div className="text-[0.7rem] font-medium text-muted-foreground">{BMI_CATEGORY_LABELS[metrics.bmiCategory]}</div>}</div>
              <div className="rounded-xl bg-secondary p-3"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Flame className="size-3.5" style={{ color: toneVar.calories }} /> BMR</div><div className="numeral mt-0.5 text-xl font-semibold">{metrics.bmr ?? "—"}</div>{metrics.bmr != null && <div className="text-[0.7rem] font-medium text-muted-foreground">kcal/day</div>}</div>
              <div className="rounded-xl bg-secondary p-3"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Target className="size-3.5" style={{ color: toneVar.nutrition }} /> Body fat</div><div className="numeral mt-0.5 text-xl font-semibold">{metrics.bodyFatPercent != null ? `${metrics.bodyFatPercent}%` : "—"}</div></div>
            </div>
          </Card>
        </Stagger>
      )}

      {/* What the client asked for (from their Settings). */}
      {hasPrefs && (
        <Stagger>
          <Card className="space-y-3">
            <SectionHeader icon={Target} tone="primary" title="Client preferences" />
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              {prefRows.filter(([, v]) => v != null).map(([k, v]) => (
                <div key={k} className="min-w-0"><div className="text-xs text-muted-foreground">{k}</div><div className="truncate text-sm font-medium">{v}</div></div>
              ))}
            </div>
            {prefs.limitations && <p className="rounded-xl bg-secondary p-3 text-sm text-muted-foreground"><span className="font-medium text-foreground">Limitations · </span>{prefs.limitations}</p>}
          </Card>
        </Stagger>
      )}

      {active?.targets && (
        <Stagger>
          <Card className="space-y-3">
            <SectionHeader icon={Target} tone="nutrition" title={active.label} action={<Badge tone="success">Active</Badge>} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
          <SectionHeader icon={Target} tone="nutrition" title="New goal phase" />
          <Field label="Phase label" icon={Target} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Cut — 8 weeks" />
          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1.5 block text-sm font-medium text-muted-foreground">Gender</label><Select value={form.gender} onChange={(v) => setForm({ ...form, gender: v as "male" | "female" })} options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]} /></div>
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
            <Field label="Body fat % (optional)" inputMode="decimal" value={form.bodyFatPercent} onChange={(e) => setForm({ ...form, bodyFatPercent: e.target.value })} />
          </div>
          <div><label className="mb-1.5 block text-sm font-medium text-muted-foreground">Activity level</label><Select value={form.activityLevel} onChange={(v) => setForm({ ...form, activityLevel: v })} options={Object.entries(ACTIVITY_LEVEL_LABELS).map(([value, label]) => ({ value, label }))} /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-muted-foreground">Primary goal</label><Select value={form.primaryGoal} onChange={(v) => setForm({ ...form, primaryGoal: v })} options={Object.entries(PRIMARY_GOAL_LABELS).map(([value, label]) => ({ value, label }))} /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-muted-foreground">Dietary approach</label><Select value={form.dietaryApproach} onChange={(v) => setForm({ ...form, dietaryApproach: v })} options={Object.entries(DIETARY_APPROACH_LABELS).map(([value, label]) => ({ value, label }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Weight range min (${weightLabel(units)})`} inputMode="decimal" value={form.weightMin} onChange={(e) => setForm({ ...form, weightMin: e.target.value })} />
            <Field label={`Weight range max (${weightLabel(units)})`} inputMode="decimal" value={form.weightMax} onChange={(e) => setForm({ ...form, weightMax: e.target.value })} />
          </div>
          <Field label="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Context for this phase" />
          <Button size="lg" className="w-full" disabled={!valid || busy} onClick={() => void create()}>{busy ? "Calculating…" : "Set goal + calculate targets"}</Button>
          {derivation && <p className="text-xs text-muted-foreground">{String(derivation.bmrFormula)} · BMR {fmtEnergy(Number(derivation.bmr), units, false)} · TDEE {fmtEnergy(Number(derivation.tdee), units)}</p>}
        </Card>
      </Stagger>

      {history.length > 0 && (
        <Stagger>
          <Card className="space-y-2">
            <SectionHeader icon={History} tone="cardio" title="Goal history" />
            {history.map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-2 border-t border-border/40 pt-2 first:border-0 first:pt-0">
                <div className="min-w-0"><div className="truncate text-sm font-medium">{g.label}</div><div className="numeral text-xs text-muted-foreground">{g.targets?.targetCalories != null ? fmtEnergy(g.targets.targetCalories, units) : "—"} · {new Date(g.created_at).toLocaleDateString()}</div></div>
                <Badge tone="neutral">{g.status}</Badge>
              </div>
            ))}
          </Card>
        </Stagger>
      )}
      </>)}
      </Reveal>
    </Page>
  );
}
