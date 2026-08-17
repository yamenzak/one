/**
 * A WORKSPACE IS PERSONAL OR IT IS A BUSINESS, AND EVERYTHING ELSE FOLLOWS.
 *
 * ⚠️ THIS IS THE STAGE'S EXIT CRITERION, DRIVEN THROUGH THE REAL DOORS. Somebody
 * signs in, makes a workspace, meets the refusal, is given an allowance by an
 * operator, becomes a business, brands it, and installs it — and the tile their
 * phone would fetch is the one they chose.
 *
 * ⚠️ AND HALF OF IT IS THINGS THAT MUST NOT WORK. A personal workspace branding
 * itself, a commercial-only operation answering on one, a second workspace
 * spending an allowance that is gone, and — the one nothing else would catch —
 * a business being quietly rolled back to personal.
 */

import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  DIRECTORY_MODULES, SHARD_MODULES,
  AUDIT_SCHEMA, BILLING_SCHEMA, BRANDING_SCHEMA, DIRECTORY_SCHEMA, IDENTITY_SCHEMA,
  INBOX_SCHEMA, MEMBERSHIP_SCHEMA, NOBODY,
  REPLAY_SCHEMA, addShard, applySchema, brandingOf, locator, memberFor, noteShardApp,
  permissionsResolver, personalOps, operatorOps, schemaFor, serve, sessionIdFrom, tenantBySlug,
  whoIs, type Db,
} from "@engine/runtime";
import { HELLO, hello } from "../src/index.js";

const directory = () => env.DIRECTORY as unknown as Db;
const shard = () => env.SHARD_EU_1 as unknown as Db;

const ROOTS = { root: "one.test" };
const OPERATOR = "ops@example.com";
const sent: { to: string; code: string }[] = [];

