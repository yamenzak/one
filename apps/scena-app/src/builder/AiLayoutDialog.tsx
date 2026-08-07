/**
 * AI layout designer (§24) — describe a layout in words and the model composes
 * it out of real widgets. It reads the current canvas (so it can add, improve,
 * resize, and rebalance what's there) or designs from scratch when empty, then
 * hands back a full set of widget nodes that replace the canvas in ONE undo.
 *
 * The heavy lifting (the widget capability spec + brand kit) lives server-side
 * in the `layout` generate task; this dialog just gathers the brief + the
 * current nodes and applies the validated result.
 */
import { useEffect, useState } from "react";
import { Sparkles, Send, Loader2, Wand2, PencilRuler } from "lucide-react";
import { Button, cn, Dialog, DialogContent, Select, Textarea } from "@4dl/ui";
import { aiLayout, listAiModels, type AiModel } from "../api.js";
import type { WNode } from "./types.js";

/** The compact node shape sent to the model (no ids/refs — pure geometry+content). */
function toSpec(n: WNode) {
  return { type: n.type, x: Math.round(n.x), y: Math.round(n.y), w: Math.round(n.w), h: Math.round(n.h), style: n.style, config: n.config };
}

let seq = 0;
/** Hydrate a validated API node into a builder WNode with a fresh unique id. */
function toNode(raw: unknown, i: number): WNode | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.type !== "string") return null;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  seq += 1;
  return {
    id: `${o.type}_${Date.now().toString(36)}${seq}`,
    type: o.type as WNode["type"],
    x: num(o.x, 0),
    y: num(o.y, 0),
    w: num(o.w, 200),
    h: num(o.h, 120),
    rot: num(o.rot, 0),
    z: num(o.z, 10 + i),
    style: o.style && typeof o.style === "object" ? (o.style as Record<string, unknown>) : {},
    config: o.config && typeof o.config === "object" ? (o.config as Record<string, unknown>) : {},
  };
}

const EXAMPLES = [
  "A welcome screen: big headline, a short subtitle, and today's date bottom-left",
  "A café menu board — three columns of items with prices and a title",
  "A lobby dashboard: a live clock, a countdown to our 3pm event, and two KPI stats",
];

export function AiLayoutDialog({
  open,
  nodes,
  designW,
  designH,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  nodes: WNode[];
  designW: number;
  designH: number;
  onOpenChange: (o: boolean) => void;
  onApply: (nodes: WNode[]) => void;
}) {
  const hasCanvas = nodes.length > 0;
  const [prompt, setPrompt] = useState("");
  // "improve" extends the current canvas; "fresh" ignores it and starts over.
  const [mode, setMode] = useState<"improve" | "fresh">(hasCanvas ? "improve" : "fresh");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Model picker — the layout designer runs on any text model (Gemini included).
  const [models, setModels] = useState<AiModel[]>([]);
  const [modelId, setModelId] = useState<string>("");

  useEffect(() => {
    if (open) {
      setPrompt("");
      setError(null);
      setMode(nodes.length > 0 ? "improve" : "fresh");
    }
  }, [open, nodes.length]);
  useEffect(() => {
    listAiModels()
      .then((ms) => setModels(ms.filter((m) => m.task === "text")))
      .catch(() => {});
  }, []);

  async function run() {
    const msg = prompt.trim();
    if (!msg || busy) return;
    setBusy(true);
    setError(null);
    try {
      const send = mode === "improve" && hasCanvas ? nodes.map(toSpec) : [];
      const r = await aiLayout({ prompt: msg, widgets: send, designW, designH, ...(modelId ? { modelId } : {}) });
      if (!r.ok || !Array.isArray(r.widgets) || !r.widgets.length) {
        throw new Error(
          r.detail ||
            (r.error === "insufficient_credits" ? "Not enough credits for this generation." : r.error) ||
            "The model returned no layout — try rephrasing.",
        );
      }
      const out = r.widgets.map(toNode).filter((n): n is WNode => n !== null);
      if (!out.length) throw new Error("The model returned no usable widgets — try again.");
      onApply(out);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!busy) onOpenChange(o);
      }}
    >
      <DialogContent
        title={
          <>
            <Sparkles className="size-4 text-primary" /> Design with AI
          </>
        }
        className="max-w-[min(560px,95vw)]"
      >
        {hasCanvas && (
          <div className="grid grid-cols-2 gap-2">
            <ModeCard
              active={mode === "improve"}
              onClick={() => setMode("improve")}
              icon={<Wand2 />}
              title="Improve current"
              desc="Keep what's here — add, resize and rebalance the layout."
            />
            <ModeCard
              active={mode === "fresh"}
              onClick={() => setMode("fresh")}
              icon={<PencilRuler />}
              title="Start fresh"
              desc="Ignore the canvas and design a new layout from scratch."
            />
          </div>
        )}

        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              run();
            }
          }}
          autoFocus
          placeholder={
            mode === "improve" ? "What should change? e.g. “add a QR to the bottom-right and make the headline bigger”" : "Describe the layout to design…"
          }
          className="min-h-24 resize-none text-body"
        />

        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setPrompt(ex)}
              className="rounded-full border px-2.5 py-1 text-left text-caption text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {ex.length > 46 ? ex.slice(0, 44) + "…" : ex}
            </button>
          ))}
        </div>

        {models.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-caption font-medium text-muted-foreground">Model</span>
            <Select
              value={modelId || "__default"}
              onChange={(v) => setModelId(v === "__default" ? "" : v)}
              className="h-8 flex-1 text-caption"
              options={[{ value: "__default", label: "Default model" }, ...models.map((m) => ({ value: m.id, label: m.label }))]}
            />
          </div>
        )}

        {error && <p className="text-body text-destructive">{error}</p>}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-caption text-muted-foreground">Uses AI credits · follows your brand · one undo reverses it.</p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={run} disabled={busy || !prompt.trim()}>
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Designing…
                </>
              ) : (
                <>
                  <Send className="size-4" /> Generate
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ModeCard({ active, onClick, icon, title, desc }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors",
        active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent",
      )}
    >
      <span className={cn("flex items-center gap-1.5 text-body font-medium", active ? "text-primary" : "")}>
        {icon} {title}
      </span>
      <span className="text-caption leading-snug text-muted-foreground">{desc}</span>
    </button>
  );
}
