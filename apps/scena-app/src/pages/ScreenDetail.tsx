/**
 * Device detail — preview-hero + control sidebar. The left column is dominated
 * by a live, clock-computed preview of exactly what the screen is showing, with
 * channel assignment beneath it. The right sidebar holds live status, the remote
 * control (mute / refresh / screensaver / debug overlay), and display setup with
 * one-tap auto-detect. Commands route over the device socket instantly (§11).
 */
import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Radio,
  VolumeX,
  Volume2,
  RefreshCw,
  Moon,
  Sun,
  MonitorPlay,
  Bug,
  ScanLine,
  Unplug,
  Trash2,
  Pencil,
  Tag,
  Tv,
  Layers,
  Clock,
  X,
  Plus,
  CalendarClock,
  Sparkles,
} from "lucide-react";
import { useFeature } from "../entitlements.js";
import { LockedFeatureCard } from "../components/feature-gate.js";
import { DevicePreview } from "../components/device-preview.js";
import {
  getScreen,
  sendCommand,
  listChannels,
  setDeviceDimensions,
  setDeviceActiveChannel,
  getDeviceChannels,
  setDeviceChannels,
  unpairScreen,
  removeScreen,
  renameScreen,
  setScreenTags,
  getDeviceSchedule,
  addDeviceScheduleRule,
  deleteDeviceScheduleRule,
  setDeviceScheduleTz,
  type Screen,
  type CommandAction,
  type Channel,
  type DeviceScheduleData,
  type DeviceScheduleRule,
  type ScheduleKind,
} from "../api.js";
import { TagEditor } from "../components/tag-editor.js";
import { useCan } from "../permissions.js";
import { StatusDot, dimsOf } from "./Screens.js";
import { Pill } from "../components/status.js";
import { Badge, Button, cn, ConfirmDialog, EmptyState, Group, Input, Label, LoadError, PageHeader, Row, Select, Skeleton, Switch, Tabs, TabsContent, TabsList, TabsTrigger, toast, usePageChrome } from "@4dl/ui";

const NONE = "__none__";

