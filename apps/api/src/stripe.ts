/**
 * Stripe (SPEC §7) — SDK-less, raw fetch against api.stripe.com/v1 with Web
 * Crypto webhook verification. Two rails:
 *   • Platform rail (Kova ↔ tenant): plan subs + credit packs.
 *   • Connect rail (tenant ↔ client): checkout on the connected account with
 *     NO application fee. Onboarding via Connect account links.
 *
 * All config lives in admin-editable app_config (mode/keys), like scena.
 *
 * ── Credential lanes ───────────────────────────────────────────────────────
 * Test mode and live mode are DIFFERENT Stripe objects: different keys, and —
 * the part that bites — different webhook endpoints with different signing
 * secrets. Storing one slot per credential meant switching lanes was a manual
 * re-paste of five values, and a half-swap (live secret key + test webhook
 * secret) makes every webhook fail signature verification: the client pays,
 * nothing is granted, and the product shows no signal.
 *
 * So each credential has a lane-scoped slot, `stripe.<lane>.<name>`, and
 * `stripe.mode` selects the lane that is actually in force. The pre-lane
 * (unscoped) keys — `stripe.secret_key` and friends — are still read as a
 * FALLBACK per credential, so a deployment that has only those keeps working
 * untouched and starts using a lane-scoped value the moment one is written.
 */

import { getConfig, setConfig } from "./billing-store.js";

export type StripeMode = "disabled" | "test" | "live";
export type StripeLane = "test" | "live";
export type StripeCredential = "secretKey" | "publishableKey" | "webhookSecret" | "connectWebhookSecret";

/** Ordered so status output and validation iterate the same four credentials. */
export const STRIPE_CREDENTIALS: readonly StripeCredential[] = ["secretKey", "publishableKey", "webhookSecret", "connectWebhookSecret"];

/** app_config name per credential: lane-scoped is `stripe.<lane>.<suffix>`,
 *  legacy (pre-lane, still honoured as a fallback) is `stripe.<suffix>`. */
const CREDENTIAL_SUFFIX: Record<StripeCredential, string> = {
  secretKey: "secret_key",
  publishableKey: "publishable_key",
  webhookSecret: "webhook_secret",
  connectWebhookSecret: "connect_webhook_secret",
};

export const stripeLaneConfigKey = (lane: StripeLane, cred: StripeCredential): string => `stripe.${lane}.${CREDENTIAL_SUFFIX[cred]}`;
export const stripeLegacyConfigKey = (cred: StripeCredential): string => `stripe.${CREDENTIAL_SUFFIX[cred]}`;

/** The lane a mode names, or null for `disabled` (which names no lane — so
 *  disabling and re-enabling never disturbs lane-scoped state). */
export const laneForMode = (mode: StripeMode): StripeLane | null => (mode === "live" ? "live" : mode === "test" ? "test" : null);

/** The lane whose credentials get resolved. `disabled` resolves the test lane
 *  (with the legacy fallback) purely so a disabled deployment behaves exactly as
 *  it did before lanes existed; `stripeEnabled` is false either way. */
export const activeLaneForMode = (mode: StripeMode): StripeLane => laneForMode(mode) ?? "test";

/** Where a resolved credential came from. */
export type CredentialSource = "lane" | "legacy" | "none";

export interface StripeConfig {
  mode: StripeMode;
  /** The lane these credentials were resolved from. */
  lane: StripeLane;
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
  connectWebhookSecret: string;
  sources: Record<StripeCredential, CredentialSource>;
}

/**
 * The lane a stored credential ACTUALLY belongs to, read off its prefix
 * (`sk_test_` / `pk_live_` / restricted `rk_*`). This is a different fact from
 * the configured mode: live keys stored while the mode says "test" still move
 * real money, so the two are reported separately and a contradiction is
 * surfaced rather than inferred.
 */
