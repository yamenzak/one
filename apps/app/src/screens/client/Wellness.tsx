/**
 * Wellness tab — how you're doing, as one number and what's behind it.
 *
 * Anchored on the wellness score (§1), with the pillar breakdown, hydration, a
 * live fasting timer with metabolic zones, a "this week" metrics grid, tappable
 * check-in history (opens a detail with photos + coach feedback), a supplement
 * tap-log, and lab tests. Deep-linkable via ?checkin=<date> and ?lab=<id>.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fmtVolume, volumeLabel, volumeDisplayToMl, POSTURE_GUIDANCE } from "@kova/domain";
import {
  Button, Card, Badge, Chip, Skeleton, Page, Stagger, IconBadge, StatCard, WeekDots, Sparkline, MiniBars, EmptyState, cn, toneVar,
  Reveal, SkeletonStatGrid, SkeletonList, TierAnchor, ActionCluster, CountUp,
  ArrowLeft, Droplet, Timer, Pill, FlaskConical, Calendar, Check, ClipboardList, Flame, Plus, ChevronRight, Upload, HeartPulse, AlertTriangle, METRICS, POSTURE_SEVERITY_TONE, FASTING_ZONES, type FastingZone, type Tone,
} from "@kova/ui";

interface PostureScan {
  date: string;
  bodyFatPercent: number | null;
  heightCm: number | null;
  circumferences: { neckCm: number | null; waistCm: number | null; hipsCm: number | null; chestCm: number | null };
  contourSide: [number, number][] | null;
  posture: { cvaDeg: number | null; trunkTiltDeg: number | null; severity: "good" | "mild" | "moderate" | "severe" } | null;
  somatotype: string | null;
}
const POSTURE_TONE = POSTURE_SEVERITY_TONE;
const capp = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
import { api, todayLocal, shiftDay, uploadMedia, isQueued, errorText } from "../../api.js";
import { QueuedNotice } from "../../notices.js";
import { useCan } from "../../FeatureLock.js";
import { useUnits } from "../../units.js";
import { scanProfile, modelSilhouette } from "./bodyscan/model.js";
import { PostureFigure } from "./bodyscan/PostureFigure.js";
import { LogSheet } from "./LogSheet.js";
import { CheckInDetailSheet, LabDetailSheet, labStatus, isLabImage, type CheckInFull, type LabFull } from "./WellnessDetails.js";
import { WellnessPillars, weakestPillar, WELLNESS_BAND, type WellnessScoreResult } from "./WellnessScore.js";
import { CheckRow } from "./TodayAgenda.js";
import { CoachNote } from "./CoachNote.js";
import { SupplementGuide } from "./SupplementGuide.js";

interface Supplement { id: string; name: string; dose: string | null; kind: string; schedule: { slot: string }[] }
interface Fast { activeFast: { started_at: string; target_hours: number } | null; recentFasts: { duration_minutes: number; target_hours: number }[] }
interface Session { id: string; scheduled_at: string; duration_minutes: number; status: string }
interface Today { waterMl: number; goal: { targets: { targetWaterMl?: number } | null } | null; checkInDates: string[] }

type Zone = FastingZone;
const ZONES = FASTING_ZONES; // SSOT — @kova/ui
const zoneAt = (h: number): Zone => ZONES.find((z) => h < z.max) ?? ZONES[ZONES.length - 1]!;
const nextZone = (h: number): Zone | null => { const i = ZONES.indexOf(zoneAt(h)); return i < ZONES.length - 1 ? ZONES[i + 1]! : null; };
const hoursToNext = (h: number): string => { const rem = Math.max(0, zoneAt(h).max - h); const hh = Math.floor(rem); const mm = Math.round((rem - hh) * 60); return hh > 0 ? `${hh}h ${mm}m` : `${mm}m`; };
/** The furthest zone a completed fast reached (for the recent-fasts list). */
const zoneReached = (h: number): Zone | null => (h < 4 ? null : [...ZONES].reverse().find((z) => h >= z.start) ?? null);

/** A metabolic-zone timeline: four tone-coded segments that fill as the fast
 *  progresses through Fed → Catabolic → Fat burning → Ketosis. */
