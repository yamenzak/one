/**
 * THE OPERATOR DOOR, AND THE SWITCH THAT CLOSES EVERY OTHER ONE.
 *
 * ⚠️ TWO DOORS BOUND THE CONSOLE AND BOTH ARE LOAD-BEARING: the hostname (it
 * answers on `admin.` and nowhere else — a console reachable at a workspace's
 * address is a console any member can try) and the ADDRESS (the deployment
 * decides who counts, because an operator is outside every workspace and no
 * role can express that).
 *
 * ⚠️ AND MAINTENANCE IS ASKED IN THE ONE OPERATION PATH, so what it withholds
 * is a property of the platform rather than a habit of routes: `readonly`
 * refuses writes and serves reads, `full` withholds both — while the operator
 * door, sign-in and leaving keep working, or the switch is a trap.
 */

import { env } from "cloudflare:test";
import type { PlanSpec } from "@engine/kernel";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  DIRECTORY_MODULES, SHARD_MODULES,
  AUDIT_SCHEMA, BILLING_SCHEMA, DIRECTORY_SCHEMA, IDENTITY_SCHEMA, JOBS_SCHEMA,
  MEMBERSHIP_SCHEMA, NOBODY, OPERATOR_SCHEMA, REPLAY_SCHEMA,
  addShard, applySchema, memberFor, noteShardApp, operatorOps,
  permissionsResolver, personalOps, schemaFor, serve, sessionIdFrom, tenantBySlug, whoIs,
  type Db,
} from "@engine/runtime";
import { asLocating } from "./wiring.js";
import { HELLO, hello } from "../src/index.js";

const directory = () => env.DIRECTORY as unknown as Db;
const shard = () => env.SHARD_EU_1 as unknown as Db;

const ROOTS = { root: "one.test" };
const sent: { to: string; code: string }[] = [];

/** ⚠️ Who the DEPLOYMENT says is an operator — never a role, never a claim. */
/** ⚠️ One membership, so one list — the shape `refuseCatalog` demands. */
const PLANS: readonly PlanSpec[] = [
  { id: "none", name: "No plan", said: "", kind: "personal", price: 0, currency: "USD",
    credits: 0, order: 0, parking: true,
    includes: { seats: 1, storage: 0, domains: 0, notes: 5, publishing: false } },
  { id: "solo", name: "Solo", said: "", kind: "personal", price: 1200, currency: "USD",
    credits: 1500, order: 1,
    includes: { seats: 3, storage: 100, domains: 0, notes: -1, publishing: true } },
];

const OPERATORS = ["ops@example.com"];

const app = () => serve({
  roots: ROOTS,
  apps: { hello },
  directory: directory(),
  shardOf: () => shard(),
  personal: {
    ...personalOps({
      secret: "test-secret", appId: "hello",
      deliver: async (to, code) => { sent.push({ to, code }); },
    }),
    ...operatorOps({
      apps: { hello },
      isOperator: (email) => !!email && OPERATORS.includes(email),
      /* ⚠️ THE DEPLOYMENT'S CATALOGUE, because comping a plan resolves the id
         against it — a console with no catalogue can refuse every plan and look
         exactly like one with a wrong id typed into it. */
      plans: PLANS,
    }),
  },
  locate: asLocating(async (door) => {
    if (door.kind !== "tenant" || !door.slug) return null;
    const tenant = await tenantBySlug(directory(), door.slug);
    return tenant
      ? {
        tenantId: tenant.id, db: shard(), apps: ["hello"],
        entitlements: [
          { key: "seats", value: 10, source: "plan" as const, plan: 10 },
          { key: "notes", value: 50, source: "plan" as const, plan: 50 },
        ],
      }
      : null;
  }),
  identify: async (request, finding) => {
    const located = await finding;
    if (!located) return NOBODY;
    const { session, email, accountId } = await whoIs(directory(), sessionIdFrom(request), new Date());
    if (!session || !accountId) return NOBODY;
    const member = await memberFor(located.db, located.tenantId as never, accountId);
    return {
      accountId, email, signedIn: true, provenAt: session.provenAt,
      permissionsIn: permissionsResolver(located.db, located.tenantId as never, member,
        (appId) => (appId === "hello" ? HELLO.access.roles : null)),
    };
  },
});

