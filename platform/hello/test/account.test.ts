/**
 * THE ACCOUNT CENTRE'S SURFACE — preferences, devices and passkeys.
 *
 * ⚠️ EVERY ONE OF THESE WAS A CONTROL WITH NOWHERE TO WRITE TO. The screens
 * existed and the operations did not: a theme with no column, a language nothing
 * could set, a list of devices no route answered, and a passkey somebody could
 * add and never remove. None of that fails — a control that saves into nothing
 * looks exactly like one that saved.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { post, SETUP, signIn } from "./session.js";

const SLUG = `acct${Math.random().toString(36).slice(2, 8)}`;
const ORIGIN = `https://${SLUG}.hello.4dl.app`;
const ID = "https://id.4dl.app";
const WHO = `me.${SLUG}@example.com`;

let here = "";

const get = async (origin: string, path: string, cookie: string) => {
  const res = await worker.fetch(new Request(`${origin}${path}`, { headers: cookie ? { cookie } : {} }), env as never);
  return { status: res.status, body: (await res.json()) as Record<string, never> };
};
const send = async (origin: string, path: string, cookie: string, body: unknown) => {
  const res = await worker.fetch(
    new Request(`${origin}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
    env as never,
  );
  return { status: res.status, body: (await res.json()) as Record<string, never> };
};

beforeAll(async () => {
  const setup = await signIn(WHO, SETUP);
  await post(SETUP, "/api/identity.workspace.create", { slug: SLUG }, setup);
  here = await signIn(WHO, ORIGIN);
});

/* ---------------------------------------------------------- preferences --- */

describe("preferences", () => {
  /*
    ⚠️ HAPTICS ON AND SOUND OFF, FROM THE COLUMN RATHER THAN FROM A SCREEN. A
    default applied by whichever surface renders first is one that differs
    between a phone and a desktop, and nobody can tell which they last saw.
  */
  it("ships the defaults from the store, not from a screen", async () => {
    const r = await get(ORIGIN, "/api/me.preferences", here);
    expect(r.body.haptics).toBe(true);
    expect(r.body.sound).toBe(false);
    /* ⚠️ `""` is "follow this device", which is a real answer and the default. */
    expect(r.body.theme).toBe("");
  });

  it("answers the same shape signed out, so nothing branches on presence", async () => {
    const r = await get(ORIGIN, "/api/me.preferences", "");
    expect(Object.keys(r.body).sort()).toEqual(["haptics", "layout", "locale", "sound", "theme", "units"]);
  });

  it("saves every one of them", async () => {
    await send(ORIGIN, "/api/me.preferences.set", here, {
      theme: "dark", units: "imperial", locale: "de", sound: true, haptics: false,
    });
    const r = await get(ORIGIN, "/api/me.preferences", here);
    expect(r.body).toMatchObject({ theme: "dark", units: "imperial", locale: "de", sound: true, haptics: false });
  });

  /*
    ⚠️ A SCREEN SAVING ONE PREFERENCE MUST NOT CLEAR THE OTHERS, which is what a
    whole-object write does — and the screens here save one control at a time.
  */
  it("changes only what was sent", async () => {
    await send(ORIGIN, "/api/me.preferences.set", here, { theme: "light" });
    const r = await get(ORIGIN, "/api/me.preferences", here);
    expect(r.body.theme).toBe("light");
    expect(r.body.units).toBe("imperial");
    expect(r.body.locale).toBe("de");
  });

  it("lets somebody go back to following their device", async () => {
    await send(ORIGIN, "/api/me.preferences.set", here, { theme: "" });
    expect((await get(ORIGIN, "/api/me.preferences", here)).body.theme).toBe("");
  });

  /*
    ⚠️ THE ACCOUNT CENTRE HAS ITS OWN SESSION, AND THE SAME PREFERENCES. `id.4dl.app`
    is not under `hello.4dl.app`, so the cookie does not travel — which is the
    design rather than a gap: an account shared across products is a feature and
    a session shared across them is a blast radius. What travels is the ACCOUNT,
    and one platform-scoped passkey is what makes signing in there a tap.
  */
  it("shows the same preferences on the account centre's own session", async () => {
    const mine = await signIn(WHO, ID);
    const r = await get(ID, "/api/me.preferences", mine);
    expect(r.status).toBe(200);
    expect(r.body.units).toBe("imperial");
    expect(r.body.locale).toBe("de");
  });

  it("does not carry this product's session onto the account centre", async () => {
    /* Not a limitation to work around. The cookie is scoped to the app root and
       `id.4dl.app` sits beside it, not under it. */
    expect((await get(ID, "/api/me.preferences", here)).body.units).toBe("");
  });
});

