/**
 * The ISOMORPHIC half of auth — the grant algebra and nothing else.
 *
 * A browser needs `grantSatisfies` to decide whether to render an action, and
 * `bindGrants` to resolve a role preset it was handed. It must never reach the
 * session middleware, the route guard, or the auth instance — all of which touch
 * D1 and Workers types. Importing the package root from a browser build is a type
 * error rather than a subtle bundling accident.
 */
export * from "./grants.js";
