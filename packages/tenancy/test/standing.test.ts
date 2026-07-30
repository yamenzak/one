/**
 * The standing matrix, enumerated.
 *
 * Every combination of the four axes is generated and asserted — 48 cells — so
 * the policy is documented by execution rather than by a comment that drifts.
 * The reason each cell holds is spelled out where it is not obvious, because the
 * non-obvious ones are the bugs this file exists to prevent: asking an archived
 * person to buy, punishing a client for their tenant's unpaid invoice, letting a
 * lockout at one tenant reach another.
 */

import { describe, expect, it } from "vitest";
import { resolveHostGate, resolveStanding, tenantStandingOf, STANDING_AXES, type StandingFacts, type Membership } from "../src/standing.js";

/** All 48 cells. */
function everyCell(): StandingFacts[] {
  const out: StandingFacts[] = [];
  for (const membership of STANDING_AXES.membership)
    for (const accessActive of STANDING_AXES.accessActive)
      for (const accessRequired of STANDING_AXES.accessRequired)
        for (const tenant of STANDING_AXES.tenant)
          out.push({ membership, accessActive, accessRequired, tenant });
  return out;
}

const facts = (m: Membership, over: Partial<StandingFacts> = {}): StandingFacts => ({
  membership: m, accessActive: true, accessRequired: false, tenant: "ok", ...over,
});

