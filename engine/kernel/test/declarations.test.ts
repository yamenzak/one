/**
 * THE DECLARATIONS A PERSON EVENTUALLY SEES — notifications, settings, flags and
 * the checklist.
 *
 * ⚠️ EVERY ONE OF THESE IS A FAILURE THAT LOOKS LIKE SUCCESS FROM THE INSIDE. A
 * dispatch to an empty audience, a workspace switch stored per person, a kill
 * switch a tenant can beat, a checklist item nothing can ever tick. Not one of
 * them throws, and none is visible from the code that caused it.
 */

import { describe, expect, it } from "vitest";
import {
  channelsFor, inAudience, letterFor, refusePolicy, refuseLetter, unknownVariables, brandable,
  unraisable, unaddressable, deadLinks, notification, type NotificationDef, type Channel,
} from "../src/notify.js";
import { area, refuseSetting, refuseSettings, disclose, valueOf, settingsOn, areasOn, settingsIn, setting } from "../src/setting.js";
import { resolve, settableBy, refuseFlag, overdue, flag } from "../src/flag.js";
import { remaining, progressOf, reached, refuseGuide } from "../src/guide.js";
import { field } from "../src/field.js";
import type { Day } from "../src/primitives.js";

/* --------------------------------------------------------------- notify --- */

const invited = notification({
  id: "member.invited", label: "Invitation", summary: "You were invited.",
  category: "action", author: "theirs", tone: "info", icon: "mail",
  needs: "member:read", on: "member.invited", link: "/people",
  variables: ["name", "workspace"], channels: ["inbox", "email", "push"],
});

const digest = notification({
  id: "week.digest", label: "Weekly digest", summary: "How last week went.",
  category: "digest", author: "theirs", tone: "neutral", icon: "chart",
  needs: "report:read", on: "week.closed", link: "/reports",
  variables: [], channels: ["inbox", "email"],
});

describe("who a notification is for", () => {
  /*
    ⚠️ THE AUDIENCE IS A PERMISSION AND NEVER A ROLE NAME. A workspace that makes
    its own role gets everything else right — the role resolves, the gates pass,
    the screens render — and simply stops receiving notifications, with the
    dispatch reporting success against an empty audience every time.
  */
  it("finds somebody in a role nobody declared, because it asks about a key", () => {
    const theirOwnRole = new Set(["member:read", "note:write"]);
    expect(inAudience(invited, theirOwnRole)).toBe(true);
    expect(inAudience(digest, theirOwnRole)).toBe(false);
  });

  /* ⚠️ A type nothing raises renders in the policy screen, is switched on, and
     never arrives — so the product reads as broken rather than incomplete. */
  it("refuses a type that waits for an event nothing raises", () => {
    expect(unraisable({ x: invited }, ["member.invited"])).toEqual([]);
    expect(unraisable({ x: invited }, ["something.else"])).toEqual(["member.invited"]);
  });

  it("refuses an audience nothing can hold", () => {
    expect(unaddressable({ x: invited }, ["member:read"])).toEqual([]);
    expect(unaddressable({ x: invited }, ["note:read"])).toEqual(["member.invited"]);
  });

  /*
    ⚠️ A DEAD LINK ONLY APPEARS ONCE SOMETHING RENDERS THE ROW. A previous
    platform's inbox carried five, four pointing at a route that did not exist —
    and an integration test asserted one of the wrong paths, so the bug was
    pinned rather than found.
  */
  it("catches a link that matches no screen", () => {
    expect(deadLinks({ a: invited }, ["/people"])).toEqual([]);
    expect(deadLinks({ a: invited }, ["/members"])).toEqual(["member.invited → /people"]);
  });
});

