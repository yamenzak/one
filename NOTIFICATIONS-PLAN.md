# Notifications Overhaul — Design Plan

Status: **shipped** — all 5 slices implemented, tested, and pushed to
`claude/full-app-audit-fb3oya`. Full suite green: 162 domain / 121 API / 6 app /
7 protocol. (Mapped first via 3 read-only audits, then built in reviewable slices.)

---

## 0. What exists today (ground truth)

**The good news: the bones are already there.** This is mostly wiring + one
greenfield piece (templates/variables), not a rebuild.

| Area | State |
| --- | --- |
| **Registry** (`packages/domain/notifications.ts`) | 14 **categories** (each with a `roles[]` audience) + 25 **types** (each with `to: client\|staff\|owner`, a default `title`, a default `link`). SSOT already. **No `icon`/`tone` per type. `to` is unused at runtime.** |
| **Table** (`notifications`) | `id, tenant_id, recipient_user_id, type, title, message, link, read(0/1), created_at, category`. Dedupe via deterministic id + `INSERT OR IGNORE`. **No audience column, no `read_at`.** |
| **Delivery** (`notify.ts`) | `notify()` (single user) + `notifyOwners()`. Resolves channels: role defaults → user prefs → owner email policy. Inbox row + `InboxDO` WS push; email via `sendTenantEmail`. |
| **In-app UI** (`NotificationBell.tsx`) | One bell in the shared `Shell` header. Flat dropdown, **fixed `Sparkles` icon for every type**. Row `onClick` = mark-read **only — the `link` is fetched but never navigated.** No inbox page, no mark-all-read. |
| **List/read** | `GET /api/notifications` filters by `recipient_user_id` **only** (flat, cross-tenancy, no mode/audience filter). `POST /:id/read` per item. |
| **Prefs** | `user_prefs.notif_json` per-**user** (not per-tenant): `category → {inbox?, email?}`. Two channels only (**no push**). `NotificationsSection` in Settings, role-scoped (doubles as the client screen). |
| **Owner policy** | `tenant_settings.notif_policy_json` = an **email allow-list by category** only. Can't target audience, can't gate inbox, no per-type. |
| **Persona/mode** | `personas[]` + `active` (role, clientId) from server. `mode: coach\|train` is a **client-only localStorage toggle**; `useClientSurface()` derives the surface. **Nothing in the notification path consumes mode.** |
| **Email** | Two rails: platform (`mailer.ts`, Kova OTP) + tenant (`email-provider.ts`: platform-metered \| brevo \| off). A **real branded HTML shell already exists** (`emailShell`/`emailButton`, dark-first, inlined CSS, tenant logo+accent) — but **every type reuses one generic card**. **No template store, no `{{variable}}` engine** — copy is hardcoded/interpolated at call sites. Sender identity + visual branding per tenant already exist. |

**The three real gaps** vs your ask: (1) audience/mode never filters what a user
sees; (2) in-app notifications don't click through and look identical; (3) no
tenant-editable email templates or variables.

---

## 1. Registry stays the SSOT — extend it

