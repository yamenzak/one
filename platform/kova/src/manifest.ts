/**
 * KOVA — a studio coaches people, and this is what that is made of.
 *
 * ⚠️ DESIGNED FROM THE PRODUCT, NOT FROM THE OLD TABLES. The previous Kova had
 * thirty-five tables written over two months with no platform in mind, and its
 * inconsistencies are the reason this project exists. Nothing here is a port:
 * [docs/KOVA-INVENTORY.md](../../docs/KOVA-INVENTORY.md) is the only artefact
 * that crossed, and it lists outcomes rather than screens.
 *
 * Version 0.1 is the CORE LOOP and nothing else: a coach writes a plan, a person
 * follows it and records what they actually did, and the coach sees it. Every
 * other line of the inventory arrives in a later version, with its own help and
 * its own release note.
 */

import { daysBetween, daysLeft, progressOf } from "./goals.js";
import { energyOf, overDays, portionOf, totalOf, type Macros } from "./nutrition.js";
import { bestOf, consistency, expectedOver, needing, prescribedPerWeek } from "./reading.js";
import {
  UNLIMITED,
  cache, collection, defineApp, defineBindings, field,
  objects, operation, s, sql, tableNameFor,
  type Currency, type Locale, type RegionId, type TimeZone,
} from "@one/kernel";

/* -------------------------------------------------------------- bindings --- */

export const bindings = defineBindings({
  db: sql(),
  media: objects({ jurisdictional: true }),
  cache: cache(),
});

export type Bindings = typeof bindings;

/* ---------------------------------------------------------------- people --- */

/**
 * The person being coached.
 *
 * ⚠️ THIS IS THE `subject` THE CUSTOMER RAIL RESOLVES. A studio buys Kova from
 * the platform; a client buys access from the studio. Two rails, never merged,
 * and a person's real capability is the intersection — so the record the second
 * rail is about has to be a first-class collection rather than a row hanging off
 * an account.
 */
export const clients = collection({
  id: "client",
  label: { one: "Client", many: "Clients" },
  scope: { of: "tenant" },
  quota: "clients",
  version: true,
  /*
    ⚠️ KEPT UNTIL THE STUDIO SAYS OTHERWISE, and exported when it closes. A
    coaching history is the client's own record of their body; a retention
    window measured in months would delete the thing they are here for.
  */
  retention: { days: null, onTenantClose: "export-then-purge" },
  onDelete: { on: "archive" },
  activity: true,
  search: ["name", "email"],
  fields: {
    name: field.text({ required: true, min: 1, max: 120 }),
    email: field.text({ max: 200, sensitive: true }),
    /*
      ⚠️ CURRENT STATE, DELIBERATELY OVERWRITTEN — and `reviewedOn` is the field
      that makes that safe. "I train at home, four times a week" is a fact about
      now; the dated series a coach actually wants is what `entry` is for. What
      was missing before was FRESHNESS, so a year-old profile could look current.
    */
    situation: field.text({ multiline: true, max: 2_000 }),
    reviewedOn: field.plainDate({ label: "Last reviewed" }),
    startedOn: field.plainDate(),
    avatar: field.media({ accept: ["image/jpeg", "image/png"], maxBytes: 4_000_000 }),
  },
});

/* --------------------------------------------------------------- library --- */

/**
 * A movement the studio prescribes.
 *
 * ⚠️ KOVA SHIPS NO LIBRARY. Content a studio did not choose is something to
 * delete, not a head start — the previous product shipped forty rows and then
 * had to explain why a plan draft refused until somebody cleared them out.
 */
export const movements = collection({
  id: "movement",
  label: { one: "Movement", many: "Movements" },
  scope: { of: "tenant" },
  version: true,
  retention: { days: null, onTenantClose: "purge" },
  onDelete: { on: "archive" },
  activity: true,
  search: ["name"],
  fields: {
    name: field.text({ required: true, min: 1, max: 120 }),
    how: field.text({ multiline: true, max: 4_000, label: "How to do it" }),
    pattern: field.enum(["push", "pull", "squat", "hinge", "carry", "core", "conditioning", "other"], { required: true }),
    demo: field.media({ accept: ["video/mp4", "image/jpeg", "image/png"], maxBytes: 20_000_000 }),
  },
});

/* ----------------------------------------------------------------- plans --- */

/**
 * What somebody is meant to do.
 *
 * ⚠️ ONE COLLECTION WHERE THERE WERE FOUR TABLES, and a TEMPLATE IS A PLAN WITH
 * NO CLIENT. The old schema had `workout_plans`, `workout_templates`,
 * `plan_variants` and their nutrition twins — four shapes for one idea, each
 * with its own screens and its own drift. A template is not a different kind of
 * thing; it is the same thing not yet addressed to anybody.
 *
 * ⚠️ AND THE BODY IS A JSON COLUMN, ON PURPOSE. Weeks, days and items are read
 * and written WHOLE — nobody queries "every plan whose Tuesday has a squat" —
 * so rows would buy a join and a partial-write hazard for nothing. Compare
 * `set` below, which is rows for exactly the opposite reason. Both arguments are
 * written down so neither is copied to the wrong side.
 */
/*
  ⚠️ `programme`, NOT `plan`, AND THE REASON IS BOTH TECHNICAL AND PRODUCT. The
  platform sells a studio a PLAN — the billing catalogue's table is `plans` — and
  a derived collection called `plan` would create the same table. The composed
  schema runner refuses that outright rather than letting one win, which is how
  this was found within a minute of the first boot.

  The rename is the better word anyway: an owner of a studio deals with both
  senses daily, and "your plan" meaning two different purchases was a real
  ambiguity in the old product.
*/
export const programmes = collection({
  id: "programme",
  label: { one: "Programme", many: "Programmes" },
  scope: { of: "tenant" },
  version: true,
  retention: { days: null, onTenantClose: "export-then-purge" },
  onDelete: { on: "archive" },
  activity: true,
  search: ["title"],
  fields: {
    title: field.text({ required: true, min: 1, max: 160 }),
    /*
      ⚠️ TWO KINDS, ONE COLLECTION, AND ONE OF EACH IS CURRENT AT A TIME. A
      person follows a way of training AND a way of eating simultaneously, so
      "the current one" is a question with two answers — which is why `publish`
      stands down only the same kind, and why this is a field rather than a
      second collection with the same four columns.
    */
    kind: field.enum(["training", "eating"], { required: true }),
    /** Absent = a template. Present = somebody is following this. */
    client: field.ref("client", { onDelete: "cascade" }),
    /*
      ⚠️ SEVERAL PLANS MAY NAME ONE CLIENT AND ONE OF THEM IS CURRENT. That is
      what the old `plan_variants` table was, and it is a boolean here.
    */
    active: field.bool({ label: "Currently following" }),
    weeks: field.json("programme.weeks", { required: true }),
    notes: field.text({ multiline: true, max: 4_000 }),
  },
});

