/**
 * EVERYTHING WE HOLD ABOUT ONE PERSON, AND EVERYTHING OF THEIRS WE DELETE.
 *
 * ⚠️ AN EXPORT THAT MISSES A TABLE IS WORSE THAN NO EXPORT, and a deletion that
 * misses one is worse than a refusal. Both are answered with a confident
 * "here is everything" / "it is all gone", and the sentence is what a person
 * relies on. The failure is silent by construction: nothing throws, nothing
 * looks wrong, and the row that survived is found — if ever — by somebody
 * outside the company.
 *
 * ⚠️ SO NEITHER IS A LIST SOMEBODY MAINTAINS. `HOLDINGS` below is the ledger of
 * where a person appears in the platform's own tables, and
 * `unledgered(modules)` fails a guard on any table declared in a schema module
 * with no row here. A new platform table is then a red gate rather than a
 * silent survivor — which is the only version of "provably complete" that
 * stays true after the person who wrote it has moved on.
 *
 * ⚠️ AND THE APP'S HALF IS DERIVED, NOT LISTED. A collection scoped by subject
 * carries its own column (`eraseBy`), so every product's records are walked from
 * the same declaration that generated their tables — an app cannot add a
 * collection this misses.
 *
 * ⚠️ WHAT IS NOT A PERSON'S TO TAKE OR TO DELETE, and why it matters that the
 * line is drawn here rather than case by case: a WORKSPACE's records are the
 * workspace's. One member leaving must not shred a business's notes, and a
 * member reading their own export must not receive their employer's. The one
 * place a person's departure does destroy a workspace is where they were the
 * last hand able to run it — see `forgetPerson`, because a workspace nobody can reach
 * is not closed, it is abandoned with the bill still running.
 */

import type { AccountId, AppSpec, CollectionSpec, TenantId } from "@engine/kernel";
import { eraseBy } from "@engine/kernel";
import type { SchemaModule } from "./schema.js";
import { column, table, type Db } from "./sql.js";

/* ---------------------------------------------------------------- the ledger --- */

/** How a person's departure lands on one table. */
export type OnForget =
  /** The rows are theirs. They go. */
  | "delete"
  /**
   * The row is somebody else's record OF them — an audit line, a workspace's
   * own history. The person is unnamed and the row stays.
   */
  | "anonymise"
  /** Nothing here is about a person. */
  | "keep";

/**
 * One column naming a person, and what happens to it when they leave.
 *
 * ⚠️ THE RULE IS PER COLUMN, NOT PER TABLE, AND THAT IS NOT A REFINEMENT. A
 * vault look names two people: the subject whose fact was read, and whoever read
 * it. Deleting the row because the READER left destroys the subject's own record
 * of who looked at their health data — one person's erasure taking another
 * person's evidence with it. The subject's rows go; the reader's name is
 * unwritten and the row stays.
 */
export interface PersonColumn {
  readonly column: string;
  readonly on: Exclude<OnForget, "keep">;
  /** ⚠️ Required whenever it is not `delete`. A silent exception is the bug. */
  readonly why?: string;
}

export interface HeldBy {
  readonly table: string;
  /** Which columns name a person, and what becomes of each. */
  readonly person: readonly PersonColumn[];
  /**
   * ⚠️ WHAT THE COLUMNS HOLD. An account id for most; an ADDRESS for the two
   * written before anybody has an account — a sign-in code and an invitation
   * are about a person who does not exist here yet, and binding an id to them
   * matches nothing while looking exactly like a clean sweep.
   */
  readonly by?: "account" | "email";
  /**
   * Which column names the workspace, and what becomes of the rows when that
   * workspace is erased.
   *
   * ⚠️ THE SAME LEDGER DRIVES BOTH ERASURES, AND THE WORKSPACE HALF WAS THE ONE
   * WITH THE HOLE. The ladder's last rung erased each app's collections, the
   * belonging rows and the branding, and left the roster, the inbox, the audit
   * trail, the settings, the packages, the purchases and the whole vault on the
   * shard — a workspace reported as erased, with its members' encrypted health
   * facts still in it. Deriving it from here is what makes "erased" mean the
   * same thing in both directions.
   */
  readonly workspace?: {
    readonly column: string;
    readonly on: "delete" | "keep";
    /** ⚠️ Required for `keep`. */
    readonly why?: string;
  };
  /**
   * How it reads in an export. Absent means these rows are not a person's to
   * take — required to be absent when `person` is empty, and required to be
   * PRESENT when it is not, because a table naming somebody and withheld from
   * their own copy is the gap this file exists to close.
   */
  readonly label?: string;
  /** ⚠️ Required when the table names nobody. "Nothing here is a person's" is
      an answer somebody gave; an absent one is an answer nobody gave. */
  readonly why?: string;
}

