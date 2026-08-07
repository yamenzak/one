/**
 * Media Library (§4b) — the durable catalog of every asset the operator uploads
 * or generates (images, GIFs, video, HTML sandboxes). Playlists copy what they
 * reference, so deleting a playlist never removes library content. Also exposes
 * <MediaPicker> — the "Pick from library" surface reused by the playlist editor.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Upload, Code2, Trash2, MoreVertical, Search, Pencil, Tag as TagIcon, ImageIcon, Check, Music, SlidersHorizontal } from "lucide-react";
import { TagEditor } from "../components/tag-editor.js";
import { useCan } from "../permissions.js";
import { HtmlEditorDialog, HtmlThumb } from "../components/html-editor.js";
import { LicenseBadge, LicenseNote } from "../components/licensing.js";
import { TrackMetaDialog, mmss } from "../components/track-meta-dialog.js";
import { listMedia, uploadToLibrary, updateMedia, deleteMedia, assetUrl, type Media, type MediaKind } from "../api.js";
import { Badge, Button, Card, Collection, ConfirmDialog, Dialog, DialogContent, DialogFooter, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Filters, Input, Row, Skeleton, toast, type FacetSelection, useCollectionView } from "@4dl/ui";

const KINDS = [
  { key: "", label: "All" },
  { key: "image", label: "Images" },
  { key: "gif", label: "GIFs" },
  { key: "video", label: "Video" },
  { key: "audio", label: "Music" },
  { key: "html", label: "HTML" },
] as const;

function parseGenres(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function meta(m: Media): string {
  if (m.kind === "html") return "HTML slide";
  if (m.kind === "audio") {
    const parts = [m.artist || null, m.duration_ms ? mmss(m.duration_ms) : null].filter(Boolean);
    return parts.join(" · ") || "Audio";
  }
  const dims = m.width && m.height ? `${m.width}×${m.height}` : "";
  const dur = m.duration_ms ? ` · ${(m.duration_ms / 1000).toFixed(0)}s` : "";
  return `${dims}${dur}` || m.kind.toUpperCase();
}

/** The visual thumbnail for a media item — shared by the page + the picker. */
export function MediaThumb({ m, className }: { m: Media; className?: string }) {
  if ((m.kind === "image" || m.kind === "gif") && m.asset_url)
    return <img src={assetUrl(m.asset_url)} alt="" className={`size-full object-cover ${className ?? ""}`} />;
  if (m.kind === "video" && m.asset_url) return <video src={assetUrl(m.asset_url)} muted className={`size-full object-cover ${className ?? ""}`} />;
  if (m.kind === "html") return <HtmlThumb html={m.html_body ?? ""} className={`size-full ${className ?? ""}`} />;
  if (m.kind === "audio")
    return m.art_url ? (
      <img src={assetUrl(m.art_url)} alt="" className={`size-full object-cover ${className ?? ""}`} />
    ) : (
      <div className={`flex size-full items-center justify-center bg-gradient-to-br from-primary/15 to-primary/5 text-primary ${className ?? ""}`}>
        <Music className="size-7" />
      </div>
    );
  return (
    <div className={`flex size-full items-center justify-center text-muted-foreground ${className ?? ""}`}>
      <ImageIcon className="size-7" />
    </div>
  );
}

