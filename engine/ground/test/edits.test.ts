/**
 * CHANGING ONE FACT FROM THE ROW THAT SHOWS IT, THROUGH THE REAL DOOR.
 *
 * ⚠️ WHAT HAS TO BE TRUE IS ON BOTH SIDES OF A SEAM, which is why this is driven
 * rather than unit-tested. The declaration says which fields a row offers; the
 * door decides whether this person may write them and sends the SPEC each one
 * is, because the sheet is drawn from the declaration rather than from a flag.
 * A test on either half alone passes while the other sends nothing.
 *
 * ⚠️ AND THE REFUSAL IS THE HALF THAT MATTERS MOST. A reader is sent no fields,
 * so no pencil is drawn — never a disabled one, and never one that opens onto a
 * Save the door refuses, which is the worse of the two because they type the
 * correction first.
 */

import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { editsIn } from "@engine/kernel";
import {
  DIRECTORY_MODULES, SHARD_MODULES, NOBODY,
  addShard, applySchema, createTenant, found, memberFor, noteBelonging,
  noteShardApp, permissionsResolver, personalOps, schemaFor, serve, sessionIdFrom,
  startSession, tenantBySlug, upsertAccount, whoIs, type Db,
} from "@engine/runtime";
import { asLocating } from "./wiring.js";
import { GROUND, ground } from "../src/index.js";

const directory = () => env.DIRECTORY as unknown as Db;
const shard = () => env.SHARD_EU_1 as unknown as Db;

const APPS = { ground };
const SLUG = "edited";

const app = () => serve({
  roots: { root: "one.test" },
  apps: APPS,
  directory: directory(),
  shardOf: () => shard(),
  personal: personalOps({
    secret: "test-secret", sells: () => ["ground"],
    deliver: async () => undefined,
    deliverExport: async () => undefined,
    isOperator: () => false,
  }),
  /* ⚠️ The quota, or every write below is a 402 — see `bin.test`. */
  locate: asLocating(async (door) => {
    if (door.kind !== "tenant" || !door.slug) return null;
    const tenant = await tenantBySlug(directory(), door.slug);
    return tenant
      ? {
        tenantId: tenant.id, db: shard(), apps: ["ground"],
        entitlements: [
          { key: "seats", value: 10, source: "plan" as const, plan: 10 },
          { key: "notes", value: 100, source: "plan" as const, plan: 100 },
        ],
      }
      : null;
  }),
  identify: async (request, finding) => {
    const located = await finding;
    if (!located) return NOBODY;
    const { session, email, accountId } =
      await whoIs(directory(), sessionIdFrom(request), new Date());
    if (!session || !accountId) return NOBODY;
    const member = await memberFor(located.db, located.tenantId as never, accountId);
    return {
      accountId, email, signedIn: true, provenAt: session.provenAt,
      permissionsIn: permissionsResolver(located.db, located.tenantId as never, member,
        (appId) => APPS[appId as keyof typeof APPS]?.().access.roles ?? null),
    };
  },
});

const at = (path: string, init: RequestInit = {}) =>
  app()(new Request(`https://${SLUG}.one.test${path}`, init));

let cookie = "";
let readerCookie = "";

const post = (path: string, body: unknown, who = cookie) => at(path, {
  method: "POST",
  headers: { cookie: who, "content-type": "application/json" },
  body: JSON.stringify(body),
});

const screenFor = async (id: string, record: string, who = cookie) => {
  const said = await at(`/api/screen/${id}?record=${record}`, { headers: { cookie: who } });
  return [said.status, await said.json()] as const;
};

beforeAll(async () => {
  await applySchema(directory(), DIRECTORY_MODULES);
  await applySchema(shard(), [schemaFor(GROUND), ...SHARD_MODULES]);
  await addShard(directory(), "eu-1", "eu", 100);
  await noteShardApp(directory(), "eu-1", "ground");
});

