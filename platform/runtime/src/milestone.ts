/**
 * RECOGNITION, STORED — a tally per person per event, and a row per thing earned.
 *
 * ⚠️ NOTHING HERE IS CALLED BY A HANDLER. The engine reads `emits`, which the
 * operation already declares and composition already checks — so a milestone is
 * a rule over something that is true rather than a second set of instrumentation
 * somebody has to remember to fire. A handler that awarded its own badge is one
 * that can forget, one that can award twice, and one whose rule lives at a call
 * site where nothing can check it.
 *
 * ⚠️ AND ONLY A PERSON EARNS ANYTHING. A job raises events too and they are
 * deliberately ignored here: a nightly sweep that closed a workspace's month has
 * not done anything anybody should be congratulated for, and crediting the last
 * person to touch the row would be recognition handed to somebody who was asleep.
 */

import {
  MILESTONE_EARNED, NOTHING_YET, advance, recognitionsFor, satisfied,
  type Actor, type Instant, type MilestoneRegistry, type PlainDate, type Recognition,
  type SchemaModule, type Session, type SqlHandle, type Tally,
} from "@one/kernel";

/**
 * Who, if anybody, earned this.
 *
 * ⚠️ ONLY A PERSON EARNS ANYTHING, and this is the decision rather than a
 * condition inlined at the call site. A nightly sweep that closed somebody's
 * month raises events and has done nothing anybody should be congratulated for;
 * a payment webhook raises one on behalf of a customer who is not signed in.
 * Crediting either would hand a badge to the last account that happened to be
 * on the request — or to nobody, loudly, by reading a field off `null`.
 */
export const earnerOf = (actor: Actor, session: Session | null): string | null =>
  session && actor.kind === "user" ? session.accountId : null;

export const MILESTONE_SCHEMA: SchemaModule = {
  id: "milestone",
  ddl: [
    /*
      ⚠️ ONE ROW PER PERSON PER WATCHED EVENT, not per occurrence. See the kernel
      note: a balance is summed from entries because it is money and must be
      auditable; recognition is not, and the alternative to a counter is keeping
      every event anybody ever caused, forever, so a streak can be recomputed.
    */
    `CREATE TABLE IF NOT EXISTS milestone_tally (tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, event TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, streak INTEGER NOT NULL DEFAULT 0, last_day TEXT, PRIMARY KEY (tenant_id, user_id, event));`,
    /*
      ⚠️ THE PRIMARY KEY IS WHAT MAKES AN AWARD ONCE-ONLY. Two requests finishing
      at the same moment both compute "earned"; the key is what stops the second
      one being a second row, and the read-back in `recognise` is what stops it
      being a second announcement.
    */
    `CREATE TABLE IF NOT EXISTS milestone_earned (tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, milestone TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (tenant_id, user_id, milestone));`,
  ],
  scoped: { tenantColumn: "tenant_id", tenantTables: ["milestone_tally", "milestone_earned"] },
};

/* ----------------------------------------------------------------- a day --- */

/**
 * The calendar date an instant fell on, where the person was standing.
 *
 * ⚠️ NEVER UTC. Midnight UTC is four in the afternoon in California, so a streak
 * bucketed in UTC breaks halfway through somebody's day and they lose it having
 * done nothing wrong. The zone comes from the device when it says, and from the
 * manifest when it does not — both are somebody's day; UTC is nobody's.
 */
export function dayIn(at: Instant, timeZone: string): PlainDate {
  const parts = (zone: string): string => {
    const bits = new Intl.DateTimeFormat("en", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date(at));
    const pick = (type: string) => bits.find((p) => p.type === type)?.value ?? "";
    return `${pick("year")}-${pick("month")}-${pick("day")}`;
  };
  try {
    return parts(timeZone) as PlainDate;
  } catch {
    /* An unknown zone throws rather than degrading, so a bad header is a fallback. */
    return parts("UTC") as PlainDate;
  }
}

/* --------------------------------------------------------------- reading --- */

/** The events any milestone in this app watches. Anything else is not counted. */
export const watchedEvents = (registry: MilestoneRegistry): ReadonlySet<string> =>
  new Set(Object.values(registry).map((def) => def.rule.event));

const rowToTally = (row: { count: number; streak: number; last_day: string | null } | null): Tally =>
  row ? { count: row.count, streak: row.streak, lastDay: (row.last_day as PlainDate | null) ?? null } : NOTHING_YET;

export async function talliesFor(
  db: SqlHandle,
  tenantId: string,
  userId: string,
): Promise<Readonly<Record<string, Tally>>> {
  const rows = await db.all<{ event: string; count: number; streak: number; last_day: string | null }>(
    `SELECT event, count, streak, last_day FROM milestone_tally WHERE tenant_id = ? AND user_id = ?`,
    tenantId, userId,
  ).catch(() => []);
  const out: Record<string, Tally> = {};
  for (const row of rows) out[row.event] = rowToTally(row);
  return out;
}

