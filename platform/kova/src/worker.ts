/**
 * THE WORKER — and how little of it there is, is the point.
 *
 * ⚠️ NOTHING HERE ROUTES, GATES, RESOLVES A TENANT, PICKS A REGION, CREATES A
 * WORKSPACE OR APPLIES A SCHEMA. All of it is derived from the manifest. What
 * remains is the one thing a framework genuinely cannot decide: who a caller is.
 */

import { deriveSchema, type Actor, type Resolved, type Session } from "@one/kernel";
import {
  ACTIVITY_SCHEMA, applySchema, COMMERCE_SCHEMA, createRuntime, DIRECTORY_SCHEMA,
  DOMAIN_SCHEMA, IDENTITY_SCHEMA, INBOX_SCHEMA, LEDGER_SCHEMA, OTP_SCHEMA,
  GUIDE_SCHEMA, JOB_SCHEMA, MEDIA_SCHEMA, MILESTONE_SCHEMA, PLATFORM_STATE_SCHEMA, PROVIDER_SCHEMA, SESSION_SCHEMA, type RawEnv,
} from "@one/runtime";
import { clients, entries, kova, movements, programmes, sets, workouts } from "./manifest.js";

const derived = deriveSchema("kova", [clients, movements, programmes, workouts, sets, entries]);
if (derived.problems.length) throw new Error(`kova: ${derived.problems.map((p) => p.detail).join("; ")}`);

/* ⚠️ ORDER IS DEPENDENCY ORDER, DECLARED — the runner validates it rather than
   trusting the array, because a wrong order produces an ALTER against a table
   that does not exist yet, swallowed, leaving a column that never appeared. */
const GLOBAL_MODULES = [DIRECTORY_SCHEMA, DOMAIN_SCHEMA, IDENTITY_SCHEMA, OTP_SCHEMA, PROVIDER_SCHEMA, PLATFORM_STATE_SCHEMA, JOB_SCHEMA];
export const REGIONAL_MODULES = [SESSION_SCHEMA, ACTIVITY_SCHEMA, LEDGER_SCHEMA, COMMERCE_SCHEMA, INBOX_SCHEMA, MEDIA_SCHEMA, GUIDE_SCHEMA, MILESTONE_SCHEMA, derived.module];

/**
 * ⚠️ IDENTITY IS THE PLATFORM'S; AUTHORIZATION IS THE APP'S. What it returns is
 * permissions and nothing else — what a workspace bought and where it stands are
 * resolved from the subscription, so an app cannot answer them generously by
 * accident.
 */
async function resolveCaller(session: Session | null, at: Resolved): Promise<{
  actor: Actor;
  permissions: ReadonlySet<string>;
}> {
  return {
    actor: {
      userId: session?.accountId ?? null,
      tenantId: at.tenant?.tenantId ?? null,
      kind: session ? "user" : "system",
    },
    /* A real app reads a membership row here. */
    permissions: new Set<string>(session ? kova.access.roles.owner : []),
  };
}

/** ⚠️ A code that is only ever logged is a code that never arrives. */
export const delivered = new Map<string, string>();

const runtime = createRuntime(kova, {
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
  resolveCaller,
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
