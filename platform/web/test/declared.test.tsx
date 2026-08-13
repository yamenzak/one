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
import {
  ConsoleScreen, KeysScreen, CatalogueScreen, TenantsScreen, MaintenanceScreen, ModelsScreen, marginOf, saidAs,
} from "../src/hub/console.js";
import { AiScreen, refusalOf } from "../src/hub/ai.js";
import { PeopleScreen, roleIdFrom, seatsSaid, subjectOfKey, verbOfKey, type PeopleProps } from "../src/hub/people.js";
import { InboxScreen, NoticeChoices, categoryOf, iconFor, reachSaid } from "../src/hub/inbox.js";
import { NoticePolicyScreen, allowingSaid } from "../src/hub/notices.js";

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

/* ---------------------------------------------------- workspaces + closed --- */

describe("every workspace on the deployment", () => {
  const TENANTS = [
    { tenantId: "t1", appId: "kova", slug: "haddad", region: "eu", standing: "active", reason: "", plan: "Pro", status: "active", reachable: true },
    { tenantId: "t2", appId: "scena", slug: "haddad", region: "eu", standing: "active", reason: "", plan: "Free", status: "active", reachable: true },
    { tenantId: "t3", appId: "tessa", slug: "brightwater", region: "ap", standing: "active", reason: "", plan: null, status: null, reachable: false },
  ];

  const list = (tenants: typeof TENANTS | null) => html(
    <TenantsScreen tenants={tenants} onOpen={() => undefined} onSearch={() => undefined} onBack={() => undefined} />,
  );

  /*
    ⚠️ TWO WORKSPACES MAY SHARE A SLUG, because a slug is unique per PRODUCT — the
    whole point of the column that was added to the directory. A row that named
    only the slug would show what reads as a duplicate, and an operator acting on
    "the haddad one" would have a one-in-two chance of the right business.
  */
  it("says the product on every row, because two may share a name", () => {
    const out = list(TENANTS);
    expect([...out.matchAll(/haddad/g)].length).toBeGreaterThanOrEqual(2);
    expect(out).toContain("kova");
    expect(out).toContain("scena");
  });

  /*
    ⚠️ A REGION THAT WILL NOT ANSWER IS SAID, not left to read as "no plan". The
    plan is fetched from the workspace's own region, so a region that is down and
    a workspace on nothing produce the same blank — and they want opposite
    responses from whoever is looking.
  */
  it("tells a region that is down from a workspace on no plan", () => {
    const out = list(TENANTS);
    expect(out).toContain("ap unreachable");
    expect(out).toContain("no plan");
  });

  /* ⚠️ Nothing found is a search that matched nothing, never a deployment with
     no workspaces — the screen carries a search box above it. */
  it("tells still-loading from nothing-matched", () => {
    expect(list(null)).toContain("aria-busy");
    expect(list([])).toContain("No workspace matches");
  });
});

describe("the switch that closes every door", () => {
  const shown = (mode: "off" | "readonly" | "full") => html(
    <MaintenanceScreen mode={mode} message="Back within the hour." onSet={async () => null} onBack={() => undefined} />,
  );

  /*
    ⚠️ THE RUNG IS DESCRIBED BY WHAT IT DOES, not by its name. "readonly" is a
    word from a database column; whether people lose what they were in the middle
    of is the decision an operator is actually making.
  */
  it("says what each rung does rather than what it is called", () => {
    expect(shown("readonly")).toContain("nobody is signed out");
    /* ⚠️ Matched short of the apostrophe, which `renderToStaticMarkup` escapes. */
    expect(shown("full")).toContain("every session but an operator");
  });

  /*
    ⚠️ A MODE THIS BUNDLE DOES NOT KNOW IS SHOWN AS ITSELF. Falling back to the
    first rung would report a CLOSED deployment as open, on the one screen whose
    entire job is saying which it is.
  */
  it("never reports a mode it does not know as open", () => {
    const out = html(
      <MaintenanceScreen
        mode={"draining" as never} message="" onSet={async () => null} onBack={() => undefined}
      />,
    );
    expect(out).toContain("draining");
    expect(out).not.toContain("Everything works");
  });
});

/* ----------------------------------------------------------- the models --- */

