/**
 * Client home widgets — the catalogue behind the swipeable Today hero.
 *
 * Three rules this file exists to hold, each from a defect the old catalogue
 * shipped with:
 *
 * 1. **A widget declares which FORMS suit it, and a metric with no target does
 *    not offer a ring.** Weight change, calories burned, sets, body fat and
 *    labs were all drawn as rings with `progress={0.001}` — a ring is a claim
 *    that there is a whole to fill, and an always-empty one is indistinguishable
 *    from a target the client is failing. Those metrics now offer `stat`, which
 *    draws a number and no denominator.
 *
 * 2. **Nothing here duplicates a fixed surface.** Today's anchor owns calories
 *    and the `MacroBar` beneath it owns protein/carbs/fat, so the carousel
 *    offers none of the four. The DEFAULTS were fixed for this once; the
 *    CATALOGUE was not, so any client could re-add protein and see it three
 *    times in 200px — ring, pill, and the macro bar's own chip.
 *
 * 3. **Every value is read for the day being viewed.** Widgets used to fetch
 *    for themselves, and a widget that fetches is a widget that picks its own
 *    date: the supplements tile asked for `todayLocal()` no matter which day
 *    the picker was on, and body fat took the newest scan even on a day before
 *    that scan happened. Everything now comes from `bundle.metrics`, which the
 *    route resolves FOR the requested date.
 *
 * The live fasting tracker is the one deliberate exception to (3) — a running
 * fast is a property of NOW, not of the day you are reading, so it hides itself
 * on any day but today rather than pretending to be historical.
 */

import { useCallback, useEffect, useState } from "react";
import { currentStreak, fmtVolume, kcalToDisplay, kgToDisplay, weightLabel, energyLabel, fmtLength, lengthLabel, type UnitPrefs } from "@kova/domain";
import {
  Chip, Button, IconBadge, ProgressRing, TileCard, TileStat, TileRing, TileTrend, TileWeek,
  Timer, FlaskConical, Pill, HeartPulse, Footprints, Ruler, Activity, Dumbbell, ClipboardList,
  type TileForm, type Tone, type LucideIcon,
} from "@4dl/ui";
import type { FeatureKey } from "@kova/domain";
import { METRICS, FASTING_ZONES } from "../../registry/index.js";
import { api } from "../../api.js";
import type { TodayBundle } from "./Today.js";

export interface ClientWidgetData { clientId: string; units: UnitPrefs; bundle: TodayBundle; isToday: boolean }

/**
 * Which half of a coaching package a widget belongs to.
 *
 * A studio can sell a workout-only or a meal-only package (the access economy
 * carries separate `workout` and `meal` budgets), and a client on one should not
 * be shown the other half's metrics — an empty "Meals logged" tile on a
 * training-only package reads as a bug in the app rather than as a thing they
 * did not buy.
 *
 * A lane asks for ANY capability in that half, not plan access specifically:
 * a client who self-logs food without following a meal plan still has a
 * nutrition side to their package and should keep their own numbers.
 */
export type WidgetLane = "meal" | "workout";

export interface ClientWidgetDef {
  id: string;
  title: string;
  /** One line in the picker, so a client knows what they are adding. */
  blurb: string;
  icon: LucideIcon;
  tone: Tone;
  /** The forms this metric can honestly take. First is the default. */
  forms: TileForm[];
  render: (form: TileForm, d: ClientWidgetData) => React.ReactNode;
  /** Data-driven visibility — hide when there is structurally nothing to show. */
  available?: (d: ClientWidgetData) => boolean;
  feature?: FeatureKey;
  lane?: WidgetLane;
}

/**
 * The default carousel: everything Today does not already show.
 *
 * The anchor owns calories, the macro bar owns protein/carbs/fat, and the
 * carousel owns everything else. Anyone who already customised keeps their own
 * layout — defaults only apply when nothing is saved.
 */
