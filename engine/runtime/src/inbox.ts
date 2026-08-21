/**
 * THE INBOX — where somebody finds what they were told.
 *
 * ⚠️ AND WHAT FILLS IT IS `dispatch.ts`, HANGING OFF `emits`. An operation names
 * the events it raises and a notification names the event that raises it, so
 * telling somebody is a consequence of two declarations rather than a call a
 * handler could forget. For three stages the write below had no caller at all,
 * and nothing looked wrong: an inbox nothing files into is indistinguishable
 * from a quiet week.
 *
 * ⚠️ A NOTIFICATION SYSTEM WITH NO INBOX IS THE FAILURE THIS FRAMEWORK IS ABOUT.
 * A previous platform had the schema, the Durable Object, four routes, a
 * registry and sixteen dispatch sites — and nowhere a person could look. Every
 * suite was green for three stages, and the note saying the bell was coming
 * became the reason nobody checked.
 *
 * ⚠️ SO THE INBOX IS ALWAYS WRITTEN, WHATEVER THE POLICY SAYS. Email and push
 * are interruptions and a person may refuse them; the inbox is the RECORD, and
 * somebody who muted everything still needs somewhere to find what happened
 * while they were not looking.
 *
 * ⚠️ AND THE AUDIENCE IS A PERMISSION, RESOLVED AGAINST THE ROSTER. Addressing a
 * notification to a role name reaches nobody the moment a workspace makes a role
 * of its own — and it fails silently, because a dispatch to an empty audience
 * looks exactly like a dispatch that worked.
 */

import type {
  Branding, Channel, Kind, Letter, LetterRefusal, NotificationBook, Policy, Preference,
  TenantId, WhitelabelDef,
} from "@engine/kernel";
import {
  brandedSurfaces, channelsFor, inAudience, mayBrand, newId, permissionsFor, refuseLetter,
} from "@engine/kernel";
import type { RoleRegistry } from "@engine/kernel";
import { membersOf } from "./membership.js";
import type { SchemaModule } from "./schema.js";
import type { Db } from "./sql.js";

/* ----------------------------------------------------------------- schema --- */

export const INBOX_SCHEMA: SchemaModule = {
  id: "inbox",
  statements: [
    `CREATE TABLE IF NOT EXISTS inbox (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, account_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT, link TEXT, tone TEXT NOT NULL, icon TEXT NOT NULL, at TEXT NOT NULL, seen_at TEXT);`,
    `CREATE INDEX IF NOT EXISTS ix_inbox_person ON inbox (tenant_id, account_id, at);`,
    `CREATE INDEX IF NOT EXISTS ix_inbox_unseen ON inbox (tenant_id, account_id, seen_at);`,
    /* ⚠️ Two levels, two tables. The workspace's ceiling and a person's own
       narrowing are different authorities and must not share a row. */
    `CREATE TABLE IF NOT EXISTS notify_policy (tenant_id TEXT NOT NULL, type TEXT NOT NULL, channels TEXT NOT NULL, PRIMARY KEY (tenant_id, type));`,
    `CREATE TABLE IF NOT EXISTS notify_preference (tenant_id TEXT NOT NULL, account_id TEXT NOT NULL, type TEXT NOT NULL, channels TEXT NOT NULL, PRIMARY KEY (tenant_id, account_id, type));`,
    /* ⚠️ A THIRD TABLE, BECAUSE A WORKSPACE'S WORDS ARE NOT ITS ROUTING. The two
       above answer "who is told, on what"; this answers "in whose words", and
       only for the messages the workspace AUTHORS (`brandable`). Sharing a row
       with the policy would mean a workspace muting a type also losing the
       letter it had written for it. */
    `CREATE TABLE IF NOT EXISTS notify_letter (tenant_id TEXT NOT NULL, type TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, signature TEXT, at TEXT NOT NULL, PRIMARY KEY (tenant_id, type));`,
  ],
};

/* ---------------------------------------------------------------- reading --- */

