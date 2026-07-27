/**
 * The standing matrix, enumerated.
 *
 * Every combination of the four axes is generated and asserted — 32 cells — so
 * the policy is documented by execution rather than by a comment that drifts.
 * The reason each cell holds is spelled out where it is not obvious, because the
 * non-obvious ones are the bugs this file exists to prevent: asking an archived
 * person to buy, punishing a client for their studio's unpaid invoice, letting a
 * lockout at one studio reach another.
 */

import { describe, expect, it } from "vitest";
import { resolveStanding, STANDING_AXES, type StandingFacts, type Membership } from "../src/standing.js";

/** All 32 cells. */
function everyCell(): StandingFacts[] {
  const out: StandingFacts[] = [];
  for (const membership of STANDING_AXES.membership)
    for (const accessActive of STANDING_AXES.accessActive)
      for (const accessRequired of STANDING_AXES.accessRequired)
        for (const studioDelinquent of STANDING_AXES.studioDelinquent)
          out.push({ membership, accessActive, accessRequired, studioDelinquent });
  return out;
}

const facts = (m: Membership, over: Partial<StandingFacts> = {}): StandingFacts => ({
  membership: m, accessActive: true, accessRequired: false, studioDelinquent: false, ...over,
});

describe("standing — the matrix is total", () => {
  it("covers all 32 combinations and never throws", () => {
    const cells = everyCell();
    expect(cells.length).toBe(32);
    for (const f of cells) {
      const s = resolveStanding(f);
      expect(typeof s.reason, JSON.stringify(f)).toBe("string");
    }
  });

  it("write is never granted without read", () => {
    // A state that can write but not read would be incoherent — and would mean
    // some screen accepts input it cannot display back.
    for (const f of everyCell()) {
      const s = resolveStanding(f);
      if (s.canWrite) expect(s.canRead, `writable but not readable: ${JSON.stringify(f)}`).toBe(true);
    }
  });

  it("the storefront lock and readable access are mutually exclusive", () => {
    // Locked means the app IS the storefront: there is no app behind it to read.
    for (const f of everyCell()) {
      const s = resolveStanding(f);
      if (s.lockedToStorefront) expect(s.canRead, JSON.stringify(f)).toBe(false);
    }
  });
});

describe("standing — archived", () => {
  it("reads their own history, writes nothing, and is NOT sold to", () => {
    const s = resolveStanding(facts("archived"));
    expect(s).toMatchObject({ canRead: true, canWrite: false, canPurchase: false, lockedToStorefront: false, reason: "archived" });
  });

  it("outranks the access gate — a gated studio does not greet them with a shop", () => {
    // The bug this prevents: the Shell's access gate fired on `required && !active`
    // without checking archived, so a studio that had just let someone go met them
    // with a screen selling that studio's packages. Buying one would not un-archive
    // them either, so the storefront was not even a way out.
    for (const accessActive of [true, false]) {
      for (const accessRequired of [true, false]) {
        const s = resolveStanding(facts("archived", { accessActive, accessRequired }));
        expect(s.lockedToStorefront, `archived + required:${accessRequired} active:${accessActive}`).toBe(false);
        expect(s.canRead).toBe(true);
        expect(s.canWrite).toBe(false);
      }
    }
  });

  it("stays read-only even while the studio is delinquent", () => {
    const s = resolveStanding(facts("archived", { studioDelinquent: true }));
    expect(s.reason).toBe("archived"); // archived is the more specific truth
    expect(s.canRead).toBe(true);
    expect(s.canWrite).toBe(false);
  });
});

