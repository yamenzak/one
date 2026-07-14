/**
 * Progress tab — a data-rich analytics dashboard. One aggregation
 * (`/api/progress`) feeds four lenses: Overview (a wellness-index hero, a
 * consistency heatmap, calorie adherence), Body (weight / body-fat / waist
 * trends with moving-average lines + deltas), Training (weekly volume bars,
 * totals, a PR leaderboard) and Wellness (a mood/energy/sleep/calm/consistency
 * radar + per-day mood & sleep trends). Charts are the @mossa/ui chart set.
 */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { kgToDisplay, cmToLengthDisplay, weightLabel, lengthLabel, type RangePreset, type SeriesDelta } from "@mossa/domain";
import {
  Button, Card, Badge, Skeleton, SegmentedControl, Page, Stagger, StatCard, ProgressRing, IconBadge,
  AreaChart, BarChart, RadarChart, CalendarHeatmap, ChartCard, METRICS, cn, toneVar,
  Sparkles, X, Scale, Dumbbell, Trophy, Flame, Moon, Smile, Zap, Gauge, HeartPulse, TrendingUp, Activity, type Tone, type LucideIcon,
} from "@mossa/ui";
import { api, todayLocal } from "../../api.js";
import { useUnits } from "../../units.js";

// ── API shapes ──
interface Pt { date: string; v: number }
interface ProgressData {
  range: { start: string; end: string; days: string[] };
  today: string;
  body: {
    weight: Pt[]; bodyFat: Pt[]; waist: Pt[];
    latest: { weightKg: number | null; bodyFatPct: number | null; waistCm: number | null; neckCm: number | null; hipsCm: number | null; chestCm: number | null };
    deltas: { weight: SeriesDelta | null; bodyFat: SeriesDelta | null; waist: SeriesDelta | null };
  };
  nutrition: { perDay: { date: string; calories: number; protein: number; carbs: number; fat: number; logged: boolean }[]; targets: { targetCalories?: number; targetProteinG?: number }; adherencePct: number | null; loggedDays: number };
  training: { perDay: { date: string; tonnage: number; load: number; sets: number }[]; weekly: { week: string; tonnage: number; load: number; sets: number }[]; totalTonnage: number; totalSets: number; workoutDays: number; prs: { exerciseId: string; name: string; thumb: string | null; e1rm: number; weight: number; reps: number }[] };
  wellness: { perDay: { date: string; mood: number | null; energy: number | null; stress: number | null; sleepQuality: number | null; sleepHours: number | null }[]; averages: { mood: number | null; energy: number | null; stress: number | null; sleepQuality: number | null; sleepHours: number | null }; radar: { mood: number; energy: number; sleep: number; calm: number; consistency: number }; index: number | null };
  consistency: { heatmap: Record<string, number>; checkInDays: number; streak: number; longestStreak: number; consistencyPct: number; weekFlags: boolean[] };
}

type Tab = "overview" | "body" | "training" | "wellness";

const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const dense = (series: Pt[], days: string[]): (number | null)[] => { const m = new Map(series.map((p) => [p.date, p.v])); return days.map((d) => m.get(d) ?? null); };

export function Progress({ clientId }: { clientId: string }) {
  const [data, setData] = useState<ProgressData | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [range, setRange] = useState<RangePreset>("30d");
  const units = useUnits();
  const today = todayLocal();

  useEffect(() => {
    setData(null);
    void api.get<ProgressData>(`/api/progress/${clientId}?range=${range}&today=${today}`).then(setData).catch(() => setData(null));
  }, [clientId, range, today]);

  if (!data) return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <Skeleton className="h-9 w-40" />
      <Skeleton className="h-10" />
      <Skeleton className="h-44" />
      <Skeleton className="h-56" />
      <Skeleton className="h-40" />
    </div>
  );

  const days = data.range.days;
  const dateLabel = (i: number) => shortDate(days[i] ?? today);

  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Progress</h1>
        <NarrativeButton clientId={clientId} streak={data.consistency.streak} weights={data.body.weight.length} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl options={[{ value: "overview", label: "Overview" }, { value: "body", label: "Body" }, { value: "training", label: "Training" }, { value: "wellness", label: "Wellness" }]} value={tab} onChange={(v) => setTab(v as Tab)} />
        <SegmentedControl className="ml-auto" options={[{ value: "7d", label: "7d" }, { value: "30d", label: "30d" }, { value: "90d", label: "90d" }]} value={range} onChange={(v) => setRange(v as RangePreset)} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }} className="space-y-4">
          {tab === "overview" && <Overview data={data} dateLabel={dateLabel} />}
          {tab === "body" && <Body data={data} units={units} dateLabel={dateLabel} />}
          {tab === "training" && <Training data={data} units={units} />}
          {tab === "wellness" && <Wellness data={data} dateLabel={dateLabel} />}
        </motion.div>
      </AnimatePresence>
    </Page>
  );
}

