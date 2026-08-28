/**
 * ONEPARTY — EVERYBODY A BUSINESS DEALS WITH, ONCE.
 *
 * ⚠️ THE PRODUCT IS THE ABSENCE OF THE SECOND ADDRESS BOOK. A company that buys
 * from you and sells to you is ONE record holding two roles, not a customer row
 * and a supplier row that agree until somebody changes an address. Every business
 * system that models them separately then needs a table to link them back
 * together — ERPNext has one, called Party Link, and it exists because the split
 * came first. This one starts from the other end (D120, B3).
 *
 * ⚠️ AND IT IS SHARED, WHICH IS WHY IT IS ITS OWN PRODUCT RATHER THAN A TABLE
 * INSIDE ONE. OneInventory names a supplier, OneBook invoices a customer and
 * OneHR will pay a worker — and none of the three may import this one. The seam
 * is `shared: true` on the collection here and `borrows: ["party"]` there, both
 * declarations the deployment resolves. `apps.test.mjs` refuses the import,
 * `shadow.test.mjs` refuses a second app declaring the table.
 *
 * ⚠️ ONE COLUMN FOR THE TAX NUMBER, MANY NAMES FOR IT. A TRN, a GSTIN, an ABN
 * and an EIN are the same fact — the number a tax authority knows this party by —
 * and a product that models them as separate fields grows one per country and can
 * never stop. `naming.ts` holds the vocabulary; the column is universal.
 *
 * ⚠️ AND AN ADDRESS IS LINES, NOT A FORM. `street`, `state` and `zip` are one
 * country's postal form imposed on every other, and the countries they fit worst
 * are the ones a product this small is most likely to be sold in first. What is
 * universal is the country, and what is useful is the city and the postcode; the
 * rest is written the way the post office that delivers it wants to read it.
 */

import {
  area, collection, defineApp, field, newId, operation, setting,
  type AppSpec,
} from "@engine/kernel";

import { ROLES, alreadyThere, narrowed, type Party } from "./naming.js";

/* ------------------------------------------------------------------ shapes --- */

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
  fail(
    code: string,
    values?: Record<string, string>,
    extra?: { fields?: Record<string, string>; ref?: string },
  ): never;
  setting(id: string): Promise<unknown>;
}

/* ------------------------------------------------------------ collections --- */

/**
 * ⚠️ "PARTY" IS THE WORD, AND EVERY ALTERNATIVE IS WRONG FOR SOME OF THE ROWS.
 * "Customer" is wrong for the printer you buy paper from, "supplier" is wrong for
 * the shop you sell to, "company" is wrong for a sole trader and "contact" is a
 * person INSIDE one of them, which is a different record and is below. It is the
 * word accounting standards, SAP, Oracle and ERPNext all reached independently,
 * and it is the only one that does not have to be walked back.
 */
