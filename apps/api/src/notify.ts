/**
 * The one delivery path for app notifications. Resolves the recipient's
 * per-category channel preferences, then writes the inbox row (+ real-time push)
 * and/or sends a branded email through the tenant's provider. Every trigger — route
 * handlers, webhooks, cron — funnels through here so preferences, categories and
 * the email channel apply uniformly. `force` bypasses preferences for the truly
 * transactional (invites, receipts).
 */

import { resolveChannels, parseNotifPrefs, parseNotifPolicy, emailAllowedByPolicy, audienceForRole, notifCategoryOf, notifTitleOf, notifLinkOf, notifTemplateOf, renderTemplate, NOTIF_CATEGORIES, type NotifType, type NotifRole, type NotifCategory } from "@kova/domain";
import type { Env } from "./env.js";
import { notifyUser } from "./inbox-do.js";
import { dispatchNotification, dispatchToRole, type ResolvedNotification } from "@4dl/notify";
import { sendTenantEmail } from "./email-provider.js";
import { sendEmail, emailShell, emailButton, escapeHtml, safeColor, KOVA_BRAND, type BrandKit } from "./mailer.js";
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
  let accent = KOVA_BRAND.accent;
  let accentFg = KOVA_BRAND.accentFg;
  let logoUrl: string | null = null;
  try {
    const b = row?.branding_json ? (JSON.parse(row.branding_json) as { name?: string; primary?: string; primaryForeground?: string; logoUrl?: string }) : null;
    if (b?.name) name = b.name;
    if (b?.primary) accent = safeColor(b.primary, KOVA_BRAND.accent);
    if (b?.primaryForeground) accentFg = safeColor(b.primaryForeground, KOVA_BRAND.accentFg);
    // Only a public absolute URL renders in an email client (no session/cookies).
    if (b?.logoUrl && /^https?:\/\//i.test(b.logoUrl) && !b.logoUrl.includes("/api/media")) logoUrl = b.logoUrl;
  } catch { /* fall through to org name + defaults */ }
  if (!name) name = (await db.prepare("SELECT name FROM organization WHERE id = ?").bind(tenantId).first<{ name: string }>())?.name ?? "Kova";
  return { name, accent, accentFg, logoUrl };
}

/** The friendly category kicker shown as an eyebrow above every notif email —
 *  a small premium touch that orients the reader ("Personal record", "Body
 *  composition") before they read the headline. */
function categoryEyebrow(category: string): string | undefined {
  return NOTIF_CATEGORIES.find((c) => c.key === category)?.label;
}

/** Append the recipient's tenant to an email deep-link. An email opens in a
 *  fresh browser with no session context, so the app can't know which studio to
 *  land in for a user who belongs to several — the `?t=` hint tells it to switch
 *  to this tenant before routing (the app reads + strips it at boot). */
