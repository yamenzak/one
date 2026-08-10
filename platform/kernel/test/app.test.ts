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
import { legalProblems, assertComposable, coverage, undeclaredEmits, type AccessSpec } from "../src/app.js";
import type { EntitlementDef, PlanSpec } from "../src/entitlement.js";
import type { FlagDef } from "../src/customer.js";
import { collection, field, type CollectionSpec } from "../src/collection.js";
import { s } from "../src/validate.js";
import type { NotificationDef } from "../src/notify.js";
import type { HelpRegistry } from "../src/help.js";
import type { Release } from "../src/release.js";
import { isArchived } from "../src/document.js";

/** The smallest thing the coverage walk will read — it inspects four fields. */
const stub = { id: "x.do", kind: "write", permission: "x" };
const stubCollection = { id: "x", label: { one: "X", many: "Xs" }, scope: { of: "tenant" }, fields: {} };

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

  const cfg: DoorConfig = { appRoot: "kova.4dl.app", platformRoot: "4dl.app", reserved: ["kova"], deviceDoor: "play", doors: EVERY_DOOR };

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
      customerRail: false as AccessSpec["customerRail"], customerFlags: {} as Record<string, FlagDef>,
      seats: { counts: [] },
      personal: [],
    },
  collections: [] as CollectionSpec[],
  /* ⚠️ A document carrying its text, because one carrying neither its text nor
     an address for it is a consent recorded against nothing. */
  governance: {
    legal: [{ id: "terms", version: "1", title: "Terms", body: "The terms.", mustAccept: ["owner"] }],
    impersonation: { maxMinutes: 30, announce: true },
    auditRetentionDays: 365,
  },
  /*
    ⚠️ THE THREE THE PLATFORM RAISES, in the shared base, because every manifest
    must declare them — an app that does not has a workspace creation, a plan
    choice and a grant that announce nothing at all.
  */
  notifications: {
    "workspace.created": { category: "service", tone: "success", icon: "sparkle", title: "ready", link: { to: "inbox" }, roles: ["owner"] },
    "plan.chosen": { category: "billing", tone: "info", icon: "card", title: "chosen", link: { to: "inbox" }, roles: ["owner"] },
    "package.granted": { category: "billing", tone: "success", icon: "gift", title: "granted", link: { to: "inbox" }, roles: ["owner"] },
    "support.session": { category: "service", tone: "warning", icon: "shield", title: "Somebody from support was in your workspace", body: "Why: {reason}", link: { to: "inbox" }, roles: ["owner"] },
  } as Record<string, NotificationDef>,
  help: {} as HelpRegistry,
  filePurposes: {},
  releases: [] as Release[],
  jobs: [],
  guide: { steps: [], hints: [] },
  problems: {},
  operations: [] as never[],
};

/* -------------------------------------------------------- getting in --- */

describe("who can get into a workspace at all", () => {
  /*
    ⚠️ A WORKSPACE WHOSE CREATOR CANNOT INVITE ANYBODY IS UNREACHABLE, not empty.
    The platform makes the creator a member in the role that can manage members,
    chosen by capability rather than by name — so with no such role there is no
    founding membership, every request answers 403, and the directory row, the
    tables and the session are all perfectly correct.
  */
  it("refuses an app where somebody may create a workspace and no role can manage it", () => {
    expect(() => assertComposable({
      ...base,
      access: { ...base.access, personal: ["workspace:create"], permissions: ["workspace:create"] },
    })).toThrow(/member:manage/);
  });

  it("accepts it once a role can", () => {
    expect(() => assertComposable({
      ...base,
      access: {
        ...base.access,
        permissions: ["workspace:create", "member:manage"],
        personal: ["workspace:create"],
        roles: { owner: ["member:manage"] },
      },
    })).not.toThrow();
  });

  /*
    ⚠️ AND A PERSONAL PERMISSION IS A PERMISSION. On that set a typo is worse
    than inert: it is what decides whether anybody can create their first
    workspace, so the product refuses every signup with the same 403 as a
    genuine lack of permission.
  */
  it("refuses a personal permission the manifest never declared", () => {
    expect(() => assertComposable({
      ...base,
      access: { ...base.access, personal: ["worksapce:create"] },
    })).toThrow(/worksapce:create/);
  });
});

