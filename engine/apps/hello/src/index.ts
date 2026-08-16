/**
 * THE SMALLEST COMPLETE APP ON ENGINE.
 *
 * ⚠️ IT IS A MANIFEST AND NOTHING ELSE. There is no router, no schema, no
 * migration, no settings screen, no policy screen, no audit call, no gate call
 * and no route table in this file — every one of those is derived from what is
 * below. That is the claim the whole framework makes, and this file is where it
 * is either true or it is not.
 *
 * ⚠️ AND IT DECLARES EVERY CROSS-CUTTING CONCERN, deliberately, even though it
 * is a toy: the point of a reference app is that the next one is copied from it,
 * so anything absent here is a thing every future app will also be missing.
 */

import {
  collection, defineApp, field, flag, notification, operation, setting,
  type AppSpec,
} from "@engine/kernel";

/* ------------------------------------------------------------ collections --- */

/**
 * ⚠️ A NOTEBOOK ENTRY CARRIES ALL FOURTEEN DECLARABLE KINDS, AND THAT IS WHY THE
 * COLLECTION IS THIS WIDE. `Field` turns a declaration into a control, and the
 * only honest test of that is a real record whose values happen to span the
 * whole set — a screen assembled to show one of each proves the components
 * exist, which nobody doubted. What was in doubt is whether an app declaring an
 * ordinary thing gets fourteen usable controls, and a note genuinely has a kind,
 * a day it happened, a colour, a link, a cost and somebody to ask.
 */
const note = collection({
  id: "note",
  label: { one: "Note", many: "Notes" },
  scope: { of: "tenant" },
  permission: "note",
  retention: null,
  onClose: { then: "purge" },
  quota: "notes",
  offline: "queue",
  fields: {
    title: field.text({ label: "Title", required: true, holds: "none", max: 200 }),
    body: field.long({ label: "Body", holds: "none", max: 20_000 }),
    pinned: field.bool({ label: "Pinned", holds: "none" }),
    kind: field.enum({
      label: "Kind", holds: "none",
      values: ["idea", "decision", "question", "record"],
    }),
    happened: field.day({ label: "Happened on", holds: "none" }),
    remind: field.instant({ label: "Come back to it", holds: "none" }),
    minutes: field.number({ label: "Minutes it took", holds: "none", min: 0, max: 600 }),
    /* ⚠️ Minor units, because a float is a rounding error with a symbol on it. */
    cost: field.money({ label: "What it cost", holds: "none" }),
    colour: field.colour({ label: "Colour", holds: "none" }),
    link: field.url({ label: "Link", holds: "none" }),
    /* ⚠️ SOMEBODY ELSE'S ADDRESS, so it says so — and hello's processing record
       is generated from exactly this word rather than written by hand. */
    ask: field.email({ label: "Who to ask", holds: "contact" }),
    cover: field.media({ label: "Cover", holds: "none", purpose: "note-cover" }),
    /* ⚠️ A note points at the note it came out of, which is the same collection.
       A reference needs no second collection to be real. */
    follows: field.ref({ label: "Follows", holds: "none", to: "note" }),
    extra: field.json({ label: "Extra", holds: "none" }),
  },
});

/* ------------------------------------------------------------- operations --- */

interface Publish { readonly id: string }

/**
 * ⚠️ A HANDLER DOES ITS OWN WORK AND NOTHING ELSE. It never checks a permission,
 * never counts a quota, never writes an audit row and never decides what a
 * refusal looks like — those happen once, to every operation, in the runtime
 * (D12). If this handler could forget one of them, every handler could.
 */
const publish = operation<Publish, { id: string; published: boolean }>({
  id: "note.publish",
  kind: "write",
  summary: "Make a note visible to everybody here",
  input: { id: field.text({ label: "Note", required: true, holds: "none" }) },
  output: {
    id: field.text({ label: "Note", holds: "none" }),
    published: field.bool({ label: "Published", holds: "none" }),
  },
  permission: "note:write",
  entitlement: "publishing",
  /* ⚠️ A retry must not publish twice and notify twice — see `Idempotency`. */
  idempotency: { mode: "natural", key: "id" },
  emits: ["note.published"],
  outcome: { message: "Published.", tone: "success", invalidates: ["note.list"] },
  fails: ["platform.not_found"],
  async handler(ctx, input) {
    const c = ctx as { db: unknown; tenantId: string; fail: (code: string) => never };
    const db = c.db as {
      prepare(q: string): { bind(...v: unknown[]): { run(): Promise<unknown>; first(): Promise<unknown> } };
    };
    const found = await db.prepare(`SELECT id FROM note WHERE id = ? AND tenant_id = ?`)
      .bind(input.id, c.tenantId).first();
    if (!found) c.fail("platform.not_found");
    await db.prepare(`UPDATE note SET pinned = 1 WHERE id = ? AND tenant_id = ?`)
      .bind(input.id, c.tenantId).run();
    return { id: input.id, published: true };
  },
});