const app = () => serve({
  roots: ROOTS,
  apps: { hello },
  directory: directory(),
  shardOf: () => shard(),
  /* ⚠️ WHO WE ARE, so a personal workspace has a mark to wear. A deployment
     that has not said serves no manifest at all — see `installableFor`. */
  installable: { name: "One", mark: "◇" },
  personal: {
    ...personalOps({
      secret: "test-secret", appId: "hello",
      deliver: async (to, code) => { sent.push({ to, code }); },
      isOperator: (email) => email === OPERATOR,
    }),
    ...operatorOps({ apps: { hello }, isOperator: (email) => email === OPERATOR }),
  },
  /* ⚠️ THE REAL LOCATOR, because the whole point is that it reports the kind.
     A hand-written one in the test would prove the gate reads a value the test
     supplied, which is not the claim. */
  locate: locator({
    directory: directory(),
    shardOf: () => shard(),
    appsOf: async () => [HELLO],
    plans: [],
    charging: async () => false,
  }),
  identify: async (request, located) => {
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

/** ⚠️ One slug per test file — two files racing on a unique index fail far away. */
const SLUG = "harbourside";

async function workspace(): Promise<string> {
  const cookie = await signIn("sam@example.com");
  const made = await post("setup", "/api/me.tenant.create",
    { slug: SLUG, name: "Harbourside", country: "DE" }, cookie);
  expect(made.status).toBe(200);
  return cookie;
}

/**
 * An operator hands out N, which is the lane that exists before anything takes
 * a card.
 *
 * ⚠️ IT RETURNS THE OPERATOR'S COOKIE, AND CALLERS REUSE IT. Signing the same
 * address in twice inside one test meets the code cooldown — correctly — and
 * fails as a 429 several lines from the line that caused it.
 */
async function comp(n: number): Promise<string> {
  const ops = await signIn(OPERATOR);
  const done = await post("admin", "/api/op.account.commercial",
    { email: "sam@example.com", granted: n }, ops);
  expect(done.status).toBe(200);
  return ops;
}

const READABLE = { ground: "#101014", ink: "#f5f5f7", accent: "#7aa2f7", mark: "H" };

beforeAll(async () => {
  await applySchema(directory(), DIRECTORY_MODULES);
  await applySchema(shard(), [schemaFor(HELLO), ...SHARD_MODULES]);
  await addShard(directory(), "eu-1", "eu", 100);
  await noteShardApp(directory(), "eu-1", "hello");
});

beforeEach(async () => {
  sent.length = 0;
  for (const t of ["membership", "custom_role", "note", "check_in", "audit", "replay",
    "notify_policy", "notify_preference"]) {
    await shard().exec(`DELETE FROM ${t};`);
  }
  for (const t of ["tenant_branding", "invited", "belongs", "tenant_app", "tenant",
    "session", "code", "account"]) {
    await directory().exec(`DELETE FROM ${t};`);
  }
});

/* ------------------------------------------------------------ born personal --- */

describe("a new workspace", () => {
  /*
    ⚠️ NOBODY IS ASKED WHETHER THEY ARE A BUSINESS WHILE PICKING AN ADDRESS.
    Becoming one takes a legal name and a payment, and neither exists in a
    wizard — so offering the choice there would mean writing `commercial` on a
    row that has met neither condition, which is a one-way door opened by
    accident.
  */
  it("is personal, whatever the body says", async () => {
    const cookie = await signIn("sam@example.com");
    await post("setup", "/api/me.tenant.create",
      { slug: SLUG, name: "Harbourside", country: "DE", kind: "commercial" }, cookie);
    expect((await tenantBySlug(directory(), SLUG))?.kind).toBe("personal");
  });

  it("cannot use a commercial-only operation, and is told what to do about it", async () => {
    const cookie = await workspace();
    const made = await post(SLUG, "/api/note.create", { title: "A note" }, cookie);
    const { id } = await made.json() as { id: string };

    const no = await post(SLUG, "/api/note.share", { id }, cookie);
    expect(no.status).toBe(402);
    const body = await no.json() as { problem: { code: string; detail?: string } };
    /* ⚠️ NOT `payment_required`. A plan is something this workspace can change
       today; no plan it can buy makes it a business. */
    expect(body.problem.code).toBe("platform.commercial_required");
    /* ⚠️ The name is in the sentence, and a missing value renders its token. */
    expect(body.problem.detail).toContain("Harbourside");
    expect(body.problem.detail).not.toContain("{");
  });

  it("cannot brand itself, and the refusal comes from the write rather than the screen", async () => {
    const cookie = await workspace();
    const no = await post(SLUG, "/api/brand.write",
      { theme: READABLE, surfaces: ["shell"] }, cookie);
    expect(no.status).toBe(402);
    expect((await no.json() as { problem: { code: string } }).problem.code)
      .toBe("platform.commercial_required");
    expect(await brandingOf(directory(), (await tenantBySlug(directory(), SLUG))!.id)).toBe(null);
  });

  /* ⚠️ AND ITS TILE IS OURS, WHICH IS THE HONEST DEFAULT RATHER THAN A BLANK. */
  it("installs under our mark", async () => {
    await workspace();
    const manifest = await (await get(SLUG, "/manifest.webmanifest")).json() as
      { name: string; short_name: string; start_url: string; scope: string };
    expect(manifest.short_name).toBe("Harbourside");
    expect(manifest.name).toContain("One");
    /* ⚠️ The origin's root and the whole origin — a scope narrowed to one
       product sends every app switch out of the installed window. */
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");

    const icon = await get(SLUG, "/icon.svg");
    expect(icon.headers.get("content-type")).toContain("image/svg+xml");
    expect(await icon.text()).toContain("◇");
  });
});

/* --------------------------------------------------------- becoming one --- */

describe("becoming a business", () => {
  it("refuses without a legal name, and without a payment or an allowance", async () => {
    const cookie = await workspace();
    expect((await post("setup", "/api/me.tenant.commercial",
      { slug: SLUG, legalName: "   " }, cookie)).status).toBe(400);
    expect((await post("setup", "/api/me.tenant.commercial",
      { slug: SLUG, legalName: "Harbourside GmbH" }, cookie)).status).toBe(402);
    expect((await tenantBySlug(directory(), SLUG))?.kind).toBe("personal");
  });

  it("goes through on an operator's allowance, and everything follows from it", async () => {
    const cookie = await workspace();
    await comp(1);

    const done = await post("setup", "/api/me.tenant.commercial",
      { slug: SLUG, legalName: "Harbourside GmbH" }, cookie);
    expect(done.status).toBe(200);
    const row = (await tenantBySlug(directory(), SLUG))!;
    expect(row.kind).toBe("commercial");
    expect(row.legalName).toBe("Harbourside GmbH");

    /* The commercial-only operation now answers. */
    const made = await post(SLUG, "/api/note.create", { title: "A note" }, cookie);
    const { id } = await made.json() as { id: string };
    expect((await post(SLUG, "/api/note.share", { id }, cookie)).status).toBe(200);

    /* And the brand takes, on the workspace rather than on the app. */
    expect((await post(SLUG, "/api/brand.write",
      { theme: READABLE, surfaces: ["shell", "email"] }, cookie)).status).toBe(200);
    expect((await brandingOf(directory(), row.id))?.theme.ground).toBe("#101014");
  });

  /* ⚠️ ONE WAY, AND THERE IS NO OPERATION FOR THE OTHER DIRECTION. Asserted by
     asking for one: a route that appeared later would answer instead of 404. */
  it("cannot be undone", async () => {
    const cookie = await workspace();
    await comp(1);
    await post("setup", "/api/me.tenant.commercial", { slug: SLUG, legalName: "H GmbH" }, cookie);

    expect((await post("setup", "/api/me.tenant.personal", { slug: SLUG }, cookie)).status).toBe(404);
    /* ...and asking again is a conflict rather than a second charge. */
    expect((await post("setup", "/api/me.tenant.commercial",
      { slug: SLUG, legalName: "H GmbH" }, cookie)).status).toBe(409);
    expect((await tenantBySlug(directory(), SLUG))?.kind).toBe("commercial");
  });

  /* ⚠️ AN ALLOWANCE RUNS OUT, WHICH IS WHY IT IS A COUNT RATHER THAN A SWITCH. */
  it("spends the allowance, and the next workspace is refused", async () => {
    const cookie = await workspace();
    await comp(1);
    expect((await post("setup", "/api/me.tenant.commercial",
      { slug: SLUG, legalName: "H GmbH" }, cookie)).status).toBe(200);

    await post("setup", "/api/me.tenant.create",
      { slug: "harbourside-two", name: "Harbourside Two", country: "DE" }, cookie);
    expect((await post("setup", "/api/me.tenant.commercial",
      { slug: "harbourside-two", legalName: "H Two GmbH" }, cookie)).status).toBe(402);
  });

  /* ⚠️ AND ONLY SOMEBODY WHO CAN RUN THE PLACE, because it puts a legal name on
     invoices in their name. */
  it("is refused to somebody who cannot run the workspace", async () => {
    const cookie = await workspace();
    await comp(2);
    /* ⚠️ `customer`, and not to dodge the seat ceiling: it is the role with no
       workspace authority at all, which is what this is asking about. */
    expect((await post(SLUG, "/api/member.invite",
      { email: "alex@example.com", platformRole: "customer", appRoles: { hello: "reader" } },
      cookie)).status).toBe(200);
    const theirs = await signIn("alex@example.com");

    expect((await post("setup", "/api/me.tenant.commercial",
      { slug: SLUG, legalName: "Sneaky GmbH" }, theirs)).status).toBe(403);
  });
});

/* -------------------------------------------------------------- the brand --- */

describe("a business's own identity", () => {
  const asBusiness = async () => {
    const cookie = await workspace();
    await comp(1);
    await post("setup", "/api/me.tenant.commercial", { slug: SLUG, legalName: "H GmbH" }, cookie);
    return cookie;
  };

  /*
    ⚠️ AN UNREADABLE PAIR IS REFUSED RATHER THAN WARNED ABOUT. The person
    choosing is not the person who has to read it, and they will never see the
    problem: they are on their own screen, at their own brightness, having
    already decided.
  */
  it("refuses a pair its own customers could not read", async () => {
    const cookie = await asBusiness();
    const no = await post(SLUG, "/api/brand.write",
      { theme: { ground: "#ffffff", ink: "#f4f4f5" }, surfaces: ["shell"] }, cookie);
    expect(no.status).toBe(400);
  });

  it("reaches the installed tile, which is where somebody looks for it", async () => {
    const cookie = await asBusiness();
    await post(SLUG, "/api/brand.write", { theme: READABLE, surfaces: ["shell"] }, cookie);

    const manifest = await (await get(SLUG, "/manifest.webmanifest")).json() as
      { name: string; theme_color: string };
    /* ⚠️ Their name alone — ours is not appended to a business's own tile. */
    expect(manifest.name).toBe("Harbourside");
    expect(manifest.name).not.toContain("One");
    expect(manifest.theme_color).toBe("#101014");

    const icon = await (await get(SLUG, "/icon.svg")).text();
    expect(icon).toContain("#101014");
    expect(icon).toContain(">H<");
  });

  /* ⚠️ PUBLIC BY CONSTRUCTION, because a phone fetches a manifest with no
     session and often no cookie jar — anything behind a login installs as a
     browser default. */
  it("is served with no session at all", async () => {
    await asBusiness();
    expect((await get(SLUG, "/manifest.webmanifest")).status).toBe(200);
    expect((await get(SLUG, "/icon.svg")).status).toBe(200);
  });

  /*
    ⚠️ INSTALLABLE NOWHERE BUT A WORKSPACE'S OWN DOOR. The setup and operator
    doors are not places anybody comes back to: a manifest there is a tile whose
    `start_url` opens the sign-up wizard, or the console, for ever.
  */
  it("cannot be installed from the setup or operator doors", async () => {
    await asBusiness();
    expect((await get("setup", "/manifest.webmanifest")).status).toBe(404);
    expect((await get("admin", "/manifest.webmanifest")).status).toBe(404);
  });

  /*
    ⚠️ AN ICON IS THE OPPOSITE QUESTION, AND THOSE DOORS HAD NONE. Every door is
    a page in a browser tab and the tab draws something whether or not we supply
    it — so the first three screens anybody sees carried a blank page symbol
    beside our name. What must never happen is one workspace's brand on the
    deployment's own address, and that is what is asserted: the doors wear OURS.
  */
  it("gives every other door the deployment's own icon, never a workspace's", async () => {
    await asBusiness();
    for (const door of ["setup", "admin", "id"]) {
      const got = await get(door, "/icon.svg");
      expect(got.status, `${door}: /icon.svg`).toBe(200);
      const svg = await got.text();
      expect(svg, `${door} is wearing a workspace's colour`).not.toContain("#101014");
      expect(svg, `${door} is wearing a workspace's letter`).not.toContain(">H<");
    }
  });
});

/* ------------------------------------------------------- a shard of its own --- */

/**
 * ⚠️ RESERVING IS NOT MOVING, AND THE SPLIT IS DELIBERATE. This writes the
 * placement RULE — from here on the shard takes one workspace and nobody else —
 * which is cheap and reversible. Carrying the records across two databases is a
 * migration and belongs where a migration belongs.
 */
describe("a database of one workspace's own", () => {
  it("is refused to a personal workspace", async () => {
    await workspace();
    const ops = await signIn(OPERATOR);
    const no = await post("admin", "/api/op.shard.dedicate", { shard: "eu-1", slug: SLUG }, ops);
    expect(no.status).toBe(402);
    expect((await no.json() as { problem: { code: string } }).problem.code)
      .toBe("platform.commercial_required");
  });

  /* ⚠️ AND NEVER OVER A DATABASE FULL OF OTHER PEOPLE'S RECORDS. Selling
     isolation on a shard that already holds strangers is a promise nothing
     downstream would catch: every workspace on it keeps working. */
  it("is refused on a shard that already holds somebody else", async () => {
    const cookie = await workspace();
    const ops = await comp(1);
    await post("setup", "/api/me.tenant.commercial", { slug: SLUG, legalName: "H GmbH" }, cookie);

    const other = await signIn("kim@example.com");
    await post("setup", "/api/me.tenant.create",
      { slug: "harbourside-three", name: "Third", country: "DE" }, other);

    expect((await post("admin", "/api/op.shard.dedicate",
      { shard: "eu-1", slug: SLUG }, ops)).status).toBe(409);
  });

  it("takes, and then the shard reports whose it is", async () => {
    const cookie = await workspace();
    const ops = await comp(1);
    await post("setup", "/api/me.tenant.commercial", { slug: SLUG, legalName: "H GmbH" }, cookie);

    expect((await post("admin", "/api/op.shard.dedicate",
      { shard: "eu-1", slug: SLUG }, ops)).status).toBe(200);

    const seen = await (await get("admin", "/api/op.shards", ops)).json() as
      { items: { id: string; dedicatedTo?: string }[] };
    const tenant = (await tenantBySlug(directory(), SLUG))!;
    expect(seen.items.find((s) => s.id === "eu-1")?.dedicatedTo).toBe(tenant.id);
  });
});

/**
 * A NOTIFICATION THAT ASKS SOMEBODY TO DO SOMETHING MAY NOT BE SILENCED.
 *
 * ⚠️ THE RULE WAS WRITTEN AND NOT IN FORCE, WHICH IS THE WHOLE POINT OF THIS
 * FILE'S NEIGHBOUR. `refusePolicy`'s own header says the `action` rule lives
 * there "rather than hidden in a screen … a screen that simply does not render
 * the switch is a rule that lasts until the second screen, or the API, or the
 * import that sets preferences in bulk" — and nothing called it. The policy
 * screen disabled the control; the route took whatever it was sent.
 *
 * ⚠️ DRIVEN THROUGH THE DOOR, because the point is the API rather than the
 * function. A unit test on `refusePolicy` passed the whole time it was unwired.
 */
describe("what a person may not switch off", () => {
  it("refuses to silence a notification that asks them to act", async () => {
    const cookie = await workspace();

    /* ⚠️ The activity one narrows freely — that is the control working. */
    const narrowed = await post(SLUG, "/api/inbox.preference",
      { type: "note.published", channels: ["inbox"] }, cookie);
    expect(narrowed.status).toBe(200);

    /* ⚠️ The action one may be narrowed to an interruption, never below it. */
    const kept = await post(SLUG, "/api/inbox.preference",
      { type: "note.review_asked", channels: ["inbox", "email"] }, cookie);
    expect(kept.status).toBe(200);

    const muted = await post(SLUG, "/api/inbox.preference",
      { type: "note.review_asked", channels: ["inbox"] }, cookie);
    expect(muted.status).toBe(400);

    /* ⚠️ AND THE WORKSPACE'S CEILING IS HELD TO IT TOO. An owner silencing an
       action for everybody is the same refusal one authority up. */
    const ceiling = await post(SLUG, "/api/inbox.policy",
      { type: "note.review_asked", channels: ["inbox"] }, cookie);
    expect(ceiling.status).toBe(400);
  });

  /*
    ⚠️ AND A CHANNEL THE TYPE DOES NOT OFFER IS NOT STORABLE. Without the check
    the row is written and read back by the dispatcher, which then tries to reach
    somebody by a route the notification never declared.
  */
  it("refuses a channel the notification does not offer", async () => {
    const cookie = await workspace();
    /* ⚠️ `note.published` offers inbox and email; push is not on offer for it. */
    const out = await post(SLUG, "/api/inbox.preference",
      { type: "note.published", channels: ["inbox", "push"] }, cookie);
    expect(out.status).toBe(400);
  });

  /* ⚠️ AND A TYPE THE APP DOES NOT HAVE IS NOT STORABLE EITHER — a row keyed on
     a name nothing dispatches, read back forever by the settings screen. */
  it("refuses a notification type this app never declared", async () => {
    const cookie = await workspace();
    const out = await post(SLUG, "/api/inbox.preference",
      { type: "note.invented", channels: ["inbox"] }, cookie);
    expect(out.status).toBe(400);
  });
});

/* ------------------------------------------------------------- a setting --- */

/**
 * A SETTING REACHES CODE.
 *
 * ⚠️ THE WHOLE SETTINGS RAIL WAS THE SURFACED HALF WITH NOTHING UNDER IT. A
 * declaration rendered a control, the control saved, the value was drawn back —
 * and no handler could read one, because a handler's context carried an
 * entitlement allowance and nothing else. A switch that changes nothing is worse
 * than an absent feature: somebody presses it and stops looking for the thing it
 * promised.
 *
 * ⚠️ AND THE LEVEL IS THE HALF THAT FAILS IN SILENCE. A `tenant` setting is
 * stored under the empty account and a `person` setting under the caller's;
 * reading the wrong row gives every member whatever the last one set, with the
 * value looking perfectly plausible.
 */
describe("a setting a handler can read", () => {
  it("answers the declared fallback before anybody has chosen", async () => {
    const cookie = await workspace();
    const said = await get(SLUG, "/api/note.start", cookie).then((r) => r.json()) as
      { kind: string; pinned: boolean };
    expect(said).toEqual({ kind: "idea", pinned: false });
  });

  it("answers what the workspace switched to, on the very next call", async () => {
    const cookie = await workspace();
    expect((await post(SLUG, "/api/setting.write",
      { app: "hello", id: "notes.default_kind", value: "decision" }, cookie)).status).toBe(200);
    expect((await post(SLUG, "/api/setting.write",
      { app: "hello", id: "notes.default_pinned", value: true }, cookie)).status).toBe(200);

    const said = await get(SLUG, "/api/note.start", cookie).then((r) => r.json()) as
      { kind: string; pinned: boolean };
    expect(said).toEqual({ kind: "decision", pinned: true });
  });

  /*
    ⚠️ AND SOMEBODY WHO CANNOT SEE THE SETTING STILL GETS ITS CONSEQUENCE, which
    is the reason this is an operation rather than the form reading the settings
    for itself. Both are `tenant` level behind `tenant:manage`; a writer holds
    `note:write` and not that.
  */
  it("gives its consequence to somebody who may not read it", async () => {
    const cookie = await workspace();
    await post(SLUG, "/api/setting.write",
      { app: "hello", id: "notes.default_kind", value: "question" }, cookie);
    /* ⚠️ A `customer` WITH THE APP'S WRITER ROLE, and both halves are the point.
       The platform office is what costs a seat and what carries `tenant:manage`;
       the app role is what carries `note:write`. Somebody who can write a note
       and cannot manage the workspace is exactly the caller this is about — and
       inviting a second `staff` here would meet the free plan's one seat and
       fail several lines from the assertion. */
    expect((await post(SLUG, "/api/member.invite",
      { email: "writer@example.com", platformRole: "customer", appRoles: { hello: "writer" } },
      cookie)).status).toBe(200);
    const theirs = await signIn("writer@example.com");

    const seen = await get(SLUG, "/api/setting.read?app=hello", theirs).then((r) => r.json()) as
      { tenant: Record<string, unknown> };
    expect(seen.tenant["notes.default_kind"], "a writer can read a setting they may not manage")
      .toBeUndefined();

    const answered = await get(SLUG, "/api/note.start", theirs);
    expect(answered.status, JSON.stringify(await answered.clone().json())).toBe(200);
    const said = await answered.json() as { kind: string };
    expect(said.kind).toBe("question");
  });
});
