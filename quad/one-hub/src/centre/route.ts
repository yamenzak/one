/**
 * WHERE IN THE CENTRE SOMEBODY IS — a pure read of the path.
 *
 * ⚠️ THE FIRST QUAD SURFACE THAT NEEDS A REAL ROUTER, AND IT IS STILL A PURE
 * FUNCTION FIRST. Five fixed areas, then the apps under `/<app>/…` — and every
 * path resolves to SOMETHING, because a path that resolves to nothing renders
 * a blank page, which is the same picture as a page that failed to load. An
 * address nobody recognises lands on Home, where the person can see where
 * they are.
 *
 * ⚠️ AN AREA SOMEBODY CANNOT REACH RESOLVES AWAY BEFORE IT RENDERS. People
 * needs `member:read` and Money needs `billing:read`; parsing them for a
 * customer would draw a screen whose every call the gate refuses.
 */

/** The five fixed areas (D10) — plus the inbox, which the crown opens and the
    nav never lists: it is about *what happened*, not *where you are going*. */
export type Area = "home" | "people" | "money" | "settings" | "trust" | "inbox";

export type Stop =
  | { readonly kind: "area"; readonly area: Area }
  | { readonly kind: "app"; readonly app: string; readonly route: string };

export const AREAS: readonly {
  readonly area: Area; readonly route: string; readonly label: string;
  /** Absent = everybody in the workspace, customers included. */
  readonly needs?: string;
}[] = [
  { area: "home", route: "/", label: "Home" },
  { area: "people", route: "/people", label: "People", needs: "member:read" },
  { area: "money", route: "/money", label: "Money", needs: "billing:read" },
  { area: "settings", route: "/settings", label: "Settings" },
  /* ⚠️ One word on the tab; the screen itself says "Data & Trust". Five labels
     share a phone's width, and a clipped tab reads as a broken one. */
  { area: "trust", route: "/trust", label: "Trust" },
];

export const areasFor = (platform: ReadonlySet<string>): typeof AREAS =>
  AREAS.filter((a) => !a.needs || platform.has(a.needs));

export function parseStop(
  path: string, apps: readonly string[], platform: ReadonlySet<string>,
): Stop {
  const clean = path.replace(/\/+$/, "") || "/";
  if (clean === "/inbox") return { kind: "area", area: "inbox" };
  const fixed = areasFor(platform).find((a) => a.route === clean);
  if (fixed) return { kind: "area", area: fixed.area };

  const [, head, ...rest] = clean.split("/");
  if (head && apps.includes(head)) {
    return { kind: "app", app: head, route: `/${rest.join("/")}` };
  }
  /* ⚠️ Never nothing — see the header. */
  return { kind: "area", area: "home" };
}

export const pathFor = (stop: Stop): string =>
  stop.kind === "area"
    ? (stop.area === "inbox" ? "/inbox" : AREAS.find((a) => a.area === stop.area)?.route ?? "/")
    : `/${stop.app}${stop.route === "/" ? "" : stop.route}`;
