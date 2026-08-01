/**
 * THE MAINTENANCE MODEL.
 *
 * Two properties carry the whole feature, and both are the kind that a reviewer
 * agrees with and an implementation quietly loses:
 *
 *   `readonly` LETS READS THROUGH. If it ever refuses a GET it stops being
 *   read-only and becomes an outage with a friendlier name — and the difference
 *   is the entire reason the level exists.
 *
 *   AN UNPARSEABLE ROW MEANS `off`. This state is stored as free-form text in
 *   `app_config`, where a typo, a half-finished write or a restored backup can
 *   put anything at all. Failing closed on that would take the deployment down
 *   for a reason nobody chose, and the fix would be editing the very row causing
 *   the lockout.
 */

import { describe, expect, it } from "vitest";
import {
  MAINTENANCE_KEYS,
  MAINTENANCE_MESSAGE_MAX,
  MAINTENANCE_OFF,
  isMaintenanceLevel,
  maintenanceRefuses,
  parseMaintenance,
} from "../src/maintenance.js";

const K = MAINTENANCE_KEYS;

describe("what each level refuses", () => {
  it("off refuses nothing", () => {
    for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      expect(maintenanceRefuses("off", m)).toBe(false);
    }
  });

  it("readonly refuses writes and serves reads", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(maintenanceRefuses("readonly", m)).toBe(true);
    }
    // The load-bearing half. A person's own records are not withheld to protect
    // a migration from them — the same principle the host gate holds to.
    expect(maintenanceRefuses("readonly", "GET")).toBe(false);
    expect(maintenanceRefuses("readonly", "HEAD")).toBe(false);
  });

  it("full refuses everything, reads included", () => {
    for (const m of ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]) {
      expect(maintenanceRefuses("full", m)).toBe(true);
    }
  });

  it("matches the method case-insensitively", () => {
    // Hono normalises, but the guard is not the only conceivable caller and a
    // lowercase verb slipping through would silently serve every write.
    expect(maintenanceRefuses("readonly", "post")).toBe(true);
    expect(maintenanceRefuses("readonly", "get")).toBe(false);
  });
});

describe("reading the switch out of app_config", () => {
  it("an empty table is off", () => {
    expect(parseMaintenance({})).toEqual(MAINTENANCE_OFF);
  });

  it("reads a level, its message and its timestamp", () => {
    expect(
      parseMaintenance({
        [K.level]: "readonly",
        [K.message]: "  Back by 14:00 UTC. ",
        [K.since]: "2026-08-01T09:00:00.000Z",
      }),
    ).toEqual({ level: "readonly", message: "Back by 14:00 UTC.", since: "2026-08-01T09:00:00.000Z" });
  });

  it("an empty message is null, not an empty string", () => {
    // The app falls back to its own copy on null. An empty string would render
    // as a blank line where the explanation should be.
    const m = parseMaintenance({ [K.level]: "full", [K.message]: "   " });
    expect(m.message).toBeNull();
    expect(m.since).toBeNull();
  });

  it("truncates an over-long message rather than rejecting the state", () => {
    const m = parseMaintenance({ [K.level]: "full", [K.message]: "x".repeat(MAINTENANCE_MESSAGE_MAX + 50) });
    expect(m.message).toHaveLength(MAINTENANCE_MESSAGE_MAX);
    // The LEVEL survives. A bad message must never be the thing that decides
    // whether the deployment is closed.
    expect(m.level).toBe("full");
  });

  it("resolves an unrecognised level to off — the only safe direction", () => {
    for (const junk of ["readOnly", "FULL", "on", "true", "1", "", "   ", "maintenance"]) {
      expect(parseMaintenance({ [K.level]: junk })).toEqual(MAINTENANCE_OFF);
    }
  });

  it("drops the message and timestamp when the level is off", () => {
    // A stale message left behind by an earlier window must not survive into a
    // state that has no notice to show it on.
    expect(parseMaintenance({ [K.level]: "off", [K.message]: "old", [K.since]: "2026-01-01" })).toEqual(MAINTENANCE_OFF);
  });

  it("guards the level type", () => {
    expect(isMaintenanceLevel("readonly")).toBe(true);
    expect(isMaintenanceLevel("full")).toBe(true);
    expect(isMaintenanceLevel("off")).toBe(true);
    expect(isMaintenanceLevel("closed")).toBe(false);
    expect(isMaintenanceLevel(null)).toBe(false);
    expect(isMaintenanceLevel(1)).toBe(false);
  });
});
