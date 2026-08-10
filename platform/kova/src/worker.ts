/**
 * THE WORKER — and how little of it there is, is the point.
 *
 * ⚠️ NOTHING HERE ROUTES, GATES, RESOLVES A TENANT, PICKS A REGION, CREATES A
 * WORKSPACE, DECIDES WHAT A CALLER MAY DO, OR APPLIES A SCHEMA. All of it is
 * derived from the manifest.
 *
 * ⚠️ IT USED TO RESOLVE THE CALLER, and what it wrote was `permissions: new
 * Set(roles.owner)` for anybody signed in — a scaffold that typechecks, passes
 * every test, and hands every visitor of every workspace the owner's powers.
 * That is now the membership store's answer, and the shape of this file is the
 * argument for having built it.
 */

import { deriveSchema, PLATFORM_CONFIG } from "@one/kernel";
import {
  applySchema, createRuntime,
  PLATFORM_GLOBAL, PLATFORM_REGIONAL, type RawEnv,
} from "@one/runtime";
import { articles, bookings, checkins, clients, entries, foods, goals, kova, movements, portions, programmes, sets, workouts } from "./manifest.js";

const derived = deriveSchema("kova", [clients, movements, programmes, workouts, sets, foods, portions, entries, checkins, goals, bookings, articles]);
if (derived.problems.length) throw new Error(`kova: ${derived.problems.map((p) => p.detail).join("; ")}`);

/* ⚠️ ORDER IS DEPENDENCY ORDER, DECLARED — the runner validates it rather than
   trusting the array, because a wrong order produces an ALTER against a table
   that does not exist yet, swallowed, leaving a column that never appeared. */
const GLOBAL_MODULES = PLATFORM_GLOBAL;
export const REGIONAL_MODULES = [...PLATFORM_REGIONAL, derived.module];


/** ⚠️ A code that is only ever logged is a code that never arrives. */
export const delivered = new Map<string, string>();

const runtime = createRuntime(kova, {
  /*
    ⚠️ EVERY KEY THIS DEPLOYMENT READS, DECLARED. The console shows exactly this
    list and refuses anything outside it, so a typo in a key name is a refusal
    rather than a row nothing consumes.
  */
  config: PLATFORM_CONFIG,
  directoryBinding: "DIRECTORY",
  identityBinding: "DIRECTORY",
  sessionsBinding: "db",
  objectsBinding: "media",
  /* ⚠️ Export and erasure are derived from these, so a module added later is
     covered by both paths on the same commit. */
  regionalModules: REGIONAL_MODULES,
  /* ⚠️ No secret, so the payment endpoint refuses and `chargeable` stays false —
     which is the honest state of a deployment with no provider. */
  webhookSecretVar: "PROVIDER_WEBHOOK_SECRET",
  deliverCode: async (email, code) => { delivered.set(email, code); },
  /* ⚠️ Who is in this workspace is the app's answer, and the ONE thing a
     framework cannot supply. */
  audienceFor: async (_tenantId, db) => {
    const rows = await db.all<{ account_id: string }>(`SELECT DISTINCT account_id FROM sessions`);
    return rows.map((r) => ({ userId: r.account_id, role: "owner" }));
  },
  onBoot: {
    global: (directory) => applySchema(directory, GLOBAL_MODULES).then(() => undefined),
    region: (bind) => applySchema(bind.db, REGIONAL_MODULES).then(() => undefined),
  },
});

export default {
  fetch: (request: Request, env: RawEnv): Promise<Response> => runtime.fetch(request, env),
  /* ⚠️ The scheduled handler is the RUNTIME's. A worker that writes its own is
     one where the run record, the isolation between jobs and the bound on a
     sweep are each optional — and all three are invisible when missing. */
  scheduled: (_controller: unknown, env: RawEnv): Promise<unknown> => runtime.scheduled(env),
};
