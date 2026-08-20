/**
 * WHAT SOMEBODY SET — the flag store, and only the store.
 *
 * ⚠️ SEPARATE FROM `operator.ts` BECAUSE `locate` READS IT ON EVERY REQUEST. The
 * console writes these rows and the locator reads them, so putting them in the
 * console's module would drag its whole graph — Cloudflare, resources, billing,
 * the AI catalogue — into the path in front of every request.
 *
 * ⚠️ AND THE ROWS ARE NOT AN ANSWER. A row exists only for a flag somebody has
 * TOUCHED, so a map built from this store is missing every flag still on its
 * declared fallback, which is most of them. `resolveFlags` in the kernel is what
 * turns these into what is on, once per request, in `serve`.
 *
 * ⚠️ THE TABLES ARE DECLARED IN `OPERATOR_SCHEMA`, beside maintenance, because
 * they are the same kind of thing: the deployment's own switches rather than any
 * workspace's records.
 */

import type { Db } from "./sql.js";

/**
 * BOTH LEVELS IN ONE STATEMENT, FOR A REQUEST THAT IS ABOUT TO BE SERVED.
 *
 * ⚠️ ONE TRIP, NOT TWO, AND THE BUDGET IS WHY. `request-cost.test.ts` counts
 * every query a read makes; asking these separately took an ordinary list from
 * ten to twelve, which is a fifth more database work on every request in the
 * product to answer a question about switches almost nobody has set.
 *
 * ⚠️ AND IT IS SKIPPED ENTIRELY WHERE NOTHING DECLARES A FLAG. A deployment
 * whose products have no flags has nothing to resolve, so it should pay nothing
 * — the caller passes `declares: false` and this is never reached. A cost only
 * the deployments using a feature pay is the only kind worth adding.
 */
export async function switchesFor(
  db: Db, tenantId: string, accountId?: string | null,
): Promise<{
  readonly deployment: Readonly<Record<string, boolean>>;
  readonly tenant: Readonly<Record<string, boolean>>;
  readonly person: Readonly<Record<string, boolean>>;
}> {
  /*
    ⚠️ THREE LEVELS, STILL ONE TRIP. The person's rows are keyed by workspace AND
    account, so they join this statement rather than needing one of their own —
    and a caller with no account (a public read) binds a value nothing matches
    instead of branching, which keeps the query one shape.
  */
  const rows = await db.prepare(
    `SELECT 'all' AS lvl, id, on_flag FROM deployment_flag
     UNION ALL
     SELECT 'one' AS lvl, id, on_flag FROM tenant_flag WHERE tenant_id = ?1
     UNION ALL
     SELECT 'me' AS lvl, id, on_flag FROM person_flag
      WHERE tenant_id = ?1 AND account_id = ?2`)
    .bind(tenantId, accountId ?? "").all<{ lvl: string; id: string; on_flag: number }>();
  const deployment: Record<string, boolean> = {};
  const tenant: Record<string, boolean> = {};
  const person: Record<string, boolean> = {};
  const at = { all: deployment, one: tenant, me: person } as const;
  for (const r of rows.results) {
    (at[r.lvl as keyof typeof at] ?? deployment)[r.id] = !!r.on_flag;
  }
  return { deployment, tenant, person };
}

/** ⚠️ `null` clears, for the same reason it does one level up. */
export async function setPersonFlag(
  db: Db, tenantId: string, accountId: string, id: string, on: boolean | null,
  now = new Date(),
): Promise<void> {
  if (on === null) {
    await db.prepare(`DELETE FROM person_flag WHERE tenant_id = ? AND account_id = ? AND id = ?`)
      .bind(tenantId, accountId, id).run();
    return;
  }
  await db.prepare(
    `INSERT INTO person_flag (tenant_id, account_id, id, on_flag, at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, account_id, id) DO UPDATE SET on_flag = excluded.on_flag, at = excluded.at`)
    .bind(tenantId, accountId, id, on ? 1 : 0, now.toISOString()).run();
}

/** ⚠️ Who in this workspace holds a row for one flag, so the screen can undo it. */
export async function flagPeople(
  db: Db, tenantId: string, id: string,
): Promise<Readonly<Record<string, boolean>>> {
  const rows = await db.prepare(
    `SELECT account_id, on_flag FROM person_flag WHERE tenant_id = ? AND id = ?`)
    .bind(tenantId, id).all<{ account_id: string; on_flag: number }>();
  return Object.fromEntries(rows.results.map((r) => [r.account_id, !!r.on_flag]));
}

/** ⚠️ The deployment's own answer. `off` here is absorbing — see `resolve`. */
export async function deploymentFlags(db: Db): Promise<Readonly<Record<string, boolean>>> {
  const rows = await db.prepare(`SELECT id, on_flag FROM deployment_flag`)
    .all<{ id: string; on_flag: number }>();
  return Object.fromEntries(rows.results.map((r) => [r.id, !!r.on_flag]));
}

/**
 * ⚠️ `null` CLEARS HERE TOO, AND WITHOUT IT A TRIAL IS UNREACHABLE. The
 * deployment's `off` is ABSORBING — that is what makes it a kill switch — so an
 * operator who presses off has, with one press, made it impossible for any
 * workspace to hold the feature ever again. Three states, not two: following the
 * declaration (no row), on for everybody, off for everybody. Only the middle
 * state leaves room for `trying` to mean anything.
 */
