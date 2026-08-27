/**
 * THE MANIFEST REFUSALS — every one of which catches something that would
 * otherwise boot fine, serve fine, and be wrong.
 *
 * ⚠️ THAT IS THE STANDARD FOR BEING IN HERE. A mistake the compiler catches does
 * not need a refusal; a mistake that throws on the first request does not
 * either. What these prove is the class that passes every test: a permission no
 * role can hold, an entitlement nothing enforces, a quota nothing counts.
 */

import { describe, expect, it } from "vitest";
import {
  beneath, defineApp, isUnder, refuseApp, screenFor, upFrom, type AppSpec,
} from "../src/manifest.js";
import { operationsFor } from "../src/collection.js";
import { collection } from "../src/collection.js";
import { field } from "../src/field.js";
import { operation, PUBLIC, type AnyOperation, type Outcome } from "../src/operation.js";

const note = collection({
  id: "note",
  label: { one: "Note", many: "Notes" },
  scope: { of: "tenant" },
  permission: "note",
  retention: null,
  onClose: { then: "purge" },
  fields: { title: field.text({ label: "Title", required: true, holds: "none", max: 200 }) },
});

const stub = operation({
  id: "note.publish",
  kind: "write",
  summary: "Publish one.",
  input: { id: field.text({ label: "Id", required: true, holds: "none" }) },
  output: { id: field.text({ label: "Id", holds: "none" }) },
  permission: "note:write",
  idempotency: { mode: "none" },
  outcome: { message: "Published.", tone: "success" },
  async handler() { return { id: "n1" }; },
}) as unknown as AnyOperation;

/** Everything an app needs that is not what a given test is about. */
const app = (over: Partial<AppSpec> = {}): AppSpec => ({
  id: "probe",
  name: "Probe",
  mark: "◆",
  /* ⚠️ The app's OWN keys only (D15): workspace authority — members, settings,
     the bill — is the platform's, and an app that declared those keys would be
     one whose roles could mint managers. */
  access: {
    permissions: ["note:read", "note:write"],
    roles: { editor: ["note:read", "note:write"], reader: ["note:read"] },
    founding: "editor",
    seats: { counts: ["owner", "manager", "staff"], entitlement: "seats" },
  },
  /* ⚠️ `seats` IS THE PLATFORM'S AND IS NOT DECLARED HERE. An app references it
     (`access.seats.entitlement`) without owning it — see `PLATFORM_ENTITLEMENTS`. */
  entitlements: {
    notes: { label: "Notes", withheld: "quota" },
  },
  collections: [{ ...note, quota: "notes" }],
  operations: [stub],
  screens: [{ id: "notes", route: "/", label: "Notes", nav: "primary", permission: "note:read" }],
  ...over,
});

const whyOf = (spec: AppSpec) => refuseApp(spec).map((r) => r.why).join(" | ");

describe("an app that composes", () => {
  it("accepts one where everything sold is enforced and everything declared is reachable", () => {
    expect(refuseApp(app())).toEqual([]);
    expect(() => defineApp(app())).not.toThrow();
  });

  /* ⚠️ Every refusal at once. Stopping at the first turns fixing a manifest into
     a conversation of one sentence at a time. */
  it("reports every fault in one pass", () => {
    const broken = app({
      /* Three unrelated faults: an unholdable key, no catalogue at all, and a
         screen asking for a permission nothing declares. */
      access: { ...app().access, permissions: [...app().access.permissions, "ghost:read"] },
      screens: [{ id: "x", route: "/x", label: "X", permission: "phantom:read" }],
    });
    const why = refuseApp(broken).map((r) => r.why);
    expect(why.some((w) => w.includes("ghost:read"))).toBe(true);
    expect(why.some((w) => w.includes("phantom:read"))).toBe(true);
  });

  /*
    ⚠️ A WRITE SAYS SOMETHING WHEN IT WORKED, OR SAYS WHY NOT. `outcome` was
    optional and fifteen of fifty writes said nothing at all — not because
    anybody chose silence for them, but because a field nobody has to fill is a
    field that stays empty. Somebody pressed a button and waited, and the
    product's answer was that the screen looked the same.

    ⚠️ AND SILENCE IS OFTEN CORRECT, WHICH IS WHY THE ESCAPE IS A SENTENCE
    RATHER THAN A FLAG. "n/a" is how a required field becomes optional again, so
    a reason too short to be one is refused as well.
  */
  const quiet = (over: Record<string, unknown>) =>
    ({ ...stub, ...over } as unknown as AnyOperation);

  it("refuses a write that neither reports nor says why not", () => {
    const { outcome: _gone, ...mute } = stub as unknown as Record<string, unknown>;
    const why = refuseApp(app({ operations: [mute as unknown as AnyOperation] })).map((r) => r.why);
    expect(why.some((w) => w.includes("unreported_write"))).toBe(true);
  });

  it("refuses a reason that is a label rather than a reason", () => {
    const why = refuseApp(app({ operations: [quiet({ outcome: { why: "n/a" } })] }))
      .map((r) => r.why);
    expect(why.some((w) => w.includes("unreported_write"))).toBe(true);
  });

  it("accepts a stated silence", () => {
    const said = quiet({
      outcome: { why: "the answer IS the report — it returns what it worked out" },
    });
    expect(refuseApp(app({ operations: [said] }))).toEqual([]);
  });
});

/* ------------------------------------------------------- nobody can reach --- */