export async function earnedBy(
  db: SqlHandle,
  tenantId: string,
  userId: string,
): Promise<Readonly<Record<string, Instant>>> {
  const rows = await db.all<{ milestone: string; at: string }>(
    `SELECT milestone, at FROM milestone_earned WHERE tenant_id = ? AND user_id = ?`,
    tenantId, userId,
  ).catch(() => []);
  const out: Record<string, Instant> = {};
  for (const row of rows) out[row.milestone] = row.at as Instant;
  return out;
}

/** One person's shelf, read. The ordering and the arithmetic are the kernel's. */
export async function shelfFor(input: {
  readonly db: SqlHandle;
  readonly registry: MilestoneRegistry;
  readonly tenantId: string;
  readonly userId: string;
  readonly role: string;
}): Promise<readonly Recognition[]> {
  const [tallies, earned] = await Promise.all([
    talliesFor(input.db, input.tenantId, input.userId),
    earnedBy(input.db, input.tenantId, input.userId),
  ]);
  return recognitionsFor(input.registry, input.role, tallies, earned);
}

/* --------------------------------------------------------------- writing --- */

/**
 * One event happened, to one person. Returns what they have JUST earned.
 *
 * ⚠️ IT WRITES NOTHING FOR AN EVENT NOBODY WATCHES. Every operation raises
 * something, and a tally row per person per event would make this an audit log
 * of everything anybody ever did — which is the retention decision the tally
 * exists to avoid.
 *
 * ⚠️ AND THE ANNOUNCEMENT IS THE CALLER'S. This returns ids; dispatching them
 * goes through the one notification path, so a milestone is announced by the
 * same machinery as everything else rather than by a second sender nobody
 * remembers to give a preference to.
 */
export async function recognise(input: {
  readonly db: SqlHandle;
  readonly registry: MilestoneRegistry;
  readonly tenantId: string;
  readonly userId: string;
  readonly role: string;
  readonly event: string;
  readonly today: PlainDate;
  readonly at: Instant;
}): Promise<readonly string[]> {
  /*
    ⚠️ THE "IS THIS SOMEBODY" GUARD LIVES HERE, not only at the call site. The
    pipeline already declines to call this for a sweep or a webhook — but a rule
    about who earns things belongs where it can be reached by a test, and a
    condition that exists only inside a 700-line request function is one that is
    re-derived by whoever writes the second caller.
  */
  if (!input.userId) return [];
  if (!watchedEvents(input.registry).has(input.event)) return [];

  const before = rowToTally(
    await input.db.first<{ count: number; streak: number; last_day: string | null }>(
      `SELECT count, streak, last_day FROM milestone_tally WHERE tenant_id = ? AND user_id = ? AND event = ?`,
      input.tenantId, input.userId, input.event,
    ).catch(() => null),
  );
  /*
    ⚠️ THE RULE IS THE KERNEL'S, AND THE READ-MODIFY-WRITE IS DELIBERATE. Doing
    the arithmetic in SQL would put "does this extend a streak" in a string that
    no unit test can reach — the one shape a fake reimplements and both halves
    then pass while disagreeing. Two events in the same millisecond can lose an
    increment; the cost is one occurrence towards a badge, and it is the price of
    the rule staying somewhere it can be read.
  */
  const after = advance(before, input.today);
  await input.db.run(
    `INSERT INTO milestone_tally (tenant_id, user_id, event, count, streak, last_day) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, user_id, event) DO UPDATE SET count = excluded.count, streak = excluded.streak, last_day = excluded.last_day`,
    input.tenantId, input.userId, input.event, after.count, after.streak, after.lastDay,
  );

  const fresh: string[] = [];
  for (const id of satisfied(input.registry, input.event, input.role, after)) {
    await input.db.run(
      `INSERT OR IGNORE INTO milestone_earned (tenant_id, user_id, milestone, at) VALUES (?, ?, ?, ?)`,
      input.tenantId, input.userId, id, input.at,
    );
    /*
      ⚠️ THE ROW DECIDES WHO ANNOUNCES, AND IT IS THE ONLY THING THAT DOES.
      A rule stays satisfied forever — the hundredth plan satisfies "your first
      plan" exactly as the first did — so awarding on satisfaction would
      congratulate somebody on every call for the rest of the account's life.
      `INSERT OR IGNORE` succeeds whether or not it wrote anything, so the write
      cannot report that either. The row carries the winner's timestamp; whoever
      reads their own back is the one who earned it, and everybody else is
      silent. That also settles the two-requests-at-once case, which a
      read-then-skip cannot: both would read nothing and both would speak.
    */
    const stored = await input.db.first<{ at: string }>(
      `SELECT at FROM milestone_earned WHERE tenant_id = ? AND user_id = ? AND milestone = ?`,
      input.tenantId, input.userId, id,
    ).catch(() => null);
    if (stored?.at === input.at) fresh.push(id);
  }
  return fresh;
}

export { MILESTONE_EARNED };
