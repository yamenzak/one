/**
 * Feature & quota catalog — the single presentation source of truth for plan
 * entitlements (BLUEPRINT §25).
 *
 * The `Features` / `Quotas` *shapes* (and their defaults) live in the API's
 * `entitlements.ts`; this catalog is the shared, human-facing description of each
 * one: label, help text, category, kind, and marketing copy. Every surface that
 * lists entitlements — the admin plan-grant editor, per-tenant overrides, the
 * customer billing cards, and the dashboard feature gates — derives from this
 * catalog, so a feature added here lights up everywhere at once instead of being
 * hand-maintained in five drifting lists.
 *
 * A drift test in the API (`entitlements-catalog.test.ts`) asserts the catalog
 * covers exactly the keys of `FREE_ENTITLEMENTS`, so adding a feature to the
 * plan shape without cataloguing it fails CI. Consumers also union in any key
 * they encounter in live data (`humanizeKey` fallback), so nothing is ever
 * silently hidden even before its catalog entry is written.
 */

/**
 * ⚠️ `FeatureKind` and `options` are GONE, and so is every `kind: "bool"`.
 *
 * Four features used to be `kind: "list"` with variant options — `ticker`,
 * `clock`, `weather`, `alerting`. Stage 4 flattened them into booleans (see the
 * app's `entitlements.ts` for what each list actually varied across the four
 * plans: one real bit each, plus three non-gates and one option no plan ever
 * granted). With no list features left, a `kind` field with a single inhabitant
 * is a branch every consumer still has to write and nothing can ever take.
 *
 * A feature is a boolean. If a genuinely tiered one ever arrives, it is two
 * booleans — which is what `ticker`/`tickerAdvanced` is, and it reads better at
 * the gate than `features.ticker.includes("advanced")` did.
 */
export interface FeatureDef {
  /** Key in the entitlements `features` blob. */
  key: string;
  /** Short human label (Title Case). */
  label: string;
  /** One-line explanation shown in editors and gate hints. */
  description: string;
  /** Grouping for the admin editors. */
  category: string;
  /** Safety features are never paywalled — surfaced, but not an upsell. */
  safety?: boolean;
  /** Marketing phrasing for the Billing plan card when on. Omit to keep it off
   *  the customer highlights list. */
  billing?: string;
}

export interface QuotaDef {
  key: string;
  label: string;
  description: string;
  /** Marketing phrasing for the Billing card given the value; return null to
   *  omit (e.g. a zero/!supported quota). Omit the fn to keep it off highlights. */
  billing?: (n: number) => string | null;
}

/** Category order for the admin editors (grouped, stable). */
export const FEATURE_CATEGORIES = [
  "Content & widgets",
  "AI",
  "Data & sources",
  "Scheduling & sync",
  "Boards & queues",
  "Workspace",
  "Advertising & audio",
  "Analytics & alerts",
  "Safety",
] as const;

const plural = (n: number) => (n === 1 ? "" : "s");

/** Every plan feature, in display order. Keys must match `Features` exactly. */
export const FEATURE_CATALOG: FeatureDef[] = [
  // Content & widgets
  { key: "htmlSandbox", label: "Custom HTML slides & widget", category: "Content & widgets",
    description: "Author sandboxed HTML/CSS/JS slides and a custom HTML widget.", billing: "Custom HTML slides & widget" },
  { key: "widgetStack", label: "Widget stacks", category: "Content & widgets",
    description: "Layer several widgets in one frame that rotate on a dwell timer.", billing: "Rotating widget stacks" },
  { key: "clockAnalog", label: "Analog clock", category: "Content & widgets",
    description: "The analog clock face. Digital is included on every plan.", billing: "Analog clock face" },
  // AI
  { key: "aiGeneration", label: "AI generation", category: "AI",
    description: "Generate slides, images, layouts, and voiceovers with AI.", billing: "AI slide, image & layout generation" },
  // Data & sources
  { key: "ticker", label: "News / RSS ticker", category: "Data & sources",
    description: "Scrolling headline ticker fed by RSS/JSON sources.", billing: "News / RSS ticker" },
  { key: "tickerAdvanced", label: "Advanced ticker", category: "Data & sources",
    description: "Multiple sources, custom styling and transitions on the ticker.", billing: "Advanced ticker" },
  { key: "weather", label: "Weather widgets", category: "Data & sources",
    description: "Live weather widgets, in both sizes.", billing: "Weather widgets" },
  // Scheduling & sync
  { key: "dayparting", label: "Dayparting", category: "Scheduling & sync",
    description: "Switch a screen's channel by time of day and day of week.", billing: "Dayparting & scheduling" },
  { key: "screenSaver", label: "Screen saver", category: "Scheduling & sync",
    description: "Blank or dim idle screens on a schedule to protect the panel." },
  { key: "multiScreenSync", label: "Multi-screen sync", category: "Scheduling & sync",
    description: "Keep screens sharing a channel frame-aligned (a video wall reads as one picture).", billing: "Frame-accurate multi-screen sync" },
  // Boards & queues
  { key: "roomQueueManagement", label: "Queues & rooms", category: "Boards & queues",
    description: "Live queue, room, and score boards with operator control apps.", billing: "Live queue, room & score boards" },
  // Advertising & audio
  { key: "ads", label: "Scheduled ads & interrupts", category: "Advertising & audio",
    description: "Time- or trigger-based full-screen ad breaks with audio.", billing: "Scheduled ads & interrupts" },
  { key: "musicLibrary", label: "Licensed music library", category: "Advertising & audio",
    description: "Play from the curated, licensed background-music library.", billing: "Licensed music library" },
  // Analytics & alerts
  { key: "proofOfPlay", label: "Proof-of-play analytics", category: "Analytics & alerts",
    description: "Per-play logs and exportable playout reports.", billing: "Proof-of-play analytics" },
  /*
    ⚠️ THE DASHBOARD CHANNEL IS NOT LISTED, and its absence is the point.

    This was one `list` feature with three options, and `dashboard` was granted
    by every plan — so it appeared in the operator's catalog as something that
    could be sold or withheld, and it never was. `email` was the opposite: an
    option in the catalog that NO plan has ever granted. Flattening surfaced
    both. Alerts always reach the dashboard; these two are what a plan buys.
  */
  { key: "alertsWebhook", label: "Webhook alerts", category: "Analytics & alerts",
    description: "Deliver alerts to a URL you own.", billing: "Webhook alerts" },
  { key: "alertsEmail", label: "Email alerts", category: "Analytics & alerts",
    description: "Deliver alerts by email. Not included in any plan yet.", billing: "Email alerts" },
  // Workspace
  { key: "customDomain", label: "Custom domain", category: "Workspace",
    description: "Serve the dashboard from your own domain.", billing: "Your own domain" },
  // Safety (never paywalled)
  { key: "emergencyOverride", label: "Emergency override", category: "Safety", safety: true,
    description: "Interrupt every screen with an emergency message. Always included." },
];

