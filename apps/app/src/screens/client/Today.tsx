/**
 * Client Today — hero ring + metric pills, action row, timeline feed.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { fmtVolume, fmtEnergy, fmtWeight, type UnitPrefs } from "@mossa/domain";
import {
  Button, Card, Skeleton, MacroBar, IconBadge, Sheet, EmptyState, ProgressRing,
  Reveal, SkeletonHero, SkeletonList, SkeletonHeader,
  Page, Stagger, Plus, Play, PencilLine, ClipboardList, FlaskConical, History, Clock,
  Droplet, Dumbbell, Footprints, Weight, Moon, Smile, Timer, Pill, ArrowLeftRight, ArrowRight, Sparkles, Utensils, Croissant, Soup, Apple,
  Store, Ticket, AlertTriangle, ShieldCheck, toneVar, ChevronLeft, ChevronRight, type Tone, type LucideIcon,
} from "@mossa/ui";
import type { WidgetItem } from "@mossa/protocol";
import { useNavigate } from "react-router-dom";
import { api, todayLocal } from "../../api.js";
import { useUnits } from "../../units.js";
import { useSession } from "../../session.js";
import { usePasskey } from "../../PasskeyPrompt.js";
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
  profile?: { complete: boolean; gaps: string[] } | null;
  access?: {
    hasSubscription: boolean;
    daysRemaining: number | null;
    expired: boolean;
    workoutActive: boolean;
    mealActive: boolean;
    sellsPackages: boolean;
    tenantDelinquent: boolean;
  } | null;
}

/** The access lifecycle notice for Today, derived from the today bundle. Null
 *  when there's nothing to say (healthy access, or a tenancy that doesn't sell). */
function accessNotice(a: TodayBundle["access"]): { tone: Tone; icon: LucideIcon; eyebrow: string; title: string; body: string; cta: string | null } | null {
  if (!a) return null;
  if (a.tenantDelinquent)
    return { tone: "warning", icon: AlertTriangle, eyebrow: "Access paused", title: "Some features are paused", body: "Your coach's account needs attention. Your data is safe — everything comes back once it's sorted.", cta: null };
  if (a.hasSubscription && a.expired && a.sellsPackages)
    return { tone: "danger", icon: Ticket, eyebrow: "Access expired", title: "Renew to keep your plan", body: "Your training & meal access has ended. Renew to pick up right where you left off.", cta: "Renew access" };
  if (a.hasSubscription && !a.expired && a.daysRemaining != null && a.daysRemaining <= 7)
    return { tone: "warning", icon: Clock, eyebrow: "Ending soon", title: `${a.daysRemaining} day${a.daysRemaining === 1 ? "" : "s"} of access left`, body: "Extend now so your plan doesn't pause when it lapses.", cta: "Extend access" };
  if (!a.hasSubscription && a.sellsPackages)
    return { tone: "primary", icon: Store, eyebrow: "Get started", title: "Unlock your coaching plan", body: "Browse your coach's packages to start training and eating on plan.", cta: "Browse packages" };
  return null;
}

