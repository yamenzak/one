/**
 * WHAT HAPPENS AFTER ACCESS RUNS OUT, and the codes that top it back up —
 * version 0.8, which finishes the access economy.
 *
 * ⚠️ THE LADDER IS THE STUDIO'S RULE, NOT THE PLATFORM'S. Access running out
 * already withholds what was sold; this is the separate question of what happens
 * to the RECORD afterwards, and the answer differs by trade. The platform works
 * out who has lapsed and how far; what "archive" means for a client is a thing
 * only this product can know.
 *
 * ⚠️ AND THE SWEEP FREEZES WHILE THE STUDIO ITSELF IS BEHIND ON ITS OWN BILL. A
 * studio the platform suspended must not be quietly shredding a roster it can no
 * longer see — the rungs at the end of this are archive and delete.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { sql, type ResolvedRegion } from "@one/kernel";
import { bindingsFor } from "@one/runtime";
import worker from "../src/worker.js";
import { post, SETUP, signIn } from "./session.js";

const SLUG = "arkle";
const STUDIO = `https://${SLUG}.kova.4dl.app`;

const as = (cookie: string) => async (path: string, body?: unknown) => {
  const res = await worker.fetch(
    new Request(`${STUDIO}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env as never,
  );
  return { status: res.status, body: (await res.json()) as Record<string, never> };
};

const db = () =>
  bindingsFor({ db: sql() }, { DB: (env as Record<string, unknown>).DB }, { defaultRegion: "auto" })("auto" as ResolvedRegion).db;
/* ⚠️ A job's schedule is a fact about the DEPLOYMENT, so the record is global. */
const global = () =>
  bindingsFor({ db: sql() }, { DB: (env as Record<string, unknown>).DIRECTORY }, { defaultRegion: "auto" })("auto" as ResolvedRegion).db;

/**
 * The sweep, run by hand — the runtime's scheduled entry point.
 *
 * ⚠️ THE RUN RECORD IS CLEARED FIRST, because a daily job that already ran today
 * is not due, and a test asserting on several days of a ladder would otherwise
 * be asserting on one sweep and four no-ops. Clearing it is the honest way to
 * say "the next day" — the alternative is a test that passes because nothing
 * happened.
 */
const sweep = async () => {
  await global().run(`DELETE FROM job_run WHERE job = ?`, "lapsed-clients");
  return worker.scheduled(null, env as never);
};

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

type Roster = { rows: { id: string; name: string }[] };
type Runway = { runway: { byScope: Record<string, number> } };

let coach: ReturnType<typeof as>;
let tenantId = "";
let ro = "";
let client: ReturnType<typeof as>;

/** ⚠️ A lapse is a date in the past, and a test cannot wait a month for one. */
const lapsedSince = async (subjectId: string, when: string) => {
  await db().run(
    `UPDATE subject_access SET budgets_json = ? WHERE tenant_id = ? AND subject_id = ?`,
    JSON.stringify({ coaching: when }), tenantId, subjectId,
  );
};

beforeAll(async () => {
  const founding = await signIn(`${SLUG}@example.test`, SETUP);
  const made = await post(SETUP, "/api/identity.workspace.create", { slug: SLUG }, founding);
  tenantId = made.body.tenantId as string;
  coach = as(await signIn(`${SLUG}@example.test`, STUDIO));

  ro = (await coach("/api/client.create", { name: "Ro" })).body.id as unknown as string;
  await coach("/api/member.invite", { email: `ro@${SLUG}.example.test`, role: "client", subjectId: ro });
  client = as(await signIn(`ro@${SLUG}.example.test`, STUDIO));

  await coach("/api/commerce.package.save", {
    id: "month", name: "A month", price: { minor: 9_900, currency: "USD" },
    flags: { training: true }, budgets: { coaching: 30 }, oncePerCustomer: false,
  });
  await coach("/api/commerce.grant", { subjectId: ro, packageId: "month" });
});

/* --------------------------------------------------------------- setting --- */

