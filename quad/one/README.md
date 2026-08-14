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

## Before it can be deployed

⚠️ **The D1 ids in `wrangler.jsonc` are placeholders.** A deploy with them in
place binds databases that do not exist and answers every request 500. Creating
them, writing the real ids in, and a CI job that ships this are the next act —
see [../docs/PROGRESS.md](../docs/PROGRESS.md).

⚠️ **`ENVIRONMENT` must stay `production` in `wrangler.jsonc`.** That block is
the DEPLOYED config; `wrangler dev` overrides it. The development lane puts
sign-in codes in retained logs and turns on the fabricating AI lane.

⚠️ **No `routes` in `wrangler.jsonc`, deliberately.** Declaring them makes
`wrangler dev` rewrite the incoming Host to the route's hostname, which collapses
every door onto one — and the doors ARE the tenancy. The production routes are a
dashboard step.
