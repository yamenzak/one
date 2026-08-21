/**
 * WHERE YOU ARE IN THE SPACE, AS AN ADDRESS.
 *
 * ⚠️ EVERY SCREEN HAS ONE, AND THAT IS NOT A CONVENIENCE. The OneSpace is a ROUTE
 * rather than a popup — a person can link to it, land on it and reload it — and
 * the moment the screens inside it are component state, somebody can link to
 * OneSpace and never to their own workspace, a refusal saying "read this first"
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
 * ⚠️ AND `/space` IS RESERVED ON EVERY DOOR. Under a workspace's own address the
 * paths belong to the product; this one prefix does not, so OneSpace can be
 * opened from anywhere without an app ever discovering that one of its screens
 * is unreachable.
 */

import type { Sky } from "@engine/design";
import { sentence } from "@engine/design";
/* ⚠️ THE KERNEL'S OWN LANE LIST, ASKED. A second copy here would be right on the
   day it was written and would silently 404 the seventh lane. */
import { LANES, type Lane } from "@engine/kernel";

const isLane = (v: string): v is Lane => (LANES as readonly string[]).includes(v);

export const SPACE = "/space";

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
  /**
   * ⚠️ HOW YOU ARE TOLD IS YOURS, NOT A WORKSPACE'S — and it used to share a
   * screen with the workspace's CEILING, which is a different operation done by
   * a different person for a different reason (DESIGN.md §3). Narrowing your own
   * email is a preference; deciding what everybody here may be sent is
   * administration.
   */
  | { readonly at: "told" }
  /**
   * ⚠️ YOUR DATA: THE COPY AND THE DELETION, ON ONE SCREEN AND UNDER YOU. Both
   * are about the person rather than any workspace — the walk behind them
   * crosses every workspace they are in — and both stay reachable while the
   * acceptance wall is holding everything else, which is what makes that wall a
   * wall rather than a hostage.
   */
  | { readonly at: "data" }
  /**
   * ⚠️ YOUR OWN PREFERENCES, ACROSS EVERY PRODUCT — the same split as `told`
   * against `notices`, one screen over. A setting's LEVEL is an authority
   * (DESIGN.md §3's first question): what a workspace is set to is decided by
   * whoever runs it and applies to everybody, and what you prefer is yours and
   * follows you into every workspace you are in. Those were rendered one under
   * the other on the workspace's own settings screen, which put a preference
   * inside an administration surface and hid it from anybody without
   * `tenant:manage`.
   *
   * ⚠️ AND IT CARRIES NO SLUG, WHICH IS THE POINT. A person's own settings are
   * not a workspace's, so they are not filed under one.
   */
  | { readonly at: "prefs"; readonly app?: string; readonly area?: string }
  /** ⚠️ Not a product's setting — how THIS PERSON reads every product. */
  | { readonly at: "formats" }
  /* ⚠️ THE DEVICE'S OWN, WHICH IS WHY IT IS BESIDE `formats` AND NOT UNDER IT.
     Both are about how something READS rather than what it is; the difference is
     that a format follows the person into every workspace and a theme stays on
     the screen it was chosen on. */
  | { readonly at: "looks" }
  | { readonly at: "agreed" }
  | { readonly at: "workspaces" }
  /** One workspace: what it includes, and the way into everything about it. */
  | { readonly at: "workspace"; readonly slug: string }
  | { readonly at: "people"; readonly slug: string }
  | { readonly at: "money"; readonly slug: string }
  /** What this workspace SELLS — its own catalogue, not what it pays us. */
  | { readonly at: "packages"; readonly slug: string }
  /**
   * WHICH PRODUCTS THIS WORKSPACE HAS SWITCHED ON.
   *
   * ⚠️ `apps`, NOT `products`, AND THE NEIGHBOUR IS WHY. `packages` one line up
   * is what this workspace SELLS to its own customers; this is what it BOUGHT
   * from the deployment. Two rows a word apart, meaning opposite sides of the
   * same workspace's trade, is a menu somebody has to open to tell apart.
   */
  | { readonly at: "apps"; readonly slug: string }
  /**
   * ⚠️ ONE PRODUCT'S PRICE LIST. A bill is read monthly and a plan is changed
   * once a year, so the catalogue is a screen the bill's own row opens rather
   * than four catalogues stacked under a total (DESIGN.md §3).
   */
  /* ⚠️ NO APP: ONE MEMBERSHIP, SO ONE CATALOGUE. The address carried a product
     while plans belonged to products; a link with one in it now names a
     dimension the screen no longer has. */
  | { readonly at: "plan"; readonly slug: string }
  /**
   * ⚠️ PER PRODUCT, AND `app` IS HOW SOMEBODY DESCENDS INTO ONE. Without it the
   * screen listed EVERY product's settings in one column with the product's name
   * repeated as a heading — fine with one product and a report with six
   * (DESIGN.md §3). With one product there is nothing to choose between, so the
   * list stands down and its settings are the screen.
   */
  | { readonly at: "settings"; readonly slug: string; readonly app?: string; readonly area?: string }
  | { readonly at: "trust"; readonly slug: string }
  /** ⚠️ THE WORKSPACE'S OWN IDENTITY, one brand across every app under it (D22). */
  | { readonly at: "brand"; readonly slug: string }
  /** What everybody in this workspace may be sent. The ceiling, not a preference. */
  | { readonly at: "notices"; readonly slug: string }
  /** What its AI features say on its behalf, where the product allows editing. */
  | { readonly at: "wording"; readonly slug: string; readonly app?: string }
  /**
   * ⚠️ WHAT THIS WORKSPACE HAS AGREED TO TRY EARLY. A flag declaring
   * `setBy: "tenant"` says the workspace may decide for itself, and there was
   * nowhere for it to say so — the algebra, the store and the operator's view of
   * it all existed while the half that names the decision-maker did nothing.
   */
  | { readonly at: "trying"; readonly slug: string; readonly app?: string }
  /**
   * ⚠️ ONE FEATURE THIS WORKSPACE HAS, AND WHO IN IT HAS IT. The list can say
   * "on, and two people differ"; only this can say WHICH two, and undoing a
   * decision made three weeks ago is impossible without their names.
   */
  | { readonly at: "tried"; readonly slug: string; readonly id: string }
  | { readonly at: "console" }
  | { readonly at: "tenants" }
  /**
   * EVERYBODY WHO HAS SIGNED IN HERE.
   *
   * ⚠️ THE CONSOLE COULD SEE EVERY WORKSPACE AND NOBODY IN ONE. A person is the
   * subject of half the support a deployment ever does — who are they, where do
   * they belong, what were they promised — and answering any of it meant
   * knowing a workspace first and reading its roster.
   */
  | { readonly at: "accounts" }
  /**
   * ⚠️ ONE WORKSPACE, FROM THE OPERATOR'S SIDE. The list answered "who is here"
   * and then every other question about a workspace was a tray hanging off a
   * table cell — which is a screen's worth of facts squeezed into a popover, and
   * unusable the moment a customer has six products across two branches
   * (DESIGN.md §3).
   */
  | { readonly at: "tenant"; readonly id: string }
  /**
   * ONE PERSON, WHICH IS THE SUBJECT THE CONSOLE COULD NOT SEE.
   *
   * ⚠️ IT IS ADDRESSED BY EMAIL AND NOT BY ID, and that is not a shortcut. A
   * gift is made to an ADDRESS before there is an account to point at — a demo,
   * a friend, somebody who paid cash last week — so the screen has to open on
   * somebody who does not exist here yet, and an id-shaped address could not
   * name them.
   */
  | { readonly at: "account"; readonly email: string }
  /**
   * ⚠️ WHAT THIS DEPLOYMENT SELLS, WHICH IS NOT WHAT ITS CODE DECLARES. The
   * declaration decides which plans exist and which keys each one prices; the
   * numbers over it are somebody's edit, and without a screen they are values
   * only a deploy can change — so a price change is a code push, which is how a
   * catalogue comes to be a year out of date.
   */
  | { readonly at: "catalogue" }
  /**
   * ⚠️ AI IS AN AREA NOW, NOT A SCREEN, AND THAT IS WHAT WAS WRONG WITH IT. One
   * page carried four subjects — a deployment-wide catalogue fault, a product
   * picker, a per-action binding and a prompt editor — stacked, because each had
   * arrived one at a time. They are four questions asked by different people on
   * different days, so they are four destinations (DESIGN.md §3).
   */
  | { readonly at: "ai" }
  /**
   * Which models this deployment sells, at what margin.
   *
   * ⚠️ AND A LANE IS AN ADDRESS, BECAUSE A CATALOGUE IS SIXTY ROWS. Flat, every
   * model in every lane was one scroll — and the question somebody opens this
   * with is always about a LANE ("does anything answer text, and which one wins")
   * rather than about the catalogue. Six rows that descend answer it in a glance;
   * the list answers it by being read (DESIGN.md §3, "descend, don't cram").
   */
  | { readonly at: "models"; readonly lane?: string }
  /** Per product: what answers each action, and whose words it uses. */
  | { readonly at: "actions"; readonly app?: string }
  /** The gateway itself: where calls go, and whether the margin holds. */
  | { readonly at: "gateway" }
  /** What is findable: what is indexed, what is waiting, what the index refused. */
  | { readonly at: "finding" }
  | { readonly at: "switches" }
  /**
   * ⚠️ SEPARATE FROM `switches`, AND THE SPLIT IS NOT TIDINESS. Maintenance is
   * about US — an outage somebody declared, withholding the whole product from
   * everybody at once — and a flag is a product decision about one feature. They
   * shared a screen, so the switch that shuts every door sat above a list of
   * things being tried, at the same weight, reachable by the same accident.
   */
  | { readonly at: "maintenance" }
  /**
   * ⚠️ ONE FLAG, ON ITS OWN PAGE, BECAUSE A SWITCH HAS THREE STATES AND A LIST OF
   * EXCEPTIONS. "Following its declaration", "on for everybody" and "off for
   * everybody" are not a toggle — and the middle one is where a trial lives,
   * because the deployment's `off` is absorbing. Crammed into a row, the third
   * state is unreachable and no workspace can ever be given the feature early.
   */
  | { readonly at: "switch"; readonly id: string }
  | { readonly at: "works" }
  /**
   * ⚠️ WHERE THE WORKSPACES ARE, AND WHO IS MOVING BETWEEN. Capacity and a move
   * in flight are one subject read two ways — a shard is full BECAUSE of who is
   * on it, and a move is the only thing that changes that — so a bar and the
   * copy currently running under it belong on the same page.
   *
   * ⚠️ IT WAS `ground`, AND THE NAME NAMED NOTHING. `one-space/src/Ground.tsx`
   * is the design test ground; `console/Ground.tsx` was the shard map, and the
   * two are unrelated. A grep for either found both.
   */
  | { readonly at: "shards" }
  /**
   * ⚠️ WHAT EXISTS, AND WHAT DELIBERATELY DOES NOT. The inventory and the
   * withheld list are the same subject from both sides: a need dropped because
   * its store cannot be held to a jurisdiction is a store that will never be in
   * the list above it, and read apart it is a product that mysteriously does
   * less in Europe.
   */
  | { readonly at: "stores" }
  /**
   * ⚠️ AND WHAT WOULD CHANGE, ON ITS OWN PAGE, BECAUSE IT IS THE ONE THAT ACTS.
   * It was a fourth card under the inventory — a plan with a primary button in
   * it, read after two lists of things that are simply true. Reading what a pass
   * would destroy has to cost nothing and be findable on purpose, which is what
   * an address gives it.
   */
  | { readonly at: "pass" }
  /**
   * ⚠️ WHAT THE DEPLOYMENT WAS TOLD — the sender it mails from, the account it
   * charges through. Without a screen these are values only a deploy can change,
   * which makes rotating a key a code push and a key that waits for a code push
   * a key that stays live after it should have stopped.
   */
  | { readonly at: "keys" }
  /**
   * ⚠️ WHETHER THIS DEPLOYMENT CAN REACH A PHONE. Push needs a keypair, the
   * keypair is generated rather than pasted, and without a screen the whole
   * capability is one nothing on the deployment can switch on — the shape this
   * repository keeps finding, one screen short of shipped.
   */
  | { readonly at: "telling" };

