/**
 * Devices — the fleet view. A responsive grid of device cards: each shows live
 * online status, detected resolution, and the channel it is currently playing.
 * Clicking a card opens the device detail at /screens/<id>. "Devices" are the
 * renamed "Screens" of the model — same api (listScreens), new framing.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, BellRing, ChevronRight, MonitorSpeaker, RectangleHorizontal, RectangleVertical, Sparkles, Wifi, WifiOff } from "lucide-react";
import { DevicePreview } from "../components/device-preview.js";
import { useCan } from "../permissions.js";
import { listScreens, createDisplay, listAlerts, type Screen } from "../api.js";
import { GetStarted } from "../components/get-started.js";
import { Badge, Card, cn, Collection, Filters, GlanceStrip, PageHeader, Row, StatusDot, toast, useCollectionView, usePageChrome, type FacetSelection } from "@4dl/ui";

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
/**
 * `null` when the device has not reported its size — NOT a dash.
 *
 * §5: never render a dash where a number belongs. The chip that used this drew
 * an orientation glyph beside an em-dash, and BOTH halves were fabricated:
 * `dimsOf` falls back to landscape, so a screen that had never checked in was
 * labelled "landscape, unknown size" with the confidence of a fact. A screen
 * card with no size chip says the same thing and does not claim the orientation.
 */
export function resolutionLabel(s: Screen): string | null {
  const { width, height } = dimsOf(s);
  return width && height ? `${width}×${height}` : null;
}

export function ScreensPage({ onPair }: { onPair: () => void }) {
  const navigate = useNavigate();
  const [screens, setScreens] = useState<Screen[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [facets, setFacets] = useState<FacetSelection>({ tag: null, status: null });
  const [view, setView] = useCollectionView("scena.screens", "grid");

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
        ...(canCreate
          ? [{ key: "new-display", label: "New display", icon: <Sparkles className="size-4" />, overflow: "always" as const, onClick: () => void newDisplay() }]
          : []),
        ...(canPair ? [{ key: "pair", label: "Pair screen", icon: <Plus className="size-4" />, onClick: onPair }] : []),
      ],
    },
    [onPair, canPair, canCreate],
  );

  /*
    The fleet polls every five seconds, which makes the error handling different
    from every other list in the app: a single failed poll must NOT replace a
    working screen with an error page. So a failure is only shown while there is
    nothing to show — once `screens` is populated it stays, and the next poll
    either refreshes it or leaves it alone.
  */
  const load = useCallback(
    () =>
      listScreens()
        .then((s) => {
          setScreens(s);
          setError(null);
        })
        .catch((e) => setError(e instanceof Error ? e.message : String(e))),
    [],
  );
  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (alive) void load();
    };
    tick();
    const t = setInterval(tick, 5000); // live-ish fleet view (§23)
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [load]);

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
    return () => {
      alive = false;
    };
  }, []);

  /*
    ONLINE/OFFLINE IS A FACET NOW, and it is the one this screen was missing.
    The fleet summary said "3 offline" and the only way to find which three was
    to read every card — on a wall of forty screens, which is the size at which
    somebody installs digital signage.
  */
  const facetGroups = useMemo(
    () => [
      {
        key: "status",
        label: "Status",
        options: [
          { value: "online", label: "Online" },
          { value: "offline", label: "Offline" },
        ],
      },
      { key: "tag", label: "Tag", options: allTags.map((t) => ({ value: t, label: t })) },
    ],
    [allTags],
  );

  const shown = useMemo(() => {
    if (!screens) return null;
    const needle = q.trim().toLowerCase();
    return screens.filter((s) => {
      if (facets.status === "online" && !s.live?.online) return false;
      if (facets.status === "offline" && s.live?.online) return false;
      if (facets.tag && !(s.tags ?? []).includes(facets.tag)) return false;
      return !needle || s.name.toLowerCase().includes(needle) || (s.channel_name ?? "").toLowerCase().includes(needle);
    });
  }, [screens, q, facets]);

  // A workspace with no screens at all gets the first-run panel, not a
  // `Collection.empty` — `GetStarted` is two choice cards and a three-step
  // explainer, which is a different thing from "nothing matched".
  if (screens && screens.length === 0 && !error) {
    return (
      <div>
        <PageHeader title="Screens" description="Your paired screens, live." />
        <GetStarted canPair={canPair} canCreate={canCreate} creating={creating} onPair={onPair} onNewDisplay={() => void newDisplay(true)} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Screens"
        description={screens ? `${screens.length} device${screens.length === 1 ? "" : "s"} · ${online} online` : "Your paired screens, live."}
      />

      {/* Four boxed stat cards became one strip — they are a comparison, and on
          a phone four half-empty boxes is not one. `null` while the first poll
          is in flight, never a confident 0. */}
      <div className="mb-5 rounded-2xl bg-card py-4">
        <GlanceStrip
          items={[
            { icon: MonitorSpeaker, tone: "neutral", value: screens?.length ?? null, label: "Screens" },
            { icon: Wifi, tone: "success", value: screens ? online : null, label: "Online" },
            { icon: WifiOff, tone: offline > 0 ? "danger" : "neutral", value: screens ? offline : null, label: "Offline" },
            { icon: BellRing, tone: openAlerts ? "danger" : "neutral", value: openAlerts, label: "Open alerts" },
          ]}
        />
      </div>

      <Collection
        items={shown}
        itemKey={(s: Screen) => s.id}
        error={screens ? null : error}
        onRetry={() => void load()}
        noun="screens"
        view={view}
        onView={setView}
        query={q}
        onQuery={setQ}
        narrowed={Boolean(facets.tag || facets.status)}
        onClearFilters={() => setFacets({ tag: null, status: null })}
        filter={<Filters groups={facetGroups} value={facets} onChange={setFacets} />}
        thumb={56}
        empty={{
          icon: MonitorSpeaker,
          title: "No screens yet",
          description: "Pair a screen or create a display to get started.",
        }}
        renderList={(s: Screen) => (
          <Row
            icon={s.live?.online ? Wifi : WifiOff}
            iconTone={s.live?.online ? "success" : "neutral"}
            // `.filter(Boolean)` before the join: a screen that has never
            // reported its size contributes nothing, and without this an absent
            // segment leaves a double separator — "Unassigned ·  · Live".
            sub={[
              s.channel_name ?? "Unassigned",
              resolutionLabel(s),
              s.live?.online ? "Live" : lastSeenLabel(s.live?.lastSeen) ? `last seen ${lastSeenLabel(s.live?.lastSeen)}` : "Offline",
            ]
              .filter(Boolean)
              .join(" · ")}
            onClick={() => navigate(`/screens/${s.id}`)}
          >
            {s.name}
          </Row>
        )}
        renderGrid={(s: Screen) => <DeviceCard key={s.id} screen={s} onClick={() => navigate(`/screens/${s.id}`)} />}
      />
    </div>
  );
}

