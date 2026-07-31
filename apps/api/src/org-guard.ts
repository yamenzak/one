/**
 * Kova's binding of `@4dl/tenancy`'s slug guards.
 *
 * The rule — a tenant's slug is a HOSTNAME, and an origin is a trust boundary —
 * is the platform's, and the universal reservations (the other doors, mail
 * autoconfig, ACME, Workers plumbing, money words) come with it. What is Kova's
 * is `KOVA_RESERVED_LABELS`: our brand names, which mean nothing to another app
 * and are ours to reserve. `tenancyConfig` carries both halves.
 *
 * The noun is Kova's too — it is the word a user reads in the rejection.
 */

import { orgSlugGuards } from "@4dl/tenancy";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./auth-context.js";
import { tenancyConfig } from "./host-context.js";

const guards = orgSlugGuards(tenancyConfig, "studio");

export const orgCreateGuard = guards.create as unknown as MiddlewareHandler<AppEnv>;
export const orgUpdateGuard = guards.update as unknown as MiddlewareHandler<AppEnv>;
