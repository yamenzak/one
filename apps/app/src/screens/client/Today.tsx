/**
 * Client Today — hero ring + metric pills, action row, timeline feed.
 */

import { useCallback, useEffect, useState } from "react";
import { fmtVolume, fmtEnergy, fmtWeight, type UnitPrefs } from "@mossa/domain";
import {
  Button, Card, Skeleton, MacroBar, IconBadge, Sheet, EmptyState,
  Page, Stagger, Plus, Play, PencilLine, ClipboardList, FlaskConical, History, Clock,
  Droplet, Dumbbell, Footprints, Weight, Moon, Smile, Timer, Pill, ArrowLeftRight, Sparkles, Utensils, Croissant, Soup, Apple,
  ChevronLeft, ChevronRight, type Tone, type LucideIcon,
} from "@mossa/ui";
import type { WidgetItem } from "@mossa/protocol";
import { api, todayLocal } from "../../api.js";
import { useUnits } from "../../units.js";
import { LogSheet } from "./LogSheet.js";
import { WidgetCarousel, WidgetCustomizeSheet } from "../widget-kit.js";
import { CLIENT_WIDGETS, DEFAULT_CLIENT_WIDGETS, type ClientWidgetData } from "./HomeWidgets.js";
import { TodayAgenda, fetchAgenda, type AgendaData } from "./TodayAgenda.js";
import { CoachNote } from "./CoachNote.js";

export interface FeedEvent { id: string; kind: string; date: string; at: string; title: string; subtitle: string | null; ref?: string; metric?: { unit: "energy" | "volume" | "weight"; value: number } }

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
  widgets?: WidgetItem[] | null;
}

/** The route (with any deep-link query) a feed event opens — client context
 *  only. Check-ins and labs open their detail sheet on the Wellness page. */
const routeForEvent = (ev: FeedEvent): string | null => {
  const k = ev.kind;
  if (k.startsWith("food")) return "/eat";
  switch (k) {
    case "checkin": case "feedback": return ev.ref ? `/wellness?checkin=${ev.ref}` : "/wellness";
    case "lab": return ev.ref ? `/wellness?lab=${ev.ref}` : "/wellness";
    case "fast": case "sleep": case "supplement": case "session": return "/wellness";
    case "water": case "plan_meal": return "/eat";
    case "workout": case "activity": case "swap": case "plan_workout": return "/train";
    case "measurement": case "mood": return "/progress";
    default: return null;
  }
};