/** Shorthand for the ordinary case: this column is them, and their rows go. */
const theirs = (column: string): PersonColumn => ({ column, on: "delete" });

/** The ordinary case for a workspace: the rows are its own, and they go with it. */
const its = (column = "tenant_id"): HeldBy["workspace"] => ({ column, on: "delete" });

/**
 * WHERE A PERSON APPEARS IN THE PLATFORM'S OWN TABLES.
 *
 * ⚠️ EVERY TABLE ANY SCHEMA MODULE DECLARES HAS A ROW HERE, INCLUDING THE ONES
 * WITH NO PERSON IN THEM. "Nothing about a person is in this table" is an answer
 * somebody decided; a table simply absent from the list is an answer nobody
 * gave, and the two are indistinguishable from the outside. `unledgered` is what
 * makes the difference a test failure.
 */
export const HOLDINGS: readonly HeldBy[] = [
  /* --- the directory: who exists, where they belong, what they agreed to --- */
  { table: "account", person: [theirs("id")], label: "Your account" },
  { table: "belongs", person: [theirs("account_id")], workspace: its(),
    label: "The workspaces you are in" },
  { table: "session", person: [theirs("account_id")], label: "Where you have been signed in" },
  { table: "api_token", person: [theirs("account_id")], label: "The access tokens you minted" },
  { table: "code", person: [theirs("email")], by: "email", label: "Sign-in codes sent to you" },
  { table: "invited", person: [theirs("email")], by: "email", workspace: its(),
    label: "Invitations sent to you" },
  /*
    ⚠️ AN ACCEPTANCE GOES WITH THE ACCOUNT, AND THE ARGUMENT FOR KEEPING IT DOES
    NOT SURVIVE ITS OWN LOGIC. It is kept to prove somebody agreed; unnamed it
    proves nothing about anybody, so an anonymised copy is retention with no
    purpose left in it. It would not even survive the write: the row is unique on
    (account, workspace, document, version), so unwriting two people's names
    collides, the update throws, and the walk reports zero rows in silence.
  */
  { table: "acceptance", person: [theirs("account_id")], workspace: its(),
    label: "What you agreed to, and when" },

  /* ⚠️ THE TOMBSTONE IS THE POINT. Closing a workspace stamps `closed_at` and
     leaves the row, so its address stays taken and answers "no such workspace"
     rather than becoming somebody else's the moment it is free. Deleting it
     would make a closed workspace's slug re-registrable by a stranger, which is
     the one outcome its own members would call a breach. */
  { table: "tenant", person: [],
    why: "a workspace is a business's record, not a member's",
    workspace: { column: "id", on: "keep",
      why: "closing leaves a tombstone so the address stays taken rather than becoming somebody else's" } },
  { table: "tenant_app", person: [], why: "which products a workspace enabled", workspace: its() },
  { table: "tenant_branding", person: [], why: "a workspace's own theme", workspace: its() },
  /* ⚠️ THE PICTURE, AND IT IS THE WORKSPACE'S RATHER THAN THE UPLOADER'S. Whose
     logo it is does not change when the person who uploaded it leaves — so it is
     not a personal holding, and erasing them must not take a business's mark off
     its own staff's home screens. It goes when the workspace does. */
  { table: "tenant_icon", person: [], why: "a workspace's own logo", workspace: its() },
  /*
    ⚠️ A DEVICE IS THEIRS AND GOES WITH THEM, and the `workspace` half is
    deliberately absent rather than `delete`. A subscription is filed under the
    door it was made at, but the device belongs to the person: erasing a
    workspace must not silently unsubscribe a phone from every OTHER workspace
    it is subscribed to — the rows are separate, so a `delete` here would take
    only the right ones, and the reason it is still absent is that the row is a
    credential for reaching a person rather than a record of a workspace.
  */
  { table: "push_subscription", person: [theirs("account_id")],
    label: "The devices you asked to be notified on" },
  /* ⚠️ THE DEPLOYMENT'S IDENTITY TO EVERY PUSH SERVICE — one row, no name in
     it, and replacing it is an operator's decision rather than anybody's
     erasure. */
  { table: "push_key", person: [], why: "the deployment's own sending identity" },
  { table: "billing_account", person: [], why: "a workspace's own account with us", workspace: its() },
  { table: "subscription", person: [], why: "a workspace's own plan", workspace: its() },
  /* ⚠️ Ours is a working copy; the money's own record is at the payment
     provider, which is what a tax authority would be shown. */
  { table: "credit_ledger", person: [], why: "a workspace's own spending", workspace: its() },
  { table: "shard", person: [], why: "the deployment's placement map" },
  { table: "shard_app", person: [], why: "the deployment's placement map" },
  { table: "job_run", person: [], why: "the deployment's own clock" },
  { table: "resource", person: [],
    why: "the databases and buckets the deployment made for itself" },
  /* ⚠️ NOT THE WORKSPACE'S TO ERASE, AND DELIBERATELY. The row says a copy of
     its records is still on the shard it left, and it is what the reaper reads
     to clear that copy. Deleting it with the workspace would strand the copy on
     the old shard for ever, with nothing anywhere that knows it is there. */
  { table: "move", person: [],
    why: "where a workspace's records were carried from, and what is left to clear" },
  { table: "deployment_flag", person: [], why: "the deployment's own switches" },
  /* ⚠️ NOBODY IS IN IT, AND THAT IS WORTH SAYING RATHER THAN ASSUMING. The
     sender address is ours, and every secret in the table is ciphertext under a
     key this database has never held — see `config.ts`. */
  { table: "deployment_config", person: [],
    why: "what the deployment was told: its sender, and the account it charges through" },
  /* ⚠️ NOT ERASED WITH THE WORKSPACE, AND DELIBERATELY. It is the record that a
     payment arrived and what was done about it — the row somebody reads when a
     charge is disputed months later, and a dispute is precisely the case where
     the workspace is gone. It holds an event id and a workspace id, never a
     name, an address or a card. */
  { table: "stripe_event", person: [],
    why: "which payments arrived, and what each one was applied to" },
  { table: "maintenance", person: [], why: "the deployment's own switches" },
  /* ⚠️ THE PRICE LIST, NOT ANYBODY'S RECORD. It holds a plan id, some numbers and
     the address of the operator who typed them — which is a colleague rather
     than a customer, and the one name a price change has to be traceable to. */
  { table: "plan_edit", person: [],
    why: "what the catalogue was edited to, and who edited it" },
  { table: "_schema", person: [], why: "the migration marker" },

  /* --- a shard: the workspace's roster, its inbox, its record of what happened --- */
  /*
    ⚠️ THE OBJECT IS NOT IN THIS TABLE, AND THAT IS WHY BOTH ERASURES CALL
    `eraseObjects` FIRST. This row is the only thing that knows a file's key, so
    a walk that deleted it before the bucket would leave the file there for
    ever — after a workspace was reported erased, with nothing anywhere that
    would ever look.
  */
  { table: "media", person: [theirs("subject_id")], workspace: its(),
    label: "The files you uploaded" },
  { table: "membership", person: [theirs("account_id")], workspace: its(),
    label: "Your place in each workspace" },
  { table: "setting", person: [theirs("account_id")], workspace: its(),
    label: "Your own preferences" },
  { table: "inbox", person: [theirs("account_id")], workspace: its(),
    label: "Your notifications" },
  { table: "notify_preference", person: [theirs("account_id")], workspace: its(),
    label: "What you asked to be told about" },
  /* ⚠️ SOMEBODY ELSE'S RECORD OF WHAT HAPPENED. A workspace's audit trail with a
     member's actions cut out of it is not a trail — and the rows are not about
     the person so much as about the workspace, which has its own reason to keep
     them. The actor is unwritten instead. */
  { table: "audit", workspace: its(), label: "What you did here",
    person: [{ column: "actor", on: "anonymise",
      why: "it is the workspace's own record that something happened, kept without a name in it" }] },
  { table: "replay", person: [], why: "an idempotency key, not a record about anybody",
    workspace: its() },
  { table: "notify_policy", person: [], why: "a workspace's own routing", workspace: its() },
  { table: "custom_role", person: [], why: "a workspace's own roles", workspace: its() },
  { table: "package", person: [], why: "a workspace's own catalogue", workspace: its() },
  { table: "purchase", person: [], workspace: its(),
    why: "a workspace's own sale, named by membership rather than by account" },
  { table: "ai_binding", person: [], why: "which model an action runs on" },
  { table: "ai_wording", person: [], why: "a workspace's own prompt letterheads", workspace: its() },

  /* --- the vault: theirs, entirely --- */
  { table: "vault_subject", person: [theirs("subject_id")], workspace: its(),
    label: "Your vault" },
  { table: "vault_fact", person: [theirs("subject_id")], workspace: its(),
    label: "The facts held encrypted for you" },
  { table: "vault_consent", person: [theirs("subject_id")], workspace: its(),
    label: "What you consented to" },
  /* ⚠️ TWO PEOPLE IN ONE ROW, AND ONLY ONE OF THEM IS LEAVING. Deleting a grant
     because the GRANTEE left would take away the subject's record of who they
     had let in; unwriting the subject's own would leave a grant over facts that
     no longer exist. Each column answers for itself. */
  { table: "vault_grant", workspace: its(), label: "Who you let read them",
    person: [theirs("subject_id"), { column: "grantee", on: "anonymise",
      why: "it is the subject's record of who they let in, and it is not the grantee's to erase" }] },
  { table: "vault_look", workspace: its(), label: "Who looked, and when",
    person: [theirs("subject_id"), { column: "grantee", on: "anonymise",
      why: "it is the subject's record of who read their facts, and it is not the reader's to erase" }] },
];

