/**
 * WHAT WE HOLD, WHAT IT COSTS, AND WHAT WE PROMISED — the vault, the record, the
 * meter, the theme and the work nobody watches.
 *
 * ⚠️ THESE FAIL OUTWARDS RATHER THAN INWARDS. A vault read that answers "no such
 * fact", a recipient in no list, a reserve that under-counts, a theme nobody can
 * read, a job that stopped: none of them raises anything, and each is discovered
 * by somebody outside the company — a customer, an auditor, or the provider's
 * invoice.
 */

import { describe, expect, it } from "vitest";
import {
  refuseRead, refuseVault, discloseVault, consented, live, strayFacts,
  type Consent, type VaultGrant,
} from "../src/vault.js";
import { refuseLegal, missingDocuments, ropa, outstanding, type Acceptance } from "../src/legal.js";
import { settle, estimate, plan, charged, refusePacks, unbounded, THINKING_HEADROOM } from "../src/credit.js";
import { refuseTheme, refuseSurfaces, contrast, OURS } from "../src/brand.js";
import { field, refuseField } from "../src/field.js";
import { refuseJob, scheduleOk, stalled } from "../src/job.js";
import { inLane, defaultIn, lanesFor, refuseCatalogue, type ModelRow } from "../src/ai.js";
import type { AccountId, Day, Instant } from "../src/primitives.js";

const NOW = "2026-08-14T12:00:00.000Z" as Instant;
const LATER = "2026-09-14T12:00:00.000Z" as Instant;
const ME = "acc_1" as AccountId;

/* ----------------------------------------------------------------- vault --- */

const book = {
  "client.conditions": { id: "client.conditions", label: "Conditions", holding: "sensitive" as const,
    purposes: ["coaching"] },
};
const purposes = {
  coaching: { id: "coaching", label: "Coaching", why: "So your coach can train you safely.",
    holdings: ["sensitive" as const], retention: null, required: true },
};

const grant = (over: Partial<VaultGrant> = {}): VaultGrant => ({
  subject: ME, to: "mem_1", purpose: "coaching", fields: ["client.conditions"],
  until: LATER, grantedAt: NOW, ...over,
});
const consent = (over: Partial<Consent> = {}): Consent =>
  ({ subject: ME, purpose: "coaching", givenAt: NOW, withdrawnAt: null, ...over });

describe("reading something that is not the app's to keep", () => {
  it("lets a live grant with consent through", () => {
    expect(refuseRead(book, { field: "client.conditions", purpose: "coaching", to: "mem_1", now: LATER },
      [consent()], [grant({ until: "2027-01-01T00:00:00.000Z" as Instant })])).toBe(null);
  });

  /*
    ⚠️ NONE OF THE REFUSALS IS "NOT FOUND". Answering "no such fact" when the
    truth is "you have no grant" teaches whoever is reading that the subject has
    nothing — and it buries an access failure inside an ordinary empty result,
    which nobody investigates.
  */
  it("says which of the four things is missing, and never says nothing is there", () => {
    const ask = { field: "client.conditions", purpose: "coaching", to: "mem_1", now: NOW };
    expect(refuseRead(book, ask, [consent()], [])).toBe("no_grant");
    expect(refuseRead(book, ask, [consent()], [grant({ revokedAt: NOW })])).toBe("grant_expired");
    expect(refuseRead(book, ask, [consent()], [grant({ fields: [] })])).toBe("field_not_granted");
    expect(refuseRead(book, ask, [], [grant()])).toBe("no_consent");
    expect(refuseRead(book, { ...ask, field: "ghost" }, [consent()], [grant()])).toBe("unknown_field");
  });

  /*
    ⚠️ CONSENT IS THE CEILING AND A GRANT IS THE SPECIFIC. A grant an operator
    wrote cannot stand in for the subject's own agreement — that is the whole
    difference between access control and a lawful basis, and it is invisible
    from both sides.
  */
  it("refuses a perfectly valid grant once consent is withdrawn", () => {
    const withdrawn = consent({ withdrawnAt: NOW });
    expect(consented(withdrawn, LATER)).toBe(false);
    expect(refuseRead(book, { field: "client.conditions", purpose: "coaching", to: "mem_1", now: LATER },
      [withdrawn], [grant({ until: "2027-01-01T00:00:00.000Z" as Instant })])).toBe("no_consent");
  });

  /* ⚠️ A grant that never expires is a permanent one — "somebody looked at this
     two years after they left" becomes unlikely rather than impossible. */
  it("stops trusting a grant that has run out", () => {
    expect(live(grant(), NOW)).toBe(true);
    expect(live(grant(), "2027-01-01T00:00:00.000Z" as Instant)).toBe(false);
  });

  it("refuses a purpose the field does not offer", () => {
    expect(refuseRead(book, { field: "client.conditions", purpose: "marketing", to: "m", now: NOW },
      [consent()], [grant()])).toBe("outside_purpose");
  });
});

