/**
 * Music Playlists — the list→detail pattern for the reusable-entities model (§16),
 * mirroring the Slide playlists library. A music playlist is authored once and
 * referenced by any number of channels. Tracks are sourced four ways — upload,
 * AI generation, pick from the Media library, or the public (licensed) library —
 * and every upload/generation lands in the Media library as an `audio` asset, so
 * removing a track never deletes it and deleting a playlist keeps its media unless
 * you opt in. Rich per-track meta (artist, album, genres, vocal/instrumental,
 * cover art) is editable inline; the playlist summarizes the genres it contains.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Plus, Music, Music2, Upload, Trash2, Shuffle, MoreVertical, Search, Tag as TagIcon,
  Pencil, GripVertical, SlidersHorizontal, Sparkles, Library, Images, ShieldCheck, Mic, Disc3,
} from "lucide-react";
import { Button } from "../components/ui/button.js";
import { cn } from "@/lib/utils";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { Textarea } from "../components/ui/textarea.js";
import { Badge } from "../components/ui/badge.js";
import { Switch } from "../components/ui/switch.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog.js";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "../components/ui/table.js";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "../components/ui/dropdown-menu.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.js";
import { PageHeader } from "../components/page-header.js";
import { EmptyState } from "../components/empty-state.js";
import { LoadError } from "../components/load-error.js";
import { TagEditor } from "../components/tag-editor.js";
import { TagFilter } from "../components/tag-filter.js";
import { ConfirmDialog } from "../components/confirm-dialog.js";
import { usePageChrome } from "../components/page-chrome.js";
import { useCan } from "../permissions.js";
import { toast } from "../components/toast.js";
import { confirmDialog } from "../components/confirm.js";
import { offerPublishAffected } from "../components/publish-affected.js";
import { TrackMetaDialog, mmss } from "../components/track-meta-dialog.js";
import { LicenseBadge, LicenseNote } from "../components/licensing.js";
import { MediaPicker } from "./MediaLibrary.js";
import {
  listMusicPlaylists, createMusicPlaylist, getMusicPlaylist, updateMusicPlaylist, deleteMusicPlaylist,
  addPlaylistTrack, updatePlaylistTrack, deletePlaylistTrack, reorderPlaylistTracksApi, addPublicTrackToPlaylist,
  uploadToLibrary, registerMedia, aiGenerate, listAiModels, browseLibrary, assetUrl,
  type MusicPlaylist, type PlaylistTrack, type Media, type AiModel, type LibraryBrowse,
} from "../api.js";

/** Long-form total-duration label (e.g. "3 tracks · 12 min"). */
function fmtTotal(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 1) return `${Math.round(ms / 1000)}s`;
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`;
}
function parseGenres(raw: string | null | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; }
}

/* ================================ List view ============================== */

export function MusicPlaylistsPage() {
  const can = useCan();
  const canCreate = can("content", "create");
  const canWrite = can("content", "update");
  const canDelete = can("content", "delete");
  const navigate = useNavigate();
  const [playlists, setPlaylists] = useState<MusicPlaylist[] | null>(null);
  const [q, setQ] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [rename, setRename] = useState<MusicPlaylist | null>(null);
  const [tagsOf, setTagsOf] = useState<MusicPlaylist | null>(null);
  const [del, setDel] = useState<MusicPlaylist | null>(null);

  const [loadFailed, setLoadFailed] = useState(false);
  const reload = () => listMusicPlaylists().then((p) => { setPlaylists(p); setLoadFailed(false); }).catch(() => { setPlaylists((prev) => prev ?? []); setLoadFailed(true); });
  useEffect(() => { reload(); }, []);

  usePageChrome(
    { crumbs: [{ label: "Music playlists" }], actions: canCreate ? [{ key: "new", label: "New playlist", icon: <Plus className="size-4" />, onClick: () => setNewOpen(true) }] : [] },
    [canCreate],
  );

  const allTags = useMemo(() => [...new Set((playlists ?? []).flatMap((p) => p.tags ?? []))].sort(), [playlists]);
  const filtered = useMemo(() => {
    if (!playlists) return null;
    const needle = q.trim().toLowerCase();
    return playlists.filter(
      (p) => (!needle || p.name.toLowerCase().includes(needle) || (p.genres ?? []).some((g) => g.toLowerCase().includes(needle))) &&
        (activeTags.length === 0 || (p.tags ?? []).some((t) => activeTags.includes(t))),
    );
  }, [playlists, q, activeTags]);

  return (
    <div>
      <PageHeader
        title="Music playlists"
        description={playlists ? `${playlists.length} playlist${playlists.length === 1 ? "" : "s"} · reusable across channels` : "Reusable sequences of tracks you can assign to any channel."}
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

      {loadFailed && <LoadError what="playlists" onRetry={reload} />}
      {!playlists ? (
        <div className="overflow-hidden rounded-xl bg-card shadow-sm">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="m-2 h-12 rounded-lg" />)}
        </div>
      ) : playlists.length === 0 ? (
        <EmptyState
          scena="idle"
          title="No music playlists yet"
          description="Create one, fill it with tracks, then assign it to any channel — author once, reuse everywhere."
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
                <TableHead className="w-20 text-right">Tracks</TableHead>
                <TableHead className="w-28">Length</TableHead>
                <TableHead className="hidden md:table-cell">Genres</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(filtered ?? []).map((p) => (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/music/${p.id}`)}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Music className="size-4" /></div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{p.name}</span>
                          {p.shuffle ? <Shuffle className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                        </div>
                        {(p.tags?.length ?? 0) > 0 && (
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {p.tags!.slice(0, 4).map((t) => <span key={t} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">{t}</span>)}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{p.trackCount ?? 0}</TableCell>
                  <TableCell className="text-muted-foreground">{p.totalMs ? fmtTotal(p.totalMs) : "—"}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {(p.genres ?? []).slice(0, 3).map((g) => <Badge key={g} variant="secondary" className="font-normal">{g}</Badge>)}
                      {(p.genres?.length ?? 0) > 3 && <span className="text-xs text-muted-foreground">+{p.genres!.length - 3}</span>}
                    </div>
                  </TableCell>
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

      <NewPlaylistDialog open={newOpen} onOpenChange={setNewOpen} onCreated={(id) => navigate(`/music/${id}`)} />
      <RenamePlaylistDialog playlist={rename} onClose={() => setRename(null)} onSaved={reload} />
      <TagsPlaylistDialog playlist={tagsOf} onClose={() => setTagsOf(null)} onSaved={reload} />
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={del ? `Delete "${del.name}"?` : ""}
        description="This removes the playlist. Any channel using it loses this music (the tracks in the Media library are kept). This can't be undone."
        confirmLabel="Delete playlist"
        destructive
        onConfirm={async () => {
          if (!del) return;
          try { await deleteMusicPlaylist(del.id); toast.success("Playlist deleted"); setDel(null); reload(); }
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
      const id = await createMusicPlaylist(name.trim() || "Music playlist");
      onOpenChange(false); setName(""); onCreated(id); toast.success("Playlist created.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not create playlist"); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New music playlist</DialogTitle></DialogHeader>
        <Input autoFocus placeholder="e.g. Cafe ambient" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={create} disabled={busy}>{busy ? "Creating…" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenamePlaylistDialog({ playlist, onClose, onSaved }: { playlist: MusicPlaylist | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  useEffect(() => { setName(playlist?.name ?? ""); }, [playlist]);
  async function save() {
    if (!playlist) return;
    const n = name.trim();
    if (!n || n === playlist.name) { onClose(); return; }
    try { await updateMusicPlaylist(playlist.id, { name: n }); toast.success("Renamed"); onClose(); onSaved(); }
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

function TagsPlaylistDialog({ playlist, onClose, onSaved }: { playlist: MusicPlaylist | null; onClose: () => void; onSaved: () => void }) {
  const [tags, setTags] = useState<string[]>([]);
  useEffect(() => { setTags(playlist?.tags ?? []); }, [playlist]);
  async function save() {
    if (!playlist) return;
    try { await updateMusicPlaylist(playlist.id, { tags }); toast.success("Tags saved"); onClose(); onSaved(); }
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

/* =============================== Detail view ============================= */

export function MusicPlaylistDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const can = useCan();
  const canWrite = can("content", "update");
  const canDelete = can("content", "delete");
  const [pl, setPl] = useState<(MusicPlaylist & { tracks: PlaylistTrack[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [publicOpen, setPublicOpen] = useState(false);
  const [editTrack, setEditTrack] = useState<PlaylistTrack | null>(null);
  const [delOpen, setDelOpen] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const audioInput = useRef<HTMLInputElement>(null);

  const tracks = pl?.tracks ?? [];

  const load = () => getMusicPlaylist(id).then((p) => setPl({ ...p, tracks: p.tracks.map((t) => ({ ...t, genres: parseGenres(t.genres as unknown as string) })) })).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, [id]);

  async function uploadMany(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const m = await uploadToLibrary(file); // lands in the Media library (kind=audio)
        await addPlaylistTrack(id, { title: file.name.replace(/\.[^.]+$/, ""), assetHash: m.hash, assetUrl: m.url, durationMs: m.durationMs ?? 1000, mediaId: m.id });
      }
      await load();
      toast.success(`${files.length} track${files.length === 1 ? "" : "s"} added.`);
      void offerPublishAffected("music", id);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); }
    finally { setBusy(false); }
  }

  /** Turn Media-library audio into tracks (media stays in the library). */
  async function addFromLibrary(items: Media[]) {
    for (const m of items) {
      if (m.kind !== "audio" || !m.asset_hash || !m.asset_url) continue;
      await addPlaylistTrack(id, {
        title: m.name, artist: m.artist ?? undefined, album: m.album ?? undefined,
        assetHash: m.asset_hash, assetUrl: m.asset_url, durationMs: m.duration_ms ?? 1000,
        artHash: m.art_hash ?? undefined, artUrl: m.art_url ?? undefined,
        genres: parseGenres(m.genres), vocal: m.vocal ?? undefined, mediaId: m.id,
      });
    }
    await load();
    toast.success(`${items.length} track${items.length === 1 ? "" : "s"} added.`);
    void offerPublishAffected("music", id);
  }

  async function removeTrack(tid: string, title: string) {
    const ok = await confirmDialog({
      title: `Remove “${title}”?`,
      description: "It leaves this playlist but stays in your Media library.",
      confirmText: "Remove track", destructive: true,
    });
    if (!ok) return;
    try { await deletePlaylistTrack(id, tid); await load(); toast.success("Track removed."); void offerPublishAffected("music", id); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not remove track"); }
  }

  function drop(to: number) {
    if (drag === null || drag === to) { setDrag(null); setOver(null); return; }
    const next = [...tracks];
    const [moved] = next.splice(drag, 1);
    if (!moved) { setDrag(null); setOver(null); return; }
    next.splice(to, 0, moved);
    setPl((p) => (p ? { ...p, tracks: next } : p));
    reorderPlaylistTracksApi(id, next.map((t) => t.id)).then(() => offerPublishAffected("music", id)).catch(() => load());
    setDrag(null); setOver(null);
  }

  async function patch(p: { name?: string; shuffle?: boolean; tags?: string[] }) {
    setPl((prev) => (prev ? { ...prev, ...p, shuffle: p.shuffle !== undefined ? (p.shuffle ? 1 : 0) : prev.shuffle } : prev));
    try {
      await updateMusicPlaylist(id, p);
      // Shuffle changes what screens play; a rename/tag edit doesn't.
      if ("shuffle" in p) void offerPublishAffected("music", id);
    }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); load(); }
  }

  const title = pl?.name || "Music playlist";
  const totalMs = tracks.reduce((s, t) => s + t.duration_ms, 0);
  const genres = useMemo(() => [...new Set(tracks.flatMap((t) => t.genres ?? []))].sort(), [tracks]);
  const vocalN = tracks.filter((t) => t.vocal === "vocal").length;
  const instN = tracks.filter((t) => t.vocal === "instrumental").length;

  usePageChrome(
    {
      crumbs: [{ label: "Music playlists", to: "/music" }, { label: pl?.name ?? "Playlist" }],
      actions: [
        ...(canWrite ? [{
          key: "add", label: "Add", icon: <Plus className="size-4" />, disabled: busy,
          items: [
            { key: "upload", label: "Upload audio", icon: <Upload className="size-4" />, onClick: () => audioInput.current?.click() },
            { key: "ai", label: "Generate with AI", icon: <Sparkles className="size-4" />, onClick: () => setAiOpen(true) },
            { key: "lib", label: "Pick from media library", icon: <Images className="size-4" />, onClick: () => setPickerOpen(true) },
            { key: "public", label: "Public library", icon: <Library className="size-4" />, onClick: () => setPublicOpen(true) },
          ],
        }] : []),
        ...(canDelete ? [{ key: "delete", label: "Delete playlist", icon: <Trash2 className="size-4" />, variant: "destructive" as const, overflow: "always" as const, onClick: () => setDelOpen(true) }] : []),
      ],
    },
    [pl?.name, canWrite, canDelete, busy],
  );

  return (
    <div>
      <input ref={audioInput} type="file" accept="audio/*" multiple className="hidden" onChange={(e) => { uploadMany(e.target.files); e.target.value = ""; }} />

      <PageHeader
        title={canWrite ? <EditablePlaylistName name={title} onRename={(n) => patch({ name: n })} /> : title}
        description={`${tracks.length} track${tracks.length === 1 ? "" : "s"}${totalMs ? ` · ${fmtTotal(totalMs)}` : ""} · reusable across channels`}
        back={{ label: "All playlists", onClick: () => navigate("/music") }}
      >
        {(canWrite || (pl?.tags?.length ?? 0) > 0) && (
          <div className="mt-3 flex min-w-0 items-center gap-1.5">
            <TagIcon className="size-3.5 shrink-0 text-muted-foreground" />
            {canWrite ? (
              <TagEditor tags={pl?.tags ?? []} onChange={(tags) => patch({ tags })} placeholder="Add tags…" className="min-w-[220px] border-none px-0 py-0 focus-within:ring-0" />
            ) : (
              <div className="flex flex-wrap gap-1">{(pl?.tags ?? []).map((t) => <span key={t} className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">{t}</span>)}</div>
            )}
          </div>
        )}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Tracks */}
        <div>
          {!loading && tracks.length > 0 && <LicenseNote scope="music" />}
          {loading ? (
            <div className="overflow-hidden rounded-xl bg-card shadow-sm">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="m-2 h-12 rounded-lg" />)}
            </div>
          ) : tracks.length === 0 ? (
            <EmptyState icon={<Music2 />} title="No tracks yet" description={canWrite ? "Use Add to upload audio, generate with AI, or pick from your Media or the public library." : "This playlist has no tracks yet."} />
          ) : (
            <div className="overflow-hidden rounded-xl bg-card shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {canWrite && <TableHead className="w-8" />}
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>Track</TableHead>
                    <TableHead className="hidden sm:table-cell">Artist</TableHead>
                    <TableHead className="hidden lg:table-cell">Genres</TableHead>
                    <TableHead className="w-20 text-right">Length</TableHead>
                    {canWrite && <TableHead className="w-20" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tracks.map((t, i) => (
                    <TrackRow
                      key={t.id}
                      track={t}
                      index={i}
                      canWrite={canWrite}
                      dragging={drag === i}
                      over={over === i && drag !== null && drag !== i}
                      onDragStart={() => setDrag(i)}
                      onDragEnter={() => setOver(i)}
                      onDragEnd={() => { setDrag(null); setOver(null); }}
                      onDrop={() => drop(i)}
                      onEdit={() => setEditTrack(t)}
                      onDelete={() => removeTrack(t.id, t.title)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Summary sidebar */}
        <aside className="space-y-4 lg:sticky lg:top-2 lg:self-start">
          <div className="rounded-xl bg-card p-4 shadow-sm">
            <h3 className="text-sm font-semibold">Playback</h3>
            <label className="mt-3 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm"><Shuffle className="size-4 text-muted-foreground" /> Shuffle</span>
              <Switch checked={!!pl?.shuffle} disabled={!canWrite} onCheckedChange={(v) => patch({ shuffle: v })} />
            </label>
            <p className="mt-1.5 text-xs text-muted-foreground">Deterministic per cycle — every screen shuffles identically.</p>
          </div>

          <div className="rounded-xl bg-card p-4 shadow-sm">
            <h3 className="text-sm font-semibold">In this playlist</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between"><dt className="text-muted-foreground">Tracks</dt><dd className="font-medium tabular-nums">{tracks.length}</dd></div>
              <div className="flex items-center justify-between"><dt className="text-muted-foreground">Total time</dt><dd className="font-medium tabular-nums">{totalMs ? mmss(totalMs) : "—"}</dd></div>
              <div className="flex items-center justify-between"><dt className="text-muted-foreground">Vocal / Instrumental</dt><dd className="font-medium tabular-nums">{vocalN} / {instN}</dd></div>
            </dl>
            {genres.length > 0 && (
              <div className="mt-3">
                <div className="mb-1.5 text-xs text-muted-foreground">Genres</div>
                <div className="flex flex-wrap gap-1">{genres.map((g) => <Badge key={g} variant="secondary" className="font-normal">{g}</Badge>)}</div>
              </div>
            )}
          </div>
        </aside>
      </div>

      <MediaPicker open={pickerOpen} onOpenChange={setPickerOpen} onPick={addFromLibrary} kinds={["audio"]} title="Pick tracks from your library" />
      <AiMusicDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        onAdd={async (r) => {
          const name = r.prompt.trim().slice(0, 60) || "AI track";
          const mediaId = await registerMedia({ kind: "audio", name, assetHash: r.assetHash, assetUrl: r.assetUrl, durationMs: r.durationMs, source: "ai", genres: ["AI"] }).catch(() => undefined);
          await addPlaylistTrack(id, { title: name, assetHash: r.assetHash, assetUrl: r.assetUrl, durationMs: r.durationMs, genres: ["AI"], mediaId });
          await load();
          toast.success("AI track added.");
          void offerPublishAffected("music", id);
        }}
      />
      <PublicLibraryDialog
        open={publicOpen}
        onOpenChange={setPublicOpen}
        onAdd={async (libraryIds) => {
          let ok = 0; let blocked: string | null = null;
          for (const lid of libraryIds) {
            const r = await addPublicTrackToPlaylist(id, lid);
            if (r.id) ok++; else if (r.error) blocked = r.error === "library limit reached" ? `Library limit reached (${r.used}/${r.limit}).` : r.error;
          }
          await load();
          if (ok) { toast.success(`${ok} licensed track${ok === 1 ? "" : "s"} added.`); void offerPublishAffected("music", id); }
          if (blocked) toast.error(blocked);
        }}
      />
      <TrackMetaDialog
        open={!!editTrack}
        onOpenChange={(o) => !o && setEditTrack(null)}
        initial={editTrack ? { title: editTrack.title, artist: editTrack.artist ?? "", album: editTrack.album ?? "", genres: editTrack.genres ?? [], vocal: (editTrack.vocal as "vocal" | "instrumental" | "") ?? "", artHash: editTrack.art_hash ?? null, artUrl: editTrack.art_url ?? null } : null}
        onSave={async (p) => {
          if (!editTrack) return;
          const tid = editTrack.id;
          setPl((prev) => (prev ? { ...prev, tracks: prev.tracks.map((t) => (t.id === tid ? { ...t, title: p.title, artist: p.artist, album: p.album, genres: p.genres, vocal: p.vocal || null, art_hash: p.artHash, art_url: p.artUrl } : t)) } : prev));
          await updatePlaylistTrack(id, tid, { title: p.title, artist: p.artist, album: p.album, genres: p.genres, vocal: p.vocal || null, artHash: p.artHash, artUrl: p.artUrl });
          toast.success("Track updated.");
          void offerPublishAffected("music", id);
        }}
      />
      <DeletePlaylistDialog
        open={delOpen} onOpenChange={setDelOpen} name={title}
        onConfirm={async (alsoMedia) => { try { await deleteMusicPlaylist(id, alsoMedia); toast.success("Playlist deleted"); navigate("/music"); } catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); } }}
      />
    </div>
  );
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

function TrackRow({ track, index, canWrite, dragging, over, onDragStart, onDragEnter, onDragEnd, onDrop, onEdit, onDelete }: {
  track: PlaylistTrack; index: number; canWrite: boolean; dragging: boolean; over: boolean;
  onDragStart: () => void; onDragEnter: () => void; onDragEnd: () => void; onDrop: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const licensed = !!track.library_id;
  return (
    <TableRow
      draggable={canWrite}
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={onDragEnd}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
      className={cn(dragging && "opacity-40", over && "border-t-2 border-t-primary")}
    >
      {canWrite && (
        <TableCell className="pr-0">
          <span className="cursor-grab text-muted-foreground/50 active:cursor-grabbing" title="Drag to reorder"><GripVertical className="size-4" /></span>
        </TableCell>
      )}
      <TableCell className="text-center tabular-nums text-muted-foreground">{index + 1}</TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">
            {track.art_url ? <img src={assetUrl(track.art_url)} alt="" className="size-full object-cover" /> : <Music className="size-4" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium">{track.title}</span>
              {licensed && <LicenseBadge source="public" />}
            </div>
            {/* Artist + vocal marker collapse into this cell below the sm breakpoint. */}
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground sm:hidden">
              <span className="truncate">{track.artist || "Unknown artist"}</span>
              {track.vocal && <span className="inline-flex shrink-0 items-center gap-0.5">· {track.vocal === "vocal" ? <Mic className="size-3" /> : <Disc3 className="size-3" />}{track.vocal === "vocal" ? "Vocal" : "Instr."}</span>}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden text-muted-foreground sm:table-cell">
        <div className="flex items-center gap-1.5">
          <span className="truncate">{track.artist || "Unknown artist"}</span>
          {track.vocal && <span className="inline-flex shrink-0 items-center gap-0.5 text-xs">{track.vocal === "vocal" ? <Mic className="size-3" /> : <Disc3 className="size-3" />}{track.vocal === "vocal" ? "Vocal" : "Instr."}</span>}
        </div>
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <div className="flex flex-wrap gap-1">
          {(track.genres ?? []).slice(0, 3).map((g) => <Badge key={g} variant="secondary" className="font-normal">{g}</Badge>)}
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">{mmss(track.duration_ms)}</TableCell>
      {canWrite && (
        <TableCell>
          <div className="flex items-center justify-end gap-0.5">
            <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" onClick={onEdit} title="Edit details"><SlidersHorizontal className="size-4" /></Button>
            <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={onDelete} title="Remove"><Trash2 className="size-4" /></Button>
          </div>
        </TableCell>
      )}
    </TableRow>
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
        <p className="text-sm text-muted-foreground">This removes the playlist. Any channel using it loses this music. This can't be undone.</p>
        <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <span className="min-w-0">
            <span className="block text-sm font-medium">Also delete tracks from the library</span>
            <span className="block text-xs text-muted-foreground">Permanently removes these tracks' audio from the Media library and storage.</span>
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

/* ------------------------------ AI generation ---------------------------- */

const MUSIC_LENGTHS = [
  { label: "15s", secs: 15 },
  { label: "20s", secs: 20 },
  { label: "30s", secs: 30 },
] as const;

function AiMusicDialog({ open, onOpenChange, onAdd }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  onAdd: (r: { assetHash: string; assetUrl: string; durationMs: number; prompt: string }) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState("");
  const [secs, setSecs] = useState(15);
  const [models, setModels] = useState<AiModel[]>([]);
  const [modelId, setModelId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ assetHash: string; assetUrl: string; durationMs: number } | null>(null);

  useEffect(() => { if (open) { setPrompt(""); setErr(null); setResult(null); setSecs(15); } }, [open]);
  useEffect(() => { listAiModels().then((ms) => setModels(ms.filter((m) => m.task === "music"))).catch(() => {}); }, []);

  async function generate() {
    setBusy(true); setErr(null); setResult(null);
    try {
      const r = await aiGenerate({ task: "music", prompt, options: { durationSec: secs }, ...(modelId ? { modelId } : {}) });
      if (!r.ok || !r.assetUrl || !r.assetHash) throw new Error(r.detail || r.error || "Generation failed");
      setResult({ assetHash: r.assetHash, assetUrl: r.assetUrl, durationMs: r.durationMs ?? secs * 1000 });
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }

  async function add() {
    if (!result) return;
    setBusy(true);
    try { await onAdd({ ...result, prompt }); onOpenChange(false); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not add"); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Generate music with AI</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. Warm lo-fi hip-hop with soft piano and vinyl crackle" className="min-h-24" />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Length</Label>
              <div className="flex gap-1.5">
                {MUSIC_LENGTHS.map((l) => (
                  <button key={l.secs} type="button" onClick={() => setSecs(l.secs)}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium ${secs === l.secs ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}>{l.label}</button>
                ))}
              </div>
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

          {result && (
            <div className="rounded-lg border bg-muted/40 p-3">
              <audio controls src={assetUrl(result.assetUrl)} className="w-full" />
            </div>
          )}
          {err && <p className="text-sm text-destructive">{err}</p>}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" /> Uses your AI credits · generated music is licensed to you.</p>
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

/* --------------------------- Public library pick -------------------------- */

function PublicLibraryDialog({ open, onOpenChange, onAdd }: {
  open: boolean; onOpenChange: (o: boolean) => void; onAdd: (libraryIds: string[]) => Promise<void>;
}) {
  const [data, setData] = useState<LibraryBrowse | null>(null);
  const [genre, setGenre] = useState<string>("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSel(new Set()); setQ(""); setGenre(""); setData(null);
    browseLibrary().then(setData).catch(() => setData({ enabled: false, limit: 0, used: 0, genres: [], tracks: [] }));
  }, [open]);

  const tracks = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.tracks ?? []).filter((t) => (!genre || t.genre === genre) && (!needle || t.title.toLowerCase().includes(needle) || (t.artist ?? "").toLowerCase().includes(needle)));
  }, [data, genre, q]);

  function toggle(idv: string) { setSel((s) => { const n = new Set(s); n.has(idv) ? n.delete(idv) : n.add(idv); return n; }); }

  async function confirm() {
    if (!sel.size) return;
    setBusy(true);
    try { await onAdd([...sel]); onOpenChange(false); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">Public library <LicenseBadge source="public" /></DialogTitle>
        </DialogHeader>
        {!data ? (
          <div className="space-y-2 py-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
        ) : !data.enabled ? (
          <EmptyState icon={<Library />} title="Public library not in your plan" description="Upgrade to a plan that includes the licensed music library to use these tracks." className="border-0 bg-transparent py-8" />
        ) : (
          <>
            <p className="text-xs text-muted-foreground">Licensed for your commercial use. {data.limit >= 0 ? `Using ${data.used}/${data.limit} library tracks.` : `Using ${data.used} library tracks (unlimited).`}</p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tracks…" className="w-full pl-8" />
              </div>
              {data.genres.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setGenre("")} className={`rounded-full border px-2.5 py-1 text-xs font-medium ${genre === "" ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}>All</button>
                  {data.genres.map((g) => (
                    <button key={g.genre} type="button" onClick={() => setGenre(g.genre)} className={`rounded-full border px-2.5 py-1 text-xs font-medium ${genre === g.genre ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}>{g.genre}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="max-h-[52vh] space-y-1.5 overflow-y-auto">
              {tracks.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">No tracks found.</div>
              ) : tracks.map((t) => {
                const on = sel.has(t.id);
                return (
                  <button key={t.id} type="button" onClick={() => toggle(t.id)}
                    className={`flex w-full items-center gap-3 rounded-lg border-2 px-3 py-2 text-left transition-colors ${on ? "border-primary bg-primary/5" : "border-transparent bg-muted/40 hover:bg-muted"}`}>
                    <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-background text-muted-foreground">
                      {t.art_url ? <img src={assetUrl(t.art_url)} alt="" className="size-full object-cover" /> : <Music className="size-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{t.title}</div>
                      <div className="truncate text-xs text-muted-foreground">{[t.artist || "Unknown", t.genre, t.vocal].filter(Boolean).join(" · ")}</div>
                    </div>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{mmss(t.duration_ms)}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy || sel.size === 0 || !data?.enabled} onClick={confirm}>{busy ? "Adding…" : `Add ${sel.size || ""}`.trim()}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
