/**
 * Dual test/live Stripe credential lanes (SPEC §7) on the Miniflare pool.
 *
 * The invariant these tests exist to protect: `stripe.mode` selects a LANE of
 * credentials (`stripe.<lane>.*`), the pre-lane unscoped keys (`stripe.secret_key`
 * …) still resolve as a per-credential fallback, and a half-swap — live secret key
 * with a test webhook secret — can no longer be created silently. A webhook that
 * fails signature verification is money captured with nothing granted, so lane
 * resolution is asserted THROUGH the real signature-verifying webhook routes, not
 * through a config getter.
 *
 * Sign-in helper + conventions copied from api.test.ts. The harness makes every
 * signed-in user a platform admin (ADMIN_EMAILS: "" + ENVIRONMENT: development),
 * so /api/admin/* is reachable; action-gate 403s are not testable here.
 */

import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";

const ORIGIN = "http://localhost:8787"; // treated as local by createAuth (non-secure cookies)
let adminCookie = "";

function grabCookies(res: Response): string {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  const raw = headers.getSetCookie?.() ?? [];
  return raw.map((c: string) => c.split(";")[0]).join("; ");
}

/** Full passwordless sign-in: request OTP, read it from D1, verify, create org. */
async function signInFlow(email: string, studioName: string): Promise<string> {
  const db = env.DB as D1Database;
  await SELF.fetch(`${ORIGIN}/api/auth/email-otp/send-verification-otp`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  const row = await db.prepare("SELECT value FROM verification WHERE identifier LIKE ? ORDER BY createdAt DESC LIMIT 1").bind(`%otp%${email}%`).first<{ value: string }>();
  const fallback = await db.prepare("SELECT value FROM verification ORDER BY createdAt DESC LIMIT 1").first<{ value: string }>();
  const otp = ((row?.value ?? fallback?.value ?? "").match(/\d{6}/) ?? [])[0];
  if (!otp) throw new Error("could not read OTP from verification table");
  const verify = await SELF.fetch(`${ORIGIN}/api/auth/sign-in/email-otp`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, otp }),
  });
  let cookies = grabCookies(verify);
  const org = await SELF.fetch(`${ORIGIN}/api/auth/organization/create`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, Cookie: cookies },
    body: JSON.stringify({ name: studioName, slug: studioName.toLowerCase().replace(/[^a-z0-9]+/g, "-") }),
  });
  const refreshed = grabCookies(org);
  if (refreshed) cookies = refreshed;
  return cookies;
}

const auth = (cookies: string) => ({ Cookie: cookies, origin: ORIGIN });
const jsonAuth = (cookies: string) => ({ "content-type": "application/json", ...auth(cookies) });

/** Stripe's `t=…,v1=…` header for a payload + signing secret. */
async function stripeSig(payload: string, secret: string): Promise<string> {
  const t = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `t=${t},v1=${hex}`;
}

let evtSeq = 0;
/** A side-effect-free platform event (unhandled type ⇒ the switch is a no-op),
 *  so a 200 means "this secret verified the signature" and nothing else. */
const platformEvent = () => JSON.stringify({ id: `evt_lane_${++evtSeq}_${Date.now()}`, type: "customer.updated", data: { object: {} } });
const connectEvent = () => JSON.stringify({ id: `evt_lane_c_${++evtSeq}_${Date.now()}`, account: "acct_lane_none", type: "account.updated", data: { object: {} } });

