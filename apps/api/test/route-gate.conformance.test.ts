/**
 * Route-gate conformance — `permissionFor` (the action-level outer wall in
 * route-guard.ts) must stay reachable by the personas that need each route, and
 * closed to the ones that don't.
 *
 * Why this file exists: the Miniflare integration suite runs with
 * `ADMIN_EMAILS: ""` + `ENVIRONMENT: "development"` (apps/api/vitest.config.ts),
 * which makes every signed-in test user a platform admin — and route-guard
 * short-circuits the action gate for platform admins. So NO integration test can
 * observe an action-gate regression, which is exactly how a total client lockout
 * shipped: `PATCH /api/clients/:id` required `client:["update"]`, a resource the
 * `client` role preset deliberately does not carry, so every client 403'd on the
 * first write onboarding makes. These are pure assertions against the same
 * function the guard calls, with the real role presets — no session, no admin
 * bypass, no way to be silently satisfied.
 */
import { describe, it, expect } from "vitest";
import { ROLE_PRESETS, PERMISSION_CATALOG, grantSatisfies } from "@mossa/domain";
import { permissionFor } from "../src/route-guard.js";

/** Would `role` clear the action gate for this request? */
function passes(role: string, method: string, path: string): boolean {
  const perm = permissionFor(method, path);
  if (!perm) return true; // null = any authenticated member
  return grantSatisfies(ROLE_PRESETS[role]!, perm);
}

const CLI = "/api/clients/cli_1";

describe("route gate — the client persona can run its own journey", () => {
  // Each of these is a real call the client app makes; a 403 on any of them
  // dead-ends a screen the client cannot route around.
  const selfService: [string, string, string][] = [
    ["onboarding finish / profile edit", "PATCH", CLI],
    ["avatar upload", "POST", `${CLI}/avatar`],
    ["lane switch", "PATCH", `${CLI}/current-variant`],
    ["read own record", "GET", CLI],
    ["log a workout set", "POST", "/api/logs/workout-sets"],
    ["log food", "POST", "/api/logs/food"],
    ["log water", "POST", "/api/logs/water"],
    ["submit a check-in", "POST", "/api/check-ins"],
    ["log a measurement", "POST", "/api/measurements"],
    ["toggle a supplement", "POST", "/api/supplements/sup_1/log"],
    ["start/stop a fast", "POST", "/api/fasting"],
    ["request an exercise swap", "POST", "/api/swaps"],
    ["read own published plan", "GET", "/api/workout-plans"],
    ["read the content hub", "GET", "/api/content"],
    ["use an AI meal tool", "POST", "/api/ai/parse-food"],
    // The read fan-outs behind the client's own screens. Each of these was a
    // production 403: Wellness issues the supplements/labs reads and Plans &
    // access issues the packages read, both inside an uncaught Promise.all, so a
    // 403 left a permanent loading skeleton rather than an error.
    ["see their prescribed supplements", "GET", "/api/supplements"],
    ["see their supplement log history", "GET", "/api/supplements/logs"],
    ["see their lab requests", "GET", "/api/labs"],
    ["see what the studio sells", "GET", "/api/packages"],
    ["see their booked sessions", "GET", "/api/sessions"],
    ["see their goal targets", "GET", "/api/clients/cli_1/goals"],
    ["redeem an access code", "POST", "/api/redeem"],
  ];

  for (const [label, method, path] of selfService) {
    it(`client can ${label} (${method} ${path})`, () => {
      expect(passes("client", method, path)).toBe(true);
    });
  }
});

describe("route gate — roster and studio management stay staff-only", () => {
  const staffOnly: [string, string, string][] = [
    ["create a client", "POST", "/api/clients"],
    ["archive a client", "POST", `${CLI}/archive`],
    ["permanently delete a client", "POST", `${CLI}/delete`],
    ["assign a coach", "POST", `${CLI}/trainers`],
    ["unassign a coach", "DELETE", `${CLI}/trainers/u_1`],
    ["set a client's default lane", "PATCH", `${CLI}/default-lane`],
    ["create a plan variant", "POST", `${CLI}/variants`],
    ["publish a workout plan", "POST", "/api/workout-plans/wp_1/publish"],
    ["write a goal", "PATCH", "/api/clients/cli_1/goals"],
    ["prescribe a supplement", "POST", "/api/supplements"],
    ["order a lab", "POST", "/api/labs"],
  ];

  for (const [label, method, path] of staffOnly) {
    it(`client cannot ${label} (${method} ${path})`, () => {
      expect(passes("client", method, path)).toBe(false);
    });
  }

  it("staffing a client is owner-only, but any coaching role can see who is assigned", () => {
    // A trainer holds client:["update"], so gating the assign/unassign routes on
    // that let an assigned coach staff other coaches onto their own client and
    // move the is_primary flag that routes notifications. Reads stay open.
    expect(passes("owner", "POST", `${CLI}/trainers`)).toBe(true);
    expect(passes("owner", "DELETE", `${CLI}/trainers/u_1`)).toBe(true);
    for (const role of ["trainer", "assistant", "client"]) {
      expect(passes(role, "POST", `${CLI}/trainers`), `${role} assigns a coach`).toBe(false);
      expect(passes(role, "DELETE", `${CLI}/trainers/u_1`), `${role} unassigns a coach`).toBe(false);
    }
    expect(passes("trainer", "GET", `${CLI}/trainers`)).toBe(true);
    expect(passes("assistant", "GET", `${CLI}/trainers`)).toBe(true);
  });

  it("permanently deleting a client is owner-only at the gate, not just in the handler", () => {
    // The generic non-GET /api/clients mapping is `client:["update"]`, which the
    // trainer preset carries — so without an explicit branch an irreversible,
    // storage-reclaiming delete would clear the outer wall for a trainer and rest
    // entirely on the in-handler role check.
    expect(passes("owner", "POST", `${CLI}/delete`)).toBe(true);
    for (const role of ["trainer", "assistant", "client"]) {
      expect(passes(role, "POST", `${CLI}/delete`), `${role} deletes a client`).toBe(false);
    }
  });

  it("only the owner reaches billing, settings and staff management", () => {
    for (const path of ["/api/billing", "/api/settings", "/api/members"]) {
      expect(passes("owner", "PATCH", path)).toBe(true);
      for (const role of ["trainer", "assistant", "client"]) {
        expect(passes(role, "PATCH", path), `${role} → PATCH ${path}`).toBe(false);
      }
    }
  });
});

