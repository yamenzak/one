/**
 * WHAT IS WRONG WITH THIS DEPLOYMENT, ASKED WHERE IT CAN STILL BE ANSWERED.
 *
 * ⚠️ THREE RULES WERE WRITTEN, ARGUED FOR IN THEIR OWN HEADERS, AND ASKED BY
 * NOBODY. `unbound` says it is "asked at boot rather than at the first request
 * for an unlucky tenant" — nothing asked it, so a shard the directory places
 * workspaces on with no binding behind it was found by whoever signed in first.
 * `unreachableByErasure` says "this is what a guard asks" — no guard asked it,
 * so a collection no deletion request can reach was a fact nothing reported.
 * `boundButUnused` names "the shape this framework keeps finding" and was itself
 * an instance of it.
 *
 * ⚠️ THEY ARE REPORTED TOGETHER BECAUSE THEY ARE ONE QUESTION. Each is a
 * deployment that boots, serves, passes every test, and is wrong in a way only
 * a customer discovers. Answering them one at a time is three places to
 * remember, and the third never gets written.
 *
 * ⚠️ AND THEY ARE REPORTED, NOT THROWN. A missing shard binding is fatal for
 * the workspaces on that shard and harmless for every other; an unused AI
 * binding is a cost and not an outage. What the caller does with each is the
 * caller's — refusing to serve over any of them would make a deployment with
 * one spare binding unbootable.
 */

import type { AppSpec, DeploymentLegal, PlanSpec } from "@engine/kernel";
import { PLATFORM_ENTITLEMENTS, holdingsOf, missingDocuments, refuseCatalog } from "@engine/kernel";
import { incoherent, unledgered } from "./dossier.js";
import { unbound, type Env } from "./handles.js";
import { unreachableByErasure } from "./records.js";
import type { SchemaModule } from "./schema.js";
import { boundButUnused } from "./services.js";
import { table } from "./sql.js";

export interface Deployment {
  readonly env: Env;
  /** Every shard the directory may place a workspace on. */
  readonly shards: readonly string[];
  /** The apps this deployment serves. */
  readonly apps: readonly AppSpec[];
  /** The service bindings something actually reaches. */
  readonly used: readonly string[];
  /**
   * ⚠️ EVERY SCHEMA MODULE THIS DEPLOYMENT APPLIES, so the erasure ledger can be
   * checked against what actually exists HERE. The gate checks the runtime's own
   * modules; a deployment may apply more — another package's, an app's — and a
   * table this one creates that the ledger has never heard of is an export that
   * never reads it and a deletion that never touches it, both reporting success.
   */
  readonly modules: readonly SchemaModule[];
  /**
   * ⚠️ WHAT THIS DEPLOYMENT SELLS — one membership, one list. Absent is a
   * deployment that charges for nothing, which every reader already handles as
   * the parking state; present, its faults are reported like any other.
   */
  readonly plans?: readonly PlanSpec[];
  /**
   * ⚠️ WHAT THIS DEPLOYMENT PROMISES, ASKED ONCE. Terms and a privacy notice
   * bind a legal entity rather than a feature, so the question is the
   * deployment's and not any app's — which is exactly why `missingDocuments`
   * had no caller for as long as it was asked of a per-app declaration.
   */
  readonly legal?: DeploymentLegal;
}

/** Everything wrong with a deployment, as sentences a log can carry. */
export function deploymentFaults(of: Deployment): readonly string[] {
  const out: string[] = [];

  for (const id of unbound(of.env, of.shards)) {
    out.push(`the directory places workspaces on shard "${id}" and nothing is bound for it — `
      + `every workspace placed there answers "no such table" on its first request`);
  }

  /*
    ⚠️ THE CATALOGUE IS THE DEPLOYMENT'S, SO ITS FAULTS ARE TOO. Since the
    membership became one, plans left every app manifest — and the check that
    used to run per app has to run HERE or run nowhere. What it catches is the
    quiet half: a key an app declares and no plan mentions resolves to `false`
    for every workspace on every tier, so the feature is built, gated, and sold
    to nobody, with nothing anywhere going red.

    ⚠️ AND THE KEYS ARE THE UNION. The platform sells `seats`, `storage` and
    `domains`; each product sells its own. A plan silent about any of them is
    the same fault whichever half declared it.
  */
  if (of.plans) {
    const keys = {
      ...PLATFORM_ENTITLEMENTS,
      ...Object.fromEntries(of.apps.flatMap((a) => Object.entries(a.entitlements))),
    };
    for (const p of refuseCatalog(of.plans, keys)) {
      out.push(`catalogue: ${p.why} — ${p.detail}`);
    }
  }

  for (const app of of.apps) {
    for (const id of unreachableByErasure(app.collections)) {
      out.push(`${app.id}: collection "${id}" is scoped by nothing erasure can reach, `
        + `so a deletion request will never touch it and nothing will say so`);
    }
  }

  /* ⚠️ TAKING SOMEBODY'S DATA WITH NOTHING SAYING WHAT HAPPENS TO IT. Asked of
     everything the deployment holds across every product, because that is the
     scope of the promise. */
  if (of.legal) {
    const held = of.apps.flatMap((a) => holdingsOf(a));
    for (const p of missingDocuments(of.legal.documents, held)) {
      out.push(`${p.why}: ${p.detail}`);
    }
  }

  /* ⚠️ THE TWO ANSWERS NOBODY CAN CHECK FROM OUTSIDE — see `dossier.ts`. */
  const derived = of.apps.flatMap((a) => a.collections.map((c) => table(c.id)));
  for (const one of unledgered(of.modules, derived)) {
    out.push(`table "${one}" is created here and is in no erasure ledger — `
      + `an export that never reads it and a deletion that never touches it, both saying they were complete`);
  }
  for (const said of incoherent()) {
    out.push(`the erasure ledger contradicts itself: ${said}`);
  }

  for (const name of boundButUnused(of.env as Readonly<Record<string, unknown>>, of.used)) {
    out.push(`${name} is bound and nothing calls it — a provider this deployment pays for `
      + `and does not use, or a lane somebody forgot to mount`);
  }

  return out;
}
