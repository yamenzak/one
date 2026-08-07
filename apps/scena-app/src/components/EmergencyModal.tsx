/**
 * Screen-takeover modal (BLUEPRINT §12).
 *
 * A one-click fleet takeover — an emergency *or* an everyday notice ("closed",
 * "back soon", "welcome"). Presets fill the message + tone in one tap; the tone
 * drives the on-screen look. Deliberately behind an explicit confirm step so a
 * mis-click can't blast every screen, and honest about its limit: it only reaches
 * connected screens and is not a life-safety system.
 */

import { useState } from "react";
import { Info } from "lucide-react";
import { Button, cn, Dialog, DialogContent, Input, Label, Textarea } from "@4dl/ui";
import { broadcastEmergency, type ActiveEmergency, type OverrideTone } from "../api.js";
import { TONE_UI, TONE_ORDER, OVERRIDE_PRESETS, type OverridePreset } from "../overrides.js";

export function EmergencyModal({
  open,
  active,
  onClose,
  onBroadcast,
}: {
  open: boolean;
  active: ActiveEmergency | null;
  onClose: () => void;
  onBroadcast: () => void;
}) {
  const [title, setTitle] = useState("Building closed — please exit");
  const [body, setBody] = useState("Follow staff instructions to the nearest exit.");
  const [tone, setTone] = useState<OverrideTone>("alarm");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ui = TONE_UI[tone];

  function close() {
    setConfirming(false);
    setError(null);
    onClose();
  }

  function pickPreset(p: OverridePreset) {
    setTitle(p.title);
    setBody(p.body);
    setTone(p.tone);
    setConfirming(false);
  }

  async function broadcast() {
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await broadcastEmergency(title.trim(), body.trim(), tone);
      setConfirming(false);
      onBroadcast();
    } catch (e) {
      setError(e instanceof Error ? e.message : "broadcast failed");
    } finally {
      setBusy(false);
    }
  }

  const emergency = OVERRIDE_PRESETS.filter((p) => p.category === "emergency");
  const notices = OVERRIDE_PRESETS.filter((p) => p.category === "notice");
  const HeaderIcon = ui.icon;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-xl" dismissible={false}>
        {/* Tone-colored header */}
        {/* design-tokens-exempt: painted with the BROADCAST's own gradient, which is
            content — see `overrides.ts`. White over it is theme-independent for the
            same reason it is on the screen itself. */}
        <div className="flex items-center gap-3.5 px-6 py-5 text-white transition-colors" style={{ background: ui.gradient }}>
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/20">
            <HeaderIcon className="size-5.5" />
          </div>
          <div className="flex-1">
            <div className="text-lg font-extrabold tracking-tight">Screen takeover</div>
            <div className="text-xs opacity-90">Takes over every connected screen until you clear it.</div>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-6">
          {active && (
            <div className="mb-5 rounded-lg border bg-muted/50 px-3.5 py-3 text-sm">
              Active on <b>{active.count}</b> screen{active.count === 1 ? "" : "s"}: “{active.title}”.
            </div>
          )}

          {/* Presets */}
          <Label className="mb-2 block text-micro uppercase text-muted-foreground">Emergency</Label>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {emergency.map((p) => (
              <PresetChip key={p.id} preset={p} active={title === p.title} onClick={() => pickPreset(p)} />
            ))}
          </div>
          <Label className="mb-2 block text-micro uppercase text-muted-foreground">Notices</Label>
          <div className="mb-5 flex flex-wrap gap-1.5">
            {notices.map((p) => (
              <PresetChip key={p.id} preset={p} active={title === p.title} onClick={() => pickPreset(p)} />
            ))}
          </div>

          {/* Message */}
          <Label className="mb-2 block text-micro uppercase text-muted-foreground">Message</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Headline" className="mb-2 font-semibold" />
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Supporting line (optional)" className="mb-4" />

          {/* Tone */}
          <Label className="mb-2 block text-micro uppercase text-muted-foreground">Look</Label>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {TONE_ORDER.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTone(t)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                  tone === t ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                <span aria-hidden className="size-2.5 rounded-full" style={{ background: TONE_UI[t].gradient }} />
                {TONE_UI[t].label}
              </button>
            ))}
          </div>

          {/* Live preview — mirrors the on-screen treatment */}
          <div className="mb-5 overflow-hidden rounded-xl ring-1 ring-border">
            <div className="flex aspect-[16/6] flex-col items-center justify-center gap-1 px-6 text-center text-white" style={{ background: ui.gradient }}>
              <HeaderIcon className="mb-1 size-6 opacity-95" />
              <div className="text-base font-extrabold leading-tight">{title || "Headline"}</div>
              {body && <div className="text-caption font-medium opacity-90">{body}</div>}
            </div>
          </div>

          <div className="mb-5 flex gap-2.5 rounded-lg bg-warning/10 px-3.5 py-3 text-xs text-warning">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>
              Only reaches <b>connected</b> screens. Offline screens keep playing cached content — this is not a substitute for life-safety systems.
            </span>
          </div>

          {error && <div className="mb-3.5 text-sm text-destructive">{error}</div>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            {!confirming ? (
              <Button variant={ui.urgent ? "destructive" : "default"} disabled={!title.trim()} onClick={() => setConfirming(true)}>
                <HeaderIcon className="size-4" /> Broadcast now
              </Button>
            ) : (
              <Button variant={ui.urgent ? "destructive" : "default"} onClick={broadcast} disabled={busy}>
                {busy ? "Broadcasting…" : "Confirm — take over all screens"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PresetChip({ preset, active, onClick }: { preset: OverridePreset; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
      )}
    >
      <span aria-hidden className="size-2 rounded-full" style={{ background: TONE_UI[preset.tone].gradient }} />
      {preset.label}
    </button>
  );
}
