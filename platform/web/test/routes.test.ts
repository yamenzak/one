/**
 * THE ADDRESSES, HELD TO A ROUND TRIP.
 *
 * ⚠️ A PARSER AND A PRINTER THAT DISAGREE FAIL IN THE MOST CONFUSING WAY THERE
 * IS. Every navigation prints a path and the next load parses it, so a pair that
 * do not invert each other produce a surface that works until somebody reloads —
 * and then opens somewhere else, once, with nothing in the console.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { keyOf, parseWhere, pathOf, upFrom, type Where } from "../src/hub/routes.js";

/*
  ⚠️ EVERY MEMBER OF THE UNION, AND THE LAST TEST IN THIS FILE CHECKS THAT. A
  destination missing from this list is a destination nothing here holds to a
  round trip or to a screen — which is the same silence the guard below exists to
  break, one level up.
*/
const EVERY: readonly Where[] = [
  { at: "home" },
  { at: "account" },
  { at: "workspaces" },
  { at: "workspace", tenant: "t1" },
  { at: "ai", tenant: "t1" },
  { at: "people", tenant: "t1" },
  { at: "plan", subscription: "sub_1" },
  { at: "console" },
  { at: "product-config", product: "kova" },
  { at: "catalogue", product: "kova" },
  { at: "shared-config" },
  { at: "models" },
  { at: "tenants" },
  { at: "maintenance" },
  { at: "details" },
  { at: "security" },
  { at: "preferences" },
  { at: "preferences", part: "appearance" },
  { at: "preferences", part: "reading" },
  { at: "preferences", part: "feedback" },
  { at: "vault" },
  { at: "market" },
  { at: "shelf", product: "kova" },
  { at: "credits" },
  { at: "legal" },
  { at: "product", product: "" },
  { at: "product", product: "kova" },
  { at: "receiving", product: "" },
  { at: "receiving", product: "kova" },
  { at: "recipient", product: "", recipient: "cloudflare" },
  { at: "recipient", product: "kova", recipient: "stripe" },
  { at: "document", product: "", document: "account-terms" },
  { at: "document", product: "kova", document: "privacy" },
  { at: "export" },
  { at: "close" },
];

