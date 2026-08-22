/**
 * WHAT A PERSON IS OFFERED, AND WHAT THEY ARE NOT.
 *
 * ⚠️ EVERY ASSERTION HERE IS ABOUT A SCREEN NOBODY WROTE. The settings screens,
 * the notification policy and the plan shelf are rendered from
 * the declarations — so what these prove is the autodiscovery rule in both
 * directions: everything declared reaches a surface, and nothing appears that a
 * person could press to no effect.
 *
 * ⚠️ RENDERED TO A STRING, NOT DRIVEN IN A BROWSER. What matters is which
 * controls exist, which are absent because a permission is missing, and which
 * are locked because a plan does not include them — all of which are in the
 * markup, and none of which needs a click to observe.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  GATE_ORDER, area, field, flag, notification, setting, type Channel, type FieldSpec,
} from "@engine/kernel";
import { Settings, settingsShown } from "../src/rendered/settings.js";
import { Shown } from "../src/rendered/edit.js";
import { NotificationPolicy, policyShown } from "../src/rendered/policy.js";
import { Shelf, saying } from "../src/rendered/console.js";
import { Storage, Wallet } from "../src/rendered/money.js";
import { Shell, reachable } from "../src/frame/shell.js";
import { Allowed, sayGate } from "../src/parts/gated.js";
import { ControlRow, Group, NavRow, ToggleRow } from "../src/parts/surfaces.js";
import { SettledSwitch } from "../src/parts/settle.js";
import { ModelLine } from "../src/rendered/ai.js";
import { CONTROL_SHARE, WHOLE } from "../src/tokens/metrics.js";
import { crownFor } from "../src/frame/crown.js";
import { brandCss, brandCssFor, readable, colorFor } from "../src/tokens/theme.js";
import { ambienceStylesheet, skyWorld, worldCss } from "../src/tokens/ambience.js";
import { SKIES } from "../src/scene/index.js";
import { BEAT } from "../src/tokens/motion.js";
import { Screen, Whichever } from "../src/frame/screen.js";
import { Presenting } from "../src/parts/said.js";
import { ready, trouble, waiting } from "../src/parts/state.js";
import { Documents, SubProcessors } from "../src/rendered/legal.js";
import { Await } from "../src/parts/state.js";
import type { DocumentDef } from "@engine/kernel";

const html = (node: React.ReactNode): string => renderToStaticMarkup(node);

/* -------------------------------------------------------------- settings --- */

/*
  ⚠️ THE PAGES, DECLARED. Settings DESCEND now — a level is a list of areas and
  an area is a page — so a fixture with no areas renders nothing at all, which is
  the shape these assertions are about.
*/
const AREAS = {
  data: area({ id: "data", label: "Data", icon: "database", said: "What is kept", order: 0 }),
  payments: area({ id: "payments", label: "Payments", icon: "money", said: "Who takes the money", order: 1 }),
  appearance: area({ id: "appearance", label: "Appearance", icon: "star", said: "How it looks", order: 2 }),
};

const SETTINGS = {
  "retention.days": setting({
    id: "retention.days", level: "tenant", area: "data",
    field: field.number({ label: "Keep records for", holds: "none", min: 1 }),
    fallback: 365, needs: "tenant:manage",
  }),
  "provider.key": setting({
    id: "provider.key", level: "tenant", area: "payments", secret: true,
    field: field.text({ label: "Secret key", holds: "none" }),
    fallback: "", needs: "tenant:manage",
  }),
  "exports.nightly": setting({
    id: "exports.nightly", level: "tenant", area: "data",
    field: field.bool({ label: "Nightly export", holds: "none" }),
    fallback: false, needs: "tenant:manage", entitlement: "exports",
  }),
  theme: setting({
    id: "theme", level: "person", area: "appearance",
    field: field.enum({ label: "Theme", holds: "none", values: ["light", "dark", "system"] }),
    fallback: "system",
  }),
};

describe("the settings screens nobody wrote", () => {
  const owner = new Set(["tenant:manage"]);

  it("renders every declared setting for the level it belongs to", () => {
    expect(settingsShown(SETTINGS, "tenant", owner))
      .toEqual(["retention.days", "provider.key", "exports.nightly"]);
    expect(settingsShown(SETTINGS, "person", owner)).toEqual(["theme"]);

    const out = html(
      <Settings
        book={SETTINGS} areas={AREAS} level="tenant" area="data" onArea={() => {}}
        stored={{}} held={owner} onChange={() => {}}
      />,
    );
    expect(out).toContain("Keep records for");
  });

  /*
    ⚠️ IT DESCENDS, WHICH IS THE WHOLE SHAPE. Without a page named, a level is a
    LIST of its pages — not one column holding every row it has. This asserts
    both halves: the list offers each page with the line that says what is behind
    it, and it does NOT put the rows themselves on the list.
  */
  it("offers the pages rather than every row at once", () => {
    const out = html(
      <Settings
        book={SETTINGS} areas={AREAS} level="tenant" onArea={() => {}}
        stored={{}} held={owner} onChange={() => {}}
      />,
    );
    expect(out).toContain("Data");
    expect(out).toContain("What is kept");
    expect(out).toContain("Payments");
    expect(out).not.toContain("Keep records for");
  });

  /*
    ⚠️ AND A PAGE THE LEVEL HAS NOTHING ON IS NOT OFFERED. `AREAS` declares
    Appearance, which only the person level uses.
  */
  it("does not offer a page this level has nothing on", () => {
    const out = html(
      <Settings
        book={SETTINGS} areas={AREAS} level="tenant" onArea={() => {}}
        stored={{}} held={owner} onChange={() => {}}
      />,
    );
    expect(out).not.toContain("Appearance");
  });

  /*
    ⚠️ NOR ONE WHOSE EVERY ROW THIS READER MAY NOT CHANGE. `areasOn` answers what
    the LEVEL has; a reader without the permission behind those rows would still
    be offered the page and find it empty.
  */
  it("does not offer a page whose every row is hidden from this reader", () => {
    const out = html(
      <Settings
        book={SETTINGS} areas={AREAS} level="tenant" onArea={() => {}}
        stored={{}} held={new Set()} onChange={() => {}}
      />,
    );
    expect(out).not.toContain("Payments");
    expect(out).toContain("Nothing to change here");
  });

  /*
    ⚠️ A CONTROL SOMEBODY CANNOT USE IS ABSENT, NOT DISABLED. Showing it invites
    them to ask for it, which is sometimes right and is the owner's decision to
    make rather than a screen's.
  */
  it("does not draw a workspace setting for somebody who cannot change it", () => {
    expect(settingsShown(SETTINGS, "tenant", new Set())).toEqual([]);
    const out = html(
      <Settings book={SETTINGS} areas={AREAS} onArea={() => {}} level="tenant" stored={{}} held={new Set()} onChange={() => {}} />,
    );
    expect(out).not.toContain("Keep records for");
    expect(out).toContain("Nothing to change here");
  });

  /*
    ⚠️ A STORED SECRET IS NEVER RENDERED BACK. It is a credential handed to every
    script in the page and to whatever the browser saved.
  */
  it("never puts a stored secret into the page", () => {
    const out = html(
      <Settings
        book={SETTINGS} areas={AREAS} level="tenant" area="payments" onArea={() => {}}
        held={owner} onChange={() => {}}
        stored={{ "provider.key": "sk_live_do_not_leak" }}
      />,
    );
    expect(out).not.toContain("sk_live_do_not_leak");
    /* ⚠️ THE ROW SAYS WHETHER ONE IS STORED, AND THAT IS THE WHOLE ANSWER. It
       used to assert the input's placeholder; the input is behind the edit
       sheet now and is not in the page at all until somebody opens it, which is
       strictly less of a credential surface rather than a weaker check. */
    expect(out).toContain("Stored");
  });

  /*
    ⚠️ AND A SETTING BEHIND AN ENTITLEMENT IS SHOWN AND LOCKED, which is the
    opposite choice and deliberately so: it is something they can buy, and hiding
    it hides the offer.
  */
  it("shows what the plan does not include rather than hiding it", () => {
    const out = html(
      <Settings
        book={SETTINGS} areas={AREAS} level="tenant" area="data" onArea={() => {}}
        stored={{}} held={owner} onChange={() => {}}
        includes={(key) => key !== "exports"}
      />,
    );
    expect(out).toContain("Nightly export");
    expect(out).toContain("Your plan does not include this");
  });
});