function ZoneTrack({ elapsedHours }: { elapsedHours: number }) {
  return (
    <div className="relative flex gap-1.5">
      {ZONES.map((z) => {
        const end = z.max === 72 ? 30 : z.max; // cap the ketosis tail for a readable width
        const frac = Math.min(1, Math.max(0, (elapsedHours - z.start) / (end - z.start)));
        const current = elapsedHours >= z.start && elapsedHours < z.max;
        return (
          <div key={z.label} style={{ flexGrow: z.vis }} className="min-w-0">
            <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${frac * 100}%`, backgroundColor: toneVar[z.tone] }} /></div>
            <div className={cn("mt-1.5 truncate text-center text-xs font-semibold leading-tight", current ? "text-foreground" : "text-muted-foreground/60")}>{z.label}</div>
            <div className="numeral text-center text-xs leading-tight text-muted-foreground/50" aria-hidden="true">{z.start}h</div>
          </div>
        );
      })}
    </div>
  );
}

export function Wellness({ clientId, onBack }: { clientId: string; onBack?: () => void }) {
  const [supps, setSupps] = useState<Supplement[]>([]);
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [labs, setLabs] = useState<LabFull[]>([]);
  const [fast, setFast] = useState<Fast | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [checkIns, setCheckIns] = useState<CheckInFull[]>([]);
  const [today, setToday] = useState<Today | null>(null);
  const [score, setScore] = useState<WellnessScoreResult | null>(null);
  const [scans, setScans] = useState<PostureScan[]>([]);
  const [loading, setLoading] = useState(true);
  // The today bundle is the only read this tab genuinely can't render without;
  // `loadError` is that failure, and `failed` names the INDEPENDENT sections whose
  // own read fell over (see load()). `reloadKey` is the retry.
  const [loadError, setLoadError] = useState(false);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [reloadKey, setReloadKey] = useState(0);
  // Write feedback for the hot logging controls (water / fast / supplement tap):
  // a queued write is a deferred success, anything else didn't save at all.
  const [logErr, setLogErr] = useState<string | null>(null);
  const [logQueued, setLogQueued] = useState(false);
  const [logKind, setLogKind] = useState<"checkin" | "water" | "sleep" | "mood" | null>(null);
  const [detailCheckIn, setDetailCheckIn] = useState<CheckInFull | null>(null);
  const [detailLab, setDetailLab] = useState<LabFull | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const units = useUnits();
  const [params, setParams] = useSearchParams();
  const date = todayLocal();
  const waterPresets = units.volume === "oz" ? [8, 12, 16] : [250, 500, 750];
  // What this client's plan + package actually includes. A capability the client
  // doesn't hold is omitted from this tab entirely — they can't buy their
  // studio's plan, so a locked card here would be pure noise.
  const canFasting = useCan("fastingTimer");
  const canWater = useCan("waterLogging");
  const canSleep = useCan("sleepLogging");
  const canMood = useCan("moodLogging");
  const canBodyScan = useCan("bodyScan");
  const canSupplementsLabs = useCan("supplementsLabs");
  const canSessions = useCan("sessions");

  const load = useCallback(async () => {
    setLoadError(false);
    // allSettled, NOT all: these nine reads are independent surfaces of the same
    // tab. With Promise.all a single rejection discarded every sibling result and
    // — because `loading` only cleared on success — left the entire Wellness tab
    // on its skeleton forever, with no error and no retry. (Supplements/labs 403'd
    // for the client persona for a while, so that was the everyday outcome.) Now a
    // failed read degrades its own section and the rest of the tab still renders.
    //
    // A read whose SECTION isn't offered is skipped rather than fired-and-403'd:
    // the supplements/labs pair 403s for every tenant without the module, and
    // those two rejections used to surface as "couldn't load" notes on sections
    // the client was never sold. Positions are held with resolved stubs.
    const [s, sl, l, f, sess, ci, td, sc, bs] = await Promise.allSettled([
      canSupplementsLabs ? api.get<{ supplements: Supplement[] }>(`/api/supplements?clientId=${clientId}`) : Promise.resolve({ supplements: [] as Supplement[] }),
      canSupplementsLabs ? api.get<{ taken: { supplement_id: string; slot: string }[] }>(`/api/supplements/logs?clientId=${clientId}&date=${date}`) : Promise.resolve({ taken: [] as { supplement_id: string; slot: string }[] }),
      canSupplementsLabs ? api.get<{ labs: LabFull[] }>(`/api/labs?clientId=${clientId}`) : Promise.resolve({ labs: [] as LabFull[] }),
      canFasting ? api.get<Fast>(`/api/fasting?clientId=${clientId}`) : Promise.resolve<Fast | null>(null),
      canSessions ? api.get<{ sessions: Session[] }>(`/api/sessions?clientId=${clientId}`).catch(() => ({ sessions: [] })) : Promise.resolve({ sessions: [] as Session[] }),
      api.get<{ checkIns: CheckInFull[] }>(`/api/check-ins?clientId=${clientId}`),
      api.get<Today>(`/api/today?clientId=${clientId}&date=${date}`),
      api.get<WellnessScoreResult>(`/api/wellness/score?clientId=${clientId}&today=${date}`).catch(() => null),
      canBodyScan ? api.get<{ scans: PostureScan[] }>(`/api/body-scans?clientId=${clientId}`).catch(() => ({ scans: [] })) : Promise.resolve({ scans: [] as PostureScan[] }),
    ]);
    const bad = new Set<string>();
    if (s.status === "fulfilled") setSupps(s.value.supplements); else bad.add("supps");
    if (sl.status === "fulfilled") setTaken(new Set(sl.value.taken.map((t) => `${t.supplement_id}:${t.slot}`))); else bad.add("supps");
    if (l.status === "fulfilled") setLabs(l.value.labs); else bad.add("labs");
    if (f.status === "fulfilled") setFast(f.value); else bad.add("fast");
    if (ci.status === "fulfilled") setCheckIns(ci.value.checkIns); else bad.add("checkins");
    if (sess.status === "fulfilled") setSessions(sess.value.sessions);
    if (sc.status === "fulfilled") setScore(sc.value);
    if (bs.status === "fulfilled") setScans(bs.value.scans);
    setFailed(bad);
    // Hydration hero + water target come from the today bundle, so this one
    // failure blocks the screen (with an error + retry, never a silent skeleton).
    if (td.status === "fulfilled") setToday(td.value); else setLoadError(true);
    setLoading(false);
  }, [clientId, date, canSupplementsLabs, canFasting, canSessions, canBodyScan]);
  useEffect(() => void load(), [load, reloadKey]);
  const retry = () => { setLoading(true); setReloadKey((k) => k + 1); };

  // Live tick while a fast is running.
  useEffect(() => {
    if (!fast?.activeFast) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [fast?.activeFast]);

  // Deep-link: open a specific check-in (?checkin=<date>) or lab (?lab=<id>).
  useEffect(() => {
    if (loading) return;
    const ciDate = params.get("checkin");
    const labId = params.get("lab");
    if (!ciDate && !labId) return;
    if (ciDate) { const c = checkIns.find((x) => x.date_local === ciDate); if (c) setDetailCheckIn(c); }
    else if (labId) { const l = labs.find((x) => x.id === labId); if (l) setDetailLab(l); }
    setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, params]);

  const addWater = async (displayAmount: number) => {
    const ml = Math.round(volumeDisplayToMl(displayAmount, units));
    setLogErr(null); setLogQueued(false);
    try {
      await api.post("/api/logs/water", { clientId, data: { date, amountMl: ml } });
    } catch (e) {
      // A queued write is durably parked and WILL replay, so the ring must still
      // move and the copy must reassure; anything else never wrote, so don't move
      // the ring or the client tops up twice to "make it count".
      if (!isQueued(e)) { setLogErr(errorText(e, "Couldn't log that water — try again.")); return; }
      setLogQueued(true);
    }
    setToday((t) => (t ? { ...t, waterMl: t.waterMl + ml } : t));
  };

  /**
   * Per-slot in-flight guard. `/api/supplements/:id/log` is a TOGGLE: two fast
   * taps insert then delete, and if the first response resolves last the row
   * settles on a green tick while the server holds no log at all. Supplement
   * adherence feeds the coach's report, so that desync shows the coach a missed
   * dose the client believes they logged. One tap per slot at a time, then let
   * the server's answer be the truth — and revert (loudly) if it never came.
   */
  const suppInFlight = useRef<Set<string>>(new Set());
  const toggleSupp = async (id: string, slot: string) => {
    const key = `${id}:${slot}`;
    if (suppInFlight.current.has(key)) return;
    suppInFlight.current.add(key);
    const wasTaken = taken.has(key);
    setLogErr(null); setLogQueued(false);
    setTaken((p) => { const n = new Set(p); wasTaken ? n.delete(key) : n.add(key); return n; });
    try {
      const r = await api.post<{ taken: boolean }>(`/api/supplements/${id}/log`, { clientId, date, slot });
      setTaken((p) => { const n = new Set(p); r.taken ? n.add(key) : n.delete(key); return n; });
    } catch (e) {
      // Queued: the toggle lands on reconnect, so the optimistic tick is correct.
      if (isQueued(e)) { setLogQueued(true); return; }
      setTaken((p) => { const n = new Set(p); wasTaken ? n.add(key) : n.delete(key); return n; });
      setLogErr(errorText(e, "Couldn't log that dose — it wasn't saved."));
    } finally { suppInFlight.current.delete(key); }
  };

  const toggleFast = async () => {
    const ending = !!fast?.activeFast;
    setLogErr(null); setLogQueued(false);
    try {
      await api.post("/api/fasting", { clientId, data: { action: ending ? "end" : "start", targetHours: 16 } });
    } catch (e) {
      // Queued: the start/stop will replay, but re-reading now would only show
      // the stale server state — so confirm and leave the card as it is.
      if (isQueued(e)) { setLogQueued(true); return; }
      setLogErr(errorText(e, ending ? "Couldn't end your fast — try again." : "Couldn't start your fast — try again."));
      return;
    }
    await load();
  };

  // ── This-week metrics ──
  const week = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => shiftDay(date, -(6 - i)));
    const ciDates = new Set(checkIns.map((c) => c.date_local));
    const present = days.map((d) => ciDates.has(d));
    // streak: consecutive days with a check-in ending today (or yesterday).
    let streak = 0;
    for (let i = 0; ; i++) { const d = shiftDay(date, -i); if (ciDates.has(d)) streak++; else if (i === 0) continue; else break; }
    // Per-day series over the week window (chronological) → sparklines.
    const sleepByDay = new Map(checkIns.filter((c) => c.sleep_hours != null).map((c) => [c.date_local, c.sleep_hours!] as const));
    const moodByDay = new Map(checkIns.filter((c) => c.mood != null).map((c) => [c.date_local, c.mood!] as const));
    const sleepSeries = days.map((d) => sleepByDay.get(d)).filter((v): v is number => v != null);
    const moodSeries = days.map((d) => moodByDay.get(d)).filter((v): v is number => v != null);
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const avgSleep = avg(sleepSeries);
    const avgMood = avg(moodSeries);
    const fastHoursSeries = (fast?.recentFasts ?? []).map((r) => r.duration_minutes / 60).reverse().slice(-7);
    const fastsDone = (fast?.recentFasts ?? []).filter((r) => r.duration_minutes >= r.target_hours * 60).length;
    const sessionsWeek = sessions.filter((s) => { const d = s.scheduled_at.slice(0, 10); return d >= days[0]! && d <= date; }).length;
    const suppSlots = supps.reduce((n, s) => n + (s.schedule.length || 1), 0);
    const suppTaken = supps.reduce((n, s) => n + (s.schedule.length ? s.schedule : [{ slot: "daily" }]).filter((sc) => taken.has(`${s.id}:${sc.slot}`)).length, 0);
    return { days, present, streak, sleepSeries, moodSeries, avgSleep, avgMood, fastHoursSeries, fastsDone, sessionsWeek, suppSlots, suppTaken };
  }, [checkIns, fast, supps, taken, sessions, date]);

  const waterTarget = today?.goal?.targets?.targetWaterMl ?? 2500;
  const waterPct = today ? Math.min(1, today.waterMl / waterTarget) : 0;
  const fastElapsedMin = fast?.activeFast ? Math.floor((now - Date.parse(fast.activeFast.started_at)) / 60000) : 0;
  const fastHours = fastElapsedMin / 60;
  const zone = ZONES.find((z) => fastHours < z.max) ?? ZONES[ZONES.length - 1]!;
  const fastSecs = fast?.activeFast ? Math.floor((now - Date.parse(fast.activeFast.started_at)) / 1000) : 0;
  const clock = `${Math.floor(fastSecs / 3600)}:${String(Math.floor((fastSecs % 3600) / 60)).padStart(2, "0")}:${String(fastSecs % 60).padStart(2, "0")}`;

  return (
    <Page className="column space-y-5 p-4 pb-28">
      {onBack && (
        <div className="flex items-center gap-3">
          <Button size="icon" variant="secondary" onClick={onBack} aria-label="Back"><ArrowLeft /></Button>
          <h2 className="text-title-3">Wellness</h2>
        </div>
      )}

      {/* Write feedback for the tap-logging controls — one spot, always visible. */}
      {logQueued && <QueuedNotice />}
      {logErr && <p role="alert" className="text-sm text-warning">{logErr}</p>}

      {loadError && !today ? (
        <EmptyState icon={AlertTriangle} title="Couldn't load your wellness" description="Something went wrong loading your day. Check your connection and try again." action={<Button onClick={retry}>Try again</Button>} />
      ) : (
      /* The skeleton mirrors the real spine — anchor, cluster, content — so the
         screen doesn't visibly re-lay-out the moment the data lands. */
      <Reveal loading={loading || !today} className="space-y-5" skeleton={
        <>
          <div className="flex flex-col items-center gap-2 pb-1 pt-2">
            <Skeleton className="h-3 w-24 rounded-full" />
            <Skeleton className="h-14 w-32 rounded-2xl" />
            <Skeleton className="h-3 w-48 rounded-full" />
          </div>
          <div className="flex justify-center gap-6 py-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2"><Skeleton className="size-12 rounded-full" /><Skeleton className="h-2.5 w-10 rounded-full" /></div>
            ))}
          </div>
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl" />
          <SkeletonStatGrid count={6} />
          <SkeletonList card rows={4} />
        </>
      }>
        {today && (
        <>
      {/*
        T1 — THE ANCHOR (UI-LANGUAGE §1).

        Wellness is four subjects on one surface (sleep, mood, water, fasting),
        which looks like a screen with more than one job — but it isn't: those
        four are the INPUTS, and the wellness score is the one noun they add up
        to. The tour has always said as much ("one number for how you're really
        doing"); it just wasn't the largest thing on the screen. It is now, and
        the pillar breakdown drops to T3 where a breakdown belongs.

        No score yet → words, never a `0` or a dash (§5). A brand-new client
        scores exactly 0, and a 0 rendered at 56px/700 is not a measurement — it
        reads as a verdict on the person. The band already has the right sentence
        for that state, so say it instead and keep the numeral for a real number.
      */}
      <TierAnchor data-tour="wellness-hero" className="flex flex-col items-center gap-1 pb-1 pt-2 text-center">
        <p className="text-caption text-muted-foreground">Wellness score</p>
        {score && score.score > 0 ? (
          <>
            <p className="numeral text-display"><CountUp value={score.score} /></p>
            <p className="text-caption text-muted-foreground">{WELLNESS_BAND[score.band].label} · {WELLNESS_BAND[score.band].blurb}</p>
          </>
        ) : (
          <>
            <p className="text-title-1">{score ? WELLNESS_BAND[score.band].label : "Not scored yet"}</p>
            <p className="text-caption text-muted-foreground">{score ? WELLNESS_BAND[score.band].blurb : "Log a few things this week and your score appears here."}</p>
          </>
        )}
      </TierAnchor>

      {/*
        T2 — what you came here to DO. The same verbs the chip row carried, but
        as a cluster, so they read as a set of choices rather than a row of
        tags. Capabilities decide the count: below three the cluster looks
        adrift (§1), so a thin client gets a plain full-width button instead.
      */}
      {(() => {
        const acts = [
          { icon: ClipboardList, label: "Check in", onClick: () => setLogKind("checkin") },
          ...(canSleep ? [{ icon: METRICS.sleep.icon, label: "Sleep", onClick: () => setLogKind("sleep") }] : []),
          ...(canMood ? [{ icon: METRICS.mood.icon, label: "Mood", onClick: () => setLogKind("mood") }] : []),
          ...(canFasting ? [{ icon: Timer, label: fast?.activeFast ? "End fast" : "Fast", onClick: () => void toggleFast() }] : []),
        ];
        return acts.length >= 3 ? (
          <ActionCluster items={acts} />
        ) : (
          <Stagger className="flex gap-2">
            {acts.map((a) => <Button key={a.label} variant={a.label === "Check in" ? "default" : "outline"} className="flex-1" onClick={a.onClick}><a.icon /> {a.label}</Button>)}
          </Stagger>
        );
      })()}

      {/* What's behind the anchor — one bar per pillar. T3, and the score is
          deliberately absent: it already exists once, above. By this point the
          load has finished, so a null `score` is a failed read, not a pending
          one — show nothing rather than a skeleton that never resolves. */}
      {score && score.pillars.filter((p) => p.available).length >= 2 && (() => {
        const weak = weakestPillar(score);
        return (
          <section className="space-y-2">
            {/* Name the finding in the header. Seven scores out of 100 with no
                scale stated and no ranking is trivia; "Training is holding it
                back" is the same data doing a job. */}
            <div className="flex items-baseline justify-between gap-3 px-1">
              <h3 className="text-micro uppercase text-muted-foreground">
                {weak ? `${weak.label} is holding it back` : "What's behind it"}
              </h3>
              <span className="text-micro uppercase text-muted-foreground/70">each out of 100</span>
            </div>
            <Stagger><WellnessPillars result={score} /></Stagger>
          </section>
        );
      })()}

      {/* Hydration — slim daily control (`waterLogging`) */}
      {canWater && (
      <Stagger>
        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-hydration/10 blur-2xl" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-2.5"><IconBadge icon={Droplet} tone="hydration" size="sm" /><h2 className="font-semibold">Hydration</h2></div>
            <span className="numeral text-sm font-semibold text-hydration">{fmtVolume(today.waterMl, units)}<span className="text-muted-foreground"> / {fmtVolume(waterTarget, units)}</span></span>
          </div>
          <div className="relative mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-hydration transition-all duration-500" style={{ width: `${waterPct * 100}%` }} /></div>
          <div className="relative mt-3 flex flex-wrap gap-2">
            {waterPresets.map((v) => <Chip key={v} icon={Plus} onClick={() => void addWater(v)}>{v} {volumeLabel(units)}</Chip>)}
          </div>
        </Card>
      </Stagger>
      )}

      {/* Fasting — start/stop with a metabolic-zone timeline (`fastingTimer`) */}
      {canFasting && (
      <Stagger>
        <Card className="relative space-y-4 overflow-hidden">
          {fast?.activeFast && <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full blur-3xl" style={{ backgroundColor: `color-mix(in oklch, ${toneVar[zone.tone]} 18%, transparent)` }} />}
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-2.5"><IconBadge icon={Timer} tone={fast?.activeFast ? zone.tone : "sleep"} size="sm" /><h2 className="font-semibold">Fasting</h2></div>
            {fast?.activeFast ? <Badge tone={zone.tone}>{zone.label}</Badge> : <Badge tone="neutral">Not fasting</Badge>}
          </div>
          {/* Don't let a failed read pass "Not fasting" off as the truth. */}
          {failed.has("fast") && <p className="relative text-sm text-warning">Couldn't load your fasting status — this may not be up to date.</p>}

          {fast?.activeFast ? (
            <>
              <div className="relative text-center">
                <div className="numeral text-5xl font-bold tracking-tight tabular-nums">{clock}</div>
                <div className="mt-1 text-xs text-muted-foreground">{nextZone(fastHours) ? <>In <span className="font-medium text-foreground">{zone.label}</span> · {hoursToNext(fastHours)} to {nextZone(fastHours)!.label}</> : <>Deep in <span className="font-medium text-foreground">{zone.label}</span></>}</div>
              </div>
              <ZoneTrack elapsedHours={fastHours} />
              <Button className="relative w-full" variant="outline" onClick={() => void toggleFast()}>End fast</Button>
            </>
          ) : (
            <>
              <ZoneTrack elapsedHours={0} />
              <Button className="w-full" size="lg" onClick={() => void toggleFast()}><Timer /> Start fasting</Button>
              {(fast?.recentFasts.length ?? 0) > 0 && (
                <div className="space-y-1.5 border-t border-border/50 pt-3">
                  <div className="text-micro uppercase text-muted-foreground">Recent fasts</div>
                  {fast!.recentFasts.slice(0, 3).map((r, i) => (
                    <div key={i} className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="numeral">{Math.floor(r.duration_minutes / 60)}h {r.duration_minutes % 60}m</span>
                      {zoneReached(r.duration_minutes / 60) ? <Badge tone={zoneReached(r.duration_minutes / 60)!.tone}>{zoneReached(r.duration_minutes / 60)!.label}</Badge> : null}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Card>
      </Stagger>
      )}

      {/* Posture screen from the latest body scan — side figure + alignment (`bodyScan`) */}
      {canBodyScan && (() => {
        const withPosture = scans.filter((s) => s.posture); // newest-first
        const scan = withPosture[0];
        const latest = scan?.posture ?? null;
        if (!scan || !latest) return null;
        const trend = [...withPosture].reverse().map((s) => s.posture!.cvaDeg ?? 0).filter((v) => v > 0);
        const prof = scanProfile(scan);
        const side = prof ? modelSilhouette(prof, "side") : scan.contourSide;
        return (
          <Stagger>
            <Card className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5"><IconBadge icon={HeartPulse} tone="activity" size="sm" /><h2 className="font-semibold">Posture</h2></div>
                <Badge tone={POSTURE_TONE[latest.severity]}>{capp(latest.severity)}</Badge>
              </div>
              <div className="flex items-center gap-4">
                <PostureFigure side={side} cvaDeg={latest.cvaDeg} trunkTiltDeg={latest.trunkTiltDeg} severity={latest.severity} width={92} height={190} />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {latest.severity !== "good" && <AlertTriangle className="mr-1 inline size-3.5 -translate-y-px text-warning" />}
                    {POSTURE_GUIDANCE[latest.severity]}
                  </p>
                  <p className="text-xs text-muted-foreground">The line traces hip → shoulder → head; the dashed plumb is upright. A more forward head is a lower neck angle.</p>
                  {trend.length >= 2 && (
                    <div><div className="mb-1 text-xs font-medium text-muted-foreground">Neck angle trend</div><Sparkline values={trend} tone="activity" /></div>
                  )}
                </div>
              </div>
            </Card>
          </Stagger>
        );
      })()}

      {/* This week */}
      <section className="space-y-2">
        <h3 className="px-1 text-micro uppercase text-muted-foreground">This week</h3>
        <Stagger className="grid grid-cols-2 gap-3">
          <StatCard stack label="Check-in streak" value={week.streak} unit={week.streak === 1 ? "day" : "days"} icon={ClipboardList} tone="nutrition"
            chart={<WeekDots days={week.present} todayIndex={6} tone="nutrition" fill />} />
          {/* Each stat follows its capability — no stat for a surface we hid. */}
          {canSleep && <StatCard stack label="Avg sleep" value={week.avgSleep != null ? week.avgSleep.toFixed(1) : null} emptyText="Not logged" unit="h" icon={METRICS.sleep.icon} tone={METRICS.sleep.tone}
            chart={week.sleepSeries.length >= 2 ? <Sparkline values={week.sleepSeries} tone={METRICS.sleep.tone} width={132} /> : undefined} />}
          {canMood && <StatCard stack label="Avg mood" value={week.avgMood != null ? week.avgMood.toFixed(1) : null} emptyText="Not logged" unit="/ 5" icon={METRICS.mood.icon} tone={METRICS.mood.tone}
            chart={week.moodSeries.length >= 2 ? <Sparkline values={week.moodSeries} tone={METRICS.mood.tone} width={132} /> : undefined} />}
          {canFasting && <StatCard stack label="Fasts done" value={week.fastsDone} icon={Timer} tone="activity"
            chart={week.fastHoursSeries.length >= 2 ? <MiniBars values={week.fastHoursSeries} tone="activity" width={132} target={16} /> : undefined} />}
          {canSupplementsLabs && <StatCard stack label="Supplements" value={week.suppSlots ? `${week.suppTaken}/${week.suppSlots}` : null} emptyText="None set" unit="today" icon={Pill} tone="supplement" />}
          {canSessions && <StatCard stack label="Sessions" value={week.sessionsWeek} unit="this wk" icon={Calendar} tone="cardio" />}
        </Stagger>
      </section>

      {/* Check-ins */}
      <section className="space-y-2">
        {/* No "+ Check in" here: the action cluster at the top of the screen is
            the way in, and a third identical affordance on one screen is how a
            list header stops reading as a header (§1). */}
        <h3 className="px-1 text-micro uppercase text-muted-foreground">Check-ins</h3>
        {failed.has("checkins") ? (
          <SectionNote text="Couldn't load your check-in history." onRetry={retry} />
        ) : checkIns.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No check-ins yet" description="Check in to track your progress and get your coach's feedback." action={<Button onClick={() => setLogKind("checkin")}><Plus /> Check in</Button>} />
        ) : (
          <Stagger className="space-y-1.5">
            {checkIns.slice(0, 5).map((c) => {
              const photos = c.photos_json ? (() => { try { return (JSON.parse(c.photos_json!) as unknown[]).length; } catch { return 0; } })() : 0;
              const bits = [c.mood != null ? `mood ${c.mood}/5` : null, c.sleep_hours != null ? `${c.sleep_hours}h sleep` : null].filter(Boolean).join(" · ");
              return (
                <button key={c.id} onClick={() => setDetailCheckIn(c)} className="w-full text-left">
                  <Card interactive className="flex items-center gap-3 py-3">
                    <IconBadge icon={ClipboardList} tone="nutrition" size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{new Date(`${c.date_local}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</div>
                      <div className="truncate text-xs text-muted-foreground">{bits || "logged"}{photos > 0 ? ` · ${photos} photo${photos === 1 ? "" : "s"}` : ""}</div>
                    </div>
                    {c.trainer_feedback && <Badge tone="primary">Reply</Badge>}
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                  </Card>
                </button>
              );
            })}
          </Stagger>
        )}
      </section>

      {/* Supplements — a clear tap-to-log checklist (`supplementsLabs`). An empty
          list and a failed read look identical to the client, so name the
          difference; a tenant without the module gets neither. */}
      {!canSupplementsLabs ? null : failed.has("supps") ? (
        <section className="space-y-2">
          <h3 className="px-1 text-micro uppercase text-muted-foreground">Supplements</h3>
          <SectionNote text="Couldn't load your supplements or today's doses." onRetry={retry} />
        </section>
      ) : supps.length > 0 && (
        <section className="space-y-2">
          <h3 className="px-1 text-micro uppercase text-muted-foreground">Supplements · tap to log</h3>
          <Stagger>
            <Card className="divide-y divide-border/40 py-0.5">
              {supps.flatMap((s) => (s.schedule.length ? s.schedule : [{ slot: "daily" }]).map((sch) => (
                <CheckRow key={`${s.id}:${sch.slot}`} icon={Pill} tone="supplement" label={`Take ${s.name}`} sub={[s.dose, sch.slot === "daily" ? "" : sch.slot.replace(/_/g, " ")].filter(Boolean).join(" · ") || undefined} done={taken.has(`${s.id}:${sch.slot}`)} actionable={false} onClick={() => void toggleSupp(s.id, sch.slot)} />
              )))}
            </Card>
          </Stagger>
          <Stagger><SupplementGuide clientId={clientId} /></Stagger>
        </section>
      )}

      {/* Labs (`supplementsLabs`) */}
      {!canSupplementsLabs ? null : failed.has("labs") ? (
        <section className="space-y-2">
          <h3 className="px-1 text-micro uppercase text-muted-foreground">Lab tests</h3>
          <SectionNote text="Couldn't load your lab tests." onRetry={retry} />
        </section>
      ) : labs.length > 0 && (
        <section className="space-y-2">
          <h3 className="px-1 text-micro uppercase text-muted-foreground">Lab tests</h3>
          <Stagger className="space-y-1.5">
            {labs.map((l) => <LabRow key={l.id} lab={l} clientId={clientId} onOpen={() => setDetailLab(l)} onUploaded={load} />)}
          </Stagger>
        </section>
      )}

      {/* Sessions (`sessions` — the frontDesk entitlement) */}
      {canSessions && sessions.length > 0 && (
        <section className="space-y-2">
          <h3 className="px-1 text-micro uppercase text-muted-foreground">Sessions</h3>
          <Stagger>
            <Card className="space-y-3">
              {sessions.slice(0, 6).map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <IconBadge icon={Calendar} tone="activity" size="sm" />
                    <div className="min-w-0"><div className="truncate text-sm">{new Date(s.scheduled_at).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div><div className="text-xs text-muted-foreground">{s.duration_minutes} min</div></div>
                  </div>
                  <Badge tone={s.status === "completed" ? "success" : s.status === "scheduled" ? "activity" : s.status === "no_show" ? "danger" : "neutral"}>{s.status.replace("_", " ")}</Badge>
                </div>
              ))}
            </Card>
          </Stagger>
        </section>
      )}

      <Stagger><CoachNote clientId={clientId} surface="wellness" /></Stagger>
        </>
        )}
      </Reveal>
      )}

      {logKind && <LogSheet open initialKind={logKind} clientId={clientId} onClose={() => setLogKind(null)} onLogged={() => { setLogKind(null); void load(); }} />}
      {detailCheckIn && <CheckInDetailSheet checkIn={detailCheckIn} onClose={() => setDetailCheckIn(null)} />}
      {detailLab && <LabDetailSheet lab={detailLab} onClose={() => setDetailLab(null)} />}
    </Page>
  );
}

