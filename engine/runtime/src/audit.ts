/**
 * WHAT HAPPENED, AND WHO DID IT.
 *
 * ⚠️ THE ENTRY IS WRITTEN BY THE RUNTIME, NOT BY THE HANDLER. A previous
 * platform made auditing something a handler called, and twenty of its own
 * writes were recorded nowhere with every suite green — because a missing entry
 * is indistinguishable from an action nobody took. Nothing here is opt-in: an
 * operation either says what to record or says why it records nothing, and both
 * are in the declaration where review can see them.
 *
 * ⚠️ AND A FAILED WRITE IS RECORDED TOO. An audit of only the successes answers
 * "did anybody try" with silence — which is the question actually asked after an
 * incident.
 */

import type { AnyOperation } from "@engine/kernel";
import { newId, verbOf } from "@engine/kernel";
import type { SchemaModule } from "./schema.js";
import type { Db } from "./sql.js";

export const AUDIT_SCHEMA: SchemaModule = {
  id: "audit",
  statements: [
    `CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, at TEXT NOT NULL, actor TEXT, op TEXT NOT NULL, verb TEXT NOT NULL, subject TEXT, ok INTEGER NOT NULL, problem TEXT);`,
    `CREATE INDEX IF NOT EXISTS ix_audit_tenant ON audit (tenant_id, at);`,
    `CREATE INDEX IF NOT EXISTS ix_audit_subject ON audit (tenant_id, subject);`,
  ],
};

export interface Entry {
  readonly tenantId: string;
  readonly actor: string | null;
  readonly op: string;
  readonly verb: string;
  readonly subject: string | null;
  readonly ok: boolean;
  readonly problem?: string;
}

/**
 * ⚠️ ABSENT MEANS DERIVED, NOT ABSENT. A write with no `audit` gets the verb from
 * its own id and the subject from its input — which is why an operation whose
 * input carries neither an id nor a natural key has to say what to record, and
 * why `refuseOperation` refuses one that says nothing at all.
 */
export function entryFor(
  op: AnyOperation,
  input: Record<string, unknown>,
  ctx: { readonly tenantId: string; readonly actor: string | null },
  outcome: { readonly ok: boolean; readonly problem?: string; readonly id?: string },
): Entry | null {
  if (op.kind !== "write") return null;
  if (op.audit && "why" in op.audit) return null;

  const declared = typeof op.audit === "function"
    ? (op.audit as (i: unknown) => { subject: string; verb: string })(input)
    : null;

  const natural = op.idempotency.mode === "natural" ? op.idempotency.key : "id";
  return {
    tenantId: ctx.tenantId,
    actor: ctx.actor,
    op: op.id,
    verb: declared?.verb ?? verbOf(op.id),
    subject: declared?.subject ?? outcome.id ?? (input[natural] as string | undefined) ?? null,
    ok: outcome.ok,
    ...(outcome.problem ? { problem: outcome.problem } : {}),
  };
}

/**
 * ⚠️ AN AUDIT WRITE MAY NOT TAKE THE REQUEST DOWN WITH IT. The action already
 * happened; failing the response because the record of it could not be written
 * would turn a bookkeeping problem into a customer-facing error and — worse —
 * invite somebody to make the audit optional to stop it.
 */
export async function record(db: Db, entry: Entry, now = new Date()): Promise<void> {
  try {
    await db.prepare(
      `INSERT INTO audit (id, tenant_id, at, actor, op, verb, subject, ok, problem)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(newId("aud", now), entry.tenantId, now.toISOString(), entry.actor, entry.op,
        entry.verb, entry.subject, entry.ok ? 1 : 0, entry.problem ?? null)
      .run();
  } catch {
    /* ⚠️ Swallowed deliberately, and this is the ONE place it is. */
  }
}

/* ---------------------------------------------------------------- replays --- */

export const REPLAY_SCHEMA: SchemaModule = {
  id: "replay",
  statements: [
    `CREATE TABLE IF NOT EXISTS replay (key TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, op TEXT NOT NULL, at TEXT NOT NULL, answer TEXT NOT NULL);`,
    `CREATE INDEX IF NOT EXISTS ix_replay_at ON replay (at);`,
  ],
};

/**
 * ⚠️ A REPLAY IS ANSWERED BEFORE ANYTHING ELSE HAPPENS. A phone that queued a
 * write in a basement cannot know whether the first attempt landed — the ANSWER
 * went missing, not the request — so it asks again. Without this it gets a
 * second audit row, a second notification and a second charge, and the customer
 * sees two of whatever they made once.
 */
export async function seen(
  db: Db, tenantId: string, key: string,
): Promise<unknown | null> {
  const row = await db.prepare(`SELECT answer FROM replay WHERE key = ? AND tenant_id = ?`)
    .bind(key, tenantId).first<{ answer: string }>();
  return row ? JSON.parse(row.answer) : null;
}

export async function remember(
  db: Db, tenantId: string, op: string, key: string, answer: unknown, now = new Date(),
): Promise<void> {
  await db.prepare(`INSERT INTO replay (key, tenant_id, op, at, answer) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(key) DO NOTHING`)
    .bind(key, tenantId, op, now.toISOString(), JSON.stringify(answer ?? null)).run();
}

/**
 * ⚠️ THE KEY IS SCOPED TO THE TENANT AND THE OPERATION. A client-supplied key on
 * its own is a value one workspace could use to read another's answer back, and
 * a key shared across operations makes a retried `note.create` return whatever
 * `note.delete` answered.
 */
export const keyFor = (tenantId: string, op: string, given: string): string =>
  `${tenantId}:${op}:${given}`;
