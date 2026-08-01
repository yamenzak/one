/**
 * THE TENANT'S OWN PAYMENT RAIL — customer → studio, on the studio's provider.
 *
 * This replaces Stripe Connect. The platform is not in the money path: it never
 * holds funds, never holds a credential that can move them, is not the merchant
 * of record, and takes no cut. A studio is paid directly, by whoever they
 * already bank with, in whatever country they are in.
 *
 * What is left for the platform to do is narrow, and it is all here:
 *
 *   OPEN     write a pending purchase and hand back where to send the customer
 *   LEARN    receive a signed notification, or hear it from the studio
 *   GRANT    turn "paid" into days of access
 *
 * ── The webhook door ────────────────────────────────────────────────────────
 *
 * `/api/pay/webhook/:tenantId` is PUBLIC and unauthenticated, because the caller
 * is a payment provider that will never hold a session. Its safety rests
 * entirely on the signature check inside the tenant's provider adapter, so three
 * rules hold here and are tested:
 *
 *   1. The tenant is taken from the URL and used to load THAT tenant's config.
 *      Nothing is ever read out of the event body to decide whose it is.
 *   2. A tenant with no verifiable configuration REFUSES. Answering "fine" to an
 *      unverifiable request would let anyone who learns the URL grant packages.
 *   3. An authentic event we cannot place is a 200 with the purchase left
 *      pending — never an error. The customer really did pay; the studio
 *      reconciles it by hand. Erroring would make the provider retry forever and
 *      eventually disable the endpoint, which would break the ones that DO match.
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  assertSafeConfig,
  isValidReference,
  ProviderRegistry,
  manualProvider,
  stripeLinkProvider,
  settleEvent,
  settleManually,
  type PaymentEvent,
  type ProviderConfig,
} from "@4dl/commerce";
import type { AppEnv } from "./auth-context.js";
import { requireTenant } from "./auth-context.js";
import { requireClientAccess } from "./clients.js";
import { gateFeature } from "./client-flags.js";
import { newId, nowIso } from "./ids.js";
import { parseJson, j } from "./db.js";
import { notifyOwners } from "./notify.js";
import { recordAudit } from "./audit.js";
import { grantClientPackage, renewClientSubscription } from "./stripe-routes.js";
import { MAX_PACKAGE_PRICE_CENTS } from "./commerce-routes.js";

/**
 * Kova's providers. `manual` is deliberately first — it is the only one that
 * works in every country on day one, and every other provider degrades to it.
 */
export const PROVIDERS = new ProviderRegistry([manualProvider, stripeLinkProvider]);

interface PayRow {
  provider: string | null;
  config_json: string | null;
}

async function providerFor(db: D1Database, tenantId: string): Promise<{ id: string; cfg: ProviderConfig }> {
  const row = await db
    .prepare("SELECT provider, config_json FROM tenant_payment_settings WHERE tenant_id = ?")
    .bind(tenantId)
    .first<PayRow>();
  return { id: row?.provider ?? "manual", cfg: parseJson<ProviderConfig>(row?.config_json ?? null, {}) };
}

/**
 * Config is echoed back with secrets MASKED.
 *
 * The tenant needs to know a secret is set without the value being readable from
 * any session that can reach settings — a stolen cookie should not yield the
 * thing that lets an attacker forge paid events for that studio.
 */
function maskConfig(cfg: ProviderConfig): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(cfg)) {
    out[k] = k.includes("secret") ? (v ? "••••••••" : "") : v;
  }
  return out;
}

