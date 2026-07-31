/**
 * AiErrorBox — a diagnosable failure panel for AI actions. Shows the real
 * error (provider/parse detail from the server), the raw model output when the
 * server echoed it, and a one-tap "Copy error" so it can be shared verbatim.
 *
 * MockedNotice — the counterpart for a *successful* response that came off the
 * deterministic mock lane (`{ mocked: true }`).
 */

import { useState } from "react";
import { Button, cn, CircleAlert, Copy, Check } from "@4dl/ui";
import { ApiError } from "./api.js";

export function aiErrorText(error: unknown): { message: string; raw: string | null; status: number | null } {
  const message = error instanceof Error ? error.message : String(error);
  const raw = error instanceof ApiError ? error.raw : null;
  const status = error instanceof ApiError ? error.status : null;
  return { message, raw, status };
}

export function AiErrorBox({ error, className }: { error: unknown; className?: string }) {
  const [copied, setCopied] = useState(false);
  const { message, raw, status } = aiErrorText(error);
  const full = [status ? `HTTP ${status}` : null, message, raw ? `\n--- model output ---\n${raw}` : null].filter(Boolean).join("\n");
  const copy = async () => { try { await navigator.clipboard.writeText(full); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable */ } };
  return (
    <div className={cn("space-y-2 rounded-2xl bg-danger-soft p-3 text-danger", className)}>
      <div className="flex items-start gap-2 text-sm font-medium [&_svg]:size-4">
        <CircleAlert className="mt-0.5 shrink-0" />
        <span className="min-w-0 flex-1 break-words">{message}</span>
      </div>
      {raw && <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-foreground/10 p-2 text-xs leading-snug">{raw}</pre>}
      <Button size="sm" variant="secondary" onClick={() => void copy()}>{copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy error"}</Button>
    </div>
  );
}

/**
 * MockedNotice — shown whenever an AI response carries `mocked: true`.
 *
 * Every AI route already returns that flag and, until now, nothing in the app
 * rendered it: simulated output arrived looking exactly like a real model
 * answer, pre-filled an editable review surface, and got saved. This is the
 * missing consumer. Deliberately NOT dismissable and NOT collapsible — the
 * whole point is that it stays visible for as long as the fabricated values are
 * on screen. `warning` tone from the design system, `role="status"` so it is
 * announced (KOVA.md Part II §2.2).
 *
 * Renders nothing when `mocked` is false/undefined, so call sites can drop it in
 * unconditionally.
 */
export function MockedNotice({ mocked, what, className }: { mocked: boolean | null | undefined; what?: string; className?: string }) {
  if (!mocked) return null;
  return (
    <div role="status" aria-live="polite" className={cn("flex items-start gap-2 rounded-2xl bg-warning-soft p-3 text-sm font-medium text-warning [&_svg]:size-4", className)}>
      <CircleAlert className="mt-0.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 break-words">
        Simulated output — not real data.
        {what ? ` ${what} came from the AI mock lane, not a model.` : " This came from the AI mock lane, not a model."} Don't save it as a real result.
      </span>
    </div>
  );
}