/** Every screen a workspace has, in the order its own screen lists them. */
export const OF_WORKSPACE = ["people", "money", "packages", "apps", "settings", "brand", "notices", "wording", "trying", "trust"] as const;

/**
 * EVERY SCREEN THAT IS ANSWERED BY `WorkspacePart`, DERIVED.
 *
 * ⚠️ THIS EXISTS BECAUSE THE LIST WAS WRITTEN OUT A THIRD TIME AND LOST ONE.
 * `OF_WORKSPACE` had `brand`, `Part.tsx` had a `case "brand"`, the workspace
 * screen linked to it and the address parsed — and the switch that chooses
 * `WorkspacePart` named seven of the eight. So `/space/w/<slug>/brand` matched
 * no case, the switch returned nothing, and the screen was blank: no error, no
 * failing test, and a route every guard agreed existed.
 *
 * ⚠️ `plan` IS HERE AND NOT IN `OF_WORKSPACE`, and the difference is real: it is
 * answered by the same component but it is not a ROW on the workspace screen —
 * it is reached from Money, per product. One list is what a workspace offers;
 * this is what the dispatcher must handle, and they are not the same question.
 */
export const OF_WORKSPACE_SCREEN = [...OF_WORKSPACE, "plan", "tried"] as const;

export type WorkspaceScreen = typeof OF_WORKSPACE_SCREEN[number];

