/**
 * A MANIFEST BECOMES A SURFACE.
 *
 * ⚠️ NOTHING IS REGISTERED. The routes, the CRUD operations, the permissions
 * they need and the quotas they count against are all derived from the
 * declarations — because a surface assembled by hand is one where an operation
 * exists and no route reaches it, and every suite stays green while it does.
 *
 * ⚠️ COMPOSITION IS LAZY, PER APP (D4). A request composes the app it is for and
 * no other. The alternative — building every app's table at module scope — puts
 * the whole catalogue in the startup CPU budget of every request to every
 * product, so the catalogue that was meant to grow is the thing that cannot.
 * The memo below is what makes the second request free.
 *
 * ⚠️ AND THE CRUD OPERATIONS ARE REAL OPERATIONS. They go through the same gate,
 * the same audit and the same problem catalogue as a hand-written one; a second
 * path for "the generated ones" is a second place every cross-cutting concern
 * has to be remembered (D12).
 */

import type {
  AnyOperation, AppSpec, CollectionSpec, CrudVerb, Gate, Permission, ProblemCatalog,
} from "@quad/kernel";
import { PLATFORM_PROBLEMS, eraseBy, eventFor, operationsFor, permissionFor, routeFor } from "@quad/kernel";
import { tableFor } from "@quad/kernel";
import type { Db } from "./sql.js";
import { list, patch, put, readOne } from "./records.js";
import { memberOps } from "./member-ops.js";
import { packageOps } from "./packages.js";
import { settingOps } from "./settings.js";
import { moneyOps } from "./money-ops.js";
import { centreOps } from "./centre-ops.js";

/* ------------------------------------------------------------------ shape --- */

/**
 * What a handler is given.
 *
 * ⚠️ NO BINDING, NO ENV, NO REQUEST, AND NOT THE DIRECTORY. Its own tenant's
 * database, who is asking, the time, and a way to refuse. Anything more would
 * let an app reach around the platform, and the platform's guarantees would
 * become things apps opt into. `PlatformCtx` is the widened one, and only the
 * platform's own operations are handed it.
 */
export interface Ctx {
  readonly db: Db;
  readonly tenantId: string;
  readonly accountId: string | null;
  readonly now: Date;
  /** ⚠️ Refuse from inside a handler with a catalogue code, never a bare throw. */
  readonly fail: (code: string, values?: Record<string, string | number>) => never;
}

export interface Resolved {
  readonly id: string;
  readonly kind: "read" | "write";
  readonly method: string;
  readonly path: string;
  readonly permission: Permission;
  readonly spec: AnyOperation;
  readonly run: (ctx: Ctx, input: Record<string, unknown>) => Promise<unknown>;
}

export interface Composed {
  readonly app: AppSpec;
  readonly byId: ReadonlyMap<string, Resolved>;
  readonly catalog: ProblemCatalog;
  readonly gates: readonly Gate[];
}

/* ------------------------------------------------------------------- crud --- */

/**
 * ⚠️ A GENERATED OPERATION DECLARES ITSELF EXACTLY LIKE A WRITTEN ONE, so
 * everything downstream — the gate, the audit, the tool catalogue, the OpenAPI
 * entry — reads one shape. The moment generated operations carried less, every
 * one of those would need a branch, and a branch is where a concern goes missing.
 */
/**
 * ⚠️ A SUBJECT-SCOPED COLLECTION IS THE CALLER'S OWN RECORDS, AND THAT IS THE
 * WHOLE ANSWER. The generated verbs filter by whoever is asking, so a person's
 * own logbook is theirs by construction rather than by a handler remembering to
 * add a `WHERE`. Seeing SOMEBODY ELSE'S is a different question with a different
 * permission, and it is an operation the app declares — which is right: the
 * platform can say "yours", but only a product knows who else may look.
 */
const scopeOf = (spec: CollectionSpec, ctx: Ctx): string =>
  eraseBy(spec)?.of === "subject" ? (ctx.accountId ?? "") : ctx.tenantId;

