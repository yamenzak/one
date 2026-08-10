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
import { SETTINGS_SCHEMA } from "./settings.js";
import { REPLAY_SCHEMA } from "./replay.js";
import { CONSENT_SCHEMA } from "./reference-ops.js";
import { DOMAIN_CLAIM_SCHEMA } from "./settings-ops.js";
import { CATALOGUE_SCHEMA } from "./operator-ops.js";
import { CONFIG_SCHEMA, MODEL_SCHEMA } from "./config.js";
import { DIRECTORY_SCHEMA, DOMAIN_SCHEMA } from "./directory.js";
import { IDENTITY_SCHEMA } from "./identity.js";
import { OTP_SCHEMA } from "./identity-ops.js";
import { PROVIDER_SCHEMA } from "./provider.js";
import { PLATFORM_STATE_SCHEMA } from "./maintenance.js";
import { JOB_SCHEMA } from "./jobs.js";

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
  SETTINGS_SCHEMA,
  REPLAY_SCHEMA,
];

/**
 * Everything the platform owns in the GLOBAL store — the one read before a
 * region is known.
 *
 * ⚠️ ASSEMBLED HERE FOR THE SAME REASON THE REGIONAL LIST IS, and both apps were
 * assembling this one by hand. A forgotten module is not an error: the table is
 * absent, the routes over it are mounted, and every suite is green because
 * nothing drove the surface nobody could reach. `CONFIG_SCHEMA` is the newest
 * entry and would have been the next one missed.
 */
export const PLATFORM_GLOBAL: readonly SchemaModule[] = [
  DIRECTORY_SCHEMA,
  DOMAIN_SCHEMA,
  IDENTITY_SCHEMA,
  /* ⚠️ After identity: a consent belongs to an account, and the ledger is only
     meaningful beside the record of who that is. */
  CONSENT_SCHEMA,
  OTP_SCHEMA as SchemaModule,
  PROVIDER_SCHEMA,
  PLATFORM_STATE_SCHEMA,
  JOB_SCHEMA,
  CONFIG_SCHEMA,
  /* ⚠️ Beside the directory, because a claim is looked up by hostname before any
     region is known — the same reason the domain table itself is here. */
  DOMAIN_CLAIM_SCHEMA as SchemaModule,
  /* ⚠️ Global, because a price is the deployment's and a region is a workspace's. */
  CATALOGUE_SCHEMA,
];

/**
 * Everything the platform owns in the store EVERY APP BINDS BY THE SAME ID.
 *
 * ⚠️ THIS IS THE ONE LIST THAT IS NOT THIS APP'S. Its tables hold the facts that
 * are the same behind every product — the credentials, and what a model costs —
 * so a rotated key is pasted once and a price change is one row rather than a
 * deploy per app. Nothing here is per workspace and nothing here is per product.
 */
export const SHARED_MODULES: readonly SchemaModule[] = [CONFIG_SCHEMA, MODEL_SCHEMA];
