/**
 * Console patterns — the shapes a settings surface owes its user.
 *
 * These grew inside the platform admin console, where the rule was: never leave
 * an operator staring at a surface that says nothing. A load that fails says
 * what broke and offers a way out; an action that runs announces its outcome;
 * configuration state is shown rather than implied. They live here, in the
 * design system, because the STUDIO settings owe a studio owner exactly the same
 * treatment — and a copy of a pattern is a pattern that drifts.
 *
 * `useLoad` / `useAction` take an `errorText` formatter as an argument rather
 * than importing one, so the design system keeps no opinion about the app's HTTP
 * error shape.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, CircleAlert, CircleCheck, RefreshCw } from "./lib/icons.js";
import { Button, Callout } from "./primitives.js";
import { Eyebrow } from "./metrics.js";
import { EmptyState } from "./shell.js";
import { cn } from "./lib/utils.js";
import { toast } from "./toast.js";

/** Formats a thrown value into something a person can read. */
export type ErrorFormatter = (e: unknown, fallback: string) => string;

/**
 * Load-once-with-retry. Returns `loading` as "nothing yet and nothing broke",
 * which is the only state a skeleton should show — a failed load must render the
 * error, never an infinite shimmer.
 */
export function useLoad<T>(load: () => Promise<T>, what: string, format: ErrorFormatter) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    setError(null);
    load()
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setError(format(e, `Couldn't load ${what}.`)); });
    return () => { alive = false; };
  }, [load, nonce, what, format]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading: data === null && error === null, reload };
}

/** The load-failure surface every tab owes its user: what broke, what the server
 *  said, and a way out. */
export function LoadError({ what, error, onRetry }: { what: string; error: string; onRetry: () => void }) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title={`Couldn't load ${what}`}
      description={error}
      action={<Button className="min-h-12" onClick={onRetry}><RefreshCw /> Try again</Button>}
    />
  );
}

/** One in-flight key + one result + one error, shared by a group of mutating
 *  controls. `run` cannot leave a rejection unhandled or a button stuck busy. */
export function useAction(format: ErrorFormatter) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = useCallback(
    async (key: string, fn: () => Promise<string | void>, fallback = "That didn't go through — nothing was changed.") => {
      setBusy(key);
      setMsg(null);
      setErr(null);
      try {
        const result = await fn();
        if (typeof result === "string") setMsg(result);
      } catch (e) {
        setErr(format(e, fallback));
      } finally {
        setBusy(null);
      }
    },
    [format],
  );
  const fail = useCallback((text: string) => { setMsg(null); setErr(text); }, []);
  const clear = useCallback(() => { setMsg(null); setErr(null); }, []);
  return { busy, msg, err, run, fail, clear };
}

/**
 * State the SERVER confirms — a control that applies instantly and snaps back if
 * the write is refused.
 *
 * ── Why this is a hook and not a convention ─────────────────────────────────
 *
 * The tempting shape for an instant control (a toggle, a segmented picker, a
 * voice) is: set local state, fire the write, `.catch(() => undefined)`. It
 * feels harmless — nobody is waiting on a spinner, and the failure is "just" a
 * dropped request. It is the worst outcome on a settings screen: the control now
 * shows a value the server does not hold, it survives every re-render, and the
 * next reload silently reverts it. The owner set it, watched it take, and it was
 * never saved.
 *
 * `useAction` cannot fix that on its own, because rolling back needs the value
 * from BEFORE the optimistic apply, and only the state's owner has it. So the
 * hook owns the state:
 *
 *   const cfg = useConfirmedState<Config>({}, errorText)
 *   cfg.commit("tone", (c) => ({ ...c, tone }),
 *              () => api.patch("/api/settings/ai", { tone }),
 *              "Couldn't set the house tone.")
 *
 * `next` applies immediately, `write` confirms it, and a rejection restores the
 * snapshot taken before the apply — so the visible state is only ever a state the
 * server agreed to. `busy` is the in-flight key, exactly like `useAction`, so the
 * control that is settling can say so.
 *
 * `reset` is for the load path: it replaces the value without a write, and
 * without marking anything busy.
 */
