/**
 * THE GATE ORDER, WHICH IS A DESIGN RATHER THAN A SEQUENCE.
 *
 * ⚠️ EVERY ONE OF THESE ASSERTS WHICH SENTENCE SOMEBODY IS SHOWN FIRST, and each
 * wrong order is a real product failure: a workspace in arrears told it lacks a
 * role, somebody sent a confirmation code for something they may not do, a
 * customer told to upgrade for a feature we switched off, or a refusal that
 * spent credits on its way to saying no.
 */

import { describe, expect, it } from "vitest";
import { check, blockedBy, PROOF_WINDOW_MS, type Ask } from "../src/gate.js";
import type { Standing } from "../src/tenancy.js";
import { field } from "../src/field.js";
import { operation, PUBLIC, type AnyOperation } from "../src/operation.js";
import { PLATFORM_PROBLEMS } from "../src/problem.js";
import type { Resolved } from "../src/entitlement.js";

const NOW = "2026-08-14T12:00:00.000Z";

const op = (over: Partial<AnyOperation> = {}): AnyOperation => ({
  ...(operation({
    id: "note.create",
    kind: "write",
    summary: "Make one.",
    input: { id: field.text({ label: "Id", holds: "none" }) },
    output: {},
    permission: "note:write",
    idempotency: { mode: "none" },
    async handler() { return {}; },
  }) as unknown as AnyOperation),
  ...over,
});

const has = (...keys: string[]) => new Set(keys);

const ask = (over: Partial<Ask> = {}): Ask => ({
  op: op(),
  caller: { signedIn: true, permissions: has("note:write"), provenAt: NOW },
  standing: { writable: true, serving: true, reason: "" },
  entitlements: [] as readonly Resolved[],
  flags: {},
  used: () => 0,
  ledger: { balance: 100 },
  now: NOW,
  catalog: PLATFORM_PROBLEMS,
  ...over,
});

const held = (key: string, value: number | boolean): Resolved[] =>
  [{ key, value, source: "plan", plan: value }];

describe("what passes", () => {
  it("lets an ordinary write through", () => {
    expect(check(ask())).toBe(null);
  });
});

/* --------------------------------------------------------------- standing --- */

describe("a workspace that owes money", () => {
  const arrears: Standing = { writable: false, serving: true, reason: "There is an invoice outstanding." };

  /*
    ⚠️ STANDING IS FIRST SO NOBODY IS TOLD THE WRONG STORY. A tenant in arrears
    asked about roles gets a conversation about permissions when the thing they
    need to do is pay — and support then spends an hour on the wrong problem.
  */
  it("is told about the bill rather than about its roles", () => {
    const out = check(ask({
      standing: arrears,
      caller: { signedIn: true, permissions: has(), provenAt: NOW },
    }));
    expect(out?.at).toBe("standing");
    expect(out?.problem.code).toBe("platform.read_only");
    expect(out?.problem.detail).toContain("invoice");
  });

  /*
    ⚠️ AND READS ARE NEVER GATED, AT ANY RUNG. Withholding a business's own
    records over an unpaid invoice is holding their data hostage; what arrears
    take away is the ability to change things.
  */
  it("can still read everything it has", () => {
    expect(check(ask({ standing: arrears, op: op({ kind: "read", permission: "note:read" }),
      caller: { signedIn: true, permissions: has("note:read"), provenAt: NOW } }))).toBe(null);
  });
});

/* ------------------------------------------------------------- permission --- */

/* ------------------------------------------------------------------ kind --- */

/**
 * ⚠️ NO PLAN A PERSONAL WORKSPACE CAN BUY UNLOCKS A COMMERCIAL-ONLY CAPABILITY,
 * which is the whole reason this is not an entitlement. Every failure here is a
 * customer sent to a price list where nothing they can buy would help, or — the
 * other direction — a business capability handed to somebody who never became a
 * business, silently, on a deployment where nothing looks wrong.
 */
