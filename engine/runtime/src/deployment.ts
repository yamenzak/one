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

import type { AppSpec, DeploymentLegal, PackDef, PlanSpec } from "@engine/kernel";
import {
  PLATFORM_HOLDINGS, entitlementKeys, holdingsOf, missingDocuments, refuseBorrows, refuseCatalog,
  refuseHears, refuseLegal, refusePacks,
} from "@engine/kernel";
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
   * ⚠️ AND WHAT IT SELLS ONE-OFF. Credit packs are the deployment's for the same
   * reason the plans are: there is one wallet, so a pack a product declared
   * would top up a shared balance that only that product could sell.
   */
  readonly packs?: readonly PackDef[];
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
    const keys = entitlementKeys(of.apps);
    for (const p of refuseCatalog(of.plans, keys)) {
      out.push(`catalogue: ${p.why} — ${p.detail}`);
    }
  }

  /* ⚠️ AND THE PACKS, WHICH USED TO BE CHECKED PER APP AND ARE NOW CHECKED
     NOWHERE ELSE. `free_credits` is the sharp one: a price of zero on something
     that costs real money to honour is never a promotion, it is a catalogue
     mistake that anybody can spend without limit. */
  for (const p of refusePacks(of.packs ?? [])) {
    out.push(`packs: ${p.why} — ${p.detail}`);
  }

  /*
    ⚠️ WHAT ONE APP BORROWS AND NO APP SHARES — the half no manifest can check,
    because each composes alone and that is the whole point. See `refuseBorrows`.
  */
  for (const p of refuseBorrows(of.apps)) out.push(`${p.of}: ${p.why}`);

  /*
    ⚠️ AND WHAT ONE APP LISTENS FOR AND NO APP RAISES. The other direction is
    deliberately NOT a fault: an event nothing hears is quiet, which is what a
    workspace without OneBook looks like and is the ordinary case. A handler
    waiting for an event nobody sends is the opposite — dead code that looks
    live, and the product it was written for is missing.
  */
  for (const p of refuseHears(of.apps)) out.push(`${p.of}: ${p.why}`);

  /*
    ⚠️ TWO APPS DECLARING ONE COLLECTION ID IS NOT A STYLE QUESTION, IT IS A
    SILENT DATA FAULT. Every app in a deployment applies its schema to the SAME
    shard database, and a `CREATE TABLE IF NOT EXISTS` is won by whichever module
    runs first — so the second app's columns never exist, its inserts fail on a
    column it declared, and nothing at composition says a word. This is the
    Scena billing incident one layer up, waiting for the second app that
    declares a `party` of its own instead of borrowing one.
  */
  const seen = new Map<string, string>();
  for (const app of of.apps) {
    for (const c of app.collections) {
      const first = seen.get(c.id);
      if (first) {
        out.push(`${app.id} and ${first} both declare collection "${c.id}" — they share one `
          + `database, so whichever schema runs first wins and the other's columns never `
          + `exist; one of them should share it and the other borrow it`);
      } else seen.set(c.id, app.id);
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
    /* ⚠️ THE PLATFORM'S OWN, AND THEN THE PRODUCTS'. An email address, an
       account, an audit trail and an invoice are held by the framework rather
       than by any manifest — see `PLATFORM_HOLDINGS`. Asked of the apps alone,
       the deployment disclosed as collected only what a product happened to
       declare, and every recipient of the other four was reported as receiving
       something nothing collects. */
    const held = [...PLATFORM_HOLDINGS, ...of.apps.flatMap((a) => holdingsOf(a))];
    for (const p of missingDocuments(of.legal.documents, held, of.legal.identity)) {
      out.push(`${p.why}: ${p.detail}`);
    }
    /*
      ⚠️ AND THE DEPLOYMENT'S OWN BOOK GOES THROUGH THE SAME RULES AS AN APP'S,
      WHICH IT DID NOT. `refuseLegal` was reached from `refuseManifest` alone, so
      every rule in it — including the one refusing a document that demands
      agreement with nothing to read — was asked of every app's documents and of
      none of the deployment's. The deployment's are the three everybody on every
      product is stopped by, so it was the one book where the rule mattered and
      the one book nobody asked.
    */
    for (const p of refuseLegal(
      of.legal.documents, of.legal.processors, held,
      of.apps.some((a) => Object.values(a.purposes ?? {})
        .some((x) => x.holdings.includes("sensitive"))),
    )) {
      out.push(`legal ${p.of}: ${p.why} — ${p.detail}`);
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
