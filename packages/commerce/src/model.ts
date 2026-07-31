/**
 * The ISOMORPHIC surface — budget math and discount math.
 *
 * Both are pure (no bindings, no D1, and no `Date.now()`: the caller passes the
 * instant, which is what makes the runway arithmetic testable). The package root
 * additionally exports the schema module, which pulls in Workers types.
 *
 * `lapse` is its own subpath rather than part of this one, because an app that
 * wraps it with its own COPY re-exports the wrapper — and two star-exports of
 * the same names is an ambiguity error, not a merge.
 */
export * from "./budgets.js";
export * from "./promo.js";
