/**
 * HTML slide editor (§15) — edit a sandboxed HTML slide by hand or by chatting
 * with the AI, with a live preview alongside. The AI shares the current markup
 * + the tenant's brand kit (server-side, via the generate system prompt), so
 * "make it match our brand" just works. Output is saved back to the slide body.
 */
import { useEffect, useRef, useState } from "react";
import { Code2, Sparkles, Send, Eye } from "lucide-react";
import { Button, Dialog, DialogContent, DialogFooter, Select, Textarea, toast } from "@4dl/ui";
import { slideDocument } from "@scena/manifest";
import { aiGenerate, listAiModels, type AiModel } from "../api.js";

type Msg = { role: "user" | "assistant"; text: string };

/** Wrap a slide for preview exactly as the player does (bundled fonts + reset),
 *  so what you see here is what renders on screen. */
export function previewDoc(html: string): string {
  return slideDocument(html);
}

/** Render an HTML slide fragment true-to-scale: a fixed 1920×1080 iframe scaled
 *  down to fit the container, exactly like the player scales the design space.
 *
 *  Performance: a grid of HTML slides was mounting one *live, script-running*
 *  sandbox per card, which bogs the whole page down. So a thumbnail now renders a
 *  **static snapshot** — the iframe drops `allow-scripts`, so it paints the slide's
 *  markup + CSS (the still you'd screenshot) without ever running its JS — and it
 *  is **mounted lazily**, only once the card scrolls into view. Pass `interactive`
 *  for the few places that need the live slide (the editor + device preview): that
 *  restores `allow-scripts` and pointer input. */
