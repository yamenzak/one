/**
 * GOALS — a client's phases, one live at a time.
 *
 * ── What was wrong with the screen this replaces ─────────────────────────────
 *
 * It was a FORM with some readouts above it. Setting a goal is something a
 * coach does every six or eight weeks; reading the current one is something
 * they do every time they open the tab. The screen was built the other way
 * round: eleven inputs, three selects and a Save button occupied the middle of
 * it permanently, the goal actually in force was a card above them, and every
 * previous phase was a paragraph of dense text at the very bottom under the
 * word "history" — no dates you could compare, no numbers you could line up,
 * and no way to open one.
 *
 * So:
 *
 *   THE ACTIVE GOAL IS THE PAGE.  It is the anchor (§1): what the client is
 *                                 being held to, in full, first.
 *   SETTING ONE IS AN EVENT.      It moves into a sheet, opened from one
 *                                 button. A form you are not filling in should
 *                                 not be on screen.
 *   PHASES ARE A SERIES.          Six weeks of cut then eight of maintenance is
 *                                 a shape, and the coach's question is "how did
 *                                 the numbers move?" — so the phases get a
 *                                 chart across them, on a metric you pick, and
 *                                 the same metric labels every row. Each row
 *                                 opens the phase in full.
 *
 * The domain rules are unchanged: the client's body comes from their profile
 * and their latest measurement (never typed by the coach), targets autofill
 * from a TDEE calc against the chosen formula, and a hand-edit stops the calc
 * overwriting them. Saving supersedes the active goal server-side; past days
 * keep the goal they were logged under.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fmtEnergy, fmtVolume, weightLabel, displayToKg, kgToDisplay,
  kcalToDisplay, displayToKcal, mlToVolumeDisplay, volumeDisplayToMl, energyLabel, volumeLabel,
  calculateNutritionTargets, validateCalculatorInputs, DEFAULT_WEEKLY_LOAD_TARGET,
  PRIMARY_GOAL_LABELS, ACTIVITY_LEVEL_LABELS, DIETARY_APPROACH_LABELS, BMI_CATEGORY_LABELS,
  type ClientPreferences, type BmiCategory, type CalculatorInputs, type Gender, type ActivityLevel, type PrimaryGoal, type DietaryApproach, type UnitPrefs,
} from "@kova/domain";
import {
  Button, Card, Badge, Field, Select, Reveal, SkeletonStatGrid, SkeletonList, Page, Stagger, Eyebrow,
  EmptyState, GlanceStrip, Group, Row, Sheet, SegmentedControl, BarChart, Callout, Delta, useAction,
  ActionResult, toneVar, Target, Activity, Scale, Flame, AlertTriangle, Calculator, Calendar, Plus,
  History, NoData,
} from "@4dl/ui";
import { METRICS, type MetricKey } from "../../registry/index.js";
import { api, errorText } from "../../api.js";
import { useUnits } from "../../units.js";
import { ClientPrefsStrip } from "./ClientPrefsStrip.js";

type TargetKey = "targetCalories" | "targetProteinG" | "targetCarbsG" | "targetFatG" | "targetFiberG" | "targetWaterMl";
type GoalRanges = Record<string, { min: number | null; max: number | null }>;
interface Goal { id: string; label: string; status: string; targets: Record<string, number> | null; ranges?: GoalRanges | null; weeklyLoadTarget?: number | null; notes?: string | null; start_date?: string | null; end_date?: string | null; created_at: string; created_by_name?: string | null }
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
/** The four worth putting side by side across phases. Fibre and water barely
 *  move between phases, and `SegmentedControl` labels at most four (§7). */
const COMPARE: TargetKey[] = ["targetCalories", "targetProteinG", "targetCarbsG", "targetFatG"];
const emptyTargets = (): Record<TargetKey, string> => ({ targetCalories: "", targetProteinG: "", targetCarbsG: "", targetFatG: "", targetFiberG: "", targetWaterMl: "" });
const metricOf = (key: TargetKey): MetricKey => TARGET_FIELDS.find((f) => f.key === key)!.metric;

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