/**
 * ⚠️ A GENERATING OPERATION NAMES A LANE AND A PROMPT, NEVER A MODEL (D19).
 * Which row it runs on is the operator's binding; the prompt is a letterhead
 * whose variables are declared, and `brandable` says a workspace may put it in
 * its own voice — which a drafting tone should be, and an extraction rule
 * should not.
 */
const draft = operation<{ about: string }, { text: string }>({
  id: "note.draft",
  kind: "write",
  summary: "Draft a note from a line about it",
  input: { about: field.text({ label: "About", required: true, holds: "none" }) },
  output: { text: field.text({ label: "Draft", holds: "none" }) },
  permission: "note:write",
  idempotency: { mode: "none" },
  emits: ["note.drafted"],
  /* ⚠️ What the record says. A generation is a spend, and "who asked for
     what" is exactly the entry somebody reads when a bill looks wrong. */
  audit: (input) => ({ subject: input.about, verb: "drafted" }),
  ai: {
    lane: "text",
    prompt: "Write a short note about {about}. Keep it to one paragraph.",
    variables: ["about"],
    maxOutput: 800,
    brandable: true,
  },
  async handler(_ctx, input) {
    /* ⚠️ The handler does not choose a model and does not build the prompt —
       the platform resolves both from the declaration and the binding. */
    return { text: `Draft about ${input.about}` };
  },
});

/* --------------------------------------------------------------- the rest --- */

