/**
 * THE PAYMENT PROVIDER — one account, many products, and the letter that cannot
 * be lost.
 *
 * ⚠️ AN EVENT THIS WORKER CANNOT ATTRIBUTE IS PARKED, NEVER ANSWERED 200.
 *
 * This is the defect the whole file is arranged around, and it has happened.
 * A handler that could not work out whose event it was answered
 * `200 {received: true}` — with the event id already recorded, so the provider
 * marked it delivered and never retried. Money captured, nothing granted, and no
 * error anywhere: the only surviving trace was a customer asking why they had
 * been charged for something they did not have.
 *
 * So there are exactly two honest answers to an event: APPLIED, or PARKED in a
 * table an operator can read and replay. There is no third.
 *
 * ⚠️ AND A DEAD LETTER NOBODY CAN READ IS THE SAME SILENT SUCCESS WITH AN EXTRA
 * TABLE. The parked rows have a surface, in `commerce-ops.ts`, for the same
 * reason the ladder has a bottom rung.
 */

import type { Instant, SchemaModule, SqlHandle } from "@one/kernel";

/* --------------------------------------------------------------- storage --- */

/**
 * ⚠️ GLOBAL, NOT REGIONAL, and it has to be: an event arrives naming a customer,
 * and which region that customer's workspace lives in is the question this
 * table answers. A regional lookup would need the answer to find the answer.
 *
 * It holds a provider's own reference and nothing else about the person — the
 * global store is the one place residency does not govern, so what lives here is
 * routing data and only routing data.
 */
export const PROVIDER_SCHEMA: SchemaModule = {
  id: "provider",
  ddl: [
    `CREATE TABLE IF NOT EXISTS provider_customer (customer_ref TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, app_id TEXT NOT NULL, at TEXT NOT NULL);`,
    `CREATE INDEX IF NOT EXISTS idx_provider_customer_tenant ON provider_customer(tenant_id);`,
    /*
      ⚠️ THE DEAD LETTER. `resolved_at` rather than a delete, because what was
      parked and later replayed is the record of a gap in attribution — and that
      record is the only way anybody learns the gap existed.
    */
    `CREATE TABLE IF NOT EXISTS parked_event (event_id TEXT PRIMARY KEY, type TEXT NOT NULL, why TEXT NOT NULL, payload TEXT NOT NULL, at TEXT NOT NULL, resolved_at TEXT);`,
    `CREATE INDEX IF NOT EXISTS idx_parked_open ON parked_event(resolved_at, at);`,
    /*
      ⚠️ THE UNIQUE KEY IS THE IDEMPOTENCY. A provider retries on any non-2xx and
      occasionally redelivers a success; without a record of what has been
      applied, every redelivery applies again — free access, silently, with a
      correct-looking 200 each time.
    */
    `CREATE TABLE IF NOT EXISTS applied_event (event_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, type TEXT NOT NULL, at TEXT NOT NULL);`,
  ],
};

/* -------------------------------------------------------------- the wire --- */

/**
 * A provider's event, normalised.
 *
 * ⚠️ THE PLATFORM NEVER SEES A PROVIDER'S OWN SHAPE. One adapter parses; every
 * decision below is made on this. A settlement path written against a specific
 * provider's field names is one that has to be rewritten to add a second
 * provider — and the second provider always arrives, because the first one does
 * not operate in some country a customer is in.
 */
export interface ProviderEvent {
  readonly id: string;
  readonly kind: EventKind;
  /** From the object's own metadata, where the provider carried it. */
  readonly appId: string | null;
  readonly tenantId: string | null;
  readonly planId: string | null;
  /** The provider's identifier for the payer — how an event with no metadata is claimed. */
  readonly customerRef: string | null;
  readonly paidMinor: number;
  /** ⚠️ CUMULATIVE, as every provider reports it. See `reversal` in the kernel. */
  readonly refundedMinorTotal: number;
}

/** What an event MEANS, which is the only part the settlement path reads. */
export type EventKind = "paid" | "failed" | "cancelled" | "refunded" | "other";

/* --------------------------------------------------------- verification --- */

const enc = new TextEncoder();

