/**
 * ONE INSTALLABLE APP PER WORKSPACE.
 *
 * ⚠️ THE INSTALLABLE THING IS THE WORKSPACE, NOT THE PRODUCT. A business with
 * three of our products has one address, one roster and one bill; an icon per
 * product would put three tiles on their staff's phones for one place to work,
 * and switching between them would leave the installed app. So the manifest is
 * served from the workspace's own origin, its `start_url` is that origin's root,
 * and every app inside it is a route.
 *
 * ⚠️ AND WHOSE MARK IT WEARS FOLLOWS THE KIND, WHICH IS THE POINT OF THE KIND. A
 * commercial workspace's tile is theirs — their name, their colour, their icon —
 * because they are trading under it. A personal one wears OURS, honestly: it is
 * not trading under anybody's name, and a blank tile is not neutrality, it is a
 * page somebody cannot find again.
 *
 * ⚠️ AN ICON IS ALWAYS GENERATED AND MAY BE UPLOADED, in that order. Generation
 * is what makes this work on day one: a workspace that has uploaded nothing
 * still installs with a mark drawn from the two things we always have, rather
 * than with a browser default on a business's own staff phones. The upload is
 * for the business that has a logo, and it is commercial-only (`icon.ts`).
 *
 * ⚠️ AND THERE ARE TWO FORMATS BECAUSE THERE ARE TWO CONSUMERS. A browser tab
 * takes the SVG and scales it forever; `apple-touch-icon` must be a raster, and
 * a workspace with no PNG is added to an iOS home screen as a SCREENSHOT of the
 * page — which fails as an ugly tile rather than as an error, on somebody's own
 * phone, where nobody will report it. `raster.ts` is what closed that.
 *
 * ⚠️ THE RASTER CANNOT DRAW A LETTER, AND THAT IS WHY `ourMark` DECIDES IT. The
 * SVG sets the workspace's initial in a system font; a Worker has no font, so
 * the drawn tile carries the MARK. On a commercial workspace that is our mark on
 * their tile — which is exactly the thing `ourMark` already answers, so an
 * uploaded icon wins, our mark comes next, and a business that has turned our
 * mark off and uploaded nothing gets no raster at all rather than our logo.
 */

import type { Branding, Kind, MarkOf } from "@engine/kernel";
import { mayBrand } from "@engine/kernel";
import { tilePng } from "./raster.js";

/** Who the deployment is, for the workspaces that wear our mark. */
export interface Installer {
  readonly name: string;
  /** One glyph. It is drawn into the icon, so it is a character and not a URL. */
  readonly mark: string;
}

export interface Installable {
  readonly name: string;
  readonly kind: Kind;
  readonly branding: Branding | null;
  readonly us: Installer;
  /**
   * ⚠️ THE ONE THEY UPLOADED, IF THEY DID — bytes, because this is answered on
   * the public path and a URL here would be a second fetch to resolve before a
   * tab can draw. Absent means draw one; see the header.
   */
  readonly icon?: { readonly png: Uint8Array<ArrayBuffer>; readonly width: number } | null;
}

/* ------------------------------------------------------------------ paint --- */

/** ⚠️ Ours, and mono on purpose — the company colour is not a hue (DESIGN.md). */
const OUR_INK = "#f4f4f5";
const OUR_GROUND = "#111113";

interface Paint {
  readonly ground: string;
  readonly ink: string;
  readonly glyph: string;
}

/**
 * ⚠️ ONE RESOLVER FOR THE TILE, so the icon and the manifest cannot disagree
 * about what colour a workspace is. Drawn twice from two reads is how an app
 * installs with one colour behind the splash and another on the icon.
 */
export function paintFor(of: Installable): Paint {
  /*
    ⚠️ MAY BRAND AND ASKED TO, WHICH ARE TWO QUESTIONS. `mayBrand` says a
    business is entitled to its own identity; the SURFACE list says where it
    wanted it. The tile used to read only the first, so a workspace that turned
    `app-icons` off in its own settings still installed as itself — a switch
    that saved and changed nothing, in the one place branding was applied at all.

    ⚠️ AND IT IS THE WORKSPACE'S PICK ALONE, NOT AN INTERSECTION. The icon is the
    workspace's home screen tile rather than any product's screen, so there is no
    app to ask whether it has one — `brandedSurfaces` is for the surfaces a
    PRODUCT owns.
  */
  const theirs = mayBrand(of.kind) && of.branding?.surfaces.includes("app-icons")
    ? of.branding
    : null;
  return {
    ground: theirs?.theme.ground ?? OUR_GROUND,
    ink: theirs?.theme.ink ?? OUR_INK,
    /* ⚠️ Their mark, else their initial, else ours. A workspace called
       "Northwind" installing as a diamond is a tile nobody recognises. */
    glyph: theirs?.theme.mark ?? (theirs ? of.name.trim().charAt(0).toUpperCase() : of.us.mark),
  };
}