export const DEFAULT_CLIENT_WIDGETS: { id: string; form: TileForm; page: number }[] = [
  { id: "water", form: "ring", page: 0 },
  { id: "burned", form: "card", page: 0 },
  { id: "steps", form: "card", page: 0 },
  { id: "sleep", form: "card", page: 0 },
  { id: "weight", form: "trend", page: 1 },
  { id: "checkins", form: "week", page: 1 },
  { id: "streak", form: "card", page: 1 },
  { id: "sets", form: "card", page: 1 },
];

const pad = (n: number) => String(n).padStart(2, "0");
const ratio = (v: number, t?: number | null) => (t && t > 0 ? v / t : undefined);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Signed, one decimal — for a delta that should read as a direction. */
const signed = (n: number | null): string | null => (n == null ? null : `${n > 0 ? "+" : ""}${round1(n)}`);

function weightDelta(series: { kg: number; date: string }[] | undefined, units: UnitPrefs): number | null {
  if (!series || series.length < 2) return null;
  const last = series[series.length - 1]!;
  const target = Date.parse(last.date) - 7 * 86400000;
  let ref = series[0]!;
  for (const p of series) if (Math.abs(Date.parse(p.date) - target) < Math.abs(Date.parse(ref.date) - target)) ref = p;
  return round1(kgToDisplay(last.kg, units) - kgToDisplay(ref.kg, units));
}

/** The seven days ending on `date`, as ISO strings. */
function weekEnding(date: string): string[] {
  const out: string[] = [];
  const d = new Date(`${date}T00:00:00`);
  for (let i = 6; i >= 0; i--) {
    const x = new Date(d);
    x.setDate(x.getDate() - i);
    out.push(`${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`);
  }
  return out;
}

/** A 1–5 self-report, rendered as its number over five. */
const scale5 = (form: TileForm, d: ClientWidgetData, key: "mood" | "energy" | "stress", label: string) => {
  const m = d.bundle.metrics;
  const v = m ? m[key] : null;
  const meta = METRICS[key];
  if (form === "ring") return <TileRing tone={meta.tone} progress={v != null ? v / 5 : 0.001} value={v ?? null} label={label} sublabel={v != null ? "out of 5" : "not logged"} />;
  if (form === "stat") return <TileStat icon={meta.icon} tone={meta.tone} label={label} value={v} unit={v != null ? "/5" : undefined} />;
  return <TileCard icon={meta.icon} tone={meta.tone} label={label} value={v} unit={v != null ? "/5" : undefined} progress={v != null ? v / 5 : undefined} />;
};

