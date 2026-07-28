# Kova

Multi-tenant, multi-trainer platform for personal-training businesses — studios, gyms,
and independent coaches manage their clients, run staff trainers with scoped rosters,
sell training packages through their own Stripe (Connect, no markup), and use an AI
suite (Workers AI + Google Gemini) metered against tenant credits.

- **Product & technical spec:** [SPEC.md](SPEC.md)
- **UI design system:** [DESIGN.md](DESIGN.md)
- **Domain reference (ByShujaa feature inventory):** [docs/BY-SHUJAA-FEATURES.md](docs/BY-SHUJAA-FEATURES.md)

## Stack

Cloudflare Workers + Hono + Durable Objects + D1 + KV + R2 + Workers AI · Better Auth
(100% passwordless: email OTP + passkeys) · Vite + React 19 PWA (one app for all roles)
· shadcn/ui + Tailwind v4 · Stripe (platform rail + Connect tenant rail).

## Layout

```
apps/
  api/        # THE worker: Hono router + DOs + D1/KV/R2/AI bindings; serves the app SPA
  app/        # ONE role-adaptive PWA: client, trainer, owner, platform admin
  www/        # Marketing site (later phase)
packages/
  protocol/   # Zod schemas + API types shared api <-> app
  domain/     # Pure logic: credits, entitlements, perms, budgets, nutrition, body-fat,
              # progress aggregates, workout math. No I/O. Densely unit-tested.
  ui/         # Design system per DESIGN.md (shadcn/ui + Tailwind v4 + custom identity components)
  brand/      # Logos, illustrations, theme contracts
```

## Development

```sh
pnpm install
pnpm dev          # turbo: api (wrangler dev) + app (vite)
pnpm typecheck
pnpm test
```

Local dev needs no Cloudflare account: D1/KV/R2 are simulated by Miniflare, the AI
suite falls back to a deterministic mock, and the mailer logs OTPs to the console.
