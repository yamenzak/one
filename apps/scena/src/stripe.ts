/**
 * Stripe integration (BLUEPRINT §25) — subscriptions + one-time credit packs.
 *
 * Everything is driven by admin-editable DB config (`app_config`): the secret
 * key, publishable key, webhook secret, and mode all live in the database and
 * are set from the Admin UI, not hardcoded env. The catalog (plans + packs)
 * syncs *from D1 into Stripe* (creating products/prices on demand and storing
 * their ids back). Checkout sessions and verified webhooks close the loop.
 *
 * Implemented with raw `fetch` against api.stripe.com (form-encoded) + Web
 * Crypto for webhook signature verification — no SDK, Workers-native.
 */

import type { ConfigSource } from "@4dl/core";
import { hasPaymentMethod, reverseChargedCredits } from "@4dl/billing";
import type { Env } from "./env.js";
import { DEMO_TENANT } from "./db.js";
import {
  getConfig,
  listPlans,
  listPacks,
  getPlan,
  getPack,
  setPlanStripe,
  setPackStripe,
  getSubscription,
  updateSubscription,
  type PlanRow,
} from "./billing-store.js";
import { grantForTenant } from "./billing-service.js";
import { notifyRole } from "./notify.js";

/**
 * ⚠️ THIS IS LIVE DATA, not a naming choice.
 *
 * `metadata[scena_tenant]` is stamped on every Stripe customer, subscription,
 * price and checkout session Scena has ever created, and the webhook reads it
 * back to decide whose workspace an event is about. Changing it orphans
 * everything already sold — and on a shared Stripe account it also un-attributes
 * the events, so they park instead of applying. The literals below (`scena_pack`,
 * `scena_plan`, `scena_credits`) share the prefix and are the same promise.
 */
export const SCENA_METADATA_PREFIX = "scena";

export interface StripeCfg {
  mode: string; // disabled | test | live
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
}

/**
 * ONE STRIPE ACCOUNT, MANY APPS.
 *
 * `src` is a `ConfigSource` so this reads the shared store: the account keys and
 * the mode are the platform's, and only `stripe.webhook_secret` is per-endpoint
 * (hence per-app) — which is exactly how `SHARED_CONFIG_KEYS` is drawn.
 *
 * Stage 4 moves this onto `@4dl/billing-rail`, which adds event→app attribution
 * so a webhook for Kova cannot be answered by Scena. Until then the shared keys
 * are the useful half.
 */
export async function stripeCfg(src: ConfigSource): Promise<StripeCfg> {
  const cfg = await getConfig(src);
  return {
    mode: cfg["stripe.mode"] ?? "disabled",
    secretKey: cfg["stripe.secret_key"] ?? "",
    publishableKey: cfg["stripe.publishable_key"] ?? "",
    webhookSecret: cfg["stripe.webhook_secret"] ?? "",
  };
}

export function stripeEnabled(cfg: StripeCfg): boolean {
  return cfg.mode !== "disabled" && cfg.secretKey.startsWith("sk_");
}

/** Form-encode nested params the way Stripe expects (a[b][c]=v). */
function encode(params: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") parts.push(encode(v as Record<string, unknown>, key));
    else parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return parts.filter(Boolean).join("&");
}

async function stripeApi<T = unknown>(cfg: StripeCfg, path: string, method: "GET" | "POST", params?: Record<string, unknown>): Promise<T> {
  const url = `https://api.stripe.com/v1/${path}`;
  const init: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${cfg.secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
  };
  if (method === "POST" && params) init.body = encode(params);
  const res = await fetch(method === "GET" && params ? `${url}?${encode(params)}` : url, init);
  const json = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`stripe ${path}: ${json.error?.message ?? res.status}`);
  return json;
}

/* ----------------------------- catalog sync ------------------------------ */

export interface SyncSummary {
  plans: { id: string; productId: string; priceId: string }[];
  packs: { id: string; productId: string; priceId: string }[];
}

