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
  area, collection, defineApp, field, inReach, job as declareJob, newId, operation, setting,
  type AppSpec,
} from "@engine/kernel";
import {
  LADDER, MOVES, applyMove, crossedOn, daysLeft, effectiveExpiry, refuseMove, standingOf,
  type Move,
} from "./ledger.js";
/* ⚠️ ONLY THE TWO WORDS, BECAUSE THE MANIFEST DECLARES AND DOES NOT DECIDE. The
   reading and the precedence rules are the SCREEN's — a label is printed there,
   and a contradiction reported where nothing prints is a warning nobody sees. */
import { SIGNALS } from "./hazard.js";
import { PROFILES, wordsFor, type Words } from "./words.js";
import { columnsFor, planIn, readSheet, tallyIn, type Planned } from "./sheet.js";
import { dailyIn, lossesIn, reorder, toldIn, usageIn } from "./report.js";
import { CODE_KINDS, asGtin, readScan, stillNeeded, unread } from "./code.js";
import { settleCount, type Change } from "./count.js";
import { guessedIn, notedIn, readJson, type Noted } from "./reading.js";
import {
  RUNS, VERDICTS, landResult, mayLift, mayRelease, reachedIn, refuseRun,
  type Late, type Run, type RunAct, type Verdict,
} from "./release.js";
import {
  KITS, LIVES, checkKit, refuseAct, refuseKitAct, shelfStep, wantsIn,
  type Act, type KitState, type Life, type Short,
} from "./items.js";

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
    /**
     * ⚠️ ONE SENTENCE SAYING WHAT IT IS, WHICH A NAME CANNOT. "Gloves, blue" is
     * what somebody calls it on a shelf; "a box of 100 disposable blue nitrile
     * gloves, medium" is what settles whether the thing in their hand is this
     * row — and the second is the question a catalogue of eight hundred rows
     * asks all day.
     *
     * ⚠️ NOT SEARCHABLE, DELIBERATELY. `searchable` above is what leaves this
     * database to be found by MEANING, and a description written by a model is
     * the one field here nobody typed — indexing it would let a guess decide
     * what a search for a real phrase returns.
     */
    description: field.long({ label: "Description", holds: "none", max: 600 }),
    /**
     * ⚠️ SUPERSEDED BY `tag`, AND STILL DECLARED, WHICH IS DELIBERATE. Nothing
     * writes this any more — a product belongs to as many kinds as it belongs
     * to, and one string made somebody pick the one they would search by. The
     * column stays because a schema module adds and never drops: removing the
     * declaration would leave rows carrying a word no screen can reach, which is
     * worse than a field that is honestly labelled as the old answer.
     */
    category: field.text({ label: "Category (was)", holds: "none", max: 120 }),
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
    /*
      ⚠️ THE CLASSIFICATION, AND IT EXISTS BECAUSE OF DECANTING. Pour solvent
      from a 20 L drum into a 500 ml bottle and that bottle is a container of a
      hazardous substance with no label on it — the supplier's stayed on the
      drum. This is what the decant label is printed FROM, and without it the
      product can record a chemical and cannot label one.

      ⚠️ A LIST OF GHS CODES, COPIED OFF A SAFETY DATA SHEET. Never inferred from
      a name and never committed by a model — see `hazard.ts` and §6.2: a
      classification is a legal declaration, and a guess wearing one is worse
      than a blank field, which at least looks blank.
    */
    hazards: field.json({ label: "Hazards", holds: "none" }),
    /* ⚠️ ONE WORD OR NEITHER, AND IT IS NOT DERIVABLE FROM THE DIAMONDS. The
       same pictogram carries Danger in one category and Warning in another, so
       an app computing it would be an app classifying a substance. */
    signal: field.enum({
      label: "Signal word", holds: "none", values: [...SIGNALS],
      labels: { danger: "Danger", warning: "Warning" },
    }),
    /* ⚠️ THE H AND P STATEMENTS AS THEY ARE PRINTED. Text rather than codes,
       because what goes on the bottle is the sentence — "Causes severe skin
       burns" — and a reader holding it cannot look H314 up. */
    hazardText: field.long({ label: "Hazard statements", holds: "none", max: 2_000 }),
    precautions: field.long({ label: "Precautions", holds: "none", max: 2_000 }),
    /**
     * ⚠️ HOW LONG IT KEEPS FROM THE DAY IT WAS MADE — the fourth clock, and the
     * one that rescues a box printed with a manufacture date and no expiry.
     * Counted from `batch.made`, which is the delivery's.
     *
     * ⚠️ MONTHS ARE WHAT LABELS SAY AND DAYS ARE WHAT ARITHMETIC NEEDS, so the
     * field is days and the screen does the conversion. Storing months would
     * put "how long is a month" into every comparison — and a shelf life is
     * compared against a calendar date, which has no months in it.
     */
    shelfDays: field.number({ label: "Days from making", holds: "none", min: 0, max: 3_650 }),
    /* ⚠️ Days after opening, which is one of four clocks that can end a
       batch — see `effectiveExpiry`. */
    openDays: field.number({ label: "Days once opened", holds: "none", min: 0, max: 3_650 }),
    /* ⚠️ THE THIRD CLOCK'S LENGTH, AND IT IS THE PRODUCT'S FOR THE SAME REASON
       `openDays` IS. "Sterile for 90 days" is a fact about the wrapping and the
       method, not about one tray — two runs of the same thing disagreeing about
       it is two answers to one question. */
    processDays: field.number({ label: "Days once processed", holds: "none", min: 0, max: 3_650 }),
    /*
      ⚠️ SOMETHING RECEIVED BEFORE ANYBODY SAID WHAT IT WAS. The worst outcome in
      this product is a delivery that went unrecorded because a form demanded a
      field the person did not have — so an unknown code becomes a row named
      after itself, and this is what makes that row FINDABLE rather than a
      silent pile of numbered things nobody ever looks at.
    */
    /**
     * ⚠️ WHICH SUPPLIER IS PREFERRED — one field, because ordering is a decision
     * and a list is a list nothing chooses from. That sentence was the whole
     * argument for a single supplier and it is still right; what it was wrong
     * about is that the OTHERS then had nowhere to live at all. `sourcing` is
     * the list; this names the one an order goes to.
     *
     * ⚠️ AND IT MUST BE ONE OF THEM. A preferred supplier absent from the
     * product's own list is an order addressed to somebody the catalogue does
     * not say sells it.
     */
    supplier: field.ref({ label: "Order from", holds: "none", to: "supplier" }),
    /**
     * ⚠️ WHETHER CROSSING `par` IS WORTH ACTING ON, WHICH IS NOT THE SAME AS
     * WORTH KNOWING. Every product with a `par` is reported when it goes under;
     * this is the smaller set somebody wants a purchase raised for, and it is
     * separate because "tell me" and "do something" are different appetites and
     * a workspace has far more of the first.
     *
     * DEFER(inventory-reorder): what crossing the line SENDS — an email to the
     * preferred supplier, and the RFQ lane behind it — is not built. Until it
     * is, this decides whether the product joins the reorder list rather than
     * whether anything leaves the building, and the screen says exactly that. A
     * switch whose label promises an email nobody sends is worse than no switch.
     */
    reorder: field.bool({ label: "Raise a reorder", holds: "none" }),
    /* ⚠️ HOW MANY TO GET, not how many are left. A par of 20 answers "tell me at
       20" and says nothing about whether the right order is 20 or 200 — which
       depends on the pack, the lead time and how fast it moves. */
    reorderQty: field.number({ label: "How many to order", holds: "none", min: 1 }),
    unnamed: field.bool({ label: "Not named yet", holds: "none" }),
    /*
      ⚠️ WHAT ONE OF THESE IS SUPPOSED TO CONTAIN — the standard tray, the
      standard tool kit — and it lives on the TYPE rather than on each assembled
      one. A recipe re-typed per tray is a recipe that drifts, and the whole
      point of a kit check is that every tray is measured against the same list.

      ⚠️ AND IT IS COPIED ONTO THE KIT WHEN ONE IS ASSEMBLED. A tray put together
      in March is complete or not against the list it was assembled under — a
      recipe edited since must never make a finished kit retrospectively wrong.
    */
    recipe: field.json({ label: "What a kit holds", holds: "none" }),
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
  /* ⚠️ A PLACE IS THE THING BEING REACHED, so its own id is what a grant names —
     and a member narrowed to two sites sees those two and everything under
     them, which is what makes the picker on the roster honest. */
  reachBy: "id",
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
 * WHO IT COMES FROM.
 *
 * ⚠️ A LIST RATHER THAN AN ADVISOR, and that is the whole of what was missing.
 * The reorder report can already say what to buy and how long it lasts; without
 * this it cannot say who to ring, so the last step of the one workflow the
 * report exists for happens in somebody's head or in a different app.
 *
 * ⚠️ AND `leadDays` IS HERE AS WELL AS IN THE SETTINGS, because the workspace's
 * number is the slowest supplier it has and using it for everybody orders
 * everything three weeks early. Absent falls back to the setting — which is what
 * makes adding a supplier an improvement rather than a prerequisite.
 *
 * ⚠️ NO PRICES. What a workspace pays is a commercial relationship this product
 * has no business holding, and the moment it does, an import, an export and a
 * screen all carry it — see the code book's own line about a moat and a
 * disclosure.
 */
const supplier = collection({
  id: "supplier",
  label: { one: "Supplier", many: "Suppliers" },
  scope: { of: "tenant" },
  permission: "product",
  retention: null,
  onClose: { then: "purge" },
  offline: "cache",
  searchable: ["name"],
  fields: {
    name: field.text({ label: "Name", required: true, holds: "none", max: 200 }),
    /*
      ⚠️ A PERSON'S NAME AND A WAY TO REACH THEM, AND THEY ARE DECLARED AS WHAT
      THEY ARE. `holds` is not documentation — it is what the processing record
      is generated from and what the export collects, and a contact filed as
      `none` is a disclosure that is wrong in the direction nobody checks.
    */
    contact: field.text({ label: "Who to ask for", holds: "identity", max: 120 }),
    email: field.email({ label: "Email", holds: "contact" }),
    phone: field.text({ label: "Phone", holds: "contact", max: 40 }),
    /* ⚠️ WHAT THEY CALL US, which is what goes on an order and is the one thing
       nobody can look up. */
    account: field.text({ label: "Our account", holds: "none", max: 64 }),
    /* ⚠️ THEIRS, OVERRIDING THE WORKSPACE'S — see the header. Empty falls back
       to the setting rather than to zero, which would order everything the day
       it dipped. */
    leadDays: field.number({ label: "A delivery takes", holds: "none", min: 0, max: 365 }),
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
      /* ⚠️ `minted` IS OURS AND IS THE MOST TRUSTWORTHY OF THE FIVE. It is the
         only value here that names a code this workspace PRINTED rather than
         read off a box, so when two codes disagree it is the one that wins. */
      values: ["scanned", "typed", "imported", "ai-assisted", "minted"],
    }),
  },
});

/**
 * A PICTURE OF A PRODUCT THAT IS NOT THE PHOTOGRAPH OF RECORD.
 *
 * ⚠️ `product.photo` IS THE ONE SOMEBODY TOOK, AND IT STAYS THAT WAY. It is what
 * a person looks at to decide whether the thing in their hand is this product,
 * and that question has to be answered by a photograph of the actual thing. This
 * collection is the GALLERY around it — the other five angles, the clean shot
 * for a catalogue — and it is a separate table rather than a list on the product
 * for one reason: every row has to be able to say where it came from.
 *
 * ⚠️ `made` IS A COLUMN BECAUSE IT IS A FACT ABOUT THE IMAGE, NOT A CONVENTION.
 * A generated picture is a picture of what a model believes the product looks
 * like, and in a warehouse that is a different KIND of thing from a photograph —
 * so it is marked in the database, not in a filename or by which screen drew it.
 * `product.photo` may never point at one, and a product carrying a hazard
 * classification may not have one at all: a generated drum with a generated
 * pictogram on it is a picture of a legal declaration nobody made.
 */
const shot = collection({
  id: "shot",
  label: { one: "Picture", many: "Pictures" },
  scope: { of: "tenant" },
  permission: "product",
  retention: null,
  onClose: { then: "purge" },
  /* ⚠️ Queued, like the product itself: a picture taken in a basement is the
     whole reason the phone was out. */
  offline: "queue",
  fields: {
    product: field.ref({ label: "Product", required: true, holds: "none", to: "product" }),
    image: field.media({ label: "Picture", required: true, holds: "none", purpose: "product-photo" }),
    /**
     * ⚠️ TRUE MEANS A MODEL DREW IT. See the header — this is the whole reason
     * the gallery is a table.
     *
     * DEFER(inventory-gallery): nothing sets it yet, because there is no way to
     * MAKE one. Every AI lane in this deployment answers with text: `generate`
     * returns `{ text, credits }` and the gateway's compat endpoint reads
     * `choices[].message.content`. A run that answers with BYTES is a different
     * shape end to end — an `image` meter that counts pictures rather than
     * tokens, a write through the media ledger so the object is inside the
     * quota and inside erasure, and a settle against a per-image price. The
     * column and the rule it carries are right and cost nothing to hold; the
     * gallery screen offers no "recreate" control until the lane behind it
     * exists, because a button that produces nothing is the failure this whole
     * file is written against.
     */
    made: field.bool({ label: "Made by a model", holds: "none" }),
    /* ⚠️ WHICH ANGLE, so a gallery has an order somebody chose rather than the
       order the uploads happened to finish in. */
    ord: field.number({ label: "Order", holds: "none", min: 0, max: 99 }),
  },
});

/**
 * A WORD THIS WORKSPACE USES FOR A KIND OF THING.
 *
 * ⚠️ A VOCABULARY RATHER THAN A STRING ON EACH PRODUCT, AND THE REASON IS THE
 * MODEL. Asking one to categorise a thing against nothing produces "Cleaning",
 * "Cleaning products", "Cleaning supplies" and "Janitorial" across four
 * mornings — every one defensible, and the catalogue is then unfilterable by the
 * thing it was categorised for. A table can be READ before it is written to, so
 * the question becomes "which of these does it belong to, and is any of them
 * missing" rather than "what would you call this".
 *
 * ⚠️ AND IT REPLACES `product.category`, WHICH WAS ONE STRING. A product belongs
 * to more than one kind — a nitrile glove is protective equipment AND a
 * consumable AND single-use — and a single field made somebody pick the one they
 * would search by, which is the one they remember and nobody else does.
 */
const tag = collection({
  id: "tag",
  label: { one: "Tag", many: "Tags" },
  scope: { of: "tenant" },
  permission: "product",
  retention: null,
  onClose: { then: "purge" },
  offline: "cache",
  /* ⚠️ The whole point of the table: a tag is looked up by its word. */
  searchable: ["name"],
  fields: {
    name: field.text({ label: "Tag", required: true, holds: "none", max: 60 }),
    /* ⚠️ WHERE IT CAME FROM, for the same reason `code.source` records it: a
       word a model invented and a word somebody typed deserve different amounts
       of trust the day the list needs tidying. */
    source: field.enum({
      label: "Added by", holds: "none",
      values: ["typed", "imported", "ai-assisted"],
    }),
  },
});

/** One product, one tag. The join, so a tag can be renamed in one place. */
const tagging = collection({
  id: "tagging",
  label: { one: "Tagging", many: "Taggings" },
  scope: { of: "tenant" },
  permission: "product",
  retention: null,
  onClose: { then: "purge" },
  offline: "queue",
  fields: {
    product: field.ref({ label: "Product", required: true, holds: "none", to: "product" }),
    tag: field.ref({ label: "Tag", required: true, holds: "none", to: "tag" }),
  },
});

/**
 * SOMEWHERE THIS PRODUCT CAN BE BOUGHT FROM.
 *
 * ⚠️ THE PRODUCT USED TO CARRY ONE SUPPLIER, AND THE ARGUMENT FOR ONE WAS THAT A
 * LIST IS A LIST NOTHING CHOOSES FROM. That argument is right about the moment
 * of ordering and wrong about the world: a workspace that dual-sources a
 * consumable recorded the second place nowhere, so the answer to "who else sells
 * this" lived in somebody's head.
 *
 * ⚠️ SO THE LIST IS HERE AND THE CHOICE STAYS ON THE PRODUCT. `product.supplier`
 * names which of these is PREFERRED — one field, one answer, and the reorder
 * still has nothing to ask. A second `preferred` flag on these rows would be the
 * same fact in two places, which is how two of them come to be true.
 */
const sourcing = collection({
  id: "sourcing",
  label: { one: "Supply", many: "Supplies" },
  scope: { of: "tenant" },
  permission: "product",
  retention: null,
  onClose: { then: "purge" },
  offline: "queue",
  fields: {
    product: field.ref({ label: "Product", required: true, holds: "none", to: "product" }),
    supplier: field.ref({ label: "Supplier", required: true, holds: "none", to: "supplier" }),
    /* ⚠️ WHAT THEY CALL IT, which is what goes on an order and is almost never
       what this workspace calls it. */
    ref: field.text({ label: "Their reference", holds: "none", max: 80 }),
    /* ⚠️ HOW LONG THEY TAKE, per supplier rather than per product — which is the
       whole reason somebody keeps a second one. */
    leadDays: field.number({ label: "Days to arrive", holds: "none", min: 0, max: 365 }),
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
    /**
     * ⚠️ WHEN IT WAS MADE, WHICH IS OFTEN ALL THE BOX SAYS. "MFD 2026-03-14"
     * with "24 months from manufacture" on the back is a complete shelf life,
     * and outside EU retail it is the ordinary way a product is labelled — so a
     * delivery that arrived with only this had no expiry at all, and the sweep
     * that exists to catch expiring stock never saw it.
     *
     * ⚠️ IT IS NOT AN EXPIRY AND MUST NOT BE READ AS ONE. The days it runs for
     * are the PRODUCT's (`shelfDays`), for the same reason `opened` takes
     * `openDays`: how long a thing keeps is a fact about the thing, and when
     * this one was made is a fact about the delivery.
     */
    made: field.day({ label: "Made on", holds: "none" }),
    /* ⚠️ THE SECOND CLOCK STARTS HERE, and only once — see `batch.open`. The
       days it runs for are the PRODUCT's (`openDays`), because "use within 28
       days of opening" is a fact about the substance rather than the delivery. */
    opened: field.day({ label: "Opened", holds: "none" }),
    /* ⚠️ WHEN IT ARRIVED, which is not an expiry and is not decoration: two lots
       with the same printed date are used oldest-received first. */
    received: field.day({ label: "Received", holds: "none" }),
    /*
      ⚠️ THE THIRD CLOCK, AND IT IS STAMPED BY A RELEASE RATHER THAN BY A RUN
      FINISHING. "Sterile for 90 days from processing" counts from the moment a
      qualified person said the run was good — a machine's own end time would
      start a shelf life on evidence nobody had read.

      ⚠️ AND IT IS CLEARED WHEN A QUARANTINE IS LIFTED. A lifted item is unfrozen
      and NOT released; leaving the stamp on would make a tray whose steriliser
      failed read as sterile for ninety days.
    */
    processed: field.day({ label: "Processed", holds: "none" }),
    /*
      ⚠️ FROZEN, AND IT IS THE ONE FLAG THAT REFUSES A TAKE. A quarantine nothing
      enforces is a badge on a screen: the shelf still hands the box over, the
      person still uses it, and the record says it was held the whole time. See
      `stockMove`.
    */
    standing: field.enum({
      label: "Standing", holds: "none", values: ["ok", "held"],
    }),
    note: field.long({ label: "Note", holds: "none", max: 2_000 }),
  },
});

/**
 * ONE OBJECT, FOR ITS WHOLE LIFE.
 *
 * ⚠️ THIS IS WHERE THE LADDER STOPS BEING ABOUT QUANTITIES. A number answers
 * "how many"; an item answers "which one, who has it, when was it last serviced,
 * and is it still fit to use". A forklift, a fire extinguisher, a laptop and a
 * surgical clamp are the same shape, and it is one rung rather than a second
 * product.
 *
 * ⚠️ AND ITS LABEL IS OURS, WHICH IS WHAT MAKES A SECOND SCAN DETECTABLE. Every
 * other code in this workspace names a TYPE — one glove box's barcode is every
 * glove box's barcode — so the same code twice is two things. Ours names this
 * object, so the same label twice during a count is the same object counted
 * twice, and the app can say so.
 *
 * ⚠️ NOTHING HERE IS EDITABLE BY HAND, for the reason `stock` is not. `life` and
 * `location` are what the balance is made of: a generated update setting a unit
 * to `retired` would take an object off the shelf in one table and leave it on
 * in the other, with no movement saying why.
 */
const unit = collection({
  id: "unit",
  /* ⚠️ "Item" IS THE WORD A PERSON READS. `unit` is the schema's name and it is
     the one the plan uses; a person's "unit" is what a quantity is counted in,
     which is a different thing on the same screen. */
  label: { one: "Item", many: "Items" },
  scope: { of: "tenant" },
  permission: "stock",
  retention: null,
  onClose: { then: "purge" },
  offline: "queue",
  without: ["create", "update", "delete"],
  /* ⚠️ THE MAKER'S SERIAL, BECAUSE IT IS WHAT A WARRANTY CLAIM AND A RECALL BOTH
     NAME. Ours is scanned, never typed; theirs is read off a plate by somebody
     on the phone to a supplier. */
  searchable: ["serial"],
  reachBy: "location",
  fields: {
    product: field.ref({ label: "Product", required: true, holds: "none", to: "product" }),
    /* ⚠️ WHERE IT LIVES WHEN IT IS OURS AND ON A SHELF. It keeps its place while
       it is out with somebody, which is what makes "take it back" a gesture
       rather than a question about which rack it came from. */
    location: field.ref({ label: "Where", holds: "none", to: "location" }),
    /* ⚠️ WHICH DELIVERY IT CAME OUT OF, where the product also keeps lots. A
       recall names a lot, and an itemised recall has to reach the objects. */
    batch: field.ref({ label: "Batch", holds: "none", to: "batch" }),
    kit: field.ref({ label: "In the kit", holds: "none", to: "kit" }),
    /* ⚠️ OURS, `ONE-U-…`, AND IT IS THE IDENTITY. Minted when the object is
       received and never re-issued — a re-used label is two objects with one
       history. */
    code: field.text({ label: "Label", holds: "none", max: 64 }),
    serial: field.text({ label: "Serial", holds: "none", max: 120 }),
    life: field.enum({
      label: "Standing", required: true, holds: "none", values: [...LIVES],
    }),
    /*
      ⚠️ WHO HAS IT, AND IT IS SOMEBODY'S NAME. Declared `contact` so it reaches
      the processing record, the export and the retention clock — a workspace
      holding "Ana Ruiz has the drill" is holding a fact about a person, whatever
      the column is called.

      ⚠️ AND IT IS TEXT RATHER THAN A REFERENCE TO AN ACCOUNT, because most of
      the people things are issued to are not in the system: a contractor, an
      agency nurse, a driver. A reference would make the honest record the one
      nobody can write.
    */
    holder: field.text({ label: "With", holds: "contact", max: 120 }),
    issued: field.day({ label: "Out since", holds: "none" }),
    /* ⚠️ THE NEXT SERVICE OR CALIBRATION, and it is the whole of the "asset"
       case — a thing nobody ever counts and everybody has to maintain. */
    due: field.day({ label: "Next service", holds: "none" }),
    services: field.number({ label: "Services", holds: "none", min: 0 }),
    acquired: field.day({ label: "Acquired", holds: "none" }),
    retired: field.day({ label: "Retired", holds: "none" }),
    note: field.long({ label: "Note", holds: "none", max: 2_000 }),
  },
});

/**
 * A COMPOSED GROUP WITH A LIFE OF ITS OWN — a surgery tray, a tool kit.
 *
 * ⚠️ A KIT IS NOT A PACK, AND THE LINE IS CLEAN. A pack is N of the SAME product
 * and is a unit of measure with no identity; a kit is a group of DIFFERENT things
 * that has identity and a lifecycle. A box of ten gloves is a pack. A tray is a
 * kit.
 *
 * ⚠️ AND IT IS `kit` RATHER THAN THE PLAN'S `set`, deliberately. "Set" is what
 * the modelling calls it, and it is also a verb, a JavaScript built-in and the
 * second half of every `useState` line in this app's screens — three chances for
 * the reader to misparse the word that names the record.
 *
 * ⚠️ THE RECIPE IS COPIED HERE FROM THE PRODUCT AT ASSEMBLY. A tray put together
 * in March is complete or not against the list it was assembled under; measuring
 * it against a recipe edited since would make a finished kit retrospectively
 * wrong, which is a claim nobody made.
 */
const kit = collection({
  id: "kit",
  label: { one: "Kit", many: "Kits" },
  scope: { of: "tenant" },
  permission: "stock",
  retention: null,
  onClose: { then: "purge" },
  offline: "queue",
  without: ["create", "update", "delete"],
  reachBy: "location",
  fields: {
    product: field.ref({ label: "Product", required: true, holds: "none", to: "product" }),
    location: field.ref({ label: "Where", holds: "none", to: "location" }),
    code: field.text({ label: "Label", holds: "none", max: 64 }),
    state: field.enum({
      label: "Standing", required: true, holds: "none", values: [...KITS],
    }),
    /* ⚠️ THE SNAPSHOT, NOT A POINTER — see the header. */
    recipe: field.json({ label: "What it holds", holds: "none" }),
    /* ⚠️ WHEN SOMEBODY CLAIMED IT WAS COMPLETE. The audit row says who; this is
       what a person reads on the tray's own screen. */
    built: field.day({ label: "Built", holds: "none" }),
    note: field.long({ label: "Note", holds: "none", max: 2_000 }),
  },
});

/**
 * ONE RUN OVER A SET OF THINGS, PRODUCING EVIDENCE, ENDING IN A NAMED RELEASE.
 *
 * ⚠️ THAT SENTENCE IS STERILISATION, CALIBRATION, HEAT TREATMENT, CURING, A QA
 * HOLD, A COLD-CHAIN REVIEW AND A CLEANING VALIDATION, and it is one shape. A
 * previous product built it for clinics and could only ever sell it to clinics;
 * the only thing that made it clinical was the word on the screen.
 *
 * ⚠️ AND `ended` IS NOT `released`. A machine finishing its cycle is a fact about
 * a machine; "this may be used" is a judgement somebody puts their name to after
 * reading the printout. Collapsing the two makes the green light the
 * qualification — see `refuseRun`.
 */
const process = collection({
  id: "process",
  label: { one: "Run", many: "Runs" },
  scope: { of: "tenant" },
  permission: "process",
  retention: null,
  onClose: { then: "purge" },
  offline: "queue",
  /* ⚠️ NOT DELETABLE, EVER. Evidence somebody released against is the record of
     why they were entitled to; a run that can be removed is a release with
     nothing behind it. */
  without: ["create", "update", "delete"],
  searchable: ["kind", "note"],
  fields: {
    /* ⚠️ THE WORKSPACE'S OWN WORD FOR THE RUN — "Autoclave 134°C", "Annual
       calibration", "Post-cure". Free text because the list is the customer's,
       and an enum here is the clinical assumption coming back in. */
    kind: field.text({ label: "What kind of run", required: true, holds: "none", max: 120 }),
    /* Which machine, oven, bath or bench. */
    machine: field.text({ label: "Machine", holds: "none", max: 120 }),
    state: field.enum({
      label: "Standing", required: true, holds: "none", values: [...RUNS],
    }),
    started: field.day({ label: "Started", required: true, holds: "none" }),
    /* ⚠️ AN INSTANT, NOT A DAY. A cycle is minutes long and two runs of one
       machine in an afternoon are two records somebody has to tell apart. */
    ended: field.instant({ label: "Finished", holds: "none" }),
    released: field.instant({ label: "Released", holds: "none" }),
    /* ⚠️ WHAT THE EVIDENCE WAS. A printout reference, an indicator lot, a
       certificate number — the thing somebody would go and look at. */
    evidence: field.text({ label: "Evidence", holds: "none", max: 200 }),
    note: field.long({ label: "Note", holds: "none", max: 2_000 }),
  },
});

/**
 * ONE THING A RUN COVERED, AND WHAT THE RUN DECIDED ABOUT IT.
 *
 * ⚠️ THE VERDICT IS PER ITEM RATHER THAN PER RUN, because a recall reaches some
 * of what a run covered and not the rest — the boxes still on a shelf freeze,
 * and the ones already used are gone. A verdict stored only on the run would
 * make those two the same row.
 */
const processItem = collection({
  id: "process-item",
  label: { one: "In the run", many: "In the run" },
  scope: { of: "tenant" },
  permission: "process",
  retention: null,
  onClose: { then: "purge" },
  offline: "queue",
  without: ["create", "update", "delete"],
  fields: {
    process: field.ref({ label: "Run", required: true, holds: "none", to: "process" }),
    batch: field.ref({ label: "Batch", required: true, holds: "none", to: "batch" }),
    verdict: field.enum({
      label: "Verdict", required: true, holds: "none", values: [...VERDICTS],
    }),
    /* ⚠️ WHY IT WAS LIFTED, WHERE IT WAS. A quarantine lifted with no reason is
       a freeze somebody undid and nobody can account for. */
    reason: field.text({ label: "Why", holds: "none", max: 200 }),
  },
});

/**
 * A CONSUMING CONTEXT THAT REFERENCES SOMETHING OUTSIDE THE SYSTEM.
 *
 * ⚠️ A PATIENT CASE, A WORK ORDER, A BUILD NUMBER, A SERVICE CALL, A COOK, A ROOM
 * TURNAROUND — one shape, and what makes it general is that the reference is a
 * LABEL the workspace chose rather than a record this app holds. The moment it
 * became a patient it stopped being sellable to a factory.
 *
 * ⚠️ AND IT HAS NO LINE TABLE, DELIBERATELY. What a job consumed is already in
 * the ledger, against this job's id — so the trace is a QUERY rather than a
 * second copy, and a job correct on Tuesday acquires a concern on Thursday
 * without anything about the job changing. A status stored at close time cannot
 * do that, which is the whole reason to read it backwards. See `job.trace`.
 */