/** One section's own read failed while its siblings succeeded (the tab fans out
 *  with allSettled). Say so in place, with a retry, rather than rendering an
 *  empty section that reads to the client as "you have none". */
function SectionNote({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <Card className="flex items-center justify-between gap-3 py-3 text-sm text-muted-foreground">
      <span className="min-w-0">{text}</span>
      <Button size="sm" variant="secondary" className="shrink-0" onClick={onRetry}>Retry</Button>
    </Card>
  );
}

/** A lab row: tap to view the detail; requested/scheduled labs get an inline
 *  upload affordance. Status coding is shared with the detail sheet; reviewed
 *  labs summarise their markers and flag any out-of-range results. */
function LabRow({ lab, clientId, onOpen, onUploaded }: { lab: LabFull; clientId: string; onOpen: () => void; onUploaded: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canUpload = lab.status === "requested" || lab.status === "scheduled";
  const st = labStatus(lab.status);
  const thumb = lab.file_key && isLabImage(lab.file_key) ? `/api/media/${lab.file_key}` : null;
  const markers = lab.values?.length ?? 0;
  const flagged = lab.values?.filter((v) => v.flag && v.flag !== "normal").length ?? 0;
  const sub = canUpload
    // `due_by` is a date-only column: a bare `new Date("2026-08-01")` parses as
    // UTC midnight, so every timezone west of UTC renders the day BEFORE the one
    // the coach set. Pin it to local midnight (same idiom as coach/ClientManage).
    ? (lab.due_by ? `Due ${new Date(`${lab.due_by}T00:00:00`).toLocaleDateString()}` : "Tap to upload your result")
    : lab.status === "uploaded" ? "Awaiting coach review"
    : lab.status === "reviewed" ? (markers ? `${markers} marker${markers === 1 ? "" : "s"}${flagged ? ` · ${flagged} flagged` : " · all in range"}` : "Result ready — tap to view")
    : lab.status === "cancelled" ? "Cancelled by your coach"
    : "Tap for details";
  const upload = async (file: File) => {
    setBusy(true); setErr(null);
    try {
      const key = await uploadMedia(file, "lab", "upload", clientId);
      await api.post(`/api/labs/${lab.id}/upload`, { clientId, fileKey: key });
      onUploaded();
    } catch { setErr("Couldn't upload that result — try again."); } finally { setBusy(false); }
  };
  return (
    <div>
    <Card interactive className="flex items-center gap-3 py-3">
      {thumb
        ? <img src={thumb} alt="" className="size-10 shrink-0 rounded-xl object-cover" />
        : <IconBadge icon={FlaskConical} tone="lab" size="sm" />}
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="truncate font-medium">{lab.display_name}</div>
        <div className="truncate text-xs text-muted-foreground">{sub}</div>
      </button>
      {canUpload ? (
        <>
          <Button size="sm" disabled={busy} onClick={() => fileRef.current?.click()}><Upload /> {busy ? "…" : "Upload"}</Button>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
        </>
      ) : (
        <Badge tone={lab.status === "reviewed" && flagged ? "danger" : st.tone}>{lab.status === "reviewed" && flagged ? `${flagged} flagged` : st.label}</Badge>
      )}
    </Card>
    {err && <p className="mt-1 px-1 text-xs text-warning">{err}</p>}
    </div>
  );
}