describe("deciding what happens, and when", () => {
  it("starts with no ladder at all, and says what the floor is", async () => {
    const out = (await coach("/api/commerce.lapse")).body as unknown as { ladder: unknown; floorDays: number };
    expect(out.ladder).toEqual({});
    expect(out.floorDays).toBe(14);
  });

  /*
    ⚠️ REFUSED RATHER THAN CLAMPED. Quietly doing something gentler than what
    somebody typed leaves a settings screen showing a number the sweep does not
    use — and the number they meant was about deleting people's records.
  */
  it("refuses to archive or delete sooner than the floor", async () => {
    const soon = await coach("/api/commerce.lapse.set", { ladder: { archiveAfter: 7 } });
    expect(soon.status).toBe(400);
    expect(soon.body.meta).toMatchObject({ field: "ladder" });
  });

  it("refuses a ladder that goes backwards", async () => {
    const back = await coach("/api/commerce.lapse.set", { ladder: { archiveAfter: 90, deleteAfter: 30 } });
    expect(back.status).toBe(400);
  });

  it("takes one that makes sense", async () => {
    const ok = await coach("/api/commerce.lapse.set", { ladder: { readOnlyAfter: 3, archiveAfter: 30, deleteAfter: 120 } });
    expect(ok.status).toBe(200);
    expect(((await coach("/api/commerce.lapse")).body as unknown as { ladder: unknown }).ladder)
      .toEqual({ readOnlyAfter: 3, archiveAfter: 30, deleteAfter: 120 });
  });
});

/* ----------------------------------------------------------------- sweep --- */

