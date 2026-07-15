/**
 * Wellness tab — the health hub, brought up to the Train/Eat bar: a hydration
 * hero ring, quick-log chips, a live fasting timer with metabolic zones, a
 * "this week" metrics grid, tappable check-in history (opens a detail with
 * photos + coach feedback), a supplement tap-log, and lab tests (tap for the
 * reviewed result). Deep-linkable via ?checkin=<date> and ?lab=<id>.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fmtVolume, volumeLabel, volumeDisplayToMl } from "@mossa/domain";
import {
  Button, Card, Badge, Chip, Skeleton, Page, Stagger, IconBadge, StatCard, WeekDots, Sparkline, MiniBars, EmptyState, cn, toneVar,
  Reveal, SkeletonHero, SkeletonStatGrid, SkeletonList,
  ArrowLeft, Droplet, Timer, Pill, FlaskConical, Calendar, Check, ClipboardList, Bed, Flame, Plus, ChevronRight, Smile, Upload, type Tone,
} from "@mossa/ui";
import { api, todayLocal } from "../../api.js";
import { useUnits } from "../../units.js";
import { LogSheet } from "./LogSheet.js";
import { CheckInDetailSheet, LabDetailSheet, labStatus, isLabImage, type CheckInFull, type LabFull } from "./WellnessDetails.js";
import { WellnessScoreCard, WellnessScoreCardSkeleton, type WellnessScoreResult } from "./WellnessScore.js";
import { CheckRow } from "./TodayAgenda.js";
import { CoachNote } from "./CoachNote.js";

interface Supplement { id: string; name: string; dose: string | null; kind: string; schedule: { slot: string }[] }
interface Fast { activeFast: { started_at: string; target_hours: number } | null; recentFasts: { duration_minutes: number; target_hours: number }[] }
interface Session { id: string; scheduled_at: string; duration_minutes: number; status: string }
interface Today { waterMl: number; goal: { targets: { targetWaterMl?: number } | null } | null; checkInDates: string[] }

/** N days back from a YYYY-MM-DD string, as YYYY-MM-DD. */
const shift = (date: string, delta: number): string => { const d = new Date(`${date}T00:00:00`); d.setDate(d.getDate() + delta); return d.toISOString().slice(0, 10); };

