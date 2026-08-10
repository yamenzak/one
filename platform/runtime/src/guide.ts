/**
 * ANSWERING THE CHECKLIST — by counting, never by remembering.
 *
 * ⚠️ NOTHING HERE WRITES A COMPLETION. Every step is a query against what is
 * actually true, so the list cannot drift from the product, survives somebody
 * moving to another device, and un-checks itself when the thing is deleted.
 *
 * The one table below is for HINTS, and the contrast is the argument: a hint
 * says something not derivable, so "I have seen this" is genuinely the only
 * fact there is — which is exactly the property that makes a tour bad, and
 * exactly why there are at most five.
 */

import {
  liveClause, progressFor, tableNameFor, wizardOf,
  type CollectionSpec, type GuideSpec, type Instant, type SchemaModule, type Setup, type SqlHandle, type Wizard,
} from "@one/kernel";

export const GUIDE_SCHEMA: SchemaModule = {
  id: "guide",
  ddl: [
    `CREATE TABLE IF NOT EXISTS hint_seen (tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, hint TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (tenant_id, user_id, hint));`,
  ],
  scoped: { tenantColumn: "tenant_id", tenantTables: ["hint_seen"] },
};

/* -------------------------------------------------------------- counting --- */

/**
 * What the platform knows that an app cannot count for itself.
 *
 * ⚠️ RESOLVED BY THE CALLER, because each of these lives in a different store:
 * a plan on the subscription, a credential in the identity store, a file in the
 * media ledger, a colleague in whatever the app calls its roster. Passing them
 * in keeps this function one query per step rather than four stores deep.
 */
export interface PlatformFacts {
  readonly plan_chosen: boolean;
  readonly passkey_registered: boolean;
  readonly file_stored: boolean;
  readonly colleague_invited: boolean;
  /** ⚠️ The DEPLOYMENT's, and the only one an operator can act on. */
  readonly payments_configured: boolean;
}

/**
 * Answer every step, by counting.
 *
 * ⚠️ ONE QUERY PER STEP, AND THE STEPS ARE FEW. A checklist is read on nearly
 * every page load of a new workspace, so this is a hot path — but it is bounded
 * by the manifest rather than by data, and a product with thirty onboarding
 * steps has a worse problem than this query.
 */
