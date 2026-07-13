/**
 * ExerciseEditor — create or edit a library exercise. Creation is name-first:
 * type the name, hit "Generate with AI", and the model fills the muscles,
 * equipment, difficulty/force/mechanic, a full how-to guide, AND the start/end
 * images (one wide render split in two). Everything stays editable — muscles &
 * equipment are multi-select chips, images upload-or-generate. Platform-seed
 * rows are read-only server-side, so editing one saves a tenant-owned copy.
 */

import { useState } from "react";
import { Button, Field, Textarea, Sheet, Chip, cn, Dumbbell, Play, X, Sparkles } from "@mossa/ui";
import { MUSCLE_GROUPS, EQUIPMENT_TYPES } from "@mossa/protocol";
import { api, ApiError } from "../../api.js";
import { useSession } from "../../session.js";
import { AiImageField } from "../../AiImageField.js";
import { splitWideImageToHalves } from "../../imageSplit.js";
import type { ExerciseInfo } from "../exercise.js";

const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
const FORCES = ["push", "pull", "static"] as const;
const MECHANICS = ["compound", "isolation"] as const;
const splitCsv = (s?: string | null) => (s ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
const pretty = (s: string) => s.replace(/^\w/, (c) => c.toUpperCase());

interface ExerciseMeta {
  primaryMuscles: string[]; secondaryMuscles: string[]; equipment: string[];
  difficulty: string | null; force: string | null; mechanic: string | null;
}

/** Multi-select chip row. Options = the fixed taxonomy plus any current
 *  selections that fall outside it (so imported values are never lost). */
function ChipMulti({ options, selected, onChange }: { options: readonly string[]; selected: string[]; onChange: (v: string[]) => void }) {
  const all = [...new Set([...options, ...selected])];
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {all.map((o) => <Chip key={o} selected={selected.includes(o)} onClick={() => toggle(o)}>{pretty(o)}</Chip>)}
    </div>
  );
}

