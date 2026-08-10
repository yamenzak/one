/**
 * THE INBOX — where a notification actually lands.
 *
 * ⚠️ DISPATCH IS DERIVED FROM `emits`, NOT CALLED. A handler that sends its own
 * notification is one that can forget, one that can send a different thing than
 * the webhook does, and one whose copy lives at the call site where it cannot be
 * translated or checked. Here the operation declares what it raised, and the
 * runtime does the rest — so the inbox, the webhook catalogue and the audit
 * trail are three readings of one declaration.
 *
 * ⚠️ AND THE INBOX ROW IS WRITTEN EVEN WHEN EVERY OTHER CHANNEL IS DECLINED.
 * Email can be muted, filtered, or sent to an address somebody has left. The inbox is the RECORD, so a preference removes the interruption and
 * never the information — and "I never got that" has an answer that does not
 * depend on a mail provider.
 */

import {
  DEFAULT_PREFERENCES, channelsFor, destinationFor, render, saying, signOff,
  type Category, type Channel, type Instant, type NotificationRegistry,
  type Preferences, type SchemaModule, type SqlHandle, type WordingBook,
} from "@one/kernel";

export const INBOX_SCHEMA: SchemaModule = {
  id: "inbox",
  ddl: [
    `CREATE TABLE IF NOT EXISTS inbox (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, type TEXT NOT NULL, values_json TEXT NOT NULL DEFAULT '{}', row_id TEXT, read_at TEXT, at TEXT NOT NULL);`,
    /*
      ⚠️ THE UNREAD COUNT IS THE HOTTEST READ IN ANY PRODUCT WITH A BELL — it
      runs on every poll, for every signed-in person. Indexed on exactly the
      predicate it uses, or it is a table scan per tab per few seconds.
    */
    `CREATE INDEX IF NOT EXISTS idx_inbox_unread ON inbox(tenant_id, user_id, read_at, at);`,
    `CREATE TABLE IF NOT EXISTS inbox_prefs (tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, muted_json TEXT NOT NULL DEFAULT '[]', email INTEGER NOT NULL DEFAULT 1, push INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (tenant_id, user_id));`,
  ],
  scoped: { tenantColumn: "tenant_id", tenantTables: ["inbox", "inbox_prefs"] },
};

/* -------------------------------------------------------------- the read --- */

export interface InboxRow {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly body?: string;
  readonly tone: string;
  readonly icon: string;
  readonly category: Category;
  readonly at: string;
  readonly read: boolean;
  readonly open: { readonly collection?: string; readonly rowId?: string };
}

const parse = <T>(text: string, fallback: T): T => {
  try {
    const value: unknown = JSON.parse(text);
    return (value ?? fallback) as T;
  } catch {
    /* A malformed blob must not take somebody's whole inbox down with it. */
    return fallback;
  }
};

export async function preferencesFor(db: SqlHandle, tenantId: string, userId: string): Promise<Preferences> {
  const row = await db.first<{ muted_json: string; email: number }>(
    `SELECT muted_json, email FROM inbox_prefs WHERE tenant_id = ? AND user_id = ?`,
    tenantId, userId,
  );
  if (!row) return DEFAULT_PREFERENCES;
  return { muted: parse<Category[]>(row.muted_json, []), email: row.email === 1 };
}

export async function setPreferences(db: SqlHandle, tenantId: string, userId: string, prefs: Preferences): Promise<void> {
  await db.run(
    `INSERT INTO inbox_prefs (tenant_id, user_id, muted_json, email) VALUES (?, ?, ?, ?)
     ON CONFLICT(tenant_id, user_id) DO UPDATE SET muted_json = excluded.muted_json, email = excluded.email`,
    tenantId, userId, JSON.stringify(prefs.muted), prefs.email ? 1 : 0,
  );
}

/**
 * ⚠️ RENDERED ON READ, FROM THE REGISTRY — never stored as text.
 *
 * A row that carries its own finished sentence is one that cannot be translated
 * after the fact, cannot be corrected when the copy is wrong, and keeps saying
 * the old thing forever. What is stored is the TYPE and the values; the words
 * come from the manifest every time somebody looks.
 */
export async function listInbox(
  db: SqlHandle,
  registry: NotificationRegistry,
  tenantId: string,
  userId: string,
  limit: number,
  wording: WordingBook = {},
): Promise<{ readonly rows: readonly InboxRow[]; readonly unread: number }> {
  const raw = await db.all<{ id: string; type: string; values_json: string; row_id: string | null; read_at: string | null; at: string }>(
    `SELECT id, type, values_json, row_id, read_at, at FROM inbox WHERE tenant_id = ? AND user_id = ? ORDER BY at DESC LIMIT ?`,
    tenantId, userId, limit,
  );
  const count = await db.first<{ n: number }>(
    `SELECT COUNT(*) AS n FROM inbox WHERE tenant_id = ? AND user_id = ? AND read_at IS NULL`,
    tenantId, userId,
  );

  const rows: InboxRow[] = [];
  for (const r of raw) {
    const def = registry[r.type];
    /*
      ⚠️ A ROW WHOSE TYPE WAS RENAMED IS SKIPPED, NOT RENDERED BLANK. An
      anonymous bell with no words is worse than an absence: it is a thing the
      reader has to open to find out it says nothing.
    */
    if (!def) continue;
    const values = parse<Record<string, string | number>>(r.values_json, {});
    /*
      ⚠️ RESOLVED AT READ TIME, NOT STORED WITH THE ROW. A workspace that fixes a
      typo in its own copy fixes it in the inbox too — and a row keeping the
      words it was written with would make an inbox a museum of every phrasing
      the studio has ever tried.
    */
    const said = saying(def, wording[r.type]);
    rows.push({
      id: r.id,
      type: r.type,
      title: render(said.title, values),
      ...(said.body ? { body: render(said.body, values) } : {}),
      tone: def.tone,
      icon: def.icon,
      category: def.category,
      at: r.at,
      read: r.read_at !== null,
      open: destinationFor(def, r.row_id ?? undefined),
    });
  }
  return { rows, unread: count?.n ?? 0 };
}

