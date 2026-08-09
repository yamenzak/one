/**
 * THE STRIPE LANE'S OPERATOR ROUTES — status, credentials, catalog sync.
 *
 * ── Why these moved, and what it cost to leave them ─────────────────────────
 *
 * `@4dl/admin`'s `PlatformStripeSection` speaks one contract:
 * `GET /admin/stripe/status`, `POST /admin/stripe/config`,
 * `POST /admin/stripe/sync`. The PANEL was extracted first, which fixed the
 * surface and left the handlers behind — so three apps carried three copies of
 * the same reconciliation, and they had drifted:
 *
 *   Kova   the reference: both lanes stored at once, the pre-commit validation
 *          pass, the mode-flip catalog swap, and the `resyncPrices` repair.
 *   Tessa  one lane, no swap, no repair. Flipping to live pointed the catalog
 *          at test-lane price ids and every checkout failed with "No such
 *          price" — a payments outage produced by pressing the switch the
 *          console offers.
 *   Scena  neither. It had `ping` and a `sync` returning a shape nothing read,
 *          and no `status`/`config` at all, so mounting the shared panel there
 *          would have rendered a permanent load error.
 *
 * Kova's is the one that survives, which is the rule this package exists to
 * enforce: the two lanes, the mismatch refusal, the write-only key handling and
 * the rebuild repair are facts about STRIPE, not insights about a product.
 *
 * ── What is still the app's, and why each has to be ─────────────────────────
 *
 * `syncCatalog` is injected because the catalog TABLE is the app's: the shared
 * store reads `price_usd_month`, Scena's reads `price_cents` + `currency` +
 * `interval`, and reconciling those two is a data migration rather than a
 * wiring change (see CLAUDE.md's note on `BILLING_SCHEMA`). `seed` is injected
 * for the same reason. `clearCatalogIds` too — the repair nulls ids in tables
 * this package cannot name.
 *
 * An app that has no repair path passes no `clearCatalogIds`; the route then
 * REFUSES `resyncPrices` rather than reporting a rebuild it did not do.
 */

import { Hono, type Context } from "hono";
import { getConfig, setConfig, type HasDb } from "@4dl/core";
import {
  credentialLane,
  laneForMode,
  resolveStripeConfig,
  stripeConfig,
  stripeEnabled,
  stripeLaneConfigKey,
  stripeLaneMismatch,
  stripeStatus,
  swapCatalogLane,
  STRIPE_CREDENTIALS,
  type StripeCredential,
  type StripeLane,
  type StripeMode,
} from "./stripe.js";

/** The binding slice these routes touch. An app's own `Env` satisfies it by shape. */
export type StripeAdminEnv = { Bindings: HasDb };
export type StripeAdminContext = Context<StripeAdminEnv>;

/** What one catalog sync produced. Counts, because that is all the panel renders. */
export interface CatalogSyncResult {
  plans: number;
  packs: number;
  renamed?: number;
  renameFailed?: number;
}

export interface StripeAdminConfig {
  /** The console gate. Same function every other admin route tree takes. */
  isPlatformAdmin: (c: StripeAdminContext) => boolean;
  /** Push the app's plans and packs into Stripe, creating what is missing. */
  syncCatalog: (db: D1Database, secretKey: string) => Promise<CatalogSyncResult>;
  /** Make sure the catalog rows exist before they are pushed. */
  seed?: (db: D1Database) => Promise<void>;
  /**
   * The REBUILD repair: null the stored Stripe ids on every active plan and
   * pack so the sync below recreates them at the current price.
   *
   * Optional, and its absence is a refusal rather than a silent no-op — an
   * operator pressing "Rebuild prices" and being told "0 rebuilt" would read
   * that as "nothing needed rebuilding".
   */
  clearCatalogIds?: (db: D1Database) => Promise<{ cleared: number; clearedPacks: number }>;
}

/**
 * Per-credential paste validation. The prefix rules are Stripe's own, so a
 * wrong-slot paste — a publishable key in the secret field, a signing secret in
 * a key field — is refused at the door rather than discovered later as a dead
 * payment path.
 */
const CREDENTIAL_SHAPE: Record<StripeCredential, { prefix: RegExp; label: string; expect: string }> = {
  secretKey: { prefix: /^sk_/, label: "Secret key", expect: "sk_…" },
  publishableKey: { prefix: /^pk_/, label: "Publishable key", expect: "pk_…" },
  webhookSecret: { prefix: /^whsec_/, label: "Webhook signing secret", expect: "whsec_…" },
};

type CredFields = Partial<Record<StripeCredential, string>>;