describe("a sold capability is withheld by something", () => {
  it("refuses an entitlement declared as a gate that no operation names", () => {
    expect(() => assertComposable({
      ...base,
      access: { ...base.access, entitlements: { reports: { label: "Some capability", parked: false, enforcement: "gate" } } },
    })).toThrow(/reports/);
  });

  it("accepts it once an operation names it", () => {
    expect(() => assertComposable({
      ...base,
      access: { ...base.access, entitlements: { reports: { label: "Some capability", parked: false, enforcement: "gate" } } },
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
      access: { ...base.access, entitlements: { stored: { label: "Some capability", parked: 5, enforcement: "quota" } } },
      collections: [{ ...stubCollection, quota: "stored" }] as never,
    })).not.toThrow();
  });

  it("refuses a quota nothing counts against, even where a gate names the key", () => {
    expect(() => assertComposable({
      ...base,
      access: { ...base.access, entitlements: { stored: { label: "Some capability", parked: 5, enforcement: "quota" } } },
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
      access: { ...base.access, entitlements: { chat: { label: "Some capability", parked: false, enforcement: { unenforced: "nothing sells it yet" } } } },
    })).not.toThrow();
  });

  it("refuses a customer capability the interface hides and no route withholds", () => {
    expect(() => assertComposable({
      ...base,
      access: { ...base.access, customerRail: "member", customerFlags: { bodyReport: { label: "Some capability", parked: false, enforcement: "shape" } } },
    })).toThrow(/bodyReport/);
    expect(() => assertComposable({
      ...base,
      access: { ...base.access, customerRail: "member", customerFlags: { bodyReport: { label: "Some capability", parked: false, enforcement: "shape" } } },
      operations: [{ ...stub, shape: { body: "bodyReport" } }] as never,
    })).not.toThrow();
  });

  it("refuses customer capabilities on an app with no rail to resolve them", () => {
    expect(() => assertComposable({
      ...base,
      access: { ...base.access, customerFlags: { bodyReport: { label: "Some capability", parked: false, enforcement: { derived: "their own data" } } } },
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
        entitlements: { seats: { label: "Some capability", parked: 5, enforcement: { unenforced: "not the point of this case" } } },
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
describe("a document's own transitions raise events, and they are checked too", () => {
  const filing = (event: string): Record<string, unknown> => ({
    ...base,
    collections: [{
      id: "report", label: { one: "Report", many: "Reports" }, scope: { of: "tenant" },
      version: true, retention: { days: null, onTenantClose: "purge" }, onDelete: { on: "archive" },
      docStatus: { amendable: false, immutableAfterSubmit: [], emits: { submit: event } },
      fields: { title: {} },
    }],
  });

  /*
    ⚠️ A DERIVED TRANSITION'S EVENT IS INVISIBLE IN `operations`, because nobody
    wrote those operations. An undeclared one is a notification with no copy, no
    icon and no destination — arriving at the single most notification-worthy
    moment the product has.
  */
  it("refuses a submit that raises an event no notification declares", () => {
    expect(() => assertComposable(filing("report.filed") as never)).toThrow(/report\.filed/);
  });

  it("accepts one the registry declares", () => {
    expect(() => assertComposable({
      ...filing("report.filed"),
      notifications: {
        ...base.notifications,
        "report.filed": { category: "activity", tone: "info", icon: "check", title: "Filed", link: { to: "inbox" }, roles: ["owner"] },
      },
    } as never)).not.toThrow();
  });
});

describe("a price list may only promise what exists", () => {
  /*
    ⚠️ A PLAN NAMING A KEY NOBODY DECLARED IS SOLD, PAID FOR AND ENFORCED BY
    NOTHING. It resolves to nothing at the gate, so every workspace has it and
    the ones that paid got nothing — and it looks exactly like a capability that
    happens to be generous.
  */
  it("refuses a plan selling a key this app does not declare", () => {
    expect(() => assertComposable({
      ...base,
      access: {
        ...base.access,
        entitlements: { real: { label: "Real", parked: false, enforcement: { unenforced: "not the point of this test" } } },
        plans: [{ id: "p", name: "P", price: { minor: 0, currency: "EUR" }, period: "month", trialDays: 0, entitlements: { ghosts: true } }],
      },
    } as never)).toThrow(/ghosts/);
  });
});

describe("a media field is refused against the file purposes", () => {
  /*
    ⚠️ A FIELD NO UPLOAD CAN FILL IS A FORM CONTROL THAT CANNOT BE USED, and the
    failure arrives at the worst possible moment: the person picks a file, the
    upload succeeds against a purpose that takes it, and the SAVE refuses. An app
    with a media field and no purposes at all is the same defect with nothing to
    compare against, so both are one check.
  */
  const withField = (accept: readonly string[], purposes: Record<string, unknown>) => ({
    ...base,
    access: { ...base.access, permissions: [...base.access.permissions, "note:write"] },
    collections: [{
      ...stubCollection,
      id: "person",
      fields: { face: { kind: "media", accept, maxBytes: 1_000 } },
    }] as unknown as CollectionSpec[],
    filePurposes: purposes,
  }) as never;

  it("accepts a field a declared purpose can produce", () => {
    expect(() => assertComposable(withField(["image/png"], { photo: { label: "P", accept: ["image/png"], maxBytes: 1_000, permission: "note:write" } }))).not.toThrow();
  });

  /*
    ⚠️ ONE TYPE IN COMMON IS ENOUGH, and requiring all of them is the mistake to
    guard against: a field that takes both a photograph and a scan, beside a
    purpose that only takes the photograph, is perfectly fillable — refusing it
    would make a field narrower than its purpose the only legal shape.
  */
  it("accepts a field that takes more than the purpose does, so long as they overlap", () => {
    expect(() => assertComposable(withField(["image/png", "image/jpeg"], { photo: { label: "P", accept: ["image/png"], maxBytes: 1_000, permission: "note:write" } }))).not.toThrow();
  });

  it("refuses a field whose types no purpose takes", () => {
    expect(() => assertComposable(withField(["image/heic"], { photo: { label: "P", accept: ["image/png"], maxBytes: 1_000, permission: "note:write" } })))
      .toThrow(/person\.face/);
  });

  it("refuses a media field in an app that declares no purposes at all", () => {
    expect(() => assertComposable(withField(["image/png"], {}))).toThrow(/person\.face/);
  });
});

describe("a checklist step is refused against the rest of the manifest", () => {
  /*
    ⚠️ THE REST OF THE MANIFEST DECIDES WHETHER A STEP IS ANSWERABLE. An app
    selling no plans cannot be asked to choose one, and an app with no file
    purposes has no upload surface mounted at all — both are answered "no"
    forever, and both look like a step nobody has got to yet.
  */
  const asking = (fact: string) => ({
    ...base,
    guide: { steps: [{ id: "s", title: "T", roles: ["owner"], required: true, answer: { kind: "platform", fact } }], hints: [] },
  }) as never;

  it("refuses a step asking for a plan in an app that sells none", () => {
    expect(() => assertComposable(asking("plan_chosen"))).toThrow(/sells none/);
  });

  it("refuses a step asking for a file in an app with no file purposes", () => {
    expect(() => assertComposable(asking("file_stored"))).toThrow(/no upload surface/);
  });
});

describe("punctuation is refused by the whole manifest", () => {
  const declaring = (outcome: Record<string, unknown>) => ({
    ...base,
    operations: [{ id: "thing.save", outcome }] as never[],
  });

  /*
    ⚠️ FATAL, NOT REPORTED. A manifest is evaluated when the worker boots, so a
    refusal is a deployment that does not start — which is the correct outcome
    for a product about to celebrate something on every call, and it is loud in a
    way a warning in a log is not.
  */
  it("refuses an operation that celebrates, because that belongs to a milestone", () => {
    expect(() => assertComposable(declaring({ message: "Done", tone: "success", moment: "celebrate" }))).toThrow(/milestone/);
  });

  it("refuses punctuation on a danger outcome, which is a chime over lost work", () => {
    expect(() => assertComposable(declaring({ message: "Deleted", tone: "danger", moment: "acknowledge" }))).toThrow(/danger/);
  });

  it("accepts an ordinary acknowledgement", () => {
    expect(() => assertComposable(declaring({ message: "Saved", tone: "success", moment: "acknowledge" }))).not.toThrow();
  });
});

describe("a milestone is refused by the whole manifest or by nothing", () => {
  const announced = {
    ...base.notifications,
    "milestone.earned": { category: "activity", tone: "success", icon: "sparkle", title: "{title}", link: { to: "inbox" }, roles: ["owner"] },
  } as Record<string, NotificationDef>;

  /*
    ⚠️ THE CHECK HAS TO BE FATAL, not reported. A milestone nobody can earn is
    somebody working towards a badge forever, and a warning in a boot log is a
    thing nobody reads — the manifest is evaluated when the worker starts, so a
    refusal here is a deployment that does not begin.
  */
  it("refuses one waiting on an event nothing raises", () => {
    expect(() => assertComposable({
      ...base,
      notifications: announced,
      milestones: { ghost: { title: "Ghost", icon: "x", rule: { kind: "first", event: "never.happens" }, roles: ["owner"] } },
    })).toThrow(/never\.happens/);
  });

  /*
    ⚠️ A RULE MAY BE OVER ONE OF THE PLATFORM'S OWN EVENTS. `package.granted` is
    raised by an operation no manifest wrote, so a check reading only the app's
    `emits` would refuse "count the packages you granted" as a rule over
    something nothing raises — which is the opposite of true, and would push
    every app towards re-emitting an event it does not own.
  */
  it("accepts one over an event the platform raises rather than the app", () => {
    expect(() => assertComposable({
      ...base,
      notifications: announced,
      milestones: { ten: { title: "Ten", icon: "gift", rule: { kind: "count", event: "package.granted", reaches: 10 }, roles: ["owner"] } },
    })).not.toThrow();
  });

  it("refuses an app with milestones and nothing to announce them", () => {
    expect(() => assertComposable({
      ...base,
      milestones: { ten: { title: "Ten", icon: "gift", rule: { kind: "count", event: "package.granted", reaches: 10 }, roles: ["owner"] } },
    })).toThrow(/milestone\.earned/);
  });
});

describe("the platform's own events need copy, and the app is where copy lives", () => {
  /*
    ⚠️ `dispatch` ANSWERS AN UNKNOWN TYPE BY RETURNING NOTHING. So an app that
    did not happen to write these three strings announced neither a workspace
    being created, nor a plan being chosen, nor days being added — from a
    registry lookup that returns undefined and moves on, with every test green.
  */
  it("refuses a manifest that declares no copy for one of them", () => {
    const { "plan.chosen": _dropped, ...rest } = base.notifications;
    expect(() => assertComposable({ ...base, notifications: rest })).toThrow(/plan\.chosen/);
  });

  it("accepts one that declares all of them", () => {
    expect(() => assertComposable({ ...base })).not.toThrow();
  });
});

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
      notifications: { ...base.notifications, "thing.happened": told },
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
      notifications: { ...base.notifications, "thing.happened": { ...told, link: { to: "row", collection: "ghost" } } },
    })).toThrow(/thing\.happened/);
  });

  it("accepts a link to one it does", () => {
    expect(() => assertComposable({
      ...base,
      notifications: { ...base.notifications, "thing.happened": { ...told, link: { to: "row", collection: "x" } } },
      collections: [stubCollection] as never,
    })).not.toThrow();
  });

  it("holds the real manifest to that too", () => {
    expect(undeclaredEmits(kova)).toEqual([]);
  });
});

