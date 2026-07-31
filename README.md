# one

The **4° Labs** platform, and the apps built on it. One monorepo: fourteen shared
`@4dl/*` packages that handle everything a multi-tenant SaaS needs before it
handles anything of its own, plus the products that stand on them.

```
apps/
  api/        # Kova's worker — Hono router + Durable Objects; also serves the SPA
  app/        # Kova's PWA — ONE role-adaptive app (client / trainer / owner / operator)
  www/        # marketing site
  e2e/        # Playwright — the golden paths, in a browser against the real worker
  _template/  # a NEW app: every package wired, no product vocabulary. Copy it.
packages/
  core/ tenancy/ auth/ billing/ billing-rail/ commerce/ ai/ storage/
  email/ notify/ purge/ ui/ app-kit/ admin/        # @4dl/* — the platform
  domain/ protocol/                                 # @kova/* — Kova's own
```

## Where to go

| I want to… | Read |
|---|---|
| understand the platform, or add to it | [PLATFORM.md](PLATFORM.md) — the packages, the four mechanisms, the five invariants, and the contribution rules |
| **ship a new app on it** | [docs/SHIPPING-AN-APP.md](docs/SHIPPING-AN-APP.md) — nothing to deployed |
| know what Kova is and does | [KOVA.md](KOVA.md) — spec, design mapping, screen index |
| design a screen | [UI-LANGUAGE.md](UI-LANGUAGE.md) — the interface language, product-agnostic |
| deploy or operate | [DEPLOY.md](DEPLOY.md) |
| work on this as an AI agent | [CLAUDE.md](CLAUDE.md) for orientation, [AGENTS.md](AGENTS.md) for the working manual |

## The rule the whole repo rests on

> **A `@4dl/*` package may not know what the app sells.** It may know that
> *something* is sold, that *someone* is a tenant, that *some* capability is
> gated. The nouns — client, workout, SKU, lot number, document — stay in the app.

That is machine-checked. Every package has a boundary test that fails on a
product noun or an app-scope import, with a frozen ALLOW list that can only
shrink. Thirteen of the fourteen are empty.

## Stack

Cloudflare Workers + Hono + Durable Objects + D1 + KV + R2 + Workers AI · Better
Auth (**100% passwordless**: email OTP + passkeys) · Vite + React 19 PWA ·
Tailwind v4 · Stripe (platform rail + Connect tenant rail). pnpm, Node ≥22.

## Development

```sh
pnpm install
cp apps/api/.dev.vars.example apps/api/.dev.vars   # required once, before the first run
pnpm dev            # api on :8787, app on :5173
pnpm typecheck
pnpm test           # the whole workspace
pnpm e2e            # Playwright, against the real worker
```

**Local dev needs no Cloudflare account.** D1, KV and R2 are simulated by
Miniflare, the AI suite falls back to a deterministic mock, and the mailer logs
sign-in codes to the console — but all three of those lanes are unlocked by
`ENVIRONMENT=development` in `.dev.vars`, which is why that file is not optional.

Both test suites run on the **real host topology** via `*.localhost`: sign-in
happens on `setup.localhost:8787` and tenant behaviour is asserted on
`<slug>.localhost:8787`, because the host *is* the tenancy here and simulating
that would prove nothing.
