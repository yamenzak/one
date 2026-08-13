/**
 * THE VAULT, STORED — one home for a person's own facts, and the grants over it.
 *
 * ⚠️ GLOBAL, BESIDE THE ACCOUNT, AND THAT IS THE WHOLE POINT. A fact here is not
 * a workspace's record about somebody; it is the person's, and it outlives every
 * app they ever use. Putting it in a regional store would tie it to whichever
 * workspace happened to ask first — so leaving that workspace would take it away,
 * and the sentence this exists to make true ("you have your data even with no
 * app") would be false.
 *
 * ⚠️ IT IS NOT ON THE HOT PATH AND MUST NEVER BE CACHED. The identity split — a
 * global store read at sign-in, a regional session read per request — buys its
 * speed with a SNAPSHOT, and a snapshot of a vault value is a disclosure that
 * survives its own revocation. Withdrawing a grant has to take effect on the
 * next read, so there is nothing to invalidate and nothing to get wrong. A vault
 * read happens when a screen actually shows a fact, which is rare beside every
 * request in the platform, and correctness is worth more than the round trip.
 *
 * ⚠️ VALUES ARE OPAQUE OUTSIDE THIS MODULE. `open` and `seal` are the only two
 * functions that see one, and today they are the identity function. That is the
 * shape end-to-end encryption needs: when a key exists, these two change and
 * nothing above them does. A handler reading a column directly would make that
 * day a rewrite of every caller, which is how encryption stays permanently one
 * quarter away.
 */

import type {
  Reach, Grant, Instant, PlainDate, SchemaModule, SqlHandle, UserId, VaultRefusal, VaultSpec,
} from "@one/kernel";
import { factOf, mayDerive, mayRead, readingOf } from "@one/kernel";

/* ---------------------------------------------------------------- schema --- */

/**
 * ⚠️ EVERY COLUMN THESE TABLES HAVE, NAMED ONCE, SO A STATEMENT CANNOT DRIFT
 * FROM THE SCHEMA IT WRITES TO.
 *
 * A misspelled column in an `ON CONFLICT … DO UPDATE` is a runtime error and
 * nothing else — it typechecks, it passes every unit test over the resolver, and
 * it surfaces as a 503 on one write. `vault-columns-exist` compares this list
 * against every statement in this file, so the mistake is a test failure with a
 * column name in it rather than an outage on a share nobody could reproduce.
 */
export const VAULT_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  vault_facts: ["account_id", "fact", "at", "sealed", "seal", "recorded_at"],
  vault_grants: ["account_id", "fact", "app_id", "tenant_id", "reach", "expires_at", "granted_at", "via"],
  vault_disclosures: ["account_id", "fact", "app_id", "tenant_id", "reader_id", "reach", "on_day", "reads"],
  vault_grant_log: ["id", "account_id", "fact", "app_id", "tenant_id", "verb", "reach", "expires_at", "at"],
};

/**
 * WHAT EVERY APP WANTS, WHERE EVERY APP CAN SEE IT.
 *
 * ⚠️ THE VAULT IS ONE PERSON'S, SO IT CANNOT BE RENDERED FROM ONE APP'S MANIFEST.
 * A worker knows its own wants and nothing about the product next to it — so the
 * hub, which exists precisely to answer "what does each place I belong
 * to know about me", could only ever have shown the app it happened to be running
 * inside. Each app publishes its declaration into the global store on boot, and
 * whoever renders the vault reads all of them.
 *
 * ⚠️ IT HOLDS DECLARATIONS, NEVER DATA. Rows here are copied out of manifests that
 * ship in the bundle — the same text that is in the repository — so this table is
 * as public as the app is. Nothing about a person is in it, which is the same rule
 * the tenant directory beside it lives by.
 *
 * ⚠️ AND IT IS REPLACED WHOLE, NOT MERGED. A want removed from a manifest has to
 * disappear from the vault, or somebody keeps being shown a control for a
 * disclosure nothing can make any more — and a merge is exactly how that row
 * survives forever.
 */
