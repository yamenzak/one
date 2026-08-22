/**
 * WHAT A WRITE SAYS WHEN IT WORKED, AND WHAT IT MAKES STALE.
 *
 * ⚠️ THE OPERATION SAYS IT, NEVER THE SCREEN. `outcome` was declared by four of
 * the reference app's operations and read by nothing — so every successful write
 * in the product was silent, and every list a write changed stayed a round trip
 * out of date until somebody navigated away and back.
 *
 * ⚠️ AND THE DOOR APPLIES IT, WHICH IS WHY THE ASSERTIONS ARE HERE. Left to the
 * screens, two screens calling one operation are two answers to what just
 * happened, and the reads a write invalidates are usually on neither of them.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Outcome } from "@engine/kernel";

let answer: () => { status: number; body?: unknown } | null;

beforeEach(() => {
  answer = () => ({ status: 200, body: { ok: true } });
  vi.stubGlobal("fetch", () => {
    const out = answer();
    if (!out) return Promise.reject(new TypeError("Failed to fetch"));
    return Promise.resolve(new Response(JSON.stringify(out.body), {
      status: out.status,
      headers: { "content-type": "application/json" },
    }));
  });
  vi.resetModules();
});

/**
 * ⚠️ THE CENTRE'S OWN ANSWER, because that is how the book actually arrives. A
 * test that installed the outcomes by hand would prove the door applies what it
 * was given and never that anything gives it — which is exactly the state
 * `outcome` was in.
 */
const centre = {
  tenant: { name: "Northwind", slug: "northwind" },
  you: { accountId: "a1", email: null, platformRole: "owner", appRoles: {}, platform: [] },
  apps: [{
    id: "beacon",
    outcomes: {
      "note.publish": { message: "Published.", tone: "success", invalidates: ["note.list"] },
      "note.retract": { message: "Taken down.", tone: "warning" },
    } as Record<string, Outcome>,
  }],
};

const door = async () => {
  const mod = await import("../src/api.js");
  answer = () => ({ status: 200, body: centre });
  await mod.api.get("centre.view");
  answer = () => ({ status: 200, body: { ok: true } });
  return mod;
};

describe("a write that worked", () => {
  it("says the sentence the operation declared, once", async () => {
    const { api, whenWritten } = await door();
    const said: Outcome[] = [];
    whenWritten((o) => said.push(o));

    await api.post("note.publish", { id: "n1" });

    expect(said).toHaveLength(1);
    expect(said[0]!.message).toBe("Published.");
    /* ⚠️ THE TONE TRAVELS WITH IT. Shown as a success, a `warning` outcome tells
       somebody something went well when the operation said otherwise. */
    expect(said[0]!.tone).toBe("success");
  });

  it("says nothing for an operation that declared nothing", async () => {
    const { api, whenWritten } = await door();
    const said: Outcome[] = [];
    whenWritten((o) => said.push(o));

    await api.post("note.ask", { id: "n1", who: "sam" });

    /* ⚠️ SILENCE IS WHAT AN OPERATION THAT HAS SAID NOTHING MEANS. A default the
       platform invented would put a toast under every generated verb, which on
       an autosaving screen is one per keystroke. */
    expect(said).toHaveLength(0);
  });

  it("says nothing when it did not work", async () => {
    const { api, whenWritten } = await door();
    const said: Outcome[] = [];
    whenWritten((o) => said.push(o));

    answer = () => ({ status: 403, body: { problem: { code: "platform.forbidden" } } });
    const out = await api.post("note.publish", { id: "n1" });

    expect(out.ok).toBe(false);
    /* ⚠️ "Published." over a refusal is the worst sentence this seam could
       produce, and it is one `if` away in every hand-written version. */
    expect(said).toHaveLength(0);
  });

  it("names the reads it made stale", async () => {
    const { api, whenWritten } = await door();
    const stale: string[] = [];
    whenWritten((o) => stale.push(...(o.invalidates ?? [])));

    await api.post("note.publish", { id: "n1" });

    /* ⚠️ THE HALF NO SCREEN CAN DO FOR ITSELF. A screen re-reads itself; the
       answers elsewhere that the same write changed belong to the operation. */
    expect(stale).toEqual(["note.list"]);
  });

  it("says nothing at all before the centre has answered", async () => {
    const mod = await import("../src/api.js");
    const said: Outcome[] = [];
    mod.whenWritten((o) => said.push(o));

    await mod.api.post("note.publish", { id: "n1" });

    /* ⚠️ THE EMPTY BOOK IS THE RIGHT DEFAULT. An operation this door has not
       been told about is one it says nothing for — never one it invents a
       sentence for. */
    expect(said).toHaveLength(0);
  });
});