const party = collection({
  id: "party",
  /*
    ⚠️ THE ONE DECLARATION THIS WHOLE PRODUCT EXISTS FOR. Without it another app
    can only get a supplier by declaring its own — which is a second address book
    with the first one's data in it, one shard collision away from an outage, and
    exactly the thing `shadow.test.mjs` now refuses.
  */
  shared: true,
  label: { one: "Party", many: "Parties" },
  scope: { of: "tenant" },
  permission: "party",
  retention: null,
  onClose: { then: "purge" },
  quota: "parties",
  /* ⚠️ A phone in a van looks up who it is delivering to, and adds the one
     nobody had written down yet. */
  offline: "queue",
  /* ⚠️ WHAT LEAVES THIS DATABASE TO BE FOUND BY MEANING. The tax number is
     deliberately absent: it is looked up by exact match or not at all, and a
     number found by resemblance is a number matched to the wrong company. */
  searchable: ["name", "about"],
  names: "name",
  fields: {
    name: field.text({
      label: "Name", required: true, holds: "identity", max: 200,
    }),
    /*
      ⚠️ A PERSON OR A COMPANY, AND IT CHANGES WHAT EVERY OTHER FIELD MEANS. A
      sole trader's tax number is their own, their name is their name, and what a
      country requires on an invoice differs on exactly this line.

      ⚠️ NOT `settled`, DELIBERATELY. A sole trader incorporates — it is one of
      the few things that genuinely happens to a party — and nothing downstream
      is reinterpreted by the change the way a unit or a tracking level is.
    */
    kind: field.enum({
      label: "Kind", required: true, holds: "none",
      values: ["person", "organisation"],
      help: "A person trading as themselves, or a company.",
    }),
    about: field.long({ label: "About", holds: "none", max: 600 }),

    /*
      ⚠️ THE THREE ROLES, AS THREE SWITCHES RATHER THAN ONE CHOICE. A ladder
      would be wrong here in a way it is not wrong for a product's tracking: the
      roles are not deeper versions of each other, they are independent, and the
      row that holds two of them is the row this product was built for.

      ⚠️ AND `worker` RATHER THAN `employee`, WHICH IS NOT A EUPHEMISM. Whether
      somebody is employed or contracted is a question with a different answer in
      every country and a legal consequence in most of them, and it is OneHR's to
      ask. What this row records is that the workspace pays them for their time.
    */
    customer: field.bool({ label: "They buy from us", holds: "none" }),
    supplier: field.bool({ label: "We buy from them", holds: "none" }),
    worker: field.bool({ label: "They work for us", holds: "none" }),

    /*
      ⚠️ THE COUNTRY IS WHAT MAKES THE REST OF THE FORM CORRECT, so it is asked
      about the party rather than assumed from the workspace. A business in one
      country trades with parties in others, and their tax number is called what
      it is called where THEY are registered.
    */
    country: field.text({
      label: "Country", holds: "none", max: 2,
      help: "Two letters. It decides what their tax number is called.",
    }),
    /*
      ⚠️ ONE COLUMN, AND THE LABEL IS THE GENERIC ONE ON PURPOSE. The screens
      say what it is called where this party is registered — `taxNameFor` in
      `naming.ts` — and a generated form has one static string to put over the
      control. Naming it "VAT number" in the declaration would be wrong in
      twenty-one countries and right in a hundred; naming it neutrally is right
      everywhere and specific nowhere, which is the correct half to lose.
    */
    taxId: field.text({
      label: "Tax number", holds: "identity", max: 60,
      help: "The number their tax authority knows them by.",
    }),

    email: field.email({ label: "Email", holds: "contact" }),
    phone: field.text({ label: "Phone", holds: "contact", max: 40 }),
    website: field.url({ label: "Website", holds: "none" }),

    /*
      ⚠️ THE TERMS ARE HERE RATHER THAN ON A ROLE ROW, WHICH IS B3 READ
      LITERALLY. A role that carried its own table would be the second address
      book again, one level down: two rows to keep in step, and a party who is
      both would have two addresses of record for the same company.

      ⚠️ AND THE TWO DIRECTIONS ARE TWO FIELDS BECAUSE THEY ARE TWO AGREEMENTS.
      A party who buys from you on thirty days and sells to you on seven is
      ordinary, and one number could only ever be one of those.
    */
    paysWithin: field.number({
      label: "They pay within", holds: "none", min: 0, max: 365,
      help: "Days from the invoice. Blank means no agreement.",
    }),
    paidWithin: field.number({
      label: "We pay within", holds: "none", min: 0, max: 365,
      help: "Days from their invoice. Blank means no agreement.",
    }),
    /* ⚠️ FINANCIAL, BECAUSE IT IS A JUDGEMENT ABOUT SOMEBODY'S SOLVENCY. It is
       the one field here a party would rather not have seen. */
    creditLimit: field.money({ label: "Credit limit", holds: "financial" }),

    note: field.long({ label: "Note", holds: "none", max: 2_000 }),
  },
});

/**
 * A PERSON INSIDE A PARTY — the one you actually ring.
 *
 * ⚠️ ITS OWN PERMISSION, AND THAT IS THE POINT OF SPLITTING IT OFF. Somebody
 * receiving a delivery needs to know the supplier exists; they do not need the
 * buyer's mobile number. Sharing `party:read` would have made every phone number
 * in the book readable by everybody who can see a name.
 */
const contact = collection({
  id: "contact",
  label: { one: "Contact", many: "Contacts" },
  scope: { of: "tenant" },
  permission: "contact",
  retention: null,
  onClose: { then: "purge" },
  names: "name",
  fields: {
    party: field.ref({ label: "Party", required: true, holds: "none", to: "party" }),
    name: field.text({ label: "Name", required: true, holds: "identity", max: 200 }),
    /* ⚠️ WHAT THEY DO THERE, IN THEIR WORDS. A closed list of job titles is a
       list that is wrong in the second country and the second industry. */
    does: field.text({ label: "What they do", holds: "none", max: 120 }),
    email: field.email({ label: "Email", holds: "contact" }),
    phone: field.text({ label: "Phone", holds: "contact", max: 40 }),
    /* ⚠️ WHO TO ASK FIRST, NOT WHO IS SENIOR. A party with four contacts and no
       answer to "who do I ring" is a party somebody rings the wrong person at. */
    first: field.bool({ label: "Ask them first", holds: "none" }),
    note: field.long({ label: "Note", holds: "none", max: 1_000 }),
  },
});

/**
 * WHERE A PARTY IS — and the shape of this record is the whole "every country"
 * argument, so it is worth reading before adding a field to it.
 *
 * ⚠️ `street`, `state` AND `zip` ARE ONE COUNTRY'S FORM. Ireland has no
 * postcodes in the sense that form means; Japan writes the largest unit first;
 * the Emirates has no postal codes at all and addresses by PO box; England has
 * counties nobody uses and Scotland does not have them. A product that asks for
 * a state is a product that either refuses a correct address or collects a
 * wrong one.
 *
 * ⚠️ SO WHAT IS ASKED IS WHAT IS ACTUALLY UNIVERSAL: the country, because it
 * decides everything else; the city and the postcode, because those are what a
 * person filters and sorts by; and the address itself as LINES, written the way
 * the post office that has to deliver it wants to read it.
 */
