/**
 * WHO IS LET INTO WHICH PRODUCT — the grant behind self-serve provisioning.
 *
 * ⚠️ IT IS A GRANT ON AN ADDRESS, NOT A FLAG ON AN ACCOUNT, and the sequence is
 * why. Somebody types their address on the company's own website, is told they
 * will be let in, and signs in AFTERWARDS — often on a different device, days
 * later. A flag that needed an account to attach to could not be given at the
 * moment it is bought, so it would have to be remembered somewhere else until an
 * account appeared, which is this table with an extra step and a race.
 *
 * ⚠️ THE SAME MECHANISM AN INVITATION ALREADY USES. A membership is written
 * against an address and claimed by whoever proves it; so is this. Nothing new
 * had to be invented for the case where the person does not exist yet, because
 * the platform already had the answer.
 *
 * ⚠️ AND IT LIVES IN THE GLOBAL DIRECTORY, beside the accounts and the tenant
 * directory. Every product's worker reads it, no product's worker owns it, and a
 * grant given for one product is visible to the account centre served by
 * another — which is the entire point of the account centre being able to say
 * what somebody may open.
 */

import type { Instant, Provisioning, SqlHandle } from "@one/kernel";
import { EVERY_PRODUCT } from "@one/kernel";

export const PROVISIONING_SCHEMA = {
  id: "provisioning",
  after: ["identity"],
  ddl: [
    /*
      ⚠️ KEYED BY ADDRESS, LOWER CASED BY THE CALLER. One row per person, so a
      second grant for another product is an UPDATE of a list rather than a second
      row nobody would think to look for.
    */
    `CREATE TABLE IF NOT EXISTS provisioning (email TEXT PRIMARY KEY, apps TEXT NOT NULL, granted_at TEXT NOT NULL, granted_by TEXT NOT NULL);`,
  ],
} as const;

export interface ProvisioningStore {
  /** What this address may open. Null where nothing was ever granted. */
  read(email: string): Promise<Provisioning | null>;
  /**
   * ⚠️ MERGES RATHER THAN REPLACES, because two products sell separately. A
   * write that replaced the list would make the second purchase revoke the first
   * — silently, on the day somebody buys more.
   */
  grant(email: string, apps: readonly string[], by: string, at: Instant): Promise<Provisioning>;
  /** ⚠️ A switch with no off is not a switch. Named apps, or all of them. */
  revoke(email: string, apps: readonly string[] | null): Promise<void>;
}

const listOf = (raw: string): readonly string[] =>
  raw.split(",").map((s) => s.trim()).filter(Boolean);

export function provisioningStore(directory: SqlHandle): ProvisioningStore {
  const rowFor = async (email: string) =>
    directory.first<{ email: string; apps: string; granted_at: string; granted_by: string }>(
      `SELECT email, apps, granted_at, granted_by FROM provisioning WHERE email = ?`, email,
    );

  return {
    async read(email) {
      const row = await rowFor(email.trim().toLowerCase()).catch(() => null);
      if (!row) return null;
      return {
        email: row.email,
        apps: listOf(row.apps),
        grantedAt: row.granted_at as Instant,
        by: row.granted_by,
      };
    },

    async grant(email, apps, by, at) {
      const key = email.trim().toLowerCase();
      const had = await rowFor(key).catch(() => null);
      /*
        ⚠️ THE WILDCARD ABSORBS EVERYTHING, because a list containing both it and
        three names is a list where two of the three are decoration — and the day
        one is removed, the wildcard silently keeps it.
      */
      const merged = [...new Set([...(had ? listOf(had.apps) : []), ...apps])];
      const kept = merged.includes(EVERY_PRODUCT) ? [EVERY_PRODUCT] : merged;
      await directory.run(
        `INSERT INTO provisioning (email, apps, granted_at, granted_by) VALUES (?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET apps = excluded.apps, granted_at = excluded.granted_at, granted_by = excluded.granted_by`,
        key, kept.join(","), at, by,
      );
      return { email: key, apps: kept, grantedAt: at, by };
    },

    async revoke(email, apps) {
      const key = email.trim().toLowerCase();
      if (apps === null) {
        await directory.run(`DELETE FROM provisioning WHERE email = ?`, key);
        return;
      }
      const had = await rowFor(key).catch(() => null);
      if (!had) return;
      const left = listOf(had.apps).filter((a) => !apps.includes(a));
      /*
        ⚠️ AN EMPTY LIST IS NO ROW. A row saying "may open nothing" and no row at
        all are the same fact, and keeping both means every reader has to know
        that — including the one written next year.
      */
      if (left.length === 0) await directory.run(`DELETE FROM provisioning WHERE email = ?`, key);
      else await directory.run(`UPDATE provisioning SET apps = ? WHERE email = ?`, left.join(","), key);
    },
  };
}

/**
 * ⚠️ CONSTANT TIME, BECAUSE THE ALTERNATIVE LEAKS THE KEY ONE CHARACTER AT A
 * TIME. A length-and-loop compare on a shared secret is measurable across a
 * network by anybody patient, and this secret opens every product on the
 * deployment to any address the caller names.
 */
export function sameSecret(given: string, expected: string): boolean {
  if (expected.length === 0) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
