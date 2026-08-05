/**
 * THE INSTALLED APP'S ICON.
 *
 * `buildManifest` used to read `branding.iconUrl` — the DARK-mode mark —
 * unconditionally, and declare it `maskable`. Chrome builds an Android adaptive
 * icon by compositing the maskable entry onto a WHITE background layer, so a
 * studio whose mark is bare letterforms (plate `none`, one of the generator's
 * three options) installed as an empty white circle: pale ink, on transparency,
 * on white. It looked perfect in the app and in the notification shade, and
 * wrong in the one place a customer decides what the app is.
 *
 * Nothing failed. No request 500'd, no console warned, and the manifest
 * validated. That is the shape of bug a test is the only defence against, so
 * the three rules are asserted here rather than left to a screenshot:
 *
 *   1. The purpose-built install icon wins when it exists.
 *   2. Failing that, the LIGHT mark — dark ink reads on the white fill — and
 *      never the dark one while a light one exists.
 *   3. `maskable` is a promise about the pixels (full bleed, opaque, content
 *      inside the inner 80%). Only the purpose-built rendition may make it.
 *
 * `apps/app/src/brand-mark.conformance.test.ts` bans the same mistake in the
 * app by regex. It cannot see this file — the manifest is server-side, and a
 * blanket server lint would be all exemptions: `notify.ts` reads the dark mark
 * on purpose, because `emailShell` paints a near-black canvas. A rule with two
 * call sites and two exemptions is noise; this is the guard that holds.
 */

import { describe, expect, it } from "vitest";
import { buildManifest } from "../src/manifest.js";
import type { HostTenant } from "../src/host-context.js";

type Icon = { src: string; sizes: string; type: string; purpose: string };

const parse = (ht: HostTenant | null, origin?: string): {
  icons: Icon[]; name: string; short_name: string;
  related_applications?: { platform: string; url: string }[];
  prefer_related_applications?: boolean;
} => JSON.parse(buildManifest(ht, origin));

/** A tenant carrying exactly the branding under test. */
const tenant = (branding: Record<string, unknown>): HostTenant =>
  ({ id: "t1", name: "Northlight Strength", slug: "northlight", branding }) as unknown as HostTenant;

const maskable = (icons: Icon[]) => icons.filter((i) => i.purpose === "maskable");
const any = (icons: Icon[]) => icons.filter((i) => i.purpose === "any");

describe("the installed app wears an icon that survives a launcher", () => {
  it("prefers the purpose-built install icon, and it is the only maskable entry", () => {
    const { icons } = parse(tenant({
      installIconUrl: "/api/media/t/t1/brand/install.png",
      iconUrl: "/api/media/t/t1/brand/dark.png",
      iconUrlLight: "/api/media/t/t1/brand/light.png",
    }));
    expect(any(icons).map((i) => i.src)).toEqual([
      "/api/media/t/t1/brand/install.png",
      "/api/media/t/t1/brand/install.png",
    ]);
    expect(maskable(icons).map((i) => i.src)).toEqual(["/api/media/t/t1/brand/install.png"]);
  });

  it("falls back to the LIGHT mark, never the dark one, and claims no maskable", () => {
    // The whole bug in one assertion: a launcher fills transparency with white,
    // so the dark mark's pale ink is the one rendition that cannot be used.
    const { icons } = parse(tenant({
      iconUrl: "/api/media/t/t1/brand/dark.png",
      iconUrlLight: "/api/media/t/t1/brand/light.png",
    }));
    expect(any(icons).every((i) => i.src.endsWith("light.png"))).toBe(true);
    expect(icons.some((i) => i.src.endsWith("dark.png"))).toBe(false);
    expect(maskable(icons)).toEqual([]);
  });

  it("uses the dark mark only when it is the ONLY mark — still not maskable", () => {
    const { icons } = parse(tenant({ iconUrl: "/api/media/t/t1/brand/dark.png" }));
    expect(any(icons).every((i) => i.src.endsWith("dark.png"))).toBe(true);
    expect(maskable(icons)).toEqual([]);
  });

  it("keeps the platform's own maskable PNG when a studio has no mark at all", () => {
    // The shipped asset IS full-bleed and opaque, so the promise holds here.
    const { icons } = parse(tenant({}));
    expect(maskable(icons).map((i) => i.src)).toEqual(["/icon-maskable-512.png"]);
  });

  it("serves the platform manifest off the neutral host", () => {
    const m = parse(null);
    expect(m.name).toBe("Kova");
    expect(maskable(m.icons).map((i) => i.src)).toEqual(["/icon-maskable-512.png"]);
  });

  it("declares the install sizes a launcher actually looks for", () => {
    const { icons } = parse(tenant({ installIconUrl: "/api/media/t/t1/brand/install.png" }));
    expect(icons.map((i) => i.sizes)).toContain("192x192");
    expect(icons.map((i) => i.sizes)).toContain("512x512");
    expect(icons.every((i) => i.type === "image/png")).toBe(true);
  });

  it("keeps the short name inside what a home screen will show", () => {
    const m = parse(tenant({}));
    expect(m.short_name.length).toBeLessThanOrEqual(12);
  });
});


/**
 * THE MANIFEST NAMES ITSELF.
 *
 * `navigator.getInstalledRelatedApps()` is the only way a page can learn that
 * its own PWA is installed, and it answers only for apps listed under
 * `related_applications`. Without the entry, an installed app opened from a
 * link — a tab, so `display-mode: browser`, and no `beforeinstallprompt`
 * because Chrome only offers to install what is not installed — concludes it is
 * not installed and offers Add-to-Home-Screen instructions to someone who did
 * it last week.
 */
describe("the manifest names itself, so the app can detect its own install", () => {
  it("declares a webapp relation pointing at this origin's manifest", () => {
    const m = parse(tenant({}), "https://coaching.example.com");
    expect(m.related_applications).toEqual([
      { platform: "webapp", url: "https://coaching.example.com/manifest.webmanifest" },
    ]);
  });

  it("NEVER sets prefer_related_applications", () => {
    // True beside that entry, it tells Chromium to promote the related app
    // instead of offering to install — switching off the very prompt the entry
    // exists to make detectable.
    const m = parse(tenant({}), "https://coaching.example.com");
    expect(m.prefer_related_applications).toBeUndefined();
  });

  it("omits the relation entirely when no origin is known, rather than guessing one", () => {
    // A wrong URL here is worse than none: the method would answer about an app
    // that is not this one.
    expect(parse(tenant({})).related_applications).toBeUndefined();
  });
});