describe("the two levels of a policy", () => {
  const every: readonly Channel[] = ["inbox", "email", "push"];

  it("lets a person narrow what the workspace allows", () => {
    expect(channelsFor(invited, { "member.invited": ["inbox", "email"] }, {}, every))
      .toEqual(["inbox", "email"]);
    expect(channelsFor(invited, {}, { "member.invited": ["inbox"] }, every)).toEqual(["inbox"]);
  });

  /*
    ⚠️ AND NEVER TO WIDEN IT. A workspace that switched a channel off has usually
    done so for a reason about the workspace — a shared inbox, a policy, a cost —
    and a person's preference is not the authority that overturns it.
  */
  it("refuses to widen past the workspace's ceiling", () => {
    expect(channelsFor(invited, { "member.invited": ["inbox"] }, { "member.invited": every }, every))
      .toEqual(["inbox"]);
  });

  /* ⚠️ And past what the deployment can actually deliver. A push offered where
     push is not configured is a switch that silently does nothing. */
  it("never offers a channel the deployment does not have", () => {
    expect(channelsFor(invited, {}, {}, ["inbox", "email"])).toEqual(["inbox", "email"]);
  });

  /*
    ⚠️ THE INBOX SURVIVES EVERY NARROWING, because it is the record rather than
    an interruption. Somebody who muted email still needs somewhere to find what
    happened while they were not looking.
  */
  it("keeps the inbox even when everything else is muted", () => {
    expect(channelsFor(invited, {}, { "member.invited": [] }, every)).toEqual(["inbox"]);
  });

  /*
    ⚠️ AN `action` MAY NOT BE SILENCED, AT EITHER LEVEL. "Your invitation is
    waiting" and "your payment failed" are requests for something only that
    person can do — a product that lets them be muted has built a way to miss
    them with nothing reporting it.
  */
  it("refuses a policy that silences something the reader must act on", () => {
    const book = { "member.invited": invited, "week.digest": digest };
    expect(refusePolicy(book, { "member.invited": ["inbox"] }).map((p) => p.why))
      .toEqual(["action_muted"]);
    expect(refusePolicy(book, { "week.digest": ["inbox"] })).toEqual([]);
  });

  it("refuses a channel the type does not offer at all", () => {
    expect(refusePolicy({ "week.digest": digest }, { "week.digest": ["inbox", "email", "push"] })
      .map((p) => p.why)).toEqual(["channel_not_offered"]);
  });
});

describe("a workspace rewriting a message", () => {
  /*
    ⚠️ A TENANT MAY REWRITE ONLY WHAT IT AUTHORS. "Your subscription is past due"
    is from us to the business; wrapping it in the business's own branding tells
    their staff their own company is chasing them for a bill they have never
    heard of.
  */
  it("refuses to let them rewrite a message that is ours", () => {
    const ours: NotificationDef = { ...invited, author: "ours" };
    expect(brandable(ours)).toBe(false);
    expect(refuseLetter(ours, { subject: "Hi", body: "Hello {name}" })).toContain("not_theirs");
  });

  /*
    ⚠️ `{coach}` WHERE THE DEFINITION OFFERS `{trainer}` RENDERS THE BRACE AND THE
    WORD to somebody who has no idea what it is — and it is the tenant's own
    edit, so nothing of ours fails and nobody of ours is told.
  */
  it("names the variables a template invented", () => {
    const letter = { subject: "Hello {name}", body: "Join {workspace} — {coach} is waiting" };
    expect(unknownVariables(invited, letter)).toEqual(["coach"]);
    expect(refuseLetter(invited, letter)).toContain("unknown_variable");
    expect(refuseLetter(invited, { subject: "Hello {name}", body: "Join {workspace}" })).toEqual([]);
  });
});

/* ---------------------------------------------------------------- by mail --- */

