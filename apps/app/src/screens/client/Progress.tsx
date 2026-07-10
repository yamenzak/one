/** Progress tab: weight/BF stat cards with sparklines + check-in streak. */

import { useEffect, useState } from "react";
import { currentStreak } from "@mossa/domain";
import { Chip, Skeleton, Sparkline, StatCard, WeekDots } from "@mossa/ui";
import { api, todayLocal } from "../../api.js";

interface Measurement {
  date_local: string;
  weight_kg: number | null;
  body_fat_percent: number | null;
}

interface CheckIn {
  date_local: string;
}

export function Progress({ clientId }: { clientId: string }) {
  const [measurements, setMeasurements] = useState<Measurement[] | null>(null);
  const [checkIns, setCheckIns] = useState<CheckIn[] | null>(null);

  useEffect(() => {
    void api.get<{ measurements: Measurement[] }>(`/api/measurements?clientId=${clientId}`).then((r) => setMeasurements(r.measurements));
    void api.get<{ checkIns: CheckIn[] }>(`/api/check-ins?clientId=${clientId}`).then((r) => setCheckIns(r.checkIns));
  }, [clientId]);

  if (!measurements || !checkIns) return <Skeleton className="m-4 h-64" />;

  const weights = measurements
    .filter((m) => m.weight_kg != null)
    .sort((a, b) => a.date_local.localeCompare(b.date_local));
  const latestWeight = weights[weights.length - 1]?.weight_kg ?? null;
  const bfs = measurements.filter((m) => m.body_fat_percent != null);
  const latestBf = bfs[bfs.length - 1]?.body_fat_percent ?? null;

  const today = todayLocal();
  const loggedDays = new Set(checkIns.map((c) => c.date_local));
  const streak = currentStreak(loggedDays, today);

  // Monday-first week flags for the dots.
  const weekFlags: boolean[] = [];
  const now = new Date(today);
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekFlags.push(loggedDays.has(d.toISOString().slice(0, 10)));
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <h1 className="text-2xl font-bold">Progress</h1>

      <StatCard
        label="Check-in streak"
        value={streak}
        unit={streak === 1 ? "day" : "days"}
        chip={streak > 0 ? <Chip tone="good">Keep it going</Chip> : <Chip tone="warn">Check in today</Chip>}
        chart={<WeekDots days={weekFlags} todayIndex={(new Date(today).getDay() + 6) % 7} />}
      />

      <StatCard
        label="Weight"
        value={latestWeight != null ? latestWeight.toFixed(1) : "—"}
        unit="kg"
        chip={weights.length >= 2 ? <Chip tone="neutral">{weights.length} entries</Chip> : undefined}
        chart={weights.length >= 2 ? <Sparkline values={weights.map((w) => w.weight_kg!)} tone="activity" /> : undefined}
      />

      <StatCard
        label="Body fat"
        value={latestBf != null ? latestBf.toFixed(1) : "—"}
        unit="%"
        chart={bfs.length >= 2 ? <Sparkline values={bfs.map((b) => b.body_fat_percent!)} tone="sleep" /> : undefined}
      />
    </div>
  );
}
