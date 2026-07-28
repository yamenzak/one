/**
 * Onboarding step 2 — choose a plan. Mandatory: there is no free tier any more
 * (`free` is a grandfathered `active: 0` row), so every new studio picks one of
 * the four live plans and two of them open with 30 days free.
 *
 * The feed is `GET /api/me/onboarding/plans`, not `GET /api/billing`: this screen
 * renders for a caller who is signed in and has no tenant yet, and every
 * `/api/billing*` path sits behind `requireTenant`. See onboarding-routes.ts.
 *
 * Loader discipline (AGENTS.md §8): an `alive` guard so a stale response can't
 * commit, a `.catch` that sets an error state AND clears loading, and a retry —
 * `Reveal` shimmers forever otherwise, and this is a screen nobody can get past.
 */

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Callout, Choice, ChoiceGroup, GroupNote, Reveal, SkeletonList, AlertTriangle, Gift } from "@kova/ui";
import { FEATURE_META } from "@kova/domain";
import { api, errorText } from "../../api.js";
import { fmtPrice } from "../../money.js";

/** Platform-rail catalog prices are stored in DOLLARS; `fmtPrice` takes cents. */
const usdToCents = (usd: number) => Math.round((usd ?? 0) * 100);

export interface PlanCard {
  id: string;
  name: string;
  priceUsdMonth: number;
  trialDays: number;
  limits: { staffSeats: number; activeClients: number; templates: number; storageMb: number; monthlyCredits: number };
  features: string[];
}

export interface PlansFeed {
  plans: PlanCard[];
  stripeEnabled: boolean;
  hasTenant: boolean;
  current: { planId: string; pendingPlanId: string | null; status: string } | null;
}

/** `-1` means unlimited everywhere in `Quotas`. */
const cap = (n: number, one: string, many: string) => (n < 0 ? `Unlimited ${many}` : `${n} ${n === 1 ? one : many}`);

const storage = (mb: number) => (mb >= 1000 ? `${Math.round(mb / 1000)} GB media` : `${mb} MB media`);

/** The three or four lines that actually decide the choice, in plain language. */
function highlights(p: PlanCard): string[] {
  const feats = p.features
    .filter((f) => f !== "externalSearch" && f !== "aiSuite")
    .map((f) => FEATURE_META[f]?.label ?? f);
  return [
    cap(p.limits.staffSeats, "coach", "coaches"),
    cap(p.limits.activeClients, "client", "clients"),
    `${p.limits.monthlyCredits.toLocaleString()} AI credits / month`,
    storage(p.limits.storageMb),
    ...feats,
  ];
}

export function PlanStep({
  selected,
  onSelect,
  onFeed,
}: {
  selected: string | null;
  onSelect: (planId: string) => void;
  /** Bubbles the feed up so the flow can pre-select a resumed choice and know
   *  whether Stripe is configured before it reaches the payment step. */
  onFeed: (feed: PlansFeed) => void;
}) {
  const [feed, setFeed] = useState<PlansFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let alive = true;
    setError(null);
    api
      .get<PlansFeed>("/api/me/onboarding/plans")
      .then((r) => {
        if (!alive) return;
        setFeed(r);
        onFeed(r);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        // Sets the error AND leaves `feed` null → Reveal stops shimmering because
        // we render the error branch instead of it.
        setError(errorText(e, "Couldn't load the plans. Check your connection and try again."));
      });
    return () => {
      alive = false;
    };
    // `onFeed` is a stable useCallback in the parent; reloadKey drives the retry.
  }, [reloadKey, onFeed]);

  if (error && !feed) {
    return (
      <div className="space-y-3">
        <Callout tone="danger" icon={AlertTriangle} live="alert">
          {error}
        </Callout>
        <Button size="lg" variant="secondary" className="w-full" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <Reveal loading={!feed} className="space-y-3" skeleton={<SkeletonList card rows={4} thumb={0} />}>
      {feed && (
        <>
          {/* A real radiogroup, arrow-key navigable, one tab stop — see
              packages/ui/src/choice.tsx. Rows rather than cards on purpose: this
              is a decision, and a decision wants one scannable left edge (§9),
              not four browsable tiles. */}
          <ChoiceGroup label="Choose your plan" value={selected} onChange={onSelect}>
            {feed.plans.map((p) => (
              <Choice
                key={p.id}
                value={p.id}
                label={`${p.name}, ${fmtPrice(usdToCents(p.priceUsdMonth))} per month${p.trialDays > 0 ? `, ${p.trialDays} days free` : ""}`}
                title={p.name}
                badge={p.trialDays > 0 ? <Badge tone="success"><Gift aria-hidden /> {p.trialDays} days free</Badge> : undefined}
                meta={fmtPrice(usdToCents(p.priceUsdMonth))}
                metaSub={p.trialDays > 0 ? "/mo after" : "/month"}
                tags={highlights(p)}
              />
            ))}
          </ChoiceGroup>

          <GroupNote>
            Changing or cancelling later is self-serve under Business, and we tell you up front if anything needs sorting out first.
          </GroupNote>
        </>
      )}
    </Reveal>
  );
}
