/**
 * ONEINVENTORY — everything, counted.
 *
 * ⚠️ ONE MODEL, AND THE SETTING IS A PROFILE RATHER THAN A PREMISE. A basement,
 * a clinic's stock room, a hospital's wards and a factory's stores are the same
 * three questions — what is it, where is it, how many — asked at different
 * DEPTHS. The product that serves all four is not four products sharing a login;
 * it is one model where depth is a choice per PRODUCT, never per company.
 *
 * ⚠️ AND THE WHOLE OF THIS FILE IS A DECLARATION. The tables, the CRUD, the
 * screens, the settings screens, the erasure cascade, the quota counting, the
 * audit row on every write, the agent's tool catalogue and the offline lane are
 * all derived from what is below — see `../docs/ONEINVENTORY-PLAN.md` Part X.
 */

import {
  area, collection, defineApp, field, operation, setting,
  type AppSpec,
} from "@engine/kernel";
import { LADDER, MOVES, applyMove, refuseMove, type Move } from "./ledger.js";

/* ------------------------------------------------------------ collections --- */

/**
 * A PRODUCT IS A TYPE, NOT A THING ON A SHELF.
 *
 * ⚠️ `tracking` IS THE LADDER, AND IT IS THE WHOLE ANSWER TO "ONE APP FOR A
 * BASEMENT AND A HOSPITAL". Everything starts `counted` — a number per location
 * and nothing else — and only what earns it is promoted: `batched` when a
 * delivery has an expiry or a lot to keep, `itemised` when one object has a life
 * of its own. A workspace never chooses a MODE; each product carries its own
 * depth, so the same catalogue holds screws and a forklift.
 *
 * ⚠️ AND THE BASE UNIT IS A DECISION, USUALLY THE BOX. A pharmacy issues
 * tablets; a ward issues boxes; a workshop never opens one for accounting
 * purposes. Getting it wrong is not a rounding error — it is a screen reading
 * "9.97 boxes", which is nonsense somebody stops trusting immediately.
 */
const product = collection({
  id: "product",
  label: { one: "Product", many: "Products" },
  scope: { of: "tenant" },
  permission: "product",
  retention: null,
  onClose: { then: "purge" },
  quota: "products",
  /* ⚠️ A phone reads the catalogue in the back of a warehouse with no signal —
     and writing one there is how an unknown thing gets recorded at all. */
  offline: "queue",
  /*
    ⚠️ WHAT LEAVES THIS DATABASE TO BE FOUND BY MEANING, NAMED ONE FIELD AT A
    TIME. `labelText` is the OCR of the picture somebody took, and it is here
    because "the blue stuff we use for the moulds" is how people actually search
    for things they cannot name. What is absent is deliberate: a supplier's
    reference and a storage instruction are facts about a relationship and a
    hazard, and neither is a phrase anybody types into a search box.
  */
  searchable: ["name", "brand", "labelText"],
  fields: {
    name: field.text({ label: "Name", required: true, holds: "none", max: 200 }),
    brand: field.text({ label: "Brand", holds: "none", max: 120 }),
    category: field.text({ label: "Category", holds: "none", max: 120 }),
    /* ⚠️ THE LADDER, AND `listed` IS THE RUNG THAT MATTERS MOST. A thing nobody
       counts still has a place, a photograph, a manual and a service date — which
       is most of what a home or an office actually needs, and what no inventory
       product offers. */
    tracking: field.enum({
      label: "Tracked as", required: true, holds: "none",
      values: [...LADDER],
      help: "Listed is a thing you never count. Counted is a number. Batched keeps deliveries apart.",
    }),
    /* ⚠️ THE NAME OF THE THING A QUANTITY IS IN — "glove", "box", "kg". It is
       shown beside every number this product ever reports, so a workspace that
       counts boxes reads boxes everywhere rather than a bare figure. */
    unit: field.text({ label: "Counted in", required: true, holds: "none", max: 24 }),
    /* ⚠️ `whole` MEANS THE PACK IS THE BASE UNIT AND THERE IS NO SMALLER NUMBER.
       Tessa called it `divisible` and it was doing real work: it is what decides
       whether a half is a legitimate quantity or a fault. */
    whole: field.bool({ label: "Whole units only", holds: "none" }),
    /* ⚠️ WHEN TO SAY SOMETHING, NOT WHEN TO REFUSE. Stock is not a permission —
       running out is a fact about the world, and an app that refused a take
       because a number went under a line would be an app people work around. */
    par: field.number({ label: "Tell me below", holds: "none", min: 0 }),
    photo: field.media({ label: "Photo", holds: "none", purpose: "product-photo" }),
    /* ⚠️ READ OFF THE PHOTOGRAPH ONCE AND KEPT, so the words on a real label are
       searchable without anybody typing them. */
    labelText: field.long({ label: "What the label says", holds: "none", max: 4_000 }),
    storage: field.long({ label: "How to store it", holds: "none", max: 2_000 }),
    handling: field.long({ label: "How to handle it", holds: "none", max: 2_000 }),
    /* ⚠️ Days after opening, which is one of three clocks that can end a
       batch — see `effectiveExpiry`. */
    openDays: field.number({ label: "Days once opened", holds: "none", min: 0, max: 3_650 }),
  },
});

