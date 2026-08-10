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
import { commerceOperations, customerOperations, providerOperations } from "../src/commerce-ops.js";
import { platformOperations } from "../src/platform-ops.js";
import { identityOperations } from "../src/identity-ops.js";
import { guideOperations } from "../src/guide-ops.js";
import { attribute, verifySignature } from "../src/provider.js";
import { PARKED, standingFor } from "../src/commerce.js";
import { ALWAYS_ALLOWED, PUBLIC, cache, collection, defineBindings, field, laneOf, objects, s, sql, operation, type AppSpec, type Instant, type RegionId, PLATFORM_EVENTS } from "@one/kernel";

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
  /* ⚠️ NOT `seats`: that one the platform counts itself, from the membership
     roster, so naming it here would test the exemption rather than the rule. */
  quota: "desks",
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
    /*
      ⚠️ EVERY PERMISSION THE PLATFORM'S OWN OPERATIONS NAME, because the runtime
      refuses a manifest whose derived surface no role can reach — an operation
      naming a permission nothing declares 403s for everybody, forever, and reads
      as a feature nobody uses.
    */
    permissions: ["seat:take", "thing:read", "thing:write", "workspace:create", "workspace:close", "billing:manage", "billing:operate", "inbox:read", "commerce:read", "commerce:manage", "file:read", "file:write", "guide:read", "milestone:read", "member:read", "member:manage"],
    /*
      ⚠️ AND A ROLE THAT HOLDS THEM. Declaring a permission is not the same as
      anybody being able to hold one: an operation whose permission appears in no
      role and no personal set refuses every caller, including the owner, and
      reads exactly like a feature nobody uses.
    */
    roles: {
      owner: ["seat:take", "thing:read", "thing:write", "workspace:create", "workspace:close", "billing:manage", "billing:operate", "inbox:read", "commerce:read", "commerce:manage", "file:read", "file:write", "guide:read", "milestone:read", "member:read", "member:manage"],
    },
    entitlements: {}, plans: [],
    customerRail: false as const, customerFlags: {}, seats: { counts: [] }, personal: ["workspace:create"],
  },
  governance: { legal: [], impersonation: { maxMinutes: 30, announce: true }, auditRetentionDays: 365 },
  collections: [],
  /* ⚠️ The three the PLATFORM raises. An app that declares none of them boots
     with a workspace creation, a plan choice and a grant that announce nothing. */
  notifications: {
    "workspace.created": { category: "service", tone: "success", icon: "sparkle", title: "{slug} is ready", link: { to: "inbox" }, roles: ["owner"] },
    "plan.chosen": { category: "billing", tone: "info", icon: "card", title: "You chose {planId}", link: { to: "inbox" }, roles: ["owner"] },
    "package.granted": { category: "billing", tone: "success", icon: "gift", title: "{days} days added", link: { to: "inbox" }, roles: ["owner"] },
  },
  help: {},
  filePurposes: {},
  releases: [],
  jobs: [],
  guide: { steps: [], hints: [] },
  milestones: {},
  retired: {},
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
  const withRail = { ...app({}).access, customerRail: "member" as const, customerFlags: { digest: { label: "Some capability", parked: false, enforcement: { derived: "n/a here" } as const } } };

  it("mounts nothing at all when the app has no rail", () => {
    expect(customerOperations(app({}))).toEqual([]);
  });

  it("mounts the whole rail when it does — the offer, the money and the corrections", () => {
    const ids = customerOperations(app({ access: withRail })).map((op) => op.id).sort();
    expect(ids).toEqual([
      "commerce.capabilities", "commerce.checkout", "commerce.code.issue", "commerce.codes",
      "commerce.confirm", "commerce.days", "commerce.grant", "commerce.history",
      "commerce.lapse", "commerce.lapse.set", "commerce.override", "commerce.package.save",
      "commerce.packages", "commerce.payments", "commerce.payments.set", "commerce.purchases",
      "commerce.redeem", "webhook.customer",
    ]);
  });

  /*
    ⚠️ THE WORKSPACE'S OWN WEBHOOK IS ON THE `webhook` LANE, which survives every
    rung of the payment ladder. A workspace suspended over its own bill still has
    customers mid-checkout, and refusing their provider's notification would take
    money on a page we do not control and grant nothing for it.
  */
  it("puts the customer webhook on a lane the standing ladder cannot close", () => {
    const hook = customerOperations(app({ access: withRail })).find((op) => op.id === "webhook.customer")!;
    expect(ALWAYS_ALLOWED).toContain(laneOf(hook));
    expect(hook.permission).toBe(PUBLIC);
    expect(hook.tool).toBe(false);
  });

  /*
    ⚠️ THE THREE WRITES A WORKSPACE MAKES ABOUT ONE PERSON ARE ALL OUT OF REACH
    OF AN ASSISTANT. Granting access, excepting somebody from what they bought
    and correcting their remaining days are decisions about a customer's money;
    a model that can take them can be talked into taking them.
  */
  it("keeps every per-customer write away from the assistant", () => {
    const ops = customerOperations(app({ access: withRail }));
    for (const id of [
      "commerce.grant", "commerce.override", "commerce.days", "commerce.confirm",
      "commerce.checkout", "commerce.payments.set", "commerce.code.issue", "commerce.redeem",
      "commerce.lapse.set",
    ]) {
      expect(ops.find((op) => op.id === id)?.tool, id).toBe(false);
    }
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

/* ------------------------------------------------------- the signature --- */

describe("the signature is the whole of the authentication", () => {
  const body = '{"id":"evt_1","type":"invoice.paid"}';
  const nowAt = "2026-01-10T00:00:00.000Z" as Instant;
  const seconds = Math.floor(Date.parse(nowAt) / 1000);

  const sign = async (text: string, t: number, secret: string) => {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${text}`));
    return `t=${t},v1=${[...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  };

  it("accepts what the provider actually signed", async () => {
    const header = await sign(body, seconds, "whsec_1");
    expect(await verifySignature({ secret: "whsec_1", body, header, now: nowAt })).toEqual({ ok: true });
  });

  /*
    ⚠️ A DEPLOYMENT WITH NO SECRET REFUSES. The endpoint is public by
    construction — a provider cannot hold a session — so an empty secret is not
    a permissive default, it is an open door that grants paid access to whoever
    finds it. Every other test in this file configures one, which is exactly why
    this case has to be asserted on its own.
  */
  it("refuses everything when no secret is configured, including a correct signature", async () => {
    /*
      Signed with a real secret and verified against none — the case a
      deployment that has not configured one is in, where every other check in
      this file would otherwise pass.
    */
    const header = await sign(body, seconds, "whsec_1");
    expect(await verifySignature({ secret: "", body, header, now: nowAt })).toEqual({ ok: false, why: "wrong" });
  });

  it("tells a malformed header from a stale one from a wrong one", async () => {
    expect(await verifySignature({ secret: "whsec_1", body, header: "nonsense", now: nowAt })).toEqual({ ok: false, why: "malformed" });
    expect(await verifySignature({ secret: "whsec_1", body, header: await sign(body, seconds - 4000, "whsec_1"), now: nowAt })).toEqual({ ok: false, why: "stale" });
    expect(await verifySignature({ secret: "whsec_1", body, header: await sign(body, seconds, "whsec_2"), now: nowAt })).toEqual({ ok: false, why: "wrong" });
  });
});

/* ------------------------------------------------------------- the wire --- */

/**
 * ⚠️ A DEAD LETTER NOBODY CAN READ IS THE SAME SILENT SUCCESS WITH AN EXTRA
 * TABLE. The surface over the parked events is not optional, and neither is the
 * permission on it — an operator console is where money that could not be
 * placed becomes visible, and a public one is a list of every failed payment.
 */
describe("the provider lane comes with the surface that makes parking a recovery", () => {
  const ops = providerOperations(app({}));
  const by = (id: string) => ops.find((op) => op.id === id);

  it("mounts the endpoint, the dead letter and the replay", () => {
    expect(ops.map((op) => op.id).sort()).toEqual(["billing.parked", "billing.parked.replay", "webhook.provider"]);
  });

  /*
    ⚠️ THE ENDPOINT IS ON THE `webhook` LANE, which survives every rung. Gating
    it behind standing makes a suspension unrecoverable: the payment that would
    lift it is refused because the workspace is suspended.
  */
  it("puts the endpoint on a lane that outlives every rung of the ladder", () => {
    expect(laneOf(by("webhook.provider")!)).toBe("webhook");
    expect(ALWAYS_ALLOWED).toContain("webhook");
  });

  it("keeps the endpoint public, because a provider cannot hold a session", () => {
    expect(by("webhook.provider")!.permission).toBe(PUBLIC);
  });

  it("keeps the dead letter and the replay behind an operator permission", () => {
    expect(by("billing.parked")!.permission).toBe("billing:operate");
    expect(by("billing.parked.replay")!.permission).toBe("billing:operate");
  });

  /*
    ⚠️ NONE OF THE THREE IS A TOOL. The endpoint is authenticated by a shared
    secret rather than by a person, and the replay grants paid access on an
    operator's say-so — a model that could reach either could grant itself
    anything from a sentence in a document it was asked to read.
  */
  it("keeps all three away from the assistant", () => {
    for (const op of ops) expect(op.tool, op.id).toBe(false);
  });
});

/**
 * ⚠️ A CLAIM RESOLVES SILENCE, NEVER A CONTRADICTION.
 *
 * A renewal carries the fields the PROVIDER thinks are interesting and none of
 * ours, so the customer reference is how it gets placed. But a reference that
 * exists in two products would then let one of them apply the other's payment —
 * the worst outcome available, and the one that looks most like it worked.
 */
describe("whose event is this", () => {
  const event = { id: "e", kind: "paid" as const, appId: null, tenantId: null, planId: null, customerRef: "cus_1", paidMinor: 900, refundedMinorTotal: 0 };
  const claims = (appId: string) => async () => ({ tenantId: "t_1", appId });

  it("trusts metadata we wrote ourselves over any lookup", async () => {
    expect(await attribute({ ...event, tenantId: "t_stated" }, "hello", claims("hello"))).toEqual({ ok: true, tenantId: "t_stated" });
  });

  it("does not consult a claim at all when the event names another product", async () => {
    let asked = false;
    const verdict = await attribute({ ...event, appId: "elsewhere" }, "hello", async () => { asked = true; return { tenantId: "t_1", appId: "hello" }; });
    expect(verdict).toEqual({ ok: false, why: "other_app" });
    expect(asked, "a claim must not be able to overrule stated metadata").toBe(false);
  });

  it("refuses a claim that belongs to another product", async () => {
    expect(await attribute(event, "hello", claims("elsewhere"))).toEqual({ ok: false, why: "other_app" });
    expect(await attribute(event, "hello", claims("hello"))).toEqual({ ok: true, tenantId: "t_1" });
  });

  it("tells an unclaimed reference from no reference at all", async () => {
    expect(await attribute(event, "hello", async () => null)).toEqual({ ok: false, why: "unclaimed" });
    expect(await attribute({ ...event, customerRef: null }, "hello", async () => null)).toEqual({ ok: false, why: "no_tenant" });
  });
});

/* -------------------------------------------------------------- guidance --- */

/**
 * ⚠️ ABSENT WHERE NOTHING IS DECLARED, rather than present and answering with an
 * empty list. An operation that exists and never has anything to say is one a
 * screen renders a permanent empty state for — and one a later stage builds on,
 * assuming it means something.
 */
describe("the checklist is mounted only where an app declares one", () => {
  const aStep = { id: "a", title: "A", roles: ["owner"], required: false, answer: { kind: "platform" as const, fact: "plan_chosen" as const } };

  it("mounts nothing at all when there are no steps and no hints", () => {
    expect(guideOperations(app({}))).toEqual([]);
  });

  it("mounts the read alone when there are steps but no hints", () => {
    expect(guideOperations(app({ guide: { steps: [aStep], hints: [] } })).map((op) => op.id)).toEqual(["guide.progress"]);
  });

  /*
    ⚠️ THERE IS NO OPERATION THAT MARKS A STEP DONE, and the dismissal is the
    only write here. A step is answered by counting, so a write that could set
    one would be a way to tell somebody something untrue about their own
    workspace.
  */
  it("adds only the hint dismissal when there are hints", () => {
    const both = { steps: [aStep], hints: [{ id: "h", surface: "thing", body: "b", roles: ["owner"] }] };
    expect(guideOperations(app({ guide: both })).map((op) => op.id).sort()).toEqual(["guide.hint.seen", "guide.progress"]);
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
      access: { ...app({}).access, entitlements: { reports: { label: "Some capability", parked: false, enforcement: "gate" } } },
    }), opts)).toThrow(/reports/);
  });

  /*
    ⚠️ A CEILING NOBODY CAN COUNT IS NOT A CEILING. It would report an obligation
    on every request and have it discharged as "fine" — a limit on a price list
    that refuses nothing, with the code reading as though it were enforced.
  */
  it("refuses an operation counting against a key nothing can count", () => {
    expect(() => createRuntime(app({
      access: { ...app({}).access, entitlements: { desks: { label: "Some capability", parked: 3, enforcement: "quota" } } },
      operations: [counted] as never,
    }), opts)).toThrow(/which nothing can count/);
  });

  it("accepts it once a collection declares the same key", () => {
    expect(() => createRuntime(app({
      access: { ...app({}).access, entitlements: { desks: { label: "Some capability", parked: 3, enforcement: "quota" } } },
      collections: [{ ...stored, quota: "desks" }],
      operations: [counted] as never,
    }), opts)).not.toThrow();
  });

  /*
    ⚠️ AND `seats` IS THE ONE KEY THE PLATFORM COUNTS ITSELF, from the membership
    roster — because the rows are the platform's now. An app forced to supply a
    counter for it would be supplying one for a table it does not own, and the
    obvious wrong answer (count accepted members only) is a ceiling anybody can
    pass by inviting people and waiting.
  */
  it("counts seats itself, without the app supplying anything", () => {
    expect(() => createRuntime(app({
      access: { ...app({}).access, entitlements: { seats: { label: "Some capability", parked: 3, enforcement: "quota" } }, seats: { counts: ["owner"] } },
      operations: [{ ...counted, quota: "seats" }] as never,
    }), opts)).not.toThrow();
  });

  it("accepts it when the app says how to count", () => {
    expect(() => createRuntime(app({
      access: { ...app({}).access, entitlements: { desks: { label: "Some capability", parked: 3, enforcement: "quota" } } },
      operations: [counted] as never,
    }), { ...opts, countQuota: async () => 0 })).not.toThrow();
  });
});