/**
 * Push the D1 catalog into Stripe: create a product + recurring price per paid
 * plan and a product + one-time price per credit pack, storing their ids back
 * in D1. Idempotent — skips anything that already has a `stripe_price_id`.
 */
export async function syncCatalog(env: Env): Promise<SyncSummary> {
  const cfg = await stripeCfg(env);
  if (!stripeEnabled(cfg)) throw new Error("stripe not configured");
  const out: SyncSummary = { plans: [], packs: [] };

  for (const p of await listPlans(env.DB)) {
    if (p.price_cents <= 0 || p.active !== 1) continue;
    if (p.stripe_price_id) {
      out.plans.push({ id: p.id, productId: p.stripe_product_id ?? "", priceId: p.stripe_price_id });
      continue;
    }
    const product = await stripeApi<{ id: string }>(cfg, "products", "POST", { name: `Scena ${p.name}`, metadata: { scena_plan: p.id } });
    const price = await stripeApi<{ id: string }>(cfg, "prices", "POST", {
      product: product.id,
      currency: p.currency || "usd",
      unit_amount: p.price_cents,
      recurring: { interval: p.interval || "month" },
      metadata: { scena_plan: p.id },
    });
    await setPlanStripe(env.DB, p.id, product.id, price.id);
    out.plans.push({ id: p.id, productId: product.id, priceId: price.id });
  }

  for (const pk of await listPacks(env.DB)) {
    if (pk.stripe_price_id) {
      out.packs.push({ id: pk.id, productId: pk.stripe_product_id ?? "", priceId: pk.stripe_price_id });
      continue;
    }
    const product = await stripeApi<{ id: string }>(cfg, "products", "POST", { name: `Scena ${pk.name}`, metadata: { scena_pack: pk.id } });
    const price = await stripeApi<{ id: string }>(cfg, "prices", "POST", {
      product: product.id,
      currency: pk.currency || "usd",
      unit_amount: pk.price_cents,
      metadata: { scena_pack: pk.id },
    });
    await setPackStripe(env.DB, pk.id, product.id, price.id);
    out.packs.push({ id: pk.id, productId: product.id, priceId: price.id });
  }
  return out;
}

/* ------------------------------- checkout -------------------------------- */

/** Ensure the tenant has a Stripe customer id; create one lazily. */
async function ensureCustomer(env: Env, cfg: StripeCfg, tenantId: string): Promise<string> {
  const sub = await getSubscription(env.DB, tenantId);
  if (sub.stripe_customer_id) return sub.stripe_customer_id;
  const email = env.OPERATOR_EMAIL || undefined;
  const cust = await stripeApi<{ id: string }>(cfg, "customers", "POST", { email, metadata: { scena_tenant: tenantId } });
  await updateSubscription(env.DB, tenantId, { stripe_customer_id: cust.id });
  return cust.id;
}

/**
 * A Checkout session for a plan.
 *
 * ⚠️ `trialDays` IS THE THING THAT REPLACED THE FREE TIER, so it has to reach
 * Stripe. Scena's plans carry `entitlements.trialDays` and the onboarding wizard
 * says "30 days free" on the button — but this function never sent
 * `trial_period_days`, so the very first invoice was charged immediately and the
 * promise on screen was false. It is a PARAMETER rather than a read of the plan
 * blob because the same helper serves a mid-life plan CHANGE, where a second
 * trial would be a free month for anyone who cancels and re-subscribes: the
 * caller decides, and only onboarding passes it.
 *
 * Stripe requires a payment method for a trialling subscription by default, so
 * the card is still collected up front — nothing is charged until the trial ends,
 * which is exactly what the copy claims.
 */
