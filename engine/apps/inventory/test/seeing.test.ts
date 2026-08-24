/**
 * SIX PHOTOGRAPHS OF A THING, AND WHAT IS REFUSED BEFORE ANYBODY IS CHARGED.
 *
 * ⚠️ EVERY REFUSAL HERE COSTS NOTHING AND THE ALTERNATIVE COSTS MONEY. A reserve
 * is taken the moment the run starts, so a request that was never going to work
 * — forty megabytes, a string that is not a picture, nine photographs of the
 * same box — is a hold, a round trip and a provider error, arriving as "we could
 * not read that" minutes after somebody pressed a button. Refused at the door it
 * is a sentence naming the thing to fix.
 *
 * ⚠️ AND THE HAPPY PATH ASSERTS WHAT REACHED THE MODEL, because the failure it
 * guards is silent: a handler that filtered its own pictures away would ask a
 * vision model a question with nothing to look at, and get a fluent invented
 * product record back for full price.
 */

import { describe, expect, it } from "vitest";
import { INVENTORY } from "../src/index.js";

const see = INVENTORY.operations.find((o) => o.id === "product.see")!;

const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const photos = (n: number) => Array.from({ length: n }, (_, i) => `${PHOTO}${i}`);

/** ⚠️ What a refusal actually was, rather than that one happened. */
interface Refusal {
  readonly code: string;
  readonly values: Record<string, string>;
  readonly extra: { fields?: Record<string, string>; ref?: string } | undefined;
}

class Refused extends Error {
  constructor(readonly it: Refusal) { super(it.code); }
}

/** ⚠️ Records the pictures rather than answering about them — see the header. */
function ctx(answer = "{}") {
  const looked: string[][] = [];
  return {
    looked,
    c: {
      db: {}, tenantId: "ten_1", now: "2026-08-24T00:00:00.000Z", reach: null,
      fail(code: string, values: Record<string, string> = {}, extra?: Refusal["extra"]): never {
        throw new Refused({ code, values, extra });
      },
      async setting() { return undefined; },
      async generate(_values: unknown, look?: { images?: readonly string[] }) {
        looked.push([...(look?.images ?? [])]);
        return { text: answer, credits: 1 };
      },
    },
  };
}

const refusing = async (input: unknown): Promise<Refusal> => {
  const { c } = ctx();
  try {
    await see.handler(c as never, input as never);
  } catch (why) {
    if (why instanceof Refused) return why.it;
    throw why;
  }
  throw new Error("it answered where it should have refused");
};

