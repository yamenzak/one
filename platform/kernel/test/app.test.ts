/**
 * THE WHOLE APP, AND THE PIECES NOTHING ELSE REACHES.
 *
 * `proof.app.ts` proves that an app COMPOSES — it compiles or it does not. This
 * file asserts the properties a compile cannot: that the day-zero fields are
 * genuinely unskippable, that a provider's words cannot escape, and that the
 * door taxonomy is a partition rather than two lists somebody keeps in step.
 */

import { describe, expect, it } from "vitest";
import { kova } from "./proof.app.js";
import { PLATFORM_PROBLEMS, type Problem, type ProblemCode, type ProviderAdapter } from "../src/problem.js";
import { TENANT_DOORS, TENANTLESS_DOORS, DIRECTORY_REGION, classifyHost, cookieDomainFor, type Door, type DoorConfig } from "../src/doors.js";
import { assertComposable, coverage, undeclaredEmits } from "../src/app.js";
import type { EntitlementDef, PlanSpec } from "../src/entitlement.js";
import type { FlagDef } from "../src/customer.js";
import type { CollectionSpec } from "../src/collection.js";
import type { NotificationDef } from "../src/notify.js";
import { isArchived } from "../src/document.js";

/** The smallest thing the coverage walk will read — it inspects four fields. */
const stub = { id: "x.do", kind: "write", permission: "x" };
const stubCollection = { id: "x", label: { one: "X", many: "Xs" }, scope: { of: "tenant" } };

import type { RowBase } from "../src/collection.js";
import type { Result } from "../src/operation.js";
import type { Instant, Id, Money, Quantity } from "../src/primitives.js";

/* ------------------------------------------------------------------- app --- */

describe("an app assembles", () => {
  /*
    ⚠️ THE PROPERTY WORTH ASSERTING IS THAT NONE OF THESE COULD BE OMITTED.
    Each implies a column, a table or a legal record, so an app that shipped
    without one is an app that needs a migration rather than an edit — and the
    ones most likely to be forgotten are the ones with no visible feature
    attached: a consent ledger, a seat ceiling, an impersonation trail.
  */
  it("carries every day-zero declaration", () => {
    expect(kova.identity.rootRelyingParty).toBe("4dl.app");
    expect(kova.tenancy.defaultRegion).toBeTruthy();
    expect(kova.format.timeZone).toBeTruthy();
    expect(kova.access.seats.counts.length).toBeGreaterThan(0);
    expect(kova.governance.legal.length).toBeGreaterThan(0);
    expect(kova.governance.impersonation.maxMinutes).toBeGreaterThan(0);
    expect(kova.collections.every((c) => c.version === true)).toBe(true);
    expect(kova.operations.every((o) => o.idempotency)).toBe(true);
  });

  /*
    An account is shared across products; a session is not. Sharing the cookie
    would make a script injected into any one product an actor in all of them —
    which is a blast radius bought for a convenience nobody asked for.
  */
  it("shares the credential and never the session", () => {
    expect(kova.identity.rootRelyingParty).not.toContain("kova");
    expect(kova.identity.sessionScope).toBe("origin");
  });

  it("records who must accept which version of what", () => {
    const dpa = kova.governance.legal.find((d) => d.id === "dpa");
    expect(dpa?.version).toBeTruthy();
    expect(dpa?.mustAccept).toContain("owner");
  });
});

/* --------------------------------------------------------------- problems --- */

