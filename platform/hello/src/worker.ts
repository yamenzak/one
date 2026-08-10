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

import { deriveSchema } from "@one/kernel";
import {
  applySchema, createRuntime, DIRECTORY_SCHEMA, DOMAIN_SCHEMA, IDENTITY_SCHEMA, JOB_SCHEMA,
  OTP_SCHEMA, PLATFORM_REGIONAL, PLATFORM_STATE_SCHEMA, PROVIDER_SCHEMA, type RawEnv,
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
const GLOBAL_MODULES = [DIRECTORY_SCHEMA, DOMAIN_SCHEMA, IDENTITY_SCHEMA, OTP_SCHEMA, PROVIDER_SCHEMA, PLATFORM_STATE_SCHEMA, JOB_SCHEMA];
export const REGIONAL_MODULES = [...PLATFORM_REGIONAL, derived.module];


/* -------------------------------------------------------------- identity --- */


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
  objectsBinding: "media",
  /*
    ⚠️ EXPORT AND ERASURE ARE DERIVED FROM THESE. An app that adds a module gets
    both paths covered on the same commit — a hand-written erasure list in a
    shipping product named seven tables against a declaration of twenty-five, and
    the sweep reported success while a deleted workspace kept eighteen.
  */
  regionalModules: REGIONAL_MODULES,
  deliverCode: async (email, code) => { delivered.set(email, code); },
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
    const rows = await db.all<{ account_id: string }>(`SELECT DISTINCT account_id FROM sessions`);
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