function withTenantHint(url: string, tenantId: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}t=${encodeURIComponent(tenantId)}`;
}

function notifEmailHtml(env: Env, brand: BrandKit, tenantId: string, r: { title: string; message?: string | null; link: string | null; footnote?: string | null; eyebrow?: string }): string {
  const base = env.BETTER_AUTH_URL?.replace(/\/$/, "") ?? "";
  const href = r.link && base ? withTenantHint(`${base}${r.link.startsWith("/") ? "" : "/"}${r.link}`, tenantId) : null;
  const body = `${r.message ? `<p style="margin:0">${escapeHtml(r.message)}</p>` : ""}${href ? emailButton(`Open ${brand.name}`, href, brand) : ""}`;
  return emailShell(escapeHtml(r.title), body, { brand, preheader: r.message ?? r.title, footnote: r.footnote ?? undefined, eyebrow: r.eyebrow });
}


/**
 * Deliver one notification.
 *
 * The channel resolution and the inbox write are `@4dl/notify`'s now — the same
 * in every app, and keeping them here is why Tessa shipped an InboxDO with
 * nothing flowing through it. What stays is the EMAIL half below: a tenant
 * white-label template store, a per-type mute, a signature, and the rail choice
 * — Kova's own billing mail goes out unmetered under Kova's identity while
 * everything else is the tenant's own message on the tenant's rail. None of that
 * is a fact about notifications; it is a fact about how Kova bills.
 */
export async function notify(env: Env, input: NotifyInput): Promise<void> {
  await dispatchNotification(
    {
      db: env.DB,
      poke: (userId) => notifyUser(env, userId),
      roleOf: userRole,
      sendEmail: (n) => sendNotifEmail(env, n),
    },
    input,
  );
}

/** The email half. Runs only when the resolved channels say email. */
async function sendNotifEmail(env: Env, n: ResolvedNotification<NotifyInput>): Promise<void> {
  const { category, title, link } = n;
  const input = n;
  const user = await env.DB.prepare("SELECT email FROM \"user\" WHERE id = ?").bind(n.userId).first<{ email: string | null }>();
  if (!user?.email) return;
  {
      // Studio-billing (Kova → tenant) emails send on the PLATFORM rail with
      // Kova's own identity, unmetered — a studio's suspension notice is from
      // Kova, not the studio, and shouldn't cost the studio a credit. Everything
      // else is the tenant's own message: tenant rail + tenant brand.
      const isPlatformBilling = category === "billing";
      const brand = isPlatformBilling ? KOVA_BRAND : await tenantBrandKit(env.DB, input.tenantId);
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
          const href = link && base ? withTenantHint(`${base}${link.startsWith("/") ? "" : "/"}${link}`, input.tenantId) : null;
          // `studioName`, `title` and `message` are available to EVERY template,
          // because notify() always has them. That is what lets a type be
          // customizable without inventing variables its callers never pass:
          // `renderTemplate` blanks an unknown key, so a template built on a
          // variable nobody supplies ships a sentence with a hole in it.
          const raw: Record<string, string | number | null | undefined> = {
            studioName: brand.name,
            title,
            message: input.message ?? "",
            ...(input.vars ?? {}),
          };
          const esc = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, escapeHtml(v === undefined || v === null ? "" : String(v))]));
          subject = renderTemplate(tpl.subject, raw);
          const inner = renderTemplate(tpl.body, esc) + (href ? emailButton(`Open ${brand.name}`, href, brand) : "");
          html = emailShell(escapeHtml(subject), inner, {
            brand,
            preheader: subject,
            footnote,
            eyebrow,
            // Preferences and notifications are one destination now, so this is
            // where "I want fewer of these" actually leads.
            manageUrl: base ? withTenantHint(`${base}/preferences`, input.tenantId) : undefined,
          });
        } else {
          html = notifEmailHtml(env, brand, input.tenantId, { title, message: input.message, link, footnote: signature, eyebrow });
        }
        if (isPlatformBilling) {
          await sendEmail(env, { to: user.email, subject, html, text: input.message ?? subject }, env.EMAIL, undefined, env.ENVIRONMENT === "development").catch(() => undefined);
        } else {
          await sendTenantEmail(env, input.tenantId, { to: user.email, subject, html, text: input.message ?? subject, brandName: brand.name }).catch(() => undefined);
        }
      }
    }
}


/** Fan a notification out to every OWNER of a tenant (billing / sales / roster). */
export async function notifyOwners(env: Env, tenantId: string, input: Omit<NotifyInput, "tenantId" | "userId">): Promise<void> {
  const owners = await env.DB.prepare("SELECT userId FROM member WHERE organizationId = ? AND role = 'owner'").bind(tenantId).all<{ userId: string | null }>().catch(() => ({ results: [] as { userId: string | null }[] }));
  for (const o of owners.results ?? []) {
    if (o.userId) await notify(env, { ...input, tenantId, userId: o.userId });
  }
}
