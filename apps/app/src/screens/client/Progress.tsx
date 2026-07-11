/** Progress tab — streak, weight, body-fat with animated stats + AI recap. */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { currentStreak } from "@mossa/domain";
import { Button, Card, Badge, Skeleton, Sparkline, StatCard, WeekDots, Page, Stagger, Flame, Weight, Gauge, Sparkles, X } from "@mossa/ui";
import { api, todayLocal } from "../../api.js";

interface Measurement { date_local: string; weight_kg: number | null; body_fat_percent: number | null }
interface CheckIn { date_local: string }

export function Progress({ clientId }: { clientId: string }) {
  const [measurements, setMeasurements] = useState<Measurement[] | null>(null);
  const [checkIns, setCheckIns] = useState<CheckIn[] | null>(null);

  useEffect(() => {
    void api.get<{ measurements: Measurement[] }>(`/api/measurements?clientId=${clientId}`).then((r) => setMeasurements(r.measurements));
    void api.get<{ checkIns: CheckIn[] }>(`/api/check-ins?clientId=${clientId}`).then((r) => setCheckIns(r.checkIns));
  }, [clientId]);

  if (!measurements || !checkIns) return <Skeleton className="m-4 h-64" />;

  const weights = measurements.filter((m) => m.weight_kg != null).sort((a, b) => a.date_local.localeCompare(b.date_local));
  const latestWeight = weights[weights.length - 1]?.weight_kg ?? null;
  const bfs = measurements.filter((m) => m.body_fat_percent != null);
  const latestBf = bfs[bfs.length - 1]?.body_fat_percent ?? null;

  const today = todayLocal();
  const loggedDays = new Set(checkIns.map((c) => c.date_local));
  const streak = currentStreak(loggedDays, today);

  const weekFlags: boolean[] = [];
  const monday = new Date(today);
  monday.setDate(new Date(today).getDate() - ((new Date(today).getDay() + 6) % 7));
  for (let i = 0; i < 7; i++) { const d = new Date(monday); d.setDate(monday.getDate() + i); weekFlags.push(loggedDays.has(d.toISOString().slice(0, 10))); }

  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Progress</h1>
        <NarrativeButton clientId={clientId} streak={streak} weights={weights.length} />
      </div>

      <Stagger>
        <StatCard label="Check-in streak" icon={Flame} tone="nutrition" value={streak} unit={streak === 1 ? "day" : "days"} badge={streak > 0 ? <Badge tone="success">Keep it going</Badge> : <Badge tone="warning">Check in today</Badge>} chart={<WeekDots days={weekFlags} todayIndex={(new Date(today).getDay() + 6) % 7} />} />
      </Stagger>
      <Stagger>
        <StatCard label="Weight" icon={Weight} tone="activity" value={latestWeight != null ? latestWeight.toFixed(1) : "—"} unit="kg" badge={weights.length >= 2 ? <Badge tone="neutral">{weights.length} entries</Badge> : undefined} chart={weights.length >= 2 ? <Sparkline values={weights.map((w) => w.weight_kg!)} tone="activity" /> : undefined} />
      </Stagger>
      <Stagger>
        <StatCard label="Body fat" icon={Gauge} tone="sleep" value={latestBf != null ? latestBf.toFixed(1) : "—"} unit="%" chart={bfs.length >= 2 ? <Sparkline values={bfs.map((b) => b.body_fat_percent!)} tone="sleep" /> : undefined} />
      </Stagger>
    </Page>
  );
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
            <Card className="flex items-start gap-3 shadow-lg">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="flex-1 text-sm">{busy ? "Writing your recap…" : text}</p>
              <button onClick={() => setOpen(false)} className="text-muted-foreground"><X className="size-4" /></button>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
