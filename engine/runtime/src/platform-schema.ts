/**
 * THE PLATFORM'S OWN TABLES, IN DEPENDENCY ORDER, DECLARED ONCE.
 *
 * ⚠️ THIS WAS WRITTEN OUT BY HAND IN NINE PLACES AND THEY HAD DRIFTED. The
 * deployment has the authoritative list and every one of the reference app's
 * test harnesses copied it — so eight of ten never applied `INBOX_SCHEMA`, and
 * in those worlds every inbox route answered "no such table: inbox". That is
 * not a test problem: a harness that builds a different platform from the one
 * that ships is a harness whose green run means less than it appears to, and it
 * is how a notification path went three stages without anybody noticing there
 * was nowhere to file one.
 *
 * ⚠️ THE ORDER IS DEPENDENCY ORDER AND IT IS LOAD-BEARING. A module that alters
 * a table another module creates simply finds nothing there — the runner
 * swallows it, everything reports success, and a column that was supposed to
 * exist silently never does.
 *
 * ⚠️ AN APP'S OWN TABLES ARE NOT HERE. `schemaFor(spec)` derives those from the
 * manifest, and a deployment applies both: these, and one module per product.
 */

import { AI_ACTION_SCHEMA } from "./ai-actions.js";
import { AUDIT_SCHEMA, REPLAY_SCHEMA } from "./audit.js";
import { BILLING_SCHEMA } from "./billing.js";
import { BRANDING_SCHEMA } from "./branding.js";
import { DIRECTORY_SCHEMA } from "./directory.js";
import { IDENTITY_SCHEMA } from "./identity.js";
import { INBOX_SCHEMA } from "./inbox.js";
import { JOBS_SCHEMA } from "./jobs.js";
import { LEGAL_SCHEMA } from "./legal.js";
import { MEMBERSHIP_SCHEMA } from "./membership.js";
import { OPERATOR_SCHEMA } from "./operator.js";
import { PACKAGE_SCHEMA } from "./packages.js";
import { MOVE_SCHEMA } from "./move.js";
import { RESOURCE_SCHEMA } from "./resources.js";
import type { SchemaModule } from "./schema.js";
import { MEDIA_SCHEMA } from "./storage.js";
import { ICON_SCHEMA } from "./icon.js";
import { SETTING_SCHEMA } from "./settings.js";
import { VAULT_SCHEMA } from "./vault.js";

/** What the DIRECTORY holds: one row per account, workspace, subscription, run. */
export const DIRECTORY_MODULES: readonly SchemaModule[] = [
  DIRECTORY_SCHEMA, IDENTITY_SCHEMA, BILLING_SCHEMA, BRANDING_SCHEMA,
  /* ⚠️ BESIDE THE BRAND AND FOR THE SAME REASON: the manifest and the favicon
     are read with no session and before any workspace has been located, so an
     icon on a shard would mean finding a database to answer a picture. */
  ICON_SCHEMA,
  JOBS_SCHEMA, OPERATOR_SCHEMA, AI_ACTION_SCHEMA,
  /* ⚠️ WHAT THE DEPLOYMENT HAS MADE FOR ITSELF, in the directory because it is
     about the deployment rather than about any workspace — and because the
     reaper reads it to decide what it may destroy. */
  RESOURCE_SCHEMA,
  /* ⚠️ In the directory, because a move is ABOUT two shards and can be read
     from neither once the flip has happened. */
  MOVE_SCHEMA,
  /* ⚠️ IN THE DIRECTORY, NOT ON A SHARD. One person accepts the terms once for
     the whole deployment; an acceptance beside a workspace's records would be
     asked again per workspace and lost when that workspace closed. */
  LEGAL_SCHEMA,
];

/** What a SHARD holds: everything scoped to one workspace, beside its records. */
export const SHARD_MODULES: readonly SchemaModule[] = [
  MEMBERSHIP_SCHEMA, PACKAGE_SCHEMA, SETTING_SCHEMA, AI_ACTION_SCHEMA,
  AUDIT_SCHEMA, REPLAY_SCHEMA, INBOX_SCHEMA, VAULT_SCHEMA,
  /* ⚠️ BESIDE THE RECORDS THE FILES BELONG TO. A workspace's media ledger on the
     shard is what makes its erasure one pass over one database — and what keeps
     an EU workspace's file index in the EU with everything else of theirs. */
  MEDIA_SCHEMA,
];