describe("a failure is a Problem, never a provider's words", () => {
  it("gives every platform code copy and a status", () => {
    for (const [code, def] of Object.entries(PLATFORM_PROBLEMS)) {
      expect(def.title, `${code} has no title`).toBeTruthy();
      expect(def.status, `${code} has no status`).toBeGreaterThanOrEqual(400);
      expect(typeof def.retryable, `${code} does not say whether retrying helps`).toBe("boolean");
    }
  });

  it("says whether trying again could plausibly work", () => {
    // Decided once per code, by whoever knows — not guessed at a call site.
    expect(PLATFORM_PROBLEMS["platform.unavailable"].retryable).toBe(true);
    expect(PLATFORM_PROBLEMS["platform.forbidden"].retryable).toBe(false);
  });

  /*
    ⚠️ THE ADAPTER IS THE ONLY CODE PERMITTED TO SEE A PROVIDER'S SHAPE, and
    `null` is the answer that matters. It does not mean "pass it through" — it
    means unrecognised, which becomes `platform.unavailable` with a correlation
    id while the raw text goes to the log. A provider's prose is written for us:
    it carries model names, quota internals, account identifiers and sometimes a
    slice of the prompt, and forwarding it is a disclosure nobody decided to make.
  */
  it("maps what it recognises and refuses to forward what it does not", () => {
    type Raw = { status: number; message: string };
    const adapter: ProviderAdapter<Raw> = {
      provider: "example",
      map: (raw) => (raw.status === 429 ? { code: "platform.unavailable", meta: { retryAfter: 30 } } : null),
    };

    expect(adapter.map({ status: 429, message: "quota project 41 exhausted" })).toEqual({
      code: "platform.unavailable",
      meta: { retryAfter: 30 },
    });

    const leaky = { status: 500, message: "model gemini-2.5-pro failed for account 8813" };
    const mapped = adapter.map(leaky);
    expect(mapped).toBeNull();
    expect(JSON.stringify(mapped)).not.toContain("8813");
  });

  it("names its codes from the catalogue rather than from a throw site", () => {
    const code: ProblemCode<typeof PLATFORM_PROBLEMS> = "platform.conflict";
    expect(PLATFORM_PROBLEMS[code]).toBeDefined();
    // @ts-expect-error — a code nobody declared is not a code.
    const invented: ProblemCode<typeof PLATFORM_PROBLEMS> = "platform.oops";
    void invented;
  });

  it("returns a Problem on failure, never a string", () => {
    const problem: Problem = { code: "platform.conflict", status: 409, title: "Changed", retryable: false, ref: "ONE-7F3A2B" };
    const failed: Result<{ id: string }> = { ok: false, problem };
    expect(failed.ok).toBe(false);
    // The correlation id is what makes withholding the detail helpful rather
    // than hostile: it is the thing a customer can quote to support.
    if (!failed.ok) expect(failed.problem.ref).toBeTruthy();

    // @ts-expect-error — a bare message is not a failure the client can branch on.
    const wrong: Result<{ id: string }> = { ok: false, problem: "it broke" };
    void wrong;
  });
});

/* ------------------------------------------------------------------ doors --- */

describe("the door taxonomy", () => {
  /*
    ⚠️ TWO LISTS THAT MUST PARTITION THE UNION, asserted as one. A door added to
    the type and to neither list resolves as neither tenanted nor tenantless —
    which is not an error anywhere, it is a request that quietly reaches the
    wrong branch. `EVERY_DOOR` is exhaustive by compile error, so the assertion
    below cannot pass by being out of date itself.
  */
  const EVERY_DOOR = ["root", "setup", "admin", "tenant", "custom", "device", "unclaimed", "invalid"] as const;
  type Unlisted = Exclude<Door, (typeof EVERY_DOOR)[number]>;
  const _exhaustive: Unlisted extends never ? true : never = true;
  void _exhaustive;

  it("splits every door into tenanted or tenantless, with no overlap", () => {
    expect([...TENANT_DOORS, ...TENANTLESS_DOORS].sort()).toEqual([...EVERY_DOOR].sort());
    expect(TENANT_DOORS.filter((d) => TENANTLESS_DOORS.includes(d))).toEqual([]);
  });

  const cfg: DoorConfig = { appRoot: "kova.4dl.app", platformRoot: "4dl.app", reserved: ["kova"], deviceDoor: "play" };

  it("resolves no tenant from a tenantless host", () => {
    for (const host of ["kova.4dl.app", "setup.kova.4dl.app", "admin.kova.4dl.app", "play.kova.4dl.app"]) {
      expect(TENANTLESS_DOORS, host).toContain(classifyHost(host, cfg).door);
    }
  });

  /*
    ⚠️ THE PLATFORM ROOT IS NOT A CUSTOM DOMAIN. It is above this app's root, so
    it matches no label — and anything matching no label falls through to a
    lookup in the custom-domain directory. A tenant holding it would be served at
    the one address every product's credentials are scoped to.
  */
  it("refuses to treat the platform root as somebody's own domain", () => {
    const shape = classifyHost("4dl.app", cfg);
    expect(shape.door).not.toBe("custom");
    expect(TENANTLESS_DOORS).toContain(shape.door);
  });

  /*
    A host may only widen a cookie to a suffix of itself. Widening from above the
    app root produces a `Set-Cookie` the browser drops without a word: a sign-in
    that succeeds and leaves no session.
  */
  it("does not widen a cookie to a domain the host sits above", () => {
    expect(cookieDomainFor(classifyHost("4dl.app", cfg))).toBeNull();
    expect(cookieDomainFor(classifyHost("gym.kova.4dl.app", cfg))).toBe(".kova.4dl.app");
  });

  /*
    A request with no tenant still has to read from somewhere, and that somewhere
    is fixed. EU is always SUFFICIENT — no subject outside it objects to being
    held there, and the reverse is not true — and a person may belong to an EU
    tenant and a non-EU one at once, which per-region identity cannot answer
    without knowing who you are before it knows where to look.
  */
  it("reads routing data from one fixed home", () => {
    expect(DIRECTORY_REGION).toBe("eu");
  });
});