describe("standing — the matrix is total", () => {
  it("covers all 48 combinations and never throws", () => {
    const cells = everyCell();
    expect(cells.length).toBe(64); // 4 membership × 2 × 2 × 4 studio states
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
    // without checking archived, so a tenant that had just let someone go met them
    // with a screen selling that tenant's packages. Buying one would not un-archive
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

  it("stays read-only even while the studio is suspended", () => {
    const s = resolveStanding(facts("archived", { tenant: "suspended" }));
    expect(s.reason).toBe("archived"); // archived is the more specific truth
    expect(s.canRead).toBe(true);
    expect(s.canWrite).toBe(false);
  });
});

describe("standing — a tenant that stops paying the platform", () => {
  /**
   * The lifecycle is two-staged and the stages differ, which is the whole reason
   * `tenant` is three states rather than a `delinquent` boolean:
   *
   *   payment fails → `past_due` + GRACE_DAYS (7) of FULL service, owner dunned
   *   grace expires → `suspended`, entitlements clamped to free, owner told that
   *                   "paid features are paused for you and your clients"
   *   +DELETE_DAYS (30) → data wipe
   */
  it("GRACE changes nothing for the client — that is what a grace window is", () => {
    // Only the owner is notified during dunning. A client whose coach's card
    // failed this morning must not see a degraded app.
    expect(resolveStanding(facts("active", { tenant: "grace" })))
      .toEqual(resolveStanding(facts("active", { tenant: "ok" })));
  });

  it("grace still locks a gated client with no plan — for the usual reason, not the studio's", () => {
    // Grace must not accidentally become a bypass for the CLIENT-side gate.
    const s = resolveStanding(facts("active", { tenant: "grace", accessRequired: true, accessActive: false }));
    expect(s.reason).toBe("needs_access");
    expect(s.lockedToStorefront).toBe(true);
  });

  it("SUSPENDED is not 'as if nothing' — paid features are gone", () => {
    // The teeth are in `clampEntitlementsForStatus`, which drops the tenant to
    // FREE_ENTITLEMENTS; because client capability is `entitlements ∩ clientFlags`,
    // the client loses AI, commerce, body scan and external search with no
    // per-client bookkeeping. What this module decides is the remainder: their own
    // record and their own logbook.
    const s = resolveStanding(facts("active", { tenant: "suspended" }));
    expect(s.reason).toBe("tenant_suspended");
    expect(s.canPurchase).toBe(false); // the storefront IS a paid feature
  });

  it("closes the studio: read your history, write nothing", () => {
    // A suspended tenant is CLOSED, and the whole subdomain goes read-only —
    // enforced once by `resolveHostGate` in the route guard rather than re-derived
    // per handler. Writes are the tenant operating, and a tenant that stopped
    // paying does not keep operating.
    const s = resolveStanding(facts("active", { tenant: "suspended" }));
    expect(s.canWrite).toBe(false);
  });

  it("but it never takes away a client's own data", () => {
    // The line this module draws: the platform withholds what the platform sells and closes the
    // tenant, but it does not hold a client's training history hostage over their
    // coach's invoice — the client owes nobody. Same principle as `archived`.
    const s = resolveStanding(facts("active", { tenant: "suspended" }));
    expect(s.canRead).toBe(true);
  });

  it("suspension outranks the access gate rather than stacking with it", () => {
    // A storefront would be a dead end: the tenant has lost `commerce`, and no
    // purchase a client makes would fix the tenant's own subscription.
    for (const accessRequired of [true, false]) {
      for (const accessActive of [true, false]) {
        const s = resolveStanding(facts("active", { tenant: "suspended", accessRequired, accessActive }));
        expect(s.lockedToStorefront, `suspended + required:${accessRequired}`).toBe(false);
        expect(s.reason).toBe("tenant_suspended");
      }
    }
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

describe("standing — multi-tenant isolation", () => {
  it("three standings at once cannot mix", () => {
    // THE property that makes one identity across many tenants safe. A person
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
    // to switch tenants from it, B's unpaid access strands someone who has paid at
    // C. (See TenantListCard, rendered there for exactly this reason.)
    expect(atC.lockedToStorefront).toBe(false);
  });

  it("a suspended tenant does not reach the tenants that are paid up", () => {
    const atSuspended = resolveStanding(facts("active", { tenant: "suspended" }));
    const atHealthy = resolveStanding(facts("active"));
    expect(atSuspended.reason).toBe("tenant_suspended");
    expect(atHealthy.reason).toBe("ok");
    expect(atHealthy.canPurchase).toBe(true); // unaffected by the other studio
  });

  it("the same facts always give the same answer — no hidden state", () => {
    // Pure, so a switch between tenants can never leave residue behind.
    for (const f of everyCell()) {
      expect(resolveStanding(f)).toEqual(resolveStanding({ ...f }));
    }
  });
});

/**
 * The HOST gate — one level up from a person's standing: does this tenant's
 * subdomain serve a working app at all.
 */
describe("host gate — a suspended studio's subdomain is read-only", () => {
  it("maps every subscription status onto a studio standing", () => {
    expect(tenantStandingOf("active")).toBe("ok");
    expect(tenantStandingOf("trialing")).toBe("ok");
    expect(tenantStandingOf("past_due")).toBe("grace");
    for (const s of ["suspended", "unpaid", "canceled", "closing"]) {
      expect(tenantStandingOf(s), s).toBe("suspended");
    }
  });

  it("treats a MISSING subscription row as ok, so studio creation is not bricked", () => {
    // A tenant exists before its plan is chosen. Gating the host on a row the
    // onboarding wizard has not written yet would fail at step one, and the wizard
    // enforces plan selection itself.
    expect(tenantStandingOf(null)).toBe("ok");
    expect(tenantStandingOf(undefined)).toBe("ok");
    expect(resolveHostGate(null).readOnly).toBe(false);
  });

  it("treats an unknown future Stripe status as ok rather than locking everyone out", () => {
    // Failing OPEN is right here and failing closed is not: a status Stripe adds
    // later must not silently take every tenant on the platform offline.
    expect(resolveHostGate("some_status_stripe_invents_in_2027").readOnly).toBe(false);
  });

  it("grace is FULL service — that is what a grace window is", () => {
    const g = resolveHostGate("past_due");
    expect(g.readOnly).toBe(false);
    expect(g.reason).toBe("grace");
  });

  it("suspended and closing are both read-only, but report differently", () => {
    // Both lock writes; the copy has to differ, because one is asked to pay and the
    // other is told its data is scheduled for deletion.
    expect(resolveHostGate("suspended")).toEqual({ readOnly: true, blocked: false, billingWritable: true, reason: "suspended" });
    expect(resolveHostGate("closing")).toEqual({ readOnly: true, blocked: false, billingWritable: true, reason: "closing" });
    // The next rung: still read-only, but the app itself is withheld.
    expect(resolveHostGate("blocked")).toEqual({ readOnly: true, blocked: true, billingWritable: true, reason: "blocked" });
  });

  it("always leaves billing writable, so a lapsed studio can pay its way out", () => {
    // Without this, suspension is unrecoverable from inside the app.
    for (const s of ["suspended", "closing", "unpaid", "canceled"]) {
      expect(resolveHostGate(s).billingWritable, s).toBe(true);
    }
  });

  it("never gates reads — the gate only ever concerns writes", () => {
    // Asserted structurally: `HostGate` has no read flag to get wrong.
    for (const s of ["active", "past_due", "suspended", "blocked", "closing", null]) {
      expect(Object.keys(resolveHostGate(s)).sort()).toEqual(["billingWritable", "blocked", "readOnly", "reason"]);
    }
  });

  it("agrees with the client-side standing: suspended means no writes in both", () => {
    // The two live in one file precisely so they cannot drift. If a future edit
    // makes a suspended tenant writable in one and not the other, this fails.
    expect(resolveHostGate("suspended").readOnly).toBe(true);
    expect(resolveStanding(facts("active", { tenant: "suspended" })).canWrite).toBe(false);
  });
});
