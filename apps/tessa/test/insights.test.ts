/**
 * INSIGHTS — the arithmetic, over real data.
 *
 * A metric that is quietly wrong is worse than a missing one: nobody checks a
 * number that looks plausible. Three shapes here are wrong in the direction that
 * FLATTERS the centre, which is the direction nobody questions:
 *
 *   a release rate over zero loads reported as 100%
 *   a day with no Freigabe reported as a turnaround of zero hours
 *   an expiry bucket omitted when it is empty, so its absence reads as
 *     "not applicable" rather than "none"
 *
 * Each is a one-character difference from the correct code and none of them
 * throws. This file pins all three.
 */

import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";

const SETUP = "http://setup.localhost:8787";
const db = () => env.DB as D1Database;

function cookies(res: Response): string {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  return (h.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

async function signIn(email: string): Promise<string> {
  await SELF.fetch(`${SETUP}/api/auth/email-otp/send-verification-otp`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: SETUP },
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  const row = await db()
    .prepare("SELECT value FROM verification WHERE identifier LIKE ? ORDER BY createdAt DESC LIMIT 1")
    .bind(`%otp%${email}%`)
    .first<{ value: string }>();
  const otp = (row?.value ?? "").match(/\d{6}/)?.[0];
  return cookies(
    await SELF.fetch(`${SETUP}/api/auth/sign-in/email-otp`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: SETUP },
      body: JSON.stringify({ email, otp }),
    }),
  );
}

async function centre() {
  const email = `ins-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const slug = `ins-${crypto.randomUUID().slice(0, 6)}`;
  const jar = await signIn(email);
  await SELF.fetch(`${SETUP}/api/auth/organization/create`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: SETUP, cookie: jar },
    body: JSON.stringify({ name: "Praxis", slug }),
  });
  const org = await db().prepare('SELECT id FROM "organization" WHERE slug = ?').bind(slug).first<{ id: string }>();
  return { origin: `http://${slug}.localhost:8787`, jar, tenantId: org!.id };
}

const iso = (daysAgo: number, hour = 9) =>
  new Date(Date.now() - daysAgo * 86_400_000 + hour * 3_600_000).toISOString();

beforeAll(async () => {
  await ensureSchema(db());
});

