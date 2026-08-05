/**
 * CREDIT ACTIVITY — the report over the D1 ledger mirror.
 *
 * Two things are worth a test here and nothing else is.
 *
 * The first is the NAMING. The ledger stores machine keys, and Business was
 * printing them: an owner read `email.send` and `ai.coach-note`. The fix asks
 * the AI feature registry for a feature's real name, which means a renamed or
 * added feature must not be able to reintroduce the raw key silently — so the
 * table is asserted against the registry rather than against a hardcoded list.
 *
 * The second is the WINDOW ARITHMETIC. `/billing/credits` buckets by the
 * client's day, rolls up spend by reason and by kind, and zero-fills the gaps.
 * Every one of those is a place where a plausible answer can be wrong by a day
 * or by a sign, and none of them fails loudly.
 */

import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";
import { describeReason, KIND_LABEL } from "../src/credit-reasons.js";
import { AI_FEATURES } from "../src/ai-features.js";

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
    method: "POST",
    headers: { "content-type": "application/json", origin: B },
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  const row = await db.prepare("SELECT value FROM verification ORDER BY createdAt DESC LIMIT 1").first<{ value: string }>();
  const otp = ((row?.value ?? "").match(/\d{6}/) ?? [])[0];
  if (!otp) throw new Error("could not read OTP from verification table");
  return grabCookies(
    await SELF.fetch(`${B}/api/auth/sign-in/email-otp`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: B },
      body: JSON.stringify({ email, otp }),
    }),
  );
}

async function studio(tag: string) {
  const db = env.DB as D1Database;
  let owner = await signIn(`${tag}-owner@test.dev`);
  const org = await SELF.fetch(`${B}/api/auth/organization/create`, {
    method: "POST",
    headers: J(owner),
    body: JSON.stringify({ name: `${tag} Studio`, slug: tag }),
  });
  owner = grabCookies(org) || owner;
  const tenantId = ((await (await SELF.fetch(`${B}/api/context`, { headers: auth(owner) })).json()) as { active: { tenantId: string } })
    .active.tenantId;
  return { db, owner, tenantId };
}

interface Report {
  window: { start: string; end: string; days: number };
  totals: { spent: number; added: number; net: number; movements: number };
  daily: { date: string; spent: number; added: number }[];
  byKind: { kind: string; label: string; credits: number; count: number }[];
  byReason: { reason: string; label: string; kind: string; credits: number; count: number }[];
  entries: { at: number; delta: number; reason: string; label: string; kind: string }[];
  truncated: boolean;
}

