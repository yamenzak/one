/**
 * WHO IS TOLD WHAT, AND WHO GETS TO DECIDE.
 *
 * ⚠️ THE AUDIENCE IS A PERMISSION, NEVER A ROLE NAME. A notification addressed
 * to `"manager"` reaches nobody the moment a workspace makes a role of its own —
 * and it fails in the direction nothing observes: the dispatch succeeds, the
 * audience is empty, and the person who needed to know is simply not told. The
 * permission a role carries is the same question asked in a way custom roles
 * answer correctly, and it is the question the gate already asks.
 *
 * ⚠️ AND THE POLICY HAS TWO LEVELS, IN ONE DIRECTION ONLY. The workspace sets a
 * ceiling — which types may notify at all, on which channels — and a person
 * narrows it for themselves. A person can never widen past the ceiling, because
 * a workspace that switched a channel off has usually done so for a reason that
 * is about the workspace rather than about taste.
 *
 * ⚠️ AN `action` MAY NOT BE SWITCHED OFF, AT EITHER LEVEL. "Your invitation is
 * waiting", "your payment failed", "somebody asked to erase their data" are not
 * preferences — they are requests for something only that person can do, and a
 * product that lets them be muted has built a way to miss them silently.
 *
 * Layer 2. Imports primitives and problem — `say` is the one interpolation,
 * and a second one here would be a second answer to what a variable looks like.
 */

import type { Tone } from "./primitives.js";
import { say } from "./problem.js";

/* ------------------------------------------------------------------ shape --- */

/**
 * ⚠️ THREE CHANNELS AND THE INBOX IS NOT ONE OF THE OPTIONAL ONES. It is the
 * record — the place a person goes to find what they were told — so it is
 * always written and never a preference. Email and push are how somebody is
 * INTERRUPTED, and interruption is what a preference is about.
 */
export type Channel = "inbox" | "email" | "push";

export const INTERRUPTS: readonly Channel[] = ["email", "push"];

/**
 * ⚠️ `action` NEEDS SOMETHING FROM THE READER AND THE OTHERS DO NOT. That is the
 * whole reason the category exists: it is what `refusePolicy` reads to decide
 * that switching this type off is not a preference somebody may express.
 */
export type Category = "action" | "activity" | "digest" | "marketing";

/**
 * ⚠️ `ours` AND `theirs` DECIDE WHOSE LETTERHEAD AN EMAIL WEARS, and getting it
 * wrong is a misattribution rather than a style error. "Your subscription is
 * past due" is from us to the business; wrapping it in the business's own
 * branding tells their staff their own company is chasing them for a bill they
 * have never heard of.
 */
export type Author = "ours" | "theirs";

export interface NotificationDef {
  readonly id: string;
  readonly label: string;
  /**
   * One line, in the reader's terms. It is the inbox row and the email subject.
   *
   * ⚠️ IT IS A TEMPLATE, SO IT IS ONLY EVER SHOWN FILLED. `{coach} published
   * {title}` is what a person reads AFTER dispatch has put real names in it; a
   * surface that lists notification TYPES — a policy screen, a catalogue — has
   * nothing to fill it with and must show the `label` instead.
   */
  readonly summary: string;
  readonly category: Category;
  readonly author: Author;
  readonly tone: Tone;
  readonly icon: string;
  /**
   * ⚠️ THE AUDIENCE TEST. Everybody in the workspace holding this permission is
   * told — see the header for why this is not a role name.
   */
  readonly needs: string;
  /** The event that raises it. Something an operation `emits`, or nothing raises it. */
  readonly on: string;
  /** Where the row goes when it is pressed. A declared screen's route. */
  readonly link: string;
  /**
   * ⚠️ WHAT A TEMPLATE MAY SAY, DECLARED. A tenant editing the text of a message
   * needs to know which values it can name, and a template naming one that does
   * not exist renders `{customer}` to a customer. Both halves come from here.
   */
  readonly variables: readonly string[];
  /** Which channels this type is capable of. The policy narrows; it never adds. */
  readonly channels: readonly Channel[];
}

export type NotificationBook = Readonly<Record<string, NotificationDef>>;

/* ----------------------------------------------------------------- policy --- */

/** What the workspace allows. Absent means the definition's own channels. */
export type Policy = Readonly<Record<string, readonly Channel[]>>;

/** What one person wants, within that. Absent means everything the ceiling allows. */
export type Preference = Readonly<Record<string, readonly Channel[]>>;

/**
 * The channels one notification actually goes out on.
 *
 * ⚠️ FOUR NARROWINGS AND THEY COMPOSE IN ONE DIRECTION: what the type can do,
 * what the deployment has working, what the workspace allows, what the person
 * wants. Every step may only remove. A single implementation of this is what
 * keeps the policy screen honest — two would let a screen promise a channel the
 * dispatcher does not use, and the screen is the one people believe.
 */
