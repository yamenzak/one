/**
 * WHAT A PLAN BOUGHT — Scena's registry, on `@4dl/billing`'s engine.
 *
 * The engine owns three rules that all point the same way, and none of them was
 * true of the resolver this replaces:
 *
 *   RESOLUTION COERCES BY TYPE.  A feature is enabled only by a literal `true`,
 *   a quota only by a finite number. The old resolver was `{ ...free, ...raw }`,
 *   so an operator typo in the plan JSON (`"aiGeneration": 1`, `"true"`,
 *   `"yes"`) switched on a paid capability, and a string in a quota flowed
 *   straight into a `>=` comparison.
 *
 *   OVERRIDES ARE GRANT-ONLY.  A per-tenant blob may raise a quota or enable a
 *   feature and can never lower or disable one. The old `mergeOverrides` was a
 *   plain spread in both directions, so the "gift" blob could silently TAKE a
 *   feature away.
 *
 *   A SUSPENDED STATUS CLAMPS TO FREE.  Applied once, at resolution, so every
 *   gate inherits it. Scena clamped nowhere: `tenantEntitlements` resolved the
 *   plan whatever the subscription said, and the comment claiming "playout is
 *   gated elsewhere" was describing the HOST gate, which answers a different
 *   question — that one closes an origin, this one decides capability.
 *
 * ── The list features are gone, and they were carrying one bit each ────────
 *
 * Four features were `string[]` — `ticker`, `clock`, `weather`, `alerting` —
 * enumerating the variants a plan included. The engine coerces a feature to a
 * boolean, so they could not survive the move as-is. What they actually varied
 * across the four plans settled how to split them:
 *
 *   clock      `["digital"]` → `["digital","analog"]`.  `digital` is on EVERY
 *              plan, so it was never a gate. One real bit: analog.
 *   weather    `[]` → `["small","large"]`.  Both sizes always moved together.
 *              One real bit.
 *   alerting   `["dashboard"]` → `["dashboard","webhook"]`.  `dashboard` is on
 *              every plan — not a gate. `email` was in the catalog and granted
 *              by NO plan: a dead option an operator could see and never sell.
 *   ticker     `[]` → `["basic"]` → `["basic","advanced"]`.  Genuinely two bits.
 *
 * Six booleans replace four lists, and three non-gates plus one dead option stop
 * pretending to be product decisions. Nothing was lost.
 *
 * ── And `sync` stopped being a fourth axis ─────────────────────────────────
 *
 * `resyncIntervalSec` lived in its own `sync: {}` block. It is a numeric ceiling
 * that varies per plan — which is what a quota is, and `feedRefreshMinSec` was
 * already exactly that shape one key away. Under the engine an unknown top-level
 * axis is not merged at all, so leaving it there would have frozen every plan on
 * the free tier's 60 seconds, silently.
 */

import { bindEntitlements, type EntitlementShape } from "@4dl/billing";

export interface Quotas {
  pairedDevices: number;
  profiles: number;
  channelsPerProfile: number;
  slidesPerPlaylist: number;
  feeds: number;
  /** ⚠️ A MINIMUM interval — see `INVERTED_QUOTAS`. */
  feedRefreshMinSec: number;
  /** How often a screen re-fetches its manifest. ⚠️ Also a minimum — see
   *  `INVERTED_QUOTAS`. Was `sync.resyncIntervalSec`, its own axis. */
  resyncIntervalSec: number;
  scheduleRules: number;
  historyVersions: number;
  liveBoards: number;
  stations: number;
  boardsPerStation: number;
  /** Distinct licensed-library tracks a tenant may use at once (-1 = unlimited). */
  libraryTracks: number;
  /**
   * Megabytes of uploaded + generated media the workspace may hold at once
   * (-1 = unlimited). Enforced on every R2 write by `storage.ts`.
   *
   * New in Stage 5, and it is the first ceiling on the one resource Scena's
   * customers consume without limit: a signage workspace uploads video. There
   * was no quota because there was no ledger to count against — R2 has no
   * queryable metadata, so nothing in the product could answer "how much is
   * this workspace storing?". `media_assets` (`@4dl/storage`) is that answer,
   * and this is the line it is measured against.
   */
  storageMb: number;
  /**
   * People who can sign in to the dashboard — the OWNER INCLUDED, because the
   * label is "owner + staff". A one-seat plan is a one-person tenant by design.
   *
   * Board users do NOT count: they are shared devices at a counter, they are
   * minted per board, and they are already metered by `stations`. Charging for
   * them twice would make an eight-room clinic buy eight staff seats to run a
   * queue. `SEAT_FREE_ROLES` in access.ts is the other half of that decision.
   */
  seats: number;
}

