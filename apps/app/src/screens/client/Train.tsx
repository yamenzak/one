/**
 * Train tab (DESIGN.md §3) — the workout home, brought up to the Eat-diary bar:
 * active-plan hero + day list, quick-start chips, a "this week" key-metrics
 * grid (Training Load vs target, tonnage, active days, PRs — all computed from
 * logged sessions + activities), a recent-activity feed with WeekDots, and a
 * browsable workout library grid for freestyle content.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { prescribedSetsForDay, type WorkoutBody } from "@mossa/protocol";
import { sessionTonnage, sessionLoad, epley1Rm, DEFAULT_WEEKLY_LOAD_TARGET, activityByKey, fmtEnergy, fmtWeight, kgToDisplay, weightLabel } from "@mossa/domain";
import {
  Card, Badge, Button, Chip, Skeleton, Page, Stagger, EmptyState, StatCard, WeekDots, Sparkline, MiniBars, IconBadge, Sheet,
  Dumbbell, Play, Moon, ChevronRight, Plus, Footprints, Flame, TrendingUp, Trophy, Heart, Activity, History,
} from "@mossa/ui";
import { api, todayLocal } from "../../api.js";
import { useUnits } from "../../units.js";
import { LogSheet } from "./LogSheet.js";
import { PlanHistorySheet } from "./PlanHistorySheet.js";
import { ExerciseThumb, ExerciseMeta, pretty, type ExerciseInfo } from "../exercise.js";
import { CoachNote } from "./CoachNote.js";

interface Plan { id: string; name: string; status: string; body: WorkoutBody }
interface LoggedSet { reps?: number | null; weightKg?: number | null; durationSeconds?: number | null; effortLabel?: "easy" | "perfect" | "hard" | null; completed: boolean }
interface Session { id: string; date_local: string; entries: { exerciseId: string; sets: LoggedSet[] }[] }
interface ActivityLog { id: string; date_local: string; activity_key: string; label: string | null; duration_min: number | null; calories: number | null }

/** N days back from a YYYY-MM-DD string, as YYYY-MM-DD. */
const shift = (date: string, delta: number): string => {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
};

const CATEGORY_META: Record<string, { icon: typeof Dumbbell; tone: "activity" | "cardio" | "sleep" | "nutrition" }> = {
  strength: { icon: Dumbbell, tone: "activity" },
  cardio: { icon: Heart, tone: "cardio" },
  core: { icon: Activity, tone: "activity" },
  mobility: { icon: Activity, tone: "sleep" },
  stretching: { icon: Activity, tone: "sleep" },
  yoga: { icon: Activity, tone: "sleep" },
  plyometrics: { icon: Flame, tone: "cardio" },
};
const catMeta = (c: string) => CATEGORY_META[c.toLowerCase()] ?? { icon: Dumbbell, tone: "activity" as const };

