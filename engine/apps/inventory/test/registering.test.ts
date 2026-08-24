/**
 * REGISTERING A PRODUCT — the rules that hold when nobody is looking at a sheet.
 *
 * ⚠️ EVERY REFUSAL HERE HAS A SCREEN THAT ALREADY PREVENTS IT, AND THAT IS THE
 * POINT. The sheet keeps the preferred supplier among the listed ones, shows
 * what resembles a name while it is typed, and marks nothing as generated. None
 * of that reaches a queued write replaying after a day offline, an agent calling
 * the operation, or a second tab. A screen's rule is a courtesy; the door is the
 * control.
 *
 * ⚠️ AND THE TWO KINDS OF DUPLICATE ARE ASSERTED APART. A taken barcode is a
 * FACT — one code names one product, and a second owner makes every future scan
 * of that string answer with whichever row was read first — so `anyway` may not
 * wave it through. A resembling name is a QUESTION, and "yes, two brands make
 * this" is a real answer, so `anyway` is exactly what it is for. A test that
 * checked one shape for both would pass on a handler that had confused them.
 */

import { describe, expect, it } from "vitest";
import { INVENTORY } from "../src/index.js";

const register = INVENTORY.operations.find((o) => o.id === "product.register")!;

/** One row of one table, as a fake `db` remembers it. */
type Row = Record<string, unknown>;

interface Refusal {
  readonly code: string;
  readonly values: Record<string, string>;
  readonly extra: { fields?: Record<string, string> } | undefined;
}
class Refused extends Error {
  constructor(readonly it: Refusal) { super(it.code); }
}

/**
 * ⚠️ A DATABASE THIN ENOUGH TO READ, AND IT ANSWERS BY SQL SHAPE RATHER THAN BY
 * parsing any. What is under test is the handler's DECISIONS — what it looks up
 * before it writes, what it refuses, and what it writes when it does not — so
 * the fake matches on the table name in the statement and nothing else.
 */
function world(held: { codes?: Row[]; products?: Row[]; tags?: Row[] } = {}) {
  const wrote: { table: string; sql: string; values: readonly unknown[] }[] = [];
  const codes = held.codes ?? [];
  const products = held.products ?? [];
  const tags = held.tags ?? [];

  const statement = (sql: string) => {
    const one = sql.replace(/\s+/g, " ").trim();
    return {
      bind(...values: unknown[]) {
        return {
          async first<T>(): Promise<T | null> {
            if (/FROM code c JOIN product p/.test(one)) {
              const owner = codes.find((c) => c.value === values[1]);
              if (!owner) return null;
              const of = products.find((p) => p.id === owner.product);
              return { name: of?.name ?? "something", ...of } as T;
            }
            if (/FROM tag WHERE/.test(one)) {
              const word = String(values[1]);
              const has = tags.find((t) => String(t.name).toLowerCase() === word);
              return (has ?? null) as T | null;
            }
            return null;
          },
          async all<T>(): Promise<{ results: T[] }> {
            if (/FROM product/.test(one)) {
              const name = String(values[1]);
              return { results: products.filter((p) => String(p.name).toLowerCase() === name) as T[] };
            }
            return { results: [] };
          },
          async run() {
            const at = /INSERT INTO (\w+)/.exec(one);
            if (at) wrote.push({ table: at[1]!, sql: one, values });
          },
        };
      },
    };
  };

  const c = {
    db: { prepare: statement },
    tenantId: "ten_1",
    accountId: "acc_1",
    now: "2026-08-24T09:00:00.000Z",
    reach: null,
    fail(code: string, values: Record<string, string> = {}, extra?: Refusal["extra"]): never {
      throw new Refused({ code, values, extra });
    },
    async setting() { return undefined; },
  };

  return { c, wrote, rows: (table: string) => wrote.filter((w) => w.table === table) };
}

const GOOD = {
  name: "Nitrile gloves, blue", unit: "glove", tracking: "counted",
};

const refusing = async (input: unknown, held?: Parameters<typeof world>[0]): Promise<Refusal> => {
  const { c } = world(held);
  try {
    await register.handler(c as never, input as never);
  } catch (why) {
    if (why instanceof Refused) return why.it;
    throw why;
  }
  throw new Error("it registered where it should have refused");
};

