/**
 * A STUDIO'S EMAIL WEARS THE STUDIO'S BRAND — INCLUDING THE PARTS THAT ARE FILES.
 *
 * `tenantBrandKit` has always carried the name and the accent, so a branded
 * email looked branded and nobody looked closer. The LOGO was thrown away for
 * every studio on the platform, always, by one condition:
 *
 *     if (b?.logoUrl && /^https?:\/\//i.test(b.logoUrl) && !b.logoUrl.includes("/api/media"))
 *
 * The branding editor uploads through `/media/upload` and stores exactly
 * `/api/media/t/<tenant>/brand/<id>.png` — relative, and containing the string
 * the guard rejects. So the condition was false for every studio that had ever
 * uploaded a logo, and the shell silently fell back to setting their name in
 * Inter. No error, no log, no way to notice except by receiving one.
 *
 * The guard was not wrong about private media — a progress photo is
 * assignment-gated and would 401 into a broken box. It was wrong about ONE
 * prefix: `brand/` is public by construction, because the login screen, the
 * favicon and the PWA install icon all fetch it with no session. `route-guard.ts`
 * lets it through unauthenticated and `media-routes.ts` serves it
 * `cache-control: public`.
 *
 * These drive the REAL resolver against D1, because the bug lived entirely in
 * what the database holds versus what the function accepts — a unit test with a
 * hand-written url would have agreed with whatever the guard said.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";
import { tenantBrandKit } from "../src/notify.js";
import { emailShell, KOVA_BRAND } from "../src/mailer.js";

const db = () => env.DB as D1Database;
const kit = (id: string) => tenantBrandKit(env as never, id);

/** A studio with branding stored the way the editor actually stores it. */
async function seedStudio(id: string, branding: Record<string, unknown>): Promise<void> {
  const d = db();
  await d.prepare("INSERT OR IGNORE INTO organization (id, name, slug, createdAt) VALUES (?, ?, ?, '2026-01-01')").bind(id, `Studio ${id}`, id).run();
  await d.prepare("INSERT OR IGNORE INTO tenant_settings (tenant_id, updated_at) VALUES (?, '2026-01-01')").bind(id).run();
  await d.prepare("UPDATE tenant_settings SET branding_json = ? WHERE tenant_id = ?").bind(JSON.stringify(branding), id).run();
}

/** A hostname row, exactly as `host-context.ts` and the domain routes write them. */
async function seedDomain(id: string, hostname: string, kind: "subdomain" | "custom", status: string): Promise<void> {
  await db()
    .prepare("INSERT OR REPLACE INTO tenant_domains (hostname, tenant_id, kind, status, created_at, updated_at) VALUES (?, ?, ?, ?, '2026-01-01', '2026-01-01')")
    .bind(hostname, id, kind, status)
    .run();
}

