/**
 * AN AI ACTION, BOUND AND WORDED, THROUGH THE REAL DOORS (D19).
 *
 * ⚠️ ONE RESOLVER, THREE AUTHORITIES: the app declares, the operator rewords
 * for the deployment, a workspace rewords its own — and only where the app
 * said it may. What this proves is that the screens and the run read the SAME
 * answer, because a screen promising a wording the run does not use is the
 * failure that nobody sees until an output is subtly wrong.
 */

import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { running } from "@engine/runtime";
import { asLocating } from "./wiring.js";
import type { ModelRow } from "@engine/kernel";
import {
  DIRECTORY_MODULES, SHARD_MODULES,
  AI_ACTION_SCHEMA, AUDIT_SCHEMA, BILLING_SCHEMA, DIRECTORY_SCHEMA, IDENTITY_SCHEMA,
  MEMBERSHIP_SCHEMA, NOBODY, OPERATOR_SCHEMA, REPLAY_SCHEMA, SETTING_SCHEMA,
  addShard, applySchema, memberFor, noteShardApp, operatorOps, permissionsResolver,
  personalOps, schemaFor, serve, sessionIdFrom, tenantBySlug, whoIs, type Db,
} from "@engine/runtime";
import { GROUND, ground } from "../src/index.js";

const directory = () => env.DIRECTORY as unknown as Db;
const shard = () => env.SHARD_EU_1 as unknown as Db;

const ROOTS = { root: "one.test" };
const sent: { to: string; code: string }[] = [];

const MODELS: readonly ModelRow[] = [
  { id: "@cf/meta/small", provider: "cf", task: "text-generation", label: "Small", meter: "token",
    input: 1, output: 3, multiplier: 5, enabled: true, maxOutput: 1000 },
  { id: "gemini-2.5-pro", provider: "google", task: "chat", label: "Pro", meter: "token",
    input: 10, output: 30, multiplier: 5, enabled: true, maxOutput: 4000 },
];

