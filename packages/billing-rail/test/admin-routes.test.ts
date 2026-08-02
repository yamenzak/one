/**
 * The dead letter's operator surface.
 *
 * Everything asserted here is about the queue being a RECORD rather than a
 * to-do list. A parked row means a payment landed and nothing was granted, so
 * the interesting behaviours are the ones that stop it being quietly dismissed:
 * a note is mandatory, a second close does not overwrite the first account of
 * what happened, and the payload — the customer id and the amount — is
 * reachable.
 */

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { railAdminRoutes } from "../src/admin-routes.js";

interface Row {
  id: string;
  event_id: string | null;
  event_type: string;
  reason: string;
  candidates: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  payload: string | null;
}

const row = (over: Partial<Row> = {}): Row => ({
  id: "park_1",
  event_id: "evt_1",
  event_type: "invoice.paid",
  reason: "no-app",
  candidates: "[]",
  created_at: "2026-08-02T10:00:00.000Z",
  resolved_at: null,
  resolved_by: null,
  resolution_note: null,
  payload: '{"id":"evt_1","data":{"object":{"customer":"cus_9"}}}',
  ...over,
});

/**
 * A D1 that understands the four shapes these routes issue, and records the
 * UPDATE's bindings so the audit fields can be asserted rather than assumed.
 */
function fakeDb(rows: Row[]) {
  const updates: unknown[][] = [];
  const db = {
    prepare: (sql: string) => {
      const stmt = {
        bind: (...args: unknown[]) => ({
          all: async () => ({
            results: rows.filter((r) => (/resolved_at IS NULL/.test(sql) ? r.resolved_at === null : true)),
          }),
          first: async () => {
            if (/COUNT/.test(sql)) return { n: rows.filter((r) => r.resolved_at === null).length };
            return rows.find((r) => r.id === args[args.length - 1]) ?? null;
          },
          run: async () => {
            updates.push(args);
            const target = rows.find((r) => r.id === args[3]);
            // The route's whole guarantee: `WHERE ... AND resolved_at IS NULL`.
            if (!target || target.resolved_at !== null) return { meta: { changes: 0 } };
            target.resolved_at = String(args[0]);
            target.resolved_by = String(args[1]);
            target.resolution_note = String(args[2]);
            return { meta: { changes: 1 } };
          },
        }),
        all: async () => ({ results: rows }),
        first: async () => (/COUNT/.test(sql) ? { n: rows.filter((r) => r.resolved_at === null).length } : rows[0] ?? null),
      };
      return stmt;
    },
  } as unknown as D1Database;
  return { db, updates, rows };
}

function mount(rows: Row[], opts: { admin?: boolean } = {}) {
  const { db, updates } = fakeDb(rows);
  const app = new Hono().route(
    "/api",
    railAdminRoutes({
      isPlatformAdmin: () => opts.admin !== false,
      operatorRef: () => "ops@4dl.app",
    }) as never,
  );
  const env = { DB: db };
  return {
    updates,
    rows,
    list: (q = "") => app.request(`/api/admin/rail/parked${q}`, {}, env),
    one: (id: string) => app.request(`/api/admin/rail/parked/${id}`, {}, env),
    resolve: (id: string, body: unknown) =>
      app.request(`/api/admin/rail/parked/${id}/resolve`, { method: "POST", body: JSON.stringify(body) }, env),
  };
}

describe("the parked queue", () => {
  it("is operator-only", async () => {
    expect((await mount([row()], { admin: false }).list()).status).toBe(403);
  });

  it("reports the open count alongside the rows", async () => {
    const res = await mount([row(), row({ id: "park_2" })]).list();
    const body = (await res.json()) as { open: number; events: unknown[] };
    expect(body.open).toBe(2);
    expect(body.events).toHaveLength(2);
  });

  /** The list is for scanning; five kilobytes of Stripe JSON per row is not. */
  it("keeps the payload out of the list", async () => {
    const body = (await (await mount([row()]).list()).json()) as { events: Record<string, unknown>[] };
    expect(body.events[0]).not.toHaveProperty("payload");
  });

  /** Everything needed to work out who paid for what. */
  it("serves the payload for one event", async () => {
    const body = (await (await mount([row()]).one("park_1")).json()) as { payload: string };
    expect(body.payload).toContain("cus_9");
  });

  it("404s an id that is not there", async () => {
    expect((await mount([row()]).one("park_nope")).status).toBe(404);
  });
});

describe("closing one", () => {
  it("is operator-only", async () => {
    expect((await mount([row()], { admin: false }).resolve("park_1", { note: "x" })).status).toBe(403);
  });

  /**
   * The rule this surface exists for. "Resolved" with no account of the money
   * converts a known problem into an unknown one, which is worse than leaving
   * the row open — so a blank note is refused rather than accepted.
   */
  it("refuses a blank note, and leaves the event open", async () => {
    for (const body of [{}, { note: "" }, { note: "   " }]) {
      const m = mount([row()]);
      expect((await m.resolve("park_1", body)).status).toBe(400);
      expect(m.rows[0]!.resolved_at).toBeNull();
    }
  });

  it("records who closed it and what they did", async () => {
    const m = mount([row()]);
    expect((await m.resolve("park_1", { note: "  granted 5000 credits to acme; invoice in_1A2B  " })).status).toBe(200);
    expect(m.rows[0]!.resolved_by).toBe("ops@4dl.app");
    expect(m.rows[0]!.resolution_note).toBe("granted 5000 credits to acme; invoice in_1A2B");
  });

  /**
   * 409 and not 404: two operators working the same queue would otherwise
   * overwrite each other's account, and the second note is the one that would
   * survive. The row exists — it is the state that disagrees.
   */
  it("refuses a second close and keeps the first account", async () => {
    const m = mount([row()]);
    await m.resolve("park_1", { note: "granted manually" });
    const res = await m.resolve("park_1", { note: "looked, seemed fine" });
    expect(res.status).toBe(409);
    expect(m.rows[0]!.resolution_note).toBe("granted manually");
  });

  it("refuses a note longer than the column is meant to hold", async () => {
    const m = mount([row()]);
    expect((await m.resolve("park_1", { note: "x".repeat(501) })).status).toBe(400);
    expect(m.rows[0]!.resolved_at).toBeNull();
  });
});
