/**
 * THE ONLY CODE IN THIS REPOSITORY THAT TALKS TO THE CLOUDFLARE API.
 *
 * ⚠️ THIS FILE REVERSES A DECISION THAT WAS WRITTEN DOWN, AND THE REVERSAL NEEDS
 * ITS OWN ARGUMENT. `engine.yml` says, of the deploy workflow's account token:
 * "the worker gets neither… putting one in `env` would be handing every request
 * handler the account." That was correct while nothing needed to provision
 * anything. It stops being correct the moment a product can declare that it
 * needs a queue, because the alternative is a human editing a config file for
 * every app on every deployment — which is the infrastructure work this whole
 * framework exists to delete, and which is ALSO the thing that gets a residency
 * wrong at three in the morning.
 *
 * ⚠️ SO THE TOKEN IS REAL AND THE BLAST RADIUS IS NOT. Four things bound it, and
 * the third is the one that matters:
 *
 *   1. It is a WORKER SECRET, never a database row. A row is readable by
 *      anything that can read the database, and this credential can rewrite what
 *      the database IS.
 *   2. It is reachable from the operator door and the scheduled job, and from
 *      nowhere a tenant request can go.
 *   3. `patchBindings` REFUSES TO REPOINT A BINDING THAT ALREADY EXISTS. Without
 *      that, a leaked token is not "somebody can make an empty bucket" — it is
 *      one PATCH away from `DIRECTORY` addressing an attacker's database, every
 *      session and every workspace with it, and no error anywhere. With it, the
 *      worst case is spurious empty resources and a bill.
 *   4. Every call is audited before it is made, so a reconciliation nobody asked
 *      for is visible rather than inferred from a Cloudflare invoice.
 *
 * vocabulary-exempt-file(client): `client/v4` is Cloudflare's own API path. It is
 * the vendor's URL, not a noun this framework knows — and the alternative is
 * assembling the address out of fragments to satisfy a word search, which makes
 * the one string that must be exactly right harder to read.
 *
 * ⚠️ AND NOTHING HERE THROWS INTO A REQUEST. Every call answers a discriminated
 * result. A provider that is down must degrade to "this has not been made yet",
 * which is a state the ladder already has — not a 500 on a screen that was
 * asking about something else.
 */

import type { Residency, ResourceKind } from "@engine/kernel";

const API = "https://api.cloudflare.com/client/v4";

/* ------------------------------------------------------------------ shape --- */

export interface Account {
  readonly accountId: string;
  /** ⚠️ A worker secret. See the header — never a column. */
  readonly token: string;
  /** The worker whose bindings are edited. Its own name. */
  readonly script: string;
  /** Injected so the suites can drive this without reaching the network. */
  readonly fetch?: typeof fetch;
}

export type Answer<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly why: string };

const no = (why: string): Answer<never> => ({ ok: false, why });
const yes = <T>(value: T): Answer<T> => ({ ok: true, value });

/** What a binding looks like on the wire. */
export interface WireBinding {
  readonly type: string;
  readonly name: string;
  readonly [key: string]: unknown;
}

/* ------------------------------------------------------------------- call --- */

interface Result<T> { success: boolean; errors?: { message: string }[]; result?: T }

async function call<T>(
  at: Account, method: string, path: string, body?: unknown,
): Promise<Answer<T>> {
  const go = at.fetch ?? fetch;
  let res: Response;
  try {
    res = await go(`${API}/accounts/${at.accountId}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${at.token}`,
        ...(body instanceof FormData ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
    });
  } catch (why) {
    /* ⚠️ A NETWORK FAILURE IS NOT A MISSING RESOURCE. Reporting it as "nothing
       there" is what makes a reconciler create a second copy of everything the
       moment the API has a bad minute. */
    return no(`could not reach Cloudflare: ${String(why)}`);
  }

  let said: Result<T>;
  try { said = await res.json() as Result<T>; } catch { return no(`${method} ${path}: ${res.status}`); }
  if (!said.success) {
    return no(said.errors?.map((e) => e.message).join("; ") || `${method} ${path}: ${res.status}`);
  }
  return yes(said.result as T);
}

/* -------------------------------------------------------------- resources --- */

export interface Remote { readonly id: string; readonly name: string }

/**
 * ⚠️ LIST BEFORE CREATE, ALWAYS, AND A FAILED LIST STOPS THE PASS. `d1 create`
 * succeeds under any name it has not seen — so creating on the basis of a list
 * that ERRORED makes a second, empty database with the same purpose, and every
 * request then succeeds against nothing while the real rows sit in the first.
 * The same is true of every kind below.
 */