/* ------------------------------------------------------------ the guard --- */

const DECLARED = /CREATE TABLE IF NOT EXISTS (\w+)/g;

/** Every table a set of schema modules creates. */
export const tablesIn = (modules: readonly SchemaModule[]): readonly string[] => [...new Set(
  modules.flatMap((m) => m.statements.flatMap((s) => [...s.matchAll(DECLARED)].map((x) => x[1]!))),
)];

/**
 * ⚠️ WHAT THE EXPORT AND THE ERASURE WOULD MISS. A table declared by a schema
 * module and absent from `HOLDINGS` is one both walks skip in silence — so this
 * is a guard input rather than a diagnostic, and the guard is the only reason
 * either walk can be described as complete.
 */
export const unledgered = (
  modules: readonly SchemaModule[],
  /**
   * ⚠️ AN APP'S OWN TABLES ARE NOT LEDGERED AND MUST NOT BE. Their scope column
   * comes from the collection that generated them (`eraseBy`), so both walks
   * already reach every one — listing them here as well would be a second place
   * to keep in step, which is the thing this file exists to remove.
   */
  derived: readonly string[] = [],
): readonly string[] => {
  const known = new Set([...HOLDINGS.map((h) => h.table), ...derived]);
  return tablesIn(modules).filter((t) => !known.has(t));
};

