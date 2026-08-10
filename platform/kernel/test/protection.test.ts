/**
 * WHAT A MANIFEST MUST SAY ABOUT THE PEOPLE IN IT.
 *
 * ⚠️ THE TESTS THAT MATTER HERE ARE THE ANTI-TRICK ONES. Every check in
 * `protection.ts` is satisfiable by one line of text, and one line of text is
 * exactly what somebody writes to make a check go away — so the ones worth
 * having are the ones that refuse a declaration which is syntactically complete
 * and substantively false.
 *
 * ⚠️ AND THE SECOND HALF IS ROT. A sub-processor list is correct on the day it
 * is written; the failure mode is a feature added six months later that sends
 * data somewhere new, with nothing anywhere connecting the two. `disclosureProblems`
 * is the connection, and the tests below are both directions of it.
 */

import { describe, expect, it } from "vitest";
import {
  MAIL_LANES, PLATFORM_INFRASTRUCTURE, PLATFORM_PAYMENTS,
  agreementProblems, disclosureProblems, holdingProblems, protectionProblems, ropaOf,
  type Held, type ProtectionSpec, type Subprocessor,
} from "../src/protection.js";

const held = (id: string, fields: string[], holding: Held["holding"]): Held => ({
  id,
  fields: Object.fromEntries(fields.map((f) => [f, true])),
  retention: { days: null, onTenantClose: "purge" },
  holding,
});

const NOTHING = { kind: "none", why: "A counter. It is a number and nobody's." } as const;

const PERSONAL = {
  kind: "personal",
  categories: ["identity", "contact"],
  subjects: ["member"],
  purpose: "Knowing who is in a workspace.",
  basis: "contract",
} as const;

const sub = (o: Partial<Subprocessor> & { id: string }): Subprocessor => ({
  name: "Somebody, Inc.",
  role: "Does one job.",
  receives: ["usage"],
  where: "Its network.",
  safeguard: "dpf",
  terms: "https://example.test/dpa",
  ...o,
});

/* ------------------------------------------------------------- what is held --- */

describe("a collection says what it holds, and the saying is checked", () => {
  it("accepts an honest nothing and an honest something", () => {
    expect(holdingProblems([held("counter", ["total"], NOTHING), held("member", ["role"], PERSONAL)])).toEqual([]);
  });

  /*
    ⚠️ THE ONE THE WHOLE FILE EXISTS FOR. `{ kind: "none" }` is one line. A
    collection carrying an email address may not claim to hold nothing personal,
    whatever it declares — otherwise the declaration measures diligence rather
    than truth, and the least diligent manifest passes fastest.
  */
  it("refuses a nothing on a collection carrying an email address", () => {
    const out = holdingProblems([held("signup", ["email", "at"], NOTHING)]);
    expect(out).toHaveLength(1);
    expect(out[0]?.why).toMatch(/email/);
  });

  /*
    ⚠️ AND THESE ARE THE CASES THE CHECK MUST NOT REFUSE. A food has a name, a
    movement has a demonstration image, a note can be about an exercise — a check
    that refuses an honest declaration teaches people to weaken it, which costs
    more than the cases it would catch.
  */
  it("leaves an honest catalogue alone", () => {
    expect(holdingProblems([held("food", ["name", "photo", "note"], NOTHING)])).toEqual([]);
  });

  it("refuses a health vocabulary declared as usage", () => {
    const out = holdingProblems([held("reading", ["weight", "sleep"], {
      ...PERSONAL, categories: ["usage"],
    })]);
    expect(out.map((p) => p.why).join(" ")).toMatch(/health/);
  });

  /*
    ⚠️ A LAWFUL BASIS IS NOT AN ARTICLE 9 CONDITION. Special-category processing
    is PROHIBITED unless a condition applies — a different question from why
    processing is lawful at all, and the one everybody answers by answering the
    other.
  */
  it("refuses a special category with no condition, and a condition with no special category", () => {
    expect(holdingProblems([held("scan", ["bodyfat"], {
      ...PERSONAL, categories: ["health"],
    })])[0]?.why).toMatch(/Article 9/);
    expect(holdingProblems([held("member", ["role"], {
      ...PERSONAL, condition: "explicit_consent",
    })])[0]?.why).toMatch(/stricter claim/);
  });

  it("refuses legitimate interests with no balancing written down", () => {
    expect(holdingProblems([held("member", ["role"], {
      ...PERSONAL, basis: "legitimate_interests",
    })])[0]?.why).toMatch(/balancing/);
    expect(holdingProblems([held("member", ["role"], {
      ...PERSONAL, basis: "legitimate_interests", balancing: "They expect a roster; it is the least that works.",
    })])).toEqual([]);
  });

  it("refuses personal data of no category, about nobody, or for nothing", () => {
    expect(holdingProblems([held("a", ["x"], { ...PERSONAL, categories: [] })])[0]?.why).toMatch(/no category/);
    expect(holdingProblems([held("b", ["x"], { ...PERSONAL, subjects: [] })])[0]?.why).toMatch(/about nobody/);
    expect(holdingProblems([held("c", ["x"], { ...PERSONAL, purpose: "  " })])[0]?.why).toMatch(/no purpose/);
  });

  /*
    ⚠️ A MISSING DECLARATION IS A SENTENCE, NOT A STACK TRACE. The type requires
    it, so this only happens where something bypassed the constructor — and a
    check that throws a TypeError turns a problem somebody could fix into an
    error they cannot read.
  */
  it("reports a missing declaration instead of throwing", () => {
    const broken = { id: "ghost", fields: {}, retention: { days: null, onTenantClose: "purge" } } as unknown as Held;
    expect(() => holdingProblems([broken])).not.toThrow();
    expect(holdingProblems([broken])[0]?.why).toMatch(/declares nothing/);
  });
});

