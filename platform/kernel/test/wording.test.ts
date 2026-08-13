/**
 * A WORKSPACE PUTTING THE PRODUCT'S MESSAGES IN ITS OWN WORDS.
 *
 * ⚠️ THE WHOLE FEATURE IS THAT ONLY THE COPY MOVES. A tenant is a business
 * writing to its own customers and the sentence is theirs; the category, the
 * tone, the audience and the destination are what make an inbox triageable and
 * a link real, and those stay declared. A rephrasing that could change who is
 * told, or where the notification goes, would be a screen for reassigning other
 * people's mail.
 *
 * ⚠️ AND THE SHARP EDGE IS `{token}`. A dispatch carries the values the
 * PLATFORM's copy needs and nothing else, and `render` deliberately leaves an
 * unknown token in place rather than printing `undefined` — so a rephrasing
 * reaching for one this type never carries sends the literal text `{amount}` to
 * a customer. Which makes the write the moment to refuse it: at the keyboard of
 * the person who can fix it.
 */

import { describe, expect, it } from "vitest";
import {
  MAX_LETTER, MAX_WORDING, letterFor, refuseLetter, refuseWording, render, saying, signOff, tokensIn,
  type NotificationDef, type NotificationRegistry,
} from "../src/notify.js";

const def = (over: Partial<NotificationDef> = {}): NotificationDef => ({
  category: "activity", tone: "info", icon: "check",
  title: "{days} days added", body: "Enjoy them, {name}.",
  link: { to: "inbox" }, roles: ["client"], needs: "commerce:read", ...over,
});

const REGISTRY: NotificationRegistry = {
  "package.granted": def({ theirs: true }),
  /* ⚠️ Us writing to the tenant about the tenant's own bill. Not theirs. */
  "plan.chosen": def({ title: "You chose {planId}", body: undefined, category: "billing" }),
};

/* ------------------------------------------------------------ the tokens --- */

describe("what a rephrasing may interpolate", () => {
  it("reads every token a template uses", () => {
    expect(tokensIn("{a} and {b} and {a}")).toEqual(["a", "b", "a"]);
    expect(tokensIn("nothing here")).toEqual([]);
  });

  /*
    ⚠️ THE TITLE AND THE BODY TOGETHER, so a workspace may move a value from one
    to the other — "You have {days} days" as a title, with the body dropped.
    What it may not do is invent one.
  */
  it("lets a value move between the title and the body", () => {
    expect(refuseWording(REGISTRY, "package.granted", { title: "{name}, you have {days} days" })).toBeNull();
  });

  it("refuses a value this notification does not carry", () => {
    expect(refuseWording(REGISTRY, "package.granted", { title: "You paid {amount}" })).toBe("unknown_token");
    expect(refuseWording(REGISTRY, "package.granted", { title: "ok", body: "at {studio}" })).toBe("unknown_token");
  });

  /*
    ⚠️ AND THIS IS WHAT IT PREVENTS — asserted rather than described, because the
    refusal is only worth anything if the thing it refuses is genuinely bad.
  */
  it("is refusing text that would otherwise reach a customer verbatim", () => {
    expect(render("You paid {amount}", { days: 30, name: "Sam" })).toBe("You paid {amount}");
  });
});

/* ----------------------------------------------------------- whose words --- */

describe("which messages are a workspace's to change", () => {
  /*
    ⚠️ OPT-IN PER TYPE, AND THE DEFAULT IS THE STRICT ONE. A business that could
    reword its own arrears notice could make one read as though nothing were
    wrong, for staff who would then not act on it.
  */
  it("refuses one the platform sends to them, about them", () => {
    expect(refuseWording(REGISTRY, "plan.chosen", { title: "All is well" })).toBe("not_theirs");
  });

  it("refuses a type nobody declared", () => {
    expect(refuseWording(REGISTRY, "invented.type", { title: "x" })).toBe("unknown_type");
  });

  /*
    ⚠️ AND A STORED ROW FOR A TYPE THAT STOPS BEING THEIRS STOPS BEING USED ON
    THE SAME DEPLOY. The write refuses one, but a registry changes after rows
    exist — and "we will delete those rows" is a migration somebody has to
    remember, against copy a customer is reading.
  */
  it("ignores words stored for a type that is no longer theirs", () => {
    expect(saying(REGISTRY["plan.chosen"]!, { title: "All is well" }).title).toBe("You chose {planId}");
  });
});

/* ---------------------------------------------------------- what it says --- */

describe("what a notification actually says", () => {
  it("uses the platform's words where a workspace has none", () => {
    expect(saying(REGISTRY["package.granted"]!)).toEqual({ title: "{days} days added", body: "Enjoy them, {name}." });
  });

  it("uses the workspace's where it has them", () => {
    expect(saying(REGISTRY["package.granted"]!, { title: "{days} more with us" }).title).toBe("{days} more with us");
  });

  /*
    ⚠️ BLANK FALLS THROUGH RATHER THAN CLEARING — the same rule the config store
    uses. Without it a half-filled form sends an email with no subject, which is
    a message most clients file as spam and no reader can identify.
  */
  it("keeps our words behind an emptied box", () => {
    expect(saying(REGISTRY["package.granted"]!, { title: "   ", body: "" })).toEqual({
      title: "{days} days added", body: "Enjoy them, {name}.",
    });
  });

  /* ⚠️ One half at a time: a workspace rewriting the title keeps our body. */
  it("replaces only the half that was written", () => {
    expect(saying(REGISTRY["package.granted"]!, { body: "See you Tuesday." })).toEqual({
      title: "{days} days added", body: "See you Tuesday.",
    });
  });
});

