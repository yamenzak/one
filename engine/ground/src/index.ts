/**
 * THE GROUND — THE SMALLEST COMPLETE APP ON ENGINE, AND NOT A PRODUCT.
 *
 * ⚠️ IT IS NEVER SOLD AND NEVER MOUNTED. The deployment's catalogue is the
 * directories under `engine/apps`; this one is not among them, is absent from
 * `APPS` and `SELLS`, and has no browser half a workspace could load. It was in
 * all three once — so a person who came for one product founded a workspace
 * holding a notebook demo they never asked for, with sample records in it, and
 * only an operator could take it away. `scripts/ground.test.mjs` refuses it back.
 *
 * ⚠️ WHAT IT IS FOR IS PROOF. Every claim the framework makes — that an app
 * declares and the platform derives — is asserted against this manifest, because
 * a claim tested against nothing is a sentence. It declares every cross-cutting
 * concern deliberately, even the ones a toy would not need: anything absent here
 * is a thing no test covers.
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
  area, collection, defineApp, field, flag, notification, operation, purpose, setting,
  vaultField, vaultKeyFor,
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
  /*
    ⚠️ THE WHOLE OF WHAT A SEARCHABLE COLLECTION DECLARES. From this: the ledger
    row every write leaves, the job that carries the text to the index, the
    removal on delete and on erasure, and a `note.search` operation with the
    workspace's own boundary already in it. Nothing else is written anywhere.

    ⚠️ AND IT NAMES FIELDS RATHER THAN SAYING `true`. What is listed here leaves
    this database — it is chunked and embedded in a service that cannot un-say a
    chunk — so `ask` (somebody else's address) and `extra` (whatever an app put
    in it) are absent on purpose rather than by oversight.
  */
  searchable: ["title", "body"],
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
    /* ⚠️ SOMEBODY ELSE'S ADDRESS, so it says so — and ground's processing record
       is generated from exactly this word rather than written by hand. */
    ask: field.email({ label: "Who to ask", holds: "contact" }),
    cover: field.media({ label: "Cover", holds: "none", purpose: "note-cover" }),
    /* ⚠️ A note points at the note it came out of, which is the same collection.
       A reference needs no second collection to be real. */
    follows: field.ref({ label: "Follows", holds: "none", to: "note" }),
    extra: field.json({ label: "Extra", holds: "none" }),
  },
});

/**
 * ⚠️ THE SECOND SCOPE, AND A REFERENCE APP HAS TO CARRY IT. `note` is the
 * workspace's — everybody who can read notes reads all of them. A check-in is
 * the PERSON's: `scope.of` is `subject`, so the generated verbs filter by
 * whoever is asking and somebody's own week is theirs by construction rather
 * than by a handler remembering a `WHERE`. An app that declared only tenant
 * scope would leave the other half of the mechanism unexercised, and the half
 * that is unexercised is the one that erases a person's records.
 */
