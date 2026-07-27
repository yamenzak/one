/**
 * Helpers for `stripe-live.test.ts` — the ONLY suite in this repo that talks to
 * the real Stripe API.
 *
 * Everything here is deliberately dumb and version-explicit. The point of the
 * live suite is to observe what Stripe actually returns, so these helpers must
 * not normalise, default, or "fix" a payload on the way through: a test that
 * asserts against a helper's tidied-up view of Stripe proves nothing about the
 * shapes `stripe-routes.ts` really receives.
 *
 * ── Credentials ────────────────────────────────────────────────────────────
 * The secret key arrives as the worker binding `STRIPE_TEST_SECRET_KEY`,
 * threaded from the shell in `vitest.config.ts` (a Workers-pool test cannot read
 * `process.env`). Absent ⇒ the suite skips. Present but not `sk_test_` ⇒ the
 * suite FAILS rather than runs: a live key must never be exercised by a test.
 * No key value is ever logged, asserted on, or written to a file.
 */

import { env } from "cloudflare:test";
import { STRIPE_API_VERSION } from "../src/stripe.js";

/** The pin `stripe.ts` puts on every request Mossa makes. */
export const PINNED_VERSION = STRIPE_API_VERSION;

/** The secret key, or "" when the suite should skip. Never log this. */
export const LIVE_KEY = ((env as unknown as Record<string, string | undefined>).STRIPE_TEST_SECRET_KEY ?? "").trim();

/** A key is present at all (test-mode or not). */
export const HAS_KEY = LIVE_KEY.length > 0;

/** A key is present AND is a test-mode secret key — the only case that may run. */
export const IS_TEST_KEY = /^sk_test_/.test(LIVE_KEY);

/** A key is present but is NOT test-mode. The suite must fail loudly, not skip. */
export const WRONG_LANE_KEY = HAS_KEY && !IS_TEST_KEY;

export interface StripeReply<T = Record<string, unknown>> {
  status: number;
  /** The parsed body. Error replies land here too — nothing throws. */
  json: T & { error?: { message?: string; code?: string; param?: string; type?: string } };
  /** `stripe-version` echoes the version Stripe actually served the reply at. */
  servedVersion: string | null;
  requestId: string | null;
}

const encodeForm = (obj: Record<string, string | number | undefined>): string => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) p.append(k, String(v));
  return p.toString();
};

/**
 * A raw, non-throwing Stripe call. Deliberately NOT `stripeCall` from
 * `src/stripe.ts`: this one surfaces the status, the error body and the served
 * API version, which is exactly what the version-drift and negative-path tests
 * need. Tests that are asserting *our client's* behaviour import `stripeCall`
 * instead — both appear in this suite on purpose.
 *
 * `version: null` sends NO `Stripe-Version` header, so Stripe answers at the
 * ACCOUNT DEFAULT — the only way to observe drift against the pin.
 */
export async function rawStripe<T = Record<string, unknown>>(
  path: string,
  opts: {
    body?: Record<string, string | number | undefined>;
    /** Explicit version, or `null` for "whatever the account defaults to". */
    version?: string | null;
    account?: string;
    method?: "GET" | "POST" | "DELETE";
  } = {},
): Promise<StripeReply<T>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${LIVE_KEY}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (opts.version !== null) headers["Stripe-Version"] = opts.version ?? PINNED_VERSION;
  if (opts.account) headers["Stripe-Account"] = opts.account;
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers,
    body: opts.body ? encodeForm(opts.body) : undefined,
  });
  return {
    status: res.status,
    json: (await res.json()) as StripeReply<T>["json"],
    servedVersion: res.headers.get("stripe-version"),
    requestId: res.headers.get("request-id"),
  };
}