describe("where a sensitive fact is allowed to live", () => {
  /*
    ⚠️ A HEALTH FACT, A BELIEF OR A BIOMETRIC IN A PRODUCT'S OWN TABLE is outside
    consent, outside the grant log and outside crypto-shredding — and it looks
    exactly like every other column, so nothing downstream will ever notice.
    Composition is the only place it is visible.
  */
  it("refuses a special category declared outside the vault", () => {
    expect(refuseField("conditions", field.text({ label: "Conditions", holds: "sensitive" })))
      .toBe("sensitive_outside_vault");
    expect(refuseField("conditions", field.text({ label: "Conditions", holds: "sensitive", vault: true })))
      .toBe(null);
  });

  /* ⚠️ And a field that says nothing about what it holds leaves the disclosure
     to be written by hand — which means written once and never again. */
  it("refuses a field that will not say whether it holds somebody's data", () => {
    expect(refuseField("note", { kind: "text", label: "Note" })).toBe("holding_undeclared");
  });
});

describe("what the vault declaration must say", () => {
  it("accepts a field with a declared purpose that something uses", () => {
    expect(refuseVault(book, purposes)).toEqual([]);
  });

  /* ⚠️ A fact with no purpose is collected, encrypted, kept, disclosed — and
     every read of it is refused for ever, which reads as an empty field. */
  it("refuses a fact nothing may ever read", () => {
    expect(refuseVault({ x: { ...book["client.conditions"], purposes: [] } }, purposes)
      .map((p) => p.why)).toContain("no_purposes");
  });

  it("refuses a purpose asked for on the consent sheet and used by nothing", () => {
    expect(refuseVault(book, { ...purposes,
      ads: { id: "ads", label: "Ads", why: "…", holdings: ["usage" as const], retention: 30 } })
      .map((p) => p.why)).toContain("orphan_purpose");
  });

  /*
    ⚠️ THE MIRROR IMAGE OF THE FIELD-LEVEL CHECK. A sensitive fact an app forgot
    to route here sits in a product table — outside consent, outside the grant
    log, outside crypto-shredding — and looks like every other column.
  */
  it("names a sensitive fact that never made it to the vault", () => {
    expect(strayFacts(book, ["client.conditions", "client.religion"])).toEqual(["client.religion"]);
  });

  /* ⚠️ The disclosure is derived, because it is the page a regulator reads and
     a hand-written one is right only on the day it is written. */
  it("assembles what the subject is shown from the declarations alone", () => {
    const shown = discloseVault(book, purposes);
    expect(shown).toHaveLength(1);
    expect(shown[0]!.fields.map((f) => f.id)).toEqual(["client.conditions"]);
    expect(shown[0]!.required).toBe(true);
  });
});

/* ----------------------------------------------------------------- legal --- */

