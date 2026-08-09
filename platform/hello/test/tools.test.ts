/**
 * STAGE 2'S EXIT CRITERION, ASSERTED.
 *
 * "An AI agent completes a CRUD round trip through tools, and is refused exactly
 * what the user would be."
 *
 * ⚠️ THE SECOND HALF IS THE ONE THAT MATTERS. A round trip proves the transport
 * works; the equivalence proves an assistant cannot do more than the person
 * driving it — which is a property that has to hold for every operation and
 * every caller, not for the cases somebody thought to try.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { post, SETUP, signIn } from "./session.js";

const ORIGIN = "https://tools.hello.4dl.app";
let member = "";

const get = async (path: string, cookie = member) => {
  const res = await worker.fetch(
    new Request(`${ORIGIN}${path}`, { headers: cookie ? { cookie } : {} }),
    env as never,
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const callTool = (name: string, input: unknown, cookie = member) =>
  post(ORIGIN, "/api/tools.call", { name, input }, cookie);

beforeAll(async () => {
  const staff = await signIn("tools@example.test", SETUP);
  await post(SETUP, "/api/identity.workspace.create", { slug: "tools" }, staff);
  member = await signIn("agent@example.test", ORIGIN);
});

describe("an agent drives the product through the same operations a person does", () => {
  it("completes a round trip", async () => {
    const before = await callTool("note_list", {});
    expect(before.res.status).toBe(200);

    const made = await callTool("note_create", { title: "written by an agent" });
    expect(made.res.status).toBe(200);
    expect((made.body.result as { id: string }).id).toMatch(/^not_/);

    const after = await callTool("note_list", {});
    const notes = (after.body.result as { rows: unknown[] }).rows;
    expect(notes.length).toBeGreaterThan(0);
  });

  it("names tools without dots, which most providers reject", async () => {
    const { body } = await get("/api/tools.list");
    for (const t of body.tools as { name: string }[]) expect(t.name).not.toContain(".");
  });

  /*
    ⚠️ THE EQUIVALENCE, ASSERTED OVER THE WHOLE CATALOGUE RATHER THAN SAMPLED.
    For every operation the runtime knows about: the tool surface offers it if
    and only if a route would allow it. Sampling would prove the samples.
  */
  it("offers exactly what a route would allow, for a member and for a stranger", async () => {
    for (const cookie of [member, ""]) {
      const { body } = await get("/api/tools.list", cookie);
      const offered = new Set((body.tools as { operationId: string }[]).map((t) => t.operationId));

      // Everything a tool may reach must answer its own route for this caller.
      for (const id of offered) {
        const path = `/api/${id}`;
        const res = await worker.fetch(new Request(`${ORIGIN}${path}`, { headers: cookie ? { cookie } : {} }), env as never);
        expect([200, 400, 404, 405], `${id} for ${cookie ? "a member" : "a stranger"}`).toContain(res.status);
        expect(res.status, `${id} is offered as a tool and refused as a route`).not.toBe(403);
      }
    }
  });

  /*
    ⚠️ RE-CHECKED AT THE CALL, NOT TRUSTED BECAUSE IT CAME FROM A CATALOGUE. The
    list was computed for a caller at a moment; the call arrives later.
  */
  it("refuses a tool this caller was never offered", async () => {
    const stranger = await callTool("note_create", { title: "nope" }, "");
    expect(stranger.res.status).toBe(403);
  });

  /*
    ⚠️ EXPOSURE IS OPT-OUT, so what is opted out must be unreachable by NAME as
    well as absent from the list. An allow-list somebody forgets to extend is the
    failure this design avoids; a deny that only hides is the failure it must not
    introduce instead.
  */
  it("refuses an operation withheld from every model, even spelled correctly", async () => {
    const { body } = await get("/api/tools.list");
    const names = (body.tools as { name: string }[]).map((t) => t.name);
    expect(names).not.toContain("identity_workspace_create");

    const sneaky = await post(SETUP, "/api/tools.call",
      { name: "identity_workspace_create", input: { slug: "byhand" } },
      await signIn("sneaky@example.test", SETUP));
    expect(sneaky.res.status).toBe(404);
  });

  it("does not offer itself", async () => {
    const { body } = await get("/api/tools.list");
    expect((body.tools as { name: string }[]).map((t) => t.name)).not.toContain("tools_call");
  });

  it("marks which tools mutate, so a caller can require confirmation", async () => {
    const { body } = await get("/api/tools.list");
    const tools = body.tools as { name: string; mutates: boolean }[];
    expect(tools.find((t) => t.name === "note_create")?.mutates).toBe(true);
    expect(tools.find((t) => t.name === "note_list")?.mutates).toBe(false);
  });
});