const DAY = 86_400_000;
const dayOf = (s: string | null | undefined) => (s ? s.slice(0, 10) : null);
const fmtDate = (s: string | null | undefined) => (s ? new Date(`${s.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—");
const fmtShort = (s: string | null | undefined) => (s ? new Date(`${s.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—");
const daysBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`)) / DAY));

/** A phase = a goal plus the window it actually covered, which the row above it
 *  in time decides. The server stores `start_date` and only sometimes an
 *  `end_date`, so the end is derived from the next phase's start. */
interface Phase { goal: Goal; start: string; end: string | null; days: number; index: number }

/** The six targets, read-only — the active goal's body and a past phase's
 *  detail are the same object, so they are the same component. */
function TargetGrid({ targets, units }: { targets: Record<string, number> | null; units: UnitPrefs }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {TARGET_FIELDS.map(({ key, metric }) => {
        const m = METRICS[metric];
        const v = targets?.[key];
        return (
          <div key={metric} className="rounded-xl bg-secondary p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><m.icon className="size-3.5" style={{ color: toneVar[m.tone] }} /> {m.label}</div>
            <div className={v == null ? "mt-0.5" : "numeral mt-0.5 text-xl font-semibold"}>{v == null ? <NoData className="text-xs">Not set</NoData> : fmtTarget(key, v, units)}</div>
          </div>
        );
      })}
    </div>
  );
}

export function GoalManager({ clientId }: { clientId: string }) {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [client, setClient] = useState<ClientData | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [formula, setFormula] = useState<Formula>({ primaryGoal: "maintain", activityLevel: "moderate", dietaryApproach: "balanced" });
  const [form, setForm] = useState({ label: "", startDate: "", weightMin: "", weightMax: "", notes: "" });
  const [weeklyLoad, setWeeklyLoad] = useState(""); // trainer-set weekly Training-Load target (SPEC §8.11)
  const [rangeOpen, setRangeOpen] = useState(false);
  const [targets, setTargets] = useState<Record<TargetKey, string>>(emptyTargets);
  const [edited, setEdited] = useState(false); // coach hand-tweaked → don't auto-overwrite
  const [derivation, setDerivation] = useState<Record<string, unknown> | null>(null);
  const [composing, setComposing] = useState(false); // the new-phase sheet
  const [openPhase, setOpenPhase] = useState<Phase | null>(null);
  const [compare, setCompare] = useState<TargetKey>("targetCalories");
  const [loadError, setLoadError] = useState(false);
  const units = useUnits();
  const act = useAction(errorText);

  // `goals` gates the whole screen, so an uncaught read left a permanent
  // skeleton — the coach couldn't see the active goal OR set a new one, with
  // nothing on screen saying why. Keep any goals we already had; offer a retry.
  const load = useCallback(async () => {
    setLoadError(false);
    try { setGoals((await api.get<{ goals: Goal[] }>(`/api/goals?clientId=${clientId}`)).goals); }
    catch { setLoadError(true); }
  }, [clientId]);
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

  const active = goals?.find((g) => g.status === "active");

  /**
   * Every phase in time order, with the window it covered.
   *
   * Derived rather than stored: the goal rows carry a start and only sometimes
   * an end, so the end of one phase is the start of the next. The active phase
   * runs to today, which is what makes "day 24 of this phase" sayable.
   */
  const phases = useMemo<Phase[]>(() => {
    const sorted = [...(goals ?? [])].sort((a, b) =>
      (dayOf(a.start_date) ?? dayOf(a.created_at)!).localeCompare(dayOf(b.start_date) ?? dayOf(b.created_at)!));
    const today = new Date().toISOString().slice(0, 10);
    return sorted.map((goal, index) => {
      const start = dayOf(goal.start_date) ?? dayOf(goal.created_at)!;
      const next = sorted[index + 1];
      const end = next ? (dayOf(next.start_date) ?? dayOf(next.created_at)!) : dayOf(goal.end_date);
      return { goal, start, end, days: daysBetween(start, end ?? today), index };
    });
  }, [goals]);
  /** Newest first for reading; the chart re-reverses for time order. */
  const newestFirst = useMemo(() => [...phases].reverse(), [phases]);

  // Seed the weekly-load input from the active goal so the coach edits the live
  // value rather than a blank. Prefer the RESOLVED `weeklyLoadTarget` the route
  // returns (targets_json → mirrored column → domain default) so the coach sees
  // the exact number every consumer grades against — including on legacy rows
  // whose value only ever reached the column.
  useEffect(() => {
    const v = active?.targets?.weeklyTrainingLoad ?? active?.weeklyLoadTarget;
    if (typeof v === "number" && v > 0) setWeeklyLoad(String(v));
  }, [active]);

  /**
   * Open the composer, prefilled.
   *
   * Prefilling happens HERE rather than once at mount, which is where the old
   * screen did it: a coach who opened the form, closed it, weighed the client
   * and came back got the numbers from before the weigh-in, silently.
   *
   * Order matters — seed from the goal in force so the coach is editing the
   * live numbers, then let the calc overwrite them when the body is complete
   * enough to compute. When it is not, the seeded values are the whole point.
   */
  const compose = () => {
    const p = client?.preferences ?? {};
    const f: Formula = {
      primaryGoal: (p.primaryGoal as PrimaryGoal) ?? "maintain",
      activityLevel: (p.activityLevel as ActivityLevel) ?? "moderate",
      dietaryApproach: (p.dietaryApproach as DietaryApproach) ?? "balanced",
    };
    setFormula(f);
    setEdited(false);
    setDerivation(null);
    const seeded = emptyTargets();
    for (const { key } of TARGET_FIELDS) {
      const v = active?.targets?.[key];
      if (typeof v === "number") seeded[key] = String(toDisplayVal(key, v, units));
    }
    setTargets(seeded);
    const band = active?.ranges?.weightKg;
    const lo = band?.min ?? (p.targetWeightKg != null ? p.targetWeightKg - 2 : null);
    const hi = band?.max ?? (p.targetWeightKg != null ? p.targetWeightKg + 2 : null);
    setForm({
      label: "", startDate: "", notes: "",
      weightMin: lo != null ? String(kgToDisplay(lo, units)) : "",
      weightMax: hi != null ? String(kgToDisplay(hi, units)) : "",
    });
    setRangeOpen(Boolean(band?.min != null || band?.max != null));
    if (bodyReady) runCalc(f);
    act.clear();
    setComposing(true);
  };

  // Changing the formula recalculates — unless the coach has hand-edited targets.
  const setFormulaField = (patch: Partial<Formula>) => {
    const next = { ...formula, ...patch };
    setFormula(next);
    if (!edited && bodyReady) runCalc(next);
  };

  const create = async () => {
    let saved = false;
    await act.run("create", async () => {
      const targetsObj: Record<string, number> = {};
      for (const { key } of TARGET_FIELDS) if (targets[key] !== "" && Number.isFinite(Number(targets[key]))) targetsObj[key] = toMetricVal(key, Number(targets[key]), units);
      // Weekly Training-Load target rides on targets_json ("weeklyTrainingLoad"),
      // read back by the client's Train tab (SPEC §8.11). Metric — no unit convert.
      if (weeklyLoad !== "" && Number.isFinite(Number(weeklyLoad)) && Number(weeklyLoad) > 0) targetsObj.weeklyTrainingLoad = Math.round(Number(weeklyLoad));
      const rangesObj: GoalRanges = {};
      if (rangeOpen && (form.weightMin || form.weightMax)) rangesObj.weightKg = { min: form.weightMin ? displayToKg(Number(form.weightMin), units) : null, max: form.weightMax ? displayToKg(Number(form.weightMax), units) : null };
      const ranges = Object.keys(rangesObj).length ? rangesObj : undefined;
      // Send the calculator (from the client's body) so the goal keeps its
      // BMR/TDEE derivation snapshot for staleness detection; the explicit
      // targets (possibly tweaked) still win server-side.
      const inputs = bodyInputs(formula);
      const calculator = bodyReady && validateCalculatorInputs(inputs).length === 0 ? inputs : undefined;
      await api.post<{ derivation: Record<string, unknown> }>("/api/goals", {
        clientId, label: form.label || "New phase", notes: form.notes || undefined, ranges,
        startDate: form.startDate || undefined,
        targets: Object.keys(targetsObj).length ? targetsObj : undefined,
        calculator,
      });
      await load();
      void api.get<{ client: ClientData; metrics: Metrics }>(`/api/clients/${clientId}`).then((r) => { setMetrics(r.metrics); }).catch(() => undefined);
      saved = true;
      // The disabled state only covers a missing calorie target — a rejected POST
      // (409 on a superseding goal, 5xx, offline) used to be swallowed, so
      // "Replace goal" simply did nothing and the client kept the old targets.
      return active ? "New phase is live — the client's targets have changed." : "Goal set. The client sees their targets now.";
    }, "Couldn't save this goal. Nothing was changed.");
    if (saved) setComposing(false);
  };

  const canSave = Number(targets.targetCalories) > 0;
  const newCals = targets.targetCalories !== "" && Number.isFinite(Number(targets.targetCalories)) ? toMetricVal("targetCalories", Number(targets.targetCalories), units) : null;
  const oldCals = active?.targets?.targetCalories ?? null;
  const calDelta = newCals != null && oldCals != null ? newCals - oldCals : null;

  /** The compared metric across phases, oldest → newest. A single phase is not
   *  a comparison, so the chart only appears from two (§1, same rule as
   *  `GlanceStrip`). */
  const series = useMemo(() => phases.filter((p) => typeof p.goal.targets?.[compare] === "number"), [phases, compare]);
  const compareMetric = METRICS[metricOf(compare)];
  const selRow = "mb-1.5 block text-sm font-medium text-muted-foreground";

  return (
    <Page className="column space-y-4 p-4 pb-28">
      {loadError && !goals ? (
        <EmptyState icon={AlertTriangle} title="Couldn't load goals" description="Something went wrong reaching the server. Check your connection and try again." action={<Button onClick={() => void load()}>Try again</Button>} />
      ) : (
      <Reveal loading={!goals} className="space-y-4" skeleton={
        <>
          <SkeletonStatGrid count={6} cols={3} />
          <SkeletonList card rows={6} thumb={0} />
        </>
      }>
      {goals && (<>
      {metrics?.staleness?.stale && (
        <Stagger>
          <Callout tone="warning" icon={AlertTriangle}>
            <span className="font-semibold">This goal may be stale.</span>{" "}
            {metrics.staleness.reason ?? "The client's body has moved since it was set."}
          </Callout>
        </Stagger>
      )}

      {/* ── The anchor: what the client is being held to right now ───────────── */}
      <section className="space-y-2">
        <Eyebrow action={goals.length > 0 ? <Button size="sm" variant="secondary" onClick={compose}><Plus /> New phase</Button> : undefined}>
          {active ? "Active goal" : "Goal"}
        </Eyebrow>
        <Stagger>
          {active ? (
            <Card className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-title-2">{active.label}</div>
                  <div className="text-caption text-muted-foreground">
                    Day {daysBetween(dayOf(active.start_date) ?? dayOf(active.created_at)!, new Date().toISOString().slice(0, 10)) + 1} · since {fmtDate(active.start_date || active.created_at)}
                    {active.created_by_name ? ` · set by ${active.created_by_name}` : ""}
                  </div>
                </div>
                <Badge tone="success">Active</Badge>
              </div>
              <TargetGrid targets={active.targets} units={units} />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted-foreground">
                <span className="numeral">Weekly training load {active.targets?.weeklyTrainingLoad ?? active.weeklyLoadTarget ?? DEFAULT_WEEKLY_LOAD_TARGET}</span>
                {active.ranges?.weightKg && (
                  <span className="numeral">
                    Healthy weight {active.ranges.weightKg.min != null ? kgToDisplay(active.ranges.weightKg.min, units) : "—"}–{active.ranges.weightKg.max != null ? kgToDisplay(active.ranges.weightKg.max, units) : "—"} {weightLabel(units)}
                  </span>
                )}
              </div>
              {active.notes && <p className="rounded-xl bg-secondary p-3 text-sm text-muted-foreground">{active.notes}</p>}
            </Card>
          ) : (
            <EmptyState
              icon={Target}
              title={goals.length ? "No goal in force" : "No goal set yet"}
              description="A goal gives this client their daily calories, macros, water and weekly training load. Kova works them out from their body — you tweak what you want."
              action={<Button onClick={compose}><Plus /> Set a goal</Button>}
            />
          )}
        </Stagger>
      </section>

      {/* The client's body — pulled automatically, drives the calc. A card-less
          glance strip: a deliberate break from the boxed-card rhythm. */}
      {metrics && (metrics.bmi != null || metrics.bmr != null || metrics.weightKg != null) && (
        <section className="space-y-2">
          <Eyebrow action={metrics.measuredAt ? <Badge tone="neutral">{fmtShort(metrics.measuredAt)}</Badge> : undefined}>Body snapshot</Eyebrow>
          <Stagger>
            <GlanceStrip items={[
              { icon: Scale, tone: "cardio", value: metrics.weightKg != null ? <>{kgToDisplay(metrics.weightKg, units)}<span className="ml-1 text-xs font-medium text-muted-foreground">{weightLabel(units)}</span></> : null, label: <>Weight<StatusChip status={metrics.weightStatus} /></> },
              { icon: Activity, tone: "activity", value: metrics.bmi ?? null, label: metrics.bmiCategory ? BMI_CATEGORY_LABELS[metrics.bmiCategory] : "BMI" },
              { icon: Flame, tone: "calories", value: metrics.bmr ?? null, label: metrics.bmr != null ? "BMR · kcal/day" : "BMR" },
              { icon: Target, tone: "sleep", value: metrics.bodyFatPercent != null ? `${metrics.bodyFatPercent}%` : null, label: "Body fat" },
            ]} />
          </Stagger>
        </section>
      )}

      {/* ── The series: every phase, on one metric at a time ─────────────────── */}
      {phases.length > 0 && (
        <section className="space-y-2">
          <Eyebrow action={<Badge tone="neutral">{phases.length} {phases.length === 1 ? "phase" : "phases"}</Badge>}>Phases</Eyebrow>
          <Stagger>
            <Card className="space-y-3">
              {/*
                One picker driving BOTH the chart and the value on every row
                below. Two controls would let them disagree, and a list whose
                right-hand column silently means something else from the chart
                above it is worse than no column at all.
              */}
              <SegmentedControl
                fill
                value={compare}
                onChange={setCompare}
                options={COMPARE.map((key) => ({ value: key, label: METRICS[metricOf(key)].label }))}
              />
              {series.length >= 2 ? (
                <>
                  <BarChart
                    values={series.map((p) => p.goal.targets![compare]!)}
                    labels={series.map((p) => fmtShort(p.start))}
                    tone={compareMetric.tone}
                    height={140}
                    format={(v) => fmtTarget(compare, v, units)}
                  />
                  <div className="flex items-center justify-between gap-2 text-caption text-muted-foreground">
                    <span>{fmtShort(series[0]!.start)} → now</span>
                    <Delta
                      value={series[series.length - 1]!.goal.targets![compare]! - series[0]!.goal.targets![compare]!}
                      format={(v) => fmtTarget(compare, v, units)}
                      zeroLabel="Unchanged"
                    />
                  </div>
                </>
              ) : (
                <p className="text-caption text-muted-foreground">
                  One phase so far. The chart appears once there is a second to compare it against.
                </p>
              )}
            </Card>

            <Group>
              {newestFirst.map((p) => {
                const prev = phases[p.index - 1];
                const v = p.goal.targets?.[compare];
                const prevV = prev?.goal.targets?.[compare];
                return (
                  <Row
                    key={p.goal.id}
                    icon={p.goal.status === "active" ? Target : History}
                    onClick={() => setOpenPhase(p)}
                    sub={p.end ? `${fmtShort(p.start)} → ${fmtShort(p.end)} · ${p.days} days` : `Since ${fmtShort(p.start)} · day ${p.days + 1}`}
                    value={typeof v === "number" ? fmtTarget(compare, v, units) : <NoData className="text-sm">Not set</NoData>}
                    valueSub={typeof v === "number" && typeof prevV === "number"
                      ? <Delta value={v - prevV} format={(d) => fmtTarget(compare, d, units)} zeroLabel="Same" />
                      : undefined}
                  >
                    {p.goal.label}
                  </Row>
                );
              })}
            </Group>
          </Stagger>
        </section>
      )}
      </>)}
      </Reveal>
      )}

      {/* ── A past phase, in full ────────────────────────────────────────────── */}
      <Sheet open={openPhase != null} onClose={() => setOpenPhase(null)} title={openPhase?.goal.label ?? "Phase"}>
        {openPhase && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={openPhase.goal.status === "active" ? "success" : "neutral"}>
                {openPhase.goal.status === "active" ? "Active" : "Ended"}
              </Badge>
              <span className="numeral text-caption text-muted-foreground">
                {fmtDate(openPhase.start)} → {openPhase.end ? fmtDate(openPhase.end) : "now"} · {openPhase.days} days
              </span>
            </div>
            <TargetGrid targets={openPhase.goal.targets} units={units} />
            <div className="numeral text-caption text-muted-foreground">
              Weekly training load {openPhase.goal.targets?.weeklyTrainingLoad ?? openPhase.goal.weeklyLoadTarget ?? DEFAULT_WEEKLY_LOAD_TARGET}
              {openPhase.goal.created_by_name ? ` · set by ${openPhase.goal.created_by_name}` : ""}
            </div>
            {openPhase.goal.notes && <p className="rounded-xl bg-secondary p-3 text-sm text-muted-foreground">{openPhase.goal.notes}</p>}
          </div>
        )}
      </Sheet>

      {/* ── The composer ─────────────────────────────────────────────────────── */}
      <Sheet
        open={composing}
        onClose={() => setComposing(false)}
        size="tall"
        title={active ? "New phase" : "Set the goal"}
        footer={
          <div className="space-y-1.5">
            <Button size="lg" className="w-full" disabled={!canSave || act.busy === "create"} onClick={() => void create()}>
              {act.busy === "create" ? "Saving…" : active ? `Replace “${active.label}”` : "Set goal"}
            </Button>
            {!canSave && <p className="text-center text-caption text-muted-foreground">Calculate or type a calorie target to save.</p>}
          </div>
        }
      >
        <div className="space-y-3">
          {/* What the client asked for — the context this decision is made
              against, and the same strip the plan builders show. */}
          <ClientPrefsStrip clientId={clientId} prefs={client?.preferences ?? null} />

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
              <Button variant="secondary" size="sm" onClick={() => { setEdited(false); runCalc(formula); }}><Calculator /> Recalculate from body</Button>
              {derivation && <p className="text-caption text-muted-foreground">{String(derivation.bmrFormula) === "katch_mcardle" ? "Katch-McArdle" : "Mifflin-St Jeor"} · BMR {fmtEnergy(Number(derivation.bmr), units, false)} · TDEE {fmtEnergy(Number(derivation.tdee), units)}</p>}
            </div>
          ) : (
            <Callout tone="warning" icon={AlertTriangle}>
              Add {gaps.join(", ")} to the client's profile to calculate targets automatically — or type them in below.
            </Callout>
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

          {active?.targets && newCals != null && calDelta != null && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary p-3 text-sm">
              <span className="text-muted-foreground">Calories</span>
              <span className="flex items-center gap-2">
                <span className="numeral font-semibold">{fmtEnergy(newCals, units)}</span>
                <Delta value={calDelta} format={(v) => `${kcalToDisplay(v, units)} ${energyLabel(units)}`} zeroLabel="Unchanged" />
              </span>
            </div>
          )}

          {/* Weekly Training-Load target — the client's Train tab rings against
              this (SPEC §8.11); blank falls back to the default. */}
          <Field label="Weekly training-load target" icon={Activity} inputMode="numeric" value={weeklyLoad} onChange={(e) => setWeeklyLoad(e.target.value.replace(/[^\d]/g, ""))} placeholder={String(DEFAULT_WEEKLY_LOAD_TARGET)} hint="Summed session load the client aims for each week." />

          <Field type="date" label="Effective from" icon={Calendar} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} hint={active ? "Past days keep the goal they were logged under." : "Defaults to today."} />

          {/* Optional healthy weight band — suggested from the target weight, so
              nothing to type. Drives the client's In-range / off-track chip. */}
          <div className="rounded-xl bg-secondary/40 p-3">
            <button type="button" className="flex min-h-11 w-full items-center justify-between text-sm font-medium" onClick={() => setRangeOpen((o) => !o)} aria-expanded={rangeOpen}>
              <span>Healthy weight range <span className="text-muted-foreground">(optional)</span></span>
              <span className="text-muted-foreground">{rangeOpen ? "−" : "+"}</span>
            </button>
            {rangeOpen && (
              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <Field label={`Min (${weightLabel(units)})`} inputMode="decimal" value={form.weightMin} onChange={(e) => setForm({ ...form, weightMin: e.target.value })} />
                  <Field label={`Max (${weightLabel(units)})`} inputMode="decimal" value={form.weightMax} onChange={(e) => setForm({ ...form, weightMax: e.target.value })} />
                </div>
                <p className="text-caption text-muted-foreground">The client sees In range / off track against this band.</p>
              </div>
            )}
          </div>

          <Field label="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Context for this phase" />
        </div>
      </Sheet>

      <ActionResult msg={act.msg} err={act.err} />
    </Page>
  );
}