describe("what nobody could ever reach", () => {
  /*
    ⚠️ A DECLARED KEY NO ROLE HOLDS REFUSES EVERY CALLER, FOR EVER — the owner
    included — and the 403 is indistinguishable from one somebody forgot to
    grant. It reads exactly like a feature nobody uses.
  */
  it("refuses a permission no app role holds", () => {
    const broken = app({ access: { ...app().access, permissions: [...app().access.permissions, "ghost:read"] } });
    expect(whyOf(broken)).toContain("no app role holds it");
  });

  /* ⚠️ And the mirror: a role holding a key nothing declares grants nothing, and
     looks from both sides like access somebody has. */
  it("refuses a role that holds a key nothing declares", () => {
    const broken = app({
      access: { ...app().access, roles: { ...app().access.roles, editor: ["note:read", "ghost:write"] } },
    });
    expect(whyOf(broken)).toContain("not a declared permission");
  });

  /*
    ⚠️ AN APP CLAIMING A PLATFORM KEY WOULD LET A PRODUCT UPDATE QUIETLY MINT
    WORKSPACE MANAGERS (D15). Naming one on a screen is legal — "the money
    screen needs billing:read" — declaring or bundling it is not.
  */
  it("refuses an app that declares or bundles a platform key", () => {
    const declared = app({
      access: { ...app().access, permissions: [...app().access.permissions, "member:manage"] },
    });
    expect(whyOf(declared)).toContain("the platform's");
    const bundled = app({
      access: { ...app().access, roles: { ...app().access.roles, editor: ["note:read", "note:write", "member:manage"] } },
    });
    expect(whyOf(bundled)).toContain("the platform's");
  });

  /* ...and a screen may NAME one, because the surface is where a platform
     permission is legitimately asked about. */
  it("accepts a screen that names a platform key", () => {
    const ok = app({
      screens: [...app().screens,
        { id: "people", route: "/people", label: "People", permission: "member:read" as const }],
    });
    expect(refuseApp(ok)).toEqual([]);
  });

  it("refuses a founding role that is not declared, and seat counts that are not platform roles", () => {
    const ghost = app({ access: { ...app().access, founding: "ghost" } });
    expect(whyOf(ghost)).toContain('founding role "ghost"');
    const seats = app({ access: { ...app().access, seats: { counts: ["editor"], entitlement: "seats" } } });
    expect(whyOf(seats)).toContain("not a platform role");
    /* ⚠️ Customers are the product, not the staff — a seat ceiling on them gates
       the workspace on the people it exists to serve. */
    const customers = app({ access: { ...app().access, seats: { counts: ["customer"], entitlement: "seats" } } });
    expect(whyOf(customers)).toContain("never cost a seat");
  });

  it("refuses an operation whose permission nothing holds", () => {
    const broken = app({
      operations: [{ ...stub, permission: "ghost:write" } as AnyOperation],
    });
    expect(whyOf(broken)).toContain("ghost:write");
  });

  /*
    ⚠️ SOMEBODY MUST BE ABLE TO USE A NEW TENANT'S APP. The platform makes the
    creator an `owner` — running the workspace is its authority — but with no
    app roles at all there is nothing for them to BE in the product: every app
    request 403s while the tenant row, the tables and the session are all
    perfectly correct.
  */
  it("refuses an app with no roles for a founder to hold", () => {
    const broken = app({
      access: {
        permissions: [],
        roles: {},
        seats: { counts: [], entitlement: "seats" },
      },
      collections: [note],
      operations: [],
      entitlements: {},
      screens: [],
    });
    expect(whyOf(broken)).toContain("nobody in it");
  });

  /* ⚠️ PUBLIC means "the session decides" and is not a hole — it is how the
     operations about yourself are declared, and they are reachable by design. */
  it("accepts PUBLIC without demanding a role for it", () => {
    const ok = app({ operations: [{ ...stub, permission: PUBLIC } as AnyOperation] });
    expect(refuseApp(ok)).toEqual([]);
  });
});

/* ---------------------------------------------------------- sold and kept --- */

describe("what is sold and what is kept", () => {
  /*
    ⚠️ AN ENTITLEMENT NOTHING WITHHOLDS FAILS IN THE GENEROUS DIRECTION: the
    customer gets it anyway, so nobody reports it and nothing goes red. It is
    money taken for a promise nothing keeps.
  */
  it("refuses an entitlement no gate and no quota names", () => {
    const broken = app({
      entitlements: { ...app().entitlements, exports: { label: "Exports", withheld: "gate" } },
    });
    expect(whyOf(broken)).toContain("nothing withholds it");
  });

  /*
    ⚠️ AN APP MAY NOT DECLARE WHAT THE PLATFORM SELLS. The roster is the
    workspace's and `member.invite` is the engine's gate — two products each
    declaring `seats` is two answers to how many people a workspace may have,
    and whichever composed first would win.
  */
  it("refuses an app that declares a key the platform sells", () => {
    const broken = app({
      entitlements: { ...app().entitlements, seats: { label: "Seats", withheld: "quota" } },
    });
    expect(whyOf(broken)).toContain("the platform's to sell");
  });

  /* ⚠️ `reserved` is the one exemption, and it is written down rather than
     inferred from a plan happening not to mention the key. */
  it("lets a reserved key be sold by nobody and checked by nothing", () => {
    const ok = app({
      entitlements: { ...app().entitlements, chat: { label: "Chat", withheld: "gate", reserved: true } },
    });
    expect(refuseApp(ok)).toEqual([]);
  });

  /* ⚠️ A quota naming no entitlement is a ceiling nothing counts — it reports the
     obligation on every write and discharges it as "fine". */
  it("refuses a collection counting against a key no plan sells", () => {
    const broken = app({ collections: [{ ...note, quota: "ghosts" }] });
    expect(whyOf(broken)).toContain("which nothing declares");
  });
});