export const paymentsRoutes = new Hono<AppEnv>()

  // ── The studio's own setup ────────────────────────────────────────────────
  .get("/payments/settings", async (c) => {
    const who = requireTenant(c)!;
    const { id, cfg } = await providerFor(c.env.DB, who.tenantId);
    const p = PROVIDERS.get(id);
    return c.json({
      provider: id,
      config: maskConfig(cfg),
      // The URL the tenant pastes into their provider's dashboard. Built from
      // the request so it is right on a subdomain and on a custom domain alike.
      webhookUrl: `${new URL(c.req.url).origin}/api/pay/webhook/${who.tenantId}`,
      providers: PROVIDERS.list().map((x) => ({
        id: x.id,
        label: x.label,
        capabilities: x.capabilities,
        setupSteps: x.setupSteps ?? [],
      })),
      ready: id === "manual" || Boolean(p && Object.keys(cfg).length > 0),
    });
  })

  .patch("/payments/settings", async (c) => {
    const who = requireTenant(c)!;
    if (c.get("role") !== "owner") return c.json({ error: "forbidden" }, 403);
    { const g = await gateFeature(c, "commerce"); if (g) return g; }
    const body = z
      .object({ provider: z.string(), config: z.record(z.string(), z.string()).default({}) })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    if (!PROVIDERS.get(body.data.provider)) return c.json({ error: "unknown provider" }, 400);

    // The credential rule, at the door. A config naming something that can ACT
    // on the tenant's merchant account is refused before it can be stored — this
    // is what stops the table becoming a vault of live payment keys.
    try {
      assertSafeConfig(body.data.config);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }

    // A blank value means "leave what is stored" — the UI shows secrets masked,
    // so echoing the mask back must not wipe the real one.
    const { cfg: existing } = await providerFor(c.env.DB, who.tenantId);
    const merged: ProviderConfig = { ...existing };
    for (const [k, v] of Object.entries(body.data.config)) {
      if (v === "" || v.startsWith("••")) continue;
      merged[k] = v;
    }

    await c.env.DB.prepare(
      "INSERT INTO tenant_payment_settings (tenant_id, provider, config_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(tenant_id) DO UPDATE SET provider = excluded.provider, config_json = excluded.config_json, updated_at = excluded.updated_at",
    )
      .bind(who.tenantId, body.data.provider, j(merged), nowIso())
      .run();
    return c.json({ ok: true, provider: body.data.provider, config: maskConfig(merged) });
  })

  // ── Opening a purchase ────────────────────────────────────────────────────
  .post("/purchases", async (c) => {
    const who = requireTenant(c)!;
    const body = z
      .object({ clientId: z.string(), packageId: z.string() })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, body.data.clientId);
    if ("response" in access) return access.response;

    const pkg = await c.env.DB.prepare(
      "SELECT id, name, one_time_price_cents, monthly_price_cents, currency, pay_link, visibility, restricted_subject_id FROM packages WHERE id = ? AND tenant_id = ? AND active = 1",
    )
      .bind(body.data.packageId, who.tenantId)
      .first<{ id: string; name: string; one_time_price_cents: number | null; monthly_price_cents: number | null; currency: string | null; pay_link: string | null; visibility: string; restricted_subject_id: string | null }>();
    if (!pkg) return c.json({ error: "package not found" }, 404);
    if (pkg.visibility === "client_specific" && pkg.restricted_subject_id && pkg.restricted_subject_id !== access.client.id) {
      return c.json({ error: "package is private to another client" }, 403);
    }

    const recurring = (pkg.monthly_price_cents ?? 0) > 0;
    const amount = recurring ? (pkg.monthly_price_cents ?? 0) : (pkg.one_time_price_cents ?? 0);
    if (amount <= 0) return c.json({ error: "use /subscriptions/grant for free packages" }, 400);
    // The same ceiling the Stripe rail carried, for the same reason: it bounds
    // one attempt. It is cheaper here (nobody is liable for the loss but the
    // studio) yet still worth keeping — an absurd price is far more often a
    // typo than a plan, and the customer is the one who would pay it.
    if (amount > MAX_PACKAGE_PRICE_CENTS) {
      return c.json({ error: "package price exceeds the platform maximum", maxCents: MAX_PACKAGE_PRICE_CENTS }, 400);
    }

    const { id: providerId, cfg } = await providerFor(c.env.DB, who.tenantId);
    const provider = PROVIDERS.get(providerId) ?? manualProvider;
    if (recurring && !provider.capabilities.recurring) {
      // Refused rather than sold: a recurring package on a link-only provider
      // takes one payment and then silently never renews, which reads to the
      // customer as being cut off and to the studio as a lost sale.
      return c.json({ error: "this package renews monthly, but your payment method can't take recurring payments" }, 409);
    }

    const id = newId("pi").replace(/[^A-Za-z0-9_-]/g, "");
    // Generated to the narrowest shape any provider accepts. A provider that
    // dislikes it may drop it SILENTLY, and then a paying customer is
    // unattributable — so this is asserted, not hoped for.
    if (!isValidReference(id)) return c.json({ error: "could not open a purchase" }, 500);

    const currency = pkg.currency || "usd";
    // A per-package link beats the tenant-wide config: hosted links are
    // fixed-price, so the catalogue cannot share one.
    const url = pkg.pay_link
      ? provider.checkoutUrl({ ...cfg, payment_link: pkg.pay_link }, id, { amountCents: amount, currency })
      : provider.checkoutUrl(cfg, id, { amountCents: amount, currency });

    await c.env.DB.prepare(
      "INSERT INTO purchase_intents (id, tenant_id, subject_id, package_id, provider, status, amount_cents, currency, checkout_url, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)",
    )
      .bind(id, who.tenantId, access.client.id, pkg.id, provider.id, amount, currency, url, nowIso())
      .run();

    return c.json({ id, checkoutUrl: url, provider: provider.id, amountCents: amount, currency }, 201);
  })

  /** The studio's reconciliation list — every purchase waiting on a human. */
  .get("/purchases", async (c) => {
    const who = requireTenant(c)!;
    if (c.get("role") === "client") return c.json({ error: "forbidden" }, 403);
    const status = c.req.query("status") ?? "pending";
    const rows = await c.env.DB.prepare(
      `SELECT pi.*, p.name AS package_name, cl.display_name AS client_name
       FROM purchase_intents pi
       LEFT JOIN packages p ON p.id = pi.package_id
       LEFT JOIN clients cl ON cl.id = pi.subject_id
       WHERE pi.tenant_id = ? AND pi.status = ?
       ORDER BY pi.created_at DESC LIMIT 200`,
    )
      .bind(who.tenantId, status)
      .all<Record<string, unknown>>();
    return c.json({ purchases: rows.results });
  })

  /** "Yes, they paid me." The manual authority, and the fallback for every
   *  provider whose notification never arrived. */
  .post("/purchases/:id/confirm", async (c) => {
    const who = requireTenant(c)!;
    if (c.get("role") !== "owner" && c.get("role") !== "trainer") return c.json({ error: "forbidden" }, 403);
    /**
     * Row-level scope BEFORE settling, not just the role check.
     *
     * Confirming a purchase grants a package to a specific person, so it is a
     * client-scoped write and has to pass the same chokepoint every other one
     * does. The role check alone would let any trainer in the studio grant
     * access to a client who is not theirs — the tenant scope on the intent stops
     * a cross-STUDIO reach, but nothing inside the studio.
     */
    const pending = await c.env.DB.prepare("SELECT subject_id FROM purchase_intents WHERE id = ? AND tenant_id = ?")
      .bind(c.req.param("id"), who.tenantId)
      .first<{ subject_id: string }>();
    if (!pending) return c.json({ error: "purchase not found" }, 404);
    const access = await requireClientAccess(c, pending.subject_id);
    if ("response" in access) return access.response;

    const outcome = await settleManually(c.env.DB, who.tenantId, c.req.param("id"), who.userId ?? "staff", nowIso());
    if (outcome.kind === "unmatched") return c.json({ error: "purchase not found" }, 404);
    if (outcome.kind === "already") return c.json({ error: "purchase is already settled" }, 409);
    if (outcome.kind === "granted") {
      await grantClientPackage(c.env.DB, who.tenantId, outcome.intent.subject_id, outcome.intent.package_id, outcome.intent.id, null);
      await recordAudit(c.env, {
        tenantId: who.tenantId,
        clientId: outcome.intent.subject_id,
        actorUserId: who.userId,
        action: "package.assign",
        summary: "confirmed an off-platform payment",
        ref: outcome.intent.package_id,
      });
    }
    return c.json({ ok: true });
  });

