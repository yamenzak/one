/**
 * A PERSON EXPORTS AND ERASES THEMSELVES, PROVABLY.
 *
 * ⚠️ "PROVABLY" IS THE WHOLE STAGE. Anybody can delete rows; what has to be true
 * here is that after one write, the facts are unreadable to US as well — which
 * is a claim somebody may one day have to stand behind in front of a regulator,
 * and which deleting rows cannot make about a backup that already left.
 *
 * ⚠️ AND EVERY REFUSAL IS DISTINCT AND NONE OF THEM IS "NOT FOUND". An access
 * failure buried in an ordinary empty result is one nobody investigates.
 */

import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AccountId, TenantId, VaultBook } from "@engine/kernel";
import { discloseVault, missingDocuments, outstanding, refuseVault, ropa } from "@engine/kernel";
import {
  DIRECTORY_MODULES, SHARD_MODULES,
  DIRECTORY_SCHEMA, VAULT_SCHEMA, addShard, applySchema, consent, createTenant, exportFor, grant,
  keep, look, looksAt, noteShardApp, openSubject, revoke, shred, shredded, type Db,
} from "@engine/runtime";

const directory = () => env.DIRECTORY as unknown as Db;
const shard = () => env.SHARD_EU_2 as unknown as Db;

const SECRET = "a-deployment-secret";
const ME = "acc_subject" as AccountId;
const COACH = "mem_coach";
let tenantId = "" as TenantId;

const BOOK: VaultBook = {
  "client.conditions": {
    id: "client.conditions", label: "Conditions", holding: "sensitive", purposes: ["coaching"],
  },
  "client.notes": {
    id: "client.notes", label: "Private notes", holding: "sensitive", purposes: ["coaching"],
  },
};

const PURPOSES = {
  coaching: {
    id: "coaching", label: "Coaching", why: "So your coach can train you safely.",
    holdings: ["sensitive" as const], retention: null, required: true,
  },
};

const soon = () => new Date(Date.now() + 60 * 60 * 1000);

beforeAll(async () => {
  await applySchema(directory(), DIRECTORY_MODULES);
  await applySchema(shard(), [VAULT_SCHEMA]);
  await addShard(directory(), "eu-2", "eu", 100);
  await noteShardApp(directory(), "eu-2", "hello");
});

beforeEach(async () => {
  for (const t of ["vault_look", "vault_grant", "vault_consent", "vault_fact", "vault_subject"]) {
    await shard().exec(`DELETE FROM ${t};`);
  }
  await directory().exec(`DELETE FROM tenant;`);
  /* ⚠️ Its own slug: the suites share one database. */
  const made = await createTenant(directory(), {
    slug: "vaultwind", name: "Vaultwind", country: "DE", where: "eu", apps: ["hello"],
  });
  if (typeof made === "string") throw new Error(made);
  tenantId = made.tenant.id;
});

const allowed = async () => {
  await consent(shard(), tenantId, ME, "coaching", true);
  await grant(shard(), tenantId, ME, COACH, "coaching", ["client.conditions"], soon());
};

/* ------------------------------------------------------------------ keeping --- */