const checkIn = collection({
  id: "check-in",
  label: { one: "Check-in", many: "Check-ins" },
  scope: { of: "subject", column: "person" },
  permission: "check-in",
  /* ⚠️ THE SAME TWO YEARS THE `wellbeing` PURPOSE PUBLISHES. A collection whose
     retention outlives the purpose it was collected for is a promise the record
     of processing makes and the database contradicts — and the record is the
     half a person reads. */
  retention: 730,
  onClose: { then: "purge" },
  /* ⚠️ THE OTHER HALF OF THE OFFLINE LANE, AND A REFERENCE APP HAS TO CARRY IT.
     `note` is `queue` — somebody writes one with no signal and it is held; a
     check-in is somebody's own week, which they read far more often than they
     write, so what it wants is the last answer rather than a held write. With
     only `queue` declared anywhere, the cache branch had no instance and no test
     could reach it — which is how a lane comes to be half wired. */
  offline: "cache",
  fields: {
    /* ⚠️ THE SCOPE COLUMN IS A DECLARED FIELD AND IS NEVER WRITTEN BY THE
       CALLER. It is declared so erasure can find it and the generated schema can
       create it; the platform fills it from who is asking, and a value sent for
       it is discarded rather than honoured. */
    person: field.text({ label: "Whose", holds: "none" }),
    week: field.day({ label: "Week beginning", required: true, holds: "none" }),
    went: field.enum({
      label: "How it went", required: true, holds: "none",
      values: ["great", "fine", "hard"],
    }),
    said: field.long({ label: "Anything to say", holds: "none", max: 4_000 }),
    /*
      ⚠️ THE ONE FIELD IN THIS APP THAT IS NOT THE APP'S TO KEEP (D11). How
      somebody is actually doing is health data, and the manifest refuses it in a
      product table — so it is a POINTER here and the value lives encrypted in
      the vault, behind a purpose, behind a recorded grant, erasable by
      destroying one salt.

      ⚠️ AND IT IS HERE BECAUSE THE REFERENCE APP IS THE TEMPLATE. Every app on
      this platform is copied out of this one, and for a long time this manifest
      declared no vault field, no purpose and no sub-processor at all — so the
      whole custody half of the framework had no instance anywhere, and nothing
      that used it could be exercised by any test.
    */
    struggling: field.long({
      label: "Anything you are struggling with", holds: "sensitive", vault: true,
      max: 4_000, help: "Only you and whoever you grant it to can read this.",
    }),
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
const publish = operation<Publish, { id: string; title: string; published: boolean }>({
  id: "note.publish",
  kind: "write",
  summary: "Make a note visible to everybody here",
  input: { id: field.text({ label: "Note", required: true, holds: "none" }) },
  output: {
    id: field.text({ label: "Note", holds: "none" }),
    /* ⚠️ ANSWERED BECAUSE THE NOTIFICATION READS IT. `note.published` says
       "{who} published {title}", and the platform fills a variable from what the
       operation DECLARED — input or output. A title that stayed on the record
       and out of the answer would reach an inbox as the literal `{title}`. */
    title: field.text({ label: "Title", holds: "none" }),
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
    const found = await db.prepare(`SELECT id, title FROM note WHERE id = ? AND tenant_id = ?`)
      .bind(input.id, c.tenantId).first() as { title?: string } | null;
    if (!found) c.fail("platform.not_found");
    await db.prepare(`UPDATE note SET pinned = 1 WHERE id = ? AND tenant_id = ?`)
      .bind(input.id, c.tenantId).run();
    return { id: input.id, title: found?.title ?? "", published: true };
  },
});

/**
 * ⚠️ THE `action` CATEGORY NEEDS AN INSTANCE OR ITS RULE HAS NONE. A reference
 * app is copied, so anything absent here is absent from every app after it — and
 * what was absent was the one notification kind that may not be silenced.
 * `refusePolicy` refuses muting an `action`, and with nothing in this manifest
 * raising one, the rule had nothing to be applied to and no test could reach it.
 */
const ask = operation<{ id: string; who: string }, { asked: boolean }>({
  id: "note.ask",
  kind: "write",
  summary: "Ask somebody to look at a note",
  input: {
    id: field.text({ label: "Note", required: true, holds: "none" }),
    who: field.text({ label: "Who", required: true, holds: "none" }),
  },
  output: { asked: field.bool({ label: "Asked", holds: "none" }) },
  permission: "note:write",
  idempotency: { mode: "none" },
  emits: ["note.review_asked"],
  outcome: { message: "Asked.", tone: "success" },
  async handler(_ctx, input) {
    return { asked: Boolean(input.id) };
  },
});

/**
 * ⚠️ A GENERATING OPERATION NAMES A LANE AND A PROMPT, NEVER A MODEL (D19).
 * Which row it runs on is the operator's binding; the prompt is a letterhead
 * whose variables are declared, and `brandable` says a workspace may put it in
 * its own voice — which a drafting tone should be, and an extraction rule
 * should not.
 */
const draft = operation<{ about: string; stream?: boolean }, { text: string }>({
  id: "note.draft",
  kind: "write",
  summary: "Draft a note from a line about it",
  input: {
    about: field.text({ label: "About", required: true, holds: "none" }),
    /* ⚠️ HOW THE ANSWER ARRIVES, NOT WHAT IT SAYS. Declared as an input so it
       goes through the same validation everything else does — and so the tool
       catalogue an agent reads knows the option exists. */
    stream: field.bool({ label: "Send it as it is written", holds: "none" }),
  },
  output: { text: field.text({ label: "Draft", holds: "none" }) },
  permission: "note:write",
  idempotency: { mode: "none" },
  outcome: { why: "the answer IS the report — the draft arrives in the editor that asked for it" },
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
  async handler(ctx, input) {
    /*
      ⚠️ THE HANDLER SUPPLIES VALUES AND NOTHING ELSE. Which model, whose words
      and what it costs are resolved by the platform from the declaration above,
      the operator's binding and this workspace's own choice — so this cannot
      name a model, cannot skip the reserve and cannot send instructions nobody
      agreed to.

      ⚠️ AND ITS ABSENCE IS A REFUSAL RATHER THAN A STUB. A deployment with no
      gateway configured cannot generate; answering with a plausible sentence
      would be this product inventing content and charging nothing for it, which
      is indistinguishable from working.
    */
    const c = ctx as {
      generate?: (values: Readonly<Record<string, string>>) =>
        Promise<{ readonly text: string; readonly credits: number } | string>;
      stream?: (values: Readonly<Record<string, string>>) => Promise<Response | string>;
      fail: (code: string, values?: Record<string, string>, extra?: { ref?: string }) => never;
    };
    /*
      ⚠️ THE SAME RUN, WORD BY WORD, WHEN THE CALLER ASKED FOR IT. A paragraph
      takes seconds to generate and a spinner over those seconds reads as
      something being stuck — so the caller says `stream` and gets the words as
      they arrive. It is the SAME action, the same model, the same words and the
      same charge; only the shape of the answer differs.

      ⚠️ AND ITS ABSENCE FALLS BACK RATHER THAN REFUSING. A deployment with no
      gateway has no stream and no generation either, so the refusal below is
      the one that fires; a deployment that has one but cannot stream would
      still rather answer late than not at all.
    */
    if (input.stream && c.stream) {
      const live = await c.stream({ about: input.about });
      if (typeof live === "string") c.fail("platform.unavailable", {}, { ref: live });
      return live as never;
    }
    if (!c.generate) c.fail("platform.unavailable");
    const out = await c.generate!({ about: input.about });
    if (typeof out === "string") c.fail("platform.unavailable", {}, { ref: out });
    return { text: (out as { text: string }).text };
  },
});


/**
 * WHAT A NEW NOTE STARTS AS — the workspace's own answer, not the form's.
 *
 * ⚠️ THIS IS THE INSTANCE THAT PROVES A SETTING REACHES CODE. Two settings say
 * in their own help text what a new note starts as; without a handler that reads
 * one, they were a switch somebody presses that persists, is drawn back to them,
 * and changes nothing anywhere.
 *
 * ⚠️ AND IT HAS TO BE AN OPERATION RATHER THAN THE FORM READING `setting.read`,
 * because both settings are `tenant` level and `needs: "tenant:manage"`. A staff
 * member writing a note holds `note:write` and not that — so the screen cannot
 * see them, and must still honour them. The platform resolves the value; the
 * caller is told only the consequence.
 */
const start = operation<Record<string, never>, {
  kind: string; pinned: boolean; signature: string;
}>({
  id: "note.start",
  kind: "read",
  summary: "What a new note starts as here",
  input: {},
  output: {
    kind: field.text({ label: "Kind", holds: "none" }),
    pinned: field.bool({ label: "Pinned", holds: "none" }),
    signature: field.text({ label: "Sign-off", holds: "none" }),
  },
  permission: "note:write",
  idempotency: { mode: "none" },
  async handler(ctx) {
    /* ⚠️ THE DECLARED HANDLER'S CONTEXT IS `unknown` IN THE KERNEL, deliberately
       — the kernel may not name a runtime type. The narrowing is the app's, and
       it is the same one every written handler here does. */
    const c = ctx as { setting: (id: string) => Promise<unknown> };
    /* ⚠️ NO DEFAULT OF ITS OWN, DELIBERATELY. The declaration carries the
       fallback and the platform resolves it, so a handler adding `?? "idea"`
       here would be a second answer to what a new note starts as — and it would
       MASK the platform failing to apply the declared one, which is how a screen
       and a handler come to disagree about what a workspace switched on. */
    /* ⚠️ AND THE PERSON'S OWN SIGN-OFF, WHICH IS WHY THIS ANSWER MIXES LEVELS.
       Two of these are the workspace's and one is the reader's, and a caller
       cannot tell — nor should it: what a new note starts as is one question,
       and splitting it by whose setting supplied each part would put the
       platform's resolution order into a screen. */
    return {
      kind: String(await c.setting("notes.default_kind")),
      pinned: (await c.setting("notes.default_pinned")) === true,
      signature: String((await c.setting("notes.signature")) ?? ""),
    };
  },
});

/**
 * ⚠️ THE PLATFORM CAN SAY "YOURS"; ONLY A PRODUCT KNOWS WHO ELSE MAY LOOK. The
 * generated verbs on a subject-scoped collection answer with the caller's own
 * records and nothing else — which is the safe half and cannot be configured
 * wrong. Reading somebody ELSE's is a different question, so it is a declared
 * operation with a permission of its own, and the two are visibly different
 * things in the route table rather than one verb with a parameter.
 */
const teamCheckIns = operation<{ week: string }, {
  items: readonly unknown[]; target: number;
}>({
  id: "check-in.team",
  kind: "read",
  summary: "Everybody's check-in for a week",
  input: { week: field.day({ label: "Week beginning", required: true, holds: "none" }) },
  /* ⚠️ THE TARGET TRAVELS WITH THE COUNT, because a report that answers "twelve"
     and leaves the reader to find out what twelve is measured against is two
     round trips and a chance for the two to disagree. The number is the
     workspace's own setting, resolved by the platform. */
  output: {
    items: field.json({ label: "Check-ins", holds: "none" }),
    target: field.number({ label: "A week is measured against", holds: "none" }),
  },
  permission: "check-in:review",
  idempotency: { mode: "none" },
  async handler(ctx, input) {
    const c = ctx as { db: unknown; setting: (id: string) => Promise<unknown> };
    const db = c.db as {
      prepare(q: string): { bind(...v: unknown[]): { all<T>(): Promise<{ results: T[] }> } };
    };
    /* ⚠️ TOGETHER, because the setting is not derived from the rows and awaiting
       it after them would be a second wait for a number the platform already
       holds. */
    const [rows, target] = await Promise.all([
      db.prepare(`SELECT id, person, week, went, said FROM check_in WHERE week = ? ORDER BY at`)
        .bind(input.week).all<Record<string, unknown>>(),
      c.setting("notes.weekly_target"),
    ]);
    return { items: rows.results, target: Number(target ?? 0) };
  },
});

/**
 * ⚠️ COMMERCIAL-ONLY, AND IT IS NOT AN ENTITLEMENT. A shared note carries the
 * workspace's own brand on a page people outside it read — so a PERSONAL
 * workspace cannot do it at any price, because it has no brand and is trading
 * under nobody's name. The refusal says "make this a business", which is the
 * only sentence that leads anywhere; "change your plan" would send somebody to a
 * price list where nothing they can buy would help.
 */
const share = operation<{ id: string }, { id: string; url: string }>({
  id: "note.share",
  kind: "write",
  summary: "Put a note on a page anybody can read",
  input: { id: field.text({ label: "Note", required: true, holds: "none" }) },
  output: {
    id: field.text({ label: "Note", holds: "none" }),
    url: field.url({ label: "Where it is", holds: "none" }),
  },
  permission: "note:write",
  commercial: true,
  idempotency: { mode: "natural", key: "id" },
  emits: ["note.shared"],
  outcome: { message: "Shared.", tone: "success", invalidates: ["note.list"] },
  async handler(_ctx, input) {
    return { id: input.id, url: `/read/${input.id}` };
  },
});

/* --------------------------------------------------------------- the rest --- */

export const GROUND: AppSpec = defineApp({
  id: "ground",
  name: "The ground",
  mark: "◇",

  access: {
    permissions: [
      "note:read", "note:write",
      "check-in:read", "check-in:write",
      /* ⚠️ A THIRD KEY, BECAUSE READING SOMEBODY ELSE'S IS NOT READING. Folding
         it into `check-in:read` would mean the key somebody needs to write their
         own week is the key that opens everybody's. */
      "check-in:review",
    ],
    /*
      ⚠️ APP ROLES ONLY (D15). Workspace authority — the roster, the settings,
      the bill — is the platform's four offices, and an app naming those keys
      in a bundle is refused at composition.
    */
    roles: {
      writer: ["note:read", "note:write", "check-in:read", "check-in:write", "check-in:review"],
      /* ⚠️ A reader writes their OWN check-in and cannot read the team's, which
         is the shape every product with customers in it has. */
      reader: ["note:read", "check-in:read", "check-in:write"],
    },
    founding: "writer",
    /* ⚠️ Seats count PLATFORM staff — a person is on the team or they are not,
       however many products the team uses. */
    seats: { counts: ["owner", "manager", "staff"], entitlement: "seats" },
  },

  /*
    ⚠️ KEYS ONLY, AND NONE OF THEM THE PLATFORM'S. An app declares what IT sells;
    the deployment's plans say how many of each every tier gets. `seats` was
    declared here and is gone: the roster is the workspace's, `member.invite` is
    the engine's gate, and two products each naming it is two answers to how many
    people a workspace may have — `refuseManifest` refuses one now.
  */
  entitlements: {
    notes: { label: "Notes", withheld: "quota" },
    publishing: { label: "Publishing", withheld: "gate" },
  },

  collections: [note, checkIn],

  /*
    ⚠️ A VIEW IS A DECLARED READ OVER ONE COLLECTION, and `unreadViews` refuses
    one no screen reads — so this list can only ever hold what something draws.
    Newest first is the order a note list wants: what somebody wrote last is
    what they came back for.
  */
  views: [
    /*
      ⚠️ NO `sort`, AND THAT IS THE ORDER IT WANTS. The first draft asked for
      `at` descending and the kernel refused it — `at` is the row's own column
      rather than a field this collection declares, so a view may not name it.
      The refusal is right and the sort was redundant: newest-first is what a
      view answers with when it names none, which is what a note list wants
      anyway. What somebody wrote last is what they came back for.
    */
    { id: "every-note", of: "note", limit: 50 },
    /*
      ⚠️ THREE VIEWS THAT EXIST TO BE COUNTED, NOT TO BE LISTED, and that is a
      shape worth having in the reference. A supporting figure is `count` over a
      NARROWED view — the same mechanism the hero uses, pointed at a subset —
      so "how many are pinned" needs no field on the collection, no counter for
      an operation to keep in step, and no arithmetic in a screen.

      ⚠️ AND THEY CARRY NO `limit`, DELIBERATELY, WHERE THE LIST ABOVE DOES. A
      limit is a ceiling on ROWS; `count` answers the total either way (that is
      what `Viewed.count` is for), but a limited view whose rows nothing draws is
      a page of records fetched to be thrown away.
    */
    { id: "pinned-notes", of: "note", where: [{ field: "pinned", is: { literal: true } }] },
    { id: "open-questions", of: "note", where: [{ field: "kind", is: { literal: "question" } }] },
    { id: "decisions", of: "note", where: [{ field: "kind", is: { literal: "decision" } }] },
    { id: "ideas", of: "note", where: [{ field: "kind", is: { literal: "idea" } }] },
  ],
  operations: [publish, ask, draft, start, teamCheckIns, share],

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
    /*
      ⚠️ THE FIRST SCREEN IN THIS REPOSITORY DRAWN FROM WHAT IT DECLARES, and it
      is the ground's because the ground is where a framework claim is asserted
      before a product depends on it. A list of one collection is the smallest
      honest body: a view, a block, and the words its emptiness means.

      ⚠️ AND `shows` IS WHY IT IS A DECLARATION RATHER THAN A GUESS. Which fields
      become columns, in what order and under what words, is a decision no
      component can derive from a row — see `Listing`'s own header, which has
      said so since it was written.
    */
    { id: "notes", route: "/", label: "Notes", nav: "primary", icon: "note",
      permission: "note:read", tone: "neutral",
      body: {
        shape: "list",
        /*
          ⚠️ A GRID, AND WHAT IT IS FOR IS THE THREE FIGURES UNDER THE HERO. A
          stack would put each of them on a line of its own — three cards, each
          one number wide, down a third of a phone — and the whole point of a
          supporting figure is that it is read at a glance BESIDE the others.
          `least: "tile"` is a narrowest cell rather than a column count, so it
          is three across on a desk and two on a phone without a breakpoint.

          ⚠️ AND THE LIST TAKES THE WHOLE ROW, WHICH IS WHY IT SPANS. A table in
          a tile-wide cell is a table with one column of truncated titles beside
          two figures — the layout would be obeying the declaration and the
          screen would be unreadable.
        */
        layout: { as: "grid", least: "tile" },
        /*
          ⚠️ WHAT SOMEBODY OPENING THIS CAME FOR, AND IT IS NOT THE LIST. The
          rows are there to be scrolled; the question a person asks on arriving
          is how much of this there is, which is one number and was previously
          nowhere on the screen at all — so the page opened with a heading and a
          table and nothing to land on.

          ⚠️ AND THE EMPTY SENTENCE IS NOT THE LIST'S. A workspace with no notes
          gets "Nothing written yet" HERE, in the biggest type on the screen,
          and "No notes yet" in the region below — two different sentences
          because they answer two different questions: whether anything has
          happened, and what to do about it.
        */
        hero: {
          as: "figure",
          nothing: { says: "Nothing yet", under: "Write one and it will be counted here" },
          bind: {
            value: { from: { of: "count", view: "every-note" } },
            /* ⚠️ NOT THE SCREEN'S OWN NAME AGAIN. The frame draws "Notes" a line
               above this, so an eyebrow reading "Notes in this workspace" is the
               same word twice in the two loudest ranks on the page — which is
               how a hero comes to look like a heading with a number under it. */
            of: { from: { of: "words", says: "Written so far" } },
            unit: { from: { of: "words", says: "notes" } },
            fresh: { from: { of: "words", says: "The most recent was on Thursday" } },
            mark: { from: { of: "words", says: "note" } },
          },
          /* ⚠️ THREE, AND NONE OF THEM IS THE SCREEN ITSELF. A shortcut back to
             where somebody already is is the shape a breadcrumb has, and it is
             the first thing a row of them collects. */
          leads: ["write", "search", "reports"],
        },
        /*
          ⚠️ THE HERO IS ONE NUMBER AND THE SCREEN NEEDS FOUR, WHICH IS THE
          WHOLE SHAPE THIS SCREEN EXISTS TO PROVE. A person arriving asks how
          much there is — and then, immediately, how much of it needs them.
          Answering only the first is a page that opens with a total and a
          table, where every follow-up question is a scroll and a count.

          ⚠️ AND ONLY ONE OF THE FOUR IS LOUD. The hero is on its own surface in
          display type; these three are `figure` rank in plain cards. Four
          numbers at one rank is four numbers nobody reads — the eye has to
          choose, and whichever it picks was not a decision anybody made. That
          is `Hero`'s own "two heroes is no hero", one step out.

          ⚠️ FOUR RATHER THAN THREE, AND THE REASON IS ARITHMETIC. A phone fits
          two tile-wide cells, so an odd count leaves the last one alone on a row
          beside a gap — which reads as a card that failed to load rather than as
          the end of a set. Photographed at three, then at four.

          ⚠️ EACH IS A `count` OVER A NARROWED VIEW, so the figure and the list
          behind it can never disagree: pressing through to the pinned notes
          shows the rows the number was counted from, by construction, because
          they are one declaration.

          ⚠️ AND EACH IS A CARD OF ITS OWN (`group: null`) RATHER THAN A BARE
          BLOCK IN A CELL. A `Stat` is a label and a number with no surface
          under it; three of them laid on the page ground read as text that has
          drifted into columns rather than as three things being compared.
        */
        blocks: [
          {
            group: null,
            of: [{
              block: "Stat",
              /* ⚠️ ONE DESTINATION, AND IT IS THE LIST THE NUMBER WAS COUNTED
                 FROM. Both come off `pinned-notes`, so pressing through can never
                 show a different set from the one the tile reported. */
              leads: ["pinned"],
              bind: {
                value: { from: { of: "count", view: "pinned-notes" } },
                label: { from: { of: "words", says: "Pinned" } },
                mark: { from: { of: "words", says: "tag" } },
              },
            }],
          },
          {
            group: null,
            of: [{
              block: "Stat",
              leads: ["questions"],
              bind: {
                value: { from: { of: "count", view: "open-questions" } },
                label: { from: { of: "words", says: "Questions open" } },
                mark: { from: { of: "words", says: "alert" } },
                /* ⚠️ THE ONE TONE ON THIS SCREEN, AND IT IS A VERDICT RATHER THAN
                   A HUE. An open question is the only one of the four that is
                   waiting on somebody; a tone on all of them would make this
                   the third colour in a set instead of the one thing to look at. */
                tone: { from: { of: "words", says: "warning" } },
              },
            }],
          },
          {
            group: null,
            of: [{
              block: "Stat",
              leads: ["decisions"],
              bind: {
                value: { from: { of: "count", view: "decisions" } },
                label: { from: { of: "words", says: "Decisions" } },
                mark: { from: { of: "words", says: "check" } },
              },
            }],
          },
          {
            group: null,
            of: [{
              block: "Stat",
              leads: ["ideas"],
              bind: {
                value: { from: { of: "count", view: "ideas" } },
                label: { from: { of: "words", says: "Ideas" } },
                mark: { from: { of: "words", says: "model" } },
              },
            }],
          },
          {
            block: "Listing",
            /* ⚠️ THE WHOLE ROW — see `Wide`. A table in a tile-wide cell is one
               column of truncated titles beside two figures. */
            wide: true,
            shows: [
              { field: "title", label: "Note" },
              { field: "body", label: "What it says" },
            ],
            nothing: {
              says: "No notes yet",
              under: "Write one and it will be here",
            },
            bind: {
              label: { from: { of: "words", says: "Notes" } },
              of: { from: { of: "view", view: "every-note" } },
            },
          },
        ],
      } },
    /*
      ⚠️ FOUR SCREENS THAT ARE THE SAME LIST NARROWED FOUR WAYS, AND THEY EXIST
      BECAUSE THE FIGURES ABOVE THEM DO. A supporting figure is a count over a
      narrowed view; without somewhere to press through to, each of those tiles
      is a dead end on the busiest part of the home screen — and the mechanism
      that opens them would be declared here and reached by nothing, which is the
      exact shape this repository's guards exist to catch.

      ⚠️ AND EACH DRAWS THE VIEW ITS OWN TILE COUNTED. One declaration behind
      both halves is what makes "4 pinned" and the four rows underneath the same
      answer rather than two queries that agree today.

      ⚠️ `nav: "none"` ON ALL FOUR. They are reached from the figure that is about
      them, which is where somebody is already looking; four more items in a bar
      of five would be a nav that is a table of contents for one screen.
    */
    { id: "pinned", route: "/pinned", label: "Pinned", nav: "none", icon: "tag",
      permission: "note:read",
      body: {
        shape: "list",
        layout: { as: "stack" },
        blocks: [{
          block: "Listing",
          shows: [{ field: "title", label: "Note" }, { field: "body", label: "What it says" }],
          nothing: { says: "Nothing pinned", under: "Pin a note and it will be here" },
          bind: {
            label: { from: { of: "words", says: "Pinned" } },
            of: { from: { of: "view", view: "pinned-notes" } },
          },
        }],
      } },
    { id: "questions", route: "/questions", label: "Questions open", nav: "none", icon: "alert",
      permission: "note:read",
      body: {
        shape: "list",
        layout: { as: "stack" },
        blocks: [{
          block: "Listing",
          shows: [{ field: "title", label: "Note" }, { field: "body", label: "What it says" }],
          nothing: { says: "Nothing open", under: "A note written as a question will be here" },
          bind: {
            label: { from: { of: "words", says: "Questions open" } },
            of: { from: { of: "view", view: "open-questions" } },
          },
        }],
      } },
    { id: "decisions", route: "/decisions", label: "Decisions", nav: "none", icon: "check",
      permission: "note:read",
      body: {
        shape: "list",
        layout: { as: "stack" },
        blocks: [{
          block: "Listing",
          shows: [{ field: "title", label: "Note" }, { field: "body", label: "What it says" }],
          nothing: { says: "Nothing decided yet", under: "A note written as a decision will be here" },
          bind: {
            label: { from: { of: "words", says: "Decisions" } },
            of: { from: { of: "view", view: "decisions" } },
          },
        }],
      } },
    { id: "ideas", route: "/ideas", label: "Ideas", nav: "none", icon: "model",
      permission: "note:read",
      body: {
        shape: "list",
        layout: { as: "stack" },
        blocks: [{
          block: "Listing",
          shows: [{ field: "title", label: "Note" }, { field: "body", label: "What it says" }],
          nothing: { says: "Nothing yet", under: "A note written as an idea will be here" },
          bind: {
            label: { from: { of: "words", says: "Ideas" } },
            of: { from: { of: "view", view: "ideas" } },
          },
        }],
      } },
    { id: "people", route: "/people", label: "People", nav: "primary", icon: "people",
      permission: "member:read" },
    /*
      ⚠️ TWO DESTINATIONS, NOT TWO TABS, AND THE SPLIT IS `Level`'S OWN. What the
      whole workspace is set to and what one person prefers are two operations
      with different authorities, different consequences and different readers —
      DESIGN.md §3's first question, which is first because it is the one that
      decides. They were tabs on one screen, and the permission then had to guard
      the screen rather than the half of it that needed guarding: a member with no
      `tenant:manage` could not reach their OWN preferences.
    */
    { id: "settings", route: "/settings", label: "Settings", nav: "none", icon: "cog",
      permission: "tenant:manage" },
    { id: "preferences", route: "/preferences", label: "Your preferences",
      nav: "none", icon: "person", permission: "note:read" },
    /* ⚠️ DECLARED `commercial`, AND IT IS THE APP'S OWN. Sharing a note puts the
       workspace's brand on a page people outside it read, so the list of what is
       out there exists only for a business — and `reachable` does not offer it
       to one that is not, in the gate's own order.

       ⚠️ NOT A BRAND EDITOR. That was here for a day and contradicted D22 on the
       morning it was written: a brand belongs to the WORKSPACE and is edited in
       the hub, once, for every app under it. An app declaring one is how a
       business with three products gets three of them. */
    /* ⚠️ ITS OWN MARK. This wore `star`, which is Getting started's and is in
       the same nav; the registry had no share mark at all, so one was added
       rather than a second screen borrowing a neighbour's. */
    { id: "shared", route: "/shared", label: "Shared", nav: "none", icon: "share",
      permission: "note:read", commercial: true },
    /* ⚠️ Behind one of our switches, which is what makes the flag mean anything:
       a flag no screen and no operation is behind changes nothing when pressed. */
    /* ⚠️ THE CROWN'S MIDDLE, NOT A DESTINATION — see `ScreenSpec.chrome`.
       Searching is something somebody does from wherever they are; a slot in the
       bar makes it a place to go first and say what you wanted second. */
    { id: "search", route: "/search", label: "Search", nav: "none", chrome: "search",
      icon: "search", permission: "note:read", flag: "note-search" },
    /* ⚠️ DECLARED SO THE CHART VOCABULARY HAS A HOME IN A REAL APP. A figure is
       the one part of the design system that cannot be judged from a catalogue —
       it needs a series with a gap in it, an axis, a period to filter by and a
       number beside it — and a screen is where those meet. */
    /* ⚠️ `etch` — ruled geometry, which AMBIENCE.md points at monitoring and
       planning. A sheet of measures is the screen that ground was described for. */
    { id: "reports", route: "/reports", label: "Reports", nav: "primary", icon: "chart",
      permission: "note:read", sky: "etch" },
    /* ⚠️ REACHED FROM A SCREEN RATHER THAN FROM THE NAV, WHICH IS WHAT `none`
       MEANS. A note is opened from the list and written from the list's one
       action; putting either in the nav would advertise two destinations for
       the place somebody is already standing. */
    /* ⚠️ `cloth` — a premium dark ground for a screen somebody stays on. Reading
       a note is the only thing in this app that is not scanning. */
    { id: "note", route: "/note", label: "A note", nav: "none", icon: "note",
      permission: "note:read", sky: "cloth", of: "note",
      /*
        ⚠️ THE SECOND BODY IN THIS REPOSITORY THAT IS THE GROUND'S, and it is
        here for the reason the first one was: a framework claim is asserted
        against the fixture before a product depends on it. What it asserts is
        `Markdown` — prose a workspace WROTE, drawn by the design system rather
        than by whatever markup somebody pasted — which was a registry entry no
        manifest had ever named, so the renderer had never been asked to place
        it and the pairing of its slot to its prop was a claim nothing had made
        good. A note's body is the shape that block exists for.

        ⚠️ AND THE WRITTEN SCREEN STAYS, which is not residue here. `Note.tsx` is
        the board's specimen for a dozen components no declaration reaches — the
        dialog, the confirmation, the presentation, the tabs — and the board is
        where the design system is photographed. What the declaration replaces is
        the LIVE path, exactly as `Notes.tsx` was replaced and kept.
      */
      body: {
        shape: "detail",
        layout: { as: "stack" },
        blocks: [
          { block: "Markdown",
            bind: { of: { from: { of: "field", field: "body" } } } },
          {
            group: "This note",
            of: [
              { block: "FieldRow",
                bind: {
                  label: { from: { of: "words", says: "Kind" } },
                  value: { from: { of: "field", field: "kind" } },
                } },
              { block: "FieldRow",
                when: { has: { of: "field", field: "happened" } },
                bind: {
                  label: { from: { of: "words", says: "Happened on" } },
                  value: { from: { of: "field", field: "happened" } },
                } },
              { block: "FieldRow",
                when: { has: { of: "field", field: "minutes" } },
                bind: {
                  label: { from: { of: "words", says: "Time it took" } },
                  value: { from: { of: "field", field: "minutes" } },
                } },
              /* ⚠️ MINOR UNITS, AND THE FORMATTER IS WHAT KNOWS. A screen
                 formatting its own money is a screen that rounds differently
                 from the bill — see `Money`. */
              { block: "FieldRow",
                when: { has: { of: "field", field: "cost" } },
                bind: {
                  label: { from: { of: "words", says: "What it cost" } },
                  value: { from: { of: "field", field: "cost" }, as: "money" },
                } },
              /* ⚠️ THE CREDITS A DRAFT SPENT, said where somebody would
                 otherwise read the row above as somebody's fee. */
              { block: "NoteRow",
                when: { has: { of: "field", field: "cost" } },
                bind: {
                  children: { from: { of: "words",
                    says: "What it cost is credits a draft spent, not a fee" } },
                } },
            ],
          },
          /* ⚠️ A NOTE POINTS AT THE NOTE IT CAME OUT OF, and that is a reference
             to its own collection — the one hop this vocabulary reaches without
             a second table existing at all. */
          { block: "NavRow",
            when: { has: { of: "field", field: "follows" } },
            goes: { to: "note", by: "follows" },
            bind: {
              label: { from: { of: "words", says: "It follows" } },
              under: { from: { of: "field", field: "follows.title" } },
            } },
          { block: "CopyRow",
            when: { has: { of: "field", field: "link" } },
            bind: {
              label: { from: { of: "words", says: "Link" } },
              value: { from: { of: "field", field: "link" } },
            } },
        ],
      } },
    { id: "write", route: "/write", label: "Write a note", nav: "none", icon: "note",
      permission: "note:write" },
    /* ⚠️ THE APP'S OWN GUIDE, MILESTONES AND HELP HAVE TO LAND SOMEWHERE. All
       three are declared below and were drawn nowhere — a checklist nobody can
       open is a checklist nobody completes, and the manifest cannot tell. */
    /* ⚠️ `glow` — pure light, no marks, which is what a page wants behind it when
       it wants anything. An arrival is the case the family exists for. */
    { id: "start", route: "/start", label: "Getting started", nav: "none", icon: "star",
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
      /* ⚠️ NO PUSH, AND THE NARROWING IS THE POINT. A note going up is worth
         knowing and is not worth a phone lighting up — and a type that offers
         fewer channels than the platform has is what makes `channel_not_offered`
         reachable at all. With every type offering all three, that refusal had
         no instance in the app the next one is copied from. */
      channels: ["inbox", "email"],
    },
    /*
      ⚠️ AN `action` ASKS THE READER TO DO SOMETHING, AND MAY NOT BE SILENCED.
      That is not a screen's rule — `refusePolicy` refuses a policy or a
      preference that leaves it with no interrupting channel, on the write, so
      the API and a bulk import are held to it too.
    */
    "note.review_asked": {
      id: "note.review_asked", label: "Somebody asked you to look",
      summary: "{who} asked you to look at {title}",
      category: "action", author: "theirs", tone: "info", icon: "note",
      needs: "note:read",
      on: "note.review_asked",
      link: "/",
      variables: ["who", "title"],
      channels: ["inbox", "email", "push"],
    },
  },

  /*
    ⚠️ THE PAGES ITS SETTINGS LIVE ON, DECLARED. `group` was a free string that
    made a card heading, so eight settings became one screen of three cards
    holding a switch, a colour and an email address — three kinds of consequence
    in one scroll, which DESIGN.md §3 answers by making them three screens. An
    area is a DESTINATION: it has a mark so a list of them is scannable, and a
    line saying what changing something here affects, because that is what tells
    somebody whether to open it.
  */
  /*
    ⚠️ THE PURPOSE IS THE LEGAL BASIS, AND IT IS WHAT THE CONSENT SHEET SHOWS.
    Declaring it once is what makes the disclosure, the record of processing and
    the bound on every grant the same sentence rather than three.
  */
  purposes: {
    wellbeing: purpose({
      id: "wellbeing",
      label: "Checking in on how you are",
      why: "So the person you report to can see when a week has been hard, and offer something.",
      holdings: ["sensitive"],
      /* Two years, then it goes — a check-in is about a week, not a career. */
      retention: 730,
      /* ⚠️ Refusable: the check-in still works without it, and a purpose the
         product does not depend on must never claim it does. */
    }),
  },

  /*
    ⚠️ THE KEY IS DERIVED FROM WHERE THE FIELD IS — `vaultKeyFor`, never a second
    name written by hand. Two names for one fact is how a column ends up pointing
    at a vault entry that does not exist, which reads on a screen as a value
    somebody never filled in.
  */
  vault: {
    [vaultKeyFor("check-in", "struggling")]: vaultField({
      id: vaultKeyFor("check-in", "struggling"),
      label: "Anything you are struggling with",
      holding: "sensitive",
      purposes: ["wellbeing"],
      help: "Held encrypted. Erased by destroying the key, not by deleting a row.",
    }),
  },

  /*
    ⚠️ NO INFRASTRUCTURE SUB-PROCESSOR IS DECLARED HERE, AND THAT IS THE POINT.
    The database, the bucket and the runtime are the deployment's and every
    product on it inherits them through `under` — this app declared Cloudflare
    itself and the deployment declared it too, which is one list per product to
    keep in step and one chance per product to forget. What belongs here is a
    recipient that is genuinely THIS app's: a gateway only it charges through, a
    model provider only it calls. It has none.
  */

  /*
    ⚠️ THIS APP DECLARES NO `needs` AND STILL GETS A BUCKET, which is the claim
    the whole framework makes. `note.cover` is a `media` field; a media field
    holds files; files live in a bucket — so `needsOf` derives it, the reconciler
    creates it in each jurisdiction, binds it, and the next boot confirms it.
    Nobody edits a config file and nobody runs wrangler.

    ⚠️ A need worth DECLARING here would be one the platform cannot work out: a
    queue this product alone wants, a vector index only it searches. It has
    none.
  */
  settingAreas: {
    notes: area({
      id: "notes", label: "Notes", icon: "note", order: 0,
      said: "What a new note starts as, and what a week is measured against",
    }),
    appearance: area({
      id: "appearance", label: "Appearance", icon: "star", order: 1,
      said: "How notes look here, and how yours are signed",
    }),
    /* ⚠️ NO `email` AREA, AND ITS ABSENCE IS THE POINT. Where a workspace's mail
       comes back to is one address for the whole workspace, not one per product
       — `Branding.replyTo` (D22, the same argument the accent settled). A
       product that declared its own would put a second answer on a second
       screen, and the two would disagree the first time somebody changed one. */
  },

  settings: {
    "notes.default_pinned": {
      id: "notes.default_pinned", level: "tenant", area: "notes",
      field: field.bool({ label: "Pin new notes", holds: "none" }),
      fallback: false, needs: "tenant:manage",
      help: "New notes start at the top of the list.",
    },
    "notes.default_kind": {
      id: "notes.default_kind", level: "tenant", area: "notes",
      field: field.enum({
        label: "What a new note is", holds: "none",
        values: ["idea", "decision", "question", "record"],
      }),
      fallback: "idea", needs: "tenant:manage",
      help: "Whoever writes it can still change it.",
    },
    /* ⚠️ THE FIXTURE'S NUMBER, AND IT STAYS ONE. Reports here draws against
       twenty because the ground has no live half to draw against a workspace's
       own records (D52) — so this setting is what a REAL app's report would
       read, declared so the shape is proved, and nothing here reads it. */
    "notes.weekly_target": {
      id: "notes.weekly_target", level: "tenant", area: "notes",
      field: field.number({ label: "Notes a week", holds: "none", min: 0, max: 500 }),
      fallback: 20, needs: "tenant:manage",
      help: "What Reports measures a week against.",
    },
    /*
      ⚠️ THERE IS NO PER-APP COLOUR HERE, AND THERE WAS. `notes.accent` was
      declared, rendered and saved for as long as nothing painted a workspace's
      own colour — a control somebody pressed and believed, which is worse than
      a feature that is absent. Stage 41 gave the paint its real home: a colour
      belongs to the WORKSPACE and never to one app, because a business running
      three of our products has one identity and an accent per app would give it
      three with two of them stale (`brand.ts`). `field.colour` picking a
      control rather than a text box is proved where the control is, in
      `design/test/surface.test.tsx`.
    */
    "notes.density": {
      id: "notes.density", level: "person", area: "appearance",
      field: field.enum({ label: "Density", holds: "none", values: ["comfortable", "compact"] }),
      fallback: "comfortable",
    },
    /* ⚠️ DECLARED WITH NOTHING TO SIGN, ON PURPOSE. The ground has no composer —
       `onNew` is wired to nothing — so this proves a person-level text setting
       renders and saves, which is the whole reason a fixture declares it (D52). */
    "notes.signature": {
      id: "notes.signature", level: "person", area: "appearance",
      field: field.text({ label: "How you sign a note", holds: "none", max: 60 }),
      fallback: "",
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
  /* ⚠️ BOTH AXES, BECAUSE A CHECKLIST WITH ONLY ONE IS WRONG FOR HALF THE
     WORKSPACE. Writing and drafting are things a pair of hands learns, so each
     person gets their own; publishing is the workspace discovering it has a
     public face, which happens once. Merged, somebody invited on a Tuesday opens
     a finished checklist and is taught nothing. */
  guide: {
    "first-note": { id: "first-note", label: "Write your first note",
      why: "It is the whole product.", done: "note.created", link: "/",
      who: "person", order: 1 },
    /* ⚠️ EVERY STEP IS TICKED BY AN EVENT THIS APP ACTUALLY RAISES. A step whose
       `done` nothing emits is a box that can never be crossed off, and the
       manifest refuses one at composition rather than letting it sit there. */
    "draft-one": { id: "draft-one", label: "Let it draft one for you",
      why: "It is the fastest way to see what a note is.", done: "note.drafted",
      link: "/write", who: "person", order: 2 },
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
      body: "A note belongs to the workspace. Everybody who can read notes can read all of them." },
    "about-publishing": { id: "about-publishing", title: "Publishing", screen: "notes",
      body: "A draft is yours until you publish it. Publishing tells everybody once and cannot be undone quietly." },
    "about-people": { id: "about-people", title: "Who is here", screen: "people",
      body: "Invite somebody by email. They join by signing in as that address — there is nothing to accept." },
  },

  /* ⚠️ WHICH SURFACES THIS APP HAS, AND NOT WHO MAY PAINT THEM. The brand is
     the WORKSPACE's and it reaches every app under it; whether it may have one
     at all is `mayBrand(kind)`, which is the same answer in every product. */
  whitelabel: { surfaces: ["email"] },

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
      /*
        ⚠️ THE BODY, AND FOR THREE STAGES THERE WAS NOT ONE. Everything above
        this line was declared, validated and drawn on the operator's console,
        and no code anywhere read the book to run it — so the row said "Has
        never run" and always would have. A declaration whose work lives
        somewhere else is a declaration something has to remember to wire up;
        this one is the reference app, so the shape it shows is the shape every
        app after it will copy.

        ⚠️ AND IT USES ITS OWN DECLARED FLOOR RATHER THAN A SECOND NUMBER. Thirty
        days is written once, above, where `refuseJob` can see it — a body with a
        literal of its own is the configuration and the guard disagreeing, which
        is the state a floor exists to make impossible.
      */
      async work(ctx) {
        const floor = 30;
        const db = ctx.db as {
          prepare(q: string): {
            bind(...v: unknown[]): { run(): Promise<{ meta?: { changes?: number } }> };
          };
        };
        const before = new Date(Date.parse(ctx.now) - floor * 86_400_000).toISOString();
        /* ⚠️ A DRAFT IS AN UNPINNED NOTE WITH NO BODY. Deleting by age alone
           would take a short note somebody wrote once and meant to keep.

           ⚠️ AND `edited_at` FALLS BACK TO `at`, because a note nobody has
           edited has no edit date — read on its own it is NULL, the comparison
           is never true, and the job reports success having swept nothing. The
           two provenance columns are the platform's (`columnsFor`); there is no
           `updated_at` here. */
        const out = await db.prepare(
          `DELETE FROM note
            WHERE tenant_id = ? AND pinned = 0
              AND (body IS NULL OR body = '') AND COALESCE(edited_at, at) < ?`)
          .bind(ctx.tenantId, before).run();
        const gone = out.meta?.changes ?? 0;
        return { touched: gone, detail: gone ? `${gone} emptied draft(s)` : "nothing was stale" };
      },
    },
  },
});

/* ⚠️ A THUNK, BECAUSE COMPOSITION IS LAZY (D4). Exporting the composed surface
   would put every app's route table in the startup budget of every request. */
export const ground = (): AppSpec => GROUND;
