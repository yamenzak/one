/**
 * ExerciseEditor — create or edit a library exercise, with a photo/thumbnail,
 * muscles, equipment, difficulty and instructions. The workout-library analog
 * of FoodEditor: staff shoot or upload an image (stored via /api/media with
 * purpose "exercise" → thumb_url) and edit their own exercises. Platform-seed
 * rows are read-only on the server, so editing one saves a tenant-owned copy.
 */

import { useState } from "react";
import { Button, Field, Textarea, Sheet, Chip, Camera, Dumbbell } from "@mossa/ui";
import { api } from "../../api.js";
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
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const uploadPhoto = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("purpose", "exercise");
      const up = await fetch("/api/media/upload", { method: "POST", credentials: "include", body: fd });
      const { key } = (await up.json()) as { key?: string };
      if (key) setImage(`/api/media/${key}`);
    } finally { setUploading(false); }
  };

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        name: name.trim(), muscleGroups: split(muscles), secondaryMuscleGroups: split(secondary),
        equipment: split(equipment), difficulty, force, mechanic,
        instructionsMd: instructions.trim() || null, thumbUrl: image || null, visibility: "tenant" as const,
      };
      if (exerciseId) await api.patch(`/api/exercises/${exerciseId}`, body);
      else await api.post("/api/exercises", body);
      onSaved();
    } finally { setBusy(false); }
  };

  return (
    <Sheet open onClose={onClose} title={exerciseId ? "Edit exercise" : "New exercise"}>
      <div className="space-y-4">
        {/* Photo + name */}
        <div className="flex items-center gap-3">
          <label className="grid size-16 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-2xl bg-surface-2 text-muted-foreground transition-colors hover:bg-surface-3">
            {uploading ? <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : image ? <img src={image} alt="" className="size-full object-cover" /> : <Camera className="size-5" />}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && void uploadPhoto(e.target.files[0])} />
          </label>
          <div className="min-w-0 flex-1">
            <Field label="Name" icon={Dumbbell} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
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
          <div className="mb-1.5 text-sm text-muted-foreground">How to perform it</div>
          <Textarea rows={5} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Cues, setup, tempo…" />
        </div>

        <Button size="lg" className="w-full" disabled={busy || uploading || name.trim().length < 2} onClick={() => void save()}>
          {busy ? "Saving…" : exerciseId ? "Save changes" : "Add to library"}
        </Button>
      </div>
    </Sheet>
  );
}
