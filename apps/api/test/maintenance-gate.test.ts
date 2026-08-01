/**
 * THE MAINTENANCE GATE, against the real worker.
 *
 * ── Why every assertion here is made SIGNED OUT ─────────────────────────────
 *
 * The Miniflare suite runs with `ADMIN_EMAILS: ""` + `ENVIRONMENT: "development"`
 * (apps/api/vitest.config.ts), which makes every signed-in test user a platform
 * admin — and a platform admin is exempt from this gate on every door, by design.
 * So a test that signed in would be spared and would pass no matter what the gate
 * did. That is the same trap `route-gate.conformance.test.ts` documents for the
 * action gate, and it is worth naming twice.
 *
 * Signed out is not a workaround, though: it is the population the feature is
 * actually about. "Disables login" is a claim about people who are not signed in,
 * and it is checked here by asking for a sign-in code and watching it be refused.
 *
 * The four exemptions are asserted alongside the refusals, because each one is a
 * way the switch becomes irreversible or expensive:
 *
 *   `/api/host`   without it the app cannot tell "closed for maintenance" from
 *                 "this server is broken", so the operator's message never lands.
 *   `/health`     without it a planned window pages whoever is on call.
 *   `admin.`      without it the switch cannot be turned back off.
 *   the AUTH lane at `readonly` — without it a "read-only" window refuses the one
 *                 act that lets anyone read anything.
 */

import { env, SELF } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { MAINTENANCE_KEYS } from "@4dl/tenancy";
import { ensureSchema } from "../src/db.js";

/**
 * The SETUP door, for everything but the operator assertions.
 *
 * Deliberately not an unclaimed `<slug>.localhost`: gate 1 answers 404 for a
 * well-formed studio address that owns no studio, and it does so BEFORE the
 * maintenance gate — correctly, because a hostname nobody owns should not
 * disclose what state the platform is in. Asserting maintenance from there
 * measures the wrong gate. `setup.` is a real door of ours that needs no tenant.
 */
const DOOR = "http://setup.localhost:8787";
const ADMIN = "http://admin.localhost:8787";

/**
 * The schema has to be applied at FILE scope, not inside a test.
 *
 * `schemaGate` memoises per isolate while the pool gives each test its own
 * storage frame, so a first `ensureSchema` run inside test one creates the tables
 * in a frame that is rolled back afterwards — and every later call is a memoised
 * no-op against a database that no longer has them. The symptom is
 * `no such table: app_config` in every test but the first.
 */
beforeAll(async () => {
  await ensureSchema(env.DB as D1Database);
});

/** Write the switch straight into `app_config`, as the operator route does. */
async function setLevel(level: "off" | "readonly" | "full", message = ""): Promise<void> {
  const db = env.DB as D1Database;
  const put = "INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value";
  await db.prepare(put).bind(MAINTENANCE_KEYS.level, level).run();
  await db.prepare(put).bind(MAINTENANCE_KEYS.message, message).run();
  await db.prepare(put).bind(MAINTENANCE_KEYS.since, level === "off" ? "" : new Date().toISOString()).run();
}

/** Ask for a sign-in code — a public POST, and the thing `full` must refuse. */
const requestCode = (origin: string) =>
  SELF.fetch(`${origin}/api/auth/email-otp/send-verification-otp`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ email: `maint-${Date.now()}@example.com`, type: "sign-in" }),
  });

afterEach(async () => {
  // Belt and braces. Each test has its own storage frame, so a `full` written
  // inside one cannot survive it — but a leak here would close the deployment
  // for every sibling test, and the failure would read as a dozen unrelated
  // regressions rather than one.
  await setLevel("off");
});

describe("off", () => {
  it("withholds nothing", async () => {
    await setLevel("off");
    const host = await SELF.fetch(`${DOOR}/api/host`);
    expect(host.status).toBe(200);
    expect(await host.json()).toMatchObject({ maintenance: { level: "off", message: null } });
    // Not 503. (401/400/403 are all fine — this route has its own policy gate;
    // what matters is that maintenance is not the thing answering.)
    expect((await requestCode(DOOR)).status).not.toBe(503);
  });
});

describe("readonly", () => {
  it("still serves reads, and says so on the host probe", async () => {
    await setLevel("readonly", "Migrating the database.");
    const res = await SELF.fetch(`${DOOR}/api/host`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      maintenance: { level: "readonly", message: "Migrating the database." },
    });
  });

  it("keeps the sign-in lane open — otherwise nobody can read anything", async () => {
    await setLevel("readonly");
    expect((await requestCode(DOOR)).status).not.toBe(503);
  });

  it("refuses a write from a signed-out caller before it reaches the auth gate", async () => {
    await setLevel("readonly");
    // Signed out this would ordinarily be 401. Maintenance sits above that gate
    // on purpose, so the answer names the real reason.
    const res = await SELF.fetch(`${DOOR}/api/logs/water`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: DOOR },
      body: JSON.stringify({ ml: 250 }),
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "maintenance", level: "readonly" });
    expect(res.headers.get("Retry-After")).toBe("300");
  });
});

describe("full", () => {
  it("disables login", async () => {
    await setLevel("full", "Back by 14:00 UTC.");
    const res = await requestCode(DOOR);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "maintenance", level: "full", message: "Back by 14:00 UTC." });
  });

  it("refuses reads too", async () => {
    await setLevel("full");
    expect((await SELF.fetch(`${DOOR}/api/context`)).status).toBe(503);
  });

  it("still answers the host probe, carrying the operator's message", async () => {
    await setLevel("full", "Back by 14:00 UTC.");
    const res = await SELF.fetch(`${DOOR}/api/host`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { maintenance: { level: string; message: string; since: string } };
    expect(body.maintenance.level).toBe("full");
    expect(body.maintenance.message).toBe("Back by 14:00 UTC.");
    expect(body.maintenance.since).toBeTruthy();
  });

  it("still answers /health, so a planned window does not page anyone", async () => {
    await setLevel("full");
    const res = await SELF.fetch(`${DOOR}/health`);
    expect(res.status).toBe(200);
  });

  it("leaves the operator door open — the switch has to be reversible", async () => {
    await setLevel("full");
    // Signed out, so this is 401/403 rather than 200. The claim is narrower and
    // exact: the OPERATOR door is not the one being closed. Were `admin.` gated,
    // this would be 503 and the only way back would be hand-editing D1.
    const res = await SELF.fetch(`${ADMIN}/api/admin/maintenance`);
    expect(res.status).not.toBe(503);
  });

  it("keeps the signature-verified Stripe webhook answering", async () => {
    await setLevel("full");
    // No valid signature, so the handler itself rejects it — 400, not 503. That
    // is the point: the request reached the handler. A dropped webhook is not
    // retried forever; Stripe disables the endpoint and the money is simply gone.
    const res = await SELF.fetch(`${DOOR}/api/stripe/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).not.toBe(503);
  });
});

describe("a malformed switch", () => {
  it("is off, not closed", async () => {
    // The row is free text in `app_config`. A typo, a half-finished write or a
    // restored backup must not take the deployment down for a reason nobody
    // chose — and with a lockout whose only fix is editing that same row.
    await (env.DB as D1Database)
      .prepare("INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .bind(MAINTENANCE_KEYS.level, "READONLY")
      .run();
    const res = await SELF.fetch(`${DOOR}/api/host`);
    expect(await res.json()).toMatchObject({ maintenance: { level: "off" } });
  });
});