describe("keeping something that is not the app's", () => {
  it("stores it unreadable and gives it back to somebody who may read it", async () => {
    await keep(shard(), SECRET, tenantId, ME, "client.conditions", "asthma");
    await allowed();

    /* ⚠️ What is in the table is not the fact. */
    const row = await shard().prepare(`SELECT cipher FROM vault_fact WHERE subject_id = ?`)
      .bind(ME).first<{ cipher: string }>();
    expect(row?.cipher).not.toContain("asthma");

    const out = await look(shard(), SECRET, BOOK,
      { tenantId, subject: ME, field: "client.conditions", purpose: "coaching", grantee: COACH });
    expect(out).toEqual({ value: "asthma" });
  });

  /*
    ⚠️ CONSENT IS THE CEILING AND A GRANT IS THE SPECIFIC. A grant an operator
    wrote cannot stand in for the subject's own agreement — that is the whole
    difference between access control and a lawful basis, and it is invisible
    from both sides.
  */
  it("refuses a perfectly good grant once consent is withdrawn", async () => {
    await keep(shard(), SECRET, tenantId, ME, "client.conditions", "asthma");
    await allowed();
    await consent(shard(), tenantId, ME, "coaching", false);

    expect(await look(shard(), SECRET, BOOK,
      { tenantId, subject: ME, field: "client.conditions", purpose: "coaching", grantee: COACH }))
      .toBe("no_consent");
  });

  /* ⚠️ Withdrawing is a timestamp, not a deleted row: it is the evidence that
     the reads before it were lawful. */
  it("keeps the record that consent was once given", async () => {
    await consent(shard(), tenantId, ME, "coaching", true);
    await consent(shard(), tenantId, ME, "coaching", false);
    const row = await shard().prepare(
      `SELECT given_at, withdrawn_at FROM vault_consent WHERE subject_id = ?`)
      .bind(ME).first<{ given_at: string | null; withdrawn_at: string | null }>();
    expect(row?.given_at).not.toBe(null);
    expect(row?.withdrawn_at).not.toBe(null);
  });

  /* ⚠️ A grant expires, which is what makes "somebody looked at this two years
     after they left" impossible rather than unlikely. */
  it("stops trusting a grant that ran out or was revoked", async () => {
    await keep(shard(), SECRET, tenantId, ME, "client.conditions", "asthma");
    await consent(shard(), tenantId, ME, "coaching", true);
    await grant(shard(), tenantId, ME, COACH, "coaching", ["client.conditions"],
      new Date(Date.now() - 1000));
    expect(await look(shard(), SECRET, BOOK,
      { tenantId, subject: ME, field: "client.conditions", purpose: "coaching", grantee: COACH }))
      .toBe("grant_expired");

    await revoke(shard(), ME, COACH);
    await grant(shard(), tenantId, ME, COACH, "coaching", ["client.conditions"], soon());
    await revoke(shard(), ME, COACH);
    expect(await look(shard(), SECRET, BOOK,
      { tenantId, subject: ME, field: "client.conditions", purpose: "coaching", grantee: COACH }))
      .toBe("grant_expired");
  });

  /*
    ⚠️ EVERY REFUSAL IS DISTINCT, AND NONE OF THEM IS "NOT FOUND". Answering "no
    such fact" when the truth is "you have no grant" teaches whoever is reading
    that the subject has nothing.
  */
  it("says which of the reasons it was, and never that there is nothing there", async () => {
    await keep(shard(), SECRET, tenantId, ME, "client.conditions", "asthma");
    const ask = { tenantId, subject: ME, purpose: "coaching", grantee: COACH };

    expect(await look(shard(), SECRET, BOOK, { ...ask, field: "client.conditions" }))
      .toBe("no_grant");
    await allowed();
    /* Granted one field only — the other is refused as such, not as absent. */
    expect(await look(shard(), SECRET, BOOK, { ...ask, field: "client.notes" }))
      .toBe("field_not_granted");
    expect(await look(shard(), SECRET, BOOK, { ...ask, field: "ghost" })).toBe("unknown_field");
    expect(await look(shard(), SECRET, BOOK,
      { ...ask, field: "client.conditions", purpose: "marketing" })).toBe("outside_purpose");
  });
});

/* -------------------------------------------------------------- who looked --- */

describe("who looked", () => {
  /*
    ⚠️ RECORDED WHETHER IT SUCCEEDED OR WAS REFUSED, with no opt-out anywhere.
    "Who looked at my health record, and when" is the question this whole design
    exists to be able to answer — and an audit of only the successful reads
    answers "did anybody try" with silence.
  */
  it("records the reads and the refusals alike", async () => {
    await keep(shard(), SECRET, tenantId, ME, "client.conditions", "asthma");
    await look(shard(), SECRET, BOOK,
      { tenantId, subject: ME, field: "client.conditions", purpose: "coaching", grantee: "mem_nosy" });
    await allowed();
    await look(shard(), SECRET, BOOK,
      { tenantId, subject: ME, field: "client.conditions", purpose: "coaching", grantee: COACH });

    const looks = await looksAt(shard(), ME);
    expect(looks).toHaveLength(2);
    expect(looks.find((l) => l.grantee === "mem_nosy")?.refused).toBe("no_grant");
    expect(looks.find((l) => l.grantee === COACH)?.refused).toBe(null);
  });
});

/* ------------------------------------------------------- export and erasure --- */

