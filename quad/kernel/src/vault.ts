/**
 * THE FACTS THAT ARE NOT AN APP'S TO KEEP (D11).
 *
 * ⚠️ ENCRYPTED ROWS IN THE SHARD, KEYED BY A SALT THAT CAN BE DESTROYED — not a
 * Durable Object. The deciding property is that erasure and export must be
 * PROVABLE FROM DECLARATIONS: a guard has to be able to walk every app and show
 * that every sensitive fact is here, that every one of them is reachable by the
 * export, and that destroying one row makes all of a person's facts unreadable
 * at once. A DO holds state a script cannot enumerate, so a fact left out of it
 * would look exactly like a fact that was never collected.
 *
 * ⚠️ CRYPTO-SHREDDING IS THE ERASURE. One write destroys the subject's salt and
 * every ciphertext about them becomes noise, everywhere, including in whatever
 * backup already left the building. Deleting rows cannot make that claim, and
 * "we deleted your data" is a claim somebody may one day have to stand behind.
 *
 * ⚠️ CONSENT IS THE CEILING AND A GRANT IS THE SPECIFIC. A grant that exceeds
 * consent is a lawful-basis failure wearing an access-control shape, and it is
 * invisible from either side: the grant looks like a grant, and the subject sees
 * nothing at all.
 *
 * Layer 2. Imports primitives and field.
 */

import type { AccountId, Instant } from "./primitives.js";
import type { Holding } from "./field.js";

/* ------------------------------------------------------------------ shape --- */

/**
 * ⚠️ A PURPOSE IS A LEGAL BASIS, NOT A CATEGORY. It is what the disclosure
 * discloses, what consent is asked for, and what a grant is bounded by — so an
 * app declaring "we need this for coaching" has said the thing the ROPA needs
 * and the thing the consent sheet shows, once.
 */
export interface PurposeDef {
  readonly id: string;
  readonly label: string;
  /** Why this is needed, in the subject's own terms. It is shown to them. */
  readonly why: string;
  readonly holdings: readonly Holding[];
  /** Days the fact may be kept for this purpose. Null is "while they are here". */
  readonly retention: number | null;
  /**
   * ⚠️ WHETHER THE PRODUCT STILL WORKS WITHOUT IT. Consent that cannot be
   * refused is not consent — so a purpose the product depends on says so, and
   * the sheet tells the subject what they lose rather than pretending it is
   * optional.
   */
  readonly required?: boolean;
}

export interface VaultFieldDef {
  readonly id: string;
  readonly label: string;
  readonly holding: Holding;
  /** Which purposes this fact may be read for. Nothing else may ever read it. */
  readonly purposes: readonly string[];
  readonly help?: string;
}

export type VaultBook = Readonly<Record<string, VaultFieldDef>>;
export type PurposeBook = Readonly<Record<string, PurposeDef>>;

export const vaultField = (def: VaultFieldDef): VaultFieldDef => def;
export const purpose = (def: PurposeDef): PurposeDef => def;

/* ------------------------------------------------------- consent and grant --- */

export interface Consent {
  readonly subject: AccountId;
  readonly purpose: string;
  readonly givenAt: Instant | null;
  readonly withdrawnAt: Instant | null;
}

export interface Grant {
  readonly subject: AccountId;
  /** Who may read. A membership, an app, a service — resolved before it gets here. */
  readonly to: string;
  readonly purpose: string;
  readonly fields: readonly string[];
  readonly until: Instant;
  readonly grantedAt: Instant;
  readonly revokedAt?: Instant;
}

export const consented = (c: Consent | undefined, now: Instant): boolean =>
  !!c?.givenAt && (!c.withdrawnAt || c.withdrawnAt > now);

/**
 * ⚠️ A GRANT EXPIRES, AND ONE THAT DOES NOT IS A PERMANENT ONE. Access given for
 * a task outlives the task by default; the expiry is what makes "somebody looked
 * at this two years after they stopped working here" impossible rather than
 * unlikely.
 */
export const live = (g: Grant, now: Instant): boolean =>
  !g.revokedAt && g.until > now;

export type ReadRefusal =
  | "no_consent" | "no_grant" | "grant_expired" | "outside_purpose"
  | "field_not_granted" | "unknown_field";