export async function subscriptionCheckout(
  env: Env,
  planId: string,
  urls: { success: string; cancel: string },
  tenantId = DEMO_TENANT,
  trialDays = 0,
): Promise<{ url: string }> {
  const cfg = await stripeCfg(env);
  if (!stripeEnabled(cfg)) throw new Error("stripe not configured");
  const plan = await getPlan(env.DB, planId);
  if (!plan?.stripe_price_id) throw new Error("plan not synced to stripe");
  const customer = await ensureCustomer(env, cfg, tenantId);
  const subscriptionData: Record<string, unknown> = { metadata: { scena_tenant: tenantId, scena_plan: planId } };
  if (trialDays > 0) subscriptionData.trial_period_days = Math.floor(trialDays);
  const session = await stripeApi<{ url: string }>(cfg, "checkout/sessions", "POST", {
    mode: "subscription",
    customer,
    success_url: urls.success,
    cancel_url: urls.cancel,
    line_items: { 0: { price: plan.stripe_price_id, quantity: 1 } },
    metadata: { scena_tenant: tenantId, scena_plan: planId },
    subscription_data: subscriptionData,
  });
  return { url: session.url };
}

export async function packCheckout(env: Env, packId: string, urls: { success: string; cancel: string }, tenantId = DEMO_TENANT): Promise<{ url: string }> {
  const cfg = await stripeCfg(env);
  if (!stripeEnabled(cfg)) throw new Error("stripe not configured");
  const pack = await getPack(env.DB, packId);
  if (!pack?.stripe_price_id) throw new Error("pack not synced to stripe");
  const customer = await ensureCustomer(env, cfg, tenantId);
  const session = await stripeApi<{ url: string }>(cfg, "checkout/sessions", "POST", {
    mode: "payment",
    customer,
    success_url: urls.success,
    cancel_url: urls.cancel,
    line_items: { 0: { price: pack.stripe_price_id, quantity: 1 } },
    metadata: { scena_tenant: tenantId, scena_pack: packId, scena_credits: pack.credits },
  });
  return { url: session.url };
}

/* ------------------------------- webhooks -------------------------------- */

/** Verify a Stripe webhook signature (t=..,v1=..) with HMAC-SHA256. */
export async function verifySignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  if (!sigHeader || !secret) return false;
  const parts = Object.fromEntries(sigHeader.split(",").map((kv) => kv.split("=")));
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(expected, v1);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface StripeEvent {
  type: string;
  data: { object: Record<string, unknown> };
}

/**
 * Process a verified, ATTRIBUTED webhook event (§25).
 *
 * Called by `@4dl/billing-rail`'s dispatcher, which has already verified the
 * signature, claimed the event id (so a Stripe retry is not applied twice) and
 * decided the event is Scena's. What is left is deciding WHOSE.
 *
 * ⚠️ THIS USED TO FALL BACK TO `DEMO_TENANT`. An event whose metadata did not
 * carry `scena_tenant` — one of Scena's own where it did not survive, or one
 * belonging to another app before the rail existed — was applied to a real
 * workspace: its plan changed, its balance was topped up, its dunning state
 * moved. A guess about whose money this is has no right answer, so there is no
 * fallback now: resolve by metadata, then by Stripe customer id, then give up
 * loudly. Throwing releases the rail's claim on the event id, so Stripe retries
 * — which is what should happen when the answer might arrive with better data.
 */
async function tenantOfEvent(env: Env, obj: Record<string, unknown>): Promise<string> {
  const fromMeta = metaOf(obj)["scena_tenant"];
  if (typeof fromMeta === "string" && fromMeta) return fromMeta;
  const customer = typeof obj["customer"] === "string" ? obj["customer"] : null;
  if (customer) {
    const row = await env.DB
      .prepare("SELECT tenant_id FROM subscriptions WHERE stripe_customer_id = ?")
      .bind(customer)
      .first<{ tenant_id: string }>()
      .catch(() => null);
    if (row?.tenant_id) return row.tenant_id;
  }
  throw new Error(`stripe event carries no resolvable tenant (customer=${customer ?? "none"})`);
}

/**
 * Is this event about the subscription we currently hold for the workspace?
 *
 * A mid-cycle upgrade creates a SECOND Stripe subscription, and the old one
 * keeps emitting `updated` and `deleted` events with its own metadata for a
 * while afterwards. Acting on those moves the live plan's status or drops a
 * paying workspace to `free`. No stored id means nothing to contradict — a
 * fresh subscription is let through so it can be adopted.
 */
