/**
 * Content hub (SPEC §8.10) — the blog, upgraded: articles / recipes /
 * warmups / stretches with draft→published lifecycle and audience tiers
 * (public marketplace SEO / clients / assigned). Plus the client-facing
 * Explore feed and the public marketplace payload.
 */

import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, requireTenant } from "./auth-context.js";
import { requireClientAccess } from "./clients.js";
import { notify } from "./notify.js";
import { hasFeature } from "./billing-store.js";
import { newId, nowIso } from "./ids.js";
import { parseJson, j } from "./db.js";

const staffOnly = (c: { get: (k: "role") => string | null }) =>
  c.get("role") === "owner" || c.get("role") === "trainer";

const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

const ResourceBody = z.object({
  type: z.enum(["article", "recipe", "warmup", "stretch", "faq"]).default("article"),
  title: z.string().min(1).max(200),
  summary: z.string().max(300).nullish(),
  bodyMd: z.string().max(50_000).nullish(),
  coverUrl: z.string().max(500).nullish(),
  category: z.string().max(60).nullish(),
  // `topics` are the free-form tags.
  topics: z.array(z.string()).default([]),
  muscleGroups: z.array(z.string()).default([]),
  durationMinutes: z.number().int().positive().nullish(),
  audience: z.enum(["public", "clients", "assigned"]).default("clients"),
  assignedClientIds: z.array(z.string()).default([]),
});

interface ResourceRow {
  id: string;
  tenant_id: string;
  type: string;
  title: string;
  summary: string | null;
  body_md: string | null;
  cover_url: string | null;
  category: string | null;
  slug: string | null;
  topics: string | null;
  muscle_groups: string | null;
  duration_minutes: number | null;
  audience: string;
  assigned_json: string | null;
  status: string;
  author_user_id: string;
  published_at: string | null;
  created_at: string;
}

/** `includeAssigned` adds the per-client assignment list — staff surfaces only,
 *  never the client-facing feed (which shouldn't see who else it's shared with). */
const view = (r: ResourceRow, includeAssigned = false) => ({
  id: r.id,
  type: r.type,
  title: r.title,
  summary: r.summary,
  bodyMd: r.body_md,
  coverUrl: r.cover_url,
  category: r.category,
  slug: r.slug,
  topics: (r.topics ?? "").split(",").filter(Boolean),
  muscleGroups: (r.muscle_groups ?? "").split(",").filter(Boolean),
  durationMinutes: r.duration_minutes,
  audience: r.audience,
  status: r.status,
  publishedAt: r.published_at,
  createdAt: r.created_at,
  ...(includeAssigned ? { assignedClientIds: parseJson<string[]>(r.assigned_json, []) } : {}),
});

