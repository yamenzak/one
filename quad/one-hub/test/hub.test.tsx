/**
 * THE HUB'S TWO DECISIONS, AND THE ADDRESSES IT SENDS PEOPLE TO.
 *
 * ⚠️ THE SCREEN IS PICKED BY A PURE FUNCTION SO THAT THIS IS A TEST RATHER THAN
 * A WALK THROUGH FIVE HOSTNAMES IN A BROWSER. The failure it exists to catch is
 * a combination that resolves to nothing — a door the worker serves with no
 * screen behind it renders a blank page, and a blank page and a page that failed
 * to load are the same picture.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { pickScreen, type Screen } from "../src/App.js";
import { accountUrl, faceFor, setupUrl, signpostUrl, tenantUrl, type DoorKind, type Where } from "../src/door.js";
import { COUNTRIES, byName, nameOf } from "../src/countries.js";
import { Signpost } from "../src/screens/Signpost.js";
import { Elsewhere } from "../src/screens/Elsewhere.js";

const html = (node: React.ReactNode): string => renderToStaticMarkup(node);

const WHERE: Where = { kind: "account", root: "one.4dl.app", slug: null };
/** ⚠️ Not a browser's — a fixture, so the port half is exercised too. */
const LOCATION = { protocol: "https:", port: "" } as Location;
const DEV = { protocol: "http:", port: "8080" } as Location;

const KINDS: readonly DoorKind[] = [
  "signpost", "account", "setup", "operator", "tenant", "device", "none",
];

/* ------------------------------------------------------------ which screen --- */

describe("which screen the Hub is", () => {
  /*
    ⚠️ EVERY DOOR THE WORKER SERVES RESOLVES TO A SCREEN, INCLUDING THE ONES THE
    HUB IS NOT. "That cannot happen" is how a blank page ships: the state that
    could not occur occurs, nothing matches, and React renders nothing at all.
  */
  it("has a screen for every door, signed in or not", () => {
    for (const kind of KINDS) {
      for (const signedIn of [true, false, null]) {
        const screen = pickScreen(faceFor(kind), signedIn, false);
        expect(screen, `${kind} / signedIn=${signedIn}`).not.toBe(undefined);
        expect(["waiting", "stuck", "signpost", "sign-in", "hub", "new-workspace",
          "product", "elsewhere"]).toContain(screen satisfies Screen);
      }
    }
  });

  /* ⚠️ Not known yet is not the same as nobody — see `session.tsx`. Rendering
     the sign-in screen while `me.who` is still in flight flashes a sign-in page
     at somebody who is already signed in, on every single load. */
  it("waits rather than assuming nobody is here", () => {
    expect(pickScreen("hub", null, false)).toBe("waiting");
    expect(pickScreen("create", null, false)).toBe("waiting");
    expect(pickScreen(null, true, false)).toBe("waiting");
  });

  it("asks for a sign-in on every door that needs one", () => {
    expect(pickScreen("hub", false, false)).toBe("sign-in");
    expect(pickScreen("create", false, false)).toBe("sign-in");
    /* ⚠️ A workspace's own address included: the product is behind a session. */
    expect(pickScreen("centre", false, false)).toBe("sign-in");
    expect(pickScreen("centre", true, false)).toBe("product");
    expect(pickScreen("centre", null, false)).toBe("waiting");
    /* ⚠️ And the operator door: the console admits operators, and the
       deployment decides who those are — never the page. */
    expect(pickScreen("console", false, false)).toBe("sign-in");
  });

  /* ⚠️ THE ACCOUNT DOOR AND THE OPERATOR DOOR ARE ONE PAGE. Both are the hub
     with nothing underneath; what an operator holds is a place on it, so a
     second shell for the console would be a second design nobody maintains. */
  it("opens the hub on the account door and on the operator door", () => {
    expect(pickScreen("hub", true, false)).toBe("hub");
    expect(pickScreen("console", true, false)).toBe("hub");
    expect(pickScreen("create", true, false)).toBe("new-workspace");
  });

  /* ⚠️ The signpost issues no code — the runtime refuses one there, because a
     code sent from the root signs you in to nothing. So it never asks. */
  it("never asks the signpost to sign anybody in", () => {
    for (const signedIn of [true, false, null]) {
      expect(pickScreen("signpost", signedIn, false)).toBe("signpost");
    }
  });

  /*
    ⚠️ A FAILURE OUTRANKS EVERYTHING. If we could not find out who is here, the
    honest screen is the reason — not a polite sign-in page, which is what a
    broken deployment would otherwise look like to every person who visits it.
  */
  it("says what went wrong rather than offering a sign-in", () => {
    for (const face of ["hub", "create", "signpost", "elsewhere"] as const) {
      expect(pickScreen(face, false, true)).toBe("stuck");
    }
  });
});