/* ------------------------------------------------------- help and copy --- */

/**
 * ⚠️ THE PURE CHECKS ARE PROVED IN `help.test.ts`; THIS IS THE WIRING.
 *
 * A rule that is implemented and not called is the same as one that was never
 * written, and it is worse to read: the function exists, the tests are green,
 * and nothing runs it. Every one of these mutations survived until this block
 * existed.
 */
describe("what a manifest says to a person", () => {
  it("refuses an article longer than somebody will read", () => {
    expect(() => assertComposable({
      ...base,
      help: { long: { title: "Fine", body: "x".repeat(2000) } },
    })).toThrow(/over 900/);
  });

  it("refuses one written in developer vocabulary", () => {
    expect(() => assertComposable({
      ...base,
      help: { api: { title: "Fine", body: "The endpoint returns nothing." } },
    })).toThrow(/endpoint/);
  });

  it("refuses one about a screen this app does not have", () => {
    expect(() => assertComposable({
      ...base,
      help: { ghost: { title: "Fine", body: "Short and clear.", surfaces: ["nowhere"] } },
    })).toThrow(/does not declare/);
  });

  /*
    ⚠️ A CROSS-LINK IS RENDERED BESIDE AN ERROR, so whoever follows it is already
    stuck — a dead one is the second failure in a row.
  */
  it("refuses a link to an article nobody wrote, from an operation or from a failure", () => {
    expect(() => assertComposable({
      ...base,
      operations: [{ ...stub, help: "missing" }] as never,
    })).toThrow(/missing/);
    expect(() => assertComposable({
      ...base,
      problems: { "x.y": { status: 400, title: "No", retryable: false, help: "absent" } },
    })).toThrow(/absent/);
  });

  it("accepts one that is declared", () => {
    expect(() => assertComposable({
      ...base,
      help: { there: { title: "Fine", body: "Short and clear." } },
      operations: [{ ...stub, help: "there" }] as never,
    })).not.toThrow();
  });

  /*
    ⚠️ A RELEASE NOTE IS PRODUCT COPY. The changelog fills with commit subjects
    because both describe a change and one is already written — and then somebody
    writes a second, hand-curated changelog for customers, and the two disagree
    within a month.
  */
  it("refuses a commit subject in the changelog", () => {
    expect(() => assertComposable({
      ...base,
      releases: [{ version: "1.0.0", at: "2026-02-01", notes: ["refactor the settle path"] }],
    })).toThrow(/commit/);
    expect(() => assertComposable({
      ...base,
      releases: [{ version: "1.0.0", at: "2026-02-01", notes: ["Closes #12"] }],
    })).toThrow(/pull request/);
  });

  it("accepts one somebody outside the team can act on", () => {
    expect(() => assertComposable({
      ...base,
      releases: [{ version: "1.0.0", at: "2026-02-01", notes: ["You can now choose a plan."] }],
    })).not.toThrow();
  });

  it("holds the real manifest to all of it", () => {
    expect(() => assertComposable(kova)).not.toThrow();
  });
});