/**
 * ⚠️ ITS OWN LIST, BECAUSE IT IS ITS OWN KIND OF TABLE. Everything in
 * `VAULT_COLUMNS` is a person's, tenant-scoped and erased with them; this holds
 * declarations copied out of manifests, is scoped to nobody, and must survive an
 * account being deleted — putting it on that list would have made the erasure
 * guard demand it be shredded with somebody's body measurements.
 */
export const VAULT_SPEC_COLUMNS = ["app_id", "app_name", "wants"] as const;

export const VAULT_SPEC_SCHEMA: SchemaModule = {
  /** ⚠️ Global: the hub answers for every product a person uses, and one worker knows only its own manifest. */
  global: "declaration",
  id: "vault_specs",
  ddl: [
    `CREATE TABLE IF NOT EXISTS vault_specs (app_id TEXT PRIMARY KEY, app_name TEXT NOT NULL, wants TEXT NOT NULL);`,
  ],
};


export const VAULT_SCHEMA: SchemaModule = {
  /** ⚠️ Global: a vault fact outlives every app they use and every workspace they leave. */
  global: "account",
  id: "vault",
  after: ["identity"],
  ddl: [
    /*
      ⚠️ ONE ROW PER PERSON PER FACT PER DAY. The key is what makes a correction
      a correction rather than a second opinion: somebody who weighs themselves
      twice on Tuesday has one Tuesday weight, and the later write wins. Without
      the day in the key a trend is computed over however many times somebody
      opened the app.

      ⚠️ AND `sealed` IS TEXT WITH NO SHAPE THIS SCHEMA KNOWS. A column typed to
      the value would be a column that cannot hold a ciphertext.
    */
    `CREATE TABLE IF NOT EXISTS vault_facts (account_id TEXT NOT NULL, fact TEXT NOT NULL, at TEXT NOT NULL, sealed TEXT NOT NULL, seal TEXT NOT NULL DEFAULT 'server', recorded_at TEXT NOT NULL, PRIMARY KEY (account_id, fact, at));`,
    `CREATE INDEX IF NOT EXISTS idx_vault_facts_account ON vault_facts(account_id, fact, at DESC);`,
    /*
      ⚠️ A GRANT IS KEYED ON THE WORKSPACE TOO, AND `''` IS "THE APP ITSELF".
      SQLite treats NULL as distinct from every NULL in a primary key, so a
      nullable column here would let the same app-wide grant be inserted without
      limit — a revocation would then remove one row of many and appear to do
      nothing. The empty string is a value, so the key holds.
    */
    `CREATE TABLE IF NOT EXISTS vault_grants (account_id TEXT NOT NULL, fact TEXT NOT NULL, app_id TEXT NOT NULL, tenant_id TEXT NOT NULL DEFAULT '', reach TEXT NOT NULL, expires_at TEXT, granted_at TEXT NOT NULL, via TEXT NOT NULL DEFAULT 'sheet', PRIMARY KEY (account_id, fact, app_id, tenant_id));`,
    `CREATE INDEX IF NOT EXISTS idx_vault_grants_account ON vault_grants(account_id);`,
    /*
      ⚠️ ONE ROW PER READER PER FACT PER DAY, NOT ONE PER READ. A row per read is
      a write on every render, which is a cost somebody eventually turns off —
      and a disclosure log that is off is worth nothing at all. A row per day
      answers the question a person actually asks, at a hundredth of the price.
    */
    `CREATE TABLE IF NOT EXISTS vault_disclosures (account_id TEXT NOT NULL, fact TEXT NOT NULL, app_id TEXT NOT NULL, tenant_id TEXT NOT NULL DEFAULT '', reader_id TEXT NOT NULL DEFAULT '', reach TEXT NOT NULL, on_day TEXT NOT NULL, reads INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (account_id, fact, app_id, tenant_id, reader_id, on_day));`,
    `CREATE INDEX IF NOT EXISTS idx_vault_disclosures_account ON vault_disclosures(account_id, on_day DESC);`,
    /*
      ⚠️ WHY A GRANT CHANGED, APPEND-ONLY, AND SEPARATE FROM THE GRANT ITSELF.
      The grant table is current state — a revocation DELETES a row, which is
      what makes revocation total. Without this table the strongest thing the
      hub could say about a withdrawn grant is nothing at all, and
      "I never gave that" and "I gave it and took it back" are the two answers a
      person most wants to tell apart.
    */
    `CREATE TABLE IF NOT EXISTS vault_grant_log (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, fact TEXT NOT NULL, app_id TEXT NOT NULL, tenant_id TEXT NOT NULL DEFAULT '', verb TEXT NOT NULL, reach TEXT, expires_at TEXT, at TEXT NOT NULL);`,
    `CREATE INDEX IF NOT EXISTS idx_vault_grant_log_account ON vault_grant_log(account_id, at DESC);`,
  ],
  /*
    ⚠️ EVERY TABLE IS SCOPED TO THE ACCOUNT, WHICH IS WHAT MAKES ERASURE DERIVED.
    A person deleting their account takes their facts, their grants, the record of
    who read them and the history of what they decided — and a table added here
    without a scope is one a purge silently walks past. `purge-cascade` reads
    this declaration rather than a hand-written list.
  */
  scoped: {
    tenantColumn: "account_id",
    tenantTables: ["vault_facts", "vault_grants", "vault_disclosures", "vault_grant_log"],
  },
};

