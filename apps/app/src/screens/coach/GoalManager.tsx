/** Goal manager — set a client's nutrition/training goal by CALCULATING targets
 *  from their body (TDEE) or ENTERING macros manually, then review the change
 *  against the current goal before it takes effect. Every past goal is kept and
 *  shown with its window + who set it, so goal history is a real log. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fmtEnergy, fmtVolume, weightLabel, displayToKg, feetInchesToCm, kgToDisplay, cmToFeetInches,
  kcalToDisplay, displayToKcal, mlToVolumeDisplay, volumeDisplayToMl, energyLabel, volumeLabel,
  calculateNutritionTargets, validateCalculatorInputs,
  PRIMARY_GOAL_LABELS, ACTIVITY_LEVEL_LABELS, DIETARY_APPROACH_LABELS, WORKOUT_LOCATION_LABELS, BMI_CATEGORY_LABELS,
  type ClientPreferences, type BmiCategory, type Gender, type ActivityLevel, type PrimaryGoal, type DietaryApproach, type UnitPrefs,
} from "@mossa/domain";
import { Button, Card, Badge, Field, Select, Reveal, SegmentedControl, SkeletonStatGrid, SkeletonList, Page, Stagger, SectionHeader, METRICS, toneVar, Target, History, Activity, Scale, Flame, AlertTriangle, Calculator, SlidersHorizontal, ArrowRight, Calendar, type MetricKey } from "@mossa/ui";
import { api } from "../../api.js";
import { useUnits } from "../../units.js";

type TargetKey = "targetCalories" | "targetProteinG" | "targetCarbsG" | "targetFatG" | "targetFiberG" | "targetWaterMl";
interface Goal { id: string; label: string; status: string; targets: Record<string, number> | null; notes?: string | null; start_date?: string | null; end_date?: string | null; created_at: string; created_by_name?: string | null }
interface ClientData { gender: string | null; heightCm: number | null; dateOfBirth: string | null; preferences: ClientPreferences }
interface Metrics {
  ageYears: number | null; weightKg: number | null; bodyFatPercent: number | null; measuredAt: string | null;
  bmi: number | null; bmiCategory: BmiCategory | null; bmr: number | null; bmrFormula: string | null;
  hasActiveGoal: boolean; staleness: { stale: boolean; weightDeltaKg: number | null; reason: string | null } | null;
}

const TARGET_FIELDS: { key: TargetKey; metric: MetricKey; unit: string }[] = [
  { key: "targetCalories", metric: "calories", unit: "kcal" },
  { key: "targetProteinG", metric: "protein", unit: "g" },
  { key: "targetCarbsG", metric: "carbs", unit: "g" },
  { key: "targetFatG", metric: "fat", unit: "g" },
  { key: "targetFiberG", metric: "fiber", unit: "g" },
  { key: "targetWaterMl", metric: "water", unit: "ml" },
];
const emptyTargets = (): Record<TargetKey, string> => ({ targetCalories: "", targetProteinG: "", targetCarbsG: "", targetFatG: "", targetFiberG: "", targetWaterMl: "" });

function fmtTarget(field: TargetKey, v: number, units: UnitPrefs): string {
  if (field === "targetCalories") return fmtEnergy(v, units);
  if (field === "targetWaterMl") return fmtVolume(v, units);
  return `${Math.round(v)} g`;
}

// Manual entry follows the coach's display units: calories in kcal/kJ, water in
// ml/fl-oz; the macros (protein/carbs/fat/fiber) are always grams. Values are
// stored metric (kcal, ml) — convert on fill and on save.
const unitLabelOf = (key: TargetKey, u: UnitPrefs): string => (key === "targetCalories" ? energyLabel(u) : key === "targetWaterMl" ? volumeLabel(u) : "g");
const toDisplayVal = (key: TargetKey, metric: number, u: UnitPrefs): number => (key === "targetCalories" ? kcalToDisplay(metric, u) : key === "targetWaterMl" ? mlToVolumeDisplay(metric, u) : Math.round(metric));
const toMetricVal = (key: TargetKey, display: number, u: UnitPrefs): number => Math.round(key === "targetCalories" ? displayToKcal(display, u) : key === "targetWaterMl" ? volumeDisplayToMl(display, u) : display);

export function GoalManager({ clientId }: { clientId: string }) {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [client, setClient] = useState<ClientData | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [mode, setMode] = useState<"calculate" | "manual">("calculate");
  const [form, setForm] = useState({ label: "", startDate: "", gender: "male" as "male" | "female", ageYears: "", heightCm: "", heightFt: "", heightIn: "", weightKg: "", bodyFatPercent: "", activityLevel: "moderate", primaryGoal: "maintain", dietaryApproach: "balanced", weightMin: "", weightMax: "", bodyFatMin: "", bodyFatMax: "", notes: "" });
  const [targets, setTargets] = useState<Record<TargetKey, string>>(emptyTargets);
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

  const calcInputs = useCallback(() => {
    const heightCm = units.height === "ft_in" ? feetInchesToCm(Number(form.heightFt || 0), Number(form.heightIn || 0)) : Number(form.heightCm);
    return {
      gender: form.gender as Gender,
      ageYears: Number(form.ageYears),
      heightCm,
      weightKg: displayToKg(Number(form.weightKg), units),
      bodyFatPercent: form.bodyFatPercent ? Number(form.bodyFatPercent) : null,
      activityLevel: form.activityLevel as ActivityLevel,
      primaryGoal: form.primaryGoal as PrimaryGoal,
      dietaryApproach: form.dietaryApproach as DietaryApproach,
    };
  }, [form, units]);

  // Calculate targets client-side and fill the (editable) macro fields so the
  // coach can review and tweak before saving.
  const calculate = () => {
    const inputs = calcInputs();
    if (validateCalculatorInputs(inputs).length) return;
    const r = calculateNutritionTargets(inputs);
    setTargets({
      targetCalories: String(toDisplayVal("targetCalories", r.targetCalories, units)),
      targetProteinG: String(r.targetProteinG),
      targetCarbsG: String(r.targetCarbsG),
      targetFatG: String(r.targetFatG),
      targetFiberG: String(r.targetFiberG),
      targetWaterMl: String(toDisplayVal("targetWaterMl", r.targetWaterMl, units)),
    });
    setDerivation(r.derivation as Record<string, unknown>);
  };

  const create = async () => {
    setBusy(true);
    try {
      const targetsObj: Record<string, number> = {};
      for (const { key } of TARGET_FIELDS) if (targets[key] !== "" && Number.isFinite(Number(targets[key]))) targetsObj[key] = toMetricVal(key, Number(targets[key]), units);
      const rangesObj: Record<string, { min: number | null; max: number | null }> = {};
      if (form.weightMin || form.weightMax) rangesObj.weightKg = { min: form.weightMin ? displayToKg(Number(form.weightMin), units) : null, max: form.weightMax ? displayToKg(Number(form.weightMax), units) : null };
      if (form.bodyFatMin || form.bodyFatMax) rangesObj.bodyFatPercent = { min: form.bodyFatMin ? Number(form.bodyFatMin) : null, max: form.bodyFatMax ? Number(form.bodyFatMax) : null };
      const ranges = Object.keys(rangesObj).length ? rangesObj : undefined;
      // In calculate mode we also send the calculator so the goal keeps its
      // derivation snapshot (BMR/TDEE) for staleness detection; any manual tweak
      // to the macro fields still wins (the API spreads targets over the calc).
      const calculator = mode === "calculate" && validateCalculatorInputs(calcInputs()).length === 0 ? calcInputs() : undefined;
      const res = await api.post<{ derivation: Record<string, unknown> }>("/api/goals", {
        clientId, label: form.label || "New phase", notes: form.notes || undefined, ranges,
        startDate: form.startDate || undefined,
        targets: Object.keys(targetsObj).length ? targetsObj : undefined,
        calculator,
      });
      if (res.derivation) setDerivation(res.derivation);
      setForm((f) => ({ ...f, label: "", notes: "", startDate: "" }));
      setTargets(emptyTargets());
      await load();
      void api.get<{ metrics: Metrics }>(`/api/clients/${clientId}`).then((r) => setMetrics(r.metrics)).catch(() => undefined);
    } catch { /* validation surfaces via disabled */ } finally { setBusy(false); }
  };

  const active = goals?.find((g) => g.status === "active");
  const history = goals?.filter((g) => g.status !== "active") ?? [];
  // Effective end of each historical goal = the next (newer) goal's start.
  const windowEnd = useMemo(() => {
    const m = new Map<string, string>();
    const sorted = [...(goals ?? [])].sort((a, b) => (a.start_date || a.created_at).localeCompare(b.start_date || b.created_at));
    for (let i = 0; i < sorted.length - 1; i++) m.set(sorted[i]!.id, sorted[i + 1]!.start_date || sorted[i + 1]!.created_at.slice(0, 10));
    return m;
  }, [goals]);

  const heightOk = units.height === "ft_in" ? form.heightFt : form.heightCm;
  const calcReady = !!(form.ageYears && heightOk && form.weightKg);
  const canSave = Number(targets.targetCalories) > 0;
  // Diff the pending calories against the active goal (the headline change) —
  // both compared in METRIC kcal, then rendered in the coach's energy unit.
  const newCals = targets.targetCalories !== "" && Number.isFinite(Number(targets.targetCalories)) ? toMetricVal("targetCalories", Number(targets.targetCalories), units) : null;
  const oldCals = active?.targets?.targetCalories ?? null;
  const calDelta = newCals != null && oldCals != null ? newCals - oldCals : null;

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
  const fmtDate = (s: string | null | undefined) => (s ? new Date(`${s.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—");

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
              <div className="rounded-xl bg-secondary p-3"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Target className="size-3.5" style={{ color: toneVar.sleep }} /> Body fat</div><div className="numeral mt-0.5 text-xl font-semibold">{metrics.bodyFatPercent != null ? `${metrics.bodyFatPercent}%` : "—"}</div></div>
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
            <div className="text-xs text-muted-foreground">Since {fmtDate(active.start_date || active.created_at)}{active.created_by_name ? ` · set by ${active.created_by_name}` : ""}</div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {TARGET_FIELDS.map(({ key, metric }) => {
                const m = METRICS[metric];
                const v = active.targets![key];
                return (
                  <div key={metric} className="rounded-xl bg-secondary p-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><m.icon className="size-3.5" style={{ color: toneVar[m.tone] }} /> {m.label}</div>
                    <div className="numeral mt-0.5 text-xl font-semibold">{v == null ? "—" : fmtTarget(key, v, units)}</div>
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

          {/* How to set targets: derive from the body, or type them in. */}
          <SegmentedControl<"calculate" | "manual">
            fill
            value={mode}
            onChange={setMode}
            options={[
              { value: "calculate", label: <span className="inline-flex items-center gap-1.5"><Calculator className="size-4" /> Calculate</span> },
              { value: "manual", label: <span className="inline-flex items-center gap-1.5"><SlidersHorizontal className="size-4" /> Enter manually</span> },
            ]}
          />

          {mode === "calculate" && (
            <div className="space-y-3 rounded-xl bg-secondary/50 p-3">
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
              <Button variant="secondary" className="w-full" disabled={!calcReady} onClick={calculate}><Calculator className="size-4" /> Calculate targets from body</Button>
              {derivation && <p className="text-xs text-muted-foreground">{String(derivation.bmrFormula)} · BMR {fmtEnergy(Number(derivation.bmr), units, false)} · TDEE {fmtEnergy(Number(derivation.tdee), units)}</p>}
            </div>
          )}

          {/* Editable targets — the numbers the goal will actually save. In
              calculate mode they fill from the button and stay tweakable. */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-muted-foreground">{mode === "calculate" ? "Targets (tweak if needed)" : "Targets"}</label>
              {mode === "calculate" && Object.values(targets).some((v) => v !== "") && <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setTargets(emptyTargets())}>clear</button>}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {TARGET_FIELDS.map(({ key, metric }) => {
                const m = METRICS[metric];
                return <Field key={key} label={`${m.label} (${unitLabelOf(key, units)})`} icon={m.icon} inputMode="decimal" value={targets[key]} onChange={(e) => setTargets((t) => ({ ...t, [key]: e.target.value.replace(/[^\d.]/g, "") }))} />;
              })}
            </div>
          </div>

          {/* Effective date + a clear "what this replaces" statement. */}
          <Field type="date" label="Effective from" icon={Calendar} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} hint={active ? `Replaces "${active.label}" from this date. Past days keep the goal they were logged under.` : "Defaults to today."} />

          {/* Change preview: how the headline calorie target moves. */}
          {active?.targets && newCals != null && (
            <div className="flex items-center gap-2 rounded-xl bg-secondary p-3 text-sm">
              <span className="text-muted-foreground">Calories</span>
              <span className="numeral font-medium">{oldCals != null ? fmtEnergy(oldCals, units) : "—"}</span>
              <ArrowRight className="size-4 text-muted-foreground" />
              <span className="numeral font-semibold">{fmtEnergy(newCals, units)}</span>
              {calDelta != null && calDelta !== 0 && (
                <Badge tone={calDelta > 0 ? "cardio" : "sleep"}>{calDelta > 0 ? "+" : "−"}{kcalToDisplay(Math.abs(calDelta), units)} {energyLabel(units)}</Badge>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label={`Weight range min (${weightLabel(units)})`} inputMode="decimal" value={form.weightMin} onChange={(e) => setForm({ ...form, weightMin: e.target.value })} />
            <Field label={`Weight range max (${weightLabel(units)})`} inputMode="decimal" value={form.weightMax} onChange={(e) => setForm({ ...form, weightMax: e.target.value })} />
            <Field label="Body-fat range min (%)" inputMode="decimal" value={form.bodyFatMin} onChange={(e) => setForm({ ...form, bodyFatMin: e.target.value })} />
            <Field label="Body-fat range max (%)" inputMode="decimal" value={form.bodyFatMax} onChange={(e) => setForm({ ...form, bodyFatMax: e.target.value })} />
          </div>
          <Field label="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Context for this phase" />
          <Button size="lg" className="w-full" disabled={!canSave || busy} onClick={() => void create()}>{busy ? "Saving…" : active ? "Replace goal" : "Set goal"}</Button>
          {!canSave && <p className="text-center text-xs text-muted-foreground">{mode === "calculate" ? "Calculate targets (or type a calorie target) to save." : "Enter at least a calorie target to save."}</p>}
        </Card>
      </Stagger>

      {history.length > 0 && (
        <Stagger>
          <Card className="space-y-3">
            <SectionHeader icon={History} tone="cardio" title="Goal history" action={<Badge tone="neutral">{history.length}</Badge>} />
            {history.map((g) => (
              <div key={g.id} className="space-y-1.5 border-t border-border/40 pt-3 first:border-0 first:pt-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-sm font-medium">{g.label}</div>
                  <Badge tone="neutral">{g.status}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {TARGET_FIELDS.filter(({ key }) => g.targets?.[key] != null).map(({ key, metric }) => (
                    <span key={key} className="numeral inline-flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-[0.7rem] text-muted-foreground">
                      {METRICS[metric].label} {fmtTarget(key, g.targets![key]!, units)}
                    </span>
                  ))}
                </div>
                <div className="numeral text-xs text-muted-foreground">{fmtDate(g.start_date || g.created_at)} → {fmtDate(windowEnd.get(g.id) || g.end_date)}{g.created_by_name ? ` · set by ${g.created_by_name}` : ""}</div>
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