/* --------------------------------------------- what a json column holds --- */

/**
 * ⚠️ A `json` FIELD NAMING AN UNREGISTERED SCHEMA IS AN UNVALIDATED COLUMN
 * WEARING A CONTRACT'S CLOTHES.
 *
 * The name reads like a promise and was a comment: nothing read it, so the
 * column took any shape at all. What follows is silent rather than loud — code
 * that reads the body walks the keys it expects, finds none of them, and returns
 * its input unchanged. A training plan whose days carry `items` where every
 * reader wants `movements` copies a week, applies no progression, saves, and
 * reports success with every number correct and nothing moved.
 */
describe("a json column says what it holds, or the manifest is refused", () => {
  const withBody = (schema: string): CollectionSpec => collection({
    id: "note",
    label: { one: "Note", many: "Notes" },
    scope: { of: "tenant" },
    version: true,
    retention: { days: null, onTenantClose: "purge" },
    onDelete: { on: "purge" },
    fields: { body: field.json(schema, { required: true }) },
  });

  it("refuses a field naming a schema nothing registers", () => {
    expect(() => assertComposable({ ...base, collections: [withBody("note.v1")] }))
      .toThrow(/note\.body names "note\.v1"/);
  });

  it("accepts it once the manifest registers the shape", () => {
    expect(() => assertComposable({
      ...base,
      collections: [withBody("note.v1")],
      schemas: { "note.v1": s.object({ text: s.text() }) as never },
    })).not.toThrow();
  });

  /* ⚠️ The name is matched exactly. A near-miss is the case this is for. */
  it("refuses a schema registered under a different name", () => {
    expect(() => assertComposable({
      ...base,
      collections: [withBody("note.v1")],
      schemas: { "note.v2": s.object({ text: s.text() }) as never },
    })).toThrow(/note\.v1/);
  });

  it("says nothing about an app with no json fields at all", () => {
    expect(() => assertComposable({ ...base })).not.toThrow();
  });
});