/* --------------------------------------------------------------- addresses --- */

describe("the addresses it sends people to", () => {
  it("builds each door under the root it was told", () => {
    expect(accountUrl(WHERE, LOCATION)).toBe("https://id.one.4dl.app");
    expect(setupUrl(WHERE, LOCATION)).toBe("https://setup.one.4dl.app");
    expect(signpostUrl(WHERE, LOCATION)).toBe("https://one.4dl.app");
    expect(tenantUrl("northwind", WHERE, LOCATION)).toBe("https://northwind.one.4dl.app");
  });

  /* ⚠️ The port travels with the address, or every hop in development lands on
     port 80 and 404s — which reads as "the door is broken", not "the link is". */
  it("carries the port and the scheme it is running under", () => {
    const local: Where = { kind: "account", root: "localhost", slug: null };
    expect(setupUrl(local, DEV)).toBe("http://setup.localhost:8080");
    expect(signpostUrl(local, DEV)).toBe("http://localhost:8080");
  });
});

/* ----------------------------------------------------------------- screens --- */

describe("what the screens actually put on the page", () => {
  /*
    ⚠️ THE ROOT IS NOT A SCREEN, AND THIS IS WHAT THAT MEANS. It offered two
    buttons to two other pages — one of which everybody arriving wanted — so it
    was a step whose entire content was pointing at the next step. It travels
    now, and what it renders while travelling is a reason, not a blank page:
    the redirect is a round trip, and nothing on screen for the length of it is
    indistinguishable from a page that failed.
  */
  it("asks the root for nothing and says where it is going", () => {
    const out = html(<Signpost where={WHERE} />);
    expect(out).toContain("Taking you to the sign-in");
    expect(out).not.toContain("Start a workspace");
  });

  /* ⚠️ Every door the Hub is not gets a sentence of its own. A shared "not
     found" tells a person nothing about whether they are in the wrong place or
     the product is broken. */
  it("says something specific for every door it is not", () => {
    for (const kind of ["operator", "tenant", "device", "none"] as const) {
      const out = html(<Elsewhere where={WHERE} kind={kind} />);
      expect(out, kind).toContain("one.4dl.app");
      expect(out.length, kind).toBeGreaterThan(100);
    }
    /* And they are not all the same sentence. */
    const said = new Set(["operator", "tenant", "device", "none"].map(
      (k) => html(<Elsewhere where={WHERE} kind={k as DoorKind} />)));
    expect(said.size).toBe(4);
  });
});

/* --------------------------------------------------------------- countries --- */

describe("the country list", () => {
  /* ⚠️ Complete on purpose. A curated set is a business somebody cannot sign
     up, discovered by them rather than by us. */
  it("is every officially assigned code, with no duplicates", () => {
    expect(COUNTRIES.length).toBeGreaterThan(240);
    expect(new Set(COUNTRIES).size).toBe(COUNTRIES.length);
    for (const code of COUNTRIES) expect(code).toMatch(/^[A-Z]{2}$/);
  });

  /* ⚠️ Every entry the residency rule can be asked about is one somebody can
     pick — an EEA member missing from the list is an EU business placed
     globally, silently. */
  it("offers every country the residency rule knows about", () => {
    for (const code of ["DE", "FR", "IE", "NO", "CH", "GB", "AE", "US"]) {
      expect(COUNTRIES, code).toContain(code);
    }
  });

  /*
    ⚠️ AND EVERY CODE IN IT IS A REAL ONE. A typo in a list of 249 two-letter
    strings is invisible by eye and renders as `Intl`'s "unknown region"
    placeholder in a dropdown — an entry somebody can pick that means nothing,
    sitting between two that do. `ZZ` is the placeholder's own code, so this
    compares against whatever the runtime's locale calls it rather than against
    an English string.
  */
  it("contains no code the runtime cannot name", () => {
    const unknown = nameOf("ZZ");
    const nameless = COUNTRIES.filter((c) => nameOf(c) === unknown || nameOf(c) === c);
    expect(nameless).toEqual([]);
  });

  it("sorts by name and keeps every entry", () => {
    expect(byName().length).toBe(COUNTRIES.length);
    expect(byName()[0]?.name.localeCompare(byName()[1]?.name ?? "")).toBeLessThanOrEqual(0);
  });
});