export function MediaLibraryPage() {
  const can = useCan();
  const canWrite = can("content", "update");
  const canDelete = can("content", "delete");
  const [media, setMedia] = useState<Media[] | null>(null);
  const [view, setView] = useCollectionView("scena.media", "grid");
  const [q, setQ] = useState("");
  const [facets, setFacets] = useState<FacetSelection>({ kind: null, tag: null });
  const [busy, setBusy] = useState(false);
  const [rename, setRename] = useState<Media | null>(null);
  const [tagsOf, setTagsOf] = useState<Media | null>(null);
  const [del, setDel] = useState<Media | null>(null);
  const [editHtml, setEditHtml] = useState<Media | null>(null);
  const [editAudio, setEditAudio] = useState<Media | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    setError(null);
    return listMedia()
      .then(setMedia)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };
  useEffect(() => {
    reload();
  }, []);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) await uploadToLibrary(f);
      toast.success(`${files.length} item${files.length === 1 ? "" : "s"} uploaded`);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  const allTags = useMemo(() => [...new Set((media ?? []).flatMap((m) => m.tags ?? []))].sort(), [media]);

  /**
   * Kind and tag are FACETS, not a chip row and a separate dropdown.
   *
   * `Filters` renders itself as one button that opens a sheet, so a collection
   * with facets costs no extra rows — the six kind chips used to sit on a line
   * of their own above the grid, and the tag filter was a third control in the
   * header. It also renders NOTHING when a facet has fewer than two options,
   * which is the correct behaviour for a library with only images in it.
   */
  const facetGroups = useMemo(
    () => [
      { key: "kind", label: "Kind", options: KINDS.filter((k) => k.key).map((k) => ({ value: k.key, label: k.label })) },
      { key: "tag", label: "Tag", options: allTags.map((t) => ({ value: t, label: t })) },
    ],
    [allTags],
  );

  const narrowed = Boolean(facets.kind || facets.tag);
  const shown = useMemo(() => {
    if (!media) return null;
    const needle = q.trim().toLowerCase();
    return media.filter(
      (m) =>
        (!facets.kind || m.kind === facets.kind) && (!facets.tag || (m.tags ?? []).includes(facets.tag)) && (!needle || m.name.toLowerCase().includes(needle)),
    );
  }, [media, facets, q]);

  const uploadButton = canWrite ? (
    <Button onClick={() => fileInput.current?.click()} disabled={busy}>
      <Upload className="size-4" /> {busy ? "Uploading…" : "Upload"}
    </Button>
  ) : undefined;

  /** The per-item menu, shared by both views so an action never depends on which one is open. */
  const menu = (m: Media) =>
    (canWrite || canDelete) && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="icon" className="size-7">
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canWrite && m.kind === "html" && (
            <DropdownMenuItem onSelect={() => setEditHtml(m)}>
              <Code2 className="size-4" /> Edit HTML
            </DropdownMenuItem>
          )}
          {canWrite && m.kind === "audio" && (
            <DropdownMenuItem onSelect={() => setEditAudio(m)}>
              <SlidersHorizontal className="size-4" /> Edit details
            </DropdownMenuItem>
          )}
          {canWrite && (
            <DropdownMenuItem onSelect={() => setRename(m)}>
              <Pencil className="size-4" /> Rename
            </DropdownMenuItem>
          )}
          {canWrite && (
            <DropdownMenuItem onSelect={() => setTagsOf(m)}>
              <TagIcon className="size-4" /> Tags…
            </DropdownMenuItem>
          )}
          {canDelete && (
            <DropdownMenuItem className="text-destructive" onSelect={() => setDel(m)}>
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );

  return (
    <div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*,video/*,audio/*"
        multiple
        className="hidden"
        onChange={(e) => {
          upload(e.target.files);
          e.target.value = "";
        }}
      />

      <LicenseNote scope="media" />

      {/*
        `Collection` owns loading, empty, no-results, the error+retry pair and
        the view toggle. What it replaces here was four hand-rolled branches
        and one real bug: a failed load rendered `Couldn't reach the API:
        [object Object]` in a dashed card with no way to retry, and the
        "no media matches your filters" branch was a separate string that could
        not tell an empty library from an over-narrowed one.
      */}
      <Collection
        items={shown}
        itemKey={(m: Media) => m.id}
        error={error}
        onRetry={() => void reload()}
        noun="media"
        view={view}
        onView={setView}
        query={q}
        onQuery={setQ}
        narrowed={narrowed}
        onClearFilters={() => setFacets({ kind: null, tag: null })}
        filter={<Filters groups={facetGroups} value={facets} onChange={setFacets} />}
        action={uploadButton}
        empty={{
          icon: ImageIcon,
          title: "Your library is empty",
          description: canWrite
            ? "Upload images, GIFs or video — everything you add to a playlist lands here too, ready to reuse."
            : "Media this workspace uploads will show up here.",
          action: uploadButton,
        }}
        thumb={56}
        renderList={(m: Media) => (
          <Row
            key={m.id}
            leading={
              <div className="size-11 overflow-hidden rounded-lg bg-muted">
                <MediaThumb m={m} />
              </div>
            }
            sub={meta(m)}
            trailing={menu(m)}
            onClick={canWrite && m.kind === "html" ? () => setEditHtml(m) : undefined}
          >
            {m.name}
          </Row>
        )}
        renderGrid={(m: Media) => (
          <Card key={m.id} className="group relative overflow-hidden p-0">
            <div className="relative aspect-video w-full overflow-hidden bg-muted">
              <MediaThumb m={m} />
              {m.kind === "html" && canWrite && (
                <button type="button" onClick={() => setEditHtml(m)} className="absolute inset-0" aria-label={`Edit ${m.name}`}>
                  <span className="absolute inset-x-0 bottom-0 bg-scrim py-1 text-center text-[10px] font-medium text-white">Tap to edit</span>
                </button>
              )}
              <span className="absolute left-2 top-2 rounded bg-background/85 px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                {m.kind === "audio" ? "music" : m.kind}
              </span>
              <LicenseBadge source={m.source} className="absolute bottom-2 left-2" />
              <div className="absolute right-2 top-2">{menu(m)}</div>
            </div>
            <div className="p-2.5">
              <div className="truncate text-sm font-medium">{m.name}</div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">{meta(m)}</div>
              {(m.tags?.length ?? 0) > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {m.tags!.slice(0, 3).map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                </div>
              )}
            </div>
          </Card>
        )}
      />

      <RenameMediaDialog media={rename} onClose={() => setRename(null)} onSaved={reload} />
      <TagsMediaDialog media={tagsOf} onClose={() => setTagsOf(null)} onSaved={reload} />
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={del ? `Delete "${del.name}"?` : ""}
        description="Permanently deletes this asset from the library and from storage. Any slide still using it will break. This can't be undone."
        confirmLabel="Delete permanently"
        destructive
        onConfirm={async () => {
          if (!del) return;
          try {
            await deleteMedia(del.id);
            toast.success("Deleted");
            setDel(null);
            reload();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Delete failed");
          }
        }}
      />
      <HtmlEditorDialog
        open={!!editHtml}
        title={`Edit · ${editHtml?.name ?? "HTML"}`}
        initialHtml={editHtml?.html_body ?? ""}
        onOpenChange={(o) => !o && setEditHtml(null)}
        onSave={async (html) => {
          if (!editHtml) return;
          await updateMedia(editHtml.id, { htmlBody: html });
          toast.success("Saved.");
          reload();
        }}
      />
      <TrackMetaDialog
        open={!!editAudio}
        onOpenChange={(o) => !o && setEditAudio(null)}
        title="Audio details"
        initial={
          editAudio
            ? {
                title: editAudio.name,
                artist: editAudio.artist ?? "",
                album: editAudio.album ?? "",
                genres: parseGenres(editAudio.genres),
                vocal: (editAudio.vocal as "vocal" | "instrumental" | "") ?? "",
                artHash: editAudio.art_hash ?? null,
                artUrl: editAudio.art_url ?? null,
              }
            : null
        }
        onSave={async (patch) => {
          if (!editAudio) return;
          await updateMedia(editAudio.id, {
            name: patch.title,
            artist: patch.artist,
            album: patch.album,
            genres: patch.genres,
            vocal: patch.vocal || null,
            artHash: patch.artHash,
            artUrl: patch.artUrl,
          });
          toast.success("Saved.");
          reload();
        }}
      />
    </div>
  );
}

