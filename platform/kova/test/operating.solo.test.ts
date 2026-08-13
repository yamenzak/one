/**
 * THE OPERATOR DOOR — the five things somebody running a deployment has to be
 * able to do, and could not.
 *
 * ⚠️ SOLO, BECAUSE THREE OF THESE ACT ON THE WHOLE DEPLOYMENT. The workspace
 * list is every workspace any suite has made, and the maintenance switch closes
 * every door in the process — run beside anything else it refuses their
 * requests, and the symptom is four unrelated suites failing on data that was
 * correct when they wrote it. The line is "does this act on the whole
 * deployment", not the subject.
 *
 * ⚠️ AND EVERY ONE OF THEM WAS A MECHANISM WITH NO SURFACE. The directory knew
 * every workspace and nothing listed them; `adjusted_json` was read by the
 * entitlement walk and written by nobody; the ledger summed a balance nothing
 * could add to; the maintenance switch was read on every request and had no way
 * to be turned on. Declared, tested, correct, unreachable.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { sql, type ResolvedRegion } from "@one/kernel";
import { bindingsFor } from "@one/runtime";
import worker from "../src/worker.js";
import { post, SETUP, signIn } from "./session.js";

/**
 * ⚠️ THE STORE DIRECTLY, because only a payment provider's webhook sets this —
 * and it is the GLOBAL one, because the payer is an account and the subscription
 * lives where accounts do.
 */
const directory = () =>
  bindingsFor({ db: sql() }, { DB: (env as Record<string, unknown>).DIRECTORY }, { defaultRegion: "auto" })("auto" as ResolvedRegion).db;

const SLUG = "bowland";
const STUDIO = `https://${SLUG}.kova.4dl.app`;
/* ⚠️ The operator door, and the only place `platform:operate` is ever held. */
const ADMIN = "https://admin.kova.4dl.app";