describe("the record and the documents", () => {
  const processors = {
    post: { id: "post", name: "Postmark", role: "Sends email", country: "US",
      receives: ["contact" as const] },
  };

  /*
    ⚠️ DATA LEAVING FOR A SERVICE THAT APPEARS IN NO LIST is not a bug anything
    throws on. It is found by somebody outside the company, and by then it has
    been true for a year.
  */
  it("refuses a recipient of something nothing says is collected", () => {
    expect(refuseLegal({}, processors, ["identity"], false).map((p) => p.why))
      .toContain("undisclosed_recipient");
    expect(refuseLegal({}, processors, ["contact"], false)).toEqual([]);
  });

  it("refuses a special category held with no purpose covering it", () => {
    expect(refuseLegal({}, {}, ["sensitive"], false).map((p) => p.why))
      .toEqual(["sensitive_without_a_purpose"]);
    expect(refuseLegal({}, {}, ["sensitive"], true)).toEqual([]);
  });

  /*
    ⚠️ WHETHER THE DOCUMENTS EXIST IS THE DEPLOYMENT'S QUESTION, ASKED ONCE.
    Demanding a set per app produces four copies of one document, or teaches
    everybody to satisfy the check with a stub.
  */
  it("asks the deployment, not the app, whether there is a privacy notice", () => {
    expect(missingDocuments({}, ["contact"]).map((p) => p.why))
      .toEqual(["no_privacy_document", "no_terms"]);
  });

  /*
    ⚠️ AN ACCEPTANCE IS OF A VERSION. Editing the text without moving the version
    records everybody who accepted the old wording as having accepted the new —
    a record that is confidently wrong, which is worse than no record.
  */
  it("counts an acceptance of last month's wording as no acceptance", () => {
    const docs = { terms: { id: "terms", kind: "terms" as const, title: "Terms",
      version: "2026-08-01" as Day, mustAccept: true, binds: "person" as const, url: "/legal/terms" } };
    const old: Acceptance[] = [{ document: "terms", version: "2026-01-01" as Day, at: NOW, by: ME }];
    expect(outstanding(docs, old, "person").map((d) => d.id)).toEqual(["terms"]);
    expect(outstanding(docs, [{ ...old[0]!, version: "2026-08-01" as Day }], "person")).toEqual([]);
  });

  it("refuses to demand acceptance of something there is nothing to read", () => {
    const docs = { t: { id: "t", kind: "terms" as const, title: "T", version: "2026-08-01" as Day,
      mustAccept: true, binds: "person" as const } };
    expect(refuseLegal(docs, {}, [], false).map((p) => p.why)).toEqual(["must_accept_without_binding"]);
  });

  /* ⚠️ Every row of the record comes from a declaration; a hand-written half is
     the half that is wrong. */
  it("assembles the record and its recipients from the sources", () => {
    const rows = ropa([{ id: "c", label: "Clients", why: "To coach them",
      holdings: ["contact", "identity"], retention: null }], processors);
    expect(rows[0]!.recipients).toEqual(["Postmark (US)"]);
  });
});

/* ---------------------------------------------------------------- credit --- */

