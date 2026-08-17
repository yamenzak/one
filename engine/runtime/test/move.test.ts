/**
 * A WORKSPACE CHANGES SHARD — and every assertion here is about a failure that
 * reports success.
 *
 * ⚠️ A COPY THAT LOSES ROWS DOES NOT THROW. It flips, the product reads the new
 * database, and the missing records are found weeks later by the customer. So
 * the tests count both sides, and the one that matters most asserts the flip is
 * REFUSED when they disagree.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppSpec } from "@engine/kernel";
import { applySchema } from "../src/schema.js";
import type { Db } from "../src/sql.js";
import { DIRECTORY_MODULES, SHARD_MODULES } from "../src/platform-schema.js";
import { addShard, createTenant, noteShardApp, tenantById } from "../src/directory.js";
import { beginMove, carried, carryRows, finishMove, reapMoved, unmatched } from "../src/move.js";
import { locator } from "../src/locate.js";

const directory = () => env.DIRECTORY as unknown as Db;
const one = () => env.SHARD_EU_1 as unknown as Db;
const two = () => env.SHARD_EU_2 as unknown as Db;

const app = (): AppSpec => ({
  id: "hello" as never, name: "Hello", mark: "H",
  access: { roles: {}, permissions: {}, founding: "owner" } as never,
  entitlements: {}, plans: [], collections: [], operations: [], screens: [],
});

describe("moving a workspace's records", () => {
  let id: string;

  beforeEach(async () => {
    await applySchema(directory(), DIRECTORY_MODULES);
    for (const db of [one(), two()]) await applySchema(db, SHARD_MODULES);
    await addShard(directory(), "eu-1", "eu", 100);
    await addShard(directory(), "eu-2", "eu", 100);
    for (const s of ["eu-1", "eu-2"]) await noteShardApp(directory(), s, "hello" as never);

    const made = await createTenant(directory(), {
      slug: "carry", name: "Carry", country: "DE", where: "eu", apps: ["hello" as never],
    });
    if (typeof made === "string") throw new Error(made);
    id = made.tenant.id;
    /* Something on the source worth carrying. */
    await one().prepare(
      `INSERT INTO membership (id, tenant_id, account_id, email, platform_role, app_roles_json, grants_json, revoked_json, at, accepted_at, removed_at)
       VALUES ('mem_1', ?, 'acc_1', 'a@b.c', 'owner', '{}', '[]', '[]', ?, ?, NULL)`)
      .bind(id, new Date().toISOString(), new Date().toISOString()).run();
    await one().prepare(
      `INSERT INTO inbox (id, tenant_id, account_id, type, title, body, link, tone, icon, at, seen_at)
       VALUES ('inb_1', ?, 'acc_1', 't', 'Hi', '', '', '', '', ?, NULL)`)
      .bind(id, new Date().toISOString()).run();
  });

  /*
    ⚠️ THE TABLE LIST IS DERIVED FROM THE ERASURE LEDGER, and this asserts it
    rather than trusting it. A table that erases with a workspace and does not
    travel with it is a moved workspace arriving without its roster — while the
    move reports every row it DID copy, successfully.
  */
  it("carries every table a workspace's erasure would take", () => {
    const names = carried([app()]).map((c) => c.table);
    for (const must of ["membership", "inbox", "setting", "audit", "vault_fact", "media"]) {
      expect(names, must).toContain(must);
    }
    /* ⚠️ And nothing that is the DEPLOYMENT's. `job_run` is the clock; carrying
       it would copy one deployment's job history onto a shard per move. */
    expect(names).not.toContain("job_run");
    expect(names).not.toContain("account");
  });

  /*
    ⚠️ READ-ONLY BEFORE A SINGLE ROW IS READ. A copy taken from a live database
    loses whatever is written after the table was read — silently, and only for
    whoever happened to be working.
  */
  it("makes the workspace read-only the moment it begins", async () => {
    const locate = locator({
      directory: directory(), shardOf: () => one(),
      appsOf: async () => [app()], charging: false,
    });
    const before = await locate({ kind: "tenant", slug: "carry", host: "carry.localhost" });
    expect(before?.standing?.writable).toBe(true);

    expect(await beginMove(directory(), id as never, "eu-2")).toBeNull();

    const during = await locate({ kind: "tenant", slug: "carry", host: "carry.localhost" });
    expect(during?.standing?.writable).toBe(false);
    /* ⚠️ Reads are never withheld — the difference between a few minutes of
       "you cannot change this right now" and an outage. */
    expect(during?.standing?.serving).toBe(true);
  });

  it("refuses a shard whose schema does not cover the workspace's apps", async () => {
    await addShard(directory(), "eu-3", "eu", 100);
    expect(await beginMove(directory(), id as never, "eu-3")).toBe("schema_missing");
    /* ⚠️ AND IT LEAVES NOTHING READ-ONLY. A refusal that had already stamped
       `moving_to` would strand the workspace over a check that said no. */
    expect((await tenantById(directory(), id as never))?.movingTo).toBeNull();
  });

  it("carries the rows, and finds both sides equal", async () => {
    await beginMove(directory(), id as never, "eu-2");
    await carryRows(one(), two(), id as never, [app()]);

    expect(await unmatched(one(), two(), id as never, [app()])).toEqual([]);
    const there = await two().prepare(`SELECT id FROM membership WHERE tenant_id = ?`)
      .bind(id).all<{ id: string }>();
    expect(there.results.map((r) => r.id)).toEqual(["mem_1"]);
  });

  /* ⚠️ RE-RUNNABLE, so a pass that died half way is simply run again. */
  it("carries twice without duplicating anything", async () => {
    await beginMove(directory(), id as never, "eu-2");
    await carryRows(one(), two(), id as never, [app()]);
    await carryRows(one(), two(), id as never, [app()]);
    expect(await unmatched(one(), two(), id as never, [app()])).toEqual([]);
  });

  /*
    ⚠️ THE ASSERTION THE WHOLE DESIGN TURNS ON. Everything before the flip is
    recoverable; the flip is what makes the new database the one the product
    reads. Flipping on a copy that lost rows hands a customer a workspace with
    holes in it, and the intact source is never consulted again.
  */
  it("refuses to flip onto a copy that is missing rows", async () => {
    await beginMove(directory(), id as never, "eu-2");
    await carryRows(one(), two(), id as never, [app()]);
    /* Something goes missing on the target. */
    await two().prepare(`DELETE FROM inbox WHERE tenant_id = ?`).bind(id).run();

    const wrong = await finishMove(directory(), one(), two(), id as never, [app()]);
    expect(wrong?.join()).toContain("inbox");

    /* ⚠️ Still on the old shard, still read-only, still recoverable. */
    const tenant = await tenantById(directory(), id as never);
    expect(tenant?.shardId).toBe("eu-1");
    expect(tenant?.movingTo).toBe("eu-2");
  });

  it("flips and gives the workspace back when both sides agree", async () => {
    await beginMove(directory(), id as never, "eu-2");
    await carryRows(one(), two(), id as never, [app()]);
    expect(await finishMove(directory(), one(), two(), id as never, [app()])).toBeNull();

    const tenant = await tenantById(directory(), id as never);
    expect(tenant?.shardId).toBe("eu-2");
    /* ⚠️ A workspace left read-only after a successful move is one nobody can
       use and nothing explains. */
    expect(tenant?.movingTo).toBeNull();
  });

  /*
    ⚠️ AND THE SOURCE IS NOT EMPTIED. A move that deleted it is unrecoverable the
    moment the copy turns out to have been wrong — which is a thing you learn
    afterwards or not at all.
  */
  it("leaves the source intact until it has drained", async () => {
    await beginMove(directory(), id as never, "eu-2");
    await carryRows(one(), two(), id as never, [app()]);
    await finishMove(directory(), one(), two(), id as never, [app()]);

    const still = await one().prepare(`SELECT COUNT(*) AS n FROM membership WHERE tenant_id = ?`)
      .bind(id).first<{ n: number }>();
    expect(still?.n).toBe(1);

    /* Nothing is reaped before the window. */
    expect(await reapMoved(directory(), (s) => (s === "eu-1" ? one() : two()), [app()])).toBe(0);

    const past = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);
    expect(await reapMoved(directory(), (s) => (s === "eu-1" ? one() : two()), [app()], past)).toBe(1);
    const gone = await one().prepare(`SELECT COUNT(*) AS n FROM membership WHERE tenant_id = ?`)
      .bind(id).first<{ n: number }>();
    expect(gone?.n).toBe(0);
    /* ⚠️ And the copy that is now live is untouched. */
    const live = await two().prepare(`SELECT COUNT(*) AS n FROM membership WHERE tenant_id = ?`)
      .bind(id).first<{ n: number }>();
    expect(live?.n).toBe(1);
  });
});
