/**
 * Shared audio-metadata editor (§16). Edits title, artist, album, genres, the
 * vocal/instrumental classification, and cover art. Used by both the Media
 * library (editing an audio asset) and a Music playlist (editing a track).
 *
 * Cover art uploads to R2 via /api/assets and is returned as {artHash, artUrl};
 * clearing it returns null for both so the caller can unset it.
 */
import { useEffect, useRef, useState } from "react";
import { ImageIcon, Music, Trash2, Loader2 } from "lucide-react";
import { TagEditor } from "./tag-editor.js";
import { Button, Dialog, DialogContent, DialogFooter, Input, Label, toast } from "@4dl/ui";
import { uploadAsset, assetUrl } from "../api.js";

export interface TrackMeta {
  title: string;
  artist: string;
  album: string;
  genres: string[];
  vocal: "vocal" | "instrumental" | "";
  artHash: string | null;
  artUrl: string | null;
}

export type TrackMetaPatch = {
  title: string; artist: string; album: string; genres: string[];
  vocal: string; artHash: string | null; artUrl: string | null;
};

export function TrackMetaDialog({
  open, onOpenChange, initial, title = "Track details", onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: Partial<TrackMeta> | null;
  title?: string;
  onSave: (patch: TrackMetaPatch) => Promise<void> | void;
}) {
  const [m, setM] = useState<TrackMeta>({ title: "", artist: "", album: "", genres: [], vocal: "", artHash: null, artUrl: null });
  const [busy, setBusy] = useState(false);
  const [uploadingArt, setUploadingArt] = useState(false);
  const artInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setM({
      title: initial?.title ?? "",
      artist: initial?.artist ?? "",
      album: initial?.album ?? "",
      genres: initial?.genres ?? [],
      vocal: (initial?.vocal as TrackMeta["vocal"]) ?? "",
      artHash: initial?.artHash ?? null,
      artUrl: initial?.artUrl ?? null,
    });
  }, [open, initial]);

  async function pickArt(file: File) {
    setUploadingArt(true);
    try {
      const { hash, url } = await uploadAsset(file);
      setM((p) => ({ ...p, artHash: hash, artUrl: url }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not upload cover art");
    } finally { setUploadingArt(false); }
  }

  async function save() {
    setBusy(true);
    try {
      await onSave({
        title: m.title.trim() || "Track", artist: m.artist.trim(), album: m.album.trim(),
        genres: m.genres, vocal: m.vocal, artHash: m.artHash, artUrl: m.artUrl,
      });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} className="sm:max-w-md">
        <div className="space-y-3.5">
          {/* Cover art */}
          <div className="flex items-center gap-3">
            <div className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
              {m.artUrl ? <img src={assetUrl(m.artUrl)} alt="" className="size-full object-cover" /> : <Music className="size-6" />}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <input ref={artInput} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pickArt(f); e.target.value = ""; }} />
              <Button type="button" variant="outline" size="sm" disabled={uploadingArt} onClick={() => artInput.current?.click()}>
                {uploadingArt ? <Loader2 className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}
                {m.artUrl ? "Replace art" : "Add cover art"}
              </Button>
              {m.artUrl && (
                <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setM((p) => ({ ...p, artHash: null, artUrl: null }))}>
                  <Trash2 className="size-4" /> Remove
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-caption text-muted-foreground">Title</Label>
            <Input autoFocus value={m.title} onChange={(e) => setM({ ...m, title: e.target.value })} placeholder="Track title" maxLength={200} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-caption text-muted-foreground">Artist</Label>
              <Input value={m.artist} onChange={(e) => setM({ ...m, artist: e.target.value })} placeholder="Artist" maxLength={200} />
            </div>
            <div className="space-y-1">
              <Label className="text-caption text-muted-foreground">Album</Label>
              <Input value={m.album} onChange={(e) => setM({ ...m, album: e.target.value })} placeholder="Album (optional)" maxLength={200} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-caption text-muted-foreground">Genres</Label>
            <TagEditor tags={m.genres} onChange={(g) => setM({ ...m, genres: g })} placeholder="Add a genre…" />
          </div>
          <div className="space-y-1">
            <Label className="text-caption text-muted-foreground">Type</Label>
            <div className="flex gap-1.5">
              {([["", "Unset"], ["vocal", "Vocal"], ["instrumental", "Instrumental"]] as const).map(([v, lbl]) => (
                <button key={v} type="button" onClick={() => setM({ ...m, vocal: v })}
                  className={`flex-1 rounded-md border px-2.5 py-2 text-caption font-medium transition-colors ${m.vocal === v ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Duration formatter shared by track UIs (m:ss). */
export function mmss(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
