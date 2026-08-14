/**
 * @quad/runtime — the ONLY code that touches a binding.
 *
 * ⚠️ EVERYTHING ABOVE THIS LAYER IS PURE AND EVERYTHING BELOW IT IS A DATABASE.
 * That line is what makes the kernel's rules provable with no fixture, and it is
 * why a screen or an app that reached for a binding would be a layering failure
 * rather than a shortcut.
 */

export * from "./sql.js";
export * from "./schema.js";
export * from "./directory.js";
export * from "./records.js";
export * from "./handles.js";
