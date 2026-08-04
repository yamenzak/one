/**
 * ExerciseEditor — the unified create/edit drawer for exercises, used both in
 * the Library and inline in the workout planner. A fixed-height, non-dismissible
 * drawer (close only via the X, so mobile typing can't be lost) with two steps:
 *
 *   choose  → name + three ways in: With AI · Web search · Manual
 *             (web search picks a provider result and imports it)
 *   review  → every field, compact, editable → Add / Update / Add to plan
 *
 * Editing jumps straight to review with the button relabelled. Alternatives are
 * managed from an optional nested drawer once the exercise exists.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { FixedDrawer, Button, Field, Textarea, Sheet, Chip, Dumbbell, Play, X, Globe, PencilLine, ArrowLeft, ArrowRight, Search, Plus, Trash2, Check, Thumb, toneSoft, cn, type Tone, SPRING_SNAP} from "@4dl/ui";
import { MUSCLE_GROUPS, EQUIPMENT_TYPES } from "@kova/protocol";
import { api, ApiError, uploadMedia } from "../../api.js";
import { useCan } from "../../FeatureLock.js";
import { AiAvatar } from "../../AiAvatar.js";
import { AiImageField } from "../../AiImageField.js";
import { splitWideImageToHalves } from "../../imageSplit.js";
import { ModeRow, StepFade } from "../../composer.js";
import { ExerciseRow, type ExerciseInfo } from "../exercise.js";

const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
const FORCES = ["push", "pull", "static"] as const;
const MECHANICS = ["compound", "isolation"] as const;
const splitCsv = (s?: string | null) => (s ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
const pretty = (s: string) => s.replace(/^\w/, (c) => c.toUpperCase());

interface WebExercise { name: string; muscleGroups: string[]; secondaryMuscleGroups?: string[]; equipment: string[]; instructions?: string | null; difficulty?: string | null; force?: string | null; source: string; sourceId: string; imageUrl: string | null; imageUrl2?: string | null }
interface ExerciseMetaResult { primaryMuscles: string[]; secondaryMuscles: string[]; equipment: string[]; difficulty: string | null; force: string | null; mechanic: string | null }

/** Compact multi-select: one horizontally-scrolling row of toggle chips. */
function ChipStrip({ options, selected, onChange }: { options: readonly string[]; selected: string[]; onChange: (v: string[]) => void }) {
  const all = [...new Set([...selected, ...options])]; // selected first so they're visible
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
      {all.map((o) => <span key={o} className="shrink-0"><Chip selected={selected.includes(o)} onClick={() => toggle(o)}>{pretty(o)}</Chip></span>)}
    </div>
  );
}

/** A quiet uppercase section eyebrow that groups the review fields. */
function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="text-micro uppercase text-muted-foreground/70">{children}</div>;
}

/**
 * The choose-step's primary create path. Reads as one large, premium tone tile —
 * bigger than a ModeRow — so the featured way in (AI when entitled, Web search
 * otherwise) is unmistakably the hero. Its footprint is identical across tones,
 * so the choose step never shifts when the AI entitlement is off.
 */
