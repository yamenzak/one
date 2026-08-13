/**
 * THE CROSS-PRODUCT INDEX — an index, and never a grant.
 *
 * ⚠️ WHAT THIS PROVES IS THAT THE HUB'S PROMISE IS KEEPABLE. "Everywhere you
 * belong, across every product" was drawn from THIS product's regional
 * memberships, which cannot see another product's — so the list looked complete
 * and was short by every other product somebody uses. Two screens made the
 * promise, so they could each look complete while disagreeing.
 */

import { describe, expect, it } from "vitest";
import type { Instant, SqlHandle, TenantId, UserId } from "@one/kernel";
import {
  belongings, forgetBelonging, MEMBERSHIP_DIRECTORY_SCHEMA, noteBelonging,
} from "../src/membership-directory.js";

const AT = "2026-08-13T10:00:00.000Z" as Instant;

/*
  ⚠️ THE FAKE IS KEYED THE WAY THE TABLE IS, and filters the way the query does.
  A fake that ignored the account would let a reader that ignored it pass, which
  is the whole failure mode this table is here to close.
*/
const store = () => {
  const rows = new Map<string, { tenant_id: string; app_id: string; role: string; at: string }>();
  return {
    rows,
    handle: {
      async all<T>(_sql: string, accountId: string) {
        return [...rows]
          .filter(([k]) => k.startsWith(`${accountId}/`))
          .map(([, v]) => ({ tenant_id: v.tenant_id, app_id: v.app_id, role: v.role })) as T[];
      },
      async first<T>() { return null as T | null; },
      async run(sql: string, ...p: readonly unknown[]) {
        if (sql.startsWith("DELETE")) { rows.delete(`${p[0] as string}/${p[1] as string}`); return; }
        rows.set(`${p[0] as string}/${p[1] as string}`, {
          tenant_id: p[1] as string, app_id: p[2] as string, role: p[3] as string, at: p[4] as string,
        });
      },
    } as unknown as SqlHandle,
  };
};

const acc = "acc_1" as UserId;

describe("everywhere you belong", () => {
  /*
    ⚠️ THE ONE THING NO WORKER COULD ANSWER ALONE. A membership lives in the
    product's own regional database; this is the only place a question spanning
    products can be answered at all.
  */
  it("spans products, which is the whole reason it exists", async () => {
    const s = store();
    await noteBelonging(s.handle, acc, "t_1" as TenantId, "kova", "owner", AT);
    await noteBelonging(s.handle, acc, "t_2" as TenantId, "scena", "member", AT);
    const mine = await belongings(s.handle, acc);
    expect(mine.map((m) => m.appId).sort()).toEqual(["kova", "scena"]);
  });

  /* ⚠️ Somebody else's workspaces are not somebody's workspaces. */
  it("answers about one account and no other", async () => {
    const s = store();
    await noteBelonging(s.handle, acc, "t_1" as TenantId, "kova", "owner", AT);
    await noteBelonging(s.handle, "acc_2" as UserId, "t_9" as TenantId, "kova", "owner", AT);
    expect((await belongings(s.handle, acc)).map((m) => m.tenantId)).toEqual(["t_1"]);
  });

  /*
    ⚠️ RE-JOINING UPDATES RATHER THAN DUPLICATES, because the pair is the key. Two
    rows for one person in one workspace is a workspace listed twice on a hub,
    and a role that depends on which one a reader happened to take.
  */
  it("keeps one row per person per workspace, whatever their role becomes", async () => {
    const s = store();
    await noteBelonging(s.handle, acc, "t_1" as TenantId, "kova", "member", AT);
    await noteBelonging(s.handle, acc, "t_1" as TenantId, "kova", "owner", AT);
    expect(await belongings(s.handle, acc)).toEqual([{ tenantId: "t_1", appId: "kova", role: "owner" }]);
  });

  /*
    ⚠️ FORGOTTEN HERE WHILE THE REAL ROW IS ONLY REVOKED, and the asymmetry is the
    design. "Who was in this workspace and when" survives in the regional table;
    a revoked membership left in THIS one is a workspace on somebody's hub that
    refuses them at the door.
  */
  it("forgets a workspace somebody was removed from", async () => {
    const s = store();
    await noteBelonging(s.handle, acc, "t_1" as TenantId, "kova", "owner", AT);
    await forgetBelonging(s.handle, acc, "t_1" as TenantId);
    expect(await belongings(s.handle, acc)).toEqual([]);
  });

  /*
    ⚠️ A FAILED WRITE DOES NOT FAIL A SIGN-IN. This runs inside signing in and
    inside accepting an invitation; throwing would turn "the hub's list is short"
    into "you cannot sign in", which is strictly worse. The regional row — the
    one that decides anything — is already written by then.
  */
  it("does not take a sign-in down with it", async () => {
    const broken = { async run() { throw new Error("no such table"); } } as unknown as SqlHandle;
    await expect(noteBelonging(broken, acc, "t_1" as TenantId, "kova", "owner", AT)).resolves.toBeUndefined();
    await expect(forgetBelonging(broken, acc, "t_1" as TenantId)).resolves.toBeUndefined();
    /* ⚠️ And an unbound store is a deployment that has one, not an error. */
    await expect(noteBelonging(null, acc, "t_1" as TenantId, "kova", "owner", AT)).resolves.toBeUndefined();
  });

  /*
    ⚠️ ERASING EITHER SIDE TAKES IT. A closed workspace leaving rows here puts a
    dead workspace on somebody's hub for ever; a closed ACCOUNT leaving them keeps
    a record of where that person worked in the one store that outlives every
    product they used.
  */
  it("is erased from both directions, because it is about two things", () => {
    expect(MEMBERSHIP_DIRECTORY_SCHEMA.scoped?.tenantTables).toContain("membership_directory");
    expect(MEMBERSHIP_DIRECTORY_SCHEMA.scoped?.subjectTables)
      .toContainEqual({ table: "membership_directory", column: "account_id" });
  });
});
