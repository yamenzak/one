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
  /**
   * How a phone treats it with no signal. See `offlineFor` for what each answer
   * costs and what it obliges.
   */
  readonly offline?: Offline;
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
  /**
   * WHICH OF ITS OWN FIELDS SAYS WHERE THE RECORD IS.
   *
   * ⚠️ A COLLECTION THAT HAS ONE AND DOES NOT SAY SO IS THE WHOLE FAILURE. A
   * member narrowed to one site reads every site's rows of it, the list is
   * complete and confident, and nothing anywhere refuses — see `reach.ts`. On
   * the places collection itself this is `"id"`: a place is the thing being
   * reached, so its own identifier is what the grant names.
   *
   * ⚠️ AND ABSENT IS A REAL ANSWER, NOT AN OVERSIGHT. What a thing IS — a
   * product, a supplier, a document template — belongs to the whole workspace
   * wherever anybody stands. Only what is somewhere is narrowed.
   */
  readonly reachBy?: string;
  /**
   * WHICH OF ITS FIELDS NAMES ONE OF THESE TO A PERSON.
   *
   * ⚠️ WITHOUT IT EVERY PICKER IN EVERY PRODUCT IS A LIST OF IDS. An operation
   * taking a `ref` is an operation asking "which one", and a declared form has
   * no other way to find out what to put on the row — `label.one` says what the
   * COLLECTION is called, and a field is what one ROW is called. Two different
   * questions, and only the first was ever answered.
   *
   * ⚠️ ABSENT IS A REAL ANSWER. A ledger entry, a movement, a session: rows
   * nobody refers to by name, that no form asks somebody to choose between. The
   * fallback is the identifier, which is the honest thing to show for a row that
   * has no name rather than a guess assembled out of its columns.
   */
  readonly names?: string;
  /** ⚠️ Which operations the collection does NOT get. See `operationsFor`. */
  readonly without?: readonly CrudVerb[];
}

export type CrudVerb = "list" | "read" | "create" | "update" | "delete";

export const CRUD: readonly CrudVerb[] = ["list", "read", "create", "update", "delete"];

/* ------------------------------------------------------------------ aside --- */

/**
 * A RECORD PUT ASIDE, AND THE TWO WAYS THAT HAPPENS.
 *
 * ⚠️ `delete` DOES NOT DESTROY, AND THAT IS THE WHOLE FEATURE. Somebody presses
 * it on the wrong row of a list at eleven at night; a hard `DELETE` makes that
 * unrecoverable from anywhere except a backup nobody has ever restored. A
 * record goes ASIDE, and there are thirty days in which pressing the other
 * button undoes it.
 *
 * ⚠️ `frozen` AND `binned` ARE NOT DEGREES OF THE SAME THING. A binned record is
 * ON ITS WAY OUT: nothing should reach it, and it is destroyed on a schedule. A
 * frozen one is STAYING and is out of the way — a product a workshop stopped
 * buying, whose deliveries, counts and label history all still point at it and
 * must go on resolving. Collapsed into one flag, either the trash never empties
 * or a discontinued product takes its own history with it in a month.
 *
 * ⚠️ AND IT IS A COLUMN RATHER THAN A SECOND TABLE, WHICH IS THE DECISION WITH A
 * COST. A separate table would make every existing read correct by construction;
 * a column means a list that forgets the filter shows deleted records. The
 * column wins on the other three: restoring is one `UPDATE` rather than a
 * re-insert that can collide, a reference into the record still resolves for the
 * thirty days that make restoring worth anything, and erasure is unchanged
 * because the row never left the table erasure already walks. The filter lives
 * in `records.ts` and nowhere else.
 */
export type Aside = "frozen" | "binned";

/**
 * ⚠️ HOW LONG THE TRASH HOLDS, AND IT IS NOT A SETTING. A workspace choosing
 * seven days would be a workspace that can shorten the window it will need on
 * the one occasion it matters, months before it happens. Thirty is long enough
 * to survive a holiday and short enough that a bin is not a second database.
 */
export const BIN_DAYS = 30;

/**
 * WHAT A PHONE DOES WITH NO SIGNAL.
 *
 * ⚠️ `none` IS THE DEFAULT AND IT IS THE HONEST ONE. A request that cannot be
 * made says so. Everything else here is a promise about a device we do not
 * control, and a promise a collection has not made must never be kept by
 * accident — answering a read from a stale copy nobody asked for is how a
 * screen comes to show last week's numbers with no way to tell.
 */