/**
 * A LOCATION IS A NODE IN A TREE, AND THE TREE IS ARBITRARILY DEEP.
 *
 * ⚠️ SITE → BUILDING → ROOM → AISLE → RACK → SHELF → BIN, and a garage is one
 * level of it. There is no cap, because a cap is a number somebody's real
 * building exceeds — what there is instead is a product that notices when a
 * workspace has fourteen hundred locations and two hundred products.
 *
 * ⚠️ AND EVERY NODE IS LABELLED, WHICH IS THE HIGHEST-LEVERAGE FACT IN THE WHOLE
 * PRODUCT. When the camera sees a location it does not add stock — it MOVES the
 * session there. Point at a shelf, scan, scan, scan, point at the next shelf.
 * Nobody touches the screen to say where they are, and that is what turns a
 * two-hour count into forty minutes.
 */
const location = collection({
  id: "location",
  label: { one: "Location", many: "Locations" },
  scope: { of: "tenant" },
  permission: "location",
  retention: null,
  onClose: { then: "purge" },
  quota: "locations",
  offline: "queue",
  searchable: ["name"],
  fields: {
    name: field.text({ label: "Name", required: true, holds: "none", max: 120 }),
    /* ⚠️ A NODE POINTS AT ITS PARENT, WHICH IS THE SAME COLLECTION. A tree needs
       no second table, and a root is the row whose parent is empty. */
    within: field.ref({ label: "Inside", holds: "none", to: "location" }),
    kind: field.enum({
      label: "Kind", holds: "none",
      values: ["site", "building", "room", "aisle", "rack", "shelf", "bin"],
    }),
    /* ⚠️ THE CODE ON THE LABEL STUCK TO IT. Ours, always — a shelf has no
       manufacturer — and prefixed so the scanner knows instantly which kind of
       code it is holding. */
    code: field.text({ label: "Label", holds: "none", max: 64 }),
    note: field.long({ label: "Note", holds: "none", max: 2_000 }),
  },
});

/**
 * WHAT IS ACTUALLY THERE — a projection, never a record somebody writes.
 *
 * ⚠️ NO `create`, NO `update`, NO `delete`, AND THAT IS WHAT MAKES THE LEDGER
 * TRUE. A balance is the sum of everything that happened to it; a row anybody
 * could set by hand is a number with no history, and the first one of those
 * makes every other number in the product a matter of opinion. `stockMove` is
 * the only thing that writes here, and `scripts/ledger-chokepoint.test.mjs`
 * refuses a second.
 */