describe("what a notification becomes when it leaves the process", () => {
  const values = { name: "Sam", workspace: "Harbour Works" };
  const where = "https://harbour.t.example/people";

  /*
    ⚠️ THE DEFAULT NAMES THE WORKSPACE AND CARRIES AN ABSOLUTE WAY BACK. An inbox
    row sits in a surface that already says whose it is and is one press from the
    thing it is about; a letter arrives among four hundred others with neither.
  */
  it("names the workspace and links somewhere a reader can go", () => {
    const out = letterFor(invited, values, where, null, "Harbour Works");
    expect(out.subject).toContain("Harbour Works");
    expect(out.text).toContain(where);
    /* ⚠️ Filled, never `{name}` — a template reaches nobody unfilled. */
    expect(out.subject).not.toMatch(/\{[a-z]/);
    expect(out.text).not.toMatch(/\{[a-z]/);
  });

  it("uses the workspace's own words where it has them", () => {
    const own = { subject: "{workspace}: you are invited", body: "Hello {name}, come in." };
    const out = letterFor(invited, values, where, own, "Harbour Works");
    expect(out.subject).toBe("Harbour Works: you are invited");
    expect(out.text).toContain("Hello Sam, come in.");
    expect(out.text).toContain(where);
  });

  /*
    ⚠️ AND ASKS AGAIN RATHER THAN TRUSTING THE ROW. A stored template can be
    written by one version of the rule and read by a newer one — a message that
    became ours after somebody rewrote it would otherwise keep going out in their
    words, which is the one failure this whole distinction exists to prevent.
  */
  it("ignores a stored template for a message that is ours", () => {
    const ours: NotificationDef = { ...invited, author: "ours" };
    const own = { subject: "Nothing to worry about", body: "Ignore this" };
    const out = letterFor(ours, values, where, own, "Harbour Works");
    expect(out.subject).not.toContain("Nothing to worry about");
  });

  /* ⚠️ AND A TEMPLATE THAT WOULD SEND `{coach}` TO SOMEBODY IS NOT USED. It is
     refused where it is saved; this is what happens if one is already stored. */
  it("falls back rather than mailing a brace", () => {
    const own = { subject: "Hi {coach}", body: "Hello" };
    const out = letterFor(invited, values, where, own, "Harbour Works");
    expect(out.subject).not.toContain("{coach}");
    expect(out.subject).toContain("Harbour Works");
  });
});

/* -------------------------------------------------------------- settings --- */

/* ⚠️ THE PAGES THESE ROWS LIVE ON. A setting naming an area nothing declares is
   a refusal now — see `unknown_area`. */
const AREAS = {
  data: area({ id: "data", label: "Data", icon: "database", said: "What is kept, and for how long", order: 0 }),
  appearance: area({ id: "appearance", label: "Appearance", icon: "star", said: "How it looks", order: 1 }),
  payments: area({ id: "payments", label: "Payments", icon: "money", said: "Who takes the money", order: 2 }),
};

const retention = setting({
  id: "retention.days", level: "tenant", area: "data",
  field: field.number({ label: "Keep records for", holds: "none", min: 1 }),
  fallback: 365, needs: "tenant:manage",
});

const theme = setting({
  id: "theme", level: "person", area: "appearance",
  field: field.enum({ label: "Theme", holds: "none", values: ["light", "dark", "system"] }),
  fallback: "system",
});

describe("a setting", () => {
  /*
    ⚠️ A WORKSPACE SETTING ANYBODY MAY WRITE IS ONE ANY MEMBER CAN CHANGE FOR THE
    WHOLE BUSINESS — their retention, their branding, their payment provider —
    and nothing about the screen says so.
  */
  it("refuses a workspace setting with nobody named to change it", () => {
    expect(refuseSetting({ ...retention, needs: undefined }, AREAS).map((p) => p.why))
      .toEqual(["tenant_without_permission"]);
    expect(refuseSetting(retention, AREAS)).toEqual([]);
  });

  it("refuses a workspace permission on somebody's own preference", () => {
    expect(refuseSetting({ ...theme, needs: "tenant:manage" }, AREAS).map((p) => p.why))
      .toEqual(["person_with_permission"]);
  });

  /*
    ⚠️ A STORED KEY RENDERED BACK INTO A FORM is a credential handed to every
    screen that can open that form. It is written and never read back, and what a
    screen shows is whether it is set.
  */
  it("reports a secret as set or unset, never as itself", () => {
    const key = setting({
      id: "provider.key", level: "tenant", area: "payments", secret: true,
      field: field.text({ label: "Secret key", holds: "none" }), fallback: "", needs: "tenant:manage",
    });
    expect(disclose(key, { "provider.key": "sk_live_abcd" })).toEqual({ set: true });
    expect(disclose(key, {})).toEqual({ set: false });
    expect(JSON.stringify(disclose(key, { "provider.key": "sk_live_abcd" }))).not.toContain("sk_live");
  });

  it("refuses a credential that belongs to one person", () => {
    expect(refuseSetting({ ...theme, secret: true }, AREAS).map((p) => p.why))
      .toContain("secret_at_person_level");
  });

  /* ⚠️ A missing row is the fallback and never `undefined`. Every consumer
     inventing its own default is how two screens come to disagree. */
  it("answers with the fallback where nothing is stored, and where a blank is", () => {
    expect(valueOf(retention, {})).toBe(365);
    expect(valueOf(retention, { "retention.days": "" })).toBe(365);
    expect(valueOf(retention, { "retention.days": 30 })).toBe(30);
  });

  /* ⚠️ The screens are derived, in declared order, and no app writes one. */
  it("sorts itself onto the right screen and page", () => {
    const book = { "retention.days": retention, theme };
    expect(settingsOn(book, "tenant").map((s) => s.id)).toEqual(["retention.days"]);
    expect(areasOn(book, AREAS, "person").map((a) => a.id)).toEqual(["appearance"]);
    expect(settingsIn(book, "person", "appearance").map((s) => s.id)).toEqual(["theme"]);
  });

  /*
    ⚠️ AN AREA A LEVEL DOES NOT USE IS NOT A PAGE FOR IT. Areas are declared once
    for the whole app, so listing all of them per level would offer a destination
    that opens onto nothing.
  */
  it("does not offer a page a level has nothing on", () => {
    const book = { "retention.days": retention, theme };
    expect(areasOn(book, AREAS, "tenant").map((a) => a.id)).toEqual(["data"]);
  });

  /*
    ⚠️ AND THE TWO WAYS AN AREA CAN BE WRONG ARE BOTH SILENT. A setting naming an
    area nothing declares would have rendered under a heading somebody typed by
    mistake; a declared area nothing uses is a nav row opening onto an empty page,
    and the first person to find out is whoever taps it.
  */
  it("refuses a setting on a page that does not exist, and a page with nothing on it", () => {
    const stray = setting({ ...retention, id: "stray", area: "nowhere" });
    expect(refuseSetting(stray, AREAS).map((p) => p.why)).toEqual(["unknown_area"]);
    expect(refuseSettings({ "retention.days": retention, theme }, AREAS).map((p) => p.why))
      .toEqual(["area_without_settings"]);
  });
});

/* ----------------------------------------------------------------- flags --- */

const trial = flag({
  id: "new-editor", label: "New editor", why: "Replacing the old one; on for volunteers.",
  stage: "trying", fallback: false, setBy: "person", retire: "2026-12-01" as Day,
});

describe("a switch that is ours", () => {
  /*
    ⚠️ THE DEPLOYMENT'S `off` IS ABSORBING. A flag exists so a thing can be turned
    off in a hurry — during an incident, on legal advice, because it is costing
    money — and one a tenant setting can beat does not work on the only day it is
    ever used.
  */
  it("cannot be turned back on by a tenant or a person once we kill it", () => {
    expect(resolve(trial, { deployment: false, tenant: true, person: true })).toBe(false);
    expect(settableBy(trial, { deployment: false })).toEqual(["operator"]);
  });

  it("lets each level narrow the one above it", () => {
    expect(resolve(trial, { deployment: true })).toBe(true);
    expect(resolve(trial, { deployment: true, tenant: false, person: true })).toBe(false);
    expect(resolve(trial, { deployment: true, tenant: true, person: false })).toBe(false);
  });

  /*
    ⚠️ A STORED VALUE IS HONOURED AT EVERY LEVEL, WHOEVER THE FLAG SAYS MAY SET
    IT. This asserted the opposite and the opposite is what broke releasing a
    feature: `resolve` discarded a workspace's row for a flag declaring
    `setBy: "operator"`, so a switch only WE control — which is most of them —
    could not be given to one customer at a time. That is the ordinary way a
    feature ships: to a workspace, then to more.

    ⚠️ WHO MAY WRITE IS A DIFFERENT QUESTION AND `settableBy` IS WHERE IT LIVES.
    A row exists only because somebody entitled to write it did; asking again
    while reading throws away decisions that were correctly made.
  */
  it("honours a workspace's row for a switch only we may set", () => {
    const ours = { ...trial, setBy: "operator" as const };
    expect(resolve(ours, { tenant: true })).toBe(true);
    expect(resolve(ours, { deployment: true, tenant: false })).toBe(false);
    /* ⚠️ And nobody below the operator may WRITE one. */
    expect(settableBy(ours)).toEqual(["operator"]);
  });

  /*
    ⚠️ AND A PERSON'S ROW IS THIS PERSON IN THIS WORKSPACE. Early access at one
    workspace is not early access at another — the workspace decided it, for
    somebody on its own roster. Keyed by account alone it would follow them into
    every other workspace they belong to.
  */
  it("lets a workspace give one of its own people a feature the rest do not have", () => {
    expect(resolve(trial, { tenant: true, person: false })).toBe(false);
    expect(resolve({ ...trial, fallback: false }, { tenant: false, person: true })).toBe(false);
    expect(resolve(trial, { person: true })).toBe(true);
  });

  /*
    ⚠️ A FLAG WITH NO RETIREMENT DATE IS A PERMANENT BRANCH nobody will ever
    delete, because deleting it means finding out who relies on it.
  */
  it("refuses to be tried indefinitely", () => {
    expect(refuseFlag({ ...trial, retire: undefined }).map((p) => p.why))
      .toEqual(["trying_without_a_date"]);
    expect(refuseFlag({ ...trial, stage: "on", retire: undefined })).toEqual([]);
  });

  /* ⚠️ Reported, never enforced. Withholding a capability because of a date
     somebody typed a year ago is an outage nobody asked for. */
  it("reports an overdue flag rather than switching it off", () => {
    expect(overdue({ f: trial }, "2027-01-01" as Day)).toEqual(["new-editor"]);
    expect(resolve(trial, { deployment: true })).toBe(true);
  });
});

/* ----------------------------------------------------------------- guide --- */

const steps = {
  invite: { id: "invite", label: "Invite somebody", why: "Two people is a workspace.",
    done: "member.invited", link: "/people", needs: "member:manage", order: 1 },
  brand: { id: "brand", label: "Add your logo", why: "It becomes theirs.",
    done: "brand.set", link: "/settings", order: 2 },
};

describe("the checklist", () => {
  /*
    ⚠️ COMPLETION IS DERIVED FROM WHAT HAPPENED. A step a screen ticks stays
    undone when the same thing is done from the API or from the second screen
    that also does it — and the person is then told to finish what they finished
    last week.
  */
  it("ticks itself off the event rather than off a visit", () => {
    const held = new Set(["member:manage"]);
    const raised = { workspace: ["member.invited"], person: [] };
    expect(remaining(steps, raised, held).map((s) => s.id)).toEqual(["brand"]);
    expect(progressOf(steps, raised, held)).toEqual({ done: ["invite"], total: 2 });
  });

  /*
    ⚠️ AND A WORKSPACE'S HISTORY DOES NOT TICK A STEP THAT IS THE PERSON'S. This
    is the whole reason the two axes exist: merged into one list, somebody
    invited into a workspace that has been running for a year opens a checklist
    already complete — congratulated for work they were not there for, and
    taught none of it.
  */
  it("does not credit a person with what the workspace did before they arrived", () => {
    const mine = {
      ...steps,
      learn: { id: "learn", label: "Send your first invitation", why: "Yours to send.",
        done: "member.invited", link: "/people", who: "person" as const, order: 3 },
    };
    const held = new Set(["member:manage"]);
    const raised = { workspace: ["member.invited"], person: [] };
    expect(remaining(mine, raised, held).map((s) => s.id)).toEqual(["brand", "learn"]);
    expect(progressOf(mine, raised, held).done).toEqual(["invite"]);
    /* ⚠️ AND THEIR OWN DOES, WITHOUT TOUCHING THE WORKSPACE'S. */
    const after = { workspace: ["member.invited"], person: ["member.invited"] };
    expect(remaining(mine, after, held).map((s) => s.id)).toEqual(["brand"]);
    expect(progressOf(mine, after, held).done).toEqual(["invite", "learn"]);
  });

  /*
    ⚠️ AND A BOOK WRITTEN BEFORE THE AXIS EXISTED KEEPS THE MEANING IT HAD. An
    absent `who` is "the workspace's", so nothing declared before this reads
    differently after it.
  */
  it("treats a step that never named an axis as the workspace's", () => {
    const held = new Set(["member:manage"]);
    expect(progressOf(steps, { workspace: ["brand.set"], person: [] }, held).done)
      .toEqual(["brand"]);
    expect(progressOf(steps, { workspace: [], person: ["brand.set"] }, held).done)
      .toEqual([]);
  });

  /*
    ⚠️ AND A STEP SOMEBODY COULD NOT DO IS NOT COUNTED AGAINST THEM. A checklist
    permanently at 3/5 because two items need a permission they do not hold is a
    checklist they learn to ignore.
  */
  it("does not hold somebody to a step they are not allowed to take", () => {
    expect(progressOf(steps, { workspace: [], person: [] }, new Set()))
      .toEqual({ done: [], total: 1 });
  });

  /* ⚠️ A step nothing can raise is stuck for ever, and the whole checklist then
     reads as broken because of one line. */
  it("refuses a step nothing can ever complete", () => {
    const why = refuseGuide(steps, {}, {}, ["member.invited"], ["/people", "/settings"],
      ["member:manage"], []).map((p) => p.why);
    expect(why).toContain("step_nothing_raises");
  });

  /*
    ⚠️ AND A STEP ONLY THE CLOCK CAN COMPLETE IS THE SAME FAULT ONE LEVEL DOWN.
    The event IS raised — by a nightly job — so the check above passes, and the
    step then sits unticked for ever because the tally counts what people did.
    A checklist credited to a sweep would be worse: somebody told they had
    finished a step they never took.
  */
  it("refuses a step only a job can complete", () => {
    const why = refuseGuide(
      { brand: steps.brand }, {}, {}, ["brand.set"], ["/settings"], [], [], [],
    ).map((p) => p.why);
    expect(why).toContain("step_only_a_clock_raises");
    expect(why).not.toContain("step_nothing_raises");
  });

  it("refuses a milestone only a job can reach", () => {
    const book = { nightly: { id: "nightly", label: "A hundred nights", said: "Steady.",
      on: "stock.expiring", tone: "info" as const, icon: "star" } };
    const why = refuseGuide({}, book, {}, ["stock.expiring"], [], [], [], []).map((p) => p.why);
    expect(why).toContain("milestone_only_a_clock_raises");
  });

  it("refuses a step that sends somebody to a screen that does not exist", () => {
    const why = refuseGuide({ invite: steps.invite }, {}, {}, ["member.invited"], ["/members"],
      ["member:manage"], []).map((p) => p.why);
    expect(why).toContain("dead_step_link");
  });

  /* ⚠️ Recognition is said once. Repeated on every load it is not recognition,
     it is noise. */
  it("congratulates once and then stops", () => {
    const book = { first: { id: "first", label: "First note", said: "Nice.", on: "note.created",
      tone: "success" as const, icon: "star" } };
    expect(reached(book, { "note.created": 1 }, []).map((m) => m.id)).toEqual(["first"]);
    expect(reached(book, { "note.created": 9 }, ["first"])).toEqual([]);
  });
});
