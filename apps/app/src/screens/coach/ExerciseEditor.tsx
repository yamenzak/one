/**
 * ExerciseEditor — create or edit a library exercise, with a photo/thumbnail,
 * muscles, equipment, difficulty and instructions. The workout-library analog
 * of FoodEditor: staff shoot or upload an image (stored via /api/media with
 * purpose "exercise" → thumb_url) and edit their own exercises. Platform-seed
 * rows are read-only on the server, so editing one saves a tenant-owned copy.
 */

import { useState } from "react";
import { Button, Field, Textarea, Sheet, Chip, Dumbbell, Play, X, Sparkles } from "@mossa/ui";
import { api, ApiError } from "../../api.js";
import { useSession } from "../../session.js";
import { AiImageField } from "../../AiImageField.js";
import type { ExerciseInfo } from "../exercise.js";

const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
const FORCES = ["push", "pull", "static"] as const;
const MECHANICS = ["compound", "isolation"] as const;
const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export function ExerciseEditor({ exerciseId, initial, onClose, onSaved }: {
  /** When set, PATCH this tenant-owned exercise; otherwise POST a new one. */
  exerciseId?: string;
  initial?: Partial<ExerciseInfo>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [muscles, setMuscles] = useState((initial?.muscle_groups ?? "").replace(/,/g, ", "));
  const [secondary, setSecondary] = useState((initial?.secondary_muscle_groups ?? "").replace(/,/g, ", "));
  const [equipment, setEquipment] = useState((initial?.equipment ?? "").replace(/,/g, ", "));
  const [difficulty, setDifficulty] = useState<(typeof DIFFICULTIES)[number] | null>((initial?.difficulty as (typeof DIFFICULTIES)[number]) ?? null);
  const [force, setForce] = useState<(typeof FORCES)[number] | null>(null);
  const [mechanic, setMechanic] = useState<(typeof MECHANICS)[number] | null>(null);
  const [instructions, setInstructions] = useState(initial?.instructions_md ?? "");
  const [image, setImage] = useState(initial?.thumb_url ?? "");
  const [image2, setImage2] = useState(initial?.thumb2_url ?? "");
  const [video, setVideo] = useState(initial?.video_url ?? "");
  const [videoBusy, setVideoBusy] = useState(false);
  const [guideBusy, setGuideBusy] = useState(false);
  const [guideErr, setGuideErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { ctx } = useSession();
  const canAi = !!ctx?.entitlements?.features?.aiSuite;

  const generateGuide = async () => {
    if (name.trim().length < 2) return;
    setGuideBusy(true); setGuideErr(null);
    try {
      const r = await api.post<{ guide: string }>("/api/ai/exercise-guide", { name: name.trim(), muscleGroups: split(muscles), equipment: split(equipment) });
      if (r.guide) setInstructions(r.guide);
      else setGuideErr("The AI returned nothing — try again.");
    } catch (e) {
      const detail = e instanceof ApiError ? (e.body?.detail as string | undefined) : undefined;
      const m = e instanceof Error ? e.message : "";
      setGuideErr(m.includes("credits") ? "Out of AI credits." : detail ? `Failed: ${detail}` : "Couldn't generate — try again.");
    } finally { setGuideBusy(false); }
  };

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
        name: name.trim(), muscleGroups: split(muscles), secondaryMuscleGroups: split(secondary),
        equipment: split(equipment), difficulty, force, mechanic,
        instructionsMd: instructions.trim() || null, thumbUrl: image || null, thumb2Url: image2 || null,
        videoUrl: video || null, visibility: "tenant" as const,
      };
      if (exerciseId) await api.patch(`/api/exercises/${exerciseId}`, body);
      else await api.post("/api/exercises", body);
      onSaved();
    } finally { setBusy(false); }
  };

  return (
    <Sheet open onClose={onClose} title={exerciseId ? "Edit exercise" : "New exercise"}>
      <div className="space-y-4">
        <Field label="Name" icon={Dumbbell} value={name} onChange={(e) => setName(e.target.value)} autoFocus />

        {/* Start + end frames — upload or generate. The End is generated from
            the Start image so the same athlete, style and angle carry over. */}
        <div className="grid grid-cols-2 gap-3">
          <AiImageField value={image} onChange={setImage} feature="exercise-image" subject={name} hint="the STARTING / setup position, standing ready just before the rep begins" canAi={canAi} label="Start" stacked />
          <AiImageField value={image2} onChange={setImage2} feature="exercise-image" subject={name} hint="the PEAK-CONTRACTION / finished position at the hardest point of the rep, with the joints fully flexed and CLEARLY different from the setup (e.g. a curl with the bar raised to the shoulders, a squat at the bottom with hips below the knees, a press with arms extended overhead)" canAi={canAi} label="End" stacked referenceUrl={image || undefined} />
        </div>
        {canAi && <p className="-mt-1 text-[0.7rem] leading-snug text-muted-foreground">Generate the Start first — the End is drawn from it to keep the same figure, style and angle. Style is configurable in AI settings.</p>}

        {/* Optional demo video */}
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

        <div className="grid grid-cols-1 gap-3">
          <Field label="Primary muscles (comma-separated)" value={muscles} onChange={(e) => setMuscles(e.target.value)} placeholder="chest, triceps" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Secondary" value={secondary} onChange={(e) => setSecondary(e.target.value)} placeholder="shoulders" />
            <Field label="Equipment" value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="barbell" />
          </div>
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
              <Button size="sm" variant="tonal" disabled={guideBusy || name.trim().length < 2} onClick={() => void generateGuide()}>
                <Sparkles /> {guideBusy ? "Writing…" : instructions.trim() ? "Rewrite with AI" : "Generate with AI"}
              </Button>
            )}
          </div>
          <Textarea rows={6} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Setup, steps, coaching cues… or generate with AI." />
          {guideErr && <p className="mt-1.5 text-xs text-warning">{guideErr}</p>}
        </div>

        <Button size="lg" className="w-full" disabled={busy || name.trim().length < 2} onClick={() => void save()}>
          {busy ? "Saving…" : exerciseId ? "Save changes" : "Add to library"}
        </Button>
      </div>
    </Sheet>
  );
}