interface Zone { label: string; start: number; max: number; tone: Tone; vis: number }
// Metabolic fasting zones — thresholds in elapsed hours (universal, target-free).
const ZONES: Zone[] = [
  { label: "Fed", start: 0, max: 4, tone: "nutrition", vis: 4 },
  { label: "Catabolic", start: 4, max: 16, tone: "cardio", vis: 12 },
  { label: "Fat burning", start: 16, max: 24, tone: "activity", vis: 8 },
  { label: "Ketosis", start: 24, max: 72, tone: "sleep", vis: 7 },
];
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
            <div className={cn("mt-1.5 truncate text-center text-[0.55rem] font-semibold leading-tight", current ? "text-foreground" : "text-muted-foreground/60")}>{z.label}</div>
            <div className="numeral text-center text-[0.5rem] text-muted-foreground/50">{z.start}h</div>
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
  const [loading, setLoading] = useState(true);
  const [logKind, setLogKind] = useState<"checkin" | "water" | "sleep" | "mood" | null>(null);
  const [detailCheckIn, setDetailCheckIn] = useState<CheckInFull | null>(null);
  const [detailLab, setDetailLab] = useState<LabFull | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const units = useUnits();
  const [params, setParams] = useSearchParams();
  const date = todayLocal();
  const waterPresets = units.volume === "oz" ? [8, 12, 16] : [250, 500, 750];

  const load = useCallback(async () => {
    const [s, sl, l, f, sess, ci, td, sc] = await Promise.all([
      api.get<{ supplements: Supplement[] }>(`/api/supplements?clientId=${clientId}`),
      api.get<{ taken: { supplement_id: string; slot: string }[] }>(`/api/supplements/logs?clientId=${clientId}&date=${date}`),
      api.get<{ labs: LabFull[] }>(`/api/labs?clientId=${clientId}`),
      api.get<Fast>(`/api/fasting?clientId=${clientId}`),
      api.get<{ sessions: Session[] }>(`/api/sessions?clientId=${clientId}`).catch(() => ({ sessions: [] })),
      api.get<{ checkIns: CheckInFull[] }>(`/api/check-ins?clientId=${clientId}`),
      api.get<Today>(`/api/today?clientId=${clientId}&date=${date}`),
      api.get<WellnessScoreResult>(`/api/wellness/score?clientId=${clientId}&today=${date}`).catch(() => null),
    ]);
    setSupps(s.supplements); setTaken(new Set(sl.taken.map((t) => `${t.supplement_id}:${t.slot}`)));
    setLabs(l.labs); setFast(f); setSessions(sess.sessions); setCheckIns(ci.checkIns); setToday(td); setScore(sc); setLoading(false);
  }, [clientId, date]);
  useEffect(() => void load(), [load]);

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

  const addWater = async (displayAmount: number) => { const ml = Math.round(volumeDisplayToMl(displayAmount, units)); await api.post("/api/logs/water", { clientId, data: { date, amountMl: ml } }); setToday((t) => (t ? { ...t, waterMl: t.waterMl + ml } : t)); };
  const toggleSupp = async (id: string, slot: string) => {
    const key = `${id}:${slot}`;
    const r = await api.post<{ taken: boolean }>(`/api/supplements/${id}/log`, { clientId, date, slot });
    setTaken((p) => { const n = new Set(p); r.taken ? n.add(key) : n.delete(key); return n; });
  };
  const toggleFast = async () => { await api.post("/api/fasting", { clientId, data: { action: fast?.activeFast ? "end" : "start", targetHours: 16 } }); await load(); };

  // ── This-week metrics ──
  const week = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => shift(date, -(6 - i)));
    const ciDates = new Set(checkIns.map((c) => c.date_local));
    const present = days.map((d) => ciDates.has(d));
    // streak: consecutive days with a check-in ending today (or yesterday).
    let streak = 0;
    for (let i = 0; ; i++) { const d = shift(date, -i); if (ciDates.has(d)) streak++; else if (i === 0) continue; else break; }
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
    <Page className="mx-auto max-w-xl space-y-5 p-4 pb-28">
      <div className="flex items-center gap-3">
        {onBack && <Button size="icon" variant="secondary" onClick={onBack}><ArrowLeft /></Button>}
        <h1 className={onBack ? "text-xl font-bold tracking-tight" : "text-2xl font-bold tracking-tight"}>Wellness</h1>
      </div>

      <Reveal loading={loading || !today} className="space-y-5" skeleton={
        <>
          <SkeletonHero height={150} />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-24 rounded-full" />)}
          </div>
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl" />
          <SkeletonStatGrid count={6} />
          <SkeletonList card rows={4} />
        </>
      }>
        {today && (
        <>
      {/* Wellness Score hero */}
      <Stagger>{score ? <WellnessScoreCard result={score} /> : <WellnessScoreCardSkeleton />}</Stagger>

      {/* Quick-log chips */}
      <Stagger className="flex flex-wrap gap-2">
        <Chip icon={ClipboardList} selected onClick={() => setLogKind("checkin")}>Check in</Chip>
        <Chip icon={Bed} onClick={() => setLogKind("sleep")}>Log sleep</Chip>
        <Chip icon={Smile} onClick={() => setLogKind("mood")}>Log mood</Chip>
        <Chip icon={Timer} onClick={() => void toggleFast()}>{fast?.activeFast ? "End fast" : "Start fast"}</Chip>
      </Stagger>

      {/* Hydration — slim daily control */}
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

      {/* Fasting — start/stop with a metabolic-zone timeline */}
      <Stagger>
        <Card className="relative space-y-4 overflow-hidden">
          {fast?.activeFast && <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full blur-3xl" style={{ backgroundColor: `color-mix(in oklch, ${toneVar[zone.tone]} 18%, transparent)` }} />}
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-2.5"><IconBadge icon={Timer} tone={fast?.activeFast ? zone.tone : "sleep"} size="sm" /><h2 className="font-semibold">Fasting</h2></div>
            {fast?.activeFast ? <Badge tone={zone.tone}>{zone.label}</Badge> : <Badge tone="neutral">Not fasting</Badge>}
          </div>

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
                  <div className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">Recent fasts</div>
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

      {/* This week */}
      <section className="space-y-2">
        <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">This week</h3>
        <Stagger className="grid grid-cols-2 gap-3">
          <StatCard stack label="Check-in streak" value={week.streak} unit={week.streak === 1 ? "day" : "days"} icon={ClipboardList} tone="nutrition"
            chart={<WeekDots days={week.present} todayIndex={6} tone="nutrition" fill />} />
          <StatCard stack label="Avg sleep" value={week.avgSleep != null ? week.avgSleep.toFixed(1) : "—"} unit={week.avgSleep != null ? "h" : undefined} icon={Bed} tone="sleep"
            chart={week.sleepSeries.length >= 2 ? <Sparkline values={week.sleepSeries} tone="sleep" width={132} /> : undefined} />
          <StatCard stack label="Avg mood" value={week.avgMood != null ? week.avgMood.toFixed(1) : "—"} unit={week.avgMood != null ? "/ 5" : undefined} icon={Smile} tone="cardio"
            chart={week.moodSeries.length >= 2 ? <Sparkline values={week.moodSeries} tone="cardio" width={132} /> : undefined} />
          <StatCard stack label="Fasts done" value={week.fastsDone} icon={Timer} tone="activity"
            chart={week.fastHoursSeries.length >= 2 ? <MiniBars values={week.fastHoursSeries} tone="activity" width={132} target={16} /> : undefined} />
          <StatCard stack label="Supplements" value={week.suppSlots ? `${week.suppTaken}/${week.suppSlots}` : "—"} unit={week.suppSlots ? "today" : undefined} icon={Pill} tone="supplement" />
          <StatCard stack label="Sessions" value={week.sessionsWeek} unit="this wk" icon={Calendar} tone="cardio" />
        </Stagger>
      </section>

      {/* Check-ins */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Check-ins</h3>
          <button onClick={() => setLogKind("checkin")} className="inline-flex items-center gap-1 text-sm font-medium text-primary [&_svg]:size-4"><Plus /> Check in</button>
        </div>
        {checkIns.length === 0 ? (
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

      {/* Supplements — a clear tap-to-log checklist */}
      {supps.length > 0 && (
        <section className="space-y-2">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Supplements · tap to log</h3>
          <Stagger>
            <Card className="divide-y divide-border/40 py-0.5">
              {supps.flatMap((s) => (s.schedule.length ? s.schedule : [{ slot: "daily" }]).map((sch) => (
                <CheckRow key={`${s.id}:${sch.slot}`} icon={Pill} tone="supplement" label={`Take ${s.name}`} sub={[s.dose, sch.slot === "daily" ? "" : sch.slot.replace(/_/g, " ")].filter(Boolean).join(" · ") || undefined} done={taken.has(`${s.id}:${sch.slot}`)} actionable={false} onClick={() => void toggleSupp(s.id, sch.slot)} />
              )))}
            </Card>
          </Stagger>
        </section>
      )}

      {/* Labs */}
      {labs.length > 0 && (
        <section className="space-y-2">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lab tests</h3>
          <Stagger className="space-y-1.5">
            {labs.map((l) => <LabRow key={l.id} lab={l} clientId={clientId} onOpen={() => setDetailLab(l)} onUploaded={load} />)}
          </Stagger>
        </section>
      )}

      {/* Sessions */}
      {sessions.length > 0 && (
        <section className="space-y-2">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sessions</h3>
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

      {logKind && <LogSheet open initialKind={logKind} clientId={clientId} onClose={() => setLogKind(null)} onLogged={() => { setLogKind(null); void load(); }} />}
      {detailCheckIn && <CheckInDetailSheet checkIn={detailCheckIn} onClose={() => setDetailCheckIn(null)} />}
      {detailLab && <LabDetailSheet lab={detailLab} onClose={() => setDetailLab(null)} />}
    </Page>
  );
}

/** A lab row: tap to view the detail; requested/scheduled labs get an inline
 *  upload affordance. Status coding is shared with the detail sheet; reviewed
 *  labs summarise their markers and flag any out-of-range results. */
function LabRow({ lab, clientId, onOpen, onUploaded }: { lab: LabFull; clientId: string; onOpen: () => void; onUploaded: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const canUpload = lab.status === "requested" || lab.status === "scheduled";
  const st = labStatus(lab.status);
  const thumb = lab.file_key && isLabImage(lab.file_key) ? `/api/media/${lab.file_key}` : null;
  const markers = lab.values?.length ?? 0;
  const flagged = lab.values?.filter((v) => v.flag && v.flag !== "normal").length ?? 0;
  const sub = canUpload
    ? (lab.due_by ? `Due ${new Date(lab.due_by).toLocaleDateString()}` : "Tap to upload your result")
    : lab.status === "uploaded" ? "Awaiting coach review"
    : lab.status === "reviewed" ? (markers ? `${markers} marker${markers === 1 ? "" : "s"}${flagged ? ` · ${flagged} flagged` : " · all in range"}` : "Result ready — tap to view")
    : lab.status === "cancelled" ? "Cancelled by your coach"
    : "Tap for details";
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("purpose", "lab");
      const up = await fetch("/api/media/upload", { method: "POST", credentials: "include", body: fd });
      const { key } = (await up.json()) as { key?: string };
      if (key) { await api.post(`/api/labs/${lab.id}/upload`, { clientId, fileKey: key }); onUploaded(); }
    } finally { setBusy(false); }
  };
  return (
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
  );
}
