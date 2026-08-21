/**
 * THE CATALOGUE, THROUGH THE REAL DOOR — read it, switch a model on, elect it.
 *
 * ⚠️ EVERY OTHER SUITE HANDS THE CONSOLE A FIXTURE, WHICH IS WHY THE CONSOLE
 * SHIPPED WITHOUT A CATALOGUE AT ALL. `operatorOps` defaults `models` to an
 * empty list so a deployment that has wired none degrades into a sentence
 * instead of a crash; the tests all pass their own, so the ONE caller that
 * omitted it was the one that is not a test — and the screen reported an empty
 * world on a deployment holding sixty-four rows.
 *
 * ⚠️ SO THIS SUITE READS THE TABLE. It is the only place the operator's three
 * decisions — sold here, the lane's default, the margin — travel the whole way:
 * a POST on the operator door, a column in the directory, and the next read
 * saying so. A switch that saves nothing looks identical to one that saves.
 */

import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  DIRECTORY_MODULES, SHARD_MODULES,
  NOBODY, addShard, applySchema, memberFor, modelsOf, noteShardApp, operatorOps,
  permissionsResolver, personalOps, readCatalogue, schemaFor, serve, sessionIdFrom, syncModels,
  tenantBySlug, whoIs, type Db,
} from "@engine/runtime";
import { asLocating } from "./wiring.js";
import { HELLO, hello } from "../src/index.js";

const directory = () => env.DIRECTORY as unknown as Db;
const shard = () => env.SHARD_EU_1 as unknown as Db;

const ROOTS = { root: "one.test" };
const sent: { to: string; code: string }[] = [];

/**
 * ⚠️ THE ROWS ARRIVE THE WAY THEY REALLY DO — a provider's catalogue read by
 * `readCatalogue` and applied by `syncModels`, so the columns the sync writes
 * and the columns the console reads are the same columns.
 *
 * ⚠️ AND THE FIXTURE IS THE VENDOR'S OWN SHAPE, WHICH IS THE HALF THAT MATTERS.
 * Written by hand in our spelling — `text-generation`, the id in `id` — it
 * agrees with the parser about everything the parser gets wrong: the first
 * draft of this file passed while the live deployment had four empty lanes and
 * sixty-four models keyed by a UUID. `task` here is a DISPLAY name with a
 * capital and a space, and the path is in `name`, because that is what
 * Cloudflare publishes.
 */
const CATALOGUE = [
  {
    id: "41975cc2-c82e-4e98-b7b8-88ffb186a545",
    name: "@cf/meta/llama-3.1-8b-instruct",
    task: { name: "Text Generation" },
    properties: [{ property_id: "price", value: [
      { unit: "per M input tokens", price: 0.28 },
      { unit: "per M output tokens", price: 0.83 },
    ] }],
  },
  {
    id: "6f4e6dca-e2ee-4d4a-b3d9-b6e2e5e5f7a1",
    name: "@cf/meta/llama-3.3-70b",
    task: { name: "Text Generation" },
    properties: [{ property_id: "price", value: [
      { unit: "per M input tokens", price: 0.29 },
      { unit: "per M output tokens", price: 2.25 },
    ] }],
  },
  {
    id: "b8f2c1d0-11aa-4f0e-9c3b-2d5e7a9c4b61",
    name: "@cf/black-forest-labs/flux-1-schnell",
    task: { name: "Text-to-Image" },
    properties: [{ property_id: "price", value: [{ unit: "per 512x512 tile", price: 53 }] }],
  },
  /* ⚠️ Speech and embeddings, whose display names are the ones that did NOT
     resolve: two words and a space against a hyphenated alias table. */
  {
    id: "c3a9e1f4-77bb-42dd-8f1a-9e0c6b3d2a58",
    name: "@cf/openai/whisper",
    task: { name: "Automatic Speech Recognition" },
    properties: [{ property_id: "price", value: [{ unit: "per 1k seconds", price: 4.5 }] }],
  },
  {
    id: "d7b4a2c8-33ee-49aa-b0c7-1f8e5d4a6b29",
    name: "@cf/baai/bge-m3",
    task: { name: "Text Embeddings" },
    properties: [{ property_id: "price", value: [{ unit: "per M input tokens", price: 0.012 }] }],
  },
];

const FOUND = readCatalogue(CATALOGUE);
const ID = {
  small: "@cf/meta/llama-3.1-8b-instruct",
  big: "@cf/meta/llama-3.3-70b",
  image: "@cf/black-forest-labs/flux-1-schnell",
  listen: "@cf/openai/whisper",
  embed: "@cf/baai/bge-m3",
} as const;