describe("a studio's brand assets survive the trip into an email", () => {
  beforeAll(async () => { await ensureSchema(db()); });

  it("serves an uploaded logo absolutely, off the studio's own subdomain", async () => {
    const id = "brandlogo";
    await seedStudio(id, { name: "Iron Works", logoUrl: `/api/media/t/${id}/brand/m_logo.png` });
    await seedDomain(id, `${id}.kova.4dl.app`, "subdomain", "active");

    const b = await kit(id);
    expect(b.logoUrl).toBe(`https://${id}.kova.4dl.app/api/media/t/${id}/brand/m_logo.png`);
    expect(b.name).toBe("Iron Works");
  });

  it("carries the app icon too, so a studio with no wordmark still has a mark", async () => {
    const id = "brandicon";
    await seedStudio(id, { iconUrl: `/api/media/t/${id}/brand/m_icon.png` });
    await seedDomain(id, `${id}.kova.4dl.app`, "subdomain", "active");

    const b = await kit(id);
    expect(b.iconUrl).toBe(`https://${id}.kova.4dl.app/api/media/t/${id}/brand/m_icon.png`);
    expect(b.logoUrl).toBeNull();
  });

  /**
   * The half of the old guard that was RIGHT, kept. A private key would 401 in a
   * mail client, and a relative link to one is a thing we do not want to teach
   * anyone to click.
   */
  it("still refuses a private media key", async () => {
    const id = "brandpriv";
    await seedStudio(id, { logoUrl: `/api/media/t/${id}/c/cl_1/progress/m_x.png` });
    await seedDomain(id, `${id}.kova.4dl.app`, "subdomain", "active");
    expect((await kit(id)).logoUrl).toBeNull();
  });

  it("leaves an off-platform absolute url exactly as the studio typed it", async () => {
    const id = "brandabs";
    await seedStudio(id, { logoUrl: "https://cdn.ironworks.example/logo.svg" });
    await seedDomain(id, `${id}.kova.4dl.app`, "subdomain", "active");
    expect((await kit(id)).logoUrl).toBe("https://cdn.ironworks.example/logo.svg");
  });

  it("prefers a LIVE custom domain — that is the address their clients know", async () => {
    const id = "brandcustom";
    await seedStudio(id, { logoUrl: `/api/media/t/${id}/brand/m_logo.png` });
    await seedDomain(id, `${id}.kova.4dl.app`, "subdomain", "active");
    await seedDomain(id, "coaching.example.com", "custom", "active");

    const b = await kit(id);
    expect(b.logoUrl).toBe(`https://coaching.example.com/api/media/t/${id}/brand/m_logo.png`);
    expect(b.siteUrl).toBe("https://coaching.example.com");
  });

  /** `pending` means Cloudflare has not issued the certificate. An https image
   *  on a host with no cert is a broken image in every mail client. */
  it("ignores a custom domain that is not certified yet", async () => {
    const id = "brandpending";
    await seedStudio(id, { logoUrl: `/api/media/t/${id}/brand/m_logo.png` });
    await seedDomain(id, `${id}.kova.4dl.app`, "subdomain", "active");
    await seedDomain(id, "notyet.example.com", "custom", "pending");
    expect((await kit(id)).siteUrl).toBe(`https://${id}.kova.4dl.app`);
  });

  /**
   * The origin comes from `canonicalHost`, which derives the subdomain from the
   * ORG'S SLUG rather than from the `subdomain` row. They normally agree, and
   * the one time they do not is the one that matters: `resolveHost` resolves a
   * subdomain by looking the slug up on the organization, so a failed or
   * half-applied `moveSubdomain` leaves a row naming a hostname that no longer
   * answers. Reading the row would put that dead host in every email the studio
   * sends — the logo, the CTA and the footer link all at once.
   */
  it("follows the org slug, not a stale subdomain row", async () => {
    const id = "brandstale";
    await seedStudio(id, { logoUrl: `/api/media/t/${id}/brand/m_logo.png` });
    await db().prepare("UPDATE organization SET slug = ? WHERE id = ?").bind("renamed", id).run();
    await seedDomain(id, `${id}.kova.4dl.app`, "subdomain", "active");

    const b = await kit(id);
    expect(b.siteUrl).toBe("https://renamed.kova.4dl.app");
    expect(b.logoUrl).toBe(`https://renamed.kova.4dl.app/api/media/t/${id}/brand/m_logo.png`);
  });

  it("falls back to the studio's name when there is nothing to draw", async () => {
    const id = "brandbare";
    await seedStudio(id, {});
    const b = await kit(id);
    expect(b.logoUrl).toBeNull();
    expect(b.iconUrl).toBeNull();
    expect(b.name).toBe(`Studio ${id}`);
  });
});

describe("the shell renders what the kit resolved", () => {
  it("draws a wordmark ALONE — it already contains the name", () => {
    const html = emailShell("Hi", "<p>body</p>", {
      brand: { name: "Iron Works", accent: "#ff0066", accentFg: "#fff", logoUrl: "https://x.test/logo.png", iconUrl: "https://x.test/icon.png" },
    });
    expect(html).toContain("https://x.test/logo.png");
    // The icon must not be drawn beside it, and the name must not be set twice.
    expect(html).not.toContain("https://x.test/icon.png");
  });

  it("draws the icon as a chip BESIDE the name when there is no wordmark", () => {
    const html = emailShell("Hi", "<p>body</p>", {
      brand: { name: "Iron Works", accent: "#ff0066", accentFg: "#fff", logoUrl: null, iconUrl: "https://x.test/icon.png" },
    });
    expect(html).toContain("https://x.test/icon.png");
    expect(html).toContain("Iron Works");
    // Explicit pixel attributes, or Outlook draws a 512px icon at 512px.
    expect(html).toMatch(/width="34" height="34"/);
  });

  it("puts the studio's accent on the card even when they uploaded nothing", () => {
    // The point of the accent seam: every other brand cue is conditional, so a
    // studio with only a colour used to get a card identical to everyone else's.
    const html = emailShell("Hi", "<p>body</p>", {
      brand: { name: "Iron Works", accent: "#ff0066", accentFg: "#fff", logoUrl: null },
    });
    expect(html).toContain("background:#ff0066");
  });

  it("links the studio's own address in the footer, by host", () => {
    const html = emailShell("Hi", "<p>body</p>", {
      brand: { name: "Iron Works", accent: "#ff0066", accentFg: "#fff", logoUrl: null, siteUrl: "https://coaching.example.com" },
    });
    expect(html).toContain('href="https://coaching.example.com"');
    expect(html).toContain(">coaching.example.com<");
  });

  it("gives the platform's own mail a mark too", () => {
    // Sign-in codes, receipts and dunning are Kova's, and they were the plainest
    // messages in the system — a name in Inter above a dark card.
    expect(KOVA_BRAND.iconUrl).toBeTruthy();
    expect(emailShell("Hi", "<p>body</p>")).toContain(KOVA_BRAND.iconUrl!);
  });
});