describe("route gate — the coaching roles keep the powers their preset grants", () => {
  it("a trainer can run the full coaching surface", () => {
    for (const [method, path] of [
      ["POST", "/api/clients"],
      ["PATCH", CLI],
      ["POST", "/api/workout-plans"],
      ["POST", "/api/workout-plans/wp_1/publish"],
      ["PATCH", "/api/clients/cli_1/goals"],
      ["POST", "/api/supplements"],
      ["POST", "/api/labs"],
      ["POST", "/api/exercises"],
      ["GET", "/api/reports/overview"],
    ] as [string, string][]) {
      expect(passes("trainer", method, path), `trainer → ${method} ${path}`).toBe(true);
    }
  });

  it("an assistant runs the front desk but never touches plans or health data", () => {
    expect(passes("assistant", "POST", "/api/sessions")).toBe(true);
    expect(passes("assistant", "PATCH", "/api/sessions/ts_1")).toBe(true);
    expect(passes("assistant", "GET", "/api/clients")).toBe(true);
    for (const [method, path] of [
      ["POST", "/api/workout-plans"],
      ["POST", "/api/supplements"],
      ["POST", "/api/labs"],
      ["PATCH", CLI],
    ] as [string, string][]) {
      expect(passes("assistant", method, path), `assistant → ${method} ${path}`).toBe(false);
    }
  });
});

describe("route gate — every mapping is satisfiable by some role", () => {
  // A mapping no role can satisfy is dead on arrival: the route 403s for
  // everyone, forever. That is what a misspelled resource key looks like —
  // `{clients:["update"]}` instead of `{client:["update"]}` passes typechecking
  // (the type is Record<string,string[]>) and fails silently at runtime for every
  // persona including the owner. Owner-only routes are legitimate, so the owner
  // counts here; the persona-specific expectations live in the suites above.
  const paths: [string, string][] = [
    ["PATCH", CLI],
    ["POST", `${CLI}/avatar`],
    ["PATCH", `${CLI}/current-variant`],
    ["POST", "/api/clients"],
    ["POST", `${CLI}/archive`],
    ["POST", "/api/logs/workout-sets"],
    ["POST", "/api/check-ins"],
    ["POST", "/api/measurements"],
    ["POST", "/api/supplements/sup_1/log"],
    ["POST", "/api/swaps"],
    ["POST", "/api/workout-plans"],
    ["POST", "/api/sessions"],
    ["POST", "/api/packages"],
    ["POST", "/api/content"],
    ["POST", "/api/ai/parse-food"],
  ];

  for (const [method, path] of paths) {
    it(`${method} ${path} is reachable by at least one role`, () => {
      const perm = permissionFor(method, path);
      if (!perm) return; // open to any member
      const reachable = Object.keys(ROLE_PRESETS).some((r) => grantSatisfies(ROLE_PRESETS[r]!, perm));
      expect(reachable, `no role at all satisfies ${JSON.stringify(perm)} — dead route`).toBe(true);
    });
  }

  it("every resource the gate names is a real catalogue resource", () => {
    // The other half of the typo trap: a resource key absent from
    // PERMISSION_CATALOG can never be granted, so the route is unreachable.
    const probes: [string, string][] = [
      ...paths,
      ["GET", CLI],
      ["GET", "/api/supplements"],
      ["GET", "/api/labs"],
      ["GET", "/api/sessions"],
      ["GET", "/api/packages"],
      ["PATCH", "/api/billing"],
      ["PATCH", "/api/settings"],
      ["PATCH", "/api/members"],
      ["GET", "/api/reports/overview"],
      ["POST", "/api/exercises"],
      ["POST", "/api/labs"],
      ["PATCH", "/api/clients/cli_1/goals"],
    ];
    for (const [method, path] of probes) {
      const perm = permissionFor(method, path);
      if (!perm) continue;
      for (const [resource, actions] of Object.entries(perm)) {
        expect(PERMISSION_CATALOG[resource], `${method} ${path} names unknown resource "${resource}"`).toBeDefined();
        for (const action of actions) {
          expect(PERMISSION_CATALOG[resource], `${method} ${path}: ${resource}.${action}`).toContain(action);
        }
      }
    }
  });
});
