/**
 * THE SHARED CONFIG STORE, as routes this package owns.
 *
 * Same rule `@4dl/email/admin-routes` states in its own header: the package that
 * owns the keys ships the way to set them, because a package whose configuration
 * has no surface is a package every app configures by hand in D1 — or, more
 * often, differently and worse.
 *
 * ── Every door writes the same store, and that IS the feature ───────────────
 *
 * These routes mount on each app's `admin.` door, so `admin.kova.4dl.app` and
 * `admin.tessa.4dl.app` both read and write ONE namespace. Setting the Gemini
 * key on either console sets it for the platform. That is the whole point: the
 * complaint this exists to answer is "I configure the same key on every app",
 * and the fix is to make the key singular, not to make the doors singular.
 *
 * A genuinely central console — one address, one sign-in — is a further step and
 * a much larger one: each app has its own `user` table and its own
 * `ADMIN_EMAILS`, so "one login for every product" is a cross-app identity
 * problem, not a config problem. Whenever that gets built it writes this same
 * namespace and these routes keep working.
 *
 * ── Two things this deliberately does not do ────────────────────────────────
 *
 * **It does not fall back.** A deployment with no `PLATFORM_CONFIG` binding gets
 * `wired: false` and a 503 on write, rather than quietly writing the app's own
 * `app_config` and looking like it worked. Silently local is the failure mode
 * that makes an operator believe every app got the value.
 *
 * **It does not read secrets back.** `isSecretConfigKey` decides; the console is
 * told a credential is set and shown its last four characters, which is enough
 * to tell two keys apart and to see a rotation land.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import {
  SHARED_CONFIG_KEYS,
  getConfig,
  isSecretConfigKey,
  isSharedConfigKey,
  readSharedConfig,
  writeSharedConfig,
} from "./config.js";
import type { HasDb, HasPlatformConfig } from "./bindings.js";

export type SharedConfigEnv = { Bindings: HasDb & HasPlatformConfig };
export type SharedConfigContext = Context<SharedConfigEnv>;

export interface SharedConfigGuards {
  /** Platform operator — an allowlist, a separate axis from tenant RBAC. */
  isPlatformAdmin: (c: SharedConfigContext) => boolean;
}

/** What the console is told about one shared key. */
export interface SharedConfigEntry {
  key: string;
  /** True when the shared store holds a value for it. */
  shared: boolean;
  /** The shared value, or null for a credential the console may not read. */
  value: string | null;
  /** Last four characters of a secret that is set — enough to identify it. */
  last4: string | null;
  /** True when this key must never be read back. */
  secret: boolean;
  /**
   * True when THIS app's own `app_config` holds a non-empty value for the key —
   * i.e. the shared value is being overridden here and nowhere else.
   *
   * The single most useful field on this response. Without it, "I set it
   * centrally and this app still uses the old one" has no visible cause: the
   * override is a row in a database nobody is looking at, and precedence is
   * exactly the kind of rule that is obvious in a header comment and invisible
   * at 2am.
   */
  overriddenHere: boolean;
}

const last4 = (v: string): string | null => (v.length >= 4 ? v.slice(-4) : v ? "•".repeat(v.length) : null);

export function sharedConfigRoutes(guards: SharedConfigGuards) {
  return new Hono<SharedConfigEnv>()
    .get("/admin/shared-config", async (c) => {
      if (!guards.isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
      const kv = c.env.PLATFORM_CONFIG;
      const shared = kv ? await readSharedConfig(kv) : {};
      // The app's OWN table, read directly rather than through `getConfig` —
      // the merged view is what the app uses, and this response is about the
      // difference between the two layers.
      const local = await getConfig(c.env.DB);

      const entries: SharedConfigEntry[] = SHARED_CONFIG_KEYS.map((key) => {
        const v = shared[key] ?? "";
        const secret = isSecretConfigKey(key);
        return {
          key,
          shared: v !== "",
          value: secret ? null : v,
          last4: secret && v ? last4(v) : null,
          secret,
          overriddenHere: (local[key] ?? "") !== "",
        };
      });

      return c.json({ wired: !!kv, entries });
    })
    .post("/admin/shared-config", async (c) => {
      if (!guards.isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
      const kv = c.env.PLATFORM_CONFIG;
      // 503, not 500: nothing is broken, the namespace is not provisioned on
      // this deployment. The message names the one action that fixes it,
      // because "not configured" with no next step is how a feature ships and
      // is never turned on.
      if (!kv) {
        return c.json(
          { error: "The shared config store is not bound on this deployment. Run the provisioning workflow." },
          503,
        );
      }

      const body = (await c.req.json().catch(() => null)) as { patch?: unknown } | null;
      const patch = body?.patch;
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) return c.json({ error: "invalid body" }, 400);

      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
        // An unknown key is a 400, not a silent drop. The allow-list is a
        // safety rule about blast radius, and a rule that fails quietly is one
        // an operator learns about from the wrong symptom.
        if (!isSharedConfigKey(k)) return c.json({ error: `"${k}" cannot be shared across apps.` }, 400);
        if (typeof v !== "string") return c.json({ error: `"${k}" must be a string.` }, 400);
        clean[k] = v.trim();
      }

      await writeSharedConfig(kv, clean);
      return c.json({ ok: true });
    });
}
