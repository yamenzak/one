# @scena/www — marketing site

The public marketing site at **scena.fourdegreelabs.com**. A dependency-free
static generator emits one fully server-rendered, SEO-complete HTML document per
locale, deployed as a Cloudflare Worker with the static-assets binding (same
pattern as the player). No runtime rendering, no client framework — the page is
readable and crawlable without JS; JS only enhances (theme, language menu, and
the interactive product demo).

## Build

```bash
node build.mjs      # or: pnpm build
```

Writes `dist/`:

```
dist/index.html            root locale (en)
dist/de/index.html         German
dist/ar/index.html         Arabic (RTL)
dist/assets/styles.css     shared stylesheet
dist/assets/app.js         shared enhancement script
dist/fonts/…               self-hosted Hanken Grotesk, JetBrains Mono, Cairo (ar)
dist/{favicon.svg,icons,manifest.webmanifest,og.png,apple-touch-icon.png}
dist/sitemap.xml           with hreflang alternates + x-default
dist/robots.txt
```

Preview locally: `pnpm dev` (builds, then serves `dist/` on :4321).

## Internationalization

- **Locales** live in `src/config.mjs` (`LOCALES`) and one catalog per locale in
  `src/i18n/`. The root locale is served at `/`; every other locale at `/<code>/`.
- **Adding a market** is two edits: a `LOCALES` entry in `src/config.mjs` and a
  matching catalog in `src/i18n/` (copy `en.mjs`, translate). The generator,
  sitemap, hreflang tags, `<html lang/dir>`, and language switcher all pick it up.
- **RTL** is automatic from a locale's `dir: "rtl"`. Layout uses logical
  properties throughout; Arabic loads the Cairo face via the `[lang="ar"]`
  cascade. The product mock mirrors fully (sidebar, table, canvas) and stays
  localized.
- Product-mock *data* that isn't marketing copy — device codes (`SCR-1A4F`),
  resolutions, `app.scena.io`, timeline clip labels — is intentionally shared
  across locales.

## SEO

Every page ships: a unique `<title>` + meta description + keywords, `canonical`,
`hreflang` alternates + `x-default`, Open Graph + Twitter Card (`og.png` is a
1200×630 branded card), and JSON-LD (`Organization`, `WebSite`,
`SoftwareApplication`, `FAQPage`). `sitemap.xml` and `robots.txt` are generated.

The production origin is the single constant `SITE_URL` in `src/config.mjs` —
change it there and canonical/hreflang/sitemap/OG all follow.

## Deploy

```bash
pnpm deploy         # node build.mjs && wrangler deploy
```

Assets-only Worker (`wrangler.jsonc`), custom domain `scena.fourdegreelabs.com`.
