/**
 * KOVA — a personal-training platform, as a manifest and nothing else.
 *
 * ⚠️ THIS FILE IS THE WHOLE PRODUCT'S INFRASTRUCTURE, WHICH IS TO SAY IT HAS
 * NONE. No router, no schema, no migration, no gate call, no audit call, no
 * settings screen, no notification wiring, no billing code, no erasure cascade —
 * every one of those is derived from what is below. The previous Kova was a
 * worker, a database, a bucket, a domain binding, a provisioning workflow and
 * about fifteen thousand lines of platform. This is the same product's
 * declarations.
 *
 * ⚠️ AND THE SENSITIVE FACTS ARE NOT KOVA'S TO KEEP. A client's conditions,
 * injuries and medication are special categories: they live in the vault, behind
 * consent and a recorded grant, where erasure can prove it reached them (D11).
 * A previous version held them in an ordinary column, which looked identical to
 * every other column and was outside all three.
 */

import {
  collection, defineApp, field, notification, operation, setting, type AppSpec,
} from "@engine/kernel";

/* ------------------------------------------------------------ collections --- */

/**
 * ⚠️ A CLIENT IS A RECORD OF THE STUDIO'S, NOT A PERSON'S ACCOUNT. The person
 * may also be a member — that is how they sign in and see their own logbook —
 * but the coaching record belongs to the business that keeps it, and that is
 * what decides where it goes when either of them leaves.
 */
const client = collection({
  id: "client",
  label: { one: "Client", many: "Clients" },
  scope: { of: "tenant" },
  permission: "client",
  retention: null,
  onClose: { then: "purge" },
  quota: "clients",
  offline: "cache",
  fields: {
    name: field.text({ label: "Name", required: true, holds: "identity", max: 120 }),
    email: field.email({ label: "Email", holds: "contact" }),
    /* ⚠️ Vault-backed: a health fact in a product table is outside consent,
       outside the grant log and outside crypto-shredding (D11). */
    conditions: field.long({ label: "Conditions and injuries", holds: "sensitive", vault: true }),
    startedOn: field.day({ label: "Started", holds: "none" }),
    goal: field.text({ label: "Goal", holds: "none", max: 200 }),
  },
});

const plan = collection({
  id: "plan",
  label: { one: "Plan", many: "Plans" },
  scope: { of: "tenant" },
  permission: "plan",
  retention: null,
  onClose: { then: "purge" },
  quota: "plans",
  versioned: true,
  offline: "cache",
  fields: {
    title: field.text({ label: "Title", required: true, holds: "none", max: 120 }),
    forClient: field.ref({ label: "For", to: "client", holds: "none" }),
    weeks: field.json({ label: "Weeks", holds: "none" }),
    published: field.bool({ label: "Published", holds: "none" }),
  },
});

/**
 * ⚠️ SUBJECT-SCOPED, SO IT IS THE PERSON'S OWN BY CONSTRUCTION. The generated
 * verbs filter by whoever is asking; a coach seeing a client's history is a
 * different question with a different permission, and it is declared below as an
 * operation rather than left to a handler remembering a `WHERE`.
 */
const workoutLog = collection({
  id: "workout-log",
  label: { one: "Logged set", many: "Logged sets" },
  scope: { of: "subject", column: "loggedBy" },
  permission: "log",
  retention: null,
  onClose: { then: "purge" },
  offline: "queue",
  fields: {
    loggedBy: field.text({ label: "Logged by", required: true, holds: "identity" }),
    exercise: field.text({ label: "Exercise", required: true, holds: "none", max: 120 }),
    reps: field.number({ label: "Reps", holds: "usage", min: 0, max: 1000 }),
    weightKg: field.number({ label: "Weight", holds: "usage", min: 0, max: 1000 }),
    onDay: field.day({ label: "Day", required: true, holds: "usage" }),
  },
});

