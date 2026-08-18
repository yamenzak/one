/**
 * SOMETHING TAKES A CARD.
 *
 * ⚠️ WE ARE NOT IN THE MONEY PATH, AND THAT IS THE DESIGN. Nothing here holds a
 * card number, a CVC or a 3-D Secure result. A workspace is sent to a page
 * Stripe owns and we learn the outcome from a SIGNED notification — so the
 * tokenisation, the SCA dance and the retries stay with the people who are
 * regulated to do them.
 *
 * ⚠️ THE PRICE IS BUILT FROM THE MANIFEST, NOT SYNCED TO A CATALOGUE. A plan is a
 * declaration; syncing it to Stripe means a second copy of every price, a job to
 * reconcile them, and a window where an edited plan sells the old number. Inline
 * `price_data` has one price — the declared one — and an edit takes effect on
 * the next checkout rather than on the next sync.
 *
 * ⚠️ AN UNSIGNED WEBHOOK IS ANYBODY CLAIMING A PAYMENT LANDED. The endpoint is
 * public by construction, so verification is not a hardening step: without the
 * signature this route is a way for a stranger to mark any workspace paid. A
 * deployment with no webhook secret REFUSES every event rather than trusting
 * them.
 *
 * ⚠️ AND AN EVENT WE CANNOT ATTRIBUTE IS RECORDED, NEVER DROPPED. Answering one
 * `200 {received: true}` with its id already claimed means Stripe never retries:
 * money captured, nothing granted, and no trace anywhere that it happened. The
 * row is the trace, and it is readable.
 */

import type { AppId, Instant, PackDef, PlanSpec, TenantId } from "@engine/kernel";
import { MEMBERSHIP as MEMBERSHIP_APP } from "./billing.js";
import { configOf } from "./config.js";
import type { SchemaModule } from "./schema.js";
import type { Db } from "./sql.js";

/* ----------------------------------------------------------------- schema --- */

export const STRIPE_SCHEMA: SchemaModule = {
  id: "stripe",
  statements: [
    /*
      ⚠️ EVERY VERIFIED EVENT, ONCE. Stripe retries — that is the contract, and
      it is what makes delivery reliable — so an event applied twice is a month
      granted twice. The primary key is the whole of the idempotency.

      ⚠️ AND `why` IS WHY IT WAS NOT APPLIED. A dead letter nobody can read is
      the same silent success with an extra table.
    */
    `CREATE TABLE IF NOT EXISTS stripe_event (id TEXT PRIMARY KEY, kind TEXT NOT NULL, tenant_id TEXT, app_id TEXT, at TEXT NOT NULL, why TEXT);`,
    `CREATE INDEX IF NOT EXISTS ix_stripe_event_parked ON stripe_event (why, at);`,
  ],
};

/* ------------------------------------------------------------- the signature --- */

const enc = new TextEncoder();

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

/**
 * ⚠️ CONSTANT TIME, because the comparison is against a value an attacker
 * supplies and can vary a byte at a time. `a === b` on a signature leaks how
 * much of a guess was right, which is the whole of a forgery attack given
 * enough attempts — and this endpoint accepts as many as anybody likes.
 */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/** ⚠️ Five minutes, which is Stripe's own tolerance. A replay of a captured
    request is otherwise valid for as long as the secret is. */
export const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

export type SignatureRefusal = "no_secret" | "malformed" | "too_old" | "wrong";

/**
 * Whether this body really came from Stripe.
 *
 * ⚠️ THE RAW BODY, NOT A PARSED ONE. The signature covers the bytes; re-encoding
 * a parsed object changes key order and whitespace, and every event then fails
 * verification for a reason nothing in the error says.
 */
