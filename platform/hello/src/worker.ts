/**
 * THE WORKER — and how little of it there is, is the point.
 *
 * ⚠️ NOTHING HERE ROUTES, GATES, RESOLVES A TENANT, PICKS A REGION, CREATES A
 * WORKSPACE OR APPLIES A SCHEMA. All of it is derived from the manifest. What
 * remains is the two things a framework genuinely cannot decide for an app: who
 * a caller is, and what the app's own tables hold.
 */

import { deriveSchema, gateFor, type Actor, type Caller, type Resolved, type UserId } from "@one/kernel";
import { applySchema, createRuntime, DIRECTORY_SCHEMA, DOMAIN_SCHEMA, type RawEnv } from "@one/runtime";
import { hello, notes } from "./manifest.js";

/* ---------------------------------------------------------------- schema --- */

/**
 * ⚠️ THE TABLES ARE DERIVED FROM THE COLLECTIONS, so the DDL, the indexes, the
 * erasure cascade and the relocation plan cannot disagree with one another —
 * they are one declaration read four ways.
 */
const derived = deriveSchema("hello", [notes]);
if (derived.problems.length) throw new Error(`hello: ${derived.problems.map((p) => p.detail).join("; ")}`);

const DIRECTORY_MODULES = [DIRECTORY_SCHEMA, DOMAIN_SCHEMA];
const APP_MODULES = [derived.module];

/* -------------------------------------------------------------- identity --- */

/*
  DEFER(one-011) stage:1 — the real session read. Identity is the half of stage 1
  that is not written, so this reads the caller from headers — which is why
  `hello` binds no route, is absent from apps.json, and cannot be deployed.
*/
async function resolveCaller(request: Request, at: Resolved): Promise<{ actor: Actor; caller: Caller }> {
  const set = (h: string) => new Set((request.headers.get(h) ?? "").split(",").filter(Boolean));
  return {
    actor: {
      userId: (request.headers.get("x-one-user") ?? null) as UserId | null,
      tenantId: at.tenant?.tenantId ?? null,
      kind: "user",
    },
    caller: {
      permissions: set("x-one-permissions"),
      entitlements: set("x-one-entitlements"),
      /*
        ⚠️ THE GATE COMES FROM THE TENANT'S STANDING, NEVER FROM THE CALLER. A
        session cannot carry its own permission to write to a suspended
        workspace, because the gate is not read from anything the caller sends.
      */
      gate: gateFor(at.tenant?.standing ?? { standing: "active", reason: "ok" }),
    },
  };
}

/* --------------------------------------------------------------- runtime --- */

const runtime = createRuntime(hello, {
  directoryBinding: "DIRECTORY",
  resolveCaller,
  /*
    ⚠️ THE DIRECTORY AND THE REGIONAL DATABASE ARE COMPOSED SEPARATELY, because
    they are different stores with different residency: one is global and holds
    routing, the others are per region and hold everything else. Applying the
    app's modules to the directory would put a tenant's tables in the one store
    residency does not govern.
  */
  onBoot: {
    global: (directory) => applySchema(directory, DIRECTORY_MODULES).then(() => undefined),
    region: (bind) => applySchema(bind.db, APP_MODULES).then(() => undefined),
  },
});

export default {
  fetch: (request: Request, env: RawEnv): Promise<Response> => runtime.fetch(request, env),
};
