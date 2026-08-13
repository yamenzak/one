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
   *
   * ⚠️ THESE ARE THE PRODUCT'S OWN ROLES, AND A WORKSPACE HAS OTHERS. A role a
   * workspace composed for itself is a bundle of permissions with a name the
   * manifest has never heard of, so a name match alone answers "no" for every
   * one of them — a Front Desk who is told nothing, in a product where
   * everything else works. `needs` is what the merged registry is matched on.
   */
  readonly roles: readonly string[];
  /**
   * THE PERMISSION THAT MAKES THIS RELEVANT TO SOMEBODY.
   *
   * ⚠️ REQUIRED, AND IT IS WHAT MAKES A CUSTOM ROLE WORK WITHOUT ANY APP
   * DECLARING ONE. A workspace's own role cannot appear in `roles` — the
   * manifest was written before the role existed — so this is the test that CAN
   * be asked of it: whoever may read the thing this notification is about is
   * told about it. A declared role must ALSO be listed in `roles`, so this can
   * only ever narrow the audience the product intended, never widen it.
   *
   * ⚠️ AND IT IS THE KEY A PERSON'S OWN SWITCHES ARE DERIVED FROM. Somebody who
   * cannot read a check-in has no business being offered a switch for "a
   * check-in was filed" — a preferences screen listing every type a product has
   * is one where most rows do nothing for most people.
   */
  readonly needs: string;
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
 * ⚠️ A CHANNEL IS A PROMISE ABOUT DELIVERY, and `push` was removed once for
 * breaking it: it was a preference somebody could switch on with nothing behind
 * it — no service worker, no subscription store, no device — which is worse than
 * an absent feature, because somebody turns it on and stops watching their
 * inbox. It is back with all three, and `deliverable` is what keeps the promise:
 * a deployment that has not configured push does not OFFER push.
 */
export type Channel = "inbox" | "email" | "push";

export const CHANNELS: readonly Channel[] = ["inbox", "email", "push"];

/**
 * ⚠️ THE INBOX IS NEVER OPTIONAL, and that is the whole shape of this file.
 *
 * Email and push can be declined, silently fail, be filtered, arrive at an
 * address somebody has left or at a browser they have uninstalled. The inbox is
 * the RECORD — so a preference removes the INTERRUPTION and never the
 * information, and "I never got that" has an answer that does not depend on a
 * mail provider or a push service.
 */
export interface Preferences {
  /** Per category, the interruptions this person wants. The inbox is not listed. */
  readonly muted: readonly Category[];
  readonly email: boolean;
  readonly push: boolean;
}

/**
 * ⚠️ PUSH IS OFF BY DEFAULT AND EMAIL IS ON, because they are not the same kind
 * of consent. An address was given to us; a device notification is a permission
 * a browser asks for at a moment somebody chose, and defaulting it on would
 * describe a subscription nobody has made.
 */
export const DEFAULT_PREFERENCES: Preferences = { muted: [], email: true, push: false };

/* ------------------------------------------------------ what a tenant says --- */

/**
 * WHAT A WORKSPACE ALLOWS FOR ONE TYPE.
 *
 * ⚠️ TWO LEVELS, AND THE TENANT'S IS THE CEILING. A workspace decides what its
 * product says on its behalf and how loudly — a studio that does not want its
 * clients emailed about every published programme is making a decision about its
 * own business — and a person then chooses WITHIN that. The other order does not
 * work: a person cannot be asked to opt into a channel their workspace has
 * turned off, because the switch would do nothing and say nothing.
 *
 * ⚠️ ABSENT MEANS THE PRODUCT'S OWN DEFAULT, NOT "OFF". A workspace that has
 * never opened the screen must behave exactly as it did before the screen
 * existed, or shipping this feature silences every deployment that upgrades.
 */
export interface Policy {
  /** ⚠️ Off entirely — not even the inbox row. See `refusePolicy`. */
  readonly off?: boolean;
  /** The channels this workspace permits. Absent is all of them. */
  readonly channels?: readonly Channel[];
}

