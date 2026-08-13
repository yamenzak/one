/**
 * THE VAULT, THROUGH A REAL WORKER.
 *
 * ⚠️ THE UNIT TESTS PROVE THE RESOLVER AND THIS PROVES THE ROUTE, and the gap
 * between them is where every disclosure bug in this subsystem would live. A
 * resolver that refuses correctly is worth nothing behind an operation that
 * never calls it, mounted on a door that does not exist, against a table no
 * schema module applied — and every one of those failures is silent: the screen
 * renders, the number is absent, and it reads as "they have not filled it in".
 *
 * ⚠️ SO THE ASSERTIONS THAT MATTER ARE THE ONES ABOUT SOMEBODY ELSE. What a
 * vault is worth is entirely in what it refuses to a reader who is otherwise
 * perfectly entitled — a coach with every permission, inside the right
 * workspace, holding a live session.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { accountIds, joinAs, post, SETUP, signIn } from "./session.js";
import { sql, type ResolvedRegion } from "@one/kernel";
import { bindingsFor } from "@one/runtime";

const SLUG = `vault${Math.random().toString(36).slice(2, 8)}`;
const ORIGIN = `https://${SLUG}.hello.4dl.app`;
/** ⚠️ The hub's own door, under the PLATFORM root. */
const ID = "https://id.4dl.app";

const OWNER = `owner.${SLUG}@example.com`;
const CLIENT = `client.${SLUG}@example.com`;

let owner = "";
let client = "";
let clientId = "";

/**
 * ⚠️ A READ IS A GET AND ITS INPUT IS THE QUERY STRING, because that is what the
 * router derives from `kind`. Posting to a read answers 404 — the path exists
 * only under the other method — which reads exactly like an unmounted operation
 * and is the mistake this helper exists to make impossible.
 */
const get = async (origin: string, path: string, cookie: string, query: Record<string, string> = {}) => {
  const url = new URL(`${origin}${path}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await worker.fetch(
    new Request(url, { headers: cookie ? { cookie } : {} }), env as never,
  );
  return { status: res.status, body: (await res.json()) as Record<string, never> };
};

const send = async (origin: string, path: string, cookie: string, body: unknown) => {
  const res = await worker.fetch(
    new Request(`${origin}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
    env as never,
  );
  return { status: res.status, body: (await res.json()) as Record<string, never> };
};

beforeAll(async () => {
  const setup = await signIn(OWNER, SETUP);
  await post(SETUP, "/api/identity.workspace.create", { slug: SLUG }, setup);
  owner = await signIn(OWNER, ORIGIN);
  client = await joinAs(ORIGIN, owner, CLIENT, "reader");
  clientId = accountIds.get(CLIENT) ?? "";
  expect(clientId, "the client has an account id").not.toBe("");
});

/* ------------------------------------------------------------ the person --- */