describe("what kind of workspace this is", () => {
  const only = op({ commercial: true });

  it("lets a business through and refuses a personal workspace by name", () => {
    expect(check(ask({ op: only, kind: "commercial" }))).toBe(null);

    const no = check(ask({ op: only, kind: "personal", workspace: "Northwind" }));
    expect(no?.at).toBe("kind");
    expect(no?.problem.code).toBe("platform.commercial_required");
    /* ⚠️ The name is IN the sentence, and a refusal missing its values renders
       the token — which is what "Make {workspace} a business" would print. */
    expect(no?.problem.detail).toContain("Northwind");
    expect(no?.problem.detail).not.toContain("{");
  });

  /* ⚠️ ABSENT IS NOT PERMISSIVE. The operations about yourself run outside every
     workspace, and treating the missing answer as a pass is how a gate stops
     gating on exactly the lane nobody tested. */
  it("refuses when there is no workspace to be a business", () => {
    expect(check(ask({ op: only }))?.at).toBe("kind");
  });

  it("leaves an ordinary operation alone in either kind", () => {
    expect(check(ask({ kind: "personal" }))).toBe(null);
    expect(check(ask({ kind: "commercial" }))).toBe(null);
  });

  /*
    ⚠️ ABOVE ENTITLEMENT, AND THIS IS THE ASSERTION THAT MAKES THE ORDER REAL.
    Reversed, a personal workspace is told to change its plan for something no
    plan will ever give it — the same defect as offering to sell what we have
    switched off, one gate over.
  */
  it("is asked before the plan, so nobody is offered an upgrade that cannot help", () => {
    const both = op({ commercial: true, entitlement: "publishing" });
    const no = check(ask({ op: both, kind: "personal", entitlements: held("publishing", false) }));
    expect(no?.at).toBe("kind");
  });

  /* ⚠️ And below permission, for the same reason proof is: a refusal about the
     workspace tells somebody it exists, and somebody with no key should be told
     nothing about it. */
  it("is asked after the key, so a stranger learns nothing about the workspace", () => {
    const no = check(ask({
      op: only, kind: "personal",
      caller: { signedIn: true, permissions: has(), provenAt: NOW },
    }));
    expect(no?.at).toBe("permission");
  });

  /* ⚠️ And after standing, because a workspace in arrears is having a
     conversation about its bill rather than about what it is. */
  it("is asked after standing, so arrears is still the first thing said", () => {
    const no = check(ask({
      op: only, kind: "personal",
      standing: { writable: false, serving: true, reason: "an invoice" },
    }));
    expect(no?.at).toBe("standing");
  });
});

describe("who is asking", () => {
  it("asks somebody signed out to sign in, before anything else", () => {
    const out = check(ask({ caller: { signedIn: false, permissions: has(), provenAt: null } }));
    expect(out?.problem.code).toBe("platform.unauthorized");
  });

  it("refuses a key the caller does not hold", () => {
    const out = check(ask({ caller: { signedIn: true, permissions: has("note:read"), provenAt: NOW } }));
    expect(out?.at).toBe("permission");
  });

  /* ⚠️ PUBLIC is "the session decides" — how the operations about yourself are
     declared — and it is not a hole: being signed in is still required. */
  it("lets a signed-in caller through a PUBLIC operation with no keys at all", () => {
    expect(check(ask({ op: op({ permission: PUBLIC }),
      caller: { signedIn: true, permissions: has(), provenAt: NOW } }))).toBe(null);
    expect(check(ask({ op: op({ permission: PUBLIC }),
      caller: { signedIn: false, permissions: has(), provenAt: null } }))?.at).toBe("permission");
  });
});

/* ------------------------------------------------------------------ proof --- */

describe("confirming it is you", () => {
  /*
    ⚠️ PERMISSION BEFORE PROOF. Sending somebody a code to confirm an action they
    are not allowed to take is a code sent for nothing — and it teaches people to
    type codes for requests that were always going to fail.
  */
  it("refuses on the permission before it asks anybody to prove anything", () => {
    const out = check(ask({
      op: op({ proof: "recent" }),
      caller: { signedIn: true, permissions: has(), provenAt: null },
    }));
    expect(out?.at).toBe("permission");
  });

  it("asks for a code where nothing was proved", () => {
    const out = check(ask({ op: op({ proof: "recent" }),
      caller: { signedIn: true, permissions: has("note:write"), provenAt: null } }));
    expect(out?.problem.code).toBe("platform.proof_required");
  });

  /* ⚠️ A proof expires. One that lasted for ever would make a borrowed laptop
     with an open tab permanently trusted, which is the threat it exists for. */
  it("stops trusting a proof that has aged out", () => {
    const stale = new Date(Date.parse(NOW) - PROOF_WINDOW_MS - 1000).toISOString();
    expect(check(ask({ op: op({ proof: "recent" }),
      caller: { signedIn: true, permissions: has("note:write"), provenAt: stale } }))?.at).toBe("proof");
    const fresh = new Date(Date.parse(NOW) - 1000).toISOString();
    expect(check(ask({ op: op({ proof: "recent" }),
      caller: { signedIn: true, permissions: has("note:write"), provenAt: fresh } }))).toBe(null);
  });
});