export async function setDeploymentFlag(
  db: Db, id: string, on: boolean | null, now = new Date(),
): Promise<void> {
  if (on === null) {
    await db.prepare(`DELETE FROM deployment_flag WHERE id = ?`).bind(id).run();
    return;
  }
  await db.prepare(
    `INSERT INTO deployment_flag (id, on_flag, at) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET on_flag = excluded.on_flag, at = excluded.at`)
    .bind(id, on ? 1 : 0, now.toISOString()).run();
}

/** ⚠️ ONE WORKSPACE'S OWN SWITCHES. Absent is not `false` — see `resolveFlags`. */
export async function tenantFlags(
  db: Db, tenantId: string,
): Promise<Readonly<Record<string, boolean>>> {
  const rows = await db.prepare(`SELECT id, on_flag FROM tenant_flag WHERE tenant_id = ?`)
    .bind(tenantId).all<{ id: string; on_flag: number }>();
  return Object.fromEntries(rows.results.map((r) => [r.id, !!r.on_flag]));
}

/**
 * ⚠️ `null` CLEARS THE ROW RATHER THAN WRITING `false`, and the difference is the
 * whole of the level algebra. A stored `false` holds this workspace off even
 * after the flag ships to everybody; no row at all means "whatever the level
 * above says". Without the clear, trying a feature on ten workspaces leaves ten
 * permanent exceptions nobody remembers making.
 */
export async function setTenantFlag(
  db: Db, tenantId: string, id: string, on: boolean | null, now = new Date(),
): Promise<void> {
  if (on === null) {
    await db.prepare(`DELETE FROM tenant_flag WHERE tenant_id = ? AND id = ?`)
      .bind(tenantId, id).run();
    return;
  }
  await db.prepare(
    `INSERT INTO tenant_flag (tenant_id, id, on_flag, at) VALUES (?, ?, ?, ?)
     ON CONFLICT(tenant_id, id) DO UPDATE SET on_flag = excluded.on_flag, at = excluded.at`)
    .bind(tenantId, id, on ? 1 : 0, now.toISOString()).run();
}

/**
 * HOW MANY WORKSPACES HOLD AN EXCEPTION TO EACH FLAG, ON AND OFF SEPARATELY.
 *
 * ⚠️ WITHOUT THIS THE CONSOLE REPORTS A HALF-TRUTH AS A FACT. A flag off at the
 * deployment and on for eleven workspaces draws exactly the same row as one
 * nobody has ever touched — so the screen that exists to say what is switched on
 * says "off" about a feature eleven customers are using. The counts are what
 * make `trying` a state somebody can see rather than a word in a declaration.
 */
export async function flagExceptions(
  db: Db,
): Promise<Readonly<Record<string, { readonly on: number; readonly off: number }>>> {
  const rows = await db.prepare(
    `SELECT id, on_flag, COUNT(*) AS n FROM tenant_flag GROUP BY id, on_flag`)
    .all<{ id: string; on_flag: number; n: number }>();
  const out: Record<string, { on: number; off: number }> = {};
  for (const r of rows.results) {
    const at = out[r.id] ?? (out[r.id] = { on: 0, off: 0 });
    if (r.on_flag) at.on = r.n; else at.off = r.n;
  }
  return out;
}

/**
 * WHICH WORKSPACES HOLD AN EXCEPTION TO ONE FLAG, BY NAME.
 *
 * ⚠️ A LIST OF IDS IS NOT A SURFACE. The whole reason an exception exists is
 * that somebody decided this customer should have the feature early, and the
 * screen that lets them undo it has to say which customer — an id says nothing
 * to the person who made the decision three weeks ago.
 */
export async function flagHolders(
  db: Db, id: string,
): Promise<readonly {
  readonly id: string; readonly name: string; readonly slug: string; readonly on: boolean;
}[]> {
  const rows = await db.prepare(
    `SELECT t.id AS id, t.name AS name, t.slug AS slug, f.on_flag AS on_flag
       FROM tenant_flag f JOIN tenant t ON t.id = f.tenant_id
      WHERE f.id = ? ORDER BY t.name`)
    .bind(id).all<{ id: string; name: string; slug: string; on_flag: number }>();
  return rows.results.map((r) => ({
    id: r.id, name: r.name, slug: r.slug, on: !!r.on_flag,
  }));
}

/**
 * ⚠️ HOW MANY PEOPLE THIS WORKSPACE HAS DECIDED FOR, PER FLAG. A row saying "on"
 * over a workspace where four people are held back is a row that is true and
 * misleading — the count is what makes the exception visible from the list
 * rather than only from inside.
 */
export async function flagCounts(
  db: Db, tenantId: string,
): Promise<Readonly<Record<string, number>>> {
  const rows = await db.prepare(
    `SELECT id, COUNT(*) AS n FROM person_flag WHERE tenant_id = ? GROUP BY id`)
    .bind(tenantId).all<{ id: string; n: number }>();
  return Object.fromEntries(rows.results.map((r) => [r.id, r.n]));
}