async function isCurrentSub(env: Env, tenantId: string, obj: Record<string, unknown>): Promise<boolean> {
  const subId = typeof obj["id"] === "string" ? obj["id"] : null;
  const cur = await getSubscription(env.DB, tenantId);
  return !cur?.stripe_sub_id || !subId || cur.stripe_sub_id === subId;
}

export async function handleWebhook(env: Env, event: StripeEvent): Promise<void> {
  const obj = event.data.object;
  const tenantId = await tenantOfEvent(env, obj);

  switch (event.type) {
    case "checkout.session.completed": {
      const meta = metaOf(obj);
      if (meta["scena_pack"]) {
        // One-time credit pack → top up the credit authority.
        const credits = Number(meta["scena_credits"] ?? 0);
        if (credits > 0) {
          const billing = env.BILLING.get(env.BILLING.idFromName(tenantId));
          await billing.bind(tenantId);
          await billing.topUp(credits, "pack.purchase", String(obj["id"] ?? ""));
          // The BUYER's workspace, not the deployment operator. `notifyAdmin`
          // sends to one address for the whole install, so every studio's
          // receipt went to whoever runs the platform — see billing-service.ts.
          await notifyRole(env, tenantId, "owner", {
            type: "credits_purchased",
            title: `${credits.toLocaleString()} credits added`,
            message: `Your credit pack was applied to this workspace's balance.`,
            dedupeKey: `pack:${String(obj["id"] ?? "")}`,
          }).catch(() => undefined);
        }
      } else if (meta["scena_plan"]) {
        // Subscription created via Checkout — activate immediately (upgrade).
        await updateSubscription(env.DB, tenantId, {
          plan_id: String(meta["scena_plan"]),
          status: "active",
          comp: 0,
          stripe_sub_id: (obj["subscription"] as string) ?? null,
          past_due_at: null,
          suspend_at: null,
          delete_at: null,
        });
        await grantForTenant(env, tenantId);
      }
      break;
    }
    case "invoice.paid": {
      // Recurring renewal: extend the period, clear dunning, apply any queued
      // downgrade, and drop the monthly credit grant.
      const periodEnd = Number((obj["lines"] as { data?: { period?: { end?: number } }[] } | undefined)?.data?.[0]?.period?.end ?? 0) * 1000 || null;
      const sub = await getSubscription(env.DB, tenantId);
      const nextPlan = sub.pending_plan_id ?? sub.plan_id;
      /*
        ⚠️ `unlessLadderOwned` — this wrote `active` unconditionally.

        A late or duplicate `invoice.paid` therefore pulled a workspace back out
        of `suspended` (stalling the ladder, which selects on the previous rung)
        and out of `closing` (undoing a deletion the owner asked for, since
        `scheduleTenantClose` cancels the Stripe subscription and Stripe answers
        with events of its own). Both fail SAFE, so neither reports anything.

        Paying IS the way out of `past_due`, and that is unaffected: `past_due`
        is not on the list. Coming back from `suspended` is an operator action,
        not a webhook's.
      */
      await updateSubscription(
        env.DB,
        tenantId,
        {
          plan_id: nextPlan,
          pending_plan_id: null,
          status: "active",
          current_period_end: periodEnd,
          past_due_at: null,
          suspend_at: null,
          delete_at: null,
        },
        { unlessLadderOwned: true },
      );
      await grantForTenant(env, tenantId);
      break;
    }
    /**
     * MONEY WENT BACK, SO THE CREDITS HAVE TO.
     *
     * Scena sells four credit packs and had no handler for either event, so a
     * refunded pack left its credits spendable — the workspace kept the goods
     * and the money, and nothing reported a problem.
     *
     * The maths is `@4dl/billing`'s: proportional to the refunded share, clamped
     * to the pack, and incremental against the CUMULATIVE `amount_refunded`
     * Stripe re-sends on every partial refund. A dispute carries no customer and
     * empty metadata, so the underlying charge is fetched first — and that
     * lookup THROWS rather than returning empty, which is what makes an
     * unattributable chargeback redelivered rather than quietly dropped.
     */
    case "charge.refunded":
    case "charge.dispute.created": {
      const cfg = await stripeCfg(env);
      const outcome = await reverseChargedCredits(
        {
          db: env.DB,
          secretKey: cfg.secretKey,
          metadataPrefix: SCENA_METADATA_PREFIX,
          authority: async (id) => {
            const billing = env.BILLING.get(env.BILLING.idFromName(id));
            await billing.bind(id);
            return billing;
          },
        },
        event,
      );
      if (!outcome) break;
      // Sent whatever the maths did: a plan-level refund carries no credit count,
      // so there is nothing to reverse and still something an owner must know.
      await notifyRole(env, outcome.tenantId, "owner", {
        type: outcome.disputed ? "payment_disputed" : "payment_refunded",
        message: outcome.disputed
          ? "A payment on this workspace was disputed. Any credits it granted may be reversed — check the balance."
          : "A payment on this workspace was refunded. Credits from a refunded pack have been reversed from the balance.",
        dedupeKey: `${event.type}:${String(obj["id"] ?? "")}`,
      }).catch(() => undefined);
      break;
    }
    case "invoice.payment_failed": {
      // Enter dunning: mark past_due; the lifecycle cron schedules suspend/delete.
      // Guarded for the same reason `invoice.paid` is — a failed invoice on a
      // workspace already suspended must not reset it to the first rung.
      await updateSubscription(env.DB, tenantId, { status: "past_due", past_due_at: Date.now() }, { unlessLadderOwned: true });
      await notifyRole(env, tenantId, "owner", {
        type: "billing_past_due",
        message: "We couldn't process your latest payment. Update your card to keep your screens live — after a grace period the workspace is suspended.",
        // Per dunning ENTRY, not per delivery: Stripe retries a failed invoice
        // several times and each retry fires this event.
        dedupeKey: `past_due:${tenantId}`,
      }).catch(() => undefined);
      break;
    }
    case "customer.subscription.deleted": {
      // Only if the DELETED subscription is the one we hold. A stale sub being
      // cleaned up after an upgrade must not drop a workspace whose new
      // subscription is live and paying.
      if (!(await isCurrentSub(env, tenantId, obj))) break;
      await updateSubscription(env.DB, tenantId, { status: "canceled", plan_id: "free", stripe_sub_id: null }, { unlessLadderOwned: true });
      break;
    }
    case "customer.subscription.updated": {
      if (!(await isCurrentSub(env, tenantId, obj))) break;
      const status = String(obj["status"] ?? "");
      /*
        ⚠️ `trialing` ALONE IS NOT A PAID-FOR PLAN.

        Stripe reports `trialing` for a trial with no card attached — a
        subscription created from the dashboard, or one whose card confirmation
        has not landed yet. Stamping it granted the plan's full entitlements for
        the length of the trial to somebody who had paid nothing and could not
        be charged at the end of it. The same shape, in Kova, handed out a paid
        tier plus its whole monthly credit grant before the guard existed.

        Scena's own Checkout collects a card, so the ordinary path is unchanged:
        `hasPaymentMethod` is true and this reads exactly as it did.
      */
      if (status === "trialing" && !hasPaymentMethod(obj)) break;
      const map: Record<string, string> = { active: "active", past_due: "past_due", canceled: "canceled", unpaid: "past_due", trialing: "trialing" };
      if (map[status]) await updateSubscription(env.DB, tenantId, { status: map[status] }, { unlessLadderOwned: true });
      break;
    }
  }
}

function metaOf(obj: Record<string, unknown>): Record<string, unknown> {
  return (obj["metadata"] as Record<string, unknown>) ?? {};
}

/** Exposed for the admin "test connection" button. */
export async function stripePing(env: Env): Promise<{ ok: boolean; account?: string; error?: string }> {
  const cfg = await stripeCfg(env);
  if (!stripeEnabled(cfg)) return { ok: false, error: "not configured" };
  try {
    const acct = await stripeApi<{ id: string }>(cfg, "account", "GET");
    return { ok: true, account: acct.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "failed" };
  }
}

export type { PlanRow };
