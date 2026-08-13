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
  DEFAULT_PREFERENCES, channelsFor, destinationFor, inAudience, letterFor, refusePolicy, render, saying,
  type Category, type Channel, type Instant, type Letter, type NotificationRegistry, type Policy,
  type PolicyBook, type PolicyRefusal, type Preferences, type SchemaModule, type SqlHandle,
  type WordingBook, type Written,
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
    /*
      ⚠️ THE WORKSPACE'S OWN CEILING, AND ITS ABSENCE IS THE PRODUCT'S DEFAULT.
      A row per type only where somebody has decided something — so a deployment
      that upgrades into this feature behaves exactly as it did the day before,
      which a table of rows written eagerly at seed time could not promise.
    */
    `CREATE TABLE IF NOT EXISTS notify_policy (tenant_id TEXT NOT NULL, type TEXT NOT NULL, off INTEGER NOT NULL DEFAULT 0, channels_json TEXT, at TEXT NOT NULL, PRIMARY KEY (tenant_id, type));`,
  ],
  scoped: { tenantColumn: "tenant_id", tenantTables: ["inbox", "inbox_prefs", "notify_policy"] },
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
  const row = await db.first<{ muted_json: string; email: number; push: number }>(
    `SELECT muted_json, email, push FROM inbox_prefs WHERE tenant_id = ? AND user_id = ?`,
    tenantId, userId,
  );
  if (!row) return DEFAULT_PREFERENCES;
  return { muted: parse<Category[]>(row.muted_json, []), email: row.email === 1, push: row.push === 1 };
}

export async function setPreferences(db: SqlHandle, tenantId: string, userId: string, prefs: Preferences): Promise<void> {
  await db.run(
    `INSERT INTO inbox_prefs (tenant_id, user_id, muted_json, email, push) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, user_id) DO UPDATE SET muted_json = excluded.muted_json, email = excluded.email, push = excluded.push`,
    tenantId, userId, JSON.stringify(prefs.muted), prefs.email ? 1 : 0, prefs.push ? 1 : 0,
  );
}

/* --------------------------------------------------- what a workspace says --- */

/**
 * ⚠️ READ WHOLE, ONCE, RATHER THAN PER TYPE. A dispatch asks about one type but
 * a screen asks about all of them, and a workspace has a handful of rows at
 * most — so one read serves both and there is no per-type query on a path that
 * already reads the roster.
 */
export async function policyFor(db: SqlHandle, tenantId: string): Promise<PolicyBook> {
  const rows = await db.all<{ type: string; off: number; channels_json: string | null }>(
    /* unbounded-read: one row per notification type this workspace has decided about. */
    `SELECT type, off, channels_json FROM notify_policy WHERE tenant_id = ?`, tenantId,
  ).catch(() => []);
  const out: Record<string, Policy> = {};
  for (const r of rows) {
    out[r.type] = {
      ...(r.off === 1 ? { off: true } : {}),
      ...(r.channels_json ? { channels: parse<Channel[]>(r.channels_json, []) } : {}),
    };
  }
  return out;
}

/**
 * ⚠️ REFUSED HERE AND NOT AT THE ROUTE, so every caller meets the same rule. The
 * one that matters is `action_off`: a workspace that could switch off the
 * category meaning "nothing proceeds until somebody does something" is one where
 * the product silently stops working for people who did not press the switch.
 */
export async function setPolicy(
  db: SqlHandle, registry: NotificationRegistry, tenantId: string, type: string, policy: Policy, at: Instant,
): Promise<PolicyRefusal | null> {
  const refused = refusePolicy(registry, type, policy);
  if (refused) return refused;
  await db.run(
    `INSERT INTO notify_policy (tenant_id, type, off, channels_json, at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, type) DO UPDATE SET off = excluded.off, channels_json = excluded.channels_json, at = excluded.at`,
    tenantId, type, policy.off ? 1 : 0,
    policy.channels ? JSON.stringify(policy.channels) : null, at,
  );
  return null;
}