/* ----------------------------------------------------------- the envelope --- */

/**
 * ⚠️ THE TWO FUNCTIONS THAT SEE A VALUE, AND TODAY THEY ARE THE IDENTITY.
 *
 * Everything above them handles a `sealed` string it does not interpret. When a
 * key exists these two change and nothing else does — which is the difference
 * between encryption being a migration and encryption being permanently one
 * quarter away.
 */
const seal = (value: string): string => value;
const open = (sealed: string): string => sealed;

/* ------------------------------------------------------------- the store --- */

export interface StoredFact {
  readonly fact: string;
  readonly at: PlainDate;
  readonly value: string;
  readonly recordedAt: Instant;
}

export interface VaultStore {
  /** Everything a person has recorded for one fact, newest first. */
  history(accountId: UserId, fact: string, limit?: number): Promise<readonly StoredFact[]>;
  /** The current value, which is the most recent day. */
  latest(accountId: UserId, fact: string): Promise<StoredFact | null>;
  /** ⚠️ Which facts this person holds ANYTHING for. Never the values. */
  holds(accountId: UserId): Promise<ReadonlySet<string>>;
  put(accountId: UserId, fact: string, at: PlainDate, value: string, now: Instant): Promise<void>;
  forget(accountId: UserId, fact: string, at?: PlainDate): Promise<void>;

  grants(accountId: UserId): Promise<readonly Grant[]>;
  grant(g: Grant): Promise<void>;
  revoke(accountId: UserId, fact: string, appId: string, tenantId: string | null, now: Instant): Promise<void>;

  /** ⚠️ Bumped once per reader per fact per day. See the schema comment. */
  noteRead(input: {
    readonly accountId: UserId; readonly fact: string; readonly appId: string;
    readonly tenantId: string | null; readonly readerId: UserId | null;
    readonly reach: Reach; readonly on: PlainDate;
  }): Promise<void>;
  disclosures(accountId: UserId, limit?: number): Promise<readonly {
    readonly fact: string; readonly appId: string; readonly tenantId: string | null;
    readonly readerId: string | null; readonly reach: Reach;
    readonly on: PlainDate; readonly reads: number;
  }[]>;
}

interface FactRow { fact: string; at: string; sealed: string; recorded_at: string }
interface GrantRow {
  account_id: string; fact: string; app_id: string; tenant_id: string;
  reach: string; expires_at: string | null; granted_at: string; via: string;
}

/**
 * ⚠️ PUBLISHED ON BOOT, BESIDE THE SCHEMA, because that is the one moment an app
 * is certainly running its own current manifest. A publication behind a deploy
 * step is one somebody forgets on the app that mattered; a publication on every
 * request is a write on the hot path for a value that changes when the bundle
 * does.
 *
 * ⚠️ AND IT NEVER THROWS. A vault declaration is not what an app is for — a
 * worker that cannot publish it should still serve, and the vault shows one app
 * fewer rather than every app failing to boot.
 */