// ── Overview ──
function Overview({ data, dateLabel }: { data: ProgressData; dateLabel: (i: number) => string }) {
  const { consistency, wellness, nutrition, body } = data;
  const days = data.range.days;
  const cals = nutrition.perDay.map((p) => (p.logged ? p.calories : null));
  const idxPct = wellness.index != null ? wellness.index / 5 : 0;
  return (
    <>
      <Stagger>
        <Card className="relative flex items-center gap-5 overflow-hidden">
          <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-cardio/10 blur-3xl" />
          <ProgressRing size={116} strokeWidth={11} tone="cardio" progress={idxPct || 0.001} value={wellness.index != null ? wellness.index.toFixed(1) : "—"} label="Wellness" sublabel="/ 5" softTrack tintValue />
          <div className="relative min-w-0 flex-1 space-y-2.5">
            <MiniStat icon={Flame} tone="calories" label="Check-in streak" value={`${consistency.streak}`} sub={consistency.streak === 1 ? "day" : "days"} />
            <MiniStat icon={Gauge} tone="activity" label="Consistency" value={`${consistency.consistencyPct}`} sub="%" />
            <MiniStat icon={Scale} tone="cardio" label="Weight trend" value={body.deltas.weight ? `${body.deltas.weight.delta > 0 ? "+" : ""}${body.deltas.weight.delta.toFixed(1)}` : "—"} sub={body.deltas.weight ? "kg" : ""} />
          </div>
        </Card>
      </Stagger>

      <Stagger>
        <ChartCard title="Consistency" icon={Activity} tone="activity" value={consistency.checkInDays} unit="days logged" delta={<Badge tone="neutral">best {consistency.longestStreak}d streak</Badge>}>
          <CalendarHeatmap days={consistency.heatmap} today={data.today} tone="activity" weeks={data.range.days.length > 40 ? 16 : 10} />
        </ChartCard>
      </Stagger>

      <Stagger>
        <ChartCard title="Calorie adherence" icon={METRICS.calories.icon} tone="calories" value={nutrition.adherencePct != null ? nutrition.adherencePct : "—"} unit={nutrition.adherencePct != null ? "%" : undefined} delta={nutrition.targets.targetCalories ? <Badge tone="neutral">target {nutrition.targets.targetCalories} kcal</Badge> : undefined}>
          <AreaChart values={cals} tone="calories" target={nutrition.targets.targetCalories} trend label={dateLabel} format={(v) => `${Math.round(v)}`} />
        </ChartCard>
      </Stagger>
    </>
  );
}

// ── Body ──
function Body({ data, units, dateLabel }: { data: ProgressData; units: ReturnType<typeof useUnits>; dateLabel: (i: number) => string }) {
  const days = data.range.days;
  const { body } = data;
  const wl = weightLabel(units), ll = lengthLabel(units);
  const weightVals = dense(body.weight, days).map((v) => (v == null ? null : kgToDisplay(v, units)));
  const waistVals = dense(body.waist, days).map((v) => (v == null ? null : cmToLengthDisplay(v, units)));
  const bfVals = dense(body.bodyFat, days);
  return (
    <>
      <Stagger>
        <ChartCard title="Weight" icon={METRICS.weight.icon} tone="cardio" value={body.latest.weightKg != null ? kgToDisplay(body.latest.weightKg, units).toFixed(1) : "—"} unit={wl} delta={<DeltaBadge d={body.deltas.weight} convert={(v) => kgToDisplay(v, units)} unit={wl} />}>
          <AreaChart values={weightVals} tone="cardio" trend label={dateLabel} format={(v) => v.toFixed(1)} />
        </ChartCard>
      </Stagger>
      <Stagger>
        <ChartCard title="Body fat" icon={METRICS.bodyFat.icon} tone="sleep" value={body.latest.bodyFatPct != null ? body.latest.bodyFatPct.toFixed(1) : "—"} unit="%" delta={<DeltaBadge d={body.deltas.bodyFat} convert={(v) => v} unit="%" />}>
          <AreaChart values={bfVals} tone="sleep" trend label={dateLabel} format={(v) => `${v.toFixed(1)}%`} />
        </ChartCard>
      </Stagger>
      <Stagger>
        <ChartCard title="Waist" icon={METRICS.waist.icon} tone="nutrition" value={body.latest.waistCm != null ? cmToLengthDisplay(body.latest.waistCm, units).toFixed(1) : "—"} unit={ll} delta={<DeltaBadge d={body.deltas.waist} convert={(v) => cmToLengthDisplay(v, units)} unit={ll} />}>
          <AreaChart values={waistVals} tone="nutrition" trend label={dateLabel} format={(v) => v.toFixed(1)} />
        </ChartCard>
      </Stagger>
      <Stagger>
        <Card className="space-y-3">
          <div className="text-sm font-semibold">Latest measurements</div>
          <div className="grid grid-cols-3 gap-2">
            <MeasChip label="Chest" value={body.latest.chestCm} units={units} />
            <MeasChip label="Waist" value={body.latest.waistCm} units={units} />
            <MeasChip label="Hips" value={body.latest.hipsCm} units={units} />
            <MeasChip label="Neck" value={body.latest.neckCm} units={units} />
          </div>
        </Card>
      </Stagger>
    </>
  );
}