const job = collection({
  id: "job",
  label: { one: "Job", many: "Jobs" },
  scope: { of: "tenant" },
  permission: "process",
  retention: null,
  onClose: { then: "purge" },
  offline: "queue",
  without: ["create", "update", "delete"],
  searchable: ["ref", "label"],
  fields: {
    /*
      ⚠️ SOMEBODY ELSE'S NUMBER, AND IT IS `contact` BECAUSE IT MAY NAME A PERSON.
      A work order is a string; a case number in a clinic is a person by another
      name, and the app cannot tell which it has been given. Declaring it as a
      holding is what puts it in the processing record, the export and the
      retention clock — and it is NOT a vault field, because putting the custody
      machinery in front of a work-order number would make the ordinary case the
      expensive one.
    */
    ref: field.text({ label: "Reference", required: true, holds: "contact", max: 120 }),
    label: field.text({ label: "What it is", holds: "none", max: 200 }),
    state: field.enum({
      label: "Standing", required: true, holds: "none", values: ["open", "closed"],
    }),
    opened: field.day({ label: "Opened", required: true, holds: "none" }),
    closed: field.day({ label: "Closed", holds: "none" }),
    note: field.long({ label: "Note", holds: "none", max: 2_000 }),
  },
});

/**
 * ONE SHELF BEING COUNTED — open until somebody closes it.
 *
 * ⚠️ THE SESSION IS THE SCOPE, AND THE SCOPE IS WHAT PREVENTS DOUBLE COUNTING.
 * You cannot tell one generic barcode from another and you do not need to:
 * everything scanned while this is open belongs to this shelf, and the same code
 * thirty times is thirty items. You do not count a shelf twice for the reason
 * you never did on paper — you ticked the shelf off.
 *
 * ⚠️ AND `blind` IS A REAL CHOICE RATHER THAN A PREFERENCE. Hiding the expected
 * number gives better data and catches errors an informed count reads straight
 * past; showing it is faster. Auditors insist on blind, which is why it is per
 * SESSION and cannot be changed once counting has started.
 */
const count = collection({
  id: "count",
  label: { one: "Count", many: "Counts" },
  scope: { of: "tenant" },
  permission: "stock",
  retention: null,
  onClose: { then: "purge" },
  offline: "queue",
  /* ⚠️ Opened and closed by their own operations — a session that could be
     created by hand is a session with no shelf and no clock on it. */
  without: ["create", "update", "delete"],
  reachBy: "location",
  fields: {
    location: field.ref({ label: "Where", required: true, holds: "none", to: "location" }),
    /* ⚠️ EMPTY MEANS OPEN. A separate status column would be a second answer to
       the same question, and the two would disagree the first time a close half
       failed. */
    closed: field.instant({ label: "Closed", holds: "none" }),
    blind: field.bool({ label: "Blind", holds: "none" }),
    /* ⚠️ THE DEVICE'S OWN DAY, kept so coverage can say "counted three weeks
       ago" in the calendar the person counting was standing in. */
    day: field.day({ label: "On", required: true, holds: "none" }),
  },
});

/**
 * WHAT ONE SESSION FOUND — a running total per thing, per shelf.
 *
 * ⚠️ IT IS NOT THE BALANCE AND MUST NEVER BE READ AS ONE. Until the session is
 * closed this is what somebody has scanned so far; the shelf still holds
 * whatever `stock` says. Confusing the two would make a half-finished count
 * visible to everybody else as fact.
 */
