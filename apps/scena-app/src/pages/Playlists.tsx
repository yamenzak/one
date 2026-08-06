/**
 * Slide Playlists — the list→detail pattern for the reusable-entities model (§4).
 * A playlist is authored once and referenced by any number of channels. List
 * view: create/open playlists. Detail view: a grid of slides you build from
 * uploaded images, uploaded video, hand-written HTML, or AI generation.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, ImageIcon, Video, Code2, Trash2, Clock, Layers, MoreVertical, Search, Tag as TagIcon, Pencil, GripVertical, Settings2, Images, FileImage, Sparkles } from "lucide-react";
import { Button } from "../components/ui/button.js";
import { Card, CardContent } from "../components/ui/card.js";
import { Input } from "../components/ui/input.js";
import { Textarea } from "../components/ui/textarea.js";
import { Badge } from "../components/ui/badge.js";
import { Label } from "../components/ui/label.js";
import { Separator } from "../components/ui/separator.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.js";
import { Switch } from "../components/ui/switch.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog.js";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "../components/ui/table.js";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "../components/ui/dropdown-menu.js";
import { PageHeader } from "../components/page-header.js";
import { EmptyState } from "../components/empty-state.js";
import { TagEditor } from "../components/tag-editor.js";
import { TagFilter } from "../components/tag-filter.js";
import { ConfirmDialog } from "../components/confirm-dialog.js";
import { usePageChrome } from "../components/page-chrome.js";
import { useCan } from "../permissions.js";
import { toast } from "../components/toast.js";
import { confirmDialog } from "../components/confirm.js";
import { offerPublishAffected } from "../components/publish-affected.js";
import {
  listSlidePlaylists, createSlidePlaylist, getSlidePlaylist, updateSlidePlaylist, deleteSlidePlaylist,
  addPlaylistSlide, updatePlaylistSlide, deletePlaylistSlide, reorderPlaylistSlidesApi, uploadToLibrary, registerMedia, aiGenerate, listAiModels, assetUrl,
  probeVideoDurationMs, fetchGifDurationMs,
  type SlidePlaylist, type PlaylistSlide, type Media, type AiModel,
} from "../api.js";
import { MediaPicker } from "./MediaLibrary.js";
import { HtmlEditorDialog, HtmlThumb } from "../components/html-editor.js";
import { LicenseNote } from "../components/licensing.js";

const STARTER_HTML = `<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;background:linear-gradient(135deg,#6366f1,#312e81);color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:8%">
  <div style="font-size:1.4vw;letter-spacing:.3em;text-transform:uppercase;opacity:.75">Your brand</div>
  <div style="font-size:5vw;font-weight:800;line-height:1.05">Welcome</div>
  <div style="font-size:1.6vw;opacity:.85">Edit this slide by hand, or ask the AI to change it.</div>
</div>`;

const TRANSITION_LABELS: Record<string, string> = { fade: "Fade", none: "Cut", slide: "Slide", zoom: "Zoom", flip: "Flip" };
const TRANSITIONS = ["fade", "slide", "zoom", "flip", "none"] as const;
const FIT_LABELS: Record<string, string> = { contain: "Fit", cover: "Fill", fill: "Stretch" };
const FITS = ["contain", "cover", "fill"] as const;
function fmtDur(ms: number | null): string {
  const s = (ms ?? 6000) / 1000;
  return s >= 1 ? `${s % 1 === 0 ? s : s.toFixed(1)}s` : `${ms}ms`;
}

export function PlaylistsPage() {
  const can = useCan();
  const canCreate = can("content", "create");
  const canWrite = can("content", "update");
  const canDelete = can("content", "delete");
  const navigate = useNavigate();
  const [playlists, setPlaylists] = useState<SlidePlaylist[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [rename, setRename] = useState<SlidePlaylist | null>(null);
  const [tagsOf, setTagsOf] = useState<SlidePlaylist | null>(null);
  const [del, setDel] = useState<SlidePlaylist | null>(null);

  const reload = () => { setError(null); return listSlidePlaylists().then(setPlaylists).catch((e) => setError(String(e))); };
  useEffect(() => { reload(); }, []);

  usePageChrome(
    { crumbs: [{ label: "Slide playlists" }], actions: canCreate ? [{ key: "new", label: "New playlist", icon: <Plus className="size-4" />, onClick: () => setNewOpen(true) }] : [] },
    [canCreate],
  );

  const allTags = useMemo(() => [...new Set((playlists ?? []).flatMap((p) => p.tags ?? []))].sort(), [playlists]);
  const filtered = useMemo(() => {
    if (!playlists) return null;
    const needle = q.trim().toLowerCase();
    return playlists.filter(
      (p) => (!needle || p.name.toLowerCase().includes(needle)) && (activeTags.length === 0 || (p.tags ?? []).some((t) => activeTags.includes(t))),
    );
  }, [playlists, q, activeTags]);


  return (
    <div>
      <PageHeader
        title="Slide playlists"
        description={playlists ? `${playlists.length} playlist${playlists.length === 1 ? "" : "s"} · reusable across channels` : "Reusable sequences of slides you can assign to any channel."}
        actions={
          playlists && playlists.length > 0 ? (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search playlists…" className="w-full pl-8 sm:w-56" />
              </div>
              <TagFilter allTags={allTags} active={activeTags} onChange={setActiveTags} />
            </>
          ) : null
        }
      />

      {error ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center text-sm text-muted-foreground">Couldn't reach the API: {error}</CardContent>
        </Card>
      ) : !playlists ? (
        <div className="overflow-hidden rounded-xl bg-card shadow-sm">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="m-2 h-12 rounded-lg" />)}
        </div>
      ) : playlists.length === 0 ? (
        <EmptyState
          scena="idle"
          title="No slide playlists yet"
          description="Create one, fill it with slides, then assign it to any channel — author once, reuse everywhere."
          action={canCreate ? <Button onClick={() => setNewOpen(true)}><Plus className="size-4" /> New playlist</Button> : undefined}
        />
      ) : filtered && filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">No playlists match your filters.</div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead className="w-20 text-right">Slides</TableHead>
                <TableHead className="w-28">Default</TableHead>
                <TableHead className="w-28">Transition</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(filtered ?? []).map((p) => (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/playlists/${p.id}`)}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Layers className="size-4" /></div>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{p.name}</div>
                        {(p.tags?.length ?? 0) > 0 && (
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {p.tags!.slice(0, 4).map((t) => <span key={t} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">{t}</span>)}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{p.slideCount ?? 0}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDur(p.default_duration_ms)}</TableCell>
                  <TableCell className="text-muted-foreground">{TRANSITION_LABELS[p.transition ?? "fade"] ?? p.transition}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {(canWrite || canDelete) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8" aria-label="Playlist actions"><MoreVertical className="size-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canWrite && <DropdownMenuItem onClick={() => setRename(p)}><Pencil className="size-4" /> Rename</DropdownMenuItem>}
                          {canWrite && <DropdownMenuItem onClick={() => setTagsOf(p)}><TagIcon className="size-4" /> Tags…</DropdownMenuItem>}
                          {canDelete && <DropdownMenuItem className="text-destructive" onClick={() => setDel(p)}><Trash2 className="size-4" /> Delete</DropdownMenuItem>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <NewPlaylistDialog open={newOpen} onOpenChange={setNewOpen} onCreated={(id) => navigate(`/playlists/${id}`)} />
      <RenamePlaylistDialog playlist={rename} onClose={() => setRename(null)} onSaved={reload} />
      <TagsPlaylistDialog playlist={tagsOf} onClose={() => setTagsOf(null)} onSaved={reload} />
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={del ? `Delete "${del.name}"?` : ""}
        description="This removes the playlist. Any channel using it loses these slides (the slides themselves are deleted). This can't be undone."
        confirmLabel="Delete playlist"
        destructive
        onConfirm={async () => {
          if (!del) return;
          try { await deleteSlidePlaylist(del.id); toast.success("Playlist deleted"); setDel(null); reload(); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
        }}
      />
    </div>
  );
}

function NewPlaylistDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    try {
      const id = await createSlidePlaylist(name.trim() || "Slide playlist");
      onOpenChange(false); setName(""); onCreated(id); toast.success("Playlist created.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create playlist");
    } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New slide playlist</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Input autoFocus placeholder="e.g. Lobby loop" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={create} disabled={busy}>{busy ? "Creating…" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenamePlaylistDialog({ playlist, onClose, onSaved }: { playlist: SlidePlaylist | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  useEffect(() => { setName(playlist?.name ?? ""); }, [playlist]);
  async function save() {
    if (!playlist) return;
    const n = name.trim();
    if (!n || n === playlist.name) { onClose(); return; }
    try { await updateSlidePlaylist(playlist.id, { name: n }); toast.success("Renamed"); onClose(); onSaved(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Rename failed"); }
  }
  return (
    <Dialog open={!!playlist} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Rename playlist</DialogTitle></DialogHeader>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} maxLength={80} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TagsPlaylistDialog({ playlist, onClose, onSaved }: { playlist: SlidePlaylist | null; onClose: () => void; onSaved: () => void }) {
  const [tags, setTags] = useState<string[]>([]);
  useEffect(() => { setTags(playlist?.tags ?? []); }, [playlist]);
  async function save() {
    if (!playlist) return;
    try { await updateSlidePlaylist(playlist.id, { tags }); toast.success("Tags saved"); onClose(); onSaved(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save tags"); }
  }
  return (
    <Dialog open={!!playlist} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Tags · {playlist?.name}</DialogTitle></DialogHeader>
        <TagEditor tags={tags} onChange={setTags} placeholder="Add a tag…" />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A small looping demo of a transition — two panels swapping with the effect. */
