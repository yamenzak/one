/**
 * A SCREEN DERIVED FROM A DECLARATION.
 *
 * ⚠️ WHAT THESE PROVE IS THAT THE FORM CANNOT DRIFT FROM THE MANIFEST, which is
 * the whole reason the renderer exists. A setting added to a manifest and not to
 * a hand-written form is a setting with a default nobody can change, on a screen
 * that looks complete; one removed and left on the form is a control that writes
 * a key no consumer reads. Neither fails, and both are one edit somebody forgot.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DeclaredSettings, groupsOf, shownAs, type Declaration } from "../src/hub/declared.js";
import { SettingsScreen } from "../src/hub/settings.js";
import { WorkspaceScreen, amountOf, type Resolved } from "../src/hub/workspace.js";
import { ConsoleScreen, KeysScreen, CatalogueScreen, saidAs } from "../src/hub/console.js";

const html = (node: React.ReactNode): string => renderToStaticMarkup(node as never);
const nothing = async () => null;

const DECLARED: Declaration = {
  "brand.name": { label: "What this workspace is called", kind: "text", fallback: "" },
  "brand.accent": { label: "Accent colour", kind: "colour", fallback: "" },
  "mail.signature": { label: "How your messages sign off", kind: "text", fallback: "", help: "Added to the end of emails." },
  "lapse.after": { label: "Days before access lapses", kind: "number", fallback: 14, min: 0, max: 365 },
  "lapse.then": { label: "And then", kind: "enum", fallback: "read_only", values: ["read_only", "blocked", "archive"] },
  "lapse.notify": { label: "Tell them first", kind: "bool", fallback: true },
};

describe("a settings screen written by nobody", () => {
  /*
    ⚠️ EVERY DECLARED KEY GETS A CONTROL, AND NOTHING ELSE DOES. This is the one
    assertion that makes adding a setting a single line in a manifest — and the
    one that fails the day somebody writes a form beside the declaration.
  */
  it("renders one control per declared setting and invents none", () => {
    const out = html(<DeclaredSettings declared={DECLARED} values={{}} onSet={nothing} />);
    for (const def of Object.values(DECLARED)) expect(out).toContain(def.label);
    /* ⚠️ And the help line comes from the declaration too, where there is one. */
    expect(out).toContain("Added to the end of emails.");
  });

  /*
    ⚠️ A SWITCH IS THE ONE INLINE CONTROL, because in a switch the choice IS the
    action. Everything else is a value somebody types or picks, and a card full of
    inline inputs is a form rather than a settings screen.
  */
  it("gives a bool a switch and everything else a row that opens something", () => {
    const out = html(<DeclaredSettings declared={DECLARED} values={{}} onSet={nothing} />);
    expect(out).toContain("switch-row");
    /* Five of the six are rows; the switch is the sixth. */
    expect([...out.matchAll(/class="item[ "]/g)].length).toBeGreaterThanOrEqual(5);
  });

  /*
    ⚠️ GROUPED BY THE PREFIX THE KEY ALREADY HAS, so a new group is a key name
    rather than a second registry to keep in step. A flat list of eleven controls
    is a settings screen nobody reads to the bottom of.
  */
  it("groups by the prefix of the key, and sorts the groups", () => {
    expect(groupsOf(DECLARED).map(([g]) => g)).toEqual(["brand", "lapse", "mail"]);
    expect(html(<DeclaredSettings declared={DECLARED} values={{}} onSet={nothing} />)).toContain("Brand");
  });

  /* ⚠️ `null` waits. A control showing a fallback it does not have is a lie. */
  it("waits rather than showing a default as though somebody chose it", () => {
    const out = html(<DeclaredSettings declared={DECLARED} values={null} onSet={nothing} />);
    expect(out).toContain("aria-busy");
    expect(out).not.toContain("Added to the end of emails.");
  });

  /*
    ⚠️ AN UNKNOWN KIND DRAWS NOTHING RATHER THAN A TEXT BOX. A future kind shown
    as text is a control the store refuses — what somebody sees is a field that
    will not save, with no explanation available anywhere.
  */
  it("draws nothing for a kind it does not know", () => {
    const out = html(<DeclaredSettings
      declared={{ "x.y": { label: "Something new", kind: "geo" as never, fallback: "" } }}
      values={{}} onSet={nothing}
    />);
    expect(out).not.toContain("Something new");
  });

  /*
    ⚠️ A SETTING MAY BE NARROWER THAN THE SCREEN IT IS ON — the ones that cost
    money or take something away from every customer of a workspace. The server
    refuses either way; this is what stops somebody being OFFERED the refusal.
  */
  it("stands a control down without hiding what it is set to", () => {
    const out = html(
      <DeclaredSettings
        declared={DECLARED} values={{ "lapse.after": 30 }} onSet={nothing}
        mayWrite={(key) => key !== "lapse.after"}
      />,
    );
    expect(out).toContain("Days before access lapses");
    expect(out).toContain("30");
  });

  /*
    ⚠️ UNSET AND SET-TO-THE-DEFAULT ARE DIFFERENT FACTS. A row printing a fallback
    as though somebody had typed it makes an untouched workspace look configured,
    which is the difference between "we have not decided" and "we decided this".
  */
  it("says nothing is set rather than printing the fallback", () => {
    expect(html(<>{shownAs(DECLARED["brand.name"]!, undefined)}</>)).toContain("Not set");
    expect(html(<>{shownAs(DECLARED["lapse.after"]!, 30)}</>)).toContain("30");
  });

  /* ⚠️ A product declaring none says so rather than drawing an empty card. */
  it("says a product declares nothing rather than showing an empty screen", () => {
    const out = html(
      <SettingsScreen workspace="Haddad Strength" declared={{}} values={{}} onSet={nothing} onBack={() => undefined} />,
    );
    expect(out).toContain("declares no settings");
  });
});