const tally = collection({
  id: "tally",
  label: { one: "Tally", many: "Tallies" },
  scope: { of: "tenant" },
  permission: "stock",
  retention: null,
  onClose: { then: "purge" },
  offline: "queue",
  without: ["create", "update", "delete"],
  fields: {
    count: field.ref({ label: "Count", required: true, holds: "none", to: "count" }),
    product: field.ref({ label: "Product", required: true, holds: "none", to: "product" }),
    batch: field.ref({ label: "Batch", holds: "none", to: "batch" }),
    quantity: field.number({ label: "How many", required: true, holds: "none", min: 0 }),
    /*
      ⚠️ WHICH OBJECT, AND IT IS HOW "ALREADY COUNTED" IS POSSIBLE AT ALL. Every
      other code names a TYPE — one glove box's barcode is every glove box's —
      so the same code twice is two things and must be. Ours names one object, so
      an itemised thing tallies as a row PER ITEM: the row id carries the item,
      the insert does nothing on conflict, and a second scan of the same label
      is a refusal rather than a silent two.
    */
    unit: field.ref({ label: "Item", holds: "none", to: "unit" }),
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
  reachBy: "location",
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
  reachBy: "location",
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

/** ⚠️ The narrowest shape a handler here needs — see the ground's, and the reason. */
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
  /* ⚠️ `ref` IS THE REASON A REFUSAL CAN BE ACTED ON. A provider that has no key
     and one that timed out are one sentence to the person and two different
     jobs for whoever configured the deployment. */
  fail(
    code: string,
    values?: Record<string, string>,
    extra?: { fields?: Record<string, string>; ref?: string },
  ): never;
  setting(id: string): Promise<unknown>;
  /**
   * ⚠️ WHICH LOCATIONS THIS PERSON WORKS IN, OR `null` FOR ALL OF THEM. Resolved
   * by the platform from the membership, with everything nested under a granted
   * location already spread into it — see `@engine/kernel`'s `reach.ts`.
   */
  readonly reach: readonly string[] | null;
}

/* ------------------------------------------------------------------ reach --- */

/**
 * IS THIS SHELF ONE OF THEIRS?
 *
 * ⚠️ THE ONE PLACE THIS PRODUCT ASKS, AND EVERY HANDLER THAT TAKES A LOCATION
 * CALLS IT. The generated CRUD narrows itself; a handwritten handler does not,
 * and this product has forty statements of its own over the five collections
 * that say where a record is. Written out per handler, one of them is eventually
 * missed — and a missed one is a person moving another site's stock with the
 * list in front of them showing none of it.
 */
function mine(c: Ctx, location: string | null | undefined): void {
  if (!inReach(c.reach, location ?? null)) {
    c.fail("platform.out_of_reach", { places: "locations" });
  }
}

/**
 * THE SAME QUESTION AS A FRAGMENT, FOR A READ ACROSS THE WHOLE WORKSPACE.
 *
 * ⚠️ AN EMPTY REACH IS `1 = 0` RATHER THAN NOTHING. Somebody narrowed to no
 * locations reads nothing; an `IN ()` is a syntax error and an omitted clause
 * turns "nowhere" into "everywhere", which is the one direction a mistake here
 * must never take.
 *
 * ⚠️ AND THE COLUMN IS NAMED BY THE CALLER because the five tables spell it the
 * same and one of them does not: `location` everywhere, `id` on `location`
 * itself, where the place IS the row.
 */
function only(c: Ctx, column = "location"): { sql: string; bound: readonly string[] } {
  if (c.reach === null) return { sql: "", bound: [] };
  if (!c.reach.length) return { sql: " AND 1 = 0", bound: [] };
  return {
    sql: ` AND ${column} IN (${c.reach.map(() => "?").join(", ")})`,
    bound: c.reach,
  };
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
async function stockMove(
  ctx: Ctx, move: Move, input: MoveInput,
): Promise<{ id: string; quantity: number; movement: string }> {
  const db = ctx.db as Db;
  /* ⚠️ ASKED HERE, WHICH IS WHY IT IS ASKED ONCE. Every take, receive,
     correction, decant, transfer and undo in this product moves a balance
     through this function, so the shelf a person is allowed to touch is decided
     in one place rather than in fourteen handlers. */
  mine(ctx, input.location);
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
      `SELECT product, standing FROM batch WHERE id = ? AND tenant_id = ?`)
      .bind(batch, ctx.tenantId).first<{ product: string; standing: string | null }>();
    if (!of || of.product !== input.product) ctx.fail("platform.not_found");
    /*
      ⚠️ A QUARANTINE THAT DOES NOT REFUSE A TAKE IS A BADGE ON A SCREEN. The
      shelf still hands the box over, the person still uses it, and the record
      says it was held the whole time — which is worse than not holding it,
      because somebody read the badge and believed it.

      ⚠️ AND ONLY A TAKE. Correcting a frozen line, receiving more of the lot and
      undoing a mis-scan all have to stay possible: freezing stock must not
      freeze the ability to keep an honest record of it.
    */
    if (of.standing === "held" && move === "taken") ctx.fail("inventory.held");
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

  /* ⚠️ THE MOVEMENT'S OWN ID IS ANSWERED, WHICH IS WHAT MAKES UNDO REACHABLE.
     Without it every caller would have to go and find the row it just wrote by
     guessing at a timestamp — and "the last thing you just did" is precisely
     what a person means when they press take-back. */
  const movement = `led_${ctx.now}_${id}`;
  await db.prepare(
    `INSERT INTO ledger
      (id, tenant_id, move, product, location, batch, delta, day, reason, capture,
       against, at, by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(movement, ctx.tenantId, move, input.product, input.location, batch,
      step, input.day, input.reason ?? null, input.capture, input.against ?? null,
      ctx.now, ctx.accountId ?? null).run();

  return { id, quantity: now, movement };
}

const moveOutput = {
  id: field.text({ label: "Line", holds: "none" }),
  quantity: field.number({ label: "How many now", holds: "none" }),
  /* ⚠️ THE LEDGER ROW THIS WROTE. It is what `stock.undo` takes, so a caller
     never has to find the movement it just made. */
  movement: field.text({ label: "Movement", holds: "none" }),
} as const;

/**
 * ⚠️ FOUR VERBS RATHER THAN ONE WITH A PARAMETER, and the split is the product's
 * sharpest rule. Taking something and correcting a number are different acts by
 * different people for different reasons — collapsed into `stock.change(delta)`
 * they become indistinguishable in the history, and a shrinkage report over that
 * history is a list of numbers nobody can explain.
 */
type Moved = { id: string; quantity: number; movement: string };

const receive = operation<MoveInput, Moved>({
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

const take = operation<MoveInput, Moved>({
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
const adjust = operation<MoveInput, Moved>({
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

/* --------------------------------------------------------- the catalogue --- */

/**
 * TWO SPELLINGS OF ONE NAME, MADE INTO ONE KEY.
 *
 * ⚠️ THIS IS THE WHOLE OF THE RESEMBLANCE CHECK AND IT IS DELIBERATELY BLUNT.
 * "Gloves, Nitrile (Blue)" and "gloves nitrile blue" are the same product typed
 * by two people; anything cleverer — an edit distance, a stemmer — starts
 * calling different products the same one, and a false match here is a person
 * being told their new product already exists when it does not.
 */
const oneWord = (of: string): string =>
  of.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** ⚠️ Name and brand together, because two brands of the same thing are two rows. */
const sameThing = (name: string, brand: string): string =>
  `${oneWord(brand)}|${oneWord(name)}`;

interface Registering {
  readonly name: string;
  readonly brand?: string;
  readonly description?: string;
  readonly unit: string;
  readonly tracking: string;
  readonly whole?: boolean;
  readonly par?: number;
  readonly storage?: string;
  readonly handling?: string;
  readonly shelfDays?: number;
  readonly openDays?: number;
  readonly photo?: string;
  readonly supplier?: string;
  readonly reorder?: boolean;
  readonly reorderQty?: number;
  readonly codes?: unknown;
  readonly tags?: unknown;
  readonly sources?: unknown;
  readonly shots?: unknown;
  readonly anyway?: boolean;
}

interface Registered {
  readonly product: string;
  readonly codes: number;
  readonly tags: number;
  readonly sources: number;
}

/** ⚠️ What the sheet sends per barcode. `pack` is the carton's whole reason. */
interface CodeIn { value: string; kind: string; pack: number }
interface SourceIn { supplier: string; ref: string; leadDays: number | null }

const codesIn = (of: unknown): readonly CodeIn[] =>
  (Array.isArray(of) ? of : [])
    .map((one) => {
      const it = (one ?? {}) as Record<string, unknown>;
      const raw = String(it.value ?? "").trim();
      return {
        /* ⚠️ NORMALISED BEFORE IT IS COMPARED OR STORED. An EAN-13 off a box and
           the `(01)` of the DataMatrix on the same box differ by a leading zero;
           stored as they were typed they are two codes for one product, and the
           duplicate check below cannot see either from the other. */
        value: /^\d{8,14}$/.test(raw) ? asGtin(raw) : raw,
        kind: (CODE_KINDS as readonly string[]).includes(String(it.kind))
          ? String(it.kind) : "other",
        pack: Math.max(1, Math.trunc(Number(it.pack ?? 1)) || 1),
      };
    })
    .filter((one) => one.value.length > 0);

const sourcesIn = (of: unknown): readonly SourceIn[] =>
  (Array.isArray(of) ? of : [])
    .map((one) => {
      const it = (one ?? {}) as Record<string, unknown>;
      const days = Number(it.leadDays);
      return {
        supplier: String(it.supplier ?? "").trim(),
        ref: String(it.ref ?? "").trim().slice(0, 64),
        /* ⚠️ `null` RATHER THAN `0`, because a supplier who has not been asked
           how long they take is not a supplier who delivers the same day. */
        leadDays: Number.isFinite(days) && days >= 0 ? Math.trunc(days) : null,
      };
    })
    .filter((one) => one.supplier.length > 0);

const wordsIn = (of: unknown, most: number, long: number): readonly string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const one of Array.isArray(of) ? of : []) {
    const said = String(one ?? "").trim().slice(0, long);
    if (!said || seen.has(oneWord(said))) continue;
    seen.add(oneWord(said));
    out.push(said);
    if (out.length >= most) break;
  }
  return out;
};

/**
 * THINGS THAT LOOK LIKE THE ONE BEING TYPED, WHILE IT IS STILL BEING TYPED.
 *
 * ⚠️ A CATALOGUE FILLS WITH DUPLICATES ONE AT A TIME, BY PEOPLE BEING CAREFUL.
 * Somebody adds "Blue nitrile gloves" because searching for "gloves nitrile" in
 * a hurry found nothing, and from then on half the stock is under one row and
 * half under the other — every report wrong, and neither row obviously the
 * mistake. The moment to prevent that is while the name is being typed, not in
 * a monthly tidy-up nobody schedules.
 *
 * ⚠️ IT IS A READ, SO IT MAY BE ASKED ON EVERY KEYSTROKE. Refusing the write
 * instead would be a form somebody fills in completely and is then told to throw
 * away — which is how people learn to press "register anyway" without reading.
 */
const resembling = operation<
  { name?: string; brand?: string; code?: string },
  { matches: readonly { id: string; name: string; brand: string; why: string }[] }
>({
  id: "product.resembling",
  kind: "read",
  summary: "Things already here that look like this one",
  input: {
    name: field.text({ label: "Name", holds: "none", max: 200 }),
    brand: field.text({ label: "Brand", holds: "none", max: 120 }),
    code: field.text({ label: "Code", holds: "none", max: 64 }),
  },
  output: { matches: field.json({ label: "Matches", holds: "none" }) },
  permission: "product:read",
  /* ⚠️ A READ ASKED ON EVERY KEYSTROKE REPLAYS NOTHING — there is no write to
     repeat, and keying it would put a cache in front of a question whose whole
     value is that the answer changes as the letters do. */
  idempotency: { mode: "none" },
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;
    const out = new Map<string, { id: string; name: string; brand: string; why: string }>();

    /*
      ⚠️ THE CODE FIRST, BECAUSE IT IS THE ONLY CERTAIN ANSWER. A barcode names
      one product; a name resembles several. Reporting them in one list with the
      certain one buried is how somebody scrolls past the row that settles it.
    */
    const raw = (input.code ?? "").trim();
    if (raw) {
      const value = /^\d{8,14}$/.test(raw) ? asGtin(raw) : raw;
      const owner = await db.prepare(
        `SELECT p.id, p.name, p.brand FROM code c JOIN product p ON p.id = c.product
          WHERE c.tenant_id = ? AND c.value = ? LIMIT 1`)
        .bind(c.tenantId, value).first<{ id: string; name: string; brand: string | null }>();
      if (owner) {
        out.set(owner.id, {
          id: owner.id, name: owner.name, brand: owner.brand ?? "", why: "same code",
        });
      }
    }

    const said = (input.name ?? "").trim();
    /*
      ⚠️ THREE CHARACTERS, BECAUSE ONE MATCHES THE CATALOGUE. A prefix search on
      "b" answers with everything, which reads to the person typing as "you
      already have all of this" — the opposite of the sentence this exists to
      say.
    */
    if (oneWord(said).length >= 3) {
      const key = sameThing(said, input.brand ?? "");
      const like = await db.prepare(
        `SELECT id, name, brand FROM product
          WHERE tenant_id = ? AND unnamed = 0 AND lower(name) LIKE ?
          ORDER BY name LIMIT 6`)
        .bind(c.tenantId, `%${oneWord(said)}%`)
        .all<{ id: string; name: string; brand: string | null }>();
      for (const row of like.results ?? []) {
        if (out.has(row.id)) continue;
        out.set(row.id, {
          id: row.id, name: row.name, brand: row.brand ?? "",
          /* ⚠️ THE TWO ARE DIFFERENT SENTENCES ON THE SCREEN. "The same name and
             brand" is almost certainly the same thing; "a similar name" is a
             prompt to look, and conflating them makes the strong one weak. */
          why: sameThing(row.name, row.brand ?? "") === key ? "same name and brand" : "similar name",
        });
      }
    }

    return { matches: [...out.values()] };
  },
});

/**
 * REGISTERING A PRODUCT — THE WHOLE RECORD, IN ONE WRITE.
 *
 * ⚠️ ONE OPERATION RATHER THAN FIVE, BECAUSE HALF A PRODUCT IS WORSE THAN NONE.
 * A row, its barcodes, its tags and its suppliers arrive from one sheet as one
 * decision; written as four calls the second can fail and leave a product
 * nobody can scan, in a catalogue where the way you find things is scanning
 * them. The person would then be looking at a product that exists, believing
 * the barcode they typed is on it.
 *
 * ⚠️ A TAKEN BARCODE IS REFUSED AND A RESEMBLING NAME IS NOT, and the split is
 * the whole of the duplicate rule. A code names one product — a second owner
 * makes every future scan of that string ambiguous, and the resolver answers
 * with whichever row it read first, wrongly, for ever. A name that looks like
 * another name is a question, and the answer is genuinely sometimes "yes, two
 * brands make this" — so it is reported by `product.resembling` while the sheet
 * is open, and `anyway` is how somebody who looked says so.
 *
 * ⚠️ AND `anyway` DOES NOT WAIVE THE CODE. A person cannot press past a fact.
 */
const register = operation<Registering, Registered>({
  id: "product.register",
  kind: "write",
  summary: "Add a product to the catalogue",
  input: {
    name: field.text({ label: "Name", required: true, holds: "none", max: 200 }),
    brand: field.text({ label: "Brand", holds: "none", max: 120 }),
    description: field.long({ label: "Description", holds: "none", max: 600 }),
    unit: field.text({ label: "Counted in", required: true, holds: "none", max: 24 }),
    tracking: field.enum({
      label: "Tracked as", required: true, holds: "none", values: [...LADDER],
    }),
    whole: field.bool({ label: "Whole units only", holds: "none" }),
    par: field.number({ label: "Tell me below", holds: "none", min: 0 }),
    storage: field.long({ label: "How to store it", holds: "none", max: 2_000 }),
    handling: field.long({ label: "How to handle it", holds: "none", max: 2_000 }),
    /* ⚠️ DURATIONS, NEVER DATES. A printed expiry belongs to the delivery that
       carried it — `batch.made` plus `shelfDays` is what gives one an expiry
       when its box shows only a manufacture date. */
    shelfDays: field.number({ label: "Days from making", holds: "none", min: 0, max: 3_650 }),
    openDays: field.number({ label: "Days once opened", holds: "none", min: 0, max: 3_650 }),
    photo: field.media({ label: "Photo", holds: "none", purpose: "product-photo" }),
    supplier: field.ref({ label: "Order from", holds: "none", to: "supplier" }),
    reorder: field.bool({ label: "Raise a reorder", holds: "none" }),
    reorderQty: field.number({ label: "How many to order", holds: "none", min: 1 }),
    /* ⚠️ FOUR LISTS, SO FOUR `json` FIELDS — a field here is single-valued, and
       each of these is a join collection on the other side of the write. */
    codes: field.json({ label: "Barcodes", holds: "none" }),
    tags: field.json({ label: "Tags", holds: "none" }),
    sources: field.json({ label: "Suppliers", holds: "none" }),
    shots: field.json({ label: "Pictures", holds: "none" }),
    /* ⚠️ "I LOOKED AT WHAT RESEMBLES IT AND THIS IS NOT ONE OF THEM." */
    anyway: field.bool({ label: "Register anyway", holds: "none" }),
  },
  output: {
    product: field.text({ label: "Product", holds: "none" }),
    codes: field.number({ label: "Barcodes", holds: "none" }),
    tags: field.number({ label: "Tags", holds: "none" }),
    sources: field.number({ label: "Suppliers", holds: "none" }),
  },
  permission: "product:write",
  /* ⚠️ KEYED, BECAUSE A DOUBLE TAP ON A PHONE WITH A SLOW CONNECTION IS THE
     ordinary way this gets pressed twice — and the second one would land as a
     second product with the same name and none of the barcodes. */
  idempotency: { mode: "key" },
  emits: ["product.created"],
  outcome: {
    message: "Added.", tone: "success",
    invalidates: ["product.list", "tag.list", "code.list"],
  },
  fails: ["platform.invalid", "platform.not_found", "inventory.taken", "inventory.resembles"],
  audit: (input) => ({ subject: input.name, verb: "registered" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;

    const name = (input.name ?? "").trim();
    if (!name) return c.fail("platform.invalid", {}, { fields: { name: "Give it a name" } });
    const unit = (input.unit ?? "").trim();
    if (!unit) {
      return c.fail("platform.invalid", {}, { fields: { unit: "Say what it is counted in" } });
    }
    if (!(LADDER as readonly string[]).includes(input.tracking)) {
      return c.fail("platform.invalid", {}, { fields: { tracking: "Choose how it is tracked" } });
    }

    const brand = (input.brand ?? "").trim();
    const codes = codesIn(input.codes);
    const sources = sourcesIn(input.sources);
    const tags = wordsIn(input.tags, 12, 60);

    /*
      ⚠️ EVERY CODE IS CHECKED BEFORE ANY ROW IS WRITTEN. Checking as it inserts
      would leave a product half-registered behind a refusal about its third
      barcode — a row the person did not ask for, named after a thing they were
      told was not created.

      ⚠️ READ THEN WRITE, RATHER THAN `ON CONFLICT`. `code` is a declared
      collection and the generated DDL carries no unique index on
      `(tenant_id, value)`, so an upsert naming one is not a stricter write —
      it is `SQLITE_ERROR` at run time and a 503 on the whole door.
    */
    for (const one of codes) {
      const taken = await db.prepare(
        `SELECT p.name FROM code c JOIN product p ON p.id = c.product
          WHERE c.tenant_id = ? AND c.value = ? LIMIT 1`)
        .bind(c.tenantId, one.value).first<{ name: string }>();
      if (taken) return c.fail("inventory.taken", { code: one.value, name: taken.name });
    }

    /*
      ⚠️ THE PREFERRED SUPPLIER MUST BE ONE THE PRODUCT IS SOURCED FROM. An order
      addressed to somebody the catalogue does not say sells it is an order
      nobody can explain — and the two fields arrive independently, so nothing
      but this makes them agree. The sheet already keeps them in step; a queued
      write, an agent or a second tab never saw the sheet.
    */
    if (input.supplier && !sources.some((one) => one.supplier === input.supplier)) {
      return c.fail("platform.invalid", {},
        { fields: { supplier: "Order from somebody the product is sourced from" } });
    }

    /*
      ⚠️ THE BACKSTOP, NOT THE MECHANISM. `product.resembling` is what the sheet
      shows while somebody types; this catches the case where nothing was shown
      — an offline queue replaying, an agent, a second tab — and it refuses only
      on the certain half of that check, the same name AND the same brand.
    */
    if (!input.anyway) {
      const key = sameThing(name, brand);
      const like = await db.prepare(
        `SELECT id, name, brand FROM product
          WHERE tenant_id = ? AND unnamed = 0 AND lower(name) = ?`)
        .bind(c.tenantId, name.toLowerCase())
        .all<{ id: string; name: string; brand: string | null }>();
      const already = (like.results ?? []).find(
        (row) => sameThing(row.name, row.brand ?? "") === key);
      if (already) return c.fail("inventory.resembles", { name: already.name, id: already.id });
    }

    const product = newId("prd", new Date(c.now));
    await db.prepare(
      `INSERT INTO product (id, tenant_id, name, brand, description, tracking, unit, whole,
                            par, storage, handling, shelfDays, openDays, photo, supplier,
                            reorder, reorderQty, unnamed, at, by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`)
      .bind(product, c.tenantId, name, brand || null, (input.description ?? "").trim() || null,
        input.tracking, unit, input.whole ? 1 : 0,
        Number.isFinite(Number(input.par)) ? Number(input.par) : null,
        (input.storage ?? "").trim() || null, (input.handling ?? "").trim() || null,
        /* ⚠️ ABSENT IS NULL, NOT NOUGHT. "Nobody said how long it keeps" and "it
           does not expire" are opposite facts, and a zero prints the second over
           the first — which takes a real shelf life off the expiry sweep. */
        Number(input.shelfDays) > 0 ? Number(input.shelfDays) : null,
        Number(input.openDays) > 0 ? Number(input.openDays) : null,
        input.photo ?? null, input.supplier ?? null,
        input.reorder ? 1 : 0,
        Number.isFinite(Number(input.reorderQty)) ? Number(input.reorderQty) : null,
        c.now, c.accountId ?? null).run();

    for (const one of codes) {
      await db.prepare(
        `INSERT INTO code (id, tenant_id, value, product, kind, pack, source, at, by)
          VALUES (?, ?, ?, ?, ?, ?, 'typed', ?, ?)`)
        .bind(newId("code", new Date(c.now)), c.tenantId, one.value, product, one.kind,
          one.pack, c.now, c.accountId ?? null).run();
    }

    /*
      ⚠️ A TAG IS MATCHED BEFORE IT IS MINTED, WHICH IS THE WHOLE POINT OF THE
      TABLE. "Cleaning" typed today and "cleaning" typed in March are one word;
      minting the second makes the catalogue unfilterable by the thing it was
      filed under, one morning at a time.
    */
    for (const word of tags) {
      const held = await db.prepare(
        `SELECT id FROM tag WHERE tenant_id = ? AND lower(name) = ? LIMIT 1`)
        .bind(c.tenantId, word.toLowerCase()).first<{ id: string }>();
      const tagId = held?.id ?? newId("tag", new Date(c.now));
      if (!held) {
        await db.prepare(
          `INSERT INTO tag (id, tenant_id, name, source, at, by) VALUES (?, ?, ?, 'typed', ?, ?)`)
          .bind(tagId, c.tenantId, word, c.now, c.accountId ?? null).run();
      }
      await db.prepare(
        `INSERT INTO tagging (id, tenant_id, product, tag, at, by) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(newId("tgg", new Date(c.now)), c.tenantId, product, tagId, c.now,
          c.accountId ?? null).run();
    }

    for (const one of sources) {
      await db.prepare(
        `INSERT INTO sourcing (id, tenant_id, product, supplier, ref, leadDays, at, by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(newId("src", new Date(c.now)), c.tenantId, product, one.supplier,
          one.ref || null, one.leadDays, c.now, c.accountId ?? null).run();
    }

    /*
      ⚠️ THE GALLERY, AND `made` IS 0 ON EVERY ROW THIS WRITES. Everything here
      is a photograph somebody took — see `shot`'s own header, and the deferral
      on the column: nothing in this deployment can make one yet, and a row
      claiming otherwise would be a lie in the one place the distinction
      matters.
    */
    const shots = wordsIn(input.shots, SEEN_MOST, 64);
    let ord = 0;
    for (const image of shots) {
      await db.prepare(
        `INSERT INTO shot (id, tenant_id, product, image, made, ord, at, by)
          VALUES (?, ?, ?, ?, 0, ?, ?, ?)`)
        .bind(newId("sht", new Date(c.now)), c.tenantId, product, image, ord++, c.now,
          c.accountId ?? null).run();
    }

    return { product, codes: codes.length, tags: tags.length, sources: sources.length };
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
              b.opened AS opened, b.made AS made,
              p.name AS name, p.openDays AS openDays, p.shelfDays AS shelfDays
         FROM batch b JOIN product p ON p.id = b.product
        WHERE b.tenant_id = ?${input.product ? " AND b.product = ?" : ""}`)
      .bind(...(input.product ? [c.tenantId, input.product] : [c.tenantId]))
      .all<{ id: string; product: string; lot: string | null; printed: string | null;
        opened: string | null; made: string | null; name: string;
        openDays: number | null; shelfDays: number | null }>();

    const items: Due[] = [];
    for (const row of rows.results) {
      const ends = effectiveExpiry({
        printed: row.printed,
        /* ⚠️ THE DAYS ARE THE PRODUCT'S, NOT THE DELIVERY'S — both of them.
           "Use within 28 days of opening" and "24 months from manufacture" are
           facts about the substance; putting either on the batch would let two
           deliveries of one thing disagree about it. */
        made: row.made && row.shelfDays ? { on: row.made, days: row.shelfDays } : null,
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
 * RECEIVING SOMETHING — the whole gesture, whatever we already know about it.
 *
 * ⚠️ ONE OPERATION RATHER THAN THREE CALLS, and the reason is what happens when
 * the second one fails. Putting an unknown delivery away is: make a product,
 * attach its code, open a batch, move the balance — and a client doing that in
 * sequence on a warehouse phone leaves a nameless product with no code the first
 * time the signal drops. One write also means ONE queued item offline, which is
 * the difference between replaying a delivery and replaying a third of one.
 *
 * ⚠️ TAKE IT NOW, NAME IT LATER. An unknown code is received against a row named
 * after itself and marked `unnamed`; the worst outcome in this product is
 * somebody not recording something because a form demanded a field they did not
 * have. Whoever looks after the catalogue names it afterwards, and until then
 * the thing is on the shelf and in the system.
 *
 * ⚠️ AND THE PACK LEVEL IS APPLIED HERE RATHER THAN BY THE SCREEN. "Scan a
 * carton, add ten" is the commonest wrong number in inventory work, and the code
 * on the box already knew — a screen multiplying it would be one of the two
 * surfaces that scan each doing its own arithmetic.
 */
interface Arriving {
  raw: string; location: string; quantity: number; day: string; year: number;
  capture?: string; lot?: string; expiry?: string;
}

/** ⚠️ How many labelled objects one scan may mint — see the refusal below. */
const MOST_AT_ONCE = 100;

const arrive = operation<
  Arriving, { id: string; quantity: number; movement: string; product: string }
>({
  id: "stock.arrive",
  kind: "write",
  summary: "Put something on a shelf, known or not",
  input: {
    raw: field.text({ label: "Code", required: true, holds: "none", max: 256 }),
    location: field.text({ label: "Where", required: true, holds: "none" }),
    /* ⚠️ IN THE UNIT THE CODE IMPLIES — one carton is one here, and the pack
       level turns it into ten. A caller sending the multiplied number would
       double it. */
    quantity: field.number({ label: "How many", required: true, holds: "none" }),
    day: field.day({ label: "On", required: true, holds: "none" }),
    year: field.number({ label: "This year", required: true, holds: "none" }),
    capture: field.text({ label: "Recorded by", holds: "none" }),
    lot: field.text({ label: "Lot", holds: "none" }),
    expiry: field.day({ label: "Expires", holds: "none" }),
  },
  output: {
    ...moveOutput,
    product: field.text({ label: "Product", holds: "none" }),
  },
  permission: "stock:move",
  idempotency: { mode: "key" },
  emits: ["stock.received", "product.created"],
  outcome: { message: "Received.", tone: "success", invalidates: ["stock.list", "ledger.list"] },
  fails: ["inventory.unreadable", "inventory.short", "inventory.moved", "platform.not_found"],
  audit: (input) => ({ subject: input.raw, verb: "received" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;
    /* ⚠️ BEFORE ANYTHING IS WRITTEN, and `stockMove`'s own check at the end is
       not enough: an itemised delivery mints its rows first, so a refusal there
       would leave forty labelled objects on a shelf the person cannot see. */
    mine(c, input.location);
    const of = readScan(input.raw, yearIn(input.year));
    if (unread(of)) {
      return c.fail("inventory.unreadable", {}, { fields: { raw: WHY[of.why] } });
    }
    /* ⚠️ A SHELF LABEL IS NOT A THING TO RECEIVE. It moves the session, and a
       screen that sent one here is a screen with a bug — refused rather than
       filed as a product called `ONE-L-4K2P`. A product's OWN label is a
       product, and receiving against it is the whole reason it is printed. */
    if (of.ours && of.ours !== "product") {
      return c.fail("inventory.unreadable", {}, { fields: { raw: notAThing(of.ours) } });
    }

    const known = await db.prepare(
      `SELECT c.product AS product, c.pack AS pack, p.tracking AS tracking
         FROM code c JOIN product p ON p.id = c.product
        WHERE c.tenant_id = ? AND c.value = ?`)
      .bind(c.tenantId, of.value)
      .first<{ product: string; pack: number | null; tracking: string }>();

    let product = known?.product ?? "";
    let tracking = known?.tracking ?? "";
    const pack = Math.max(1, known?.pack ?? 1);

    if (!product) {
      /* ⚠️ THE WORKSPACE'S OWN DEFAULTS, NOT THIS FILE'S. What a new product
         starts as is a setting somebody chose; a `??` here would be a second
         answer, and it would MASK the platform failing to apply theirs. */
      tracking = String(await c.setting("inventory.default_tracking"));
      const unit = String(await c.setting("inventory.default_unit"));
      product = `prd_${c.tenantId}_${of.value}`;
      await db.prepare(
        `INSERT INTO product (id, tenant_id, name, tracking, unit, unnamed, at, by)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?)
          ON CONFLICT (id) DO NOTHING`)
        .bind(product, c.tenantId, of.value, tracking, unit, c.now, c.accountId ?? null)
        .run();
      await db.prepare(
        `INSERT INTO code (id, tenant_id, product, value, kind, pack, source, at, by)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
          ON CONFLICT (id) DO NOTHING`)
        .bind(`cod_${c.tenantId}_${of.value}`, c.tenantId, product, of.value, of.kind,
          input.capture ?? "scanned", c.now, c.accountId ?? null)
        .run();
    }

    /*
      ⚠️ THE BATCH IS FOUND OR MADE, AND ONLY WHERE THE PRODUCT EARNS ONE. Two
      deliveries with the same lot ARE the same delivery — a second row would
      split one lot's balance in two and give a recall two answers.
    */
    let batch: string | undefined;
    const lot = (input.lot ?? of.lot ?? "").trim();
    const printed = input.expiry ?? of.expiry ?? "";
    if (tracking === "batched" && (lot || printed)) {
      batch = `bat_${product}_${lot || printed}`;
      await db.prepare(
        `INSERT INTO batch (id, tenant_id, product, lot, printed, received, at, by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (id) DO NOTHING`)
        .bind(batch, c.tenantId, product, lot || null, printed || null, input.day,
          c.now, c.accountId ?? null)
        .run();
    }

    const total = Math.abs(input.quantity) * pack;

    /*
      ⚠️ AN ITEMISED DELIVERY BECOMES ONE ROW PER OBJECT, LABELLED, HERE. It is
      the moment identity is created and there is no second chance at it: a
      workspace that received forty drills as a number and wants them itemised
      afterwards has forty objects with no history and no way to tell them apart.

      ⚠️ AND THE LABEL IS MINTED WITH THE ROW. "If we made it, we label it" —
      ours is the only code that names THIS object rather than its type, which is
      what makes a second scan during a count detectably the same thing.
    */
    if (tracking === "itemised") {
      /* ⚠️ REFUSED RATHER THAN CAPPED. A hundred labelled objects from one scan
         is already a big delivery; a thousand is a typed quantity with a zero
         too many, and silently minting them leaves a workspace to delete them
         one at a time. */
      if (total > MOST_AT_ONCE) {
        return c.fail("platform.invalid", {}, {
          fields: { quantity: `Receive up to ${MOST_AT_ONCE} at a time` },
        });
      }
      for (let made = 0; made < total; made++) {
        const id = newId("unt", new Date(c.now));
        await db.prepare(
          `INSERT INTO unit
            (id, tenant_id, product, location, batch, code, life, acquired, services, at, by)
            VALUES (?, ?, ?, ?, ?, ?, 'held', ?, 0, ?, ?)`)
          .bind(id, c.tenantId, product, input.location, batch ?? null, ourLabel("U", id),
            input.day, c.now, c.accountId ?? null).run();
      }
    }

    const done = await stockMove(c, "received", {
      product,
      location: input.location,
      ...(batch ? { batch } : {}),
      quantity: total,
      day: input.day,
      capture: input.capture ?? "scanned",
    });
    return { ...done, product };
  },
});

/**
 * UNDOING THE LAST THING YOU DID, WITHOUT ASKING ANYBODY.
 *
 * ⚠️ THE WORST OUTCOME IN THIS PRODUCT IS SOMEBODY NOT RECORDING SOMETHING, and
 * a person who cannot take back a mis-scan is a person who stops scanning. Undo
 * is what makes recording feel free — so it is here rather than behind a
 * manager, and it is `stock:move` rather than `stock:adjust`.
 *
 * ⚠️ AND IT IS A MOVEMENT, NEVER A DELETION. The wrong number stays visible with
 * what cancelled it beside it, which is the difference between an inventory
 * somebody can audit and one they can only believe.
 *
 * ⚠️ THREE CONDITIONS, AND EACH IS THE LINE BETWEEN A SLIP AND A REVISION.
 * Yours, because undoing somebody else's work without telling them is not an
 * undo. The LAST one on that line, because anything since means the number
 * people are working from has moved on. And recent, because a receipt from
 * yesterday morning can still be the last movement on a shelf nobody touches —
 * and taking that back a day later is a revision, which is what a correction
 * with a reason on it is for.
 */
const UNDO_MINUTES = 60;

const undo = operation<{ movement: string; day: string }, Moved>({
  id: "stock.undo",
  kind: "write",
  summary: "Take back the last thing you recorded",
  input: {
    movement: field.text({ label: "Movement", required: true, holds: "none" }),
    day: field.day({ label: "On", required: true, holds: "none" }),
  },
  output: moveOutput,
  permission: "stock:move",
  idempotency: { mode: "key" },
  emits: ["stock.undone"],
  outcome: { message: "Taken back.", tone: "success", invalidates: ["stock.list", "ledger.list"] },
  fails: ["platform.not_found", "inventory.late", "inventory.short", "inventory.moved"],
  audit: (input) => ({ subject: input.movement, verb: "took back" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;

    /* ⚠️ THE LEDGER READS HERE ARE NOT NARROWED, and the two conditions below
       are why: an undo has to be YOUR OWN movement and the last one on that
       line, so a narrowed member cannot reach somebody else's work at another
       site by guessing an id. What they can reach — their own movement on a
       shelf they have since been taken off — is refused by `stockMove`, with
       the sentence that names the place rather than the record. */
    const of = await db.prepare(
      `SELECT move, product, location, batch, delta, at, by FROM ledger
        WHERE id = ? AND tenant_id = ?`)
      .bind(input.movement, c.tenantId)
      .first<{ move: string; product: string; location: string; batch: string | null;
        delta: number; at: string; by: string | null }>();
    if (!of) return c.fail("platform.not_found");

    /* ⚠️ AN UNDO IS NOT ITSELF UNDOABLE. Two of them facing each other is a
       balance that oscillates and a history nobody can read. */
    if (of.move === "undone") return c.fail("inventory.late");
    if (!c.accountId || of.by !== c.accountId) return c.fail("inventory.late");

    const age = (Date.parse(c.now) - Date.parse(of.at)) / 60_000;
    if (!Number.isFinite(age) || age > UNDO_MINUTES) return c.fail("inventory.late");

    /* ⚠️ THE LAST ONE ON THIS LINE. Asked as "is there anything newer" rather
       than by comparing a balance: two movements that cancel out would leave the
       number where it started, and undoing into that silently discards
       somebody's work. */
    const since = await db.prepare(
      `SELECT id FROM ledger
        WHERE tenant_id = ? AND product = ? AND location = ? AND batch IS ? AND at > ?
        LIMIT 1`)
      .bind(c.tenantId, of.product, of.location, of.batch ?? null, of.at)
      .first<{ id: string }>();
    if (since) return c.fail("inventory.late");

    return stockMove(c, "undone", {
      product: of.product,
      location: of.location,
      ...(of.batch ? { batch: of.batch } : {}),
      /* ⚠️ THE EXACT OPPOSITE OF WHAT IT CANCELS, taken from the row rather than
         recomputed. A quantity worked out again from the same inputs is a second
         chance to get it wrong. */
      quantity: -of.delta,
      day: input.day,
      capture: "typed",
      /* ⚠️ NAMING WHAT IT CANCELS IS WHAT MAKES IT ONE-SHOT — the check above
         reads this column, so a second undo of the same movement finds itself. */
      against: input.movement,
    });
  },
});

/* --------------------------------------------------------------- counting --- */

/**
 * OPENING A SHELF FOR COUNTING.
 *
 * ⚠️ TWO SESSIONS ON ONE SHELF IS DOUBLE COUNTING, so the second is REFUSED and
 * told who has it. That is not a technicality: the whole design prevents double
 * counting by scope rather than by identity, and two open scopes over one shelf
 * removes the only thing holding it up.
 */
const openCount = operation<
  { location: string; blind?: boolean; day: string }, { id: string }
>({
  id: "count.open",
  kind: "write",
  summary: "Start counting a shelf",
  input: {
    location: field.text({ label: "Where", required: true, holds: "none" }),
    blind: field.bool({ label: "Blind", holds: "none" }),
    day: field.day({ label: "On", required: true, holds: "none" }),
  },
  output: { id: field.text({ label: "Count", holds: "none" }) },
  permission: "stock:move",
  idempotency: { mode: "key" },
  emits: ["count.opened"],
  outcome: { message: "Counting.", tone: "success", invalidates: ["count.list"] },
  fails: ["platform.not_found", "inventory.counting"],
  audit: (input) => ({ subject: input.location, verb: "started counting" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;

    const where = await db.prepare(
      `SELECT id FROM location WHERE id = ? AND tenant_id = ?`)
      .bind(input.location, c.tenantId).first<{ id: string }>();
    if (!where) return c.fail("platform.not_found");
    /* ⚠️ AFTER "does it exist" AND BEFORE ANYTHING ELSE. Opening a count on
       another site's aisle would lock it for the person who actually works
       there, which is the refusal that reads as a bug rather than as a rule. */
    mine(c, input.location);

    const busy = await db.prepare(
      `SELECT id, at FROM count
        WHERE tenant_id = ? AND location = ? AND closed IS NULL LIMIT 1`)
      .bind(c.tenantId, input.location).first<{ id: string; at: string }>();
    /* ⚠️ THE REFUSAL CARRIES WHEN, because "somebody is counting this" is
       actionable and "somebody was counting this three weeks ago" is a session
       to close. The person is not named here — the audit row has that, and a
       refusal that printed an account id would be showing somebody the code. */
    if (busy) return c.fail("inventory.counting", { since: busy.at });

    const id = `cnt_${c.now}_${input.location}`;
    await db.prepare(
      `INSERT INTO count (id, tenant_id, location, blind, day, at, by)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, c.tenantId, input.location, input.blind ? 1 : 0, input.day,
        c.now, c.accountId ?? null).run();
    return { id };
  },
});

/**
 * ONE MORE OF SOMETHING, ON THE SHELF BEING COUNTED.
 *
 * ⚠️ IT ADDS RATHER THAN SETS. The same code thirty times is thirty items —
 * that is the entire counting gesture, and a call that replaced the running
 * total would record one of them.
 *
 * ⚠️ AND IT WRITES NOTHING TO THE BALANCE. A tally is what somebody has scanned
 * so far; the shelf still holds whatever the ledger says until the session
 * closes. Anything else makes a half-finished count visible to everybody as
 * fact.
 */
/**
 * COUNTING ONE NAMED OBJECT.
 *
 * ⚠️ THE ROW IS KEYED ON THE OBJECT, WHICH IS THE WHOLE MECHANISM. A tally of an
 * itemised product is one row per item rather than a running total, so a second
 * scan of the same label inserts nothing and the operation can say "you have
 * already counted that one" — the app's only true statement about sameness.
 * Settling sums the rows per product and per lot, so nothing downstream changes.
 *
 * ⚠️ AND AN OBJECT RECORDED AS OUT IS REFUSED RATHER THAN COUNTED. It is in the
 * counter's hand and the system says somebody else has it: that is a real
 * disagreement worth stopping for, and the fix — take it back — is one press.
 * Counting it silently would put the balance and the object's own record into
 * permanent contradiction.
 */
async function tallyItem(
  c: Ctx, session: string, code: string,
): Promise<{ product: string; quantity: number }> {
  const db = c.db as Db;
  /* ⚠️ NARROWED, LIKE `itemIn`. A count session is already on a shelf the
     caller reaches; scanning an object from another site into it would file a
     tally against a rack they cannot see. */
  const near = only(c, "location");
  const of = await db.prepare(
    `SELECT id, product, batch, life FROM unit
      WHERE tenant_id = ? AND code = ?${near.sql}`)
    .bind(c.tenantId, code, ...near.bound)
    .first<{ id: string; product: string; batch: string | null; life: Life }>();
  if (!of) return c.fail("platform.not_found");
  if (of.life !== "held") {
    return c.fail("inventory.wrongLife", {
      why: of.life === "retired"
        ? "This one was retired"
        : "It is recorded as out with somebody",
    });
  }

  const id = `tly_${session}_${of.id}`;
  const done = await db.prepare(
    `INSERT INTO tally (id, tenant_id, count, product, batch, unit, quantity, at, by)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT (id) DO NOTHING`)
    .bind(id, c.tenantId, session, of.product, of.batch, of.id, c.now,
      c.accountId ?? null).run();
  if (!done.meta?.changes) return c.fail("inventory.already");

  const now = await db.prepare(
    `SELECT COALESCE(SUM(quantity), 0) AS n FROM tally
      WHERE tenant_id = ? AND count = ? AND product = ?`)
    .bind(c.tenantId, session, of.product).first<{ n: number }>();

  return { product: of.product, quantity: now?.n ?? 1 };
}

const tallyUp = operation<
  { count: string; raw: string; year: number; quantity?: number },
  { product: string; quantity: number }
>({
  id: "count.tally",
  kind: "write",
  summary: "Record one more of something",
  input: {
    count: field.text({ label: "Count", required: true, holds: "none" }),
    raw: field.text({ label: "Code", required: true, holds: "none", max: 256 }),
    year: field.number({ label: "This year", required: true, holds: "none" }),
    quantity: field.number({ label: "How many", holds: "none" }),
  },
  output: {
    product: field.text({ label: "Product", holds: "none" }),
    quantity: field.number({ label: "Counted so far", holds: "none" }),
  },
  permission: "stock:move",
  idempotency: { mode: "key" },
  /* ⚠️ PRESSED ONCE PER ITEM ON A SHELF, WHICH IS FORTY TIMES A MINUTE. The
     number on the screen going up is the confirmation; a toast per scan
     would be the whole session behind a stack of them. */
  outcome: { why: "the tally on the screen is the confirmation, and this is pressed per item" },
  emits: ["count.tallied"],
  fails: [
    "platform.not_found", "inventory.unreadable", "inventory.closed",
    "inventory.needsLot", "inventory.already", "inventory.wrongLife",
  ],
  audit: (input) => ({ subject: input.count, verb: "counted" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;

    const session = await db.prepare(
      /* ⚠️ NARROWED HERE, WHICH IS WHERE A SESSION ID FIRST BECOMES A SHELF. A
         narrowed member handed another site's session id would otherwise be
         counting a rack they cannot see, and every tally they wrote would land
         on it. */
      `SELECT closed FROM count WHERE id = ? AND tenant_id = ?${only(c).sql}`)
      .bind(input.count, c.tenantId, ...only(c).bound).first<{ closed: string | null }>();
    if (!session) return c.fail("platform.not_found");
    /* ⚠️ A CLOSED SESSION IS REFUSED RATHER THAN REOPENED. Its differences have
       already become corrections in the history; adding to it afterwards would
       make those corrections describe a count that no longer exists. */
    if (session.closed) return c.fail("inventory.closed");

    const of = readScan(input.raw, yearIn(input.year));
    if (unread(of)) {
      return c.fail("inventory.unreadable", {}, { fields: { raw: WHY[of.why] } });
    }

    /*
      ⚠️ ONE OF OUR OWN LABELS ON AN OBJECT IS THE ONE CODE THAT CANNOT BE
      COUNTED TWICE, and it is the only real uniqueness in the whole product.
      Every other code names a TYPE — one glove box's barcode is every glove
      box's — so the same code thirty times is thirty items and must be. Ours
      names THIS object, so the same label twice is a mistake the app can see.
    */
    if (of.ours === "unit") return tallyItem(c, input.count, of.value);
    /* ⚠️ A PRODUCT'S OWN LABEL IS A PRODUCT, AND THAT IS WHY IT IS PRINTED. Most
       of what a workshop or a kitchen holds has no barcode at all; refusing ours
       here made `product.label` a sticker the counting flow could not read, so
       the one gesture the product is fastest at was unavailable for exactly the
       things that need it most. It resolves through the code book like every
       other code, below. */
    if (of.ours && of.ours !== "product") {
      return c.fail("inventory.unreadable", {}, { fields: { raw: notAThing(of.ours) } });
    }

    const known = await db.prepare(
      `SELECT c.product AS product, c.pack AS pack, p.tracking AS tracking
         FROM code c JOIN product p ON p.id = c.product
        WHERE c.tenant_id = ? AND c.value = ?`)
      .bind(c.tenantId, of.value)
      .first<{ product: string; pack: number | null; tracking: string }>();
    /* ⚠️ AN UNKNOWN CODE IS REFUSED HERE, AND ONLY HERE. Receiving invents a
       product because the thing is physically arriving; a COUNT that invented
       one would put a phantom on a shelf and then correct the balance to match
       it. What somebody does with an unknown code mid-count is put it aside. */
    if (!known) return c.fail("platform.not_found");

    /*
      ⚠️ A BATCHED PRODUCT IS COUNTED PER DELIVERY OR NOT AT ALL. The shelf holds
      it as one row per lot, so a tally against the product alone would compare a
      single number against two — and the close would report BOTH lots as wrong
      and the product as newly appeared. Refusing is the only honest answer: the
      lot is printed on the box the person is holding.
    */
    let batch: string | null = null;
    if (known.tracking === "batched") {
      if (!of.lot) return c.fail("inventory.needsLot");
      const found = await db.prepare(
        `SELECT id FROM batch WHERE tenant_id = ? AND product = ? AND lot = ?`)
        .bind(c.tenantId, known.product, of.lot).first<{ id: string }>();
      /* ⚠️ A LOT NOBODY RECEIVED IS NOT INVENTED EITHER — same reason. It is on
         the shelf and not in the system, which is a receipt somebody missed. */
      if (!found) return c.fail("platform.not_found");
      batch = found.id;
    }

    const many = Math.abs(input.quantity ?? 1) * Math.max(1, known.pack ?? 1);
    const id = `tly_${input.count}_${known.product}_${batch ?? ""}`;

    /* ⚠️ ONE STATEMENT, ADDING. A read then a write is a race two people
       counting the same aisle would both win, and the symptom is a tally quietly
       short by one person's work. */
    await db.prepare(
      `INSERT INTO tally (id, tenant_id, count, product, batch, quantity, at, by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET quantity = quantity + ?, edited_at = ?`)
      .bind(id, c.tenantId, input.count, known.product, batch, many, c.now,
        c.accountId ?? null, many, c.now).run();

    const now = await db.prepare(
      `SELECT quantity FROM tally WHERE id = ? AND tenant_id = ?`)
      .bind(id, c.tenantId).first<{ quantity: number }>();

    return { product: known.product, quantity: now?.quantity ?? many };
  },
});

/**
 * WHAT CLOSING THIS COUNT WOULD CHANGE — read before it is done.
 *
 * ⚠️ THE SAME FUNCTION ANSWERS THE PREVIEW AND PERFORMS THE CLOSE, which is what
 * makes the preview trustworthy. Two implementations of "what will this do" is
 * how a screen comes to promise what a handler does not deliver.
 */
async function differences(c: Ctx, session: string, location: string) {
  /* ⚠️ NOT NARROWED, because the shelf is the argument: every caller reads the
     session first, through a statement that IS narrowed, and hands its location
     in. Filtering again here would be asking the same question twice and
     answering it from a set the caller cannot influence. */
  const db = c.db as Db;
  const found = await db.prepare(
    `SELECT product, batch, quantity FROM tally WHERE tenant_id = ? AND count = ?`)
    .bind(c.tenantId, session)
    .all<{ product: string; batch: string | null; quantity: number }>();
  const held = await db.prepare(
    `SELECT product, batch, quantity FROM stock WHERE tenant_id = ? AND location = ?`)
    .bind(c.tenantId, location)
    .all<{ product: string; batch: string | null; quantity: number }>();

  const as = (rows: { product: string; batch: string | null; quantity: number }[]) =>
    rows.map((r) => ({ product: r.product, batch: r.batch ?? "", quantity: r.quantity }));

  return settleCount(as(found.results), as(held.results));
}

const differs = operation<{ count: string }, { items: readonly Change[] }>({
  id: "count.differences",
  kind: "read",
  summary: "What closing this count would change",
  input: { count: field.text({ label: "Count", required: true, holds: "none" }) },
  output: { items: field.json({ label: "Differences", holds: "none" }) },
  permission: "stock:read",
  idempotency: { mode: "none" },
  fails: ["platform.not_found"],
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;
    const session = await db.prepare(
      `SELECT location FROM count WHERE id = ? AND tenant_id = ?${only(c).sql}`)
      .bind(input.count, c.tenantId, ...only(c).bound).first<{ location: string }>();
    if (!session) return c.fail("platform.not_found");
    return { items: await differences(c, input.count, session.location) };
  },
});

/**
 * CLOSING THE SHELF.
 *
 * ⚠️ A COUNT NEVER SILENTLY OVERWRITES. Every disagreement becomes a CORRECTION
 * in the history naming the session that caused it — so the line reads "we
 * thought 40 · counted 37 · corrected −3 on 21 August, count #14, by Ana", which
 * is the difference between an inventory somebody can audit and one they can
 * only believe.
 *
 * ⚠️ AND EVERYTHING THE COUNT DID NOT FIND GOES TO ZERO. That is what counting
 * IS, and it is why closing is explicit and why the differences are readable
 * first: a session somebody abandoned half way through empties the rest of the
 * rack, and nothing but a person looking can tell the two apart.
 */
const closeCount = operation<
  { count: string; day: string }, { changed: number }
>({
  id: "count.close",
  kind: "write",
  summary: "Close the shelf and correct what disagrees",
  input: {
    count: field.text({ label: "Count", required: true, holds: "none" }),
    day: field.day({ label: "On", required: true, holds: "none" }),
  },
  output: { changed: field.number({ label: "Lines corrected", holds: "none" }) },
  /* ⚠️ `stock:adjust`, NOT `stock:move`. Closing a count writes corrections, and
     the whole reason those are a separate grant is that somebody who takes
     things all day must never be able to make a number agree with what they
     took. Counting is open to everybody; SETTLING it is not. */
  permission: "stock:adjust",
  idempotency: { mode: "key" },
  emits: ["count.closed", "stock.adjusted"],
  outcome: { message: "Counted.", tone: "success", invalidates: ["stock.list", "count.list"] },
  fails: ["platform.not_found", "inventory.closed", "inventory.short", "inventory.moved"],
  audit: (input) => ({ subject: input.count, verb: "closed the count on" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;

    const session = await db.prepare(
      `SELECT location, closed FROM count WHERE id = ? AND tenant_id = ?${only(c).sql}`)
      .bind(input.count, c.tenantId, ...only(c).bound)
      .first<{ location: string; closed: string | null }>();
    if (!session) return c.fail("platform.not_found");
    if (session.closed) return c.fail("inventory.closed");

    const changes = await differences(c, input.count, session.location);
    for (const change of changes) {
      /* ⚠️ THROUGH THE ONE FUNCTION THAT MOVES A BALANCE, like every other write
         in this app. A close that wrote `stock` itself would be a second place
         the number can change, and the ledger would stop being the whole story. */
      await stockMove(c, "adjusted", {
        product: change.product,
        location: session.location,
        ...(change.batch ? { batch: change.batch } : {}),
        quantity: change.delta,
        day: input.day,
        capture: "scanned",
        /* ⚠️ THE REASON IS THE SESSION, and it is why `adjusted` demands one:
           an unexplained correction is the number changing by itself. */
        reason: `Counted ${change.found}, was ${change.was}`,
        against: input.count,
      });
    }

    /* ⚠️ CLOSED LAST. A session marked closed before its corrections land is one
       whose differences can never be applied and can never be read again. */
    await db.prepare(
      `UPDATE count SET closed = ?, edited_at = ?, edited_by = ?
        WHERE id = ? AND tenant_id = ? AND closed IS NULL`)
      .bind(c.now, c.now, c.accountId ?? null, input.count, c.tenantId).run();

    return { changed: changes.length };
  },
});

/* ------------------------------------------------------------------ items --- */

/**
 * OUR OWN LABEL FOR ONE OF OUR OWN THINGS.
 *
 * ⚠️ IT IS DERIVED FROM THE ROW'S ID, WHICH IS WHAT MAKES IT UNIQUE WITHOUT A
 * LOOKUP. A minted label is the identity of a physical object for the rest of
 * that object's life, so two of them naming one row — or one naming two — is a
 * history that cannot be untangled afterwards. A hash would be shorter and would
 * collide; the id is already unique, and uppercasing it is injective.
 */
/**
 * ⚠️ WHAT A SCAN WAS, WHEN IT WAS NOT A THING — and it names WHICH, because
 * "that did not read" over a label that read perfectly is the most confusing
 * sentence this product can say. Somebody is holding a sticker; the answer is
 * what the sticker is for.
 */
const NOT_A_THING: Readonly<Record<string, string>> = {
  location: "That is a place, not a thing",
  batch: "That is a delivery — scan what is in it",
  kit: "That is a kit, not a thing",
  unit: "That is one object, not a quantity",
  product: "",
};

/* ⚠️ A LOOKUP WITH A FALLBACK, because a sentence that renders as `undefined`
   under a scan box is worse than a vague one. */
const notAThing = (of: string): string => NOT_A_THING[of] || "That is not a thing";

const ourLabel = (of: "L" | "P" | "U" | "K", id: string): string =>
  `ONE-${of}-${id.slice(id.indexOf("_") + 1).toUpperCase()}`;

/** One object as this app holds it — the columns every act below reads. */
interface Item {
  id: string; product: string; location: string | null; batch: string | null;
  life: Life; kit: string | null; services: number | null;
}

/**
 * ⚠️ BY ITS ROW ID OR BY THE LABEL PRINTED ON IT, AND BOTH ARE ADDRESSES. A
 * person standing in a store room has the code in their hand and nothing else;
 * making every caller look a row id up first would put a round trip between the
 * camera and the act, on a phone, for the gesture the product is fastest at.
 * Ours is unique within a workspace by construction — see `ourLabel`.
 */
const itemIn = async (c: Ctx, of: string): Promise<Item> => {
  const db = c.db as Db;
  /* ⚠️ NARROWED HERE, WHICH IS THE ONE PLACE A LABEL BECOMES AN OBJECT. Every
     issue, return, service and retirement in this product resolves through this
     function, so a member narrowed to one site cannot reach another site's
     drill by scanning a code somebody read out to them. */
  const near = only(c, "location");
  const held = await db.prepare(
    `SELECT id, product, location, batch, life, kit, services FROM unit
      WHERE tenant_id = ? AND (id = ? OR code = ?)${near.sql}`)
    .bind(c.tenantId, of, of, ...near.bound).first<Item>();
  if (!held) return c.fail("platform.not_found");
  return held;
};

/**
 * ISSUING, TAKING BACK AND RETIRING — the balance and the object, in that order.
 *
 * ⚠️ THE SHELF MOVES FIRST AND THE OBJECT SECOND, WHICH IS THE OPPOSITE OF WHAT
 * IT LOOKS LIKE IT SHOULD BE. The balance can REFUSE — there is nothing on that
 * shelf to take — and a refusal after the object was already marked out would
 * leave a drill recorded as issued by an operation that reported failure.
 *
 * ⚠️ AND IF SOMEBODY BEATS US TO THE OBJECT, THE MOVEMENT IS TAKEN BACK RATHER
 * THAN LEFT. Two people issuing one drill is the ordinary case in a busy store;
 * the compare-and-set is what makes the second one lose, and a movement without
 * the state change it belongs to is a shelf that quietly lost an item.
 */
async function actOnItem(
  c: Ctx, of: Item, act: Act, day: string, where: string | null,
  set: () => Promise<{ meta?: { changes?: number } }>,
): Promise<{ movement: string }> {
  const step = shelfStep(act);
  /* ⚠️ AN OBJECT WITH NO PLACE STILL MOVES THROUGH ITS LIFE. Refusing to record
     who took the extinguisher because nobody said which cupboard it lives in is
     the form-demanded-a-field failure this product is built against. */
  const at = where ?? of.location;
  let movement = "";

  if (step !== 0 && at) {
    const done = await stockMove(c, step < 0 ? "taken" : "received", {
      product: of.product, location: at,
      ...(of.batch ? { batch: of.batch } : {}),
      quantity: 1, day, capture: "typed", against: of.id,
    });
    movement = done.movement;
  }

  const out = await set();
  if (!out.meta?.changes) {
    if (movement && at) {
      await stockMove(c, "undone", {
        product: of.product, location: at,
        ...(of.batch ? { batch: of.batch } : {}),
        quantity: -step, day, capture: "typed", against: movement,
      });
    }
    return c.fail("inventory.moved");
  }
  return { movement };
}

/* ⚠️ ONE REFUSAL SHAPE FOR EVERY ACT, and the sentence comes from the pure rule
   rather than from each handler — two spellings of "it is already out with
   somebody" is how a screen and a door come to disagree about what is possible. */
const refuse = (c: Ctx, life: Life, act: Act): void => {
  const why = refuseAct(life, act);
  if (why) c.fail("inventory.wrongLife", { why });
};

const issue = operation<
  { unit: string; holder: string; day: string }, { movement: string }
>({
  id: "unit.issue",
  kind: "write",
  summary: "Give an item to somebody",
  input: {
    unit: field.text({ label: "Item", required: true, holds: "none" }),
    /* ⚠️ REQUIRED, BECAUSE "OUT" WITH NOBODY NAMED IS LOST. The whole value of
       issuing over taking is that somebody can be asked for it back. */
    holder: field.text({ label: "With", required: true, holds: "contact", max: 120 }),
    day: field.day({ label: "On", required: true, holds: "none" }),
  },
  output: { movement: field.text({ label: "Movement", holds: "none" }) },
  permission: "stock:move",
  idempotency: { mode: "key" },
  emits: ["unit.issued", "stock.taken"],
  outcome: { message: "Issued.", tone: "success", invalidates: ["unit.list", "stock.list"] },
  fails: ["platform.not_found", "platform.invalid", "inventory.wrongLife", "inventory.short", "inventory.moved"],
  audit: (input) => ({ subject: input.unit, verb: "issued" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;
    const of = await itemIn(c, input.unit);
    refuse(c, of.life, "issue");
    const holder = input.holder.trim();
    if (!holder) {
      return c.fail("platform.invalid", {}, { fields: { holder: "Say who has it" } });
    }

    /* ⚠️ THE UPDATE BELOW IS NOT NARROWED and does not need to be: `itemIn` is,
       so `of` is already an object on a shelf this person works on, and the
       statement is keyed on its id. */
    return actOnItem(c, of, "issue", input.day, null, () => db.prepare(
      `UPDATE unit SET life = 'issued', holder = ?, issued = ?, edited_at = ?, edited_by = ?
        WHERE id = ? AND tenant_id = ? AND life = 'held'`)
      .bind(holder, input.day, c.now, c.accountId ?? null, of.id, c.tenantId).run());
  },
});

/**
 * ⚠️ IT MAY COME BACK SOMEWHERE ELSE, AND THAT IS THE ORDINARY CASE. A drill
 * borrowed from the van rack is put on the bench; a screen that could only
 * return it where it started would make somebody either lie or not record it.
 */
const giveBack = operation<
  { unit: string; day: string; location?: string }, { movement: string }
>({
  id: "unit.return",
  kind: "write",
  summary: "Take an item back",
  input: {
    unit: field.text({ label: "Item", required: true, holds: "none" }),
    day: field.day({ label: "On", required: true, holds: "none" }),
    location: field.text({ label: "Where", holds: "none" }),
  },
  output: { movement: field.text({ label: "Movement", holds: "none" }) },
  permission: "stock:move",
  idempotency: { mode: "key" },
  emits: ["unit.returned", "stock.received"],
  outcome: { message: "Back.", tone: "success", invalidates: ["unit.list", "stock.list"] },
  fails: ["platform.not_found", "inventory.wrongLife", "inventory.short", "inventory.moved"],
  audit: (input) => ({ subject: input.unit, verb: "took back" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;
    const of = await itemIn(c, input.unit);
    refuse(c, of.life, "return");

    const back = input.location?.trim() || of.location;
    if (back && back !== of.location) {
      const where = await db.prepare(
        `SELECT id FROM location WHERE id = ? AND tenant_id = ?`)
        .bind(back, c.tenantId).first<{ id: string }>();
      if (!where) return c.fail("platform.not_found");
      /* ⚠️ AND IT HAS TO BE ONE OF THEIRS. Taking something back onto a shelf
         the person cannot see is how an object leaves their reach with nothing
         saying it did — they hand it in, it vanishes from their screen, and
         nobody can explain where it went. */
      mine(c, back);
    }

    return actOnItem(c, of, "return", input.day, back, () => db.prepare(
      /* ⚠️ THE HOLDER IS CLEARED, NOT KEPT AS "WHO HAD IT LAST". The history says
         who had it; a live column still naming somebody is a screen that tells a
         colleague to go and ask a person who gave it back last month. */
      `UPDATE unit SET life = 'held', holder = NULL, issued = NULL, location = ?,
              edited_at = ?, edited_by = ?
        WHERE id = ? AND tenant_id = ? AND life = 'issued'`)
      .bind(back, c.now, c.accountId ?? null, of.id, c.tenantId).run());
  },
});

/**
 * ⚠️ A SERVICE IS RECORDED WHEREVER THE THING IS. A van is serviced on the road
 * and a machine is calibrated in place; demanding it be back on our shelf first
 * would make the honest record the harder one to write.
 *
 * ⚠️ AND THE NEXT DATE IS GIVEN RATHER THAN COMPUTED. An interval is a fact
 * about a regime — annual, six-monthly, every 500 hours — and inventing one from
 * a default would print a confident date nobody chose on a fire extinguisher.
 */
const serve = operation<
  { unit: string; day: string; next?: string; note?: string }, { services: number }
>({
  id: "unit.serve",
  kind: "write",
  summary: "Record a service or calibration",
  input: {
    unit: field.text({ label: "Item", required: true, holds: "none" }),
    day: field.day({ label: "On", required: true, holds: "none" }),
    next: field.day({ label: "Next service", holds: "none" }),
    note: field.text({ label: "Note", holds: "none", max: 2_000 }),
  },
  output: { services: field.number({ label: "Services", holds: "none" }) },
  permission: "stock:move",
  idempotency: { mode: "key" },
  emits: ["unit.served"],
  outcome: { message: "Recorded.", tone: "success", invalidates: ["unit.list", "unit.due"] },
  fails: ["platform.not_found", "inventory.wrongLife"],
  audit: (input) => ({ subject: input.unit, verb: "serviced" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;
    const of = await itemIn(c, input.unit);
    refuse(c, of.life, "serve");

    await db.prepare(
      /* ⚠️ THE COUNT IS INCREMENTED IN THE STATEMENT rather than read and
         written. Two people recording the same machine's service is rare and a
         read-then-write loses one of them silently, which is the class of bug
         this file refuses everywhere else. */
      /* ⚠️ NOT NARROWED — `itemIn` was, so this is keyed on a reached row. */
      `UPDATE unit SET services = COALESCE(services, 0) + 1, due = ?, note = COALESCE(?, note),
              edited_at = ?, edited_by = ?
        WHERE id = ? AND tenant_id = ? AND life <> 'retired'`)
      .bind(input.next ?? null, input.note?.trim() || null, c.now, c.accountId ?? null,
        of.id, c.tenantId).run();

    return { services: (of.services ?? 0) + 1 };
  },
});

/**
 * ⚠️ RETIRING IS THE END, AND IT DEMANDS A REASON. "Dropped", "failed
 * calibration", "sold" and "stolen" are four different facts about a business,
 * and an object that left the shelf with none of them recorded is shrinkage
 * nobody can explain.
 *
 * ⚠️ AND IT IS `stock:adjust` RATHER THAN `stock:move`. It takes a number off a
 * shelf with no counterparty — which is the shape of every correction, and the
 * reason those are a separate grant.
 */
const retire = operation<
  { unit: string; day: string; reason: string }, { movement: string }
>({
  id: "unit.retire",
  kind: "write",
  summary: "Take an item out of service for good",
  input: {
    unit: field.text({ label: "Item", required: true, holds: "none" }),
    day: field.day({ label: "On", required: true, holds: "none" }),
    reason: field.text({ label: "Why", required: true, holds: "none", max: 200 }),
  },
  output: { movement: field.text({ label: "Movement", holds: "none" }) },
  permission: "stock:adjust",
  idempotency: { mode: "key" },
  emits: ["unit.retired", "stock.taken"],
  outcome: { message: "Retired.", tone: "warning", invalidates: ["unit.list", "stock.list"] },
  fails: ["platform.not_found", "platform.invalid", "inventory.wrongLife", "inventory.short", "inventory.moved"],
  audit: (input) => ({ subject: input.unit, verb: "retired" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;
    const of = await itemIn(c, input.unit);
    refuse(c, of.life, "retire");
    if (!input.reason.trim()) {
      return c.fail("platform.invalid", {}, { fields: { reason: "Say why it is going" } });
    }

    return actOnItem(c, of, "retire", input.day, null, () => db.prepare(
      /* ⚠️ AND IT LEAVES ITS KIT. A tray holding a condemned instrument that
         still reads complete is the one outcome the kit check exists for.

         ⚠️ NOT NARROWED — `itemIn` was, so this is keyed on a reached row. */
      `UPDATE unit SET life = 'retired', retired = ?, kit = NULL, note = ?,
              edited_at = ?, edited_by = ?
        WHERE id = ? AND tenant_id = ? AND life = 'held'`)
      .bind(input.day, input.reason.trim(), c.now, c.accountId ?? null, of.id, c.tenantId)
      .run());
  },
});

/**
 * WHAT NEEDS SERVICING — the asset half of the ladder.
 *
 * ⚠️ ITS OWN THRESHOLD, NOT THE EXPIRY ONE. "Tell me thirty days before" is a
 * sensible answer for a shelf life and a useless one for a fire extinguisher: an
 * annual inspection needs booking weeks out, and a kitchen that wants three days'
 * notice on cream does not want three days' notice on the extinguisher.
 */
interface Serviceable {
  id: string; code: string; product: string; name: string; serial: string;
  on: string; standing: string; days: number;
}

const dueService = operation<{ today: string }, { items: readonly Serviceable[] }>({
  id: "unit.due",
  kind: "read",
  summary: "What needs servicing, and when",
  input: { today: field.day({ label: "Today", required: true, holds: "none" }) },
  output: { items: field.json({ label: "Items", holds: "none" }) },
  permission: "stock:read",
  idempotency: { mode: "none" },
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;
    const warn = Math.trunc(Number(await c.setting("inventory.service_days"))) || 30;

    const rows = await db.prepare(
      /* ⚠️ RETIRED ONES ARE OUT. A condemned machine is never due for service,
         and leaving it in would put a permanent overdue row at the top of the
         one list somebody is supposed to be able to clear. */
      `SELECT u.id AS id, u.code AS code, u.serial AS serial, u.due AS due,
              u.product AS product, p.name AS name
         FROM unit u JOIN product p ON p.id = u.product
        WHERE u.tenant_id = ? AND u.due IS NOT NULL AND u.life <> 'retired'${
          only(c, "u.location").sql}`)
      .bind(c.tenantId, ...only(c, "u.location").bound)
      .all<{ id: string; code: string | null; serial: string | null; due: string;
        product: string; name: string }>();

    const items = rows.results.map((row): Serviceable => ({
      id: row.id,
      code: row.code ?? "",
      product: row.product,
      name: row.name,
      serial: row.serial ?? "",
      on: row.due,
      standing: standingOf(row.due, input.today, warn),
      days: daysLeft(row.due, input.today),
    }));

    items.sort((a, b) => a.days - b.days);
    return { items };
  },
});

/* ------------------------------------------------------------------- kits --- */

interface Kit {
  id: string; product: string; location: string | null; state: KitState;
  recipe: string | null;
}

const kitIn = async (c: Ctx, id: string): Promise<Kit> => {
  /* ⚠️ THE SAME CHOKEPOINT ONE COLLECTION OVER — see `itemIn`. */
  const near = only(c, "location");
  const of = await (c.db as Db).prepare(
    `SELECT id, product, location, state, recipe FROM kit
      WHERE id = ? AND tenant_id = ?${near.sql}`)
    .bind(id, c.tenantId, ...near.bound).first<Kit>();
  if (!of) return c.fail("platform.not_found");
  return of;
};

/* ⚠️ THE SAME WALK ANSWERS THE CHECK AND GATES THE BUILD, for the reason
   `differences` answers a count's preview and performs its close: two
   implementations of "is this complete" is how a screen comes to promise what a
   door refuses. */
async function weighKit(c: Ctx, of: Kit) {
  const db = c.db as Db;
  const members = await db.prepare(
    /* ⚠️ NOT NARROWED, AND THAT IS DELIBERATE. The kit was reached; what is IN
       it is a fact about the kit, and hiding a member because it is recorded on
       another shelf would report the set as short when it is complete. */
    `SELECT u.id AS id, u.product AS product, u.code AS code, p.name AS name
       FROM unit u JOIN product p ON p.id = u.product
      WHERE u.tenant_id = ? AND u.kit = ?`)
    .bind(c.tenantId, of.id)
    .all<{ id: string; product: string; code: string | null; name: string }>();

  let recipe: unknown = [];
  /* ⚠️ A MALFORMED SNAPSHOT IS READ AS EMPTY RATHER THAN THROWN ON. It was
     written by somebody editing a product months ago; a tray that cannot be
     opened at all is worse than one checked against the lines that parse. */
  try { recipe = of.recipe ? JSON.parse(of.recipe) : []; } catch { recipe = []; }
  const wants = wantsIn(recipe);
  const { short, stray } = checkKit(wants, members.results);

  /* ⚠️ A MISSING PRODUCT HAS NO MEMBER TO TAKE A NAME FROM, which is the whole
     reason this second read exists. "1 of prd_019a…" is a row nobody can act on;
     "1 × Clamp" is the thing to go and find. */
  const named = await namesFor(c, short.map((s) => s.product));

  return {
    members: members.results.map((m) => ({
      id: m.id, product: m.product, name: m.name, code: m.code ?? "",
      /* ⚠️ THE STRAYS ARE MARKED ON THE MEMBER ROW rather than listed apart. The
         person is looking at a tray and has to take one thing out of it. */
      stray: stray.includes(m.id),
    })),
    short: short.map((s) => ({ ...s, name: named.get(s.product) ?? s.product })),
    stray,
  };
}

const namesFor = async (c: Ctx, ids: readonly string[]) => {
  const named = new Map<string, string>();
  if (!ids.length) return named;
  const db = c.db as Db;
  const rows = await db.prepare(
    `SELECT id, name FROM product WHERE tenant_id = ? AND id IN (${ids.map(() => "?").join(",")})`)
    .bind(c.tenantId, ...ids).all<{ id: string; name: string }>();
  for (const row of rows.results) named.set(row.id, row.name);
  return named;
};

const assemble = operation<
  { product: string; location?: string; day: string }, { id: string; code: string }
>({
  id: "kit.assemble",
  kind: "write",
  summary: "Start putting a kit together",
  input: {
    product: field.text({ label: "Product", required: true, holds: "none" }),
    location: field.text({ label: "Where", holds: "none" }),
    day: field.day({ label: "On", required: true, holds: "none" }),
  },
  output: {
    id: field.text({ label: "Kit", holds: "none" }),
    code: field.text({ label: "Label", holds: "none" }),
  },
  permission: "stock:move",
  idempotency: { mode: "key" },
  emits: ["kit.assembled"],
  outcome: { message: "Started.", tone: "success", invalidates: ["kit.list"] },
  fails: ["platform.not_found", "platform.invalid"],
  audit: (input) => ({ subject: input.product, verb: "started a kit of" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;
    const of = await db.prepare(
      `SELECT id, tracking, recipe FROM product WHERE id = ? AND tenant_id = ?`)
      .bind(input.product, c.tenantId)
      .first<{ id: string; tracking: string; recipe: string | null }>();
    if (!of) return c.fail("platform.not_found");
    /* ⚠️ THE LADDER IS THE SPINE, so a kit of something nobody marked
       `assembled` is refused rather than quietly made. The rung is what says
       this product's instances are composed of other things. */
    if (of.tracking !== "assembled") {
      return c.fail("platform.invalid", {}, {
        fields: { product: "Mark this product as assembled first" },
      });
    }

    /* ⚠️ A KIT IS STARTED SOMEWHERE, AND SOMEWHERE HAS TO BE ONE OF THEIRS.
       Left off, a narrowed member could open a tray on another site's bench and
       then never see it again. */
    if (input.location) mine(c, input.location);

    const id = newId("kit", new Date(c.now));
    await db.prepare(
      `INSERT INTO kit (id, tenant_id, product, location, code, state, recipe, at, by)
        VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)`)
      .bind(id, c.tenantId, input.product, input.location ?? null, ourLabel("K", id),
        of.recipe ?? null, c.now, c.accountId ?? null).run();

    return { id, code: ourLabel("K", id) };
  },
});

const putIn = operation<{ kit: string; unit: string }, { members: number }>({
  id: "kit.put",
  kind: "write",
  summary: "Put an item into a kit",
  input: {
    kit: field.text({ label: "Kit", required: true, holds: "none" }),
    unit: field.text({ label: "Item", required: true, holds: "none" }),
  },
  output: { members: field.number({ label: "In it", holds: "none" }) },
  permission: "stock:move",
  idempotency: { mode: "key" },
  emits: ["kit.filled"],
  outcome: { message: "In.", tone: "success", invalidates: ["kit.list", "unit.list"] },
  fails: ["platform.not_found", "inventory.wrongKit", "inventory.wrongLife", "inventory.inKit"],
  audit: (input) => ({ subject: input.kit, verb: "filled" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;
    const of = await kitIn(c, input.kit);
    const why = refuseKitAct(of.state, "put");
    if (why) return c.fail("inventory.wrongKit", { why });

    const item = await itemIn(c, input.unit);
    /* ⚠️ A RETIRED OR ISSUED OBJECT CANNOT BE IN A TRAY. One is condemned and the
       other is in somebody's van; either way the tray would claim to hold
       something it does not. */
    if (item.life !== "held") {
      return c.fail("inventory.wrongLife", {
        why: item.life === "retired" ? "This one was retired" : "It is out with somebody",
      });
    }
    /* ⚠️ AND IT MAY BE IN ONE KIT ONLY. Moving it silently would empty another
       tray that still reads complete — refused, and the refusal names the kit so
       somebody can go and take it out on purpose. */
    if (item.kit && item.kit !== of.id) return c.fail("inventory.inKit");
    if (item.kit === of.id) return { members: await memberCount(c, of.id) };

    /* ⚠️ NOT NARROWED — both halves already are. `kitIn` reached the tray and
       `itemIn` reached the object, so this statement is keyed on two rows the
       caller has been shown. */
    await db.prepare(
      `UPDATE unit SET kit = ?, edited_at = ?, edited_by = ?
        WHERE id = ? AND tenant_id = ? AND kit IS NULL AND life = 'held'`)
      .bind(of.id, c.now, c.accountId ?? null, item.id, c.tenantId).run();

    return { members: await memberCount(c, of.id) };
  },
});

const memberCount = async (c: Ctx, kitId: string): Promise<number> => {
  /* ⚠️ NOT NARROWED, for the reason `weighKit` gives: what is IN a tray is a
     fact about the tray, and a count that hid a member recorded on another shelf
     would report a complete set as short. The tray itself was reached. */
  const of = await (c.db as Db).prepare(
    `SELECT COUNT(*) AS n FROM unit WHERE tenant_id = ? AND kit = ?`)
    .bind(c.tenantId, kitId).first<{ n: number }>();
  return of?.n ?? 0;
};

/**
 * ⚠️ TAKING SOMETHING OUT OF A BUILT KIT UN-BUILDS IT, and that is the rule worth
 * the whole record. Somebody needs the clamp, and refusing them would make the
 * app the thing standing between a person and their work — but the CLAIM must not
 * survive it, because a tray missing an instrument that still reads "complete" is
 * exactly what a kit check exists to prevent.
 */
const takeOut = operation<{ kit: string; unit: string }, { members: number }>({
  id: "kit.take",
  kind: "write",
  summary: "Take an item out of a kit",
  input: {
    kit: field.text({ label: "Kit", required: true, holds: "none" }),
    unit: field.text({ label: "Item", required: true, holds: "none" }),
  },
  output: { members: field.number({ label: "In it", holds: "none" }) },
  permission: "stock:move",
  idempotency: { mode: "key" },
  emits: ["kit.emptied"],
  outcome: { message: "Out.", tone: "success", invalidates: ["kit.list", "unit.list"] },
  fails: ["platform.not_found", "inventory.wrongKit"],
  audit: (input) => ({ subject: input.kit, verb: "took from" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;
    const of = await kitIn(c, input.kit);
    const why = refuseKitAct(of.state, "take");
    if (why) return c.fail("inventory.wrongKit", { why });

    /* ⚠️ NOT NARROWED — `kitIn` reached the tray, and taking a member out of it
       is an act on the tray. */
    await db.prepare(
      `UPDATE unit SET kit = NULL, edited_at = ?, edited_by = ?
        WHERE id = ? AND tenant_id = ? AND kit = ?`)
      .bind(c.now, c.accountId ?? null, input.unit, c.tenantId, of.id).run();

    if (of.state === "built") {
      await db.prepare(
        `UPDATE kit SET state = 'open', built = NULL, edited_at = ?, edited_by = ?
          WHERE id = ? AND tenant_id = ?`)
        .bind(c.now, c.accountId ?? null, of.id, c.tenantId).run();
    }

    return { members: await memberCount(c, of.id) };
  },
});

interface Weighed {
  members: readonly { id: string; product: string; name: string; code: string; stray: boolean }[];
  short: readonly (Short & { name: string })[];
}

const checking = operation<{ kit: string }, Weighed>({
  id: "kit.check",
  kind: "read",
  summary: "What a kit is missing, and what does not belong",
  input: { kit: field.text({ label: "Kit", required: true, holds: "none" }) },
  output: {
    members: field.json({ label: "In it", holds: "none" }),
    short: field.json({ label: "Missing", holds: "none" }),
  },
  permission: "stock:read",
  idempotency: { mode: "none" },
  fails: ["platform.not_found"],
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const { members, short } = await weighKit(c, await kitIn(c, input.kit));
    return { members, short };
  },
});

/**
 * ⚠️ A BUILD IS A CLAIM WITH A NAME AND A TIME ON IT, which is why it is refused
 * when anything is short. "This tray is complete" said over a tray missing a
 * clamp is the failure the whole record exists to prevent — and the refusal names
 * how many lines are missing, because the person is standing in front of the
 * tray and the next thing they do is go and find them.
 *
 * ⚠️ A STRAY IS REPORTED AND NEVER REFUSED, and the asymmetry is deliberate.
 * Short means the kit cannot do its job; an extra means somebody may have a
 * reason, and stranding them over it is how a rule gets worked around.
 */
const build = operation<{ kit: string; day: string }, { stray: number }>({
  id: "kit.build",
  kind: "write",
  summary: "Say a kit is complete",
  input: {
    kit: field.text({ label: "Kit", required: true, holds: "none" }),
    day: field.day({ label: "On", required: true, holds: "none" }),
  },
  output: { stray: field.number({ label: "Does not belong", holds: "none" }) },
  permission: "stock:move",
  idempotency: { mode: "key" },
  emits: ["kit.built"],
  outcome: { message: "Built.", tone: "success", invalidates: ["kit.list"] },
  fails: ["platform.not_found", "inventory.wrongKit", "inventory.incomplete"],
  audit: (input) => ({ subject: input.kit, verb: "built" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;
    const of = await kitIn(c, input.kit);
    const why = refuseKitAct(of.state, "build");
    if (why) return c.fail("inventory.wrongKit", { why });

    const { short, stray } = await weighKit(c, of);
    if (short.length) {
      return c.fail("inventory.incomplete", { missing: String(short.length) });
    }

    /* ⚠️ NOT NARROWED — `kitIn` was, and this is keyed on the row it returned. */
    await db.prepare(
      `UPDATE kit SET state = 'built', built = ?, edited_at = ?, edited_by = ?
        WHERE id = ? AND tenant_id = ? AND state = 'open'`)
      .bind(input.day, c.now, c.accountId ?? null, of.id, c.tenantId).run();

    return { stray: stray.length };
  },
});

/**
 * ⚠️ BREAKING A KIT UP IS AN END RATHER THAN AN EMPTYING. Its members go back to
 * being items on a shelf and the record stays as what it was — a kit that could
 * be re-opened is an identity somebody re-uses, so a tray recorded as sterile in
 * March would be the same record as the one assembled in August.
 */
const breakUp = operation<{ kit: string }, { released: number }>({
  id: "kit.break",
  kind: "write",
  summary: "Break a kit up",
  input: { kit: field.text({ label: "Kit", required: true, holds: "none" }) },
  output: { released: field.number({ label: "Items freed", holds: "none" }) },
  permission: "stock:move",
  idempotency: { mode: "key" },
  emits: ["kit.broken"],
  outcome: { message: "Broken up.", tone: "warning", invalidates: ["kit.list", "unit.list"] },
  fails: ["platform.not_found", "inventory.wrongKit"],
  audit: (input) => ({ subject: input.kit, verb: "broke up" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;
    const of = await kitIn(c, input.kit);
    const why = refuseKitAct(of.state, "break");
    if (why) return c.fail("inventory.wrongKit", { why });

    const released = await memberCount(c, of.id);
    /* ⚠️ NOT NARROWED — `kitIn` was, and breaking a tray releases every member
       of it wherever each one is recorded. */
    await db.prepare(
      `UPDATE unit SET kit = NULL, edited_at = ?, edited_by = ?
        WHERE tenant_id = ? AND kit = ?`)
      .bind(c.now, c.accountId ?? null, c.tenantId, of.id).run();
    await db.prepare(
      `UPDATE kit SET state = 'broken', edited_at = ?, edited_by = ?
        WHERE id = ? AND tenant_id = ? AND state <> 'broken'`)
      .bind(c.now, c.accountId ?? null, of.id, c.tenantId).run();

    return { released };
  },
});

/* --------------------------------------------------------------------- ai --- */

/**
 * ⚠️ AI MAY FILL ANYTHING AND MAY COMMIT NOTHING THAT CARRIES CONSEQUENCE, and
 * every action below is a READ dressed as a spend. None of them writes a row:
 * they answer, a screen fills a form, and a person presses the button that
 * writes. Expiry, quantity, lot, hazard class — each is a number somebody acts
 * on, and a model that could set one directly is a model that empties a shelf
 * because a photograph was blurred.
 *
 * ⚠️ AND `scripts/ai-commits.test.mjs` KEEPS THAT STRUCTURAL. The rule is one
 * sentence and it survives exactly as long as everybody remembers it; the guard
 * is what makes the next generating action have to be written the same way.
 *
 * ⚠️ NONE OF THEM NAMES A MODEL (D19). The app says what KIND of work this is;
 * the operator binds a row from the enabled catalogue; the lane's own election
 * answers when nobody has. A model id here is a deployment decision shipped
 * through a release, and it is wrong the day a provider retires the row.
 */

/** ⚠️ The seam the platform supplies for an operation that declared an action. */
interface Generating {
  generate?: (
    values: Readonly<Record<string, string>>, look?: { images?: readonly string[] },
  ) => Promise<{ readonly text: string; readonly credits: number } | string>;
}

/**
 * ⚠️ ONE REFUSAL FOR "THERE IS NO MODEL TO ASK", and its absence is a REFUSAL
 * rather than a stub. A deployment with no gateway configured cannot generate;
 * answering with a plausible product record would be this app inventing a
 * catalogue entry, charging nothing for it, and being indistinguishable from
 * working.
 */
async function asked(
  c: Ctx & Generating, values: Readonly<Record<string, string>>,
  /* ⚠️ A LIST EVEN WHERE THERE IS ONE, so this app has ONE shape for "here are
     the pictures". A singular parameter beside a plural one is two ways to ask
     the same question, and the next reader picks whichever they saw first. */
  pictures?: readonly string[],
): Promise<string> {
  if (!c.generate) return c.fail("platform.unavailable");
  const out = await c.generate(values, pictures?.length ? { images: pictures } : undefined);
  if (typeof out === "string") return c.fail("platform.unavailable", {}, { ref: out });
  return out.text;
}

const guessedOut = {
  name: field.text({ label: "Name", holds: "none" }),
  brand: field.text({ label: "Brand", holds: "none" }),
  category: field.text({ label: "Category", holds: "none" }),
  /* ⚠️ ONE SENTENCE, AND ONLY THE READER FROM PHOTOGRAPHS FILLS IT. A barcode
     lookup knows a name and knows nothing about what the thing looks like, so
     it answers "" here rather than padding the name out into prose. */
  description: field.text({ label: "Description", holds: "none" }),
  /* ⚠️ THE KINDS IT BELONGS TO, WHICH IS A LIST, so `json` — a field is
     single-valued here and `tagging` is where they land as rows. */
  tags: field.json({ label: "Tags", holds: "none" }),
  unit: field.text({ label: "Counted in", holds: "none" }),
  pack: field.number({ label: "How many it holds", holds: "none" }),
  tracking: field.text({ label: "Tracked as", holds: "none" }),
  /* ⚠️ THE REASON TRAVELS WITH THE RUNG. "Batched" on its own is a magic guess;
     "batched — it has an expiry date" is something somebody agrees with in half
     a second, and disagrees with just as fast. */
  why: field.text({ label: "Why", holds: "none" }),
  storage: field.text({ label: "How to store it", holds: "none" }),
  handling: field.text({ label: "How to handle it", holds: "none" }),
  hazards: field.json({ label: "Hazards", holds: "none" }),
  /* ⚠️ TWO SHELF LIVES, BOTH DURATIONS. A date read off a box belongs to the
     delivery that carried it — see `Guessed.shelfDays`. */
  shelfDays: field.number({ label: "Days from making", holds: "none" }),
  openDays: field.number({ label: "Days once opened", holds: "none" }),
  /* ⚠️ A PICTOGRAM WAS SEEN, WHICH IS NOT A CLASSIFICATION. It is what lets the
     sheet send somebody to the label reader instead of registering a solvent as
     though it were shampoo. */
  hazardous: field.bool({ label: "Looks hazardous", holds: "none" }),
} as const;

type Guessing = ReturnType<typeof guessedIn>;

/**
 * A BARCODE, AND WHAT THE THING BEHIND IT PROBABLY IS.
 *
 * ⚠️ THE ONBOARDING TAX IS WHY PEOPLE ABANDON INVENTORY APPS, and this is the
 * whole answer to it. Eight hundred products typed in by hand is a project
 * nobody finishes; one scan that comes back named, categorised and with a rung
 * suggested is a catalogue built by the work rather than before it.
 */
const identify = operation<{ code: string }, Guessing>({
  id: "product.identify",
  kind: "write",
  summary: "Say what a barcode probably is",
  input: { code: field.text({ label: "Code", required: true, holds: "none", max: 64 }) },
  output: guessedOut,
  permission: "product:write",
  /* ⚠️ NOT idempotent by key: two people scanning the same box a week apart are
     two questions, and the second may get a better answer from a better model.
     What must not repeat is the WRITE, and this writes nothing. */
  idempotency: { mode: "none" },
  outcome: { why: "the answer IS the report — this returns what it worked out, on the screen that asked" },
  fails: ["platform.unavailable"],
  audit: (input) => ({ subject: input.code, verb: "asked about" }),
  ai: {
    lane: "text",
    prompt: "You identify retail and trade products from their barcode numbers."
      + " The code is {code}."
      + " Answer with JSON only: name, brand, category, unit, pack, tracking, why."
      + " `unit` is the word one of them is counted in — glove, box, kg."
      + " `pack` is how many base units the barcoded item holds; 1 if it is a single."
      + " `tracking` is one of: listed, counted, batched, itemised."
      + " Use batched if it has a printed expiry or is hazardous or controlled;"
      + " itemised if it is durable equipment with a serial; counted otherwise;"
      + " listed for a fixture or a tool that never moves."
      + " `why` is one short clause saying why that rung — it is read by a person."
      + " If you do not recognise the code, answer with empty strings rather than"
      + " inventing a product.",
    variables: ["code"],
    maxOutput: 400,
  },
  async handler(ctx, input) {
    const c = ctx as Ctx & Generating;
    return guessedIn(readJson(await asked(c, { code: input.code })));
  },
});

/**
 * A PHOTOGRAPH OF A LABEL, AND THE PRODUCT RECORD IN IT.
 *
 * ⚠️ THIS IS THE PATH FOR EVERYTHING WITH NO BARCODE, OR ONE THAT WILL NOT SCAN,
 * which in a workshop or a kitchen is most of it. It reads the words, the pack
 * size and the pictograms — and the pictograms are why it is worth the vision
 * lane at all: a GHS diamond is a fact about a substance that no catalogue
 * lookup will tell you and nobody types in.
 *
 * ⚠️ THE HAZARDS ARE SUGGESTED, NEVER FILLED. A wrong hazard class on a printed
 * label is a legal document that is wrong, and the person who printed it is the
 * one who answers for it.
 */
const readLabel = operation<{ image: string; hint?: string }, Guessing>({
  id: "product.read",
  kind: "write",
  summary: "Read a product record off a photograph of its label",
  input: {
    /* ⚠️ A `data:` URL rather than a media key, because this happens BEFORE
       there is a product to hang an upload on — and asking somebody to create
       the record first is asking them to type in what the photograph says. */
    image: field.text({ label: "Photo", required: true, holds: "none", max: 8_000_000 }),
    hint: field.text({ label: "What it is", holds: "none", max: 200 }),
  },
  output: guessedOut,
  permission: "product:write",
  idempotency: { mode: "none" },
  outcome: { why: "the answer IS the report — this returns what it worked out, on the screen that asked" },
  fails: ["platform.unavailable", "platform.invalid"],
  audit: () => ({ subject: "a label", verb: "read" }),
  ai: {
    lane: "vision",
    prompt: "You read product labels. Answer with JSON only: name, brand,"
      + " category, unit, pack, tracking, why, storage, handling, hazards."
      + " `pack` is the quantity printed on the label — 100 pcs is 100."
      + " `tracking` is one of: listed, counted, batched, itemised; use batched if"
      + " the label carries an expiry date or a hazard pictogram."
      + " `storage` and `handling` are the label's own instructions, shortened."
      + " `hazards` is a list of the GHS classes the pictograms show, named."
      + " Read only what is on the label. Where it does not say, answer with an"
      + " empty string — a guess about a hazard is worse than a blank."
      + " The person adding it said: {hint}",
    variables: ["hint"],
    maxOutput: 700,
  },
  async handler(ctx, input) {
    const c = ctx as Ctx & Generating;
    /* ⚠️ REFUSED HERE RATHER THAN SENT. A string that is not a picture costs a
       reserve, a round trip and a confidently wrong answer about nothing. */
    if (!input.image.startsWith("data:image/")) {
      return c.fail("platform.invalid", {}, { fields: { image: "That is not a photo" } });
    }
    return guessedIn(readJson(await asked(c, { hint: input.hint ?? "" }, [input.image])));
  },
});

/**
 * SEVERAL PHOTOGRAPHS OF A THING, AND WHAT IT IS.
 *
 * ⚠️ THIS IS NOT `product.read` WITH MORE PICTURES, AND THE SPLIT IS THE POINT.
 * That one reads a LABEL: what is printed, in the words it is printed in,
 * including the pictograms — the legal half, where a guess is worse than a
 * blank. This asks the other question, the one somebody standing in a stockroom
 * holding a thing actually has: what IS this. A brand, a kind, a sentence
 * describing it, how it wants to be kept. One is transcription and the other is
 * recognition, and a prompt trying to do both does neither well.
 *
 * ⚠️ SIX AT MOST, AND MORE THAN ONE IS THE WHOLE VALUE. A single photograph of a
 * bottle is a bottle; the front, the back and the cap together are a product —
 * the back is where the volume and the storage line are, and the cap is how you
 * tell a trigger spray from a screw top. Past about six the answer stops
 * improving and every extra picture is a reserve spent.
 *
 * ⚠️ AND THE TAGS THIS WORKSPACE ALREADY USES ARE SENT WITH THEM, which is the
 * difference between a vocabulary and a pile of synonyms. The model is asked to
 * CHOOSE from what exists and to propose a new word only where nothing fits, so
 * a catalogue built over six months is still filterable.
 *
 * ⚠️ IT SUGGESTS AND COMMITS NOTHING, like every other model in this product. A
 * name it invented is a rename; a hazard it invented is a legal document that is
 * wrong — so hazards are not asked for here at all. That question has an
 * operation of its own, against the label, where the answer is readable.
 */
/**
 * ⚠️ SIX, AND IT IS A JUDGEMENT RATHER THAN A LIMIT SOMETHING IMPOSES. Front,
 * back, cap, base, a size reference and one more is every angle that tells you
 * something new about a box on a shelf; the seventh is another photograph of
 * the front. Each one is `TOKENS_PER_IMAGE` off a balance whether or not it
 * added anything, so the cap is where the answer stops improving.
 */
const SEEN_MOST = 6;

/**
 * ⚠️ THE TOTAL, IN `data:` URL CHARACTERS, AND IT IS NOT THE SAME AS SIX TIMES
 * ONE. Six photographs straight off a phone are tens of megabytes and no
 * provider accepts the request — which arrives as a timeout or a wall of gateway
 * text, minutes after somebody pressed a button, having explained nothing. The
 * screen shrinks each one to a 1600px edge before it asks (`shrunk`), which puts
 * six comfortably inside this; the ceiling is the refusal for an AGENT or a
 * queued call that does not, and it is worth roughly a megabyte of JPEG each.
 */
const SEEN_BYTES = 8_000_000;

const seeProduct = operation<{ images: unknown; hint?: string; known?: string }, Guessing>({
  id: "product.see",
  kind: "write",
  summary: "Say what a thing is from photographs of it",
  input: {
    /**
     * ⚠️ A LIST, SO IT IS `json` — a field is single-valued here, and six
     * numbered text fields would be a shape the next caller copies.
     *
     * ⚠️ AND THE CAP IS ENFORCED IN THE HANDLER RATHER THAN BY THE TYPE. `json`
     * cannot say "six data URLs under four megabytes between them", and the
     * three things that go wrong — too many, not pictures, too big to send —
     * each want their own sentence rather than one refusal about a shape.
     */
    images: field.json({ label: "Photos", required: true, holds: "none" }),
    hint: field.text({ label: "What it is", holds: "none", max: 200 }),
    /* ⚠️ THE WORDS THIS WORKSPACE ALREADY FILES THINGS UNDER. Sent rather than
       looked up here so the caller decides how many are worth the tokens. */
    known: field.text({ label: "Tags we have", holds: "none", max: 2_000 }),
  },
  output: guessedOut,
  permission: "product:write",
  idempotency: { mode: "none" },
  outcome: { why: "the answer IS the report — this returns what it worked out, on the sheet that asked" },
  fails: ["platform.unavailable", "platform.invalid", "platform.too_large"],
  audit: () => ({ subject: "a product", verb: "identified" }),
  ai: {
    lane: "vision",
    prompt: "You identify products from photographs for a stock system."
      + " Answer with JSON only: name, brand, description, unit, pack, tracking,"
      + " why, storage, handling, tags, shelfDays, openDays, hazardous."
      + " `name` is what somebody would call it on a shelf, not marketing copy."
      + " `description` is one sentence: what it is, what size, what form."
      + " `unit` is what a quantity of it would be counted in — bottle, box, kg."
      + " `pack` is how many base units the thing pictured holds; 0 if unclear."
      + " `tracking` is one of: listed, counted, batched, itemised. Use batched"
      + " if it carries an expiry or a hazard pictogram; itemised if it is one"
      + " serial-numbered object. `why` is the short reason for that rung."
      + " `storage` and `handling` are how it wants to be kept, briefly."
      + " `tags` are the kinds it belongs to. PREFER these words, which this"
      + " workspace already uses: {known}. Propose a new one only where none of"
      + " them fits. At most four."
      /*
        ⚠️ ONE OF THE PICTURES IS USUALLY THE LABEL, AND IT IS THE ONE CARRYING
        THE FACTS. Net contents, the exact product name, the storage line and
        the shelf life are printed there and nowhere else on the packaging —
        told to ignore the label the model answered about the shape of a bottle
        while holding a photograph of everything it needed.
      */
      + " If one of the pictures shows the label, READ IT: the printed name, the"
      + " net contents, the storage line and any shelf life are the best facts"
      + " you have, and they beat what the shape of the packaging suggests."
      /*
        ⚠️ A DURATION, NEVER A DATE — see `Guessed.shelfDays`. The date on the
        box belongs to one delivery; how long the thing keeps belongs to the
        product, and a date landing on a catalogue row would expire every future
        delivery of it on the same day.
      */
      + " `shelfDays` is how long it keeps FROM THE DAY IT WAS MADE, in days:"
      + " read \"24 months from manufacture\" as 730. `openDays` is how long"
      + " after opening, in days — the open-jar symbol reading 12M is 365. Use 0"
      + " for either where nothing says. NEVER answer with a date: a printed"
      + " expiry belongs to one delivery, not to the product."
      /*
        ⚠️ SEEING A PICTOGRAM AND CLASSIFYING ONE ARE DIFFERENT ACTS, and only
        the first is observation. Which hazard class an orange diamond declares
        is a legal statement — `product.read` makes it against a label somebody
        deliberately photographed, where the words are legible.
      */
      + " `hazardous` is true ONLY if you can see a hazard pictogram — an orange"
      + " and white diamond — or a signal word. Do not say which hazard class it"
      + " is, do not list H or P statements, and do not infer either from what"
      + " the product is: a different reader does that from the printed label."
      + " Where the pictures do not show something, answer with an empty string"
      + " rather than a guess."
      + " The person adding it said: {hint}",
    variables: ["known", "hint"],
    maxOutput: 800,
  },
  async handler(ctx, input) {
    const c = ctx as Ctx & Generating;
    const shots = Array.isArray(input.images) ? input.images : [];
    if (!shots.length) {
      return c.fail("platform.invalid", {}, { fields: { images: "Take a photo first" } });
    }
    if (shots.length > SEEN_MOST) {
      return c.fail("platform.invalid", {},
        { fields: { images: `${SEEN_MOST} photos at most` } });
    }
    /* ⚠️ REFUSED HERE RATHER THAN SENT, the same way `product.read` refuses a
       string that is not a picture: a reserve, a round trip and a confidently
       wrong answer about nothing. */
    const pictures = shots.filter((one): one is string =>
      typeof one === "string" && one.startsWith("data:image/"));
    if (pictures.length !== shots.length) {
      return c.fail("platform.invalid", {}, { fields: { images: "One of those is not a photo" } });
    }
    /* ⚠️ AND THE TOTAL, BECAUSE SIX PHONE PHOTOGRAPHS ARE FORTY MEGABYTES. The
       screen shrinks them first (`shrunk`); this is what happens when an agent or
       a replayed write calls the operation and does not. */
    const bytes = pictures.reduce((all, one) => all + one.length, 0);
    if (bytes > SEEN_BYTES) {
      return c.fail("platform.too_large",
        { size: `${Math.round(bytes / 1_000_000)} MB`, most: `${SEEN_BYTES / 1_000_000} MB` });
    }
    return guessedIn(readJson(await asked(c,
      { known: input.known ?? "", hint: input.hint ?? "" }, pictures)));
  },
});

/**
 * A PHOTOGRAPH OF A DELIVERY NOTE, AND THE LINES ON IT.
 *
 * ⚠️ ONE PHOTOGRAPH INSTEAD OF THIRTY SCANS, at a goods-in desk, which is where
 * the time actually goes. And EVERY LINE IS CONFIRMED: a quantity read off a
 * creased page is exactly the consequence §6.2 refuses to commit, so this
 * answers a list and the person receiving presses the button that moves stock.
 */
const readNote = operation<{ image: string }, { lines: readonly Noted[] }>({
  id: "stock.note",
  kind: "write",
  summary: "Read the lines off a photograph of a delivery note",
  input: {
    image: field.text({ label: "Photo", required: true, holds: "none", max: 8_000_000 }),
  },
  output: { lines: field.json({ label: "Lines", holds: "none" }) },
  permission: "stock:move",
  idempotency: { mode: "none" },
  outcome: { why: "the answer IS the report — this returns what it worked out, on the screen that asked" },
  fails: ["platform.unavailable", "platform.invalid"],
  audit: () => ({ subject: "a delivery note", verb: "read" }),
  ai: {
    lane: "vision",
    prompt: "You read delivery notes and packing lists. Answer with JSON only:"
      + " a list of lines, each with code, name, quantity, lot, expiry."
      + " `code` is the supplier's article number or barcode if the page shows one."
      + " `quantity` is the number delivered, in whatever unit the line names."
      + " `expiry` is YYYY-MM-DD, and empty unless the page gives a full date."
      + " Skip totals, headings and anything you cannot read. Do not infer a"
      + " quantity from a price. An empty list is a correct answer.",
    variables: [],
    /* ⚠️ A PAGE OF LINES IS THE LARGEST ANSWER THIS APP ASKS FOR, and the
       ceiling is what the reserve is computed from. Set too low the answer is
       truncated mid-line and the last delivery row is silently lost. */
    maxOutput: 2_000,
  },
  async handler(ctx, input) {
    const c = ctx as Ctx & Generating;
    if (!input.image.startsWith("data:image/")) {
      return c.fail("platform.invalid", {}, { fields: { image: "That is not a photo" } });
    }
    return { lines: notedIn(readJson(await asked(c, {}, [input.image]))) };
  },
});

/**
 * ASKING IN WORDS.
 *
 * ⚠️ IT REPLACES NAVIGATION FOR PEOPLE WHO WILL NOT LEARN NAVIGATION, which in
 * this product is most of them. "Do we have blue resin", "what expires this
 * month", "where is the torque wrench" — three questions that are three screens
 * and a filter each, asked the way somebody would ask a colleague.
 *
 * ⚠️ THE STOCK GOES IN THE PROMPT, AND THAT IS WHAT MAKES IT ANSWERABLE. A model
 * with no workspace in front of it can only answer about products in general;
 * one holding the lines answers about this shelf. It is also why the summary is
 * BOUNDED and says so — a reserve is computed from what is sent, and a
 * workspace with four thousand lines would otherwise pay for all of them on
 * every question.
 */
const HOW_MUCH = 200;

const askInWords = operation<
  { question: string; today: string }, { answer: string; looked: number }
>({
  id: "stock.ask",
  kind: "write",
  summary: "Answer a question about the stock, in words",
  input: {
    question: field.text({ label: "Question", required: true, holds: "none", max: 500 }),
    today: field.day({ label: "Today", required: true, holds: "none" }),
  },
  output: {
    answer: field.text({ label: "Answer", holds: "none" }),
    /* ⚠️ HOW MANY LINES IT ACTUALLY SAW. A bounded summary that does not say it
       is bounded is an answer of "we have none" over a shelf that has some. */
    looked: field.number({ label: "Lines read", holds: "none" }),
  },
  permission: "stock:read",
  idempotency: { mode: "none" },
  outcome: { why: "the answer IS the report — this returns what it worked out, on the screen that asked" },
  fails: ["platform.unavailable"],
  audit: (input) => ({ subject: input.question, verb: "asked" }),
  ai: {
    lane: "text",
    prompt: "You answer questions about what a workspace has in stock."
      + " Today is {today}. Here is what it holds, one line per row as"
      + " product · place · quantity · lot · expiry:\n{stock}\n"
      + " Answer the question in one or two short sentences, naming the place."
      + " If the lines do not say, answer that you cannot see it rather than"
      + " guessing. The question is: {question}",
    variables: ["question", "today", "stock"],
    maxOutput: 500,
    /* ⚠️ BRANDABLE, BECAUSE THIS ONE IS A VOICE. A workspace that wants shorter
       answers, or answers in German, is asking for something about itself —
       unlike reading a hazard pictogram, which is nobody's to reword. */
    brandable: true,
  },
  async handler(ctx, input) {
    const c = ctx as Ctx & Generating;
    const db = c.db as Db;

    const rows = await db.prepare(
      `SELECT p.name AS name, l.name AS place, s.quantity AS quantity,
              b.lot AS lot, b.printed AS printed
         FROM stock s
         JOIN product p ON p.id = s.product
         JOIN location l ON l.id = s.location
         LEFT JOIN batch b ON b.id = s.batch
        WHERE s.tenant_id = ? AND s.quantity > 0${only(c, "s.location").sql}
        ORDER BY p.name LIMIT ?`)
      .bind(c.tenantId, ...only(c, "s.location").bound, HOW_MUCH)
      .all<{ name: string; place: string; quantity: number; lot: string | null;
        printed: string | null }>();

    const stock = rows.results.map((row) => [
      row.name, row.place, String(row.quantity), row.lot ?? "", row.printed ?? "",
    ].join(" · ")).join("\n");

    const answer = await asked(c, {
      question: input.question,
      today: input.today,
      /* ⚠️ SAID RATHER THAN LEFT BLANK. A model handed nothing answers "you have
         nothing", which over an empty summary of a full warehouse is the most
         confident wrong answer this product could give. */
      stock: stock || "(nothing on any shelf)",
    });

    return { answer, looked: rows.results.length };
  },
});

/* -------------------------------------------------------------- the rail --- */

/* ⚠️ `kind` COMES BACK WITH THE STANDING BECAUSE EVERY NOTE THIS RAIL SENDS
   NAMES IT. A summary filled from an id tells somebody that "prc_01J…" needs
   releasing, which is a sentence nobody can act on without opening the app. */
interface Running { id: string; state: Run; kind: string; }

const runIn = async (c: Ctx, id: string): Promise<Running> => {
  const of = await (c.db as Db).prepare(
    `SELECT id, state, kind FROM process WHERE id = ? AND tenant_id = ?`)
    .bind(id, c.tenantId).first<Running>();
  if (!of) return c.fail("platform.not_found");
  return of;
};

/* ⚠️ ONE REFUSAL SHAPE FOR EVERY ACT ON A RUN, and the sentence comes from the
   pure rule — two spellings of "it has not finished yet" is how a screen and a
   door come to disagree about what is possible. */
const refuseOn = (c: Ctx, state: Run, act: RunAct): void => {
  const why = refuseRun(state, act);
  if (why) c.fail("inventory.wrongRun", { why });
};

/** ⚠️ Every batch a run covered, with what is still on a shelf to freeze. */
const membersOf = async (c: Ctx, run: string) => {
  const rows = await (c.db as Db).prepare(
    /* ⚠️ THE QUANTITY IS WHAT THEY CAN REACH, not what the workspace holds. A
       run may cover a lot that is on four sites; showing somebody the total is
       showing them stock they cannot see, and the number they would act on is
       the one on their own shelves. */
    `SELECT i.batch AS batch, i.verdict AS verdict,
            COALESCE((SELECT SUM(s.quantity) FROM stock s
                       WHERE s.batch = i.batch${only(c, "s.location").sql}), 0) AS quantity
       FROM process_item i
      WHERE i.tenant_id = ? AND i.process = ?`)
    .bind(...only(c, "s.location").bound, c.tenantId, run)
    .all<{ batch: string; verdict: Verdict; quantity: number }>();
  return rows.results;
};

const openRun = operation<
  { kind: string; machine?: string; day: string }, { id: string }
>({
  id: "process.open",
  kind: "write",
  summary: "Start a run",
  input: {
    kind: field.text({ label: "What kind of run", required: true, holds: "none", max: 120 }),
    machine: field.text({ label: "Machine", holds: "none", max: 120 }),
    day: field.day({ label: "On", required: true, holds: "none" }),
  },
  output: { id: field.text({ label: "Run", holds: "none" }) },
  permission: "process:run",
  entitlement: "processes",
  idempotency: { mode: "key" },
  emits: ["process.opened"],
  outcome: { message: "Started.", tone: "success", invalidates: ["process.list"] },
  audit: (input) => ({ subject: input.kind, verb: "started a run of" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const id = newId("prc", new Date(c.now));
    await (c.db as Db).prepare(
      `INSERT INTO process (id, tenant_id, kind, machine, state, started, at, by)
        VALUES (?, ?, ?, ?, 'open', ?, ?, ?)`)
      .bind(id, c.tenantId, input.kind, input.machine ?? null, input.day, c.now,
        c.accountId ?? null).run();
    return { id };
  },
});

const loadRun = operation<{ process: string; batch: string }, { items: number }>({
  id: "process.put",
  kind: "write",
  summary: "Put something into a run",
  input: {
    process: field.text({ label: "Run", required: true, holds: "none" }),
    batch: field.text({ label: "Batch", required: true, holds: "none" }),
  },
  output: { items: field.number({ label: "In the run", holds: "none" }) },
  permission: "process:run",
  entitlement: "processes",
  idempotency: { mode: "key" },
  emits: ["process.loaded"],
  outcome: { message: "In.", tone: "success", invalidates: ["process.list"] },
  fails: ["platform.not_found", "inventory.wrongRun"],
  audit: (input) => ({ subject: input.process, verb: "loaded" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;
    const run = await runIn(c, input.process);
    refuseOn(c, run.state, "put");

    const held = await db.prepare(
      `SELECT id FROM batch WHERE id = ? AND tenant_id = ?`)
      .bind(input.batch, c.tenantId).first<{ id: string }>();
    if (!held) return c.fail("platform.not_found");

    await db.prepare(
      `INSERT INTO process_item (id, tenant_id, process, batch, verdict, at, by)
        VALUES (?, ?, ?, ?, 'pending', ?, ?)
        ON CONFLICT (id) DO NOTHING`)
      .bind(`pri_${run.id}_${input.batch}`, c.tenantId, run.id, input.batch, c.now,
        c.accountId ?? null).run();

    /*
      ⚠️ LOADING SOMETHING INTO A RUN HOLDS IT, AND THAT IS THE WHOLE RAIL. The
      gap between a machine finishing and a qualified person signing for what
      came out of it is what this product has instead of deciding that a green
      light is a qualification — and until this line, nothing enforced it. The
      run opened, the cycle ended, the screen showed "waiting to be released",
      and the tray could be taken off the shelf and used on somebody.

      ⚠️ A BADGE ON A SCREEN IS NOT A QUARANTINE. That sentence was already
      written, one file over, about a state only a FAILED run could reach —
      which is the state where somebody has already noticed. The dangerous one
      is the ordinary night where nobody has looked yet.

      ⚠️ AND IT COMES OFF AT EXACTLY THREE PLACES: `process.release` stamps it
      `ok`, `process.lift` unfreezes one item deliberately with a reason, and
      nothing else. Receiving MORE of a held lot stays possible — a quarantine
      is about what may leave.
    */
    await db.prepare(
      `UPDATE batch SET standing = 'held', edited_at = ?, edited_by = ?
        WHERE id = ? AND tenant_id = ?`)
      .bind(c.now, c.accountId ?? null, input.batch, c.tenantId).run();

    return { items: (await membersOf(c, run.id)).length };
  },
});

/**
 * ⚠️ ENDING IS A FACT ABOUT A MACHINE AND NOTHING ELSE. It records that the cycle
 * finished and it releases nothing — the gap between here and `process.release`
 * is where a qualified person reads the printout, and a product without the gap
 * has decided that a green light is a qualification.
 */
const endRun = operation<
  { process: string; evidence?: string }, { state: string; kind: string }
>({
  id: "process.end",
  kind: "write",
  summary: "Record that a run finished",
  input: {
    process: field.text({ label: "Run", required: true, holds: "none" }),
    evidence: field.text({ label: "Evidence", holds: "none", max: 200 }),
  },
  output: {
    state: field.text({ label: "Standing", holds: "none" }),
    /* ⚠️ THE ANSWER CARRIES THE RUN'S NAME BECAUSE THE NOTE DOES. A dispatch
       fills its template from the input and the ANSWER, and the input here is an
       id — so without this the person told a load needs releasing is told that
       "prc_01J…" needs releasing. */
    kind: field.text({ label: "What it is", holds: "none" }),
  },
  permission: "process:run",
  entitlement: "processes",
  idempotency: { mode: "key" },
  emits: ["process.ended"],
  outcome: { message: "Finished.", tone: "success", invalidates: ["process.list"] },
  fails: ["platform.not_found", "inventory.wrongRun"],
  audit: (input) => ({ subject: input.process, verb: "finished" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const run = await runIn(c, input.process);
    refuseOn(c, run.state, "end");

    await (c.db as Db).prepare(
      `UPDATE process SET state = 'ended', ended = ?, evidence = COALESCE(?, evidence),
              edited_at = ?, edited_by = ?
        WHERE id = ? AND tenant_id = ? AND state = 'open'`)
      .bind(c.now, input.evidence?.trim() || null, c.now, c.accountId ?? null,
        run.id, c.tenantId).run();

    /* ⚠️ SAID PLAINLY, BECAUSE THE SCREEN HAS TO SAY IT. A run that finished and
       reads as done is the failure this whole rail exists to prevent. */
    return { state: "ended", kind: run.kind };
  },
});

/**
 * THE RELEASE — a person, a name, a time.
 *
 * ⚠️ IT IS `process:release` AND NOT `process:run`, WHICH IS THE POINT. The
 * person loading the autoclave and the person qualified to say its output may be
 * used are frequently not the same person, and where they are, that is the
 * workspace's decision to make by granting both. Sharing one permission takes
 * the decision away and calls it simplicity.
 *
 * ⚠️ AND ONLY A PENDING ITEM IS RELEASED — see `mayRelease`. A failed one has to
 * be run again and a lifted one is a failed one somebody unfroze; either
 * reaching `released` through this door would be the quarantine ladder run
 * backwards, which is the one direction it may never go.
 */
const releaseRun = operation<
  { process: string; day: string }, { released: number }
>({
  id: "process.release",
  kind: "write",
  summary: "Release what a run produced",
  input: {
    process: field.text({ label: "Run", required: true, holds: "none" }),
    day: field.day({ label: "On", required: true, holds: "none" }),
  },
  output: { released: field.number({ label: "Released", holds: "none" }) },
  permission: "process:release",
  entitlement: "processes",
  idempotency: { mode: "key" },
  emits: ["process.released"],
  outcome: { message: "Released.", tone: "success", invalidates: ["process.list", "batch.due"] },
  fails: ["platform.not_found", "inventory.wrongRun"],
  audit: (input) => ({ subject: input.process, verb: "released" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;
    const run = await runIn(c, input.process);
    refuseOn(c, run.state, "release");

    const members = await membersOf(c, run.id);
    let released = 0;
    for (const item of members) {
      if (!mayRelease(item.verdict)) continue;
      await db.prepare(
        `UPDATE process_item SET verdict = 'released', edited_at = ?, edited_by = ?
          WHERE tenant_id = ? AND process = ? AND batch = ? AND verdict = 'pending'`)
        .bind(c.now, c.accountId ?? null, c.tenantId, run.id, item.batch).run();
      /* ⚠️ THE THIRD CLOCK STARTS HERE AND NOT WHEN THE MACHINE STOPPED. "Sterile
         for ninety days from processing" counts from the moment somebody read the
         evidence and said yes. */
      await db.prepare(
        `UPDATE batch SET processed = ?, standing = 'ok', edited_at = ?, edited_by = ?
          WHERE id = ? AND tenant_id = ?`)
        .bind(input.day, c.now, c.accountId ?? null, item.batch, c.tenantId).run();
      released++;
    }

    await db.prepare(
      `UPDATE process SET state = 'released', released = ?, edited_at = ?, edited_by = ?
        WHERE id = ? AND tenant_id = ? AND state = 'ended'`)
      .bind(c.now, c.now, c.accountId ?? null, run.id, c.tenantId).run();

    return { released };
  },
});

/**
 * ⚠️ FAILING FREEZES WHAT THE RUN COVERED, and the freeze is what makes it more
 * than a status. A tray whose steriliser failed and that the shelf still hands
 * over is a tray somebody uses — see `stockMove`, which refuses a take from a
 * held batch.
 */
const failRun = operation<
  { process: string; reason: string }, { frozen: number; kind: string }
>({
  id: "process.fail",
  kind: "write",
  summary: "Fail a run and freeze what it covered",
  input: {
    process: field.text({ label: "Run", required: true, holds: "none" }),
    reason: field.text({ label: "Why", required: true, holds: "none", max: 200 }),
  },
  output: {
    frozen: field.number({ label: "Frozen", holds: "none" }),
    /* ⚠️ Named, so the note reads "Autoclave 2 failed" rather than an id. */
    kind: field.text({ label: "What it is", holds: "none" }),
  },
  permission: "process:release",
  entitlement: "processes",
  idempotency: { mode: "key" },
  emits: ["process.failed"],
  outcome: { message: "Failed.", tone: "warning", invalidates: ["process.list", "stock.list"] },
  fails: ["platform.not_found", "platform.invalid", "inventory.wrongRun"],
  audit: (input) => ({ subject: input.process, verb: "failed" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const run = await runIn(c, input.process);
    refuseOn(c, run.state, "fail");
    if (!input.reason.trim()) {
      return c.fail("platform.invalid", {}, { fields: { reason: "Say what went wrong" } });
    }
    return { frozen: await freeze(c, run.id, input.reason.trim(), "failed"), kind: run.kind };
  },
});

/**
 * ⚠️ A RECALL FREEZES WHAT IT CAN REACH AND NAMES WHAT IT CANNOT. The report that
 * lists four frozen boxes and says nothing about the six already used has told
 * somebody the problem is solved — and those six are the entire reason the
 * recall is happening.
 */
const recallRun = operation<
  { process: string; reason: string },
  { frozen: number; gone: readonly string[]; kind: string }
>({
  id: "process.recall",
  kind: "write",
  summary: "Call back what a run released",
  input: {
    process: field.text({ label: "Run", required: true, holds: "none" }),
    reason: field.text({ label: "Why", required: true, holds: "none", max: 200 }),
  },
  output: {
    frozen: field.number({ label: "Frozen", holds: "none" }),
    /* ⚠️ NAMED, NOT COUNTED. "Six could not be reached" is a number; the lots
       are what somebody rings a customer about. */
    gone: field.json({ label: "Could not be reached", holds: "none" }),
    /* ⚠️ Named, so the note reads "Autoclave 2 was called back". */
    kind: field.text({ label: "What it is", holds: "none" }),
  },
  permission: "process:release",
  entitlement: "processes",
  idempotency: { mode: "key" },
  emits: ["process.recalled"],
  outcome: { message: "Called back.", tone: "danger", invalidates: ["process.list", "stock.list"] },
  fails: ["platform.not_found", "platform.invalid", "inventory.wrongRun"],
  audit: (input) => ({ subject: input.process, verb: "recalled" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const run = await runIn(c, input.process);
    refuseOn(c, run.state, "recall");
    if (!input.reason.trim()) {
      return c.fail("platform.invalid", {}, { fields: { reason: "Say what went wrong" } });
    }
    const reach = reachedIn(await membersOf(c, run.id));
    const frozen = await freeze(c, run.id, input.reason.trim(), "recalled");
    return { frozen, gone: reach.gone, kind: run.kind };
  },
});

/**
 * ⚠️ ONE FREEZE FOR BOTH DOORS. Failing and recalling differ in WHEN they happen
 * and in what they mean; what they do to the shelf is identical, and two copies
 * of it is two chances for one of them to stop holding stock.
 */
async function freeze(c: Ctx, run: string, reason: string, to: Run): Promise<number> {
  const db = c.db as Db;
  const members = await membersOf(c, run);
  let frozen = 0;
  for (const item of members) {
    await db.prepare(
      `UPDATE process_item SET verdict = 'failed', reason = ?, edited_at = ?, edited_by = ?
        WHERE tenant_id = ? AND process = ? AND batch = ?`)
      .bind(reason, c.now, c.accountId ?? null, c.tenantId, run, item.batch).run();
    /* ⚠️ AND THE STAMP COMES OFF. A batch frozen by a failed run that kept its
       `processed` date would go on reading as released for the length of the
       shelf life somebody has just withdrawn. */
    const out = await db.prepare(
      `UPDATE batch SET standing = 'held', processed = NULL, edited_at = ?, edited_by = ?
        WHERE id = ? AND tenant_id = ?`)
      .bind(c.now, c.accountId ?? null, item.batch, c.tenantId).run();
    if (out.meta?.changes) frozen++;
  }
  await db.prepare(
    `UPDATE process SET state = ?, edited_at = ?, edited_by = ?
      WHERE id = ? AND tenant_id = ?`)
    .bind(to, c.now, c.accountId ?? null, run, c.tenantId).run();
  return frozen;
}

/**
 * LIFTING A QUARANTINE.
 *
 * ⚠️ IT LIFTS TO "NEEDS WORK" AND NEVER TO "GOOD TO GO". The thing is unfrozen —
 * holding stock frozen for ever because a form cannot be completed is how a rule
 * gets worked around — and it is still not released: the verdict becomes
 * `lifted` and the processed stamp stays off. A tray whose steriliser failed is
 * not sterile because somebody pressed a button.
 */
const liftHold = operation<
  { process: string; batch: string; reason: string }, { verdict: string }
>({
  id: "process.lift",
  kind: "write",
  summary: "Lift a quarantine, without releasing it",
  input: {
    process: field.text({ label: "Run", required: true, holds: "none" }),
    batch: field.text({ label: "Batch", required: true, holds: "none" }),
    reason: field.text({ label: "Why", required: true, holds: "none", max: 200 }),
  },
  output: { verdict: field.text({ label: "Verdict", holds: "none" }) },
  permission: "process:release",
  entitlement: "processes",
  idempotency: { mode: "key" },
  emits: ["process.lifted"],
  outcome: { message: "Unfrozen.", tone: "warning", invalidates: ["process.list", "stock.list"] },
  fails: ["platform.not_found", "platform.invalid", "inventory.wrongRun"],
  audit: (input) => ({ subject: input.batch, verb: "unfroze" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;
    if (!input.reason.trim()) {
      return c.fail("platform.invalid", {}, { fields: { reason: "Say why it is being unfrozen" } });
    }

    const item = await db.prepare(
      `SELECT verdict FROM process_item
        WHERE tenant_id = ? AND process = ? AND batch = ?`)
      .bind(c.tenantId, input.process, input.batch).first<{ verdict: Verdict }>();
    if (!item) return c.fail("platform.not_found");
    if (!mayLift(item.verdict)) {
      return c.fail("inventory.wrongRun", { why: "That one is not frozen" });
    }

    await db.prepare(
      `UPDATE process_item SET verdict = 'lifted', reason = ?, edited_at = ?, edited_by = ?
        WHERE tenant_id = ? AND process = ? AND batch = ? AND verdict = 'failed'`)
      .bind(input.reason.trim(), c.now, c.accountId ?? null, c.tenantId,
        input.process, input.batch).run();
    /* ⚠️ UNFROZEN AND NOT RELEASED — `processed` stays null, so every clock that
       reads it still says this was never processed. */
    await db.prepare(
      `UPDATE batch SET standing = 'ok', edited_at = ?, edited_by = ?
        WHERE id = ? AND tenant_id = ?`)
      .bind(c.now, c.accountId ?? null, input.batch, c.tenantId).run();

    return { verdict: "lifted" };
  },
});

/**
 * A RESULT THAT ARRIVED AFTERWARDS.
 *
 * ⚠️ A LATE RESULT THAT CONTRADICTS AN EARLIER ONE IS REFUSED, NEVER APPLIED. A
 * "pass" landing on a failed run un-fails something somebody already acted on; a
 * "pass" landing on a recalled one erases the evidence the recall was justified
 * by. What a contradiction means is that two facts disagree and a person has to
 * look — so this refuses, and says which two.
 *
 * ⚠️ AND A LATE FAILURE ON A RELEASED RUN IS NOT A CONTRADICTION, IT IS A RECALL.
 * That is the ordinary case the whole rail is built for: the cycle looked fine,
 * the indicator says otherwise at twenty-four hours, and everything that went out
 * has to be called back.
 */
const lateResult = operation<
  { process: string; said: Late; reason?: string }, { did: string; frozen: number }
>({
  id: "process.result",
  kind: "write",
  summary: "Record a result that arrived after the run",
  input: {
    process: field.text({ label: "Run", required: true, holds: "none" }),
    said: field.text({ label: "It says", required: true, holds: "none" }),
    reason: field.text({ label: "Why", holds: "none", max: 200 }),
  },
  output: {
    did: field.text({ label: "What happened", holds: "none" }),
    frozen: field.number({ label: "Frozen", holds: "none" }),
  },
  permission: "process:release",
  entitlement: "processes",
  idempotency: { mode: "key" },
  emits: ["process.result", "process.recalled"],
  outcome: { message: "Recorded.", tone: "warning", invalidates: ["process.list", "stock.list"] },
  fails: ["platform.not_found", "platform.invalid", "inventory.contradicts"],
  audit: (input) => ({ subject: input.process, verb: "recorded a result for" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const run = await runIn(c, input.process);
    const said: Late = input.said === "failed" ? "failed" : "passed";
    const landing = landResult(run.state, said);

    if (landing === "refused") {
      return c.fail("inventory.contradicts", { was: run.state, said });
    }
    /* ⚠️ "SAME" IS NOT A NO-OP DRESSED AS SUCCESS — it is a result agreeing with
       what is already recorded, which is the commonest late result there is and
       is worth answering plainly rather than refusing. */
    if (landing === "same") return { did: "same", frozen: 0 };

    const why = input.reason?.trim() || `A late result said ${said}`;
    return { did: landing, frozen: await freeze(c, run.id, why, landing === "recall" ? "recalled" : "failed") };
  },
});

/* --------------------------------------------------------------- the job --- */

const openJob = operation<
  { ref: string; label?: string; day: string }, { id: string }
>({
  id: "job.open",
  kind: "write",
  summary: "Open a job",
  input: {
    ref: field.text({ label: "Reference", required: true, holds: "contact", max: 120 }),
    label: field.text({ label: "What it is", holds: "none", max: 200 }),
    day: field.day({ label: "On", required: true, holds: "none" }),
  },
  output: { id: field.text({ label: "Job", holds: "none" }) },
  permission: "process:run",
  entitlement: "jobs",
  idempotency: { mode: "key" },
  emits: ["job.opened"],
  outcome: { message: "Opened.", tone: "success", invalidates: ["job.list"] },
  audit: (input) => ({ subject: input.ref, verb: "opened a job for" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const id = newId("job", new Date(c.now));
    await (c.db as Db).prepare(
      `INSERT INTO job (id, tenant_id, ref, label, state, opened, at, by)
        VALUES (?, ?, ?, ?, 'open', ?, ?, ?)`)
      .bind(id, c.tenantId, input.ref, input.label ?? null, input.day, c.now,
        c.accountId ?? null).run();
    return { id };
  },
});

const closeJob = operation<{ job: string; day: string }, { state: string }>({
  id: "job.close",
  kind: "write",
  summary: "Close a job",
  input: {
    job: field.text({ label: "Job", required: true, holds: "none" }),
    day: field.day({ label: "On", required: true, holds: "none" }),
  },
  output: { state: field.text({ label: "Standing", holds: "none" }) },
  permission: "process:run",
  entitlement: "jobs",
  idempotency: { mode: "key" },
  emits: ["job.closed"],
  outcome: { message: "Closed.", tone: "success", invalidates: ["job.list"] },
  fails: ["platform.not_found"],
  audit: (input) => ({ subject: input.job, verb: "closed" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const out = await (c.db as Db).prepare(
      `UPDATE job SET state = 'closed', closed = ?, edited_at = ?, edited_by = ?
        WHERE id = ? AND tenant_id = ? AND state = 'open'`)
      .bind(input.day, c.now, c.accountId ?? null, input.job, c.tenantId).run();
    /* ⚠️ CLOSING A CLOSED JOB IS NOT AN ERROR, it is somebody pressing twice —
       but a job that never existed is an address that names nothing. */
    if (!out.meta?.changes) {
      const held = await (c.db as Db).prepare(
        `SELECT id FROM job WHERE id = ? AND tenant_id = ?`)
        .bind(input.job, c.tenantId).first<{ id: string }>();
      if (!held) return c.fail("platform.not_found");
    }
    return { state: "closed" };
  },
});

/**
 * WHAT A JOB CONSUMED, AND WHETHER ANY OF IT IS NOW IN DOUBT.
 *
 * ⚠️ IT READS BACKWARDS AND IT IS DERIVED AT READ TIME, which is the whole reason
 * this is a query rather than a stored status. A job correct on Tuesday acquires
 * a concern on Thursday without anything about the job changing — a recall lands
 * on a lot it used — and a status written when the job closed can never learn
 * that. This joins to what the batches say NOW.
 */
interface Consumed {
  movement: string; product: string; name: string; quantity: number;
  batch: string; lot: string; at: string; doubt: string;
}

const traceJob = operation<
  { job: string }, { items: readonly Consumed[]; doubted: number }
>({
  id: "job.trace",
  kind: "read",
  summary: "What a job used, and what is now in doubt",
  input: { job: field.text({ label: "Job", required: true, holds: "none" }) },
  output: {
    items: field.json({ label: "What it used", holds: "none" }),
    doubted: field.number({ label: "In doubt", holds: "none" }),
  },
  permission: "process:read",
  entitlement: "jobs",
  idempotency: { mode: "none" },
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const rows = await (c.db as Db).prepare(
      /*
        ⚠️ THE LEDGER IS THE LINE TABLE. Every take against this job already
        named it in `against`, so a second table of job lines would be a copy
        that can disagree with the history — and the history is what an audit
        reads.
      */
      `SELECT l.id AS movement, l.product AS product, l.delta AS delta, l.at AS at,
              COALESCE(l.batch, '') AS batch, COALESCE(b.lot, '') AS lot,
              COALESCE(b.standing, '') AS standing, p.name AS name,
              COALESCE((SELECT i.verdict FROM process_item i
                         WHERE i.tenant_id = l.tenant_id AND i.batch = l.batch
                         ORDER BY i.at DESC LIMIT 1), '') AS verdict
         FROM ledger l
         JOIN product p ON p.id = l.product
         LEFT JOIN batch b ON b.id = l.batch
        WHERE l.tenant_id = ? AND l.against = ? AND l.move = 'taken'${
          only(c, "l.location").sql}
        ORDER BY l.at DESC`)
      .bind(c.tenantId, input.job, ...only(c, "l.location").bound)
      .all<{ movement: string; product: string; delta: number; at: string;
        batch: string; lot: string; standing: string; name: string; verdict: string }>();

    const items = rows.results.map((row): Consumed => ({
      movement: row.movement,
      product: row.product,
      name: row.name,
      quantity: Math.abs(row.delta),
      batch: row.batch,
      lot: row.lot,
      at: row.at,
      /*
        ⚠️ THE DOUBT IS COMPUTED HERE, FROM WHAT IS TRUE NOW. A lot frozen since
        the job closed is a concern; one a run failed and somebody unfroze is a
        different concern, and both are the reason this read exists.
      */
      doubt: row.standing === "held"
        ? "held"
        : row.verdict === "failed" || row.verdict === "lifted"
          ? "not released"
          : "",
    }));

    return { items, doubted: items.filter((i) => i.doubt).length };
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
const starts = operation<
  Record<string, never>,
  { tracking: string; unit: string; profile: string; leadDays: number; words: Words }
>({
  id: "product.start",
  kind: "read",
  summary: "What a new product starts as here",
  input: {},
  output: {
    tracking: field.text({ label: "Tracked as", holds: "none" }),
    unit: field.text({ label: "Counted in", holds: "none" }),
    /*
      ⚠️ THE PROFILE AND ITS WORDS TRAVEL TOGETHER, because a screen given only
      the id would map it to nouns itself — a second copy of the vocabulary,
      drifting from this one the day a profile is added. What crosses is the
      answer, and the mapping stays in `words.ts` where it can be tested.
    */
    profile: field.text({ label: "What this is for", holds: "none" }),
    /* ⚠️ THE WORKSPACE'S OWN LEAD TIME, so a supplier's blank one can say what
       it falls back TO. A screen that showed an empty box with no number beside
       it would leave a person guessing whether blank meant "today". */
    leadDays: field.number({ label: "A delivery takes", holds: "none" }),
    words: field.json({ label: "What things are called", holds: "none" }),
  },
  permission: "product:write",
  idempotency: { mode: "none" },
  async handler(ctx) {
    const c = ctx as Ctx;
    /* ⚠️ NO `??` OF ITS OWN. The declaration carries the fallback and the
       platform resolves it; a default here would be a second answer to what a
       workspace switched on, and it would MASK the platform failing to apply
       the declared one. */
    const profile = String(await c.setting("inventory.profile"));
    return {
      tracking: String(await c.setting("inventory.default_tracking")),
      unit: String(await c.setting("inventory.default_unit")),
      leadDays: Number(await c.setting("inventory.lead_days")),
      profile,
      /* ⚠️ A PROFILE A LATER BUILD REMOVED READS AS THE PLAIN ONE, never as a
         screen with `undefined` where its headings go. */
      words: wordsFor(profile),
    };
  },
});

/* ------------------------------------------------------------- the import --- */

/**
 * ⚠️ ONE PLANNER, TWO OPERATIONS, AND THE SECOND RE-RUNS THE FIRST. What the
 * preview promises and what the button does have to be the same function — the
 * count session already learned this, and an import is the same shape with eight
 * hundred rows instead of one shelf. A second implementation would be a screen
 * that says "12 new, 3 updated" over a write that does something else.
 *
 * ⚠️ AND THE CORRECTED MAPPING GOES THROUGH THE SAME DOOR. `said` is whatever
 * the mapping screen sent — an opaque blob off the wire — and `columnsFor` is
 * the one place it is made safe. A handler that merged it itself would be the
 * second implementation this function exists to prevent, one field further in.
 */
async function planImport(c: Ctx, text: string, said?: unknown) {
  const db = c.db as Db;
  const sheet = readSheet(text);
  const columns = columnsFor(sheet.header, said);

  /* ⚠️ EVERY NAME AND EVERY CODE THE WORKSPACE HAS, read once. Asked per row
     this is two queries times eight hundred, which is an import that times out
     on exactly the file size it exists for. */
  const kinds = await db.prepare(`SELECT id, name FROM product WHERE tenant_id = ?`)
    .bind(c.tenantId).all<{ id: string; name: string }>();
  const codes = await db.prepare(`SELECT value, product FROM code WHERE tenant_id = ?`)
    .bind(c.tenantId).all<{ value: string; product: string }>();

  const known = {
    byName: Object.fromEntries(kinds.results.map((r) => [String(r.name).toLowerCase(), String(r.id)])),
    byCode: Object.fromEntries(codes.results.map((r) => [String(r.value), String(r.product)])),
  };
  return { sheet, columns, planned: planIn(sheet, columns, known) };
}

/**
 * WHAT THIS SPREADSHEET WOULD DO.
 *
 * ⚠️ A PREVIEW IS NOT A COURTESY HERE. A column mapping this gets wrong puts a
 * supplier's name in the product name for eight hundred rows, and the only place
 * anybody could notice is before it happens. The guess is worth making because
 * it is right most of the time; the preview is what makes being wrong
 * survivable.
 *
 * ⚠️ A WRITE THAT WRITES NOTHING, AND THE REASON IS THE BODY. A read answers on
 * a GET, and a GET carries its input in the URL — so a spreadsheet of eight
 * hundred rows would be a query string of a hundred kilobytes, refused somewhere
 * between the browser and the worker at a limit nobody can predict and nobody
 * controls. `product.identify` is a write for the same kind of reason one level
 * along: what the verb does is not the only thing that decides the method.
 *
 * ⚠️ AND THE AUDIT ROW IS HONEST RATHER THAN CEREMONIAL. Somebody pasted a
 * workspace's whole catalogue into this product; that is worth a line whether or
 * not they went on to press the button.
 */
const seeImport = operation<
  { text: string; columns?: unknown },
  {
    columns: Readonly<Record<string, number>>; header: readonly string[];
    tally: Readonly<Record<string, number>>; rows: readonly Planned[];
  }
>({
  id: "product.preview",
  kind: "write",
  summary: "What this spreadsheet would do",
  input: {
    text: field.long({ label: "Rows", required: true, holds: "none", max: 400_000 }),
    /* ⚠️ WHAT SOMEBODY CORRECTED THE GUESS TO, and absent is the guess itself —
       which is what makes the first ask a paste rather than a form. */
    columns: field.json({ label: "Which column is which", holds: "none" }),
  },
  output: {
    header: field.json({ label: "Headings", holds: "none" }),
    columns: field.json({ label: "Which column is which", holds: "none" }),
    tally: field.json({ label: "How many of each", holds: "none" }),
    rows: field.json({ label: "Row by row", holds: "none" }),
  },
  permission: "product:write",
  entitlement: "imports",
  /* ⚠️ REPLAYABLE, BECAUSE IT CHANGES NOTHING. A key here would make the second
     look at the same sheet answer with the first one's cached verdict, which is
     wrong the moment somebody adds a product between the two. */
  idempotency: { mode: "none" },
  outcome: { why: "the answer IS the report — this returns what it worked out, on the screen that asked" },
  audit: () => ({ subject: "a spreadsheet", verb: "looked at" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const out = await planImport(c, input.text, input.columns);
    return {
      header: out.sheet.header,
      columns: out.columns,
      tally: tallyIn(out.planned),
      /* ⚠️ EVERY ROW, INCLUDING THE REFUSED ONES. An import that quietly skipped
         eleven of eight hundred is discovered months later by somebody looking
         for one of them. */
      rows: out.planned,
    };
  },
});

/**
 * AND DOING IT.
 *
 * ⚠️ THE STOCK GOES THROUGH THE CHOKEPOINT LIKE EVERYTHING ELSE. An import that
 * wrote `stock` itself would be a second place a balance can change, and the
 * ledger would stop being the whole story on the very rows a workspace has the
 * least other record of. `imported` is what `capture` says, which is why that
 * column exists.
 *
 * ⚠️ AND A REFUSED ROW IS REPORTED, NEVER APPLIED. Half an import is worse than
 * none: the catalogue looks done and the missing ones are invisible.
 */
const doImport = operation<
  { text: string; day: string; columns?: unknown },
  {
    made: number; changed: number; received: number; learned: number;
    refused: readonly string[];
  }
>({
  id: "product.import",
  kind: "write",
  summary: "Bring a spreadsheet in",
  input: {
    text: field.long({ label: "Rows", required: true, holds: "none", max: 400_000 }),
    day: field.day({ label: "On", required: true, holds: "none" }),
    /* ⚠️ THE SAME MAPPING THE PREVIEW WAS SHOWN WITH. Sent again rather than
       remembered: a server-side draft would be a second copy of what is about
       to happen, and the two would differ the moment somebody opened the screen
       twice. */
    columns: field.json({ label: "Which column is which", holds: "none" }),
  },
  output: {
    made: field.number({ label: "Added", holds: "none" }),
    changed: field.number({ label: "Changed", holds: "none" }),
    received: field.number({ label: "Put on a shelf", holds: "none" }),
    learned: field.number({ label: "Suppliers added", holds: "none" }),
    refused: field.json({ label: "Refused", holds: "none" }),
  },
  /* ⚠️ `stock:adjust` RATHER THAN `stock:move`, because an import that carries
     quantities SETS numbers rather than moving them — and the product's sharpest
     access rule is that taking and correcting are different grants. */
  permission: "stock:adjust",
  entitlement: "imports",
  idempotency: { mode: "key" },
  emits: ["product.created", "stock.received"],
  outcome: {
    message: "Imported.", tone: "success",
    invalidates: ["product.list", "stock.list", "code.list"],
  },
  fails: ["platform.invalid", "platform.quota_reached", "inventory.short", "inventory.moved"],
  audit: () => ({ subject: "a spreadsheet", verb: "imported" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;
    const { planned } = await planImport(c, input.text, input.columns);
    if (!planned.length) {
      return c.fail("platform.invalid", {}, { fields: { text: "Nothing to import" } });
    }

    const fallbackUnit = String(await c.setting("inventory.default_unit"));
    const tracking = String(await c.setting("inventory.default_tracking"));
    /* ⚠️ THE PLACES BY NAME, read once. A sheet naming a shelf that does not
       exist is a refusal rather than a shelf invented from a typo — a location
       tree with "Sote room" in it is a tree nobody trusts. */
    /* ⚠️ ONLY THE ONES THEY REACH, so an import naming another site's shelf is
       refused by the same sentence a misspelt one is — rather than quietly
       writing four hundred lines onto a rack the importer cannot see. */
    const places = await db.prepare(
      `SELECT id, name FROM location WHERE tenant_id = ?${only(c, "id").sql}`)
      .bind(c.tenantId, ...only(c, "id").bound).all<{ id: string; name: string }>();
    const placeOf = new Map(places.results.map((r) => [String(r.name).toLowerCase(), String(r.id)]));

    /* ⚠️ A SUPPLIER IS LEARNED WHERE A SHELF IS REFUSED, and the asymmetry is the
       point. A place is physical — it has a code stuck to it and a tree above
       it, and one invented from a typo is a location nobody can walk to. A
       supplier is a name and a phone number: a duplicate is untidy and a missing
       one is the reorder report unable to say who to ring, which is the whole
       reason the collection exists. */
    const suppliers = await db.prepare(`SELECT id, name FROM supplier WHERE tenant_id = ?`)
      .bind(c.tenantId).all<{ id: string; name: string }>();
    const supplierOf = new Map(
      suppliers.results.map((r) => [String(r.name).toLowerCase(), String(r.id)]));

    let made = 0;
    let changed = 0;
    let received = 0;
    let learned = 0;
    const refused: string[] = [];

    for (const row of planned) {
      if (row.verdict === "refused") { refused.push(`Line ${row.line}: ${row.why}`); continue; }

      const where = row.location ? placeOf.get(row.location.toLowerCase()) : undefined;
      if (row.quantity !== null && !where) {
        refused.push(`Line ${row.line}: no place called "${row.location}"`);
        continue;
      }

      let from: string | null = null;
      if (row.supplier) {
        const key = row.supplier.toLowerCase();
        from = supplierOf.get(key) ?? null;
        if (!from) {
          from = newId("sup", new Date(c.now));
          await db.prepare(
            `INSERT INTO supplier (id, tenant_id, name, at, by) VALUES (?, ?, ?, ?, ?)`)
            .bind(from, c.tenantId, row.supplier, c.now, c.accountId ?? null).run();
          supplierOf.set(key, from);
          learned++;
        }
      }

      let product = row.product;
      if (!product) {
        product = newId("prd", new Date(c.now));
        await db.prepare(
          `INSERT INTO product (id, tenant_id, name, brand, category, tracking, unit, par,
                                supplier, at, by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(product, c.tenantId, row.name || row.code, row.brand, row.category,
            tracking, row.unit || fallbackUnit, row.par, from, c.now,
            c.accountId ?? null).run();
        made++;
      } else {
        /* ⚠️ ONLY WHAT THE SHEET ACTUALLY SAID. `COALESCE` on an empty string
           would blank a brand somebody typed because a column was absent — an
           import that quietly erases is worse than one that refuses. */
        await db.prepare(
          `UPDATE product SET
             brand = CASE WHEN ? = '' THEN brand ELSE ? END,
             category = CASE WHEN ? = '' THEN category ELSE ? END,
             unit = CASE WHEN ? = '' THEN unit ELSE ? END,
             par = COALESCE(?, par),
             supplier = COALESCE(?, supplier),
             edited_at = ?, edited_by = ?
           WHERE id = ? AND tenant_id = ?`)
          .bind(row.brand, row.brand, row.category, row.category, row.unit, row.unit,
            row.par, from, c.now, c.accountId ?? null, product, c.tenantId).run();
        changed++;
      }

      /*
        ⚠️ THE CODE IS LEARNED RATHER THAN OVERWRITTEN, through the same rule
        `code.learn` follows: one code names one product, and a second owner is
        refused rather than replaced. Learning it twice would make every future
        scan of that string ambiguous, and the resolver would answer with
        whichever row it read first — a wrong product, confidently, for ever.

        ⚠️ READ THEN WRITE, RATHER THAN `ON CONFLICT`. The `code` table is a
        declared collection and the platform's generated DDL carries no unique
        index on `(tenant_id, value)` — so an upsert naming one is not a
        stricter write, it is `SQLITE_ERROR` at run time and a 503 for the whole
        import. The window between the read and the insert is a bulk paste
        racing itself, which cannot happen: `planIn` has already refused the
        second row.
      */
      if (row.code) {
        const taken = await db.prepare(
          `SELECT product FROM code WHERE tenant_id = ? AND value = ?`)
          .bind(c.tenantId, row.code).first<{ product: string }>();
        if (taken && taken.product !== product) {
          refused.push(`Line ${row.line}: "${row.code}" already names something else`);
        } else if (!taken) {
          await db.prepare(
            `INSERT INTO code (id, tenant_id, value, product, kind, pack, source, at, by)
              VALUES (?, ?, ?, ?, 'other', 1, 'imported', ?, ?)`)
            .bind(newId("code", new Date(c.now)), c.tenantId, row.code, product, c.now,
              c.accountId ?? null).run();
        }
      }

      if (row.quantity !== null && where) {
        await stockMove(c, "received", {
          product, location: where, quantity: row.quantity, day: input.day,
          capture: "imported", reason: "Imported",
        });
        received++;
      }
    }

    return { made, changed, received, learned, refused };
  },
});

/* ------------------------------------------------------------ the reports --- */

/**
 * WHAT THE HISTORY ADDS UP TO — one ask, because a figure screen is one screen.
 *
 * ⚠️ FOUR ANSWERS IN ONE ROUND TRIP, AND THAT IS NOT A CONVENIENCE. Consumption,
 * shrinkage, how much of it was actually recorded and what to buy are four
 * readings of the SAME movements over the SAME period; four operations would
 * read the ledger four times and — worse — could be given four different
 * periods, so a screen could show a month's usage beside a fortnight's losses
 * with nothing anywhere saying they disagreed.
 *
 * ⚠️ AND EVERY NUMBER IS DERIVED. There is no report table: a correction made in
 * March changes what February consumed, and a stored figure never learns that.
 */
interface Reported {
  told: { recorded: number; inferred: number; share: number };
  used: readonly { product: string; name: string; quantity: number }[];
  losses: readonly { product: string; name: string; lost: number; found: number }[];
  buy: readonly {
    product: string; name: string; onHand: number; cover: number;
    order: number; why: string; unit: string;
  }[];
  daily: readonly { day: string; quantity: number }[];
}

const report = operation<{ from: string; to: string }, Reported>({
  id: "stock.report",
  kind: "read",
  summary: "What went, what was wrong, and what to buy",
  input: {
    from: field.day({ label: "From", required: true, holds: "none" }),
    to: field.day({ label: "To", required: true, holds: "none" }),
  },
  output: {
    told: field.json({ label: "How it was recorded", holds: "none" }),
    used: field.json({ label: "What left", holds: "none" }),
    losses: field.json({ label: "What was wrong", holds: "none" }),
    buy: field.json({ label: "What to buy", holds: "none" }),
    daily: field.json({ label: "A day at a time", holds: "none" }),
  },
  /*
    ⚠️ `ledger:read`, WHICH IS THE HISTORY'S OWN GRANT AND NOT `stock:read`. Every
    figure here is a reading of the movements — who took what, and what somebody
    corrected — and a person who may see a balance has not necessarily been given
    the record of how it got there.
  */
  permission: "ledger:read",
  idempotency: { mode: "none" },
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;
    const lead = Math.trunc(Number(await c.setting("inventory.lead_days"))) || 7;

    /* ⚠️ BOUNDED BY THE DAY COLUMN, WHICH IS THE DEVICE'S LOCAL DATE. A report
       cut on the server's calendar puts a shift that ended at 01:00 into the
       wrong month for half the world — see `ledger.day`. */
    const moves = await db.prepare(
      /* ⚠️ NARROWED, LIKE EVERY OTHER READ. A report is the one place a whole
         workspace's numbers are added up, so it is the read a narrowed member
         most wants and the one a filter is easiest to leave off. */
      `SELECT move, product, delta, day, against FROM ledger
        WHERE tenant_id = ? AND day >= ? AND day <= ?${only(c).sql}`)
      .bind(c.tenantId, input.from, input.to, ...only(c).bound)
      .all<{ move: string; product: string; delta: number; day: string; against: string | null }>();

    const entries = moves.results.map((row) => ({
      move: String(row.move), product: String(row.product),
      delta: Number(row.delta), day: String(row.day), against: String(row.against ?? ""),
    }));

    /* ⚠️ ONE LOOKUP FOR EVERY NAME ON THE SCREEN. A report that answered with ids
       would make the browser join four lists against a catalogue it may only
       hold fifty rows of. */
    const kinds = await db.prepare(
      `SELECT id, name, unit, par, supplier FROM product WHERE tenant_id = ?`)
      .bind(c.tenantId)
      .all<{
        id: string; name: string; unit: string; par: number | null;
        supplier: string | null;
      }>();
    const named = new Map(kinds.results.map((row) => [String(row.id), row]));
    const nameOf = (id: string) => String(named.get(id)?.name ?? "—");

    /* ⚠️ WHO TO RING, AND HOW LONG THEY TAKE — the two facts that turn "buy 90"
       into an order. Read whole rather than joined per row: a workspace has tens
       of suppliers and hundreds of products, and the alternative is a query per
       line of a report drawn on every visit. */
    const from = await db.prepare(
      `SELECT id, name, leadDays FROM supplier WHERE tenant_id = ?`)
      .bind(c.tenantId).all<{ id: string; name: string; leadDays: number | null }>();
    const supplied = new Map(from.results.map((row) => [String(row.id), row]));

    const balances = await db.prepare(
      /* ⚠️ THE SAME NARROWING AS THE MOVEMENTS ABOVE, and the pair has to agree:
         usage from one site divided by a balance across four is a days-of-cover
         figure that is wrong in the direction that reads as "plenty". */
      `SELECT product, SUM(quantity) AS onHand FROM stock
        WHERE tenant_id = ?${only(c).sql} GROUP BY product`)
      .bind(c.tenantId, ...only(c).bound).all<{ product: string; onHand: number }>();
    const onHand = new Map(balances.results.map((row) => [String(row.product), Number(row.onHand)]));

    const used = usageIn(entries);
    const perProduct = new Map(used.map((one) => [one.product, one.quantity]));
    const days = Math.max(1, dayCount(input.from, input.to));

    return {
      told: toldIn(entries),
      used: used.map((one) => ({ ...one, name: nameOf(one.product) })),
      losses: lossesIn(entries).map((one) => ({ ...one, name: nameOf(one.product) })),
      /*
        ⚠️ EVERY PRODUCT IS WEIGHED, NOT ONLY THE ONES THAT MOVED. A par level is
        a standing statement that something must be on the shelf whether or not
        it moves — a fire extinguisher, a spare fuse — and a reorder list built
        from the movements alone can never mention one.
      */
      buy: reorder(
        kinds.results.map((row) => {
          const of = row.supplier ? supplied.get(String(row.supplier)) : undefined;
          return {
            product: String(row.id),
            onHand: onHand.get(String(row.id)) ?? 0,
            par: Number(row.par ?? 0),
            used: perProduct.get(String(row.id)) ?? 0,
            supplier: String(of?.name ?? ""),
            /* ⚠️ THEIRS WHERE THEY SAID, THE WORKSPACE'S OTHERWISE — and `null`
               rather than `0`, because a supplier who has not been asked how
               long they take is not a supplier who delivers today. */
            leadDays: of?.leadDays ?? null,
          };
        }),
        days, lead,
      ).map((one) => ({
        ...one, name: nameOf(one.product),
        unit: String(named.get(one.product)?.unit ?? "item"),
      })),
      daily: dailyIn(entries, input.from, input.to),
    };
  },
});

/* ⚠️ INCLUSIVE OF BOTH ENDS, because "the first to the seventh" is seven days to
   everybody who is not a computer — and a rate divided by six would report
   consumption about seventeen per cent high. */
const dayCount = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

/* ------------------------------------------------------------- the labels --- */

/**
 * A LABEL FOR SOMETHING THAT HAD NONE.
 *
 * ⚠️ A SHELF HAS NO MANUFACTURER, SO ITS CODE IS ALWAYS OURS — and until
 * something minted one, `location.code` was a column nothing ever filled. That
 * is not a cosmetic gap: the camera moving the session when it sees a place is
 * the single highest-leverage behaviour in the counting flow, and it cannot
 * happen for a shelf nobody has labelled.
 *
 * ⚠️ MINTED WHEN IT IS PRINTED, NOT WHEN THE ROW IS CREATED. A workspace with
 * four hundred locations has not printed four hundred labels, and a code on a
 * shelf nothing is stuck to is a code that resolves to a place somebody cannot
 * find. The act of printing is the act of labelling.
 *
 * ⚠️ AND IT IS NEVER RE-ISSUED. `COALESCE` on a non-empty code, so a second
 * print of the same shelf gives the same string — a re-used label is two places
 * with one history, and a re-numbered one is a printed sticker on a wall that
 * now points at nothing.
 */
const mintLabels = (
  id: string, of: "L" | "P", table: "location" | "product", permission: string,
) => operation<{ ids: readonly string[] }, { items: readonly { id: string; code: string }[] }>({
  id,
  kind: "write",
  summary: `Give ${table === "location" ? "places" : "products"} a label of ours`,
  input: { ids: field.json({ label: "Which", required: true, holds: "none" }) },
  output: { items: field.json({ label: "Labels", holds: "none" }) },
  permission,
  idempotency: { mode: "key" },
  emits: [`${table}.labelled`],
  outcome: { message: "Labelled.", tone: "success", invalidates: [`${table}.list`] },
  fails: ["platform.invalid"],
  audit: (input) => ({ subject: `${(input.ids ?? []).length} row(s)`, verb: "labelled" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;
    const ids = Array.isArray(input.ids) ? input.ids.map((one) => String(one)) : [];
    if (!ids.length) {
      return c.fail("platform.invalid", {}, { fields: { ids: "Choose something to label" } });
    }

    const out: { id: string; code: string }[] = [];
    for (const one of ids) {
      /* ⚠️ ONE AT A TIME AND SCOPED, because a list of ids arrives from a
         browser. A single statement with an `IN` would label whatever the caller
         named, in whichever workspace it happened to live. */
      const row = await db.prepare(
        `SELECT id, code FROM ${table} WHERE id = ? AND tenant_id = ?`)
        .bind(one, c.tenantId).first<{ id: string; code: string | null }>();
      if (!row) continue;
      const code = row.code || ourLabel(of, row.id);
      if (!row.code) {
        await db.prepare(
          `UPDATE ${table} SET code = ?, edited_at = ?, edited_by = ?
            WHERE id = ? AND tenant_id = ? AND (code IS NULL OR code = '')`)
          .bind(code, c.now, c.accountId ?? null, row.id, c.tenantId).run();
      }
      out.push({ id: row.id, code });
    }
    return { items: out };
  },
});

const labelPlaces = mintLabels("location.label", "L", "location", "location:write");

/**
 * A PRODUCT'S OWN LABEL, AND IT GOES IN THE CODE BOOK.
 *
 * ⚠️ NOT A COLUMN ON THE PRODUCT, WHICH IS THE WHOLE DIFFERENCE FROM A SHELF. A
 * place has exactly one code and it is always ours; a product has as many as the
 * world has printed on it — a GTIN, a wholesaler's part number, a national code
 * — and `code` is the one table the camera resolves against. A label written
 * into a column of its own would be a code that resolves to nothing: the scan
 * reads it, the resolver looks in the book, and the product it is stuck to is
 * reported as unknown.
 *
 * ⚠️ AND IT IS MINTED ONCE. `ourLabel` derives the string from the row's id, so
 * a second print of the same product finds the same code already in the book and
 * writes nothing — a re-issued label is a sticker on a box that now points at
 * something else.
 */
const labelThings = operation<
  { ids: readonly string[] }, { items: readonly { id: string; code: string }[] }
>({
  id: "product.label",
  kind: "write",
  summary: "Give products a label of ours",
  input: { ids: field.json({ label: "Which", required: true, holds: "none" }) },
  output: { items: field.json({ label: "Labels", holds: "none" }) },
  permission: "product:write",
  idempotency: { mode: "key" },
  emits: ["product.labelled"],
  outcome: { message: "Labelled.", tone: "success", invalidates: ["code.list"] },
  fails: ["platform.invalid"],
  audit: (input) => ({ subject: `${(input.ids ?? []).length} row(s)`, verb: "labelled" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;
    const ids = Array.isArray(input.ids) ? input.ids.map((one) => String(one)) : [];
    if (!ids.length) {
      return c.fail("platform.invalid", {}, { fields: { ids: "Choose something to label" } });
    }

    const out: { id: string; code: string }[] = [];
    for (const one of ids) {
      /* ⚠️ ONE AT A TIME AND SCOPED, because a list of ids arrives from a
         browser. A single statement with an `IN` would label whatever the caller
         named, in whichever workspace it happened to live. */
      const row = await db.prepare(
        `SELECT id FROM product WHERE id = ? AND tenant_id = ?`)
        .bind(one, c.tenantId).first<{ id: string }>();
      if (!row) continue;

      const code = ourLabel("P", row.id);
      const already = await db.prepare(
        `SELECT id FROM code WHERE tenant_id = ? AND value = ?`)
        .bind(c.tenantId, code).first<{ id: string }>();
      if (!already) {
        await db.prepare(
          `INSERT INTO code (id, tenant_id, product, value, kind, pack, source, at, by)
            VALUES (?, ?, ?, ?, 'ours', 1, 'minted', ?, ?)`)
          .bind(newId("code", new Date(c.now)), c.tenantId, row.id, code, c.now,
            c.accountId ?? null).run();
      }
      out.push({ id: row.id, code });
    }
    return { items: out };
  },
});

/* ------------------------------------------------------------ the morning --- */

/**
 * WHAT CROSSED A LINE WHILE NOBODY WAS LOOKING.
 *
 * ⚠️ AN EXPIRY NOBODY IS TOLD ABOUT IS MOST OF THE REASON NOBODY RECORDS ONE.
 * `batch.due` and `unit.due` have answered on demand since the day they were
 * written, and answering on demand means a person has to already suspect. The
 * whole value of writing a date on a delivery is that something else remembers
 * it — otherwise the product has asked somebody to type in a fact and then made
 * them responsible for reading it back.
 *
 * ⚠️ IT TELLS ABOUT CROSSINGS, NEVER ABOUT STATES — see `crossedOn`. A sweep
 * that announced the LIST would announce the same twelve boxes every morning
 * until they expired, and the third morning is when somebody switches the
 * product's notifications off for good.
 *
 * ⚠️ AND ONE NOTE PER PASS, NOT ONE PER BOX. A pharmacy crossing forty lots in a
 * night would otherwise fill an inbox with forty rows nobody can act on
 * individually — the number and the soonest are what a person needs to decide
 * whether to walk to the store room, and the list is on the screen the note
 * links to.
 */
interface Crossing {
  readonly name: string;
  readonly on: string;
}

/* ⚠️ THE PLURAL IS COMPOSED HERE, BECAUSE `interpolate` HAS NO PLURAL RULE AND
   should not grow one for this. "1 things expire soon" is the kind of sentence
   that makes a person trust nothing else on the screen. */
const many = (n: number, one: string, more: string): string =>
  `${n} ${n === 1 ? one : more}`;

/* ⚠️ SOONEST FIRST, AND THE NOTE NAMES ONLY THAT ONE. It is the row that decides
   whether somebody goes and looks now or after lunch. */
const first = (of: readonly Crossing[]): Crossing =>
  [...of].sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0))[0]!;

const expirySweep = declareJob({
  id: "inventory.expiry",
  label: "What runs out",
  why: "Tells whoever looks after the stock what has just entered its warning window, what went out of date overnight, and what is due for a service.",
  /*
    ⚠️ EARLY MORNING UTC, WHICH IS A COMPROMISE AND IS SAID TO BE ONE. A
    workspace's day starts wherever it is standing, and the platform has no
    per-workspace timezone to run against; 05:00 UTC is before the working day
    across Europe, the Gulf and India, and is the evening before in the Americas
    — which errs towards telling somebody early rather than after they have
    already used the box.
  */
  schedule: "0 5 * * *",
  scope: "per-tenant",
  /*
    ⚠️ RETRY, AND IT IS SAFE BECAUSE THE ANSWER IS ARITHMETIC. `crossedOn` reads
    the dates and remembers nothing, so a second attempt in the same pass names
    exactly the same batches — the only cost of a retry is a repeated note in the
    narrow case where the first attempt failed after telling somebody, and that
    is strictly better than a crossing nobody hears about at all.
  */
  onFail: { then: "retry", times: 3 },
  rerunnable: true,
  emits: ["batch.expiring", "batch.expired", "unit.service_due"],
  budgetSeconds: 30,
  async work(ctx) {
    const db = ctx.db as Db;
    /*
      ⚠️ THE DAY IS THE SWEEP'S OWN, AND THIS IS THE ONE PLACE IN THE PRODUCT
      WHERE IT CANNOT BE THE DEVICE'S. Every other expiry question is asked by
      somebody standing in front of a shelf and carries their local date;
      nobody is standing here. UTC is therefore named rather than assumed, and
      it is why the schedule above sits before the working day rather than at
      midnight.
    */
    const today = ctx.now.slice(0, 10);
    /* ⚠️ THE WORKSPACE'S OWN NUMBERS, NOT A CONSTANT. Three days for a kitchen,
       ninety for a pharmacy — and the declared fallback is the platform's, so
       the `||` here is against a blank row rather than a second answer. */
    const warn = Math.trunc(Number(await ctx.setting?.("inventory.warn_days"))) || 30;
    const service = Math.trunc(Number(await ctx.setting?.("inventory.service_days"))) || 30;

    const soon: Crossing[] = [];
    const gone: Crossing[] = [];

    const batches = await db.prepare(
      `SELECT b.printed AS printed, b.opened AS opened, b.made AS made, b.received AS received,
              p.name AS name, p.openDays AS openDays, p.shelfDays AS shelfDays
         FROM batch b JOIN product p ON p.id = b.product
        WHERE b.tenant_id = ?`)
      .bind(ctx.tenantId)
      .all<{ printed: string | null; opened: string | null; made: string | null;
        received: string | null; name: string;
        openDays: number | null; shelfDays: number | null }>();

    for (const row of batches.results) {
      /* ⚠️ THE SAME COMPOSITION `batch.due` READS, and it has to be: a sweep
         that only looked at the printed date would say nothing about a box
         opened last month with a 2028 date on it, or one whose label carries a
         manufacture date and nothing else — which is what the four clocks are
         for. Two readings of the same question is how a screen and a
         notification come to disagree about which shelf needs somebody. */
      const ends = effectiveExpiry({
        printed: row.printed,
        made: row.made && row.shelfDays ? { on: row.made, days: row.shelfDays } : null,
        opened: row.opened && row.openDays ? { on: row.opened, days: row.openDays } : null,
      });
      if (!ends) continue;
      const crossed = crossedOn({ on: ends.on, since: row.received }, today, warn);
      if (crossed === "soon") soon.push({ name: row.name, on: ends.on });
      else if (crossed === "gone") gone.push({ name: row.name, on: ends.on });
    }

    const services: Crossing[] = [];
    const units = await db.prepare(
      /* ⚠️ RETIRED ONES ARE OUT, exactly as `unit.due` leaves them out. A
         condemned machine is never due for service, and a note about one is a
         note that cannot be acted on.

         ⚠️ AND IT IS NOT NARROWED, BECAUSE A JOB HAS NO CALLER. The night sweep
         runs for the workspace rather than for a person, so there is nobody to
         narrow to — and a service that came due at the site nobody was awake for
         is exactly the one that has to be raised. Who is TOLD is the
         notification's own audience question, one layer up. */
      `SELECT u.due AS due, p.name AS name
         FROM unit u JOIN product p ON p.id = u.product
        WHERE u.tenant_id = ? AND u.due IS NOT NULL AND u.life <> 'retired'`)
      .bind(ctx.tenantId)
      .all<{ due: string; name: string }>();

    for (const row of units.results) {
      /* ⚠️ NO `since` HERE — see `crossedOn`. A service interval is set once and
         counted forward, so its window always opens while the machine is
         already standing here. */
      if (crossedOn({ on: row.due }, today, service)) services.push({ name: row.name, on: row.due });
    }

    if (soon.length) {
      await ctx.tell?.("batch.expiring", {
        count: many(soon.length, "thing", "things"), name: first(soon).name,
        on: first(soon).on, days: String(warn),
      });
    }
    if (gone.length) {
      await ctx.tell?.("batch.expired", {
        count: many(gone.length, "thing", "things"), name: first(gone).name, on: first(gone).on,
      });
    }
    if (services.length) {
      await ctx.tell?.("unit.service_due", {
        count: many(services.length, "item", "items"),
        name: first(services).name, on: first(services).on,
      });
    }

    const touched = soon.length + gone.length + services.length;
    /* ⚠️ THE DETAIL IS WHAT AN OPERATOR READS WHEN SOMEBODY SAYS THEY WERE NOT
       TOLD. "0 workspaces" and "told nobody, nothing crossed" look identical in
       a console that only reports a count. */
    return {
      touched,
      detail: touched
        ? `${soon.length} soon, ${gone.length} out of date, ${services.length} for service`
        : "nothing crossed",
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
  /*
    ⚠️ AMBER, AND IT IS THE COLOUR OF THE THING ITSELF. An inventory is cardboard
    under a warehouse light: sodium, kraft, the sticker on the box. Reaching for
    a blue would have been reaching for the colour every business product picks
    when nobody has decided anything.

    ⚠️ AND IT IS NAMED ONCE, HERE — see `AppSpec.hue`. The ground, the source in
    it, the wash on every card and the halo under a heading are all this value
    through the scene engine's `lit` slot, so the product's colour is one line
    rather than a decision repeated per screen and drifting.

    ⚠️ HIGH LIGHTNESS AND REAL CHROMA, BECAUSE IT IS A LIGHT BEFORE IT IS A
    PAINT. `neon` mixes it most of the way to white for the core of its band and
    keeps it whole for the bloom; an amber tuned as a surface colour — darker,
    duller — gives a band that reads as brown and a wash with nothing in it.
  */
  hue: "oklch(0.79 0.16 68)",

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
      /*
        ⚠️ RUNNING A PROCESS AND RELEASING WHAT IT PRODUCED ARE DIFFERENT GRANTS,
        and it is the same rule as taking against correcting one level up. The
        person loading the autoclave and the person qualified to say its output
        may be used on somebody are frequently not the same person; where they
        are, the workspace grants both — sharing one permission takes that
        decision away and calls it simplicity.
      */
      "process:read", "process:run", "process:release",
    ],
    roles: {
      /* ⚠️ The one who looks after the stock: receives, corrects, edits the
         catalogue, reads the history. */
      keeper: [
        "product:read", "product:write", "location:read", "location:write",
        "stock:read", "stock:move", "stock:adjust", "ledger:read",
        "process:read", "process:run", "process:release",
      ],
      /* ⚠️ THE COMMON ROLE, and the reason the split above exists. Most people
         in most workspaces only ever take things. */
      /* ⚠️ RUNS BUT DOES NOT RELEASE. Loading a machine is ordinary work; saying
         its output may be used is the judgement the rail exists for. */
      user: [
        "product:read", "location:read", "stock:read", "stock:move",
        "process:read", "process:run",
      ],
      viewer: [
        "product:read", "location:read", "stock:read", "ledger:read", "process:read",
      ],
    },
    /*
      ⚠️ SHAPES A WORKSPACE STARTS FROM, AND THIS IS WHAT A PROFILE IS ACTUALLY
      FOR. The three declared roles are the app's and every workspace has them;
      these are the jobs this product knows exist in the settings it serves, and
      a workspace COPIES one into a role of its own and then owns it.

      ⚠️ THE BASEMENT IS THE ONE TO READ. `alone` holds no `process:*` key at
      all, so the Work destination is not DRAWN for somebody on it — which is the
      difference between a screen that is hidden and a screen that is not
      reachable, and it is why a profile that only seeded defaults was less than
      the help beside it described.

      ⚠️ AND NONE OF THEM CAN BE ADOPTED BY SOMEBODY WHO DOES NOT HOLD THE KEYS.
      `refuseRole`'s `beyond_you` is checked on the write, not here — a preset is
      an offer, and the ceiling is the person pressing the button.
    */
    presets: [
      {
        id: "alone", name: "On your own",
        said: "One person, one store room. No runs, no releases, no history to read.",
        permissions: [
          "product:read", "product:write", "location:read", "location:write",
          "stock:read", "stock:move", "stock:adjust",
        ],
      },
      {
        id: "floor", name: "On the floor",
        said: "Takes things and counts them. Cannot correct a number or read the history.",
        permissions: ["product:read", "location:read", "stock:read", "stock:move"],
      },
      {
        id: "goods-in", name: "Goods in",
        said: "Receives deliveries and names what nobody has seen before.",
        permissions: [
          "product:read", "product:write", "location:read", "stock:read", "stock:move",
        ],
      },
      {
        id: "auditor", name: "Counts and checks",
        said: "Counts, settles a count, and reads every movement. Runs nothing.",
        permissions: [
          "product:read", "location:read", "stock:read", "stock:move", "stock:adjust",
          "ledger:read",
        ],
      },
      {
        id: "operator", name: "Runs the machine",
        said: "Loads and ends a run. Somebody else signs for what comes out.",
        permissions: [
          "product:read", "location:read", "stock:read", "stock:move",
          "process:read", "process:run",
        ],
      },
      {
        id: "signs-off", name: "Signs it off",
        said: "Releases a load, fails one, and calls one back. The judgement the rail exists for.",
        permissions: [
          "product:read", "location:read", "stock:read", "ledger:read",
          "process:read", "process:run", "process:release",
        ],
      },
    ],
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
  /*
    ⚠️ A BUSINESS IS NOT ALWAYS ONE PLACE, AND THIS IS THE PRODUCT WHERE THAT
    BITES FIRST. A goods-in person at the second site could see, move and count
    the first site's stock — nothing refused, nothing logged, and the app looked
    like it was working. `reach` narrows a membership to part of the workspace,
    and here the parts are the locations a workspace already keeps rather than a
    second list somebody has to keep in step.

    ⚠️ AND IT NESTS, WHICH IS THE WHOLE OF WHY IT IS USABLE. A grant to Northgate
    reaches every aisle, rack and bin under it — including the ones added next
    week — so narrowing somebody is one press rather than four hundred.
  */
  reach: {
    of: "location",
    nests: "within",
    label: { one: "Location", many: "Locations" },
  },

  entitlements: {
    products: { label: "Products", withheld: "quota" },
    locations: { label: "Locations", withheld: "quota" },
    /*
      ⚠️ `gate` RATHER THAN `quota`, BECAUSE THESE ARE CAPABILITIES AND NOT
      COUNTS. A workspace either does regulated runs or it does not, and there is
      no number of sterilisation cycles that makes sense as a monthly allowance.

      ⚠️ AND ADDING THEM IS A RED BUILD UNTIL EVERY TIER PRICES THEM. That is the
      feature: a key no plan mentions resolves to `false` for everybody, so the
      capability is built, gated, and sold to nobody — silently, on every tier.
    */
    processes: { label: "Runs and releases", withheld: "gate" },
    jobs: { label: "Jobs", withheld: "gate" },
    /*
      ⚠️ A GATE, BECAUSE IT IS A CAPABILITY AND NOT A COUNT. Nobody types in
      eight hundred products, and a product without an import is one that is
      evaluated for an afternoon and abandoned — which makes this the key that
      decides whether a workspace ever arrives, rather than one that meters what
      they do after.
    */
    imports: { label: "Import a spreadsheet", withheld: "gate" },
  },

  collections: [
    product, supplier, code, location, batch, unit, kit, process, processItem, job,
    count, tally, stock, ledger, shot, tag, tagging, sourcing,
  ],
  operations: [
    resembling, register,
    receive, take, adjust, arrive, undo, starts, resolve, learn, open, due,
    openCount, tallyUp, differs, closeCount,
    issue, giveBack, serve, retire, dueService,
    assemble, putIn, takeOut, checking, build, breakUp,
    identify, readLabel, seeProduct, readNote, askInWords,
    openRun, loadRun, endRun, releaseRun, failRun, recallRun, liftHold, lateResult,
    openJob, closeJob, traceJob,
    labelPlaces, labelThings, report, seeImport, doImport,
  ],

  /*
    ⚠️ THE SCREENS THIS STAGE ACTUALLY HAS. A declared screen with nothing
    mounted renders an honest notice, which is the right state for a screen whose
    container is not written — and the wrong state for five nav destinations at
    once, which is a product that looks broken rather than unfinished.
  */
  screens: [
    /*
      ⚠️ THE ROOT IS WHAT SOMEBODY IS HERE TO FIND OUT, AND IT IS NOT A LIST.
      Stock was the first destination for as long as this product had four
      screens, which made the answer to "is everything all right" a page of rows
      somebody has to read. Home answers it in a figure and three counts, and
      the list it replaced is one tap away with its own name on it.

      ⚠️ AND IT IS `stock:read`, THE SAME GRANT THE SHELF ASKS FOR. Home is the
      shelf summarised; a root anybody could open would be a root that shows
      most people an empty screen.
    */
    /*
      ⚠️ AND IT IS THE ONE SCREEN IN THE PRODUCT THAT WEARS THE LIGHT. `neon` is
      a hard bright source on black that washes the surfaces standing in it —
      which is exactly right for the screen somebody opens the app onto and wrong
      for every screen they then work on. Ambience everywhere is ambience
      nowhere; a home that is lit is only lit because a shelf list is not.
    */
    { id: "home", route: "/", label: "Home", nav: "primary", icon: "home",
      permission: "stock:read", sky: "neon" },
    { id: "stock", route: "/stock", label: "Stock", nav: "primary", icon: "box",
      permission: "stock:read" },
    /* ⚠️ A PRIMARY DESTINATION, BECAUSE IT IS THE GESTURE THE PRODUCT IS FOR.
       Filed under Stock as a button it would be one press further away than
       typing, which is the whole thing scanning exists to beat.

       ⚠️ AND `plain`, DELIBERATELY. The camera fills the screen, and an ambience
       behind a live video is a pattern nobody sees competing with the one thing
       somebody is looking at. */
    { id: "scan", route: "/scan", label: "Scan", nav: "primary", icon: "scan",
      permission: "product:read" },
    /*
      ⚠️ STOCK'S OWN ACTION, NOT A DESTINATION — and the two are not the same
      claim. Receiving is a job somebody does for twenty minutes with a trolley
      beside them, and it is a job about the shelf they are looking at: it starts
      from Stock, it ends in Stock, and it is what the button in Stock's chrome
      says. A slot in the bar would put it beside the four things somebody
      navigates BETWEEN, which is a different question from what they are here to
      do.

      ⚠️ IT KEEPS ITS OWN ADDRESS, because it is a session rather than a sheet.
      Somebody scanning forty boxes must be able to come back to where they were,
      and a modal has no address to come back to.
    */
    /*
      ⚠️ A PAGE RATHER THAN A SHEET, AND THE LENGTH IS WHY. Registering a product
      is photographs, a name, tags, several barcodes, how it is counted, how it
      keeps and who it is bought from — a form that scrolls for a while and is
      worth coming back to. A drawer is the right shape for a question the size
      of what it asks; put a form in one and the height, the scroll and the
      keyboard all fight each other on a phone.

      ⚠️ AND AN ADDRESS IS THE HALF A DRAWER CANNOT HAVE. A page can be linked to
      from an empty catalogue, a checklist step and a scan that resolved to
      nothing; it survives a reload, a share and the back gesture, and going back
      lands where you came from rather than nowhere.
    */
    /*
      ⚠️ `neon`, WHICH IS HOME'S, AND IT IS THE ONE OTHER SCREEN THAT MAY WEAR IT.
      The note above says ambience everywhere is ambience nowhere, and that still
      holds — this is not a second lit screen so much as the same one continuing.
      Registering is the FIRST ACTION ON HOME: press it and the sky going out is
      the light dropping on the step after the one somebody was standing in, which
      reads as having left the product rather than as having gone one level in.
      Every other screen here is work over a shelf and stays plain.
    */
    { id: "register", route: "/register", label: "Add a product", nav: "none",
      icon: "add", permission: "product:write", sky: "neon" },
    { id: "receive", route: "/receive", label: "Receive", nav: "none", icon: "add",
      permission: "stock:move" },
    /* ⚠️ A COUNT IS A JOB SOMEBODY SPENDS AN AFTERNOON ON, so it is a
       destination rather than a mode. `stock:move` because counting is open to
       everybody — it is SETTLING one that needs `stock:adjust`, which the
       operation asks for rather than the nav. */
    { id: "count", route: "/count", label: "Count", nav: "primary", icon: "tally",
      permission: "stock:move" },
    /*
      ⚠️ THE ONE DESTINATION A BASEMENT NEVER OPENS.
      Runs and jobs are the regulated half of this product — a workshop tracking
      work orders, a clinic releasing sterilisation loads — and nobody storing
      paint in a garage.

      ⚠️ SO IT IS GATED ON THE PLAN AND NOT ONLY ON THE ROLE. `process:read` says
      this person may see runs in a workspace that does them; `processes` says
      the workspace does them at all. On the role alone an owner was offered a
      destination wherever they were — including on a tier that never bought runs
      — and the screen's only answer was to report the refusal its own operations
      raised. A nav slot is the scarcest thing this product has (five, D10), and
      spending one on an apology is the worst use of it.

      ⚠️ AND IT NAMES BOTH KEYS, BECAUSE IT IS ABOUT BOTH. A run is a batch
      passing through a machine and a job is a context consuming one; the tier
      that has work orders and no release rail is a real customer, and gating
      this page on runs alone would take their work orders with it. The two
      screens beneath name one key each, because each is about one thing — and
      they are gated at all because a detail screen is reachable by typing.
    */
    { id: "work", route: "/work", label: "Work", nav: "primary", icon: "list",
      permission: "process:read", features: ["processes", "jobs"] },
    { id: "run", route: "/run", label: "A run", nav: "none", icon: "check",
      permission: "process:read", features: ["processes"] },
    { id: "case", route: "/case", label: "A job", nav: "none", icon: "note",
      permission: "process:read", features: ["jobs"] },
    /* ⚠️ `etch` — ruled geometry, which is what a shelf is. Seeded on the
       location, so every shelf in the workspace has a ground of its own. */
    { id: "location", route: "/where", label: "A location", nav: "none", icon: "pin",
      permission: "location:read", sky: "etch" },
    { id: "product", route: "/thing", label: "A product", nav: "none", icon: "box",
      permission: "product:read" },
    /* ⚠️ ONE OBJECT, AND IT IS A DESTINATION RATHER THAN A SHEET. Its history is
       the point of it — where it has been, who had it, when it was serviced —
       and a life somebody has to hold a sheet open to read is a life nobody
       reads. */
    { id: "unit", route: "/item", label: "An item", nav: "none", icon: "tag",
      permission: "stock:read" },
    { id: "kit", route: "/kit", label: "A kit", nav: "none", icon: "layers",
      permission: "stock:read" },
    /* ⚠️ `glow` — pure light, no marks, which is what an arrival wants. */
    /* ⚠️ ITS OWN DESTINATION RATHER THAN A SECOND FIELD ON `Scan`. Both screens
       are "tell me about this" and the gestures could not be less alike: one is
       a camera and one is a sentence, and a screen with a code box beside a
       question box is a screen where half the questions are scanned.

       ⚠️ AND `sparkle`, WHICH IS RESERVED FOR EXACTLY THIS. It is the one mark
       in the product that means a model made something, and this is the one
       surface whose whole content a model made. */
    /*
      ⚠️ WHERE EVERY NOTE THE NIGHT SENDS LANDS, AND IT HAD TO EXIST BEFORE THEY
      COULD. `batch.due` and `unit.due` answered per product and per item, so
      "what runs out" was a question the product could answer and had nowhere to
      show — and a notification pointing at a screen that does not show what it
      is about is the dead-link failure one level up, where nothing catches it.

      ⚠️ SECONDARY, BECAUSE IT IS READ WHEN SOMETHING SAYS TO READ IT. Making it
      a sixth primary would take a thumb-reachable slot from a gesture somebody
      performs fifty times a day and give it to a list they open twice a week.
    */
    /* ⚠️ WHAT STOCK IS ABOUT, NARROWED — so it is reached from Stock and from
       the note that raised it, never from a menu. It is the same records under
       one question, and a destination beside Stock would be Stock twice. */
    { id: "due", route: "/due", label: "Running out", nav: "none", icon: "alert",
      permission: "stock:read" },
    /*
      ⚠️ SECONDARY, AND IT IS A DESTINATION RATHER THAN A BUTTON ON FOUR OTHER
      SCREENS. Labelling is a session — somebody stands at a printer with a roll
      of stock and does forty of them — and a print button on each subject's own
      screen would make that forty round trips through four different lists.

      ⚠️ `location:read` IS THE FLOOR, not `location:write`. Anybody may look at
      the sheet; MINTING a code is what the two operations behind it ask for, and
      a screen gated on the stronger grant would hide the item tags — which need
      no minting at all — from everybody who cannot edit the catalogue.
    */
    /* ⚠️ REACHED FROM WHAT IS BEING LABELLED — a location, a product, an item —
       because that is where somebody is standing when they want one. The session
       is still a session: forty labels at a printer, on one address. */
    { id: "labels", route: "/labels", label: "Labels", nav: "none", icon: "tag",
      permission: "location:read" },
    /*
      ⚠️ `etch` — RULED GEOMETRY, WHICH IS WHAT A SHELF IS. The ambience families
      point monitoring at it, and a shelf grid is what it draws anyway; a report
      screen is the one surface in this product where a ground is doing something
      rather than decorating.

      ⚠️ AND `ledger:read`, WHICH THE COMMON ROLE DOES NOT HOLD. Every figure here
      reads the record of who took what — a person who may see a balance has not
      necessarily been given the history behind it, and the nav is what says so.
    */
    /*
      ⚠️ AND NOT A DESTINATION, since Home carries the same numbers cut down to
      what a first screen holds. A bar seat for a screen most of whose figures
      are already on the root is the bar answering "where am I" with two places
      that are the same place — and the seat it gave up went to the root itself.
    */
    { id: "reports", route: "/reports", label: "Reports", nav: "none", icon: "chart",
      permission: "ledger:read", sky: "etch" },
    /* ⚠️ NOT A DESTINATION — THE CHROME'S OWN BUTTON, beside the notifications.
       Asking is something somebody does FROM wherever they are, about whatever
       they are looking at; a slot in the bar would make it a place to go first
       and then say what you wanted, which is one step longer from every screen
       in the product. */
    { id: "ask", route: "/ask", label: "Ask", nav: "none", chrome: "assistant", icon: "sparkle",
      permission: "stock:read", sky: "glow" },
    /*
      ⚠️ A DESTINATION RATHER THAN A STEP IN A WIZARD, and it is the screen that
      decides whether a workspace ever exists. Nobody types in eight hundred
      products; every real customer arrives holding a spreadsheet, and one they
      can only bring in during the first five minutes is one most of them will
      bring in never.

      ⚠️ `product:write` RATHER THAN `stock:adjust`, WHICH THE OPERATION ASKS FOR.
      Importing a catalogue is a catalogue act; importing QUANTITIES sets
      balances, and the write cannot know which it is until it has read the
      sheet. Every role that holds one of the two holds the other, so the split
      is a statement about the act rather than a door somebody is caught behind.
    */
    /* ⚠️ `file` RATHER THAN `add`, WHICH RECEIVE ALREADY HAS. Two nav-visible
       screens of one app wearing one mark is a bar that cannot answer where you
       are — and this is a spreadsheet, not a plus. */
    /* ⚠️ THE CATALOGUE'S OWN ACT, so it is reached from the catalogue and from
       the guide that asks for it. Somebody imports a spreadsheet once, in their
       first hour; a permanent slot for it is a slot spent on a day nobody
       repeats. */
    { id: "import", route: "/import", label: "Import", nav: "none", icon: "file",
      permission: "product:write", features: ["imports"] },
    /* ⚠️ THE LAST STEP OF THE REORDER REPORT'S OWN WORKFLOW. That screen can say
       what to buy and how long the shelf lasts; without this it cannot say who
       to ring, and the decision it worked out is finished somewhere else. */
    /* ⚠️ REACHED FROM THE PRODUCT IT SUPPLIES, and from the reorder report that
       worked out who to ring. A supplier is a fact about something on a shelf
       rather than a place in the product. */
    { id: "supplier", route: "/suppliers", label: "Suppliers", nav: "none",
      /* ⚠️ NOT `box` — that is Stock's, and both are in the nav. A supplier is
         somebody you ring rather than something on a shelf. */
      icon: "people", permission: "product:write" },
    /* ⚠️ THE GUIDE IS ABOUT THE WORKSPACE, NOT ABOUT A SHELF — and it stops
       being wanted the week it is finished. It is reached from what is not done
       yet; a permanent slot for it is a slot every experienced person carries
       for ever. */
    { id: "start", route: "/start", label: "Getting started", nav: "none", icon: "star",
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
    /*
      ⚠️ ONE REFUSAL FOR EVERY REASON AN UNDO IS NO LONGER AN UNDO — not yours,
      not the last one, or long enough ago that the number people are working
      from has moved on. They are one sentence because the ANSWER is one
      sentence: this is a correction now, and a correction says why.
    */
    "inventory.late": {
      status: 409, retryable: false, tone: "warning",
      title: "That cannot be taken back",
      detail: "Undo is for the last thing you just did. Correct it instead, and say why.",
    },
    /*
      ⚠️ TWO SESSIONS ON ONE SHELF IS DOUBLE COUNTING, and the refusal carries
      WHEN rather than who: "somebody is counting this" is actionable, and
      "somebody was counting this three weeks ago" is a session to close.
    */
    "inventory.counting": {
      status: 409, retryable: false, tone: "warning",
      title: "Somebody is already counting this shelf",
      detail: "It was opened at {since}. Close that count before starting another.",
    },
    /*
      ⚠️ A CLOSED COUNT IS FINISHED. Its differences have already become
      corrections in the history, and adding to it afterwards would make those
      corrections describe a count that no longer exists.
    */
    "inventory.closed": {
      status: 409, retryable: false, tone: "warning",
      title: "That count is closed",
      detail: "Start another one to count the shelf again.",
    },
    /*
      ⚠️ A BATCHED PRODUCT IS COUNTED PER DELIVERY OR NOT AT ALL. The shelf holds
      it as one row per lot, so a tally against the product alone would make the
      close report both lots as wrong and the product as newly appeared. The lot
      is printed on the box the person is holding.
    */
    "inventory.needsLot": {
      status: 422, retryable: true, tone: "warning",
      title: "This one is counted by delivery",
      detail: "Scan the label with the lot number on it, or the square code.",
    },
    "inventory.taken": {
      status: 409, retryable: false, tone: "warning",
      title: "That code belongs to something else",
      detail: "Open the product it is on and check which one is right.",
    },
    /*
      ⚠️ A RESEMBLANCE IS A QUESTION, AND THIS IS THE BACKSTOP FOR WHEN NOBODY
      WAS ASKED IT. The sheet shows what a name looks like while it is being
      typed; a queued write replaying, an agent or a second tab never saw that
      list, and a catalogue fills with duplicates one careful person at a time.
      Retryable, because the retry is the same request with the answer in it.
    */
    "inventory.resembles": {
      status: 409, retryable: true, tone: "warning",
      title: "You already have one called that",
      detail: "\"{name}\" is here under the same brand. Open it, or register this one anyway.",
    },
    /*
      ⚠️ ONE REFUSAL FOR EVERY ACT AN OBJECT'S STANDING FORBIDS, and the sentence
      comes from the rule rather than from each handler. Issuing something
      already out, taking back something nobody took and retiring something in
      somebody's van are three mistakes with three fixes — so the WHY is the
      variable and the shape is one.
    */
    "inventory.wrongLife": {
      status: 409, retryable: false, tone: "warning",
      title: "Not while it is where it is",
      detail: "{why}.",
    },
    /*
      ⚠️ THE ONLY TRUE STATEMENT THIS PRODUCT CAN MAKE ABOUT SAMENESS. Every
      other code names a type, so the same code twice is two things; ours names
      one object, so the same label twice is the same object — and saying so is
      the whole reason an itemised thing carries a label of ours.
    */
    "inventory.already": {
      status: 409, retryable: false, tone: "warning",
      title: "You have counted that one",
      detail: "It is already on this shelf's list. Nothing was added.",
    },
    /*
      ⚠️ A BUILD IS A CLAIM SOMEBODY PUTS THEIR NAME TO. "This tray is complete"
      said over a tray missing an instrument is the failure the whole record
      exists to prevent, so the refusal names how many lines are short — the
      person is standing in front of it and the next thing they do is go and
      find them.
    */
    "inventory.incomplete": {
      status: 409, retryable: false, tone: "warning",
      title: "Something is missing",
      detail: "{missing} of the things this kit holds are not in it yet.",
    },
    /*
      ⚠️ AN OBJECT IS IN ONE KIT OR NONE. Moving it silently would empty another
      tray that still reads complete — which is the same lie as a build over a
      missing instrument, arriving from the other direction.
    */
    "inventory.inKit": {
      status: 409, retryable: false, tone: "warning",
      title: "It is in another kit",
      detail: "Take it out of that one first.",
    },
    /*
      ⚠️ A KIT THAT WAS BROKEN UP IS FINISHED, and its identity is not re-used —
      a tray recorded as sterile in March must never be the same record as one
      assembled in August.
    */
    /*
      ⚠️ ONE REFUSAL FOR EVERY ACT A RUN'S STANDING FORBIDS. Releasing something
      that has not finished, failing something already decided, recalling a run
      that released nothing — three mistakes with three fixes, so the WHY is the
      variable and the shape is one.
    */
    "inventory.wrongRun": {
      status: 409, retryable: false, tone: "warning",
      title: "Not at this point in the run",
      detail: "{why}.",
    },
    /*
      ⚠️ A LATE RESULT THAT CONTRADICTS AN EARLIER ONE IS REFUSED, NEVER APPLIED,
      and this is the rule the whole record exists to protect. A pass landing on
      a failed run un-fails something somebody already acted on; one landing on a
      recalled run erases the evidence the recall was justified by. Two facts
      disagree, and a person has to look at both.
    */
    "inventory.contradicts": {
      status: 409, retryable: false, tone: "danger",
      title: "That contradicts what is recorded",
      detail: "The run is {was} and this result says {said}. Nothing was changed.",
    },
    /*
      ⚠️ A QUARANTINE THAT DOES NOT REFUSE A TAKE IS A BADGE ON A SCREEN. The
      shelf hands the box over, somebody uses it, and the record says it was held
      the whole time — which is worse than not holding it at all.
    */
    "inventory.held": {
      status: 409, retryable: false, tone: "danger",
      title: "That lot is frozen",
      detail: "A run it was in was failed or called back. It cannot be used.",
    },
    "inventory.wrongKit": {
      status: 409, retryable: false, tone: "warning",
      title: "Not while it is where it is",
      detail: "{why}.",
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
    /*
      ⚠️ IT SEEDS AND IT DOES NOT GOVERN, AND THAT SPLIT IS DELIBERATE. What a
      new product starts as and which words this workspace uses are settings, at
      `tenant:manage`. WHO MAY DO WHAT is a governance act at `member:manage`,
      and the two are different authorities on purpose — a product setting that
      quietly rewrote a roster's permissions would be a product update minting
      access.

      ⚠️ SO THE ROLES ARE `access.presets`, ADOPTED FROM THE PEOPLE SCREEN. That
      is where a basement's Work destination actually stops being reachable —
      `alone` holds no `process:*` key, so the nav does not draw it — and it goes
      through the same bounded write anybody composing a role goes through.
    */
    "inventory.profile": setting({
      id: "inventory.profile", level: "tenant", area: "stock",
      field: field.enum({
        label: "What this is for", holds: "none",
        /* ⚠️ THE LIST IS `words.ts`'s, because every one of them has to have a
           vocabulary — a value declared here and missing there is a workspace
           whose headings quietly fall back to somebody else's. */
        values: [...PROFILES],
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
    /*
      ⚠️ ITS OWN THRESHOLD, AND SHARING THE EXPIRY ONE WOULD BE WRONG IN BOTH
      DIRECTIONS. A kitchen wants three days' notice on cream and three days on a
      fire extinguisher is useless — an annual inspection has to be booked weeks
      out. One number for two clocks makes one of them a list nobody can act on.
    */
    "inventory.service_days": setting({
      id: "inventory.service_days", level: "tenant", area: "stock",
      field: field.number({ label: "Tell me before a service", holds: "none", min: 0, max: 3_650 }),
      fallback: 30, needs: "tenant:manage",
      help: "An annual inspection wants booking weeks out.",
    }),
    /*
      ⚠️ HOW LONG A DELIVERY TAKES, AND IT IS THE WHOLE REORDER REPORT. "Is it
      low" is the wrong question: a product with two weeks of stock and a
      three-week lead time is out before the order lands, and one with two days
      and a next-day supplier is fine. Without this number the list is ordered by
      how little is left, which is how a store room runs out of the one thing
      that takes a month to get.
    */
    "inventory.lead_days": setting({
      id: "inventory.lead_days", level: "tenant", area: "stock",
      field: field.number({ label: "A delivery takes", holds: "none", min: 0, max: 365 }),
      fallback: 7, needs: "tenant:manage",
      help: "Days from ordering to it arriving. Use the slowest supplier you have.",
    }),
    "inventory.default_unit": setting({
      id: "inventory.default_unit", level: "tenant", area: "stock",
      field: field.text({ label: "Counted in", holds: "none", max: 24 }),
      fallback: "item", needs: "tenant:manage",
      help: "Most places count boxes. A pharmacy counts tablets.",
    }),
  },

  /* ⚠️ THE ONE JOB, AND IT IS WHAT MAKES A RECORDED EXPIRY WORTH RECORDING. */
  jobs: { "inventory.expiry": expirySweep },

  /*
    ⚠️ THE AUDIENCE IS A PERMISSION, NEVER A ROLE. A workspace that makes a role
    of its own — "night supervisor" — must still be told, and a book addressed to
    `keeper` stops reaching anybody the moment somebody does that, silently,
    with the dispatch reporting success over an empty audience.

    ⚠️ AND EVERY `link` IS A DECLARED ROUTE. Four of Scena's pointed at a screen
    that did not exist and an integration test was PINNING the bug — it passed
    for as long as nothing rendered a notification, which is the whole of the
    time before anybody could have noticed.
  */
  notifications: {
    /*
      ⚠️ NO PUSH, DELIBERATELY, AND IT IS THE LINE BETWEEN THE TWO EXPIRY TYPES.
      Something entering a thirty-day window is worth knowing before the end of
      the day; it is not worth a phone lighting up, and a product that treats it
      that way has taught somebody to ignore the one that matters.
    */
    "batch.expiring": {
      id: "batch.expiring", label: "Expiring soon",
      summary: "{count} expiring soon — {name} first, on {on}",
      category: "activity", author: "theirs", tone: "warning", icon: "alert",
      needs: "stock:read",
      on: "batch.expiring",
      link: "/due",
      variables: ["count", "name", "on", "days"],
      channels: ["inbox", "email"],
    },
    /* ⚠️ AND THIS ONE DOES INTERRUPT, because it is already too late to plan
       around and the next thing that happens is somebody using it. */
    "batch.expired": {
      id: "batch.expired", label: "Something has expired",
      summary: "{count} out of date — {name} on {on}",
      category: "activity", author: "theirs", tone: "danger", icon: "alert",
      needs: "stock:read",
      on: "batch.expired",
      link: "/due",
      variables: ["count", "name", "on"],
      channels: ["inbox", "email", "push"],
    },
    /*
      ⚠️ ITS OWN TYPE RATHER THAN A SECOND EXPIRY, and the reason is that a
      person can silence one without silencing the other. An extinguisher's
      inspection and a carton of cream are the same arithmetic and completely
      different working days.
    */
    "unit.service_due": {
      id: "unit.service_due", label: "A service is due",
      summary: "{count} due for a service — {name} first, on {on}",
      category: "activity", author: "theirs", tone: "warning", icon: "tag",
      needs: "stock:read",
      on: "unit.service_due",
      link: "/due",
      variables: ["count", "name", "on"],
      channels: ["inbox", "email", "push"],
    },
    /*
      ⚠️ `action`, AND IT MAY NOT BE SILENCED — `refusePolicy` refuses a
      preference that leaves one with no interrupting channel. A load that
      finished and nobody released is stock nobody may use sitting in a machine,
      and the only person who can end that state is the one being told.

      ⚠️ ADDRESSED TO `process:release` RATHER THAN `process:read`. Telling the
      person who loaded the autoclave that it needs releasing is telling somebody
      who cannot release it — which is how a queue of "somebody should do
      something" notes trains a whole workspace to scroll past them.
    */
    "process.pending": {
      id: "process.pending", label: "A run needs releasing",
      summary: "{kind} has finished and nobody has released it",
      category: "action", author: "theirs", tone: "warning", icon: "list",
      needs: "process:release",
      on: "process.ended",
      link: "/work",
      variables: ["kind", "who"],
      channels: ["inbox", "email", "push"],
    },
    "process.failed": {
      id: "process.failed", label: "A run failed",
      summary: "{kind} failed — {reason}",
      category: "activity", author: "theirs", tone: "danger", icon: "alert",
      needs: "process:read",
      on: "process.failed",
      link: "/work",
      variables: ["kind", "reason", "who"],
      channels: ["inbox", "email", "push"],
    },
    /*
      ⚠️ AN `action` TOO, AND IT IS THE SHARPEST ONE IN THE PRODUCT. A recall
      names what could not be frozen because it was already used — those are
      people, and somebody has to ring them. A preference that could mute this
      would be a way to miss it silently.
    */
    "process.recalled": {
      id: "process.recalled", label: "Called back",
      summary: "{kind} was called back — {reason}",
      category: "action", author: "theirs", tone: "danger", icon: "alert",
      needs: "process:read",
      on: "process.recalled",
      link: "/work",
      variables: ["kind", "reason", "who"],
      channels: ["inbox", "email", "push"],
    },
  },

  /* ⚠️ EVERY STEP IS TICKED BY AN EVENT THIS APP ACTUALLY RAISES. A step whose
     `done` nothing emits is a box that can never be crossed off, and the
     manifest refuses one at composition rather than letting it sit there. */
  guide: {
    /*
      ⚠️ THE PRODUCT COMES FIRST, AND IT USED TO COME SECOND. Naming a shelf is
      the answer to "where", which is a question nobody has until they are
      holding something the catalogue knows about — and a first step that asks
      somebody to describe their building is a first step they put off. Adding a
      thing takes six photographs and one press, and it is the gesture that
      shows what the product is for.
    */
    "first-thing": { id: "first-thing", label: "Add your first product",
      why: "A product is the type; how many there are comes next.",
      done: "product.created", link: "/stock", order: 1 },
    "first-place": { id: "first-place", label: "Name a place to keep things",
      why: "Everything sits somewhere, and the shelf is what a scan finds first.",
      done: "location.created", link: "/stock", order: 2 },
    /* ⚠️ THE ONE STEP THAT IS EACH PERSON'S. Naming a place and building the
       catalogue happen once for the whole workspace; putting something on a
       shelf is the gesture this product IS, and somebody who has not done it has
       not learnt the product whatever their colleagues did last year. */
    "first-count": { id: "first-count", label: "Put some on a shelf",
      why: "It is the whole product: what is where, and how many.",
      done: "stock.received", link: "/receive", who: "person", order: 3 },
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
    "about-places": { id: "about-places", title: "Places", screen: "location",
      body: "A place can sit inside another, as deep as your building goes. Label them and the camera moves itself." },
    "about-corrections": { id: "about-corrections", title: "Corrections", screen: "stock",
      body: "Taking something and correcting a number are different acts. A correction always says why, and the old number stays visible." },
  },

  /* ⚠️ WHICH SURFACES THIS APP HAS, AND NOT WHO MAY PAINT THEM. The brand is the
     WORKSPACE's and reaches every app under it (D22). */
  whitelabel: { surfaces: ["email"] },

  /*
    ⚠️ THE CEILING THE RESERVE IS COMPUTED FROM, ONE PER ACTION. A meter with no
    ceiling reserves nothing and settles at whatever arrived — and `settle` caps
    the charge at the hold, so every token an estimate fails to anticipate is a
    token the platform pays for and the workspace does not.

    ⚠️ AND THE PICTURE IS THE BIGGEST INPUT IN THE WHOLE PRODUCT. A photograph of
    a delivery note costs more to look at than every instruction wrapped around
    it, which is why `TOKENS_PER_IMAGE` exists rather than a character count.
  */
  meters: {
    "product.identify": {
      id: "product.identify", label: "Identify a barcode", lane: "text", maxOutput: 400,
    },
    "product.read": {
      id: "product.read", label: "Read a label", lane: "vision", maxOutput: 700,
    },
    /* ⚠️ THE DEAREST ACTION IN THE PRODUCT, AND IT IS THE PICTURES RATHER THAN
       the words: six of them is six times `TOKENS_PER_IMAGE` before a single
       character of the prompt is counted. The output ceiling is modest because
       the answer is a dozen short fields — a bigger one would reserve for prose
       the schema throws away. */
    "product.see": {
      id: "product.see", label: "Identify a product from photos", lane: "vision", maxOutput: 800,
    },
    "stock.note": {
      id: "stock.note", label: "Read a delivery note", lane: "vision", maxOutput: 2_000,
    },
    "stock.ask": {
      id: "stock.ask", label: "Ask about the stock", lane: "text", maxOutput: 500,
    },
  },
  /* ⚠️ TWO LANES, AND `vision` IS THE ONE THAT EARNS THE CAMERA. A label with no
     barcode and a delivery note are most of what arrives in a workshop or a
     kitchen, and neither is reachable by any other path in this product. */
  lanes: ["text", "vision"],
});

/* ⚠️ A THUNK, BECAUSE COMPOSITION IS LAZY (D4). Exporting the composed surface
   would put every app's route table in the startup budget of every request. */
export const inventory = (): AppSpec => INVENTORY;
