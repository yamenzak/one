/**
 * A RECORD SOMEBODY STANDS BEHIND — and the ladder that makes standing behind it
 * mean something.
 *
 * ⚠️ AN ORDINARY RECORD IS EDITABLE FOREVER, AND A DOCUMENT MUST NOT BE. An
 * invoice, a delivery note, a journal entry: at some moment a person commits to
 * it, a number is assigned, other records begin to depend on it and a ledger
 * moves. After that moment the record is evidence, and evidence that can be
 * edited in place is not evidence. That moment is the whole of what this file
 * declares.
 *
 * ⚠️ AND THE REASON IT IS THE ENGINE'S RATHER THAN AN APP'S: every app in a
 * business suite has documents, they all need the same three transitions, the
 * same numbering and the same audit trail, and an app that implements its own
 * gets one of them subtly wrong. A hand-written state machine per document is
 * how "cancel" comes to mean four different things in one product.
 *
 * ⚠️ WHAT A CANCEL DOES IS DERIVED, NEVER HAND-WRITTEN. A document declares what
 * it POSTS; the reverse of a declared posting is computable, so cancelling
 * writes the mirror entries because the engine can work them out rather than
 * because a handler remembered to. That is the same move erasure made — derived
 * from declarations instead of a list somebody maintains — and it is worth
 * making here for the same reason: the hand-written half is the half that goes
 * stale, silently, in the direction of a ledger that no longer balances.
 *
 * ⚠️ THERE ARE THREE STANDINGS AND NOT FOUR. "Amended" is not a state a document
 * is in; it is a fact about a CANCELLED document that another one points at. A
 * fourth standing would be a second place the same truth lives, and the two
 * would disagree the first time an amendment was itself cancelled.
 *
 * Layer 2. Imports nothing of ours.
 */

/* --------------------------------------------------------------- standing --- */

/**
 * ⚠️ NULL IS `draft`, AND THAT IS WHAT MAKES THIS SAFE TO ADD TO A LIVE TABLE.
 * Every row written before the column existed reads as a draft, which is what it
 * was. The alternative — a `NOT NULL DEFAULT 'draft'` — is a rewrite of every
 * row of every document table on the boot that introduces it.
 */
export type DocumentStanding = "draft" | "submitted" | "cancelled";

export const DOCUMENT_STANDINGS: readonly DocumentStanding[] = ["draft", "submitted", "cancelled"];

/** What a person asks of a document. */
export type DocumentMove = "submit" | "cancel" | "amend";

export const DOCUMENT_MOVES: readonly DocumentMove[] = ["submit", "cancel", "amend"];

export type MoveDocumentRefusal =
  | "already_submitted"
  | "not_submitted"
  | "already_cancelled"
  | "amend_before_cancel"
  | "not_amendable"
  | "never_cancellable";

/**
 * WHETHER THIS MOVE MAY BE MADE FROM THIS STANDING.
 *
 * ⚠️ ONE FUNCTION, AND EVERY DOOR ASKS IT. The alternative is each operation
 * checking the column itself, which is four comparisons written five times —
 * and the fifth copy is the one that forgets that a cancelled document cannot
 * be submitted again.
 *
 * ⚠️ `amend` DOES NOT MOVE THE DOCUMENT IT IS ASKED OF. It produces a NEW draft
 * that points back, and the cancelled original stays exactly as it was. That is
 * why the answer here is about the ORIGINAL's standing and the new record's
 * standing is never in question: it is a draft, like everything else that has
 * not been committed to yet.
 */
export function mayMoveDocument(
  from: DocumentStanding,
  move: DocumentMove,
  spec: Pick<DocumentSpec, "amendable" | "cancel">,
): true | MoveDocumentRefusal {
  if (move === "submit") {
    if (from === "submitted") return "already_submitted";
    if (from === "cancelled") return "already_cancelled";
    return true;
  }
  if (move === "cancel") {
    /*
      ⚠️ REFUSING A CANCEL IS A REAL DECLARATION, NOT A MISSING FEATURE. In much
      of the world a tax invoice may not be withdrawn once issued — the lawful
      correction is a credit note, which is a different document with its own
      number and its own posting. A product that offers Cancel there is a
      product that lets somebody break the law in two clicks.
    */
    if (spec.cancel?.by === "refusing") return "never_cancellable";
    if (from === "draft") return "not_submitted";
    if (from === "cancelled") return "already_cancelled";
    return true;
  }
  /*
    ⚠️ AMEND FOLLOWS CANCEL AND CANNOT PRECEDE IT. Amending a document that is
    still standing would leave two live versions of one commitment, both
    posted, both numbered, with nothing saying which one the ledger meant.
  */
  if (spec.amendable === false) return "not_amendable";
  if (from !== "cancelled") return "amend_before_cancel";
  return true;
}