export function HtmlThumb({ html, className, interactive, designW = 1920, designH = 1080 }: { html: string; className?: string; interactive?: boolean; designW?: number; designH?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  // Lazy mount: the live/interactive frame always mounts; a static thumbnail waits
  // until it's on-screen so an off-screen grid costs nothing.
  const [visible, setVisible] = useState(!!interactive);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setScale(el.clientWidth / designW);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [designW]);
  useEffect(() => {
    if (visible || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);
  return (
    <div ref={ref} className={`relative overflow-hidden bg-black ${className ?? ""}`} style={{ aspectRatio: `${designW} / ${designH}` }}>
      {visible && (
        <iframe
          title="HTML preview"
          // A static thumbnail runs no scripts (snapshot-like still); interactive
          // previews keep allow-scripts so animations/interactions run.
          sandbox={interactive ? "allow-scripts" : undefined}
          srcDoc={previewDoc(html)}
          loading="lazy"
          style={{ width: designW, height: designH, border: 0, position: "absolute", top: 0, left: 0, transformOrigin: "top left", transform: `scale(${scale})`, pointerEvents: interactive ? "auto" : "none" }}
        />
      )}
    </div>
  );
}

export function HtmlEditorDialog({ open, initialHtml, title, mode = "edit", surface = "slide", width, height, onOpenChange, onSave }: {
  open: boolean;
  initialHtml: string;
  title?: string;
  /** "new" → the AI designs from scratch; "edit" → it modifies the current slide. */
  mode?: "new" | "edit";
  /** What the markup is for: a full-screen "slide" (default) or a "widget" that
   *  fills its own box on the canvas — the AI designs very differently for each. */
  surface?: "slide" | "widget";
  /** For a widget, its box size in design px, so the AI designs to fit it. */
  width?: number;
  height?: number;
  onOpenChange: (o: boolean) => void;
  onSave: (html: string) => Promise<void>;
}) {
  const noun = surface === "widget" ? "widget" : "slide";
  const [html, setHtml] = useState(initialHtml);
  // On desktop the preview sits alongside; on mobile it's a third tab (there's
  // no room for a side-by-side pane), so it's always reachable.
  const [tab, setTab] = useState<"code" | "chat" | "preview">("code");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  // Until the AI has produced a slide once, a "new" editor is still creating —
  // so the model designs from scratch instead of tweaking the placeholder.
  const [generated, setGenerated] = useState(false);
  const [models, setModels] = useState<AiModel[]>([]);
  const [modelId, setModelId] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const creating = mode === "new" && !generated;

  useEffect(() => { if (open) { setHtml(initialHtml); setMessages([]); setInput(""); setTab(mode === "new" ? "chat" : "code"); setGenerated(false); } }, [open, initialHtml, mode]);
  useEffect(() => { listAiModels().then((ms) => setModels(ms.filter((m) => m.task === "text"))).catch(() => {}); }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages, aiBusy]);

  async function sendChat() {
    const msg = input.trim();
    if (!msg || aiBusy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: msg }]);
    setAiBusy(true);
    try {
      const prompt = creating
        ? `Create a brand-new, complete digital-signage ${noun} designed from scratch for this brief:\n\n"${msg}"\n\nThis is a NEW ${noun} — ignore any placeholder/boilerplate markup. Return only the ${noun} HTML.`
        : `You are editing an EXISTING digital-signage ${noun}. Here is its current HTML:\n\`\`\`html\n${html || `<!-- empty ${noun} -->`}\n\`\`\`\n\nApply this change: ${msg}\n\nKeep everything else intact. Return the COMPLETE updated ${noun} as HTML only — no explanation, no markdown fences.`;
      const r = await aiGenerate({ task: "text", prompt, options: { surface, ...(width ? { width } : {}), ...(height ? { height } : {}) }, ...(modelId ? { modelId } : {}) });
      if (!r.ok || !r.html) throw new Error(r.detail || r.error || (r.ok ? `The model returned an empty ${noun} — try a different model.` : "Generation failed"));
      setHtml(r.html);
      setGenerated(true);
      setMessages((m) => [...m, { role: "assistant", text: creating ? `Created your ${noun} — check the preview. Ask for any tweaks.` : `Done — updated the ${noun}. Check the preview.` }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: `Couldn't do that — ${e instanceof Error ? e.message : "failed"}.` }]);
    } finally {
      setAiBusy(false);
    }
  }

  async function save() {
    setSaving(true);
    try { await onSave(html); onOpenChange(false); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); }
    finally { setSaving(false); }
  }

  // For a widget, preview at its real box aspect; slides preview at 1920×1080.
  const pw = surface === "widget" && width ? width : 1920;
  const ph = surface === "widget" && height ? height : 1080;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title ?? (surface === "widget" ? "Edit HTML widget" : "Edit HTML slide")} className="max-w-[min(1100px,95vw)] sm:max-w-[min(1100px,95vw)]">

        <div className="grid gap-4 md:grid-cols-2">
          {/* Left — code / AI chat (+ preview tab on mobile) */}
          <div className="flex h-[58vh] flex-col overflow-hidden rounded-lg border md:h-[60vh]">
            <div className="flex items-center gap-1 border-b p-1.5">
              <button type="button" onClick={() => setTab("code")} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-caption font-medium ${tab === "code" ? "bg-muted" : "text-muted-foreground hover:bg-muted/60"}`}><Code2 className="size-3.5" /> Code</button>
              <button type="button" onClick={() => setTab("chat")} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-caption font-medium ${tab === "chat" ? "bg-muted" : "text-muted-foreground hover:bg-muted/60"}`}><Sparkles className="size-3.5" /> AI chat</button>
              <button type="button" onClick={() => setTab("preview")} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-caption font-medium md:hidden ${tab === "preview" ? "bg-muted" : "text-muted-foreground hover:bg-muted/60"}`}><Eye className="size-3.5" /> Preview</button>
            </div>

            {tab === "preview" ? (
              <div className="flex flex-1 items-center justify-center overflow-hidden bg-black p-3">
                <HtmlThumb html={html} interactive designW={pw} designH={ph} className="w-full rounded-md shadow-lg ring-1 ring-white/10" />
              </div>
            ) : tab === "code" ? (
              <Textarea value={html} onChange={(e) => setHtml(e.target.value)} spellCheck={false}
                placeholder={`<div style='width:100%;height:100%;...'>Your ${noun}</div>`}
                className="flex-1 resize-none rounded-none border-0 font-mono text-caption leading-relaxed focus-visible:ring-0" />
            ) : (
              <div className="flex flex-1 flex-col overflow-hidden">
                {models.length > 0 && (
                  <div className="border-b p-2">
                    <Select value={modelId || "__default"} onChange={(v) => setModelId(v === "__default" ? "" : v)} className="h-8 text-caption" options={[
                      { value: "__default", label: "Default model" },
                      ...models.map((m) => ({ value: m.id, label: m.label })),
                    ]} />
                  </div>
                )}
                <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
                  {messages.length === 0 && (
                    <div className="rounded-lg bg-muted/50 p-3 text-caption text-muted-foreground">
                      {surface === "widget"
                        ? (creating
                          ? "Describe the widget to create — e.g. “a glassy stat card showing today's footfall with a big number and a label”. The AI designs it to fit this widget's box using your brand kit, then you can ask for tweaks."
                          : "Ask the AI to change this widget — “make the number bigger”, “use our brand colors”, “add a subtle pulse”. It sees the current HTML and your brand kit.")
                        : (creating
                          ? "Describe the slide to create — e.g. “a bold summer promo: 20% off at our dental clinic, warm sunny palette”. The AI designs it from scratch using your brand kit, then you can ask for tweaks."
                          : "Ask the AI to change this slide — “make the headline bigger”, “use our brand colors”, “add a QR placeholder bottom-right”. It sees the current HTML and your brand kit.")}
                    </div>
                  )}
                  {messages.map((m, i) => (
                    <div key={i} className={`max-w-[85%] rounded-lg px-3 py-2 text-caption ${m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted"}`}>{m.text}</div>
                  ))}
                  {aiBusy && <div className="w-fit rounded-lg bg-muted px-3 py-2 text-caption text-muted-foreground">Thinking…</div>}
                </div>
                <div className="flex items-end gap-2 border-t p-2">
                  <Textarea value={input} onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                    placeholder={creating ? `Describe the ${noun} to create…` : "Describe a change…"} className="max-h-24 min-h-9 flex-1 resize-none text-caption" />
                  <Button size="icon" className="size-9 shrink-0" aria-label="Send" disabled={aiBusy || !input.trim()} onClick={sendChat}><Send className="size-4" /></Button>
                </div>
              </div>
            )}
          </div>

          {/* Right — live preview (desktop; on mobile it's the Preview tab) */}
          <div className="hidden h-[60vh] flex-col overflow-hidden rounded-lg border md:flex">
            <div className="flex items-center gap-1.5 border-b px-3 py-2 text-caption text-muted-foreground"><Eye className="size-3.5" /> Live preview{surface === "widget" && width && height ? <span className="ml-auto font-mono">{width}×{height}</span> : null}</div>
            <div className="flex flex-1 items-center justify-center bg-black p-3">
              <HtmlThumb html={html} interactive designW={pw} designH={ph} className="w-full rounded-md shadow-lg ring-1 ring-white/10" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : `Save ${noun}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