export async function listRemote(at: Account, kind: ResourceKind): Promise<Answer<readonly Remote[]>> {
  switch (kind) {
    case "d1": {
      const out = await call<{ uuid: string; name: string }[]>(at, "GET", `/d1/database?per_page=1000`);
      return out.ok ? yes(out.value.map((r) => ({ id: r.uuid, name: r.name }))) : out;
    }
    case "kv": {
      const out = await call<{ id: string; title: string }[]>(at, "GET", `/storage/kv/namespaces?per_page=1000`);
      return out.ok ? yes(out.value.map((r) => ({ id: r.id, name: r.title }))) : out;
    }
    case "r2": {
      const out = await call<{ buckets: { name: string }[] }>(at, "GET", `/r2/buckets?per_page=1000`);
      return out.ok ? yes(out.value.buckets.map((r) => ({ id: r.name, name: r.name }))) : out;
    }
    case "queue": {
      const out = await call<{ queue_id: string; queue_name: string }[]>(at, "GET", `/queues?per_page=1000`);
      return out.ok ? yes(out.value.map((r) => ({ id: r.queue_id, name: r.queue_name }))) : out;
    }
    default:
      /* ⚠️ `ai` and `do` ARE NOT CREATED — see `IS_CREATED`. An empty list would
         read as "none exist yet" and send the reconciler off to make one. */
      return no(`${kind} is not a resource anything creates`);
  }
}

/**
 * ⚠️ THE JURISDICTION IS SET HERE AND CAN NEVER BE SET AGAIN. Cloudflare fixes
 * it at creation for both D1 and R2 — there is no edit, no migration and no
 * support ticket. Getting it wrong means the records are in the wrong regime
 * until somebody copies them to a new database, so this is the one field in this
 * file whose mistake is not recoverable in place.
 *
 * ⚠️ AND `global` MUST NOT BECOME `"global"` ON THE WIRE. It is our word for
 * "the deployment's default region, promised as nothing narrower"; Cloudflare
 * has no such jurisdiction, and sending it would be refused — or worse, honoured
 * as a typo'd region somewhere nobody chose.
 */
