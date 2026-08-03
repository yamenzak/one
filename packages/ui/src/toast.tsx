/**
 * TOASTS — where a failure goes.
 *
 * The rule this implements (UI-LANGUAGE §7): **an error is announced, never
 * placed.** It used to be placed, and the reasoning was good — "a write that
 * fails says so, in the place it failed" — but placing it has a failure mode
 * that inline text cannot escape:
 *
 *   the message is BELOW THE FOLD.  A long settings page, a sheet scrolled to
 *   its footer, a row three screens down. The save is refused, a red line
 *   appears somewhere the reader is not looking, and the outcome is
 *   indistinguishable from the save having worked.
 *
 * A toast cannot be scrolled away from. It appears in the same place every time,
 * it is `role="alert"` so a screen reader is interrupted by it, and it does not
 * shift the layout underneath the thumb — which the inline variant did, every
 * time, moving the button the reader was about to press again.
 *
 * CONFIRMATIONS come here too. One place for "what just happened" is the whole
 * value: a reader who has learned where the answer appears does not have to
 * hunt for it, and does not have to learn a second convention for the good news.
 * They differ only in dwell and in urgency — a success is polite and short, a
 * failure is assertive and long, because the reader has to act on it.
 *
 * ── Why a module-level store and not context ────────────────────────────────
 *
 * `toast.error(…)` has to be callable from a `catch` block, an event handler, a
 * fetch wrapper — places with no hook and no component. A tiny subscriber list
 * costs nothing and makes the call site one line anywhere. `<Toaster/>` is
 * mounted once, at the app root.
 */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, CircleCheck, Info, X } from "./lib/icons.js";
import { DUR, EASE_OUT } from "./lib/animation.js";
import { cn } from "./lib/utils.js";

export type ToastTone = "danger" | "success" | "info";

export interface ToastItem {
  id: number;
  tone: ToastTone;
  text: string;
  /** ms before it leaves on its own. A failure stays longer, because the reader
   *  has to act on it; `0` means it stays until dismissed. */
  ttl: number;
}

type Listener = (items: ToastItem[]) => void;

let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) l(items);
}

function push(tone: ToastTone, text: string, ttl: number): number {
  const clean = text.trim();
  if (!clean) return -1;
  /*
   * Collapse a repeat.
   *
   * The same failure fires from a retried save, from three rows saving at once,
   * from a component that re-runs on focus. Stacking identical messages turns
   * one problem into a wall and buries whatever else was on screen — so an
   * identical message that is still showing is refreshed rather than added.
   */
  const dup = items.find((t) => t.text === clean && t.tone === tone);
  if (dup) {
    items = [...items.filter((t) => t.id !== dup.id), { ...dup, id: ++seq }];
    emit();
    return seq;
  }
  const item: ToastItem = { id: ++seq, tone, text: clean, ttl };
  // Three at once is already too many to read. The oldest goes.
  items = [...items, item].slice(-3);
  emit();
  return item.id;
}

export function dismissToast(id: number): void {
  items = items.filter((t) => t.id !== id);
  emit();
}

/**
 * Announce something.
 *
 * `toast.error` is the one that matters and the one with the long dwell: eight
 * seconds, because the reader has to read it, understand what did not happen,
 * and decide what to do — and a message that has already gone is the same as no
 * message at all.
 */
export const toast = {
  error: (text: string): number => push("danger", text, 8000),
  success: (text: string): number => push("success", text, 3500),
  info: (text: string): number => push("info", text, 5000),
};

const ICONS = { danger: AlertTriangle, success: CircleCheck, info: Info } as const;
const TONE_CLASS = {
  danger: "text-danger",
  success: "text-success",
  info: "text-primary",
} as const;

/**
 * The surface. Mount ONCE, at the app root, outside every router and every
 * screen transition — a toast that unmounts with the screen that caused it is
 * the bug this replaces.
 */
export function Toaster({ className }: { className?: string }) {
  const [list, setList] = useState<ToastItem[]>(items);
  useEffect(() => {
    listeners.add(setList);
    setList(items);
    return () => void listeners.delete(setList);
  }, []);

  return (
    <div
      className={cn(
        // Top-centre, above everything, and pointer-transparent except on the
        // toasts themselves — a full-width catcher over the app would eat the
        // first tap after any failure.
        "pointer-events-none fixed inset-x-0 top-3 z-[90] flex flex-col items-center gap-2 px-4",
        className,
      )}
    >
      <AnimatePresence initial={false}>
        {list.map((t) => (
          <Toast key={t.id} item={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function Toast({ item }: { item: ToastItem }) {
  const Icon = ICONS[item.tone];
  useEffect(() => {
    if (!item.ttl) return;
    const timer = setTimeout(() => dismissToast(item.id), item.ttl);
    return () => clearTimeout(timer);
  }, [item.id, item.ttl]);

  return (
    <motion.div
      // Settles DOWN into place (§8): it arrives by coming to rest, not by
      // sliding in from off-screen, which reads as an interruption rather than
      // as an answer to what the reader just did.
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: DUR.base, ease: EASE_OUT }}
      role={item.tone === "danger" ? "alert" : "status"}
      aria-live={item.tone === "danger" ? "assertive" : "polite"}
      className="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-2xl bg-card/95 py-2.5 pl-3.5 pr-2 text-sm shadow-lg backdrop-blur"
    >
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", TONE_CLASS[item.tone])} />
      <span className="min-w-0 flex-1 text-pretty">{item.text}</span>
      <button
        onClick={() => dismissToast(item.id)}
        aria-label="Dismiss"
        className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground outline-none ring-ring transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 [&_svg]:size-3.5"
      >
        <X />
      </button>
    </motion.div>
  );
}
