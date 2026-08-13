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
import { sql, type ResolvedRegion } from "@one/kernel";
import { bindingsFor } from "@one/runtime";

const SLUG = `acct${Math.random().toString(36).slice(2, 8)}`;
const ORIGIN = `https://${SLUG}.hello.4dl.app`;
/*
  ⚠️ THE TWO TESTS BELOW THAT SIGN IN HERE FAIL INTERMITTENTLY IN A FULL-SUITE
  RUN AND NEVER ON THIS FILE'S OWN FILTER. The worker logs `mail:no_sender`, so
  the sign-in code could not be sent — while `seedMail` has already written
  `email.from` and awaited it. A row that is present and read as absent is a
  cache, not a race in the fixture, and the honest state is that nobody has
  found which one yet.
*/
// DEFER(one-187) stage:7 — `mail:no_sender` on the identity door under a full
//   run only, with the config row written and awaited. Narrowed: `readAll` holds
//   no cache, so the row is genuinely absent to the worker. `booted` in
//   createRuntime is module-level and survives across test FILES while Miniflare
//   storage does not — the hazard this fixture's own header warns about. Not
//   proven; the mechanism is still open.
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
  it("shows the same preferences on the hub's own session", async () => {
    const mine = await signIn(WHO, ID);
    const r = await get(ID, "/api/me.preferences", mine);
    expect(r.status).toBe(200);
    expect(r.body.units).toBe("imperial");
    expect(r.body.locale).toBe("de");
  });

  it("does not carry this product's session onto the hub", async () => {
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
  it("lists every product's sessions from the hub, with no workspace at all", async () => {
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

/* ------------------------------------------------------- what you owe --- */

describe("what a person is asked to agree to", () => {
  /*
    ⚠️ AN OBLIGATION FOLLOWS A ROLE, AND NO MEMBERSHIP IS NO ROLE. The account
    door has no workspace, so nobody has a role on it — and the runtime used to
    call every signed-in person an owner there. `hello` asks only its OWNER to
    accept its terms, so a person who is in no workspace at all was told they
    owed them, and was answered 451 on their own preferences until they agreed.

    ⚠️ IT IS THE CONSENT LEDGER THAT MAKES THIS MATTER RATHER THAN THE UX. An
    acceptance recorded against somebody who was never the person the document is
    for is a row that satisfies an obligation and refers to nothing — which is the
    one property the ledger exists to deny.
  */
  const NOBODY = `nobody.${SLUG}@example.com`;

  const clean = async () => {
    const cookie = await signIn(NOBODY, ID);
    /*
      ⚠️ THIS ONE ACCOUNT'S ROWS, NEVER THE TABLE. `signIn` accepts on every
      test's behalf so nothing here is blocked by the gate, and undoing that is
      the only way to assert the runtime rather than the helper — but a bare
      `DELETE FROM consents` un-accepts every OTHER account in this file, and
      twenty sibling tests fail somewhere else with a 451 nobody can trace back.
    */
    const db = bindingsFor({ db: sql() }, { DB: (env as Record<string, unknown>).DIRECTORY }, { defaultRegion: "auto" })("auto" as ResolvedRegion).db;
    const who = await db.first<{ id: string }>(`SELECT id FROM accounts WHERE email = ?`, NOBODY.toLowerCase());
    await db.run(`DELETE FROM consents WHERE account_id = ?`, who!.id);
    return cookie;
  };

  it("asks an owner's documents of owners, and not of somebody in no workspace", async () => {
    const cookie = await clean();
    const r = await get(ID, "/api/legal.list", cookie);
    const owed = (r.body.outstanding as unknown as { id: string }[]).map((d) => d.id);
    /*
      ⚠️ WHAT THE DEPLOYMENT ASKS, AND NOT WHAT THE APP DOES. `hello` asks its
      terms of its OWNER; this person is nobody's owner. The account documents are
      owed for having an account at all, which is the one obligation reaching
      somebody in no product — and before they existed this returned nothing,
      which meant an address and a passkey held against nothing agreed.
    */
    expect(owed).toContain("account-terms");
    expect(owed).toContain("account-privacy");
    expect(owed).not.toContain("terms");
    /* And the documents are still published — withheld obligation, not withheld text. */
    expect((r.body.documents as unknown as unknown[]).length).toBeGreaterThan(0);
  });

  it("refuses a write anywhere until the account's own terms are accepted", async () => {
    /*
      ⚠️ THE GATE READ THE APP'S DOCUMENTS AND NOT THE DEPLOYMENT'S, so every
      product's terms were enforced and none of the platform's. The account's are
      owed for HAVING an account — an address, a passkey, a vault — and are asked
      of `ACCOUNT_HOLDER` rather than of a role inside a product, which is exactly
      the set an app's declaration structurally cannot reach.
    */
    const cookie = await clean();
    const before = await send(ID, "/api/me.preferences.set", cookie, { theme: "dark" });
    expect(before.status).toBe(451);
    expect(before.body.code).toBe("platform.consent_required");
    /* ⚠️ AND IT NAMES WHAT IS IN THE WAY, so the refusal can be sent somewhere.
       The documents are on the problem's `meta`, which is what a screen reads to
       decide where to take somebody — a code alone is a dead end with a citation. */
    expect(JSON.stringify(before.body)).toContain("account-terms");
  });

  it("lets them use their own account once the account's own terms are accepted", async () => {
    /* ⚠️ 451 IS THE SYMPTOM THIS EXISTS TO CATCH. It is not a permission failure
       and does not read like one — "There is something to read first", about a
       document that was never theirs. */
    const cookie = await clean();
    /* ⚠️ THE ACCOUNT'S OWN, WHICH THEY DO OWE. The point is that they are held to
       what is theirs rather than to an owner's — accepting these is enough. */
    for (const id of ["account-terms", "account-privacy"]) {
      expect((await send(ID, "/api/legal.accept", cookie, { document: id, version: "2026-01-01" })).status).toBe(200);
    }
    expect((await send(ID, "/api/me.preferences.set", cookie, { theme: "dark" })).status).toBe(200);
  });
});

/* ------------------------------------------------ every product's law --- */

describe("what every product you belong to asks of you", () => {
  /*
    ⚠️ `legal.list` ANSWERS FOR THE APP SERVING THE REQUEST, which on the account
    centre is whichever product happens to be behind that door. A person is an
    owner in one studio, a client in another and a member of a third product
    entirely, and they owe three different sets — so the one screen that exists to
    answer across products could not.

    ⚠️ THE DECLARATIONS ARE PUBLISHED ON BOOT, exactly as the vault's are. A
    worker knows its own manifest and nothing about the product beside it.
  */
  it("answers from the published declarations rather than the serving app", async () => {
    const slug = `owed${Math.random().toString(36).slice(2, 7)}`;
    const founding = await signIn(`${slug}@example.test`, SETUP);
    await post(SETUP, "/api/identity.workspace.create", { slug }, founding);
    const cookie = await signIn(`${slug}@example.test`, ID);

    const r = await get(ID, "/api/legal.mine", cookie);
    expect(r.status).toBe(200);
    const apps = r.body.apps as unknown as { appId: string; roles: string[]; documents: unknown[] }[];
    /* ⚠️ Named from the registry, not from the door: this reached the account
       centre without the hub knowing which product it came from. */
    expect(apps.map((a) => a.appId)).toContain("hello");
    expect(apps.find((a) => a.appId === "hello")!.roles).toEqual(["owner"]);
    expect(apps.find((a) => a.appId === "hello")!.documents.length).toBeGreaterThan(0);
  });

  it("says nothing about a product somebody has never opened", async () => {
    /*
      ⚠️ EVERY APP ON THE DEPLOYMENT PUBLISHES HERE. Listing all of them would
      tell somebody about products they have never used — and ask them to agree
      to the terms of one they do not.
    */
    const cookie = await signIn(`stranger.${SLUG}@example.com`, ID);
    const apps = (await get(ID, "/api/legal.mine", cookie)).body.apps as unknown as { appId: string }[];
    /* ⚠️ THE ACCOUNT ITSELF IS ALWAYS THERE — it is what they have — and no
       product is, because they are in none. */
    expect(apps.map((a) => a.appId)).toEqual([""]);
  });

  it("puts the account itself first, and not as a product", async () => {
    /*
      ⚠️ IT IS NOT A PRODUCT AND MUST NOT BE LISTED AS ONE. The account exists
      before any product and outlives all of them — the vault is the proof, since
      a fact there survives leaving every workspace — so an app's declaration
      structurally cannot cover it. An empty `appId` is how the runtime says which
      row this is, and the screen names it differently because of that.
    */
    const cookie = await signIn(`first.${SLUG}@example.com`, ID);
    const apps = (await get(ID, "/api/legal.mine", cookie)).body.apps as unknown as {
      appId: string; roles: string[]; documents: { id: string }[]; receiving: { controller: string } | null;
    }[];
    expect(apps[0]!.appId).toBe("");
    expect(apps[0]!.roles).toEqual(["account"]);
    expect(apps[0]!.documents.map((d) => d.id)).toEqual(["account-terms", "account-privacy"]);
    /* ⚠️ AND IT NAMES A CONTROLLER. The account and the vault are held by
       somebody, and no product's declaration says who. */
    expect(apps[0]!.receiving!.controller.length).toBeGreaterThan(0);
  });

  it("carries each product's own disclosure, not the serving app's", async () => {
    /*
      ⚠️ THE DOCUMENTS WERE CROSS-APP AND THE DISCLOSURE WAS NOT, which is worse
      than either being wrong on its own: a person in three products read one
      product's recipients under all three products' terms, and nothing on the
      screen said which. Each app publishes its ASSEMBLED disclosure beside its
      documents — assembled, because the regions, the inference map and the
      transfers are computed from the deployment rather than declared.
    */
    const slug = `discl${Math.random().toString(36).slice(2, 7)}`;
    const founding = await signIn(`${slug}@example.test`, SETUP);
    await post(SETUP, "/api/identity.workspace.create", { slug }, founding);
    const cookie = await signIn(`${slug}@example.test`, ID);

    const apps = (await get(ID, "/api/legal.mine", cookie)).body.apps as unknown as {
      appId: string; receiving: { controller: string; transfers: unknown[] } | null;
    }[];
    const here = apps.find((a) => a.appId === "hello")!;
    expect(here.receiving, "published beside the documents").not.toBeNull();
    expect(here.receiving!.controller.length).toBeGreaterThan(0);
    /* ⚠️ And the COMPUTED half, which a stored `ProtectionSpec` could not carry:
       a transfer per recipient, crossed with what this deployment holds. */
    expect(here.receiving!.transfers.length).toBeGreaterThan(0);
  });
});