const PREVIEW_ENTER: Record<string, { opacity: number; transform: string }> = {
  none: { opacity: 0, transform: "none" }, // cut = fade with 0ms, so it hard-swaps A↔B
  fade: { opacity: 0, transform: "none" },
  slide: { opacity: 1, transform: "translateX(100%)" },
  zoom: { opacity: 0, transform: "scale(1.14)" },
  flip: { opacity: 0, transform: "perspective(600px) rotateY(90deg)" },
};
function TransitionPreview({ type, className }: { type: string; className?: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(false);
    const iv = setInterval(() => setOn((v) => !v), 1600);
    return () => clearInterval(iv);
  }, [type]);
  const ms = type === "none" ? 0 : 620;
  const enter = PREVIEW_ENTER[type] ?? { opacity: 0, transform: "none" };
  return (
    <div className={`relative overflow-hidden rounded-lg ${className ?? ""}`} style={{ aspectRatio: "16 / 9" }}>
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-violet-500 to-indigo-600 text-sm font-semibold text-white">A</div>
      <div
        className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/80 to-primary text-sm font-semibold text-white"
        style={{
          transformOrigin: "center",
          transition: `opacity ${ms}ms ease, transform ${ms}ms ease`,
          opacity: on ? 1 : enter.opacity,
          transform: on ? "none" : enter.transform,
        }}
      >
        B
      </div>
    </div>
  );
}

