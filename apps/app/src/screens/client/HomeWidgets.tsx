/**
 * Client home widgets — the metrics that fill the swipeable Today hero. Each has
 * a big ring (1×3) and a small card (1×1) form, tone-coded to its metric and
 * formatted in the user's units. The live fasting tracker is interactive.
 */

import { useCallback, useEffect, useState } from "react";
import { currentStreak, fmtVolume, fmtEnergy, kcalToDisplay, kgToDisplay, weightLabel, energyLabel, type UnitPrefs } from "@mossa/domain";
import { Chip, Button, IconBadge, ProgressRing, METRICS, Timer, FlaskConical, Pill, HeartPulse } from "@mossa/ui";
import { api } from "../../api.js";
import { RingCard, MiniCard, type WidgetDef, type WidgetSize } from "../widget-kit.js";
import type { TodayBundle } from "./Today.js";

export interface ClientWidgetData { clientId: string; units: UnitPrefs; bundle: TodayBundle }

export const DEFAULT_CLIENT_WIDGETS: { id: string; size: WidgetSize }[] = [
  { id: "calories", size: "big" },
  { id: "protein", size: "small" },
  { id: "water", size: "small" },
  { id: "burned", size: "small" },
  { id: "fasting", size: "big" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const ratio = (v: number, t?: number) => (t && t > 0 ? v / t : undefined);
function weightDelta(series: { kg: number; date: string }[] | undefined, units: UnitPrefs): string {
  if (!series || series.length < 2) return "—";
  const last = series[series.length - 1]!;
  const target = Date.parse(last.date) - 7 * 86400000;
  let ref = series[0]!;
  for (const p of series) if (Math.abs(Date.parse(p.date) - target) < Math.abs(Date.parse(ref.date) - target)) ref = p;
  const d = Math.round((kgToDisplay(last.kg, units) - kgToDisplay(ref.kg, units)) * 10) / 10;
  return `${d > 0 ? "+" : ""}${d}`;
}

export const CLIENT_WIDGETS: WidgetDef<ClientWidgetData>[] = [
  {
    id: "wellness", title: "Wellness Score", icon: HeartPulse,
    renderBig: (d) => <WellnessWidget clientId={d.clientId} date={d.bundle.date} size="big" />,
    renderSmall: (d) => <WellnessWidget clientId={d.clientId} date={d.bundle.date} size="small" />,
  },
  {
    id: "calories", title: "Calories", icon: METRICS.calories.icon,
    renderBig: (d) => { const t = d.bundle.goal?.targets?.targetCalories ?? 0; const net = d.bundle.nutrition.calories - d.bundle.burnedKcal; return <RingCard tone={METRICS.calories.tone} progress={t > 0 ? net / t : 0.001} value={kcalToDisplay(Math.max(0, net), d.units).toLocaleString()} label={d.units.energy === "kJ" ? "Energy" : "Calories"} sublabel={t > 0 ? `of ${kcalToDisplay(t, d.units).toLocaleString()} ${energyLabel(d.units)}` : "set a goal"} />; },
    renderSmall: (d) => { const t = d.bundle.goal?.targets?.targetCalories ?? 0; const net = d.bundle.nutrition.calories - d.bundle.burnedKcal; return <MiniCard icon={METRICS.calories.icon} tone={METRICS.calories.tone} label={d.units.energy === "kJ" ? "Energy" : "Calories"} value={kcalToDisplay(Math.max(0, net), d.units).toLocaleString()} progress={ratio(net, t)} />; },
  },
  {
    id: "protein", title: "Protein", icon: METRICS.protein.icon,
    renderBig: (d) => { const t = d.bundle.goal?.targets?.targetProteinG; return <RingCard tone={METRICS.protein.tone} progress={ratio(d.bundle.nutrition.proteinG, t) ?? 0.001} value={`${d.bundle.nutrition.proteinG}`} label="Protein" sublabel={t ? `of ${t} g` : "grams"} />; },
    renderSmall: (d) => { const t = d.bundle.goal?.targets?.targetProteinG; return <MiniCard icon={METRICS.protein.icon} tone={METRICS.protein.tone} label="Protein" value={`${d.bundle.nutrition.proteinG} g`} progress={ratio(d.bundle.nutrition.proteinG, t)} />; },
  },
  {
    id: "carbs", title: "Carbs", icon: METRICS.carbs.icon,
    renderBig: (d) => { const t = d.bundle.goal?.targets?.targetCarbsG; return <RingCard tone={METRICS.carbs.tone} progress={ratio(d.bundle.nutrition.carbsG, t) ?? 0.001} value={`${d.bundle.nutrition.carbsG}`} label="Carbs" sublabel={t ? `of ${t} g` : "grams"} />; },
    renderSmall: (d) => { const t = d.bundle.goal?.targets?.targetCarbsG; return <MiniCard icon={METRICS.carbs.icon} tone={METRICS.carbs.tone} label="Carbs" value={`${d.bundle.nutrition.carbsG} g`} progress={ratio(d.bundle.nutrition.carbsG, t)} />; },
  },
  {
    id: "fat", title: "Fat", icon: METRICS.fat.icon,
    renderBig: (d) => { const t = d.bundle.goal?.targets?.targetFatG; return <RingCard tone={METRICS.fat.tone} progress={ratio(d.bundle.nutrition.fatG, t) ?? 0.001} value={`${d.bundle.nutrition.fatG}`} label="Fat" sublabel={t ? `of ${t} g` : "grams"} />; },
    renderSmall: (d) => { const t = d.bundle.goal?.targets?.targetFatG; return <MiniCard icon={METRICS.fat.icon} tone={METRICS.fat.tone} label="Fat" value={`${d.bundle.nutrition.fatG} g`} progress={ratio(d.bundle.nutrition.fatG, t)} />; },
  },
  {
    id: "water", title: "Water", icon: METRICS.water.icon,
    renderBig: (d) => { const t = d.bundle.goal?.targets?.targetWaterMl ?? 2500; return <RingCard tone={METRICS.water.tone} progress={d.bundle.waterMl / t} value={fmtVolume(d.bundle.waterMl, d.units)} label="Water" sublabel={`of ${fmtVolume(t, d.units)}`} />; },
    renderSmall: (d) => { const t = d.bundle.goal?.targets?.targetWaterMl ?? 2500; return <MiniCard icon={METRICS.water.icon} tone={METRICS.water.tone} label="Water" value={fmtVolume(d.bundle.waterMl, d.units)} progress={d.bundle.waterMl / t} />; },
  },
  {
    id: "burned", title: "Calories burned", icon: METRICS.burned.icon,
    renderBig: (d) => <RingCard tone={METRICS.burned.tone} progress={0.001} value={kcalToDisplay(d.bundle.burnedKcal, d.units).toLocaleString()} label="Burned" sublabel={energyLabel(d.units)} />,
    renderSmall: (d) => <MiniCard icon={METRICS.burned.icon} tone={METRICS.burned.tone} label="Burned" value={kcalToDisplay(d.bundle.burnedKcal, d.units).toLocaleString()} />,
  },
  {
    id: "streak", title: "Check-in streak", icon: METRICS.streak.icon,
    renderBig: (d) => { const v = d.bundle.checkInDates ? currentStreak(new Set(d.bundle.checkInDates), d.bundle.date) : 0; return <RingCard tone={METRICS.streak.tone} progress={Math.min(1, v / 30) || 0.001} value={v} label="Streak" sublabel={v === 1 ? "day" : "days"} />; },
    renderSmall: (d) => <MiniCard icon={METRICS.streak.icon} tone={METRICS.streak.tone} label="Day streak" value={d.bundle.checkInDates ? currentStreak(new Set(d.bundle.checkInDates), d.bundle.date) : 0} />,
  },
  {
    id: "weight", title: "Weight trend (7d)", icon: METRICS.weight.icon,
    renderBig: (d) => <RingCard tone={METRICS.weight.tone} progress={0.001} value={weightDelta(d.bundle.weightSeries, d.units)} label="Weight" sublabel={`7-day ${weightLabel(d.units)}`} />,
    renderSmall: (d) => <MiniCard icon={METRICS.weight.icon} tone={METRICS.weight.tone} label={`Weight 7d ${weightLabel(d.units)}`} value={weightDelta(d.bundle.weightSeries, d.units)} />,
  },
  {
    id: "bodyfat", title: "Body fat", icon: METRICS.bodyFat.icon,
    renderBig: (d) => <BodyFatWidget clientId={d.clientId} size="big" />,
    renderSmall: (d) => <BodyFatWidget clientId={d.clientId} size="small" />,
  },
  {
    id: "sets", title: "Sets logged today", icon: METRICS.sets.icon,
    renderBig: (d) => <RingCard tone={METRICS.sets.tone} progress={0.001} value={d.bundle.workout.loggedSets} label="Sets" sublabel="today" />,
    renderSmall: (d) => <MiniCard icon={METRICS.sets.icon} tone={METRICS.sets.tone} label="Sets today" value={d.bundle.workout.loggedSets} />,
  },
  {
    id: "labs", title: "Labs due", icon: FlaskConical,
    renderBig: (d) => <RingCard tone="lab" progress={0.001} value={d.bundle.pendingLabs ?? 0} label="Labs" sublabel="due" />,
    renderSmall: (d) => <MiniCard icon={FlaskConical} tone="lab" label="Labs due" value={d.bundle.pendingLabs ?? 0} />,
  },
  {
    id: "supplements", title: "Supplements today", icon: Pill,
    renderBig: (d) => <SupplementsWidget clientId={d.clientId} size="big" />,
    renderSmall: (d) => <SupplementsWidget clientId={d.clientId} size="small" />,
  },
  {
    id: "fasting", title: "Live fasting tracker", icon: Timer,
    renderBig: (d) => <FastingWidget clientId={d.clientId} size="big" />,
    renderSmall: (d) => <FastingWidget clientId={d.clientId} size="small" />,
  },
];

// ── Body fat (self-fetched from the camera/manual scans) ─────────────────────
function BodyFatWidget({ clientId, size }: { clientId: string; size: WidgetSize }) {
  const [scans, setScans] = useState<{ bodyFatPercent: number | null }[] | null>(null);
  useEffect(() => {
    void api.get<{ scans: { bodyFatPercent: number | null }[] }>(`/api/body-scans?clientId=${clientId}`)
      .then((r) => setScans(r.scans)).catch(() => setScans([]));
  }, [clientId]);
  if (!scans) return <div className="h-full animate-pulse rounded-2xl bg-surface-2" />;
  const withBf = scans.filter((s) => s.bodyFatPercent != null); // newest-first
  const latest = withBf[0]?.bodyFatPercent ?? null;
  const prev = withBf[1]?.bodyFatPercent ?? null;
  const delta = latest != null && prev != null ? Math.round((latest - prev) * 10) / 10 : null;
  const sub = latest == null ? "no scans yet" : delta != null ? `${delta > 0 ? "+" : ""}${delta}% vs last` : "estimate";
  return size === "big"
    ? <RingCard tone={METRICS.bodyFat.tone} progress={latest != null ? Math.min(1, latest / 40) || 0.001 : 0.001} value={latest != null ? latest.toFixed(1) : "—"} label="Body fat" sublabel={sub} />
    : <MiniCard icon={METRICS.bodyFat.icon} tone={METRICS.bodyFat.tone} label="Body fat" value={latest != null ? `${latest.toFixed(1)}%` : "—"} />;
}

// ── Wellness Score ───────────────────────────────────────────────────────────
const BAND_LABEL: Record<string, string> = { start: "Just starting", building: "Building", solid: "Solid", strong: "Strong", peak: "Peak" };
interface ScoreResult { score: number; band: string }
function WellnessWidget({ clientId, date, size }: { clientId: string; date: string; size: WidgetSize }) {
  const [res, setRes] = useState<ScoreResult | null>(null);
  useEffect(() => { void api.get<ScoreResult>(`/api/wellness/score?clientId=${clientId}&today=${date}`).then(setRes).catch(() => setRes({ score: 0, band: "start" })); }, [clientId, date]);
  if (!res) return <div className="h-full animate-pulse rounded-2xl bg-surface-2" />;
  return size === "big"
    ? <RingCard tone="sleep" progress={res.score / 100 || 0.001} value={res.score} label="Wellness" sublabel={BAND_LABEL[res.band] ?? "this week"} />
    : <MiniCard icon={HeartPulse} tone="sleep" label="Wellness" value={res.score} progress={res.score / 100} />;
}

// ── Live fasting tracker ─────────────────────────────────────────────────────
const ZONES = [
  { label: "Fed", max: 4, tone: "nutrition" as const },
  { label: "Catabolic", max: 16, tone: "cardio" as const },
  { label: "Fat burning", max: 24, tone: "activity" as const },
  { label: "Ketosis", max: 72, tone: "sleep" as const },
];
interface Fast { activeFast: { started_at: string; target_hours: number } | null }

function FastingWidget({ clientId, size }: { clientId: string; size: WidgetSize }) {
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

  if (size === "small") {
    if (!active) return <MiniCard icon={Timer} tone="sleep" label="Fasting" value="Start 16h" onClick={() => void start(16)} />;
    return <MiniCard icon={Timer} tone={zone.tone} label={`Fasting · ${zone.label}`} value={<span className="tabular-nums">{h}:{pad(m)}</span>} progress={pct} />;
  }

  // big (1×3 ring cell) — bare, matching the airy ring widgets
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      {active ? (
        <>
          <ProgressRing size={132} strokeWidth={15} tone={zone.tone} progress={pct} value={<span className="tabular-nums">{h}:{pad(m)}:{pad(s)}</span>} label="Fasting" sublabel={`${zone.label} · ${active.target_hours}h`} softTrack tintValue />
          <Button size="sm" variant="outline" className="relative w-full" disabled={busy} onClick={() => void end()}>End fast</Button>
        </>
      ) : (
        <>
          <div className="relative flex items-center gap-2"><IconBadge icon={Timer} tone="sleep" size="sm" /><span className="font-semibold">Fasting</span></div>
          <div className="relative flex flex-wrap justify-center gap-1.5">{[16, 18, 20, 24].map((hh) => <Chip key={hh} selected={target === hh} onClick={() => setTarget(hh)}>{hh}h</Chip>)}</div>
          <Button size="sm" variant="tonal" className="relative w-full" disabled={busy} onClick={() => void start(target)}>Start {target}h fast</Button>
        </>
      )}
    </div>
  );
}

// ── Supplements taken today ──────────────────────────────────────────────────
interface Supp { id: string; name: string; schedule: { slot: string }[] }
function SupplementsWidget({ clientId, size }: { clientId: string; size: WidgetSize }) {
  const [total, setTotal] = useState<number | null>(null);
  const [taken, setTaken] = useState(0);
  useEffect(() => {
    const date = new Date().toISOString().slice(0, 10);
    void Promise.all([
      api.get<{ supplements: Supp[] }>(`/api/supplements?clientId=${clientId}`),
      api.get<{ taken: { supplement_id: string; slot: string }[] }>(`/api/supplements/logs?clientId=${clientId}&date=${date}`),
    ]).then(([s, l]) => { setTotal(s.supplements.reduce((n, x) => n + Math.max(1, x.schedule.length), 0)); setTaken(l.taken.length); }).catch(() => setTotal(0));
  }, [clientId]);
  const value = total === null ? "—" : `${taken}/${total}`;
  const progress = total ? taken / total : undefined;
  return size === "big"
    ? <RingCard tone="supplement" progress={progress ?? 0.001} value={value} label="Supplements" sublabel="taken today" />
    : <MiniCard icon={Pill} tone="supplement" label="Supplements" value={value} progress={progress} />;
}