/* ------------------------------------------------------- who may upload --- */

/**
 * ⚠️ A PURPOSE ANSWERS "WHO MAY PUT ONE HERE", and it is the same kind of
 * question as "what may go in it".
 *
 * One permission on the upload operation gives every kind of file the same
 * answer, and the two ends of the range are not close: a movement demonstration
 * is the studio's, and a photograph of a client's own body is theirs. That
 * shipped as a client who could not upload at all — so every camera feature
 * built FOR them carried their permission, carried their flag, and was refused
 * at its first step, on a different operation from the feature.
 */
describe("a file purpose says who may upload under it", () => {
  const withPurpose = (permission: string) => ({
    ...base,
    access: { ...base.access, permissions: [...base.access.permissions, "mine:write"] },
    filePurposes: { photo: { label: "P", accept: ["image/png"], maxBytes: 1_000, permission } },
  });

  it("accepts one naming a permission the app declares", () => {
    expect(() => assertComposable(withPurpose("mine:write"))).not.toThrow();
  });

  /* ⚠️ A permission nobody can hold is an upload nobody can make, and it fails
     as a 403 on a screen that offered the control. */
  it("refuses one naming a permission nobody can hold", () => {
    expect(() => assertComposable(withPurpose("imaginary:write")))
      .toThrow(/"photo" needs "imaginary:write"/);
  });
});