/* --------------------------------------------------------------- devices --- */

describe("where you are signed in", () => {
  it("lists this device and says which one it is", async () => {
    const r = await get(ORIGIN, "/api/me.sessions", here);
    const rows = r.body.sessions as unknown as { id: string; appId: string; current: boolean }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((x) => x.current)).toHaveLength(1);
    expect(rows.every((x) => x.appId === "hello")).toBe(true);
  });

  /*
    ⚠️ THE LIST IS THE GLOBAL DIRECTORY, so it spans products. Signing in on the
    setup door is a second session on a second origin, and a list that showed
    only this app's regional rows would answer a question nobody asked.
  */
  it("spans every origin, because that is what the question means", async () => {
    const rows = (await get(ORIGIN, "/api/me.sessions", here)).body.sessions as unknown as { origin: string }[];
    expect(new Set(rows.map((r) => r.origin)).size).toBeGreaterThan(1);
  });

  /*
    ⚠️ THE WHOLE REASON THE DOOR EXISTS: a list of every device, answered where
    there is no workspace and no membership. Somebody reviewing this is the
    person most likely to have left every workspace they were in.
  */
  it("lists every product's sessions from the account centre, with no workspace at all", async () => {
    const mine = await signIn(WHO, ID);
    const r = await get(ID, "/api/me.sessions", mine);
    expect(r.status).toBe(200);
    const rows = r.body.sessions as unknown as { origin: string }[];
    expect(rows.some((x) => x.origin.includes("hello.4dl.app"))).toBe(true);
    expect(rows.some((x) => x.origin.includes("id.4dl.app"))).toBe(true);
  });

  it("signs one device out, and says how long that takes to reach the rest", async () => {
    const before = (await get(ORIGIN, "/api/me.sessions", here)).body.sessions as unknown as { id: string; current: boolean }[];
    const other = before.find((x) => !x.current)!;
    const r = await send(ORIGIN, "/api/me.session.revoke", here, { id: other.id });
    expect(r.body.ok).toBe(true);
    /* ⚠️ A security control whose delay is a surprise is worse than one that is
       honest about it, so the answer carries the bound. */
    expect(r.body.within).toBe(300);

    const after = (await get(ORIGIN, "/api/me.sessions", here)).body.sessions as unknown as { id: string }[];
    expect(after.some((x) => x.id === other.id)).toBe(false);
  });

  /*
    ⚠️ THE ONE THAT MATTERS. Scoped in the statement rather than checked first —
    a read-then-delete is two statements with a window between them, and the
    window is where a guessed id deletes somebody else's session.
  */
  it("cannot sign out a session that is not yours", async () => {
    const mine = (await get(ORIGIN, "/api/me.sessions", here)).body.sessions as unknown as { id: string }[];
    const stranger = await signIn(`other.${SLUG}@example.com`, ORIGIN);
    const theirs = (await get(ORIGIN, "/api/me.sessions", stranger)).body.sessions as unknown as { id: string }[];

    await send(ORIGIN, "/api/me.session.revoke", stranger, { id: mine[0]!.id });

    const still = (await get(ORIGIN, "/api/me.sessions", here)).body.sessions as unknown as { id: string }[];
    expect(still.some((x) => x.id === mine[0]!.id), "my session survived their revoke").toBe(true);
    expect(theirs.length).toBeGreaterThan(0);
  });

  it("refuses to list anything with no session", async () => {
    expect((await get(ORIGIN, "/api/me.sessions", "")).body.sessions).toEqual([]);
  });
});

/* -------------------------------------------------------------- passkeys --- */

describe("passkeys", () => {
  it("answers an empty list rather than a failure for somebody with none", async () => {
    const r = await get(ORIGIN, "/api/me.passkeys", here);
    expect(r.status).toBe(200);
    expect(r.body.passkeys).toEqual([]);
  });

  it("refuses to remove one that is not yours", async () => {
    const r = await send(ORIGIN, "/api/me.passkey.remove", here, { id: "someone-elses" });
    expect(r.status).toBe(403);
  });
});