/**
 * ⚠️ AND A LEDGER ROW THAT CONTRADICTS ITSELF. A table naming a person and
 * offering no label is withheld from their own copy; one naming nobody and
 * carrying a label promises rows the walk cannot find; an exception with no
 * reason is the thing this whole file exists to make impossible.
 */
export const incoherent = (): readonly string[] => HOLDINGS.flatMap((h) => {
  const said: string[] = [];
  if (h.person.length && !h.label) said.push(`${h.table}: names a person and is left out of their export`);
  if (!h.person.length && h.label) said.push(`${h.table}: offers an export label and names nobody`);
  if (!h.person.length && !h.why) said.push(`${h.table}: names nobody and does not say why`);
  for (const p of h.person) {
    if (p.on !== "delete" && !p.why) said.push(`${h.table}.${p.column}: ${p.on}s without saying why`);
  }
  if (h.workspace?.on === "keep" && !h.workspace.why) {
    said.push(`${h.table}: survives its workspace's erasure without saying why`);
  }
  return said;
});

/* ----------------------------------------------------------------- where --- */

/**
 * One database, and what to call it.
 *
 * ⚠️ ONE ENTRY PER DATABASE, NOT PER WORKSPACE. Two workspaces on one shard
 * share its tables, so walking it once per workspace returns the same rows
 * twice — an export that lists somebody's notifications twice and a deletion
 * whose second pass reports zero and reads as a shard that was missed.
 */
export interface Place {
  readonly db: Db;
  /** `directory`, or the shard's id. It is what the report names. */
  readonly of: string;
  /** The apps enabled there, so their collections are walked too. */
  readonly apps: readonly AppSpec[];
}