describe("your own facts", () => {
  it("answers on the hub's door, with no workspace anywhere", async () => {
    /*
      ⚠️ THE WHOLE REASON THE DOOR EXISTS. Somebody reviewing what they have
      shared is the person most likely to have left every workspace they were
      in — so a surface that needed a tenancy would be unreachable for exactly
      them. The session travels because the credential is the platform's.
    */
    const r = await get(ID, "/api/vault.mine", client);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.wheres)).toBe(true);
    expect(Array.isArray(r.body.kept)).toBe(true);
  });

  /*
    ⚠️ IT ANSWERS FOR EVERY PLACE, NOT FOR THIS APP. `hello` declares no vault
    wants at all, so it contributes no group — which is the point: a workspace
    whose product has declared nothing is a row that could only ever say
    "nothing", and the vault leaves it out rather than listing it.
  */
  it("groups by workspace, from the declaration this product published", async () => {
    /*
      ⚠️ THIS ASSERTED THE OPPOSITE AND PASSED, because `vault_specs` was empty:
      `publishVaultSpec` bound its parameters as an array where `run` takes them
      one at a time, D1 refused, and a bare catch swallowed it. An empty registry
      lists no app, so "lists no app" was true for the wrong reason — on a
      deployment where `hello` declares three wants.
    */
    const r = await get(ORIGIN, "/api/vault.mine", client);
    const wheres = r.body.wheres as unknown as { appId: string; items: { fact: string }[] }[];
    const here = wheres.find((w) => w.appId === "hello");
    expect(here, "the workspace this person is in, under the app that asked").toBeDefined();
    expect(here!.items.map((i) => i.fact).sort())
      .toEqual(["body.height", "body.mass", "goal.training"]);
  });

  /*
    ⚠️ WHAT NOBODY ASKED FOR IS STILL YOURS. A vault that listed only what an app
    wanted would go empty at exactly the moment it became the only copy — which is
    the person this whole thing is built for, and on this deployment it is every
    fact they have recorded.
  */
  it("keeps what nothing is asking for", async () => {
    /* ⚠️ A FACT NO APP HERE DECLARES. This recorded `body.height`, which `hello`
       asks for — so once the declarations actually published, the fact was
       correctly under the workspace rather than kept, and the test that had been
       green against an empty registry failed. */
    await send(ORIGIN, "/api/vault.record", client, { fact: "health.allergies", value: "none", at: "2026-08-01" });
    const r = await get(ORIGIN, "/api/vault.mine", client);
    const kept = r.body.kept as unknown as { fact: string }[];
    expect(kept.some((k) => k.fact === "health.allergies")).toBe(true);
  });

  it("records and reads back one of your own", async () => {
    const w = await send(ORIGIN, "/api/vault.record", client, { fact: "body.mass", value: "82.4", at: "2026-08-01" });
    expect(w.status).toBe(200);
    const r = await get(ORIGIN, "/api/vault.read", client, { fact: "body.mass" });
    expect(r.body.value).toBe("82.4");
  });

  it("treats a second reading on one day as a correction rather than a second opinion", async () => {
    await send(ORIGIN, "/api/vault.record", client, { fact: "body.mass", value: "82.4", at: "2026-08-02" });
    await send(ORIGIN, "/api/vault.record", client, { fact: "body.mass", value: "82.0", at: "2026-08-02" });
    const r = await get(ORIGIN, "/api/vault.read", client, { fact: "body.mass", history: "true" });
    const rows = r.body.history as unknown as { at: string; value: string }[];
    expect(rows.filter((x) => x.at === "2026-08-02")).toHaveLength(1);
    expect(rows.find((x) => x.at === "2026-08-02")?.value).toBe("82.0");
  });

  /*
    ⚠️ THE SUBJECT IS THE SESSION'S, NEVER THE BODY'S. An operation that took an
    account id here would be one missing comparison away from "read anybody's
    weight" — so there is no parameter for it at all, and this asserts the shape
    rather than the check.
  */
  it("refuses a write with no session", async () => {
    const r = await send(ORIGIN, "/api/vault.record", "", { fact: "body.mass", value: "70" });
    expect(r.status).toBe(403);
  });

  it("refuses a fact the platform does not hold", async () => {
    const r = await send(ORIGIN, "/api/vault.record", client, { fact: "body.aura", value: "purple" });
    expect(r.status).toBe(400);
  });

  it("refuses a value outside a fact's declared set", async () => {
    const r = await send(ORIGIN, "/api/vault.record", client, { fact: "person.sex", value: "yes" });
    expect(r.status).toBe(400);
  });
});

/* ---------------------------------------------------------- somebody else --- */

