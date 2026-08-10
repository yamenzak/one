/**
 * GENERATION, METERED — reserve, run, settle, and the two ceilings above it.
 *
 * ⚠️ THERE IS NO PATH THROUGH THIS FILE THAT REACHES A MODEL WITHOUT HOLDING
 * CREDITS FIRST, and that is the whole of it. A shipping product had three ways
 * to generate without metering — a console switch, a missing binding, and a
 * provider failure falling back — and every one of them typechecked, passed
 * every test, and fabricated output in production while still charging for it.
 *
 * ⚠️ AND THERE IS NO MOCK LANE HERE AT ALL. The mock in that product was a
 * fallback inside the platform, so the three ways to reach it were three
 * accidents waiting for a misconfiguration. A deployment that has no inference
 * binding gets a REFUSAL; a test that wants deterministic output binds a handle
 * that returns it. The difference is that one of those is reachable in
 * production by getting a config wrong and the other is not reachable at all.
 */

import type { AiSpec, InferenceHandle, Instant, Rates, SchemaModule, SqlHandle } from "@one/kernel";
import { modelFor, planFeature, settle } from "@one/kernel";
import { balance, hold as holdCredits, record } from "./ledger.js";

/** The unit every generation is priced in. One word, so two apps cannot disagree. */
export const CREDITS = "credits";

export const GENERATION_SCHEMA: SchemaModule = {
  id: "generation",
  ddl: [
    /*
      ⚠️ WHAT WAS SPENT, BY WHOM, ON WHAT — and deliberately NOT the prompt or
      the output. A permanent record of everything every person typed into a
      product is a liability that grows on its own and answers no question
      anybody actually asks about a bill.
    */
    `CREATE TABLE IF NOT EXISTS generation (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, feature TEXT NOT NULL, model TEXT NOT NULL, actor_id TEXT NOT NULL, held INTEGER NOT NULL, charged INTEGER NOT NULL, verdict TEXT, note TEXT, at TEXT NOT NULL);`,
    /* ⚠️ The daily ceiling is a COUNT over this index, never a stored counter. */
    `CREATE INDEX IF NOT EXISTS idx_generation_actor ON generation(tenant_id, actor_id, at);`,
    `CREATE INDEX IF NOT EXISTS idx_generation_recent ON generation(tenant_id, at);`,
  ],
  scoped: { tenantColumn: "tenant_id", tenantTables: ["generation"] },
};

/* -------------------------------------------------------------- the day --- */

/**
 * ⚠️ A DAY IS THE UTC DATE, AND SAYING SO IS BETTER THAN GUESSING ONE.
 *
 * A per-person ceiling anchored on the caller's own timezone resets at a
 * different moment for every person in a workspace, and twice a year some of
 * them get an hour of extra allowance. What a ceiling has to be is predictable
 * to whoever set it, and one clock for the deployment is the only version of
 * that which does not need explaining.
 */
export const dayOf = (at: Instant): string => at.slice(0, 10);

export async function spentToday(db: SqlHandle, tenantId: string, actorId: string, feature: string, at: Instant): Promise<number> {
  const row = await db.first<{ n: number }>(
    `SELECT COUNT(*) AS n FROM generation WHERE tenant_id = ? AND actor_id = ? AND feature = ? AND at >= ?`,
    tenantId, actorId, feature, `${dayOf(at)}T00:00:00.000Z`,
  ).catch(() => null);
  return row?.n ?? 0;
}

/* ------------------------------------------------------------ the result --- */

export type Generated =
  | { readonly ok: true; readonly id: string; readonly output: unknown; readonly charged: number; readonly balance: number }
  | { readonly ok: false; readonly why: Refusal; readonly meta?: Readonly<Record<string, string>> };

/**
 * ⚠️ EACH OF THESE IS A DIFFERENT THING TO DO NEXT, which is why they are not
 * one code. `no_credits` is a purchase, `daily_ceiling` is waiting until
 * tomorrow or asking an owner, `unconfigured` is nothing the person can do at
 * all, and `provider` is trying again. A single "AI unavailable" makes all four
 * look like the fourth.
 */
export type Refusal = "unknown_feature" | "unconfigured" | "no_credits" | "daily_ceiling" | "provider";

