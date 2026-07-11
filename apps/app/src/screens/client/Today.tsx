/**
 * Client Today — hero ring + metric pills, action row, timeline feed.
 */

import { useCallback, useEffect, useState } from "react";
import { currentStreak, fmtVolume, fmtEnergy, fmtWeight, kcalToDisplay, energyLabel, weightLabel, kgToDisplay, type UnitPrefs } from "@mossa/domain";
import {
  Button, Card, SubCard, Skeleton, ProgressRing, MetricPill, MacroBar, InsightCard, IconBadge, Sheet, EmptyState,
  Page, Stagger, METRICS, toneVar, Plus, Play, PencilLine, Flame, ClipboardList, FlaskConical, History, Clock,
  Droplet, Dumbbell, Footprints, Weight, Moon, Smile, Timer, ArrowLeftRight, Sparkles, Utensils, Croissant, Soup, Apple,
  ChevronLeft, ChevronRight, type Tone, type LucideIcon,
} from "@mossa/ui";
import { api, todayLocal } from "../../api.js";
import { useUnits } from "../../units.js";
import { LogSheet } from "./LogSheet.js";

export interface FeedEvent { id: string; kind: string; date: string; at: string; title: string; subtitle: string | null; metric?: { unit: "energy" | "volume" | "weight"; value: number } }

/** N days back from a YYYY-MM-DD string. */
const shiftDay = (date: string, delta: number): string => {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
};

export interface TodayBundle {
  date: string;
  nutrition: { calories: number; proteinG: number; carbsG: number; fatG: number };
  waterMl: number;
  burnedKcal: number;
  workout: { loggedSets: number; sessions: unknown[] };
  checkedIn: boolean;
  goal: { targets: Record<string, number> | null; weeklyLoadTarget: number | null } | null;
  publishedWorkoutPlan: { id: string; name: string; body: { days: { name: string; isRestDay?: boolean }[] } } | null;
  checkInDates?: string[];
  pendingLabs?: number;
  weightSeries?: { kg: number; date: string }[];
}

