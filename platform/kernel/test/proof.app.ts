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
import { applyPackageGrant, bindings, inviteStaff, problems as appProblems, publishPlan, readProgress } from "./proof.kova.js";

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
    appRoot: "kova.4dl.app",
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
    permissions: ["client:read", "plan:publish", "commerce:grant", "staff:invite"],
    roles: {
      owner: ["client:read", "plan:publish", "commerce:grant", "staff:invite"],
      trainer: ["client:read", "plan:publish"],
      customer: ["client:read"],
    },

    /*
      ⚠️ EVERY ENTRY NAMES HOW IT IS WITHHELD, and composition checks that the
      mechanism really exists. `parked` is what a workspace that never chose a
      plan gets — and what a deployment with no payment rail at all serves, which
      is why it is not simply zero.
    */
    entitlements: {
      trainingPlans: { parked: false, enforcement: "gate" },
      customerPackages: { parked: false, enforcement: "gate" },
      seats: { parked: 1, enforcement: "quota" },
      // Sold nowhere, enforced nowhere — and the reason is the exemption. A
      // boolean here would be indistinguishable from an oversight in a year.
      chat: { parked: false, enforcement: { unenforced: "no plan in the catalogue enables it; inert until one does" } },
    },

    /*
      ⚠️ NOT PAYING MUST NOT BUY MORE THAN THE CHEAPEST PLAN. The parking row
      above carries one seat against the entry plan's three, which is the right
      way round — a shipping product once had it the other way and its entry
      plan was a downgrade.
    */
    plans: [
      {
        id: "starter",
        name: "Starter",
        price: { minor: 499, currency: "USD" as Currency },
        period: "month",
        trialDays: 14,
        entitlements: { trainingPlans: true, customerPackages: false, seats: 3, chat: false },
      },
      {
        id: "pro",
        name: "Pro",
        price: { minor: 2900, currency: "USD" as Currency },
        period: "month",
        trialDays: 14,
        entitlements: { trainingPlans: true, customerPackages: true, seats: 12, chat: false },
      },
    ],

    // This app sells to its tenants' own customers, so there are two flag
    // systems and a capability is their intersection.
    customerRail: true,

    /*
      ⚠️ `requires` NAMES THE ENTITLEMENT THE WORKSPACE ITSELF MUST HOLD. The
      intersection is what stops a workspace selling what it did not buy, and
      the two rails have separate vocabularies — a shared key name is a
      coincidence, not a mechanism.
    */
    customerFlags: {
      trainingPlans: { parked: false, enforcement: "gate", scope: "training", requires: "trainingPlans" },
      bodyReport: { parked: false, enforcement: "shape", scope: "body" },
      strengthReport: { parked: false, enforcement: "shape", scope: "training" },
      nutritionReport: { parked: false, enforcement: "shape", scope: "nutrition" },
      // The one honest exemption: computed entirely from the customer's own
      // entries, so there is nothing a route could withhold without breaking
      // the thing that produced it.
      macroBreakdown: { parked: true, enforcement: { derived: "computed from the customer's own logged entries" } },
    },

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

  /*
    ⚠️ EVERY `emits` IN THE OPERATIONS BELOW IS DECLARED HERE, and composition
    refuses one that is not. An undeclared event is two failures at once: a
    subscription nobody can make, and a notification with no copy, no icon and
    no destination — which renders, if anything renders it at all, as an
    anonymous bell.

    ⚠️ AND A LINK NAMES A DECLARED COLLECTION. Four types in a shipping product
    pointed at a path that was not a route, and were wrong for three stages
    because nothing rendered a notification. There is no string to get wrong.
  */
  notifications: {
    "plan.published": {
      category: "activity", tone: "success", icon: "check",
      title: "{name} published a plan for you",
      link: { to: "row", collection: "package" },
      roles: ["customer"],
    },
    "package.granted": {
      category: "billing", tone: "success", icon: "gift",
      title: "{days} days added",
      link: { to: "collection", collection: "package" },
      roles: ["customer", "owner"],
    },
    "staff.invited": {
      category: "action", tone: "info", icon: "person",
      title: "{email} was invited",
      link: { to: "inbox" },
      roles: ["owner"],
    },
  },
  operations: [readProgress, publishPlan, applyPackageGrant, inviteStaff],

  /*
    ⚠️ WRITTEN FOR THE PERSON USING THE PRODUCT, and the composition checks it —
    length, developer vocabulary, and the surfaces it claims to explain. An
    article past a screenful is not a thorough one, it is a failed one: whoever
    is reading it is stuck, on a phone, in the middle of something else.
  */
  help: {
    packages: {
      title: "Selling a package",
      body: "A package is a block of days you sell someone, plus what those days let them do. Buying more days adds to whatever they have left rather than starting again.",
      steps: ["Open Packages", "Name it and set a price", "Choose how many days", "Turn on what it includes", "Save"],
      surfaces: ["package"],
    },
    "plans.publishing": {
      title: "Why a plan will not publish",
      body: "A plan has to have at least one session in it, and every session needs at least one exercise. Fill in the empty days or remove them, then publish again.",
    },
    seats: {
      title: "Adding someone to the team",
      body: "Your plan includes a number of people. Invite someone and they get an email; they count towards that number from the moment they accept.",
    },
  },

  /* ⚠️ PRODUCT COPY. A file path, a type name or a pull-request number here is refused. */
  /*
    ⚠️ A PURPOSE IS A POLICY, not a folder. What may be uploaded here, which
    types, how large — and a free-form string makes every one of those questions
    unanswerable at the moment somebody is uploading.
  */
  filePurposes: {
    progressPhoto: { label: "Progress photo", accept: ["image/jpeg", "image/png"], maxBytes: 8_000_000 },
    exerciseClip: { label: "Exercise demonstration", accept: ["video/mp4"], maxBytes: 20_000_000 },
  },

  releases: [
    { version: "0.1.0", at: "2026-01-15", notes: ["You can now sell packages that renew.", "Progress reports load faster on a phone."] },
  ],

  /* Nothing has been withdrawn yet — and when it is, it is named here with a reason. */
  retired: {},
  problems: { ...appProblems, ...declareProblems({ "billing.quota_exceeded": { status: 402, title: "You've used everything in your plan", retryable: false } }) },

  // Registered per SURFACE rather than per action: a surface somebody is not
  // looking at is audible, a surface they are reading is silent.
  sounds: { pack: "one/default", surfaces: { session: "on", dashboard: "off" } },
});
