/**
 * A THING AN APP KEEPS — and the eleven surfaces one declaration produces.
 *
 * ⚠️ A COLLECTION IS NOT A TABLE, IT IS EVERYTHING THAT FOLLOWS FROM ONE. The
 * table, its CRUD operations, its screens, its place in the export, its rows in
 * the erasure cascade, its quota, its offline policy and its entry in the ROPA
 * all derive from this literal. That is the property the framework exists to
 * have (D12), and it is why a collection may not be "just a table over there".
 *
 * ⚠️ AND `scope` DECIDES WHOSE IT IS, WHICH DECIDES HOW IT IS ERASED. A tenant's
 * record dies with the tenant; a person's record dies with the person, wherever
 * it lives and whoever else can see it. Getting this wrong is not a bug that
 * throws — it is a deletion request that silently leaves rows behind.
 *
 * Layer 2. Imports primitives and field.
 */

import type { Fields } from "./field.js";
import { holdingsIn, refuseFields } from "./field.js";

/* ---------------------------------------------------------------- the shape --- */

/**
 * ⚠️ THREE SCOPES AND NO FOURTH. `global` is the escape hatch and it is
 * deliberately narrow — a catalogue every tenant reads, owned by the deployment.
 * Anything holding a person's or a business's records is one of the other two,
 * because those are the two things that can ask to be forgotten.
 */
export type Scope =
  | { readonly of: "tenant" }
  | { readonly of: "subject"; readonly column: string }
  | { readonly of: "global" };

/**
 * ⚠️ WHAT HAPPENS WHEN THE TENANT GOES, STATED RATHER THAN ASSUMED. `purge`
 * deletes; `keep` is for the small number of records that outlive the business
 * — an invoice, a legal acceptance — and it must name why, because "keep" with
 * no reason is how a deleted workspace's data is still there a year later.
 */
export type OnClose =
  | { readonly then: "purge" }
  | { readonly then: "keep"; readonly why: string };

export interface CollectionSpec {
  readonly id: string;
  readonly label: { readonly one: string; readonly many: string };
  readonly scope: Scope;
  readonly fields: Fields;
  /** Days, or null for "as long as the tenant". */
  readonly retention: number | null;
  readonly onClose: OnClose;
  /** The entitlement key counted against, where there is a ceiling. */
  readonly quota?: string;
  /** The permission prefix. `note` gives `note:read` and `note:write`. */
  readonly permission: string;
  /** ⚠️ Absent means no history. Present means every version is kept. */
  readonly versioned?: boolean;
  /**
   * How a phone treats it with no signal.
   *
   * DEFER(engine-54) stage:54 — declared, set by the reference app, and read by
   * NOTHING. A field a manifest can set and no lane consults is the failure this
   * framework is a catalogue of, one level below the ones the capability guard
   * can see: there is no route to mount and no schema to apply, so nothing goes
   * red. It is here rather than in a sentence because a deferral has to be
   * findable, and the stage's own exit criterion is the guard that would have
   * found it.
   */
  readonly offline?: "cache" | "queue" | "none";
  /**
   * ⚠️ WHICH OF ITS OWN FIELDS ARE FINDABLE BY MEANING, AND NOTHING ELSE. Naming
   * them here is the whole declaration: the index, the re-index on every edit,
   * the removal on every delete, the removal on erasure and the search operation
   * all derive from this list, so a collection becomes searchable without an app
   * writing a line of retrieval code.
   *
   * ⚠️ AND IT IS A LIST OF FIELDS RATHER THAN `true`, because a record is not
   * uniformly safe to copy out. Indexing sends text to a service outside this
   * database, where it is chunked and embedded and cannot be selectively
   * un-indexed later — so what leaves is named, one field at a time, in review.
   */
  readonly searchable?: readonly string[];
  /** ⚠️ Which operations the collection does NOT get. See `operationsFor`. */
  readonly without?: readonly CrudVerb[];
}

export type CrudVerb = "list" | "read" | "create" | "update" | "delete";

export const CRUD: readonly CrudVerb[] = ["list", "read", "create", "update", "delete"];

/* --------------------------------------------------------------- the derived --- */

/**
 * The operations a collection produces.
 *
 * ⚠️ `without` IS AN OPT-OUT AND NOT A LIST TO OPT IN TO, and the direction is
 * the safety. Opting in means a collection whose author forgot `delete` has no
 * way to remove a record — discovered by a customer. Opting out means the
 * omission is deliberate, written down, and visible in review.
 *
 * ⚠️ A MEMBERSHIP IS THE CASE THAT MOTIVATES IT. It must have no `create`: a
 * membership is made by inviting an address and claimed by whoever signs in with
 * it, so an operation taking an account id would let anybody holding one add
 * themselves to a workspace they were never invited to.
 */
export const operationsFor = (spec: CollectionSpec): readonly string[] =>
  CRUD.filter((verb) => !(spec.without ?? []).includes(verb)).map((verb) => `${spec.id}.${verb}`);

