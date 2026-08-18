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
  /**
   * ⚠️ THE WORDS THEMSELVES, AND WITHOUT THEM THERE IS NOTHING TO READ. A
   * document used to be a title, a version and a `url` — and the url was checked
   * for being DECLARED, never for being answered. `/legal/terms` fell through to
   * the page, the app booted, found the document unaccepted and drew the consent
   * screen again: somebody was asked to agree to a text the deployment did not
   * have. Carrying the text is what makes `mustAccept` mean something.
   */
  readonly text?: string;
  /**
   * ⚠️ ONLY FOR A DOCUMENT HOSTED SOMEWHERE ELSE, and it must be absolute. A
   * relative url is a promise about a route, and a declaration cannot keep it.
   */
  readonly url?: string;
}

export type DocumentBook = Readonly<Record<string, DocumentDef>>;

/** ⚠️ Where a document carrying its own text is answered — see `legalUrlOf`. */
export const LEGAL_PATH = "/legal/";

/**
 * ⚠️ THE INDEX, AND IT IS A SEPARATE CONSTANT BECAUSE A TRAILING SLASH IS NOT A
 * DIFFERENT PAGE. Half the links anybody writes by hand carry one and half do
 * not; a route that answered only the slashed form would 404 the other, which is
 * the same silence a document with no address had.
 */
export const LEGAL_INDEX = "/legal";

/**
 * WHERE A DOCUMENT IS READ, DERIVED FROM THE DOCUMENT.
 *
 * ⚠️ NEVER TYPED BESIDE IT, WHICH IS EXACTLY WHAT WENT WRONG. The declaration
 * carried `url: "/legal/terms"` while nothing answered that path; the text later
 * moved INTO the document and the url was dropped — and the consent screen went
 * on opening whatever `url` still said, which by then was nothing. So it opened
 * the app, which booted, found the document unaccepted, and drew the consent
 * screen again. One rule in one place is what makes the link and the route
 * unable to disagree.
 *
 * ⚠️ AND OUR OWN TEXT WINS OVER A DECLARED URL, because the route answers on
 * exactly the condition this branch tests. A document with both would otherwise
 * be linked somewhere this deployment does not control while holding the words
 * it was actually asked to agree to.
 */
export const legalUrlOf = (d: DocumentDef): string | null =>
  d.text?.trim() ? `${LEGAL_PATH}${d.id}` : (d.url ?? null);

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

/**
 * WHAT THE PLATFORM ITSELF HOLDS ABOUT A PERSON, WHATEVER ANY PRODUCT DOES.
 *
 * ⚠️ `holdingsOf(app)` WALKS AN APP'S COLLECTIONS AND VAULT, AND THE PLATFORM IS
 * NEITHER. The framework's own tables hold somebody's email address, the account
 * it belongs to, a log of which operation ran in which workspace, and what has
 * been paid — none of which any manifest declares, because none of it is any
 * product's. So a deployment's disclosure was assembled from the apps' holdings
 * alone: a recipient correctly named as receiving payment details was reported
 * as receiving something nothing collects, and the recipient of an email address
 * had no category to be named under at all.
 *
 * - `identity` — an account and the workspaces it belongs to.
 * - `contact` — the email address somebody signs in with.
 * - `usage` — which operation ran, in which workspace and when; and the device
 *   address a notification is sent to.
 * - `financial` — the plan, the invoices, and what is owed.
 *
 * ⚠️ IT IS A LIST RATHER THAN A DERIVATION, AND THAT IS THE HONEST SHAPE. These
 * tables are the framework rather than declared collections, so there is nothing
 * to walk. What keeps it true is that it is asked on every boot: a platform
 * table holding a new category, with this left alone, makes that category's
 * recipient `undisclosed_recipient` at the next deploy.
 *
 * ⚠️ `sensitive` IS DELIBERATELY ABSENT. The platform stores special categories
 * only inside the vault, on behalf of an app that declared them — so it is the
 * APP's holding, and claiming it here would disclose a category on a deployment
 * where no product handles any.
 */
export const PLATFORM_HOLDINGS: readonly Holding[] =
  ["identity", "contact", "usage", "financial"];