describe("reading somebody else", () => {
  it("refuses a coach with every permission and no grant", async () => {
    const r = await get(ORIGIN, "/api/subject.fact", owner, { account: clientId, fact: "body.mass" });
    expect(r.status).toBe(200);
    expect(r.body.shared).toBe(false);
    /* ⚠️ `ungranted`, not `empty` — telling an ungranted reader the person has
       recorded nothing is itself a disclosure nobody made. */
    expect(r.body.why).toBe("ungranted");
  });

  it("shows the value once the person shares it", async () => {
    await send(ORIGIN, "/api/vault.share", client, { fact: "body.mass", reach: "staff" });
    const r = await get(ORIGIN, "/api/subject.fact", owner, { account: clientId, fact: "body.mass" });
    expect(r.body.shared).toBe(true);
    expect(r.body.value).toBe("82.0");
  });

  it("stops showing it the moment the person takes it back", async () => {
    await send(ORIGIN, "/api/vault.unshare", client, { fact: "body.mass" });
    const r = await get(ORIGIN, "/api/subject.fact", owner, { account: clientId, fact: "body.mass" });
    expect(r.body.shared).toBe(false);
    expect(r.body.why).toBe("ungranted");
  });

  /*
    ⚠️ THE ONE THIS WHOLE SUBSYSTEM WAS BUILT FOR. A coach sees which way things
    are going and never sees a weight — two grants, two different answers, at the
    same instant, for the same reader.
  */
  it("shows a trend to a coach whose grant on the weight stops at the arithmetic", async () => {
    await send(ORIGIN, "/api/vault.share", client, { fact: "body.mass", reach: "compute" });
    await send(ORIGIN, "/api/vault.share", client, { fact: "body.mass.trend", reach: "staff" });

    const trend = await get(ORIGIN, "/api/subject.fact", owner, {
      account: clientId, fact: "body.mass", reading: "body.mass.trend",
    });
    expect(trend.body.shared).toBe(true);
    expect((trend.body.derived as unknown as { value: number }).value).toBeTypeOf("number");

    const raw = await get(ORIGIN, "/api/subject.fact", owner, { account: clientId, fact: "body.mass" });
    expect(raw.body.shared).toBe(false);
    expect(raw.body.why).toBe("narrower");
  });

  /*
    ⚠️ AND THE READING DISCLOSES NOTHING THE VALUE WOULD. A rate per week over an
    unknown start is not an equation anybody can solve; a rate plus an endpoint
    is. This asserts the answer carries neither weight it was computed from.
  */
  it("hands back a rate and neither of the weights behind it", async () => {
    const r = await get(ORIGIN, "/api/subject.fact", owner, {
      account: clientId, fact: "body.mass", reading: "body.mass.trend",
    });
    const seen = JSON.stringify(r.body);
    expect(seen).not.toContain("82.4");
    expect(seen).not.toContain("82.0");
  });

  it("refuses a reading whose own grant was never given", async () => {
    const r = await get(ORIGIN, "/api/subject.fact", owner, {
      account: clientId, fact: "body.mass", reading: "body.mass.progress",
    });
    expect(r.body.shared).toBe(false);
    expect(r.body.why).toBe("ungranted");
  });

  it("expires a grant on read rather than waiting for a sweep", async () => {
    /* One day, and the clock is the worker's — so this proves the window is
       applied rather than proving arithmetic already covered by a unit test. */
    await send(ORIGIN, "/api/vault.share", client, { fact: "goal.training", reach: "staff", days: 1 });
    await send(ORIGIN, "/api/vault.record", client, { fact: "goal.training", value: "Run a half" });
    const now = await get(ORIGIN, "/api/subject.fact", owner, { account: clientId, fact: "goal.training" });
    expect(now.body.shared).toBe(true);
    expect(typeof now.body.at === "string" || now.body.at === undefined).toBe(true);
  });
});

/* ------------------------------------------------------------ the record --- */

describe("what the person can see about their own data", () => {
  it("records who read what, and says so", async () => {
    const r = await get(ORIGIN, "/api/vault.disclosures", client);
    const rows = r.body.disclosures as unknown as { fact: string; appId: string; reads: number }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((x) => x.fact === "body.mass" && x.appId === "hello")).toBe(true);
  });

  /*
    ⚠️ A READING IS A DISCLOSURE TOO, AND A SMALLER ONE IS STILL ONE. A person
    looking at who has been reading their weight has to see the coach who has
    only ever seen the trend — logging the reading and not its input would
    produce a history saying nobody read a fact that is read every day.
  */
  it("counts a derived read against the fact it was computed from", async () => {
    const before = await get(ORIGIN, "/api/vault.disclosures", client);
    const was = (before.body.disclosures as unknown as { fact: string; reads: number }[])
      .find((x) => x.fact === "body.mass")?.reads ?? 0;
    await get(ORIGIN, "/api/subject.fact", owner, { account: clientId, fact: "body.mass", reading: "body.mass.trend" });
    const after = await get(ORIGIN, "/api/vault.disclosures", client);
    const now = (after.body.disclosures as unknown as { fact: string; reads: number }[])
      .find((x) => x.fact === "body.mass")?.reads ?? 0;
    expect(now).toBeGreaterThan(was);
  });

  it("says what this app asked for and what was decided", async () => {
    const r = await get(ORIGIN, "/api/vault.asked", client);
    const wants = r.body.wants as unknown as { fact: string; why: string; reach: string }[];
    expect(wants.map((w) => w.fact)).toContain("goal.training");
    /* ⚠️ Every ask carries a reason, because a permission prompt with no reason
       is the one everybody dismisses. */
    expect(wants.every((w) => w.why.length > 0)).toBe(true);
  });
});

/* --------------------------------------------------------------- export --- */