export const CLIENT_WIDGETS: ClientWidgetDef[] = [
  // ── Hydration ──────────────────────────────────────────────────────────────
  {
    id: "water", title: "Water", blurb: "How much you've drunk against your target",
    icon: METRICS.water.icon, tone: METRICS.water.tone, feature: "waterLogging",
    forms: ["ring", "card", "stat"],
    render: (form, d) => {
      const t = d.bundle.goal?.targets?.targetWaterMl ?? 2500;
      const v = d.bundle.waterMl;
      if (form === "ring") return <TileRing tone={METRICS.water.tone} progress={v / t} value={fmtVolume(v, d.units)} label="Water" sublabel={`of ${fmtVolume(t, d.units)}`} />;
      if (form === "stat") return <TileStat icon={METRICS.water.icon} tone={METRICS.water.tone} label="Water" value={fmtVolume(v, d.units)} delta={`of ${fmtVolume(t, d.units)}`} />;
      return <TileCard icon={METRICS.water.icon} tone={METRICS.water.tone} label="Water" value={fmtVolume(v, d.units)} progress={v / t} />;
    },
  },

  // ── Training ───────────────────────────────────────────────────────────────
  {
    id: "sets", title: "Sets logged", blurb: "Sets you completed on this day",
    icon: METRICS.sets.icon, tone: METRICS.sets.tone, feature: "workoutPlan", lane: "workout",
    // No target, so no ring.
    forms: ["card", "stat"],
    render: (form, d) => form === "stat"
      ? <TileStat icon={METRICS.sets.icon} tone={METRICS.sets.tone} label="Sets logged" value={d.bundle.workout.loggedSets} />
      : <TileCard icon={METRICS.sets.icon} tone={METRICS.sets.tone} label="Sets logged" value={d.bundle.workout.loggedSets} />,
  },
  {
    id: "tonnage", title: "Volume lifted", blurb: "Total weight moved — reps × load",
    icon: METRICS.tonnage.icon, tone: METRICS.tonnage.tone, feature: "exerciseReport", lane: "workout",
    forms: ["stat", "card"],
    available: (d) => (d.bundle.workout.tonnageKg ?? 0) > 0,
    render: (form, d) => {
      const kg = d.bundle.workout.tonnageKg ?? 0;
      const v = Math.round(kgToDisplay(kg, d.units)).toLocaleString();
      return form === "card"
        ? <TileCard icon={METRICS.tonnage.icon} tone={METRICS.tonnage.tone} label="Volume" value={v} unit={weightLabel(d.units)} />
        : <TileStat icon={METRICS.tonnage.icon} tone={METRICS.tonnage.tone} label="Volume lifted" value={v} unit={weightLabel(d.units)} />;
    },
  },
  {
    id: "burned", title: "Calories burned", blurb: "Energy from activities you logged",
    icon: METRICS.burned.icon, tone: METRICS.burned.tone, feature: "extraWorkouts",
    forms: ["card", "stat"],
    render: (form, d) => {
      const v = kcalToDisplay(d.bundle.burnedKcal, d.units).toLocaleString();
      return form === "stat"
        ? <TileStat icon={METRICS.burned.icon} tone={METRICS.burned.tone} label="Burned" value={v} unit={energyLabel(d.units)} />
        : <TileCard icon={METRICS.burned.icon} tone={METRICS.burned.tone} label="Burned" value={v} unit={energyLabel(d.units)} />;
    },
  },
  {
    id: "active", title: "Active minutes", blurb: "Time spent in logged activities",
    icon: METRICS.activeMinutes.icon, tone: METRICS.activeMinutes.tone, feature: "extraWorkouts",
    forms: ["card", "stat"],
    render: (form, d) => {
      const m = d.bundle.metrics?.activeMinutes ?? 0;
      const n = d.bundle.metrics?.activityCount ?? 0;
      return form === "stat"
        ? <TileStat icon={METRICS.activeMinutes.icon} tone={METRICS.activeMinutes.tone} label="Active minutes" value={m} unit="min" delta={n ? `${n} ${n === 1 ? "activity" : "activities"}` : null} />
        : <TileCard icon={METRICS.activeMinutes.icon} tone={METRICS.activeMinutes.tone} label="Active" value={m} unit="min" />;
    },
  },
  {
    id: "steps", title: "Steps", blurb: "Steps recorded on your check-in",
    icon: METRICS.steps.icon, tone: METRICS.steps.tone, feature: "checkIns",
    forms: ["card", "stat"],
    render: (form, d) => {
      const v = d.bundle.metrics?.steps ?? null;
      return form === "stat"
        ? <TileStat icon={METRICS.steps.icon} tone={METRICS.steps.tone} label="Steps" value={v?.toLocaleString() ?? null} />
        : <TileCard icon={METRICS.steps.icon} tone={METRICS.steps.tone} label="Steps" value={v?.toLocaleString() ?? null} />;
    },
  },

  // ── Body ───────────────────────────────────────────────────────────────────
  {
    id: "weight", title: "Weight · 7 days", blurb: "Which way your weight is going",
    icon: METRICS.weight.icon, tone: METRICS.weight.tone, feature: "measurementLogging",
    forms: ["trend", "card", "stat"],
    render: (form, d) => {
      const delta = weightDelta(d.bundle.weightSeries, d.units);
      const series = (d.bundle.weightSeries ?? []).map((p) => kgToDisplay(p.kg, d.units));
      const latest = series.length ? round1(series[series.length - 1]!) : null;
      if (form === "trend") return <TileTrend icon={METRICS.weight.icon} tone={METRICS.weight.tone} label="Weight" value={latest ?? ""} unit={weightLabel(d.units)} values={series} />;
      if (form === "stat") return <TileStat icon={METRICS.weight.icon} tone={METRICS.weight.tone} label="Weight" value={latest} unit={weightLabel(d.units)} delta={delta != null ? `${signed(delta)} ${weightLabel(d.units)} in 7 days` : null} deltaGood={null} />;
      return <TileCard icon={METRICS.weight.icon} tone={METRICS.weight.tone} label="Weight · 7 days" value={signed(delta)} unit={weightLabel(d.units)} />;
    },
  },
  {
    id: "bodyfat", title: "Body fat", blurb: "Your latest estimate and how it moved",
    icon: METRICS.bodyFat.icon, tone: METRICS.bodyFat.tone, feature: "bodyScan",
    forms: ["stat", "card"],
    render: (form, d) => {
      const m = d.bundle.metrics;
      const v = m?.bodyFatPercent ?? null;
      const prev = m?.bodyFatPrev ?? null;
      const delta = v != null && prev != null ? round1(v - prev) : null;
      return form === "card"
        ? <TileCard icon={METRICS.bodyFat.icon} tone={METRICS.bodyFat.tone} label="Body fat" value={v != null ? `${round1(v)}%` : null} />
        : <TileStat icon={METRICS.bodyFat.icon} tone={METRICS.bodyFat.tone} label="Body fat" value={v != null ? round1(v) : null} unit="%" delta={delta != null ? `${signed(delta)}% vs last` : null} deltaGood={delta != null ? delta < 0 : null} />;
    },
  },
  {
    id: "waist", title: "Waist", blurb: "Your most recent waist measurement",
    icon: Ruler, tone: METRICS.waist.tone, feature: "measurementLogging",
    forms: ["card", "stat"],
    available: (d) => d.bundle.metrics?.waistCm != null,
    render: (form, d) => {
      const cm = d.bundle.metrics?.waistCm ?? null;
      const v = cm != null ? fmtLength(cm, d.units, false) : null;
      return form === "stat"
        ? <TileStat icon={METRICS.waist.icon} tone={METRICS.waist.tone} label="Waist" value={v} unit={lengthLabel(d.units)} />
        : <TileCard icon={METRICS.waist.icon} tone={METRICS.waist.tone} label="Waist" value={v} unit={lengthLabel(d.units)} />;
    },
  },

  // ── Wellness ───────────────────────────────────────────────────────────────
  {
    id: "sleep", title: "Sleep", blurb: "Hours slept, and how it felt",
    icon: METRICS.sleep.icon, tone: METRICS.sleep.tone, feature: "sleepLogging",
    forms: ["card", "stat"],
    render: (form, d) => {
      const m = d.bundle.metrics;
      const h = m?.sleepHours ?? null;
      const q = m?.sleepQuality ?? null;
      return form === "stat"
        ? <TileStat icon={METRICS.sleep.icon} tone={METRICS.sleep.tone} label="Sleep" value={h} unit="h" delta={q != null ? `quality ${q}/5` : null} />
        : <TileCard icon={METRICS.sleep.icon} tone={METRICS.sleep.tone} label="Sleep" value={h} unit={h != null ? "h" : undefined} />;
    },
  },
  { id: "mood", title: "Mood", blurb: "How you rated your mood", icon: METRICS.mood.icon, tone: METRICS.mood.tone, feature: "moodLogging", forms: ["card", "stat", "ring"], render: (f, d) => scale5(f, d, "mood", "Mood") },
  { id: "energy", title: "Energy", blurb: "How much energy you had", icon: METRICS.energy.icon, tone: METRICS.energy.tone, feature: "moodLogging", forms: ["card", "stat", "ring"], render: (f, d) => scale5(f, d, "energy", "Energy") },
  { id: "stress", title: "Stress", blurb: "How stressed you felt", icon: METRICS.stress.icon, tone: METRICS.stress.tone, feature: "moodLogging", forms: ["card", "stat", "ring"], render: (f, d) => scale5(f, d, "stress", "Stress") },
  {
    id: "wellness", title: "Wellness score", blurb: "Your overall score across every pillar",
    icon: METRICS.wellness.icon, tone: METRICS.wellness.tone,
    forms: ["ring", "card"],
    render: (form, d) => <WellnessWidget clientId={d.clientId} date={d.bundle.date} form={form} />,
  },

  // ── Consistency ────────────────────────────────────────────────────────────
  {
    id: "checkins", title: "Check-in week", blurb: "Which days this week you checked in",
    icon: METRICS.checkins.icon, tone: METRICS.checkins.tone, feature: "checkIns",
    forms: ["week"],
    render: (_f, d) => {
      const done = new Set(d.bundle.checkInDates ?? []);
      const days = weekEnding(d.bundle.date);
      const n = days.filter((x) => done.has(x)).length;
      return <TileWeek icon={METRICS.checkins.icon} tone={METRICS.checkins.tone} label="Check-ins" value={`${n}/7`} days={days.map((x) => done.has(x))} todayIndex={6} />;
    },
  },
  {
    id: "streak", title: "Check-in streak", blurb: "Days in a row you've checked in",
    icon: METRICS.streak.icon, tone: METRICS.streak.tone, feature: "checkIns",
    forms: ["card", "stat"],
    render: (form, d) => {
      const v = d.bundle.checkInDates ? currentStreak(new Set(d.bundle.checkInDates), d.bundle.date) : 0;
      return form === "stat"
        ? <TileStat icon={METRICS.streak.icon} tone={METRICS.streak.tone} label="Check-in streak" value={v} unit={v === 1 ? "day" : "days"} />
        : <TileCard icon={METRICS.streak.icon} tone={METRICS.streak.tone} label="Check-in streak" value={v} unit="days" />;
    },
  },

  // ── Supplements & labs ─────────────────────────────────────────────────────
  {
    id: "supplements", title: "Supplements", blurb: "How many of the day's doses you took",
    icon: METRICS.supplements.icon, tone: METRICS.supplements.tone, feature: "supplementsLabs",
    forms: ["ring", "card"],
    available: (d) => (d.bundle.metrics?.supplementsTotal ?? 0) > 0,
    render: (form, d) => {
      const taken = d.bundle.metrics?.supplementsTaken ?? 0;
      const total = d.bundle.metrics?.supplementsTotal ?? 0;
      const p = total ? taken / total : undefined;
      return form === "ring"
        ? <TileRing tone={METRICS.supplements.tone} progress={p ?? 0.001} value={`${taken}/${total}`} label="Supplements" sublabel="taken" />
        : <TileCard icon={METRICS.supplements.icon} tone={METRICS.supplements.tone} label="Supplements" value={`${taken}/${total}`} progress={p} />;
    },
  },
  {
    id: "labs", title: "Labs due", blurb: "Lab tests waiting on you",
    icon: METRICS.labs.icon, tone: METRICS.labs.tone, feature: "supplementsLabs",
    forms: ["card", "stat"],
    available: (d) => (d.bundle.pendingLabs ?? 0) > 0,
    render: (form, d) => form === "stat"
      ? <TileStat icon={METRICS.labs.icon} tone={METRICS.labs.tone} label="Labs due" value={d.bundle.pendingLabs ?? 0} delta="waiting on you" />
      : <TileCard icon={METRICS.labs.icon} tone={METRICS.labs.tone} label="Labs due" value={d.bundle.pendingLabs ?? 0} />,
  },

  // ── Fasting (live only — see the file header) ───────────────────────────────
  {
    id: "fasting", title: "Fasting timer", blurb: "Start, watch and end a fast",
    icon: METRICS.fasting.icon, tone: METRICS.fasting.tone, feature: "fastingTimer",
    forms: ["ring", "card"],
    available: (d) => d.isToday,
    render: (form, d) => <FastingWidget clientId={d.clientId} form={form} />,
  },
];

