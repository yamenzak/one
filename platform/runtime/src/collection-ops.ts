/**
 * A COLLECTION BECOMES OPERATIONS — and therefore routes, tools, an audit trail
 * and an API document, from one declaration.
 *
 * ⚠️ THIS IS WHERE THE MANIFEST PAYS. Measured across three shipping products,
 * three quarters of every surface is a list, a record, a form or a settings row
 * over a collection. Hand-writing them is not merely repetitive: it is where the
 * scope check gets forgotten on the four hundredth route, where one list filters
 * by tenant and the next does not, and where a soft-deleted row comes back in a
 * screen somebody wrote in a hurry.
 *
 * Derived, none of that is a discipline. There is one reader, one writer, and
 * one place the tenant predicate is applied.
 */

import type {
  AnyOperation, CollectionSpec, Field, Instant, MediaField, Shape, SqlHandle,
} from "@one/kernel";
import {
  columnName, columnsFor, deletionFor, operation, refusesChange,
  liveClause, s, tableNameFor, transition, type DocState,
} from "@one/kernel";
import { mediaRefused } from "./files.js";
import { consentOf, needsExplicitConsent } from "./reference-ops.js";

/* ---------------------------------------------------------------- shapes --- */

/**
 * A declared field becomes a validator.
 *
 * ⚠️ ONE MAPPING, so the column and the wire cannot disagree about what a value
 * is. A field declared `integer` that accepted a fraction over HTTP would store
 * one — SQLite's types are per value — and every count computed from the column
 * would be wrong with nothing throwing.
 */
export function shapeForField(f: Field, schemas: Schemas = {}): Shape<unknown> {
  switch (f.kind) {
    case "text": return s.text({ ...(f.min !== undefined ? { min: f.min } : {}), ...(f.max ? { max: f.max } : {}) }) as Shape<unknown>;
    case "number": return s.number({ ...(f.integer ? { integer: true } : {}), ...(f.min !== undefined ? { min: f.min } : {}), ...(f.max !== undefined ? { max: f.max } : {}) }) as Shape<unknown>;
    case "bool": return s.bool() as Shape<unknown>;
    case "enum": return s.enum(f.values) as Shape<unknown>;
    case "ref": return s.id(f.to) as Shape<unknown>;
    /*
      ⚠️ THE REGISTERED SHAPE, NOT `s.json()`. A json field NAMES its schema, and
      the name was decoration until an app registered one — so the column took
      any shape and a reader walking keys it never found returned its input
      unchanged, silently. `assertComposable` refuses a name nothing registers,
      so the fallback below is unreachable through a composed app and is here
      only so this function stays total.
    */
    case "json": return (schemas[f.schema] ?? s.json()) as Shape<unknown>;
    case "money": return s.money() as Shape<unknown>;
    case "instant": return s.instant() as Shape<unknown>;
    case "plainDate": return s.plainDate() as Shape<unknown>;
    // Canonical unit. What it MEANS is the declaration's job, not the wire's.
    case "quantity": return s.number() as Shape<unknown>;
    // A key, not the bytes. Uploading is its own operation with its own ceiling.
    case "media": return s.text({ max: 200 }) as Shape<unknown>;
  }
}

const bodyShape = (spec: CollectionSpec, partial: boolean, owner = false, schemas: Schemas = {}): Shape<Record<string, unknown>> => {
  const fields: Record<string, Shape<unknown>> = {};
  for (const [name, f] of Object.entries(spec.fields)) {
    const shape = shapeForField(f, schemas);
    /*
      ⚠️ A FIELD WITH AN `initial` IS NEVER REQUIRED ON THE WIRE. The create
      fills it, so demanding it would make the declaration a formality somebody
      has to satisfy — and where the field is also write-restricted, an
      impossible one.
    */
    const optional = partial || !f.required || f.initial !== undefined;
    fields[name] = optional ? (s.optional(shape) as Shape<unknown>) : shape;
  }
  /*
    ⚠️ STAFF WRITE ON SOMEBODY'S BEHALF, AND CUSTOMERS DO NOT NAME ANYBODY.
    A coach records a workout for a client constantly; the client records their
    own. So a subject-scoped create takes the subject from the CALLER when they
    have one, and from the body when they do not — and the body is only consulted
    for a caller with no subject of their own, which is what makes it impossible
    for one customer to write a row into another's history.
  */
  if (owner && spec.scope.of === "subject") {
    fields[spec.scope.subject] = s.optional(s.text({ max: 40 })) as Shape<unknown>;
  }
  return s.object(fields) as Shape<Record<string, unknown>>;
};