describe("standing — a studio that stops paying", () => {
  it("never costs the CLIENT their data or their logging", () => {
    // The studio owes Mossa; the client owes nobody. Degrading the studio's paid
    // features is correct (entitlements do that); locking a client out of their own
    // history because their coach's card failed is not.
    const s = resolveStanding(facts("active", { studioDelinquent: true }));
    expect(s.canRead).toBe(true);
    expect(s.canWrite).toBe(true);
    expect(s.reason).toBe("studio_delinquent");
  });

  it("does not lock them to a storefront — buying could not fix it anyway", () => {
    for (const accessRequired of [true, false]) {
      for (const accessActive of [true, false]) {
        const s = resolveStanding(facts("active", { studioDelinquent: true, accessRequired, accessActive }));
        expect(s.lockedToStorefront, `delinquent + required:${accessRequired}`).toBe(false);
      }
    }
  });

  it("suspends purchasing, because the studio's own rail is not in good standing", () => {
    expect(resolveStanding(facts("active", { studioDelinquent: true })).canPurchase).toBe(false);
  });
});

describe("standing — the access gate", () => {
  it("locks only when the studio requires access and there is none", () => {
    expect(resolveStanding(facts("active", { accessRequired: true, accessActive: false })))
      .toMatchObject({ lockedToStorefront: true, canPurchase: true, reason: "needs_access" });
    // Not required → no lock, whatever the access state.
    expect(resolveStanding(facts("active", { accessRequired: false, accessActive: false })).lockedToStorefront).toBe(false);
    // Required but covered → no lock.
    expect(resolveStanding(facts("active", { accessRequired: true, accessActive: true })).lockedToStorefront).toBe(false);
  });

  it("a locked client can still buy — the lock is a door, not a wall", () => {
    expect(resolveStanding(facts("active", { accessRequired: true, accessActive: false })).canPurchase).toBe(true);
  });
});

describe("standing — nothing to stand on", () => {
  it("no client record: nothing to read, nothing to sell", () => {
    expect(resolveStanding(facts("none"))).toMatchObject({ canRead: false, canWrite: false, canPurchase: false, reason: "no_record" });
  });

  it("an unclaimed self-signup reservation is not a client", () => {
    // No member row exists until it is claimed, so this should never surface as a
    // persona at all. Asserted anyway: a caller that finds one must not treat an
    // unverified address as a person with a record.
    const s = resolveStanding(facts("pending_signup"));
    expect(s).toMatchObject({ canRead: false, canWrite: false, canPurchase: false, reason: "unclaimed" });
  });
});

describe("standing — multi-studio isolation", () => {
  it("three standings at once cannot mix", () => {
    // THE property that makes one identity across many studios safe. A person
    // archived at A, locked out at B and training at C holds three different
    // standings simultaneously, and each is computed from one tenancy's facts.
    const atA = resolveStanding(facts("archived"));
    const atB = resolveStanding(facts("active", { accessRequired: true, accessActive: false }));
    const atC = resolveStanding(facts("active"));

    expect(atA.reason).toBe("archived");
    expect(atB.reason).toBe("needs_access");
    expect(atC.reason).toBe("ok");

    // Being finished at A does not stop them training at C…
    expect(atC.canWrite).toBe(true);
    // …and being locked out at B does not either. This is what the locked
    // storefront screen must respect: it replaces the whole app, so without a way
    // to switch studios from it, B's unpaid access strands someone who has paid at
    // C. (See StudioListCard, rendered there for exactly this reason.)
    expect(atC.lockedToStorefront).toBe(false);
  });

  it("a delinquent studio does not reach the studios that are paid up", () => {
    const atDelinquent = resolveStanding(facts("active", { studioDelinquent: true }));
    const atHealthy = resolveStanding(facts("active"));
    expect(atDelinquent.reason).toBe("studio_delinquent");
    expect(atHealthy.reason).toBe("ok");
    expect(atHealthy.canPurchase).toBe(true); // unaffected by the other studio
  });

  it("the same facts always give the same answer — no hidden state", () => {
    // Pure, so a switch between studios can never leave residue behind.
    for (const f of everyCell()) {
      expect(resolveStanding(f)).toEqual(resolveStanding({ ...f }));
    }
  });
});