describe("the sweep", () => {
  const roster = async () => ((await coach("/api/client.list")).body as unknown as Roster).rows;
  const ran = async () => {
    const report = (await sweep()) as unknown as { job: string; done: number; skipped: number }[];
    return report.find((r) => r.job === "lapsed-clients")!;
  };

  /*
    ⚠️ SOMEBODY STILL PAYING IS NOT LAPSED, and neither is somebody who never
    bought anything. Treating "holds nothing" as "lapsed today" would archive
    every record a studio ever created, on the day they switched the ladder on.
  */
  it("leaves alone anybody whose access is still running", async () => {
    await sweep();
    expect((await roster()).some((c) => c.id === ro)).toBe(true);
  });

  /*
    ⚠️ A STUDIO WITH NO LADDER IS NOT SWEPT AT ALL, and the report says so rather
    than showing a clean run over nothing. Otherwise every studio on the
    deployment pays for a scan of its whole customer table daily to decide that
    nobody is anywhere.
  */
  it("does not read a roster for a studio that configured no ladder", async () => {
    const bare = "https://swaledale.kova.4dl.app";
    const founding = await signIn("swaledale@example.test", SETUP);
    await post(SETUP, "/api/identity.workspace.create", { slug: "swaledale" }, founding);

    const report = (await sweep()) as unknown as { job: string; idle: number; failed: boolean }[];
    const run = report.find((r) => r.job === "lapsed-clients")!;
    /* Both studios are swept in one run, and at least one had nothing to do. */
    expect(run.idle).toBeGreaterThan(0);
    /*
      ⚠️ AND IDLE IS NOT A FAILURE. Most workspaces have not configured a ladder,
      so counting them as skipped made an ordinary deployment a permanently
      failing job — which is the alarm nobody ends up reading.
    */
    expect(run.failed).toBe(false);
    expect(bare).toBeTruthy();
  });

  /*
    ⚠️ AND SOMEBODY WITH A ROW BUT NO DAYS IS NOT LAPSED EITHER. An exception set
    by hand opens their access row with no budgets in it, so the sweep sees them
    — and reading "nothing has expired" as "everything expired long ago" would
    delete the one client a coach took the trouble to make an exception for.
  */
  it("leaves alone somebody who never held anything", async () => {
    const never = (await coach("/api/client.create", { name: "Never bought" })).body.id as unknown as string;
    expect((await coach("/api/commerce.override", { subjectId: never, changes: { training: true } })).status).toBe(200);

    await sweep();
    expect((await roster()).some((c) => c.id === never)).toBe(true);
  });

  /*
    ⚠️ THE GENTLE RUNGS WRITE NOTHING AT ALL. Access running out already
    withholds what was sold — a customer flag resolves off the moment the days
    do. Writing a second copy of that state is how two answers to "may they log
    this" come to disagree.
  */
  it("takes no action for a rung that is already true", async () => {
    await lapsedSince(ro, daysAgo(5));
    await sweep();

    expect((await roster()).some((c) => c.id === ro)).toBe(true);
    /* And the capability is off anyway, because the days are gone. */
    expect((await client("/api/workout.create", { client: ro, day: "2026-08-01" })).status).toBe(403);
  });

  it("archives somebody who has been lapsed long enough", async () => {
    await lapsedSince(ro, daysAgo(40));
    await sweep();

    /* ⚠️ Archived keeps the record and the seat — they are still somebody the
       studio coaches, and is not coaching right now. */
    expect((await roster()).some((c) => c.id === ro)).toBe(false);
    const gone = await db().first<{ deleted_at: string | null }>(
      `SELECT deleted_at FROM clients WHERE id = ?`, ro,
    );
    expect(gone!.deleted_at).not.toBeNull();
  });

  /*
    ⚠️ THE SWEEP MUST NOT WALK SOMEBODY THROUGH EVERY RUNG IT SKIPPED. One that
    missed a week lands them where they should be today — which for the
    destructive pair is the difference between archiving on the way past and
    deleting, and doing both in one run.
  */
  it("lands somebody at the furthest rung rather than the next one", async () => {
    const long = (await coach("/api/client.create", { name: "Long gone" })).body.id as unknown as string;
    await coach("/api/commerce.grant", { subjectId: long, packageId: "month" });
    await lapsedSince(long, daysAgo(400));

    await sweep();
    const row = await db().first<{ id: string }>(`SELECT id FROM clients WHERE id = ?`, long);
    expect(row, "deleted outright, not archived on the way past").toBeNull();
  });

  /*
    ⚠️ FROZEN WHILE THE STUDIO IS BEHIND ON ITS OWN BILL. Whatever is going on
    between the platform and a studio, it is not a reason to act on their
    clients' records on their behalf — and the rungs here are archive and delete.
  */
  it("does nothing at all while the studio is itself past due", async () => {
    const making = await coach("/api/client.create", { name: "Held" });
    expect(making.status, "the roster fixture must not have hit the client quota").toBe(200);
    const held = making.body.id as unknown as string;
    await coach("/api/commerce.grant", { subjectId: held, packageId: "month" });
    await lapsedSince(held, daysAgo(400));

    /* ⚠️ Upserted: a studio that never chose a plan has no row at all, and an
       UPDATE against nothing leaves the sweep unfrozen and the test green. */
    await db().run(
      `INSERT INTO subscription (tenant_id, status, past_due_at, updated_at) VALUES (?, 'past_due', ?, ?)
       ON CONFLICT(tenant_id) DO UPDATE SET status = 'past_due', past_due_at = excluded.past_due_at`,
      tenantId, daysAgo(2), daysAgo(2),
    );
    await sweep();
    expect(await db().first(`SELECT id FROM clients WHERE id = ?`, held)).not.toBeNull();

    /* And it resumes the moment the studio is square again. */
    await db().run(`UPDATE subscription SET status = 'active', past_due_at = NULL WHERE tenant_id = ?`, tenantId);
    await sweep();
    expect(await db().first(`SELECT id FROM clients WHERE id = ?`, held)).toBeNull();
  });
});

/* ----------------------------------------------------------------- codes --- */