export const markRead = (db: SqlHandle, tenantId: string, userId: string, at: Instant, id?: string): Promise<void> =>
  id
    ? db.run(`UPDATE inbox SET read_at = ? WHERE tenant_id = ? AND user_id = ? AND id = ? AND read_at IS NULL`, at, tenantId, userId, id)
    : db.run(`UPDATE inbox SET read_at = ? WHERE tenant_id = ? AND user_id = ? AND read_at IS NULL`, at, tenantId, userId);

/* ------------------------------------------------------------- the write --- */

export interface Delivery {
  readonly channel: Channel;
  readonly userId: string;
  readonly type: string;
  readonly title: string;
  readonly body?: string;
}

/**
 * Send one notification to the people a type is FOR.
 *
 * ⚠️ THE AUDIENCE COMES FROM THE REGISTRY, NOT FROM THE CALL SITE. A dispatch
 * that names its own recipients is one that reaches everybody the day somebody
 * passes the wrong list — and both "everybody" and "nobody" have shipped.
 *
 * Email is a HOOK rather than an implementation: what actually carries a
 * message is a deployment's decision, and a platform that owned it would own
 * every product's sender reputation with it. The decision of whether to send is
 * the platform's; the sending is not.
 */
export async function dispatch(input: {
  readonly db: SqlHandle;
  readonly registry: NotificationRegistry;
  readonly tenantId: string;
  readonly type: string;
  readonly audience: readonly { readonly userId: string; readonly role: string }[];
  readonly values: Readonly<Record<string, string | number>>;
  readonly rowId?: string;
  readonly at: Instant;
  /** What this workspace says instead, per type. Absent means the platform's words. */
  readonly wording?: WordingBook;
  /** How this workspace signs off. Email only — see `signOff`. */
  readonly signature?: string;
  send?(delivery: Delivery): Promise<void>;
}): Promise<readonly Delivery[]> {
  const def = input.registry[input.type];
  if (!def) return [];

  const out: Delivery[] = [];
  for (const person of input.audience) {
    if (!def.roles.includes(person.role)) continue;
    const prefs = await preferencesFor(input.db, input.tenantId, person.userId);
    const said = saying(def, input.wording?.[input.type]);
    const title = render(said.title, input.values);

    for (const channel of channelsFor(def, prefs)) {
      if (channel === "inbox") {
        await input.db.run(
          `INSERT INTO inbox (id, tenant_id, user_id, type, values_json, row_id, at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          crypto.randomUUID(), input.tenantId, person.userId, input.type, JSON.stringify(input.values), input.rowId ?? null, input.at,
        );
        out.push({ channel, userId: person.userId, type: input.type, title });
        continue;
      }
      /*
        ⚠️ THE SIGN-OFF GOES ON EVERY CHANNEL THAT LEAVES THE PRODUCT, and the
        inbox above is not one of them — a row being read inside the workspace's
        own branding does not need to be told whose workspace it is.
      */
      const written = said.body ? render(said.body, input.values) : undefined;
      const body = channel === "email" ? signOff(written, input.signature ?? "") : written;
      const delivery: Delivery = { channel, userId: person.userId, type: input.type, title, ...(body ? { body } : {}) };
      /*
        ⚠️ A FAILED INTERRUPTION IS NOT A FAILED NOTIFICATION. The inbox row is
        already written; a mail provider being down must not roll back the
        operation that raised this, and must not throw out of a handler that
        succeeded.
      */
      if (input.send) await input.send(delivery).catch(() => undefined);
      out.push(delivery);
    }
  }
  return out;
}

/**
 * The values a notification's copy may interpolate.
 *
 * ⚠️ SCALARS ONLY, FROM THE OPERATION'S OWN INPUT AND RESULT. A template that
 * could reach an arbitrary object renders `[object Object]` at best and carries
 * a nested value nobody vetted at worst — into copy that a person reads and that
 * an email sometimes puts in a subject line.
 */
export function interpolatable(input: unknown, result: unknown): Readonly<Record<string, string | number>> {
  const out: Record<string, string | number> = {};
  for (const source of [input, result]) {
    if (!source || typeof source !== "object") continue;
    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
      if (typeof value === "string" || typeof value === "number") out[key] = value;
    }
  }
  return out;
}