/**
 * ⚠️ A PREDICATE OVER THE WHOLE `Where`, not over `where.at`, so the caller is
 * narrowed to the variants that carry a `slug`. Narrowing the string alone
 * leaves the dispatcher reaching for a field TypeScript cannot promise is there.
 */
export const atWorkspaceScreen = (
  where: Where,
): where is Extract<Where, { readonly at: WorkspaceScreen }> =>
  (OF_WORKSPACE_SCREEN as readonly string[]).includes(where.at);

/**
 * ⚠️ THE SAME QUESTION FOR THE OPERATOR'S SIDE, and it had the same hole one
 * screen over: the dispatch named five console parts and the stores screen was
 * the sixth, so the screen that reports what the deployment stands on was built,
 * routed, registered — and drew nothing at its own address.
 */
export const atConsoleScreen = (
  where: Where,
): where is Extract<Where, { readonly at: ConsolePart | AiPart }> =>
  OPERATOR_PARTS.includes(where.at);

/**
 * ⚠️ WHAT SOMEBODY COMES BACK TO, AND WHAT THEY SET UP ONCE. Six rows in one
 * card is a menu with no shape: the roster somebody opens weekly sits in the
 * same run as the sub-processor list they will read once, and the frequent one
 * loses its prominence to the rare one (DESIGN.md §3). Two cards, and the gap
 * between them is the whole of the explanation.
 */
