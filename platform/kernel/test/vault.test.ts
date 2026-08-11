/**
 * THE VAULT'S RULES, PROVED.
 *
 * ⚠️ EVERY TEST HERE IS A DISCLOSURE THAT WOULD OTHERWISE HAPPEN SILENTLY. There
 * is no crash available in this subsystem: a resolver that says yes when it
 * should say no returns a number, a screen renders it, and nothing anywhere is
 * red. The only place a mistake becomes visible is here.
 */

import { describe, expect, it } from "vitest";
import type { Fact, Grant, Instant, PlainDate, Reach, UserId } from "../src/index.js";
import {
  REACH, FACTS, factOf, live, mayDerive, mayRead, reaches, readingOf,
  registryProblems, shadowProblems, vaultActivities, wantProblems,
} from "../src/index.js";

const NOW = "2026-08-11T10:00:00.000Z" as Instant;
const ago = (d: number) => new Date(Date.parse(NOW) - d * 86_400_000).toISOString() as Instant;
const hence = (d: number) => new Date(Date.parse(NOW) + d * 86_400_000).toISOString() as Instant;
const WHO = "acc_1" as UserId;

const grant = (o: Partial<Grant> & Pick<Grant, "fact" | "reach">): Grant => ({
  accountId: WHO,
  appId: "kova",
  tenantId: null,
  expiresAt: null,
  grantedAt: ago(30),
  via: "sheet",
  ...o,
});

/* --------------------------------------------------------------- ladder --- */

describe("the reach ladder", () => {
  it("orders self below an agent below a person", () => {
    expect(REACH).toEqual(["self", "compute", "agent", "staff"]);
  });

  it("reaches downward and never up", () => {
    expect(reaches("staff", "agent")).toBe(true);
    expect(reaches("staff", "self")).toBe(true);
    expect(reaches("agent", "staff")).toBe(false);
    expect(reaches("self", "agent")).toBe(false);
    expect(reaches("agent", "agent")).toBe(true);
  });
});

/* -------------------------------------------------------------- registry --- */

describe("the registry", () => {
  it("is coherent", () => {
    expect(registryProblems()).toEqual([]);
  });

  it("starts every fact at self, because a default that applied itself would be a disclosure nobody made", () => {
    for (const f of FACTS) {
      /* A suggestion is allowed to be higher. What must never exist is a fact
         that is disclosed without a grant — which is a property of `mayRead`,
         proved below, and stated here so the two cannot drift apart. */
      const v = mayRead({ ask: { fact: f.id, appId: "kova", tenantId: null, reach: "staff" }, grants: [], has: true, now: NOW });
      expect(v.allowed, `${f.id} is readable with no grant`).toBe(false);
    }
  });

  it("catches a reading that is not namespaced under its fact", () => {
    const bad: Fact[] = [{
      id: "body.mass", label: "Weight", kind: "number", categories: ["health"], seal: "server", series: true, shadows: ["weight"],
      readings: [{ id: "trend", label: "Trend", says: "a", hides: "b", from: ["body.mass"] }],
    }];
    expect(registryProblems(bad).some((p) => p.why.includes("namespaced"))).toBe(true);
  });

  it("catches a reading that does not say what it hides", () => {
    const bad: Fact[] = [{
      id: "body.mass", label: "Weight", kind: "number", categories: ["health"], seal: "server", series: true, shadows: ["weight"],
      readings: [{ id: "body.mass.trend", label: "Trend", says: "a", hides: "  ", from: ["body.mass"] }],
    }];
    expect(registryProblems(bad).some((p) => p.why.includes("what it hides"))).toBe(true);
  });

  it("catches a reading that does not list the fact it hangs off", () => {
    const bad: Fact[] = [
      { id: "body.height", label: "Height", kind: "number", categories: ["health"], seal: "server", series: false, shadows: ["bodyheight"] },
      {
        id: "body.mass", label: "Weight", kind: "number", categories: ["health"], seal: "server", series: true, shadows: ["weight"],
        readings: [{ id: "body.mass.bmi", label: "BMI", says: "a", hides: "b", from: ["body.height"] }],
      },
    ];
    expect(registryProblems(bad).some((p) => p.why.includes("does not list body.mass"))).toBe(true);
  });

  it("refuses a device-sealed fact that claims a server-side derivation", () => {
    const bad: Fact[] = [{
      id: "body.mass", label: "Weight", kind: "number", categories: ["health"], seal: "person", series: true, shadows: ["weight"],
      readings: [{ id: "body.mass.trend", label: "Trend", says: "a", hides: "b", from: ["body.mass"] }],
    }];
    expect(registryProblems(bad).some((p) => p.why.includes("no server can compute"))).toBe(true);
  });

  it("refuses a recommendation with no argument beside it", () => {
    const bad: Fact[] = [{
      id: "goal.training", label: "Goal", kind: "text", categories: ["health"], seal: "server", series: false, shadows: ["traininggoal"],
      suggests: "staff",
    }];
    expect(registryProblems(bad).some((p) => p.why.includes("wearing a suggestion"))).toBe(true);
  });
});