const GAP_LABELS: Record<string, string> = {
  gender: "Gender",
  dateOfBirth: "Date of birth",
  height: "Height",
  targetWeight: "Target weight",
  goal: "Primary goal",
  activityLevel: "Activity level",
  workoutsPerWeek: "Workouts / week",
  mealsPerDay: "Meals / day",
  workoutLocation: "Where you train",
};

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
  const nav = useNavigate();
  const { ctx } = useSession();
  const pk = usePasskey();
  const ownView = ctx?.active?.clientId === clientId;
  const date = todayLocal();

  const saveWidgets = async (items: WidgetItem[]) => {
    setWidgetItems(items);
    await api.patch(`/api/clients/${clientId}`, { dashboardPrefs: { widgets: items } }).catch(() => undefined);
  };

  // Only the newest load may commit — guards against an out-of-order resolve
  // when the scoped clientId changes (coach switching between clients).
  const reqRef = useRef(0);
  const load = useCallback(async () => {
    const rid = ++reqRef.current;
    const [bundle, hist, ag] = await Promise.all([
      api.get<TodayBundle>(`/api/today?clientId=${clientId}&date=${date}`),
      api.get<{ events: FeedEvent[] }>(`/api/activity-history?clientId=${clientId}&from=${date}&to=${date}`),
      fetchAgenda(clientId, date),
    ]);
    if (rid !== reqRef.current) return;
    setData(bundle); setWidgetItems(bundle.widgets ?? null); setFeed(hist.events); setAgenda(ag);
  }, [clientId, date]);
  // Reset to the skeleton when the scoped client changes so the previous
  // client's data doesn't linger; then (re)load. Manual refreshes reuse `load`
  // without resetting, so they don't flash the skeleton.
  useEffect(() => { setData(null); setAgenda(null); setFeed(null); void load(); }, [load]);

  const targets = data?.goal?.targets ?? null;
  const widgetData: ClientWidgetData | null = data ? { clientId, units, bundle: data } : null;

  return (
    <Page className="mx-auto max-w-xl space-y-5 p-4 pb-28">
      <Reveal loading={!data || !agenda} className="space-y-5" skeleton={
        <>
          <SkeletonHero height={208} />
          <Skeleton className="h-16 rounded-2xl" />
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-11 flex-1 rounded-xl" />
            <Skeleton className="h-11 flex-1 rounded-xl" />
            <Skeleton className="size-11 rounded-xl" />
          </div>
          <SkeletonList card rows={3} />
          <div className="space-y-2">
            <SkeletonHeader />
            <SkeletonList card rows={3} />
          </div>
        </>
      }>
        {data && agenda && widgetData && (
        <>
          {(() => {
            const notice = accessNotice(data.access);
            if (!notice) return null;
            const tappable = !!notice.cta && ownView;
            const tint = toneVar[notice.tone];
            return (
              <Stagger>
                <button onClick={tappable ? () => nav("/shop") : undefined} disabled={!tappable} className="block w-full text-left">
                  <Card interactive={tappable} className="relative overflow-hidden">
                    <div className="pointer-events-none absolute -right-12 -top-14 size-44 rounded-full blur-3xl" style={{ backgroundColor: `color-mix(in oklch, ${tint} 18%, transparent)` }} />
                    <div className="relative flex items-center gap-4">
                      <div className="grid size-12 shrink-0 place-items-center rounded-2xl [&_svg]:size-6" style={{ backgroundColor: `color-mix(in oklch, ${tint} 15%, transparent)`, color: tint }}><notice.icon /></div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium uppercase tracking-wide" style={{ color: tint }}>{notice.eyebrow}</div>
                        <h3 className="mt-0.5 text-lg font-semibold tracking-tight">{notice.title}</h3>
                        <p className="mt-0.5 text-sm text-muted-foreground">{notice.body}</p>
                      </div>
                      {tappable && <ChevronRight className="size-5 shrink-0 self-center text-muted-foreground" />}
                    </div>
                    {tappable && (
                      <div className="relative mt-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ color: tint, backgroundColor: `color-mix(in oklch, ${tint} 12%, transparent)` }}>{notice.cta} <ArrowRight className="size-3.5" /></span>
                      </div>
                    )}
                  </Card>
                </button>
              </Stagger>
            );
          })()}

          {data.profile && !data.profile.complete && (() => {
            const total = Object.keys(GAP_LABELS).length;
            const done = total - data.profile.gaps.length;
            const pct = total ? done / total : 0;
            const needsPasskey = ownView && pk?.supported && pk.hasPasskey === false;
            return (
              <Stagger>
                <Card className="relative overflow-hidden">
                  <div className="pointer-events-none absolute -right-12 -top-14 size-44 rounded-full bg-primary/15 blur-3xl" />
                  <button onClick={ownView ? () => nav("/settings") : undefined} disabled={!ownView} className="block w-full text-left">
                    <div className="relative flex items-center gap-4">
                      <ProgressRing size={66} strokeWidth={7} tone="primary" progress={pct || 0.001} value={<span className="text-sm font-bold">{done}/{total}</span>} softTrack tintValue />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium uppercase tracking-wide text-primary">{ownView ? "Finish setting up" : "Profile incomplete"}</div>
                        <h3 className="mt-0.5 text-lg font-semibold tracking-tight">Complete your profile</h3>
                        <p className="mt-0.5 text-sm text-muted-foreground">{ownView ? "A few details let your coach tailor your plans and targets to you." : "Ask this client to finish their profile for accurate targets."}</p>
                      </div>
                      {ownView && <ChevronRight className="size-5 shrink-0 self-center text-muted-foreground" />}
                    </div>
                    <div className="relative mt-3.5 flex flex-wrap gap-1.5">
                      {data.profile.gaps.slice(0, 6).map((g) => <span key={g} className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">{GAP_LABELS[g] ?? g}</span>)}
                      {data.profile.gaps.length > 6 && <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">+{data.profile.gaps.length - 6} more</span>}
                    </div>
                  </button>
                  {needsPasskey && (
                    <div className="relative mt-3.5 flex items-center gap-3 border-t border-border/50 pt-3.5">
                      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary [&_svg]:size-4"><ShieldCheck /></div>
                      <div className="min-w-0 flex-1"><div className="text-sm font-medium">Add a passkey</div><div className="text-xs text-muted-foreground">One-tap sign-in with Face ID or fingerprint.</div></div>
                      <Button size="sm" variant="tonal" onClick={() => pk!.promptEnroll()}>Set up</Button>
                    </div>
                  )}
                </Card>
              </Stagger>
            );
          })()}

          <Stagger data-tour="today-hero">
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
            <Button size="lg" className="flex-1" data-tour="today-log" onClick={() => setLogOpen(true)}>
              <Plus /> Log
            </Button>
            <Button size="lg" variant="tonal" className="flex-1" onClick={onStart} disabled={!data.publishedWorkoutPlan}>
              <Play /> Start
            </Button>
            <Button size="icon" variant="secondary" aria-label="Customize widgets" onClick={() => setWidgetsOpen(true)}>
              <PencilLine />
            </Button>
          </Stagger>

          <Stagger data-tour="today-agenda">
            <TodayAgenda clientId={clientId} date={date} bundle={data} agenda={agenda} onChanged={() => void load()} onNavigate={onOpen} onCheckIn={() => setCheckInOpen(true)} onStartWorkout={onStart} />
          </Stagger>

          {/* Today's activity — everything logged today; older days live in History. */}
          <Stagger className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Today's activity</h3>
              <button onClick={() => setHistoryOpen(true)} className="inline-flex items-center gap-1 text-sm font-medium text-primary [&_svg]:size-4"><History /> History</button>
            </div>
            <Reveal loading={!feed} skeleton={<SkeletonList card rows={3} />}>
              {feed && (feed.length === 0 ? (
                <Card className="text-center text-sm text-muted-foreground">Your day fills in here as you log — meals, workouts, check-ins and more.</Card>
              ) : (
                <Card className="divide-y divide-border/40 py-0.5">
                  {feed.map((ev) => <FeedRow key={ev.id} ev={ev} units={units} onOpen={onOpen} />)}
                </Card>
              ))}
            </Reveal>
          </Stagger>

          <Stagger><CoachNote clientId={clientId} surface="home" /></Stagger>
        </>
        )}
      </Reveal>

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
    let alive = true;
    setEvents(null);
    void api.get<{ events: FeedEvent[] }>(`/api/activity-history?clientId=${clientId}&from=${day}&to=${day}`).then((r) => { if (alive) setEvents(r.events); });
    return () => { alive = false; };
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
        <Reveal loading={!events} skeleton={<SkeletonList card rows={5} />}>
          {events && (events.length === 0 ? (
            <EmptyState icon={Clock} title="Nothing logged" description="No activity recorded on this day." />
          ) : (
            <Card className="divide-y divide-border/40 py-0.5">{events.map((ev) => <FeedRow key={ev.id} ev={ev} units={units} onOpen={onOpen ? (r) => { onClose(); onOpen(r); } : undefined} />)}</Card>
          ))}
        </Reveal>
      </div>
    </Sheet>
  );
}