/** Where a move leaves the document it was asked of. `amend` leaves it alone. */
export const standingAfter = (
  from: DocumentStanding,
  move: DocumentMove,
): DocumentStanding =>
  move === "submit" ? "submitted" : move === "cancel" ? "cancelled" : from;

/**
 * ⚠️ WHAT MAY STILL BE EDITED, AND IT IS NOT A FIELD LIST. ERPNext answers this
 * per field — "allow on submit" — which is a hole with a checkbox on it: every
 * field so marked is a field that changes after the number was issued and after
 * the ledger moved, with the document still reading as evidence. Here a
 * submitted document is closed, whole, and the way to change one is to cancel it
 * and amend.
 */
export const documentEditable = (standing: DocumentStanding): boolean => standing === "draft";

/* ----------------------------------------------------------------- series --- */

/**
 * THE NUMBER A DOCUMENT GETS WHEN SOMEBODY COMMITS TO IT.
 *
 * ⚠️ ONE GRAMMAR, NOT NINE. The framework this round was read against offers
 * set-by-user, autoincrement, by-fieldname, a series, an expression, a second
 * deprecated expression, random, UUID and a scripting hook — because each was
 * added when the previous one did not fit. Every one of them is a way for two
 * documents to end up differently named, and a business whose invoice numbers
 * follow two conventions is a business with an audit finding.
 *
 * ⚠️ A PLACEHOLDER IS BRACED, WHICH IS THE PART WORTH BEING PEDANTIC ABOUT. A
 * dot-delimited scheme cannot tell `.YEAR.` — a token nobody implements — from
 * literal text, so a typo becomes the string `.YEAR.` printed on every invoice
 * for the life of the deployment, and it is discovered by a customer. Braces
 * make an unknown token a REFUSAL at composition instead.
 */
export interface SeriesPart {
  readonly literal?: string;
  readonly token?: SeriesToken;
  /** For `#` runs: how many digits the counter is padded to. */
  readonly width?: number;
  /** For `{field:x}`: which of the document's own fields. */
  readonly field?: string;
}

export type SeriesToken = "year" | "short-year" | "month" | "day" | "counter" | "field";

export type SeriesRefusal =
  | "series_unparseable"
  | "series_unknown_token"
  | "series_without_a_counter"
  | "series_counter_twice"
  | "series_too_narrow"
  | "series_empty";

/** ⚠️ Three digits is the floor: a two-wide counter collides in its first year. */
export const COUNTER_FLOOR = 3;

const TOKENS: Readonly<Record<string, SeriesToken>> = {
  YYYY: "year", YY: "short-year", MM: "month", DD: "day",
};

/**
 * READ A PATTERN INTO ITS PARTS, OR SAY WHY IT CANNOT BE READ.
 *
 * ⚠️ PARSING AND VALIDATING ARE THE SAME PASS ON PURPOSE. Two passes is two
 * grammars, and the second one drifts — the classic shape being a validator that
 * accepts a token the renderer then prints literally.
 */
export function readSeries(pattern: string): readonly SeriesPart[] | SeriesRefusal {
  if (!pattern.trim()) return "series_empty";

  const parts: SeriesPart[] = [];
  let literal = "";
  let counters = 0;

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch !== "{") {
      /* ⚠️ A LONE `}` IS A TYPO, NOT A LITERAL. Silently printing it is how a
         half-written placeholder ships as decoration on a legal document. */
      if (ch === "}") return "series_unparseable";
      literal += ch;
      continue;
    }
    const close = pattern.indexOf("}", i);
    if (close === -1) return "series_unparseable";
    const inside = pattern.slice(i + 1, close);
    i = close;

    if (literal) { parts.push({ literal }); literal = ""; }

    if (/^#+$/.test(inside)) {
      counters++;
      if (counters > 1) return "series_counter_twice";
      if (inside.length < COUNTER_FLOOR) return "series_too_narrow";
      parts.push({ token: "counter", width: inside.length });
      continue;
    }
    if (inside.startsWith("field:")) {
      const field = inside.slice("field:".length);
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(field)) return "series_unknown_token";
      parts.push({ token: "field", field });
      continue;
    }
    const token = TOKENS[inside];
    if (!token) return "series_unknown_token";
    parts.push({ token });
  }
  if (literal) parts.push({ literal });

  /*
    ⚠️ A PATTERN WITH NO COUNTER NAMES EVERY DOCUMENT THE SAME THING. `INV-{YYYY}`
    is a valid-looking series that gives every invoice of 2026 the number
    INV-2026 — which does not throw, does not fail a test, and is found by the
    person trying to work out which of forty identical invoices was paid.
  */
  if (counters === 0) return "series_without_a_counter";
  return parts;
}

