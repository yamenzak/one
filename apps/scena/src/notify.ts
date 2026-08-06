/**
 * Scena's binding of the shared delivery path.
 *
 * `@4dl/notify`'s `dispatchNotification` resolves the recipient's role, their
 * per-category channel preferences and the owner's email veto, writes the inbox
 * row and pokes their socket. Everything here is the EMAIL half plus the role
 * lookup, which the package leaves to the app.
 *
 * Every email goes out on the PLATFORM rail under Scena's identity, unmetered.
 * A Scena notification is never a message from the WORKSPACE to somebody else —
 * it is the platform telling the people who run the screens that one went dark —
 * so there is no tenant white-label template store and nothing to charge for.
 *
 * Importing this module also installs the registry (`./notifications.js`), which
 * is why `index.ts` imports it rather than the registry directly.
 */

import { dispatchNotification, dispatchToRole, type ResolvedNotification } from "@4dl/notify";
import { notifCategoryOf, type NotifCategory, type NotifRole } from "@4dl/notify/model";
import { NOTIF_CATEGORIES } from "./notifications.js";
import { notifyUser } from "./inbox-do.js";
import { emailButton, emailShell, escapeHtml, sendEmail } from "./mailer.js";
import type { Env } from "./env.js";

export interface NotifyInput {
  tenantId: string;
  userId: string | null | undefined;
  /** The registry key — its category derives from the registry, never passed. */
  type: string;
  /** Overrides the registry title. Required for types that name a screen. */
  title?: string;
  message?: string | null;
  link?: string | null;
  /** Stable id part → `INSERT OR IGNORE` dedupe across retries and the sweep. */
  dedupeKey?: string;
  /** Skip preferences. Reserved for the emergency takeover — see notifications.ts. */
  force?: boolean;
}

/**
 * A member's role in the workspace.
 *
 * Anything unrecognised falls back to `viewer` — the least-privileged staff
 * role, and the same fallback `access.ts` uses. Defaulting a stranger UP would
 * send them a category their role is not shown. A BOARD role lands here too and
 * resolves to `viewer`, which no category names, so a station tablet receives
 * nothing: correct, and the reason the fallback must be a real role rather than
 * an owner-ish default.
 */
async function memberRole(db: D1Database, tenantId: string, userId: string): Promise<NotifRole> {
  const row = await db
    .prepare('SELECT role FROM "member" WHERE organizationId = ? AND userId = ? LIMIT 1')
    .bind(tenantId, userId)
    .first<{ role: string }>();
  const r = row?.role;
  return r === "owner" || r === "operator" || r === "receptionist" ? r : "viewer";
}

/** The eyebrow above the headline, so a reader knows what kind of message it is. */
function categoryEyebrow(category: NotifCategory): string | undefined {
  return NOTIF_CATEGORIES.find((c) => c.key === category)?.label;
}

async function sendNotifEmail(env: Env, n: ResolvedNotification<NotifyInput>): Promise<void> {
  const user = await env.DB.prepare('SELECT email FROM "user" WHERE id = ?').bind(n.userId).first<{ email: string | null }>();
  if (!user?.email) return;
  const base = env.BETTER_AUTH_URL?.replace(/\/$/, "") ?? "";
  const href = n.link && base ? `${base}${n.link.startsWith("/") ? "" : "/"}${n.link}` : null;
  const inner = `${n.message ? `<p style="margin:0">${escapeHtml(n.message)}</p>` : ""}${href ? emailButton("Open Scena", href) : ""}`;
  const html = emailShell(escapeHtml(n.title), inner, {
    preheader: n.message ?? n.title,
    eyebrow: categoryEyebrow(n.category),
    manageUrl: base ? `${base}/settings` : undefined,
  });
  await sendEmail(env, { to: user.email, subject: n.title, html, text: n.message ?? n.title }).catch(() => undefined);
}

function deps(env: Env) {
  return {
    db: env.DB,
    poke: (userId: string) => notifyUser(env, userId),
    roleOf: memberRole,
    sendEmail: (n: ResolvedNotification<NotifyInput>) => sendNotifEmail(env, n),
  };
}

/** Deliver one notification. Never rejects — see the package header. */
export async function notify(env: Env, input: NotifyInput): Promise<void> {
  await dispatchNotification(deps(env), input);
}

/** Fan out to every holder of a role in a workspace. */
export async function notifyRole(env: Env, tenantId: string, role: NotifRole, input: Omit<NotifyInput, "tenantId" | "userId">): Promise<void> {
  await dispatchToRole(deps(env), tenantId, role, input);
}

/**
 * Fan out to everyone a type's CATEGORY is shown to.
 *
 * The addressing a signage fleet actually wants: a dark screen is not one
 * person's problem, and naming the roles at each call site is how one of them
 * gets forgotten. Each recipient still passes through the full channel
 * resolution, so somebody who muted a category's email keeps their inbox row and
 * loses the mail.
 */
export async function notifyCategoryAudience(env: Env, tenantId: string, input: Omit<NotifyInput, "tenantId" | "userId">): Promise<void> {
  const category = notifCategoryOf(input.type);
  const roles = NOTIF_CATEGORIES.find((c) => c.key === category)?.roles ?? [];
  if (roles.length === 0) return;
  const ph = roles.map(() => "?").join(",");
  const rows = await env.DB
    .prepare(`SELECT DISTINCT userId FROM "member" WHERE organizationId = ? AND role IN (${ph})`)
    .bind(tenantId, ...roles)
    .all<{ userId: string | null }>()
    .catch(() => ({ results: [] as { userId: string | null }[] }));
  for (const r of rows.results ?? []) {
    if (r.userId) await notify(env, { ...input, tenantId, userId: r.userId });
  }
}
