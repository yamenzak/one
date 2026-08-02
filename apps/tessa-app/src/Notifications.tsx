/**
 * Tessa's binding of the shared inbox.
 *
 * `@4dl/app-kit` owns the bell, the dropdown, the day-grouped list, the
 * optimistic mark-read and the three distinct empty states. What is Tessa's is
 * the two things a shared package cannot know: what each notification TYPE looks
 * like, and — because this app runs in German as well as English — what every
 * string says.
 *
 * There is no `visible` filter and no `surface`. That prop exists for an app
 * whose users hold two personas at once and see a different bell in each;
 * everyone in a sterile-supply department is staff, so every notification
 * belongs to the one surface there is.
 */

import { useNavigate } from "react-router-dom";
import { AlertTriangle, Archive, Bell, CheckCheck, Clock, CreditCard, RotateCcw, Users, type LucideIcon, type Tone } from "@4dl/ui";
import { InboxScreen, NotificationBell as KitBell, type NotifLabels } from "@4dl/app-kit";
import { useOnline } from "./session.js";
import { useT } from "./i18n.js";

/**
 * Icon + tone per type. A recall and a failed load are the only two things in
 * this app that are `danger`, and that restraint is the point: if a low stock
 * level were also red, the one notification that means "instruments may be in a
 * patient" would look like all the others.
 */
const CODING: Record<string, { icon: LucideIcon; tone: Tone }> = {
  cycle_failed: { icon: AlertTriangle, tone: "danger" },
  recall_issued: { icon: AlertTriangle, tone: "danger" },
  release_pending: { icon: Clock, tone: "warning" },
  load_released: { icon: CheckCheck, tone: "success" },
  stock_low: { icon: Archive, tone: "warning" },
  stock_expiring: { icon: RotateCcw, tone: "warning" },
  staff_joined: { icon: Users, tone: "primary" },
  staff_role_changed: { icon: Users, tone: "neutral" },
  billing_past_due: { icon: CreditCard, tone: "warning" },
  billing_suspended: { icon: CreditCard, tone: "danger" },
  billing_canceled: { icon: AlertTriangle, tone: "danger" },
  billing_trial_ending: { icon: CreditCard, tone: "warning" },
};

/** An unknown type is still a notification — say that, rather than decorate it. */
const DEFAULT = { icon: Bell, tone: "primary" as Tone };

const coding = (type: string) => CODING[type] ?? DEFAULT;

/** The kit's strings, translated. */
function useLabels(): NotifLabels {
  const t = useT();
  return {
    title: t("notif.title"),
    markAll: t("notif.markAll"),
    seeAll: t("notif.seeAll"),
    back: t("common.back"),
    empty: t("notif.empty"),
    emptyHint: t("notif.emptyHint"),
    offline: t("notif.offline"),
    failed: t("notif.failed"),
    errorTitle: t("notif.errorTitle"),
    errorBody: t("notif.errorBody"),
    retry: t("notif.retry"),
    today: t("notif.today"),
    yesterday: t("notif.yesterday"),
  };
}

export function NotificationBell() {
  const online = useOnline();
  const nav = useNavigate();
  return (
    <KitBell
      online={online}
      coding={coding}
      labels={useLabels()}
      onOpen={(n) => {
        if (n.link) nav(n.link);
      }}
      onSeeAll={() => nav("/inbox")}
    />
  );
}

export function Inbox() {
  const online = useOnline();
  const nav = useNavigate();
  return (
    <InboxScreen
      online={online}
      coding={coding}
      labels={useLabels()}
      onBack={() => history.back()}
      onOpen={(n) => {
        if (n.link) nav(n.link);
      }}
    />
  );
}