/* -------------------------------------------------------------- training --- */

/**
 * One workout, as a DOCUMENT.
 *
 * ⚠️ A WORKOUT ASSERTS THAT SOMETHING HAPPENED, which is exactly the shape the
 * document lifecycle is for: draft while somebody is in the gym, submitted when
 * they finish, and immutable afterwards except by a stated amendment. A training
 * history that can be quietly edited is not a history.
 */
export const workouts = collection({
  id: "workout",
  label: { one: "Workout", many: "Workouts" },
  scope: { of: "subject", subject: "client" },
  version: true,
  retention: { days: null, onTenantClose: "export-then-purge" },
  onDelete: { on: "archive" },
  docStatus: { amendable: true, immutableAfterSubmit: ["day", "programme"] },
  naming: { series: "S-.YYYY.-.####" },
  activity: true,
  fields: {
    /** ⚠️ THE PERSON'S OWN DAY, from their device. See `entry.day`. */
    day: field.plainDate({ required: true, label: "Day" }),
    programme: field.ref("programme", { onDelete: "null" }),
    howItWent: field.text({ multiline: true, max: 2_000 }),
  },
});

/**
 * One set, and why this is rows when a plan's body is not.
 *
 * ⚠️ "WHAT DID I LIFT LAST TIME" IS THE MOST-ASKED QUESTION IN A GYM, and it is
 * asked per MOVEMENT across every workout a person has ever done. That is an
 * index or it is a scan of every workout's JSON — so a set has a life of its own
 * and a plan's body does not. The two decisions look inconsistent and are not:
 * one thing is queried across records, the other is only ever read whole.
 */
export const sets = collection({
  id: "set",
  label: { one: "Set", many: "Sets" },
  scope: { of: "subject", subject: "client" },
  version: true,
  retention: { days: null, onTenantClose: "export-then-purge" },
  /* ⚠️ Purged rather than archived: a set mistyped mid-workout is noise, and an
     archived one still counts towards the history it was never part of. */
  onDelete: { on: "purge" },
  fields: {
    workout: field.ref("workout", { onDelete: "cascade", required: true }),
    movement: field.ref("movement", { onDelete: "restrict", required: true }),
    /* ⚠️ Stored canonical, read in whichever system the person chose. */
    load: field.quantity("mass"),
    reps: field.number({ integer: true, min: 0, max: 1_000 }),
    /** How hard it felt. The one number that makes a log worth reading later. */
    effort: field.number({ integer: true, min: 1, max: 10, label: "Effort" }),
  },
});

/* ------------------------------------------------------------- nutrition --- */

/**
 * A food, and the one number it does NOT carry.
 *
 * ⚠️ THERE IS NO `calories` FIELD. A row holding both an energy figure and the
 * macros it is computed from holds two numbers that disagree the moment anybody
 * edits one — and every product that stores both ends up with a diary whose
 * totals do not match the sum of its rows. Energy is derived, in
 * `nutrition.ts`, from the only numbers anybody actually measured.
 *
 * ⚠️ AND THE BASIS IS A FIELD. A tin declares its numbers per 100 g and an egg
 * declares them per egg; assuming 100 everywhere is how a product tells somebody
 * one egg was 620 calories.
 */
export const foods = collection({
  id: "food",
  label: { one: "Food", many: "Foods" },
  scope: { of: "tenant" },
  version: true,
  retention: { days: null, onTenantClose: "purge" },
  onDelete: { on: "archive" },
  activity: true,
  search: ["name", "brand"],
  fields: {
    name: field.text({ required: true, min: 1, max: 160 }),
    brand: field.text({ max: 120 }),
    /** What the numbers below are per: 100 grams, or one of something. */
    per: field.number({ required: true, min: 0.001, label: "Numbers are per" }),
    unit: field.enum(["g", "ml", "item"], { required: true }),
    protein: field.number({ required: true, min: 0 }),
    carbs: field.number({ required: true, min: 0 }),
    fat: field.number({ required: true, min: 0 }),
    fibre: field.number({ min: 0 }),
    barcode: field.text({ max: 32 }),
  },
});

/**
 * A portion of a food, at a meal, on a day.
 *
 * ⚠️ ROWS, FOR THE SAME REASON A SET IS. "What do I eat most often" and "what
 * did I have this week" are both queried ACROSS records — so a day's eating is
 * not a JSON blob on a diary row, however tempting the symmetry with a
 * programme's body looks.
 */
export const portions = collection({
  id: "portion",
  label: { one: "Portion", many: "Portions" },
  scope: { of: "subject", subject: "client" },
  version: true,
  retention: { days: null, onTenantClose: "export-then-purge" },
  onDelete: { on: "purge" },
  fields: {
    day: field.plainDate({ required: true, label: "Day" }),
    meal: field.enum(["breakfast", "lunch", "dinner", "snack"], { required: true }),
    food: field.ref("food", { onDelete: "restrict", required: true }),
    /** In the food's own unit. A portion of an egg is 2, not 120. */
    amount: field.number({ required: true, min: 0 }),
  },
});

/* ------------------------------------------------------------- recording --- */

/**
 * One thing somebody wrote down, on a day.
 *
 * ⚠️ ONE COLLECTION WHERE THERE WERE SIX TABLES. The old schema had
 * `sleep_logs`, `mood_logs`, `water_logs`, `steps_logs`, `activity_logs` and
 * `measurements` — six tables for "a person recorded a number on a day" — plus a
 * check-in that wrote COPIES into them, plus readers merging per date and per
 * field with the dedicated table winning.
 *
 * Three bug classes came out of that shape and are documented in the old
 * repository: sleep logged in one place never appeared in the other, a wellness
 * score double-counted a day rated twice, and one column was read by a report
 * that nothing ever wrote. None of them is expressible here.
 *
 * ⚠️ THE MEANING IS A REGISTRY, NOT A TABLE. What `weight` means, what it is
 * measured in and how it is drawn is Kova's vocabulary — the same argument that
 * keeps product words out of `@one/ui`.
 */
export const entries = collection({
  id: "entry",
  label: { one: "Entry", many: "Entries" },
  scope: { of: "subject", subject: "client" },
  version: true,
  retention: { days: null, onTenantClose: "export-then-purge" },
  onDelete: { on: "archive" },
  fields: {
    /*
      ⚠️ THE DAY IS THE PERSON'S, FROM THEIR DEVICE. A boundary at midnight UTC
      is four in the afternoon in California, and somebody's Sunday is not our
      Monday. The same rule the milestone engine's streaks run on.
    */
    day: field.plainDate({ required: true, label: "Day" }),
    kind: field.enum(["weight", "waist", "hip", "chest", "arm", "thigh", "sleep", "mood", "water", "steps"], { required: true }),
    value: field.number({ required: true }),
    note: field.text({ max: 500 }),
  },
});