export function useConfirmedState<T>(initial: T, format: ErrorFormatter) {
  const [value, setValue] = useState<T>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const commit = useCallback(
    async (
      key: string,
      next: T | ((current: T) => T),
      write: () => Promise<unknown>,
      fallback = "That didn't go through — nothing was changed.",
    ) => {
      // The snapshot has to be taken inside the updater: reading `value` from the
      // closure would capture whatever was current when this callback was built,
      // which is a stale revert target the moment two controls are used in a row.
      let snapshot: T | undefined;
      setValue((current) => {
        snapshot = current;
        return typeof next === "function" ? (next as (c: T) => T)(current) : next;
      });
      setBusy(key);
      setErr(null);
      try {
        await write();
      } catch (e) {
        setErr(format(e, fallback));
        // `snapshot` is assigned synchronously by the updater above in React's
        // current semantics; the guard is here so a future batching change
        // degrades to "no rollback" rather than "revert to undefined".
        if (snapshot !== undefined) setValue(snapshot);
      } finally {
        setBusy(null);
      }
    },
    [format],
  );

  const reset = useCallback((v: T) => { setValue(v); setErr(null); }, []);
  const clear = useCallback(() => setErr(null), []);
  return { value, busy, err, commit, reset, clear, set: setValue };
}

/**
 * The bottom of an editable section: the outcome, then the button.
 *
 * Small, and it exists for one reason — the ORDER and the disabled rule were
 * being re-decided per screen. The result goes ABOVE the button because the
 * button is what the thumb is already on and what the eye returns to; a
 * confirmation rendered below it lands under the keyboard on a phone. And the
 * button is disabled while saving AND while nothing has changed, so "did that
 * save?" is answered by the control itself rather than by pressing it again.
 *
 * `dirty` defaults to `true` for sections that do not track it — an always-on
 * Save is the old behaviour, so adopting the bar is never a regression.
 */
export function SaveBar({ label, saving, dirty = true, disabled, onSave, msg, err, className }: {
  label: string;
  saving: boolean;
  dirty?: boolean;
  /** An additional reason the section cannot be saved — a failed validation. */
  disabled?: boolean;
  onSave: () => void;
  msg?: string | null;
  err?: string | null;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      <ActionResult msg={msg ?? null} err={err ?? null} />
      <Button size="lg" className="w-full" disabled={saving || disabled || !dirty} onClick={onSave}>
        {saving ? "Saving…" : label}
      </Button>
    </div>
  );
}

/**
 * The outcome of the last action — ANNOUNCED, never placed.
 *
 * Both halves go to the toaster, and the component renders nothing. That looks
 * strange and it is the point: every call site in the product already hands its
 * result to this component, so routing from HERE converts all of them at once,
 * including the ones holding their own `err`/`msg` state rather than a
 * `useAction`. A change inside the hook would have missed those, and the ones it
 * missed would have gone silent.
 *
 * ── Why inline is the wrong place, for failures AND confirmations ───────────
 *
 * The old rule was "a write that fails says so, in the place it failed", which
 * is right about NOT BEING SILENT and wrong about the place. Inline text is
 * wherever the section happens to be: on a long settings page, in a sheet
 * scrolled to its footer, on a row three screens down — i.e. frequently
 * off-screen at the moment it appears. The reader sees no change and no message,
 * which is indistinguishable from the write having worked. It also pushes the
 * layout down under the thumb, moving the button they were about to press again.
 *
 * A toast appears in the same place every time, cannot be scrolled away from,
 * interrupts a screen reader when it is a failure, and moves nothing.
 */
export function ActionResult({ msg, err }: { msg: string | null; err: string | null }) {
  useEffect(() => {
    if (err) toast.error(err);
  }, [err]);
  useEffect(() => {
    if (msg) toast.success(msg);
  }, [msg]);
  return null;
}

