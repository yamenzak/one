/**
 * The studio is closed for non-payment — the whole app, replaced by one screen.
 *
 * This is rung two of the platform ladder (`@4dl/billing` `DUNNING_DAYS`):
 * read-only at 7 days, blocked at 30, deleted at 37. Read-only still shows the
 * app and refuses writes; this withholds it.
 *
 * ── Two doors stay open, and that is the whole design ──
 *
 * A screen that only says "pay" is a trap, and this product had one until
 * recently: a suspended studio refused every write including the owner's attempt
 * to close it. So there are always exactly two ways out —
 *
 *   pay      the thing that fixes it, for whoever can
 *   leave    export or delete, for everyone, because a person's data is theirs
 *            and must not be held against someone else's invoice
 *
 * ── The copy differs by who is reading ──
 *
 * The OWNER caused this and can end it, so they get the deadline and the button.
 * A CLIENT did not and cannot: telling them to "update your payment method"
 * would send them to fix a bill that is not theirs. They get the truth — their
 * coach's studio is closed, their data is theirs, and here is how to take it.
 *
 * No T1 anchor (§1): the subject of this screen is a state, not a value, and
 * there is nothing to count. The icon and the sentence ARE the anchor.
 */

import { Button, Card, IconBadge, AlertTriangle, ArrowRight, TierAnchor, Page, Stagger } from "@4dl/ui";
import { useNavigate } from "react-router-dom";
import { DUNNING_DAYS } from "@4dl/billing/model";
import type { PersonaRole } from "../registry/index.js";

const PURGE_WINDOW = DUNNING_DAYS.purge - DUNNING_DAYS.blocked;

export function StudioBlocked({ studioName, role }: { studioName: string; role: PersonaRole | string }) {
  const nav = useNavigate();
  const isOwner = role === "owner";

  return (
    <Page className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <TierAnchor className="flex flex-col items-center gap-3 text-center">
        <IconBadge icon={AlertTriangle} tone="danger" size="lg" />
        <div className="space-y-1.5">
          <h1 className="text-title-1">{studioName} is suspended</h1>
          <p className="text-body text-muted-foreground">
            {isOwner
              ? `Your Kova subscription hasn't been paid, so the studio is closed to you and your clients. Everything is permanently deleted ${PURGE_WINDOW} days after it closed.`
              : "Your coach's studio has been closed by Kova. It isn't anything you did, and there's nothing you can pay to reopen it."}
          </p>
        </div>
      </TierAnchor>

      <Stagger className="space-y-3">
        {isOwner ? (
          <>
            <Button size="lg" className="w-full" onClick={() => nav("/business")}>
              Pay and reopen <ArrowRight />
            </Button>
            <Card className="space-y-1.5 text-center">
              <p className="text-caption text-muted-foreground">
                Don't want to continue? You can close the studio yourself and choose when your data goes,
                rather than waiting for it to be deleted.
              </p>
              <Button variant="ghost" size="sm" onClick={() => nav("/settings?s=danger")}>Close the studio instead</Button>
            </Card>
          </>
        ) : (
          <Card className="space-y-2.5">
            <p className="text-body">Your training history is still yours.</p>
            <p className="text-caption text-muted-foreground">
              You can still read it, and you can delete your account whenever you want — you don't have to
              wait for this studio to be removed.
            </p>
            {/* Reachable while blocked on purpose: `/api/me/*` is exempt from the
                read-only gate precisely so leaving is never barred. */}
            <Button variant="outline" className="w-full" onClick={() => nav("/profile")}>
              Your account and data <ArrowRight />
            </Button>
          </Card>
        )}
      </Stagger>
    </Page>
  );
}
