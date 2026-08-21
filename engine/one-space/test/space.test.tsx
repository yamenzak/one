/**
 * THE SPACE'S TWO DECISIONS, AND THE ADDRESSES IT SENDS PEOPLE TO.
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
import { Editor } from "../src/centre/Brand.js";
import { subjectOf } from "../src/space/OneSpace.js";
/* ⚠️ The three screens the deployment's own infrastructure is read on — see
   the last describe in this file. */
import { Shards } from "../src/console/Shards.js";
import { Stores } from "../src/console/Stores.js";
import { Pass } from "../src/console/Pass.js";

const html = (node: React.ReactNode): string => renderToStaticMarkup(node);

const WHERE: Where = { kind: "account", root: "one.4dl.app", slug: null };
/** ⚠️ Not a browser's — a fixture, so the port half is exercised too. */
const LOCATION = { protocol: "https:", port: "" } as Location;
const DEV = { protocol: "http:", port: "8080" } as Location;

const KINDS: readonly DoorKind[] = [
  "signpost", "account", "setup", "operator", "tenant", "device", "none",
];

/* ------------------------------------------------------------ which screen --- */

describe("which screen the OneSpace is", () => {
  /*
    ⚠️ EVERY DOOR THE WORKER SERVES RESOLVES TO A SCREEN, INCLUDING THE ONES THE
    SPACE IS NOT. "That cannot happen" is how a blank page ships: the state that
    could not occur occurs, nothing matches, and React renders nothing at all.
  */
  it("has a screen for every door, signed in or not", () => {
    for (const kind of KINDS) {
      for (const signedIn of [true, false, null]) {
        const screen = pickScreen(faceFor(kind), signedIn, false);
        expect(screen, `${kind} / signedIn=${signedIn}`).not.toBe(undefined);
        expect(["waiting", "stuck", "signpost", "sign-in", "agreements", "space",
          "new-workspace", "product", "elsewhere"]).toContain(screen satisfies Screen);
      }
    }
  });

  /* ⚠️ Not known yet is not the same as nobody — see `session.tsx`. Rendering
     the sign-in screen while `me.who` is still in flight flashes a sign-in page
     at somebody who is already signed in, on every single load. */
  it("waits rather than assuming nobody is here", () => {
    expect(pickScreen("space", null, false)).toBe("waiting");
    expect(pickScreen("create", null, false)).toBe("waiting");
    expect(pickScreen(null, true, false)).toBe("waiting");
  });

  it("asks for a sign-in on every door that needs one", () => {
    expect(pickScreen("space", false, false)).toBe("sign-in");
    expect(pickScreen("create", false, false)).toBe("sign-in");
    /* ⚠️ A workspace's own address included: the product is behind a session. */
    expect(pickScreen("centre", false, false)).toBe("sign-in");
    expect(pickScreen("centre", true, false)).toBe("product");
    expect(pickScreen("centre", null, false)).toBe("waiting");
    /* ⚠️ And the operator door: the console admits operators, and the
       deployment decides who those are — never the page. */
    expect(pickScreen("console", false, false)).toBe("sign-in");
  });

  /* ⚠️ THE ACCOUNT DOOR AND THE OPERATOR DOOR ARE ONE PAGE. Both are OneSpace
     with nothing underneath; what an operator holds is a place on it, so a
     second shell for the console would be a second design nobody maintains. */
  it("opens OneSpace on the account door and on the operator door", () => {
    expect(pickScreen("space", true, false)).toBe("space");
    expect(pickScreen("console", true, false)).toBe("space");
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
    ⚠️ THE WALL HOLDS THE PRODUCT AND THE SPACE ALIKE, and it is decided here so
    that it cannot be forgotten by one screen. Somebody who has not agreed must
    not see their workspace for a moment and then lose it — every write behind it
    refuses with a status the screen has no reason to expect.
  */
  it("holds every signed-in surface until the agreements are given", () => {
    for (const face of ["space", "console", "centre", "create"] as const) {
      expect(pickScreen(face, true, false, false, 1), face).toBe("agreements");
    }
  });

  /*
    ⚠️ AND IT IS NOT A DOOR. Nobody can agree to anything before we know who they
    are, so an unsigned-in caller with documents owed is still asked to sign in —
    and the signpost, which issues no code, is still the signpost.
  */
  it("does not put the wall in front of signing in", () => {
    expect(pickScreen("space", false, false, false, 2)).toBe("sign-in");
    expect(pickScreen("centre", null, false, false, 2)).toBe("waiting");
    expect(pickScreen("signpost", true, false, false, 2)).toBe("signpost");
    /* ⚠️ And a failure still outranks it: a deployment we could not read is not
       a person who has not agreed. */
    expect(pickScreen("space", true, true, false, 2)).toBe("stuck");
  });

  /*
    ⚠️ A FAILURE OUTRANKS EVERYTHING. If we could not find out who is here, the
    honest screen is the reason — not a polite sign-in page, which is what a
    broken deployment would otherwise look like to every person who visits it.
  */
  it("says what went wrong rather than offering a sign-in", () => {
    for (const face of ["space", "create", "signpost", "elsewhere"] as const) {
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
    now, and what it renders while travelling is not a blank page: the redirect
    is a round trip, and nothing on screen for the length of it is
    indistinguishable from a page that failed.

    ⚠️ AND IT IS THE SAME CURTAIN THE BOOT DRAWS, which is what makes the hop
    invisible. This test used to name the caption this screen wrote for itself —
    a good assertion about a screen that should never have had a voice of its
    own: it exists for one redirect, and anything that differed from what was on
    the screen a moment ago read as a flash between two products.
  */
  it("asks the root for nothing and holds the curtain while it goes", () => {
    const out = html(<Signpost where={WHERE} />);
    expect(out, "the redirect shows a blank page").toContain(`aria-label="One"`);
    expect(out, "the curtain says nothing at all").toContain("data-opening");
    expect(out).not.toContain("Start a workspace");
  });

  /* ⚠️ Every door the OneSpace is not gets a sentence of its own. A shared "not
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

/**
 * THE WORKSPACE'S OWN IDENTITY, RENDERED.
 *
 * ⚠️ THIS SCREEN HAD NO TEST AND NO PHOTOGRAPH. It was rewritten twice — onto the
 * row grammar, then onto the edit sheet — both times by inference from the
 * settings screen next to it, which is exactly the way two surfaces come to
 * disagree about the grammar they are supposed to share.
 *
 * ⚠️ AND THE TWO STATES ARE DIFFERENT SCREENS, not one screen with a flag. A
 * personal workspace is offered the way forward; a business is given the editor.
 * Rendering the controls and refusing every save is a screen that lies.
 */
describe("a workspace's brand", () => {
  const commercial = {
    kind: "commercial" as const,
    branding: { theme: { ground: "#101014", ink: "#f5f5f7", accent: "#7aa2f7", mark: "H" }, surfaces: ["shell"] },
    surfaces: ["shell", "email"],
    /* ⚠️ No upload yet, which is the state every business starts in. */
    icon: null,
  };

  /*
    ⚠️ A BUSINESS THAT HAS SAVED NOTHING YET, WHICH IS EVERY BUSINESS ON ITS
    FIRST DAY AND THE ONE COMBINATION NEITHER TEST COVERED. The fixture above
    always had a theme; the live screen is reached with `branding: null` the
    moment a workspace becomes commercial, and that is the state it rendered
    nothing at all in.
  */
  it("draws the editor for a business that has saved nothing yet", () => {
    const out = html(
      <Editor
        name="Harbourside" slug="harbourside"
        answer={{ kind: "commercial", branding: null, surfaces: ["shell", "email"], icon: null }}
        again={() => {}}
      />,
    );
    expect(out).toContain("On a home screen");
    expect(out).toContain("Add your own icon");
  });

  it("shows a business what it is set to, and a way to change each of them", () => {
    const out = html(
      <Editor name="Harbourside" slug="harbourside" answer={commercial} again={() => {}} />,
    );
    /* ⚠️ The tile is what is being decided, so it is on the screen. */
    expect(out).toContain("On a home screen");
    /* ⚠️ Every colour reads as its value, not as a control — see `edit.tsx`. */
    for (const hex of ["#101014", "#f5f5f7", "#7aa2f7"]) expect(out).toContain(hex);
    /* ⚠️ THE UPLOAD IS OFFERED, AND IT SAYS WHAT IT TAKES. A picker that
       accepted anything and refused most of it after the upload is the shape
       this control exists not to be. */
    expect(out).toContain("Add your own icon");
    expect(out).toContain("square PNG");
    /* ⚠️ And each is CHANGED rather than typed into: the row carries the way in. */
    expect(out).toContain("Change behind everything");
    expect(out).toContain("Change words and marks");
    /* ⚠️ Only what the apps here offer — never the platform's closed set. */
    expect(out).toContain("The app itself");
    expect(out).not.toContain("Public pages");
  });

  /*
    ⚠️ A PERSONAL WORKSPACE GETS THE OFFER, AND IT IS ONE WAY. The sentence over
    the button is what somebody reads; a confirmation afterwards about something
    already decided is a speed bump.
  */
  it("offers a personal workspace the way forward instead of a locked editor", () => {
    const out = html(
      <Editor
        name="Sam's notes" slug="sam"
        answer={{ kind: "personal", branding: null, surfaces: ["shell"], icon: null }}
        again={() => {}}
      />,
    );
    expect(out).toContain("This is for business workspaces");
    /* ⚠️ AND NO UPLOAD IS OFFERED. `setIcon` refuses a personal workspace, so a
       picker here would be a control whose every use fails. */
    expect(out).not.toContain("Add your own icon");
    expect(out).toContain("It cannot be undone");
    expect(out).toContain("Legal name");
    /* ⚠️ No editor at all — not a disabled one. */
    expect(out).not.toContain("On a home screen");
  });
});

/* ----------------------------------------------------------------- ground --- */

/**
 * THREE AREAS, THREE WORLDS, AND THE ADDRESS DECIDES WHICH.
 *
 * ⚠️ THE FAMILY FALLS OUT OF WHAT THE SUBJECT IS (`face.tsx`'s `SKY`), so this
 * asks the only question a screen actually answers: WHOSE screen is this. A
 * workspace is a place you look at from outside and gets a planet; a person is a
 * room you stand in and gets their own light; the operator's side is about a
 * deployment and is nobody's, so it falls to a ruled material of its own.
 *
 * ⚠️ AND IT IS EVERY ADDRESS, NOT THE TWO THAT HAPPENED TO HAVE ONE. A subject
 * was named on `workspace` and `home` alone, so eighteen screens fell through to
 * a shared grey material — a workspace's roster, its bill and its trust page all
 * looked like a different product one tap in from its front door, and the fault
 * is invisible unless you walk the whole area.
 */
describe("whose screen this is", () => {
  const me = { accountId: "acc_1", email: "sam@example.com", tenants: [] } as never;

  it("gives every screen of a workspace that workspace's own planet", () => {
    for (const at of ["workspace", "people", "money", "packages", "settings", "trust", "brand"]) {
      const face = subjectOf({ at, slug: "ironworks" } as never, me);
      expect(face, at).toEqual({ kind: "workspace", seed: "ironworks" });
    }
  });

  it("gives every screen of the account the person's own light", () => {
    for (const at of ["home", "you", "inbox", "told", "data", "prefs", "workspaces"]) {
      const face = subjectOf({ at } as never, me);
      expect(face, at).toEqual({ kind: "person", seed: "acc_1" });
    }
  });

  /* ⚠️ AND THE OPERATOR'S SIDE IS NOBODY'S. A console screen wearing the
     operator's own aura would say the deployment belongs to whoever is signed
     in, which is the one thing it must not say (D18). */
  it("gives the operator's side no subject at all", () => {
    for (const at of ["console", "tenants", "catalogue", "keys", "switches"]) {
      expect(subjectOf({ at } as never, me), at).toBeUndefined();
    }
  });

  /* ⚠️ Before the session resolves there is nobody to be — and a face invented
     from nothing would be a different person's light for one frame. */
  it("has no subject for the account before anybody is known", () => {
    expect(subjectOf({ at: "home" } as never, null)).toBeUndefined();
  });
});

/**
 * THE THREE INFRASTRUCTURE SCREENS DRAW SOMETHING BEFORE THEIR DATA ARRIVES.
 *
 * ⚠️ ONE SCREEN BECAME THREE, AND A SPLIT IS WHERE JSX BREAKS. The inventory
 * page held four subjects — capacity, stores, the plan, and a move in flight —
 * and each half moved to the page it belongs on. What a compiler cannot see is
 * a card left outside the fragment it was cut from or a hook called under a
 * branch: both render nothing, and a blank screen and a screen still loading
 * are the same picture (this file's own header).
 *
 * ⚠️ RENDERED WITH NO ANSWER, WHICH IS THE STATE THAT SHIPS FIRST. `useLoad`
 * starts at `waiting` and its effect never runs here, so what this draws is the
 * skeleton every operator sees for the length of a round trip.
 */
describe("the screens the deployment's own infrastructure is read on", () => {
  it("each mount and draw their waiting state", () => {
    for (const [name, Screen] of [
      ["shards", Shards], ["stores", Stores], ["pass", Pass],
    ] as const) {
      expect(html(<Screen />).length, name).toBeGreaterThan(0);
    }
  });
});