describe("every screen in the hub has an address", () => {
  it("prints and parses back to the same place, for every one of them", () => {
    for (const where of EVERY) {
      expect(parseWhere(pathOf(where)), pathOf(where)).toEqual(where);
    }
  });

  /* ⚠️ A PATH IS A STRING SOMEBODY CAN TYPE, AN OLD LINK CAN CARRY AND A
     REDIRECT CAN MANGLE. Parsing has to be total, and the safe answer is the
     surface's own root rather than a screen rendering nothing. */
  it("answers the home for anything it cannot read", () => {
    for (const junk of ["", "/", "nonsense", "../../etc", "?", "%%%"]) {
      expect(parseWhere(junk), junk).toEqual({ at: "home" });
    }
    /* ⚠️ EMPTY SEGMENTS ARE DROPPED RATHER THAN CARRIED. A path with a double
       slash in it is a link that went through one rewrite too many, and reading
       it as a product whose id is the empty string would silently open the
       ACCOUNT — the one product where the empty id means something. */
    expect(parseWhere("legal//")).toEqual({ at: "legal" });
    /* ⚠️ AND A DEEPER PATH IS THE DEEPEST THING IT CAN NAME, not a failure. */
    expect(parseWhere("legal/kova/who/extra/bits")).toEqual({ at: "recipient", product: "kova", recipient: "extra" });
    /* ⚠️ A part nobody declared is the category hub, not a blank category. */
    expect(parseWhere("preferences/nope")).toEqual({ at: "preferences" });
  });

  /*
    ⚠️ THE ACCOUNT'S OWN `appId` IS THE EMPTY STRING — how the runtime says "this
    is the deployment" — and a path cannot carry one. The spelling is stated in
    exactly one place, so a screen cannot invent a second word for it.
  */
  it("gives the account a segment, because an empty id is not a path", () => {
    expect(pathOf({ at: "product", product: "" })).toBe("legal/account");
    expect(parseWhere("legal/account")).toEqual({ at: "product", product: "" });
    /* And an app that is genuinely called "account" is unreachable — which is why
       `legalProblems` refuses that app id rather than this file handling it. */
  });

  /*
    ⚠️ THE STACK RECONCILES ON THE PATH, NOT ON THE SCREEN'S NAME. Two products'
    pages are one screen at two addresses; keyed by name they would be reconciled
    as the same element, and the second would arrive holding the first's scroll
    position and whatever it had in a field.
  */
  it("keys two products' pages apart", () => {
    expect(keyOf({ at: "product", product: "kova" })).not.toBe(keyOf({ at: "product", product: "scena" }));
    expect(keyOf({ at: "home" })).toBeNull();
  });

  /*
    ⚠️ UP IS DERIVED, NEVER CARRIED. A screen that knew where it came from would
    be a screen that behaves differently when it is deep-linked to — the one thing
    the stack refuses to let a screen know.
  */
  it("goes up one level rather than out", () => {
    expect(upFrom({ at: "document", product: "kova", document: "terms" })).toEqual({ at: "product", product: "kova" });
    expect(upFrom({ at: "receiving", product: "kova" })).toEqual({ at: "product", product: "kova" });
    expect(upFrom({ at: "product", product: "kova" })).toEqual({ at: "legal" });
    expect(upFrom({ at: "preferences", part: "appearance" })).toEqual({ at: "preferences" });
    /*
      ⚠️ AND "UP" IS THE AREA, NOT THE HUB. Everything the account centre holds
      goes up to the account centre, everything the marketplace sells goes up to
      the marketplace — sent straight home, somebody who opened their passkeys
      from one area is dropped two levels by one press, which is the back button
      doing something other than undoing what they did.
    */
    expect(upFrom({ at: "legal" })).toEqual({ at: "account" });
    expect(upFrom({ at: "preferences" })).toEqual({ at: "account" });
    expect(upFrom({ at: "vault" })).toEqual({ at: "account" });
    expect(upFrom({ at: "close" })).toEqual({ at: "account" });
    expect(upFrom({ at: "credits" })).toEqual({ at: "market" });
    expect(upFrom({ at: "shelf", product: "kova" })).toEqual({ at: "market" });
    /* ⚠️ The three areas themselves are the level under the hub. */
    for (const area of ["account", "workspaces", "market"] as const) {
      expect(upFrom({ at: area })).toEqual({ at: "home" });
    }
  });

  /*
    ⚠️ A `Where` THAT PRINTS TO ANOTHER ONE'S PATH IS TWO SCREENS AT ONE URL, and
    one of them is unreachable — from a link, from a reload, from support saying
    "open this address". The parser can only ever answer with one of them.
  */
  it("gives every destination its own address", () => {
    const printed = EVERY.map(pathOf);
    expect(new Set(printed).size, printed.join(" ")).toBe(EVERY.length);
  });

  /*
    ⚠️ EVERY DESTINATION RESOLVES TO A SCREEN, AND THE COMPILER DOES NONE OF IT.
    This test used to say the compiler was "most of it now" and it was not: the
    surface renders from a chain of `at === "…"` ternaries ending in the hub's
    home, so a destination nobody built does not fail to compile, does not throw
    and does not render blank — it silently opens the HOME. A row that goes
    somewhere unexpected is the hardest kind of wrong to notice, because the
    screen it lands on is a real one.

    It happened, immediately: the operator console shipped rows linking to
    Workspaces and to Maintenance while neither screen existed, and pressing
    either one went home. Everything was green.

    ⚠️ SO THE UNION IS READ FROM ITS OWN SOURCE, not typed out here. A list of
    names in a test is a list somebody has to remember to add to — which is the
    same forgotten edit, moved.
  */
  const source = (file: string) => readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  const DECLARED: readonly string[] = [
    ...new Set(
      [...source("src/hub/routes.ts").matchAll(/readonly at:\s*"([a-z-]+)"/g)].map((m) => m[1]!),
    ),
  ];

  it("holds every member of the union to a round trip", () => {
    expect(DECLARED.length).toBeGreaterThan(20);
    expect([...DECLARED].sort()).toEqual([...new Set(EVERY.map((w) => w.at))].sort());
  });

  it("renders a screen for every one of them", () => {
    const mount = source("dev/mount.tsx");
    /*
      ⚠️ THE HOME IS THE FALLBACK AND SO HAS NO BRANCH — deliberately, because
      an address nobody can read has to land somewhere. It is the ONLY exemption,
      and it is named rather than inferred: a second destination quietly sharing
      the fallback is exactly the fault above.
    */
    const missing = DECLARED.filter((at) => at !== "home" && !mount.includes(`at === "${at}"`));
    expect(missing, `no screen renders: ${missing.join(", ")}`).toEqual([]);
  });
});
