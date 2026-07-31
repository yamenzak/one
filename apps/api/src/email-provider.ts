/**
 * Kova's binding of `@4dl/email`'s per-tenant provider (SPEC §3 notifications).
 *
 * The provider logic — platform lane vs a tenant's own Brevo key vs `off`, the
 * redaction of the stored key, the sender-name resolution — is the platform's.
 * What is Kova's is the METER: on the platform lane a send costs the tenant
 * credits, and the credit authority is `TenantBillingDO`.
 *
 * `@4dl/email` takes that as two injected functions rather than importing
 * `@4dl/billing`, for the same reason `@4dl/storage` takes its quota resolver:
 * an app that mails its users but does not resell the sender passes no meter and
 * every send is free. Nothing in the platform may require a payment provider.
 */

import { sendTenantEmail as sendTenantEmailMetered, type EmailMeter, type EmailMsg, type EmailSendResult } from "@4dl/email";
import type { Env } from "./env.js";

export * from "@4dl/email";
// The Kova-branded platform sender + brand kit, bound at module load. Imported
// for the side effect: metering a send that goes out unbranded is half a job.
import "./mailer.js";

/** The credit ledger as the platform-lane meter. The same single-threaded
 *  authority `@4dl/ai` reserves against, so a send and a generation contend. */
const creditMeter = (env: Env): EmailMeter => ({
  charge: async (tenantId, credits) => {
    const dobj = env.BILLING.get(env.BILLING.idFromName(tenantId));
    await dobj.bind(tenantId);
    return (await dobj.charge(credits, "email.send", tenantId)).ok;
  },
  refund: async (tenantId, credits) => {
    const dobj = env.BILLING.get(env.BILLING.idFromName(tenantId));
    await dobj.topUp(credits, "email.refund", tenantId);
  },
});

/** Send through the tenant's provider, metered against its credits. Shadows the
 *  package's export of the same name for every importer of this module, so the
 *  ~6 call sites keep their import and cannot accidentally send unmetered. */
export function sendTenantEmail(env: Env, tenantId: string, msg: EmailMsg): Promise<EmailSendResult> {
  return sendTenantEmailMetered(env, tenantId, msg, creditMeter(env));
}
