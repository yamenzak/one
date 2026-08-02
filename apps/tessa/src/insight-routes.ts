/**
 * INSIGHTS — the numbers a reprocessing centre is actually judged on.
 *
 * Not a dashboard of everything countable. Each series here answers a question
 * somebody asks out loud, and three of them are questions an INSPECTOR asks:
 *
 *   throughput      how much is this centre reprocessing, and how much fails?
 *   turnaround      how long between a load finishing and a named person
 *                   releasing it? This is the number that decides whether the
 *                   7am list has sterile trays, and it is invisible without
 *                   measuring — a centre feels "busy", not "slow at Freigabe".
 *   expiry horizon  what goes out of date before we use it?
 *   consumption     what is actually being used, so par levels mean something.
 *   reprocessing    which instruments are near their cycle limit? A tracked
 *                   instrument has a finite number of reprocessings in it, and
 *                   passing that is a device-safety failure, not a cost one.
 *
 * ── The arithmetic is SQL's, not the chart's ────────────────────────────────
 *
 * Every series comes back aggregated and bucketed by date. A route that shipped
 * raw rows and let the screen group them would put the definition of "a week" in
 * the client, where a second screen would define it slightly differently — and
 * two numbers that disagree on one dashboard is worse than either being absent.
 *
 * ── Dates are the CENTRE's, not UTC's ───────────────────────────────────────
 *
 * Buckets use `substr(<ts>, 1, 10)` on the stored ISO string. Tessa writes
 * timestamps in UTC, so a load run at 01:00 in Berlin lands on the previous
 * day's bucket. That is a real skew and it is bounded at one bucket; fixing it
 * properly needs a per-centre timezone, which nothing stores yet. Said here
 * rather than discovered from a chart that is off by one.
 */

import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, requireTenant } from "./auth-context.js";

/** A dense day series — every day present, gaps as 0 — for the given window. */
function densify(rows: { d: string; n: number }[], days: number): { days: string[]; values: number[] } {
  const byDay = new Map(rows.map((r) => [r.d, r.n]));
  const out: { days: string[]; values: number[] } = { days: [], values: [] };
  const start = Date.now() - (days - 1) * 86_400_000;
  for (let i = 0; i < days; i++) {
    const d = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    out.days.push(d);
    /**
     * A day with no activity is 0, not a gap.
     *
     * `AreaChart` renders `null` as a break in the line, which is the right
     * shape for "we did not measure" and the wrong one for "nothing happened".
     * A centre that ran no loads on Sunday ran no loads; the line should touch
     * the floor, not jump the gap and imply continuity.
     */
    out.values.push(byDay.get(d) ?? 0);
  }
  return out;
}

const Window = z.object({ days: z.coerce.number().int().min(7).max(365).default(90) });

