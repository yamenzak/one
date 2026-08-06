/**
 * Channel composer — the reusable-entities model (§4). A channel composes three
 * reusable entities by reference: a slide playlist + a music playlist + a widget
 * profile. List: create/open channels (each with a live preview). Detail
 * (/channels/:id): pick the three references, then Publish to compile the
 * manifest and nudge every screen on the channel (§9).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, Tv, Layers, Music, LayoutGrid, Megaphone, Rocket, History, Clock, ChevronRight, ArrowLeft, Search, Tag, Pencil, Check, Trash2 } from "lucide-react";
import { Button } from "../components/ui/button.js";
import { Card, CardContent } from "../components/ui/card.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { Badge } from "../components/ui/badge.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.js";
import { PageHeader } from "../components/page-header.js";
import { EmptyState } from "../components/empty-state.js";
import { DevicePreview } from "../components/device-preview.js";
import { usePageChrome } from "../components/page-chrome.js";
import { TagEditor } from "../components/tag-editor.js";
import { TagFilter } from "../components/tag-filter.js";
import { ConfirmDialog } from "../components/confirm-dialog.js";
import { toast } from "../components/toast.js";
import { useCan } from "../permissions.js";
import { cn } from "@/lib/utils";
import {
  listChannels, createChannel, publishChannelNote, setChannelComposition, updateChannel, deleteChannel,
  getChannelPublishState, setVersionNote,
  listSlidePlaylists, listMusicPlaylists, listWidgetProfiles, listAdProfiles,
  listVersions, rollbackVersion,
  type Channel, type SlidePlaylist, type MusicPlaylist, type WidgetProfile, type AdProfile, type Version,
} from "../api.js";

/** The reusable-entities model adds reference columns to a channel row. */
type ComposedChannel = Channel & {
  slide_playlist_id?: string | null;
  music_playlist_id?: string | null;
  widget_profile_id?: string | null;
  ad_profile_id?: string | null;
};

// Radix Select can't hold an empty-string value, so map "no selection" to a sentinel.
const NONE = "__none__";

/** The sources every channel composes, in a fixed display order. */
const SOURCES = [
  { key: "slide", label: "Slides", icon: Layers },
  { key: "music", label: "Music", icon: Music },
  { key: "widget", label: "Widgets", icon: LayoutGrid },
  { key: "ad", label: "Ads", icon: Megaphone },
] as const;

/* ================================ List view ============================== */

export function ChannelsPage() {
  const navigate = useNavigate();
  const can = useCan();
  const canCreate = can("channel", "create");
  const [channels, setChannels] = useState<ComposedChannel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [newOpen, setNewOpen] = useState(false);

  const reload = () => {
    setError(null);
    return listChannels()
      .then((cs) => setChannels(cs as ComposedChannel[]))
      .catch((e) => setError(String(e)));
  };

  useEffect(() => { reload(); }, []);

  usePageChrome(
    { crumbs: [{ label: "Channels" }], actions: canCreate ? [{ key: "new", label: "New channel", icon: <Plus className="size-4" />, onClick: () => setNewOpen(true) }] : [] },
    [canCreate],
  );

  const allTags = useMemo(() => [...new Set((channels ?? []).flatMap((c) => c.tags ?? []))].sort(), [channels]);
  const filtered = useMemo(() => {
    if (!channels) return channels;
    const needle = q.trim().toLowerCase();
    return channels.filter(
      (c) =>
        (!needle || c.name.toLowerCase().includes(needle)) &&
        (activeTags.length === 0 || (c.tags ?? []).some((t) => activeTags.includes(t))),
    );
  }, [channels, q, activeTags]);

  return (
    <div>
      <PageHeader
        title="Channels"
        description={
          channels && channels.length > 0
            ? `${channels.length} channel${channels.length === 1 ? "" : "s"} · slides, music, and widgets composed together`
            : "Compose a slide playlist, music, and widgets — then publish to your screens."
        }
        actions={
          channels && channels.length > 0 ? (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search channels…" className="w-full pl-8 sm:w-56" />
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
      ) : !channels ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="overflow-hidden p-0">
              <Skeleton className="aspect-video rounded-none" />
              <div className="space-y-2 p-4"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-5 w-32 rounded-full" /></div>
            </Card>
          ))}
        </div>
      ) : channels.length === 0 ? (
        <EmptyState
          scena="idle"
          title="No channels yet"
          description="Create one, pick its slides, music, and widgets, then publish to your screens — it goes live in seconds."
          action={canCreate ? <Button onClick={() => setNewOpen(true)}><Plus className="size-4" /> New channel</Button> : undefined}
        />
      ) : filtered && filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">No channels match "{q}".</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(filtered ?? []).map((c) => (
            <ChannelCard key={c.id} channel={c} onOpen={() => navigate(`/channels/${c.id}`)} />
          ))}
        </div>
      )}

      <NewChannelDialog open={newOpen} onOpenChange={setNewOpen} onCreated={(id) => navigate(`/channels/${id}`)} />
    </div>
  );
}