/* ------------------------------------------------------------ reporting --- */

/**
 * Somebody reporting in, and the coach answering.
 *
 * ⚠️ A CHECK-IN FREEZES THE WORDS AND NEVER THE NUMBERS. The old product's
 * check-in wrote COPIES of that week's weight, sleep and mood into its own
 * columns so a coach would see what was reported at the time — and then read
 * those copies back beside the originals, merging per date and per field. Three
 * documented bug classes came out of it.
 *
 * What must not change is what somebody SAID. A number they later corrected was
 * simply wrong, and a coach reading last month's check-in should see the right
 * weight, not the typo. So the document freezes the narrative, the entries keep
 * one home, and there is nothing to merge.
 */
export const checkins = collection({
  id: "checkin",
  label: { one: "Check-in", many: "Check-ins" },
  scope: { of: "subject", subject: "client" },
  version: true,
  retention: { days: null, onTenantClose: "export-then-purge" },
  onDelete: { on: "archive" },
  /*
    ⚠️ SUBMITTING IS THE EVENT, and the transition raises it — rather than a
    second operation beside the lifecycle that has to be kept in step with it.
  */
  docStatus: { amendable: true, immutableAfterSubmit: ["since", "until", "howItWent"], emits: { submit: "checkin.filed" } },
  activity: true,
  fields: {
    /* ⚠️ `since`/`until` rather than `from`/`to`, which are SQL keywords. */
    since: field.plainDate({ required: true, label: "Covering from" }),
    until: field.plainDate({ required: true, label: "Covering to" }),
    howItWent: field.text({ required: true, multiline: true, max: 4_000, label: "How it went" }),
    stuckOn: field.text({ multiline: true, max: 2_000, label: "What you are stuck on" }),
    /*
      ⚠️ THE ANSWER IS NOT FROZEN, because it is written after the document is
      submitted — the whole point of a check-in is that somebody replies to it.
    */
    answer: field.text({ multiline: true, max: 4_000 }),
  },
});

/**
 * Something somebody is working towards.
 *
 * ⚠️ IT STORES NO PROGRESS. Where they are now is a question about the entries
 * they have recorded, answered from the one place those numbers live. A stored
 * `current` is a second copy that goes stale the moment a weigh-in is corrected,
 * and it goes stale SILENTLY — nothing about a number that is merely old looks
 * wrong.
 *
 * ⚠️ AND IT RECORDS WHERE THEY STARTED. Half of all goals count downwards, and
 * progress measured as `current / target` says somebody at 90 kg aiming for 75
 * is 120% done before they have lost a gram. The baseline is what makes one
 * formula read correctly in both directions.
 */
export const goals = collection({
  id: "goal",
  label: { one: "Goal", many: "Goals" },
  scope: { of: "subject", subject: "client" },
  version: true,
  retention: { days: null, onTenantClose: "export-then-purge" },
  onDelete: { on: "archive" },
  activity: true,
  fields: {
    /** The same vocabulary an entry uses, so progress is a query rather than a join by hand. */
    kind: field.enum(["weight", "waist", "hip", "chest", "arm", "thigh", "sleep", "mood", "water", "steps"], { required: true }),
    start: field.number({ required: true, label: "Where they started" }),
    target: field.number({ required: true }),
    /* ⚠️ `dueOn`, not `by` — a third SQL keyword caught at declaration rather than at boot. */
    dueOn: field.plainDate({ label: "By" }),
    why: field.text({ multiline: true, max: 1_000 }),
  },
});

/* ------------------------------------------------------------ operations --- */

/**
 * ⚠️ NEVER A HAND-WRITTEN TABLE NAME. The platform derives one from a
 * collection's id, so a name typed into a handler is a 503 that no other test
 * can see — every collection route keeps working, and only the one query that
 * spells it out fails. `entry` derives `entrys`, which is not what anybody
 * guesses, and it shipped as `entries` until a read that joined two collections
 * drove it.
 */
const T = {
  clients: tableNameFor(clients),
  movements: tableNameFor(movements),
  programmes: tableNameFor(programmes),
  workouts: tableNameFor(workouts),
  sets: tableNameFor(sets),
  foods: tableNameFor(foods),
  portions: tableNameFor(portions),
  entries: tableNameFor(entries),
  checkins: tableNameFor(checkins),
  goals: tableNameFor(goals),
} as const;

/**
 * ⚠️ THE ONE THING A COLLECTION COULD NOT IMPLY: publishing is a decision, not a
 * field. It makes exactly one plan current for one person, tells them, and is
 * the event a milestone is a rule over. Writing `current: true` through the
 * derived update would leave two plans current and nobody told.
 */
export const publish = operation<
  Bindings,
  { programmeId: string },
  { published: string },
  "platform.not_found" | "coaching.programme_has_no_client"
>({
  id: "programme.publish",
  kind: "write",
  summary: "Make a plan the one this person is following, and tell them.",
  input: s.object({ programmeId: s.text({ max: 40 }) }),
  output: s.object({ published: s.text() }),
  permission: "programme:write",
  entitlement: "training",
  idempotency: { mode: "natural", key: "programmeId" },
  audit: (i: { programmeId: string }) => ({ subject: i.programmeId, verb: "publish" }),
  outcome: { message: "Programme published", tone: "success", moment: "acknowledge", invalidates: ["programme"] },
  emits: ["programme.published"],
  fails: ["platform.not_found", "coaching.programme_has_no_client"],
  help: "programmes" as never,
  async handler(ctx, input: { programmeId: string }) {
    const row = await ctx.bind.db.first<{ id: string; client: string | null; kind: string }>(
      `SELECT id, client, kind FROM ${T.programmes} WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      input.programmeId, ctx.tenantId,
    );
    if (!row) ctx.fail("platform.not_found", { field: "programmeId" });
    /*
      ⚠️ A TEMPLATE CANNOT BE PUBLISHED, because there is nobody to publish it
      to. Silently making it current would leave a plan somebody is "following"
      that belongs to no one.
    */
    if (!row!.client) ctx.fail("coaching.programme_has_no_client");

    /*
      ⚠️ THE PREVIOUS ONE OF THE SAME KIND STEPS DOWN, AND ONLY THAT ONE.
      Standing down every programme would take somebody's eating off them for
      publishing their training, which is a data loss they would discover in a
      supermarket.
    */
    await ctx.bind.db.run(
      `UPDATE ${T.programmes} SET active = 0 WHERE tenant_id = ? AND client = ? AND kind = ?`,
      ctx.tenantId, row!.client, row!.kind,
    );
    await ctx.bind.db.run(`UPDATE ${T.programmes} SET active = 1, updated_at = ? WHERE id = ?`, ctx.now(), row!.id);
    return { published: row!.id };
  },
});

/**
 * ⚠️ FINISHING IS AN EVENT, and it is the one a person's streak is made of.
 * The document lifecycle already freezes the record; this is what says a person
 * DID something today, which is a different fact from a row existing.
 */
export const complete = operation<Bindings, { workoutId: string }, { completed: string }, "platform.not_found">({
  id: "workout.complete",
  kind: "write",
  summary: "Finish a workout, so it counts.",
  input: s.object({ workoutId: s.text({ max: 40 }) }),
  output: s.object({ completed: s.text() }),
  permission: "workout:write",
  idempotency: { mode: "natural", key: "workoutId" },
  audit: (i: { workoutId: string }) => ({ subject: i.workoutId, verb: "complete" }),
  outcome: { message: "Workout done", tone: "success", moment: "acknowledge", invalidates: ["workout"] },
  emits: ["workout.completed"],
  fails: ["platform.not_found"],
  async handler(ctx, input: { workoutId: string }) {
    const row = await ctx.bind.db.first<{ id: string }>(
      `SELECT id FROM ${T.workouts} WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      input.workoutId, ctx.tenantId,
    );
    if (!row) ctx.fail("platform.not_found", { field: "workoutId" });
    await ctx.bind.db.run(`UPDATE ${T.workouts} SET docstatus = 1, updated_at = ? WHERE id = ?`, ctx.now(), row!.id);
    return { completed: row!.id };
  },
});

