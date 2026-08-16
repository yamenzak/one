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

import type { AppId, Allowance, AppSpec, FlagBook, ModelRow, TenantId } from "@quad/kernel";
import { inLane, refusePrompt } from "@quad/kernel";
import { actionsOf, bind, bindingsOf, running } from "./ai-actions.js";
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
  /** ⚠️ The model catalogue — the platform's, and the same rows metering reads. */
  readonly models?: () => Promise<readonly ModelRow[]>;
}

export function operatorOps(input: OperatorDeps): PersonalBook {
  /* ⚠️ A deployment with no catalogue wired has NO models, which every reader
     already handles as "the lane has nothing enabled" — never a throw. */
  const deps = { models: async (): Promise<readonly ModelRow[]> => [], ...input };
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
        /* ⚠️ THE APP'S IDENTITY TRAVELS WITH ITS BOOK, and it did not: this
           answered a map keyed by app id, so the console had nothing to head a
           section with but the id — rendered through `sentence()`, which
           capitalises a key and calls it a name. A product's name and its mark
           are declared; manufacturing one of them at the screen is how "hello"
           came to be a heading. */
        const apps = every()
          .filter((a) => a.flags && Object.keys(a.flags).length)
          .map((a) => ({ id: a.id, name: a.name, mark: a.mark, book: a.flags as FlagBook }));
        return { apps, deployment: await deploymentFlags(ctx.directory) };
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

    /*
      ⚠️ EVERY GENERATING ACTION EVERY PRODUCT DECLARES, WITH WHAT IT RUNS ON
      (D19). The catalogue rows travel with it because the binding is a choice
      among them, and a screen that had to fetch them separately would be a
      screen that can offer a model the lane cannot use.
    */
    "op.ai": {
      kind: "read", needs: "session", doors: ["operator"],
      async run(ctx): Promise<unknown> {
        operator(ctx);
        const models = await deps.models();
        const apps = await Promise.all(every().map(async (a) => {
          const bound = await bindingsOf(ctx.directory, a.id);
          return {
            id: a.id, name: a.name, mark: a.mark,
            actions: actionsOf(a).map((action) => {
              const binding = bound.find((b) => b.action === action.id);
              const now = running(action.ai, models, binding, undefined);
              return {
                id: action.id, summary: action.summary,
                lane: action.ai.lane,
                variables: action.ai.variables,
                brandable: action.ai.brandable === true,
                declared: action.ai.prompt,
                prompt: now.prompt,
                wordedBy: now.wordedBy,
                model: now.model?.id ?? null,
                bound: binding?.model ?? null,
                /* ⚠️ Only the rows this lane can actually use — see `lanesFor`. */
                choices: inLane(models, action.ai.lane).filter((m) => m.enabled)
                  .map((m) => ({ id: m.id, label: m.label, provider: m.provider })),
              };
            }),
          };
        }));
        return { apps };
      },
    },

    "op.ai.bind": {
      kind: "write", needs: "session", doors: ["operator"],
      async run(ctx, input): Promise<unknown> {
        operator(ctx);
        const appId = String(input.app ?? "");
        const actionId = String(input.action ?? "");
        const app = deps.apps[appId]?.();
        const action = app ? actionsOf(app).find((a) => a.id === actionId) : undefined;
        if (!action) return ctx.fail("platform.not_found");

        const change: { model?: string | null; prompt?: string | null } = {};
        if (input.model !== undefined) {
          const wants = input.model === null ? null : String(input.model);
          /* ⚠️ Only a row this lane can use, and only an enabled one — a
             binding to anything else is a binding that silently falls back. */
          if (wants !== null) {
            const models = await deps.models();
            const usable = inLane(models, action.ai.lane).some((m) => m.id === wants && m.enabled);
            if (!usable) return ctx.fail("platform.invalid");
          }
          change.model = wants;
        }
        if (input.prompt !== undefined) {
          const text = input.prompt === null ? null : String(input.prompt);
          if (text !== null) {
            const refused = refusePrompt(action.ai, text, "operator");
            if (refused.length) return ctx.fail("platform.invalid", { detail: refused.join(", ") });
          }
          change.prompt = text;
        }
        await bind(ctx.directory, appId, actionId, change, ctx.now);
        return { app: appId, action: actionId };
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
