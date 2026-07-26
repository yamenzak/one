/**
 * AiImageField — an image slot that can be uploaded OR generated with AI. Used
 * for food photos and exercise start/end images. "Generate" mints an original,
 * license-free house-style image (the prompt is configurable per feature in AI
 * settings); "Regenerate" swaps it for a brand-new unique one. When a
 * `referenceUrl` is given (e.g. the Start frame), generation is image-to-image
 * off that reference so the same athlete / style / angle carries over.
 *
 * Two layouts: default row (image beside the button, for a full-width slot) and
 * `stacked` (image above a full-width button, for side-by-side slots).
 */

import { useState, type CSSProperties } from "react";
import { Button, cn, Camera, ImageIcon } from "@mossa/ui";
import { api, ApiError, uploadMedia } from "./api.js";
import { AiAvatar } from "./AiAvatar.js";

type ImageFeature = "food-image" | "exercise-image";

export function AiImageField({ value, onChange, feature, subject, hint, canAi, label, size = 88, stacked = false, referenceUrl, loading = false, contain = false }: {
  value: string;
  onChange: (url: string) => void;
  feature: ImageFeature;
  subject: string;
  hint?: string;
  canAi: boolean;
  label?: string;
  size?: number;
  stacked?: boolean;
  /** Match this image (an /api/media url) — image-to-image for a consistent pair. */
  referenceUrl?: string;
  /** Externally-driven "creating" state (e.g. a parent generating both frames). */
  loading?: boolean;
  /** Fit the whole image inside the box (object-contain) instead of filling it. */
  contain?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const purpose = feature === "food-image" ? "food" : "exercise";
  const busy = uploading || generating || loading;
  const creating = generating || loading;

  const upload = async (file: File) => {
    setUploading(true); setErr(null);
    try {
      const key = await uploadMedia(file, purpose);
      onChange(`/api/media/${key}`);
    } catch {
      setErr("Couldn't upload that image — try again.");
    } finally { setUploading(false); }
  };

  const generate = async () => {
    if (!subject.trim()) { setErr("Add a name first."); return; }
    setGenerating(true); setErr(null);
    try {
      const referenceKey = referenceUrl?.startsWith("/api/media/") ? referenceUrl.slice("/api/media/".length) : undefined;
      const r = await api.post<{ url: string }>("/api/ai/generate-image", { feature, subject: subject.trim(), hint: hint ?? "", referenceKey });
      if (r.url) onChange(r.url);
    } catch (e) {
      const detail = e instanceof ApiError ? (e.body?.detail as string | undefined) : undefined;
      const m = e instanceof Error ? e.message : "";
      setErr(m.includes("credits") || m.includes("insufficient") ? "Out of AI credits." : m.includes("aiSuite") ? "AI isn't on your plan." : detail ? `Failed: ${detail}` : "Couldn't generate — try again.");
    } finally { setGenerating(false); }
  };

  const box = (className: string, style?: CSSProperties) => (
    <label style={style} className={cn("relative grid cursor-pointer place-items-center overflow-hidden rounded-2xl bg-surface-2 text-muted-foreground transition-colors hover:bg-surface-3", busy && "pointer-events-none", className)}>
      {creating ? (
        <div className="flex flex-col items-center gap-1 text-primary">
          <AiAvatar className="size-6 animate-pulse" />
          <span className="text-xs font-medium">Creating…</span>
        </div>
      ) : uploading ? (
        <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : value ? (
        <img src={value} alt="" className={cn("size-full", contain ? "object-contain p-1" : "object-cover")} />
      ) : (
        <Camera className="size-6" />
      )}
      <input type="file" accept="image/*" capture="environment" className="hidden" disabled={busy} onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
    </label>
  );

  const genButton = (className?: string) => (
    <Button size="sm" variant={value ? "secondary" : "tonal"} className={className} disabled={busy} onClick={() => void generate()}>
      {value ? <><ImageIcon /> Regenerate</> : <><AiAvatar className="size-4" /> Generate</>}
    </Button>
  );

  if (stacked) {
    return (
      <div className="min-w-0 space-y-1.5">
        {label && <div className="text-xs font-medium text-muted-foreground">{label}</div>}
        {box("aspect-square w-full")}
        {canAi && genButton("w-full")}
        {err && <p className="text-xs text-warning">{err}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {label && <div className="text-xs text-muted-foreground">{label}</div>}
      <div className="flex items-center gap-3">
        {box("shrink-0", { width: size, height: size })}
        {canAi && (
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
            {genButton()}
            <p className="text-xs leading-snug text-muted-foreground">Original, license-free {feature === "food-image" ? "food render" : "exercise illustration"}. Style is set in AI settings.</p>
          </div>
        )}
      </div>
      {err && <p className="text-xs text-warning">{err}</p>}
    </div>
  );
}