// ── Wellness score ───────────────────────────────────────────────────────────
const BAND_LABEL: Record<string, string> = { start: "Just starting", building: "Building", solid: "Solid", strong: "Strong", peak: "Peak" };
interface ScoreResult { score: number; band: string }
function WellnessWidget({ clientId, date, form }: { clientId: string; date: string; form: TileForm }) {
  const [res, setRes] = useState<ScoreResult | null>(null);
  // Keyed on `date`, so stepping through days re-reads rather than showing the
  // score for whichever day happened to load first.
  useEffect(() => { setRes(null); void api.get<ScoreResult>(`/api/wellness/score?clientId=${clientId}&today=${date}`).then(setRes).catch(() => setRes({ score: 0, band: "start" })); }, [clientId, date]);
  if (!res) return <div className="h-full animate-pulse rounded-2xl bg-surface-2" />;
  return form === "ring"
    ? <TileRing tone={METRICS.wellness.tone} progress={res.score / 100 || 0.001} value={res.score} label="Wellness" sublabel={BAND_LABEL[res.band] ?? "this week"} />
    : <TileCard icon={METRICS.wellness.icon} tone={METRICS.wellness.tone} label="Wellness" value={res.score} progress={res.score / 100} />;
}

// ── Live fasting tracker ─────────────────────────────────────────────────────
const ZONES = FASTING_ZONES;
interface Fast { activeFast: { started_at: string; target_hours: number } | null }