export const OFTEN: readonly WorkspacePart[] = ["people", "money"];
export const OF_CONSOLE = ["tenants", "accounts", "catalogue", "ai", "keys", "switches", "maintenance", "telling", "works", "shards", "stores", "pass"] as const;

/**
 * ⚠️ AND WHAT IS INSIDE THE AI AREA. Listed here rather than inside the screen
 * for the reason every other list in this file is: an address is a fact about
 * the address, and a screen keeping its own copy is a second answer to "what is
 * behind this" the day one of them changes.
 */
export const OF_AI = ["models", "actions", "gateway", "finding"] as const;
export type AiPart = typeof OF_AI[number];

/**
 * ⚠️ EVERY ADDRESS ON THE OPERATOR'S SIDE, TOP LEVEL AND INSIDE AN AREA, IN ONE
 * LIST — because two functions were asking that question and only one of them
 * had been taught about areas. `atConsoleScreen` knew the AI sub-pages were the
 * operator's; `isConsole` did not, and `isConsole` is what picks the MATERIAL.
 * So Models, Actions and Gateway drew a WORKSPACE's ground under a deployment's
 * screens, and the AI index above them drew the operator's — the seam was
 * visible on every trip into the area and nothing failed.
 *
 * ⚠️ AND THE COMMENT SAYING SO WAS ALREADY THERE, one function down. The fix had
 * been made once, in the place that was noticed, and the second caller went on
 * answering the old way. Two derivations of one question is the fault; a shared
 * list is the fix.
 */