describe("the deployment's model catalogue", () => {
  const MODELS = [
    { id: "llama", provider: "workers-ai", lanes: ["text"], enabled: true, markup: 1.4, thinking: false,
      cost: { input: 1, output: 2, perOutput: null }, price: { input: 1.4, output: 2.8, perOutput: null }, problems: [] },
    { id: "pro", provider: "gemini", lanes: ["text"], enabled: false, markup: 1.25, thinking: true,
      cost: { input: 4, output: 16, perOutput: null }, price: { input: 5, output: 20, perOutput: null }, problems: [] },
    { id: "free", provider: "gemini", lanes: ["image"], enabled: true, markup: 1, thinking: false,
      cost: { input: 1, output: 4, perOutput: 600 }, price: { input: 1, output: 4, perOutput: 600 },
      problems: ["has a markup of zero or less, which sells every call at or below cost"] },
  ];
  const LANES = ["text", "vision", "image", "speech", "transcribe", "video"];

  const shown = (models: typeof MODELS | null, over: { hasShared?: boolean; onSync?: () => Promise<null> } = {}) => html(
    <ModelsScreen models={models} lanes={LANES} onEdit={() => undefined}
      onEnabled={async () => null} onBack={() => undefined} {...over} />,
  );

  /*
    ⚠️ A LANE WITH NOTHING IN IT DRAWS NO HEADING. Every lane the platform can
    price is handed over, and rendering all six on a deployment with two models
    is four empty sections that read as something broken.
  */
  it("groups by lane and skips the ones nothing is in", () => {
    const out = shown(MODELS);
    expect(out).toContain("Words in, words out");
    expect(out).toContain("Words in, pictures out");
    expect(out).not.toContain("A recording in, words out");
  });

  /*
    ⚠️ THE MARGIN IS WHAT THIS SCREEN IS FOR. It is a percentage because that is
    how anybody thinks about it — `1.4` is not what somebody means when they say
    forty per cent — and it is on the row rather than one press away, because an
    operator scanning a catalogue is checking exactly this.
  */
  it("says the margin as a percentage rather than as a multiplier", () => {
    expect(marginOf(1.4)).toBe("40%");
    expect(marginOf(1)).toBe("0%");
    expect(shown(MODELS)).toContain("40% margin");
  });

  /*
    ⚠️ A ROW THAT CANNOT BE METERED IS SHOWN AND FLAGGED, never hidden. Hidden,
    an operator sees a model they added simply not appear — and the fault it is
    hiding is the one that makes every call to that model free.
  */
  it("shows a row that would be unmetered, and says why", () => {
    const out = shown(MODELS);
    expect(out).toContain("at or below cost");
    /* ⚠️ And it does not also claim a margin for it — nor for the one that is
       out of service. Counted rather than matched on "0% margin", which "40%
       margin" happens to contain. */
    expect([...out.matchAll(/% margin/g)]).toHaveLength(1);
  });

  /*
    ⚠️ AN EMPTY CATALOGUE IS THE STARTING STATE AND ALSO A DEPLOYMENT THAT CANNOT
    GENERATE. A blank that did not say the second is a screen that looks finished
    over a product whose every AI action refuses.
  */
  it("tells still-loading from a deployment that cannot generate at all", () => {
    expect(shown(null)).toContain("aria-busy");
    /* ⚠️ Matched short of the apostrophe, which `renderToStaticMarkup` escapes. */
    expect(shown([])).toContain("every product");
  });

  it("says when there is nowhere to keep a catalogue", () => {
    expect(shown([], { hasShared: false })).toContain("binds no shared configuration store");
  });

  /*
    ⚠️ A MODEL APPEARS UNDER EVERY LANE IT SERVES, because it does. A Gemini text
    model is priced for pictures on the same row, so showing it under one heading
    only would leave a catalogue whose vision section looks empty while a vision
    model is sitting in it.
  */
  it("shows a model under every lane it serves", () => {
    const both = [{ ...MODELS[0]!, lanes: ["text", "vision"] }];
    const out = shown(both);
    expect(out).toContain("Words in, words out");
    expect(out).toContain("A picture in, words out");
    expect([...out.matchAll(/llama/g)].length).toBeGreaterThanOrEqual(2);
  });

  /*
    ⚠️ A RETIREMENT IS SAID BEFORE IT HAPPENS. One an operator learns about from
    a failing generation is one they had a month of warning about, on a screen
    that never showed it — and the replacement is named, because the provider
    names it in the page itself.
  */
  it("says what is retiring and what it will be replaced by", () => {
    const going = [{ ...MODELS[0]!, retiresAt: "2026-06-01", replacedBy: "llama-next" }];
    expect(shown(going)).toContain("Retires 2026-06-01 → llama-next");
  });

  /*
    ⚠️ AND READING THE PRICE LISTS IS A BUTTON AS WELL AS A DAILY JOB, but only
    where the deployment can actually reach them. A control that fails when
    pressed is worse than one that is not offered.
  */
  it("offers a read of the price lists only where one is possible", () => {
    expect(shown(MODELS, { onSync: async () => null })).toContain("Read the price lists");
    expect(shown(MODELS)).not.toContain("Read the price lists");
  });
});

