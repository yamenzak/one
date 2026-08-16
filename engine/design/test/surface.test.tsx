/**
 * WHAT A PERSON IS OFFERED, AND WHAT THEY ARE NOT.
 *
 * ⚠️ EVERY ASSERTION HERE IS ABOUT A SCREEN NOBODY WROTE. The settings screens,
 * the notification policy, the flag console and the plan shelf are rendered from
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
import { field, flag, notification, setting, type Channel } from "@engine/kernel";
import { Settings, settingsShown } from "../src/rendered/settings.js";
import { NotificationPolicy, policyShown } from "../src/rendered/policy.js";
import { FlagConsole, Shelf, saying, money } from "../src/rendered/console.js";
import { Shell, reachable } from "../src/frame/shell.js";
import { crownFor } from "../src/frame/crown.js";
import { brandCss, brandCssFor, readable, colorFor } from "../src/tokens/theme.js";
import { ambienceStylesheet, skyWorld, worldCss } from "../src/tokens/ambience.js";
import { SKIES } from "../src/scene/index.js";
import { BEAT } from "../src/tokens/motion.js";
import { Screen, Whichever } from "../src/frame/screen.js";
import { ready, trouble, waiting } from "../src/parts/state.js";
import { Documents, SubProcessors } from "../src/rendered/legal.js";
import { Await } from "../src/parts/state.js";
import type { DocumentDef } from "@engine/kernel";

const html = (node: React.ReactNode): string => renderToStaticMarkup(node);

/* -------------------------------------------------------------- settings --- */