export async function publishVaultSpec(
  db: SqlHandle, app: { readonly id: string; readonly name: string; readonly vault?: VaultSpec },
): Promise<void> {
  try {
    if (!app.vault) {
      await db.run(`DELETE FROM vault_specs WHERE app_id = ?`, app.id);
      return;
    }
    /* ⚠️ NO TIMESTAMP. Nothing reads when a declaration was published — it is
       whatever the running bundle says — and the column would have made boot read
       the wall clock, which the injected-clock guard correctly refuses. A column
       nothing reads is the thing this file's own comments keep warning about. */
    await db.run(
      `INSERT INTO vault_specs (app_id, app_name, wants) VALUES (?, ?, ?)
       ON CONFLICT(app_id) DO UPDATE SET app_name = excluded.app_name, wants = excluded.wants`,
      app.id, app.name, JSON.stringify(app.vault.wants),
    );
  } catch (why) {
    /*
      ⚠️ IT STILL SERVES, AND IT SAYS SO. Boot must not throw over a screen in
      another product — but a bare `catch {}` here swallowed a `D1_TYPE_ERROR`
      for as long as this has existed: the parameters were passed as an ARRAY
      where `run` takes them one by one, so every publish failed, `vault_specs`
      stayed empty, and the hub showed nobody's vault at all. Nothing
      anywhere said a word.
    */
    console.error("vault spec not published", app.id, why);
  }
}

/** Every app's declaration, for the surface that renders all of them at once. */
export async function publishedSpecs(
  db: SqlHandle,
): Promise<readonly { appId: string; appName: string; spec: VaultSpec }[]> {
  const rows = await db.all<{ app_id: string; app_name: string; wants: string }>(
    `SELECT app_id, app_name, wants FROM vault_specs ORDER BY app_id LIMIT 200`,
  ).catch(() => []);
  return rows.flatMap((r) => {
    /* ⚠️ A ROW THAT WILL NOT PARSE IS DROPPED, not thrown on. It was written by
       another worker, possibly a version ahead — and one product's bad row must
       not take the whole hub down with it. */
    try {
      return [{ appId: r.app_id, appName: r.app_name, spec: { wants: JSON.parse(r.wants) as VaultSpec["wants"] } }];
    } catch { return []; }
  });
}