/* --------------------------------------------------- a workspace's own AI --- */

describe("what a workspace asks a model for", () => {
  const ACTIONS = [
    { action: "draft", summary: "Draft a plan", lane: "text",
      options: [{ id: "llama", provider: "workers-ai" }, { id: "pro", provider: "gemini" }],
      inEffect: "pro", decidedBy: "workspace" as const, why: null, stale: false, prompt: "Always in German." },
    { action: "chosen-for-you", summary: "Read a meal", lane: "text",
      options: [{ id: "llama", provider: "workers-ai" }],
      inEffect: "llama", decidedBy: "catalogue" as const, why: null, stale: false, prompt: "" },
    { action: "capable", summary: "Read a lab report", lane: "vision", prefer: "capable" as const,
      options: [{ id: "sees", provider: "gemini" }],
      inEffect: "sees", decidedBy: "catalogue" as const, why: null, stale: false, prompt: "" },
    { action: "gone", summary: "Read a picture", lane: "vision",
      options: [{ id: "sees", provider: "gemini" }],
      inEffect: "sees", decidedBy: "workspace" as const, why: null, stale: true, prompt: "" },
    { action: "nothing", summary: "Draw a picture", lane: "image",
      options: [], inEffect: null, decidedBy: null, why: "none_in_lane", stale: false, prompt: "" },
  ];

  const shown = (actions: typeof ACTIONS | null, mayWrite = true) => html(
    <AiScreen actions={actions} onChoose={async () => null} onPrompt={async () => null}
      mayWrite={mayWrite} onBack={() => undefined} />,
  );

  /*
    ⚠️ THE ACTIONS COME FROM THE MANIFEST, so this screen names none of them. An
    action added to a product appears here and one removed stops appearing, which
    is why there is no list anywhere to forget to update.
  */
  it("renders whatever the product declares, naming nothing itself", () => {
    const out = shown(ACTIONS);
    for (const a of ACTIONS) expect(out).toContain(a.summary);
  });

  /*
    ⚠️ WHO DECIDED IS THE COLUMN THIS SCREEN EXISTS FOR. A pick that is no longer
    offered shown as though it were running is the state an operator's switch
    creates silently, months later — and the only other symptom is an answer that
    quietly changed.
  */
  it("says when a pick is no longer offered, and when nobody picked", () => {
    const out = shown(ACTIONS);
    expect(out).toContain("no longer offered");
    expect(out).toContain("Chosen for you");
  });

  /*
    ⚠️ AND WHY NOTHING RUNS, IN WORDS SOMEBODY CAN ACT ON. An operator who has
    added no model and a region that permits none are different problems with
    different owners; one "unavailable" makes both the same shrug.
  */
  it("tells an empty lane from a region that permits nothing", () => {
    expect(refusalOf("none_in_lane")).toContain("deployment");
    expect(refusalOf("none_permitted")).toContain("region");
    expect(shown(ACTIONS)).toContain("Nothing on this deployment can do this yet");
  });

  /*
    ⚠️ THE SYSTEM PROMPT IS NOWHERE ON THIS SCREEN. A workspace that could rewrite
    it could turn the product into anything at all with the product's name still
    on the answer — so what it edits is what goes IN FRONT of a request.
  */
  it("offers the words in front of a request, and never the product's own", () => {
    const out = shown(ACTIONS);
    expect(out).toContain("What to mention first");
    expect(out).toContain("Always in German.");
    expect(out).not.toMatch(/system/i);
  });

  /*
    ⚠️ AN ACTION THAT ASKS FOR THE DEAR MODEL SAYS SO. It otherwise reads as a
    model somebody chose badly, when what happened is that the product said this
    one has to be good — which is the whole of what `prefer` is for.
  */
  it("says when the product asked for the best model rather than the cheapest", () => {
    expect(shown(ACTIONS)).toContain("Uses the best available");
  });

  it("tells still-loading from a product that generates nothing", () => {
    expect(shown(null)).toContain("aria-busy");
    expect(shown([])).toContain("asks no model anything");
  });

  /* ⚠️ Somebody who may not change it still SEES it — what a workspace has
     chosen is not a secret from the people it applies to. */
  it("shows everything to somebody who may change nothing", () => {
    const out = shown(ACTIONS, false);
    expect(out).toContain("Draft a plan");
    expect(out).toContain("pro");
  });
});

