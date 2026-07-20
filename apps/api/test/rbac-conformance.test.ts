/**
 * RBAC conformance — access.ts (the Better Auth binding) must never drift from
 * packages/domain perms.ts (the single source of truth). Better Auth's generics
 * make literal-generation fragile, so we keep access.ts as explicit literals and
 * guard them here instead: any divergence from the catalog/presets fails CI.
 */
import { describe, it, expect } from "vitest";
import { statement, roles } from "../src/access.js";
import { PERMISSION_CATALOG, ROLE_PRESETS, TENANT_ROLES } from "@mossa/domain";

// `member` is governed by Better Auth's own organization statements, not our
// catalog, so it's intentionally absent from access.ts's custom statement.
const RESERVED = new Set(["member"]);
const s = (a: readonly string[] | undefined) => [...(a ?? [])].sort();

describe("RBAC conformance", () => {
  it("access.ts statement matches PERMISSION_CATALOG (minus reserved)", () => {
    for (const [res, acts] of Object.entries(PERMISSION_CATALOG)) {
      if (RESERVED.has(res)) continue;
      expect(s((statement as Record<string, readonly string[]>)[res]), `statement.${res}`).toEqual(s(acts));
    }
  });

  it("each role grant matches its preset and never exceeds the catalog", () => {
    for (const role of TENANT_ROLES) {
      const grant = (roles as unknown as Record<string, { statements: Record<string, string[]> }>)[role]!.statements;
      const preset = ROLE_PRESETS[role]!;
      // Every preset (resource, actions) is present in the role grant.
      for (const [res, acts] of Object.entries(preset)) {
        if (RESERVED.has(res)) continue;
        expect(s(grant[res]), `${role}.${res}`).toEqual(s(acts));
      }
      // The role grants no CATALOG resource beyond its preset (Better Auth org
      // keys like organization/invitation/team/ac are ignored).
      for (const res of Object.keys(grant)) {
        if (RESERVED.has(res) || !(res in PERMISSION_CATALOG)) continue;
        expect(preset[res], `${role} grants ${res} beyond its preset`).toBeDefined();
      }
    }
  });
});
