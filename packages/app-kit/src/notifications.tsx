/**
 * THE INBOX SURFACE — the bell, and the full list behind it.
 *
 * `useInbox` (inbox.ts) has been the shared TRANSPORT since Stage 8, and its own
 * header said the rendering stayed in the app "because it reads a registry".
 * With two apps live that reasoning does not survive contact: what actually
 * reads the registry is four lines — a per-type icon, a per-type tone, which
 * surface a type belongs to, and where a click goes. Everything else is 200
 * lines of dropdown, day-grouping, empty states and optimistic mark-read that no
 * product has an opinion about, and the second app's copy of it was zero lines,
 * because it never got written and the whole capability sat dark.
 *
 * So the registry stays injected and the surface moves:
 *
 * | injected by the app          | here                                    |
 * |------------------------------|-----------------------------------------|
 * | `coding` — icon + tone/type  | the badge, the row, the unread dot      |
 * | `visible` — surface filter   | filtering, the unread count, mark-all   |
 * | `onOpen` — where a click goes| marking read, and the optimistic patch  |
 * | `labels` — the strings       | layout, grouping, the three empty states|
 *
 * ── Why `onOpen` does not navigate ──────────────────────────────────────────
 *
 * This package is router-free, like `@4dl/ui` and `@4dl/admin`, and that is not
 * only a dependency preference: one app's click-through switches TENANT and
 * flips a persona mode before it navigates, which no router API could express.
 * The component marks the row read (optimistically, and on the server) and hands
 * the whole notification back. What happens next is the app's.
 *
 * ── Three empty states, deliberately not one ────────────────────────────────
 *
 * Offline, failed, and genuinely empty look identical if you collapse them, and
 * the collapsed version tells someone with unread messages that they are all
 * caught up. That bug was fixed once in one app's inbox screen; keeping the
 * distinction here is how the fix reaches every app instead of one.
 */

import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Button,
  Card,
  CheckCheck,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  IconBadge,
  Page,
  Reveal,
  Skeleton,
  SkeletonLine,
  SkeletonList,
  Stagger,
  type LucideIcon,
  type Tone,
} from "@4dl/ui";
import { api } from "./api.js";
import { useInbox } from "./inbox.js";

/** A notification row as the shared `/api/notifications` route returns it. */
export interface InboxNotification {
  id: string;
  type: string;
  tenant_id: string | null;
  title: string;
  message: string | null;
  link: string | null;
  read: number;
  created_at: string;
}

/** How a type is drawn. Unknown types are the app's problem to default. */
export interface NotifCoding {
  icon: LucideIcon;
  tone: Tone;
}

/**
 * Every string these components render. Defaulted in English so an app that has
 * not thought about copy still ships something sensible, and fully overridable
 * so one that runs `@4dl/i18n` can hand over translated text — this package has
 * no dictionary of its own and should not grow one.
 */
export interface NotifLabels {
  title: string;
  markAll: string;
  seeAll: string;
  back: string;
  /** Nothing to show, and that is the truth. */
  empty: string;
  emptyHint: string;
  /** Nothing to show because the radio is off. */
  offline: string;
  /** Nothing to show because the read failed — NOT the same as empty. */
  failed: string;
  errorTitle: string;
  errorBody: string;
  retry: string;
  today: string;
  yesterday: string;
}

const DEFAULT_LABELS: NotifLabels = {
  title: "Notifications",
  markAll: "Mark all read",
  seeAll: "See all",
  back: "Back",
  empty: "You're all caught up.",
  emptyHint: "New notifications for this view will show up here.",
  offline: "You're offline — notifications will update when you reconnect.",
  failed: "Couldn't load notifications. We'll keep trying.",
  errorTitle: "Couldn't load notifications",
  errorBody: "Something went wrong fetching your inbox. Check your connection and try again.",
  retry: "Try again",
  today: "Today",
  yesterday: "Yesterday",
};

/** What both surfaces need from the app. */
interface NotifShared {
  /** Live connectivity — tears the socket and the poll down when false. */
  online: boolean;
  /** Icon + tone per type. */
  coding: (type: string) => NotifCoding;
  /**
   * Which loaded notifications belong to the surface being shown. Omitted means
   * all of them, which is correct for an app whose users hold one role.
   */
  visible?: (n: InboxNotification) => boolean;
  /**
   * Passed to `read-all` so clearing a per-surface bell clears only what is on
   * screen. Omitted clears everything, matching an omitted `visible`.
   */
  surface?: string;
  /** Marked read already; do whatever opening it means. */
  onOpen: (n: InboxNotification) => void | Promise<void>;
  labels?: Partial<NotifLabels>;
}

