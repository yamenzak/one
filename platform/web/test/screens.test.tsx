/**
 * THE ACCOUNT CENTRE'S SCREENS, RENDERED.
 *
 * ⚠️ THIS FILE EXISTS BECAUSE A GUARD SAID SO, AND THE GUARD WAS RIGHT. Four
 * screens, a sheet, a switch, a chip and an editor were exported and nothing
 * anywhere rendered any of them — every one had been looked at in a browser and
 * none had been held to anything. A screen reviewed by eye and asserted by
 * nothing is a screen whose next edit is unreviewed.
 *
 * ⚠️ SO THE ASSERTIONS ARE ABOUT WHAT THE SCREEN SAYS, NOT THAT IT RENDERS.
 * "It did not throw" is what a snapshot test proves, and a snapshot goes green
 * again the moment somebody accepts it. Each of these names a claim a person
 * would notice being broken.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LegalDoc, Problem, Receiving } from "@one/kernel";

import { AccountCenter, type AccountCenterProps } from "../src/account/center.js";
import { AccountHome, type AccountHomeProps } from "../src/account/home.js";
import { AboutBody, KeptHere, meaning, readAs, VaultScreen, type Item, type Kept, type Looked, type Where } from "../src/account/vault.js";
import { AskForIt, ConsentBody, ConsentSheet, offered, type Asked } from "../src/consent.js";
import { AccountDetails } from "../src/account/details.js";
import { PreferencesScreen, type Preferences, type SetPreference } from "../src/account/preferences.js";
import { SignInMethods, type Passkey } from "../src/account/signin.js";
import { Unset } from "../src/list.js";
import { Chip } from "../src/capsule.js";
import { Mark, DRAWN_LOGOS } from "../src/mark.js";
import { UI_CSS } from "../src/ui.css.js";
import { DEPLOYMENT } from "@one/deployment";
import { SwitchRow } from "../src/switch.js";
import * as Dialog from "@radix-ui/react-dialog";
import { ValueEditor, ValueEditorBody } from "../src/editor.js";
import { counted, DocScreen, held, LegalScreen, MustAcceptScreen, paragraphs, ProductScreen, receives, ReceivingScreen, RecipientScreen, said, spoken, state } from "../src/account/legal.js";
import { ExportScreen } from "../src/account/export.js";
import { CloseAccountScreen } from "../src/account/close.js";
import type { Doc, Product } from "../src/account/wire.js";
import { configureFeedback, feedbackSettings, FEEDBACK_DEFAULT } from "../src/feedback.js";
import { Device } from "../src/icon.js";

const nothing = async (): Promise<Problem | null> => null;
const html = (node: React.ReactNode): string => renderToStaticMarkup(node as never);

/* ------------------------------------------------------------- preferences --- */

const PREFS: Preferences = { theme: "dark", units: "metric", language: "en", sound: false, haptics: true };
const set: SetPreference = async () => null;

describe("preferences", () => {
  /*
    ⚠️ THE HUB IS A SUMMARY OR IT IS A MENU, and a menu between somebody and five
    settings is a tax. Every row carries what is currently set, so the whole
    configuration reads without opening anything.
  */
  it("puts what is set on every hub row", () => {
    const out = html(<PreferencesScreen prefs={PREFS} onSet={set} onBack={() => undefined} />);
    expect(out).toContain("Dark");
    expect(out).toContain("English");
    expect(out).toContain("Metric");
  });

  it("names each language in itself, because the reader may not read the other one", () => {
    const out = html(<PreferencesScreen prefs={{ ...PREFS, language: "de" }} onSet={set} onBack={() => undefined} />);
    expect(out).toContain("Deutsch");
    expect(out).not.toContain("German");
  });

  it("says what is on rather than how many things are", () => {
    const none = html(<PreferencesScreen prefs={{ ...PREFS, sound: false, haptics: false }} onSet={set} onBack={() => undefined} />);
    expect(none).toContain("Off");
    const sound = html(<PreferencesScreen prefs={{ ...PREFS, sound: true }} onSet={set} onBack={() => undefined} />);
    expect(sound).toContain("Sound");
  });

  /*
    ⚠️ A CONTROL TELLS THE TRUTH ABOUT THE DEVICE IT IS ON. Safari implements no
    `navigator.vibrate` on any iOS version — and neither does this renderer — so
    a summary claiming vibration is on would be claiming something the person
    cannot feel. The stored setting is unchanged; what is reported is not.
  */
  it("does not claim vibration where nothing can vibrate", () => {
    const out = html(<PreferencesScreen prefs={{ ...PREFS, haptics: true, sound: false }} onSet={set} onBack={() => undefined} />);
    expect(out).toContain("Off");
    expect(out).not.toContain("Vibration and sound");
  });
});

/* ----------------------------------------------------------------- switch --- */

describe("a switch row", () => {
  /*
    ⚠️ A CONTROL THAT IS OFF SAYS WHY. A switch standing down with no explanation
    is indistinguishable from one that is broken, and the person has no way to
    tell which.
  */
  it("stands the whole row down and keeps its reason", () => {
    const out = html(
      <SwitchRow title="Vibration" detail="This browser cannot vibrate." on={false} disabled onChange={nothing} />,
    );
    expect(out).toContain("data-off");
    expect(out).toContain("This browser cannot vibrate.");
  });

  it("is a label, so the whole row is the target rather than the switch alone", () => {
    expect(html(<SwitchRow title="Sound" on onChange={nothing} />)).toMatch(/^<label/);
  });
});

/* ----------------------------------------------------------- provisioning --- */

describe("starting something new", () => {
  const OPENABLE = [
    { id: "kova", name: "Kova", does: "Coaching, for a studio.", setupAt: "https://setup.kova.4dl.app" },
    { id: "scena", name: "Scena", does: "Screens, everywhere at once.", setupAt: "https://setup.scena.4dl.app" },
  ];
  const home = (over: Partial<AccountHomeProps> = {}) => html(
    <AccountHome
      person={{ name: "Nadia", email: "n@example.test" }}
      workspaces={[]}
      onGo={() => undefined} onOpenWorkspace={() => undefined} onClose={() => undefined}
      {...over}
    />,
  );

  /*
    ⚠️ MOST PEOPLE WITH AN ACCOUNT HERE ARE SOMEBODY'S CLIENT. A "New workspace"
    button on their account centre offers them a thing they cannot do and would
    not want — and the refusal they would meet says so long after they have
    decided the product is confusing.
  */
  it("offers nothing to somebody who may open nothing", () => {
    expect(home()).not.toContain("New workspace");
  });

  it("offers it to somebody who may, with no workspaces at all", () => {
    const out = home({ openable: OPENABLE, onOpenProduct: () => undefined });
    expect(out).toContain("New workspace");
    /* ⚠️ AND SAYS THE NEXT SCREEN IS A QUESTION, because there is more than one
       product. With a single one it goes straight there — a picker with one
       option is a question with one answer. */
    expect(out).toContain("Choose which product");
  });

  it("says nothing about choosing when there is one product", () => {
    const out = home({ openable: [OPENABLE[0]!], onOpenProduct: () => undefined });
    expect(out).toContain("New workspace");
    expect(out).not.toContain("Choose which product");
  });

  /*
    ⚠️ AND THE CONTROL IS NOT WHAT MAKES IT SAFE. `identity.workspace.create`
    refuses an address with no grant on a product that is sold; this row is what
    stops somebody being offered it, which is a different job. A screen that was
    the only control would be a decoration in front of a route in the API
    document — see `hello/test/provisioning.test.ts` for the half that refuses.
  */
  it("draws nothing when nobody can be handed over to", () => {
    expect(home({ openable: OPENABLE })).not.toContain("New workspace");
  });
});

