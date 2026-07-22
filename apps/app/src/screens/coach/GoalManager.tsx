/** Goal manager — the client's body (weight, body-fat, age, height, sex) is
 *  already known server-side, so the coach never re-enters it. Pick the goal
 *  formula (goal direction · activity · diet, pre-set from the client's
 *  preferences), and targets autofill from a TDEE calc — editable for a tweak.
 *  Every past goal is kept and shown with its window + who set it. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fmtEnergy, fmtVolume, weightLabel, displayToKg, kgToDisplay,
  kcalToDisplay, displayToKcal, mlToVolumeDisplay, volumeDisplayToMl, energyLabel, volumeLabel,
  calculateNutritionTargets, validateCalculatorInputs,
  PRIMARY_GOAL_LABELS, ACTIVITY_LEVEL_LABELS, DIETARY_APPROACH_LABELS, WORKOUT_LOCATION_LABELS, BMI_CATEGORY_LABELS,
  type ClientPreferences, type BmiCategory, type CalculatorInputs, type Gender, type ActivityLevel, type PrimaryGoal, type DietaryApproach, type UnitPrefs,
} from "@mossa/domain";
import { Button, Card, Badge, Field, Select, Reveal, SkeletonStatGrid, SkeletonList, Page, Stagger, Eyebrow, GlanceStrip, METRICS, toneVar, Target, Activity, Scale, Flame, AlertTriangle, Calculator, ArrowRight, Calendar, type MetricKey } from "@mossa/ui";
import { api } from "../../api.js";
import { useUnits } from "../../units.js";

type TargetKey = "targetCalories" | "targetProteinG" | "targetCarbsG" | "targetFatG" | "targetFiberG" | "targetWaterMl";
interface Goal { id: string; label: string; status: string; targets: Record<string, number> | null; notes?: string | null; start_date?: string | null; end_date?: string | null; created_at: string; created_by_name?: string | null }
interface ClientData { gender: string | null; heightCm: number | null; dateOfBirth: string | null; preferences: ClientPreferences }
type RangeStat = "in_range" | "below" | "above";
interface Metrics {
  ageYears: number | null; weightKg: number | null; bodyFatPercent: number | null; measuredAt: string | null;
  bmi: number | null; bmiCategory: BmiCategory | null; bmr: number | null; bmrFormula: string | null;
  hasActiveGoal: boolean; staleness: { stale: boolean; weightDeltaKg: number | null; reason: string | null } | null;
  weightStatus?: RangeStat | null;
}
const RANGE_LABEL: Record<RangeStat, string> = { in_range: "In range", below: "Below", above: "Above" };
function StatusChip({ status }: { status?: RangeStat | null }) {
  if (!status) return null;
  return <div className="mt-1"><Badge tone={status === "in_range" ? "success" : "warning"}>{RANGE_LABEL[status]}</Badge></div>;
}
interface Formula { primaryGoal: PrimaryGoal; activityLevel: ActivityLevel; dietaryApproach: DietaryApproach }

const TARGET_FIELDS: { key: TargetKey; metric: MetricKey }[] = [
  { key: "targetCalories", metric: "calories" },
  { key: "targetProteinG", metric: "protein" },
  { key: "targetCarbsG", metric: "carbs" },
  { key: "targetFatG", metric: "fat" },
  { key: "targetFiberG", metric: "fiber" },
  { key: "targetWaterMl", metric: "water" },
];
const emptyTargets = (): Record<TargetKey, string> => ({ targetCalories: "", targetProteinG: "", targetCarbsG: "", targetFatG: "", targetFiberG: "", targetWaterMl: "" });

function fmtTarget(field: TargetKey, v: number, units: UnitPrefs): string {
  if (field === "targetCalories") return fmtEnergy(v, units);
  if (field === "targetWaterMl") return fmtVolume(v, units);
  return `${Math.round(v)} g`;
}

// Editable targets follow the coach's display units: calories in kcal/kJ, water
// in ml/fl-oz; macros are always grams. Stored metric — convert on fill + save.
const unitLabelOf = (key: TargetKey, u: UnitPrefs): string => (key === "targetCalories" ? energyLabel(u) : key === "targetWaterMl" ? volumeLabel(u) : "g");
const toDisplayVal = (key: TargetKey, metric: number, u: UnitPrefs): number => (key === "targetCalories" ? kcalToDisplay(metric, u) : key === "targetWaterMl" ? mlToVolumeDisplay(metric, u) : Math.round(metric));
const toMetricVal = (key: TargetKey, display: number, u: UnitPrefs): number => Math.round(key === "targetCalories" ? displayToKcal(display, u) : key === "targetWaterMl" ? volumeDisplayToMl(display, u) : display);

export function GoalManager({ clientId }: { clientId: string }) {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [client, setClient] = useState<ClientData | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [formula, setFormula] = useState<Formula>({ primaryGoal: "maintain", activityLevel: "moderate", dietaryApproach: "balanced" });
  const [form, setForm] = useState({ label: "", startDate: "", weightMin: "", weightMax: "", notes: "" });
  const [rangeOpen, setRangeOpen] = useState(false);
  const [targets, setTargets] = useState<Record<TargetKey, string>>(emptyTargets);
  const [edited, setEdited] = useState(false); // coach hand-tweaked → don't auto-overwrite
  const [busy, setBusy] = useState(false);
  const [derivation, setDerivation] = useState<Record<string, unknown> | null>(null);
  const units = useUnits();
  const prefilled = useRef(false);

  const load = useCallback(async () => { setGoals((await api.get<{ goals: Goal[] }>(`/api/goals?clientId=${clientId}`)).goals); }, [clientId]);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    void api.get<{ client: ClientData; metrics: Metrics }>(`/api/clients/${clientId}`).then((r) => { setClient(r.client); setMetrics(r.metrics); }).catch(() => undefined);
  }, [clientId]);

  // The client's body — read straight from their profile + latest measurement,
  // never typed by the coach. `bodyReady` gates the auto-calc.
  const bodyInputs = useCallback((f: Formula): Partial<CalculatorInputs> => ({
    gender: (client?.gender as Gender) ?? undefined,
    ageYears: metrics?.ageYears ?? undefined,
    heightCm: client?.heightCm ?? undefined,
    weightKg: metrics?.weightKg ?? undefined,
    bodyFatPercent: metrics?.bodyFatPercent ?? null,
    activityLevel: f.activityLevel,
    primaryGoal: f.primaryGoal,
    dietaryApproach: f.dietaryApproach,
  }), [client, metrics]);

  const gaps = useMemo(() => {
    const g: string[] = [];
    if (!client) return g;
    if (!client.gender) g.push("sex");
    if (metrics?.ageYears == null) g.push("date of birth");
    if (client.heightCm == null) g.push("height");
    if (metrics?.weightKg == null) g.push("a recent weight");
    return g;
  }, [client, metrics]);
  const bodyReady = client != null && metrics != null && gaps.length === 0;

  // Run the TDEE calc from the client's body + the chosen formula, filling the
  // editable target fields. Pure autofill — the coach can then tweak.
  const runCalc = useCallback((f: Formula) => {
    const inputs = bodyInputs(f);
    if (validateCalculatorInputs(inputs).length) return;
    const r = calculateNutritionTargets(inputs as CalculatorInputs);
    setTargets({
      targetCalories: String(toDisplayVal("targetCalories", r.targetCalories, units)),
      targetProteinG: String(r.targetProteinG),
      targetCarbsG: String(r.targetCarbsG),
      targetFatG: String(r.targetFatG),
      targetFiberG: String(r.targetFiberG),
      targetWaterMl: String(toDisplayVal("targetWaterMl", r.targetWaterMl, units)),
    });
    setDerivation(r.derivation as Record<string, unknown>);
  }, [bodyInputs, units]);

  // Prefill the formula from the client's preferences once, and autofill targets
  // straight away so the coach lands on suggested numbers with nothing to type.
  useEffect(() => {
    if (prefilled.current || !client || !metrics) return;
    prefilled.current = true;
    const p = client.preferences ?? {};
    const f: Formula = {
      primaryGoal: (p.primaryGoal as PrimaryGoal) ?? "maintain",
      activityLevel: (p.activityLevel as ActivityLevel) ?? "moderate",
      dietaryApproach: (p.dietaryApproach as DietaryApproach) ?? "balanced",
    };
    setFormula(f);
    // Suggest a healthy weight band around the client's target weight (±2 kg),
    // so the coach never types it — just opens the optional section to confirm.
    if (p.targetWeightKg != null) {
      setForm((prev) => ({ ...prev, weightMin: String(kgToDisplay(p.targetWeightKg! - 2, units)), weightMax: String(kgToDisplay(p.targetWeightKg! + 2, units)) }));
    }
    if (client.gender && metrics.ageYears != null && client.heightCm != null && metrics.weightKg != null) runCalc(f);
  }, [client, metrics, units, runCalc]);

  // Changing the formula recalculates — unless the coach has hand-edited targets.
  const setFormulaField = (patch: Partial<Formula>) => {
    const next = { ...formula, ...patch };
    setFormula(next);
    if (!edited && bodyReady) runCalc(next);
  };

  const create = async () => {
    setBusy(true);
    try {
      const targetsObj: Record<string, number> = {};
      for (const { key } of TARGET_FIELDS) if (targets[key] !== "" && Number.isFinite(Number(targets[key]))) targetsObj[key] = toMetricVal(key, Number(targets[key]), units);
      const rangesObj: Record<string, { min: number | null; max: number | null }> = {};
      if (rangeOpen && (form.weightMin || form.weightMax)) rangesObj.weightKg = { min: form.weightMin ? displayToKg(Number(form.weightMin), units) : null, max: form.weightMax ? displayToKg(Number(form.weightMax), units) : null };
      const ranges = Object.keys(rangesObj).length ? rangesObj : undefined;
      // Send the calculator (from the client's body) so the goal keeps its
      // BMR/TDEE derivation snapshot for staleness detection; the explicit
      // targets (possibly tweaked) still win server-side.
      const inputs = bodyInputs(formula);
      const calculator = bodyReady && validateCalculatorInputs(inputs).length === 0 ? inputs : undefined;
      const res = await api.post<{ derivation: Record<string, unknown> }>("/api/goals", {
        clientId, label: form.label || "New phase", notes: form.notes || undefined, ranges,
        startDate: form.startDate || undefined,
        targets: Object.keys(targetsObj).length ? targetsObj : undefined,
        calculator,
      });
      if (res.derivation) setDerivation(res.derivation);
      setForm((f) => ({ ...f, label: "", notes: "", startDate: "" }));
      setEdited(false);
      await load();
      void api.get<{ client: ClientData; metrics: Metrics }>(`/api/clients/${clientId}`).then((r) => { setMetrics(r.metrics); }).catch(() => undefined);
    } catch { /* validation surfaces via disabled */ } finally { setBusy(false); }
  };

  const active = goals?.find((g) => g.status === "active");
  const history = goals?.filter((g) => g.status !== "active") ?? [];
  const windowEnd = useMemo(() => {
    const m = new Map<string, string>();
    const sorted = [...(goals ?? [])].sort((a, b) => (a.start_date || a.created_at).localeCompare(b.start_date || b.created_at));
    for (let i = 0; i < sorted.length - 1; i++) m.set(sorted[i]!.id, sorted[i + 1]!.start_date || sorted[i + 1]!.created_at.slice(0, 10));
    return m;
  }, [goals]);

  const canSave = Number(targets.targetCalories) > 0;
  const newCals = targets.targetCalories !== "" && Number.isFinite(Number(targets.targetCalories)) ? toMetricVal("targetCalories", Number(targets.targetCalories), units) : null;
  const oldCals = active?.targets?.targetCalories ?? null;
  const calDelta = newCals != null && oldCals != null ? newCals - oldCals : null;

  const prefs = client?.preferences ?? {};
  const prefRows: [string, string | null][] = [
    ["Target weight", prefs.targetWeightKg != null ? `${kgToDisplay(prefs.targetWeightKg, units)} ${weightLabel(units)}` : null],
    ["Workouts / week", prefs.workoutsPerWeek != null ? String(prefs.workoutsPerWeek) : null],
    ["Meals / day", prefs.mealsPerDay != null ? String(prefs.mealsPerDay) : null],
    ["Trains at", prefs.workoutLocation ? WORKOUT_LOCATION_LABELS[prefs.workoutLocation] : null],
  ];
  const hasPrefs = prefRows.some(([, v]) => v != null) || prefs.limitations;
  const fmtDate = (s: string | null | undefined) => (s ? new Date(`${s.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—");
  const selRow = "mb-1.5 block text-sm font-medium text-muted-foreground";

  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <Reveal loading={!goals} className="space-y-4" skeleton={
        <>
          <SkeletonStatGrid count={6} cols={3} />
          <SkeletonList card rows={6} thumb={0} />
        </>
      }>
      {goals && (<>
      {metrics?.staleness?.stale && (
        <Stagger>
          <Card className="flex items-start gap-3 border border-warning/25 bg-warning-soft/50">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
            <div className="min-w-0"><div className="text-sm font-semibold">This goal may be stale</div><p className="text-sm text-muted-foreground">{metrics.staleness.reason ?? "The client's body has moved since this goal was set."}</p></div>
          </Card>
        </Stagger>
      )}

      {/* The client's body — pulled automatically, drives the calc. A card-less
          glance strip: a deliberate break from the boxed-card rhythm below. */}
      {metrics && (metrics.bmi != null || metrics.bmr != null || metrics.weightKg != null) && (
        <section className="space-y-2">
          <Eyebrow action={metrics.measuredAt ? <Badge tone="neutral">{new Date(`${metrics.measuredAt}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Badge> : undefined}>Body snapshot</Eyebrow>
          <Stagger>
            <GlanceStrip items={[
              { icon: Scale, tone: "cardio", value: <>{metrics.weightKg != null ? kgToDisplay(metrics.weightKg, units) : "—"}<span className="ml-1 text-xs font-medium text-muted-foreground">{weightLabel(units)}</span></>, label: <>Weight<StatusChip status={metrics.weightStatus} /></> },
              { icon: Activity, tone: "activity", value: metrics.bmi ?? "—", label: metrics.bmiCategory ? BMI_CATEGORY_LABELS[metrics.bmiCategory] : "BMI" },
              { icon: Flame, tone: "calories", value: metrics.bmr ?? "—", label: metrics.bmr != null ? "BMR · kcal/day" : "BMR" },
              { icon: Target, tone: "sleep", value: metrics.bodyFatPercent != null ? `${metrics.bodyFatPercent}%` : "—", label: "Body fat" },
            ]} />
          </Stagger>
        </section>
      )}

      {hasPrefs && (
        <section className="space-y-2">
          <Eyebrow>Client preferences</Eyebrow>
          <Stagger>
          <Card className="space-y-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              {prefRows.filter(([, v]) => v != null).map(([k, v]) => (
                <div key={k} className="min-w-0"><div className="text-xs text-muted-foreground">{k}</div><div className="truncate text-sm font-medium">{v}</div></div>
              ))}
            </div>
            {prefs.limitations && <p className="rounded-xl bg-secondary p-3 text-sm text-muted-foreground"><span className="font-medium text-foreground">Limitations · </span>{prefs.limitations}</p>}
          </Card>
          </Stagger>
        </section>
      )}

      {active?.targets && (
        <section className="space-y-2">
          <Eyebrow action={<Badge tone="success">Active</Badge>}>Active goal</Eyebrow>
          <Stagger>
          <Card className="space-y-3">
            <div>
              <div className="font-semibold">{active.label}</div>
              <div className="text-xs text-muted-foreground">Since {fmtDate(active.start_date || active.created_at)}{active.created_by_name ? ` · set by ${active.created_by_name}` : ""}</div>
            </div>
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
        </section>
      )}

      <section className="space-y-2">
        <Eyebrow>New goal phase</Eyebrow>
        <Stagger>
        <Card className="space-y-3">
          <Field label="Phase label" icon={Target} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Cut — 8 weeks" />

          {/* The formula — the only real choices; pre-set from the client's prefs.
              Targets recalc automatically as these change (until hand-edited). */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className={selRow}>Goal</label><Select value={formula.primaryGoal} onChange={(v) => setFormulaField({ primaryGoal: v as PrimaryGoal })} options={Object.entries(PRIMARY_GOAL_LABELS).map(([value, label]) => ({ value, label }))} /></div>
            <div><label className={selRow}>Activity</label><Select value={formula.activityLevel} onChange={(v) => setFormulaField({ activityLevel: v as ActivityLevel })} options={Object.entries(ACTIVITY_LEVEL_LABELS).map(([value, label]) => ({ value, label }))} /></div>
            <div><label className={selRow}>Diet</label><Select value={formula.dietaryApproach} onChange={(v) => setFormulaField({ dietaryApproach: v as DietaryApproach })} options={Object.entries(DIETARY_APPROACH_LABELS).map(([value, label]) => ({ value, label }))} /></div>
          </div>

          {bodyReady ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="secondary" size="sm" onClick={() => { setEdited(false); runCalc(formula); }}><Calculator className="size-4" /> Recalculate from body</Button>
              {derivation && <p className="text-xs text-muted-foreground">{String(derivation.bmrFormula) === "katch_mcardle" ? "Katch-McArdle" : "Mifflin-St Jeor"} · BMR {fmtEnergy(Number(derivation.bmr), units, false)} · TDEE {fmtEnergy(Number(derivation.tdee), units)}</p>}
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-xl bg-secondary/60 p-3 text-sm text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>Add {gaps.join(", ")} to the client's profile to calculate targets automatically — or type them in below.</span>
            </div>
          )}

          {/* Targets — autofilled from the calc, editable for a tweak. */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Targets{bodyReady ? " (tweak if needed)" : ""}</label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {TARGET_FIELDS.map(({ key, metric }) => {
                const m = METRICS[metric];
                return <Field key={key} label={`${m.label} (${unitLabelOf(key, units)})`} icon={m.icon} inputMode="decimal" value={targets[key]} onChange={(e) => { setEdited(true); setTargets((t) => ({ ...t, [key]: e.target.value.replace(/[^\d.]/g, "") })); }} />;
              })}
            </div>
          </div>

          <Field type="date" label="Effective from" icon={Calendar} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} hint={active ? `Replaces "${active.label}" from this date. Past days keep the goal they were logged under.` : "Defaults to today."} />

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

          {/* Optional healthy weight band — suggested from the target weight, so
              nothing to type. Drives the client's In-range / off-track chip. */}
          <div className="rounded-xl bg-secondary/40 p-3">
            <button type="button" className="flex w-full items-center justify-between text-sm font-medium" onClick={() => setRangeOpen((o) => !o)}>
              <span>Healthy weight range <span className="text-muted-foreground">(optional)</span></span>
              <span className="text-muted-foreground">{rangeOpen ? "−" : "+"}</span>
            </button>
            {rangeOpen && (
              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <Field label={`Min (${weightLabel(units)})`} inputMode="decimal" value={form.weightMin} onChange={(e) => setForm({ ...form, weightMin: e.target.value })} />
                  <Field label={`Max (${weightLabel(units)})`} inputMode="decimal" value={form.weightMax} onChange={(e) => setForm({ ...form, weightMax: e.target.value })} />
                </div>
                <p className="text-xs text-muted-foreground">Suggested from the client's target weight. The client sees In range / off track against this band.</p>
              </div>
            )}
          </div>
          <Field label="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Context for this phase" />
          <Button size="lg" className="w-full" disabled={!canSave || busy} onClick={() => void create()}>{busy ? "Saving…" : active ? "Replace goal" : "Set goal"}</Button>
          {!canSave && <p className="text-center text-xs text-muted-foreground">Calculate or type a calorie target to save.</p>}
        </Card>
        </Stagger>
      </section>

      {history.length > 0 && (
        <section className="space-y-2">
          <Eyebrow action={<Badge tone="neutral">{history.length}</Badge>}>Goal history</Eyebrow>
          <Stagger>
          <Card className="space-y-3">
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
        </section>
      )}
      </>)}
      </Reveal>
    </Page>
  );
}