/**
 * The list, the counts and the two writes. Shared by the bell and the screen so
 * the optimistic patch and the surface scoping cannot drift apart between them.
 */
function useFeed({ online, visible, surface }: Pick<NotifShared, "online" | "visible" | "surface">) {
  const { items, failed, loading, patch } = useInbox<InboxNotification>({ online });
  const inSurface = (n: InboxNotification) => (visible ? visible(n) : true);
  const shown = items.filter(inSurface);
  const unread = shown.reduce((sum, n) => sum + (n.read ? 0 : 1), 0);

  const markRead = async (id: string) => {
    // Optimistic, and best-effort on the wire: a failed mark-read is a badge
    // that comes back on the next poll, not something worth interrupting for.
    patch((p) => p.map((n) => (n.id === id ? { ...n, read: 1 } : n)));
    await api.post(`/api/notifications/${id}/read`).catch(() => undefined);
  };
  const markAll = async () => {
    patch((p) => p.map((n) => (inSurface(n) ? { ...n, read: 1 } : n)));
    await api.post("/api/notifications/read-all", surface ? { surface } : {}).catch(() => undefined);
  };

  return { shown, unread, failed, loading, markRead, markAll };
}

export interface NotificationBellProps extends NotifShared {
  /** Render the footer link. Omitted means the app has no inbox screen. */
  onSeeAll?: () => void;
}

