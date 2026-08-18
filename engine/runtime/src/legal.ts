/**
 * WHO AGREED TO WHAT, AND WHEN — the record, and the wall until there is one.
 *
 * ⚠️ AN ACCEPTANCE IS OF A VERSION. Editing the text without moving the version
 * records everybody who accepted the old wording as having accepted the new one,
 * which is worse than keeping no record at all: it is a record that is
 * confidently wrong, and it is the half somebody would rely on in front of a
 * regulator. A new version is a new agreement, asked again.
 *
 * ⚠️ AND IT IS IN THE DIRECTORY, NOT ON A SHARD. One person accepts the terms
 * once for the whole deployment — an acceptance beside a workspace's records
 * would be asked again per workspace, and lost when that workspace closed.
 *
 * ⚠️ THREE MOMENTS, ONE MECHANISM. A person agrees when they first sign in
 * (`binds: "person"`); whoever creates a workspace agrees on its behalf
 * (`binds: "tenant"`); and an app's own documents bind where that app is
 * enabled. All three are the same row with a different scope in it, because a
 * second mechanism is a second place to forget the version.
 */

import type { AccountId, Acceptance, DocumentBook, DocumentDef, TenantId } from "@engine/kernel";
import { newId, outstanding } from "@engine/kernel";
import type { SchemaModule } from "./schema.js";
import type { Db } from "./sql.js";

export const LEGAL_SCHEMA: SchemaModule = {
  id: "legal",
  statements: [
    /* ⚠️ THE VERSION IS IN THE KEY. Two rows for one document is the record of a
       person who accepted, saw a change, and accepted again — which is the
       history the whole design exists to keep. */
    `CREATE TABLE IF NOT EXISTS acceptance (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, tenant_id TEXT, app_id TEXT, document TEXT NOT NULL, version TEXT NOT NULL, at TEXT NOT NULL);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ix_acceptance_one ON acceptance (account_id, tenant_id, app_id, document, version);`,
    `CREATE INDEX IF NOT EXISTS ix_acceptance_who ON acceptance (account_id);`,
  ],
};

/* ------------------------------------------------------------------ store --- */

export async function acceptancesOf(
  db: Db, accountId: AccountId,
): Promise<readonly (Acceptance & { readonly tenantId: string | null; readonly appId: string | null })[]> {
  const rows = await db.prepare(
    `SELECT document, version, at, account_id, tenant_id, app_id FROM acceptance WHERE account_id = ?`)
    .bind(accountId).all<{
      document: string; version: string; at: string;
      account_id: string; tenant_id: string | null; app_id: string | null;
    }>();
  return rows.results.map((r) => ({
    document: r.document, version: r.version as never, at: r.at as never, by: r.account_id,
    tenantId: r.tenant_id, appId: r.app_id,
  }));
}

/**
 * ⚠️ WRITTEN ONCE PER VERSION, AND NEVER UPDATED. `ON CONFLICT DO NOTHING`
 * because a second press is not a second agreement — and overwriting the
 * timestamp would move the date somebody actually agreed, which is the one field
 * the row exists for.
 */
export async function accept(
  db: Db, accountId: AccountId, document: string, version: string,
  scope: { readonly tenantId?: TenantId | null; readonly appId?: string | null } = {},
  now = new Date(),
): Promise<void> {
  await db.prepare(
    `INSERT INTO acceptance (id, account_id, tenant_id, app_id, document, version, at)
     VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`)
    .bind(newId("acc", now), accountId, scope.tenantId ?? null, scope.appId ?? null,
      document, version, now.toISOString()).run();
}

/**
 * ⚠️ WHAT THE WORKSPACE HAS AGREED TO, BY ANY HAND THAT COULD BIND IT. A
 * data-processing agreement is signed by the business, once — asking every
 * colleague invited afterwards to sign it again is asking somebody to bind a
 * company they do not run, and it puts a wall in front of a person who has no
 * way through it.
 */
export async function acceptedFor(
  db: Db, tenantId: TenantId,
): Promise<readonly Acceptance[]> {
  const rows = await db.prepare(
    `SELECT document, version, at, account_id FROM acceptance WHERE tenant_id = ?`)
    .bind(tenantId).all<{ document: string; version: string; at: string; account_id: string }>();
  return rows.results.map((r) => ({
    document: r.document, version: r.version as never, at: r.at as never, by: r.account_id,
  }));
}

/* ---------------------------------------------------------------- binding --- */

