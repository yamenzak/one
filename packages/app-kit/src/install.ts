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
 * ── The three answers, and why there are three ───────────────────────────────
 *
 *   installed     Already running from the home screen. Nothing to ask.
 *   installable   Chromium fired `beforeinstallprompt`, so there is a real
 *                 one-tap install and we hold the event that triggers it.
 *   manual        It can be installed, but only by hand through the browser's
 *                 own menu. This is EVERY iPhone and iPad: WebKit has no
 *                 install API at all, by policy, and never fires the event —
 *                 so an app that only listens for it shows nothing to the
 *                 platform whose users most need telling.
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

/** How the app is being run, and what we can offer. */
export type InstallMode = "installed" | "installable" | "manual";

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

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      mqs.forEach((m) => m.removeEventListener?.("change", sync));
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
    mode: installed ? "installed" : deferred ? "installable" : "manual",
    platform: installPlatform(),
    promptInstall,
  };
}
