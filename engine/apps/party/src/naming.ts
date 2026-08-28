/**
 * WHAT A PARTY IS CALLED, WHAT ITS TAX NUMBER IS CALLED, AND WHETHER TWO ROWS
 * ARE ONE COMPANY WRITTEN TWICE.
 *
 * ⚠️ PURE, AND THAT IS WHAT MAKES IT ARGUABLE. Every question here has one right
 * answer per country and none of them touch a database, so they can be asserted
 * against the real vocabulary rather than against a fixture somebody agreed
 * with.
 *
 * ⚠️ THE TAX IDENTIFIER IS ONE COLUMN AND MANY NAMES, WHICH IS THE WHOLE
 * "EVERY COUNTRY" PROBLEM IN ONE FIELD. A company registered in the Emirates has
 * a TRN, in India a GSTIN, in Australia an ABN, in the United States an EIN. They
 * are the same fact — the number a tax authority knows this party by — and a
 * product that models them as separate fields grows one per country and can
 * never stop. So the COLUMN is universal and the LABEL is data.
 *
 * ⚠️ AND THE LIST IS A DEFAULT, NEVER A RULE. A workspace can be told the wrong
 * country, can trade somewhere the list has never heard of, and can have a
 * perfectly good reason to call it something else — so `taxNameFor` always
 * answers, and the setting above it always wins. A lookup that refuses an
 * unknown country is a product that cannot be sold in one.
 */

/** What a party is: a company, or a person trading as themselves. */
export type Kind = "person" | "organisation";

/** The three roles a party can hold, in the order a screen reads them. */
export const ROLES = ["customer", "supplier", "worker"] as const;
export type Role = (typeof ROLES)[number];

/** ⚠️ Only the fields the vocabulary needs, so a caller may pass a whole row. */
export interface Party {
  readonly name: string;
  readonly kind: Kind;
  readonly taxId?: string | null;
  readonly customer?: boolean | null;
  readonly supplier?: boolean | null;
  readonly worker?: boolean | null;
}

/* ------------------------------------------------------------------ names --- */

/**
 * WHAT A TAX IDENTIFIER IS CALLED, BY ISO-3166 COUNTRY.
 *
 * ⚠️ ONLY WHERE THE LOCAL NAME IS NOT "VAT NUMBER". The European Union, the
 * United Kingdom, the Gulf VAT states and most of Africa and Latin America all
 * say some translation of it, so listing them would be a hundred rows agreeing
 * with the fallback — and a hundred rows nobody can check is worse than a
 * fallback everybody can. What is here is where the local word is genuinely
 * different, and each is the term a person in that country would recognise on a
 * form.
 */
export const TAX_NAMES: Readonly<Record<string, string>> = {
  AE: "TRN",
  AR: "CUIT",
  AU: "ABN",
  BR: "CNPJ",
  CA: "Business Number",
  CH: "UID",
  CL: "RUT",
  CN: "USCC",
  IN: "GSTIN",
  JP: "Corporate Number",
  KR: "Business Registration Number",
  MX: "RFC",
  MY: "Tax Identification Number",
  NZ: "GST number",
  PH: "TIN",
  SG: "UEN",
  TH: "Tax ID",
  TR: "Vergi Numarası",
  TW: "Unified Business Number",
  US: "EIN",
  ZA: "Tax reference number",
};

/** ⚠️ The name most of the world uses, and what an unknown country gets. */
export const TAX_NAME = "VAT number";

/**
 * ⚠️ IT ALWAYS ANSWERS. A workspace with no country set, a country the list has
 * never heard of and a country written in lower case all get a usable label —
 * an empty one would leave a required field with no name over it.
 */
export const taxNameFor = (country: string | null | undefined): string =>
  TAX_NAMES[(country ?? "").trim().toUpperCase()] ?? TAX_NAME;

/* ------------------------------------------------------------------ roles --- */

/** Which roles a party holds, in `ROLES` order. */
export const rolesOf = (party: Party): readonly Role[] =>
  ROLES.filter((role) => party[role] === true);

/**
 * ⚠️ A PARTY WITH NO ROLE IS ORDINARY, NOT BROKEN. Somebody types a name into
 * the book before they know whether they will be buying from them or selling to
 * them, and refusing that would make the first thing anybody does an error.
 */
export const saysRoles = (party: Party): string => {
  const held = rolesOf(party);
  if (!held.length) return "No role yet";
  return held.map((role) => role.slice(0, 1).toUpperCase() + role.slice(1)).join(" · ");
};

/* --------------------------------------------------------------- the same --- */

/**
 * ⚠️ A NAME NARROWED TO WHAT IS ACTUALLY THE NAME. "Acme Ltd.", "ACME LTD" and
 * "acme  limited" are one company typed by three people, and a book that shows
 * all three is a book somebody stops trusting. Case, spacing, punctuation and
 * the suffix that says what KIND of company it is all come off — the suffix
 * because it is the part people abbreviate and translate.
 */
const SUFFIXES = new Set([
  "ltd", "limited", "llc", "inc", "incorporated", "plc", "co", "company",
  "gmbh", "ag", "sa", "sarl", "srl", "bv", "nv", "ab", "as", "oy", "pty",
  "llp", "lp", "kk", "pte", "fzco", "fze", "llcsp",
]);

export const narrowed = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word && !SUFFIXES.has(word))
    .join(" ");

/**
 * WHETHER TWO ROWS ARE THE SAME COMPANY.
 *
 * ⚠️ A TAX IDENTIFIER IS PROOF AND A NAME IS A GUESS, so they are not weighed
 * against each other. Two rows carrying the same tax number ARE the same party,
 * whatever they are called; two rows carrying different ones are not, however
 * alike the names. Only when at least one side has no number does the name get
 * to decide, and then only as a suggestion for a person to confirm.
 *
 * ⚠️ WHICH IS WHY THIS ANSWERS THREE WAYS RATHER THAN TWO. "Maybe" is the whole
 * point of the check: this product's job is to stop the second address book from
 * existing, and it does that by ASKING at the moment somebody is typing a name
 * it has seen — not by silently refusing a row they meant to add.
 */
export type Sameness = "same" | "maybe" | "different";

export const sameParty = (a: Party, b: Party): Sameness => {
  const one = (a.taxId ?? "").replace(/\s/g, "").toUpperCase();
  const two = (b.taxId ?? "").replace(/\s/g, "").toUpperCase();
  if (one && two) return one === two ? "same" : "different";
  const left = narrowed(a.name);
  const right = narrowed(b.name);
  if (!left || !right) return "different";
  return left === right ? "maybe" : "different";
};

/** Every row in the book this one might already be, most certain first. */
export const alreadyThere = <T extends Party>(
  book: readonly T[], one: Party,
): readonly { readonly party: T; readonly how: Sameness }[] =>
  book
    .map((party) => ({ party, how: sameParty(party, one) }))
    .filter((found): found is { party: T; how: Sameness } => found.how !== "different")
    .sort((a, b) => (a.how === b.how ? 0 : a.how === "same" ? -1 : 1));