export function PlaylistDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const can = useCan();
  const canWrite = can("content", "update");
  const canDelete = can("content", "delete");
  const [pl, setPl] = useState<(SlidePlaylist & { slides: PlaylistSlide[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [htmlEditor, setHtmlEditor] = useState<{ mode: "new" } | { mode: "edit"; slide: PlaylistSlide } | null>(null);
  const [imgAiOpen, setImgAiOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [settingsOf, setSettingsOf] = useState<PlaylistSlide | null>(null);
  const [delOpen, setDelOpen] = useState(false);
  const imgInput = useRef<HTMLInputElement>(null);
  const vidInput = useRef<HTMLInputElement>(null);
  const gifInput = useRef<HTMLInputElement>(null);

  const slides = pl?.slides ?? [];
  const defaultDur = pl?.default_duration_ms ?? 6000;
  const transition = pl?.transition ?? "fade";

  const load = () => { setError(null); return getSlidePlaylist(id).then(setPl).catch((e) => setError(String(e))).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, [id]);

  async function uploadMany(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        // Uploads land in the Media library first, then reference it as a slide.
        const m = await uploadToLibrary(file);
        await addPlaylistSlide(id, { type: m.kind, assetHash: m.hash, assetUrl: m.url });
      }
      await load();
      toast.success(`${files.length} slide${files.length === 1 ? "" : "s"} added.`);
      void offerPublishAffected("slide", id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally { setBusy(false); }
  }

  /** Turn library items into slides (media stays in the library). */
  async function addFromLibrary(items: Media[]) {
    for (const m of items) {
      if (m.kind === "html") await addPlaylistSlide(id, { type: "html", htmlBody: m.html_body ?? "", durationMs: 8000 });
      else if (m.asset_hash) await addPlaylistSlide(id, { type: m.kind, assetHash: m.asset_hash, assetUrl: m.asset_url ?? undefined });
    }
    await load();
    toast.success(`${items.length} slide${items.length === 1 ? "" : "s"} added.`);
    void offerPublishAffected("slide", id);
  }

  async function removeSlide(sid: string) {
    const ok = await confirmDialog({
      title: "Remove this slide?",
      description: "It will be removed from the playlist on every channel that uses it.",
      confirmText: "Remove slide",
      destructive: true,
    });
    if (!ok) return;
    try { await deletePlaylistSlide(id, sid); await load(); toast.success("Slide removed."); void offerPublishAffected("slide", id); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not remove slide"); }
  }

  function drop(to: number) {
    if (drag === null || drag === to) { setDrag(null); setOver(null); return; }
    const next = [...slides];
    const [moved] = next.splice(drag, 1);
    if (!moved) { setDrag(null); setOver(null); return; }
    next.splice(to, 0, moved);
    setPl((p) => (p ? { ...p, slides: next } : p)); // optimistic
    reorderPlaylistSlidesApi(id, next.map((s) => s.id)).then(() => offerPublishAffected("slide", id)).catch(() => load());
    setDrag(null); setOver(null);
  }

  async function patchPlaylist(patch: { name?: string; defaultDurationMs?: number; transition?: string; tags?: string[] }) {
    setPl((p) => (p ? { ...p, ...("name" in patch ? { name: patch.name! } : {}), ...("defaultDurationMs" in patch ? { default_duration_ms: patch.defaultDurationMs! } : {}), ...("transition" in patch ? { transition: patch.transition! } : {}), ...("tags" in patch ? { tags: patch.tags } : {}) } : p));
    try {
      await updateSlidePlaylist(id, patch);
      // Only the playout-affecting changes (timing/transition) are worth republishing;
      // a rename or tag edit doesn't change what screens show.
      if ("defaultDurationMs" in patch || "transition" in patch) void offerPublishAffected("slide", id);
    }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); load(); }
  }

  const title = pl?.name || "Slide playlist";

  usePageChrome(
    {
      crumbs: [{ label: "Slide playlists", to: "/playlists" }, { label: pl?.name ?? "Playlist" }],
      actions: [
        ...(canWrite ? [{
          key: "add", label: "Add", icon: <Plus className="size-4" />, disabled: busy,
          items: [
            { key: "img", label: "Upload image", icon: <ImageIcon className="size-4" />, onClick: () => imgInput.current?.click() },
            { key: "vid", label: "Upload video", icon: <Video className="size-4" />, onClick: () => vidInput.current?.click() },
            { key: "gif", label: "Upload GIF", icon: <FileImage className="size-4" />, onClick: () => gifInput.current?.click() },
            { key: "html", label: "HTML slide (code + AI)", icon: <Code2 className="size-4" />, onClick: () => setHtmlEditor({ mode: "new" }) },
            { key: "aiimg", label: "Generate image (AI)", icon: <Sparkles className="size-4" />, onClick: () => setImgAiOpen(true) },
            { key: "lib", label: "Pick from library", icon: <Images className="size-4" />, onClick: () => setPickerOpen(true) },
          ],
        }] : []),
        ...(canDelete ? [{ key: "delete", label: "Delete playlist", icon: <Trash2 className="size-4" />, variant: "destructive" as const, overflow: "always" as const, onClick: () => setDelOpen(true) }] : []),
      ],
    },
    [pl?.name, canWrite, canDelete, busy],
  );

  return (
    <div>
      <input ref={imgInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { uploadMany(e.target.files); e.target.value = ""; }} />
      <input ref={vidInput} type="file" accept="video/*" multiple className="hidden" onChange={(e) => { uploadMany(e.target.files); e.target.value = ""; }} />
      <input ref={gifInput} type="file" accept="image/gif" multiple className="hidden" onChange={(e) => { uploadMany(e.target.files); e.target.value = ""; }} />

      <PageHeader
        title={canWrite ? <EditablePlaylistName name={title} onRename={(n) => patchPlaylist({ name: n })} /> : title}
        description={`${slides.length} slide${slides.length === 1 ? "" : "s"} · reusable across channels`}
        back={{ label: "All playlists", onClick: () => navigate("/playlists") }}
      >
        {(canWrite || (pl?.tags?.length ?? 0) > 0) && (
          <div className="mt-3 flex min-w-0 items-center gap-1.5">
            <TagIcon className="size-3.5 shrink-0 text-muted-foreground" />
            {canWrite ? (
              <TagEditor tags={pl?.tags ?? []} onChange={(tags) => patchPlaylist({ tags })} placeholder="Add tags…" className="min-w-[220px] border-none px-0 py-0 focus-within:ring-0" />
            ) : (
              <div className="flex flex-wrap gap-1">{(pl?.tags ?? []).map((t) => <span key={t} className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">{t}</span>)}</div>
            )}
          </div>
        )}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Slides */}
        <div>
          <LicenseNote scope="slides" />
          {error && !loading ? (
            <Card className="border-dashed">
              <CardContent className="py-14 text-center text-sm text-muted-foreground">Couldn't load this playlist: {error}</CardContent>
            </Card>
          ) : loading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {[0, 1, 2, 3].map((i) => <Card key={i} className="overflow-hidden py-0"><Skeleton className="aspect-video w-full rounded-none" /><div className="p-2.5"><Skeleton className="h-4 w-16" /></div></Card>)}
            </div>
          ) : slides.length === 0 ? (
            <EmptyState icon={<Layers />} title="No slides yet" description={canWrite ? "Use Add to upload images, video or GIFs, write an HTML slide, or generate one with AI." : "This playlist has no slides yet."} />
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {slides.map((s, i) => (
                <SlideCard
                  key={s.id}
                  slide={s}
                  index={i}
                  canWrite={canWrite}
                  dragging={drag === i}
                  over={over === i && drag !== null && drag !== i}
                  onDragStart={() => setDrag(i)}
                  onDragEnter={() => setOver(i)}
                  onDragEnd={() => { setDrag(null); setOver(null); }}
                  onDrop={() => drop(i)}
                  onDelete={() => removeSlide(s.id)}
                  onSettings={() => setSettingsOf(s)}
                  onEditHtml={() => setHtmlEditor({ mode: "edit", slide: s })}
                />
              ))}
            </div>
          )}
        </div>

        {/* Settings sidebar */}
        <aside className="space-y-4 lg:sticky lg:top-2 lg:self-start">
          <div className="rounded-xl bg-card p-4 shadow-sm">
            <h3 className="text-sm font-semibold">Playback</h3>
            <div className="mt-3 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Default time per slide</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" min={0.5} step={0.5} disabled={!canWrite}
                    value={+(defaultDur / 1000).toFixed(1)}
                    onChange={(e) => { const v = Math.max(500, Math.round(parseFloat(e.target.value || "6") * 1000)); setPl((p) => (p ? { ...p, default_duration_ms: v } : p)); }}
                    onBlur={(e) => patchPlaylist({ defaultDurationMs: Math.max(500, Math.round(parseFloat(e.target.value || "6") * 1000)) })}
                    className="w-24" />
                  <span className="text-sm text-muted-foreground">seconds</span>
                </div>
                <p className="text-xs text-muted-foreground">Applied to slides that don't set their own duration.</p>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Transition between slides</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {TRANSITIONS.map((t) => (
                    <button key={t} type="button" disabled={!canWrite}
                      onClick={() => patchPlaylist({ transition: t })}
                      className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${transition === t ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}>
                      {TRANSITION_LABELS[t]}
                    </button>
                  ))}
                </div>
                <TransitionPreview type={transition} className="mt-1 ring-1 ring-border" />
                <p className="text-center text-xs text-muted-foreground">Live preview · {TRANSITION_LABELS[transition]}</p>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <SlideSettingsDialog
        slide={settingsOf}
        defaultDur={defaultDur}
        onClose={() => setSettingsOf(null)}
        onSave={async (patch) => {
          if (!settingsOf) return;
          const sid = settingsOf.id;
          setPl((p) => (p ? { ...p, slides: p.slides.map((s) => (s.id === sid ? { ...s, ...("durationMs" in patch ? { duration_ms: patch.durationMs ?? null } : {}), ...("fit" in patch ? { fit: (patch.fit ?? null) as PlaylistSlide["fit"] } : {}) } : s)) } : p));
          setSettingsOf(null);
          try { await updatePlaylistSlide(id, sid, patch); void offerPublishAffected("slide", id); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); load(); }
        }}
      />
      <DeletePlaylistDialog
        open={delOpen} onOpenChange={setDelOpen} name={title}
        onConfirm={async (alsoMedia) => { try { await deleteSlidePlaylist(id, alsoMedia); toast.success("Playlist deleted"); navigate("/playlists"); } catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); } }}
      />
      <MediaPicker open={pickerOpen} onOpenChange={setPickerOpen} onPick={addFromLibrary} kinds={["image", "gif", "video", "html"]} />
      <HtmlEditorDialog
        open={!!htmlEditor}
        mode={htmlEditor?.mode === "edit" ? "edit" : "new"}
        title={htmlEditor?.mode === "edit" ? "Edit HTML slide" : "New HTML slide"}
        initialHtml={htmlEditor?.mode === "edit" ? (htmlEditor.slide.html_body ?? "") : STARTER_HTML}
        onOpenChange={(o) => !o && setHtmlEditor(null)}
        onSave={async (html) => {
          if (htmlEditor?.mode === "edit") {
            const sid = htmlEditor.slide.id;
            setPl((p) => (p ? { ...p, slides: p.slides.map((s) => (s.id === sid ? { ...s, html_body: html } : s)) } : p));
            await updatePlaylistSlide(id, sid, { htmlBody: html });
            toast.success("Slide updated.");
          } else {
            await addHtmlToLibraryAndSlide(id, html, "HTML slide");
            await load();
            toast.success("HTML slide added.");
          }
          void offerPublishAffected("slide", id);
        }}
      />
      <AiImageDialog
        open={imgAiOpen}
        onOpenChange={setImgAiOpen}
        onAdd={async (img) => {
          const name = (img.prompt.trim().slice(0, 60) || "AI image");
          await registerMedia({ kind: "image", name, assetHash: img.assetHash, assetUrl: img.assetUrl, width: img.width, height: img.height }).catch(() => undefined);
          await addPlaylistSlide(id, { type: "image", assetHash: img.assetHash, assetUrl: img.assetUrl });
          await load();
          toast.success("AI image added.");
          void offerPublishAffected("slide", id);
        }}
      />
    </div>
  );
}