export function credentialLane(value: string): StripeLane | null {
  if (/^(sk|pk|rk)_test_/.test(value)) return "test";
  if (/^(sk|pk|rk)_live_/.test(value)) return "live";
  return null;
}

/** Resolve the effective config out of a raw app_config map: active lane first,
 *  legacy unscoped key as the per-credential fallback. */
export function resolveStripeConfig(raw: Record<string, string | undefined>): StripeConfig {
  const declared = raw["stripe.mode"];
  const mode: StripeMode = declared === "test" || declared === "live" || declared === "disabled" ? declared : "disabled";
  const lane = activeLaneForMode(mode);
  const values = {} as Record<StripeCredential, string>;
  const sources = {} as Record<StripeCredential, CredentialSource>;
  for (const cred of STRIPE_CREDENTIALS) {
    const scoped = (raw[stripeLaneConfigKey(lane, cred)] ?? "").trim();
    const legacy = (raw[stripeLegacyConfigKey(cred)] ?? "").trim();
    values[cred] = scoped || legacy;
    sources[cred] = scoped ? "lane" : legacy ? "legacy" : "none";
  }
  return { mode, lane, ...values, sources };
}

export async function stripeConfig(db: D1Database): Promise<StripeConfig> {
  return resolveStripeConfig(await getConfig(db));
}

export function stripeEnabled(cfg: StripeConfig): boolean {
  return cfg.mode !== "disabled" && cfg.secretKey.startsWith("sk_");
}

/**
 * Does the resolved secret/publishable key contradict the configured mode?
 *
 * This is reported, not enforced at runtime: a deployment whose legacy keys are
 * live while `stripe.mode` says `test` is ALREADY taking real money, and failing
 * closed here would turn a labelling bug into a payments outage on deploy. The
 * write path refuses to CREATE a mismatch (see /admin/stripe/config) and
 * /admin/stripe/status reports it, so it can no longer be silent.
 */
export function stripeLaneMismatch(cfg: StripeConfig): boolean {
  if (cfg.mode === "disabled") return false;
  const sk = credentialLane(cfg.secretKey);
  const pk = credentialLane(cfg.publishableKey);
  return (!!sk && sk !== cfg.mode) || (!!pk && pk !== cfg.mode);
}

/** Last 4 characters of a stored credential — a safe "is this the key I think
 *  it is" hint. Never return more; secrets are write-only. */
const last4 = (v: string): string | null => (v.length >= 4 ? v.slice(-4) : v ? "…" : null);

export interface StripeLaneStatus {
  secretKey: boolean;
  publishableKey: boolean;
  webhookSecret: boolean;
  connectWebhookSecret: boolean;
  /** All four present in this exact scope. */
  complete: boolean;
  secretKeyLast4: string | null;
  publishableKeyLast4: string | null;
  /** The lane the stored secret key's prefix says it is. */
  secretKeyLane: StripeLane | null;
  publishableKeyLane: StripeLane | null;
}

export interface StripeStatus {
  mode: StripeMode;
  enabled: boolean;
  activeLane: StripeLane;
  /** What the ACTIVE secret key really is, per its prefix (null = unrecognised). */
  keyLane: StripeLane | null;
  /** The active key's real lane contradicts `mode`. */
  laneMismatch: boolean;
  /** Every credential the active lane needs is resolvable. */
  activeLaneComplete: boolean;
  /** No Connect signing secret at all → Connect webhooks are rejected. */
  connectWebhookMissing: boolean;
  /** Falling back to the PLATFORM signing secret for Connect events — which is a
   *  different endpoint with a different secret, so verification will fail. */
  connectWebhookFallback: boolean;
  /** Which of the four are present, per lane-scoped scope and legacy scope. */
  lanes: Record<StripeLane, StripeLaneStatus>;
  legacy: StripeLaneStatus;
  active: StripeLaneStatus & { lane: StripeLane; sources: Record<StripeCredential, CredentialSource> };
  platformFeeBps: number;
}