describe("asking what a thing is from photographs of it", () => {
  it("refuses an empty set, and says to take one", async () => {
    const why = await refusing({ images: [] });
    expect(why.code).toBe("platform.invalid");
    expect(why.extra?.fields?.images).toBe("Take a photo first");
  });

  /* ⚠️ Anything that is not a list is an empty one, not a crash. A caller that
     sent `{images: "data:..."}` meant one picture and typed it wrong. */
  it("treats a value that is not a list as none at all", async () => {
    expect((await refusing({ images: PHOTO })).extra?.fields?.images)
      .toBe("Take a photo first");
  });

  /*
    ⚠️ THE CAP IS A JUDGEMENT AND IT IS ENFORCED, because past about six the
    answer stops improving while every extra picture is still a reserve spent.
    Seven is refused rather than trimmed: silently dropping the last one would
    make a person wonder why the angle they cared about was ignored.
  */
  it("refuses more than six", async () => {
    const why = await refusing({ images: photos(7) });
    expect(why.code).toBe("platform.invalid");
    expect(why.extra?.fields?.images).toBe("6 photos at most");
  });

  it("allows exactly six", async () => {
    const { c, looked } = ctx();
    await see.handler(c as never, { images: photos(6) } as never);
    expect(looked[0]).toHaveLength(6);
  });

  it("refuses a string that is not a picture", async () => {
    const why = await refusing({ images: [PHOTO, "https://example.com/a.jpg"] });
    expect(why.code).toBe("platform.invalid");
    expect(why.extra?.fields?.images).toBe("One of those is not a photo");
  });

  /*
    ⚠️ THE TOTAL, NOT THE LARGEST. Six photographs straight off a phone are each
    under any per-picture limit worth setting and together are more than the
    request can carry — which is why the check sums rather than compares.
  */
  it("refuses a set that is too big to send, and says how big", async () => {
    const huge = Array.from({ length: 4 }, () => `data:image/jpeg;base64,${"A".repeat(3_000_000)}`);
    const why = await refusing({ images: huge });
    expect(why.code).toBe("platform.too_large");
    expect(why.values.most).toBe("8 MB");
    expect(why.values.size).toBe("12 MB");
  });

  /*
    ⚠️ EVERY PICTURE REACHES THE MODEL, IN ORDER. The front, the back and the cap
    identify a product that no single one of them does, and a handler that sent
    the first would answer just as fluently about a bottle it had seen one side
    of — at the price of all three.
  */
  it("sends every picture it was given, in order", async () => {
    const { c, looked } = ctx();
    const all = photos(3);
    await see.handler(c as never, { images: all } as never);
    expect(looked).toEqual([all]);
  });

  /*
    ⚠️ AND IT SUGGESTS, WHICH IS THE RULE THE WHOLE AI LANE IS BUILT ON (§6.2).
    Nothing here writes a product; the answer goes back to the sheet that asked
    and a person presses the button that commits it.
  */
  it("answers what it worked out and writes nothing", async () => {
    const { c } = ctx(JSON.stringify({
      name: "Nitrile gloves, blue", brand: "Ansell",
      description: "A box of 100 disposable blue nitrile gloves, medium.",
      unit: "glove", pack: 100, tracking: "counted", why: "No expiry, high volume",
      tags: ["PPE", "Consumable"],
    }));
    const got = await see.handler(c as never, { images: photos(2) } as never) as {
      name: string; description: string; tags: readonly string[]; pack: number;
    };
    expect(got.name).toBe("Nitrile gloves, blue");
    expect(got.description).toBe("A box of 100 disposable blue nitrile gloves, medium.");
    expect(got.tags).toEqual(["PPE", "Consumable"]);
    expect(got.pack).toBe(100);
  });

  /*
    ⚠️ HAZARDS ARE NOT ASKED FOR HERE AT ALL, and the prompt says so in words. A
    classification read off a shape and a colour is a legal declaration nobody
    made; `product.read` answers that question against the printed label, where
    it is legible.
  */
  it("never asks a photograph about hazard classes", () => {
    /* ⚠️ SEEING ONE AND CLASSIFYING IT ARE DIFFERENT ACTS, and the prompt has to
       ask for the first while forbidding the second — an earlier version
       forbade both, and the model then answered about the shape of a bottle
       while holding a photograph of the label. */
    expect(see.ai?.prompt).toMatch(/Do not say which hazard class it/);
    expect(see.ai?.prompt).toMatch(/do not list H or P statements/);
    expect(see.ai?.prompt).not.toMatch(/\bhazards\b/);
  });

  /*
    ⚠️ THE LABEL IS WHERE THE FACTS ARE, and asking the model to ignore it threw
    away the net contents, the exact printed name, the storage line and the
    shelf life — all of which are printed there and nowhere else on the box.
  */
  it("reads the label where one is among the pictures", () => {
    expect(see.ai?.prompt).toMatch(/If one of the pictures shows the label, READ IT/);
  });

  /*
    ⚠️ A DURATION, NEVER A DATE. A printed expiry belongs to the delivery that
    carried it; put on the catalogue row it would expire every future delivery
    of that product on the same day.
  */
  it("asks for a shelf life as days and refuses a date", () => {
    expect(see.ai?.prompt).toMatch(/NEVER answer with a date/);
    expect(see.ai?.prompt).toMatch(/`shelfDays` is how long it keeps FROM THE DAY IT WAS MADE/);
  });

  /*
    ⚠️ AND THE WORKSPACE'S OWN WORDS GO WITH THE QUESTION. Asking a model to
    categorise against nothing produces "Cleaning", "Cleaning products" and
    "Janitorial" across three mornings, every one defensible and the catalogue
    unfilterable — so `known` is a declared variable rather than a convention.
  */
  it("sends the tags this workspace already uses", () => {
    expect(see.ai?.variables).toContain("known");
    expect(see.ai?.prompt).toMatch(/\{known\}/);
  });

  /* ⚠️ A refusal with no model is a refusal, never an invented catalogue row. */
  it("refuses when the deployment cannot generate at all", async () => {
    const { c } = ctx();
    const without = { ...c, generate: undefined };
    await expect(see.handler(without as never, { images: photos(1) } as never))
      .rejects.toThrow("platform.unavailable");
  });
});
