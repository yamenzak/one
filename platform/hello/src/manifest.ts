/**
 * THE SMALLEST REAL APP — one collection, three operations, and nothing else.
 *
 * ⚠️ IT EXISTS TO BOOT. Every stage's exit criterion in PLAN.md §8 is asserted
 * against this app, which is what stops the platform from being a set of types
 * that have never met a request. A stage that cannot make `hello` do the thing
 * has not finished, whatever the unit tests say.
 *
 * It carries no product vocabulary on purpose: a `note` is the least meaningful
 * collection that still has a field, an owner and a lifecycle.
 */

import {
  UNLIMITED,
  cache, collection, defineApp, defineBindings, field,
  job, objects, operation, s, sql,
  type Currency, type Locale, type RegionId, type TimeZone,
} from "@one/kernel";

/* -------------------------------------------------------------- bindings --- */

export const bindings = defineBindings({
  db: sql(),
  media: objects({ jurisdictional: true }),
  cache: cache(),
});

export type Bindings = typeof bindings;

/* ------------------------------------------------------------ collection --- */

export const notes = collection({
  id: "note",
  label: { one: "Note", many: "Notes" },
  scope: { of: "tenant" },
  entitlement: "notes",
  version: true,
  holding: { kind: "none" as const, why: "A fixture. It exists to be a shape, not to hold anybody's data." },
  retention: { days: null, onTenantClose: "purge" },
  onDelete: { on: "archive" },
  activity: true,
  search: ["title"],
  fields: {
    title: field.text({ required: true, min: 1, max: 200 }),
    body: field.text({ multiline: true }),
    pinned: field.bool(),
  },
});

/* ------------------------------------------------------------ collection --- */

/**
 * A DOCUMENT, so the lifecycle is exercised rather than described.
 *
 * ⚠️ Opt-in per collection, and this is the shape it is right for: a record that
 * ASSERTS something happened, whose value is that it cannot quietly change
 * afterwards. It is exactly wrong for the notes beside it, which is why one has
 * it and the other does not.
 */
export const receipts = collection({
  id: "receipt",
  label: { one: "Receipt", many: "Receipts" },
  scope: { of: "tenant" },
  // ⚠️ A CEILING ON CREATE, NOT ON READ. Refusing to show what a workspace
  // already stored because it has since downgraded holds their own records
  // hostage; refusing the next one does not.
  quota: "receiptsStored",
  version: true,
  holding: { kind: "none" as const, why: "A fixture. It exists to be a shape, not to hold anybody's data." },
  retention: { days: 2555, onTenantClose: "export-then-purge" },
  onDelete: { on: "archive" },
  naming: { series: "RC-.YYYY.-.####" },
  docStatus: { amendable: true, immutableAfterSubmit: ["total", "issuedOn"] },
  activity: true,
  fields: {
    total: field.money({ required: true }),
    issuedOn: field.plainDate({ required: true }),
    memo: field.text({ multiline: true }),
  },
});

/* ------------------------------------------------------------ collection --- */

/**
 * A collection whose rows belong to one CUSTOMER rather than to the workspace.
 *
 * ⚠️ THE THIRD SCOPE, AND IT WAS DECLARED AND DEAD. `Scope` has had a `subject`
 * variant since stage 0 — with DDL, an index and a place in the erasure cascade
 * — and no derived operation ever wrote its column, which is `NOT NULL`. So
 * every subject-scoped collection was a table that could not be written to, and
 * nothing in the platform noticed because nothing declared one.
 *
 * It is here so that one does, permanently: the person half of the wizard needs
 * a step somebody can satisfy for themselves, and a step counting the
 * workspace's rows is done the moment a colleague does it.
 */
export const entries = collection({
  id: "entry",
  label: { one: "Entry", many: "Entries" },
  scope: { of: "subject", subject: "customer" },
  version: true,
  holding: { kind: "none" as const, why: "A fixture. It exists to be a shape, not to hold anybody's data." },
  retention: { days: null, onTenantClose: "purge" },
  onDelete: { on: "archive" },
  activity: true,
  fields: {
    note: field.text({ required: true, min: 1, max: 500 }),
  },
});

/* ------------------------------------------------------------ operation --- */

