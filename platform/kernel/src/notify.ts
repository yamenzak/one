/**
 * THE INBOX — what a product tells somebody, and where.
 *
 * Layer 2. Imports primitives and collection.
 *
 * ⚠️ THE ALGEBRA IS ROLE × CATEGORY, NOT TYPE × PERSON. A per-type preference
 * screen is a list nobody reads and nobody maintains: every new notification
 * arrives switched to whatever the default is, and the person who carefully
 * turned eleven things off has a twelfth they never asked for. Categories are
 * few, stable, and mean something to the reader — "money", "somebody did
 * something", "we need you to act".
 *
 * ⚠️ AND A NOTIFICATION IS DECLARED, NEVER ASSEMBLED AT THE CALL SITE. A
 * dispatch that carries its own title and its own link is one that cannot be
 * translated, cannot be checked against a route, and renders as an anonymous
 * bell the day somebody renames the type.
 */

import type { CollectionSpec } from "./collection.js";
import type { Tone } from "./primitives.js";

/* ------------------------------------------------------------- the where --- */

/**
 * ⚠️ A LINK NAMES A DECLARED COLLECTION, so a dead one cannot be written down.
 *
 * A free-form path is the thing that rots: four notification types in a shipping
 * product pointed at `/screens`, which was not a route, and one at `/sources`,
 * whose route was `/feeds`. They were wrong for three stages because nothing
 * rendered a notification, and an integration test was asserting the broken path
 * — pinning the bug rather than the behaviour.
 *
 * Here the destination is a collection the manifest already declares and, for a
 * row, the id the dispatch carries. There is no string to get wrong.
 */
export type Destination =
  | { readonly to: "collection"; readonly collection: string }
  | { readonly to: "row"; readonly collection: string }
  /** The inbox itself — for anything with nowhere better to go. */
  | { readonly to: "inbox" };

/* -------------------------------------------------------------- the what --- */

/**
 * ⚠️ CATEGORIES ARE CLOSED AND FEW, and they are the unit a person actually has
 * an opinion about. Adding one is a decision about the product's voice; adding a
 * TYPE is routine, and must not silently create a preference nobody chose.
 */
export type Category =
  /** Money: a charge, a refund, a plan, a ceiling reached. */
  | "billing"
  /** Somebody did something you would want to know about. */
  | "activity"
  /** We need you to do something, and nothing proceeds until you do. */
  | "action"
  /** Us, about us: maintenance, an incident, a release. */
  | "service";



export interface NotificationDef {
  readonly category: Category;
  readonly tone: Tone;
  /**
   * ⚠️ AN ICON PER TYPE, REQUIRED. A missing one renders as an anonymous bell,
   * which is indistinguishable from every other anonymous bell — so an inbox of
   * them is a list the reader has to open one at a time to triage.
   */
  readonly icon: string;
  /** One line. Interpolated from the dispatch's own values, never free text. */
  readonly title: string;
  readonly body?: string;
  readonly link: Destination;
  /**
   * Who this is FOR. A notification with no audience is one that reaches
   * everybody or nobody, and both have shipped.
   */
  readonly roles: readonly string[];
  /**
   * ⚠️ WHETHER A WORKSPACE MAY PUT THIS IN ITS OWN WORDS — off unless declared.
   *
   * The default is the strict one on purpose. A tenant is a business writing to
   * its own customers, and the sentence "your session is confirmed" is theirs to
   * phrase; the sentence "your card was declined" is the PLATFORM writing to the
   * tenant about the tenant, and a workspace that could rewrite it could reword
   * its own arrears notice into something reassuring, for staff who would then
   * not act on it. Opting in per type keeps that distinction visible in the
   * manifest instead of resting on whoever adds the next notification.
   */
  readonly theirs?: boolean;
}

export type NotificationRegistry = Readonly<Record<string, NotificationDef>>;

/**
 * ⚠️ WHAT THE PLATFORM ITSELF RAISES, NAMED IN THE CONTRACT LAYER.
 *
 * A workspace created, a plan chosen, a package granted — none of them is an
 * app's operation, and every one of them is something somebody should be told
 * about. Before this list existed the events were real and undeclarable: an app
 * that did not happen to write the same three strings got no announcement at
 * all, and `dispatch` answered a missing registry entry by returning nothing.
 * Silence, from a registry lookup, with every test green.
 *
 * It is also what a milestone rule may be written over. An app's own `emits` are
 * visible to composition; these are not, so without them "count the packages you
 * granted" would be refused as a rule over an event nothing raises.
 *
 * ⚠️ AND IT IS PINNED AGAINST THE RUNTIME BY A TEST. This is a copy of what the
 * platform's operations actually declare, in a package that cannot import them —
 * so the copy is asserted equal rather than trusted.
 */