const laneStatus = (values: Record<StripeCredential, string>): StripeLaneStatus => ({
  secretKey: !!values.secretKey,
  publishableKey: !!values.publishableKey,
  webhookSecret: !!values.webhookSecret,
  connectWebhookSecret: !!values.connectWebhookSecret,
  complete: STRIPE_CREDENTIALS.every((cred) => !!values[cred]),
  secretKeyLast4: last4(values.secretKey),
  publishableKeyLast4: last4(values.publishableKey),
  secretKeyLane: credentialLane(values.secretKey),
  publishableKeyLane: credentialLane(values.publishableKey),
});

const scopeValues = (raw: Record<string, string | undefined>, key: (cred: StripeCredential) => string): Record<StripeCredential, string> => {
  const out = {} as Record<StripeCredential, string>;
  for (const cred of STRIPE_CREDENTIALS) out[cred] = (raw[key(cred)] ?? "").trim();
  return out;
};

/**
 * The safe answer to "what is Kova actually on right now?" — presence,
 * provenance and the derived key lane, with NO secret material: booleans, a
 * last-4 hint, and the lane a prefix implies. Never a key, never a `whsec_`.
 */
export function stripeStatus(raw: Record<string, string | undefined>): StripeStatus {
  const cfg = resolveStripeConfig(raw);
  const active = laneStatus({
    secretKey: cfg.secretKey,
    publishableKey: cfg.publishableKey,
    webhookSecret: cfg.webhookSecret,
    connectWebhookSecret: cfg.connectWebhookSecret,
  });
  const fee = Number(raw["stripe.platform_fee_bps"] ?? "0");
  return {
    mode: cfg.mode,
    enabled: stripeEnabled(cfg),
    activeLane: cfg.lane,
    keyLane: active.secretKeyLane,
    laneMismatch: stripeLaneMismatch(cfg),
    activeLaneComplete: active.complete,
    connectWebhookMissing: !cfg.connectWebhookSecret,
    connectWebhookFallback: !cfg.connectWebhookSecret && !!cfg.webhookSecret,
    lanes: {
      test: laneStatus(scopeValues(raw, (cred) => stripeLaneConfigKey("test", cred))),
      live: laneStatus(scopeValues(raw, (cred) => stripeLaneConfigKey("live", cred))),
    },
    legacy: laneStatus(scopeValues(raw, stripeLegacyConfigKey)),
    active: { ...active, lane: cfg.lane, sources: cfg.sources },
    platformFeeBps: Number.isFinite(fee) ? fee : 0,
  };
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
    "metadata[kova_tenant]": tenantId,
  });
  await db.prepare("UPDATE subscriptions SET stripe_customer_id = ? WHERE tenant_id = ?").bind(customer.id, tenantId).run();
  return customer.id;
}

/**
 * Lane-scoped stash of the catalog ids `syncCatalog` writes back into D1.
 *
 * `plans.stripe_product_id/stripe_price_id` and the same pair on `credit_packs`
 * hold ids of objects that exist in ONE Stripe lane only: a test-mode price id is
 * meaningless against a live key. `syncCatalog` skips any row that already has an
 * id, so without this a lane flip would leave the previous lane's ids in place,
 * Sync catalog would report "0 plans, 0 packs", and every checkout would fail
 * with "No such price" — the classic "worked in test, broke in live".
 *
 * So on a test↔live flip the current ids are parked under
 * `stripe.<lane>.catalog_ids` and the incoming lane's parked ids are restored
 * (absent ⇒ columns stay NULL, and the next Sync catalog creates them). Flipping
 * back therefore reuses the objects already created in that lane.
 */
export const stripeCatalogStashKey = (lane: StripeLane): string => `stripe.${lane}.catalog_ids`;