/* -------------------------------------------------------------- the shape --- */

describe("what would fail on the first request", () => {
  it("refuses a reference pointing at no collection", () => {
    const broken = app({
      collections: [{ ...note, quota: "notes", fields: {
        ...note.fields,
        parent: field.ref({ label: "Parent", to: "ghost", holds: "none" }),
      } }],
    });
    expect(whyOf(broken)).toContain("points at no collection");
  });

  /*
    ⚠️ THIS ONE IS A 503 ON EVERY DOOR, NOT A BROKEN SCREEN. `from` passes the
    field-name pattern and produces `CREATE TABLE note (…, from TEXT, …)`, which
    SQLite will not parse — so the DDL batch throws, `ensureSchema` throws with
    it, and every route that touches the database answers 503. It was found by
    naming a test fixture's reference `from`, which is exactly how a real
    manifest would find it: the word is the obvious name for where something
    came from.
  */
  it("refuses a field named after a word SQL already means something by", () => {
    const broken = app({
      collections: [{ ...note, quota: "notes", fields: {
        ...note.fields,
        from: field.text({ label: "From", holds: "none", max: 40 }),
      } }],
    });
    expect(whyOf(broken)).toContain("SQL already means something by");
  });

  /* ⚠️ AND A COLLECTION ID BECOMES A TABLE NAME, WHICH BREAKS THE SAME WAY.
     `CREATE TABLE order (…)` is the same unparseable statement one level up. */
  it("refuses a collection named after one too", () => {
    expect(whyOf(app({ collections: [{ ...note, id: "order", quota: "notes" }] })))
      .toContain("SQL already means something by");
  });

  /*
    ⚠️ AND CASE DOES NOT SAVE IT. SQL keywords are not case-sensitive, so `orDer`
    is the same keyword and the same unparseable statement. The spelling here is
    one nobody would choose deliberately — which is the point: the check is about
    the WORD, and a comparison against the string as written would pass this and
    then break a database.
  */
  it("refuses it however it is capitalised", () => {
    const broken = app({
      collections: [{ ...note, quota: "notes", fields: {
        ...note.fields,
        orDer: field.number({ label: "Order", holds: "none" }),
      } }],
    });
    expect(whyOf(broken)).toContain("SQL already means something by");
  });

  /*
    ⚠️ A FILL NAMING A FIELD THE OPERATION DOES NOT TAKE IS A VALUE THAT GOES
    NOWHERE. The door drops an input it never declared, so the act runs missing
    the thing the screen was supposed to supply and refuses with the field marked
    required and nothing in it — which reads as the person having left a box
    empty in a form that never drew one.
  */
  it("refuses a fill for an input the operation does not take", () => {
    const acting = {
      id: "one", route: "/one", label: "One", permission: "note:read", of: "note",
      body: {
        shape: "detail", layout: { as: "stack" },
        blocks: [{
          block: "NoteRow",
          does: [{ op: stub.id, fills: { imagined: "record" } }],
          bind: { children: { from: { of: "words", says: "One" } } },
        }],
      },
    };
    expect(whyOf(app({ screens: [acting] as never }))).toContain("fills_field_unknown");
  });

  /* ⚠️ AND A SCREEN THAT IS ABOUT NOTHING HAS NO RECORD TO FILL FROM. The value
     would be undefined, the field would arrive empty, and the act would refuse
     for want of a thing the screen was supposed to know. */
  it("refuses a fill from the record on a screen with no subject", () => {
    const acting = {
      id: "one", route: "/one", label: "One", permission: "note:read",
      body: {
        shape: "detail", layout: { as: "stack" },
        blocks: [{
          block: "NoteRow",
          does: [{ op: stub.id, fills: { note: "record" } }],
          bind: { children: { from: { of: "words", says: "One" } } },
        }],
      },
    };
    expect(whyOf(app({ screens: [acting] as never }))).toContain("fill_without_a_subject");
  });

  /*
    ⚠️ THE THREE HALVES OF AN ASKED VIEW THAT NEED THE OPERATION ITSELF — see
    `AskedSpec`. Each produces a screen that draws: a view that answers nothing,
    a list that is empty over a workspace that is not, or — the sharp one — a
    WRITE that fires every time somebody opens the page.
  */
  const asking = (asked: Record<string, unknown>) => app({
    views: [{ id: "asked-notes", of: "note", asked } as never],
    screens: [{
      id: "one", route: "/one", label: "One", permission: "note:read",
      body: {
        shape: "list", layout: { as: "stack" },
        blocks: [{
          block: "Listing",
          nothing: { says: "None" },
          bind: {
            label: { from: { of: "words", says: "Notes" } },
            of: { from: { of: "view", view: "asked-notes" } },
          },
        }],
      },
    }] as never,
  });

  it("refuses a view answered by an operation this app does not declare", () => {
    expect(whyOf(asking({ operation: "note.imagined", take: "items" })))
      .toContain("asked_operation_unknown");
  });

  /* ⚠️ THE SHARPEST OF THE THREE. A body is drawn on arrival, so a write here
     runs on every navigation, on every re-read after an act, and twice in a
     browser that mounts a tree twice. */
  it("refuses one answered by a write", () => {
    expect(whyOf(asking({ operation: stub.id, take: "id" }))).toContain("asked_not_a_read");
  });

  it("refuses one taking a field the operation does not answer with", () => {
    expect(whyOf(asking({ operation: stub.id, take: "imagined" })))
      .toContain("asked_take_unknown");
  });

  /*
    ⚠️ A FILL FROM A COLUMN THE SUBJECT HAS NOT GOT IS THE SAME FAILURE AS ONE
    NAMING AN INPUT THAT IS NOT THERE, from the other end: the input is real and
    the value going into it is undefined, so the act refuses for want of a field
    the form never drew.
  */
  const filling = (fills: Record<string, unknown>, of?: string) => whyOf(app({
    screens: [{
      id: "one", route: "/one", label: "One", permission: "note:read",
      ...(of ? { of } : {}),
      body: {
        shape: "detail", layout: { as: "stack" },
        blocks: [{
          block: "NoteRow",
          does: [{ op: stub.id, fills }],
          bind: { children: { from: { of: "words", says: "One" } } },
        }],
      },
    }] as never,
  }));

  /*
    ⚠️ WHAT A PICKER PUTS ON THE ROW — see `CollectionSpec.names`. All three of
    these produce a control full of blanks rather than an error: a name that is
    not a field resolves to undefined on every option, and a number in a dropdown
    is an identifier standing where a name should be.
  */
  const naming = (names: string, fields = note.fields) =>
    whyOf(app({ collections: [{ ...note, quota: "notes", names, fields }] }));

  it("accepts a collection naming its rows by a text field", () => {
    expect(naming("title")).not.toContain("names_unknown");
  });

  it("refuses one naming a field it has not got", () => {
    expect(naming("nowhere")).toContain("names_unknown");
  });

  it("refuses one naming a number", () => {
    const fields = {
      ...note.fields, size: field.number({ label: "Size", holds: "none" }),
    };
    expect(naming("size", fields)).toContain("names_not_words");
  });

  it("accepts a fill from a column the subject has", () => {
    expect(filling({ id: { field: "title" } }, "note")).not.toContain("fill_without_a_subject");
  });

  it("refuses a fill from a column it has not", () => {
    expect(filling({ id: { field: "nowhere" } }, "note")).toContain("fill_without_a_subject");
  });

  /* ⚠️ AND A COLUMN NEEDS A ROW, exactly as the id does. */
  it("refuses a fill from a column on a screen with no subject", () => {
    expect(filling({ id: { field: "title" } })).toContain("fill_without_a_subject");
  });

  /* ⚠️ A LITERAL NEEDS NOTHING — it is a constant the manifest wrote down. */
  it("accepts a literal on a screen about nothing", () => {
    expect(filling({ id: { says: "typed" } })).not.toContain("fill_without_a_subject");
  });

  /*
    ⚠️ A FLOW AND A SESSION KEEP THEIR CONTROLS AND NOT THEIR CLAIMS — see
    `SessionSpec`. `StorySpec` has claimed since it was written that a guard
    proves `writes` is a real operation and that the screen's permission is the
    one it demands. Nothing did, and the first product it was pointed at had a
    screen offered on a grant its write refuses.
  */
  const flowing = (over: Record<string, unknown>) => whyOf(app({
    screens: [{
      id: "one", route: "/one", label: "One", permission: "note:write", ...over,
    }] as never,
  }));

  it("accepts a story reaching a write on the grant that write demands", () => {
    expect(flowing({ story: { writes: stub.id, asks: [{ id: "a", ask: "What is it?", takes: ["id"] }] } }))
      .toBe("");
  });

  /* ⚠️ THE SHARP ONE, AND IT FAILS LATE. An unknown id is a 404 on the first
     press; a permission that does not match is every question answered and a
     refusal at the last one, which reads as the platform being broken. */
  it("refuses a story offered on a grant its write does not demand", () => {
    expect(flowing({
      permission: "note:read",
      story: { writes: stub.id, asks: [{ id: "a", ask: "What is it?", takes: ["id"] }] },
    })).toContain("story_permission_wrong");
  });

  it("refuses a flow writing an operation this app does not declare", () => {
    expect(flowing({ story: { writes: "note.imagined", asks: [] } }))
      .toContain("story_write_unknown");
  });

  it("accepts a session writing several things", () => {
    expect(flowing({
      session: {
        by: "camera", writes: [stub.id],
        keeps: [{ id: "held", is: "the thing in somebody's hand", until: "once" }],
      },
    })).toBe("");
  });

  it("refuses a session that writes nothing", () => {
    expect(flowing({ session: { by: "hand", writes: [], keeps: [] } }))
      .toContain("session_writes_nothing");
  });

  /*
    ⚠️ AND A SESSION IS NOT HELD TO ITS WRITES' GRANTS, deliberately. Scanning is
    a reading screen that can also teach a code; the label sheet is `location:read`
    because anybody may look at it and minting is what the writes ask for. The
    story's rule would refuse both, correctly declared.
  */
  it("does not hold a session to the grant its writes demand", () => {
    expect(flowing({
      permission: "note:read",
      session: { by: "camera", writes: [stub.id], keeps: [] },
    })).not.toContain("session_permission_wrong");
  });

  it("refuses a session keeping something it will not say the meaning of", () => {
    expect(flowing({
      session: { by: "hand", writes: [stub.id], keeps: [{ id: "x", is: "  ", until: "once" }] },
    })).toContain("session_kept_unsaid");
  });

  it("refuses a failure code no catalogue has", () => {
    const broken = app({ operations: [{ ...stub, fails: ["app.imagined"] } as AnyOperation] });
    expect(whyOf(broken)).toContain("which no catalogue has");
  });

  /* ⚠️ A product that could reword "payment required" could describe its own
     arrears as something reassuring, to staff who would then not act on it. */
  it("refuses an app rewording a platform refusal", () => {
    const broken = app({
      problems: { "platform.forbidden": { status: 403, title: "All good", retryable: false, tone: "success" } },
    });
    expect(whyOf(broken)).toContain("may not reword it");
  });

  /* ⚠️ Past five, a bottom bar stops being tappable and becomes a menu (D10). */
  it("refuses a sixth primary destination", () => {
    const six = Array.from({ length: 6 }, (_, i) => ({
      id: `s${i}`, route: i === 0 ? "/" : `/s${i}`, label: `S${i}`,
      nav: "primary" as const, permission: "note:read",
    }));
    expect(whyOf(app({ screens: six }))).toContain("the ceiling is 5");
  });

  /*
    ⚠️ THE FIRST DESTINATION IS HOME. Where a thumb lands, where a cold start
    points and what "back to the beginning" means are one place — an app whose
    first tap is not its own root opens on one screen and offers a different one
    as its beginning.
  */
  it("refuses a first destination that is not the app's root", () => {
    const away = app({
      screens: [
        { id: "list", route: "/list", label: "List", nav: "primary" as const,
          permission: "note:read" },
        { id: "home", route: "/", label: "Home", nav: "primary" as const,
          permission: "note:read" },
      ],
    });
    expect(whyOf(away)).toContain("home is the app's own root");
  });

  /* ⚠️ AND AN APP WITH NO DESTINATIONS IS NOT REFUSED FOR IT. A product whose
     every screen is reached from a subject is a real shape — the check is about
     the FIRST of a list, and an empty list has no first. */
  it("says nothing about the first destination of an app that has none", () => {
    const none = app({
      screens: [{ id: "thing", route: "/thing", label: "A thing", nav: "none" as const,
        permission: "note:read" }],
    });
    expect(whyOf(none)).not.toContain("home is the app's own root");
  });

  /*
    ⚠️ THE CHROME HAS ONE SLOT FOR EACH, so a second claim is a declaration the
    surface silently drops — the shape where an author is certain they shipped
    something and nobody can see it.
  */
  it("refuses two screens claiming the same chrome slot", () => {
    const twice = app({
      screens: [
        { id: "home", route: "/", label: "Home", nav: "primary" as const,
          permission: "note:read" },
        { id: "find", route: "/find", label: "Find", chrome: "search" as const,
          permission: "note:read" },
        { id: "look", route: "/look", label: "Look", chrome: "search" as const,
          permission: "note:read" },
      ],
    });
    expect(whyOf(twice)).toContain('2 screens claim "search"');
  });

  /* ⚠️ AND A CHROME SCREEN IS NOT ALSO A DESTINATION. Drawn in both it is one
     place advertised twice, and the bar's scarcest slot is spent on what the
     crown already offers from everywhere. */
  it("refuses a chrome screen that is also in the navigation", () => {
    const both = app({
      screens: [
        { id: "home", route: "/", label: "Home", nav: "primary" as const,
          permission: "note:read" },
        { id: "ask", route: "/ask", label: "Ask", nav: "primary" as const,
          chrome: "assistant" as const, permission: "note:read" },
      ],
    });
    expect(whyOf(both)).toContain("the chrome already offers it");
  });

  it("refuses a screen needing a permission nothing declares", () => {
    const broken = app({
      screens: [{ id: "x", route: "/x", label: "X", permission: "ghost:read" }],
    });
    expect(whyOf(broken)).toContain("not a declared permission");
  });
});

