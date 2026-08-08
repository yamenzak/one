// @ts-nocheck
/**
 * Static-site generator for the Scena marketing site. Runs under `tsx` so it can
 * import the product's own TypeScript sources directly — one source of truth:
 *   • the mascot/logo from @scena/brand (the real character, legs + antennas),
 *   • the plan seed + feature/quota catalog (the autodiscover registry) so
 *     pricing and features are always exactly what the app ships.
 *
 * `build.mjs` is the only place that reaches into those sources; it hands the
 * (pure, checkable) template plain data + ready SVG strings.
 *
 *   tsx build.mjs   → dist/
 */
import { mkdir, rm, writeFile, cp, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { LOCALES, DEFAULT_LOCALE, SITE_URL, localePrefix, localeUrl } from "./src/config.mjs";
import { catalogs } from "./src/i18n/index.mjs";
import { renderPage, renderNotFound } from "./src/template.mjs";

// The product's real sources (single source of truth). Relative paths so the
// generator reads them straight from the monorepo — no build output needed.
// ⚠️ These three imports reach ACROSS the workspace by relative path, and all
// three still named the layout of the repo Scena was imported from:
// `packages/brand`, `packages/manifest` and `apps/api` do not exist here (the
// first is Kova's reserved brand dir, the third is Kova's WORKER). Nothing
// typechecks this file — it is `.mjs` run by tsx — so the breakage only
// surfaced as a failed deploy, on the one job that runs it.
import { scenaMascotSvg, scenaIconSvg } from "../../packages/scena-brand/src/mascot.ts";
import { FEATURE_CATALOG, QUOTA_CATALOG, featureDef, quotaDef } from "../../packages/scena-manifest/src/entitlements-catalog.ts";
import { DEFAULT_PLANS } from "../scena/src/billing-seed.ts";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");
const LASTMOD = new Date().toISOString().slice(0, 10);

// Shared brand marks (identical on every page). Stable uids so ids don't collide
// when two mascots share a page.
const ASSETS = {
  logo: scenaIconSvg({}),
  mascotCanvas: scenaMascotSvg({ mood: "happy", uid: "canvas", attrs: 'class="wmascot" aria-hidden="true"' }),
  mascotCta: scenaMascotSvg({ mood: "happy", uid: "cta", attrs: 'aria-hidden="true"' }),
  mascotSad: scenaMascotSvg({ mood: "sad", uid: "nf", attrs: 'aria-hidden="true"' }),
};

// List features carry a free baseline; only their *premium* variants are a sell.
const LIST_BASELINE = { clock: ["digital"], alerting: ["dashboard"] };

/** Is a feature a marketing highlight for this plan's entitlements? */
function featureOn(key, val) {
  if (typeof val === "boolean") return val;
  if (Array.isArray(val)) {
    const base = LIST_BASELINE[key] ?? [];
    return val.some((v) => !base.includes(v));
  }
  return false;
}

/**
 * Build one locale's pricing straight from DEFAULT_PLANS + the catalog. Prices,
 * plan set, credit grants and included features all come from the registry; the
 * catalog M supplies localized phrasing (falling back to the registry's own
 * English `billing` text so a newly-added feature shows up immediately).
 */
function buildPricing(M) {
  const P = M.pricing;
  const num = (n) => n.toLocaleString("en-US");
  /*
    ⚠️ ONLY WHAT IS FOR SALE. `DEFAULT_PLANS` still carries `free`, because it is
    the PARKING ROW every new workspace is stamped with — but it is `active:
    false` and no picker in the product offers it. This generator mapped the
    whole array, so the marketing site advertised a "Free / forever" tier that
    the signup wizard would not let anybody choose, and that `statusOf` gates
    read-only if they somehow landed on it. The registry is the source of truth
    for the price AND for whether there is a price.
  */
  return DEFAULT_PLANS.filter((plan) => plan.active !== false && plan.priceCents > 0).map((plan) => {
    const e = plan.entitlements;
    const bullets = [];
    // The trial IS what replaced the free tier, so it leads. First bullet, not
    // buried under the quotas.
    const trialDays = e.trialDays ?? 0;
    if (trialDays > 0) bullets.push((P.trial ?? "{n} days free").replace("{n}", num(trialDays)));
    // headline quota: screens (registry billing is plural-aware for the EN base;
    // a locale override with {n} wins where provided)
    const screens = quotaDef("pairedDevices")?.billing?.(e.quotas.pairedDevices);
    if (screens) bullets.push(P.quota?.pairedDevices ? P.quota.pairedDevices.replace("{n}", num(e.quotas.pairedDevices)) : screens);
    // credits
    const grant = e.aiCredits?.monthlyGrant ?? 0;
    if (grant > 0) bullets.push((P.credits ?? "{n} AI credits / mo").replace("{n}", num(grant)));
    // enabled features, in catalog order, using localized or registry phrasing
    for (const f of FEATURE_CATALOG) {
      if (!f.billing) continue;
      if (!featureOn(f.key, e.features[f.key])) continue;
      bullets.push(P.feat?.[f.key] ?? f.billing);
    }
    // a couple of extra quotas worth calling out
    if (e.quotas.liveBoards > 0) {
      const lb = quotaDef("liveBoards")?.billing?.(e.quotas.liveBoards);
      if (lb) bullets.push(P.quota?.liveBoards ? P.quota.liveBoards.replace("{n}", num(e.quotas.liveBoards)) : lb);
    }
    return {
      id: plan.id,
      name: plan.name, // proper noun — same across locales
      price: `$${Math.round(plan.priceCents / 100)}`,
      per: P.perMonth ?? "/mo",
      tagline: P.taglines?.[plan.id] ?? "",
      cta: (trialDays > 0 ? (P.ctaTrial ?? "Start {plan} free") : (P.ctaPaid ?? "Start {plan}")).replace("{plan}", plan.name),
      popular: plan.id === "pro",
      bullets,
    };
  });
}

async function main() {
  await rm(dist, { recursive: true, force: true });
  await mkdir(join(dist, "assets"), { recursive: true });

  const pub = join(root, "public");
  if (existsSync(pub)) {
    for (const entry of await readdir(pub)) await cp(join(pub, entry), join(dist, entry), { recursive: true });
  }
  await cp(join(root, "src/styles.css"), join(dist, "assets/styles.css"));
  await cp(join(root, "src/app.js"), join(dist, "assets/app.js"));

  for (const locale of LOCALES) {
    const M = catalogs[locale.code];
    if (!M) throw new Error(`No catalog for locale "${locale.code}"`);
    const ctx = { ...ASSETS, pricing: buildPricing(M) };
    const outDir = join(dist, localePrefix(locale));
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, "index.html"), renderPage(locale, M, ctx), "utf8");
    await writeFile(join(outDir, "404.html"), renderNotFound(locale, M, ctx), "utf8");
    console.log(`  ✓ ${locale.code.padEnd(3)} → ${localePrefix(locale) || "/"}/{index,404}.html  (${ctx.pricing.length} plans)`);
  }

  const alt = (l) => `<xhtml:link rel="alternate" hreflang="${l.code}" href="${localeUrl(l)}"/>`;
  const urls = LOCALES.map((l) => `  <url>
    <loc>${localeUrl(l)}</loc>
    <lastmod>${LASTMOD}</lastmod>
    ${LOCALES.map(alt).join("\n    ")}
    <xhtml:link rel="alternate" hreflang="x-default" href="${localeUrl(DEFAULT_LOCALE)}"/>
  </url>`).join("\n");
  await writeFile(join(dist, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`, "utf8");
  await writeFile(join(dist, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`, "utf8");

  console.log(`\n  Built ${LOCALES.length} locale(s) → ${dist}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