function lastSeen(ts?: number | null): string {
  if (!ts) return "—";
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function ScreenDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const can = useCan();
  const writable = can("screen", "update");
  const canControl = can("screen", "control");
  const canDelete = can("screen", "delete");
  const [screen, setScreen] = useState<Screen | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [confirm, setConfirm] = useState<null | "unpair" | "remove">(null);
  const [busy, setBusy] = useState(false);
  // A device must be unpaired before it can be removed — never delete a live one.
  const assigned = screen ? (screen.live ? screen.live.state === "assigned" : screen.status !== "unpaired") : false;

  const reload = () =>
    getScreen(id)
      .then(setScreen)
      .catch(() => undefined);
  async function saveTags(tags: string[]) {
    // The optimistic write is snapshotted and PUT BACK on a refusal. It used to
    // toast the failure and leave the chips on screen, so the editor showed
    // tags the device does not have — and the next four-second poll silently
    // swapped them out again, which reads as the UI losing your typing.
    const before = screen?.tags ?? [];
    setScreen((s) => (s ? { ...s, tags } : s));
    try {
      await setScreenTags(id, tags);
    } catch (e) {
      setScreen((s) => (s ? { ...s, tags: before } : s));
      toast.error(e instanceof Error ? e.message : "Could not save tags");
    }
  }
  async function doUnpair() {
    setBusy(true);
    try {
      const r = await unpairScreen(id);
      toast.success(r.code ? `Unpaired — new pairing code: ${r.code}` : "Device unpaired");
      setConfirm(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unpair failed");
    } finally {
      setBusy(false);
    }
  }
  async function doRemove() {
    setBusy(true);
    try {
      await removeScreen(id);
      toast.success("Device removed");
      navigate("/");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Remove failed");
      setBusy(false);
      setConfirm(null);
    }
  }

  usePageChrome(
    {
      crumbs: [{ label: "Screens", to: "/" }, { label: screen?.name ?? "Device" }],
      actions: screen
        ? [
            ...(writable
              ? [
                  {
                    key: "unpair",
                    label: "Unpair",
                    icon: <Unplug className="size-4" />,
                    overflow: "always" as const,
                    disabled: !assigned,
                    onClick: () => setConfirm("unpair"),
                  },
                ]
              : []),
            ...(canDelete
              ? [
                  {
                    key: "remove",
                    label: "Remove device",
                    icon: <Trash2 className="size-4" />,
                    variant: "destructive" as const,
                    overflow: "always" as const,
                    disabled: assigned,
                    onClick: () => setConfirm("remove"),
                  },
                ]
              : []),
          ]
        : [],
    },
    [screen?.name, assigned, writable, canDelete],
  );

  useEffect(() => {
    let alive = true;
    const load = () =>
      getScreen(id)
        .then((s) => {
          if (alive) {
            setScreen(s);
            setError(null);
          }
        })
        .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    load();
    const t = setInterval(load, 4000);
    listChannels()
      .then((c) => alive && setChannels(c))
      .catch(() => {});
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id]);

  const online = !!screen?.live?.online;
  const activeChannel = screen?.channel_id ? (channels.find((c) => c.id === screen.channel_id)?.name ?? null) : null;

  return (
    <div className="space-y-5">
      {error && !screen ? (
        // Only while there is nothing to show: this polls every four seconds,
        // and one failed poll must not replace a working device page with an
        // error. `String(e)` used to render `[object Object]` here, with no
        // retry — the message is the server's now.
        <LoadError what="this device" error={error} onRetry={() => void reload()} />
      ) : !screen ? (
        <DetailSkeleton />
      ) : (
        <>
          <PageHeader
            back={{ label: "All devices", onClick: () => navigate("/") }}
            title={writable ? <EditableName screen={screen} onRenamed={reload} /> : screen.name}
            description={
              <span className="flex items-center gap-1.5">
                <StatusDot online={online} />
                <span className={online ? "text-success" : "text-muted-foreground"}>{online ? "Online" : "Offline"}</span>
                {activeChannel && <span className="text-muted-foreground">· playing {activeChannel}</span>}
              </span>
            }
          >
            {(writable || (screen.tags?.length ?? 0) > 0) && (
              <div className="mt-3 flex min-w-0 items-center gap-1.5">
                <Tag className="size-3.5 shrink-0 text-muted-foreground" />
                {writable ? (
                  <TagEditor
                    tags={screen.tags ?? []}
                    onChange={saveTags}
                    placeholder="Add tags…"
                    className="min-w-[220px] max-w-xl border-none px-0 py-0 focus-within:ring-0"
                  />
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {(screen.tags ?? []).map((t) => (
                      <span key={t} className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </PageHeader>

          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">
                <MonitorPlay className="size-4" /> Overview
              </TabsTrigger>
              <TabsTrigger value="schedule">
                <CalendarClock className="size-4" /> Schedule
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-5">
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                {/* Main: live preview + channel assignment */}
                <div className="space-y-6 lg:col-span-2">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold">Live preview</h2>
                      {writable ? (
                        <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => navigate(`/screens/${id}/studio`)}>
                          <Sparkles className="size-3.5" /> Open studio
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Computed from the synced clock — no stream</span>
                      )}
                    </div>
                    <DevicePreview channelId={screen.channel_id} online={online} chrome className="w-full shadow-sm" />
                  </div>
                  <ChannelSection screen={screen} channels={channels} writable={writable} />
                </div>

                {/* Sidebar: status + controls + display */}
                <div className="space-y-4">
                  <StatusPanel screen={screen} activeChannel={activeChannel} />
                  {canControl && <RemoteControl screen={screen} />}
                  {writable && <DisplayPanel screen={screen} />}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="schedule" className="mt-5">
              <DeviceSchedule screenId={id} writable={writable} />
            </TabsContent>
          </Tabs>

          <ConfirmDialog
            open={confirm === "unpair"}
            onOpenChange={(o) => !o && setConfirm(null)}
            title="Unpair this device?"
            description="The screen stops playing and shows a fresh pairing code. You can then re-pair it or remove it."
            confirmLabel="Unpair"
            onConfirm={doUnpair}
          />
          <ConfirmDialog
            open={confirm === "remove"}
            onOpenChange={(o) => !o && setConfirm(null)}
            title={`Remove "${screen.name}"?`}
            description="This permanently deletes the device and its channel assignments. This can't be undone."
            confirmLabel="Remove device"
            destructive
            onConfirm={doRemove}
          />
        </>
      )}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Skeleton className="aspect-video w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- Editable name -------------------------- */

function EditableName({ screen, onRenamed }: { screen: Screen; onRenamed: () => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(screen.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  async function save() {
    const name = val.trim();
    setEditing(false);
    if (!name || name === screen.name) {
      setVal(screen.name);
      return;
    }
    try {
      await renameScreen(screen.id, name);
      toast.success(`Renamed to "${name}"`);
      onRenamed();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rename failed");
      setVal(screen.name);
    }
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            setVal(screen.name);
            setEditing(false);
          }
        }}
        maxLength={80}
        className="h-10 w-64 !text-2xl font-semibold"
      />
    );
  }

  return (
    <button
      onClick={() => {
        setVal(screen.name);
        setEditing(true);
      }}
      className="group/name inline-flex items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title="Rename device"
    >
      <span className="truncate text-xl font-semibold tracking-tight md:text-2xl">{screen.name}</span>
      <Pencil className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/name:opacity-70" />
    </button>
  );
}

/* ------------------------------- Sidebar panel --------------------------- */

function Panel({ title, icon, action, children }: { title: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-card shadow-sm">
      <div className="flex items-center justify-between px-4 pb-1.5 pt-3.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          {icon}
          {title}
        </h3>
        {action}
      </div>
      <div className="px-4 pb-4">{children}</div>
    </section>
  );
}

/* -------------------------------- Status --------------------------------- */

function StatusPanel({ screen, activeChannel }: { screen: Screen; activeChannel: string | null }) {
  const live = screen.live;
  const { width, height, orientation } = dimsOf(screen);
  const online = !!live?.online;
  const stats: Array<{ label: string; value: React.ReactNode; icon: React.ReactNode }> = [
    { label: "Channel", value: activeChannel ?? <span className="text-muted-foreground">Unassigned</span>, icon: <Tv /> },
    {
      label: "Resolution",
      value: width && height ? `${width}×${height}${orientation ? ` · ${orientation}` : ""}` : <span className="text-muted-foreground">Not detected</span>,
      icon: <MonitorPlay />,
    },
    { label: "Manifest", value: live?.manifestVersion ? `v${live.manifestVersion}` : "—", icon: <Layers /> },
    { label: "Last seen", value: lastSeen(live?.lastSeen ?? screen.last_seen), icon: <Clock /> },
  ];
  return (
    <Panel title="Status" icon={<StatusDot online={online} />} action={<Pill tone={online ? "success" : "muted"}>{online ? "Online" : "Offline"}</Pill>}>
      <dl className="space-y-2.5">
        {stats.map((s) => (
          <div key={s.label} className="flex items-center gap-2.5 text-sm">
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground [&_svg]:size-3.5">{s.icon}</span>
            <dt className="text-muted-foreground">{s.label}</dt>
            <dd className="ml-auto min-w-0 truncate font-medium">{s.value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/* ----------------------------- Remote control ---------------------------- */

function RemoteControl({ screen }: { screen: Screen }) {
  const muted = !!screen.live?.muted;
  const saver = !!screen.live?.saverActive;
  const debug = !!screen.live?.debugActive;
  const online = !!screen.live?.online;

  async function cmd(action: CommandAction, label: string) {
    try {
      await sendCommand(screen.id, action);
      toast.success(label);
    } catch {
      toast.error("Command failed");
    }
  }

  const Tile = ({ active, icon, label, onClick }: { active?: boolean; icon: React.ReactNode; label: string; onClick: () => void }) => (
    <button
      disabled={!online}
      onClick={onClick}
      className={cn(
        "group flex flex-col items-center justify-center gap-1.5 rounded-xl py-3.5 text-xs font-medium transition-all disabled:opacity-40",
        active ? "bg-primary/12 text-primary ring-1 ring-inset ring-primary/25" : "bg-muted/60 text-foreground hover:bg-muted",
      )}
    >
      <span className="[&_svg]:size-5">{icon}</span>
      {label}
    </button>
  );
  return (
    <Panel title="Remote control" icon={<Radio />}>
      <div className="grid grid-cols-2 gap-2">
        <Tile
          active={muted}
          icon={muted ? <Volume2 /> : <VolumeX />}
          label={muted ? "Unmute" : "Mute"}
          onClick={() => cmd(muted ? "unmute" : "mute", muted ? "Unmuted" : "Muted")}
        />
        <Tile icon={<RefreshCw />} label="Refresh" onClick={() => cmd("refresh", "Refreshing device")} />
        <Tile
          active={saver}
          icon={saver ? <Sun /> : <Moon />}
          label={saver ? "Wake" : "Screensaver"}
          onClick={() => cmd(saver ? "screensaver.off" : "screensaver.on", saver ? "Screen woken" : "Screensaver on")}
        />
        <Tile
          active={debug}
          icon={<Bug />}
          label="Debug"
          onClick={() => cmd(debug ? "debug.off" : "debug.on", debug ? "Debug overlay off" : "Debug overlay on")}
        />
      </div>
      {!online && <p className="mt-2.5 text-xs text-warning">Offline — commands apply on reconnect.</p>}
    </Panel>
  );
}

/* -------------------------------- Display -------------------------------- */

function DisplayPanel({ screen }: { screen: Screen }) {
  const { width, height } = dimsOf(screen);
  const [w, setW] = useState("");
  const [h, setH] = useState("");
  const [busy, setBusy] = useState(false);
  const seeded = useRef(false);
  const detected = width && height ? `${width}×${height}` : null;

  useEffect(() => {
    if (!seeded.current && (width || height)) {
      setW(width ? String(width) : "");
      setH(height ? String(height) : "");
      seeded.current = true;
    }
  }, [width, height]);

  function autoDetect() {
    if (width && height) {
      setW(String(width));
      setH(String(height));
      toast.success(`Using detected ${width}×${height}`);
    }
  }

  async function save() {
    const nw = parseInt(w, 10);
    const nh = parseInt(h, 10);
    if (!Number.isFinite(nw) || !Number.isFinite(nh) || nw <= 0 || nh <= 0) return;
    setBusy(true);
    try {
      await setDeviceDimensions(screen.id, { width: nw, height: nh });
      toast.success(`Resolution set to ${nw}×${nh}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not set resolution");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Display"
      icon={<MonitorPlay />}
      action={
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={autoDetect}
          disabled={!detected}
          title={detected ? "Use the resolution the device reported" : "The device reports its resolution when it connects"}
        >
          <ScanLine className="size-3.5" /> Auto-detect
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="text-xs text-muted-foreground">
          {detected ? (
            <>
              Device reports <span className="font-medium text-foreground">{detected}</span>.
            </>
          ) : (
            "No resolution reported yet — it arrives when the device connects."
          )}
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="dw">
              Width
            </label>
            <Input id="dw" type="number" min={1} value={w} onChange={(e) => setW(e.target.value)} placeholder="1920" />
          </div>
          <span className="pb-2.5 text-muted-foreground">×</span>
          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="dh">
              Height
            </label>
            <Input id="dh" type="number" min={1} value={h} onChange={(e) => setH(e.target.value)} placeholder="1080" />
          </div>
        </div>
        <Button variant="outline" size="sm" className="w-full" onClick={save} disabled={busy || !w || !h}>
          {busy ? "Saving…" : "Set resolution"}
        </Button>
      </div>
    </Panel>
  );
}

/* --------------------------- Device management --------------------------- */

/* -------------------------------- Channel -------------------------------- */

function ChannelSection({ screen, channels, writable }: { screen: Screen; channels: Channel[]; writable: boolean }) {
  const [active, setActive] = useState<string>(screen.channel_id ?? NONE);
  const [carried, setCarried] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const seeded = useRef(false);

  useEffect(() => {
    getDeviceChannels(screen.id)
      .then(setCarried)
      .catch(() => {});
  }, [screen.id]);

  useEffect(() => {
    if (!seeded.current) {
      setActive(screen.channel_id ?? NONE);
      seeded.current = true;
    }
  }, [screen.channel_id]);

  async function chooseActive(value: string) {
    const prev = active;
    setActive(value);
    try {
      await setDeviceActiveChannel(screen.id, value === NONE ? null : value);
      toast.success(value === NONE ? "Channel cleared" : "Channel assigned — switching the screen now");
    } catch (e) {
      setActive(prev); // revert the optimistic selection
      toast.error(e instanceof Error ? e.message : "Couldn't assign the channel");
    }
  }

  async function toggleCarried(channelId: string, on: boolean) {
    const prev = carried;
    const next = on ? [...new Set([...carried, channelId])] : carried.filter((c) => c !== channelId);
    setCarried(next);
    setBusy(true);
    try {
      await setDeviceChannels(screen.id, next);
    } catch (e) {
      setCarried(prev); // revert on failure
      toast.error(e instanceof Error ? e.message : "Couldn't update carried channels");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Channel</h2>
        <p className="text-xs text-muted-foreground">Pick the active channel; a schedule or manual switch chooses from the carried set.</p>
      </div>

      <div className="max-w-sm space-y-1.5">
        <label className="text-xs text-muted-foreground">Active channel</label>
        <Select
          value={active}
          disabled={!writable}
          onChange={chooseActive}
          className="w-full"
          placeholder="Select a channel"
          options={[{ value: NONE, label: "No channel" }, ...channels.map((c) => ({ value: c.id, label: c.name }))]}
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">Carried channels</label>
        {channels.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            No channels yet — create one on the Channels page.
          </div>
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl bg-muted/40 p-1.5">
            {channels.map((c) => {
              const on = carried.includes(c.id);
              return (
                <div
                  key={c.id}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 transition-colors",
                    on ? "bg-background shadow-sm" : "hover:bg-background/60",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <MonitorPlay className={cn("size-4 shrink-0", on ? "text-primary" : "text-muted-foreground")} />
                    <span className="truncate text-sm font-medium">{c.name}</span>
                    {active === c.id && <Badge className="font-normal">Active</Badge>}
                  </div>
                  <Switch checked={on} disabled={busy || !writable} onCheckedChange={(v) => toggleCarried(c.id, v)} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------ schedule tab ----------------------------- */

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const toMin = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const fmtMin = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
function fmtDays(days: number[]): string {
  const s = [...days].sort((a, b) => a - b);
  if (s.length === 7) return "Every day";
  if (s.join() === "1,2,3,4,5") return "Weekdays";
  if (s.join() === "0,6") return "Weekends";
  return s.map((d) => DAY_LABELS[d]).join(" ");
}

interface Track {
  kind: ScheduleKind;
  label: string;
  hint: string;
  icon: typeof Tv;
  noun: string;
}
const TRACKS: Track[] = [
  {
    kind: "channel",
    label: "Channel schedule",
    hint: "Play a channel during a time window. Outside every window the device shows its default channel.",
    icon: Tv,
    noun: "daypart",
  },
  {
    kind: "mute",
    label: "Mute schedule",
    hint: "Silence audio during a window — e.g. quiet hours. Windows may cross midnight.",
    icon: VolumeX,
    noun: "window",
  },
  {
    kind: "saver",
    label: "Screensaver & sleep",
    hint: "Dim the screen to the screensaver during a window — e.g. overnight. Windows may cross midnight.",
    icon: Moon,
    noun: "window",
  },
];

/** Per-device schedule: channel dayparting, mute windows, screensaver windows. */
function DeviceSchedule({ screenId, writable }: { screenId: string; writable: boolean }) {
  const canDaypart = useFeature("dayparting");
  const [data, setData] = useState<DeviceScheduleData | null>(null);
  /*
    A FAILED LOAD IS NOT AN EMPTY SCHEDULE.

    This caught the error and wrote `{ tz: "UTC", rules: [], channels: [] }` —
    a fabricated answer, rendered as three tracks saying "No dayparts yet".
    On the screen that decides when a device is muted and when it sleeps, that
    is the app telling an operator nothing is scheduled while the schedule it
    could not read keeps running.
  */
  const [error, setError] = useState<string | null>(null);
  const reload = () => {
    setError(null);
    return getDeviceSchedule(screenId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };
  useEffect(() => {
    reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [screenId]);

  // Server gates every schedule-rule write on the dayparting feature, so match it
  // in the UI instead of letting saves 403 (§13/§25).
  if (!canDaypart) return <LockedFeatureCard feature="dayparting" />;

  if (error && !data) return <LoadError what="the schedule" error={error} onRetry={() => void reload()} />;
  if (!data)
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    );

  async function addRule(
    kind: ScheduleKind,
    rule: { days: number[]; startMin: number; endMin: number; channelId?: string | null; priority?: number },
  ): Promise<boolean> {
    try {
      const r = await addDeviceScheduleRule(screenId, { kind, ...rule });
      if (r.error) {
        toast.error(r.error);
        return false;
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn’t add that rule — the schedule is unchanged.");
      return false;
    }
    await reload();
    toast.success("Schedule updated.");
    return true;
  }
  async function removeRule(ruleId: string) {
    // Was `await deleteDeviceScheduleRule(...)` bare: a refused delete rejected
    // into the app-wide toast and the rule stayed on screen with no explanation.
    try {
      await deleteDeviceScheduleRule(screenId, ruleId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn’t delete that rule.");
      return;
    }
    await reload();
    toast.success("Rule deleted.");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2.5 rounded-xl border bg-card p-3.5 shadow-sm">
        <Clock className="size-4 text-muted-foreground" />
        <div>
          <div className="text-sm font-medium">Timezone</div>
          <div className="text-xs text-muted-foreground">Windows are evaluated in this device's local time.</div>
        </div>
        <div className="flex-1" />
        <Input
          defaultValue={data.tz}
          disabled={!writable}
          aria-label="Schedule timezone"
          // The chain used to be `.then(reload).then(toast)` with no catch: an
          // IANA name the server rejects left the field showing it, said
          // nothing, and rejected into the app-wide toast.
          onBlur={(e) => {
            const tz = e.target.value.trim() || "UTC";
            if (tz === data.tz) return;
            void setDeviceScheduleTz(screenId, tz)
              .then(() => reload())
              .then(() => toast.success("Timezone updated."))
              .catch((err) => {
                e.target.value = data.tz;
                toast.error(err instanceof Error ? err.message : "That timezone wasn’t accepted.");
              });
          }}
          className="w-[190px] font-mono text-xs"
          placeholder="e.g. Europe/Berlin"
        />
      </div>

      {TRACKS.map((t) => (
        <TrackSection
          key={t.kind}
          track={t}
          rules={data.rules.filter((r) => r.kind === t.kind)}
          channels={data.channels}
          writable={writable}
          onAdd={(rule) => addRule(t.kind, rule)}
          onDelete={removeRule}
        />
      ))}
    </div>
  );
}

function TrackSection({
  track,
  rules,
  channels,
  writable,
  onAdd,
  onDelete,
}: {
  track: Track;
  rules: DeviceScheduleRule[];
  channels: { id: string; name: string }[];
  writable: boolean;
  onAdd: (rule: { days: number[]; startMin: number; endMin: number; channelId?: string | null; priority?: number }) => Promise<boolean>;
  onDelete: (ruleId: string) => void;
}) {
  const Icon = track.icon;
  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </div>
        <h3 className="text-sm font-semibold">{track.label}</h3>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">{track.hint}</p>

      {rules.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card/40 px-4 py-6 text-center text-xs text-muted-foreground">
          No {track.noun}s yet — add one below.
        </div>
      ) : (
        // Five inline spans and two badges on one line, which on a phone put the
        // days and the priority off the right edge — of a rule whose whole
        // meaning is WHEN. The window is the row's title and everything that
        // qualifies it is the sub-line.
        <Group className="bg-surface-2">
          {rules.map((r) => (
            <Row
              key={r.id}
              icon={Icon}
              sub={[
                fmtDays(r.days),
                track.kind === "channel" ? (r.channelName ?? "no channel") : null,
                track.kind !== "channel" && r.endMin <= r.startMin ? "overnight" : null,
                track.kind === "channel" ? `priority ${r.priority}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              trailing={
                writable ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => onDelete(r.id)}
                    aria-label={`Delete the ${fmtMin(r.startMin)}–${fmtMin(r.endMin)} rule`}
                  >
                    <X className="size-3.5" />
                  </Button>
                ) : undefined
              }
            >
              <span className="numeral">
                {fmtMin(r.startMin)}–{fmtMin(r.endMin)}
              </span>
            </Row>
          ))}
        </Group>
      )}

      {writable && <AddRuleForm track={track} channels={channels} onAdd={onAdd} />}
    </section>
  );
}

function AddRuleForm({
  track,
  channels,
  onAdd,
}: {
  track: Track;
  channels: { id: string; name: string }[];
  onAdd: (rule: { days: number[]; startMin: number; endMin: number; channelId?: string | null; priority?: number }) => Promise<boolean>;
}) {
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [start, setStart] = useState(track.kind === "saver" ? "22:00" : "09:00");
  const [end, setEnd] = useState(track.kind === "saver" ? "07:00" : "17:00");
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [priority, setPriority] = useState("1");
  const [busy, setBusy] = useState(false);
  const toggleDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => a - b)));

  const noChannels = track.kind === "channel" && channels.length === 0;

  async function submit() {
    if (!days.length) {
      toast.error("Pick at least one day");
      return;
    }
    if (track.kind === "channel" && !channelId) {
      toast.error("Pick a channel");
      return;
    }
    setBusy(true);
    await onAdd({
      days,
      startMin: toMin(start),
      endMin: toMin(end),
      channelId: track.kind === "channel" ? channelId : undefined,
      priority: Number(priority) || 1,
    });
    setBusy(false);
  }

  if (noChannels) {
    return (
      <div className="mt-3 rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">Create a channel first to schedule one here.</div>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2.5 rounded-lg border border-dashed p-3">
      <div className="flex flex-wrap gap-1">
        {DAY_LABELS.map((lbl, d) => (
          <button
            key={d}
            type="button"
            onClick={() => toggleDay(d)}
            className={cn(
              "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
              days.includes(d) ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
            )}
          >
            {lbl}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2.5">
        <div className="flex flex-col gap-1">
          <Label className="text-[11px] text-muted-foreground">From</Label>
          <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="w-28 font-mono text-xs" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[11px] text-muted-foreground">To</Label>
          <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="w-28 font-mono text-xs" />
        </div>
        {track.kind === "channel" && (
          <div className="flex min-w-[140px] flex-1 flex-col gap-1">
            <Label className="text-[11px] text-muted-foreground">Channel</Label>
            <Select
              value={channelId}
              onChange={setChannelId}
              className="h-8 text-xs"
              placeholder="Channel"
              options={[...channels.map((c) => ({ value: c.id, label: c.name }))]}
            />
          </div>
        )}
        {track.kind === "channel" && (
          <div className="flex w-20 flex-col gap-1">
            <Label className="text-[11px] text-muted-foreground">Priority</Label>
            <Input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} className="h-8 font-mono text-xs" min={1} />
          </div>
        )}
        <Button size="sm" disabled={busy} onClick={submit}>
          <Plus className="size-3.5" /> Add {track.noun}
        </Button>
      </div>
      {track.kind !== "channel" && (
        <p className="text-[11px] text-muted-foreground">Tip: set From later than To for an overnight window (e.g. 22:00 → 07:00).</p>
      )}
    </div>
  );
}
