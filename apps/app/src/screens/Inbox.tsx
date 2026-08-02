/** Notifications inbox — the full, grouped-by-day list behind the bell's
 *  "See all". The list is `@4dl/app-kit`'s; the surface filter, the visual
 *  coding and the click-through are Kova's, and they are the same four the bell
 *  injects, from the same two hooks, so the two surfaces cannot disagree. */

import { notifVisibleInSurface } from "@kova/domain";
import { InboxScreen } from "@4dl/app-kit";
import { useSession } from "../session.js";
import { notifCoding } from "../notif-ui.js";
import { useNotifSurface, useOpenNotification } from "../NotificationBell.js";

export function Inbox({ onBack }: { onBack: () => void }) {
  const { online } = useSession();
  const surface = useNotifSurface();

  return (
    <InboxScreen
      onBack={onBack}
      online={online}
      surface={surface}
      visible={(n) => notifVisibleInSurface(n.type, surface)}
      coding={notifCoding}
      onOpen={useOpenNotification()}
    />
  );
}