export const PLATFORM_EVENTS = ["workspace.created", "plan.chosen", "package.granted", "support.session"] as const;

/**
 * ⚠️ SOMEBODY FROM OUTSIDE THE WORKSPACE ACTED INSIDE IT, and the workspace is
 * told. A support session nobody is announced is indistinguishable, from in
 * there, from somebody having got in — and telling those two apart is exactly
 * what a person reading their own record needs to be able to do.
 */
export const SUPPORT_SESSION = "support.session";

/* ---------------------------------------------------------- the channels --- */

/**
 * ⚠️ NO `push`, AND ITS REMOVAL IS THE POINT.
 *
 * It was here — a third channel, a preference somebody could switch on, a branch
 * in `channelsFor` that returned it — and nothing anywhere delivered one. There
 * is no service worker in this platform, no subscription store and no device to
 * receive anything, so what shipped was a switch in a settings screen that
 * silently did nothing, which is worse than an absent feature: somebody turns it
 * on and stops watching their inbox.
 *
 * It comes back with the offline work that gives it something to reach — see
 * PLAN.md §4 — and not before. A channel is a promise about delivery.
 */
export type Channel = "inbox" | "email";

/**
 * ⚠️ THE INBOX IS NEVER OPTIONAL, and that is the whole shape of this function.
 *
 * Email and push can be declined, silently fail, be filtered, or arrive at an
 * address somebody has left. The inbox is the record — so a preference removes
 * the INTERRUPTION and never the information, and "I never got that" has an
 * answer that does not depend on a mail provider.
 */
export interface Preferences {
  /** Per category, the interruptions this person wants. The inbox is not listed. */
  readonly muted: readonly Category[];
  readonly email: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = { muted: [], email: true };

/**
 * Where one notification goes for one person.
 *
 * ⚠️ AN `action` IS NEVER MUTED. It is the category that says nothing proceeds
 * until somebody does something — a plan that lapses, a document waiting to be
 * signed, a workspace about to be erased. Letting it be switched off makes the
 * product silently stop working for whoever switched it off, and they will not
 * connect the two.
 */
export function channelsFor(def: NotificationDef, prefs: Preferences): readonly Channel[] {
  const out: Channel[] = ["inbox"];
  const muted = def.category !== "action" && prefs.muted.includes(def.category);
  if (!muted && prefs.email) out.push("email");
  return out;
}

/* ------------------------------------------------------------- rendering --- */

/**
 * ⚠️ INTERPOLATED FROM DECLARED VALUES ONLY. A title assembled from free text at
 * the call site is one that cannot be translated and one that can carry a
 * customer's own input into an email header.
 *
 * A missing value leaves the token in place rather than printing `undefined` —
 * visibly wrong beats plausibly wrong, because the second one ships.
 */
export function render(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));
}

/**
 * The URL a notification opens.
 *
 * Router-free by construction: it returns a destination the app's own shell
 * resolves, because a platform that owned the route table would own the app's
 * navigation with it.
 */
export function destinationFor(def: NotificationDef, rowId?: string): { readonly collection?: string; readonly rowId?: string } {
  switch (def.link.to) {
    case "collection": return { collection: def.link.collection };
    case "row": return { collection: def.link.collection, rowId };
    case "inbox": return {};
  }
}

/* --------------------------------------------------------------- the gap --- */

/**
 * ⚠️ EVERY TYPE A NOTIFICATION LINKS TO MUST BE A DECLARED COLLECTION.
 *
 * The type system stops a free-form path; it cannot stop a collection id that
 * was renamed or never existed. This is the composition-time half, and it is the
 * same failure the destination type exists to prevent — a notification that
 * renders and goes nowhere.
 */
export function danglingLinks(registry: NotificationRegistry, collections: readonly CollectionSpec[]): readonly string[] {
  const known = new Set(collections.map((c) => c.id));
  return Object.entries(registry)
    .filter(([, def]) => def.link.to !== "inbox" && !known.has((def.link as { collection: string }).collection))
    .map(([id]) => id);
}

