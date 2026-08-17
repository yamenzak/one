/**
 * WHAT WE PROMISED, WHO ACCEPTED IT, AND WHAT THE RECORD SAYS WE DO.
 *
 * ⚠️ THE RECORD IS DERIVED, NEVER WRITTEN. A processing record typed by hand is
 * accurate on the day it is typed and drifts silently from then on — and it is
 * the one document whose whole value is that it matches what the software
 * actually does. Every row of it comes from a collection's fields, a vault
 * purpose, or a declared sub-processor.
 *
 * ⚠️ AN ACCEPTANCE IS OF A VERSION, NOT OF A DOCUMENT. Editing the text without
 * moving the version means everybody who accepted the old wording is recorded as
 * having accepted the new one — which is worse than having no record, because it
 * is a record that is confidently wrong.
 *
 * ⚠️ AND A SUB-PROCESSOR IS DECLARED WHERE IT IS USED. One that receives
 * somebody's data and appears in no list is the disclosure failure that
 * regulators actually find, and it happens by a service being added in a hurry
 * rather than by anybody deciding to hide it.
 *
 * Layer 2. Imports primitives and field.
 */

import type { Day, Instant } from "./primitives.js";
import type { Holding } from "./field.js";

/* -------------------------------------------------------------- documents --- */

export type DocumentKind = "terms" | "privacy" | "dpa" | "cookies" | "acceptable-use" | "sub-processors";

export interface DocumentDef {
  readonly id: string;
  readonly kind: DocumentKind;
  readonly title: string;
  /**
   * ⚠️ A DAY, AND IT IS THE VERSION. A number nobody can date is a version
   * nobody can reason about — "did they accept the one from before the change?"
   * is the only question ever asked of it.
   */
  readonly version: Day;
  /** ⚠️ Whether somebody is stopped until they accept. See `outstanding`. */
  readonly mustAccept: boolean;
  /** Who it binds: the person signing in, or the business signing up. */
  readonly binds: "person" | "tenant";
  readonly url?: string;
}

export type DocumentBook = Readonly<Record<string, DocumentDef>>;

export interface Acceptance {
  readonly document: string;
  readonly version: Day;
  readonly at: Instant;
  readonly by: string;
}

/**
 * ⚠️ WHAT SOMEBODY STILL OWES, BY VERSION. An acceptance of an older version is
 * not an acceptance — that is the entire reason the version is on the record.
 */
export const outstanding = (
  book: DocumentBook,
  accepted: readonly Acceptance[],
  binds: DocumentDef["binds"],
): readonly DocumentDef[] =>
  Object.values(book).filter((d) =>
    d.mustAccept && d.binds === binds
    && !accepted.some((a) => a.document === d.id && a.version === d.version));

/* --------------------------------------------------------- sub-processors --- */

export interface SubProcessorDef {
  readonly id: string;
  readonly name: string;
  /** What they do for us, in a sentence a customer can read. */
  readonly role: string;
  /** ⚠️ ISO country. It is what a residency promise is checked against (D6). */
  readonly country: string;
  readonly receives: readonly Holding[];
  readonly url?: string;
}

export type SubProcessorBook = Readonly<Record<string, SubProcessorDef>>;

export const subProcessor = (def: SubProcessorDef): SubProcessorDef => def;

/* -------------------------------------------------------------- the record --- */

/**
 * One row of the processing record.
 *
 * ⚠️ EVERY FIELD OF THIS COMES FROM SOMEWHERE ELSE. If a row could be written
 * here that no declaration produced, the record would have a hand-written half —
 * and the hand-written half is the half that is wrong.
 */
export interface RopaEntry {
  readonly of: string;
  readonly why: string;
  readonly holdings: readonly Holding[];
  /** Days, or null for "while the workspace exists". */
  readonly retention: number | null;
  readonly recipients: readonly string[];
}

export interface RopaSource {
  readonly id: string;
  readonly label: string;
  readonly why: string;
  readonly holdings: readonly Holding[];
  readonly retention: number | null;
}

