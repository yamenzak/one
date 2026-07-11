/** Progress tab — Overview / Body / Wellness, ranges, charts, AI recap. */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { currentStreak, longestStreak, consistencyPct, wellnessIndex, averageRating, presetRange, type RangePreset } from "@mossa/domain";
import { Button, Card, Badge, Skeleton, Sparkline, StatCard, WeekDots, SegmentedControl, Page, Stagger, METRICS, Gauge, HeartPulse, Sparkles, X } from "@mossa/ui";
import { api, todayLocal } from "../../api.js";

interface Measurement { date_local: string; weight_kg: number | null; body_fat_percent: number | null; waist_cm: number | null }
interface CheckIn { date_local: string; mood: number | null; energy: number | null; stress: number | null; sleep_quality: number | null; sleep_hours: number | null }

export function Progress({ clientId }: { clientId: string }) {
  const [measurements, setMeasurements] = useState<Measurement[] | null>(null);
  const [checkIns, setCheckIns] = useState<CheckIn[] | null>(null);
  const [tab, setTab] = useState<"overview" | "body" | "wellness">("overview");
  const [range, setRange] = useState<RangePreset>("30d");

  useEffect(() => {
    void api.get<{ measurements: Measurement[] }>(`/api/measurements?clientId=${clientId}`).then((r) => setMeasurements(r.measurements));
    void api.get<{ checkIns: CheckIn[] }>(`/api/check-ins?clientId=${clientId}`).then((r) => setCheckIns(r.checkIns));
  }, [clientId]);

  if (!measurements || !checkIns) return <Skeleton className="m-4 h-64" />;

  const today = todayLocal();
  const { start } = presetRange(range, today);
  const inRange = <T extends { date_local: string }>(rows: T[]) => rows.filter((r) => r.date_local >= start);

  const weights = inRange(measurements).filter((m) => m.weight_kg != null).sort((a, b) => a.date_local.localeCompare(b.date_local));
  const bfs = inRange(measurements).filter((m) => m.body_fat_percent != null).sort((a, b) => a.date_local.localeCompare(b.date_local));
  const waists = inRange(measurements).filter((m) => m.waist_cm != null).sort((a, b) => a.date_local.localeCompare(b.date_local));
  const cis = inRange(checkIns);
  const loggedDays = new Set(checkIns.map((c) => c.date_local));
  const streak = currentStreak(loggedDays, today);

  const weekFlags: boolean[] = [];
  const monday = new Date(today);
  monday.setDate(new Date(today).getDate() - ((new Date(today).getDay() + 6) % 7));
  for (let i = 0; i < 7; i++) { const d = new Date(monday); d.setDate(monday.getDate() + i); weekFlags.push(loggedDays.has(d.toISOString().slice(0, 10))); }

  const wi = wellnessIndex({ mood: avg(cis.map((c) => c.mood)), energy: avg(cis.map((c) => c.energy)), sleepQuality: avg(cis.map((c) => c.sleep_quality)), stress: avg(cis.map((c) => c.stress)) });

  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Progress</h1>
        <NarrativeButton clientId={clientId} streak={streak} weights={weights.length} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <SegmentedControl options={[{ value: "overview", label: "Overview" }, { value: "body", label: "Body" }, { value: "wellness", label: "Wellness" }]} value={tab} onChange={setTab} />
        <SegmentedControl options={[{ value: "7d", label: "7d" }, { value: "30d", label: "30d" }, { value: "90d", label: "90d" }]} value={range} onChange={setRange} />
      </div>

      {tab === "overview" && (
        <Stagger className="space-y-4">
          <StatCard label="Check-in streak" icon={METRICS.streak.icon} tone={METRICS.streak.tone} value={streak} unit={streak === 1 ? "day" : "days"} badge={<Badge tone="neutral">best {longestStreak(loggedDays)}</Badge>} chart={<WeekDots days={weekFlags} todayIndex={(new Date(today).getDay() + 6) % 7} />} />
          <StatCard label="Consistency" icon={Gauge} tone="activity" value={consistencyPct(loggedDays, start, today)} unit="%" />
          <StatCard label={METRICS.weight.label} icon={METRICS.weight.icon} tone={METRICS.weight.tone} value={weights.at(-1)?.weight_kg?.toFixed(1) ?? "—"} unit="kg" chart={weights.length >= 2 ? <Sparkline values={weights.map((w) => w.weight_kg!)} tone={METRICS.weight.tone} /> : undefined} />
        </Stagger>
      )}

      {tab === "body" && (
        <Stagger className="space-y-4">
          <StatCard label={METRICS.weight.label} icon={METRICS.weight.icon} tone={METRICS.weight.tone} value={weights.at(-1)?.weight_kg?.toFixed(1) ?? "—"} unit="kg" chart={weights.length >= 2 ? <Sparkline values={weights.map((w) => w.weight_kg!)} tone={METRICS.weight.tone} /> : undefined} />
          <StatCard label={METRICS.bodyFat.label} icon={METRICS.bodyFat.icon} tone={METRICS.bodyFat.tone} value={bfs.at(-1)?.body_fat_percent?.toFixed(1) ?? "—"} unit="%" chart={bfs.length >= 2 ? <Sparkline values={bfs.map((b) => b.body_fat_percent!)} tone={METRICS.bodyFat.tone} /> : undefined} />
          <StatCard label={METRICS.waist.label} icon={METRICS.waist.icon} tone={METRICS.waist.tone} value={waists.at(-1)?.waist_cm?.toFixed(1) ?? "—"} unit="cm" chart={waists.length >= 2 ? <Sparkline values={waists.map((w) => w.waist_cm!)} tone={METRICS.waist.tone} /> : undefined} />
        </Stagger>
      )}

      {tab === "wellness" && (
        <Stagger className="space-y-4">
          <StatCard label="Wellness index" icon={HeartPulse} tone="cardio" value={wi != null ? wi.toFixed(1) : "—"} unit="/5" badge={wi != null ? <Badge tone={wi >= 3.5 ? "success" : wi >= 2.5 ? "warning" : "danger"}>{wi >= 3.5 ? "Thriving" : wi >= 2.5 ? "Steady" : "Watch"}</Badge> : undefined} />
          <StatCard label="Avg mood" icon={METRICS.mood.icon} tone={METRICS.mood.tone} value={averageRating(cis.map((c) => c.mood)) ?? "—"} unit="/5" />
          <StatCard label="Avg sleep" icon={METRICS.sleep.icon} tone={METRICS.sleep.tone} value={avg(cis.map((c) => c.sleep_hours))?.toFixed(1) ?? "—"} unit="hrs" />
        </Stagger>
      )}
    </Page>
  );
}

function avg(nums: (number | null)[]): number | null {
  const v = nums.filter((n): n is number => n != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function NarrativeButton({ clientId, streak, weights }: { clientId: string; streak: number; weights: number }) {
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const run = async () => {
    setBusy(true); setOpen(true);
    try { setText((await api.post<{ narrative: string }>("/api/ai/narrative", { clientId, stats: { checkInStreak: streak, weightEntries: weights } })).narrative); }
    catch { setText("AI recap isn't available on your studio's plan."); }
    finally { setBusy(false); }
  };
  return (
    <>
      <Button variant="tonal" size="sm" onClick={() => void run()}><Sparkles /> Recap</Button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-lg">
            <Card className="flex items-start gap-3 shadow-lg"><Sparkles className="mt-0.5 size-4 shrink-0 text-primary" /><p className="flex-1 text-sm">{busy ? "Writing your recap…" : text}</p><button onClick={() => setOpen(false)} className="text-muted-foreground"><X className="size-4" /></button></Card>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