/** Write straight into the mirror — the DO's own path is metered elsewhere. */
async function ledger(db: D1Database, tenantId: string, rows: { delta: number; balance: number; reason: string; at: number }[]) {
  for (const [i, r] of rows.entries()) {
    await db
      .prepare("INSERT INTO credit_ledger (id, tenant_id, delta, balance, reason, ref, at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(`led_${tenantId}_${i}_${r.at}`, tenantId, r.delta, r.balance, r.reason, null, r.at)
      .run();
  }
}

beforeAll(async () => {
  await ensureSchema(env.DB as D1Database);
});

describe("a reason is named in words, and the AI half comes from the registry", () => {
  it("never leaves a known reason reading as a dotted key", () => {
    // Every AI feature is reachable as `ai.<key>`, and every one of them must
    // resolve to the label the AI settings screen already shows. A feature
    // added without a label here would otherwise ship as `ai.new-thing`.
    for (const f of AI_FEATURES) {
      const d = describeReason(`ai.${f.key}`);
      expect(d.label).toBe(f.label);
      expect(d.kind.startsWith("ai-")).toBe(true);
      expect(KIND_LABEL[d.kind]).toBeTruthy();
    }
    // The fixed half — the reasons no registry owns.
    for (const key of ["email.send", "pack.purchase", "grant.monthly", "admin.adjust", "pack.refund"]) {
      expect(describeReason(key).label).not.toContain(".");
    }
  });

  it("hands back the RAW key for a reason nobody has named", () => {
    // Deliberately not "Other": a gap in the table is a gap in someone's
    // accounting, and a friendly word would make it invisible exactly where
    // they are trying to reconcile a number.
    expect(describeReason("weather.balloon").label).toBe("weather.balloon");
    expect(describeReason("weather.balloon").kind).toBe("other");
  });
});

describe("the window is the studio's, and it adds up", () => {
  it("buckets by day, rolls up spend by reason, and zero-fills the quiet days", async () => {
    const { db, owner, tenantId } = await studio("cred1");
    const day = 86_400_000;
    // Anchor everything at midday UTC so a tz of 0 (what the request below
    // sends) cannot straddle a boundary and make the assertion about rounding.
    const noon = (back: number) => Date.parse(`${new Date(Date.now() - back * day).toISOString().slice(0, 10)}T12:00:00Z`);
    await ledger(db, tenantId, [
      { delta: 5000, balance: 5000, reason: "grant.monthly", at: noon(3) },
      { delta: -40, balance: 4960, reason: "ai.coach-note", at: noon(2) },
      { delta: -60, balance: 4900, reason: "ai.coach-note", at: noon(1) },
      // A minute later, not the same instant: `ORDER BY at DESC` has nothing to
      // break a tie with, so equal timestamps would make the ordering assertion
      // below pass or fail on SQLite's mood.
      { delta: -10, balance: 4890, reason: "email.send", at: noon(1) + 60_000 },
      // Outside a 7-day window — proves the range is a filter, not decoration.
      { delta: -999, balance: 3891, reason: "ai.client-summary", at: noon(40) },
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const r = (await (
      await SELF.fetch(`${B}/api/billing/credits?range=7d&today=${today}&tz=0`, { headers: auth(owner) })
    ).json()) as Report;

    expect(r.window.days).toBe(7);
    expect(r.daily).toHaveLength(7);
    expect(r.totals.movements).toBe(4);
    expect(r.totals.spent).toBe(110);
    expect(r.totals.added).toBe(5000);
    expect(r.totals.net).toBe(4890);

    // The grant is in the totals and NOT in the breakdown: a five-figure
    // positive movement folded into "where did my credits go" is the biggest
    // bar on the screen and the one line nobody is asking about.
    expect(r.byReason.map((x) => x.reason)).toEqual(["ai.coach-note", "email.send"]);
    expect(r.byReason[0]).toMatchObject({ credits: 100, count: 2, label: "Personalized coach note" });
    expect(r.byKind.map((k) => k.kind)).toContain("email");

    // Zero-filled: a chart with holes in it reads as missing data rather than
    // as a quiet week.
    const spent = Object.fromEntries(r.daily.map((d) => [d.date, d.spent]));
    const iso = (back: number) => new Date(Date.now() - back * day).toISOString().slice(0, 10);
    expect(spent[iso(1)]).toBe(70);
    expect(spent[iso(2)]).toBe(40);
    expect(spent[iso(0)]).toBe(0);

    // Newest first, and every row carries the words as well as the key.
    expect(r.entries[0]!.reason).toBe("email.send");
    expect(r.entries.every((e) => e.label && !e.label.includes("."))).toBe(true);
    expect(r.truncated).toBe(false);
  }, 30_000);

  it("keeps one studio's ledger out of another's", async () => {
    const a = await studio("cred2");
    const b = await studio("cred3");
    await ledger(a.db, a.tenantId, [{ delta: -77, balance: 100, reason: "email.send", at: Date.now() - 3600_000 }]);

    const mine = (await (await SELF.fetch(`${B}/api/billing/credits?range=7d&tz=0`, { headers: auth(a.owner) })).json()) as Report;
    const theirs = (await (await SELF.fetch(`${B}/api/billing/credits?range=7d&tz=0`, { headers: auth(b.owner) })).json()) as Report;
    expect(mine.totals.spent).toBe(77);
    expect(theirs.totals.spent).toBe(0);
  }, 30_000);
});
