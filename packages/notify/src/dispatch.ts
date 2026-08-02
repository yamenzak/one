/**
 * ONE DELIVERY PATH. Every trigger — a route handler, a webhook, a cron sweep —
 * funnels through here, so preferences, categories and the email veto apply
 * uniformly instead of per call site.
 *
 * ── Where the seam is, and why there ────────────────────────────────────────
 *
 * The INBOX half is the package's: resolve the type's category and copy from the
 * registry, resolve the recipient's channels, write the row, poke their socket.
 * That is the same in every app, and it is the half that makes an inbox work.
 *
 * The EMAIL half is the app's, and deliberately a hook. Kova's runs a tenant
 * white-label template store, a per-type mute, a signature, and a rail choice —
 * its own platform-billing mail goes out unmetered under Kova's identity while
 * everything else is the tenant's own message on the tenant's rail. None of that
 * is a fact about notifications; it is a fact about how Kova bills. An app with
 * no email lane passes no hook and gets a working inbox.
 *
 * ── Best-effort, in full ────────────────────────────────────────────────────
 *
 * Delivery must NEVER reject its caller. A transient failure resolving a
 * preference would otherwise 500 an operation that has already committed — a
 * plan published, a load released — and the caller would report failure for
 * something that succeeded. Everything is swallowed.
 */

import { nowIso } from "@4dl/core";
import {
  audienceForRole,
  emailAllowedByPolicy,
  notifCategoryOf,
  notifLinkOf,
  notifTitleOf,
  parseNotifPolicy,
  parseNotifPrefs,
  resolveChannels,
  type NotifCategory,
  type NotifRole,
  type NotifType,
} from "./model.js";

export interface NotifyInput {
  tenantId: string;
  userId: string | null | undefined;
  /** The SSOT key. Its category — which governs preferences and the owner's
   *  email veto — derives from the registry and is never passed. */
  type: NotifType;
  /** Overrides the registry's title. Required only for types whose title
   *  interpolates a name, which the registry cannot know. */
  title?: string;
  message?: string | null;
  /** Overrides the registry's link. Required only for contextual links. */
  link?: string | null;
  /** Stable id part → `INSERT OR IGNORE` dedupe across retries and sweeps. */
  dedupeKey?: string;
  /** Skip preferences entirely. For the genuinely transactional only. */
  force?: boolean;
  /** Anything the app's email hook needs — template variables, an HTML override. */
  extra?: Record<string, unknown>;
}

/**
 * What the email hook receives: the app's own input, plus everything resolved.
 *
 * Generic over the input so an app that carries extra fields — Kova passes an
 * HTML override and template variables — gets them back with their types intact
 * rather than through an `unknown` bag.
 */
export type ResolvedNotification<I extends NotifyInput = NotifyInput> = I & {
  userId: string;
  category: NotifCategory;
  title: string;
  link: string | null;
  role: NotifRole;
};

export interface DispatchDeps<I extends NotifyInput = NotifyInput> {
  db: D1Database;
  /** Wake the recipient's inbox socket. The payload is "refetch", never content. */
  poke: (userId: string) => Promise<void>;
  /** The recipient's role in this tenant. Channel resolution re-checks it. */
  roleOf: (db: D1Database, tenantId: string, userId: string) => Promise<NotifRole>;
  /**
   * Send the email half. Absent means inbox-only, which is a complete and
   * correct configuration — not a degraded one.
   */
  sendEmail?: (n: ResolvedNotification<I>) => Promise<void>;
}

export async function dispatchNotification<I extends NotifyInput>(deps: DispatchDeps<I>, input: I): Promise<void> {
  if (!input.userId) return;
  const userId = input.userId;
  const category = notifCategoryOf(input.type);
  // Title and link derive from the registry unless the call site overrides.
  // Title always resolves to something (registry → the type id) so a row is
  // never blank — a notification with no headline is an unreadable row, and the
  // type id at least says what happened.
  const title = input.title ?? notifTitleOf(input.type) ?? input.type;
  const link = input.link ?? notifLinkOf(input.type);

  try {
    let channels = { inbox: true, email: false };
    let role: NotifRole = "";

    if (input.force) {
      channels = { inbox: true, email: true };
      role = await deps.roleOf(deps.db, input.tenantId, userId).catch(() => "");
    } else {
      const [r, prefRow, polRow] = await Promise.all([
        deps.roleOf(deps.db, input.tenantId, userId),
        deps.db.prepare("SELECT notif_json FROM user_prefs WHERE user_id = ?").bind(userId).first<{ notif_json: string | null }>(),
        deps.db.prepare("SELECT notif_policy_json FROM tenant_settings WHERE tenant_id = ?").bind(input.tenantId).first<{ notif_policy_json: string | null }>(),
      ]);
      role = r;
      channels = resolveChannels(role, parseNotifPrefs(prefRow?.notif_json ?? null), category);
      // The owner may veto email for a category, per AUDIENCE. The member's
      // INBOX choice is never overridden — only their email channel.
      if (channels.email && !emailAllowedByPolicy(parseNotifPolicy(polRow?.notif_policy_json ?? null), category, audienceForRole(role))) {
        channels.email = false;
      }
    }

    if (channels.inbox) {
      const id = input.dedupeKey ? `ntf_${input.dedupeKey}_${userId}` : `ntf_${crypto.randomUUID()}`;
      await deps.db
        .prepare(
          "INSERT OR IGNORE INTO notifications (id, tenant_id, recipient_user_id, category, type, title, message, link, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(id, input.tenantId, userId, category, input.type, title, input.message ?? null, link ?? null, nowIso())
        .run()
        .catch(() => undefined);
      await deps.poke(userId);
    }

    if (channels.email && deps.sendEmail) {
      await deps.sendEmail({ ...input, userId, category, title, link, role } as ResolvedNotification<I>).catch(() => undefined);
    }
  } catch {
    /* best-effort in full — see the header */
  }
}

/**
 * Fan a notification out to every holder of a role in a tenant.
 *
 * Kova's `notifyOwners` generalised: billing, sales and roster events are
 * addressed to whoever runs the tenant, and that role's name is the app's.
 */
export async function dispatchToRole<I extends NotifyInput>(
  deps: DispatchDeps<I>,
  tenantId: string,
  role: NotifRole,
  input: Omit<I, "tenantId" | "userId">,
): Promise<void> {
  const rows = await deps.db
    .prepare("SELECT userId FROM member WHERE organizationId = ? AND role = ?")
    .bind(tenantId, role)
    .all<{ userId: string | null }>()
    .catch(() => ({ results: [] as { userId: string | null }[] }));
  for (const r of rows.results ?? []) {
    if (r.userId) await dispatchNotification(deps, { ...input, tenantId, userId: r.userId } as I);
  }
}