/* ------------------------------------------------ a workspace's own people --- */

/**
 * ⚠️ WHAT THESE PROVE IS THAT NOTHING ON THE ROSTER NAMES A ROLE OR A PERMISSION.
 * Both come from `role.list`, which reads the product's manifest merged with what
 * the workspace made for itself — so a role added to a product appears here and
 * one removed stops appearing, exactly as a declared setting does.
 */
describe("who is in a workspace, and what each of them may do", () => {
  const MEMBERS = [
    { id: "m1", email: "rana@studio.test", role: "owner", state: "accepted" as const },
    { id: "m2", email: "waiting@studio.test", role: "desk", state: "invited" as const },
  ];
  const ROLES = [
    { id: "owner", name: "owner", permissions: ["note:read", "member:manage"], source: "app" as const, editable: true, held: 1 },
    { id: "desk", name: "Front desk", permissions: ["note:read"], source: "workspace" as const, editable: true, held: 1 },
    { id: "books", name: "Bookkeeper", permissions: ["member:manage"], source: "workspace" as const, editable: false, held: 0 },
  ];
  const PERMISSIONS = ["note:read", "note:write", "member:manage"];

  const shown = (
    members: typeof MEMBERS | null, roles: typeof ROLES | null, mayManage = true,
  ) => html(
    <PeopleScreen
      workspace={{ name: "Haddad", tenantId: "t1" }}
      members={members} roles={roles} permissions={PERMISSIONS}
      seats={{ used: 2, allowed: 10 }}
      onInvite={async () => null} onRole={async () => null} onRemove={async () => null}
      onSaveRole={async () => null} onRemoveRole={async () => null}
      mayManage={mayManage} onBack={() => undefined}
    />,
  );

  it("names no role of its own, and draws the ones it was given", () => {
    const out = shown(MEMBERS, ROLES);
    for (const r of ROLES) expect(out).toContain(r.name);
  });

  /*
    ⚠️ "INVITED" AND "ACCEPTED" ARE TWO ROWS, and the pending half is the one a
    roster forgets — which is how somebody re-invites a colleague who is already
    waiting, and how a seat ceiling counts one state while the other grows.
  */
  it("draws somebody who has not accepted differently from somebody who has", () => {
    expect(shown(MEMBERS, ROLES)).toContain("Not accepted");
  });

  /*
    ⚠️ A ROLE THIS PERSON MAY NOT GRANT IS SHOWN AND STOOD DOWN, never hidden. A
    screen that dropped it leaves an administrator wondering why their list is
    shorter than the one their colleague is describing.
  */
  it("shows a role it cannot hand out rather than hiding it", () => {
    expect(shown(MEMBERS, ROLES)).toContain("Bookkeeper");
  });

  /* ⚠️ The product's own roles are fixed here: redefining `owner` is a workspace
     rewriting what the product means by owner. */
  it("marks the product's roles as its own and not the workspace's", () => {
    expect(shown(MEMBERS, ROLES)).toContain("This product");
  });

  it("tells still-loading from a workspace of one", () => {
    expect(shown(null, null)).toContain("aria-busy");
    expect(shown([], ROLES)).toContain("Nobody else yet");
  });

  /* ⚠️ Who else is in a workspace is not a secret from the people in it. */
  it("shows the whole roster to somebody who may change none of it", () => {
    const out = shown(MEMBERS, ROLES, false);
    expect(out).toContain("rana@studio.test");
    expect(out).not.toContain(">Invite<");
  });

  /*
    ⚠️ A ROLE ID IS DERIVED AND NEVER TYPED. It is a key in a merged registry, so
    a space or a dot in it resolves to nothing — a role somebody made, assigned,
    and that grants nothing at all.
  */
  it("makes a usable id out of whatever somebody calls a role", () => {
    expect(roleIdFrom("Front Desk")).toBe("front-desk");
    expect(roleIdFrom("  Book keeper!  ")).toBe("book-keeper");
    expect(roleIdFrom("!!!")).toBe("role");
  });

  /* ⚠️ A permission key is grouped and read from itself — never from a lookup
     table, which is a second vocabulary to keep in step with the manifest. */
  it("reads a permission's own words out of the key", () => {
    expect(subjectOfKey("note:write")).toBe("Note");
    expect(verbOfKey("note:write")).toBe("Write");
    expect(verbOfKey("standalone")).toBe("Standalone");
  });

  it("says how many seats are in use, and says nothing about a ceiling there is not", () => {
    expect(seatsSaid({ used: 2, allowed: 10 })).toBe("2 of 10 in use");
    expect(seatsSaid({ used: 2, allowed: true })).toBe("2 in use");
    expect(seatsSaid({ used: 2, allowed: -1 })).toBe("2 in use");
  });
});

