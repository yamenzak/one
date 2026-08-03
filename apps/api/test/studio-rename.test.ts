/**
 * RENAMING A STUDIO — the capability that existed and could not be reached.
 *
 * The endpoint has always been there (Better Auth's `organization/update`,
 * owner-only), and the onboarding wizard has always promised it — "your studio
 * already exists, rename it any time in Settings". There was no such screen, so
 * a studio that signed up as "byShujaa" and meant "byShujaa." wore the typo on
 * every screen, every email and every browser tab it would ever have.
 *
 * There are three things to hold, and only the first is obvious.
 *
 *   THE NAME CHANGES         and the session sees it.
 *   THE ADDRESS DOES NOT     `<slug>.` is a hostname, and moving it deletes the
 *                            old one rather than aliasing it — every bookmark,
 *                            every emailed link and every custom-domain passkey
 *                            breaks at once. A rename must not touch it, and
 *                            this asserts the studio still answers on the same
 *                            door afterwards.
 *   THE CACHE FOLLOWS        the display name lives inside the CACHED host
 *                            resolution (60s), which `/api/host`, the pre-auth
 *                            sign-in screen and the PWA manifest all read. The
 *                            guard only invalidated on a SLUG change, so a
 *                            rename reported as saved kept serving the old name
 *                            for a minute on the one screen an owner checks it
 *                            on. The probe below is read BEFORE the rename
 *                            precisely to put the stale value in the cache —
 *                            without that first read the assertion passes for
 *                            the wrong reason.
 *
 * Plus the authorization floor: somebody else's owner may not rename this
 * studio. That is Better Auth's check rather than ours (`organization:update`
 * is on the owner role in `access.ts` and on no other), and it is asserted here
 * because nothing else in the suite exercises this endpoint at all.
 */

import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";
import { seedBilling } from "../src/billing-store.js";

const ORIGIN = "http://setup.localhost:8787";
const studioOrigin = (slug: string) => `http://${slug}.localhost:8787`;
const db = () => env.DB as D1Database;

function grabCookies(res: Response): string {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  return (h.getSetCookie?.() ?? []).map((c: string) => c.split(";")[0]).join("; ");
}
const H = (cookie: string, origin = ORIGIN) => ({ cookie, origin, "content-type": "application/json" });

async function signUp(email: string, studio: string, slug: string) {
  await SELF.fetch(`${ORIGIN}/api/auth/email-otp/send-verification-otp`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  const row = await db()
    .prepare("SELECT value FROM verification WHERE identifier LIKE ? ORDER BY createdAt DESC LIMIT 1")
    .bind(`%otp%${email}%`)
    .first<{ value: string }>();
  const otp = ((row?.value ?? "").match(/\d{6}/) ?? [])[0];
  if (!otp) throw new Error(`no OTP for ${email}`);
  const cookie = grabCookies(
    await SELF.fetch(`${ORIGIN}/api/auth/sign-in/email-otp`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ email, otp }),
    }),
  );
  await SELF.fetch(`${ORIGIN}/api/auth/organization/create`, {
    method: "POST",
    headers: H(cookie),
    body: JSON.stringify({ name: studio, slug }),
  });
  const ctx = (await (await SELF.fetch(`${ORIGIN}/api/context`, { headers: { cookie, origin: ORIGIN } })).json()) as {
    active: { tenantId: string };
  };
  return { cookie, tenantId: ctx.active.tenantId, origin: studioOrigin(slug) };
}

const rename = (cookie: string, name: string, organizationId?: string) =>
  SELF.fetch(`${ORIGIN}/api/auth/organization/update`, {
    method: "POST",
    headers: H(cookie),
    body: JSON.stringify(organizationId ? { organizationId, data: { name } } : { data: { name } }),
  });

const hostName = async (origin: string) => {
  const body = (await (await SELF.fetch(`${origin}/api/host`)).json()) as { tenant: { name: string; slug: string } | null };
  return body.tenant;
};

let owner = "";
let tenantId = "";
let studio = "";
let stranger = "";

beforeAll(async () => {
  await ensureSchema(db());
  await seedBilling(db());
  const s = await signUp("rename-owner@test.dev", "byShujaa", "byshujaa");
  owner = s.cookie;
  tenantId = s.tenantId;
  studio = s.origin;
  // A second owner, with their own studio and no membership of the first.
  stranger = (await signUp("rename-stranger@test.dev", "Other Studio", "other-studio")).cookie;
});

/**
 * The whole arc in ONE test, deliberately. The pool isolates storage per test,
 * so a rename in one `it` is rolled back before the next one runs — splitting
 * these would assert the pre-rename world four times and pass while proving
 * nothing.
 */
describe("an owner can fix their studio's name", () => {
  it("renames it everywhere at once, and moves nothing else", async () => {
    // Warm the host cache with the OLD name. Without this first read the
    // invalidation assertion below passes whether or not anything invalidates.
    expect((await hostName(studio))?.name).toBe("byShujaa");

    const res = await rename(owner, "byShujaa.");
    expect(res.status).toBe(200);

    // 1. The session.
    const ctx = (await (await SELF.fetch(`${ORIGIN}/api/context`, { headers: { cookie: owner, origin: ORIGIN } })).json()) as {
      active: { tenantName: string };
    };
    expect(ctx.active.tenantName).toBe("byShujaa.");

    // 2. The stored name, character for character — the punctuation IS the change.
    const row = await db().prepare('SELECT name FROM "organization" WHERE id = ?').bind(tenantId).first<{ name: string }>();
    expect(row?.name).toBe("byShujaa.");

    // 3. The cached host resolution, which feeds the pre-auth sign-in screen,
    //    the boot splash and the PWA manifest — every surface an owner would
    //    look at to check the rename worked.
    const probe = await hostName(studio);
    expect(probe?.name).toBe("byShujaa.");

    // 4. The ADDRESS, untouched: no slug was sent, so the studio still answers
    //    on the same door under the same label and no hostname row moved.
    expect(probe?.slug).toBe("byshujaa");
    const rows = await db()
      .prepare("SELECT hostname FROM tenant_domains WHERE tenant_id = ? AND kind = 'subdomain'")
      .bind(tenantId)
      .all<{ hostname: string }>();
    expect(rows.results.map((r) => r.hostname)).toEqual(["byshujaa.kova.4dl.app"]);
  });
});

describe("…and only their own", () => {
  it("refuses another studio's owner", async () => {
    const res = await rename(stranger, "Not Yours", tenantId);
    expect(res.ok).toBe(false);
    const row = await db().prepare('SELECT name FROM "organization" WHERE id = ?').bind(tenantId).first<{ name: string }>();
    expect(row?.name).toBe("byShujaa");
  });
});
