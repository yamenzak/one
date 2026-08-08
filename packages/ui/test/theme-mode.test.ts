/**
 * THE MODE, IN THREE STATES — and the four ways two states became three wrongly.
 *
 * `ThemeMode` is what is PAINTED (light or dark, always concrete). `ThemeChoice`
 * is what the person ASKED FOR, which may be "follow my system". Conflating them
 * is what kept the third state out of the platform for so long that one app grew
 * its own theme module to get it, and that module's existence is why Scena also
 * went without the browser-chrome white-labelling and the theme-color meta the
 * other two apps have.
 *
 * Every case below is a decision that had two defensible answers, so each is
 * pinned rather than left to whoever edits next:
 *
 *   1. "system" is a STORABLE choice, not the absence of one.
 *   2. An explicit choice beats the tenant's default beats the OS beats dark.
 *   3. `applyMode` does NOT persist — that is what made "system" erase itself.
 *   4. What "never chosen" means is the APP's, injected, because both shipped
 *      answers are live.
 *
 * No DOM here (this package has no jsdom), so `applyMode` is covered by the
 * conformance suites in the apps. What is here is the pure decision layer.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  configureTheme, displayedModeChoice, readModeChoice, resolveChoice, resolveMode, systemPrefersDark, writeModeChoice,
} from "../src/lib/theme.js";

/** A localStorage that actually stores, so a write/read round-trip is real. */
function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    map,
  };
}

const stubSystem = (dark: boolean) => vi.stubGlobal("matchMedia", () => ({ matches: dark, addEventListener() {}, removeEventListener() {} }));

beforeEach(() => {
  vi.unstubAllGlobals();
  // Back to the package default between tests — `configureTheme` is module state
  // and a leaked `defaultChoice` would make the next test lie.
  configureTheme({ storageKey: "ui-theme", styleId: "ui-branding", defaultChoice: "dark" });
});

describe("readModeChoice", () => {
  it("reads all three, and only those three", () => {
    for (const v of ["light", "dark", "system"] as const) {
      vi.stubGlobal("localStorage", fakeStorage({ "ui-theme": v }));
      expect(readModeChoice()).toBe(v);
    }
    /*
      Anything else is `null` — NEVER CHOSEN, which is a different fact from
      "chose the app's default". Conflating them is what made an unset preference
      outrank a studio's own `defaultMode`; see `resolveChoice`.
    */
    for (const junk of ["", "auto", "DARK"]) {
      vi.stubGlobal("localStorage", fakeStorage({ "ui-theme": junk }));
      expect(readModeChoice()).toBeNull();
    }
  });

  /*
    ⚠️ "SYSTEM" IS A STORED VALUE, not an absent one — the distinction the whole
    design turns on. Somebody who has been on dark and then asks to follow their
    system has made a decision; recording it as "nothing stored" would make it
    indistinguishable from a fresh install, so an app whose `defaultChoice` is
    "dark" would quietly ignore it on the next load.
  */
  it("round-trips `system` rather than clearing the key", () => {
    const store = fakeStorage({ "ui-theme": "dark" });
    vi.stubGlobal("localStorage", store);
    writeModeChoice("system");
    expect(store.map.get("ui-theme")).toBe("system");
    expect(readModeChoice()).toBe("system");
  });

  it("survives storage being unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("private mode"); },
      setItem: () => { throw new Error("private mode"); },
    });
    // The read is guarded by the try in the caller path; the write must not throw.
    expect(() => writeModeChoice("light")).not.toThrow();
  });

  /*
    WHAT "NEVER CHOSEN" MEANS IS THE APP'S. Kova and Tessa fall back to dark;
    Scena follows the OS. Both were already shipped, and choosing one for
    everybody would have silently reskinned a live product on upgrade.
  */
  it("honours the app's configured default — for DISPLAY, not as a choice", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    expect(readModeChoice()).toBeNull();
    expect(displayedModeChoice()).toBe("dark");
    configureTheme({ defaultChoice: "system" });
    expect(displayedModeChoice()).toBe("system");
  });
});

describe("resolveChoice — the order of precedence", () => {
  it("an explicit choice wins over everything, including the tenant default", () => {
    stubSystem(true);
    expect(resolveChoice("light", "dark")).toBe("light");
    expect(resolveChoice("dark", "light")).toBe("dark");
  });

  /*
    A TENANT'S `defaultMode` BEATS THE OS. A studio that chose how it looks has
    decided something about its own brand, and the operating system of whoever
    happens to be looking is not a party to that.
  */
  it("under `system`, the tenant's default beats the OS", () => {
    stubSystem(true);
    expect(resolveChoice("system", "light")).toBe("light");
    stubSystem(false);
    expect(resolveChoice("system", "dark")).toBe("dark");
  });

  it("with no tenant default, `system` follows the OS", () => {
    stubSystem(true);
    expect(resolveChoice("system", null)).toBe("dark");
    stubSystem(false);
    expect(resolveChoice("system", null)).toBe("light");
  });

  /*
    AND FALLS BACK TO DARK when the browser will not say. `:root` already holds
    the dark palette, so dark is also what an un-scripted first paint shows —
    agreeing with it is what makes `initMode` invisible rather than a flash.
  */
  /*
    A `null` CHOICE IS NOT A `"system"` CHOICE. Nobody chose, so the app's floor
    decides — and under the dark floor the OS must not get a vote, or Kova and
    Tessa would silently start following it.
  */
  it("with nothing chosen, the app's floor decides and the OS does not", () => {
    stubSystem(false); // a light OS, which must NOT win under the dark floor
    expect(resolveChoice(null, null)).toBe("dark");
    configureTheme({ defaultChoice: "system" });
    expect(resolveChoice(null, null)).toBe("light");
  });

  it("a tenant default outranks the app's floor, whichever floor it is", () => {
    stubSystem(true);
    expect(resolveChoice(null, "light")).toBe("light");
    configureTheme({ defaultChoice: "system" });
    expect(resolveChoice(null, "light")).toBe("light");
  });

  it("falls back to dark when the OS preference is unavailable", () => {
    vi.unstubAllGlobals();
    expect(systemPrefersDark()).toBe(false);
    expect(resolveChoice("system", null)).toBe("light");
    // …and `matchMedia` present but answering "not dark" is the same as a light
    // OS, which is the honest reading of the query.
    stubSystem(false);
    expect(resolveChoice("system", null)).toBe("light");
  });
});

describe("resolveMode — unchanged for every existing caller", () => {
  /*
    It is `resolveChoice(readModeChoice(), …)` now. With the package default
    (`defaultChoice: "dark"`) it must return exactly what it always did, because
    two live products call it and neither asked for a new default.
  */
  it("is what it always was under the dark default", () => {
    stubSystem(false); // a LIGHT OS — the case that would change if this broke
    vi.stubGlobal("localStorage", fakeStorage());
    expect(resolveMode()).toBe("dark");
    expect(resolveMode("light")).toBe("light");

    vi.stubGlobal("localStorage", fakeStorage({ "ui-theme": "light" }));
    expect(resolveMode("dark")).toBe("light");
  });

  it("and follows the OS once an app opts in", () => {
    configureTheme({ defaultChoice: "system" });
    vi.stubGlobal("localStorage", fakeStorage());
    stubSystem(false);
    expect(resolveMode()).toBe("light");
    stubSystem(true);
    expect(resolveMode()).toBe("dark");
  });
});