describe("what the door refuses", () => {
  it("needs a name", async () => {
    expect((await refusing({ ...GOOD, name: "  " })).extra?.fields?.name).toBe("Give it a name");
  });

  it("needs to know what it is counted in", async () => {
    expect((await refusing({ ...GOOD, unit: "" })).extra?.fields?.unit)
      .toBe("Say what it is counted in");
  });

  it("needs a rung it has", async () => {
    expect((await refusing({ ...GOOD, tracking: "vibes" })).extra?.fields?.tracking)
      .toBe("Choose how it is tracked");
  });

  /*
    ⚠️ THE ORDER IS ADDRESSED TO SOMEBODY THE CATALOGUE SAYS SELLS IT. The two
    fields arrive independently and only this makes them agree; without it a
    product can be preferred-sourced from a supplier that is not on its own list,
    which is an order nobody can explain the day it goes out.
  */
  it("refuses a preferred supplier the product is not sourced from", async () => {
    const why = await refusing({
      ...GOOD, supplier: "sup_2", sources: [{ supplier: "sup_1" }],
    });
    expect(why.code).toBe("platform.invalid");
    expect(why.extra?.fields?.supplier).toBe("Order from somebody the product is sourced from");
  });

  it("allows one that is", async () => {
    const { c, rows } = world();
    await register.handler(c as never, {
      ...GOOD, supplier: "sup_1", sources: [{ supplier: "sup_1" }, { supplier: "sup_2" }],
    } as never);
    expect(rows("sourcing")).toHaveLength(2);
  });
});

describe("the two kinds of duplicate", () => {
  /*
    ⚠️ A CODE NAMES ONE PRODUCT. Learning a second owner makes every future scan
    of that string ambiguous, and the resolver answers with whichever row it read
    first — a wrong product, confidently, for ever.
  */
  it("refuses a barcode that already names something", async () => {
    const why = await refusing(
      { ...GOOD, codes: [{ value: "05012345678900" }] },
      {
        codes: [{ value: "05012345678900", product: "prd_1" }],
        products: [{ id: "prd_1", name: "Gloves, old box" }],
      },
    );
    expect(why.code).toBe("inventory.taken");
    expect(why.values.name).toBe("Gloves, old box");
  });

  /*
    ⚠️ AND `anyway` CANNOT WAVE IT THROUGH, because a person may not press past a
    fact. It is the one refusal here that is not a judgement.
  */
  it("refuses it even when told to register anyway", async () => {
    const why = await refusing(
      { ...GOOD, anyway: true, codes: [{ value: "05012345678900" }] },
      {
        codes: [{ value: "05012345678900", product: "prd_1" }],
        products: [{ id: "prd_1", name: "Gloves, old box" }],
      },
    );
    expect(why.code).toBe("inventory.taken");
  });

  /*
    ⚠️ A CODE IS NORMALISED BEFORE IT IS COMPARED. An EAN-13 off a box and the
    `(01)` of the DataMatrix on the same box differ by a leading zero; compared
    as they were typed, the second is a new code for a product that already has
    it, and the workspace ends up with a duplicate nobody can see is a duplicate.
  */
  it("sees a thirteen-digit code and its padded form as one", async () => {
    const why = await refusing(
      { ...GOOD, codes: [{ value: "5012345678900" }] },
      {
        codes: [{ value: "05012345678900", product: "prd_1" }],
        products: [{ id: "prd_1", name: "Gloves, old box" }],
      },
    );
    expect(why.code).toBe("inventory.taken");
  });

  /*
    ⚠️ A RESEMBLING NAME IS A QUESTION, AND IT IS ANSWERABLE. Two brands making
    the same thing is real, so this refusal exists to be overridden — by somebody
    who was shown the list, which is what `anyway` records.
  */
  it("refuses the same name and brand, and takes anyway for an answer", async () => {
    const held = {
      products: [{ id: "prd_1", name: "Nitrile gloves, blue", brand: "Ansell" }],
    };
    const why = await refusing({ ...GOOD, brand: "Ansell" }, held);
    expect(why.code).toBe("inventory.resembles");
    expect(why.values.name).toBe("Nitrile gloves, blue");

    const { c, rows } = world(held);
    await register.handler(c as never, { ...GOOD, brand: "Ansell", anyway: true } as never);
    expect(rows("product")).toHaveLength(1);
  });

  /* ⚠️ AND A DIFFERENT BRAND IS A DIFFERENT PRODUCT, never a resemblance. */
  it("says nothing about the same name under another brand", async () => {
    const { c, rows } = world({
      products: [{ id: "prd_1", name: "Nitrile gloves, blue", brand: "Ansell" }],
    });
    await register.handler(c as never, { ...GOOD, brand: "Unigloves" } as never);
    expect(rows("product")).toHaveLength(1);
  });
});

