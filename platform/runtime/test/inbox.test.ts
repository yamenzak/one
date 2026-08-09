/**
 * THE DISPATCHER, against a real database.
 *
 * ⚠️ THE THREE FAILURES HERE ARE ALL SILENT. A notification that reaches the
 * wrong people, one whose interruption throws out of a handler that succeeded,
 * and one carrying a value nobody vetted into copy a person reads — none of them
 * produces an error, and the first is only ever discovered by whoever received
 * something they should not have.
 */

import { describe, expect, it } from "vitest";
import { dispatch, INBOX_SCHEMA, interpolatable, listInbox, setPreferences, type Delivery } from "../src/inbox.js";
import type { Instant, NotificationRegistry, SqlHandle } from "@one/kernel";

/**
 * The smallest store that behaves like the one in production for these queries.
 *
 * ⚠️ A FAKE, AND THE LIMIT IS STATED: it answers the four statements this module
 * issues and nothing else. The end-to-end behaviour is asserted in `hello`
 * against a real database — this file is about the DECISIONS, which a real
 * database would not make any more visible.
 */
function store(): SqlHandle & { rows: Record<string, unknown>[] } {
  const rows: Record<string, unknown>[] = [];
  const prefs = new Map<string, { muted_json: string; email: number; push: number }>();
  return {
    rows,
    async run(sql: string, ...p: readonly unknown[]) {
      if (sql.includes("INSERT INTO inbox_prefs")) {
        prefs.set(`${String(p[0])}:${String(p[1])}`, { muted_json: String(p[2]), email: Number(p[3]), push: Number(p[4]) });
        return;
      }
      if (sql.includes("INSERT INTO inbox ")) {
        rows.push({ id: p[0], tenant_id: p[1], user_id: p[2], type: p[3], values_json: p[4], row_id: p[5], read_at: null, at: p[6] });
      }
    },
    async first<T>(sql: string, ...p: readonly unknown[]) {
      if (sql.includes("FROM inbox_prefs")) return (prefs.get(`${String(p[0])}:${String(p[1])}`) ?? null) as T | null;
      if (sql.includes("COUNT(*)")) return { n: rows.filter((r) => r.read_at === null).length } as T;
      return null;
    },
    async all<T>() { return rows as T[]; },
  } as unknown as SqlHandle & { rows: Record<string, unknown>[] };
}

const registry: NotificationRegistry = {
  "thing.happened": {
    category: "activity", tone: "info", icon: "bell",
    title: "{who} did a thing", link: { to: "inbox" }, roles: ["owner"],
  },
  "money.moved": {
    category: "billing", tone: "success", icon: "card",
    title: "{amount} arrived", link: { to: "inbox" }, roles: ["owner", "finance"],
  },
};

const AT = "2026-01-10T00:00:00.000Z" as Instant;
const everyone = [{ userId: "u_owner", role: "owner" }, { userId: "u_guest", role: "guest" }, { userId: "u_finance", role: "finance" }];

/* ------------------------------------------------------------- audience --- */

describe("who is told", () => {
  /*
    ⚠️ THE AUDIENCE COMES FROM THE REGISTRY. A dispatch that names its own
    recipients reaches everybody the day somebody passes the wrong list — and
    both "everybody" and "nobody" have shipped.
  */
  it("tells only the roles the type is for", async () => {
    const db = store();
    const sent = await dispatch({ db, registry, tenantId: "t", type: "thing.happened", audience: everyone, values: { who: "Sam" }, at: AT });
    expect(sent.filter((d) => d.channel === "inbox").map((d) => d.userId)).toEqual(["u_owner"]);
  });

  it("tells every role a type names, and no others", async () => {
    const db = store();
    const sent = await dispatch({ db, registry, tenantId: "t", type: "money.moved", audience: everyone, values: { amount: "€9" }, at: AT });
    expect(sent.filter((d) => d.channel === "inbox").map((d) => d.userId).sort()).toEqual(["u_finance", "u_owner"]);
  });

  it("does nothing at all for a type the registry does not have", async () => {
    const db = store();
    expect(await dispatch({ db, registry, tenantId: "t", type: "ghost", audience: everyone, values: {}, at: AT })).toEqual([]);
    expect(db.rows).toEqual([]);
  });
});

