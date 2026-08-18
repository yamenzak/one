/**
 * WHAT THE DEPLOYMENT SELLS, AFTER SOMEBODY EDITED IT.
 *
 * ⚠️ THE DECLARATION STAYS THE AUTHORITY FOR WHAT EXISTS; THE EDIT ONLY MOVES
 * NUMBERS. Which plans there are, which is the lobby, which are commercial and
 * which entitlement keys each one prices are decided in code, where
 * `refuseCatalog` fails the BUILD over them. A store that could add a plan or
 * drop a key would move all of that to runtime, where the same mistake is a
 * deployment that has already been selling something incoherent for a week.
 *
 * ⚠️ SO AN EDIT IS A DIFF, AND EVERY FIELD IN IT IS A PRICE OR A LIMIT. Name,
 * sentence, price, monthly allowance, trial length, and the value of a key the
 * plan already includes. Not the id, not the kind, not the parking flag, not the
 * order, not the currency — each of those is a fact some other mechanism has
 * already agreed with (`mayBrand` gates on the kind, the lobby is what standing
 * falls back to, one Stripe account cannot take two currencies).
 *
 * ⚠️ AND THE EDIT IS CHECKED BY THE SAME FUNCTION THE BUILD USES. `refuseCatalog`
 * runs against the MERGED catalogue before anything is written, and its refusals
 * are what the operator reads. A second, laxer check for the console is how a
 * deployment ends up with a lobby that costs money.
 *
 * ⚠️ A STORED EDIT THAT NO LONGER APPLIES IS IGNORED WHOLE, and the declaration
 * is served. The declaration moves underneath these rows — a key leaves an app,
 * a plan is retired — so an edit written against last month's catalogue can stop
 * merging into a valid one. Serving a broken catalogue would take down every
 * gate on the deployment; serving the declared one is always sound, and
 * `catalogueProblems` is what makes the fallback visible rather than silent.
 */

import type { Allowance, CatalogProblem, EntitlementDef, PlanSpec } from "@engine/kernel";
import { refuseCatalog } from "@engine/kernel";
import { holdEveryoneOn } from "./billing.js";
import type { SchemaModule } from "./schema.js";
import type { Db } from "./sql.js";

/* ----------------------------------------------------------------- schema --- */

export const CATALOGUE_SCHEMA: SchemaModule = {
  id: "catalogue",
  statements: [
    /* ⚠️ ONE ROW PER EDITED PLAN, AND A NULL IS "UNTOUCHED" RATHER THAN ZERO. A
       row holding a full copy of the plan would go on serving last month's
       numbers for every field nobody edited — including the ones a later
       declaration changed on purpose. */
    `CREATE TABLE IF NOT EXISTS plan_edit (
       plan_id TEXT PRIMARY KEY,
       name TEXT, said TEXT,
       price INTEGER, credits INTEGER, trial_days INTEGER,
       includes_json TEXT,
       at TEXT NOT NULL, by TEXT
     );`,
  ],
};

/* ------------------------------------------------------------------ shape --- */

/** What one plan was edited to. Every field is optional; absent means untouched. */
export interface PlanEdit {
  readonly name?: string;
  readonly said?: string;
  readonly price?: number;
  readonly credits?: number;
  readonly trialDays?: number;
  /** ⚠️ Only keys the DECLARED plan already includes — see `applyEdits`. */
  readonly includes?: Readonly<Record<string, Allowance>>;
}

export interface EditedPlan extends PlanEdit {
  readonly planId: string;
  readonly at: string;
  readonly by: string | null;
}

const num = (v: unknown): number | undefined =>
  v === null || v === undefined ? undefined : Math.trunc(Number(v));

const text = (v: unknown): string | undefined =>
  v === null || v === undefined ? undefined : String(v);

/* ------------------------------------------------------------------- read --- */

export async function planEdits(db: Db): Promise<readonly EditedPlan[]> {
  const rows = await db.prepare(`SELECT * FROM plan_edit`).all();
  return rows.results.map((r) => ({
    planId: String(r.plan_id),
    name: text(r.name), said: text(r.said),
    price: num(r.price), credits: num(r.credits), trialDays: num(r.trial_days),
    includes: r.includes_json ? JSON.parse(String(r.includes_json)) : undefined,
    at: String(r.at), by: text(r.by) ?? null,
  }));
}