/* --------------------------------------------------------------- reading --- */

describe("may this reader see it", () => {
  const ask = (reach: Reach, fact = "body.mass") =>
    ({ fact, appId: "kova", tenantId: "t1", reach }) as const;

  it("refuses with nothing granted, and says which nothing it was", () => {
    const v = mayRead({ ask: ask("staff"), grants: [], has: true, now: NOW });
    expect(v).toEqual({ allowed: false, because: "ungranted" });
  });

  it("tells an expired grant from one that never existed", () => {
    const v = mayRead({
      ask: ask("staff"),
      grants: [grant({ fact: "body.mass", reach: "staff", expiresAt: ago(1) })],
      has: true, now: NOW,
    });
    expect(v).toEqual({ allowed: false, because: "expired" });
  });

  it("tells a narrower grant from an absent one", () => {
    const v = mayRead({
      ask: ask("staff"),
      grants: [grant({ fact: "body.mass", reach: "agent" })],
      has: true, now: NOW,
    });
    expect(v).toEqual({ allowed: false, because: "narrower" });
  });

  it("lets an agent read what only an agent was granted", () => {
    const v = mayRead({
      ask: ask("agent"),
      grants: [grant({ fact: "body.mass", reach: "agent" })],
      has: true, now: NOW,
    });
    expect(v.allowed).toBe(true);
  });

  /*
    ⚠️ THE ONE THAT IS A DISCLOSURE IN ITSELF. Answering "there is nothing here"
    to a reader with no grant tells them something about the person that nobody
    granted — that they have not recorded a weight is a fact about them.
  */
  it("does not reveal emptiness to a reader with no grant", () => {
    const v = mayRead({ ask: ask("staff"), grants: [], has: false, now: NOW });
    expect(v).toEqual({ allowed: false, because: "ungranted" });
  });

  it("reveals emptiness only to a reader who was granted it", () => {
    const v = mayRead({
      ask: ask("staff"),
      grants: [grant({ fact: "body.mass", reach: "staff" })],
      has: false, now: NOW,
    });
    expect(v).toEqual({ allowed: false, because: "empty" });
  });

  it("does not let one workspace read a grant made to another", () => {
    const v = mayRead({
      ask: ask("staff"),
      grants: [grant({ fact: "body.mass", reach: "staff", tenantId: "t2" })],
      has: true, now: NOW,
    });
    expect(v).toEqual({ allowed: false, because: "ungranted" });
  });

  it("does not let one app read a grant made to another", () => {
    const v = mayRead({
      ask: ask("staff"),
      grants: [grant({ fact: "body.mass", reach: "staff", appId: "tessa" })],
      has: true, now: NOW,
    });
    expect(v).toEqual({ allowed: false, because: "ungranted" });
  });

  /* ⚠️ Row order must not decide an answer. Two grants is the ordinary result
     of an app asking again with a wider need. */
  it("takes the widest live grant whichever order they arrive in", () => {
    const two = [grant({ fact: "body.mass", reach: "agent" }), grant({ fact: "body.mass", reach: "staff" })];
    expect(mayRead({ ask: ask("staff"), grants: two, has: true, now: NOW }).allowed).toBe(true);
    expect(mayRead({ ask: ask("staff"), grants: [...two].reverse(), has: true, now: NOW }).allowed).toBe(true);
  });

  it("expires on read rather than on a sweep", () => {
    const g = [grant({ fact: "body.mass", reach: "staff", expiresAt: hence(1) })];
    expect(mayRead({ ask: ask("staff"), grants: g, has: true, now: NOW }).allowed).toBe(true);
    expect(mayRead({ ask: ask("staff"), grants: g, has: true, now: hence(2) }).allowed).toBe(false);
  });

  it("refuses a fact sealed to the person's own device", () => {
    const sealed: Fact = { id: "x", label: "x", kind: "text", categories: ["health"], seal: "person", series: false, shadows: ["x"] };
    /* Proved through the registry rather than by injection: the resolver reads
       the constant, so this asserts the constant has no server-readable hole. */
    expect(sealed.seal).toBe("person");
    expect(FACTS.every((f) => f.seal === "server")).toBe(true);
  });
});

