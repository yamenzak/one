/**
 * "Create a widget profile" — the three ways to start a profile (§17):
 *   • Template  — a premium ready-made scene (a tour of every widget + variant),
 *   • Blank     — an empty canvas at a chosen resolution,
 *   • Duplicate — a copy of an existing profile's layout.
 * Templates and duplicates seed the new profile's widgets and open the builder;
 * blank opens an empty one. Template cards render a true scaled preview via the
 * shared widget renderer, so what you see is what lands on the canvas.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutTemplate, SquareDashed, CopyPlus, Loader2, Sparkles, Wand2 } from "lucide-react";
import { useFeature } from "../entitlements.js";
import { createWidgetProfile, saveProfileWidgets, getWidgetProfile, aiLayout, listAiModels, type WidgetProfile, type AiModel } from "../api.js";
import { WidgetContent } from "./WidgetView.js";
import { DESIGN_W, DESIGN_H, type WNode } from "./types.js";
import { templatesByCategory, type Template } from "./templates.js";
import { Button, cn, Dialog, DialogContent, Input, ScrollArea, Select, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, toast } from "@4dl/ui";

const DEFAULT_W = 1920,
  DEFAULT_H = 1080;

let seq = 0;
/** Hydrate a validated API layout node into a builder WNode with a fresh id. */
function toNode(raw: unknown, i: number): WNode | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.type !== "string") return null;
  const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  seq += 1;
  return {
    id: `${o.type}_${Date.now().toString(36)}${seq}`,
    type: o.type as WNode["type"],
    x: n(o.x, 0),
    y: n(o.y, 0),
    w: n(o.w, 200),
    h: n(o.h, 120),
    rot: n(o.rot, 0),
    z: n(o.z, 10 + i),
    style: o.style && typeof o.style === "object" ? (o.style as Record<string, unknown>) : {},
    config: o.config && typeof o.config === "object" ? (o.config as Record<string, unknown>) : {},
  };
}

const AI_EXAMPLES = [
  "A welcome screen: big headline, a short subtitle, and today's date bottom-left",
  "A café menu board — three columns of items with prices and a title",
  "A lobby dashboard: a live clock, a countdown to our 3pm event, and two KPI stats",
];

/** A true, scaled preview of a scene's nodes — the same renderer the canvas uses. */
function ScenePreview({ nodes, designW = DESIGN_W, designH = DESIGN_H }: { nodes: WNode[]; designW?: number; designH?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / designW);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [designW]);
  return (
    <div
      ref={ref}
      className="relative w-full overflow-hidden bg-[linear-gradient(135deg,oklch(0.28_0.03_300),oklch(0.18_0.02_300))]"
      style={{ aspectRatio: `${designW} / ${designH}` }}
    >
      {nodes.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-white/60">Empty scene</div>
      ) : scale > 0 ? (
        <div className="absolute left-0 top-0 origin-top-left" style={{ width: designW, height: designH, transform: `scale(${scale})` }}>
          {[...nodes]
            .sort((a, b) => a.z - b.z)
            .map((n) => (
              <div
                key={n.id}
                className="absolute overflow-hidden"
                style={{
                  left: n.x,
                  top: n.y,
                  width: n.w,
                  height: n.h,
                  transform: n.rot ? `rotate(${n.rot}deg)` : undefined,
                  transformOrigin: "center center",
                  zIndex: n.z,
                }}
              >
                <WidgetContent node={n} />
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
}

function TemplateCard({ template, selected, onSelect }: { template: Template; selected: boolean; onSelect: () => void }) {
  // Build once per mount; templates are pure.
  const [nodes] = useState(() => template.build());
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border text-left transition-all hover:shadow-md",
        selected ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary/40",
      )}
    >
      <ScenePreview nodes={nodes} />
      <div className="flex items-start gap-2 p-3">
        {template.accent && <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: template.accent }} />}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{template.name}</div>
          <div className="mt-0.5 line-clamp-2 text-caption leading-snug text-muted-foreground">{template.description}</div>
        </div>
      </div>
    </button>
  );
}

