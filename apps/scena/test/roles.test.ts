/**
 * THE ROLE REGISTRY, and the two ways it fails without failing.
 *
 * A role that resolves to the WRONG GRANT does not throw. Tessa shipped three
 * roles that silently degraded to read-only because a second, hand-written copy
 * of the presets omitted them; Scena shipped two BOARD roles the same way, so
 * every station account at a reception desk resolved the `viewer` preset —
 * including `billing: ["read"]`.
 *
 * A route gate asking for an action that DOES NOT EXIST does not throw either.
 * It is simply never satisfied, by anybody, owner included: the route reads as
 * "restricted to managers" and is actually closed to everyone. Better Auth's
 * `member` statement is `["create","update","delete"]` with no `read`, which is
 * the exact trap.
 *
 * Both are asserted against the DERIVED registry, never against a copy — a test
 * that restates the presets is the duplication that caused the bug.
 */

import { describe, expect, it } from "vitest";
import { statement, roles, ROLE_NAMES, BOARD_ROLES, SEAT_FREE_ROLES, FALLBACK_ROLE, CREATOR_ROLE } from "../src/access.js";
import { PERMISSION_CATALOG, ROLE_PRESETS, resolvePermissions, grantSatisfies } from "../src/perms.js";
import { permissionFor } from "../src/route-guard.js";

describe("every role carries its own grant", () => {
  it("has a preset for every role in access.ts", () => {
    for (const name of Object.keys(roles)) {
      expect(ROLE_PRESETS[name], `${name} has no preset`).toBeTruthy();
      expect(Object.keys(ROLE_PRESETS[name]!).length, `${name} resolved to an empty grant`).toBeGreaterThan(0);
    }
  });

  it("does not collapse two STAFF roles onto one grant", () => {
    // The shape a missing preset takes: several roles landing on the fallback's
    // grant and looking, from the outside, like they work.
    //
    // Staff roles only. The two BOARD roles share `board: ["read","operate"]`
    // deliberately and must not be split: the difference between a coordinator
    // and a station is WHICH rows they may touch — the whole board versus one
    // option of it — and Better Auth's access control is action-level, not
    // row-level. `boardUserCanControl` is where that distinction lives.
    const seen = new Map<string, string>();
    for (const name of ROLE_NAMES) {
      const key = JSON.stringify(ROLE_PRESETS[name]);
      const twin = seen.get(key);
      expect(twin, `${name} and ${twin} resolve to the same grant`).toBeUndefined();
      seen.set(key, name);
    }
  });

  it("keeps a BOARD role to its board and nothing else", () => {
    for (const r of BOARD_ROLES) {
      const g = resolvePermissions(r, null);
      expect(Object.keys(g)).toEqual(["board"]);
      expect(g.billing).toBeUndefined();
      expect(g.settings).toBeUndefined();
      expect(g.screen).toBeUndefined();
    }
  });

  it("keeps the fallback on the LEAST privileged role", () => {
    const g = resolvePermissions(FALLBACK_ROLE, null);
    for (const actions of Object.values(g)) expect(actions).toEqual(["read"]);
    // And an unknown role — one from an older deployment, or a typo — lands
    // there rather than on nothing (which some call sites read as unrestricted).
    expect(resolvePermissions("not-a-role", null)).toEqual(g);
  });

  it("leaves the creator role able to settle its own bill", () => {
    expect(grantSatisfies(ROLE_PRESETS[CREATOR_ROLE]!, { billing: ["manage"], settings: ["manage"] })).toBe(true);
  });
});

describe("the seat lane", () => {
  it("frees exactly the board roles, and no role a person holds", () => {
    expect([...SEAT_FREE_ROLES].sort()).toEqual([...BOARD_ROLES].sort());
    for (const r of ROLE_NAMES) expect(SEAT_FREE_ROLES).not.toContain(r);
  });

  it("never offers a board role as an invitable one", () => {
    // `roleNames` is what the staff routes accept for an invite AND a re-role.
    // A station account promoted to `operator` is a device bolted to a wall in
    // a waiting room holding the run of the fleet.
    for (const r of BOARD_ROLES) expect(ROLE_NAMES as readonly string[]).not.toContain(r);
  });
});