describe("what one press writes", () => {
  /*
    ⚠️ ONE PRESS, ONE PRODUCT, AND EVERYTHING THAT BELONGS TO IT. Written as four
    calls the second can fail and leave a product nobody can scan, in a catalogue
    where the way you find things is scanning them.
  */
  it("writes the product, its codes, its tags and its suppliers together", async () => {
    const { c, rows } = world();
    const got = await register.handler(c as never, {
      ...GOOD, brand: "Ansell",
      codes: [{ value: "05012345678900", kind: "gtin", pack: 1 },
        { value: "15012345678907", kind: "gtin", pack: 100 }],
      tags: ["PPE", "Consumable"],
      sources: [{ supplier: "sup_1", ref: "NG-BLU-M" }],
    } as never) as { product: string; codes: number; tags: number; sources: number };

    expect(got.product).toMatch(/^prd_/);
    expect(rows("product")).toHaveLength(1);
    expect(rows("code")).toHaveLength(2);
    expect(rows("tagging")).toHaveLength(2);
    expect(rows("sourcing")).toHaveLength(1);
    expect(got).toMatchObject({ codes: 2, tags: 2, sources: 1 });
  });

  /*
    ⚠️ A TAG IS MATCHED BEFORE IT IS MINTED, WHICH IS THE WHOLE POINT OF THE
    TABLE. "Cleaning" typed today and "cleaning" typed in March are one word;
    minting the second makes the catalogue unfilterable by the thing it was filed
    under, one morning at a time.
  */
  it("joins a tag that exists instead of making a second one", async () => {
    const { c, rows } = world({ tags: [{ id: "tag_ppe", name: "PPE" }] });
    await register.handler(c as never, { ...GOOD, tags: ["ppe", "Consumable"] } as never);
    expect(rows("tag")).toHaveLength(1);
    expect(rows("tagging")).toHaveLength(2);
    expect(rows("tagging").some((r) => r.values.includes("tag_ppe"))).toBe(true);
  });

  it("files one word once, however many times it is sent", async () => {
    const { c, rows } = world();
    await register.handler(c as never, { ...GOOD, tags: ["PPE", "ppe", " PPE "] } as never);
    expect(rows("tagging")).toHaveLength(1);
  });

  /*
    ⚠️ EVERY PICTURE THIS WRITES IS ONE SOMEBODY TOOK — `made` is 0 on every row,
    and it is a fact about the image rather than a convention. A generated
    picture is what a model believes a product looks like, which in a warehouse
    is a different KIND of thing from a photograph of the actual one; nothing in
    this deployment can make one yet, and a row claiming otherwise would be a lie
    in the one place the distinction matters.
  */
  it("never marks a picture as made by a model", async () => {
    const { c, rows } = world();
    await register.handler(c as never, {
      ...GOOD, photo: "med_1", shots: ["med_2", "med_3"],
    } as never);
    expect(rows("shot")).toHaveLength(2);
    for (const row of rows("shot")) {
      /* ⚠️ A LITERAL RATHER THAN A BOUND VALUE, AND THE ASSERTION SAYS SO. A
         `made` this handler could be TOLD is a parameter an agent can set, and
         then "a model drew it" is a claim any caller can make about a
         photograph — or deny about a picture a model did draw. */
      expect(row.sql).toMatch(/VALUES \(\?, \?, \?, \?, 0, /);
      expect(row.values).not.toContain(true);
    }
  });

  /* ⚠️ Six at most, the same cap `product.see` takes — see `SEEN_MOST`. */
  it("keeps at most six pictures", async () => {
    const { c, rows } = world();
    await register.handler(c as never, {
      ...GOOD, shots: ["a", "b", "c", "d", "e", "f", "g", "h"],
    } as never);
    expect(rows("shot")).toHaveLength(6);
  });

  /* ⚠️ A code with no value is a row somebody left blank, not a barcode. */
  it("ignores an empty barcode row", async () => {
    const { c, rows } = world();
    await register.handler(c as never, {
      ...GOOD, codes: [{ value: "" }, { value: "  " }, { value: "ABC123" }],
    } as never);
    expect(rows("code")).toHaveLength(1);
  });

  /* ⚠️ A pack is at least one: a code printed on a thing holding none of it
     would make every scan of that code record nothing. */
  it("never records a pack below one", async () => {
    const { c, rows } = world();
    await register.handler(c as never, {
      ...GOOD, codes: [{ value: "ABC123", pack: 0 }],
    } as never);
    expect(rows("code")[0]?.values).toContain(1);
  });
});
