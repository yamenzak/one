/**
 * The centre is closed for non-payment — the whole app, replaced by one screen.
 *
 * Rung two of the platform ladder (`@4dl/billing`'s `DUNNING_DAYS`): past due →
 * read-only at 7 days → blocked at 30 → purged at 37. Read-only still serves the
 * whole app and refuses writes; this withholds it.
 *
 * ── Why this screen did not exist until now ─────────────────────────────────
 *
 * `Shell.tsx` has said since it was written that `blocked` "is handled before
 * the Shell ever mounts". Nothing handled it. `session.ts` declared the field
 * and no code in the app read it, so a centre thirty days past due got the
 * ordinary application with a small read-only chip in the corner and every write
 * failing one at a time — which reads as "the software is broken", not as "the
 * invoice is unpaid", and is the version somebody repeats to their supplier.
 *
 * ── Two doors stay open, and that is the whole design ───────────────────────
 *
 * A screen that only says "pay" is a trap. `@4dl/tenancy`'s gate exempts
 * `/api/tenant/close` and `/api/me/*` from every rung precisely so that leaving
 * is always possible, and a screen with no exit would make that exemption
 * protect nothing:
 *
 *   pay      the thing that ends it, for whoever can
 *   leave    export or close, for everyone — a centre's records are its own and
 *            must not be held against an invoice
 *
 * ── What it does NOT do ─────────────────────────────────────────────────────
 *
 * It does not name a deadline. The purge date lives on the subscription row and
 * this screen is rendered from the host gate, which carries the rung and not the
 * clock; inventing "7 days left" from a rung would be a number nobody computed.
 * Settings shows the real one.
 */

import { AlertTriangle, ArrowRight, Button, Card, IconBadge, Page, Stagger, TierAnchor } from "@4dl/ui";
import { RefreshNote } from "@4dl/app-kit";
import { useT } from "../i18n.js";
import { useSession } from "../session.js";

export function CentreBlocked() {
  const t = useT();
  const { host } = useSession();
  const name = host?.tenant?.name ?? t("app.name");

  return (
    <Page className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      {/* No T1 anchor: the subject is a state, not a value, and there is nothing
          to count. The icon and the sentence ARE the anchor. */}
      <TierAnchor className="flex flex-col items-center gap-3 text-center">
        <IconBadge icon={AlertTriangle} tone="danger" size="lg" />
        <div className="space-y-1.5">
          <h1 className="text-title-1">{t("blocked.title", { name })}</h1>
          <p className="text-body text-muted-foreground">{t("blocked.body")}</p>
        </div>
      </TierAnchor>

      <Stagger className="space-y-3">
        <Card className="space-y-3">
          <p className="text-caption leading-relaxed text-muted-foreground">{t("blocked.dataSafe")}</p>
          {/* A full page load rather than a router navigation: the Shell is not
              mounted, so there is no route table to navigate within. */}
          <Button size="lg" className="w-full" onClick={() => { window.location.href = "/settings"; }}>
            {t("blocked.settle")}
            <ArrowRight aria-hidden />
          </Button>
        </Card>
        {/* The gate is read once, at boot. When the invoice clears, only asking
            again gets back in. */}
        <RefreshNote label={t("blocked.settledAlready")} action={t("blocked.checkAgain")} />
      </Stagger>
    </Page>
  );
}
