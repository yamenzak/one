/**
 * WHERE YOU ARE IN THE HUB, AS AN ADDRESS.
 *
 * ⚠️ EVERY SCREEN HAS ONE, AND THAT IS NOT A CONVENIENCE. The hub is a ROUTE
 * rather than a popup — a person can link to it, land on it and reload it — and
 * the moment the screens inside it are component state, somebody can link to
 * the hub and never to their own workspace, a refusal saying "read this first"
 * has nowhere to send anybody, support cannot say "open this address", and the
 * back button leaves the whole surface instead of going up one level.
 *
 * ⚠️ IT IS A PARSER AND A PRINTER, NOT A ROUTER. What travels is a value: the
 * page parses its own location into a `Where` and renders from it, and screens
 * hand a `Where` back rather than performing a navigation. That is what makes
 * the whole information architecture a table of tests with no DOM in sight.
 *
 * ⚠️ AN UNREADABLE PATH IS THE HOME, NEVER A BLANK SCREEN. A route is a string
 * somebody can type, an old link can carry and a redirect can mangle, so
 * parsing has to be TOTAL — and the safe answer is the surface's own root.
 *
 * ⚠️ AND `/hub` IS RESERVED ON EVERY DOOR. Under a workspace's own address the
 * paths belong to the product; this one prefix does not, so the hub can be
 * opened from anywhere without an app ever discovering that one of its screens
 * is unreachable.
 */

export const HUB = "/hub";

export type Where =
  | { readonly at: "home" }
  /*
    ⚠️ THREE KINDS OF PLACE, AND THEY ARE NOT THE SAME KIND OF THING. YOU is who
    you are — your details, how you sign in, what you have been told, what is
    held about you. WORKSPACES is what you belong to, across every product. The
    CONSOLE is the deployment itself, and almost nobody holds it.

    Kept as one flat list of settings, "start a workspace" sat beside "change
    your language" — a decision and a preference wearing the same row.
  */
  | { readonly at: "you" }
  /**
   * ⚠️ THE INBOX IS THE ACCOUNT'S, NOT A WORKSPACE'S. What a person has been
   * told follows them across every product they are in; filing it under one
   * workspace means visiting four places to find out whether anybody told you
   * anything.
   */
  | { readonly at: "inbox" }
  | { readonly at: "workspaces" }
  /** One workspace: what it includes, and the way into everything about it. */
  | { readonly at: "workspace"; readonly slug: string }
  | { readonly at: "people"; readonly slug: string }
  | { readonly at: "money"; readonly slug: string }
  | { readonly at: "settings"; readonly slug: string }
  | { readonly at: "trust"; readonly slug: string }
  /** What its AI features say on its behalf, where the product allows editing. */
  | { readonly at: "wording"; readonly slug: string }
  | { readonly at: "console" }
  | { readonly at: "tenants" }
  | { readonly at: "actions" }
  | { readonly at: "switches" }
  | { readonly at: "works" }
  | { readonly at: "ground" };

/** Every screen a workspace has, in the order its own screen lists them. */
export const OF_WORKSPACE = ["people", "money", "settings", "trust", "wording"] as const;
export const OF_CONSOLE = ["tenants", "actions", "switches", "works", "ground"] as const;

export type WorkspacePart = typeof OF_WORKSPACE[number];
type ConsolePart = typeof OF_CONSOLE[number];

/**
 * WHICH OF A WORKSPACE'S SCREENS THIS ROLE MAY OPEN.
 *
 * ⚠️ A ROW SOMEBODY CANNOT OPEN IS NOT DRAWN. The same rule the navigation and
 * the tool catalogue follow: a destination that answers 403 is a promise the
 * product does not keep, and nothing on the row tells the person which of the
 * two it is. Deciding it here rather than inside the screen means it is a table
 * of cases rather than a walk through four sign-ins.
 *
 * ⚠️ AND IT IS NOT THE ENFORCEMENT. Every operation behind these screens is
 * gated by the runtime; this decides what is worth OFFERING. A page that
 * enforced anything by hiding a row would be a page that could be reached with
 * a URL.
 */