function HeroChoice({ icon: Icon, tone, title, subtitle, badge, active, busy, disabled, onClick }: {
  icon: (p: { className?: string }) => ReactNode;
  tone: Tone; title: string; subtitle: string; badge?: string;
  active?: boolean; busy?: boolean; disabled?: boolean; onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      whileTap={{ scale: 0.985 }}
      transition={SPRING_SNAP}
      className={cn(
        "group relative flex w-full items-center gap-3.5 overflow-hidden rounded-2xl border p-4 text-left transition-colors disabled:pointer-events-none disabled:opacity-40",
        active
          ? "border-primary bg-primary/[0.07] ring-1 ring-inset ring-primary/35"
          : tone === "primary"
            ? "border-primary/45 bg-gradient-to-br from-primary/[0.16] to-primary/[0.03] hover:from-primary/[0.2]"
            : "border-border/60 bg-card hover:border-border hover:bg-surface-2",
      )}
    >
      <span className={cn("grid size-12 shrink-0 place-items-center rounded-xl transition-transform duration-200 group-hover:scale-105 group-active:scale-95 [&_svg]:size-[1.35rem]", tone === "primary" ? "bg-primary text-primary-foreground shadow-sm" : toneSoft[tone])}>
        {busy ? <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Icon />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="text-[0.95rem] font-semibold leading-tight text-foreground">{title}</span>
          {badge && <span className="rounded-full bg-primary/15 px-1.5 py-px text-xs font-bold uppercase leading-none tracking-wide text-primary">{badge}</span>}
        </span>
        <span className="mt-1 block text-xs leading-snug text-muted-foreground">{subtitle}</span>
      </span>
      {active
        ? <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground [&_svg]:size-3"><Check strokeWidth={3} /></span>
        : <ArrowRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />}
    </motion.button>
  );
}

export function ExerciseEditor({ exerciseId, initial, planMode = false, onClose, onSaved }: {
  exerciseId?: string;
  initial?: Partial<ExerciseInfo>;
  planMode?: boolean;
  onClose: () => void;
  onSaved: (id?: string) => void;
}) {
  // Read both capabilities through the registry mirror of `gateFeature`, not raw
  // entitlement fields: `/api/exercises/search-external` is gated on
  // `externalSearch`, so promoting the web-search hero when THAT is off too just
  // moved the 403 to the most prominent control on the screen.
  const canAi = useCan("aiSuite");
  const canWeb = useCan("externalExerciseSearch");
  const startAtChoose = !exerciseId;

  const [step, setStep] = useState<"choose" | "review">(exerciseId ? "review" : "choose");
  const [editId, setEditId] = useState<string | undefined>(exerciseId);
  const [name, setName] = useState(initial?.name ?? "");
  const [muscles, setMuscles] = useState<string[]>(splitCsv(initial?.muscle_groups));
  const [secondary, setSecondary] = useState<string[]>(splitCsv(initial?.secondary_muscle_groups));
  const [equipment, setEquipment] = useState<string[]>(splitCsv(initial?.equipment));
  const [difficulty, setDifficulty] = useState<(typeof DIFFICULTIES)[number] | null>((initial?.difficulty as (typeof DIFFICULTIES)[number]) ?? null);
  const [force, setForce] = useState<(typeof FORCES)[number] | null>(null);
  const [mechanic, setMechanic] = useState<(typeof MECHANICS)[number] | null>(null);
  const [instructions, setInstructions] = useState(initial?.instructions_md ?? "");
  const [image, setImage] = useState(initial?.thumb_url ?? "");
  const [image2, setImage2] = useState(initial?.thumb2_url ?? "");
  const [video, setVideo] = useState(initial?.video_url ?? "");
  const [videoBusy, setVideoBusy] = useState(false);
  const [guideBusy, setGuideBusy] = useState(false);
  const [pairBusy, setPairBusy] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [altOpen, setAltOpen] = useState(false);

  // Web search — driven by the exercise-name field (no separate query box).
  const [webMode, setWebMode] = useState(false);
  const [webResults, setWebResults] = useState<WebExercise[] | null>(null);
  const [webBusy, setWebBusy] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  useEffect(() => {
    if (!webMode) return;
    const q = name.trim();
    if (q.length < 2) { setWebResults(null); return; }
    const t = setTimeout(() => {
      setWebBusy(true);
      api.get<{ exercises: WebExercise[] }>(`/api/exercises/search-external?q=${encodeURIComponent(q)}`)
        .then((r) => setWebResults(r.exercises)).catch(() => setWebResults([])).finally(() => setWebBusy(false));
    }, 350);
    return () => clearTimeout(t);
  }, [webMode, name]);

  const errText = (e: unknown) => {
    const detail = e instanceof ApiError ? (e.body?.detail as string | undefined) : undefined;
    const m = e instanceof Error ? e.message : "";
    return m.includes("credits") ? "Out of AI credits." : detail ? `Failed: ${detail}` : "Couldn't do that — try again.";
  };

  const applyMeta = (m: ExerciseMetaResult) => {
    if (m.primaryMuscles?.length) setMuscles(m.primaryMuscles);
    if (m.secondaryMuscles?.length) setSecondary(m.secondaryMuscles);
    if (m.equipment?.length) setEquipment(m.equipment);
    if (m.difficulty) setDifficulty(m.difficulty as (typeof DIFFICULTIES)[number]);
    if (m.force) setForce(m.force as (typeof FORCES)[number]);
    if (m.mechanic) setMechanic(m.mechanic as (typeof MECHANICS)[number]);
  };

  const genMeta = async () => { const r = await api.post<{ meta: ExerciseMetaResult }>("/api/ai/exercise-meta", { name: name.trim() }); applyMeta(r.meta); };
  const genGuide = async () => { const r = await api.post<{ guide: string }>("/api/ai/exercise-guide", { name: name.trim(), muscleGroups: muscles, equipment }); if (r.guide) setInstructions(r.guide); };
  const genPair = async () => { const r = await api.post<{ url: string }>("/api/ai/generate-image", { feature: "exercise-image", subject: name.trim(), pair: true }); const { startUrl, endUrl } = await splitWideImageToHalves(r.url); setImage(startUrl); setImage2(endUrl); };

  // "With AI": fill everything from the name, then land on review.
  const startWithAi = async () => {
    if (name.trim().length < 2) return;
    setAutoBusy(true); setGuideBusy(true); setPairBusy(true); setErr(null);
    setStep("review");
    const results = await Promise.allSettled([genMeta(), genGuide().finally(() => setGuideBusy(false)), genPair().finally(() => setPairBusy(false))]);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    if (failed) setErr(errText(failed.reason));
    setGuideBusy(false); setPairBusy(false); setAutoBusy(false);
  };

  const runGuide = async () => { setGuideBusy(true); setErr(null); try { await genGuide(); } catch (e) { setErr(errText(e)); } finally { setGuideBusy(false); } };
  const runPair = async () => { setPairBusy(true); setErr(null); try { await genPair(); } catch (e) { setErr(errText(e)); } finally { setPairBusy(false); } };

  // Pick a provider result → import it (dedup + brings its images) → review.
  const pickWeb = async (e: WebExercise) => {
    setImporting(e.sourceId); setErr(null);
    try {
      const { id } = await api.post<{ id: string }>("/api/exercises/import", { name: e.name, muscleGroups: e.muscleGroups, secondaryMuscleGroups: e.secondaryMuscleGroups ?? [], equipment: e.equipment, instructions: e.instructions ?? null, force: e.force ?? null, difficulty: e.difficulty ?? null, imageUrl: e.imageUrl, imageUrl2: e.imageUrl2 ?? null, source: e.source, sourceId: e.sourceId });
      setEditId(id);
      setName(e.name);
      setMuscles(e.muscleGroups.map((m) => m.toLowerCase()));
      setSecondary((e.secondaryMuscleGroups ?? []).map((m) => m.toLowerCase()));
      setEquipment(e.equipment.map((x) => x.toLowerCase()));
      if (e.difficulty && (DIFFICULTIES as readonly string[]).includes(e.difficulty)) setDifficulty(e.difficulty as (typeof DIFFICULTIES)[number]);
      if (e.instructions) setInstructions(e.instructions);
      setImage(e.imageUrl ?? "");
      setImage2(e.imageUrl2 ?? "");
      setStep("review");
    } catch (er) { setErr(errText(er)); } finally { setImporting(null); }
  };

  const uploadVideo = async (file: File) => {
    setVideoBusy(true); setErr(null);
    try {
      const key = await uploadMedia(file, "exercise");
      setVideo(`/api/media/${key}`);
    } catch (e) { setErr(errText(e)); } finally { setVideoBusy(false); }
  };

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const body = { name: name.trim(), muscleGroups: muscles, secondaryMuscleGroups: secondary, equipment, difficulty, force, mechanic, instructionsMd: instructions.trim() || null, thumbUrl: image || null, thumb2Url: image2 || null, videoUrl: video || null, visibility: "tenant" as const };
      let id = editId;
      if (id) await api.patch(`/api/exercises/${id}`, body);
      else id = (await api.post<{ id: string }>("/api/exercises", body)).id;
      onSaved(id);
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };

  const closeX = <button onClick={onClose} aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground [&_svg]:size-[1.15rem]"><X /></button>;
  const title = step === "choose" ? "New exercise" : editId && !startAtChoose ? "Edit exercise" : "Review exercise";
  const cta = planMode ? "Add to plan" : editId ? "Update exercise" : "Add to library";

  const footer = step === "review" ? (
    <Button size="lg" className="w-full" disabled={busy || name.trim().length < 2} onClick={() => void save()}>{busy ? "Saving…" : cta}</Button>
  ) : null;

  return (
    <>
      <FixedDrawer open onClose={onClose} dismissible={false} title={title} headerAction={closeX} footer={footer}>
        <StepFade stepKey={step}>
        {step === "choose" ? (
          <div className="space-y-4">
            <Field label="Exercise name" icon={Dumbbell} value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Barbell Back Squat" />
            {/* One full-width hero + a single-column list of secondary rows. The
                hero is always present (AI when entitled, else Web search) and the
                secondary rows stack vertically, so the layout never jumps when
                the AI entitlement is off — it just swaps which path is featured. */}
            <div className="space-y-2.5">
              {canAi ? (
                <HeroChoice icon={AiAvatar} tone="primary" badge="AI" title="Create with AI" subtitle="Name it — AI fills the muscles, equipment, how-to guide & start/end demo frames." busy={autoBusy} disabled={name.trim().length < 2} onClick={() => void startWithAi()} />
              ) : canWeb ? (
                <HeroChoice icon={Globe} tone="cardio" title="Search exercise libraries" subtitle="Import a ready-made exercise — muscles, images & instructions — from wger, free-exercise-db & more." active={webMode} onClick={() => setWebMode((v) => !v)} />
              ) : (
                <HeroChoice icon={PencilLine} tone="neutral" title="Enter it manually" subtitle="Fill in the name, muscles, equipment and how-to yourself." disabled={name.trim().length < 2} onClick={() => setStep("review")} />
              )}
              <div className="space-y-2">
                {canAi && canWeb && <ModeRow icon={Globe} tone="cardio" label="Web search" hint="Import from wger, free-exercise-db & more" active={webMode} onClick={() => setWebMode((v) => !v)} />}
                {(canAi || canWeb) && <ModeRow icon={PencilLine} tone="neutral" label="Enter it manually" hint="Fill in the details yourself" disabled={name.trim().length < 2} onClick={() => setStep("review")} />}
              </div>
            </div>

            {webMode && canWeb && (
              <div className="space-y-2 rounded-2xl border border-border/50 p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5"><Search /> Results for “{name.trim() || "…"}” from wger, free-exercise-db…</div>
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {name.trim().length < 2 && <p className="p-3 text-center text-sm text-muted-foreground">Type an exercise name above to search.</p>}
                  {webBusy && <p className="p-3 text-center text-sm text-muted-foreground">Searching…</p>}
                  {webResults?.map((e) => (
                    <button key={e.sourceId} disabled={!!importing} onClick={() => void pickWeb(e)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-secondary disabled:opacity-60">
                      <Thumb src={e.imageUrl} fallback={Dumbbell} size={40} />
                      <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{e.name}</div><div className="truncate text-xs text-muted-foreground">{[e.muscleGroups.join(", "), e.source].filter(Boolean).join(" · ")}</div></div>
                      {importing === e.sourceId ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Plus className="size-4 shrink-0 text-primary" />}
                    </button>
                  ))}
                  {webResults && webResults.length === 0 && !webBusy && <p className="p-3 text-center text-sm text-muted-foreground">No results — try another term or use AI/Manual.</p>}
                </div>
              </div>
            )}
            {err && <p className="text-sm text-warning">{err}</p>}
          </div>
        ) : (
          <div className="space-y-6">
            {startAtChoose && <button onClick={() => setStep("choose")} className="-mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground [&_svg]:size-4"><ArrowLeft /> Back</button>}
            <Field label="Name" icon={Dumbbell} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Barbell Back Squat" />

            {/* Demo — the animated start/end frames, plus an optional video. The
                AI pair-generate reads as a first-class smart affordance. */}
            <div className="space-y-3">
              <SectionLabel>Demo</SectionLabel>
              <div className="grid grid-cols-2 gap-3">
                <AiImageField value={image} onChange={setImage} feature="exercise-image" subject={name} canAi={false} label="Start" stacked loading={pairBusy} />
                <AiImageField value={image2} onChange={setImage2} feature="exercise-image" subject={name} canAi={false} label="End" stacked loading={pairBusy} />
              </div>
              {canAi && (
                <Button variant="tonal" size="sm" className="w-full" disabled={pairBusy || name.trim().length < 2} onClick={() => void runPair()}>
                  <AiAvatar className="size-5" /> {pairBusy ? "Creating both frames…" : image || image2 ? "Regenerate start & end frames" : "Generate start & end frames"}
                </Button>
              )}
              {video ? (
                <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                  <Play className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">Demo video attached</span>
                  <button onClick={() => setVideo("")} aria-label="Remove video" className="grid size-7 place-items-center rounded-full text-muted-foreground hover:text-danger [&_svg]:size-4"><X /></button>
                </div>
              ) : (
                <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-secondary px-3.5 text-sm font-medium transition-colors hover:bg-surface-3 [&_svg]:size-4">
                  {videoBusy ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Play />}
                  {videoBusy ? "Uploading…" : "Upload demo video"}
                  <input type="file" accept="video/mp4,video/webm" className="hidden" disabled={videoBusy} onChange={(e) => e.target.files?.[0] && void uploadVideo(e.target.files[0])} />
                </label>
              )}
            </div>

            {/* Classification — muscles, equipment, and the movement tags. */}
            <div className="space-y-3">
              <SectionLabel>Muscles & equipment</SectionLabel>
              <div className="space-y-1.5"><div className="text-xs text-muted-foreground">Primary muscles</div><ChipStrip options={MUSCLE_GROUPS} selected={muscles} onChange={setMuscles} /></div>
              <div className="space-y-1.5"><div className="text-xs text-muted-foreground">Secondary muscles</div><ChipStrip options={MUSCLE_GROUPS} selected={secondary} onChange={setSecondary} /></div>
              <div className="space-y-1.5"><div className="text-xs text-muted-foreground">Equipment</div><ChipStrip options={EQUIPMENT_TYPES} selected={equipment} onChange={setEquipment} /></div>
              <div className="grid grid-cols-3 gap-3 pt-0.5">
                <div className="space-y-1.5"><div className="text-xs text-muted-foreground">Difficulty</div><div className="flex flex-wrap gap-1.5">{DIFFICULTIES.map((d) => <Chip key={d} selected={difficulty === d} onClick={() => setDifficulty(difficulty === d ? null : d)}>{d.slice(0, 4)}</Chip>)}</div></div>
                <div className="space-y-1.5"><div className="text-xs text-muted-foreground">Force</div><div className="flex flex-wrap gap-1.5">{FORCES.map((x) => <Chip key={x} selected={force === x} onClick={() => setForce(force === x ? null : x)}>{x}</Chip>)}</div></div>
                <div className="space-y-1.5"><div className="text-xs text-muted-foreground">Mechanic</div><div className="flex flex-wrap gap-1.5">{MECHANICS.map((x) => <Chip key={x} selected={mechanic === x} onClick={() => setMechanic(mechanic === x ? null : x)}>{x.slice(0, 4)}</Chip>)}</div></div>
              </div>
            </div>

            {/* Instructions — the how-to guide, with an AI writer. */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <SectionLabel>How to perform it</SectionLabel>
                {canAi && <Button size="sm" variant="tonal" disabled={guideBusy || name.trim().length < 2} onClick={() => void runGuide()}><AiAvatar className="size-5" /> {guideBusy ? "Writing…" : instructions.trim() ? "Rewrite with AI" : "Write with AI"}</Button>}
              </div>
              <Textarea rows={5} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Setup, steps, coaching cues… or generate with AI." />
            </div>

            {editId && <button onClick={() => setAltOpen(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary [&_svg]:size-4"><ArrowLeft className="rotate-180" /> Manage alternatives</button>}
            {err && <p className="text-sm text-warning">{err}</p>}
          </div>
        )}
        </StepFade>
      </FixedDrawer>

      {altOpen && editId && <AlternativesSheet exerciseId={editId} exerciseName={name} onClose={() => setAltOpen(false)} />}
    </>
  );
}

/** Bind an exercise's instant-swap alternatives (SPEC §8.3), two-way. */
function AlternativesSheet({ exerciseId, exerciseName, onClose }: { exerciseId: string; exerciseName: string; onClose: () => void }) {
  const [alts, setAlts] = useState<ExerciseInfo[] | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ExerciseInfo[]>([]);
  const load = useCallback(async () => setAlts((await api.get<{ alternatives: ExerciseInfo[] }>(`/api/exercises/${exerciseId}/alternatives`)).alternatives), [exerciseId]);
  /**
   * Browse, don't interrogate.
   *
   * This used to require two typed characters before it fetched anything, so
   * opening "Manage alternatives" showed an EMPTY list under a search box — and
   * a coach with a full library reasonably read that as "my exercises aren't
   * showing". `GET /api/exercises` with no `q` already returns the studio's
   * library plus the platform seed, so the empty query is the useful one.
   */
  const search = useCallback(async (v: string) => {
    const qs = v.trim() ? `?q=${encodeURIComponent(v.trim())}` : "";
    setResults((await api.get<{ exercises: ExerciseInfo[] }>(`/api/exercises${qs}`)).exercises.filter((e) => e.id !== exerciseId));
  }, [exerciseId]);
  const onQuery = (v: string) => { setQ(v); void search(v); };
  const add = async (id: string) => { await api.post(`/api/exercises/${exerciseId}/alternatives`, { exerciseId: id }); setQ(""); await load(); await search(""); };
  const remove = async (id: string) => { await api.del(`/api/exercises/${exerciseId}/alternatives/${id}`); await load(); await search(""); };
  /**
   * `void load()` used to sit in the RENDER BODY, guarded by `alts === null`.
   * A fetch during render is not just a style violation: every render while the
   * request was in flight fired another one, so opening the sheet issued a burst
   * of identical requests and the component re-rendered against each reply.
   */
  useEffect(() => { void load(); void search(""); }, [load, search]);
  const altIds = new Set((alts ?? []).map((a) => a.id));
  return (
    <Sheet open onClose={onClose} title={`Alternatives · ${exerciseName}`}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Bound alternatives let clients swap instantly — no approval. Binding is two-way.</p>
        {alts === null ? null : alts.length === 0 ? <p className="text-sm text-muted-foreground">No alternatives yet.</p> : (
          <div className="space-y-1">{alts.map((a) => (
            <div key={a.id} className="rounded-xl bg-surface-2 px-2.5 py-2">
              <ExerciseRow ex={a} thumbSize={36} trailing={
                <button onClick={() => void remove(a.id)} aria-label="Remove" className="text-muted-foreground hover:text-danger [&_svg]:size-4"><Trash2 /></button>
              } />
            </div>
          ))}</div>
        )}
        <div className="border-t border-border/50 pt-3">
          <Field label="Add an alternative" icon={Search} value={q} onChange={(e) => onQuery(e.target.value)} placeholder="Search your library" />
          <div className="mt-1 max-h-56 space-y-1 overflow-y-auto">
            {results.filter((e) => !altIds.has(e.id)).map((e) => (
              <button key={e.id} onClick={() => void add(e.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-secondary">
                <ExerciseRow ex={e} thumbSize={34} meta={false} trailing={<Plus className="size-4 shrink-0 text-primary" />} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