export async function create(
  at: Account, kind: ResourceKind, name: string, where: Residency | null,
): Promise<Answer<Remote>> {
  const eu = where === "eu";
  switch (kind) {
    case "d1": {
      const out = await call<{ uuid: string; name: string }>(at, "POST", `/d1/database`,
        { name, ...(eu ? { jurisdiction: "eu" } : {}) });
      return out.ok ? yes({ id: out.value.uuid, name: out.value.name }) : out;
    }
    case "kv": {
      const out = await call<{ id: string; title: string }>(at, "POST", `/storage/kv/namespaces`,
        { title: name });
      return out.ok ? yes({ id: out.value.id, name: out.value.title }) : out;
    }
    case "r2": {
      /* R2 takes its jurisdiction as a HEADER rather than a field, which is the
         kind of asymmetry that gets missed — hence the explicit branch. */
      const go = at.fetch ?? fetch;
      const res = await go(`${API}/accounts/${at.accountId}/r2/buckets`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${at.token}`, "content-type": "application/json",
          ...(eu ? { "cf-r2-jurisdiction": "eu" } : {}),
        },
        body: JSON.stringify({ name }),
      }).catch(() => null);
      if (!res) return no("could not reach Cloudflare");
      const said = await res.json().catch(() => null) as Result<{ name: string }> | null;
      if (!said?.success) return no(said?.errors?.map((e) => e.message).join("; ") ?? `r2: ${res.status}`);
      return yes({ id: name, name });
    }
    case "queue": {
      const out = await call<{ queue_id: string; queue_name: string }>(at, "POST", `/queues`,
        { queue_name: name });
      return out.ok ? yes({ id: out.value.queue_id, name: out.value.queue_name }) : out;
    }
    default:
      return no(`${kind} is not a resource anything creates`);
  }
}

/** ⚠️ Only ever called by the reaper, and only past the drain window. */
export async function destroy(
  at: Account, kind: ResourceKind, remoteId: string,
): Promise<Answer<true>> {
  const path = kind === "d1" ? `/d1/database/${remoteId}`
    : kind === "kv" ? `/storage/kv/namespaces/${remoteId}`
      : kind === "r2" ? `/r2/buckets/${remoteId}`
        : kind === "queue" ? `/queues/${remoteId}`
          : null;
  if (!path) return no(`${kind} is not a resource anything creates`);
  const out = await call<unknown>(at, "DELETE", path);
  return out.ok ? yes(true) : out;
}

/* --------------------------------------------------------------- bindings --- */

/**
 * ⚠️ THE BINDINGS A WORKER ALREADY HAS, READ BEFORE ANY ARE WRITTEN. The PATCH
 * below replaces the whole array, so writing a computed set without reading the
 * current one first does not ADD a binding — it removes every binding the
 * computation did not know about, `DIRECTORY` included.
 */
export async function bindings(at: Account): Promise<Answer<readonly WireBinding[]>> {
  const out = await call<{ bindings?: WireBinding[] }>(
    at, "GET", `/workers/scripts/${at.script}/settings`);
  return out.ok ? yes(out.value.bindings ?? []) : out;
}

/**
 * ⚠️ THE BINDINGS THAT MUST NEVER BE REPOINTED BY THIS PATH. Repointing
 * `DIRECTORY` moves every account, session and workspace record to a database
 * somebody else chose; repointing `ASSETS` serves somebody else's page from our
 * origin, cookies and all. Neither is a thing a reconciler has any reason to do,
 * so the refusal costs nothing and removes the only catastrophic use of the
 * token.
 *
 * ⚠️ SHARDS ARE PROTECTED BY THE RULE BELOW RATHER THAN BY NAME: nothing that
 * already exists may be changed, only added. That covers every shard this
 * deployment has now and every one it gains, without a list to keep in step.
 */
export const NEVER_REPOINTED: readonly string[] = ["DIRECTORY", "ASSETS"];

export type PatchRefusal =
  | { readonly ok: false; readonly why: string; readonly repointed?: readonly string[] };

/**
 * ADD BINDINGS TO THE RUNNING WORKER, WITHOUT TOUCHING ITS CODE.
 *
 * ⚠️ THIS IS AN ADD-ONLY MERGE AND THE REFUSAL IS THE POINT. `wanted` is merged
 * over what is already there; if a wanted binding shares a name with an existing
 * one and differs in any way, the whole patch is refused and nothing is sent.
 * That single rule is what makes the token's worst case "an empty bucket and a
 * bill" instead of "the directory now belongs to somebody else".
 *
 * ⚠️ AND IT PRODUCES A NEW VERSION, WHICH THE CALLER IS NOT RUNNING. The isolate
 * that makes this call cannot see the binding it just added, and neither can any
 * isolate already serving. Nothing may be marked usable here — see
 * `ResourceState`, where `bound` and `live` are deliberately different rungs.
 */
export async function patchBindings(
  at: Account, wanted: readonly WireBinding[],
): Promise<Answer<{ readonly added: readonly string[] }>> {
  const current = await bindings(at);
  if (!current.ok) return current;

  const have = new Map(current.value.map((b) => [b.name, b]));
  const repointed: string[] = [];
  const added: string[] = [];

  for (const b of wanted) {
    const already = have.get(b.name);
    if (!already) { added.push(b.name); continue; }
    if (JSON.stringify(already) !== JSON.stringify({ ...already, ...b })) repointed.push(b.name);
  }
  for (const name of NEVER_REPOINTED) {
    if (wanted.some((b) => b.name === name) && !repointed.includes(name)) {
      /* Named explicitly even when identical: nothing here has a reason to send
         one, and an unexplained one is the shape of an attempt. */
      repointed.push(name);
    }
  }
  if (repointed.length) {
    return { ok: false, why: `refused: this would repoint ${repointed.join(", ")} — `
      + `bindings are added here and never changed`, repointed } as PatchRefusal as Answer<never>;
  }
  if (!added.length) return yes({ added: [] });

  /* ⚠️ THE FULL SET, because the endpoint replaces rather than merges. */
  const body = new FormData();
  body.append("settings", JSON.stringify({ bindings: [...current.value, ...wanted] }));
  const out = await call<unknown>(at, "PATCH", `/workers/scripts/${at.script}/settings`, body);
  return out.ok ? yes({ added }) : out;
}

/**
 * ⚠️ WHAT A TOKEN CAN ACTUALLY DO, ASKED RATHER THAN ASSUMED. An operator who
 * pasted a token with D1 but not Queues gets a reconciler that half works and
 * reports the other half as a provider outage. One call at the top of the
 * console says which permission is missing, by name.
 */
export async function verify(at: Account): Promise<Answer<{ readonly can: readonly ResourceKind[] }>> {
  const can: ResourceKind[] = [];
  for (const kind of ["d1", "kv", "r2", "queue"] as const) {
    if ((await listRemote(at, kind)).ok) can.push(kind);
  }
  const script = await bindings(at);
  if (!can.length && !script.ok) return no("this token can read nothing — check it is for the right account");
  return yes({ can: script.ok ? [...can, "ai" as const, "do" as const] : can });
}
