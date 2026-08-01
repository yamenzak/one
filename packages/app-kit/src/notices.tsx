/**
 * RUNTIME NOTICES — the four things a user must be told that no screen owns.
 *
 * All four describe the runtime rather than the product: we lost the network, a
 * write is parked for replay, a new build is waiting, and something failed with
 * nobody catching it. Every 4DL app has them in exactly this shape.
 *
 * A fifth used to live beside these — "this tenant is paused". It stayed in the
 * app, because once its words are removed there is nothing left to share.
 */

import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, WifiOff, Wrench, X, cn, motion, settle } from "@4dl/ui";
import type { Maintenance } from "@4dl/tenancy/model";

/**
 * Persistent app-bar indicator. Before this the app had no `navigator.onLine`
 * awareness at all, so an offline log read as a silent no-op: nothing confirmed,
 * nothing explained. The pill is the standing answer to "did that save?" —
 * writes on the queued log paths are safe, everything else will need a retry.
 */
export function OfflinePill({ online, degraded }: { online: boolean; degraded: boolean }) {
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

/**
 * The deployment is READ-ONLY for maintenance, said out loud.
 *
 * The `full` level replaces the app with its own screen; this level does not —
 * the app works, reads are served, and only writes are refused. Which is exactly
 * the situation that needs a banner: without one the app looks entirely normal
 * and each save fails on its own with a 503, so the user's model becomes "this is
 * broken" rather than "this is briefly paused". That is the same reasoning behind
 * a lapsed tenant's banner, and it holds for the same reason.
 *
 * Product-agnostic on purpose: there is nothing here but the operator's own
 * message and the fact of the state. An app wires it to wherever it keeps the
 * host probe's answer.
 *
 * Not dismissible. It is not a notification, it is the state of the whole
 * surface, and it stops being true when the operator says so.
 */
export function MaintenanceBanner({ state }: { state: Maintenance | null | undefined }) {
  if (state?.level !== "readonly") return null;
  return (
    <div
      role="status"
      className="border-b border-warning/25 bg-warning/12 px-4 py-2.5 text-xs leading-relaxed text-warning"
    >
      <div className="column flex items-start gap-2">
        <Wrench aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <span>
          <span className="font-semibold">Maintenance in progress.</span>{" "}
          {state.message || "Everything is readable, but changes can't be saved for a little while."}
        </span>
      </div>
    </div>
  );
}

/** How often to ask the server whether a newer worker exists. */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

/**
 * How long "Later" lasts.
 *
 * It used to be forever — `dismissed` was a boolean that nothing ever cleared,
 * so one tap on the × meant a user could sit on a stale build for the rest of
 * the tab's life. That is the wrong trade in the one direction that matters: the
 * prompt exists because the build in front of them is old, and dismissing it
 * does not make it newer. Twenty minutes is long enough to finish a workout and
 * short enough that "later" means later rather than never.
 */
const SNOOZE_MS = 20 * 60 * 1000;

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
export function PwaUpdatePrompt({
  /**
   * Whether a service worker exists to register. The app answers this because it
   * is a BUILD question — in Vite, `import.meta.env.PROD`. A package that read
   * that itself would assume one bundler for every 4DL app.
   */
  enabled,
  /** Where the built worker is served. */
  url = "/sw.js",
  /**
   * Refuse to let the app be used until the new build is applied.
   *
   * **Off by default, and it should stay off for "a new build exists".** The
   * reason is the same one that turned `skipWaiting` off in the first place: a
   * reload discards whatever the person had not saved, and this app is used
   * mid-set, mid-check-in, mid-meal-log. Forcing it is not a neutral act, it is
   * "lose your input, now, because we shipped something" — and a routine deploy
   * almost never justifies that.
   *
   * Turn it on for the case it is actually for: the running build can no longer
   * talk to the server. That is a different fact from "a newer build exists",
   * and an app that knows it (a version the API refuses, a required migration)
   * passes `blocking` then and only then.
   */
  blocking = false,
}: { enabled: boolean; url?: string; blocking?: boolean }) {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [snoozedUntil, setSnoozedUntil] = useState(0);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    // No SW in dev (none is built) and none without support — both no-op here.
    if (!("serviceWorker" in navigator) || !enabled) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    void navigator.serviceWorker
      .register(url, { scope: "/" })
      .then((reg) => {
        // `controller` distinguishes an UPDATE from a first install: on a first
        // install the worker is "installed" too, but there is nothing stale to
        // warn about and nothing for the user to do.
        const announce = (sw: ServiceWorker | null) => {
          if (sw && navigator.serviceWorker.controller) {
            setWaiting(sw);
            // A NEWER build outranks an earlier "later": the snooze was about
            // the build that was waiting then, not about this one.
            setSnoozedUntil(0);
          }
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
  }, [enabled, url]);

  // Re-render when the snooze expires, so "later" comes back on its own rather
  // than waiting for the next unrelated render to notice.
  useEffect(() => {
    if (!snoozedUntil) return;
    const t = setTimeout(() => setSnoozedUntil(0), Math.max(0, snoozedUntil - Date.now()));
    return () => clearTimeout(t);
  }, [snoozedUntil]);

  const applyUpdate = () => {
    if (!waiting) return;
    // Announced, because the gap between the tap and the reload is a real second
    // or two — the worker has to take control first. Without this the button
    // looked broken and people pressed it twice.
    setApplying(true);
    // Reload only once the new worker is actually in control, otherwise the fresh
    // page would be served by the OLD worker and nothing would change.
    navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
    waiting.postMessage({ type: "SKIP_WAITING" });
  };

  if (!waiting || (!blocking && snoozedUntil > Date.now())) return null;

  const card = (
    <motion.div
      variants={settle}
      initial="hidden"
      animate="show"
      role={blocking ? "alertdialog" : "status"}
      aria-live={blocking ? "assertive" : "polite"}
      aria-label="A new version is ready"
      className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-3xl border border-border/60 bg-card/95 shadow-lg backdrop-blur-xl"
    >
      <div className="flex items-start gap-3 p-4">
        {/* The mark, not a bare glyph. It gives the notice a subject at a glance
            and matches how every other status surface in the language opens. */}
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary [&_svg]:size-[1.15rem]">
          <RefreshCw className={cn(applying && "animate-spin")} />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-semibold">A new version is ready</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {blocking
              ? "This version can no longer talk to the server. Reload to carry on."
              : "It'll be applied next time you open the app — or reload now. Anything you haven't saved will be lost."}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-border/50 p-2">
        {/* "Later" first and quiet, "Reload" last and loud: the destructive-ish
            option is the one that discards unsaved input, so the safe choice sits
            where the thumb rests and the deliberate one needs a reach. */}
        {!blocking && (
          <button
            onClick={() => setSnoozedUntil(Date.now() + SNOOZE_MS)}
            className="min-h-11 flex-1 rounded-2xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Later
          </button>
        )}
        <button
          onClick={applyUpdate}
          disabled={applying}
          className="min-h-11 flex-1 rounded-2xl bg-primary px-3 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-70"
        >
          {applying ? "Reloading…" : "Reload now"}
        </button>
      </div>
    </motion.div>
  );

  return (
    <div
      className={cn(
        "fixed inset-0 z-[70] flex px-4",
        blocking
          // A scrim, and nothing behind it is reachable. Only ever rendered when
          // the app genuinely cannot work — see `blocking`.
          ? "items-center justify-center bg-background/80 backdrop-blur-sm"
          // Otherwise it is a notice: it sits above the tab bar, takes no space
          // from the screen, and lets every tap through except its own.
          //
          // This offset only exists if the consuming app SCANS this package for
          // class names — `@source "…/packages/app-kit/src"` in its stylesheet.
          // Without it Tailwind emits no rule, the card loses its whole bottom
          // offset and sits flush against the browser chrome with the buttons
          // clipped. See the header of `apps/app/src/styles.css`.
          : "pointer-events-none items-end justify-center pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-6",
      )}
    >
      {card}
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
