/**
 * The one delivery path for app notifications. Resolves the recipient's
 * per-category channel preferences, then writes the inbox row (+ real-time push)
 * and/or sends a branded email through the tenant's provider. Every trigger — route
 * handlers, webhooks, cron — funnels through here so preferences, categories and
 * the email channel apply uniformly. `force` bypasses preferences for the truly
 * transactional (invites, receipts).
 */

import { resolveChannels, parseNotifPrefs, parseNotifPolicy, emailAllowedByPolicy, audienceForRole, notifCategoryOf, notifTitleOf, notifLinkOf, notifTemplateOf, renderTemplate, NOTIF_CATEGORIES, type NotifType, type NotifRole, type NotifCategory } from "@mossa/domain";
import type { Env } from "./env.js";
import { notifyUser } from "./inbox-do.js";
import { sendTenantEmail } from "./email-provider.js";
import { sendEmail, emailShell, emailButton, escapeHtml, safeColor, MOSSA_BRAND, type BrandKit } from "./mailer.js";
import { nowIso } from "./ids.js";

export interface NotifyInput {
  tenantId: string;
  userId: string | null | undefined;
  /** The type is the SSOT key; its category (which governs preferences + the
   *  owner email policy) derives from the `NOTIF_TYPES` atom — never passed. */
  type: NotifType;
  /** Overrides the type's default title; required only for types whose title
   *  interpolates a name (the registry has no default for those). */
  title?: string;
  message?: string | null;
  /** Overrides the type's default link; required only for client-scoped links
   *  (`/clients/:id/…`) the registry can't know. */
  link?: string | null;
  /** Stable id part → INSERT OR IGNORE dedupe across retries/sweeps. */
  dedupeKey?: string;
  /** Skip preferences entirely (transactional). */
  force?: boolean;
  /** Full email HTML override; otherwise a standard card is built from title/message. */
  emailHtml?: string;
  /** Values for the type's email template `{{variables}}` (e.g. coachName,
   *  planName, daysLeft). `studioName` is injected automatically. Ignored for
   *  types without a template. */
  vars?: Record<string, string | number | null | undefined>;
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

/** The friendly category kicker shown as an eyebrow above every notif email —
 *  a small premium touch that orients the reader ("Personal record", "Body
 *  composition") before they read the headline. */
function categoryEyebrow(category: NotifCategory): string | undefined {
  return NOTIF_CATEGORIES.find((c) => c.key === category)?.label;
}

function notifEmailHtml(env: Env, brand: BrandKit, r: { title: string; message?: string | null; link: string | null; footnote?: string | null; eyebrow?: string }): string {
  const base = env.BETTER_AUTH_URL?.replace(/\/$/, "") ?? "";
  const href = r.link && base ? `${base}${r.link.startsWith("/") ? "" : "/"}${r.link}` : null;
  const body = `${r.message ? `<p style="margin:0">${escapeHtml(r.message)}</p>` : ""}${href ? emailButton(`Open ${brand.name}`, href, brand) : ""}`;
  return emailShell(escapeHtml(r.title), body, { brand, preheader: r.message ?? r.title, footnote: r.footnote ?? undefined, eyebrow: r.eyebrow });
}

/** Deliver a notification to one user, honoring their preferences. */
export async function notify(env: Env, input: NotifyInput): Promise<void> {
  if (!input.userId) return;
  const userId = input.userId;
  const category = notifCategoryOf(input.type);
  // Title + link derive from the type's record unless the call site overrides
  // (name-interpolating titles / client-scoped links). Title always resolves to
  // something (registry default → type id) so a row is never blank.
  const title = input.title ?? notifTitleOf(input.type) ?? input.type;
  const link = input.link ?? notifLinkOf(input.type);
  // Best-effort in full: notification delivery must NEVER reject its caller — a
  // transient error in the preference lookup would otherwise 500 an operation
  // (plan publish, goal set, …) that already committed. Swallow everything.
  try {
  let channels = { inbox: true, email: false };
  if (input.force) {
    channels = { inbox: true, email: true };
  } else {
    const [role, prefRow, polRow] = await Promise.all([
      userRole(env.DB, input.tenantId, userId),
      env.DB.prepare("SELECT notif_json FROM user_prefs WHERE user_id = ?").bind(userId).first<{ notif_json: string | null }>(),
      env.DB.prepare("SELECT notif_policy_json FROM tenant_settings WHERE tenant_id = ?").bind(input.tenantId).first<{ notif_policy_json: string | null }>(),
    ]);
    channels = resolveChannels(role, parseNotifPrefs(prefRow?.notif_json ?? null), category);
    // The owner can disable email for a category studio-wide, now per AUDIENCE
    // (clients vs staff); the member's inbox choice is never overridden, only
    // their email channel.
    if (channels.email && !emailAllowedByPolicy(parseNotifPolicy(polRow?.notif_policy_json ?? null), category, audienceForRole(role))) {
      channels.email = false;
    }
  }

  if (channels.inbox) {
    const id = input.dedupeKey ? `ntf_${input.dedupeKey}_${userId}` : `ntf_${crypto.randomUUID()}`;
    await env.DB.prepare(
      "INSERT OR IGNORE INTO notifications (id, tenant_id, recipient_user_id, category, type, title, message, link, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, input.tenantId, userId, category, input.type, title, input.message ?? null, link ?? null, nowIso()).run().catch(() => undefined);
    await notifyUser(env, userId);
  }

  if (channels.email) {
    const user = await env.DB.prepare("SELECT email FROM \"user\" WHERE id = ?").bind(userId).first<{ email: string | null }>();
    if (user?.email) {
      // Studio-billing (Mossa → tenant) emails send on the PLATFORM rail with
      // Mossa's own identity, unmetered — a studio's suspension notice is from
      // Mossa, not the studio, and shouldn't cost the studio a credit. Everything
      // else is the tenant's own message: tenant rail + tenant brand.
      const isPlatformBilling = category === "billing";
      const brand = isPlatformBilling ? MOSSA_BRAND : await tenantBrandKit(env.DB, input.tenantId);
      // Tenant white-label (tenant rail only): a per-type subject/body override
      // and a global signature. An override with enabled=0 mutes this email
      // entirely (the inbox row above still delivers).
      let override: { subject: string | null; body: string | null; enabled: number } | null = null;
      let signature: string | null = null;
      if (!isPlatformBilling) {
        const [ov, sig] = await Promise.all([
          env.DB.prepare("SELECT subject, body, enabled FROM email_templates WHERE tenant_id = ? AND type = ?").bind(input.tenantId, input.type).first<{ subject: string | null; body: string | null; enabled: number }>(),
          env.DB.prepare("SELECT email_signature FROM tenant_settings WHERE tenant_id = ?").bind(input.tenantId).first<{ email_signature: string | null }>(),
        ]);
        override = ov ?? null;
        signature = sig?.email_signature ?? null;
      }
      if (override && override.enabled === 0) {
        // Tenant muted email for this type — inbox already delivered, nothing to send.
      } else {
        // Prefer a tenant override, then the registry template, then the generic
        // card. Values are HTML-escaped for the body; the subject is plain text.
        const tpl = override && override.subject ? { subject: override.subject, body: override.body ?? "" } : notifTemplateOf(input.type);
        const footnote = signature ? escapeHtml(signature) : undefined;
        const eyebrow = categoryEyebrow(category);
        let subject = title;
        let html: string;
        if (input.emailHtml) {
          html = input.emailHtml;
        } else if (tpl) {
          const base = env.BETTER_AUTH_URL?.replace(/\/$/, "") ?? "";
          const href = link && base ? `${base}${link.startsWith("/") ? "" : "/"}${link}` : null;
          const raw: Record<string, string | number | null | undefined> = { studioName: brand.name, ...(input.vars ?? {}) };
          const esc = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, escapeHtml(v === undefined || v === null ? "" : String(v))]));
          subject = renderTemplate(tpl.subject, raw);
          const inner = renderTemplate(tpl.body, esc) + (href ? emailButton(`Open ${brand.name}`, href, brand) : "");
          html = emailShell(escapeHtml(subject), inner, { brand, preheader: subject, footnote, eyebrow });
        } else {
          html = notifEmailHtml(env, brand, { title, message: input.message, link, footnote: signature, eyebrow });
        }
        if (isPlatformBilling) {
          await sendEmail(env.DB, { to: user.email, subject, html, text: input.message ?? subject }, env.EMAIL, undefined, env.ENVIRONMENT === "development").catch(() => undefined);
        } else {
          await sendTenantEmail(env, input.tenantId, { to: user.email, subject, html, text: input.message ?? subject, brandName: brand.name }).catch(() => undefined);
        }
      }
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
