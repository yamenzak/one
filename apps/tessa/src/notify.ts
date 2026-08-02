/**
 * Tessa's binding of the shared delivery path.
 *
 * `@4dl/notify`'s `dispatchNotification` resolves the recipient's role, their
 * per-category channel preferences and the owner's email veto, writes the inbox
 * row and pokes their socket. Everything below is the EMAIL half, which the
 * package leaves to the app because it is a fact about how an app bills rather
 * than a fact about notifications.
 *
 * Tessa's answer is deliberately simpler than Kova's: there is no tenant
 * white-label template store and no per-type override, because a Tessa
 * notification is never a message from the CENTRE to somebody else — it is the
 * platform telling the people who run the centre that a load failed. So every
 * email goes out on the PLATFORM rail, under Tessa's identity, unmetered. A
 * recall notice that consumed a centre's AI credits would be absurd.
 *
 * Importing this module also installs the registry (`./notifications.js`), which
 * is why `index.ts` imports it rather than the registry directly.
 */

import { dispatchNotification, dispatchToRole, type ResolvedNotification } from "@4dl/notify";
import { notifCategoryOf, type NotifCategory, type NotifRole } from "@4dl/notify/model";
import { NOTIF_CATEGORIES } from "./notifications.js";
import { notifyUser } from "./inbox-do.js";
import { APP_BRAND, emailButton, emailShell, escapeHtml, sendEmail } from "./mailer.js";
import type { Env } from "./env.js";

export interface NotifyInput {
  tenantId: string;
  userId: string | null | undefined;
  /** The SSOT key — its category derives from the registry, never passed. */
  type: string;
  /** Overrides the registry title. Required for types that name a load or machine. */
  title?: string;
  message?: string | null;
  link?: string | null;
  /** Stable id part → `INSERT OR IGNORE` dedupe across retries and the sweep. */
  dedupeKey?: string;
  /** Skip preferences. A recall is not something anybody opts out of. */
  force?: boolean;
}

/**
 * A member's role in the centre. Anything unrecognised falls back to `auditor` —
 * the least-privileged role, and the same fallback `access.ts` uses. Defaulting
 * a stranger UP would send them a category their role is not shown.
 */
async function memberRole(db: D1Database, tenantId: string, userId: string): Promise<NotifRole> {
  const row = await db
    .prepare("SELECT role FROM member WHERE organizationId = ? AND userId = ? LIMIT 1")
    .bind(tenantId, userId)
    .first<{ role: string }>();
  const r = row?.role;
  return r === "owner" || r === "stockKeeper" || r === "cssd" || r === "clinical" ? r : "auditor";
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
  const inner = `${n.message ? `<p style="margin:0">${escapeHtml(n.message)}</p>` : ""}${href ? emailButton(`Open ${APP_BRAND.name}`, href, APP_BRAND) : ""}`;
  const html = emailShell(escapeHtml(n.title), inner, {
    brand: APP_BRAND,
    preheader: n.message ?? n.title,
    eyebrow: categoryEyebrow(n.category),
    manageUrl: base ? `${base}/settings/notifications` : undefined,
  });
  await sendEmail(
    env.DB,
    { to: user.email, subject: n.title, html, text: n.message ?? n.title },
    env.EMAIL,
    undefined,
    env.ENVIRONMENT === "development",
  ).catch(() => undefined);
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

/** Fan out to every holder of a role in a centre. */
export async function notifyRole(env: Env, tenantId: string, role: NotifRole, input: Omit<NotifyInput, "tenantId" | "userId">): Promise<void> {
  await dispatchToRole(deps(env), tenantId, role, input);
}

/**
 * Fan out to everyone a type's CATEGORY is shown to — the addressing a CSSD
 * actually wants. A failed load is not one person's problem: it concerns whoever
 * runs the machine and whoever answers for the centre, and naming those roles at
 * each call site is how one of them gets forgotten.
 *
 * Each recipient still passes through the full channel resolution, so somebody
 * who has muted a category's email keeps their inbox row and loses the mail.
 */
export async function notifyCategoryAudience(env: Env, tenantId: string, input: Omit<NotifyInput, "tenantId" | "userId">): Promise<void> {
  const category = notifCategoryOf(input.type);
  const roles = NOTIF_CATEGORIES.find((c) => c.key === category)?.roles ?? [];
  if (roles.length === 0) return;
  const ph = roles.map(() => "?").join(",");
  const rows = await env.DB
    .prepare(`SELECT DISTINCT userId FROM member WHERE organizationId = ? AND role IN (${ph})`)
    .bind(tenantId, ...roles)
    .all<{ userId: string | null }>()
    .catch(() => ({ results: [] as { userId: string | null }[] }));
  for (const r of rows.results ?? []) {
    if (r.userId) await notify(env, { ...input, tenantId, userId: r.userId });
  }
}