/**
 * ⚠️ THE RECORD, ASSEMBLED. Sources are collections and vault purposes;
 * recipients are the sub-processors that receive any of a row's holdings. A
 * sub-processor that receives a category nothing collects is reported by
 * `refuseLegal` rather than silently listed against nothing.
 */
export const ropa = (
  sources: readonly RopaSource[],
  processors: SubProcessorBook,
): readonly RopaEntry[] =>
  sources.map((s) => ({
    of: s.label,
    why: s.why,
    holdings: s.holdings,
    retention: s.retention,
    recipients: Object.values(processors)
      .filter((p) => p.receives.some((h) => s.holdings.includes(h)))
      .map((p) => `${p.name} (${p.country})`),
  }));

/* ------------------------------------------------------------------ rules --- */

export type LegalRefusal =
  | "no_privacy_document" | "no_terms" | "must_accept_without_binding"
  | "processor_receives_nothing_collected" | "undisclosed_recipient"
  | "sensitive_without_a_purpose";

export interface LegalProblem { readonly of: string; readonly why: LegalRefusal; readonly detail: string }

/**
 * What the legal declarations can get wrong.
 *
 * ⚠️ `undisclosed_recipient` IS THE EXPENSIVE ONE. Data leaving for a service
 * that appears in no list is not a bug anything throws on; it is discovered by
 * somebody outside the company, and by then it has been true for a year.
 *
 * ⚠️ WHETHER THE DOCUMENTS THEMSELVES EXIST IS NOT ASKED HERE — see
 * `missingDocuments`. Terms and a privacy notice bind the DEPLOYMENT, and every
 * app inherits them; demanding a set per app would either produce four copies
 * of one document or teach everybody to satisfy the check with a stub.
 */
export function refuseLegal(
  book: DocumentBook,
  processors: SubProcessorBook,
  collected: readonly Holding[],
  sensitiveHasPurpose: boolean,
): readonly LegalProblem[] {
  const out: LegalProblem[] = [];
  const at = (of: string, why: LegalRefusal, detail: string) => out.push({ of, why, detail });

  for (const d of Object.values(book)) {
    if (d.mustAccept && !d.url) {
      at(d.id, "must_accept_without_binding", "acceptance is demanded and there is nothing to read");
    }
  }

  for (const p of Object.values(processors)) {
    if (!p.receives.length) {
      at(p.id, "processor_receives_nothing_collected", "listed as a recipient of nothing");
    }
    for (const h of p.receives) {
      if (!collected.includes(h)) {
        at(p.id, "undisclosed_recipient", `receives ${h}, which no declaration says is collected`);
      }
    }
  }

  if (collected.includes("sensitive") && !sensitiveHasPurpose) {
    at("purposes", "sensitive_without_a_purpose", "a special category is held and no purpose covers it");
  }
  return out;
}

/**
 * ⚠️ ASKED OF THE DEPLOYMENT, ONCE. These are the two documents whose absence is
 * not a gap in a manifest but a product taking somebody's data with nothing
 * saying what happens to it — and the answer is the same for every app on it,
 * which is exactly why it is asked here and not there.
 *
 * DEFER(engine-25) stage:25 — this deployment declares no documents at all, so
 * every lane that could ask this would refuse every boot. The gap is real and
 * the fix is a privacy notice and terms, which is legal text rather than code;
 * satisfying the rule with a stub URL is precisely the outcome the paragraph
 * above rules out, and would leave the rule green and the deployment silent.
 * Wiring it is the last line of the stage that writes them.
 */
export function missingDocuments(
  book: DocumentBook,
  collected: readonly Holding[],
): readonly LegalProblem[] {
  const out: LegalProblem[] = [];
  const kinds = new Set(Object.values(book).map((d) => d.kind));
  if (collected.length && !kinds.has("privacy")) {
    out.push({ of: "documents", why: "no_privacy_document",
      detail: "personal data is collected and nothing describes what happens to it" });
  }
  if (!kinds.has("terms")) {
    out.push({ of: "documents", why: "no_terms", detail: "nothing states what is being agreed to" });
  }
  return out;
}