/** Surface-aware unread badge + dropdown. */
export function NotificationBell({ coding, onOpen, onSeeAll, labels, ...feedOpts }: NotificationBellProps) {
  const l = { ...DEFAULT_LABELS, ...labels };
  // `loading` was computed by `useFeed` and thrown away here, so an open
  // dropdown said "You're all caught up" — a definite answer — while the fetch
  // was still in flight. The inbox SCREEN used it; the bell, which is how
  // almost everyone reads a notification, did not.
  const { shown, unread, failed, loading, markRead, markAll } = useFeed(feedOpts);

  const open = (n: InboxNotification) => {
    void markRead(n.id);
    void onOpen(n);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label={l.title}
        >
          <Bell className="size-[1.15rem]" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-[28rem] w-80 overflow-y-auto">
        <div className="flex items-center justify-between pr-1">
          <DropdownMenuLabel>{l.title}</DropdownMenuLabel>
          {unread > 0 && (
            <button onClick={() => void markAll()} className="text-xs font-medium text-primary hover:underline">
              {l.markAll}
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {loading && shown.length === 0 ? (
          // Three rows of the real geometry — a badge, two lines — so arrival is
          // a fill rather than a re-layout (UI-LANGUAGE §7).
          <div className="space-y-1 p-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-start gap-2.5 rounded-xl px-3 py-2.5">
                <Skeleton className="size-8 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-1.5"><SkeletonLine w="70%" h="text" /><SkeletonLine w="45%" h="xs" /></div>
              </div>
            ))}
          </div>
        ) : !feedOpts.online && shown.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">{l.offline}</div>
        ) : failed && shown.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-warning">{l.failed}</div>
        ) : shown.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">{l.empty}</div>
        ) : (
          shown.slice(0, 20).map((n) => {
            const { icon, tone } = coding(n.type);
            return (
              <button
                key={n.id}
                onClick={() => open(n)}
                className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-secondary"
              >
                {/* The badge keeps its tone when read — see the inbox screen. */}
                <IconBadge icon={icon} tone={tone} size="sm" />
                <div className={`min-w-0 flex-1 ${n.read ? "opacity-65" : ""}`}>
                  <div className="truncate text-sm font-medium">{n.title}</div>
                  {n.message && <div className="truncate text-xs text-muted-foreground">{n.message}</div>}
                  <div className="mt-0.5 text-xs text-muted-foreground">{relativeTime(n.created_at)}</div>
                </div>
                {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
              </button>
            );
          })
        )}
        {shown.length > 0 && onSeeAll && (
          <>
            <DropdownMenuSeparator />
            <button
              onClick={onSeeAll}
              className="w-full rounded-xl px-3 py-2 text-center text-sm font-medium text-primary hover:bg-secondary"
            >
              {l.seeAll}
            </button>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * "just now" / "4h" / "3d" — how long ago, for a dropdown row.
 *
 * The bell showed `toLocaleString()`: a full date AND time on every row, which
 * is the least scannable form of the only thing anyone reads a notification
 * timestamp for. Past a week it falls back to a date, because "23d" stops being
 * a unit anyone converts.
 */
function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const secs = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "Today" / "Yesterday" / a localized date, for day grouping. */
function dayLabel(iso: string, l: NotifLabels): string {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (days <= 0) return l.today;
  if (days === 1) return l.yesterday;
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export interface InboxScreenProps extends NotifShared {
  onBack: () => void;
}

/** The full, grouped-by-day list behind the bell's "See all". */
export function InboxScreen({ coding, onOpen, onBack, labels, ...feedOpts }: InboxScreenProps) {
  const l = { ...DEFAULT_LABELS, ...labels };
  const { shown, unread, failed, loading, markRead, markAll } = useFeed(feedOpts);
  // The screen's own retry: `useInbox` polls, but somebody looking at an error
  // should not have to wait out a 90-second interval to find out it recovered.
  const [retryKey, setRetryKey] = useState(0);

  // Group consecutive items by day (already sorted newest-first by the API).
  const groups: { label: string; items: InboxNotification[] }[] = [];
  for (const n of shown) {
    const label = dayLabel(n.created_at, l);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(n);
    else groups.push({ label, items: [n] });
  }

  const open = (n: InboxNotification) => {
    void markRead(n.id);
    void onOpen(n);
  };

  return (
    <Page className="column space-y-4 p-4 pb-28" key={retryKey}>
      <div className="flex items-center gap-3">
        <Button size="icon" variant="secondary" onClick={onBack} aria-label={l.back}>
          <ArrowLeft />
        </Button>
        <h1 className="flex-1 text-title-3">{l.title}</h1>
        {unread > 0 && (
          <Button size="sm" variant="ghost" onClick={() => void markAll()}>
            <CheckCheck /> {l.markAll}
          </Button>
        )}
      </div>

      {failed && shown.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title={l.errorTitle}
          description={l.errorBody}
          action={<Button onClick={() => setRetryKey((k) => k + 1)}>{l.retry}</Button>}
        />
      ) : (
        <Reveal loading={loading} className="space-y-5" skeleton={<SkeletonList card rows={6} thumb={36} />}>
          {!loading &&
            (shown.length === 0 ? (
              <EmptyState icon={Bell} title={l.empty} description={l.emptyHint} />
            ) : (
              groups.map((g) => (
                <div key={g.label} className="space-y-2">
                  <div className="px-1 text-micro uppercase text-muted-foreground">{g.label}</div>
                  <Stagger className="space-y-2">
                    {g.items.map((n) => (
                      // A notification with no destination is not tappable. It
                      // still marked itself read on click and then sat there,
                      // which reads as the app ignoring you.
                      <Card
                        key={n.id}
                        onClick={n.link ? () => open(n) : undefined}
                        role={n.link ? "button" : undefined}
                        tabIndex={n.link ? 0 : undefined}
                        onKeyDown={
                          n.link
                            ? (e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  open(n);
                                }
                              }
                            : undefined
                        }
                        /*
                          READ DIMS THE WORDS, NOT THE BADGE.

                          `opacity-60` on the whole card faded the IconBadge too
                          — and the badge's tone is what makes this feed
                          scannable by category (§4: colour is navigation). Most
                          rows in a healthy inbox are read, so the wash was
                          applied to the majority of them, which is precisely
                          where the colour coding needed to survive. A faded
                          tone also reads as disabled rather than as seen.
                        */
                        className={`flex items-start gap-3 transition-colors ${n.link ? "cursor-pointer hover:bg-secondary" : ""}`}
                      >
                        <IconBadge icon={coding(n.type).icon} tone={coding(n.type).tone} size="sm" />
                        <div className={`min-w-0 flex-1 ${n.read ? "opacity-65" : ""}`}>
                          <div className="font-medium">{n.title}</div>
                          {n.message && <div className="mt-0.5 text-sm text-muted-foreground">{n.message}</div>}
                          <div className="mt-1 text-xs text-muted-foreground">
                            {new Date(n.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                          </div>
                        </div>
                        {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
                      </Card>
                    ))}
                  </Stagger>
                </div>
              ))
            ))}
        </Reveal>
      )}
    </Page>
  );
}
