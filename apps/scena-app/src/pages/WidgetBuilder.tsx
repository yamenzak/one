/**
 * The widget builder (BLUEPRINT §17 "Builder") — a Canva-grade authoring canvas.
 *
 * Edits a reusable *widget profile* (§4): open from the Widget profiles page
 * (`/widgets?profile=<id>`), arrange widgets on a design-space canvas, and Save.
 *
 * Canvas math is "real-pixel scaling": the scene is authored in design space
 * (designW × designH) but the stage element is given a *real* pixel size
 * (design × scale, scale = fitScale × zoom). Each widget's *visual* is authored
 * at design px and scaled inside the node via a transform on a DESCENDANT.
 *
 * Drag/resize/rotate are handled by a custom pointer-driven controller
 * (`builder/TransformBox`) — geometry is computed directly from pointer deltas
 * in design space, exact at any zoom and any rotation, with grid snapping. This
 * replaced react-moveable, whose matrix math drifted in this scaled-canvas setup
 * (dragging sent nodes off-screen); it is also touch-native for mobile.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import type { Widget } from "@scena/manifest";
import { WIDGET_REGISTRY, WIDGET_GROUPS, widgetDef, num } from "@scena/widgets";
import {
  ArrowLeft,
  Save,
  Maximize2,
  Trash2,
  Loader2,
  Grid3x3,
  Magnet,
  Undo2,
  Redo2,
  Copy,
  ZoomIn,
  ZoomOut,
  MousePointer2,
  Layers as LayersIcon,
  ChevronUp,
  ChevronDown,
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  PanelRightClose,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Lock,
} from "lucide-react";
import {
  getWidgetProfile,
  saveProfileWidgets,
  listBoards,
  listFeeds,
  listWeatherLocations,
  getBranding,
  type Board,
  type Feed,
  type WeatherLocation,
  type BrandLogo,
} from "../api.js";
import { WidgetContent } from "../builder/WidgetView.js";
import { LiveDataProvider } from "../builder/live-data.js";
import { Panel } from "../builder/panel/Panel.js";
import { widgetIcon } from "../builder/widget-icons.js";
import { makeWidget, fromManifestWidget, DESIGN_W, DESIGN_H, type WNode, type WType } from "../builder/types.js";
import { useFeature } from "../entitlements.js";
import { useHistory } from "../builder/history.js";
import { TransformBox, GroupBox, SELECT, SELECT_WASH, type Phase } from "../builder/TransformBox.js";
import { AiLayoutDialog } from "../builder/AiLayoutDialog.js";
import { intersects, alignPatches, distributePatches, clampPos, type AlignKind } from "../builder/geometry.js";
import { offerPublishAffected } from "../components/publish-affected.js";
import { Badge, Button, cn, EmptyState, LoadError, Separator, Sheet, Skeleton, toast, Tooltip } from "@4dl/ui";

/** Accept both the flat WNode shape and the manifest rect-tuple shape. */
function hydrateNode(raw: unknown, i: number): WNode | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (Array.isArray(o.rect)) return fromManifestWidget(o as unknown as Widget);
  if (typeof o.type !== "string" || !widgetDef(o.type)) return null;
  const nnum = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    id: typeof o.id === "string" ? o.id : `${o.type}_${i}`,
    type: o.type as WType,
    x: nnum(o.x, 0),
    y: nnum(o.y, 0),
    w: nnum(o.w, 200),
    h: nnum(o.h, 120),
    rot: nnum(o.rot, 0),
    z: nnum(o.z, 10),
    style: o.style && typeof o.style === "object" ? (o.style as Record<string, unknown>) : {},
    config: o.config && typeof o.config === "object" ? (o.config as Record<string, unknown>) : {},
  };
}

export function WidgetBuilderPage() {
  const [params] = useSearchParams();
  const profileId = params.get("profile");
  if (!profileId) return <NoProfile />;
  return <Builder key={profileId} profileId={profileId} />;
}

function NoProfile() {
  return (
    <div className="mx-auto max-w-2xl">
      <EmptyState
        icon={LayersIcon}
        title="No widget profile selected"
        description="Open a widget profile from the Widget profiles page to edit its overlay layout."
        action={
          <Button asChild variant="outline">
            <Link to="/profiles">
              <ArrowLeft className="size-4" /> Widget profiles
            </Link>
          </Button>
        }
      />
    </div>
  );
}

const GRID = 20; // design-space grid step

