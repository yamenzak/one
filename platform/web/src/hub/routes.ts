/**
 * WHERE YOU ARE IN THE ACCOUNT CENTRE, AS AN ADDRESS.
 *
 * ⚠️ EVERY SCREEN HAS ONE, AND THAT IS NOT A CONVENIENCE. `center.tsx` has said
 * from the day it was written that this is a route rather than a popup — a person
 * can link to it, land on it and reload it — and then the screens INSIDE it were
 * four pieces of component state. So somebody could link to the hub
 * and never to their own vault; a refusal that says "read this first" had nowhere
 * to send anybody; support could not say "open this address"; and the back button
 * left the whole surface instead of going up one level.
 *
 * ⚠️ IT IS A PARSER AND A PRINTER, NOT A ROUTER. This package carries no router
 * on purpose — an app brings its own, and a shared component that mounted one
 * would be a shared component that had to agree with three of them. What travels
 * is a value: an app parses its own location into `Where` and renders from it,
 * and the screens hand back a `Where` rather than performing a navigation.
 *
 * ⚠️ AN UNREADABLE PATH IS THE HOME, NEVER A BLANK SCREEN. A route is a string
 * somebody can type, an old link can carry and a redirect can mangle; parsing has
 * to be total, and the safe answer is the surface's own root.
 *
 * ⚠️ AND THE ACCOUNT ITSELF IS A PRODUCT SEGMENT LIKE ANY OTHER. Its `appId` is
 * the empty string — how the runtime says "this is the deployment" — which is not
 * something a path can carry, so it is spelled out here and nowhere else.
 */

/** The account's own segment, because an empty id cannot be a path. */
export const ACCOUNT_SEGMENT = "account";

export type Where =
  | { readonly at: "home" }
  /*
    ⚠️ THREE AREAS UNDER ONE ROOF, AND THEY ARE NOT THE SAME KIND OF THING. The
    ACCOUNT CENTRE is who you are — profile, sign-in, preferences, the vault, the
    legal record. The WORKSPACE HUB is what you belong to. The MARKETPLACE is what
    you may start, and it is the only one of the three that takes money.

    Kept as one flat list of settings pages, "new workspace" sat beside "change
    your language" — a purchase and a preference wearing the same row.
  */
  | { readonly at: "market" }
  /** One product's shelf: its plans, its trial, and the button that starts one. */
  | { readonly at: "shelf"; readonly product: string }
  | { readonly at: "credits" }
  | { readonly at: "details" }
  | { readonly at: "security" }
  | { readonly at: "preferences"; readonly part?: "appearance" | "reading" | "feedback" }
  | { readonly at: "vault" }
  | { readonly at: "legal" }
  /** One product's documents. `product` is an app id, or "" for the account. */
  | { readonly at: "product"; readonly product: string }
  | { readonly at: "receiving"; readonly product: string }
  /** One recipient's whole record, under the product whose data reaches them. */
  | { readonly at: "recipient"; readonly product: string; readonly recipient: string }
  | { readonly at: "document"; readonly product: string; readonly document: string }
  | { readonly at: "export" }
  | { readonly at: "close" };

const PARTS = ["appearance", "reading", "feedback"] as const;

/** ⚠️ Total. Anything it cannot read is the home. */
export function parseWhere(path: string): Where {
  const seg = path.split("/").filter(Boolean);
  const [one, two, three] = seg;
  if (!one) return { at: "home" };
  if (one === "details") return { at: "details" };
  if (one === "security") return { at: "security" };
  if (one === "vault") return { at: "vault" };
  if (one === "credits") return { at: "credits" };
  if (one === "market") return two ? { at: "shelf", product: two } : { at: "market" };
  if (one === "export") return { at: "export" };
  if (one === "close") return { at: "close" };
  if (one === "preferences") {
    const part = PARTS.find((p) => p === two);
    return part ? { at: "preferences", part } : { at: "preferences" };
  }
  if (one === "legal") {
    if (!two) return { at: "legal" };
    const product = two === ACCOUNT_SEGMENT ? "" : two;
    if (!three) return { at: "product", product };
    /*
      ⚠️ "who" IS RESERVED AND A DOCUMENT MAY NOT BE CALLED IT. A document id is
      an app's to choose, so one named `who` would resolve to the disclosure and
      be unreachable — which is a screen that exists and cannot be opened. It is
      refused at composition rather than handled here; see `legalProblems`.
    */
    if (three === "who") {
      const [, , , four] = seg;
      return four ? { at: "recipient", product, recipient: four } : { at: "receiving", product };
    }
    return { at: "document", product, document: three };
  }
  return { at: "home" };
}

/** ⚠️ The inverse, and `web/test/routes.test.ts` holds the pair to a round trip. */
export function pathOf(where: Where): string {
  const product = (id: string) => `legal/${id === "" ? ACCOUNT_SEGMENT : id}`;
  switch (where.at) {
    case "home": return "";
    case "shelf": return `market/${where.product}`;
    case "preferences": return where.part ? `preferences/${where.part}` : "preferences";
    case "product": return product(where.product);
    case "receiving": return `${product(where.product)}/who`;
    case "recipient": return `${product(where.product)}/who/${where.recipient}`;
    case "document": return `${product(where.product)}/${where.document}`;
    default: return where.at;
  }
}

/**
 * ⚠️ WHAT A STACK RECONCILES ON, AND `null` IS THE LEVEL'S ROOT. It is the path
 * rather than the screen's name because two products' pages are the same screen
 * at two addresses — keyed by name they would be reconciled as one element, and
 * the second would arrive holding the first's scroll position and form state.
 */
export const keyOf = (where: Where): string | null => pathOf(where) || null;

/**
 * ⚠️ THE LEVEL ABOVE, DERIVED. Every screen's way out is "up one", and a screen
 * that carried its own would be a screen that had to be told where it was
 * reached from — which is the thing `Stack` already refuses to let a screen know.
 */
export function upFrom(where: Where): Where {
  switch (where.at) {
    case "home": return { at: "home" };
    case "shelf": return { at: "market" };
    case "preferences": return where.part ? { at: "preferences" } : { at: "home" };
    case "product": return { at: "legal" };
    case "receiving": return { at: "product", product: where.product };
    case "recipient": return { at: "receiving", product: where.product };
    case "document": return { at: "product", product: where.product };
    default: return { at: "home" };
  }
}