const app = () => serve({
  roots: ROOTS,
  apps: { hello },
  directory: directory(),
  shardOf: () => shard(),
  personal: {
    ...personalOps({
      secret: "test-secret", sells: () => ["hello"],
      deliver: async (to, code) => { sent.push({ to, code }); },
      deliverExport: async () => undefined,
    }),
    ...operatorOps({
      apps: { hello },
      isOperator: (email) => email === "ops@example.com",
      /* ⚠️ THE TABLE, NOT A FIXTURE — see the header. */
      models: () => modelsOf(directory()),
    }),
  },
  locate: asLocating(async (door) => {
    if (door.kind !== "tenant" || !door.slug) return null;
    const tenant = await tenantBySlug(directory(), door.slug);
    return tenant
      ? { tenantId: tenant.id, db: shard(), apps: ["hello"], entitlements: [] }
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
  return cookieOf(await post("setup", "/api/me.session", { email, code: codeFor(email) }));
}

interface Shown {
  readonly id: string; readonly lane: string | null;
  readonly enabled: boolean; readonly isDefault: boolean; readonly multiplier: number;
}
interface Fault { readonly of: string; readonly why: string }

const catalogue = async (cookie: string) => {
  const res = await get("admin", "/api/op.models", cookie);
  expect(res.status).toBe(200);
  return await res.json() as { models: Shown[]; faults: Fault[]; floor: number };
};

const row = (all: readonly Shown[], id: string) => all.find((m) => m.id === id)!;

let ops = "";

beforeAll(async () => {
  await applySchema(directory(), DIRECTORY_MODULES);
  await applySchema(shard(), [schemaFor(HELLO), ...SHARD_MODULES]);
  await addShard(directory(), "eu-1", "eu", 100);
  await noteShardApp(directory(), "eu-1", "hello");
});

beforeEach(async () => {
  sent.length = 0;
  for (const t of ["ai_model", "session", "code", "account"]) {
    await directory().exec(`DELETE FROM ${t};`);
  }
  await syncModels(directory(), FOUND);
  ops = await signIn("ops@example.com");
});

describe("what the console is shown", () => {
  it("reads the rows the sync wrote", async () => {
    const at = await catalogue(ops);
    expect(at.models.map((m) => m.id).sort()).toEqual(Object.values(ID).slice().sort());
  });

  /*
    ⚠️ THE LANE IS THE WHOLE POINT OF THE SCREEN, and it is resolved from a name
    the provider chose. A catalogue whose task names do not map leaves every
    group empty while every row is present — which reads as "the models are
    missing" and is really "nothing can ever select them".
  */
  it("resolves each row's lane from the provider's own task name", async () => {
    const at = await catalogue(ops);
    expect(row(at.models, ID.small).lane).toBe("text");
    expect(row(at.models, ID.image).lane).toBe("image");
    /* ⚠️ The two whose display names are two words — the shape that failed. */
    expect(row(at.models, ID.listen).lane).toBe("listen");
    expect(row(at.models, ID.embed).lane).toBe("embed");
  });

  /* ⚠️ New rows arrive disabled — nothing starts answering because it appeared. */
  it("brings nothing in switched on", async () => {
    const at = await catalogue(ops);
    expect(at.models.every((m) => !m.enabled)).toBe(true);
  });
});

describe("the three decisions", () => {
  /*
    ⚠️ THE SWITCH IS THE ONE THAT CANNOT BE PROVED BY LOOKING. It moves whether
    or not the write landed — the control is drawn from the row it just asked to
    change — so a save that quietly does nothing and a save that works are the
    same picture until the next read.
  */
  it("switches a model on, and the next read says so", async () => {
    const on = await post("admin", "/api/op.model.decide",
      { model: ID.small, enabled: true }, ops);
    expect(on.status).toBe(200);
    expect(row((await catalogue(ops)).models, ID.small).enabled).toBe(true);

    const off = await post("admin", "/api/op.model.decide",
      { model: ID.small, enabled: false }, ops);
    expect(off.status).toBe(200);
    expect(row((await catalogue(ops)).models, ID.small).enabled).toBe(false);
  });

  /* ⚠️ One default per lane — two claiming it makes which one runs depend on
     row order, which is a change in behaviour nobody made. */
  it("moves the default rather than adding a second", async () => {
    for (const id of [ID.small, ID.big]) {
      await post("admin", "/api/op.model.decide", { model: id, enabled: true }, ops);
      await post("admin", "/api/op.model.decide", { model: id, isDefault: true }, ops);
    }
    const at = await catalogue(ops);
    expect(at.models.filter((m) => m.isDefault).map((m) => m.id))
      .toEqual([ID.big]);
  });

  it("saves a margin, and refuses one at cost", async () => {
    const ok = await post("admin", "/api/op.model.decide",
      { model: ID.big, multiplier: 8 }, ops);
    expect(ok.status).toBe(200);
    expect(row((await catalogue(ops)).models, ID.big).multiplier).toBe(8);

    const no = await post("admin", "/api/op.model.decide",
      { model: ID.big, multiplier: 1 }, ops);
    expect(no.status).toBe(400);
    expect(row((await catalogue(ops)).models, ID.big).multiplier).toBe(8);
  });
});

/**
 * ⚠️ A FAULT LIST THAT NAMES EVERY ROW IS A FAULT LIST NOBODY READS. A catalogue
 * carries models for tasks this deployment does not sell — classifiers,
 * translators, rerankers — and they are not problems, they are simply not on
 * offer. Reported as faults they bury the one entry that matters.
 */
describe("what counts as a fault", () => {
  it("says nothing about a model in no lane until somebody turns it on", async () => {
    await syncModels(directory(), readCatalogue([...CATALOGUE, {
      id: "e1c2b3a4-55ff-4c1d-9a2e-3b7c8d9e0f12",
      name: "@cf/huggingface/distilbert-sst-2-int8",
      task: { name: "Text Classification" },
      properties: [{ property_id: "price", value: [{ unit: "per M input tokens", price: 0.02 }] }],
    }]));

    const quiet = await catalogue(ops);
    expect(quiet.faults.some((f) => f.of.includes("distilbert"))).toBe(false);

    await post("admin", "/api/op.model.decide",
      { model: "@cf/huggingface/distilbert-sst-2-int8", enabled: true }, ops);
    const loud = await catalogue(ops);
    expect(loud.faults.find((f) => f.of.includes("distilbert"))?.why).toBe("unknown_task");
  });
});
