/**
 * THE SETTINGS STORE, AND THE TWO OPERATIONS OVER IT.
 *
 * ⚠️ AN APP DECLARES A SETTING AND NEVER STORES ONE. The rows live here, the
 * screens are the platform's (`@engine/design` renders the book), and these two
 * operations are the only path between them — so "who may change it" is asked
 * in exactly one place, with the level deciding the authority: a `person` row
 * is the caller's own, a `tenant` row needs the declaration's `needs`, and an
 * `operator` row does not answer on a workspace's door at all.
 *
 * ⚠️ A SECRET LEAVES THE SERVER AS `{ set }` AND NEVER AS ITSELF. The read path
 * goes through the kernel's `disclose`, which is what makes "write-only" a
 * property of the platform rather than a habit of screens.
 *
 * ⚠️ AND WHAT THE CALLER MAY NOT CHANGE IS ABSENT FROM THE READ. Sending every
 * tenant value to every member and trusting the screen to hide some is the
 * shape where a payload carries what a page withholds.
 */

import type { AppSpec, TenantId } from "@engine/kernel";
import { PUBLIC, checkSome, disclose, refusePrompt, valueOf } from "@engine/kernel";
import { actionsOf, word, wordingOf } from "./ai-actions.js";
import type { PlatformCtx } from "./member-ops.js";
import type { Resolved } from "./compose.js";
import type { SchemaModule } from "./schema.js";
import type { Db } from "./sql.js";

/* ----------------------------------------------------------------- schema --- */

export const SETTING_SCHEMA: SchemaModule = {
  id: "setting",
  statements: [
    /* ⚠️ `account_id` is '' for a tenant-level row, never NULL — NULL breaks
       the unique index, and two tenant rows for one id is two answers. */
    `CREATE TABLE IF NOT EXISTS setting (tenant_id TEXT NOT NULL, app TEXT NOT NULL, account_id TEXT NOT NULL DEFAULT '', id TEXT NOT NULL, value_json TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (tenant_id, app, id, account_id));`,
  ],
};

/* ------------------------------------------------------------------ store --- */

export async function storedSettings(
  db: Db, tenantId: TenantId, app: string, accountId: string,
): Promise<Readonly<Record<string, unknown>>> {
  const rows = await db.prepare(
    `SELECT id, value_json FROM setting WHERE tenant_id = ? AND app = ? AND account_id = ?`)
    .bind(tenantId, app, accountId).all<{ id: string; value_json: string }>();
  return Object.fromEntries(rows.results.map((r) => [r.id, JSON.parse(r.value_json) as unknown]));
}

export async function writeSetting(
  db: Db, tenantId: TenantId, app: string, accountId: string, id: string, value: unknown,
  now: Date,
): Promise<void> {
  await db.prepare(
    `INSERT INTO setting (tenant_id, app, account_id, id, value_json, at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, app, id, account_id) DO UPDATE SET value_json = excluded.value_json, at = excluded.at`)
    .bind(tenantId, app, accountId, id, JSON.stringify(value ?? null), now.toISOString()).run();
}

/* ------------------------------------------------------------- operations --- */

