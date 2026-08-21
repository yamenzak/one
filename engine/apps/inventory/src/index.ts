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
import {
  LADDER, MOVES, applyMove, daysLeft, effectiveExpiry, refuseMove, standingOf,
  type Move,
} from "./ledger.js";
import { CODE_KINDS, readScan, stillNeeded, unread } from "./code.js";

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
 * EVERY CODE THAT NAMES A PRODUCT — and the reason the catalogue teaches itself.
 *
 * ⚠️ A PRODUCT HAS MANY CODES AND THE APP NEVER PREFERS ONE. A glove box carries
 * an EAN-13; the carton of ten carries a different one; the manufacturer's part
 * number is on the invoice; the ward sticks its own label on the shelf. All four
 * resolve to the same product, and which one somebody happens to scan is a fact
 * about what they are holding rather than a decision the product gets to make.
 *
 * ⚠️ `pack` IS WHY THIS IS A TABLE RATHER THAN A COLUMN ON THE PRODUCT. Scan a
 * carton and add 1, or scan a carton and add 10 — the difference between a right
 * number and a wrong one, with nothing on screen to tell them apart. The code
 * knows which, because the code is printed on one of them.
 *
 * ⚠️ AND AN UNKNOWN CODE IS LEARNED, WHICH IS MOST OF THE ONBOARDING TAX GONE.
 * Scan something nobody has seen → "what is this?" → pick or create → the code
 * belongs to that product for ever, and the second scan is instant. Nobody types
 * in eight hundred barcodes.
 */
const code = collection({
  id: "code",
  label: { one: "Code", many: "Codes" },
  scope: { of: "tenant" },
  permission: "product",
  retention: null,
  onClose: { then: "purge" },
  /* ⚠️ Cached, never queued: a code is READ in a basement all day and written
     about once per product per lifetime. */
  offline: "cache",
  fields: {
    product: field.ref({ label: "Product", required: true, holds: "none", to: "product" }),
    /* ⚠️ NORMALISED, WHICH IS THE WHOLE OF THE MATCHING. An EAN-13 off a box and
       the `(01)` of the DataMatrix on the same box differ by a leading zero;
       stored as they were scanned they are two products, and the workspace ends
       up with a duplicate nobody can see is a duplicate. See `asGtin`. */
    value: field.text({ label: "Code", required: true, holds: "none", max: 64 }),
    kind: field.enum({
      label: "Kind", required: true, holds: "none",
      values: [...CODE_KINDS],
    }),
    /* ⚠️ HOW MANY BASE UNITS THE THING THIS CODE IS PRINTED ON HOLDS. `1` is the
       ordinary case and the carton is the reason the column exists.

       ⚠️ `pack` RATHER THAN `level`, AND THE RENAME IS NOT COSMETIC. `level` is
       a key elsewhere in this platform — a setting's authority is `tenant` or
       `person` — and `scripts/keys.test.mjs` refuses a screen printing a field
       by that name, correctly, because everywhere else it would be showing
       somebody the code. */
    pack: field.number({ label: "How many it holds", holds: "none", min: 1 }),
    /* ⚠️ WHERE IT CAME FROM, because a code somebody scanned once at speed and a
       code that arrived in a supplier's file deserve different amounts of trust
       when two of them disagree. */
    source: field.enum({
      label: "Learned from", holds: "none",
      values: ["scanned", "typed", "imported", "ai-assisted"],
    }),
  },
});

/**
 * ONE DELIVERY OF ONE PRODUCT, KEPT APART FROM THE NEXT.
 *
 * ⚠️ A BATCH EXISTS ONLY WHERE IT EARNS ITS KEEP — a product promoted to
 * `batched` — and that is the ladder doing its work. Screws do not have lots;
 * vaccines, resins, reagents and anything with a date printed on it do, and
 * mixing two deliveries into one number is how the wrong one gets used first.
 *
 * ⚠️ AND THE EXPIRY IS THREE CLOCKS RATHER THAN A DATE. What the manufacturer
 * printed, what happens N days after somebody opens it, and what happens N days
 * after a process — whichever runs out first is what governs, and the read says
 * WHICH. A shelf that says "expires Tuesday" and cannot say why is a shelf
 * nobody trusts. See `effectiveExpiry`.
 */
