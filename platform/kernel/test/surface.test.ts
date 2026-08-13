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
  auditFor, check, laneOf, openApiFor, routeFor, shapeFor, subjectOf, toolNameFor, toolsFor, verbOf, webhookEventsFor,
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

  /*
    ⚠️ A PROOF IS NOT A PERMISSION, AND THE ORDER SAYS SO. Somebody who may not do
    a thing at all is told that, rather than sent to prove who they are for an
    answer that will not change; somebody who MAY do it meets the proof before any
    question about the workspace, because those are about the workspace and this is
    about them.

    ⚠️ AND THE THREAT IT ANSWERS PASSES EVERY OTHER CHECK. A borrowed laptop with
    an open tab holds a genuine cookie, a real permission and a workspace in good
    standing — so this is the only gate in the file that can refuse it.
  */
  it("asks for a recent proof where one is declared, after the permission", () => {
    const risky = { ...(publishPlan as never as AnyOperation), proof: "recent" as const };
    const stale = check(risky, full);
    expect(stale.allowed).toBe(false);
    if (!stale.allowed) expect(stale.refusal).toBe("proof");
    expect(check(risky, caller({ ...full, provenRecently: true })).allowed).toBe(true);

    /* ⚠️ AND SOMEBODY WHO MAY NOT DO IT AT ALL HEARS THAT INSTEAD. */
    const wrong = check(risky, caller({ ...full, permissions: new Set(), provenRecently: true }));
    if (!wrong.allowed) expect(wrong.refusal).toBe("permission");
  });

  /*
    ⚠️ ABSENT IS "NOT PROVEN", NEVER "NOT ASKED". A caller with no session — a
    webhook, a machine, a device — has proved nothing, and defaulting the other way
    would make every un-sessioned lane the one way past this gate.
  */
  it("treats a caller who cannot have proved anything as unproven", () => {
    const risky = { ...(publishPlan as never as AnyOperation), proof: "recent" as const };
    const v = check(risky, caller({ ...full }));
    expect(v.allowed).toBe(false);
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

/* ------------------------------------------------------------ audited --- */

describe("what is recorded", () => {
  const write = (over: Record<string, unknown> = {}) => ({
    id: "note.archive", kind: "write", summary: "Archive a note.",
    permission: "note:write", idempotency: { mode: "none" },
    ...over,
  } as never);

  /*
    ⚠️ EVERY WRITE, WHETHER OR NOT ITS AUTHOR THOUGHT OF IT. This returned `null`
    for anything declaring nothing, which made an audit trail a thing people
    remembered rather than a thing the platform did — and twenty of the
    platform's own writes were recorded nowhere while every suite stayed green,
    because a missing entry is indistinguishable from an action nobody took.
  */
  it("records a write that declared nothing", () => {
    expect(auditFor(write(), { id: "n_1" }, "http")).toEqual({
      operationId: "note.archive", subject: "n_1", verb: "archive", via: "http",
    });
  });

  /* ⚠️ A written one is better and wins. `subject: clientId, verb: "assign"`
     says more than an id split on a dot ever will. */
  it("prefers what the operation says about itself", () => {
    const said = write({ audit: () => ({ subject: "c_9", verb: "assign" }) });
    expect(auditFor(said, {}, "http")).toMatchObject({ subject: "c_9", verb: "assign" });
  });

  /*
    ⚠️ AND `{ why }` IS THE ONLY WAY OUT, in the same shape as `tool`. A handful
    of writes genuinely keep their own record; being silently absent is what
    this replaced.
  */
  it("takes a stated exemption and nothing else", () => {
    expect(auditFor(write({ audit: { why: "the session is the record" } }), {}, "http")).toBeNull();
  });

  /*
    ⚠️ READS ARE NOT RECORDED UNLESS THEY ASK. Every list, every poll and every
    screen load would be an entry, and an audit nobody can read is the same
    silence with a much larger bill.
  */
  it("leaves reads alone unless they ask", () => {
    expect(auditFor(write({ kind: "read" }), { id: "n_1" }, "http")).toBeNull();
    const asked = write({ kind: "read", audit: () => ({ subject: "n_1", verb: "open" }) });
    expect(auditFor(asked, {}, "http")).toMatchObject({ verb: "open" });
  });

  /* ⚠️ The subject comes from what the operation already says it acts on. */
  it("takes the subject from row scope before the input", () => {
    const scoped = write({ scope: () => ({ clientId: "c_2" }) });
    expect(subjectOf(scoped, { id: "n_1" })).toBe("c_2");
    expect(subjectOf(write(), { id: "n_1" })).toBe("n_1");
    expect(subjectOf(write(), {})).toBe("");
  });

  it("takes the verb from the id the operation is already named after", () => {
    expect(verbOf("commerce.package.save")).toBe("save");
    expect(verbOf("solo")).toBe("solo");
  });

  /* ⚠️ And which transport, because an action taken BY a model is worth telling
     apart from one a person took. */
  it("says which transport it came in on", () => {
    expect(auditFor(write(), {}, "tool")!.via).toBe("tool");
  });
});
