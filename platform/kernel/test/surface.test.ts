/**
 * THE SURFACE — and one property that matters more than the rest.
 *
 * Stage 2's exit criterion is that an assistant "is refused exactly what the
 * user would be". That is an EQUIVALENCE, so it is asserted as one: every
 * operation against every caller, comparing what the tool catalogue offers with
 * what the gate allows. Sampling a few cases would prove the cases sampled.
 */

import { describe, expect, it } from "vitest";
import {
  auditFor, check, laneOf, openApiFor, routeFor, shapeFor, toolNameFor, toolsFor, webhookEventsFor,
  type AnyOperation, type Caller,
} from "../src/surface.js";
import { gateFor } from "../src/standing.js";
import { applyPackageGrant, inviteStaff, publishPlan, readProgress } from "./proof.kova.js";

const OPS: readonly AnyOperation[] = [readProgress, publishPlan, applyPackageGrant, inviteStaff] as unknown as AnyOperation[];

const caller = (over: Partial<Caller> = {}): Caller => ({
  permissions: new Set<string>(),
  entitlements: {},
  customerFlags: new Set<string>(),
  gate: gateFor({ standing: "active", reason: "ok" }),
  ...over,
});

const full = caller({
  permissions: new Set(["client:read", "plan:publish", "commerce:grant"]),
  entitlements: { trainingPlans: true, customerPackages: true, seats: 3 },
  customerFlags: new Set(["trainingPlans", "bodyReport"]),
});

/* ------------------------------------------------------------------ route --- */

describe("routes are derived from the operation id", () => {
  it("makes a read a GET and a write a POST", () => {
    expect(routeFor(readProgress as never)).toEqual({ method: "GET", path: "/api/coaching.progress.read", operationId: "coaching.progress.read" });
    expect(routeFor(publishPlan as never).method).toBe("POST");
  });

  it("gives every operation a distinct path", () => {
    const paths = OPS.map((o) => `${routeFor(o).method} ${routeFor(o).path}`);
    expect(new Set(paths).size).toBe(OPS.length);
  });
});

/* ------------------------------------------------------------------- gate --- */

describe("the gates, in order", () => {
  it("allows a fully-entitled caller", () => {
    expect(check(publishPlan as never, full).allowed).toBe(true);
  });

  /*
    The order is not only about cost. Somebody refused by standing must be told
    the workspace is read-only, not that they lack a permission they hold.
  */
  it("reports standing before permission", () => {
    const readOnly = caller({ ...full, gate: gateFor({ standing: "read_only", reason: "arrears" }) });
    const v = check(publishPlan as never, readOnly);
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.refusal).toBe("standing");
  });

  it("never gates a READ on standing, at any rung", () => {
    for (const standing of ["read_only", "blocked", "closing"] as const) {
      const c = caller({ ...full, gate: gateFor({ standing, reason: "arrears" }) });
      expect(check(readProgress as never, c).allowed, standing).toBe(true);
    }
  });

  /*
    ⚠️ AN ENTITLEMENT IS A VALUE, NOT A KEY. Half of what a plan sells is a
    number, and a gate holding only the names can answer "is this included" but
    never "is there room" — so a caller carrying `reports: false` must be refused
    exactly as one carrying nothing is. A set-shaped caller cannot express the
    difference, which is why this asserts the falsey value specifically.
  */
  it("refuses an entitlement the caller holds at a value worth nothing", () => {
    for (const value of [false, 0] as const) {
      const v = check(publishPlan as never, caller({ ...full, entitlements: { ...full.entitlements, trainingPlans: value } }));
      expect(v.allowed, `value ${String(value)}`).toBe(false);
      if (!v.allowed) expect(v.refusal).toBe("entitlement");
    }
  });

  /*
    ⚠️ A CEILING OF ZERO IS REFUSED BY THE PURE GATE, not deferred to a count.
    Nothing fits under it, so the query cannot change the verdict — and a tool
    catalogue filtered without one would still offer the operation, which is a
    promise its first call breaks.
  */
  it("refuses a full ceiling without needing a count, and keeps it out of the tools", () => {
    const noRoom = caller({ ...full, permissions: new Set([...full.permissions, "staff:invite"]), entitlements: { ...full.entitlements, seats: 0 } });
    const v = check(inviteStaff as never, noRoom);
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.refusal).toBe("quota");
    expect(toolsFor([inviteStaff as never], noRoom).map((t) => t.name)).toEqual([]);
  });

  it("reports the ceiling as an obligation when there IS room, rather than passing it", () => {
    const room = caller({ ...full, permissions: new Set([...full.permissions, "staff:invite"]), entitlements: { ...full.entitlements, seats: 3 } });
    const v = check(inviteStaff as never, room);
    expect(v.allowed).toBe(true);
    if (v.allowed) expect(v.quotaRequired).toEqual({ key: "seats", allowance: 3 });
  });

  it("distinguishes the three commerce questions", () => {
    // What the STAFF may do, what the STUDIO bought, what the CLIENT bought.
    const noPerm = caller({ ...full, permissions: new Set(["client:read"]) });
    const noEnt = caller({ ...full, entitlements: {} });
    const noFlag = caller({ ...full, customerFlags: new Set() });
    for (const [c, expected] of [[noPerm, "permission"], [noEnt, "entitlement"], [noFlag, "customer_flag"]] as const) {
      const v = check(publishPlan as never, c);
      expect(v.allowed).toBe(false);
      if (!v.allowed) expect(v.refusal).toBe(expected);
    }
  });

  /*
    ⚠️ Row scope needs a database read, so a pure gate cannot perform it — which
    is exactly why it is REPORTED rather than skipped. A gate that silently
    dropped it would be the worst failure in the module.
  */
  it("reports row scope as an obligation rather than performing it", () => {
    const v = check(publishPlan as never, full);
    expect(v.allowed && v.scopeRequired).toBe(true);
  });
});

