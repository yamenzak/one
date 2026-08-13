/**
 * WHAT EACH PRODUCT DECLARES, PUBLISHED WHERE EVERY PRODUCT CAN READ IT.
 *
 * ⚠️ ONE CONSOLE FOR THREE PRODUCTS NEEDS THIS AND CANNOT WORK WITHOUT IT. The
 * store is shared and its rows are keyed by app, so one door can already WRITE
 * every product's configuration, its prices and its ceilings. What it cannot do
 * is READ what a product declared — the plans, the entitlement keys, the
 * settings, the sellable flags all live in the other worker's bundle, and a
 * console showing an override with no declaration beside it cannot answer the
 * one question an operator opens it with: is this number the one the app
 * shipped, or one somebody already changed.
 *
 * ⚠️ SO A DECLARATION IS PUBLISHED AT BOOT, which is the one moment a worker is
 * certainly running its own current manifest. Exactly the mechanism `vault_specs`
 * and `legal_specs` already use, for exactly the same reason, and this module
 * makes all three ONE call — an app that has to remember four publishers is an
 * app that will publish three.
 *
 * ⚠️ DECLARATIONS, NEVER VALUES. The config registry travels as key → is it
 * shared, is it secret; not one byte of what any key is set to. A table holding
 * every product's declarations is a reasonable thing to replicate globally; a
 * table holding their credentials is not, and the difference is one careless
 * spread away.
 */

import type { AppSpec, BindingSpec, ConfigRegistry, DeploymentSpec, SchemaModule, SqlHandle } from "@one/kernel";
import { publishVaultSpec } from "./vault.js";
import { publishLegalSpec } from "./reference-ops.js";

/**
 * ⚠️ ONE ROW PER PRODUCT AND NO TIMESTAMP. Nothing reads when a declaration was
 * published — it is whatever the running bundle says — and the column would make
 * boot read the wall clock, which the injected-clock guard correctly refuses.
 */
export const APP_SPEC_SCHEMA: SchemaModule = {
  id: "app_specs",
  ddl: [
    `CREATE TABLE IF NOT EXISTS app_specs (app_id TEXT PRIMARY KEY, app_name TEXT NOT NULL, manifest_version TEXT NOT NULL, declared TEXT NOT NULL);`,
  ],
};

/** What one product declares, as the console reads it. */
export interface Declared {
  readonly appId: string;
  readonly appName: string;
  readonly manifestVersion: string;
  /** The catalogue as SHIPPED. What is being sold is this plus the overrides. */
  readonly plans: unknown;
  /** Every ceiling and switch a plan may name, so an edit can be checked. */
  readonly entitlements: unknown;
  /** Credit packs, where the product sells any. */
  readonly packs: unknown;
  /** What a workspace chooses about itself — the settings screen, derived. */
  readonly settings: unknown;
  /**
   * Every key this product reads, and for each whether it is shared and whether
   * it is a secret. ⚠️ Never a value — see the header.
   */
  readonly config: unknown;
  /** What a workspace may sell its own customers, where there is such a rail. */
  readonly customerFlags: unknown;
  readonly customerRail: false | "member" | "record";
  /** Where somebody is sent to make a workspace in this product. */
  readonly root: string;
}

interface Row { app_id: string; app_name: string; manifest_version: string; declared: string }

/**
 * PUBLISH THIS PRODUCT'S DECLARATION, AND EVERYTHING ELSE IT HAS TO PUBLISH.
 *
 * ⚠️ ONE CALL, BECAUSE THREE IS TWO TOO MANY TO REMEMBER. Each of the three
 * publishes below is invisible when it is missing: the vault shows nobody's
 * facts, the consent gate asks for nothing, the console shows a product with no
 * catalogue — and every suite stays green, because a missing declaration reads
 * exactly like a product that declares nothing.
 */
export async function publishApp<B extends BindingSpec>(
  db: SqlHandle,
  app: AppSpec<B>,
  /*
    ⚠️ THE CONFIG REGISTRY IS A RUNTIME OPTION RATHER THAN PART OF THE MANIFEST,
    so it is passed rather than read off the app. Worth knowing before wondering
    why: what an app READS is a property of the worker that boots it, and the
    same manifest run by a self-host with no Stripe genuinely reads fewer keys.
  */
  extra: { readonly deployment?: DeploymentSpec; readonly config?: ConfigRegistry } = {},
): Promise<void> {
  await publishVaultSpec(db, app);
  if (extra.deployment) await publishLegalSpec(db, app, extra.deployment);

  const declared: Omit<Declared, "appId" | "appName" | "manifestVersion"> = {
    plans: app.access.plans,
    entitlements: app.access.entitlements,
    packs: app.access.creditPacks ?? [],
    settings: app.settings ?? {},
    /*
      ⚠️ THE SHAPE OF EACH KEY, NOT ITS VALUE. `secret` is what lets a console
      draw a write-only field; `shared` is what lets it say whether typing here
      pins this product to a copy that will not follow the next rotation.
    */
    config: Object.fromEntries(Object.entries(extra.config ?? {}).map(([key, spec]) => [key, {
      shared: spec.shared, secret: spec.secret, ...(spec.shared ? {} : { why: spec.why }),
    }])),
    customerFlags: app.access.customerFlags,
    customerRail: app.access.customerRail,
    root: app.tenancy.appRoot,
  };

  try {
    await db.run(
      `INSERT INTO app_specs (app_id, app_name, manifest_version, declared) VALUES (?, ?, ?, ?)
       ON CONFLICT(app_id) DO UPDATE SET app_name = excluded.app_name,
         manifest_version = excluded.manifest_version, declared = excluded.declared`,
      app.id, app.name, app.manifestVersion, JSON.stringify(declared),
    );
  } catch (why) {
    /*
      ⚠️ IT STILL SERVES, AND IT SAYS SO. Boot must not throw over a console in
      another product — but a bare `catch {}` here is what kept `vault_specs`
      empty for the life of that feature: every publish failed on a parameter
      binding, and an empty table looks exactly like a product that declares
      nothing.
    */
    console.error("app spec not published", app.id, why);
  }
}

/**
 * EVERY PRODUCT'S DECLARATION, FOR THE CONSOLE THAT RENDERS ALL OF THEM.
 *
 * ⚠️ AN UNREADABLE ROW IS SKIPPED RATHER THAN THROWN OVER. One product deployed
 * from a branch that wrote a shape this one cannot parse must not take the
 * console down for the other two — which is the console an operator would use
 * to work out what happened.
 */
export async function declaredApps(db: SqlHandle): Promise<readonly Declared[]> {
  const rows = await db.all<Row>(
    `SELECT app_id, app_name, manifest_version, declared FROM app_specs ORDER BY app_id`,
  ).catch(() => []);
  const out: Declared[] = [];
  for (const r of rows) {
    try {
      out.push({
        appId: r.app_id, appName: r.app_name, manifestVersion: r.manifest_version,
        ...(JSON.parse(r.declared) as Omit<Declared, "appId" | "appName" | "manifestVersion">),
      });
    } catch { /* skipped — see above */ }
  }
  return out;
}