const address = collection({
  id: "address",
  label: { one: "Address", many: "Addresses" },
  scope: { of: "tenant" },
  permission: "party",
  retention: null,
  onClose: { then: "purge" },
  names: "label",
  fields: {
    party: field.ref({ label: "Party", required: true, holds: "none", to: "party" }),
    /* ⚠️ WHAT THIS ADDRESS IS CALLED IN THE WORKSPACE — "Head office", "The
       yard". A party with three addresses and no names has three addresses. */
    label: field.text({ label: "Called", required: true, holds: "none", max: 80 }),
    lines: field.long({
      label: "Address", holds: "contact", max: 400,
      help: "Written the way the post office there wants it.",
    }),
    city: field.text({ label: "City", holds: "contact", max: 120 }),
    postcode: field.text({ label: "Postcode", holds: "contact", max: 24 }),
    country: field.text({ label: "Country", holds: "none", max: 2 }),
    /* ⚠️ WHAT AN ADDRESS IS FOR, AND BOTH CAN BE TRUE. An invoice goes to the
       office and the goods go to the yard, and a single "type" would make the
       common case — one address that is both — a choice somebody gets wrong. */
    billing: field.bool({ label: "Send invoices here", holds: "none" }),
    delivery: field.bool({ label: "Send goods here", holds: "none" }),
  },
});

/* ------------------------------------------------------------- operations --- */

interface Registering {
  readonly name: string;
  readonly kind: string;
  readonly role?: string;
  readonly country?: string;
  readonly taxId?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly paysWithin?: number;
  readonly paidWithin?: number;
  readonly anyway?: boolean;
}

interface Registered {
  readonly party: string;
}

/** ⚠️ Only what the sameness check reads — see `naming.ts`. */
interface Row { readonly id: string; readonly name: string; readonly tax_id: string | null }

/**
 * ADDING A PARTY, AND THE REASON IT IS NOT THE GENERATED `party.create`.
 *
 * ⚠️ THE DUPLICATE CHECK IS THE PRODUCT. A book that lets the same company be
 * written down twice is a book that becomes two books, which is the failure this
 * whole product exists to prevent — and the moment to catch it is the press, not
 * a cleanup screen somebody runs once a year. `party.create` is still generated
 * and still there; what it cannot do is ask.
 *
 * ⚠️ AND IT REFUSES TWO DIFFERENT WAYS, BECAUSE THE EVIDENCE IS DIFFERENT. A
 * matching tax number is PROOF and cannot be overridden — two rows with one
 * number are one party, whatever they are called. A matching name is a
 * RESEMBLANCE, and somebody who knows better presses on: `anyway` is that
 * decision, taken by a person, once.
 */