/**
 * ⚠️ ANSWERING IS AN EVENT, AND THE REASON IS THE PRODUCT RATHER THAN THE CODE.
 * A check-in nobody replies to is the single most common way a coaching
 * relationship ends, so the reply is a thing that HAPPENS — told to the person
 * who wrote it, at the moment it lands — rather than a field that quietly gains
 * a value some time later.
 */
export const answer = operation<Bindings, { checkinId: string; answer: string }, { answered: string }, "platform.not_found">({
  id: "checkin.answer",
  kind: "write",
  summary: "Reply to a check-in, so the person who wrote it hears back.",
  input: s.object({ checkinId: s.text({ max: 40 }), answer: s.text({ min: 1, max: 4_000 }) }),
  output: s.object({ answered: s.text() }),
  permission: "checkin:write",
  idempotency: { mode: "none" },
  audit: (i: { checkinId: string }) => ({ subject: i.checkinId, verb: "answer" }),
  outcome: { message: "Reply sent", tone: "success", moment: "acknowledge", invalidates: ["checkin"] },
  emits: ["checkin.answered"],
  fails: ["platform.not_found"],
  help: "checkins" as never,
  async handler(ctx, input: { checkinId: string; answer: string }) {
    const row = await ctx.bind.db.first<{ id: string }>(
      `SELECT id FROM ${T.checkins} WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      input.checkinId, ctx.tenantId,
    );
    if (!row) ctx.fail("platform.not_found", { field: "checkinId" });
    await ctx.bind.db.run(`UPDATE ${T.checkins} SET answer = ?, updated_at = ? WHERE id = ?`, input.answer, ctx.now(), row!.id);
    return { answered: row!.id };
  },
});

/**
 * ⚠️ WHO NEEDS YOU TODAY — the one read a coach opens the product for.
 *
 * It is an operation because it is a question no collection can answer: it
 * crosses the roster, the check-ins, the goals and everything anybody recorded,
 * and it ANSWERS RATHER THAN LISTS. A coach deciding by scrolling is a coach who
 * misses the person who stopped.
 *
 * ⚠️ AND NOTHING IT REPORTS IS STORED. Every reason is derived at read time from
 * records that already exist, so it cannot go stale and there is no sweep to
 * forget to run. The ordering — somebody waiting on a reply above somebody who
 * merely went quiet — is `reading.ts`, tested without a database.
 */
export const attention = operation<Bindings, Record<string, never>, { rows: unknown }, never>({
  id: "coach.attention",
  kind: "read",
  summary: "Who needs you today, and why, most urgent first.",
  input: s.object({}),
  output: s.object({ rows: s.json() }),
  permission: "client:read",
  idempotency: { mode: "none" },
  help: "attention" as never,
  async handler(ctx) {
    const today = ctx.now().slice(0, 10);
    const since = (day: string | null) => (day ? daysBetween(day, today) : null);
    /* When they arrived: the date a coach set, or failing that the day the record was made. */
    const joined = (p: { started_on: string | null; created_at: string }) => p.started_on ?? p.created_at.slice(0, 10);

    const people = await ctx.bind.db.all<{ id: string; name: string; started_on: string | null; created_at: string }>(
      `SELECT id, name, started_on, created_at FROM ${T.clients} WHERE tenant_id = ? AND deleted_at IS NULL LIMIT 500`,
      ctx.tenantId,
    );

    /*
      ⚠️ ONE QUERY PER FACT ACROSS THE WHOLE ROSTER, not one per person. A read
      a coach opens every morning that fans out per client is one that gets
      slower exactly as a studio succeeds.
    */
    const quiet = await ctx.bind.db.all<{ client_id: string; last: string }>(
      `SELECT client_id, MAX(day) AS last FROM ${T.workouts} WHERE tenant_id = ? AND deleted_at IS NULL GROUP BY client_id`,
      ctx.tenantId,
    );
    const waiting = await ctx.bind.db.all<{ client_id: string; oldest: string }>(
      `SELECT client_id, MIN(until) AS oldest FROM ${T.checkins}
       WHERE tenant_id = ? AND deleted_at IS NULL AND docstatus = 1 AND (answer IS NULL OR answer = '')
       GROUP BY client_id`,
      ctx.tenantId,
    );

    /*
      ⚠️ A GOAL PAST ITS DATE IS NOT AUTOMATICALLY OVERDUE — somebody who reached
      it early is not behind, and telling a coach they are is the quiet lie this
      whole read exists to avoid. Reaching it is a question about the entries, so
      the latest of each kind comes back too and `progressOf` decides.
    */
    const due = await ctx.bind.db.all<{ client_id: string; kind: string; start: number; target: number; due_on: string }>(
      `SELECT client_id, kind, start, target, due_on FROM ${T.goals}
       WHERE tenant_id = ? AND deleted_at IS NULL AND due_on IS NOT NULL AND due_on < ?`,
      ctx.tenantId, today,
    );
    const latest = due.length === 0 ? [] : await ctx.bind.db.all<{ client_id: string; kind: string; value: number }>(
      `SELECT e.client_id AS client_id, e.kind AS kind, e.value AS value FROM ${T.entries} e
       JOIN (SELECT client_id, kind, MAX(day) AS day FROM ${T.entries}
             WHERE tenant_id = ? AND deleted_at IS NULL GROUP BY client_id, kind) newest
         ON newest.client_id = e.client_id AND newest.kind = e.kind AND newest.day = e.day
       WHERE e.tenant_id = ? AND e.deleted_at IS NULL`,
      ctx.tenantId, ctx.tenantId,
    );

    const lastSeen = new Map(quiet.map((r) => [r.client_id, r.last]));
    const unanswered = new Map(waiting.map((r) => [r.client_id, r.oldest]));
    const now = new Map(latest.map((r) => [`${r.client_id}:${r.kind}`, r.value]));

    /* The worst still-unreached goal per person: one number, the oldest miss. */
    const behind = new Map<string, string>();
    for (const g of due) {
      const current = now.get(`${g.client_id}:${g.kind}`);
      /* No entry of that kind at all means no evidence they got there. */
      if (current !== undefined && progressOf({ start: g.start, current, target: g.target }).reached) continue;
      const worst = behind.get(g.client_id);
      if (!worst || g.due_on < worst) behind.set(g.client_id, g.due_on);
    }

    return {
      rows: needing(people.map((p) => ({
        who: { id: p.id, name: p.name },
        facts: {
          /*
            ⚠️ SILENCE COUNTS FROM THE DAY THEY JOINED WHEN THERE IS NOTHING
            ELSE. Somebody who has never recorded a thing is the quietest person
            on a roster, and a fact reading "no data" is a fact that reads as
            "nothing to report" — so they would stay invisible forever.
          */
          quietFor: since(lastSeen.get(p.id) ?? joined(p)) ?? 0,
          unansweredFor: since(unanswered.get(p.id) ?? null),
          overdueBy: since(behind.get(p.id) ?? null),
          /* DEFER(one-171) stage:7 — `endingIn` needs the access economy, which is Kova 0.5. */
          endingIn: null,
          joinedAgo: since(joined(p)) ?? 0,
        },
      }))),
    };
  },
});

/**
 * ⚠️ ONE PERSON'S WHOLE PICTURE — body, training, nutrition — computed rather
 * than kept.
 *
 * A coach asking "how is Ro doing" is asking one question, and answering it by
 * making somebody open four screens and hold the answers in their head is how
 * the old product's four separate reports came to disagree with each other.
 *
 * ⚠️ NOTHING HERE IS STORED, AND THAT IS THE DESIGN RATHER THAN AN OPTIMISATION.
 * A report written to a table is wrong the moment anybody corrects an entry, and
 * it is wrong silently — nothing about a stale number looks stale. Correcting a
 * weigh-in from six weeks ago corrects this, including the goal it was measured
 * against.
 */
export const report = operation<
  Bindings,
  { clientId: string; days?: number },
  { window: unknown; body: unknown; training: unknown; nutrition: unknown },
  "platform.not_found"
>({
  id: "client.report",
  kind: "read",
  summary: "One client's whole picture over a window: body, training and nutrition.",
  input: s.object({ clientId: s.text({ max: 40 }), days: s.optional(s.number({ integer: true, min: 1, max: 365 })) }),
  output: s.object({ window: s.json(), body: s.json(), training: s.json(), nutrition: s.json() }),
  permission: "client:read",
  idempotency: { mode: "none" },
  fails: ["platform.not_found"],
  help: "reports" as never,
  async handler(ctx, input: { clientId: string; days?: number }) {
    const span = input.days ?? 28;
    const until = ctx.now().slice(0, 10);
    const since = new Date(Date.parse(`${until}T00:00:00.000Z`) - span * 86_400_000).toISOString().slice(0, 10);

    const who = await ctx.bind.db.first<{ id: string; name: string }>(
      `SELECT id, name FROM ${T.clients} WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      input.clientId, ctx.tenantId,
    );
    if (!who) ctx.fail("platform.not_found", { field: "clientId" });

    /* ------------------------------------------------------------- body --- */

    /*
      ⚠️ THE LATEST OF EACH KIND, OVER ALL TIME RATHER THAN THE WINDOW. Somebody
      who did not weigh in this month still has a weight, and a report that
      showed a blank would read as "they have never recorded one".
    */
    const readings = await ctx.bind.db.all<{ kind: string; day: string; value: number }>(
      `SELECT e.kind AS kind, e.day AS day, e.value AS value FROM ${T.entries} e
       JOIN (SELECT kind, MAX(day) AS day FROM ${T.entries}
             WHERE tenant_id = ? AND client_id = ? AND deleted_at IS NULL GROUP BY kind) newest
         ON newest.kind = e.kind AND newest.day = e.day
       WHERE e.tenant_id = ? AND e.client_id = ? AND e.deleted_at IS NULL`,
      ctx.tenantId, input.clientId, ctx.tenantId, input.clientId,
    );
    const latest = new Map(readings.map((r) => [r.kind, r]));

    const goalRows = await ctx.bind.db.all<{ id: string; kind: string; start: number; target: number; due_on: string | null; why: string | null }>(
      `SELECT id, kind, start, target, due_on, why FROM ${T.goals}
       WHERE tenant_id = ? AND client_id = ? AND deleted_at IS NULL`,
      ctx.tenantId, input.clientId,
    );

    /* ---------------------------------------------------------- training --- */

    const done = await ctx.bind.db.all<{ id: string; day: string }>(
      `SELECT id, day FROM ${T.workouts}
       WHERE tenant_id = ? AND client_id = ? AND deleted_at IS NULL AND docstatus = 1 AND day >= ? AND day <= ?`,
      ctx.tenantId, input.clientId, since, until,
    );

    const following = await ctx.bind.db.first<{ weeks: string }>(
      `SELECT weeks FROM ${T.programmes}
       WHERE tenant_id = ? AND client = ? AND kind = 'training' AND active = 1 AND deleted_at IS NULL`,
      ctx.tenantId, input.clientId,
    );
    let asks: number | null = null;
    if (following) {
      /* ⚠️ A body that will not parse asks for NOTHING, never for nought. */
      try { asks = prescribedPerWeek(JSON.parse(following.weeks) as unknown); } catch { asks = null; }
    }

    /*
      ⚠️ THE BEST SET PER MOVEMENT, ACROSS ALL TIME. A personal best that reset
      every four weeks is not a personal best. The window is what the consistency
      figure is about, not what a record is about.
    */
    const lifted = await ctx.bind.db.all<{ movement: string; name: string | null; load: number | null; reps: number | null }>(
      `SELECT s.movement AS movement, m.name AS name, s.load AS load, s.reps AS reps
       FROM ${T.sets} s LEFT JOIN ${T.movements} m ON m.id = s.movement
       WHERE s.tenant_id = ? AND s.client_id = ?`,
      ctx.tenantId, input.clientId,
    );
    const byMovement = new Map<string, { name: string | null; sets: { load: number; reps: number }[] }>();
    for (const row of lifted) {
      const seen = byMovement.get(row.movement) ?? { name: row.name, sets: [] };
      seen.sets.push({ load: row.load ?? 0, reps: row.reps ?? 0 });
      byMovement.set(row.movement, seen);
    }
    const bests = [...byMovement.entries()].flatMap(([id, m]) => {
      const best = bestOf(m.sets);
      return best ? [{ movement: id, name: m.name, of: best.of, estimate: best.estimate }] : [];
    });

    /* --------------------------------------------------------- nutrition --- */

    const eaten = await ctx.bind.db.all<{ day: string; amount: number; per: number; protein: number; carbs: number; fat: number; fibre: number | null }>(
      `SELECT p.day AS day, p.amount AS amount, f.per AS per, f.protein AS protein, f.carbs AS carbs, f.fat AS fat, f.fibre AS fibre
       FROM ${T.portions} p JOIN ${T.foods} f ON f.id = p.food
       WHERE p.tenant_id = ? AND p.client_id = ? AND p.day >= ? AND p.day <= ?`,
      ctx.tenantId, input.clientId, since, until,
    );
    const perDay = new Map<string, Macros[]>();
    for (const row of eaten) {
      const of = portionOf({ per: row.per, protein: row.protein, carbs: row.carbs, fat: row.fat, fibre: row.fibre ?? 0 }, row.amount);
      perDay.set(row.day, [...(perDay.get(row.day) ?? []), of]);
    }
    const days = [...perDay.values()].map((portions) => totalOf(portions));
    const average = overDays(days);

    return {
      window: { since, until, days: span, client: { id: who!.id, name: who!.name } },
      body: {
        latest: Object.fromEntries([...latest].map(([kind, r]) => [kind, { day: r.day, value: r.value }])),
        goals: goalRows.map((g) => {
          const current = latest.get(g.kind)?.value;
          return {
            id: g.id, kind: g.kind, start: g.start, target: g.target, dueOn: g.due_on, why: g.why,
            /* ⚠️ Null rather than zero when nothing has been recorded: no progress
               is not the same as no movement, and a bar at 0% is an accusation. */
            progress: current === undefined ? null : progressOf({ start: g.start, current, target: g.target }),
            daysLeft: g.due_on ? daysLeft(until, g.due_on) : null,
          };
        }),
      },
      training: {
        workouts: done.length,
        /*
          ⚠️ REPORTED, NOT ONLY DIVIDED BY. "Nine of fourteen" answers a
          different question from "the block asks for three and a half a week",
          and without this the difference between a programme that asks for
          nothing and one this cannot read is invisible — which makes `null` a
          distinction nothing observes and therefore one nothing protects.
        */
        prescribedPerWeek: asks,
        consistency: consistency(done.length, expectedOver(asks, span)),
        bests,
      },
      nutrition: {
        /* ⚠️ The mean carries the day count, because an average over two days is
           a different claim from an average over twenty-eight. */
        days: average.days,
        mean: average.mean,
        energy: average.days === 0 ? null : energyOf(average.mean),
      },
    };
  },
});

