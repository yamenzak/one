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

import { useEffect, useState } from "react";
import { FixedDrawer, Button, Field, Textarea, Sheet, Chip, Dumbbell, Play, X, Sparkles, Globe, PencilLine, ArrowLeft, Search, Plus, Trash2 } from "@mossa/ui";
import { MUSCLE_GROUPS, EQUIPMENT_TYPES } from "@mossa/protocol";
import { api, ApiError, uploadMedia } from "../../api.js";
import { useSession } from "../../session.js";
import { AiImageField } from "../../AiImageField.js";
import { splitWideImageToHalves } from "../../imageSplit.js";
import { ModeCard, StepFade } from "../../composer.js";
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

export function ExerciseEditor({ exerciseId, initial, planMode = false, onClose, onSaved }: {
  exerciseId?: string;
  initial?: Partial<ExerciseInfo>;
  planMode?: boolean;
  onClose: () => void;
  onSaved: (id?: string) => void;
}) {
  const { ctx } = useSession();
  const canAi = !!ctx?.entitlements?.features?.aiSuite;
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
            <div className="grid grid-cols-3 gap-2">
              {canAi && <ModeCard icon={Sparkles} tone="primary" label="With AI" hint="Fill everything" busy={autoBusy} disabled={name.trim().length < 2} onClick={() => void startWithAi()} />}
              <ModeCard icon={Globe} tone="cardio" label="Web search" hint="From libraries" active={webMode} onClick={() => setWebMode((v) => !v)} />
              <ModeCard icon={PencilLine} tone="neutral" label="Manual" hint="Enter it yourself" disabled={name.trim().length < 2} onClick={() => setStep("review")} />
            </div>

            {webMode && (
              <div className="space-y-2 rounded-2xl border border-border/50 p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5"><Search /> Results for “{name.trim() || "…"}” from wger, free-exercise-db…</div>
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {name.trim().length < 2 && <p className="p-3 text-center text-sm text-muted-foreground">Type an exercise name above to search.</p>}
                  {webBusy && <p className="p-3 text-center text-sm text-muted-foreground">Searching…</p>}
                  {webResults?.map((e) => (
                    <button key={e.sourceId} disabled={!!importing} onClick={() => void pickWeb(e)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-secondary disabled:opacity-60">
                      <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-2">{e.imageUrl ? <img src={e.imageUrl} alt="" className="size-full object-cover" /> : <Dumbbell className="size-4 text-muted-foreground" />}</div>
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
          <div className="space-y-4">
            {startAtChoose && <button onClick={() => setStep("choose")} className="inline-flex items-center gap-1 text-sm text-muted-foreground [&_svg]:size-4"><ArrowLeft /> Back</button>}
            <Field label="Name" icon={Dumbbell} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Barbell Back Squat" />

            <div className="grid grid-cols-2 gap-3">
              <AiImageField value={image} onChange={setImage} feature="exercise-image" subject={name} canAi={false} label="Start" stacked loading={pairBusy} contain />
              <AiImageField value={image2} onChange={setImage2} feature="exercise-image" subject={name} canAi={false} label="End" stacked loading={pairBusy} contain />
            </div>
            {canAi && (
              <Button variant="secondary" size="sm" className="w-full" disabled={pairBusy || name.trim().length < 2} onClick={() => void runPair()}>
                <Sparkles /> {pairBusy ? "Creating both frames…" : image || image2 ? "Regenerate start & end" : "Generate start & end"}
              </Button>
            )}

            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">Demo video (optional)</div>
              {video ? (
                <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                  <Play className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">Video attached</span>
                  <button onClick={() => setVideo("")} aria-label="Remove video" className="grid size-7 place-items-center rounded-full text-muted-foreground hover:text-danger [&_svg]:size-4"><X /></button>
                </div>
              ) : (
                <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-secondary px-3.5 text-sm font-medium transition-colors hover:bg-surface-3 [&_svg]:size-4">
                  {videoBusy ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Play />}
                  {videoBusy ? "Uploading…" : "Upload video"}
                  <input type="file" accept="video/mp4,video/webm" className="hidden" disabled={videoBusy} onChange={(e) => e.target.files?.[0] && void uploadVideo(e.target.files[0])} />
                </label>
              )}
            </div>

            <div className="space-y-1.5"><div className="text-xs text-muted-foreground">Primary muscles</div><ChipStrip options={MUSCLE_GROUPS} selected={muscles} onChange={setMuscles} /></div>
            <div className="space-y-1.5"><div className="text-xs text-muted-foreground">Secondary muscles</div><ChipStrip options={MUSCLE_GROUPS} selected={secondary} onChange={setSecondary} /></div>
            <div className="space-y-1.5"><div className="text-xs text-muted-foreground">Equipment</div><ChipStrip options={EQUIPMENT_TYPES} selected={equipment} onChange={setEquipment} /></div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><div className="text-xs text-muted-foreground">Difficulty</div><div className="flex flex-wrap gap-1.5">{DIFFICULTIES.map((d) => <Chip key={d} selected={difficulty === d} onClick={() => setDifficulty(difficulty === d ? null : d)}>{d.slice(0, 4)}</Chip>)}</div></div>
              <div className="space-y-1.5"><div className="text-xs text-muted-foreground">Force</div><div className="flex flex-wrap gap-1.5">{FORCES.map((x) => <Chip key={x} selected={force === x} onClick={() => setForce(force === x ? null : x)}>{x}</Chip>)}</div></div>
              <div className="space-y-1.5"><div className="text-xs text-muted-foreground">Mechanic</div><div className="flex flex-wrap gap-1.5">{MECHANICS.map((x) => <Chip key={x} selected={mechanic === x} onClick={() => setMechanic(mechanic === x ? null : x)}>{x.slice(0, 4)}</Chip>)}</div></div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">How to perform it</span>
                {canAi && <Button size="sm" variant="tonal" disabled={guideBusy || name.trim().length < 2} onClick={() => void runGuide()}><Sparkles /> {guideBusy ? "Writing…" : instructions.trim() ? "Rewrite" : "Generate"}</Button>}
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
  const load = async () => setAlts((await api.get<{ alternatives: ExerciseInfo[] }>(`/api/exercises/${exerciseId}/alternatives`)).alternatives);
  const search = async (v: string) => { setQ(v); if (v.trim().length < 2) { setResults([]); return; } setResults((await api.get<{ exercises: ExerciseInfo[] }>(`/api/exercises?q=${encodeURIComponent(v)}`)).exercises.filter((e) => e.id !== exerciseId)); };
  const add = async (id: string) => { await api.post(`/api/exercises/${exerciseId}/alternatives`, { exerciseId: id }); setQ(""); setResults([]); await load(); };
  const remove = async (id: string) => { await api.del(`/api/exercises/${exerciseId}/alternatives/${id}`); await load(); };
  if (alts === null) void load();
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
          <Field label="Add an alternative" icon={Search} value={q} onChange={(e) => void search(e.target.value)} />
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