const postWebhook = async (path: string, payload: string, secret: string) =>
  SELF.fetch(`http://x${path}`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": await stripeSig(payload, secret) }, body: payload });

/** Verified by the platform rail with `secret`? (400 = bad signature.) */
const platformAccepts = async (secret: string) => (await postWebhook("/api/stripe/webhook", platformEvent(), secret)).status === 200;
/** Verified by the Connect rail with `secret`? */
const connectAccepts = async (secret: string) => (await postWebhook("/api/connect/webhook", connectEvent(), secret)).status === 200;

async function setCfg(entries: Record<string, string>): Promise<void> {
  const db = env.DB as D1Database;
  for (const [k, v] of Object.entries(entries)) {
    await db.prepare("INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(k, v).run();
  }
}

interface LaneStatus { secretKey: boolean; publishableKey: boolean; webhookSecret: boolean; connectWebhookSecret: boolean; complete: boolean; secretKeyLast4: string | null; secretKeyLane: string | null }
interface StatusBody {
  mode: string; enabled: boolean; activeLane: string; keyLane: string | null; laneMismatch: boolean;
  activeLaneComplete: boolean; connectWebhookMissing: boolean; connectWebhookFallback: boolean;
  lanes: { test: LaneStatus; live: LaneStatus }; legacy: LaneStatus;
  active: LaneStatus & { lane: string; sources: Record<string, string> }; platformFeeBps: number;
}

const getStatus = async (): Promise<StatusBody> =>
  (await (await SELF.fetch("http://x/api/admin/stripe/status", { headers: auth(adminCookie) })).json()) as StatusBody;

const postConfig = async (body: unknown) => SELF.fetch("http://x/api/admin/stripe/config", { method: "POST", headers: jsonAuth(adminCookie), body: JSON.stringify(body) });

beforeAll(async () => {
  await ensureSchema(env.DB as D1Database);
  adminCookie = await signInFlow("lanes-admin@test.dev", "Lane Studio");
});

// isolatedStorage (pool default) rolls back D1 writes between `it` blocks, so
// each test sets up the exact config shape it asserts on.
describe("stripe credential lanes — resolution", () => {
  it("legacy unscoped config still resolves (the live-deployment guarantee)", async () => {
    // Exactly the shape a deployment configured before lanes existed has.
    await setCfg({
      "stripe.mode": "test",
      "stripe.secret_key": "sk_test_legacy_1234",
      "stripe.publishable_key": "pk_test_legacy",
      "stripe.webhook_secret": "whsec_legacy_platform",
      "stripe.connect_webhook_secret": "whsec_legacy_connect",
    });
    expect(await platformAccepts("whsec_legacy_platform")).toBe(true);
    expect(await connectAccepts("whsec_legacy_connect")).toBe(true);

    const s = await getStatus();
    expect(s.mode).toBe("test");
    expect(s.enabled).toBe(true); // the legacy secret key still enables Stripe
    expect(s.activeLane).toBe("test");
    expect(s.active.sources).toMatchObject({ secretKey: "legacy", webhookSecret: "legacy", connectWebhookSecret: "legacy" });
    expect(s.legacy.complete).toBe(true);
    expect(s.lanes.test.secretKey).toBe(false); // nothing lane-scoped stored yet
    expect(s.activeLaneComplete).toBe(true);
    expect(s.connectWebhookMissing).toBe(false);
  });

  it("a lane-scoped value takes precedence over the legacy one", async () => {
    await setCfg({
      "stripe.mode": "test",
      "stripe.secret_key": "sk_test_legacy_1234",
      "stripe.webhook_secret": "whsec_legacy_platform",
      "stripe.connect_webhook_secret": "whsec_legacy_connect",
      "stripe.test.webhook_secret": "whsec_test_platform",
      "stripe.test.connect_webhook_secret": "whsec_test_connect",
    });
    expect(await platformAccepts("whsec_test_platform")).toBe(true);
    expect(await platformAccepts("whsec_legacy_platform")).toBe(false); // superseded
    expect(await connectAccepts("whsec_test_connect")).toBe(true);
    expect(await connectAccepts("whsec_legacy_connect")).toBe(false);

    const s = await getStatus();
    expect(s.active.sources.webhookSecret).toBe("lane");
    expect(s.active.sources.secretKey).toBe("legacy"); // per-credential fallback, not all-or-nothing
    expect(s.lanes.test.webhookSecret).toBe(true);
    expect(s.lanes.live.webhookSecret).toBe(false);
  });

  it("the Connect secret still falls back to the platform secret WITHIN the active lane", async () => {
    await setCfg({
      "stripe.mode": "test",
      "stripe.secret_key": "sk_test_x",
      "stripe.test.webhook_secret": "whsec_test_platform_only",
      "stripe.live.webhook_secret": "whsec_live_platform_only",
      "stripe.live.connect_webhook_secret": "whsec_live_connect",
    });
    expect(await connectAccepts("whsec_test_platform_only")).toBe(true); // in-lane fallback
    expect(await connectAccepts("whsec_live_platform_only")).toBe(false); // never the other lane
    expect(await connectAccepts("whsec_live_connect")).toBe(false);

    const s = await getStatus();
    expect(s.connectWebhookMissing).toBe(true); // the highest-consequence gap is reported
    expect(s.connectWebhookFallback).toBe(true);
  });

  it("flipping stripe.mode swaps which credentials are used, with no re-paste", async () => {
    await setCfg({
      "stripe.mode": "test",
      "stripe.test.secret_key": "sk_test_flip_1111",
      "stripe.test.publishable_key": "pk_test_flip",
      "stripe.test.webhook_secret": "whsec_test_flip",
      "stripe.test.connect_webhook_secret": "whsec_test_flip_connect",
      "stripe.live.secret_key": "sk_live_flip_2222",
      "stripe.live.publishable_key": "pk_live_flip",
      "stripe.live.webhook_secret": "whsec_live_flip",
      "stripe.live.connect_webhook_secret": "whsec_live_flip_connect",
    });
    expect(await platformAccepts("whsec_test_flip")).toBe(true);
    expect(await platformAccepts("whsec_live_flip")).toBe(false);
    expect((await getStatus()).keyLane).toBe("test");

    // The flip: ONE request that carries no credentials at all.
    const flip = await postConfig({ mode: "live" });
    expect(flip.status).toBe(200);

    const s = await getStatus();
    expect(s.mode).toBe("live");
    expect(s.activeLane).toBe("live");
    expect(s.keyLane).toBe("live");
    expect(s.laneMismatch).toBe(false);
    expect(s.activeLaneComplete).toBe(true);
    expect(s.active.secretKeyLast4).toBe("2222"); // the live key, not the test one
    expect(await platformAccepts("whsec_live_flip")).toBe(true);
    expect(await platformAccepts("whsec_test_flip")).toBe(false);
    expect(await connectAccepts("whsec_live_flip_connect")).toBe(true);
    expect(await connectAccepts("whsec_test_flip_connect")).toBe(false);
  });
});

describe("stripe credential lanes — mode/key honesty", () => {
  it("status reports a mode/key mismatch instead of leaving it inferred", async () => {
    // The dangerous pre-lane shape: live keys filed under a `test` label.
    await setCfg({ "stripe.mode": "test", "stripe.secret_key": "sk_live_real_9876", "stripe.publishable_key": "pk_live_real" });
    const s = await getStatus();
    expect(s.mode).toBe("test");
    expect(s.keyLane).toBe("live"); // derived from the prefix, a distinct fact
    expect(s.laneMismatch).toBe(true);
    expect(s.legacy.secretKeyLane).toBe("live");
  });

  it("refuses to store a live key in the test lane (and the reverse)", async () => {
    await setCfg({ "stripe.mode": "test" });
    const bad = await postConfig({ lanes: { test: { secretKey: "sk_live_should_not_land" } } });
    expect(bad.status).toBe(400);
    expect((await bad.json() as { code?: string }).code).toBe("lane_mismatch");
    expect((await getStatus()).lanes.test.secretKey).toBe(false); // nothing written

    const bad2 = await postConfig({ lane: "live", publishableKey: "pk_test_should_not_land" });
    expect(bad2.status).toBe(400);
    expect((await getStatus()).lanes.live.publishableKey).toBe(false);
  });

  it("refuses a mode whose active keys belong to the other lane", async () => {
    await setCfg({ "stripe.mode": "disabled", "stripe.secret_key": "sk_live_real_9876" });
    const refused = await postConfig({ mode: "test" });
    expect(refused.status).toBe(400);
    expect((await refused.json() as { code?: string }).code).toBe("mode_key_mismatch");
    expect((await getStatus()).mode).toBe("disabled"); // the mode did not move

    // Pasting matching test-lane keys in the same request makes it legal.
    const ok = await postConfig({ mode: "test", lanes: { test: { secretKey: "sk_test_ok_4321", publishableKey: "pk_test_ok" } } });
    expect(ok.status).toBe(200);
    const s = await getStatus();
    expect(s.mode).toBe("test");
    expect(s.keyLane).toBe("test");
    expect(s.laneMismatch).toBe(false);
    expect(s.active.sources.secretKey).toBe("lane"); // the lane value wins over legacy
  });

  it("rejects a wrong-slot paste by prefix", async () => {
    const r = await postConfig({ lanes: { test: { webhookSecret: "sk_test_not_a_signing_secret" } } });
    expect(r.status).toBe(400);
    expect((await r.json() as { code?: string }).code).toBe("invalid_prefix");
  });
});

describe("stripe credential lanes — /admin/stripe/status is secret-free", () => {
  it("never returns a key or a whsec_, while reporting lane + presence", async () => {
    await setCfg({
      "stripe.mode": "live",
      "stripe.secret_key": "sk_live_legacy_secret_value",
      "stripe.live.secret_key": "sk_live_lane_secret_value_abcd",
      "stripe.live.publishable_key": "pk_live_lane_value",
      "stripe.live.webhook_secret": "whsec_live_platform_value",
      "stripe.live.connect_webhook_secret": "whsec_live_connect_value",
      "stripe.test.secret_key": "sk_test_lane_secret_value_wxyz",
      "stripe.platform_fee_bps": "250",
    });
    const res = await SELF.fetch("http://x/api/admin/stripe/status", { headers: auth(adminCookie) });
    expect(res.status).toBe(200);
    const text = await res.text();
    for (const secret of [
      "sk_live_lane_secret_value_abcd",
      "sk_live_legacy_secret_value",
      "sk_test_lane_secret_value_wxyz",
      "whsec_live_platform_value",
      "whsec_live_connect_value",
      "pk_live_lane_value",
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toContain("whsec_");
    expect(text).not.toContain("sk_live_");
    expect(text).not.toContain("sk_test_");

    const s = JSON.parse(text) as StatusBody;
    expect(s.mode).toBe("live");
    expect(s.activeLane).toBe("live");
    expect(s.keyLane).toBe("live");
    expect(s.laneMismatch).toBe(false);
    expect(s.activeLaneComplete).toBe(true);
    expect(s.active.secretKeyLast4).toBe("abcd"); // a 4-char hint is the most it gives
    expect(s.lanes.live).toMatchObject({ secretKey: true, publishableKey: true, webhookSecret: true, connectWebhookSecret: true, complete: true });
    expect(s.lanes.test).toMatchObject({ secretKey: true, publishableKey: false, complete: false });
    expect(s.legacy.secretKey).toBe(true);
    expect(s.platformFeeBps).toBe(250);
  });
});

describe("stripe credential lanes — catalog ids are lane-scoped", () => {
  it("a flip parks the current lane's product/price ids and restores the other lane's", async () => {
    const db = env.DB as D1Database;
    await setCfg({
      "stripe.mode": "test",
      "stripe.test.secret_key": "sk_test_cat_1111",
      "stripe.live.secret_key": "sk_live_cat_2222",
    });
    await db.prepare("INSERT INTO plans (id, name, price_usd_month, entitlements_json, stripe_product_id, stripe_price_id, ord, active) VALUES ('plan_lane', 'Lane', 10, NULL, 'prod_test_1', 'price_test_1', 9, 1) ON CONFLICT(id) DO UPDATE SET stripe_product_id = 'prod_test_1', stripe_price_id = 'price_test_1'").run();
    await db.prepare("INSERT INTO credit_packs (id, name, credits, price_usd, stripe_product_id, stripe_price_id, ord, active) VALUES ('pack_lane', 'Lane pack', 100, 5, 'prod_test_p', 'price_test_p', 9, 1) ON CONFLICT(id) DO UPDATE SET stripe_product_id = 'prod_test_p', stripe_price_id = 'price_test_p'").run();

    const ids = async () => ({
      plan: (await db.prepare("SELECT stripe_price_id AS v FROM plans WHERE id = 'plan_lane'").first<{ v: string | null }>())?.v ?? null,
      pack: (await db.prepare("SELECT stripe_price_id AS v FROM credit_packs WHERE id = 'pack_lane'").first<{ v: string | null }>())?.v ?? null,
    });

    const flip = await postConfig({ mode: "live" });
    expect(flip.status).toBe(200);
    expect((await flip.json() as { catalogSwapped?: boolean }).catalogSwapped).toBe(true);
    // Test-lane ids are meaningless against a live key, so they must not linger.
    expect(await ids()).toEqual({ plan: null, pack: null });

    // Pretend the live lane got synced, then flip back: each lane keeps its own.
    await db.prepare("UPDATE plans SET stripe_product_id = 'prod_live_1', stripe_price_id = 'price_live_1' WHERE id = 'plan_lane'").run();
    const back = await postConfig({ mode: "test" });
    expect(back.status).toBe(200);
    expect((await ids()).plan).toBe("price_test_1"); // the test lane's own id came back

    const forward = await postConfig({ mode: "live" });
    expect(forward.status).toBe(200);
    expect((await ids()).plan).toBe("price_live_1");
  });
});