/**
 * WHERE AN ACCEPTANCE IS RECORDED, DERIVED FROM WHAT THE DOCUMENT BINDS.
 *
 * ⚠️ NEVER FROM WHAT THE REQUEST SAID. A scope taken from the body lets somebody
 * answer the data-processing agreement for a workspace they are only a guest in
 * — and the row would then read, for ever, as that business having signed it.
 * The document says who it binds; the door says which workspace is in front of
 * us; the roster says whether this hand can bind it. Nothing else is consulted.
 */
export type AcceptanceScope =
  | { readonly tenantId: TenantId | null; readonly appId: string | null }
  | "needs_a_workspace"
  | "not_yours_to_give";

export const acceptanceScope = (
  def: DocumentDef,
  at: {
    readonly tenantId?: TenantId | null;
    readonly appId?: string | null;
    readonly canBind?: boolean;
  },
): AcceptanceScope => {
  if (def.binds === "person") return { tenantId: null, appId: at.appId ?? null };
  if (!at.tenantId) return "needs_a_workspace";
  if (!at.canBind) return "not_yours_to_give";
  return { tenantId: at.tenantId, appId: at.appId ?? null };
};

/* ------------------------------------------------------------------- owed --- */

export interface Owed {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly version: string;
  readonly url: string | null;
  /** Where it is asked: the person, or the workspace they are opening. */
  readonly binds: DocumentDef["binds"];
  readonly appId: string | null;
}

/**
 * What this person still owes an agreement to, across every binding.
 *
 * ⚠️ ASKED THROUGH `outstanding`, WHICH IS THE KERNEL'S. The rule that an
 * acceptance of an older version is not an acceptance is stated once; a second
 * comparison here would be a wall that opens on a version the record says is
 * still owed.
 *
 * ⚠️ AND A PERSON-BOUND DOCUMENT IS OWED EVERYWHERE, so it is matched against
 * acceptances with no workspace in them. Scoping it to the workspace somebody
 * happened to be in when they agreed would ask again at the next door.
 */
export async function owedBy(
  db: Db,
  accountId: AccountId,
  deployment: DocumentBook,
  at: {
    readonly tenantId?: TenantId | null;
    readonly apps?: Readonly<Record<string, DocumentBook>>;
    /**
     * ⚠️ WHETHER THIS CALLER CAN BIND THE WORKSPACE. A tenant-bound document is
     * the business's agreement, and somebody who cannot give it must not be
     * stopped by its absence — that is a wall with no door in it for them.
     */
    readonly canBind?: boolean;
  } = {},
): Promise<readonly Owed[]> {
  const all = await acceptancesOf(db, accountId);
  const out: Owed[] = [];

  const say = (d: DocumentDef, appId: string | null): Owed => ({
    id: d.id, title: d.title, kind: d.kind, version: d.version,
    url: d.url ?? null, binds: d.binds, appId,
  });

  /* The person's own, wherever they are. */
  for (const d of outstanding(deployment, all.filter((a) => !a.tenantId && !a.appId), "person")) {
    out.push(say(d, null));
  }
  /* The workspace's, once they are in one. */
  if (at.tenantId) {
    const here = all.filter((a) => a.tenantId === at.tenantId);
    /* ⚠️ ASKED OF THE WORKSPACE, ANSWERED BY WHOEVER CAN BIND IT — and asked of
       nobody else. Its acceptances are the workspace's, whichever hand gave
       them, so a colleague invited later is not stopped by a signature they
       could not have provided. */
    if (at.canBind) {
      const workspace = await acceptedFor(db, at.tenantId);
      for (const d of outstanding(deployment, workspace, "tenant")) out.push(say(d, null));
    }

    /* And whatever the apps enabled here add of their own.

       ⚠️ AN APP'S PERSON-BOUND DOCUMENT IS THE PERSON'S, ONCE PER APP — matched
       against acceptances with no workspace in them, exactly as the
       deployment's are. Scoping it to the workspace they happened to be in
       would ask the same person for the same agreement at every door the app is
       enabled behind. Its tenant-bound documents follow the DPA's rule and are
       asked only of a hand that can bind the business. */
    for (const [appId, book] of Object.entries(at.apps ?? {})) {
      const mine = all.filter((a) => a.appId === appId);
      for (const d of outstanding(book, mine.filter((a) => !a.tenantId), "person")) {
        out.push(say(d, appId));
      }
      if (at.canBind) {
        for (const d of outstanding(book, here.filter((a) => a.appId === appId), "tenant")) {
          out.push(say(d, appId));
        }
      }
    }
  }
  return out;
}