/**
 * The provider door. Mounted separately from the routes above because it is
 * PUBLIC — no session, no tenant context, no route guard. Everything it trusts
 * comes from the signature check inside the provider adapter.
 */
export const paymentsWebhook = new Hono<AppEnv>().post("/pay/webhook/:tenantId", async (c) => {
  const tenantId = c.req.param("tenantId");
  const { id, cfg } = await providerFor(c.env.DB, tenantId);
  const provider = PROVIDERS.get(id);
  // An unknown or unconfigured provider REFUSES. See the header: silence here
  // would be an open door on a half-configured studio.
  if (!provider) return c.json({ error: "no payment provider configured" }, 400);

  const body = await c.req.text();
  let events: PaymentEvent[];
  try {
    events = await provider.verify(cfg, { body, headers: c.req.raw.headers });
  } catch {
    // Deliberately no detail: a caller who cannot produce a valid signature
    // learns nothing about why from us.
    return c.json({ error: "invalid signature" }, 400);
  }

  for (const event of events) {
    const outcome = await settleEvent(c.env.DB, tenantId, event, nowIso());
    if (outcome.kind === "granted") {
      const intent = outcome.intent;
      const recurring = event.kind === "renewed";
      if (recurring) {
        await renewClientSubscription(c.env.DB, intent.id, tenantId);
      } else {
        // The reference doubles as the recurring key, so a later renewal for the
        // same subscription resolves this row. See grantClientPackage's header.
        await grantClientPackage(c.env.DB, tenantId, intent.subject_id, intent.package_id, intent.id, intent.id);
      }
      if (outcome.mismatch) {
        // The studio's link and their package disagree on price. Only they can
        // fix it, and they will not know unless we say so — the access is
        // granted either way, because the customer did pay something.
        await notifyOwners(c.env, tenantId, {
          type: "payment_mismatch",
          message: `A payment arrived at ${(outcome.amountCents / 100).toFixed(2)} ${intent.currency.toUpperCase()}, but the package is priced at ${(intent.amount_cents / 100).toFixed(2)}.`,
          dedupeKey: `mm_${intent.id}`,
        }).catch(() => undefined);
      }
    } else if (outcome.kind === "flagged") {
      await notifyOwners(c.env, tenantId, {
        type: outcome.status === "refunded" ? "payment_refunded" : "payment_disputed",
        message: `A client payment was ${outcome.status}. Their access is unchanged — adjust it if you need to.`,
        dedupeKey: `${outcome.status}_${outcome.intent.id}`,
      }).catch(() => undefined);
    }
    // `unmatched` and `already` are both fine and both silent to the provider.
  }

  return c.json({ received: true });
});
