import { useRef, useState } from "react";
import { MonitorSmartphone, Sparkles } from "lucide-react";
import { ScenaMascot } from "../brand.js";
import { Dialog, DialogContent } from "./ui/dialog.js";
import { Button, Input, Switch } from "@4dl/ui";
import { cn } from "@/lib/utils";
import { claimScreen, type ClaimResult } from "../api.js";

const CODE_LEN = 4; // matches the API's minted code length

/** Pair-a-screen modal (§6) — a premium two-pane dialog: a branded stepper on
 *  the left, the code + name form on the right. */
export function PairModal({
  open,
  onClose,
  onPaired,
}: {
  open: boolean;
  onClose: () => void;
  onPaired: (result?: ClaimResult) => void;
}) {
  const [chars, setChars] = useState<string[]>(Array(CODE_LEN).fill(""));
  const [name, setName] = useState("");
  const [sample, setSample] = useState(true);
  const [busy, setBusy] = useState(false);
  const [paired, setPaired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  const code = chars.join("");
  const ready = code.length === CODE_LEN && chars.every(Boolean);

  function reset() {
    setChars(Array(CODE_LEN).fill(""));
    setName("");
    setSample(true);
    setError(null);
    setBusy(false);
    setPaired(false);
  }

  function setChar(i: number, v: string) {
    const ch = v.slice(-1).toUpperCase().replace(/[^0-9A-Z]/g, "");
    setChars((prev) => {
      const next = [...prev];
      next[i] = ch;
      return next;
    });
    if (ch && i < CODE_LEN - 1) boxes.current[i + 1]?.focus();
  }

  function onKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !chars[i] && i > 0) boxes.current[i - 1]?.focus();
    if (e.key === "Enter" && ready) submit();
  }

  function onPaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text").toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, CODE_LEN);
    if (text.length) {
      e.preventDefault();
      setChars(Array.from({ length: CODE_LEN }, (_, i) => text[i] ?? ""));
      boxes.current[Math.min(text.length, CODE_LEN - 1)]?.focus();
    }
  }

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await claimScreen(code, name.trim(), sample);
      // A brief celebratory beat — Scena lights up — before handing back. Pass the
      // claimed screen up so the caller can open its display straight away.
      setBusy(false);
      setPaired(true);
      window.setTimeout(() => { reset(); onPaired(result); }, 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "pairing failed");
      setBusy(false);
    }
  }

  function close() {
    reset();
    onClose();
  }

  const steps = ["Enter the pairing code", "Name the screen", "Screen starts playing"];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-3xl" showCloseButton>
        {paired ? (
          <div className="flex flex-col items-center justify-center gap-2 px-8 py-14 text-center">
            <ScenaMascot mood="happy" size={132} />
            <div className="text-xl font-bold tracking-tight">Paired{name.trim() ? ` · ${name.trim()}` : ""}</div>
            <p className="text-sm text-muted-foreground">The screen is going live now.</p>
          </div>
        ) : (
        <div className="grid md:grid-cols-[280px_1fr]">
          {/* Branded stepper — Scena reacts to the flow: looking for the code,
              thinking while it pairs, sad if it fails. */}
          <div className="hidden flex-col bg-gradient-to-br from-primary to-primary/80 p-7 text-primary-foreground md:flex">
            <ScenaMascot mood={busy ? "thinking" : error ? "sad" : "searching"} tokens={false} size={76} className="mb-3" />
            <div className="text-xs font-semibold uppercase tracking-wider opacity-80">Step 1 of 3</div>
            <div className="mt-2.5 text-2xl font-extrabold leading-tight tracking-tight">Pair a new screen</div>
            <p className="mt-3 text-sm leading-relaxed opacity-85">
              Open the <span className="font-semibold">Scena player</span> in the screen's browser — it shows a {CODE_LEN}-character code. Enter it here.
            </p>
            <div className="mt-auto flex flex-col gap-3 pt-8">
              {steps.map((label, i) => (
                <div key={label} className={cn("flex items-center gap-2.5 text-sm", i === 0 ? "opacity-100" : "opacity-70")}>
                  <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold", i === 0 ? "bg-white text-primary" : "bg-white/20 text-white")}>
                    {i + 1}
                  </span>
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* Form */}
          <div className="flex flex-col p-7">
            <div className="mb-1 flex items-center gap-2">
              <MonitorSmartphone className="size-4 text-primary md:hidden" />
              <h2 className="text-base font-semibold">Enter pairing code</h2>
            </div>
            <p className="mb-5 text-sm text-muted-foreground">Type the {CODE_LEN}-character code shown on the screen.</p>

            <div className="mb-4 flex gap-1.5 sm:gap-2.5">
              {chars.map((ch, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    boxes.current[i] = el;
                  }}
                  value={ch}
                  onChange={(e) => setChar(i, e.target.value)}
                  onKeyDown={(e) => onKey(i, e)}
                  onPaste={onPaste}
                  inputMode="text"
                  maxLength={1}
                  aria-label={`code character ${i + 1}`}
                  className={cn(
                    // Scale to fit the row on any width (min-w-0 + flex-1), capped
                    // at 56px on desktop — so a 6-char code never overflows a phone.
                    "aspect-square min-w-0 max-w-14 flex-1 rounded-xl border-[1.5px] bg-background text-center font-mono text-xl font-semibold uppercase outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/40 sm:text-2xl",
                    ch ? "border-primary" : "border-input",
                  )}
                />
              ))}
            </div>

            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Screen name (e.g. North Lobby)" className="mb-3" />

            {/* One-tap starter scene: the screen shows real, clock-synced content
                the instant it pairs — you replace it whenever you like. */}
            <label className="mb-4 flex cursor-pointer items-center gap-3 rounded-xl border bg-muted/40 px-3.5 py-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4"><Sparkles /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold">Start with sample content</span>
                <span className="block text-xs text-muted-foreground">Light the screen up now — edit or replace it anytime.</span>
              </span>
              <Switch checked={sample} onCheckedChange={setSample} aria-label="Start with sample content" />
            </label>

            {error && <div className="mb-4 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">{error}</div>}

            <div className="mt-auto flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={!ready || busy}>
                {busy ? "Pairing…" : "Continue"}
              </Button>
            </div>
          </div>
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
