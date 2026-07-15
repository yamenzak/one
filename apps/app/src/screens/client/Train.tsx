/**
 * Train tab (DESIGN.md §3) — the workout home, brought up to the Eat-diary bar:
 * active-plan hero + day list, quick-start chips, a "this week" key-metrics
 * grid (Training Load vs target, tonnage, active days, PRs — all computed from
 * logged sessions + activities), and a recent-activity feed with WeekDots.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { prescribedSetsForDay, type WorkoutBody } from "@mossa/protocol";
import { sessionTonnage, sessionLoad, epley1Rm, DEFAULT_WEEKLY_LOAD_TARGET, activityByKey, fmtEnergy, fmtWeight, kgToDisplay, weightLabel } from "@mossa/domain";
import {
  Card, Badge, Button, Chip, Skeleton, Page, Stagger, EmptyState, StatCard, WeekDots, Sparkline, MiniBars, IconBadge,
  Reveal, SkeletonHero, SkeletonStatGrid, SkeletonList, SkeletonLine,
  Dumbbell, Play, Moon, ChevronRight, Plus, Footprints, Flame, TrendingUp, Trophy, Activity,
} from "@mossa/ui";
import { api, todayLocal } from "../../api.js";
import { useUnits } from "../../units.js";
import { LogSheet } from "./LogSheet.js";
import { pretty } from "../exercise.js";
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

export function Train({ clientId }: { clientId: string }) {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const nav = useNavigate();
  const units = useUnits();
  const [activityOpen, setActivityOpen] = useState(false);
  const today = todayLocal();

  const load = () => {
    void api.get<{ plans: Plan[] }>(`/api/workout-plans?clientId=${clientId}`).then((r) => setPlans(r.plans));
    void api.get<{ sessions: Session[] }>(`/api/logs/workout-sessions?clientId=${clientId}&from=${shift(today, -89)}&to=${today}`).then((r) => setSessions(r.sessions));
    void api.get<{ activities: ActivityLog[] }>(`/api/logs/activities?clientId=${clientId}&from=${shift(today, -29)}&to=${today}`).then((r) => setActivities(r.activities));
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

  const start = (day?: number) => nav(day != null ? `/train/session/${day}` : "/train/session");

  const published = plans?.find((p) => p.status === "published");
  const hasData = week.activeCount > 0 || week.weekTonnage > 0 || recent.length > 0;

  return (
    <Page className="mx-auto max-w-xl space-y-5 p-4 pb-28">
      <h1 className="text-2xl font-bold tracking-tight">Train</h1>

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
      {published ? (
        <Stagger>
          <button onClick={() => start()} className="w-full text-left">
            <Card interactive className="relative overflow-hidden">
              <div className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-primary/10 blur-2xl" />
              <div className="relative flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-activity">Active plan</div>
                  <h2 className="mt-0.5 text-xl font-semibold tracking-tight">{published.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{published.body.days.filter((d) => !d.isRestDay).length} training days</p>
                </div>
                <div className="grid size-12 place-items-center rounded-full bg-activity-soft text-activity [&_svg]:size-5"><Play /></div>
              </div>
            </Card>
          </button>
        </Stagger>
      ) : (
        <EmptyState icon={Dumbbell} title="No plan yet" description="Your coach hasn't published a plan. You can still log activities." />
      )}

      {/* Quick-start chips */}
      <Stagger className="flex flex-wrap gap-2">
        {published && <Chip icon={Play} selected onClick={() => start()}>Start workout</Chip>}
        <Chip icon={Footprints} onClick={() => setActivityOpen(true)}>Log activity</Chip>
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
            <StatCard stack label="PRs this week" value={week.weekPRs} icon={Trophy} tone="activity"
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

      {/* Plan days — a carousel of branded day covers, tap to start. */}
      {published && (
        <section className="space-y-2">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plan days</h3>
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
                    {day.isRestDay && <span className="absolute right-2 top-2 rounded-full bg-sleep-soft px-2 py-0.5 text-[0.6rem] font-semibold text-sleep">Rest</span>}
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
        <EmptyState icon={Activity} title="Nothing here yet" description="Log an activity to get started." action={<Button onClick={() => setActivityOpen(true)}><Plus /> Log activity</Button>} />
      )}

      <Stagger><CoachNote clientId={clientId} surface="train" /></Stagger>
        </>
        )}
      </Reveal>

      {activityOpen && <LogSheet open initialKind="activity" clientId={clientId} onClose={() => setActivityOpen(false)} onLogged={load} />}
    </Page>
  );
}
