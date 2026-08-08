/**
 * Scena's binding of the shared inbox.
 *
 * ── The oldest open gap in this app, and what it actually was ───────────────
 *
 * `@4dl/notify` has been wired end to end here for three stages: the schema,
 * `InboxDO` (migration `v5`, class name permanent), the four routes, the
 * registry in `notifications.ts`, and thirteen real dispatch sites — screen
 * alerts, the dunning ladder, the emergency takeover, a refunded payment. What
 * was missing was the SURFACE. A Scena notification was reachable at
 * `GET /api/notifications` and nowhere a person would look, so thirteen kinds of
 * message were written to a table nobody read.
 *
 * The note in CLAUDE.md said this would "land with the Stage 7 UI rewrite".
 * Stage 7 shipped and it did not, and the sentence then became a reason not to
 * look — which is the shape of every finding in `docs/PLATFORM-AUDIT.md`.
 *
 * ── What is the kit's, and what is Scena's ─────────────────────────────────
 *
 * `@4dl/app-kit` owns the bell, the dropdown, the day-grouped list, the live
 * socket with its poll backstop, the optimistic mark-read that ROLLS BACK, and
 * the three distinct empty states (`loading` / `failed` / genuinely empty —
 * which is why the bell cannot say "you're all caught up" over a failed fetch).
 *
 * Scena's half is the one thing a shared package cannot know: what each
 * notification TYPE means here, and where a click goes.
 *
 * There is no `surface` filter. That prop is for an app whose users hold two
 * personas at once and read a different bell in each; everybody signed in to a
 * Scena workspace is staff, so there is one surface.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Bell, CreditCard, Users, Wallet, type LucideIcon, type Tone } from "@4dl/ui";
// Signage vocabulary, from lucide directly: a screen, a siren and a spark are
// Scena's nouns, and `@4dl/ui`'s icon set is curated to what the PLATFORM needs.
// Same source, same component type — this is the pattern `Shell.tsx` and
// `AdminDoor.tsx` already follow.
import { MonitorSpeaker, RotateCcw, Siren, Sparkles } from "lucide-react";
import { InboxScreen, NotificationBell as KitBell } from "@4dl/app-kit";

/**
 * Icon + tone per type.
 *
 * ⚠️ `danger` is spent sparingly and on purpose. An emergency takeover and a
 * workspace whose data is about to be deleted are the only two things here that
 * are genuinely red; if a screen going offline were also red, the one
 * notification that means "every display in the building is showing an alert"
 * would look like all the others. A screen dropping off a venue's wifi is a
 * `warning` because that is what it is — usually temporary, and it recovers.
 */
const CODING: Record<string, { icon: LucideIcon; tone: Tone }> = {
  // ── screens ──────────────────────────────────────────────────────────────
  screen_offline: { icon: MonitorSpeaker, tone: "warning" },
  screen_recovered: { icon: MonitorSpeaker, tone: "success" },
  // ── content ──────────────────────────────────────────────────────────────
  channel_published: { icon: Sparkles, tone: "success" },
  channel_rolled_back: { icon: RotateCcw, tone: "warning" },
  feed_stalled: { icon: AlertTriangle, tone: "warning" },
  // ── the siren ────────────────────────────────────────────────────────────
  emergency_active: { icon: Siren, tone: "danger" },
  emergency_cleared: { icon: Siren, tone: "success" },
  // ── people ───────────────────────────────────────────────────────────────
  staff_joined: { icon: Users, tone: "primary" },
  staff_role_changed: { icon: Users, tone: "neutral" },
  // ── money ────────────────────────────────────────────────────────────────
  billing_past_due: { icon: CreditCard, tone: "warning" },
  billing_suspended: { icon: CreditCard, tone: "danger" },
  billing_deleted: { icon: AlertTriangle, tone: "danger" },
  credits_purchased: { icon: Wallet, tone: "success" },
  credits_low: { icon: Wallet, tone: "warning" },
  payment_refunded: { icon: Wallet, tone: "warning" },
  payment_disputed: { icon: AlertTriangle, tone: "danger" },
};


/** An unknown type is still a notification — say that, rather than decorate it.
 *  A registry entry added server-side reaches the bell with no client release. */
const DEFAULT = { icon: Bell, tone: "primary" as Tone };

const coding = (type: string) => CODING[type] ?? DEFAULT;

/**
 * Live connectivity, which the kit needs and this app had no source for.
 *
 * `online: false` tears down the socket and the poll. Without it an offline tab
 * grinds a backoff-reconnect and a 90-second poll against a dead radio for the
 * whole session — which matters here more than in the other apps, because a
 * dashboard left open on a venue's wifi is the normal case rather than the edge.
 */
function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

export function NotificationBell() {
  const online = useOnline();
  const nav = useNavigate();
  return (
    <KitBell
      online={online}
      coding={coding}
      onOpen={(n) => {
        // The registry supplies the link, so a type added server-side navigates
        // correctly without an entry here. No link is a legitimate answer for a
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