/**
 * ⚠️ THE NAME OF THE EVENT A CRUD WRITE RAISES, IN ONE PLACE. The runtime emits
 * it and the manifest checks that notifications, steps and milestones wait for
 * something real — and two implementations of this string is how a checklist
 * item comes to wait for an event that is spelled slightly differently and can
 * therefore never be ticked.
 */
export const eventFor = (spec: CollectionSpec, verb: CrudVerb): string => `${spec.id}.${verb}d`;

/** Every event a collection's generated operations raise. */
export const eventsFor = (spec: CollectionSpec): readonly string[] =>
  CRUD.filter((v) => v !== "list" && v !== "read" && !(spec.without ?? []).includes(v))
    .map((v) => eventFor(spec, v));

/** ⚠️ Reads need the read key; anything that changes a record needs write. */
export const permissionFor = (spec: CollectionSpec, verb: CrudVerb): string =>
  `${spec.permission}:${verb === "list" || verb === "read" ? "read" : "write"}`;

/**
 * ⚠️ THE TABLE NAME IS DERIVED AND NEVER DECLARED. An id and a table that can
 * differ is two names for one thing, and every generated artefact — the cascade,
 * the export, the migration — has to be told which one it is looking at.
 */
export const tableFor = (spec: CollectionSpec): string => spec.id.replace(/-/g, "_");

/**
 * Which column erasure follows, per scope.
 *
 * ⚠️ A COLLECTION WHOSE SCOPE HAS NO COLUMN IS ONE ERASURE CANNOT REACH, and it
 * does not fail — the sweep runs, reports success, and leaves the rows. That is
 * why the scope carries the column rather than a convention carrying it.
 */
export const eraseBy = (spec: CollectionSpec): { readonly column: string; readonly of: Scope["of"] } | null => {
  switch (spec.scope.of) {
    case "tenant": return { column: "tenant_id", of: "tenant" };
    case "subject": return { column: spec.scope.column, of: "subject" };
    case "global": return null;
  }
};

/* ----------------------------------------------------------------- the rules --- */

export type CollectionRefusal =
  | "field_invalid" | "global_holds_data" | "kept_without_reason"
  | "subject_column_missing" | "quota_without_ceiling" | "no_operations_at_all"
  | "not_a_name" | "vault_without_a_subject"
  | "searchable_unknown" | "searchable_not_text" | "searchable_vault";

/**
 * ⚠️ AN ID AND A FIELD NAME BECOME A TABLE AND A COLUMN, AND AN IDENTIFIER
 * CANNOT BE BOUND. Values go in as parameters; names are interpolated into DDL
 * because SQL has no other way to say them — so the safety has to be that a name
 * which is not a name never reaches the statement builder at all. This is the
 * check that makes the generated schema safe to generate.
 */
export const NAME = /^[a-z][a-z0-9-]*$/;
export const FIELD_NAME = /^[a-z][a-zA-Z0-9_]*$/;

export interface CollectionProblem {
  readonly collection: string;
  readonly why: CollectionRefusal;
  readonly detail: string;
}

/**
 * What a collection declaration can get wrong.
 *
 * ⚠️ `global_holds_data` IS THE SHARPEST. A global collection is the
 * deployment's own catalogue, read by every tenant and erased by nothing — so a
 * personal fact in one is a record no deletion request can ever reach, in the
 * one place nobody thinks to look because it is "just reference data".
 */