/* ----------------------------------------------------- entitlement, flag --- */

describe("what was bought and what we switched on", () => {
  /*
    ⚠️ "YOUR PLAN DOES NOT INCLUDE THIS" AND "YOU HAVE USED ALL OF YOURS" ARE
    DIFFERENT SENTENCES WITH DIFFERENT BUTTONS. Showing the second for the first
    sends somebody to free up room they never had.
  */
  it("says the plan does not include it before it says it is used up", () => {
    const out = check(ask({
      op: op({ entitlement: "exports", quota: "exports" }),
      entitlements: held("exports", false),
      used: () => 99,
    }));
    expect(out?.at).toBe("entitlement");
    expect(out?.problem.code).toBe("platform.payment_required");
  });

  /*
    ⚠️ A FLAG IS OURS AND AN ENTITLEMENT IS THEIRS, which is why an unset flag
    answers `not_found`. Telling a customer to upgrade for something we have
    turned off is selling something that does not exist.
  */
  it("hides what we have switched off rather than offering to sell it", () => {
    const out = check(ask({
      op: op({ entitlement: "exports", flag: "exports" }),
      entitlements: held("exports", true),
      flags: { exports: false },
    }));
    expect(out?.at).toBe("flag");
    expect(out?.problem.code).toBe("platform.not_found");
  });
});

/* ------------------------------------------------------------------ quota --- */

describe("a ceiling", () => {
  /* ⚠️ BOTH NUMBERS, ALWAYS. Raised without them this renders "your plan
     includes undefined, and undefined are in use". */
  it("says what the plan includes and how many are in use", () => {
    const out = check(ask({ op: op({ quota: "notes" }), entitlements: held("notes", 5), used: () => 5 }));
    expect(out?.at).toBe("quota");
    expect(out?.problem.title).toContain("5");
    expect(out?.problem.title).not.toContain("undefined");
  });

  /* ⚠️ `-1` is unlimited and `0` is none. Conflating them makes an unlimited
     plan refuse the first write. */
  it("never refuses an unlimited allowance", () => {
    expect(check(ask({ op: op({ quota: "notes" }), entitlements: held("notes", -1), used: () => 10_000 })))
      .toBe(null);
    expect(check(ask({ op: op({ quota: "notes" }), entitlements: held("notes", 0), used: () => 0 }))?.at)
      .toBe("quota");
  });
});

/* ---------------------------------------------------------------- credits --- */

describe("what a call costs", () => {
  /*
    ⚠️ CREDITS ARE LAST BECAUSE THEY ARE THE ONLY GATE THAT TAKES SOMETHING. A
    refusal that spends nothing on its way to saying no is always better than one
    that does — and every gate above this one refuses for free.
  */
  it("is checked after everything that could refuse for free", () => {
    const out = check(ask({
      op: op({ credits: 50, quota: "notes" }),
      entitlements: held("notes", 1),
      used: () => 1,
      ledger: { balance: 0 },
    }));
    expect(out?.at).toBe("quota");
  });

  it("says what it costs and what is left", () => {
    const out = check(ask({ op: op({ credits: 50 }), ledger: { balance: 10 } }));
    expect(out?.at).toBe("credits");
    expect(out?.problem.detail).toContain("50");
    expect(out?.problem.detail).toContain("10");
  });
});

/* ----------------------------------------------------------- what a screen asks --- */

describe("what a screen asks before it draws a control", () => {
  /*
    ⚠️ THE SAME WALK, AND IT REPORTS THE GATE RATHER THAN A BOOLEAN. "You cannot
    yet" and "your plan does not include this" want different controls: one is
    disabled, the other is an upsell. A screen deciding for itself is a second
    opinion about access, and the two disagree the first time either changes.
  */
  it("names the gate so the control can be right", () => {
    expect(blockedBy(ask())).toBe(null);
    expect(blockedBy(ask({ op: op({ entitlement: "exports" }), entitlements: held("exports", false) })))
      .toBe("entitlement");
    expect(blockedBy(ask({ op: op({ quota: "notes" }), entitlements: held("notes", 0) }))).toBe("quota");
  });
});