/* -------------------------------------------------------------------- row --- */

describe("the row a collection implies", () => {
  const row: RowBase & { weight: Quantity<"mass">; price: Money } = {
    id: "r_1" as Id<"package">,
    version: 3,
    createdAt: "2026-08-09T09:00:00.000Z" as Instant,
    updatedAt: "2026-08-09T09:00:00.000Z" as Instant,
    deletedAt: null,
    // Canonical unit, always. A reader seeing pounds is a rendering decision
    // from their own preference, not a different stored number.
    weight: { value: 82.5, dimension: "mass" },
    price: { minor: 1999, currency: "EUR" },
  };

  it("stores money as an integer count of the smallest unit", () => {
    expect(Number.isInteger(row.price.minor)).toBe(true);
    expect(row.price.currency).toBe("EUR");
  });

  it("tells an archived row from a live one", () => {
    expect(isArchived({ deleted_at: null })).toBe(false);
    expect(isArchived({ deleted_at: "2026-08-09T09:00:00.000Z" })).toBe(true);
    // ⚠️ Absent is not archived. A row that never carried the column is live,
    // and reading it as deleted would hide every row in a purging collection.
    expect(isArchived({})).toBe(false);
  });
});

/* -------------------------------------------------------------- commerce --- */

/**
 * THE TWO RAILS' COVERAGE, WHICH IS THE QUIETEST FAILURE A COMMERCIAL PRODUCT
 * HAS.
 *
 * A capability appears on a price list, the interface hides it from whoever did
 * not buy it, and no route withholds anything. Every test passes, because the
 * tests drive the interface. The only signal is that the cheap plan does the
 * expensive thing for anybody who asks for it directly — which is the first
 * thing an API consumer, an assistant or a curious customer does.
 */
/** Everything `assertComposable` reads that a given case is not about. */
const base = {
    id: "test",
    access: {
      permissions: [], roles: {}, plans: [] as PlanSpec[],
      entitlements: {} as Record<string, EntitlementDef>,
      customerRail: false, customerFlags: {} as Record<string, FlagDef>,
      seats: { counts: [] },
    },
  collections: [] as CollectionSpec[],
  notifications: {} as Record<string, NotificationDef>,
  operations: [] as never[],
};