/** table → the id column pair. Fixed literals: never interpolate a request value. */
const CATALOG_TABLES = { plans: "plans", credit_packs: "credit_packs" } as const;
type CatalogTable = keyof typeof CATALOG_TABLES;
type CatalogStash = Partial<Record<CatalogTable, Record<string, { product: string | null; price: string | null }>>>;

/** Park the current catalog ids under `lane` and clear the columns. */
export async function stashCatalogIds(db: D1Database, lane: StripeLane): Promise<void> {
  const stash: CatalogStash = {};
  for (const table of Object.keys(CATALOG_TABLES) as CatalogTable[]) {
    const rows = await db
      .prepare(`SELECT id, stripe_product_id, stripe_price_id FROM ${CATALOG_TABLES[table]} WHERE stripe_product_id IS NOT NULL OR stripe_price_id IS NOT NULL`)
      .all<{ id: string; stripe_product_id: string | null; stripe_price_id: string | null }>();
    const entries = rows.results ?? [];
    if (entries.length) {
      stash[table] = Object.fromEntries(entries.map((r) => [r.id, { product: r.stripe_product_id, price: r.stripe_price_id }]));
    }
    await db.prepare(`UPDATE ${CATALOG_TABLES[table]} SET stripe_product_id = NULL, stripe_price_id = NULL WHERE stripe_product_id IS NOT NULL OR stripe_price_id IS NOT NULL`).run();
  }
  await setConfig(db, stripeCatalogStashKey(lane), JSON.stringify(stash));
}

/** Restore ids previously parked for `lane` (no-op when nothing is parked). */
export async function restoreCatalogIds(db: D1Database, lane: StripeLane): Promise<void> {
  const raw = (await getConfig(db))[stripeCatalogStashKey(lane)];
  if (!raw) return;
  let stash: CatalogStash;
  try {
    stash = JSON.parse(raw) as CatalogStash;
  } catch {
    return;
  }
  for (const table of Object.keys(CATALOG_TABLES) as CatalogTable[]) {
    for (const [id, ids] of Object.entries(stash[table] ?? {})) {
      await db.prepare(`UPDATE ${CATALOG_TABLES[table]} SET stripe_product_id = ?, stripe_price_id = ? WHERE id = ?`).bind(ids.product ?? null, ids.price ?? null, id).run();
    }
  }
}

/** Move the catalog ids across a lane flip (park `from`, restore `to`). */
export async function swapCatalogLane(db: D1Database, from: StripeLane, to: StripeLane): Promise<void> {
  if (from === to) return;
  await stashCatalogIds(db, from);
  await restoreCatalogIds(db, to);
}

/** Push plans + packs to Stripe as products + prices; store the ids back. The
 *  ids are LANE-SPECIFIC — see `stripeCatalogStashKey` for what happens on a
 *  mode flip. */
export async function syncCatalog(db: D1Database, secretKey: string): Promise<{ plans: number; packs: number }> {
  const plans = await db.prepare("SELECT id, name, price_usd_month, stripe_price_id FROM plans WHERE active = 1 AND price_usd_month > 0").all<{ id: string; name: string; price_usd_month: number; stripe_price_id: string | null }>();
  let planCount = 0;
  for (const p of plans.results ?? []) {
    if (p.stripe_price_id) continue;
    const product = await stripeCall<{ id: string }>(secretKey, "products", { name: `Kova ${p.name}`, "metadata[kova_plan]": p.id });
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
    const product = await stripeCall<{ id: string }>(secretKey, "products", { name: `Kova — ${p.name}`, "metadata[kova_pack]": p.id });
    const price = await stripeCall<{ id: string }>(secretKey, "prices", { product: product.id, unit_amount: Math.round(p.price_usd * 100), currency: "usd" });
    await db.prepare("UPDATE credit_packs SET stripe_product_id = ?, stripe_price_id = ? WHERE id = ?").bind(product.id, price.id, p.id).run();
    packCount++;
  }
  return { plans: planCount, packs: packCount };
}

export { setConfig };