const at = (host: string, path: string, init: RequestInit = {}) =>
  app()(new Request(`https://${host}.one.test${path}`, init));
const post = (host: string, path: string, body: unknown, cookie?: string) =>
  at(host, path, { method: "POST", body: JSON.stringify(body), headers: cookie ? { cookie } : {} });
const get = (host: string, path: string, cookie?: string) =>
  at(host, path, { headers: cookie ? { cookie } : {} });

const codeFor = (email: string) => sent.filter((s) => s.to === email).at(-1)!.code;
const cookieOf = (r: Response) => (r.headers.get("set-cookie") ?? "").split(";")[0]!;

async function signIn(email: string): Promise<string> {
  expect((await post("setup", "/api/me.code", { email })).status).toBe(200);
  const done = await post("setup", "/api/me.session", { email, code: codeFor(email) });
  expect(done.status).toBe(200);
  return cookieOf(done);
}

let ops = "";
let owner = "";

beforeAll(async () => {
  await applySchema(directory(), DIRECTORY_MODULES);
  await applySchema(shard(), [schemaFor(HELLO), ...SHARD_MODULES]);
  await addShard(directory(), "eu-1", "eu", 100);
  await noteShardApp(directory(), "eu-1", "hello");
});

beforeEach(async () => {
  sent.length = 0;
  for (const t of ["membership", "note", "audit", "replay"]) await shard().exec(`DELETE FROM ${t};`);
  for (const t of ["invited", "belongs", "tenant_app", "tenant", "session", "code", "account",
    "subscription", "maintenance", "deployment_flag", "plan_edit"]) {
    await directory().exec(`DELETE FROM ${t};`);
  }
  ops = await signIn("ops@example.com");
  owner = await signIn("sam@example.com");
  await post("setup", "/api/me.tenant.create",
    { slug: "eastgate", name: "Eastgate", country: "DE" }, owner);
});

/* --------------------------------------------------------------- the door --- */

describe("the console's two doors", () => {
  /*
    ⚠️ EVERY OPERATOR OPERATION, DERIVED — never one of them as a sample. A
    console reachable at a workspace's own address is the deployment's own
    surface offered to that workspace's members, and one operation asserted by
    name says nothing about the next one added beside it.

    ⚠️ THIS IS THE BEHAVIOURAL HALF OF A RULE `scripts/operator.test.mjs` ALSO
    CHECKS STATICALLY, and both are worth having: the static one reads the
    declaration, this one drives the door. A declaration that is right and a
    filter that stopped reading it would pass the first and fail here.

    ⚠️ AND DRIVING A WRITE AT THE WRONG DOOR IS SAFE, which is what makes the
    sweep possible. The door filter runs before the handler, so a refusal is the
    only thing that happens.
  */
  const EVERY_OP = Object.entries(operatorOps({
    apps: { hello }, isOperator: () => true,
  })).filter(([id]) => id.startsWith("op."));

  it("answers on the operator door and nowhere else", async () => {
    expect(EVERY_OP.length, "no operator operations were found at all").toBeGreaterThan(10);
    expect((await get("admin", "/api/op.tenants", ops)).status).toBe(200);

    for (const [id, op] of EVERY_OP) {
      for (const host of ["setup", "id", "eastgate"]) {
        const said = op.kind === "read"
          ? await get(host, `/api/${id}`, ops)
          : await post(host, `/api/${id}`, {}, ops);
        expect(said.status, `${id} at ${host}`).toBe(404);
      }
    }
  });

  /* ⚠️ Signed in is not the same as an operator. The deployment decides; a
     workspace owner is nobody here. */
  it("admits an operator and refuses everybody else", async () => {
    expect((await get("admin", "/api/op.tenants", owner)).status).toBe(403);
    expect((await get("admin", "/api/op.tenants")).status).toBe(401);
  });
});

