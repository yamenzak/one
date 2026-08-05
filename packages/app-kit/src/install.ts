/**
 * IS THIS THE INSTALLED APP, OR A BROWSER TAB — and can we do anything about it?
 *
 * A PWA's whole promise is that it ends up on the home screen: a tab is closed
 * and forgotten, an icon is opened. But nothing in the app can currently tell
 * the two apart, so the product has no way to ask for the install and no way to
 * stop asking once it happened.
 *
 * This is platform mechanics with no product vocabulary in it, which is why it
 * lives here rather than in an app. What a nudge SAYS is the app's.
 *
 * ── The four answers ─────────────────────────────────────────────────────────
 *
 *   unknown       We have not waited long enough to say. `beforeinstallprompt`
 *                 fires asynchronously, so this is the honest answer for the
 *                 first moment of every page — see `InstallMode`.
 *   installed     Already running from the home screen. Nothing to ask.
 *   installable   Chromium fired `beforeinstallprompt`, so there is a real
 *                 one-tap install and we hold the event that triggers it. This
 *                 is ANDROID CHROME's normal state on a site that meets the
 *                 install criteria (manifest, icons, a service worker with a
 *                 fetch handler) — Android is not the manual lane.
 *   manual        It can be installed, but only by hand through the browser's
 *                 own menu. This is EVERY iPhone and iPad: WebKit has no
 *                 install API at all, by policy, and never fires the event —
 *                 so an app that only listens for it shows nothing to the
 *                 platform whose users most need telling. Also anywhere the
 *                 install criteria are not met, which includes any environment
 *                 that blocks the service worker (the screenshot suite does).
 *
 * The manual lane is the reason this hook exists rather than a two-line
 * `useState` around the event.
 *
 * ── Detecting "installed" ────────────────────────────────────────────────────
 *
 * Three signals, because no single one covers the field:
 *   `display-mode: standalone`   the spec answer; Chromium, Edge, Samsung, and
 *                                modern iOS.
 *   `navigator.standalone`       iOS's own, non-standard and still the only
 *                                reliable one on older iOS.
 *   `android-app://` referrer    a TWA (the app shipped through Play).
 *
 * And it is a LIVE query: a desktop install swaps the window's display mode
 * without a reload, so a one-shot read leaves the nudge on screen inside the
 * app it just installed.
 */

import { useCallback, useEffect, useState } from "react";

/**
 * How the app is being run, and what we can offer.
 *
 * `unknown` is the fourth one and it is not padding. `beforeinstallprompt`
 * fires ASYNCHRONOUSLY — after load, once Chromium has checked its install
 * criteria — so a hook that reports `manual` the moment it mounts renders the
 * "no install here" affordance on an ANDROID PHONE THAT HAS ONE, then changes
 * the button's verb under the reader's thumb a second later. Tap inside that
 * window and you get a page of instructions for a dialog the browser was about
 * to open for you.
 *
 * So: say nothing until Chromium has had its beat. A nudge that appears a
 * moment late is invisible; a nudge that changes what it does while you are
 * reaching for it is not.
 */
export type InstallMode = "unknown" | "installed" | "installable" | "manual";

/**
 * How long to wait for `beforeinstallprompt` before concluding there isn't one.
 *
 * Generous on purpose, and the asymmetry is the whole argument: waiting too
 * long costs a row appearing slightly late on a screen nobody has finished
 * reading, and waiting too little costs the label flip above. Chromium fires
 * within a few hundred milliseconds of load in practice.
 */
const PROMPT_GRACE_MS = 1200;

/** Which set of instructions the manual lane needs. */
export type InstallPlatform = "ios" | "android" | "desktop";

/** The Chromium-only event. Not in lib.dom, so it is declared here. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const STANDALONE_QUERIES = ["(display-mode: standalone)", "(display-mode: fullscreen)", "(display-mode: minimal-ui)"];

/** Running from the home screen / an installed window, by any of the signals. */
export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  if (STANDALONE_QUERIES.some((q) => window.matchMedia?.(q).matches)) return true;
  // iOS's own flag. Non-standard, absent everywhere else, and load-bearing on
  // any iOS old enough not to answer the media query.
  if ((window.navigator as { standalone?: boolean }).standalone === true) return true;
  return document.referrer.startsWith("android-app://");
}

/**
 * Which platform's instructions to show.
 *
 * iPadOS 13+ reports itself as `Macintosh` — deliberately, to get desktop
 * sites — so the touch-point count is the only thing left that distinguishes an
 * iPad from a Mac. Getting this wrong sends an iPad user to a Chrome menu that
 * is not there.
 */
export function installPlatform(): InstallPlatform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

/**
 * The mode, derived from the three facts that decide it.
 *
 * Pulled out of the hook and exported so the ORDER can be tested without a DOM
 * or a React renderer — the order is the whole rule, and it is the part that
 * was wrong: reporting `manual` before `settled` is what put the "no install
 * here" affordance on Android phones that had one.
 */
export function resolveInstallMode(installed: boolean, hasPrompt: boolean, settled: boolean): InstallMode {
  if (installed) return "installed";
  if (hasPrompt) return "installable";
  return settled ? "manual" : "unknown";
}

export interface InstallState {
  mode: InstallMode;
  platform: InstallPlatform;
  /**
   * Fire the browser's own install dialog. Resolves to whether they accepted.
   *
   * Returns `false` on the manual lane rather than throwing — a caller may show
   * one button and let this decide, and "nothing happened" is the honest answer
   * to a prompt that does not exist. Callers that need to show instructions
   * instead should branch on `mode` first.
   */
  promptInstall: () => Promise<boolean>;
}

export function useInstallState(): InstallState {
  const [installed, setInstalled] = useState(isInstalled);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  /** Has Chromium had its beat to fire `beforeinstallprompt`? See `InstallMode`. */
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    /*
      PREVENT-DEFAULT AND KEEP IT.

      Without `preventDefault()` Chromium shows its own mini-infobar, and the
      event is then spent — so an app that renders its own install row ends up
      with two prompts and a dead button. Holding the event is the documented
      way to move the moment into the product.
    */
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      // The answer arrived early — no reason to keep waiting for the deadline.
      setSettled(true);
    };
    const onInstalled = () => { setDeferred(null); setInstalled(true); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // A desktop install changes the window's display mode with no reload, so the
    // query is watched rather than read once — otherwise the nudge to install
    // stays on screen inside the app it just installed.
    const mqs = STANDALONE_QUERIES.map((q) => window.matchMedia(q));
    const sync = () => setInstalled(isInstalled());
    mqs.forEach((m) => m.addEventListener?.("change", sync));

    const deadline = setTimeout(() => setSettled(true), PROMPT_GRACE_MS);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      mqs.forEach((m) => m.removeEventListener?.("change", sync));
      clearTimeout(deadline);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return false;
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      // Spent either way: the event is single-use, and keeping it would leave a
      // button that silently does nothing on the second tap.
      setDeferred(null);
      return outcome === "accepted";
    } catch {
      setDeferred(null);
      return false;
    }
  }, [deferred]);

  return {
    mode: resolveInstallMode(installed, deferred != null, settled),
    platform: installPlatform(),
    promptInstall,
  };
}