describe("a centre with no history", () => {
  it("reports NO rate rather than a flattering one", async () => {
    const c = await centre();
    const res = await SELF.fetch(`${c.origin}/api/insights`, { headers: { cookie: c.jar } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { headline: { loads: number; releaseRate: number | null; turnaroundHours: number | null } };

    expect(body.headline.loads).toBe(0);
    // The whole point. `(0-0)/0` is NaN and `|| 100` is the tempting fix; both
    // put a number on screen that says the centre is doing well at nothing.
    expect(body.headline.releaseRate).toBeNull();
    expect(body.headline.turnaroundHours).toBeNull();
  });

  it("still returns every expiry bucket, at zero", async () => {
    const c = await centre();
    const body = (await (await SELF.fetch(`${c.origin}/api/insights`, { headers: { cookie: c.jar } })).json()) as {
      expiry: { bucket: string; n: number }[];
    };
    // A GROUP BY returns no row for an empty bucket. Dropping it would make the
    // chart show four bars one week and five the next, and teach people to read
    // a missing bucket as "not applicable".
    expect(body.expiry.map((b) => b.bucket)).toEqual(["expired", "week", "month", "quarter", "later"]);
    for (const b of body.expiry) expect(b.n).toBe(0);
  });

  it("returns a dense day series, not just the days something happened", async () => {
    const c = await centre();
    const body = (await (await SELF.fetch(`${c.origin}/api/insights?days=30`, { headers: { cookie: c.jar } })).json()) as {
      window: { days: number };
      series: { days: string[]; loads: number[]; consumption: number[] };
    };
    expect(body.window.days).toBe(30);
    // A sparse series plots four points across a 30-day axis and reads as a
    // trend. Every day is present.
    expect(body.series.days).toHaveLength(30);
    expect(body.series.loads).toHaveLength(30);
    expect(body.series.consumption).toHaveLength(30);
    expect(body.series.loads.every((v) => v === 0)).toBe(true);
  });
});

describe("with loads on the books", () => {
  it("counts them, rates them, and times the Freigabe", async () => {
    const c = await centre();
    const mk = async (id: string, startAgo: number, status: string, releasedHoursAfterEnd: number | null) => {
      const started = iso(startAgo, 8);
      const ended = iso(startAgo, 9);
      const released = releasedHoursAfterEnd == null ? null : iso(startAgo, 9 + releasedHoursAfterEnd);
      await db()
        .prepare(
          "INSERT INTO sterilisation_cycles (id, tenant_id, machine, started_at, ended_at, status, released_at, created_at) VALUES (?, ?, 'A1', ?, ?, ?, ?, ?)",
        )
        .bind(id, c.tenantId, started, ended, status, released, started)
        .run();
    };
    // Four loads: three released (2h, 4h, 6h after the cycle ended), one failed.
    await mk("cy1", 5, "released", 2);
    await mk("cy2", 4, "released", 4);
    await mk("cy3", 3, "released", 6);
    await mk("cy4", 2, "failed", null);

    const body = (await (await SELF.fetch(`${c.origin}/api/insights?days=30`, { headers: { cookie: c.jar } })).json()) as {
      headline: { loads: number; failed: number; releaseRate: number | null; turnaroundHours: number | null };
      series: { turnaround: (number | null)[]; loads: number[] };
    };

    expect(body.headline.loads).toBe(4);
    expect(body.headline.failed).toBe(1);
    expect(body.headline.releaseRate).toBe(75);
    // Mean of 2, 4, 6 — anchored on `ended_at`, because a centre cannot make an
    // autoclave faster and the wait it CAN act on starts when the cycle stops.
    expect(body.headline.turnaroundHours).toBe(4);

    // The loads land on real days.
    expect(body.series.loads.reduce((a, b) => a + b, 0)).toBe(4);

    /**
     * The days with no release are NULL, not 0.
     *
     * `AreaChart` draws null as a break. A zero would draw a line to the floor
     * and read as "released the instant it finished" — the most flattering
     * possible misreading of a day when nobody was there to sign anything off.
     */
    const releasedDays = body.series.turnaround.filter((v) => v != null);
    expect(releasedDays).toHaveLength(3);
    expect(body.series.turnaround.some((v) => v === null)).toBe(true);
    expect(releasedDays.sort((a, b) => a! - b!)).toEqual([2, 4, 6]);
  });
});

describe("scope and access", () => {
  it("is refused without a session", async () => {
    const res = await SELF.fetch("http://nobody.localhost:8787/api/insights");
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("never counts another centre's loads", async () => {
    const a = await centre();
    const b = await centre();
    await db()
      .prepare("INSERT INTO sterilisation_cycles (id, tenant_id, machine, started_at, status, created_at) VALUES (?, ?, 'A1', ?, 'released', ?)")
      .bind(`x-${crypto.randomUUID().slice(0, 6)}`, b.tenantId, iso(1), iso(1))
      .run();
    const body = (await (await SELF.fetch(`${a.origin}/api/insights`, { headers: { cookie: a.jar } })).json()) as {
      headline: { loads: number };
    };
    expect(body.headline.loads).toBe(0);
  });

  it("clamps an absurd window rather than trusting the query string", async () => {
    const c = await centre();
    // 100000 days is a table scan and a chart with 100000 points. The schema
    // clamps to 365; a route that passed it through would be a cheap way to
    // make one tenant's request expensive for everyone.
    const body = (await (await SELF.fetch(`${c.origin}/api/insights?days=100000`, { headers: { cookie: c.jar } })).json()) as {
      window: { days: number };
    };
    expect(body.window.days).toBe(90);
  });
});
