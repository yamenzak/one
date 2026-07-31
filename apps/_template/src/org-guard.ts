/**
 * A tenant's slug is a HOSTNAME, so it is validated before Better Auth stores it.
 *
 * `@4dl/tenancy` owns the rule and the universal reservations (the other doors,
 * mail autoconfig, ACME, Workers plumbing, money words). This supplies the app's
 * half — its own brand labels, through `tenancyConfig` — and the noun a user
 * reads in the rejection.
 *
 * Mount these AROUND Better Auth's organization endpoints, not instead of them:
 * they validate, call through, and only then provision or move the hostname. The
 * slug is not real until Better Auth has accepted it and won the uniqueness
 * check.
 */

import { orgSlugGuards } from "@4dl/tenancy";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./auth-context.js";
import { tenancyConfig } from "./host-context.js";

const guards = orgSlugGuards(tenancyConfig, "workspace");

export const orgCreateGuard = guards.create as unknown as MiddlewareHandler<AppEnv>;
export const orgUpdateGuard = guards.update as unknown as MiddlewareHandler<AppEnv>;
