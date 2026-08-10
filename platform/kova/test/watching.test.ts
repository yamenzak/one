/**
 * WHAT WAS DONE, BY WHOM, AND WHETHER ANY OF IT WAS WRITTEN DOWN.
 *
 * ⚠️ EVERY ADDRESS HERE IS THIS SUITE'S OWN, and the slug is minted per attempt.
 *
 * The audit entries were built by `auditFor`, pushed into an array in the
 * request handler, and the array was never read. Fifteen of this app's
 * operations declare one; so does every operator action — comping a workspace,
 * adjusting its ceilings, topping up its credits. None of it left a trace, and
 * the code that produced the entries was perfectly correct.
 *
 * ⚠️ WHICH IS WHY THE FIRST ASSERTION HERE IS THAT A ROW EXISTS AT ALL. A test
 * that checked the SHAPE of an audit entry would have passed for the whole of
 * stage 7 against a platform that recorded nothing.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { freshSlug, post, SETUP, signIn } from "./session.js";

const SLUG = freshSlug("wasdale");
const STUDIO = `https://${SLUG}.kova.4dl.app`;
const CONSOLE = "https://admin.kova.4dl.app";

const at = (origin: string) => (cookie: string) => ({
  async call(path: string, body?: unknown) {
    const res = await worker.fetch(
      new Request(`${origin}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(body ?? {}),
      }),
      env as never,
    );
    return { status: res.status, body: (await res.json()) as Record<string, never> };
  },
  async get(path: string, query: Record<string, string> = {}) {
    const q = new URLSearchParams(query).toString();
    const res = await worker.fetch(
      new Request(`${origin}${path}${q ? `?${q}` : ""}`, { headers: { ...(cookie ? { cookie } : {}) } }),
      env as never,
    );
    return { status: res.status, body: (await res.json()) as Record<string, never> };
  },
});

type Entry = { operationId: string; subject: string; verb: string; via: string; actorId: string | null; onBehalfOf: string | null };

let owner: ReturnType<ReturnType<typeof at>>;
let tenantId = "";

beforeAll(async () => {
  const founding = await signIn(`${SLUG}@example.test`, SETUP);
  const made = await post(SETUP, "/api/identity.workspace.create", { slug: SLUG }, founding);
  tenantId = made.body.tenantId as string;
  owner = at(STUDIO)(await signIn(`${SLUG}@example.test`, STUDIO));
});

/* ----------------------------------------------------------- the record --- */

describe("what was done here", () => {
  /*
    ⚠️ THE ASSERTION THAT WOULD HAVE FAILED FOR THE WHOLE OF STAGE 7. Nothing
    wrote a row; every operation's `audit:` declaration was collected and thrown
    away at the end of the request.
  */
  it("is written down at all", async () => {
    await owner.call("/api/client.create", { name: "Nell Okonjo" });

    const out = await owner.get("/api/audit.list");
    expect(out.status).toBe(200);
    const entries = out.body.entries as unknown as Entry[];
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.map((e) => e.operationId)).toContain("client.create");
  });

  /* ⚠️ And WHO, or it answers "something happened here" — which is the half of
     the question nobody has ever needed an audit for. */
  it("names the person and how they reached it", async () => {
    const entries = (await owner.get("/api/audit.list")).body.entries as unknown as Entry[];
    const made = entries.find((e) => e.operationId === "client.create")!;
    expect(made.actorId).toBeTruthy();
    expect(made.via).toBe("http");
    expect(made.verb).toBe("create");
  });

  /*
    ⚠️ AND IT SAYS HOW LONG IT IS KEPT. "Everything we have" and "everything
    since March" are different answers, and only one of them is true — the
    manifest has declared `auditRetentionDays` since the first app and nothing
    read it, so nobody could have been told either.
  */
  it("says how long it is kept for", async () => {
    expect((await owner.get("/api/audit.list")).body.keptForDays).toBe(730);
  });

  /* ⚠️ It is about colleagues rather than records, so it sits behind the
     permission that closes the workspace rather than an ordinary read. */
  it("is not readable by somebody who is not signed in", async () => {
    expect((await at(STUDIO)("").get("/api/audit.list")).status).toBe(403);
  });
});

/* ------------------------------------------------------ acting as them --- */