export function ProfileStartDialog({
  open,
  onOpenChange,
  profiles,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Existing profiles, for the Duplicate tab. */
  profiles: WidgetProfile[];
}) {
  const navigate = useNavigate();
  const aiOn = useFeature("aiGeneration");
  const [tab, setTab] = useState("template");
  const [busy, setBusy] = useState(false);

  // Template
  const groups = templatesByCategory();
  const [picked, setPicked] = useState<string>("breaking-red");
  const pickedTpl = groups.flatMap((g) => g.templates).find((t) => t.id === picked) ?? null;

  // Blank
  const [name, setName] = useState("");
  const [w, setW] = useState("");
  const [h, setH] = useState("");

  // Duplicate
  const [srcId, setSrcId] = useState("");

  // AI
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiModels, setAiModels] = useState<AiModel[]>([]);
  const [aiModelId, setAiModelId] = useState("");
  const [aiErr, setAiErr] = useState<string | null>(null);

  // Reset transient state each time it opens.
  useEffect(() => {
    if (open) {
      setTab("template");
      setPicked("breaking-red");
      setName("");
      setW("");
      setH("");
      setSrcId(profiles[0]?.id ?? "");
      setAiPrompt("");
      setAiErr(null);
    }
  }, [open, profiles]);

  // The layout designer runs on any text model (Gemini included).
  useEffect(() => {
    if (open && aiOn)
      listAiModels()
        .then((ms) => setAiModels(ms.filter((m) => m.task === "text")))
        .catch(() => {});
  }, [open, aiOn]);

  async function open_(id: string) {
    onOpenChange(false);
    navigate(`/widgets?profile=${id}`);
  }

  async function createFromTemplate() {
    if (!pickedTpl) return;
    setBusy(true);
    try {
      const nm = name.trim() || pickedTpl.name;
      const id = await createWidgetProfile(nm, { designW: DEFAULT_W, designH: DEFAULT_H });
      const nodes = pickedTpl.build();
      if (nodes.length) await saveProfileWidgets(id, nodes);
      toast.success(`“${nm}” created from ${pickedTpl.name}.`);
      await open_(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create profile");
    } finally {
      setBusy(false);
    }
  }

  async function createBlank() {
    setBusy(true);
    try {
      const designW = parseInt(w, 10),
        designH = parseInt(h, 10);
      const id = await createWidgetProfile(name.trim() || "Widget profile", {
        designW: Number.isFinite(designW) && designW > 0 ? designW : DEFAULT_W,
        designH: Number.isFinite(designH) && designH > 0 ? designH : DEFAULT_H,
      });
      toast.success("Profile created.");
      await open_(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create profile");
    } finally {
      setBusy(false);
    }
  }

  async function createDuplicate() {
    if (!srcId) return;
    setBusy(true);
    try {
      const src = await getWidgetProfile(srcId);
      const nm = name.trim() || `${src.name} copy`;
      const id = await createWidgetProfile(nm, { designW: src.design_w ?? DEFAULT_W, designH: src.design_h ?? DEFAULT_H });
      if (Array.isArray(src.widgets) && src.widgets.length) await saveProfileWidgets(id, src.widgets);
      toast.success(`“${nm}” duplicated.`);
      await open_(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not duplicate profile");
    } finally {
      setBusy(false);
    }
  }

  async function createFromAi() {
    const brief = aiPrompt.trim();
    if (!brief) return;
    setBusy(true);
    setAiErr(null);
    try {
      const r = await aiLayout({ prompt: brief, widgets: [], designW: DEFAULT_W, designH: DEFAULT_H, ...(aiModelId ? { modelId: aiModelId } : {}) });
      if (!r.ok || !Array.isArray(r.widgets) || !r.widgets.length) {
        throw new Error(
          r.detail ||
            (r.error === "insufficient_credits" ? "Not enough AI credits for this generation." : r.error) ||
            "The model returned no layout — try rephrasing.",
        );
      }
      const nodes = r.widgets.map(toNode).filter((n): n is WNode => n !== null);
      if (!nodes.length) throw new Error("The model returned no usable widgets — try again.");
      const nm = name.trim() || "AI layout";
      const id = await createWidgetProfile(nm, { designW: DEFAULT_W, designH: DEFAULT_H });
      await saveProfileWidgets(id, nodes);
      toast.success(`“${nm}” designed with AI.`);
      await open_(id);
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Create a widget profile" className="flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
          <div className="px-5 pt-4">
            <TabsList>
              <TabsTrigger value="template">
                <LayoutTemplate className="size-4" /> Template
              </TabsTrigger>
              <TabsTrigger value="ai">
                <Sparkles className="size-4" /> Design with AI
              </TabsTrigger>
              <TabsTrigger value="blank">
                <SquareDashed className="size-4" /> Blank
              </TabsTrigger>
              <TabsTrigger value="duplicate" disabled={profiles.length === 0}>
                <CopyPlus className="size-4" /> Duplicate
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Template */}
          <TabsContent value="template" className="min-h-0 flex-1 data-[state=inactive]:hidden">
            <ScrollArea className="h-[44vh] sm:h-[52vh]">
              <div className="space-y-6 px-5 py-4">
                {groups.map((g) => (
                  <div key={g.category}>
                    <div className="mb-2.5 text-micro uppercase text-muted-foreground">{g.category}</div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {g.templates.map((t) => (
                        <TemplateCard key={t.id} template={t} selected={picked === t.id} onSelect={() => setPicked(t.id)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="flex flex-wrap items-center gap-3 border-t px-5 py-3">
              <Input placeholder={pickedTpl?.name ?? "Profile name"} value={name} onChange={(e) => setName(e.target.value)} className="w-full sm:max-w-xs" />
              <div className="ml-auto flex items-center gap-2">
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={createFromTemplate} disabled={busy || !pickedTpl}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                  {busy ? "Creating…" : `Use ${pickedTpl?.name ?? "template"}`}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Design with AI */}
          <TabsContent value="ai" className="data-[state=inactive]:hidden">
            {!aiOn ? (
              <div className="px-5 py-10 text-center">
                <div className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-primary/10 text-primary">
                  <Sparkles className="size-5" />
                </div>
                <div className="text-sm font-semibold">AI layout design isn’t in your plan</div>
                <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                  Upgrade to describe a scene in words and have it composed out of real widgets. You can still start from a template or a blank canvas.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-3 px-5 py-5">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Describe the scene</label>
                    <Textarea
                      autoFocus
                      rows={4}
                      placeholder="e.g. A lobby dashboard with a live clock, a welcome headline, and two KPI stats"
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      className="resize-y"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {AI_EXAMPLES.map((ex) => (
                      <button
                        key={ex}
                        type="button"
                        onClick={() => setAiPrompt(ex)}
                        className="rounded-full border px-2.5 py-1 text-left text-caption text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        Name <span className="font-normal">(optional)</span>
                      </label>
                      <Input placeholder="AI layout" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Model</label>
                      <Select
                        value={aiModelId || (aiModels[0]?.id ?? "")}
                        onChange={setAiModelId}
                        placeholder="Default model"
                        options={[...aiModels.map((m) => ({ value: m.id, label: m.label }))]}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The model composes a {DEFAULT_W}×{DEFAULT_H} scene from real widgets, then opens it in the builder to refine.
                  </p>
                  {aiErr && <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{aiErr}</div>}
                </div>
                <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
                  <Button variant="ghost" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button onClick={createFromAi} disabled={busy || !aiPrompt.trim()}>
                    {busy ? (
                      <>
                        <Loader2 className="size-4 animate-spin" /> Designing…
                      </>
                    ) : (
                      <>
                        <Wand2 className="size-4" /> Generate &amp; open
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          {/* Blank */}
          <TabsContent value="blank" className="data-[state=inactive]:hidden">
            <div className="space-y-3 px-5 py-5">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <Input
                  autoFocus
                  placeholder="e.g. Lobby overlay"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createBlank()}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Design width</label>
                  <Input type="number" inputMode="numeric" placeholder={String(DEFAULT_W)} value={w} onChange={(e) => setW(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Design height</label>
                  <Input type="number" inputMode="numeric" placeholder={String(DEFAULT_H)} value={h} onChange={(e) => setH(e.target.value)} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Defaults to {DEFAULT_W}×{DEFAULT_H} if left blank.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={createBlank} disabled={busy}>
                {busy ? "Creating…" : "Create blank"}
              </Button>
            </div>
          </TabsContent>

          {/* Duplicate */}
          <TabsContent value="duplicate" className="data-[state=inactive]:hidden">
            <div className="space-y-3 px-5 py-5">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Copy from</label>
                <Select value={srcId} onChange={setSrcId} placeholder="Pick a profile" options={[...profiles.map((p) => ({ value: p.id, label: p.name }))]} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">New name</label>
                <Input
                  placeholder="Copy name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createDuplicate()}
                />
              </div>
              <p className="text-xs text-muted-foreground">Copies the layout and canvas size; the original is untouched.</p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={createDuplicate} disabled={busy || !srcId}>
                {busy ? "Duplicating…" : "Duplicate & open"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
