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
import { Badge, Button, Card, Callout, Reveal, SkeletonList, AlertTriangle, Check, Sparkles, Users } from "@mossa/ui";
import { FEATURE_META } from "@mossa/domain";
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
          <div role="radiogroup" aria-label="Choose your plan" className="space-y-2.5">
            {feed.plans.map((p) => {
              const on = selected === p.id;
              return (
                <Card
                  key={p.id}
                  role="radio"
                  aria-checked={on}
                  aria-label={`${p.name}, ${fmtPrice(usdToCents(p.priceUsdMonth))} per month${p.trialDays > 0 ? `, ${p.trialDays} days free` : ""}`}
                  onClick={() => onSelect(p.id)}
                  className={`space-y-2.5 p-4 transition-colors ${on ? "bg-primary/10 ring-2 ring-primary" : "hover:bg-surface-2"}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold tracking-tight">{p.name}</span>
                        {p.trialDays > 0 && (
                          <Badge tone="success">
                            <Sparkles aria-hidden /> {p.trialDays} days free
                          </Badge>
                        )}
                      </div>
                      <div className="numeral mt-0.5 text-sm text-muted-foreground">
                        {fmtPrice(usdToCents(p.priceUsdMonth))}/month
                        {p.trialDays > 0 && <span> · after the trial</span>}
                      </div>
                    </div>
                    <div
                      aria-hidden
                      className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full [&_svg]:size-3.5 ${on ? "bg-primary text-primary-foreground" : "bg-secondary text-transparent"}`}
                    >
                      <Check />
                    </div>
                  </div>
                  <ul className="flex flex-wrap gap-1.5">
                    {highlights(p).map((h) => (
                      <li key={h} className="rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
                        {h}
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>

          <Callout tone="neutral" icon={Users}>
            Changing or cancelling later is easy — plan changes and downgrades are self-serve under Business, and we tell you up front
            if anything needs sorting out first.
          </Callout>
        </>
      )}
    </Reveal>
  );
}