const OPERATOR_PARTS: readonly string[] = [...OF_CONSOLE, ...OF_AI];

export type WorkspacePart = typeof OF_WORKSPACE[number];
export type ConsolePart = typeof OF_CONSOLE[number];

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
  /* ⚠️ `brand` is here because it is what a business's own customers see — a
     staff member changing the colour on every screen in the workspace is not a
     staff decision. */
  const OWNED: readonly WorkspacePart[] = ["money", "packages", "apps", "wording", "trying", "notices", "brand"];
  return OF_WORKSPACE.filter((p) => runs || !OWNED.includes(p));
};

const isWorkspacePart = (v: string): v is WorkspacePart =>
  (OF_WORKSPACE as readonly string[]).includes(v);
const isConsolePart = (v: string): v is ConsolePart =>
  (OF_CONSOLE as readonly string[]).includes(v);

const isAiPart = (v: string): v is AiPart => (OF_AI as readonly string[]).includes(v);

/**
 * ⚠️ WHETHER AN ADDRESS IS THE OPERATOR'S SIDE, DERIVED FROM `OF_CONSOLE` RATHER
 * THAN LISTED. A hand-written list beside the one that already exists is a list
 * that goes stale the day a console screen is added — silently, because the new
 * screen simply reads as somebody's workspace.
 */
export const isConsole = (where: Where): boolean =>
  where.at === "console" || where.at === "tenant" || where.at === "account"
  || OPERATOR_PARTS.includes(where.at);

/** Whether a path is OneSpace's at all — the page under it renders otherwise. */
export const inSpace = (path: string): boolean =>
  path === SPACE || path.startsWith(`${SPACE}/`);

/**
 * ⚠️ TOTAL, AND THE SAFE ANSWER IS HOME. Anything this cannot read is the root
 * rather than nothing — see the header.
 */
