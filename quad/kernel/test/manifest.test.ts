/**
 * THE MANIFEST REFUSALS — every one of which catches something that would
 * otherwise boot fine, serve fine, and be wrong.
 *
 * ⚠️ THAT IS THE STANDARD FOR BEING IN HERE. A mistake the compiler catches does
 * not need a refusal; a mistake that throws on the first request does not
 * either. What these prove is the class that passes every test: a permission no
 * role can hold, an entitlement nothing enforces, a quota nothing counts.
 */

import { describe, expect, it } from "vitest";
import { defineApp, refuseApp, surfaceOf, type AppSpec } from "../src/manifest.js";
import { collection } from "../src/collection.js";
import { field } from "../src/field.js";
import { operation, PUBLIC, type AnyOperation } from "../src/operation.js";

const note = collection({
  id: "note",
  label: { one: "Note", many: "Notes" },
  scope: { of: "tenant" },
  permission: "note",
  retention: null,
  onClose: { then: "purge" },
  fields: { title: field.text({ label: "Title", required: true, holds: "none", max: 200 }) },
});

const stub = operation({
  id: "note.publish",
  kind: "write",
  summary: "Publish one.",
  input: { id: field.text({ label: "Id", required: true, holds: "none" }) },
  output: { id: field.text({ label: "Id", holds: "none" }) },
  permission: "note:write",
  idempotency: { mode: "none" },
  async handler() { return { id: "n1" }; },
}) as unknown as AnyOperation;

/** Everything an app needs that is not what a given test is about. */
const app = (over: Partial<AppSpec> = {}): AppSpec => ({
  id: "probe",
  name: "Probe",
  mark: "◆",
  access: {
    permissions: ["note:read", "note:write", "member:read", "member:manage", "tenant:create"],
    roles: { owner: ["note:read", "note:write", "member:read", "member:manage"] },
    personal: ["tenant:create"],
    seats: { counts: ["owner"], entitlement: "seats" },
  },
  entitlements: {
    seats: { label: "Seats", withheld: "quota" },
    notes: { label: "Notes", withheld: "quota" },
  },
  plans: [
    { id: "free", name: "Free", said: "For a look", price: 0, currency: "EUR", order: 0, parking: true,
      includes: { seats: 1, notes: 10 } },
    { id: "paid", name: "Paid", said: "For work", price: 900, currency: "EUR", order: 1,
      includes: { seats: 5, notes: 500 } },
  ],
  collections: [{ ...note, quota: "notes" }],
  operations: [stub],
  screens: [{ id: "notes", route: "/notes", label: "Notes", nav: "primary", permission: "note:read" }],
  ...over,
});

const whyOf = (spec: AppSpec) => refuseApp(spec).map((r) => r.why).join(" | ");

describe("an app that composes", () => {
  it("accepts one where everything sold is enforced and everything declared is reachable", () => {
    expect(refuseApp(app())).toEqual([]);
    expect(() => defineApp(app())).not.toThrow();
  });

  /* ⚠️ Every refusal at once. Stopping at the first turns fixing a manifest into
     a conversation of one sentence at a time. */
  it("reports every fault in one pass", () => {
    const broken = app({
      /* Three unrelated faults: an unholdable key, no catalogue at all, and a
         screen asking for a permission nothing declares. */
      access: { ...app().access, permissions: [...app().access.permissions, "ghost:read"] },
      plans: [],
      screens: [{ id: "x", route: "/x", label: "X", permission: "phantom:read" }],
    });
    const why = refuseApp(broken).map((r) => r.why);
    expect(why.some((w) => w.includes("ghost:read"))).toBe(true);
    expect(why.some((w) => w.includes("never chose"))).toBe(true);
    expect(why.some((w) => w.includes("phantom:read"))).toBe(true);
  });
});

/* ------------------------------------------------------- nobody can reach --- */

