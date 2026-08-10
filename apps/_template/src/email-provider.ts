/**
 * THE PER-TENANT EMAIL LANE, metered.
 *
 * `@4dl/email` owns the provider decision (platform sender | off). What it
 * takes as a PARAMETER is the meter: on the platform
 * lane a send costs the tenant credits, and the credit authority is this app's
 * `TenantBillingDO`.
 *
 * **Delete `creditMeter` and pass nothing** if the app does not resell sending.
 * Every send is then free, which is the truth for an internal tool. Nothing in
 * the platform may require a payment provider — the same reason `@4dl/storage`
 * takes its quota resolver rather than importing billing.
 *
 * The meter is a parameter rather than module state because it needs
 * per-request bindings; a lazily-armed global would make "did anyone remember?"
 * the difference between a metered send and a free one.
 */

import {
  sendTenantEmail as sendTenantEmailMetered,
  type EmailMeter,
  type EmailMsg,
  type EmailSendResult,
} from "@4dl/email";
import type { Env } from "./env.js";

export * from "@4dl/email";
// The brand + sender, bound at module load.
import "./mailer.js";

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

export function sendTenantEmail(env: Env, tenantId: string, msg: EmailMsg): Promise<EmailSendResult> {
  return sendTenantEmailMetered(env, tenantId, msg, creditMeter(env));
}
