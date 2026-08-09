/**
 * THE INBOX — `@4dl/app-kit`'s bell and screen, bound to this app's types.
 *
 * ⚠️ **Mount this.** `@4dl/notify` was wired end to end in one app for three
 * stages — schema, `InboxDO`, the registry, sixteen dispatch sites — with no
 * surface, so every notification the product produced was reachable at
 * `GET /api/notifications` and nowhere a person would look.
 *
 * The kit owns the bell, the dropdown, the day-grouped list, the live socket
 * with its poll backstop, the optimistic mark-read that ROLLS BACK, and the
 * three distinct empty states (`loading` / `failed` / genuinely empty — which is
 * why the bell cannot say "you're all caught up" over a failed fetch).
 *
 * This app's half is the one thing a shared package cannot know: what each
 * notification TYPE means here, and where a click goes.
 *
 * There is no `surface` filter. That prop is for an app whose users hold two
 * personas at once and read a different bell in each; add it only when that is
 * true, because a filter over one surface hides nothing and looks like it might.
 */

import { useNavigate } from "react-router-dom";
import { AlertTriangle, Bell, CreditCard, Users, Wallet, type LucideIcon, type Tone } from "@4dl/ui";
// The product's own noun, from lucide directly — see `Shell.tsx`.
import { FileText } from "lucide-react";
import { InboxScreen, NotificationBell as KitBell } from "@4dl/app-kit";
import { useOnline } from "./session.js";

/**
 * Icon + tone per type — the keys must match `notifications.ts` in the worker.
 *
 * ⚠️ **Spend `danger` sparingly.** If everything urgent is red, the one
 * notification that genuinely means "act now" looks like all the others. Pick
 * the one or two things in the product that are actually an emergency, and make
 * everything else `warning` or `neutral`.
 *
 * `notifications.conformance.test.ts` checks this map against the server
 * registry in BOTH directions — a type with no coding renders as an anonymous
 * bell, and a coding with no type is dead configuration that reads as coverage.
 * Neither throws, which is why it is a test.
 */
const CODING: Record<string, { icon: LucideIcon; tone: Tone }> = {
  // ── people ───────────────────────────────────────────────────────────────
  staff_joined: { icon: Users, tone: "primary" },
  staff_role_changed: { icon: Users, tone: "neutral" },
  // ── money ────────────────────────────────────────────────────────────────
  billing_past_due: { icon: CreditCard, tone: "warning" },
  billing_suspended: { icon: CreditCard, tone: "danger" },
  billing_deleted: { icon: AlertTriangle, tone: "danger" },
  credits_low: { icon: Wallet, tone: "warning" },
  // ── the product's own ────────────────────────────────────────────────────
  record_created: { icon: FileText, tone: "primary" },
  record_shared: { icon: FileText, tone: "success" },
};

/** An unknown type is still a notification — say that, rather than decorate it.
 *  A registry entry added server-side reaches the bell with no client release. */
const DEFAULT = { icon: Bell, tone: "primary" as Tone };

const coding = (type: string) => CODING[type] ?? DEFAULT;

export function NotificationBell() {
  const online = useOnline();
  const nav = useNavigate();
  return (
    <KitBell
      online={online}
      coding={coding}
      onOpen={(n) => {
        // The registry supplies the link, so a type added server-side navigates
        // correctly with no entry here. No link is a legitimate answer for a
        // notification that is purely informational.
        if (n.link) nav(n.link);
      }}
      onSeeAll={() => nav("/inbox")}
    />
  );
}

export function InboxPage() {
  const online = useOnline();
  const nav = useNavigate();
  return (
    <InboxScreen
      online={online}
      coding={coding}
      onBack={() => history.back()}
      onOpen={(n) => {
        if (n.link) nav(n.link);
      }}
    />
  );
}
