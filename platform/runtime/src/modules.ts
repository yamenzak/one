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
import { SESSION_DIRECTORY_SCHEMA, SESSION_SCHEMA } from "./identity.js";
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
import { CONSENT_SCHEMA, LEGAL_SPEC_SCHEMA, SUBJECT_CONSENT_SCHEMA } from "./reference-ops.js";
import { AUDIT_SCHEMA } from "./audit.js";
import { LIMIT_SCHEMA } from "./limit.js";
import { IMPERSONATION_SCHEMA } from "./impersonation.js";
import { DOMAIN_CLAIM_SCHEMA } from "./settings-ops.js";
import { CATALOGUE_SCHEMA } from "./operator-ops.js";
import { CONFIG_SCHEMA, MODEL_SCHEMA } from "./config.js";
import { DIRECTORY_SCHEMA, DOMAIN_SCHEMA } from "./directory.js";
import { VAULT_SCHEMA, VAULT_SPEC_SCHEMA } from "./vault.js";
import { IDENTITY_SCHEMA } from "./identity.js";
import { OTP_SCHEMA } from "./identity-ops.js";
import { PROVISIONING_SCHEMA } from "./provisioning.js";
import { ACCOUNT_BILLING_SCHEMA } from "./account-billing.js";
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
  AUDIT_SCHEMA,
  LIMIT_SCHEMA,
  /* ⚠️ REGIONAL, because it is about a SUBJECT rather than an account — the
     person whose health data it is may have no login at all, and their record
     lives where their workspace's records live. */
  SUBJECT_CONSENT_SCHEMA,
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
  /*
    ⚠️ GLOBAL, WHILE THE SESSION ITSELF STAYS REGIONAL. This is the index that
    answers "where am I signed in" — a question that spans apps and regions by
    definition, and one no regional store can answer about another product.
  */
  SESSION_DIRECTORY_SCHEMA,
  /* ⚠️ After identity: a consent belongs to an account, and the ledger is only
     meaningful beside the record of who that is. */
  CONSENT_SCHEMA,
  /* ⚠️ DECLARATIONS, NOT DATA, and global for the same reason the vault is: the
     account centre answers for every product a person belongs to, and one app's
     worker knows only its own manifest. */
  VAULT_SPEC_SCHEMA,
  /* ⚠️ AND THE SAME FOR WHAT EACH PRODUCT ASKS PEOPLE TO AGREE TO. `legal.list`
     answers for the app serving the request, which on the account centre is
     whichever one happens to be behind that door. */
  LEGAL_SPEC_SCHEMA,
  /*
    ⚠️ GLOBAL, AND THAT IS THE WHOLE DESIGN. A vault fact belongs to the person
    rather than to a workspace, so it outlives every app they use and every
    workspace they leave. A regional copy would be taken away by leaving the
    workspace that happened to ask for it first — which is the opposite of what
    a vault is for.
  */
  VAULT_SCHEMA,
  /* ⚠️ Global, and NOT tenant-scoped: a workspace closing must not delete the
     record of the support sessions that happened inside it. */
  IMPERSONATION_SCHEMA,
  OTP_SCHEMA as SchemaModule,
  /*
    ⚠️ GLOBAL, BECAUSE A GRANT IS ABOUT A PERSON AND A PRODUCT — and the account
    centre that reads it is served by a different worker from the one that has to
    honour it. A per-app copy would be one product's answer to a question about
    all of them.
  */
  PROVISIONING_SCHEMA as SchemaModule,
  /*
    ⚠️ GLOBAL BECAUSE THE PAYER IS AN ACCOUNT AND THE HUB SPANS EVERY PRODUCT.
    A regional table could answer only for the workspaces in its own region, so a
    hub would show three of somebody's four. It is also what lets ONE webhook
    settle everything: whichever worker a notification arrives at writes here.
  */
  ACCOUNT_BILLING_SCHEMA,
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