describe("what nobody could ever reach", () => {
  /*
    ⚠️ A DECLARED KEY NO ROLE HOLDS REFUSES EVERY CALLER, FOR EVER — the owner
    included — and the 403 is indistinguishable from one somebody forgot to
    grant. It reads exactly like a feature nobody uses.
  */
  it("refuses a permission no role and no personal set can hold", () => {
    const broken = app({ access: { ...app().access, permissions: [...app().access.permissions, "ghost:read"] } });
    expect(whyOf(broken)).toContain("no role or personal set holds it");
  });

  /* ⚠️ And the mirror: a role holding a key nothing declares grants nothing, and
     looks from both sides like access somebody has. */
  it("refuses a role that holds a key nothing declares", () => {
    const broken = app({
      access: { ...app().access, roles: { owner: [...app().access.roles.owner!, "ghost:write"] } },
    });
    expect(whyOf(broken)).toContain("not a declared permission");
  });

  it("refuses an operation whose permission nothing holds", () => {
    const broken = app({
      operations: [{ ...stub, permission: "ghost:write" } as AnyOperation],
    });
    expect(whyOf(broken)).toContain("ghost:write");
  });

  /*
    ⚠️ SOMEBODY MUST BE ABLE TO ADMINISTER A NEW TENANT. With no role that can
    manage members there is no founding membership — every request 403s while the
    tenant row, the tables and the session are all perfectly correct.
  */
  it("refuses an app where no role can run a workspace", () => {
    const broken = app({
      access: {
        permissions: ["note:read", "tenant:create"],
        roles: { reader: ["note:read"] },
        personal: ["tenant:create"],
        seats: { counts: [], entitlement: "seats" },
      },
      collections: [note],
      operations: [],
      entitlements: { seats: { label: "Seats", withheld: "quota", reserved: true } },
      plans: [{ id: "free", name: "Free", said: "", price: 0, currency: "EUR", order: 0, parking: true, includes: {} }],
      screens: [],
    });
    expect(whyOf(broken)).toContain("nobody who can run it");
  });

  /* ⚠️ PUBLIC means "the session decides" and is not a hole — it is how the
     operations about yourself are declared, and they are reachable by design. */
  it("accepts PUBLIC without demanding a role for it", () => {
    const ok = app({ operations: [{ ...stub, permission: PUBLIC } as AnyOperation] });
    expect(refuseApp(ok)).toEqual([]);
  });
});

/* ---------------------------------------------------------- sold and kept --- */

describe("what is sold and what is kept", () => {
  /*
    ⚠️ AN ENTITLEMENT NOTHING WITHHOLDS FAILS IN THE GENEROUS DIRECTION: the
    customer gets it anyway, so nobody reports it and nothing goes red. It is
    money taken for a promise nothing keeps.
  */
  it("refuses an entitlement no gate and no quota names", () => {
    const broken = app({
      entitlements: { ...app().entitlements, exports: { label: "Exports", withheld: "gate" } },
      plans: app().plans.map((p) => ({ ...p, includes: { ...p.includes, exports: true } })),
    });
    expect(whyOf(broken)).toContain("nothing withholds it");
  });

  /* ⚠️ `reserved` is the one exemption, and it is written down rather than
     inferred from a plan happening not to mention the key. */
  it("lets a reserved key be sold by nobody and checked by nothing", () => {
    const ok = app({
      entitlements: { ...app().entitlements, chat: { label: "Chat", withheld: "gate", reserved: true } },
    });
    expect(refuseApp(ok)).toEqual([]);
  });

  /*
    ⚠️ NOT PAYING MUST NOT BUY MORE THAN PAYING. A previous platform shipped a
    parking plan carrying three of something its cheapest paid tier gave one of.
  */
  it("refuses a parking plan more generous than the cheapest paid one", () => {
    const broken = app({
      plans: [
        { id: "free", name: "Free", said: "", price: 0, currency: "EUR", order: 0, parking: true, includes: { seats: 9, notes: 10 } },
        { id: "paid", name: "Paid", said: "", price: 900, currency: "EUR", order: 1, includes: { seats: 5, notes: 500 } },
      ],
    });
    expect(whyOf(broken)).toContain("not paying gives more");
  });

  it("refuses a catalogue with nowhere for a tenant that never chose", () => {
    const broken = app({ plans: app().plans.map((p) => ({ ...p, parking: false })) });
    expect(whyOf(broken)).toContain("never chose");
  });

  /* ⚠️ A quota naming no entitlement is a ceiling nothing counts — it reports the
     obligation on every write and discharges it as "fine". */
  it("refuses a collection counting against a key no plan sells", () => {
    const broken = app({ collections: [{ ...note, quota: "ghosts" }] });
    expect(whyOf(broken)).toContain("which no plan sells");
  });
});

/* -------------------------------------------------------------- the shape --- */

describe("what would fail on the first request", () => {
  it("refuses a reference pointing at no collection", () => {
    const broken = app({
      collections: [{ ...note, quota: "notes", fields: {
        ...note.fields,
        parent: field.ref({ label: "Parent", to: "ghost", holds: "none" }),
      } }],
    });
    expect(whyOf(broken)).toContain("points at no collection");
  });

  it("refuses a failure code no catalogue has", () => {
    const broken = app({ operations: [{ ...stub, fails: ["app.imagined"] } as AnyOperation] });
    expect(whyOf(broken)).toContain("which no catalogue has");
  });

  /* ⚠️ A product that could reword "payment required" could describe its own
     arrears as something reassuring, to staff who would then not act on it. */
  it("refuses an app rewording a platform refusal", () => {
    const broken = app({
      problems: { "platform.forbidden": { status: 403, title: "All good", retryable: false, tone: "success" } },
    });
    expect(whyOf(broken)).toContain("may not reword it");
  });

  /* ⚠️ Past five, a bottom bar stops being tappable and becomes a menu (D10). */
  it("refuses a sixth primary destination", () => {
    const six = Array.from({ length: 6 }, (_, i) => ({
      id: `s${i}`, route: `/s${i}`, label: `S${i}`, nav: "primary" as const, permission: "note:read",
    }));
    expect(whyOf(app({ screens: six }))).toContain("the ceiling is 5");
  });

  it("refuses a screen needing a permission nothing declares", () => {
    const broken = app({
      screens: [{ id: "x", route: "/x", label: "X", permission: "ghost:read" }],
    });
    expect(whyOf(broken)).toContain("not a declared permission");
  });
});