/* --------------------------------------------------------- one workspace --- */

const INCLUDED: readonly Resolved[] = [
  { key: "clients", label: "People you coach", value: 40, unlimited: false, source: "plan" },
  { key: "seats", label: "Colleagues", value: 5, unlimited: false, plan: 3, source: "grandfathered" },
  { key: "storage", label: "Storage", value: -1, unlimited: true, source: "adjusted" },
];

describe("one workspace", () => {
  const screen = (over: Partial<React.ComponentProps<typeof WorkspaceScreen>> = {}) => html(
    <WorkspaceScreen
      workspace={{
        tenantId: "t_1", name: "Haddad Strength", product: "kova", productName: "Kova",
        role: "Owner", at: "https://haddad.kova.4dl.app",
      }}
      included={INCLUDED}
      plan={{ name: "Pro", said: "$29 a month" }}
      declared={DECLARED}
      values={{}}
      onSet={nothing}
      onGo={() => undefined}
      onBack={() => undefined}
      {...over}
    />,
  );

  /*
    ⚠️ ONLY A MOVED ROW IS TAGGED. A badge on every line is texture; a badge on
    the ones that differ from the plan is the answer to "why does this workspace
    have more than the plan says" — which is the question support is asked.
  */
  it("says which ceilings were moved, and by what", () => {
    const out = screen();
    expect(out).toContain("Grandfathered");
    expect(out).toContain("Adjusted");
    /* ⚠️ And the ordinary rows carry no badge at all. */
    expect([...out.matchAll(/Grandfathered|Adjusted/g)]).toHaveLength(2);
  });

  /* ⚠️ `-1` never reaches a screen as a number. */
  it("says unlimited rather than minus one", () => {
    expect(amountOf(INCLUDED[2]!)).toBe("Unlimited");
    expect(screen()).not.toContain(">-1<");
  });

  /*
    ⚠️ THE LIST GOES SOMEWHERE NOW, which is the gap this screen fills: the one
    place somebody sees all their workspaces was the one place they could do
    nothing about any of them.
  */
  it("opens the workspace it is about, at its own address", () => {
    expect(screen()).toContain("https://haddad.kova.4dl.app");
  });

  it("waits for the ceilings rather than showing none", () => {
    expect(screen({ included: null })).toContain("aria-busy");
  });

  /* ⚠️ The settings are the product's declaration, rendered — not this screen's. */
  it("carries whatever the product declares", () => {
    expect(screen()).toContain("How your messages sign off");
  });

  /*
    ⚠️ A WORKSPACE THIS HUB CANNOT ANSWER FOR SAYS SO, and does not draw an empty
    card. Settings and ceilings are regional and per-product — they live where
    that workspace's records live — so the worker serving the hub can answer for
    its own product and no other. An empty "What it includes" is indistinguishable
    from a plan that includes nothing, which is a sentence about somebody's bill
    invented by a screen that could not reach the answer.
  */
  it("says where a workspace is managed rather than showing it as empty", () => {
    const out = screen({ managedHere: false });
    expect(out).toContain("Managed in Kova");
    expect(out).toContain("https://haddad.kova.4dl.app");
    expect(out).not.toContain("What it includes");
    expect(out).not.toContain("How your messages sign off");
  });
});

/* --------------------------------------------------------------- console --- */

