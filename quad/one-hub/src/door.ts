/**
 * WHICH DOOR THIS BROWSER IS AT, AND THE ADDRESSES OF THE OTHERS.
 *
 * ⚠️ THE PAGE DOES NOT CLASSIFY ITS OWN HOSTNAME. `/health` reports the door,
 * because the runtime already decided it with the reserved labels, the
 * one-label rule and the custom-domain test — and a second classifier here
 * would be a second set of all three. When they disagree the page offers a
 * control the runtime refuses, and somebody gets a 404 with nothing to read.
 *
 * ⚠️ AND MOVING BETWEEN DOORS IS A FULL PAGE LOAD, NEVER A ROUTE. They are
 * different origins; a router pushing `/workspaces` onto the setup door lands on
 * a screen the setup door does not have, and the first thing that fails is a
 * fetch the person cannot see.
 */

export type DoorKind = "signpost" | "account" | "setup" | "operator" | "tenant" | "device" | "none";

export interface Where {
  readonly kind: DoorKind;
  /** `one.4dl.app` — everything under it is ours. */
  readonly root: string;
  /**
   * ⚠️ WHICH WORKSPACE THIS DOOR IS, WHEN IT IS ONE — reported, never derived.
   * The hub asks constantly: opening a workspace is a route where it already
   * is and a full page load anywhere else. Cutting it out of the hostname
   * would be the second classifier this file exists to refuse.
   */
  readonly slug: string | null;
}

/** ⚠️ The port travels with the address, or every hop in development is a 404. */
const port = (location: Location): string => (location.port ? `:${location.port}` : "");

/**
 * ⚠️ THE PAGE'S OWN ADDRESS, OR A STAND-IN WHERE THERE IS NO DOM. A door's
 * second route is an `href` now, which means it is built while the component
 * RENDERS rather than when somebody presses something — and the screens are
 * rendered to a string in the suite, where `location` does not exist. Reaching
 * for the global at render is what makes a screen provable only in a browser.
 */
export const here = (): Location =>
  (typeof location === "undefined"
    ? { protocol: "https:", port: "" } as Location
    : location);

const at = (label: string | null, where: Where, location: Location): string =>
  `${location.protocol}//${label ? `${label}.` : ""}${where.root}${port(location)}`;

export const accountUrl = (where: Where, location: Location): string => at("id", where, location);
export const setupUrl = (where: Where, location: Location): string => at("setup", where, location);
export const signpostUrl = (where: Where, location: Location): string => at(null, where, location);

/** Where a workspace lives. */
export const tenantUrl = (slug: string, where: Where, location: Location): string =>
  at(slug, where, location);

/** The deployment's own door. */
export const operatorUrl = (where: Where, location: Location): string =>
  at("admin", where, location);

/**
 * ⚠️ THE HUB TRAVELS BETWEEN DOORS AS AN ADDRESS, WHICH IS WHAT MAKES IT ONE
 * SURFACE. A workspace is managed at its own origin — that is where its records
 * are and where its operations answer — so opening one from the account door is
 * a full page load that arrives with the hub ALREADY OPEN on that workspace,
 * rather than a screen that loads and then refuses every call it makes.
 */
export const hubAt = (origin: string, path: string): string => `${origin}${path}`;

/** Whether this door IS the given workspace — see `hubAt` and `Where.slug`. */
export const isHere = (slug: string, where: Where): boolean =>
  where.kind === "tenant" && where.slug === slug;

/**
 * ⚠️ THE ONE PLACE THAT DECIDES WHAT THE HUB IS FOR, GIVEN A DOOR. A pure
 * function, so it is a test rather than a click-through — and every kind is
 * answered, including the ones the Hub is not, because "we serve this door" and
 * "we have a screen for it" drifting apart is how a page comes to render nothing
 * at all.
 */
export type Face = "signpost" | "hub" | "create" | "centre" | "console" | "elsewhere";

export const faceFor = (kind: DoorKind): Face => {
  switch (kind) {
    case "signpost": return "signpost";
    case "account": return "hub";
    case "setup": return "create";
    /* ⚠️ A workspace's own address IS the centre — the shell, the five areas
       and the products inside it. */
    case "tenant": return "centre";
    /* ⚠️ The deployment's own door — the console, on the same shell. */
    case "operator": return "console";
    /* ⚠️ Served by this worker, not by this bundle. A screen is a device with
       its own pinned origin; saying so beats a blank page. */
    case "device":
    case "none": return "elsewhere";
  }
};
