/**
 * THE PROOF — Kova's three hardest routes, expressed in the stage 0 types.
 *
 * ⚠️ This file exists to FAIL, cheaply, if the types are wrong. It compiles or
 * it does not; that is the entire test. Picking the three hardest surfaces in a
 * shipping product rather than three convenient ones is what makes a passing
 * compile mean something.
 *
 * The three, and why each was chosen:
 *
 *   1. a read that SHAPES rather than refuses — several capabilities in one
 *      payload, of which a given customer bought some
 *   2. a write behind ROW-LEVEL scope, the invariant no gate replaces
 *   3. a money path that must survive being delivered twice
 *
 * `platform/kernel/test/FINDINGS.md` records what did not fit on the first
 * attempt, which is the actual output of stage 0.
 */

import { z } from "./z.js";
import { defineBindings, sql, objects, cache, actor, inference } from "../src/bindings.js";
import { declareProblems } from "../src/problem.js";
import { operation } from "../src/operation.js";

/* ------------------------------------------------------------- bindings --- */

export const bindings = defineBindings({
  db: sql(),
  media: objects({ jurisdictional: true }),
  cache: cache(),
  billing: actor({ className: "TenantBillingDO", jurisdictional: true }),
  ai: inference({ subprocessors: ["cloudflare-workers-ai", "google-gemini"] }),
});

export const problems = declareProblems({
  "coaching.client_not_assigned": {
    status: 403,
    title: "You're not this client's coach",
    retryable: false,
  },
  "plans.not_publishable": {
    status: 409,
    title: "This plan can't be published yet",
    detail: (m) => `It has ${m.emptyDays} day(s) with no exercises.`,
    retryable: false,
    help: "plans.publishing" as never,
  },
});
void problems;

/* ------------------------------------------------------------------- 1 --- */

/**
 * A read carrying four lenses, of which a customer's package may include two.
 *
 * ⚠️ THE CASE THAT BREAKS A NAIVE GATE. Refusing outright takes the ungated
 * lenses down with the sold ones. Returning everything gives away what was not
 * bought — which is what shipped, sending every personal record and the whole
 * tonnage series to a customer whose package excluded them. Returning a quietly
 * thinner payload makes "withheld" and "empty" indistinguishable, so the screen
 * cannot tell the difference either.
 *
 * `shape` is what the types needed: per-key gating, with the response reporting
 * which keys are present.
 */
export const readProgress = operation({
  id: "coaching.progress.read",
  kind: "read",
  summary: "Read a client's progress across the lenses their package includes.",
  input: z<{ clientId: string; from: string; to: string }>(),
  output: z<{
    wellness: unknown;
    consistency: unknown;
    body?: unknown;
    training?: unknown;
    nutrition?: unknown;
    included: Record<string, boolean>;
  }>(),

  permission: "client:read",
  scope: (i) => ({ client: i.clientId }),
  shape: {
    body: "bodyReport",
    training: "strengthReport",
    nutrition: "nutritionReport",
  },

  idempotency: { mode: "none" },
  fails: ["coaching.client_not_assigned", "platform.not_found"],
  async handler() {
    throw new Error("stage 0: types only");
  },
});

/* ------------------------------------------------------------------- 2 --- */

/**
 * A write behind row-level scope AND an entitlement AND a customer flag.
 *
 * Three different questions that a single "is this person allowed" check
 * conflates: what the STAFF MEMBER may do, what the STUDIO bought from us, and
 * what the CLIENT bought from the studio. A capability is the intersection, and
 * the types have to keep them separate or the intersection cannot be computed.
 */
export const publishPlan = operation({
  id: "training.plan.publish",
  kind: "write",
  summary: "Publish a training plan so the client can start it.",
  input: z<{ planId: string; clientId: string }>(),
  output: z<{ publishedAt: string }>(),

  permission: "plan:publish",
  entitlement: "trainingPlans",
  customerFlag: "trainingPlans",
  scope: (i) => ({ client: i.clientId }),

  idempotency: { mode: "natural", key: "planId" },
  audit: (i) => ({ subject: i.planId, verb: "publish" }),
  outcome: {
    message: "Plan published",
    tone: "success",
    sound: "commit",
    invalidates: ["plan", "client.plans"],
    optimistic: true,
  },
  emits: ["plan.published"],
  fails: ["plans.not_publishable", "coaching.client_not_assigned"],
  async handler() {
    throw new Error("stage 0: types only");
  },
});

/* ------------------------------------------------------------------- 3 --- */

/**
 * The money path — a package grant that must survive redelivery.
 *
 * A payment provider retries on any non-2xx and occasionally redelivers a
 * success. Without a key on the event, each redelivery grants the package
 * again: free access, silently, with a correct-looking 200 every time.
 *
 * ⚠️ `tool: false` with a stated reason. Everything is exposed to the assistant
 * by default; a capability that grants paid access on a provider's say-so is not
 * something a language model should be able to reach, and saying so out loud is
 * cheaper than an allow-list somebody forgets to maintain.
 */
export const applyPackageGrant = operation({
  id: "commerce.package.grant",
  kind: "write",
  summary: "Apply a purchased package's budgets and flags to a customer.",
  input: z<{ subjectId: string; packageId: string; eventId: string }>(),
  output: z<{ daysAdded: number }>(),

  permission: "commerce:grant",
  entitlement: "customerPackages",
  scope: (i) => ({ subject: i.subjectId }),

  idempotency: { mode: "client-supplied" },
  meter: { unit: "credits", reserve: false },
  audit: (i) => ({ subject: i.subjectId, verb: "grant" }),
  emits: ["package.granted"],
  tool: false,
  fails: ["platform.conflict", "platform.not_found"],
  async handler() {
    throw new Error("stage 0: types only");
  },
});

/* Bindings are referenced so the declaration is type-checked against use. */
export type KovaBindings = typeof bindings;
