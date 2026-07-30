import { describe, expect, it } from "vitest";
import {
  LAPSE_ACTIONS, LAPSE_META, DEFAULT_LAPSE_POLICY, MIN_DESTRUCTIVE_GRACE_DAYS, MAX_GRACE_DAYS,
  checkLapsePolicy, lapseActionDue, lapseStanding, isDestructive, type LapseAction,
} from "../src/lapse.js";

describe("client lapse policy", () => {
  it("defaults to the outcome that loses nobody anything", () => {
    // A studio that never opens this setting must not be silently deleting
    // lapsed clients.
    expect(DEFAULT_LAPSE_POLICY.action).toBe("read_only");
    expect(isDestructive(DEFAULT_LAPSE_POLICY.action)).toBe(false);
    expect(checkLapsePolicy(DEFAULT_LAPSE_POLICY).ok).toBe(true);
  });

  it("every action has copy, and only the destructive pair says so", () => {
    for (const a of LAPSE_ACTIONS) {
      const m = LAPSE_META[a];
      expect(m.label, a).toBeTruthy();
      expect(m.effect, a).toBeTruthy();
      expect(m.destructive, a).toBe(isDestructive(a));
    }
    // The seat rule is the one people get wrong, so it must be stated on both
    // actions that touch a seat — and in opposite directions.
    expect(LAPSE_META.archive.seat).toMatch(/keeps/i);
    expect(LAPSE_META.delete.seat).toMatch(/frees/i);
    expect(LAPSE_META.read_only.seat).toBeNull();
    expect(LAPSE_META.blocked.seat).toBeNull();
  });

  it("refuses a destructive policy with too little grace", () => {
    for (const a of ["archive", "delete"] as LapseAction[]) {
      const bad = checkLapsePolicy({ action: a, graceDays: MIN_DESTRUCTIVE_GRACE_DAYS - 1 });
      expect(bad.ok, a).toBe(false);
      expect(bad.error, a).toMatch(/at least/);
      expect(checkLapsePolicy({ action: a, graceDays: MIN_DESTRUCTIVE_GRACE_DAYS }).ok, a).toBe(true);
    }
    // The gentle ones may fire immediately — nothing is lost.
    expect(checkLapsePolicy({ action: "read_only", graceDays: 0 }).ok).toBe(true);
    expect(checkLapsePolicy({ action: "blocked", graceDays: 0 }).ok).toBe(true);
  });

  it("rejects nonsense grace values", () => {
    expect(checkLapsePolicy({ action: "read_only", graceDays: -1 }).ok).toBe(false);
    expect(checkLapsePolicy({ action: "read_only", graceDays: 1.5 }).ok).toBe(false);
    expect(checkLapsePolicy({ action: "read_only", graceDays: MAX_GRACE_DAYS + 1 }).ok).toBe(false);
  });

  it("fires only once grace has fully elapsed", () => {
    const p = { action: "archive" as LapseAction, graceDays: 30 };
    expect(lapseActionDue(p, 29)).toBeNull();
    expect(lapseActionDue(p, 30)).toBe("archive");
    expect(lapseActionDue(p, 400)).toBe("archive");
  });

  it("renders the two STATES and imposes nothing for the two EVENTS", () => {
    expect(lapseStanding("read_only")).toEqual({ canWrite: false, lockedToStorefront: false });
    expect(lapseStanding("blocked")).toEqual({ canWrite: false, lockedToStorefront: true });
    // Inside grace: untouched.
    expect(lapseStanding(null)).toEqual({ canWrite: true, lockedToStorefront: false });
    // Already performed — membership answers now, not this.
    expect(lapseStanding("archive")).toEqual({ canWrite: true, lockedToStorefront: false });
    expect(lapseStanding("delete")).toEqual({ canWrite: true, lockedToStorefront: false });
  });
});