/**
 * WHAT THE DEPLOYMENT PROMISES, AS OPPOSED TO WHAT A PRODUCT DOES.
 *
 * ⚠️ TERMS AND A PRIVACY NOTICE BIND A LEGAL ENTITY, NOT A FEATURE. There is one
 * company behind every app here, one contract with the customer, and one
 * description of what happens to their data — so four products with four privacy
 * notices is either four copies of one document or four that contradict each
 * other, and somebody opening the second product does not sign a second
 * contract. `missingDocuments` has said this in its own header since it was
 * written, which is exactly why nothing could call it: it asked a
 * deployment-level question of a per-app declaration.
 *
 * ⚠️ AND THE SUB-PROCESSOR BASE IS HERE FOR THE SAME REASON. The database, the
 * object store and the compute are the same vendor for every product on this
 * deployment; declaring them per app is three chances to forget one, and an
 * undisclosed recipient is the disclosure failure regulators actually find.
 * An app adds the ones that are genuinely its own — a payment gateway one
 * product uses, a model provider only one product calls.
 *
 * ⚠️ WHAT STAYS WITH THE APP: purposes and vault fields. A purpose is why THIS
 * product needs THIS fact, it is what the consent sheet shows and what bounds a
 * grant — merged, it would ask somebody to agree to reasons belonging to
 * products they do not use.
 */
export interface DeploymentLegal {
  readonly documents: DocumentBook;
  readonly processors: SubProcessorBook;
  /**
   * ⚠️ WHO THE OTHER PARTY IS. Terms with no named entity are not a contract
   * with anybody, and a privacy notice with no controller and no address does
   * not give somebody the one thing every data-protection regime starts with:
   * an addressee for the request. Absent is REPORTED (`no_entity_named`), never
   * filled in with something plausible.
   */
  readonly identity?: DeploymentIdentity;
}

/**
 * THE FACTS ONLY THE OPERATOR CAN SUPPLY, DECLARED ONCE.
 *
 * ⚠️ NOT INTERPOLATED INTO EVERY DOCUMENT BY HAND. Written into three texts, the
 * company's own address is three things to change when it moves, and the one
 * nobody changes is the one somebody writes to. The entity-bearing paragraph is
 * COMPOSED from this, so a document either carries the current facts or is
 * openly missing them.
 *
 * ⚠️ AND THE MISSING CASE IS AN ABSENT PARAGRAPH, NEVER A GAP IN A SENTENCE. A
 * document reading "governed by the laws of ." is worse than one that does not
 * mention governing law, because it looks like a rendering fault in a contract.
 */
export interface DeploymentIdentity {
  /** The legal name that is party to the terms — the one on the licence. */
  readonly entity: string;
  /**
   * ⚠️ THE NAME ON THE PRODUCT, WHERE IT IS NOT THE NAME ON THE LICENCE. A
   * document naming only the registered entity is correct and unrecognisable:
   * somebody who signed up to One, from a company they know as one thing, reads
   * a contract with a company they have never heard of and cannot tell whether
   * it is the same one. Absent means the two names are the same.
   */
  readonly tradingAs?: string;
  /** Postal address. It is what a data-protection request is sent to. */
  readonly address: string;
  /** The address a person writes to about their own data. */
  readonly contact: string;
  /** ⚠️ Whose law governs — "England and Wales", "the Emirate of Dubai". */
  readonly law: string;
  /** Which courts hear a dispute. */
  readonly courts: string;
}

/**
 * ⚠️ THE ONE PARAGRAPH THAT NAMES THE COMPANY, BUILT RATHER THAN TYPED. Every
 * document that binds somebody ends with it, so the address a person writes to
 * is the same address in all of them, for ever, from one declaration.
 */
export const whoWeAre = (of: DeploymentIdentity): string => [
  "# Who you are agreeing with",
  `${of.entity}${of.tradingAs ? `, trading as ${of.tradingAs}` : ""}, of ${of.address}.`
  + ` Write to ${of.contact} about anything in this document or about your own information.`,
  `This agreement is governed by the law of ${of.law}, and the courts of ${of.courts} hear`
  + ` any dispute about it.`,
].join("\n\n");

export const subProcessor = (def: SubProcessorDef): SubProcessorDef => def;

/** What a category is called in a sentence somebody reads. */
const SAID: Readonly<Record<Holding, string>> = {
  none: "nothing personal",
  identity: "who you are",
  contact: "how to reach you",
  usage: "what you did here",
  financial: "payment details",
  sensitive: "special categories",
};