/* ------------------------------------------------- what nothing reaches --- */

describe("a declaration that reaches no surface", () => {
  const told = {
    "note.shared": {
      id: "note.shared", label: "Shared", summary: "Somebody shared a note.",
      category: "activity" as const, author: "theirs" as const, tone: "info" as const, icon: "share",
      needs: "note:read", on: "note.shared", link: "/",
      variables: [], channels: ["inbox" as const, "email" as const],
    },
  };
  const emits = [{ ...stub, emits: ["note.shared"] } as AnyOperation];

  it("accepts a notification whose audience holds a key and whose event is raised", () => {
    expect(refuseApp(app({ notifications: told, operations: emits }))).toEqual([]);
  });

  /*
    ⚠️ A NOTIFICATION NOTHING RAISES RENDERS IN THE POLICY SCREEN, IS SWITCHED ON,
    AND NEVER ARRIVES. The person concludes the product is broken and stops
    trusting the notifications that do work.
  */
  it("refuses a notification waiting for an event nothing raises", () => {
    expect(whyOf(app({ notifications: told }))).toContain("can never arrive");
  });

  /* ⚠️ Addressed to a key nothing declares, its audience is empty on every
     dispatch — and the dispatch reports success. */
  it("refuses a notification addressed to a permission nothing declares", () => {
    const wrong = { x: { ...told["note.shared"], needs: "ghost:read" } };
    expect(whyOf(app({ notifications: wrong, operations: emits }))).toContain("audience is always empty");
  });

  it("refuses a notification pointing at a screen that does not exist", () => {
    const wrong = { x: { ...told["note.shared"], link: "/ghosts" } };
    expect(whyOf(app({ notifications: wrong, operations: emits }))).toContain("not a screen");
  });

  /*
    ⚠️ A FLAG NOTHING IS BEHIND IS A SWITCH THAT DOES NOTHING — worse than an
    absent feature, because somebody turns it on and stops watching for the
    problem it claimed to solve.
  */
  it("refuses a flag no operation and no screen is behind", () => {
    const flags = { "new-thing": { id: "new-thing", label: "New", why: "Trying it.",
      stage: "on" as const, fallback: false, setBy: "operator" as const } };
    expect(whyOf(app({ flags }))).toContain("switching it changes nothing");
    expect(refuseApp(app({
      flags,
      operations: [{ ...stub, flag: "new-thing" } as AnyOperation],
    }))).toEqual([]);
  });

  it("refuses an operation behind a flag nothing declares", () => {
    expect(whyOf(app({ operations: [{ ...stub, flag: "ghost" } as AnyOperation] })))
      .toContain("is read and nothing declares it");
  });

  /*
    ⚠️ A VAULT-BACKED COLUMN HOLDS A POINTER. With no vault field behind it the
    pointer points at nothing — and it renders as a value somebody never filled
    in, which is indistinguishable from a fact they declined to give.
  */
  it("refuses a vault-backed field with nothing in the vault behind it", () => {
    const broken = app({
      collections: [{ ...note, quota: "notes", fields: {
        ...note.fields,
        conditions: field.text({ label: "Conditions", holds: "sensitive", vault: true }),
      } }],
    });
    expect(whyOf(broken)).toContain("the column would point at nothing");
  });

  /* ⚠️ And the mirror: a key gated by a route that no plan sells is a gate
     nobody can ever pass, which reads as a feature that is simply broken. */
  it("refuses an entitlement that is enforced and never sold", () => {
    expect(whyOf(app({ operations: [{ ...stub, entitlement: "ghosts" } as AnyOperation] })))
      .toContain("is enforced and nothing sells it");
  });

  /*
    ⚠️ AND A SCREEN GATED ON A KEY NO PLAN SELLS IS A DESTINATION NOBODY EVER
    SEES. It fails in the direction that produces no complaint — the screen is
    simply absent, on every tier, and the declaration reads as if it were there.
  */
  it("refuses a screen gated on an entitlement nothing sells", () => {
    expect(whyOf(app({
      screens: [{ ...app().screens[0]!, features: ["ghosts"] }],
    }))).toContain(`is gated on "ghosts" and nothing sells it`);
  });

  /* ⚠️ Any-of over nothing is false, so an empty list is a gate no plan can
     satisfy — which at the call site reads like no gate at all. */
  it("refuses a screen that names an empty feature list", () => {
    expect(whyOf(app({
      screens: [{ ...app().screens[0]!, features: [] }],
    }))).toContain("no plan can satisfy");
  });

  /*
    ⚠️ AND A SCREEN DOES NOT COUNT AS ENFORCEMENT. Hiding a nav row leaves the
    operations behind it callable, so a key whose only mention is a screen is
    still sold and withheld by nothing — which is what this asserts, in the
    direction that keeps the other check honest.
  */
  it("does not let a screen stand in for a gate", () => {
    expect(whyOf(app({
      entitlements: { extras: { label: "Extras", withheld: "gate" } },
      screens: [{ ...app().screens[0]!, features: ["extras"] }],
    }))).toContain("is sold and nothing withholds it");
  });
});