export interface SeriesAt {
  /** The instant the number is assigned, ISO. */
  readonly now: string;
  /** The counter's next value for this pattern, in this workspace. */
  readonly counter: number;
  /** The document's own fields, for `{field:x}`. */
  readonly fields?: Readonly<Record<string, unknown>>;
}

/**
 * RENDER A NUMBER.
 *
 * ⚠️ THE COUNTER GROWS PAST ITS WIDTH RATHER THAN WRAPPING. `{###}` at the
 * thousandth document prints `1000`, not `000` — a number that repeats is worse
 * in every way than a number that is one character wider than the accountant
 * expected, and truncation is silent while width is obvious.
 *
 * ⚠️ AND THE DATE IS READ IN UTC. A workspace whose numbering rolled over at
 * local midnight would produce two different years' numbers for one afternoon,
 * depending on which colo answered.
 */
export function renderSeries(parts: readonly SeriesPart[], at: SeriesAt): string {
  const d = new Date(at.now);
  const two = (n: number) => String(n).padStart(2, "0");

  return parts.map((p) => {
    if (p.literal !== undefined) return p.literal;
    switch (p.token) {
      case "year": return String(d.getUTCFullYear());
      case "short-year": return two(d.getUTCFullYear() % 100);
      case "month": return two(d.getUTCMonth() + 1);
      case "day": return two(d.getUTCDate());
      case "counter": return String(at.counter).padStart(p.width ?? COUNTER_FLOOR, "0");
      case "field": {
        const raw = at.fields?.[p.field!];
        /* ⚠️ A MISSING FIELD LEAVES A GAP, NOT THE WORD "undefined". The gap is
           visible to whoever reads the number; the word is a bug that looks
           like a naming convention. */
        return raw === undefined || raw === null ? "" : String(raw);
      }
      default: return "";
    }
  }).join("");
}

/**
 * WHICH COUNTER A PATTERN DRAWS FROM.
 *
 * ⚠️ THE PERIOD IS PART OF THE KEY, WHICH IS THE WHOLE REASON THIS IS NOT JUST
 * THE COLLECTION ID. A series carrying `{YYYY}` restarts each year — that is
 * what a business means by it — so the counter for 2026 and the counter for 2027
 * are two counters. Keyed by collection alone, an invoice numbered INV-2026-0412
 * is followed on the first of January by INV-2027-0413, and the year in the
 * number becomes decoration.
 */
export function counterKey(
  collection: string,
  parts: readonly SeriesPart[],
  at: Pick<SeriesAt, "now">,
): string {
  const d = new Date(at.now);
  const two = (n: number) => String(n).padStart(2, "0");
  const period = parts.map((p) => {
    switch (p.token) {
      case "year": return String(d.getUTCFullYear());
      case "short-year": return two(d.getUTCFullYear() % 100);
      case "month": return two(d.getUTCMonth() + 1);
      case "day": return two(d.getUTCDate());
      default: return "";
    }
  }).filter(Boolean).join("-");
  return period ? `${collection}:${period}` : collection;
}

/* ------------------------------------------------------------- the shape --- */

/**
 * WHERE A DOCUMENT'S EFFECT LANDS.
 *
 * ⚠️ DECLARED, BECAUSE THE REVERSE OF A DECLARATION IS COMPUTABLE AND THE
 * REVERSE OF A HANDLER IS NOT. This is the seam that makes cancel derived: the
 * engine knows what submitting wrote, so it knows what cancelling must write,
 * without the app having a second code path that can disagree with the first.
 *
 * ⚠️ `to` NAMES AN APP, NOT A TABLE, and that is the cross-app seam already in
 * the room — the borrower declares, the owner hears, nothing imports anything.
 * A document in OneInventory can post into OneBook's ledger without the two
 * products knowing about each other.
 */