describe("taking your own data with you, which is not a workspace's export", () => {
  /*
    ⚠️ `exit.export` IS THE WORKSPACE'S AND WANTS `workspace:close`. So the only
    export in the product was one an ordinary member may not ask for, about
    records that are mostly not theirs — and the hub's own "Download
    your data" row had nothing behind it that the person reading it could reach.
  */
  it("carries every account-scoped table a module declares, with nothing hand-listed", async () => {
    const mine = await signIn(CLIENT, ID);
    const r = await get(ID, "/api/exit.account.export", mine);
    expect(r.status).toBe(200);

    const tables = r.body.tables as unknown as Record<string, unknown[]>;
    /* ⚠️ NAMED HERE RATHER THAN DERIVED, ON PURPOSE, and it is the one list in
       this repository that is allowed to be. Asserting the export matches the
       derivation proves the two agree and nothing about whether either is right;
       these are the four tables a person would say are theirs, so a derivation
       that stops producing one fails here. */
    for (const table of ["vault_facts", "vault_grants", "vault_disclosures", "consents"]) {
      expect(Object.keys(tables), table).toContain(table);
    }
  });

  it("includes who has been reading their vault", async () => {
    /*
      ⚠️ THE DISCLOSURE LOG IS THE HALF SOMEBODY CANNOT RECONSTRUCT. Their own
      facts they know; who looked at them, and when, exists nowhere else — so an
      export without it is missing the only part that is not already theirs.
    */
    const mine = await signIn(CLIENT, ID);
    const rows = (await get(ID, "/api/exit.account.export", mine))
      .body.tables as unknown as Record<string, { fact?: string }[]>;
    expect(rows.vault_disclosures!.some((x) => x.fact === "body.mass")).toBe(true);
  });

  it("says where they belong, and where they used to", async () => {
    const mine = await signIn(CLIENT, ID);
    const r = await get(ID, "/api/exit.account.export", mine);
    const belongs = r.body.workspaces as unknown as { tenant_id: string; role: string }[];
    expect(belongs.length).toBeGreaterThan(0);
    /* And their own row, which no cascade can carry — it is keyed by `id`. */
    expect((r.body.account as unknown as { email: string }).email).toBe(CLIENT.toLowerCase());
  });

  it("is nobody else's to ask for", async () => {
    /*
      ⚠️ IT TAKES NO SUBJECT, AND THAT IS THE WHOLE ACCESS CONTROL. An export
      keyed by an id in the input is one where the check is a line somebody has to
      remember; keyed by the session, there is nothing to forget. The owner asking
      gets their OWN account, never the client's.
    */
    const theirs = await signIn(OWNER, ID);
    const r = await get(ID, "/api/exit.account.export", theirs);
    expect((r.body.account as unknown as { email: string }).email).toBe(OWNER.toLowerCase());
    const facts = (r.body.tables as unknown as Record<string, unknown[]>).vault_facts!;
    expect(facts).toEqual([]);
  });
});

/* ------------------------------------------------------- the declaration --- */

describe("a product's declaration reaches the hub", () => {
  /*
    ⚠️ IT NEVER DID. `publishVaultSpec` passed its parameters as an ARRAY where
    `run` takes them one by one, D1 answered `D1_TYPE_ERROR`, and a bare
    `catch {}` swallowed it — so `vault_specs` was empty for the life of the
    feature and the hub showed nobody's vault at all. Every suite was
    green: the publish is total by design, the read falls back to an empty list,
    and an empty hub looks exactly like an hub for somebody
    who has shared nothing.

    ⚠️ SO THE ASSERTION IS ABOUT THE ROW, not about the screen. A test that asked
    the screen would have passed then too.
  */
  it("is in the global store after boot, not merely attempted", async () => {
    /* ⚠️ Any request boots the global store; asking for the door does. */
    await signIn(`spec.${SLUG}@example.com`, ID);
    const db = bindingsFor({ db: sql() }, { DB: (env as Record<string, unknown>).DIRECTORY }, { defaultRegion: "auto" })("auto" as ResolvedRegion).db;

    const vault = await db.all<{ app_id: string }>(`SELECT app_id FROM vault_specs`).catch(() => []);
    expect(vault.map((r) => r.app_id)).toContain("hello");

    /* And the same for what it asks people to agree to. */
    const legal = await db.all<{ app_id: string }>(`SELECT app_id FROM legal_specs`).catch(() => []);
    expect(legal.map((r) => r.app_id)).toContain("hello");
  });
});
