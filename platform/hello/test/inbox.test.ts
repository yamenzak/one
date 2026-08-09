/**
 * THE INBOX, END TO END — and the property it exists for.
 *
 * ⚠️ A MECHANISM WITH NO SURFACE IS THE FAILURE THIS PLATFORM WAS STARTED OVER.
 * A shipping product had the schema, the durable object, the routes and sixteen
 * dispatch sites wired for three stages with nothing a person could look at, so
 * a notification was reachable at an endpoint and nowhere anybody would find it.
 *
 * Nothing in `hello` sends a notification. The manifest declares three, three
 * operations declare `emits`, and the rest is derived.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { post, SETUP, signIn } from "./session.js";

const ORIGIN = "https://bell.hello.4dl.app";
let member = "";

const call = async (path: string, body?: unknown, cookie = member) => {
  const res = await worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env as never,
  );
  return { status: res.status, body: (await res.json()) as Record<string, never> };
};

const inbox = async () => (await call("/api/inbox.list")).body as unknown as { rows: { type: string; title: string; icon: string; open: Record<string, string> }[]; unread: number };

beforeAll(async () => {
  const staff = await signIn("bell@example.test", SETUP);
  await post(SETUP, "/api/identity.workspace.create", { slug: "bell" }, staff);
  member = await signIn("bell-owner@example.test", ORIGIN);
});

/* ------------------------------------------------------------- the write --- */

describe("an operation's `emits` is the only dispatcher", () => {
  it("writes an inbox row when an operation that declares one succeeds", async () => {
    expect((await inbox()).rows).toEqual([]);
    expect((await call("/api/billing.choose", { planId: "keeper" })).status).toBe(200);

    const after = await inbox();
    expect(after.rows.map((r) => r.type)).toEqual(["plan.chosen"]);
    expect(after.unread).toBe(1);
  });

  /*
    ⚠️ RENDERED FROM THE REGISTRY ON READ, never stored as a finished sentence. A
    row carrying its own words is one that cannot be translated later, cannot be
    corrected when the copy is wrong, and keeps saying the old thing forever.
  */
  it("renders the copy from the manifest, with the operation's own values in it", async () => {
    const row = (await inbox()).rows[0]!;
    expect(row.title).toBe("You chose keeper");
    expect(row.icon).toBe("card");
  });

  /*
    ⚠️ A LINK NAMES A DECLARED COLLECTION OR THE INBOX — never a path. Four types
    in a shipping product pointed at routes that did not exist, and were wrong
    for three stages because nothing rendered a notification.
  */
  it("carries a destination the shell can resolve rather than a path", async () => {
    expect((await inbox()).rows[0]!.open).toEqual({});
  });

  it("does not write anything for an operation that declares no event", async () => {
    const before = (await inbox()).rows.length;
    expect((await call("/api/note.create", { title: "quiet" })).status).toBe(200);
    expect((await inbox()).rows.length).toBe(before);
  });
});

/* -------------------------------------------------------------- the read --- */

describe("reading and clearing", () => {
  it("marks one read without touching the others", async () => {
    await call("/api/commerce.package.save", { id: "p1", name: "P1", price: { minor: 100, currency: "EUR" }, flags: {}, budgets: { reading: 1 }, oncePerCustomer: false });
    await call("/api/commerce.grant", { subjectId: "someone", packageId: "p1" });

    const before = await inbox();
    expect(before.unread).toBe(2);

    await call("/api/inbox.read", { id: before.rows[0]!.type === "package.granted" ? (before.rows[0] as unknown as { id: string }).id : (before.rows[1] as unknown as { id: string }).id });
    expect((await inbox()).unread).toBe(1);
  });

  it("marks everything read when asked for nothing in particular", async () => {
    await call("/api/inbox.read", {});
    expect((await inbox()).unread).toBe(0);
  });
});

/* ----------------------------------------------------------- preferences --- */

describe("a preference removes the interruption, never the record", () => {
  /*
    ⚠️ THE INBOX IS NEVER OPTIONAL. Email and push can be declined, filtered, or
    sent to an address somebody has left — so muting a category must remove the
    interruption and leave the record, or "I never got that" has no answer that
    does not depend on a mail provider.
  */
  it("still writes the row for a category the person has muted", async () => {
    expect((await call("/api/inbox.preferences.set", { muted: ["billing"], email: false, push: false })).status).toBe(200);
    const before = (await inbox()).rows.length;

    await call("/api/billing.choose", { planId: "free" });
    const after = await inbox();
    expect(after.rows.length).toBe(before + 1);
    expect(after.rows[0]!.type).toBe("plan.chosen");
  });

  it("reads back what was set", async () => {
    const prefs = (await call("/api/inbox.preferences")).body as unknown as { muted: string[]; email: boolean };
    expect(prefs.muted).toEqual(["billing"]);
    expect(prefs.email).toBe(false);
  });

  it("refuses a category the platform does not have", async () => {
    expect((await call("/api/inbox.preferences.set", { muted: ["gossip"], email: true, push: false })).status).toBe(400);
  });
});