function crudFor(spec: CollectionSpec, verb: CrudVerb): Resolved {
  const id = `${spec.id}.${verb}`;
  const kind = verb === "list" || verb === "read" ? "read" as const : "write" as const;

  const operation: AnyOperation = {
    id,
    kind,
    summary: verbSummary(spec, verb),
    input: verb === "create" || verb === "update" ? spec.fields : {},
    output: {},
    permission: permissionFor(spec, verb),
    idempotency: { mode: "none" },
    /* ⚠️ Only a create counts against a ceiling. An update of an existing record
       does not consume another one, and charging for it would make editing a
       note cost the same as making one. */
    ...(verb === "create" && spec.quota ? { quota: spec.quota } : {}),
    ...(kind === "write" ? { emits: [eventFor(spec, verb)] } : {}),
    async handler() { return {} as never; },
  } as AnyOperation;

  const run = async (ctx: Ctx, input: Record<string, unknown>): Promise<unknown> => {
    const scope = scopeOf(spec, ctx);
    switch (verb) {
      case "list": return { items: await list(ctx.db, spec, scope) };
      case "read": {
        const row = await readOne(ctx.db, spec, scope, String(input.id ?? ""));
        if (!row) ctx.fail("platform.not_found");
        return row;
      }
      case "create": {
        const done = await put(ctx.db, spec, scope, input, ctx.accountId, ctx.now);
        if ("why" in done) ctx.fail("platform.invalid", { detail: done.detail ?? "" });
        return done;
      }
      case "update": {
        /* ⚠️ ONE STATEMENT, SCOPED IN ITS OWN `WHERE` — see `patch`. A read to
           check ownership followed by a write leaves a window between them, and
           this operation used to be the read WITHOUT the write: it answered 200
           with the id and changed nothing. */
        const done = await patch(ctx.db, spec, scope, String(input.id ?? ""),
          input, ctx.accountId, ctx.now);
        if ("why" in done) {
          if (done.why === "not_found") return ctx.fail("platform.not_found");
          return ctx.fail("platform.invalid", { detail: done.detail ?? "" });
        }
        return done;
      }
      case "delete": {
        /* ⚠️ Read first, in the caller's own scope: a delete that trusted the id
           alone would remove somebody else's record on a guessed id. */
        const row = await readOne(ctx.db, spec, scope, String(input.id ?? ""));
        if (!row) ctx.fail("platform.not_found");
        await ctx.db.prepare(
          `DELETE FROM ${tableFor(spec)} WHERE id = ? AND ${eraseBy(spec)?.column ?? "id"} = ?`)
          .bind(String(input.id), scope).run();
        return { id: String(input.id) };
      }
    }
  };

  return { id, kind, ...routeFor(operation), permission: operation.permission, spec: operation, run };
}

const verbSummary = (spec: CollectionSpec, verb: CrudVerb): string => {
  const one = spec.label.one.toLowerCase();
  const many = spec.label.many.toLowerCase();
  switch (verb) {
    case "list": return `Every ${one} here.`;
    case "read": return `One ${one}.`;
    case "create": return `Add a ${one}.`;
    case "update": return `Change a ${one}.`;
    case "delete": return `Remove a ${one} from ${many}.`;
  }
};

/* --------------------------------------------------------------- composing --- */

const MEMO = new Map<string, Composed>();

/**
 * ⚠️ MEMOISED BY APP ID AND NOT BY MANIFEST, because a manifest is a constant.
 * If that ever stops being true — a per-tenant surface, a live-edited app — the
 * key is where it changes, and it is one line rather than a rewrite.
 */
export function compose(app: AppSpec): Composed {
  const seen = MEMO.get(app.id);
  if (seen) return seen;

  const byId = new Map<string, Resolved>();
  for (const spec of app.collections) {
    for (const opId of operationsFor(spec)) {
      const verb = opId.slice(spec.id.length + 1) as CrudVerb;
      byId.set(opId, crudFor(spec, verb));
    }
  }
  /* ⚠️ THE ROSTER IS THE PLATFORM'S AND EVERY APP HAS IT (see `member-ops.ts`).
     Added before the app's own, so an app cannot shadow "invite a colleague"
     with something that skips the two doors bounding it. The package rail
     (D16) rides the same rule: what a purchase grants is not an app's to
     redeclare. */
  for (const [id, resolved] of Object.entries(memberOps(app))) byId.set(id, resolved);
  for (const [id, resolved] of Object.entries(packageOps(app))) byId.set(id, resolved);
  for (const [id, resolved] of Object.entries(settingOps(app))) byId.set(id, resolved);
  for (const [id, resolved] of Object.entries(moneyOps(app))) byId.set(id, resolved);
  for (const [id, resolved] of Object.entries(centreOps(app))) byId.set(id, resolved);

  for (const spec of app.operations) {
    byId.set(spec.id, {
      id: spec.id,
      kind: spec.kind,
      ...routeFor(spec),
      permission: spec.permission,
      spec,
      run: (ctx, input) => spec.handler(ctx, input as never) as Promise<unknown>,
    });
  }

  const composed: Composed = {
    app,
    byId,
    catalog: { ...PLATFORM_PROBLEMS, ...(app.problems ?? {}) },
    gates: [],
  };
  MEMO.set(app.id, composed);
  return composed;
}

/** ⚠️ For a suite that composes the same id twice with different declarations. */
export const forget = (appId?: string): void => {
  if (appId) MEMO.delete(appId); else MEMO.clear();
};

/**
 * ⚠️ EVERY ROUTE THE DEPLOYMENT ANSWERS, derived. This is what the OpenAPI
 * document, the typed client and the tool catalogue are all written from — one
 * source, so a route that exists and is undocumented is not a state that can be
 * reached.
 */
export const surfaceOfComposed = (composed: Composed): readonly Resolved[] =>
  [...composed.byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
