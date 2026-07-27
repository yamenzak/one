/**
 * THE row-level invariant, enforced by reading the API's source.
 *
 * `resolveStanding` decides what a person may do in a tenancy, but a policy is
 * only worth what its chokepoint is worth: every client-scoped write in the API
 * has to pass through `requireClientAccess`, because that is the ONE place the
 * standing is consulted. A new route that reads a `clientId` out of its body and
 * writes without it is not a policy question — it is a hole, and no amount of
 * correctness in this package closes it.
 *
 * Read-only mode for an archived client rides entirely on this. So does tenant
 * isolation (owner/assistant = tenant match, coach = assignment, client = own
 * record) and so does the archived read-only rule. One missed call and an
 * archived client can log again, or worse, a coach can write to a client who
 * isn't theirs.
 *
 * This lives in @mossa/domain rather than apps/api because the api suite runs in
 * workerd, which has no `node:fs` — and because domain owns the policy whose
 * chokepoint this is.
 *
 * ── Escaping it ──
 * Some client-scoped writes are correctly guarded by something STRICTER instead:
 * an owner-only or staff-only check a client can never pass. Those are listed
 * explicitly in ALTERNATIVE_GUARDS with the guard they use, so the exemption is
 * a decision on the record rather than an oversight.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const API_SRC = new URL("../../../apps/api/src", import.meta.url).pathname;

const WRITE_VERBS = new Set(["post", "patch", "put", "delete"]);

/**
 * Routes that touch a client id but are guarded by a STRICTER check, so
 * `requireClientAccess` would be redundant. Each entry names the guard, and the
 * test verifies that guard is actually present — an entry whose stated guard has
 * been removed fails rather than silently excusing the route.
 */
const ALTERNATIVE_GUARDS: Record<string, string> = {
  // The owner's decision on a coach's offboarding request. OWNER-only, and the
  // request row is fetched `WHERE id = ? AND tenant_id = ?` — it acts on a request,
  // not on a client record, and a client can never reach it. It shows up here only
  // because it names `clientId` when writing the audit entry.
  "POST /offboard-requests/:id/decide": 'if (c.get("role") !== "owner")',
  // Publishing a content resource is a staff action; `clientId` appears only in
  // the assignment fan-out.
  "POST /resources/:id/publish": "staffOnly(c)",
};

interface Route { verb: string; path: string; file: string; body: string }

function routes(): Route[] {
  const out: Route[] = [];
  for (const name of readdirSync(API_SRC)) {
    if (!name.endsWith(".ts")) continue;
    const src = readFileSync(join(API_SRC, name), "utf8");
    // The quoted string must start with "/" — a route path. Without that anchor
    // this also matches `c.get("role")` and `c.get("user")`, which truncated a
    // handler's body right before its guard and produced a false "hole". A
    // conformance test that mis-parses invents findings, which is worse than one
    // that finds nothing: it sends you looking for a bug that is not there.
    const starts = [...src.matchAll(/\.(get|post|patch|put|delete)\(\s*"(\/[^"]*)"/g)];
    starts.forEach((m, i) => {
      const verb = m[1]!;
      const path = m[2]!;
      const from = m.index! + m[0].length;
      const to = starts[i + 1]?.index ?? src.length;
      out.push({ verb, path, file: name, body: src.slice(from, to) });
    });
  }
  return out;
}

/** A write that resolves a client id — the surface the row guard must cover. */
function clientScopedWrites(all: Route[]): Route[] {
  return all.filter(
    (r) =>
      WRITE_VERBS.has(r.verb) &&
      // Platform-admin routes are governed by isPlatformAdmin, and webhooks by
      // signature verification + account→tenant mapping; neither is a member lane.
      !r.path.startsWith("/admin") &&
      !r.path.includes("webhook") &&
      /\bclientId\b/.test(r.body),
  );
}

const key = (r: Route) => `${r.verb.toUpperCase()} ${r.path}`;

describe("row-level access is the chokepoint for every client-scoped write", () => {
  const all = routes();

  it("reads the real API source (a lint that reads nothing passes vacuously)", () => {
    expect(all.length).toBeGreaterThan(150);
    expect(clientScopedWrites(all).length).toBeGreaterThan(40);
  });

  it("every client-scoped write calls requireClientAccess, or a stricter guard on the record", () => {
    const holes: string[] = [];
    for (const r of clientScopedWrites(all)) {
      if (r.body.includes("requireClientAccess")) continue;
      const alt = ALTERNATIVE_GUARDS[key(r)];
      if (alt && r.body.includes(alt)) continue;
      holes.push(`${key(r)}  (${r.file})${alt ? ` — declares guard \`${alt}\` but it is not in the handler` : ""}`);
    }
    expect(
      holes,
      `client-scoped write with no row-level guard — an archived client could write through it, and a coach could reach a client who is not theirs:\n  ${holes.join("\n  ")}\n`,
    ).toEqual([]);
  });

  it("the exemption list is honest — every entry still exists and still needs it", () => {
    const writes = clientScopedWrites(all);
    for (const [k, guard] of Object.entries(ALTERNATIVE_GUARDS)) {
      const r = writes.find((x) => key(x) === k);
      expect(r, `${k} is on the exemption list but is no longer a client-scoped write — remove it`).toBeTruthy();
      // If it has since gained the real guard, the exemption is dead weight.
      expect(
        r!.body.includes("requireClientAccess"),
        `${k} now calls requireClientAccess — drop it from ALTERNATIVE_GUARDS`,
      ).toBe(false);
      expect(r!.body.includes(guard), `${k} declares guard \`${guard}\` which is not present`).toBe(true);
    }
  });

  it("requireClientAccess is the only definition, and it consults resolveStanding", () => {
    // Two implementations of the row guard would be two policies. And the guard is
    // worthless to read-only mode if it does not actually ask the policy.
    const clients = readFileSync(join(API_SRC, "clients.ts"), "utf8");
    const definitions = [...clients.matchAll(/export async function requireClientAccess/g)];
    expect(definitions.length, "requireClientAccess must be defined exactly once").toBe(1);
    expect(clients.includes("resolveStanding"), "the row guard must consult resolveStanding").toBe(true);
  });
});