/* ------------------------------------------------------------- the declaration --- */

describe("the deployment's own declaration", () => {
  const base: ProtectionSpec = {
    controller: "We control the account.",
    contact: "privacy@example.test",
    assessment: { required: false, note: "Nothing special is held." },
    subprocessors: [sub({ id: "cloudflare" })],
  };

  it("accepts a complete one", () => {
    expect(protectionProblems(base)).toEqual([]);
  });

  it("refuses an unnamed controller, a missing contact and an unreasoned assessment", () => {
    expect(protectionProblems({ ...base, controller: " " })[0]?.at).toBe("controller");
    expect(protectionProblems({ ...base, contact: "" })[0]?.at).toBe("contact");
    expect(protectionProblems({ ...base, assessment: { required: true, note: "" } })[0]?.at).toBe("assessment");
  });

  /*
    ⚠️ A SUB-PROCESSOR WITH NO PROCESSING TERMS IS ONE WE MAY NOT USE. That is
    Article 28 rather than tidiness: without a contract binding them, the
    transfer has no legal basis at all.
  */
  it("refuses one with no terms, no role, no destination or nothing received", () => {
    const one = (o: Partial<Subprocessor>) => protectionProblems({ ...base, subprocessors: [sub({ id: "x", ...o })] })[0]?.why;
    expect(one({ terms: "" })).toMatch(/processing terms/);
    expect(one({ role: " " })).toMatch(/stated role/);
    expect(one({ where: "" })).toMatch(/somewhere unnamed/);
    expect(one({ receives: [] })).toMatch(/receives nothing/);
  });

  it("refuses the same one declared twice", () => {
    expect(protectionProblems({ ...base, subprocessors: [sub({ id: "a" }), sub({ id: "a" })] })[0]?.why)
      .toMatch(/twice/);
  });
});

/* ------------------------------------------------------------- reached vs declared --- */

describe("the list is checked against what the manifest reaches", () => {
  const platform = [sub({ id: PLATFORM_INFRASTRUCTURE }), ...MAIL_LANES.map((id) => sub({ id }))];
  const nothingReached = { models: [], services: [], charges: false };

  /*
    ⚠️ TWO ON AN APP THAT DOES NOTHING, and that is the floor rather than an
    artefact of the test. There is no such thing as a product with no
    sub-processors: it runs on somebody's computers and its sign-in code leaves
    through somebody's mail lane.
  */
  it("demands the infrastructure and the mail lane of every app", () => {
    const out = disclosureProblems(nothingReached, []);
    expect(out.map((p) => p.at).sort()).toEqual([PLATFORM_INFRASTRUCTURE, ...MAIL_LANES].sort());
    expect(disclosureProblems(nothingReached, platform)).toEqual([]);
  });

  it("demands the payment rail as soon as anything has a price", () => {
    expect(disclosureProblems({ ...nothingReached, charges: true }, platform).map((p) => p.at))
      .toEqual([PLATFORM_PAYMENTS]);
    expect(disclosureProblems({ ...nothingReached, charges: true }, [...platform, sub({ id: PLATFORM_PAYMENTS })]))
      .toEqual([]);
  });

  /*
    ⚠️ THIS IS THE ONE THAT MAKES THE LIST STAY RIGHT. Adding a model to the
    catalogue is the whole of how an app comes to send somebody's writing to a
    new company, and it is a one-line change in a file about prices — so it is
    the change nobody connects to a disclosure. Here the two are one act.
  */
  it("demands a disclosure for every model lane the catalogue names", () => {
    const out = disclosureProblems({ ...nothingReached, models: ["gemini", "workers-ai"] }, platform);
    expect(out.map((p) => p.at).sort()).toEqual(["gemini", "workers-ai"]);
  });

  it("demands one for every outbound service", () => {
    expect(disclosureProblems({ ...nothingReached, services: ["openfoodfacts"] }, platform).map((p) => p.at))
      .toEqual(["openfoodfacts"]);
  });

  /*
    ⚠️ AND THE OTHER DIRECTION, which is the one people leave out. A company on a
    sub-processor list that receives nothing is a disclosure that is false in the
    direction that looks careful — and it is the entry nobody removes, because
    removing it feels like claiming less. It found one on its first run.
  */
  it("refuses a sub-processor nothing reaches", () => {
    const out = disclosureProblems(nothingReached, [...platform, sub({ id: "workers-ai" })]);
    expect(out.map((p) => p.at)).toEqual(["workers-ai"]);
    expect(out[0]?.why).toMatch(/false disclosure/);
  });
});