/* ---------------------------------------------------------------- policy --- */

const INVITED = notification({
  id: "member.invited", label: "Invitation", summary: "You were invited.",
  category: "action", author: "theirs", tone: "info", icon: "mail",
  needs: "member:read", on: "member.invited", link: "/people",
  variables: [], channels: ["inbox", "email", "push"],
});
const DIGEST = notification({
  id: "week.digest", label: "Weekly digest", summary: "How last week went.",
  category: "digest", author: "theirs", tone: "neutral", icon: "chart",
  needs: "report:read", on: "week.closed", link: "/reports",
  variables: [], channels: ["inbox", "email"],
});

describe("the notification policy screen", () => {
  const book = { "member.invited": INVITED, "week.digest": DIGEST };
  const every: readonly Channel[] = ["inbox", "email", "push"];

  /*
    ⚠️ THE AUDIENCE IS A PERMISSION, so a row for a notification that will never
    arrive is never drawn — it would be a switch that does nothing.
  */
  it("lists only what this person could ever be sent", () => {
    expect(policyShown(book, new Set(["member:read"]), every).map((o) => o.id))
      .toEqual(["member.invited"]);
    const out = html(
      <NotificationPolicy
        book={book} level="person" policy={{}} preference={{}} available={every}
        held={new Set(["member:read"])} onChange={() => {}}
      />,
    );
    expect(out).toContain("Invitation");
    expect(out).not.toContain("Weekly digest");
  });

  /*
    ⚠️ AN `action` HAS NO SWITCH, AND THE ROW SAYS SO. A disabled control with no
    reason invites somebody to go looking for how to enable it.
  */
  it("says why something cannot be switched off rather than just disabling it", () => {
    const out = html(
      <NotificationPolicy
        book={book} level="person" policy={{}} preference={{}} available={every}
        held={new Set(["member:read"])} onChange={() => {}}
      />,
    );
    expect(out).toContain("needs you to do something");
    expect(policyShown(book, new Set(["member:read"]), every)[0]?.locked).toBe(true);
  });

  /* ⚠️ And a channel the deployment cannot deliver is never offered — a switch
     for push where push is not configured does nothing at all. */
  it("offers no switch for a channel this deployment does not have", () => {
    expect(policyShown(book, new Set(["member:read"]), ["inbox", "email"])[0]?.switches)
      .toEqual(["email"]);
  });
});

/*
  ⚠️ THE FLAG SUITE IS GONE WITH `FlagConsole`, AND BOTH BEHAVIOURS ARE STILL
  CHECKED. It drew a book of flags as a run of toggles, and when the two surfaces
  that show flags were built properly neither wanted that shape — the operator's
  is a LIST that descends, the workspace's is a toggle beside a row leading to its
  own people. The kill switch's absorbing `off` is now `flag.list` answering with
  nothing at all rather than a row explaining why it is dead, asserted and
  mutation-tested in `ground/test/operator.test.ts`; the overdue wording is
  the switch list's second line, in `one-space/test/where.test.ts`.
*/

/* ----------------------------------------------------------------- shelf --- */

describe("the plan shelf", () => {
  /* ⚠️ `-1` is unlimited and `0` is none — a shelf showing "-1" is a price list
     nobody can read. */
  it("says what a number means rather than printing it", () => {
    expect(saying(-1)).toBe("Unlimited");
    expect(saying(0)).toBe("—");
    expect(saying(true)).toBe("Included");
    expect(saying(5)).toBe("5");
  });

  /*
    ⚠️ A PRICE IS THE READER'S NOW — `useMoney`. It was `Intl.NumberFormat("en")`
    with `minor / 100`, so a German price list grouped the American way and every
    yen figure was a hundredth of itself. The rendered shelf is what proves it:
    a helper asserted on its own would pass while nothing on screen used it.
  */
  it("prices a shelf in the reader's own conventions, and says Free rather than nothing", () => {
    const shelf = (
      <Shelf
        current="free"
        plans={[
          { id: "free", name: "Free", said: "For a look", price: 0, currency: "EUR", order: 0, allows: {} },
          { id: "solo", name: "Solo", said: "For one", price: 123456, currency: "EUR", order: 1, allows: {} },
        ] as never}
        entitlements={{}}
        onChoose={() => {}}
      />
    );
    const british = html(<Presenting machine={{ locale: "en-GB", zone: "UTC" }}>{shelf}</Presenting>);
    expect(british).toContain("Free");
    expect(british).toContain("1,234.56");

    const german = html(<Presenting machine={{ locale: "de-DE", zone: "Europe/Berlin" }}>{shelf}</Presenting>);
    expect(german).toContain("1.234,56");
    expect(german).not.toContain("1,234.56");
  });

  it("shows every plan including the one somebody lands on by not choosing", () => {
    const out = html(
      <Shelf
        current="free"
        plans={[
          { id: "free", name: "Free", said: "A look", kind: "personal", price: 0,
            currency: "USD", credits: 0, order: 0, parking: true, includes: { seats: 1 } },
          { id: "team", name: "Team", said: "For work", kind: "personal", price: 900,
            currency: "USD", credits: 1000, order: 1, trialDays: 14, includes: { seats: 10 } },
        ]}
        entitlements={{
          seats: { label: "People", withheld: "quota" },
          chat: { label: "Chat", withheld: "gate", reserved: true },
        }}
        onChoose={() => {}}
      />,
    );
    expect(out).toContain("Free");
    expect(out).toContain("Team");
    expect(out).toContain("14 days free");
    expect(out).toContain("Your plan");
    /* ⚠️ A reserved key is sold by nobody, so it is not on the shelf. */
    expect(out).not.toContain("Chat");
  });
});

/* ----------------------------------------------------------------- shell --- */

const SCREENS = [
  { id: "notes", route: "/", label: "Notes", nav: "primary" as const, permission: "note:read" },
  { id: "people", route: "/people", label: "People", nav: "primary" as const, permission: "member:read" },
  { id: "search", route: "/search", label: "Search", nav: "primary" as const,
    permission: "note:read", flag: "note-search" },
  { id: "shared", route: "/shared", label: "Shared", nav: "primary" as const,
    permission: "note:read", commercial: true as const },
  /* ⚠️ NOT A DESTINATION, AND A PRODUCT IS MOSTLY THESE. A screen reached from
     what it is about rather than from the bar — so the fixture can answer what
     the chrome does on one, which is a different shape at both ends. */
  { id: "thing", route: "/thing", label: "One note", nav: "none" as const, permission: "note:read" },
];

/**
 * ⚠️ A CARD'S ROWS SHARE A SHAPE, AND ONE UNCAPPED CONTROL BREAKS IT FOR THE
 * WHOLE CARD. A `Select` sizes itself to its options and stays inline; a text or
 * number field ships `w-full`, takes the row, pushes the label under its floor
 * and wraps. Measured in one settings card at 390px: heights of 64, 100, 67 and
 * 100 — and at 900px the same card was 64, 64, 67, 64, which is why it read as
 * correct on the screen it was built on and as crammed on a phone.
 *
 * ⚠️ THE HEIGHTS THEMSELVES CANNOT BE ASSERTED HERE — this renders to a string
 * and nothing lays it out. What CAN be asserted is the cap, which is the cause,
 * and a rendered page is where the consequence was found (`README.md`).
 */
describe("a row with a control at the end", () => {
  it("caps the control so the words keep their floor and the row stays one line", () => {
    const out = html(
      <ControlRow label="Notes a week"><input aria-label="n" /></ControlRow>,
    );
    expect(out).toContain(CONTROL_SHARE);
    /* ⚠️ And the label keeps a floor, or the cap alone would let two words wrap
       down a narrow column instead of the control moving. */
    expect(out).toContain("min-w-32");
  });

  /* ⚠️ AND A CONTROL THAT GENUINELY NEEDS THE WIDTH SAYS SO. A textarea capped
     at 45% is a text box nobody can write in — the opt-out is the reason the cap
     can be the default. */
  it("hands the whole row to a control that asked for it", () => {
    const out = html(
      <ControlRow label="Instructions" wide><textarea aria-label="t" /></ControlRow>,
    );
    expect(out).not.toContain(CONTROL_SHARE);
    expect(out).toContain("w-full");
  });
});