export function settingOps(app: AppSpec): Readonly<Record<string, Resolved>> {
  /* ⚠️ The target app is an INPUT — same reason as the package rail: every
     composition carries these ids, and the route resolves whichever app is
     first, so binding the composing app could never answer for the second
     product. Authority is asked IN THE TARGET's context, not the caller's
     entry point. */
  const targetOf = (ctx: PlatformCtx, input: Record<string, unknown>): AppSpec | null => {
    const named = input.app === undefined ? app.id : String(input.app);
    if (!ctx.enabledApps.includes(named)) return null;
    return named === app.id ? app : ctx.appOf(named);
  };

  const op = (
    id: string, kind: "read" | "write", summary: string,
    run: (ctx: PlatformCtx, input: Record<string, unknown>) => Promise<unknown>,
  ): Resolved => ({
    id, kind,
    method: kind === "read" ? "GET" : "POST",
    path: `/api/${id}`,
    permission: PUBLIC,
    spec: {
      id, kind, summary,
      input: {}, output: {},
      permission: PUBLIC,
      idempotency: { mode: "none" },
      ...(kind === "write" ? { emits: ["setting.changed"] } : {}),
      async handler() { return {} as never; },
    } as Resolved["spec"],
    run: (ctx, input) => run(ctx as PlatformCtx, input),
  });

  return {
    /*
      ⚠️ `PUBLIC` BECAUSE THE ANSWER IS SHAPED PER CALLER, NOT BECAUSE IT IS
      OPEN. A signed-out caller gets nothing; a member gets their own person
      rows and only the tenant rows they could change (the autodiscovery rule:
      permission lacking = absent, entitlement lacking = shown and locked —
      the LOCK is the screen's job, the ABSENCE is this one's).
    */
    "setting.read": op("setting.read", "read", "Your settings here, and the workspace's.",
      async (ctx, input) => {
        if (!ctx.accountId) return ctx.fail("platform.unauthorized");
        const target = targetOf(ctx, input);
        if (!target) return ctx.fail("platform.not_found");
        const book = target.settings ?? {};
        const mine = await ctx.permissionsIn(target.id);
        const tenantRows = await storedSettings(ctx.db, ctx.tenantId as TenantId, target.id, "");
        const personRows = await storedSettings(ctx.db, ctx.tenantId as TenantId, target.id, ctx.accountId);

        const tenant: Record<string, unknown> = {};
        const person: Record<string, unknown> = {};
        for (const def of Object.values(book)) {
          if (def.level === "tenant") {
            if (def.needs && !mine.has(def.needs)) continue;
            /* ⚠️ Through `disclose`, so a secret is `{ set }` — never itself. */
            tenant[def.id] = disclose(def, tenantRows);
          }
          if (def.level === "person") person[def.id] = { value: personRows[def.id] };
        }
        return { tenant, person };
      }),

    /*
      ⚠️ THE WORKSPACE'S OWN WORDING FOR WHAT IT MAY REWORD (D19). Only actions
      the app declared `brandable` — asked by the kernel at the write, so the
      rule is true of the API and the import as well as of the screen.
    */
    "ai.wording": op("ai.wording", "read", "What the AI features say, and in whose words.",
      async (ctx, input) => {
        if (!ctx.accountId) return ctx.fail("platform.unauthorized");
        const target = targetOf(ctx, input);
        if (!target) return ctx.fail("platform.not_found");
        const theirs = await wordingOf(ctx.db, ctx.tenantId as TenantId, target.id);
        return {
          items: actionsOf(target)
            .filter((a) => a.ai.brandable)
            .map((a) => ({
              id: a.id, summary: a.summary,
              variables: a.ai.variables,
              declared: a.ai.prompt,
              prompt: theirs[a.id] ?? null,
            })),
        };
      }),

    "ai.word": op("ai.word", "write", "Put an AI feature in your own words.",
      async (ctx, input) => {
        if (!ctx.accountId) return ctx.fail("platform.unauthorized");
        const target = targetOf(ctx, input);
        if (!target) return ctx.fail("platform.not_found");
        /* ⚠️ Workspace authority — this is the workspace's voice, not a
           person's preference. */
        const mine = await ctx.permissionsIn(target.id);
        if (!mine.has("tenant:manage")) return ctx.fail("platform.forbidden");

        const action = actionsOf(target).find((a) => a.id === String(input.action ?? ""));
        if (!action) return ctx.fail("platform.not_found");
        const text = input.prompt === null ? null : String(input.prompt ?? "");
        if (text !== null) {
          const refused = refusePrompt(action.ai, text, "tenant");
          if (refused.length) return ctx.fail("platform.invalid", { detail: refused.join(", ") });
        }
        await word(ctx.db, ctx.tenantId as TenantId, target.id, action.id, text, ctx.now);
        return { action: action.id };
      }),

    "setting.write": op("setting.write", "write", "Change a setting.",
      async (ctx, input) => {
        if (!ctx.accountId) return ctx.fail("platform.unauthorized");
        const target = targetOf(ctx, input);
        if (!target) return ctx.fail("platform.not_found");
        const book = target.settings ?? {};
        const id = String(input.id ?? "");
        const def = book[id];
        /* ⚠️ An operator setting is the deployment's — on this door it does
           not exist, and saying so would confirm the name. */
        if (!def || def.level === "operator") return ctx.fail("platform.not_found");

        const checked = checkSome({ [id]: def.field }, { [id]: input.value });
        if (!checked.ok) return ctx.fail("platform.invalid", { detail: checked.why });

        if (def.level === "tenant") {
          /* ⚠️ The declaration's `needs` is the authority, asked in the TARGET
             app's context — the manifest refuses a tenant setting without one,
             so this branch cannot be reached ungated by construction. */
          const mine = await ctx.permissionsIn(target.id);
          if (!def.needs || !mine.has(def.needs)) return ctx.fail("platform.forbidden");
          await writeSetting(ctx.db, ctx.tenantId as TenantId, target.id, "", id,
            checked.values[id], ctx.now);
        } else {
          await writeSetting(ctx.db, ctx.tenantId as TenantId, target.id, ctx.accountId, id,
            checked.values[id], ctx.now);
        }
        return { id };
      }),
  };
}

/* ----------------------------------------------------------------- reading --- */

/**
 * WHAT A HANDLER SEES WHEN IT ASKS FOR A SETTING.
 *
 * ⚠️ A SETTING NO CODE CAN READ IS A SWITCH THAT CHANGES NOTHING, and that is
 * worse than an absent feature: somebody presses it, it saves, it is drawn back
 * to them, and they stop looking for the thing it promised. For as long as this
 * seam did not exist, the whole settings rail was that — the surface half of the
 * platform's own bidirectional rule with no enforced half under it.
 *
 * ⚠️ THE LEVEL DECIDES WHOSE ROW IS READ, and getting it wrong is invisible. A
 * `tenant` setting is the workspace's, stored under the empty account; a
 * `person` setting is the caller's own. Reading the workspace's row for a
 * personal switch gives every member whatever the last one set.
 *
 * ⚠️ AND A MISSING ROW IS THE DECLARED FALLBACK, NEVER `undefined` — through
 * `valueOf`, the one resolution the screen already uses. Two resolutions is how
 * a screen and a handler come to disagree about what a workspace switched on.
 */
export async function settingsFor(
  db: Db, tenantId: TenantId, app: AppSpec, accountId: string | null,
): Promise<Readonly<Record<string, unknown>>> {
  const book = app.settings ?? {};
  if (!Object.keys(book).length) return {};

  const tenantRows = await storedSettings(db, tenantId, app.id, "");
  /* ⚠️ A caller with no account has no personal rows, and asking for them with
     an empty id would read the WORKSPACE's — the one confusion this whole
     function exists to make impossible. */
  const personRows = accountId
    ? await storedSettings(db, tenantId, app.id, accountId)
    : {};

  const out: Record<string, unknown> = {};
  for (const def of Object.values(book)) {
    out[def.id] = valueOf(def, def.level === "tenant" ? tenantRows : personRows);
  }
  return out;
}
