/**
 * THE THREE ANSWERS THAT ARRIVE BEFORE THE BUNDLE DOES.
 *
 * ⚠️ THE PAGE ASKS AND THE APPLICATION COLLECTS, AND THOSE ARE TWO FILES. An
 * inline script in `index.html` fires `/health`, `/api/me.who` and
 * `/api/centre.view` while the
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

/**
 * ⚠️ READ OUT OF THE PAGE, KEY AND URL TOGETHER. What makes this pair silent
 * when it breaks is that either half works alone: a page that asks under a name
 * nothing collects makes a real request and throws the answer away, and every
 * test that writes the key by hand passes right through it.
 */
const PREFLIGHTS: readonly (readonly [string, string])[] =
  [...PAGE.matchAll(/"([\w.]+)"\s*:\s*ask\("([^"]+)"\)/g)].map((m) => [m[1]!, m[2]!] as const);

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
  it("is asked by the page itself, on every path, with the session", () => {
    expect(PAGE).toContain("window.__one");
    expect(PAGE).toContain('ask("/health")');
    expect(PAGE).toContain('ask("/api/me.who")');
    /*
      ⚠️ THE CENTRE, WHICH WAITED FOR AN ANSWER IT DOES NOT NEED. `Product` is
      the only thing that reads it and is not rendered until `me.who` has said
      somebody is here — so the request carrying every manifest in the deployment
      did not leave the browser until a whole round trip had been spent, and the
      screen behind it then started its own reads. Live on a phone that was
      4.1s + 2.2s + 2.7s: three waves and nine seconds, over requests that spent
      nine milliseconds of CPU between them.
    */
    expect(PAGE, "the centre still waits for the session to answer")
      .toContain('ask("/api/centre.view")');
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

  /*
    ⚠️ AND THE CENTRE IS COLLECTED UNDER THE NAME THE HOOK ASKS BY. The page
    writes the key and `useCentre` reads by operation id; if those two ever drift
    the request is still made, still answered and still thrown away, and the only
    symptom is the wave coming back — which is exactly the failure this file
    exists to make loud rather than silent.
  */
  it("answers the centre from the page's own request", async () => {
    /* ⚠️ KEYED THE WAY THE PAGE KEYS IT, NOT THE WAY THIS TEST WOULD. Writing
       the key by hand tests that the collector works and says nothing about
       whether the page and the collector agree — and disagreeing is silent: the
       request is made, answered, and thrown away, with the only symptom a wave
       nobody can see coming back. */
    (globalThis as { __one?: unknown }).__one = Object.fromEntries(
      PREFLIGHTS.map(([key]) => [key, flying({ tenant: { name: "Acme", slug: "acme" } })]));
    const got = await api.get<{ tenant: { slug: string } }>("centre.view");
    expect(got.ok && got.value.tenant.slug).toBe("acme");
    expect(asked, "it went to the network anyway").toEqual([]);
  });

  /* ⚠️ AND THE KEY IS THE OPERATION'S OWN ID. `early` looks a preflight up by
     the id the caller asked for, so a key that is not the path's operation is a
     request made, answered and dropped. */
  it("names each preflight by the operation the door will ask for", () => {
    for (const [key, url] of PREFLIGHTS) {
      const wanted = key === "health" ? "/health" : `/api/${key}`;
      expect(url, `the page asks ${url} under the key "${key}"`).toBe(wanted);
    }
  });

  /*
    ⚠️ AND A REFUSED PREFLIGHT IS NOT AN ANSWER. The centre is asked for on every
    door, including the ones that have no centre — which door this is comes from
    `/health`, and waiting to find out would put back the wave this removes. A
    refusal kept and handed to the first screen that asks would turn a door that
    simply has no product into a product that failed to load.
  */
  it("asks for real after the page's request was refused", async () => {
    (globalThis as { __one?: unknown }).__one = {
      "centre.view": flying({ problem: { code: "platform.not_found" } }, 404),
    };
    const first = await api.get("centre.view");
    expect(first.ok).toBe(false);
    const again = await api.get<{ from: string }>("centre.view");
    expect(again.ok && again.value.from).toBe("the network");
    expect(asked).toEqual(["/api/centre.view"]);
  });

  /*
    ⚠️ AND SIGNING IN THROWS ALL OF THEM AWAY. Every preflight was taken before
    there was a session, and the centre's is read by the first screen that wants
    it — which is AFTER somebody has signed in. Kept, its answer is the 401 the
    page got while nobody was here, and a 401 outside `NOT_AN_EXPIRY` is read as
    an expired session: somebody signs in and is signed straight back out, once,
    with the cookie already set.
  */
  it("throws every preflight away when somebody signs in", async () => {
    (globalThis as { __one?: unknown }).__one = {
      "centre.view": flying({ problem: { code: "platform.unauthorised" } }, 401),
    };
    await api.post("me.session", { email: "sam@example.com", code: "123456" });

    const got = await api.get<{ from: string }>("centre.view");
    expect(got.ok && got.value.from,
      "the centre answered from a request taken before the sign-in").toBe("the network");
    expect(asked).toEqual(["/api/me.session", "/api/centre.view"]);
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