function FastingWidget({ clientId, form }: { clientId: string; form: TileForm }) {
  const [fast, setFast] = useState<Fast | null>(null);
  const [target, setTarget] = useState(16);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get<Fast>(`/api/fasting?clientId=${clientId}`).then(setFast).catch(() => setFast({ activeFast: null })), [clientId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [fast]);
  const start = async (h: number) => { setBusy(true); try { await api.post("/api/fasting", { clientId, data: { action: "start", targetHours: h } }); await load(); } finally { setBusy(false); } };
  const end = async () => { setBusy(true); try { await api.post("/api/fasting", { clientId, data: { action: "end", targetHours: target } }); await load(); } finally { setBusy(false); } };

  const active = fast?.activeFast ?? null;
  const ms = active ? Math.max(0, now - Date.parse(active.started_at)) : 0;
  const hours = ms / 3600000;
  const h = Math.floor(hours), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  const zone = ZONES.find((z) => hours < z.max) ?? ZONES[ZONES.length - 1]!;
  const pct = active ? Math.min(1, hours / active.target_hours) : 0;

  if (!fast) return <div className="h-full animate-pulse rounded-2xl bg-surface-2" />;

  if (form !== "ring") {
    if (!active) return <TileCard icon={METRICS.fasting.icon} tone={METRICS.fasting.tone} label="Fasting" value="Start 16h" onClick={() => void start(16)} />;
    return <TileCard icon={METRICS.fasting.icon} tone={zone.tone} label={`Fasting · ${zone.label}`} value={<span className="tabular-nums">{h}:{pad(m)}</span>} progress={pct} />;
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      {active ? (
        <>
          <ProgressRing size={132} strokeWidth={15} tone={zone.tone} progress={pct} value={<span className="tabular-nums">{h}:{pad(m)}:{pad(s)}</span>} label="Fasting" sublabel={`${zone.label} · ${active.target_hours}h`} softTrack tintValue />
          <Button size="sm" variant="outline" className="relative w-full" disabled={busy} onClick={() => void end()}>End fast</Button>
        </>
      ) : (
        <>
          <div className="relative flex items-center gap-2"><IconBadge icon={METRICS.fasting.icon} tone={METRICS.fasting.tone} size="sm" /><span className="font-semibold">Fasting</span></div>
          <div className="relative flex flex-wrap justify-center gap-1.5">{[16, 18, 20, 24].map((hh) => <Chip key={hh} selected={target === hh} onClick={() => setTarget(hh)}>{hh}h</Chip>)}</div>
          <Button size="sm" variant="tonal" className="relative w-full" disabled={busy} onClick={() => void start(target)}>Start {target}h fast</Button>
        </>
      )}
    </div>
  );
}