/* --------------------------------------------------------- reachability --- */

/**
 * ⚠️ A SURFACE NO ROLE CAN REACH IS THE FAILURE THIS PLATFORM WAS STARTED OVER,
 * wearing its quietest costume.
 *
 * The gate compares an operation's permission against what the caller holds, and
 * what a caller can hold comes from `access.roles`, whose values come from
 * `access.permissions`. So an operation naming something absent from that list
 * 403s for everybody, forever — including the workspace owner — and reads
 * exactly like a feature nobody uses.
 *
 * It bites hardest on operations an app never wrote: a collection implies
 * `<id>:read` and `<id>:write`, the checklist implies `guide:read`, the shelf
 * implies `milestone:read`. Nothing in the manifest names them out loud.
 */
describe("the runtime refuses a surface no role can reach", () => {
  it("refuses a collection whose implied permissions the app does not declare", () => {
    expect(() => createRuntime(app({
      access: { ...app({}).access, permissions: app({}).access.permissions.filter((p) => p !== "thing:read") },
      collections: [stored],
    }), opts)).toThrow(/thing\.list/);
  });

  it("refuses a platform operation whose permission the app does not declare", () => {
    expect(() => createRuntime(app({
      access: { ...app({}).access, permissions: app({}).access.permissions.filter((p) => p !== "inbox:read") },
    }), opts)).toThrow(/inbox:read/);
  });

  /*
    ⚠️ AND DECLARING IS NOT HOLDING. A permission listed in `access.permissions`
    that appears in no role and no personal set refuses every caller, forever,
    including the owner — and the 403 is indistinguishable from one somebody
    forgot to grant, on a feature that reads as one nobody uses.
  */
  it("refuses a permission every role happens to leave out", () => {
    const roles = app({}).access.roles;
    expect(() => createRuntime(app({
      access: {
        ...app({}).access,
        roles: { owner: (roles.owner ?? []).filter((p) => p !== "inbox:read") },
      },
    }), opts)).toThrow(/inbox:read/);
  });

  it("accepts one that declares every permission its surface implies", () => {
    expect(() => createRuntime(app({ collections: [stored] }), opts)).not.toThrow();
  });
});

/* ------------------------------------------------------- platform events --- */

/**
 * ⚠️ THE KERNEL'S COPY OF WHAT THE PLATFORM RAISES, PINNED TO WHAT IT ACTUALLY
 * RAISES. `@one/kernel` cannot import the runtime, so `PLATFORM_EVENTS` is a
 * transcription — and a transcription nobody checks is a list that is right
 * until somebody adds an event. The consequence of drift is silent in both
 * directions: an event no app declares copy for announces nothing, and a name
 * left behind refuses every manifest for a notification nothing will ever send.
 */
describe("what the platform raises is what the kernel says it raises", () => {
  it("matches the emits of the platform's own operations exactly", () => {
    const built = createRuntime(app({ collections: [stored] }), opts);
    expect(built).toBeDefined();
    const raised = new Set<string>();
    /* ⚠️ With the customer rail ON, or `package.granted` is not mounted to be found. */
    const railed = app({ access: { ...app({}).access, customerRail: "member" } });
    for (const op of [...platformOperations(railed), ...commerceOperations(railed), ...customerOperations(railed), ...identityOperations(railed)]) {
      for (const e of op.emits ?? []) raised.add(e);
    }
    expect([...raised].sort()).toEqual([...PLATFORM_EVENTS].sort());
  });
});
