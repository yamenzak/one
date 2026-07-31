/**
 * The whole package is pure — it reads `SchemaModule` declarations and returns
 * plans. `/model` exists only so an isomorphic importer does not have to know
 * that.
 */
export * from "./cascade.js";