const SETTINGS = {
  "retention.days": setting({
    id: "retention.days", level: "tenant", group: "Data",
    field: field.number({ label: "Keep records for", holds: "none", min: 1 }),
    fallback: 365, needs: "tenant:manage",
  }),
  "provider.key": setting({
    id: "provider.key", level: "tenant", group: "Payments", secret: true,
    field: field.text({ label: "Secret key", holds: "none" }),
    fallback: "", needs: "tenant:manage",
  }),
  "exports.nightly": setting({
    id: "exports.nightly", level: "tenant", group: "Data",
    field: field.bool({ label: "Nightly export", holds: "none" }),
    fallback: false, needs: "tenant:manage", entitlement: "exports",
  }),
  theme: setting({
    id: "theme", level: "person", group: "Appearance",
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
      <Settings book={SETTINGS} level="tenant" stored={{}} held={owner} onChange={() => {}} />,
    );
    expect(out).toContain("Keep records for");
    expect(out).toContain("Data");
    expect(out).toContain("Payments");
  });

  /*
    ⚠️ A CONTROL SOMEBODY CANNOT USE IS ABSENT, NOT DISABLED. Showing it invites
    them to ask for it, which is sometimes right and is the owner's decision to
    make rather than a screen's.
  */
  it("does not draw a workspace setting for somebody who cannot change it", () => {
    expect(settingsShown(SETTINGS, "tenant", new Set())).toEqual([]);
    const out = html(
      <Settings book={SETTINGS} level="tenant" stored={{}} held={new Set()} onChange={() => {}} />,
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
        book={SETTINGS} level="tenant" held={owner} onChange={() => {}}
        stored={{ "provider.key": "sk_live_do_not_leak" }}
      />,
    );
    expect(out).not.toContain("sk_live_do_not_leak");
    expect(out).toContain("Stored. Type to replace it.");
  });

  /*
    ⚠️ AND A SETTING BEHIND AN ENTITLEMENT IS SHOWN AND LOCKED, which is the
    opposite choice and deliberately so: it is something they can buy, and hiding
    it hides the offer.
  */
  it("shows what the plan does not include rather than hiding it", () => {
    const out = html(
      <Settings
        book={SETTINGS} level="tenant" stored={{}} held={owner} onChange={() => {}}
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

/* ----------------------------------------------------------------- flags --- */

describe("the flag console", () => {
  const book = {
    "note-search": flag({
      id: "note-search", label: "Search", why: "Being tried before everybody gets it.",
      stage: "trying", fallback: false, setBy: "tenant", retire: "2026-01-01" as never,
    }),
  };

  /*
    ⚠️ THE DEPLOYMENT'S `off` IS ABSORBING, AND THE SCREEN SAYS WHY THE SWITCH IS
    DEAD. A kill switch a tenant can beat does not work on the only day it is
    used.
  */
  it("locks a tenant out of a switch we have turned off, and says so", () => {
    const out = html(
      <FlagConsole
        book={book} level="tenant" deployment={{ "note-search": false }}
        today="2025-06-01" onSet={() => {}}
      />,
    );
    expect(out).toContain("only an operator can change it");
  });

  /* ⚠️ Reported, never enforced. Withholding a capability on a date somebody
     typed a year ago is an outage nobody asked for. */
  it("reports an overdue flag without switching it off", () => {
    const out = html(
      <FlagConsole
        book={book} level="operator" deployment={{ "note-search": true }}
        today="2026-06-01" onSet={() => {}}
      />,
    );
    expect(out).toContain("Past its retirement date");
  });
});

/* ----------------------------------------------------------------- shelf --- */

describe("the plan shelf", () => {
  /* ⚠️ `-1` is unlimited and `0` is none — a shelf showing "-1" is a price list
     nobody can read. */
  it("says what a number means rather than printing it", () => {
    expect(saying(-1)).toBe("Unlimited");
    expect(saying(0)).toBe("—");
    expect(saying(true)).toBe("Included");
    expect(saying(5)).toBe("5");
    expect(money(0, "EUR")).toBe("Free");
    expect(money(900, "EUR")).toContain("9");
  });

  it("shows every plan including the one somebody lands on by not choosing", () => {
    const out = html(
      <Shelf
        current="free"
        plans={[
          { id: "free", name: "Free", said: "A look", price: 0, currency: "EUR", order: 0,
            parking: true, includes: { seats: 1 } },
          { id: "team", name: "Team", said: "For work", price: 900, currency: "EUR", order: 1,
            trialDays: 14, includes: { seats: 10 } },
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
  { id: "search", route: "/search", label: "Search", nav: "secondary" as const,
    permission: "note:read", flag: "note-search" },
];

describe("the shell", () => {
  const crown = { appId: "hello", appName: "Hello", appMark: "◇", tenantName: "Northwind" };

  /*
    ⚠️ A DESTINATION SOMEBODY CANNOT REACH IS NOT DRAWN. A nav item leading to a
    403 is a promise the product does not keep, and nothing tells the person it
    is not simply broken.
  */
  it("draws only what this person can reach", () => {
    expect(reachable(SCREENS, new Set(["note:read"]), { "note-search": true }).map((s) => s.id))
      .toEqual(["notes", "search"]);
    const out = html(
      <Shell screens={SCREENS} here="/" held={new Set(["note:read"])} crown={crown} onGo={() => {}} />,
    );
    expect(out).toContain("Notes");
    expect(out).not.toContain("People");
  });

  /* ⚠️ And a screen behind one of our switches is not drawn while it is off. */
  it("hides a screen behind a flag we have not turned on", () => {
    expect(reachable(SCREENS, new Set(["note:read"]), {}).map((s) => s.id)).toEqual(["notes"]);
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
    name: "Northwind Strength",
    also: [act("apps"), act("inbox")],
  };

  it("stands the product's crown down for a screen with a way out", () => {
    const out = crownFor(
      { back: () => {}, leave: "back", title: "Priya Raman", also: [act("edit")] },
      product,
    );
    expect(out.name).toBe("Priya Raman");
    expect(out.collapses).toBe(true);
    expect(out.back).toBeTruthy();
    /* ⚠️ The account does NOT lead a sub-page — the way out does, and a crown
       refuses both at once. */
    expect(out.who).toBeUndefined();
    expect(out.also?.map((a) => a.id)).toEqual(["edit"]);
  });

  it("keeps the product's crown for a destination, and takes its actions", () => {
    const out = crownFor({ title: "Clients", also: [act("filter")], does: undefined }, product);
    expect(out.name).toBe("Northwind Strength");
    expect(out.who).toBeTruthy();
    expect(out.back).toBeUndefined();
    /* ⚠️ THE SCREEN'S OWN ACTS COME FIRST. The inbox is always there and can
       afford to be the one that falls off a full row; a screen with two of its
       own would otherwise show neither. */
    expect(out.also?.map((a) => a.id)).toEqual(["filter", "apps"]);
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
      ⚠️ ONE DRIFT FOR EVERY GROUND, AND ONE SET OF NUMBERS. There was a table of
      per-ambience drift, which is one more thing to tune per world and one more
      place to forget an opt-out; a scene varies by seed instead.
    */
    expect(css).toContain("[data-sky]:not([data-sky=\"plain\"])::before {");
    expect(css).toContain("animation: one-drift");
    expect(css).toContain(
      "[data-reduce-motion=\"true\"] [data-sky]:not([data-sky=\"plain\"])::before { animation: none; }",
    );

    /* ⚠️ The overscan rule: translating a layer that exactly covers its box
       uncovers an edge, so every scale in the drift is past 1.1. */
    const scales = [...css.matchAll(/@keyframes one-drift \{[\s\S]*?\n\}/g)]
      .flatMap((m) => [...m[0].matchAll(/scale\(([\d.]+)\)/g)].map((x) => Number(x[1])));
    expect(scales.length).toBeGreaterThan(1);
    for (const at of scales) expect(at).toBeGreaterThanOrEqual(1.1);

    /*
      ⚠️ AND THE HOST CLIPS THAT OVERSCAN, WHICH NOTHING DID. A `scale(1.14)`
      layer hangs ~90px past each edge at desktop width, so the DOCUMENT grew:
      the page scrolled sideways into nothing, and further every second, because
      the scroll area tracked the animation. Eight of ten screens did it and no
      element was ever out of bounds — the overflow is a pseudo-element's, which
      is exactly why looking for a wide child finds nothing.

      ⚠️ `clip`, NEVER `hidden`. `hidden` makes this a scroll container and every
      `sticky` crown and nav inside it stops sticking — measured, both ways.
      Inline axis only, so the page still scrolls the way it is supposed to.
    */
    expect(css).toContain("[data-sky] { position: relative; isolation: isolate; overflow-x: clip;");
    expect(css).not.toContain("[data-sky] { position: relative; isolation: isolate; overflow: hidden");

    /* ⚠️ ONE drift keyframe, and it takes its numbers in — not one per
       ambience. Twenty-four grounds move; there is one rule for all of them. */
    expect(css).toContain("@keyframes one-drift {");
    expect([...css.matchAll(/@keyframes one-drift/g)]).toHaveLength(1);

    /*
      ⚠️ AND ONE KEYFRAME PER BEAT, WHICH IS A DIFFERENT RULE WITH THE SAME
      SHAPE. A beat's DIP is the beat's — a star may go most of the way out, a
      bloom a fifth of the way — so these cannot share one, and the count is
      bounded by the table rather than by how many scenes exist.

      ⚠️ THE BEATS LIVE HERE AT ALL BECAUSE A PICTURE CANNOT CARRY THEM. The
      field used to declare its own `<style>` inside an SVG served as
      `background-image`, and Chromium renders those STATICALLY — so every star
      in the product was frozen, with nothing failing. A live element and a rule
      in this stylesheet is what makes the motion real, and it is also what makes
      both opt-outs reach it.
    */
    const beats = Object.keys(BEAT);
    expect(beats.length).toBeGreaterThan(0);
    expect([...css.matchAll(/@keyframes one-(?!drift)/g)]).toHaveLength(beats.length);
    for (const beat of beats) {
      expect(css, `${beat} has no keyframe`).toContain(`@keyframes one-${beat} {`);
      expect(css, `${beat} is not offered to the system preference`)
        .toContain(`.q-${beat} { animation: one-${beat}`);
      expect(css, `${beat} cannot be switched off inside the app`)
        .toContain(`.q-${beat}`);
    }
    expect(css).toContain(`[data-reduce-motion="true"] ${beats.map((b) => `.q-${b}`).join(", ")}`);

    /* ⚠️ The field is an ELEMENT, and it wears the same matte the ground does —
       two halves of one world receding differently is a visible edge exactly
       where content sits. */
    expect(css).toContain("[data-field] {");
    expect(css).toMatch(/\[data-field\] \{[^}]*mask-image/);
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
      <Documents documents={docs} outstanding={[docs[0]!]} onAccept={() => {}} />,
    );
    expect(out).toContain("Terms");
    expect(out).toContain("Read and accept");
    expect(out).toContain("Accepted");
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
        items={[{ id: "kova", name: "Kova" }]}
        id={(a) => a.id} name={(a) => a.name}
        onChoose={() => {}} nothing={{ says: "None" }}
        then={(a) => <p>inside {a.name}</p>}
      />,
    );
    expect(one).toContain("inside Kova");

    const several = html(
      <Whichever
        items={[{ id: "kova", name: "Kova" }, { id: "hello", name: "Hello" }]}
        id={(a) => a.id} name={(a) => a.name}
        onChoose={() => {}} nothing={{ says: "None" }}
        then={(a) => <p>inside {a.name}</p>}
      />,
    );
    expect(several).not.toContain("inside");
    expect(several).toContain("Kova");
    expect(several).toContain("Hello");
  });
});