describe("taking it away", () => {
  it("exports everything held, in the clear, to the person it is about", async () => {
    await keep(shard(), SECRET, tenantId, ME, "client.conditions", "asthma");
    await keep(shard(), SECRET, tenantId, ME, "client.notes", "prefers mornings");
    expect(await exportFor(shard(), SECRET, BOOK, ME))
      .toEqual({ "client.conditions": "asthma", "client.notes": "prefers mornings" });
  });

  /*
    ⚠️ ONE WRITE, AND IT IS UNREADABLE TO US TOO. That is the claim deleting rows
    cannot make about a backup that already left the building, and it is why the
    salt is per subject.
  */
  it("destroys the key, and then nobody can read any of it — including us", async () => {
    await keep(shard(), SECRET, tenantId, ME, "client.conditions", "asthma");
    await allowed();
    await shred(shard(), ME);

    expect(await shredded(shard(), ME)).toBe(true);
    expect(await look(shard(), SECRET, BOOK,
      { tenantId, subject: ME, field: "client.conditions", purpose: "coaching", grantee: COACH }))
      .toBe("erased");
    expect(await exportFor(shard(), SECRET, BOOK, ME)).toBe("erased");

    /* ⚠️ The ciphertext is deliberately still there: it is noise now, and
       deleting it as well would make the count of what was held unverifiable. */
    const left = await shard().prepare(`SELECT COUNT(*) AS n FROM vault_fact WHERE subject_id = ?`)
      .bind(ME).first<{ n: number }>();
    expect(left?.n).toBe(1);
  });

  /* ⚠️ Erasure is not a pause. Re-opening a shredded subject with a fresh salt
     would make everything written afterwards a second collection nobody agreed
     to. */
  it("refuses to reopen somebody who was erased", async () => {
    await openSubject(shard(), tenantId, ME);
    await shred(shard(), ME);
    await expect(openSubject(shard(), tenantId, ME)).rejects.toThrow(/erased/);
  });

  /* ⚠️ And one person's erasure is one person's. */
  it("leaves everybody else exactly as they were", async () => {
    const other = "acc_other" as AccountId;
    await keep(shard(), SECRET, tenantId, ME, "client.conditions", "mine");
    await keep(shard(), SECRET, tenantId, other, "client.conditions", "theirs");
    await shred(shard(), ME);
    expect(await exportFor(shard(), SECRET, BOOK, other)).toEqual({ "client.conditions": "theirs" });
  });
});

/* ------------------------------------------------------------------- legal --- */

describe("what the record says", () => {
  /* ⚠️ The disclosure is derived, because it is the page a regulator reads and a
     hand-written one is right only on the day it is written. */
  it("assembles the consent sheet from the declarations", () => {
    const shown = discloseVault(BOOK, PURPOSES);
    expect(shown).toHaveLength(1);
    expect(shown[0]!.fields.map((f) => f.id).sort())
      .toEqual(["client.conditions", "client.notes"]);
    expect(shown[0]!.required).toBe(true);
    expect(refuseVault(BOOK, PURPOSES)).toEqual([]);
  });

  it("assembles the processing record and names every recipient with its country", () => {
    const rows = ropa(
      [{ id: "clients", label: "Clients", why: "To coach them",
        holdings: ["sensitive", "contact"], retention: null }],
      { post: { id: "post", name: "Postmark", role: "Sends email", country: "US",
        receives: ["contact"] } });
    expect(rows[0]!.recipients).toEqual(["Postmark (US)"]);
  });

  /* ⚠️ An acceptance of last month's wording is not an acceptance — that is the
     entire reason the version is on the record. */
  it("counts an acceptance of an older version as none", () => {
    const docs = {
      terms: { id: "terms", kind: "terms" as const, title: "Terms", version: "2026-08-01" as never,
        mustAccept: true, binds: "person" as const, url: "/legal/terms" },
    };
    expect(outstanding(docs, [], "person").map((d) => d.id)).toEqual(["terms"]);
    expect(outstanding(docs,
      [{ document: "terms", version: "2026-08-01" as never, at: "x" as never, by: "me" }], "person"))
      .toEqual([]);
  });

  /* ⚠️ Asked of the deployment, once: demanding a set per app produces four
     copies of one document, or teaches everybody to satisfy it with a stub. */
  it("asks the deployment whether the documents exist at all", () => {
    expect(missingDocuments({}, ["sensitive"]).map((p) => p.why))
      .toEqual(["no_privacy_document", "no_terms"]);
  });
});
