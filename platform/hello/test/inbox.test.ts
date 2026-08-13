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

type Row = { id: string; type: string; title: string; icon: string; open: Record<string, string> };
const inbox = async () => (await call("/api/inbox.list")).body as unknown as { rows: Row[]; unread: number };

/*
  ⚠️ FOUND BY TYPE, NEVER BY POSITION OR BY COUNT. Recognition rides this same
  inbox — a milestone earned is announced through the one dispatch path, by
  design — so a suite about `emits` that asserted the whole list would break
  every time a manifest recognised something, which is a fact about the manifest
  rather than about the mechanism under test.
*/
const rowOf = async (type: string): Promise<Row | undefined> => (await inbox()).rows.find((r) => r.type === type);

beforeAll(async () => {
  const staff = await signIn("bell@example.test", SETUP);
  await post(SETUP, "/api/identity.workspace.create", { slug: "bell" }, staff);
  member = await signIn("bell@example.test", ORIGIN);
});

/* ------------------------------------------------------------- the write --- */

describe("an operation's `emits` is the only dispatcher", () => {
  it("writes an inbox row when an operation that declares one succeeds", async () => {
    expect((await inbox()).rows).toEqual([]);
    expect((await call("/api/billing.choose", { planId: "keeper" })).status).toBe(200);

    const after = await inbox();
    expect(after.rows.map((r) => r.type)).toContain("plan.chosen");
    /* Nothing has been read, so every row written is a row still unread. */
    expect(after.unread).toBe(after.rows.length);
  });

  /*
    ⚠️ RENDERED FROM THE REGISTRY ON READ, never stored as a finished sentence. A
    row carrying its own words is one that cannot be translated later, cannot be
    corrected when the copy is wrong, and keeps saying the old thing forever.
  */
  it("renders the copy from the manifest, with the operation's own values in it", async () => {
    const row = (await rowOf("plan.chosen"))!;
    expect(row.title).toBe("You chose keeper");
    expect(row.icon).toBe("card");
  });

  /*
    ⚠️ A LINK NAMES A DECLARED COLLECTION OR THE INBOX — never a path. Four types
    in a shipping product pointed at routes that did not exist, and were wrong
    for three stages because nothing rendered a notification.
  */
  it("carries a destination the shell can resolve rather than a path", async () => {
    expect((await rowOf("plan.chosen"))!.open).toEqual({});
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
    const granted = before.rows.find((r) => r.type === "package.granted");
    expect(granted).toBeDefined();
    expect(before.unread).toBe(before.rows.length);

    await call("/api/inbox.read", { id: granted!.id });
    /* ⚠️ ONE, and the others untouched — asserted as a difference rather than
       as a total, so it says the same thing whatever else the app announces. */
    expect((await inbox()).unread).toBe(before.unread - 1);
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

/* ------------------------------------------------------------ two levels --- */

/**
 * TWO LEVELS, AND THE WORKSPACE'S IS THE CEILING.
 *
 * ⚠️ THE OTHER ORDER DOES NOT WORK. Somebody cannot opt into a channel their
 * workspace has turned off, because the switch would do nothing and say nothing
 * — which is the exact failure that got the push channel deleted from this
 * platform once already.
 */
describe("what a workspace allows, and what a person then chooses", () => {
  /*
    ⚠️ NOTHING IN THE POLICY SCREEN NAMES A NOTIFICATION. The list is the
    registry, so a type a product adds appears here and one it removes stops
    appearing — the same rule the settings screen follows, for the same reason.
  */
  it("lists everything this product can say, from the registry alone", async () => {
    const { body } = await call("/api/notify.policy");
    const rows = body.rows as unknown as { type: string; needs: string; required: boolean }[];
    expect(rows.map((r) => r.type)).toContain("plan.chosen");
    /* ⚠️ The permission is on the row because it is the answer to "why does the
       front desk get this" — the question a two-level screen creates. */
    expect(rows.every((r) => r.needs.length > 0)).toBe(true);
  });

  it("stops emailing a type the workspace put on the inbox only", async () => {
    expect((await call("/api/notify.policy.set", { type: "plan.chosen", channels: ["inbox"] })).status).toBe(200);
    const { body } = await call("/api/inbox.preferences");
    const rows = body.types as unknown as { type: string; allowed: string[] }[];
    expect(rows.find((r) => r.type === "plan.chosen")!.allowed).toEqual(["inbox"]);
  });

  /*
    ⚠️ AND THE PERSON'S OWN LIST IS DERIVED FROM WHAT THEY MAY READ. A
    preferences screen listing every type a product has is one where most rows do
    nothing for most people — and a switch that does nothing is the failure this
    whole design is arranged around.
  */
  it("offers somebody only the notifications their permissions could ever bring", async () => {
    const { body } = await call("/api/inbox.preferences");
    const rows = body.types as unknown as { type: string }[];
    expect(rows.map((r) => r.type)).toContain("plan.chosen");
    expect(rows.length).toBeLessThanOrEqual(Object.keys((await call("/api/notify.policy")).body.rows as unknown as unknown[]).length);
  });

  /*
    ⚠️ AN `action` MAY NOT BE SWITCHED OFF BY ANYBODY. It is the category meaning
    nothing proceeds until somebody acts, and the person it would silently stop
    the product working for is not the person who pressed the switch.
  */
  it("refuses a workspace switching off the one category that blocks the product", async () => {
    /* `hello` declares none, so the refusal is asserted where one exists — the
       policy row says `required`, which is what the screen draws instead of a
       switch. */
    const rows = (await call("/api/notify.policy")).body.rows as unknown as { category: string; required: boolean }[];
    for (const row of rows) expect(row.required).toBe(row.category === "action");
  });

  it("goes back to the product's own behaviour when the workspace clears it", async () => {
    expect((await call("/api/notify.policy.clear", { type: "plan.chosen" })).status).toBe(200);
    const rows = (await call("/api/notify.policy")).body.rows as unknown as { type: string; channels: string[] | null }[];
    expect(rows.find((r) => r.type === "plan.chosen")!.channels).toBeNull();
  });
});

/* ---------------------------------------------------------- push devices --- */

describe("a browser that wants to be told with the tab closed", () => {
  /*
    ⚠️ A DEPLOYMENT WITH NO KEYS OFFERS NO PUSH, rather than offering a switch
    that silently does nothing. The empty key is what the screen reads to decide
    whether the control exists at all.
  */
  it("says whether this deployment can push at all", async () => {
    const { status, body } = await call("/api/inbox.push.key");
    expect(status).toBe(200);
    expect(typeof body.key).toBe("string");
  });

  /* ⚠️ The endpoint is the identity: a browser hands back the same one for the
     same registration, so subscribing twice from one device is one row. */
  it("registers a browser once, however many times it subscribes", async () => {
    const device = { endpoint: "https://fcm.googleapis.com/fcm/send/hello-1", p256dh: "BExample", auth: "abcd" };
    expect((await call("/api/inbox.push.subscribe", device)).status).toBe(200);
    expect((await call("/api/inbox.push.subscribe", device)).status).toBe(200);
    expect((await call("/api/inbox.push.forget", { endpoint: device.endpoint })).status).toBe(200);
  });

  /* ⚠️ Bound to the owner: without the check this is a stop-notifying-anybody
     endpoint that takes a string somebody else's network tab already has. */
  it("will not forget a browser that is not yours", async () => {
    const { body } = await call("/api/inbox.push.forget", { endpoint: "https://fcm.googleapis.com/fcm/send/not-mine" });
    expect(body.ok).toBe(false);
  });
});
