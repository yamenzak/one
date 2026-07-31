/**
 * The ISOMORPHIC half of tenancy — everything that is pure.
 *
 * Host classification, slug rules, DCV error parsing and the standing/gate model
 * touch no bindings and no database, so a browser can import them: the app needs
 * `tenantStandingOfGate` to render a suspended tenant, and `checkSlug` to
 * validate an address as it is typed.
 *
 * The package root additionally exports the D1-backed resolver and the Cloudflare
 * client, which pull in Workers types. Importing THAT from a browser build is a
 * type error rather than a subtle bundling accident — which is exactly why the
 * split exists.
 */
export * from "./dcv.js";
export * from "./hosts.js";
export * from "./standing.js";
