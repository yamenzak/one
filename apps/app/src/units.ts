/** Personal unit preferences, resolved from the session context. */

import { resolveUnits, type UnitPrefs } from "@mossa/domain";
import { useSession } from "./session.js";

export function useUnits(): UnitPrefs {
  const { ctx } = useSession();
  return resolveUnits(ctx?.user.units);
}
