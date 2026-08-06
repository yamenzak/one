/**
 * Plan entitlements + downgrade eligibility (BLUEPRINT §25) — pure.
 *
 * Each plan carries an `entitlements_json` blob resolved onto the tenant. Value
 * is metered on three axes: capacity **quotas**, feature **gates**, and **AI
 * credits**. Enforcement happens at two points (both call into this module):
 * on dashboard write (block creating beyond quota) and at manifest-compile
 * (strip gated features so a screen can never bypass them).
 *
 * Downgrade is compliance-gated: you cannot shed a plan while still using what
 * it paid for. `checkDowngrade` diffs current usage against a target plan and
 * returns an exact remediation checklist.
 */

export interface Quotas {
  pairedDevices: number;
  profiles: number;
  channelsPerProfile: number;
  slidesPerPlaylist: number;
  feeds: number;
  feedRefreshMinSec: number;
  scheduleRules: number;
  historyVersions: number;
  liveBoards: number;
  stations: number;
  boardsPerStation: number;
  /** Distinct licensed-library tracks a tenant may use at once (-1 = unlimited). */
  libraryTracks: number;
}

export interface Features {
  ticker: string[];
  clock: string[];
  weather: string[];
  widgetStack: boolean;
  htmlSandbox: boolean;
  screenSaver: boolean;
  dayparting: boolean;
  roomQueueManagement: boolean;
  proofOfPlay: boolean;
  alerting: string[];
  emergencyOverride: boolean;
  /** AI slide/widget/TTS/image generation (§24). Gated like any premium feature. */
  aiGeneration: boolean;
  /** Scheduled ads / interrupts (§21) — the ad system is a premium module. */
  ads: boolean;
  /** Access to the admin-curated licensed music library (§16 extension). */
  musicLibrary: boolean;
  /** Frame-accurate sync across multiple screens (§7). Off = each screen
   *  free-runs on its own clock (single-screen mode); on = the fleet plays in
   *  lockstep. A premium upsell — one screen never needs it. */
  multiScreenSync: boolean;
}

export interface Entitlements {
  quotas: Quotas;
  sync: { resyncIntervalSec: number };
  features: Features;
  aiCredits: { monthlyGrant: number };
}

/** The most restrictive baseline — an unknown/free tenant resolves to this. */
export const FREE_ENTITLEMENTS: Entitlements = {
  quotas: {
    pairedDevices: 1,
    profiles: 1,
    channelsPerProfile: 1,
    slidesPerPlaylist: 10,
    feeds: 0,
    feedRefreshMinSec: 3600,
    scheduleRules: 0,
    historyVersions: 3,
    liveBoards: 0,
    stations: 0,
    boardsPerStation: 1,
    libraryTracks: 0,
  },
  sync: { resyncIntervalSec: 60 },
  features: {
    ticker: [],
    clock: ["digital"],
    weather: [],
    widgetStack: false,
    htmlSandbox: false,
    screenSaver: true,
    dayparting: false,
    roomQueueManagement: false,
    proofOfPlay: false,
    alerting: ["dashboard"],
    emergencyOverride: true, // safety — never paywalled (§12)
    aiGeneration: false,
    ads: false,
    musicLibrary: false,
    multiScreenSync: false, // single-screen by default; sync is a premium upsell
  },
  aiCredits: { monthlyGrant: 0 },
};

/** Deep-ish merge of a stored (possibly partial) blob onto the free baseline. */
export function resolveEntitlements(json: string | null | undefined): Entitlements {
  if (!json) return FREE_ENTITLEMENTS;
  let raw: Partial<Entitlements>;
  try {
    raw = JSON.parse(json) as Partial<Entitlements>;
  } catch {
    return FREE_ENTITLEMENTS;
  }
  return {
    quotas: { ...FREE_ENTITLEMENTS.quotas, ...(raw.quotas ?? {}) },
    sync: { ...FREE_ENTITLEMENTS.sync, ...(raw.sync ?? {}) },
    features: { ...FREE_ENTITLEMENTS.features, ...(raw.features ?? {}) },
    aiCredits: { ...FREE_ENTITLEMENTS.aiCredits, ...(raw.aiCredits ?? {}) },
  };
}

/**
 * Layer a per-tenant override blob (a partial Entitlements) on top of the plan's
 * resolved entitlements — an admin "gift" (§25): a few extra screens, an unlocked
 * feature, a bigger credit grant. Only the keys present in the override win;
 * everything else inherits the plan.
 */
export function mergeOverrides(base: Entitlements, json: string | null | undefined): Entitlements {
  if (!json) return base;
  let o: Partial<Entitlements>;
  try {
    o = JSON.parse(json) as Partial<Entitlements>;
  } catch {
    return base;
  }
  return {
    quotas: { ...base.quotas, ...(o.quotas ?? {}) },
    sync: { ...base.sync, ...(o.sync ?? {}) },
    features: { ...base.features, ...(o.features ?? {}) },
    aiCredits: { ...base.aiCredits, ...(o.aiCredits ?? {}) },
  };
}

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
 * Diff current usage against a target plan's entitlements (§25). Returns the
 * exact remediation checklist; `eligible` is true only when nothing is over the
 * line. The plan change is blocked until this returns eligible.
 */
export function checkDowngrade(usage: Usage, target: Entitlements): DowngradeResult {
  const v: Violation[] = [];
  const q = target.quotas;

  const overQuota = (resource: string, have: number, max: number) => {
    if (have > max) v.push({ type: "quota", resource, have, max, removeCount: have - max });
  };
  overQuota("pairedDevices", usage.pairedDevices, q.pairedDevices);
  overQuota("channels", usage.channels, q.channelsPerProfile * q.profiles);
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
