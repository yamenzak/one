/**
 * Display Studio (§ onboarding vision) — one place to build what a screen shows.
 *
 * A paired screen is auto-provisioned its own channel (slide playlist + music
 * playlist + widget profile). This page edits that display in place: add / reorder
 * / delete slides inline, jump to the music + widget editors pre-scoped to THIS
 * screen's blocks, preview live, and Publish — instead of hopping across
 * Playlists / Music / Widgets / Channels / Devices. Advanced slide authoring
 * (HTML, AI, per-slide settings) still lives in the full playlist editor, a click
 * away — this is the fast path, not a replacement.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Sparkles, Music, LayoutGrid, ImagePlus, Trash2, Rocket, GripVertical, ExternalLink, Plus } from "lucide-react";
import { Button } from "../components/ui/button.js";
import { Badge } from "../components/ui/badge.js";
import { PageHeader } from "../components/page-header.js";
import { usePageChrome } from "../components/page-chrome.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { DevicePreview } from "../components/device-preview.js";
import { assetSrc } from "../components/media-picker.js";
import { cn } from "@/lib/utils";
import { useCan } from "../permissions.js";
import { LoadError, toast } from "@4dl/ui";
import { EmptyState } from "../components/empty.js";
import {
  getScreen, getChannel, getSlidePlaylist, getMusicPlaylist,
  addPlaylistSlide, deletePlaylistSlide, reorderPlaylistSlidesApi,
  addPlaylistTrack, deletePlaylistTrack,
  uploadAsset, registerMedia, mediaKind, seedSampleDisplay, seedDisplayChannel, publishChannel, getChannelPublishState,
  type Screen, type Channel, type PlaylistSlide, type PlaylistTrack,
} from "../api.js";

/** ms → m:ss for a track duration. */
function fmtDur(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Read an audio file's duration in the browser (metadata only). */
function probeAudioMs(file: File): Promise<number> {
  return new Promise((resolve) => {
    const a = document.createElement("audio");
    a.preload = "metadata";
    const url = URL.createObjectURL(file);
    a.onloadedmetadata = () => { resolve(Math.round((a.duration || 0) * 1000)); URL.revokeObjectURL(url); };
    a.onerror = () => { resolve(0); URL.revokeObjectURL(url); };
    a.src = url;
  });
}

export function StudioPage({ mode = "screen" }: { mode?: "screen" | "display" }) {
  const params = useParams();
  const screenId = params.id ?? "";
  const displayChannelId = params.channelId ?? "";
  const navigate = useNavigate();
  const can = useCan();
  const writable = can("content", "update");

  const [screen, setScreen] = useState<Screen | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [slides, setSlides] = useState<PlaylistSlide[]>([]);
  const [tracks, setTracks] = useState<PlaylistTrack[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [addingMusic, setAddingMusic] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);

  /*
    EVERY FETCH ON THIS PAGE USED TO SWALLOW ITS FAILURE, and each swallow
    produced a confident wrong answer:

      `getScreen(...).catch(() => null)`        → "Screen not found. It may have
                                                  been removed." for a dropped
                                                  connection.
      `getSlidePlaylist(...).catch(() => [])`   → "This display has no slides
                                                  yet" with an Add button, over
                                                  a display that has twelve.
      `getChannelPublishState(...)` UNCAUGHT    → the whole `load` rejected,
                                                  `setLoading(false)` never ran,
                                                  and the page sat on its
                                                  skeleton forever.

    One try/finally, one `error`, and `setLoading(false)` where it cannot be
    skipped. The only surviving `catch` is the deliberate one: a screen that is
    still on the shared demo channel has NO display, which is a real state with
    its own call to action.
  */
  const load = useCallback(async () => {
    setError(null);
    try {
      let ch: Channel | null = null;
      if (mode === "display") {
        // A standalone display is a channel with composed blocks (not bound to a
        // screen yet) — resolve it directly.
        ch = await getChannel(displayChannelId);
        setScreen(null);
      } else {
        const s = await getScreen(screenId);
        setScreen(s);
        // A screen on its own provisioned channel resolves here; one still on the
        // shared demo channel (or unassigned) resolves to null → "set up" CTA.
        ch = s?.channel_id ? await getChannel(s.channel_id).catch(() => null) : null;
      }
      setChannel(ch);
      setSlides(ch?.slide_playlist_id ? (await getSlidePlaylist(ch.slide_playlist_id)).slides : []);
      setTracks(ch?.music_playlist_id ? (await getMusicPlaylist(ch.music_playlist_id)).tracks : []);
      if (ch) setDirty((await getChannelPublishState(ch.id)).dirty);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [mode, screenId, displayChannelId]);

  useEffect(() => { void load(); }, [load]);

  const title = mode === "display" ? (channel?.name ?? "Display") : (screen?.name ?? "Display");
  const backTo = mode === "display" ? "/" : `/screens/${screenId}`;
  const backLabel = mode === "display" ? "All screens" : "Back to device";
  usePageChrome({ crumbs: [{ label: "Screens", to: "/" }, { label: title }, { label: "Studio" }], actions: [] }, [title]);

  const slidePlaylistId = channel?.slide_playlist_id ?? null;

  async function addImages(files: FileList | null) {
    if (!files?.length || !slidePlaylistId) return;
    setBusy(true);
    try {
      let added = 0;
      for (const file of Array.from(files)) {
        const kind = mediaKind(file);
        if (kind !== "image" && kind !== "gif" && kind !== "video") continue;
        const { hash, url } = await uploadAsset(file);
        // Keep the Media library the source of truth (best-effort): every upload
        // lands there too, so the slide isn't an orphan asset.
        await registerMedia({ kind, name: file.name.replace(/\.[^.]+$/, ""), assetHash: hash, assetUrl: url }).catch(() => undefined);
        await addPlaylistSlide(slidePlaylistId, { type: kind, assetHash: hash, assetUrl: url });
        added++;
      }
      if (added) { toast.success(`Added ${added} slide${added === 1 ? "" : "s"}.`); await load(); }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeSlide(slideId: string) {
    if (!slidePlaylistId) return;
    setSlides((prev) => prev.filter((s) => s.id !== slideId)); // optimistic
    try { await deletePlaylistSlide(slidePlaylistId, slideId); setDirty(true); }
    catch { toast.error("Couldn't remove the slide"); void load(); }
  }

  const musicPlaylistId = channel?.music_playlist_id ?? null;
  async function addAudio(files: FileList | null) {
    if (!files?.length || !musicPlaylistId) return;
    setAddingMusic(true);
    try {
      let added = 0;
      for (const file of Array.from(files)) {
        if (mediaKind(file) !== "audio") continue;
        const { hash, url } = await uploadAsset(file);
        const durationMs = await probeAudioMs(file);
        const title = file.name.replace(/\.[^.]+$/, "");
        await registerMedia({ kind: "audio", name: title, assetHash: hash, assetUrl: url, durationMs }).catch(() => undefined);
        await addPlaylistTrack(musicPlaylistId, { title, assetHash: hash, assetUrl: url, durationMs });
        added++;
      }
      if (added) { toast.success(`Added ${added} track${added === 1 ? "" : "s"}.`); await load(); }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setAddingMusic(false);
      if (audioRef.current) audioRef.current.value = "";
    }
  }
  async function removeTrack(trackId: string) {
    if (!musicPlaylistId) return;
    setTracks((prev) => prev.filter((t) => t.id !== trackId));
    try { await deletePlaylistTrack(musicPlaylistId, trackId); setDirty(true); }
    catch { toast.error("Couldn't remove the track"); void load(); }
  }

  async function loadSample() {
    setBusy(true);
    try {
      if (mode === "display") await seedDisplayChannel(displayChannelId);
      else await seedSampleDisplay(screenId); // provisions the display first if still on demo
      toast.success("Sample scene loaded and published.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load the sample");
    } finally { setBusy(false); }
  }

  async function publish() {
    if (!channel) return;
    setPublishing(true);
    try { await publishChannel(channel.id); setDirty(false); toast.success("Published — screens are updating."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Publish failed"); }
    finally { setPublishing(false); }
  }

  /* ---- drag reorder ---- */
  const dragFrom = useRef<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  async function drop(to: number) {
    const from = dragFrom.current;
    dragFrom.current = null;
    setOver(null);
    if (from == null || from === to || !slidePlaylistId) return;
    const next = [...slides];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    setSlides(next);
    try { await reorderPlaylistSlidesApi(slidePlaylistId, next.map((s) => s.id)); setDirty(true); }
    catch { toast.error("Couldn't reorder"); void load(); }
  }

  if (loading) {
    return <div className="space-y-5"><Skeleton className="h-9 w-64" /><div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]"><Skeleton className="aspect-video w-full rounded-xl" /><Skeleton className="h-64 w-full rounded-xl" /></div></div>;
  }
  if (error) {
    return <LoadError what={mode === "display" ? "this display" : "this screen"} error={error} onRetry={() => { setLoading(true); void load(); }} />;
  }
  if (mode === "screen" && !screen) {
    return <EmptyState title="Screen not found" description="It may have been removed." />;
  }

  if (!channel) {
    // Screen mode ONLY: the screen is still on the shared demo channel and has
    // no editable display yet. In display mode a bad channel id throws and is
    // reported above, so there is no "not found" branch to fall through to.
    if (mode === "display") return <EmptyState title="Display not found" description="It may have been removed." />;
    return (
      <div className="space-y-5">
        <PageHeader back={{ label: backLabel, onClick: () => navigate(backTo) }} title={`${title} · Studio`} description="Set up this screen's own display to start adding content." />
        <EmptyState
          scena="searching"
          title="No display yet"
          description="This screen is showing the built-in demo. Give it its own display — we'll seed a starter scene you can edit."
          action={writable ? <Button onClick={loadSample} disabled={busy}><Sparkles className="size-4" /> {busy ? "Setting up…" : "Set up this display"}</Button> : undefined}
        />
      </div>
    );
  }

  const online = mode === "display" ? true : !!screen?.live?.online;

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ label: backLabel, onClick: () => navigate(backTo) }}
        title={`${title} · Studio`}
        description={mode === "display" ? "Prep this display's content, then bind it to a screen when you pair one." : "Everything this screen shows, in one place. Add content, then publish."}
      >
        <div className="mt-3 flex items-center gap-2">
          {dirty && <Badge variant="secondary" className="gap-1 text-[11px]">Unpublished changes</Badge>}
          {writable && (
            <Button size="sm" onClick={publish} disabled={publishing || !dirty} className="gap-1.5">
              <Rocket className="size-4" /> {publishing ? "Publishing…" : "Publish"}
            </Button>
          )}
        </div>
      </PageHeader>

      <div className="grid items-start gap-5 lg:grid-cols-[1.35fr_1fr]">
        {/* Live preview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Live preview</h2>
            <span className="text-xs text-muted-foreground">Computed from the synced clock</span>
          </div>
          <DevicePreview channelId={channel.id} online={online} chrome className="w-full shadow-sm" />
        </div>

        {/* Building blocks */}
        <div className="space-y-4">
          {/* Slides */}
          <section className="rounded-xl border p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold"><LayoutGrid className="size-4 text-primary" /> Slides <span className="text-muted-foreground">· {slides.length}</span></div>
              {writable && (
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => fileRef.current?.click()} disabled={busy}><ImagePlus className="size-3.5" /> Add</Button>
                  <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={loadSample} disabled={busy}><Sparkles className="size-3.5" /> Sample</Button>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => addImages(e.target.files)} />
            </div>

            {slides.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <p className="text-[13px] text-muted-foreground">This display has no slides yet.</p>
                {writable && (
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => fileRef.current?.click()} disabled={busy}><ImagePlus className="size-3.5" /> Add images</Button>
                    <Button size="sm" className="gap-1.5" onClick={loadSample} disabled={busy}><Sparkles className="size-3.5" /> Load a sample scene</Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {slides.map((s, i) => (
                  <div
                    key={s.id}
                    draggable={writable}
                    onDragStart={() => (dragFrom.current = i)}
                    onDragEnter={() => setOver(i)}
                    onDragEnd={() => { dragFrom.current = null; setOver(null); }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); void drop(i); }}
                    className={cn("group relative aspect-video overflow-hidden rounded-lg border bg-muted", over === i && "ring-2 ring-primary")}
                  >
                    {s.type === "html" ? (
                      <div className="flex size-full items-center justify-center text-[10px] font-medium text-muted-foreground">HTML</div>
                    ) : s.asset_url ? (
                      <img src={assetSrc(s.asset_url)} alt="" className="size-full object-cover" draggable={false} />
                    ) : (
                      <div className="flex size-full items-center justify-center text-[10px] text-muted-foreground">{s.type}</div>
                    )}
                    {writable && (
                      <>
                        <span className="absolute left-1 top-1 rounded bg-black/45 p-0.5 text-white opacity-0 transition group-hover:opacity-100"><GripVertical className="size-3.5" /></span>
                        <button onClick={() => removeSlide(s.id)} aria-label="Remove slide" className="absolute right-1 top-1 rounded bg-black/45 p-1 text-white opacity-0 transition hover:bg-destructive group-hover:opacity-100"><Trash2 className="size-3.5" /></button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => navigate(`/playlists/${slidePlaylistId}`)} className="mt-3 flex w-full items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
              Open full slide editor (HTML · AI · timing) <ExternalLink className="size-3" />
            </button>
          </section>

          {/* Music */}
          <section className="rounded-xl border p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold"><Music className="size-4 text-primary" /> Music <span className="text-muted-foreground">· {tracks.length}</span></div>
              {writable && musicPlaylistId && (
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => audioRef.current?.click()} disabled={addingMusic}><Plus className="size-3.5" /> {addingMusic ? "Adding…" : "Add"}</Button>
              )}
              <input ref={audioRef} type="file" accept="audio/*" multiple hidden onChange={(e) => addAudio(e.target.files)} />
            </div>
            {tracks.length === 0 ? (
              <p className="py-3 text-center text-[13px] text-muted-foreground">No music yet.{writable ? " Upload tracks to play a bed." : ""}</p>
            ) : (
              <div className="-my-1">
                {tracks.map((t) => (
                  <div key={t.id} className="group flex items-center gap-3 border-b py-2 last:border-0">
                    <Music className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{t.title}</div>
                      {t.artist && <div className="truncate text-[11px] text-muted-foreground">{t.artist}</div>}
                    </div>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{fmtDur(t.duration_ms)}</span>
                    {writable && <button onClick={() => removeTrack(t.id)} aria-label="Remove track" className="shrink-0 text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"><Trash2 className="size-3.5" /></button>}
                  </div>
                ))}
              </div>
            )}
            {musicPlaylistId && (
              <button onClick={() => navigate(`/music/${musicPlaylistId}`)} className="mt-3 flex w-full items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                Open full music editor (library · reorder · metadata) <ExternalLink className="size-3" />
              </button>
            )}
          </section>

          {/* Widgets */}
          <section className="flex items-center gap-3 rounded-xl border p-4">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4"><LayoutGrid /></div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Widgets</div>
              <div className="text-xs text-muted-foreground">Clock, text, weather, tickers, boards…</div>
            </div>
            {channel.widget_profile_id && <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => navigate(`/widgets?profile=${channel.widget_profile_id}`)}>Open builder <ExternalLink className="size-3" /></Button>}
          </section>
        </div>
      </div>
    </div>
  );
}
