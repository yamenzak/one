/**
 * THE WORKER — and how little of it there is, is the point.
 *
 * ⚠️ NOTHING HERE ROUTES, GATES, RESOLVES A TENANT, PICKS A REGION, CREATES A
 * WORKSPACE OR APPLIES A SCHEMA. All of it is derived from the manifest. What
 * remains is the two things a framework genuinely cannot decide for an app: who
 * a caller is, and what the app's own tables hold.
 */

import { deriveSchema, gateFor, type Actor, type Caller, type Resolved, type Session } from "@one/kernel";
import {
  applySchema, createRuntime, DIRECTORY_SCHEMA, DOMAIN_SCHEMA, IDENTITY_SCHEMA,
  OTP_SCHEMA, SESSION_SCHEMA, type RawEnv,
} from "@one/runtime";
import { hello, notes } from "./manifest.js";

/* ---------------------------------------------------------------- schema --- */

/**
 * ⚠️ THE TABLES ARE DERIVED FROM THE COLLECTIONS, so the DDL, the indexes, the
 * erasure cascade and the relocation plan cannot disagree with one another —
 * they are one declaration read four ways.
 */
const derived = deriveSchema("hello", [notes]);
if (derived.problems.length) throw new Error(`hello: ${derived.problems.map((p) => p.detail).join("; ")}`);

/*
  ⚠️ THE ORDER IN A COMPOSITION IS DEPENDENCY ORDER, DECLARED. `OTP_SCHEMA` says
  `after: ["identity"]`, and the runner validates that rather than trusting the
  array — a wrong order used to produce an ALTER against a table that did not
  exist yet, swallowed, leaving a column that silently never appeared.
*/
const GLOBAL_MODULES = [DIRECTORY_SCHEMA, DOMAIN_SCHEMA, IDENTITY_SCHEMA, OTP_SCHEMA];
const REGIONAL_MODULES = [SESSION_SCHEMA, derived.module];

/* -------------------------------------------------------------- identity --- */

/**
 * ⚠️ IDENTITY IS THE PLATFORM'S; AUTHORIZATION IS THE APP'S. The session arrives
 * already validated against the origin it came in on — an app never reads the
 * cookie, so there is one session format and one place it is checked. What
 * remains is the question only this app can answer: what may this person do in
 * THIS workspace.
 *
 * A real app reads a membership row here. `hello` grants the owner role to
 * whoever is signed in, because it has no roster.
 */
async function resolveCaller(session: Session | null, at: Resolved): Promise<{ actor: Actor; caller: Caller }> {
  const permissions = new Set<string>(session ? hello.access.roles.owner : []);
  return {
    actor: {
      userId: session?.accountId ?? null,
      tenantId: at.tenant?.tenantId ?? null,
      kind: session ? "user" : "system",
    },
    caller: {
      permissions,
      entitlements: new Set(Object.keys(hello.access.entitlements)),
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

/**
 * ⚠️ A CODE THAT IS ONLY EVER LOGGED IS A CODE THAT NEVER ARRIVES. Delivery is
 * injected because the platform owns the code and an app owns how it travels —
 * and because a test needs to read one without a mail server. `hello` records
 * the last code; a real app sends mail here and this is the ONE place that
 * differs between them.
 */
export const delivered = new Map<string, string>();

const runtime = createRuntime(hello, {
  directoryBinding: "DIRECTORY",
  identityBinding: "DIRECTORY",
  sessionsBinding: "db",
  deliverCode: async (email, code) => { delivered.set(email, code); },
  resolveCaller,
  /*
    ⚠️ THE DIRECTORY AND THE REGIONAL DATABASE ARE COMPOSED SEPARATELY, because
    they are different stores with different residency: one is global and holds
    routing, the others are per region and hold everything else. Applying the
    app's modules to the directory would put a tenant's tables in the one store
    residency does not govern.
  */
  onBoot: {
    global: (directory) => applySchema(directory, GLOBAL_MODULES).then(() => undefined),
    region: (bind) => applySchema(bind.db, REGIONAL_MODULES).then(() => undefined),
  },
});

export default {
  fetch: (request: Request, env: RawEnv): Promise<Response> => runtime.fetch(request, env),
};
