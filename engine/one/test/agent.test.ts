/**
 * THE AGENT DOOR, DRIVEN THROUGH THE DEPLOYMENT (D13).
 *
 * ⚠️ THE SAME BUILDING, PROVED FROM OUTSIDE. Everything here goes through
 * `worker.fetch` on the real host topology — the tenant's own address answers
 * `/mcp`, the tools are the operations the caller could already reach over
 * `/api/*`, and the gates, the audit and the opt-outs behave identically on
 * both doors. A suite that called the MCP module directly would be testing the
 * module; this one tests the promise.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { residencyFor } from "@engine/kernel";
import { PLATFORM_ROLES } from "@engine/kernel";
import {
  addShard, createTenant, found, invite, noteBelonging, noteShardApp, startSession, upsertAccount,
  type Db,
} from "@engine/runtime";
import { HELLO } from "@engine/hello";
import worker from "../src/index.js";

const asDev = { ...env, ROOT: "localhost", ENVIRONMENT: "development", AUTH_SECRET: "test" };
const call = (host: string, path: string, init: RequestInit = {}) =>
  worker.fetch(new Request(`http://${host}:8080${path}`, init), asDev as never);

const rpc = (host: string, body: unknown, headers: Record<string, string> = {}) =>
  call(host, "/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const directory = () => env.DIRECTORY as unknown as Db;
const shard = () => env.SHARD_EU_1 as unknown as Db;

/* One workspace, one owner, one reader — made once, used throughout. */
let ownerCookie = "";
let readerCookie = "";
let tenantId = "";

beforeAll(async () => {
  await call("localhost", "/health");
  await addShard(directory(), "eu-1", "eu", 100);
  await noteShardApp(directory(), "eu-1", "hello");

  const made = await createTenant(directory(), {
    slug: "ironworks", name: "Ironworks", country: "DE",
    where: residencyFor("DE"), apps: ["hello"],
  });
  if (typeof made === "string" || !("tenant" in made)) throw new Error(String(made));
  tenantId = made.tenant.id;

  const owner = await upsertAccount(directory(), "amara@example.com", null);
  await found(shard(), made.tenant.id, owner, "amara@example.com", { hello: "writer" });
  await noteBelonging(directory(), owner, made.tenant.id);
  ownerCookie = `one_session=${(await startSession(directory(), owner)).id}`;

  /* ⚠️ A customer with a read-only app role (D15): no workspace authority, so
     the platform's writes and roster stay out of their catalogue. */
  const reader = await upsertAccount(directory(), "sam@example.com", null);
  await invite(shard(), made.tenant.id,
    { email: "sam@example.com", platformRole: "customer", appRoles: { hello: "reader" } },
    { platform: new Set(PLATFORM_ROLES.owner), inApp: async () => new Set(HELLO.access.permissions) },
    async () => HELLO.access.roles, { counts: ["owner", "manager", "staff"], allowed: -1 });
  await shard().prepare(
    `UPDATE membership SET account_id = ?, accepted_at = ? WHERE tenant_id = ? AND email = ?`)
    .bind(reader, new Date().toISOString(), made.tenant.id, "sam@example.com").run();
  await noteBelonging(directory(), reader, made.tenant.id);
  readerCookie = `one_session=${(await startSession(directory(), reader)).id}`;
});

