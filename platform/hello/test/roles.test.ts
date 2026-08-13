/**
 * ROLES A WORKSPACE MAKES FOR ITSELF.
 *
 * ⚠️ A ROLE REGISTRY IS ALREADY A `Record<string, string[]>`, which is why this
 * is a table and forty lines rather than a subsystem. What these prove is the
 * part that is not obvious: that a custom role reaches every question the
 * platform asks about roles — the invite door, the re-role door, and who counts
 * as an administrator when somebody is removed — rather than only the screen it
 * was made on.
 *
 * ⚠️ AND THAT NOBODY CAN BUILD THEIR WAY PAST WHAT THEY HOLD. "Make a role
 * carrying `member:manage`, then assign it to yourself" is the same escalation
 * `canGrant` closes on a per-key grant, with a longer first step — and it is the
 * one thing a role builder adds to the threat model.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { post, SETUP, signIn } from "./session.js";

const SLUG = "guild";
const ORIGIN = `https://${SLUG}.hello.4dl.app`;

const as = (cookie: string) => async (path: string, body?: unknown) => {
  const res = await worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env as never,
  );
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, never> };
};

interface Listed {
  roles: { id: string; name: string; permissions: string[]; source: string; editable: boolean; held: number }[];
  permissions: string[];
}
interface Roster { members: { id: string; email: string; role: string }[] }

let owner: ReturnType<typeof as>;

beforeAll(async () => {
  const founding = await signIn(`${SLUG}@example.test`, SETUP);
  await post(SETUP, "/api/identity.workspace.create", { slug: SLUG }, founding);
  owner = as(await signIn(`${SLUG}@example.test`, ORIGIN));
});

describe("what a workspace may build", () => {
  /*
    ⚠️ THE PRODUCT'S ROLES AND THE WORKSPACE'S ARRIVE IN ONE LIST, LABELLED. Two
    lists invite the reading that they behave differently at a member's door, and
    they do not — the registry is merged and a role is a role.
  */
  it("answers with the product's roles and this workspace's own, in one list", async () => {
    const before = (await owner("/api/role.list")).body as unknown as Listed;
    expect(before.roles.filter((r) => r.source === "app").map((r) => r.id)).toContain("owner");
    expect(before.roles.some((r) => r.source === "workspace")).toBe(false);
    /* ⚠️ And only what this person could actually put in one. */
    expect(before.permissions).toContain("note:write");

    expect((await owner("/api/role.save", {
      id: "front-desk", name: "Front desk", permissions: ["note:read", "member:read"],
    })).status).toBe(200);

    const after = (await owner("/api/role.list")).body as unknown as Listed;
    const made = after.roles.find((r) => r.id === "front-desk")!;
    expect(made.source).toBe("workspace");
    expect(made.permissions).toEqual(["note:read", "member:read"]);
  });

  /*
    ⚠️ REDEFINING A DECLARED ROLE IS NOT A CUSTOMISATION. It is a workspace
    rewriting what the product means by `owner`, and the shadowing would be
    invisible because the merged registry has one key.
  */
  it("refuses a name the product already uses", async () => {
    const out = await owner("/api/role.save", { id: "owner", name: "Owner", permissions: [] });
    expect(out.status).toBe(400);
  });

  /* ⚠️ A key nobody declared grants nothing, forever, and looks exactly like a
     permission that was granted and does not work. */
  it("refuses a permission the product does not declare", async () => {
    const out = await owner("/api/role.save", {
      id: "made-up", name: "Made up", permissions: ["nonsense:write"],
    });
    expect(out.status).toBe(400);
  });

  /*
    ⚠️ AN ID IS A KEY IN A MERGED REGISTRY. One with a space in it resolves to
    nothing — a role somebody made, assigned, and that grants nothing at all.
  */
  it("refuses an id that could never resolve", async () => {
    expect((await owner("/api/role.save", { id: "Front Desk", name: "x", permissions: [] })).status).toBe(400);
  });
});

