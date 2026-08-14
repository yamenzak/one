# One — the deployment

<!-- ⚠️ Not a governed document: `docs.test.mjs` reads `quad/docs/` only, so this
     carries no `kind:`. Claiming one would say a script checks it when none
     does. It is here rather than there because it is how to RUN this package,
     which is a thing you want beside the package. -->

**One worker answers every door for every product** (D3). `src/index.ts` is the
whole of it, and `../one-hub` is the page it serves.

Adding a product is a line in `APPS` and a row in a database — no worker, no
domain binding, no provisioning workflow, no secret.

## Running it

```
pnpm quad:dev
```

Two processes: `wrangler dev` on **:8080** (the worker, its D1s simulated by
Miniflare) and vite on **:5173** (the Hub, proxying `/api` and `/health` to the
worker). Open the door you want:

| Door | Address |
|---|---|
| signpost | `http://localhost:5173` |
| account | `http://id.localhost:5173` |
| setup | `http://setup.localhost:5173` |
| operator | `http://admin.localhost:5173` |
| a workspace | `http://<slug>.localhost:5173` |

⚠️ **The doors are real, not simulated.** Browsers resolve `*.localhost` to
loopback and both wrangler and vite preserve the Host, so `setup.localhost` IS
the setup door — the same `doorFor` decides it here and at the edge. A
development environment that drove one origin and faked the door would be one
where none of the tenancy is exercised.

⚠️ **The sign-in code goes to the terminal, not to an inbox.** `ENVIRONMENT` is
`development` under `wrangler dev`, and the mailer logs `[sign-in] <address> →
<code>`. Anywhere else, a deployment with no mailer REFUSES to claim it sent
something.

### Two honest dev-only differences

- **The session cookie is host-only.** `Domain=localhost` is rejected by
  browsers, so `cookieDomainFor` returns null for loopback and each
  `*.localhost` gets its own jar — signing in on `setup.` leaves you signed out
  on `id.`. Production issues one cookie for the whole root, so one sign-in
  covers every door.
- **The port is part of every address.** The Hub carries `location.port` into
  every cross-door link for exactly this reason; without it each hop lands on
  port 80 and 404s, which reads as "the door is broken" rather than "the link
  is".

## Shipping it

**Actions → "Quad" → Run workflow, with `provision` ticked.** That creates the
D1 databases One binds, writes their real ids into `wrangler.jsonc` and commits
them, mints `AUTH_SECRET` as a worker secret if there is none, deploys, and then
probes two doors to check it actually came up.

Until that has run, the deploy step **skips**: `wrangler` accepts a placeholder
id without complaint and the worker comes up bound to nothing, which is a green
run and a dead product.

⚠️ **`AUTH_SECRET` is minted once and never re-put.** Rewriting it invalidates
every sign-in code in flight. It is a WORKER secret rather than a repository
one, because a repository secret is readable by every workflow run in the repo.

### Two dashboard steps, and only two

| What | Where |
|---|---|
| `A`/`AAAA` (or a proxied `CNAME`) for `one.4dl.app` and `*.one.4dl.app` | zone `4dl.app` → DNS |
| Worker routes `one.4dl.app/*` and `*.one.4dl.app/*` → script `one` | zone `4dl.app` → Workers Routes |

⚠️ **No `routes` in `wrangler.jsonc`, deliberately.** Declaring them makes
`wrangler dev` rewrite the incoming Host to the route's hostname, which collapses
every door onto one — and the doors ARE the tenancy.

⚠️ **Universal SSL covers `4dl.app` and `*.4dl.app` — one level only.** A
certificate for `*.one.4dl.app` is a second-level wildcard, which needs Advanced
Certificate Manager or Cloudflare for SaaS. Without it every door but the apex
fails its TLS handshake, and the browser blames the network.

### Why this cannot disturb Kova

`ROOT` is `one.4dl.app`, not the apex. Kova's production routes are
`kova.4dl.app/*` and `*.kova.4dl.app/*`, and One serves `*.${ROOT}` — so putting
One at `4dl.app` would place its wildcard over every live tenant's address, with
route precedence rather than intent deciding who answers. The worker name, both
database names and the root are all checked against the live registry by
`quad/scripts/inert.test.mjs`, which runs before anything is created.

⚠️ **`ENVIRONMENT` must stay `production` in `wrangler.jsonc`.** That block is
the DEPLOYED config; `.dev.vars` overrides it locally. The development lane puts
sign-in codes in retained logs and turns on the lane that fabricates AI output
and bills for it.