export interface Note {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly body: string | null;
  readonly link: string | null;
  readonly tone: string;
  readonly icon: string;
  readonly at: string;
  readonly seen: boolean;
}

const asNote = (r: Record<string, unknown>): Note => ({
  id: r.id as string,
  type: r.type as string,
  title: r.title as string,
  body: (r.body as string | null) ?? null,
  link: (r.link as string | null) ?? null,
  tone: r.tone as string,
  icon: r.icon as string,
  at: r.at as string,
  seen: r.seen_at !== null,
});

export async function inboxOf(
  db: Db, tenantId: TenantId, accountId: string, limit = 50,
): Promise<readonly Note[]> {
  const rows = await db.prepare(
    `SELECT * FROM inbox WHERE tenant_id = ? AND account_id = ? ORDER BY at DESC LIMIT ?`)
    .bind(tenantId, accountId, limit).all();
  return rows.results.map(asNote);
}

export async function unseenCount(
  db: Db, tenantId: TenantId, accountId: string,
): Promise<number> {
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM inbox WHERE tenant_id = ? AND account_id = ? AND seen_at IS NULL`)
    .bind(tenantId, accountId).first<{ n: number }>();
  return row?.n ?? 0;
}

export async function markSeen(
  db: Db, tenantId: TenantId, accountId: string, id: string | null, now = new Date(),
): Promise<void> {
  const sql = id
    ? `UPDATE inbox SET seen_at = ? WHERE tenant_id = ? AND account_id = ? AND id = ? AND seen_at IS NULL`
    : `UPDATE inbox SET seen_at = ? WHERE tenant_id = ? AND account_id = ? AND seen_at IS NULL`;
  await db.prepare(sql).bind(...(id ? [now.toISOString(), tenantId, accountId, id]
    : [now.toISOString(), tenantId, accountId])).run();
}

/* ---------------------------------------------------------------- policy --- */

const parse = (rows: readonly { type: string; channels: string }[]): Record<string, readonly Channel[]> =>
  Object.fromEntries(rows.map((r) => [r.type, JSON.parse(r.channels) as Channel[]]));

export async function policyOf(db: Db, tenantId: TenantId): Promise<Policy> {
  const rows = await db.prepare(`SELECT type, channels FROM notify_policy WHERE tenant_id = ?`)
    .bind(tenantId).all<{ type: string; channels: string }>();
  return parse(rows.results);
}

export async function preferenceOf(
  db: Db, tenantId: TenantId, accountId: string,
): Promise<Preference> {
  const rows = await db.prepare(
    `SELECT type, channels FROM notify_preference WHERE tenant_id = ? AND account_id = ?`)
    .bind(tenantId, accountId).all<{ type: string; channels: string }>();
  return parse(rows.results);
}

export async function setPolicy(
  db: Db, tenantId: TenantId, type: string, channels: readonly Channel[],
): Promise<void> {
  await db.prepare(`INSERT INTO notify_policy (tenant_id, type, channels) VALUES (?, ?, ?)
    ON CONFLICT(tenant_id, type) DO UPDATE SET channels = excluded.channels`)
    .bind(tenantId, type, JSON.stringify(channels)).run();
}

export async function setPreference(
  db: Db, tenantId: TenantId, accountId: string, type: string, channels: readonly Channel[],
): Promise<void> {
  await db.prepare(
    `INSERT INTO notify_preference (tenant_id, account_id, type, channels) VALUES (?, ?, ?, ?)
     ON CONFLICT(tenant_id, account_id, type) DO UPDATE SET channels = excluded.channels`)
    .bind(tenantId, accountId, type, JSON.stringify(channels)).run();
}

/* -------------------------------------------------------------- dispatch --- */

export interface Told {
  readonly accountId: string;
  readonly email: string;
  readonly channels: readonly Channel[];
}

export interface Dispatch {
  readonly type: string;
  readonly tenantId: TenantId;
  readonly values: Readonly<Record<string, string>>;
  /** ⚠️ Somebody this is about, who should not be told they did it themselves. */
  readonly except?: string | null;
}

/**
 * Who is told, and how.
 *
 * ⚠️ THE AUDIENCE IS RESOLVED FROM THE ROSTER, THROUGH THE MERGED ROLE REGISTRY.
 * That is what makes a workspace's own role work: it holds the permission, so it
 * is in the audience, and nothing about the notification had to know it exists.
 *
 * ⚠️ AND NOBODY IS TOLD ABOUT THEIR OWN ACTION. "You invited Alex" in your own
 * inbox is noise, and enough of it teaches people that the bell is not worth
 * opening.
 */
export async function audienceFor(
  db: Db,
  book: NotificationBook,
  /** ⚠️ The app the notification belongs to — the audience is what each member
      may do IN THAT APP (D15), or a role in one product would ring bells in all. */
  appId: string,
  roles: RoleRegistry,
  dispatch: Dispatch,
  available: readonly Channel[],
): Promise<readonly Told[]> {
  /*
    ⚠️ THE AUDIENCE IS A PERMISSION AND NOT A REACH, WHICH IS DELIBERATE (D45).
    Somebody narrowed to one site cannot READ another site's rows, and it does
    not follow that they should not be TOLD: every note this platform's products
    raise today is a workspace-wide summary — "three things expiring", "a run
    needs releasing" — and narrowing a count to a place would report a smaller
    number as if it were the whole one. A note ABOUT a place is the case that
    would want it, and no product declares one; the day one does, it is a field
    on `Dispatch` rather than a rule written here.
  */
  const def = book[dispatch.type];
  if (!def) return [];

  const members = await membersOf(db, dispatch.tenantId);
  const policy = await policyOf(db, dispatch.tenantId);
  const out: Told[] = [];

  for (const member of members) {
    if (!member.accountId) continue;
    if (dispatch.except && member.accountId === dispatch.except) continue;
    if (!inAudience(def, permissionsFor(member, appId, roles))) continue;

    const preference = await preferenceOf(db, dispatch.tenantId, member.accountId);
    out.push({
      accountId: member.accountId,
      email: member.email,
      channels: channelsFor(def, policy, preference, available),
    });
  }
  return out;
}

/**
 * ⚠️ THE INBOX ROW IS WRITTEN FOR EVERYBODY IN THE AUDIENCE, whatever the policy
 * narrowed away. Email and push are interruptions and may be refused; the record
 * is not a preference.
 */
export async function fileNote(
  db: Db,
  book: NotificationBook,
  dispatch: Dispatch,
  told: readonly Told[],
  now = new Date(),
): Promise<number> {
  const def = book[dispatch.type];
  if (!def) return 0;
  const title = say(def.summary, dispatch.values);

  /*
    ⚠️ TOGETHER, AND THIS IS THE ONE THAT SCALES WITH A CUSTOMER. Telling a
    workspace something is one insert per person told, and awaited in turn that
    is a round trip per member — fine for the three-person workspace it was
    written against, and a request that times out for the one with five hundred.
    The number of people in a workspace is not ours to assume.
  */
  await Promise.all(told.map((one) => db.prepare(
    `INSERT INTO inbox (id, tenant_id, account_id, type, title, body, link, tone, icon, at, seen_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL)`)
    .bind(newId("inb", now), dispatch.tenantId, one.accountId, def.id, title,
      def.link, def.tone, def.icon, now.toISOString()).run()));
  return told.length;
}

/** ⚠️ A missing value leaves its token visible: visibly wrong beats plausibly wrong. */
const say = (template: string, values: Readonly<Record<string, string>>): string =>
  template.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);

export { say as interpolate };

/* ---------------------------------------------------------------- letters --- */

/**
 * WHAT A WORKSPACE WROTE FOR ONE OF ITS OWN MESSAGES.
 *
 * ⚠️ READ FOR THE WHOLE DISPATCH AT ONCE. A notification goes to everybody
 * holding a permission, and asking for the same template once per recipient is a
 * round trip per member — fine for three people, a request that times out for
 * five hundred. The same reason `fileNote` inserts together.
 */
export async function lettersOf(
  db: Db, tenantId: TenantId,
): Promise<Readonly<Record<string, Letter>>> {
  const rows = await db.prepare(
    `SELECT type, subject, body, signature FROM notify_letter WHERE tenant_id = ?`)
    .bind(tenantId).all<{ type: string; subject: string; body: string; signature: string | null }>();
  return Object.fromEntries((rows.results ?? []).map((r) => [r.type, {
    subject: r.subject,
    body: r.body,
    ...(r.signature ? { signature: r.signature } : {}),
  }]));
}

/**
 * WHOSE LETTER THIS IS, WHICH IS A DIFFERENT QUESTION FROM WHETHER THE
 * WORKSPACE WROTE ONE.
 *
 * ⚠️ THREE THINGS HAVE TO AGREE AND EVERY ONE OF THEM CAN CHANGE AFTERWARDS (D44).
 * The app has to OFFER the email surface, the workspace has to have ASKED to
 * brand it, and the workspace has to be the kind that may brand anything at all
 * — and a stored letter written while all three held would otherwise keep going
 * out after any of them stopped. Asked at the read, once per dispatch, so the
 * answer is today's rather than the day the letter was saved.
 *
 * ⚠️ AND IT ANSWERS EMPTY RATHER THAN THROWING. The letters are an override; a
 * workspace whose branding is off gets ours, which is what it had before it ever
 * wrote one.
 */
export const mayWordMail = (
  app: { readonly whitelabel?: WhitelabelDef }, branding: Branding | null, kind: Kind,
): boolean => !!app.whitelabel
  && brandedSurfaces(app.whitelabel, branding, mayBrand(kind)).includes("email");

export async function mailedAs(
  db: Db, tenantId: TenantId, app: { readonly whitelabel?: WhitelabelDef },
  branding: Branding | null, kind: Kind,
): Promise<{
  readonly letters?: Readonly<Record<string, Letter>>;
  readonly replyTo?: string;
}> {
  /* ⚠️ ONE PREDICATE, ASKED BY THE SEND AND BY THE EDITOR. Two copies is how a
     screen comes to collect words the dispatch will never use. */
  if (!mayWordMail(app, branding, kind)) return {};
  return {
    letters: await lettersOf(db, tenantId),
    ...(branding?.replyTo ? { replyTo: branding.replyTo } : {}),
  };
}

/**
 * WRITE ONE, OR SAY WHY NOT.
 *
 * ⚠️ THE REFUSAL IS THE POINT OF THIS FUNCTION. A template naming `{coach}`
 * where the definition offers `{trainer}` renders the brace and the word to
 * somebody who has no idea what it is — the workspace's own edit, so nothing of
 * ours fails and nobody of ours is told. Here is the last moment it is still
 * somebody's mistake rather than somebody's mail.
 *
 * ⚠️ AND AN EMPTY LETTER DELETES RATHER THAN STORING A BLANK. "Back to yours" is
 * what somebody means when they clear the box, and a stored empty subject is a
 * mail with no subject line.
 */
export async function setLetter(
  db: Db, book: NotificationBook, tenantId: TenantId, type: string,
  letter: Letter | null, now = new Date(),
): Promise<readonly LetterRefusal[]> {
  const def = book[type];
  if (!def) return ["not_theirs"];
  if (letter === null || (!letter.subject.trim() && !letter.body.trim())) {
    await db.prepare(`DELETE FROM notify_letter WHERE tenant_id = ? AND type = ?`)
      .bind(tenantId, type).run();
    return [];
  }
  const refused = refuseLetter(def, letter);
  if (refused.length) return refused;
  await db.prepare(
    `INSERT INTO notify_letter (tenant_id, type, subject, body, signature, at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (tenant_id, type) DO UPDATE SET
       subject = excluded.subject, body = excluded.body,
       signature = excluded.signature, at = excluded.at`)
    .bind(tenantId, type, letter.subject, letter.body, letter.signature ?? null,
      now.toISOString()).run();
  return [];
}