// ── Training ──
function Training({ data, units }: { data: ProgressData; units: ReturnType<typeof useUnits> }) {
  const { training } = data;
  const wl = weightLabel(units);
  const weekLabels = training.weekly.map((w) => shortDate(w.week));
  const tonnageVals = training.weekly.map((w) => Math.round(kgToDisplay(w.tonnage, units)));
  const setVals = training.weekly.map((w) => w.sets);
  const maxE1 = training.prs[0]?.e1rm ?? 1;
  return (
    <>
      <Stagger className="grid grid-cols-3 gap-3">
        <StatCard stack label="Volume" value={Math.round(kgToDisplay(training.totalTonnage, units) / 1000).toLocaleString()} unit={`k ${wl}`} icon={Dumbbell} tone="activity" />
        <StatCard stack label="Sets" value={training.totalSets} icon={Activity} tone="activity" />
        <StatCard stack label="Sessions" value={training.workoutDays} icon={Flame} tone="cardio" />
      </Stagger>
      <Stagger>
        <ChartCard title="Weekly volume" icon={Dumbbell} tone="activity" value={training.weekly.length ? Math.round(kgToDisplay(training.weekly.at(-1)!.tonnage, units)).toLocaleString() : "—"} unit={wl} delta={<Badge tone="neutral">last week</Badge>}>
          {training.weekly.length >= 2 ? <BarChart values={tonnageVals} labels={weekLabels} tone="activity" format={(v) => `${v.toLocaleString()} ${wl}`} /> : <EmptyMini label="Log a few weeks of training to see volume" />}
        </ChartCard>
      </Stagger>
      <Stagger>
        <ChartCard title="Weekly sets" icon={Activity} tone="cardio">
          {training.weekly.length >= 2 ? <BarChart values={setVals} labels={weekLabels} tone="cardio" height={130} format={(v) => `${v} sets`} /> : <EmptyMini label="No sets logged in range" />}
        </ChartCard>
      </Stagger>
      <Stagger>
        <Card className="space-y-3">
          <div className="flex items-center gap-2"><IconBadge icon={Trophy} tone="activity" size="sm" /><div className="text-sm font-semibold">Personal records · est. 1RM</div></div>
          {training.prs.length === 0 ? <EmptyMini label="Log weighted sets to build your PR board" /> : (
            <div className="space-y-1.5">
              {training.prs.map((p, i) => (
                <div key={p.exerciseId} className="flex items-center gap-3">
                  <div className="numeral w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">{i + 1}</div>
                  {p.thumb ? <img src={p.thumb} alt="" className="size-9 shrink-0 rounded-lg object-cover" /> : <IconBadge icon={Dumbbell} tone="activity" size="sm" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.name}</div>
                    <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${Math.max(6, (p.e1rm / maxE1) * 100)}%`, backgroundColor: toneVar.activity }} /></div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="numeral text-sm font-bold">{kgToDisplay(p.e1rm, units).toFixed(0)} <span className="text-[0.65rem] font-medium text-muted-foreground">{wl}</span></div>
                    <div className="numeral text-[0.65rem] text-muted-foreground">{kgToDisplay(p.weight, units).toFixed(0)}×{p.reps}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </Stagger>
    </>
  );
}

// ── Wellness ──
function Wellness({ data, dateLabel }: { data: ProgressData; dateLabel: (i: number) => string }) {
  const { wellness } = data;
  const r = wellness.radar;
  const axes = [
    { label: "Mood", value: r.mood },
    { label: "Energy", value: r.energy },
    { label: "Sleep", value: r.sleep },
    { label: "Calm", value: r.calm },
    { label: "Consistency", value: r.consistency },
  ];
  const moodVals = wellness.perDay.map((p) => p.mood);
  const sleepVals = wellness.perDay.map((p) => p.sleepHours);
  const hasRadar = axes.some((a) => a.value > 0);
  return (
    <>
      <Stagger>
        <ChartCard title="Wellness balance" icon={HeartPulse} tone="cardio" value={wellness.index != null ? wellness.index.toFixed(1) : "—"} unit={wellness.index != null ? "/ 5" : undefined}>
          {hasRadar ? <RadarChart axes={axes} tone="cardio" size={230} /> : <EmptyMini label="Check in with mood, energy & sleep to build your radar" />}
        </ChartCard>
      </Stagger>
      <Stagger className="grid grid-cols-2 gap-3">
        <StatCard stack label="Avg mood" value={wellness.averages.mood ?? "—"} unit="/ 5" icon={Smile} tone="nutrition" />
        <StatCard stack label="Avg energy" value={wellness.averages.energy ?? "—"} unit="/ 5" icon={Zap} tone="warning" />
        <StatCard stack label="Avg sleep" value={wellness.averages.sleepHours ?? "—"} unit="h" icon={Moon} tone="sleep" />
        <StatCard stack label="Avg stress" value={wellness.averages.stress ?? "—"} unit="/ 5" icon={Gauge} tone="danger" />
      </Stagger>
      <Stagger>
        <ChartCard title="Mood trend" icon={Smile} tone="nutrition">
          <AreaChart values={moodVals} tone="nutrition" grid={3} height={140} label={dateLabel} format={(v) => v.toFixed(1)} />
        </ChartCard>
      </Stagger>
      <Stagger>
        <ChartCard title="Sleep trend" icon={Moon} tone="sleep">
          <AreaChart values={sleepVals} tone="sleep" grid={3} height={140} label={dateLabel} format={(v) => `${v.toFixed(1)}h`} />
        </ChartCard>
      </Stagger>
    </>
  );
}

// ── Small pieces ──
function MiniStat({ icon: Icon, tone, label, value, sub }: { icon: LucideIcon; tone: Tone; label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="size-4 shrink-0" style={{ color: toneVar[tone] }} />
      <span className="flex-1 truncate text-xs text-muted-foreground">{label}</span>
      <span className="numeral text-sm font-bold">{value}{sub && <span className="ml-0.5 text-[0.65rem] font-medium text-muted-foreground">{sub}</span>}</span>
    </div>
  );
}

function DeltaBadge({ d, convert, unit }: { d: SeriesDelta | null; convert: (v: number) => number; unit: string }) {
  if (!d || d.delta === 0) return null;
  const val = convert(Math.abs(d.delta));
  const down = d.delta < 0;
  return (
    <Badge tone="neutral"><TrendingUp className={cn("size-3", down && "rotate-180")} />{down ? "−" : "+"}{val.toFixed(1)} {unit}</Badge>
  );
}

function MeasChip({ label, value, units }: { label: string; value: number | null; units: ReturnType<typeof useUnits> }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5">
      <div className="text-[0.65rem] font-medium text-muted-foreground">{label}</div>
      <div className="numeral mt-0.5 text-sm font-bold">{value != null ? `${cmToLengthDisplay(value, units).toFixed(1)}` : "—"}<span className="ml-0.5 text-[0.6rem] font-medium text-muted-foreground">{value != null ? lengthLabel(units) : ""}</span></div>
    </div>
  );
}

function EmptyMini({ label }: { label: string }) {
  return <div className="grid h-24 place-items-center rounded-xl bg-surface-2 px-4 text-center text-xs text-muted-foreground">{label}</div>;
}

function NarrativeButton({ clientId, streak, weights }: { clientId: string; streak: number; weights: number }) {
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const run = async () => {
    setBusy(true); setOpen(true);
    try { setText((await api.post<{ narrative: string }>("/api/ai/narrative", { clientId, stats: { checkInStreak: streak, weightEntries: weights } })).narrative); }
    catch { setText("AI recap isn't available on your studio's plan."); }
    finally { setBusy(false); }
  };
  return (
    <>
      <Button variant="tonal" size="sm" onClick={() => void run()}><Sparkles /> Recap</Button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-lg">
            <Card className="flex items-start gap-3 shadow-lg"><Sparkles className="mt-0.5 size-4 shrink-0 text-primary" /><p className="flex-1 text-sm">{busy ? "Writing your recap…" : text}</p><button onClick={() => setOpen(false)} className="text-muted-foreground"><X className="size-4" /></button></Card>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