export const partsFor = (role: string | null): readonly WorkspacePart[] => {
  const runs = role === "owner" || role === "manager";
  /* ⚠️ People is drawn for everybody: a customer may see who coaches them,
     and the screen itself decides what any of them can change. */
  return OF_WORKSPACE.filter((p) => runs || (p !== "money" && p !== "wording"));
};

const isWorkspacePart = (v: string): v is WorkspacePart =>
  (OF_WORKSPACE as readonly string[]).includes(v);
const isConsolePart = (v: string): v is ConsolePart =>
  (OF_CONSOLE as readonly string[]).includes(v);

/** Whether a path is the hub's at all — the page under it renders otherwise. */
export const inHub = (path: string): boolean =>
  path === HUB || path.startsWith(`${HUB}/`);

/**
 * ⚠️ TOTAL, AND THE SAFE ANSWER IS HOME. Anything this cannot read is the root
 * rather than nothing — see the header.
 */
export function parseWhere(path: string): Where {
  const rest = path.replace(/\/+$/, "").slice(HUB.length).replace(/^\//, "");
  if (!rest) return { at: "home" };
  const [head, ...tail] = rest.split("/");

  if (head === "you") return { at: "you" };
  if (head === "inbox") return { at: "inbox" };
  if (head === "workspaces") return { at: "workspaces" };

  if (head === "w") {
    const slug = tail[0];
    if (!slug) return { at: "workspaces" };
    const part = tail[1];
    if (part === undefined) return { at: "workspace", slug };
    return isWorkspacePart(part) ? { at: part, slug } : { at: "workspace", slug };
  }

  if (head === "console") {
    const part = tail[0];
    if (part === undefined) return { at: "console" };
    return isConsolePart(part) ? { at: part } : { at: "console" };
  }

  return { at: "home" };
}

export function pathOf(where: Where): string {
  switch (where.at) {
    case "home": return HUB;
    case "you": return `${HUB}/you`;
    case "inbox": return `${HUB}/inbox`;
    case "workspaces": return `${HUB}/workspaces`;
    case "workspace": return `${HUB}/w/${where.slug}`;
    case "console": return `${HUB}/console`;
    case "tenants": case "actions": case "switches": case "works": case "ground":
      return `${HUB}/console/${where.at}`;
    default: return `${HUB}/w/${where.slug}/${where.at}`;
  }
}

/**
 * WHERE LEAVING THIS SCREEN GOES.
 *
 * ⚠️ THE WAY OUT IS A PROPERTY OF THE SCREEN'S PLACE, NOT A CHOICE ITS AUTHOR
 * MAKES. `null` means this is the root of the surface and is DISMISSED — the
 * hub closes and returns somebody to what they were doing. Anything else is one
 * level up. Left to each screen, two get it right and the third goes home from
 * three levels in.
 */
export function above(where: Where): Where | null {
  switch (where.at) {
    case "home": return null;
    case "you": case "inbox": case "workspaces": case "console": return { at: "home" };
    case "workspace": return { at: "workspaces" };
    case "tenants": case "actions": case "switches": case "works": case "ground":
      return { at: "console" };
    default: return { at: "workspace", slug: where.slug };
  }
}

/** What the screen calls itself. One name, so the crown and the title agree. */
export const nameOf = (where: Where): string => {
  switch (where.at) {
    case "home": return "Hub";
    case "you": return "You";
    case "inbox": return "Inbox";
    case "workspaces": return "Workspaces";
    case "workspace": return "Workspace";
    case "people": return "People";
    case "money": return "Money";
    case "settings": return "Settings";
    case "trust": return "Data & Trust";
    case "wording": return "In your words";
    case "console": return "Operator";
    case "tenants": return "Tenants";
    case "actions": return "Actions";
    case "switches": return "Switches";
    case "works": return "Works";
    case "ground": return "Ground";
  }
};
