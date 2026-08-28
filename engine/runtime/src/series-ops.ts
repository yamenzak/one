/**
 * WHAT A WORKSPACE CALLS ITS OWN DOCUMENTS.
 *
 * ⚠️ A NUMBERING FORMAT IS THE WORKSPACE'S AND CHANGING IT MUST NEVER BE A
 * DEPLOY. An accountant hands a business the format its documents are filed
 * under, a tax authority sometimes dictates one, and a company moving off
 * another system needs to carry on from where its old numbers stopped. Every
 * one of those is a Tuesday afternoon, not a release.
 *
 * ⚠️ TWO OPERATIONS FOR THE WHOLE APP, NOT TWO PER DOCUMENT — the shape the bin
 * already has. A product with six document types would otherwise answer twelve
 * routes about numbering, and the screen would still have to fan out over all
 * six to draw one list.
 *
 * ⚠️ AND THE LIST SHOWS WHAT THE NEXT ONE WOULD BE CALLED, not the pattern
 * alone. `INV-{YYYY}-{#####}` is not what anybody recognises; `INV-2026-00042`
 * is, and it is the only form in which a wrong answer is obvious before it has
 * been issued to a customer.
 */

import type { AppSpec, CollectionSpec } from "@engine/kernel";
import { PUBLIC, permissionFor } from "@engine/kernel";
import type { Resolved } from "./compose.js";
import type { PlatformCtx } from "./member-ops.js";
import { clearSeries, numberingIn, setSeries } from "./documents.js";

/**
 * ⚠️ THE SENTENCE A PERSON READS WHEN THEIR PATTERN IS REFUSED, and it names
 * the fix rather than the rule. "series_without_a_counter" is what the kernel
 * answers; what somebody typing into a settings field needs is which character
 * to add.
 */
const SAYS: Readonly<Record<string, string>> = {
  series_empty: "Give it a format — documents cannot be numbered without one.",
  series_unparseable: "There is a brace here that does not close.",
  series_unknown_token:
    "Nothing fills that placeholder. Use {YYYY}, {YY}, {MM}, {DD} or {#####}.",
  series_without_a_counter:
    "Add {#####} somewhere, or every document gets the same number.",
  series_counter_twice: "There is one number to put in, and two places for it.",
  series_too_narrow: "Use at least {###} — a shorter count runs out inside a year.",
};

export function seriesOps(app: AppSpec): Readonly<Record<string, Resolved>> {
  const documents = app.collections.filter((c) => c.document);
  const byId = new Map(documents.map((c) => [c.id, c]));

  const op = (
    id: string, kind: "read" | "write", summary: string,
    run: (ctx: PlatformCtx, input: Record<string, unknown>) => Promise<unknown>,
  ): Resolved => ({
    id, kind,
    method: kind === "read" ? "GET" : "POST",
    path: `/api/${id}`,
    /*
      ⚠️ `PUBLIC` AT THE DOOR AND CHECKED IN THE HANDLER, for the reason the bin
      is: the grant depends on an ARGUMENT. There is no permission that means
      "may set numbering", only `invoice:write` and `credit-note:write` and
      however many the product declares — naming one here would refuse somebody
      who may on every other document.
    */
    permission: PUBLIC,
    spec: {
      id, kind, summary,
      input: {}, output: {},
      permission: PUBLIC,
      idempotency: { mode: "none" },
      async handler() { return {} as never; },
    } as Resolved["spec"],
    run: (ctx, input) => run(ctx as PlatformCtx, input),
  });

  /**
   * ⚠️ SETTING THE FORMAT IS THE COLLECTION'S OWN WRITE GRANT. Somebody the
   * workspace trusts to raise an invoice is who decides what invoices are
   * called; a separate key would be one more thing to grant and one more way to
   * end up with a bookkeeper who can issue documents and not name them.
   */
  const mayWrite = async (
    ctx: PlatformCtx, id: string,
  ): Promise<CollectionSpec> => {
    const spec = byId.get(id);
    if (!spec) return ctx.fail("platform.not_found");
    const held = await ctx.permissionsIn(app.id);
    if (!held.has(permissionFor(spec, "update"))) ctx.fail("platform.forbidden");
    return spec;
  };

  return {
    "series.list": op("series.list", "read",
      "How this workspace numbers its documents, and what the next one would be called",
      async (ctx) => ({
        items: await numberingIn(ctx.db, String(ctx.tenantId), documents, ctx.now),
      })),

    "series.set": op("series.set", "write",
      "Change the format one kind of document is numbered by",
      async (ctx, input) => {
        const spec = await mayWrite(ctx, String(input.collection ?? ""));
        const pattern = String(input.pattern ?? "");

        /*
          ⚠️ AN EMPTY PATTERN IS "BACK TO THE DECLARED ONE", not a refusal. A
          workspace that tried a format and wants out of it needs a way back,
          and the way back must not be typing the app's default in by hand —
          copied by eye it drifts, and it would then be frozen against a
          declaration that later changes.
        */
        if (!pattern.trim()) {
          await clearSeries(ctx.db, String(ctx.tenantId), spec.id);
          return { collection: spec.id, theirs: false };
        }

        const done = await setSeries(
          ctx.db, String(ctx.tenantId), spec.id, pattern, ctx.now,
          ctx.accountId ?? null);
        if ("why" in done) {
          ctx.fail("platform.invalid", {},
            { fields: { pattern: SAYS[done.why] ?? "That format cannot be used." } });
        }
        return { collection: spec.id, theirs: true };
      }),
  };
}
