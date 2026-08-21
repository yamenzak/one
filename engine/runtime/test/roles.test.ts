/**
 * A WORKSPACE'S OWN ROLES, AND THE TWO REFUSALS THAT ARE NOT NICETIES.
 *
 * ⚠️ `beyond_you` IS AN ESCALATION CHECK. Composing a role out of keys you do
 * not hold and assigning it to yourself is the shortest path there is from "I
 * can manage people" to "I can do anything" — and it looks, on every screen, like
 * somebody tidying up a roster. `saveRole` is the only writer that reaches
 * `refuseRole`, which is why the check lives on the write rather than in a form.
 *
 * ⚠️ AND A ROLE SOMEBODY HOLDS MAY NOT BE DELETED. Their membership names it,
 * the registry stops carrying it, `permissionsFor` resolves it to nothing — and
 * they keep their seat, keep the workspace on their list, and can do nothing at
 * all, with no screen anywhere saying why.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { AccountId, TenantId } from "@engine/kernel";
import { permissionsFor } from "@engine/kernel";
import { MEMBERSHIP_SCHEMA, applySchema, type Db } from "../src/index.js";
import {
  customRolesOf, dropRole, memberFor, rolesFor, saveRole, setAppRole,
} from "../src/membership.js";

const db = () => env.DIRECTORY as unknown as Db;
const TENANT = "ten_roles" as TenantId;
const WHO = "acc_keeper" as AccountId;
const NOW = new Date("2026-08-21T09:00:00.000Z");

/* ⚠️ One app's keys, which is the only thing a role may compose. */
const DECLARED = { keeper: ["stock:read", "stock:move", "stock:adjust"] };
const KNOWN = new Set(["stock:read", "stock:move", "stock:adjust", "process:release"]);

beforeEach(async () => {
  await applySchema(db(), [MEMBERSHIP_SCHEMA]);
  await db().exec(`DELETE FROM custom_role;`);
  await db().exec(`DELETE FROM membership;`);
});

const holdsEverything = new Set(KNOWN);

describe("making one", () => {
  it("writes a role a screen can then read back", async () => {
    const out = await saveRole(db(), TENANT,
      { id: "porter", app: "inv", name: "Porter", permissions: ["stock:read", "stock:move"] },
      DECLARED, KNOWN, holdsEverything, NOW);
    expect(out).not.toBe("id");
    expect((await customRolesOf(db(), TENANT, "inv")).map((r) => r.id)).toEqual(["porter"]);
  });

  /*
    ⚠️ THE ONE TO READ TWICE. A person who may manage the roster but may not
    release a sterilisation load must not be able to make a role that can, and
    then hold it. Every screen this passes through looks like an administrator
    doing administration.
  */
  it("refuses a role composed out of keys its author does not hold", async () => {
    const out = await saveRole(db(), TENANT,
      { id: "signs", app: "inv", name: "Signs off", permissions: ["process:release"] },
      DECLARED, KNOWN, new Set(["stock:read"]), NOW);
    expect(out).toBe("beyond_you");
    expect(await customRolesOf(db(), TENANT, "inv")).toEqual([]);
  });

  /* ⚠️ A KEY THE APP DOES NOT DECLARE GRANTS NOTHING, so a role holding one is a
     bundle somebody adopts and then wonders about. */
  it("refuses a key this app does not have", async () => {
    const out = await saveRole(db(), TENANT,
      { id: "odd", app: "inv", name: "Odd", permissions: ["invented:key"] },
      DECLARED, KNOWN, holdsEverything, NOW);
    expect(out).toBe("undeclared_permission");
  });

  /*
    ⚠️ AND A DECLARED NAME MAY NOT BE TAKEN. `registryWith` lets the app's own
    roles win, so a workspace redefining `keeper` writes a row that resolves to
    nothing — silently, with the editor reporting success and everybody holding
    it keeping exactly what they had.
  */
  it("refuses to redefine one the app declares", async () => {
    const out = await saveRole(db(), TENANT,
      { id: "keeper", app: "inv", name: "Keeper", permissions: ["stock:read"] },
      DECLARED, KNOWN, holdsEverything, NOW);
    expect(out).toBe("declared");
  });

  /* ⚠️ AND AN ID IS A SLUG, because it is a key in a merged registry. One with a
     space in it is a row that resolves to nothing. */
  it("refuses an id nothing could look up", async () => {
    const out = await saveRole(db(), TENANT,
      { id: "Store Manager", app: "inv", name: "x", permissions: [] },
      DECLARED, KNOWN, holdsEverything, NOW);
    expect(out).toBe("id");
  });

  /* ⚠️ EDITING ONE IS THE ORDINARY CASE and must not be refused as "declared" —
     the check is against what the APP declares, not against what exists. */
  it("edits one it already made", async () => {
    await saveRole(db(), TENANT,
      { id: "porter", app: "inv", name: "Porter", permissions: ["stock:read"] },
      DECLARED, KNOWN, holdsEverything, NOW);
    await saveRole(db(), TENANT,
      { id: "porter", app: "inv", name: "Porter", permissions: ["stock:read", "stock:move"] },
      DECLARED, KNOWN, holdsEverything, NOW);
    const rows = await customRolesOf(db(), TENANT, "inv");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.permissions).toEqual(["stock:read", "stock:move"]);
  });
});