/* ------------------------------------------------------------------- app --- */

const STAFF = [
  "client:read", "client:write", "movement:read", "movement:write", "programme:read", "programme:write",
  "workout:read", "workout:write", "set:read", "set:write", "entry:read", "entry:write",
  "food:read", "food:write", "portion:read", "portion:write",
  "checkin:read", "checkin:write", "goal:read", "goal:write",
  "inbox:read", "file:read", "file:write", "guide:read", "milestone:read", "commerce:read",
];

export const kova = defineApp({
  id: "kova",
  name: "Kova",
  stripeMetadataPrefix: "kova",
  manifestVersion: "0.5.0",
  bindings,

  identity: {
    rootRelyingParty: "4dl.app",
    sessionScope: "origin",
    directoryRegion: "auto" as RegionId,
  },
  tenancy: {
    appRoot: "kova.4dl.app",
    doors: ["root", "setup", "admin", "slug", "custom"],
    /*
      ⚠️ ONE REGION ON DAY ONE, and adding a second is additive: the default
      keeps the bare binding name, so a new region is a new binding rather than a
      rename of every live worker's. Declaring one this app has no store for is a
      workspace that is unreachable from the moment it is created.
    */
    regions: ["auto"] as RegionId[],
    defaultRegion: "auto" as RegionId,
    /* ⚠️ Kova's own brand words. A studio at `coach.` would be a takeover. */
    reservedSlugs: ["kova", "coach", "team", "studio", "trainer"],
  },
  format: {
    currency: "USD" as Currency,
    timeZone: "Europe/Berlin" as TimeZone,
    locale: "en" as Locale,
    units: "metric",
    weekStart: 1,
  },

  access: {
    permissions: [
      ...STAFF, "workspace:create", "workspace:close", "billing:manage", "billing:operate", "commerce:manage",
      "member:read", "member:manage",
    ],
    roles: {
      /*
        ⚠️ `member:manage` IS WHAT MAKES A ROLE THE FOUNDING ONE. The platform
        picks the role that creates a workspace by what it can DO rather than by
        what it is called, so this key is not decoration — remove it here and a
        new studio is founded with nobody able to invite anybody into it.
      */
      owner: [...STAFF, "workspace:create", "workspace:close", "billing:manage", "billing:operate", "commerce:manage", "member:read", "member:manage"],
      /* ⚠️ A coach SEES the team and cannot change it — hiring is the owner's. */
      trainer: [...STAFF, "workspace:create", "member:read"],
      /* ⚠️ The front desk sees people and bookings, and prescribes nothing. */
      assistant: ["client:read", "workout:read", "inbox:read", "guide:read", "milestone:read", "commerce:read", "file:read", "member:read"],
      /*
        ⚠️ A CLIENT WRITES THEIR OWN RECORD AND READS WHAT WAS PRESCRIBED. The
        row scope does the narrowing — `session`, `set` and `entry` are subject
        scoped, so a caller who IS a customer can only ever reach their own.
      */
      client: [
        "programme:read", "movement:read", "workout:read", "workout:write", "set:read", "set:write",
        "entry:read", "entry:write", "food:read", "portion:read", "portion:write",
        /* ⚠️ A client WRITES a check-in and READS the answer; replying is staff's. */
        "checkin:read", "checkin:write", "goal:read",
        "inbox:read", "guide:read", "milestone:read", "file:read", "commerce:read",
      ],
      /*
        ⚠️ WHAT SOMEBODY MAY DO ON THE OPERATOR DOOR, where there is no studio to
        be a member of. The door is the control; this says what it opens onto,
        and it is deliberately narrow — the deployment's own checklist and its
        payment plumbing, never a studio's records.
      */
      operator: ["guide:read", "billing:operate", "inbox:read"],
    },

    /*
      ⚠️ WHAT THE PLATFORM SELLS A STUDIO, and every entry names how it is
      withheld. The floor is three clients, because a one-client plan is not a
      trainer plan at all — it is a self-coaching tier inside a product built out
      of staff, clients and packages. The parking state is ONE, below the floor:
      not paying must never buy more than the cheapest plan does.
    */
    entitlements: {
      clients: { label: "People you coach", parked: 1, enforcement: "quota" },
      /*
        ⚠️ THE OWNER'S OWN SEAT IS ONE OF THEM, which is why the floor is one
        rather than zero: a studio of one coach is the entry plan's whole shape.
        The founding membership is written without asking, because a workspace
        whose creator does not fit is a workspace nobody can enter.
      */
      seats: { label: "Staff", parked: 1, enforcement: "quota" },
      storedBytes: { label: "Storage", unit: "bytes", parked: 200_000_000, enforcement: "quota" },
      training: { label: "Training plans", parked: true, enforcement: "gate" },
    },
    plans: [
      {
        id: "solo",
        name: "Solo",
        price: { minor: 499, currency: "USD" as Currency },
        period: "month",
        trialDays: 14,
        entitlements: { clients: 3, seats: 1, storedBytes: 2_000_000_000, training: true },
      },
      {
        id: "studio",
        name: "Studio",
        price: { minor: 2900, currency: "USD" as Currency },
        period: "month",
        trialDays: 14,
        entitlements: { clients: 25, seats: 5, storedBytes: 20_000_000_000, training: true },
      },
      {
        id: "max",
        name: "Max",
        price: { minor: 9900, currency: "USD" as Currency },
        period: "month",
        trialDays: 14,
        entitlements: { clients: UNLIMITED, seats: UNLIMITED, storedBytes: 100_000_000_000, training: true },
      },
    ],

    /*
      ⚠️ THE RAIL IS OPEN AND NOTHING IS SOLD THROUGH IT YET. A studio sells
      access to its own clients, and that is version 0.3 — declaring the rail now
      is honest (the surface exists, empty) and declaring flags for it would not
      be, because nothing gates them.
    */
    /* ⚠️ A CLIENT RECORD IS THE CUSTOMER, not the account that signs in. A coach
       acts on somebody's behalf all day; resolving the caller's own account as
       the subject would give the coach the client's package and the client
       nothing. The membership names the record, on the invitation. */
    customerRail: "record",
    customerFlags: {},
    seats: { counts: ["owner", "trainer", "assistant"] },
    /* ⚠️ What somebody holds before they belong to a studio: opening one. A coach
       invited to somebody else's studio arrives with a membership and needs
       nothing here; a person starting their own has no membership to read. */
    personal: ["workspace:create"],
  },

  governance: {
    legal: [
      { id: "terms", version: "2026-01-01", mustAccept: ["owner"] },
      { id: "privacy", version: "2026-01-01", mustAccept: ["owner", "trainer", "assistant", "client"] },
    ],
    impersonation: { maxMinutes: 30, announce: true },
    auditRetentionDays: 730,
  },

  collections: [clients, movements, programmes, workouts, sets, foods, portions, entries, checkins, goals],

  notifications: {
    "workspace.created": {
      category: "service", tone: "success", icon: "sparkle",
      title: "{slug} is ready", link: { to: "inbox" }, roles: ["owner"],
    },
    "plan.chosen": {
      category: "billing", tone: "info", icon: "card",
      title: "You chose {planId}", link: { to: "inbox" }, roles: ["owner"],
    },
    "package.granted": {
      category: "billing", tone: "success", icon: "gift",
      title: "{days} days added", link: { to: "inbox" }, roles: ["owner", "client"],
    },
    /* ⚠️ The one that matters: a person is told what they are meant to do. */
    "programme.published": {
      category: "activity", tone: "success", icon: "check",
      title: "You have a new programme",
      link: { to: "collection", collection: "programme" },
      roles: ["client"],
    },
    "workout.completed": {
      category: "activity", tone: "info", icon: "check",
      title: "A workout was finished",
      link: { to: "collection", collection: "workout" },
      roles: ["owner", "trainer"],
    },
    /* ⚠️ Raised by the document's own transition, not by an operation beside it. */
    "checkin.filed": {
      category: "activity", tone: "info", icon: "check",
      title: "A check-in came in",
      link: { to: "collection", collection: "checkin" },
      roles: ["owner", "trainer"],
    },
    "checkin.answered": {
      category: "activity", tone: "success", icon: "check",
      title: "Your coach replied",
      link: { to: "collection", collection: "checkin" },
      roles: ["client"],
    },
    "milestone.earned": {
      category: "activity", tone: "success", icon: "sparkle",
      title: "{title}", link: { to: "inbox" },
      roles: ["owner", "trainer", "client"],
    },
  },

  operations: [publish, complete, answer, attention, report],

  help: {
    clients: {
      title: "Adding somebody you coach",
      body: "A client is one person you work with. Add them with a name, and fill in the rest as you learn it. What you write under their situation is what you are working from — review it every few months, because people change and the note does not.",
      steps: ["Open Clients", "Add", "Name them", "Save"],
      surfaces: ["client"],
    },
    movements: {
      title: "Building your library",
      body: "A movement is one exercise you prescribe. Kova ships none on purpose: a library somebody else chose is a list you have to clean out before you can trust it. Add the ones you actually use and describe them well enough that somebody could do it without you.",
      surfaces: ["movement"],
    },
    programmes: {
      title: "Writing and publishing a programme",
      body: "A programme is weeks of days of movements. One with nobody's name on it is a template you can start the next one from. Publishing makes it the one this person is following and tells them — only one is current at a time, so the last one steps down.",
      steps: ["Open Programmes", "Write the weeks", "Choose who it is for", "Publish"],
      surfaces: ["programme"],
    },
    workouts: {
      title: "Recording what you did",
      body: "A workout is one visit. Add the sets as you go, then finish it. Once a workout is finished it stops being editable — that is the point of it, because a training history you can quietly change is not a history. If something was wrong, amend it and both versions stay.",
      surfaces: ["workout", "set"],
    },
    foods: {
      title: "Building a food library",
      body: "A food carries what somebody measured: protein, carbohydrate, fat and fibre, and what those numbers are per. Energy is worked out from them rather than stored, so a food can never say one thing and add up to another. A tin is per 100 grams; an egg is per egg.",
      steps: ["Open Foods", "Add", "Copy the numbers off the label", "Say what they are per"],
      surfaces: ["food"],
    },
    portions: {
      title: "Logging what you ate",
      body: "Pick the food, say how much, and say which meal it was. The amount is in the food's own unit — two eggs is two, not a hundred and twenty grams. The day's totals come from the portions themselves, so correcting one corrects the day.",
      surfaces: ["portion"],
    },
    reports: {
      title: "Reading how somebody is doing",
      body: "One picture rather than four screens: where their body is against the goals they set, how much of their programme they actually did, their best sets, and how they have been eating. Nothing here is stored — it is worked out from what has been recorded, so correcting a weigh-in from six weeks ago corrects the report too. An average is over the days that were logged, never over the whole window.",
      surfaces: ["client", "goal", "entry", "workout", "set", "portion"],
    },
    attention: {
      title: "Who needs you today",
      body: "Rather than a list of everybody, this is the short list of people something is true about: somebody waiting on a reply, a goal that has passed its date, somebody who has gone quiet. Waiting on a reply comes first, because that is the one person who is waiting on you. Somebody who joined this week is never called quiet.",
      surfaces: ["client"],
    },
    checkins: {
      title: "Reporting in, and hearing back",
      body: "A check-in is what you say about a stretch of time: how it went and what you are stuck on. Once you send it, what you wrote stops being editable — your coach is replying to what you actually said. The numbers are not copied into it, so correcting a weigh-in corrects it everywhere, including here.",
      steps: ["Open Check-ins", "Say how it went", "Send"],
      surfaces: ["checkin"],
    },
    goals: {
      title: "Working towards something",
      body: "A goal records where you started, where you are going, and by when. How far along you are is worked out from what you have logged, so it is never out of date — and it is measured from where you started, which is the only way a goal to lose weight and a goal to gain weight read the same.",
      surfaces: ["goal"],
    },
    entries: {
      title: "Keeping track of yourself",
      body: "Weight, sleep, mood, water, steps and your measurements all live in one place, recorded against the day they happened. The day is yours, from your own device, so an evening entry is not tomorrow.",
      surfaces: ["entry"],
    },
  },

  filePurposes: {
    avatar: { label: "Photo", accept: ["image/jpeg", "image/png"], maxBytes: 4_000_000 },
    demo: { label: "Movement demonstration", accept: ["video/mp4", "image/jpeg", "image/png"], maxBytes: 20_000_000 },
  },

  jobs: [],

  /*
    ⚠️ THREE SETUPS, ONE DECLARATION. The deployment is set up by whoever runs
    it, the studio by whoever opened it, and a client by themselves — every time
    a new one arrives. The third is the one that gets built as the second.
  */
  guide: {
    steps: [
      { id: "take-payments", title: "Connect a payment provider", roles: ["owner"], setup: "deployment", required: true, answer: { kind: "platform", fact: "payments_configured" } },
      { id: "choose-plan", title: "Choose a plan", roles: ["owner"], setup: "workspace", required: true, answer: { kind: "platform", fact: "plan_chosen" } },
      { id: "first-food", title: "Add the foods you prescribe", roles: ["owner", "trainer"], setup: "workspace", required: false, answer: { kind: "collection", collection: "food", atLeast: 1 }, does: "food.create", help: "foods" as never },
      { id: "first-movement", title: "Add the movements you use", roles: ["owner", "trainer"], setup: "workspace", required: true, answer: { kind: "collection", collection: "movement", atLeast: 1 }, does: "movement.create", help: "movements" },
      { id: "first-client", title: "Add somebody you coach", roles: ["owner", "trainer"], setup: "workspace", required: false, answer: { kind: "collection", collection: "client", atLeast: 1 }, does: "client.create", help: "clients" },
      { id: "a-passkey", title: "Add a passkey so you can sign in with a tap", roles: ["owner", "trainer", "assistant", "client"], setup: "person", required: false, answer: { kind: "platform", fact: "passkey_registered" } },
      { id: "first-workout", title: "Record your first workout", roles: ["client"], setup: "person", required: false, answer: { kind: "collection", collection: "workout", atLeast: 1 }, does: "workout.create", help: "workouts" as never },
    ],
    hints: [
      { id: "last-time", surface: "set", body: "What you lifted last time for this movement is shown as you type.", roles: ["client"] },
    ],
  },

  /*
    ⚠️ RECOGNITION, NOT SCORE. There is no total and no ranking — comparison
    between people being coached through their own bodies is a product decision
    nobody asked for. A milestone is a person against who they were last month.
  */
  milestones: {
    "first-plan": {
      title: "Your first programme",
      body: "You wrote a programme and somebody is following it.",
      icon: "sparkle",
      rule: { kind: "first", event: "programme.published" },
      roles: ["owner", "trainer"],
    },
    "first-session": {
      title: "You started",
      icon: "flame",
      rule: { kind: "first", event: "workout.completed" },
      roles: ["client"],
    },
    "a-full-week": {
      title: "Seven days running",
      icon: "flame",
      rule: { kind: "streak", event: "workout.completed", days: 7 },
      roles: ["client"],
    },
    "first-checkin": {
      title: "You reported in",
      body: "The thing that keeps a coaching relationship going.",
      icon: "check",
      rule: { kind: "first", event: "checkin.filed" },
      roles: ["client"],
    },
    "ten-checkins": {
      title: "Ten check-ins",
      icon: "check",
      rule: { kind: "count", event: "checkin.filed", reaches: 10 },
      roles: ["client"],
    },
    "fifty-sessions": {
      title: "Fifty workouts",
      icon: "check",
      rule: { kind: "count", event: "workout.completed", reaches: 50 },
      roles: ["client"],
    },
  },

  releases: [
    {
      version: "0.5.0",
      at: "2026-08-10",
      notes: [
        "Invite a colleague or a client by email — they sign in with that address and land in your studio, with the role you gave them.",
        "See who is on the team, including anybody who has not accepted yet, and how many seats your plan includes.",
        "Narrow what one colleague can do within their role, without inventing a new role for them.",
        "A client now sees only what a client is meant to see. Nobody who was not invited can see anything at all.",
      ],
    },
    {
      version: "0.4.0",
      at: "2026-08-10",
      notes: [
        "See who needs you today — somebody waiting on a reply first, then a goal that has passed its date, then anybody who has gone quiet.",
        "Read one client's whole picture on one screen: where their body is, how much of their programme happened, their best sets and how they have been eating.",
        "A best set is chosen by what it was worth rather than what was on the bar, so a heavy single no longer outranks a hard five.",
        "Nothing in a report is stored, so correcting a weigh-in from six weeks ago corrects the report as well.",
      ],
    },
    {
      version: "0.3.0",
      at: "2026-08-10",
      notes: [
        "Report in on how a stretch of time went, and hear back from your coach.",
        "What you wrote in a check-in stops being editable once you send it — your coach is replying to what you said.",
        "Set a goal and see how far along it is, worked out from what you have logged rather than typed in again.",
      ],
    },
    {
      version: "0.2.0",
      at: "2026-08-10",
      notes: [
        "Build a library of foods, and log what you actually ate.",
        "A food's energy is worked out from what was measured, so it can never disagree with itself.",
        "Write a way of eating alongside a way of training — publishing one no longer takes the other away.",
      ],
    },
    {
      version: "0.1.0",
      at: "2026-08-10",
      notes: [
        "Kova is now built on the ONE platform.",
        "Write a programme, publish it, and the person following it is told.",
        "Record a workout set by set, finish it, and it stops being editable.",
        "Weight, sleep, mood, water, steps and measurements now live in one place.",
      ],
    },
  ],

  retired: {},

  problems: {
    "coaching.programme_has_no_client": {
      status: 409,
      title: "This programme is a template",
      retryable: false,
      detail: () => "Choose who it is for before publishing it.",
      help: "programmes" as never,
    },
  },
});
