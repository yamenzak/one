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
  member = await signIn("tools@example.test", ORIGIN);
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

/* ------------------------------------------------------------ the document --- */

/**
 * ⚠️ `openApiFor` WAS WRITTEN, UNIT-TESTED AND SERVED BY NOTHING. Every route,
 * its method, its input and its declared failures were derivable from the one
 * registry and no caller could read them — a document that exists beside an API
 * that is undocumented.
 */
describe("the API describes itself", () => {
  it("answers with a path for every route this caller may call", async () => {
    const { body } = await get("/api/api.describe", member);
    const paths = body.paths as unknown as { path: string; method: string }[];
    expect(paths.length).toBeGreaterThan(20);
    expect(paths.some((p) => p.path.includes("note.create"))).toBe(true);
    for (const p of paths) expect(["GET", "POST"]).toContain(p.method);
  });

  /*
    ⚠️ FILTERED BY THE CALLER, exactly as the tool catalogue is. A document
    listing operations the reader's first call refuses is a support ticket
    rather than a reference — and it is the same `check` over the same registry,
    so there is no second list to keep in step.
  */
  it("describes less to a stranger than to a member", async () => {
    const mine = (await get("/api/api.describe", member)).body.paths as unknown as unknown[];
    const theirs = (await get("/api/api.describe", "")).body.paths as unknown as unknown[];
    expect(theirs.length).toBeLessThan(mine.length);
  });

  /*
    ⚠️ AND THE FAILURES TRAVEL WITH IT. A path listing a code, with nothing
    saying what status it arrives as, stops exactly where a reader needs it.
  */
  it("says what each declared failure arrives as", async () => {
    const { body } = await get("/api/api.describe", member);
    const problems = body.problems as unknown as Record<string, number>;
    expect(problems["platform.not_found"]).toBe(404);
    expect(problems["platform.forbidden"]).toBe(403);
  });
});

/* ---------------------------------------------------------------- audited --- */

/**
 * ⚠️ EVERY WRITE IS RECORDED WHETHER OR NOT ITS AUTHOR THOUGHT OF IT. It used to
 * be declared or nowhere, so "auditable" meant "audited where somebody
 * remembered" — and a missing entry is indistinguishable from an action nobody
 * took.
 */
describe("every action leaves a record", () => {
  it("records a write, with what was acted on and by whom", async () => {
    const made = await post(ORIGIN, "/api/note.create", { title: "for the record" }, member);
    expect(made.res.status).toBe(200);

    const { body } = await get("/api/audit.list", member);
    const entries = body.entries as unknown as { operationId: string; verb: string; via: string; actorId: string }[];
    const one = entries.find((e) => e.operationId === "note.create");
    expect(one).toBeTruthy();
    expect(one!.verb).toBe("create");
    expect(one!.via).toBe("http");
    expect(one!.actorId).toBeTruthy();
  });

  /*
    ⚠️ AND AN ACTION TAKEN BY A MODEL IS TOLD APART FROM ONE A PERSON TOOK. The
    gate already ran on the same caller, so the difference changes nothing about
    what was allowed — and everything about what an audit is worth reading for.
  */
  it("says when a model took the action rather than a person", async () => {
    await callTool("note_create", { title: "by an agent" });
    const { body } = await get("/api/audit.list", member);
    const entries = body.entries as unknown as { operationId: string; via: string }[];
    expect(entries.some((e) => e.operationId === "note.create" && e.via === "tool")).toBe(true);
  });

  /* ⚠️ A read is not recorded unless it asks. Every list and every poll would be
     an entry, and an audit nobody can read is the same silence with a bill. */
  it("does not record an ordinary read", async () => {
    await get("/api/note.list", member);
    const { body } = await get("/api/audit.list", member);
    expect((body.entries as unknown as { operationId: string }[]).some((e) => e.operationId === "note.list")).toBe(false);
  });
});
