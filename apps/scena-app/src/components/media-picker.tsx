/**
 * Media-library picker (§2) — a small dialog to choose an existing library
 * asset (or upload a new one, which lands in the library) instead of pasting a
 * raw external URL. Keeps the media library the single home for assets used
 * across the app (widgets, slides, logos). Returns the asset's URL.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Check } from "lucide-react";
import { listMedia, uploadToLibrary, API_BASE, type Media } from "../api.js";
import { Button, Dialog, DialogContent, LoadError } from "@4dl/ui";

/** Absolute URL for an asset path (library rows store "/api/assets/<hash>"). */
export function assetSrc(url: string | null | undefined): string {
  if (!url) return "";
  return /^https?:\/\//.test(url) ? url : `${API_BASE}${url}`;
}

/** An absolute asset URL to STORE in a widget config, so the player (a separate
 *  origin from the app) can load it. Widget configs aren't origin-rewritten at
 *  manifest compile the way slide assets are, so we bake the app origin in. */
export function assetStoreUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (/^https?:\/\//.test(url)) return url;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${url}`;
}

export function MediaPicker({ open, kind = "image", title, onPick, onOpenChange }: {
  open: boolean;
  /** Which media kind to browse (default images). */
  kind?: "image" | "audio" | "video";
  title?: string;
  onPick: (url: string, media: Media) => void;
  onOpenChange: (o: boolean) => void;
}) {
  const [items, setItems] = useState<Media[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // `catch(() => setItems([]))` turned a failed load into "Nothing here yet" —
  // in a PICKER, where the answer somebody takes away is "I have no media" and
  // the next thing they do is upload a second copy of something they own.
  const load = useCallback(() => {
    setError(null);
    setItems(null);
    return listMedia(kind).then(setItems).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [kind]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  async function onUpload(file: File) {
    setUploading(true);
    try {
      const { url } = await uploadToLibrary(file);
      const fresh = await listMedia(kind).catch(() => items ?? []);
      setItems(fresh);
      const m = fresh.find((x) => x.asset_url === url);
      if (m) { onPick(assetStoreUrl(url), m); onOpenChange(false); }
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={<><span>{title ?? "Choose from library"}</span>
            <Button size="sm" variant="outline" className="mr-6" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />} Upload
            </Button></>} className="flex max-h-[85dvh] max-w-[min(720px,95vw)] flex-col overflow-hidden sm:max-w-[min(720px,95vw)]">
        <input ref={fileRef} type="file" accept={kind === "image" ? "image/*" : kind === "video" ? "video/*" : "audio/*"} className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUpload(f); e.target.value = ""; }} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {error ? (
            <LoadError what="your media" error={error} onRetry={() => void load()} />
          ) : !items ? (
            <div className="grid place-items-center py-16 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Your library is empty. Upload an asset to use it here.</div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {items.map((m) => (
                <button key={m.id} type="button" title={m.name}
                  onClick={() => { if (m.asset_url) { onPick(assetStoreUrl(m.asset_url), m); onOpenChange(false); } }}
                  className="group relative aspect-square overflow-hidden rounded-lg border bg-[repeating-conic-gradient(#0000_0deg_90deg,#8882_90deg_180deg)] bg-[length:16px_16px] transition hover:ring-2 hover:ring-primary">
                  {kind === "image" ? (
                    <img src={assetSrc(m.asset_url)} alt={m.name} className="size-full object-contain" loading="lazy" />
                  ) : (
                    <span className="flex size-full items-center justify-center p-2 text-center text-caption font-medium text-muted-foreground">{m.name}</span>
                  )}
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-black/50 px-1 py-0.5 text-caption text-white opacity-0 transition group-hover:opacity-100">{m.name}</span>
                  <span className="pointer-events-none absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 transition group-hover:opacity-100"><Check className="size-3" /></span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