/* ------------------------------------------------------------------ rows --- */

/** Columns a write may set, and the SQL column each maps to. */
const writable = (spec: CollectionSpec): [string, string][] =>
  Object.entries(spec.fields).flatMap(([name, f]) =>
    columnsFor(name, f).map((c) => [name, c.name] as [string, string]));

/**
 * ⚠️ THE TENANT PREDICATE IS APPLIED IN ONE PLACE, and it is not optional.
 *
 * A hand-written list that forgets it returns every tenant's rows and looks
 * completely ordinary — same shape, same code path, more results. Deriving the
 * clause means there is no list that could forget, and a `platform`-scoped
 * collection says so in its declaration rather than by omitting a filter.
 */
/**
 * ⚠️ THE SUBJECT COLUMN NARROWS A READ ONLY FOR SOMEBODY WHO IS A SUBJECT.
 *
 * A subject-scoped collection is one whose rows belong to a tenant's own
 * customer — a client's food log, a member's bookings. Two callers ask about it
 * and they are asking different questions: a customer means "mine", and a coach
 * means "this workspace's". `resolveCaller` already draws that line — a staff
 * caller names no subject — so the narrowing follows from who is asking rather
 * than from a second permission somebody has to remember to check.
 *
 * ⚠️ It FAILS SAFE in the direction that matters: a caller who has a subject can
 * only ever see their own rows, so the mistake that leaks one customer's records
 * to another is not expressible here.
 */
function scopeClause(spec: CollectionSpec, subjectId?: string): { where: string; binds: (tenantId: string) => string[] } {
  if (spec.scope.of === "platform") return { where: "1 = 1", binds: () => [] };
  if (spec.scope.of === "subject" && subjectId) {
    const column = subjectColumn(spec);
    return { where: `tenant_id = ? AND ${column} = ?`, binds: (tenantId) => [tenantId, subjectId] };
  }
  return { where: "tenant_id = ?", binds: (tenantId) => [tenantId] };
}

/** ⚠️ The same derivation `ddl.ts` uses. Two spellings would be one silent join. */
const subjectColumn = (spec: CollectionSpec): string =>
  spec.scope.of === "subject" ? `${columnName(spec.scope.subject)}_id` : "";

/* Archived rows are invisible to an ordinary read — `liveClause`, in the kernel. */

/* ------------------------------------------------------------- operations --- */

/** Named body shapes the app registered. See `AppSpec.schemas`. */
export type Schemas = Readonly<Record<string, Shape<unknown>>>;

export interface CollectionAccess {
  /** Defaults to `<id>:read` and `<id>:write`. */
  readonly read?: string;
  readonly write?: string;
}

/**
 * Every operation a collection implies.
 *
 * ⚠️ THE DOCUMENT LIFECYCLE IS OPT-IN AND SO ARE ITS OPERATIONS. A collection
 * without `docStatus` gets no submit, cancel or amend — not disabled ones, not
 * ones that refuse: absent. A surface that exists and always refuses is a
 * surface somebody will try to make work.
 */