export interface GenerateInput {
  readonly db: SqlHandle;
  readonly ai: AiSpec | undefined;
  /**
   * ⚠️ THE DEPLOYMENT'S OWN RATES, WHICH WIN OVER THE MANIFEST'S. A manifest is
   * a deploy and a price change is not, so the declared catalogue is a floor and
   * a shared, correctable rate is preferred — because an out-of-date rate is not
   * a cosmetic error: the reserve caps what may be charged, so every unit it
   * fails to count is one the platform pays for and nobody is billed.
   */
  readonly rates?: Rates;
  /** ⚠️ Null where the deployment binds no model runner. Refused, never mocked. */
  readonly inference: InferenceHandle | null;
  readonly tenantId: string;
  readonly actorId: string;
  readonly feature: string;
  readonly prompt: string;
  /**
   * ⚠️ A PICTURE, WHERE THE FEATURE DECLARED IT TAKES ONE. It arrives as bytes
   * that are ALREADY in the media store — uploaded through the platform's own
   * path, so counted against the workspace's quota and erased with it. A lane
   * that took raw bytes here would be a second way to put somebody's photograph
   * into a request with nothing accounting for it.
   */
  readonly image?: { readonly bytes: ArrayBuffer; readonly contentType: string };
  readonly at: Instant;
}

/**
 * One metered generation.
 *
 * ⚠️ THE ORDER IS PLAN → CEILINGS → HOLD → RUN → SETTLE, and every step is
 * before the one that could make it moot.
 *
 * The ceilings come before the hold because refusing after a debit means a
 * refund, and a refund that fails is money taken for nothing. The hold comes
 * before the run because a run that succeeds against a balance nobody checked
 * is a call the platform pays for. And the settle comes after the run whatever
 * the run did — including when it threw, which is the case a `return` inside a
 * `try` quietly skips.
 */
export async function generate(input: GenerateInput): Promise<Generated> {
  const feature = input.ai?.features[input.feature];
  const run = input.ai ? planFeature(input.ai, input.feature, input.prompt, input.rates ?? {}) : null;
  if (!feature || !run) return { ok: false, why: "unknown_feature" };

  /*
    ⚠️ NO RUNNER IS A REFUSAL AND NEVER A FALLBACK. This is the whole reason the
    mock lives in a test's bindings rather than in this file: a deployment that
    has lost its inference binding must stop generating, not start inventing.
  */
  if (!input.inference) return { ok: false, why: "unconfigured" };

  const model = modelFor(input.ai!, feature.model, input.rates ?? {})!;
  /*
    ⚠️ RESIDENCY IS NOT ONLY STORAGE. A region carries a sub-processor
    allow-list, and a model outside it is refused rather than quietly run
    somewhere a workspace was promised its data would not go.
  */
  if (input.inference.permitted.length > 0 && !input.inference.permitted.includes(model.id)) {
    return { ok: false, why: "unconfigured", meta: { reason: "not permitted in this region" } };
  }

  /*
    ⚠️ THE PICTURE AND THE DECLARATION HAVE TO AGREE, IN BOTH DIRECTIONS.
    An image sent to a feature that declared none is metered by a reserve that
    budgeted for text alone — it succeeds, and the platform pays for the picture.
    A feature that declared one and was sent nothing is a request the model
    cannot answer, refused here rather than as a provider error somebody retries.
  */
  if (feature.takes === "image" && !input.image) {
    return { ok: false, why: "unconfigured", meta: { reason: "this asks for a picture and none was given" } };
  }
  if (feature.takes !== "image" && input.image) {
    return { ok: false, why: "unconfigured", meta: { reason: "this takes no picture" } };
  }

  const used = await spentToday(input.db, input.tenantId, input.actorId, input.feature, input.at);
  if (used >= feature.dailyPerPerson) {
    return { ok: false, why: "daily_ceiling", meta: { limit: String(feature.dailyPerPerson), used: String(used) } };
  }

  const held = run.reserve;
  /*
    ⚠️ THE HOLD IS TAKEN BEFORE THE RUN, AND THE CHECK IS PART OF THE WRITE.
    Reading a balance and then running leaves a window in which two calls both
    see enough and both proceed — and the overspend is not a wrong number, it is
    a second call to a provider that the platform pays for in full. A conditional
    debit closes it; a debit after the run does not close it at all.
  */
  const before = await balance(input.db, input.tenantId, CREDITS);
  const took = await holdCredits(input.db, input.tenantId, { unit: CREDITS, amount: -held, reason: `hold:${input.feature}`, actorId: input.actorId }, input.at);
  if (!took) return { ok: false, why: "no_credits", meta: { need: String(held), have: String(before) } };

  let output: unknown;
  let reported: number | null = null;
  let failed = false;
  try {
    const answer = await input.inference.run(model.id, {
      system: run.system,
      prompt: input.prompt,
      maxOutput: feature.maxOutput,
      ...(input.image ? { image: input.image } : {}),
      ...(feature.produces === "image" ? { produces: "image" as const, images: feature.images ?? 1 } : {}),
    });
    output = (answer as { output?: unknown })?.output ?? answer;
    /*
      ⚠️ AN IMAGE SETTLES AT THE RESERVE, ALWAYS. There are no units to report
      and nothing a provider could say that would make the picture cheaper — so
      reading a usage block here would let a provider that returns one for its
      text models discount every image by whatever happened to be in it.
    */
    reported = feature.produces === "image" ? null : usageOf(answer, model.rate);
  } catch {
    failed = true;
  }

  /*
    ⚠️ A FAILED RUN IS REFUNDED IN FULL, and it is the one case where charging
    nothing is right: the workspace has no output. A provider that failed after
    doing work is the provider's problem with us, not ours with the workspace.
  */
  const charged = failed ? 0 : settle(held, reported);
  if (charged !== held) {
    await record(input.db, input.tenantId, { unit: CREDITS, amount: held - charged, reason: `settle:${input.feature}`, actorId: input.actorId }, input.at);
  }

  /*
    ⚠️ RECORDED EVEN WHEN IT FAILED AND EVEN WHEN IT COST NOTHING. The row is
    what answers "why was I charged that" and "why did this stop working", and a
    table holding only the successes answers the first question and none of the
    second — while also making the daily ceiling something a failing provider
    lets somebody loop past for free.
  */
  const id = `gen_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  await input.db.run(
    `INSERT INTO generation (id, tenant_id, feature, model, actor_id, held, charged, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id, input.tenantId, input.feature, model.id, input.actorId, held, charged, input.at,
  ).catch(() => undefined);

  if (failed) return { ok: false, why: "provider" };
  return { ok: true, id, output, charged, balance: before - charged };
}