/** Throwing variant for setup steps where a failure is a broken test, not a finding. */
export async function must<T = Record<string, unknown>>(
  path: string,
  opts?: Parameters<typeof rawStripe>[1],
): Promise<T & Record<string, unknown>> {
  const r = await rawStripe<T>(path, opts);
  if (r.status >= 300) throw new Error(`stripe ${path} → ${r.status} ${r.json.error?.message ?? ""}`);
  return r.json as T & Record<string, unknown>;
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Poll until `pick` returns something truthy. Used for the two things Stripe
 * genuinely does asynchronously: a test clock reaching `ready`, and an event
 * landing in `/v1/events`. This is NOT "sleeping through a trial" — the clock
 * does the time travel; we only wait for Stripe's own job queue.
 */
export async function pollFor<T>(label: string, pick: () => Promise<T | null | undefined>, opts: { timeoutMs?: number; intervalMs?: number } = {}): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const intervalMs = opts.intervalMs ?? 2_000;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const got = await pick();
    if (got) return got;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label} after ${timeoutMs}ms`);
    await sleep(intervalMs);
  }
}

export interface StripeEvent {
  id: string;
  type: string;
  /** The API version the event payload is RENDERED at — the account default (or
   *  the webhook endpoint's pin), never the version of the request that reads it. */
  api_version: string;
  created: number;
  /** Present on Connect events: the connected account the event fired for. */
  account?: string;
  data: { object: Record<string, unknown> };
}

/**
 * Events, newest first. `account` scopes the list to a CONNECTED account, which
 * is the only way to read Connect events over the API — the platform's own
 * `/v1/events` list does not contain them (verified), even though a real Connect
 * webhook delivery carries them with `event.account` set.
 */
export async function listEvents(opts: { types?: string[]; account?: string; limit?: number } = {}): Promise<StripeEvent[]> {
  const q = new URLSearchParams();
  q.set("limit", String(opts.limit ?? 100));
  for (const t of opts.types ?? []) q.append("types[]", t);
  const r = await rawStripe<{ data?: StripeEvent[] }>(`events?${q.toString()}`, { account: opts.account });
  return r.json.data ?? [];
}

/** Wait for the first event matching `match`. */
export async function waitForEvent(match: (e: StripeEvent) => boolean, opts: { types?: string[]; account?: string; timeoutMs?: number } = {}): Promise<StripeEvent> {
  return pollFor(`event ${opts.types?.join("|") ?? "*"}`, async () => (await listEvents({ types: opts.types, account: opts.account })).find(match), { timeoutMs: opts.timeoutMs });
}

/** Oldest-first, so an assertion about ORDER reads the way Stripe emitted it. */
export const chronological = (events: StripeEvent[]): StripeEvent[] => [...events].sort((a, b) => a.created - b.created);

/** A card PaymentMethod built from a Stripe test token, optionally on a
 *  connected account. `token` may be a dispute-triggering token. */
export async function testCardPm(token = "tok_visa", account?: string): Promise<string> {
  const pm = await must<{ id: string }>("payment_methods", { body: { type: "card", "card[token]": token }, account });
  return pm.id;
}

/** Advance a test clock and wait for Stripe to finish replaying the timeline. */
export async function advanceClock(clockId: string, toUnix: number): Promise<void> {
  const adv = await rawStripe<{ status?: string }>(`test_helpers/test_clocks/${clockId}/advance`, { body: { frozen_time: toUnix } });
  if (adv.status >= 300) throw new Error(`clock advance failed: ${adv.json.error?.message}`);
  await pollFor(
    `test clock ${clockId} ready`,
    async () => {
      const c = await rawStripe<{ status?: string }>(`test_helpers/test_clocks/${clockId}`);
      if (c.json.status === "internal_failure") throw new Error("test clock reported internal_failure");
      return c.json.status === "ready" ? true : null;
    },
    { timeoutMs: 180_000, intervalMs: 2_000 },
  );
}

// ── Webhook signatures ──────────────────────────────────────────────────────

/**
 * Build a `Stripe-Signature` header the way Stripe DOCUMENTS it: `t=<unix>` plus
 * one or more `v1=<hex hmac-sha256 of "<t>.<payload>">` entries, keyed by the
 * endpoint signing secret.
 *
 * ⚠️ CONSTRUCTED, NOT DELIVERED. Getting a signature Stripe itself produced
 * requires Stripe to reach a public URL (a real endpoint delivery or `stripe
 * listen` forwarding), and this environment has neither an inbound tunnel nor
 * the Stripe CLI. So the *scheme* is exercised against real event JSON, and the
 * bytes are ours. What that still proves: `verifyWebhook` accepts the documented
 * header format over a real, unmodified Stripe payload (including its exact
 * whitespace and unicode escaping), and rejects a wrong secret, a stale
 * timestamp, and a missing `v1`. What it cannot prove: that Stripe's real header
 * contains nothing else we would choke on.
 */
export async function signWebhook(payload: string, secret: string, opts: { timestamp?: number; extraSecrets?: string[] } = {}): Promise<string> {
  const t = opts.timestamp ?? Math.floor(Date.now() / 1000);
  const parts = [`t=${t}`];
  for (const s of [secret, ...(opts.extraSecrets ?? [])]) parts.push(`v1=${await hmacHex(s, `${t}.${payload}`)}`);
  return parts.join(",");
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

type Junk =
  | { kind: "test_clock"; id: string }
  | { kind: "account"; id: string }
  | { kind: "customer"; id: string }
  | { kind: "subscription"; id: string }
  | { kind: "price"; id: string }
  | { kind: "product"; id: string };

const junk: Junk[] = [];
export const trackJunk = (item: Junk): void => void junk.push(item);

/**
 * Best-effort teardown, in dependency order. Test clocks take their customers
 * (and those customers' subscriptions and invoices) with them. Prices cannot be
 * deleted in Stripe at all, and a product with prices cannot either — both are
 * ARCHIVED (`active: false`) instead, which is the closest thing Stripe offers.
 * Charges, refunds, disputes, PaymentIntents and Events are permanent by design
 * and are deliberately left behind in the sandbox.
 */
export async function cleanupJunk(): Promise<string[]> {
  const notes: string[] = [];
  const order: Junk["kind"][] = ["subscription", "test_clock", "customer", "account", "price", "product"];
  for (const kind of order) {
    for (const item of junk.filter((j) => j.kind === kind)) {
      const r =
        kind === "test_clock"
          ? await rawStripe(`test_helpers/test_clocks/${item.id}`, { method: "DELETE" })
          : kind === "price"
            ? await rawStripe(`prices/${item.id}`, { body: { active: "false" } })
            : kind === "product"
              ? await rawStripe(`products/${item.id}`, { body: { active: "false" } })
              : await rawStripe(`${kind}s/${item.id}`, { method: "DELETE" });
      if (r.status >= 300) notes.push(`${kind} ${item.id}: ${r.status} ${r.json.error?.message ?? ""}`);
    }
  }
  junk.length = 0;
  return notes;
}
