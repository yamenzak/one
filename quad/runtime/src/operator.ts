/**
 * THE OPERATOR'S OWN SURFACE — the deployment looking at itself.
 *
 * ⚠️ OPERATOR OPERATIONS ARE PERSONAL OPERATIONS ON THE OPERATOR DOOR. They
 * resolve no workspace — the deployment is the subject — so they ride the
 * personal lane, restricted to `doors: ["operator"]`, with one further check
 * this file owns: the session's address must be an operator's. Who counts is
 * the DEPLOYMENT'S configuration, injected — a role could not express it,
 * because roles live inside workspaces and the operator stands outside all
 * of them.
 *
 * ⚠️ MAINTENANCE IS THE HOST GATE ONE LEVEL UP. `readonly` refuses writes and
 * serves reads; `full` withholds everything but the operator door, `/health`
 * and the personal lane — leaving must never be something maintenance can
 * prevent. Enforced in `performOperation`, the one path both doors end in
 * (D12), so the agent door cannot forget it.
 *
 * ⚠️ AND THE SWITCH FAILS OPEN. A deployment whose directory lacks the table
 * has never provisioned the switch; refusing every request over OUR missing
 * row would be an outage the feature caused.
 */

import type { AppId, Allowance, AppSpec, FlagBook, TenantId } from "@quad/kernel";
import { adjust, subscriptionFor } from "./billing.js";
import { appsOfTenant, shards } from "./directory.js";
import { runsOf } from "./jobs.js";
import type { PersonalBook, PersonalCtx } from "./personal.js";
import type { SchemaModule } from "./schema.js";
import type { Db } from "./sql.js";

/* ----------------------------------------------------------------- schema --- */

export const OPERATOR_SCHEMA: SchemaModule = {
  id: "operator",
  statements: [
    `CREATE TABLE IF NOT EXISTS deployment_flag (id TEXT PRIMARY KEY, on_flag INTEGER NOT NULL, at TEXT NOT NULL);`,
    /* ⚠️ One row, and the primary key says so — two maintenance modes at once
       is two answers to "may this request run". */
    `CREATE TABLE IF NOT EXISTS maintenance (id TEXT PRIMARY KEY CHECK (id = 'the'), mode TEXT NOT NULL, at TEXT NOT NULL);`,
  ],
};

/* ------------------------------------------------------------------ store --- */

export async function deploymentFlags(db: Db): Promise<Readonly<Record<string, boolean>>> {
  const rows = await db.prepare(`SELECT id, on_flag FROM deployment_flag`)
    .all<{ id: string; on_flag: number }>();
  return Object.fromEntries(rows.results.map((r) => [r.id, !!r.on_flag]));
}

export async function setDeploymentFlag(
  db: Db, id: string, on: boolean, now = new Date(),
): Promise<void> {
  await db.prepare(
    `INSERT INTO deployment_flag (id, on_flag, at) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET on_flag = excluded.on_flag, at = excluded.at`)
    .bind(id, on ? 1 : 0, now.toISOString()).run();
}

export type MaintenanceMode = "off" | "readonly" | "full";

export async function maintenanceMode(db: Db): Promise<MaintenanceMode> {
  try {
    const row = await db.prepare(`SELECT mode FROM maintenance WHERE id = 'the'`)
      .first<{ mode: string }>();
    const mode = row?.mode;
    return mode === "readonly" || mode === "full" ? mode : "off";
  } catch {
    /* ⚠️ Fails OPEN — see the header. */
    return "off";
  }
}

export async function setMaintenance(
  db: Db, mode: MaintenanceMode, now = new Date(),
): Promise<void> {
  await db.prepare(
    `INSERT INTO maintenance (id, mode, at) VALUES ('the', ?, ?)
     ON CONFLICT(id) DO UPDATE SET mode = excluded.mode, at = excluded.at`)
    .bind(mode, now.toISOString()).run();
}

/* ------------------------------------------------------------- operations --- */

export interface OperatorDeps {
  readonly apps: Readonly<Record<string, () => AppSpec>>;
  /**
   * ⚠️ INJECTED, BECAUSE ONLY THE DEPLOYMENT KNOWS. An operator is outside
   * every workspace; no roster and no role can answer this.
   */
  readonly isOperator: (email: string | null) => boolean;
}