describe("holding one", () => {
  /*
    ⚠️ THE WHOLE POINT: a role a workspace made resolves to real keys through the
    same resolver every reader uses — the gate, the audience test, the settings
    screens, the tool catalogue, the navigation. Anything less and it is a row in
    a table with a name.
  */
  it("resolves to real keys through the one resolver", async () => {
    await saveRole(db(), TENANT,
      { id: "porter", app: "inv", name: "Porter", permissions: ["stock:read", "stock:move"] },
      DECLARED, KNOWN, holdsEverything, NOW);
    const registry = await rolesFor(db(), TENANT, "inv", DECLARED);

    const held = permissionsFor(
      {
        accountId: WHO, tenantId: TENANT, platformRole: "staff",
        appRoles: { inv: "porter" },
      },
      "inv", registry,
    );
    expect(held.has("stock:move")).toBe(true);
    expect(held.has("stock:adjust")).toBe(false);
  });

  /* ⚠️ AND THE APP'S OWN STILL WIN, which is the security property in
     `registryWith`. Spread the other way a workspace could redefine a declared
     role and everybody holding it would hold whatever that workspace said. */
  it("cannot shadow what the app declares", async () => {
    await db().prepare(
      `INSERT INTO custom_role (id, tenant_id, app, name, permissions_json, at)
       VALUES ('keeper', ?, 'inv', 'Keeper', '["process:release"]', ?)`)
      .bind(TENANT, NOW.toISOString()).run();
    const registry = await rolesFor(db(), TENANT, "inv", DECLARED);
    expect(registry.keeper).toEqual(DECLARED.keeper);
  });
});

describe("deleting one", () => {
  it("deletes one nobody holds", async () => {
    await saveRole(db(), TENANT,
      { id: "porter", app: "inv", name: "Porter", permissions: ["stock:read"] },
      DECLARED, KNOWN, holdsEverything, NOW);
    expect(await dropRole(db(), TENANT, "inv", "porter")).toBe("ok");
    expect(await customRolesOf(db(), TENANT, "inv")).toEqual([]);
  });

  /*
    ⚠️ AND REFUSES ONE SOMEBODY STILL HAS. Cascading would leave them with a
    seat, a workspace on their list, and no permissions at all — a state with no
    screen anywhere that explains it. Taking everybody off a role is a decision
    about people, not a side effect of tidying.
  */
  it("refuses to delete one somebody still holds", async () => {
    await saveRole(db(), TENANT,
      { id: "porter", app: "inv", name: "Porter", permissions: ["stock:read"] },
      DECLARED, KNOWN, holdsEverything, NOW);
    await db().prepare(
      `INSERT INTO membership (id, tenant_id, account_id, email, platform_role, app_roles_json, at)
       VALUES ('mem_1', ?, ?, 'a@b.c', 'staff', '{"inv":"porter"}', ?)`)
      .bind(TENANT, WHO, NOW.toISOString()).run();

    expect(await dropRole(db(), TENANT, "inv", "porter")).toBe("in_use");
    expect(await customRolesOf(db(), TENANT, "inv")).toHaveLength(1);

    /* ⚠️ AND IT IS DELETABLE THE MOMENT THEY ARE MOVED OFF IT, which is what
       makes the refusal a step rather than a wall. */
    await setAppRole(db(), TENANT, "mem_1", "inv", null, holdsEverything, DECLARED);
    expect(await memberFor(db(), TENANT, WHO)).not.toBeNull();
    expect(await dropRole(db(), TENANT, "inv", "porter")).toBe("ok");
  });

  /* ⚠️ AND ONE THAT WAS NEVER THERE IS NOT A SILENT SUCCESS. A delete reporting
     "done" over a row it could not find is how a screen comes to show a role
     that is gone everywhere else. */
  it("says so when there is nothing to delete", async () => {
    expect(await dropRole(db(), TENANT, "inv", "ghost")).toBe("no_such_role");
  });
});