export const clearPolicy = (db: SqlHandle, tenantId: string, type: string): Promise<void> =>
  db.run(`DELETE FROM notify_policy WHERE tenant_id = ? AND type = ?`, tenantId, type);

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
  /**
   * ⚠️ THE WORKSPACE'S OWN LAYOUT, WHERE IT HAS ONE AND MAY HAVE ONE. Absent
   * means the plain text above is the whole message — which is what the platform
   * writing to a workspace about its own bill always is.
   */
  readonly html?: string;
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
  /**
   * ⚠️ EACH PERSON'S PERMISSIONS TRAVEL WITH THEM, because that is the test a
   * workspace's OWN role can pass. Matching a role name answers "no" for every
   * role a workspace composed for itself — silently, which is how somebody comes
   * to be in a workspace for a month being told nothing at all.
   */
  readonly audience: readonly {
    readonly userId: string; readonly role: string; readonly permissions: ReadonlySet<string>;
  }[];
  /** The roles the MANIFEST declares, so a workspace's own can be told apart. */
  readonly declaredRoles: ReadonlySet<string>;
  readonly values: Readonly<Record<string, string | number>>;
  readonly rowId?: string;
  readonly at: Instant;
  /** What this workspace says instead, per type. Absent means the platform's words. */
  readonly wording?: WordingBook;
  /** What it allows, per type. Absent means the product's own defaults. */
  readonly policy?: PolicyBook;
  /** How this workspace signs off. Email only — see `signOff`. */
  readonly signature?: string;
  /** Its letterhead, for the messages it is allowed to phrase. */
  readonly letter?: Letter;
  /**
   * WHAT THIS DEPLOYMENT CAN ACTUALLY DELIVER, where the caller happens to know.
   *
   * ⚠️ ABSENT MEANS ALL OF THEM, AND THAT IS SAFE HERE RATHER THAN OPTIMISTIC.
   * Answering it costs two reads of the GLOBAL store, and the dispatch path
   * raises a notification on every write that declares one — so it is asked
   * where somebody is being OFFERED a channel (the preferences screen, which is
   * a read) and not where one is being used. A channel with nothing behind it is
   * a no-op at delivery: `send` refuses without a provider, push returns without
   * keys, and the inbox row — the record — is written either way.
   */
  readonly available?: readonly Channel[];
  send?(delivery: Delivery): Promise<void>;
}): Promise<readonly Delivery[]> {
  const def = input.registry[input.type];
  if (!def) return [];

  const out: Delivery[] = [];
  const policy = input.policy?.[input.type] ?? {};
  for (const person of input.audience) {
    if (!inAudience(def, person, input.declaredRoles)) continue;
    const prefs = await preferencesFor(input.db, input.tenantId, person.userId);
    const said = saying(def, input.wording?.[input.type]);
    const title = render(said.title, input.values);

    for (const channel of channelsFor(def, prefs, policy, input.available)) {
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
      if (channel === "push") {
        /*
          ⚠️ NO LETTERHEAD AND NO SIGN-OFF ON A PUSH. It is a title and a line on
          a lock screen, with a hard length limit set by somebody else's push
          service — a signature there is the half of the message that survives.
        */
        out.push({ channel, userId: person.userId, type: input.type, title, ...(written ? { body: written } : {}) });
        if (input.send) await input.send(out[out.length - 1]!).catch(() => undefined);
        continue;
      }
      /*
        ⚠️ THE LETTERHEAD REACHES EXACTLY THE TYPES THE WORDING DOES. A workspace
        that could wrap the platform's own arrears notice in its own layout could
        bury it, and the people who would then not act on it are its staff.
      */
      const mail: Written = letterFor(
        { title, ...(written ? { body: written } : {}) },
        input.signature ?? "",
        def.theirs ? input.letter ?? {} : {},
      );
      const delivery: Delivery = {
        channel, userId: person.userId, type: input.type, title: mail.subject,
        body: mail.text, ...(mail.html ? { html: mail.html } : {}),
      };
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

