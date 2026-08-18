/**
 * A CREDENTIAL THE DEPLOYMENT HOLDS.
 *
 * ⚠️ THE THING BEING PROVEN IS THAT A COPY OF THE DATABASE IS NOT A COPY OF THE
 * KEYS. Every other property here follows from that one: the stored bytes are
 * not the value, the wrong secret reads as unreadable rather than as absent, and
 * no read path anywhere answers a secret back.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CONFIG_SCHEMA, applySchema, configOf, configState, setConfig, type Db,
} from "../src/index.js";

const db = () => env.DIRECTORY as unknown as Db;
const SECRET = "test-config-secret";

beforeEach(async () => {
  await applySchema(db(), [CONFIG_SCHEMA]);
  await db().exec(`DELETE FROM deployment_config;`);
});

describe("a stored credential", () => {
  /*
    ⚠️ THE COLUMN IS NOT THE VALUE, AND ASSERTING ONLY THAT IT COMES BACK WOULD
    PASS ON A STORE THAT KEPT IT IN THE CLEAR. Both halves, in one test, because
    each alone is satisfied by the failure the other catches.
  */
  it("is not in the database, and comes back anyway", async () => {
    expect(await setConfig(db(), SECRET, "stripe.secret_key", "sk_live_abc123")).toBe(null);

    const row = await db().prepare(`SELECT value, salt, iv FROM deployment_config WHERE key = ?`)
      .bind("stripe.secret_key").first<{ value: string; salt: string; iv: string }>();
    expect(row?.value).toBeTruthy();
    expect(row?.value).not.toContain("sk_live");
    expect(row?.salt).toBeTruthy();

    expect(await configOf(db(), SECRET, "stripe.secret_key")).toBe("sk_live_abc123");
  });

  /*
    ⚠️ A ROTATED SECRET IS `set` AND UNREADABLE, NEVER ABSENT. Reported as absent,
    somebody re-enters a key while the deployment goes on failing for a reason the
    screen denied — and they have no way to find out that is what happened.
  */
  it("reads as set and unreadable under a different secret", async () => {
    await setConfig(db(), SECRET, "stripe.secret_key", "sk_live_abc123");

    expect(await configOf(db(), "another-secret", "stripe.secret_key")).toBe(null);

    const seen = (await configState(db(), "another-secret"))
      .find((c) => c.id === "stripe.secret_key")!;
    expect(seen.set).toBe(true);
    expect(seen.readable).toBe(false);
  });

  /* ⚠️ AND NO READ PATH ANSWERS ONE. This is what stops the console being a way
     to take a live key out of the deployment. */
  it("is never in what the console is told", async () => {
    await setConfig(db(), SECRET, "stripe.secret_key", "sk_live_abc123");
    await setConfig(db(), SECRET, "email.from", "One <noreply@4dl.app>");

    const seen = await configState(db(), SECRET);
    expect(JSON.stringify(seen)).not.toContain("sk_live_abc123");

    /* ⚠️ A value that is NOT a secret is shown, because hiding an address helps
       nobody and an operator cannot check what they cannot see. */
    expect(seen.find((c) => c.id === "email.from")?.value).toBe("One <noreply@4dl.app>");
    expect(seen.find((c) => c.id === "stripe.secret_key")?.value).toBe(null);
  });

  /*
    ⚠️ NO SECRET BOUND IS A REFUSAL FOR A KEY AND NOT FOR AN ADDRESS. Writing the
    key in plaintext because the deployment forgot to bind a secret is the whole
    failure this module exists against, and it would look like an ordinary save.
  */
  it("refuses to store a key on a deployment with nothing to encrypt it with", async () => {
    expect(await setConfig(db(), undefined, "stripe.secret_key", "sk_live_abc123"))
      .toBe("no_secret_bound");
    expect(await db().prepare(`SELECT COUNT(*) AS n FROM deployment_config`)
      .first<{ n: number }>()).toMatchObject({ n: 0 });

    expect(await setConfig(db(), undefined, "email.from", "One <noreply@4dl.app>")).toBe(null);
  });

  /* ⚠️ An undeclared key is refused rather than stored: a typo that saves is a
     value read back under the name somebody meant and found under neither. */
  it("refuses a key nothing declares", async () => {
    expect(await setConfig(db(), SECRET, "stripe.secert_key", "x")).toBe("no_such_key");
  });

  /* ⚠️ Clearing has to be as reachable as setting, or turning a lane off means
     opening the database. */
  it("clears on an empty value rather than storing one", async () => {
    await setConfig(db(), SECRET, "email.from", "One <noreply@4dl.app>");
    await setConfig(db(), SECRET, "email.from", "  ");
    expect(await configOf(db(), SECRET, "email.from")).toBe(null);
  });
});
