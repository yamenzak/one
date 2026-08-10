/**
 * THE PROOF — Scena's three hardest collections, in the stage 0 types.
 *
 * Chosen because each breaks a different naive assumption a collection type
 * tends to make.
 */

import { collection, field } from "../src/collection.js";

/* ------------------------------------------------------------------- 1 --- */

/**
 * A slide: ordinary, tenant-scoped, ordered inside a parent, cached on a device
 * that may be offline for weeks.
 *
 * The baseline case, included so the two below are contrasts rather than
 * assertions.
 */
export const slides = collection({
  id: "slide",
  label: { one: "Slide", many: "Slides" },
  scope: { of: "tenant" },
  version: true,
  holding: { kind: "none" as const, why: "A fixture. It exists to be a shape, not to hold anybody's data." },
  retention: { days: null, onTenantClose: "purge" },
  onDelete: { on: "archive" },
  activity: true,
  offline: "cache",
  fields: {
    playlistId: field.ref("playlist", { onDelete: "cascade", required: true }),
    ord: field.number({ integer: true, required: true }),
    durationSec: field.number({ min: 1, required: true }),
    body: field.json("slide.v1", { required: true }),
    art: field.media({ accept: ["image/*"], maxBytes: 25_000_000 }),
  },
  views: { list: { columns: ["ord", "durationSec"], defaultSort: "ord" } },
});

/* ------------------------------------------------------------------- 2 --- */

/**
 * A screen: a DEVICE, not a document.
 *
 * ⚠️ Breaks "a collection is rows a person edits". A screen is paired rather
 * than created, it holds live state in a durable actor rather than in the row,
 * and it is the one thing here whose deletion must be a purge — an archived
 * screen still holding a pairing claim is a television somebody else can adopt.
 */
export const screens = collection({
  id: "screen",
  label: { one: "Screen", many: "Screens" },
  scope: { of: "tenant" },
  version: true,
  holding: { kind: "none" as const, why: "A fixture. It exists to be a shape, not to hold anybody's data." },
  retention: { days: null, onTenantClose: "purge" },
  onDelete: { on: "purge" },
  activity: true,
  realtime: true,
  offline: "none",
  fields: {
    name: field.text({ required: true, max: 60 }),
    channelId: field.ref("channel", { onDelete: "null" }),
    status: field.enum(["paired", "unpaired", "offline"], { required: true }),
    lastSeen: field.instant(),
    tz: field.text(),
  },
  views: { list: { columns: ["name", "status", "lastSeen"], groupBy: "status" } },
});

/* ------------------------------------------------------------------- 3 --- */

/**
 * ⚠️ THE ONE THAT BREAKS A COLLECTION TYPE ASSUMING TENANCY.
 *
 * A licensed music catalogue every workspace draws from. It has no tenant to key
 * on, and putting it in a tenant cascade means the first erasure deletes the
 * library for everybody else — a failure that is both catastrophic and silent,
 * since a purge swallows delete errors by construction.
 *
 * Its media is content-addressed: one object, many referencing tenants, one
 * ledger row each. Relocation must copy rather than move, or moving one tenant
 * breaks every other tenant's manifest — which their screens then replay
 * offline for weeks.
 */
export const libraryTracks = collection({
  id: "library_track",
  label: { one: "Library track", many: "Library" },
  scope: { of: "platform", why: "A licensed catalogue shared by every workspace. It has no tenant column, and a tenant cascade over it would delete the library on the first erasure." },
  version: true,
  holding: { kind: "none" as const, why: "A fixture. It exists to be a shape, not to hold anybody's data." },
  retention: { days: null, onTenantClose: "purge" },
  onDelete: { on: "archive" },
  activity: true,
  search: ["title", "artist"],
  fields: {
    title: field.text({ required: true }),
    artist: field.text(),
    audio: field.media({ accept: ["audio/*"], maxBytes: 50_000_000, exifStrip: false }),
    art: field.media({ accept: ["image/*"], maxBytes: 10_000_000 }),
  },
});