Add to each `NOTIF_TYPES` entry (one place, drives everything):
- **`icon`** + **`tone`** — per-type identity for the bell, inbox, and email.
- **`audience`** — reuse the existing `to` (`client｜staff｜owner`), now actually
  consumed (today it's documentation-only).
- **`template`** — a default `{ subject, body }` with `{{variables}}` (see §6).
- **`vars`** — the variable names this type exposes (for the editor + validation).

Everything downstream (bell rendering, mode filter, email render, the template
editor's variable list) reads from here — no drift.

---

## 2. In-app: beautiful + clickable + mode-aware

- **Per-type identity** — the bell/inbox render each type's `icon` + `tone`
  instead of one grey `Sparkles`. Grouped by day, unread emphasized.
- **Click-through** — a row navigates to its `link`. If the link is a
  client-surface route (`/train`, `/progress`, …) and the user is staff, we flip
  to train mode (and switch tenant if needed) *before* navigating — the
  `setMode`/`switchTenant` primitives already exist. Click also marks read.
- **Mode-aware filter (your "train vs trainer" ask)** — the bell filters the list
  by the **current surface** (`useClientSurface()`) against each type's
  `audience`: train mode → `client` items; coach mode → `staff` + `owner` items.
  The unread badge reflects the current surface. This is **pure client-side**
  using the shared `@kova/domain` registry — **no schema change, no new server
  signal** (mode already lives on the client).
  - *Emails follow role, not mode:* a coach still receives coach emails even
    while browsing in train mode — mode is a transient view state, email is not.
- **Full Inbox page** + **mark-all-read** (new `read_at` optional; a
  `POST /api/notifications/read-all` scoped to the current surface).

---

## 3. Persona split (admin / client / coach / assistant)

- **Who receives** is already correct — every `notify()` targets a specific
  `recipient_user_id` (a client, the primary trainer, each owner). An assistant
  only ever sees rows addressed to them.
- **What a surface shows** becomes audience-filtered (§2): the client surface
  shows `client` notifications; the staff surface shows `staff` + `owner`. Coach
  vs assistant is already separated by recipient targeting.
- **Platform admin (Kova) stream** — optional; you're the only super-admin and
  the AdminConsole covers it. Deferred unless you want it (see decisions).

---

## 4. Email templates + white-labeling with variables (the greenfield piece)

- **Variable context** — introduce a typed `NotifVars` object (studioName,
  clientName, coachName, planName, sessionTime, daysLeft, ctaUrl, …) assembled at
  each `notify()` call site, *replacing* the pre-baked `message` string. This is
  the heaviest part (~20 call sites) but it's what makes real templating possible.
- **Default templates in the registry** — each type ships a branded default
  `{ subject, body }` using `{{variables}}`, rendered through the existing
  `emailShell` (so they stay beautiful and on-brand automatically).
- **Tenant overrides** — a new `email_templates` table (`tenant_id, type,
  subject, body, enabled`). A tenant rewrites any type's subject/body with
  `{{variables}}`; blank = fall back to the registry default.
- **Safe render** — a small substitution engine: only whitelisted variables
  interpolate, values are `escapeHtml`'d, colors pass `safeColor`. (Primitives
  already exist in `mailer.ts`.)
- **Global white-label** — editable header/footer/signature + reply-to, layered
  over the branded shell.
- **Correctness fix folded in:** Kova→tenant **billing** emails currently send
  via the *tenant* rail (branded as the tenant, metered to the tenant's credits).
  Route those via the **platform rail** with Kova's identity, unmetered — a
  studio's own suspension notice shouldn't cost the studio a credit.

---

## 5. Settings — owner level + client level

- **Client** — a dedicated, reachable notification settings surface (the
  role-scoped `NotificationsSection` already renders client categories; promote +
  polish it). Per-category × channel (App / Email), plus a "mute all" and quiet
  hours (optional).
- **Owner** — the policy gains **audience granularity**: separate "email clients
  about…" vs "email staff about…" toggles (today it's one undifferentiated
  category list), **plus** the template editor (§4) and global email branding.
- Prefs become keyed per-(user, tenant) so a user's choices don't bleed across
  studios (today `notif_json` is per-user only).

---

## 6. Implementation slices (each independently reviewable)

1. **Registry extension** — `icon`/`tone`/`audience`/default-`template`/`vars` on
   `NOTIF_TYPES` + a conformance test. Pure domain, zero behavior change.
2. **In-app overhaul** — per-type icon/tone, click-through-to-route (+ mode/tenant
   switch), mode-aware surface filter, Inbox page, mark-all-read.
3. **Email engine** — `NotifVars` context at call sites, registry default
   templates, safe substitution renderer, per-type branded layouts, the
   Kova-billing-rail fix.
4. **Tenant template store + editor** — `email_templates` table, CRUD, owner
   editor UI with live variable list + preview + reset-to-default, header/footer.
5. **Settings** — client notification screen, owner audience-split policy,
   per-(user,tenant) prefs.

Domain logic (audience filter, variable render, template resolution) is pure and
unit-tested; the routes/UI get Miniflare + app tests, matching the repo's
conventions.

---

## Decisions (locked)

1. **Email white-label scope** — ✅ **phase it**: engine + editor + variable
   context for the **client-facing types first** (feedback, plans, sessions,
   billing/dunning), expand to the rest after.
2. **Rich in-app display** — ✅ **click-through + grouped Inbox page** (per-type
   icon/tone, rows route to the relevant section, mark-all-read). Per-notification
   rich detail pages deferred.
3. **Owner control granularity** — ✅ **audience-split category policy** (email
   clients vs staff about category X). Per-type toggles deferred.
4. **Platform-admin (Kova) stream** — ✅ **out of scope** for now (AdminConsole
   covers it).