export function ExerciseEditor({ exerciseId, initial, onClose, onSaved }: {
  /** When set, PATCH this tenant-owned exercise; otherwise POST a new one. */
  exerciseId?: string;
  initial?: Partial<ExerciseInfo>;
  onClose: () => void;
  onSaved: () => void;
}) {
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
  const { ctx } = useSession();
  const canAi = !!ctx?.entitlements?.features?.aiSuite;

  const errText = (e: unknown) => {
    const detail = e instanceof ApiError ? (e.body?.detail as string | undefined) : undefined;
    const m = e instanceof Error ? e.message : "";
    return m.includes("credits") ? "Out of AI credits." : detail ? `Failed: ${detail}` : "Couldn't generate — try again.";
  };

  const generateMeta = async () => {
    const r = await api.post<{ meta: ExerciseMeta }>("/api/ai/exercise-meta", { name: name.trim() });
    const m = r.meta;
    if (m.primaryMuscles?.length) setMuscles(m.primaryMuscles);
    if (m.secondaryMuscles?.length) setSecondary(m.secondaryMuscles);
    if (m.equipment?.length) setEquipment(m.equipment);
    if (m.difficulty) setDifficulty(m.difficulty as (typeof DIFFICULTIES)[number]);
    if (m.force) setForce(m.force as (typeof FORCES)[number]);
    if (m.mechanic) setMechanic(m.mechanic as (typeof MECHANICS)[number]);
  };

  const generateGuide = async () => {
    const r = await api.post<{ guide: string }>("/api/ai/exercise-guide", { name: name.trim(), muscleGroups: muscles, equipment });
    if (r.guide) setInstructions(r.guide);
  };

  const generatePair = async () => {
    const r = await api.post<{ url: string }>("/api/ai/generate-image", { feature: "exercise-image", subject: name.trim(), pair: true });
    const { startUrl, endUrl } = await splitWideImageToHalves(r.url);
    setImage(startUrl); setImage2(endUrl);
  };

  // Name-first: fill everything at once. Each part runs in parallel; a failure
  // in one doesn't block the others, and the first error is surfaced.
  const generateEverything = async () => {
    if (name.trim().length < 2) return;
    setAutoBusy(true); setGuideBusy(true); setPairBusy(true); setErr(null);
    const results = await Promise.allSettled([
      generateMeta(),
      generateGuide().finally(() => setGuideBusy(false)),
      generatePair().finally(() => setPairBusy(false)),
    ]);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    if (failed) setErr(errText(failed.reason));
    setGuideBusy(false); setPairBusy(false); setAutoBusy(false);
  };

  const runGuide = async () => { setGuideBusy(true); setErr(null); try { await generateGuide(); } catch (e) { setErr(errText(e)); } finally { setGuideBusy(false); } };
  const runPair = async () => { setPairBusy(true); setErr(null); try { await generatePair(); } catch (e) { setErr(errText(e)); } finally { setPairBusy(false); } };

  const uploadVideo = async (file: File) => {
    setVideoBusy(true);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("purpose", "exercise");
      const up = await fetch("/api/media/upload", { method: "POST", credentials: "include", body: fd });
      const { key } = (await up.json()) as { key?: string };
      if (key) setVideo(`/api/media/${key}`);
    } finally { setVideoBusy(false); }
  };

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        name: name.trim(), muscleGroups: muscles, secondaryMuscleGroups: secondary, equipment,
        difficulty, force, mechanic, instructionsMd: instructions.trim() || null,
        thumbUrl: image || null, thumb2Url: image2 || null, videoUrl: video || null, visibility: "tenant" as const,
      };
      if (exerciseId) await api.patch(`/api/exercises/${exerciseId}`, body);
      else await api.post("/api/exercises", body);
      onSaved();
    } finally { setBusy(false); }
  };

  return (
    <Sheet open onClose={onClose} title={exerciseId ? "Edit exercise" : "New exercise"}>
      <div className="space-y-4">
        <Field label="Name" icon={Dumbbell} value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Barbell Back Squat" />

        {/* Name-first: one tap fills muscles, equipment, guide + images. */}
        {canAi && (
          <div className="space-y-1">
            <Button size="lg" className="w-full" disabled={autoBusy || name.trim().length < 2} onClick={() => void generateEverything()}>
              <Sparkles /> {autoBusy ? "Generating everything…" : "Generate everything with AI"}
            </Button>
            <p className="text-[0.7rem] leading-snug text-muted-foreground">Fills the details, a full how-to, and the start/end images from the name. Everything stays editable. Style is set in AI settings.</p>
            {err && <p className="text-xs text-warning">{err}</p>}
          </div>
        )}

        {/* Start + end frames */}
        <div className="grid grid-cols-2 gap-3">
          <AiImageField value={image} onChange={setImage} feature="exercise-image" subject={name} canAi={false} label="Start" stacked loading={pairBusy} contain />
          <AiImageField value={image2} onChange={setImage2} feature="exercise-image" subject={name} canAi={false} label="End" stacked loading={pairBusy} contain />
        </div>
        {canAi && (
          <Button variant="secondary" size="sm" className="w-full" disabled={pairBusy || name.trim().length < 2} onClick={() => void runPair()}>
            <Sparkles /> {pairBusy ? "Creating both frames…" : image || image2 ? "Regenerate start & end" : "Generate start & end"}
          </Button>
        )}

        {/* Demo video */}
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

        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Primary muscles</div>
          <ChipMulti options={MUSCLE_GROUPS} selected={muscles} onChange={setMuscles} />
        </div>
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Secondary muscles</div>
          <ChipMulti options={MUSCLE_GROUPS} selected={secondary} onChange={setSecondary} />
        </div>
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Equipment</div>
          <ChipMulti options={EQUIPMENT_TYPES} selected={equipment} onChange={setEquipment} />
        </div>

        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Difficulty</div>
          <div className="flex flex-wrap gap-2">{DIFFICULTIES.map((d) => <Chip key={d} selected={difficulty === d} onClick={() => setDifficulty(difficulty === d ? null : d)}>{d}</Chip>)}</div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Force</div>
            <div className="flex flex-wrap gap-2">{FORCES.map((x) => <Chip key={x} selected={force === x} onClick={() => setForce(force === x ? null : x)}>{x}</Chip>)}</div>
          </div>
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Mechanic</div>
            <div className="flex flex-wrap gap-2">{MECHANICS.map((x) => <Chip key={x} selected={mechanic === x} onClick={() => setMechanic(mechanic === x ? null : x)}>{x}</Chip>)}</div>
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">How to perform it</span>
            {canAi && (
              <Button size="sm" variant="tonal" disabled={guideBusy || name.trim().length < 2} onClick={() => void runGuide()}>
                <Sparkles /> {guideBusy ? "Writing…" : instructions.trim() ? "Rewrite" : "Generate"}
              </Button>
            )}
          </div>
          <Textarea rows={7} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Setup, steps, coaching cues… or generate with AI." />
        </div>

        <Button size="lg" className={cn("w-full", busy && "opacity-80")} disabled={busy || name.trim().length < 2} onClick={() => void save()}>
          {busy ? "Saving…" : exerciseId ? "Save changes" : "Add to library"}
        </Button>
      </div>
    </Sheet>
  );
}
