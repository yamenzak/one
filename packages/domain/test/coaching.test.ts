import { describe, expect, it } from "vitest";
import { canAccessClient, seesWholeRoster, primaryCoach } from "../src/coaching.js";

describe("multi-coach access rule", () => {
  it("owner + assistant see the whole roster", () => {
    expect(seesWholeRoster("owner")).toBe(true);
    expect(seesWholeRoster("assistant")).toBe(true);
    expect(seesWholeRoster("trainer")).toBe(false);
    expect(seesWholeRoster("client")).toBe(false);
    // …and reach any client regardless of assignment.
    expect(canAccessClient("owner", { isAssignedCoach: false, isOwnRecord: false })).toBe(true);
    expect(canAccessClient("assistant", { isAssignedCoach: false, isOwnRecord: false })).toBe(true);
  });

  it("a coach reaches only assigned clients (or their own record)", () => {
    expect(canAccessClient("trainer", { isAssignedCoach: true, isOwnRecord: false })).toBe(true);
    expect(canAccessClient("trainer", { isAssignedCoach: false, isOwnRecord: true })).toBe(true);
    expect(canAccessClient("trainer", { isAssignedCoach: false, isOwnRecord: false })).toBe(false);
  });

  it("a client reaches only their own record", () => {
    expect(canAccessClient("client", { isAssignedCoach: false, isOwnRecord: true })).toBe(true);
    expect(canAccessClient("client", { isAssignedCoach: true, isOwnRecord: false })).toBe(false); // assignment is irrelevant for a client
  });

  it("an unknown role is denied (fail closed)", () => {
    expect(canAccessClient("member", { isAssignedCoach: true, isOwnRecord: true })).toBe(false);
    expect(canAccessClient("", { isAssignedCoach: true, isOwnRecord: true })).toBe(false);
  });

  it("primaryCoach picks the flagged assignment, else the first, else null", () => {
    expect(primaryCoach([])).toBeNull();
    expect(primaryCoach([{ trainerUserId: "a", isPrimary: false }, { trainerUserId: "b", isPrimary: true }])?.trainerUserId).toBe("b");
    // No explicit primary → first assignment is the default.
    expect(primaryCoach([{ trainerUserId: "a", isPrimary: false }, { trainerUserId: "b", isPrimary: false }])?.trainerUserId).toBe("a");
  });
});