const at = (origin: string) => (cookie: string) => async (path: string, body?: unknown) => {
  const res = await worker.fetch(
    new Request(`${origin}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env as never,
  );
  return { status: res.status, body: (await res.json()) as Record<string, never> };
};

type Listed = { tenantId: string; slug: string; plan: string | null; status: string | null; reachable: boolean };

let operator: ReturnType<ReturnType<typeof at>>;
let coach: ReturnType<ReturnType<typeof at>>;
let tenantId = "";

beforeAll(async () => {
  const founding = await signIn(`${SLUG}@example.test`, SETUP);
  const made = await post(SETUP, "/api/identity.workspace.create", { slug: SLUG }, founding);
  tenantId = made.body.tenantId as string;
  expect(tenantId, "the studio fixture must have been created").toBeTruthy();

  coach = at(STUDIO)(await signIn(`${SLUG}@example.test`, STUDIO));
  operator = at(ADMIN)(await signIn("op@bowland.example.test", ADMIN));
});

/* ------------------------------------------------------------- the door --- */

describe("who holds this at all", () => {
  /*
    ⚠️ THE DOOR IS THE CONTROL. `platform:operate` is granted by the operator
    role, and the operator role is applied on the `admin` door and nowhere else —
    so a studio's own owner, on their own origin, holds none of it. The previous
    generation shipped a console that RENDERED inside a studio and 404'd on every
    call, which is the same mistake with a screen attached.
  */
  it("is not a studio owner, on their own studio", async () => {
    expect((await coach("/api/admin.tenants")).status).toBe(403);
    expect((await coach("/api/admin.comp", { tenantId, planId: "solo", reason: "mine now" })).status).toBe(403);
    expect((await coach("/api/admin.maintenance.set", { mode: "full", message: "brb" })).status).toBe(403);
  });

  it("is not somebody with no session", async () => {
    expect((await at(ADMIN)("")("/api/admin.tenants")).status).toBe(403);
  });
});

/* ------------------------------------------------------------- the list --- */

describe("every workspace on the deployment", () => {
  /*
    ⚠️ THE PLAN COMES FROM THE WORKSPACE'S OWN REGION. The directory holds
    routing only, deliberately, so what a workspace is ON is not in it — and a
    list showing standing without a plan answers half the question anybody opens
    this screen with.
  */
  it("lists them with what each one is on", async () => {
    const out = await operator("/api/admin.tenants");
    expect(out.status).toBe(200);
    const rows = out.body.tenants as unknown as Listed[];
    const mine = rows.find((r) => r.tenantId === tenantId);
    expect(mine).toBeTruthy();
    expect(mine!.slug).toBe(SLUG);
    expect(mine!.reachable).toBe(true);
  });

  it("finds one by name", async () => {
    const out = await operator(`/api/admin.tenants?search=${SLUG}`);
    const rows = out.body.tenants as unknown as Listed[];
    expect(rows.every((r) => r.slug.includes(SLUG))).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------- comping --- */

describe("putting a workspace on a plan without a payment", () => {
  it("moves them onto it and says so on the list", async () => {
    const out = await operator("/api/admin.comp", { tenantId, planId: "studio", reason: "launch partner" });
    expect(out.status).toBe(200);

    const rows = (await operator("/api/admin.tenants")).body.tenants as unknown as Listed[];
    const mine = rows.find((r) => r.tenantId === tenantId)!;
    expect(mine.plan).toBe("studio");
    expect(mine.status).toBe("active");
  });

  /*
    ⚠️ AND WHAT IT BUYS IS REAL. A comp that moved a row and did not widen the
    ceilings is a screen saying one thing and a gate doing another — the studio
    plan is twenty-five clients where the entry plan is three.
  */
  it("gives them what that plan includes", async () => {
    for (let i = 0; i < 5; i++) {
      const made = await coach("/api/client.create", { name: `Person ${i}` });
      await coach("/api/consent.record", { subject: made.body.id });
      expect(made.status, `client ${i} must fit under the comped plan`).toBe(200);
    }
  });

  /*
    ⚠️ A PLAN THIS APP DOES NOT SELL RESOLVES TO NOTHING AT THE GATE, so the
    workspace lands on the parking floor while every screen shows them on a plan.
  */
  it("refuses a plan nobody sells", async () => {
    const out = await operator("/api/admin.comp", { tenantId, planId: "platinum", reason: "why not" });
    expect(out.status).toBe(400);
    expect(out.body.meta).toMatchObject({ field: "planId" });
  });

  it("refuses a workspace that is not there", async () => {
    expect((await operator("/api/admin.comp", { tenantId: "ten_nothing", planId: "solo", reason: "does not exist" })).status).toBe(404);
  });

  /*
    ⚠️ AND IT CLEARS THE DUNNING ANCHOR. A workspace comped while the ladder was
    counting keeps `past_due_at`, so the sweep suspends it on schedule for an
    invoice nobody is waiting for — and the operator who comped them has no
    reason to look at it again. The row would read `active` throughout.
  */
  it("stops a ladder that was already counting", async () => {
    const longAgo = new Date(Date.now() - 40 * 86_400_000).toISOString();
    /* ⚠️ THE ACCOUNT'S ROW, which is where the gate reads. Aged in the regional
       store this would set a ladder nothing resolves against, and the test would
       assert a healthy path is healthy. */
    const had = await directory().first<{ id: string }>(
      `SELECT id FROM account_subscription WHERE tenant_id = ?`, tenantId,
    );
    if (had) {
      await directory().run(
        `UPDATE account_subscription SET status = 'past_due', past_due_at = ? WHERE id = ?`, longAgo, had.id,
      );
    } else {
      await directory().run(
        `INSERT INTO account_subscription (id, account_id, product_id, tenant_id, status, past_due_at, started_at, updated_at)
         VALUES (?, '', 'kova', ?, 'past_due', ?, ?, ?)`,
        `sub_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`, tenantId, longAgo, longAgo, longAgo,
      );
    }
    /*
      ⚠️ A WRITE, because reads are never gated at any rung — withholding
      somebody's own records over an invoice is not the same as withholding a
      product, and `movement` has no ceiling of its own to confuse the answer.
    */
    expect((await coach("/api/movement.create", { name: "Not now", pattern: "squat" })).status).toBe(402);

    expect((await operator("/api/admin.comp", { tenantId, planId: "studio", reason: "launch partner" })).status).toBe(200);
    expect((await coach("/api/movement.create", { name: "Back in service", pattern: "squat" })).status).toBe(200);
    const left = await directory().first<{ past_due_at: string | null }>(
      `SELECT past_due_at FROM account_subscription WHERE tenant_id = ?`, tenantId,
    );
    expect(left!.past_due_at).toBeNull();
  });

  /*
    ⚠️ THE REASON IS REQUIRED, and it is the whole difference between this and a
    way to give the product away. Somebody reads the row a year later asking why
    a workspace pays nothing.
  */
  it("refuses one with no reason", async () => {
    expect((await operator("/api/admin.comp", { tenantId, planId: "solo", reason: "" })).status).toBe(400);
  });
});

/* ------------------------------------------------------------ adjusting --- */

describe("adjusting one workspace's ceilings", () => {
  /*
    ⚠️ ABSOLUTE, EITHER DIRECTION, PER KEY — and a different column from the
    grandfathering one for exactly that reason. Sharing a blob and a grant-only
    write path made "give this studio ten seats" a one-way door whose only undo
    discarded what they were originally sold.
  */
  it("raises a ceiling above what the plan includes", async () => {
    const out = await operator("/api/admin.adjust", { tenantId, set: { clients: 30 } });
    expect(out.status).toBe(200);
    expect(out.body.adjusted).toMatchObject({ clients: 30 });
  });

  it("lowers one below it, which grandfathering could never do", async () => {
    const out = await operator("/api/admin.adjust", { tenantId, set: { clients: 6 } });
    expect(out.body.adjusted).toMatchObject({ clients: 6 });

    /* Six exist by now, so the gate refuses the seventh. */
    expect((await coach("/api/client.create", { name: "One too many" })).status).toBe(402);
  });

  it("clears one and puts them back on the plan", async () => {
    const out = await operator("/api/admin.adjust", { tenantId, set: { clients: null } });
    expect(out.body.adjusted).not.toHaveProperty("clients");
    expect((await coach("/api/client.create", { name: "Back under the plan" })).status).toBe(200);
  });

  /*
    ⚠️ A KEY THIS APP DOES NOT SELL IS READ BY NOTHING. Stored, it is an
    adjustment an operator can see on a screen and no gate will ever consult.
  */
  it("refuses a key this app does not declare", async () => {
    const out = await operator("/api/admin.adjust", { tenantId, set: { unicorns: 5 } });
    expect(out.status).toBe(400);
    expect(out.body.meta).toMatchObject({ field: "unicorns" });
  });

  it("refuses a value that is not a ceiling", async () => {
    expect((await operator("/api/admin.adjust", { tenantId, set: { clients: "lots" } })).status).toBe(400);
  });
});

/* -------------------------------------------------------------- credits --- */

describe("giving a workspace credits", () => {
  it("adds them, and the workspace can see what it has", async () => {
    const out = await operator("/api/admin.topup", { tenantId, amount: 5_000, reason: "goodwill", ref: "gift-1" });
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ applied: true });
    expect(Number(out.body.balance)).toBe(5_000);
    expect(Number((await coach("/api/ai.spending")).body.balance)).toBe(5_000);
  });

  /*
    ⚠️ THE SAME INTENT TWICE IS ONE GRANT, and `applied: false` is a SUCCESS. A
    double-submitted form must not give a workspace twice what somebody meant to
    give them — and a caller reading a 200 as "it happened" would say it did.
  */
  it("does not give it twice for the same intent", async () => {
    const again = await operator("/api/admin.topup", { tenantId, amount: 5_000, reason: "goodwill", ref: "gift-1" });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ applied: false });
    expect(Number(again.body.balance)).toBe(5_000);
  });

  it("gives it again for a different one", async () => {
    const more = await operator("/api/admin.topup", { tenantId, amount: 1_000, reason: "goodwill", ref: "gift-2" });
    expect(more.body).toMatchObject({ applied: true });
    expect(Number(more.body.balance)).toBe(6_000);
  });

  it("refuses a workspace that is not there", async () => {
    expect((await operator("/api/admin.topup", { tenantId: "ten_nothing", amount: 1, reason: "does not exist", ref: "ghost-1" })).status).toBe(404);
  });
});

/* ---------------------------------------------------------- maintenance --- */

describe("closing the deployment", () => {
  /*
    ⚠️ A MESSAGE IS REQUIRED TO CLOSE. A closed deployment with no message is a
    product that has vanished; whoever is holding it has nothing to tell the
    person in front of them.
  */
  it("refuses to close with nothing to say", async () => {
    const out = await operator("/api/admin.maintenance.set", { mode: "full", message: "  " });
    expect(out.status).toBe(400);
    expect(out.body.meta).toMatchObject({ field: "message" });
  });

  /*
    ⚠️ `readonly` SERVES READS AND REFUSES WRITES. Nobody is signed out and
    nothing is withheld that was already recorded — the same rule the payment
    ladder follows one level down.
  */
  it("refuses writes and serves reads in readonly", async () => {
    expect((await operator("/api/admin.maintenance.set", { mode: "readonly", message: "Back in an hour" })).status).toBe(200);

    expect((await coach("/api/client.list")).status).toBe(200);
    const refused = await coach("/api/client.create", { name: "Not now" });
    await coach("/api/consent.record", { subject: refused.body.id });
    expect(refused.status).toBe(503);
    expect(refused.body).toMatchObject({ code: "platform.maintenance" });
  });

  /*
    ⚠️ AND THE OPERATOR IS EXEMPT, which is not a convenience: the way out of
    maintenance is a request, and a switch that refused the person holding it
    would be one nobody could turn off.
  */
  it("does not close the door it is set from", async () => {
    expect((await operator("/api/admin.tenants")).status).toBe(200);
    expect((await operator("/api/admin.maintenance")).body).toMatchObject({ mode: "readonly", message: "Back in an hour" });
  });

  it("withholds everything in full, and opens again", async () => {
    await operator("/api/admin.maintenance.set", { mode: "full", message: "Down for work" });
    expect((await coach("/api/client.list")).status).toBe(503);

    expect((await operator("/api/admin.maintenance.set", { mode: "off" })).status).toBe(200);
    expect((await coach("/api/client.list")).status).toBe(200);
    expect((await operator("/api/admin.maintenance")).body).toMatchObject({ mode: "off" });
  });
});

/* --------------------------------------------------------- the dead letter --- */

describe("payment events nothing could place", () => {
  /*
    ⚠️ A DEAD LETTER NOBODY CAN READ IS THE SAME SILENT SUCCESS WITH AN EXTRA
    TABLE. The old handler answered an unattributable event 200 with its id
    already claimed, so the provider never retried — money captured, nothing
    granted, and no way to find out. Parking it only helps if somebody can look.
  */
  it("is readable on the operator door and nowhere else", async () => {
    const out = await operator("/api/billing.parked");
    expect(out.status).toBe(200);
    expect(Array.isArray(out.body.events)).toBe(true);
    expect((await coach("/api/billing.parked")).status).toBe(403);
  });

  it("says so rather than pretending, when the event is not there", async () => {
    expect((await operator("/api/billing.parked.replay", { eventId: "evt_nothing", tenantId })).status).toBe(404);
    expect((await coach("/api/billing.parked.replay", { eventId: "evt_nothing", tenantId })).status).toBe(403);
  });
});

/* ------------------------------------------------------- configuration --- */

describe("configuring the deployment", () => {
  /*
    ⚠️ THE BOOTSTRAP IS WHY THIS SCREEN IS THE SECOND DAY'S. A fresh deployment
    cannot send email until a provider is configured; reaching this needs an
    operator session, which needs a code, which needs email. No screen can break
    that circle — provisioning seeds the first rows, because a workflow with
    database access can do what a login cannot.
  */
  it("lists exactly the keys this deployment reads", async () => {
    const out = await operator("/api/admin.config");
    expect(out.status).toBe(200);
    const keys = out.body.keys as unknown as { key: string; secret: boolean; source: string }[];
    expect(keys.map((k) => k.key)).toContain("stripe.mode");
    expect(keys.find((k) => k.key === "stripe.test.secret_key")!.secret).toBe(true);
    /* ⚠️ Kova binds the shared store, and the answer says so rather than implying it. */
    expect(out.body.shared).toBe(true);
  });

  it("is not reachable from inside a studio", async () => {
    expect((await coach("/api/admin.config")).status).toBe(403);
    expect((await coach("/api/admin.config.set", { key: "stripe.mode", value: "live", scope: "app" })).status).toBe(403);
  });

  /*
    ⚠️ A SECRET'S VALUE NEVER COMES BACK. Whether it is SET is the real question;
    a console that can display a key leaks one through a screen share, a support
    session, or any read vulnerability.
  */
  it("takes a secret and never hands it back", async () => {
    const set = await operator("/api/admin.config.set", { key: "stripe.test.secret_key", value: "sk_test_notreal", scope: "app" });
    expect(set.status).toBe(200);

    const out = await operator("/api/admin.config");
    expect(JSON.stringify(out.body)).not.toContain("sk_test_notreal");
    const key = (out.body.keys as unknown as { key: string; value: unknown }[]).find((k) => k.key === "stripe.test.secret_key")!;
    expect(key.value).toBe(true);
  });

  /*
    ⚠️ AND CONFIGURING THE PROVIDER IS WHAT MAKES THE DEPLOYMENT CHARGEABLE. It
    was a boolean an app passed in, so the gate that holds an unpaid workspace to
    setup could say "we can charge" while there was no key at all — and the
    failure is every workspace on a self-host stranded over OUR misconfiguration.
  */
  /*
    ⚠️ THIS USED TO ASSERT A PARKING STATE AND THERE IS NO LONGER ONE. A workspace
    is created against a subscription somebody already started, so "a workspace
    that never chose a plan" is not a state a chargeable deployment can reach —
    the refusal moved from the first write to the creation itself.

    ⚠️ AND THE STAND-DOWN IS THE HALF THAT MATTERS. With no payment provider there
    is nothing to buy, so demanding a purchase would make the platform unusable
    over OUR missing configuration rather than their non-payment — on every
    self-host, and before the deploy guide's payment step.
  */
  it("refuses a workspace with nothing bought, and stands down where nothing can be bought", async () => {
    const founding = await signIn("ilkley@example.test", SETUP);
    const refused = await post(SETUP, "/api/identity.workspace.create", { slug: "ilkley" }, founding);
    expect(refused.res.status).toBe(402);

    await operator("/api/admin.config.set", { key: "stripe.test.secret_key", value: "", scope: "app" });
    const allowed = await post(SETUP, "/api/identity.workspace.create", { slug: "ilkley" }, founding);
    expect(allowed.res.status).toBe(200);

    const fresh = "https://ilkley.kova.4dl.app";
    const theirs = at(fresh)(await signIn("ilkley@example.test", fresh));
    expect((await theirs("/api/movement.create", { name: "Fine", pattern: "squat" })).status).toBe(200);
  });

  it("refuses a key nothing reads", async () => {
    const out = await operator("/api/admin.config.set", { key: "strip.mode", value: "live", scope: "app" });
    expect(out.status).toBe(400);
    expect(out.body.meta).toMatchObject({ field: "key" });
  });

  /*
    ⚠️ AND A DEPLOYMENT WITH NO SHARED STORE SAYS SO RATHER THAN WRITING
    SOMEWHERE. Silently writing the shared value into this app's own store would
    be a key that works here and nowhere else, discovered by the second app.
  */
  /*
    ⚠️ A SHARED WRITE LANDS IN THE SHARED STORE AND IS READ BACK FROM IT. That is
    the whole point: one Stripe account behind every product, so a rotated key is
    pasted once rather than once per app — and the answer says WHERE the live
    value came from, because typing a local value over a shared one pins this app
    to a copy that will not follow the next rotation.
  */
  it("puts a shared key where every app behind this deployment reads it", async () => {
    expect((await operator("/api/admin.config.set", { key: "stripe.mode", value: "live", scope: "shared" })).status).toBe(200);
    const keys = (await operator("/api/admin.config")).body.keys as unknown as { key: string; value: unknown; source: string }[];
    const mode = keys.find((k) => k.key === "stripe.mode")!;
    expect(mode.value).toBe("live");
    expect(mode.source).toBe("shared");
  });

  /*
    ⚠️ AND A KEY DECLARED PER-APP MAY NOT GO THERE, however tempting. Each app
    registers its own payment webhook and gets its own signing secret; sharing
    one makes every app fail verification but the one that saved it last.
  */
  it("refuses a per-app key aimed at the shared store", async () => {
    const out = await operator("/api/admin.config.set", { key: "stripe.webhook_secret", value: "whsec_x", scope: "shared" });
    expect(out.status).toBe(400);
    expect(out.body.meta).toMatchObject({ field: "scope" });
  });
});

/* ------------------------------------------------------- the catalogue --- */

/**
 * ⚠️ A RATE IS A FACT ABOUT A PROVIDER'S PRICE LIST, IDENTICAL IN EVERY PRODUCT,
 * and getting one wrong is a transfer rather than a bug: the reserve caps what
 * may be charged, so every unit an out-of-date rate fails to count is a unit the
 * platform pays for and nobody is billed. A manifest is a deploy and a price
 * change is not, so the declared catalogue is a FLOOR and the shared store wins.
 *
 * ⚠️ SOLO, because publishing one changes what every app behind this deployment
 * charges — which is the whole point, and exactly why it cannot run beside a
 * suite that is generating.
 */
describe("what a model costs", () => {
  const attach = () => {
    (env as Record<string, unknown>).AI = {
      async run() { return { output: { weeks: [] }, usage: { input: 10, output: 10 } }; },
    };
  };

  const balance = async () =>
    Number((await coach("/api/ai.spending")).body.balance);

  /*
    ⚠️ THE CATALOGUE IS THE DEPLOYMENT'S, AND KOVA DECLARES NO MODELS. It used to
    declare five, so a model an operator added reached nobody until this app was
    edited and redeployed, and a model a provider retired left every studio
    pointing at something that had stopped answering. What Kova declares is an
    ACTION and the LANE it needs; what is in a lane is this screen.
  */
  it("lists what the deployment has, not what the app declares", async () => {
    const out = await operator("/api/admin.models");
    expect(out.status).toBe(200);
    const models = out.body.models as unknown as { id: string; lane: string; enabled: boolean }[];
    expect(models.find((m) => m.id === "gemini-2.5-flash")).toBeTruthy();
    /* ⚠️ And every lane the meter can price travels with it, so the console
       renders the choice from what the platform supports. */
    expect(out.body.lanes).toContain("vision");
  });

  /*
    ⚠️ ADDING ONE CHANGES WHAT EVERY PRODUCT CAN RUN, WITHOUT A DEPLOY. That is
    the difference between a catalogue a person can correct in a minute and one
    that waits for a release — and while it waits, every product is stuck with
    whatever shipped.
  */
  it("takes a new model and offers it to the actions in its lane", async () => {
    expect((await operator("/api/admin.models.set", {
      id: "brand-new-model", provider: "gemini", lanes: ["text"], input: 1, output: 3, markup: 1.5,
    })).status).toBe(200);

    const actions = (await coach("/api/ai.models.list")).body.actions as unknown as
      { action: string; options: { id: string }[] }[];
    expect(actions.find((a) => a.action === "draft-plan")!.options.map((o) => o.id)).toContain("brand-new-model");
  });

  /*
    ⚠️ COST AND PRICE ON THE SAME ROW. Either alone answers neither question an
    operator has — "are we losing money on this" needs both, and a markup shown
    without the number it multiplies is a percentage of something invisible.
  */
  it("shows what a model costs beside what it is sold for", async () => {
    await operator("/api/admin.models.set", {
      id: "marked-up", provider: "gemini", lanes: ["text"], input: 2, output: 10, markup: 1.5,
    });
    const models = (await operator("/api/admin.models")).body.models as unknown as
      { id: string; cost: { input: number }; price: { input: number; output: number }; markup: number }[];
    const m = models.find((x) => x.id === "marked-up")!;
    expect(m.cost.input).toBe(2);
    expect(m.price).toMatchObject({ input: 3, output: 15 });
    expect(m.markup).toBe(1.5);
  });

  /*
    ⚠️ A RATE OF ZERO IS NOT FREE, IT IS UNMETERED — for every app behind this
    store. The reserve is zero, the settle is zero, the balance never moves, and
    the provider invoices as usual.
  */
  it("refuses a rate of zero", async () => {
    const out = await operator("/api/admin.models.set", {
      id: "gemini-2.5-flash", provider: "gemini", lanes: ["text"], input: 0, output: 8, markup: 1.4,
    });
    expect(out.status).toBe(400);
  });

  /*
    ⚠️ AND A MARKUP OF ZERO SELLS EVERY CALL AT COST. It is the likeliest of the
    refusals to be typed, because zero is what an empty box means.
  */
  it("refuses a markup that sells at or below cost", async () => {
    expect((await operator("/api/admin.models.set", {
      id: "gemini-2.5-flash", provider: "gemini", lanes: ["text"], input: 1, output: 4, markup: 0,
    })).status).toBe(400);
  });

  /*
    ⚠️ AND AN ATTACHING LANE WITH NO ATTACHMENT PRICE IS THE EXPENSIVE ONE,
    because it SUCCEEDS: the reserve is computed from the words alone and the
    platform pays for every picture, scaling with use.
  */
  it("refuses a vision model that prices no picture", async () => {
    expect((await operator("/api/admin.models.set", {
      id: "blind", provider: "gemini", lanes: ["vision"], input: 1, output: 4, markup: 1.4,
    })).status).toBe(400);
  });

  /*
    ⚠️ TAKING ONE OUT OF SERVICE IS NOT DELETING IT. The row carries the rate
    every past generation was settled against; deleting it makes a bill
    unreadable to answer a question a switch answers.
  */
  it("takes a model out of service without losing it", async () => {
    await operator("/api/admin.models.set", {
      id: "retiring", provider: "gemini", lanes: ["text"], input: 1, output: 4, markup: 1.4,
    });
    expect((await operator("/api/admin.models.enabled", { id: "retiring", enabled: false })).status).toBe(200);

    const models = (await operator("/api/admin.models")).body.models as unknown as { id: string; enabled: boolean }[];
    expect(models.find((m) => m.id === "retiring")!.enabled).toBe(false);

    const actions = (await coach("/api/ai.models.list")).body.actions as unknown as
      { action: string; options: { id: string }[] }[];
    expect(actions.find((a) => a.action === "draft-plan")!.options.map((o) => o.id)).not.toContain("retiring");
  });

  it("refuses to take out of service a model nobody added", async () => {
    expect((await operator("/api/admin.models.enabled", { id: "never-existed", enabled: false })).status).toBe(400);
  });

  it("is not reachable from inside a studio", async () => {
    expect((await coach("/api/admin.models")).status).toBe(403);
    expect((await coach("/api/admin.models.set", {
      id: "gemini-2.5-flash", provider: "gemini", lanes: ["text"], input: 1, output: 1, markup: 1.4,
    })).status).toBe(403);
  });
});

/* ------------------------------------------------------------ the catalogue --- */

/**
 * ⚠️ THE CATALOGUE IS EDITABLE BECAUSE A MANIFEST IS A DEPLOY AND A PRICE IS NOT.
 * The same argument as a model's rate, one rail over: an operator who has to ship
 * a build to change a price ships fewer price changes than the business actually
 * makes, and the gap is filled by discounts nobody records.
 */
describe("what this deployment sells", () => {
  it("shows the declaration and the edit side by side", async () => {
    const out = await operator("/api/admin.catalog");
    expect(out.status).toBe(200);
    const declared = out.body.declared as unknown as { id: string; price: { minor: number } }[];
    expect(declared.find((p) => p.id === "solo")).toBeTruthy();
    /* ⚠️ Nothing edited yet, so what is sold is what was declared. */
    expect(out.body.selling).toEqual(out.body.declared);
  });

  it("changes a price without touching the ceilings", async () => {
    const out = await operator("/api/admin.catalog.set", { planId: "solo", price: { minor: 900, currency: "USD" } });
    expect(out.status).toBe(200);
    const selling = out.body.selling as unknown as { id: string; price: { minor: number }; entitlements: Record<string, unknown> }[];
    const solo = selling.find((p) => p.id === "solo")!;
    expect(solo.price.minor).toBe(900);
    expect(solo.entitlements.clients).toBe(3);
  });

  it("refuses an entitlement key this app never declared", async () => {
    const out = await operator("/api/admin.catalog.set", { planId: "solo", entitlements: { invented: 5 } });
    expect(out.status).toBe(400);
  });

  /* ⚠️ A quota given `true` is a ceiling every count compares against a boolean;
     a gate given `3` is a feature on because three is truthy. Both "work". */
  it("refuses a ceiling of the wrong kind", async () => {
    expect((await operator("/api/admin.catalog.set", { planId: "solo", entitlements: { clients: true } })).status).toBe(400);
    expect((await operator("/api/admin.catalog.set", { planId: "solo", entitlements: { training: 3 } })).status).toBe(400);
  });

  it("refuses a plan that does not exist", async () => {
    expect((await operator("/api/admin.catalog.set", { planId: "imaginary", trialDays: 0 })).status).toBe(400);
  });

  it("is not a studio owner's to edit", async () => {
    expect((await coach("/api/admin.catalog")).status).toBe(403);
    expect((await coach("/api/admin.catalog.set", { planId: "solo", trialDays: 0 })).status).toBe(403);
  });

  /*
    ⚠️ AND THE EDIT REACHES THE GATE, which is the half that makes it worth
    having. A catalogue screen the resolver never reads is a price list with no
    effect on anything: raising a limit for a customer who paid for it would
    change nothing, and the only symptom is a refusal they were told would not
    happen.
  */
  /*
    ⚠️ ITS OWN WORKSPACE, because this test fills a roster to a ceiling and the
    file's other tests share one. A quota assertion against a shared fixture
    fails as an off-by-however-many-somebody-added-since.
  */
  it("changes what the workspace on that plan may actually do", async () => {
    const founding = await signIn("priced@example.test", SETUP);
    const made = await post(SETUP, "/api/identity.workspace.create", { slug: "priced" }, founding);
    const theirs = made.body.tenantId as string;
    const them = at("https://priced.kova.4dl.app")(await signIn("priced@example.test", "https://priced.kova.4dl.app"));
    await operator("/api/admin.comp", { tenantId: theirs, planId: "solo", reason: "test" });

    /* Three is the declared ceiling. */
    for (const name of ["One", "Two", "Three"]) {
      expect((await them("/api/client.create", { name })).status, `${name} is inside the declared ceiling`).toBe(200);
    }
    expect((await them("/api/client.create", { name: "Four" })).status).toBe(402);

    await operator("/api/admin.catalog.set", { planId: "solo", entitlements: { clients: 10 } });
    expect((await them("/api/client.create", { name: "Four" })).status).toBe(200);
  });

  /*
    ⚠️ AND EDITING IT DOWN HOLDS EVERYBODY ALREADY ON IT AT WHAT THEY WERE SOLD.
    This is the whole reason a catalogue is safe to edit, and `grandfathered_json`
    was read by the resolver and written by nothing until an operator could edit
    a plan. Without it, a workspace that bought ten loses seven mid-period, with
    no notice — and the plan says three and appears always to have.
  */
  it("holds an existing subscriber at what they were sold", async () => {
    const them = at("https://priced.kova.4dl.app")(await signIn("priced@example.test", "https://priced.kova.4dl.app"));
    const out = await operator("/api/admin.catalog.set", { planId: "solo", entitlements: { clients: 3 } });
    expect(out.status).toBe(200);
    expect(out.body.grandfathered as unknown as number).toBeGreaterThanOrEqual(1);

    /* They keep the ten they were sold, and the fifth client still lands. */
    expect((await them("/api/client.create", { name: "Five" })).status).toBe(200);
  });

  /* ⚠️ It ratchets up only, so a second reduction cannot lower somebody already
     held at the first. */
  it("does not lower them again on a second reduction", async () => {
    const them = at("https://priced.kova.4dl.app")(await signIn("priced@example.test", "https://priced.kova.4dl.app"));
    await operator("/api/admin.catalog.set", { planId: "solo", entitlements: { clients: 1 } });
    expect((await them("/api/client.create", { name: "Six" })).status).toBe(200);
  });

  /* ⚠️ And raising a plan records nothing — a snapshot there would freeze a
     workspace out of every future improvement. */
  it("records nothing when a plan gets better", async () => {
    const out = await operator("/api/admin.catalog.set", { planId: "solo", entitlements: { clients: 50 } });
    expect(out.body.grandfathered as unknown as number).toBe(0);
  });
});

/* --------------------------------------------------------------- domains --- */

describe("every custom domain on the deployment", () => {
  /*
    ⚠️ "WHY IS MY DOMAIN NOT WORKING" IS ASKED OF AN OPERATOR, about a workspace
    whose settings screen they cannot open. Without this the only answer is to
    ask the customer to read their own screen back.
  */
  it("lists what each is waiting for", async () => {
    await coach("/api/domain.claim", { hostname: "gym.bowland.example" });
    const out = await operator("/api/admin.domains");
    expect(out.status).toBe(200);
    const rows = out.body.domains as unknown as { hostname: string; state: string; tenantId: string }[];
    const found = rows.find((r) => r.hostname === "gym.bowland.example")!;
    expect(found.state).toBe("claimed");
    expect(found.tenantId).toBe(tenantId);
  });

  /*
    ⚠️ THE TOKEN IS NOT HERE. An operator does not need it to answer the
    question, and a console displaying every workspace's verification secret is
    one screenshot away from somebody claiming a domain they have no DNS access
    to.
  */
  it("does not show the verification secret", async () => {
    const rows = (await operator("/api/admin.domains")).body.domains as unknown as Record<string, unknown>[];
    for (const row of rows) expect(Object.keys(row)).not.toContain("token");
  });

  it("is not a studio owner's to read", async () => {
    expect((await coach("/api/admin.domains")).status).toBe(403);
  });
});