/* ------------------------------------------------------------- the writes --- */

describe("what the console can change", () => {
  it("lists the workspaces with what each is on", async () => {
    const seen = await (await get("admin", "/api/op.tenants", ops)).json() as
      { items: { slug: string; apps: { id: string }[] }[]; apps: { id: string }[] };
    expect(seen.items.map((t) => t.slug)).toContain("eastgate");
    expect(seen.apps.map((a) => a.id)).toEqual(["hello"]);
  });

  /*
    ⚠️ ABSOLUTE, EITHER DIRECTION, CLEARED PER KEY. A workspace held at ten
    seats and then cleared is back on the plan's own number — not on whatever
    the last adjustment happened to be, and never with the grandfathering
    discarded along with it.
  */
  it("adjusts a tenant's entitlement, and clears one key back to the plan", async () => {
    const tenant = (await tenantBySlug(directory(), "eastgate"))!;
    /* ⚠️ NO APP IN THE BODY. An adjustment is against the WORKSPACE's membership,
       and `seats` is the platform's key — a per-app lookup refused half of what
       the console draws. */
    expect((await post("admin", "/api/op.tenant.adjust",
      { tenant: tenant.id, key: "seats", value: 25 }, ops)).status).toBe(200);

    const after = await (await get("admin", "/api/op.tenants", ops)).json() as
      { items: { slug: string; adjustments: Record<string, unknown> }[] };
    expect(after.items.find((t) => t.slug === "eastgate")!.adjustments.seats).toBe(25);

    expect((await post("admin", "/api/op.tenant.adjust",
      { tenant: tenant.id, key: "seats", value: null }, ops)).status).toBe(200);
    const cleared = await (await get("admin", "/api/op.tenants", ops)).json() as
      { items: { slug: string; adjustments: Record<string, unknown> }[] };
    expect(cleared.items.find((t) => t.slug === "eastgate")!.adjustments).toEqual({});
  });

  /*
    ⚠️ THE CONSOLE COULD ADJUST WHAT A WORKSPACE MAY DO AND COULD NOT SEE WHAT IT
    HAD. Every support conversation about credits starts with "how many do they
    have and where did they go", and answering it meant reading the database by
    hand.
  */
  it("shows what a workspace holds, and what it spent", async () => {
    const tenant = (await tenantBySlug(directory(), "eastgate"))!;
    const said = await (await get(
      "admin", `/api/op.tenant.money?tenant=${tenant.id}`, ops)).json() as {
        wallet: { granted: number; bought: number };
        statement: { reason: string; delta: number }[];
      };
    expect(said.wallet).toMatchObject({ granted: 0, bought: 0 });
    expect(said.statement).toEqual([]);
  });

  /*
    ⚠️ A COMP LANDS WHERE A PURCHASE DOES, NEVER IN THE ALLOWANCE. In the
    allowance it would be swept away by the next renewal — so an apology for
    something we broke would expire on the first of the month, silently, which
    is worse than not having made it.

    ⚠️ AND THE REASON IS REQUIRED, because this is the only write in the system
    that adds money with no payment behind it. A balance that moved with nothing
    explaining it is the one thing nobody can reconstruct.
  */
  it("gives credits that survive a renewal, and refuses a comp with no reason", async () => {
    const tenant = (await tenantBySlug(directory(), "eastgate"))!;

    expect((await post("admin", "/api/op.tenant.comp",
      { tenant: tenant.id, credits: 500 }, ops)).status).toBe(400);
    expect((await post("admin", "/api/op.tenant.comp",
      { tenant: tenant.id, credits: 0, why: "sorry" }, ops)).status).toBe(400);

    expect((await post("admin", "/api/op.tenant.comp",
      { tenant: tenant.id, credits: 500, why: "The outage on the 14th" }, ops)).status).toBe(200);

    const said = await (await get(
      "admin", `/api/op.tenant.money?tenant=${tenant.id}`, ops)).json() as {
        wallet: { granted: number; bought: number };
        statement: { reason: string; delta: number }[];
      };
    /* ⚠️ In `bought`, never in `granted`. */
    expect(said.wallet).toMatchObject({ granted: 0, bought: 500 });
    /* ⚠️ And on the statement the CUSTOMER reads, in the operator's own words. */
    expect(said.statement.some((m) => m.reason === "The outage on the 14th" && m.delta === 500))
      .toBe(true);
  });

  /*
    ⚠️ A PLAN AN OPERATOR GIVES IS THE OTHER WRITER OF `plan_id`, and the rule it
    looks like it breaks is not the rule. "Only a signed event may stamp a plan"
    exists so a WORKSPACE cannot grant itself one; an operator stands outside
    every workspace and leaves a dated row saying the plan was given.
  */
  it("gives a workspace a plan nobody is paying for, and its credits with it", async () => {
    const tenant = (await tenantBySlug(directory(), "eastgate"))!;

    expect((await post("admin", "/api/op.tenant.plan",
      { tenant: tenant.id, plan: "ghost" }, ops)).status).toBe(400);

    expect((await post("admin", "/api/op.tenant.plan",
      { tenant: tenant.id, plan: "solo" }, ops)).status).toBe(200);

    const seen = await (await get("admin", "/api/op.tenants", ops)).json() as
      { items: { slug: string; planId: string; compedAt: string | null }[] };
    const line = seen.items.find((t) => t.slug === "eastgate")!;
    expect(line.planId).toBe("solo");
    /* ⚠️ GIVEN, NOT BOUGHT — the two look identical on the row and only one of
       them has an invoice behind it. */
    expect(line.compedAt).not.toBeNull();

    /* ⚠️ AND THE CREDITS ARRIVE NOW, because the sweep that renews a comped
       workspace runs tomorrow. A comp that took a day to become usable is one
       an operator makes twice. */
    const money = await (await get(
      "admin", `/api/op.tenant.money?tenant=${tenant.id}`, ops)).json() as {
        wallet: { granted: number };
      };
    expect(money.wallet.granted).toBeGreaterThan(0);
  });

  /*
    ⚠️ THE MONTH'S ALLOWANCE IS OVERRIDABLE AND IS NOT AN ENTITLEMENT. It rides
    the same write because the semantics are identical — absolute, either
    direction, cleared per key — and it must never join the entitlement list,
    because that is the one `walk` iterates and the walk ends in a clamp that
    would confiscate a balance.
  */
  it("sets a workspace's monthly allowance, and clears it back to the plan's", async () => {
    const tenant = (await tenantBySlug(directory(), "eastgate"))!;
    await post("admin", "/api/op.tenant.plan", { tenant: tenant.id, plan: "solo" }, ops);

    const read = async () => (await (await get(
      "admin", `/api/op.tenant.money?tenant=${tenant.id}`, ops)).json()) as {
        allowance: { monthly: number; plan: number };
      };
    const onPlan = (await read()).allowance.plan;

    expect((await post("admin", "/api/op.tenant.adjust",
      { tenant: tenant.id, key: "credits", value: 40000 }, ops)).status).toBe(200);
    expect((await read()).allowance.monthly).toBe(40000);

    /* ⚠️ AND THE RENEWAL GRANTS THE SAME NUMBER. An override honoured by the
       screen and not by the clock is a promise of credits that never arrive. */
    expect((await post("admin", "/api/op.tenant.plan",
      { tenant: tenant.id, plan: "solo" }, ops)).status).toBe(200);
    const money = await (await get(
      "admin", `/api/op.tenant.money?tenant=${tenant.id}`, ops)).json() as {
        wallet: { granted: number };
      };
    expect(money.wallet.granted).toBe(40000);

    expect((await post("admin", "/api/op.tenant.adjust",
      { tenant: tenant.id, key: "credits", value: null }, ops)).status).toBe(200);
    expect((await read()).allowance.monthly).toBe(onPlan);
  });

  /* ⚠️ A switch nothing declares is a switch that does nothing — refused, or
     the console fills with rows that lie. */
  /*
    ⚠️ THE WHOLE PATH, BECAUSE EVERY PIECE OF IT WAS GREEN WHILE NONE OF IT
    WORKED. The kernel resolved, the console wrote, the manifest refused a flag
    nothing was behind — and no request ever read the store, so switching a flag
    changed nothing anywhere. Unit tests on `resolve` passed. The console's own
    round trip passed. What nobody asserted is the only thing that matters: does
    pressing the switch change what a person is served.

    ⚠️ SO IT ASSERTS THE SURFACE, NOT THE STORE. `centre.view` is what the page
    is drawn from, so a screen behind a flag either arrives or does not — the
    same question the gate answers for the route, from the same resolved map.
  */
  it("a switch changes what a workspace is served, at either level", async () => {
    const offered = async () => {
      const v = await (await get("eastgate", "/api/centre.view", owner)).json() as
        { apps: { screens: { route: string }[] }[] };
      return !!v.apps[0]?.screens.some((s) => s.route === "/search");
    };
    const flag = "note-search";
    const eastgate = (await tenantBySlug(directory(), "eastgate"))!.id;
    const set = (body: Record<string, unknown>) =>
      post("admin", "/api/op.flag.set", { id: flag, ...body }, ops);

    /* ⚠️ `note-search` declares `fallback: false`, so untouched is withheld. */
    expect(await offered()).toBe(false);

    expect((await set({ on: true })).status).toBe(200);
    expect(await offered()).toBe(true);

    /* ⚠️ A WORKSPACE MAY NARROW WHAT THE DEPLOYMENT ALLOWS. */
    expect((await set({ on: false, tenant: eastgate })).status).toBe(200);
    expect(await offered()).toBe(false);

    /* ⚠️ AND CLEARING ITS ROW RETURNS IT TO THE LEVEL ABOVE — `null`, not
       `false`. Without the clear, trying a feature on ten workspaces leaves ten
       permanent exceptions nobody remembers making. */
    expect((await set({ on: null, tenant: eastgate })).status).toBe(200);
    expect(await offered()).toBe(true);

    /*
      ⚠️ THE DEPLOYMENT'S `off` IS ABSORBING, WHICH IS WHAT MAKES IT A KILL
      SWITCH — and it is why the deployment level must be clearable too. One
      press of off would otherwise end every trial permanently: no workspace can
      hold what the deployment has refused.
    */
    expect((await set({ on: false })).status).toBe(200);
    expect((await set({ on: true, tenant: eastgate })).status).toBe(200);
    expect(await offered()).toBe(false);

    expect((await set({ on: null })).status).toBe(200);
    expect(await offered()).toBe(true);
  });

  /*
    ⚠️ `setBy: "tenant"` WAS A WORD, AND THIS IS WHAT MAKES IT A CAPABILITY. The
    kernel's `resolve` has always narrowed at three levels, `settableBy` has
    always said who may change one — and the only caller either ever had was a
    browser drawing a switch on the operator's screen. A workspace could not set
    the level the declaration says is theirs.
  */
  it("lets a workspace decide a switch that is theirs, and refuses one that is not", async () => {
    const offered = async () => {
      const v = await (await get("eastgate", "/api/centre.view", owner)).json() as
        { apps: { screens: { route: string }[] }[] };
      return !!v.apps[0]?.screens.some((s) => s.route === "/search");
    };

    /* ⚠️ Offered, because `note-search` says `setBy: "tenant"` and the
       deployment has not decided. */
    const mine = await (await get("eastgate", "/api/flag.list", owner)).json() as
      { items: { id: string; on: boolean; chosen: boolean | null }[] };
    expect(mine.items.map((f) => f.id)).toEqual(["note-search"]);
    expect(mine.items[0]).toMatchObject({ on: false, chosen: null });

    expect((await post("eastgate", "/api/flag.set",
      { id: "note-search", on: true }, owner)).status).toBe(200);
    expect(await offered()).toBe(true);

    /*
      ⚠️ AND THE DEPLOYMENT'S `off` REFUSES THE WRITE RATHER THAN STORING IT. A
      row written under a kill switch is a decision the product never honours,
      and the workspace would have been told it worked.
    */
    expect((await post("admin", "/api/op.flag.set", { id: "note-search", on: false }, ops))
      .status).toBe(200);
    expect((await post("eastgate", "/api/flag.set",
      { id: "note-search", on: true }, owner)).status).toBe(404);
    expect(await offered()).toBe(false);

    /* ⚠️ AND IT IS NOT EVEN OFFERED while the deployment says no — a control
       that cannot change anything is worse than an absent one. */
    const under = await (await get("eastgate", "/api/flag.list", owner)).json() as
      { items: unknown[] };
    expect(under.items).toEqual([]);
  });

  /* ⚠️ WHAT THE CONSOLE HAS TO BE ABLE TO SAY. A flag off at the deployment and
     on for eleven workspaces draws the same row as one nobody has touched, so
     the screen reports "off" about a feature eleven customers are using. */
  it("reports how many workspaces hold an exception", async () => {
    const eastgate = (await tenantBySlug(directory(), "eastgate"))!.id;
    await post("admin", "/api/op.flag.set",
      { id: "note-search", on: true, tenant: eastgate }, ops);
    const seen = await (await get("admin", "/api/op.flags", ops)).json() as
      { tried: Record<string, { on: number; off: number }> };
    expect(seen.tried["note-search"]).toEqual({ on: 1, off: 0 });
  });

  it("switches a declared flag and refuses one nothing declares", async () => {
    expect((await post("admin", "/api/op.flag.set", { id: "note-search", on: true }, ops)).status).toBe(200);
    const seen = await (await get("admin", "/api/op.flags", ops)).json() as
      { deployment: Record<string, boolean> };
    expect(seen.deployment["note-search"]).toBe(true);
    expect((await post("admin", "/api/op.flag.set", { id: "ghost", on: true }, ops)).status).toBe(404);
  });

  it("reads the jobs and the ground", async () => {
    expect((await get("admin", "/api/op.jobs", ops)).status).toBe(200);
    const ground = await (await get("admin", "/api/op.shards", ops)).json() as
      { items: { id: string }[] };
    expect(ground.items.map((s) => s.id)).toContain("eu-1");
  });

  /*
    ⚠️ THE PRICE LIST, EDITED THROUGH THE DOOR RATHER THAN THROUGH A DEPLOY. What
    this asserts past the unit tests is that the edit REACHES the rest of the
    product: `op.tenants` prices against the same list a gate resolves against, so
    an edit visible on one and not the other is a screen promising what a route
    refuses.
  */
  it("edits a plan, holds everybody on it, and puts it back", async () => {
    const tenant = (await tenantBySlug(directory(), "eastgate"))!;
    expect((await post("admin", "/api/op.tenant.plan",
      { tenant: tenant.id, plan: "solo" }, ops)).status).toBe(200);

    const cut = await post("admin", "/api/op.plan.edit",
      { plan: "solo", edit: { price: 1900, includes: { seats: 1 } } }, ops);
    expect(cut.status).toBe(200);
    /* ⚠️ AND IT SAYS HOW MANY IT HELD. An operator who narrows a tier is told
       what that did — otherwise the safest thing this product does is invisible. */
    expect((await cut.json() as { held: number }).held).toBe(1);

    const seen = await (await get("admin", "/api/op.plans", ops)).json() as {
      declared: { id: string; price: number }[];
      sold: { id: string; price: number }[];
      on: Record<string, number>;
    };
    expect(seen.sold.find((p) => p.id === "solo")?.price).toBe(1900);
    /* ⚠️ AND WHAT THE CODE SAYS, BESIDE IT — a screen that showed only the
       current number could not offer a way back to the declaration. */
    expect(seen.declared.find((p) => p.id === "solo")?.price).toBe(1200);
    expect(seen.on.solo).toBe(1);

    /* ⚠️ THE WHOLE PRODUCT READS THE EDIT, not just the screen that made it. */
    const tenants = await (await get("admin", "/api/op.tenants", ops)).json() as
      { plans: { id: string; price: number }[] };
    expect(tenants.plans.find((p) => p.id === "solo")?.price).toBe(1900);

    /* ⚠️ A CATALOGUE CI WOULD REFUSE CANNOT BE TYPED IN HERE EITHER. */
    expect((await post("admin", "/api/op.plan.edit",
      { plan: "none", edit: { price: 400 } }, ops)).status).toBe(400);

    expect((await post("admin", "/api/op.plan.reset", { plan: "solo" }, ops)).status).toBe(200);
    const back = await (await get("admin", "/api/op.plans", ops)).json() as
      { sold: { id: string; price: number }[] };
    expect(back.sold.find((p) => p.id === "solo")?.price).toBe(1200);
  });

  /* ⚠️ AND IT IS THE OPERATOR DOOR'S, like everything else here. */
  it("refuses a price change from anywhere but the console", async () => {
    expect((await post("eastgate", "/api/op.plan.edit",
      { plan: "solo", edit: { price: 1 } }, owner)).status).toBe(404);
  });
});