/* ---------------------------------------------------------------- surface --- */

/*
  ⚠️ ASSERTED THROUGH `operationsFor`, WHICH IS WHAT COMPOSES THE SURFACE. There
  was a `surfaceOf` here that answered the same question from the manifest alone
  — and answered it WRONGLY, because an app also answers on the roster, the
  package rail, its settings and its bill, none of which it declares. A second
  answer that is smaller than the real one is the shape this tree refuses.
*/
describe("what an app answers on", () => {
  it("derives every route from the declarations alone", () => {
    const spec = app();
    const on = [...spec.collections.flatMap(operationsFor), ...spec.operations.map((o) => o.id)];
    expect(on.sort()).toEqual([
      "note.create", "note.delete", "note.list", "note.publish", "note.read", "note.update",
    ]);
  });

  /*
    ⚠️ `without` IS AN OPT-OUT, AND THE DIRECTION IS THE SAFETY. Opting in means
    a collection whose author forgot `delete` has no way to remove a record —
    discovered by a customer. Opting out is deliberate and visible in review.
  */
  it("drops only the verbs a collection opts out of", () => {
    const roster = app({ collections: [{ ...note, quota: "notes", without: ["create"] }] });
    const on = roster.collections.flatMap(operationsFor);
    expect(on).not.toContain("note.create");
    expect(on).toContain("note.update");
  });
});