/** Every plan quota, in display order. Keys must match `Quotas` exactly. */
export const QUOTA_CATALOG: QuotaDef[] = [
  { key: "pairedDevices", label: "Screens", description: "Paired display devices.",
    billing: (n) => (n > 0 ? `${n} screen${plural(n)}` : null) },
  // People, not devices. Board users are metered by `stations` and are seat-free
  // — see `SEAT_FREE_ROLES` in the app's access.ts for why charging twice for a
  // counter would be wrong.
  { key: "seats", label: "Team members", description: "People who can sign in — the owner included.",
    billing: (n) => (n > 0 ? `${n} team member${plural(n)}` : n < 0 ? "Unlimited team members" : null) },
  { key: "profiles", label: "Widget profiles", description: "Reusable widget layouts.",
    billing: (n) => (n > 0 ? `${n} widget profile${plural(n)}` : null) },
  { key: "channelsPerProfile", label: "Channels / profile", description: "Channels each profile may carry." },
  { key: "slidesPerPlaylist", label: "Slides / playlist", description: "Max slides in one playlist." },
  { key: "feeds", label: "Live data sources", description: "RSS/JSON/Sheet data sources.",
    billing: (n) => (n > 0 ? `${n} live data source${plural(n)}` : null) },
  /*
    ⚠️ THE TWO QUOTAS WHERE A SMALLER NUMBER IS BETTER. They are floors on an
    interval, not ceilings on a count — see `INVERTED_QUOTAS` in the app's
    entitlements.ts, and note that the grant-only override raises them, which
    makes a gift slower. Neither carries `billing` copy: "3600 minimum feed
    refresh" is not a selling point, it is the absence of one.
  */
  { key: "feedRefreshMinSec", label: "Min feed refresh (sec)", description: "Fastest allowed source refresh." },
  { key: "resyncIntervalSec", label: "Screen resync (sec)", description: "How often a screen re-fetches its manifest. Was its own `sync` axis." },
  { key: "scheduleRules", label: "Schedule rules", description: "Per-device dayparting rules." },
  { key: "historyVersions", label: "History versions", description: "Retained channel revisions." },
  { key: "liveBoards", label: "Live boards", description: "Queue/room/score boards.",
    billing: (n) => (n > 0 ? `${n} live board${plural(n)} — queues, rooms, scores` : null) },
  { key: "stations", label: "Stations", description: "Board station groupings." },
  { key: "boardsPerStation", label: "Boards / station", description: "Boards each station may hold." },
  { key: "libraryTracks", label: "Library tracks", description: "Distinct licensed tracks in use (-1 = unlimited)." },
];

const FEATURE_BY_KEY = new Map(FEATURE_CATALOG.map((f) => [f.key, f]));
const QUOTA_BY_KEY = new Map(QUOTA_CATALOG.map((q) => [q.key, q]));

export function featureDef(key: string): FeatureDef | undefined {
  return FEATURE_BY_KEY.get(key);
}
export function quotaDef(key: string): QuotaDef | undefined {
  return QUOTA_BY_KEY.get(key);
}

/** Turn a camelCase key into a readable label — the fallback when a key isn't in
 *  the catalog yet, so a freshly added entitlement never renders as a raw key. */
export function humanizeKey(key: string): string {
  const s = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Catalog entry for a feature key, synthesising a humanized fallback so unknown
 *  keys still render with a sensible label/description. */
export function featureMeta(key: string): FeatureDef {
  return FEATURE_BY_KEY.get(key) ?? {
    key, label: humanizeKey(key), description: "", category: "Other",
  };
}
export function quotaMeta(key: string): QuotaDef {
  return QUOTA_BY_KEY.get(key) ?? { key, label: humanizeKey(key), description: "" };
}