export function parseWhere(path: string): Where {
  const rest = path.replace(/\/+$/, "").slice(SPACE.length).replace(/^\//, "");
  if (!rest) return { at: "home" };
  const [head, ...tail] = rest.split("/");

  if (head === "you") return { at: "you" };
  if (head === "inbox") return { at: "inbox" };
  if (head === "told") return { at: "told" };
  if (head === "data") return { at: "data" };
  if (head === "formats") return { at: "formats" };
  if (head === "looks") return { at: "looks" };
  if (head === "agreed") return { at: "agreed" };
  if (head === "prefs") {
    const [app, area] = tail;
    return app ? (area ? { at: "prefs", app, area } : { at: "prefs", app }) : { at: "prefs" };
  }
  if (head === "workspaces") return { at: "workspaces" };

  if (head === "w") {
    const slug = tail[0];
    if (!slug) return { at: "workspaces" };
    const part = tail[1];
    if (part === undefined) return { at: "workspace", slug };
    /* ⚠️ Not in `OF_WORKSPACE`: it is reached from Money's rows, never from the
       workspace's own menu, so it is an address without being a destination. */
    if (part === "plan") {
      /* ⚠️ AND A TRAILING PRODUCT IS IGNORED RATHER THAN 404ING. Every link
         anybody bookmarked before the membership became one carries one, and
         the screen it wants is exactly this one. */
      return { at: "plan", slug };
    }
    /* ⚠️ ABOVE `isWorkspacePart`, LIKE `plan`, AND FOR THE SAME REASON. It is
       answered by the workspace dispatcher but it is not a ROW on the workspace
       screen — it is reached from "Try things early", per feature. Below the
       guard it would never parse, and the address would silently resolve to the
       workspace instead. */
    if (part === "tried" && tail[2]) return { at: "tried", slug, id: tail[2] };
    if (!isWorkspacePart(part)) return { at: "workspace", slug };
    /* ⚠️ A THIRD SEGMENT IS THE PRODUCT, on the two screens that have one per
       product. Anywhere else it is noise and the screen is the answer. */
    const app = tail[2];
    if (app && (part === "wording" || part === "trying")) return { at: part, slug, app };
    /* ⚠️ A FOURTH SEGMENT IS THE PAGE. Settings descend — a product has areas
       and an area is a page — and the area has to be in the address or going
       back from one lands outside the whole surface. */
    if (app && part === "settings") {
      const area = tail[3];
      return area ? { at: part, slug, app, area } : { at: part, slug, app };
    }
    return { at: part, slug };
  }

  if (head === "console") {
    const part = tail[0];
    if (part === undefined) return { at: "console" };
    if (!isConsolePart(part)) return { at: "console" };
    if (part === "tenants" && tail[1]) return { at: "tenant", id: tail[1] };
    /* ⚠️ THE ADDRESS IS THE SEGMENT, DECODED. An email in a path is percent-
       encoded by every browser that writes one, and a screen handed `a%40b.com`
       would look up an account nobody has. */
    if (part === "accounts" && tail[1]) {
      return { at: "account", email: decodeURIComponent(tail[1]) };
    }
    if (part === "switches" && tail[1]) return { at: "switch", id: tail[1] };
    /*
      ⚠️ ONE AREA NESTS, AND IT NESTS IN THE ADDRESS RATHER THAN IN A SCREEN.
      `/console/ai` is the index and `/console/ai/models` is one of its
      destinations — so a sub-page is a real address somebody can bookmark, land
      on, and go back from, which is what makes the crown's back arrow mean
      "up to AI" rather than "out of the console".
    */
    if (part === "ai" && tail[1]) {
      const inner = tail[1];
      if (!isAiPart(inner)) return { at: "ai" };
      if (inner === "actions") return tail[2] ? { at: inner, app: tail[2] } : { at: inner };
      /* ⚠️ A LANE IS THE SEGMENT UNDER `models`, and an unknown one is the
         index rather than a 404 — see the header: parsing is TOTAL. */
      if (inner === "models" && tail[2]) {
        return isLane(tail[2]) ? { at: inner, lane: tail[2] } : { at: inner };
      }
      return { at: inner };
    }
    return { at: part };
  }

  return { at: "home" };
}

export function pathOf(where: Where): string {
  switch (where.at) {
    case "home": return SPACE;
    case "you": return `${SPACE}/you`;
    case "inbox": return `${SPACE}/inbox`;
    case "told": return `${SPACE}/told`;
    case "data": return `${SPACE}/data`;
    case "formats": return `${SPACE}/formats`;
    case "looks": return `${SPACE}/looks`;
    case "agreed": return `${SPACE}/agreed`;
    case "prefs":
      return `${SPACE}/prefs${where.app ? `/${where.app}` : ""}${where.app && where.area ? `/${where.area}` : ""}`;
    case "workspaces": return `${SPACE}/workspaces`;
    case "workspace": return `${SPACE}/w/${where.slug}`;
    case "console": return `${SPACE}/console`;
    case "actions": return `${SPACE}/console/ai/actions${where.app ? `/${where.app}` : ""}`;
    case "models":
      return `${SPACE}/console/ai/models${where.lane ? `/${where.lane}` : ""}`;
    case "gateway": case "finding": return `${SPACE}/console/ai/${where.at}`;
    case "tenant": return `${SPACE}/console/tenants/${where.id}`;
    case "account": return `${SPACE}/console/accounts/${encodeURIComponent(where.email)}`;
    case "switch": return `${SPACE}/console/switches/${where.id}`;
    case "plan": return `${SPACE}/w/${where.slug}/plan`;
    /* ⚠️ THE PAGE IS IN THE ADDRESS TOO. Settings descend, and an area that only
       lived in the parser is one somebody can reach and never link to — and
       going back from it would leave the whole surface. */
    case "settings":
      return `${SPACE}/w/${where.slug}/settings${where.app ? `/${where.app}` : ""}${
        where.app && where.area ? `/${where.area}` : ""}`;
    case "wording":
      return `${SPACE}/w/${where.slug}/wording${where.app ? `/${where.app}` : ""}`;
    case "trying":
      return `${SPACE}/w/${where.slug}/trying${where.app ? `/${where.app}` : ""}`;
    case "tried": return `${SPACE}/w/${where.slug}/tried/${where.id}`;
    /*
      ⚠️ DECIDED BY SHAPE, NEVER BY A SECOND LIST. Seven console parts were
      written out here beside the `OF_CONSOLE` they came from — so the eighth
      fell through to the workspace arm and addressed itself as
      `/w/undefined/catalogue`, which resolves to a screen and renders nothing.
      A workspace screen carries a slug and a console screen does not, and that
      is a fact about the address rather than a list somebody keeps.
    */
    default:
      return "slug" in where
        ? `${SPACE}/w/${where.slug}/${where.at}`
        : `${SPACE}/console/${where.at}`;
  }
}

/**
 * WHERE LEAVING THIS SCREEN GOES.
 *
 * ⚠️ THE WAY OUT IS A PROPERTY OF THE SCREEN'S PLACE, NOT A CHOICE ITS AUTHOR
 * MAKES. `null` means this is the root of the surface and is DISMISSED — the
 * OneSpace closes and returns somebody to what they were doing. Anything else is one
 * level up. Left to each screen, two get it right and the third goes home from
 * three levels in.
 */
export function above(where: Where): Where | null {
  switch (where.at) {
    case "home": return null;
    case "you": case "inbox": case "workspaces": case "console": return { at: "home" };
    case "formats": return { at: "you" };
    case "looks": return { at: "you" };
    case "agreed": return { at: "you" };
    /* ⚠️ How you are told is a detail of YOU, so leaving it goes back there
       rather than to the root — the crown's arrow has to agree with how
       somebody got here. */
    case "told": case "data": return { at: "you" };
    case "prefs":
      return where.area ? { at: "prefs", app: where.app }
        : where.app ? { at: "prefs" } : { at: "you" };
    case "workspace": return { at: "workspaces" };
    /*
      ⚠️ AN AREA'S SUB-PAGE GOES UP TO ITS AREA, NOT PAST IT. Every AI screen
      answered `console`, so the arrow in the crown skipped the page somebody had
      just come through — three rows deep in, one press all the way out. The
      `default` below sends anything unrecognised to the console, which is right
      for a top-level part and wrong for everything inside one, so an area has to
      name its own children.
    */
    /* ⚠️ A LANE GOES UP TO THE CATALOGUE, not past it to the area. */
    case "models": return where.lane ? { at: "models" } : { at: "ai" };
    case "gateway": case "finding": return { at: "ai" };
    case "actions": return where.app ? { at: "actions" } : { at: "ai" };
    case "tenant": return { at: "tenants" };
    case "account": return { at: "accounts" };
    case "switch": return { at: "switches" };
    case "plan": return { at: "money", slug: where.slug };
    case "settings":
      return where.area ? { at: "settings", slug: where.slug, app: where.app }
        : where.app ? { at: "settings", slug: where.slug }
          : { at: "workspace", slug: where.slug };
    case "wording": case "trying":
      return where.app ? { at: where.at, slug: where.slug } : { at: "workspace", slug: where.slug };
    case "tried": return { at: "trying", slug: where.slug };
    /* ⚠️ THE SAME SHAPE TEST AS `pathOf`, and for the same reason — a console
       screen with no slug went "up" to a workspace that does not exist. */
    default:
      return "slug" in where ? { at: "workspace", slug: where.slug } : { at: "console" };
  }
}

/** What the screen calls itself. One name, so the crown and the title agree. */
export const nameOf = (where: Where): string => {
  switch (where.at) {
    case "home": return "OneSpace";
    case "you": return "You";
    case "inbox": return "Inbox";
    case "told": return "How you are told";
    case "data": return "Your data";
    case "formats": return "Dates and numbers";
    case "looks": return "Look and motion";
    case "agreed": return "What you agreed to";
    case "prefs": return "Your preferences";
    case "workspaces": return "Workspaces";
    case "workspace": return "Workspace";
    case "people": return "People";
    case "money": return "Money";
    case "packages": return "Packages";
    case "apps": return "Apps";
    case "plan": return "Plans";
    case "settings": return "Settings";
    case "notices": return "What everybody is told";
    case "trust": return "Data & Trust";
    case "brand": return "Brand";
    case "wording": return "In your words";
    case "trying": return "Try things early";
    /* ⚠️ The feature names itself — this function holds no manifest. */
    case "tried": return "Who has this";
    case "console": return "Operator";
    /*
      ⚠️ THE CONSOLE MAY USE A TECHNICAL WORD AND MAY NOT USE A DIFFERENT WORD
      FOR THE SAME THING. This said "Tenants" while every other surface in the
      product — the account centre, the switcher, the shard meter — said
      workspaces, so the one screen an operator opens to find a customer was
      filed under a noun that appears nowhere else they look.

      ⚠️ AND FOUR OF THESE WERE NOUNS NOBODY COULD PLACE. "Works", "Ground" and
      "Footing" are three words for three unrelated screens and no two of them
      tell you which is which; a nine-row menu of one-word labels is nine
      guesses. What each one now says is what is behind it.
    */
    case "tenants": return "Workspaces";
    /* ⚠️ "Accounts", NOT "People". The workspace centre owns People — its own
       roster — and two of that word in one address grammar is the collision
       every naming rule here exists to prevent. `account` is already the word
       for a person's own record everywhere else in this codebase. */
    case "accounts": return "Accounts";
    case "account": return "Somebody";
    case "catalogue": return "Price list";
    case "tenant": return "Workspace";
    case "ai": return "AI";
    /* ⚠️ THE LANE IS SAID, NOT PRINTED. `text` is a key in a closed set and
       "Text" is the word for it — DESIGN.md §1.9. */
    case "models": return where.lane ? sentence(where.lane) : "Models";
    case "actions": return "Actions";
    case "gateway": return "Gateway";
    case "finding": return "Finding things";
    case "switches": return "Switches";
    case "maintenance": return "Maintenance";
    /* ⚠️ The flag's own label is not here — it is declared by the app, and this
       function has no manifest. The screen names itself; see `Switch.tsx`. */
    case "switch": return "Switch";
    case "works": return "Nightly work";
    case "shards": return "Shards";
    case "telling": return "Push notifications";
    /* ⚠️ WHAT THEY ARE, NOT WHAT THEY ARE FOR. "What it runs on" was one screen
       holding four subjects, and the title had to be vague enough to cover all
       of them — which is the tell. */
    case "stores": return "Stores";
    case "pass": return "The next pass";
    case "keys": return "Keys";
  }
};

/* ---------------------------------------------------------------- material --- */

/**
 * WHICH MATERIAL AN ADDRESS STANDS ON, AND IT IS DECIDED HERE ONLY.
 *
 * ⚠️ THIS LIVED IN `OneSpace.tsx` AND MOVED, because it is a fact about the
 * ADDRESS like every other function in this file — the name, the path, the way
 * back — and a card that wants its page's material had to either import the
 * router or type a family into itself. `scene.test.mjs` refuses the second, and
 * it is right to: one surface naming `glow` by hand is how the door into a
 * workspace came to be the single place that workspace's world was missing.
 *
 * ⚠️ THE OPERATOR'S SIDE IS RULED, NOT WOVEN. It is about a deployment rather
 * than a business, and the material says so before a word is read.
 *
 * ⚠️ AND THE RECORD OF WHAT SOMEBODY SIGNED IS GLASS. It is the one destination
 * in the account centre — everything else here is a menu or a control — and
 * `tint` is the only family that brings a hue, which is what makes the card
 * offering it read as a place rather than as another row with a picture on it.
 */
export const groundOf = (where: Where): Sky =>
  isConsole(where) ? "etch" : where.at === "agreed" ? "tint" : "cloth";

/**
 * ⚠️ AND WHICH ONE OF THE FAMILY, FROM THE ADDRESS. `silk`, `linen` and `wire`
 * were three hand-tuned settings of one generator, which is what a seed is — so
 * OneSpace's materials are two families now and every address inside them has a
 * ground of its own. Nobody tunes a fourth.
 */
export const seedOf = (where: Where): string => `space|${where.at}`;