/** HTML/AI slides are saved to the library too (so they're reusable + survive
 * a playlist delete), then referenced as a slide. */
async function addHtmlToLibraryAndSlide(playlistId: string, html: string, name: string): Promise<void> {
  await registerMedia({ kind: "html", name, htmlBody: html }).catch(() => undefined);
  await addPlaylistSlide(playlistId, { type: "html", htmlBody: html, durationMs: 8000 });
}

function EditablePlaylistName({ name, onRename }: { name: string; onRename: (n: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(name);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) { ref.current?.focus(); ref.current?.select(); } }, [editing]);
  function save() {
    const n = val.trim();
    setEditing(false);
    if (!n || n === name) { setVal(name); return; }
    onRename(n);
  }
  if (editing) {
    return <Input ref={ref} value={val} onChange={(e) => setVal(e.target.value)} onBlur={save}
      onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setVal(name); setEditing(false); } }}
      maxLength={80} className="h-10 w-64 text-2xl! font-semibold" />;
  }
  return (
    <button onClick={() => { setVal(name); setEditing(true); }} className="group/n inline-flex items-center gap-2 text-left" title="Rename playlist">
      <span className="truncate text-xl font-semibold tracking-tight md:text-2xl">{name}</span>
      <Pencil className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/n:opacity-70" />
    </button>
  );
}

