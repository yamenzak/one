/**
 * The tables auth owns.
 *
 * Better Auth's own schema is mirrored 1:1 from its SQLite definitions
 * (string→TEXT, boolean→INTEGER, date→DATE) so its D1 adapter reads and writes
 * them natively. **Do not "improve" these column names or types** — the adapter
 * generates its SQL from its own model, so a divergence here does not fail
 * loudly, it fails as a query that silently returns nothing.
 *
 * An `organization` IS a tenant. That equivalence is the load-bearing one: it is
 * what makes the org plugin's membership, invitation and role machinery into the
 * app's tenancy, instead of a second membership model beside it.
 *
 * Plus two tables that are ours, not Better Auth's:
 *
 *   auth_logs   the audit trail AND the rate-limiter's backing store. It is one
 *               table because the limiter's question ("how many codes went to
 *               this address in the last hour") is a query over the trail.
 *   action_otps step-up confirmation codes for irreversible actions. Separate
 *               from the sign-in OTP on purpose — see `action-otp.ts`.
 */

import type { SchemaModule } from "@4dl/core";

export const AUTH_SCHEMA: SchemaModule = {
  id: "auth",
  version: "1",
  ddl: [
    'CREATE TABLE IF NOT EXISTS "user" (id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, emailVerified INTEGER, image TEXT, createdAt DATE, updatedAt DATE);',
    'CREATE TABLE IF NOT EXISTS "session" (id TEXT PRIMARY KEY, expiresAt DATE, token TEXT UNIQUE, createdAt DATE, updatedAt DATE, ipAddress TEXT, userAgent TEXT, userId TEXT, activeOrganizationId TEXT);',
    'CREATE TABLE IF NOT EXISTS "account" (id TEXT PRIMARY KEY, accountId TEXT, providerId TEXT, userId TEXT, accessToken TEXT, refreshToken TEXT, idToken TEXT, accessTokenExpiresAt DATE, refreshTokenExpiresAt DATE, scope TEXT, password TEXT, createdAt DATE, updatedAt DATE);',
    'CREATE TABLE IF NOT EXISTS "verification" (id TEXT PRIMARY KEY, identifier TEXT, value TEXT, expiresAt DATE, createdAt DATE, updatedAt DATE);',
    'CREATE TABLE IF NOT EXISTS "organization" (id TEXT PRIMARY KEY, name TEXT, slug TEXT UNIQUE, logo TEXT, createdAt DATE, metadata TEXT);',
    'CREATE TABLE IF NOT EXISTS "member" (id TEXT PRIMARY KEY, organizationId TEXT, userId TEXT, role TEXT, permissions_json TEXT, createdAt DATE);',
    // Resolved on EVERY authenticated request (role + permissions lookup) —
    // without this the member table is full-scanned per request.
    'CREATE INDEX IF NOT EXISTS idx_member_org_user ON "member"(organizationId, userId);',
    'CREATE TABLE IF NOT EXISTS "invitation" (id TEXT PRIMARY KEY, organizationId TEXT, email TEXT, role TEXT, status TEXT, expiresAt DATE, inviterId TEXT, createdAt DATE);',
    // Passkey plugin (WebAuthn credentials; multiple per user).
    'CREATE TABLE IF NOT EXISTS "passkey" (id TEXT PRIMARY KEY, name TEXT, publicKey TEXT, userId TEXT, credentialID TEXT, counter INTEGER, deviceType TEXT, backedUp INTEGER, transports TEXT, createdAt DATE, aaguid TEXT);',
    // The audit trail, and the rate limiter's store.
    "CREATE TABLE IF NOT EXISTS auth_logs (id TEXT PRIMARY KEY, event TEXT, email TEXT, ip TEXT, user_agent TEXT, success INTEGER, at INTEGER);",
    "CREATE INDEX IF NOT EXISTS idx_authlogs_email ON auth_logs(email, at);",
    // A one-time code emailed to confirm an irreversible action for an already
    // signed-in user — decoupled from the sign-in OTP so confirming never mints
    // a session. One live code per (subject, purpose); the HASH is stored, never
    // the code. `attempts` caps brute force.
    "CREATE TABLE IF NOT EXISTS action_otps (subject TEXT, purpose TEXT, code_hash TEXT, expires_at INTEGER, attempts INTEGER DEFAULT 0, created_at INTEGER, PRIMARY KEY (subject, purpose));",
  ],
  // `user`, `session`, `account`, `verification` and `passkey` are keyed on a
  // USER, who is cross-tenant: a person in two tenants keeps their identity when
  // one is purged. So they are deliberately absent from the tenant cascade —
  // identity erasure is a separate operation with a different trigger.
  scoped: {
    tenantColumn: "organizationId",
    tenantTables: ["member", "invitation"],
  },
};
