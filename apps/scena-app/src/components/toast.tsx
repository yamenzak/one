/**
 * Toasts — a tiny, dependency-free notification system. `toast.success(msg)` /
 * `toast.error(msg)` from anywhere; a single <Toaster/> near the app root renders
 * them. Replaces blocking `alert()` calls with quiet, premium, auto-dismissing
 * feedback (bottom-right, stacked, animated in/out).
 */
import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

let seq = 0;
const listeners = new Set<(t: Toast[]) => void>();
let toasts: Toast[] = [];

function emit() {
  for (const l of listeners) l(toasts);
}
function push(kind: ToastKind, message: string) {
  const id = ++seq;
  toasts = [...toasts, { id, kind, message }];
  emit();
  setTimeout(() => dismiss(id), 4200);
}
function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  success: (m: string) => push("success", m),
  error: (m: string) => push("error", m),
  info: (m: string) => push("info", m),
};

const ICON = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
} as const;

const TONE = {
  success: "text-success",
  error: "text-destructive",
  info: "text-primary",
} as const;

export function Toaster() {
  const [items, setItems] = useState<Toast[]>(toasts);
  useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
      {items.map((t) => {
        const Icon = ICON[t.kind];
        return (
          <div
            key={t.id}
            role="status"
            className="animate-rise pointer-events-auto flex items-start gap-3 rounded-xl border bg-popover/95 p-3.5 pr-2.5 text-popover-foreground shadow-lg backdrop-blur"
          >
            <Icon className={cn("mt-0.5 size-4.5 shrink-0", TONE[t.kind])} />
            <span className="flex-1 text-sm leading-snug">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