export function vaultStore(db: SqlHandle): VaultStore {
  const toFact = (r: FactRow): StoredFact => ({
    fact: r.fact, at: r.at as PlainDate, value: open(r.sealed), recordedAt: r.recorded_at as Instant,
  });
  const toGrant = (r: GrantRow): Grant => ({
    accountId: r.account_id as UserId,
    fact: r.fact,
    appId: r.app_id,
    /* ⚠️ Back to null at the boundary. The empty string is a storage detail that
       exists because SQLite's primary keys do not constrain NULLs; every reader
       above this line thinks in "the app as a whole". */
    tenantId: r.tenant_id === "" ? null : r.tenant_id,
    reach: r.reach as Reach,
    expiresAt: (r.expires_at as Instant | null) ?? null,
    grantedAt: r.granted_at as Instant,
    via: (r.via as Grant["via"]) ?? "sheet",
  });

  return {
    async history(accountId, fact, limit = 400) {
      const rows = await db.all<FactRow>(
        `SELECT fact, at, sealed, recorded_at FROM vault_facts WHERE account_id = ? AND fact = ? ORDER BY at DESC LIMIT ?`,
        accountId, fact, limit,
      ).catch(() => []);
      return rows.map(toFact);
    },
    async latest(accountId, fact) {
      const row = await db.first<FactRow>(
        `SELECT fact, at, sealed, recorded_at FROM vault_facts WHERE account_id = ? AND fact = ? ORDER BY at DESC LIMIT 1`,
        accountId, fact,
      ).catch(() => null);
      return row ? toFact(row) : null;
    },
    async holds(accountId) {
      const rows = await db.all<{ fact: string }>(
        `SELECT DISTINCT fact FROM vault_facts WHERE account_id = ?`, accountId,
      ).catch(() => []);
      return new Set(rows.map((r) => r.fact));
    },
    async put(accountId, fact, at, value, now) {
      /* ⚠️ REPLACE ON THE DAY, so a second reading on one day is a correction
         rather than a second opinion. */
      await db.run(
        `INSERT INTO vault_facts (account_id, fact, at, sealed, seal, recorded_at) VALUES (?, ?, ?, ?, 'server', ?)
         ON CONFLICT(account_id, fact, at) DO UPDATE SET sealed = excluded.sealed, recorded_at = excluded.recorded_at`,
        accountId, fact, at, seal(value), now,
      );
    },
    async forget(accountId, fact, at) {
      if (at) await db.run(`DELETE FROM vault_facts WHERE account_id = ? AND fact = ? AND at = ?`, accountId, fact, at);
      else await db.run(`DELETE FROM vault_facts WHERE account_id = ? AND fact = ?`, accountId, fact);
    },

    async grants(accountId) {
      const rows = await db.all<GrantRow>(
        `SELECT account_id, fact, app_id, tenant_id, reach, expires_at, granted_at, via FROM vault_grants WHERE account_id = ?`,
        accountId,
      ).catch(() => []);
      return rows.map(toGrant);
    },
    async grant(g) {
      const tenant = g.tenantId ?? "";
      await db.run(
        `INSERT INTO vault_grants (account_id, fact, app_id, tenant_id, reach, expires_at, granted_at, via) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_id, fact, app_id, tenant_id) DO UPDATE SET reach = excluded.reach, expires_at = excluded.expires_at, granted_at = excluded.granted_at, via = excluded.via`,
        g.accountId, g.fact, g.appId, tenant, g.reach, g.expiresAt, g.grantedAt, g.via,
      );
      await db.run(
        `INSERT INTO vault_grant_log (id, account_id, fact, app_id, tenant_id, verb, reach, expires_at, at) VALUES (?, ?, ?, ?, ?, 'grant', ?, ?, ?)`,
        `vgl_${g.accountId}_${g.fact}_${g.appId}_${tenant}_${g.grantedAt}`,
        g.accountId, g.fact, g.appId, tenant, g.reach, g.expiresAt, g.grantedAt,
      ).catch(() => undefined);
    },
    async revoke(accountId, fact, appId, tenantId, now) {
      const tenant = tenantId ?? "";
      /*
        ⚠️ A DELETE RATHER THAN A FLAG, AND THE LOG IS WHAT MAKES THAT SAFE. A
        revoked row that stays is a row every resolver has to remember to filter,
        and the one that forgets is a disclosure nobody can see. Deleting means
        the absence IS the refusal; the log beside it is what lets the account
        centre tell "never given" from "taken back".
      */
      await db.run(`DELETE FROM vault_grants WHERE account_id = ? AND fact = ? AND app_id = ? AND tenant_id = ?`,
        accountId, fact, appId, tenant);
      await db.run(
        `INSERT INTO vault_grant_log (id, account_id, fact, app_id, tenant_id, verb, reach, expires_at, at) VALUES (?, ?, ?, ?, ?, 'revoke', NULL, NULL, ?)`,
        `vgl_${accountId}_${fact}_${appId}_${tenant}_${now}`, accountId, fact, appId, tenant, now,
      ).catch(() => undefined);
    },

    async noteRead(input) {
      await db.run(
        `INSERT INTO vault_disclosures (account_id, fact, app_id, tenant_id, reader_id, reach, on_day, reads) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(account_id, fact, app_id, tenant_id, reader_id, on_day) DO UPDATE SET reads = reads + 1`,
        input.accountId, input.fact, input.appId, input.tenantId ?? "", input.readerId ?? "",
        input.reach, input.on,
      ).catch(() => undefined);
    },
    async disclosures(accountId, limit = 200) {
      const rows = await db.all<{
        fact: string; app_id: string; tenant_id: string; reader_id: string;
        reach: string; on_day: string; reads: number;
      }>(
        `SELECT fact, app_id, tenant_id, reader_id, reach, on_day, reads FROM vault_disclosures
         WHERE account_id = ? ORDER BY on_day DESC LIMIT ?`, accountId, limit,
      ).catch(() => []);
      return rows.map((r) => ({
        fact: r.fact,
        appId: r.app_id,
        tenantId: r.tenant_id === "" ? null : r.tenant_id,
        readerId: r.reader_id === "" ? null : r.reader_id,
        reach: r.reach as Reach,
        on: r.on_day as PlainDate,
        reads: r.reads,
      }));
    },
  };
}