const meal = collection({
  id: "meal",
  label: { one: "Meal", many: "Meals" },
  scope: { of: "subject", column: "loggedBy" },
  permission: "meal",
  retention: null,
  onClose: { then: "purge" },
  offline: "queue",
  fields: {
    loggedBy: field.text({ label: "Logged by", required: true, holds: "identity" }),
    what: field.text({ label: "What", required: true, holds: "none", max: 200 }),
    kcal: field.number({ label: "Calories", holds: "usage", min: 0, max: 20_000 }),
    onDay: field.day({ label: "Day", required: true, holds: "usage" }),
  },
});

const measurement = collection({
  id: "measurement",
  label: { one: "Measurement", many: "Measurements" },
  scope: { of: "subject", column: "takenBy" },
  permission: "body",
  retention: null,
  onClose: { then: "purge" },
  offline: "queue",
  fields: {
    takenBy: field.text({ label: "Taken by", required: true, holds: "identity" }),
    weightKg: field.number({ label: "Weight", holds: "sensitive", vault: true, min: 0, max: 500 }),
    onDay: field.day({ label: "Day", required: true, holds: "usage" }),
  },
});

/**
 * ⚠️ AN INVOICE OUTLIVES THE BUSINESS THAT RAISED IT, and it says why. This is
 * the one collection here that is not purged when a studio closes.
 */
const invoice = collection({
  id: "invoice",
  label: { one: "Invoice", many: "Invoices" },
  scope: { of: "tenant" },
  permission: "money",
  retention: null,
  onClose: { then: "keep", why: "It is the evidence we were paid, after they are gone." },
  fields: {
    total: field.money({ label: "Total", required: true, holds: "financial" }),
    paidOn: field.day({ label: "Paid", holds: "financial" }),
  },
});

/* ------------------------------------------------------------- operations --- */

interface Publish { readonly id: string }
interface History { readonly clientId: string; readonly since: string }
interface Draft { readonly clientId: string; readonly weeks: number }

const publish = operation<Publish, { id: string; published: boolean }>({
  id: "plan.publish",
  kind: "write",
  summary: "Make this the client's active plan",
  input: { id: field.text({ label: "Plan", required: true, holds: "none" }) },
  output: {
    id: field.text({ label: "Plan", holds: "none" }),
    published: field.bool({ label: "Published", holds: "none" }),
  },
  permission: "plan:write",
  /* ⚠️ A retry must not publish twice and notify twice. */
  idempotency: { mode: "natural", key: "id" },
  emits: ["plan.published"],
  outcome: { message: "Published.", tone: "success", invalidates: ["plan.list"] },
  fails: ["platform.not_found"],
  async handler(ctx, input) {
    const c = ctx as { db: Ask; tenantId: string; fail: (code: string) => never };
    const found = await c.db.prepare(`SELECT id FROM plan WHERE id = ? AND tenant_id = ?`)
      .bind(input.id, c.tenantId).first();
    if (!found) c.fail("platform.not_found");
    await c.db.prepare(`UPDATE plan SET published = 1 WHERE id = ? AND tenant_id = ?`)
      .bind(input.id, c.tenantId).run();
    return { id: input.id, published: true };
  },
});

/**
 * ⚠️ THIS IS THE OPERATION THAT EXISTS BECAUSE THE PLATFORM WILL ONLY GIVE
 * SOMEBODY THEIR OWN. A coach reading a client's history is a product decision
 * with its own permission — and writing it here, once, is what stops every
 * handler in the product deciding it separately.
 */
const history = operation<History, { items: unknown[] }>({
  id: "client.history",
  kind: "read",
  summary: "What a client has logged",
  input: {
    clientId: field.text({ label: "Client", required: true, holds: "none" }),
    since: field.day({ label: "Since", holds: "none" }),
  },
  output: { items: field.json({ label: "Sets", holds: "usage" }) },
  permission: "log:read",
  idempotency: { mode: "none" },
  async handler(ctx, input) {
    const c = ctx as { db: Ask; tenantId: string };
    const rows = await c.db.prepare(
      `SELECT * FROM workout_log WHERE loggedBy = ? AND onDay >= ? ORDER BY onDay DESC LIMIT 200`)
      .bind(input.clientId, input.since ?? "0000-01-01").all();
    return { items: rows.results };
  },
});