/** Hand-parsed rather than zod'd: this package has no zod dependency, the body
 *  is four optional strings and an enum, and every field is validated on its own
 *  terms below anyway. An unknown field is ignored, which is what a zod object
 *  would do too. */
function readCreds(v: unknown): CredFields {
  const o = (v ?? {}) as Record<string, unknown>;
  const out: CredFields = {};
  for (const cred of STRIPE_CREDENTIALS) {
    const raw = o[cred];
    if (typeof raw === "string") out[cred] = raw.slice(0, 400);
  }
  return out;
}

const asMode = (v: unknown): StripeMode | undefined =>
  v === "disabled" || v === "test" || v === "live" ? v : undefined;
const asLane = (v: unknown): StripeLane | undefined => (v === "test" || v === "live" ? v : undefined);

export function stripeAdminRoutes(cfg: StripeAdminConfig) {
  return new Hono<StripeAdminEnv>()
    /**
     * Every handler here calls Stripe, and `stripeCall` throws Stripe's own
     * message — "No such product", "Invalid API Key provided". Without this each
     * became a bare 500 with an empty body, so an operator pressing **Sync
     * catalog** saw "HTTP 500" and had nothing to act on: not which object, not
     * which lane, not whether it was their key.
     *
     * 502 rather than 500: the upstream refused, we did not break. The messages
     * are the text Stripe puts in its own dashboard and are safe to show a
     * platform admin.
     */
    .onError((err, c) => {
      console.error(`[stripe-admin] ${c.req.method} ${new URL(c.req.url).pathname}:`, err);
      return c.json({ error: err instanceof Error ? err.message : "stripe request failed" }, 502);
    })

    /**
     * "What is this deployment actually on right now?" — presence, provenance
     * and the lane the active key really belongs to. NO secret material is ever
     * returned: booleans, a last-4 hint, and prefix-derived lanes only.
     */
    .get("/admin/stripe/status", async (c) => {
      if (!cfg.isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
      return c.json(stripeStatus(await getConfig(c.env.DB)));
    })

    /**
     * Write credentials into a LANE (`stripe.<lane>.*`), so test and live can
     * both be stored and going live is a `mode` change rather than a re-paste
     * under pressure. Shapes accepted:
     *   • `{ lanes: { test: {…}, live: {…} } }` — both lanes at once.
     *   • flat `{ secretKey, … }` — targets `lane`, else the lane of the `mode`
     *     being set, else the currently active lane.
     * A blank or absent field always PRESERVES what is stored: keys are
     * write-only, which is what lets the console render "set" without ever
     * reading one back.
     *
     * Two refusals, both 400 with nothing written — a value whose prefix
     * contradicts the lane it is being stored in, and a `mode` whose resulting
     * active keys really belong to the other lane. That second one is what makes
     * `stripe.mode` honest. We refuse rather than "correct" the mode, because
     * silently relabelling what an operator typed is how a live key ends up
     * active by accident.
     */
    .post("/admin/stripe/config", async (c) => {
      if (!cfg.isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
      const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body || typeof body !== "object") return c.json({ error: "invalid body" }, 400);

      const mode = asMode(body.mode);
      if (body.mode !== undefined && !mode) return c.json({ error: "invalid mode" }, 400);
      // Refused rather than defaulted. An unrecognised `lane` silently falling
      // back to the active one would file a key in whichever lane happened to be
      // selected — which is the mistake every other check here exists to catch.
      if (body.lane !== undefined && !asLane(body.lane)) return c.json({ error: "invalid lane" }, 400);
      const flat = readCreds(body);
      const lanes = (body.lanes ?? {}) as Record<string, unknown>;

      const raw = await getConfig(c.env.DB);
      const current = resolveStripeConfig(raw);
      const flatLane: StripeLane = asLane(body.lane) ?? laneForMode(mode ?? current.mode) ?? current.lane;

      // Collect every (lane, credential) write first, validate the whole set,
      // and only then commit — a half-applied save is exactly the half-swap this
      // feature exists to prevent.
      const pending = new Map<string, string>();
      const perLane: { lane: StripeLane; fields: CredFields }[] = [
        { lane: flatLane, fields: flat },
        ...(lanes.test ? [{ lane: "test" as StripeLane, fields: readCreds(lanes.test) }] : []),
        ...(lanes.live ? [{ lane: "live" as StripeLane, fields: readCreds(lanes.live) }] : []),
      ];
      for (const { lane, fields } of perLane) {
        for (const cred of STRIPE_CREDENTIALS) {
          const value = (fields[cred] ?? "").trim();
          if (!value) continue; // blank preserves the stored value
          const shape = CREDENTIAL_SHAPE[cred];
          if (!shape.prefix.test(value)) {
            return c.json({ error: `${shape.label} must start with ${shape.expect}`, code: "invalid_prefix" }, 400);
          }
          const belongs = credentialLane(value);
          if (belongs && belongs !== lane) {
            return c.json(
              { error: `That ${shape.label.toLowerCase()} is a ${belongs}-mode key — it can't be stored in the ${lane} lane.`, code: "lane_mismatch" },
              400,
            );
          }
          pending.set(stripeLaneConfigKey(lane, cred), value);
        }
      }

      // Would the resulting active lane run keys belonging to the other lane?
      // (Includes the pre-lane case: legacy live keys under a `test` mode.)
      const merged: Record<string, string> = { ...raw };
      for (const [k, v] of pending) merged[k] = v;
      if (mode) merged["stripe.mode"] = mode;
      const next = resolveStripeConfig(merged);
      if (stripeLaneMismatch(next)) {
        const real = credentialLane(next.secretKey) ?? credentialLane(next.publishableKey);
        return c.json(
          {
            error: `The keys that would be active in ${next.mode} mode are ${real}-mode keys. Paste ${next.mode}-mode keys into the ${next.mode} lane first (or select ${real} mode).`,
            code: "mode_key_mismatch",
          },
          400,
        );
      }

      for (const [k, v] of pending) await setConfig(c.env.DB, k, v);
      /*
        Stripe product and price ids are PER-LANE objects, so the mode flip has
        to move them: park the old lane's ids and restore the new lane's BEFORE
        `stripe.mode` changes, so no window exists where the active lane points
        at the other lane's price ids. Tessa's copy of this route had no swap at
        all, which made its own console's live switch a payments outage.
      */
      let catalogSwapped = false;
      if (mode && mode !== current.mode) {
        const from = laneForMode(current.mode);
        const to = laneForMode(mode);
        if (from && to && from !== to) {
          await swapCatalogLane(c.env.DB, from, to);
          catalogSwapped = true;
        }
        await setConfig(c.env.DB, "stripe.mode", mode);
      }
      if (typeof body.platformFeeBps === "number" && Number.isInteger(body.platformFeeBps) && body.platformFeeBps >= 0 && body.platformFeeBps <= 10_000) {
        await setConfig(c.env.DB, "stripe.platform_fee_bps", String(body.platformFeeBps));
      }
      return c.json({ ok: true, catalogSwapped, status: stripeStatus(await getConfig(c.env.DB)) });
    })

    /**
     * Push plans and packs to Stripe as products and prices.
     *
     * The app's `syncCatalog` creates what is missing and reconciles the NAME of
     * what is already there — a rename does not move the price, so it never
     * invalidates the stored ids, and without that half a renamed plan keeps its
     * old name on every checkout page and invoice, permanently.
     *
     * `{ resyncPrices: true }` is the REPAIR, and it is deliberately a separate
     * request. An ordinary sync skips any row that already carries a
     * `stripe_price_id`, so a row whose Stripe price drifted some other way — a
     * price edited in the dashboard, a half-finished sync, an object deleted by
     * hand — reports "0 synced" while every checkout fails with "No such price".
     * The catalog looks synced and is not. This nulls the ids for the ACTIVE
     * rows and lets the sync recreate them at the current price, which mints NEW
     * prices: anyone already subscribed keeps their old one until they
     * re-subscribe. That is why the panel puts it behind a confirmation.
     */
    .post("/admin/stripe/sync", async (c) => {
      if (!cfg.isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
      const conf = await stripeConfig(c.env);
      if (!stripeEnabled(conf)) return c.json({ error: "stripe not configured" }, 400);
      const body = (await c.req.json().catch(() => ({}))) as { resyncPrices?: unknown };
      const rebuild = body?.resyncPrices === true;
      if (rebuild && !cfg.clearCatalogIds) {
        // Refused, not ignored. "0 rebuilt" reads as "nothing needed rebuilding".
        return c.json({ error: "this app has no price-rebuild path" }, 400);
      }
      if (cfg.seed) await cfg.seed(c.env.DB);
      let cleared = 0;
      let clearedPacks = 0;
      if (rebuild && cfg.clearCatalogIds) {
        const r = await cfg.clearCatalogIds(c.env.DB);
        cleared = r.cleared;
        clearedPacks = r.clearedPacks;
      }
      const result = await cfg.syncCatalog(c.env.DB, conf.secretKey);
      return c.json({ ok: true, cleared, clearedPacks, ...result });
    });
}
