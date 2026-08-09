/**
 * THE COMPOSITION REFUSALS THE RUNTIME MAKES, which are the ones an app cannot
 * sidestep.
 *
 * ⚠️ `defineApp` runs the same checks and names the manifest, which is where the
 * error is most useful. But an `AppSpec` is structurally typed, so an app can
 * assemble one without ever calling the constructor — and a check that is
 * skipped by not using a helper is a check with an undocumented opt-out. This
 * asserts the door itself refuses.
 */

import { describe, expect, it } from "vitest";
import { createRuntime } from "../src/runtime.js";
import { collectionOperations } from "../src/collection-ops.js";
import { customerOperations } from "../src/commerce-ops.js";
import { PARKED, standingFor } from "../src/commerce.js";
import { cache, collection, defineBindings, field, objects, s, sql, operation, type AppSpec, type Instant, type RegionId } from "@one/kernel";

const bindings = defineBindings({ db: sql(), media: objects({ jurisdictional: true }), cache: cache() });

const stored = collection({
  id: "thing",
  label: { one: "Thing", many: "Things" },
  scope: { of: "tenant" },
  version: true,
  retention: { days: null, onTenantClose: "purge" },
  onDelete: { on: "archive" },
  fields: { title: field.text({ required: true }) },
});

const counted = operation({
  id: "team.seat.take",
  kind: "write",
  summary: "Take a seat.",
  input: s.object({}),
  output: s.object({}),
  permission: "seat:take",
  quota: "seats",
  idempotency: { mode: "none" },
  async handler() { return {}; },
});

/** Everything a runtime needs that is not what the test is about. */
const app = (over: Partial<AppSpec<typeof bindings>>): AppSpec<typeof bindings> => ({
  id: "probe",
  name: "Probe",
  stripeMetadataPrefix: "probe",
  manifestVersion: "0.1.0",
  bindings,
  identity: { rootRelyingParty: "4dl.app", sessionScope: "origin", directoryRegion: "eu" as RegionId },
  tenancy: {
    appRoot: "probe.4dl.app", doors: ["root", "setup", "slug"],
    regions: ["auto"] as RegionId[], defaultRegion: "auto" as RegionId, reservedSlugs: [],
  },
  format: { currency: "EUR", timeZone: "Europe/Berlin" as never, locale: "en" as never, units: "metric", weekStart: 1 },
  access: {
    permissions: ["seat:take"], roles: {}, entitlements: {}, plans: [],
    customerRail: false, customerFlags: {}, seats: { counts: [] },
  },
  governance: { legal: [], impersonation: { maxMinutes: 30, announce: true }, auditRetentionDays: 365 },
  collections: [],
  operations: [],
  problems: {},
  ...over,
});

const opts = {
  directoryBinding: "DIRECTORY",
  identityBinding: "DIRECTORY",
  sessionsBinding: "db" as const,
  deliverCode: async () => {},
  resolveCaller: async () => ({ actor: { userId: null, tenantId: null, kind: "system" as const }, permissions: new Set<string>() }),
};

/* ---------------------------------------------------------- the two rails --- */

/**
 * ⚠️ THE CUSTOMER SURFACE IS ABSENT WHERE THERE IS NO RAIL, rather than present
 * and inert. An operation that exists and resolves nothing is a surface a later
 * stage builds on by mistake, and its refusals read as policy — "you may not
 * do that here" — rather than as "this product does not have that".
 */
describe("the customer rail is mounted only where an app declares one", () => {
  const withRail = { ...app({}).access, customerRail: true, customerFlags: { digest: { parked: false, enforcement: { derived: "n/a here" } as const } } };

  it("mounts nothing at all when the app has no rail", () => {
    expect(customerOperations(app({}))).toEqual([]);
  });

  it("mounts the offer, the grant and the explanation when it does", () => {
    const ids = customerOperations(app({ access: withRail })).map((op) => op.id).sort();
    expect(ids).toEqual(["commerce.capabilities", "commerce.grant", "commerce.package.save", "commerce.packages"]);
  });

  /*
    ⚠️ GRANTING PAID ACCESS IS NOT REACHABLE BY A TOOL. It is opt-out everywhere
    else; this is where opting out is worth the sentence, because a model that
    can grant access can be talked into it by a document it was asked to read.
  */
  it("keeps the grant away from the assistant", () => {
    const grant = customerOperations(app({ access: withRail })).find((op) => op.id === "commerce.grant");
    expect(grant?.tool).toBe(false);
  });
});

/* ---------------------------------------------------------------- ladder --- */

/**
 * THE RUNGS, AND THE TWO STATES THAT ARE NOT RUNGS.
 *
 * ⚠️ THE LADDER IS A CLOCK, NOT A STATUS. A provider reports that a charge
 * failed; how long ago it failed is what decides whether the workspace is being
 * warned, held read-only or withheld. Storing the rung instead of deriving it
 * means a workspace stays wherever a sweep last left it, including forever if
 * the sweep stops running.
 */