describe("what a call costs", () => {
  const rate = { input: 1, output: 3, markup: 0.5 };

  /*
    ⚠️ THE CAP IS THE INVARIANT. Settlement charges `min(held, actual)`, so every
    unit an estimate fails to anticipate is a unit the platform pays for and the
    customer does not — silently, on every call, for ever.
  */
  it("never charges more than was held", () => {
    expect(settle({ credits: 100, of: "x" }, 40)).toBe(40);
    expect(settle({ credits: 100, of: "x" }, 400)).toBe(100);
  });

  /*
    ⚠️ AND A MISSING USAGE REPORT FALLS BACK TO THE RESERVE, NEVER TO A RECOUNT.
    Because of the cap, a recount can only ever charge less than the truth — so
    the guess would always be free money in one direction.
  */
  it("charges the reserve when the provider reports nothing", () => {
    expect(settle({ credits: 100, of: "x" }, null)).toBe(100);
  });

  /*
    ⚠️ THE SYSTEM PROMPT IS PART OF WHAT IS SENT. Budgeting for the user's text
    alone under-counts by a fixed several thousand characters on every single
    call — the largest of the four under-counts a previous platform shipped.
  */
  it("budgets for the system text and the user's text together", () => {
    const withSystem = plan("x", "S".repeat(4000), "hello", rate, 1000);
    const without = plan("x", "", "hello", rate, 1000);
    expect(withSystem.reserve.credits).toBeGreaterThan(without.reserve.credits);
  });

  /*
    ⚠️ AND THEY LEAVE TOGETHER. A caller that computes the prompt and the reserve
    separately can hand a different text to each — unit tests on the two halves
    pass while it does, which is what the defect WAS.
  */
  it("hands back the prompt it budgeted for", () => {
    const planned = plan("draft", "SYSTEM", "user text", rate, 500);
    expect(planned.system + planned.prompt).toBe("SYSTEMuser text");
    expect(planned.reserve.of).toBe("draft");
  });

  /*
    ⚠️ FOUR CHARACTERS PER TOKEN IS AN ENGLISH AVERAGE. Arabic runs nearer two,
    so a fixed four halves the estimate for a whole market — served at a loss,
    with nothing reporting it.
  */
  it("costs a denser script more, not the same", () => {
    const english = estimate({ promptChars: 4000, maxOutput: 100, charsPerUnit: 4 }, rate);
    const arabic = estimate({ promptChars: 4000, maxOutput: 100, charsPerUnit: 2 }, rate);
    expect(arabic).toBeGreaterThan(english);
  });

  /* ⚠️ A model that thinks bills for tokens nobody requested and nobody sees. */
  it("widens for a model that thinks", () => {
    const flat = estimate({ promptChars: 100, maxOutput: 10_000, charsPerUnit: 4 }, rate);
    const thinking = estimate({ promptChars: 100, maxOutput: 10_000, charsPerUnit: 4, thinks: true }, rate);
    /* Output dominates here, so the headroom should show up almost undiluted. */
    expect(thinking / flat).toBeGreaterThan(THINKING_HEADROOM - 0.05);
  });

  /* ⚠️ The reserve must cover the real charge at the same rate, or the cap eats
     the difference on every honest call. */
  it("holds enough for the answer it asked for", () => {
    const held = plan("x", "", "a".repeat(400), rate, 1000).reserve;
    const real = charged({ input: 100, output: 1000 }, rate);
    expect(held.credits).toBeGreaterThanOrEqual(real);
  });

  it("refuses credits that cost nothing and packs that hold none", () => {
    expect(refusePacks([{ id: "a", name: "A", credits: 100, price: 0, currency: "EUR", order: 0 }])
      .map((p) => p.why)).toEqual(["free_credits"]);
    expect(refusePacks([{ id: "b", name: "B", credits: 0, price: 500, currency: "EUR", order: 0 }])
      .map((p) => p.why)).toEqual(["empty_pack"]);
  });

  it("refuses a meter with no ceiling to reserve against", () => {
    expect(unbounded({ m: { id: "m", label: "M", lane: "text", maxOutput: 0 } })).toEqual(["m"]);
  });
});

/* ----------------------------------------------------------------- brand --- */

describe("a workspace making it theirs", () => {
  /*
    ⚠️ UNREADABLE IS REFUSED, NOT WARNED ABOUT. The person choosing is not the
    person who has to read it, and a warning in a settings screen is read once by
    somebody who has already decided.
  */
  it("refuses a pair their own customers could not read", () => {
    expect(refuseTheme({ ink: "#eeeeee", ground: "#ffffff" }).map((p) => p.why)).toEqual(["unreadable"]);
    expect(refuseTheme({ ink: "#111111", ground: "#ffffff" })).toEqual([]);
  });

  it("refuses a colour a palette cannot be derived from", () => {
    expect(refuseTheme({ accent: "blue" }).map((p) => p.why)).toEqual(["not_a_colour"]);
  });

  it("computes contrast the published way", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrast("nope", "#ffffff")).toBe(null);
  });

  /*
    ⚠️ SOME SURFACES ARE NEVER THEIRS. A customer who cannot tell whose page this
    is cannot tell whose claim to believe — so the console, our own mail and the
    documents we are bound by keep our letterhead whatever anybody has bought.
  */
  it("refuses to hand over a surface that carries our voice", () => {
    const def = { surfaces: ["shell", "email"] as const, entitlement: "whitelabel" };
    expect(refuseSurfaces(def, [...OURS]).map((p) => p.why)).toEqual(["ours_to_keep", "ours_to_keep", "ours_to_keep"]);
    expect(refuseSurfaces(def, ["public"]).map((p) => p.why)).toEqual(["surface_not_offered"]);
    expect(refuseSurfaces(def, ["shell"])).toEqual([]);
  });
});

/* ------------------------------------------------------------------- job --- */

