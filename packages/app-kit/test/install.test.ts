/**
 * IS THIS A TAB OR THE INSTALLED APP.
 *
 * Both halves of this are the kind of thing that is right on the machine you
 * wrote it on and wrong everywhere else, which is why they are pinned here
 * rather than checked by opening a phone.
 *
 * `isInstalled` reads three unrelated signals because no one of them covers the
 * field — and the iOS one is a non-standard property that a naive
 * `matchMedia`-only check misses entirely, which would mean an install nudge
 * showing forever inside the installed app on every older iPhone.
 *
 * `installPlatform` exists for one reason: iPadOS 13+ reports itself as
 * `Macintosh`, deliberately, so it gets desktop sites. The touch-point count is
 * the only thing left that separates an iPad from a Mac, and getting it wrong
 * sends an iPad user to an address-bar install button that does not exist.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { installPlatform, isInstalled, resolveInstallMode } from "../src/install.js";

/** Stand up just enough `window`/`navigator`/`document` for the two readers. */
function browser(opts: {
  matches?: string[];
  standalone?: boolean;
  referrer?: string;
  ua?: string;
  maxTouchPoints?: number;
}) {
  const matches = new Set(opts.matches ?? []);
  vi.stubGlobal("window", {
    matchMedia: (q: string) => ({ matches: matches.has(q) }),
    navigator: { standalone: opts.standalone },
  });
  vi.stubGlobal("document", { referrer: opts.referrer ?? "" });
  vi.stubGlobal("navigator", {
    userAgent: opts.ua ?? "Mozilla/5.0",
    maxTouchPoints: opts.maxTouchPoints ?? 0,
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("isInstalled", () => {
  it("is false in an ordinary tab", () => {
    browser({});
    expect(isInstalled()).toBe(false);
  });

  it("is true for each display mode an installed app can run in", () => {
    for (const mode of ["standalone", "fullscreen", "minimal-ui"]) {
      browser({ matches: [`(display-mode: ${mode})`] });
      expect(isInstalled(), mode).toBe(true);
    }
  });

  it("is true on iOS via navigator.standalone, with no media query at all", () => {
    // The case a `matchMedia`-only check gets wrong: older iOS answers the
    // property and not the query, so the nudge would sit inside the installed
    // app forever on exactly the platform that most needed the nudge.
    browser({ standalone: true, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)" });
    expect(isInstalled()).toBe(true);
  });

  it("is true inside a Play-store wrapper (TWA)", () => {
    browser({ referrer: "android-app://com.example.twa/" });
    expect(isInstalled()).toBe(true);
  });

  it("does not mistake `navigator.standalone === false` for a signal", () => {
    browser({ standalone: false });
    expect(isInstalled()).toBe(false);
  });
});

describe("installPlatform", () => {
  it("names the phone platforms from the user agent", () => {
    browser({ ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari" });
    expect(installPlatform()).toBe("ios");
    browser({ ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome" });
    expect(installPlatform()).toBe("android");
  });

  it("treats a touch `Macintosh` as an iPad, and a real Mac as desktop", () => {
    // iPadOS 13+ lies about being a Mac on purpose. Without the touch-point
    // check an iPad is told to look for an install button in its address bar.
    browser({ ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari", maxTouchPoints: 5 });
    expect(installPlatform()).toBe("ios");
    browser({ ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari", maxTouchPoints: 0 });
    expect(installPlatform()).toBe("desktop");
  });

  it("falls back to desktop for anything it cannot place", () => {
    browser({ ua: "SomeBrowser/1.0" });
    expect(installPlatform()).toBe("desktop");
  });
});


/**
 * THE GRACE WINDOW — the Android bug the fourth mode exists for.
 *
 * `beforeinstallprompt` fires after Chromium has checked its install criteria,
 * not on mount. Without the wait, an Android phone with a perfectly good
 * one-tap install renders the "no install here" affordance first and swaps the
 * button's verb a second later — and a tap inside that window opens a page of
 * instructions for a dialog the browser was about to open itself.
 *
 * The ORDER is the rule, which is why it is a pure function rather than a
 * rendered hook: the timer and the listeners are thin wiring, and the thing
 * that was wrong was the precedence.
 */
describe("resolveInstallMode", () => {
  it("says `unknown` before the window closes, so nothing renders too early", () => {
    expect(resolveInstallMode(false, false, false)).toBe("unknown");
  });

  it("says `installable` the moment the event lands, without waiting the window out", () => {
    expect(resolveInstallMode(false, true, false)).toBe("installable");
  });

  it("only says `manual` once the window has closed with no event — iOS, and not before", () => {
    expect(resolveInstallMode(false, false, true)).toBe("manual");
  });

  it("lets `installed` outrank everything, including a stale held event", () => {
    // `appinstalled` clears the event, but the two are independent signals and
    // a nudge inside the installed app is the one outcome with no excuse.
    expect(resolveInstallMode(true, true, true)).toBe("installed");
  });
});