/**
 * THE SUB-PROCESSOR DOCUMENT, WRITTEN BY THE REGISTER.
 *
 * ⚠️ A LIST OF RECIPIENTS MAINTAINED BY HAND IS THE ONE THAT IS WRONG. It is
 * accurate the day it is typed and drifts the first time a service is added in a
 * hurry — which is exactly how an undisclosed recipient happens, and it is the
 * disclosure failure regulators actually find. This deployment already declares
 * every recipient in one place because the record of processing is built from
 * it; the published list is the same declaration in sentences.
 *
 * ⚠️ AND IT IS WHY THE DPA MAY PROMISE A CURRENT LIST. That promise was already
 * in the text while the only published list lived inside a workspace behind a
 * sign-in, which is not published.
 */
export const subProcessorText = (
  processors: SubProcessorBook,
  intro = "These are every company that receives any part of what this service holds.",
): string => {
  const rows = Object.values(processors)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!rows.length) return `${intro}\n\nThere are none: nothing here leaves this service.`;
  return [intro, ...rows.map((p) =>
    `# ${p.name}\n\n${p.role} Established in ${p.country}. `
    + `Receives ${p.receives.map((h) => SAID[h]).join(", ")}.`
    + (p.url ? ` Their own terms: ${p.url}` : ""))].join("\n\n");
};

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
  | "not_a_category" | "no_entity_named"
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

  /*
    ⚠️ READABLE, NOT MERELY REFERENCED. This asked whether a `url` was declared,
    which a relative path satisfies whether or not anything answers it — and one
    did not, on a live deployment, for every document it demanded agreement to.
    Either the text is here, or the address is somewhere a browser can actually
    reach without this deployment routing it.
  */
  for (const d of Object.values(book)) {
    if (!d.mustAccept) continue;
    const hosted = (d.url ?? "").startsWith("https://");
    if (!d.text?.trim() && !hosted) {
      at(d.id, "must_accept_without_binding",
        d.url
          ? `acceptance is demanded and ${d.url} is a path this declaration cannot promise answers`
          : "acceptance is demanded and there is nothing to read");
    }
  }

  for (const p of Object.values(processors)) {
    if (!p.receives.length) {
      at(p.id, "processor_receives_nothing_collected", "listed as a recipient of nothing");
    }
    for (const h of p.receives) {
      /*
        ⚠️ `none` IS NOT A CATEGORY A RECIPIENT CAN RECEIVE. It is what a FIELD
        says about itself — "this column holds nothing personal" — and a
        processor declaring it is a declaration mistake with a consequence:
        `under` intersects a processor's list with what the app holds, so the
        wrong entry survives and the right ones do not. The live deployment
        declared its only processor as receiving `none` and `sensitive`, and the
        trust screen then told people the company running the databases received
        their special-category data and NOT their email address.
      */
      if (h === "none") {
        at(p.id, "not_a_category",
          "declared as receiving \"none\", which is what a field says about itself rather than "
          + "something a recipient can be sent");
        continue;
      }
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
 */
export function missingDocuments(
  book: DocumentBook,
  collected: readonly Holding[],
  /**
   * ⚠️ ASKED HERE AND NOT IN `refuseLegal`, BECAUSE AN APP HAS NO IDENTITY.
   * There is one company behind every product on a deployment; asking each
   * manifest to name it would be four answers to a question with one, and three
   * of them would be stubs.
   */
  identity?: DeploymentIdentity,
): readonly LegalProblem[] {
  const out: LegalProblem[] = [];
  const kinds = new Set(Object.values(book).map((d) => d.kind));

  /*
    ⚠️ A CONTRACT WITH NO NAMED COUNTERPARTY. Somebody is being asked to agree,
    and the document does not say who they are agreeing WITH, where to write, or
    whose law decides a disagreement. Every other rule here is about whether a
    document exists; this is about whether the one that exists is an agreement.
  */
  if (!identity && Object.values(book).some((d) => d.mustAccept)) {
    out.push({ of: "identity", why: "no_entity_named",
      detail: "agreement is demanded and no company, address, contact or governing law is named" });
  }
  if (collected.length && !kinds.has("privacy")) {
    out.push({ of: "documents", why: "no_privacy_document",
      detail: "personal data is collected and nothing describes what happens to it" });
  }
  if (!kinds.has("terms")) {
    out.push({ of: "documents", why: "no_terms", detail: "nothing states what is being agreed to" });
  }
  return out;
}