export function Train({ clientId }: { clientId: string }) {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [library, setLibrary] = useState<ExerciseInfo[]>([]);
  const nav = useNavigate();
  const units = useUnits();
  const [activityOpen, setActivityOpen] = useState(false);
  const [browseCat, setBrowseCat] = useState<string | null>(null);
  const [histOpen, setHistOpen] = useState(false);
  const today = todayLocal();

  const load = () => {
    void api.get<{ plans: Plan[] }>(`/api/workout-plans?clientId=${clientId}`).then((r) => setPlans(r.plans));
    void api.get<{ sessions: Session[] }>(`/api/logs/workout-sessions?clientId=${clientId}&from=${shift(today, -89)}&to=${today}`).then((r) => setSessions(r.sessions));
    void api.get<{ activities: ActivityLog[] }>(`/api/logs/activities?clientId=${clientId}&from=${shift(today, -29)}&to=${today}`).then((r) => setActivities(r.activities));
    void api.get<{ exercises: ExerciseInfo[] }>("/api/exercises").then((r) => setLibrary(r.exercises));
  };
  useEffect(load, [clientId]);

  const week = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => shift(today, -(6 - i)));
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
    for (const s of sessions) {
      const sets = s.entries.flatMap((e) => e.sets).filter((x) => x.completed);
      if (sets.length === 0) continue;
      items.push({ id: s.id, date: s.date_local, title: "Workout", sub: `${sets.length} sets · ${kgToDisplay(sessionTonnage(sets), units).toLocaleString()} ${weightLabel(units)}`, icon: Dumbbell, tone: "activity", load: sessionLoad({ sets }) });
    }
    for (const a of activities) {
      items.push({ id: a.id, date: a.date_local, title: a.label || pretty(a.activity_key), sub: [a.duration_min ? `${a.duration_min} min` : null, a.calories ? fmtEnergy(a.calories, units) : null].filter(Boolean).join(" · ") || "Logged", icon: Footprints, tone: "cardio", load: sessionLoad({ cardio: [{ met: activityByKey(a.activity_key).met, durationMin: a.duration_min ?? 0 }] }) });
    }
    return items.sort((x, y) => y.date.localeCompare(x.date)).slice(0, 6);
  }, [sessions, activities, units]);

  const categories = useMemo(() => {
    const count = new Map<string, number>();
    for (const e of library) {
      const c = ((e as { category?: string | null }).category ?? "").trim().toLowerCase() || null;
      if (c) count.set(c, (count.get(c) ?? 0) + 1);
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]);
  }, [library]);

  const start = (day?: number) => nav(day != null ? `/train/session/${day}` : "/train/session");

  if (!plans) return <Skeleton className="m-4 h-64" />;
  const published = plans.find((p) => p.status === "published");
  const hasData = week.activeCount > 0 || week.weekTonnage > 0 || recent.length > 0;

  return (
    <Page className="mx-auto max-w-xl space-y-5 p-4 pb-28">
      <h1 className="text-2xl font-bold tracking-tight">Train</h1>

      <Stagger><CoachNote clientId={clientId} surface="train" /></Stagger>

      {published ? (
        <Stagger>
          <button onClick={() => start()} className="w-full text-left">
            <Card interactive className="relative overflow-hidden">
              <div className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-primary/10 blur-2xl" />
              <div className="relative flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-primary">Active plan</div>
                  <h2 className="mt-0.5 text-xl font-semibold tracking-tight">{published.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{published.body.days.filter((d) => !d.isRestDay).length} training days</p>
                </div>
                <div className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground [&_svg]:size-5"><Play /></div>
              </div>
            </Card>
          </button>
        </Stagger>
      ) : (
        <EmptyState icon={Dumbbell} title="No plan yet" description="Your coach hasn't published a plan. You can still log activities and browse the library below." />
      )}

      {/* Quick-start chips */}
      <Stagger className="flex flex-wrap gap-2">
        {published && <Chip icon={Play} selected onClick={() => start()}>Start workout</Chip>}
        <Chip icon={Footprints} onClick={() => setActivityOpen(true)}>Log activity</Chip>
        {categories.length > 0 && <Chip icon={Dumbbell} onClick={() => setBrowseCat(categories[0]![0])}>Freestyle</Chip>}
        {plans.some((p) => p.status === "superseded") && <Chip icon={History} onClick={() => setHistOpen(true)}>Past plans</Chip>}
      </Stagger>

      {/* This week — key metrics from real logs */}
      {hasData && (
        <section className="space-y-2">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">This week</h3>
          <Stagger className="grid grid-cols-2 gap-3">
            <StatCard stack label="Training load" value={week.weekLoad} unit={`/ ${DEFAULT_WEEKLY_LOAD_TARGET}`} icon={TrendingUp} tone="activity"
              badge={<Badge tone={week.weekLoad >= DEFAULT_WEEKLY_LOAD_TARGET ? "success" : "neutral"}>{week.weekLoad >= DEFAULT_WEEKLY_LOAD_TARGET ? "On target" : "Building"}</Badge>}
              chart={week.weekLoad > 0 ? <MiniBars values={week.dailyLoad} tone="activity" width={132} target={DEFAULT_WEEKLY_LOAD_TARGET / 7} /> : undefined} />
            <StatCard stack label="Tonnage" value={kgToDisplay(week.weekTonnage, units).toLocaleString()} unit={weightLabel(units)} icon={Dumbbell} tone="activity"
              chart={week.weekTonnage > 0 ? <Sparkline values={week.dailyTonnage.map((v) => kgToDisplay(v, units))} tone="activity" width={132} /> : undefined} />
            <StatCard stack label="Active days" value={week.activeCount} unit="of 7" icon={Flame} tone="cardio"
              chart={<WeekDots days={week.active} todayIndex={6} tone="cardio" fill />} />
            <StatCard stack label="PRs this week" value={week.weekPRs} icon={Trophy} tone="nutrition"
              badge={week.topE1 > 0 ? <Badge tone="neutral">best e1RM {fmtWeight(week.topE1, units)}</Badge> : undefined} />
          </Stagger>
        </section>
      )}

      {/* Recent activity feed */}
      {recent.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent</h3>
            <button onClick={() => setActivityOpen(true)} className="inline-flex items-center gap-1 text-sm font-medium text-primary [&_svg]:size-4"><Plus /> Log activity</button>
          </div>
          <Stagger className="space-y-1.5">
            {recent.map((r) => (
              <Card key={r.id} className="flex items-center gap-3 py-3">
                <IconBadge icon={r.icon} tone={r.tone} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{new Date(`${r.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · {r.sub}</div>
                </div>
                {r.load > 0 && <div className="shrink-0 text-right"><div className="numeral font-semibold text-activity">{r.load}</div><div className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">load</div></div>}
              </Card>
            ))}
          </Stagger>
        </section>
      )}

      {/* Plan days — quick jump into the player */}
      {published && (
        <section className="space-y-2">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plan days</h3>
          <Stagger className="space-y-2">
            {published.body.days.map((day, i) => {
              const sets = day.isRestDay ? 0 : prescribedSetsForDay(day);
              const exercises = day.isRestDay ? 0 : day.blocks.reduce((n, b) => n + b.slots.length, 0);
              return (
                <button key={i} onClick={() => !day.isRestDay && start(i)} disabled={day.isRestDay} className="w-full text-left disabled:opacity-60">
                  <Card interactive={!day.isRestDay} className="flex items-center justify-between py-3.5">
                    <div className="flex items-center gap-3">
                      <div className={`grid size-10 place-items-center rounded-xl [&_svg]:size-[1.1rem] ${day.isRestDay ? "bg-sleep-soft text-sleep" : "bg-activity-soft text-activity"}`}>{day.isRestDay ? <Moon /> : <Dumbbell />}</div>
                      <div>
                        <div className="font-medium">{day.name || `Day ${i + 1}`}</div>
                        <div className="text-sm text-muted-foreground">{day.isRestDay ? "Rest day" : `${exercises} exercise${exercises === 1 ? "" : "s"} · ${sets} sets`}</div>
                      </div>
                    </div>
                    {day.isRestDay ? <Badge tone="sleep">Rest</Badge> : <ChevronRight className="size-5 text-muted-foreground" />}
                  </Card>
                </button>
              );
            })}
          </Stagger>
        </section>
      )}

      {/* Browse the library — freestyle content by category */}
      {categories.length > 0 && (
        <section className="space-y-2">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Browse the library</h3>
          <div className="grid grid-cols-2 gap-3">
            {categories.map(([cat, n]) => {
              const M = catMeta(cat);
              return (
                <button key={cat} onClick={() => setBrowseCat(cat)} className="flex flex-col gap-3 rounded-2xl bg-surface-1 p-4 text-left transition-all hover:bg-surface-2 active:scale-[0.98]">
                  <IconBadge icon={M.icon} tone={M.tone} />
                  <div><div className="font-semibold capitalize">{pretty(cat)}</div><div className="text-xs text-muted-foreground">{n} exercise{n === 1 ? "" : "s"}</div></div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {!published && !hasData && categories.length === 0 && (
        <EmptyState icon={Activity} title="Nothing here yet" description="Log an activity to get started." action={<Button onClick={() => setActivityOpen(true)}><Plus /> Log activity</Button>} />
      )}

      {activityOpen && <LogSheet open initialKind="activity" clientId={clientId} onClose={() => setActivityOpen(false)} onLogged={load} />}
      {histOpen && <PlanHistorySheet clientId={clientId} kind="workout" onClose={() => setHistOpen(false)} />}
      {browseCat && <BrowseSheet category={browseCat} library={library} onClose={() => setBrowseCat(null)} />}
    </Page>
  );
}

/** Browse a library category — freestyle content, richly listed. */
function BrowseSheet({ category, library, onClose }: { category: string; library: ExerciseInfo[]; onClose: () => void }) {
  const items = library.filter((e) => ((e as { category?: string | null }).category ?? "").toLowerCase() === category.toLowerCase());
  return (
    <Sheet open onClose={onClose} title={pretty(category)}>
      <div className="max-h-[70vh] space-y-1 overflow-y-auto">
        {items.map((e) => (
          <div key={e.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
            <ExerciseThumb thumb={e.thumb_url} size={44} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{e.name}</div>
              <ExerciseMeta ex={e} className="text-xs text-muted-foreground" />
            </div>
            {e.difficulty && <Badge tone="neutral">{e.difficulty}</Badge>}
          </div>
        ))}
        {items.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing here yet.</p>}
      </div>
    </Sheet>
  );
}