export type PolicyBook = Readonly<Record<string, Policy>>;

export type PolicyRefusal = "unknown_type" | "action_off" | "unknown_channel";

/**
 * Whether a workspace may store this policy for this type.
 *
 * ⚠️ AN `action` MAY NOT BE TURNED OFF BY ANYBODY — not by the person receiving
 * it and not by the workspace sending it. It is the category that means nothing
 * proceeds until somebody does something: a plan that lapsed, a document waiting
 * to be signed, a workspace about to be erased. A workspace that could switch
 * those off would be one where the product silently stops working and nobody in
 * it is told why — and the person who switched it off is not the person it
 * stops working for.
 */
export function refusePolicy(
  registry: NotificationRegistry, type: string, policy: Policy,
): PolicyRefusal | null {
  const def = registry[type];
  if (!def) return "unknown_type";
  if (def.category === "action" && policy.off) return "action_off";
  for (const c of policy.channels ?? []) if (!CHANNELS.includes(c)) return "unknown_channel";
  return null;
}

/* --------------------------------------------------------- who gets what --- */

/**
 * Whether one person is in this notification's audience.
 *
 * ⚠️ THE PERMISSION IS THE TEST A CUSTOM ROLE CAN PASS. A role the workspace
 * composed for itself is not in the manifest and never will be, so matching the
 * NAME answers "no" for every one of them — silently, which is how somebody
 * comes to be in a workspace for a month being told nothing.
 *
 * ⚠️ AND A DECLARED ROLE STILL HAS TO BE LISTED. `roles` is the product saying
 * who a message is FOR — "a check-in was filed" is for whoever supervises, not
 * for the client who filed it, even though both may read it — and a permission
 * cannot express that. So the permission WIDENS to roles the manifest could not
 * know about and never widens the ones it does.
 */
export function inAudience(
  def: NotificationDef,
  person: { readonly role: string; readonly permissions: ReadonlySet<string> },
  declaredRoles: ReadonlySet<string>,
): boolean {
  if (!person.permissions.has(def.needs)) return false;
  return declaredRoles.has(person.role) ? def.roles.includes(person.role) : true;
}

/**
 * Where one notification goes for one person, after both levels have spoken.
 *
 * ⚠️ AN `action` IS NEVER MUTED, on either level. Same argument as `refusePolicy`
 * — the person who switches it off is not the person the product then silently
 * stops working for.
 *
 * ⚠️ AND `available` IS WHAT KEEPS A CHANNEL'S PROMISE. A deployment with no
 * push keys and a deployment with no mail provider must not put a message on a
 * channel that will drop it: the inbox row is still written, so the information
 * survives and only the interruption is missing.
 */