function DeletePlaylistDialog({ open, onOpenChange, name, onConfirm }: {
  open: boolean; onOpenChange: (o: boolean) => void; name: string; onConfirm: (alsoMedia: boolean) => Promise<void>;
}) {
  const [alsoMedia, setAlsoMedia] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setAlsoMedia(false); setBusy(false); } }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Delete “{name}”?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">This removes the playlist and its slides. Any channel using it loses these slides. This can't be undone.</p>
        <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <span className="min-w-0">
            <span className="block text-sm font-medium">Also delete media from the library</span>
            <span className="block text-xs text-muted-foreground">Permanently removes these slides' images/videos from the Media library and storage.</span>
          </span>
          <Switch checked={alsoMedia} onCheckedChange={setAlsoMedia} />
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" disabled={busy} onClick={async () => { setBusy(true); await onConfirm(alsoMedia); setBusy(false); }}>{busy ? "Deleting…" : "Delete playlist"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SlideCard({ slide, index, canWrite, dragging, over, onDragStart, onDragEnter, onDragEnd, onDrop, onDelete, onSettings, onEditHtml }: {
  slide: PlaylistSlide; index: number; canWrite: boolean; dragging: boolean; over: boolean;
  onDragStart: () => void; onDragEnter: () => void; onDragEnd: () => void; onDrop: () => void; onDelete: () => void; onSettings: () => void; onEditHtml: () => void;
}) {
  const fit = slide.fit ?? "contain";
  const objectFit = fit === "fill" ? "fill" : fit; // contain | cover | fill
  return (
    <Card
      draggable={canWrite}
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={onDragEnd}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
      className={`group relative overflow-hidden py-0 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${dragging ? "opacity-40" : ""} ${over ? "ring-2 ring-primary" : ""}`}
    >
      {/* Fixed 16:9 frame — portrait media letterboxes inside it instead of distorting the card. */}
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {slide.asset_url && (slide.type === "image" || slide.type === "gif") ? (
          <img src={assetUrl(slide.asset_url)} alt="" className="size-full" style={{ objectFit }} />
        ) : slide.type === "video" && slide.asset_url ? (
          <video src={assetUrl(slide.asset_url)} muted className="size-full" style={{ objectFit }} />
        ) : slide.type === "html" ? (
          <button type="button" onClick={onEditHtml} className="relative block size-full">
            <HtmlThumb html={slide.html_body ?? ""} className="size-full" />
            {canWrite && <span className="absolute inset-x-0 bottom-0 bg-black/55 py-1 text-center text-[10px] font-medium text-white">Tap to edit</span>}
          </button>
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground"><ImageIcon className="size-7" /></div>
        )}

        <span className="absolute left-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-background/85 px-1.5 text-xs font-medium tabular-nums shadow-sm">{index + 1}</span>
        {slide.type === "gif" && <span className="absolute bottom-2 left-2 rounded bg-background/85 px-1.5 py-0.5 text-[10px] font-semibold shadow-sm">GIF</span>}

        {canWrite && (
          <div className="absolute right-2 top-2 flex gap-1">
            <Button variant="secondary" size="icon" className="size-7 cursor-grab shadow-sm active:cursor-grabbing" title="Drag to reorder"><GripVertical className="size-3.5" /></Button>
            <Button variant="secondary" size="icon" className="size-7 shadow-sm" onClick={onSettings} title="Slide settings"><Settings2 className="size-3.5" /></Button>
            <Button variant="destructive" size="icon" className="size-7 shadow-sm" onClick={onDelete} title="Remove"><Trash2 className="size-3.5" /></Button>
          </div>
        )}
      </div>
      <CardContent className="flex items-center justify-between gap-2 p-2.5">
        <Badge variant="secondary" className="capitalize">{slide.type}</Badge>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span title="Media fit">{FIT_LABELS[fit]}</span>
          <span className="flex items-center gap-1"><Clock className="size-3" /> {slide.duration_ms ? fmtDur(slide.duration_ms) : "default"}</span>
        </span>
      </CardContent>
    </Card>
  );
}