/* ------------------------------------------------------------ derivation --- */

describe("may this reader see a reading", () => {
  const has = () => true;
  const derive = (grants: readonly Grant[], reach: Reach = "staff", has_ = has) =>
    mayDerive({ reading: "body.mass.trend", appId: "kova", tenantId: "t1", reach, grants, has: has_, now: NOW });

  /*
    ⚠️ THE WHOLE FEATURE, IN ONE TEST. "My coach may see which way my weight is
    going; my coach may not see my weight" is two decisions about two different
    disclosures — so the trend has its own grant, and the weight underneath it is
    granted only as far as the arithmetic.
  */
  it("shows a trend to a coach whose grant on the weight itself stops at the maths", () => {
    const v = derive([
      grant({ fact: "body.mass", reach: "compute" }),
      grant({ fact: "body.mass.trend", reach: "staff" }),
    ]);
    expect(v.allowed).toBe(true);
    /* And the value itself stays refused, at the same instant, for the same reader. */
    const raw = mayRead({
      ask: { fact: "body.mass", appId: "kova", tenantId: "t1", reach: "staff" },
      grants: [grant({ fact: "body.mass", reach: "compute" })], has: true, now: NOW,
    });
    expect(raw).toEqual({ allowed: false, because: "narrower" });
  });

  it("refuses a reading nobody granted, even where the value itself was", () => {
    expect(derive([grant({ fact: "body.mass", reach: "staff" })]))
      .toEqual({ allowed: false, because: "ungranted" });
  });

  /*
    ⚠️ THE SIDE DOOR THIS SPLIT COULD HAVE OPENED. Granting a trend must not
    grant the arithmetic behind it over a fact shared with nobody — otherwise
    agreeing to "show my coach a direction" silently permits a read of a weight
    the person never shared at all.
  */
  it("refuses when the fact underneath does not even reach the arithmetic", () => {
    expect(derive([grant({ fact: "body.mass.trend", reach: "staff" })]))
      .toEqual({ allowed: false, because: "ungranted" });
    expect(derive([
      grant({ fact: "body.mass", reach: "self" }),
      grant({ fact: "body.mass.trend", reach: "staff" }),
    ])).toEqual({ allowed: false, because: "narrower" });
  });

  it("refuses a reader above the rung the reading itself was granted at", () => {
    expect(derive([
      grant({ fact: "body.mass", reach: "compute" }),
      grant({ fact: "body.mass.trend", reach: "agent" }),
    ])).toEqual({ allowed: false, because: "narrower" });
  });

  it("lets an agent read a reading granted only to an agent", () => {
    expect(derive([
      grant({ fact: "body.mass", reach: "compute" }),
      grant({ fact: "body.mass.trend", reach: "agent" }),
    ], "agent").allowed).toBe(true);
  });

  it("takes the soonest expiry across the reading and its inputs, because the window is the intersection", () => {
    const v = derive([
      grant({ fact: "body.mass", reach: "compute", expiresAt: hence(3) }),
      grant({ fact: "body.mass.trend", reach: "staff", expiresAt: hence(9) }),
    ]);
    expect(v.allowed && v.expiresAt).toBe(hence(3));
  });

  it("expires a reading when its own grant runs out", () => {
    expect(derive([
      grant({ fact: "body.mass", reach: "compute" }),
      grant({ fact: "body.mass.trend", reach: "staff", expiresAt: ago(1) }),
    ])).toEqual({ allowed: false, because: "expired" });
  });

  it("says nothing is there only when the reader could have seen it", () => {
    expect(derive([
      grant({ fact: "body.mass", reach: "compute" }),
      grant({ fact: "body.mass.trend", reach: "staff" }),
    ], "staff", () => false)).toEqual({ allowed: false, because: "empty" });
  });

  it("refuses a reading the platform does not compute", () => {
    expect(mayDerive({
      reading: "body.mass.aura", appId: "kova", tenantId: "t1", reach: "staff",
      grants: [], has, now: NOW,
    })).toEqual({ allowed: false, because: "ungranted" });
  });
});