/* ------------------------------------------------------------- channels --- */

describe("the interruption and the record are different things", () => {
  it("writes the row and skips the interruption for a muted category", async () => {
    const db = store();
    await setPreferences(db, "t", "u_owner", { muted: ["billing"], email: true, push: true });
    const sent = await dispatch({ db, registry, tenantId: "t", type: "money.moved", audience: [{ userId: "u_owner", role: "owner" }], values: { amount: "€9" }, at: AT });
    expect(sent.map((d) => d.channel)).toEqual(["inbox"]);
    expect(db.rows.length).toBe(1);
  });

  /*
    ⚠️ A FAILED INTERRUPTION IS NOT A FAILED NOTIFICATION. The inbox row is
    already written and the operation already succeeded; throwing here would
    report a completed change as an error and invite a retry that duplicates it.
  */
  it("survives a sender that throws, having already written the record", async () => {
    const db = store();
    const sent = await dispatch({
      db, registry, tenantId: "t", type: "thing.happened",
      audience: [{ userId: "u_owner", role: "owner" }], values: { who: "Sam" }, at: AT,
      send: async () => { throw new Error("mail is down"); },
    });
    expect(sent.map((d) => d.channel)).toEqual(["inbox", "email"]);
    expect(db.rows.length).toBe(1);
  });

  it("hands the sender the rendered copy rather than the template", async () => {
    const db = store();
    const seen: Delivery[] = [];
    await dispatch({
      db, registry, tenantId: "t", type: "thing.happened",
      audience: [{ userId: "u_owner", role: "owner" }], values: { who: "Sam" }, at: AT,
      send: async (d) => { seen.push(d); },
    });
    expect(seen.map((d) => d.title)).toEqual(["Sam did a thing"]);
  });
});

/* ---------------------------------------------------------------- values --- */

describe("what a notification's copy may say", () => {
  /*
    ⚠️ SCALARS ONLY. A template that could reach an arbitrary object renders
    `[object Object]` at best and carries a value nobody vetted at worst — into
    copy a person reads and that an email sometimes puts in a subject line.
  */
  it("takes strings and numbers from the input and the result, and nothing else", () => {
    expect(interpolatable({ name: "Sam", nested: { secret: "x" } }, { days: 30, list: [1, 2] }))
      .toEqual({ name: "Sam", days: 30 });
  });

  it("lets the result win where both name the same thing", () => {
    expect(interpolatable({ id: "asked" }, { id: "made" })).toEqual({ id: "made" });
  });

  it("copes with anything that is not an object at all", () => {
    expect(interpolatable(null, undefined)).toEqual({});
    expect(interpolatable("text", 7)).toEqual({});
  });
});

/* ----------------------------------------------------------------- read --- */

describe("reading", () => {
  it("renders from the registry and skips a row whose type is gone", async () => {
    const db = store();
    await dispatch({ db, registry, tenantId: "t", type: "thing.happened", audience: [{ userId: "u_owner", role: "owner" }], values: { who: "Sam" }, at: AT });
    db.rows.push({ id: "x", tenant_id: "t", user_id: "u_owner", type: "retired.type", values_json: "{}", row_id: null, read_at: null, at: AT });

    const out = await listInbox(db, registry, "t", "u_owner", 50);
    expect(out.rows.map((r) => r.title)).toEqual(["Sam did a thing"]);
  });

  it("declares its tables so erasure can find them", () => {
    expect(INBOX_SCHEMA.scoped?.tenantTables).toEqual(["inbox", "inbox_prefs"]);
  });
});
