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
