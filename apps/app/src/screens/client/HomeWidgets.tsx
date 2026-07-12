/**
 * Client home widgets — the metrics that fill the Today hero, beside the
 * calories ring. Small widgets render as MetricPills (the header style); the
 * live fasting tracker is a wide card. Users pick which appear via the pencil.
 */

import { useCallback, useEffect, useState } from "react";
import { currentStreak, fmtVolume, fmtEnergy, kcalToDisplay, kgToDisplay, weightLabel, type UnitPrefs } from "@mossa/domain";
import { MetricPill, Badge, Chip, Button, IconBadge, Timer, Flame, Droplet, Droplets, Wheat, Beef, Dumbbell, FlaskConical, Weight, Pill } from "@mossa/ui";
import { api } from "../../api.js";
import { type WidgetDef } from "../widget-kit.js";
import type { TodayBundle } from "./Today.js";

export interface ClientWidgetData { clientId: string; units: UnitPrefs; bundle: TodayBundle }

export const DEFAULT_CLIENT_WIDGETS = ["protein", "water", "burned", "fasting"];

const pad = (n: number) => String(n).padStart(2, "0");
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
  { id: "protein", title: "Protein", icon: Beef, render: (d) => { const t = d.bundle.goal?.targets?.targetProteinG; return <MetricPill icon={Beef} label="Protein" tone="protein" value={`${d.bundle.nutrition.proteinG} g`} progress={t ? d.bundle.nutrition.proteinG / t : undefined} />; } },
  { id: "carbs", title: "Carbs", icon: Wheat, render: (d) => { const t = d.bundle.goal?.targets?.targetCarbsG; return <MetricPill icon={Wheat} label="Carbs" tone="carbs" value={`${d.bundle.nutrition.carbsG} g`} progress={t ? d.bundle.nutrition.carbsG / t : undefined} />; } },
  { id: "fat", title: "Fat", icon: Droplets, render: (d) => { const t = d.bundle.goal?.targets?.targetFatG; return <MetricPill icon={Droplets} label="Fat" tone="fat" value={`${d.bundle.nutrition.fatG} g`} progress={t ? d.bundle.nutrition.fatG / t : undefined} />; } },
  { id: "water", title: "Water", icon: Droplet, render: (d) => { const t = d.bundle.goal?.targets?.targetWaterMl ?? 2500; return <MetricPill icon={Droplet} label="Water" tone="hydration" value={fmtVolume(d.bundle.waterMl, d.units)} progress={d.bundle.waterMl / t} />; } },
  { id: "burned", title: "Calories burned", icon: Flame, render: (d) => <MetricPill icon={Flame} label="Burned" tone="cardio" value={kcalToDisplay(d.bundle.burnedKcal, d.units).toLocaleString()} /> },
  { id: "calories", title: "Calories left", icon: Flame, render: (d) => { const t = d.bundle.goal?.targets?.targetCalories ?? 0; const net = d.bundle.nutrition.calories - d.bundle.burnedKcal; return <MetricPill icon={Flame} label={t > 0 ? "Calories left" : "Calories in"} tone="calories" value={t > 0 ? kcalToDisplay(Math.max(0, t - net), d.units).toLocaleString() : fmtEnergy(net, d.units)} progress={t > 0 ? net / t : undefined} />; } },
  { id: "streak", title: "Check-in streak", icon: Flame, render: (d) => <MetricPill icon={Flame} label="Day streak" tone="calories" value={d.bundle.checkInDates ? currentStreak(new Set(d.bundle.checkInDates), d.bundle.date) : 0} /> },
  { id: "weight", title: "Weight trend (7d)", icon: Weight, render: (d) => <MetricPill icon={Weight} label={`Weight · 7d ${weightLabel(d.units)}`} tone="cardio" value={weightDelta(d.bundle.weightSeries, d.units)} /> },
  { id: "sets", title: "Sets logged today", icon: Dumbbell, render: (d) => <MetricPill icon={Dumbbell} label="Sets today" tone="activity" value={d.bundle.workout.loggedSets} /> },
  { id: "labs", title: "Labs due", icon: FlaskConical, render: (d) => <MetricPill icon={FlaskConical} label="Labs due" tone="cardio" value={d.bundle.pendingLabs ?? 0} /> },
  { id: "supplements", title: "Supplements today", icon: Pill, render: (d) => <SupplementsPill clientId={d.clientId} /> },
  { id: "fasting", title: "Live fasting tracker", icon: Timer, wide: true, render: (d) => <FastingWidget clientId={d.clientId} /> },
];