describe("work nobody is waiting for", () => {
  const sweep = {
    id: "dunning", label: "Dunning", why: "Climbs the ladder for unpaid workspaces.",
    schedule: "0 3 * * *", scope: "per-tenant" as const,
    onFail: { then: "tell" as const, notification: "ops.job_failed" },
    rerunnable: true as const,
  };

  /* ⚠️ A schedule the platform cannot parse never fires, and a job that never
     runs looks exactly like a job that runs and finds nothing to do. */
  it("refuses a schedule that would never fire", () => {
    expect(scheduleOk("0 3 * * *")).toBe(true);
    expect(scheduleOk("every night")).toBe(false);
    expect(refuseJob({ ...sweep, schedule: "nightly" }, ["ops.job_failed"]).map((p) => p.why))
      .toEqual(["unparseable_schedule"]);
  });

  /*
    ⚠️ ANYTHING THAT DELETES CARRIES A FLOOR. A retention misread as zero shreds
    a customer's records on the first run — correctly, at speed, reporting
    success.
  */
  it("refuses to delete with no floor under it", () => {
    expect(refuseJob({ ...sweep, destroys: { floorDays: 0 } }, ["ops.job_failed"]).map((p) => p.why))
      .toEqual(["destroys_without_a_floor"]);
    expect(refuseJob({ ...sweep, destroys: { floorDays: 14 } }, ["ops.job_failed"])).toEqual([]);
  });

  it("refuses to report a failure to a notification nothing declares", () => {
    expect(refuseJob(sweep, []).map((p) => p.why)).toEqual(["unknown_failure_notification"]);
  });

  /*
    ⚠️ THE CONSOLE SHOWS THE LAST RUN RATHER THAN THE NEXT. A job that is
    scheduled tells you nothing; a job whose last run is three days old is a job
    that has stopped, and only that is worth a screen.
  */
  it("names a job that has quietly stopped", () => {
    const day = 86_400_000;
    const now = Date.parse(NOW);
    expect(stalled({ dunning: sweep }, [], now, day)).toEqual(["dunning"]);
    expect(stalled({ dunning: sweep },
      [{ jobId: "dunning", startedAt: new Date(now - 3 * day).toISOString() }],
      now, day)).toEqual(["dunning"]);
    expect(stalled({ dunning: sweep },
      [{ jobId: "dunning", startedAt: new Date(now - 60_000).toISOString() }],
      now, day)).toEqual([]);
  });
});

/* -------------------------------------------------------------------- ai --- */

describe("choosing a model", () => {
  const rows: ModelRow[] = [
    { id: "@cf/x/aura", provider: "cf", task: "tts", label: "Aura", input: 0, output: 2,
      markup: 0.3, enabled: true, maxOutput: 1000 },
    { id: "gemini-tts", provider: "google", task: "speech", label: "Gemini voice", input: 0, output: 5,
      markup: 0.3, enabled: true, maxOutput: 1000 },
  ];

  /*
    ⚠️ ONE LANE, TWO PROVIDER NAMES. A selector asking `task = 'tts'` cannot see
    a single Gemini voice — and the app then reports that no voice is available
    while four are enabled.
  */
  it("finds every model in a lane whatever its provider calls it", () => {
    expect(lanesFor("speech")).toContain("tts");
    expect(inLane(rows, "speech").map((r) => r.id)).toEqual(["@cf/x/aura", "gemini-tts"]);
  });

  /* ⚠️ "Whichever row comes back first" is an order that changes with an insert,
     so the model a feature uses changes without anybody editing anything. */
  it("elects the same default every time", () => {
    expect(defaultIn(rows, "speech")?.id).toBe("@cf/x/aura");
    expect(defaultIn([...rows].reverse(), "speech")?.id).toBe("@cf/x/aura");
    expect(defaultIn(rows, "image")).toBe(null);
  });

  /* ⚠️ A row priced at zero settles free on every call: usage looks free, the
     meter looks healthy, and the provider's invoice is the first anybody hears. */
  it("refuses an enabled model that charges nothing", () => {
    expect(refuseCatalogue([{ ...rows[0]!, input: 0, output: 0 }], []).map((p) => p.why))
      .toEqual(["priced_at_nothing"]);
  });

  it("refuses a lane an app asks for and nothing answers", () => {
    expect(refuseCatalogue(rows, ["image"]).map((p) => p.why)).toEqual(["lane_with_no_model"]);
    expect(refuseCatalogue(rows, ["speech"])).toEqual([]);
  });
});
