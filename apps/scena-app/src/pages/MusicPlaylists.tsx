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
  Plus,
  Music,
  Music2,
  Upload,
  Trash2,
  Shuffle,
  Search,
  Tag as TagIcon,
  Pencil,
  GripVertical,
  SlidersHorizontal,
  Sparkles,
  Library,
  Images,
  ShieldCheck,
  Mic,
  Disc3,
} from "lucide-react";
import { TagEditor } from "../components/tag-editor.js";
import { useCan } from "../permissions.js";
import { confirmDialog } from "../components/confirm.js";
import { offerPublishAffected } from "../components/publish-affected.js";
import { TrackMetaDialog, mmss } from "../components/track-meta-dialog.js";
import { LicenseBadge, LicenseNote } from "../components/licensing.js";
import { MediaPicker } from "./MediaLibrary.js";
import { Badge, Button, cn, Dialog, DialogContent, DialogFooter, EmptyState, Group, Input, Label, LoadError, PageHeader, Row, Select, Skeleton, Switch, Textarea, toast, usePageChrome } from "@4dl/ui";
import { PlaylistLibrary } from "../components/playlist-library.js";
import {
  listMusicPlaylists,
  createMusicPlaylist,
  getMusicPlaylist,
  updateMusicPlaylist,
  deleteMusicPlaylist,
  addPlaylistTrack,
  updatePlaylistTrack,
  deletePlaylistTrack,
  reorderPlaylistTracksApi,
  addPublicTrackToPlaylist,
  uploadToLibrary,
  registerMedia,
  aiGenerate,
  listAiModels,
  browseLibrary,
  assetUrl,
  type MusicPlaylist,
  type PlaylistTrack,
  type Media,
  type AiModel,
  type LibraryBrowse,
} from "../api.js";

/** Long-form total-duration label (e.g. "3 tracks · 12 min"). */
function fmtTotal(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 1) return `${Math.round(ms / 1000)}s`;
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`;
}
/**
 * The four table columns that became one line — count, length, genres, tags.
 *
 * Shuffle was a small icon beside the name with no label, which is a state a
 * screenshot cannot explain; it is the row's icon now AND named here. The genre
 * list is capped at three because a playlist with a dozen would push the count
 * and the length off the end of a truncating line.
 */
function subLine(p: MusicPlaylist): string {
  const n = p.trackCount ?? 0;
  const genres = p.genres ?? [];
  const parts = [
    `${n} track${n === 1 ? "" : "s"}`,
    p.totalMs ? fmtTotal(p.totalMs) : null,
    p.shuffle ? "Shuffled" : null,
    genres.length ? genres.slice(0, 3).join(", ") + (genres.length > 3 ? ` +${genres.length - 3}` : "") : null,
    p.tags?.length ? p.tags.map((t) => `#${t}`).join(" ") : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

