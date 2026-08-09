/**
 * THE TENANT IS CLOSED FOR NON-PAYMENT — the whole app, replaced by one screen.
 *
 * Rung two of the platform ladder (`@4dl/billing`'s `DUNNING_DAYS`): past due →
 * read-only at 7 days → blocked at 30 → purged at 37. Read-only still serves the
 * whole app and refuses writes; this withholds it.
 *
 * ── Why a screen and not a banner ───────────────────────────────────────────
 *
 * Both other apps' Shells claimed in a comment that `blocked` was "handled
 * before the Shell ever mounts", and in one of them nothing handled it. A tenant
 * thirty days past due therefore got the ordinary application with a small
 * read-only chip in the corner and every write failing one at a time — which
 * reads as "the software is broken", not as "the invoice is unpaid", and is the
 * version somebody repeats to their supplier.
 *
 * ── Two doors stay open, and that is the whole design ───────────────────────
 *
 * A screen that only says "pay" is a trap. `@4dl/tenancy`'s gate exempts
 * `/api/tenant/close` and `/api/me/*` from EVERY rung precisely so that leaving
 * is always possible, and a screen with no exit would make that exemption
 * protect nothing:
 *
 *   pay      the thing that ends it, for whoever can
 *   leave    close or export, for everyone — a tenant's records are its own and
 *            must not be held against an invoice
 *
 * ── What it does NOT do ─────────────────────────────────────────────────────
 *
 * It does not name a deadline. The purge date lives on the subscription row and
 * this screen renders from the host GATE, which carries the rung and not the
 * clock; inventing "7 days left" from a rung would be a number nobody computed.
 * Settings shows the real one.
 */

import { AlertTriangle, ArrowRight, Button, Card, IconBadge, Page, Stagger, TierAnchor } from "@4dl/ui";
import { RefreshNote } from "@4dl/app-kit";
import { useSession } from "../session.js";

export function TenantBlocked() {
  const { host } = useSession();
  const name = host?.tenant?.name ?? "This workspace";

  return (
    <Page className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      {/* No T1 numeral anchor: the subject is a STATE, not a value, and there is
          nothing to count. The icon and the sentence ARE the anchor. */}
      <TierAnchor className="flex flex-col items-center gap-3 text-center">
        <IconBadge icon={AlertTriangle} tone="danger" size="lg" />
        <div className="space-y-1.5">
          <h1 className="text-title-1">{name} is paused</h1>
          <p className="text-body text-muted-foreground">
            The subscription is past due, so the workspace is closed until it is settled.
          </p>
        </div>
      </TierAnchor>

      <Stagger className="space-y-3">
        <Card className="space-y-3">
          <p className="text-caption leading-relaxed text-muted-foreground">
            Nothing has been deleted. Your data is held and comes straight back when the account is current.
          </p>
          {/* A full page load rather than a router navigation: the Shell is not
              mounted, so there is no route table to navigate within. */}
          <Button size="lg" className="w-full" onClick={() => { window.location.href = "/settings"; }}>
            Settle the account
            <ArrowRight aria-hidden />
          </Button>
        </Card>
        {/* The gate is read once, at boot. When the invoice clears, only asking
            again gets back in. */}
        <RefreshNote label="Already settled?" action="Check again" />
      </Stagger>
    </Page>
  );
}
