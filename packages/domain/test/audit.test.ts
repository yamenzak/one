import { describe, expect, it } from "vitest";
import { AUDIT_ACTIONS, isAuditAction, auditLabel } from "../src/audit.js";
import { PERMISSION_CATALOG } from "../src/perms.js";
import { FEATURES } from "../src/features.js";

describe("audit action registry", () => {
  it("every action's permission is a real catalog resource", () => {
    for (const [id, meta] of Object.entries(AUDIT_ACTIONS)) {
      expect(Object.keys(PERMISSION_CATALOG), id).toContain(meta.permission);
    }
  });

  it("every action's feature (when set) is a real feature", () => {
    for (const [id, meta] of Object.entries(AUDIT_ACTIONS)) {
      if (meta.feature) expect(Object.keys(FEATURES), id).toContain(meta.feature);
    }
  });

  it("isAuditAction guards arbitrary strings", () => {
    expect(isAuditAction("goal.set")).toBe(true);
    expect(isAuditAction("nope.bad")).toBe(false);
  });

  it("auditLabel renders the human phrase, falls back to the id", () => {
    expect(auditLabel("plan.publish")).toBe("published a plan");
    expect(auditLabel("unknown.action")).toBe("unknown.action");
  });
});