/**
 * A SCREEN'S ADDRESS CARRIES WHAT IT IS ABOUT.
 *
 * ⚠️ THREE FUNCTIONS, TWO PACKAGES, ONE ANSWER. The Shell decides which nav item
 * is lit and the surface decides which screen is drawn, and before this they
 * each did it with `route === here` — so opening a record left the bar with
 * nothing marked AND drew the list the record was opened from. Two bugs, one
 * cause, and neither is visible without a router.
 *
 * ⚠️ AND THE ROOT IS THE TRAP. `/` is a prefix of every path there is, so a rule
 * written as `startsWith` alone makes the root screen answer for every detail
 * screen declared beside it.
 */
describe("which screen an address belongs to", () => {
  const SCREENS = [
    { route: "/", id: "stock" },
    { route: "/thing", id: "product" },
    { route: "/thing/history", id: "history" },
    { route: "/where", id: "location" },
  ] as const;

  it("is under a screen at its own address and beneath it", () => {
    expect(isUnder("/thing", "/thing")).toBe(true);
    expect(isUnder("/thing", "/thing/t-glove")).toBe(true);
    /* ⚠️ A SIBLING WHOSE NAME STARTS THE SAME IS NOT BENEATH IT. `/things` is a
       different screen, and a bare `startsWith` would hand it this one's id. */
    expect(isUnder("/thing", "/things")).toBe(false);
    expect(isUnder("/thing", "/where")).toBe(false);
  });

  it("never treats the root as a prefix of everything", () => {
    expect(isUnder("/", "/")).toBe(true);
    expect(isUnder("/", "/thing")).toBe(false);
    expect(screenFor(SCREENS, "/thing/t-glove")?.id).toBe("product");
  });

  it("answers with the most specific screen rather than the first", () => {
    expect(screenFor(SCREENS, "/thing/history/t-glove")?.id).toBe("history");
    expect(screenFor(SCREENS, "/thing")?.id).toBe("product");
    expect(screenFor(SCREENS, "/")?.id).toBe("stock");
  });

  it("has no screen for an address no declaration covers", () => {
    expect(screenFor(SCREENS, "/nowhere")).toBeUndefined();
  });

  it("hands a screen the segments past its own route", () => {
    expect(beneath("/thing", "/thing/t-glove")).toEqual(["t-glove"]);
    expect(beneath("/thing", "/thing")).toEqual([]);
    expect(beneath("/", "/")).toEqual([]);
    /* ⚠️ MORE THAN ONE, because a screen may be about more than one thing — a
       product ON a shelf is both, and a single `id` would have grown a query
       string, which is the one part of an address nothing here parses. */
    expect(beneath("/thing", "/thing/t-glove/p-a1")).toEqual(["t-glove", "p-a1"]);
    /* ⚠️ Nothing at all for an address this screen does not own, rather than a
       confident slice of somebody else's path. */
    expect(beneath("/thing", "/where/p-a1")).toEqual([]);
  });
});

