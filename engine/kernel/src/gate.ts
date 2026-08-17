/**
 * THE ONE PLACE A REQUEST IS REFUSED.
 *
 * ⚠️ THE ORDER IS THE DESIGN. Standing → permission → kind → proof → entitlement
 * → flag → quota → credits, and each position is a decision about what somebody
 * should be told first:
 *
 *   standing    a workspace in arrears is not told which of its powers it lacks
 *               — that is a conversation about the bill, not about roles.
 *   permission  before proof, because asking somebody to confirm their identity
 *               for something they may not do anyway is a code sent for nothing.
 *   kind        above entitlement, because no plan a PERSONAL workspace can buy
 *               unlocks a commercial-only capability — offering an upgrade would
 *               be selling something that does not exist — and above proof for
 *               the same reason permission is: a code sent for a door that
 *               cannot open.
 *   proof       before anything that costs, so nothing is spent on a request
 *               that is about to ask for a code.
 *   entitlement before quota: "your plan does not include this" and "you have
 *               used all of yours" are different sentences with different
 *               buttons, and showing the second for the first sells nothing.
 *   flag        after entitlement, because a flag is our switch and an
 *               entitlement is their purchase — a customer should never be told
 *               to upgrade for something we have turned off.
 *   quota       before credits, because a refusal that spends nothing is always
 *               better than one that does.
 *   credits     last, because it is the only gate that TAKES something.
 *
 * ⚠️ AND A REFUSAL CARRIES THE VALUES ITS SENTENCE NEEDS. "Your plan includes 5
 * and 5 are in use" is actionable; the same refusal without them renders "your
 * plan includes undefined", which is what a real product showed real people.
 *
 * Layer 3. Imports primitives, problem, operation, entitlement, access.
 */

import { allowanceOf, withinQuota, type Resolved } from "./entitlement.js";
import type { AnyOperation, Gate } from "./operation.js";
import { GATE_ORDER, PUBLIC } from "./operation.js";
import type { Problem, ProblemCatalog } from "./problem.js";
import { problem } from "./problem.js";
/* ⚠️ `Standing` has ONE home, in tenancy. Two shapes for it is how the gate and
   the entitlement walk come to disagree about whether a tenant is being served. */
import type { Kind, Standing } from "./tenancy.js";

export interface Caller {
  readonly signedIn: boolean;
  readonly permissions: ReadonlySet<string>;
  /** When they last proved it was them. Null is never. */
  readonly provenAt: string | null;
}

export interface Ledger {
  readonly balance: number;
}

export interface Ask {
  readonly op: AnyOperation;
  readonly caller: Caller;
  readonly standing: Standing;
  /**
   * ⚠️ WHAT THIS WORKSPACE IS. Absent means the question has no answer here —
   * the operations about YOURSELF run outside every workspace — and a
   * commercial-only operation on that lane is refused rather than waved
   * through, because "no workspace" is not "a business".
   */
  readonly kind?: Kind;
  /** ⚠️ Its name, because the refusal is a sentence with the name in it. */
  readonly workspace?: string;
  readonly entitlements: readonly Resolved[];
  readonly flags: Readonly<Record<string, boolean>>;
  /** How many of the quota's thing already exist. */
  readonly used: (key: string) => number;
  readonly ledger: Ledger;
  readonly now: string;
  readonly catalog: ProblemCatalog;
}

/** How long a proof lasts. Long enough to finish a task, short enough to matter. */
export const PROOF_WINDOW_MS = 15 * 60 * 1000;

export interface Refused {
  readonly at: Gate;
  readonly problem: Problem;
}

/**
 * Whether this may proceed.
 *
 * ⚠️ ONE FUNCTION, AND EVERY CALLER USES IT. A second implementation of "may
 * this happen" is how a screen comes to offer what a route refuses — and the
 * screen is always the one people believe, because it is the one they can see.
 */
export function check(ask: Ask): Refused | null {
  const { op, caller, catalog } = ask;
  const no = (at: Gate, code: string, values: Record<string, string | number> = {}): Refused =>
    ({ at, problem: problem(catalog, code, values) });

  for (const gate of GATE_ORDER) {
    switch (gate) {
      case "standing": {
        /* ⚠️ Reads pass every rung — see `Standing`. */
        if (op.kind === "write" && !ask.standing.writable) {
          return no("standing", "platform.read_only", { reason: ask.standing.reason });
        }
        break;
      }
      case "permission": {
        if (!caller.signedIn) return no("permission", "platform.unauthorized");
        if (op.permission !== PUBLIC && !caller.permissions.has(op.permission as string)) {
          return no("permission", "platform.forbidden");
        }
        break;
      }
      case "kind": {
        /* ⚠️ ABSENT IS NOT PERMISSIVE. An operation running outside every
           workspace has no kind to be commercial, and treating the missing
           answer as a pass is how a gate stops gating on exactly the lane
           nobody tested. */
        if (!op.commercial) break;
        if (ask.kind !== "commercial") {
          return no("kind", "platform.commercial_required",
            { workspace: ask.workspace ?? "this workspace" });
        }
        break;
      }
      case "proof": {
        if (!op.proof) break;
        const fresh = caller.provenAt !== null
          && Date.parse(ask.now) - Date.parse(caller.provenAt) < PROOF_WINDOW_MS;
        if (!fresh) return no("proof", "platform.proof_required");
        break;
      }
      case "entitlement": {
        if (!op.entitlement) break;
        const allowed = allowanceOf(ask.entitlements, op.entitlement);
        if (allowed === false || allowed === 0) return no("entitlement", "platform.payment_required");
        break;
      }
      case "flag": {
        /*
          ⚠️ A FLAG IS OURS AND AN ENTITLEMENT IS THEIRS, which is why an unset
          flag is `not_found` rather than `payment_required`. Telling a customer
          to upgrade for something we have switched off is selling something that
          does not exist.
        */
        if (!op.flag) break;
        if (!ask.flags[op.flag]) return no("flag", "platform.not_found");
        break;
      }
      case "quota": {
        if (!op.quota) break;
        const allowed = allowanceOf(ask.entitlements, op.quota);
        const used = ask.used(op.quota);
        if (!withinQuota(allowed, used)) {
          /* ⚠️ Both numbers, always. They ARE the sentence. */
          return no("quota", "platform.quota_reached", { limit: String(allowed), used: String(used) });
        }
        break;
      }
      case "credits": {
        if (!op.credits) break;
        if (ask.ledger.balance < op.credits) {
          return no("credits", "platform.no_credits", { cost: op.credits, balance: ask.ledger.balance });
        }
        break;
      }
    }
  }
  return null;
}

/**
 * ⚠️ WHAT A SCREEN ASKS BEFORE IT DRAWS A CONTROL, and it is the SAME walk. A
 * screen deciding for itself whether to show a button is a second opinion about
 * access, and the two disagree the first time either changes.
 *
 * It reports the gate rather than a boolean, because "you cannot yet" and "your
 * plan does not include this" want different controls: one is disabled, the
 * other is an upsell.
 */
export const blockedBy = (ask: Ask): Gate | null => check(ask)?.at ?? null;