export function Today({ clientId, onStart }: { clientId: string; onStart?: () => void }) {
  const [data, setData] = useState<TodayBundle | null>(null);
  const [feed, setFeed] = useState<FeedEvent[] | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const units = useUnits();
  const date = todayLocal();

  const load = useCallback(async () => {
    const [bundle, hist] = await Promise.all([
      api.get<TodayBundle>(`/api/today?clientId=${clientId}&date=${date}`),
      api.get<{ events: FeedEvent[] }>(`/api/activity-history?clientId=${clientId}&from=${shiftDay(date, -2)}&to=${date}`),
    ]);
    setData(bundle); setFeed(hist.events);
  }, [clientId, date]);
  useEffect(() => void load(), [load]);

  if (!data) {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-4">
        <Skeleton className="h-52" />
        <Skeleton className="h-14" />
        <Skeleton className="h-36" />
      </div>
    );
  }

  const targets = data.goal?.targets ?? null;
  const calTarget = targets?.targetCalories ?? 0;
  const net = data.nutrition.calories - data.burnedKcal;
  const waterTarget = targets?.targetWaterMl ?? 2500;

  return (
    <Page className="mx-auto max-w-xl space-y-5 p-4 pb-28">
      <Stagger className="flex items-center gap-4">
        <ProgressRing
          progress={calTarget > 0 ? net / calTarget : 0.001}
          size={188}
          tone="calories"
          label={units.energy === "kJ" ? "Energy" : METRICS.calories.label}
          value={kcalToDisplay(Math.max(0, net), units).toLocaleString()}
          sublabel={calTarget > 0 ? `of ${kcalToDisplay(calTarget, units).toLocaleString()} ${energyLabel(units)}` : "set a goal"}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <MetricPill icon={METRICS.protein.icon} label={METRICS.protein.label} tone={METRICS.protein.tone} value={`${data.nutrition.proteinG} g`} progress={targets?.targetProteinG ? data.nutrition.proteinG / targets.targetProteinG : undefined} />
          <MetricPill icon={METRICS.water.icon} label={METRICS.water.label} tone={METRICS.water.tone} value={fmtVolume(data.waterMl, units)} progress={data.waterMl / waterTarget} />
          <MetricPill icon={METRICS.burned.icon} label={METRICS.burned.label} tone={METRICS.burned.tone} value={kcalToDisplay(data.burnedKcal, units).toLocaleString()} />
        </div>
      </Stagger>

      <Stagger>
        <MacroBar
          proteinG={data.nutrition.proteinG}
          carbsG={data.nutrition.carbsG}
          fatG={data.nutrition.fatG}
          targets={targets ? { proteinG: targets.targetProteinG, carbsG: targets.targetCarbsG, fatG: targets.targetFatG } : null}
        />
      </Stagger>

      <Stagger className="flex items-center gap-2.5">
        <Button size="lg" className="flex-1" onClick={() => setLogOpen(true)}>
          <Plus /> Log
        </Button>
        <Button size="lg" variant="tonal" className="flex-1" onClick={onStart} disabled={!data.publishedWorkoutPlan}>
          <Play /> Start
        </Button>
        <Button size="icon" variant="secondary" aria-label="Customize">
          <PencilLine />
        </Button>
      </Stagger>

      {/* Home widgets */}
      <Stagger className="grid grid-cols-3 gap-2.5">
        <Widget icon={METRICS.streak.icon} tone={METRICS.streak.tone} value={data.checkInDates ? currentStreak(new Set(data.checkInDates), date) : 0} label="Day streak" />
        <Widget icon={METRICS.weight.icon} tone={METRICS.weight.tone} value={weightDelta(data.weightSeries, units)} label={`7-day ${weightLabel(units)}`} />
        <Widget icon={FlaskConical} tone="cardio" value={data.pendingLabs ?? 0} label="Labs due" />
      </Stagger>

      {!data.checkedIn && (
        <Stagger>
          <InsightCard timestamp="Today" title="Check in" ai>
            <SubCard>
              <p className="text-sm text-muted-foreground">A 30-second check-in keeps your coach in the loop — weight, mood, sleep.</p>
              <Button className="mt-3" onClick={() => setLogOpen(true)}>
                <ClipboardList /> Check in now
              </Button>
            </SubCard>
          </InsightCard>
        </Stagger>
      )}

      {/* Recent activity — a live history of everything logged, last 3 days. */}
      <Stagger className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent activity</h3>
          <button onClick={() => setHistoryOpen(true)} className="inline-flex items-center gap-1 text-sm font-medium text-primary [&_svg]:size-4"><History /> History</button>
        </div>
        {!feed ? (
          <Skeleton className="h-32" />
        ) : feed.length === 0 ? (
          <Card className="text-center text-sm text-muted-foreground">Your history grows here as you log — meals, workouts, check-ins and more.</Card>
        ) : (
          groupByDay(feed).map(([day, evs]) => (
            <div key={day}>
              <div className="px-1 pb-1 pt-2 text-xs font-semibold text-muted-foreground">{dayLabel(day, date)}</div>
              <Card className="divide-y divide-border/40 py-0.5">
                {evs.map((ev) => <FeedRow key={ev.id} ev={ev} units={units} />)}
              </Card>
            </div>
          ))
        )}
      </Stagger>

      <LogSheet open={logOpen} onClose={() => setLogOpen(false)} clientId={clientId} onLogged={() => void load()} />
      {historyOpen && <HistorySheet clientId={clientId} onClose={() => setHistoryOpen(false)} />}
    </Page>
  );
}

// ── Activity feed: icon + tone per event kind ────────────────────────────────
const FEED_META: Record<string, { icon: LucideIcon; tone: Tone }> = {
  "food:breakfast": { icon: Croissant, tone: "nutrition" },
  "food:lunch": { icon: Soup, tone: "nutrition" },
  "food:dinner": { icon: Utensils, tone: "nutrition" },
  "food:snack": { icon: Apple, tone: "nutrition" },
  "food:pre_workout": { icon: Dumbbell, tone: "nutrition" },
  "food:post_workout": { icon: Dumbbell, tone: "nutrition" },
  "food:free": { icon: Utensils, tone: "nutrition" },
  water: { icon: Droplet, tone: "hydration" },
  workout: { icon: Dumbbell, tone: "activity" },
  activity: { icon: Footprints, tone: "cardio" },
  measurement: { icon: Weight, tone: "cardio" },
  checkin: { icon: ClipboardList, tone: "nutrition" },
  feedback: { icon: Sparkles, tone: "primary" },
  sleep: { icon: Moon, tone: "sleep" },
  mood: { icon: Smile, tone: "nutrition" },
  fast: { icon: Timer, tone: "sleep" },
  swap: { icon: ArrowLeftRight, tone: "activity" },
  lab: { icon: FlaskConical, tone: "cardio" },
  plan_workout: { icon: Dumbbell, tone: "primary" },
  plan_meal: { icon: Utensils, tone: "primary" },
};
const metaFor = (kind: string) => FEED_META[kind] ?? { icon: Sparkles, tone: "neutral" as Tone };

