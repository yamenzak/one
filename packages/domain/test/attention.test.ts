import { describe, expect, it } from "vitest";
import {
  ATTENTION_TYPES, SEVERITY_RANK, isAttentionType, attentionLabelOf, attentionSeverityOf,
  topSeverity, rankByAttention, type AttentionSeverity,
} from "../src/attention.js";
import { PERMISSION_CATALOG } from "../src/perms.js";
import { FEATURES } from "../src/features.js";

describe("coach attention registry", () => {
  it("every type's permission is a real catalog resource", () => {
    for (const [type, meta] of Object.entries(ATTENTION_TYPES)) {
      expect(meta.permission in PERMISSION_CATALOG, `${type} → ${meta.permission}`).toBe(true);
    }
  });

  it("every type's feature (when set) is a real feature", () => {
    for (const [type, meta] of Object.entries(ATTENTION_TYPES)) {
      if (meta.feature) expect(meta.feature in FEATURES, `${type} → ${meta.feature}`).toBe(true);
    }
  });

  it("every type declares a valid severity + copy", () => {
    for (const [type, meta] of Object.entries(ATTENTION_TYPES)) {
      expect(meta.severity in SEVERITY_RANK, `${type} severity`).toBe(true);
      expect(meta.label.length, `${type} label`).toBeGreaterThan(0);
      expect(meta.actionLabel.length, `${type} action`).toBeGreaterThan(0);
      expect(meta.clientTab.length, `${type} tab`).toBeGreaterThan(0);
    }
  });

  it("the guard accepts known + rejects unknown; label falls back to the raw id", () => {
    expect(isAttentionType("goal_stale")).toBe(true);
    expect(isAttentionType("nope")).toBe(false);
    expect(attentionLabelOf("goal_stale")).toBe("Stale goal");
    expect(attentionLabelOf("nope")).toBe("nope");
    expect(attentionSeverityOf("client_quiet")).toBe("urgent");
  });

  it("topSeverity + rankByAttention order by worst severity then count", () => {
    const info: AttentionSeverity = "info", warn: AttentionSeverity = "warn", urgent: AttentionSeverity = "urgent";
    expect(topSeverity([{ severity: info }, { severity: urgent }, { severity: warn }])).toBe("urgent");
    expect(topSeverity([])).toBeNull();
    const rows = [
      { id: "a", items: [{ severity: warn }] },
      { id: "b", items: [{ severity: urgent }] },
      { id: "c", items: [{ severity: warn }, { severity: info }] },
    ];
    expect(rankByAttention(rows).map((r) => r.id)).toEqual(["b", "c", "a"]); // urgent first, then more-items among warns
  });

  it("goal_stale is the roster-visible signal the coach asked for, gated on goals", () => {
    expect(isAttentionType("goal_stale")).toBe(true);
    expect(ATTENTION_TYPES.goal_stale.feature).toBe("goals");
    expect(ATTENTION_TYPES.goal_stale.clientTab).toBe("goals");
  });
});
