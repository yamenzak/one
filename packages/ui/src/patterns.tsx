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
import { AlertTriangle, CircleAlert, CircleCheck, RefreshCw } from "./lib/icons.js";
import { Button, Callout } from "./primitives.js";
import { Eyebrow } from "./metrics.js";
import { EmptyState } from "./shell.js";
import { cn } from "./lib/utils.js";

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

/** The outcome of the last action in a section — announced, never silent. */
export function ActionResult({ msg, err }: { msg: string | null; err: string | null }) {
  if (err) return <Callout tone="danger" icon={AlertTriangle} live="alert">{err}</Callout>;
  if (msg) return <Callout tone="success" icon={CircleCheck} live="status">{msg}</Callout>;
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