/* --------------------------------------------------------- their own words --- */

/**
 * ONE WORKSPACE'S REPHRASING OF ONE NOTIFICATION.
 *
 * ⚠️ A REPLACEMENT FOR THE COPY, NEVER FOR THE MECHANISM. The category, the
 * tone, the icon, the audience and the destination stay the platform's — those
 * are what make an inbox triageable and a link real. What a tenant may change is
 * the sentence, because the sentence is their voice talking to their customers.
 */
export interface Wording {
  readonly title?: string;
  readonly body?: string;
}

/** Per notification type, what this workspace says instead. */
export type WordingBook = Readonly<Record<string, Wording>>;

/**
 * ⚠️ LONG ENOUGH FOR A PARAGRAPH, SHORT ENOUGH THAT IT IS STILL A NOTIFICATION.
 * The ceiling is not about storage: a title is rendered into an email subject
 * and into a row on a phone, and neither has anywhere to put a thousand words.
 */
export const MAX_WORDING = 500;

export type WordingRefusal = "unknown_type" | "not_theirs" | "empty" | "unknown_token" | "too_long";

/** Every `{token}` a template interpolates, in the order it uses them. */
export function tokensIn(template: string): readonly string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
}

/**
 * Whether this workspace may store these words for this type.
 *
 * ⚠️ THE TOKEN CHECK IS THE ONE THAT MATTERS, and it is not about tidiness. A
 * dispatch carries the values the platform's own copy needs and nothing else, so
 * a rephrasing reaching for `{amount}` on a type that never carries one renders
 * the literal text `{amount}` — to a customer, in an email, from a business that
 * thought it was writing a sentence. `render` deliberately leaves an unknown
 * token in place rather than printing `undefined`, which makes this the moment
 * to refuse it: at the keyboard of the person who can fix it.
 *
 * ⚠️ THE ALLOWED SET IS THE TITLE AND THE BODY TOGETHER, so a workspace may move
 * a value from one to the other. What it may not do is invent one.
 */
export function refuseWording(
  registry: NotificationRegistry,
  type: string,
  wording: Wording,
): WordingRefusal | null {
  const def = registry[type];
  if (!def) return "unknown_type";
  if (!def.theirs) return "not_theirs";

  const title = (wording.title ?? "").trim();
  const body = (wording.body ?? "").trim();
  if (title === "" && body === "") return "empty";
  if (title.length > MAX_WORDING || body.length > MAX_WORDING) return "too_long";

  const allowed = new Set([...tokensIn(def.title), ...tokensIn(def.body ?? "")]);
  for (const token of [...tokensIn(title), ...tokensIn(body)]) {
    if (!allowed.has(token)) return "unknown_token";
  }
  return null;
}

/**
 * What this notification actually says here.
 *
 * ⚠️ BLANK FALLS THROUGH RATHER THAN CLEARING. It is the same rule the config
 * store uses — non-empty wins, not present wins — and here it is what stops a
 * half-filled form from sending an email with no subject. A workspace that wants
 * the platform's words back clears the entry; it does not save an empty box.
 *
 * ⚠️ AND AN ENTRY FOR A TYPE THAT IS NOT THEIRS IS IGNORED HERE TOO. The write
 * refuses one, but a registry can change after a row was stored — a type that
 * stops being a tenant's to phrase must stop being phrased by them on the same
 * deploy, not whenever somebody remembers to delete the row.
 */
export function saying(def: NotificationDef, override?: Wording): { readonly title: string; readonly body?: string } {
  const mine = def.theirs ? override : undefined;
  const title = (mine?.title ?? "").trim() || def.title;
  const body = (mine?.body ?? "").trim() || def.body;
  return { title, ...(body ? { body } : {}) };
}

/**
 * A workspace's sign-off, on the messages that leave the product.
 *
 * ⚠️ THE EMAIL ONLY, AND NOT THE INBOX. An inbox row is already inside the
 * workspace's own branding, being read by somebody who is signed into it —
 * repeating "— Anna, Northside Strength" under every line there is noise. An
 * email arrives among a hundred others and has to say who it is from in its own
 * body, because the sender address belongs to the deployment rather than to the
 * business.
 */
export function signOff(body: string | undefined, signature: string): string | undefined {
  const signed = signature.trim();
  if (signed === "") return body;
  return body ? `${body}\n\n${signed}` : signed;
}