/**
 * ⚠️ TIME-BOXED, ANNOUNCED AND WRITTEN DOWN. The manifest has declared
 * `impersonation: { maxMinutes, announce }` since the first app, `Actor` has
 * carried an `impersonatedBy` since the first stage, and nothing ever set either.
 */
describe("somebody from outside acting inside a workspace", () => {
  const operator = () => at(CONSOLE)(opCookie);
  let opCookie = "";
  let sessionId = "";

  beforeAll(async () => {
    opCookie = await signIn(`op-${SLUG}@example.test`, CONSOLE);
  });

  /* ⚠️ The reason is required and has to be a sentence. "Investigating a report
     of missing records, ticket 4471" is answerable six months later; "support"
     is a row nobody can act on. */
  it("refuses a support session with no reason worth reading", async () => {
    expect((await operator().call("/api/admin.impersonate", { tenantId, reason: "help" })).status).toBe(400);
  });

  it("begins one, bounded by the manifest's own ceiling", async () => {
    const out = await operator().call("/api/admin.impersonate", {
      tenantId,
      reason: "Investigating a report of missing records, ticket 4471",
      /*
        ⚠️ ASKING FOR FOUR HOURS, AND THE MANIFEST SAYS THIRTY MINUTES. A time box
        the request decides is not one — so this asks for the most the input shape
        allows and expects the declaration to win.
      */
      minutes: 240,
    });
    expect(out.status).toBe(200);
    sessionId = out.body.id as unknown as string;

    const expires = Date.parse(out.body.expiresAt as unknown as string);
    expect(expires - Date.now()).toBeLessThanOrEqual(30 * 60_000 + 5_000);
    expect(expires - Date.now(), "a ceiling of zero is not a time box either").toBeGreaterThan(60_000);
  });

  /*
    ⚠️ ONE AT A TIME. Two live grants are two expiry times, and the longer one
    silently extends the shorter — which is how a time box stops being one.
  */
  it("refuses a second while one is live", async () => {
    const again = await operator().call("/api/admin.impersonate", {
      tenantId, reason: "Investigating the same thing twice over, ticket 4471",
    });
    expect(again.status).toBe(409);
  });

  /*
    ⚠️ THE WORKSPACE IS TOLD, WHERE THE MANIFEST SAYS SO. A support session
    nobody is announced is indistinguishable, from inside, from somebody having
    got in — and telling those apart is exactly what the person reading their own
    record needs to be able to do.
  */
  it("tells the workspace it happened, and why", async () => {
    const inbox = (await owner.get("/api/inbox.list")).body.rows as unknown as { type: string; body?: string }[];
    const told = inbox.find((r) => r.type === "support.session");
    expect(told, "the workspace should have been told").toBeTruthy();
    expect(told!.body).toContain("ticket 4471");
  });

  /* ⚠️ And it is on the record for the workspace to read, not only for us. */
  it("is listed with its reason", async () => {
    const out = await operator().get("/api/admin.impersonations", { tenantId });
    const sessions = out.body.sessions as unknown as { reason: string; endedAt: string | null }[];
    expect(sessions[0]!.reason).toContain("ticket 4471");
    expect(sessions[0]!.endedAt).toBeNull();
  });

  /* ⚠️ Ended rather than deleted: an operator who can remove their own support
     session can remove the only record of what they did in it. */
  it("ends without removing the evidence", async () => {
    expect((await operator().call("/api/admin.impersonate.end", { id: sessionId })).status).toBe(200);
    const sessions = (await operator().get("/api/admin.impersonations", { tenantId })).body.sessions as unknown as { endedAt: string | null }[];
    expect(sessions[0]!.endedAt).toBeTruthy();
    expect(sessions.length).toBe(1);
  });

  /* ⚠️ Never a tool. A model that can act as a workspace's owner is one sentence
     in a document away from doing it, and everything it does is then recorded
     against a person who was not there. */
  it("is not offered to a model", async () => {
    const tools = (await operator().get("/api/tools.list")).body.tools as unknown as { operationId: string }[];
    const offered = tools.map((t) => t.operationId);
    /* ⚠️ The positive half, or this asserts that a list nobody built does not
       contain a string — which is true however the endpoint behaves. */
    expect(offered).toContain("identity.session.read");
    expect(offered).not.toContain("admin.impersonate");
    expect(offered).not.toContain("admin.impersonate.end");
  });
});
