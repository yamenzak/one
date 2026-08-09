/**
 * MAINTENANCE — the one switch that closes every door in the deployment.
 *
 * ⚠️ ITS OWN INVOCATION, because of exactly that. A file that turns it on turns
 * it on for whatever shares the database, and the symptom is unrelated suites
 * reporting a 503 from endpoints that have nothing to do with the test that
 * closed the door. Three did, the first time this lived beside them.
 */

import { env } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { post, SETUP, signIn } from "./session.js";
import { bindingsFor, setMaintenance, OPEN } from "@one/runtime";
import { sql, type Instant, type ResolvedRegion } from "@one/kernel";

const ORIGIN = "https://closed.hello.4dl.app";
let member = "";
let tenantId = "";

const handle = (binding: string) =>
  bindingsFor({ db: sql() }, { DB: (env as Record<string, unknown>)[binding] }, { defaultRegion: "auto" })("auto" as ResolvedRegion).db;

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

/*
  ⚠️ RESTORED WHATEVER HAPPENS. Maintenance is deployment-wide, so a file that
  fails halfway through leaves every other suite looking at a 503 from an
  endpoint that has nothing to do with what broke.
*/
afterAll(async () => {
  await setMaintenance(handle("DIRECTORY"), OPEN, new Date().toISOString() as Instant);
});

beforeAll(async () => {
  const staff = await signIn("closed@example.test", SETUP);
  const made = await post(SETUP, "/api/identity.workspace.create", { slug: "closed" }, staff);
  tenantId = made.body.tenantId as string;
  member = await signIn("closed-owner@example.test", ORIGIN);
  await call("/api/note.create", { title: "something worth keeping" });
});

/* ----------------------------------------------------------- maintenance --- */

describe("maintenance is the standing gate one level up", () => {
  /*
    ⚠️ THIS IS ABOUT US. Nobody reading it did anything and nobody can pay to end
    it, which is why it closes every door rather than one workspace's — and why
    the copy cannot be the arrears copy.
  */
  it("refuses a write in readonly and still serves a read", async () => {
    await setMaintenance(handle("DIRECTORY"), { mode: "readonly", message: "Back in ten minutes" }, new Date().toISOString() as Instant);
    const write = await call("/api/note.create", { title: "during" });
    expect(write.status).toBe(503);
    expect(write.body.title).toBe("Back in ten minutes");
    expect((await call("/api/note.list")).status).toBe(200);
  });

  /*
    ⚠️ A FULL STOP DISABLES SIGN-IN, and that is the feature. Letting somebody
    authenticate into a product that is not there spends their trust to save
    them nothing.
  */
  it("withholds even the public sign-in lane on a full stop", async () => {
    await setMaintenance(handle("DIRECTORY"), { mode: "full", message: "" }, new Date().toISOString() as Instant);
    expect((await call("/api/note.list")).status).toBe(503);
    expect((await call("/api/identity.code.request", { email: "x@example.test" }, "")).status).toBe(503);
  });

  /*
    ⚠️ THE MACHINE LANES SURVIVE. A deployment nobody can probe is one nobody can
    tell has recovered, and a payment provider retries into a closed door and
    eventually gives up — on money.
  */
  it("keeps the probe and the payment endpoint open", async () => {
    const health = await worker.fetch(new Request(`${ORIGIN}/health`), env as never);
    expect(health.status).toBe(200);
    const hook = await worker.fetch(new Request(`${ORIGIN}/api/webhook.provider`, { method: "POST", body: "{}" }), env as never);
    expect(hook.status, "refused for its signature, not for maintenance").toBe(403);
  });

  it("opens again when it is switched off", async () => {
    await setMaintenance(handle("DIRECTORY"), OPEN, new Date().toISOString() as Instant);
    expect((await call("/api/note.list")).status).toBe(200);
  });
});