/* ----------------------------------------------------------------- legal --- */

/**
 * ⚠️ A CONSENT LEDGER POINTING AT NOTHING IS WORSE THAN NO LEDGER.
 *
 * `LegalDoc` was `{ id, version, mustAccept }`. The ledger recorded that
 * somebody agreed to `terms@2026-01-01`, and the text of `terms@2026-01-01`
 * existed nowhere — not in the manifest, not on a page, not in the repository.
 * So the rows were evidence that somebody agreed to something that could not be
 * produced, which is exactly the document anybody would ever ask for it about.
 */
describe("a document somebody is asked to agree to", () => {
  const doc = { id: "terms", version: "1", title: "Terms", body: "The terms.", mustAccept: ["owner"] };

  it("is accepted when it carries its own text", () => {
    expect(legalProblems([doc])).toEqual([]);
  });

  /* ⚠️ Or an address for it, which is the practical answer for anything long
     enough that nobody reads it where it is asked about. */
  it("is accepted when it carries an address for it", () => {
    expect(legalProblems([{ ...doc, body: undefined, url: "https://example.test/terms" }])).toEqual([]);
  });

  it("is refused when it carries neither", () => {
    const out = legalProblems([{ ...doc, body: undefined }]);
    expect(out.map((p) => p.id)).toEqual(["terms"]);
    expect(out[0]!.why).toContain("refers to nothing");
  });

  /* ⚠️ Blank is not text. An empty body is the same document nobody can produce,
     declared in a way that looks like it was thought about. */
  it("is refused when what it carries is blank", () => {
    expect(legalProblems([{ ...doc, body: "   " }])).not.toEqual([]);
    expect(legalProblems([{ ...doc, body: undefined, url: "  " }])).not.toEqual([]);
  });

  /*
    ⚠️ THE VERSION IS PART OF THE LEDGER'S KEY. Without one, a consent to this
    document cannot be told from a consent to the next one — which is the single
    property the ledger exists to have.
  */
  it("is refused with no version", () => {
    expect(legalProblems([{ ...doc, version: "" }])).not.toEqual([]);
  });

  /* ⚠️ And a document required of nobody is one that is never shown and never
     agreed to, which reads in a manifest exactly like one that is. */
  it("is refused when nobody has to accept it", () => {
    expect(legalProblems([{ ...doc, mustAccept: [] }])).not.toEqual([]);
  });

  /* ⚠️ Declared twice, and which version is asked about is whichever came last. */
  it("is refused when the same one is declared twice", () => {
    expect(legalProblems([doc, { ...doc, version: "2" }])).not.toEqual([]);
  });

  /* ⚠️ Reported all at once: a check that stops at the first turns fixing a
     manifest into a conversation of one sentence at a time. */
  it("reports every problem rather than the first", () => {
    expect(legalProblems([{ id: "x", version: "", title: "", mustAccept: [] }]).length).toBeGreaterThan(2);
  });
});