export const HELLO: AppSpec = defineApp({
  id: "hello",
  name: "Hello",
  mark: "◇",

  access: {
    permissions: ["note:read", "note:write"],
    /*
      ⚠️ APP ROLES ONLY (D15). Workspace authority — the roster, the settings,
      the bill — is the platform's four offices, and an app naming those keys
      in a bundle is refused at composition.
    */
    roles: {
      writer: ["note:read", "note:write"],
      reader: ["note:read"],
    },
    founding: "writer",
    /* ⚠️ Seats count PLATFORM staff — a person is on the team or they are not,
       however many products the team uses. */
    seats: { counts: ["owner", "manager", "staff"], entitlement: "seats" },
  },

  entitlements: {
    seats: { label: "People", withheld: "quota" },
    notes: { label: "Notes", withheld: "quota" },
    publishing: { label: "Publishing", withheld: "gate" },
  },

  plans: [
    { id: "free", name: "Free", said: "A look around", price: 0, currency: "EUR", order: 0,
      parking: true, includes: { seats: 1, notes: 20, publishing: false } },
    { id: "team", name: "Team", said: "For a working group", price: 900, currency: "EUR", order: 1,
      trialDays: 14, includes: { seats: 10, notes: -1, publishing: true } },
  ],

  collections: [note],
  operations: [publish, draft],

  /*
    ⚠️ THREE OF EIGHT NAME A GROUND, AND THE FIVE THAT DO NOT ARE THE POINT.
    AMBIENCE.md's rule is that ambience everywhere is ambience nowhere: what
    earns a world is a screen somebody ARRIVES at — a result, a home, something
    they read — and never a form and never a list. A reference app that painted
    all eight would teach the next app to do the same, which is how a product
    ends up with a ground behind its settings.

    ⚠️ A SCREEN THAT NAMES NOTHING STILL HAS ONE: the shell falls back to the
    PRODUCT's own world, a lattice seeded from the app's face (`Shell`). So the
    five plain screens are not bare — they are the product, and the three named
    ones are somewhere else inside it.
  */
  screens: [
    /* ⚠️ A list. The product's own lattice, and nothing of its own. */
    { id: "notes", route: "/", label: "Notes", nav: "primary", icon: "note",
      permission: "note:read", tone: "neutral" },
    { id: "people", route: "/people", label: "People", nav: "primary", icon: "people",
      permission: "member:read" },
    { id: "settings", route: "/settings", label: "Settings", nav: "secondary", icon: "cog",
      permission: "tenant:manage" },
    /* ⚠️ Behind one of our switches, which is what makes the flag mean anything:
       a flag no screen and no operation is behind changes nothing when pressed. */
    { id: "search", route: "/search", label: "Search", nav: "secondary", icon: "search",
      permission: "note:read", flag: "note-search" },
    /* ⚠️ DECLARED SO THE CHART VOCABULARY HAS A HOME IN A REAL APP. A figure is
       the one part of the design system that cannot be judged from a catalogue —
       it needs a series with a gap in it, an axis, a period to filter by and a
       number beside it — and a screen is where those meet. */
    /* ⚠️ `etch` — ruled geometry, which AMBIENCE.md points at monitoring and
       planning. A sheet of measures is the screen that ground was described for. */
    { id: "reports", route: "/reports", label: "Reports", nav: "secondary", icon: "chart",
      permission: "note:read", sky: "etch" },
    /* ⚠️ REACHED FROM A SCREEN RATHER THAN FROM THE NAV, WHICH IS WHAT `none`
       MEANS. A note is opened from the list and written from the list's one
       action; putting either in the nav would advertise two destinations for
       the place somebody is already standing. */
    /* ⚠️ `cloth` — a premium dark ground for a screen somebody stays on. Reading
       a note is the only thing in this app that is not scanning. */
    { id: "note", route: "/note", label: "A note", nav: "none", icon: "note",
      permission: "note:read", sky: "cloth" },
    { id: "write", route: "/write", label: "Write a note", nav: "none", icon: "note",
      permission: "note:write" },
    /* ⚠️ THE APP'S OWN GUIDE, MILESTONES AND HELP HAVE TO LAND SOMEWHERE. All
       three are declared below and were drawn nowhere — a checklist nobody can
       open is a checklist nobody completes, and the manifest cannot tell. */
    /* ⚠️ `glow` — pure light, no marks, which is what a page wants behind it when
       it wants anything. An arrival is the case the family exists for. */
    { id: "start", route: "/start", label: "Getting started", nav: "secondary", icon: "star",
      permission: "note:read", sky: "glow" },
  ],

  notifications: {
    "note.published": {
      id: "note.published", label: "A note was published", summary: "{who} published {title}",
      category: "activity", author: "theirs", tone: "info", icon: "note",
      /* ⚠️ A permission, never a role name — a workspace's own role must receive
         these too, and matching on a name is how it silently stops. */
      needs: "note:read",
      on: "note.published",
      link: "/",
      variables: ["who", "title"],
      channels: ["inbox", "email", "push"],
    },
  },

  settings: {
    "notes.default_pinned": {
      id: "notes.default_pinned", level: "tenant", group: "Notes",
      field: field.bool({ label: "Pin new notes", holds: "none" }),
      fallback: false, needs: "tenant:manage",
      help: "New notes start at the top of the list.",
    },
    "notes.default_kind": {
      id: "notes.default_kind", level: "tenant", group: "Notes",
      field: field.enum({
        label: "What a new note is", holds: "none",
        values: ["idea", "decision", "question", "record"],
      }),
      fallback: "idea", needs: "tenant:manage",
      help: "Whoever writes it can still change it.",
    },
    "notes.weekly_target": {
      id: "notes.weekly_target", level: "tenant", group: "Notes",
      field: field.number({ label: "Notes a week", holds: "none", min: 0, max: 500 }),
      fallback: 20, needs: "tenant:manage",
      help: "What Reports measures a week against.",
    },
    /* ⚠️ A COLOUR SETTING IS THE ONE THAT PROVES `Field` PICKS A CONTROL RATHER
       THAN A TEXT BOX. It fell through to `text` once, and a workspace's colour
       was a field holding `#2563eb` to be typed correctly by somebody who
       already knew hex. */
    "notes.accent": {
      id: "notes.accent", level: "tenant", group: "Appearance",
      field: field.colour({ label: "Colour", holds: "none" }),
      fallback: "#3f7d58", needs: "tenant:manage",
    },
    "notes.reply_to": {
      id: "notes.reply_to", level: "tenant", group: "Email",
      field: field.email({ label: "Where replies go", holds: "contact" }),
      fallback: "", needs: "tenant:manage",
    },
    "notes.density": {
      id: "notes.density", level: "person", group: "Appearance",
      field: field.enum({ label: "Density", holds: "none", values: ["comfortable", "compact"] }),
      fallback: "comfortable",
    },
    "notes.signature": {
      id: "notes.signature", level: "person", group: "Appearance",
      field: field.text({ label: "How you sign a note", holds: "none", max: 60 }),
      fallback: "",
    },
    "notes.digest": {
      id: "notes.digest", level: "person", group: "Email",
      field: field.enum({
        label: "Digest", holds: "none",
        values: ["off", "daily", "weekly"],
      }),
      fallback: "weekly",
      help: "One message with what was published since the last one.",
    },
  },

  flags: {
    "note-search": {
      id: "note-search", label: "Search", why: "Being tried before it goes to everybody.",
      stage: "trying", fallback: false, setBy: "tenant", retire: "2026-12-31" as never,
    },
  },

  /* ⚠️ MORE THAN ONE OF EACH, BECAUSE ONE OF ANYTHING IS NOT A LIST. A checklist
     of a single step renders as a sentence, a trail of one moment renders as a
     date, and neither shows what the component does with the second one. */
  guide: {
    "first-note": { id: "first-note", label: "Write your first note",
      why: "It is the whole product.", done: "note.created", link: "/", order: 1 },
    /* ⚠️ EVERY STEP IS TICKED BY AN EVENT THIS APP ACTUALLY RAISES. A step whose
       `done` nothing emits is a box that can never be crossed off, and the
       manifest refuses one at composition rather than letting it sit there. */
    "draft-one": { id: "draft-one", label: "Let it draft one for you",
      why: "It is the fastest way to see what a note is.", done: "note.drafted",
      link: "/write", order: 2 },
    "publish-one": { id: "publish-one", label: "Publish a note",
      why: "Publishing is what everybody else sees.", done: "note.published",
      link: "/", order: 3 },
  },

  milestones: {
    "first-published": { id: "first-published", label: "First published note",
      said: "Everybody in the workspace can see it now.", on: "note.published",
      tone: "success", icon: "star" },
    "ten-notes": { id: "ten-notes", label: "Ten notes", said: "The notebook is worth searching.",
      on: "note.created", after: 10, tone: "info", icon: "note" },
  },

  help: {
    "about-notes": { id: "about-notes", title: "About notes", screen: "notes",
      body: "A note belongs to the workspace. Everybody who can read notes can read all of them.",
      terms: ["note", "share", "who can see"] },
    "about-publishing": { id: "about-publishing", title: "Publishing", screen: "notes",
      body: "A draft is yours until you publish it. Publishing tells everybody once and cannot be undone quietly.",
      terms: ["publish", "draft"] },
    "about-people": { id: "about-people", title: "Who is here", screen: "people",
      body: "Invite somebody by email. They join by signing in as that address — there is nothing to accept.",
      terms: ["invite", "seat"] },
  },

  whitelabel: { surfaces: ["shell", "email"], entitlement: "publishing" },

  /* ⚠️ A pack has a real price. Credits for nothing is always a catalogue
     mistake rather than a promotion — a promotion is a discount on a price,
     which stays a price. */
  packs: [
    { id: "small", name: "1,000 credits", credits: 1000, price: 900, currency: "EUR", order: 0 },
    { id: "large", name: "5,000 credits", credits: 5000, price: 3900, currency: "EUR", order: 1 },
  ],

  /* ⚠️ The ceiling the reserve is computed from — never "whatever it returns".
     A meter with no ceiling reserves nothing and settles at whatever arrived. */
  meters: {
    "note.draft": { id: "note.draft", label: "Draft a note", lane: "text", maxOutput: 800 },
  },
  lanes: ["text"],

  jobs: {
    tidy: {
      id: "tidy", label: "Tidy old drafts",
      why: "Removes drafts nobody has touched, so the list stays worth reading.",
      schedule: "0 3 * * *", scope: "per-tenant",
      onFail: { then: "park" },
      rerunnable: true,
      /* ⚠️ A floor, because a retention misread as zero shreds on the first run
         — correctly, at speed, reporting success. */
      destroys: { floorDays: 30 },
      budgetSeconds: 20,
    },
  },
});

/* ⚠️ A THUNK, BECAUSE COMPOSITION IS LAZY (D4). Exporting the composed surface
   would put every app's route table in the startup budget of every request. */
export const hello = (): AppSpec => HELLO;