describe("a sold capability is withheld by something", () => {
  it("refuses an entitlement declared as a gate that no operation names", () => {
    expect(() => assertComposable({
      ...base,
      access: { ...base.access, entitlements: { reports: { parked: false, enforcement: "gate" } } },
    })).toThrow(/reports/);
  });

  it("accepts it once an operation names it", () => {
    expect(() => assertComposable({
      ...base,
      access: { ...base.access, entitlements: { reports: { parked: false, enforcement: "gate" } } },
      operations: [{ ...stub, entitlement: "reports" }] as never,
    })).not.toThrow();
  });

  /*
    ⚠️ A COLLECTION COUNTS. An app whose whole surface is derived declares no
    operations at all, so a check reading `operations` alone would report full
    coverage over an empty list — and pass every app that writes no routing,
    which is the shape this platform exists to encourage.
  */
  it("accepts a quota a collection counts against", () => {
    expect(() => assertComposable({
      ...base,
      access: { ...base.access, entitlements: { stored: { parked: 5, enforcement: "quota" } } },
      collections: [{ ...stubCollection, quota: "stored" }] as never,
    })).not.toThrow();
  });

  it("refuses a quota nothing counts against, even where a gate names the key", () => {
    expect(() => assertComposable({
      ...base,
      access: { ...base.access, entitlements: { stored: { parked: 5, enforcement: "quota" } } },
      operations: [{ ...stub, entitlement: "stored" }] as never,
    })).toThrow(/stored/);
  });

  /*
    ⚠️ THE EXEMPTION CARRIES A REASON, not a boolean. A decision with no stated
    reason is indistinguishable from an oversight once its author has left.
  */
  it("accepts one declared unenforced, with a reason", () => {
    expect(() => assertComposable({
      ...base,
      access: { ...base.access, entitlements: { chat: { parked: false, enforcement: { unenforced: "nothing sells it yet" } } } },
    })).not.toThrow();
  });

  it("refuses a customer capability the interface hides and no route withholds", () => {
    expect(() => assertComposable({
      ...base,
      access: { ...base.access, customerRail: true, customerFlags: { bodyReport: { parked: false, enforcement: "shape" } } },
    })).toThrow(/bodyReport/);
    expect(() => assertComposable({
      ...base,
      access: { ...base.access, customerRail: true, customerFlags: { bodyReport: { parked: false, enforcement: "shape" } } },
      operations: [{ ...stub, shape: { body: "bodyReport" } }] as never,
    })).not.toThrow();
  });

  it("refuses customer capabilities on an app with no rail to resolve them", () => {
    expect(() => assertComposable({
      ...base,
      access: { ...base.access, customerFlags: { bodyReport: { parked: false, enforcement: { derived: "their own data" } } } },
    })).toThrow(/customerRail/);
  });

  /*
    ⚠️ NOT PAYING MUST NOT BUY MORE THAN PAYING. A shipping product's parking
    state carried three seats against its entry plan's one, so the entry plan
    was a downgrade.
  */
  it("refuses a parking state more generous than the cheapest plan", () => {
    expect(() => assertComposable({
      ...base,
      access: {
        ...base.access,
        entitlements: { seats: { parked: 5, enforcement: { unenforced: "not the point of this case" } } },
        plans: [{ id: "entry", name: "Entry", price: { minor: 499, currency: "USD" }, period: "month", trialDays: 0, entitlements: { seats: 1 } }],
      },
    })).toThrow(/not paying would buy more/);
  });

  it("holds the real manifest to all of it", () => {
    expect(coverage(kova)).toEqual([]);
  });
});

/* --------------------------------------------------------- notifications --- */

/**
 * ⚠️ AN OPERATION MAY ONLY RAISE SOMETHING SOMEBODY CAN RECEIVE.
 *
 * `emits` drives the webhook catalogue AND the inbox, so an undeclared event is
 * a subscription nobody can make and a notification with no copy, icon or
 * destination — which renders, if anything renders it at all, as an anonymous
 * bell that says nothing and goes nowhere.
 */
describe("what an app can tell somebody", () => {
  const told: NotificationDef = {
    category: "activity", tone: "info", icon: "bell",
    title: "{who} did a thing", link: { to: "inbox" }, roles: ["owner"],
  };

  it("refuses an operation raising an event no notification declares", () => {
    expect(() => assertComposable({
      ...base,
      operations: [{ ...stub, emits: ["thing.happened"] }] as never,
    })).toThrow(/thing\.happened/);
  });

  it("accepts it once the registry declares it", () => {
    expect(() => assertComposable({
      ...base,
      notifications: { "thing.happened": told },
      operations: [{ ...stub, emits: ["thing.happened"] }] as never,
    })).not.toThrow();
  });

  /*
    ⚠️ A LINK NAMES A DECLARED COLLECTION. Four types in a shipping product
    pointed at a path that was not a route, and one at a path whose route had
    been renamed; they were wrong for three stages because nothing rendered a
    notification, and an integration test was asserting the broken path.
  */
  it("refuses a link to a collection this app does not have", () => {
    expect(() => assertComposable({
      ...base,
      notifications: { "thing.happened": { ...told, link: { to: "row", collection: "ghost" } } },
    })).toThrow(/thing\.happened/);
  });

  it("accepts a link to one it does", () => {
    expect(() => assertComposable({
      ...base,
      notifications: { "thing.happened": { ...told, link: { to: "row", collection: "x" } } },
      collections: [stubCollection] as never,
    })).not.toThrow();
  });

  it("holds the real manifest to that too", () => {
    expect(undeclaredEmits(kova)).toEqual([]);
  });
});
