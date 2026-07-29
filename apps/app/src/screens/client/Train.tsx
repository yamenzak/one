/**
 * Train tab (DESIGN.md §3) — the workout home, brought up to the Eat-diary bar:
 * active-plan hero + day list, quick-start chips, a "this week" key-metrics
 * grid (Training Load vs target, tonnage, active days, PRs — all computed from
 * logged sessions + activities), and a recent-activity feed with WeekDots.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { prescribedSetsForDay, type WorkoutBody } from "@kova/protocol";
import { sessionTonnage, sessionLoad, epley1Rm, DEFAULT_WEEKLY_LOAD_TARGET, activityByKey, fmtEnergy, fmtWeight, kgToDisplay, weightLabel } from "@kova/domain";
import {
  Card, Badge, Button, Chip, Field, Skeleton, Page, Stagger, EmptyState, StatCard, WeekDots, Sparkline, MiniBars, IconBadge, Sheet,
  Reveal, SkeletonHero, SkeletonStatGrid, SkeletonList, SkeletonLine,
  Dumbbell, Play, Moon, ChevronRight, Plus, Footprints, Flame, TrendingUp, Trophy, Activity, AlertTriangle, Search,
  TierAnchor, CountUp,
} from "@kova/ui";
import { api, todayLocal, shiftDay } from "../../api.js";
import { useCan } from "../../FeatureLock.js";
import { activityIcon } from "./activityIcons.js";
import { useUnits } from "../../units.js";
import { LogSheet } from "./LogSheet.js";
import { pretty, splitList, metaText, type ExerciseInfo } from "../exercise.js";
import { CoachNote } from "./CoachNote.js";
import { LaneSwitcher, type Lane } from "./LaneSwitcher.js";
import { Markdown } from "../../Markdown.js";

interface Plan { id: string; name: string; status: string; variantId: string | null; body: WorkoutBody }
interface Goal { status: string; targets: Record<string, number> | null; weeklyLoadTarget?: number | null }
interface LoggedSet { reps?: number | null; weightKg?: number | null; durationSeconds?: number | null; effortLabel?: "easy" | "perfect" | "hard" | null; completed: boolean }
interface Session { id: string; date_local: string; entries: { exerciseId: string; sets: LoggedSet[] }[] }
interface ActivityLog { id: string; date_local: string; activity_key: string; label: string | null; duration_min: number | null; calories: number | null }

export function Train({ clientId }: { clientId: string }) {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [variants, setVariants] = useState<Lane[]>([]);
  const [currentVariantId, setCurrentVariantId] = useState<string | null>(null);
  const [defaultLabel, setDefaultLabel] = useState("Main");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const nav = useNavigate();
  const units = useUnits();
  const [activityOpen, setActivityOpen] = useState(false);
  const [error, setError] = useState(false);
  const reqRef = useRef(0);
  const today = todayLocal();
  // What this client's package includes. Absent capabilities are omitted, not
  // locked: the client isn't the buyer of their studio's plan.
  const canPlan = useCan("workoutPlan");
  const canActivities = useCan("extraWorkouts");
  const canStats = useCan("exerciseReport");

  // Load the three feeds together so one guard covers them, and surface a load
  // failure with a retry instead of an endless skeleton.
  const load = useCallback(async () => {
    const rid = ++reqRef.current;
    setError(false);
    try {
      // Reads for a section this client doesn't hold are skipped rather than
      // fired: no plan surface means no plan read, no activity surface no
      // activity read. Stubs keep the destructuring positional.
      const [p, s, a, g] = await Promise.all([
        canPlan
          ? api.get<{ plans: Plan[]; variants: Lane[]; currentVariantId: string | null; defaultLabel?: string }>(`/api/workout-plans?clientId=${clientId}`)
          : Promise.resolve({ plans: [] as Plan[], variants: [] as Lane[], currentVariantId: null, defaultLabel: "Main" }),
        api.get<{ sessions: Session[] }>(`/api/logs/workout-sessions?clientId=${clientId}&from=${shiftDay(today, -89)}&to=${today}`),
        canActivities
          ? api.get<{ activities: ActivityLog[] }>(`/api/logs/activities?clientId=${clientId}&from=${shiftDay(today, -29)}&to=${today}`)
          : Promise.resolve({ activities: [] as ActivityLog[] }),
        api.get<{ goals: Goal[] }>(`/api/goals?clientId=${clientId}`).catch(() => ({ goals: [] as Goal[] })),
      ]);
      if (rid !== reqRef.current) return;
      setPlans(p.plans); setVariants(p.variants ?? []); setCurrentVariantId(p.currentVariantId ?? null); setDefaultLabel(p.defaultLabel || "Main"); setSessions(s.sessions); setActivities(a.activities); setGoals(g.goals);
    } catch {
      if (rid !== reqRef.current) return;
      setError(true);
    }
  }, [clientId, today, canPlan, canActivities]);
  useEffect(() => void load(), [load]);

  // The weekly Training-Load target is trainer-set on the active goal (SPEC
  // §8.11). `GET /api/goals` now returns it already RESOLVED (`weeklyLoadTarget`
  // = targets_json.weeklyTrainingLoad, else the mirrored column, else the domain
  // default) so this tab, the wellness/recovery score and the AI coach note all
  // grade against the identical number. `targets.weeklyTrainingLoad` stays as a
  // fallback for a cached/offline response predating that field.
  const loadTarget = useMemo(() => {
    const active = goals.find((g) => g.status === "active");
    const resolved = active?.weeklyLoadTarget;
    if (typeof resolved === "number" && resolved > 0) return resolved;
    const t = active?.targets?.weeklyTrainingLoad;
    return typeof t === "number" && t > 0 ? t : DEFAULT_WEEKLY_LOAD_TARGET;
  }, [goals]);

  const week = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => shiftDay(today, -(6 - i)));
    const inWeek = new Set(days);
    const dailyLoad = Array(7).fill(0) as number[];
    const dailyTonnage = Array(7).fill(0) as number[];
    const active = Array(7).fill(false) as boolean[];
    const idx = (d: string) => days.indexOf(d);

    for (const s of sessions) {
      const sets = s.entries.flatMap((e) => e.sets);
      if (inWeek.has(s.date_local)) {
        const i = idx(s.date_local);
        dailyLoad[i] = (dailyLoad[i] ?? 0) + sessionLoad({ sets });
        dailyTonnage[i] = (dailyTonnage[i] ?? 0) + sessionTonnage(sets);
        if (sets.some((x) => x.completed)) active[i] = true;
      }
    }
    for (const a of activities) {
      if (inWeek.has(a.date_local)) {
        const i = idx(a.date_local);
        dailyLoad[i] = (dailyLoad[i] ?? 0) + sessionLoad({ cardio: [{ met: activityByKey(a.activity_key).met, durationMin: a.duration_min ?? 0 }] });
        active[i] = true;
      }
    }

    // PRs: best e1RM per exercise across the fetched history; count fresh this week.
    const best = new Map<string, { e1: number; date: string }>();
    for (const s of [...sessions].sort((a, b) => a.date_local.localeCompare(b.date_local))) {
      for (const e of s.entries) {
        for (const set of e.sets) {
          if (!set.completed || !set.weightKg || !set.reps) continue;
          const e1 = epley1Rm(set.weightKg, set.reps);
          if (e1 == null) continue;
          const cur = best.get(e.exerciseId);
          if (!cur || e1 > cur.e1) best.set(e.exerciseId, { e1, date: s.date_local });
        }
      }
    }
    const weekPRs = [...best.values()].filter((b) => inWeek.has(b.date)).length;
    const topE1 = [...best.values()].reduce((m, b) => Math.max(m, b.e1), 0);

    return {
      days,
      dailyLoad: dailyLoad.map((n) => Math.round(n)),
      dailyTonnage: dailyTonnage.map((n) => Math.round(n)),
      active,
      weekLoad: Math.round(dailyLoad.reduce((a, b) => a + b, 0)),
      weekTonnage: Math.round(dailyTonnage.reduce((a, b) => a + b, 0)),
      activeCount: active.filter(Boolean).length,
      weekPRs,
      topE1: Math.round(topE1),
    };
  }, [sessions, activities, today]);

  // Recent feed: workouts + activities, newest first.
  const recent = useMemo(() => {
    type Item = { id: string; date: string; title: string; sub: string; icon: typeof Dumbbell; tone: "activity" | "cardio"; load: number };
    const items: Item[] = [];
    // Logged-workout rows carry set counts + tonnage — strength-report detail
    // (`exerciseReport`); the plain activity rows are `extraWorkouts`.
    if (canStats) for (const s of sessions) {
      const sets = s.entries.flatMap((e) => e.sets).filter((x) => x.completed);
      if (sets.length === 0) continue;
      items.push({ id: s.id, date: s.date_local, title: "Workout", sub: `${sets.length} sets · ${kgToDisplay(sessionTonnage(sets), units).toLocaleString()} ${weightLabel(units)}`, icon: Dumbbell, tone: "activity", load: sessionLoad({ sets }) });
    }
    if (canActivities) for (const a of activities) {
      items.push({ id: a.id, date: a.date_local, title: a.label || pretty(a.activity_key), sub: [a.duration_min ? `${a.duration_min} min` : null, a.calories ? fmtEnergy(a.calories, units) : null].filter(Boolean).join(" · ") || "Logged", icon: activityIcon(a.activity_key), tone: "cardio", load: sessionLoad({ cardio: [{ met: activityByKey(a.activity_key).met, durationMin: a.duration_min ?? 0 }] }) });
    }
    return items.sort((x, y) => y.date.localeCompare(x.date)).slice(0, 6);
  }, [sessions, activities, units, canStats, canActivities]);

  const start = (day?: number) => nav(day != null ? `/train/session/${day}` : "/train/session");

  // Pick the published plan for the lane the client is on right now.
  const published = plans?.find((p) => p.status === "published" && (p.variantId ?? null) === (currentVariantId ?? null));
  const hasData = week.activeCount > 0 || week.weekTonnage > 0 || recent.length > 0;

  return (
    <Page className="column space-y-5 p-4 pb-28">
      {/* T1 (§1). The question Train answers on arrival is "am I keeping up this
          week", and days trained is the honest version of that — tonnage is a
          number only some clients read, and a plan name is not a measure. */}
      <TierAnchor className="flex flex-col items-center gap-1 pb-1 pt-2 text-center">
        <p className="text-caption text-muted-foreground">Trained this week</p>
        <p className="numeral text-display"><CountUp value={week.activeCount} /></p>
        <p className="text-caption text-muted-foreground">{week.activeCount === 1 ? "day" : "days"}</p>
      </TierAnchor>

      {error && !plans ? (
        <EmptyState icon={AlertTriangle} title="Couldn't load your training" description="Something went wrong. Check your connection and try again." action={<Button onClick={() => void load()}>Try again</Button>} />
      ) : (
      <Reveal loading={!plans} className="space-y-5" skeleton={
        <>
          <SkeletonHero height={128} />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-9 w-32 rounded-full" />
            <Skeleton className="h-9 w-28 rounded-full" />
          </div>
          <div className="space-y-2">
            <SkeletonLine w="6rem" h="xs" />
            <SkeletonStatGrid count={4} />
          </div>
          <div className="space-y-2">
            <SkeletonLine w="4rem" h="xs" />
            <SkeletonList card rows={3} />
          </div>
        </>
      }>
        {plans && (
        <>
      {/* Everything plan-shaped follows `workoutPlan`. */}
      {canPlan && <LaneSwitcher clientId={clientId} variants={variants} currentVariantId={currentVariantId} defaultLabel={defaultLabel} onSwitched={() => void load()} />}
      {canPlan && (published ? (
        <Stagger data-tour="train-hero">
          <button onClick={() => start()} className="w-full text-left">
            <Card interactive className="relative overflow-hidden">
              <div className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-primary/10 blur-2xl" />
              <div className="relative flex items-center justify-between">
                <div>
                  <div className="text-micro uppercase text-activity">Active plan</div>
                  <h2 className="mt-0.5 text-title-3">{published.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{published.body.days.filter((d) => !d.isRestDay).length} training days</p>
                </div>
                <div className="grid size-12 place-items-center rounded-full bg-activity-soft text-activity [&_svg]:size-5"><Play /></div>
              </div>
            </Card>
          </button>
        </Stagger>
      ) : hasData ? (
        /* No plan, but there IS history below — so say the plan-shaped thing
           here and let the history carry the screen. With no history either,
           this and the "Nothing here yet" state at the bottom were two empty
           states stacked with a stray chip between them, on a screen that was
           otherwise blank: one fact, said three times, in three components.
           The bottom one says both facts now. */
        <EmptyState icon={Dumbbell} title="No plan yet" description={canActivities ? "Your coach hasn't published a plan. You can still log activities." : "Your coach hasn't published a plan yet."} />
      ) : null)}

      {/* Quick-start chips — one per capability the package includes. Hidden in
          the fully-empty case, where the single remaining chip would be a lone
          tag floating in whitespace duplicating the empty state's button. */}
      {((canPlan && published) || (canActivities && (published || hasData))) && (
      <Stagger className="flex flex-wrap gap-2">
        {canPlan && published && <Chip icon={Play} selected onClick={() => start()}>Start workout</Chip>}
        {canActivities && <Chip icon={Footprints} onClick={() => setActivityOpen(true)}>Log activity</Chip>}
      </Stagger>
      )}

      {/* This week — volume / tonnage / PR stats are the strength report
          (`exerciseReport`). */}
      {canStats && hasData && (
        <section className="space-y-2">
          <h3 className="px-1 text-micro uppercase text-muted-foreground">This week</h3>
          <Stagger className="grid grid-cols-2 gap-3">
            <StatCard stack label="Training load" value={week.weekLoad} unit={`/ ${loadTarget}`} icon={TrendingUp} tone="activity"
              badge={<Badge tone={week.weekLoad >= loadTarget ? "success" : "neutral"}>{week.weekLoad >= loadTarget ? "On target" : "Building"}</Badge>}
              chart={week.weekLoad > 0 ? <MiniBars values={week.dailyLoad} tone="activity" width={132} target={loadTarget / 7} /> : undefined} />
            <StatCard stack label="Tonnage" value={kgToDisplay(week.weekTonnage, units).toLocaleString()} unit={weightLabel(units)} icon={Dumbbell} tone="activity"
              chart={week.weekTonnage > 0 ? <Sparkline values={week.dailyTonnage.map((v) => kgToDisplay(v, units))} tone="activity" width={132} /> : undefined} />
            <StatCard stack label="Active days" value={week.activeCount} unit="of 7" icon={Flame} tone="cardio"
              chart={<WeekDots days={week.active} todayIndex={6} tone="cardio" fill />} />
            <StatCard stack label="PRs this week" value={week.weekPRs} icon={Trophy} tone="activity"
              badge={week.topE1 > 0 ? <Badge tone="neutral">best e1RM {fmtWeight(week.topE1, units)}</Badge> : undefined} />
          </Stagger>
        </section>
      )}

      {/* Recent activity feed */}
      {recent.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-micro uppercase text-muted-foreground">Recent</h3>
            {canActivities && <button onClick={() => setActivityOpen(true)} className="inline-flex items-center gap-1 text-sm font-medium text-primary [&_svg]:size-4"><Plus /> Log activity</button>}
          </div>
          <Stagger className="space-y-1.5">
            {recent.map((r) => (
              <Card key={r.id} className="flex items-center gap-3 py-3">
                <IconBadge icon={r.icon} tone={r.tone} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{new Date(`${r.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · {r.sub}</div>
                </div>
                {r.load > 0 && <div className="shrink-0 text-right"><div className="numeral font-semibold text-activity">{r.load}</div><div className="text-xs uppercase tracking-wide text-muted-foreground">load</div></div>}
              </Card>
            ))}
          </Stagger>
        </section>
      )}

      {/* Plan days — a carousel of branded day covers, tap to start (`workoutPlan`). */}
      {canPlan && published && (
        <section className="space-y-2">
          <h3 className="px-1 text-micro uppercase text-muted-foreground">Plan days</h3>
          <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
            {published.body.days.map((day, i) => {
              const sets = day.isRestDay ? 0 : prescribedSetsForDay(day);
              const exercises = day.isRestDay ? 0 : day.blocks.reduce((n, b) => n + b.slots.length, 0);
              return (
                <button key={i} onClick={() => !day.isRestDay && start(i)} disabled={day.isRestDay} className="w-[62%] shrink-0 snap-start text-left sm:w-[45%]">
                  <div className={`relative h-36 overflow-hidden rounded-2xl bg-card transition-transform ${day.isRestDay ? "opacity-80" : "active:scale-[0.98]"}`}>
                    {day.imageUrl ? <img src={day.imageUrl} alt="" className="absolute inset-0 size-full object-cover" /> : <div className={`absolute inset-0 ${day.isRestDay ? "bg-gradient-to-br from-sleep/20 to-surface-2" : "bg-gradient-to-br from-primary/25 via-primary/5 to-surface-2"}`} />}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                    {!day.imageUrl && <div className="absolute inset-0 grid place-items-center text-white/35 [&_svg]:size-8">{day.isRestDay ? <Moon /> : <Dumbbell />}</div>}
                    {day.isRestDay && <span className="absolute right-2 top-2 rounded-full bg-sleep-soft px-2 py-0.5 text-xs font-semibold text-sleep">Rest</span>}
                    <div className="absolute inset-x-0 bottom-0 p-3">
                      <div className="truncate font-semibold text-white">{day.name || `Day ${i + 1}`}</div>
                      <div className="truncate text-xs text-white/75">{day.isRestDay ? "Rest day" : `${exercises} exercise${exercises === 1 ? "" : "s"} · ${sets} sets`}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {!published && !hasData && (
        <EmptyState
          icon={Dumbbell}
          title={canPlan ? "No plan yet" : "Nothing here yet"}
          description={
            canPlan && canActivities ? "Your coach hasn't published a plan. You can still log a walk, a run or anything else you do."
            : canPlan ? "Your coach hasn't published a plan yet — it'll show up here."
            : canActivities ? "Log an activity to get started."
            : "Your training will show up here."
          }
          action={canActivities ? <Button onClick={() => setActivityOpen(true)}><Plus /> Log activity</Button> : undefined}
        />
      )}

      {/* Browsable exercise library (SPEC §8.11) — freestyle content for no-plan
          clients, category-filtered, tap a card for the illustrated how-to. */}
      <LibraryGrid />

      <Stagger><CoachNote clientId={clientId} surface="train" /></Stagger>
        </>
        )}
      </Reveal>
      )}

      {canActivities && activityOpen && <LogSheet open initialKind="activity" clientId={clientId} onClose={() => setActivityOpen(false)} onLogged={() => void load()} />}
    </Page>
  );
}

// ── Illustrated exercise library (SPEC §8.11) ────────────────────────────────
/** The first muscle group of an exercise, humanised — the browse category. */
const libCategory = (e: ExerciseInfo): string => { const c = splitList(e.category)[0] ?? splitList(e.muscle_groups)[0]; return c ? pretty(c) : "Other"; };

/** A full-width illustrated cover for a library exercise (static first frame,
 *  muscle-tinted glyph fallback). ExerciseThumb is fixed-size; this fills. */
function LibCover({ ex, className = "" }: { ex: ExerciseInfo; className?: string }) {
  const img = ex.thumb_url || ex.thumb2_url;
  return (
    <div className={`relative grid place-items-center overflow-hidden rounded-xl bg-activity-soft text-activity ${className}`}>
      {img ? <img src={img} alt="" className="size-full object-contain" /> : <Dumbbell className="size-8" />}
    </div>
  );
}

/** A browsable grid of the platform + tenant exercise library: search + muscle
 *  category chips over illustrated thumbnails; tap a card for the how-to. */
function LibraryGrid() {
  const [all, setAll] = useState<ExerciseInfo[] | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [open, setOpen] = useState<ExerciseInfo | null>(null);
  useEffect(() => {
    void api.get<{ exercises: ExerciseInfo[] }>("/api/exercises").then((r) => setAll(r.exercises)).catch(() => setAll([]));
  }, []);
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of all ?? []) { const c = libCategory(e); counts.set(c, (counts.get(c) ?? 0) + 1); }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 8);
  }, [all]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (all ?? []).filter((e) => (!cat || libCategory(e) === cat) && (!s || e.name.toLowerCase().includes(s))).slice(0, 60);
  }, [all, q, cat]);

  if (all && all.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="px-1 text-micro uppercase text-muted-foreground">Exercise library</h3>
      <Reveal loading={!all} skeleton={<SkeletonList card rows={3} thumb={56} />}>
        {all && (
          <div className="space-y-3">
            <Field label="Search exercises" icon={Search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the library…" />
            {categories.length > 0 && (
              <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
                <span className="shrink-0"><Chip selected={cat === null} onClick={() => setCat(null)}>All</Chip></span>
                {categories.map((cName) => <span key={cName} className="shrink-0"><Chip selected={cat === cName} onClick={() => setCat(cName)}>{cName}</Chip></span>)}
              </div>
            )}
            {filtered.length === 0 ? (
              <Card className="text-center text-sm text-muted-foreground">No exercises match.</Card>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {filtered.map((e) => (
                  <button key={e.id} onClick={() => setOpen(e)} className="text-left">
                    <Card interactive className="flex flex-col gap-2 p-2.5">
                      <LibCover ex={e} className="aspect-square w-full" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{e.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{metaText(e) || "Exercise"}</div>
                      </div>
                    </Card>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Reveal>
      {open && <ExerciseLibrarySheet ex={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

/** The illustrated how-to for a library exercise: animated frames + meta +
 *  instructions. Read-only browse; freestyle logging still lives in LogSheet. */
function ExerciseLibrarySheet({ ex, onClose }: { ex: ExerciseInfo; onClose: () => void }) {
  const chips = [splitList(ex.muscle_groups)[0], splitList(ex.equipment)[0], ex.difficulty, ex.mechanic].filter(Boolean) as string[];
  return (
    <Sheet open onClose={onClose} title={ex.name}>
      <div className="space-y-4">
        <LibCover ex={ex} className="aspect-video w-full" />
        {chips.length > 0 && <div className="flex flex-wrap gap-1.5">{chips.map((ch, i) => <Badge key={i} tone="activity">{pretty(ch)}</Badge>)}</div>}
        {ex.instructions_md
          ? <Markdown className="text-sm text-foreground/90">{ex.instructions_md}</Markdown>
          : <p className="text-sm text-muted-foreground">No written instructions for this exercise yet.</p>}
      </div>
    </Sheet>
  );
}
