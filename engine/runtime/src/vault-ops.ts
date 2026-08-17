/**
 * WHAT A PERSON MAY DO ABOUT THE FACTS THAT ARE NOT AN APP'S TO KEEP (D11).
 *
 * ⚠️ THE ENCRYPTION IS NOT THE PART THAT MEETS AN OBLIGATION — THIS IS. Article
 * 9 asks for an explicit lawful basis before a special category is processed at
 * all, and what answers it is a declared purpose and a recorded consent, not a
 * cipher. Article 15 and 20 ask for access and portability, which is an export.
 * Article 30 asks for a record of processing, which is a declaration. The
 * ciphertext answers exactly one thing, Article 34(3)(a): data unintelligible to
 * whoever took it needs no notification to the people it is about. Worth having,
 * and not what most of this file is for.
 *
 * ⚠️ AND EVERY OPERATION HERE IS THE SUBJECT'S OWN. Consent nobody can withdraw
 * is not consent; a grant nobody can revoke is a transfer; a record of who
 * looked that the subject cannot read is an audit log for us. They are `PUBLIC`
 * — meaning the SESSION decides, never that anybody may — and each answers about
 * the caller and nobody else.
 *
 * ⚠️ EXCEPT ERASURE, WHICH ASKS FOR PROOF. Destroying a salt cannot be undone
 * and cannot be done twice, so it is the one thing here that a borrowed laptop
 * with an open tab must not be able to do.
 */

import type { AppSpec, TenantId, AccountId } from "@engine/kernel";
import { PUBLIC, discloseVault, holdingsOf, ropa } from "@engine/kernel";
import type { PlatformCtx } from "./member-ops.js";
import type { Resolved } from "./compose.js";
import {
  consent, consentsOf, exportFor, grant, grantsOf, looksAt, revoke, shred, shredded,
} from "./vault.js";

/**
 * ⚠️ NO SECRET, NO OPERATIONS — and refused rather than answered emptily. A
 * deployment with no vault wired cannot say "you have consented to nothing" to
 * somebody whose facts it never had anywhere to put; that reads as an answer.
 */