/* ------------------------------------------------------------- forced agreements --- */

describe("what the collections oblige the manifest to have", () => {
  const doc = (id: string) => ({ id, mustAccept: ["owner"] });
  const clean = { required: false, note: "Nothing special." };

  it("asks an impersonal app for its terms and nothing else", () => {
    expect(agreementProblems({ docs: [doc("terms")], collections: [held("counter", ["total"], NOTHING)], assessment: clean }))
      .toEqual([]);
  });

  /*
    ⚠️ THE PRIVACY NOTICE AND THE PROCESSING AGREEMENT BECOME OWED AT THE MOMENT
    THE FIRST COLLECTION HOLDS SOMEBODY'S DATA, which is a moment nothing
    anywhere marks. Reading it off `holding` is what turns "we should write a
    DPA" from a note in somebody's head into a composition that does not boot.
  */
  it("demands a privacy notice and a processing agreement once anything is personal", () => {
    const out = agreementProblems({ docs: [doc("terms")], collections: [held("member", ["role"], PERSONAL)], assessment: clean });
    expect(out.map((p) => p.at).sort()).toEqual(["dpa", "privacy"]);
    expect(out.find((p) => p.at === "dpa")?.why).toMatch(/Article 28/);
  });

  it("stops asking once all three are declared", () => {
    expect(agreementProblems({
      docs: [doc("terms"), doc("privacy"), doc("dpa")],
      collections: [held("member", ["role"], PERSONAL)],
      assessment: clean,
    })).toEqual([]);
  });

  /*
    ⚠️ AND THE ASSESSMENT IS FORCED BY THE SAME DECLARATION. `required: false` on
    an app storing health data is not a judgement — it is the one claim the
    collections in front of it contradict, and it is the default somebody types
    without thinking about it.
  */
  it("refuses required:false where a special category is held, and names the collection", () => {
    const out = agreementProblems({
      docs: [doc("terms"), doc("privacy"), doc("dpa")],
      collections: [held("scan", ["bodyfat"], { ...PERSONAL, categories: ["health"], condition: "explicit_consent" })],
      assessment: clean,
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.at).toBe("assessment");
    expect(out[0]?.why).toMatch(/scan/);
  });

  it("accepts it once somebody owns the assessment", () => {
    expect(agreementProblems({
      docs: [doc("terms"), doc("privacy"), doc("dpa")],
      collections: [held("scan", ["bodyfat"], { ...PERSONAL, categories: ["health"], condition: "explicit_consent" })],
      assessment: { required: true, note: "Owed before the first paying workspace. Not complete." },
    })).toEqual([]);
  });
});

/* ------------------------------------------------------------- the record --- */

describe("the Article 30 record is produced, never maintained", () => {
  const spec: ProtectionSpec = {
    controller: "We control the account; each workspace controls its own records.",
    contact: "privacy@example.test",
    assessment: { required: true, note: "Owed." },
    subprocessors: [sub({ id: "cloudflare" })],
  };
  const record = ropaOf({
    collections: [
      held("counter", ["total"], NOTHING),
      held("member", ["role"], PERSONAL),
      held("scan", ["bodyfat"], { ...PERSONAL, categories: ["health"], condition: "explicit_consent" }),
    ],
    protection: spec,
    regions: ["eu", "us"],
  });

  /*
    ⚠️ A COLLECTION THAT HOLDS NOTHING IS NOT AN ACTIVITY. A record listing it
    describes processing of personal data that does not happen, which is the same
    kind of wrong as omitting one that does.
  */
  it("lists one activity per collection that holds something", () => {
    expect(record.activities.map((a) => a.collection)).toEqual(["member", "scan"]);
  });

  it("carries the retention from the collection rather than from a sentence", () => {
    expect(record.activities[0]?.keptForDays).toBe(null);
    expect(record.activities[0]?.onClose).toBe("purge");
  });

  /* ⚠️ Article 35's trigger, computed. Not a box somebody ticked. */
  it("flags the record as special where any activity is", () => {
    expect(record.special).toBe(true);
    expect(record.activities.find((a) => a.collection === "member")?.special).toBe(false);
    expect(record.activities.find((a) => a.collection === "scan")?.special).toBe(true);
  });

  it("carries the regions, the recipients and the contact", () => {
    expect(record.regions).toEqual(["eu", "us"]);
    expect(record.subprocessors.map((p) => p.id)).toEqual(["cloudflare"]);
    expect(record.contact).toBe("privacy@example.test");
    expect(record.controller).toMatch(/each workspace controls/);
  });
});
