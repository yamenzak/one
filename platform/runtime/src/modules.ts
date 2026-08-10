/**
 * THE SCHEMA MODULES EVERY APP APPLIES, in one list.
 *
 * ⚠️ AN APP ASSEMBLING THIS BY HAND IS AN APP THAT WILL MISS ONE, and the way it
 * misses one is the failure this whole platform is a reaction to: the tables are
 * absent, the routes over them are mounted, and every suite is green because no
 * test drove the surface nobody could reach. `MEMBERSHIP_SCHEMA` is the sharpest
 * case — without it the default caller resolution finds nothing, so every
 * request answers 403 and the workspace looks broken rather than unmigrated.
 *
 * Applying one an app does not use costs an empty table. Missing one costs a
 * feature, silently.
 */

import type { SchemaModule } from "@one/kernel";
import { SESSION_SCHEMA } from "./identity.js";
import { MEMBERSHIP_SCHEMA } from "./membership.js";
import { ACTIVITY_SCHEMA } from "./collection-ops.js";
import { LEDGER_SCHEMA } from "./ledger.js";
import { COMMERCE_SCHEMA } from "./commerce.js";
import { INBOX_SCHEMA } from "./inbox.js";
import { MEDIA_SCHEMA } from "./files.js";
import { GUIDE_SCHEMA } from "./guide.js";
import { MILESTONE_SCHEMA } from "./milestone.js";
import { GENERATION_SCHEMA } from "./generate.js";

/** Everything the platform owns in a REGIONAL store. An app appends its own. */
export const PLATFORM_REGIONAL: readonly SchemaModule[] = [
  SESSION_SCHEMA,
  MEMBERSHIP_SCHEMA,
  ACTIVITY_SCHEMA,
  LEDGER_SCHEMA,
  COMMERCE_SCHEMA,
  INBOX_SCHEMA,
  MEDIA_SCHEMA,
  GUIDE_SCHEMA,
  MILESTONE_SCHEMA,
  GENERATION_SCHEMA,
];