/**
 * Whether one read of one fact may happen.
 *
 * ⚠️ EVERY REFUSAL IS DISTINCT AND NONE OF THEM IS "NOT FOUND". A vault read
 * that answers "no such fact" when the truth is "you have no grant" teaches
 * whoever is reading that the subject has nothing — and it hides an access
 * failure inside an ordinary empty result, which nobody investigates.
 */
export function refuseRead(
  book: VaultBook,
  ask: { readonly field: string; readonly purpose: string; readonly to: string; readonly now: Instant },
  consents: readonly Consent[],
  grants: readonly Grant[],
): ReadRefusal | null {
  const def = book[ask.field];
  if (!def) return "unknown_field";
  if (!def.purposes.includes(ask.purpose)) return "outside_purpose";

  const grant = grants.find((g) => g.to === ask.to && g.purpose === ask.purpose);
  if (!grant) return "no_grant";
  if (!live(grant, ask.now)) return "grant_expired";
  if (!grant.fields.includes(ask.field)) return "field_not_granted";

  /* ⚠️ CONSENT IS CHECKED LAST AND IS NOT OPTIONAL. A grant an operator wrote
     cannot stand in for the subject's own agreement — that is the whole
     difference between access control and a lawful basis. */
  const consent = consents.find((c) => c.purpose === ask.purpose && c.subject === grant.subject);
  if (!consented(consent, ask.now)) return "no_consent";
  return null;
}

/**
 * ⚠️ WHAT THE SUBJECT IS SHOWN ABOUT THEMSELVES, DERIVED. A disclosure written
 * by hand is one that is right on the day it is written — and this is the page a
 * regulator reads.
 */
export interface Disclosure {
  readonly purpose: PurposeDef;
  readonly fields: readonly VaultFieldDef[];
  readonly required: boolean;
}

export const discloseVault = (book: VaultBook, purposes: PurposeBook): readonly Disclosure[] =>
  Object.values(purposes).map((p) => ({
    purpose: p,
    fields: Object.values(book).filter((f) => f.purposes.includes(p.id)),
    required: !!p.required,
  }));

/* ------------------------------------------------------------------ rules --- */

export type VaultRefusal =
  | "purpose_undeclared" | "no_purposes" | "purpose_holds_nothing"
  | "required_without_reason" | "orphan_purpose";

export interface VaultProblem { readonly of: string; readonly why: VaultRefusal; readonly detail: string }

/**
 * What a vault declaration can get wrong.
 *
 * ⚠️ `no_purposes` IS A FACT NOTHING MAY EVER READ. It is collected, encrypted,
 * kept and disclosed — and every read of it is refused, for ever, which reads on
 * the screen as a field somebody forgot to fill in.
 */
export function refuseVault(book: VaultBook, purposes: PurposeBook): readonly VaultProblem[] {
  const out: VaultProblem[] = [];
  const at = (of: string, why: VaultRefusal, detail: string) => out.push({ of, why, detail });

  for (const f of Object.values(book)) {
    if (!f.purposes.length) at(f.id, "no_purposes", "no purpose, so every read of it is refused for ever");
    for (const p of f.purposes) {
      if (!(p in purposes)) at(f.id, "purpose_undeclared", `names "${p}", which is not a declared purpose`);
    }
  }

  for (const p of Object.values(purposes)) {
    if (!p.holdings.length) at(p.id, "purpose_holds_nothing", "a purpose that collects nothing");
    if (p.required && !p.why.trim()) {
      at(p.id, "required_without_reason", "cannot be refused and does not say what it is for");
    }
    if (!Object.values(book).some((f) => f.purposes.includes(p.id))) {
      at(p.id, "orphan_purpose", "asked for on the consent sheet and used by no field");
    }
  }
  return out;
}

/**
 * ⚠️ THE ONE THAT MAKES THE VAULT WORTH HAVING. A field declared `sensitive` in
 * an app's own collection is a health record, a belief or a biometric sitting in
 * a product table — outside consent, outside the grant log, and outside
 * crypto-shredding. `refuseField` catches it at the field; this catches the
 * mirror image, a vault field an app forgot to route here.
 */
export const strayFacts = (
  book: VaultBook,
  declaredSensitive: readonly string[],
): readonly string[] => declaredSensitive.filter((id) => !(id in book));