/**
 * ⚠️ SVG IS THE ONE THAT CAN SET A LETTER, which is why it survived the arrival
 * of the rasteriser rather than being replaced by it. A Worker has no font, so
 * the drawn tile carries the mark and this carries the workspace's own initial —
 * two pictures answering to different limits, not one obsoleted by the other.
 */
export function iconSvg(of: Installable): string {
  const { ground, ink, glyph } = paintFor(of);
  /* ⚠️ Escaped, because the glyph comes from a workspace's own settings and this
     string is served as a document. */
  const safe = glyph.replace(/[<>&"']/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img">`
    + `<rect width="512" height="512" rx="112" fill="${ground}"/>`
    + `<text x="50%" y="50%" dy=".01em" fill="${ink}" font-size="256"`
    + ` font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif"`
    + ` font-weight="600" text-anchor="middle" dominant-baseline="central">${safe}</text>`
    + `</svg>`;
}

/* --------------------------------------------------------------- manifest --- */

/**
 * ⚠️ `start_url` IS THE ORIGIN'S ROOT AND `scope` IS THE WHOLE ORIGIN, which is
 * what makes app switching stay inside the installed window. A scope narrowed to
 * one product would send every switch out to the browser, and the person would
 * watch their app close.
 *
 * ⚠️ AND THE NAME IS THE WORKSPACE'S, never the product's. Somebody looking for
 * their gym on a home screen is looking for the gym.
 */
export function webManifest(of: Installable): Record<string, unknown> {
  const { ground } = paintFor(of);
  const branded = mayBrand(of.kind) && of.branding !== null;
  return {
    name: branded ? of.name : `${of.name} · ${of.us.name}`,
    short_name: of.name,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: ground,
    theme_color: ground,
    icons: iconsFor(of),
  };
}

/**
 * ⚠️ THE SIZE IS DECLARED HONESTLY OR THE ENTRY IS A LIE THE PLATFORM ACTS ON.
 * An installer picks by `sizes` and does not check; a 256px upload declared as
 * 512 is chosen for the largest slot and upscaled onto a home screen. So the
 * uploaded icon's entry carries the dimensions read out of the file itself.
 *
 * ⚠️ `any maskable` ON ONE ENTRY RATHER THAN TWO: the artwork is a filled square
 * with the drawing well inside the safe area (`raster.ts`), so a platform that
 * masks it loses nothing — and a second entry is the same bytes fetched twice.
 *
 * ⚠️ AND THE SVG STAYS, FIRST, because it is the one that is right at every
 * size. The raster is what platforms that will not take an SVG fall back to.
 */
function iconsFor(of: Installable): readonly Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [
    { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
  ];
  const side = of.icon ? of.icon.width : rasterOf(of) ? TILE : 0;
  if (side) {
    out.push({
      src: "/icon.png", sizes: `${side}x${side}`, type: "image/png", purpose: "any maskable",
    });
  }
  return out;
}

/* ----------------------------------------------------------------- raster --- */

/** ⚠️ One size, and it is the largest anything asks for — everything else
    downscales, and a Worker resizing a PNG is a decoder we are not writing. */
export const TILE = 512;

/**
 * WHICH MARK THE DRAWN TILE CARRIES, OR NONE.
 *
 * ⚠️ `null` IS A REAL ANSWER AND IT IS THE POINT. A commercial workspace that
 * has turned our mark off has said, in the one place that question is asked, not
 * to put our logo on their product — so the honest response to "we cannot draw
 * your letter" is no raster, not our mark anyway. They upload one, or they have
 * the SVG, which sets their own initial.
 */
export function rasterOf(of: Installable): MarkOf | null {
  if (!mayBrand(of.kind)) return "one";
  return of.branding?.ourMark === false ? null : "one";
}

/**
 * THE TILE, AS PNG BYTES — uploaded if there is one, drawn if there is not.
 *
 * ⚠️ ONE FUNCTION, SO A ROUTE CANNOT SERVE THE UPLOAD AND A MANIFEST DESCRIBE
 * THE DRAWING. That disagreement installs an icon of one shape and caches an
 * entry claiming another, and it resolves differently per platform.
 */
export async function iconPng(of: Installable): Promise<Uint8Array<ArrayBuffer> | null> {
  if (of.icon) return of.icon.png;
  const mark = rasterOf(of);
  if (!mark) return null;
  const { ground, ink } = paintFor(of);
  return tilePng({ of: mark, ground, ink, size: TILE });
}
