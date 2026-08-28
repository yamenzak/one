/**
 * TWO APPS, ONE DATABASE — the faults that only exist once a deployment serves
 * more than one product.
 *
 * ⚠️ EVERY APP IN A DEPLOYMENT APPLIES ITS SCHEMA TO THE SAME SHARD, which is
 * what makes a suite cheap and is also the one thing nothing checked. A
 * `CREATE TABLE IF NOT EXISTS` is won by whichever module runs first: the second
 * app's columns never exist, its inserts fail on a column it declared, and
 * composition says nothing because each manifest is asked on its own and each
 * one is correct.
 *
 * ⚠️ THAT IS THE SCENA BILLING INCIDENT ONE LAYER UP. There it was two packages
 * declaring `plans` with different columns in one app; here it is two apps
 * declaring `party` in one deployment, and the failure is identical — a table
 * with the wrong shape and every test green.
 */

import { describe, expect, it } from "vitest";
import type { AppSpec, CollectionSpec } from "@engine/kernel";
import { collection, field } from "@engine/kernel";
import { deploymentFaults, type Deployment } from "../src/deployment.js";

const table = (id: string, over: Partial<CollectionSpec> = {}): CollectionSpec => collection({
  id,
  label: { one: id, many: `${id}s` },
  scope: { of: "tenant" },
  permission: id,
  retention: null,
  onClose: { then: "purge" },
  names: "title",
  fields: { title: field.text({ label: "Title", required: true, holds: "none", max: 200 }) },
  ...over,
});

const app = (id: string, collections: readonly CollectionSpec[], over: Partial<AppSpec> = {}) =>
  ({
    id, name: id, mark: "◆",
    access: { permissions: [], roles: {}, founding: "x", seats: { counts: [], entitlement: "seats" } },
    entitlements: {}, collections, operations: [], screens: [],
    ...over,
  } as unknown as AppSpec);

/** ⚠️ Only the apps matter here; everything else a deployment has is absent. */
const of = (apps: readonly AppSpec[]): Deployment =>
  ({ env: {}, shards: [], apps, used: [], modules: [] } as unknown as Deployment);

const faults = (apps: readonly AppSpec[]) => deploymentFaults(of(apps)).join("\n");

describe("two apps in one deployment", () => {
  it("says nothing about two apps whose collections are their own", () => {
    const said = faults([app("inventory", [table("product")]), app("party", [table("party")])]);
    expect(said).not.toContain("both declare");
  });

  /*
    ⚠️ THE FAULT IS SILENT AND THE MESSAGE HAS TO CARRY THE WHOLE CAUSE, because
    whoever reads it is looking at two manifests that are each correct.
  */
  it("reports two apps declaring one collection id", () => {
    const said = faults([app("inventory", [table("party")]), app("crm", [table("party")])]);
    expect(said).toContain('both declare collection "party"');
    expect(said).toContain("whichever schema runs first wins");
  });

  /* ⚠️ AND IT NAMES THE WAY OUT, which is the mechanism that exists for exactly
     this: one of them shares it and the other borrows it. */
  it("names sharing and borrowing as the way out", () => {
    const said = faults([app("a", [table("party")]), app("b", [table("party")])]);
    expect(said).toContain("share it and the other borrow it");
  });

  it("reports a borrow whose owner is not installed", () => {
    const said = faults([app("inventory", [table("order")], { borrows: ["party"] })]);
    expect(said).toContain("nothing in this deployment declares it");
  });

  it("says nothing when the owner is installed and shares it", () => {
    const said = faults([
      app("party", [table("party", { shared: true })]),
      app("inventory", [table("order")], { borrows: ["party"] }),
    ]);
    expect(said).not.toContain("borrows");
  });
});