function formatMetric(metric: FeedEvent["metric"], units: UnitPrefs): string | null {
  if (!metric) return null;
  return metric.unit === "energy" ? fmtEnergy(metric.value, units) : metric.unit === "volume" ? fmtVolume(metric.value, units) : fmtWeight(metric.value, units);
}

/** Group a time-sorted (desc) event list into [day, events][] preserving order. */
function groupByDay(events: FeedEvent[]): [string, FeedEvent[]][] {
  const out: [string, FeedEvent[]][] = [];
  for (const ev of events) {
    const last = out[out.length - 1];
    if (last && last[0] === ev.date) last[1].push(ev);
    else out.push([ev.date, [ev]]);
  }
  return out;
}

function dayLabel(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === shiftDay(today, -1)) return "Yesterday";
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function FeedRow({ ev, units }: { ev: FeedEvent; units: UnitPrefs }) {
  const meta = metaFor(ev.kind);
  const sub = [ev.subtitle, formatMetric(ev.metric, units)].filter(Boolean).join(" · ");
  const time = new Date(ev.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return (
    <div className="flex items-center gap-3 py-2.5">
      <IconBadge icon={meta.icon} tone={meta.tone} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{ev.title}</div>
        {sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}
      </div>
      <span className="shrink-0 text-[0.7rem] tabular-nums text-muted-foreground">{time}</span>
    </div>
  );
}

/** History browser — pick any past day and see its full timeline. */
function HistorySheet({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const units = useUnits();
  const today = todayLocal();
  const [day, setDay] = useState(shiftDay(today, -1));
  const [events, setEvents] = useState<FeedEvent[] | null>(null);
  useEffect(() => {
    setEvents(null);
    void api.get<{ events: FeedEvent[] }>(`/api/activity-history?clientId=${clientId}&from=${day}&to=${day}`).then((r) => setEvents(r.events));
  }, [clientId, day]);
  return (
    <Sheet open onClose={onClose} title="History">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setDay((d) => shiftDay(d, -1))} className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-4" aria-label="Previous day"><ChevronLeft /></button>
          <input type="date" max={today} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="flex-1 rounded-xl bg-surface-2 px-3 py-2.5 text-center text-sm outline-none [color-scheme:dark]" />
          <button onClick={() => setDay((d) => (d < today ? shiftDay(d, 1) : d))} disabled={day >= today} className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 [&_svg]:size-4" aria-label="Next day"><ChevronRight /></button>
        </div>
        <div className="text-center text-sm font-semibold text-muted-foreground">{dayLabel(day, today)}</div>
        {!events ? (
          <Skeleton className="h-40" />
        ) : events.length === 0 ? (
          <EmptyState icon={Clock} title="Nothing logged" description="No activity recorded on this day." />
        ) : (
          <Card className="divide-y divide-border/40 py-0.5">{events.map((ev) => <FeedRow key={ev.id} ev={ev} units={units} />)}</Card>
        )}
      </div>
    </Sheet>
  );
}

function Widget({ icon: Icon, tone, value, label }: { icon: typeof Flame; tone: Tone; value: number | string; label: string }) {
  return (
    <Card className="flex flex-col items-center gap-1 p-3 text-center">
      <Icon className="size-4" style={{ color: toneVar[tone] }} />
      <div className="numeral text-xl font-semibold">{value}</div>
      <div className="text-[0.65rem] text-muted-foreground">{label}</div>
    </Card>
  );
}

function weightDelta(series: { kg: number; date: string }[] | undefined, units: UnitPrefs): string {
  if (!series || series.length < 2) return "—";
  const last = series[series.length - 1]!;
  const target = Date.parse(last.date) - 7 * 86400000;
  let ref = series[0]!;
  for (const p of series) if (Math.abs(Date.parse(p.date) - target) < Math.abs(Date.parse(ref.date) - target)) ref = p;
  const d = Math.round((kgToDisplay(last.kg, units) - kgToDisplay(ref.kg, units)) * 10) / 10;
  return `${d > 0 ? "+" : ""}${d}`;
}