describe("the operator console", () => {
  const PRODUCTS = [
    { appId: "kova", appName: "Kova", manifestVersion: "0.21.0", changed: 0 },
    { appId: "scena", appName: "Scena", manifestVersion: "0.4.0", changed: 2 },
  ];

  /*
    ⚠️ EVERY PRODUCT, WHICH IS WHAT MAKES IT ONE CONSOLE. There is one Stripe
    account behind all of them, so three consoles meant three places to paste one
    key — and the copy nobody re-pasted failed in a way nobody attributed to the
    rotation.
  */
  it("lists every product and the keys they share", () => {
    const out = html(<ConsoleScreen products={PRODUCTS} onGo={() => undefined} onBack={() => undefined} />);
    expect(out).toContain("Kova");
    expect(out).toContain("Scena");
    expect(out).toContain("Shared configuration");
  });

  /* ⚠️ ONLY AN EDITED CATALOGUE IS MARKED — a version number is texture. */
  it("says which products somebody has edited", () => {
    const out = html(<ConsoleScreen products={PRODUCTS} onGo={() => undefined} onBack={() => undefined} />);
    expect(out).toContain("2 edited");
    expect(out).not.toContain("0 edited");
  });

  /*
    ⚠️ AN EMPTY LIST IS A DEPLOYMENT WHOSE PRODUCTS HAVE NOT BOOTED, not one with
    none. A declaration is published on a worker's first request, so saying so is
    the difference between a screen somebody waits on and one they raise a ticket
    about.
  */
  it("tells nothing-yet from nothing-at-all", () => {
    expect(html(<ConsoleScreen products={null} onGo={() => undefined} onBack={() => undefined} />)).toContain("aria-busy");
    expect(html(<ConsoleScreen products={[]} onGo={() => undefined} onBack={() => undefined} />))
      .toContain("publishes what it declares");
  });

  /*
    ⚠️ A SECRET'S VALUE NEVER REACHES A SCREEN. A console that can display a
    payment provider's key leaks one through a screen share, a support session or
    any read vulnerability — what an operator actually needs is whether it is set.
  */
  it("says a secret is set and never what it is", () => {
    const out = html(
      <KeysScreen
        product={{ id: "kova", name: "Kova" }}
        keys={[{ key: "stripe.live.secret_key", value: true, secret: true, shared: true, source: "app" }]}
        onEdit={() => undefined} onBack={() => undefined}
      />,
    );
    expect(out).toContain("stripe.live.secret_key");
    expect(out).toContain("Set");
    /* ⚠️ Said once for the screen, not on every secret row — see `KeysScreen`. */
    expect([...out.matchAll(/never read back/g)]).toHaveLength(1);
  });

  /*
    ⚠️ WHERE A VALUE CAME FROM IS THE COLUMN A CONSOLE USUALLY OMITS. "It is set"
    and "it is set HERE" have different fixes: typing a local value over one that
    resolves from the shared store pins this product to a copy that will not
    follow the next rotation, and nothing else would say so.
  */
  it("says where each value came from", () => {
    expect(html(<>{saidAs({ key: "a", value: "x", secret: false, shared: true, source: "shared" })}</>)).toContain("Shared");
    expect(html(<>{saidAs({ key: "a", value: "", secret: false, shared: true, source: "unset" })}</>)).toContain("Not set");
  });

  /* ⚠️ A deployment with no shared store says so, once, at the top. */
  it("says when nothing is actually shared", () => {
    const out = html(
      <KeysScreen product={null} keys={[]} hasShared={false} onEdit={() => undefined} onBack={() => undefined} />,
    );
    expect(out).toContain("binds no shared configuration store");
  });

  /*
    ⚠️ AN EDITED PLAN IS MARKED, AND THAT IS WHY THE DECLARATION IS PUBLISHED AT
    ALL. Without the shipped catalogue beside the overrides every price looks like
    the one the product was built with, so an operator cannot tell their own
    change from the app's default.
  */
  it("tells an edited price from the one the product shipped", () => {
    const out = html(
      <CatalogueScreen
        product={{ id: "kova", name: "Kova" }}
        plans={[
          { id: "solo", name: "Starter", price: { minor: 499, currency: "usd" }, period: "month", trialDays: 14, includes: [] },
          { id: "pro", name: "Pro", price: { minor: 2900, currency: "usd" }, period: "month", trialDays: 0, includes: [], edited: true },
        ]}
        onEdit={() => undefined} onBack={() => undefined}
      />,
    );
    expect(out).toContain("$4.99");
    expect(out).toContain("14 days free");
    expect([...out.matchAll(/Edited/g)]).toHaveLength(1);
  });
});