/*
  ⚠️ THE ROW IS THE ANSWER, SO IT HAS TO BE READABLE. Every one of these
  rendered as a wire value or as nothing at some point in the drafting, and each
  is the same defect: the row saying something that is not what is stored.
*/
describe("a stored value, in words", () => {
  const said = (spec: FieldSpec, value: unknown, set?: boolean) =>
    html(<Shown spec={spec} value={value} set={set} />);

  it("says an option's name, never its id", () => {
    const spec = field.enum({
      label: "State", holds: "none",
      values: ["not_started", "kg"], labels: { kg: "kg" },
    });
    expect(said(spec, "not_started")).toContain("Not started");
    /* ⚠️ And the declaration's own naming wins, or `kg` comes out as "Kg". */
    expect(said(spec, "kg")).toContain("kg");
  });

  it("says a colour in hex beside its disc, and says when there is none", () => {
    const spec = field.colour({ label: "Accent", holds: "none" });
    expect(said(spec, "#3f7d58")).toContain("#3f7d58");
    expect(said(spec, "")).toContain("Not set");
  });

  /* ⚠️ A SECRET NEVER COMES BACK — the row says whether one is there. */
  it("says whether a secret is stored, and never what it is", () => {
    const spec = field.text({ label: "Key", holds: "none" });
    expect(said(spec, undefined, true)).toContain("Stored");
    expect(said(spec, undefined, false)).toContain("Not set");
  });

  /* ⚠️ AND `undefined` IS NOT EMPTY. "Not set" over a value still in flight is
     a wrong answer somebody will act on by setting it again. */
  it("says nothing at all while the value is still coming", () => {
    const spec = field.text({ label: "Reply-to", holds: "contact" });
    expect(said(spec, undefined)).not.toContain("Not set");
  });
});

describe("the shell", () => {
  const crown = { appId: "beacon", appName: "Beacon", appMark: "◇", tenantName: "Northwind" };

  /*
    ⚠️ A DESTINATION SOMEBODY CANNOT REACH IS NOT DRAWN. A nav item leading to a
    403 is a promise the product does not keep, and nothing tells the person it
    is not simply broken.
  */
  it("draws only what this person can reach", () => {
    expect(reachable(SCREENS, new Set(["note:read"]), { "note-search": true }).map((s) => s.id))
      .toEqual(["notes", "search", "thing"]);
    const out = html(
      <Shell screens={SCREENS} here="/" held={new Set(["note:read"])} crown={crown} onGo={() => {}} />,
    );
    expect(out).toContain("Notes");
    expect(out).not.toContain("People");
  });

  /* ⚠️ And a screen behind one of our switches is not drawn while it is off. */
  it("hides a screen behind a flag we have not turned on", () => {
    expect(reachable(SCREENS, new Set(["note:read"]), {}).map((s) => s.id)).toEqual(["notes", "thing"]);
  });

  /*
    ⚠️ A BUSINESS-ONLY SCREEN IS NOT OFFERED TO A WORKSPACE THAT IS NOT ONE, and
    this is the half that was declared and read by nothing: `ScreenSpec` carried
    `commercial` from the day the gate landed while only OPERATIONS were checked,
    so the screen was drawn, navigable and reachable by URL. Every declaration
    correct, every test green, no mechanism.
  */
  it("hides a business-only screen from a personal workspace", () => {
    const held = new Set(["note:read"]);
    expect(reachable(SCREENS, held, {}, "commercial").map((s) => s.id))
      .toEqual(["notes", "shared", "thing"]);
    expect(reachable(SCREENS, held, {}, "personal").map((s) => s.id)).toEqual(["notes", "thing"]);
    /* ⚠️ Absent is `personal` — a shell wired without the kind withholds rather
       than promises, which is the direction the gate fails in too. */
    expect(reachable(SCREENS, held, {}).map((s) => s.id)).toEqual(["notes", "thing"]);

    const out = html(
      <Shell screens={SCREENS} here="/" held={held} crown={crown} onGo={() => {}} />,
    );
    expect(out).not.toContain("Shared");
  });

  /*
    ⚠️ FIVE, MAXIMUM (D10), AND SLICED HERE AS WELL AS REFUSED AT COMPOSITION —
    a deployment rendering a manifest it did not compose must not draw a sixth.
  */
  it("never draws a sixth primary destination", () => {
    const six = Array.from({ length: 6 }, (_, i) => ({
      id: `s${i}`, route: `/s${i}`, label: `Dest${i}`, nav: "primary" as const, permission: "note:read",
    }));
    const out = html(
      <Shell screens={six} here="/s0" held={new Set(["note:read"])} crown={crown} onGo={() => {}} />,
    );
    /* Twice each — the sidebar and the island — so five destinations is ten. */
    expect([...out.matchAll(/Dest\d/g)]).toHaveLength(10);
    expect(out).not.toContain("Dest5");
  });

  /*
    ⚠️ ONE NAVIGATION, TWO WIDTHS, AND THE SAME MATERIAL AT BOTH. The rail drew
    `variant="primary"` on wherever you were — a filled plate — while the phone
    bar carried no surface at all and let the world through. So the product had
    a vignette on a phone and a slab on a desktop, which is the same screen
    reading as two designs depending on the window.

    ⚠️ `data-island` IS THE ASSERTION BECAUSE IT IS THE MECHANISM. The two rules
    that make the bar work — every destination muted, the one you are on full
    ink — are keyed on that attribute, so the rail wearing it is the rail asking
    for the bar's treatment rather than restating it somewhere it can drift.
  */
  it("draws the rail in the bar's material, with no plate on where you are", () => {
    const out = html(
      <Shell screens={SCREENS} here="/" held={new Set(["note:read"])} crown={crown} onGo={() => {}} />,
    );
    /* Two: the phone bar and the desktop rail, both asking for the same rules. */
    expect([...out.matchAll(/data-island="true"/g)]).toHaveLength(2);
    expect(out).not.toContain("button--primary");
    /* ⚠️ AND WHERE YOU ARE IS STILL SAID — ink is not the same as silence, and
       an assertion that only removed the plate would pass over a rail that
       marks nothing. */
    expect([...out.matchAll(/data-here="true"/g)].length).toBeGreaterThanOrEqual(2);
  });

  /*
    ⚠️ AND THE RAIL STANDS ON A SCREEN THE PHONE BAR LEAVES. The bar is AT the
    foot, so a specialized screen's one act replaces it; the rail is BESIDE the
    page and competes with nothing. A wide window that hid its navigation to
    make room for one button would be spending the cheapest space in the layout.
  */
  it("keeps the rail on a screen whose foot is its action", () => {
    const navs = (out: string) => [...out.matchAll(/<nav [^>]*aria-label="Sections"[^>]*>/g)].map((m) => m[0]);

    const there = html(
      <Shell screens={SCREENS} here="/thing" held={new Set(["note:read"])} crown={crown} onGo={() => {}} />,
    );
    /* ⚠️ THE PHONE BAR IS GONE AND THE RAIL IS NOT. One nav left, and it is the
       one that appears at the breakpoint — a rail rendered and then hidden in
       CSS is markup that satisfies a count and shows nobody anything, which is
       what the first version of this assertion allowed. */
    expect(navs(there)).toHaveLength(1);
    expect(navs(there)[0]).toContain("md:flex");
    expect(there).toContain("Notes");

    /* ⚠️ AND BOTH STAND ON A DESTINATION, or the assertion above is satisfied by
       a shell that never draws a bar at all. */
    expect(navs(html(
      <Shell screens={SCREENS} here="/" held={new Set(["note:read"])} crown={crown} onGo={() => {}} />,
    ))).toHaveLength(2);
  });

  /*
    ⚠️ A COUNT OF NOTHING IS NOT A ZERO BADGE. Zero is texture.

    ⚠️ AND IT IS A DOT RATHER THAN A NUMBER NOW, WHICH IS A DECISION RATHER THAN
    A DRIFT. This asserted `>3<` — a numbered chip — while the nav next to it
    drew a dot for the same fact, so one product had two answers to "something
    happened here" and the numbered one was a differently-shaped control in a
    row of identical ones. What chrome owes is that something is waiting; the
    number is on the screen the control opens. `Slot.dot` is the same mark the
    island uses.
  */
  /*
    ⚠️ TWO CROWNS WOULD STACK, AND WHICH ONE WINS IS DECIDED BY A WAY OUT. Every
    `Screen` renders a crown, so a shell that stood down whenever one appeared
    would never draw its own again and the account, the workspace and the inbox
    would be gone from every screen in the product. A SUB-PAGE has a way out and
    owns the row; a DESTINATION has none, so the product's crown stands and takes
    the screen's actions.

    ⚠️ AND IT IS TESTED HERE RATHER THAN THROUGH A RENDER, because the publish
    lands in a layout effect and `renderToStaticMarkup` runs none — a test of the
    rendered shell would assert the state before any screen had spoken, which
    passes for the wrong reason.
  */
  const act = (id: string) => ({ id, label: id, icon: null, onDo: () => {} });
  const product = {
    who: { name: "you@example.com" },
    /* ⚠️ THE MIDDLE IS A SEARCH, NOT A NAME. The workspace's name left the crown
       — the door already says which workspace and the brand says it in colour;
       what a working screen wants in its widest slot is somewhere to type. */
    find: { label: "Search Notes", onOpen: () => {} },
    also: [act("apps"), act("inbox")],
    /* ⚠️ A DESTINATION: the foot is the navigation, so the crown carries the
       act. The other answer is asserted below. */
    foot: "nav" as const,
  };

  it("stands the product's crown down for a screen with a way out", () => {
    const out = crownFor(
      { back: () => {}, leave: "back", title: "Priya Raman", also: [act("edit")] },
      product,
    );
    expect(out.name).toBe("Priya Raman");
    /*
      ⚠️ AND IT SHOWS THE NAME AT REST, WHICH THIS PINNED THE OTHER WAY ROUND.
      `collapses` means "the content carries this name in full", and a socketed
      sub-page's content carries no heading at all — `Screen` draws one only for
      a destination, because a sub-page's crown is meant to BE the name. Asserted
      as `true`, this test was pinning the bug: every sub-page inside a Shell was
      a back arrow, two chips and nothing saying where you were.
    */
    expect(out.collapses).toBe(false);
    expect(out.back).toBeTruthy();
    /* ⚠️ The account does NOT lead a sub-page — the way out does, and a crown
       refuses both at once. */
    expect(out.who).toBeUndefined();
    expect(out.also?.map((a) => a.id)).toEqual(["edit"]);
  });

  it("keeps the product's crown for a destination, and takes its actions", () => {
    const out = crownFor({ title: "Clients", also: [act("filter")], does: undefined }, product);
    /* ⚠️ A DESTINATION'S CROWN CARRIES NO NAME AT ALL — the nav says which one
       it is and the content heads itself. What the middle carries is the app's
       search, where it has one. */
    expect(out.name).toBeUndefined();
    expect(out.find?.label).toBe("Search Notes");
    expect(out.who).toBeTruthy();
    expect(out.back).toBeUndefined();
    /* ⚠️ THE SCREEN'S OWN ACTS COME FIRST. The inbox is always there and can
       afford to be the one that falls off a full row; a screen with two of its
       own would otherwise show neither. */
    expect(out.also?.map((a) => a.id)).toEqual(["filter", "apps"]);
  });

  /*
    ⚠️ AND ON A SPECIALIZED SCREEN THE CROWN LETS THE ACT GO. Its foot is the
    act — there is no nav under it to share with — so a copy up here would be the
    same button twice with the page between them. The nav or the act, never both.
  */
  it("gives the act up where the act is the foot", () => {
    const out = crownFor(
      { title: "Receive", also: [], does: { label: "Done", onDo: () => {} } },
      { ...product, foot: "act" as const },
    );
    expect(out.does).toBeUndefined();
  });

  it("keeps the act where the foot is the navigation", () => {
    const out = crownFor(
      { title: "Stock", also: [], does: { label: "Receive", onDo: () => {} } },
      product,
    );
    expect(out.does?.label).toBe("Receive");
  });

  it("is the product's own crown when no screen has spoken", () => {
    const out = crownFor(null, product);
    expect(out.who).toBeTruthy();
    expect(out.also?.map((a) => a.id)).toEqual(["apps", "inbox"]);
  });

  it("marks the inbox when something is waiting, and not before", () => {
    const quiet = html(
      <Shell
        screens={SCREENS} here="/" held={new Set(["note:read"])} onGo={() => {}}
        crown={{ ...crown, unread: 0 }} onOpenInbox={() => {}}
      />,
    );
    expect(quiet).toContain("Notifications");
    /* ⚠️ THE LIBRARY'S OWN MARKER, NOT OURS. This asserted `data-dot="true"` —
       a private span placed by hand with `absolute -top-N -right-N`, written out
       at three call sites with three different offsets. `Badge.Anchor` has one
       offset, so the mark now sits in the same place on the account, on a crown
       action and in the nav. */
    expect(quiet).not.toContain('data-slot="badge"');

    const waiting = html(
      <Shell
        screens={SCREENS} here="/" held={new Set(["note:read"])} onGo={() => {}}
        crown={{ ...crown, unread: 3 }} onOpenInbox={() => {}}
      />,
    );
    expect(waiting).toContain('data-slot="badge"');
    /* ⚠️ AND IT IS STILL A DOT RATHER THAN A `3`. The count reaches the badge
       only where a caller asks for one; chrome says that something is waiting
       and the number is on the screen the control opens. */
    expect(waiting).not.toContain('data-slot="badge-label"');
  });
});

