/**
 * ONE ENDPOINT, MANY APPS.
 *
 * Verify the signature once, attribute the event, hand it to the app that owns
 * it. The value is entirely in what happens when attribution FAILS, so that is
 * what this file is mostly about.
 *
 * ── Three outcomes, and they must not be collapsed ──────────────────────────
 *
 *   ROUTED + handled     200. Ordinary.
 *   ROUTED + threw       **500**, and the idempotency claim is released. Stripe
 *                        retries, and the next delivery processes cleanly. A
 *                        transient D1/DO failure must never be recorded as done
 *                        — that is money captured with nothing granted.
 *   UNROUTABLE           **200, and a PARKED ROW.** Not 500: Stripe would retry
 *                        for days and then give up, and no retry can fix an
 *                        event whose app the rail does not know. Not a bare 200:
 *                        that is the silent drop this package exists to end.
 *                        The row is the signal, and it keeps the payload so the
 *                        event can be replayed once the cause is fixed.
 *
 * The distinction that matters is the middle one against the last. A handler
 * that threw is a problem that RETRYING solves. An unattributable event is a
 * problem only a human solves, and pretending otherwise buries it.
 */

import { newId, nowIso, type HasDb } from "@4dl/core";
// The `/stripe` SUBPATH, not the root: `@4dl/billing`'s index exports the credit
// Durable Object, which imports `cloudflare:workers` — unloadable outside the
// Workers pool, so importing the root would make this package's plain-Node tests
// impossible to run. Same reason `@4dl/billing/schema` exists.
import { verifyWebhook } from "@4dl/billing/stripe";
import { resolveApp, type RailApp, type RouteResult } from "./routing.js";

/** What an app does with an event that belongs to it. */
export type RailHandler = (event: RailEvent) => Promise<void>;