export async function verifySignature(
  secret: string | null, header: string | null, raw: string, now: Date,
): Promise<null | SignatureRefusal> {
  if (!secret) return "no_secret";
  if (!header) return "malformed";

  const parts = Object.fromEntries(
    header.split(",").map((p) => p.split("=", 2)).filter((p) => p.length === 2) as [string, string][]);
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return "malformed";

  const stamped = Number(t) * 1000;
  if (!Number.isFinite(stamped)) return "malformed";
  if (Math.abs(now.getTime() - stamped) > SIGNATURE_TOLERANCE_MS) return "too_old";

  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${raw}`));
  return same(hex(mac), v1) ? null : "wrong";
}

/* ---------------------------------------------------------------- the client --- */

export interface StripeDeps {
  readonly directory: Db;
  readonly configSecret?: string;
}

const KEY = "stripe.secret_key";
const WEBHOOK = "stripe.webhook_secret";

export const stripeKey = (deps: StripeDeps): Promise<string | null> =>
  configOf(deps.directory, deps.configSecret, KEY);

export const webhookSecret = (deps: StripeDeps): Promise<string | null> =>
  configOf(deps.directory, deps.configSecret, WEBHOOK);

/**
 * ⚠️ FORM-ENCODED AND NESTED, WHICH IS STRIPE'S WIRE FORMAT AND NOT A CHOICE.
 * `a[b][c]=d` is how a nested object is expressed; sending JSON gets a 400 that
 * says nothing about why.
 */
function form(into: URLSearchParams, value: unknown, prefix = ""): URLSearchParams {
  if (value === null || value === undefined) return into;
  if (Array.isArray(value)) {
    value.forEach((v, i) => form(into, v, `${prefix}[${i}]`));
    return into;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      form(into, v, prefix ? `${prefix}[${k}]` : k);
    }
    return into;
  }
  into.append(prefix, String(value));
  return into;
}

export type CheckoutRefusal = "not_charging" | "free_plan" | "stripe_refused";

export interface Checkout {
  readonly url: string;
}

/**
 * A PAGE STRIPE OWNS, FOR ONE WORKSPACE AND ONE PLAN.
 *
 * ⚠️ THE WORKSPACE AND THE PRODUCT TRAVEL IN THE METADATA, and that is what
 * makes the answer attributable. Without them the webhook arrives carrying a
 * customer we have never seen and a payment nobody can place, which is the
 * `unattributable` row this module exists to avoid producing.
 *
 * ⚠️ AND A FREE PLAN IS REFUSED RATHER THAN CHARGED FOR ZERO. Stripe answers a
 * zero-amount subscription with a session that completes and bills nothing — so
 * the workspace lands in a paid state it never paid for, and the parking plan it
 * should have been on is the one thing nothing recorded.
 */
export async function startCheckout(
  deps: StripeDeps,
  ask: {
    readonly tenantId: TenantId;
    readonly appId: AppId;
    readonly plan: PlanSpec;
    readonly email: string | null;
    /**
     * ⚠️ PRESENT ONLY FOR A COMMERCIAL TIER, and it travels so the workspace's
     * KIND and its plan land from the same signed event. Two events would be a
     * window in which somebody has paid for a business and does not have one.
     */
    readonly legalName?: string;
    readonly successUrl: string;
    readonly cancelUrl: string;
  },
): Promise<Checkout | CheckoutRefusal> {
  const key = await stripeKey(deps);
  if (!key) return "not_charging";
  if (ask.plan.price <= 0) return "free_plan";

  const meta = {
    tenant: ask.tenantId, app: ask.appId, plan: ask.plan.id,
    ...(ask.legalName ? { legalName: ask.legalName } : {}),
  };

  const body = form(new URLSearchParams(), {
    mode: "subscription",
    success_url: ask.successUrl,
    cancel_url: ask.cancelUrl,
    ...(ask.email ? { customer_email: ask.email } : {}),
    line_items: [{
      quantity: 1,
      price_data: {
        currency: ask.plan.currency.toLowerCase(),
        unit_amount: ask.plan.price,
        recurring: { interval: "month" },
        product_data: { name: ask.plan.name },
      },
    }],
    /* ⚠️ ON THE SESSION AND ON THE SUBSCRIPTION, AND IT IS ONE OBJECT RATHER
       THAN TWO SPREADS. A session's metadata does not travel to the invoices
       that follow it, so a renewal a year later would arrive with nothing on it
       but a customer id — and writing `subscription_data` twice in one literal
       silently keeps the second, which is how the trial once took the metadata
       with it. */
    metadata: meta,
    subscription_data: {
      metadata: meta,
      ...(ask.plan.trialDays ? { trial_period_days: ask.plan.trialDays } : {}),
    },
  });

  const said = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  }).catch(() => null);

  if (!said?.ok) return "stripe_refused";
  const made = await said.json().catch(() => null) as { url?: string } | null;
  return made?.url ? { url: made.url } : "stripe_refused";
}

/**
 * A ONE-OFF PURCHASE: CREDITS, PAID FOR ONCE.
 *
 * ⚠️ `mode: "payment"`, NOT `"subscription"`, AND THAT IS THE WHOLE DIFFERENCE.
 * A pack is bought, not rented — sending it down the subscription lane would
 * charge for it again every month, which is the sort of mistake that is
 * discovered by the customer.
 *
 * ⚠️ AND THE PACK TRAVELS IN THE METADATA RATHER THAN THE CREDITS. What arrives
 * back is an id we look up in our own catalogue; a credit COUNT in the metadata
 * would be a number the round trip could carry, and a round trip through the
 * customer's browser is a number the customer can edit.
 */
export async function startTopUp(
  deps: StripeDeps,
  ask: {
    readonly tenantId: TenantId;
    readonly pack: PackDef;
    readonly email: string | null;
    readonly successUrl: string;
    readonly cancelUrl: string;
  },
): Promise<Checkout | CheckoutRefusal> {
  const key = await stripeKey(deps);
  if (!key) return "not_charging";
  if (ask.pack.price <= 0 || ask.pack.credits <= 0) return "free_plan";

  const meta = { tenant: ask.tenantId, app: MEMBERSHIP_APP, pack: ask.pack.id };
  const body = form(new URLSearchParams(), {
    mode: "payment",
    success_url: ask.successUrl,
    cancel_url: ask.cancelUrl,
    ...(ask.email ? { customer_email: ask.email } : {}),
    line_items: [{
      quantity: 1,
      price_data: {
        currency: ask.pack.currency.toLowerCase(),
        unit_amount: ask.pack.price,
        product_data: { name: ask.pack.name },
      },
    }],
    metadata: meta,
    /* ⚠️ ON THE PAYMENT INTENT TOO. A one-off has no subscription to carry our
       metadata forward, so a refund or a dispute arriving months later would
       reach us as a payment nobody can place. */
    payment_intent_data: { metadata: meta },
  });

  const said = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  }).catch(() => null);

  if (!said?.ok) return "stripe_refused";
  const made = await said.json().catch(() => null) as { url?: string } | null;
  return made?.url ? { url: made.url } : "stripe_refused";
}

/**
 * THE STANDING INSTRUCTION, CARRIED OUT: A CHARGE WITH NOBODY PRESENT.
 *
 * ⚠️ `off_session: true` IS A CLAIM AND STRIPE ACTS ON IT. It tells the card
 * network that the customer authorised this in advance, which is what lets the
 * charge go through without a browser to show a 3-D Secure challenge in — and it
 * is only true because somebody armed it themselves. It is also why a refusal
 * here is ordinary rather than exceptional: a bank may still demand
 * authentication, and the answer is to tell the customer, never to retry.
 *
 * ⚠️ AND `auto` IN THE METADATA IS LOAD-BEARING. A pack bought through the
 * hosted checkout ALSO produces a `payment_intent.succeeded`, so without a mark
 * distinguishing the two, every checkout would grant its credits twice — once
 * from the session and once from the intent, under different event ids that no
 * idempotency row can join.
 */
export type ChargeRefusal = "not_charging" | "declined";

export async function chargeOffSession(
  deps: StripeDeps,
  ask: {
    readonly tenantId: TenantId;
    readonly customerRef: string;
    readonly pack: PackDef;
  },
): Promise<{ readonly id: string } | ChargeRefusal> {
  const key = await stripeKey(deps);
  if (!key) return "not_charging";

  const body = form(new URLSearchParams(), {
    amount: ask.pack.price,
    currency: ask.pack.currency.toLowerCase(),
    customer: ask.customerRef,
    confirm: true,
    off_session: true,
    description: ask.pack.name,
    metadata: { tenant: ask.tenantId, pack: ask.pack.id, auto: "1" },
  });

  const said = await fetch("https://api.stripe.com/v1/payment_intents", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  }).catch(() => null);

  if (!said?.ok) return "declined";
  const made = await said.json().catch(() => null) as { id?: string; status?: string } | null;
  /* ⚠️ 200 IS NOT SUCCESS. Stripe answers `requires_action` with a perfectly
     ordinary 200 and a payment that has not happened — reading the HTTP status
     alone would grant credits for a charge the bank is still waiting on. */
  if (made?.status !== "succeeded" || !made.id) return "declined";
  return { id: made.id };
}

/* ------------------------------------------------------------------ events --- */

export interface Event {
  readonly id: string;
  readonly type: string;
  readonly data: { readonly object: Record<string, unknown> };
}

export type EventOutcome =
  | { readonly did: "already" }
  | { readonly did: "ignored" }
  | { readonly did: "parked"; readonly why: string }
  | { readonly did: "applied"; readonly tenantId: TenantId; readonly appId: AppId };

/** Where an event says which workspace it is about, when it says so at all. */
const metaOf = (o: Record<string, unknown>): { tenant?: string; app?: string } => {
  const meta = (o.metadata ?? {}) as Record<string, unknown>;
  return { tenant: meta.tenant as string | undefined, app: meta.app as string | undefined };
};

/**
 * ⚠️ THE CUSTOMER IS THE FALLBACK, AND IT IS LOAD-BEARING. A renewal invoice
 * often carries no metadata of ours at all — it was made by Stripe from a
 * subscription, months later — so without this lookup every month after the
 * first is unattributable.
 */
async function tenantByCustomer(db: Db, customer: string): Promise<TenantId | null> {
  const row = await db.prepare(`SELECT tenant_id FROM billing_account WHERE customer_ref = ?`)
    .bind(customer).first<{ tenant_id: string }>();
  return (row?.tenant_id as TenantId | undefined) ?? null;
}

export async function noteCustomer(
  db: Db, tenantId: TenantId, customer: string, currency: string, now = new Date(),
): Promise<void> {
  await db.prepare(
    `INSERT INTO billing_account (tenant_id, customer_ref, currency, granted, bought, held, at)
     VALUES (?, ?, ?, 0, 0, 0, ?)
     ON CONFLICT(tenant_id) DO UPDATE SET customer_ref = excluded.customer_ref`)
    .bind(tenantId, customer, currency, now.toISOString()).run();
}

/** ⚠️ What the ladder needs done, handed in — see `applyEvent`. */
export interface Ladder {
  subscribe(tenantId: TenantId, appId: AppId, planId: string): Promise<void>;
  paid(tenantId: TenantId, appId: AppId): Promise<void>;
  pastDue(tenantId: TenantId, appId: AppId): Promise<void>;
  cancelled(tenantId: TenantId, appId: AppId): Promise<void>;
  /**
   * ⚠️ A ONE-OFF PURCHASE, AND IT CARRIES THE EVENT ID. The credits land in the
   * ledger against it, so the same money can be traced from a Stripe dashboard
   * to a balance — and a duplicate delivery is already a no-op above.
   */
  bought(tenantId: TenantId, packId: string, ref: string): Promise<void>;
  /** ⚠️ The one-way door, opened by the payment that bought a commercial tier. */
  becameBusiness(tenantId: TenantId, legalName: string): Promise<void>;
}

/**
 * ⚠️ EVERY EVENT IS RECORDED, INCLUDING THE ONES WE IGNORE. Which types a
 * deployment acts on changes; what arrived does not, and a row saying "we saw
 * this and did nothing on purpose" is the difference between a quiet integration
 * and one nobody can audit.
 */
async function note(
  db: Db, event: Event, at: Instant,
  found: { tenantId?: TenantId; appId?: AppId; why?: string },
): Promise<void> {
  await db.prepare(
    `INSERT INTO stripe_event (id, kind, tenant_id, app_id, at, why) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`)
    .bind(event.id, event.type, found.tenantId ?? null, found.appId ?? null,
      at, found.why ?? null).run();
}

/** The types this deployment acts on. Anything else is recorded and ignored. */
const ACTED_ON = new Set([
  "checkout.session.completed",
  /* ⚠️ AND THE OFF-SESSION CHARGE, WHICH HAS NO SESSION TO REPORT IT. See the
     `auto` mark below: only an intent this deployment raised itself is acted
     on here, because a hosted checkout's intent is already answered by its
     session and acting on both grants the same pack twice. */
  "payment_intent.succeeded",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.deleted",
]);

/**
 * ONE VERIFIED EVENT, APPLIED ONCE.
 *
 * ⚠️ THE IDEMPOTENCY IS THE ROW, AND IT IS WRITTEN BEFORE THE WORK. Stripe
 * retries by design; a second delivery that re-ran the ladder would grant a
 * second month, and `INSERT … ON CONFLICT DO NOTHING` is what makes the second
 * one a no-op rather than a duplicate.
 */
export async function applyEvent(
  db: Db, event: Event, ladder: Ladder, now = new Date(),
): Promise<EventOutcome> {
  const at = now.toISOString() as Instant;

  const seen = await db.prepare(`SELECT id FROM stripe_event WHERE id = ?`)
    .bind(event.id).first<{ id: string }>();
  if (seen) return { did: "already" };

  if (!ACTED_ON.has(event.type)) {
    await note(db, event, at, { why: "not_acted_on" });
    return { did: "ignored" };
  }

  const o = event.data.object;
  const meta = metaOf(o);
  const customer = typeof o.customer === "string" ? o.customer : null;

  const tenantId = (meta.tenant as TenantId | undefined)
    ?? (customer ? await tenantByCustomer(db, customer) : null);

  /*
    ⚠️ THE APP IS THE MEMBERSHIP, AND THERE IS NOTHING ELSE IT COULD BE. Every
    row this drives is the workspace's — one subscription, one wallet — so an
    event that names a tenant is fully attributed. This used to park on a missing
    app, which the membership migration turned into a trap: `MEMBERSHIP` is the
    empty string, so every plan checkout arrived carrying `app=""`, was read as
    absent, and was parked instead of granting the month somebody had just paid
    for.
  */
  const appId = MEMBERSHIP_APP;

  /*
    ⚠️ PARKED, NOT DROPPED, AND NOT RETRIED FOREVER EITHER. Stripe cannot fix an
    attribution problem by sending the same event again, so answering 500 would
    be days of retries and a queue nobody drains. The row is what somebody reads.
  */
  if (!tenantId) {
    await note(db, event, at, { why: "no_tenant" });
    return { did: "parked", why: "no_tenant" };
  }

  await note(db, event, at, { tenantId, appId });

  switch (event.type) {
    case "checkout.session.completed": {
      /* ⚠️ THE CUSTOMER IS RECORDED HERE AND NOWHERE ELSE, which is what makes
         every later invoice attributable — see `tenantByCustomer`. */
      if (customer) {
        await noteCustomer(db, tenantId, customer,
          typeof o.currency === "string" ? o.currency : "usd", now);
      }
      const said = (o.metadata ?? {}) as Record<string, unknown>;

      /*
        ⚠️ A PACK IS A PURCHASE AND NOT A SUBSCRIPTION, so it takes the whole
        branch and nothing else runs. Falling through to `paid` would mark a
        lapsed workspace up to date because somebody bought fifty credits.
      */
      const pack = said.pack;
      if (typeof pack === "string" && pack) {
        await ladder.bought(tenantId, pack, event.id);
        break;
      }

      const plan = said.plan;
      if (typeof plan === "string" && plan) await ladder.subscribe(tenantId, appId, plan);
      /* ⚠️ AND THE LEGAL NAME IS WHAT MAKES THIS THE SAME CHECKOUT. Becoming a
         business is buying a commercial tier; the name travelled with the
         session so the workspace's kind and its plan land together, from the
         one event that says the money moved. */
      const legalName = said.legalName;
      if (typeof legalName === "string" && legalName) {
        await ladder.becameBusiness(tenantId, legalName);
      }
      await ladder.paid(tenantId, appId);
      break;
    }
    /*
      ⚠️ ONLY AN INTENT WE RAISED OURSELVES. A hosted checkout produces a payment
      intent too, and its credits are granted by the session above — acting on
      both would grant every pack twice, under two event ids that no idempotency
      row can join, and only for the customers who bought one.
    */
    case "payment_intent.succeeded": {
      const said = (o.metadata ?? {}) as Record<string, unknown>;
      const pack = said.pack;
      if (said.auto === "1" && typeof pack === "string" && pack) {
        await ladder.bought(tenantId, pack, event.id);
      }
      break;
    }
    case "invoice.paid":
      await ladder.paid(tenantId, appId);
      break;
    case "invoice.payment_failed":
      await ladder.pastDue(tenantId, appId);
      break;
    case "customer.subscription.deleted":
      await ladder.cancelled(tenantId, appId);
      break;
  }

  return { did: "applied", tenantId, appId };
}

/** ⚠️ The dead letter, readable — see the header. */
export interface Parked {
  readonly id: string;
  readonly kind: string;
  readonly at: string;
  readonly why: string;
}

export async function parkedEvents(db: Db, limit = 50): Promise<readonly Parked[]> {
  const rows = await db.prepare(
    `SELECT id, kind, at, why FROM stripe_event
     WHERE why IS NOT NULL AND why != 'not_acted_on' ORDER BY at DESC LIMIT ?`)
    .bind(limit).all<Parked>();
  return rows.results;
}
