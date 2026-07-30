/**
 * App-level notices — the four things the user must be told about but that no
 * single screen owns: we lost the network, this studio is paused, a new build is
 * waiting, and something failed with nobody catching it.
 */

import { useEffect, useState } from "react";
import { CloudOff, Lock, RefreshCw, WifiOff, X, cn } from "@4dl/ui";
import { DUNNING_DAYS } from "@4dl/platform";
import { useSession } from "./session.js";

/**
 * The studio is read-only, said out loud.
 *
 * A suspended or closing studio refuses every write at the edge (route-guard's
 * host gate). Without this the app looks completely normal and each save fails
 * one at a time with a 402 — the user's model becomes "the app is broken", which
 * is both wrong and the version they will repeat to their coach. Naming the state
 * once, up front, is the difference between a lock and a fault.
 *
 * Deliberately not dismissible: it is not a notification, it is the current state
 * of the whole surface, and it stops being true only when the studio renews.
 */
export function StudioPausedBanner() {
  const { host, ctx } = useSession();
  const reason = host?.gate?.reason;
  if (!host?.gate?.readOnly) return null;
  const closing = reason === "closing";
  // The OWNER gets the next rung's deadline. Every step of the platform ladder is
  // announced before it lands — a single cliff is how you lose a customer who was
  // on holiday — and read-only is the rung where saying so still changes the
  // outcome. Clients are not told a date they cannot act on.
  const owner = ctx?.active?.role === "owner";
  return (
    /* The STRIP is full-bleed — it describes the whole surface, so a floating
       card would understate it — but its TEXT sits in the content column. A
       single line running the full width of a desktop window is a ~180-character
       measure; §5 caps prose at ~68. */
    <div
      role="status"
      className="border-b border-warning/25 bg-warning/12 px-4 py-2.5 text-xs leading-relaxed text-warning"
    >
      <div className="column flex items-start gap-2">
      <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>
        <span className="font-semibold">{closing ? "This studio is closing." : "This studio is paused."}</span>{" "}
        {closing
          ? "Everything is readable, but nothing new can be saved. The owner can still cancel the closure from Billing."
          : "Everything is readable, but nothing new can be saved until the studio renews."}
        {!closing && owner && (
          <>
            {" "}
            <span className="font-semibold">
              Access is withheld for everyone {DUNNING_DAYS.blocked} days after the missed payment, and the studio is deleted at {DUNNING_DAYS.purge}.
            </span>
          </>
        )}
      </span>
      </div>
    </div>
  );
}

/**
 * Persistent app-bar indicator. Before this the app had no `navigator.onLine`
 * awareness at all, so an offline log read as a silent no-op: nothing confirmed,
 * nothing explained. The pill is the standing answer to "did that save?" —
 * writes on the queued log paths are safe, everything else will need a retry.
 */
export function OfflinePill() {
  const { online, degraded } = useSession();
  if (online && !degraded) return null;
  const label = online
    ? "Showing your last synced data — reconnecting"
    : "You're offline. Logs are saved on your phone and sync when you're back.";
  return (
    <span
      role="status"
      title={label}
      aria-label={label}
      className={cn(
        // h-9 to match every other control on the app bar (its only caller) —
        // the whole trailing row is size-9, and h-8 left this one pill short.
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold",
        "bg-warning/15 text-warning [&_svg]:size-3.5",
      )}
    >
      {online ? <CloudOff /> : <WifiOff />}
      <span className="hidden sm:inline">{online ? "Stale" : "Offline"}</span>
    </span>
  );
}

/**
 * "Saved — will sync" affordance. Screens render this after a write threw a
 * QueuedError: the write is durably parked in the service worker's Background
 * Sync queue and will land on reconnect, so it must read as reassurance, not
 * as the failure the raw `TypeError: Failed to fetch` used to look like.
 */