function parseGenres(raw: string | null | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/* ================================ List view ============================== */

export function MusicPlaylistsPage() {
  const can = useCan();
  const navigate = useNavigate();
  const [playlists, setPlaylists] = useState<MusicPlaylist[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    setError(null);
    return listMusicPlaylists()
      .then(setPlaylists)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };
  useEffect(() => {
    reload();
  }, []);

  /*
    The failed-load branch here was its own bug, distinct from the slide list's:
    the catch wrote `[]` into the same state the empty branch reads, so a server
    that could not be reached rendered `LoadError` AND "No music playlists yet"
    STACKED — a retry button under a sentence claiming there is nothing to
    retry for. `Collection` has one state at a time by construction.
  */
  return (
    <PlaylistLibrary
      noun="playlists"
      items={playlists}
      error={error}
      reload={reload}
      perms={{ create: can("content", "create"), write: can("content", "update"), delete: can("content", "delete") }}
      create={(name) => createMusicPlaylist(name)}
      update={(id, patch) => updateMusicPlaylist(id, patch)}
      remove={(id) => deleteMusicPlaylist(id)}
      onCreated={(id) => navigate(`/music/${id}`)}
      createLabel="New playlist"
      createTitle="New music playlist"
      createPlaceholder="e.g. Cafe ambient"
      defaultName="Music playlist"
      empty={{
        icon: Music,
        title: "No music playlists yet",
        description: "Create one, fill it with tracks, then assign it to any channel — author once, reuse everywhere.",
      }}
      deleteDescription="This removes the playlist. Any channel using it loses this music (the tracks in the Media library are kept). This can't be undone."
      // A playlist is findable by the music in it, not only by what it was
      // called — the genre summary is the closest thing to a track listing the
      // list view has.
      searchText={(p) => (p.genres ?? []).join(" ")}
      row={(p, menu) => (
        <Row icon={p.shuffle ? Shuffle : Music} iconTone="primary" onClick={() => navigate(`/music/${p.id}`)} sub={subLine(p)} trailing={menu}>
          {p.name}
        </Row>
      )}
    />
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

  const [error, setError] = useState<string | null>(null);
  // `.catch(() => {})` left `pl` null, `loading` false and nothing said — which
  // renders "No tracks yet" to somebody whose playlist did not load. A failed
  // load is a state of its own, with the message and a retry.
  const load = () => {
    setError(null);
    return getMusicPlaylist(id)
      .then((p) => setPl({ ...p, tracks: p.tracks.map((t) => ({ ...t, genres: parseGenres(t.genres as unknown as string) })) }))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, [id]);

  async function uploadMany(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const m = await uploadToLibrary(file); // lands in the Media library (kind=audio)
        await addPlaylistTrack(id, {
          title: file.name.replace(/\.[^.]+$/, ""),
          assetHash: m.hash,
          assetUrl: m.url,
          durationMs: m.durationMs ?? 1000,
          mediaId: m.id,
        });
      }
      await load();
      toast.success(`${files.length} track${files.length === 1 ? "" : "s"} added.`);
      void offerPublishAffected("music", id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  /** Turn Media-library audio into tracks (media stays in the library). */
  async function addFromLibrary(items: Media[]) {
    for (const m of items) {
      if (m.kind !== "audio" || !m.asset_hash || !m.asset_url) continue;
      await addPlaylistTrack(id, {
        title: m.name,
        artist: m.artist ?? undefined,
        album: m.album ?? undefined,
        assetHash: m.asset_hash,
        assetUrl: m.asset_url,
        durationMs: m.duration_ms ?? 1000,
        artHash: m.art_hash ?? undefined,
        artUrl: m.art_url ?? undefined,
        genres: parseGenres(m.genres),
        vocal: m.vocal ?? undefined,
        mediaId: m.id,
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
      confirmText: "Remove track",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deletePlaylistTrack(id, tid);
      await load();
      toast.success("Track removed.");
      void offerPublishAffected("music", id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove track");
    }
  }

  function drop(to: number) {
    if (drag === null || drag === to) {
      setDrag(null);
      setOver(null);
      return;
    }
    const next = [...tracks];
    const [moved] = next.splice(drag, 1);
    if (!moved) {
      setDrag(null);
      setOver(null);
      return;
    }
    next.splice(to, 0, moved);
    setPl((p) => (p ? { ...p, tracks: next } : p));
    reorderPlaylistTracksApi(
      id,
      next.map((t) => t.id),
    )
      .then(() => offerPublishAffected("music", id))
      .catch(() => load());
    setDrag(null);
    setOver(null);
  }

  async function patch(p: { name?: string; shuffle?: boolean; tags?: string[] }) {
    setPl((prev) => (prev ? { ...prev, ...p, shuffle: p.shuffle !== undefined ? (p.shuffle ? 1 : 0) : prev.shuffle } : prev));
    try {
      await updateMusicPlaylist(id, p);
      // Shuffle changes what screens play; a rename/tag edit doesn't.
      if ("shuffle" in p) void offerPublishAffected("music", id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
      load();
    }
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
        ...(canWrite
          ? [
              {
                key: "add",
                label: "Add",
                icon: <Plus className="size-4" />,
                disabled: busy,
                items: [
                  { key: "upload", label: "Upload audio", icon: <Upload className="size-4" />, onClick: () => audioInput.current?.click() },
                  { key: "ai", label: "Generate with AI", icon: <Sparkles className="size-4" />, onClick: () => setAiOpen(true) },
                  { key: "lib", label: "Pick from media library", icon: <Images className="size-4" />, onClick: () => setPickerOpen(true) },
                  { key: "public", label: "Public library", icon: <Library className="size-4" />, onClick: () => setPublicOpen(true) },
                ],
              },
            ]
          : []),
        ...(canDelete
          ? [
              {
                key: "delete",
                label: "Delete playlist",
                icon: <Trash2 className="size-4" />,
                variant: "destructive" as const,
                overflow: "always" as const,
                onClick: () => setDelOpen(true),
              },
            ]
          : []),
      ],
    },
    [pl?.name, canWrite, canDelete, busy],
  );

  return (
    <div>
      <input
        ref={audioInput}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        onChange={(e) => {
          uploadMany(e.target.files);
          e.target.value = "";
        }}
      />

      <PageHeader
        title={canWrite ? <EditablePlaylistName name={title} onRename={(n) => patch({ name: n })} /> : title}
        description={`${tracks.length} track${tracks.length === 1 ? "" : "s"}${totalMs ? ` · ${fmtTotal(totalMs)}` : ""} · reusable across channels`}
        back={{ label: "All playlists", onClick: () => navigate("/music") }}
      >
        {(canWrite || (pl?.tags?.length ?? 0) > 0) && (
          <div className="mt-3 flex min-w-0 items-center gap-1.5">
            <TagIcon className="size-3.5 shrink-0 text-muted-foreground" />
            {canWrite ? (
              <TagEditor
                tags={pl?.tags ?? []}
                onChange={(tags) => patch({ tags })}
                placeholder="Add tags…"
                className="min-w-[220px] border-none px-0 py-0 focus-within:ring-0"
              />
            ) : (
              <div className="flex flex-wrap gap-1">
                {(pl?.tags ?? []).map((t) => (
                  <span key={t} className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Tracks */}
        <div>
          {!loading && tracks.length > 0 && <LicenseNote scope="music" />}
          {error && !loading ? (
            <LoadError
              what="this playlist"
              error={error}
              onRetry={() => {
                setLoading(true);
                void load();
              }}
            />
          ) : loading ? (
            <div className="overflow-hidden rounded-xl bg-card shadow-sm">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="m-2 h-12 rounded-lg" />
              ))}
            </div>
          ) : tracks.length === 0 ? (
            <EmptyState
              icon={Music2}
              title="No tracks yet"
              description={
                canWrite ? "Use Add to upload audio, generate with AI, or pick from your Media or the public library." : "This playlist has no tracks yet."
              }
            />
          ) : (
            /* No header row. The columns it labelled are gone — each track
               states its own artist, genres and length in place. */
            <Group>
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
                  onDragEnd={() => {
                    setDrag(null);
                    setOver(null);
                  }}
                  onDrop={() => drop(i)}
                  onEdit={() => setEditTrack(t)}
                  onDelete={() => removeTrack(t.id, t.title)}
                />
              ))}
            </Group>
          )}
        </div>

        {/* Summary sidebar */}
        <aside className="space-y-4 lg:sticky lg:top-2 lg:self-start">
          <div className="rounded-xl bg-card p-4 shadow-sm">
            <h3 className="text-sm font-semibold">Playback</h3>
            <label className="mt-3 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm">
                <Shuffle className="size-4 text-muted-foreground" /> Shuffle
              </span>
              <Switch checked={!!pl?.shuffle} disabled={!canWrite} onCheckedChange={(v) => patch({ shuffle: v })} />
            </label>
            <p className="mt-1.5 text-xs text-muted-foreground">Deterministic per cycle — every screen shuffles identically.</p>
          </div>

          <div className="rounded-xl bg-card p-4 shadow-sm">
            <h3 className="text-sm font-semibold">In this playlist</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Tracks</dt>
                <dd className="font-medium tabular-nums">{tracks.length}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Total time</dt>
                <dd className="font-medium tabular-nums">{totalMs ? mmss(totalMs) : "—"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Vocal / Instrumental</dt>
                <dd className="font-medium tabular-nums">
                  {vocalN} / {instN}
                </dd>
              </div>
            </dl>
            {genres.length > 0 && (
              <div className="mt-3">
                <div className="mb-1.5 text-xs text-muted-foreground">Genres</div>
                <div className="flex flex-wrap gap-1">
                  {genres.map((g) => (
                    <Badge key={g} className="font-normal">
                      {g}
                    </Badge>
                  ))}
                </div>
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
          const mediaId = await registerMedia({
            kind: "audio",
            name,
            assetHash: r.assetHash,
            assetUrl: r.assetUrl,
            durationMs: r.durationMs,
            source: "ai",
            genres: ["AI"],
          }).catch(() => undefined);
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
          let ok = 0;
          let blocked: string | null = null;
          for (const lid of libraryIds) {
            const r = await addPublicTrackToPlaylist(id, lid);
            if (r.id) ok++;
            else if (r.error) blocked = r.error === "library limit reached" ? `Library limit reached (${r.used}/${r.limit}).` : r.error;
          }
          await load();
          if (ok) {
            toast.success(`${ok} licensed track${ok === 1 ? "" : "s"} added.`);
            void offerPublishAffected("music", id);
          }
          if (blocked) toast.error(blocked);
        }}
      />
      <TrackMetaDialog
        open={!!editTrack}
        onOpenChange={(o) => !o && setEditTrack(null)}
        initial={
          editTrack
            ? {
                title: editTrack.title,
                artist: editTrack.artist ?? "",
                album: editTrack.album ?? "",
                genres: editTrack.genres ?? [],
                vocal: (editTrack.vocal as "vocal" | "instrumental" | "") ?? "",
                artHash: editTrack.art_hash ?? null,
                artUrl: editTrack.art_url ?? null,
              }
            : null
        }
        onSave={async (p) => {
          if (!editTrack) return;
          const tid = editTrack.id;
          setPl((prev) =>
            prev
              ? {
                  ...prev,
                  tracks: prev.tracks.map((t) =>
                    t.id === tid
                      ? {
                          ...t,
                          title: p.title,
                          artist: p.artist,
                          album: p.album,
                          genres: p.genres,
                          vocal: p.vocal || null,
                          art_hash: p.artHash,
                          art_url: p.artUrl,
                        }
                      : t,
                  ),
                }
              : prev,
          );
          await updatePlaylistTrack(id, tid, {
            title: p.title,
            artist: p.artist,
            album: p.album,
            genres: p.genres,
            vocal: p.vocal || null,
            artHash: p.artHash,
            artUrl: p.artUrl,
          });
          toast.success("Track updated.");
          void offerPublishAffected("music", id);
        }}
      />
      <DeletePlaylistDialog
        open={delOpen}
        onOpenChange={setDelOpen}
        name={title}
        onConfirm={async (alsoMedia) => {
          try {
            await deleteMusicPlaylist(id, alsoMedia);
            toast.success("Playlist deleted");
            navigate("/music");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Delete failed");
          }
        }}
      />
    </div>
  );
}

function EditablePlaylistName({ name, onRename }: { name: string; onRename: (n: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(name);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);
  function save() {
    const n = val.trim();
    setEditing(false);
    if (!n || n === name) {
      setVal(name);
      return;
    }
    onRename(n);
  }
  if (editing) {
    return (
      <Input
        ref={ref}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            setVal(name);
            setEditing(false);
          }
        }}
        maxLength={80}
        className="h-10 w-64 text-2xl! font-semibold"
      />
    );
  }
  return (
    <button
      onClick={() => {
        setVal(name);
        setEditing(true);
      }}
      className="group/n inline-flex items-center gap-2 text-left"
      title="Rename playlist"
    >
      <span className="truncate text-xl font-semibold tracking-tight md:text-2xl">{name}</span>
      <Pencil className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/n:opacity-70" />
    </button>
  );
}

/**
 * One track — a `Row`, not a `<tr>`.
 *
 * ⚠️ THIS IS THE CLEAREST CASE FOR UI-LANGUAGE §11 IN THE WHOLE APP. The table
 * version rendered the ARTIST TWICE: once in a `sm:hidden` block tucked under
 * the title, and again in a `hidden sm:table-cell` column — two copies of one
 * fact, because a table cannot reflow a column into a line. Genres were a third
 * column that simply vanished below `lg`, and the drag handle was a column of
 * its own. "If desktop needs a different component, the abstraction is wrong."
 *
 * As a row there is one artist line, the genres ride with it, and nothing is
 * hidden at any width. The duration sits with the controls in `trailing`,
 * because `Row` renders `trailing` INSTEAD of `value` — and a track's length is
 * a fact you read, not a column you compare down.
 *
 * The drag affordance is on a wrapping `div`: `Row` has no drag props and
 * should not — reordering is this screen's behaviour, not the grammar's.
 */
function TrackRow({
  track,
  index,
  canWrite,
  dragging,
  over,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
  onEdit,
  onDelete,
}: {
  track: PlaylistTrack;
  index: number;
  canWrite: boolean;
  dragging: boolean;
  over: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const licensed = !!track.library_id;
  const genres = (track.genres ?? []).slice(0, 3);
  const vocal = track.vocal ? (track.vocal === "vocal" ? "Vocal" : "Instrumental") : null;
  return (
    <div
      draggable={canWrite}
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={onDragEnd}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      className={cn(dragging && "opacity-40", over && "border-t-2 border-t-primary")}
    >
      <Row
        leading={
          <span className="flex items-center gap-2">
            {canWrite && (
              <span className="cursor-grab text-muted-foreground/50 active:cursor-grabbing" title="Drag to reorder">
                <GripVertical className="size-4" />
              </span>
            )}
            <span className="w-5 shrink-0 text-right text-caption tabular-nums text-muted-foreground">{index + 1}</span>
            <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md bg-surface-2 text-muted-foreground">
              {track.art_url ? <img src={assetUrl(track.art_url)} alt="" className="size-full object-cover" /> : <Music className="size-4" />}
            </span>
          </span>
        }
        sub={[track.artist || "Unknown artist", vocal, genres.join(", ") || null].filter(Boolean).join(" · ")}
        trailing={
          <span className="flex shrink-0 items-center gap-0.5">
            <span className="numeral mr-1 text-caption text-muted-foreground">{mmss(track.duration_ms)}</span>
            {canWrite && (
              <>
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={onEdit} aria-label={`Edit ${track.title}`}>
                  <SlidersHorizontal />
                </Button>
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-danger" onClick={onDelete} aria-label={`Remove ${track.title}`}>
                  <Trash2 />
                </Button>
              </>
            )}
          </span>
        }
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{track.title}</span>
          {licensed && <LicenseBadge source="public" />}
        </span>
      </Row>
    </div>
  );
}

function DeletePlaylistDialog({
  open,
  onOpenChange,
  name,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  name: string;
  onConfirm: (alsoMedia: boolean) => Promise<void>;
}) {
  const [alsoMedia, setAlsoMedia] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setAlsoMedia(false);
      setBusy(false);
    }
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={<>Delete “{name}”?</>}>
        <p className="text-sm text-muted-foreground">This removes the playlist. Any channel using it loses this music. This can't be undone.</p>
        <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <span className="min-w-0">
            <span className="block text-sm font-medium">Also delete tracks from the library</span>
            <span className="block text-xs text-muted-foreground">Permanently removes these tracks' audio from the Media library and storage.</span>
          </span>
          <Switch checked={alsoMedia} onCheckedChange={setAlsoMedia} />
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm(alsoMedia);
              setBusy(false);
            }}
          >
            {busy ? "Deleting…" : "Delete playlist"}
          </Button>
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

function AiMusicDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdd: (r: { assetHash: string; assetUrl: string; durationMs: number; prompt: string }) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState("");
  const [secs, setSecs] = useState(15);
  const [models, setModels] = useState<AiModel[]>([]);
  const [modelId, setModelId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ assetHash: string; assetUrl: string; durationMs: number } | null>(null);

  useEffect(() => {
    if (open) {
      setPrompt("");
      setErr(null);
      setResult(null);
      setSecs(15);
    }
  }, [open]);
  useEffect(() => {
    listAiModels()
      .then((ms) => setModels(ms.filter((m) => m.task === "music")))
      .catch(() => {});
  }, []);

  async function generate() {
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const r = await aiGenerate({ task: "music", prompt, options: { durationSec: secs }, ...(modelId ? { modelId } : {}) });
      if (!r.ok || !r.assetUrl || !r.assetHash) throw new Error(r.detail || r.error || "Generation failed");
      setResult({ assetHash: r.assetHash, assetUrl: r.assetUrl, durationMs: r.durationMs ?? secs * 1000 });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!result) return;
    setBusy(true);
    try {
      await onAdd({ ...result, prompt });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Generate music with AI" className="sm:max-w-lg">
        <div className="space-y-3">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Warm lo-fi hip-hop with soft piano and vinyl crackle"
            className="min-h-24"
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Length</Label>
              <div className="flex gap-1.5">
                {MUSIC_LENGTHS.map((l) => (
                  <button
                    key={l.secs}
                    type="button"
                    onClick={() => setSecs(l.secs)}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium ${secs === l.secs ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            {models.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Model</Label>
                <Select
                  value={modelId || "__default"}
                  onChange={(v) => setModelId(v === "__default" ? "" : v)}
                  className="w-full"
                  options={[{ value: "__default", label: "Default model" }, ...models.map((m) => ({ value: m.id, label: m.label }))]}
                />
              </div>
            )}
          </div>

          {result && (
            <div className="rounded-lg border bg-muted/40 p-3">
              <audio controls src={assetUrl(result.assetUrl)} className="w-full" />
            </div>
          )}
          {err && <p className="text-sm text-destructive">{err}</p>}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" /> Uses your AI credits · generated music is licensed to you.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {result ? (
            <>
              <Button variant="outline" disabled={busy} onClick={generate}>
                Regenerate
              </Button>
              <Button disabled={busy} onClick={add}>
                Add to playlist
              </Button>
            </>
          ) : (
            <Button disabled={busy || !prompt.trim()} onClick={generate}>
              {busy ? "Generating…" : "Generate"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------- Public library pick -------------------------- */

function PublicLibraryDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdd: (libraryIds: string[]) => Promise<void>;
}) {
  const [data, setData] = useState<LibraryBrowse | null>(null);
  const [genre, setGenre] = useState<string>("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSel(new Set());
    setQ("");
    setGenre("");
    setData(null);
    browseLibrary()
      .then(setData)
      .catch(() => setData({ enabled: false, limit: 0, used: 0, genres: [], tracks: [] }));
  }, [open]);

  const tracks = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.tracks ?? []).filter(
      (t) => (!genre || t.genre === genre) && (!needle || t.title.toLowerCase().includes(needle) || (t.artist ?? "").toLowerCase().includes(needle)),
    );
  }, [data, genre, q]);

  function toggle(idv: string) {
    setSel((s) => {
      const n = new Set(s);
      n.has(idv) ? n.delete(idv) : n.add(idv);
      return n;
    });
  }

  async function confirm() {
    if (!sel.size) return;
    setBusy(true);
    try {
      await onAdd([...sel]);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={
          <>
            Public library <LicenseBadge source="public" />
          </>
        }
        className="sm:max-w-2xl"
      >
        {!data ? (
          <div className="space-y-2 py-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : !data.enabled ? (
          <EmptyState
            icon={Library}
            title="Public library not in your plan"
            description="Upgrade to a plan that includes the licensed music library to use these tracks."
            className="border-0 bg-transparent py-8"
          />
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Licensed for your commercial use.{" "}
              {data.limit >= 0 ? `Using ${data.used}/${data.limit} library tracks.` : `Using ${data.used} library tracks (unlimited).`}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tracks…" className="w-full pl-8" />
              </div>
              {data.genres.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setGenre("")}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${genre === "" ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}
                  >
                    All
                  </button>
                  {data.genres.map((g) => (
                    <button
                      key={g.genre}
                      type="button"
                      onClick={() => setGenre(g.genre)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${genre === g.genre ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}
                    >
                      {g.genre}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="max-h-[52vh] space-y-1.5 overflow-y-auto">
              {tracks.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">No tracks found.</div>
              ) : (
                tracks.map((t) => {
                  const on = sel.has(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggle(t.id)}
                      className={`flex w-full items-center gap-3 rounded-lg border-2 px-3 py-2 text-left transition-colors ${on ? "border-primary bg-primary/5" : "border-transparent bg-muted/40 hover:bg-muted"}`}
                    >
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
                })
              )}
            </div>
          </>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy || sel.size === 0 || !data?.enabled} onClick={confirm}>
            {busy ? "Adding…" : `Add ${sel.size || ""}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
