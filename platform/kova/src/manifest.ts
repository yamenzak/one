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

import { energyOf, overDays, portionOf, totalOf, type Macros } from "./nutrition.js";
import { bestOf, needing, prescribedPerWeek } from "./reading.js";
import { drawWith, forgetSubject, generateAbout, generateWith, draftsFrom, readsAPicture, lapsedAcross, lookUp, lookupProblem, readSettings, laddersFrozen, readLadder, readSubscription, refusalProblem, runwayAcross } from "@one/runtime";
import { progressWeek, weekAt, WEEKS_SHAPE, type Week } from "./plans.js";
import { FASTING_ZONES, wellnessOf, zoneAt } from "./living.js";
import { roundsOf } from "./plans.js";
import {
  UNLIMITED,
  cache, collection, defineApp, defineBindings, field,
  consistency, daysBetween, daysLeft, expectedOver, inference, objects, operation, progressOf, rungFor, s, soonestScope, sql, tableNameFor, type SettingsSpec,
  type AiSpec, type Currency, type Locale, type RegionId, type SqlHandle, type TimeZone,
} from "@one/kernel";

/* -------------------------------------------------------------- bindings --- */

export const bindings = defineBindings({
  db: sql(),
  media: objects({ jurisdictional: true }),
  cache: cache(),
  /*
    ⚠️ THE ALLOW-LIST IS THE RESIDENCY ANSWER, and it is here rather than in the
    catalogue because it is a fact about where a deployment may send data rather
    than about what a model costs. A model outside it is refused; nothing runs
    somewhere a studio was told its clients' records would not go.
  */
  /*
    ⚠️ OPTIONAL, because a Kova with no model runner is a working Kova. Every
    generation refuses and says so; nothing anywhere invents an answer and
    charges for it.
  */
  /*
    ⚠️ EVERY MODEL THIS APP MAY REACH, NAMED. A region carries a sub-processor
    allow-list, and one not on it is REFUSED rather than quietly run somewhere a
    workspace was promised its data would not go — so adding a model to the
    catalogue and forgetting this line is a feature that answers "not permitted
    in this region" and nothing else.
  */
  ai: inference({
    subprocessors: [
      "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-image",
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/qwen/qwen2.5-coder-32b-instruct",
    ],
    /*
      ⚠️ THE SAME SET IN BOTH REGIONS, AND SAYING SO IS THE POINT.

      This is the uncomfortable answer written down rather than left to a
      fallback. Neither provider offers inference that is guaranteed to stay
      inside the EEA: Gemini processes on Google's infrastructure under standard
      contractual clauses, and Cloudflare's inference network is not
      region-pinned. So a studio that chose `eu` gets EU STORAGE — a different
      database, asserted by a test — and its generations still leave, under the
      safeguards the sub-processor list names.

      ⚠️ THE ALTERNATIVE WAS NOT A NARROWER LIST, IT WAS AN EMPTY ONE, which
      would take every AI feature away from exactly the studios most likely to
      need the residency. Between a promise we cannot keep and a capability we
      remove, the third option is the true statement — and `protection.list`
      publishes this map so a studio reads it before choosing rather than after.

      The day either provider offers an EU-pinned endpoint, `eu` becomes a
      shorter list and nothing else in this file changes.
    */
    byRegion: {
      auto: [
        "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-image",
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/qwen/qwen2.5-coder-32b-instruct",
      ],
      eu: [
        "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-image",
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/qwen/qwen2.5-coder-32b-instruct",
      ],
    },
    optional: true,
  }),
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
  holding: { kind: "personal", categories: ["identity", "contact", "health"], subjects: ["customer"], purpose: "The person a studio coaches, and the situation it is coaching them in.", basis: "contract", condition: "explicit_consent" },
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
  holding: { kind: "none", why: "A studio\u2019s own library of exercises. It describes a movement, never a person." },
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
  holding: { kind: "personal", categories: ["health", "usage"], subjects: ["customer"], purpose: "What a studio has prescribed somebody to do or eat.", basis: "contract", condition: "explicit_consent" },
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
  /* ⚠️ Their own history stays readable when the days run out. See `customerFlag`. */
  customerFlag: "training",
  version: true,
  holding: { kind: "personal", categories: ["health", "usage"], subjects: ["customer"], purpose: "A session somebody did, and how it went.", basis: "contract", condition: "explicit_consent" },
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
  customerFlag: "training",
  version: true,
  holding: { kind: "personal", categories: ["health", "usage"], subjects: ["customer"], purpose: "What somebody actually lifted, so a coach can prescribe the next one.", basis: "contract", condition: "explicit_consent" },
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
    /*
      ⚠️ WHICH ROUND OF A GROUP THIS WAS, and it is what makes a superset a
      superset in the history rather than only in the plan. Without it, three
      rounds of bench-and-row are six sets in an order nobody can reconstruct —
      and "what did I do last time" is the question the whole collection exists
      to answer.
    */
    round: field.number({ integer: true, min: 1, max: 100, label: "Round" }),
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
  holding: { kind: "none", why: "A studio\u2019s own library of foods and their numbers. It describes a food, never who ate it." },
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
  customerFlag: "nutrition",
  version: true,
  holding: { kind: "personal", categories: ["health", "usage"], subjects: ["customer"], purpose: "What somebody ate, and when.", basis: "contract", condition: "explicit_consent" },
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
  holding: { kind: "personal", categories: ["health"], subjects: ["customer"], purpose: "A number somebody recorded about themselves \u2014 a weight, a measurement, how they slept.", basis: "contract", condition: "explicit_consent" },
  retention: { days: null, onTenantClose: "export-then-purge" },
  onDelete: { on: "archive" },
  fields: {
    /*
      ⚠️ THE DAY IS THE PERSON'S, FROM THEIR DEVICE. A boundary at midnight UTC
      is four in the afternoon in California, and somebody's Sunday is not our
      Monday. The same rule the milestone engine's streaks run on.
    */
    day: field.plainDate({ required: true, label: "Day" }),
    /*
      ⚠️ `energy` JOINS `sleep` AND `mood` HERE RATHER THAN ON A CHECK-IN. One
      fact, one home: a number copied onto a weekly report is a second version of
      it that nobody can correct, and correcting the original then leaves the
      report saying something else. The wellness score reads this table.
    */
    kind: field.enum(["weight", "waist", "hip", "chest", "arm", "thigh", "sleep", "mood", "energy", "water", "steps"], { required: true }),
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
  customerFlag: "checkins",
  label: { one: "Check-in", many: "Check-ins" },
  scope: { of: "subject", subject: "client" },
  version: true,
  holding: { kind: "personal", categories: ["health", "content"], subjects: ["customer"], purpose: "A report somebody wrote about their own week, and their coach\u2019s reply.", basis: "contract", condition: "explicit_consent" },
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
  holding: { kind: "personal", categories: ["health"], subjects: ["customer"], purpose: "What somebody is working towards, and from where.", basis: "contract", condition: "explicit_consent" },
  retention: { days: null, onTenantClose: "export-then-purge" },
  onDelete: { on: "archive" },
  activity: true,
  fields: {
    /** The same vocabulary an entry uses, so progress is a query rather than a join by hand. */
    /*
      ⚠️ `energy` JOINS `sleep` AND `mood` HERE RATHER THAN ON A CHECK-IN. One
      fact, one home: a number copied onto a weekly report is a second version of
      it that nobody can correct, and correcting the original then leaves the
      report saying something else. The wellness score reads this table.
    */
    kind: field.enum(["weight", "waist", "hip", "chest", "arm", "thigh", "sleep", "mood", "energy", "water", "steps"], { required: true }),
    start: field.number({ required: true, label: "Where they started" }),
    target: field.number({ required: true }),
    /* ⚠️ `dueOn`, not `by` — a third SQL keyword caught at declaration rather than at boot. */
    dueOn: field.plainDate({ label: "By" }),
    why: field.text({ multiline: true, max: 1_000 }),
  },
});

/* --------------------------------------------------------- alternatives --- */

/**
 * A movement that stands in for another.
 *
 * ⚠️ A COLLECTION RATHER THAN A LIST ON THE MOVEMENT, because a stand-in has a
 * REASON and the reason is the useful half. "Goblet squat instead of back squat"
 * says nothing; "instead of back squat, if the bar hurts your shoulder" is
 * something a client can act on and a different coach can trust.
 *
 * ⚠️ AND IT IS DIRECTIONAL. What stands in for a back squat is not what a back
 * squat stands in for, and a symmetric list quietly asserts both.
 */
export const alternatives = collection({
  id: "alternative",
  label: { one: "Alternative", many: "Alternatives" },
  scope: { of: "tenant" },
  version: true,
  holding: { kind: "none", why: "Which movement stands in for which, and when. A fact about two exercises." },
  retention: { days: null, onTenantClose: "purge" },
  onDelete: { on: "purge" },
  fields: {
    movement: field.ref("movement", { onDelete: "cascade", required: true }),
    substitute: field.ref("movement", { onDelete: "cascade", required: true }),
    why: field.text({ required: true, max: 400, label: "When to use it" }),
  },
});

/* ---------------------------------------------------------------- swaps --- */

/**
 * A client asking to do something else, and the answer.
 *
 * ⚠️ ONE RECORD, NOT A MESSAGE. A swap asked for in a chat is a decision nobody
 * can find afterwards — and the question a coach is actually answering is "may
 * I do this instead", which has exactly three states and belongs in a row.
 *
 * ⚠️ AND THE ANSWER IS THE COACH'S. A client may open one and may not decide
 * one, which is the same line every other prescription in this product draws.
 */
export const swaps = collection({
  id: "swap",
  label: { one: "Swap request", many: "Swap requests" },
  scope: { of: "subject", subject: "client" },
  customerFlag: "training",
  version: true,
  holding: { kind: "personal", categories: ["health", "content"], subjects: ["customer"], purpose: "Somebody asking to change a movement they cannot do, and the answer.", basis: "contract", condition: "explicit_consent" },
  retention: { days: null, onTenantClose: "purge" },
  onDelete: { on: "purge" },
  activity: true,
  fields: {
    movement: field.ref("movement", { onDelete: "cascade", required: true }),
    why: field.text({ required: true, max: 500, label: "Why" }),
    /*
      ⚠️ THE ANSWER IS THE STUDIO'S, AND THESE THREE `write` DECLARATIONS ARE
      WHAT MAKE THAT TRUE. A client must hold `swap:write` to open a request at
      all, and that same permission opens the derived update — so without a
      narrower write on the answering fields, `swap.decide` is a lock beside an
      open window and anybody can mark their own request allowed.
    */
    state: field.enum(["asked", "allowed", "refused"], { required: true, initial: "asked", label: "State", write: "programme:write" }),
    substitute: field.ref("movement", { onDelete: "null", write: "programme:write" }),
    answer: field.text({ max: 500, label: "What the coach said", write: "programme:write" }),
  },
});



/* ------------------------------------------------------------ offboarding --- */

/**
 * A coach asking to be released from somebody, and the owner's answer.
 *
 * ⚠️ A REQUEST RATHER THAN AN ACT, because a coach removing a client removes the
 * studio's relationship with a paying customer — and the person best placed to
 * notice that is not the person who has stopped wanting to do it. The record is
 * also the useful half: three of these about the same client is a fact about the
 * client, and three from the same coach is a fact about the coach.
 */
export const releases = collection({
  id: "release",
  label: { one: "Release request", many: "Release requests" },
  scope: { of: "tenant" },
  version: true,
  holding: { kind: "personal", categories: ["content"], subjects: ["member", "customer"], purpose: "A coach asking to be released from somebody, and the owner\u2019s answer.", basis: "contract" },
  retention: { days: null, onTenantClose: "purge" },
  onDelete: { on: "purge" },
  activity: true,
  fields: {
    client: field.ref("client", { onDelete: "cascade", required: true }),
    why: field.text({ required: true, multiline: true, max: 1_000, label: "Why" }),
    /* ⚠️ Set by the decision, never by the person asking — the same line the
       swap request draws, for the same reason. */
    state: field.enum(["asked", "agreed", "declined"], { required: true, initial: "asked", label: "State", write: "member:manage" }),
    answer: field.text({ max: 1_000, label: "What the owner said", write: "member:manage" }),
  },
});

/* --------------------------------------------------------------- fasting --- */

/**
 * A fast, started and stopped by the person doing it.
 *
 * ⚠️ TWO TIMESTAMPS, NOT A DURATION. A duration is a number computed once and
 * then wrong the moment anybody's clock, timezone or memory disagrees with it —
 * and the question people ask is "how long have I been fasting", which is a
 * function of now rather than a stored figure.
 *
 * ⚠️ AND AN OPEN FAST IS ONE WITH NO END. There is no `state` column, because a
 * state beside two timestamps is a third thing that can disagree with them.
 */
export const fasts = collection({
  id: "fast",
  label: { one: "Fast", many: "Fasts" },
  scope: { of: "subject", subject: "client" },
  customerFlag: "nutrition",
  version: true,
  holding: { kind: "personal", categories: ["health"], subjects: ["customer"], purpose: "A fast somebody is running.", basis: "contract", condition: "explicit_consent" },
  retention: { days: null, onTenantClose: "export-then-purge" },
  onDelete: { on: "purge" },
  fields: {
    startedAt: field.instant({ required: true, label: "Started" }),
    endedAt: field.instant({ label: "Ended" }),
    note: field.text({ max: 500, label: "How it went" }),
  },
});

/* ------------------------------------------------------------- photographs --- */

/**
 * A progress photograph.
 *
 * ⚠️ ITS OWN COLLECTION RATHER THAN A FIELD ON A MEASUREMENT, because the
 * question is "show me these two side by side" and that is a query across
 * records. A photograph hanging off a measurement is one nobody can find unless
 * they remember the day they were weighed.
 *
 * ⚠️ AND THE POSE IS PART OF IT. Two photographs compared from different angles
 * show a change that is not there — which for a body is the specific way this
 * feature misleads somebody about themselves.
 */
export const photos = collection({
  id: "photo",
  label: { one: "Photo", many: "Photos" },
  scope: { of: "subject", subject: "client" },
  customerFlag: "body",
  version: true,
  holding: { kind: "personal", categories: ["health", "biometric", "content"], subjects: ["customer"], purpose: "Progress photographs, so somebody can see a change over months.", basis: "consent", condition: "explicit_consent" },
  retention: { days: null, onTenantClose: "export-then-purge" },
  /* ⚠️ Purged, never archived. Somebody deleting a photograph of their own body
     means it is gone, not hidden. */
  onDelete: { on: "purge" },
  fields: {
    day: field.plainDate({ required: true, label: "Day" }),
    pose: field.enum(["front", "side", "back"], { required: true, initial: "front", label: "Pose" }),
    image: field.media({ accept: ["image/jpeg", "image/png"], maxBytes: 12_000_000, required: true }),
    note: field.text({ max: 300 }),
  },
});

/* -------------------------------------------------------------- meal swaps --- */

/**
 * Which option somebody actually took, out of the ones their coach allowed.
 *
 * ⚠️ RECORDED RATHER THAN INFERRED FROM WHAT THEY LOGGED. A coach offering three
 * versions of lunch wants to know which one is being chosen — and working that
 * out by matching logged foods against a plan is a guess that gets steadily
 * worse as somebody's logging gets looser, which is exactly when the answer
 * matters.
 */
export const mealChoices = collection({
  id: "choice",
  label: { one: "Meal choice", many: "Meal choices" },
  scope: { of: "subject", subject: "client" },
  customerFlag: "nutrition",
  version: true,
  holding: { kind: "personal", categories: ["health", "usage"], subjects: ["customer"], purpose: "Which option somebody picked within a meal their coach allowed.", basis: "contract", condition: "explicit_consent" },
  retention: { days: null, onTenantClose: "purge" },
  onDelete: { on: "purge" },
  fields: {
    day: field.plainDate({ required: true, label: "Day" }),
    programme: field.ref("programme", { onDelete: "cascade", required: true }),
    meal: field.text({ required: true, max: 80, label: "Meal" }),
    option: field.text({ required: true, max: 80, label: "Chosen" }),
  },
});

/* ------------------------------------------------------------------ scans --- */

/**
 * A body-composition estimate read off photographs.
 *
 * ⚠️ AN ESTIMATE, STORED AS ONE. The number is a model's reading of a picture,
 * so the record carries what it was read FROM and how sure it was — and a
 * product that stored it in the same column as a caliper measurement would be
 * one where nobody can tell a photograph from a clinic.
 */
export const scans = collection({
  id: "scan",
  label: { one: "Body scan", many: "Body scans" },
  scope: { of: "subject", subject: "client" },
  customerFlag: "body",
  version: true,
  holding: { kind: "personal", categories: ["health", "biometric"], subjects: ["customer"], purpose: "An estimate of body composition from photographs.", basis: "consent", condition: "explicit_consent" },
  retention: { days: null, onTenantClose: "export-then-purge" },
  onDelete: { on: "purge" },
  fields: {
    day: field.plainDate({ required: true, label: "Day" }),
    bodyFat: field.number({ min: 1, max: 70, label: "Body fat (%)" }),
    /* ⚠️ The model's own confidence, kept beside the number it qualifies. */
    confident: field.bool({ label: "Confident" }),
    front: field.media({ accept: ["image/jpeg", "image/png"], maxBytes: 12_000_000 }),
    side: field.media({ accept: ["image/jpeg", "image/png"], maxBytes: 12_000_000 }),
    note: field.text({ max: 500 }),
  },
});

/* ----------------------------------------------------------- supplements --- */

/**
 * Something a coach asked somebody to take.
 *
 * ⚠️ THE REASON IS REQUIRED, AND IT IS NOT DECORATION. A supplement with a dose
 * and no stated reason is a prescription nobody can review — not the client
 * deciding whether to keep taking it, not the next coach, and not the coach
 * themselves in six months. It is also the one field that makes the difference
 * between advice and a list.
 */
export const supplements = collection({
  id: "supplement",
  label: { one: "Supplement", many: "Supplements" },
  scope: { of: "subject", subject: "client" },
  customerFlag: "nutrition",
  version: true,
  holding: { kind: "personal", categories: ["health"], subjects: ["customer"], purpose: "What a studio has prescribed somebody to take, and why.", basis: "contract", condition: "explicit_consent" },
  retention: { days: null, onTenantClose: "export-then-purge" },
  onDelete: { on: "archive" },
  activity: true,
  fields: {
    name: field.text({ required: true, min: 1, max: 120 }),
    dose: field.text({ required: true, max: 120, label: "How much" }),
    timing: field.text({ max: 200, label: "When" }),
    why: field.text({ required: true, multiline: true, max: 1_000, label: "Why" }),
    startedOn: field.plainDate({ label: "From" }),
    /* ⚠️ Null means open-ended, which is what most of them are. */
    untilOn: field.plainDate({ label: "Until" }),
  },
});

/**
 * That somebody took what was prescribed, on a day.
 *
 * ⚠️ A DAY AND A COUNT, NOT A TICK. "Did you take it" over a week is a question
 * a coach asks and a client half-remembers; a row per day is the only version
 * either of them can look back at.
 */
export const doses = collection({
  id: "dose",
  label: { one: "Dose", many: "Doses" },
  scope: { of: "subject", subject: "client" },
  customerFlag: "nutrition",
  version: true,
  holding: { kind: "personal", categories: ["health"], subjects: ["customer"], purpose: "That somebody took what was prescribed.", basis: "contract", condition: "explicit_consent" },
  retention: { days: null, onTenantClose: "export-then-purge" },
  onDelete: { on: "purge" },
  fields: {
    supplement: field.ref("supplement", { onDelete: "cascade" }),
    /** ⚠️ THE PERSON'S OWN DAY, from their device. See `entry.day`. */
    day: field.plainDate({ required: true, label: "Day" }),
    taken: field.bool({ required: true, label: "Taken" }),
  },
});

/* ----------------------------------------------------------------- labs --- */

/**
 * A test a coach asked for, and the report that came back.
 *
 * ⚠️ ONE RECORD, NOT TWO. A request and a result as separate collections is two
 * rows that have to be matched by somebody, and the matching is what gets lost —
 * so the ask and the answer are one row that fills in.
 *
 * ⚠️ AND THE REPORT IS A FILE THE STUDIO STORES, which is why it is a media
 * field rather than a link: a link to somebody's clinic portal is a credential
 * or an expiry, and neither belongs in a coaching record.
 */
export const labs = collection({
  id: "lab",
  label: { one: "Lab test", many: "Lab tests" },
  scope: { of: "subject", subject: "client" },
  version: true,
  /*
    ⚠️ KEPT UNTIL THE STUDIO SAYS OTHERWISE, and exported when it closes. This is
    the most sensitive thing in the product; a retention window measured in
    months would delete somebody's own record of their health.
  */
  holding: { kind: "personal", categories: ["health"], subjects: ["customer"], purpose: "A test a studio asked for, and its result.", basis: "contract", condition: "explicit_consent" },
  retention: { days: null, onTenantClose: "export-then-purge" },
  onDelete: { on: "archive" },
  activity: true,
  fields: {
    panel: field.text({ required: true, min: 1, max: 200, label: "What to test" }),
    why: field.text({ multiline: true, max: 1_000, label: "Why" }),
    askedOn: field.plainDate({ required: true, label: "Asked" }),
    /* ⚠️ Null until it comes back, which is the state most of them are in. */
    takenOn: field.plainDate({ label: "Taken" }),
    report: field.media({ accept: ["image/jpeg", "image/png"], maxBytes: 8_000_000, label: "Report" }),
    notes: field.text({ multiline: true, max: 4_000, label: "What it said" }),
  },
});

/* ------------------------------------------------------------- coaching --- */

/**
 * Which coach works with which client.
 *
 * ⚠️ A COLLECTION RATHER THAN A COLUMN, because it is many to many and because
 * it changes. A `coach` column on a client loses the second coach a studio adds
 * for the same person, and loses the history of who it used to be — which is
 * the question anybody asks when a client says something was prescribed and the
 * coach in front of them has never seen it.
 */
export const assignments = collection({
  id: "assignment",
  label: { one: "Assignment", many: "Assignments" },
  scope: { of: "subject", subject: "client" },
  version: true,
  holding: { kind: "personal", categories: ["usage"], subjects: ["customer", "member"], purpose: "Which member of staff works with which of the people a studio coaches.", basis: "contract" },
  retention: { days: null, onTenantClose: "purge" },
  onDelete: { on: "purge" },
  activity: true,
  fields: {
    /* ⚠️ A membership id: staff are memberships here, not a collection. */
    coach: field.text({ required: true, max: 40, label: "Coach" }),
    since: field.plainDate({ required: true, label: "Since" }),
    lead: field.bool({ label: "Lead coach" }),
  },
  rule: {
    why: "already_assigned" as const,
    async check({ db, tenantId, table, id, row }) {
      const coach = String(row.coach ?? "");
      const client = String(row.client ?? row.client_id ?? "");
      if (!coach || !client) return true;
      /*
        ⚠️ ONE ROW PER COACH PER CLIENT. A second is not a second relationship —
        it is the same one, entered twice, and it doubles somebody on every
        screen that lists who is coaching whom.
      */
      const held = await db.all<{ id: string }>(
        `SELECT id FROM ${table} WHERE tenant_id = ? AND client_id = ? AND coach = ? LIMIT 50`,
        tenantId, client, coach,
      );
      return !held.some((h) => h.id !== id);
    },
  },
});

/* -------------------------------------------------------------- bookings --- */

/**
 * An appointment: one person, one coach, one hour.
 *
 * ⚠️ `booking`, NOT `session`, and the composition check is why. The platform's
 * own `sessions` table is what a sign-in leaves behind, and two modules creating
 * one name means whichever runs first wins while the other's columns silently
 * never exist. The word a studio uses is still "session" — that is the label's
 * job, not the id's.
 *
 * ⚠️ THE RULE IS ON THE COLLECTION, NOT ON A `session.book` BESIDE IT. A coach
 * cannot be in two places at once, and a check written into a bespoke booking
 * operation leaves the derived create standing next to it making the same row
 * without the check — which is one screen away from being the way bookings are
 * actually made.
 */
export const bookings = collection({
  id: "booking",
  label: { one: "Session", many: "Sessions" },
  scope: { of: "subject", subject: "client" },
  version: true,
  /*
    ⚠️ KEPT, because an appointment history is what a studio bills against and
    what a client remembers. Purged with the studio, like everything else.
  */
  holding: { kind: "personal", categories: ["usage"], subjects: ["customer", "member"], purpose: "When somebody is booked in, and with whom.", basis: "contract" },
  retention: { days: null, onTenantClose: "export-then-purge" },
  onDelete: { on: "archive" },
  activity: true,
  fields: {
    /* ⚠️ An INSTANT, not a local date — an appointment is a moment two people
       have to agree on, and a wall-clock time is not one until a zone is known. */
    startsAt: field.instant({ required: true, label: "Starts" }),
    minutes: field.number({ required: true, integer: true, min: 5, max: 480, label: "Minutes" }),
    /* ⚠️ Who is expected. A membership id, because staff are memberships here. */
    coach: field.text({ required: true, max: 40, label: "Coach" }),
    place: field.text({ max: 120, label: "Where" }),
    /*
      ⚠️ WHAT HAPPENED IS NOT WHETHER IT WAS BOOKED. Deleting a missed session
      loses the thing a studio most needs to see; `state` keeps it and says so.
    */
    state: field.enum(["booked", "attended", "missed", "cancelled"], { required: true, label: "State" }),
    note: field.text({ multiline: true, max: 1_000 }),
  },
  rule: {
    why: "coach_double_booked" as const,
    async check({ db, tenantId, table, id, row }) {
      const coach = String(row.coach ?? "");
      const startsAt = String(row.startsAt ?? "");
      const minutes = Number(row.minutes ?? 0);
      if (!coach || !startsAt || !minutes) return true;

      const from = Date.parse(startsAt);
      if (!Number.isFinite(from)) return true;
      const to = from + minutes * 60_000;

      /*
        ⚠️ A CANCELLED SESSION BLOCKS NOTHING. Keeping the row is how a studio
        sees what happened; treating it as an occupied hour would make an hour
        somebody cancelled permanently unbookable.
      */
      const clashes = await db.all<{ id: string; starts_at: string; minutes: number }>(
        `SELECT id, starts_at, minutes FROM ${table}
         WHERE tenant_id = ? AND coach = ? AND state IN ('booked', 'attended') AND deleted_at IS NULL LIMIT 200`,
        tenantId, coach,
      );
      return !clashes.some((c) => {
        /* ⚠️ Its own row is not a clash with itself, which is what an edit is. */
        if (c.id === id) return false;
        const theirs = Date.parse(c.starts_at);
        if (!Number.isFinite(theirs)) return false;
        /* ⚠️ Touching is not overlapping: an hour ending at ten leaves ten free. */
        return from < theirs + c.minutes * 60_000 && theirs < to;
      });
    },
  },
});

/* -------------------------------------------------------------- articles --- */

/**
 * Something the studio wrote for the people it coaches.
 *
 * ⚠️ PUBLISHED IS A DECISION, NOT A FIELD SOMEBODY MIGHT TICK. A draft a client
 * can read is the failure this collection has to make impossible, so the read a
 * client makes is a different operation from the one staff make — `feed`, below
 * — and a client holds no permission that reaches the drafts at all.
 */
export const articles = collection({
  id: "article",
  label: { one: "Article", many: "Articles" },
  scope: { of: "tenant" },
  version: true,
  holding: { kind: "personal", categories: ["content"], subjects: ["member"], purpose: "Something a studio wrote for the people it coaches.", basis: "contract" },
  retention: { days: null, onTenantClose: "purge" },
  onDelete: { on: "archive" },
  activity: true,
  search: ["title"],
  fields: {
    title: field.text({ required: true, min: 1, max: 200 }),
    standfirst: field.text({ max: 400, label: "In one line" }),
    body: field.text({ required: true, multiline: true, max: 40_000 }),
    cover: field.media({ accept: ["image/jpeg", "image/png"], maxBytes: 8_000_000, label: "Cover" }),
    /*
      ⚠️ THE DATE IT WENT OUT, AND NULL MEANS DRAFT. A boolean would lose WHEN,
      which is the first thing anybody asks about something a studio published.
    */
    publishedOn: field.plainDate({ label: "Published" }),
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
  releases: tableNameFor(releases),
  fasts: tableNameFor(fasts),
  photos: tableNameFor(photos),
  scans: tableNameFor(scans),
  choices: tableNameFor(mealChoices),
  movements: tableNameFor(movements),
  programmes: tableNameFor(programmes),
  workouts: tableNameFor(workouts),
  sets: tableNameFor(sets),
  foods: tableNameFor(foods),
  portions: tableNameFor(portions),
  entries: tableNameFor(entries),
  checkins: tableNameFor(checkins),
  goals: tableNameFor(goals),
  articles: tableNameFor(articles),
  alternatives: tableNameFor(alternatives),
  swaps: tableNameFor(swaps),
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
      `SELECT client_id, MAX(day) AS last FROM ${T.workouts} WHERE tenant_id = ? AND deleted_at IS NULL GROUP BY client_id LIMIT 2000`,
      ctx.tenantId,
    );
    const waiting = await ctx.bind.db.all<{ client_id: string; oldest: string }>(
      `SELECT client_id, MIN(until) AS oldest FROM ${T.checkins}
       WHERE tenant_id = ? AND deleted_at IS NULL AND docstatus = 1 AND (answer IS NULL OR answer = '')
       GROUP BY client_id LIMIT 2000`,
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
       WHERE tenant_id = ? AND deleted_at IS NULL AND due_on IS NOT NULL AND due_on < ? LIMIT 2000`,
      ctx.tenantId, today,
    );
    const latest = due.length === 0 ? [] : await ctx.bind.db.all<{ client_id: string; kind: string; value: number }>(
      `SELECT e.client_id AS client_id, e.kind AS kind, e.value AS value FROM ${T.entries} e
       JOIN (SELECT client_id, kind, MAX(day) AS day FROM ${T.entries}
             WHERE tenant_id = ? AND deleted_at IS NULL GROUP BY client_id, kind) newest
         ON newest.client_id = e.client_id AND newest.kind = e.kind AND newest.day = e.day
       WHERE e.tenant_id = ? AND e.deleted_at IS NULL LIMIT 2000`,
      ctx.tenantId, ctx.tenantId,
    );

    /*
      ⚠️ ACCESS RUNNING OUT IS THE ONE REASON A COACH CAN ACT ON BEFORE IT
      HAPPENS, which is why it is on this list at all — every other reason here
      is already true of somebody.
    */
    const runway = await runwayAcross(ctx.bind.db, ctx.tenantId, ctx.now());

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
          endingIn: soonestScope(runway.get(p.id)?.byScope ?? {}),
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
  { window: unknown; body: unknown; training: unknown; nutrition: unknown; included?: unknown },
  "platform.not_found"
>({
  id: "client.report",
  kind: "read",
  summary: "One client's whole picture over a window: body, training and nutrition.",
  input: s.object({ clientId: s.text({ max: 40 }), days: s.optional(s.number({ integer: true, min: 1, max: 365 })) }),
  /* ⚠️ `included` is merged in by the platform — see `Ctx.included`. */
  output: s.object({ window: s.json(), body: s.json(), training: s.json(), nutrition: s.json(), included: s.json() }),
  /*
    ⚠️ ITS OWN PERMISSION, BECAUSE TWO PEOPLE READ THIS AND ONE OF THEM IS THE
    SUBJECT. `client:read` is a staff key — it also opens the roster, so giving
    it to a client to let them see their own report would show them everybody
    else's name. One report, both personas, and the ROW SCOPE below is what makes
    that safe rather than a second endpoint that drifts.
  */
  permission: "report:read",
  /*
    ⚠️ A CLIENT MAY ASK ABOUT THEMSELVES AND NOBODY ELSE. Staff have no subject,
    so their reach is decided by their permissions; a caller who IS a subject is
    narrowed to their own by the platform, before the handler runs.
  */
  scope: (i: { clientId: string }) => ({ subject: i.clientId }),
  /*
    ⚠️ SHAPED RATHER THAN GATED, and the three lenses are why. Refusing the whole
    report would take the goals and the check-in history down with the sold
    lenses; returning everything gives away what nobody paid for. `included`
    travels with the answer so a screen can say "not in your package" rather than
    drawing an empty chart.
  */
  shape: { body: "progress", training: "progress", nutrition: "progress" },
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
       WHERE e.tenant_id = ? AND e.client_id = ? AND e.deleted_at IS NULL LIMIT 100`,
      ctx.tenantId, input.clientId, ctx.tenantId, input.clientId,
    );
    const latest = new Map(readings.map((r) => [r.kind, r]));

    const goalRows = await ctx.bind.db.all<{ id: string; kind: string; start: number; target: number; due_on: string | null; why: string | null }>(
      `SELECT id, kind, start, target, due_on, why FROM ${T.goals}
       WHERE tenant_id = ? AND client_id = ? AND deleted_at IS NULL LIMIT 100`,
      ctx.tenantId, input.clientId,
    );

    /* ---------------------------------------------------------- training --- */

    const done = await ctx.bind.db.all<{ id: string; day: string }>(
      `SELECT id, day FROM ${T.workouts}
       WHERE tenant_id = ? AND client_id = ? AND deleted_at IS NULL AND docstatus = 1 AND day >= ? AND day <= ? LIMIT 400`,
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
       WHERE s.tenant_id = ? AND s.client_id = ? LIMIT 5000`,
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
       WHERE p.tenant_id = ? AND p.client_id = ? AND p.day >= ? AND p.day <= ? LIMIT 2000`,
      ctx.tenantId, input.clientId, since, until,
    );
    const perDay = new Map<string, Macros[]>();
    for (const row of eaten) {
      const of = portionOf({ per: row.per, protein: row.protein, carbs: row.carbs, fat: row.fat, fibre: row.fibre ?? 0 }, row.amount);
      perDay.set(row.day, [...(perDay.get(row.day) ?? []), of]);
    }
    const days = [...perDay.values()].map((portions) => totalOf(portions));
    const average = overDays(days);

    /*
      ⚠️ WITHHELD MEANS ABSENT, NOT EMPTY, and `included` beside it is what makes
      the two distinguishable. A lens returned as `{}` reads as "nothing
      recorded", which is a lie about somebody's month rather than a statement
      about their package.
    */
    const withheld = (lens: "body" | "training" | "nutrition") => ctx.included[lens] === false;

    return {
      window: { since, until, days: span, client: { id: who!.id, name: who!.name } },
      body: withheld("body") ? null : {
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
      training: withheld("training") ? null : {
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
      nutrition: withheld("nutrition") ? null : {
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
  "inbox:read", "file:read", "file:write", "guide:read", "milestone:read", "commerce:read", "report:read",
  "ai:use", "booking:read", "booking:write", "article:read", "article:write", "article:feed",
  "supplement:read", "supplement:write", "dose:read", "dose:write", "lab:read", "lab:write",
  "assignment:read", "assignment:write",
  "alternative:read", "alternative:write", "swap:read", "swap:write",
  /*
    ⚠️ STAFF HOLD BOTH HALVES OF ALL FOUR. A fast, a photograph, a meal choice
    and a scan are records the CLIENT produces — but a coach who could not
    correct a mistyped one would be sending people back into their own history
    to fix a number the coach spotted.
  */
  "fast:read", "fast:write", "photo:read", "photo:write",
  "choice:read", "choice:write", "scan:read", "scan:write",
  /* ⚠️ A coach ASKS to be released and the owner decides — `member:manage` on
     the two answering fields is what makes that true rather than a convention. */
  "release:read", "release:write",
];

/* ------------------------------------------------------------ publishing --- */

/**
 * ⚠️ PUBLISHING IS A DECISION, AND THE DATE IS THE RECORD OF IT. Writing
 * `publishedOn` through the derived update would work and would be wrong in one
 * way that matters: it lets somebody publish a piece dated last year, which is
 * a claim about when a studio said something.
 */
export const publishArticle = operation<
  Bindings,
  { articleId: string },
  { publishedOn: string },
  "platform.not_found" | "platform.invalid"
>({
  id: "article.publish",
  kind: "write",
  summary: "Put an article in front of the people this studio coaches.",
  input: s.object({ articleId: s.text({ max: 40 }) }),
  output: s.object({ publishedOn: s.text() }),
  permission: "article:write",
  idempotency: { mode: "natural", key: "articleId" },
  audit: (i: { articleId: string }) => ({ subject: i.articleId, verb: "publish" }),
  outcome: { message: "Published", tone: "success", invalidates: ["article"] },
  fails: ["platform.not_found", "platform.invalid"],
  async handler(ctx, input: { articleId: string }) {
    const row = await ctx.bind.db.first<{ id: string; body: string; published_on: string | null }>(
      `SELECT id, body, published_on FROM ${T.articles} WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      input.articleId, ctx.tenantId,
    );
    if (!row) ctx.fail("platform.not_found", { field: "articleId" });
    /*
      ⚠️ AN EMPTY PIECE IS NOT PUBLISHABLE. It reaches every client the studio
      has, and "we sent them a blank page" is not a mistake worth allowing for
      the sake of an unconstrained write.
    */
    if (row!.body.trim().length === 0) ctx.fail("platform.invalid", { field: "body", reason: "empty" });

    /* ⚠️ Today, from the server's clock — not a date somebody may choose. */
    const publishedOn = ctx.now().slice(0, 10);
    await ctx.bind.db.run(
      `UPDATE ${T.articles} SET published_on = ?, updated_at = ? WHERE id = ?`,
      publishedOn, ctx.now(), row!.id,
    );
    return { publishedOn };
  },
});

/**
 * What a client can read.
 *
 * ⚠️ A SEPARATE OPERATION, NOT A FILTER ON THE STAFF LIST. A client holding the
 * collection's own read permission would reach every draft in the studio through
 * `article.list` — and the version of this that adds `WHERE published_on IS NOT
 * NULL` to a shared list is one parameter away from not adding it.
 */
export const feed = operation<
  Bindings,
  { limit?: number },
  { articles: unknown },
  never
>({
  id: "article.feed",
  kind: "read",
  summary: "What this studio has published, most recent first.",
  input: s.object({ limit: s.optional(s.number({ integer: true, min: 1, max: 100 })) }),
  output: s.object({ articles: s.json() }),
  permission: "article:feed",
  idempotency: { mode: "none" },
  async handler(ctx, input: { limit?: number }) {
    const rows = await ctx.bind.db.all(
      `SELECT id, title, standfirst, body, cover, published_on FROM ${T.articles}
       WHERE tenant_id = ? AND published_on IS NOT NULL AND deleted_at IS NULL
       ORDER BY published_on DESC, created_at DESC LIMIT ?`,
      ctx.tenantId, Math.min(input.limit ?? 20, 100),
    );
    return { articles: rows };
  },
});

/* ------------------------------------------------------------- movements --- */

/**
 * Where a movement is used, before anybody changes or removes it.
 *
 * ⚠️ THE QUESTION IS ASKED BEFORE A DESTRUCTIVE ACT, which is what makes it
 * worth a surface. A movement renamed under a live plan changes what a client
 * reads tomorrow; one deleted takes every set logged against it with it, and the
 * derived delete cannot say so because a count is a query the collection layer
 * has no reason to run.
 */
export const usage = operation<
  Bindings,
  { movementId: string },
  { sets: number; programmes: number; alternatives: number; swaps: number },
  never
>({
  id: "movement.usage",
  kind: "read",
  summary: "How much of the studio depends on this movement.",
  input: s.object({ movementId: s.text({ max: 40 }) }),
  output: s.object({
    sets: s.number({ integer: true }), programmes: s.number({ integer: true }),
    alternatives: s.number({ integer: true }), swaps: s.number({ integer: true }),
  }),
  permission: "movement:read",
  idempotency: { mode: "none" },
  async handler(ctx, input: { movementId: string }) {
    const count = async (sql: string, ...binds: unknown[]) =>
      (await ctx.bind.db.first<{ n: number }>(sql, ...binds))?.n ?? 0;

    /*
      ⚠️ A PROGRAMME'S BODY IS JSON, so this is a text match rather than a join —
      which is the price of the decision that weeks are read and written whole,
      stated where it is paid. It over-counts a movement whose id appears in a
      note, and over-counting is the safe direction for a question asked before
      deleting something.
    */
    return {
      sets: await count(`SELECT COUNT(*) AS n FROM ${T.sets} WHERE tenant_id = ? AND movement = ?`, ctx.tenantId, input.movementId),
      programmes: await count(
        `SELECT COUNT(*) AS n FROM ${T.programmes} WHERE tenant_id = ? AND deleted_at IS NULL AND weeks LIKE ?`,
        ctx.tenantId, `%${input.movementId}%`,
      ),
      alternatives: await count(
        `SELECT COUNT(*) AS n FROM ${T.alternatives} WHERE tenant_id = ? AND (movement = ? OR substitute = ?)`,
        ctx.tenantId, input.movementId, input.movementId,
      ),
      swaps: await count(`SELECT COUNT(*) AS n FROM ${T.swaps} WHERE tenant_id = ? AND movement = ?`, ctx.tenantId, input.movementId),
    };
  },
});

/* ------------------------------------------------------------ copying --- */

/**
 * Repeat a week, with progression.
 *
 * ⚠️ THE ARITHMETIC IS PURE AND LIVES IN `plans.ts`; this is the read, the
 * append and the version bump. A coach writing a four-week block writes week one
 * and then the same movements three more times with different numbers — and
 * every one of those is a chance to change a movement in one week and not the
 * next.
 */
export const copyWeek = operation<
  Bindings,
  { programmeId: string; week: number; loadPercent?: number; repsAdded?: number },
  { weeks: number },
  "platform.not_found" | "platform.invalid"
>({
  id: "programme.copy-week",
  kind: "write",
  summary: "Add a copy of one week to the end, with the progression you asked for.",
  input: s.object({
    programmeId: s.text({ max: 40 }),
    week: s.number({ integer: true, min: 1, max: 52 }),
    loadPercent: s.optional(s.number({ min: -50, max: 50 })),
    repsAdded: s.optional(s.number({ integer: true, min: -20, max: 20 })),
  }),
  output: s.object({ weeks: s.number({ integer: true }) }),
  permission: "programme:write",
  entitlement: "training",
  idempotency: { mode: "none" },
  audit: (i: { programmeId: string }) => ({ subject: i.programmeId, verb: "copy-week" }),
  outcome: { message: "Week added", tone: "success", invalidates: ["programme"] },
  fails: ["platform.not_found", "platform.invalid"],
  async handler(ctx, input: { programmeId: string; week: number; loadPercent?: number; repsAdded?: number }) {
    const row = await ctx.bind.db.first<{ id: string; weeks: string; version: number }>(
      `SELECT id, weeks, version FROM ${T.programmes} WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      input.programmeId, ctx.tenantId,
    );
    if (!row) ctx.fail("platform.not_found", { field: "programmeId" });

    /*
      ⚠️ AN UNREADABLE BODY IS REFUSED RATHER THAN REPLACED. A JSON column that
      will not parse is a plan somebody wrote; overwriting it with a fresh array
      would lose it in the course of a convenience.
    */
    let weeks: Week[];
    try {
      const parsed = JSON.parse(row!.weeks) as unknown;
      if (!Array.isArray(parsed)) throw new Error("not a list");
      weeks = parsed as Week[];
    } catch {
      ctx.fail("platform.invalid", { field: "weeks", reason: "this plan's weeks cannot be read" });
      throw new Error("unreachable");
    }

    const source = weekAt(weeks, input.week);
    if (!source) ctx.fail("platform.invalid", { field: "week", reason: "there is no such week" });

    const next = [...weeks, progressWeek(source!, {
      ...(input.loadPercent === undefined ? {} : { loadPercent: input.loadPercent }),
      ...(input.repsAdded === undefined ? {} : { repsAdded: input.repsAdded }),
    })];
    await ctx.bind.db.run(
      `UPDATE ${T.programmes} SET weeks = ?, version = version + 1, updated_at = ? WHERE id = ?`,
      JSON.stringify(next), ctx.now(), row!.id,
    );
    return { weeks: next.length };
  },
});

/* ----------------------------------------------------------- deciding --- */

/**
 * Answer a swap request.
 *
 * ⚠️ THE ANSWER IS THE COACH'S, AND THAT IS WHY IT IS NOT THE DERIVED UPDATE. A
 * client holds `swap:write` so they can ask; the same permission on the derived
 * update would let them mark their own request allowed, which is the whole
 * question answering itself.
 */
export const decideSwap = operation<
  Bindings,
  { swapId: string; allow: boolean; substitute?: string; answer?: string },
  { state: string },
  "platform.not_found" | "platform.invalid"
>({
  id: "swap.decide",
  kind: "write",
  summary: "Allow or refuse a swap, with what to do instead.",
  input: s.object({
    swapId: s.text({ max: 40 }),
    allow: s.bool(),
    substitute: s.optional(s.text({ max: 40 })),
    answer: s.optional(s.text({ max: 500 })),
  }),
  output: s.object({ state: s.text() }),
  /* ⚠️ Prescribing is a coach's act, so it carries the prescribing permission. */
  permission: "programme:write",
  idempotency: { mode: "natural", key: "swapId" },
  audit: (i: { swapId: string }) => ({ subject: i.swapId, verb: "decide" }),
  outcome: { message: "Answered", tone: "success", invalidates: ["swap"] },
  fails: ["platform.not_found", "platform.invalid"],
  async handler(ctx, input: { swapId: string; allow: boolean; substitute?: string; answer?: string }) {
    const row = await ctx.bind.db.first<{ id: string; state: string }>(
      `SELECT id, state FROM ${T.swaps} WHERE id = ? AND tenant_id = ?`, input.swapId, ctx.tenantId,
    );
    if (!row) ctx.fail("platform.not_found", { field: "swapId" });

    /*
      ⚠️ ALLOWING ONE WITHOUT SAYING WHAT INSTEAD IS NOT AN ANSWER. The client
      asked what to do; "yes" on its own leaves them standing in a gym having
      been told they may do something unspecified.
    */
    if (input.allow && !input.substitute) ctx.fail("platform.invalid", { field: "substitute", reason: "say what to do instead" });

    const state = input.allow ? "allowed" : "refused";
    await ctx.bind.db.run(
      `UPDATE ${T.swaps} SET state = ?, substitute = ?, answer = ?, version = version + 1, updated_at = ? WHERE id = ?`,
      state, input.substitute ?? null, input.answer ?? "", ctx.now(), row!.id,
    );
    return { state };
  },
});

/* ----------------------------------------------------------- forgetting --- */

/**
 * Remove somebody entirely, on request, and have that be final.
 *
 * ⚠️ DELETING A CLIENT ARCHIVES THE RECORD, AND THAT IS RIGHT FOR ALMOST EVERY
 * CASE — a studio tidying its roster has not been asked to destroy anything. This
 * is the other case, and it is the one somebody has a right to: everything that
 * hangs off a person, gone, in one act they can be told completed.
 *
 * ⚠️ THE PLAN IS DERIVED, never listed here. A hand-written list for one subject
 * is worse than one for a workspace: nobody notices a table that was missed for
 * ONE person, because the studio keeps working and every screen is correct while
 * a record somebody asked to be rid of is still answering queries.
 */
export const forgetClient = operation<
  Bindings,
  { clientId: string; confirm: string },
  { tables: unknown; absent: unknown; trail: number },
  "platform.not_found" | "platform.invalid"
>({
  id: "client.forget",
  kind: "write",
  summary: "Erase everything about one person, permanently.",
  input: s.object({ clientId: s.text({ max: 40 }), confirm: s.text({ max: 200 }) }),
  output: s.object({ tables: s.json(), absent: s.json(), trail: s.number({ integer: true }) }),
  /* ⚠️ The owner's, not a coach's. It is the one act in the product with no undo. */
  permission: "workspace:close",
  idempotency: { mode: "none" },
  audit: (i: { clientId: string }) => ({ subject: i.clientId, verb: "forget" }),
  outcome: { message: "Forgotten", tone: "warning", invalidates: ["client"] },
  fails: ["platform.not_found", "platform.invalid"],
  tool: false,
  async handler(ctx, input: { clientId: string; confirm: string }) {
    const row = await ctx.bind.db.first<{ id: string; name: string }>(
      `SELECT id, name FROM ${T.clients} WHERE id = ? AND tenant_id = ?`, input.clientId, ctx.tenantId,
    );
    if (!row) ctx.fail("platform.not_found", { field: "clientId" });

    /*
      ⚠️ THE CONFIRMATION IS THEIR NAME, TYPED. A yes/no dialog in front of
      something irreversible is a reflex rather than a decision, and this is the
      one act in the product that cannot be undone.
    */
    if (input.confirm !== row!.name) ctx.fail("platform.invalid", { field: "confirm", reason: "type their name to confirm" });

    const out = await forgetSubject(ctx, ctx.tenantId, row!.id);
    /* ⚠️ And the record itself, last: the cascade clears what hangs off them. */
    await ctx.bind.db.run(`DELETE FROM ${T.clients} WHERE id = ? AND tenant_id = ?`, row!.id, ctx.tenantId);
    return out;
  },
});


/* ---------------------------------------------------------------- living --- */

/**
 * The fast in progress, and where it has got to.
 *
 * ⚠️ COMPUTED FROM THE CLOCK, NEVER STORED. "How long have I been fasting" is a
 * function of now; a stored duration is a number that was right once and is
 * wrong from the next second — and the screen showing it is the one people leave
 * open.
 */
export const fastNow = operation<
  Bindings,
  { clientId?: string },
  { fast: unknown; zone: unknown; hours: unknown; zones: unknown },
  never
>({
  id: "fast.now",
  kind: "read",
  summary: "The fast you are in, and how long it has been.",
  input: s.object({ clientId: s.optional(s.text({ max: 40 })) }),
  output: s.object({ fast: s.json(), zone: s.json(), hours: s.json(), zones: s.json() }),
  permission: "fast:read",
  customerFlag: "nutrition",
  idempotency: { mode: "none" },
  async handler(ctx, input: { clientId?: string }) {
    /*
      ⚠️ THE CALLER'S OWN SUBJECT WINS. A client asking about somebody else is
      asking about a person they may not see, and the narrowing follows from who
      is asking rather than from a second check somebody has to remember.
    */
    const who = ctx.subjectId ?? input.clientId ?? "";
    const row = await ctx.bind.db.first<{ id: string; started_at: string; ended_at: string | null }>(
      `SELECT id, started_at, ended_at FROM ${T.fasts} WHERE tenant_id = ? AND client_id = ? AND ended_at IS NULL
       ORDER BY started_at DESC LIMIT 1`,
      ctx.tenantId, who,
    );
    if (!row) return { fast: null, zone: null, hours: null, zones: FASTING_ZONES };
    const at = zoneAt(row.started_at, ctx.now());
    return {
      fast: { id: row.id, startedAt: row.started_at },
      zone: at?.zone ?? null,
      hours: at?.hours ?? null,
      /* ⚠️ The whole ladder travels, so a screen can show what is ahead without
         a second call and without a copy of the zones of its own. */
      zones: FASTING_ZONES,
    };
  },
});

/**
 * One honest number for how a week went.
 *
 * ⚠️ IT SAYS WHAT IT WAS COMPUTED FROM, and that is not decoration. A score of 82
 * from two inputs looks exactly like one from five, and the first is somebody
 * being told they are doing well because they slept.
 */
export const wellness = operation<
  Bindings,
  { clientId?: string; days?: number },
  { score: unknown; from: unknown; coverage: number },
  never
>({
  id: "client.wellness",
  kind: "read",
  summary: "How the week has gone, in one number, with what it is based on.",
  input: s.object({ clientId: s.optional(s.text({ max: 40 })), days: s.optional(s.number({ integer: true, min: 7, max: 30 })) }),
  output: s.object({ score: s.json(), from: s.json(), coverage: s.number() }),
  permission: "checkin:read",
  idempotency: { mode: "none" },
  async handler(ctx, input: { clientId?: string; days?: number }) {
    const who = ctx.subjectId ?? input.clientId ?? "";
    const days = input.days ?? 7;
    const since = new Date(Date.parse(ctx.now()) - days * 86_400_000).toISOString().slice(0, 10);

    /*
      ⚠️ READ FROM `entry`, WHICH IS WHERE THESE NUMBERS LIVE. A check-in carries
      prose and no figures on purpose — one fact, one home — so a score computed
      from a copy on the report would be scoring a second version nobody can
      correct, and correcting the original would leave the score unchanged.
    */
    const logged = await ctx.bind.db.all<{ kind: string; value: number }>(
      `SELECT kind, value FROM ${T.entries} WHERE tenant_id = ? AND client_id = ? AND day >= ? AND deleted_at IS NULL
       AND kind IN ('sleep', 'mood', 'energy') LIMIT 500`,
      ctx.tenantId, who, since,
    );
    const column = (kind: string) => logged.filter((r) => r.kind === kind).map((r) => r.value);

    const done = (await ctx.bind.db.first<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ${T.workouts} WHERE tenant_id = ? AND client_id = ? AND day >= ? AND deleted_at IS NULL`,
      ctx.tenantId, who, since,
    ))?.n ?? 0;
    const loggedDays = (await ctx.bind.db.first<{ n: number }>(
      `SELECT COUNT(DISTINCT day) AS n FROM ${T.entries} WHERE tenant_id = ? AND client_id = ? AND day >= ? AND deleted_at IS NULL`,
      ctx.tenantId, who, since,
    ))?.n ?? 0;

    const plan = await ctx.bind.db.first<{ weeks: string }>(
      `SELECT weeks FROM ${T.programmes} WHERE tenant_id = ? AND client = ? AND kind = 'training' AND active = 1 AND deleted_at IS NULL LIMIT 1`,
      ctx.tenantId, who,
    );
    const perWeek = plan ? prescribedPerWeek(safeJson(plan.weeks)) : null;
    const expected = expectedOver(perWeek, days);

    return wellnessOf({
      sleep: column("sleep"),
      mood: column("mood"),
      energy: column("energy"),
      /* ⚠️ Only where something was actually prescribed. Nothing asked for is a
         question nobody put, not a week of zero training. */
      ...(expected > 0 ? { sessions: { done, expected } } : {}),
      loggedDays,
    });
  },
});

/** ⚠️ An unreadable plan body is no plan, not a throw on a screen somebody opened. */
const safeJson = (text: string): unknown => {
  try { return JSON.parse(text); } catch { return null; }
};

/**
 * What today asks of somebody, in one place.
 *
 * ⚠️ ONE CALL, BECAUSE THE ALTERNATIVE IS FIVE AND A SPINNER. The first screen a
 * client opens is the one that decides whether the product feels like a tool or
 * a chore, and five round trips on a phone in a gym is the chore.
 */
export const today = operation<
  Bindings,
  { day: string; clientId?: string },
  { day: string; plan: unknown; workout: unknown; meals: unknown; checkIn: unknown; fasting: unknown },
  never
>({
  id: "client.today",
  kind: "read",
  summary: "What today asks of you: the session, the meals, anything outstanding.",
  input: s.object({ day: s.plainDate(), clientId: s.optional(s.text({ max: 40 })) }),
  output: s.object({ day: s.text(), plan: s.json(), workout: s.json(), meals: s.json(), checkIn: s.json(), fasting: s.json() }),
  permission: "workout:read",
  idempotency: { mode: "none" },
  async handler(ctx, input: { day: string; clientId?: string }) {
    const who = ctx.subjectId ?? input.clientId ?? "";
    const db = ctx.bind.db;

    const training = await db.first<{ id: string; title: string; weeks: string }>(
      `SELECT id, title, weeks FROM ${T.programmes} WHERE tenant_id = ? AND client = ? AND kind = 'training' AND active = 1 AND deleted_at IS NULL LIMIT 1`,
      ctx.tenantId, who,
    );
    const eating = await db.first<{ id: string; title: string; weeks: string }>(
      `SELECT id, title, weeks FROM ${T.programmes} WHERE tenant_id = ? AND client = ? AND kind = 'eating' AND active = 1 AND deleted_at IS NULL LIMIT 1`,
      ctx.tenantId, who,
    );
    const workout = await db.first<{ id: string; docstatus: number }>(
      `SELECT id, docstatus FROM ${T.workouts} WHERE tenant_id = ? AND client_id = ? AND day = ? AND deleted_at IS NULL LIMIT 1`,
      ctx.tenantId, who, input.day,
    );
    /*
      ⚠️ AN OUTSTANDING CHECK-IN IS ONE WITH NO ANSWER, not one nobody wrote. The
      thing a client needs to see is that their coach has not replied yet; the
      thing a coach needs is the opposite, and that is `coach.attention`.
    */
    const checkIn = await db.first<{ id: string; until: string }>(
      `SELECT id, until FROM ${T.checkins} WHERE tenant_id = ? AND client_id = ? AND (answer IS NULL OR answer = '') AND deleted_at IS NULL
       ORDER BY until DESC LIMIT 1`,
      ctx.tenantId, who,
    );
    const fast = await db.first<{ id: string; started_at: string }>(
      `SELECT id, started_at FROM ${T.fasts} WHERE tenant_id = ? AND client_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1`,
      ctx.tenantId, who,
    );

    return {
      day: input.day,
      plan: training ? { id: training.id, title: training.title } : null,
      workout: workout ? { id: workout.id, submitted: workout.docstatus === 1 } : null,
      /* ⚠️ The MEALS of the eating plan, not the plan — a client on this screen
         is choosing lunch, not reading a document. */
      meals: eating ? { id: eating.id, title: eating.title, weeks: safeJson(eating.weeks) } : null,
      checkIn: checkIn ? { id: checkIn.id, until: checkIn.until } : null,
      fasting: fast ? { id: fast.id, ...(zoneAt(fast.started_at, ctx.now()) ?? {}) } : null,
    };
  },
});

/**
 * What the app already knows about somebody's week.
 *
 * ⚠️ IT PREFILLS AND NEVER SUBMITS. A check-in answered by the app on somebody's
 * behalf is a coaching record nobody wrote, and the whole value of the thing is
 * that a person read the week back and said something about it.
 */
export const prefill = operation<
  Bindings,
  { since: string; until: string; clientId?: string },
  { workouts: number; loggedDays: number; sets: number; weight: unknown; wellness: unknown },
  never
>({
  id: "checkin.prefill",
  kind: "read",
  summary: "What the app already knows about your week, to save retyping it.",
  input: s.object({ since: s.plainDate(), until: s.plainDate(), clientId: s.optional(s.text({ max: 40 })) }),
  output: s.object({
    workouts: s.number({ integer: true }), loggedDays: s.number({ integer: true }),
    sets: s.number({ integer: true }), weight: s.json(), wellness: s.json(),
  }),
  permission: "checkin:write",
  customerFlag: "checkins",
  idempotency: { mode: "none" },
  async handler(ctx, input: { since: string; until: string; clientId?: string }) {
    const who = ctx.subjectId ?? input.clientId ?? "";
    const db = ctx.bind.db;
    const count = async (sql: string, ...binds: unknown[]) =>
      (await db.first<{ n: number }>(sql, ...binds))?.n ?? 0;

    const workouts = await count(
      `SELECT COUNT(*) AS n FROM ${T.workouts} WHERE tenant_id = ? AND client_id = ? AND day BETWEEN ? AND ? AND deleted_at IS NULL`,
      ctx.tenantId, who, input.since, input.until,
    );
    const loggedDays = await count(
      `SELECT COUNT(DISTINCT day) AS n FROM ${T.entries} WHERE tenant_id = ? AND client_id = ? AND day BETWEEN ? AND ? AND deleted_at IS NULL`,
      ctx.tenantId, who, input.since, input.until,
    );
    const sets = await count(
      `SELECT COUNT(*) AS n FROM ${T.sets} s JOIN ${T.workouts} w ON w.id = s.workout
       WHERE s.tenant_id = ? AND s.client_id = ? AND w.day BETWEEN ? AND ?`,
      ctx.tenantId, who, input.since, input.until,
    );
    /* ⚠️ From `entry`, the one home for a number. See the note on the kind. */
    const weighed = await db.first<{ value: number }>(
      `SELECT value FROM ${T.entries} WHERE tenant_id = ? AND client_id = ? AND kind = 'weight' AND deleted_at IS NULL
       ORDER BY day DESC LIMIT 1`,
      ctx.tenantId, who,
    );

    return {
      workouts, loggedDays, sets,
      /*
        ⚠️ THE LAST WEIGHT IS OFFERED, NOT ASSUMED. It is there so somebody who
        has not changed does not retype it — filling it in as this week's figure
        would put a number they did not measure into their own history.
      */
      weight: weighed?.value ?? null,
      wellness: null,
    };
  },
});

/**
 * Two photographs, side by side.
 *
 * ⚠️ THE SAME POSE OR NOTHING. Two pictures from different angles show a change
 * that is not there, which for a photograph of somebody's own body is the
 * specific way this feature misleads the person it is for.
 */
export const compare = operation<
  Bindings,
  { pose: string; clientId?: string },
  { pose: string; first: unknown; latest: unknown; days: unknown },
  "platform.not_found"
>({
  id: "photo.compare",
  kind: "read",
  summary: "The first and the most recent photograph in one pose.",
  input: s.object({ pose: s.enum(["front", "side", "back"]), clientId: s.optional(s.text({ max: 40 })) }),
  output: s.object({ pose: s.text(), first: s.json(), latest: s.json(), days: s.json() }),
  permission: "photo:read",
  customerFlag: "body",
  idempotency: { mode: "none" },
  async handler(ctx, input: { pose: string; clientId?: string }) {
    const who = ctx.subjectId ?? input.clientId ?? "";
    const rows = await ctx.bind.db.all<{ id: string; day: string; image: string }>(
      `SELECT id, day, image FROM ${T.photos} WHERE tenant_id = ? AND client_id = ? AND pose = ? ORDER BY day ASC LIMIT 200`,
      ctx.tenantId, who, input.pose,
    );
    if (rows.length === 0) return { pose: input.pose, first: null, latest: null, days: null };
    const first = rows[0]!;
    const latest = rows[rows.length - 1]!;
    /*
      ⚠️ ONE PHOTOGRAPH IS NOT A COMPARISON, and saying so is better than showing
      the same picture twice — which reads as "no change" to the one person who
      most wants there to be some.
    */
    if (rows.length === 1) return { pose: input.pose, first: shot(first), latest: null, days: null };
    return {
      pose: input.pose,
      first: shot(first),
      latest: shot(latest),
      days: Math.round((Date.parse(latest.day) - Date.parse(first.day)) / 86_400_000),
    };
  },
});

const shot = (r: { id: string; day: string; image: string }) => ({ id: r.id, day: r.day, image: r.image });

/**
 * A body-composition estimate, read off photographs.
 *
 * ⚠️ IT ANSWERS AND DOES NOT SAVE. The number is a model's reading of a picture
 * of somebody's body — the person decides whether that goes into their own
 * history, and a product that filed it for them would be writing a judgement
 * about them that they never agreed to.
 */
export const bodyScan = operation<
  Bindings,
  { front: string; side?: string; note?: string },
  { generation: string; read: unknown; charged: number },
  "platform.invalid" | "platform.quota_reached" | "platform.too_many" | "platform.unavailable"
>({
  id: "ai.body-scan",
  kind: "write",
  summary: "Estimate body composition from photographs, to check rather than to keep.",
  input: s.object({ front: s.text({ max: 40 }), side: s.optional(s.text({ max: 40 })), note: s.optional(s.text({ max: 300 })) }),
  output: s.object({ generation: s.text(), read: s.json(), charged: s.number({ integer: true }) }),
  permission: "scan:write",
  customerFlag: "body",
  /* ⚠️ A reading of a photograph costs credits and produces numbers on a screen the person is already looking at — but the charge is not visible, and a scan that answered in silence is one somebody runs again. */
  outcome: { message: "Read", tone: "success", invalidates: ["ai.spending", "scan"] },
  idempotency: { mode: "none" },
  audit: () => ({ subject: "scan", verb: "estimate" }),
  fails: ["platform.invalid", "platform.quota_reached", "platform.too_many", "platform.unavailable"],
  tool: false,
  async handler(ctx, input: { front: string; side?: string; note?: string }) {
    const out = await generateAbout(ctx, KOVA_AI, "body-scan", input.note ?? "", input.front);
    if (!out.ok) {
      const problem = refusalProblem(out);
      ctx.fail(problem.code, problem.meta);
    }
    const done = out as Extract<typeof out, { ok: true }>;
    return { generation: done.id, read: done.output, charged: done.charged };
  },
});


/* ------------------------------------------------------- self-registration --- */

/**
 * Somebody adding themselves to a studio that allows it.
 *
 * ⚠️ ALLOWED PER STUDIO, DEFAULT OFF, and the default is the whole safety of it.
 * An open registration on every workspace means anybody who guesses a slug
 * becomes a client of that studio — which consumes a seat on its plan, appears
 * on its roster, and is a stranger in a list of people it coaches.
 *
 * ⚠️ AND IT CREATES A CLIENT RECORD RATHER THAN A MEMBERSHIP WITH POWERS. What
 * arrives is somebody waiting to be picked up by a coach; the studio decides
 * what happens next.
 */
export const selfRegister = operation<
  Bindings,
  { name: string; email: string },
  { ok: boolean },
  "platform.invalid" | "platform.forbidden" | "platform.quota_reached"
>({
  id: "client.register",
  kind: "write",
  summary: "Add yourself to a studio that takes new clients.",
  input: s.object({ name: s.text({ min: 1, max: 120 }), email: s.text({ max: 200 }) }),
  output: s.object({ ok: s.bool() }),
  /*
    ⚠️ PUBLIC, BECAUSE THE PERSON DOES NOT HAVE AN ACCOUNT YET. That is exactly
    why the studio's own switch has to be checked in the handler: the door is
    open by design and the decision is the studio's.
  */
  permission: "public",
  idempotency: { mode: "natural", key: "email" },
  audit: (i: { email: string }) => ({ subject: i.email, verb: "register" }),
  outcome: { message: "Sent", tone: "success" },
  fails: ["platform.invalid", "platform.forbidden", "platform.quota_reached"],
  /* ⚠️ Not a tool: it writes a person into a studio's roster. */
  tool: false,
  async handler(ctx, input: { name: string; email: string }) {
    const settings = await readSettings(ctx.bind.db, KOVA_SETTINGS, ctx.tenantId);
    if (settings["studio.selfRegister"] !== true) {
      ctx.fail("platform.forbidden", { reason: "this studio adds clients itself" });
    }
    const email = input.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) ctx.fail("platform.invalid", { field: "email" });

    /*
      ⚠️ THE SEAT CEILING IS CHECKED HERE AND NOT BY THE GATE, because the gate
      counts against the CALLER's entitlements and this caller has none — they
      are not a member of anything yet. Without it an open studio is one anybody
      can push past its own plan.
    */
    const held = await ctx.bind.db.first<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ${T.clients} WHERE tenant_id = ? AND deleted_at IS NULL`, ctx.tenantId,
    );
    const allowed = Number(settings["studio.selfRegisterCeiling"] ?? 0);
    if (allowed > 0 && (held?.n ?? 0) >= allowed) {
      ctx.fail("platform.quota_reached", { limit: String(allowed), used: String(held?.n ?? 0) });
    }

    /*
      ⚠️ THE SAME ANSWER WHETHER OR NOT THEY ARE ALREADY ON THE ROSTER. Telling
      them apart turns this into a membership oracle: type an address, learn
      whether that person is coached here — which for a health product is a
      disclosure on its own.
    */
    const already = await ctx.bind.db.first<{ id: string }>(
      `SELECT id FROM ${T.clients} WHERE tenant_id = ? AND email = ?`, ctx.tenantId, email,
    );
    if (already) return { ok: true };

    const id = `cli_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const at = ctx.now();
    await ctx.bind.db.run(
      `INSERT INTO ${T.clients} (id, tenant_id, version, created_at, updated_at, name, email) VALUES (?, ?, 1, ?, ?, ?, ?)`,
      id, ctx.tenantId, at, at, input.name, email,
    );
    return { ok: true };
  },
});

/* ------------------------------------------------------- how the studio is --- */

/**
 * The studio as a business rather than as a list of people.
 *
 * ⚠️ COUNTS AND MOVEMENT, NOT A DASHBOARD OF EVERYTHING. The three questions an
 * owner actually asks are how many people they coach, how many are active, and
 * whether that is going up — and a screen answering thirty questions answers
 * none of them, because nobody reads it twice.
 */
export const rosterAnalytics = operation<
  Bindings,
  { days?: number },
  { clients: number; active: number; joined: number; left: number; sessions: number; lapsing: number },
  never
>({
  id: "studio.analytics",
  kind: "read",
  summary: "How the studio is doing: who is on the roster, who is active, and which way it is going.",
  input: s.object({ days: s.optional(s.number({ integer: true, min: 7, max: 365 })) }),
  output: s.object({
    clients: s.number({ integer: true }), active: s.number({ integer: true }),
    joined: s.number({ integer: true }), left: s.number({ integer: true }),
    sessions: s.number({ integer: true }), lapsing: s.number({ integer: true }),
  }),
  /* ⚠️ The owner's. A coach's view of the studio is their own clients, which is
     `coach.attention` — this is the business, and the business is not theirs. */
  permission: "commerce:manage",
  idempotency: { mode: "none" },
  async handler(ctx, input: { days?: number }) {
    const days = input.days ?? 30;
    const since = new Date(Date.parse(ctx.now()) - days * 86_400_000).toISOString();
    const sinceDay = since.slice(0, 10);
    const db = ctx.bind.db;
    const count = async (sql: string, ...binds: unknown[]) =>
      (await db.first<{ n: number }>(sql, ...binds))?.n ?? 0;

    return {
      clients: await count(`SELECT COUNT(*) AS n FROM ${T.clients} WHERE tenant_id = ? AND deleted_at IS NULL`, ctx.tenantId),
      /*
        ⚠️ ACTIVE MEANS THEY DID SOMETHING, not that their record exists. A roster
        count on its own is the number that flatters — it only ever goes up, and
        it goes up fastest when nobody is being coached.
      */
      active: await count(
        `SELECT COUNT(DISTINCT client_id) AS n FROM ${T.workouts} WHERE tenant_id = ? AND day >= ? AND deleted_at IS NULL`,
        ctx.tenantId, sinceDay,
      ),
      joined: await count(
        `SELECT COUNT(*) AS n FROM ${T.clients} WHERE tenant_id = ? AND created_at >= ? AND deleted_at IS NULL`,
        ctx.tenantId, since,
      ),
      /* ⚠️ Left is archived-in-the-window, which is the only leaving this
         product records. A purge leaves nothing to count, correctly. */
      left: await count(
        `SELECT COUNT(*) AS n FROM ${T.clients} WHERE tenant_id = ? AND deleted_at >= ?`,
        ctx.tenantId, since,
      ),
      sessions: await count(
        `SELECT COUNT(*) AS n FROM ${T.workouts} WHERE tenant_id = ? AND day >= ? AND deleted_at IS NULL`,
        ctx.tenantId, sinceDay,
      ),
      /* ⚠️ Whose access runs out inside the window — the number that turns into
         next month's roster count, and the only one here that is a warning. */
      lapsing: (await lapsedAcross(db, ctx.tenantId, ctx.now(), 500)).length,
    };
  },
});



/* --------------------------------------------------------------- the gym --- */

/**
 * A session, set by set, on a phone.
 *
 * ⚠️ ONE CALL, BECAUSE THE PLACE THIS IS READ IS A GYM. Somebody between sets
 * has thirty seconds and one hand; five round trips is a screen they stop using.
 *
 * ⚠️ AND WHAT THEY NEED IS WHAT THEY LIFTED LAST TIME. It is the most-asked
 * question in a gym and it is asked per MOVEMENT across every session they have
 * ever done — which is why a set is rows rather than part of a workout's JSON.
 */
export const player = operation<
  Bindings,
  { workoutId: string },
  { day: string; rounds: unknown; done: unknown },
  "platform.not_found"
>({
  id: "workout.player",
  kind: "read",
  summary: "Work through today's session set by set, with what you lifted last time.",
  input: s.object({ workoutId: s.text({ max: 40 }) }),
  output: s.object({ day: s.text(), rounds: s.json(), done: s.json() }),
  permission: "set:write",
  customerFlag: "training",
  idempotency: { mode: "none" },
  fails: ["platform.not_found"],
  async handler(ctx, input: { workoutId: string }) {
    const db = ctx.bind.db;
    const workout = await db.first<{ id: string; day: string; programme: string | null; client_id: string }>(
      `SELECT id, day, programme, client_id FROM ${T.workouts} WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      input.workoutId, ctx.tenantId,
    );
    if (!workout) ctx.fail("platform.not_found", { field: "workoutId" });
    /*
      ⚠️ AND IT IS THEIRS. A subject-scoped read narrows for a customer, but this
      one takes an id — so the row's own subject is checked rather than assumed,
      or a client with any workout id reads somebody else's session.
    */
    if (ctx.subjectId && workout!.client_id !== ctx.subjectId) ctx.fail("platform.not_found", { field: "workoutId" });

    /* What was prescribed, grouped the way it will be logged. */
    let rounds: readonly (readonly unknown[])[] = [];
    if (workout!.programme) {
      const plan = await db.first<{ weeks: string }>(
        `SELECT weeks FROM ${T.programmes} WHERE id = ? AND tenant_id = ?`, workout!.programme, ctx.tenantId,
      );
      const weeks = (safeJson(plan?.weeks ?? "") ?? []) as Week[];
      const day = weeks[0]?.days?.[0];
      if (day) rounds = roundsOf(day);
    }

    /*
      ⚠️ LAST TIME IS THE MOST RECENT SET ON ANOTHER DAY, not the most recent set.
      Without excluding today, the first set somebody logs becomes what they are
      told they did last time — so the number they are working against is the one
      they just did, and it climbs with them all session.
    */
    const movements = rounds.flat().map((i) => (i as { movement: string }).movement).filter(Boolean);
    const last: Record<string, { reps: number | null; load: number | null; day: string }> = {};
    for (const movement of new Set(movements)) {
      const row = await db.first<{ reps: number | null; load: number | null; day: string }>(
        `SELECT s.reps, s.load, w.day FROM ${T.sets} s JOIN ${T.workouts} w ON w.id = s.workout
         WHERE s.tenant_id = ? AND s.client_id = ? AND s.movement = ? AND w.day < ?
         ORDER BY w.day DESC, s.created_at DESC LIMIT 1`,
        ctx.tenantId, workout!.client_id, movement, workout!.day,
      );
      if (row) last[movement] = row;
    }

    return {
      day: workout!.day,
      rounds: rounds.map((round) => round.map((item) => ({
        ...(item as object),
        lastTime: last[(item as { movement: string }).movement] ?? null,
      }))),
      /* ⚠️ What is already logged for THIS workout, so a reload does not lose
         where somebody was. */
      done: await db.all(
        `SELECT id, movement, reps, load, round FROM ${T.sets} WHERE tenant_id = ? AND workout = ? ORDER BY created_at ASC`,
        ctx.tenantId, workout!.id,
      ),
    };
  },
});

/* ----------------------------------------------------------- the shopfront --- */

/**
 * What a studio offers, to somebody who is not signed in.
 *
 * ⚠️ PUBLIC BY NECESSITY AND NARROW BY DESIGN. A person deciding whether to
 * enquire has no account, so this answers before there is a session — which
 * means every field on it is a field the whole internet can read. What travels
 * is what a studio would put on a poster: its name, what it sells and for how
 * much. Not who it coaches, not how many, not anybody's name.
 *
 * ⚠️ AND IT IS OFF UNTIL THE STUDIO SAYS OTHERWISE, for the same reason
 * self-registration is: publishing a business's price list is the business's
 * decision, not a default it discovers.
 */
export const shopfront = operation<
  Bindings,
  Record<string, never>,
  { open: boolean; name: string; packages: unknown },
  never
>({
  id: "studio.shopfront",
  kind: "read",
  summary: "What this studio offers, before you sign in.",
  input: s.object({}),
  output: s.object({ open: s.bool(), name: s.text(), packages: s.json() }),
  permission: "public",
  idempotency: { mode: "none" },
  async handler(ctx) {
    const settings = await readSettings(ctx.bind.db, KOVA_SETTINGS, ctx.tenantId);
    if (settings["studio.shopfront"] !== true) return { open: false, name: "", packages: [] };

    /*
      ⚠️ NOT WRAPPED IN A `catch(() => [])`, and it was. A failing query answered
      that way is a public page confidently telling a stranger this studio sells
      nothing — which is indistinguishable from a studio that sells nothing, and
      is what hid a `WHERE active = 1` against a column that does not exist.
    */
    const rows = await ctx.bind.db.all<{ id: string; name: string; price_minor: number; price_currency: string; flags_json: string }>(
      `SELECT id, name, price_minor, price_currency, flags_json FROM customer_package
       WHERE tenant_id = ? ORDER BY price_minor ASC LIMIT 20`,
      ctx.tenantId,
    );

    return {
      open: true,
      name: String(settings["brand.name"] ?? ""),
      /* ⚠️ Name, price and what it includes. Nothing about who holds one. */
      packages: rows.map((r) => ({
        id: r.id, name: r.name,
        price: { minor: r.price_minor, currency: r.price_currency },
        includes: Object.entries(safeFlags(r.flags_json)).filter(([, on]) => on).map(([key]) => key),
      })),
    };
  },
});

const safeFlags = (text: string): Record<string, boolean> => {
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, boolean>) : {};
  } catch { return {}; }
};

/* ------------------------------------------------------- through a scan --- */

/**
 * The poses, in order, as something a person can be talked through.
 *
 * ⚠️ HANDS-FREE MEANS THE SEQUENCE IS THE SERVER'S AND THE SPEAKING IS THE
 * DEVICE'S. A phone propped against a wall two metres away can read text aloud
 * and count down without asking us anything — what it cannot do is invent the
 * order, the framing or the wording, and a product where each client's app made
 * those up is one where two scans are not comparable.
 *
 * ⚠️ AND THE WORDING IS PART OF IT. This is read to somebody standing in their
 * underwear in front of a camera; "turn to your left, arms relaxed" is the whole
 * difference between a measurement and an ordeal.
 */
export const scanGuide = operation<
  Bindings,
  Record<string, never>,
  { steps: unknown },
  never
>({
  id: "scan.guide",
  kind: "read",
  summary: "How to take a body scan, step by step, hands free.",
  input: s.object({}),
  output: s.object({ steps: s.json() }),
  permission: "scan:read",
  customerFlag: "body",
  idempotency: { mode: "none" },
  async handler() {
    return {
      steps: [
        { pose: "front", holdSeconds: 3, say: "Stand facing the camera, feet about hip width apart, arms relaxed by your sides." },
        { pose: "side", holdSeconds: 3, say: "Turn to your left so the camera sees your side. Arms relaxed, look straight ahead." },
        { pose: "back", holdSeconds: 3, say: "Turn again so your back is to the camera. Stand as you were for the first one." },
      ],
    };
  },
});

/* ------------------------------------------------------- looking outward --- */

/**
 * ⚠️ THREE LOOKUPS, ONE SHAPE, AND NONE OF THEM SAVES ANYTHING. Each answers
 * with something a person then chooses to keep — a food they will log for
 * months, a movement that goes in a plan. Writing it for them means a library
 * filling up with rows nobody chose from a service nobody checked.
 *
 * ⚠️ AND EACH IS ITS OWN OPERATION RATHER THAN ONE `lookup(service, …)`. A
 * general one would take the service from the caller, which is the argument this
 * whole lane exists to remove.
 */
export const barcode = operation<
  Bindings,
  { code: string },
  { found: unknown },
  "platform.not_found" | "platform.unavailable"
>({
  id: "food.barcode",
  kind: "read",
  summary: "Scan a barcode and get the food rather than typing it.",
  input: s.object({ code: s.text({ min: 6, max: 20, pattern: /^[0-9]+$/ }) }),
  output: s.object({ found: s.json() }),
  permission: "food:read",
  customerFlag: "nutrition",
  idempotency: { mode: "none" },
  fails: ["platform.not_found", "platform.unavailable"],
  async handler(ctx, input: { code: string }) {
    /*
      ⚠️ THE CODE IS A SEGMENT, AND DIGITS ONLY BESIDES. Two defences rather than
      one: the shape refuses anything that is not a barcode, and the lane escapes
      whatever gets through — because the shape is the thing somebody widens in
      six months to accept a different format.
    */
    const out = await lookUp<{ product?: Record<string, unknown>; status?: number }>(
      ctx, "openfoodfacts", ["api", "v2", "product", input.code],
    );
    if (!out.ok) {
      const problem = lookupProblem(out.why);
      ctx.fail(problem.code, problem.meta);
    }
    const body = (out as Extract<typeof out, { ok: true }>).value;
    if (!body.product) ctx.fail("platform.not_found", { field: "code" });
    return { found: readFood(body.product!) };
  },
});

/**
 * ⚠️ WHAT COMES BACK IS NARROWED TO WHAT THIS PRODUCT USES, and that is not
 * tidiness. A third party's whole record carries hundreds of fields, several of
 * them free text somebody else wrote — handing it to a screen means rendering
 * whatever they put there, and storing it means keeping it.
 */
const readFood = (p: Record<string, unknown>) => {
  const n = (p.nutriments ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    name: typeof p.product_name === "string" ? p.product_name.slice(0, 120) : "",
    brand: typeof p.brands === "string" ? p.brands.slice(0, 120) : "",
    per100g: {
      kcal: num(n["energy-kcal_100g"]),
      protein: num(n.proteins_100g),
      carbs: num(n.carbohydrates_100g),
      fat: num(n.fat_100g),
    },
  };
};

export const foodSearch = operation<
  Bindings,
  { text: string },
  { found: unknown },
  "platform.not_found" | "platform.unavailable"
>({
  id: "food.search",
  kind: "read",
  summary: "Find a food in a public database when the studio has not entered it.",
  input: s.object({ text: s.text({ min: 2, max: 60 }) }),
  output: s.object({ found: s.json() }),
  permission: "food:read",
  customerFlag: "nutrition",
  idempotency: { mode: "none" },
  fails: ["platform.not_found", "platform.unavailable"],
  async handler(ctx, input: { text: string }) {
    const out = await lookUp<{ products?: Record<string, unknown>[] }>(
      ctx, "openfoodfacts", ["cgi", "search.pl"],
      { search_terms: input.text, search_simple: "1", action: "process", json: "1", page_size: "10" },
    );
    if (!out.ok) {
      const problem = lookupProblem(out.why);
      ctx.fail(problem.code, problem.meta);
    }
    const body = (out as Extract<typeof out, { ok: true }>).value;
    /* ⚠️ Bounded here as well as asked for. A service that ignores `page_size`
       is not a reason for a screen to render a thousand rows. */
    return { found: (body.products ?? []).slice(0, 10).map(readFood) };
  },
});

export const movementSearch = operation<
  Bindings,
  { text: string },
  { found: unknown },
  "platform.not_found" | "platform.unavailable"
>({
  id: "movement.search",
  kind: "read",
  summary: "Find a movement in a public catalogue rather than typing it out.",
  input: s.object({ text: s.text({ min: 2, max: 60 }) }),
  output: s.object({ found: s.json() }),
  permission: "movement:write",
  idempotency: { mode: "none" },
  fails: ["platform.not_found", "platform.unavailable"],
  async handler(ctx, input: { text: string }) {
    const out = await lookUp<{ results?: Record<string, unknown>[] }>(
      ctx, "wger", ["api", "v2", "exercise", "search"], { term: input.text, language: "2" },
    );
    if (!out.ok) {
      const problem = lookupProblem(out.why);
      ctx.fail(problem.code, problem.meta);
    }
    const body = (out as Extract<typeof out, { ok: true }>).value;
    return {
      found: (body.results ?? []).slice(0, 10).map((r) => {
        const data = (r.data ?? {}) as Record<string, unknown>;
        return {
          name: typeof data.name === "string" ? data.name.slice(0, 120) : "",
          category: typeof data.category === "string" ? data.category.slice(0, 60) : "",
        };
      }),
    };
  },
});

/* ------------------------------------------------------------------- ai --- */

/**
 * ⚠️ THE RATES ARE THE PROVIDER'S PRICE LIST AND THE PROMPTS ARE KOVA'S. A
 * catalogue held by the platform would have to be edited for every product;
 * prompts held by the platform would make every product the same one.
 *
 * ⚠️ AND THE DAILY CEILING IS PER PERSON, NOT PER STUDIO. A studio-wide balance
 * is spent by whoever asks first — one coach looping a draft empties it before
 * anybody else opens the product, and the only signal is a bill.
 *
 * ⚠️ IT IS DECLARED BEFORE THE OPERATIONS THAT USE IT, deliberately: an
 * operation reaching into the manifest that contains it is a circular type, and
 * a catalogue is exactly the small thing it actually needs.
 */
export const KOVA_AI: AiSpec = {
  models: [
    /*
      ⚠️ `imageUnits` IS WHAT A PICTURE COSTS ON THE INPUT SIDE, and it is not
      in the text anywhere. A vision call metered on its prompt alone holds
      almost nothing, settles at almost nothing, and every photograph is one the
      platform pays for in full — on the feature people use most.
    */
    { id: "gemini-2.5-flash", provider: "gemini", rate: { input: 1, output: 4 }, imageUnits: 1_100 },
    /*
      ⚠️ A REASONING MODEL FOR THE ONE READING THAT MATTERS CLINICALLY. A lab
      report misread is a number a coach acts on, and `thinking` widens the
      reserve because such a model spends units the request does not show.
    */
    { id: "gemini-2.5-pro", provider: "gemini", rate: { input: 4, output: 16 }, thinking: true, imageUnits: 1_100 },
    /* ⚠️ Priced per PICTURE. There is no output ceiling here that means anything. */
    { id: "gemini-2.5-flash-image", provider: "gemini", rate: { input: 1, output: 4 }, perImage: 600 },
    /*
      ⚠️ THE SECOND LANE, AND IT IS WHY THE CATALOGUE IS A CATALOGUE. A product
      that named one provider would be a product where "which company reads my
      clients' records" was decided by whoever wrote the manifest — and there is
      no version of that answer that is right for every studio in every country.

      These are text-only: no `imageUnits`, so `modelSuits` will not offer them
      for a feature that sends a photograph, and no `perImage`, so they are never
      offered for one that draws. That is derived from the METER rather than
      declared beside it, because a capability field can disagree with the
      arithmetic and it disagrees in the expensive direction.
    */
    { id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", provider: "workers-ai", rate: { input: 1, output: 2 } },
    { id: "@cf/qwen/qwen2.5-coder-32b-instruct", provider: "workers-ai", rate: { input: 1, output: 2 } },
  ],
  features: {
    "draft-plan": {
      summary: "A training plan from a sentence",
      model: "gemini-2.5-flash",
      system: [
        "You draft strength-training programmes for a coach to edit. Answer with JSON only.",
        "Shape: { \"weeks\": [{ \"days\": [{ \"name\": string, \"movements\": [{ \"movement\": string, \"sets\": number, \"reps\": number, \"note\": string }] }] }] }.",
        "Name movements in plain English. Do not invent a client's history, injuries or measurements: you have not been given any, and a coach reading a confident detail you made up is the failure that matters here.",
        "Where the brief is not specific enough, choose the conservative option and say so in the note.",
      ].join("\n"),
      maxOutput: 4_000,
      dailyPerPerson: 20,
    },
    "parse-food": {
      summary: "A meal described in words, as foods and portions",
      model: "gemini-2.5-flash",
      system: [
        "You turn a sentence about a meal into foods and portions. Answer with JSON only.",
        "Shape: { \"foods\": [{ \"name\": string, \"grams\": number, \"confident\": boolean }] }.",
        "Grams are the eaten weight. Where the sentence does not say how much, estimate an ordinary serving and set confident to false — a number somebody has to check is useful, and one that looks certain and is not is worse than none.",
      ].join("\n"),
      maxOutput: 600,
      dailyPerPerson: 30,
    },

    "draft-meals": {
      summary: "A meal plan from a sentence",
      model: "gemini-2.5-flash",
      system: [
        "You draft eating plans for a coach to edit. Answer with JSON only.",
        "Shape: { \"weeks\": [{ \"days\": [{ \"name\": string, \"meals\": [{ \"name\": string, \"foods\": [{ \"name\": string, \"grams\": number }] }] }] }] }.",
        "Do not invent allergies, intolerances, medication or a calorie target: you have not been given any, and a coach reading a confident detail you made up is the failure that matters here.",
        "Where the brief is not specific enough, choose the ordinary option and say so in a note on the day.",
      ].join("\n"),
      maxOutput: 4_000,
      dailyPerPerson: 20,
    },

    /* ------------------------------------------------------ from a picture --- */

    /*
      ⚠️ THE THREE BELOW DECLARE `takes: "image"`, AND THE DECLARATION IS WHAT
      MAKES THEM SAFE TO PRICE. A feature that decided per request whether a
      picture was attached would compute its reserve from the text and then send
      a photograph — succeeding every time, and costing the platform the
      difference on every call.
    */
    "snap-meal": {
      summary: "A photograph of a meal, as foods and portions",
      model: "gemini-2.5-flash",
      system: [
        "You read a photograph of a meal and answer with foods and portions. JSON only.",
        "Shape: { \"foods\": [{ \"name\": string, \"grams\": number, \"confident\": boolean }] }.",
        "Grams are the eaten weight, estimated from what is visible. Set confident to false whenever the amount is a guess — which for a photograph is most of the time. A number somebody has to check is useful; one that looks certain and is not is worse than none.",
        "If the picture is not of food, answer with an empty list rather than describing what it is.",
      ].join("\n"),
      maxOutput: 600,
      dailyPerPerson: 30,
      takes: "image",
    },
    "label-reader": {
      summary: "A photograph of a nutrition label, as a food",
      model: "gemini-2.5-flash",
      system: [
        "You read a nutrition label and answer with one food. JSON only.",
        "Shape: { \"name\": string, \"per100g\": { \"kcal\": number, \"protein\": number, \"carbs\": number, \"fat\": number }, \"confident\": boolean }.",
        "Convert whatever basis the label uses to per 100 g. If it is stated per serving and the serving weight is not legible, set confident to false rather than assuming a serving size.",
        "Never fill a figure the label does not carry. An absent number is absent; a plausible one is a food somebody will log for months.",
      ].join("\n"),
      maxOutput: 400,
      dailyPerPerson: 30,
      takes: "image",
    },
    "lab-extract": {
      summary: "A photograph of a lab report, as values",
      model: "gemini-2.5-pro",
      system: [
        "You read a laboratory report and answer with the values it carries. JSON only.",
        "Shape: { \"values\": [{ \"name\": string, \"value\": number, \"unit\": string, \"low\": number, \"high\": number, \"legible\": boolean }] }.",
        "⚠️ Transcribe. Do not interpret, do not diagnose, and do not comment on whether a value is concerning — a coach is not a clinician and neither are you.",
        "Copy the reference range exactly as printed; ranges differ between laboratories and a remembered one is wrong.",
        "Where a digit is not legible, set legible to false and leave the value at zero. A misread decimal point is a tenfold error in something somebody acts on.",
      ].join("\n"),
      maxOutput: 2_000,
      dailyPerPerson: 10,
      takes: "image",
    },

    /* ------------------------------------------------------ writing things --- */

    "exercise-guide": {
      summary: "How to do a movement, in the studio's voice",
      model: "gemini-2.5-flash",
      system: [
        "You write short how-to text for one strength movement, for a client to read on a phone mid-session.",
        "Setup, execution, and the two mistakes people actually make. Plain prose, no headings, under 180 words.",
        "Do not name a weight, a rep count or a tempo: those are the coach's prescription and this text is read beside it.",
        "Do not give medical advice or tell somebody a movement is safe for them.",
      ].join("\n"),
      maxOutput: 500,
      dailyPerPerson: 30,
    },
    "supplement-guide": {
      summary: "Guidance on a supplement, with its basis stated",
      model: "gemini-2.5-flash",
      system: [
        "You write a short note on one supplement for a coach to review before it reaches anybody.",
        "Say what the evidence actually supports and how strong it is. Where the evidence is thin, say that plainly rather than hedging into a recommendation.",
        "⚠️ Name interactions and who should not take it. Omitting a contraindication is the failure that matters here, and a note that reads well and leaves one out is worse than no note.",
        "Under 200 words. No dose: the dose is the coach's, and this is read beside it.",
      ].join("\n"),
      maxOutput: 600,
      dailyPerPerson: 20,
    },
    "client-summary": {
      summary: "A month of somebody's training and eating, read back",
      model: "gemini-2.5-flash",
      system: [
        "You summarise one client's month from the figures given, for their coach.",
        "What changed, what held, and what is worth asking them about. Under 200 words, plain prose.",
        "⚠️ Use only the figures in the brief. Do not infer a mood, a reason or a life event from a gap in the data — a missed week is a missed week, and a confident story about why is the thing a coach would repeat back to somebody.",
        "Where the data is too thin to say anything, say that.",
      ].join("\n"),
      maxOutput: 600,
      dailyPerPerson: 20,
    },
    "article": {
      summary: "A draft article for the studio's own feed",
      model: "gemini-2.5-flash",
      system: [
        "You draft a short article for a personal-training studio to publish, for a coach to edit before it goes out.",
        "Plain prose under 700 words. No headings, no lists, no calls to action.",
        "Do not cite a study you cannot name, do not give medical advice, and do not make a claim about results anybody can be held to.",
      ].join("\n"),
      maxOutput: 2_000,
      dailyPerPerson: 10,
    },

    /* --------------------------------------------------------- and a picture --- */

    /*
      ⚠️ PRICED PER PICTURE, WHICH IS WHY IT IS A DIFFERENT SHAPE RATHER THAN A
      DIFFERENT CONTENT TYPE. There is no output ceiling that means anything and
      nothing a provider could report that would make the image cheaper — so it
      settles at the reserve, always.
    */
    /*
      ⚠️ THE MOST CAREFUL PROMPT IN THE PRODUCT. It reads a photograph of
      somebody's body and answers with a number they will act on, so it is told
      to say when it cannot tell — and the operation that calls it ANSWERS rather
      than saving, because whether a model's judgement about their body goes into
      their history is theirs to decide.
    */
    "body-scan": {
      summary: "Body composition estimated from a photograph",
      model: "gemini-2.5-flash",
      system: [
        "You estimate body-fat percentage from a photograph, for a coach and a client to consider. JSON only.",
        "Shape: { \"bodyFat\": number, \"confident\": boolean, \"basis\": string }.",
        "⚠️ Set confident to false whenever the pose, the lighting or the clothing makes this a guess — which is most photographs. An estimate that looks certain is one somebody will compare against next month and read a change into.",
        "Give a single number, not a range, and say in one short sentence what you read it from.",
        "Do not comment on the person's appearance, do not say whether the figure is good or bad, and do not give health or dietary advice. You are reading a picture, not assessing a patient.",
      ].join("\n"),
      maxOutput: 400,
      dailyPerPerson: 10,
      takes: "image",
    },

    "image": {
      summary: "A picture for the studio's own use",
      model: "gemini-2.5-flash-image",
      system: "You draw a single photographic image for a personal-training studio to use in its own material. No text in the image, no logos, and no recognisable real person.",
      /* ⚠️ Meaningless for a picture, and kept truthful rather than zero. */
      maxOutput: 1,
      dailyPerPerson: 10,
      produces: "image",
      images: 1,
    },
  },
};

/**
 * ⚠️ THE PROMPT IS KOVA'S AND THE METER IS THE PLATFORM'S. What to ask a model
 * for is the whole of what makes a coaching product different; what one call may
 * hold, charge and how often one person may make it is the same arithmetic in
 * every product, and getting it wrong is a transfer rather than a bug.
 *
 * ⚠️ AND A DRAFT IS A DRAFT. Neither of these writes anything: the answer comes
 * back for a person to read, edit and save through the ordinary surface. A
 * generated row saved straight into somebody's programme is a plan nobody
 * approved, arriving under a coach's name.
 */
export const draftPlan = operation<
  Bindings,
  { brief: string },
  { generation: string; draft: unknown; charged: number },
  "platform.invalid" | "platform.quota_reached" | "platform.too_many" | "platform.unavailable"
>({
  id: "ai.draft-plan",
  kind: "write",
  summary: "Draft a training plan from a sentence, to edit rather than to keep.",
  input: s.object({ brief: s.text({ min: 10, max: 600 }) }),
  output: s.object({ generation: s.text(), draft: s.json(), charged: s.number({ integer: true }) }),
  permission: "programme:write",
  entitlement: "training",
  /*
    ⚠️ NOT IDEMPOTENT ON THE BRIEF. Asking twice for a draft of the same sentence
    is a person asking for a different draft, which is the whole way this feature
    is used — collapsing the second call onto the first would return the answer
    they were trying to replace.
  */
  /* ⚠️ A draft lands in an editor the coach then works in; what is not visible is that it cost something. */
  outcome: { message: "Drafted", tone: "success", invalidates: ["ai.spending"] },
  idempotency: { mode: "none" },
  audit: () => ({ subject: "programme", verb: "draft" }),
  fails: ["platform.invalid", "platform.quota_reached", "platform.too_many", "platform.unavailable"],
  /*
    ⚠️ NOT A TOOL. A model asking a model to draft a plan spends a studio's
    credits on a request nobody made, and the output is a draft a person was
    supposed to read.
  */
  tool: false,
  async handler(ctx, input: { brief: string }) {
    const out = await generateWith(ctx, KOVA_AI, "draft-plan", input.brief);
    if (!out.ok) {
      const problem = refusalProblem(out);
      ctx.fail(problem.code, problem.meta);
    }
    const done = out as Extract<typeof out, { ok: true }>;
    return { generation: done.id, draft: done.output, charged: done.charged };
  },
});

/**
 * ⚠️ THE CLIENT'S OWN, AND GATED ON WHAT THEY BOUGHT. Describing a meal in words
 * is the nutrition surface — a client whose package does not include eating must
 * not be able to spend the studio's credits on it.
 */
export const parseFood = operation<
  Bindings,
  { text: string },
  { generation: string; foods: unknown; charged: number },
  "platform.invalid" | "platform.quota_reached" | "platform.too_many" | "platform.unavailable"
>({
  id: "ai.parse-food",
  kind: "write",
  summary: "Say what you ate in words, and get it back as foods and portions.",
  input: s.object({ text: s.text({ min: 3, max: 500 }) }),
  output: s.object({ generation: s.text(), foods: s.json(), charged: s.number({ integer: true }) }),
  permission: "portion:write",
  customerFlag: "nutrition",
  /* ⚠️ The same: what came back is on the screen, what it cost is not. */
  outcome: { message: "Read", tone: "success", invalidates: ["ai.spending"] },
  idempotency: { mode: "none" },
  audit: () => ({ subject: "portion", verb: "parse" }),
  fails: ["platform.invalid", "platform.quota_reached", "platform.too_many", "platform.unavailable"],
  tool: false,
  async handler(ctx, input: { text: string }) {
    const out = await generateWith(ctx, KOVA_AI, "parse-food", input.text);
    if (!out.ok) {
      const problem = refusalProblem(out);
      ctx.fail(problem.code, problem.meta);
    }
    const done = out as Extract<typeof out, { ok: true }>;
    return { generation: done.id, foods: done.output, charged: done.charged };
  },
});

/* ----------------------------------------------------- reading a picture --- */

/**
 * ⚠️ ONE OPERATION SHAPE FOR ALL THREE, AND THE PICTURE IS NAMED BY ITS MEDIA
 * ID. The bytes are already in the workspace's own store — uploaded through the
 * platform's path, so stripped of the metadata a phone attaches, counted against
 * the storage ceiling, and erased when the workspace is. A lane that took bytes
 * on this request would be a second way into a model's input with none of that.
 */
/*
  ⚠️ THE TWO FACTORIES ARE `@one/runtime`'S NOW. Neither knew what it was reading
  or drafting — what varies is the id, the feature, the permission and the words
  — and both shipped here without an `outcome`, so five writes that spend a
  workspace's credits answered with nothing a screen was told to say. One
  omission became five; the next app writing its own pair would make it six.
*/
export const snapMeal = readsAPicture<Bindings>(KOVA_AI, {
  id: "ai.snap-meal",
  feature: "snap-meal",
  summary: "Photograph a meal and get it back as foods and portions, to check.",
  permission: "portion:write",
  customerFlag: "nutrition",
  verb: "snap",
  subject: "portion",
});

export const labelReader = readsAPicture<Bindings>(KOVA_AI, {
  id: "ai.label-reader",
  feature: "label-reader",
  summary: "Photograph a nutrition label and get the food, to check and save.",
  permission: "food:write",
  customerFlag: "nutrition",
  verb: "read-label",
  subject: "food",
});

/*
  ⚠️ THE COACH'S, NOT THE CLIENT'S, AND IT TRANSCRIBES RATHER THAN INTERPRETS.
  A lab report read by a model produces figures somebody acts on; the reading is
  handed to whoever ordered the test, and the model is told in its own system
  text not to say whether anything is concerning.
*/
export const labExtract = readsAPicture<Bindings>(KOVA_AI, {
  id: "ai.lab-extract",
  feature: "lab-extract",
  summary: "Read a lab report photograph into values, for a coach to check.",
  permission: "lab:write",
  verb: "extract",
  subject: "lab",
});

/* ------------------------------------------------------- writing things --- */

/**
 * ⚠️ ONE SHAPE FOR EVERY DRAFT, AND NONE OF THEM SAVES ANYTHING. Each answers
 * with text for a person to read, edit and keep through the ordinary surface. A
 * generated paragraph written straight into a movement, a supplement or the
 * studio's feed is text nobody approved, published under the studio's name.
 */
export const draftMeals = draftsFrom<Bindings>(KOVA_AI, {
  id: "ai.draft-meals",
  feature: "draft-meals",
  summary: "Draft an eating plan from a sentence, to edit rather than to keep.",
  permission: "programme:write",
  /*
    ⚠️ `training` RATHER THAN `nutrition`, BECAUSE `nutrition` IS A CUSTOMER FLAG.
    Two rails, never merged: an entitlement is what the studio bought from us and
    a flag is what a client bought from the studio. Naming a flag here is an
    entitlement nothing resolves — which the gate reads as absent, so the feature
    is refused for everybody.
  */
  entitlement: "training",
  verb: "draft-meals",
  subject: "programme",
  max: 600,
});

export const exerciseGuide = draftsFrom<Bindings>(KOVA_AI, {
  id: "ai.exercise-guide",
  feature: "exercise-guide",
  summary: "Draft how-to text for a movement, in the studio's voice.",
  permission: "movement:write",
  verb: "guide",
  subject: "movement",
  max: 200,
});

export const supplementGuide = draftsFrom<Bindings>(KOVA_AI, {
  id: "ai.supplement-guide",
  feature: "supplement-guide",
  summary: "Draft guidance on a supplement, with what the evidence supports.",
  permission: "supplement:write",
  verb: "guide",
  subject: "supplement",
  max: 200,
});

export const draftArticle = draftsFrom<Bindings>(KOVA_AI, {
  id: "ai.article",
  feature: "article",
  summary: "Draft an article for the studio's feed, to edit before it goes out.",
  permission: "article:write",
  verb: "draft",
  subject: "article",
  max: 400,
});

/* ------------------------------------------------------ a month, read back --- */

/**
 * ⚠️ THE FIGURES ARE ASSEMBLED HERE AND THE MODEL IS GIVEN NOTHING ELSE.
 *
 * A summary is only worth having if it is about this person, and the way that
 * goes wrong is a prompt carrying a name and a date range while the model
 * supplies the content. So the brief is built from the same reads the report
 * screen uses, and `requireClientAccess` decides whose figures they are before
 * a single credit is held.
 */
export const clientSummary = operation<
  Bindings,
  { clientId: string; days?: number },
  { generation: string; summary: unknown; charged: number },
  "platform.not_found" | "platform.forbidden" | "platform.invalid" | "platform.quota_reached" | "platform.too_many" | "platform.unavailable"
>({
  id: "ai.client-summary",
  kind: "write",
  summary: "Read a summary of somebody's month instead of assembling it from four places.",
  input: s.object({ clientId: s.text({ max: 40 }), days: s.optional(s.number({ integer: true, min: 7, max: 90 })) }),
  output: s.object({ generation: s.text(), summary: s.json(), charged: s.number({ integer: true }) }),
  permission: "client:read",
  /* ⚠️ A month of somebody's records read into a paragraph, charged for. */
  outcome: { message: "Summarised", tone: "success", invalidates: ["ai.spending"] },
  idempotency: { mode: "none" },
  audit: (i: { clientId: string }) => ({ subject: i.clientId, verb: "summarise" }),
  fails: ["platform.not_found", "platform.forbidden", "platform.invalid", "platform.quota_reached", "platform.too_many", "platform.unavailable"],
  tool: false,
  async handler(ctx, input: { clientId: string; days?: number }) {
    const person = await ctx.bind.db.first<{ id: string; name: string }>(
      `SELECT id, name FROM ${T.clients} WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      input.clientId, ctx.tenantId,
    );
    if (!person) ctx.fail("platform.not_found", { field: "clientId" });

    const days = input.days ?? 28;
    const since = new Date(Date.parse(ctx.now()) - days * 86_400_000).toISOString().slice(0, 10);
    const count = async (sql: string, ...binds: unknown[]) =>
      (await ctx.bind.db.first<{ n: number }>(sql, ...binds))?.n ?? 0;

    const workouts = await count(`SELECT COUNT(*) AS n FROM ${T.workouts} WHERE tenant_id = ? AND client_id = ? AND day >= ? AND deleted_at IS NULL`, ctx.tenantId, person!.id, since);
    const sets = await count(`SELECT COUNT(*) AS n FROM ${T.sets} WHERE tenant_id = ? AND client_id = ? AND created_at >= ?`, ctx.tenantId, person!.id, since);
    const meals = await count(`SELECT COUNT(*) AS n FROM ${T.entries} WHERE tenant_id = ? AND client_id = ? AND day >= ? AND deleted_at IS NULL`, ctx.tenantId, person!.id, since);
    const checkins = await count(`SELECT COUNT(*) AS n FROM ${T.checkins} WHERE tenant_id = ? AND client_id = ? AND until >= ? AND deleted_at IS NULL`, ctx.tenantId, person!.id, since);

    /*
      ⚠️ COUNTS, NOT A NAME. What the model is given is what it may talk about,
      and a brief carrying somebody's name invites a sentence about the person
      rather than about the numbers. Nothing here identifies anybody.
    */
    const brief = [
      `Over the last ${days} days: ${workouts} workouts recorded, ${sets} sets logged,`,
      `${meals} meals logged, ${checkins} check-ins answered.`,
    ].join(" ");

    const out = await generateWith(ctx, KOVA_AI, "client-summary", brief);
    if (!out.ok) {
      const problem = refusalProblem(out);
      ctx.fail(problem.code, problem.meta);
    }
    const done = out as Extract<typeof out, { ok: true }>;
    return { generation: done.id, summary: done.output, charged: done.charged };
  },
});

/* -------------------------------------------------------------- a picture --- */

/**
 * ⚠️ WHAT COMES BACK IS BYTES, AND THEY LAND IN THE WORKSPACE'S OWN LIBRARY.
 *
 * A generated image handed to the browser as data is an object nothing counts
 * against the studio's storage, nothing erases when it closes, and nothing can
 * serve again tomorrow — so keeping it means generating it a second time and
 * paying again. It goes through the same store every upload does, which is what
 * makes "what does this workspace hold" a question with one answer.
 */
export const drawImage = operation<
  Bindings,
  { about: string },
  { generation: string; media: string; charged: number },
  "platform.invalid" | "platform.quota_reached" | "platform.too_many" | "platform.unavailable"
>({
  id: "ai.image",
  kind: "write",
  summary: "Generate a picture for the studio's own use, kept in its library.",
  input: s.object({ about: s.text({ min: 3, max: 400 }) }),
  output: s.object({ generation: s.text(), media: s.text(), charged: s.number({ integer: true }) }),
  permission: "article:write",
  /* ⚠️ A generated picture lands in the library, which is a second surface to refresh. */
  outcome: { message: "Generated", tone: "success", invalidates: ["ai.spending", "file.list"] },
  idempotency: { mode: "none" },
  audit: () => ({ subject: "media", verb: "draw" }),
  fails: ["platform.invalid", "platform.quota_reached", "platform.too_many", "platform.unavailable"],
  tool: false,
  async handler(ctx, input: { about: string }) {
    const out = await drawWith(ctx, KOVA_AI, "image", input.about, { name: "Generated image", purpose: "cover" });
    if (!out.ok) {
      const problem = refusalProblem(out as never);
      ctx.fail(problem.code, problem.meta);
    }
    const done = out as Extract<typeof out, { ok: true }>;
    return { generation: done.id, media: done.mediaId, charged: done.charged };
  },
});


/**
 * ⚠️ DECLARED BESIDE THE MANIFEST RATHER THAN INSIDE IT, because a HANDLER reads
 * it. `readSettings` needs the registry to apply the declared fallbacks, and an
 * operation reaching into the manifest that contains it is a circular type — the
 * same reason `KOVA_AI` sits out here.
 */
export const KOVA_SETTINGS: SettingsSpec = {
    "studio.weekStart": {
      label: "Weeks start on",
      kind: "enum",
      values: ["monday", "sunday", "saturday"],
      fallback: "monday",
      help: "Which day a training week and a consistency count begin on.",
    },
    /*
      ⚠️ A NUMBER WITH A CEILING, because this is what a client is shown as
      overdue — and a studio that typed 400 has turned the whole feature off
      without meaning to.
    */
    "studio.checkInDays": {
      label: "Check in every",
      kind: "number",
      min: 1,
      max: 90,
      fallback: 7,
      help: "How often you expect somebody to check in. What the coach's attention list counts against.",
    },
    "studio.replyDays": {
      label: "Answer a check-in within",
      kind: "number",
      min: 1,
      max: 30,
      fallback: 3,
      help: "How long an unanswered check-in may sit before it is flagged to you.",
    },
    /*
      ⚠️ NARROWER THAN THE SCREEN IT IS ON. Turning the client feed off takes
      something away from everybody the studio coaches, so it is the owner's
      rather than any coach who can open settings.
    */
    /*
      ⚠️ OFF BY DEFAULT, AND THE DEFAULT IS THE WHOLE SAFETY OF IT. An open
      registration means anybody who guesses a studio's address becomes a client
      of it — consuming a seat, appearing on the roster, and being a stranger in
      a list of people that studio coaches.
    */
    "studio.selfRegister": {
      label: "Let people add themselves",
      kind: "bool",
      fallback: false,
      write: "member:manage",
      help: "When on, somebody with your studio's address can put themselves on the roster for a coach to pick up.",
    },
    /*
      ⚠️ A CEILING ON WHAT AN OPEN DOOR CAN DO. The plan's own client quota is
      checked against the CALLER's entitlements, and a self-registering caller
      has none — so without a bound of the studio's own, an open studio is one
      anybody can push past its own plan.
    */
    "studio.selfRegisterCeiling": {
      label: "Stop taking new ones at",
      kind: "number",
      min: 0,
      max: 5_000,
      fallback: 0,
      write: "member:manage",
      help: "How many people may be on the roster before self-registration closes. Zero means no limit of its own.",
    },
    /*
      ⚠️ OFF UNTIL THE STUDIO SAYS OTHERWISE. Publishing a business's price list
      is the business's decision rather than a default it discovers — and what is
      published is readable by the whole internet, which is why it carries what a
      poster carries and nothing about who is coached here.
    */
    "studio.shopfront": {
      label: "Show what you offer publicly",
      kind: "bool",
      fallback: false,
      write: "commerce:manage",
      help: "When on, your packages and prices can be read by somebody who has not signed in. Nothing about your clients is included.",
    },
    "studio.publishFeed": {
      label: "Publish articles to clients",
      kind: "bool",
      fallback: true,
      /* ⚠️ The OWNER's: withdrawing the feed takes something away from everybody
         the studio coaches, which is a decision about what is offered rather
         than about how anybody is coached. */
      write: "commerce:manage",
      help: "When off, published articles stay in the studio and no client sees the feed.",
    },
};

export const kova = defineApp({
  id: "kova",
  name: "Kova",
  stripeMetadataPrefix: "kova",
  manifestVersion: "0.29.0",
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
      ⚠️ TWO, AND THE EU ONE IS OFFERED RATHER THAN GRANTED ON REQUEST. A studio
      that needs its clients' records to stay in the EU chooses `eu` when it is
      created; a studio with no view gets `auto`, which is wherever the request
      landed. Residency that has to be asked for is residency most people who
      needed it never got, because they did not know it was a question.

      ⚠️ ADDITIVE, NEVER A RENAME. The default region keeps the BARE binding name
      — `DB`, `MEDIA` — and `eu` appears beside it as `DB_EU`, `MEDIA_EU`.
      Suffixing every region would mean adding the second one renames the first,
      which is a change to a live worker's bindings applied at deploy, where
      getting it wrong takes the product down rather than degrading a feature.

      ⚠️ AND A REGION DECLARED WITH NO STORE BEHIND IT IS A WORKSPACE THAT IS
      UNREACHABLE FROM THE MOMENT IT IS CREATED. `bindingsFor` throws
      `BindingMissing` naming the region and the store, rather than letting a
      handler discover it as `Cannot read properties of undefined`.
    */
    regions: ["auto", "eu"] as RegionId[],
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
      ...STAFF, "workspace:create", "workspace:close", "workspace:settings", "billing:manage", "commerce:manage",
      "member:read", "member:manage", "report:read", "ai:read", "platform:operate",
    ],
    roles: {
      /*
        ⚠️ `member:manage` IS WHAT MAKES A ROLE THE FOUNDING ONE. The platform
        picks the role that creates a workspace by what it can DO rather than by
        what it is called, so this key is not decoration — remove it here and a
        new studio is founded with nobody able to invite anybody into it.
      */
      /* ⚠️ `ai:read` is the OWNER's alone — what the studio's credits went on is
         a question about the bill, and the bill is theirs. */
      owner: [...STAFF, "workspace:create", "workspace:close", "workspace:settings", "billing:manage", "commerce:manage", "member:read", "member:manage", "ai:read"],
      /* ⚠️ A coach SEES the team and cannot change it — hiring is the owner's. */
      /*
        ⚠️ A COACH MAY SET HOW THE STUDIO COACHES. The check-in cadence and what
        a week starts on are coaching decisions, not commercial ones — and a
        settings screen only the owner can open is one the owner is asked to open
        on somebody else's behalf every week.
      */
      trainer: [...STAFF, "workspace:create", "member:read", "workspace:settings"],
      /* ⚠️ The front desk sees people and bookings, and prescribes nothing. */
      /* ⚠️ The front desk sees people and BOOKINGS, and prescribes nothing —
         which is why `session:write` is here and nothing else new is. */
      assistant: ["client:read", "workout:read", "inbox:read", "guide:read", "milestone:read", "commerce:read", "file:read", "member:read",
        "booking:read", "booking:write", "article:feed", "assignment:read"],
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
        /* ⚠️ They SEE when they are booked in and do not book themselves — and
           `article:feed` is the published feed, never the collection's own read,
           which would hand them every draft in the studio. */
        "booking:read", "article:feed",
        /* ⚠️ They READ what was prescribed and RECORD taking it; prescribing is
           staff's, and so is writing up what a report said. */
        "supplement:read", "dose:read", "dose:write", "lab:read", "assignment:read",
        /* ⚠️ They ASK for a swap and read the alternatives a coach wrote; the
           answer is the coach's, which is why `swap:decide` is not here. */
        "alternative:read", "swap:read", "swap:write",
        /* ⚠️ Their own body and their own eating. A client who could not start a
           fast, keep a photograph or say which lunch they took would be a client
           the features were built for and withheld from. */
        "fast:read", "fast:write", "photo:read", "photo:write",
        "choice:read", "choice:write", "scan:read", "scan:write",
        /*
          ⚠️ `file:read` AND NO BLANKET WRITE. What a client may upload is decided
          by the PURPOSE — their own meal, their own label, their own progress
          photograph — and each of those names a permission they already hold.
          A general write over the studio's storage stays the coach's.
        */
        "inbox:read", "guide:read", "milestone:read", "file:read", "commerce:read",
        /* ⚠️ A client may say a generation was wrong. They are the one who read it. */
        "ai:use",
        /* ⚠️ Their OWN report. The row scope on `client.report` is what stops it
           being anybody else's. */
        "report:read",
      ],
      /*
        ⚠️ WHAT SOMEBODY MAY DO ON THE OPERATOR DOOR, where there is no studio to
        be a member of. The door is the control; this says what it opens onto,
        and it is deliberately narrow — the deployment's own checklist and its
        payment plumbing, never a studio's records.
      */
      /* ⚠️ `platform:operate` is the key that acts on ANOTHER workspace from
         outside it — the one power no member of a studio holds, and the reason
         it is not folded into the payment lane. */
      operator: ["guide:read", "inbox:read", "platform:operate"],
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
    /*
      ⚠️ CREDITS ARE BOUGHT SEPARATELY FROM A PLAN, because running out of them
      is not a reason to sell somebody a bigger product. A studio drafting plans
      all week and a studio that has never opened the AI features are on the same
      tier and should be.
    */
    creditPacks: [
      { id: "small", name: "10,000 credits", price: { minor: 900, currency: "USD" as Currency }, credits: 10_000 },
      { id: "medium", name: "50,000 credits", price: { minor: 3_900, currency: "USD" as Currency }, credits: 50_000 },
      { id: "large", name: "200,000 credits", price: { minor: 12_900, currency: "USD" as Currency }, credits: 200_000 },
    ],
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

    /* ⚠️ A CLIENT RECORD IS THE CUSTOMER, not the account that signs in. A coach
       acts on somebody's behalf all day; resolving the caller's own account as
       the subject would give the coach the client's package and the client
       nothing. The membership names the record, on the invitation. */
    customerRail: "record",

    /*
      ⚠️ WHAT A STUDIO SELLS THE PEOPLE IT COACHES, and it is NOT the first rail
      again. `training` here is the capability a CLIENT bought from their studio;
      `training` in `entitlements` above is what the STUDIO bought from us. They
      share a word because they are the same feature seen from two sides, and a
      person's real capability is the INTERSECTION — which is why each one names
      the entitlement it requires rather than the platform assuming a match.
    */
    customerFlags: {
      training: {
        label: "Training programmes",
        enforcement: "gate",
        /* ⚠️ The bucket of DAYS that gates it. Runs out, and the flag goes off. */
        scope: "coaching",
        requires: "training",
        parked: false,
      },
      nutrition: {
        label: "Meal plans and food logging",
        enforcement: "gate",
        scope: "nutrition",
        parked: false,
      },
      checkins: {
        label: "Weekly check-ins",
        enforcement: "gate",
        scope: "coaching",
        parked: false,
      },
      /*
        ⚠️ ITS OWN FLAG, because photographs of somebody's body are the most
        sensitive thing this product holds and a studio may sell coaching without
        ever asking for one. Folding them under `training` would mean everybody
        on a training package is offered a camera.
      */
      body: {
        label: "Body composition and progress photos",
        enforcement: "gate",
        scope: "coaching",
        parked: false,
      },
      /*
        ⚠️ SHAPED, NOT GATED, and this is the case the rule exists for. One report
        carries the body, the training and the nutrition lenses; refusing it
        outright takes the ungated halves down with the sold one, and returning a
        quietly thinner payload makes "withheld" and "empty" the same answer. It
        reports what it withheld instead.
      */
      progress: {
        label: "Progress reports",
        enforcement: "shape",
        scope: "coaching",
        parked: false,
      },
      /*
        ⚠️ THE ONE HONEST EXEMPTION. A day's macros are computed from the food
        the person logged themselves — there is nothing a route could withhold
        without breaking the logging that produced it.
      */
      macros: {
        label: "Daily macro totals",
        enforcement: { derived: "computed from the client's own entries; withholding it would break logging" },
        parked: true,
      },
    },
    seats: { counts: ["owner", "trainer", "assistant"] },
    /* ⚠️ What somebody holds before they belong to a studio: opening one. A coach
       invited to somebody else's studio arrives with a membership and needs
       nothing here; a person starting their own has no membership to read. */
    personal: ["workspace:create"],
  },

  governance: {
    /*
      ⚠️ EACH CARRIES ITS TEXT. A version is part of the consent ledger's key, so
      a document nobody can produce makes every row in that ledger evidence of
      nothing — which is the one thing anybody would ever ask for it about.

      ⚠️ THESE ARE ACCURATE NOTICES, NOT OPERATIVE AGREEMENTS. Every sentence
      below describes what this code actually does and can be checked against it.
      What they are not is drafted by a lawyer, and this product stores health
      information — which is special-category data, needing explicit consent and
      an impact assessment rather than the ordinary basis. The operative
      long-form documents belong at `url` beside these, and they need review
      before the first paying customer rather than before the first commit.
    */
    legal: [
      {
        id: "terms",
        version: "2026-01-01",
        title: "Terms of service",
        body: [
          "Kova is software a coaching business runs its own practice on, provided by Four Degree Labs, Abu Dhabi, United Arab Emirates. The studio decides who it coaches, what it sells them and what it records about them; we provide the software and store what the studio puts in it.",
          "A studio pays us for a plan. Its own customers pay the studio, on the studio's own payment provider — we never see a card number and are not part of that transaction.",
          "You can leave at any time, from any state, including one where a payment has failed. Closing a workspace is reversible for seven days; after that its records are erased and cannot be recovered.",
          "We may act inside a workspace to help with a problem. That is time-boxed, needs a stated reason, is announced to the workspace, and is on the record either way.",
        ].join("\n\n"),
        mustAccept: ["owner"],
      },
      {
        id: "privacy",
        version: "2026-01-01",
        title: "Privacy notice",
        body: [
          "What is stored: who you are (an email address, a name, and a photograph if you add one), and what you record — sessions, meals, measurements, photographs, and what you write in a check-in. A studio's staff can see the records of the people they coach. Other studios cannot see any of it.",
          "Where it is stored: in one place, chosen by the studio when it was created — either the European Union, or wherever the request landed if the studio had no view. Sign-in credentials are held separately from a studio's records, and a passkey never leaves your device.",
          "Who else sees it: nobody, except the services that make specific features work. A photograph you send to be read by a model goes to that model's provider. A message we send you goes through a mail provider. A payment for a plan goes through a payment provider. Nothing is sold, and nothing is used to train anybody's model.",
          "How long: for as long as the workspace exists, unless a record has a shorter limit of its own. A closed workspace is erased after seven days. Asking to be forgotten removes your records and the trail of who touched them.",
          "What you can ask for: a copy of everything held about you, a correction, or an erasure. Ask the studio that coaches you; they can do all three from inside the product. If you would rather ask us, write to legal@fourdegreelabs.com and we will pass it to your studio, because the records are theirs to act on.",
        ].join("\n\n"),
        mustAccept: ["owner", "trainer", "assistant", "client"],
      },
      /*
        ⚠️ THE OWNER ACCEPTS THIS AND NOBODY ELSE, because it is the one document
        here that is an agreement between two BUSINESSES. The terms bind the
        studio to us; the privacy notice tells a person what is held about them;
        this is the studio instructing us, in writing, on how we may handle
        records about people who never signed anything with us at all.
        Article 28 requires it to be a contract rather than a description, which
        is the difference between this and the paragraph in the privacy notice
        that says the same thing.

        ⚠️ AND IT IS FORCED BY THE COLLECTIONS RATHER THAN BY MEMORY. The moment
        one of them declares `holding.kind === "personal"`, this manifest does not
        compose without a document with this id — see `agreementProblems`.
      */
      {
        id: "dpa",
        version: "2026-01-01",
        title: "Data processing agreement",
        body: [
          "This is the studio's instruction to us about the records it keeps on the people it coaches. For those records the studio decides what is collected and why; we hold them, and we act only on what the studio asks for. For a studio's own account and its bill with us, we decide, and the privacy notice covers that.",
          "What we do with them: store them, show them to the staff the studio gives access to, and run the specific features the studio uses. Nothing else. They are not sold, not shared with another studio, and not used to train anybody's model.",
          "Who else touches them: the companies listed as sub-processors, each for one named job, each under its own processing terms. That list is generated from the product itself rather than maintained by hand, so a feature that sends data somewhere new cannot ship before the list says so. We will not add a sub-processor without the list changing, which is visible here.",
          "Where they are: in the region the studio chose when its workspace was created — the European Union if it chose that — apart from sign-in records, which are held separately. Transfers out of the EEA are covered per sub-processor and named in the list. Four Degree Labs is itself established in the United Arab Emirates, so our own staff reading a workspace to support it is a transfer as well as a support session; it is time-boxed, reasoned, announced and recorded, as set out below.",
          "Security: access to a workspace is by passkey or a one-time code, never a password. Staff access is per person and per role. Anybody from our side entering a workspace to help is time-boxed, has to give a reason, is announced to the workspace, and is on the record.",
          "If something goes wrong: we tell the studio without undue delay and give it what it needs to make its own notification, because the notification is the studio's to make.",
          "Getting them back or ending this: the studio can export everything at any time, and closing a workspace exports before erasing. Erasure is derived from the same declarations the product is built from, so it covers everything rather than a list somebody remembered to update.",
          "Somebody exercising a right — a copy, a correction, an erasure — asks the studio, and the studio can do all three from inside the product. Where they ask us, we pass it to the studio rather than acting on it ourselves.",
        ].join("\n\n"),
        mustAccept: ["owner"],
      },
    ],
    /*
      ⚠️ THE WHOLE LIST, AND A GUARD CHECKS IT AGAINST WHAT THE CODE ACTUALLY
      REACHES. An entry nothing calls fails; a call to somebody with no entry
      fails. That is what stops this going stale the first time a feature is
      added, which is the failure every hand-maintained sub-processor list has.

      ⚠️ AND THEIR CERTIFICATIONS ARE LINKED, NEVER COPIED. Cloudflare's and
      Google's lists change on their schedule; a copy here is wrong the first
      time one lapses or is added, and it is wrong in the worst possible place —
      a compliance claim we made about somebody else. We hold no certification of
      our own and this file does not imply one.
    */
    protection: {
      /*
        ⚠️ TWO CONTROLLERS, AND CONFLATING THEM IS THE MOST CONSEQUENTIAL MISTAKE
        AVAILABLE HERE. We control the account and the billing relationship with
        a studio. The STUDIO controls what it records about the people it
        coaches, and for that we are its processor — so a client's rights run
        against their studio, and we act on the studio's instruction.
      */
      controller: "Four Degree Labs, Abu Dhabi, United Arab Emirates, controls accounts and its own billing. Each studio controls what it records about the people it coaches; for that data Four Degree Labs is the studio's processor and acts on the studio's instruction.",
      contact: "legal@fourdegreelabs.com",
      assessment: {
        /*
          ⚠️ YES, AND THE REASON IS THE PRODUCT RATHER THAN ITS SIZE. Article 35
          asks about likelihood of high risk, and special-category data about
          identifiable people on a large scale is its own trigger — this stores
          weight, sleep, injuries, medication and photographs of bodies.
        */
        required: true,
        note: [
          "Health data about identifiable people, including photographs of their bodies, is special category under Article 9. An assessment is owed before the first paying studio and is not complete.",
          /*
            ⚠️ AND THE ESTABLISHMENT IS PART OF THE ANSWER, not a footnote. Four
            Degree Labs is in the UAE, which is outside the EEA and holds no
            adequacy decision — so serving people in the EU raises Article 27
            (an EU representative) on top of the transfer question, and staff
            reading a workspace from Abu Dhabi is itself a transfer even when
            every byte sits in an EU database. Naming it here is what stops it
            being discovered by somebody else.
          */
          "Four Degree Labs is established in the United Arab Emirates, outside the EEA and with no adequacy decision. Two things follow and neither is settled: whether Article 27 requires an EU representative, and that access by our own staff from the UAE is a transfer in its own right, separate from where the data is stored.",
        ].join(" "),
      },
      subprocessors: [
        {
          id: "cloudflare",
          name: "Cloudflare, Inc.",
          role: "Runs the product and stores everything in it — compute, the databases, the object store, the key-value cache and the durable objects.",
          receives: ["identity", "contact", "credential", "financial", "usage", "content", "health", "biometric"],
          where: "Workers run at the point of presence nearest the request. Databases and object stores are placed in the region a studio chose.",
          safeguard: "dpf",
          terms: "https://www.cloudflare.com/cloudflare-customer-dpa/",
          trust: "https://www.cloudflare.com/trust-hub/compliance-resources/",
        },
        {
          /*
            ⚠️ THE ONLY MAILER, AND THE ID IS THE LANE RATHER THAN THE INTENTION.
            This entry said `cloudflare-email` while the runtime could be
            configured with two other providers, so the disclosure named a
            company that would not have received the message and did not name the
            one that would. `MAIL_LANES` in `@one/kernel` is now what this must
            match, and `runtime/test/mail.test.ts` pins that constant to the
            provider registry — so a second mailer cannot be added without
            appearing here.
          */
          id: "resend",
          name: "Resend, Inc.",
          role: "Sends the messages this product sends: a sign-in code, an invitation, a notification somebody asked to be emailed.",
          receives: ["identity", "contact"],
          where: "United States, on infrastructure in the customer's chosen region.",
          safeguard: "dpf",
          terms: "https://resend.com/legal/dpa",
          trust: "https://resend.com/legal/security",
        },
        {
          id: "workers-ai",
          name: "Cloudflare Workers AI",
          /*
            ⚠️ IT CAME OFF THIS LIST AND CAME BACK, WHICH IS THE MECHANISM
            WORKING. The catalogue held three Gemini models and nothing else, so
            the disclosure check refused a manifest naming a company that
            received nothing. Adding two Workers AI models to the catalogue is
            what put it back — at the moment it became true, in the same commit,
            without anybody remembering to.
          */
          role: "Runs the text models a workspace may choose instead of Google's. Never given a photograph: these models price no image, so nothing that sends one can be pointed at them.",
          receives: ["content", "usage"],
          where: "Cloudflare's inference network. Not guaranteed to be EU-only.",
          safeguard: "dpf",
          terms: "https://www.cloudflare.com/cloudflare-customer-dpa/",
          trust: "https://www.cloudflare.com/trust-hub/compliance-resources/",
        },
        {
          id: "gemini",
          name: "Google (Gemini API)",
          /*
            ⚠️ THIS ONE RECEIVES HEALTH DATA, and that is why it is worth its own
            sentence rather than a line in a list. A photograph of a meal, a
            label, a lab report or a body goes to it. Nothing is stored there by
            us and nothing is used for training under the paid terms — which is a
            claim about THEIR terms, linked below rather than restated here.
          */
          role: "Reads photographs and drafts text for the features that need a vision model: a meal, a label, a lab report, a body scan.",
          receives: ["content", "health", "biometric"],
          where: "Google's infrastructure.",
          safeguard: "sccs",
          terms: "https://ai.google.dev/gemini-api/terms",
          trust: "https://cloud.google.com/security/compliance",
        },
        {
          id: "stripe",
          name: "Stripe, Inc.",
          /*
            ⚠️ BETWEEN US AND A STUDIO ONLY. A studio's own customers pay the
            studio, on a page the studio owns, with a link the studio configured
            — we open an intent and learn the outcome. There is no Stripe Connect
            here and no card number ever reaches this infrastructure, which is the
            strongest single sentence in this whole declaration.
          */
          role: "Takes a studio's payment for its own plan and its credits. Never involved in what a studio charges the people it coaches.",
          receives: ["identity", "contact", "financial"],
          where: "United States and Ireland.",
          safeguard: "dpf",
          terms: "https://stripe.com/legal/dpa",
          trust: "https://stripe.com/docs/security",
        },
        {
          id: "openfoodfacts",
          name: "Open Food Facts",
          /*
            ⚠️ IT RECEIVES A BARCODE OR A SEARCH TERM AND NOTHING ELSE. No account,
            no workspace, nobody's name — which is why `receives` says `usage`
            rather than anything about a person, and the lookup lane is built so
            that no other value could reach it.
          */
          role: "Answers a barcode or a food search when a studio has not entered the food itself.",
          receives: ["usage"],
          where: "France.",
          safeguard: "eea",
          terms: "https://world.openfoodfacts.org/terms-of-use",
        },
        {
          id: "wger",
          name: "wger",
          role: "Answers a movement search when a studio would rather not type one out.",
          receives: ["usage"],
          where: "Germany.",
          safeguard: "eea",
          terms: "https://wger.de/en/software/terms-of-service",
        },
      ],
    },
    impersonation: { maxMinutes: 30, announce: true },
    auditRetentionDays: 730,
  },

  /*
    ⚠️ WHAT A `json` COLUMN ACTUALLY HOLDS. Without this the field name is a
    comment and the column takes any shape — see `WEEKS_SHAPE`.
  */
  schemas: { "programme.weeks": WEEKS_SHAPE },

  /*
    ⚠️ THE TWO SERVERS THIS PRODUCT TALKS TO, BY HOST. Neither takes a
    credential; both are public catalogues. Declaring the host rather than a base
    URL is what stops a barcode somebody scanned from becoming part of an
    address — see `@one/kernel`'s `lookup.ts`.
  */
  services: {
    openfoodfacts: { host: "world.openfoodfacts.org", label: "Open Food Facts" },
    wger: { host: "wger.de", label: "wger exercise database" },
  },

  /*
    ⚠️ WHAT A STUDIO CHOOSES ABOUT ITSELF, and every one of these is a decision
    a coach makes differently from the studio next door. The three branding keys
    arrive whether they are declared here or not, because the sign-in screen
    wears them before there is a session to resolve these with.
  */
  settings: KOVA_SETTINGS,
  collections: [clients, movements, programmes, workouts, sets, foods, portions, entries, checkins, goals, bookings, articles, supplements, doses, labs, assignments, alternatives, swaps,
    fasts, photos, mealChoices, scans, releases],

  notifications: {
    "workspace.created": {
      category: "service", tone: "success", icon: "sparkle",
      title: "{slug} is ready", link: { to: "inbox" }, roles: ["owner"],
    },
    "plan.chosen": {
      category: "billing", tone: "info", icon: "card",
      title: "You chose {planId}", link: { to: "inbox" }, roles: ["owner"],
    },
    /*
      ⚠️ THE THREE `theirs` ENTRIES BELOW ARE THE STUDIO WRITING TO ITS OWN
      CUSTOMER, which is why they may be rephrased and the two above them may
      not. "You chose {planId}" is us writing to the studio about the studio's
      own bill; a business that could reword its own arrears notice could make
      one read as though nothing were wrong, for staff who would then not act.
    */
    "package.granted": {
      category: "billing", tone: "success", icon: "gift", theirs: true,
      title: "{days} days added", link: { to: "inbox" }, roles: ["owner", "client"],
    },
    "support.session": {
      category: "service", tone: "warning", icon: "shield",
      title: "Somebody from support was in your workspace",
      body: "Why: {reason}",
      link: { to: "inbox" }, roles: ["owner"],
    },
    /* ⚠️ The one that matters: a person is told what they are meant to do. */
    "programme.published": {
      category: "activity", tone: "success", icon: "check", theirs: true,
      title: "You have a new programme",
      body: "Your coach has published what you are doing next. Open it when you are ready.",
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
      category: "activity", tone: "success", icon: "check", theirs: true,
      title: "Your coach replied",
      body: "There is an answer waiting on your last check-in.",
      link: { to: "collection", collection: "checkin" },
      roles: ["client"],
    },
    "milestone.earned": {
      category: "activity", tone: "success", icon: "sparkle",
      title: "{title}", link: { to: "inbox" },
      roles: ["owner", "trainer", "client"],
    },
  },

  operations: [
    publish, complete, answer, attention, report, publishArticle, feed, usage, copyWeek,
    decideSwap, forgetClient,
    draftPlan, parseFood, draftMeals, snapMeal, labelReader, labExtract,
    exerciseGuide, supplementGuide, clientSummary, draftArticle, drawImage, bodyScan,
    fastNow, wellness, today, prefill, compare, selfRegister, rosterAnalytics,
    barcode, foodSearch, movementSearch, player, shopfront, scanGuide,
  ],

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

  /*
    ⚠️ THE RATES ARE THE PROVIDER'S PRICE LIST AND THE PROMPTS ARE KOVA'S. A
    catalogue held by the platform would have to be edited for every product;
    prompts held by the platform would make every product the same one.

    ⚠️ AND THE DAILY CEILING IS PER PERSON, NOT PER STUDIO. A studio-wide balance
    is spent by whoever asks first — one coach looping a draft empties it before
    anybody else opens the product, and the only signal is a bill.
  */
  ai: KOVA_AI,
  filePurposes: {
    avatar: { label: "Photo", accept: ["image/jpeg", "image/png"], maxBytes: 4_000_000, permission: "client:write" },
    demo: { label: "Movement demonstration", accept: ["video/mp4", "image/jpeg", "image/png"], maxBytes: 20_000_000, permission: "movement:write" },
    cover: { label: "Article cover", accept: ["image/jpeg", "image/png"], maxBytes: 8_000_000, permission: "article:write" },
    /* ⚠️ Its own purpose: a photograph of somebody's body is not a meal photo,
       and a purpose is a path segment as well as a policy. */
    "body-photo": { label: "Progress photograph", accept: ["image/jpeg", "image/png"], maxBytes: 12_000_000, permission: "photo:write" },
    /*
      ⚠️ A PHOTOGRAPH TAKEN TO BE READ IS STILL A FILE THE WORKSPACE HOLDS. It
      goes through the ordinary upload — stripped of the metadata a phone
      attaches, counted against the storage ceiling, erased with the workspace —
      and the reading names it by id. A lane that took bytes on the generation
      request would be a second way into the store with none of that.
    */
    meal: { label: "Meal photograph", accept: ["image/jpeg", "image/png"], maxBytes: 8_000_000, permission: "portion:write" },
    label: { label: "Nutrition label", accept: ["image/jpeg", "image/png"], maxBytes: 8_000_000, permission: "food:write" },
    /* ⚠️ Its own purpose rather than sharing `report`: a lab result is the most
       sensitive thing this product stores, and a purpose is a path segment. */
    "lab-report": { label: "Lab report", accept: ["image/jpeg", "image/png"], maxBytes: 12_000_000, permission: "lab:write" },
  },

  /*
    ⚠️ ONE SWEEP, AND WHAT IT DOES IS THE PRODUCT'S. The platform works out WHO
    has lapsed and how far down the ladder they have got; what "archive" means
    for a client record is a thing only this app can know. The seam is the whole
    reason the ladder is shared and the consequence is not.
  */
  jobs: [
    {
      id: "lapsed-clients",
      summary: "Act on clients whose access has run out, by the studio's own rule.",
      every: "daily",
      scope: "tenant",
      /* ⚠️ Bounded, so a large studio catches up over runs rather than timing out. */
      batch: 200,
      async handler(ctx) {
        const db = ctx.bind.db as SqlHandle;
        const tenantId = ctx.tenantId!;

        /*
          ⚠️ FROZEN WHILE THE STUDIO IS BEHIND ON ITS OWN BILL. A studio the
          platform has suspended must not be quietly shredding a roster it can no
          longer see — whatever is going on between us and them, it is not a
          reason to act on their clients' records on their behalf.
        */
        const sub = await readSubscription(db, tenantId);
        if (laddersFrozen(sub)) return { done: 0, more: false, idle: 1 };

        /*
          ⚠️ A STUDIO THAT HAS CONFIGURED NO LADDER IS NOT SWEPT AT ALL, and it
          says so rather than reporting a clean run over nothing. Without the
          skip, every studio on the deployment pays for a scan of its whole
          customer table every day to decide that nobody is anywhere — and a
          report of "0 done" cannot be told from a sweep that found nothing.
        */
        const ladder = await readLadder(db, tenantId);
        if (Object.keys(ladder).length === 0) return { done: 0, more: false, idle: 1 };

        const lapsed = await lapsedAcross(db, tenantId, ctx.now(), ctx.batch + 1);
        const batch = lapsed.slice(0, ctx.batch);

        let done = 0;
        for (const who of batch) {
          const rung = rungFor(who.days, ladder);
          /*
            ⚠️ THE FURTHEST RUNG, AND THE ACTION IS IDEMPOTENT. A sweep that
            missed a week must land somebody where they should be today rather
            than walking them through every rung it skipped — and it will see
            them again tomorrow.
          */
          if (rung === "archive") {
            await db.run(
              `UPDATE ${T.clients} SET deleted_at = COALESCE(deleted_at, ?), updated_at = ? WHERE tenant_id = ? AND id = ?`,
              ctx.now(), ctx.now(), tenantId, who.subjectId,
            );
            done++;
          } else if (rung === "delete") {
            /*
              ⚠️ ARCHIVING KEEPS THE SEAT AND DELETING FREES ONE, which is the
              difference a studio is actually choosing between. An archived
              client is still somebody they coach and are not coaching right now.
            */
            await db.run(`DELETE FROM ${T.clients} WHERE tenant_id = ? AND id = ?`, tenantId, who.subjectId);
            done++;
          }
          /*
            ⚠️ `read_only` AND `blocked` NEED NO WRITE AT ALL. Access running out
            already withholds what was sold — a customer flag resolves off the
            moment the days do. Writing a second copy of that state is how two
            answers to "may they log this" come to disagree.
          */
        }
        return { done, more: lapsed.length > ctx.batch };
      },
    },
  ],

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
      version: "0.29.0",
      at: "2026-08-10",
      notes: [
        "The terms, the privacy notice and the processing agreement are now actually asked for: nothing new can be recorded until whoever is recording it has agreed to them. Reading what is already there is never withheld.",
      ],
    },
    {
      version: "0.28.0",
      at: "2026-08-10",
      notes: [
        "Choose which AI model runs each feature — Google's or Cloudflare's — and see which one is running now and who decided it.",
        "Before you pick a region, read exactly which models each one permits. Storing your records in the EU and where a generation is processed are two different questions, and both are now answered on the page.",
      ],
    },
    {
      version: "0.27.0",
      at: "2026-08-10",
      notes: [
        "Choose the European Union when you create your studio, and your clients' records are stored there — in a different database, not a label on the same one.",
        "The company behind Kova is named: Four Degree Labs, Abu Dhabi. Data-protection questions go to legal@fourdegreelabs.com.",
      ],
    },
    {
      version: "0.26.0",
      at: "2026-08-10",
      notes: [
        "See exactly which companies receive anything held here, what each one receives, where they process it and under what terms — without signing in.",
        "The processing agreement your studio enters with us is now a document you can read and accept, rather than a paragraph describing one.",
        "If you run the studio, you can produce the full record of what is processed here and why, on demand, computed from the product rather than written down beside it.",
      ],
    },
    {
      version: "0.25.0",
      at: "2026-08-10",
      notes: [
        "Read the terms and the privacy notice in full before agreeing to them. They were asked about by name and their text was nowhere.",
        "Reading a photograph, drafting a plan, parsing a meal, summarising a month and generating an image all say that they worked. They spent credits and answered in silence.",
      ],
    },
    {
      version: "0.24.0",
      at: "2026-08-10",
      notes: [
        "See what was done in your studio, by whom, and how long that record is kept.",
        "If somebody from support needs to work inside your studio, it is bounded, you are told why, and it is on the record either way.",
      ],
    },
    {
      version: "0.23.0",
      at: "2026-08-10",
      notes: [
        "Reading a photograph or drafting from a sentence now says it worked. Five of them spent credits and answered with nothing.",
      ],
    },
    {
      version: "0.22.0",
      at: "2026-08-10",
      notes: [
        "Read the help for what you are looking at, without signing in — it was written, checked and reachable from nowhere.",
        "Read the terms and the privacy notice before signing up, and see which ones you have agreed to. Agreeing is recorded against the version, so new terms are asked about again rather than assumed.",
        "See what changed in each version of the product, and which version you are on.",
        "Notification preferences no longer offer a channel nothing delivers.",
      ],
    },
    {
      version: "0.21.0",
      at: "2026-08-10",
      notes: [
        "Scan a barcode, or search a public food database, when the studio has not entered something. Nothing is saved until somebody chooses it.",
        "Find a movement in a public catalogue rather than typing it out.",
        "Work through a session set by set on a phone, with what you lifted last time beside each movement — read from a previous day, never from the set you just did.",
        "Log a set with no signal and have it arrive once when you surface. A queued write that is replayed no longer makes two sets.",
        "Be talked through a body scan hands-free: the poses in order, with the words to say and how long to hold each.",
        "Show what your studio offers to somebody who has not signed in — your name, what you sell and for how much, and nothing about who you coach.",
        "Discount your own prices with a code you control. The use is spent when a payment is confirmed, not when somebody looks at a price.",
        "Change the words your studio sends and sign them. Ours stay behind anything you leave blank, and the messages we send you about your own bill are not yours to reword.",
        "Move between the studios you belong to without signing in again.",
        "Arrange what you see first, so the thing you check hourly is at the top.",
      ],
    },
    {
      version: "0.20.0",
      at: "2026-08-10",
      notes: [
        "See what moving to another plan would gain, lose and strain — against the prices this deployment actually sells, not the ones it shipped with.",
        "Buy credits separately from your plan. Running out of them is not a reason to sell you a bigger product.",
        "One place to change a card, read an invoice or cancel — and where billing is not set up, a sentence saying so rather than a link that opens nothing.",
        "A coach can ask to be released from a client, with a reason. The owner decides, and the request is a record either way.",
        "Let people add themselves to your studio, if you want that. It is off until you turn it on, it stops at a number you set, and it tells a stranger nothing about who you already coach.",
        "See how the studio is doing as a business: who is on the roster, who is actually training, who joined, who left, and whose access runs out soon.",
      ],
    },
    {
      version: "0.19.0",
      at: "2026-08-10",
      notes: [
        "Open the app and see what today asks of you — the session, the meals, anything outstanding — on one screen.",
        "Run a fast and see which phase you are in. It counts from when you started, stops when you stop, and the phases describe what is ordinary rather than claiming anything medical.",
        "One number for how the week went, and it says what it was computed from. Below two things to go on it declines to give one at all: a score from a single good night's sleep is worse than no score.",
        "A check-in comes prefilled with what the app already knows — sessions, days logged, your last weight. It fills nothing in and submits nothing; reading the week back is the point.",
        "Keep progress photographs and compare two of them. The same pose only, because two angles show a change that is not there.",
        "Estimate body composition from a photograph. It says when it is guessing — which for a photograph is most of the time — and it never saves anything without you.",
        "Coaches can offer alternatives within a meal, so a plan survives a morning with no eggs. Clients pick one, and the choice is recorded rather than guessed at from what was logged.",
        "Clients can upload their own meal photographs, labels and progress photos. They could not before, which quietly made every camera feature unreachable by the person it was built for.",
      ],
    },
    {
      version: "0.17.0",
      at: "2026-08-10",
      notes: [
        "Photograph a meal and get it back as foods and portions to check. Amounts read off a photograph are guesses, and it says which ones are.",
        "Photograph a nutrition label and get the food. Anything the label does not carry is left blank rather than filled in with something plausible.",
        "Photograph a lab report and get the values, transcribed — including the reference range exactly as printed, because ranges differ between laboratories. It reads; it does not interpret, and a digit it cannot make out is marked rather than guessed.",
        "Draft an eating plan from a sentence, the way you already draft a training one.",
        "Draft how-to text for a movement, and guidance on a supplement with what the evidence actually supports and who should not take it.",
        "Read a summary of somebody's month instead of assembling it from four screens.",
        "Draft an article for your feed, and generate a picture to go with it. The picture is kept in your library, so using it again costs nothing.",
        "None of these saves anything. Every one comes back for you to read, edit and keep — a generated row filed under your name is one nobody approved.",
      ],
    },
    {
      version: "0.16.0",
      at: "2026-08-10",
      notes: [
        "Write down which movement stands in for which, and WHY — \"instead of a back squat, if the bar hurts your shoulder\". The client reads them; the coach writes them.",
        "Ask to swap a movement you cannot do today, and get an answer. Allowing one means saying what to do instead — \"yes\" on its own leaves somebody standing in a gym.",
        "Before renaming or removing a movement, see everything that depends on it: sets logged, plans, stand-ins, swap requests.",
        "Repeat a week with progression — a percentage on the loads, a count on the reps — rather than retyping it. Loads round to something you can actually put on a bar.",
        "Group movements into supersets and circuits, and log what was done as rounds.",
        "Record training that was not prescribed. Somebody who played five a side on Thursday did training.",
        "See what was changed on somebody's record, by whom, and when.",
        "Erase somebody entirely, on request, with their name typed to confirm — everything that hangs off them, and the record of it, in one act.",
      ],
    },
    {
      version: "0.15.0",
      at: "2026-08-10",
      notes: [
        "Sign-in codes and notifications are sent by mail now, through whichever provider the deployment is configured with — and a deployment configured with none sends nothing and says so rather than reporting a delivery.",
        "There is a button that actually sends a test message, because a screen that says Saved has told you nothing about whether mail works.",
        "Prescribe supplements with a dose and a reason. The reason is required: a prescription nobody can review is a list.",
        "A client records taking them, day by day, and cannot prescribe anything.",
        "Ask for a lab test and file the report against the same record. What it said is written up by a coach; the client reads it.",
        "Say which coach works with which client, and change it. A client sees who theirs are, and the same coach cannot be added twice.",
      ],
    },
    {
      version: "0.14.0",
      at: "2026-08-10",
      notes: [
        "One place for what is the same behind every product: the payment keys, the sign-in widget, the model prices. Set once, not once per app.",
        "See what each model costs, where that number came from, and what this app shipped expecting — so a price that has moved is visible rather than quietly wrong.",
        "Correct a price without a release. Until somebody does, the number the app shipped with is what is charged.",
        "A price of zero is refused: it is not free, it is unmetered, and the provider still invoices.",
        "A price cannot be set for a model this product does not use — there would be nothing to ask it.",
      ],
    },
    {
      version: "0.13.0",
      at: "2026-08-10",
      notes: [
        "Configure the deployment from one screen: every key it reads, where each value came from, and whether it is set.",
        "A key that is typed wrong is refused rather than saved, so a setting that appears to be there always is.",
        "Secrets can be set and can never be read back. Whether one is configured is the question a screen actually answers.",
        "The payment provider's test and live keys are held at once, so going live is a switch rather than a re-paste — and live mode with only a test key is honestly not chargeable.",
        "Whether we can take money is now read from that configuration rather than declared, so nobody is held to a setup step over a provider we never configured.",
      ],
    },
    {
      version: "0.12.0",
      at: "2026-08-10",
      notes: [
        "Whoever runs the deployment can see every studio on it and what each one is on.",
        "Put a studio on a plan without a payment, with a reason — and it stops any arrears clock that was already running.",
        "Change one studio's ceilings without editing the plan everybody else is on, in either direction, and clear it again to put them back.",
        "Give a studio credits. The same intent twice is one grant, not two.",
        "Close the deployment for work — read-only or fully — with something to say. The door it is set from stays open, because the way out is a request.",
        "None of that is reachable from inside a studio, including by its owner.",
      ],
    },
    {
      version: "0.11.0",
      at: "2026-08-10",
      notes: [
        "Book somebody in, move it, and record whether they turned up — a session that was missed is kept rather than deleted, because that is the thing worth seeing.",
        "A coach cannot be booked twice over. An overlapping appointment is refused rather than quietly moved, and an hour that was cancelled is free again.",
        "A client sees when they are booked in, and only their own.",
        "Write an article for the people you coach, give it a cover without leaving the product, and publish it when it is ready.",
        "A draft is a draft: it is not in anybody's feed, and there is no way round to it.",
        "An empty article cannot be published — it would reach every client you have.",
      ],
    },
    {
      version: "0.10.0",
      at: "2026-08-10",
      notes: [
        "Draft a training plan from a sentence and edit it, rather than starting from a blank week.",
        "A client can say what they ate in words and get it back as foods and portions to check.",
        "Nothing is saved for you: a draft comes back to read and change, because a plan nobody approved should not arrive under your name.",
        "See what your credits were spent on, by whom, and on what — including the attempts that failed and cost nothing.",
        "Say a generation was wrong. It is recorded against that generation, which is the only way the models we use ever get reconsidered.",
        "Nobody can spend the studio's credits without limit: there is a ceiling per person per day, so one afternoon cannot empty the balance.",
      ],
    },
    {
      version: "0.9.0",
      at: "2026-08-10",
      notes: [
        "Upload photographs and demonstration video, reuse what you have already uploaded, and see how much of your storage is spoken for.",
        "Give a client a face. A photograph on somebody's record is checked against what the record accepts, so a video cannot become a portrait.",
        "A file something is still using cannot be deleted — you are told where it is used instead of finding out from a broken image later.",
        "What a phone attaches to a photograph — where it was taken, on what, and when — is removed before anything is stored.",
        "Closing a studio now takes its files with it, and says so rather than reporting a clean sweep over bytes it could not reach.",
      ],
    },
    {
      version: "0.8.0",
      at: "2026-08-10",
      notes: [
        "Decide what happens to a client whose access ran out, and when — read-only, blocked, archived, or removed.",
        "Archiving or removing somebody cannot be set sooner than a fortnight after they lapse, because a card expiring is not a decision to leave.",
        "Nothing happens to anybody while your own studio is behind on its bill.",
        "Issue a code that tops somebody's access up, with a number of uses and a date it stops working.",
        "A code adds days to access somebody already has; it never creates access on its own.",
      ],
    },
    {
      version: "0.7.0",
      at: "2026-08-10",
      notes: [
        "Take payment for a package on your own provider, in your own country — or confirm a payment you took any other way, by hand.",
        "A client can say they want a package and be sent to your page to pay for it. Nothing is granted until somebody says it was paid.",
        "Confirming twice, or your provider telling us twice, never buys it twice.",
        "See what has been asked for and what has been paid for; a client sees only their own.",
        "A once-only package is refused before anybody is sent to pay, rather than after.",
      ],
    },
    {
      version: "0.6.0",
      at: "2026-08-10",
      notes: [
        "Design what you sell: a block of days and what it lets a client do. The builder tells you when a package sells something it also switches off.",
        "Give somebody access, see how many days they have left per thing they hold, and read what they have been given.",
        "Make an exception for one client without changing the package — and clear it to put them back on it.",
        "Correct somebody's remaining days by hand, with a reason, recorded as a correction rather than as a purchase.",
        "A client whose access has run out keeps everything they ever logged and cannot add more until they renew.",
        "Somebody whose access is nearly up now appears on your list before it happens.",
      ],
    },
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

  /*
    ⚠️ `billing:operate` WAS A DEPLOYMENT KEY GRANTED TO A WORKSPACE OWNER. Every
    operation behind it — the payment dead letter, the scheduler's run table —
    reads the WHOLE deployment, so holding it inside one workspace was a
    cross-tenant read with a screen in front of it. It is `platform:operate` now,
    which is granted by the operator role on the operator door and by nothing
    else.
  */
  retired: { "billing:operate": "folded into platform:operate — see the note above" },

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