export async function answerSteps(
  db: SqlHandle,
  guide: GuideSpec,
  collections: readonly CollectionSpec[],
  tenantId: string,
  facts: PlatformFacts,
  /**
   * ⚠️ WHO THIS PERSON IS ON THE CUSTOMER RAIL, for a `person` step. Absent, a
   * person step counting rows is answered NO rather than answered with somebody
   * else's — the two wrong answers are not equally wrong, and "not yet" is the
   * one that leaves the work visible.
   */
  subjectId?: string,
): Promise<Readonly<Record<string, boolean>>> {
  const tables = new Map(collections.map((c) => [c.id, tableNameFor(c)]));
  const byId = new Map(collections.map((c) => [c.id, c]));
  const out: Record<string, boolean> = {};

  for (const step of guide.steps) {
    if (step.answer.kind === "platform") {
      out[step.id] = facts[step.answer.fact];
      continue;
    }
    const spec = byId.get(step.answer.collection);
    const table = spec ? tables.get(spec.id) : undefined;
    if (!spec || !table) { out[step.id] = false; continue; }

    /*
      ⚠️ A PERSON'S STEP COUNTS THEIR OWN ROWS. Composition already refused a
      person step over a collection the whole workspace shares — so what reaches
      here is subject-scoped, and the column exists. Without the predicate a new
      arrival is told their setup is complete because a colleague did it.
    */
    const mine = (step.setup ?? "workspace") === "person" && spec.scope.of === "subject";
    if (mine && !subjectId) { out[step.id] = false; continue; }
    const subjectColumn = spec.scope.of === "subject" ? `${spec.scope.subject.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_id` : "";

    const where = step.answer.where;
    /*
      ⚠️ THE FIELD NAME IS FROM THE MANIFEST, NEVER FROM A REQUEST. Composition
      already refused a filter naming a field the collection does not have, so
      what reaches this template is a declared identifier — and the VALUE is
      still bound rather than interpolated.
    */
    /*
      ⚠️ ARCHIVED ROWS DO NOT COUNT. A collection that archives keeps the row
      and stamps it, so a count that forgets the predicate leaves a step ticked
      after somebody deleted the only thing it counted — telling them their
      workspace contains something it does not.
    */
    const row = await db.first<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ${table} WHERE tenant_id = ?${liveClause(spec)}` +
        `${mine ? ` AND ${subjectColumn} = ?` : ""}${where ? ` AND ${where.field} = ?` : ""}`,
      ...[tenantId, ...(mine ? [subjectId!] : []), ...(where ? [where.equals] : [])],
    ).catch(() => null);

    out[step.id] = (row?.n ?? 0) >= step.answer.atLeast;
  }
  return out;
}

/* ----------------------------------------------------------------- hints --- */

export async function unseenHints(
  db: SqlHandle,
  guide: GuideSpec,
  tenantId: string,
  userId: string,
  role: string,
): Promise<readonly { readonly id: string; readonly surface: string; readonly body: string }[]> {
  const seen = new Set(
    (await db.all<{ hint: string }>(`SELECT hint FROM hint_seen WHERE tenant_id = ? AND user_id = ?`, tenantId, userId).catch(() => []))
      .map((r) => r.hint),
  );
  return guide.hints
    .filter((h) => h.roles.includes(role) && !seen.has(h.id))
    .map((h) => ({ id: h.id, surface: h.surface, body: h.body }));
}

export const dismissHint = (db: SqlHandle, tenantId: string, userId: string, hint: string, at: Instant): Promise<void> =>
  db.run(`INSERT OR IGNORE INTO hint_seen (tenant_id, user_id, hint, at) VALUES (?, ?, ?, ?)`, tenantId, userId, hint, at);

/* ------------------------------------------------------------ the answer --- */

export interface Guidance {
  readonly steps: readonly { readonly id: string; readonly title: string; readonly done: boolean; readonly required: boolean }[];
  readonly blocking: readonly { readonly id: string; readonly title: string }[];
  readonly hints: readonly { readonly id: string; readonly surface: string; readonly body: string }[];
  /**
   * ⚠️ THE WIZARD, AS A PROJECTION OF THE SAME ANSWERS. Not a second endpoint
   * and not a second list — the flow and the checklist cannot disagree about
   * what is still needed, because there is one of them.
   */
  readonly wizard: Wizard;
  /** How far through. Derived, like everything else here. */
  readonly of: number;
  readonly done: number;
}

export async function guidanceFor(input: {
  readonly db: SqlHandle;
  readonly guide: GuideSpec;
  readonly collections: readonly CollectionSpec[];
  readonly tenantId: string;
  readonly userId: string;
  readonly role: string;
  readonly facts: PlatformFacts;
  readonly subjectId?: string;
  /**
   * ⚠️ WHOSE SETUP IS BEING ASKED ABOUT. The operator door asks about the
   * deployment; everywhere else asks about the workspace, and a person's own
   * steps ride along beside them rather than in a third request.
   */
  readonly setup?: Setup;
}): Promise<Guidance> {
  const answered = await answerSteps(input.db, input.guide, input.collections, input.tenantId, input.facts, input.subjectId);
  /*
    ⚠️ THE OPERATOR DOOR ASKS ABOUT THE DEPLOYMENT AND NOTHING ELSE; everywhere
    else a person has their own setup AND the workspace's. Splitting those into
    two requests is how a client ends up rendering one of them.
  */
  const scopes: readonly Setup[] = input.setup === "deployment" ? ["deployment"] : ["workspace", "person"];
  const { steps, blocking } = progressFor(input.guide, input.role, answered, scopes);
  return {
    steps,
    blocking,
    wizard: wizardOf(input.guide, input.role, answered, scopes),
    hints: await unseenHints(input.db, input.guide, input.tenantId, input.userId, input.role),
    of: steps.length,
    done: steps.filter((s) => s.done).length,
  };
}