type SlidePatch = { durationMs?: number | null; fit?: string; clipStartMs?: number | null; loop?: boolean };

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className={`flex-1 rounded-md border px-2.5 py-2 text-xs font-medium ${active ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}>{children}</button>;
}

function SlideSettingsDialog({ slide, defaultDur, onClose, onSave }: {
  slide: PlaylistSlide | null; defaultDur: number;
  onClose: () => void; onSave: (patch: SlidePatch) => void;
}) {
  const [useDefault, setUseDefault] = useState(true);
  const [secs, setSecs] = useState(6);
  const [fit, setFit] = useState<string>("contain");
  const [vmode, setVmode] = useState<"fixed" | "full" | "trim">("fixed");
  const [trim, setTrim] = useState<[number, number]>([0, 0]); // seconds
  const [gmode, setGmode] = useState<"loop" | "once">("loop");
  const [mediaLen, setMediaLen] = useState(0); // ms; video length or gif loop length

  const type = slide?.type;
  useEffect(() => {
    if (!slide) return;
    setUseDefault(slide.duration_ms == null);
    setSecs(+(((slide.duration_ms ?? defaultDur) / 1000).toFixed(1)));
    setFit(slide.fit ?? "contain");
    setMediaLen(0);
    setVmode((slide.clip_start_ms ?? 0) > 0 ? "trim" : slide.loop === 0 ? "full" : "fixed");
    setGmode(slide.loop === 0 ? "once" : "loop");
    const url = slide.asset_url ? assetUrl(slide.asset_url) : null;
    if (url && slide.type === "video") probeVideoDurationMs(url).then((ms) => { setMediaLen(ms); const s = (slide.clip_start_ms ?? 0) / 1000; setTrim([s, slide.duration_ms ? Math.min(ms / 1000, s + slide.duration_ms / 1000) : ms / 1000]); });
    else if (url && slide.type === "gif") fetchGifDurationMs(url).then(setMediaLen);
  }, [slide, defaultDur]);

  function build(): SlidePatch {
    const media = type !== "html";
    const fitP = media ? { fit } : {};
    const custom = Math.round(secs * 1000);
    if (type === "video") {
      if (vmode === "full") return { durationMs: mediaLen || custom, clipStartMs: 0, loop: false, ...fitP };
      if (vmode === "trim") { const s = Math.round(trim[0] * 1000), e = Math.round(trim[1] * 1000); return { durationMs: Math.max(300, e - s), clipStartMs: s, loop: false, ...fitP }; }
      return { durationMs: useDefault ? null : custom, clipStartMs: 0, loop: true, ...fitP };
    }
    if (type === "gif") {
      if (gmode === "once") return { durationMs: mediaLen || custom, loop: false, ...fitP };
      return { durationMs: useDefault ? null : custom, loop: true, ...fitP };
    }
    return { durationMs: useDefault ? null : custom, ...fitP };
  }

  // Whether the generic duration control applies (video-fixed / gif-loop / image / html).
  const showDuration = type === "image" || type === "html" || (type === "video" && vmode === "fixed") || (type === "gif" && gmode === "loop");

  return (
    <Dialog open={!!slide} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Slide settings</DialogTitle></DialogHeader>
        <div className="space-y-5">
          {type === "video" && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Video playback{mediaLen ? ` · ${fmtDur(mediaLen)} clip` : ""}</Label>
              <div className="flex gap-1.5">
                <Seg active={vmode === "fixed"} onClick={() => setVmode("fixed")}>Fixed length</Seg>
                <Seg active={vmode === "full"} onClick={() => setVmode("full")}>Play full</Seg>
                <Seg active={vmode === "trim"} onClick={() => setVmode("trim")}>Trim</Seg>
              </div>
              {vmode === "full" && <p className="text-xs text-muted-foreground">The slide lasts exactly as long as the video, then advances.</p>}
              {vmode === "trim" && (
                mediaLen ? (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Start {trim[0].toFixed(1)}s</span><span>End {trim[1].toFixed(1)}s</span></div>
                    <input type="range" min={0} max={mediaLen / 1000} step={0.1} value={trim[0]} onChange={(e) => setTrim(([, b]) => [Math.min(+e.target.value, b - 0.3), b])} className="w-full accent-primary" />
                    <input type="range" min={0} max={mediaLen / 1000} step={0.1} value={trim[1]} onChange={(e) => setTrim(([a]) => [a, Math.max(+e.target.value, a + 0.3)])} className="w-full accent-primary" />
                    <p className="text-xs text-muted-foreground">Plays {(trim[1] - trim[0]).toFixed(1)}s, from {trim[0].toFixed(1)}s to {trim[1].toFixed(1)}s.</p>
                  </div>
                ) : <p className="text-xs text-muted-foreground">Reading video length…</p>
              )}
            </div>
          )}

          {type === "gif" && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">GIF playback</Label>
              <div className="flex gap-1.5">
                <Seg active={gmode === "loop"} onClick={() => setGmode("loop")}>Loop</Seg>
                <Seg active={gmode === "once"} onClick={() => setGmode("once")}>Play once{mediaLen ? ` · ${fmtDur(mediaLen)}` : ""}</Seg>
              </div>
              <p className="text-xs text-muted-foreground">{gmode === "once" ? (mediaLen ? "Advances after one full loop of the GIF." : "Couldn't read the GIF length — set a duration below.") : "Loops until the slide's duration is over."}</p>
            </div>
          )}

          {showDuration && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Duration</Label>
              <div className="flex gap-1.5">
                <Seg active={useDefault} onClick={() => setUseDefault(true)}>Use default ({fmtDur(defaultDur)})</Seg>
                <Seg active={!useDefault} onClick={() => setUseDefault(false)}>Custom</Seg>
              </div>
              {!useDefault && (
                <div className="flex items-center gap-2 pt-1">
                  <Input type="number" min={0.5} step={0.5} value={secs} onChange={(e) => setSecs(Math.max(0.5, parseFloat(e.target.value || "6")))} className="w-24" />
                  <span className="text-sm text-muted-foreground">seconds</span>
                </div>
              )}
            </div>
          )}

          {type !== "html" && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Media fit</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {FITS.map((f) => <Seg key={f} active={fit === f} onClick={() => setFit(f)}>{FIT_LABELS[f]}</Seg>)}
              </div>
              <p className="text-xs text-muted-foreground">Fit = whole image (letterbox) · Fill = crop to fill · Stretch = distort to fill.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(build())}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const IMG_ASPECTS = {
  landscape: { label: "Landscape 16:9", w: 1344, h: 768 },
  square: { label: "Square 1:1", w: 1024, h: 1024 },
  portrait: { label: "Portrait 9:16", w: 768, h: 1344 },
} as const;
type Aspect = keyof typeof IMG_ASPECTS;

function AiImageDialog({ open, onOpenChange, onAdd }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  onAdd: (img: { assetHash: string; assetUrl: string; width: number; height: number; prompt: string }) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<Aspect>("landscape");
  const [models, setModels] = useState<AiModel[]>([]);
  const [modelId, setModelId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ assetHash: string; assetUrl: string } | null>(null);

  useEffect(() => { if (open) { setPrompt(""); setErr(null); setResult(null); setAspect("landscape"); } }, [open]);
  useEffect(() => { listAiModels().then((ms) => setModels(ms.filter((m) => m.task === "image"))).catch(() => {}); }, []);

  async function generate() {
    setBusy(true); setErr(null); setResult(null);
    const { w, h } = IMG_ASPECTS[aspect];
    try {
      const r = await aiGenerate({ task: "image", prompt, options: { width: w, height: h }, ...(modelId ? { modelId } : {}) });
      if (!r.ok || !r.assetUrl || !r.assetHash) throw new Error(r.detail || r.error || "Generation failed");
      setResult({ assetHash: r.assetHash, assetUrl: r.assetUrl });
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }

  async function add() {
    if (!result) return;
    const { w, h } = IMG_ASPECTS[aspect];
    setBusy(true);
    try { await onAdd({ ...result, width: w, height: h, prompt }); onOpenChange(false); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not add"); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Generate an image with AI</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. A calm abstract background with soft gradient waves" className="min-h-24" />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Aspect</Label>
              <Select value={aspect} onValueChange={(v) => setAspect(v as Aspect)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(IMG_ASPECTS) as Aspect[]).map((k) => <SelectItem key={k} value={k}>{IMG_ASPECTS[k].label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {models.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Model</Label>
                <Select value={modelId || "__default"} onValueChange={(v) => setModelId(v === "__default" ? "" : v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default">Default model</SelectItem>
                    {models.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center overflow-hidden rounded-lg border bg-muted" style={{ aspectRatio: `${IMG_ASPECTS[aspect].w} / ${IMG_ASPECTS[aspect].h}`, maxHeight: 320 }}>
            {result ? (
              <img src={assetUrl(result.assetUrl)} alt="" className="size-full object-contain" />
            ) : (
              <div className="p-6 text-center text-xs text-muted-foreground">{busy ? "Generating…" : "Your image will appear here."}</div>
            )}
          </div>

          {err && <p className="text-sm text-destructive">{err}</p>}
          <p className="text-xs text-muted-foreground">Uses your AI credits · applies your brand palette automatically.</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          {result ? (
            <>
              <Button variant="outline" disabled={busy} onClick={generate}>Regenerate</Button>
              <Button disabled={busy} onClick={add}>Add to playlist</Button>
            </>
          ) : (
            <Button disabled={busy || !prompt.trim()} onClick={generate}>{busy ? "Generating…" : "Generate"}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