export function refuseCollection(spec: CollectionSpec): readonly CollectionProblem[] {
  const out: CollectionProblem[] = [];
  const at = (why: CollectionRefusal, detail: string) => out.push({ collection: spec.id, why, detail });

  for (const bad of refuseFields(spec.fields)) {
    at("field_invalid", `${bad.field}: ${bad.why}`);
  }

  /*
    ⚠️ A VAULT FACT IS ABOUT A PERSON, SO THE ROW HAS TO NAME ONE. The vault is
    keyed by SUBJECT — one salt per person, destroying it erases them, and every
    consent and grant is theirs to give. A tenant-scoped row has no person in it,
    so a vault-backed field there has no subject to be about: the write would
    have to invent one, and whatever it invented would be who the consent, the
    grant log and the erasure belonged to.

    ⚠️ AND IT IS REFUSED AT COMPOSITION RATHER THAN HANDLED AT THE WRITE, because
    the honest handling is a guess. This is the declaration being wrong, and the
    fix is either a subject scope or an ordinary column.
  */
  if (spec.scope.of !== "subject") {
    for (const [name, f] of Object.entries(spec.fields)) {
      if (f.vault) {
        at("vault_without_a_subject",
          `${name} is vault-backed and this collection is scoped by ${spec.scope.of} — a vault fact is about a person, and this row names none`);
      }
    }
  }

  if (!NAME.test(spec.id)) at("not_a_name", `"${spec.id}" cannot be a table name`);
  for (const name of Object.keys(spec.fields)) {
    if (!FIELD_NAME.test(name)) at("not_a_name", `"${name}" cannot be a column name`);
  }

  if (spec.scope.of === "global" && holdingsIn(spec.fields).length > 0) {
    at("global_holds_data",
      `holds ${holdingsIn(spec.fields).join(", ")} in a collection erasure can never reach`);
  }

  if (spec.scope.of === "subject" && !(spec.scope.column in spec.fields)) {
    at("subject_column_missing", `scope names "${spec.scope.column}", which is not one of its fields`);
  }

  if (spec.onClose.then === "keep" && !spec.onClose.why.trim()) {
    at("kept_without_reason", "kept past a tenant's closure with no reason given");
  }

  if (operationsFor(spec).length === 0) {
    at("no_operations_at_all", "every verb opted out, so nothing can reach it");
  }

  /*
    ⚠️ WHAT IS INDEXED LEAVES THIS DATABASE, WHICH IS WHY ALL THREE OF THESE ARE
    REFUSALS RATHER THAN WARNINGS. A searchable field's text is copied to a
    retrieval service, chunked and embedded — and a chunk cannot be un-said. So
    the declaration is checked before anything is ever sent.

    ⚠️ AND `searchable_vault` IS THE SHARPEST OF THE THREE. A vault-backed field
    is the one thing an app may not keep in its own table (D11): it lives
    encrypted, behind a recorded grant, destroyable by shredding one key.
    Indexing it would copy that fact out to a service that has no consent, keeps
    no record of who looked, and cannot be crypto-shredded — so the whole
    protection would be intact, and bypassed, with every guard green.
  */
  for (const name of spec.searchable ?? []) {
    const f = spec.fields[name];
    if (!f) {
      at("searchable_unknown", `searchable names "${name}", which is not one of its fields`);
    } else if (f.vault) {
      at("searchable_vault",
        `${name} is vault-backed — indexing it copies a special category out of the vault, `
        + `where there is no consent, no record of who looked, and no way to shred it`);
    } else if (f.kind !== "text" && f.kind !== "long") {
      at("searchable_not_text",
        `${name} is a ${f.kind} — search matches meaning in prose, and a number or a `
        + `reference indexed as prose returns noise for every query`);
    }
  }

  return out;
}

/* ------------------------------------------------------------------ search --- */

/**
 * ⚠️ WHETHER THERE IS ANYTHING TO FIND, ASKED IN ONE PLACE. Every derived
 * surface — the operation, the schema, the index job, the erasure — branches on
 * this, and two spellings of "is it searchable" is how a collection comes to be
 * indexed by one of them and erased by neither.
 */
export const isSearchable = (spec: CollectionSpec): boolean => (spec.searchable ?? []).length > 0;

/** ⚠️ Reading, because finding a record is reading it — see `permissionFor`. */
export const searchPermissionFor = (spec: CollectionSpec): string => `${spec.permission}:read`;

/**
 * ⚠️ THE TEXT THAT LEAVES, ASSEMBLED FROM THE DECLARED FIELDS AND NOTHING ELSE.
 * A row carries columns nobody named — the scope, the provenance, whatever the
 * app added since — and an index built from `SELECT *` would send every one of
 * them the day it was added, with no diff to review.
 */
export const searchTextOf = (
  spec: CollectionSpec, row: Readonly<Record<string, unknown>>,
): string =>
  (spec.searchable ?? [])
    .map((name) => String(row[name] ?? "").trim())
    .filter(Boolean)
    .join("\n\n");

/**
 * ⚠️ A `quota` NAMING NO ENTITLEMENT IS A CEILING NOTHING COUNTS. It reports the
 * obligation on every write and discharges it as "fine" — a limit on a price
 * list that refuses nothing, which is worse than no limit because it was sold.
 */
export const quotasWithoutCeiling = (
  collections: readonly CollectionSpec[],
  entitlements: readonly string[],
): readonly string[] =>
  collections
    .filter((c) => c.quota && !entitlements.includes(c.quota))
    .map((c) => `${c.id} counts against "${c.quota}", which nothing declares`);

/**
 * ⚠️ A `ref` POINTING NOWHERE IS A JOIN THAT RETURNS NOTHING, for ever, and it
 * reads on the screen as a record that simply has no parent.
 */
export const danglingRefs = (collections: readonly CollectionSpec[]): readonly string[] => {
  const known = new Set(collections.map((c) => c.id));
  const out: string[] = [];
  for (const c of collections) {
    for (const [name, f] of Object.entries(c.fields)) {
      if (f.kind === "ref" && f.to && !known.has(f.to)) out.push(`${c.id}.${name} → ${f.to}`);
    }
  }
  return out;
};

export const collection = (spec: CollectionSpec): CollectionSpec => spec;
