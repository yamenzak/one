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
}

/** ⚠️ The port travels with the address, or every hop in development is a 404. */
const port = (location: Location): string => (location.port ? `:${location.port}` : "");

const at = (label: string | null, where: Where, location: Location): string =>
  `${location.protocol}//${label ? `${label}.` : ""}${where.root}${port(location)}`;

export const accountUrl = (where: Where, location: Location): string => at("id", where, location);
export const setupUrl = (where: Where, location: Location): string => at("setup", where, location);
export const signpostUrl = (where: Where, location: Location): string => at(null, where, location);

/** Where a workspace lives. */
export const tenantUrl = (slug: string, where: Where, location: Location): string =>
  at(slug, where, location);

/**
 * ⚠️ THE ONE PLACE THAT DECIDES WHAT THE HUB IS FOR, GIVEN A DOOR. A pure
 * function, so it is a test rather than a click-through — and every kind is
 * answered, including the ones the Hub is not, because "we serve this door" and
 * "we have a screen for it" drifting apart is how a page comes to render nothing
 * at all.
 */
export type Face = "signpost" | "hub" | "create" | "centre" | "elsewhere";

export const faceFor = (kind: DoorKind): Face => {
  switch (kind) {
    case "signpost": return "signpost";
    case "account": return "hub";
    case "setup": return "create";
    /* ⚠️ A workspace's own address IS the centre — the shell, the five areas
       and the products inside it. */
    case "tenant": return "centre";
    /* ⚠️ Served by this worker, not by this bundle. The console and the device
       door are their own surfaces; saying so beats a blank page. */
    case "operator":
    case "device":
    case "none": return "elsewhere";
  }
};