/**
 * THE TWO QUOTAS WHERE A BIGGER NUMBER IS WORSE.
 *
 * Every other quota is a ceiling: more screens, more seats, more feeds. These
 * two are FLOORS on an interval — the fastest a tenant may poll — so a premium
 * plan carries a SMALLER number, and the engine's grant-only override (`max`,
 * with `-1` absorbing) RAISES them, which makes a tenant's feeds and screens
 * slower. A gift that degrades the thing it is gifting.
 *
 * Left as-is deliberately rather than inverted into a rate: `feedRefreshMinSec`
 * is what the feed scheduler and the manifest compiler both read, and renaming
 * it is a change to the playout path inside a stage about billing. What is NOT
 * left alone is the silence — `entitlements.test.ts` pins this list, so a third
 * inverted quota cannot be added without someone reading this note.
 */
export const INVERTED_QUOTAS = ["feedRefreshMinSec", "resyncIntervalSec"] as const;

export interface Features {
  /** A scrolling headline ticker at all. */
  ticker: boolean;
  /** The richer ticker: multiple sources, styling, transitions. */
  tickerAdvanced: boolean;
  /** The analog clock face. Digital is on every plan and is not a gate. */
  clockAnalog: boolean;
  /** Live weather widgets. Both sizes always moved together. */
  weather: boolean;
  widgetStack: boolean;
  htmlSandbox: boolean;
  screenSaver: boolean;
  dayparting: boolean;
  roomQueueManagement: boolean;
  proofOfPlay: boolean;
  /** Deliver alerts to a webhook. The dashboard list is on every plan. */
  alertsWebhook: boolean;
  /** Deliver alerts by email. No plan has ever granted this — it is here so the
   *  catalog and the shape agree, and so turning it on is one edit. */
  alertsEmail: boolean;
  /** Safety — never paywalled (§12). Present so the shape is complete and so a
   *  plan blob cannot be the thing that disables it. */
  emergencyOverride: boolean;
  /** AI slide/widget/TTS/image generation (§24). */
  aiGeneration: boolean;
  /** Scheduled ads / interrupts (§21) — the ad system is a premium module. */
  ads: boolean;
  /** Access to the admin-curated licensed music library (§16 extension). */
  musicLibrary: boolean;
  /** Frame-accurate sync across multiple screens (§7). Off = each screen
   *  free-runs on its own clock; on = the fleet plays in lockstep. A premium
   *  upsell — one screen never needs it. */
  multiScreenSync: boolean;
  /**
   * Serve the dashboard from the tenant's OWN domain.
   *
   * New in Stage 4, and it closes a real placeholder: Stage 3 wired custom
   * domains with no flag to gate them on, so `domain-routes.ts` read a PROXY —
   * "does this plan have unlimited library tracks" — which happened to be true
   * on exactly the tier we wanted and was a lie about why.
   */
  customDomain: boolean;
}

export interface Entitlements extends EntitlementShape {
  quotas: Quotas;
  features: Features;
  aiCredits: { monthlyGrant: number };
  /** Free-trial days on a NEW subscription. Scena sells none today; the key
   *  exists because the engine consumes it when opening a Stripe subscription. */
  trialDays: number;
}

/**
 * The most restrictive baseline — an unknown, free or SUSPENDED tenant resolves
 * to this. It is also the key registry: a key absent here does not exist, which
 * is what makes every merge above fail closed.
 *
 * ⚠️ `emergencyOverride` IS `true` HERE, and that is the point. A suspended
 * tenant clamps to this object. Scena's screens carry fire, evacuation and
 * incident messages, so the one capability that must survive every rung of the
 * ladder has to be true in the BASELINE, not merely true on every plan.
 * `route-guard.ts` exempts `/api/emergency` from the read-only gate for the same
 * reason; this is the other half of it.
 */