/** A configuration checklist row: state is shown, not implied. */
export function ConfigRow({ label, ok, detail, okLabel = "Set", missingLabel = "Not set" }: {
  label: string; ok: boolean; detail?: ReactNode; okLabel?: string; missingLabel?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      {ok
        ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        : <CircleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {detail && <div className="text-xs leading-snug text-muted-foreground">{detail}</div>}
      </div>
      <span className={cn("shrink-0 text-xs font-semibold", ok ? "text-success" : "text-muted-foreground")}>{ok ? okLabel : missingLabel}</span>
    </div>
  );
}

/** A tab's one-line "what this is for". */
export function TabIntro({ children }: { children: ReactNode }) {
  return <p className="px-1 text-xs leading-relaxed text-muted-foreground">{children}</p>;
}

/** A labelled group inside a card: eyebrow + optional explanation + content. */
export function FieldGroup({ title, hint, children, className }: {
  title: string; hint?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={cn("space-y-2.5", className)}>
      <Eyebrow className="px-0">{title}</Eyebrow>
      {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      {children}
    </section>
  );
}

/**
 * THE COMMITTING BAR — a workspace's verbs, pinned where the thumb is.
 *
 * A screen that EDITS something (as opposed to one that navigates or reads) owes
 * its user two things a scrolling page cannot give: the commit action always
 * reachable, and the reason it is unavailable stated next to it rather than
 * inferred from a greyed-out button. Both builders had hand-rolled this — the
 * same fixed/blur/border/`md:pl-24` incantation, twice, with the read-only
 * notice and the error line copy-pasted around it.
 *
 * `md:pl-24` is the part nobody remembers: on desktop the nav RAIL occupies the
 * left edge, and a bar spanning the true viewport slides underneath it.
 *
 * `notice` is above the buttons on purpose. It carries the sentence that
 * explains a disabled state, and a sentence UNDER the control it explains is a
 * sentence read after the tap that failed.
 */
export function ActionBar({ notice, error, children, className }: {
  notice?: ReactNode;
  /** The last failure, announced in place. Bars sit over content; a toast here
   *  scrolls away from the button that caused it. */
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("fixed inset-x-0 bottom-0 z-30 border-t border-border/40 bg-background/90 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl md:pl-24", className)}>
      <div className="column space-y-2">
        {notice}
        {error && <p className="px-1 text-xs text-warning" role="alert">{error}</p>}
        <div className="flex gap-3">{children}</div>
      </div>
    </div>
  );
}

/**
 * A ROW THAT RUNS OFF THE EDGE — the horizontal scroller, with the four details
 * that were being retyped twelve times and getting one of them wrong.
 *
 *   BLEED.      The row scrolls edge-to-edge and its content starts at the
 *               column's inset. Without the negative margin the first item is
 *               inset and the last one stops short, so the row reads as clipped
 *               rather than as continuing.
 *   NO BAR.     A visible scrollbar under a chip row is desktop chrome on a
 *               surface designed for a thumb.
 *   SNAP.       Card-sized items snap; chip-sized items must not — snapping a
 *               28px chip fights every flick.
 *   SHRINK-0.   Flex children default to shrinking, so a long chip label
 *               silently compresses its neighbours instead of scrolling. Each
 *               item is wrapped rather than relying on every call site.
 *
 * It does NOT own selection, spacing semantics or item shape: a rail of chips,
 * a rail of cover cards and a rail of avatars are the same scroller.
 */
export function Rail({ children, snap = false, bleed = "column", gap = "sm", className }: {
  children: ReactNode;
  /** Snap items to the leading edge. For CARD-sized items only. */
  snap?: boolean;
  /** How far the row bleeds past its container: the page column's `px-4`
   *  (`column`), a card's `px-1` (`tight`), or not at all (`none`). */
  bleed?: "column" | "tight" | "none";
  gap?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "no-scrollbar flex overflow-x-auto overscroll-x-contain",
        gap === "md" ? "gap-3" : "gap-1.5",
        bleed === "column" ? "-mx-4 px-4" : bleed === "tight" ? "-mx-1 px-1" : "",
        // SCROLL padding, not just padding. `snap-mandatory` aligns a
        // `snap-start` item to the SNAPPORT, which defaults to the padding box —
        // so at rest the container scrolls by exactly the inset above and the
        // first item sits flush against the screen edge with its corner clipped.
        // `scroll-p*` moves the snapport in to match.
        snap && (bleed === "column" ? "scroll-pl-4" : bleed === "tight" ? "scroll-pl-1" : ""),
        // The padding keeps a focus ring and a selected item's shadow from being
        // clipped by the scroll box — an outline drawn outside the content box is
        // still inside the OVERFLOW box, and `overflow-x-auto` cuts it.
        "pb-1",
        snap && "snap-x snap-mandatory",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** One item in a `Rail` — never shrinks, snaps when the rail does. */
export function RailItem({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("shrink-0 snap-start", className)}>{children}</div>;
}

/**
 * MORE, ON REQUEST — the detail under a summary.
 *
 * A workspace screen keeps acquiring read-outs: a plan's muscle balance, a
 * day's calorie spread, a report's per-item breakdown. Each is genuinely useful
 * and none of them is the WORK, so they accumulate above the work and push it
 * off the screen. The plan builder's health card was ~380px of chart before the
 * day picker — a check the coach runs occasionally, permanently occupying the
 * space they edit in.
 *
 * The summary stays; the breakdown folds. Two rules make it honest:
 *
 *   AN ALARM NEVER FOLDS.       Whatever is wrong stays visible next to the
 *                               summary. A warning behind a chevron is a warning
 *                               nobody reads.
 *   THE TRIGGER SAYS WHAT IS IN IT. "Weekly sets by muscle", not "Details" —
 *                               a chevron labelled "more" is a coin toss.
 */
export function Disclosure({ label, children, defaultOpen = false, className }: {
  label: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn("space-y-2", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-1 text-micro uppercase text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="min-w-0 flex-1 text-left">{label}</span>
        <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && children}
    </div>
  );
}

/**
 * ONE THING AT A TIME — the section you are working on, open; the rest, listed.
 *
 * `Disclosure` folds a read-out under a quiet label. This folds CONTENT, and it
 * is a different job: the summary row has to be worth reading on its own,
 * because in a list of ten collapsed sections the summaries ARE the screen.
 * A meal option collapses to its name, its calories and its macros; a workout
 * block to its exercise, its set count and how it is performed. Nothing is
 * hidden that you needed in order to choose.
 *
 * It is CONTROLLED. An accordion where every section owns its own open state
 * ends up with six open at once, which is the layout it was meant to replace —
 * so the parent holds "which one" and passes it down. That also makes "open the
 * one I just added" a one-line consequence rather than a ref and an effect.
 */
export function Collapsible({ open, onToggle, summary, children, tone = "card", className }: {
  open: boolean;
  onToggle: () => void;
  /** The collapsed row. Must stand alone — see above. */
  summary: ReactNode;
  children: ReactNode;
  /** `card` sits on the page; `inset` sits inside one. */
  tone?: "card" | "inset";
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-2xl", tone === "card" ? "bg-card" : "bg-surface-2", className)}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3.5 py-3 text-left transition-colors hover:bg-surface-2/60"
      >
        <span className="min-w-0 flex-1">{summary}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-t border-border/50 px-3.5 pb-3.5 pt-3">{children}</div>}
    </div>
  );
}

/**
 * "Which one is open" for a list of `Collapsible`s, including the two rules
 * every hand-rolled version gets wrong:
 *
 *   TOGGLING THE OPEN ONE CLOSES IT.  Not "does nothing" — a section you have
 *                                     finished with should collapse.
 *   A NEW ITEM OPENS ITSELF.          `focus(key)` is what an "Add" handler
 *                                     calls, so the thing just created is the
 *                                     thing on screen.
 */
export function useOneOpen<K>(initial: K | null = null) {
  const [openKey, setOpenKey] = useState<K | null>(initial);
  return {
    openKey,
    isOpen: (k: K) => openKey === k,
    toggle: (k: K) => setOpenKey((cur) => (cur === k ? null : k)),
    focus: (k: K | null) => setOpenKey(k),
  };
}