describe("the door itself", () => {
  it("answers only on a workspace's own address", async () => {
    for (const host of ["localhost", "id.localhost", "setup.localhost", "admin.localhost"]) {
      const res = await rpc(host, { jsonrpc: "2.0", id: 1, method: "tools/list" });
      expect(res.status, host).toBe(404);
    }
  });

  it("introduces itself statelessly", async () => {
    const res = await rpc("ironworks.localhost", {
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {} },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { result: { protocolVersion: string; serverInfo: { title: string } } };
    expect(body.result.protocolVersion).toBeTruthy();
    expect(body.result.serverInfo.title).toBe("ironworks");
  });

  it("refuses a request that is not JSON-RPC", async () => {
    const res = await call("ironworks.localhost", "/mcp", { method: "POST", body: "not json" });
    const body = await res.json() as { error: { code: number } };
    expect(body.error.code).toBe(-32700);
  });
});

describe("what is listed", () => {
  const list = async (cookie?: string): Promise<readonly { name: string }[]> => {
    const res = await rpc("ironworks.localhost",
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      cookie ? { cookie } : {});
    const body = await res.json() as { result: { tools: readonly { name: string }[] } };
    return body.result.tools;
  };

  it("lists nothing for nobody", async () => {
    expect(await list()).toEqual([]);
  });

  /*
    ⚠️ LISTED MEANS CALLABLE BY THIS CALLER. The owner sees the writes; the
    reader sees the reads and none of the writes — the same rule the navigation
    follows, because a catalogue of tools the gate will refuse teaches an agent
    to try them.
  */
  it("lists the owner's tools, the opt-outs absent", async () => {
    const names = (await list(ownerCookie)).map((t) => t.name);
    expect(names).toContain("note.create");
    expect(names).toContain("note.publish");
    expect(names).toContain("member.list");
    /* ⚠️ Granting access is the canonical opt-out — see `member-ops.ts`. */
    expect(names).not.toContain("member.invite");
    expect(names).not.toContain("member.role");
    expect(names).not.toContain("member.remove");
  });

  it("narrows to what a reader may actually call", async () => {
    const names = (await list(readerCookie)).map((t) => t.name);
    expect(names).toContain("note.list");
    expect(names).not.toContain("note.create");
  });
});

describe("what a call does", () => {
  const callTool = async (name: string, args: Record<string, unknown>, cookie?: string) => {
    const res = await rpc("ironworks.localhost",
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } },
      cookie ? { cookie } : {});
    return await res.json() as {
      result?: { isError: boolean; structuredContent: Record<string, unknown> };
      error?: { code: number; message: string };
    };
  };

  it("runs a real operation and leaves the audit entry the HTTP door would", async () => {
    const out = await callTool("note.create", { title: "From an agent" }, ownerCookie);
    expect(out.result?.isError).toBe(false);
    expect(out.result?.structuredContent).toHaveProperty("id");

    const row = await shard().prepare(
      `SELECT COUNT(*) AS n FROM note WHERE tenant_id = ? AND title = ?`)
      .bind(tenantId, "From an agent").first<{ n: number }>();
    expect(row?.n).toBe(1);

    const audit = await shard().prepare(
      `SELECT COUNT(*) AS n FROM audit WHERE tenant_id = ? AND op = 'note.create' AND ok = 1`)
      .bind(tenantId).first<{ n: number }>();
    expect(audit?.n).toBeGreaterThan(0);
  });

  /*
    ⚠️ AN OPT-OUT ANSWERS AS A TOOL THAT NEVER EXISTED. A distinct refusal
    would confirm to the model that the name is real and worth asking a human
    to call — so `member.invite` and `no.such.thing` are the same sentence.
  */
  it("does not admit an opted-out operation exists", async () => {
    const refused = await callTool("member.invite", { email: "x@example.com", platformRole: "staff" }, ownerCookie);
    const absent = await callTool("no.such.thing", {}, ownerCookie);
    expect(refused.error?.code).toBe(-32602);
    expect(refused.error?.message).toBe("no such tool: member.invite");
    expect(absent.error?.code).toBe(-32602);
  });

  /* ⚠️ A gate saying no is a TOOL RESULT the model reads, not a protocol
     error — in the same words the HTTP door would have used. */
  it("relays a gate's refusal in the platform's words", async () => {
    const out = await callTool("note.create", { title: "Nope" }, readerCookie);
    expect(out.result?.isError).toBe(true);
    expect(out.result?.structuredContent).toHaveProperty("problem");
  });

  it("holds the entitlement gate on the parking plan", async () => {
    const made = await callTool("note.create", { title: "To publish" }, ownerCookie);
    const id = String((made.result?.structuredContent as { id?: string })?.id ?? "");
    const out = await callTool("note.publish", { id }, ownerCookie);
    /* The free plan sells `publishing: false`, and the agent door must say so. */
    expect(out.result?.isError).toBe(true);
  });

  it("refuses malformed arguments before anything runs", async () => {
    const res = await rpc("ironworks.localhost",
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "note.create", arguments: [1] } },
      { cookie: ownerCookie });
    const body = await res.json() as { error: { code: number } };
    expect(body.error.code).toBe(-32602);
  });
});

describe("the bearer lane", () => {
  it("mints at the account centre, works at the workspace, dies on revocation", async () => {
    /* ⚠️ Minted on the ACCOUNT door — a token is an account credential. */
    const minted = await call("id.localhost", "/api/me.token.create", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ label: "CI agent" }),
    });
    expect(minted.status).toBe(200);
    const { id, token } = await minted.json() as { id: string; token: string };
    expect(token.startsWith("qtk_")).toBe(true);

    /* The token answers on the tenant door with the account's own powers. */
    const listed = await rpc("ironworks.localhost",
      { jsonrpc: "2.0", id: 4, method: "tools/list" },
      { authorization: `Bearer ${token}` });
    const body = await listed.json() as { result: { tools: readonly { name: string }[] } };
    expect(body.result.tools.map((t) => t.name)).toContain("note.create");

    /* ⚠️ A token is a row: revoking it means NOW, not at expiry. */
    const revoked = await call("id.localhost", "/api/me.token.revoke", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ id }),
    });
    expect(revoked.status).toBe(200);

    const after = await rpc("ironworks.localhost",
      { jsonrpc: "2.0", id: 5, method: "tools/list" },
      { authorization: `Bearer ${token}` });
    const gone = await after.json() as { result: { tools: readonly unknown[] } };
    expect(gone.result.tools).toEqual([]);
  });

  it("mints nowhere but the account centre", async () => {
    const res = await call("ironworks.localhost", "/api/me.token.create", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ label: "nope" }),
    });
    expect(res.status).toBe(404);
  });
});
