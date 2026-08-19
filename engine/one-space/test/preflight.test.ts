/**
 * THE TWO ANSWERS THAT ARRIVE BEFORE THE BUNDLE DOES.
 *
 * ⚠️ THE PAGE ASKS AND THE APPLICATION COLLECTS, AND THOSE ARE TWO FILES. An
 * inline script in `index.html` fires `/health` and `/api/me.who` while the
 * browser is still downloading several hundred kilobytes of JavaScript;
 * `api.ts` picks the answers up instead of asking again. Either half alone is
 * silent: a page that asks and nothing that collects is two wasted requests, and
 * a collector with nothing to collect is a branch that never runs. So both are
 * checked here, against the real `index.html`.
 *
 * ⚠️ AND THE SHAPE THAT MATTERS MOST IS THE ONE-SHOT. A `Response` body reads
 * once, and the page's answer was taken before anybody signed in — so a second
 * `me.who` that reused it would leave somebody who has just signed in looking at
 * the signed-out screen, permanently, with the session cookie already set.
 */

import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "../src/api.js";

const PAGE = readFileSync(new URL("../index.html", import.meta.url), "utf8");

/** What the page put there, as the page puts it. */
const flying = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" },
  }));

let asked: string[] = [];
beforeEach(() => {
  asked = [];
  (globalThis as { fetch: unknown }).fetch = async (url: string) => {
    asked.push(String(url));
    return new Response(JSON.stringify({ from: "the network" }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  };
  delete (globalThis as { __one?: unknown }).__one;
});

describe("what the page asked before the bundle arrived", () => {
  /* ⚠️ THE PAGE'S HALF. Without these two lines the collector below is dead
     code — the exact shape this repository keeps having to find. */
  it("is asked by the page itself, on both paths, with the session", () => {
    expect(PAGE).toContain("window.__one");
    expect(PAGE).toContain('ask("/health")');
    expect(PAGE).toContain('ask("/api/me.who")');
    expect(PAGE, "without the cookie the answer is always \"nobody\"")
      .toContain('credentials: "same-origin"');
  });

  it("answers a read from the page's own request rather than the network", async () => {
    (globalThis as { __one?: unknown }).__one = {
      "me.who": flying({ accountId: "acc_1", email: "sam@example.com" }),
    };
    const got = await api.get<{ accountId: string }>("me.who");
    expect(got.ok && got.value.accountId).toBe("acc_1");
    expect(asked, "it went to the network anyway").toEqual([]);
  });

  it("answers /health the same way", async () => {
    (globalThis as { __one?: unknown }).__one = { health: flying({ ok: true, door: "account" }) };
    const got = await api.health();
    expect(got.ok && got.value.door).toBe("account");
    expect(asked).toEqual([]);
  });

  /*
    ⚠️ ONCE. This is the assertion that stops a signed-in person seeing the
    signed-out screen: the page's answer was taken before there was a session, so
    reusing it after `me.session` would report "nobody" for the life of the tab.
  */
  it("is used once, and the next ask is a real request", async () => {
    (globalThis as { __one?: unknown }).__one = { "me.who": flying({ accountId: "acc_1" }) };
    await api.get("me.who");
    const again = await api.get<{ from: string }>("me.who");
    expect(again.ok && again.value.from).toBe("the network");
    expect(asked).toEqual(["/api/me.who"]);
  });

  /* ⚠️ A HEAD START, NEVER A DEPENDENCY. A page served without the script, or
     one whose preflight lost the network, behaves exactly as it did before any
     of this existed. */
  it("asks for real when the page asked and failed", async () => {
    (globalThis as { __one?: unknown }).__one = { "me.who": Promise.resolve(null) };
    const got = await api.get<{ from: string }>("me.who");
    expect(got.ok && got.value.from).toBe("the network");
  });

  it("asks for real when there was no preflight at all", async () => {
    const got = await api.get<{ from: string }>("me.who");
    expect(got.ok && got.value.from).toBe("the network");
    expect(asked).toEqual(["/api/me.who"]);
  });

  /* ⚠️ AND NOTHING ELSE MAY BE ANSWERED THIS WAY. The page asks two questions;
     a write, or a read with input, that found a preflight under its own name
     would be answering with somebody else's request. */
  it("never answers a write from a preflight", async () => {
    (globalThis as { __one?: unknown }).__one = { "me.code": flying({ sent: true }) };
    await api.post("me.code", { email: "sam@example.com" });
    expect(asked).toEqual(["/api/me.code"]);
  });
});