const app = () => serve({
  roots: ROOTS,
  apps: { ground },
  directory: directory(),
  shardOf: () => shard(),
  personal: {
    ...personalOps({
      secret: "test-secret", sells: () => ["ground"],
      deliver: async (to, code) => { sent.push({ to, code }); },
      deliverExport: async () => undefined,
    }),
    ...operatorOps({
      apps: { ground },
      isOperator: (email) => email === "ops@example.com",
      models: async () => MODELS,
    }),
  },
  locate: asLocating(async (door) => {
    if (door.kind !== "tenant" || !door.slug) return null;
    const tenant = await tenantBySlug(directory(), door.slug);
    return tenant
      ? {
        tenantId: tenant.id, db: shard(), apps: ["ground"],
        entitlements: [{ key: "seats", value: 10, source: "plan" as const, plan: 10 }],
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
        (appId) => (appId === "ground" ? GROUND.access.roles : null)),
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
  return cookieOf(done);
}

let ops = "";
let owner = "";

beforeAll(async () => {
  await applySchema(directory(), DIRECTORY_MODULES);
  await applySchema(shard(), [schemaFor(GROUND), ...SHARD_MODULES]);
  await addShard(directory(), "eu-1", "eu", 100);
  await noteShardApp(directory(), "eu-1", "ground");
});

beforeEach(async () => {
  sent.length = 0;
  for (const t of ["membership", "note", "audit", "replay", "ai_wording"]) {
    await shard().exec(`DELETE FROM ${t};`);
  }
  for (const t of ["invited", "belongs", "tenant_app", "tenant", "session", "code", "account",
    "ai_binding"]) {
    await directory().exec(`DELETE FROM ${t};`);
  }
  ops = await signIn("ops@example.com");
  owner = await signIn("sam@example.com");
  await post("setup", "/api/me.tenant.create",
    { slug: "northgate", name: "Northgate", country: "DE", apps: ["ground"] }, owner);
});

/* ---------------------------------------------------------------- derived --- */

describe("what the console sees", () => {
  it("lists every generating action with its lane and the rows it could run on", async () => {
    const seen = await (await get("admin", "/api/op.ai", ops)).json() as {
      apps: { id: string; actions: {
        id: string; lane: string; brandable: boolean; wordedBy: string;
        model: string | null; choices: { id: string }[];
      }[] }[];
    };
    const action = seen.apps[0]!.actions.find((a) => a.id === "note.draft")!;
    expect(action.lane).toBe("text");
    expect(action.brandable).toBe(true);
    /* ⚠️ Nobody has bound anything, so the lane's election answers — and the
       screen says the words are still the app's. */
    expect(action.wordedBy).toBe("app");
    expect(action.model).toBe("@cf/meta/small");
    /* ⚠️ Only rows this lane can use, and only enabled ones. */
    expect(action.choices.map((c) => c.id).sort()).toEqual(["@cf/meta/small", "gemini-2.5-pro"]);
  });
});

/* ---------------------------------------------------------------- binding --- */

describe("the operator's binding", () => {
  it("binds a model in the lane and refuses one outside it", async () => {
    expect((await post("admin", "/api/op.ai.bind",
      { app: "ground", action: "note.draft", model: "gemini-2.5-pro" }, ops)).status).toBe(200);
    const seen = await (await get("admin", "/api/op.ai", ops)).json() as
      { apps: { actions: { id: string; model: string | null; bound: string | null }[] }[] };
    const action = seen.apps[0]!.actions.find((a) => a.id === "note.draft")!;
    expect(action.bound).toBe("gemini-2.5-pro");
    expect(action.model).toBe("gemini-2.5-pro");

    /* ⚠️ A binding to a row the lane cannot use is a binding that would
       silently fall back — refused at the write instead. */
    expect((await post("admin", "/api/op.ai.bind",
      { app: "ground", action: "note.draft", model: "no-such-model" }, ops)).status).toBe(400);
  });

  it("rewords an action for the deployment, and refuses an unknown variable", async () => {
    expect((await post("admin", "/api/op.ai.bind",
      { app: "ground", action: "note.draft", prompt: "In one line, about {about}." }, ops)).status)
      .toBe(200);
    const seen = await (await get("admin", "/api/op.ai", ops)).json() as
      { apps: { actions: { id: string; prompt: string; wordedBy: string }[] }[] };
    const action = seen.apps[0]!.actions.find((a) => a.id === "note.draft")!;
    expect(action.prompt).toBe("In one line, about {about}.");
    expect(action.wordedBy).toBe("operator");

    expect((await post("admin", "/api/op.ai.bind",
      { app: "ground", action: "note.draft", prompt: "About {ghost}." }, ops)).status).toBe(400);
  });

  it("is the operator's alone", async () => {
    expect((await post("admin", "/api/op.ai.bind",
      { app: "ground", action: "note.draft", model: "gemini-2.5-pro" }, owner)).status).toBe(403);
  });
});

/* ---------------------------------------------------------------- wording --- */

describe("a workspace's own words", () => {
  it("rewords a brandable action, and clears back to the level above", async () => {
    expect((await post("northgate", "/api/ai.word",
      { app: "ground", action: "note.draft", prompt: "Warmly, about {about}." }, owner)).status)
      .toBe(200);
    const mine = await (await get("northgate", "/api/ai.wording?app=ground", owner)).json() as
      { items: { id: string; prompt: string | null; declared: string }[] };
    expect(mine.items.find((i) => i.id === "note.draft")!.prompt).toBe("Warmly, about {about}.");

    expect((await post("northgate", "/api/ai.word",
      { app: "ground", action: "note.draft", prompt: null }, owner)).status).toBe(200);
    const back = await (await get("northgate", "/api/ai.wording?app=ground", owner)).json() as
      { items: { id: string; prompt: string | null }[] };
    expect(back.items.find((i) => i.id === "note.draft")!.prompt).toBe(null);
  });

  it("refuses an unknown variable and anything but workspace authority", async () => {
    expect((await post("northgate", "/api/ai.word",
      { app: "ground", action: "note.draft", prompt: "About {ghost}." }, owner)).status).toBe(400);

    await post("northgate", "/api/member.invite",
      { email: "alex@example.com", platformRole: "customer", appRoles: { ground: "reader" } }, owner);
    const customer = await signIn("alex@example.com");
    expect((await post("northgate", "/api/ai.word",
      { app: "ground", action: "note.draft", prompt: "Mine now." }, customer)).status).toBe(403);
  });
});

/* ------------------------------------------------------------- resolution --- */

describe("the one resolver", () => {
  const def = GROUND.operations.find((o) => o.id === "note.draft")!.ai!;

  it("reads the app's words, then the operator's, and never loses either", () => {
    expect(running(def, MODELS, undefined, undefined).wordedBy).toBe("app");
    expect(running(def, MODELS, { app: "ground", action: "note.draft", model: null, prompt: "Ours." }, undefined))
      .toMatchObject({ prompt: "Ours.", wordedBy: "operator" });
  });

  /*
    ⚠️ A WORKSPACE ADDS AND NEVER REPLACES, WHICH IS WHY THE BASE NEVER TRAVELS.
    It used to substitute — and a substitution has to be seeded with the current
    text to be editable at all, so every prompt the deployment had would be
    shipped to the browser of anybody who could open the screen.
  */
  it("appends the workspace's words to ours rather than replacing them", () => {
    const out = running(def, MODELS,
      { app: "ground", action: "note.draft", model: null, prompt: "Ours." }, "Theirs.");
    expect(out.prompt).toContain("Ours.");
    expect(out.prompt).toContain("Theirs.");
    /* ⚠️ AND THEIRS IS LAST, which is the only order that does anything: a model
       follows the later instruction when two conflict, so an addendum put first
       would be overridden by our own text and the setting would save and change
       nothing. */
    expect(out.prompt.indexOf("Theirs.")).toBeGreaterThan(out.prompt.indexOf("Ours."));
    /* ⚠️ The base is still ours — `wordedBy` describes who wrote the letterhead,
       and adding to it does not make it theirs. */
    expect(out.wordedBy).toBe("operator");
    expect(out.addendum).toBe("Theirs.");
  });

  /* ⚠️ A sealed action ignores a tenant's wording wherever it came from —
     resolved here, so a row written before the app changed its mind cannot
     still be in force. */
  it("ignores an addendum on an action the app sealed", () => {
    const sealed = { ...def, brandable: false };
    const out = running(sealed, MODELS, undefined, "Theirs.");
    expect(out.prompt).not.toContain("Theirs.");
    expect(out.addendum).toBe(null);
  });

  /*
    ⚠️ THE WORKSPACE'S OWN PICK BEATS THE OPERATOR'S BINDING, because the run is
    charged to their wallet at the row's own multiplier — so they are choosing
    what THEY pay. The operator's binding is the default, not the ceiling.
  */
  it("runs the model the workspace chose over the one bound for them", () => {
    const bound = { app: "ground", action: "note.draft", model: MODELS[0]!.id, prompt: null };
    expect(running(def, MODELS, bound, undefined).model?.id).toBe(MODELS[0]!.id);
    expect(running(def, MODELS, bound, undefined, MODELS[1]!.id).model?.id).toBe(MODELS[1]!.id);
  });
});