function DeviceCard({ screen, onClick }: { screen: Screen; onClick: () => void }) {
  const online = !!screen.live?.online;
  const { orientation } = dimsOf(screen);
  const portrait = orientation === "portrait";
  const seen = lastSeenLabel(screen.live?.lastSeen);
  const resolution = resolutionLabel(screen);
  const channel = screen.channel_name;
  return (
    <Card onClick={onClick} className="group relative cursor-pointer overflow-hidden p-0 transition-all hover:bg-surface-2 active:scale-[0.99]">
      <div className="relative">
        {/* Live, clock-computed view of what this device is showing right now. */}
        <DevicePreview channelId={screen.channel_id} online={online} className="rounded-none ring-0" />
        <span
          className={cn(
            "absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-caption font-medium shadow-sm backdrop-blur-md",
            online ? "bg-success/90 text-white" : "bg-black/55 text-white/90",
          )}
        >
          <span className={cn("size-1.5 rounded-full", online ? "bg-white" : "bg-white/60")} />
          {online ? "Live" : "Offline"}
        </span>
      </div>
      <div className="p-3.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-body font-semibold">{screen.name}</span>
          <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-foreground" />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {channel ? <Badge className="font-normal">{channel}</Badge> : <Badge className="font-normal text-muted-foreground">Unassigned</Badge>}
          {resolution && (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-caption font-medium text-muted-foreground">
              {portrait ? <RectangleVertical className="size-3" /> : <RectangleHorizontal className="size-3" />}
              {resolution}
            </span>
          )}
          {!online && seen && <span className="text-caption text-muted-foreground">· {seen}</span>}
        </div>
        {(screen.tags?.length ?? 0) > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {screen.tags!.slice(0, 5).map((t) => (
              <span key={t} className="rounded bg-secondary px-1.5 py-0.5 text-caption font-medium text-secondary-foreground">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