export interface Posting {
  /** The app whose ledger this lands in. */
  readonly to: string;
  /** The posting rule in that app which turns this document into entries. */
  readonly rule: string;
}

/**
 * WHAT CANCELLING MEANS FOR THIS DOCUMENT.
 *
 * ⚠️ AND `refusing` IS THE ONE WORTH HAVING. See `mayMove` — a tax invoice that
 * can be withdrawn is a compliance problem wearing a convenience feature, and
 * the correction the law wants is a different document. Naming that document
 * here is what lets a screen offer the right thing instead of nothing.
 */
export type OnCancel =
  | { readonly by: "reversing" }
  | { readonly by: "refusing"; readonly instead: string; readonly why: string };

export interface DocumentSpec {
  /**
   * ⚠️ THE DEFAULT PATTERN, NOT THE SETTING. A workspace edits its own — an
   * accountant's format is theirs, and changing it must never be a deploy — so
   * what is declared here is what a fresh workspace starts with.
   */
  readonly series: string;
  /**
   * ⚠️ ABSENT MEANS YES. A document that may be committed to and never corrected
   * is the unusual one, so it is the one that has to say so.
   */
  readonly amendable?: boolean;
  readonly cancel?: OnCancel;
  readonly posts?: readonly Posting[];
}

export type DocumentRefusal =
  | SeriesRefusal
  | "posts_without_a_rule"
  | "posts_nowhere"
  | "refuses_without_an_alternative"
  | "refuses_and_amends";

export interface DocumentProblem {
  readonly collection: string;
  readonly why: DocumentRefusal;
  readonly detail: string;
}

export function refuseDocument(
  collection: string,
  spec: DocumentSpec,
): readonly DocumentProblem[] {
  const out: DocumentProblem[] = [];
  const at = (why: DocumentRefusal, detail: string) =>
    out.push({ collection, why, detail });

  const parts = readSeries(spec.series);
  if (typeof parts === "string") {
    at(parts, `series "${spec.series}" ${SERIES_SAYS[parts]}`);
  }

  for (const p of spec.posts ?? []) {
    if (!p.to.trim()) at("posts_nowhere", "declares a posting with no app to post into");
    if (!p.rule.trim()) {
      at("posts_without_a_rule",
        `posts into "${p.to}" and names no rule — the engine would know the document had an `
        + `effect and not what it was, so cancelling it could not be worked out`);
    }
  }

  if (spec.cancel?.by === "refusing") {
    if (!spec.cancel.instead.trim() || !spec.cancel.why.trim()) {
      at("refuses_without_an_alternative",
        "cannot be cancelled and does not name what to raise instead — which leaves somebody "
        + "holding a wrong document and no route at all");
    }
    /*
      ⚠️ AMENDING REQUIRES A CANCEL, SO OFFERING BOTH ANSWERS IS OFFERING NEITHER.
      `mayMove` refuses an amend from anything but `cancelled`; a document that
      can never reach `cancelled` and still advertises `amendable` shows a
      control that is refused every time it is pressed.
    */
    if (spec.amendable !== false) {
      at("refuses_and_amends",
        "cannot be cancelled and is still marked amendable — an amendment follows a "
        + "cancellation, so the control would be offered and refused every time");
    }
  }
  return out;
}

const SERIES_SAYS: Readonly<Record<SeriesRefusal, string>> = {
  series_empty: "is blank, so no document could be numbered at all",
  series_unparseable: "has a brace that does not close, or one that never opened",
  series_unknown_token:
    "names a placeholder nothing fills — it would be printed literally on every document",
  series_without_a_counter:
    "has no {#…} counter, so every document it numbers gets the same number",
  series_counter_twice: "has two counters, and there is one number to put in them",
  series_too_narrow: `has a counter under ${COUNTER_FLOOR} digits, which collides inside a year`,
};

/** ⚠️ The four columns the engine adds to a document collection, and no app declares. */
export const DOCUMENT_COLUMNS: readonly string[] = ["stands", "stands_at", "number", "amends"];
