/**
 * WHAT SOMEBODY MAY DO, RESOLVED IN ONE PLACE (D15) — AND WHEN IT STOPS (D16).
 *
 * ⚠️ THE RESOLVER IS THE WHOLE ACCESS MODEL. Every gate, audience test, settings
 * screen and tool catalogue reads `permissionsFor`, so what these prove is what
 * every one of them does: platform authority is app-independent, an app role
 * means nothing outside its app, a grant with a clock stops counting at the
 * clock, and revocation always wins. A defect here is not one broken screen —
 * it is every reader agreeing on the same wrong answer.
 */

import { describe, expect, it } from "vitest";
import type { Membership } from "../src/access.js";
import {
  PLATFORM_ROLES, canAssign, claimsPlatform, foundingAppRole, permissionsFor, registryWith,
  seatsUsed, wouldStrand,
} from "../src/access.js";

const APP_ROLES = {
  editor: ["note:read", "note:write"],
  reader: ["note:read"],
};

const member = (over: Partial<Membership> = {}): Membership => ({
  accountId: "acc_1" as never,
  tenantId: "ten_1" as never,
  platformRole: "staff",
  appRoles: { notes: "editor" },
  ...over,
});

describe("one membership, two authorities", () => {
  /* ⚠️ THE MULTI-APP BUG THIS EXISTS TO CLOSE: a flat role resolved against
     whichever app was first meant a role in the second product granted nothing,
     silently. Here the same row answers differently per app, correctly. */
  it("resolves the app role in its own app and not in another", () => {
    const m = member({ appRoles: { notes: "editor" } });
    expect(permissionsFor(m, "notes", APP_ROLES).has("note:write")).toBe(true);
    expect(permissionsFor(m, "boards", APP_ROLES).has("note:write")).toBe(false);
  });

  it("carries the platform authority into every app's context", () => {
    const m = member({ platformRole: "manager" });
    for (const appId of ["notes", "boards", null]) {
      expect(permissionsFor(m, appId, APP_ROLES).has("member:manage")).toBe(true);
    }
  });

  it("gives a customer no workspace authority at all", () => {
    const m = member({ platformRole: "customer", appRoles: {} });
    expect(permissionsFor(m, null).size).toBe(0);
  });

  it("resolves nobody to nothing", () => {
    expect(permissionsFor(null, "notes", APP_ROLES).size).toBe(0);
  });
});

describe("a grant may carry a clock (D16)", () => {
  const at = "2026-08-14T12:00:00.000Z";

  it("counts a live grant and drops an expired one", () => {
    const m = member({
      platformRole: "customer", appRoles: {},
      grants: [
        { key: "meal:read", app: "notes", until: "2026-09-01T00:00:00.000Z", source: "pkg:a" },
        { key: "body:read", app: "notes", until: "2026-08-01T00:00:00.000Z", source: "pkg:b" },
      ],
    });
    const held = permissionsFor(m, "notes", {}, at);
    expect(held.has("meal:read")).toBe(true);
    /* ⚠️ This single comparison IS the lapse mechanism every app inherits —
       there is no sweep, no flag, no second check anywhere downstream. */
    expect(held.has("body:read")).toBe(false);
  });

  it("scopes an app-tagged grant to its app, and a bare one everywhere", () => {
    const m = member({
      platformRole: "customer", appRoles: {},
      grants: [{ key: "meal:read", app: "notes" }, { key: "vip", source: "manual" }],
    });
    expect(permissionsFor(m, "boards", {}).has("meal:read")).toBe(false);
    expect(permissionsFor(m, "boards", {}).has("vip")).toBe(true);
    expect(permissionsFor(m, "notes", {}).has("meal:read")).toBe(true);
  });

  /* ⚠️ Without `now` a clocked grant counts — the caller who forgets the clock
     fails OPEN. Every runtime reader passes it; this pins that a grant with no
     `until` is a standing exception either way. */
  it("keeps a bare grant regardless of the clock", () => {
    const m = member({ grants: [{ key: "vip" }] });
    expect(permissionsFor(m, null, {}, at).has("vip")).toBe(true);
  });

  it("applies revocation last, so it wins over role and grant alike", () => {
    const m = member({
      platformRole: "owner",
      grants: [{ key: "member:manage" }],
      revoked: ["member:manage"],
    });
    expect(permissionsFor(m, null).has("member:manage")).toBe(false);
    expect(permissionsFor(m, null).has("billing:manage")).toBe(true);
  });
});

describe("nobody may grant what they do not hold", () => {
  it("bounds a role assignment key by key", () => {
    const manager = new Set(PLATFORM_ROLES.manager);
    expect(canAssign(manager, "staff", PLATFORM_ROLES)).toBe(true);
    /* A manager cannot mint an owner: they do not hold `billing:manage`. */
    expect(canAssign(manager, "owner", PLATFORM_ROLES)).toBe(false);
  });

  it("bounds app roles against the granter's keys in that app", () => {
    const readerOnly = new Set(["note:read"]);
    expect(canAssign(readerOnly, "reader", APP_ROLES)).toBe(true);
    expect(canAssign(readerOnly, "editor", APP_ROLES)).toBe(false);
  });
});

describe("the workspace facts", () => {
  it("asks stranding of the platform authority alone", () => {
    const owner = member({ accountId: "acc_owner" as never, platformRole: "owner" });
    const editor = member({ accountId: "acc_editor" as never, platformRole: "staff" });
    /* ⚠️ An app role cannot confer running the workspace — however capable the
       editor is in the product, removing the one owner strands it. */
    expect(wouldStrand([owner, editor], "acc_owner" as never)).toBe(true);
    const second = member({ accountId: "acc_two" as never, platformRole: "manager" });
    expect(wouldStrand([owner, editor, second], "acc_owner" as never)).toBe(false);
  });

  it("counts seats by platform role, customers never", () => {
    const members = [
      member({ platformRole: "owner" }),
      member({ platformRole: "staff" }),
      member({ platformRole: "customer" }),
    ];
    expect(seatsUsed(members, ["owner", "manager", "staff"])).toBe(2);
  });

  it("derives the founding app role from the declaration order", () => {
    expect(foundingAppRole({ permissions: [], roles: APP_ROLES, seats: { counts: [], entitlement: "s" } }))
      .toBe("editor");
    expect(foundingAppRole({ permissions: [], roles: APP_ROLES, founding: "reader", seats: { counts: [], entitlement: "s" } }))
      .toBe("reader");
    expect(foundingAppRole({ permissions: [], roles: {}, seats: { counts: [], entitlement: "s" } }))
      .toBe(null);
  });

  it("names every platform key an app tries to claim", () => {
    expect(claimsPlatform({
      permissions: ["note:read", "member:manage"],
      roles: { editor: ["note:read", "tenant:create"] },
      seats: { counts: [], entitlement: "s" },
    })).toEqual(["member:manage", "tenant:create"]);
  });

  /* ⚠️ The app's own declaration wins the merge — spread the other way, a
     workspace could redefine a declared role for everybody holding it. */
  it("lets a custom role join the registry but never shadow a declared one", () => {
    const merged = registryWith(APP_ROLES, [
      { id: "helper", app: "notes", name: "Helper", permissions: ["note:read"] },
      { id: "editor", app: "notes", name: "Impostor", permissions: [] },
    ]);
    expect(merged.helper).toEqual(["note:read"]);
    expect(merged.editor).toEqual(["note:read", "note:write"]);
  });
});
