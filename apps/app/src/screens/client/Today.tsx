/**
 * Client Today — hero ring + metric pills, action row, timeline feed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmtVolume, fmtEnergy, fmtWeight, featureEnabled, type UnitPrefs } from "@kova/domain";
import {
  Button, Card, Skeleton, MacroBar, IconBadge, Sheet, EmptyState, ProgressRing,
  Reveal, SkeletonHero, SkeletonList, SkeletonHeader,
  Page, Stagger, Plus, Play, PencilLine, ClipboardList, FlaskConical, History, Clock,
  Droplet, Dumbbell, Footprints, Weight, Moon, Smile, Timer, Pill, ArrowLeftRight, ArrowRight, Send, Info, Utensils, Croissant, Soup, Apple,
  Store, Ticket, AlertTriangle, ShieldCheck, toneVar, ChevronLeft, ChevronRight, Target, ScanLine, Calendar, BookOpen, type Tone, type LucideIcon,
} from "@kova/ui";
import type { WidgetItem } from "@kova/protocol";
import { useNavigate } from "react-router-dom";
import { api, todayLocal, shiftDay } from "../../api.js";
import { useUnits } from "../../units.js";
import { useSession } from "../../session.js";
import { usePasskey } from "../../PasskeyPrompt.js";
import { LogSheet } from "./LogSheet.js";
import { LogDetailSheet } from "./LogDetail.js";
import { WidgetCarousel, WidgetCustomizeSheet } from "../widget-kit.js";
import { CLIENT_WIDGETS, DEFAULT_CLIENT_WIDGETS, type ClientWidgetData } from "./HomeWidgets.js";
import { TodayAgenda, fetchAgenda, type AgendaData } from "./TodayAgenda.js";
import { CoachNote } from "./CoachNote.js";

export interface FeedEvent { id: string; kind: string; date: string; at: string; title: string; subtitle: string | null; ref?: string; actor?: string; metric?: { unit: "energy" | "volume" | "weight"; value: number } }

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

/**
 * Which SCREEN can actually fill each gap. `profileGaps` returns one flat list,
 * but the nine fields live on two different pages — and the card used to send
 * everyone to /profile, where six of the nine simply are not editable. You
 * arrived asked for your primary goal and found a form with name, DOB and
 * height on it.
 *
 * Only gender/DOB/height are on the profile form; everything else is on
 * Preferences → Training & nutrition.
 */
export const PROFILE_GAPS = new Set(["gender", "dateOfBirth", "height"]);

/** Where "Complete your profile" should land, given what is still missing.
 *  Preferences first because it owns the majority; once those are done the card
 *  points at the profile for the remaining three, so each tap lands on a screen
 *  that can actually fix something. */
export const gapDestination = (gaps: string[]): { href: string; label: string } =>
  gaps.some((g) => !PROFILE_GAPS.has(g))
    ? { href: "/preferences", label: "Complete your preferences" }
    : { href: "/profile", label: "Complete your profile" };

/** Loggable kinds that open their own detail drawer (a swipe-to-dismiss sheet,
 *  so you keep your place in the feed). Coach / plan events keep routing to
 *  their existing surfaces (sheets / tabs). */
const DETAIL_KINDS = new Set(["water", "workout", "activity", "measurement", "checkin", "sleep", "mood", "supplement", "fast", "bodyscan", "goal"]);
const opensDetail = (ev: FeedEvent): boolean => !!ev.ref && (ev.kind.startsWith("food") || DETAIL_KINDS.has(ev.kind));

/** The route a NON-detail feed event opens: coach feedback / labs → their
 *  Wellness sheet; plan events → the plan tab. */
const routeForEvent = (ev: FeedEvent): string | null => {
  switch (ev.kind) {
    case "feedback": return ev.ref ? `/wellness?checkin=${ev.ref}` : "/wellness";
    case "lab": return ev.ref ? `/wellness?lab=${ev.ref}` : "/wellness";
    case "session": return "/wellness";
    case "plan_meal": return "/eat";
    case "swap": case "plan_workout": return "/train";
    default: return null;
  }
};

