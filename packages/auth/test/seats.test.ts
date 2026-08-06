/**
 * THE SEAT COUNT, and specifically the plural seat-free set.
 *
 * `seatFreeRoles` was `customerRole`, one string, because Kova has one principal
 * that is not staff. Scena has two — `board_coordinator` and `board_station` —
 * and they are minted PER BOARD, so a clinic with eight rooms creates eight of
 * them. Under the single-string version every one counted as a member of staff
 * and a four-seat plan was exhausted before anyone was hired.
 *
 * The interesting cases here are all about the SQL, because `role NOT IN (…)` is
 * built by string interpolation of placeholders and there is exactly one thing
 * that can go wrong with that shape: the empty list, where `NOT IN ()` is a
 * syntax error rather than a no-op. A fake D1 is enough — what is under test is
 * the predicate the counter builds, not D1's ability to count.
 */

import { describe, expect, it } from "vitest";
import { checkStaffSeat, pendingStaffSeats, staffSeatsUsed } from "../src/seats.js";

/** A D1 stub that records the SQL and the bindings, and answers a fixed row. */
function fakeDb(answer: unknown) {
  const seen: { sql: string; binds: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      const call = { sql, binds: [] as unknown[] };
      seen.push(call);
      const stmt = {
        bind(...binds: unknown[]) {
          call.binds = binds;
          return stmt;
        },
        first: async () => answer,
        all: async () => answer,
      };
      return stmt;
    },
  } as unknown as D1Database;
  return { db, seen };
}

describe("who occupies a staff seat", () => {
  it("excludes EVERY seat-free role, not just the first", async () => {
    const { db, seen } = fakeDb({ n: 3 });
    await staffSeatsUsed(db, "t1", ["board_coordinator", "board_station"]);
    expect(seen[0]!.sql).toContain("role NOT IN (?, ?)");
    expect(seen[0]!.binds).toEqual(["t1", "board_coordinator", "board_station"]);
  });

  it("counts every member when the app has no seat-free role", async () => {
    // Tessa. `NOT IN ()` is a SQLite syntax error, so the empty list has to
    // collapse to a tautology — and the tautology is the correct reading.
    const { db, seen } = fakeDb({ n: 3 });
    const n = await staffSeatsUsed(db, "t1", []);
    expect(seen[0]!.sql).not.toContain("NOT IN ()");
    expect(seen[0]!.sql).toContain("1 = 1");
    expect(seen[0]!.binds).toEqual(["t1"]);
    expect(n).toBe(3);
  });

  it("applies the same list to pending invitations", async () => {
    // The two halves counting different things is the bug this shape exists to
    // prevent: a seat-free role invited freely but counted as staff on accept.
    const { db, seen } = fakeDb({ results: [] });
    await pendingStaffSeats(db, "t1", ["client"]);
    expect(seen[0]!.sql).toContain("role NOT IN (?)");
    expect(seen[0]!.binds).toEqual(["t1", "client"]);
  });

  it("counts an invitation whose expiry will not parse", async () => {
    // Fail CLOSED: an unreadable expiry must hold its seat, not release it.
    const { db } = fakeDb({ results: [{ expiresAt: "not-a-date" }, { expiresAt: null }] });
    expect(await pendingStaffSeats(db, "t1", ["client"])).toBe(2);
  });
});

describe("the verdict", () => {
  const quota = (max: number) => async (_t: string, used: number) => ({ ok: used <= max, max });

  it("adds pending invitations only when asked to", async () => {
    const { db } = fakeDb({ n: 2, results: [{ expiresAt: null }] });
    const without = await checkStaffSeat(db, "t1", { seatFreeRoles: [], quota: quota(3) });
    const with_ = await checkStaffSeat(db, "t1", { seatFreeRoles: [], quota: quota(3) }, { countPending: true });
    expect(without.used).toBe(2);
    expect(with_.used).toBe(3);
  });

  it("says what to do, not just no", async () => {
    const { db } = fakeDb({ n: 5, results: [] });
    const v = await checkStaffSeat(db, "t1", { seatFreeRoles: [], quota: quota(4) });
    expect(v.ok).toBe(false);
    expect(v.message).toContain("upgrade your plan");
  });
});