const stock = collection({
  id: "stock",
  label: { one: "Stock", many: "Stock" },
  scope: { of: "tenant" },
  permission: "stock",
  retention: null,
  onClose: { then: "purge" },
  offline: "cache",
  without: ["create", "update", "delete"],
  fields: {
    product: field.ref({ label: "Product", required: true, holds: "none", to: "product" }),
    location: field.ref({ label: "Location", required: true, holds: "none", to: "location" }),
    quantity: field.number({ label: "How many", required: true, holds: "none", min: 0 }),
    /* ⚠️ WHEN THIS LINE LAST MOVED, WHICH IS HOW A RECORD ADMITS IT MAY BE
       FICTION. "Last seen four months ago" is the app being honest about a
       number nobody has touched; hiding staleness is how people stop believing a
       system. */
    seen: field.instant({ label: "Last seen", holds: "none" }),
  },
});

/**
 * EVERY STATE CHANGE, APPEND-ONLY. Tessa's strongest part, kept whole.
 *
 * ⚠️ A CORRECTION IS AN EVENT, NEVER AN EDIT. The wrong number stays visible
 * with what replaced it beside it — which is the difference between an inventory
 * somebody can audit and one they can only believe.
 *
 * ⚠️ AND EVERY EVENT CARRIES HOW IT WAS CAPTURED. "Was this scanned or typed?"
 * is exactly the question somebody asks when a count looks wrong, and it lets
 * the product report data quality honestly instead of presenting every number as
 * equally solid.
 */
const ledger = collection({
  id: "ledger",
  label: { one: "Movement", many: "History" },
  scope: { of: "tenant" },
  permission: "ledger",
  retention: null,
  onClose: { then: "purge" },
  offline: "cache",
  /* ⚠️ Readable and nothing else — see `stock`. The history is written by the
     one function that also moves the balance, in the same statement. */
  without: ["create", "update", "delete"],
  fields: {
    move: field.enum({ label: "What happened", required: true, holds: "none", values: [...MOVES] }),
    product: field.ref({ label: "Product", required: true, holds: "none", to: "product" }),
    location: field.ref({ label: "Location", required: true, holds: "none", to: "location" }),
    /* ⚠️ SIGNED: what the balance moved BY, not what it became. A ledger of
       resulting balances cannot be replayed, cannot be summed, and cannot answer the
       question it exists for — how did we get here. */
    delta: field.number({ label: "Change", required: true, holds: "none" }),
    /* ⚠️ THE DEVICE'S OWN DATE, AND THIS IS NOT A CONVENIENCE. A shelf life is
       counted in LOCAL days: truncating to the UTC calendar lands an expiry a day
       early east of Greenwich (safe) and a day late west of it (not). Tessa knew
       and never closed it. */
    day: field.day({ label: "On", required: true, holds: "none" }),
    reason: field.text({ label: "Why", holds: "none", max: 200 }),
    capture: field.enum({
      label: "Recorded by", required: true, holds: "none",
      values: ["scanned", "typed", "voice", "ai-assisted", "imported"],
    }),
    /* ⚠️ WHAT IT WAS AGAINST — a count session, a job, a process, a correction's
       original. One column rather than four, because the question a reader asks
       is "what caused this", never "which of four kinds of cause". */
    against: field.text({ label: "Against", holds: "none", max: 64 }),
  },
});

/* ------------------------------------------------------------- operations --- */

/** ⚠️ The narrowest shape a handler here needs — see hello's, and the reason. */
interface Db {
  prepare(q: string): {
    bind(...v: unknown[]): {
      run(): Promise<{ meta?: { changes?: number } }>;
      first<T = unknown>(): Promise<T | null>;
      all<T>(): Promise<{ results: T[] }>;
    };
  };
}
interface Ctx {
  readonly db: unknown;
  readonly tenantId: string;
  readonly accountId?: string;
  readonly now: string;
  fail(code: string, values?: Record<string, string>, extra?: { fields?: Record<string, string> }): never;
  setting(id: string): Promise<unknown>;
}

const moveInput = {
  product: field.text({ label: "Product", required: true, holds: "none" }),
  location: field.text({ label: "Location", required: true, holds: "none" }),
  quantity: field.number({ label: "How many", required: true, holds: "none" }),
  /* ⚠️ THE DEVICE'S LOCAL DATE, SENT BY THE DEVICE. A server has no way to know
     what day it is where somebody is standing, and a shelf life counted on the
     wrong one is a product used after it expired. */
  day: field.day({ label: "On", required: true, holds: "none" }),
  capture: field.text({ label: "Recorded by", required: true, holds: "none" }),
  reason: field.text({ label: "Why", holds: "none" }),
  against: field.text({ label: "Against", holds: "none" }),
} as const;