describe("a custom role reaches every door, not just the screen it was made on", () => {
  it("can be invited into, and moved into", async () => {
    await owner("/api/role.save", { id: "desk", name: "Desk", permissions: ["note:read"] });

    const invited = await owner("/api/member.invite", { email: "desk@example.test", role: "desk" });
    expect(invited.status).toBe(200);
    expect(invited.body.role as unknown as string).toBe("desk");

    const id = ((await owner("/api/member.list")).body as unknown as Roster)
      .members.find((m) => m.email === "desk@example.test")!.id;
    expect((await owner("/api/member.role", { id, role: "reader" })).status).toBe(200);
    expect((await owner("/api/member.role", { id, role: "desk" })).status).toBe(200);
  });

  /* ⚠️ And it actually GRANTS, which is the only thing that makes it a role. */
  it("grants what it carries and nothing else", async () => {
    await owner("/api/role.save", { id: "readers", name: "Readers", permissions: ["note:read"] });
    await owner("/api/member.invite", { email: "reads-only@example.test", role: "readers" });

    const them = as(await signIn("reads-only@example.test", ORIGIN));
    expect((await them("/api/note.list")).status).toBe(200);
    expect((await them("/api/note.create", { title: "not allowed" })).status).toBe(403);
  });

  /* ⚠️ A role nobody declared is still refused at the invite door — the merge
     widened what is known, it did not remove the check. */
  it("still refuses a role that exists nowhere", async () => {
    const out = await owner("/api/member.invite", { email: "ghost@example.test", role: "phantom" });
    expect(out.status).toBe(400);
  });
});

