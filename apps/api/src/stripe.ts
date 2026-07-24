/**
 * Stripe (SPEC §7) — SDK-less, raw fetch against api.stripe.com/v1 with Web
 * Crypto webhook verification. Two rails:
 *   • Platform rail (Mossa ↔ tenant): plan subs + credit packs.
 *   • Connect rail (tenant ↔ client): checkout on the connected account with
 *     NO application fee. Onboarding via Connect account links.
 *
 * All config lives in admin-editable app_config (mode/keys), like scena.
 */

import { getConfig, setConfig } from "./billing-store.js";

export interface StripeConfig {
  mode: "disabled" | "test" | "live";
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
  connectWebhookSecret: string;
}

export async function stripeConfig(db: D1Database): Promise<StripeConfig> {
  const cfg = await getConfig(db);
  return {
    mode: (cfg["stripe.mode"] as StripeConfig["mode"]) ?? "disabled",
    secretKey: cfg["stripe.secret_key"] ?? "",
    publishableKey: cfg["stripe.publishable_key"] ?? "",
    webhookSecret: cfg["stripe.webhook_secret"] ?? "",
    connectWebhookSecret: cfg["stripe.connect_webhook_secret"] ?? "",
  };
}

export function stripeEnabled(cfg: StripeConfig): boolean {
  return cfg.mode !== "disabled" && cfg.secretKey.startsWith("sk_");
}

const encodeForm = (obj: Record<string, string | number | undefined>): string => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) p.append(k, String(v));
  return p.toString();
};

/**
 * Pinned Stripe API version. Our webhook handlers + expands read pre-"Basil"
 * field shapes — `invoice.subscription`, `invoice.payment_intent`, and the
 * `latest_invoice.payment_intent` expand on a Subscription — which the Basil
 * series (2025-03-31+, the default for accounts created after that date) moved
 * or removed. Pinning EVERY API call to the last Acacia version keeps those
 * shapes stable regardless of when the Stripe account was created, so inline
 * plan checkout and Connect renewals behave identically everywhere.
 *
 * NOTE: this header pins REQUEST/response shapes. Webhook EVENT payload shapes
 * follow the version configured on the webhook endpoint (or the account
 * default), so the platform + connect webhook endpoints must be created/pinned
 * at this same version in the Stripe dashboard for `invoice.subscription` etc.
 * to arrive in the shape the handlers expect.
 */
export const STRIPE_API_VERSION = "2025-02-24.acacia";

export async function stripeCall<T = unknown>(
  secretKey: string,
  path: string,
  body?: Record<string, string | number | undefined>,
  opts?: { connectedAccount?: string; idempotencyKey?: string; method?: "GET" | "POST" | "DELETE" },
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/x-www-form-urlencoded",
    "Stripe-Version": STRIPE_API_VERSION,
  };
  if (opts?.connectedAccount) headers["Stripe-Account"] = opts.connectedAccount;
  if (opts?.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: opts?.method ?? (body ? "POST" : "GET"),
    headers,
    body: body ? encodeForm(body) : undefined,
  });
  const data = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(data.error?.message ?? `stripe ${path} failed`);
  return data;
}

/** Max age of a webhook signature we'll accept (Stripe's own default tolerance);
 *  rejects replay of an old-but-validly-signed payload. */
const WEBHOOK_TOLERANCE_S = 300;

/** HMAC-SHA256 webhook signature verification (t + v1 scheme). */
export async function verifyWebhook(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  // The signature header is a comma-separated list of `k=v` pairs. During a
  // webhook-secret ROTATION Stripe signs the payload with BOTH the old and the
  // new secret and emits MULTIPLE `v1=` entries — so collect EVERY v1 (not just
  // the last, which `Object.fromEntries` would keep) and accept if ANY matches,
  // or a legitimate webhook is rejected mid-rotation.
  let t: string | undefined;
  const v1s: string[] = [];
  for (const part of sigHeader.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq);
    const v = part.slice(eq + 1);
    if (k === "t") t = v;
    else if (k === "v1") v1s.push(v);
  }
  if (!t || v1s.length === 0) return false;
  // Timestamp tolerance: a captured, validly-signed payload must not be
  // replayable indefinitely (not every handler is idempotent by event id).
  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > WEBHOOK_TOLERANCE_S) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  // Constant-time-ish compare against each provided v1 signature.
  return v1s.some((v1) => {
    if (expected.length !== v1.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
    return diff === 0;
  });
}

/** Lazily ensure a Stripe customer for the tenant; returns its id. */
export async function ensureCustomer(db: D1Database, secretKey: string, tenantId: string, email?: string): Promise<string> {
  const row = await db.prepare("SELECT stripe_customer_id FROM subscriptions WHERE tenant_id = ?").bind(tenantId).first<{ stripe_customer_id: string | null }>();
  if (row?.stripe_customer_id) return row.stripe_customer_id;
  const customer = await stripeCall<{ id: string }>(secretKey, "customers", {
    email,
    "metadata[mossa_tenant]": tenantId,
  });
  await db.prepare("UPDATE subscriptions SET stripe_customer_id = ? WHERE tenant_id = ?").bind(customer.id, tenantId).run();
  return customer.id;
}

/** Push plans + packs to Stripe as products + prices; store the ids back. */
export async function syncCatalog(db: D1Database, secretKey: string): Promise<{ plans: number; packs: number }> {
  const plans = await db.prepare("SELECT id, name, price_usd_month, stripe_price_id FROM plans WHERE active = 1 AND price_usd_month > 0").all<{ id: string; name: string; price_usd_month: number; stripe_price_id: string | null }>();
  let planCount = 0;
  for (const p of plans.results ?? []) {
    if (p.stripe_price_id) continue;
    const product = await stripeCall<{ id: string }>(secretKey, "products", { name: `Mossa ${p.name}`, "metadata[mossa_plan]": p.id });
    const price = await stripeCall<{ id: string }>(secretKey, "prices", {
      product: product.id,
      unit_amount: Math.round(p.price_usd_month * 100),
      currency: "usd",
      "recurring[interval]": "month",
    });
    await db.prepare("UPDATE plans SET stripe_product_id = ?, stripe_price_id = ? WHERE id = ?").bind(product.id, price.id, p.id).run();
    planCount++;
  }
  const packs = await db.prepare("SELECT id, name, price_usd, stripe_price_id FROM credit_packs WHERE active = 1").all<{ id: string; name: string; price_usd: number; stripe_price_id: string | null }>();
  let packCount = 0;
  for (const p of packs.results ?? []) {
    if (p.stripe_price_id) continue;
    const product = await stripeCall<{ id: string }>(secretKey, "products", { name: `Mossa — ${p.name}`, "metadata[mossa_pack]": p.id });
    const price = await stripeCall<{ id: string }>(secretKey, "prices", { product: product.id, unit_amount: Math.round(p.price_usd * 100), currency: "usd" });
    await db.prepare("UPDATE credit_packs SET stripe_product_id = ?, stripe_price_id = ? WHERE id = ?").bind(product.id, price.id, p.id).run();
    packCount++;
  }
  return { plans: planCount, packs: packCount };
}

export { setConfig };