/* ----------------------------------------------------------------- theme --- */

describe("a workspace's branding", () => {
  /*
    ⚠️ TOKENS, NOT STYLES (D7). The whole of a tenant's brand is a handful of
    variable values; no component has a per-tenant variant and no screen knows
    branding exists.
  */
  it("is a handful of variables and nothing else", () => {
    const css = brandCss({ accent: "#2563eb", ground: "#ffffff", ink: "#111111", radius: "lg" });
    expect(css).toContain("--brand: #2563eb");
    expect(css).toContain("--background: #ffffff");
    expect(css).toContain("--radius: 0.875rem");
    /* ⚠️ Nothing but a :root block — anything wider is a stylesheet they control. */
    expect(css.match(/\{/g)).toHaveLength(1);
    expect(css).not.toContain("class");
  });

  /*
    ⚠️ A WORKSPACE CANNOT WRITE THE ACCENT, AND THAT IS THE MONOCHROME DECISION
    ENFORCED AT THE ONE PLACE THEY COULD. `--accent` is what the library paints
    every control with; their colour is `--brand`, which is the ground those
    controls sit on. The moment a tenant can set the accent the interface is
    coloured again, by somebody who has read none of this.
  */
  it("never lets a workspace write the accent", () => {
    const css = brandCss({ accent: "#2563eb" });
    expect(css).toContain("--brand:");
    expect(css).not.toContain("--accent:");
    /* ⚠️ And there is no foreground to derive any more — the pair is fixed in
       `ground.ts`, so it cannot be got wrong by anybody's choice. */
    expect(css).not.toContain("--accent-foreground");
  });

  /* ⚠️ Both themes, or the dark one inherits a light brand — which they will
     never see, having set it on their own screen in daylight. */
  it("carries a second theme when one was given", () => {
    const css = brandCssFor({ ground: "#ffffff" }, { ground: "#0b0b0b" });
    expect(css).toContain(`[data-theme="dark"]`);
    expect(css).toContain("#0b0b0b");
  });

  /* ⚠️ AND THE DARK HALF IS NOT BOUND TO THE DOCUMENT ELEMENT, so one screen can
     be a dark room inside a light app (`Page`'s `world`). Bound to `:root` the
     tokens could only ever switch for the whole page, and the library's own are
     already written the scopable way — ours were the half that could not
     follow. */
  it("scopes the second theme to any element, not only the root", () => {
    const css = brandCssFor({ ground: "#ffffff" }, { ground: "#0b0b0b" });
    expect(css).not.toContain(`:root[data-theme="dark"]`);
  });

  it("knows an unreadable pair from a readable one", () => {
    expect(readable("#111111", "#ffffff")).toBe(true);
    expect(readable("#eeeeee", "#ffffff")).toBe(false);
  });

  /*
    ⚠️ A NAMED SKY TAKES ITS COLOUR FROM THE TOKENS, so a brand change reaches
    the background of every screen with nothing else edited. This used to be
    twenty-four hand-written stacks each of which had to remember; it is one
    binding now, and what it hands the engine is `var(--background)` and
    `var(--brand)` rather than anything a file here chose.
  */
  it("derives a named sky from tokens rather than from a colour", () => {
    for (const sky of SKIES) {
      const made = worldCss(skyWorld(sky as "glow"), { night: true, density: "even" });
      expect(made.css["--world-ground"], `${sky} names no token`).toContain("var(--brand)");
      /* ⚠️ Black, white and full transparency are ALPHA rather than colour — a
         family mixes toward them to darken and to lighten. Any other literal is
         a hue this file chose, which is the thing that cannot follow a brand. */
      const hues = [...(made.css["--world-ground"] ?? "").matchAll(/#[0-9a-f]{3,8}\b/gi)]
        .map((m) => m[0].toLowerCase())
        .filter((h) => !["#000", "#fff", "#000000", "#ffffff"].includes(h));
      expect(hues, `${sky} holds a colour of its own`).toEqual([]);
    }
  });

  /*
    ⚠️ AND THE SAME NAME IS A DIFFERENT WORLD PER SEED, which is the whole gain
    over the twenty-four. `glow` behind two screens is two grounds of one
    material rather than the same picture twice — and nobody chose either.
  */
  it("gives one family a different world per seed", () => {
    const a = worldCss(skyWorld("glow", "today"), { night: true, density: "even" });
    const b = worldCss(skyWorld("glow", "clients"), { night: true, density: "even" });
    expect(a.css["--world-ground"]).not.toBe(b.css["--world-ground"]);
    expect(worldCss(skyWorld("glow", "today"), { night: true, density: "even" }).css)
      .toEqual(a.css);
  });

  /**
   * ⚠️ A MOVING GROUND HAS THREE WAYS TO SHIP BROKEN AND ALL THREE ARE SILENT.
   * It can move a layer that is not overscanned, which exposes bare ground and
   * a hard edge at the top of every screen carrying it. It can keep moving for
   * somebody who asked it to stop, which is a preference for most people and a
   * symptom for some. And it can grow a second keyframe, which is how a motion
   * vocabulary becomes one entry per screen. None of the three fails a render,
   * so none of the three fails a test that only mounts something.
   */
  it("bounds every ground that moves", () => {
    const css = ambienceStylesheet();

    /*
      ⚠️ AND NOW NOTHING IN IT MOVES AT ALL. This asserted a drift keyframe, its
      overscan and its opt-out; all three are gone, and for two different
      reasons. The BEATS left because a mark lives inside a `<pattern>` and
      Chromium rasterises a pattern's tile once — a CSS animation in there is
      created, is reported by `getAnimations()`, and repaints nothing. The DRIFT
      left because the grain above it uses `mix-blend-mode`, and a blended layer
      cannot be composited apart from what it blends with: animating underneath
      it re-blends a viewport-sized stack on the main thread sixty times a
      second, for a wash sliding two percent over twenty-four seconds.

      ⚠️ THE SCENE STILL MOVES — in SMIL, inside the tile, where it redraws the
      pattern rather than resampling the picture of it. `test/sky.seen.test.tsx`
      photographs that; this is what stops the stylesheet growing a second answer
      beside it.
    */
    expect(css).toContain("[data-sky]:not([data-sky=\"plain\"])::before {");
    expect(css, "the ambience stylesheet declares a keyframe again").not.toMatch(/@keyframes/);
    expect(css, "the ambience stylesheet animates something again")
      .not.toMatch(/\banimation\s*:/);

    /*
      ⚠️ AND THE HOST CLIPS THAT OVERSCAN, WHICH NOTHING DID. A `scale(1.14)`
      layer hangs ~90px past each edge at desktop width, so the DOCUMENT grew:
      the page scrolled sideways into nothing, and further every second, because
      the scroll area tracked the animation. Eight of ten screens did it and no
      element was ever out of bounds — the overflow is a pseudo-element's, which
      is exactly why looking for a wide child finds nothing.

      ⚠️ AND ON BOTH AXES, WHICH IT WAS NOT. This asserted `overflow-x` and so
      pinned half a fix: the block axis was left open on the reasoning that "the
      page still scrolls the way it is supposed to", and the ornament's overhang
      below the fold was scrollable overflow exactly as its overhang sideways
      had been. Measured on the sign-in door at 412×830, the document came out
      869 tall — 39px of scroll under a screen with nothing below it, on every
      page in the product. Clipping does not stop a page scrolling: the host is
      `min-h-dvh` and grows with its content, so nothing but the ornament is ever
      outside it. Verified in a browser, with a 3000px filler: 3830 tall, and
      `scrollTo(1200)` lands at 1200.

      ⚠️ `clip`, NEVER `hidden`, AND THAT IS THE FRAGILE HALF. `hidden` makes
      this a scroll container and every `sticky` crown and nav inside it stops
      sticking. Measured, all three: `overflow-x: clip` and `overflow: clip` both
      hold a sticky crown at 0 after a 900px scroll; `overflow: hidden` rides it
      away to -900.
    */
    expect(css).toContain("[data-sky] { position: relative; isolation: isolate; overflow: clip;");
    expect(css).not.toContain("[data-sky] { position: relative; isolation: isolate; overflow: hidden");
    expect(css).not.toContain("[data-sky] { position: relative; isolation: isolate; overflow-x: clip");

    /*
      ⚠️ AND NOW NOTHING IN IT MOVES AT ALL. This asserted a drift keyframe and a
      beat rule per entry in the table; both are gone, and each for its own
      reason. The BEATS left because a mark lives inside a `<pattern>` and
      Chromium rasterises a pattern's tile once — a CSS animation in there is
      created, reported by `getAnimations()`, and repaints nothing. The DRIFT
      left because the grain above it uses `mix-blend-mode`, and a blended layer
      cannot be composited apart from what it blends with, so animating
      underneath it re-blends a viewport-sized stack on the main thread sixty
      times a second for a wash sliding two percent.

      ⚠️ THE SCENE STILL MOVES — in SMIL, inside the tile, where it redraws the
      pattern rather than resampling the picture of it. `test/sky.seen.test.tsx`
      photographs that; this is what keeps the stylesheet from growing a second
      answer beside it.
    */
    expect(css, "the ambience stylesheet declares a keyframe again").not.toMatch(/@keyframes/);
    expect(css, "the ambience stylesheet animates something again")
      .not.toMatch(/\banimation\s*:/);
  });

  /**
   * ⚠️ A DRAWN GROUND STRETCHED TO THE VIEWPORT IS A DIFFERENT DRAWING ON EVERY
   * SCREEN, and the one it is worst on is the phone: 700 units of width squeezed
   * into 342px while 520 of height is pulled over 844 multiplies the slope, and
   * a calm field becomes corduroy. Nothing catches it — the CSS is valid, the
   * drawing is correct, and the desktop it was designed on looks right.
   */
  /*
    ⚠️ ONE SIZING RULE FOR EVERY GROUND, WHICH IS WHAT THE ENGINE BOUGHT. This
    used to name `silk`, `linen` and `wire` and check each had a background-size
    of its own, because twenty-four hand-written grounds each layered differently
    and the list of sizes CYCLES — a missing entry tiled the ground at the marks'
    size and turned a world into wallpaper, silently. A scene brings its ground
    in as one value, so there is one rule and nothing to keep in step.
  */
  it("sizes every ground with one rule rather than one per world", () => {
    const css = ambienceStylesheet();
    const rule = css.slice(css.indexOf('[data-sky]:not([data-sky="plain"])::before {'));
    expect(rule).toContain("background-image: var(--world-ground, none)");
    expect(rule).toContain("background-size: cover");
    expect(rule).not.toContain("100% 100%");
    /* ⚠️ And no rule anywhere names one world — the shape the deletion removed. */
    expect(css).not.toMatch(/\[data-sky="(?!plain|world)[a-z]+"\]/);
  });

  it("maps what happened onto the library's colour names in one place", () => {
    expect(colorFor("neutral")).toBe("default");
    expect(colorFor("info")).toBe("accent");
    expect(colorFor("danger")).toBe("danger");
  });
});

/* ----------------------------------------------------------------- legal --- */

/**
 * ⚠️ THESE TWO WERE UNTESTED AND ONE OF THEM RENDERED NOTHING. `SubProcessors`
 * put `Table.Header` straight under `Table`, skipping `Table.Content` — which is
 * the collection react-aria needs — so it threw "cannot be rendered outside a
 * collection" and took the WHOLE Data & Trust screen down to a blank page. It
 * typechecked, and every suite was green, because nothing ever rendered it.
 *
 * ⚠️ SO THE ASSERTION IS THAT IT RENDERS AT ALL, and that is not a weak test
 * here: a screen-level component that throws during render is the one failure
 * that produces no partial output, no console warning a person would see, and no
 * difference between "broken" and "not built yet".
 */
describe("a card inside a card", () => {
  /*
    ⚠️ THE NESTING IS INVISIBLE, WHICH IS THE WHOLE REASON THIS IS PINNED. Two
    cards are the same colour, so what somebody sees is one card whose first row
    starts twice as far down as every other card in the product — and it reads as
    a spacing fault in the ROW. It shipped on the legal screen exactly that way,
    with every suite green.

    ⚠️ AND IT ARRIVES FROM TWO CORRECT DECISIONS. A rendered list owns a `Group`
    so it can stand on a screen alone; a screen owns a `Group` so it can head the
    block. Neither is wrong; the composition is. So the library answers it.
  */
  it("draws one card when a group is nested in a group", () => {
    const one = html(<Group><NavRow label="A" onOpen={() => {}} /></Group>);
    const two = html(
      <Group label="Outer">
        <Group><NavRow label="A" onOpen={() => {}} /></Group>
      </Group>,
    );
    expect(one.split('data-slot="card"').length - 1).toBe(1);
    expect(two.split('data-slot="card"').length - 1).toBe(1);
    /* ⚠️ AND THE INNER LABEL IS NOT SWALLOWED. Standing the card down is a
       spacing fix; losing what somebody named the block would be a worse
       failure than the one it repairs. */
    const named = html(
      <Group label="Outer"><Group label="Inner"><NavRow label="A" onOpen={() => {}} /></Group></Group>,
    );
    expect(named).toContain("Inner");
    expect(named.split('data-slot="card"').length - 1).toBe(1);
  });
});

describe("the legal surfaces", () => {
  it("renders the sub-processor table, which needs the collection to exist", () => {
    const out = html(
      <SubProcessors
        book={{
          stripe: {
            id: "stripe", name: "Stripe", role: "Payments", country: "IE",
            receives: ["contact"],
          },
        }}
      />,
    );
    expect(out).toContain("Stripe");
    expect(out).toContain("Payments");
  });

  it("renders documents, and says which one is still owed", () => {
    const docs = [
      {
        id: "terms", kind: "terms", title: "Terms", version: "2026-01-01" as never,
        mustAccept: true, binds: "tenant", url: "/terms",
      },
      {
        id: "privacy", kind: "privacy", title: "Privacy", version: "2026-01-01" as never,
        mustAccept: false, binds: "person", url: "/privacy",
      },
    ] as const satisfies readonly DocumentDef[];
    const out = html(
      <Documents documents={docs} outstanding={[docs[0]!]} onOpen={() => {}} />,
    );
    expect(out).toContain("Terms");
    /* ⚠️ EVERY ROW OPENS, INCLUDING THE ONE ALREADY AGREED TO. The version that
       carried "Read and accept" on the owed row and a flat "Accepted" on the
       other had no way to read either — so somebody could agree to a document
       and never see it, then never see it again. */
    expect(out).toContain("Privacy");
    expect(out).toContain("Not agreed yet");
    /* ⚠️ AND THE VERSION IS SAID AS THE DAY IT IS, NOT PRINTED AS IT IS STORED.
       The row carried `2026-01-01` in a badge; a version IS a publication date,
       so the row says when the wording was published in the reader's own
       conventions. The stored spelling appearing anywhere on a screen is what
       `present.test.mjs` refuses. */
    expect(out).not.toContain("2026-01-01");
    expect(out).toContain("Published Jan 1, 2026");
  });

  /*
    ⚠️ THE PUBLISHED VERSION AND THE DAY SOMEBODY SIGNED ARE THE SAME FACT ONLY
    WHILE NOTHING HAS CHANGED. Printed side by side without saying so, the row
    read "Version 2026-08-01 · agreed 11 Feb 2026" for a person who agreed to the
    FEBRUARY wording — the row claiming they accepted text they have never seen.
  */
  it("says a signature is against an earlier version, and seals a current one", () => {
    const docs = [
      {
        id: "terms", kind: "terms", title: "Terms", version: "2026-08-01" as never,
        mustAccept: true, binds: "person", url: "/terms",
      },
      {
        id: "privacy", kind: "privacy", title: "Privacy", version: "2026-08-01" as never,
        mustAccept: true, binds: "person", url: "/privacy",
      },
    ] as const satisfies readonly DocumentDef[];
    const out = html(
      <Documents
        documents={docs}
        onOpen={() => {}}
        signed={{
          terms: { at: "2026-08-04T10:00:00.000Z", version: "2026-08-01" },
          privacy: { at: "2026-02-11T10:00:00.000Z", version: "2026-02-01" },
        }}
      />,
    );
    expect(out).toContain("Agreed ");
    expect(out).toContain("Earlier version agreed ");
  });
});

/* ---------------------------------------------------------------- outcomes --- */

/**
 * ⚠️ "NONE SUPPLIED" AND "DRAW NOTHING" ARE DIFFERENT ANSWERS, and conflating
 * them fails in the direction nobody looks at. The empty branch was chosen by
 * truthiness, so `nothing={null}` — a caller deliberately asking for silence —
 * fell through to `then` with an empty array: In your words drew a section
 * heading and its description over no rows, which reads as a page that failed
 * to load rather than as an answer.
 */
describe("the four outcomes", () => {
  const loaded = <T,>(data: T) => ({ status: "loaded", data }) as never;

  it("draws nothing when a caller asks for nothing on an empty result", () => {
    const out = html(
      <Await
        of={loaded<readonly string[]>([])}
        waiting={<span>waiting</span>}
        nothing={null}
        then={() => <span>CONTENT</span>}
      />,
    );
    expect(out).not.toContain("CONTENT");
    expect(out).toBe("");
  });

  it("still renders content on an empty result when no empty state was supplied", () => {
    const out = html(
      <Await
        of={loaded<readonly string[]>([])}
        waiting={<span>waiting</span>}
        then={(rows: readonly string[]) => <span>rows: {rows.length}</span>}
      />,
    );
    expect(out).toContain("rows: 0");
  });

  it("prefers the supplied empty state over the content branch", () => {
    const out = html(
      <Await
        of={loaded<readonly string[]>([])}
        waiting={<span>waiting</span>}
        nothing={<span>NOTHING YET</span>}
        then={() => <span>CONTENT</span>}
      />,
    );
    expect(out).toContain("NOTHING YET");
    expect(out).not.toContain("CONTENT");
  });
});


/* ----------------------------------------------------------------- shapes --- */

/**
 * WHERE THE ONE ACTION GOES, WHICH IS THE ONLY THING A SHAPE IS FOR.
 *
 * ⚠️ EVERY ASSERTION HERE IS ABOUT A DECISION NO SCREEN MAKES ANY MORE, so the
 * thing being tested is that the decision is still being made at all. A preset
 * system whose preset quietly stops placing the action leaves twenty screens
 * each looking slightly wrong and no file to blame — which is precisely the
 * state it was built to end.
 */
describe("the screen shapes", () => {
  const act = { label: "Invite somebody", onDo: () => {} };

  /*
    ⚠️ TWICE IN THE MARKUP, ONCE ON THE SCREEN. The crown's copy is `hidden
    md:flex` and the dock's wrapper is `md:hidden`, so exactly one is visible at
    any width — and both come from ONE declaration, which is what stops the
    crown saying "Invite" while the bar says "Add somebody".
  */
  it("puts the primary action in the crown and in the dock, from one declaration", () => {
    const out = html(
      <Screen shape="list" title="People" does={act} of={ready(["a"])} then={() => <p>rows</p>} />,
    );
    expect([...out.matchAll(/Invite somebody/g)]).toHaveLength(2);
    expect(out).toContain("hidden md:flex");
    expect(out).toContain("md:hidden");
  });

  /*
    ⚠️ THE ACTION APPEARS WHEN THERE IS SOMETHING TO ACT ON. A primary floating
    over a skeleton invites a press against data that has not arrived; over a
    refusal it competes with the only useful control, which is "try again".
  */
  it("offers no action while waiting or on a refusal", () => {
    expect(html(
      <Screen shape="list" title="People" does={act} of={waiting()} then={() => null} />,
    )).not.toContain("Invite somebody");

    expect(html(
      <Screen
        shape="list" title="People" does={act} then={() => null}
        of={trouble({ code: "platform.unavailable", status: 500, title: "It broke", retryable: true, tone: "danger" })}
      />,
    )).not.toContain("Invite somebody");
  });

  /*
    ⚠️ AND ON AN EMPTY SCREEN IT MOVES INTO THE EMPTY STATE. Twice on a page
    with nothing else on it — once in the only thing there and once bolted to
    the bottom — is the exact fault the whole system exists to remove.
  */
  it("moves the action into the empty state, and only there", () => {
    const out = html(
      <Screen
        shape="list" title="People" does={act}
        of={ready([])} nothing={{ says: "Nobody here yet" }} then={() => null}
      />,
    );
    expect(out).toContain("Nobody here yet");
    expect([...out.matchAll(/Invite somebody/g)]).toHaveLength(1);
    expect(out).not.toContain("md:hidden");
  });

  /*
    ⚠️ THE SKELETON GOES WHERE THE CONTENT GOES, AND THE EMPTY STATE DOES NOT.
    `shows` read anything that was not `ready` as one answer, so waiting shared
    the empty state's treatment — centred in what is left of the viewport — and
    every screen in the product dropped its content to the top the moment it
    arrived. That is the one jump a skeleton exists to prevent, and it was in the
    frame rather than in any screen, so no screen could be blamed for it.
  */
  it("centres an empty screen and a refusal, and never a skeleton", () => {
    /*
      ⚠️ THE FRAME'S OWN CENTRING, NOT THE WORD ANYWHERE ON THE PAGE. A bare
      `/justify-center/` reads any descendant that happens to centre something
      inside itself — and one does: the bones lead wears `LEAD`, which centres a
      glyph in a 40px circle. So the skeleton half of this test started failing
      on a class that says nothing about where the content sits. `WHOLE` is the
      container the frame reaches for, so that is what is matched.
    */
    const centred = new RegExp(WHOLE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    /* ⚠️ AND THE TOKEN'S MEANING IS PINNED SEPARATELY, or this is a tautology.
       Building the regex from `WHOLE` asserts the frame reaches for that
       container; it cannot also assert the container centres, because a `WHOLE`
       edited to `justify-start` would move both sides of the comparison and the
       test would still pass over a page that no longer centres anything. */
    expect(WHOLE).toContain("justify-center");

    const wait = html(
      <Screen shape="list" title="People" of={waiting<string[]>()} then={() => null} />,
    );
    expect(wait).not.toMatch(centred);

    const empty = html(
      <Screen
        shape="list" title="People"
        of={ready<string[]>([])} nothing={{ says: "Nobody here yet" }} then={() => null}
      />,
    );
    expect(empty).toMatch(centred);

    const no = html(
      <Screen shape="list" title="People" refused={{ says: "Not for you" }} />,
    );
    expect(no).toMatch(centred);
  });

  /*
    ⚠️ A REFUSAL KEEPS ITS CROWN, which five screens did not. Returned early,
    above the frame, it is a sentence alone on a page — no title, no way back.
  */
  it("keeps the page's name when somebody may not see it", () => {
    const out = html(
      <Screen shape="settings" title="In your words" refused={{ says: "Only an owner may" }} />,
    );
    expect(out).toContain("In your words");
    expect(out).toContain("Only an owner may");
  });

  /*
    ⚠️ A `settings` SCREEN CANNOT CARRY A SAVE. The guard catches it before this
    runs; this catches the shape chosen at runtime, and it is LOUD rather than
    silent — dropping the button would leave somebody wondering why it never
    rendered.
  */
  it("refuses a primary action on a settings screen", () => {
    expect(() => html(<Screen shape="settings" title="Settings" does={act} />)).toThrow(/settings/);
  });

  /*
    ⚠️ NOBODY PAYS A TAP FOR A MENU WITH ONE ITEM ON IT — see `Whichever`. Three
    screens implemented this by hand and each stated the rule in its own words.
  */
  it("skips the list where there is only one to choose between", () => {
    const one = html(
      <Whichever
        items={[{ id: "beacon", name: "Beacon" }]}
        id={(a) => a.id} name={(a) => a.name}
        onChoose={() => {}} nothing={{ says: "None" }}
        then={(a) => <p>inside {a.name}</p>}
      />,
    );
    expect(one).toContain("inside Beacon");

    const several = html(
      <Whichever
        items={[{ id: "beacon", name: "Beacon" }, { id: "atlas", name: "Atlas" }]}
        id={(a) => a.id} name={(a) => a.name}
        onChoose={() => {}} nothing={{ says: "None" }}
        then={(a) => <p>inside {a.name}</p>}
      />,
    );
    expect(several).not.toContain("inside");
    expect(several).toContain("Beacon");
    expect(several).toContain("Atlas");
  });
});

/* ------------------------------------------------------------ the wallet --- */

/**
 * ONE BALANCE MADE OF TWO NUMBERS, AND THE SCREEN HAS TO SAY WHICH IS WHICH.
 *
 * ⚠️ A SINGLE FIGURE THAT DROPS ON THE FIRST OF THE MONTH, with nothing on the
 * screen saying why, is a support conversation every month for ever. What lapses
 * and what does not are two rows, and the copy on each says its RULE rather than
 * its name — "allowance" and "bought" are labels somebody has to be taught.
 */
describe("the wallet", () => {
  const PACKS = [
    { id: "p1", name: "1,000 credits", credits: 1000, price: 1000, currency: "USD", order: 0 },
  ];

  it("says which half of the balance lapses and which does not", () => {
    const out = html(
      <Wallet granted={1000} bought={2500} held={0} spentByApp={[]}
        appName={(id) => id} packs={PACKS} onBuy={() => {}} />,
    );
    expect(out).toContain("Ends when the month does");
    expect(out).toContain("Never expires");
    /* ⚠️ And the hero is what can be SPENT — a balance that silently includes a
       hold disagrees with the product at the moment of a refusal. */
    expect(out).toContain("3,500");
  });

  it("shows a hold rather than quietly subtracting it", () => {
    const out = html(
      <Wallet granted={1000} bought={0} held={800} spentByApp={[]}
        appName={(id) => id} packs={PACKS} onBuy={() => {}} />,
    );
    expect(out).toContain("For calls that are still running");
    expect(out).toContain("200");
  });

  /*
    ⚠️ A DEBT IS SAID PLAINLY, AND SO IS THE WAY OUT. Storage over the included
    amount is metered rather than refused, so this row is the only place somebody
    learns the meter could not collect — and that it is what stopped their writes.
  */
  it("says what is owed, and that nothing was deleted", () => {
    const out = html(
      <Wallet granted={0} bought={0} held={0} owed={12} spentByApp={[]}
        appName={(id) => id} packs={PACKS} onBuy={() => {}} />,
    );
    expect(out).toContain("Owed");
    expect(out).toContain("nothing has been deleted");
  });

  /*
    ⚠️ THE STANDING CHARGE IS A CONTROL ON THIS SCREEN, and its absence is the
    failure the whole framework is built around: an operation that exists and no
    surface that reaches it. It is also where somebody watching their credits run
    down is already looking.
  */
  it("offers the standing top-up only where something can arm it", () => {
    const off = html(
      <Wallet granted={0} bought={0} held={0} spentByApp={[]}
        appName={(id) => id} packs={PACKS} onBuy={() => {}} />,
    );
    expect(off).not.toContain("Buy more automatically");

    const on = html(
      <Wallet granted={0} bought={0} held={0} spentByApp={[]}
        appName={(id) => id} packs={PACKS} onBuy={() => {}} onArm={() => {}} />,
    );
    expect(on).toContain("Buy more automatically");
    /* ⚠️ Turning it off has to be reachable, and it is never a refusal. */
    expect(on).toContain("Turn off");
  });

  /* ⚠️ AND A DECLINE REACHES THE CUSTOMER. Nobody was present when the bank
     refused, so without this the credits simply stop arriving. */
  it("says why the last automatic charge did not work", () => {
    const out = html(
      <Wallet granted={0} bought={0} held={0} spentByApp={[]}
        appName={(id) => id} packs={PACKS} onBuy={() => {}} onArm={() => {}}
        armed={{ packId: "p1", below: 500, error: "Your bank did not approve the charge." }} />,
    );
    expect(out).toContain("Your bank did not approve the charge.");
  });
});

/* ----------------------------------------------------------- the storage --- */

describe("the storage meter", () => {
  /*
    ⚠️ THE PRICE IS ON THE SCREEN WHETHER OR NOT IT IS BEING PAID. The included
    amount is where the meter starts rather than where the product stops, and
    that is only kind if somebody can see the line coming — a charge that arrives
    without a screen that predicted it is the same surprise as a refusal.
  */
  it("says the rate before anybody is paying it", () => {
    const GB = 1024 * 1024 * 1024;
    const out = html(<Storage used={2 * GB} included={10 * GB} creditsPerGbMonth={20} />);
    expect(out).toContain("Within your plan");
    /* ⚠️ GiB, NOT GB. The component divides by 2³⁰ and the label now says so —
       calling that "GB" is the decimal unit, a seven percent overstatement in
       the direction that makes a quota look further away than it is. */
    expect(out).toContain("per GiB");
  });

  it("says how far over the included amount a workspace is", () => {
    const GB = 1024 * 1024 * 1024;
    const out = html(<Storage used={14 * GB} included={10 * GB} creditsPerGbMonth={20} />);
    expect(out).toContain("4.0 GiB over what your plan includes");
  });
});

/**
 * A CONTROL WITH NO INPUT IS A PICTURE OF A CONTROL.
 *
 * ⚠️ HEROUI PUTS THE SWITCH'S HIDDEN `<input role="switch">` INSIDE ITS CONTENT
 * SLOT, so a switch written without one renders two styled spans: correct
 * shape, correct colour, correct position, and nothing to press. It shipped
 * that way and the report was "the switch does not work no matter how much I
 * click it", which is exactly what it was.
 *
 * ⚠️ AND EVERY OTHER TEST IN THIS FILE STILL PASSED, which is the point of
 * adding this one. Markup assertions ask what is OFFERED; none of them asked
 * whether the thing offered can be operated, so the one property that was
 * missing is the one nothing looked for.
 */
describe("a switch has something to press", () => {
  const inputs = (node: React.ReactNode) => (html(node).match(/<input\b/g) ?? []).length;

  it("renders an input with no word asked for", () => {
    expect(inputs(<SettledSwitch value={false} onSet={async () => true} />)).toBe(1);
  });

  it("renders an input with a word asked for", () => {
    expect(inputs(
      <SettledSwitch value onSet={async () => true} says={(on) => (on ? "Yes" : "No")} />,
    )).toBe(1);
  });

  /* ⚠️ Says its state, because a switch with no accessible name is unusable to
     anybody who cannot see the thumb. */
  it("says which way it is", () => {
    expect(html(<SettledSwitch value onSet={async () => true} />)).toContain("On");
    expect(html(<SettledSwitch value={false} onSet={async () => true} />)).toContain("Off");
  });

  /* ⚠️ THE ROW IT ACTUALLY SHIPS IN. The component was right in isolation and
     wrong where it was used, which is the shape half of this file exists for. */
  it("still has one inside a model's row", () => {
    expect(inputs(
      <ModelLine
        label="llama" id="@cf/meta/llama" meter="token" input={1} output={2}
        controls={<SettledSwitch value={false} onSet={async () => true} />}
      />,
    )).toBe(1);
  });

  /* ⚠️ And the settings row that predates it, so the rule covers both. */
  it("and one on a toggle row", () => {
    expect(inputs(
      <ToggleRow label="Email me" value onChange={() => undefined} />,
    )).toBe(1);
  });
});

/* ------------------------------------------------------------ what may be --- */

/*
  ⚠️ THE ONE THING A SCREEN IS FOR, ASKED ABOUT BEFORE IT IS DRAWN. A primary
  that is drawn, pressed and refused puts the answer in a toast over whatever the
  person just filled in — so `Screen` reads the verdict the boot already carried
  and says so on the control instead.

  ⚠️ AND THE VERDICT REACHES IT THROUGH A CONTEXT RATHER THAN A PROP. A prop is a
  thing every screen in every product has to remember to pass, and the one that
  forgets is not visibly different — it just goes on drawing a button that fails.
*/
describe("a control the gate would refuse", () => {
  const withAct = (op: string) => (
    <Screen shape="board" title="A board" does={{ op, label: "Do the thing", onDo: () => {} }}>
      <div>nothing</div>
    </Screen>
  );

  it("is drawn, disabled, and says which gate stopped it", () => {
    const html = renderToStaticMarkup(
      <Allowed may={{ "thing.do": "entitlement" }}>{withAct("thing.do")}</Allowed>);
    expect(html).toContain("Do the thing");
    expect(html).toContain(sayGate("entitlement"));
    expect(html, "the control is still pressable").toContain("disabled");
  });

  /* ⚠️ AND A DIFFERENT GATE IS A DIFFERENT SENTENCE. "You cannot yet" and "your
     plan does not include this" are different controls, and a mechanism that
     said one thing for all nine would be a boolean wearing a name. */
  it("says something else when a different gate stopped it", () => {
    const html = renderToStaticMarkup(
      <Allowed may={{ "thing.do": "quota" }}>{withAct("thing.do")}</Allowed>);
    expect(html).toContain(sayGate("quota"));
    expect(html).not.toContain(sayGate("entitlement"));
  });

  /* ⚠️ ABSENT MEANS ALLOWED, WHICH IS THE ONLY SAFE DIRECTION FOR A SURFACE.
     Drawing a control the server refuses costs a wasted press; hiding one it
     would have allowed costs a feature somebody paid for and cannot find. */
  it("is untouched when no gate names it", () => {
    const html = renderToStaticMarkup(
      <Allowed may={{ "other.thing": "credits" }}>{withAct("thing.do")}</Allowed>);
    expect(html).toContain("Do the thing");
    for (const gate of GATE_ORDER) expect(html, gate).not.toContain(sayGate(gate));
  });

  /* ⚠️ AND A SCREEN THAT NAMES NOTHING BEHAVES EXACTLY AS IT DID. The field is
     optional, so every act written before this existed is unchanged. */
  it("leaves an act that names no operation alone", () => {
    const html = renderToStaticMarkup(
      <Allowed may={{ "thing.do": "entitlement" }}>
        <Screen shape="board" title="A board" does={{ label: "Do the thing", onDo: () => {} }}>
          <div>nothing</div>
        </Screen>
      </Allowed>);
    expect(html).toContain("Do the thing");
    expect(html).not.toContain(sayGate("entitlement"));
  });
});