describe("nobody may build their way past what they hold", () => {
  const DEPUTY = "https://chapter.hello.4dl.app";
  const at = (cookie: string) => async (path: string, body?: unknown) => {
    const res = await worker.fetch(
      new Request(`${DEPUTY}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "content-type": "application/json", cookie },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env as never,
    );
    return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, never> };
  };

  let boss: ReturnType<typeof at>;
  let deputy: ReturnType<typeof at>;

  beforeAll(async () => {
    const founding = await signIn("chapter@example.test", SETUP);
    await post(SETUP, "/api/identity.workspace.create", { slug: "chapter" }, founding);
    boss = at(await signIn("chapter@example.test", DEPUTY));

    await boss("/api/member.invite", { email: "deputy-role@example.test", role: "owner" });
    const id = ((await boss("/api/member.list")).body as unknown as Roster)
      .members.find((m) => m.email === "deputy-role@example.test")!.id;
    /* ⚠️ A deputy who can manage members and may not write notes — the ordinary
       arrangement, and the only one where the escalation is reachable. */
    await boss("/api/member.permissions", { id, grants: [], revoked: ["note:write"] });
    deputy = at(await signIn("deputy-role@example.test", DEPUTY));
  });

  it("refuses a role carrying a key its author does not hold", async () => {
    expect((await deputy("/api/role.list")).status).toBe(200);
    const out = await deputy("/api/role.save", {
      id: "scribe", name: "Scribe", permissions: ["note:write"],
    });
    expect(out.status).toBe(403);
  });

  /* ⚠️ And the list does not OFFER what the save would refuse — a checkbox that
     answers 403 is a form somebody fills in twice. */
  it("does not offer them a permission they could not put in one", async () => {
    const listed = (await deputy("/api/role.list")).body as unknown as Listed;
    expect(listed.permissions).not.toContain("note:write");
  });

  /* ⚠️ What they DO hold they may still bundle, or this is not delegation. */
  it("lets them bundle what they still have", async () => {
    const out = await deputy("/api/role.save", { id: "greeter", name: "Greeter", permissions: ["note:read"] });
    expect(out.status).toBe(200);
  });

  /*
    ⚠️ AND THE SAME BOUND ON THE INVITE DOOR, which had none at all. Without it
    the way past every check above is to invite a second address of your own into
    a role that already carries what you lack.
  */
  it("refuses them an invitation into a role beyond them", async () => {
    const out = await deputy("/api/member.invite", { email: "proxy@example.test", role: "owner" });
    expect(out.status).toBe(403);
  });
});

describe("a role somebody holds is refused rather than quietly deleted", () => {
  /*
    ⚠️ DELETING IT LEAVES EVERY MEMBER ON IT RESOLVING TO NOTHING — signed in, in
    the workspace, able to do nothing, with nothing on any screen saying why.
    Moving them somewhere automatically is worse: a permission change nobody
    asked for, applied to people who are not in the room.
  */
  it("refuses while it is held, and allows once it is not", async () => {
    await owner("/api/role.save", { id: "temp", name: "Temporary", permissions: ["note:read"] });
    await owner("/api/member.invite", { email: "temp@example.test", role: "temp" });

    expect((await owner("/api/role.remove", { id: "temp" })).status).toBe(409);

    const id = ((await owner("/api/member.list")).body as unknown as Roster)
      .members.find((m) => m.email === "temp@example.test")!.id;
    expect((await owner("/api/member.remove", { id })).status).toBe(200);
    expect((await owner("/api/role.remove", { id: "temp" })).status).toBe(200);
  });

  it("refuses one that was never this workspace's to delete", async () => {
    expect((await owner("/api/role.remove", { id: "owner" })).status).toBe(404);
  });
});

describe("moving somebody between roles", () => {
  /*
    ⚠️ THE ONLY OTHER WAY TO CHANGE WHAT SOMEBODY DOES IS TO REMOVE AND RE-INVITE
    THEM, which frees and re-takes a seat, loses the invitation trail, and asks a
    colleague to accept a second time for access they already have.
  */
  it("changes what they may do, in place", async () => {
    await owner("/api/member.invite", { email: "promoted@example.test", role: "reader" });
    const id = ((await owner("/api/member.list")).body as unknown as Roster)
      .members.find((m) => m.email === "promoted@example.test")!.id;

    const them = as(await signIn("promoted@example.test", ORIGIN));
    expect((await them("/api/note.create", { title: "before" })).status).toBe(403);

    expect((await owner("/api/member.role", { id, role: "owner" })).status).toBe(200);
    /*
      ⚠️ NOT 200, AND THAT IS THE RIGHT ANSWER. The permission gate now passes and
      the next one up refuses: an owner has a document to accept that a reader
      does not, so the answer is 451 rather than 403. Asserting 200 here would be
      asserting that a re-role skips the legal gate — which is the thing that
      gate exists to make impossible.
    */
    expect((await them("/api/note.create", { title: "after" })).status).not.toBe(403);
    expect(((await owner("/api/member.list")).body as unknown as Roster)
      .members.find((m) => m.id === id)!.role).toBe("owner");
  });

  /*
    ⚠️ AND MOVING THE LAST ADMINISTRATOR OUT IS THE SAME STRANDING AS REMOVING
    THEM — a workspace nobody can administer either way, and the quieter of the
    two because everybody is still in the room.
  */
  it("refuses to move the last administrator out of the role that administers", async () => {
    const STRAND = "https://alone.hello.4dl.app";
    const founding = await signIn("alone@example.test", SETUP);
    await post(SETUP, "/api/identity.workspace.create", { slug: "alone" }, founding);
    const cookie = await signIn("alone@example.test", STRAND);
    const res = await worker.fetch(
      new Request(`${STRAND}/api/member.list`, { headers: { cookie } }), env as never,
    );
    const me = ((await res.json()) as unknown as Roster).members[0]!;

    const moved = await worker.fetch(
      new Request(`${STRAND}/api/member.role`, {
        method: "POST", headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ id: me.id, role: "reader" }),
      }),
      env as never,
    );
    expect(moved.status).toBe(409);
  });

  /*
    ⚠️ AND WHAT IT ASKS ABOUT IS WHERE THEY ARE GOING, not that they are moving.
    A last owner promoted into a workspace's own administrator role strands
    nobody — refusing it would make a custom administrator role the one role an
    administrator can never hold, which is the role most workspaces make first.
  */
  it("allows the last administrator into another role that administers", async () => {
    const KEPT = "https://kept.hello.4dl.app";
    const founding = await signIn("kept@example.test", SETUP);
    await post(SETUP, "/api/identity.workspace.create", { slug: "kept" }, founding);
    const cookie = await signIn("kept@example.test", KEPT);
    const call = async (path: string, body?: unknown) => {
      const res = await worker.fetch(
        new Request(`${KEPT}${path}`, {
          method: body === undefined ? "GET" : "POST",
          headers: { "content-type": "application/json", cookie },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
        env as never,
      );
      return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, never> };
    };

    await call("/api/role.save", {
      id: "principal", name: "Principal", permissions: ["note:read", "member:read", "member:manage"],
    });
    const me = ((await call("/api/member.list")).body as unknown as Roster).members[0]!;
    expect((await call("/api/member.role", { id: me.id, role: "principal" })).status).toBe(200);

    /* ⚠️ And they can still manage the roster from there, which is the whole
       claim the check above is making about that role. */
    expect((await call("/api/member.invite", { email: "after-move@example.test", role: "principal" })).status).toBe(200);
  });
});