export const FREE_ENTITLEMENTS: Entitlements = {
  quotas: {
    pairedDevices: 1,
    seats: 1,
    profiles: 1,
    channelsPerProfile: 1,
    slidesPerPlaylist: 10,
    feeds: 0,
    feedRefreshMinSec: 3600,
    resyncIntervalSec: 60,
    scheduleRules: 0,
    historyVersions: 3,
    liveBoards: 0,
    stations: 0,
    boardsPerStation: 1,
    libraryTracks: 0,
    // 100 MB — enough for a handful of images and a short loop, not enough to
    // park a media library on the tier nobody pays for. This is also what a
    // SUSPENDED workspace clamps to, which is the right shape: their existing
    // media stays served (reads are never gated), they just cannot add more.
    storageMb: 100,
  },
  features: {
    ticker: false,
    tickerAdvanced: false,
    clockAnalog: false,
    weather: false,
    widgetStack: false,
    htmlSandbox: false,
    screenSaver: true,
    dayparting: false,
    roomQueueManagement: false,
    proofOfPlay: false,
    alertsWebhook: false,
    alertsEmail: false,
    emergencyOverride: true,
    aiGeneration: false,
    ads: false,
    musicLibrary: false,
    multiScreenSync: false,
    customDomain: false,
  },
  aiCredits: { monthlyGrant: 0 },
  trialDays: 0,
};

const engine = bindEntitlements<Entitlements>(FREE_ENTITLEMENTS);

/** Merge a plan's stored blob onto the free baseline, coercing by type. */
export const resolveEntitlements = (json: string | null | undefined): Entitlements => engine.resolve(json);

/** Layer a per-tenant override — GRANT-ONLY, so a gift can never take. */
export const mergeOverrides = (base: Entitlements, json: string | null | undefined): Entitlements =>
  engine.merge(base, json);

/** An operator's ABSOLUTE per-tenant setting, applied AFTER the override. The
 *  two are different things: one is grandfathering and must only ratchet, the
 *  other is a deliberate adjustment that has to be reversible. */
export const adjustEntitlements = engine.adjust;

/** Clamp to free when the status withholds service. */
export const clampForStatus = engine.clamp;

/** The whole resolution with its working shown, for the operator console. */
export const explainEntitlements = engine.explain;

/** A tenant's current resource usage, gathered for a downgrade check. */
export interface Usage {
  pairedDevices: number;
  channels: number;
  feeds: number;
  scheduleRules: number;
  liveBoards: number;
  stations: number;
}

export type Violation =
  | { type: "quota"; resource: string; have: number; max: number; removeCount: number }
  | { type: "feature"; resource: string; instances: number; action: string };

export interface DowngradeResult {
  eligible: boolean;
  violations: Violation[];
}

/**
 * Diff current usage against a target plan (§25). Returns the exact remediation
 * checklist; `eligible` is true only when nothing is over the line, and the plan
 * change is blocked until it is.
 *
 * ⚠️ `-1` IS UNLIMITED and every comparison here has to know it. It did not:
 * `have > max` with `max === -1` reports a violation for every existing row, so
 * moving TO a plan with an unlimited quota would have been refused with a
 * checklist telling the owner to delete everything they own. No plan currently
 * sets `-1` on one of the six checked quotas, which is the only reason it never
 * fired — a latent bug waiting for a pricing change.
 */
export function checkDowngrade(usage: Usage, target: Entitlements): DowngradeResult {
  const v: Violation[] = [];
  const q = target.quotas;

  const overQuota = (resource: string, have: number, max: number) => {
    if (max < 0) return; // unlimited
    if (have > max) v.push({ type: "quota", resource, have, max, removeCount: have - max });
  };
  overQuota("pairedDevices", usage.pairedDevices, q.pairedDevices);
  // A product of two quotas, so EITHER being unlimited makes the product so.
  const channelCeiling = q.channelsPerProfile < 0 || q.profiles < 0 ? -1 : q.channelsPerProfile * q.profiles;
  overQuota("channels", usage.channels, channelCeiling);
  overQuota("feeds", usage.feeds, q.feeds);
  overQuota("scheduleRules", usage.scheduleRules, q.scheduleRules);
  overQuota("liveBoards", usage.liveBoards, q.liveBoards);
  overQuota("stations", usage.stations, q.stations);

  // Feature loss: using a module the target plan doesn't include.
  if (!target.features.roomQueueManagement && usage.liveBoards > 0) {
    v.push({
      type: "feature",
      resource: "roomQueueManagement",
      instances: usage.liveBoards,
      action: "delete queue/room boards + their stations",
    });
  }

  return { eligible: v.length === 0, violations: v };
}
