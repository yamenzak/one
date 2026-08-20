/**
 * A SHARD ID TO AN ACTUAL DATABASE.
 *
 * ⚠️ THE BINDING NAME IS DERIVED FROM THE SHARD ID, so adding a shard is a
 * config entry and a directory row rather than a code change. A registry mapping
 * one to the other by hand is a table with two authorities, and the day they
 * disagree a tenant's records are addressed to a database that does not answer.
 *
 * ⚠️ AND A SHARD THE DIRECTORY KNOWS AND THE DEPLOYMENT DOES NOT IS A THROW,
 * NOT A FALLBACK. Serving a tenant from "some other shard" would answer their
 * requests with an empty workspace — which reads as data loss, and is worse than
 * an error page that says the deployment is misconfigured.
 */

import type { Db } from "./sql.js";

/** `eu-1` → `SHARD_EU_1`. Nothing else is allowed to be a shard id. */
export function bindingFor(shardId: string): string {
  if (!/^[a-z][a-z0-9-]*$/.test(shardId)) throw new Error(`"${shardId}" is not a shard id`);
  return `SHARD_${shardId.toUpperCase().replace(/-/g, "_")}`;
}

export interface Env {
  readonly DIRECTORY: Db;
  readonly [binding: string]: unknown;
}

export function shardFor(env: Env, shardId: string): Db {
  const binding = bindingFor(shardId);
  const db = env[binding];
  if (!db) {
    throw new Error(
      `the directory places tenants on "${shardId}" and this deployment has no ${binding} binding`);
  }
  return db as Db;
}

/**
 * ⚠️ ASKED AT BOOT RATHER THAN AT THE FIRST REQUEST FOR AN UNLUCKY TENANT. A
 * missing binding is a deployment mistake, and the difference between finding it
 * on deploy and finding it when one customer signs in is the difference between
 * a rollback and an incident.
 */
export const unbound = (env: Env, shardIds: readonly string[]): readonly string[] =>
  shardIds.filter((id) => !env[bindingFor(id)]);

/* ------------------------------------------------------------- adoption --- */

/**
 * THE SHARDS THE RECONCILER BUILT, READY TO BE PLACED ON.
 *
 * ⚠️ THIS IS THE LAST LINK, AND WITHOUT IT THE LADDER ENDS IN A DATABASE NOBODY
 * USES. `apply` creates the D1 and patches the binding; `observe` sees it and
 * marks it live — and then nothing. A shard with no directory row is not in
 * `placeOn`'s list, so no workspace is ever put on it and the deployment goes on
 * refusing signups with the capacity it just paid for sitting empty beside it.
 *
 * ⚠️ AND ONLY WHAT THIS ISOLATE CAN SEE. A binding arrives with a new version of
 * the worker, so an isolate running the old one reads `undefined` — registering
 * from that would put a shard in the directory that `shardFor` throws on, for
 * every workspace `placeOn` then sends to it. `live` plus a visible binding is
 * the pair, and neither half is enough.
 */
export const grownShards = (
  made: readonly {
    readonly appId: string; readonly needId: string; readonly name: string;
    readonly binding: string; readonly residency: string | null; readonly state: string;
  }[],
  env: Env,
): readonly { readonly id: string; readonly where: string }[] => {
  const at = "-shard-";
  return made
    .filter((r) => r.appId === "platform" && r.needId === "shard" && r.state === "live")
    .filter((r) => r.name.includes(at) && r.residency && env[r.binding])
    .map((r) => ({ id: r.name.slice(r.name.indexOf(at) + at.length), where: r.residency as string }))
    .filter((s) => s.id.length > 0);
};