const batch = collection({
  id: "batch",
  label: { one: "Batch", many: "Batches" },
  scope: { of: "tenant" },
  permission: "product",
  retention: null,
  onClose: { then: "purge" },
  offline: "queue",
  /* ⚠️ THE LOT IS SEARCHABLE BECAUSE A RECALL ARRIVES AS ONE. A notice names a
     lot number and nothing else, and the question is always "have we got any". */
  searchable: ["lot"],
  fields: {
    product: field.ref({ label: "Product", required: true, holds: "none", to: "product" }),
    /* ⚠️ THE MANUFACTURER'S OWN, EXACTLY AS PRINTED. It is what a recall names
       and what somebody reads off the box, so normalising the case or trimming a
       leading zero would make the two disagree at the worst moment. */
    lot: field.text({ label: "Lot", holds: "none", max: 64 }),
    /* ⚠️ A DAY, NEVER AN INSTANT — a shelf life has no time of day, and an
       instant would put one in. */
    printed: field.day({ label: "Expires", holds: "none" }),
    /* ⚠️ THE SECOND CLOCK STARTS HERE, and only once — see `batch.open`. The
       days it runs for are the PRODUCT's (`openDays`), because "use within 28
       days of opening" is a fact about the substance rather than the delivery. */
    opened: field.day({ label: "Opened", holds: "none" }),
    /* ⚠️ WHEN IT ARRIVED, which is not an expiry and is not decoration: two lots
       with the same printed date are used oldest-received first. */
    received: field.day({ label: "Received", holds: "none" }),
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
    /*
      ⚠️ PART OF WHAT MAKES A LINE A LINE, AND EMPTY FOR MOST OF THEM. A batched
      product's balance is per delivery — two lots on one shelf are two numbers,
      because they expire on different days and the older one goes first. A
      counted product has one number per shelf and this is blank.

      ⚠️ WHICH MEANS THE KEY IS THREE COLUMNS, NOT TWO. `stockMove` reads and
      writes on (product, location, batch); a two-column key would silently merge
      a new delivery into the old one's row and lose the older lot's date.
    */
    batch: field.ref({ label: "Batch", holds: "none", to: "batch" }),
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
    /* ⚠️ WHICH DELIVERY MOVED, WHERE THERE IS ONE. A recall names a lot and asks
       where it went; a history that only recorded the product could answer where
       the PRODUCT went, which is every shelf in the building. */
    batch: field.ref({ label: "Batch", holds: "none", to: "batch" }),
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
  /* ⚠️ WHICH DELIVERY MOVED. Absent for everything that is not `batched`, and
     part of the line's identity where it is present — see `stockMove`. */
  batch: field.text({ label: "Batch", holds: "none" }),
} as const;

interface MoveInput {
  product: string; location: string; quantity: number;
  day: string; capture: string; reason?: string; against?: string;
  /** ⚠️ Which delivery. Absent for everything that is not `batched`. */
  batch?: string;
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

  /*
    ⚠️ THE KEY IS THREE COLUMNS, AND THE THIRD IS EMPTY FOR MOST LINES. A batched
    product's balance is per delivery: two lots on one shelf are two numbers,
    because they expire on different days and the older one goes first. Keyed on
    two, a new delivery would land on the old one's row and the older lot's date
    would vanish with it.

    ⚠️ AND IT IS `IS ?` RATHER THAN `= ?`, which is the whole reason this reads
    the way it does. In SQL `NULL = NULL` is not true, so an unbatched line —
    every line of every counted product — would never match its own row: the
    read finds nothing, the insert runs, and one shelf slowly grows a row per
    movement, each holding part of the number.
  */
  const batch = input.batch ?? null;
  /*
    ⚠️ A NAMED BATCH IS CHECKED, AND CHECKED AGAINST THIS PRODUCT. `stockMove`
    writes the column itself rather than going through the generated create, so
    nothing else validates the reference — an id that does not exist would make a
    balance line pointing at nothing, and one belonging to ANOTHER product would
    put this delivery's quantity under that product's expiry date.
  */
  if (batch) {
    const of = await db.prepare(
      `SELECT product FROM batch WHERE id = ? AND tenant_id = ?`)
      .bind(batch, ctx.tenantId).first<{ product: string }>();
    if (!of || of.product !== input.product) ctx.fail("platform.not_found");
  }

  const held = await db.prepare(
    `SELECT id, quantity FROM stock
      WHERE tenant_id = ? AND product = ? AND location = ? AND batch IS ?`)
    .bind(ctx.tenantId, input.product, input.location, batch)
    .first<{ id: string; quantity: number }>();

  const was = held?.quantity ?? 0;
  const why = refuseMove(move, was, step);
  if (why) ctx.fail("inventory.short", {}, { fields: { quantity: why } });

  const now = was + step;
  const id = held?.id ?? `stk_${input.product}_${input.location}_${batch ?? ""}`;

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
      `INSERT INTO stock (id, tenant_id, product, location, batch, quantity, seen, at, by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, ctx.tenantId, input.product, input.location, batch, now, ctx.now, ctx.now,
        ctx.accountId ?? null).run();
  }

  await db.prepare(
    `INSERT INTO ledger
      (id, tenant_id, move, product, location, batch, delta, day, reason, capture,
       against, at, by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(`led_${ctx.now}_${id}`, ctx.tenantId, move, input.product, input.location, batch,
      step, input.day, input.reason ?? null, input.capture, input.against ?? null,
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
  fails: ["inventory.short", "inventory.moved", "platform.not_found"],
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
  fails: ["inventory.short", "inventory.moved", "platform.not_found"],
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
  fails: ["inventory.short", "inventory.moved", "platform.invalid", "platform.not_found"],
  audit: (input) => ({ subject: input.product, verb: "corrected" }),
  handler: (ctx, input) => {
    const c = ctx as Ctx;
    if (!input.reason?.trim()) {
      c.fail("platform.invalid", {}, { fields: { reason: "Say what was wrong" } });
    }
    return stockMove(c, "adjusted", input);
  },
});

/* ------------------------------------------------------------ the clocks --- */

/**
 * OPENING A CONTAINER STARTS THE SECOND CLOCK, AND IT HAPPENS ONCE.
 *
 * ⚠️ AN OPERATION RATHER THAN AN EDIT, because opening twice must be REFUSED.
 * "Use within 28 days of opening" counted from the second opening is a shelf
 * life somebody extended by pressing a button — the most dangerous write in this
 * product, and the one a generated `batch.update` would allow without a word.
 *
 * ⚠️ AND THE DAY COMES FROM THE DEVICE. A shelf life is counted in local days:
 * a server truncating to its own calendar lands the end of it a day early east
 * of Greenwich (safe) and a day late west of it (not).
 */
const open = operation<{ batch: string; day: string }, { on: string }>({
  id: "batch.open",
  kind: "write",
  summary: "Record that a container was opened",
  input: {
    batch: field.text({ label: "Batch", required: true, holds: "none" }),
    day: field.day({ label: "On", required: true, holds: "none" }),
  },
  output: { on: field.day({ label: "Opened", holds: "none" }) },
  permission: "stock:move",
  idempotency: { mode: "key" },
  emits: ["batch.opened"],
  outcome: { message: "Opened.", tone: "success", invalidates: ["batch.list", "batch.due"] },
  fails: ["platform.not_found", "inventory.opened"],
  audit: (input) => ({ subject: input.batch, verb: "opened" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;
    const held = await db.prepare(
      `SELECT opened FROM batch WHERE id = ? AND tenant_id = ?`)
      .bind(input.batch, c.tenantId).first<{ opened: string | null }>();
    if (!held) return c.fail("platform.not_found");
    /* ⚠️ REFUSED RATHER THAN IGNORED. Answering 200 and changing nothing is the
       same picture as succeeding, so the person who opened the wrong box would
       never learn that the right one is still sealed. */
    if (held.opened) return c.fail("inventory.opened", { on: held.opened });

    await db.prepare(
      `UPDATE batch SET opened = ?, edited_at = ?, edited_by = ?
        WHERE id = ? AND tenant_id = ? AND opened IS NULL`)
      .bind(input.day, c.now, c.accountId ?? null, input.batch, c.tenantId).run();

    return { on: input.day };
  },
});

/**
 * WHAT RUNS OUT, WHEN, AND WHICH CLOCK SAYS SO.
 *
 * ⚠️ THE ARITHMETIC IS DONE HERE BECAUSE THE THRESHOLD IS THE WORKSPACE'S. How
 * many days counts as "soon" is a decision about a business — three for a
 * kitchen, ninety for a pharmacy — and it is a `tenant:manage` setting, so a
 * person on the floor cannot read it. A screen doing this sum would either
 * hard-code a number or show everybody the same wrong list.
 *
 * ⚠️ AND IT REPORTS WHICH CLOCK WON RATHER THAN ONLY THE DATE. A shelf that says
 * "expires Tuesday" and cannot say why is a shelf nobody trusts — and the answer
 * is genuinely surprising often enough to matter: a box with a 2028 date on it
 * that was opened last month is out next week.
 */
interface Due {
  id: string; product: string; name: string; lot: string;
  on: string; by: string; standing: string; days: number;
}

const due = operation<{ product?: string; today: string }, { items: readonly Due[] }>({
  id: "batch.due",
  kind: "read",
  summary: "What runs out, and which clock says so",
  input: {
    product: field.text({ label: "Product", holds: "none" }),
    /* ⚠️ THE DEVICE'S OWN DAY — see `standingOf`. */
    today: field.day({ label: "Today", required: true, holds: "none" }),
  },
  /* ⚠️ `json`, BECAUSE A ROW HERE IS A SHAPE RATHER THAN A SENTENCE. Declared as
     text it would typecheck, serialise, and describe the wrong thing to the
     agent surface and to anything else reading the declaration. */
  output: { items: field.json({ label: "Batches", holds: "none" }) },
  permission: "stock:read",
  idempotency: { mode: "none" },
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;
    const warn = Math.trunc(Number(await c.setting("inventory.warn_days"))) || 30;

    const rows = await db.prepare(
      `SELECT b.id AS id, b.product AS product, b.lot AS lot, b.printed AS printed,
              b.opened AS opened, p.name AS name, p.openDays AS openDays
         FROM batch b JOIN product p ON p.id = b.product
        WHERE b.tenant_id = ?${input.product ? " AND b.product = ?" : ""}`)
      .bind(...(input.product ? [c.tenantId, input.product] : [c.tenantId]))
      .all<{ id: string; product: string; lot: string | null; printed: string | null;
        opened: string | null; name: string; openDays: number | null }>();

    const items: Due[] = [];
    for (const row of rows.results) {
      const ends = effectiveExpiry({
        printed: row.printed,
        /* ⚠️ THE DAYS ARE THE PRODUCT'S, NOT THE DELIVERY'S. "Use within 28 days
           of opening" is a fact about the substance; putting it on the batch
           would let two deliveries of one thing disagree about it. */
        opened: row.opened && row.openDays
          ? { on: row.opened, days: row.openDays }
          : null,
      });
      /* ⚠️ A BATCH WITH NO CLOCK AT ALL IS LEFT OUT RATHER THAN SHOWN AS FINE. A
         lot somebody recorded with no date is a gap in the data, and a list of
         what runs out is the wrong place to report one — it would sit at the
         bottom for ever looking like the safest thing in the building. */
      if (!ends) continue;
      items.push({
        id: row.id, product: row.product, name: row.name, lot: row.lot ?? "",
        on: ends.on, by: ends.by,
        standing: standingOf(ends.on, input.today, warn),
        days: daysLeft(ends.on, input.today),
      });
    }

    /* ⚠️ SOONEST FIRST, WHICH IS THE ONLY ORDER THIS LIST HAS. Anything else
       makes somebody scan it for the number that matters. */
    items.sort((a, b) => a.days - b.days);
    return { items };
  },
});

/* ------------------------------------------------------- the resolution rule --- */

interface Resolving { raw: string; year: number }

/**
 * ⚠️ WHAT A SCAN RESOLVED TO, AND `found: false` IS A FIRST-CLASS ANSWER RATHER
 * THAN A 404. An unknown code is the ordinary case on the day a workspace starts
 * — it is what the learning path is FOR — so answering it as a refusal would
 * make the most common outcome of the product's main gesture look like a fault.
 */
const resolveOut = {
  found: field.bool({ label: "Known", holds: "none" }),
  /* What the string turned out to be, whether or not anything holds it. */
  kind: field.text({ label: "Kind", holds: "none" }),
  value: field.text({ label: "Code", holds: "none" }),
  /* ⚠️ SET ONLY FOR ONE OF OUR OWN LABELS — a shelf, a batch, a unit. It is what
     lets the camera MOVE the session instead of adding stock to it. */
  ours: field.text({ label: "Names", holds: "none" }),
  product: field.text({ label: "Product", holds: "none" }),
  name: field.text({ label: "Name", holds: "none" }),
  tracking: field.text({ label: "Tracked as", holds: "none" }),
  unit: field.text({ label: "Counted in", holds: "none" }),
  pack: field.number({ label: "How many it holds", holds: "none" }),
  /* ⚠️ WHATEVER THE CARRIER ALSO CARRIED — see `readScan`. A DataMatrix arrives
     with these and an EAN-13 does not, and the screen is a function of which. */
  lot: field.text({ label: "Lot", holds: "none" }),
  expiry: field.day({ label: "Expires", holds: "none" }),
  /* ⚠️ WHAT THE SCREEN MUST STILL ASK FOR, computed here rather than there. Two
     surfaces will scan — receiving and counting — and each deciding for itself
     is how one of them comes to record a batch with no expiry. */
  needs: field.text({ label: "Still needs", holds: "none" }),
} as const;

interface Resolved {
  found: boolean; kind: string; value: string; ours: string;
  product: string; name: string; tracking: string; unit: string; pack: number;
  lot: string; expiry: string; needs: string;
}

/**
 * ⚠️ THE YEAR COMES FROM THE DEVICE, for the same reason the day does. A six-
 * digit expiry has its century inferred from a window around NOW, and a server
 * in another year — on New Year's Eve, in the other direction — would read a
 * label differently from the phone that is looking at it.
 *
 * ⚠️ AND IT IS COERCED RATHER THAN TRUSTED. A read takes its input from the
 * QUERY, so every value arrives as a string however it was declared — and the
 * century arithmetic on `"2026"` happens to work through JavaScript's own
 * coercion, which is luck rather than a design and would stop being either the
 * day somebody compared it to a number.
 */
const yearIn = (of: unknown): number => Math.trunc(Number(of));
const resolve = operation<Resolving, Resolved>({
  id: "code.resolve",
  kind: "read",
  summary: "Say what a scanned code is",
  input: {
    raw: field.text({ label: "Code", required: true, holds: "none", max: 256 }),
    year: field.number({ label: "This year", required: true, holds: "none" }),
  },
  output: resolveOut,
  permission: "product:read",
  idempotency: { mode: "none" },
  fails: ["inventory.unreadable", "platform.invalid"],
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const year = yearIn(input.year);
    if (!Number.isFinite(year) || year < 2000 || year > 2200) {
      /* ⚠️ REFUSED RATHER THAN DEFAULTED TO THIS SERVER'S YEAR. A century window
         drawn around the wrong year reads a genuinely expired lot as current,
         and a silent fallback is exactly how nobody finds out. */
      return c.fail("platform.invalid", {}, { fields: { year: "Say what year it is where you are" } });
    }
    const of = readScan(input.raw, year);
    /* ⚠️ `return` RATHER THAN A BARE CALL, and it is not a style choice: a
       `never` returning method does not narrow the union after the block unless
       the flow visibly ends, so without it every read below is against
       `Scanned | Unread`. */
    if (unread(of)) {
      return c.fail("inventory.unreadable", {}, { fields: { raw: WHY[of.why] } });
    }

    const none: Resolved = {
      found: false, kind: of.kind, value: of.value, ours: of.ours ?? "",
      product: "", name: "", tracking: "", unit: "", pack: 1,
      lot: of.lot ?? "", expiry: of.expiry ?? "", needs: "",
    };
    /* ⚠️ ONE OF OUR OWN LABELS IS NOT LOOKED UP HERE. It names a shelf, a batch
       or a unit — three different collections — and answering it from the
       product table would mean this operation quietly returned nothing for the
       most reliable code in the workspace. The caller reads `ours` and goes to
       the right screen. */
    if (of.ours) return none;

    const db = c.db as Db;
    const held = await db.prepare(
      `SELECT c.pack AS pack, c.kind AS kind, p.id AS product, p.name AS name,
              p.tracking AS tracking, p.unit AS unit
         FROM code c JOIN product p ON p.id = c.product
        WHERE c.tenant_id = ? AND c.value = ?`)
      .bind(c.tenantId, of.value)
      .first<{ pack: number | null; kind: string; product: string; name: string;
        tracking: string; unit: string }>();

    if (!held) return none;

    return {
      ...none,
      found: true,
      /* ⚠️ THE ROW'S KIND WINS OVER THE READER'S, because the row may know more
         — a person who typed this in said it was a national code, and no camera
         could have told. */
      kind: held.kind || of.kind,
      product: held.product,
      name: held.name,
      tracking: held.tracking,
      unit: held.unit,
      pack: held.pack ?? 1,
      needs: stillNeeded(held.tracking, of).join(","),
    };
  },
});

/**
 * A CODE NOBODY HAD SEEN, ATTACHED TO A PRODUCT FOR EVER.
 *
 * ⚠️ THE SECOND SCAN IS INSTANT, AND THAT IS THE WHOLE FEATURE. Nobody types in
 * eight hundred barcodes; they scan what they are already holding, say what it
 * is once, and the catalogue is built by the work rather than before it.
 *
 * ⚠️ AND A CODE MAY NAME ONLY ONE PRODUCT. Learning a second owner for a string
 * makes every future scan of it ambiguous, and the resolver would answer with
 * whichever row it happened to read first — a wrong product, confidently, for
 * ever. Refused rather than replaced: the code on the shelf did not change, so
 * one of the two answers is a mistake somebody has to look at.
 */
const learn = operation<
  { raw: string; year: number; product: string; pack?: number; source?: string },
  { value: string }
>({
  id: "code.learn",
  kind: "write",
  summary: "Attach a code to a product",
  input: {
    raw: field.text({ label: "Code", required: true, holds: "none", max: 256 }),
    year: field.number({ label: "This year", required: true, holds: "none" }),
    product: field.text({ label: "Product", required: true, holds: "none" }),
    pack: field.number({ label: "How many it holds", holds: "none", min: 1 }),
    source: field.text({ label: "Learned from", holds: "none" }),
  },
  output: { value: field.text({ label: "Code", holds: "none" }) },
  permission: "product:write",
  /* ⚠️ Queued offline like every other write in this app, so a code learned in
     the back of a warehouse is not a code learned twice. */
  idempotency: { mode: "key" },
  emits: ["code.learned"],
  outcome: { message: "Learned.", tone: "success", invalidates: ["code.list"] },
  fails: ["inventory.unreadable", "inventory.taken"],
  audit: (input) => ({ subject: input.product, verb: "learned a code for" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    /* ⚠️ A WRITE'S INPUT IS JSON, SO THE YEAR ARRIVES AS THE NUMBER IT WAS SENT
       as — but it goes through the same door as the read's for one reason: two
       readings of the same label would be two answers to when it expires. */
    const of = readScan(input.raw, yearIn(input.year));
    if (unread(of)) {
      return c.fail("inventory.unreadable", {}, { fields: { raw: WHY[of.why] } });
    }
    /* ⚠️ ONE OF OUR OWN IS NOT LEARNABLE. `ONE-L-…` is a shelf we printed;
       attaching it to a product would make the camera add stock where it should
       have moved the session, and the label is not the manufacturer's to reuse. */
    if (of.ours) {
      return c.fail("inventory.unreadable", {}, { fields: { raw: "That is one of our own labels" } });
    }

    const db = c.db as Db;
    const taken = await db.prepare(
      `SELECT product FROM code WHERE tenant_id = ? AND value = ?`)
      .bind(c.tenantId, of.value).first<{ product: string }>();
    if (taken && taken.product !== input.product) c.fail("inventory.taken");
    if (taken) return { value: of.value };

    await db.prepare(
      `INSERT INTO code (id, tenant_id, product, value, kind, pack, source, at, by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(`cod_${c.tenantId}_${of.value}`, c.tenantId, input.product, of.value,
        of.kind, input.pack ?? 1, input.source ?? "scanned", c.now, c.accountId ?? null)
      .run();

    return { value: of.value };
  },
});

/** ⚠️ The reader's three refusals, in the words the person reads. */
const WHY: Readonly<Record<"empty" | "check" | "gs1", string>> = {
  empty: "Nothing was scanned",
  check: "That barcode did not read cleanly — scan it again",
  gs1: "That label is damaged or half-read — scan it again",
};

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

  collections: [product, code, location, batch, stock, ledger],
  operations: [receive, take, adjust, starts, resolve, learn, open, due],

  /*
    ⚠️ THE SCREENS THIS STAGE ACTUALLY HAS. A declared screen with nothing
    mounted renders an honest notice, which is the right state for a screen whose
    container is not written — and the wrong state for five nav destinations at
    once, which is a product that looks broken rather than unfinished.
  */
  screens: [
    { id: "stock", route: "/", label: "Stock", nav: "primary", icon: "box",
      permission: "stock:read" },
    /* ⚠️ A PRIMARY DESTINATION, BECAUSE IT IS THE GESTURE THE PRODUCT IS FOR.
       Filed under Stock as a button it would be one press further away than
       typing, which is the whole thing scanning exists to beat.

       ⚠️ AND `plain`, DELIBERATELY. The camera fills the screen, and an ambience
       behind a live video is a pattern nobody sees competing with the one thing
       somebody is looking at. */
    { id: "scan", route: "/scan", label: "Scan", nav: "primary", icon: "search",
      permission: "product:read" },
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
    /*
      ⚠️ A BAD READ IS RETRYABLE AND SAYS SO, because the fix is almost always to
      point the camera again. Reported against the code itself rather than over
      the screen: the sentence belongs where the string is.
    */
    "inventory.unreadable": {
      status: 422, retryable: true, tone: "warning",
      title: "That code did not read",
      detail: "Scan it again, or type it in.",
    },
    /*
      ⚠️ A CODE NAMES ONE PRODUCT. Learning a second owner makes every future
      scan of that string ambiguous, and the resolver would answer with whichever
      row it read first — a wrong product, confidently, for ever. The code on the
      shelf did not change, so one of the two answers is a mistake to look at.
    */
    /*
      ⚠️ OPENING A CONTAINER STARTS A CLOCK, AND IT MAY ONLY START ONCE. A second
      opening counted from today is a shelf life somebody extended by pressing a
      button — so the refusal names the day it was actually opened, which is the
      fact that settles whether this is the box they meant.
    */
    "inventory.opened": {
      status: 409, retryable: false, tone: "warning",
      title: "That one is already open",
      detail: "It was opened on {on}. Opening it again would extend its shelf life.",
    },
    "inventory.taken": {
      status: 409, retryable: false, tone: "warning",
      title: "That code belongs to something else",
      detail: "Open the product it is on and check which one is right.",
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
    /*
      ⚠️ HOW MANY DAYS COUNTS AS "SOON", AND IT IS A DECISION ABOUT A BUSINESS
      RATHER THAN ABOUT A DATE. A kitchen wants three days; a pharmacy wants
      ninety; a workshop counting solvents wants a month. Fixed at thirty, two of
      those three read a list that is useless in opposite directions.

      ⚠️ AND IT IS READ BY `batch.due` RATHER THAN BY THE SCREEN. It needs
      `tenant:manage`, so somebody on the floor cannot see it — a screen doing
      this sum would hard-code a number or show everybody the same wrong list.
    */
    "inventory.warn_days": setting({
      id: "inventory.warn_days", level: "tenant", area: "stock",
      field: field.number({ label: "Tell me this many days before", holds: "none", min: 0, max: 3_650 }),
      fallback: 30, needs: "tenant:manage",
      help: "A kitchen wants three. A pharmacy wants ninety.",
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