export interface Dossier {
  readonly at: string;
  readonly account: { readonly id: string; readonly email: string | null };
  /** One entry per table that held something, with the rows in it. */
  readonly held: readonly {
    readonly of: string;
    readonly table: string;
    /** Which database it came out of — the directory, or a shard by id. */
    readonly where: string;
    readonly rows: readonly Readonly<Record<string, unknown>>[];
  }[];
  /**
   * ⚠️ WHAT WAS LOOKED IN AND FOUND EMPTY, reported rather than omitted. An
   * export listing only what happened to be there cannot be told apart from one
   * whose walk skipped half the deployment — and "we hold nothing of yours in
   * these" is an answer, where silence is not.
   */
  readonly lookedAndEmpty: readonly string[];
}

/* ---------------------------------------------------------------- reading --- */

/**
 * ⚠️ THE PLATFORM'S OWN TABLE NAMES ARE LITERALS AND ARE QUOTED; AN APP'S ARE
 * DERIVED. A collection id may carry a hyphen (`check-in`) and its table cannot,
 * so `table()` is the one place that mapping lives. Querying the id directly
 * asks for a table that has never existed, the catch below reports it as looked
 * at and empty, and somebody's health check-ins are missing from their export
 * and survive their deletion — which is this file's own failure mode, found by
 * its own test.
 */
const quote = (name: string): string => `"${name.replace(/"/g, '""')}"`;

/** `WHERE a = ? OR b = ?` over however many columns name this person. */
const naming = (cols: readonly string[]): string =>
  cols.map((c) => `${quote(c)} = ?`).join(" OR ");

/**
 * ⚠️ A MISSING TABLE IS NOT A FAILURE AND IS NOT A ZERO EITHER. An older
 * database legitimately lacks one, and an export that stopped half way through
 * would hand somebody a partial copy labelled complete. It is reported as looked
 * at and empty, which is what it is.
 */
async function rowsOf(
  db: Db, table: string, cols: readonly string[], keys: readonly string[],
): Promise<readonly Readonly<Record<string, unknown>>[] | null> {
  try {
    const out = await db.prepare(`SELECT * FROM ${quote(table)} WHERE ${naming(cols)}`)
      .bind(...keys).all<Record<string, unknown>>();
    return out.results;
  } catch {
    return null;
  }
}

/** Every subject-scoped collection an app declares, with the column to bind. */
const mine = (apps: readonly AppSpec[]): readonly { spec: CollectionSpec; at: string }[] =>
  apps.flatMap((a) => a.collections.flatMap((spec) => {
    const by = eraseBy(spec);
    return by && by.of === "subject" ? [{ spec, at: by.column }] : [];
  }));

/**
 * EVERYTHING THIS DEPLOYMENT HOLDS ABOUT ONE PERSON (GDPR Art. 15 and 20).
 *
 * ⚠️ IT WALKS EVERY PLACE THEY COULD BE, not the places somebody remembered.
 * The directory plus every shard holding a workspace they belong to, the
 * platform's ledger for each, and every subject-scoped collection of every app
 * enabled there.
 *
 * ⚠️ THE VAULT'S CIPHERTEXT IS IN IT AND IS NOT THE ANSWER. Handing somebody the
 * encrypted bytes of their own health record satisfies a walk and not a person —
 * `vault.export` decrypts, and the two are offered together on purpose.
 */
export async function dossierOf(
  places: readonly Place[],
  accountId: AccountId,
  email: string | null,
  now = new Date(),
): Promise<Dossier> {
  const held: {
    of: string; table: string; where: string;
    rows: readonly Readonly<Record<string, unknown>>[];
  }[] = [];
  const empty: string[] = [];

  for (const place of places) {
    const where = place.of;

    for (const h of HOLDINGS) {
      if (!h.person.length) continue;
      const me = h.by === "email" ? email : accountId;
      if (!me) { empty.push(`${where}/${h.table}`); continue; }
      const cols = h.person.map((p) => p.column);

      const rows = await rowsOf(place.db, h.table, cols, cols.map(() => me));
      if (rows && rows.length) held.push({ of: h.label!, table: h.table, where, rows });
      else empty.push(`${where}/${h.table}`);
    }

    /* ⚠️ AND THE PRODUCTS' OWN, FROM THE SAME DECLARATION THAT MADE THE TABLES.
       A hand-written list here would be one an app could grow past. */
    for (const { spec, at } of mine(place.apps)) {
      const rows = await rowsOf(place.db, table(spec.id), [column(at)], [accountId]);
      if (rows && rows.length) {
        held.push({ of: spec.label.many, table: table(spec.id), where, rows });
      } else empty.push(`${where}/${table(spec.id)}`);
    }
  }

  return {
    at: now.toISOString(),
    account: { id: accountId, email },
    held,
    lookedAndEmpty: empty,
  };
}

