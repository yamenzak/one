/**
 * "APPLY TO EVERY APP" — a broadcast, not an override.
 *
 * The catalog half of `ai_models` is shared (shared-catalog.ts). The SELECTION
 * half — `enabled`, `is_default` — is each product's own, because one app reads
 * food photos, another reads sterilisation labels, and a third has no use for
 * the speech lane at all.
 *
 * That is right in general and wrong in the common case: there is one operator,
 * and turning a new model on meant finding it on every app's console and
 * flipping it there. So the toggle grew a checkbox, and this is what stands
 * behind it.
 *
 * ── Why a one-time broadcast and not a shared default ───────────────────────
 *
 * The obvious design is `getConfig`'s: a shared value, overridden per app. It
 * is the wrong shape here.
 *
 * A shared DEFAULT is a standing rule, so every later divergence has to be
 * recorded as an override — and an operator who turns a model off on one app
 * then wonders, months later, why it is off, with the answer living in a
 * precedence rule rather than in anything they did. Worse, `ai_models` is what
 * the credit math reads: putting a second, invisible layer under the column
 * that decides what a tenant is charged buys a convenience with a class of bug
 * nobody wants to debug.
 *
 * A BROADCAST is an event. "Turn this on everywhere" happens once, each app
 * applies it once, and after that every app's row is its own again — the same
 * thing that would have happened had somebody clicked through each console by
 * hand, which is exactly what the operator was asking to avoid doing.
 *
 * ── Applying it ────────────────────────────────────────────────────────────
 *
 * A worker cannot write another worker's D1 (the constraint that shaped the
 * whole shared-config design), so this cannot push. Each app PULLS: it keeps a
 * cursor in its own `app_config` and applies whatever it has not seen, from
 * two places — its AI console, so an operator who goes looking sees the effect
 * immediately, and its daily sweep, so an app nobody opens still converges.
 *
 * A sequence number rather than a timestamp. Two ops in the same millisecond
 * would tie on a clock, and the failure of a tie here is an op silently never
 * applied — which is indistinguishable from the feature not working.
 */

import type { HasDb, HasPlatformConfig } from "@4dl/core";
import { getConfig, setConfig } from "@4dl/core";

/** The one KV key the broadcast log lives under. */
export const SHARED_SELECTION_KEY = "platform:ai-selection";

/** This app's cursor: the last sequence number it has applied. */
const CURSOR_KEY = "ai.selection_cursor";

/**
 * How many ops the log keeps.
 *
 * It is a catch-up mechanism, not an audit trail. An app that has been dark
 * long enough to fall off the end gets whatever is still there and advances its
 * cursor past the rest — the alternative is a log that grows forever to serve
 * an app that no longer exists.
 */
const KEEP = 50;

export interface SelectionOp {
  seq: number;
  modelId: string;
  /** Absent means "leave it alone" — the same shape the PATCH route takes. */
  enabled?: boolean;
  isDefault?: boolean;
  /** Which app broadcast it, for the console to report. */
  by: string;
  at: string;
}

interface SelectionLog {
  seq: number;
  ops: SelectionOp[];
}

const EMPTY: SelectionLog = { seq: 0, ops: [] };

const isOp = (o: unknown): o is SelectionOp => {
  const r = o as Partial<SelectionOp> | null;
  return !!r && typeof r.seq === "number" && typeof r.modelId === "string" && !!r.modelId;
};

/** The log, or an empty one. NEVER throws — a KV failure must not break a
 *  console that works perfectly well without this feature. */
async function readLog(env: HasPlatformConfig): Promise<SelectionLog> {
  const kv = env.PLATFORM_CONFIG;
  if (!kv) return EMPTY;
  const raw = await kv.get<Partial<SelectionLog>>(SHARED_SELECTION_KEY, { type: "json", cacheTtl: 30 }).catch(() => null);
  if (!raw || !Array.isArray(raw.ops)) return EMPTY;
  const ops = raw.ops.filter(isOp);
  return { seq: typeof raw.seq === "number" ? raw.seq : ops.reduce((m, o) => Math.max(m, o.seq), 0), ops };
}

/**
 * Record "apply this to every app".
 *
 * Returns false when there is no shared store — which the route reports, rather
 * than letting an operator tick a box that quietly did nothing.
 */
export async function broadcastSelection(
  env: HasPlatformConfig,
  op: Omit<SelectionOp, "seq">,
): Promise<boolean> {
  const kv = env.PLATFORM_CONFIG;
  if (!kv) return false;
  const log = await readLog(env);
  const next: SelectionLog = {
    seq: log.seq + 1,
    ops: [...log.ops, { ...op, seq: log.seq + 1 }].slice(-KEEP),
  };
  return kv
    .put(SHARED_SELECTION_KEY, JSON.stringify(next))
    .then(() => true)
    .catch(() => false);
}

export interface ApplyResult {
  /** Ops this app had not seen and has now applied. */
  applied: number;
  /** Where the cursor ended up. */
  cursor: number;
}

/**
 * Apply everything this app has not seen, and advance the cursor.
 *
 * Idempotent by the cursor, so calling it from both the console and the cron is
 * safe — whichever runs first does the work.
 *
 * An op naming a model this app does not have updates nothing and still
 * advances the cursor. That is correct rather than lazy: the app has not synced
 * that model, so there is no row to enable, and holding the cursor back would
 * stall every LATER op behind one the app can never satisfy.
 */
export async function applySharedSelection(env: HasDb & HasPlatformConfig): Promise<ApplyResult> {
  const log = await readLog(env);
  if (log.ops.length === 0) return { applied: 0, cursor: 0 };

  const cfg = await getConfig(env.DB);
  const cursor = Number(cfg[CURSOR_KEY] ?? "0") || 0;
  const pending = log.ops.filter((o) => o.seq > cursor).sort((a, b) => a.seq - b.seq);
  if (pending.length === 0) return { applied: 0, cursor };

  for (const op of pending) {
    // Making a model the default for its task clears the previous default —
    // the same rule the per-app route enforces, because a task with two
    // defaults resolves arbitrarily.
    if (op.isDefault) {
      const row = await env.DB.prepare("SELECT task FROM ai_models WHERE id = ?").bind(op.modelId).first<{ task: string }>().catch(() => null);
      if (row) await env.DB.prepare("UPDATE ai_models SET is_default = 0 WHERE task = ?").bind(row.task).run().catch(() => undefined);
    }
    const sets: string[] = [];
    const binds: unknown[] = [];
    if (op.enabled !== undefined) (sets.push("enabled = ?"), binds.push(op.enabled ? 1 : 0));
    if (op.isDefault !== undefined) (sets.push("is_default = ?"), binds.push(op.isDefault ? 1 : 0));
    // Turning a model OFF must not leave it as its lane's default; the lane
    // would resolve to a disabled row and every call in it would fail.
    if (op.enabled === false) (sets.push("is_default = ?"), binds.push(0));
    if (sets.length) {
      await env.DB.prepare(`UPDATE ai_models SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, op.modelId).run().catch(() => undefined);
    }
  }

  const last = pending[pending.length - 1]!.seq;
  await setConfig(env.DB, CURSOR_KEY, String(last)).catch(() => undefined);
  return { applied: pending.length, cursor: last };
}