function ChannelCard({ channel, onOpen }: { channel: ComposedChannel; onOpen: () => void }) {
  const ids = { slide: channel.slide_playlist_id ?? null, music: channel.music_playlist_id ?? null, widget: channel.widget_profile_id ?? null, ad: channel.ad_profile_id ?? null };
  const setCount = SOURCES.filter((s) => ids[s.key]).length;
  return (
    <Card onClick={onOpen} className="group cursor-pointer overflow-hidden p-0 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <DevicePreview channelId={channel.id} online className="rounded-none ring-0" />
      <div className="p-3.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{channel.name}</span>
          <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">{setCount}/{SOURCES.length}</span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-foreground" />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {SOURCES.map(({ key, label, icon: Icon }) => {
            const set = Boolean(ids[key]);
            return (
              <span
                key={key}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                  set ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground/55",
                )}
              >
                <Icon className="size-3" /> {label}
              </span>
            );
          })}
        </div>
        {(channel.tags?.length ?? 0) > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {channel.tags!.slice(0, 5).map((t) => (
              <span key={t} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">{t}</span>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function NewChannelDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    try {
      const { id } = await createChannel(name.trim() || "Channel");
      onOpenChange(false); setName(""); onCreated(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create channel");
    } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New channel</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Input autoFocus placeholder="e.g. Lobby" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={create} disabled={busy}>{busy ? "Creating…" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* =============================== Detail view ============================= */

export function ChannelDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const can = useCan();
  const writable = can("channel", "update");
  const canPublish = can("channel", "publish");
  const canDelete = can("channel", "delete");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [channel, setChannel] = useState<ComposedChannel | null>(null);
  const [slidePlaylists, setSlidePlaylists] = useState<SlidePlaylist[]>([]);
  const [musicPlaylists, setMusicPlaylists] = useState<MusicPlaylist[]>([]);
  const [profiles, setProfiles] = useState<WidgetProfile[]>([]);
  const [adProfiles, setAdProfiles] = useState<AdProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [liveVersion, setLiveVersion] = useState<number | null>(null);

  const loadChannel = () =>
    listChannels().then((cs) => setChannel((cs as ComposedChannel[]).find((c) => c.id === id) ?? null));
  const refreshState = () => getChannelPublishState(id).then((s) => { setDirty(s.dirty); setLiveVersion(s.liveVersion); }).catch(() => {});

  useEffect(() => {
    setLoading(true);
    Promise.all([
      loadChannel(),
      refreshState(),
      // Keep the last-known options on a transient failure rather than wiping the
      // binding pickers to empty (which reads as "nothing to bind").
      listSlidePlaylists().then(setSlidePlaylists).catch(() => {}),
      listMusicPlaylists().then(setMusicPlaylists).catch(() => {}),
      listWidgetProfiles().then(setProfiles).catch(() => {}),
      listAdProfiles().then(setAdProfiles).catch(() => {}),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  async function compose(refs: { slidePlaylistId?: string | null; musicPlaylistId?: string | null; widgetProfileId?: string | null; adProfileId?: string | null }) {
    setSaving(true);
    try {
      await setChannelComposition(id, refs);
      await loadChannel();
      await refreshState();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update sources");
    } finally { setSaving(false); }
  }

  async function saveTags(tags: string[]) {
    setChannel((c) => (c ? { ...c, tags } : c));
    await updateChannel(id, { tags }).catch(() => toast.error("Could not save tags"));
  }

  async function publish() {
    setSaving(true);
    try {
      const r = await publishChannelNote(id, "");
      toast.success(`Published v${r.version ?? "?"} · nudged ${r.nudged ?? 0} screen${r.nudged === 1 ? "" : "s"}`);
      await refreshState();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Publish failed");
    } finally { setSaving(false); }
  }

  async function doDelete() {
    try {
      const r = await deleteChannel(id);
      toast.success(r.unassigned ? `Channel deleted · ${r.unassigned} device${r.unassigned === 1 ? "" : "s"} unassigned` : "Channel deleted");
      navigate("/channels");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  usePageChrome(
    {
      crumbs: [{ label: "Channels", to: "/channels" }, { label: channel?.name ?? "Channel" }],
      actions: [
        { key: "history", label: "History", icon: <History className="size-4" />, variant: "outline", disabled: saving, onClick: () => setHistoryOpen(true) },
        ...(canPublish ? [{ key: "publish", label: dirty ? "Publish" : "Published", icon: <Rocket className="size-4" />, disabled: saving || !dirty, onClick: publish }] : []),
        ...(canDelete ? [{ key: "delete", label: "Delete", icon: <Trash2 className="size-4" />, variant: "destructive" as const, disabled: saving, onClick: () => setDeleteOpen(true) }] : []),
      ],
    },
    [channel?.name, saving, dirty, canPublish, canDelete],
  );

  const back = (
    <button onClick={() => navigate("/channels")} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeft className="size-4" /> All channels
    </button>
  );

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
          <Skeleton className="aspect-video w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!channel) {
    return (
      <div>
        {back}
        <EmptyState icon={<Tv />} title="Channel not found" description="It may have been removed. Head back to the channel list." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        back={{ label: "All channels", onClick: () => navigate("/channels") }}
        title={writable ? <EditableChannelName channel={channel} onRenamed={loadChannel} /> : channel.name}
        description="Compose the channel from reusable sources, then publish to go live."
      >
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          <PublishStatus dirty={dirty} liveVersion={liveVersion} />
          {(writable || (channel.tags?.length ?? 0) > 0) && (
            <div className="flex min-w-0 items-center gap-1.5">
              <Tag className="size-3.5 shrink-0 text-muted-foreground" />
              {writable ? (
                <TagEditor tags={channel.tags ?? []} onChange={saveTags} placeholder="Add tags…" className="min-w-[220px] border-none px-0 py-0 focus-within:ring-0" />
              ) : (
                <div className="flex flex-wrap gap-1">{(channel.tags ?? []).map((t) => <span key={t} className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">{t}</span>)}</div>
              )}
            </div>
          )}
        </div>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* Composer */}
        <div className="space-y-3">
          <ComposerRow icon={<Layers className="size-5" />} title="Slide playlist" description="The visual loop shown on screen." value={channel.slide_playlist_id ?? null} options={slidePlaylists} disabled={saving || !writable} onChange={(v) => compose({ slidePlaylistId: v })} />
          <ComposerRow icon={<Music className="size-5" />} title="Music playlist" description="Background audio for the channel." value={channel.music_playlist_id ?? null} options={musicPlaylists} disabled={saving || !writable} onChange={(v) => compose({ musicPlaylistId: v })} />
          <ComposerRow icon={<LayoutGrid className="size-5" />} title="Widget profile" description="Overlay widgets (clock, weather, feeds…)." value={channel.widget_profile_id ?? null} options={profiles} disabled={saving || !writable} onChange={(v) => compose({ widgetProfileId: v })} />
          <ComposerRow icon={<Megaphone className="size-5" />} title="Ad profile" description="Scheduled interrupts (audio, video, command)." value={channel.ad_profile_id ?? null} options={adProfiles} disabled={saving || !writable} onChange={(v) => compose({ adProfileId: v })} />
        </div>

        {/* Live preview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Live preview</h2>
            <span className="text-xs text-muted-foreground">Published output</span>
          </div>
          <DevicePreview channelId={channel.id} online chrome className="w-full shadow-sm" />
        </div>
      </div>

      {historyOpen && (
        <HistoryDialog
          channelId={id}
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          canPublish={canPublish}
          onRolledBack={(v) => { toast.success(`Rolled back to v${v}`); setHistoryOpen(false); loadChannel(); refreshState(); }}
        />
      )}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete "${channel.name}"?`}
        description="This permanently deletes the channel and its version history, and unassigns it from every device that plays it (they revert to their fallback). Reusable playlists and widget profiles are kept."
        confirmLabel="Delete channel"
        destructive
        onConfirm={doDelete}
      />
    </div>
  );
}

function EditableChannelName({ channel, onRenamed }: { channel: ComposedChannel; onRenamed: () => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(channel.name);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) { ref.current?.focus(); ref.current?.select(); } }, [editing]);
  async function save() {
    const name = val.trim();
    setEditing(false);
    if (!name || name === channel.name) { setVal(channel.name); return; }
    try { await updateChannel(channel.id, { name }); toast.success(`Renamed to "${name}"`); onRenamed(); }
    catch { toast.error("Rename failed"); setVal(channel.name); }
  }
  if (editing) {
    return (
      <Input
        ref={ref}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setVal(channel.name); setEditing(false); } }}
        maxLength={80}
        className="h-10 w-64 text-2xl! font-semibold"
      />
    );
  }
  return (
    <button onClick={() => { setVal(channel.name); setEditing(true); }} className="group/n inline-flex items-center gap-2 text-left" title="Rename channel">
      <span className="truncate text-xl font-semibold tracking-tight md:text-2xl">{channel.name}</span>
      <Pencil className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/n:opacity-70" />
    </button>
  );
}

function PublishStatus({ dirty, liveVersion }: { dirty: boolean; liveVersion: number | null }) {
  if (dirty) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-warning">
        <span className="size-1.5 rounded-full bg-warning" /> Unpublished changes
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <Check className="size-4 text-success" /> Up to date{liveVersion ? ` · v${liveVersion}` : ""}
    </span>
  );
}

function ComposerRow({
  icon, title, description, value, options, disabled, onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  value: string | null;
  options: { id: string; name: string }[];
  disabled: boolean;
  onChange: (value: string | null) => void;
}) {
  const set = Boolean(value);
  return (
    <div className={cn("flex flex-wrap items-center gap-4 rounded-xl p-4 transition-colors", set ? "bg-primary/5 ring-1 ring-inset ring-primary/15" : "bg-muted/40")}>
      <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors", set ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>{icon}</div>
      <div className="min-w-0 flex-1">
        <Label className="font-medium">{title}</Label>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Select value={value ?? NONE} disabled={disabled} onValueChange={(v) => onChange(v === NONE ? null : v)}>
        <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>None</SelectItem>
          {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function VersionRow({
  v, live, busy, editable, channelId, onRevert, onLabeled,
}: {
  v: Version;
  live: boolean;
  busy: boolean;
  editable: boolean;
  channelId: string;
  onRevert: (version: number) => void;
  onLabeled: (version: number, note: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(v.note ?? "");
  async function save() {
    setEditing(false);
    const n = note.trim();
    if (n === (v.note ?? "")) return;
    await setVersionNote(channelId, v.version, n).catch(() => toast.error("Could not label version"));
    onLabeled(v.version, n);
  }
  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
      <Badge variant={live ? "default" : "secondary"} className="tabular-nums">v{v.version}</Badge>
      <div className="min-w-0 flex-1">
        {editing ? (
          <Input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setNote(v.note ?? ""); setEditing(false); } }}
            placeholder="Label this version…"
            maxLength={120}
            className="h-7 text-sm"
          />
        ) : editable ? (
          <button onClick={() => { setNote(v.note ?? ""); setEditing(true); }} className="group/l inline-flex max-w-full items-center gap-1.5 text-left" title="Label this version">
            <span className="truncate text-sm font-medium">{v.note ? v.note : <span className="italic text-muted-foreground">Add a label…</span>}</span>
            {live && <span className="shrink-0 text-xs font-semibold text-success">● Live</span>}
            <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/l:opacity-70" />
          </button>
        ) : (
          <span className="inline-flex max-w-full items-center gap-1.5">
            <span className="truncate text-sm font-medium">{v.note || <span className="text-muted-foreground">—</span>}</span>
            {live && <span className="shrink-0 text-xs font-semibold text-success">● Live</span>}
          </span>
        )}
        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="size-3" /> {new Date(v.created_at).toLocaleString()} · {v.hash.slice(0, 10)}
        </div>
      </div>
      {live ? (
        <span className="shrink-0 text-xs text-muted-foreground">current</span>
      ) : editable ? (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => onRevert(v.version)}>Revert</Button>
      ) : null}
    </div>
  );
}

/** Version history + one-click rollback (§10). */
function HistoryDialog({
  channelId, open, onOpenChange, onRolledBack, canPublish,
}: {
  channelId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onRolledBack: (version: number) => void;
  canPublish: boolean;
}) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [current, setCurrent] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listVersions(channelId)
      .then((r) => { setVersions(r.versions); setCurrent(r.current); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [channelId]);

  async function revert(v: number) {
    setBusy(true);
    try {
      const r = await rollbackVersion(channelId, v);
      if (r.ok) onRolledBack(v);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rollback failed");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Version history</DialogTitle></DialogHeader>
        {loading ? (
          <div className="space-y-2 py-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
        ) : versions.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No versions yet — publish to create the first.</div>
        ) : (
          <div className="-mr-1 max-h-[65vh] space-y-2 overflow-y-auto pr-1">
            {versions.map((v) => (
              <VersionRow
                key={v.id}
                v={v}
                live={v.version === current}
                busy={busy}
                editable={canPublish}
                channelId={channelId}
                onRevert={revert}
                onLabeled={(version, note) => setVersions((vs) => vs.map((x) => (x.version === version ? { ...x, note } : x)))}
              />
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