/* ------------------------------------------------------- maintenance --- */

describe("maintenance", () => {
  const mode = async (m: string) =>
    expect((await post("admin", "/api/op.maintenance.set", { mode: m }, ops)).status).toBe(200);

  it("serves reads and refuses writes on readonly", async () => {
    expect((await post("eastgate", "/api/note.create", { title: "Before" }, owner)).status).toBe(200);
    await mode("readonly");

    const wrote = await post("eastgate", "/api/note.create", { title: "During" }, owner);
    expect(wrote.status).toBe(503);
    expect((await wrote.json() as { problem: { code: string } }).problem.code).toBe("platform.maintenance");
    /* ⚠️ Reads keep serving — people find their records where they left them. */
    expect((await get("eastgate", "/api/note.list", owner)).status).toBe(200);

    await mode("off");
    expect((await post("eastgate", "/api/note.create", { title: "After" }, owner)).status).toBe(200);
  });

  it("withholds both on full, and never the way out", async () => {
    await mode("full");
    expect((await get("eastgate", "/api/note.list", owner)).status).toBe(503);
    expect((await post("eastgate", "/api/note.create", { title: "No" }, owner)).status).toBe(503);

    /* ⚠️ THE EXEMPTIONS ARE THE FEATURE. The operator door still answers, or
       nobody can lift it; the personal lane still answers, or somebody's way
       out of a workspace is something our maintenance can prevent. */
    expect((await get("admin", "/api/op.maintenance", ops)).status).toBe(200);
    expect((await get("setup", "/api/me.who", owner)).status).toBe(200);
    expect((await post("setup", "/api/me.leave", { slug: "nowhere" }, owner)).status).toBe(404);

    await mode("off");
  });

  it("refuses a mode nobody declared", async () => {
    expect((await post("admin", "/api/op.maintenance.set", { mode: "sideways" }, ops)).status).toBe(400);
  });
});