export function channelsFor(
  def: NotificationDef,
  policy: Policy,
  preference: Preference,
  available: readonly Channel[],
): readonly Channel[] {
  const ceiling = policy[def.id] ?? def.channels;
  const wanted = preference[def.id] ?? ceiling;
  const out = def.channels.filter((c) =>
    available.includes(c) && ceiling.includes(c) && wanted.includes(c));

  /* ⚠️ THE INBOX SURVIVES EVERY NARROWING. It is the record rather than an
     interruption, and a person who muted email still needs somewhere to find
     what happened while they were not looking. */
  return out.includes("inbox") || !def.channels.includes("inbox")
    ? out
    : ["inbox", ...out];
}

/**
 * ⚠️ AND SOMEBODY MUST BE IN THE AUDIENCE BEFORE ANY OF THAT MATTERS. Asked of
 * the permissions a person actually resolved to — which is what makes a custom
 * role work without the notification knowing it exists.
 */
export const inAudience = (def: NotificationDef, held: ReadonlySet<string>): boolean =>
  held.has(def.needs);

/* ------------------------------------------------------------- letterhead --- */

/**
 * ⚠️ A TENANT MAY REWRITE ONLY WHAT IT AUTHORS. `theirs` is a message from the
 * business to its own customer, and branding it is the point. `ours` is a
 * message from us to the business — its subject, its wording and its sender are
 * ours, because a customer who cannot tell whose letter this is cannot tell
 * whether to act on it.
 */
export const brandable = (def: NotificationDef): boolean => def.author === "theirs";

export interface Letter {
  readonly subject: string;
  readonly body: string;
  readonly signature?: string;
}

/** ⚠️ A ceiling on a tenant-authored template. Enough for a letter, not a site. */
export const MAX_LETTER = 20_000;

export type LetterRefusal = "too_long" | "unknown_variable" | "not_theirs" | "empty";

/**
 * What a tenant's own template can get wrong.
 *
 * ⚠️ `unknown_variable` IS THE ONE A CUSTOMER SEES. A template naming `{coach}`
 * where the definition offers `{trainer}` renders the brace and the word to
 * somebody who has no idea what it is — and it is the tenant's own edit, so
 * nothing of ours fails and nobody of ours is told.
 */
/** The variables a template named that the definition does not offer. */
export const unknownVariables = (def: NotificationDef, letter: Letter): readonly string[] =>
  [...new Set([...`${letter.subject}\n${letter.body}`.matchAll(/\{([a-zA-Z0-9_]+)\}/g)]
    .map((m) => m[1]!)
    .filter((n) => !def.variables.includes(n)))];

/**
 * ⚠️ THE VARIABLE A TEMPLATE NAMES AND THE NOTIFICATION DOES NOT IS THE ONE A
 * CUSTOMER READS. It is the tenant's own edit, so nothing of ours fails and
 * nobody of ours is told — the brace and the word simply arrive in somebody's
 * inbox. Refused at the door where the template is saved, which is the only
 * place it can still be somebody's mistake rather than somebody's mail.
 */
export function refuseLetter(def: NotificationDef, letter: Letter): readonly LetterRefusal[] {
  const out: LetterRefusal[] = [];
  if (!brandable(def)) out.push("not_theirs");
  if (!letter.subject.trim() || !letter.body.trim()) out.push("empty");
  if (letter.body.length + letter.subject.length > MAX_LETTER) out.push("too_long");
  /* ⚠️ ASKED, NOT REPEATED. `unknownVariables` is this line with a name and a
     reason, and it was written out again here — so the exported one had no
     caller and the two could have drifted about what counts as a variable. */
  if (unknownVariables(def, letter).length) out.push("unknown_variable");
  return out;
}

/* ------------------------------------------------------------------ rules --- */

export type NotifyRefusal =
  | "action_muted" | "channel_not_offered" | "unknown_type";

export interface NotifyProblem { readonly why: NotifyRefusal; readonly detail: string }

/**
 * What a policy — a workspace's or a person's — may not say.
 *
 * ⚠️ THE `action` RULE IS ENFORCED HERE RATHER THAN HIDDEN IN A SCREEN. A
 * screen that simply does not render the switch is a rule that lasts until the
 * second screen, or the API, or the import that sets preferences in bulk.
 */