describe("a code tops access up", () => {
  let topped = "";

  beforeAll(async () => {
    topped = (await coach("/api/client.create", { name: "Topped" })).body.id as unknown as string;
  });

  it("refuses a scope nothing is gated on", async () => {
    const bad = await coach("/api/commerce.code.issue", { code: "TYPO2026", scope: "coachng", days: 7, uses: 1 });
    expect(bad.status).toBe(400);
    expect(bad.body.meta).toMatchObject({ field: "scope" });
  });

  it("issues one and shows what is left of it", async () => {
    const made = await coach("/api/commerce.code.issue", { code: "summer26", scope: "coaching", days: 14, uses: 2 });
    expect(made.status).toBe(200);
    /* ⚠️ Folded to upper case, because nobody types a code the way it was written. */
    expect(made.body).toMatchObject({ code: "SUMMER26", usesLeft: 2 });

    const listed = ((await coach("/api/commerce.codes")).body as unknown as { codes: { code: string }[] }).codes;
    expect(listed.some((c) => c.code === "SUMMER26")).toBe(true);
  });

  /*
    ⚠️ A CODE TOPS UP; IT NEVER CREATES ACCESS — and that is checked BEFORE the
    use is claimed. This route is callable by a customer, so a code that leaks
    would otherwise mint access for anybody holding the string, and every attempt
    would burn a use belonging to somebody who was given it.
  */
  it("refuses somebody holding no package, without spending a use", async () => {
    await coach("/api/member.invite", { email: `topped@${SLUG}.example.test`, role: "client", subjectId: topped });
    const stranger = as(await signIn(`topped@${SLUG}.example.test`, STUDIO));

    const refused = await stranger("/api/commerce.redeem", { subjectId: topped, code: "SUMMER26" });
    expect(refused.status).toBe(409);
    expect(refused.body.meta).toMatchObject({ reason: "no_package_to_top_up" });

    const listed = ((await coach("/api/commerce.codes")).body as unknown as { codes: { code: string; usesLeft: number }[] }).codes;
    expect(listed.find((c) => c.code === "SUMMER26")!.usesLeft, "a refusal must not spend a use").toBe(2);
  });

  it("adds its days onto what is already running", async () => {
    await coach("/api/commerce.grant", { subjectId: topped, packageId: "month" });
    const before = ((await coach(`/api/commerce.capabilities?subjectId=${topped}`)).body as unknown as Runway)
      .runway.byScope.coaching!;

    const holder = as(await signIn(`topped@${SLUG}.example.test`, STUDIO));
    const out = await holder("/api/commerce.redeem", { subjectId: topped, code: "SUMMER26" });
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ scope: "coaching", daysAdded: 14 });

    const after = ((await coach(`/api/commerce.capabilities?subjectId=${topped}`)).body as unknown as Runway)
      .runway.byScope.coaching!;
    expect(after).toBe(before + 14);
  });

  /* ⚠️ The conditional write is the lock: a code with uses left runs out. */
  it("spends a use each time and then refuses", async () => {
    const holder = as(await signIn(`topped@${SLUG}.example.test`, STUDIO));
    expect((await holder("/api/commerce.redeem", { subjectId: topped, code: "SUMMER26" })).status).toBe(200);
    expect((await holder("/api/commerce.redeem", { subjectId: topped, code: "SUMMER26" })).status).toBe(404);

    const listed = ((await coach("/api/commerce.codes")).body as unknown as { codes: { code: string; usesLeft: number }[] }).codes;
    expect(listed.find((c) => c.code === "SUMMER26")!.usesLeft).toBe(0);
  });

  it("refuses one that has expired", async () => {
    await coach("/api/commerce.code.issue", {
      code: "LASTYEAR", scope: "coaching", days: 7, uses: 5, expiresAt: daysAgo(1),
    });
    const holder = as(await signIn(`topped@${SLUG}.example.test`, STUDIO));
    expect((await holder("/api/commerce.redeem", { subjectId: topped, code: "LASTYEAR" })).status).toBe(404);
  });

  it("cannot be redeemed onto somebody else's access", async () => {
    await coach("/api/commerce.code.issue", { code: "MINEONLY", scope: "coaching", days: 7, uses: 1 });
    const holder = as(await signIn(`topped@${SLUG}.example.test`, STUDIO));
    expect((await holder("/api/commerce.redeem", { subjectId: ro, code: "MINEONLY" })).status).toBe(403);
  });
});