describe("where a workspace stands on the ladder", () => {
  const due = "2026-01-01T00:00:00.000Z" as Instant;
  const after = (days: number) => new Date(Date.parse(due) + days * 86_400_000).toISOString() as Instant;
  const arrears = { ...PARKED, planId: "keeper", status: "past_due" as const, pastDueAt: due };

  it("warns, then holds read-only, then withholds — anchored on when the charge failed", () => {
    expect(standingFor(arrears, after(1), true).standing).toBe("grace");
    expect(standingFor(arrears, after(6.9), true).standing).toBe("grace");
    expect(standingFor(arrears, after(7), true).standing).toBe("read_only");
    expect(standingFor(arrears, after(29), true).standing).toBe("read_only");
    expect(standingFor(arrears, after(30), true).standing).toBe("blocked");
  });

  it("says when the next rung arrives, so somebody can be told before it does", () => {
    expect(standingFor(arrears, after(1), true).nextAt).toBe(after(7));
    expect(standingFor(arrears, after(8), true).nextAt).toBe(after(30));
  });

  /*
    ⚠️ THE PARKING STATE IS NOT A VERDICT. A shipping product returned the stored
    status verbatim here, so the moment anything materialised the row the parking
    DEFAULT was read as a decision — and an ordinary write started answering 402
    on a deployment with no payment provider at all.
  */
  it("is active with no plan where nothing could have been paid, and setup where it could", () => {
    expect(standingFor(PARKED, after(0), false)).toEqual({ standing: "active", reason: "ok" });
    expect(standingFor(PARKED, after(0), true)).toEqual({ standing: "read_only", reason: "setup" });
  });

  /*
    ⚠️ AN UNFINISHED SIGNUP IS ITS OWN REASON. Nothing was taken from them and
    there is no arrears to settle, so the copy cannot be the arrears copy.
  */
  it("keeps an unfinished signup apart from arrears and from closing", () => {
    expect(standingFor(PARKED, after(0), true).reason).toBe("setup");
    expect(standingFor(arrears, after(8), true).reason).toBe("arrears");
    expect(standingFor({ ...PARKED, closingAt: after(7) }, after(0), true))
      .toEqual({ standing: "closing", reason: "closing", nextAt: after(7) });
  });

  /*
    ⚠️ CLOSING OUTRANKS EVERY RUNG. It is the owner's decision, reversed by
    cancelling rather than by paying — a workspace that cannot be closed while
    suspended is a trap, and one whose exit route is itself suspended has no exit.
  */
  it("lets a workspace in arrears still be closing", () => {
    expect(standingFor({ ...arrears, closingAt: after(40) }, after(35), true).standing).toBe("closing");
  });
});

/*
  ⚠️ THE GATES A COLLECTION DECLARES REACH EVERY OPERATION IT DERIVES, and this
  asserts the reach rather than the declaration. A collection derives seven
  operations; attaching a gate at each declaration site is seven chances to omit
  one, and the omission is invisible — six refuse correctly and the seventh is
  the one nobody thought to try.
*/
describe("a collection's gates reach what it derives", () => {
  const ops = collectionOperations({ ...stored, entitlement: "reports", quota: "stored", docStatus: { amendable: true, immutableAfterSubmit: [] } });

  it("gates every derived operation, reads included", () => {
    expect(ops.length).toBeGreaterThan(5);
    for (const op of ops) expect(op.entitlement, op.id).toBe("reports");
  });

  /*
    ⚠️ A CEILING COUNTS WHAT IS ADDED AND NOTHING ELSE. Refusing to show what a
    workspace already stored because it has since downgraded is holding their own
    records hostage rather than withholding a product — and an amendment is a new
    document, so it counts exactly as a create does.
  */
  it("counts only what adds a row", () => {
    const counted = ops.filter((op) => op.quota).map((op) => op.id).sort();
    expect(counted).toEqual(["thing.amend", "thing.create"]);
  });
});

describe("the runtime refuses a manifest that would sell something it cannot withhold", () => {
  it("refuses an entitlement no operation, collection or shaped response names", () => {
    expect(() => createRuntime(app({
      access: { ...app({}).access, entitlements: { reports: { parked: false, enforcement: "gate" } } },
    }), opts)).toThrow(/reports/);
  });

  /*
    ⚠️ A CEILING NOBODY CAN COUNT IS NOT A CEILING. It would report an obligation
    on every request and have it discharged as "fine" — a limit on a price list
    that refuses nothing, with the code reading as though it were enforced.
  */
  it("refuses an operation counting against a key nothing can count", () => {
    expect(() => createRuntime(app({
      access: { ...app({}).access, entitlements: { seats: { parked: 3, enforcement: "quota" } } },
      operations: [counted] as never,
    }), opts)).toThrow(/which nothing can count/);
  });

  it("accepts it once a collection declares the same key", () => {
    expect(() => createRuntime(app({
      access: { ...app({}).access, entitlements: { seats: { parked: 3, enforcement: "quota" } } },
      collections: [{ ...stored, quota: "seats" }],
      operations: [counted] as never,
    }), opts)).not.toThrow();
  });

  it("accepts it when the app says how to count", () => {
    expect(() => createRuntime(app({
      access: { ...app({}).access, entitlements: { seats: { parked: 3, enforcement: "quota" } } },
      operations: [counted] as never,
    }), { ...opts, countQuota: async () => 0 })).not.toThrow();
  });
});
