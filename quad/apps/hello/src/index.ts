/**
 * THE SMALLEST COMPLETE APP ON QUAD.
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
} from "@quad/kernel";

/* ------------------------------------------------------------ collections --- */

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
  operations: [publish],

  screens: [
    { id: "notes", route: "/", label: "Notes", nav: "primary", icon: "note",
      permission: "note:read", sky: "calm", tone: "neutral" },
    { id: "people", route: "/people", label: "People", nav: "primary", icon: "people",
      permission: "member:read" },
    { id: "settings", route: "/settings", label: "Settings", nav: "secondary", icon: "cog",
      permission: "tenant:manage" },
    /* ⚠️ Behind one of our switches, which is what makes the flag mean anything:
       a flag no screen and no operation is behind changes nothing when pressed. */
    { id: "search", route: "/search", label: "Search", nav: "secondary", icon: "search",
      permission: "note:read", flag: "note-search" },
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
    "notes.density": {
      id: "notes.density", level: "person", group: "Appearance",
      field: field.enum({ label: "Density", holds: "none", values: ["comfortable", "compact"] }),
      fallback: "comfortable",
    },
  },

  flags: {
    "note-search": {
      id: "note-search", label: "Search", why: "Being tried before it goes to everybody.",
      stage: "trying", fallback: false, setBy: "tenant", retire: "2026-12-31" as never,
    },
  },

  guide: {
    "first-note": { id: "first-note", label: "Write your first note",
      why: "It is the whole product.", done: "note.created", link: "/", order: 1 },
  },

  milestones: {
    "first-published": { id: "first-published", label: "First published note",
      said: "Everybody in the workspace can see it now.", on: "note.published",
      tone: "success", icon: "star" },
  },

  help: {
    "about-notes": { id: "about-notes", title: "About notes", screen: "notes",
      body: "A note belongs to the workspace. Everybody who can read notes can read all of them.",
      terms: ["note", "share", "who can see"] },
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