/**
 * ⚠️ THE ONE THING HERE THAT COSTS MONEY, AND IT SAYS SO. `credits` is on the
 * declaration, so the gate holds them before the handler runs and the settlement
 * happens whether it succeeds or throws — none of which this handler mentions.
 */
const draft = operation<Draft, { weeks: number }>({
  id: "plan.draft",
  kind: "write",
  summary: "Draft a plan from what the client has done",
  input: {
    clientId: field.text({ label: "Client", required: true, holds: "none" }),
    weeks: field.number({ label: "Weeks", required: true, holds: "none", min: 1, max: 12 }),
  },
  output: { weeks: field.number({ label: "Weeks", holds: "none" }) },
  permission: "plan:write",
  entitlement: "ai",
  flag: "ai-drafting",
  credits: 40,
  idempotency: { mode: "key" },
  emits: ["plan.drafted"],
  audit: { why: "The draft it produces is written as a plan, and that write is recorded." },
  /* ⚠️ Not a tool a model may call on somebody's behalf: it spends money. */
  tool: { why: "It spends credits, so a model must not be able to call it from a sentence." },
  async handler(_ctx, input) {
    return { weeks: input.weeks };
  },
});

interface Ask {
  prepare(q: string): {
    bind(...v: unknown[]): {
      run(): Promise<unknown>;
      first(): Promise<unknown>;
      all(): Promise<{ results: unknown[] }>;
    };
  };
}

/* ------------------------------------------------------------------- app --- */