/**
 * ⚠️ THE ONE THING A COLLECTION COULD NOT IMPLY: a capability sold to somebody
 * who is not the workspace.
 *
 * Everything else `hello` has is derived. This exists because the customer rail
 * needs a capability that is genuinely WITHHELD by a route — hiding a tab is not
 * withholding anything, and a product that only hides it ships a report every
 * customer can fetch by asking for it directly.
 */
export const digest = operation<Bindings, Record<string, never>, { count: number }>({
  id: "notes.digest",
  kind: "read",
  summary: "A rolled-up view of this workspace's notes.",
  input: s.object({}),
  output: s.object({ count: s.number({ integer: true }) }),
  permission: "note:read",
  customerFlag: "digest",
  idempotency: { mode: "none" },
  async handler(ctx) {
    const row = await ctx.bind.db.first<{ n: number }>(`SELECT COUNT(*) AS n FROM notes WHERE tenant_id = ?`, ctx.tenantId);
    return { count: row?.n ?? 0 };
  },
});

/* ------------------------------------------------------------------ job --- */

/**
 * ⚠️ BOUNDED, AND IT SAYS SO WHEN IT HIT THE BOUND. A sweep that reached its
 * ceiling and reported success builds a backlog at exactly the rate it truncates
 * it — and the graph of work-done-per-run looks healthy the entire time.
 */
export const tidy = job<Bindings>({
  id: "notes.tidy",
  summary: "Forget notes that were archived long enough ago.",
  every: "daily",
  scope: "tenant",
  batch: 100,
  async handler(ctx) {
    const cutoff = new Date(Date.parse(ctx.now()) - 30 * 86_400_000).toISOString();
    const stale = await ctx.bind.db.all<{ id: string }>(
      `SELECT id FROM notes WHERE tenant_id = ? AND deleted_at IS NOT NULL AND deleted_at < ? LIMIT ?`,
      ctx.tenantId, cutoff, ctx.batch + 1,
    );
    const doing = stale.slice(0, ctx.batch);
    for (const row of doing) await ctx.bind.db.run(`DELETE FROM notes WHERE id = ?`, row.id);
    return { done: doing.length, more: stale.length > ctx.batch };
  },
});

/* ------------------------------------------------------------------- app --- */

