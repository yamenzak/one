/**
 * Workout plan builder — days → blocks → slots → sets. Full set richness
 * (all weight modes, rpe/rir/tempo/rest, measurement modes), block config
 * (rounds/rests), exercise picker, draft/publish, ✦ AI draft, duplicate-day,
 * export-to-template.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { WorkoutBody, WorkoutDay, WorkoutBlock, ExerciseSlot, WorkoutSet, WeightMode, MeasurementMode } from "@kova/protocol";
import { Button, Card, Badge, Field, Input, Select, Sheet, Skeleton, SubCard, EmptyState, SegmentedControl, Chip, Switch, Page, Stagger, Eyebrow, GlanceStrip, IconBadge, ConfirmDialog, toneVar, type Tone, cn, colorToHex, Reveal, SkeletonLine, Search, ArrowLeft, Plus, Copy, Trash2, PencilLine, Dumbbell, Moon, ChevronRight, CheckCheck, Save, History, LayoutGrid, X, BarChart3, AlertTriangle } from "@kova/ui";
import { api, ApiError, errorText } from "../../api.js";
import { useCan } from "../../FeatureLock.js";
import { AiAvatar } from "../../AiAvatar.js";
import { ClientPrefsStrip } from "./ClientPrefsStrip.js";
import { AiErrorBox } from "../../AiError.js";
import { ExerciseRow, splitList, pretty, type ExerciseInfo } from "../exercise.js";
import { ExerciseEditor } from "./ExerciseEditor.js";

interface Plan { id: string; clientId: string; name: string; status: string; body: WorkoutBody; variantId?: string | null }
type ExerciseLite = ExerciseInfo;

const WEIGHT_MODES: { value: WeightMode; label: string; unit?: string }[] = [
  { value: "unspecified", label: "Client picks" },
  { value: "absolute", label: "Set weight", unit: "kg" },
  { value: "bodyweight", label: "Bodyweight" },
  { value: "percent_1rm", label: "% 1RM", unit: "%" },
  { value: "previous_plus", label: "Prev + kg", unit: "+kg" },
  { value: "previous_times", label: "Prev × mult", unit: "×" },
  { value: "dropset", label: "Dropset from", unit: "kg" },
];
const MEASURE_MODES: { value: MeasurementMode; label: string }[] = [
  { value: "reps", label: "Reps" }, { value: "time", label: "Time" }, { value: "distance", label: "Distance" }, { value: "reps_in_time", label: "Reps in time" },
];
const SET_TYPES = ["warmup", "working", "amrap"] as const;

const emptySetFor = (mode: MeasurementMode): WorkoutSet => ({
  setType: "working", weightMode: "unspecified", restAfterSec: 90,
  reps: mode === "reps" || mode === "reps_in_time" ? 10 : null,
});
const emptySlot = (exerciseId: string): ExerciseSlot => ({ exerciseId, measurementMode: "reps", sets: [emptySetFor("reps"), emptySetFor("reps"), emptySetFor("reps")] });

/** Drop the measure fields that don't apply to a mode, so a set never carries
 *  stale reps/time/distance after the coach switches how it's measured. */
function normalizeSetForMode(set: WorkoutSet, mode: MeasurementMode): void {
  if (mode !== "reps" && mode !== "reps_in_time") set.reps = null;
  if (mode !== "time" && mode !== "reps_in_time") set.timeSec = null;
  if (mode !== "distance") set.distanceM = null;
}
const emptyBlock = (): WorkoutBlock => ({ type: "single", slots: [] });
const emptyDay = (name: string): WorkoutDay => ({ name, isRestDay: false, blocks: [] });

const BLOCK_TYPES: { value: WorkoutBlock["type"]; label: string }[] = [
  { value: "single", label: "Single" }, { value: "superset", label: "Superset" }, { value: "circuit", label: "Circuit" }, { value: "hiit", label: "HIIT" },
];

/** One-tap set templates — populate a slot's sets[] in a single action instead of
 *  adding + hand-editing identical empty rows. `reps: null` + `amrap` = "to failure". */
const SET_PRESETS: { label: string; count: number; reps: number | null; setType: WorkoutSet["setType"] }[] = [
  { label: "3×10", count: 3, reps: 10, setType: "working" },
  { label: "4×8", count: 4, reps: 8, setType: "working" },
  { label: "5×5", count: 5, reps: 5, setType: "working" },
  { label: "3× failure", count: 3, reps: null, setType: "amrap" },
];

/** Build a slot's sets from a preset, honouring the slot's current measurement
 *  mode (rep targets only land on rep-based modes; others get the count alone). */
const setsFromPreset = (preset: (typeof SET_PRESETS)[number], mode: MeasurementMode): WorkoutSet[] =>
  Array.from({ length: preset.count }, () => {
    const s = emptySetFor(mode);
    s.setType = preset.setType;
    if (mode === "reps" || mode === "reps_in_time") s.reps = preset.reps;
    return s;
  });

/** Prescription fields fill-down copies from one set to its siblings. Each set's
 *  own setType (warmup/working/amrap) and notes are intentionally preserved. */
const copyPrescription = (src: WorkoutSet, dst: WorkoutSet): WorkoutSet => ({
  ...dst,
  reps: src.reps, timeSec: src.timeSec, distanceM: src.distanceM,
  weightMode: src.weightMode, weightValue: src.weightValue, percent1rm: src.percent1rm,
  rpe: src.rpe, rir: src.rir, restAfterSec: src.restAfterSec, tempo: src.tempo,
});

/** The tenant's live accent colour as #rrggbb (read from the applied --primary). */
const accentHex = (): string => { try { return colorToHex(getComputedStyle(document.documentElement).getPropertyValue("--primary").trim()); } catch { return "#10b981"; } };

const DAY_STYLES = [
  { key: "dynamic", label: "Dynamic", hint: "bold dynamic athletic action, dramatic lighting, high energy" },
  { key: "abstract", label: "Abstract", hint: "abstract geometric shapes and smooth gradients, no figures" },
  { key: "anatomy", label: "Anatomy", hint: "clean anatomical illustration of the muscles worked, medical-poster style" },
  { key: "lineart", label: "Line art", hint: "minimal single-weight continuous line-art of an athletic figure" },
  { key: "minimal", label: "Minimal", hint: "minimal premium poster, lots of negative space, subtle texture" },
  { key: "neon", label: "Neon", hint: "neon-lit dark gym, glowing rim light, moody and cinematic" },
] as const;

