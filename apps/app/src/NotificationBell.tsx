/**
 * Kova's binding of the shared bell.
 *
 * The dropdown, the badge, the optimistic mark-read and the three empty states
 * are `@4dl/app-kit`'s. What is Kova's is the four things that read the
 * registry: which SURFACE you are looking at (a client sees client
 * notifications; a coach in train mode does too), the per-type icon and tone,
 * and what a click-through means here — which is not "navigate", because a
 * notification from another studio has to switch tenant and flip the persona
 * mode first.
 */

import { useNavigate } from "react-router-dom";
import { notifVisibleInSurface, type NotifSurface } from "@kova/domain";
import { NotificationBell as Bell, type InboxNotification } from "@4dl/app-kit";
import { useSession } from "./session.js";
import { notifCoding } from "./notif-ui.js";

/** The surface you're currently in, which decides what the bell shows. */
export function useNotifSurface(): NotifSurface {
  const { ctx, mode } = useSession();
  return ctx?.active?.role === "client" || mode === "train" ? "client" : "staff";
}

/**
 * Opening a Kova notification: land in the right studio, in the right mode,
 * then navigate. Shared by the bell and the Inbox screen.
 */
export function useOpenNotification() {
  const { ctx, mode, setMode, switchTenant } = useSession();
  const nav = useNavigate();
  const surface = useNotifSurface();
  const activeTenantId = ctx?.active?.tenantId ?? null;

  return async (n: InboxNotification) => {
    // A notification from another studio: switch to it before navigating.
    if (n.tenant_id && n.tenant_id !== activeTenantId) {
      try {
        await switchTenant(n.tenant_id);
      } catch {
        /* stay put */
      }
    }
    // Client-surface links need train mode; staff links need coach mode. Since
    // the list is already surface-filtered this rarely flips, but keep it safe.
    if (mode !== "train" && surface === "client") setMode("train");
    if (n.link) nav(n.link);
  };
}

export function NotificationBell() {
  const { online } = useSession();
  const nav = useNavigate();
  const surface = useNotifSurface();

  return (
    <Bell
      online={online}
      surface={surface}
      visible={(n) => notifVisibleInSurface(n.type, surface)}
      coding={notifCoding}
      onOpen={useOpenNotification()}
      onSeeAll={() => nav("/inbox")}
    />
  );
}
