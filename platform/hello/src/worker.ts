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
import { entries, hello, notes, receipts } from "./manifest.js";

/* ---------------------------------------------------------------- schema --- */

/**
 * ⚠️ THE TABLES ARE DERIVED FROM THE COLLECTIONS, so the DDL, the indexes, the
 * erasure cascade and the relocation plan cannot disagree with one another —
 * they are one declaration read four ways.
 */
const derived = deriveSchema("hello", [notes, receipts, entries]);
if (derived.problems.length) throw new Error(`hello: ${derived.problems.map((p) => p.detail).join("; ")}`);

/*
  ⚠️ THE ORDER IN A COMPOSITION IS DEPENDENCY ORDER, DECLARED. `OTP_SCHEMA` says
  `after: ["identity"]`, and the runner validates that rather than trusting the
  array — a wrong order used to produce an ALTER against a table that did not
  exist yet, swallowed, leaving a column that silently never appeared.
*/
const GLOBAL_MODULES = PLATFORM_GLOBAL;
export const REGIONAL_MODULES = [...PLATFORM_REGIONAL, derived.module];


/* -------------------------------------------------------------- identity --- */


/* --------------------------------------------------------------- runtime --- */

/**
 * ⚠️ A CODE THAT IS ONLY EVER LOGGED IS A CODE THAT NEVER ARRIVES, and every app
 * here shipped a Map that did exactly that — which is why nothing this platform
 * sends had ever left a worker. Delivery is the deployment's own mail lane now,
 * chosen from its configuration. A test reads what the `recorded` provider
 * recorded, and that is a provider somebody CHOSE rather than a fallback a
 * worker takes when something is missing.
 */
export { recorded } from "@one/runtime";

const runtime = createRuntime(hello, {
  /*
    ⚠️ EVERY KEY THIS DEPLOYMENT READS, DECLARED. The console shows exactly this
    list and refuses anything outside it, so a typo in a key name is a refusal
    rather than a row nothing consumes.
  */
  config: PLATFORM_CONFIG,
  directoryBinding: "DIRECTORY",
  /*
    ⚠️ DELIBERATELY UNBOUND. `sharedConfigBinding` is what makes one Stripe key
    serve every product; a deployment with a single app has nothing to share
    with, and this is the reference app for exactly that shape. Kova binds it.
    Unbound resolves this app's own values and falls through to nothing.
  */
  identityBinding: "DIRECTORY",
  sessionsBinding: "db",
  objectsBinding: "media",
  /*
    ⚠️ EXPORT AND ERASURE ARE DERIVED FROM THESE. An app that adds a module gets
    both paths covered on the same commit — a hand-written erasure list in a
    shipping product named seven tables against a declaration of twenty-five, and
    the sweep reported success while a deleted workspace kept eighteen.
  */
  regionalModules: REGIONAL_MODULES,
  /*
    ⚠️ NO SECRET, SO THE WEBHOOK REFUSES AND `chargeable` STAYS FALSE. That is
    the honest state of a deployment with no payment provider: a workspace that
    has chosen no plan is not held to setup over our missing configuration, and
    the public endpoint is not an open door. Both follow from one absent value
    rather than from two settings somebody has to keep in step.
  */
  webhookSecretVar: "PROVIDER_WEBHOOK_SECRET",
  /*
    ⚠️ WHO IS IN THIS WORKSPACE IS THE APP'S ANSWER, and `hello` has no roster —
    so everybody who has ever signed in here is its owner. A product with a
    membership table reads it; this is the smallest honest version, and it is
    the ONE thing a framework cannot supply.
  */
  audienceFor: async (_tenantId, db) => {
    /*
      tenant-exempt: a session belongs to an ACCOUNT rather than to a workspace
      and carries no tenant column — see `runtime/test/scope.test.ts`, which
      exempts the same table from the erasure cascade for the same reason.
      unbounded-read: bounded below rather than by the predicate.
    */
    const rows = await db.all<{ account_id: string }>(`SELECT DISTINCT account_id FROM sessions LIMIT 500`);
    return rows.map((r) => ({ userId: r.account_id, role: "owner" }));
  },
  /*
    ⚠️ NO SENDER, SO NOTHING INTERRUPTS ANYBODY — and the inbox row is written
    anyway. That is the shape the whole design turns on: a preference, a missing
    provider and a bounced address all remove the interruption and never the
    record.
  */

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

export { TenantLedgerActor } from "./ledger-actor.js";

export default {
  fetch: (request: Request, env: RawEnv): Promise<Response> => runtime.fetch(request, env),
  /*
    ⚠️ THE SCHEDULED HANDLER IS THE RUNTIME'S, not this app's. A worker that
    writes its own is one where the run record, the isolation between jobs and
    the bound on a sweep are each optional — and every one of them is invisible
    when it is missing.
  */
  scheduled: (_controller: unknown, env: RawEnv): Promise<unknown> => runtime.scheduled(env),
};