export type Offline = "cache" | "queue" | "none";

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
  CRUD.filter((verb) => !(spec.without ?? []).includes(verb)).map((verb) => verbId(spec.id, verb));

/**
 * WHICH FIELD SAYS WHAT ONE RECORD IS CALLED — the declaration, or a guess.
 *
 * ⚠️ `names` IS THE ANSWER AND THE GUESS IS THE FALLBACK, in that order, in one
 * place. Two readings of "what is this row called" is how a screen and a sheet
 * come to disagree about the same record: the trash listed a note by its title
 * while the sheet asking to delete it printed an identifier, because one guessed
 * and the other read the declaration and neither did both.
 *
 * ⚠️ AND THE GUESS IS THE FIRST TEXT FIELD, WHICH IS RIGHT BECAUSE OF WHAT A
 * COLLECTION IS. Almost every one leads with the thing's own name — a list has
 * to show something — so a collection that never declared `names` still reads as
 * words rather than as an id. Where it is wrong the row carries its collection
 * and its date as well, which is enough to decide.
 *
 * ⚠️ A PICKER DOES NOT USE IT, AND THAT IS NOT AN OVERSIGHT — see `choicesOf`.
 * Its rows are a CHOICE BETWEEN similar things, so a guessed field that is not
 * unique draws two options reading identically and there is no way to tell which
 * is which. A row in a list is not a choice; a dropdown is.
 */
export const namesIn = (spec: CollectionSpec): string | null =>
  (spec.names && spec.names in spec.fields ? spec.names : null)
  ?? Object.entries(spec.fields).find(([, f]) => f.kind === "text")?.[0]
  ?? null;

/**
 * ONE GENERATED VERB'S ID, FROM A COLLECTION'S ID ALONE.
 *
 * ⚠️ THE BROWSER NEEDS IT AND HAS NO `CollectionSpec` — which is the whole
 * reason this takes a string. A row that offers to change a fact
 * (`BlockSpec.edits`) writes through `<collection>.update`, and the screen the
 * door answered carries the collection's id and nothing else. Spelled at that
 * call site instead, the browser would hold a second copy of a name the kernel
 * already owns, and the two would disagree the day a verb is renamed.
 */
export const verbId = (collection: string, verb: CrudVerb): string =>
  `${collection}.${verb}`;

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
 * What one generated verb does when the request cannot be made.
 *
 * ⚠️ `queue` IMPLIES `cache` ON THE READS, AND THAT IS NOT A CONVENIENCE. A
 * collection somebody may WRITE with no signal is one they are working in with
 * no signal, and a write against a list that could not load is a person typing
 * into a screen that says nothing is there. The two halves are one declaration
 * because they are one situation.
 *
 * ⚠️ AND A QUEUED WRITE IS AN IDEMPOTENT ONE — see `crudFor`. A phone that held
 * a write in a basement cannot know whether the first attempt landed, so it asks
 * again; without a key to recognise the repeat, a shelf counted once is counted
 * twice. The same field that says "this may be written offline" is what makes
 * the replay safe, so the two cannot be configured apart.
 */
export const offlineFor = (spec: CollectionSpec, verb: CrudVerb): Offline => {
  const policy = spec.offline ?? "none";
  if (policy === "none") return "none";
  const reading = verb === "list" || verb === "read";
  if (reading) return "cache";
  return policy === "queue" ? "queue" : "none";
};

/**
 * ⚠️ EVERY GENERATED VERB'S POLICY, IN ONE MAP THE BROWSER CAN BE HANDED. The
 * page holds no manifest (D17), so what it knows about an operation is what the
 * deployment sent it — and a door deciding for itself which calls are safe to
 * hold would be a second answer to a question the declaration already settles.
 */
export const offlineBook = (
  specs: readonly CollectionSpec[],
): Readonly<Record<string, Offline>> => {
  const out: Record<string, Offline> = {};
  for (const spec of specs) {
    for (const verb of CRUD) {
      if ((spec.without ?? []).includes(verb)) continue;
      const policy = offlineFor(spec, verb);
      if (policy !== "none") out[`${spec.id}.${verb}`] = policy;
    }
  }
  return out;
};

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
  | "searchable_unknown" | "searchable_not_text" | "searchable_vault"
  | "names_unknown" | "names_not_words" | "names_vault";