export const KOVA: AppSpec = defineApp({
  id: "kova",
  name: "Kova",
  mark: "◈",

  access: {
    permissions: [
      "client:read", "client:write", "plan:read", "plan:write", "log:read", "log:write",
      "meal:read", "meal:write", "body:read", "body:write", "money:read", "money:write",
    ],
    /*
      ⚠️ APP ROLES ONLY (D15). Who runs the studio — members, settings, the
      bill — is the platform role's question; these say what somebody does all
      day INSIDE Kova. The founder is an `owner` at the platform level and a
      `trainer` here.
    */
    roles: {
      /* ⚠️ The trainer holds EVERY key the client role carries — an inviter may
         only grant a role key by key, so a coach missing one client key could
         not add a client at all. */
      trainer: [
        "client:read", "client:write", "plan:read", "plan:write", "log:read", "log:write",
        "meal:read", "meal:write", "body:read", "body:write", "money:read", "money:write",
      ],
      assistant: ["client:read", "plan:read", "log:read"],
      /*
        ⚠️ A CLIENT IS A MEMBER WITH A NARROW APP ROLE (platform role
        `customer` — no workspace authority, no seat). They hold the WRITE keys
        for their own logbook and none of the read keys for anybody else's:
        subject scope gives them their own records by construction, and this
        role is what lets them add to them.
      */
      client: ["log:read", "log:write", "meal:read", "meal:write", "body:read", "body:write", "plan:read"],
    },
    founding: "trainer",
    /* ⚠️ Platform staff cost seats; a client is the product, not the staff. */
    seats: { counts: ["owner", "manager", "staff"], entitlement: "seats" },
  },

  entitlements: {
    seats: { label: "Staff", withheld: "quota" },
    clients: { label: "Clients", withheld: "quota" },
    plans: { label: "Plans", withheld: "quota" },
    ai: { label: "AI drafting", withheld: "gate" },
    branding: { label: "Your own branding", withheld: "gate" },
    /* ⚠️ Reserved: sold by nobody, checked by nothing, kept so a future plan can
       use the key without a migration. Said out loud rather than inferred. */
    chat: { label: "Messaging", withheld: "gate", reserved: true },
  },

  plans: [
    /*
      ⚠️ THE PARKING PLAN IS WHERE A STUDIO THAT NEVER CHOSE LANDS, and it must
      never be more generous than the cheapest paid tier — a previous version of
      this product shipped a free row carrying three clients against a paid tier
      that gave one, so not paying bought more than paying did.
    */
    { id: "parked", name: "Not started", said: "Before you choose", price: 0, currency: "EUR",
      order: 0, parking: true,
      includes: { seats: 1, clients: 1, plans: 2, ai: false, branding: false } },
    { id: "solo", name: "Solo", said: "One coach, a few clients", price: 1900, currency: "EUR",
      order: 1, trialDays: 14,
      includes: { seats: 1, clients: 15, plans: -1, ai: false, branding: false } },
    { id: "studio", name: "Studio", said: "A team and a room", price: 4900, currency: "EUR",
      order: 2,
      includes: { seats: 6, clients: 100, plans: -1, ai: true, branding: false } },
    { id: "max", name: "Max", said: "Several rooms", price: 9900, currency: "EUR",
      order: 3,
      includes: { seats: -1, clients: -1, plans: -1, ai: true, branding: true } },
  ],

  collections: [client, plan, workoutLog, meal, measurement, invoice],
  operations: [publish, history, draft],

  /* ⚠️ Five, maximum (D10). Everything else lives inside one of them. */
  screens: [
    { id: "today", route: "/", label: "Today", nav: "primary", icon: "sun",
      permission: "log:read", sky: "glow", tone: "neutral" },
    { id: "clients", route: "/clients", label: "Clients", nav: "primary", icon: "people",
      permission: "client:read" },
    { id: "plans", route: "/plans", label: "Plans", nav: "primary", icon: "list",
      permission: "plan:read", sky: "glow" },
    { id: "progress", route: "/progress", label: "Progress", nav: "primary", icon: "chart",
      permission: "body:read", sky: "glow", tone: "success" },
    { id: "studio", route: "/studio", label: "Studio", nav: "primary", icon: "cog",
      permission: "tenant:manage" },
    { id: "money", route: "/money", label: "Money", nav: "secondary", icon: "receipt",
      permission: "money:read" },
  ],

  notifications: {
    "plan.published": {
      id: "plan.published", label: "A plan was published", summary: "{coach} published {title}",
      category: "activity", author: "theirs", tone: "info", icon: "list",
      needs: "plan:read", on: "plan.published", link: "/plans",
      variables: ["coach", "title"], channels: ["inbox", "email", "push"],
    },
    "client.added": {
      id: "client.added", label: "A client joined", summary: "{name} was added",
      category: "activity", author: "theirs", tone: "success", icon: "people",
      needs: "client:read", on: "client.created", link: "/clients",
      variables: ["name"], channels: ["inbox", "email"],
    },
  },

  settings: {
    "studio.units": {
      id: "studio.units", level: "tenant", group: "Studio",
      field: field.enum({ label: "Units", holds: "none", values: ["metric", "imperial"] }),
      fallback: "metric", needs: "tenant:manage",
      help: "Everything is stored in metric and shown in this.",
    },
    "studio.branding": {
      id: "studio.branding", level: "tenant", group: "Studio",
      field: field.colour({ label: "Your colour", holds: "none" }),
      fallback: "#2563eb", needs: "tenant:manage", entitlement: "branding",
    },
    "me.density": {
      id: "me.density", level: "person", group: "Appearance",
      field: field.enum({ label: "Density", holds: "none", values: ["comfortable", "compact"] }),
      fallback: "comfortable",
    },
  },

  flags: {
    "ai-drafting": {
      id: "ai-drafting", label: "AI drafting",
      why: "Being tried with a few studios before everybody gets it.",
      stage: "trying", fallback: false, setBy: "tenant", retire: "2027-01-31" as never,
    },
  },

  /* ------------------------------------------------------------- the vault --- */

  vault: {
    "client.conditions": {
      id: "client.conditions", label: "Conditions and injuries", holding: "sensitive",
      purposes: ["coaching"],
      help: "So a coach does not program something that would hurt you.",
    },
    "measurement.weightKg": {
      id: "measurement.weightKg", label: "Weight", holding: "sensitive",
      purposes: ["coaching", "progress"],
    },
  },

  purposes: {
    coaching: {
      id: "coaching", label: "Coaching", holdings: ["sensitive"], retention: null,
      why: "So your coach can program something that is safe for you.",
      /* ⚠️ Consent that cannot be refused is not consent — so a purpose the
         product depends on says so, and the sheet says what is lost. */
      required: true,
    },
    progress: {
      id: "progress", label: "Progress", holdings: ["sensitive"], retention: 730,
      why: "So you can see how things have changed over two years.",
    },
  },

  documents: {
    terms: {
      id: "terms", kind: "terms", title: "Terms of use", version: "2026-08-01" as never,
      mustAccept: true, binds: "tenant", url: "/legal/terms",
    },
    privacy: {
      id: "privacy", kind: "privacy", title: "Privacy notice", version: "2026-08-01" as never,
      mustAccept: false, binds: "person", url: "/legal/privacy",
    },
  },

  processors: {
    cloudflare: {
      id: "cloudflare", name: "Cloudflare", role: "Runs the service and stores the records",
      country: "US", receives: ["identity", "contact", "usage", "financial", "sensitive"],
    },
  },

  /* --------------------------------------------------------------- the rest --- */

  packs: [
    { id: "starter", name: "1,000 credits", credits: 1000, price: 900, currency: "EUR", order: 0 },
    { id: "bulk", name: "6,000 credits", credits: 6000, price: 4500, currency: "EUR", order: 1 },
  ],

  meters: {
    "plan.draft": { id: "plan.draft", label: "Draft a plan", lane: "text", maxOutput: 2400 },
  },
  lanes: ["text", "vision"],

  jobs: {
    "lapsed-clients": {
      id: "lapsed-clients", label: "A client went quiet",
      why: "Tells a coach when somebody has not logged anything for a fortnight.",
      schedule: "0 6 * * 1", scope: "per-tenant",
      onFail: { then: "park" },
      rerunnable: true,
      budgetSeconds: 20,
    },
  },

  whitelabel: { surfaces: ["shell", "email", "sign-in"], entitlement: "branding" },

  guide: {
    "first-client": {
      id: "first-client", label: "Add your first client", why: "The product starts here.",
      done: "client.created", link: "/clients", needs: "client:write", order: 1,
    },
    "first-plan": {
      id: "first-plan", label: "Build a plan", why: "It is what they came for.",
      done: "plan.created", link: "/plans", needs: "plan:write", order: 2,
    },
    "publish-it": {
      id: "publish-it", label: "Publish it", why: "Until you do, only you can see it.",
      done: "plan.published", link: "/plans", needs: "plan:write", order: 3,
    },
  },

  milestones: {
    "first-published": {
      id: "first-published", label: "First plan published",
      said: "Your client can see it now.", on: "plan.published", tone: "success", icon: "star",
    },
    "ten-clients": {
      id: "ten-clients", label: "Ten clients", said: "Ten people are training with you.",
      on: "client.created", after: 10, tone: "success", icon: "people",
    },
  },

  help: {
    "about-clients": {
      id: "about-clients", title: "The client record", screen: "clients",
      body: "Their name and goal live here. Conditions and injuries do not — those are kept "
        + "encrypted, behind their consent, and you see them only while they allow it.",
      terms: ["conditions", "injuries", "who can see", "medical"],
    },
    "about-progress": {
      id: "about-progress", title: "Whose numbers these are", screen: "progress",
      body: "A client's logbook is theirs. You see what they log because they are your client, "
        + "and they can see everything you can.",
      terms: ["progress", "who can see", "weight"],
    },
  },
});

/* ⚠️ A thunk, because composition is lazy (D4). */
export const kova = (): AppSpec => KOVA;