/* ------------------------------------------------- what nothing reaches --- */

describe("a declaration that reaches no surface", () => {
  const told = {
    "note.shared": {
      id: "note.shared", label: "Shared", summary: "Somebody shared a note.",
      category: "activity" as const, author: "theirs" as const, tone: "info" as const, icon: "share",
      needs: "note:read", on: "note.shared", link: "/notes",
      variables: [], channels: ["inbox" as const, "email" as const],
    },
  };
  const emits = [{ ...stub, emits: ["note.shared"] } as AnyOperation];

  it("accepts a notification whose audience holds a key and whose event is raised", () => {
    expect(refuseApp(app({ notifications: told, operations: emits }))).toEqual([]);
  });

  /*
    ⚠️ A NOTIFICATION NOTHING RAISES RENDERS IN THE POLICY SCREEN, IS SWITCHED ON,
    AND NEVER ARRIVES. The person concludes the product is broken and stops
    trusting the notifications that do work.
  */
  it("refuses a notification waiting for an event nothing raises", () => {
    expect(whyOf(app({ notifications: told }))).toContain("can never arrive");
  });

  /* ⚠️ Addressed to a key nothing declares, its audience is empty on every
     dispatch — and the dispatch reports success. */
  it("refuses a notification addressed to a permission nothing declares", () => {
    const wrong = { x: { ...told["note.shared"], needs: "ghost:read" } };
    expect(whyOf(app({ notifications: wrong, operations: emits }))).toContain("audience is always empty");
  });

  it("refuses a notification pointing at a screen that does not exist", () => {
    const wrong = { x: { ...told["note.shared"], link: "/ghosts" } };
    expect(whyOf(app({ notifications: wrong, operations: emits }))).toContain("not a screen");
  });

  /*
    ⚠️ A FLAG NOTHING IS BEHIND IS A SWITCH THAT DOES NOTHING — worse than an
    absent feature, because somebody turns it on and stops watching for the
    problem it claimed to solve.
  */
  it("refuses a flag no operation and no screen is behind", () => {
    const flags = { "new-thing": { id: "new-thing", label: "New", why: "Trying it.",
      stage: "on" as const, fallback: false, setBy: "operator" as const } };
    expect(whyOf(app({ flags }))).toContain("switching it changes nothing");
    expect(refuseApp(app({
      flags,
      operations: [{ ...stub, flag: "new-thing" } as AnyOperation],
    }))).toEqual([]);
  });

  it("refuses an operation behind a flag nothing declares", () => {
    expect(whyOf(app({ operations: [{ ...stub, flag: "ghost" } as AnyOperation] })))
      .toContain("is read and nothing declares it");
  });

  /*
    ⚠️ A VAULT-BACKED COLUMN HOLDS A POINTER. With no vault field behind it the
    pointer points at nothing — and it renders as a value somebody never filled
    in, which is indistinguishable from a fact they declined to give.
  */
  it("refuses a vault-backed field with nothing in the vault behind it", () => {
    const broken = app({
      collections: [{ ...note, quota: "notes", fields: {
        ...note.fields,
        conditions: field.text({ label: "Conditions", holds: "sensitive", vault: true }),
      } }],
    });
    expect(whyOf(broken)).toContain("the column would point at nothing");
  });

  /* ⚠️ And the mirror: a key gated by a route that no plan sells is a gate
     nobody can ever pass, which reads as a feature that is simply broken. */
  it("refuses an entitlement that is enforced and never sold", () => {
    expect(whyOf(app({ operations: [{ ...stub, entitlement: "ghosts" } as AnyOperation] })))
      .toContain("is enforced and nothing sells it");
  });
});

/* ---------------------------------------------------------------- surface --- */

describe("what an app answers on", () => {
  /* ⚠️ Derived, never registered. A surface assembled by hand is one where an
     operation exists and no route reaches it. */
  it("derives every route from the declarations alone", () => {
    expect(surfaceOf(app())).toEqual([
      "note.create", "note.delete", "note.list", "note.publish", "note.read", "note.update",
    ]);
  });

  /*
    ⚠️ `without` IS AN OPT-OUT, AND THE DIRECTION IS THE SAFETY. Opting in means
    a collection whose author forgot `delete` has no way to remove a record —
    discovered by a customer. Opting out is deliberate and visible in review.
  */
  it("drops only the verbs a collection opts out of", () => {
    const roster = app({ collections: [{ ...note, quota: "notes", without: ["create"] }] });
    expect(surfaceOf(roster)).not.toContain("note.create");
    expect(surfaceOf(roster)).toContain("note.update");
  });
});
