/**
 * Devices — the fleet view. A responsive grid of device cards: each shows live
 * online status, detected resolution, and the channel it is currently playing.
 * Clicking a card opens the device detail at /screens/<id>. "Devices" are the
 * renamed "Screens" of the model — same api (listScreens), new framing.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, ChevronRight, RectangleHorizontal, RectangleVertical, Search, Sparkles } from "lucide-react";
import { Button } from "../components/ui/button.js";
import { Card, CardContent } from "../components/ui/card.js";
import { Badge } from "../components/ui/badge.js";
import { Input } from "../components/ui/input.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { PageHeader } from "../components/page-header.js";
import { DevicePreview } from "../components/device-preview.js";
import { usePageChrome } from "../components/page-chrome.js";
import { TagFilter } from "../components/tag-filter.js";
import { StatusDot as SharedStatusDot } from "../components/status.js";
import { useCan } from "../permissions.js";
import { cn } from "@/lib/utils";
import { listScreens, createDisplay, listAlerts, type Screen } from "../api.js";
import { toast } from "../components/toast.js";
import { GetStarted } from "../components/get-started.js";
import { StatTile } from "../components/status.js";

/** Compact "last seen" label for offline devices. */
function lastSeenLabel(ts?: number | null): string | null {
  if (!ts) return null;
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** The Screen record carries display dimensions at runtime; surface them safely. */
type ScreenDims = { width?: number | null; height?: number | null; orientation?: string | null };
export function dimsOf(s: Screen): ScreenDims {
  return s as Screen & ScreenDims;
}
export function resolutionLabel(s: Screen): string {
  const { width, height } = dimsOf(s);
  return width && height ? `${width}×${height}` : "—";
}

export function ScreensPage({ onPair }: { onPair: () => void }) {
  const navigate = useNavigate();
  const [screens, setScreens] = useState<Screen[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);

  // Pair lives in the shell top bar now (collapses to ⋮ on small screens).
  const can = useCan();
  const canPair = can("screen", "create");
  const canCreate = can("channel", "create");
  const [creating, setCreating] = useState(false);
  async function newDisplay(sample = false) {
    setCreating(true);
    try {
      const { channelId } = await createDisplay(undefined, sample);
      navigate(`/displays/${channelId}`); // leaves this page; keep `creating` true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the display");
      setCreating(false);
    }
  }
  usePageChrome(
    {
      crumbs: [{ label: "Screens" }],
      actions: [
        ...(canCreate ? [{ key: "new-display", label: "New display", icon: <Sparkles className="size-4" />, overflow: "always" as const, onClick: () => void newDisplay() }] : []),
        ...(canPair ? [{ key: "pair", label: "Pair screen", icon: <Plus className="size-4" />, onClick: onPair }] : []),
      ],
    },
    [onPair, canPair, canCreate],
  );

  useEffect(() => {
    let alive = true;
    const load = () =>
      listScreens()
        .then((s) => alive && setScreens(s))
        .catch((e) => alive && setError(String(e)));
    load();
    const t = setInterval(load, 5000); // live-ish fleet view (§23)
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const online = screens?.filter((s) => s.live?.online).length ?? 0;
  const offline = (screens?.length ?? 0) - online;
  const allTags = useMemo(() => [...new Set((screens ?? []).flatMap((s) => s.tags ?? []))].sort(), [screens]);

  // At-a-glance open-alert count for the fleet summary. Best-effort: a role
  // without alert access (403) just hides that tile.
  const [openAlerts, setOpenAlerts] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    listAlerts()
      .then((a) => alive && setOpenAlerts(a.filter((x) => x.type !== "recovery" && x.resolved_at === null).length))
      .catch(() => alive && setOpenAlerts(null));
    return () => { alive = false; };
  }, []);
  const filtered = useMemo(() => {
    if (!screens) return screens;
    const needle = q.trim().toLowerCase();
    return screens.filter(
      (s) =>
        (!needle || s.name.toLowerCase().includes(needle) || (s.channel_name ?? "").toLowerCase().includes(needle)) &&
        (activeTags.length === 0 || (s.tags ?? []).some((t) => activeTags.includes(t))),
    );
  }, [screens, q, activeTags]);

  return (
    <div>
      <PageHeader
        title="Screens"
        description={screens ? `${screens.length} device${screens.length === 1 ? "" : "s"} · ${online} online` : "Your paired screens, live."}
        actions={
          screens && screens.length > 0 ? (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search devices…" className="w-full pl-8 sm:w-56" />
              </div>
              <TagFilter allTags={allTags} active={activeTags} onChange={setActiveTags} />
            </>
          ) : null
        }
      />

      {/* Fleet at a glance — turns the landing into a dashboard, not just a grid. */}
      {screens && screens.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Screens" value={screens.length} />
          <StatTile label="Online" value={online} dot="bg-success" valueClassName="text-success" />
          <StatTile label="Offline" value={offline} dot={offline > 0 ? "bg-destructive" : undefined} valueClassName={offline > 0 ? "text-destructive" : undefined} />
          <StatTile label="Open alerts" value={openAlerts ?? "—"} valueClassName={openAlerts ? "text-destructive" : undefined} />
        </div>
      )}

      {error ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center text-sm text-muted-foreground">Couldn't reach the API: {error}</CardContent>
        </Card>
      ) : !screens ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="overflow-hidden p-0">
              <Skeleton className="aspect-video rounded-none" />
              <div className="space-y-2 p-4">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
            </Card>
          ))}
        </div>
      ) : screens.length === 0 ? (
        <GetStarted canPair={canPair} canCreate={canCreate} creating={creating} onPair={onPair} onNewDisplay={() => void newDisplay(true)} />
      ) : filtered && filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">No devices match "{q}".</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(filtered ?? []).map((s) => (
            <DeviceCard key={s.id} screen={s} onClick={() => navigate(`/screens/${s.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}

function DeviceCard({ screen, onClick }: { screen: Screen; onClick: () => void }) {
  const online = !!screen.live?.online;
  const { orientation } = dimsOf(screen);
  const portrait = orientation === "portrait";
  const seen = lastSeenLabel(screen.live?.lastSeen);
  const channel = screen.channel_name;
  return (
    <Card
      onClick={onClick}
      className="group relative cursor-pointer overflow-hidden p-0 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="relative">
        {/* Live, clock-computed view of what this device is showing right now. */}
        <DevicePreview channelId={screen.channel_id} online={online} className="rounded-none ring-0" />
        <span
          className={cn(
            "absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium shadow-sm backdrop-blur-md",
            online ? "bg-success/90 text-white" : "bg-black/55 text-white/90",
          )}
        >
          <span className={cn("size-1.5 rounded-full", online ? "bg-white" : "bg-white/60")} />
          {online ? "Live" : "Offline"}
        </span>
      </div>
      <div className="p-3.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{screen.name}</span>
          <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-foreground" />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {channel ? (
            <Badge variant="secondary" className="font-normal">{channel}</Badge>
          ) : (
            <Badge variant="outline" className="font-normal text-muted-foreground">Unassigned</Badge>
          )}
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {portrait ? <RectangleVertical className="size-3" /> : <RectangleHorizontal className="size-3" />}
            {resolutionLabel(screen)}
          </span>
          {!online && seen && <span className="text-[11px] text-muted-foreground">· {seen}</span>}
        </div>
        {(screen.tags?.length ?? 0) > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {screen.tags!.slice(0, 5).map((t) => (
              <span key={t} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">{t}</span>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

/** Device online/offline dot — a thin alias over the shared StatusDot. */
export function StatusDot({ online }: { online: boolean }) {
  return <SharedStatusDot tone={online ? "success" : "muted"} ping={online} />;
}