/**
 * WHAT IS ABOVE A SCREEN — the arrow in its crown, and where its record goes
 * when it is put away.
 *
 * ⚠️ ONE QUESTION, SO ONE WALK. The renderer derived this twice: once to decide
 * where a deleted record leaves to, and it was about to derive it again for the
 * back control. Two walks is how the arrow and the disappearing record come to
 * land in different places on the same screen — and neither is visible without
 * clicking both.
 */
describe("what is above a screen", () => {
  /*
    ⚠️ THE LISTS DECLARE WHERE THEIR ROWS GO, WHICH IS WHAT MAKES THIS FIXTURE
    LIKE A MANIFEST. It used to give the list screen `of: "product"` and nothing
    else, and that is the shape no manifest has ever had: `of` means "the record
    this screen is ABOUT", which is false of a catalogue. So the branch this
    tested was reached by the fixture and by nothing in any product — every
    sub-page in the tree went back to home whatever it was a sub-page of, with
    this test green the whole time. A fixture shaped unlike the thing it stands
    for is a test that proves the test.
  */
  const opens = (to: string) => ({
    shape: "list" as const,
    layout: { as: "stack" as const },
    blocks: [{
      block: "Listing", goes: to, nothing: { says: "None" },
      bind: { rows: { from: { of: "view" as const, view: "all" } } },
    }],
  });
  const SCREENS = [
    { route: "/", id: "home", nav: "primary" as const },
    { route: "/stock", id: "stock", nav: "primary" as const, of: "stock" },
    { route: "/things", id: "things", nav: "none" as const, body: opens("product") },
    { route: "/thing", id: "product", nav: "none" as const, of: "product",
      body: { shape: "detail" as const, layout: { as: "stack" as const }, blocks: [] } },
    { route: "/report", id: "report", nav: "none" as const,
      body: { shape: "figure" as const, layout: { as: "stack" as const }, blocks: [] } },
  ];

  it("leads a record's screen back to the list whose rows open it", () => {
    expect(upFrom(SCREENS, SCREENS[3]!)?.id).toBe("things");
  });

  /* ⚠️ THE FIVE THE BAR NAVIGATES BETWEEN ARE NOT SOMEWHERE YOU WENT. A back
     arrow on a destination is a way out of a place you did not enter, and it
     would take the account with it — `crownFor` leads with a face or with a way
     out, never both. */
  it("gives a destination nothing above it", () => {
    expect(upFrom(SCREENS, SCREENS[0]!)).toBeUndefined();
    expect(upFrom(SCREENS, SCREENS[1]!)).toBeUndefined();
  });

  /* ⚠️ AND HOME IS THE FALLBACK RATHER THAN NOTHING. A screen reached from a
     search or a shortcut has no listing above it and still has to be leavable. */
  it("falls back to the app's own root", () => {
    expect(upFrom(SCREENS, SCREENS[4]!)?.id).toBe("home");
  });

  /* ⚠️ AND A LISTING IS NEVER ABOVE ITSELF, which `s !== screen` is the whole of
     — a list that opened its own rows would match its own condition, and the
     catalogue's back arrow would reload the catalogue. */
  it("never leads a listing back to itself", () => {
    const loop = [...SCREENS, { route: "/loop", id: "loop", nav: "none" as const,
      of: "product", body: opens("loop") }];
    /* ⚠️ HOME, and without `s !== screen` it would be `loop` — the screen
       reloading itself, which is what a back arrow must never do. */
    expect(upFrom(loop, loop[5]!)?.id).toBe("home");
  });

  /* ⚠️ AND A LIST THAT LEADS SOMEWHERE ELSE IS NOT ABOVE THIS ONE. Matching on
     the collection rather than on the LINK would put the shelf list above a
     product page and above a count, because both are `of` something a stock line
     mentions. */
  it("ignores a list whose rows open a different screen", () => {
    const other = [...SCREENS, { route: "/places", id: "places", nav: "none" as const,
      body: opens("place") }];
    expect(upFrom(other, other[3]!)?.id).toBe("things");
  });
});