/* ------------------------------------------------------------------ shape --- */

describe("shaping, not refusing", () => {
  it("includes the lenses the customer bought and excludes the rest", () => {
    // The package includes the body report and not the other two.
    expect(shapeFor(readProgress as never, full)).toEqual({ body: true, training: false, nutrition: false });
  });

  it("still ALLOWS the read when every shaped lens is excluded", () => {
    // Refusing would take the ungated wellness and consistency lenses down too.
    const none = caller({ permissions: new Set(["client:read"]) });
    const v = check(readProgress as never, none);
    expect(v.allowed).toBe(true);
    if (v.allowed) expect(Object.values(v.included).every((x) => x === false)).toBe(true);
  });

  it("reports every shaped key, so withheld and empty are distinguishable", () => {
    const v = check(readProgress as never, full);
    expect(v.allowed && Object.keys(v.included).sort()).toEqual(["body", "nutrition", "training"]);
  });
});

/* ------------------------------------------------------------------- tool --- */

describe("the tool surface is the route surface, masked", () => {
  it("names a tool without dots, which most providers reject", () => {
    expect(toolNameFor(publishPlan as never)).toBe("training_plan_publish");
  });

  /*
    ⚠️ THE EXIT CRITERION FOR THIS STAGE, ASSERTED AS AN EQUIVALENCE.

    For every operation and every caller: the tool catalogue offers it if and
    only if the gate allows it. One filter over one set of declarations, so the
    assistant's reach IS the caller's reach — not by discipline, by construction.

    Sampling would prove the samples. This is exhaustive over the cross-product.
  */
  it("offers exactly what the gate allows, for every caller", () => {
    const callers: [string, Caller][] = [
      ["nothing", caller()],
      ["read only", caller({ permissions: new Set(["client:read"]) })],
      ["full", full],
      ["no entitlement", caller({ ...full, entitlements: {} })],
      ["no customer flag", caller({ ...full, customerFlags: new Set() })],
      ["workspace read-only", caller({ ...full, gate: gateFor({ standing: "read_only", reason: "arrears" }) })],
      ["workspace blocked", caller({ ...full, gate: gateFor({ standing: "blocked", reason: "arrears" }) })],
    ];

    for (const [label, c] of callers) {
      const offered = new Set(toolsFor(OPS, c).map((t) => t.operationId));
      const allowed = new Set(OPS.filter((op) => check(op, c).allowed && op.tool !== false).map((op) => op.id));
      expect(offered, `${label}: the assistant's reach must equal the caller's`).toEqual(allowed);
    }
  });

  /*
    ⚠️ Exposure is opt-OUT. An opt-in list is one somebody forgets to extend, and
    the symptom is an assistant that mysteriously cannot do what the person can.
  */
  it("exposes by default and hides only with a stated reason", () => {
    const offered = toolsFor(OPS, full).map((t) => t.operationId);
    expect(offered).toContain("training.plan.publish");
    // Granting paid access on a payment provider's say-so is not something a
    // language model should reach, and the declaration says so.
    expect(offered).not.toContain("commerce.package.grant");
    expect(applyPackageGrant.tool).toBe(false);
  });

  it("never offers a write to a workspace that is read-only", () => {
    const readOnly = caller({ ...full, gate: gateFor({ standing: "read_only", reason: "arrears" }) });
    expect(toolsFor(OPS, readOnly).every((t) => !t.mutates)).toBe(true);
  });
});

/* --------------------------------------------------------- webhook + audit --- */

describe("webhooks and audit fall out of the same declaration", () => {
  it("derives the subscribable events from what operations emit", () => {
    expect(webhookEventsFor(OPS).map((e) => e.event).sort()).toEqual(["package.granted", "plan.published", "staff.invited"]);
  });

  it("does not emit an event twice when two operations raise it", () => {
    const twice = [...OPS, { ...publishPlan, id: "other.op" } as unknown as AnyOperation];
    expect(webhookEventsFor(twice).filter((e) => e.event === "plan.published")).toHaveLength(1);
  });

  it("records which transport an action came through", () => {
    // An action taken BY an assistant is worth telling apart from one a person
    // took, and it costs one field to be able to.
    const viaTool = auditFor(publishPlan as never, { planId: "p_1", clientId: "c_1" }, "tool");
    expect(viaTool).toEqual({ operationId: "training.plan.publish", subject: "p_1", verb: "publish", via: "tool" });
  });

  it("records nothing for an operation that declares no audit", () => {
    expect(auditFor(readProgress as never, { clientId: "c_1" }, "http")).toBeNull();
  });
});

/* ---------------------------------------------------------------- openapi --- */

describe("the API document is derived, never written", () => {
  it("describes every operation and no others", () => {
    const doc = openApiFor(OPS, { "platform.not_found": 404, "plans.not_publishable": 409, "platform.conflict": 409 });
    expect(doc.map((p) => p.operationId).sort()).toEqual(OPS.map((o) => o.id).sort());
  });

  it("carries the declared failures, so a client knows what it may have to render", () => {
    const doc = openApiFor(OPS, { "plans.not_publishable": 409, "coaching.client_not_assigned": 403 });
    const publish = doc.find((p) => p.operationId === "training.plan.publish");
    expect(publish?.responses).toEqual([200, 403, 409]);
  });
});

describe("lanes", () => {
  it("takes the standing lane from the id's first segment", () => {
    expect(laneOf(publishPlan as never)).toBe("training");
    expect(laneOf(applyPackageGrant as never)).toBe("commerce");
  });
});