interface MoveInput {
  product: string; location: string; quantity: number;
  day: string; capture: string; reason?: string; against?: string;
}

/**
 * THE ONE FUNCTION THAT MOVES A BALANCE.
 *
 * ⚠️ THE EVENT AND THE PROJECTION IN ONE BATCH, OR NEITHER. A ledger that
 * recorded what the balance did not do — or a balance that moved with nothing
 * saying why — is worse than either alone, because both are then unreliable and
 * nobody can tell which.
 *
 * ⚠️ AND IT REFUSES RATHER THAN CLAMPS. Taking twelve from a shelf holding eight
 * is somebody looking at a different shelf, a mis-scan, or a count that was
 * already wrong; silently landing on zero destroys the one piece of evidence
 * that any of those happened.
 *
 * ⚠️ THE UPDATE NAMES THE QUANTITY IT READ, which is the whole of the
 * concurrency story. Two people counting the same shelf is the ordinary case
 * here, not the exotic one — `SELECT` then `UPDATE` is a race they both win, and
 * the symptom is a balance that is quietly short by exactly one person's work.
 */
async function stockMove(ctx: Ctx, move: Move, input: MoveInput): Promise<{ id: string; quantity: number }> {
  const db = ctx.db as Db;
  const step = applyMove(move, input.quantity);

  const held = await db.prepare(
    `SELECT id, quantity FROM stock WHERE tenant_id = ? AND product = ? AND location = ?`)
    .bind(ctx.tenantId, input.product, input.location)
    .first<{ id: string; quantity: number }>();

  const was = held?.quantity ?? 0;
  const why = refuseMove(move, was, step);
  if (why) ctx.fail("inventory.short", {}, { fields: { quantity: why } });

  const now = was + step;
  const id = held?.id ?? `stk_${input.product}_${input.location}`;

  if (held) {
    /* ⚠️ COMPARE-AND-SET. A zero-change update means somebody else moved this
       line between the read and the write, and the honest answer is to refuse:
       the caller knows what they meant to do and can do it again against the
       number that is actually there. */
    const out = await db.prepare(
      `UPDATE stock SET quantity = ?, seen = ?, edited_at = ?, edited_by = ?
        WHERE id = ? AND tenant_id = ? AND quantity = ?`)
      .bind(now, ctx.now, ctx.now, ctx.accountId ?? null, held.id, ctx.tenantId, was).run();
    if (!out.meta?.changes) ctx.fail("inventory.moved");
  } else {
    await db.prepare(
      `INSERT INTO stock (id, tenant_id, product, location, quantity, seen, at, by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, ctx.tenantId, input.product, input.location, now, ctx.now, ctx.now,
        ctx.accountId ?? null).run();
  }

  await db.prepare(
    `INSERT INTO ledger
      (id, tenant_id, move, product, location, delta, day, reason, capture, against, at, by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(`led_${ctx.now}_${id}`, ctx.tenantId, move, input.product, input.location, step,
      input.day, input.reason ?? null, input.capture, input.against ?? null,
      ctx.now, ctx.accountId ?? null).run();

  return { id, quantity: now };
}

const moveOutput = {
  id: field.text({ label: "Line", holds: "none" }),
  quantity: field.number({ label: "How many now", holds: "none" }),
} as const;

/**
 * ⚠️ FOUR VERBS RATHER THAN ONE WITH A PARAMETER, and the split is the product's
 * sharpest rule. Taking something and correcting a number are different acts by
 * different people for different reasons — collapsed into `stock.change(delta)`
 * they become indistinguishable in the history, and a shrinkage report over that
 * history is a list of numbers nobody can explain.
 */
const receive = operation<MoveInput, { id: string; quantity: number }>({
  id: "stock.receive",
  kind: "write",
  summary: "Put stock on a shelf",
  input: moveInput,
  output: moveOutput,
  permission: "stock:move",
  idempotency: { mode: "key" },
  emits: ["stock.received"],
  outcome: { message: "Received.", tone: "success", invalidates: ["stock.list", "ledger.list"] },
  fails: ["inventory.short", "inventory.moved"],
  /* ⚠️ THE AUDIT ROW IS WHAT SURVIVES THE PROJECTION. A balance is rebuilt from
     the ledger; who moved it is the platform's record of the request, and both
     name the same product so a suspicious line can be read from either side. */
  audit: (input) => ({ subject: input.product, verb: "received" }),
  handler: (ctx, input) => stockMove(ctx as Ctx, "received", input),
});

const take = operation<MoveInput, { id: string; quantity: number }>({
  id: "stock.take",
  kind: "write",
  summary: "Take stock off a shelf",
  input: moveInput,
  output: moveOutput,
  permission: "stock:move",
  idempotency: { mode: "key" },
  emits: ["stock.taken"],
  outcome: { message: "Taken.", tone: "success", invalidates: ["stock.list", "ledger.list"] },
  fails: ["inventory.short", "inventory.moved"],
  audit: (input) => ({ subject: input.product, verb: "took" }),
  handler: (ctx, input) => stockMove(ctx as Ctx, "taken", input),
});

/**
 * ⚠️ A CORRECTION DEMANDS A REASON, IN THE HANDLER. An adjustment with no
 * explanation is the number changing by itself, and a shrinkage report made of
 * those says only that the product is not trusted. The field is optional on the
 * others because "received" and "taken" explain themselves.
 */
const adjust = operation<MoveInput, { id: string; quantity: number }>({
  id: "stock.adjust",
  kind: "write",
  summary: "Correct a number that was wrong",
  input: moveInput,
  output: moveOutput,
  permission: "stock:adjust",
  idempotency: { mode: "key" },
  emits: ["stock.adjusted"],
  outcome: { message: "Corrected.", tone: "warning", invalidates: ["stock.list", "ledger.list"] },
  fails: ["inventory.short", "inventory.moved", "platform.invalid"],
  audit: (input) => ({ subject: input.product, verb: "corrected" }),
  handler: (ctx, input) => {
    const c = ctx as Ctx;
    if (!input.reason?.trim()) {
      c.fail("platform.invalid", {}, { fields: { reason: "Say what was wrong" } });
    }
    return stockMove(c, "adjusted", input);
  },
});

/**
 * WHAT A NEW PRODUCT STARTS AS — the workspace's answer, not the form's.
 *
 * ⚠️ AN OPERATION RATHER THAN THE SCREEN READING THE SETTING, because both
 * settings are the workspace's and need `tenant:manage`. Somebody adding a
 * product holds `product:write` and not that, so the screen cannot see them and
 * must still honour them: the platform resolves the value, the caller is told
 * only the consequence.
 */
const starts = operation<Record<string, never>, { tracking: string; unit: string }>({
  id: "product.start",
  kind: "read",
  summary: "What a new product starts as here",
  input: {},
  output: {
    tracking: field.text({ label: "Tracked as", holds: "none" }),
    unit: field.text({ label: "Counted in", holds: "none" }),
  },
  permission: "product:write",
  idempotency: { mode: "none" },
  async handler(ctx) {
    const c = ctx as Ctx;
    /* ⚠️ NO `??` OF ITS OWN. The declaration carries the fallback and the
       platform resolves it; a default here would be a second answer to what a
       workspace switched on, and it would MASK the platform failing to apply
       the declared one. */
    return {
      tracking: String(await c.setting("inventory.default_tracking")),
      unit: String(await c.setting("inventory.default_unit")),
    };
  },
});

/* --------------------------------------------------------------- the rest --- */

export const INVENTORY: AppSpec = defineApp({
  id: "inventory",
  name: "OneInventory",
  /*
    ⚠️ THE BARS, BECAUSE THE MARK IS A BARCODE CUT INTO THE NUMERAL. This is the
    character a row, a switcher and a bill draw the product by; the full mark is
    the family's own numeral with six counters of six widths (`partsOf`), and its
    beak is the one place this product carries a hue.
  */
  mark: "▥",

  access: {
    permissions: [
      "product:read", "product:write",
      "location:read", "location:write",
      "stock:read",
      /*
        ⚠️ TAKING AND CORRECTING ARE DIFFERENT GRANTS, AND THIS IS THE PRODUCT'S
        SHARPEST ACCESS RULE. Somebody on the floor takes things all day and must
        never be able to make a number agree with what they took — that is the
        difference between an inventory that can be audited and one that reports
        whatever the last person said.
      */
      "stock:move", "stock:adjust",
      "ledger:read",
    ],
    roles: {
      /* ⚠️ The one who looks after the stock: receives, corrects, edits the
         catalogue, reads the history. */
      keeper: [
        "product:read", "product:write", "location:read", "location:write",
        "stock:read", "stock:move", "stock:adjust", "ledger:read",
      ],
      /* ⚠️ THE COMMON ROLE, and the reason the split above exists. Most people
         in most workspaces only ever take things. */
      user: ["product:read", "location:read", "stock:read", "stock:move"],
      viewer: ["product:read", "location:read", "stock:read", "ledger:read"],
    },
    founding: "keeper",
    /* ⚠️ Seats count PLATFORM staff — a person is on the team or they are not,
       however many products the team uses. */
    seats: { counts: ["owner", "manager", "staff"], entitlement: "seats" },
  },

  /*
    ⚠️ KEYS ONLY, AND THE DEPLOYMENT PRICES THEM. Adding one of these is a red
    build until every plan names a number for it — which is the feature: a key no
    plan mentions resolves to `false` for everybody, so the capability is built,
    gated, and sold to nobody, silently, on every tier.

    ⚠️ AND STORAGE IS NOT HERE, DELIBERATELY. Product photographs accumulate as a
    side effect of ordinary work; refusing an upload because a colleague filled
    the bucket punishes the wrong person at the worst moment. `storage` is the
    platform's and it is a METER — the plan's amount is where it starts, not
    where the product stops.
  */
  entitlements: {
    products: { label: "Products", withheld: "quota" },
    locations: { label: "Locations", withheld: "quota" },
  },

  collections: [product, location, stock, ledger],
  operations: [receive, take, adjust, starts],

  /*
    ⚠️ THE SCREENS THIS STAGE ACTUALLY HAS. A declared screen with nothing
    mounted renders an honest notice, which is the right state for a screen whose
    container is not written — and the wrong state for five nav destinations at
    once, which is a product that looks broken rather than unfinished.
  */
  screens: [
    { id: "stock", route: "/", label: "Stock", nav: "primary", icon: "box",
      permission: "stock:read" },
    /* ⚠️ `etch` — ruled geometry, which is what a shelf is. Seeded on the
       location, so every shelf in the workspace has a ground of its own. */
    { id: "location", route: "/where", label: "A location", nav: "none", icon: "pin",
      permission: "location:read", sky: "etch" },
    { id: "product", route: "/thing", label: "A product", nav: "none", icon: "box",
      permission: "product:read" },
    /* ⚠️ `glow` — pure light, no marks, which is what an arrival wants. */
    { id: "start", route: "/start", label: "Getting started", nav: "secondary", icon: "star",
      permission: "product:read", sky: "glow" },
  ],

  problems: {
    /*
      ⚠️ ONE REFUSAL FOR "THERE IS NOT THAT MUCH THERE", AND IT NAMES THE FIELD.
      A quantity that cannot be taken is a fact about the quantity, so the
      sentence belongs under the number rather than over the form.
    */
    "inventory.short": {
      status: 409, retryable: false, tone: "warning",
      title: "There is not that much there",
      detail: "Count what is on the shelf and correct it first.",
    },
    /*
      ⚠️ TWO PEOPLE ON ONE SHELF IS THE ORDINARY CASE HERE. Somebody else moved
      this line between the read and the write, so the number the caller decided
      against is gone — and the only honest thing is to say so and let them look
      again.
    */
    "inventory.moved": {
      status: 409, retryable: true,
      title: "Somebody else moved this",
      detail: "The number changed while you were working. Look again.",
      tone: "warning",
    },
  },

  settingAreas: {
    stock: area({
      id: "stock", label: "Stock", icon: "box", order: 0,
      said: "What a new product starts as, and how long a mistake can be taken back",
    }),
  },

  settings: {
    /*
      ⚠️ THE PROFILE IS DEFAULTS AND VOCABULARY, NEVER A CODE PATH. It seeds what
      a new product starts as and which words this workspace uses; it changes what
      is SHOWN and never what is POSSIBLE, so a garage that grows into a business
      turns things on and nothing is migrated.
    */
    /* DEFER(engine-24) stage:24 — a profile's real work is composing the
       workspace's roles out of this app's keys, so that a basement's screens are
       not REACHABLE rather than merely hidden. Until that lands it is saved and
       read by nothing, which is less than the help beside it describes. */
    "inventory.profile": setting({
      id: "inventory.profile", level: "tenant", area: "stock",
      field: field.enum({
        label: "What this is for", holds: "none",
        values: ["home", "clinic", "hospital", "workshop", "kitchen", "lab", "warehouse", "office"],
      }),
      fallback: "home", needs: "tenant:manage",
      help: "It sets the defaults and the words. Everything stays available.",
    }),
    "inventory.default_tracking": setting({
      id: "inventory.default_tracking", level: "tenant", area: "stock",
      field: field.enum({ label: "New products are", holds: "none", values: [...LADDER] }),
      fallback: "counted", needs: "tenant:manage",
      help: "Whoever adds one can still change it.",
    }),
    "inventory.default_unit": setting({
      id: "inventory.default_unit", level: "tenant", area: "stock",
      field: field.text({ label: "Counted in", holds: "none", max: 24 }),
      fallback: "item", needs: "tenant:manage",
      help: "Most places count boxes. A pharmacy counts tablets.",
    }),
  },

  /* ⚠️ EVERY STEP IS TICKED BY AN EVENT THIS APP ACTUALLY RAISES. A step whose
     `done` nothing emits is a box that can never be crossed off, and the
     manifest refuses one at composition rather than letting it sit there. */
  guide: {
    "first-place": { id: "first-place", label: "Name a place to keep things",
      why: "Everything sits somewhere, and the shelf is what a scan finds first.",
      done: "location.created", link: "/", order: 1 },
    "first-thing": { id: "first-thing", label: "Add your first product",
      why: "A product is the type; how many there are comes next.",
      done: "product.created", link: "/", order: 2 },
    "first-count": { id: "first-count", label: "Put some on a shelf",
      why: "It is the whole product: what is where, and how many.",
      done: "stock.received", link: "/", order: 3 },
  },

  milestones: {
    "first-stock": { id: "first-stock", label: "First thing on a shelf",
      said: "Everything after this is the same three questions.", on: "stock.received",
      tone: "success", icon: "box" },
    "fifty-products": { id: "fifty-products", label: "Fifty products",
      said: "The catalogue is worth searching.", on: "product.created", after: 50,
      tone: "info", icon: "box" },
  },

  help: {
    "about-tracking": { id: "about-tracking", title: "How much to track", screen: "stock",
      body: "Start everything at counted — a number per place. Promote a product to batched when a delivery's expiry matters." },
    "about-places": { id: "about-places", title: "Places", screen: "location",
      body: "A place can sit inside another, as deep as your building goes. Label them and the camera moves itself." },
    "about-corrections": { id: "about-corrections", title: "Corrections", screen: "stock",
      body: "Taking something and correcting a number are different acts. A correction always says why, and the old number stays visible." },
  },

  /* ⚠️ WHICH SURFACES THIS APP HAS, AND NOT WHO MAY PAINT THEM. The brand is the
     WORKSPACE's and reaches every app under it (D22). */
  whitelabel: { surfaces: ["shell"] },
});

/* ⚠️ A THUNK, BECAUSE COMPOSITION IS LAZY (D4). Exporting the composed surface
   would put every app's route table in the startup budget of every request. */
export const inventory = (): AppSpec => INVENTORY;
