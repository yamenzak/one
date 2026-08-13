/**
 * TOKENS, ISSUED WHERE IDENTITY LIVES.
 *
 * ⚠️ THE HUB ISSUES THEM AND NOT THE APP, and the reason is what a token IS. It
 * is a credential belonging to a PERSON — it outlives any one workspace they are
 * in, it is revoked when they leave a company, and it is the same kind of thing
 * as a passkey. The hub already owns identity and already answers "everywhere
 * you belong"; per-app issuance would mean four places to look for a credential
 * somebody forgot, which is how a forgotten one stays live.
 *
 * ⚠️ AND IT IS SCOPED TO ONE WORKSPACE, because a token that reached every
 * workspace somebody is in would be a single string whose blast radius is their
 * whole working life. Naming the workspace at issue is one extra field and turns
 * a leak into a bounded incident.
 */

import type { AnyOperation, Instant, SqlHandle } from "@one/kernel";
import { operation, PUBLIC, s } from "@one/kernel";
import { issueToken, revokeToken, tokensOf, type TokenRow } from "./api-token.js";

/** ⚠️ A symbol, so an app cannot reach the credential store by writing a property name. */
export const TOKENS = Symbol.for("one.runtime.tokens");

export interface TokenDeps {
  /** ⚠️ The GLOBAL store: a token is read before a region is known. */
  readonly global: SqlHandle;
  readonly accountId: string;
  /** Which workspaces this person is actually in, so a token cannot name another. */
  belongings(): Promise<readonly { readonly tenantId: string; readonly appId: string }[]>;
}

export interface TokenCarrier { readonly [TOKENS]: TokenDeps }

const deps = (ctx: unknown): TokenDeps => (ctx as TokenCarrier)[TOKENS];

const said = (t: TokenRow) => ({
  id: t.id, name: t.name, hint: t.hint, appId: t.appId, tenantId: t.tenantId,
  createdAt: t.createdAt, lastUsedAt: t.lastUsedAt, expiresAt: t.expiresAt,
});

export function tokenOperations(): readonly AnyOperation[] {
  const list = operation({
    id: "me.tokens",
    kind: "read",
    summary: "Every API token you hold, across every product.",
    input: s.object({}),
    output: s.object({ tokens: s.json() }),
    /*
      ⚠️ PUBLIC, which here means "the session decides", exactly as every other
      `me.*` operation does. These are your own credentials: anybody holding your
      session already IS you, so a permission between you and them would be a
      role check on a question about yourself — and it would have to be granted
      by a workspace, which is the wrong authority for a credential that spans
      all of them.
    */
    permission: PUBLIC,
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      return { tokens: (await tokensOf(d.global, d.accountId)).map(said) };
    },
  });

  const issue = operation({
    id: "me.tokens.issue",
    kind: "write",
    summary: "Create an API token for one of your workspaces.",
    input: s.object({
      name: s.text({ min: 1, max: 60 }),
      tenantId: s.text({ min: 1, max: 60 }),
      expiresAt: s.optional(s.instant()),
    }),
    output: s.object({ token: s.json(), secret: s.text() }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    /*
      ⚠️ MINTING A CREDENTIAL IS PROVED, and it is the clearest case for the gate
      there is. The threat this exists against is a borrowed laptop with an open
      tab; a session is enough to read a screen and must not be enough to walk
      away with a key that outlives it.
    */
    proof: "recent",
    audit: (i: { name: string }) => ({ subject: i.name, verb: "token:issue" }),
    outcome: { message: "Created", tone: "success", invalidates: ["me.tokens"] },
    fails: ["platform.forbidden"],
    /*
      ⚠️ NOT A TOOL. A model that could mint a credential for itself would have a
      way to persist past the session it was given — the one capability an agent
      must not be able to grant itself.
    */
    tool: false,
    async handler(ctx, input: { name: string; tenantId: string; expiresAt?: Instant }) {
      const d = deps(ctx);
      /*
        ⚠️ ONLY A WORKSPACE THIS PERSON IS ACTUALLY IN. Without this, the input is
        a tenant id somebody types — and a token naming a workspace they left, or
        never joined, is a credential the resolver will happily honour.
      */
      const mine = (await d.belongings()).find((b) => b.tenantId === input.tenantId);
      if (!mine) ctx.fail("platform.forbidden", { field: "tenantId", reason: "you are not in that workspace" });

      const made = await issueToken(d.global, {
        accountId: d.accountId, appId: mine!.appId, tenantId: input.tenantId,
        name: input.name, expiresAt: input.expiresAt ?? null,
      }, ctx.now() as Instant);
      /*
        ⚠️ THE ONLY TIME THE SECRET EXISTS. It is not stored, not recoverable and
        not shown twice — so the screen has to say so, and the answer has to
        carry it exactly once.
      */
      return { token: said(made.row), secret: made.secret };
    },
  });

  const revoke = operation({
    id: "me.tokens.revoke",
    kind: "write",
    summary: "Destroy one of your API tokens.",
    input: s.object({ id: s.text({ max: 40 }) }),
    output: s.object({ id: s.text() }),
    permission: PUBLIC,
    idempotency: { mode: "natural", key: "id" },
    /*
      ⚠️ REVOKING IS NOT PROVED, DELIBERATELY. Somebody who has just realised a
      credential leaked should not meet a code-by-email between them and stopping
      it — and the worst case of an un-proved revoke is a credential destroyed,
      which is recoverable by issuing another.
    */
    audit: (i: { id: string }) => ({ subject: i.id, verb: "token:revoke" }),
    outcome: { message: "Destroyed", tone: "success", invalidates: ["me.tokens"] },
    fails: ["platform.not_found"],
    tool: false,
    async handler(ctx, input: { id: string }) {
      const d = deps(ctx);
      const gone = await revokeToken(d.global, d.accountId, input.id, ctx.now() as Instant);
      if (!gone) ctx.fail("platform.not_found", { field: "id" });
      return { id: input.id };
    },
  });

  return [list, issue, revoke] as unknown as readonly AnyOperation[];
}