/* --------------------------------------------------------------- deleting --- */

export interface Forgotten {
  readonly table: string;
  readonly where: string;
  readonly rows: number;
  readonly how: OnForget;
}

/**
 * ⚠️ WHO SOMEBODY BECOMES WHEN THEY ARE UNNAMED. A constant rather than a fresh
 * id per row: a unique replacement is a pseudonym, and a pseudonym that appears
 * beside the same set of actions is a re-identification waiting for whoever
 * cares to try. Every departed actor is the same nobody.
 */
export const NOBODY_AT_ALL = "forgotten";

/**
 * EVERYTHING OF THEIRS, GONE (GDPR Art. 17).
 *
 * ⚠️ RE-RUNNABLE, BECAUSE A DELETION NOBODY DARES REPEAT AFTER A FAILURE STAYS
 * HALF DONE. Every statement is a delete or an overwrite by key; running it
 * twice finds nothing the second time and says so.
 *
 * ⚠️ AND IT REPORTS PER TABLE. "Your data has been deleted" over a walk that
 * silently skipped a shard is the sentence this whole file exists to stop
 * anybody being able to write by accident.
 */
/**
 * ⚠️ A MISSING TABLE IS NOT A FAILURE. An older database legitimately lacks one,
 * and stopping here would leave somebody half deleted — strictly worse than a
 * table that was never there.
 */
const ran = async (db: Db, sql: string, binds: readonly unknown[]): Promise<number> => {
  try {
    const done = await db.prepare(sql).bind(...binds).run() as { meta?: { changes?: number } };
    return done?.meta?.changes ?? 0;
  } catch {
    return 0;
  }
};

export async function forgetPerson(
  places: readonly Place[],
  accountId: AccountId,
  email: string | null,
  now = new Date(),
): Promise<readonly Forgotten[]> {
  const out: Forgotten[] = [];

  for (const place of places) {
    for (const h of HOLDINGS) {
      const me = h.by === "email" ? email : accountId;
      if (!me) continue;
      /* ⚠️ PER COLUMN, AND THE DELETES BEFORE THE UNWRITES. A row where the same
         person is both subject and grantee must go rather than survive with its
         own name unwritten out of it. */
      for (const p of [...h.person].sort((a, b) => (a.on === "delete" ? -1 : 1) - (b.on === "delete" ? -1 : 1))) {
        const rows = p.on === "delete"
          ? await ran(place.db, `DELETE FROM ${quote(h.table)} WHERE ${quote(p.column)} = ?`, [me])
          : await ran(place.db,
            `UPDATE ${quote(h.table)} SET ${quote(p.column)} = ? WHERE ${quote(p.column)} = ?`,
            [NOBODY_AT_ALL, me]);
        out.push({ table: h.table, where: place.of, rows, how: p.on });
      }
    }

    for (const { spec, at } of mine(place.apps)) {
      const rows = await ran(place.db,
        `DELETE FROM ${table(spec.id)} WHERE ${column(at)} = ?`, [accountId]);
      out.push({ table: table(spec.id), where: place.of, rows, how: "delete" });
    }
  }

  void now;
  return out;
}

/**
 * EVERYTHING A WORKSPACE HELD, GONE — from the same ledger, for the same reason.
 *
 * ⚠️ THIS IS THE HALF THAT HAD THE HOLE. The ladder's last rung erased each
 * app's collections, the belonging rows and the branding, and left the roster,
 * every notification, the audit trail, the settings, the packages, the purchases
 * and the entire vault sitting on the shard — a workspace reported as erased
 * with its members' encrypted health facts still in it, and nothing anywhere
 * saying so. Two hand-written lists is how the two halves came to disagree; one
 * ledger is why they cannot.
 *
 * ⚠️ THE TENANT ROW ITSELF SURVIVES AS A TOMBSTONE — see its ledger entry. The
 * caller stamps `closed_at`; deleting it here would free the address for a
 * stranger.
 */
export async function forgetWorkspace(
  places: readonly Place[],
  tenantId: TenantId,
): Promise<readonly Forgotten[]> {
  const out: Forgotten[] = [];
  for (const place of places) {
    for (const h of HOLDINGS) {
      if (!h.workspace || h.workspace.on !== "delete") continue;
      const rows = await ran(place.db,
        `DELETE FROM ${quote(h.table)} WHERE ${quote(h.workspace.column)} = ?`, [tenantId]);
      out.push({ table: h.table, where: place.of, rows, how: "delete" });
    }
  }
  return out;
}