/* --------------------------------------------------- what a product tells you --- */

/**
 * ⚠️ A MECHANISM WITH NO SURFACE IS THE FAILURE THIS PLATFORM WAS STARTED OVER,
 * and it had happened again: the algebra, the store, the dispatch and four
 * operations were written and there was nowhere a person could look.
 */
describe("the inbox and what interrupts you", () => {
  const NOTICES = [
    { id: "n1", type: "plan.chosen", title: "You chose Pro", icon: "card", category: "billing", at: "2026-08-13T09:00:00.000Z", read: false, open: {} },
    { id: "n2", type: "ghost.type", title: "Somebody did a thing", icon: "unheard-of", category: "activity", at: "2026-08-12T09:00:00.000Z", read: true, open: {} },
  ];

  const shown = (rows: typeof NOTICES | null, unread = 1) => html(
    <InboxScreen rows={rows} unread={unread} onRead={async () => null}
      onOpen={() => undefined} onGo={() => undefined} onBack={() => undefined} />,
  );

  it("draws what it was told, having rendered none of the words itself", () => {
    expect(shown(NOTICES)).toContain("You chose Pro");
  });

  /* ⚠️ Unread is a MARK on the row rather than a different row — a list where
     half the entries are styled differently is one the eye reads as two lists. */
  it("marks the unread ones without splitting the list", () => {
    const out = shown(NOTICES);
    expect(out).toContain("New");
    expect(out).toContain("1 unread");
  });

  /* ⚠️ "Mark all read" over an empty inbox is a control that reports success for
     doing nothing. */
  it("offers to clear it only where there is something to clear", () => {
    expect(shown(NOTICES, 1)).toContain("Mark all read");
    expect(shown(NOTICES, 0)).not.toContain("Mark all read");
  });

  it("tells still-loading from a product that has said nothing yet", () => {
    expect(shown(null)).toContain("aria-busy");
    expect(shown([])).toContain("Nothing yet");
  });

  /*
    ⚠️ AN ICON NAME THIS PACKAGE DOES NOT DRAW FALLS BACK TO THE BELL. An app
    names its own icons and this package draws a closed set, so the mapping has
    to be total — a blank where a glyph should be is a row that reads as broken.
  */
  it("draws something for an icon it has never heard of", () => {
    expect(iconFor("unheard-of")).toBe(iconFor("bell"));
    expect(iconFor("card")).not.toBe(iconFor("bell"));
    expect(shown(NOTICES)).toContain("data-icon=\"bell\"");
  });

  it("says a category in words rather than in its key", () => {
    expect(categoryOf("billing")).toBe("Money");
    expect(categoryOf("action")).toBe("Needs you");
    /* ⚠️ An unknown one prints itself rather than vanishing. */
    expect(categoryOf("weather")).toBe("weather");
  });
});