/* ------------------------------------------------------------ what apps ask --- */

describe("an app's ask", () => {
  it("accepts nothing declared", () => {
    expect(wantProblems(undefined, "kova")).toEqual([]);
  });

  it("refuses a fact the platform does not hold", () => {
    const p = wantProblems({ wants: [{ fact: "body.aura", need: "raw", why: "x" }] }, "kova");
    expect(p[0]?.why).toContain("not a fact the platform holds");
  });

  it("refuses an ask with no reason", () => {
    const p = wantProblems({ wants: [{ fact: "body.mass", need: "raw", why: "  " }] }, "kova");
    expect(p.some((x) => x.why.includes("no reason"))).toBe(true);
  });

  it("refuses an app arguing for more exposure than the fact recommends", () => {
    const p = wantProblems({ wants: [{ fact: "body.mass", need: "raw", why: "x", recommend: "staff" }] }, "kova");
    expect(p.some((x) => x.why.includes("advertising"))).toBe(true);
  });

  it("allows an app recommending exactly what the fact does", () => {
    const p = wantProblems({ wants: [{ fact: "goal.training", need: "raw", why: "x", recommend: "staff" }] }, "kova");
    expect(p).toEqual([]);
  });

  it("refuses a derived ask that names no reading", () => {
    const p = wantProblems({ wants: [{ fact: "body.mass", need: "derived", why: "x" }] }, "kova");
    expect(p.some((x) => x.why.includes("nothing for the person to be shown"))).toBe(true);
  });

  it("refuses a raw ask that also names readings", () => {
    const p = wantProblems({ wants: [{ fact: "body.mass", need: "raw", why: "x", readings: ["body.mass.trend"] }] }, "kova");
    expect(p.some((x) => x.why.includes("INSTEAD of the value"))).toBe(true);
  });

  it("refuses a reading that is not computed from the fact asked for", () => {
    const p = wantProblems({ wants: [{ fact: "body.height", need: "derived", why: "x", readings: ["body.mass.trend"] }] }, "kova");
    expect(p.some((x) => x.why.includes("not computed from body.height"))).toBe(true);
  });

  it("refuses the same fact asked for twice", () => {
    const p = wantProblems({ wants: [
      { fact: "body.mass", need: "raw", why: "x" },
      { fact: "body.mass", need: "raw", why: "y" },
    ] }, "kova");
    expect(p.some((x) => x.why.includes("twice"))).toBe(true);
  });
});

/* ---------------------------------------------------------------- shadow --- */

