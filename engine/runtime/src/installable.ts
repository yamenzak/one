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
 * ⚠️ THE ICON IS GENERATED RATHER THAN UPLOADED, and that is what makes this
 * work on day one. Waiting for an upload pipeline would mean every workspace
 * installs as a browser default until somebody builds one — and a default
 * favicon on a business's own staff phones is worse than a mark drawn from the
 * two things we always have: a letter and a colour.
 */

import type { Branding, Kind } from "@engine/kernel";
import { mayBrand } from "@engine/kernel";

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
  const theirs = mayBrand(of.kind) ? of.branding : null;
  return {
    ground: theirs?.theme.ground ?? OUR_GROUND,
    ink: theirs?.theme.ink ?? OUR_INK,
    /* ⚠️ Their mark, else their initial, else ours. A workspace called
       "Northwind" installing as a diamond is a tile nobody recognises. */
    glyph: theirs?.theme.mark ?? (theirs ? of.name.trim().charAt(0).toUpperCase() : of.us.mark),
  };
}

/**
 * ⚠️ SVG, BECAUSE IT IS THE ONE FORMAT WE CAN DRAW WITHOUT A RASTERISER. A
 * Worker has no canvas; the alternative is shipping a PNG encoder to render two
 * shapes, or shipping no icon at all.
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
    icons: [
      /* ⚠️ `any maskable` on one entry rather than two: the artwork is a filled
         rounded square with the glyph well inside it, so a platform that masks
         it loses nothing — and a second entry would be the same bytes fetched
         twice. */
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
    ],
  };
}