export const hello = defineApp({
  id: "hello",
  name: "Hello",
  stripeMetadataPrefix: "hello",
  manifestVersion: "0.1.0",
  bindings,

  identity: {
    rootRelyingParty: "4dl.app",
    sessionScope: "origin",
    directoryRegion: "eu" as RegionId,
  },
  tenancy: {
    appRoot: "hello.4dl.app",
    /* ⚠️ `identity` IS THE ACCOUNT CENTRE'S OWN DOOR, at `id.4dl.app` — under
       the PLATFORM root rather than this app's, which is what makes it reachable
       by somebody who belongs to no workspace at all. */
    doors: ["root", "setup", "admin", "identity", "slug", "custom"],
    /* ⚠️ ANOTHER DOMAIN OF OURS, DECLARED SO IT IS NOT RESOLVED AS SOMEBODY'S
       CUSTOM DOMAIN. `redirect` because a second serving origin cannot share a
       passkey with the first — WebAuthn binds a credential to one registrable
       domain — so it would cost every person a second credential to buy a nicer
       URL. */
    aliases: [{ root: "fourdegreelabs.com", mode: "redirect" }],
    regions: ["auto", "eu"] as RegionId[],
    defaultRegion: "auto" as RegionId,
    reservedSlugs: ["hello"],
  },
  /*
    ⚠️ WHAT THIS APP ASKS TO SEE OF SOMEBODY'S OWN FACTS, and it asks for one of
    each need on purpose: this is the app every stage's exit criterion is
    asserted against, so a need with no app exercising it is a need with no
    integration test behind it.
  */
  vault: {
    wants: [
      { fact: "goal.training", need: "raw", recommend: "staff", why: "So whoever is helping you knows what you are working towards." },
      { fact: "body.mass", need: "derived", readings: ["body.mass.trend"], why: "So a direction can be shown without a weight." },
      { fact: "body.height", need: "compute", why: "Used in a calculation whose answer is shown. Nobody is shown the height." },
    ],
  },
  format: {
    currency: "EUR" as Currency,
    timeZone: "Europe/Berlin" as TimeZone,
    locale: "en" as Locale,
    units: "metric",
    weekStart: 1,
  },
  access: {
    permissions: ["note:read", "note:write", "receipt:read", "receipt:write", "workspace:create", "billing:manage", "commerce:read", "commerce:manage", "inbox:read", "workspace:close", "workspace:settings", "file:read", "file:write", "guide:read", "milestone:read", "entry:read", "entry:write", "member:read", "member:manage", "platform:operate", "vault:read"],
    /*
      Anybody signed in may open a workspace — this is a self-serve product, and
      `workspace:create` is checked on a door that has no tenant to be a member
      of, so a role is the only place it could come from.
    */
    roles: { owner: ["note:read", "note:write", "receipt:read", "receipt:write", "workspace:create", "billing:manage", "commerce:read", "commerce:manage", "inbox:read", "workspace:close", "workspace:settings", "file:read", "file:write", "guide:read", "milestone:read", "entry:read", "entry:write", "member:read", "member:manage", "vault:read"], reader: ["note:read", "guide:read", "milestone:read", "entry:read", "entry:write", "member:read"],
      /* ⚠️ WHAT SOMEBODY MAY DO ON THE OPERATOR DOOR, where there is no
         workspace to be a member of. The door is the control; this says what it
         opens onto. Deliberately narrow: the deployment's own checklist and the
         billing lane, never a workspace's records. */
      operator: ["guide:read", "inbox:read", "platform:operate"] },
    /*
      ⚠️ EVERY ENTRY NAMES HOW IT IS WITHHELD, and `defineApp` refuses one whose
      mechanism does not exist. `notes` is gated on the collection rather than on
      each derived operation — a collection derives seven of them, and repeating
      a gate seven times is how six get it.
    */
    entitlements: {
      notes: { label: "Notes", parked: true, enforcement: "gate" },
      receiptsStored: { label: "Receipts kept", parked: 5, enforcement: "quota" },
      /* ⚠️ BYTES, not files. A ceiling counted in rows is one a single large
         upload walks straight past. */
      storedBytes: { label: "Storage", unit: "bytes", parked: 2_000_000, enforcement: "quota" },
      /* ⚠️ Counted by the platform from the memberships, because that is where
         the rows are. An app supplying its own counter for this would be
         counting a table it does not own. */
      seats: { label: "People", parked: 5, enforcement: "quota" },
    },
    plans: [
      {
        id: "free",
        name: "Free",
        price: { minor: 0, currency: "EUR" as Currency },
        period: "month",
        trialDays: 0,
        entitlements: { notes: true, receiptsStored: 5, storedBytes: 2_000_000, seats: 5 },
      },
      {
        id: "keeper",
        name: "Keeper",
        price: { minor: 500, currency: "EUR" as Currency },
        period: "month",
        trialDays: 14,
        entitlements: { notes: true, receiptsStored: UNLIMITED, storedBytes: 50_000_000, seats: UNLIMITED },
      },
    ],
    /*
      ⚠️ THE SECOND RAIL, AND IT IS NOT THE FIRST ONE AGAIN. `notes` is what the
      PLATFORM sells this workspace; `digest` is what the workspace sells the
      people it serves. They resolve separately and a real capability is the
      intersection — which is what stops a workspace selling something it did
      not itself buy.
    */
    /* ⚠️ The signed-in person IS the customer here — `hello` has no roster of
       people somebody else is acting on behalf of. Kova is the other shape. */
    customerRail: "member",
    customerFlags: {
      digest: { label: "Rolled-up notes", parked: false, enforcement: "gate", scope: "reading", requires: "notes" },
    },
    /* ⚠️ EVERYBODY IN THE WORKSPACE IS A SEAT HERE. Which roles count is a
       pricing decision, not a technical one — Kova excludes the people a studio
       coaches, because charging per customer twice is not what its plan says. */
    seats: { counts: ["owner", "reader"] },
    /* ⚠️ What somebody holds before they belong to anything: making their first
       workspace, and nothing else. */
    personal: ["workspace:create"],
  },
  governance: {
    legal: [{ id: "terms", version: "2026-01-01", title: "Terms", body: "What this example does with what you put in it: nothing at all.", mustAccept: ["owner"] }],
    protection: {
      controller: "The example controls it.",
      contact: "privacy@example.test",
      assessment: { required: false, note: "A fixture processes nobody's data." },
      /*
        ⚠️ THREE ENTRIES ON AN APP THAT DOES ALMOST NOTHING, and that is the
        reference point worth having. There is no such thing as a product with
        no sub-processors: it runs on somebody's computers, it sends its sign-in
        code through somebody's mail lane, and the moment it puts a price on a
        plan somebody settles it. This list was EMPTY, honestly written by
        somebody who had not added a feature yet, and all three were true then
        too. The disclosure check is what turned that from an oversight into a
        composition that does not boot.
      */
      subprocessors: [
        {
          id: "cloudflare",
          name: "Cloudflare, Inc.",
          mark: "cloudflare",
          role: "Runs the product and stores everything in it — compute, the databases, the object store, the cache and the durable objects.",
          does: "Runs the platform",
          receives: ["identity", "contact", "credential", "financial", "usage", "content"],
          where: "Workers run at the point of presence nearest the request. Databases and object stores are placed in the region a workspace chose.",
          safeguard: "dpf",
          terms: "https://www.cloudflare.com/cloudflare-customer-dpa/",
          trust: "https://www.cloudflare.com/trust-hub/compliance-resources/",
        },
        {
          /* ⚠️ The id is the mail LANE, and it must match `MAIL_LANES`. */
          id: "cloudflare-email",
          name: "Cloudflare Email Routing and Email Sending",
          mark: "cloudflare",
          role: "Sends the messages this product sends: a sign-in code, an invitation, a notification somebody asked to be emailed.",
          does: "Sends the mail",
          receives: ["identity", "contact"],
          where: "Cloudflare's network.",
          safeguard: "dpf",
          terms: "https://www.cloudflare.com/cloudflare-customer-dpa/",
          trust: "https://www.cloudflare.com/trust-hub/compliance-resources/",
        },
        {
          id: "stripe",
          name: "Stripe, Inc.",
          mark: "stripe",
          role: "Takes a workspace's payment for its own plan. Never involved in what a workspace charges anybody else.",
          does: "Takes payment",
          receives: ["identity", "contact", "financial"],
          where: "United States and Ireland.",
          safeguard: "dpf",
          terms: "https://stripe.com/legal/dpa",
          trust: "https://stripe.com/docs/security",
        },
      ],
    },
    impersonation: { maxMinutes: 30, announce: true },
    auditRetentionDays: 365,
  },

  collections: [notes, receipts, entries],

  /*
    ⚠️ EVERY EVENT THE PLATFORM'S OWN OPERATIONS RAISE IS DECLARED HERE, and an
    app that omits one does not boot. That is deliberate: a workspace created, a
    plan chosen, a package granted and a payment settled are all things somebody
    should be told about, and "the platform emits it so the platform will handle
    it" is how a product ships an event nobody ever sees.
  */
  notifications: {
    "workspace.created": {
      category: "service", tone: "success", icon: "sparkle",
      title: "{slug} is ready",
      link: { to: "inbox" },
      /* ⚠️ Whoever pays for it is who is told it exists. */
      roles: ["owner"], needs: "billing:manage",
    },
    "plan.chosen": {
      category: "billing", tone: "info", icon: "card",
      title: "You chose {planId}",
      link: { to: "inbox" },
      roles: ["owner"], needs: "billing:manage",
    },
    "package.granted": {
      category: "billing", tone: "success", icon: "gift",
      title: "{days} days added",
      link: { to: "inbox" },
      roles: ["owner"], needs: "billing:manage",
    },
    "support.session": {
      category: "service", tone: "warning", icon: "shield",
      title: "Somebody from support was in your workspace",
      body: "Why: {reason}",
      /* ⚠️ Somebody from outside acted inside: told to whoever can see who is in
         it, which is the question this raises. */
      link: { to: "inbox" }, roles: ["owner"], needs: "member:read",
    },
    /*
      ⚠️ THE ONE TYPE EVERY MILESTONE IS ANNOUNCED WITH, and the platform names
      it. An app with milestones and no announcement does not compose: earning
      something and being told about it are the same moment, and a milestone
      nobody is told about is a row in a table.
    */
    "milestone.earned": {
      category: "activity", tone: "success", icon: "sparkle",
      title: "{title}",
      link: { to: "inbox" },
      /* ⚠️ Your own achievement, so the key is the one everybody signed in has. */
      roles: ["owner", "reader"], needs: "inbox:read",
    },
  },
  /*
    ⚠️ EMPTY, AND THAT IS THE POINT. Every surface this app has is derived from
    the two collections above — list, read, create, update, delete, the document
    lifecycle and the activity log. What belongs here is what a collection could
    not imply, and `hello` has none of that.
  */
  operations: [digest],

  /*
    ⚠️ HELP IS PART OF THE MANIFEST, so an article about a screen this app does
    not have, and a cross-link to an article that does not exist, are both
    refusals rather than something somebody discovers while stuck.
  */
  help: {
    notes: {
      title: "Keeping notes",
      body: "A note is a short piece of text you want to find again. Everyone in this workspace can see them.",
      steps: ["Open Notes", "Write it", "Save"],
      surfaces: ["note"],
    },
    receipts: {
      title: "Recording what you spent",
      body: "A receipt records an amount and the day it happened. Once you submit one it stops being editable, which is the point of it.",
      surfaces: ["receipt"],
    },
  },

  /* ⚠️ A closed set: what may be uploaded, which types, how large. */
  filePurposes: {
    attachment: { label: "Attachment", accept: ["image/jpeg", "image/png", "text/plain"], maxBytes: 4_000_000, permission: "file:write" },
  },

  jobs: [tidy],

  /*
    ⚠️ DERIVED, NEVER TRACKED. Each step is answered by counting what is actually
    there — so it cannot drift, survives a change of device, and un-checks itself
    if the thing is deleted. `required` is the wizard; the rest is the checklist.
  */
  guide: {
    steps: [
      /*
        ⚠️ THREE SHAPES, ONE DECLARATION. The deployment is set up once by
        whoever runs it, a workspace once by whoever opened it, and a person
        every time a new one arrives — and the third is the one that gets built
        as the second, so a customer signing up under a tenant is shown the
        workspace's checklist, already finished, none of which was theirs.
      */
      { id: "take-payments", title: "Connect a payment provider", roles: ["owner"], setup: "deployment", required: true, answer: { kind: "platform", fact: "payments_configured" } },
      { id: "choose-plan", title: "Choose a plan", roles: ["owner"], setup: "workspace", required: true, answer: { kind: "platform", fact: "plan_chosen" } },
      /* ⚠️ THEIRS, counted against THEIR rows — see the `entry` collection. */
      { id: "first-entry", title: "Write your first entry", roles: ["owner", "reader"], setup: "person", required: true, answer: { kind: "collection", collection: "entry", atLeast: 1 }, does: "entry.create" },
      { id: "first-note", title: "Write your first note", roles: ["owner", "reader"], required: false, answer: { kind: "collection", collection: "note", atLeast: 1 }, does: "note.create", help: "notes" },
      { id: "a-receipt", title: "Record something you spent", roles: ["owner"], required: false, answer: { kind: "collection", collection: "receipt", atLeast: 1 }, help: "receipts" },
      { id: "a-passkey", title: "Add a passkey", roles: ["owner", "reader"], required: false, answer: { kind: "platform", fact: "passkey_registered" } },
    ],
    hints: [
      { id: "search-notes", surface: "note", body: "Search looks inside every note, not just the titles.", roles: ["owner", "reader"] },
    ],
  },

  /*
    ⚠️ RULES OVER EVENTS THE MANIFEST ALREADY DECLARES, and `hello` declares no
    operation that raises one — so both of these are over what the PLATFORM
    raises. That is the honest smallest version, and it is the interesting case:
    a rule over `package.granted` is only expressible because the platform's own
    events are named in the contract layer rather than inferred from a manifest.
  */
  milestones: {
    "picked-a-plan": {
      title: "You chose a plan",
      icon: "sparkle",
      rule: { kind: "first", event: "plan.chosen" },
      roles: ["owner"],
    },
    "three-grants": {
      title: "Three lots of days handed out",
      icon: "gift",
      rule: { kind: "count", event: "package.granted", reaches: 3 },
      roles: ["owner"],
    },
  },

  releases: [
    { version: "0.1.0", at: "2026-02-01", notes: ["Notes and receipts.", "You can now choose a plan."] },
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
  /*
    ⚠️ EMPTY, HONESTLY. Every failure this app can produce is one the platform
    raises on its behalf — a refused shape, a stale version, a missing row. An
    app declares a code when it has a rule of its own to refuse with, and adding
    one here to look complete would be copy nobody ever reads.
  */
  problems: {},
});