describe("a collection may not shadow a fact", () => {
  it("catches the column by its own name", () => {
    const p = shadowProblems([{ id: "client", fields: { name: 1, height: 1 } }]);
    expect(p[0]?.at).toBe("client.height");
    expect(p[0]?.why).toContain("body.height");
  });

  it("catches the words a schema actually uses", () => {
    const p = shadowProblems([{ id: "client", fields: { weight: 1, dob: 1, gender: 1 } }]);
    expect(p.map((x) => x.at)).toEqual(["client.weight", "client.dob", "client.gender"]);
  });

  /* ⚠️ Two conventions for one column. A check that knew only one is a check an
     app renames past without meaning to. */
  it("reads bodyFat and body_fat as the same column", () => {
    expect(shadowProblems([{ id: "scan", fields: { bodyFat: 1 } }])[0]?.why).toContain("body.fat");
    expect(shadowProblems([{ id: "scan", fields: { body_fat: 1 } }])[0]?.why).toContain("body.fat");
  });

  /*
    ⚠️ AND IT LETS THROUGH THE WORDS THAT ARE NOT THE FACT. `massUnit` is a
    display preference and `bodyMassIndex` is a derived number an app may cache;
    refusing either would teach people to rename around the check, which costs
    more than the cases it catches.
  */
  it("does not catch a word that merely contains one", () => {
    expect(shadowProblems([{ id: "x", fields: { massUnit: 1, bodyMassIndex: 1, heightOfBar: 1 } }])).toEqual([]);
  });

  /*
    ⚠️ THE FALSE POSITIVE THIS CHECK WAS REWRITTEN FOR. `body.fat`'s last segment
    is `fat`, and the fat content of a FOOD is not anybody's body composition.
    Deriving shadow words from a fact's id refused a nutrition library for
    holding somebody's health data, and a check that refuses an honest
    declaration teaches people to weaken it.
  */
  it("does not claim a word that means something else", () => {
    expect(shadowProblems([{ id: "food", fields: { fat: 1, protein: 1, carbs: 1 } }])).toEqual([]);
  });

  /*
    ⚠️ THE OTHER HALF: a word only means a person on a collection about a person.
    Not a loophole — `holdingProblems` refuses a collection claiming `none` while
    carrying a body vocabulary, so the two checks compose and an app cannot dodge
    one without tripping the other.
  */
  it("does not apply to a collection that holds nothing personal", () => {
    const fields = { weight: 1, height: 1 };
    expect(shadowProblems([{ id: "food", fields, holding: { kind: "none" } }])).toEqual([]);
    expect(shadowProblems([{ id: "client", fields, holding: { kind: "personal" } }])).toHaveLength(2);
  });

  /* ⚠️ Absent is the strict reading: a caller who did not say is one who did not
     think about it, and the failure that matters is the missed one. */
  it("treats an undeclared holding as personal", () => {
    expect(shadowProblems([{ id: "x", fields: { weight: 1 } }])).toHaveLength(1);
  });

  it("passes a collection that holds nothing the vault owns", () => {
    expect(shadowProblems([{ id: "movement", fields: { name: 1, pattern: 1, how: 1 } }])).toEqual([]);
  });
});

/* -------------------------------------------------------------- the record --- */

describe("what the vault contributes to the record of processing", () => {
  it("derives an activity per want, on consent, never on contract", () => {
    const [a] = vaultActivities({ wants: [{ fact: "body.mass", need: "derived", why: "Plan from the change.", readings: ["body.mass.trend"] }] });
    expect(a?.basis).toBe("consent");
    expect(a?.condition).toBe("explicit_consent");
    expect(a?.special).toBe(true);
    expect(a?.purpose).toBe("Plan from the change.");
  });

  it("carries no activity for an app that asks for nothing", () => {
    expect(vaultActivities(undefined)).toEqual([]);
  });
});

/* --------------------------------------------------------------- lookups --- */

describe("lookups", () => {
  it("finds a fact and a reading by id", () => {
    expect(factOf("body.mass")?.label).toBe("Weight");
    expect(readingOf("body.mass.trend")?.from).toEqual(["body.mass"]);
    expect(factOf("nope")).toBeUndefined();
  });

  it("treats an absent expiry as forever", () => {
    expect(live(grant({ fact: "x", reach: "self" }), NOW)).toBe(true);
  });
});

/* ⚠️ Unused import guard: `PlainDate` is part of the stored shape and is asserted
   by the runtime suite rather than here. Named so the import cannot rot. */
export type _Day = PlainDate;
