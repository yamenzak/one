/**
 * The one delivery path for app notifications. Resolves the recipient's
 * per-category channel preferences, then writes the inbox row (+ real-time push)
 * and/or sends a branded email through the tenant's provider. Every trigger — route
 * handlers, webhooks, cron — funnels through here so preferences, categories and
 * the email channel apply uniformly. `force` bypasses preferences for the truly
 * transactional (invites, receipts).
 */

import { resolveChannels, parseNotifPrefs, type NotifCategory, type NotifRole } from "@mossa/domain";
import type { Env } from "./env.js";
import { notifyUser } from "./inbox-do.js";
import { sendTenantEmail } from "./email-provider.js";
import { emailShell, emailButton, escapeHtml, safeColor, MOSSA_BRAND, type BrandKit } from "./mailer.js";
import { nowIso } from "./ids.js";

export interface NotifyInput {
  tenantId: string;
  userId: string | null | undefined;
  category: NotifCategory;
  type: string;
  title: string;
  message?: string | null;
  link?: string | null;
  /** Stable id part → INSERT OR IGNORE dedupe across retries/sweeps. */
  dedupeKey?: string;
  /** Skip preferences entirely (transactional). */
  force?: boolean;
  /** Full email HTML override; otherwise a standard card is built from title/message. */
  emailHtml?: string;
}

async function userRole(db: D1Database, tenantId: string, userId: string): Promise<NotifRole> {
  const row = await db.prepare("SELECT role FROM member WHERE organizationId = ? AND userId = ? LIMIT 1").bind(tenantId, userId).first<{ role: string }>();
  const r = row?.role;
  return r === "owner" || r === "trainer" || r === "assistant" || r === "client" ? r : "member";
}

/** Resolve a tenant's full email brand kit — name + accent + foreground + a
 *  PUBLIC logo (authed /api/media keys can't load in email, so those fall back
 *  to the wordmark). Every branded email is skinned from this. */
export async function tenantBrandKit(db: D1Database, tenantId: string): Promise<BrandKit> {
  const row = await db.prepare("SELECT branding_json FROM tenant_settings WHERE tenant_id = ?").bind(tenantId).first<{ branding_json: string | null }>();
  let name: string | null = null;
  let accent = MOSSA_BRAND.accent;
  let accentFg = MOSSA_BRAND.accentFg;
  let logoUrl: string | null = null;
  try {
    const b = row?.branding_json ? (JSON.parse(row.branding_json) as { name?: string; primary?: string; primaryForeground?: string; logoUrl?: string }) : null;
    if (b?.name) name = b.name;
    if (b?.primary) accent = safeColor(b.primary, MOSSA_BRAND.accent);
    if (b?.primaryForeground) accentFg = safeColor(b.primaryForeground, MOSSA_BRAND.accentFg);
    // Only a public absolute URL renders in an email client (no session/cookies).
    if (b?.logoUrl && /^https?:\/\//i.test(b.logoUrl) && !b.logoUrl.includes("/api/media")) logoUrl = b.logoUrl;
  } catch { /* fall through to org name + defaults */ }
  if (!name) name = (await db.prepare("SELECT name FROM organization WHERE id = ?").bind(tenantId).first<{ name: string }>())?.name ?? "Mossa";
  return { name, accent, accentFg, logoUrl };
}

function notifEmailHtml(env: Env, brand: BrandKit, input: NotifyInput): string {
  const base = env.BETTER_AUTH_URL?.replace(/\/$/, "") ?? "";
  const href = input.link && base ? `${base}${input.link.startsWith("/") ? "" : "/"}${input.link}` : null;
  const body = `${input.message ? `<p style="margin:0">${escapeHtml(input.message)}</p>` : ""}${href ? emailButton(`Open ${brand.name}`, href, brand) : ""}`;
  return emailShell(escapeHtml(input.title), body, { brand, preheader: input.message ?? input.title });
}

/** Deliver a notification to one user, honoring their preferences. */
export async function notify(env: Env, input: NotifyInput): Promise<void> {
  if (!input.userId) return;
  const userId = input.userId;
  // Best-effort in full: notification delivery must NEVER reject its caller — a
  // transient error in the preference lookup would otherwise 500 an operation
  // (plan publish, goal set, …) that already committed. Swallow everything.
  try {
  let channels = { inbox: true, email: false };
  if (input.force) {
    channels = { inbox: true, email: true };
  } else {
    const [role, prefRow] = await Promise.all([
      userRole(env.DB, input.tenantId, userId),
      env.DB.prepare("SELECT notif_json FROM user_prefs WHERE user_id = ?").bind(userId).first<{ notif_json: string | null }>(),
    ]);
    channels = resolveChannels(role, parseNotifPrefs(prefRow?.notif_json ?? null), input.category);
  }

  if (channels.inbox) {
    const id = input.dedupeKey ? `ntf_${input.dedupeKey}_${userId}` : `ntf_${crypto.randomUUID()}`;
    await env.DB.prepare(
      "INSERT OR IGNORE INTO notifications (id, tenant_id, recipient_user_id, category, type, title, message, link, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, input.tenantId, userId, input.category, input.type, input.title, input.message ?? null, input.link ?? null, nowIso()).run().catch(() => undefined);
    await notifyUser(env, userId);
  }

  if (channels.email) {
    const user = await env.DB.prepare("SELECT email FROM \"user\" WHERE id = ?").bind(userId).first<{ email: string | null }>();
    if (user?.email) {
      const brand = await tenantBrandKit(env.DB, input.tenantId);
      await sendTenantEmail(env, input.tenantId, {
        to: user.email,
        subject: input.title,
        html: input.emailHtml ?? notifEmailHtml(env, brand, input),
        text: input.message ?? input.title,
        brandName: brand.name,
      }).catch(() => undefined);
    }
  }
  } catch { /* notification is best-effort; never surface to the caller */ }
}

/** Fan a notification out to every OWNER of a tenant (billing / sales / roster). */
export async function notifyOwners(env: Env, tenantId: string, input: Omit<NotifyInput, "tenantId" | "userId">): Promise<void> {
  const owners = await env.DB.prepare("SELECT userId FROM member WHERE organizationId = ? AND role = 'owner'").bind(tenantId).all<{ userId: string | null }>().catch(() => ({ results: [] as { userId: string | null }[] }));
  for (const o of owners.results ?? []) {
    if (o.userId) await notify(env, { ...input, tenantId, userId: o.userId });
  }
}