/**
 * A WAY BACK THAT WOULD FAIL ON THE ONE PRESS IT EXISTS FOR — see
 * `Outcome.back`.
 *
 * ⚠️ EVERY FAULT HERE IS INVISIBLE UNTIL SOMEBODY MAKES A MISTAKE. The button is
 * drawn, the manifest composes, every suite passes — and the first person to
 * reach for it is somebody who has just put stock on the wrong shelf and is
 * about to be told the reversal was refused for a value the screen was holding
 * all along. That is the worst possible moment to discover any of this, which is
 * why all seven are refused at composition instead.
 */
describe("a write that can be taken back", () => {
  /** A reversal shaped like `stock.undo`: the handle, and the day it happens. */
  const undo = (over: Record<string, unknown> = {}) => operation({
    id: "note.unpublish",
    kind: "write",
    summary: "Take it back.",
    input: {
      of: field.text({ label: "Of", required: true, holds: "none" }),
      day: field.day({ label: "On", required: true, holds: "none" }),
    },
    output: { id: field.text({ label: "Id", holds: "none" }) },
    permission: "note:write",
    idempotency: { mode: "none" },
    outcome: { message: "Taken back.", tone: "success" },
    audit: (input: { of: string }) => ({ subject: input.of, verb: "took back" }),
    async handler() { return { id: "n1" }; },
    ...over,
  }) as unknown as AnyOperation;

  /** `stub`, wearing a way back — the shape the four movements ship. */
  const takesBack = (back: Outcome["back"]) => operation({
    id: "note.publish",
    kind: "write",
    summary: "Publish one.",
    input: { id: field.text({ label: "Id", required: true, holds: "none" }) },
    output: { id: field.text({ label: "Id", holds: "none" }) },
    permission: "note:write",
    idempotency: { mode: "none" },
    outcome: { message: "Published.", tone: "success", back },
    async handler() { return { id: "n1" }; },
  }) as unknown as AnyOperation;

  const withBack = (back: Outcome["back"], reversal = undo()) =>
    app({ operations: [takesBack(back), reversal] });

  const sound: NonNullable<Outcome["back"]> = { operation: "note.unpublish", says: "Undo",
    from: { of: { said: "id" }, day: "today" } };

  it("accepts one whose every field resolves", () => {
    expect(refuseApp(withBack(sound))).toEqual([]);
  });

  it("refuses a reversal the app does not declare", () => {
    expect(whyOf(withBack({ ...sound, operation: "note.retract" })))
      .toContain("which this app does not declare");
  });

  it("refuses a reversal that is a read", () => {
    const reading = undo({ id: "note.unpublish", kind: "read", outcome: { why: "It reads." } });
    expect(whyOf(withBack(sound, reading))).toContain("which is a read");
  });

  /* ⚠️ THE ONE REFUSAL THAT IS ABOUT ACCESS RATHER THAN ABOUT WIRING. A gated
     write whose reversal is public is a door around the gate: anybody who can
     reach the reversing operation can undo work they were never allowed to do. */
  it("refuses a public reversal of a gated write", () => {
    const open = undo({ permission: PUBLIC });
    expect(whyOf(withBack(sound, open))).toContain("a door around the");
  });

  it("refuses a fill the reversal does not take", () => {
    expect(whyOf(withBack({ ...sound, from: { ...sound.from, why: { said: "id" } } })))
      .toContain("which does not take it");
  });

  /* ⚠️ THE HALF THAT LOOKS HARMLESS AND IS THE COMMON ONE. Leaving a required
     field out reads as "the reversal will work it out", and what actually
     happens is a 400 at the door for a value the answer was carrying. */
  it("refuses a required field left empty", () => {
    expect(whyOf(withBack({ ...sound, from: { of: { said: "id" } } })))
      .toContain("which requires it");
  });

  it("refuses a fill from something the write does not answer", () => {
    expect(whyOf(withBack({ ...sound, from: { ...sound.from, of: { said: "movement" } } })))
      .toContain("which it does not answer");
  });

  it("refuses a way back with no words on it", () => {
    expect(whyOf(withBack({ ...sound, says: "  " })))
      .toContain("a way back with no words on it");
  });
});
