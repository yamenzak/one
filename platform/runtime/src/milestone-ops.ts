/**
 * THE SHELF'S ONE OPERATION.
 *
 * ⚠️ READ-ONLY, AND THERE IS NO SECOND ONE. There is no "award" and no "revoke":
 * an award is derived from an event the operation already declared, and a
 * revocation is a product taking something back from somebody who did it. Both
 * absences are the design rather than work not yet done.
 *
 * ⚠️ AND IT TAKES NO ARGUMENT NAMING A PERSON. The shelf is the caller's own,
 * resolved from the session — a parameter here is how a product with no
 * leaderboard grows one, one query string at a time.
 */

import type { AnyOperation, AppSpec, BindingSpec, SqlHandle } from "@one/kernel";
import { operation, s } from "@one/kernel";
import { shelfFor } from "./milestone.js";

/** ⚠️ A symbol, so an app cannot reach the store by writing a property name. */
export const MILESTONES = Symbol.for("one.runtime.milestones");

export interface MilestoneDeps {
  readonly db: SqlHandle;
  readonly tenantId: string;
  readonly userId: string;
  readonly role: string;
}

export interface MilestoneCarrier { readonly [MILESTONES]: MilestoneDeps }

const deps = (ctx: unknown): MilestoneDeps => (ctx as MilestoneCarrier)[MILESTONES];

/**
 * ⚠️ THE PERMISSION AN APP WITH MILESTONES MUST DECLARE. Named here so every
 * product uses one word for it, and refused at composition if it is missing —
 * an operation naming a permission no role holds is refused for everybody,
 * forever, and looks exactly like a feature nobody uses.
 */
export const MILESTONE_PERMISSION = "milestone:read";

export function milestoneOperations<B extends BindingSpec>(app: AppSpec<B>): readonly AnyOperation[] {
  const registry = app.milestones ?? {};
  if (Object.keys(registry).length === 0) return [];

  const list = operation({
    id: "milestone.list",
    kind: "read",
    summary: "What this person has earned, and what they are part-way through.",
    input: s.object({}),
    output: s.object({ rows: s.json() }),
    permission: MILESTONE_PERMISSION,
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      if (!d.userId) return { rows: [] };
      return { rows: await shelfFor({ db: d.db, registry, tenantId: d.tenantId, userId: d.userId, role: d.role }) };
    },
  });

  return [list] as unknown as readonly AnyOperation[];
}