export function Today({ clientId, onStart, onOpen }: { clientId: string; onStart?: () => void; onOpen?: (route: string) => void }) {
  const [data, setData] = useState<TodayBundle | null>(null);
  const [agenda, setAgenda] = useState<AgendaData | null>(null);
  const [feed, setFeed] = useState<FeedEvent[] | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [detail, setDetail] = useState<{ kind: string; ref: string } | null>(null);
  const [widgetsOpen, setWidgetsOpen] = useState(false);
  // The home widget layout is CLIENT-scoped (stored on the client's dashboard
  // prefs, surfaced in the today bundle), so a coach viewing a client edits the
  // client's own hero — not their own — and both see the same arrangement.
  const [widgetItems, setWidgetItems] = useState<WidgetItem[] | null>(null);
  // The today bundle is the only read the page can't render without; the feed is
  // its own section and fails on its own. `reloadKey` drives the retry buttons.
  const [error, setError] = useState(false);
  const [feedError, setFeedError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const units = useUnits();
  const nav = useNavigate();
  const { ctx } = useSession();
  const pk = usePasskey();
  const ownView = ctx?.active?.clientId === clientId;
  // Today is date-navigable: the whole day (macros + agenda + feed) rewinds to any
  // past date. Interactive/current-state blocks show only on the actual today.
  const today = todayLocal();
  const [date, setDate] = useState(today);
  const isToday = date === today;

  // Offer only the widgets this plan unlocks — a widget tagged with a FEATURES
  // key is filtered out when the tenant/client lacks it, so the hero and its
  // customize picker self-discover from the same records the routes enforce.
  const widgetCatalog = useMemo(() => {
    const features = ctx?.entitlements?.features;
    if (!features) return CLIENT_WIDGETS;
    return CLIENT_WIDGETS.filter((w) => !w.feature || featureEnabled(w.feature, { features, clientFlags: ctx?.clientFlags }));
  }, [ctx?.entitlements?.features, ctx?.clientFlags]);

  const saveWidgets = async (items: WidgetItem[]) => {
    setWidgetItems(items);
    await api.patch(`/api/clients/${clientId}`, { dashboardPrefs: { widgets: items } }).catch(() => undefined);
  };

  // Only the newest load may commit — guards against an out-of-order resolve
  // when the scoped clientId changes (coach switching between clients).
  const reqRef = useRef(0);
  const load = useCallback(async () => {
    const rid = ++reqRef.current;
    setError(false); setFeedError(false);
    // allSettled, not all: the bundle, the day's history and the agenda are three
    // INDEPENDENT reads. Under Promise.all one failing sibling discarded the other
    // two, and since the loading flag is `!data || !agenda` the page sat on its
    // skeleton forever with nothing said and nothing to tap.
    const [bundleR, histR, agR] = await Promise.allSettled([
      api.get<TodayBundle>(`/api/today?clientId=${clientId}&date=${date}`),
      api.get<{ events: FeedEvent[] }>(`/api/activity-history?clientId=${clientId}&from=${date}&to=${date}`),
      fetchAgenda(clientId, date),
    ]);
    if (rid !== reqRef.current) return;
    // Everything on the page hangs off the bundle (rings, macros, access, agenda
    // rows), so this is the one failure that owns the whole screen.
    if (bundleR.status !== "fulfilled") { setError(true); return; }
    setData(bundleR.value); setWidgetItems(bundleR.value.widgets ?? null);
    if (histR.status === "fulfilled") setFeed(histR.value.events);
    else { setFeed([]); setFeedError(true); }
    // A dead agenda read degrades to the rows derivable from the bundle alone
    // (check-in + today's workout) instead of holding the whole day hostage.
    setAgenda(agR.status === "fulfilled" ? agR.value : { supps: [], taken: [], mealTypes: [], loggedMeals: [] });
  }, [clientId, date]);
  // Reset to the skeleton when the scoped client changes so the previous
  // client's data doesn't linger; then (re)load. Manual refreshes reuse `load`
  // without resetting, so they don't flash the skeleton.
  useEffect(() => { setData(null); setAgenda(null); setFeed(null); void load(); }, [load, reloadKey]);

  const targets = data?.goal?.targets ?? null;
  const widgetData: ClientWidgetData | null = data ? { clientId, units, bundle: data } : null;

  return (
    <Page className="mx-auto max-w-xl space-y-5 p-4 pb-28">
      {error && !data ? (
        <EmptyState icon={AlertTriangle} title="Couldn't load your day" description="Something went wrong loading today. Check your connection and try again." action={<Button onClick={() => setReloadKey((k) => k + 1)}>Try again</Button>} />
      ) : (
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
          {/* Date navigator — the whole day (macros + agenda + feed) rewinds. */}
          <Stagger className="flex items-center gap-2">
            <button onClick={() => setDate((d) => shiftDay(d, -1))} aria-label="Previous day" className="grid size-9 shrink-0 place-items-center rounded-full bg-background/25 text-muted-foreground backdrop-blur-md transition-colors hover:bg-background/40 hover:text-foreground [&_svg]:size-4"><ChevronLeft /></button>
            <label className="relative flex-1">
              <input type="date" max={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Pick a date" />
              <div className="pointer-events-none flex items-center justify-center gap-1.5 rounded-xl bg-background/25 px-3 py-2 text-sm font-semibold backdrop-blur-md [&_svg]:size-4"><Calendar className="text-muted-foreground" />{dayLabel(date, today)}</div>
            </label>
            {isToday
              ? <div className="size-9 shrink-0" />
              : <button onClick={() => setDate((d) => (d < today ? shiftDay(d, 1) : d))} aria-label="Next day" className="grid size-9 shrink-0 place-items-center rounded-full bg-background/25 text-muted-foreground backdrop-blur-md transition-colors hover:bg-background/40 hover:text-foreground [&_svg]:size-4"><ChevronRight /></button>}
          </Stagger>
          {!isToday && <button onClick={() => setDate(today)} className="mx-auto block text-xs font-medium text-primary">Jump to today</button>}

          {isToday && (() => {
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
            const dest = gapDestination(data.profile.gaps);
            return (
              <Stagger>
                <Card className="relative overflow-hidden">
                  <div className="pointer-events-none absolute -right-12 -top-14 size-44 rounded-full bg-primary/15 blur-3xl" />
                  <button onClick={ownView ? () => nav(dest.href) : undefined} disabled={!ownView} className="block w-full text-left">
                    <div className="relative flex items-center gap-4">
                      <ProgressRing size={66} strokeWidth={7} tone="primary" progress={pct || 0.001} value={<span className="text-sm font-bold">{done}/{total}</span>} softTrack tintValue />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium uppercase tracking-wide text-primary">{ownView ? "Finish setting up" : "Profile incomplete"}</div>
                        <h3 className="mt-0.5 text-lg font-semibold tracking-tight">{ownView ? dest.label : "Complete your profile"}</h3>
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
            <WidgetCarousel catalog={widgetCatalog} items={widgetItems} defaults={DEFAULT_CLIENT_WIDGETS} data={widgetData} onCustomize={() => setWidgetsOpen(true)} />
          </Stagger>

          <Stagger>
            <MacroBar
              proteinG={data.nutrition.proteinG}
              carbsG={data.nutrition.carbsG}
              fatG={data.nutrition.fatG}
              targets={targets ? { proteinG: targets.targetProteinG, carbsG: targets.targetCarbsG, fatG: targets.targetFatG } : null}
            />
          </Stagger>

          {isToday && (
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
          )}

          {isToday && (
          <Stagger data-tour="today-agenda">
            <TodayAgenda clientId={clientId} date={date} bundle={data} agenda={agenda} onChanged={() => void load()} onNavigate={onOpen} onCheckIn={() => setCheckInOpen(true)} onStartWorkout={onStart} />
          </Stagger>
          )}

          {/* The day's activity timeline — the client's own logs + coach events. */}
          <Stagger className="space-y-2">
            <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{isToday ? "Today's activity" : `${dayLabel(date, today)} · activity`}</h3>
            <Reveal loading={!feed} skeleton={<SkeletonList card rows={3} />}>
              {feed && (feedError ? (
                /* The feed alone failed — an empty timeline would read as "you
                   logged nothing today", which is a different and wrong claim. */
                <Card className="flex items-center justify-between gap-3 py-3 text-sm text-muted-foreground">
                  <span className="min-w-0">Couldn't load this day's activity.</span>
                  <Button size="sm" variant="secondary" className="shrink-0" onClick={() => setReloadKey((k) => k + 1)}>Retry</Button>
                </Card>
              ) : feed.length === 0 ? (
                <Card className="text-center text-sm text-muted-foreground">{isToday ? "Your day fills in here as you log — meals, workouts, check-ins and more." : "Nothing was logged on this day."}</Card>
              ) : (
                <Card className="divide-y divide-border/40 py-0.5">
                  {feed.map((ev) => <FeedRow key={ev.id} ev={ev} units={units} onOpen={onOpen} onDetail={(kind, ref) => setDetail({ kind, ref })} />)}
                </Card>
              ))}
            </Reveal>
          </Stagger>

          {isToday && <Stagger><CoachNote clientId={clientId} surface="home" /></Stagger>}

          {/* Content hub — an Explore rail of the coach's latest articles/recipes
              (SPEC §8.10 surfacing). Self-fetches; renders nothing when empty. */}
          {isToday && <ExploreRail clientId={clientId} onOpen={() => nav("/explore")} />}
        </>
        )}
      </Reveal>
      )}

      {detail && <LogDetailSheet kind={detail.kind} ref={detail.ref} onClose={() => setDetail(null)} />}
      <LogSheet open={logOpen} onClose={() => setLogOpen(false)} clientId={clientId} onLogged={() => void load()} />
      {checkInOpen && <LogSheet open initialKind="checkin" onClose={() => setCheckInOpen(false)} clientId={clientId} onLogged={() => { setCheckInOpen(false); void load(); }} />}
      {widgetsOpen && <WidgetCustomizeSheet catalog={widgetCatalog} items={widgetItems} defaults={DEFAULT_CLIENT_WIDGETS} onClose={() => setWidgetsOpen(false)} onSave={saveWidgets} />}
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
  feedback: { icon: Send, tone: "primary" },
  sleep: { icon: Moon, tone: "sleep" },
  mood: { icon: Smile, tone: "nutrition" },
  fast: { icon: Timer, tone: "sleep" },
  supplement: { icon: Pill, tone: "supplement" },
  swap: { icon: ArrowLeftRight, tone: "activity" },
  lab: { icon: FlaskConical, tone: "lab" },
  session: { icon: ClipboardList, tone: "activity" },
  plan_workout: { icon: Dumbbell, tone: "activity" },
  plan_meal: { icon: Utensils, tone: "nutrition" },
  bodyscan: { icon: ScanLine, tone: "sleep" },
  goal: { icon: Target, tone: "cardio" },
};
const metaFor = (kind: string) => FEED_META[kind] ?? { icon: Info, tone: "neutral" as Tone };

function formatMetric(metric: FeedEvent["metric"], units: UnitPrefs): string | null {
  if (!metric) return null;
  return metric.unit === "energy" ? fmtEnergy(metric.value, units) : metric.unit === "volume" ? fmtVolume(metric.value, units) : fmtWeight(metric.value, units);
}

function dayLabel(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === shiftDay(today, -1)) return "Yesterday";
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

// ── Explore rail: the tenant's content hub, surfaced on Today ────────────────
interface RailResource { id: string; type: string; title: string; summary: string | null; coverUrl: string | null; category?: string | null; durationMinutes: number | null }
const railIcon = (t: string): LucideIcon => (t === "recipe" ? Utensils : t === "warmup" || t === "stretch" ? Dumbbell : BookOpen);

/** A horizontal rail of article/recipe cover cards that opens the full Explore
 *  hub. Self-fetching so the feed only shows it when the coach has published
 *  content the client can see (audience-gated server-side). */
function ExploreRail({ clientId, onOpen }: { clientId: string; onOpen: () => void }) {
  const [items, setItems] = useState<RailResource[] | null>(null);
  useEffect(() => {
    void api.get<{ resources: RailResource[] }>(`/api/resources/feed?clientId=${clientId}`)
      .then((r) => setItems(r.resources.slice(0, 8))).catch(() => setItems([]));
  }, [clientId]);
  if (!items || items.length === 0) return null;
  return (
    <Stagger className="space-y-2">
      <button onClick={onOpen} className="flex w-full items-center justify-between px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Explore</h3>
        <span className="inline-flex items-center gap-0.5 text-sm font-medium text-primary [&_svg]:size-4">See all <ChevronRight /></span>
      </button>
      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
        {items.map((r) => {
          const Icon = railIcon(r.type);
          return (
            <button key={r.id} onClick={onOpen} className="w-[62%] shrink-0 snap-start text-left sm:w-[45%]">
              <div className="relative h-32 overflow-hidden rounded-2xl bg-card active:scale-[0.98]">
                {r.coverUrl ? <img src={r.coverUrl} alt="" className="absolute inset-0 size-full object-cover" /> : <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-primary/25 via-primary/5 to-surface-2 text-primary/60 [&_svg]:size-7"><Icon /></div>}
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-3">
                  {r.category && <div className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-white/80">{r.category}</div>}
                  <div className="line-clamp-2 text-sm font-semibold leading-snug text-white">{r.title}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </Stagger>
  );
}

function FeedRow({ ev, units, onOpen, onDetail }: { ev: FeedEvent; units: UnitPrefs; onOpen?: (route: string) => void; onDetail?: (kind: string, ref: string) => void }) {
  const meta = metaFor(ev.kind);
  // Coach-authored events carry the acting staff member's name ("by Jane").
  const sub = [ev.subtitle, ev.actor ? `by ${ev.actor}` : null, formatMetric(ev.metric, units)].filter(Boolean).join(" · ");
  const time = new Date(ev.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  // A logged thing opens its detail drawer in place; coach/plan events route.
  const detail = onDetail && opensDetail(ev);
  const route = !detail && onOpen ? routeForEvent(ev) : null;
  const clickable = detail || !!route;
  const open = () => (detail ? onDetail!(ev.kind.replace(":", "."), ev.ref!) : onOpen!(route!));
  const body = (
    <>
      <IconBadge icon={meta.icon} tone={meta.tone} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{ev.title}</div>
        {sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{time}</span>
      {clickable && <ChevronRight className="size-4 shrink-0 text-muted-foreground/40" />}
    </>
  );
  return clickable ? (
    <button onClick={open} className="flex w-full items-center gap-3 py-2.5 text-left transition-opacity active:opacity-60">{body}</button>
  ) : (
    <div className="flex items-center gap-3 py-2.5">{body}</div>
  );
}


