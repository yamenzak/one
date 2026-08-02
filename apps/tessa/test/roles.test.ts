/**
 * THE ROLES ARE REAL — every one of them, not just `owner`.
 *
 * This file exists because three of the five silently were not. `access.ts`
 * defined `stockKeeper`, `cssd` and `clinical` carefully; `auth-context.ts`
 * listed only `owner` and the fallback in its `bindGrants` presets, so
 * everything else fell back to read-only. Nothing threw. The roles resolved —
 * they resolved to "read".
 *
 * A CSSD member could not run the autoclave or perform a **Freigabe**; a stock
 * keeper could not receive stock. Only the owner worked, which is why nobody
 * noticed: the person testing was the person who created the centre.
 *
 * Two registries that must agree with nothing checking that they do is the
 * shape, and it is the shape this repo keeps finding. The presets are derived
 * now; these tests are what stop them being restated by hand again.
 */

import { describe, expect, it } from "vitest";
import { CREATOR_ROLE, CUSTOMER_ROLE, FALLBACK_ROLE, roles, statement, type RoleName } from "../src/access.js";
import { resolveGrantFor } from "../src/auth-context.js";

const ROLE_NAMES = Object.keys(roles) as RoleName[];

describe("every role resolves to its own grant", () => {
  it("gives each role something different from the read-only fallback", () => {
    const fallback = JSON.stringify(resolveGrantFor(FALLBACK_ROLE, null));
    // Every role EXCEPT the fallback itself must differ from it. When the
    // presets were hand-listed, three of these were byte-identical to it.
    for (const name of ROLE_NAMES.filter((r) => r !== FALLBACK_ROLE)) {
      expect(JSON.stringify(resolveGrantFor(name, null)), name).not.toBe(fallback);
    }
  });

  it("lets CSSD run and RELEASE a load, which is the whole role", () => {
    const g = resolveGrantFor("cssd", null);
    // `run` and `release` are deliberately separate in access.ts: German
    // practice expects a named, competent person to release against the
    // indicator evidence, and it is frequently not the person who ran the
    // machine. A cssd member holding neither is the bug this file is named for.
    expect(g.sterilisation).toContain("run");
    expect(g.sterilisation).toContain("release");
    expect(g.pack).toContain("build");
  });

  it("lets a stock keeper actually receive stock", () => {
    const g = resolveGrantFor("stockKeeper", null);
    expect(g.stock).toContain("receive");
    expect(g.stock).toContain("quarantine");
    // …and NOT release a sterile load. The separation is the point of having
    // more than one role at all.
    expect(g.sterilisation ?? []).not.toContain("release");
  });

  it("lets clinical consume stock and close a case, and nothing upstream", () => {
    const g = resolveGrantFor("clinical", null);
    expect(g.stock).toContain("consume");
    expect(g.case).toContain("close");
    expect(g.stock).not.toContain("receive");
    expect(g.sterilisation ?? []).not.toContain("release");
  });

  it("keeps the auditor reading everything and writing nothing", () => {
    const g = resolveGrantFor("auditor", null);
    expect(g.trace).toContain("read");
    expect(g.report).toContain("read");
    for (const [resource, actions] of Object.entries(g)) {
      expect(actions, resource).toEqual(["read"]);
    }
    // No AI: an auditor spending the centre's credits would be a surprise on
    // the invoice, and an inspection is not what the credits were bought for.
    expect(g.ai).toBeUndefined();
  });

  it("gives the owner every action in the catalog", () => {
    const g = resolveGrantFor(CREATOR_ROLE, null);
    for (const [resource, actions] of Object.entries(statement)) {
      // Better Auth's own org statements are filtered out of the preset; the
      // app's own catalog must be complete.
      expect(g[resource], resource).toEqual([...actions]);
    }
  });
});

describe("a custom grant narrows and never widens", () => {
  it("intersects against the role, so a stored blob cannot escalate", () => {
    // A tampered or stale blob claiming `release` on a role that has no such
    // power must not grant it.
    const g = resolveGrantFor("clinical", JSON.stringify({ sterilisation: ["read", "run", "release"] }));
    expect(g.sterilisation ?? []).not.toContain("release");
    expect(g.sterilisation ?? []).not.toContain("run");
  });

  it("can genuinely narrow within the role", () => {
    const g = resolveGrantFor("stockKeeper", JSON.stringify({ stock: ["read"] }));
    expect(g.stock).toEqual(["read"]);
    expect(g.stock).not.toContain("receive");
  });

  it("leaves an owner unbounded — a blob must not lock a centre out of billing", () => {
    const g = resolveGrantFor(CREATOR_ROLE, JSON.stringify({ billing: [] }));
    expect(g.billing).toContain("manage");
  });
});

describe("the seat lane", () => {
  it("has no seat-free role, so every member counts", () => {
    // `customerRole` is used for ONE thing in @4dl/auth: `role != customerRole`
    // in the seat count, plus the three invite/accept/promote hooks. Pointing it
    // at a real role — it was `auditor` — makes that role free and unlimited,
    // while access.ts claimed the opposite in prose.
    expect(ROLE_NAMES as string[]).not.toContain(CUSTOMER_ROLE);
  });

  it("keeps the grant fallback on the LEAST privileged role", () => {
    // Failing open to `clinical` would let a member whose role cannot be
    // resolved consume stock.
    const g = resolveGrantFor(FALLBACK_ROLE, null);
    for (const actions of Object.values(g)) expect(actions).toEqual(["read"]);
  });

  it("resolves an unknown role to that same fallback rather than to nothing", () => {
    // A role string from an older deployment, or a typo in a migration, must
    // land read-only — not undefined, and not empty (which some call sites
    // would read as "no restrictions").
    expect(resolveGrantFor("cssd_v2_typo", null)).toEqual(resolveGrantFor(FALLBACK_ROLE, null));
  });
});