/* --------------------------------------------------------- the readings --- */

/**
 * WHAT A DERIVATION ACTUALLY COMPUTES.
 *
 * ⚠️ EVERY ONE OF THESE IS DEFINED BY WHAT IT REFUSES TO SAY, and the arithmetic
 * has to be checked against the `hides` sentence on its declaration rather than
 * against intuition. Two of them were wrong on the first attempt in the same
 * direction — towards disclosing more — because the natural way to write "how
 * much have they changed" is to return the two endpoints.
 *
 * ⚠️ AND THEY ROUND. An unrounded percentage over a known start is an equation
 * with one unknown: 12.3847% of a starting weight recovers that weight to the
 * gram. Rounding is not presentation here, it is the disclosure boundary.
 */
export interface Derived {
  readonly reading: string;
  readonly label: string;
  /** ⚠️ Already reduced. Nothing downstream may recover an input from it. */
  readonly value: number | string | null;
  readonly unit?: string;
  /** How many days of history it stands on. A trend over two is not a trend. */
  readonly over: number;
}

const NUMERIC = (rows: readonly StoredFact[]): readonly { at: string; n: number }[] =>
  rows.map((r) => ({ at: r.at, n: Number(r.value) })).filter((r) => Number.isFinite(r.n));

/**
 * ⚠️ A RATE, ROUNDED TO A TENTH, AND NO ENDPOINTS. "Down 0.4 a week" is what a
 * coach needs to plan; the pair of weights it came from is what they do not.
 */
function trend(rows: readonly StoredFact[]): Derived["value"] {
  const points = NUMERIC(rows);
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => (a.at < b.at ? -1 : 1));
  const first = sorted[0]!;
  const last = sorted.at(-1)!;
  const days = (Date.parse(`${last.at}T00:00:00Z`) - Date.parse(`${first.at}T00:00:00Z`)) / 86_400_000;
  if (!(days > 0)) return null;
  return Math.round(((last.n - first.n) / days) * 7 * 10) / 10;
}

/**
 * ⚠️ A PERCENTAGE OF A START THE READER DOES NOT KNOW, and that is what makes it
 * safe rather than the rounding. "Down 3%" is one equation in two unknowns; no
 * number of readings turns it into a weight without the starting weight, which
 * is governed by its own grant.
 *
 * ⚠️ SO IT ROUNDS TO A WHOLE POINT AND NO COARSER. A first attempt rounded to
 * five, which turned a real 2.6% into a reported 5% — privacy bought by lying,
 * and the coach plans from the lie. Where coarsening is not what makes a
 * derivation safe, coarsening is just error.
 */
function progress(rows: readonly StoredFact[]): Derived["value"] {
  const points = NUMERIC(rows);
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => (a.at < b.at ? -1 : 1));
  const start = sorted[0]!.n;
  const now = sorted.at(-1)!.n;
  if (start === 0) return null;
  const moved = ((now - start) / Math.abs(start)) * 100;
  return Math.round(moved);
}

/**
 * ⚠️ A BAND, NOT AN AGE, AND ROUNDED DOWN TO A DECADE. An age in years plus a
 * month of birth is a birth date; a decade is ten thousand people wide.
 */
function ageBand(rows: readonly StoredFact[], now: Instant): Derived["value"] {
  const born = rows[0]?.value;
  if (!born) return null;
  const ms = Date.parse(now) - Date.parse(`${born}T00:00:00Z`);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const years = Math.floor(ms / (365.2425 * 86_400_000));
  const decade = Math.floor(years / 10) * 10;
  return `${decade}s`;
}

/** ⚠️ The one place a reading is computed. A second would disclose differently. */
export function derive(reading: string, rows: readonly StoredFact[], now: Instant): Derived | null {
  const spec = readingOf(reading);
  if (!spec) return null;
  const over = new Set(rows.map((r) => r.at)).size;
  const base = { reading, label: spec.label, over };
  switch (reading) {
    case "body.mass.trend": return { ...base, value: trend(rows), unit: "per week" };
    case "body.mass.progress": return { ...base, value: progress(rows), unit: "%" };
    case "person.birthDate.ageBand": return { ...base, value: ageBand(rows, now), over: rows.length ? 1 : 0 };
    /*
      ⚠️ AN UNIMPLEMENTED READING RETURNS NOTHING RATHER THAN GUESSING. The
      registry is checked at composition and this switch is not, so the gap
      between them is where a reading declared today and computed next week
      lives — and a default branch returning the raw value would turn that gap
      into a disclosure.
    */
    default: return null;
  }
}

