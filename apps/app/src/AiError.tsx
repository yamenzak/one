/**
 * AiErrorBox — a diagnosable failure panel for AI actions. Shows the real
 * error (provider/parse detail from the server), the raw model output when the
 * server echoed it, and a one-tap "Copy error" so it can be shared verbatim.
 */

import { useState } from "react";
import { Button, cn, CircleAlert, Copy, Check } from "@mossa/ui";
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
      {raw && <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-black/15 p-2 text-xs leading-snug">{raw}</pre>}
      <Button size="sm" variant="secondary" onClick={() => void copy()}>{copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy error"}</Button>
    </div>
  );
}
