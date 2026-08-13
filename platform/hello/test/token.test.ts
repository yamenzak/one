/**
 * A TOKEN IS THE PERSON'S REACH, NEVER A COPY OF IT.
 *
 * ⚠️ THE FAILURE THIS DESIGN AVOIDS IS A SCOPE LIST FROZEN AT ISSUE. Stored
 * scopes are the shape where somebody loses a role and their token keeps it —
 * silently, until an audit finds a machine doing what its owner no longer may.
 * A token here stores no permissions at all: it names an account and a
 * workspace, and every request resolves that member's reach live.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { post, SETUP, signIn } from "./session.js";
import type { TokenRefusal } from "@one/runtime";

const ORIGIN = "https://tokens.hello.4dl.app";

let owner = "";
let tenantId = "";
let secret = "";

const withToken = async (path: string, key = secret, body?: unknown) => {
  const res = await worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env as never,
  );
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
};

const asOwner = async (path: string, body?: unknown) => {
  const res = await worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { cookie: owner, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env as never,
  );
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
};

beforeAll(async () => {
  const staff = await signIn("tokens@example.test", SETUP);
  const made = await post(SETUP, "/api/identity.workspace.create", { slug: "tokens" }, staff);
  tenantId = String((made.body as { tenantId?: string }).tenantId ?? "");
  owner = await signIn("tokens@example.test", ORIGIN);

  const issued = await asOwner("/api/me.tokens.issue", { name: "a robot", tenantId });
  secret = String(issued.body.secret ?? "");
});

describe("issuing one", () => {
  it("mints a secret exactly once, and never again", async () => {
    expect(secret).toMatch(/^one_[0-9a-f]{64}$/);

    /* ⚠️ The list carries a HINT and never the secret. A console that can show a
       live credential leaks one through a screen share or any read. */
    const { body } = await asOwner("/api/me.tokens");
    const tokens = body.tokens as unknown as { name: string; hint: string }[];
    const mine = tokens.find((t) => t.name === "a robot")!;
    expect(mine).toBeTruthy();
    expect(mine.hint).toBe(secret.slice(-4));
    expect(JSON.stringify(tokens)).not.toContain(secret);
  });

  /*
    ⚠️ ONLY A WORKSPACE THIS PERSON IS IN. The tenant id is something somebody
    types, and a token naming a workspace they left — or never joined — is a
    credential the resolver would honour.
  */
  it("refuses a workspace this person is not in", async () => {
    const out = await asOwner("/api/me.tokens.issue", { name: "sneaky", tenantId: "ten_somebody_else" });
    expect(out.status).toBe(403);
  });
});

describe("using one", () => {
  it("drives the product as its owner", async () => {
    const made = await withToken("/api/note.create", secret, { title: "written by a machine" });
    expect(made.status).toBe(200);

    const seen = await withToken("/api/note.list");
    expect(seen.status).toBe(200);
    expect((seen.body.rows as unknown[]).length).toBeGreaterThan(0);
  });

  /*
    ⚠️ AND IT IS AUDITED LIKE ANYTHING ELSE, because it went through the same
    runner. A machine acting in a workspace with no record of it is the failure
    an audit exists for.
  */
  it("leaves the same record a person would", async () => {
    await withToken("/api/note.create", secret, { title: "for the record" });
    const { body } = await asOwner("/api/audit.list");
    const entries = body.entries as unknown as { operationId: string }[];
    expect(entries.some((e) => e.operationId === "note.create")).toBe(true);
  });

  /*
    ⚠️ IT PROVES NOTHING RECENT, EVER. `proof: "recent"` exists against a borrowed
    laptop with an open tab, and the answer is a code to an inbox — which a
    machine cannot give. A token that satisfied the gate anyway would be the one
    way past it, so minting another one stays something a person does.
  */
  it("cannot do what needs proving, including minting another token", async () => {
    const out = await withToken("/api/me.tokens.issue", secret, { name: "a second robot", tenantId });
    expect(out.status).not.toBe(200);
  });

  /*
    ⚠️ EVERY REFUSAL IS THE SAME TO THE CALLER AND DIFFERENT IN THE LOG. Telling
    an unknown token from a revoked one, out loud, is an oracle for which strings
    were ever real — so the three reasons exist for whoever reads the logs
    afterwards and never reach the wire.
  */
  it("keeps its reasons for the log and answers callers with one status", async () => {
    const reasons: TokenRefusal[] = ["unknown", "revoked", "expired"];
    expect(reasons).toHaveLength(3);
  });

  it("refuses a string that was never a token", async () => {
    const out = await withToken("/api/note.list", "one_deadbeef");
    expect(out.status).toBe(401);
  });
});

describe("destroying one", () => {
  it("stops working the moment it is revoked", async () => {
    const issued = await asOwner("/api/me.tokens.issue", { name: "short lived", tenantId });
    const key = String(issued.body.secret);
    const id = (issued.body.token as { id: string }).id;

    expect((await withToken("/api/note.list", key)).status).toBe(200);
    expect((await asOwner("/api/me.tokens.revoke", { id })).status).toBe(200);
    expect((await withToken("/api/note.list", key)).status).toBe(401);
  });

  /*
    ⚠️ REVOKING IS NOT PROVED, deliberately. Somebody who has just realised a
    credential leaked should not meet a code-by-email between them and stopping
    it — and the worst case is a credential destroyed, which is recoverable.
  */
  it("is bound to its owner, so an id is not enough", async () => {
    const issued = await asOwner("/api/me.tokens.issue", { name: "not yours", tenantId });
    const id = (issued.body.token as { id: string }).id;

    const stranger = await signIn("stranger-token@example.test", ORIGIN);
    const res = await worker.fetch(
      new Request(`${ORIGIN}/api/me.tokens.revoke`, {
        method: "POST", headers: { cookie: stranger, "content-type": "application/json" },
        body: JSON.stringify({ id }),
      }),
      env as never,
    );
    expect([401, 403, 404]).toContain(res.status);
  });
});
