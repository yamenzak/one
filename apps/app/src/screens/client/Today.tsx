/**
 * Client Today — hero ring + metric pills, action row, timeline feed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmtVolume, fmtEnergy, fmtWeight, featureEnabled, type UnitPrefs } from "@kova/domain";
import { Button, Card, Skeleton, Sheet, EmptyState, ProgressRing, Reveal, SkeletonHero, SkeletonList, SkeletonHeader, Page, Stagger, Rail, Anchor, DayNav, Eyebrow, LoadError, ChevronRight, ActionCluster, CountUp, Unit, Plus, Play, PencilLine, ClipboardList, FlaskConical, History, Clock, Droplet, Dumbbell, Footprints, Weight, Moon, Smile, Timer, Pill, ArrowLeftRight, ArrowRight, Send, Info, Utensils, Croissant, Soup, Apple, Store, Ticket, AlertTriangle, ShieldCheck, toneVar, Target, ScanLine, BookOpen, Group, Row, User, type Tone, type LucideIcon } from "@4dl/ui";
import { MacroBar } from "../../registry/index.js";
import type { WidgetItem } from "@kova/protocol";
import { useNavigate } from "react-router-dom";
import { api, todayLocal, shiftDay } from "../../api.js";
import { useUnits } from "../../units.js";
import { useSession } from "../../session.js";
import { usePasskey } from "../../PasskeyPrompt.js";
import { InstallAppCard } from "../../InstallPrompt.js";
import { LogSheet } from "./LogSheet.js";
import { LogDetailSheet } from "./LogDetail.js";
import { WidgetCarousel, WidgetBuilder } from "../widget-kit.js";
import { CLIENT_WIDGETS, DEFAULT_CLIENT_WIDGETS, type ClientWidgetData } from "./HomeWidgets.js";
import { TodayAgenda, fetchAgenda, type AgendaData } from "./TodayAgenda.js";
import { CoachNote } from "./CoachNote.js";

export interface FeedEvent { id: string; kind: string; date: string; at: string; title: string; subtitle: string | null; ref?: string; actor?: string; metric?: { unit: "energy" | "volume" | "weight"; value: number } }

export interface TodayBundle {
  date: string;
  nutrition: { calories: number; proteinG: number; carbsG: number; fatG: number };
  waterMl: number;
  burnedKcal: number;
  workout: { loggedSets: number; tonnageKg?: number; sessions: unknown[] };
  checkedIn: boolean;
  /** Day-scoped metrics for the home widgets — see the route comment. `null`
   *  means nothing recorded and must reach the value slot as `null` (§5). */
  metrics?: {
    sleepHours: number | null; sleepQuality: number | null;
    mood: number | null; energy: number | null; stress: number | null;
    steps: number | null; activeMinutes: number; activityCount: number;
    bodyFatPercent: number | null; bodyFatPrev: number | null;
    waistCm: number | null; chestCm: number | null; hipsCm: number | null;
    postureSeverity: string | null; somatotype: string | null;
    supplementsTaken: number; supplementsTotal: number;
  } | null;
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
  const { ctx, host } = useSession();
  const pk = usePasskey();
  const ownView = ctx?.active?.clientId === clientId;
  // Today is date-navigable: the whole day (macros + agenda + feed) rewinds to any
  // past date. Interactive/current-state blocks show only on the actual today.
  const today = todayLocal();
  const [date, setDate] = useState(today);
  const isToday = date === today;
  /**
   * Nothing on this screen can be written right now.
   *
   * Sourced from the host gate rather than guessed: the same flag `route-guard`
   * enforces with, so the buttons and the server cannot disagree about whether a
   * tap will work. A read-only studio, a closing one and a blocked one all land
   * here — blocked never renders Today at all (the Shell replaces it), but the
   * flag stays honest for the other two.
   */
  const frozen = !!host?.gate?.readOnly;

  // Offer only the widgets this plan unlocks — a widget tagged with a FEATURES
  // key is filtered out when the tenant/client lacks it, so the hero and its
  // customize picker self-discover from the same records the routes enforce.
  const widgetCatalog = useMemo(() => {
    const features = ctx?.entitlements?.features;
    const flags = ctx?.clientFlags;
    if (!features) return CLIENT_WIDGETS;
    /**
     * A widget's LANE must be part of what the client actually bought.
     *
     * The per-widget `feature` key already gates the individual capability, but
     * a studio sells coaching in two halves — the access economy carries
     * separate `workout` and `meal` budgets — and a client on a training-only
     * package was still offered nutrition tiles. An empty tile for something
     * you were never sold reads as a broken app, not as a thing you can buy.
     *
     * A lane asks for ANY capability on that side rather than plan access
     * specifically, so a client who self-logs food without following a meal
     * plan keeps their own numbers. With no flags resolved yet, nothing is
     * hidden — absence of data is not evidence of absence of access.
     */
    const laneOpen = (lane: "meal" | "workout") => {
      if (!flags) return true;
      return lane === "meal"
        ? flags.canAccessMealPlan || flags.canLogOwnFood
        : flags.canAccessWorkoutPlan || flags.canLogExtraWorkouts;
    };
    return CLIENT_WIDGETS.filter(
      (w) => (!w.feature || featureEnabled(w.feature, { features, clientFlags: flags })) && (!w.lane || laneOpen(w.lane)),
    );
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
  const widgetData: ClientWidgetData | null = data ? { clientId, units, bundle: data, isToday } : null;

  /**
   * The anchor value: energy taken in, net of what was burned, against target.
   *
   * Rendered in the client's own unit (kcal or kJ) and, when a target exists,
   * counting toward it — "1,840 of 2,200" is a sentence a person can act on;
   * "1,840" alone is trivia. With no target set the sub-line says so rather than
   * inventing a denominator, because a progress claim against a number nobody
   * chose is worse than no claim.
   */
  const energyAnchor = useMemo(() => {
    // The anchor names the day it is actually showing. It used to say "today"
    // unconditionally while the numbers underneath followed the date picker, so
    // rewinding a week gave you last Tuesday's calories labelled as today's —
    // the data was right and the label lied, which is the worse way round.
    const noun = units.energy === "kJ" ? "Energy" : "Calories";
    const label = `${noun} ${whenLabel(date, today)}`;
    if (!data) return { label, value: 0, unit: "", sub: "", word: undefined as string | undefined };
    const net = Math.max(0, data.nutrition.calories - data.burnedKcal);
    const target = targets?.targetCalories ?? 0;
    // `fmtEnergy` returns a formatted string with the unit; the anchor needs the
    // number and the unit apart so the unit can be rendered subordinate (§5).
    const shown = units.energy === "kJ" ? Math.round(net * 4.184) : Math.round(net);
    const shownTarget = units.energy === "kJ" ? Math.round(target * 4.184) : Math.round(target);
    const hasTarget = target > 0;
    const targetSub = hasTarget ? `${shownTarget.toLocaleString()} target` : "No target set yet";
    // §5: "a zero that is zero because there is no input is absence wearing a
    // number's clothes". A day nobody logged rendered as `0` at display size
    // over "of 2,100 target" — which reads as a verdict on the client rather
    // than a gap in the record, and it is the single biggest thing on screen.
    // Tested on the RAW inputs, not on `net`: food 0 with 500 burned is a real
    // measured zero and keeps the numeral.
    if (data.nutrition.calories === 0 && data.burnedKcal === 0)
      return { label, value: 0, unit: "", word: isToday ? "Nothing logged yet" : "Nothing logged", sub: targetSub };
    return {
      label,
      value: shown,
      unit: units.energy === "kJ" ? " kJ" : "",
      sub: hasTarget ? `of ${targetSub}` : targetSub,
      word: undefined as string | undefined,
    };
  }, [data, targets, units.energy, date, today, isToday]);

  return (
    <Page className="column space-y-5 p-4 pb-28">
      {error && !data ? (
        <EmptyState icon={AlertTriangle} title="Couldn't load your day" description="Something went wrong loading that day. Check your connection and try again." action={<Button onClick={() => setReloadKey((k) => k + 1)}>Try again</Button>} />
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
          {/*
            THE TAB NAMES ITSELF, AND ITS ONE SCOPING CONTROL RIDES BESIDE IT (§7).

            This opened on a bare full-width `DayNav` with nothing saying what
            the screen was — the only surface in the client-detail set that did,
            and the exact shape §7's "every tab of one subject opens the same
            way" was written against. Plans, Progress and Report all open with an
            eyebrow carrying one quiet control; this one now does too.

            The day is that control. `DayNav` sizes to its content in the action
            slot (the date pill's `flex-1` has no spare width to claim), so the
            two rows this replaces cost one — and the "Back to today" line stays
            inside the component, where it already reserves its own height so
            stepping off today does not shove the screen down a line.

            "Today" names the SURFACE, not the day on screen: the tab is called
            Today whichever day you have rewound to, and the pill beside it says
            which one that is. They read as the same word exactly once — on the
            current day, in two different registers (11px muted micro against a
            14px pill) — and diverge the moment you step back one. Naming the
            surface after its commonest state is the cost of calling the tab
            "Today" at all, and that is the tab bar's decision, not this row's.
          */}
          <Stagger>
            <Eyebrow action={
              <DayNav
                value={date}
                max={today}
                display={dayLabel(date, today)}
                onChange={setDate}
                onShift={(d) => setDate((cur) => shiftDay(cur, d))}
                resetTo={today}
              />
            }>Today</Eyebrow>
          </Stagger>

          {/*
            T1 — THE ANCHOR (UI-LANGUAGE §1).

            This screen had no single largest thing: a customizable widget
            carousel, a macro bar and a button row, all at comparable weight, so
            the eye had nowhere to land and every visit began with a scan. The
            day's energy is what Today is *about* — one noun, one number — so it
            is now the anchor, and the carousel drops to T3 where it belongs as
            supporting detail rather than a competing hero.

            Net of what you burned, because that is the number a client acts on.
          */}
          <Anchor eyebrow={energyAnchor.label} sub={energyAnchor.sub} word={energyAnchor.word}>
              <CountUp value={energyAnchor.value} />
              {energyAnchor.unit && <Unit>{energyAnchor.unit}</Unit>}
            </Anchor>

          {/*
            T2 — what you came here to DO. Circular icon + label, never a row of
            text buttons: a circle reads as an action, and four of them read as a
            set of choices rather than one shouted primary and its runners-up.
          */}
          {/*
            T2 follows the STATE, including a state where none of it can succeed.
            Every one of these four is a write, so on a read-only host all four
            402 — and an inviting circle that fails on tap is precisely the "the
            app is broken" reading the paused banner exists to prevent. The banner
            names the state; these have to agree with it.

            Disabled rather than hidden, for the same reason the day switcher's
            forward arrow disables at today: a dimmed control teaches the boundary,
            a missing one teaches nothing. It also keeps the cluster's floor of
            three intact (§1) instead of collapsing it to nothing.
          */}
          {isToday && ownView && (
            <ActionCluster
              items={[
                { icon: Plus, label: "Log", onClick: () => setLogOpen(true), disabled: frozen },
                { icon: Play, label: "Start", onClick: onStart, disabled: frozen || !data.publishedWorkoutPlan },
                { icon: ClipboardList, label: "Check in", onClick: () => setCheckInOpen(true), disabled: frozen },
                { icon: PencilLine, label: "Customise", onClick: () => setWidgetsOpen(true), disabled: frozen },
              ]}
            />
          )}


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
                        <div className="text-micro uppercase" style={{ color: tint }}>{notice.eyebrow}</div>
                        <h3 className="mt-0.5 text-body-lg">{notice.title}</h3>
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

          {/* The install nudge is its OWN group, not a row inside the profile
              one: the profile card disappears the moment the profile is
              complete, and an install nudge that only exists while a form is
              unfinished is a nudge most people never see. It renders nothing
              once the app is installed or after a "Not now". */}
          <Stagger><InstallAppCard /></Stagger>

          {data.profile && !data.profile.complete && (() => {
            const total = Object.keys(GAP_LABELS).length;
            const done = total - data.profile.gaps.length;
            const needsPasskey = ownView && pk?.supported && pk.hasPasskey === false;
            const dest = gapDestination(data.profile.gaps);
            return (
              /*
                A NAG IS A ROW, NOT A HERO.

                This shipped as a 200px card — a 66px ring, an eyebrow, a title,
                a sentence, and up to seven gap chips — sitting directly above
                the client's actual day. It was the second-largest thing on
                Today, and it is housekeeping. The chips were the worst of it:
                they listed the very fields the destination screen shows anyway,
                so the card previewed a form nobody had asked to see yet.

                One row: what's left, how far along, and a way in. Everything
                else belongs on the other side of the tap.
              */
              <Stagger>
                <Group>
                  <Row
                    icon={ownView ? Target : User}
                    sub={ownView ? "So your coach can set the right targets" : "Ask them to finish it"}
                    value={`${done}/${total}`}
                    onClick={ownView ? () => nav(dest.href) : undefined}
                    chevron={ownView}
                    divider={!needsPasskey}
                  >
                    {ownView ? dest.label : "Profile incomplete"}
                  </Row>
                  {/*
                    The gap list stays — but only for the COACH.

                    For the client the chips previewed a form they were one tap
                    from opening, which is why they came off the row. For the
                    coach they are the whole point: they cannot open the form,
                    they have to ASK, and "ask them to finish their profile" is
                    useless next to "ask them for their target weight". Same
                    component, opposite audiences, different answer.
                  */}
                  {!ownView && (
                    <div data-profile-gaps className="flex flex-wrap gap-1.5 px-4 pb-3.5">
                      {data.profile.gaps.slice(0, 6).map((g) => <span key={g} className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">{GAP_LABELS[g] ?? g}</span>)}
                      {data.profile.gaps.length > 6 && <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">+{data.profile.gaps.length - 6} more</span>}
                    </div>
                  )}
                  {needsPasskey && (
                    <Row
                      icon={ShieldCheck}
                      sub="One-tap sign-in with Face ID or fingerprint"
                      trailing={<Button size="sm" variant="tonal" onClick={() => pk!.promptEnroll()}>Set up</Button>}
                      divider={false}
                    >
                      Add a passkey
                    </Row>
                  )}
                </Group>
              </Stagger>
            );
          })()}

          {/* The macro bar is the ANCHOR'S SPLIT, which §1 explicitly endorses —
              so it belongs next to the anchor, not below a carousel of unrelated
              metrics. Read top to bottom it is now one thought: calories today,
              what those calories were made of, then everything else. */}
          <Stagger>
            <MacroBar
              proteinG={data.nutrition.proteinG}
              carbsG={data.nutrition.carbsG}
              fatG={data.nutrition.fatG}
              targets={targets ? { proteinG: targets.targetProteinG, carbsG: targets.targetCarbsG, fatG: targets.targetFatG } : null}
            />
          </Stagger>

          <Stagger>
            <WidgetCarousel catalog={widgetCatalog} items={widgetItems} defaults={DEFAULT_CLIENT_WIDGETS} data={widgetData} onCustomize={() => setWidgetsOpen(true)} />
          </Stagger>

          {isToday && (
          <Stagger>
            <TodayAgenda clientId={clientId} date={date} bundle={data} agenda={agenda} onChanged={() => void load()} onNavigate={onOpen} onCheckIn={() => setCheckInOpen(true)} onStartWorkout={onStart} />
          </Stagger>
          )}

          {/* The day's activity timeline — the client's own logs + coach events. */}
          <Stagger className="space-y-2">
            <h3 className="px-1 text-micro uppercase text-muted-foreground">{isToday ? "Today's activity" : `${dayLabel(date, today)} · activity`}</h3>
            <Reveal loading={!feed} skeleton={<SkeletonList card rows={3} />}>
              {feed && (feedError ? (
                /* The feed alone failed — an empty timeline would read as "you
                   logged nothing today", which is a different and wrong claim.
                   `LoadError` is the shared shape for exactly that: what broke,
                   and a way to try again (§7). */
                <LoadError what="this day's activity" error="Something went wrong reaching the server." onRetry={() => setReloadKey((k) => k + 1)} />
              ) : feed.length === 0 ? (
                <EmptyState
                  icon={History}
                  title={isToday ? "Nothing logged yet" : "Nothing was logged"}
                  description={isToday ? "Your day fills in here as you log — meals, workouts, check-ins and more." : undefined}
                />
              ) : (
                /* The app's row, not a hand-rolled one. This was a `Card` of
                   `py-2.5` buttons: below the 56px floor, with its own hairline
                   inset, its own press feedback and no entrance stagger — four
                   decisions §4 has already made. */
                <Group>
                  {feed.map((ev) => <FeedRow key={ev.id} ev={ev} units={units} onOpen={onOpen} onDetail={(kind, ref) => setDetail({ kind, ref })} />)}
                </Group>
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
      {widgetsOpen && widgetData && <WidgetBuilder data={widgetData} catalog={widgetCatalog} items={widgetItems} defaults={DEFAULT_CLIENT_WIDGETS} onClose={() => setWidgetsOpen(false)} onSave={saveWidgets} />}
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

/**
 * The same day, phrased to sit after a noun: "Calories today", "Calories
 * yesterday", "Calories on Mon, Jan 5". `dayLabel` is the standalone form for
 * the picker itself; this is the one that has to read as a sentence.
 */
function whenLabel(day: string, today: string): string {
  if (day === today) return "today";
  if (day === shiftDay(today, -1)) return "yesterday";
  return `on ${new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`;
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
        <h3 className="text-micro uppercase text-muted-foreground">Explore</h3>
        <span className="inline-flex items-center gap-0.5 text-sm font-medium text-primary [&_svg]:size-4">See all <ChevronRight /></span>
      </button>
      <Rail snap gap="md">
        {items.map((r) => {
          const Icon = railIcon(r.type);
          return (
            <button key={r.id} onClick={onOpen} className="w-[62%] shrink-0 snap-start text-left sm:w-[45%]">
              <div className="relative h-32 overflow-hidden rounded-2xl bg-card active:scale-[0.98]">
                {r.coverUrl ? <img src={r.coverUrl} alt="" className="absolute inset-0 size-full object-cover" /> : <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-primary/25 via-primary/5 to-surface-2 text-primary/60 [&_svg]:size-7"><Icon /></div>}
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-3">
                  {r.category && <div className="mb-0.5 text-micro uppercase text-white/80">{r.category}</div>}
                  <div className="line-clamp-2 text-sm font-semibold leading-snug text-white">{r.title}</div>
                </div>
              </div>
            </button>
          );
        })}
      </Rail>
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
  return (
    <Row
      // Tinted by KIND, so the day is scannable by colour before it is read —
      // and through `iconTone` rather than a custom `leading`, which would push
      // this row to the 72px avatar height and give the feed two row sizes.
      icon={meta.icon}
      iconTone={meta.tone}
      sub={sub || undefined}
      onClick={clickable ? open : undefined}
      trailing={
        <span className="flex shrink-0 items-center gap-1">
          <span className="numeral text-caption text-muted-foreground">{time}</span>
          {clickable && <ChevronRight aria-hidden className="size-4 text-muted-foreground" />}
        </span>
      }
    >
      {ev.title}
    </Row>
  );
}


