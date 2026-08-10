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

import {
  UNLIMITED,
  cache, collection, defineApp, defineBindings, field,
  objects, operation, s, sql,
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

/* ------------------------------------------------------------ operations --- */

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
    const row = await ctx.bind.db.first<{ id: string; client: string | null }>(
      `SELECT id, client FROM programmes WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      input.programmeId, ctx.tenantId,
    );
    if (!row) ctx.fail("platform.not_found", { field: "programmeId" });
    /*
      ⚠️ A TEMPLATE CANNOT BE PUBLISHED, because there is nobody to publish it
      to. Silently making it current would leave a plan somebody is "following"
      that belongs to no one.
    */
    if (!row!.client) ctx.fail("coaching.programme_has_no_client");

    /* One current plan per person: the previous one steps down in the same breath. */
    await ctx.bind.db.run(
      `UPDATE programmes SET active = 0 WHERE tenant_id = ? AND client = ?`,
      ctx.tenantId, row!.client,
    );
    await ctx.bind.db.run(`UPDATE programmes SET active = 1, updated_at = ? WHERE id = ?`, ctx.now(), row!.id);
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
      `SELECT id FROM workouts WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      input.workoutId, ctx.tenantId,
    );
    if (!row) ctx.fail("platform.not_found", { field: "workoutId" });
    await ctx.bind.db.run(`UPDATE workouts SET docstatus = 1, updated_at = ? WHERE id = ?`, ctx.now(), row!.id);
    return { completed: row!.id };
  },
});

/* ------------------------------------------------------------------- app --- */

const STAFF = [
  "client:read", "client:write", "movement:read", "movement:write", "programme:read", "programme:write",
  "workout:read", "workout:write", "set:read", "set:write", "entry:read", "entry:write",
  "inbox:read", "file:read", "file:write", "guide:read", "milestone:read", "commerce:read",
];

export const kova = defineApp({
  id: "kova",
  name: "Kova",
  stripeMetadataPrefix: "kova",
  manifestVersion: "0.1.0",
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
    ],
    roles: {
      owner: [...STAFF, "workspace:create", "workspace:close", "billing:manage", "billing:operate", "commerce:manage"],
      trainer: [...STAFF, "workspace:create"],
      /* ⚠️ The front desk sees people and bookings, and prescribes nothing. */
      assistant: ["client:read", "workout:read", "inbox:read", "guide:read", "milestone:read", "commerce:read", "file:read"],
      /*
        ⚠️ A CLIENT WRITES THEIR OWN RECORD AND READS WHAT WAS PRESCRIBED. The
        row scope does the narrowing — `session`, `set` and `entry` are subject
        scoped, so a caller who IS a customer can only ever reach their own.
      */
      client: [
        "programme:read", "movement:read", "workout:read", "workout:write", "set:read", "set:write",
        "entry:read", "entry:write",
        "inbox:read", "guide:read", "milestone:read", "file:read", "commerce:read",
      ],
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
        entitlements: { clients: 3, storedBytes: 2_000_000_000, training: true },
      },
      {
        id: "studio",
        name: "Studio",
        price: { minor: 2900, currency: "USD" as Currency },
        period: "month",
        trialDays: 14,
        entitlements: { clients: 25, storedBytes: 20_000_000_000, training: true },
      },
      {
        id: "max",
        name: "Max",
        price: { minor: 9900, currency: "USD" as Currency },
        period: "month",
        trialDays: 14,
        entitlements: { clients: UNLIMITED, storedBytes: 100_000_000_000, training: true },
      },
    ],

    /*
      ⚠️ THE RAIL IS OPEN AND NOTHING IS SOLD THROUGH IT YET. A studio sells
      access to its own clients, and that is version 0.3 — declaring the rail now
      is honest (the surface exists, empty) and declaring flags for it would not
      be, because nothing gates them.
    */
    customerRail: true,
    customerFlags: {},
    seats: { counts: ["owner", "trainer", "assistant"] },
  },

  governance: {
    legal: [
      { id: "terms", version: "2026-01-01", mustAccept: ["owner"] },
      { id: "privacy", version: "2026-01-01", mustAccept: ["owner", "trainer", "assistant", "client"] },
    ],
    impersonation: { maxMinutes: 30, announce: true },
    auditRetentionDays: 730,
  },

  collections: [clients, movements, programmes, workouts, sets, entries],

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
    "milestone.earned": {
      category: "activity", tone: "success", icon: "sparkle",
      title: "{title}", link: { to: "inbox" },
      roles: ["owner", "trainer", "client"],
    },
  },

  operations: [publish, complete],

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
    "fifty-sessions": {
      title: "Fifty workouts",
      icon: "check",
      rule: { kind: "count", event: "workout.completed", reaches: 50 },
      roles: ["client"],
    },
  },

  releases: [
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