/**
 * What the provider says it spent, in credits.
 *
 * ⚠️ A MISSING REPORT IS `null`, NEVER A RECOUNT OF THE TEXT THAT CAME BACK. A
 * recount can only ever come in low — the cap already catches the other
 * direction — so it would turn every unreported call into a discount. `settle`
 * reads a null as "charge the reserve", which is the one answer that is never
 * wrong in the expensive direction.
 */
export function usageOf(answer: unknown, rate: { readonly input: number; readonly output: number }): number | null {
  const usage = (answer as { usage?: { input?: unknown; output?: unknown } })?.usage;
  if (!usage) return null;
  const inUnits = typeof usage.input === "number" ? usage.input : null;
  const outUnits = typeof usage.output === "number" ? usage.output : null;
  if (inUnits === null || outUnits === null) return null;
  return Math.ceil(inUnits * rate.input + outUnits * rate.output);
}

/* --------------------------------------------------------------- reading --- */

export interface Spend {
  readonly id: string;
  readonly feature: string;
  readonly model: string;
  readonly actorId: string;
  readonly charged: number;
  /** ⚠️ Null until somebody says. A generation nobody judged is not a good one. */
  readonly verdict: string | null;
  readonly at: string;
}

/**
 * Record that a generation was wrong.
 *
 * ⚠️ THE ONLY WAY A MODEL CHOICE IS EVER REVISITED. Without somewhere to say
 * "this was wrong", the only signal a catalogue ever gets is that people quietly
 * stop using a feature — which reads, in every metric, as a feature nobody
 * wanted rather than one that does not work.
 */
export async function judge(db: SqlHandle, tenantId: string, id: string, verdict: string, note: string): Promise<boolean> {
  const found = await db.first<{ id: string }>(`SELECT id FROM generation WHERE tenant_id = ? AND id = ?`, tenantId, id).catch(() => null);
  if (!found) return false;
  await db.run(`UPDATE generation SET verdict = ?, note = ? WHERE tenant_id = ? AND id = ?`, verdict, note, tenantId, id);
  return true;
}

/**
 * ⚠️ "WHAT WERE MY CREDITS SPENT ON" IS A QUESTION WITH NO OTHER ANSWER. A
 * balance that only goes down, with a ledger nobody can read, is the same
 * silence as an unread run table — and it is the first thing anybody asks the
 * day a number looks wrong.
 */
export async function spending(db: SqlHandle, tenantId: string, limit: number): Promise<readonly Spend[]> {
  const rows = await db.all<{ id: string; feature: string; model: string; actor_id: string; charged: number; verdict: string | null; at: string }>(
    `SELECT id, feature, model, actor_id, charged, verdict, at FROM generation WHERE tenant_id = ? ORDER BY at DESC LIMIT ?`,
    tenantId, limit,
  ).catch(() => []);
  return rows.map((r) => ({ id: r.id, feature: r.feature, model: r.model, actorId: r.actor_id, charged: r.charged, verdict: r.verdict, at: r.at }));
}