export function channelsFor(
  def: NotificationDef,
  prefs: Preferences,
  policy: Policy = {},
  available: readonly Channel[] = CHANNELS,
): readonly Channel[] {
  if (policy.off) return [];
  const out: Channel[] = ["inbox"];
  const muted = def.category !== "action" && prefs.muted.includes(def.category);
  if (muted) return out;

  const allowed = (c: Channel) =>
    (policy.channels ?? CHANNELS).includes(c) && available.includes(c);
  if (prefs.email && allowed("email")) out.push("email");
  if (prefs.push && allowed("push")) out.push("push");
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
/**
 * ⚠️ AND EVERY `needs` MUST BE A PERMISSION THE MANIFEST DECLARES.
 *
 * A key nobody declares is held by nobody, so the type reaches nobody — for
 * ever, silently, with the notification appearing in every catalogue and every
 * generated document. It is the same failure `danglingLinks` refuses one field
 * along, and the same shape as an undeclared permission on a custom role:
 * plausible, inert, and invisible until somebody asks why they were never told.
 */
export function unknownNeeds(registry: NotificationRegistry, permissions: readonly string[]): readonly string[] {
  const declared = new Set(permissions);
  return Object.entries(registry).filter(([, def]) => !declared.has(def.needs)).map(([id]) => id);
}

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

/* ------------------------------------------------------- their letterhead --- */

/**
 * A WORKSPACE'S OWN LETTERHEAD, WRAPPED ROUND WHAT LEAVES THE PRODUCT.
 *
 * ⚠️ THE PLATFORM'S OWN MAIL STAYS PLAIN, AND THAT IS NOT THE SAME DECISION. A
 * sign-in code is one sentence and one number; HTML buys it nothing and is the
 * half of an email that renders differently in every client and gets a message
 * filed as marketing. A workspace writing to its own customers is a business
 * with a logo and a sign-off, sending something it wants to look like theirs —
 * different sender, different reader, different message.
 *
 * ⚠️ SO IT REACHES EXACTLY THE TYPES `theirs` ALREADY GOVERNS. A workspace that
 * could wrap the platform's own arrears notice in its own layout could bury it,
 * and the people who would then not act on it are its staff.
 *
 * ⚠️ AND IT IS A WRAPPER, NEVER THE MESSAGE. The title and the body are still
 * rendered from the registry with the dispatch's own values, so a letterhead
 * cannot say anything the notification did not — it decides how it looks, not
 * what it says. A template that WAS the message would be a second copy of every
 * sentence, drifting from the one the inbox shows.
 */
export interface Letter {
  /**
   * ⚠️ `{title}`, `{body}` AND `{signature}`, AND NOTHING ELSE. Any other token
   * renders as its own literal text in a customer's inbox — `render` leaves an
   * unknown one in place on purpose, which makes this the moment to refuse it:
   * at the keyboard of the person who can fix it.
   */
  readonly html?: string;
  readonly signature?: string;
}

export const LETTER_TOKENS: readonly string[] = ["title", "body", "signature"];

/**
 * ⚠️ ROOM FOR A REAL LAYOUT, AND A CEILING ANYWAY. Inlined CSS and a logo as a
 * data URI is a few kilobytes; past this it is not a letterhead, it is a
 * newsletter, and it is being stored in a column every notification read pays to
 * fetch.
 */
export const MAX_LETTER = 20_000;

export type LetterRefusal = "unknown_token" | "too_long" | "no_body";

/**
 * Whether these words may be a workspace's letterhead.
 *
 * ⚠️ A LAYOUT WITH NO `{body}` IS ONE THAT SENDS THE SAME EMPTY PAGE TO EVERY
 * CUSTOMER FOREVER, and it looks completely fine in the editor — which is
 * exactly why it is refused here rather than discovered from a support ticket.
 */
export function refuseLetter(letter: Letter): LetterRefusal | null {
  const html = (letter.html ?? "").trim();
  if (html === "") return null;
  if (html.length > MAX_LETTER) return "too_long";
  const tokens = tokensIn(html);
  if (!tokens.includes("body")) return "no_body";
  for (const t of tokens) if (!LETTER_TOKENS.includes(t)) return "unknown_token";
  return null;
}

/**
 * ⚠️ THE TEXT PART IS ALWAYS BUILT, EVEN WHERE THERE IS HTML. A client that
 * cannot render it, a screen reader, a spam filter reading a text/plain part
 * that is not there — all three are ordinary, and an HTML-only email is one that
 * arrives blank for some readers with nothing on our side saying so.
 */
export interface Written {
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

export function letterFor(
  said: { readonly title: string; readonly body?: string },
  signature: string,
  letter: Letter = {},
): Written {
  const signed = (letter.signature ?? signature).trim();
  const text = signOff(said.body, signed) ?? said.title;
  const layout = (letter.html ?? "").trim();
  if (layout === "") return { subject: said.title, text };
  return {
    subject: said.title,
    text,
    html: render(layout, { title: said.title, body: said.body ?? said.title, signature: signed }),
  };
}
