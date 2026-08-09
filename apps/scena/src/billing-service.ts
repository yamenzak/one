/**
 * Billing orchestration (BLUEPRINT §25) — ties the D1 catalog to the
 * TenantBillingDO credit authority and runs the payment lifecycle.
 *
 *  - grantForTenant: drop the plan's recurring monthly credit grant (idempotent
 *    per period), driven by the invoice.paid webhook or the monthly cron.
 *  - lifecycleSweep: the dunning state machine — active → past_due (grace) →
 *    suspended (playout gated) → auto-deleted after a configurable window.
 *    Comped/promo/gift plans are exempt.
 *  - identity: resolve the caller's email (Cloudflare Access header, or the
 *    dev OPERATOR_EMAIL) and the admin allowlist for the Admin UI gate.
 */

import type { Env } from "./env.js";
import { DEMO_TENANT } from "./db.js";
import { getSubscription, updateSubscription, getPlan, listSubscriptions, tenantEntitlements } from "./billing-store.js";
import { resolveEntitlements } from "./entitlements.js";
import { emailShell, sendEmail } from "./mailer.js";
import { notifyRole } from "./notify.js";
import { purgeTenant } from "./purge.js";

/** Stable "YYYY-MM" key so a grant applies at most once per calendar month. */
export function periodKey(now: number): string {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Drop the plan's monthly credit grant into the tenant's balance (idempotent). */
export async function grantForTenant(env: Env, tenantId = DEMO_TENANT, now = Date.now()): Promise<number> {
  const sub = await getSubscription(env.DB, tenantId);
  const plan = await getPlan(env.DB, sub.plan_id);
  const grant = resolveEntitlements(plan?.entitlements_json).aiCredits.monthlyGrant;
  if (grant <= 0) return 0;
  const billing = env.BILLING.get(env.BILLING.idFromName(tenantId));
  await billing.bind(tenantId);
  await billing.grantMonthly(grant, periodKey(now));
  return grant;
}

/** Drop the monthly credit grant to EVERY tenant, not just the demo one. Comped
 *  and free plans have no Stripe invoice to trigger a grant, so the cron is their
 *  only source; grantMonthly is period-keyed, so re-running daily is idempotent. */
export async function grantAll(env: Env, now = Date.now()): Promise<number> {
  const subs = await listSubscriptions(env.DB);
  let granted = 0;
  for (const sub of subs) {
    granted += await grantForTenant(env, sub.tenant_id, now).catch(() => 0);
  }
  return granted;
}

export interface LifecycleAction {
  tenantId: string;
  from: string;
  to: string;
}

/**
 * Advance the dunning state machine for every subscription (§25). Called from
 * the cron. Returns the transitions applied.
 *
 *   past_due  + grace_days elapsed → suspended (+ schedule deletion)
 *   suspended + delete_days elapsed → deleted (tenant data wiped)
 *
 * Comped subscriptions (promo/gift/demo) never enter dunning.
 */
export async function lifecycleSweep(env: Env, now = Date.now()): Promise<LifecycleAction[]> {
  const cfg = await import("./billing-store.js").then((m) => m.getConfig(env));
  const graceMs = days(cfg["billing.grace_days"]) ;
  const deleteMs = days(cfg["billing.delete_days"]);
  const actions: LifecycleAction[] = [];

  for (const sub of await listSubscriptions(env.DB)) {
    if (sub.comp === 1) continue; // gifted/demo accounts are exempt

    if (sub.status === "past_due" && sub.past_due_at) {
      const suspendAt = at(sub.suspend_at) ?? at(sub.past_due_at)! + graceMs;
      if (sub.suspend_at == null) await updateSubscription(env.DB, sub.tenant_id, { suspend_at: iso(suspendAt) });
      if (now >= suspendAt) {
        await updateSubscription(env.DB, sub.tenant_id, { status: "suspended", delete_at: iso(now + deleteMs) });
        actions.push({ tenantId: sub.tenant_id, from: "past_due", to: "suspended" });
        /*
          THE WORKSPACE'S OWNER, not the deployment's operator.

          `notifyAdmin` sends to `email.admin` or `OPERATOR_EMAIL` — one address
          for the whole deployment — so every workspace's suspension warning went
          to the platform operator and to nobody who could act on it. `notifyRole`
          resolves the actual owners of THIS workspace, writes their inbox rows and
          emails whoever has not muted the category.
        */
        await notifyRole(env, sub.tenant_id, "owner", {
          type: "billing_suspended",
          message: `Your screens are showing a holding card until payment is settled. Data is scheduled for deletion in ${Math.round(deleteMs / 86_400_000)} days.`,
          dedupeKey: `suspended:${sub.tenant_id}`,
        }).catch(() => undefined);
      }
    } else if ((sub.status === "suspended" || sub.status === "closing") && sub.delete_at && now >= at(sub.delete_at)!) {
      /*
        ⚠️ TWO WAYS TO REACH THIS RUNG, and they are not the same journey.

        `suspended` is where the dunning ladder puts a workspace whose invoice
        went unpaid — Scena's decision, escapable by paying. `closing` is where
        the OWNER put it, deliberately, from Settings — our decision to respect,
        escapable by cancelling inside the window and not by paying. Both end
        here, at the same erasure, and the `from` in the action record is what
        keeps them distinguishable in the operator's log.

        Sharing this branch is the point: a second purge path is a second place
        for the cascade, the R2 release and the DO wipe to drift apart, and this
        one has already had that bug.
      */
      /*
        ⚠️ THE RECIPIENTS ARE READ BEFORE THE PURGE, and this is the one notice
        that CANNOT go to an inbox.

        The cascade clears `member` and `notifications` along with everything
        else, so after it runs there is no membership left to resolve an owner
        from and no inbox left to write a row into. Reading the addresses first
        is what makes the last message deliverable at all — and it is a
        deliberate exception to "notify, don't email", not an oversight.
      */
      const owners = await ownerEmails(env.DB, sub.tenant_id);
      await deleteTenantData(env, sub.tenant_id);
      await updateSubscription(env.DB, sub.tenant_id, { status: "canceled", plan_id: "free", delete_at: null, suspend_at: null, past_due_at: null });
      actions.push({ tenantId: sub.tenant_id, from: sub.status, to: "deleted" });
      const closed = sub.status === "closing";
      for (const to of owners) {
        await sendEmail(env, {
          to,
          subject: "Your Scena workspace data has been deleted",
          // "Your billing history is retained" was here, and it stopped being
          // true the moment the purge started deriving its table list:
          // `subscriptions` and `credit_ledger` are both in
          // `scoped.tenantTables`, so the declaration and the old hand-written
          // list had disagreed about this all along. The declaration is what
          // the erasure story is written against, so it wins — and the notice
          // now says what actually happened.
          //
          // The last message has to say which of the two things happened. "After
          // the suspension window elapsed" sent to somebody who closed their own
          // workspace on purpose reads as an accusation about an invoice they
          // never owed.
          html: emailShell(
            "Workspace data removed",
            closed
              ? "<p>You asked us to close your workspace, and the seven-day window has now elapsed. Your screens, channels, content, media and account records were deleted. Nothing was retained.</p>"
              : "<p>After the suspension window elapsed, your screens, channels, content, media and account records were deleted. Nothing was retained.</p>",
          ),
          text: closed
            ? "You asked us to close your Scena workspace, and the seven-day window has now elapsed. Your screens, channels, content, media and account records were deleted. Nothing was retained."
            : "After the suspension window elapsed, your Scena screens, channels, content, media and account records were deleted. Nothing was retained.",
        }).catch(() => undefined);
      }
    }
  }
  return actions;
}

/**
 * The addresses of a workspace's owners.
 *
 * Read from `member` ⋈ `user`, which is the only place the answer lives — and
 * the reason the deletion notice has to collect them BEFORE the cascade runs.
 */
async function ownerEmails(db: D1Database, tenantId: string): Promise<string[]> {
  const rows = await db
    .prepare('SELECT u.email AS email FROM "member" m JOIN "user" u ON u.id = m.userId WHERE m.organizationId = ? AND m.role = ?')
    .bind(tenantId, "owner")
    .all<{ email: string | null }>()
    .catch(() => null);
  return (rows?.results ?? []).map((r) => r.email).filter((e): e is string => Boolean(e));
}

function days(v: string | undefined): number {
  const n = Number(v);
  return (Number.isFinite(n) ? n : 7) * 24 * 3600 * 1000;
}

/**
 * THE LADDER'S TIMESTAMPS ARE ISO-8601 TEXT, and these two are the only place
 * the arithmetic meets them.
 *
 * They were epoch milliseconds until `BILLING_SCHEMA` was adopted, and this is
 * exactly the code the change would have broken in silence: SQLite types are
 * per-value, so a millisecond integer sits happily in a TEXT-declared column,
 * `sub.past_due_at + graceMs` becomes string CONCATENATION, and `now >=
 * "1754…604800000"` compares a number against a string. Nothing throws. A
 * workspace is either never suspended or suspended the moment it goes past due,
 * and the only symptom is a support ticket a month later.
 *
 * `billing-reconcile.ts` converts the stored values; these convert at the edge.
 */
const at = (s: string | null | undefined): number | null => (s ? Date.parse(s) : null);
const iso = (ms: number): string => new Date(ms).toISOString();

/** Is the tenant's playout gated (suspended for non-payment)? */
export async function isSuspended(db: D1Database, tenantId = DEMO_TENANT): Promise<boolean> {
  const sub = await getSubscription(db, tenantId);
  return sub.status === "suspended";
}

/**
 * Auto-deletion (§25). Destructive and irreversible.
 *
 * ⚠️ THE TABLE LIST IS NO LONGER WRITTEN HERE, and that is the whole change.
 * This function used to name seven tables plus three parent-keyed joins, while
 * `SCENA_SCHEMA.scoped` declared twenty-five — so a deleted workspace kept its
 * media library, playlists, widget profiles, ads, tracks, manifest history,
 * weather sources, board users and AI history, while the sweep reported success
 * and emailed the owner to say their content had been removed. `purgeTenant`
 * derives the list from the same declaration `@4dl/purge`'s conformance test
 * checks, so a table added to the schema is swept without anyone remembering.
 *
 * Kept as a named re-export because three call sites and a dunning ladder read
 * better with the domain verb than with the mechanism.
 */
export async function deleteTenantData(env: Env, tenantId: string): Promise<void> {
  await purgeTenant(env, tenantId);
}

/* ------------------------------- identity -------------------------------- */

/** Resolve the caller's email: Cloudflare Access header, else dev fallback. */
export function callerEmail(env: Env, req: Request): string {
  return req.headers.get("Cf-Access-Authenticated-User-Email") || env.OPERATOR_EMAIL || "";
}

/** Effective entitlements for the tenant (re-export for route convenience). */
export { tenantEntitlements };
