/**
 * A PERSON HAS ONE FACE, AND THREE PAYLOADS HAVE TO CARRY IT.
 *
 * `registry/avatars.ts` on the app side makes it impossible to assemble a face
 * from the wrong fields, and a conformance test keeps every `<Avatar>` spreading
 * a resolver. Neither can make a payload CARRY the fields — and that is where
 * this bug actually lived. Three endpoints return staff-shaped rows, each joined
 * `member` → `user`, and `user` on a passwordless stack has a name and an email
 * and nothing else. So Business → Staff drew a robot seeded from a user id while
 * the app bar, two inches above it, drew the same person's photograph.
 *
 * A regex over the screens cannot catch this: the call sites were already
 * spreading the resolver correctly. What was missing was upstream, in the JSON.
 * So the assertion is here, against the real routes, and it covers all three —
 * fixing one and not the others only moves which screen disagrees.
 */

import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";

const B = "http://setup.localhost:8787";

function grabCookies(res: Response): string {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  return (headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}
const auth = (cookies: string) => ({ Cookie: cookies, origin: B });
const J = (cookies: string) => ({ "content-type": "application/json", ...auth(cookies) });

async function signIn(email: string): Promise<string> {
  const db = env.DB as D1Database;
  await SELF.fetch(`${B}/api/auth/email-otp/send-verification-otp`, {
    method: "POST", headers: { "content-type": "application/json", origin: B },
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  const row = await db.prepare("SELECT value FROM verification ORDER BY createdAt DESC LIMIT 1").first<{ value: string }>();
  const otp = ((row?.value ?? "").match(/\d{6}/) ?? [])[0];
  if (!otp) throw new Error("could not read OTP from verification table");
  return grabCookies(await SELF.fetch(`${B}/api/auth/sign-in/email-otp`, {
    method: "POST", headers: { "content-type": "application/json", origin: B },
    body: JSON.stringify({ email, otp }),
  }));
}

interface Face { clientId?: string | null; avatarUrl?: string | null; avatarSeed?: string | null }

beforeAll(async () => { await ensureSchema(env.DB as D1Database); });

describe("a staff member who also trains here wears one face", () => {
  it("carries their photo on the roster, the member list AND the coach assignment", async () => {
    const email = "facesowner@test.dev";
    let owner = await signIn(email);
    const org = await SELF.fetch(`${B}/api/auth/organization/create`, {
      method: "POST", headers: J(owner),
      body: JSON.stringify({ name: "Faces Studio", slug: "faces-studio" }),
    });
    const refreshed = grabCookies(org);
    if (refreshed) owner = refreshed;
    const ctx = (await (await SELF.fetch(`${B}/api/context`, { headers: auth(owner) })).json()) as {
      active: { tenantId: string }; user: { id: string };
    };

    // The owner is ALSO a client here — the ordinary case at a training studio,
    // and the one where the two faces used to disagree.
    const { client } = (await (await SELF.fetch(`${B}/api/clients`, {
      method: "POST", headers: J(owner), body: JSON.stringify({ displayName: "Owner Who Lifts", email }),
    })).json()) as { client: { id: string } };
    const db = env.DB as D1Database;
    await db.prepare("UPDATE clients SET user_id = ?, avatar_url = ?, avatar_seed = NULL WHERE id = ?")
      .bind(ctx.user.id, "/api/media/face-key", client.id).run();

    // 1 — the staff roster (@4dl/auth's route, through `decorateMembers`)
    const staff = (await (await SELF.fetch(`${B}/api/staff`, { headers: auth(owner) })).json()) as { members: (Face & { userId: string })[] };
    const onRoster = staff.members.find((m) => m.userId === ctx.user.id);
    expect(onRoster, "the owner is missing from their own staff roster").toBeTruthy();
    expect(onRoster!.avatarUrl, "the staff roster dropped the photo — this is the original defect").toBe("/api/media/face-key");
    expect(onRoster!.clientId).toBe(client.id);

    // 2 — /api/members, behind the coach picker and the permissions screen
    const members = (await (await SELF.fetch(`${B}/api/members`, { headers: auth(owner) })).json()) as { members: (Face & { userId: string })[] };
    expect(members.members.find((m) => m.userId === ctx.user.id)?.avatarUrl).toBe("/api/media/face-key");

    // 3 — the assigned-coach list on a client's Manage tab
    const { client: other } = (await (await SELF.fetch(`${B}/api/clients`, {
      method: "POST", headers: J(owner), body: JSON.stringify({ displayName: "Someone Else" }),
    })).json()) as { client: { id: string } };
    await SELF.fetch(`${B}/api/clients/${other.id}/trainers`, {
      method: "POST", headers: J(owner), body: JSON.stringify({ trainerUserId: ctx.user.id, isPrimary: true }),
    });
    const trainers = (await (await SELF.fetch(`${B}/api/clients/${other.id}/trainers`, { headers: auth(owner) })).json()) as { trainers: (Face & { userId: string })[] };
    expect(trainers.trainers.find((t) => t.userId === ctx.user.id)?.avatarUrl).toBe("/api/media/face-key");
  });

  it("carries the SHUFFLED SEED too, so a reshuffled robot follows them", async () => {
    // The half of the bug that survives with no photo at all: `staffAvatar` used
    // to seed from `userId` while `meAvatar` seeded from `avatarSeed`, so a
    // person who reshuffled got the new robot everywhere except the staff list.
    const email = "facesseed@test.dev";
    let owner = await signIn(email);
    const org = await SELF.fetch(`${B}/api/auth/organization/create`, {
      method: "POST", headers: J(owner), body: JSON.stringify({ name: "Seed Studio", slug: "seed-studio" }),
    });
    const refreshed = grabCookies(org);
    if (refreshed) owner = refreshed;
    const ctx = (await (await SELF.fetch(`${B}/api/context`, { headers: auth(owner) })).json()) as { user: { id: string } };
    const { client } = (await (await SELF.fetch(`${B}/api/clients`, {
      method: "POST", headers: J(owner), body: JSON.stringify({ displayName: "Reshuffled", email }),
    })).json()) as { client: { id: string } };
    await (env.DB as D1Database)
      .prepare("UPDATE clients SET user_id = ?, avatar_url = NULL, avatar_seed = ? WHERE id = ?")
      .bind(ctx.user.id, "chosen-robot", client.id).run();

    const staff = (await (await SELF.fetch(`${B}/api/staff`, { headers: auth(owner) })).json()) as { members: (Face & { userId: string })[] };
    expect(staff.members.find((m) => m.userId === ctx.user.id)?.avatarSeed).toBe("chosen-robot");
  });

  it("leaves a staff-only account alone rather than inventing a face", async () => {
    // Somebody who works here and does not train here has no client row, and the
    // honest answer is no photo and no seed — the resolver then falls back to
    // the user id, which is what it has always done for them.
    let owner = await signIn("facesonly@test.dev");
    const org = await SELF.fetch(`${B}/api/auth/organization/create`, {
      method: "POST", headers: J(owner), body: JSON.stringify({ name: "Only Studio", slug: "only-studio" }),
    });
    const refreshed = grabCookies(org);
    if (refreshed) owner = refreshed;
    const ctx = (await (await SELF.fetch(`${B}/api/context`, { headers: auth(owner) })).json()) as { user: { id: string } };
    const staff = (await (await SELF.fetch(`${B}/api/staff`, { headers: auth(owner) })).json()) as { members: (Face & { userId: string })[] };
    const me = staff.members.find((m) => m.userId === ctx.user.id);
    expect(me).toBeTruthy();
    expect(me!.avatarUrl ?? null).toBeNull();
    expect(me!.clientId ?? null).toBeNull();
  });
});
