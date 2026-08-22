/**
 * A HAND-WRITTEN WORKSPACE LOOKUP, IN THE SHAPE THE PLATFORM WANTS.
 *
 * ⚠️ THE REAL `locate` ANSWERS TWICE FROM ONE READ — where a door is comes back
 * one query in, what the workspace holds three or four — because the identity
 * needs only the first and waiting for the second put three round trips in front
 * of every request (`Locating`). A fixture that resolves a workspace some other
 * way has nothing to start early, so this hands back both from the same promise:
 * honest rather than generous, and one wait slower than `locator`.
 *
 * ⚠️ IT LIVES HERE RATHER THAN IN THE RUNTIME BECAUSE NOTHING SHIPPED NEEDS IT.
 * An export with no caller outside a test is a seam the next reader has to decide
 * about, and `scripts/capability.test.mjs` is right to call one out.
 */

import type { Db, Located, Locating } from "@engine/runtime";
import type { Door, TenantId } from "@engine/kernel";

export const asLocating = (
  find: (door: Door) => Promise<Located | null>,
): ((door: Door) => Locating) => (door) => {
  const located = find(door);
  const where = located.then((at) =>
    (at ? { tenantId: at.tenantId as TenantId, db: at.db as Db } : null));
  /* ⚠️ Handled, so a fixture whose lookup throws reports it on the half that is
     awaited rather than as an unhandled rejection beside it. */
  where.catch(() => undefined);
  return { where, located };
};