/**
 * THE DECLARATION WITH THE EDITS LAID OVER IT.
 *
 * ⚠️ PURE, BECAUSE THE VALIDATION HAS TO RUN OVER THE RESULT TWICE — once
 * before a write, against the edit somebody is proposing, and once at read time
 * against what is stored. Two implementations of "what does this merge to" is
 * how a catalogue comes to pass the check on the way in and fail it on the way
 * out.
 *
 * ⚠️ A KEY THE DECLARED PLAN DOES NOT INCLUDE IS DROPPED, NEVER ADDED. Apps
 * declare the keys; a catalogue that could invent one would sell something no
 * gate reads, which is exactly the shape `sells_undeclared` exists to refuse.
 */
export function applyEdits(
  declared: readonly PlanSpec[],
  edits: readonly EditedPlan[],
): readonly PlanSpec[] {
  const by = new Map(edits.map((e) => [e.planId, e]));
  return declared.map((plan) => {
    const edit = by.get(plan.id);
    if (!edit) return plan;

    const includes: Record<string, Allowance> = { ...plan.includes };
    for (const [key, value] of Object.entries(edit.includes ?? {})) {
      if (key in plan.includes) includes[key] = value;
    }

    return {
      ...plan,
      name: edit.name ?? plan.name,
      said: edit.said ?? plan.said,
      price: edit.price ?? plan.price,
      credits: edit.credits ?? plan.credits,
      /* ⚠️ ZERO IS A REAL ANSWER — "no trial" — so `??` rather than `||`. */
      ...(edit.trialDays === undefined ? {} : { trialDays: edit.trialDays }),
      includes,
    };
  });
}

/**
 * WHAT THIS DEPLOYMENT ACTUALLY SELLS RIGHT NOW.
 *
 * ⚠️ IT FALLS BACK TO THE DECLARATION AND NEVER THROWS. Every gate, every price
 * and every standing resolution reads this, so a bad row here is the whole
 * deployment rather than one screen. The declared catalogue passed
 * `refuseCatalog` at boot, so it is always a safe answer.
 */
export async function effectivePlans(
  db: Db,
  declared: readonly PlanSpec[],
  keys: Readonly<Record<string, EntitlementDef>>,
): Promise<readonly PlanSpec[]> {
  let edits: readonly EditedPlan[];
  try {
    edits = await planEdits(db);
  } catch {
    /* ⚠️ A DEPLOYMENT THAT NEVER APPLIED THIS MODULE SELLS WHAT IT DECLARED,
       which is what every world without the table already believed. */
    return declared;
  }
  if (!edits.length) return declared;

  const merged = applyEdits(declared, edits);
  return refuseCatalog(merged, keys).length ? declared : merged;
}

/**
 * WHY THE EDITED CATALOGUE IS NOT BEING SERVED, IF IT IS NOT.
 *
 * ⚠️ THE FALLBACK ABOVE IS CORRECT AND INVISIBLE, WHICH IS THE PROBLEM IT
 * CREATES. An operator whose edit stopped applying sees the old numbers and no
 * reason; this is the sentence the console shows them.
 */
export async function catalogueProblems(
  db: Db,
  declared: readonly PlanSpec[],
  keys: Readonly<Record<string, EntitlementDef>>,
): Promise<readonly CatalogProblem[]> {
  const edits = await planEdits(db).catch(() => [] as readonly EditedPlan[]);
  if (!edits.length) return [];
  return refuseCatalog(applyEdits(declared, edits), keys);
}

/* ------------------------------------------------------------------ write --- */

export type EditOutcome =
  /** ⚠️ A plan id the declaration does not have. Not a catalogue problem — a
     caller problem, and it wants a different answer from the console. */
  | { readonly ok: false; readonly unknown: true }
  | { readonly ok: false; readonly problems: readonly CatalogProblem[] }
  | { readonly ok: true; readonly held: number; readonly plan: PlanSpec };