export function refusePolicy(book: NotificationBook, policy: Policy): readonly NotifyProblem[] {
  const out: NotifyProblem[] = [];
  for (const [id, channels] of Object.entries(policy)) {
    const def = book[id];
    if (!def) { out.push({ why: "unknown_type", detail: `"${id}" is not a notification` }); continue; }
    if (def.category === "action" && !channels.some((c) => INTERRUPTS.includes(c))) {
      out.push({ why: "action_muted",
        detail: `"${id}" asks the reader to do something, so it may not be silenced` });
    }
    for (const c of channels) {
      if (!def.channels.includes(c)) {
        out.push({ why: "channel_not_offered", detail: `"${id}" does not offer ${c}` });
      }
    }
  }
  return out;
}

/**
 * ⚠️ A NOTIFICATION NOTHING RAISES IS A FEATURE THAT LOOKS BUILT. It renders in
 * the policy screen, a person switches it on, and it never arrives — so they
 * conclude the product is broken and stop trusting the ones that do work.
 */
export const unraisable = (book: NotificationBook, emitted: readonly string[]): readonly string[] =>
  Object.values(book).filter((d) => !emitted.includes(d.on)).map((d) => d.id);

/** ⚠️ An audience nothing can hold is a message nobody will ever be sent. */
export const unaddressable = (book: NotificationBook, permissions: readonly string[]): readonly string[] =>
  Object.values(book).filter((d) => !permissions.includes(d.needs)).map((d) => d.id);

/**
 * ⚠️ A DEAD LINK IS THE FAILURE THIS CATCHES, AND IT ONLY APPEARS ONCE SOMETHING
 * RENDERS. A previous platform's inbox had five of them — four pointing at a
 * route that did not exist — and an integration test asserted one of the wrong
 * paths, so the bug was pinned rather than found.
 */
export const deadLinks = (book: NotificationBook, routes: readonly string[]): readonly string[] =>
  Object.values(book)
    .filter((d) => !routes.some((r) => d.link === r || d.link.startsWith(`${r}/`)))
    .map((d) => `${d.id} → ${d.link}`);

export const notification = (def: NotificationDef): NotificationDef => def;

/* ---------------------------------------------------------------- by mail --- */

/**
 * WHAT ONE NOTIFICATION BECOMES WHEN IT LEAVES THE PROCESS.
 *
 * ⚠️ AN EMAIL IS NOT AN INBOX ROW WITH A SUBJECT ON IT (D44). The row sits in a
 * surface that already says which workspace it belongs to and is one press from
 * the thing it is about; a letter arrives among four hundred others with no
 * context at all, so it carries the workspace's name and an ABSOLUTE way back.
 * A notification whose link a reader cannot follow is a notification that has
 * told them to go and look for something.
 *
 * ⚠️ AND THE WORKSPACE'S OWN WORDS ARE USED ONLY WHERE THEY MAY BE. `ours` is a
 * message from us to the business — "your payment failed", "somebody asked to
 * erase their data" — and a business rewriting those is a business rewriting our
 * side of a conversation with its own staff. Asked here rather than trusted from
 * the store, because a row can be written by an older version of a rule and read
 * by a newer one.
 *
 * ⚠️ IT IS PURE, AND EVERY INPUT IS ALREADY SETTLED. The values, the address and
 * the template are resolved by the caller; what this decides is which words go
 * out, which is a question with one right answer and no I/O in it.
 */
export interface Mailed {
  readonly subject: string;
  readonly text: string;
}

export function letterFor(
  def: NotificationDef,
  values: Readonly<Record<string, string>>,
  /** ⚠️ Absolute. A relative path in an email is a path to nowhere. */
  where: string,
  /** The workspace's own template, or nothing. */
  own: Letter | null,
  /** ⚠️ Whose name is over the door — the workspace's, for a letter it authors. */
  from: string,
): Mailed {
  const fill = (text: string) => say(text, values);
  const usable = own !== null && refuseLetter(def, own).length === 0;

  if (usable) {
    return {
      subject: fill(own.subject),
      text: [fill(own.body), own.signature ? fill(own.signature) : "", where]
        .filter(Boolean).join("\n\n"),
    };
  }

  /*
    ⚠️ THE DEFAULT NAMES THE WORKSPACE IN THE SUBJECT, and that is what makes a
    letter findable. "Three things are running out" is a sentence about nothing
    somebody can act on until they know whose stock it is, and a person in four
    workspaces gets the same subject from all of them.
  */
  /* ⚠️ AND A MISSING HALF IS OMITTED RATHER THAN PRINTED EMPTY. A caller with
     no origin to give — a job running on no request — would otherwise send a
     subject opening with a dash and a body ending in a blank line, which reads
     as a template that failed rather than as a message with less in it. */
  return {
    subject: [from, fill(def.summary)].filter(Boolean).join(" — "),
    text: [fill(def.summary), where].filter(Boolean).join("\n\n"),
  };
}
