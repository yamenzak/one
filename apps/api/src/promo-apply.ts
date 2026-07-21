/**
 * Promo application (billing centralization) — resolve a website-native promo
 * code from D1 and apply it to a single-charge purchase. Shared by both rails:
 *   - platform (Mossa → tenant): scope='platform', tenant-agnostic (tenant_id '')
 *   - tenant   (tenant → client): scope='tenant', scoped to the tenant
 * The discount math is pure (`applyPromo` in @mossa/domain); this layer only
 * loads the row and, on a successful charge, bumps the redemption counter.
 */

import { applyPromo, type PromoCode, type PromoResult } from "@mossa/domain";

interface PromoRow {
  id: string;
  discount_type: string;
  percent_off: number | null;
  amount_off_cents: number | null;
  restricted_package_id: string | null;
  restricted_client_id: string | null;
  max_redemptions: number | null;
  redemption_count: number;
  expires_at: string | null;
  active: number;
}

const toDomain = (r: PromoRow): PromoCode => ({
  discountType: r.discount_type === "amount" ? "amount" : "percent",
  percentOff: r.percent_off,
  amountOffCents: r.amount_off_cents,
  restrictedPackageId: r.restricted_package_id,
  restrictedClientId: r.restricted_client_id,
  maxRedemptions: r.max_redemptions,
  redemptionCount: r.redemption_count,
  expiresAt: r.expires_at,
  active: r.active === 1,
});

/** Look up a code within a rail scope; returns the row id + validated discount,
 *  or a typed failure the route surfaces as a 400. `code` is matched uppercased. */
export async function resolveAndApplyPromo(
  db: D1Database,
  opts: { scope: "tenant" | "platform"; tenantId: string; code: string; amountCents: number; nowIso: string; targetId?: string | null; clientId?: string | null },
): Promise<({ id: string } & Extract<PromoResult, { ok: true }>) | Extract<PromoResult, { ok: false }>> {
  const row = await db
    .prepare("SELECT * FROM promo_codes WHERE tenant_id = ? AND code = ? AND scope = ?")
    .bind(opts.scope === "platform" ? "" : opts.tenantId, opts.code.toUpperCase(), opts.scope)
    .first<PromoRow>();
  const res = applyPromo(opts.amountCents, row ? toDomain(row) : null, { nowIso: opts.nowIso, targetId: opts.targetId, clientId: opts.clientId });
  if (!res.ok) return res;
  return { id: row!.id, ...res };
}

/** Guarded increment of a promo's redemption counter — the WHERE clause is what
 *  actually enforces max_redemptions under concurrency (no TOCTOU). Best-effort:
 *  called from a webhook after the charge succeeded. */
export async function bumpPromoRedemption(db: D1Database, promoId: string): Promise<void> {
  await db
    .prepare("UPDATE promo_codes SET redemption_count = redemption_count + 1 WHERE id = ? AND (max_redemptions IS NULL OR redemption_count < max_redemptions)")
    .bind(promoId)
    .run()
    .catch(() => undefined);
}