/**
 * ONE PLAN'S NUMBERS CHANGE, AND EVERYBODY ALREADY ON IT KEEPS WHAT THEY BOUGHT.
 *
 * ⚠️ THE GRANDFATHERING RUNS BEFORE THE EDIT LANDS, AND THAT ORDER IS THE WHOLE
 * MECHANISM. Afterwards the old numbers are gone and there is nothing left to
 * snapshot — a mistake with no symptom, because the write still succeeds and the
 * rows it should have written simply do not exist.
 *
 * ⚠️ AND THE CHECK IS THE BUILD'S CHECK. `refuseCatalog` over the merged result,
 * refusing rather than correcting: a console that quietly clamped a lobby back
 * under the floor would be deciding a price on an operator's behalf.
 */
export async function editPlan(
  db: Db,
  declared: readonly PlanSpec[],
  keys: Readonly<Record<string, EntitlementDef>>,
  planId: string,
  edit: PlanEdit,
  now: Date,
  by: string | null,
): Promise<EditOutcome> {
  const was = declared.find((p) => p.id === planId);
  if (!was) return { ok: false, unknown: true };

  const stored = await planEdits(db);
  const before = applyEdits(declared, stored);
  const next: EditedPlan = {
    ...(stored.find((e) => e.planId === planId) ?? { planId, at: "", by: null }),
    ...edit, planId, at: now.toISOString(), by,
  };
  const after = applyEdits(declared, [...stored.filter((e) => e.planId !== planId), next]);

  const problems = refuseCatalog(after, keys);
  if (problems.length) return { ok: false, problems };

  /* ⚠️ AGAINST THE EFFECTIVE CATALOGUE, NEVER THE DECLARED ONE. A tier edited
     down twice must be compared with what it was selling yesterday — comparing
     against the declaration would find the first edit's cut a second time and
     miss the second edit's entirely. */
  const held = await holdEveryoneOn(
    db, planId,
    before.find((p) => p.id === planId) ?? was,
    after.find((p) => p.id === planId) ?? was,
  );

  await db.prepare(
    `INSERT INTO plan_edit (plan_id, name, said, price, credits, trial_days, includes_json, at, by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(plan_id) DO UPDATE SET name = excluded.name, said = excluded.said,
       price = excluded.price, credits = excluded.credits, trial_days = excluded.trial_days,
       includes_json = excluded.includes_json, at = excluded.at, by = excluded.by`)
    .bind(
      planId, next.name ?? null, next.said ?? null,
      next.price ?? null, next.credits ?? null, next.trialDays ?? null,
      next.includes ? JSON.stringify(next.includes) : null,
      next.at, by)
    .run();

  return { ok: true, held, plan: after.find((p) => p.id === planId) as PlanSpec };
}

/**
 * A PLAN GOES BACK TO WHAT THE CODE SAYS.
 *
 * ⚠️ IT IS STILL AN EDIT, SO IT STILL GRANDFATHERS. Reverting is usually a
 * widening and takes nothing — but a declaration that moved down since the edit
 * makes the revert a cut, and a way back that quietly took something from paying
 * customers would be the one edit nobody thought to check.
 */
export async function resetPlan(
  db: Db,
  declared: readonly PlanSpec[],
  planId: string,
): Promise<number> {
  const stored = await planEdits(db);
  if (!stored.some((e) => e.planId === planId)) return 0;

  const was = applyEdits(declared, stored).find((p) => p.id === planId);
  const now = declared.find((p) => p.id === planId);
  const held = was && now ? await holdEveryoneOn(db, planId, was, now) : 0;

  await db.prepare(`DELETE FROM plan_edit WHERE plan_id = ?`).bind(planId).run();
  return held;
}

/* ⚠️ EXPORTED FOR THE CONSOLE'S SAKE: a workspace count per plan, so an operator
   about to cut a tier can see how many people that is before they do it, rather
   than after somebody writes in. */
export async function onEachPlan(db: Db): Promise<Readonly<Record<string, number>>> {
  const rows = await db.prepare(
    `SELECT plan_id, COUNT(*) AS n FROM subscription GROUP BY plan_id`).all();
  const out: Record<string, number> = {};
  for (const r of rows.results) out[String(r.plan_id)] = Number(r.n);
  return out;
}
