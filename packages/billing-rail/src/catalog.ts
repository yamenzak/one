/**
 * THE ACCOUNT'S CATALOG, grouped by the app that sells it.
 *
 * One Stripe account holding several apps' products is only manageable if every
 * product says which app it belongs to. This reads the account back and answers
 * two questions an operator actually has:
 *
 *   what does app X sell?
 *   what is in this account that NOTHING claims?
 *
 * The second is the useful one, and it is useful before a second app exists.
 * Untagged products are exactly the rows whose payments will park unroutable
 * (see `routing.ts`), so this listing is the pre-flight check for adding an app
 * to an account that already has one.
 *
 * ── Why this reads Stripe rather than a local table ─────────────────────────
 *
 * Because Stripe is the authority and the local tables are per-app. Kova's
 * `plans` and `credit_packs` carry `stripe_product_id`, but they live in Kova's
 * D1 — an admin worker asking "what does the ACCOUNT contain" cannot consult a
 * database it should not be able to reach. Asking Stripe is both correct and the
 * only thing that can see a product some other app created.
 */

import { stripeCall } from "@4dl/billing/stripe";
import type { RailApp } from "./routing.js";

/** The metadata key that names the owning app. */
export const APP_KEY = "app";

export interface CatalogProduct {
  id: string;
  name: string;
  active: boolean;
  /** The app that owns it, or null when nothing claims it. */
  app: string | null;
  /** How we know: an explicit `metadata.app`, or an inferred `<prefix>_*` key. */
  via: "explicit" | "prefix" | null;
  /** `metadata.app` names an app the rail was not told about. */
  unknownApp: boolean;
}

export interface Catalog {
  /** Products per app slug, plus `null` for the unclaimed. */
  byApp: Record<string, CatalogProduct[]>;
  unclaimed: CatalogProduct[];
  /** Tagged for an app the rail does not know — a typo, or a retired app. */
  unknown: CatalogProduct[];
  total: number;
}

interface StripeProduct {
  id: string;
  name?: string;
  active?: boolean;
  metadata?: Record<string, string>;
}

/** Attribute one product the same way `resolveApp` attributes an event, so the
 *  console's answer and the webhook's answer can never disagree. */
export function classifyProduct(p: StripeProduct, apps: RailApp[]): CatalogProduct {
  const meta = p.metadata ?? {};
  const base = { id: p.id, name: p.name ?? p.id, active: p.active !== false };
  const explicit = meta[APP_KEY]?.trim();
  if (explicit) {
    const known = apps.some((a) => a.slug === explicit);
    return { ...base, app: known ? explicit : null, via: known ? "explicit" : null, unknownApp: !known };
  }
  const hit = apps.find((a) => a.metadataPrefix && Object.keys(meta).some((k) => k.startsWith(`${a.metadataPrefix}_`)));
  return { ...base, app: hit?.slug ?? null, via: hit ? "prefix" : null, unknownApp: false };
}

/**
 * Read every product on the account and group it.
 *
 * Paginates to the end deliberately: a truncated listing would report products
 * as absent, and "nothing claims this" is the answer an operator would act on by
 * deleting something another app depends on.
 */
export async function readCatalog(secretKey: string, apps: RailApp[], pageLimit = 20): Promise<Catalog> {
  const all: StripeProduct[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < pageLimit; page++) {
    const q = new URLSearchParams({ limit: "100" });
    if (startingAfter) q.set("starting_after", startingAfter);
    const res = await stripeCall<{ data: StripeProduct[]; has_more?: boolean }>(secretKey, `products?${q.toString()}`);
    all.push(...(res.data ?? []));
    if (!res.has_more || !res.data?.length) break;
    startingAfter = res.data[res.data.length - 1]!.id;
  }

  const byApp: Record<string, CatalogProduct[]> = {};
  const unclaimed: CatalogProduct[] = [];
  const unknown: CatalogProduct[] = [];
  for (const raw of all) {
    const p = classifyProduct(raw, apps);
    if (p.unknownApp) unknown.push(p);
    else if (p.app) (byApp[p.app] ??= []).push(p);
    else unclaimed.push(p);
  }
  return { byApp, unclaimed, unknown, total: all.length };
}

/**
 * Stamp `metadata.app` onto a product that is missing it.
 *
 * The migration path for an account that predates the rail: everything Kova
 * created carries only `kova_plan` / `kova_pack`, which `classifyProduct` infers
 * from but which no operator can filter on in the Stripe dashboard. Writing the
 * explicit key is additive — the prefixed keys stay, so a rollback changes
 * nothing.
 *
 * Stripe merges metadata on update rather than replacing it, so this cannot
 * clear the keys the existing webhook handlers read back.
 */
export async function tagProduct(secretKey: string, productId: string, app: string): Promise<void> {
  await stripeCall(secretKey, `products/${productId}`, { [`metadata[${APP_KEY}]`]: app });
}
