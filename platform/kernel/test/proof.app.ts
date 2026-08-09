/**
 * THE PROOF THAT THE PIECES COMPOSE — one whole app, declared.
 *
 * ⚠️ The other proofs each exercise one type against one hard surface. This one
 * asks the question those cannot: does an app ASSEMBLE? Every individual type
 * can be right while the composition is impossible — a generic that will not
 * unify, a required field with nothing sensible to put in it, a spec that needs
 * something no other spec produces. The entry point is the last thing to be
 * tried and the first thing every app touches.
 *
 * It compiles or it does not. That is the test.
 */

import { defineApp } from "../src/app.js";
import { collection, field } from "../src/collection.js";
import { declareProblems } from "../src/problem.js";
import type { Currency, Locale, RegionId, TimeZone } from "../src/primitives.js";
import { applyPackageGrant, bindings, problems as appProblems, publishPlan, readProgress } from "./proof.kova.js";

/* --------------------------------------------------------------- a table --- */

const packages = collection({
  id: "package",
  label: { one: "Package", many: "Packages" },
  scope: { of: "tenant" },
  version: true,
  retention: { days: null, onTenantClose: "export-then-purge" },
  onDelete: { on: "archive" },
  activity: true,
  search: ["title"],
  fields: {
    title: field.text({ required: true }),
    price: field.money({ required: true }),
    days: field.number({ integer: true, required: true }),
    active: field.bool(),
  },
});

/* ------------------------------------------------------------------- app --- */

/**
 * ⚠️ Every field here is one MANIFEST.md §9 marks day-zero, so the interesting
 * property is that NONE of them could be left out. A spec that compiled with
 * `governance` or `seats` missing would be a spec that lets an app ship without
 * a consent ledger or a seat ceiling — and both are unbackfillable.
 */
export const kova = defineApp({
  id: "kova",
  name: "Kova",
  // Live data the moment anything is sold: it tags every object we create at
  // the payment provider, and changing it later orphans what is already tagged.
  stripeMetadataPrefix: "kova",
  manifestVersion: "0.1.0",

  bindings,

  identity: {
    // The ROOT, not this app's host: a credential registered here is offered by
    // the next product, and first sign-in there is a tap rather than a sign-up.
    rootRelyingParty: "4dl.app",
    // An account is shared; a session is not. Sharing the cookie would make an
    // injection in any one product an actor in all of them.
    sessionScope: "origin",
    directoryRegion: "eu" as RegionId,
  },

  tenancy: {
    doors: ["root", "setup", "admin", "slug", "custom"],
    regions: ["eu", "auto"] as RegionId[],
    defaultRegion: "auto" as RegionId,
    reservedSlugs: ["kova", "coach", "team"],
  },

  format: {
    currency: "USD" as Currency,
    timeZone: "Europe/Berlin" as TimeZone,
    locale: "en" as Locale,
    units: "metric",
    weekStart: 1,
  },

  access: {
    permissions: ["client:read", "plan:publish", "commerce:grant"],
    roles: {
      owner: ["client:read", "plan:publish", "commerce:grant"],
      trainer: ["client:read", "plan:publish"],
      customer: ["client:read"],
    },
    entitlements: { trainingPlans: true, customerPackages: true, seats: 3 },
    // This app sells to its tenants' own customers, so there are two flag
    // systems and a capability is their intersection.
    customerRail: true,
    seats: { counts: ["owner", "trainer"] },
  },

  governance: {
    legal: [
      { id: "terms", version: "2026-01-01", mustAccept: ["owner"] },
      { id: "privacy", version: "2026-01-01", mustAccept: ["owner", "trainer", "customer"] },
      { id: "dpa", version: "2026-03-01", mustAccept: ["owner"] },
    ],
    impersonation: { maxMinutes: 60, announce: true },
    auditRetentionDays: 730,
  },

  collections: [packages],
  operations: [readProgress, publishPlan, applyPackageGrant],
  problems: { ...appProblems, ...declareProblems({ "billing.quota_exceeded": { status: 402, title: "You've used everything in your plan", retryable: false } }) },

  // Registered per SURFACE rather than per action: a surface somebody is not
  // looking at is audible, a surface they are reading is silent.
  sounds: { pack: "one/default", surfaces: { session: "on", dashboard: "off" } },
});