export function operatorOps(deps: OperatorDeps): PersonalBook {
  const every = () => Object.values(deps.apps).map((make) => make());

  /* ⚠️ Every operation here asks, first. The door filter keeps these off other
     hostnames; this keeps them off other PEOPLE. */
  const operator = (ctx: PersonalCtx): void => {
    if (!deps.isOperator(ctx.email)) ctx.fail("platform.forbidden");
  };

  return {
    /*
      ⚠️ ONE ROW PER WORKSPACE, WITH ITS STANDING PER PRODUCT. The adjustments
      column travels with it because the console's one write is the absolute,
      either-direction, per-tenant adjustment — the operator's deliberate
      decision, distinct from grandfathering by design.
    */
    "op.tenants": {
      kind: "read", needs: "session", doors: ["operator"],
      async run(ctx): Promise<unknown> {
        operator(ctx);
        const rows = await ctx.directory.prepare(
          `SELECT * FROM tenant ORDER BY at DESC LIMIT 200`).all();
        const items = await Promise.all(rows.results.map(async (r) => {
          const id = r.id as TenantId;
          const enabled = await appsOfTenant(ctx.directory, id);
          const held = await Promise.all(enabled.map(async (appId) => {
            const sub = await subscriptionFor(ctx.directory, id, appId);
            return {
              id: appId,
              planId: sub?.planId ?? null,
              status: sub?.status ?? null,
              adjustments: sub?.adjustments ?? {},
            };
          }));
          return {
            id, slug: r.slug, name: r.name, country: r.country,
            shardId: r.shard_id, closedAt: r.closed_at ?? null, apps: held,
          };
        }));
        /* The catalogue each product sells, once — the adjust sheet's choices. */
        const apps = every().map((a) => ({
          id: a.id, name: a.name, mark: a.mark,
          entitlements: a.entitlements, plans: a.plans,
        }));
        return { items, apps };
      },
    },

    /*
      ⚠️ ABSOLUTE, EITHER DIRECTION, CLEARED PER KEY — the operator column of
      D-billing. `null` clears ONE key; nothing here can touch the
      grandfathering, which only ever ratchets up.
    */
    "op.tenant.adjust": {
      kind: "write", needs: "session", doors: ["operator"],
      async run(ctx, input): Promise<unknown> {
        operator(ctx);
        const tenantId = String(input.tenant ?? "") as TenantId;
        const appId = String(input.app ?? "") as AppId;
        const key = String(input.key ?? "");
        const given = input.value;
        const value: Allowance | null =
          given === null ? null
            : typeof given === "number" || typeof given === "boolean" ? given
              : undefined as never;
        if (!tenantId || !appId || !key || value === undefined) return ctx.fail("platform.invalid");
        const app = deps.apps[appId]?.();
        if (!app || !(key in app.entitlements)) return ctx.fail("platform.invalid");
        await adjust(ctx.directory, tenantId, appId, key, value, ctx.now);
        return { tenant: tenantId, app: appId, key };
      },
    },

    "op.flags": {
      kind: "read", needs: "session", doors: ["operator"],
      async run(ctx): Promise<unknown> {
        operator(ctx);
        const books: Record<string, FlagBook> = {};
        for (const a of every()) if (a.flags && Object.keys(a.flags).length) books[a.id] = a.flags;
        return { books, deployment: await deploymentFlags(ctx.directory) };
      },
    },

    "op.flag.set": {
      kind: "write", needs: "session", doors: ["operator"],
      async run(ctx, input): Promise<unknown> {
        operator(ctx);
        const id = String(input.id ?? "");
        /* ⚠️ A switch nothing declares is a switch that does nothing — refused
           rather than stored, or the console fills with rows that lie. */
        if (!every().some((a) => a.flags && id in a.flags)) return ctx.fail("platform.not_found");
        await setDeploymentFlag(ctx.directory, id, input.on === true, ctx.now);
        return { id, on: input.on === true };
      },
    },

    "op.jobs": {
      kind: "read", needs: "session", doors: ["operator"],
      async run(ctx): Promise<unknown> {
        operator(ctx);
        const book = Object.fromEntries(every().flatMap((a) => Object.entries(a.jobs ?? {})));
        return { book, runs: await runsOf(ctx.directory, book, 50) };
      },
    },

    "op.shards": {
      kind: "read", needs: "session", doors: ["operator"],
      async run(ctx): Promise<unknown> {
        operator(ctx);
        return { items: await shards(ctx.directory) };
      },
    },

    "op.maintenance": {
      kind: "read", needs: "session", doors: ["operator"],
      async run(ctx): Promise<unknown> {
        operator(ctx);
        return { mode: await maintenanceMode(ctx.directory) };
      },
    },

    "op.maintenance.set": {
      kind: "write", needs: "session", doors: ["operator"],
      async run(ctx, input): Promise<unknown> {
        operator(ctx);
        const mode = String(input.mode ?? "");
        if (mode !== "off" && mode !== "readonly" && mode !== "full") return ctx.fail("platform.invalid");
        await setMaintenance(ctx.directory, mode, ctx.now);
        return { mode };
      },
    },
  };
}