/** Per-day branded cover: generate in the tenant's accent colour, pick a style. */
function DayCover({ dayName, value, onChange }: { dayName: string; value?: string | null; onChange: (url: string | null) => void }) {
  // Covers come from `/api/ai/generate-image`, which is gated on aiSuite. Without
  // it the generate/restyle buttons only ever produced a 403 rendered as
  // "Couldn't generate", so hide them (an existing cover still shows + removes).
  const canAi = useCan("aiSuite");
  const [pickOpen, setPickOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const gen = async (style: (typeof DAY_STYLES)[number]) => {
    setPickOpen(false); setBusy(true); setErr(null);
    try {
      const r = await api.post<{ url: string }>("/api/ai/generate-image", { feature: "workout-day-image", subject: dayName.trim() || "training day", hint: `${style.label} style — ${style.hint}`, brandColor: accentHex() });
      onChange(r.url);
    } catch (e) {
      setErr(e instanceof ApiError && e.message.toLowerCase().includes("credit") ? "Out of AI credits." : "Couldn't generate — try again.");
    } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative overflow-hidden rounded-2xl">
          <img src={value} alt="" className="h-32 w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          <div className="absolute right-2 top-2 flex gap-1.5">
            {canAi && <button onClick={() => setPickOpen(true)} disabled={busy} className="inline-flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md transition-colors hover:bg-black/70 [&_svg]:size-3.5"><AiAvatar className="size-3.5" /> {busy ? "…" : "Restyle"}</button>}
            <button onClick={() => onChange(null)} aria-label="Remove cover" className="grid size-7 place-items-center rounded-full bg-black/50 text-white backdrop-blur-md transition-colors hover:bg-black/70 [&_svg]:size-3.5"><Trash2 /></button>
          </div>
        </div>
      ) : canAi ? (
        <button onClick={() => setPickOpen(true)} disabled={busy} className="flex h-24 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-surface-2 text-sm text-muted-foreground transition-colors hover:bg-surface-3 disabled:opacity-60 [&_svg]:size-4">
          {busy ? <><span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> Generating cover…</> : <><AiAvatar className="size-4" /> Generate a branded day cover</>}
        </button>
      ) : null}
      {err && <p className="text-xs text-warning">{err}</p>}
      {pickOpen && (
        <Sheet open onClose={() => setPickOpen(false)} title="Cover style">
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Rendered in your brand accent colour. Pick a look for &ldquo;{dayName.trim() || "this day"}&rdquo;.</p>
            <div className="grid grid-cols-2 gap-2">
              {DAY_STYLES.map((s) => (
                <button key={s.key} onClick={() => void gen(s)} className="rounded-2xl border border-border/60 bg-card p-3 text-left transition-colors hover:bg-surface-2">
                  <div className="text-sm font-semibold">{s.label}</div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{s.hint}</div>
                </button>
              ))}
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

// ── Plan health (live, pure over in-memory days + library) ───────────────────
// A set counts as "working" when its type isn't a warm-up (working + amrap).
//
// Muscle-volume rule: each slot's WORKING-set count is attributed IN FULL to
// EVERY primary muscle group its exercise lists (comma list via splitList of
// `muscle_groups`) — a set that trains two primaries counts once toward each,
// the standard "weekly sets per muscle" convention (so the per-muscle totals
// can sum to more than the raw working-set count). Exercises the library can't
// resolve, or with no primary muscle, fall to "Other". We aggregate by the raw
// muscle-group token (e.g. "quadriceps"), pretty()-labelled at render.
type ExLib = Map<string, ExerciseLite>;

/** Coarse muscle families — used both to tone-code the bars and to spot a
 *  major group with zero volume. `re` is tested against the lowercased token. */
const MUSCLE_MAJORS: { key: string; label: string; tone: Tone; re: RegExp }[] = [
  { key: "chest", label: "chest", tone: "cardio", re: /chest|pec/ },
  { key: "back", label: "back", tone: "activity", re: /back|lat|trap|rhomboid|erector/ },
  { key: "legs", label: "leg", tone: "nutrition", re: /quad|hamstring|glute|calf|calve|adductor|abductor|leg/ },
  { key: "shoulders", label: "shoulder", tone: "hydration", re: /shoulder|delt/ },
  { key: "arms", label: "arm", tone: "sleep", re: /bicep|tricep|forearm|arm/ },
  { key: "core", label: "core", tone: "warning", re: /abdomin|oblique|core/ },
];
const muscleMajor = (m: string) => MUSCLE_MAJORS.find((mj) => mj.re.test(m.toLowerCase()));
const muscleTone = (m: string): Tone => muscleMajor(m)?.tone ?? "neutral";

const isWorking = (s: WorkoutSet) => s.setType !== "warmup";

interface PlanHealth {
  trainingDays: number;
  restDays: number;
  totalSets: number;
  workingSets: number;
  warmupSets: number;
  byMuscle: { muscle: string; sets: number }[];
  missingMajors: string[];
  hasExercises: boolean;
}

function computePlanHealth(days: WorkoutDay[], lib: ExLib): PlanHealth {
  let trainingDays = 0, restDays = 0, totalSets = 0, workingSets = 0, exerciseCount = 0;
  const byMuscle = new Map<string, number>();
  for (const d of days) {
    if (d.isRestDay) { restDays++; continue; }
    trainingDays++;
    for (const b of d.blocks) for (const s of b.slots) {
      exerciseCount++;
      const working = s.sets.filter(isWorking).length;
      totalSets += s.sets.length;
      workingSets += working;
      if (working === 0) continue;
      const primaries = splitList(lib.get(s.exerciseId)?.muscle_groups);
      const targets = primaries.length ? primaries.map((m) => m.toLowerCase()) : ["Other"];
      for (const m of targets) byMuscle.set(m, (byMuscle.get(m) ?? 0) + working);
    }
  }
  const ranked = [...byMuscle.entries()].map(([muscle, sets]) => ({ muscle, sets })).sort((a, b) => b.sets - a.sets);
  const present = new Set(ranked.flatMap(({ muscle }) => (muscleMajor(muscle) ? [muscleMajor(muscle)!.key] : [])));
  const missingMajors = exerciseCount > 0 ? MUSCLE_MAJORS.filter((mj) => !present.has(mj.key)).map((mj) => mj.label) : [];
  return { trainingDays, restDays, totalSets, workingSets, warmupSets: totalSets - workingSets, byMuscle: ranked, missingMajors, hasExercises: exerciseCount > 0 };
}

/** Per-day working-set count + heaviest muscle, for the day-cover cards. */
function daySummary(day: WorkoutDay, lib: ExLib): { sets: number; topMuscle?: string } {
  let sets = 0;
  const bm = new Map<string, number>();
  for (const b of day.blocks) for (const s of b.slots) {
    const working = s.sets.filter(isWorking).length;
    sets += working;
    if (working === 0) continue;
    for (const m of splitList(lib.get(s.exerciseId)?.muscle_groups)) bm.set(m.toLowerCase(), (bm.get(m.toLowerCase()) ?? 0) + working);
  }
  let topMuscle: string | undefined, top = 0;
  for (const [m, n] of bm) if (n > top) { top = n; topMuscle = m; }
  return { sets, topMuscle };
}

/** A live "is this plan balanced?" read: top-line counts + weekly set-volume by
 *  muscle group. Renders nothing until the plan has at least one exercise. */
function PlanHealthCard({ days, lib }: { days: WorkoutDay[]; lib: ExLib }) {
  const h = useMemo(() => computePlanHealth(days, lib), [days, lib]);
  if (!h.hasExercises) return null;
  const top = h.byMuscle.slice(0, 8);
  const max = top[0]?.sets ?? 1;
  return (
    <Card className="space-y-3.5">
      <Eyebrow>Plan health</Eyebrow>
      <GlanceStrip
        items={[
          { icon: Dumbbell, tone: "activity", value: h.trainingDays, label: h.trainingDays === 1 ? "Training day" : "Training days" },
          { icon: Moon, tone: "sleep", value: h.restDays, label: h.restDays === 1 ? "Rest day" : "Rest days" },
          { icon: BarChart3, tone: "primary", value: h.workingSets, label: h.warmupSets > 0 ? `Working sets · +${h.warmupSets} wu` : "Working sets" },
        ]}
      />
      <div className="space-y-2">
        <div className="px-1 text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground/80">Weekly sets by muscle</div>
        <div className="space-y-1.5">
          {top.map((mv) => (
            <div key={mv.muscle} className="flex items-center gap-2.5">
              <span className="w-20 shrink-0 truncate text-xs font-medium">{pretty(mv.muscle)}</span>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(6, (mv.sets / max) * 100)}%`, backgroundColor: toneVar[muscleTone(mv.muscle)] }} />
              </div>
              <span className="numeral w-5 shrink-0 text-right text-xs font-semibold tabular-nums">{mv.sets}</span>
            </div>
          ))}
        </div>
      </div>
      {h.missingMajors.length > 0 && (
        <div className="flex items-center gap-1.5 rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning [&_svg]:size-3.5">
          <AlertTriangle /> No {h.missingMajors.slice(0, 3).join(" · no ")} volume
        </div>
      )}
    </Card>
  );
}

export function WorkoutBuilder({ planId, onBack }: { planId: string; onBack: () => void }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [days, setDays] = useState<WorkoutDay[]>([]);
  const [dayIdx, setDayIdx] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // One in-flight name for the footer's three lifecycle actions — they share the
  // bar, and only one can sensibly run at a time.
  const [action, setAction] = useState<"publish" | "activate" | "rollback" | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [library, setLibrary] = useState<ExerciseLite[]>([]);
  const [picker, setPicker] = useState<{ blockIdx: number } | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  // Every AI affordance in the builder posts to a route gated on aiSuite.
  const canAi = useCan("aiSuite");
  const [exportOpen, setExportOpen] = useState(false);
  const [copyWeekOpen, setCopyWeekOpen] = useState(false);
  // Seed-the-draft: the client's most recent OTHER plan + a template picker.
  const [latestOther, setLatestOther] = useState<{ id: string; name: string; body: WorkoutBody } | null>(null);
  const [plansLoaded, setPlansLoaded] = useState(false);
  const [seedTemplateOpen, setSeedTemplateOpen] = useState(false);
  // A pending destructive replace, held until the coach confirms.
  const [seedConfirm, setSeedConfirm] = useState<{ source: string; apply: () => void } | null>(null);

  // Two independent reads, so `allSettled`: the plan is required (nothing renders
  // without it) but the exercise library only resolves names/thumbs/muscle
  // volume, and with `all` a library outage rejected the pair and left the whole
  // builder a permanent skeleton — the coach couldn't see the days they'd already
  // written. Losing the library alone degrades rows to "Exercise".
  const load = useCallback(async () => {
    setLoadError(false);
    const [p, ex] = await Promise.allSettled([api.get<{ plan: Plan }>(`/api/workout-plans/${planId}`), api.get<{ exercises: ExerciseLite[] }>("/api/exercises?scope=all")]);
    if (ex.status === "fulfilled") setLibrary(ex.value.exercises);
    if (p.status === "rejected") { setLoadError(true); return; }
    setPlan(p.value.plan); setDays(p.value.plan.body.days ?? []);
  }, [planId]);
  useEffect(() => void load(), [load]);

  // Library-only refresh — used after an inline "create exercise" so the new
  // row resolves its name/thumb WITHOUT reloading the plan (which would reset
  // `days` from the server and discard the just-added slot + unsaved edits).
  const reloadLibrary = useCallback(async () => {
    // Cosmetic: on failure keep the library we have (rows fall back to
    // "Exercise") rather than rejecting into an unhandled promise — the coach's
    // unsaved day edits are intact either way.
    try { setLibrary((await api.get<{ exercises: ExerciseLite[] }>("/api/exercises?scope=all")).exercises); }
    catch { /* keep the current library */ }
  }, []);

  // Fetch the client's plans (created_at DESC) to offer "Latest plan" as a
  // seed — the most recent plan that isn't THIS draft AND shares its lane
  // (variant), so seeding stays within the same plan variant. A quiet miss
  // just disables it.
  useEffect(() => {
    const cid = plan?.clientId;
    if (!cid) return;
    const lane = plan?.variantId ?? null;
    let alive = true;
    api.get<{ plans: { id: string; name: string; body: WorkoutBody; variantId?: string | null }[] }>(`/api/workout-plans?clientId=${cid}`)
      .then((r) => { if (!alive) return; setLatestOther(r.plans?.find((pl) => pl.id !== planId && (pl.variantId ?? null) === lane) ?? null); setPlansLoaded(true); })
      .catch(() => { if (alive) setPlansLoaded(true); });
    return () => { alive = false; };
  }, [plan?.clientId, plan?.variantId, planId]);

  // Replace the current draft's body with a seed body, then refresh the library
  // so exercises referenced by ids not yet loaded resolve their name/thumb.
  const applySeedBody = (body: WorkoutBody) => {
    setDays(body.days ?? []);
    setDayIdx(0);
    setDirty(true);
    void reloadLibrary();
  };
  // Guard: replacing is destructive, so confirm only when the draft has days.
  const seedDraft = (source: string, body: WorkoutBody) => {
    const apply = () => applySeedBody(body);
    if (days.length > 0) setSeedConfirm({ source, apply });
    else apply();
  };

  const mutate = (fn: (d: WorkoutDay[]) => void) => { const next = structuredClone(days); fn(next); setDays(next); setDirty(true); };
  // The raw body write — publish composes it, so it must throw rather than
  // swallow (publishing an unsaved body would hand the client the wrong days).
  const saveBody = async () => { await api.patch(`/api/workout-plans/${planId}`, { body: { days } }); setDirty(false); };
  const save = async () => {
    if (saving || action) return;
    setSaving(true); setActionErr(null);
    try { await saveBody(); }
    catch (e) { setActionErr(errorText(e, "Couldn't save the draft. Please try again.")); }
    finally { setSaving(false); }
  };
  /** Run one footer action with an in-flight guard + a visible failure. Without
   *  this a flaky POST changed nothing on screen: the coach walked away believing
   *  the client had the plan, and a double-tap fired the write twice. */
  const runAction = async (name: "publish" | "activate" | "rollback", fn: () => Promise<void>, fallback: string) => {
    if (action || saving) return;
    setAction(name); setActionErr(null);
    try { await fn(); }
    catch (e) { setActionErr(errorText(e, fallback)); }
    finally { setAction(null); }
  };
  const publish = () => runAction("publish", async () => { await saveBody(); await api.post(`/api/workout-plans/${planId}/publish`); await load(); }, "Couldn't publish this plan — the client hasn't received it. Please try again.");
  // Superseded/archived plans are read-only (PATCH 409s). "Make active" re-publishes
  // WITHOUT a save first (which would 409); rollback returns it to an editable draft.
  const makeActive = () => runAction("activate", async () => { await api.post(`/api/workout-plans/${planId}/publish`); await load(); }, "Couldn't make this plan active. Please try again.");
  const rollback = () => runAction("rollback", async () => { await api.post(`/api/workout-plans/${planId}/status`, { status: "draft" }); await load(); }, "Couldn't roll this plan back to a draft. Please try again.");
  const runAi = async (instructions: string): Promise<string[]> => { if (!plan) return []; const res = await api.post<{ draft: WorkoutBody; dropped?: string[] }>("/api/ai/draft-plan", { clientId: plan.clientId, instructions }); setDays(res.draft.days); setDirty(true); const dropped = res.dropped ?? []; if (!dropped.length) setAiOpen(false); return dropped; };

  // Copy week: duplicate every current day as a new mesocycle week, with an
  // optional linear progression (reps / load / %1RM) applied to each set.
  const copyWeek = (label: string, repBump: number, loadBump: number) => {
    const start = days.length;
    mutate((d) => {
      const clones = d.map((day) => ({
        ...structuredClone(day),
        name: `${day.name || "Day"}${label ? ` · ${label}` : ""}`,
        blocks: day.blocks.map((b) => ({
          ...structuredClone(b),
          slots: b.slots.map((s) => ({
            ...structuredClone(s),
            sets: s.sets.map((set) => ({
              ...set,
              reps: set.reps != null ? Math.max(1, set.reps + repBump) : set.reps,
              weightValue: set.weightValue != null && (set.weightMode === "absolute" || set.weightMode === "dropset") ? Math.round((set.weightValue + loadBump) * 100) / 100 : set.weightValue,
              percent1rm: set.percent1rm != null && set.weightMode === "percent_1rm" ? Math.min(100, set.percent1rm + loadBump) : set.percent1rm,
            })),
          })),
        })),
      }));
      d.push(...clones);
    });
    setDayIdx(start);
    setCopyWeekOpen(false);
  };

  const readOnly = plan?.status === "superseded" || plan?.status === "archived";
  const day = days[dayIdx];
  const libMap = useMemo(() => new Map(library.map((e) => [e.id, e] as const)), [library]);
  const exOf = (id: string) => library.find((e) => e.id === id);
  const nameOf = (id: string) => exOf(id)?.name ?? "Exercise";

  return (
    <Page className="column space-y-4 p-4 pb-32">
      {loadError && !plan ? (
        <EmptyState icon={AlertTriangle} title="Couldn't load this plan" description="Something went wrong reaching the server. Check your connection and try again." action={<div className="flex gap-2"><Button variant="secondary" onClick={onBack}>Back</Button><Button onClick={() => void load()}>Try again</Button></div>} />
      ) : (
      <Reveal loading={!plan} className="space-y-4" skeleton={
        <>
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-xl" />
            <SkeletonLine w="40%" h="title" className="flex-1" />
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="size-9 rounded-xl" />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="aspect-[16/10] rounded-2xl" />)}
          </div>
          <div className="flex flex-wrap gap-2"><Skeleton className="h-9 w-20 rounded-full" /><Skeleton className="h-9 w-24 rounded-full" /></div>
          <div className="space-y-3 rounded-2xl bg-card p-4">
            <SkeletonLine w="50%" h="title" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        </>
      }>
        {plan && (
        <>
      <div className="flex items-center gap-3">
        <Button size="icon" variant="secondary" onClick={onBack}><ArrowLeft /></Button>
        <h1 className="flex-1 truncate text-title-3">{plan.name}</h1>
        <Badge tone={plan.status === "published" ? "success" : "neutral"}>{plan.status}</Badge>
        <Button size="icon" variant="secondary" aria-label="Save as template" onClick={() => setExportOpen(true)}><Save /></Button>
      </div>

      <ClientPrefsStrip clientId={plan.clientId} focus="workout" />

      {/* Seed the draft — load the client's most recent other plan, or a saved
          template, into this draft (each REPLACES the current days). */}
      {!readOnly && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" disabled={!latestOther} onClick={() => latestOther && seedDraft(latestOther.name, latestOther.body)}><History /> Latest plan</Button>
            <Button variant="secondary" size="sm" onClick={() => setSeedTemplateOpen(true)}><LayoutGrid /> From template</Button>
          </div>
          {plansLoaded && !latestOther && <p className="px-1 text-[0.7rem] text-muted-foreground">No previous plan for this client — start from a template instead.</p>}
        </div>
      )}

      {/* Live "is this plan balanced?" read — volume by muscle group. */}
      <PlanHealthCard days={days} lib={libMap} />

      {/* Day cards — 2 per row, each showing its branded cover; tap to edit. */}
      {days.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5">
          {days.map((d, i) => {
            const { sets, topMuscle } = daySummary(d, libMap);
            const sub = d.isRestDay ? "Rest day" : sets > 0 ? `${sets} set${sets === 1 ? "" : "s"}${topMuscle ? ` · ${pretty(topMuscle)}` : ""}` : "No sets yet";
            return (
              <button key={i} onClick={() => setDayIdx(i)} className={cn("relative aspect-[16/10] overflow-hidden rounded-2xl text-left transition-all active:scale-[0.98]", i === dayIdx && "ring-2 ring-primary ring-offset-2 ring-offset-background")}>
                {d.imageUrl ? <img src={d.imageUrl} alt="" className="absolute inset-0 size-full object-cover" /> : <div className="absolute inset-0 bg-gradient-to-br from-primary/25 via-primary/5 to-surface-2" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                {d.isRestDay && <span className="absolute right-2 top-2 rounded-full bg-sleep-soft px-2 py-0.5 text-[0.6rem] font-semibold text-sleep">Rest</span>}
                <div className="absolute inset-x-0 bottom-0 p-2.5">
                  <div className="truncate text-sm font-semibold text-white">{d.name || `Day ${i + 1}`}</div>
                  {/* Over the black scrim this must be white, like its twins in
                      Train and the player. `--tone-foreground` is the ink for a
                      TONE-COLOURED surface (a `bg-activity` pill) — it is dark on
                      a light-primary theme, so at 70% over `from-black/75` the
                      set count was invisible. */}
                  <div className="truncate text-xs text-white/75">{sub}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => { mutate((d) => d.push(emptyDay(`Day ${days.length + 1}`))); setDayIdx(days.length); }} className="inline-flex items-center gap-1 rounded-full bg-secondary px-4 py-2 text-sm text-muted-foreground [&_svg]:size-4"><Plus /> Day</button>
        {day && <button onClick={() => { mutate((d) => d.splice(dayIdx + 1, 0, { ...structuredClone(d[dayIdx]!), name: `${d[dayIdx]!.name || `Day ${dayIdx + 1}`} (copy)` })); setDayIdx(dayIdx + 1); }} className="inline-flex items-center gap-1 rounded-full bg-secondary px-4 py-2 text-sm text-muted-foreground [&_svg]:size-4"><Copy /> Duplicate</button>}
        {days.length > 0 && <button onClick={() => setCopyWeekOpen(true)} className="inline-flex items-center gap-1 rounded-full bg-secondary px-4 py-2 text-sm text-muted-foreground [&_svg]:size-4"><Copy /> Copy week</button>}
      </div>

      <Stagger className="space-y-4">
      {days.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title="Empty plan"
          description={canAi ? "Add a day, or let AI draft one from the client's intake." : "Add a day to get started."}
          action={canAi ? <Button onClick={() => setAiOpen(true)}><AiAvatar className="size-5" /> AI draft plan</Button> : <Button onClick={() => { mutate((d) => d.push(emptyDay("Day 1"))); setDayIdx(0); }}><Plus /> Add a day</Button>}
        />
      ) : day ? (
        <>
          <Card className="space-y-3">
            <div className="flex items-center gap-2">
              <Field label="Day name" value={day.name} onChange={(e) => mutate((d) => (d[dayIdx]!.name = e.target.value))} className="flex-1" />
              <button onClick={() => mutate((d) => (d[dayIdx]!.isRestDay = !d[dayIdx]!.isRestDay))} className={`mt-6 inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm [&_svg]:size-4 ${day.isRestDay ? "bg-sleep-soft text-sleep" : "bg-secondary text-muted-foreground"}`}><Moon /> Rest</button>
            </div>
            {!day.isRestDay && <DayCover dayName={day.name} value={day.imageUrl} onChange={(url) => mutate((d) => (d[dayIdx]!.imageUrl = url))} />}
          </Card>

          {!day.isRestDay && day.blocks.map((block, blockIdx) => (
            <Card key={blockIdx} className="space-y-4">
              <div className="flex items-center gap-2">
                <Select value={block.type} onChange={(v) => mutate((d) => (d[dayIdx]!.blocks[blockIdx]!.type = v as WorkoutBlock["type"]))} options={BLOCK_TYPES} aria-label="Block type" className="h-10 w-36" />
                <div className="flex-1" />
                <button onClick={() => mutate((d) => d[dayIdx]!.blocks.splice(blockIdx, 1))} aria-label="Remove block" className="grid size-9 place-items-center rounded-xl text-danger hover:bg-danger-soft [&_svg]:size-4"><Trash2 /></button>
              </div>

              {block.type !== "single" && (
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Rounds" type="number" inputMode="numeric" value={block.rounds ?? ""} placeholder="1" onChange={(e) => mutate((d) => (d[dayIdx]!.blocks[blockIdx]!.rounds = e.target.value ? Number(e.target.value) : null))} />
                  <Field label="Rest/exercise" type="number" inputMode="numeric" value={block.restBetweenExercisesSec ?? ""} placeholder="s" onChange={(e) => mutate((d) => (d[dayIdx]!.blocks[blockIdx]!.restBetweenExercisesSec = e.target.value ? Number(e.target.value) : null))} />
                  <Field label="Rest/round" type="number" inputMode="numeric" value={block.restBetweenRoundsSec ?? ""} placeholder="s" onChange={(e) => mutate((d) => (d[dayIdx]!.blocks[blockIdx]!.restBetweenRoundsSec = e.target.value ? Number(e.target.value) : null))} />
                </div>
              )}

              {block.slots.map((slot, slotIdx) => {
                const setSlot = (fn: (sl: ExerciseSlot) => void) => mutate((d) => fn(d[dayIdx]!.blocks[blockIdx]!.slots[slotIdx]!));
                const applyToAll = (setIdx: number) => setSlot((sl) => { const src = sl.sets[setIdx]!; sl.sets = sl.sets.map((s, i) => (i === setIdx ? s : copyPrescription(src, s))); });
                return (
                <SubCard key={slotIdx} className="space-y-3">
                  {/*
                    The exercise name gets the row; the mode picker gets its own line.

                    A 128px `Select` plus a remove button pinned to the right of a
                    ~330px row left "Barbell Bac…", "Romanian …", "Incline Du…" —
                    every exercise in a real plan truncated, in the one screen
                    whose entire job is knowing which exercise you are editing.
                  */}
                  <ExerciseRow ex={exOf(slot.exerciseId)} name={nameOf(slot.exerciseId)} meta={false} thumbSize={34} trailing={
                    <button onClick={() => mutate((d) => d[dayIdx]!.blocks[blockIdx]!.slots.splice(slotIdx, 1))} aria-label="Remove exercise" className="text-muted-foreground hover:text-danger [&_svg]:size-4"><X /></button>
                  } />
                  <Select value={slot.measurementMode} onChange={(v) => { const nm = v as MeasurementMode; setSlot((sl) => { sl.measurementMode = nm; sl.sets.forEach((s) => normalizeSetForMode(s, nm)); }); }} options={MEASURE_MODES} aria-label="Measurement mode" className="h-9 w-40 text-xs" />

                  {/* Bulk-set presets — replace the slot's sets in one tap. */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">Quick sets</span>
                    {SET_PRESETS.map((p) => (
                      <Chip key={p.label} className="h-8 px-3 text-xs" onClick={() => setSlot((sl) => { sl.sets = setsFromPreset(p, sl.measurementMode); })}>{p.label}</Chip>
                    ))}
                  </div>

                  {slot.sets.map((set, setIdx) => (
                    <SetRow key={setIdx} set={set} index={setIdx} mode={slot.measurementMode}
                      onPatch={(p) => mutate((d) => Object.assign(d[dayIdx]!.blocks[blockIdx]!.slots[slotIdx]!.sets[setIdx]!, p))}
                      onApplyToAll={slot.sets.length > 1 ? () => applyToAll(setIdx) : undefined}
                      onRemove={() => setSlot((sl) => sl.sets.splice(setIdx, 1))} />
                  ))}
                  <button onClick={() => setSlot((sl) => sl.sets.push(emptySetFor(sl.measurementMode)))} className="text-xs font-medium text-activity">+ Set</button>
                </SubCard>
                );
              })}
              <button onClick={() => setPicker({ blockIdx })} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-secondary py-2.5 text-sm text-muted-foreground [&_svg]:size-4"><Plus /> Add exercise</button>
            </Card>
          ))}

          {!day.isRestDay && (
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => mutate((d) => d[dayIdx]!.blocks.push(emptyBlock()))}><Plus /> Block</Button>
              {canAi && <Button variant="ghost" className="flex-1" onClick={() => setAiOpen(true)}><AiAvatar className="size-5" /> AI draft</Button>}
            </div>
          )}
        </>
      ) : null}
      </Stagger>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/40 bg-background/90 p-3 backdrop-blur-xl md:pl-24">
        <div className="column space-y-2">
          {readOnly && (
            <div className="flex items-center gap-2 rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning [&_svg]:size-3.5"><History /> This plan is {plan.status} — read-only. Roll it back to a draft to edit, or make it active again.</div>
          )}
          {actionErr && <p className="px-1 text-xs text-warning" role="alert">{actionErr}</p>}
          <div className="flex gap-3">
            {readOnly ? (
              <>
                <Button variant="outline" className="flex-1" disabled={action !== null} onClick={() => void rollback()}>{action === "rollback" ? "Rolling back…" : "Roll back to draft"}</Button>
                <Button className="flex-1" disabled={action !== null} onClick={() => void makeActive()}>{action === "activate" ? "Activating…" : "Make active"}</Button>
              </>
            ) : (
              <>
                <Button variant="outline" className="flex-1" disabled={!dirty || saving || action !== null} onClick={() => void save()}>{saving ? "Saving…" : dirty ? "Save draft" : "Saved"}</Button>
                <Button className="flex-1" disabled={saving || action !== null} onClick={() => void publish()}>{action === "publish" ? "Publishing…" : plan.status === "published" ? "Re-publish" : "Publish"}</Button>
              </>
            )}
          </div>
        </div>
      </div>
        </>
        )}
      </Reveal>
      )}

      {picker && <ExercisePicker library={library} reloadLibrary={reloadLibrary} onClose={() => setPicker(null)} onPick={(id) => { mutate((d) => d[dayIdx]!.blocks[picker.blockIdx]!.slots.push(emptySlot(id))); setPicker(null); }} />}
      {aiOpen && <AiDraftSheet onClose={() => setAiOpen(false)} onRun={runAi} />}
      {exportOpen && plan && <ExportTemplateSheet body={{ days }} defaultName={plan.name} onClose={() => setExportOpen(false)} />}
      {copyWeekOpen && <CopyWeekSheet dayCount={days.length} onClose={() => setCopyWeekOpen(false)} onCopy={copyWeek} />}
      {seedTemplateOpen && <SeedTemplateSheet onClose={() => setSeedTemplateOpen(false)} onPick={(body, name) => { setSeedTemplateOpen(false); seedDraft(name, body); }} />}
      <ConfirmDialog
        open={!!seedConfirm}
        onOpenChange={(o) => { if (!o) setSeedConfirm(null); }}
        title="Replace this draft?"
        description={`The current days will be replaced with “${seedConfirm?.source ?? ""}”.`}
        confirmLabel="Replace"
        destructive
        onConfirm={() => seedConfirm?.apply()}
      />
    </Page>
  );
}

/**
 * Copy week — duplicate the whole day-set as the next mesocycle week, with an
 * optional linear progression baked into every set (reps / load / %1RM).
 */
function CopyWeekSheet({ dayCount, onClose, onCopy }: { dayCount: number; onClose: () => void; onCopy: (label: string, repBump: number, loadBump: number) => void }) {
  const [label, setLabel] = useState("Week 2");
  const [reps, setReps] = useState("0");
  const [load, setLoad] = useState("0");
  return (
    <Sheet open onClose={onClose} title="Copy week" footer={<Button size="lg" className="w-full" onClick={() => onCopy(label.trim(), Number(reps), Number(load))}><Copy /> Copy {dayCount} {dayCount === 1 ? "day" : "days"}</Button>}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Duplicates all {dayCount} {dayCount === 1 ? "day" : "days"} as a new week. A progression is added to every set that has that value — leave at 0 to copy as-is.</p>
        <Field label="Week label (added to each day name)" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Week 2" />
        <div className="space-y-1.5">
          <div className="text-sm text-muted-foreground">Reps per set</div>
          <SegmentedControl options={[{ value: "0", label: "Same" }, { value: "1", label: "+1" }, { value: "2", label: "+2" }]} value={reps} onChange={setReps} />
        </div>
        <div className="space-y-1.5">
          <div className="text-sm text-muted-foreground">Load (kg on set weights, % on %1RM)</div>
          <SegmentedControl options={[{ value: "0", label: "Same" }, { value: "2.5", label: "+2.5" }, { value: "5", label: "+5" }]} value={load} onChange={setLoad} />
        </div>
      </div>
    </Sheet>
  );
}

function SetRow({ set, index, mode, onPatch, onApplyToAll, onRemove }: { set: WorkoutSet; index: number; mode: MeasurementMode; onPatch: (p: Partial<WorkoutSet>) => void; onApplyToAll?: () => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const wm = WEIGHT_MODES.find((m) => m.value === set.weightMode);
  const num = (v: string) => (v ? Number(v) : null);
  const cell = "h-10 w-16 shrink-0 px-2.5 text-center text-sm";
  return (
    <div className="rounded-xl bg-surface-3/40 p-2">
      <div className="flex items-center gap-1.5">
        <button onClick={() => setOpen((o) => !o)} aria-label={open ? "Collapse set" : "Expand set"} className="w-5 shrink-0 text-muted-foreground"><ChevronRight className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} /></button>
        <span className="w-4 shrink-0 text-center text-xs font-medium text-muted-foreground">{index + 1}</span>
        {(mode === "reps" || mode === "reps_in_time") && (
          <Input type="number" inputMode="numeric" aria-label="Reps" placeholder="reps" value={set.reps ?? ""} onChange={(e) => onPatch({ reps: num(e.target.value) })} className={cell} />
        )}
        {(mode === "time" || mode === "reps_in_time") && (
          <Input type="number" inputMode="numeric" aria-label="Seconds" placeholder="sec" value={set.timeSec ?? ""} onChange={(e) => onPatch({ timeSec: num(e.target.value) })} className={cell} />
        )}
        {mode === "distance" && (
          <Input type="number" inputMode="numeric" aria-label="Metres" placeholder="m" value={set.distanceM ?? ""} onChange={(e) => onPatch({ distanceM: num(e.target.value) })} className={cell} />
        )}
        {/* `whitespace-nowrap`: "Client picks" wrapped to two lines in this
            cell, so a set row was taller than its neighbours and a column of
            sets stopped reading as a column. A set row is a spreadsheet line —
            it truncates, it does not reflow. */}
        <Select value={set.weightMode} onChange={(v) => onPatch({ weightMode: v as WeightMode })} options={WEIGHT_MODES.map((m) => ({ value: m.value, label: m.label }))} aria-label="Weight mode" className="h-10 min-w-0 flex-1 whitespace-nowrap" />
        {wm?.unit && wm.value !== "bodyweight" && wm.value !== "unspecified" && (
          <Input type="number" inputMode="decimal" aria-label={wm.unit} placeholder={wm.unit} value={set.weightMode === "percent_1rm" ? (set.percent1rm ?? "") : (set.weightValue ?? "")} onChange={(e) => onPatch(set.weightMode === "percent_1rm" ? { percent1rm: num(e.target.value) } : { weightValue: num(e.target.value) })} className={cell} />
        )}
        {onApplyToAll && (
          <button onClick={onApplyToAll} title="Apply this set's reps, load, RPE/RIR, rest & tempo to every set" aria-label="Apply to all sets" className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-surface-3 hover:text-activity [&_svg]:size-4"><CheckCheck /></button>
        )}
        <button onClick={onRemove} aria-label="Remove set" className="shrink-0 text-muted-foreground hover:text-danger [&_svg]:size-3.5"><X /></button>
      </div>
      {open && (
        <div className="mt-2.5 space-y-2.5 pl-6">
          <div>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">Set type</div>
            <SegmentedControl fill value={set.setType} onChange={(v) => onPatch({ setType: v as WorkoutSet["setType"] })} options={SET_TYPES.map((t) => ({ value: t, label: t }))} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="RPE" type="number" inputMode="decimal" min={1} max={10} value={set.rpe ?? ""} onChange={(e) => onPatch({ rpe: num(e.target.value) })} />
            <Field label="RIR" type="number" inputMode="decimal" min={0} max={10} value={set.rir ?? ""} onChange={(e) => onPatch({ rir: num(e.target.value) })} />
            <Field label="Rest s" type="number" inputMode="numeric" value={set.restAfterSec ?? ""} onChange={(e) => onPatch({ restAfterSec: num(e.target.value) })} />
          </div>
          <Field label="Tempo" value={set.tempo ?? ""} placeholder="3-1-1-0" onChange={(e) => onPatch({ tempo: e.target.value || null })} />
          <Field label="Notes" value={set.notes ?? ""} onChange={(e) => onPatch({ notes: e.target.value || null })} />
        </div>
      )}
    </div>
  );
}

function ExercisePicker({ library, onClose, onPick, reloadLibrary }: { library: ExerciseLite[]; onClose: () => void; onPick: (id: string) => void; reloadLibrary: () => void }) {
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState<string | null>(null);
  const [equip, setEquip] = useState<string | null>(null);
  const [compose, setCompose] = useState(false);

  // Filter options derived from the loaded library (most common first).
  const opts = (get: (e: ExerciseLite) => string[]) => {
    const count = new Map<string, number>();
    for (const e of library) for (const v of get(e)) count.set(v, (count.get(v) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v).slice(0, 8);
  };
  const muscles = opts((e) => splitList(e.muscle_groups));
  const equipment = opts((e) => splitList(e.equipment));

  const filtered = library.filter((e) =>
    e.active !== 0 && // archived rows resolve for existing plans but aren't offered for new picks
    e.name.toLowerCase().includes(q.toLowerCase()) &&
    (!muscle || splitList(e.muscle_groups).concat(splitList(e.secondary_muscle_groups)).includes(muscle)) &&
    (!equip || splitList(e.equipment).includes(equip)),
  ).slice(0, 80);

  // "Create new" opens the unified composer (AI / web / manual) in plan mode.
  if (compose) {
    return <ExerciseEditor planMode onClose={() => setCompose(false)} onSaved={async (id) => { setCompose(false); await reloadLibrary(); if (id) onPick(id); }} />;
  }

  return (
    <Sheet open onClose={onClose} title="Add exercise">
      <Field label="Search your library" icon={Search} value={q} onChange={(e) => setQ(e.target.value)} className="mb-2" />
      <Button size="sm" variant="secondary" className="mb-3 w-full" onClick={() => setCompose(true)}><Plus /> Create a new exercise</Button>
      {muscles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {muscles.map((m) => <Chip key={m} selected={muscle === m} onClick={() => setMuscle(muscle === m ? null : m)}>{pretty(m)}</Chip>)}
        </div>
      )}
      {equipment.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {equipment.map((eq) => <Chip key={eq} selected={equip === eq} onClick={() => setEquip(equip === eq ? null : eq)}>{pretty(eq)}</Chip>)}
        </div>
      )}
      <div className="max-h-96 space-y-1 overflow-y-auto">
        {filtered.map((e) => (
          <button key={e.id} onClick={() => onPick(e.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-secondary">
            <ExerciseRow ex={e} thumbSize={40} trailing={e.difficulty ? <Badge tone="neutral">{e.difficulty}</Badge> : null} />
          </button>
        ))}
        {filtered.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matches — create a new one above.</p>}
      </div>
    </Sheet>
  );
}

function AiDraftSheet({ onClose, onRun }: { onClose: () => void; onRun: (i: string) => Promise<string[]> }) {
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [dropped, setDropped] = useState<string[] | null>(null);
  const run = async () => { setBusy(true); setErr(null); setDropped(null); try { const d = await onRun(instructions); if (d.length) setDropped(d); } catch (e) { setErr(e); } finally { setBusy(false); } };
  return (
    <Sheet open onClose={onClose} title="AI Plan Draft" footer={<Button size="lg" className="w-full" disabled={busy} onClick={() => void run()}>{busy ? "Drafting…" : "Generate draft"}</Button>}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Generate a starting draft from this client's full profile — their goal, body, training history and limitations. Every exercise comes from your library; you'll review and edit before publishing.</p>
        <Field label="Instructions (optional)" icon={PencilLine} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. 4-day upper/lower, dumbbells only" />
        {dropped ? <div className="rounded-xl border border-border/60 bg-surface-2 p-3 text-xs text-muted-foreground">Draft applied. {dropped.length} suggested exercise{dropped.length === 1 ? "" : "s"} weren't in your library and {dropped.length === 1 ? "was" : "were"} skipped: {dropped.join(", ")}. Add {dropped.length === 1 ? "it" : "them"} to your library to include next time.</div> : null}
        {err ? <AiErrorBox error={err} /> : null}
      </div>
    </Sheet>
  );
}

/** Pick a saved workout template to seed the draft with. Fetches on open;
 *  each row shows the template name + its day count. Picking hands the body up. */
function SeedTemplateSheet({ onClose, onPick }: { onClose: () => void; onPick: (body: WorkoutBody, name: string) => void }) {
  const [templates, setTemplates] = useState<{ id: string; name: string; description?: string | null; body: WorkoutBody }[] | null>(null);
  useEffect(() => {
    let alive = true;
    api.get<{ templates: { id: string; name: string; description?: string | null; body: WorkoutBody }[] }>("/api/workout-templates")
      .then((r) => { if (alive) setTemplates(r.templates ?? []); })
      .catch(() => { if (alive) setTemplates([]); });
    return () => { alive = false; };
  }, []);
  return (
    <Sheet open onClose={onClose} title="Start from a template">
      <p className="mb-3 text-sm text-muted-foreground">Loads a saved template into this draft, replacing the current days.</p>
      {templates === null ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : templates.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">No templates yet — save one from a plan's builder.</p>
      ) : (
        <div className="max-h-96 space-y-1.5 overflow-y-auto">
          {templates.map((t) => {
            const n = t.body.days?.length ?? 0;
            return (
              <button key={t.id} onClick={() => onPick(t.body, t.name)} className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card p-3 text-left transition-colors hover:bg-surface-2">
                <IconBadge icon={LayoutGrid} tone="activity" size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{t.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{n} day{n === 1 ? "" : "s"}{t.description ? ` · ${t.description}` : ""}</div>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}

function ExportTemplateSheet({ body, defaultName, onClose }: { body: WorkoutBody; defaultName: string; onClose: () => void }) {
  const [name, setName] = useState(defaultName);
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const run = async () => {
    setBusy(true);
    try { await api.post("/api/workout-templates", { name, visibility: shared ? "tenant" : "private", body, stripWeights: true }); setDone(true); }
    finally { setBusy(false); }
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="Save as template"
      /* Once it is saved there is nothing left to submit — the done branch is a
         receipt with its own way out, so the footer goes with the form. */
      footer={done ? undefined : <Button size="lg" className="w-full" disabled={busy || !name.trim()} onClick={() => void run()}>{busy ? "Saving…" : "Save template"}</Button>}
    >
      {done ? (
        <EmptyState icon={Save} title="Saved to your library" description="Client-specific loads were stripped so it's reusable." action={<Button onClick={onClose}>Done</Button>} />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Copies this plan's structure into a reusable template. Absolute and dropset weights are cleared.</p>
          <Field label="Template name" value={name} onChange={(e) => setName(e.target.value)} />
          <label className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3 text-sm"><span>Share with the whole team</span><Switch checked={shared} onCheckedChange={setShared} /></label>
        </div>
      )}
    </Sheet>
  );
}
