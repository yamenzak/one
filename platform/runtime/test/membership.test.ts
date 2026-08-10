/**
 * THE THREE DECISIONS A MEMBERSHIP MAKES, tested where they are decisions
 * rather than where they are queries.
 *
 * ⚠️ EACH OF THESE WAS AN APP'S ANSWER UNTIL NOW, and each app got it the same
 * way: whatever made the first test pass. What a caller may do, who they are on
 * the customer rail, and which role founds a workspace are one answer each, and
 * this is where the answer lives.
 */

import { describe, expect, it } from "vitest";
import { foundingRole } from "../src/platform-ops.js";
import { permissionsOf, subjectFor, type Membership } from "../src/membership.js";
import type { AppSpec, BindingSpec, TenantId, UserId } from "@one/kernel";

const member = (over: Partial<Membership> = {}): Membership => ({
  id: "mem_1", tenantId: "t_1" as TenantId, email: "a@example.test", role: "trainer",
  grants: [], revoked: [], accountId: "u_1" as UserId, subjectId: null,
  invitedAt: "2026-01-01T00:00:00.000Z" as never, acceptedAt: null, revokedAt: null,
  ...over,
});

const ROLES = { owner: ["client:read", "member:manage"], trainer: ["client:read"] };

/* ----------------------------------------------------------- permissions --- */

describe("what a member may do", () => {
  it("reads the role's keys from the manifest rather than from the row", () => {
    expect([...permissionsOf(ROLES, member())]).toEqual(["client:read"]);
    expect([...permissionsOf(ROLES, member({ role: "owner" })).values()].sort())
      .toEqual(["client:read", "member:manage"]);
  });

  /*
    ⚠️ NO MEMBERSHIP IS NOTHING, AND SO IS AN UNKNOWN ROLE. A role deleted from
    the manifest must not leave its holders with whatever set they happened to
    have — and the shape that does is the one where the row stores permissions.
  */
  it("grants nothing to a non-member and nothing to a role nobody declares", () => {
    expect([...permissionsOf(ROLES, null)]).toEqual([]);
    expect([...permissionsOf(ROLES, member({ role: "ghost" }))]).toEqual([]);
  });

  /*
    ⚠️ REVOCATION IS LAST, WHICH IS WHAT MAKES "THEIR ROLE, EXCEPT THIS"
    EXPRESSIBLE. Anything applied after it could hand back the one thing the
    exception exists to take away.
  */
  it("narrows one person within their role, and the narrowing wins", () => {
    expect([...permissionsOf(ROLES, member({ role: "owner", revoked: ["member:manage"] }))]).toEqual(["client:read"]);
    expect([...permissionsOf(ROLES, member({ grants: ["file:write"] }))].sort()).toEqual(["client:read", "file:write"]);
    /* Granted and revoked at once is revoked: the exception is the later word. */
    expect([...permissionsOf(ROLES, member({ grants: ["file:write"], revoked: ["file:write"] }))]).toEqual(["client:read"]);
  });
});

/* -------------------------------------------------------------- customer --- */

describe("who the caller is on the customer rail", () => {
  /*
    ⚠️ THE TWO SHAPES ARE NOT INTERCHANGEABLE, and the wrong one is silent. Every
    app's own resolver returned the account id — correct where the signed-in
    person IS the customer, and in the other shape it makes a coach their own
    customer, holding their client's package while the client holds nothing.
  */
  it("is the signed-in account where the person is the customer", () => {
    expect(subjectFor("member", "u_7" as UserId, null)).toBe("u_7");
    expect(subjectFor("member", "u_7" as UserId, member({ subjectId: "cli_9" }))).toBe("u_7");
  });

  it("is the record the membership names where somebody acts on another's behalf", () => {
    expect(subjectFor("record", "u_7" as UserId, member({ subjectId: "cli_9" }))).toBe("cli_9");
    /* ⚠️ A staff member names no record, so they are nobody's customer. */
    expect(subjectFor("record", "u_7" as UserId, member())).toBeUndefined();
  });

  it("is nobody at all where the app sells to no customers", () => {
    expect(subjectFor(false, "u_7" as UserId, member({ subjectId: "cli_9" }))).toBeUndefined();
  });
});

/* -------------------------------------------------------------- founding --- */

describe("which role founds a workspace", () => {
  const withRoles = (roles: Record<string, readonly string[]>) =>
    ({ access: { roles } } as unknown as AppSpec<BindingSpec>);

  /*
    ⚠️ CHOSEN BY WHAT IT CAN DO, NOT BY WHAT IT IS CALLED. An app is free to call
    its administrators anything, and a platform matching on the word `owner`
    would found workspaces whose creator cannot invite anybody — with the
    directory row, the tables and the session all perfectly correct.
  */
  it("is the one that can manage members, whatever it is named", () => {
    expect(foundingRole(withRoles({ reader: ["note:read"], principal: ["member:manage"] }))).toBe("principal");
    expect(foundingRole(withRoles({ owner: ["member:manage"], admin: ["member:manage"] }))).toBe("owner");
  });

  /*
    ⚠️ NULL IS A REAL APP, not a misconfiguration: one where every workspace is
    provisioned by an operator rather than created by its own members. The
    manifest refuses the dangerous combination — somebody may create a workspace
    and no role can manage it — so this only reports.
  */
  it("is nobody when no role can manage members", () => {
    expect(foundingRole(withRoles({ reader: ["note:read"] }))).toBeNull();
  });
});