export const contentHubRoutes = new Hono<AppEnv>()
  // Staff library management.
  .get("/resources", async (c) => {
    const who = requireTenant(c)!;
    if (!staffOnly(c)) return c.json({ error: "forbidden" }, 403);
    const rows = await c.env.DB.prepare(
      "SELECT * FROM resources WHERE tenant_id = ? ORDER BY updated_at DESC",
    )
      .bind(who.tenantId)
      .all<ResourceRow>();
    return c.json({ resources: (rows.results ?? []).map((r: ResourceRow) => view(r, true)) });
  })

  // Client-facing Explore feed: published content this client may see.
  .get("/resources/feed", async (c) => {
    const who = requireTenant(c)!;
    const clientId = c.req.query("clientId");
    // A clientId filters the "assigned" audience — verify the caller may act for
    // that client, so a member can't enumerate another client's assigned content.
    if (clientId) {
      const access = await requireClientAccess(c, clientId);
      if ("response" in access) return access.response;
    }
    const rows = await c.env.DB.prepare(
      "SELECT * FROM resources WHERE tenant_id = ? AND status = 'published' ORDER BY published_at DESC LIMIT 60",
    )
      .bind(who.tenantId)
      .all<ResourceRow>();
    const visible = (rows.results ?? []).filter((r) => {
      if (r.audience === "public" || r.audience === "clients") return true;
      if (r.audience === "assigned" && clientId) {
        return parseJson<string[]>(r.assigned_json, []).includes(clientId);
      }
      return false;
    });
    return c.json({ resources: visible.map((r) => view(r)) });
  })

  .get("/resources/:id", async (c) => {
    const who = requireTenant(c)!;
    if (!staffOnly(c)) return c.json({ error: "forbidden" }, 403);
    const row = await c.env.DB.prepare("SELECT * FROM resources WHERE id = ? AND tenant_id = ?")
      .bind(c.req.param("id"), who.tenantId)
      .first<ResourceRow>();
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json({ resource: view(row, true) });
  })

  .post("/resources", async (c) => {
    const who = requireTenant(c)!;
    if (!staffOnly(c)) return c.json({ error: "forbidden" }, 403);
    const parsed = ResourceBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body", issues: parsed.error.issues }, 400);
    const d = parsed.data;
    // Public (marketplace-SEO) content is a white-label capability; other
    // audiences (clients / assigned) are available on every plan.
    if (d.audience === "public" && !(await hasFeature(c.env.DB, who.tenantId, "branding")))
      return c.json({ error: "public content requires the branding plan feature" }, 403);
    const id = newId("res");
    // A stable, URL-safe slug (title + short id suffix) for headless fetch.
    const slug = `${slugify(d.title) || "post"}-${id.slice(-6)}`;
    await c.env.DB.prepare(
      `INSERT INTO resources (id, tenant_id, type, title, summary, body_md, cover_url, category, slug, topics, muscle_groups, duration_minutes, audience, assigned_json, status, author_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
    )
      .bind(id, who.tenantId, d.type, d.title, d.summary ?? null, d.bodyMd ?? null, d.coverUrl ?? null, d.category ?? null, slug, d.topics.join(","), d.muscleGroups.join(","), d.durationMinutes ?? null, d.audience, j(d.assignedClientIds), who.userId, nowIso(), nowIso())
      .run();
    return c.json({ ok: true, id, slug }, 201);
  })

  .patch("/resources/:id", async (c) => {
    const who = requireTenant(c)!;
    if (!staffOnly(c)) return c.json({ error: "forbidden" }, 403);
    const parsed = ResourceBody.partial().safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const d = parsed.data;
    const sets: string[] = [];
    const binds: unknown[] = [];
    const put = (col: string, v: unknown) => (sets.push(`${col} = ?`), binds.push(v));
    if (d.type) put("type", d.type);
    if (d.title) put("title", d.title);
    if (d.summary !== undefined) put("summary", d.summary);
    if (d.bodyMd !== undefined) put("body_md", d.bodyMd);
    if (d.coverUrl !== undefined) put("cover_url", d.coverUrl);
    if (d.category !== undefined) put("category", d.category);
    if (d.topics) put("topics", d.topics.join(","));
    if (d.muscleGroups) put("muscle_groups", d.muscleGroups.join(","));
    if (d.durationMinutes !== undefined) put("duration_minutes", d.durationMinutes);
    if (d.audience === "public" && !(await hasFeature(c.env.DB, who.tenantId, "branding")))
      return c.json({ error: "public content requires the branding plan feature" }, 403);
    if (d.audience) put("audience", d.audience);
    if (d.assignedClientIds) put("assigned_json", j(d.assignedClientIds));
    put("updated_at", nowIso());
    await c.env.DB.prepare(`UPDATE resources SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`)
      .bind(...binds, c.req.param("id"), who.tenantId)
      .run();
    return c.json({ ok: true });
  })

  .post("/resources/:id/publish", async (c) => {
    const who = requireTenant(c)!;
    if (!staffOnly(c)) return c.json({ error: "forbidden" }, 403);
    const parsed = z.object({ status: z.enum(["draft", "published", "archived"]) }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const publishedAt = parsed.data.status === "published" ? nowIso() : null;
    await c.env.DB.prepare(
      "UPDATE resources SET status = ?, published_at = COALESCE(?, published_at), updated_at = ? WHERE id = ? AND tenant_id = ?",
    )
      .bind(parsed.data.status, publishedAt, nowIso(), c.req.param("id"), who.tenantId)
      .run();
    // On publish of a client-assigned resource, notify each assigned client.
    if (parsed.data.status === "published") {
      const res = await c.env.DB.prepare("SELECT title, audience, assigned_json FROM resources WHERE id = ? AND tenant_id = ?").bind(c.req.param("id"), who.tenantId).first<{ title: string; audience: string; assigned_json: string | null }>();
      const ids = res?.audience === "assigned" ? parseJson<string[]>(res.assigned_json, []) : [];
      if (ids.length) {
        const rows = await c.env.DB.prepare(`SELECT user_id FROM clients WHERE id IN (${ids.map(() => "?").join(",")}) AND tenant_id = ?`).bind(...ids, who.tenantId).all<{ user_id: string | null }>();
        for (const r of rows.results ?? []) {
          if (r.user_id) await notify(c.env, { tenantId: who.tenantId, userId: r.user_id, category: "content", type: "content_assigned", title: "Your coach shared something with you", message: res!.title, link: "/explore" });
        }
      }
    }
    return c.json({ ok: true });
  })

  .delete("/resources/:id", async (c) => {
    const who = requireTenant(c)!;
    if (!staffOnly(c)) return c.json({ error: "forbidden" }, 403);
    await c.env.DB.prepare("DELETE FROM resources WHERE id = ? AND tenant_id = ?")
      .bind(c.req.param("id"), who.tenantId)
      .run();
    return c.json({ ok: true });
  });

const tenantBySlug = (db: D1Database, slug: string) =>
  db.prepare('SELECT id, name, slug, logo FROM "organization" WHERE slug = ?').bind(slug).first<{ id: string; name: string; slug: string; logo: string | null }>();

/** Shape a published public article for headless consumers (list vs full). */
const publicPost = (r: ResourceRow, withBody = false) => ({
  id: r.id, slug: r.slug, type: r.type, title: r.title, summary: r.summary,
  category: r.category, tags: (r.topics ?? "").split(",").filter(Boolean),
  coverUrl: r.cover_url, publishedAt: r.published_at,
  ...(withBody ? { bodyMd: r.body_md } : {}),
});

/** Public marketplace payload (SPEC §7): branding + packages + public blog. */
export const marketplaceRoutes = new Hono<AppEnv>()
  .get("/marketplace/:slug", async (c) => {
    const org = await tenantBySlug(c.env.DB, c.req.param("slug"));
    if (!org) return c.json({ error: "not found" }, 404);
    const [settings, packages, posts] = await Promise.all([
      c.env.DB.prepare("SELECT branding_json, marketplace_json FROM tenant_settings WHERE tenant_id = ?")
        .bind(org.id)
        .first<{ branding_json: string | null; marketplace_json: string | null }>(),
      c.env.DB.prepare(
        "SELECT id, name, description, one_time_price_cents, monthly_price_cents, installment_months, currency, budgets_json FROM packages WHERE tenant_id = ? AND active = 1 AND visibility = 'marketplace' ORDER BY created_at DESC",
      )
        .bind(org.id)
        .all(),
      c.env.DB.prepare(
        "SELECT id, type, title, summary, cover_url, category, slug, topics, published_at FROM resources WHERE tenant_id = ? AND status = 'published' AND audience = 'public' ORDER BY published_at DESC LIMIT 12",
      )
        .bind(org.id)
        .all<ResourceRow>(),
    ]);
    return c.json({
      tenant: { name: org.name, slug: org.slug, logo: org.logo },
      branding: parseJson(settings?.branding_json, null),
      marketplace: parseJson(settings?.marketplace_json, null),
      packages: (packages.results ?? []).map((p) => ({ ...p, budgets: parseJson(p.budgets_json as string | null, []), budgets_json: undefined })),
      posts: (posts.results ?? []).map((r) => publicPost(r)),
    });
  })

  // Headless public article index — all published public posts for a tenant,
  // optionally filtered by ?category=. Metadata only (no body).
  .get("/marketplace/:slug/posts", async (c) => {
    const org = await tenantBySlug(c.env.DB, c.req.param("slug"));
    if (!org) return c.json({ error: "not found" }, 404);
    const category = c.req.query("category");
    const rows = await c.env.DB.prepare(
      `SELECT * FROM resources WHERE tenant_id = ? AND status = 'published' AND audience = 'public'${category ? " AND category = ?" : ""} ORDER BY published_at DESC LIMIT 100`,
    )
      .bind(...(category ? [org.id, category] : [org.id]))
      .all<ResourceRow>();
    return c.json({ posts: (rows.results ?? []).map((r) => publicPost(r)) });
  })

  // Headless public article by slug (or id) — includes the full body_md.
  .get("/marketplace/:slug/posts/:postSlug", async (c) => {
    const org = await tenantBySlug(c.env.DB, c.req.param("slug"));
    if (!org) return c.json({ error: "not found" }, 404);
    const key = c.req.param("postSlug");
    const row = await c.env.DB.prepare(
      "SELECT * FROM resources WHERE tenant_id = ? AND status = 'published' AND audience = 'public' AND (slug = ? OR id = ?) LIMIT 1",
    )
      .bind(org.id, key, key)
      .first<ResourceRow>();
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json({ post: publicPost(row, true) });
  });