/** ⚠️ Length-independent and value-independent. A fast compare leaks the digest. */
function sameBytes(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const hex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

export type SignatureVerdict = { readonly ok: true } | { readonly ok: false; readonly why: "malformed" | "stale" | "wrong" };

/**
 * Whether this body really came from the provider.
 *
 * ⚠️ THE TIMESTAMP IS PART OF WHAT IS SIGNED, AND THE TOLERANCE IS THE POINT.
 * Verifying the body alone makes a captured request replayable forever — the
 * signature stays valid, so a recording of one successful payment notification
 * can be posted back as many times as somebody likes. The applied-event key
 * would catch a replay of the SAME event; the tolerance is what stops the
 * endpoint being a general-purpose oracle.
 *
 * ⚠️ AND AN ENDPOINT WITH NO SECRET MUST REFUSE. It is public by construction —
 * a provider cannot hold a session — so the signature is the whole of the
 * authentication. A deployment that has not configured one has an open door,
 * and answering it 200 is how most workspaces end up with one.
 */
export async function verifySignature(input: {
  readonly secret: string;
  readonly body: string;
  readonly header: string;
  readonly now: Instant;
  readonly toleranceSeconds?: number;
}): Promise<SignatureVerdict> {
  if (!input.secret) return { ok: false, why: "wrong" };

  const parts = new Map(input.header.split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = parts.get("t");
  const claimed = parts.get("v1");
  if (!t || !claimed || !/^\d+$/.test(t)) return { ok: false, why: "malformed" };

  const skew = Math.abs(Date.parse(input.now) / 1000 - Number(t));
  if (skew > (input.toleranceSeconds ?? 300)) return { ok: false, why: "stale" };

  const key = await crypto.subtle.importKey("raw", enc.encode(input.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = hex(await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${input.body}`)));
  return sameBytes(mac, claimed) ? { ok: true } : { ok: false, why: "wrong" };
}

/* --------------------------------------------------------- attribution --- */

export type Attribution =
  | { readonly ok: true; readonly tenantId: string }
  | { readonly ok: false; readonly why: ParkReason };

/** Why an event could not be applied. Each one is a different operator action. */
export type ParkReason = "other_app" | "unclaimed" | "no_tenant" | "unverified";

/**
 * Whose event is this.
 *
 * The order is stated-then-claimed, and the direction matters. Metadata we wrote
 * ourselves is the strongest evidence there is; a claim is a lookup we perform
 * on the provider's identifier when there is no metadata at all — which is the
 * common case, because a renewal invoice carries the fields the PROVIDER thinks
 * are interesting and none of ours.
 *
 * ⚠️ A CLAIM RESOLVES SILENCE, NEVER A CONTRADICTION. If the event names an app
 * and it is not this one, the answer is `other_app` and the claim is not
 * consulted — otherwise a customer reference that happens to exist in two
 * products lets one of them apply the other's payment, which is the worst
 * outcome available and the one that looks most like it worked.
 */
export async function attribute(
  event: ProviderEvent,
  appId: string,
  claim: (customerRef: string) => Promise<{ tenantId: string; appId: string } | null>,
): Promise<Attribution> {
  if (event.appId && event.appId !== appId) return { ok: false, why: "other_app" };
  if (event.tenantId) return { ok: true, tenantId: event.tenantId };
  if (!event.customerRef) return { ok: false, why: "no_tenant" };

  const claimed = await claim(event.customerRef);
  if (!claimed) return { ok: false, why: "unclaimed" };
  if (claimed.appId !== appId) return { ok: false, why: "other_app" };
  return { ok: true, tenantId: claimed.tenantId };
}

/* ------------------------------------------------------------ the ledger --- */

export async function rememberCustomer(db: SqlHandle, customerRef: string, tenantId: string, appId: string, at: Instant): Promise<void> {
  await db.run(
    `INSERT INTO provider_customer (customer_ref, tenant_id, app_id, at) VALUES (?, ?, ?, ?)
     ON CONFLICT(customer_ref) DO UPDATE SET tenant_id = excluded.tenant_id, app_id = excluded.app_id`,
    customerRef, tenantId, appId, at,
  );
}

export const claimByCustomer = (db: SqlHandle) => async (customerRef: string) =>
  db.first<{ tenantId: string; appId: string }>(
    `SELECT tenant_id AS tenantId, app_id AS appId FROM provider_customer WHERE customer_ref = ?`,
    customerRef,
  );

export async function park(db: SqlHandle, event: { id: string; kind: string }, why: ParkReason, payload: string, at: Instant): Promise<void> {
  await db.run(
    `INSERT OR IGNORE INTO parked_event (event_id, type, why, payload, at) VALUES (?, ?, ?, ?, ?)`,
    event.id, event.kind, why, payload, at,
  );
}

export interface ParkedEvent {
  readonly eventId: string;
  readonly type: string;
  readonly why: string;
  readonly at: string;
  readonly payload: string;
}

export const listParked = (db: SqlHandle, limit: number): Promise<ParkedEvent[]> =>
  db.all<ParkedEvent>(
    `SELECT event_id AS eventId, type, why, at, payload FROM parked_event WHERE resolved_at IS NULL ORDER BY at DESC LIMIT ?`,
    limit,
  );

export const resolveParked = (db: SqlHandle, eventId: string, at: Instant): Promise<void> =>
  db.run(`UPDATE parked_event SET resolved_at = ? WHERE event_id = ?`, at, eventId);

/**
 * Claim an event id, once.
 *
 * ⚠️ `false` MEANS ALREADY APPLIED, WHICH IS A SUCCESS. A redelivered event that
 * was handled is not an error — answering one would make the provider retry
 * forever — but a caller that grants access on the strength of a 200 has to be
 * able to tell that nothing happened this time.
 */
export async function claimEvent(db: SqlHandle, eventId: string, tenantId: string, kind: string, at: Instant): Promise<boolean> {
  const before = await db.first<{ n: number }>(`SELECT COUNT(*) AS n FROM applied_event WHERE event_id = ?`, eventId);
  if ((before?.n ?? 0) > 0) return false;
  await db.run(`INSERT OR IGNORE INTO applied_event (event_id, tenant_id, type, at) VALUES (?, ?, ?, ?)`, eventId, tenantId, kind, at);
  const after = await db.first<{ n: number }>(`SELECT COUNT(*) AS n FROM applied_event WHERE event_id = ?`, eventId);
  return (after?.n ?? 0) > 0;
}