beforeEach(async () => {
  for (const t of ["membership", "note", "audit", "replay"]) await shard().exec(`DELETE FROM ${t};`);
  for (const t of ["belongs", "tenant_app", "tenant", "session", "account"]) {
    await directory().exec(`DELETE FROM ${t};`);
  }
  const made = await createTenant(directory(), {
    slug: SLUG, name: "Edited", country: "DE", where: "eu", apps: ["ground"],
  });
  if (typeof made === "string") throw new Error(made);

  const me = await upsertAccount(directory(), "owner@example.com", null);
  await found(shard(), made.tenant.id as never, me as never, "owner@example.com",
    { ground: "writer" });
  await noteBelonging(directory(), me as never, made.tenant.id as never);
  cookie = `one_session=${(await startSession(directory(), me as never)).id}`;

  /* ⚠️ A SECOND PERSON WHO MAY READ AND NOT WRITE, because that is the only way
     to ask the question this file exists for. A `holds` stubbed to false would
     be a test of the stub — the `reader` role really does carry `note:read` and
     really does not carry `note:write`, and that is what is being relied on. */
  const them = await upsertAccount(directory(), "reader@example.com", null);
  await found(shard(), made.tenant.id as never, them as never, "reader@example.com",
    { ground: "reader" });
  await noteBelonging(directory(), them as never, made.tenant.id as never);
  readerCookie = `one_session=${(await startSession(directory(), them as never)).id}`;
});

const makeNote = async (): Promise<string> => {
  const said = await post("/api/note.create", {
    title: "Sharpen the saw", body: "…", kind: "idea", minutes: 20,
  });
  expect(said.status, await said.clone().text()).toBe(200);
  return (await said.json() as { id: string }).id;
};

describe("a screen says which of its facts can be changed", () => {
  it("sends the declaration of every field a row offers, and nothing else", async () => {
    const id = await makeNote();
    const [status, said] = await screenFor("note", id);
    expect(status, JSON.stringify(said)).toBe(200);

    const edits = (said as { edits: Record<string, { kind: string; label: string }> }).edits;
    /* ⚠️ DERIVED FROM THE BODY RATHER THAN LISTED HERE — the same argument
       `declared.test` makes about views. A written list is a second copy of the
       declaration and goes stale the day a row gains a pencil. */
    const offered = editsIn(GROUND.screens!.find((s) => s.id === "note")!.body!);
    expect(Object.keys(edits).sort()).toEqual([...offered].sort());

    /* ⚠️ THE SPEC, NOT A FLAG. The sheet is drawn from it — the control, the
       help, the option names — so a `true` here would leave the browser holding
       a pencil and no way to draw what it opens. */
    expect(edits["kind"]?.kind).toBe("enum");
    expect(edits["kind"]?.label).toBe(GROUND.collections
      .find((c) => c.id === "note")!.fields["kind"]!.label);
  });

  /* ⚠️ AND A FACT NOBODY MAY EDIT IS ABSENT, which is the decision on that row
     rather than an omission — what `cost` shows is what a draft SPENT. */
  it("leaves out a fact the screen shows and does not offer", async () => {
    const id = await makeNote();
    const [, said] = await screenFor("note", id);
    expect((said as { edits: Record<string, unknown> }).edits["cost"]).toBeUndefined();
  });

  /* ⚠️ THE HALF THAT MATTERS MOST. No fields, so no pencil — a reader is not
     shown a control they cannot follow through. */
  it("sends nothing to somebody who may read and not write", async () => {
    const id = await makeNote();
    const [status, said] = await screenFor("note", id, readerCookie);
    expect(status, JSON.stringify(said)).toBe(200);
    expect((said as { edits: Record<string, unknown> }).edits).toEqual({});
  });
});

describe("changing one fact changes one fact", () => {
  it("writes the field and leaves the rest of the record standing", async () => {
    const id = await makeNote();
    /* ⚠️ THE SAME WRITE THE SHEET RUNS — the generated update, named from the
       screen's own collection. Nothing about the row is a second operation. */
    expect((await post("/api/note.update", { id, kind: "decision" })).status).toBe(200);

    const [, said] = await screenFor("note", id);
    const record = (said as { record: Record<string, unknown> }).record;
    expect(record["kind"]).toBe("decision");
    expect(record["title"]).toBe("Sharpen the saw");
    expect(record["minutes"]).toBe(20);
  });

  it("refuses the person who was sent no fields", async () => {
    const id = await makeNote();
    expect((await post("/api/note.update", { id, kind: "decision" }, readerCookie)).status)
      .toBe(403);
  });
});