/* ------------------------------------------------------------- the reader --- */

/**
 * THE ONE PATH A FACT LEAVES THE VAULT BY.
 *
 * ⚠️ IT RESOLVES, READS AND RECORDS IN ONE CALL, and that is deliberate: three
 * separate steps is three chances to do two of them. A caller that resolved and
 * read without recording would produce a disclosure log that is quietly missing
 * exactly the reads somebody cared about.
 */
export interface Look {
  readonly accountId: UserId;
  readonly fact: string;
  readonly appId: string;
  readonly tenantId: string | null;
  readonly reach: Reach;
  /** ⚠️ Null where the app itself is computing and no person is being shown. */
  readonly readerId: UserId | null;
  readonly today: PlainDate;
  readonly now: Instant;
}

export type Seen =
  | { readonly seen: true; readonly value: string; readonly at: PlainDate }
  | { readonly seen: false; readonly why: VaultRefusal };

export async function readFact(store: VaultStore, look: Look): Promise<Seen> {
  const [grants, held] = await Promise.all([store.grants(look.accountId), store.holds(look.accountId)]);
  const verdict = mayRead({
    ask: { fact: look.fact, appId: look.appId, tenantId: look.tenantId, reach: look.reach },
    grants,
    has: held.has(look.fact),
    now: look.now,
  });
  if (!verdict.allowed) return { seen: false, why: verdict.because };

  const row = await store.latest(look.accountId, look.fact);
  /* ⚠️ `holds` said yes and the row is gone: a delete between the two reads.
     Reported as empty rather than as a failure — it is what it is. */
  if (!row) return { seen: false, why: "empty" };

  await store.noteRead({
    accountId: look.accountId, fact: look.fact, appId: look.appId, tenantId: look.tenantId,
    readerId: look.readerId, reach: look.reach, on: look.today,
  });
  return { seen: true, value: row.value, at: row.at };
}

export type Shown =
  | { readonly seen: true; readonly derived: Derived }
  | { readonly seen: false; readonly why: VaultRefusal };

/**
 * ⚠️ THE DERIVED PATH RECORDS A DISCLOSURE TOO, AGAINST EVERY INPUT. A reading
 * is a disclosure — a smaller one, deliberately, and still one — so a person
 * looking at who has been reading their weight has to see the coach who has only
 * ever seen the trend. Logging the reading and not its inputs would produce a
 * history that says nobody read a fact that has been read every day.
 */
export async function readDerived(store: VaultStore, look: Omit<Look, "fact"> & { readonly reading: string }): Promise<Shown> {
  const spec = readingOf(look.reading);
  if (!spec) return { seen: false, why: "ungranted" };

  const [grants, held] = await Promise.all([store.grants(look.accountId), store.holds(look.accountId)]);
  const verdict = mayDerive({
    reading: look.reading, appId: look.appId, tenantId: look.tenantId, reach: look.reach,
    grants, has: (f) => held.has(f), now: look.now,
  });
  if (!verdict.allowed) return { seen: false, why: verdict.because };

  /* ⚠️ The reading's OWN fact supplies the series; the others are gates it has
     already passed. A reading over two series is not expressible today and is
     refused at the registry rather than half-computed here. */
  const own = spec.from[0]!;
  const rows = await store.history(look.accountId, own);
  const derived = derive(look.reading, rows, look.now);
  if (!derived || derived.value === null) return { seen: false, why: "empty" };

  for (const fact of spec.from) {
    await store.noteRead({
      accountId: look.accountId, fact, appId: look.appId, tenantId: look.tenantId,
      readerId: look.readerId, reach: look.reach, on: look.today,
    });
  }
  return { seen: true, derived };
}

/* ------------------------------------------------------------ the summary --- */