export interface RailEvent {
  id?: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export interface RailAppHandler extends RailApp {
  handle: RailHandler;
  /**
   * "Is this mine?", asked ONLY when metadata names nobody.
   *
   * Real events do not all carry an app marker. Kova resolves several types by
   * Stripe customer id — `invoice.paid` falls back to `tenantByCustomer` — so a
   * metadata-only rail would park events that are handled correctly today. An
   * app that can recognise its own objects by lookup implements this.
   *
   * Deliberately NOT consulted for `unknown-app` or `ambiguous`: those are an
   * object stamped with a contradiction, and letting a database lookup overrule
   * an explicit tag is how a payment reaches the wrong tenant. A claim resolves
   * silence, never disagreement.
   */
  claims?: (event: RailEvent) => Promise<boolean>;
}

export interface RailDeps {
  /** Every app the rail can deliver to, and its handler. */
  apps: RailAppHandler[];
  /**
   * Claim an event id; `false` means already processed. Injected because the
   * idempotency table belongs to whichever app's database the rail runs beside —
   * `@4dl/billing`'s `stripe_events` is the usual answer.
   */
  firstSeen: (eventId: string | undefined) => Promise<boolean>;
  /** Release a claim so a retry is not swallowed as a duplicate. */
  release: (eventId: string | undefined) => Promise<void>;
}

/** A parked event, for the operator console. */
export interface ParkedEvent {
  id: string;
  eventId: string | null;
  eventType: string;
  reason: string;
  candidates: string[];
  createdAt: string;
  /** Set once an operator closed it; null while it is still open. */
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  resolutionNote?: string | null;
}

export async function park(db: D1Database, event: RailEvent, result: Extract<RouteResult, { unroutable: true }>, payload: string): Promise<void> {
  await db
    .prepare("INSERT INTO rail_parked_events (id, event_id, event_type, reason, candidates, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(newId("park"), event.id ?? null, event.type, result.reason, JSON.stringify(result.candidates ?? []), payload, nowIso())
    .run();
}

interface ParkedRow {
  id: string; event_id: string | null; event_type: string; reason: string; candidates: string;
  created_at: string; resolved_at: string | null; resolved_by: string | null; resolution_note: string | null;
}

const toParked = (r: ParkedRow): ParkedEvent => ({
  id: r.id,
  eventId: r.event_id,
  eventType: r.event_type,
  reason: r.reason,
  candidates: ((): string[] => { try { return JSON.parse(r.candidates) as string[]; } catch { return []; } })(),
  createdAt: r.created_at,
  resolvedAt: r.resolved_at,
  resolvedBy: r.resolved_by,
  resolutionNote: r.resolution_note,
});

const PARKED_COLS =
  "id, event_id, event_type, reason, candidates, created_at, resolved_at, resolved_by, resolution_note";

/**
 * Parked events, newest first.
 *
 * `open` defaults to true because an unattended dead letter is the only thing
 * anybody needs a list for. Resolved ones stay readable on purpose: "what did
 * we do about the last one of these" is the first question the second occurrence
 * raises, and a queue that empties itself out of sight cannot answer it.
 */
export async function listParked(db: D1Database, opts: { limit?: number; open?: boolean } = {}): Promise<ParkedEvent[]> {
  const where = opts.open === false ? "" : "WHERE resolved_at IS NULL ";
  const rows = await db
    .prepare(`SELECT ${PARKED_COLS} FROM rail_parked_events ${where}ORDER BY created_at DESC LIMIT ?`)
    .bind(opts.limit ?? 50)
    .all<ParkedRow>();
  return (rows.results ?? []).map(toParked);
}

/**
 * One parked event WITH its stored payload.
 *
 * Separate from the list, and the reason is the payload: it is the whole Stripe
 * event, so it carries the customer id, the amount and whatever metadata the
 * object did or did not have — everything needed to work out who paid for what.
 * That is also why it is not in the list: an operator scanning a queue does not
 * need five kilobytes of JSON per row, and this endpoint is a deliberate,
 * per-event act.
 */
export async function getParked(db: D1Database, id: string): Promise<(ParkedEvent & { payload: string | null }) | null> {
  const r = await db
    .prepare(`SELECT ${PARKED_COLS}, payload FROM rail_parked_events WHERE id = ?`)
    .bind(id)
    .first<ParkedRow & { payload: string | null }>();
  return r ? { ...toParked(r), payload: r.payload } : null;
}

/**
 * Close one, with a note saying what was actually done.
 *
 * The note is required by the ROUTE rather than here, so a caller with its own
 * rules is not fought. What this refuses is re-resolving something already
 * closed: two operators working the same queue would otherwise overwrite each
 * other's account of what happened, and the second note is the one that would
 * survive.
 */
export async function resolveParked(db: D1Database, id: string, by: string, note: string): Promise<boolean> {
  const r = await db
    .prepare("UPDATE rail_parked_events SET resolved_at = ?, resolved_by = ?, resolution_note = ? WHERE id = ? AND resolved_at IS NULL")
    .bind(nowIso(), by, note, id)
    .run();
  return (r.meta?.changes ?? 0) > 0;
}

export async function countParked(db: D1Database): Promise<number> {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM rail_parked_events WHERE resolved_at IS NULL").first<{ n: number }>();
  return r?.n ?? 0;
}

/**
 * Handle one delivery. Returns the HTTP status the endpoint should answer with,
 * so the caller keeps ownership of its own framework.
 *
 * Throws only when the app's handler threw — the caller re-throws so the worker
 * 500s and Stripe retries.
 */
export async function dispatchEvent(
  env: HasDb,
  deps: RailDeps,
  payload: string,
  signature: string,
  webhookSecret: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!webhookSecret || !(await verifyWebhook(payload, signature, webhookSecret))) {
    return { status: 400, body: { error: "bad signature" } };
  }
  const event = JSON.parse(payload) as RailEvent;

  let routed = resolveApp(event, deps.apps);

  // Metadata named nobody — ask the apps that can recognise their own objects.
  // Only for silence, never for a contradiction: see `RailAppHandler.claims`.
  if (routed.unroutable && routed.reason === "no-app-marker") {
    const claimants: string[] = [];
    for (const a of deps.apps) {
      if (a.claims && (await a.claims(event))) claimants.push(a.slug);
    }
    if (claimants.length === 1) routed = { app: claimants[0]!, via: "claim" };
    else if (claimants.length > 1) routed = { unroutable: true, reason: "ambiguous", candidates: claimants.sort() };
  }

  // Attribution happens BEFORE the idempotency claim on purpose. Claiming first
  // would mark an unroutable event as processed, so a replay after the routing
  // is fixed would be dropped as a duplicate — the parked payload would be the
  // only copy left, and replay is the whole point of keeping it.
  if (routed.unroutable) {
    await park(env.DB, event, routed, payload);
    return { status: 200, body: { received: true, parked: true, reason: routed.reason } };
  }

  if (!(await deps.firstSeen(event.id))) return { status: 200, body: { received: true, duplicate: true } };

  const app = deps.apps.find((a) => a.slug === routed.app)!;
  try {
    await app.handle(event);
  } catch (err) {
    await deps.release(event.id);
    throw err;
  }
  return { status: 200, body: { received: true, app: routed.app, via: routed.via } };
}