describe("no route gate is unsatisfiable", () => {
  /** Every (resource, action) any role actually holds. */
  const held = new Set<string>();
  for (const g of Object.values(ROLE_PRESETS)) {
    for (const [res, acts] of Object.entries(g)) for (const a of acts) held.add(`${res}:${a}`);
  }

  /**
   * The route table has no enumeration, so this drives `permissionFor` over the
   * paths it branches on. Not exhaustive by construction — it is a sample wide
   * enough to cover every `return` in the function, and a new branch that is
   * unsatisfiable is caught the moment a path reaching it is added here.
   */
  const PATHS: [string, string][] = [
    ["GET", "/api/screens"], ["POST", "/api/screens"], ["DELETE", "/api/screens/s1"],
    ["POST", "/api/screens/s1/command"], ["POST", "/api/pair/claim"],
    ["GET", "/api/channels"], ["POST", "/api/channels"], ["DELETE", "/api/channels/c1"],
    ["POST", "/api/channels/c1/publish"], ["POST", "/api/channels/c1/rollback"],
    ["GET", "/api/channels/c1/widgets"], ["POST", "/api/channels/c1/composition"],
    ["POST", "/api/assets"], ["GET", "/api/media"], ["POST", "/api/media"],
    ["GET", "/api/slide-playlists"], ["POST", "/api/music-playlists"], ["POST", "/api/profiles"],
    ["POST", "/api/ad-profiles"], ["GET", "/api/feeds"], ["POST", "/api/ads"],
    ["GET", "/api/weather"], ["GET", "/api/library"], ["POST", "/api/ai/generate"],
    ["POST", "/api/ai/defaults"], ["GET", "/api/branding"], ["POST", "/api/branding"],
    ["POST", "/api/playback"], ["POST", "/api/boards"], ["GET", "/api/boards"],
    ["POST", "/api/boards/b1/station"], ["POST", "/api/boards/b1/kiosk"],
    ["POST", "/api/boards/b1/users"], ["POST", "/api/boards/b1/categories"],
    ["GET", "/api/staff"], ["POST", "/api/staff/invite"], ["PATCH", "/api/staff/u1/role"],
    ["GET", "/api/members"], ["POST", "/api/members/m1/permissions"],
    ["GET", "/api/alerts"], ["POST", "/api/alerts/rules"], ["GET", "/api/analytics"],
    ["POST", "/api/emergency"], ["GET", "/api/billing"], ["POST", "/api/billing/checkout"],
  ];

  it("asks only for actions some role actually holds", () => {
    for (const [method, path] of PATHS) {
      const perm = permissionFor(method, path);
      if (!perm) continue;
      for (const [res, acts] of Object.entries(perm)) {
        for (const a of acts) {
          expect(held.has(`${res}:${a}`), `${method} ${path} needs ${res}:${a}, which no role has`).toBe(true);
        }
      }
    }
  });

  it("asks only for actions the access control defines", () => {
    // The other half: an action no role holds might still be a real action
    // nobody was granted. One that is not in the statement at all is a typo.
    const catalog = statement as unknown as Record<string, readonly string[]>;
    for (const [method, path] of PATHS) {
      const perm = permissionFor(method, path);
      if (!perm) continue;
      for (const [res, acts] of Object.entries(perm)) {
        expect(catalog[res], `${method} ${path} names resource "${res}", which does not exist`).toBeTruthy();
        for (const a of acts) {
          expect(catalog[res], `${method} ${path} needs ${res}:${a}, which is not an action on ${res}`).toContain(a);
        }
      }
    }
  });

  it("is satisfied by the OWNER for every gated route", () => {
    // The strongest form of the same check: whatever the table asks for, the
    // person who owns the tenant can do it. A route the owner cannot reach is
    // one nobody can.
    const owner = ROLE_PRESETS[CREATOR_ROLE]!;
    for (const [method, path] of PATHS) {
      const perm = permissionFor(method, path);
      if (!perm) continue;
      expect(grantSatisfies(owner, perm), `the owner cannot reach ${method} ${path}`).toBe(true);
    }
  });
});

describe("the permission editor's catalog", () => {
  it("offers nothing the access control does not define", () => {
    const catalog = statement as unknown as Record<string, readonly string[]>;
    for (const [res, acts] of Object.entries(PERMISSION_CATALOG)) {
      expect(catalog[res], `"${res}" is offered but not defined`).toBeTruthy();
      for (const a of acts) expect(catalog[res]).toContain(a);
    }
  });

  it("hides the org-management statements, which are not checklist items", () => {
    for (const k of ["organization", "invitation", "team", "ac"]) {
      expect(PERMISSION_CATALOG[k]).toBeUndefined();
    }
  });
});