/* -------------------------------------------------------------- refusals --- */

describe("what may not be stored", () => {
  it("refuses an entry with nothing in it", () => {
    expect(refuseWording(REGISTRY, "package.granted", {})).toBe("empty");
    expect(refuseWording(REGISTRY, "package.granted", { title: " ", body: " " })).toBe("empty");
  });

  /* ⚠️ A title becomes an email subject and a row on a phone, and neither has
     anywhere to put a thousand words. */
  it("refuses more than a notification can hold", () => {
    expect(refuseWording(REGISTRY, "package.granted", { title: "x".repeat(MAX_WORDING + 1) })).toBe("too_long");
    expect(refuseWording(REGISTRY, "package.granted", { body: "x".repeat(MAX_WORDING + 1) })).toBe("too_long");
    expect(refuseWording(REGISTRY, "package.granted", { title: "x".repeat(MAX_WORDING) })).toBeNull();
  });
});

/* ------------------------------------------------------------ the sign-off --- */

describe("how a workspace signs off", () => {
  it("adds the sign-off under the message", () => {
    expect(signOff("See you Tuesday.", "— Anna, Northside")).toBe("See you Tuesday.\n\n— Anna, Northside");
  });

  /* ⚠️ A message with no body still gets signed, or a one-line notification
     arrives from nobody at all. */
  it("signs a message that had no body", () => {
    expect(signOff(undefined, "— Anna")).toBe("— Anna");
  });

  /* ⚠️ And a workspace that has set none is left exactly as it was, rather than
     gaining two blank lines at the end of every email it sends. */
  it("changes nothing where there is no sign-off", () => {
    expect(signOff("See you Tuesday.", "   ")).toBe("See you Tuesday.");
    expect(signOff(undefined, "")).toBeUndefined();
  });
});

/* ----------------------------------------------------------- the letterhead --- */

/**
 * ⚠️ A WRAPPER, NEVER THE MESSAGE. The title and the body are still rendered
 * from the registry with the dispatch's own values, so a letterhead cannot say
 * anything the notification did not — it decides how it looks, not what it says.
 * A template that WAS the message would be a second copy of every sentence,
 * drifting from the one the inbox shows.
 */
describe("a workspace's own letterhead", () => {
  const said = { title: "12 days added", body: "Enjoy them, Sam." };

  it("wraps the message it was given and invents none of it", () => {
    const out = letterFor(said, "— Anna", { html: "<main>{title}<p>{body}</p><i>{signature}</i></main>" });
    expect(out.html).toBe("<main>12 days added<p>Enjoy them, Sam.</p><i>— Anna</i></main>");
    expect(out.subject).toBe("12 days added");
  });

  /*
    ⚠️ THE TEXT PART IS ALWAYS BUILT, EVEN WHERE THERE IS HTML. A client that
    cannot render it, a screen reader, a spam filter reading a text/plain part
    that is not there — all three are ordinary, and an HTML-only email arrives
    blank for some readers with nothing on our side saying so.
  */
  it("always writes the plain half too", () => {
    const out = letterFor(said, "— Anna", { html: "<main>{body}</main>" });
    expect(out.text).toBe("Enjoy them, Sam.\n\n— Anna");
  });

  it("sends plain text where a workspace has no layout", () => {
    expect(letterFor(said, "— Anna").html).toBeUndefined();
    expect(letterFor(said, "— Anna", { html: "   " }).html).toBeUndefined();
  });

  /*
    ⚠️ A LAYOUT WITH NO `{body}` SENDS THE SAME EMPTY PAGE TO EVERY CUSTOMER FOR
    EVER, and it looks completely fine in the editor that saved it — which is why
    it is refused at the keyboard of the person who can fix it.
  */
  it("refuses a layout the message would not appear in", () => {
    expect(refuseLetter({ html: "<main>{title}</main>" })).toBe("no_body");
    expect(refuseLetter({ html: "<main>{body}</main>" })).toBe(null);
    expect(refuseLetter({})).toBe(null);
  });

  /* ⚠️ And an unknown token renders as its own literal text in a customer's
     inbox, because `render` leaves one in place rather than printing undefined. */
  it("refuses a token no dispatch will ever carry", () => {
    expect(refuseLetter({ html: "<main>{body}{amount}</main>" })).toBe("unknown_token");
  });

  it("refuses a newsletter wearing a letterhead's name", () => {
    expect(refuseLetter({ html: `<main>{body}${"x".repeat(MAX_LETTER)}</main>` })).toBe("too_long");
  });

  /* ⚠️ The layout's own sign-off wins where it has one, so a workspace can put
     it inside the design rather than under it. */
  it("prefers the letterhead's own sign-off to the plain one", () => {
    expect(letterFor(said, "— Anna", { html: "<i>{signature}</i>{body}", signature: "— The team" }).html)
      .toContain("— The team");
  });
});