export function Today({ clientId, onStart, onOpen }: { clientId: string; onStart?: () => void; onOpen?: (route: string) => void }) {
  const [data, setData] = useState<TodayBundle | null>(null);
  const [agenda, setAgenda] = useState<AgendaData | null>(null);
  const [feed, setFeed] = useState<FeedEvent[] | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [widgetsOpen, setWidgetsOpen] = useState(false);
  // The home widget layout is CLIENT-scoped (stored on the client's dashboard
  // prefs, surfaced in the today bundle), so a coach viewing a client edits the
  // client's own hero — not their own — and both see the same arrangement.
  const [widgetItems, setWidgetItems] = useState<WidgetItem[] | null>(null);
  const units = useUnits();
  const date = todayLocal();

  const saveWidgets = async (items: WidgetItem[]) => {
    setWidgetItems(items);
    await api.patch(`/api/clients/${clientId}`, { dashboardPrefs: { widgets: items } }).catch(() => undefined);
  };

  const load = useCallback(async () => {
    const [bundle, hist, ag] = await Promise.all([
      api.get<TodayBundle>(`/api/today?clientId=${clientId}&date=${date}`),
      api.get<{ events: FeedEvent[] }>(`/api/activity-history?clientId=${clientId}&from=${date}&to=${date}`),
      fetchAgenda(clientId, date),
    ]);
    setData(bundle); setWidgetItems(bundle.widgets ?? null); setFeed(hist.events); setAgenda(ag);
  }, [clientId, date]);
  useEffect(() => void load(), [load]);

  if (!data || !agenda) {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-4">
        <Skeleton className="h-52" />
        <Skeleton className="h-14" />
        <Skeleton className="h-36" />
      </div>
    );
  }

  const targets = data.goal?.targets ?? null;
  const widgetData: ClientWidgetData = { clientId, units, bundle: data };

  return (
    <Page className="mx-auto max-w-xl space-y-5 p-4 pb-28">
      <Stagger>
        <WidgetCarousel catalog={CLIENT_WIDGETS} items={widgetItems} defaults={DEFAULT_CLIENT_WIDGETS} data={widgetData} onCustomize={() => setWidgetsOpen(true)} />
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
        <Button size="icon" variant="secondary" aria-label="Customize widgets" onClick={() => setWidgetsOpen(true)}>
          <PencilLine />
        </Button>
      </Stagger>

      <Stagger>
        <TodayAgenda clientId={clientId} date={date} bundle={data} agenda={agenda} onChanged={() => void load()} onNavigate={onOpen} onCheckIn={() => setCheckInOpen(true)} onStartWorkout={onStart} />
      </Stagger>

      {/* Today's activity — everything logged today; older days live in History. */}
      <Stagger className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Today's activity</h3>
          <button onClick={() => setHistoryOpen(true)} className="inline-flex items-center gap-1 text-sm font-medium text-primary [&_svg]:size-4"><History /> History</button>
        </div>
        {!feed ? (
          <Skeleton className="h-32" />
        ) : feed.length === 0 ? (
          <Card className="text-center text-sm text-muted-foreground">Your day fills in here as you log — meals, workouts, check-ins and more.</Card>
        ) : (
          <Card className="divide-y divide-border/40 py-0.5">
            {feed.map((ev) => <FeedRow key={ev.id} ev={ev} units={units} onOpen={onOpen} />)}
          </Card>
        )}
      </Stagger>

      <Stagger><CoachNote clientId={clientId} surface="home" /></Stagger>

      <LogSheet open={logOpen} onClose={() => setLogOpen(false)} clientId={clientId} onLogged={() => void load()} />
      {checkInOpen && <LogSheet open initialKind="checkin" onClose={() => setCheckInOpen(false)} clientId={clientId} onLogged={() => { setCheckInOpen(false); void load(); }} />}
      {historyOpen && <HistorySheet clientId={clientId} onClose={() => setHistoryOpen(false)} onOpen={onOpen} />}
      {widgetsOpen && <WidgetCustomizeSheet catalog={CLIENT_WIDGETS} items={widgetItems} defaults={DEFAULT_CLIENT_WIDGETS} onClose={() => setWidgetsOpen(false)} onSave={saveWidgets} />}
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
  supplement: { icon: Pill, tone: "supplement" },
  swap: { icon: ArrowLeftRight, tone: "activity" },
  lab: { icon: FlaskConical, tone: "lab" },
  session: { icon: ClipboardList, tone: "activity" },
  plan_workout: { icon: Dumbbell, tone: "activity" },
  plan_meal: { icon: Utensils, tone: "nutrition" },
};
const metaFor = (kind: string) => FEED_META[kind] ?? { icon: Sparkles, tone: "neutral" as Tone };

function formatMetric(metric: FeedEvent["metric"], units: UnitPrefs): string | null {
  if (!metric) return null;
  return metric.unit === "energy" ? fmtEnergy(metric.value, units) : metric.unit === "volume" ? fmtVolume(metric.value, units) : fmtWeight(metric.value, units);
}

function dayLabel(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === shiftDay(today, -1)) return "Yesterday";
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function FeedRow({ ev, units, onOpen }: { ev: FeedEvent; units: UnitPrefs; onOpen?: (route: string) => void }) {
  const meta = metaFor(ev.kind);
  const sub = [ev.subtitle, formatMetric(ev.metric, units)].filter(Boolean).join(" · ");
  const time = new Date(ev.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const route = onOpen ? routeForEvent(ev) : null;
  const body = (
    <>
      <IconBadge icon={meta.icon} tone={meta.tone} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{ev.title}</div>
        {sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}
      </div>
      <span className="shrink-0 text-[0.7rem] tabular-nums text-muted-foreground">{time}</span>
      {route && <ChevronRight className="size-4 shrink-0 text-muted-foreground/40" />}
    </>
  );
  return route ? (
    <button onClick={() => onOpen!(route)} className="flex w-full items-center gap-3 py-2.5 text-left transition-opacity active:opacity-60">{body}</button>
  ) : (
    <div className="flex items-center gap-3 py-2.5">{body}</div>
  );
}

/** History browser — pick any past day and see its full timeline. */
function HistorySheet({ clientId, onClose, onOpen }: { clientId: string; onClose: () => void; onOpen?: (route: string) => void }) {
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
          <Card className="divide-y divide-border/40 py-0.5">{events.map((ev) => <FeedRow key={ev.id} ev={ev} units={units} onOpen={onOpen ? (r) => { onClose(); onOpen(r); } : undefined} />)}</Card>
        )}
      </div>
    </Sheet>
  );
}

