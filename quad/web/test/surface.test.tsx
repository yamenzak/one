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
import { field, flag, notification, setting, type Channel } from "@quad/kernel";
import { Settings, settingsShown } from "../src/settings.js";
import { NotificationPolicy, policyShown } from "../src/policy.js";
import { FlagConsole, Shelf, saying, money } from "../src/console.js";
import { Shell, reachable } from "../src/shell.js";
import { brandCss, brandCssFor, readable, skyCss, colorFor } from "../src/theme.js";
import { bespokeCss } from "../src/ambience.js";

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
  const crown = { appName: "Hello", appMark: "◇", tenantName: "Northwind" };

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

  /* ⚠️ A count of nothing is not a zero badge. Zero is texture. */
  it("shows no badge when there is nothing waiting", () => {
    const out = html(
      <Shell
        screens={SCREENS} here="/" held={new Set(["note:read"])} onGo={() => {}}
        crown={{ ...crown, unread: 0 }} onOpenInbox={() => {}}
      />,
    );
    expect(out).toContain("Inbox");
    const withSome = html(
      <Shell
        screens={SCREENS} here="/" held={new Set(["note:read"])} onGo={() => {}}
        crown={{ ...crown, unread: 3 }} onOpenInbox={() => {}}
      />,
    );
    expect(withSome).toContain(">3<");
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
    expect(css).toContain(`:root[data-theme="dark"]`);
    expect(css).toContain("#0b0b0b");
  });

  it("knows an unreadable pair from a readable one", () => {
    expect(readable("#111111", "#ffffff")).toBe(true);
    expect(readable("#eeeeee", "#ffffff")).toBe(false);
  });

  /* ⚠️ The sky names a shape and takes its colour from the tokens, so a brand
     change reaches the background of every screen with nothing else edited. */
  it("derives the ambience from tokens rather than from a colour", () => {
    expect(skyCss("plain")).toBe("");
    expect(skyCss("calm", "neutral")).toContain("var(--brand)");
    expect(skyCss("lift", "success")).toContain("var(--success)");
    expect(skyCss("calm")).not.toMatch(/#[0-9a-f]{6}/i);
  });

  /* ⚠️ A bespoke world is an IDENTITY: same seed, same world, forever — and it
     obeys every rule the named ambiences do (tokens in, no hex out). */
  it("composes a bespoke world deterministically from its seed", () => {
    expect(bespokeCss(7)).toBe(bespokeCss(7));
    expect(bespokeCss(7)).not.toBe(bespokeCss(8));
    expect(bespokeCss(7)).toContain("var(--brand)");
    expect(bespokeCss(7, "warning")).toContain("var(--warning)");
    expect(bespokeCss(7)).not.toMatch(/#[0-9a-f]{6}/i);
    /* The field is always the bottom layer — a bespoke world still owns the screen. */
    expect(bespokeCss(7)).toMatch(/var\(--lumen, transparent\)\) 52%, transparent 96%\)$/);
  });

  it("maps what happened onto the library's colour names in one place", () => {
    expect(colorFor("neutral")).toBe("default");
    expect(colorFor("info")).toBe("accent");
    expect(colorFor("danger")).toBe("danger");
  });
});