const register = operation<Registering, Registered>({
  id: "party.register",
  kind: "write",
  summary: "Add somebody to the book",
  input: {
    name: field.text({ label: "Name", required: true, holds: "identity", max: 200 }),
    kind: field.enum({
      label: "Kind", required: true, holds: "none", values: ["person", "organisation"],
    }),
    /*
      ⚠️ ONE ROLE HERE, AND THREE SWITCHES ON THE RECORD. Somebody adding a party
      is almost always adding a supplier OR a customer — the second role is
      DISCOVERED, months later, when the printer you buy paper from asks to buy
      your old stock. Asking for all three at the moment of writing down a name
      is asking a question whose answer nobody has yet.

      ⚠️ AND THAT IS NOT A NARROWER MODEL, WHICH IS THE POINT. The party page
      carries all three, independently, and this operation writes one of them —
      so the second role costs one switch on a screen somebody is already on,
      instead of a second record on a rail that never merges.
    */
    role: field.enum({
      label: "What they are to you", holds: "none",
      values: [...ROLES, "none"],
      help: "The one you know now. The rest are switches on their page.",
    }),
    country: field.text({ label: "Country", holds: "none", max: 2 }),
    taxId: field.text({ label: "Tax number", holds: "identity", max: 60 }),
    email: field.email({ label: "Email", holds: "contact" }),
    phone: field.text({ label: "Phone", holds: "contact", max: 40 }),
    paysWithin: field.number({ label: "They pay within", holds: "none", min: 0, max: 365 }),
    paidWithin: field.number({ label: "We pay within", holds: "none", min: 0, max: 365 }),
    anyway: field.bool({ label: "Add them anyway", holds: "none" }),
  },
  output: { party: field.text({ label: "Party", holds: "none" }) },
  permission: "party:write",
  quota: "parties",
  /* ⚠️ THE ORDINARY WAY THIS GETS PRESSED TWICE is a slow connection and an
     impatient thumb, and the second press would land as a second party with the
     same name — the exact row the check above exists to refuse. */
  idempotency: { mode: "key" },
  emits: ["party.added"],
  outcome: {
    message: "Added.", tone: "success", invalidates: ["party.list"],
  },
  fails: ["platform.invalid", "party.already", "party.resembles"],
  audit: (input) => ({ subject: input.name, verb: "added" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;

    const name = (input.name ?? "").trim();
    if (!name) return c.fail("platform.invalid", {}, { fields: { name: "Give them a name" } });
    const taxId = (input.taxId ?? "").trim();
    const country = (input.country ?? "").trim().toUpperCase();

    /*
      ⚠️ TWO TERMS AND A CEILING, BECAUSE THE NAME HALF CANNOT BE DONE IN SQL.
      `narrowed` takes off case, punctuation and the company suffix, and no
      column holds the result — so the database narrows to the plausible rows and
      `alreadyThere` decides. The `LIKE` is the longest word in the name, which
      is the part somebody is least likely to have abbreviated.
    */
    const longest = narrowed(name).split(" ")
      .reduce((most, word) => (word.length > most.length ? word : most), "");
    const flat = taxId.replace(/\s/g, "").toUpperCase();
    const near = await db.prepare(
      `SELECT id, name, tax_id FROM party
        WHERE tenant_id = ?
          AND ((? <> '' AND UPPER(REPLACE(tax_id, ' ', '')) = ?)
            OR (? <> '' AND name LIKE ?))
        LIMIT 20`)
      .bind(c.tenantId, flat, flat, longest, `%${longest}%`)
      .all<Row>();

    const book: readonly (Party & { readonly id: string })[] = near.results.map((row) => ({
      id: row.id, name: row.name, kind: "organisation", taxId: row.tax_id,
    }));
    const found = alreadyThere(book, { name, kind: "organisation", taxId });
    const proven = found.find((one) => one.how === "same");
    if (proven) {
      return c.fail("party.already", { name: proven.party.name },
        { fields: { taxId: "This number is already in the book" } });
    }
    /* ⚠️ A RESEMBLANCE IS A QUESTION, AND `anyway` IS THE ANSWER. Two companies
       genuinely called the same thing is ordinary; refusing it outright would be
       a product telling somebody their own book is wrong. */
    if (found.length && !input.anyway) {
      return c.fail("party.resembles", { name: found[0]?.party.name ?? name },
        { fields: { name: "Somebody like this is already here" } });
    }

    const id = newId("pty");
    await db.prepare(
      `INSERT INTO party (id, tenant_id, name, kind, customer, supplier, worker,
        country, tax_id, email, phone, pays_within, paid_within, at, by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, c.tenantId, name, input.kind,
        input.role === "customer" ? 1 : 0,
        input.role === "supplier" ? 1 : 0,
        input.role === "worker" ? 1 : 0,
        country || null, taxId || null,
        (input.email ?? "").trim() || null, (input.phone ?? "").trim() || null,
        input.paysWithin ?? null, input.paidWithin ?? null,
        c.now, c.accountId ?? null)
      .run();

    return { party: id };
  },
});

/* --------------------------------------------------------------- the app --- */

const manifest = (): AppSpec => defineApp({
  id: "party",
  name: "OneParty",
  /*
    ⚠️ A FILLED CENTRE INSIDE A RING — one record at the middle of everything
    that refers to it, which is what this product is. It is also the only mark in
    the family that is a single closed figure, and that is deliberate: the other
    products are made of parts, and this one is made of one.
  */
  mark: "◉",
  /*
    ⚠️ ROSE, AND THE ARGUMENT IS THAT IT IS NOT BLUE. Every business product
    reaches for a blue when nobody has decided anything, and a book of the people
    a company deals with is the screen where that would be least noticed and most
    wrong. It is warm because the subject is people, and it is not red because a
    directory is never an alarm.

    ⚠️ AND IT IS THE COUNTERPOINT TO ONEINVENTORY'S AMBER RATHER THAN A SECOND
    HELPING OF IT. Two products in one deployment at the same temperature read as
    one product with two navigation bars.
  */
  hue: "oklch(0.76 0.13 348)",

  access: {
    permissions: [
      "party:read", "party:write",
      /*
        ⚠️ READING A NAME AND READING A PHONE NUMBER ARE DIFFERENT GRANTS, and
        it is this product's sharpest access rule. The whole point of a shared
        party book is that every product in the workspace reads it — so without
        this split, adding OneParty to a workspace would hand everybody who can
        see a supplier the personal contact details of everybody who works there.
      */
      "contact:read", "contact:write",
    ],
    roles: {
      /* ⚠️ Keeps the book: adds parties, edits terms, holds the contact details. */
      keeper: ["party:read", "party:write", "contact:read", "contact:write"],
      /* ⚠️ Works with the book: looks somebody up and rings them. */
      user: ["party:read", "contact:read"],
      /* ⚠️ Reads who exists and no more — which is what most people in a
         workspace with this product installed actually need. */
      viewer: ["party:read"],
    },
    /*
      ⚠️ SHAPES A WORKSPACE STARTS FROM. A preset is an offer copied into a role
      the workspace then owns, and `refuseRole`'s `beyond_you` is what stops
      somebody adopting one wider than the keys they hold.
    */
    presets: [
      {
        id: "alone", name: "On your own",
        said: "One person keeping the book. Everything, including the phone numbers.",
        permissions: ["party:read", "party:write", "contact:read", "contact:write"],
      },
      {
        id: "buying", name: "Buys things",
        said: "Looks up a supplier and rings them. Cannot change the terms.",
        permissions: ["party:read", "contact:read"],
      },
      {
        id: "floor", name: "On the floor",
        said: "Sees who a delivery is from. No phone numbers, no terms.",
        permissions: ["party:read"],
      },
    ],
    founding: "keeper",
    seats: { counts: ["owner", "manager", "staff"], entitlement: "seats" },
  },

  /*
    ⚠️ ONE KEY, AND IT IS A COUNT RATHER THAN A CAPABILITY. There is nothing here
    a workspace either does or does not do — everybody who trades has parties —
    so a gate would be a feature withheld from somebody who needs all of it.

    ⚠️ AND IT IS DECLARED AT ALL BECAUSE OF THE PARKING ROW. `none` is where a
    workspace sits after a trial ends: it reads and exports and adds nothing. A
    product with no ceiling would be the one thing that still grew there, which
    would make the parking state a free tier by accident.

    ⚠️ WHAT IS DELIBERATELY ABSENT: a ceiling on contacts or addresses. Those hang
    off a party that has already been counted, and metering them would mean a
    workspace pays twice for writing down a second phone number.
  */
  entitlements: {
    parties: { label: "Parties", withheld: "quota" },
  },

  collections: [party, contact, address],

  operations: [register],

  settingAreas: {
    parties: area({
      id: "parties", label: "Parties", icon: "people", order: 0,
      said: "Where you are, and the terms a new party starts on",
    }),
  },

  /*
    ⚠️ THREE SETTINGS, AND ALL THREE ARE DEFAULTS RATHER THAN RULES. Each seeds
    what a NEW party starts as and nothing else — a workspace that changes one
    has changed what the next form is pre-filled with, and has changed nothing
    about any party already in the book. A setting that reached backwards would
    rewrite an agreement somebody made on a telephone.
  */
  settings: {
    /*
      ⚠️ WHERE THE WORKSPACE IS, AND IT IS THE ONE SETTING THAT MAKES THE PRODUCT
      INTERNATIONAL RATHER THAN TRANSLATED. Most parties in most books are in the
      same country as the business, so this is what stops somebody typing two
      letters four hundred times — and it is what a screen falls back to when it
      has to name a tax identifier before anybody has said where a party is.

      ⚠️ IT IS NOT THE WORKSPACE'S CURRENCY AND MUST NOT BECOME IT. D117 already
      answers that question one layer up, for the whole deployment; a second
      answer here would be a country and a currency that can disagree.
    */
    "party.home_country": setting({
      id: "party.home_country", level: "tenant", area: "parties",
      field: field.text({ label: "Where you are", holds: "none", max: 2 }),
      fallback: "", needs: "tenant:manage",
      help: "Two letters. New parties start here, and it can be changed on each.",
    }),
    "party.they_pay_within": setting({
      id: "party.they_pay_within", level: "tenant", area: "parties",
      field: field.number({ label: "They usually pay within", holds: "none", min: 0, max: 365 }),
      fallback: 0, needs: "tenant:manage",
      help: "Days. Zero means you have no standard, and each party is asked.",
    }),
    "party.we_pay_within": setting({
      id: "party.we_pay_within", level: "tenant", area: "parties",
      field: field.number({ label: "We usually pay within", holds: "none", min: 0, max: 365 }),
      fallback: 0, needs: "tenant:manage",
      help: "Days. Zero means you have no standard, and each party is asked.",
    }),
  },

  /*
    ⚠️ NO NOTIFICATIONS, AND THE ABSENCE IS DELIBERATE RATHER THAN OUTSTANDING.
    An address book generates nothing a person needs to be interrupted about: a
    party was added by whoever was looking at the screen, an address changed
    because somebody changed it, and a bell that rang for either would be a bell
    people turn off — which costs the notifications that matter later.

    ⚠️ THERE IS EXACTLY ONE THAT WILL EARN A LINE, AND IT DOES NOT EXIST YET:
    the book growing without anybody opening it. When goods-in names a supplier
    nobody had written down, the person who keeps the book has a new row they did
    not make and cannot see the origin of. That is a real interruption — and it
    is raisable only once another product writes here, so it arrives with the
    migration rather than before it. Declaring it now would be a notification
    nothing raises: built, gated, translated, and reached by nothing.
  */

  /*
    ⚠️ FOUR VIEWS, AND WHAT IS ABSENT IS THE ARGUMENT. There is no `customers`
    view and no `suppliers` view, because a book split into two lists is two
    books — which is the exact failure this product exists to prevent, arriving
    through the navigation instead of through the schema. The roles are a column
    somebody reads and a filter somebody applies; they are never a destination.
  */
  views: [
    { id: "everybody", of: "party", limit: 50 },
    /* ⚠️ NARROWED TO THE RECORD THE SCREEN IS ABOUT — see `Value.here`. */
    { id: "people-there", of: "contact", where: [{ field: "party", is: { here: "record" } }] },
    { id: "where-they-are", of: "address", where: [{ field: "party", is: { here: "record" } }] },
    { id: "everybody-else", of: "contact", limit: 50 },
  ],

  /*
    ⚠️ TWO REFUSALS, AND THE DIFFERENCE BETWEEN THEM IS WHAT EVIDENCE THERE IS.
    A matching tax number is proof and there is nothing to decide; a matching
    name is a resemblance, and the person holding the invoice knows things this
    product does not.
  */
  problems: {
    "party.already": {
      status: 409, retryable: false, tone: "warning",
      title: "{name} is already in the book",
      plain: "This company is already in the book",
      detail: "Two records with one tax number are one party. Open theirs instead.",
    },
    /*
      ⚠️ IT NAMES WHO IT MEANS, BECAUSE "SOMEBODY LIKE THIS EXISTS" IS UNACTIONABLE.
      The whole value of the check is that the person can look at the name and say
      yes or no in one second, and they cannot do that without seeing it.
    */
    "party.resembles": {
      status: 409, retryable: false, tone: "warning",
      title: "{name} looks like the same company",
      plain: "Somebody with this name is already in the book",
      detail: "Open theirs, or add this one anyway if they are genuinely different.",
    },
  },
  screens: [
    /*
      THE BOOK — everybody, in one list, whatever they are to the workspace.

      ⚠️ NO HERO, AND THAT IS THE PRODUCT SAYING WHAT IT IS. An inventory opens
      on a figure because "what have we run out of" is asked every morning and
      answered differently every morning. Nobody opens an address book to read a
      number; they open it to find somebody. The list IS the screen.
    */
    { id: "book", route: "/", label: "Parties", nav: "primary", icon: "people",
      permission: "party:read", tone: "neutral",
      body: {
        shape: "list",
        layout: { as: "stack" },
        /*
          ⚠️ ONE SHORTCUT, AND IT IS THE FLOW RATHER THAN A DESTINATION. A
          `QuickActions` leading to Contacts would be two ways to one screen with
          the navigation bar directly above it — a screen saying everything
          twice. What earns the slot is the thing somebody came here to do and
          cannot reach any other way.
        */
        blocks: [
          {
            group: null,
            of: [{ block: "QuickActions", leads: ["add-a-party"] }],
          },
          {
            group: null,
            of: [{
              block: "Listing",
              /*
                ⚠️ THE ROLES ARE A COLUMN, WHICH IS THE WHOLE ARGUMENT MADE
                VISIBLE. A row that says "Customer · Supplier" is the product
                explaining itself in the one place somebody is already looking —
                and it is the answer to "is this supplier already a customer"
                without anybody having to ask it.
              */
              shows: [
                { field: "name", label: "Name" },
                { field: "customer", label: "Buys" },
                { field: "supplier", label: "Sells" },
              ],
              goes: "party",
              nothing: {
                says: "Nobody yet",
                under: "Add the first company or person you deal with",
              },
              bind: {
                label: { from: { of: "words", says: "Parties" } },
                of: { from: { of: "view", view: "everybody" } },
              },
            }],
          },
        ],
      } },

    /*
      ONE PARTY — what they are to us, how to reach them, what was agreed, who
      works there and where they are.

      ⚠️ ALL OF IT ON ONE PAGE BECAUSE IT IS ONE QUESTION. Somebody opens a party
      holding a telephone or an invoice: who is this, what did we agree, who do I
      ask for. Split across tabs it is the same information and three taps.
    */
    { id: "party", route: "/party", label: "Party", nav: "none", icon: "people",
      permission: "party:read", of: "party",
      body: {
        shape: "detail",
        layout: { as: "stack" },
        blocks: [
          {
            group: "What they are to us",
            of: [
              { block: "FieldRow",
                bind: {
                  label: { from: { of: "words", says: "Kind" } },
                  value: { from: { of: "field", field: "kind" } },
                } },
              { block: "FieldRow",
                when: { has: { of: "field", field: "customer" } },
                bind: {
                  label: { from: { of: "words", says: "They buy from us" } },
                  value: { from: { of: "field", field: "customer" } },
                } },
              { block: "FieldRow",
                when: { has: { of: "field", field: "supplier" } },
                bind: {
                  label: { from: { of: "words", says: "We buy from them" } },
                  value: { from: { of: "field", field: "supplier" } },
                } },
              { block: "FieldRow",
                when: { has: { of: "field", field: "worker" } },
                bind: {
                  label: { from: { of: "words", says: "They work for us" } },
                  value: { from: { of: "field", field: "worker" } },
                } },
              /* ⚠️ THE LABEL IS THE GENERIC ONE AND THE COUNTRY IS BESIDE IT, so
                 somebody reading a TRN can see which authority it belongs to
                 without the row claiming to know what that country calls it. */
              { block: "FieldRow",
                when: { has: { of: "field", field: "taxId" } },
                bind: {
                  label: { from: { of: "words", says: "Tax number" } },
                  value: { from: { of: "field", field: "taxId" } },
                } },
              { block: "FieldRow",
                when: { has: { of: "field", field: "country" } },
                bind: {
                  label: { from: { of: "words", says: "Country" } },
                  value: { from: { of: "field", field: "country" } },
                } },
            ],
          },
          {
            group: "How to reach them",
            of: [
              { block: "FieldRow",
                when: { has: { of: "field", field: "email" } },
                bind: {
                  label: { from: { of: "words", says: "Email" } },
                  value: { from: { of: "field", field: "email" } },
                } },
              { block: "FieldRow",
                when: { has: { of: "field", field: "phone" } },
                bind: {
                  label: { from: { of: "words", says: "Phone" } },
                  value: { from: { of: "field", field: "phone" } },
                } },
              { block: "FieldRow",
                when: { has: { of: "field", field: "website" } },
                bind: {
                  label: { from: { of: "words", says: "Website" } },
                  value: { from: { of: "field", field: "website" } },
                } },
            ],
          },
          /*
            ⚠️ TWO NUMBERS, TWO DIRECTIONS, AND NEITHER IS SHOWN UNLESS IT WAS
            AGREED. A blank payment term drawn as "0 days" is a promise nobody
            made, and it is the kind of number somebody reads out on a telephone.
          */
          {
            group: "What was agreed",
            of: [
              { block: "FieldRow",
                when: { has: { of: "field", field: "paysWithin" } },
                bind: {
                  label: { from: { of: "words", says: "They pay within" } },
                  value: { from: { of: "field", field: "paysWithin" }, as: "num" },
                } },
              { block: "FieldRow",
                when: { has: { of: "field", field: "paidWithin" } },
                bind: {
                  label: { from: { of: "words", says: "We pay within" } },
                  value: { from: { of: "field", field: "paidWithin" }, as: "num" },
                } },
              { block: "FieldRow",
                when: { has: { of: "field", field: "creditLimit" } },
                bind: {
                  label: { from: { of: "words", says: "Credit limit" } },
                  value: { from: { of: "field", field: "creditLimit" }, as: "money" },
                } },
            ],
          },
          /* ⚠️ EACH LIST IS UNDER A HEADING, and that is not decoration: a
             `Listing`'s `label` is its accessible name and is drawn nowhere, so
             two lists stacked on a page arrive as two unexplained cards. */
          {
            group: "Who works there",
            of: [{
              block: "Listing",
              shows: [
                { field: "name", label: "Name" },
                { field: "does", label: "What they do" },
                { field: "phone", label: "Phone" },
              ],
              goes: "contact",
              nothing: {
                says: "Nobody named yet",
                under: "Add the person you actually ring",
              },
              bind: {
                label: { from: { of: "words", says: "Who works there" } },
                of: { from: { of: "view", view: "people-there" } },
              },
            }],
          },
          {
            group: "Where they are",
            of: [{
              block: "Listing",
              shows: [
                { field: "label", label: "Called" },
                { field: "city", label: "City" },
                { field: "country", label: "Country" },
              ],
              nothing: {
                says: "No address yet",
                under: "Add one for invoices, one for deliveries, or one for both",
              },
              bind: {
                label: { from: { of: "words", says: "Where they are" } },
                of: { from: { of: "view", view: "where-they-are" } },
              },
            }],
          },
        ],
      } },

    /*
      EVERY PERSON, ACROSS EVERY PARTY — because "who is Jane" is a question
      somebody asks holding a missed call, and they do not know which company she
      is at. That is the one thing the party page cannot answer.

      ⚠️ AND IT IS BEHIND ITS OWN PERMISSION, which is why it is a destination
      rather than a section of the book. Most people in a workspace can see who
      the workspace deals with and should never see a list of everybody's
      personal telephone numbers.
    */
    { id: "contacts", route: "/contacts", label: "Contacts", nav: "primary", icon: "inbox",
      permission: "contact:read", tone: "neutral",
      body: {
        shape: "list",
        layout: { as: "stack" },
        blocks: [{
          block: "Listing",
          shows: [
            { field: "name", label: "Name" },
            { field: "party.name", label: "Where" },
            { field: "does", label: "What they do" },
          ],
          goes: "contact",
          nothing: {
            says: "Nobody yet",
            under: "Open a party and add the person you ring",
          },
          bind: {
            label: { from: { of: "words", says: "Contacts" } },
            of: { from: { of: "view", view: "everybody-else" } },
          },
        }],
      } },

    /*
      ADDING A PARTY — four questions, in the order somebody actually knows the
      answers.

      ⚠️ THE FLOW EXISTS BECAUSE THE GENERATED FORM ASKS FOURTEEN THINGS AT ONCE.
      A party has a credit limit, two payment terms, a website and a note, and
      none of those is known at the moment somebody is writing down a company
      they have just started dealing with. The form is still there on the party's
      own page, for the day the rest is known.

      ⚠️ AND `starts` IS WHY THE THREE SETTINGS EXIST. Most parties in most books
      are in the same country as the business and on the same terms; a flow that
      asked for all three every time would be a flow whose second question is
      always answered the same way. The workspace's own answer arrives held, and
      anybody who disagrees presses the clause and changes it.
    */
    { id: "add-a-party", route: "/add", label: "Add a party",
      /* ⚠️ NOT A DESTINATION — a destination is somewhere you can stand, and a
         one-way flow is not. It is reached from the book it fills. */
      nav: "none", icon: "add",
      /* ⚠️ THE WRITE'S OWN KEY, NOT THE READ'S. Offered on `party:read` this
         would take somebody through every question and refuse the last press. */
      permission: "party:write", tone: "neutral",
      story: {
        writes: "party.register",
        /* ⚠️ ON THE PARTY IT JUST MADE. The book asks somebody to find, in a
           list, the company they were looking at a second ago — and it cannot
           say the one thing that is true of a party a minute old, which is that
           nobody works there yet and it has no address. Its own page leads with
           exactly those. */
        lands: "party",
        starts: {
          country: "party.home_country",
          paysWithin: "party.they_pay_within",
          paidWithin: "party.we_pay_within",
        },
        asks: [
          { id: "named", ask: "Who are they?",
            under: "Called", takes: ["name", "kind"],
            says: { as: "called {name}" } },
          /*
            ⚠️ THE QUESTION THE WHOLE PRODUCT IS ABOUT, AND IT IS ASKED WITH
            THREE SWITCHES RATHER THAN ONE CHOICE. Somebody adding the printer
            they buy paper from and sell old stock to answers yes twice, in one
            step, and never learns that most software would have made them do
            this twice.

            ⚠️ `always`, BECAUSE SKIPPING IT IS A ROLE-LESS PARTY. That is a
            legitimate row — somebody written down before anybody knows what they
            will be — but it should be a decision rather than a step nobody saw.
          */
          { id: "roles", ask: "What are they to you?",
            under: "They", takes: ["role"], always: true,
            says: { per: {
              customer: "buy from us",
              supplier: "sell to us",
              worker: "work for us",
              none: "are only in the book for now",
            } } },
          /*
            ⚠️ THE COUNTRY BEFORE THE NUMBER, AND THAT IS THE ORDER FOR A REASON.
            What a tax identifier is CALLED is decided by where the party is
            registered — `taxNameFor` in `naming.ts` — so asking for the number
            first is asking somebody to fill a box the product cannot yet name.
          */
          { id: "registered", ask: "Where are they registered?",
            under: "In", takes: ["country", "taxId"],
            says: { as: "in {country}" } },
          { id: "reached", ask: "How do you reach them?",
            under: "At", takes: ["email", "phone"],
            says: { as: "at {email}" } },
        ],
      } },

    { id: "contact", route: "/contact", label: "Contact", nav: "none", icon: "inbox",
      permission: "contact:read", of: "contact",
      body: {
        shape: "detail",
        layout: { as: "stack" },
        blocks: [{
          group: "How to reach them",
          of: [
            { block: "FieldRow",
              when: { has: { of: "field", field: "does" } },
              bind: {
                label: { from: { of: "words", says: "What they do" } },
                value: { from: { of: "field", field: "does" } },
              } },
            { block: "FieldRow",
              when: { has: { of: "field", field: "email" } },
              bind: {
                label: { from: { of: "words", says: "Email" } },
                value: { from: { of: "field", field: "email" } },
              } },
            { block: "FieldRow",
              when: { has: { of: "field", field: "phone" } },
              bind: {
                label: { from: { of: "words", says: "Phone" } },
                value: { from: { of: "field", field: "phone" } },
              } },
            { block: "FieldRow",
              when: { has: { of: "field", field: "note" } },
              bind: {
                label: { from: { of: "words", says: "Note" } },
                value: { from: { of: "field", field: "note" } },
              } },
          ],
        }],
      } },
  ],
});

/* ⚠️ A THUNK, BECAUSE COMPOSITION IS LAZY (D4). Exporting the composed surface
   would put every app's route table in the startup budget of every request. */
export const oneParty = manifest;

export { ROLES };