describe("what a person chooses to be interrupted by", () => {
  const REACHING = [
    { type: "plan.chosen", category: "billing", icon: "card", title: "You chose {planId}", reaching: ["inbox", "email"], allowed: ["inbox", "email"] },
    { type: "thing.happened", category: "activity", icon: "bell", title: "A thing happened", reaching: [], allowed: [] },
  ];
  const PREFS = { muted: ["activity"], email: true, push: false };

  const shown = (channels: string[], onPush?: () => Promise<null>) => html(
    <NoticeChoices prefs={PREFS} types={REACHING} channels={channels}
      onSet={async () => null} {...(onPush ? { onPush } : {})} onBack={() => undefined} />,
  );

  /*
    ⚠️ THE DEVICE SWITCH IS ABSENT WHERE THERE IS NOTHING TO SUBSCRIBE TO. A
    deployment with no push keys gets no row — never a row that does nothing,
    which is exactly what got this channel deleted from the platform once
    already: somebody turns it on and stops watching their inbox.
  */
  it("offers no device switch on a deployment that cannot push", () => {
    expect(shown(["inbox", "email", "push"], async () => null)).toContain("This device");
    expect(shown(["inbox", "email"], async () => null)).not.toContain("This device");
    expect(shown(["inbox", "email", "push"])).not.toContain("This device");
  });

  /*
    ⚠️ CATEGORIES, NOT TYPES, and `action` is not among them. A per-type screen
    is a list nobody maintains; and a switch for the category meaning "nothing
    proceeds until you act" is a way to make the product silently stop working
    for whoever pressed it.
  */
  it("asks about categories, and never about the one that blocks the product", () => {
    const out = shown(["inbox", "email"]);
    expect(out).toContain("Money");
    expect(out).toContain("Activity");
    expect(out).not.toContain("Needs you</");
  });

  /* ⚠️ "You turned this off" and "your workspace did" are different sentences,
     and the row has to say which. */
  it("says when it was the workspace that turned something off", () => {
    expect(reachSaid(REACHING[1]!)).toContain("workspace");
    expect(reachSaid(REACHING[0]!)).toBe("Here and by email");
    expect(reachSaid({ ...REACHING[0]!, reaching: ["inbox"] })).toBe("Here only");
  });
});

describe("what a workspace lets its product say", () => {
  const POLICIES = [
    { type: "plan.chosen", category: "billing", icon: "card", title: "You chose {planId}", roles: ["owner"], needs: "billing:manage", required: false, off: false, channels: null },
    { type: "thing.happened", category: "activity", icon: "bell", title: "A thing happened", roles: ["owner"], needs: "note:read", required: false, off: true, channels: null },
    { type: "document.owed", category: "action", icon: "shield", title: "Something is waiting", roles: ["owner"], needs: "guide:read", required: true, off: false, channels: null },
  ];

  const shown = (mayWrite = true) => html(
    <NoticePolicyScreen rows={POLICIES} channels={["inbox", "email", "push"]}
      onSet={async () => null} onClear={async () => null} mayWrite={mayWrite} onBack={() => undefined} />,
  );

  /* ⚠️ Nothing here names a notification: the list IS the product's registry, so
     a type it adds appears and one it removes stops appearing. */
  it("renders whatever the product declares, naming nothing itself", () => {
    const out = shown();
    for (const row of POLICIES) expect(out).toContain(row.title);
  });

  /* ⚠️ Only a row somebody MOVED is tagged. A badge on every line is texture. */
  it("tags what this workspace changed and leaves the rest alone", () => {
    const out = shown();
    expect((out.match(/>Off</g) ?? []).length).toBe(1);
  });

  it("says where a row currently reaches, for somebody who may not change it", () => {
    expect(shown(false)).toContain("Notifications and Email and Devices");
    expect(allowingSaid(POLICIES[1]!, ["inbox", "email"])).toBe("Off");
    expect(allowingSaid({ ...POLICIES[0]!, channels: ["inbox"] }, ["inbox", "email"])).toBe("Notifications only");
  });

  it("shows the whole list to somebody who may change none of it", () => {
    const out = shown(false);
    expect(out).toContain("You chose {planId}");
    expect(out).toContain("Ask an administrator");
  });
});