function RenameMediaDialog({ media, onClose, onSaved }: { media: Media | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  useEffect(() => {
    setName(media?.name ?? "");
  }, [media]);
  async function save() {
    if (!media) return;
    const n = name.trim();
    if (!n || n === media.name) {
      onClose();
      return;
    }
    try {
      await updateMedia(media.id, { name: n });
      toast.success("Renamed");
      onClose();
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rename failed");
    }
  }
  return (
    <Dialog open={!!media} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Rename">
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} maxLength={120} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TagsMediaDialog({ media, onClose, onSaved }: { media: Media | null; onClose: () => void; onSaved: () => void }) {
  const [tags, setTags] = useState<string[]>([]);
  useEffect(() => {
    setTags(media?.tags ?? []);
  }, [media]);
  async function save() {
    if (!media) return;
    try {
      await updateMedia(media.id, { tags });
      toast.success("Tags saved");
      onClose();
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save tags");
    }
  }
  return (
    <Dialog open={!!media} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={<>Tags · {media?.name}</>}>
        <TagEditor tags={tags} onChange={setTags} placeholder="Add a tag…" />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------- Pick-from-library --------------------------- */

/** Multi-select media picker. Resolves the chosen items to the caller (e.g. the
 * playlist editor turns each into a slide/track). Media stays in the library.
 * `kinds` restricts which media kinds are offered (slides exclude audio; music
 * shows only audio). */
export function MediaPicker({
  open,
  onOpenChange,
  onPick,
  kinds,
  title = "Pick from library",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (items: Media[]) => Promise<void> | void;
  kinds?: MediaKind[];
  title?: string;
}) {
  const [media, setMedia] = useState<Media[] | null>(null);
  const [kind, setKind] = useState<string>("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const kindChips = useMemo(() => (kinds ? KINDS.filter((k) => k.key === "" || kinds.includes(k.key as MediaKind)) : KINDS), [kinds]);
  const audioOnly = kinds?.length === 1 && kinds[0] === "audio";

  useEffect(() => {
    if (!open) return;
    setSel(new Set());
    setQ("");
    setKind("");
    listMedia()
      .then(setMedia)
      .catch(() => setMedia([]));
  }, [open]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (media ?? []).filter(
      (m) =>
        (!kinds || kinds.includes(m.kind)) &&
        (!kind || m.kind === kind) &&
        (!needle || m.name.toLowerCase().includes(needle) || (m.artist ?? "").toLowerCase().includes(needle)),
    );
  }, [media, kind, q, kinds]);

  function toggle(id: string) {
    setSel((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function confirm() {
    const items = (media ?? []).filter((m) => sel.has(m.id));
    if (!items.length) return;
    setBusy(true);
    try {
      await onPick(items);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} className="sm:max-w-3xl">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full pl-8" />
          </div>
          {kindChips.length > 2 &&
            kindChips.map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => setKind(k.key)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${kind === k.key ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}
              >
                {k.label}
              </button>
            ))}
        </div>
        <div className="max-h-[52vh] overflow-y-auto">
          {!media ? (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="aspect-video rounded-lg" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {audioOnly ? "No audio yet. Upload music or generate a track." : "No media found. Upload some in the Media library."}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {filtered.map((m) => {
                const on = sel.has(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggle(m.id)}
                    className={`group relative overflow-hidden rounded-lg border-2 text-left transition-colors ${on ? "border-primary" : "border-transparent hover:border-border"}`}
                  >
                    <div className={`w-full bg-muted ${audioOnly ? "aspect-square" : "aspect-video"}`}>
                      <MediaThumb m={m} />
                    </div>
                    <LicenseBadge source={m.source} className="absolute left-1.5 top-1.5 shadow" />
                    {on && (
                      <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                        <Check className="size-3.5" />
                      </span>
                    )}
                    <div className="truncate px-1.5 py-1 text-[11px] font-medium">{m.name}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy || sel.size === 0} onClick={confirm}>
            {busy ? "Adding…" : `Add ${sel.size || ""}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