/* ------------------------------------------------------------------ marks --- */

describe("the one mark", () => {
  /*
    ⚠️ THERE WERE FIVE OF THESE AND THEY AGREED ABOUT NOTHING — a person's face at
    two sizes, a workspace at an 11-pixel radius, a company at 14, an icon in a
    999-pixel well and two badges hanging off their corners at −1 and −3. Each was
    defensible alone; together they were four radii and three badge positions in
    one column, which is what an interface with inconsistent avatars IS.
  */
  it("draws a person round and everything with an identity square", () => {
    expect(html(<Mark kind="person" name="Nadia" />)).toContain(`data-kind="person"`);
    for (const kind of ["workspace", "product", "company", "place"] as const) {
      expect(html(<Mark kind={kind} name="X" />), kind).toContain(`data-kind="${kind}"`);
    }
    /* ⚠️ ONE RULE IN THE SHEET, keyed off the kind — so a new kind picks a side
       rather than picking a radius. */
    expect(UI_CSS).toMatch(/\.mark\[data-kind='person'\][^{]*\{[^}]*radius-well/);
  });

  /* ⚠️ THE SIZE IS ONE NUMBER ON THE ELEMENT and the radius, the letter, the badge
     and its ring are all computed from it. Written as pixels the radius drifted
     the moment a second size existed. */
  it("carries its size as one value, and derives the rest from it", () => {
    expect(html(<Mark kind="workspace" name="X" size="sm" />)).toContain("--mark:26px");
    expect(html(<Mark kind="workspace" name="X" />)).toContain("--mark:44px");
    expect(html(<Mark kind="person" name="X" size="lg" />)).toContain("--mark:64px");
    expect(UI_CSS).toMatch(/border-radius: calc\(var\(--mark\)/);
  });

  /* ⚠️ AN UNKNOWN LOGO IS THE INITIAL, never a drawn office block: beside three
     real marks that reads as a company nobody could identify. */
  it("falls back to the initial for a logo it does not have", () => {
    const out = html(<Mark kind="company" logo="nobody-draws-this" name="Acme" />);
    expect(out).toContain(">A<");
    expect(out).not.toContain("<svg");
  });

  it("draws every logo the deployment declares", () => {
    for (const sub of DEPLOYMENT.subprocessors) {
      if (!sub.mark) continue;
      expect(DRAWN_LOGOS, `${sub.id} names a logo nothing draws`).toContain(sub.mark);
    }
  });

  /* ⚠️ THE BADGE IS THE MARK'S OWN. Written as a second positioned element beside
     the picture it sat at the bounding box's corner — which is ON a rounded square
     and in EMPTY SPACE beside a circle, and is why a camera on somebody's
     photograph looked stuck to the outside of it. */
  it("puts the badge on the mark, hidden from a reader", () => {
    const out = html(<Mark kind="workspace" name="X" badge={<Device />} />);
    expect(out).toContain("mark-badge");
    expect(out).toContain('aria-hidden="true"');
    /* ⚠️ OUTWARD BY THE TILE'S OWN OVERHANG, which is declared once and used
       twice — here, and to inset a badged mark sitting at the edge of a column. */
    expect(UI_CSS).toMatch(/--mark-out: calc\(var\(--mark\) \* 0\.09\)/);
    expect(UI_CSS).toMatch(/\.mark-badge[^{]*\{[^}]*calc\(var\(--mark-out\) \* -1\)/);
  });
});

/* ------------------------------------------------------------------ chip --- */

describe("a chip", () => {
  /* ⚠️ Not a control and it must not look like one — what it is doing is
     carrying a face into a line of text. */
  it("carries a name and is not a button", () => {
    const out = html(<Chip>Corniche Screens</Chip>);
    expect(out).toContain("Corniche Screens");
    expect(out).not.toContain("<button");
  });

  /*
    ⚠️ THE CAPSULES ARE TWO AND THE THIRD IS GONE. A chip, a pill and a tag were
    all a rounded rectangle with a grey ground and small text, so one row carried
    all three and none told a reader anything the others did not. A chip answers
    WHICH; a pill answers WHAT STATE and takes its colour from the tone scale.
  */
  it("gives a pill no colour outside the tone scale", () => {
    const tones = [...UI_CSS.matchAll(/\.pill\[data-tone='([a-z]+)'\]/g)].map((m) => m[1]!);
    expect(new Set(tones)).toEqual(new Set(["warn", "alarm", "ok"]));
    /* ⚠️ AND EVERY GROUND IT TAKES IS A TOKEN. A hue written here directly is how
       a column of capsules comes to look arbitrary, which to a reader is
       indistinguishable from meaning nothing. */
    const rules = UI_CSS.slice(UI_CSS.indexOf(".pill {"), UI_CSS.indexOf(".pill {") + 600);
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

describe("an unset value", () => {
  it("is quiet rather than an error", () => {
    expect(html(<Unset>Not set</Unset>)).toContain("entry-unset");
  });
});

/* ---------------------------------------------------------------- details --- */

describe("your details", () => {
  const render = (person: { name?: string; email: string }) => html(
    <AccountDetails
      person={person} emailVerified
      onSave={nothing} onPickPhoto={() => undefined} onBack={() => undefined}
    />,
  );

  it("sets an address as an address, because it has nowhere to break", () => {
    const out = render({ email: "b.okonkwo@example.com" });
    expect(out).toContain("b.okonkwo@example.com");
  });

  it("shows a mark rather than the word, once an address is verified", () => {
    expect(render({ name: "B", email: "b@example.com" })).toContain("verified");
  });

  /* ⚠️ A value somebody has not given is quiet, and it is not an error. */
  it("says a missing name is unset rather than blank", () => {
    expect(render({ email: "b@example.com" })).toContain("entry-unset");
  });
});

/* ----------------------------------------------------------------- sign-in --- */

const KEYS: readonly Passkey[] = [
  { id: "k1", label: "MacBook Pro", added: "4 March", lastUsed: "2 days ago", current: true },
];

describe("sign-in methods", () => {
  /*
    ⚠️ AN EMPTY LIST OF SOMETHING PEOPLE HAVE NEVER DELIBERATELY MADE EXPLAINS
    ITSELF. "No passkeys" says nothing to somebody who does not know what one
    is, and that screen is exactly where they will be.
  */
  it("explains what a passkey is to somebody who has none", () => {
    const out = html(
      <SignInMethods
        passkeys={[]} devices={[]} email="b@example.com"
        onAddPasskey={() => undefined} onRemovePasskey={nothing} onSignOut={nothing}
        onSignOutHere={nothing} onSignOutEverywhere={nothing} onBack={() => undefined}
      />,
    );
    expect(out.toLowerCase()).toContain("passkey");
    expect(out).not.toContain("No passkeys</");
  });

  /* ⚠️ `null` IS NOT ANSWERED YET AND `[]` IS ANSWERED AND EMPTY. */
  it("waits rather than claiming emptiness while the answer is still coming", () => {
    const out = html(
      <SignInMethods
        passkeys={null} devices={null} email="b@example.com"
        onAddPasskey={() => undefined} onRemovePasskey={nothing} onSignOut={nothing}
        onSignOutHere={nothing} onSignOutEverywhere={nothing} onBack={() => undefined}
      />,
    );
    expect(out).toContain("waiting");
  });

  /*
    ⚠️ THERE WAS NO WAY TO SIGN OUT ANYWHERE IN THE PRODUCT. The row for the
    device in your hand carried no control, and the comment beside it said leaving
    was "the avatar menu's job" — a menu this account centre does not have. On a
    shared computer that is not a missing affordance, it is a person who cannot
    leave.

    ⚠️ AND THE ROW SOMEBODY LOOKS FOR AFTER LOSING A PHONE IS IN THE SAME LIST.
    Quiet rather than red, because it is a DEFENSIVE action: a list of ordinary
    facts with a red control in it teaches people to ignore red.
  */
  it("can be left, on this device and on every device", () => {
    const out = html(
      <SignInMethods
        passkeys={[]} email="b@example.com"
        devices={[{ id: "d1", app: "Kova", since: "4 March", current: true }]}
        onAddPasskey={() => undefined} onRemovePasskey={nothing} onSignOut={nothing}
        onSignOutHere={nothing} onSignOutEverywhere={nothing} onBack={() => undefined}
      />,
    );
    expect(out).toContain("Sign out everywhere");
    /* ⚠️ The device in your hand has a control of its own — the list is not a
       list of other people's devices. */
    expect([...out.matchAll(/Sign out/g)].length).toBeGreaterThan(1);
  });

  it("marks the device in your hand, so the list is readable", () => {
    const out = html(
      <SignInMethods
        passkeys={KEYS} devices={[]} email="b@example.com"
        onAddPasskey={() => undefined} onRemovePasskey={nothing} onSignOut={nothing}
        onSignOutHere={nothing} onSignOutEverywhere={nothing} onBack={() => undefined}
      />,
    );
    expect(out).toContain("MacBook Pro");
  });
});

/* ----------------------------------------------------------------- editor --- */

describe("the value editor", () => {
  /* ⚠️ `field` IS THE OPEN STATE, so there is no second flag to disagree with
     it — a sheet with `open` AND a value is one that can be open with nothing
     to edit. */
  it("renders nothing at all with no field to edit", () => {
    expect(html(<ValueEditor field={null} onSave={async () => null} onClose={() => undefined} />)).toBe("");
  });
});

/* --------------------------------------------------------------- feedback --- */

describe("feedback", () => {
  /*
    ⚠️ SOUND IS OFF UNTIL SOMEBODY ASKS FOR IT. An interface that makes a noise
    nobody chose is the most complained-about behaviour there is, and the person
    who finds out in a meeting does not go looking for the setting.
  */
  it("ships haptics on and sound off", () => {
    expect(FEEDBACK_DEFAULT).toEqual({ haptics: true, sound: false });
  });

  it("is configured once by the app rather than threaded through four components", () => {
    configureFeedback({ haptics: false, sound: true });
    expect(feedbackSettings()).toEqual({ haptics: false, sound: true });
    configureFeedback(FEEDBACK_DEFAULT);
    expect(feedbackSettings()).toEqual(FEEDBACK_DEFAULT);
  });
});

/* --------------------------------------------------------- the presentation --- */

describe("the account centre's presentation", () => {
  /*
    ⚠️ IT IS A ROUTE, NOT A POPUP, and `open` is therefore the router's state
    rather than the component's. Closed means the surface is absent — not hidden
    behind an opacity, which would leave a focus trap and a scroll lock on a page
    nobody is looking at.
  */
  it("renders nothing at all while it is closed", () => {
    const props: AccountCenterProps = {
      open: false,
      onClose: () => undefined,
      children: () => "anything",
    };
    expect(html(<AccountCenter {...props} />)).toBe("");
  });
});

/* ------------------------------------------------------------- the vault --- */

const RUNGS_COMPUTE = ["self", "compute"] as const;
const RUNGS_RAW = ["self", "compute", "agent", "staff"] as const;

const ITEM = (over: Partial<Item>): Item => ({
  fact: "body.height", label: "Height", need: "compute", asks: "compute", rungs: RUNGS_COMPUTE,
  why: "Used to work out an energy target.",
  required: false, reach: "self", granted: false, expiresAt: null,
  held: true, categories: [], readings: [], ...over,
});

const WHERES: readonly Where[] = [{
  appId: "kova", appName: "Kova", tenantId: "t1", name: "Haddad Strength",
  items: [
    ITEM({ fact: "body.height", label: "Height", reach: "compute", granted: true }),
    ITEM({ fact: "goal.training", label: "Your goal", need: "raw", asks: "staff" }),
  ],
}];

const KEPT: readonly Kept[] = [{ fact: "body.girths", label: "Measurements" }];

const LOOKS: readonly Looked[] = [
  { fact: "body.mass", label: "Weight", where: "Haddad Strength", who: "Shujaa", on: "9 August", times: 4 },
  { fact: "body.mass", label: "Weight", where: "Haddad Strength", on: "8 August", times: 1 },
];

describe("your vault", () => {
  const render = (
    wheres: readonly Where[] | null,
    looks: readonly Looked[] | null,
    kept: readonly Kept[] | null = KEPT,
  ) => html(<VaultScreen wheres={wheres} kept={kept} looks={looks} onSet={nothing} onBack={() => undefined} />);

  /* ⚠️ `null` IS NOT ANSWERED YET AND `[]` IS ANSWERED AND EMPTY. */
  it("waits rather than claiming nothing is asking", () => {
    const out = render(null, null, null);
    expect(out).toContain("waiting");
    expect(out).not.toContain("Nothing is asking for anything");
  });

  it("says nothing is asking only once it knows", () => {
    expect(render([], [], [])).toContain("Nothing is asking for anything");
  });

  /*
    ⚠️ THE SCREEN IS A RENDERER, AND THIS IS THE CHECK THAT SAYS SO. Every
    sentence explaining a want comes out of the declaration — so a want whose
    `why` the app wrote appears verbatim, and the day this stops being true is the
    day somebody has started writing product copy into the account centre.
  */
  it("shows the app's own reason rather than one of its own", () => {
    const out = html(<AboutBody item={ITEM({
      why: "A sentence no screen could have invented.",
      because: "And a recommendation it did not write either.",
      recommend: "self",
    })} />);
    expect(out).toContain("A sentence no screen could have invented.");
    expect(out).toContain("And a recommendation it did not write either.");
  });

  /*
    ⚠️ A DERIVATION STATES WHAT IT CANNOT REVEAL, and the sheet reads that sentence
    out. The registry refuses an empty one, so this is never a reassurance somebody
    typed to make a screen feel safe — dropping it here would quietly turn it into
    one.
  */
  it("reads out what a derivation cannot reveal", () => {
    const out = html(<AboutBody item={ITEM({
      need: "derived",
      readings: [{
        id: "body.mass.trend", label: "Weight trend", from: ["body.mass"],
        says: "Which way it is going.",
        hides: "Every absolute weight.",
        asks: "staff", rungs: RUNGS_RAW, reach: "self", granted: false, expiresAt: null,
      }],
    })} />);
    expect(out).toContain("Which way it is going.");
    expect(out).toContain("Every absolute weight.");
  });

  /*
    ⚠️ THE STATE LINE NAMES NO ROLE, AND REPEATS NO PLACE. "Your coach" is one
    product's word for the person on the other side, and this screen stands over a
    studio, a clinic and a company's staff list alike — so it says "here", which
    the group above it has already named. Naming the workspace per row put its
    face and name five times down one card under a header carrying both.
  */
  it("says what is true here, in one clause, naming no role", () => {
    const out = render(WHERES, []);
    expect(out).toContain("Nobody here sees it.");
    expect(out, "a role is one product's word for the other side")
      .not.toMatch(/coach|trainer|client|doctor/i);
  });

  /*
    ⚠️ THE SHEET IS DECLARATIONS AND NOTHING ELSE. Three blocks of prose written
    in the component used to sit between them — what "on" would reach, what
    happens if it is off, and a closing reassurance — each restating what the row
    already said, in more words, on the one surface that has to be read to be
    worth opening. A screen that explains a fact in its own words is a screen that
    has to be edited for every fact.
  */
  it("explains a fact only in the words something declared", () => {
    const out = html(<AboutBody item={ITEM({
      why: "A reason the app wrote.", because: "A reason the registry wrote.", recommend: "self",
      required: true,
    })} />);
    expect(out).toContain("A reason the app wrote.");
    expect(out).toContain("A reason the registry wrote.");
    expect(out, "the sheet restates what the row already said").not.toMatch(/Switched on|If it is off|switch this off/);
  });

  /*
    ⚠️ THE CONTROL NEVER SPENDS A RUNG THE PERSON DID NOT. A want needing the value
    itself can be held at "the assistant, no people" — a rung chosen deliberately
    in the consent sheet. Rendered as a switch, that reads as ON and turning it off
    and on again silently re-grants at the top of the ladder, which is the worst
    thing a screen about disclosure can do and it typechecks. Four rungs means a
    named choice; two means a switch.
  */
  it("offers a choice wherever a want has more than two rungs", () => {
    const raw = render([{ ...WHERES[0]!, items: [ITEM({
      need: "raw", asks: "staff", rungs: RUNGS_RAW, reach: "agent", granted: true,
    })] }], []);
    expect(raw, "a four-rung want is a switch, so agent is spent as staff").toContain("share-rung");
    expect(raw).toContain("The assistant");

    const compute = render([{ ...WHERES[0]!, items: [ITEM({})] }], []);
    expect(compute, "a two-rung want asks a question with one answer").not.toContain("share-rung");
  });

  /*
    ⚠️ THE SENTENCE AND THE CONTROL ARE ONE STATEMENT. The switch is optimistic —
    it has to be, a control that waits for a round trip feels broken — and the line
    under it read the prop, which only changes when a refetch lands. So flipping
    something on left the switch reading ON above the words "Not shared." for as
    long as the network took. Two contradictory statements about one disclosure is
    worse than either alone, and neither of them throws.
  */
  it("reads the rung it is showing, not the one it was given", () => {
    /* ⚠️ THE TWO DISAGREE ON PURPOSE, which is the only way this can be checked
       without a browser: mid-flight the row is showing a rung the prop has not
       caught up to, and the sentence has to be the one on screen. Rendering both
       in agreement — the obvious test — passes either way. */
    const stale = ITEM({ reach: "self", granted: false });
    expect(meaning(stale, "compute")).toBe("Calculations only. Nobody here sees it.");
    expect(meaning(ITEM({ reach: "staff", granted: true }), "self")).toBe("Not shared.");
  });

  /* ⚠️ THE WHOLE ROW IS READABLE CLOSED, which is what earns a disclosure. */
  it("counts what is on against what was asked, without opening anything", () => {
    expect(render(WHERES, [])).toContain("1 of 2");
  });

  /*
    ⚠️ THE VALUES ARE NOT ON THIS SCREEN. It answers who can see what — showing
    the numbers here would put somebody's whole body on one scrollable page.
  */
  it("never shows a value, only whether something is recorded", () => {
    const out = render(WHERES, LOOKS);
    expect(out).toContain("Recorded");
    expect(out).not.toMatch(/\d+ ?kg|\d+ ?cm/);
  });

  /*
    ⚠️ WHAT NOBODY ASKED FOR IS STILL YOURS. A vault that listed only what an app
    wanted would go empty at exactly the moment it became the only copy — which is
    the person this whole thing is built for.
  */
  it("keeps what nothing is asking for", () => {
    const out = render([], [], KEPT);
    expect(out).toContain("Yours alone");
    expect(out).toContain("Measurements");
  });

  /* ⚠️ "1 times" is a template showing through. */
  it("counts a repeat and stays silent about a single look", () => {
    const out = render(WHERES, LOOKS);
    expect(out).toContain("4 times");
    expect(out).not.toContain("1 times");
  });

  it("answers the third question at all, which is the one that earns the screen", () => {
    expect(render(WHERES, LOOKS)).toContain("Who has looked");
  });
});

/* ------------------------------------------------------------ the consent --- */

const ASKS: readonly Asked[] = [
  {
    fact: "body.mass", label: "Weight",
    why: "Used to work out your energy target.",
    need: "derived", required: false, recommend: "self",
    because: "Somebody helping you can plan from the change without ever seeing the number.",
    reach: "self",
    readings: [{
      id: "body.mass.trend", label: "Weight trend",
      says: "Which way it is going, and how fast.",
      hides: "Every absolute weight.",
      reach: "self",
    }],
  },
  {
    fact: "goal.training", label: "What you are working towards",
    why: "Your coach writes your programme against this.",
    need: "raw", required: true, recommend: "staff", because: null, reach: "staff",
    readings: [],
  },
];

describe("the consent sheet", () => {
  /* ⚠️ THE BODY, NOT THE SHEET. A sheet's contents live in a portal, which
     renders nothing outside a browser — so a test against the whole thing would
     assert the words somebody agrees to against an empty string, and pass. */
  const out = html(
    <ConsentBody app="Kova" where="Haddad Strength" asks={ASKS} onShare={async () => null} onClose={() => undefined} />,
  );

  it("is presented in a sheet, which renders nothing while it is closed", () => {
    expect(html(
      <ConsentSheet open={false} app="Kova" asks={ASKS} onShare={async () => null} onClose={() => undefined} />,
    )).toBe("");
  });

  /*
    ⚠️ A READING IS ITS OWN DECISION AND ITS OWN ROW. "My coach may see which way
    my weight is going; my coach may not see my weight" is two answers, and a
    sheet that nested one inside the other asks one question and records two.
  */
  it("gives a reading a row of its own", () => {
    expect(out).toContain("Weight trend");
    expect(out).toContain("Every absolute weight.");
  });

  it("shows the current answer on every row, so an answered one does not read as unanswered", () => {
    expect(out).toContain("Only me");
    expect(out).toContain("People here");
  });

  /*
    ⚠️ "Done", NEVER "Allow". Nothing here was allowed as a whole — every row was
    answered on its own, and one button implying otherwise would be the
    permission prompt this exists instead of.
  */
  it("closes with Done rather than Allow", () => {
    expect(out).toContain("Done");
    expect(out).not.toContain(">Allow<");
  });

  it("says plainly when a refusal takes a feature away", () => {
    expect(out).toContain("will not work");
  });

  it("names where the ask applies, because a workspace is a different ask", () => {
    expect(out).toContain("Haddad Strength");
  });
});

describe("asking at the moment of use", () => {
  /*
    ⚠️ NOT AN ERROR. `not_shared` is a decision somebody is entitled to, so the
    blank is an invitation — no alarm colour, no apology.
  */
  it("invites rather than reporting a failure", () => {
    const out = html(<AskForIt what="Weight" then="Your coach could see a trend." onAsk={() => undefined} />);
    expect(out).toContain("is not shared here");
    expect(out).toContain("Choose what to share");
    expect(out).not.toContain("alarm");
  });
});

/* --------------------------------------------------- a field that is a fact --- */

describe("a field bound to a vault fact", () => {
  const FIELD = { name: "height", kind: "text" as const, title: "Height", label: "Height", value: "178" };

  /*
    ⚠️ A VAULT FACT HANDLED SILENTLY TEACHES NOBODY THAT IT IS DIFFERENT, and the
    whole value of the vault is that the person knows. The editor is the moment
    they give it, so it is the moment to say where it goes — reported, never
    decided: the rung is changed in the vault, which is the only place that
    control is defined.
  */
  it("says where it goes, and only when it goes there", () => {
    /* ⚠️ INSIDE A DIALOG ROOT, because the body names the sheet it labels — that
       is what makes the title exist once rather than twice to a reader. */
    const editor = (field: Parameters<typeof ValueEditorBody>[0]["field"]) =>
      html(<Dialog.Root open><ValueEditorBody field={field} /></Dialog.Root>);
    const bound = editor({ ...FIELD, fact: "body.height", kept: "Calculations only." });
    expect(bound).toContain("Vault");
    expect(bound).toContain("Calculations only.");
    expect(editor(FIELD), "an ordinary field claims a vault").not.toContain("Vault");
  });

  /*
    ⚠️ ONCE PER SECTION, NEVER PER FIELD. An intake form is six vault facts, and
    six badges is a column of texture in which the one that matters stops standing
    out. And the copy names no field: "your height and weight" is one product's
    vocabulary in a package every product draws from.
  */
  it("signs the group without naming what is in it", () => {
    const out = html(<KeptHere onOpen={() => undefined} />);
    expect(out).toContain("Kept by your account");
    /* ⚠️ THE WORDS, NOT THE MARKUP. Matching the HTML caught `height="1.15em"` on
       the mark's own SVG — an attribute, not copy — which is a guard failing on
       something no reader will ever see. */
    const words = out.replace(/<[^>]*>/g, " ");
    expect(words).not.toMatch(/\b(height|weight|goal|allergies)\b/i);
  });
});


/* ------------------------------------------------------------ the law --- */

const DOC = (over: Partial<Doc> = {}, doc: Partial<LegalDoc> = {}): Doc => ({
  doc: { id: "terms", version: "4", title: "Terms of service", mustAccept: ["member"], body: "x", ...doc },
  acceptedOn: null, outstanding: false, ...over,
});

/*
  ⚠️ A COMPANY CLAIMING MORE THAN THIS APP HOLDS. `receives` says `financial`;
  the transfer's `categories` is the intersection and does not.

  ⚠️ AND EVERY NAME IN IT IS UNREAL, WHICH ON THIS SUBJECT IS NOT A STYLE CHOICE.
  A disclosure fixture states who controls somebody's data, where it is processed
  and what covers a transfer — so a real company, a real address or a real
  controller written here is a claim about a real business that nobody declared,
  one copy-and-paste from a screen. `hello`'s own governance declaration and the
  preview both use `example.test`; this had simply not been held to it.
*/
const RECEIVING: Receiving = {
  controller: "The example controls it.", contact: "privacy@example.test", regions: ["eu"],
  subprocessors: [
    { id: "billing", name: "The example biller", role: "Taking payment", does: "Takes payment", receives: ["identity", "financial"], where: "Inside the union", safeguard: "eea", terms: "t" },
    { id: "model", name: "The example model", role: "Generating", does: "Runs models", receives: ["content", "health"], where: "Outside the union", safeguard: "sccs", terms: "t" },
  ],
  inference: {},
  transfers: [
    { to: "billing", name: "The example biller", where: "Inside the union", safeguard: "eea", categories: ["identity"], special: false, subjects: ["member"] },
    { to: "model", name: "The example model", where: "Outside the union", safeguard: "sccs", categories: ["content", "health"], special: true, subjects: ["member"] },
  ],
};

/*
  ⚠️ A LABEL MAY ALREADY OWN ITS POSSESSIVE, AND HALF OF THEM DO. The words on a
  vault fact are the app's — "Weight" beside "Your goal" — and a template that
  always prefixed one shipped "Read your your goal". Nothing but a person looking
  at the screen could have caught it, which is what makes it worth a test.
*/
describe("what a read is called", () => {
  it("does not say your twice", () => {
    expect(readAs("Your goal")).toBe("Read your goal");
    expect(readAs("Weight")).toBe("Read your weight");
    expect(readAs("Resting heart rate")).toBe("Read your resting heart rate");
  });
});

/*
  ⚠️ THE RECOMMENDATION IS AN ARGUMENT AND IT BELONGS WHERE THE CHOICE IS. As a
  third grey sentence under every decision it was read before anybody had a choice
  in front of them — four of those turned a sheet with four questions on it into
  twenty lines of prose. It is one sentence, on one option, at the moment somebody
  is picking; and it is offered only where it argues for a CHANGE, because a
  recommendation of "only me" recommends the state they are already in.
*/
describe("where a recommendation is made", () => {
  const ask = { need: "raw", by: undefined } as never;
  it("puts the argument on the rung it argues for, and nowhere else", () => {
    const rows = offered(ask, "staff", "Nobody can plan without it.");
    const staff = rows.find((r) => r.value === "staff");
    expect(staff?.detail).toContain("Nobody can plan without it.");
    for (const r of rows) {
      if (r.value !== "staff") expect(r.detail).not.toContain("Nobody can plan without it.");
    }
  });

  it("says nothing when there is nothing to argue for", () => {
    const rows = offered(ask, null, "Unused.");
    for (const r of rows) expect(r.detail).not.toContain("Unused.");
  });
});

describe("consent and legal", () => {
  /*
    ⚠️ FOUR STATES, AND THE ONE THAT MATTERS IS "ACCEPTED AN EARLIER VERSION".
    That is what everybody sees the day terms change, and it is neither "you
    agreed" nor "you never did" — a boolean loses it on precisely the day the
    record is worth having.
  */
  it("tells an old acceptance from a missing one", () => {
    expect(said(DOC({ acceptedOn: "2 March", outstanding: false }))).toBe("Accepted 2 March");
    expect(said(DOC({ acceptedOn: "2 March", outstanding: true }))).toBe("New version");
    expect(said(DOC({ acceptedOn: null, outstanding: true }))).toBe("Not accepted");
    expect(said(DOC({ acceptedOn: null, outstanding: false }))).toBe("");
  });

  /* ⚠️ ONE PRODUCT UNLESS A TEST SAYS OTHERWISE — the grouping is the subject of
     its own test rather than a fixture every other one has to carry. */
  /* ⚠️ THE HUB LISTS PRODUCTS; A PRODUCT'S OWN SCREEN LISTS ITS DOCUMENTS. Two
     surfaces since the disclosure came out of the hub, so the helpers are two. */
  const hub = (products: readonly Product[]) => renderToStaticMarkup(
    <LegalScreen products={products} onGo={() => undefined} onBack={() => undefined} />,
  );
  const one = (docs: readonly Doc[], receiving: Receiving | null = null) => renderToStaticMarkup(
    <ProductScreen
      of={{ appId: "hello", appName: "Hello", roles: ["owner"], docs, receiving }}
      onGo={() => undefined} onBack={() => undefined}
    />,
  );
  const screen = one;

  it("marks only what is unfinished, and not in the colour of a mistake", () => {
    const html = one([
      DOC({ acceptedOn: "2 March" }),
      DOC({ outstanding: true }, { id: "privacy", title: "Privacy" }),
    ]);
    expect(html).toContain(`data-tone="warn"`);
    /* ⚠️ Red is what the row that closes an account wears. */
    expect(html).not.toContain(`data-tone="alarm"`);
    expect([...html.matchAll(/data-tone="warn"/g)]).toHaveLength(1);
  });

  it("offers no way to agree without opening the document", () => {
    /* ⚠️ A tick beside a link is worth nothing as evidence: the only defensible
       record is one where the text was on the screen. */
    expect(one([DOC({ outstanding: true })])).not.toMatch(/I agree/);
  });

  /* ⚠️ THE DISCLOSURE IS ITS OWN SCREEN NOW, so it is rendered as one. Folded
     under every product's documents it was five label/value rows plus two more
     foldouts, and the answer somebody came for was assembled by reading a table. */
  const who = (receiving: Receiving | null) => renderToStaticMarkup(
    <ReceivingScreen
      of={{ appId: "hello", appName: "Hello", roles: ["owner"], docs: [], receiving }}
      onBack={() => undefined}
    />,
  );
  /* ⚠️ THE RECORD IS ITS OWN SCREEN. Everything a questionnaire asks for is one
     press away, where somebody who wants it will find it and nobody else has to
     read past it. */
  const one_recipient = (sub: string) => renderToStaticMarkup(
    <RecipientScreen
      of={{ appId: "hello", appName: "Hello", roles: ["owner"], docs: [], receiving: RECEIVING }}
      sub={sub} onBack={() => undefined}
    />,
  );

  it("shows what a company actually gets, not what it claims to", () => {
    /*
      ⚠️ THE INTERSECTION, WHICH IS THE ONE THING WORTH PRINTING. The biller's own
      entry declares `financial`; this deployment holds none, so the transfer says
      `identity` alone. Rendering `receives` instead would let any recipient make
      its own row larger than the truth — over-disclosure, in the direction nobody
      checks.

      ⚠️ AND IT IS ON THE RECIPIENT'S OWN SCREEN, because a category set is the
      record rather than the answer. As a stack of lozenges under every row it was
      three or four capsules per company, in a list of four, under a paragraph.
    */
    const html = one_recipient("billing");
    expect(html).toContain("Who you are");
    expect(html).not.toContain("what was charged");
  });

  /* ⚠️ A SET OF THINGS IS A SENTENCE. Article 9 is NAMED in it rather than marked
     on a lozenge: a badge saying something here is sensitive does not say which,
     and a reader looking for one word finds it faster in a line than in a colour. */
  it("speaks the categories, and names the sensitive one in the sentence", () => {
    const html = one_recipient("model");
    expect(html).toContain("What you wrote and your health");
    expect(html).toContain("some of it sensitive");
    expect(html).not.toContain("data-special");
  });

  /* ⚠️ THEIR LINKS, AS ROWS. A card full of external references is a list, and
     every other list here is rows — with the outward mark where a chevron would
     be, because a chevron promises a next screen and this promises a new tab. */
  it("points at what the recipient publishes, and says it leaves", () => {
    const html = one_recipient("model");
    expect(html).toContain(`href="t"`);
    expect(html).toContain(`data-icon="outward"`);
  });

  it("says the answer before it shows the evidence", () => {
    /* ⚠️ A SCREEN WHOSE FIRST LINE IS A HEADING AND WHOSE SECOND IS A TABLE asks
       the reader to do the summarising. Three rows — "Stored in", "Companies with
       access", "Leaves Europe" — were exactly that, and the first of them was a
       claim the payload cannot support: it carried the regions this PRODUCT can be
       deployed in, under a label saying where THIS PERSON'S data is. */
    const html = who(RECEIVING);
    expect(html).toContain("2 companies receive something.");
    expect(html).not.toContain("Stored in");
  });

  it("carries the whole disclosure into one row, worth not opening", () => {
    /* ⚠️ THE SUMMARY HAS TO BE WORTH NOT OPENING — the rule the vault's groups and
       the preferences hub already live by. A row saying only "Who else sees this"
       is a door, and everything behind it is one press further away for nothing. */
    expect(one([DOC()], RECEIVING)).toContain("2 companies \u00b7 1 outside Europe");
  });

  it("says so when a product has published no disclosure at all", () => {
    /* ⚠️ A ROW THAT PREDATES THE COLUMN IS A REAL STATE, and rendering nothing
       makes it indistinguishable from a product that shares with nobody — which is
       the opposite claim. The row is there and does not go anywhere. */
    const html = one([DOC()], null);
    expect(html).toContain("Not published yet");
    expect(html).not.toContain("Nobody else");
  });

  it("makes each product a place to go rather than a thing that unfolds", () => {
    /*
      ⚠️ A DISCLOSURE PUSHED THE NEXT PRODUCT HALF A SCREEN DOWN. A product with
      four documents and a disclosure of its own is a PLACE, and unfolding one
      moved the list under whoever was reading it — so the hub is a list of
      destinations, which is what every other hub in this account centre is.
    */
    const html = hub([
      { appId: "kova", appName: "Kova", roles: ["owner"], docs: [DOC({ outstanding: true })], receiving: null },
      { appId: "scena", appName: "Scena", roles: ["owner"], docs: [DOC({ acceptedOn: "11 May" }, { id: "s" })], receiving: null },
    ]);
    expect(html).not.toContain("<details");
    /* ⚠️ AND THE STATE IS ON THE ROW, so the hub is readable without opening
       anything — which is what a list of doors would have taken away. */
    expect(html).toContain("1 to read");
    expect(html).toContain("Up to date");
    /* ⚠️ THE NAME IS SET AS A NAME. In the reading face it is a row about a word. */
    expect(html).toMatch(/class="item-title wordmark">Kova/);
  });

  it("counts what is owed rather than what was agreed", () => {
    /* ⚠️ "3 of 4" IS A FRACTION WHOSE REMAINDER MAY BE DOCUMENTS NOBODY EVER HAS
       TO ACCEPT. The number a person is looking for is how many are waiting on
       them — and "Up to date" is true of a product that never asked, where
       "Agreed" would not be. */
    const owed = (docs: readonly Doc[]) =>
      state({ appId: "a", appName: "A", roles: ["owner"], docs, receiving: null });
    expect(owed([DOC({ outstanding: true }), DOC({}, { id: "b" })])).toBe("1 to read");
    expect(owed([DOC({ acceptedOn: "2 March" })])).toBe("Up to date");
    expect(owed([DOC()])).toBe("Up to date");
  });

  it("names the product each document belongs to", () => {
    /*
      ⚠️ A PERSON BELONGS TO SEVERAL AND EACH ASKS DIFFERENT THINGS. `legal.list`
      answers for the app serving the request, which on the account centre is
      whichever one happens to be behind that door — so an ungrouped list is a
      list that cannot say whose terms these are.
    */
    const html = hub([
      { appId: "kova", appName: "Kova", roles: ["owner"], docs: [DOC({ outstanding: true })], receiving: null },
      { appId: "scena", appName: "Scena", roles: ["owner"], docs: [DOC({ acceptedOn: "11 May" }, { id: "s" })], receiving: null },
    ]);
    expect(html).toContain("Kova");
    expect(html).toContain("Scena");
  });

  /*
    ⚠️ WHAT LEAVES EUROPE IS COUNTED BY THE SAFEGUARD, NOT BY THE RECIPIENT. A
    company inside the union and a company outside it under standard clauses are
    two rows and one transfer each; counting rows answers "how many companies" to a
    question that asked "how much of this leaves", and the two differ on exactly
    the deployment where somebody cares.
  */
  it("counts what leaves Europe by the safeguard, not by the number of recipients", () => {
    expect(counted(RECEIVING)).toBe("2 companies · 1 outside Europe");
    expect(receives(RECEIVING)).toContain("1 of them is outside Europe.");
    /* ⚠️ AND NOTHING LEAVING SAYS SO OUTRIGHT, rather than saying nothing — which
       reads as a sentence somebody forgot to finish. */
    const inside = { ...RECEIVING, transfers: RECEIVING.transfers.map((t) => ({ ...t, safeguard: "eea" as const })) };
    expect(counted(inside)).toBe("2 companies");
    expect(receives(inside)).toContain("None of it leaves Europe.");
  });

  /*
    ⚠️ A REGION NOBODY HAS NAMED IS PRINTED AS ITSELF. The named set is the
    kernel's and a deployment may be somewhere it does not list; rendering a blank
    row, or the word "Unknown", turns a place we simply have no words for into a
    place we are declining to name — on the one screen whose whole subject is where
    somebody's data is.
  */
  it("prints a region nobody has named as itself", () => {
    const somewhere: Receiving = {
      ...RECEIVING,
      inference: { model: { "ap-south": ["model"], eu: [] } },
    };
    const html = who(somewhere);
    expect(html).toContain("ap-south");
    expect(html).toContain("European Union");
    /* ⚠️ AND THE ONE WITH NOTHING IN IT SAYS SO. An empty row reads as a region
       whose recipients we failed to list. */
    expect(html).toContain("Nothing is generated here");
  });

  it("names the account differently from a product", () => {
    /*
      ⚠️ AN EMPTY `appId` IS THE DEPLOYMENT. Rendering it under its own name like
      any other row would make the account look like one more product somebody
      signed up for, when it is the thing every product is reached through — and
      the one that holds the vault.
    */
    const html = hub([
      { appId: "", appName: "4°", roles: ["account"], docs: [DOC()], receiving: null },
      { appId: "kova", appName: "Kova", roles: ["owner"], docs: [DOC({}, { id: "k" })], receiving: null },
    ]);
    /* ⚠️ THE LOCKUP, WHICH IS THE PLATFORM'S ONE DEVICE FOR "this belongs to the
       account" — the same object that names the account centre and the vault. As
       words it is a fourth product with a longer name. */
    expect(html).toContain(`<span class="lockup-word">Account</span>`);
    expect(html).toContain(">Kova<");
    /* ⚠️ AND IT IS NOT ONE OF THE PRODUCTS. Its documents are on the hub itself,
       under the lockup, because it is not a product among products. */
    expect(html.indexOf("lockup-word")).toBeLessThan(html.indexOf("Products"));
  });

  it("says what changed, and only to somebody who agreed to the last one", () => {
    /*
      ⚠️ VERSIONING WAS ALREADY REAL AND SILENT. The ledger is keyed per person
      per document per VERSION, so a new version correctly re-asks everybody — and
      what they were shown was the same wall of text with a different number on
      it. Somebody re-agreeing without being told what moved is a signature
      collected rather than a consent given.
    */
    const changed = { ...DOC({ acceptedOn: "2 March", outstanding: true }) };
    const doc = { ...changed, doc: { ...changed.doc, changed: "We named the model." } };
    expect(renderToStaticMarkup(
      <DocScreen item={doc} onAccept={async () => null} onBack={() => undefined} />,
    )).toContain("We named the model.");

    /* ⚠️ AND NOT TO A FIRST READER. To somebody who has never accepted anything
       here it is a diff against a document they have not read — noise at the top
       of the thing they are meant to read. */
    const first = { ...doc, acceptedOn: null };
    expect(renderToStaticMarkup(
      <DocScreen item={first} onAccept={async () => null} onBack={() => undefined} />,
    )).not.toContain("We named the model.");
  });

  it("gives a company a row it can be identified by, not a paragraph", () => {
    const html = who(RECEIVING);
    /*
      ⚠️ THE DECLARED LABEL, NOT THE DECLARATION. `role` is a sentence written for
      a record; on a row it wrapped to five lines and clipped the name beside it.
      `does` is the same thing in four words, declared and held to a length.
    */
    expect(html).toContain("Takes payment");
    expect(html).not.toContain("Taking payment");
    /* ⚠️ AND A COMPANY WITH NO DRAWN MARK STILL HAS A FACE. An unknown name and
       an absent one both fall back to the initial, so nothing here can fail to
       render — and a generic drawn building would read as a company nobody could
       identify. */
    expect(html).toMatch(/class="mark-letter"[^>]*>T</);
    /* ⚠️ NO CAPSULE. Every company here leaves Europe, so one on every row
       distinguishes nothing; the count is in the lede. */
    expect(html).not.toContain(`class="pill"`);
  });
});

/* ------------------------------------------------------------ before you go --- */

describe("what stands between somebody and using the product", () => {
  const OWED = [
    { product: "", productName: "4°", doc: DOC().doc, seenBefore: false },
    { product: "kova", productName: "Kova", doc: { ...DOC().doc, id: "privacy", title: "Privacy notice" }, seenBefore: true },
  ];

  /*
    ⚠️ THE SERVER ALREADY REFUSED AND THERE WAS NO SURFACE FOR IT. Every write
    with an outstanding document comes back `platform.consent_required` — so
    without a screen, a person met an error on whatever they happened to be
    doing, naming documents, with no way to reach one.
  */
  it("names which product is asking, because the list crosses them", () => {
    const html = renderToStaticMarkup(
      <MustAcceptScreen owed={OWED} onGo={() => undefined} onLeave={() => undefined} />,
    );
    expect(html).toContain("4°");
    expect(html).toContain("Kova");
  });

  /* ⚠️ "You agreed to this before and it has changed" IS A DIFFERENT SENTENCE
     from "you have never agreed to this", and on the day terms are republished it
     is the sentence everybody is owed. */
  it("tells a new version from a first reading, on the row and in the title", () => {
    const html = renderToStaticMarkup(
      <MustAcceptScreen owed={OWED} onGo={() => undefined} onLeave={() => undefined} />,
    );
    expect(html).toContain("New version");
    expect(html).toContain("Not accepted");
    expect(html).toContain("Something has changed");

    const fresh = renderToStaticMarkup(
      <MustAcceptScreen owed={[OWED[0]!]} onGo={() => undefined} onLeave={() => undefined} />,
    );
    expect(fresh).toContain("Before you continue");
    expect(fresh).not.toContain("Something has changed");
  });

  /* ⚠️ LEAVING IS ALWAYS ALLOWED, AND IT IS SAID HERE RATHER THAN IMPLIED. The
     exit lane survives every gate in the platform for exactly this reason; a
     screen that only offers agreement is one that pretends otherwise. */
  it("says the way out is still open", () => {
    const html = renderToStaticMarkup(
      <MustAcceptScreen owed={OWED} onGo={() => undefined} onLeave={() => undefined} />,
    );
    expect(html).toContain("close your account");
  });
});

/* ----------------------------------------------------------------- leaving --- */

describe("taking your data and closing the account", () => {
  it("keeps the close button off until it knows what would be stranded", () => {
    /*
      ⚠️ `null` IS NOT ANSWERED YET AND `[]` IS NOTHING IN THE WAY. Rendered
      enabled while the blocking list is still coming, this is a working Close for
      somebody whose workspaces would be left with nobody who can manage them.
    */
    const waiting = renderToStaticMarkup(
      <CloseAccountScreen blocking={null} closesOn={null}
        onClose={async () => null} onCancel={async () => null} onBack={() => undefined} />,
    );
    expect(waiting).not.toContain("Close my account");

    const clear = renderToStaticMarkup(
      <CloseAccountScreen blocking={[]} closesOn={null}
        onClose={async () => null} onCancel={async () => null} onBack={() => undefined} />,
    );
    expect(clear).toContain("Close my account");
  });

  /* ⚠️ A REFUSAL THAT NAMES THE WORKSPACES IS ONE SOMEBODY CAN ACT ON, where
     "you cannot do this" is a wall with no door in it. */
  it("names what would be left with nobody, rather than only refusing", () => {
    const html = renderToStaticMarkup(
      <CloseAccountScreen
        blocking={[{ tenantId: "t1", name: "Haddad Strength" }]}
        closesOn={null}
        onClose={async () => null} onCancel={async () => null} onBack={() => undefined} />,
    );
    expect(html).toContain("Haddad Strength");
    expect(html).toContain("Hand those over first");
  });

  /* ⚠️ ALREADY CLOSING IS A DIFFERENT SCREEN, not the same one with a banner. The
     only thing to decide is whether to come back. */
  it("offers only the way back once it is already closing", () => {
    const html = renderToStaticMarkup(
      <CloseAccountScreen blocking={[]} closesOn="19 August"
        onClose={async () => null} onCancel={async () => null} onBack={() => undefined} />,
    );
    expect(html).toContain("Keep my account");
    expect(html).not.toContain("Close my account");
  });

  /* ⚠️ AN EXPORT THAT DOES NOT SAY WHAT IS MISSING IS THE DANGEROUS KIND: it
     arrives, it is full of somebody's data, and nothing in it says what is not
     there. */
  it("lists what could not be read beside what was", () => {
    const taken = {
      at: "2026-08-12T00:00:00.000Z" as never,
      tables: { consents: [{}, {}], vault_facts: [{}] },
      dropped: ["milestones"],
      account: {}, workspaces: [],
    };
    const html = renderToStaticMarkup(
      <ExportScreen taken={taken} onTake={async () => null} onBack={() => undefined} />,
    );
    expect(html).toContain("2 records");
    expect(html).toContain("1 record");
    expect(html).toContain("milestones");
    expect(html).toContain("Not included");
  });

  /* ⚠️ AND THE "what could not be read" SECTION IS ABSENT WHERE NOTHING WAS. A
     reassurance on every successful export trains people to skip the one time it
     says otherwise. */
  it("says nothing about dropped tables when none were", () => {
    const taken = {
      at: "2026-08-12T00:00:00.000Z" as never,
      tables: { consents: [{}] }, dropped: [], account: {}, workspaces: [],
    };
    expect(renderToStaticMarkup(
      <ExportScreen taken={taken} onTake={async () => null} onBack={() => undefined} />,
    )).not.toContain("What could not be read");
  });
});

describe("the rest of the account centre", () => {
  it("renders a declared document as text, never as markup", () => {
    /* ⚠️ A manifest is not an injection surface. */
    const html = renderToStaticMarkup(<>{paragraphs("<img src=x onerror=alert(1)>\n\nsecond")}</>);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect([...html.matchAll(/<p>/g)]).toHaveLength(2);
  });
});
