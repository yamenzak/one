/**
 * WHEN A SWEEP RUNS, AND WHAT IT MAY NOT LEAVE UNSAID.
 *
 * ⚠️ SCHEDULED WORK DOES NOT BREAK, IT STOPS — so every rule here is about
 * making an absence visible. A job that is never due, one that is due forever,
 * and one with no bound all look identical from outside: nothing happens, and
 * nothing says so.
 */

import { describe, expect, it } from "vitest";
import { assertComposable, CADENCE_MS, isDue, job, type Instant, type JobSpec, type NotificationDef, type NotificationRegistry } from "../src/index.js";

const AT = (iso: string) => iso as Instant;
const sweeping = (over: Partial<JobSpec> = {}) =>
  job({
    id: "sweep", summary: "s", every: "daily", scope: "tenant", batch: 10,
    async handler() { return { done: 0, more: false }; },
    ...over,
  } as JobSpec);

describe("when a job is due", () => {
  /*
    ⚠️ NEVER RUN IS ALWAYS DUE. A first deployment, a new region and a job added
    to an existing app all have no last-run — and reading that as "not yet"
    means the sweep starts one interval late, which for a weekly job is a week
    somebody spends assuming it works.
  */
  it("runs one that has never run", () => {
    expect(isDue(sweeping(), null, AT("2026-01-10T00:00:00.000Z"))).toBe(true);
  });

  it("waits out its own interval and no other", () => {
    const last = AT("2026-01-10T00:00:00.000Z");
    expect(isDue(sweeping(), last, AT("2026-01-10T23:59:00.000Z"))).toBe(false);
    expect(isDue(sweeping(), last, AT("2026-01-11T00:00:00.000Z"))).toBe(true);
    expect(isDue(sweeping({ every: "hourly" }), last, AT("2026-01-10T00:59:00.000Z"))).toBe(false);
    expect(isDue(sweeping({ every: "hourly" }), last, AT("2026-01-10T01:00:00.000Z"))).toBe(true);
    expect(isDue(sweeping({ every: "weekly" }), last, AT("2026-01-16T00:00:00.000Z"))).toBe(false);
    expect(isDue(sweeping({ every: "weekly" }), last, AT("2026-01-17T00:00:00.000Z"))).toBe(true);
  });

  /*
    ⚠️ AN INTERVAL, NOT A WALL-CLOCK TIME. A cron expression for a platform
    serving several regions is a question with no single answer, and the failure
    is subtle: "02:00" is three different moments for three tenants and none at
    all for a fourth on the day a clock changes.
  */
  it("measures a cadence in time rather than in calendar", () => {
    expect(CADENCE_MS.daily).toBe(CADENCE_MS.hourly * 24);
    expect(CADENCE_MS.weekly).toBe(CADENCE_MS.daily * 7);
  });
});

/* ------------------------------------------------------------ composition --- */

const base = {
  id: "test",
  access: {
    permissions: ["inbox:read", "note:read"], roles: {}, plans: [], entitlements: {},
    customerRail: false as const, customerFlags: {}, seats: { counts: [] }, personal: [],
  },
  collections: [],
  /* ⚠️ The three the platform raises: an app that declares none announces none. */
  notifications: {
    "workspace.created": { category: "service", tone: "success", icon: "sparkle", title: "ready", link: { to: "inbox" }, roles: ["owner"], needs: "inbox:read" },
    "plan.chosen": { category: "billing", tone: "info", icon: "card", title: "chosen", link: { to: "inbox" }, roles: ["owner"], needs: "inbox:read" },
    "package.granted": { category: "billing", tone: "success", icon: "gift", title: "granted", link: { to: "inbox" }, roles: ["owner"], needs: "inbox:read" },
    "support.session": { category: "service", tone: "warning", icon: "shield", title: "Somebody from support was in your workspace", body: "Why: {reason}", link: { to: "inbox" }, roles: ["owner"], needs: "inbox:read" },
  } as NotificationRegistry,
  help: {}, filePurposes: {},
  governance: {
    legal: [{ id: "terms", version: "1", title: "Terms", body: "The terms.", mustAccept: ["owner"] }],
    protection: {
      controller: "The example controls it.",
      contact: "privacy@example.test",
      assessment: { required: false, note: "A fixture processes nobody's data." },
      subprocessors: [
        /* ⚠️ TWO ON A FIXTURE, because there is no such thing as a product with
           none: it runs on somebody's computers and its sign-in code leaves
           through somebody's mail lane. `disclosureProblems` refuses a manifest
           that reaches one of these and does not name it. */
        { id: "cloudflare", name: "Cloudflare, Inc.", role: "Runs it.", does: "Runs it", receives: ["identity", "usage"] as const, where: "Its network.", safeguard: "dpf" as const, terms: "https://example.test/dpa" },
        { id: "cloudflare-email", name: "Cloudflare Email", role: "Sends the sign-in code.", does: "Sends the mail", receives: ["contact"] as const, where: "Its network.", safeguard: "dpf" as const, terms: "https://example.test/dpa" },
      ],
    },
    impersonation: { maxMinutes: 30, announce: true },
    auditRetentionDays: 365,
  },
  releases: [], problems: {}, operations: [], jobs: [] as JobSpec[],
  guide: { steps: [], hints: [] },
};

describe("what a manifest may not say about a job", () => {
  /*
    ⚠️ AN UNBOUNDED SWEEP IS ONE THAT STOPS. It works on every deployment until
    the largest tenant crosses the runtime's time limit — then it fails, is
    retried, fails at the same size, and the work never happens again.
  */
  it("refuses one with no bound on a single run", () => {
    for (const batch of [0, -1, 1.5, Number.NaN]) {
      expect(() => assertComposable({ ...base, jobs: [sweeping({ batch })] }), String(batch)).toThrow(/no bound/);
    }
    expect(() => assertComposable({ ...base, jobs: [sweeping({ batch: 1 })] })).not.toThrow();
  });

  /*
    ⚠️ A JOB'S EVENTS ARE THE ONES NOBODY SEES FAIL. An operation with an
    undeclared emit is found the first time somebody uses the feature; a sweep's
    is found on the night it finally has something to say.
  */
  it("refuses one raising an event no notification declares", () => {
    expect(() => assertComposable({ ...base, jobs: [sweeping({ emits: ["swept"] })] })).toThrow(/swept/);

    const told: NotificationDef = {
      category: "service", tone: "info", icon: "clock",
      title: "Swept", link: { to: "inbox" }, roles: ["owner"], needs: "note:read",
    };
    expect(() => assertComposable({ ...base, notifications: { ...base.notifications, swept: told }, jobs: [sweeping({ emits: ["swept"] })] })).not.toThrow();
  });
});