export function collectionOperations(spec: CollectionSpec, access: CollectionAccess = {}, schemas: Schemas = {}): readonly AnyOperation[] {
  const table = tableNameFor(spec);
  const read = access.read ?? `${spec.id}:read`;
  const write = access.write ?? `${spec.id}:write`;
  const cols = writable(spec);
  /*
    ⚠️ THE SUBJECT COLUMN IS PART OF THE ROW, and leaving it out is not a
    narrowing — it is a row nobody can attribute. A customer reading their own
    list never misses it, which is exactly why it went unnoticed: staff read the
    WHOLE workspace's rows through the same list, and without this a coach's
    diary is a column of appointments with nobody's name against any of them.
  */
  const selectable = ["id", "version", "created_at", "updated_at",
    ...(spec.scope.of === "subject" ? [subjectColumn(spec)] : []),
    ...cols.map(([, c]) => c),
    ...(spec.naming ? ["name"] : []), ...(spec.docStatus ? ["docstatus"] : [])];

  const store = (ctx: unknown): { db: SqlHandle; tenantId: string; actor: string; scope: ReturnType<typeof scopeClause>; subjectId?: string } => {
    const c = ctx as {
      bind: Record<string, SqlHandle | undefined>; tenantId: string;
      actor: { userId: string | null }; subjectId?: string;
    };
    /*
      ⚠️ `db` IS THE CONVENTIONAL NAME FOR AN APP'S REGIONAL STORE, and derived
      operations depend on it. An app that binds one under another name gets a
      clear failure here rather than a silent `undefined` reaching a query.
    */
    const db = c.bind.db;
    if (!db) throw new Error(`${spec.id}: derived operations need a binding named "db"`);
    return {
      db, tenantId: c.tenantId, actor: c.actor.userId ?? "system",
      scope: scopeClause(spec, c.subjectId), ...(c.subjectId ? { subjectId: c.subjectId } : {}),
    };
  };

  /**
   * ⚠️ EVERY WRITE THAT CAN SET A MEDIA FIELD CHECKS IT, and there are two of
   * them. Checking on create alone leaves the same unverified id one `update`
   * away, which is the write a form actually makes after the first save.
   */
  const media = Object.entries(spec.fields).filter(([, f]) => f.kind === "media") as [string, MediaField][];

  const checkMedia = async (ctx: { fail(code: "platform.invalid", meta: Record<string, string>): never }, body: Record<string, unknown>, db: SqlHandle, tenantId: string) => {
    for (const [name, f] of media) {
      const value = body[name];
      /*
        ⚠️ CLEARING ONE IS NOT SETTING ONE. An empty value removes the reference,
        which is what "no photograph" is — refusing it would make a face
        impossible to take back off somebody's record.
      */
      if (value === undefined || value === null || value === "") continue;
      const why = await mediaRefused(db, tenantId, String(value), f);
      if (why) ctx.fail("platform.invalid", { field: name, reason: why });
    }
  };

  /**
   * ⚠️ THE DECLARED RULE, ON EVERY WRITE THAT COULD BREAK IT. It lives on the
   * collection precisely so there is one place it runs: a product rule enforced
   * by a bespoke operation leaves the derived create standing beside it making
   * the same row without the check.
   *
   * ⚠️ AND AN UPDATE IS CHECKED AGAINST THE MERGED ROW. Handed only the changes,
   * a clash check sees a booking with no coach and no time and reports no clash
   * — so moving a session onto an occupied hour is accepted every time, as long
   * as the coach was not part of the edit.
   */
  const obeys = async (
    ctx: { fail(code: "platform.conflict", meta: Record<string, string>): never },
    db: SqlHandle, tenantId: string, id: string | null, row: Record<string, unknown>,
  ) => {
    if (!spec.rule) return;
    const ok = await spec.rule.check({ db, tenantId, table, id, row });
    if (!ok) ctx.fail("platform.conflict", { reason: spec.rule.why });
  };

  /** The append-only record of who changed what. Off only for pure caches. */
  const note = async (ctx: unknown, rowId: string, verb: string, at: Instant) => {
    if (!spec.activity) return;
    const { db, tenantId, actor } = store(ctx);
    await db.run(
      `INSERT INTO activity (id, tenant_id, collection, row_id, verb, actor_id, at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      crypto.randomUUID(), tenantId, spec.id, rowId, verb, actor, at,
    );
  };

  const list = operation({
    id: `${spec.id}.list`,
    kind: "read",
    summary: `List ${spec.label.many.toLowerCase()}.`,
    input: s.object({ limit: s.optional(s.number({ integer: true, min: 1, max: 200 })), search: s.optional(s.text({ max: 100 })) }),
    output: s.object({ rows: s.json() }),
    permission: read,
    idempotency: { mode: "none" },
    async handler(ctx, input: { limit?: number; search?: string }) {
      const { db, tenantId, scope } = store(ctx);
      /*
        ⚠️ A CEILING WITH NO WAY TO OPT OUT. An unbounded list is one row count
        away from a response nothing can render and a worker that runs out of
        memory — and the row count is the tenant's, so it grows without anybody
        deciding it should.
      */
      const limit = Math.min(input.limit ?? 50, 200);
      const terms = spec.search ?? [];
      const searching = input.search && terms.length;
      const where = `${scope.where}${liveClause(spec)}${searching ? ` AND (${terms.map((t) => `${columnName(t)} LIKE ?`).join(" OR ")})` : ""}`;
      const binds = [...scope.binds(tenantId), ...(searching ? terms.map(() => `%${input.search}%`) : [])];
      const rows = await db.all<Record<string, unknown>>(`SELECT ${selectable.join(", ")} FROM ${table} WHERE ${where} ORDER BY created_at DESC LIMIT ?`, ...binds, limit);
      return { rows: rows.map((r) => present(spec, r)) };
    },
  });

  const readOne = operation({
    id: `${spec.id}.read`,
    kind: "read",
    summary: `Read one ${spec.label.one.toLowerCase()}.`,
    input: s.object({ id: s.id(spec.id) }),
    output: s.object({ row: s.json() }),
    permission: read,
    idempotency: { mode: "none" },
    fails: ["platform.not_found"],
    async handler(ctx, input: { id: string }) {
      const { db, tenantId, scope } = store(ctx);
      const row = await db.first<Record<string, unknown>>(`SELECT ${selectable.join(", ")} FROM ${table} WHERE id = ? AND ${scope.where}${liveClause(spec)}`, input.id, ...scope.binds(tenantId));
      if (!row) ctx.fail("platform.not_found");
      return { row: present(spec, row!) };
    },
  });

  const create = operation({
    id: `${spec.id}.create`,
    kind: "write",
    summary: `Add a ${spec.label.one.toLowerCase()}.`,
    input: bodyShape(spec, false, true, schemas),
    output: s.object({ id: s.id(spec.id), version: s.number({ integer: true }) }),
    permission: write,
    /*
      ⚠️ THE ONE WRITE THAT IS NOT IDEMPOTENT BY CONSTRUCTION, on every
      collection at once. An update names the row it changes and a delete names
      the row it removes; a create names nothing, so a request that arrives twice
      makes two rows. That is what a queued offline write does when the answer to
      the first attempt is what went missing — and only the caller can say the
      two attempts were one intent, which is what this mode asks it to do.
    */
    // vocabulary-exempt: the HTTP caller, not somebody's customer — the mode's
    // own name, declared in the kernel with the same exemption.
    idempotency: { mode: "client-supplied" },
    fails: ["platform.invalid", "platform.forbidden"],
    audit: () => ({ subject: spec.id, verb: "create" }),
    outcome: { message: `${spec.label.one} saved`, tone: "success", invalidates: [spec.id] },
    async handler(ctx, input: Record<string, unknown>) {
      const { db, tenantId, subjectId } = store(ctx);
      const at = ctx.now();
      const id = `${spec.id.slice(0, 3)}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
      const refusedFields = unwritable(spec, input, (p) => ctx.holds(p));
      if (refusedFields.length) ctx.fail("platform.forbidden", { fields: refusedFields.join(", ") });
      /*
        ⚠️ AFTER THE WRITE CHECK, so a caller who SENT a restricted field is
        still refused rather than having their value quietly replaced by the
        initial — which would report success and store something else.
      */
      const body = withInitials(spec, input);
      await checkMedia(ctx, body, db, tenantId);
      await obeys(ctx, db, tenantId, null, body);
      const [names, values] = columnValues(spec, body);
      /*
        ⚠️ A SUBJECT-SCOPED ROW WITH NO SUBJECT IS A ROW NOBODY OWNS. The column
        is `NOT NULL` in the derived DDL, so writing one without a subject is a
        constraint violation surfacing as an unavailable — refusing here says
        what actually happened.
      */
      /*
        ⚠️ THE CALLER'S OWN SUBJECT WINS OVER THE BODY. A customer naming somebody
        else is writing into another person's history, so their own is used and
        the field is ignored — the narrowing cannot be argued out of over the
        wire. Staff have no subject, so theirs comes from the body.
      */
      const named = spec.scope.of === "subject" ? (input[spec.scope.subject] as string | undefined) : undefined;
      const owner = subjectId ?? named;
      if (spec.scope.of === "subject" && !owner) ctx.fail("platform.invalid", { field: spec.scope.subject });

      /*
        ⚠️ ARTICLE 9 CONSENT, CHECKED WHERE THE ROW IS ACTUALLY WRITTEN.

        Fifteen of Kova's collections declared `condition: "explicit_consent"`
        and nothing anywhere collected any — the manifest asserted a legal basis
        the product did not have, which is worse than declaring the wrong one
        because it reads as diligence.

        ⚠️ AND IT IS DERIVED FROM THE DECLARATION RATHER THAN LISTED. Adding a
        collection that holds a special category about a subject is the whole of
        what it takes to bring it under this rule; there is no list to forget.
        Special-category processing is PROHIBITED without a condition, so this
        refuses rather than shapes.
      */
      if (owner && needsExplicitConsent(spec)) {
        const held = await consentOf(db, tenantId, owner);
        if (!held.given) {
          ctx.fail("platform.consent_required", {
            documents: `explicit consent from this ${spec.scope.of === "subject" ? spec.scope.subject : "person"}`,
          });
        }
      }
      const owned = spec.scope.of === "subject" ? [subjectColumn(spec)] : [];
      const system = ["id", "version", "created_at", "updated_at", ...(spec.scope.of === "platform" ? [] : ["tenant_id"]), ...owned];
      const systemValues = [id, 1, at, at, ...(spec.scope.of === "platform" ? [] : [tenantId]), ...(owned.length ? [owner!] : [])];
      const all = [...system, ...names];
      await db.run(
        `INSERT INTO ${table} (${all.join(", ")}) VALUES (${all.map(() => "?").join(", ")})`,
        ...systemValues, ...values,
      );
      await note(ctx, id, "create", at as Instant);
      return { id, version: 1 };
    },
  });

  const update = operation({
    id: `${spec.id}.update`,
    kind: "write",
    summary: `Change a ${spec.label.one.toLowerCase()}.`,
    /*
      ⚠️ THE EXPECTED VERSION IS REQUIRED, and it comes from the READ the change
      was based on. Two people editing one record is the case everybody pictures;
      the one that bites is a tool call racing a person — same defect, worse
      timing, and nobody watching.
    */
    input: s.object({ id: s.id(spec.id), version: s.number({ integer: true }), changes: bodyShape(spec, true, false, schemas) }),
    output: s.object({ version: s.number({ integer: true }) }),
    permission: write,
    idempotency: { mode: "none" },
    audit: (i: { id: string }) => ({ subject: i.id, verb: "update" }),
    outcome: { message: "Saved", tone: "success", invalidates: [spec.id] },
    fails: ["platform.not_found", "platform.conflict", "platform.invalid", "platform.forbidden"],
    async handler(ctx, input: { id: string; version: number; changes: Record<string, unknown> }) {
      const { db, tenantId, scope } = store(ctx);
      const current = await db.first<{ version: number; docstatus?: number }>(
        `SELECT version${spec.docStatus ? ", docstatus" : ""} FROM ${table} WHERE id = ? AND ${scope.where}${liveClause(spec)}`,
        input.id, ...scope.binds(tenantId),
      );
      if (!current) ctx.fail("platform.not_found");
      if (current!.version !== input.version) ctx.fail("platform.conflict");

      /*
        ⚠️ A SUBMITTED DOCUMENT FREEZES WHAT IT ASSERTED. If the quantity on a
        submitted record could still move, the signature on it means nothing —
        and everything else stays editable, because a typo in a note is not a
        reason to force an amendment.
      */
      if (spec.docStatus) {
        const state = (["draft", "submitted", "cancelled"] as const)[current!.docstatus ?? 0]!;
        const refused = refusesChange(state, spec, Object.keys(input.changes));
        if (refused.length) ctx.fail("platform.invalid", { fields: refused.join(", ") });
      }

      const refusedFields = unwritable(spec, input.changes, (p) => ctx.holds(p));
      if (refusedFields.length) ctx.fail("platform.forbidden", { fields: refusedFields.join(", ") });

      await checkMedia(ctx, input.changes, db, tenantId);
      if (spec.rule) {
        const whole = await db.first<Record<string, unknown>>(
          `SELECT ${selectable.join(", ")} FROM ${table} WHERE id = ? AND ${scope.where}`, input.id, ...scope.binds(tenantId),
        );
        await obeys(ctx, db, tenantId, input.id, { ...fromColumns(spec, whole ?? {}), ...input.changes });
      }
      const [names, values] = columnValues(spec, input.changes);
      if (!names.length) return { version: current!.version };
      const at = ctx.now();
      await db.run(
        `UPDATE ${table} SET ${names.map((n) => `${n} = ?`).join(", ")}, version = version + 1, updated_at = ? WHERE id = ? AND version = ?`,
        ...values, at, input.id, input.version,
      );
      await note(ctx, input.id, "update", at as Instant);
      return { version: current!.version + 1 };
    },
  });

  const remove = operation({
    id: `${spec.id}.delete`,
    kind: "write",
    summary: `Remove a ${spec.label.one.toLowerCase()}.`,
    input: s.object({ id: s.id(spec.id) }),
    output: s.object({ archived: s.bool() }),
    permission: write,
    idempotency: { mode: "natural", key: "id" },
    audit: (i: { id: string }) => ({ subject: i.id, verb: "delete" }),
    fails: ["platform.not_found"],
    async handler(ctx, input: { id: string }) {
      const { db, tenantId, scope } = store(ctx);
      const at = ctx.now() as Instant;
      /*
        ⚠️ WHAT DELETING MEANS IS THE COLLECTION'S DECISION, because it is a
        RETENTION one: a record a regulation requires kept cannot be purged on a
        whim, and a record somebody asked to be forgotten cannot be archived
        instead.
      */
      const how = deletionFor(spec, at);
      const found = await db.first<{ id: string }>(`SELECT id FROM ${table} WHERE id = ? AND ${scope.where}`, input.id, ...scope.binds(tenantId));
      if (!found) ctx.fail("platform.not_found");

      if (how.kind === "archive") {
        await db.run(`UPDATE ${table} SET deleted_at = ?, updated_at = ? WHERE id = ?`, how.at, at, input.id);
      } else {
        await db.run(`DELETE FROM ${table} WHERE id = ?`, input.id);
      }
      await note(ctx, input.id, how.kind === "archive" ? "archive" : "purge", at);
      return { archived: how.kind === "archive" };
    },
  });

  const activity = operation({
    id: `${spec.id}.activity`,
    kind: "read",
    summary: `Who changed a ${spec.label.one.toLowerCase()}, and when.`,
    input: s.object({ id: s.id(spec.id) }),
    output: s.object({ entries: s.json() }),
    permission: read,
    idempotency: { mode: "none" },
    async handler(ctx, input: { id: string }) {
      const { db, tenantId, scope } = store(ctx);
      const entries = await db.all(
        `SELECT verb, actor_id, at FROM activity WHERE tenant_id = ? AND collection = ? AND row_id = ? ORDER BY at DESC LIMIT 100`,
        tenantId, spec.id, input.id,
      );
      return { entries };
    },
  });

  const lifecycle = spec.docStatus ? [transitionOp("submit"), transitionOp("cancel"), ...(spec.docStatus.amendable ? [transitionOp("amend")] : [])] : [];

  function transitionOp(kind: "submit" | "cancel" | "amend") {
    return operation({
      id: `${spec.id}.${kind}`,
      kind: "write",
      summary: `${kind[0]!.toUpperCase()}${kind.slice(1)} a ${spec.label.one.toLowerCase()}.`,
      input: s.object({ id: s.id(spec.id) }),
      output: s.object({ state: s.text(), newId: s.optional(s.text()) }),
      permission: write,
      idempotency: { mode: "natural", key: "id" },
      audit: (i: { id: string }) => ({ subject: i.id, verb: kind }),
      /*
        ⚠️ THE TRANSITION IS WHAT RAISES IT, so there is one way to finish a
        document rather than an operation beside the lifecycle that has to be
        kept in step with it.
      */
      ...(spec.docStatus?.emits?.[kind] ? { emits: [spec.docStatus.emits[kind]!] } : {}),
      fails: ["platform.not_found", "platform.invalid"],
      async handler(ctx, input: { id: string }) {
        const { db, tenantId, scope } = store(ctx);
        const row = await db.first<Record<string, unknown> & { docstatus: number }>(
          `SELECT ${[...selectable, ...(spec.onDelete.on === "archive" ? ["deleted_at"] : [])].join(", ")} FROM ${table} WHERE id = ? AND ${scope.where}`,
          input.id, ...scope.binds(tenantId),
        );
        if (!row) ctx.fail("platform.not_found");

        const from = (["draft", "submitted", "cancelled"] as const)[row!.docstatus] as DocState;
        const result = transition(from, kind, spec);
        if (!result.ok) ctx.fail("platform.invalid", { reason: result.why });
        const at = ctx.now() as Instant;

        /*
          ⚠️ AN AMENDMENT IS A NEW DOCUMENT, NEVER AN EDIT. A cancelled record
          corrected in place would let the correction and the original share an
          identity — so a reference to it means one thing before the edit and
          another after, and any audit trail pointing at it describes something
          that no longer exists. `amended_from` keeps the chain walkable.
        */
        if (result.ok && result.newDocument) {
          const newId = `${spec.id.slice(0, 3)}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
          const carried = cols.map(([, c]) => c);
          const all = ["id", "version", "created_at", "updated_at", ...(spec.scope.of === "platform" ? [] : ["tenant_id"]), "docstatus", "amended_from", ...carried];
          await db.run(
            `INSERT INTO ${table} (${all.join(", ")}) SELECT ?, 1, ?, ?, ${spec.scope.of === "platform" ? "" : "tenant_id, "}0, id, ${carried.join(", ")} FROM ${table} WHERE id = ?`,
            newId, at, at, input.id,
          );
          await note(ctx, newId, "amend", at);
          return { state: result.to as string, newId };
        }

        await db.run(`UPDATE ${table} SET docstatus = ?, version = version + 1, updated_at = ? WHERE id = ?`,
          result.ok ? ["draft", "submitted", "cancelled"].indexOf(result.to) : 0, at, input.id);
        await note(ctx, input.id, kind, at);
        return { state: (result.ok ? result.to : from) as string };
      },
    });
  }

  const ops = [list, readOne, create, update, remove, ...lifecycle, ...(spec.activity ? [activity] : [])];

  /**
   * ⚠️ THE COLLECTION'S GATES APPLIED IN ONE PLACE, over every operation it
   * derives.
   *
   * Attaching them at each declaration site above would mean seven chances to
   * omit one, and the omission is invisible: six operations refuse correctly and
   * the seventh is the one nobody thought to try. Here there is one rule and no
   * site to forget.
   *
   * `quota` lands on the two operations that ADD a row and on nothing else.
   * Counting a read against a ceiling would withhold what a workspace already
   * stored the moment it downgraded, which is holding their own records hostage
   * rather than withholding a product — and an amendment is a new document, so
   * it counts exactly as a create does.
   */
  const ADDS = new Set([`${spec.id}.create`, `${spec.id}.amend`]);
  const gated = ops.map((op) => ({
    ...op,
    ...(spec.entitlement ? { entitlement: spec.entitlement } : {}),
    ...(spec.quota && ADDS.has(op.id) ? { quota: spec.quota } : {}),
    /*
      ⚠️ WRITES ONLY, for the reason stated on the declaration: a lapsed
      customer's history is something they recorded themselves, and taking it
      away is holding their own records hostage rather than withholding a
      product. Reads stay open at every rung of the customer ladder, exactly as
      they do at every rung of the payment one.
    */
    ...(spec.customerFlag && op.kind === "write" ? { customerFlag: spec.customerFlag } : {}),
  }));
  return gated as unknown as readonly AnyOperation[];
}

/**
 * A stored row becomes the shape a rule was written against.
 *
 * ⚠️ FIELD NAMES, NOT COLUMN NAMES. A rule reads `startsAt` because that is what
 * the declaration calls it; handing it `starts_at` makes every lookup `undefined`
 * and every rule pass, silently, on every update.
 */
function fromColumns(spec: CollectionSpec, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  /*
    ⚠️ THE SUBJECT IS PART OF THE ROW, and it is not one of the declared fields —
    so a merge that walked `fields` alone handed every rule a row belonging to
    nobody. A rule that narrows by customer then finds no customer, takes its
    "not enough to judge" branch, and passes every update. It is the same defect
    as merging under column names, one column over.
  */
  if (spec.scope.of === "subject") out[spec.scope.subject] = row[subjectColumn(spec)];

  for (const [name, f] of Object.entries(spec.fields)) {
    if (f.kind === "money") continue;
    const column = columnName(name);
    if (column in row) out[name] = f.kind === "bool" ? row[column] === 1 : row[column];
  }
  return out;
}

/**
 * A stored row as the caller who wrote it would recognise it.
 *
 * ⚠️ A COLLECTION SPEAKS ONE VOCABULARY IN BOTH DIRECTIONS. Writes take declared
 * field names, real booleans and real objects; reads were handing back storage —
 * `how_it_went` for a field called `howItWent`, `1` for a bool, and a JSON
 * column as the TEXT it is stored in.
 *
 * The mismatch is not merely untidy. The obvious client — read a record, change
 * one thing, send it back — takes a JSON field out as a string and puts it back
 * as one, so the column ends up holding an encoded encoding, and the next read
 * returns a string that parses to a string. Nothing throws at any point.
 *
 * ⚠️ SYSTEM COLUMNS KEEP THEIR STORAGE NAMES. `id`, `version`, `created_at` and
 * `updated_at` are the platform's rather than the collection's, they appear in
 * every payload the platform emits, and renaming them here would make one
 * surface disagree with the rest for no gain.
 */
function present(spec: CollectionSpec, row: Record<string, unknown>): Record<string, unknown> {
  const declared = new Set<string>();
  for (const name of Object.keys(spec.fields)) declared.add(columnName(name));
  const out: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(row)) if (!declared.has(column)) out[column] = value;

  for (const [name, f] of Object.entries(spec.fields)) {
    const column = columnName(name);
    if (f.kind === "money") {
      if (`${column}_minor` in row) {
        out[name] = { minor: row[`${column}_minor`], currency: row[`${column}_currency`] };
        delete out[`${column}_minor`];
        delete out[`${column}_currency`];
      }
      continue;
    }
    if (!(column in row)) continue;
    const v = row[column];
    if (f.kind === "bool") out[name] = v === null || v === undefined ? null : v === 1;
    /*
      ⚠️ AN UNPARSEABLE COLUMN TRAVELS AS IT IS RATHER THAN AS AN ERROR. It is
      somebody's record, and a read that refuses is a record they can no longer
      see at all — which is strictly worse than one they can see is wrong.
    */
    else if (f.kind === "json" && typeof v === "string") out[name] = parseOr(v);
    else out[name] = v;
  }
  return out;
}

const parseOr = (text: string): unknown => {
  try { return JSON.parse(text); } catch { return text; }
};


/**
 * Fields this body sets that the caller may not write.
 *
 * ⚠️ A FIELD MAY BE NARROWER THAN ITS ROW, and until this ran, `write` on a
 * field was a declaration nothing read.
 *
 * The shape it exists for: a customer opens a record and the studio answers it.
 * A swap request is the clearest — the client must hold the collection's write
 * permission to ASK, and that same permission opened the derived update, so they
 * could set `state` to allowed and answer their own question. Putting the answer
 * behind its own operation is a lock beside an open window while the update is
 * still there.
 *
 * ⚠️ REFUSED, NOT DROPPED. Silently ignoring a field somebody sent is a save
 * button that reports success and changes nothing, which is the failure mode
 * this platform treats as worse than an error.
 */
function unwritable(spec: CollectionSpec, body: Record<string, unknown>, holds: (p: string) => boolean): readonly string[] {
  const out: string[] = [];
  for (const [name, f] of Object.entries(spec.fields)) {
    if (!f.write) continue;
    if (!Object.prototype.hasOwnProperty.call(body, name)) continue;
    if (!holds(f.write)) out.push(name);
  }
  return out;
}

/** ⚠️ Declared starting values, for keys the caller left out. See `Field.initial`. */
function withInitials(spec: CollectionSpec, body: Record<string, unknown>): Record<string, unknown> {
  const out = { ...body };
  for (const [name, f] of Object.entries(spec.fields)) {
    if (f.initial === undefined) continue;
    if (Object.prototype.hasOwnProperty.call(out, name)) continue;
    out[name] = f.initial;
  }
  return out;
}

/** A body becomes columns and binds, money splitting into its two. */
function columnValues(spec: CollectionSpec, body: Record<string, unknown>): [string[], unknown[]] {
  const names: string[] = [];
  const values: unknown[] = [];
  for (const [name, f] of Object.entries(spec.fields)) {
    if (!Object.prototype.hasOwnProperty.call(body, name)) continue;
    const v = body[name];
    if (f.kind === "money") {
      const m = v as { minor: number; currency: string };
      names.push(`${columnName(name)}_minor`, `${columnName(name)}_currency`);
      values.push(m.minor, m.currency);
      continue;
    }
    names.push(columnName(name));
    values.push(f.kind === "bool" ? (v ? 1 : 0) : f.kind === "json" ? JSON.stringify(v) : v);
  }
  return [names, values];
}

/* -------------------------------------------------------------- activity --- */

/** ⚠️ Append-only. Nothing updates or deletes a row here except erasure. */
export const ACTIVITY_SCHEMA = {
  id: "activity",
  ddl: [
    `CREATE TABLE IF NOT EXISTS activity (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, collection TEXT NOT NULL, row_id TEXT NOT NULL, verb TEXT NOT NULL, actor_id TEXT NOT NULL, at TEXT NOT NULL);`,
    `CREATE INDEX IF NOT EXISTS idx_activity_row ON activity(tenant_id, collection, row_id);`,
  ],
  scoped: { tenantColumn: "tenant_id", tenantTables: ["activity"] },
};
