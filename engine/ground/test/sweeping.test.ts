/**
 * THE NIGHTLY PASS DOES WHAT EVERY COLLECTION PROMISED.
 *
 * ⚠️ A RETENTION NOBODY ENFORCES IS WORSE THAN NONE, and that was its state:
 * declared on every collection, PUBLISHED to the person by the processing
 * record, and read by nothing. Telling somebody in writing that a check-in is
 * kept for two years and keeping it for ever is not a gap — it is a commitment
 * the system contradicts, found by whoever asks in year three.
 *
 * ⚠️ AND IT IS ASKED HERE RATHER THAN OF THE DEPLOYMENT, because the deployment
 * sells one product and that product keeps everything it is given. A rule about
 * rows can only be proved against a collection that declares one, which is
 * exactly what the ground is for.
 *
 * ⚠️ THE WHOLE BOOK IS RUN, NOT THE ONE FUNCTION. `sweepRetention` called
 * directly would prove the deletion and not that anything ever calls it — which
 * is the failure this job actually had.
 */

import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { TenantId } from "@engine/kernel";
import {
  DIRECTORY_MODULES, SHARD_MODULES,
  addShard, applySchema, createTenant, noteShardApp, schemaFor, sweep,
  type Db, type SweepDeps,
} from "@engine/runtime";
import { GROUND, ground } from "../src/index.js";

const directory = () => env.DIRECTORY as unknown as Db;
const shard = () => env.SHARD_EU_1 as unknown as Db;

const deps = (): SweepDeps => ({
  directory: directory(),
  shardOf: async () => shard(),
  apps: { ground },
  /* ⚠️ EVERY SHARD, NOT ONE PER TENANT. Retention is a rule about ROWS — "older
     than two years" is one statement per table per database. */
  shards: [shard()],
});

beforeAll(async () => {
  await applySchema(directory(), DIRECTORY_MODULES);
  await applySchema(shard(), [schemaFor(GROUND), ...SHARD_MODULES]);
  await addShard(directory(), "eu-1", "eu", 100);
  await noteShardApp(directory(), "eu-1", "ground");
});

beforeEach(async () => {
  for (const t of ["check_in", "note"]) await shard().exec(`DELETE FROM ${t};`);
  for (const t of ["tenant_app", "tenant"]) await directory().exec(`DELETE FROM ${t};`);
  for (const t of ["job_run", "job_schedule"]) {
    await directory().exec(`DELETE FROM ${t};`).catch(() => undefined);
  }
});

describe("what the nightly pass takes", () => {
  it("deletes what has been kept for longer than it was promised", async () => {
    const made = await createTenant(directory(), {
      slug: "lasting", name: "Lasting", country: "DE", where: "eu", apps: ["ground"],
    });
    if (typeof made === "string") throw new Error(made);

    const day = 24 * 60 * 60 * 1000;
    /* ⚠️ `check-in` is kept for 730 days, so 800 is past it and now is not. Both
       rows, because a sweep that took the whole table would satisfy a test
       asserting only that the old one is gone. */
    const rows = [["ci_old", new Date(Date.now() - 800 * day).toISOString()],
      ["ci_new", new Date().toISOString()]] as const;
    for (const [id, at] of rows) {
      await shard().prepare(
        `INSERT INTO check_in (id, person, week, went, at, by)
         VALUES (?, 'acc_x', '2026-01-01', 'fine', ?, NULL)`)
        .bind(id, at).run();
    }

    await sweep(deps());

    const left = await shard().prepare(`SELECT id FROM check_in ORDER BY id`)
      .all<{ id: string }>();
    expect(left.results.map((r) => r.id)).toEqual(["ci_new"]);
  });

  /* ⚠️ AND A COLLECTION THAT PROMISED NOTHING KEEPS EVERYTHING. `note` declares
     `retention: null`, and a pass that read a missing declaration as zero would
     empty every table in the deployment on its first night. */
  it("keeps what was never promised an end", async () => {
    const made = await createTenant(directory(), {
      slug: "keeping", name: "Keeping", country: "DE", where: "eu", apps: ["ground"],
    });
    if (typeof made === "string") throw new Error(made);

    await shard().prepare(
      `INSERT INTO note (id, tenant_id, title, at, by) VALUES ('note_old', ?, 'Ancient', ?, NULL)`)
      .bind(made.tenant.id as TenantId, new Date(Date.now() - 4000 * 86_400_000).toISOString())
      .run();

    await sweep(deps());

    const left = await shard().prepare(`SELECT id FROM note`).all<{ id: string }>();
    expect(left.results.map((r) => r.id)).toEqual(["note_old"]);
  });
});