// ── Live fasting tracker (wide) ──────────────────────────────────────────────
const ZONES = [
  { label: "Fed", max: 4, tone: "nutrition" as const },
  { label: "Catabolic", max: 16, tone: "cardio" as const },
  { label: "Fat burning", max: 24, tone: "activity" as const },
  { label: "Ketosis", max: 72, tone: "sleep" as const },
];
interface Fast { activeFast: { started_at: string; target_hours: number } | null }

function FastingWidget({ clientId }: { clientId: string }) {
  const [fast, setFast] = useState<Fast | null>(null);
  const [target, setTarget] = useState(16);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get<Fast>(`/api/fasting?clientId=${clientId}`).then(setFast).catch(() => setFast({ activeFast: null })), [clientId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [fast]);
  const toggle = async () => { setBusy(true); try { await api.post("/api/fasting", { clientId, data: { action: fast?.activeFast ? "end" : "start", targetHours: target } }); await load(); } finally { setBusy(false); } };

  if (!fast) return <div className="h-28 animate-pulse rounded-2xl bg-surface-2" />;
  const active = fast.activeFast;

  if (active) {
    const ms = Math.max(0, now - Date.parse(active.started_at));
    const hours = ms / 3600000;
    const h = Math.floor(hours), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
    const zone = ZONES.find((z) => hours < z.max) ?? ZONES[ZONES.length - 1]!;
    const pct = Math.min(100, (hours / active.target_hours) * 100);
    return (
      <div className="relative overflow-hidden rounded-2xl bg-card p-4">
        <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-sleep/10 blur-2xl" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2.5"><IconBadge icon={Timer} tone="sleep" size="sm" /><span className="font-semibold">Fasting</span></div>
          <Badge tone={zone.tone}>{zone.label}</Badge>
        </div>
        <div className="numeral relative mt-2.5 text-3xl font-bold tabular-nums leading-none">{h}:{pad(m)}:{pad(s)}</div>
        <div className="relative mt-1 text-xs text-muted-foreground">of {active.target_hours}h target · {zone.label} zone</div>
        <div className="relative mt-2.5 h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
        <Button size="sm" variant="outline" className="mt-3 w-full" disabled={busy} onClick={() => void toggle()}>End fast</Button>
      </div>
    );
  }
  return (
    <div className="relative overflow-hidden rounded-2xl bg-card p-4">
      <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-sleep/10 blur-2xl" />
      <div className="relative flex items-center gap-2.5"><IconBadge icon={Timer} tone="sleep" size="sm" /><span className="font-semibold">Fasting</span></div>
      <div className="relative mt-2 flex flex-wrap gap-2">{[16, 18, 20, 24].map((hh) => <Chip key={hh} selected={target === hh} onClick={() => setTarget(hh)}>{hh}h</Chip>)}</div>
      <Button size="sm" variant="tonal" className="mt-3 w-full" disabled={busy} onClick={() => void toggle()}>Start {target}h fast</Button>
    </div>
  );
}

// ── Supplements-taken pill (self-fetching) ───────────────────────────────────
interface Supp { id: string; name: string; schedule: { slot: string }[] }
function SupplementsPill({ clientId }: { clientId: string }) {
  const [total, setTotal] = useState<number | null>(null);
  const [taken, setTaken] = useState(0);
  useEffect(() => {
    const date = new Date().toISOString().slice(0, 10);
    void Promise.all([
      api.get<{ supplements: Supp[] }>(`/api/supplements?clientId=${clientId}`),
      api.get<{ taken: { supplement_id: string; slot: string }[] }>(`/api/supplements/logs?clientId=${clientId}&date=${date}`),
    ]).then(([s, l]) => {
      setTotal(s.supplements.reduce((n, x) => n + Math.max(1, x.schedule.length), 0));
      setTaken(l.taken.length);
    }).catch(() => setTotal(0));
  }, [clientId]);
  return <MetricPill icon={Pill} label="Supplements" tone="activity" value={total === null ? "—" : `${taken}/${total}`} progress={total ? taken / total : undefined} />;
}