export const insightRoutes = new Hono<AppEnv>().get("/insights", async (c) => {
  const who = requireTenant(c);
  if (!who) return c.json({ error: "unauthenticated" }, 401);

  const parsed = Window.safeParse({ days: c.req.query("days") ?? undefined });
  const days = parsed.success ? parsed.data.days : 90;
  const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString();
  const t = who.tenantId;

  const [cycles, released, expiry, consumed, activity, instruments, headline] = await Promise.all([
    // ── Throughput: loads started per day, and how many failed ──────────────
    c.env.DB
      .prepare(
        "SELECT substr(started_at, 1, 10) AS d, COUNT(*) AS n, " +
          "SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed " +
          "FROM sterilisation_cycles WHERE tenant_id = ? AND started_at >= ? GROUP BY d ORDER BY d",
      )
      .bind(t, since)
      .all<{ d: string; n: number; failed: number }>(),

    /**
     * Freigabe turnaround: hours from a load ENDING to its release.
     *
     * Anchored on `ended_at`, not `started_at` — the machine's run time is the
     * machine's, and a centre cannot make an autoclave faster. What it controls
     * is the wait between the cycle finishing and a qualified person signing it
     * off, and that is the number worth watching.
     *
     * `julianday` differences are in days; ×24 gives hours.
     */
    c.env.DB
      .prepare(
        "SELECT substr(released_at, 1, 10) AS d, " +
          "AVG((julianday(released_at) - julianday(ended_at)) * 24.0) AS hours, COUNT(*) AS n " +
          "FROM sterilisation_cycles WHERE tenant_id = ? AND released_at IS NOT NULL AND ended_at IS NOT NULL " +
          "AND released_at >= ? GROUP BY d ORDER BY d",
      )
      .bind(t, since)
      .all<{ d: string; hours: number; n: number }>(),

    /**
     * The expiry horizon, in the buckets a person acts on rather than a
     * continuous axis. "17 things expire in 23 days" is not a decision; "6 this
     * week" is.
     *
     * Lots and released packs together — both are stock that goes out of date,
     * and a centre counting only one of them is the centre that discovers the
     * other on a Monday morning.
     */
    c.env.DB
      .prepare(
        "SELECT bucket, COUNT(*) AS n FROM (" +
          "SELECT CASE " +
          "WHEN julianday(printed_expiry) - julianday('now') < 0 THEN 'expired' " +
          "WHEN julianday(printed_expiry) - julianday('now') <= 7 THEN 'week' " +
          "WHEN julianday(printed_expiry) - julianday('now') <= 30 THEN 'month' " +
          "WHEN julianday(printed_expiry) - julianday('now') <= 90 THEN 'quarter' " +
          "ELSE 'later' END AS bucket " +
          "FROM lots WHERE tenant_id = ? AND status = 'active' AND printed_expiry IS NOT NULL " +
          "UNION ALL " +
          "SELECT CASE " +
          "WHEN julianday(expiry) - julianday('now') < 0 THEN 'expired' " +
          "WHEN julianday(expiry) - julianday('now') <= 7 THEN 'week' " +
          "WHEN julianday(expiry) - julianday('now') <= 30 THEN 'month' " +
          "WHEN julianday(expiry) - julianday('now') <= 90 THEN 'quarter' " +
          "ELSE 'later' END AS bucket " +
          "FROM packs WHERE tenant_id = ? AND status = 'released' AND expiry IS NOT NULL" +
          ") GROUP BY bucket",
      )
      .bind(t, t)
      .all<{ bucket: string; n: number }>(),

    // ── Consumption per day, from the ledger's negative deltas ───────────────
    c.env.DB
      .prepare(
        "SELECT substr(at, 1, 10) AS d, CAST(-SUM(quantity_delta) AS REAL) AS n " +
          "FROM ledger WHERE tenant_id = ? AND at >= ? AND quantity_delta < 0 GROUP BY d ORDER BY d",
      )
      .bind(t, since)
      .all<{ d: string; n: number }>(),

    // ── Every recorded act per day, for the heatmap ──────────────────────────
    c.env.DB
      .prepare("SELECT substr(at, 1, 10) AS d, COUNT(*) AS n FROM ledger WHERE tenant_id = ? AND at >= ? GROUP BY d ORDER BY d")
      .bind(t, since)
      .all<{ d: string; n: number }>(),

    /**
     * Instruments by reprocessing count — the ones nearest their limit first.
     *
     * A tracked instrument has a finite number of reprocessings in it, and going
     * past that is a device-safety failure rather than a cost one. Tessa does not
     * store a per-item limit yet, so this reports the COUNT and lets a centre
     * judge it against the manufacturer's IFU (which `read-document` will now
     * pull the number out of).
     */
    c.env.DB
      .prepare(
        "SELECT u.id, u.serial, u.cycle_count, ci.name FROM units u " +
          "LEFT JOIN catalog_items ci ON ci.id = u.catalog_item_id " +
          "WHERE u.tenant_id = ? AND u.retired_at IS NULL AND u.cycle_count > 0 " +
          "ORDER BY u.cycle_count DESC LIMIT 12",
      )
      .bind(t)
      .all<{ id: string; serial: string | null; cycle_count: number; name: string | null }>(),

    /** The headline counters, in one round trip rather than five. */
    c.env.DB
      .prepare(
        "SELECT " +
          "(SELECT COUNT(*) FROM sterilisation_cycles WHERE tenant_id = ?1 AND started_at >= ?2) AS loads, " +
          "(SELECT COUNT(*) FROM sterilisation_cycles WHERE tenant_id = ?1 AND started_at >= ?2 AND status = 'failed') AS failed, " +
          "(SELECT COUNT(*) FROM sterilisation_cycles WHERE tenant_id = ?1 AND status = 'running') AS running, " +
          "(SELECT COUNT(*) FROM packs WHERE tenant_id = ?1 AND status = 'packed') AS awaitingRelease, " +
          "(SELECT COUNT(*) FROM cases WHERE tenant_id = ?1 AND status = 'open') AS openCases, " +
          "(SELECT COUNT(*) FROM units WHERE tenant_id = ?1 AND status = 'soiled') AS soiled",
      )
      .bind(t, since)
      .first<{ loads: number; failed: number; running: number; awaitingRelease: number; openCases: number; soiled: number }>(),
  ]);

  const cycleRows = cycles.results ?? [];
  const throughput = densify(cycleRows.map((r) => ({ d: r.d, n: r.n })), days);
  const failures = densify(cycleRows.map((r) => ({ d: r.d, n: r.failed })), days);

  /**
   * Turnaround is the one series that keeps its GAPS.
   *
   * A day with no release has no turnaround — zero would read as "released
   * instantly", which is the opposite of the truth and the exact direction that
   * flatters a centre. `AreaChart` draws null as a break.
   */
  const relByDay = new Map((released.results ?? []).map((r) => [r.d, r.hours]));
  const turnaround: (number | null)[] = [];
  const start = Date.now() - (days - 1) * 86_400_000;
  for (let i = 0; i < days; i++) {
    const d = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    const v = relByDay.get(d);
    turnaround.push(v == null ? null : Math.round(v * 10) / 10);
  }

  const buckets = Object.fromEntries((expiry.results ?? []).map((r) => [r.bucket, r.n]));
  const loads = headline?.loads ?? 0;
  const failed = headline?.failed ?? 0;
  const measured = (released.results ?? []).reduce((a, r) => a + r.n, 0);
  const hoursTotal = (released.results ?? []).reduce((a, r) => a + r.hours * r.n, 0);

  return c.json({
    window: { days, from: since.slice(0, 10) },
    headline: {
      loads,
      failed,
      /** `null`, not 100, when nothing ran — a rate over zero loads is not 100%. */
      releaseRate: loads > 0 ? Math.round(((loads - failed) / loads) * 100) : null,
      /** Mean hours from cycle end to Freigabe. `null` when nothing was released. */
      turnaroundHours: measured > 0 ? Math.round((hoursTotal / measured) * 10) / 10 : null,
      running: headline?.running ?? 0,
      awaitingRelease: headline?.awaitingRelease ?? 0,
      openCases: headline?.openCases ?? 0,
      soiled: headline?.soiled ?? 0,
      expiringSoon: (buckets.expired ?? 0) + (buckets.week ?? 0) + (buckets.month ?? 0),
    },
    series: {
      days: throughput.days,
      loads: throughput.values,
      failures: failures.values,
      turnaround,
      consumption: densify(consumed.results ?? [], days).values,
    },
    /** Fixed order, so the bars never reorder under a filter. */
    expiry: (["expired", "week", "month", "quarter", "later"] as const).map((k) => ({ bucket: k, n: buckets[k] ?? 0 })),
    /** Keyed by local date, which is what `CalendarHeatmap` reads. */
    activity: Object.fromEntries((activity.results ?? []).map((r) => [r.d, r.n])),
    instruments: instruments.results ?? [],
  });
});