/**
 * ⚠️ AN ID AND A FIELD NAME BECOME A TABLE AND A COLUMN, AND AN IDENTIFIER
 * CANNOT BE BOUND. Values go in as parameters; names are interpolated into DDL
 * because SQL has no other way to say them — so the safety has to be that a name
 * which is not a name never reaches the statement builder at all. This is the
 * check that makes the generated schema safe to generate.
 */
export const NAME = /^[a-z][a-z0-9-]*$/;
export const FIELD_NAME = /^[a-z][a-zA-Z0-9_]*$/;

/**
 * ⚠️ AND A NAME SQL ALREADY MEANS SOMETHING BY IS NOT A NAME EITHER. `from`
 * matches `FIELD_NAME` perfectly and produces
 * `CREATE TABLE shelf (…, from TEXT, …)`, which SQLite refuses to parse — so
 * `ensureSchema` throws, the DDL batch throws with it, and every route that
 * touches the database answers 503. That is the outage `sql.ts`'s own header is
 * about, reached through the one door its identifier check does not cover:
 * quoting would hide it, and a column nobody can write in a hand query is worse
 * than a field with a different name.
 *
 * ⚠️ THE LIST IS THE WORDS A DECLARATION WOULD PLAUSIBLY REACH FOR, not SQLite's
 * whole keyword table. Most of the 147 are unreachable here — `FIELD_NAME` bars
 * anything with a space in it, and nobody names a field `vacuum` — while these
 * are the ones a real manifest wants: where something came `from`, the `order`
 * it goes in, its `group`, the `default`, the `check`, the `index`, the `key`.
 * A word that turns out to be missing is a line here and a test, which is the
 * cheap direction; guessing at completeness would make the list unreadable.
 *
 * ⚠️ AND IT IS ONE STRING RATHER THAN SIXTY QUOTED ONES, because this module is
 * in the browser's entry chunk — the design package imports the kernel, so every
 * byte of it is parsed before the first frame. An array literal costs about six
 * bytes a word in quotes and commas that a space-separated string does not, and
 * `weight.test.ts` is what noticed.
 *
 * ⚠️ AND IT IS NOT EXPORTED, for the reason `BONES` was deleted: a name
 * published out of this module and imported by nothing is a seam somebody will
 * one day bind to, and what a field may be called is a question
 * `refuseCollection` already answers for every caller.
 */
const RESERVED_FIELD_NAMES: ReadonlySet<string> = new Set((
  "from to where select order group by on as in and or not null is like between "
  + "join left right inner outer cross using union all distinct having limit "
  + "offset insert into values update set delete create drop alter table index "
  + "view trigger primary foreign key unique check default references constraint "
  + "when then else end case cast collate escape exists"
).split(" "));

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
  if (RESERVED_FIELD_NAMES.has(spec.id)) {
    at("not_a_name", `"${spec.id}" is a word SQL already means something by, so it cannot be a table name`);
  }
  for (const name of Object.keys(spec.fields)) {
    if (!FIELD_NAME.test(name)) at("not_a_name", `"${name}" cannot be a column name`);
    /* ⚠️ LOWER-CASED, BECAUSE SQL KEYWORDS ARE NOT CASE-SENSITIVE. A field
       called `From` parses exactly as badly as `from` and would pass a check
       that compared the spelling as written. */
    else if (RESERVED_FIELD_NAMES.has(name.toLowerCase())) {
      at("not_a_name",
        `"${name}" is a word SQL already means something by — the generated `
        + `CREATE TABLE will not parse, and the whole schema fails with it`);
    }
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

  /*
    ⚠️ THE FIELD THAT NAMES A ROW IS READ BY A PICKER, so all three of these
    produce a control full of blanks rather than an error. A name that is not a
    field resolves to undefined on every row; a number or a reference reads as an
    id standing where a name should be; and a vault-backed one would put a
    special category in a dropdown in front of everybody who can open the form,
    with no consent asked and no record of who looked.
  */
  if (spec.names !== undefined) {
    const f = spec.fields[spec.names];
    if (!f) {
      at("names_unknown", `names by "${spec.names}", which is not one of its fields`);
    } else if (f.vault) {
      at("names_vault",
        `${spec.names} is vault-backed — a picker draws it for everybody who can open the `
        + `form, with no consent asked and no record of who saw it`);
    } else if (f.kind !== "text" && f.kind !== "enum") {
      at("names_not_words",
        `${spec.names} is a ${f.kind} — what names a row to a person is words, and a `
        + `${f.kind} in a dropdown is an identifier standing where a name should be`);
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
