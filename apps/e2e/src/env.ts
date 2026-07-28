/**
 * The hosts the suite drives.
 *
 * Kova is subdomain-first, so there is no single origin any more — and the suite
 * exercises the real topology rather than a simulation of it. `*.localhost`
 * resolves to loopback in every current browser and in `wrangler dev`, so the same
 * doors that exist in production exist here:
 *
 *   localhost:8787              the ROOT — a signpost. Refuses to send a sign-in
 *                               code, because no studio lives there.
 *   setup.localhost:8787        where a studio is created.
 *   admin.localhost:8787        the operator console.
 *   <slug>.localhost:8787       a studio. The tenancy is pinned by this hostname.
 *
 * `baseURL` is the SETUP door: that is where every spec starts (sign in, create a
 * studio), and specs navigate to a studio's own host once they know its slug.
 *
 * ⚠️ Still :8787 (the worker serving the built SPA), never Vite's :5173 — see the
 * header of playwright.config.ts for why.
 *
 * One honest difference from production: the session cookie is HOST-ONLY here.
 * `Domain=localhost` is rejected by browsers (a dot-less root is not a registrable
 * domain), so `cookieDomainFor` returns null for loopback and each `*.localhost`
 * keeps its own session. In production the cookie is issued for `kova.4dl.app` and
 * one sign-in covers every studio. So a spec crossing between hosts signs in on
 * each — a dev artefact, not the shipped behaviour, and the reason this suite
 * cannot cover the instant studio switch.
 */
import { installLocalhostResolver } from "./resolve-localhost.js";

// Some container images do not implement RFC 6761 `.localhost`, so the suite
// supplies it rather than depending on the host. Runs at import: every spec pulls
// this module in transitively, and the very first request must already resolve.
installLocalhostResolver();

export const APP_PORT = 8787;

/** The dev/E2E root domain. Loopback classifies against `localhost` regardless of
 *  the worker's configured ROOT_DOMAIN — see `@kova/domain` `classifyHost`. */
export const ROOT_DOMAIN = "localhost";

/** The root door: a signpost, not an app. */
export const ROOT_URL = `http://${ROOT_DOMAIN}:${APP_PORT}`;

/** The setup door — where studios are created. The suite's `baseURL`. */
export const SETUP_URL = `http://setup.${ROOT_DOMAIN}:${APP_PORT}`;

/** The operator console's door. */
export const ADMIN_URL = `http://admin.${ROOT_DOMAIN}:${APP_PORT}`;

/** A studio's own origin. */
export const studioUrl = (slug: string): string => `http://${slug}.${ROOT_DOMAIN}:${APP_PORT}`;

/** Where the app answers by default: the setup door. */
export const APP_URL = SETUP_URL;