export function vaultOps(app: AppSpec): Readonly<Record<string, Resolved>> {
  const purposes = app.purposes ?? {};
  const book = app.vault ?? {};

  const op = (
    id: string, kind: "read" | "write", summary: string,
    run: (ctx: PlatformCtx, input: Record<string, unknown>) => Promise<unknown>,
    extra: Partial<Resolved["spec"]> = {},
  ): Resolved => ({
    id, kind,
    method: kind === "read" ? "GET" : "POST",
    path: `/api/${id}`,
    permission: PUBLIC,
    spec: {
      id, kind, summary,
      input: {}, output: {},
      permission: PUBLIC,
      idempotency: { mode: "none" },
      /*
        ⚠️ NO OPERATION HERE IS AN AGENT TOOL. Every one of them is about
        somebody's health record, their consent or their erasure, and a model
        that can revoke a grant or shred a subject from a sentence in a document
        it was asked to summarise is a model that can be asked to.
      */
      tool: { why: "It is about somebody's most sensitive facts." },
      async handler() { return {} as never; },
      ...extra,
    } as Resolved["spec"],
    run: (ctx, input) => run(ctx as PlatformCtx, input),
  });

  const me = (ctx: PlatformCtx): AccountId => {
    if (!ctx.accountId) ctx.fail("platform.unauthorized");
    return ctx.accountId as AccountId;
  };

  return {
    /* ------------------------------------------------------------ consent --- */

    /*
      ⚠️ THE PURPOSES ARE SHOWN WHETHER OR NOT THEY HAVE BEEN ANSWERED, and one
      that is `required` says so. A sheet listing only what somebody already
      agreed to is a sheet that cannot be used to agree — and a purpose the
      product depends on has to say what is lost by refusing rather than
      pretending it is optional.
    */
    "vault.consents": op("vault.consents", "read",
      "What you have been asked to agree to, and your answer.",
      async (ctx) => {
        const given = await consentsOf(ctx.db, me(ctx));
        const said = new Map(given.map((c) => [c.purpose, c]));
        /* ⚠️ ASKED, NOT ASSEMBLED HERE. `discloseVault` is which facts each
           purpose covers, and writing that out again would be a sheet that says
           one thing while the read gate enforces another. */
        return {
          purposes: discloseVault(book, purposes).map((d) => ({
            id: d.purpose.id, label: d.purpose.label, why: d.purpose.why,
            holdings: d.purpose.holdings, retention: d.purpose.retention,
            required: d.required,
            /* What it actually covers, so nobody agrees to a category. */
            fields: d.fields.map((f) => ({ id: f.id, label: f.label, help: f.help ?? null })),
            /* ⚠️ Withdrawn is not the same as never asked, and the two are
               different sentences on a screen. */
            givenAt: said.get(d.purpose.id)?.givenAt ?? null,
            withdrawnAt: said.get(d.purpose.id)?.withdrawnAt ?? null,
          })),
        };
      }),

    /* --------------------------------------------------- what is processed --- */

    /*
      ⚠️ ARTICLE 30, AND IT IS A DECLARATION RATHER THAN A DOCUMENT SOMEBODY
      MAINTAINS. A record of processing kept by hand is one that describes the
      product as it was when somebody last edited it; this is assembled from the
      purposes and the sub-processors the manifest already carries, so a fact
      collected today is in the record today.

      ⚠️ AND IT IS READABLE BY ANYBODY SIGNED IN, because the people it is about
      are exactly who it is for.
    */
    "vault.processing": op("vault.processing", "read",
      "What is held about you, why, and who else receives it.",
      async (ctx) => {
        me(ctx);
        return {
          entries: ropa(
            Object.values(purposes).map((p) => ({
              id: p.id, label: p.label, why: p.why,
              holdings: p.holdings, retention: p.retention,
            })),
            app.processors ?? {}),
          /* Every category this app holds anywhere, vault or column. */
          holdings: holdingsOf(app),
        };
      }),

    /*
      ⚠️ WITHDRAWING IS ALWAYS ALLOWED, INCLUDING FOR A `required` PURPOSE.
      Consent that cannot be refused is not consent — what a required purpose
      changes is what the product can do afterwards, which is the app's business,
      never a refusal here.
    */
    "vault.consent": op("vault.consent", "write",
      "Agree to a purpose, or withdraw.",
      async (ctx, input) => {
        const subject = me(ctx);
        const purpose = String(input.purpose ?? "");
        if (!(purpose in purposes)) return ctx.fail("platform.not_found");
        if (await shredded(ctx.db, subject)) return ctx.fail("platform.not_found");
        await consent(ctx.db, ctx.tenantId as TenantId, subject, purpose,
          input.given === true, ctx.now);
        return { purpose, given: input.given === true };
      }),

    /* ------------------------------------------------------------- grants --- */

    "vault.grants": op("vault.grants", "read",
      "Who you have let read what, and until when.",
      async (ctx) => {
        /* ⚠️ Every grantee, not one — `grantsOf` answers per grantee because the
           read path asks about one, and a person's own screen asks about all. */
        const rows = await ctx.db.prepare(
          `SELECT grantee FROM vault_grant WHERE subject_id = ? AND revoked_at IS NULL`)
          .bind(me(ctx)).all<{ grantee: string }>();
        const seen = [...new Set(rows.results.map((r) => r.grantee))];
        const out = [];
        for (const grantee of seen) out.push(...await grantsOf(ctx.db, me(ctx), grantee));
        return { grants: out };
      }),

    "vault.grant": op("vault.grant", "write",
      "Let somebody read a fact about you, for a reason, until a date.",
      async (ctx, input) => {
        const subject = me(ctx);
        const purpose = String(input.purpose ?? "");
        const to = String(input.to ?? "").trim();
        const fields = Array.isArray(input.fields) ? input.fields.map(String) : [];
        const until = new Date(String(input.until ?? ""));

        if (!(purpose in purposes) || !to) return ctx.fail("platform.invalid");
        /* ⚠️ A grant over a field the app does not declare is a grant over
           nothing, and it would sit in somebody's list looking like access. */
        const unknown = fields.filter((f) => !(f in book));
        if (!fields.length || unknown.length) {
          return ctx.fail("platform.invalid", {}, {
            fields: { fields: unknown.length ? `no such fact: ${unknown.join(", ")}` : "choose at least one" },
          });
        }
        /* ⚠️ AN EXPIRY IN THE PAST IS REFUSED RATHER THAN STORED. It would read
           on the screen as access given and behave as access withheld. */
        if (Number.isNaN(until.getTime()) || until <= ctx.now) {
          return ctx.fail("platform.invalid", {}, { fields: { until: "pick a date in the future" } });
        }
        await grant(ctx.db, ctx.tenantId as TenantId, subject, to, purpose, fields, until, ctx.now);
        return { to, purpose, fields, until: until.toISOString() };
      }),

    "vault.revoke": op("vault.revoke", "write",
      "Stop somebody reading what you let them read.",
      async (ctx, input) => {
        const to = String(input.to ?? "").trim();
        if (!to) return ctx.fail("platform.invalid");
        await revoke(ctx.db, me(ctx), to, ctx.now);
        return { to };
      }),

    /* -------------------------------------------------------- who looked --- */

    /*
      ⚠️ THIS IS THE HALF THAT MAKES A VAULT WORTH HAVING. Not that access is
      controlled — every database claims that — but that the person it is about
      can see who used it, including the attempts that were refused.
    */
    "vault.looks": op("vault.looks", "read",
      "Who looked at your facts, and when.",
      async (ctx) => ({ looks: await looksAt(ctx.db, me(ctx)) })),

    /* ------------------------------------------------------------ export --- */

    "vault.export": op("vault.export", "read",
      "Everything held about you, in the clear.",
      async (ctx) => {
        if (!ctx.vault) return ctx.fail("platform.unavailable");
        const out = await exportFor(ctx.db, ctx.vault.secret, book, me(ctx));
        if (out === "erased") return ctx.fail("platform.not_found");
        return { facts: out };
      }),

    /* ----------------------------------------------------------- erasure --- */

    /*
      ⚠️ ONE WRITE, AND IT CANNOT BE UNDONE OR REPEATED. The salt is destroyed
      and every fact about this person becomes noise — to a reader, to a backup
      of the fact table, and to us. The rows are left where they are on purpose:
      deleting them as well would make the count of what was held unverifiable
      afterwards, which is the evidence that the erasure happened at all.

      ⚠️ AND THE HONEST LIMIT, BECAUSE SOMEBODY WILL RELY ON THIS. What is
      destroyed is the salt ROW. A restore of this database from before the
      shred brings the salt back and the ciphertext with it — so a point-in-time
      restore has to re-run the erasure, and a deployment whose backups are not
      handled that way should not tell anybody their data is unrecoverable.
    */
    "vault.forget": op("vault.forget", "write",
      "Destroy the key to everything held about you. This cannot be undone.",
      async (ctx) => {
        const subject = me(ctx);
        if (await shredded(ctx.db, subject)) return ctx.fail("platform.not_found");
        await shred(ctx.db, subject, ctx.now);
        return { erased: true };
      },
      /* ⚠️ A code to an inbox, because the threat is a borrowed laptop with an
         open tab rather than a stolen password — and this is irreversible. */
      { proof: "recent" }),
  };
}
