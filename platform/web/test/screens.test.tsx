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
import type { Problem } from "@one/kernel";

import { AccountCenter, type AccountCenterProps } from "../src/account/center.js";
import { VaultScreen, type Held, type Looked } from "../src/account/vault.js";
import { AskForIt, ConsentBody, ConsentSheet, type Asked } from "../src/consent.js";
import { AccountDetails } from "../src/account/details.js";
import { PreferencesScreen, type Preferences, type SetPreference } from "../src/account/preferences.js";
import { SignInMethods, type Passkey } from "../src/account/signin.js";
import { Chip } from "../src/chip.js";
import { Marked, Unset } from "../src/list.js";
import { SwitchRow } from "../src/switch.js";
import { ValueEditor } from "../src/editor.js";
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

/* ------------------------------------------------------------------ chip --- */

describe("a chip", () => {
  /* ⚠️ Not a control and it must not look like one — what it is doing is
     carrying a face into a line of text. */
  it("carries a name and is not a button", () => {
    const out = html(<Chip>Corniche Screens</Chip>);
    expect(out).toContain("Corniche Screens");
    expect(out).not.toContain("<button");
  });
});

/* ----------------------------------------------------------------- marked --- */

describe("a marked face", () => {
  it("hides its badge from a reader, because the face already names the thing", () => {
    const out = html(<Marked face={<span className="face" />} badge={<Device />} />);
    expect(out).toContain('aria-hidden="true"');
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
        onAddPasskey={() => undefined} onRemovePasskey={nothing} onSignOut={nothing} onBack={() => undefined}
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
        onAddPasskey={() => undefined} onRemovePasskey={nothing} onSignOut={nothing} onBack={() => undefined}
      />,
    );
    expect(out).toContain("waiting");
  });

  it("marks the device in your hand, so the list is readable", () => {
    const out = html(
      <SignInMethods
        passkeys={KEYS} devices={[]} email="b@example.com"
        onAddPasskey={() => undefined} onRemovePasskey={nothing} onSignOut={nothing} onBack={() => undefined}
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

const HELD: readonly Held[] = [
  {
    fact: "body.mass", label: "Weight", held: true,
    grants: [{ appId: "kova", appName: "Kova", where: "Haddad Strength", reach: "compute", until: null, live: true }],
  },
  { fact: "body.height", label: "Height", held: true, grants: [] },
  { fact: "health.allergies", label: "Allergies", held: false, grants: [] },
];

const LOOKS: readonly Looked[] = [
  { fact: "body.mass", label: "Weight", appName: "Kova", who: "Shujaa", on: "9 August", times: 4 },
  { fact: "body.mass", label: "Weight", appName: "Kova", on: "8 August", times: 1 },
];

describe("your vault", () => {
  const render = (held: readonly Held[] | null, looks: readonly Looked[] | null) => html(
    <VaultScreen
      held={held} looks={looks}
      onOpen={() => undefined} onStop={nothing} onBack={() => undefined}
    />,
  );

  /* ⚠️ `null` IS NOT ANSWERED YET AND `[]` IS ANSWERED AND EMPTY. */
  it("waits rather than claiming somebody shares nothing", () => {
    const out = render(null, null);
    expect(out).toContain("waiting");
    expect(out).not.toContain("You are not sharing anything");
  });

  it("says nothing is shared only once it knows", () => {
    expect(render([], [])).toContain("You are not sharing anything");
  });

  /*
    ⚠️ WHAT IS SHARED COMES FIRST. A list in registry order buries the three
    things somebody came to check under nine they never filled in — and this
    screen is opened by somebody who wants to stop something.
  */
  it("puts what is shared above what is not", () => {
    const out = render(HELD, LOOKS);
    expect(out.indexOf("Haddad Strength")).toBeLessThan(out.indexOf("Nothing recorded"));
  });

  /*
    ⚠️ THE VALUES ARE NOT ON THIS SCREEN. It answers who can see what — showing
    the numbers here would put somebody's whole body on one scrollable page.
  */
  it("says whether something is recorded and never what it is", () => {
    const out = render(HELD, LOOKS);
    expect(out).toContain("Nothing recorded");
    expect(out).toContain("Recorded");
  });

  /* ⚠️ "1 times" is a template showing through. */
  it("counts a repeat and stays silent about a single look", () => {
    const out = render(HELD, LOOKS);
    expect(out).toContain("4 times");
    expect(out).not.toContain("1 times");
  });

  it("answers the third question at all, which is the one that earns the screen", () => {
    expect(render(HELD, LOOKS)).toContain("Who has looked");
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
