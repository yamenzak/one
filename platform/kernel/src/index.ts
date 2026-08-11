/**
 * @one/kernel — the contract layer.
 *
 * ⚠️ TYPES ONLY. Stage 0 exists to find out where the shape is wrong while that
 * is a Tuesday afternoon rather than a migration, so nothing here implements
 * anything. `platform/kernel/test/` is the proof: the hardest real surfaces from
 * two shipping products, expressed in these types.
 *
 * These five modules become `@one/kernel`, `@one/data` and `@one/surface` when
 * there is implementation to separate. The layering is enforced today by
 * `test/layering.test.ts` rather than by package boundaries, so the split stays
 * mechanical — and so stage 0 spends its time on the types rather than on four
 * package.json files.
 */
export * from "./measure.js";
export * from "./protection.js";
export * from "./vault.js";
export * from "./primitives.js";
export * from "./validate.js";
export * from "./bindings.js";
export * from "./doors.js";
export * from "./identity.js";
export * from "./config.js";
export * from "./standing.js";
export * from "./problem.js";
export * from "./directory.js";
export * from "./session.js";
export * from "./membership.js";
export * from "./schema.js";
export * from "./collection.js";
export * from "./settings.js";
export * from "./lookup.js";
export * from "./entitlement.js";
export * from "./customer.js";
export * from "./meter.js";
export * from "./notify.js";
export * from "./help.js";
export * from "./release.js";
export * from "./job.js";
export * from "./guide.js";
export * from "./milestone.js";
export * from "./generation.js";
export * from "./moment.js";
export * from "./market.js";
export * from "./resolve.js";
export * from "./ddl.js";
export * from "./document.js";
export * from "./operation.js";
export * from "./surface.js";
export * from "./app.js";