export function QueuedNotice({ text, className }: { text?: string; className?: string }) {
  return (
    <p role="status" className={cn("flex items-center gap-1.5 text-sm text-muted-foreground [&_svg]:size-4", className)}>
      <CloudOff /> {text ?? "Saved on your phone — it'll sync when you're back online."}
    </p>
  );
}

/** How often to ask the server whether a newer worker exists. */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

/**
 * Registers the service worker and prompts when a new build is WAITING.
 *
 * The SW no longer calls skipWaiting (see vite.config.ts): activating a new
 * worker inside a live tab purged the old precache, so a client mid-workout 404'd
 * on the next lazy chunk import and fell into the ErrorBoundary — losing the
 * session they were logging. The new build now parks in `waiting` and this is how
 * the user learns it's there; reloading is their choice, at a moment that isn't
 * mid-set.
 *
 * Registered by hand rather than through the plugin's injected `registerSW.js`
 * (which only registers and can't tell anyone) or `virtual:pwa-register` (which
 * would pull in workbox-window). The generated worker already carries the
 * `SKIP_WAITING` message listener workbox emits, so promoting the waiting build
 * is a postMessage away.
 */
export function PwaUpdatePrompt() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // No SW in dev (none is built) and none without support — both no-op here.
    if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        // `controller` distinguishes an UPDATE from a first install: on a first
        // install the worker is "installed" too, but there is nothing stale to
        // warn about and nothing for the user to do.
        const announce = (sw: ServiceWorker | null) => {
          if (sw && navigator.serviceWorker.controller) setWaiting(sw);
        };
        announce(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          sw?.addEventListener("statechange", () => { if (sw.state === "installed") announce(sw); });
        });
        timer = setInterval(() => void reg.update().catch(() => undefined), UPDATE_CHECK_MS);
      })
      .catch(() => undefined);
    return () => { if (timer) clearInterval(timer); };
  }, []);

  const applyUpdate = () => {
    if (!waiting) return;
    // Reload only once the new worker is actually in control, otherwise the fresh
    // page would be served by the OLD worker and nothing would change.
    navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
    waiting.postMessage({ type: "SKIP_WAITING" });
  };

  if (!waiting || dismissed) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex justify-center px-4 md:bottom-6">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-card/95 py-2 pl-4 pr-2 text-sm shadow-lg backdrop-blur">
        <span className="font-medium">A new version is ready.</span>
        <button
          onClick={applyUpdate}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground [&_svg]:size-3.5"
        >
          <RefreshCw /> Reload
        </button>
        <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-secondary [&_svg]:size-4">
          <X />
        </button>
      </div>
    </div>
  );
}

/**
 * Last-resort backstop for a promise nobody caught. Every screen should handle
 * its own failures, but a missed `void load()` used to leave a permanent skeleton
 * and say nothing at all — an invisible dead end. Surfacing it as a transient
 * toast means a regression is at least *visible* (to users and to us in QA)
 * rather than silent. Offline/queued rejections are excluded: those are expected
 * and already have their own affordances.
 */
export function UnhandledErrorToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const onReject = (e: PromiseRejectionEvent) => {
      const r = e.reason as { queued?: boolean; offline?: boolean } | null | undefined;
      if (r && (r.queued || r.offline)) return;
      setMsg("Something didn't load. Check your connection, then try again.");
    };
    window.addEventListener("unhandledrejection", onReject);
    return () => window.removeEventListener("unhandledrejection", onReject);
  }, []);
  // Auto-dismiss so a one-off blip can't sit over the UI forever.
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 6000);
    return () => clearTimeout(t);
  }, [msg]);

  if (!msg) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[80] flex justify-center px-4">
      <div role="alert" className="pointer-events-auto flex items-center gap-2 rounded-full bg-card/95 py-2 pl-4 pr-2 text-sm shadow-lg backdrop-blur">
        <span className="text-warning">{msg}</span>
        <button onClick={() => setMsg(null)} aria-label="Dismiss" className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-secondary [&_svg]:size-3.5">
          <X />
        </button>
      </div>
    </div>
  );
}
