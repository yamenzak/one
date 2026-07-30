/**
 * Cloudflare for SaaS, bound to this worker.
 *
 * The client lives in `@4dl/tenancy`. The only thing it cannot know is which
 * worker script a custom hostname's route should point at — that is `name` in
 * `wrangler.jsonc`, and getting it wrong is this module's worst failure mode: the
 * route is created, the certificate issues, the domain reports ACTIVE, and every
 * request reaches a script that is not there.
 */

import { saasConfig as tSaasConfig, type SaasConfig } from "@4dl/tenancy";

export {
  createCustomHostname,
  createWorkerRoute,
  deleteCustomHostname,
  deleteWorkerRoute,
  getCustomHostname,
  WORKER_NAME_RE,
  type CustomHostname,
  type SaasConfig,
  type VerifyRecord,
} from "@4dl/tenancy";

/** Must match `name` in apps/api/wrangler.jsonc. */
export const DEFAULT_WORKER_NAME = "kova";

/** Read + validate the CF for SaaS config. Returns null when not configured. */
export const saasConfig = (db: D1Database): Promise<SaasConfig | null> => tSaasConfig(db, DEFAULT_WORKER_NAME);