function Builder({ profileId }: { profileId: string }) {
  const [name, setName] = useState("Widget profile");
  const [designW, setDesignW] = useState(DESIGN_W);
  const [designH, setDesignH] = useState(DESIGN_H);
  const history = useHistory<WNode[]>([]);
  const nodes = history.present;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const [sel, setSel] = useState<Set<string>>(new Set());
  const selRef = useRef(sel);
  selRef.current = sel;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const [showGrid, setShowGrid] = useState(true);
  const [snap, setSnap] = useState(true);
  const [showPanel, setShowPanel] = useState(true);
  const [layersOpen, setLayersOpen] = useState(true);
  const [aiOpen, setAiOpen] = useState(false);
  // Plan feature gates: hide the HTML widget + AI designer when the plan lacks them.
  const canHtml = useFeature("htmlSandbox");
  const canAi = useFeature("aiGeneration");
  // Gate the palette to what the plan will actually compile — the server strips
  // stack/ticker/weather (and downgrades analog clock) at publish, so offering
  // them here would let a widget silently vanish on the screen.
  const canStack = useFeature("widgetStack");
  const canTicker = useFeature("ticker");
  const canWeather = useFeature("weather");
  const canUseWidget = (t: string) =>
    (t !== "html" || canHtml) && (t !== "stack" || canStack) && (t !== "ticker" || canTicker) && (t !== "weather" || canWeather);
  // Gated widgets stay visible in the palette but read-only (a lock badge); a tap
  // routes to Billing rather than silently hiding a capability the plan could add.
  const navigate = useNavigate();
  const onPick = (t: WType) => (canUseWidget(t) ? add(t) : navigate("/billing"));

  // Mobile chrome: the palette rail (<sm) and properties panel (<md) collapse
  // into Sheets reachable from floating buttons; touch pointers get fat handles.
  const [coarse] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  // Data sources for the Properties panel.
  const [boards, setBoards] = useState<Board[]>([]);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [weather, setWeather] = useState<WeatherLocation[]>([]);
  const [logos, setLogos] = useState<BrandLogo[]>([]);

  // Fit measurement + zoom.
  const [box, setBox] = useState({ w: DESIGN_W, h: DESIGN_H });
  const [zoom, setZoom] = useState(1); // 1 = fit
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const frameRefs = useRef<Map<string, HTMLElement>>(new Map());

  const fitScale = useMemo(() => {
    const s = Math.min(box.w / designW, box.h / designH);
    return Number.isFinite(s) && s > 0 ? s : 0.1;
  }, [box, designW, designH]);
  const scale = fitScale * zoom;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const W = designW * scale;
  const H = designH * scale;

  /* ------------------------------ load ---------------------------------- */
  /*
    Extracted from the effect so the failed state has a BUTTON. It used to set
    a status line reading "Couldn't load this profile — refresh to retry",
    which is an instruction to do by hand the thing a control does — and on a
    screen with unsaved-changes guards, "refresh" is the one word you do not
    want to be telling somebody.
  */
  const reload = useCallback(() => {
    setLoading(true);
    setStatus("");
    return (
      getWidgetProfile(profileId)
        .then((p) => {
          setName(p.name || "Widget profile");
          setDesignW(p.design_w && p.design_w > 0 ? p.design_w : DESIGN_W);
          setDesignH(p.design_h && p.design_h > 0 ? p.design_h : DESIGN_H);
          const seed = Array.isArray(p.widgets) ? p.widgets.map(hydrateNode).filter((n): n is WNode => n !== null) : [];
          history.reset(seed);
          setDirty(false);
          setLoadError(false);
        })
        // A failed load must NOT look like an empty profile — flag it so Save is
        // disabled (saving now would overwrite the real stored layout with nothing).
        .catch(() => setLoadError(true))
        .finally(() => setLoading(false))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  useEffect(() => {
    let live = true;
    void reload();
    // Option lists, and their failures are deliberately quiet: a picker that
    // cannot load its options degrades to a picker with no options, and makes
    // no claim about the profile.
    listBoards()
      .then((v) => live && setBoards(v))
      .catch(() => {});
    listFeeds()
      .then((v) => live && setFeeds(v))
      .catch(() => {});
    listWeatherLocations()
      .then((v) => live && setWeather(v.locations))
      .catch(() => {});
    getBranding()
      .then((v) => live && setLogos(v.logos ?? []))
      .catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  // Warn before a reload/close/tab-away when there are unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const measure = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    setBox({ w: Math.max(1, el.clientWidth), h: Math.max(1, el.clientHeight) });
  }, []);
  useLayoutEffect(() => {
    measure();
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  /* --------------------------- mutations -------------------------------- */
  const mark = () => {
    setDirty(true);
    setStatus(null);
  };
  const commit = useCallback(
    (fn: (prev: WNode[]) => WNode[]) => {
      history.commit(fn);
      mark();
    },
    [history],
  );
  const live = useCallback(
    (fn: (prev: WNode[]) => WNode[]) => {
      history.live(fn);
      mark();
    },
    [history],
  );

  const patch = (id: string, p: Partial<WNode>) => commit((prev) => prev.map((n) => (n.id === id ? { ...n, ...p } : n)));
  const patchStyle = (id: string, p: Record<string, unknown>) => commit((prev) => prev.map((n) => (n.id === id ? { ...n, style: { ...n.style, ...p } } : n)));
  const patchConfig = (id: string, p: Record<string, unknown>) =>
    commit((prev) => prev.map((n) => (n.id === id ? { ...n, config: { ...n.config, ...p } } : n)));
  const applyMap = (map: Record<string, Partial<WNode>>, isLive: boolean) => {
    const f = (prev: WNode[]) => prev.map((n) => (map[n.id] ? { ...n, ...map[n.id] } : n));
    isLive ? live(f) : commit(f);
  };

  function add(type: WType) {
    const node = makeWidget(type);
    node.x = Math.max(0, Math.min(node.x, designW - node.w));
    node.y = Math.max(0, Math.min(node.y, designH - node.h));
    node.z = Math.max(0, ...nodesRef.current.map((n) => n.z)) + 1;
    commit((prev) => [...prev, node]);
    setSel(new Set([node.id]));
    setPaletteOpen(false);
  }
  // AI layout designer: replace the canvas with the model's composition in one
  // commit (a single undo reverses the whole generation), clamped to the frame.
  function applyAiLayout(next: WNode[]) {
    const clamped = next.map((n) => {
      const w = Math.min(Math.max(n.w, 16), designW);
      const h = Math.min(Math.max(n.h, 16), designH);
      const { x, y } = clampPos(n.x, n.y, w, h, designW, designH);
      return { ...n, w, h, x, y };
    });
    commit(() => clamped);
    setSel(new Set(clamped.map((n) => n.id)));
  }
  function removeSel() {
    const ids = selRef.current;
    if (!ids.size) return;
    commit((prev) => prev.filter((n) => !ids.has(n.id)));
    setSel(new Set());
  }
  function duplicateSel() {
    const ids = selRef.current;
    const picked = nodesRef.current.filter((n) => ids.has(n.id));
    if (!picked.length) return;
    const clones = picked.map((n) => ({
      ...structuredClone(n),
      id: `${n.type}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      x: n.x + 24,
      y: n.y + 24,
    }));
    commit((prev) => [...prev, ...clones]);
    setSel(new Set(clones.map((c) => c.id)));
  }
  function nudge(dx: number, dy: number) {
    const ids = selRef.current;
    if (!ids.size) return;
    commit((prev) =>
      prev.map((n) => {
        if (!ids.has(n.id)) return n;
        const c = clampPos(n.x + dx, n.y + dy, n.w, n.h, designW, designH);
        return { ...n, x: c.x, y: c.y };
      }),
    );
  }
  function reorder(id: string, dir: "front" | "back") {
    const zs = nodesRef.current.map((n) => n.z);
    const z = dir === "front" ? Math.max(...zs) + 1 : Math.min(...zs) - 1;
    patch(id, { z });
  }
  const alignSel = (k: AlignKind) =>
    applyMap(
      alignPatches(
        nodesRef.current.filter((n) => selRef.current.has(n.id)),
        k,
      ),
      false,
    );
  const distributeSel = (axis: "h" | "v") =>
    applyMap(
      distributePatches(
        nodesRef.current.filter((n) => selRef.current.has(n.id)),
        axis,
      ),
      false,
    );

  /* --------------------------- clipboard -------------------------------- */
  const clip = useRef<WNode[]>([]);
  const copySel = () => {
    clip.current = nodesRef.current.filter((n) => selRef.current.has(n.id)).map((n) => structuredClone(n));
  };
  const paste = () => {
    if (!clip.current.length) return;
    const clones = clip.current.map((n) => ({
      ...structuredClone(n),
      id: `${n.type}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      x: n.x + 24,
      y: n.y + 24,
    }));
    commit((prev) => [...prev, ...clones]);
    setSel(new Set(clones.map((c) => c.id)));
  };

  /* ------------------------------ save ---------------------------------- */
  const save = useCallback(async () => {
    setSaving(true);
    setStatus(null);
    try {
      await saveProfileWidgets(profileId, nodesRef.current);
      setDirty(false);
      setStatus("Saved");
      void offerPublishAffected("widget", profileId); // offer to push straight to channels using this profile
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setStatus(msg);
      toast.error(msg); // a failed save must be loud, not a small grey toolbar note
    } finally {
      setSaving(false);
    }
  }, [profileId]);

  /* ---------------------------- keyboard -------------------------------- */
  useEffect(() => {
    const typing = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable || el.tagName === "SELECT");
    };
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
        return;
      }
      if (typing(e.target)) return;
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? history.redo() : history.undo();
        return;
      }
      if (meta && e.key.toLowerCase() === "y") {
        e.preventDefault();
        history.redo();
        return;
      }
      if (meta && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSel();
        return;
      }
      if (meta && e.key.toLowerCase() === "c") {
        copySel();
        return;
      }
      if (meta && e.key.toLowerCase() === "v") {
        paste();
        return;
      }
      if (meta && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSel(new Set(nodesRef.current.map((n) => n.id)));
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeSel();
        return;
      }
      if (e.key === "Escape") {
        setSel(new Set());
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        nudge(-step, 0);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nudge(step, 0);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        nudge(0, -step);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        nudge(0, step);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, save]);

  /* ------------------------------ zoom ---------------------------------- */
  const zoomBy = (f: number) => setZoom((z) => Math.max(0.25, Math.min(4, z * f)));
  const fit = () => {
    setZoom(1);
    const el = wrapRef.current;
    if (el) {
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
      el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
    }
  };
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Two-finger pinch to zoom (one-finger pan is native overflow scrolling).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let startDist = 0,
      startZoom = 1;
    const dist = (t: TouchList) => Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        startDist = dist(e.touches);
        startZoom = zoomRef.current;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && startDist > 0) {
        e.preventDefault();
        const ratio = dist(e.touches) / startDist;
        setZoom(Math.max(0.25, Math.min(4, startZoom * ratio)));
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) startDist = 0;
    };
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, []);

  /* ---------------------------- selection ------------------------------- */
  const selectOne = (id: string, additive: boolean) => {
    setSel((prev) => {
      if (additive) {
        const n = new Set(prev);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
      }
      if (prev.has(id) && prev.size > 1) return prev; // keep group for a group drag
      return new Set([id]);
    });
  };

  // Marquee rubber-band select on empty canvas.
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const marqueeStart = useRef<{ x: number; y: number; add: Set<string> } | null>(null);
  const onCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    const sx = e.clientX - r.left,
      sy = e.clientY - r.top;
    marqueeStart.current = { x: sx, y: sy, add: e.shiftKey ? new Set(selRef.current) : new Set() };
    if (!e.shiftKey) setSel(new Set());
    setMarquee({ x: sx, y: sy, w: 0, h: 0 });
  };
  useEffect(() => {
    if (!marqueeStart.current) return;
    const move = (e: MouseEvent) => {
      const st = marqueeStart.current,
        stage = stageRef.current;
      if (!st || !stage) return;
      const r = stage.getBoundingClientRect();
      const cx = e.clientX - r.left,
        cy = e.clientY - r.top;
      const x = Math.min(st.x, cx),
        y = Math.min(st.y, cy),
        w = Math.abs(cx - st.x),
        h = Math.abs(cy - st.y);
      setMarquee({ x, y, w, h });
      const box = { x: x / scaleRef.current, y: y / scaleRef.current, w: w / scaleRef.current, h: h / scaleRef.current };
      const hit = nodesRef.current.filter((n) => intersects(box, n)).map((n) => n.id);
      setSel(new Set([...st.add, ...hit]));
    };
    const up = () => {
      marqueeStart.current = null;
      setMarquee(null);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [marquee !== null]);

  /* --------------------------- gesture wiring --------------------------- */
  // A custom pointer-driven controller (TransformBox) owns drag/resize/rotate —
  // exact geometry at any zoom/rotation, no black-box matrix. It reports (patch,
  // phase): on "start" we checkpoint (one undo per gesture); on "move" we live-
  // update present; "end" is a no-op (present already holds the final value).
  const selIds = useMemo(() => [...sel], [sel]);
  const single = selIds.length === 1 ? selIds[0]! : null;
  const selectedNode = single ? (nodes.find((n) => n.id === single) ?? null) : null;
  const selectedNodes = useMemo(() => nodes.filter((n) => sel.has(n.id)), [nodes, sel]);
  const snapCfg = useMemo(() => ({ grid: GRID, snap, guides: nodes.filter((n) => !sel.has(n.id)), designW, designH }), [snap, nodes, sel, designW, designH]);

  const onBox = (patch: Partial<WNode>, phase: Phase) => {
    if (!single) return;
    if (phase === "start") history.checkpoint();
    else if (phase === "move") {
      history.live((prev) => prev.map((n) => (n.id === single ? { ...n, ...patch } : n)));
      mark();
    }
  };
  const onGroup = (patches: Record<string, Partial<WNode>>, phase: Phase) => {
    if (phase === "start") history.checkpoint();
    else if (phase === "move") {
      history.live((prev) => prev.map((n) => (patches[n.id] ? { ...n, ...patches[n.id] } : n)));
      mark();
    }
  };

  /* --------- shared panel body (desktop aside + mobile sheet) ------------ */
  const panelBody = (
    <>
      <div className="p-3.5">
        <button
          type="button"
          onClick={() => setLayersOpen((v) => !v)}
          className="mb-3 flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          aria-expanded={layersOpen}
        >
          <LayersIcon className="size-3.5" />
          <span>Layers ({nodes.length})</span>
          <ChevronDown className={cn("ml-auto size-4 transition-transform", layersOpen ? "" : "-rotate-90")} />
        </button>
        {!layersOpen ? null : nodes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No widgets yet — pick one from the palette.</p>
        ) : (
          <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
            {[...nodes]
              .sort((a, b) => b.z - a.z)
              .map((n) => {
                const def = widgetDef(n.type);
                const active = sel.has(n.id);
                return (
                  <div
                    key={n.id}
                    onMouseDown={(e) => selectOne(n.id, e.shiftKey)}
                    className={cn(
                      "group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                      active ? "bg-primary/10 text-primary" : "hover:bg-accent",
                    )}
                  >
                    <span className={cn("flex [&_svg]:size-4", active ? "text-primary" : "text-muted-foreground")}>{widgetIcon(def?.icon ?? "rect")}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{def?.label ?? n.type}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        reorder(n.id, "front");
                      }}
                      aria-label="Bring to front"
                      className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100"
                      title="Bring to front"
                    >
                      <ChevronUp className="size-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        reorder(n.id, "back");
                      }}
                      aria-label="Send to back"
                      className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100"
                      title="Send to back"
                    >
                      <ChevronDown className="size-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSel(new Set([n.id]));
                        removeSel();
                      }}
                      aria-label="Delete widget"
                      className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100"
                      title="Delete"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                );
              })}
          </div>
        )}
      </div>
      <Separator />
      <div className="p-3.5">
        {selIds.length > 1 ? (
          <MultiPanel count={selIds.length} onAlign={alignSel} onDistribute={distributeSel} onDuplicate={duplicateSel} onDelete={removeSel} />
        ) : selectedNode ? (
          <>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
              <span className="flex text-primary [&_svg]:size-4">{widgetIcon(widgetDef(selectedNode.type)?.icon ?? "rect")}</span>
              {widgetDef(selectedNode.type)?.label ?? "Widget"}
            </div>
            <Panel
              node={selectedNode}
              boards={boards}
              feeds={feeds}
              weather={weather}
              logos={logos}
              onGeom={(p) => patch(selectedNode.id, p)}
              onStyle={(p) => patchStyle(selectedNode.id, p)}
              onConfig={(p) => patchConfig(selectedNode.id, p)}
            />
            <Separator className="my-3" />
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" className="flex-1" onClick={duplicateSel}>
                <Copy className="size-3.5" /> Duplicate
              </Button>
              <Button variant="outline" size="sm" className="flex-1 text-destructive hover:text-destructive" onClick={removeSel}>
                <Trash2 className="size-3.5" /> Delete
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Select a widget to edit its properties, or drag on the canvas to marquee-select.</p>
        )}
      </div>
    </>
  );

  /* ------------------------------ render -------------------------------- */
  return (
    <>
      <div className="relative flex h-[calc(100vh-6.5rem)] min-h-[520px] flex-col overflow-hidden rounded-xl border bg-card">
        {/* Toolbar */}
        <div className="flex items-center gap-1.5 border-b px-2.5 py-2">
          <Button asChild variant="ghost" size="icon" className="size-8 shrink-0">
            <Link
              to="/profiles"
              title="Back to widget profiles"
              onClick={(e) => {
                if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) e.preventDefault();
              }}
            >
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div className="mr-1 min-w-0">
            <div className="truncate text-sm font-semibold leading-tight">{name}</div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="tabular-nums">
                {designW}×{designH}
              </span>
              {dirty ? <span className="text-warning">• Unsaved</span> : status ? <span>{status}</span> : null}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1">
            {/* Full tool cluster on ≥ md; on mobile it moves to the strip below so
                the top bar stays uncramped (just back · title · save). */}
            <div className="hidden items-center gap-1 md:flex">
              <TB icon={<Undo2 />} label="Undo (⌘Z)" disabled={!history.canUndo} onClick={history.undo} />
              <TB icon={<Redo2 />} label="Redo (⇧⌘Z)" disabled={!history.canRedo} onClick={history.redo} />
              <Separator orientation="vertical" className="mx-0.5 h-5" />
              <TB icon={<Grid3x3 />} label="Grid" active={showGrid} onClick={() => setShowGrid((v) => !v)} />
              <TB icon={<Magnet />} label="Snap" active={snap} onClick={() => setSnap((v) => !v)} />
              <Separator orientation="vertical" className="mx-0.5 h-5" />
              <TB icon={<ZoomOut />} label="Zoom out" onClick={() => zoomBy(1 / 1.2)} />
              <button
                onClick={fit}
                className="w-11 rounded-md py-1 text-center text-xs font-medium tabular-nums text-muted-foreground hover:bg-accent"
                title="Zoom to fit"
              >
                {Math.round(scale * 100)}%
              </button>
              <TB icon={<ZoomIn />} label="Zoom in" onClick={() => zoomBy(1.2)} />
              <TB icon={<Maximize2 />} label="Fit" onClick={fit} />
              <Separator orientation="vertical" className="mx-0.5 h-5" />
              <TB icon={<PanelRightClose />} label="Toggle panel" active={showPanel} onClick={() => setShowPanel((v) => !v)} />
            </div>
            <Button variant="outline" size="sm" onClick={() => (canAi ? setAiOpen(true) : navigate("/billing"))} disabled={loading} className="ml-1 gap-1.5">
              {canAi ? <Sparkles className="size-4 text-primary" /> : <Lock className="size-3.5 text-muted-foreground" />}
              <span className="hidden sm:inline">{canAi ? "Design with AI" : "AI — Upgrade"}</span>
            </Button>
            <Button onClick={save} disabled={saving || loading || loadError} size="sm" className="ml-1">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              <span className="hidden sm:inline">{saving ? "Saving…" : "Save"}</span>
            </Button>
          </div>
        </div>

        {/* Mobile tool strip (< md) — scrollable so nothing crowds the top bar. */}
        <div className="flex items-center gap-1 overflow-x-auto border-b px-2 py-1 md:hidden">
          <TB icon={<Undo2 />} label="Undo" disabled={!history.canUndo} onClick={history.undo} />
          <TB icon={<Redo2 />} label="Redo" disabled={!history.canRedo} onClick={history.redo} />
          <Separator orientation="vertical" className="mx-0.5 h-5" />
          <TB icon={<Grid3x3 />} label="Grid" active={showGrid} onClick={() => setShowGrid((v) => !v)} />
          <TB icon={<Magnet />} label="Snap" active={snap} onClick={() => setSnap((v) => !v)} />
          <Separator orientation="vertical" className="mx-0.5 h-5" />
          <TB icon={<ZoomOut />} label="Zoom out" onClick={() => zoomBy(1 / 1.2)} />
          <button
            onClick={fit}
            className="w-11 shrink-0 rounded-md py-1 text-center text-xs font-medium tabular-nums text-muted-foreground hover:bg-accent"
            title="Zoom to fit"
          >
            {Math.round(scale * 100)}%
          </button>
          <TB icon={<ZoomIn />} label="Zoom in" onClick={() => zoomBy(1.2)} />
          <TB icon={<Maximize2 />} label="Fit" onClick={fit} />
          <Separator orientation="vertical" className="mx-0.5 h-5" />
          <TB
            icon={canAi ? <Sparkles className="size-4 text-primary" /> : <Lock className="size-4 text-muted-foreground" />}
            label={canAi ? "Design with AI" : "AI — Upgrade"}
            onClick={() => (canAi ? setAiOpen(true) : navigate("/billing"))}
          />
        </div>

        <LiveDataProvider nodes={nodes} weather={weather} boards={boards}>
          <div className="flex min-h-0 flex-1">
            {/* Palette rail */}
            <div className="hidden w-14 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r py-2 sm:flex">
              {WIDGET_GROUPS.map((group) => (
                <div key={group} className="flex flex-col items-center gap-1">
                  {WIDGET_REGISTRY.filter((w) => w.group === group).map((w) => {
                    const usable = canUseWidget(w.type);
                    return (
                      <Tooltip key={w.type} content={usable ? w.label : `${w.label} — Upgrade`} side="right">
                        <button
                          onClick={() => onPick(w.type)}
                          className={cn(
                            "relative flex size-10 items-center justify-center rounded-lg transition-colors [&_svg]:size-[18px]",
                            usable ? "text-muted-foreground hover:bg-accent hover:text-foreground" : "text-muted-foreground/40 hover:bg-accent/40",
                          )}
                        >
                          {widgetIcon(w.icon)}
                          {!usable && <Lock className="absolute bottom-0 right-0 size-3 rounded-full bg-background p-[1.5px] text-muted-foreground" />}
                        </button>
                      </Tooltip>
                    );
                  })}
                  <Separator className="my-0.5 w-6" />
                </div>
              ))}
            </div>

            {/* Canvas */}
            <div
              ref={wrapRef}
              className="relative flex min-w-0 flex-1 items-center justify-center overflow-auto bg-[radial-gradient(circle_at_1px_1px,theme(colors.border)_1px,transparent_0)] bg-[size:22px_22px] p-6"
            >
              {loadError ? (
                // Was a status line reading "Couldn't load this profile — refresh
                // to retry", i.e. an instruction to do by hand the thing a button
                // does. Save stays disabled either way: saving now would overwrite
                // the real stored layout with an empty one.
                <div className="w-full max-w-md">
                  <LoadError what="this profile" error="We couldn’t reach the server." onRetry={reload} />
                </div>
              ) : loading ? (
                // A skeleton in the geometry actually chosen, not a spinner: the
                // stage is a known size before the widgets arrive, so the canvas
                // can be its own shape while it fills rather than jumping into
                // place from a centred one-liner.
                <Skeleton className="shrink-0 rounded-lg" style={{ width: W, height: H }} />
              ) : (
                <div
                  ref={(el) => {
                    stageRef.current = el;
                    setStageEl(el);
                  }}
                  className="relative shrink-0 overflow-visible rounded-lg ring-1 ring-border/70"
                  style={{ width: W, height: H, boxShadow: "var(--shadow-lg)" }}
                >
                  <div
                    onMouseDown={(e) => {
                      if (e.target === e.currentTarget) onCanvasMouseDown(e);
                    }}
                    className="absolute inset-0 overflow-hidden rounded-lg"
                    style={{ background: "linear-gradient(135deg, oklch(0.28 0.03 300), oklch(0.19 0.02 300))" }}
                  >
                    {showGrid && (
                      <div
                        className="pointer-events-none absolute inset-0"
                        style={{
                          backgroundImage:
                            "linear-gradient(oklch(1 0 0 / 0.06) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.06) 1px, transparent 1px)",
                          backgroundSize: `${GRID * scale}px ${GRID * scale}px`,
                        }}
                      />
                    )}
                    {[...nodes]
                      .sort((a, b) => a.z - b.z)
                      .map((n) => {
                        const active = sel.has(n.id);
                        return (
                          <div
                            key={n.id}
                            data-wid={n.id}
                            ref={(el) => {
                              if (el) frameRefs.current.set(n.id, el);
                              else frameRefs.current.delete(n.id);
                            }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              selectOne(n.id, e.shiftKey);
                            }}
                            style={{
                              position: "absolute",
                              left: 0,
                              top: 0,
                              width: n.w * scale,
                              height: n.h * scale,
                              transform: `translate(${n.x * scale}px, ${n.y * scale}px)${n.rot ? ` rotate(${n.rot}deg)` : ""}`,
                              transformOrigin: "center center",
                              zIndex: n.z,
                              cursor: "move",
                              outline: active ? "none" : "1px dashed oklch(1 0 0 / 0.22)",
                              outlineOffset: 0,
                              backdropFilter: num(n.style.blur, 0) > 0 ? `blur(${num(n.style.blur, 0)}px)` : undefined,
                            }}
                          >
                            <div
                              style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                width: n.w,
                                height: n.h,
                                transform: `scale(${scale})`,
                                transformOrigin: "top left",
                              }}
                            >
                              <WidgetContent node={n} />
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  {/* The SAME colour the transform box uses. These were two different
                    selection colours — a theme-following `--primary` here and a
                    fixed violet on the handles — so marquee-selecting three
                    widgets drew a green rectangle that then sprouted violet
                    handles. See `TransformBox`'s header for why the fixed hue
                    is right over arbitrary tenant content. */}
                  {marquee && (
                    <div
                      className="pointer-events-none absolute z-[9999] rounded-sm"
                      style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h, border: `1px solid ${SELECT}`, background: SELECT_WASH }}
                    />
                  )}

                  {single && selectedNode ? (
                    <TransformBox node={selectedNode} scale={scale} cfg={snapCfg} onChange={onBox} touch={coarse} />
                  ) : selectedNodes.length > 1 ? (
                    <GroupBox nodes={selectedNodes} scale={scale} cfg={snapCfg} onChange={onGroup} />
                  ) : null}
                </div>
              )}
            </div>

            {/* Right panel: layers + properties (desktop ≥ md) */}
            {showPanel && (
              <aside className="hidden w-80 shrink-0 flex-col border-l md:flex">
                {/* min-h-0 + native overflow gives the panel a real scroll bound —
                  a flex-1 ScrollArea here grows to content height and never
                  scrolls, hiding a selected widget's properties below the fold. */}
                <div className="min-h-0 flex-1 overflow-y-auto">{panelBody}</div>
              </aside>
            )}
          </div>

          {/* Mobile chrome: floating palette + properties triggers (< md) */}
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex items-center justify-between px-4 md:hidden">
            <Button onClick={() => setPaletteOpen(true)} size="lg" className="pointer-events-auto rounded-full shadow-lg sm:hidden">
              <Plus className="size-5" /> Add
            </Button>
            <div className="flex-1" />
            <Button onClick={() => setMobilePanelOpen(true)} size="lg" variant="secondary" className="pointer-events-auto rounded-full shadow-lg">
              <SlidersHorizontal className="size-5" />
              {sel.size > 0 ? <Badge className="ml-1 h-5 px-1.5">{sel.size}</Badge> : "Layers"}
            </Button>
          </div>

          {/* Palette sheet — `tall`, because a picker you scroll should open at
            the ceiling rather than growing to fit and leaving the last row
            below the fold. The shared Sheet owns the height and the scroll. */}
          <Sheet open={paletteOpen} onClose={() => setPaletteOpen(false)} title="Add a widget" size="tall">
            <div>
              {WIDGET_GROUPS.map((group) => (
                <div key={group} className="mb-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {WIDGET_REGISTRY.filter((w) => w.group === group).map((w) => {
                      const usable = canUseWidget(w.type);
                      return (
                        <button
                          key={w.type}
                          onClick={() => {
                            onPick(w.type);
                            if (usable) setPaletteOpen(false);
                          }}
                          className={cn(
                            "relative flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors hover:bg-accent active:bg-accent [&_svg]:size-6",
                            !usable && "opacity-60",
                          )}
                        >
                          <span className="text-muted-foreground">{widgetIcon(w.icon)}</span>
                          <span className="text-xs font-medium leading-tight">{w.label}</span>
                          {!usable && <Lock className="absolute right-1.5 top-1.5 size-3 text-muted-foreground" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Sheet>

          {/* Properties sheet — same body as the desktop aside */}
          <Sheet open={mobilePanelOpen} onClose={() => setMobilePanelOpen(false)} title="Layers & properties" size="tall">
            {panelBody}
          </Sheet>
        </LiveDataProvider>

        <AiLayoutDialog open={aiOpen} nodes={nodes} designW={designW} designH={designH} onOpenChange={setAiOpen} onApply={applyAiLayout} />
      </div>
    </>
  );
}

function TB({
  icon,
  label,
  active,
  disabled,
  onClick,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Tooltip content={label}>
      <Button
        variant={active ? "secondary" : "ghost"}
        size="icon"
        className={cn("size-8 shrink-0", className)}
        disabled={disabled}
        onClick={onClick}
        aria-label={label}
      >
        {icon}
      </Button>
    </Tooltip>
  );
}

function MultiPanel({
  count,
  onAlign,
  onDistribute,
  onDuplicate,
  onDelete,
}: {
  count: number;
  onAlign: (k: AlignKind) => void;
  onDistribute: (a: "h" | "v") => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const A = ({ k, icon, label }: { k: AlignKind; icon: React.ReactNode; label: string }) => (
    <Button variant="outline" size="icon" className="size-8" title={label} onClick={() => onAlign(k)}>
      {icon}
    </Button>
  );
  return (
    <div>
      <SectionLabel icon={<MousePointer2 />} title={`${count} selected`} />
      <div className="mb-2 text-xs font-medium text-muted-foreground">Align</div>
      <div className="mb-3 flex flex-wrap gap-1">
        <A k="left" icon={<AlignHorizontalJustifyStart />} label="Align left" />
        <A k="hcenter" icon={<AlignHorizontalJustifyCenter />} label="Align center" />
        <A k="right" icon={<AlignHorizontalJustifyEnd />} label="Align right" />
        <A k="top" icon={<AlignVerticalJustifyStart />} label="Align top" />
        <A k="vcenter" icon={<AlignVerticalJustifyCenter />} label="Align middle" />
        <A k="bottom" icon={<AlignVerticalJustifyEnd />} label="Align bottom" />
      </div>
      <div className="mb-2 text-xs font-medium text-muted-foreground">Distribute</div>
      <div className="mb-3 flex gap-1">
        <Button variant="outline" size="icon" className="size-8" title="Distribute horizontally" onClick={() => onDistribute("h")}>
          <AlignHorizontalSpaceAround className="size-4" />
        </Button>
        <Button variant="outline" size="icon" className="size-8" title="Distribute vertically" onClick={() => onDistribute("v")}>
          <AlignVerticalSpaceAround className="size-4" />
        </Button>
      </div>
      <Separator className="my-3" />
      <div className="flex gap-1.5">
        <Button variant="outline" size="sm" className="flex-1" onClick={onDuplicate}>
          <Copy className="size-3.5" /> Duplicate
        </Button>
        <Button variant="outline" size="sm" className="flex-1 text-destructive hover:text-destructive" onClick={onDelete}>
          <Trash2 className="size-3.5" /> Delete
        </Button>
      </div>
    </div>
  );
}

function SectionLabel({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {icon}
      {title}
    </div>
  );
}
