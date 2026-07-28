/**
 * Coach-action audit — the one write path for the audit log. Every staff action
 * that changes a client-facing record funnels a recordAudit() call here, so the
 * client (and an owner reviewing a coach) gets a durable, queryable history. The
 * action id is validated against @kova/domain AUDIT_ACTIONS; best-effort like
 * notify() — an audit write must NEVER reject its caller (the mutation already
 * committed), so everything is swallowed.
 */

import { isAuditAction, type AuditAction } from "@kova/domain";
import type { Env } from "./env.js";
import { newId, nowMs } from "./ids.js";

export interface AuditInput {
  tenantId: string;
  clientId: string;
  /** The acting staff user (owner / trainer / assistant). */
  actorUserId: string | null | undefined;
  action: AuditAction;
  /** Short human line (e.g. the plan/goal/supplement name). */
  summary?: string | null;
  /** Id of the affected row (goal id, plan id, lab id, …). */
  ref?: string | null;
}

/** Record one coach action. Best-effort: never throws to the caller. */
export async function recordAudit(env: Env, input: AuditInput): Promise<void> {
  try {
    if (!input.actorUserId || !isAuditAction(input.action)) return;
    await env.DB.prepare(
      "INSERT INTO audit_log (id, tenant_id, client_id, actor_user_id, action, summary, ref, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(newId("aud"), input.tenantId, input.clientId, input.actorUserId, input.action, input.summary ?? null, input.ref ?? null, nowMs())
      .run();
  } catch {
    /* audit is best-effort; never surface to the caller */
  }
}
