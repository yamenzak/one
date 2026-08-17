/**
 * ONE — THE DEPLOYMENT.
 *
 * ⚠️ ONE WORKER ANSWERS EVERY DOOR FOR EVERY PRODUCT (D3), and this file is the
 * whole of it. Adding a product is a line in `APPS` below and a row in a
 * database — no worker, no domain binding, no provisioning workflow, no secret.
 * The previous platform needed four YAML edits, a registry entry and a workflow
 * run per product, and that machinery existed only because resources were
 * per-app.
 *
 * ⚠️ AND THE WIRING IS THE INTERESTING PART, BECAUSE THERE IS SO LITTLE OF IT.
 * Everything below is a value handed to `serve`: which apps exist, where the
 * records are, who is asking, whether this deployment can take a payment. A
 * deployment that assembled any of it differently would be one where a gate
 * quietly reads something else — which is why `locator` is one function rather
 * than six lookups each caller does for itself.
 */

import type {
  AccountId, AppSpec, DeploymentLegal, Door, PlanSpec, Residency, TenantId,
} from "@engine/kernel";
import { MEDIA_NEED, subProcessor, under } from "@engine/kernel";
import {
  DIRECTORY_MODULES, SHARD_MODULES,
  NOBODY, accountOfToken, addShard, applySchema, appsOfTenant, bearerFrom, acceptanceScope,
  liveAppsOfTenant,
  deploymentFaults, isPlatformPath, locator,
  accept, bindingKey, liveBindings, memberFor, noteShardApp, observe, owedBy, sweep,
  tenantById, tenantBySlug,
  applyEvent, markCancelled, markPaid, markPastDue, stripeKey, subscribe, verifySignature, renewAllowance,
  webhookSecret,
  operatorOps, permissionsResolver, personalOps, pusherOver, schemaFor, sendMail, serve,
  sessionIdFrom, shardFor, subscriptionFor, whoIs,
  type Bucket, type Db, type TenantRow,
} from "@engine/runtime";
import { hello } from "@engine/hello";

/* ------------------------------------------------------------------ what --- */

/**
 * ⚠️ BUILT AT MOST ONCE, AND NOT UNTIL SOMETHING ASKS. Both halves are the
 * point. Lazy is D4 — a request composes the app it is for and no other, so the
 * catalogue can grow without every cold start paying for it. Once is what makes
 * a manifest a THING rather than a description of one: the composed surface is
 * memoised against the declaration itself, so a thunk that rebuilt it per call
 * would rebuild the whole surface behind it on every request.
 */
const once = (make: () => AppSpec): (() => AppSpec) => {
  let held: AppSpec | null = null;
  return () => (held ??= make());
};

/** The products this deployment serves. */
const APPS: Readonly<Record<string, () => AppSpec>> = {
  /* ⚠️ `under` IS WHERE EVERY PRODUCT INHERITS THE DEPLOYMENT'S SUB-PROCESSORS.
     The database, the bucket and the runtime are the same vendor behind all of
     them; declared per app it is one chance per product to forget, and the
     recipient nobody disclosed is the disclosure failure that gets found from
     outside. See `under`. */
  hello: once(() => under(LEGAL, hello())),
};

/**
 * ONE MEMBERSHIP — WHAT THIS DEPLOYMENT SELLS, IN ONE LIST.
 *
 * ⚠️ THE PLANS ARE THE DEPLOYMENT'S, NOT A PRODUCT'S, and the limits are the
 * argument. Seats, storage and the wallet are one roster, one bucket and one
 * balance — a per-product plan has to answer "which app does this gigabyte
 * belong to" and there is no honest answer. Apps declare entitlement KEYS; this
 * list sets their VALUES, and `refuseCatalog` fails the build if any plan is
 * silent about a key any app declares.
 *
 * ⚠️ AND BUSINESS IS A TIER RATHER THAN AN ADD-ON. `mayBrand` and `mayIsolate`
 * already gate on the workspace's KIND, so pricing on the kind means the gate
 * and the price agree by construction. A "commercial" entitlement beside them
 * would be a second answer that can disagree with the first — and the kind is
 * one-way (D21), so the two could never be reconciled after they did.
 *
 * ⚠️ THE LOBBY IS NOT A FREE TIER. `none` is where a workspace sits before it
 * ever paid, after a trial ends and after it cancels. It is unsellable, costs
 * nothing, and exists so that "your trial ended" means "read and export your
 * records, and here is how to pay" rather than a locked door. With no free tier
 * it matters MORE, not less.
 *
 * ⚠️ AND STORAGE IS WHERE THE INCLUDED AMOUNT ENDS, NOT A CEILING. Above it the
 * meter draws on the wallet, so there is no cliff between tiers and no "contact
 * us" — a seat and a client are things somebody adds deliberately, so refusing
 * is fair, while storage accumulates as a side effect of ordinary work.
 */
const GB = 1024 * 1024 * 1024;

const PLANS: readonly PlanSpec[] = [
  {
    id: "none", name: "No plan", kind: "personal", order: 0, parking: true,
    said: "Read and export what is here. Nothing new can be added.",
    price: 0, currency: "USD", credits: 0,
    includes: { seats: 1, storage: GB, domains: 0, notes: 0, publishing: false },
  },
  {
    id: "solo", name: "Solo", kind: "personal", order: 1, trialDays: 14,
    said: "One person, everything we make.",
    price: 1200, currency: "USD", credits: 1_500,
    includes: { seats: 1, storage: 10 * GB, domains: 0, notes: -1, publishing: true },
  },
  {
    id: "plus", name: "Plus", kind: "personal", order: 2, trialDays: 14,
    said: "Room to work, and somebody beside you.",
    price: 2500, currency: "USD", credits: 4_000,
    includes: { seats: 2, storage: 50 * GB, domains: 0, notes: -1, publishing: true },
  },
  {
    id: "studio", name: "Studio", kind: "commercial", order: 3, trialDays: 14,
    said: "A business: your own name on it, your own address, your own database.",
    price: 4900, currency: "USD", credits: 7_500,
    includes: { seats: 5, storage: 250 * GB, domains: 1, notes: -1, publishing: true },
  },
  {
    id: "company", name: "Company", kind: "commercial", order: 4, trialDays: 14,
    said: "A team, and the room a team needs.",
    price: 19900, currency: "USD", credits: 40_000,
    includes: { seats: 25, storage: 2048 * GB, domains: 3, notes: -1, publishing: true },
  },
];

/**
 * ⚠️ THE SHARDS THIS DEPLOYMENT PLACES ON, NAMED ONCE. `addShard` registers them
 * and `deploymentFaults` checks each has a binding behind it, and two lists
 * would let a shard be registered and unchecked — which is precisely the state
 * whoever signed in first would discover.
 */
const SHARDS = [{ id: "eu-1", where: "eu" }] as const satisfies
  readonly { id: string; where: Residency }[];

/**
 * ⚠️ DERIVED, BECAUSE A SHARD *IS* A JURISDICTION. This was a second list beside
 * `SHARDS` — and two parallel lists is the pattern this repository keeps having
 * to fix: a shard added to one and forgotten in the other reports the wrong
 * residency for every workspace on it, which decides whether a queue carrying
 * somebody's name is a broken promise or an ordinary queue.
 */
const SHARD_RESIDENCY: readonly Residency[] = [...new Set(SHARDS.map((s) => s.where))];

/** Which jurisdiction one shard is in. One lookup, one source. */
const residencyOf = (shardId: string): Residency | undefined =>
  SHARDS.find((s) => s.id === shardId)?.where;

/**
 * ⚠️ THE SERVICE BINDINGS SOMETHING ACTUALLY REACHES. Empty is the honest answer
 * today: the AI lane and the notify lane are built and mounted nowhere (stages
 * 27 and 28), so a deployment that binds `AI` is paying for a provider no route
 * can call. Saying so at boot is the difference between finding that in a
 * fifteen-minute read and finding it on an invoice.
 */
const SERVICES_REACHED: readonly string[] = [];

/* ⚠️ THE PLATFORM'S OWN TABLES ARE `@engine/runtime`'S TO LIST, NOT THIS FILE'S.
   Nine copies of that list had drifted — see `platform-schema.ts`. */

/**
 * ⚠️ WHAT THIS DEPLOYMENT PROMISES, AND IT IS THE DEPLOYMENT'S RATHER THAN A
 * PRODUCT'S. One company, one contract, one description of what happens to
 * somebody's data — a person opening the second product here does not sign a
 * second agreement, and four products with four privacy notices is either four
 * copies of one or four that disagree.
 *
 * ⚠️ THE VERSION IS A DAY, AND MOVING IT ASKS EVERYBODY AGAIN. That is the
 * feature: editing the wording without moving it records everybody who agreed
 * to the old text as having agreed to the new, which is a record that is
 * confidently wrong rather than merely absent.
 *
 * ⚠️ AND `binds` IS WHEN IT IS ASKED. `person` is every human at their first
 * sign-in; `tenant` is whoever creates a workspace, on its behalf. An app may
 * add its own, and those bind where that app is enabled.
 */
const LEGAL: DeploymentLegal = {
  documents: {
    terms: {
      id: "terms", kind: "terms", title: "Terms of use",
      version: "2026-08-17" as never, mustAccept: true, binds: "person",
      url: "/legal/terms",
    },
    privacy: {
      id: "privacy", kind: "privacy", title: "Privacy notice",
      version: "2026-08-17" as never, mustAccept: true, binds: "person",
      url: "/legal/privacy",
    },
    /* ⚠️ THE BUSINESS ONE IS BOUND BY WHOEVER CREATES THE WORKSPACE, not by
       everybody in it. A colleague invited into a workspace agreed to the terms
       as a person; they did not sign the data-processing agreement, and asking
       them to would be asking somebody to bind a company they do not run. */
    dpa: {
      id: "dpa", kind: "dpa", title: "Data processing agreement",
      version: "2026-08-17" as never, mustAccept: true, binds: "tenant",
      url: "/legal/dpa",
    },
  },
  /*
    ⚠️ THE BASE EVERY PRODUCT HERE INHERITS. The records are in D1, the objects
    in R2 and the code in Workers — all one vendor, true of every app on this
    deployment whether or not anybody writes it down. An app adds only what is
    genuinely its own.
  */
  processors: {
    cloudflare: subProcessor({
      id: "cloudflare", name: "Cloudflare, Inc.", country: "US",
      role: "Runs the application and stores its records and files.",
      receives: ["none", "sensitive"],
      url: "https://www.cloudflare.com/trust-hub/gdpr/",
    }),
  },
};

export interface Env {
  readonly DIRECTORY: D1Database;
  readonly SHARD_EU_1: D1Database;
  /** The SPA. Served for everything that is not `/api/*` — see `fetch`. */
  readonly ASSETS: { fetch(request: Request): Promise<Response> };
  readonly ROOT: string;
  readonly ENVIRONMENT: string;
  readonly AUTH_SECRET: string;
  /**
   * ⚠️ WHO MAY OPEN THE OPERATOR CONSOLE — comma-separated addresses. Empty in
   * development means the signed-in developer; empty anywhere else means the
   * console admits NOBODY, which is the honest reading of "unconfigured".
   */
  readonly OPERATOR_EMAILS?: string;
  /**
   * ⚠️ THE VAULT'S OWN SECRET, AND ROTATING IT IS DATA LOSS. Every vault fact's
   * key is derived from this and the subject's salt, so a new value does not
   * re-encrypt anything — it makes every fact already stored undecryptable, with
   * no error until somebody reads one. It is deliberately NOT `AUTH_SECRET`,
   * which is rotated as ordinary hygiene: one name for both would have turned a
   * routine security action into the silent loss of every health record on the
   * deployment.
   *
   * ⚠️ ABSENT IS A REFUSAL, NOT A FALLBACK. With no secret an app declaring a
   * special category cannot write one, and the write says so — see `VaultSeam`.
   */
  readonly VAULT_SECRET?: string;
  /**
   * ⚠️ WHAT A STORED CREDENTIAL IS ENCRYPTED UNDER — see `config.ts`. Absent is
   * a deployment that can hold an address and cannot hold a key: the console
   * says so, and every lane behind one stays off rather than running on a value
   * this database would have held in the clear.
   *
   * ⚠️ AND IT IS NOT `VAULT_SECRET`. Rotating this one costs a re-paste of the
   * credentials; rotating that one is the silent loss of every health record on
   * the deployment. One name for both would make an ordinary security action a
   * catastrophe — which is the same argument that split it from `AUTH_SECRET`.
   */
  readonly CONFIG_SECRET?: string;
  /**
   * ⚠️ CLOUDFLARE'S OWN SEND BINDING, AND ITS ABSENCE IS A REFUSAL. A deployment
   * without it cannot send, so it says so rather than answering "check your
   * email" over nothing — see `mail.ts`.
   */
  readonly SEND_EMAIL?: { send(message: unknown): Promise<void> };
  /**
   * ⚠️ THE ACCOUNT TOKEN, AND IT IS A WORKER SECRET RATHER THAN A ROW ON
   * PURPOSE. It can create and destroy this deployment's databases and edit the
   * worker's own bindings; a row holding it is readable by anything that can
   * read the database, and this credential can rewrite what the database IS.
   *
   * ⚠️ SCOPE IT. D1:Edit, Workers KV:Edit, Workers R2:Edit, Queues:Edit and
   * Workers Scripts:Edit are the whole surface `cloudflare.ts` uses. An
   * account-wide token buys nothing here and loses everything if it leaks.
   *
   * ⚠️ ABSENT IS A WORKING DEPLOYMENT. Every declared need stays `wanted`, every
   * capability behind one reads as absent, and nothing fails — which is exactly
   * what a self-host and every test run are.
   */
  readonly CF_API_TOKEN?: string;
  readonly CF_ACCOUNT_ID?: string;
  readonly [binding: string]: unknown;
}

/* ------------------------------------------------------------------ boot --- */

/**
 * ⚠️ THE SCHEMA IS APPLIED ONCE PER ISOLATE, NOT PER REQUEST. It is stamped with
 * a hash of itself, so the second call is a single `SELECT` — but doing that on
 * every request would still put a round trip in front of every read for no
 * possible finding.
 *
 * ⚠️ AND IT IS AWAITED RATHER THAN FIRED. A request served while the tables are
 * still being created answers "no such table" to whoever happened to be first,
 * which is a fault that appears exactly once per deploy and never reproduces.
 */
let booted: Promise<void> | null = null;

/**
 * ⚠️ THE LIVE BINDINGS, RESOLVED ONCE PER ISOLATE — and that is correct rather
 * than merely quick. A binding cannot appear or change without a new version of
 * the worker, and a new version is a new isolate, so this map is exactly as
 * fresh as `env` for as long as it exists. Re-reading it per request would put a
 * directory round trip in front of every upload to learn something that cannot
 * have changed.
 */
let live: ReadonlyMap<string, unknown> = new Map();

/**
 * THE BUCKET FOR A WORKSPACE'S JURISDICTION.
 *
 * ⚠️ THE RESIDENCY IS IN THE ADDRESSING, WHICH IS THE WHOLE SAFETY PROPERTY. An
 * EU workspace resolves the EU bucket because its residency is part of the
 * binding's name — so there is no comparison anybody can forget, and a lookup
 * that would land in the wrong regime MISSES rather than serving quietly from
 * it. A miss reads as "this deployment stores no files", which every caller
 * already refuses on.
 *
 * ⚠️ AND IT IS MODULE-LEVEL BECAUSE BOTH LANES NEED IT. The request handler
 * resolves a workspace's bucket; the nightly sweep resolves one to erase its
 * objects. Two copies is two chances for one of them to drop the residency.
 */
const bucketIn = (residency: string | undefined): Bucket | null => {
  for (const appId of Object.keys(APPS)) {
    /* ⚠️ THE EXACT KEY, WITH NO FALLBACK ACROSS JURISDICTIONS. A fallback is
       what turns "we have no bucket here" into "here is one from somewhere
       else" — and the second is a file in the wrong regime that nothing
       reports. A miss is the honest answer, and every caller refuses on it. */
    const held = live.get(bindingKey(appId, MEDIA_NEED, residency ?? null));
    if (held) return held as Bucket;
  }
  return null;
};

/**
 * ⚠️ A DEPLOYMENT WITH NO SIGNING SECRET MUST NOT SERVE. Without it every
 * sign-in code is signed with `undefined` — which is a constant, and a constant
 * anybody reading this repository already has, so the codes are forgeable and
 * nothing anywhere looks wrong. Refusing is loud; the alternative is an
 * authentication system that appears to work.
 *
 * ⚠️ AND IT IS CHECKED AT BOOT RATHER THAN AT THE SIGN-IN ROUTE. A check on the
 * route leaves `/health` answering 200 on a deployment that cannot safely sign
 * anybody in, which is the reverse of what a probe is for.
 */
const REQUIRED: readonly (keyof Env & string)[] = ["ROOT", "AUTH_SECRET"];

/**
 * ⚠️ CHECKED ON EVERY REQUEST, NOT ONCE — and the cost of that is two string
 * reads, against an invariant whose absence is forgeable sign-in codes. Folded
 * into the memoised boot below it becomes order-dependent: whichever
 * configuration reached the isolate first decides for every request after it,
 * and the check is then something that has already happened rather than
 * something that is true.
 */
const missingConfig = (env: Env): readonly string[] =>
  REQUIRED.filter((key) => !String(env[key] ?? "").trim());

const boot = (env: Env): Promise<void> => {
  booted ??= (async () => {
    const directory = env.DIRECTORY as unknown as Db;
    await applySchema(directory, DIRECTORY_MODULES);
    /*
      ⚠️ EVERY SHARD IN `SHARDS`, NOT ONE NAMED BINDING. This read
      `env.SHARD_EU_1` while `SHARDS` drove registration, so the second shard
      would have been registered, placed on, and never migrated — and the fault
      is not an error anywhere: `placeOn` picks the emptiest eligible shard, so
      the FIRST new workspace lands on it and every request it makes answers
      "no such table". One list, walked.
    */
    for (const { id } of SHARDS) {
      await applySchema(shardFor(env as never, id), [
        ...Object.values(APPS).map((make) => schemaFor(make())),
        ...SHARD_MODULES,
      ]);
    }
    /*
      ⚠️ THE SHARD THIS DEPLOYMENT BINDS IS DECLARED AT BOOT, IDEMPOTENTLY. The
      directory places every new workspace on a registered shard — with no row,
      creating one answers "nowhere to put it" on a deployment whose database
      is RIGHT THERE, bound and migrated. Both writes are upserts, so a
      thousand cold starts write what one did.
    */
    for (const { id, where } of SHARDS) await addShard(directory, id, where, 10_000);
    for (const { id: shard } of SHARDS) {
      for (const id of Object.keys(APPS)) await noteShardApp(directory, shard, id as never);
    }

    /*
      ⚠️ AND THEN WHAT IS WRONG WITH THE DEPLOYMENT, SAID ONCE PER ISOLATE. Every
      fault `deploymentFaults` reports is one a customer would otherwise find:
      a shard placed on and not bound, a collection erasure cannot reach, a
      provider bound and never called.

      ⚠️ LOGGED RATHER THAN REFUSED, AND THAT IS THE DECISION. None of them is
      wrong for EVERY request — a spare binding costs money and breaks nothing,
      and an unbound shard is fatal only for workspaces placed there. Refusing to
      boot over any of them would take a serving deployment down to report a
      cost. What must not happen is silence, and that is what this ends.
    */
    /*
      ⚠️ AND WHAT THE LAST RECONCILIATION ASKED FOR, CONFIRMED BY AN ISOLATE THAT
      CAN ACTUALLY SEE IT. A binding is added by a PATCH that produces a new
      version, so the isolate that asked cannot observe its own request landing;
      this one is running that version. Nothing else in the system knows the
      difference between "we asked for it" and "it is there".
    */
    for (const said of await observe(directory, env)) console.log(`[boot] ${said}`);
    live = await liveBindings(directory, env);

    for (const fault of deploymentFaults({
      env,
      shards: SHARDS.map((s) => s.id),
      apps: Object.values(APPS).map((make) => make()),
      plans: PLANS,
      used: SERVICES_REACHED,
      /* ⚠️ EVERYTHING THIS DEPLOYMENT APPLIES, so "is every table in the erasure
         ledger" is asked of what actually exists here rather than of the
         runtime's own modules alone. */
      modules: [
        ...DIRECTORY_MODULES, ...SHARD_MODULES,
        ...Object.values(APPS).map((make) => schemaFor(make())),
      ],
      /* ⚠️ Asked of the DEPLOYMENT, once — see `missingDocuments`. */
      legal: LEGAL,
    })) console.error(`[boot] ${fault}`);
  })();
  return booted;
};

/* ----------------------------------------------------------------- wiring --- */

const handler = (env: Env) => {
  const directory = env.DIRECTORY as unknown as Db;
  const shardOf = (tenant: TenantRow) => shardFor(env as never, tenant.shardId);

  /**
   * ⚠️ THE ONE PLACE `cloudflare:email` IS NAMED, and it is here because this is
   * where the binding is. `@engine/runtime` builds the message and hands over
   * three strings; constructing the platform's own envelope type inside the
   * package would make it unbuildable anywhere that sends nothing — which is
   * every unit test and every self-host.
   */
  const mailBinding = env.SEND_EMAIL
    ? {
      send: async (from: string, to: string, raw: string): Promise<void> => {
        const { EmailMessage } = await import("cloudflare:email");
        await env.SEND_EMAIL!.send(new EmailMessage(from, to, raw));
      },
    }
    : undefined;

  /**
   * ⚠️ THE BUCKET FOR THIS WORKSPACE'S JURISDICTION, AND THE RESIDENCY IS IN THE
   * ADDRESSING. An EU workspace resolves the EU bucket because its own residency
   * is part of the binding's name — there is no check to forget, and a workspace
   * cannot be served by a bucket in the wrong regime without the lookup missing
   * entirely, which reads as "no bucket" rather than as the wrong one.
   *
   * ⚠️ NULL IS AN ANSWER. A deployment whose bucket the reconciler has not made
   * live yet stores no files, and every caller already treats that as a refusal
   * rather than a crash.
   */
  const bucketOf = (where: { readonly residency?: string }) => bucketIn(where.residency);

  /*
    ⚠️ WHO RUNS THE DEPLOYMENT, DECIDED ONCE. The console is behind it and the
    OneSpace draws the operator's place from it, and two copies of this rule is how
    a place gets drawn over a console that then refuses every call. The
    development fallback admits the signed-in developer and NOBODY in
    production — an empty allow-list on a live deployment is unconfigured, not
    open.
  */
  const isOperator = (email: string | null): boolean => {
    if (!email) return false;
    const listed = (env.OPERATOR_EMAILS ?? "")
      .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (listed.length) return listed.includes(email.toLowerCase());
    return env.ENVIRONMENT === "development";
  };

  /**
   * ⚠️ WHICH WORKSPACE THE PERSON IS STANDING IN FRONT OF, FROM THE HOST AND
   * NOTHING ELSE. The account centre and the setup door have none, and an
   * agreement asked there is the person's own.
   */
  const tenantAtDoor = async (door: Door): Promise<TenantId | null> =>
    door.kind === "tenant" && door.slug
      ? ((await tenantBySlug(directory, door.slug))?.id as TenantId | undefined) ?? null
      : null;

  /**
   * WHERE SOMEBODY IS, FOR THE PURPOSE OF AN AGREEMENT — resolved ONCE, and read
   * by both the wall and the screen in front of it.
   *
   * ⚠️ TWO RESOLUTIONS IS A WALL THAT REFUSES WHAT THE SCREEN NEVER OFFERED.
   * The gate asks "what is still owed" per request and the agreements screen
   * asks the same question to draw itself; if they disagree by one document,
   * the person presses everything they are shown and stays shut out with
   * nothing left to press.
   */
  const placeOf = async (accountId: AccountId, tenantId: TenantId | null) => {
    if (!tenantId) return {};
    const tenant = await tenantById(directory, tenantId);
    if (!tenant) return {};
    const member = await memberFor(shardOf(tenant), tenantId, accountId);
    /* ⚠️ Only what is ON is asked about: an agreement demanded for a product
       nobody can reach is a wall with nothing behind it. */
    const apps = await liveAppsOfTenant(directory, tenantId);
    return {
      tenantId,
      /* ⚠️ Only whoever runs the workspace is asked for the workspace's own
         agreement — see `owedBy`. */
      canBind: member?.platformRole === "owner",
      apps: Object.fromEntries(apps.map((id) => [id, APPS[id]?.().documents ?? {}] as const)),
    };
  };

  return serve({
    roots: { root: env.ROOT },
    apps: APPS,
    /*
      ⚠️ WHO WE ARE, FOR THE TILES THAT WEAR OUR MARK. A personal workspace is
      not trading under anybody's name, so it installs as ours — and there is no
      honest way to draw that from a hostname, which is why a deployment that
      has not said serves no manifest at all rather than a plausible wrong one.
    */
    installable: { name: "One", mark: "◇" },
    directory,
    shardOf,
    bucketOf,

    /*
      ⚠️ PUSH IS WIRED ONLY WHERE THERE IS A KEYPAIR, AND THAT IS THE WHOLE
      SWITCH. `availableChannels` reads this binding, so an unconfigured
      deployment never OFFERS the channel — the switch is absent rather than
      present and inert, and a note is never dispatched to a lane that would
      throw into a swallowed catch and read as delivered.

      ⚠️ IT IS RESOLVED PER REQUEST RATHER THAN AT BOOT, because the keypair is
      made from the console while the worker is running. Memoised at boot, the
      operator would generate one, see the console report push as live, and find
      every isolate still answering "no push" until the next deploy.

      ⚠️ AND THE KEY LIVES IN THE DIRECTORY RATHER THAN IN A SECRET. A worker
      cannot write its own secrets, so the alternative is a private key an
      operator pastes into a form — through a clipboard, an autofill store and a
      request body. It sits beside the subscriptions it signs for, which are the
      sensitive half and are already there; alone it grants nothing.
    */
    plans: PLANS,
    pusher: pusherOver(directory),

    ...(env.CONFIG_SECRET ? { configSecret: env.CONFIG_SECRET } : {}),

    /*
      ⚠️ THE ONLY THING THAT STAMPS A PLAN. Nothing a caller can press writes a
      subscription row — a workspace that could would be one that grants itself
      what it has not paid for — so the ladder hangs off a SIGNED event and
      nothing else.

      ⚠️ AND THE REFUSALS ARE DIFFERENT STATUSES ON PURPOSE. A bad signature is
      400 and final: Stripe must not retry a forgery, and retrying would turn one
      bad request into hours of them. An unverifiable deployment — no secret
      stored — is 503, because that IS temporary and ours to fix, and a retry
      after we fix it is exactly what we want.
    */
    payments: {
      answer: async (raw, signature, at) => {
        const deps = {
          directory,
          ...(env.CONFIG_SECRET ? { configSecret: env.CONFIG_SECRET } : {}),
        };
        const secret = await webhookSecret(deps);
        const why = await verifySignature(secret, signature, raw, at);
        if (why === "no_secret") {
          return new Response(JSON.stringify({ refused: why }), {
            status: 503, headers: { "content-type": "application/json" },
          });
        }
        if (why) {
          return new Response(JSON.stringify({ refused: why }), {
            status: 400, headers: { "content-type": "application/json" },
          });
        }

        /* ⚠️ Parsed only AFTER the signature — see `verifySignature`. */
        const event = JSON.parse(raw) as Parameters<typeof applyEvent>[1];
        const did = await applyEvent(directory, event, {
          subscribe: (tenantId, appId, planId) =>
            subscribe(directory, tenantId, appId, planId, "active", at),
          /* ⚠️ A PAID INVOICE IS A PERIOD BEGINNING, so the month's allowance is
             set here and nowhere else. Granting it at checkout instead would
             give a workspace one month's credits and never a second. */
          paid: async (tenantId, appId) => {
            await markPaid(directory, tenantId, appId);
            await renewAllowance(directory, tenantId, PLANS, at);
          },
          pastDue: (tenantId, appId) => markPastDue(directory, tenantId, appId, at),
          cancelled: (tenantId, appId) => markCancelled(directory, tenantId, appId),
        }, at);

        /* ⚠️ 200 EVEN FOR A PARKED EVENT. Stripe cannot fix an attribution
           problem by sending the same bytes again, so a retry loop would be days
           of noise over a row somebody has to read either way. */
        return new Response(JSON.stringify(did), {
          status: 200, headers: { "content-type": "application/json" },
        });
      },
    },

    /*
      ⚠️ SENDING IS THE ONE THING A DEPLOYMENT MUST NOT FAKE. In development the
      code goes to the log, which is how the suites and a person on a laptop read
      it; anywhere else, a deployment with no mailer REFUSES to pretend it sent
      something — a sign-in that answers "check your email" with nothing sent is
      a product that appears to work and cannot be used.
    */
    personal: {
      ...personalOps({
        secret: env.AUTH_SECRET,
        appId: "hello",
        documents: LEGAL.documents,
        /* ⚠️ ASKED AT THE DOOR THE PERSON IS STANDING AT. On the account centre
           only what binds the PERSON is owed; at a workspace's own door the
           workspace's agreement and its apps' come with it — and it is the same
           resolution the gate uses, because two would be a wall that refuses
           what the screen never offered. */
        owed: async (ctx) => ctx.session
          ? owedBy(directory, ctx.session.accountId as never, LEGAL.documents,
            await placeOf(ctx.session.accountId as never, await tenantAtDoor(ctx.door)))
          : [],
        accept: async (ctx, document, version) => {
          if (!ctx.session) return;
          const def = LEGAL.documents[document];
          if (!def) return;
          /* ⚠️ THE SCOPE IS DERIVED, NEVER SENT. See `acceptanceScope`. */
          const where = acceptanceScope(def,
            await placeOf(ctx.session.accountId as never, await tenantAtDoor(ctx.door)));
          if (typeof where === "string") return where;
          await accept(directory, ctx.session.accountId as never, document, version,
            where, ctx.now);
        },
        deliver: async (to, code) => {
          const why = await sendMail({
            directory,
            ...(env.CONFIG_SECRET ? { configSecret: env.CONFIG_SECRET } : {}),
            ...(mailBinding ? { binding: mailBinding } : {}),
            environment: env.ENVIRONMENT,
          }, {
            to,
            subject: `${code} is your sign-in code`,
            /* ⚠️ THE CODE IS IN THE SUBJECT AS WELL AS THE BODY, because that is
               what a phone shows on the lock screen — and typing it from there
               is the whole journey for most people. */
            text: `${code}\n\nIt is good for a few minutes. If you did not ask to sign in, ignore this — nothing happens until the code is used.`,
          });
          /* ⚠️ A REFUSAL IS A THROW HERE, and the caller withdraws the code row
             it had already written. Answering "check your email" over a send
             that did not happen is the failure `mail.ts` exists to refuse, and
             leaving the row behind refuses the next attempt as "too often"
             while nothing was ever delivered. */
          if (why) throw new Error(`mail refused: ${why}`);
        },
        /* ⚠️ The same allow-list the console is behind (D18) — OneSpace draws
           the operator's place from this, and a place drawn over nothing is a
           promise the next screen takes back. */
        isOperator,
        /* ⚠️ Injected because the money tables are a module a deployment may
           not have applied — see `IdentityDeps`. Only a workspace that stopped
           paying carries a badge; one on every row is texture. */
        needsAttention: async (db, tenantId, appId) =>
          (await subscriptionFor(db, tenantId, appId))?.status === "past_due",
      }),
      /*
        ⚠️ THE OPERATOR OPERATIONS RIDE THE PERSONAL LANE, on the operator door
        only, with the deployment deciding who counts. The development fallback
        admits the signed-in developer and NOBODY in production — an empty
        allow-list on a live deployment is unconfigured, not open.
      */
      ...operatorOps({
        apps: APPS, isOperator, plans: PLANS,
      /* ⚠️ Absent is a deployment that can hold an address and not a key — the
         console says so, rather than offering a field that saves nothing. */
      ...(env.CONFIG_SECRET ? { configSecret: env.CONFIG_SECRET } : {}),
        deployment: "one",
        /* ⚠️ The address the VAPID subject is built from — a push service is
           entitled to reach somebody at it. */
        root: env.ROOT,
        serves: [...new Set(SHARD_RESIDENCY)],
        /*
          ⚠️ THE TOKEN COMES FROM `env` AND NEVER FROM A ROW, and this closure is
          the whole of its reach. It can create this deployment's databases and
          add bindings to this worker — so a copy in the directory would be a
          credential that can rewrite what the directory IS, readable by anything
          that can read it. Absent is a deployment that cannot provision, which
          the console reports rather than throwing over.
        */
        account: () => env.CF_API_TOKEN && env.CF_ACCOUNT_ID
          ? { accountId: env.CF_ACCOUNT_ID, token: env.CF_API_TOKEN, script: "one" }
          : null,
      }),
    },

    /*
      ⚠️ ONE FUNCTION FOR THE WHOLE RESOLUTION. The workspace, its shard, its
      standing, what its plan includes, what it has left to spend and what it has
      used — six questions with one right set of answers, every one of which
      feeds a gate.
    */
    locate: locator({
      directory,
      shardOf,
      plans: PLANS,
      appsOf: async (tenant) => {
        /* ⚠️ WHAT IS ON, NOT WHAT WAS EVER ON. This list becomes the composed
           surface, so a product switched off has to leave it — otherwise the
           switch changes a row and nothing else, and every one of its routes
           goes on answering. The placement question is the OTHER one, and it
           reads every app the workspace has ever had, because the tables and the
           records are still there. */
        const ids = await liveAppsOfTenant(directory, tenant.id);
        return ids.map((id) => APPS[id]?.()).filter((a): a is AppSpec => !!a);
      },
      /*
        ⚠️ THE KEY IN THE STORE, NOT AN ENV VAR, AND IT IS THE SAME KEY THE
        CHECKOUT USES. Two answers to "can this deployment charge" is a gate that
        holds a workspace read-only over an unpaid bill while nothing on the
        deployment could ever have taken the payment — or the reverse, which is
        worse: a live key and a gate that never fires.

        ⚠️ AND GATING "HAS NOT PAID" ON A DEPLOYMENT THAT CANNOT CHARGE strands
        every workspace over OUR misconfiguration. Fail closed on their
        non-payment, open on ours.
      */
      charging: async () => !!await stripeKey({
        directory,
        ...(env.CONFIG_SECRET ? { configSecret: env.CONFIG_SECRET } : {}),
      }),
    }),

    /*
      ⚠️ WHO IS ASKING COMES FROM THE SESSION AND THE WORKSPACE'S OWN ROSTER, and
      never from anything the request said about itself. Resolved per request, so
      a role taken away stops working immediately rather than at the next sign-in
      — which is exactly when it matters that it does.
    */
    ...(String(env.VAULT_SECRET ?? "").trim()
      ? { vaultSecret: String(env.VAULT_SECRET) }
      : {}),
    /*
      ⚠️ THE WALL, AND IT IS ASKED PER REQUEST. A person may agree in one tab
      while another is open, and a version may move under somebody mid-session —
      a value resolved at sign-in would let them work for hours against wording
      they never saw.
    */
    owed: async (who, located) => who.accountId
      ? owedBy(directory, who.accountId as never, LEGAL.documents,
        await placeOf(who.accountId as never, located.tenantId as never))
      : [],
    identify: async (request, located) => {
      /*
        ⚠️ TWO WAYS TO SAY WHO YOU ARE, ONE ANSWER TO WHAT YOU MAY DO. A person
        arrives with a session cookie; an agent arrives with a bearer token the
        account minted at the account centre. Both resolve to an ACCOUNT, and
        everything after — the membership, the roles, the permissions — is the
        workspace's own roster answering per request, identically. A token
        never carries `provenAt`: anything a machine can hold must not satisfy
        the `recent` proof gate, which exists against exactly that.
      */
      const now = new Date();
      const bearer = bearerFrom(request);
      const viaToken = bearer ? await accountOfToken(directory, bearer, env.AUTH_SECRET, now) : null;
      const { session, email, accountId: viaSession } = viaToken
        ? { session: null, email: null, accountId: null }
        : await whoIs(directory, sessionIdFrom(request), now);

      const accountId = viaToken ?? viaSession;
      if (!accountId) return NOBODY;
      const member = await memberFor(located.db, located.tenantId as never, accountId);
      return {
        accountId,
        email,
        signedIn: true,
        provenAt: session?.provenAt ?? null,
        /* ⚠️ Per app (D15) — the flat set this replaced was resolved against
           `located.apps[0]`, so a role in the second product granted nothing. */
        permissionsIn: permissionsResolver(located.db, located.tenantId as never, member,
          (appId) => APPS[appId]?.().access.roles ?? null, now),
      };
    },
  });
};

/* ------------------------------------------------------------------ fetch --- */

/** ⚠️ The reason goes to the log, where the operator is. The request gets a
    status a probe can act on and nothing about our configuration. */
const unavailable = (): Response =>
  new Response(
    JSON.stringify({ problem: { code: "platform.unavailable", title: "One is not configured" } }),
    { status: 503, headers: { "content-type": "application/json; charset=utf-8" } },
  );

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    /*
      ⚠️ A DEPLOYMENT THAT CANNOT START SAYS SO ON EVERY PATH, `/health`
      INCLUDED. Letting the throw escape answers 500 with no body — which is
      what a previous platform did for a day behind a green deploy workflow,
      while the page still loaded because static assets never reach the worker.
      The reason goes to the log, where the operator is; the request gets a
      status a probe can act on.
    */
    const unconfigured = missingConfig(env);
    if (unconfigured.length) {
      console.error(
        `[boot] One cannot serve: ${unconfigured.join(", ")} is not set. ` +
        `In development copy engine/one/.dev.vars.example to .dev.vars; in a ` +
        `deployment ROOT is a var and AUTH_SECRET is a worker secret.`,
      );
      return unavailable();
    }

    try {
      await boot(env);
    } catch (why) {
      console.error("[boot]", why);
      return unavailable();
    }

    const url = new URL(request.url);
    /*
      ⚠️ THE API IS THE PLATFORM'S AND EVERYTHING ELSE IS THE PAGE. A single-page
      app owns its own routing, so an unknown path is the SPA's business rather
      than a 404 from here — and `/api/*` is the one prefix that is ours, which
      is why every operation answers under it and nothing else does.
    */
    /* ⚠️ ONE QUESTION, ASKED WHERE THE ANSWER LIVES. This list was written out
       here and the platform's own grew past it: the manifest and the icon are
       served by `serve.ts` and were never routed to it, so a phone asking for
       the manifest got the page with a 200 on it. See `isPlatformPath`. */
    if (isPlatformPath(url.pathname)) return handler(env)(request);
    return env.ASSETS.fetch(request);
  },

  /*
    ⚠️ THE CLOCK. Standing climbs the ladder by itself — it is derived from
    `past_due_at` on every read — so the rung that needs a scheduler is the last
    one, and it is the irreversible one: at day 37 the records go. A deletion
    that only happens when somebody visits is a deletion that never happens for
    exactly the workspaces nobody visits.

    ⚠️ AND IT BOOTS FIRST, LIKE A REQUEST. A sweep against a database whose
    tables are half-applied deletes from the ones that exist and reports success.

    ⚠️ THE THROW IS CAUGHT AND LOGGED BECAUSE NOTHING IS LISTENING. A scheduled
    handler has no user, no response and no red test; an uncaught throw here is a
    sweep that stopped months ago and a bill nobody is chasing. `run` records
    every attempt, so the console can show the LAST one rather than the next.
  */
  async scheduled(_event: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<void> {
    const work = (async () => {
      try {
        await boot(env);
        await sweep({
          directory: env.DIRECTORY as unknown as Db,
          shardOf: async (tenantId) => {
            const tenant = await tenantById(env.DIRECTORY as unknown as Db, tenantId);
            /* ⚠️ Null rather than a throw: a workspace on a shard this
               deployment does not bind is reported by the sweep, not fatal. */
            try { return tenant ? shardFor(env as never, tenant.shardId) : null; }
            catch { return null; }
          },
          apps: APPS,
          /* ⚠️ Retention is a rule about rows: one statement per table per
             database, not one per workspace. */
          shards: SHARDS.map((s) => shardFor(env as never, s.id)),
          /* ⚠️ So the last rung takes the OBJECTS and not only the rows. */
          bucketFor: (where) => bucketIn(where.residency),
          /* ⚠️ BY ID, because a move's TARGET shard has no workspace on it yet
             and `shardOf` resolves through the tenant. */
          shardById: (id) => {
            try { return shardFor(env as never, id); } catch { return null; }
          },
          residencyOf,
          /* ⚠️ ONLY WHERE THERE IS A TOKEN. Absent is a deployment that cannot
             provision, which is a state it has to survive rather than an error
             — a self-host, a test run, and this one before the secret is set. */
          ...(env.CF_API_TOKEN && env.CF_ACCOUNT_ID
            ? {
              reconcile: {
                at: {
                  accountId: env.CF_ACCOUNT_ID, token: env.CF_API_TOKEN,
                  /* The worker's own name, from its config. */
                  script: "one",
                },
                deployment: "one",
                apps: Object.values(APPS).map((make) => make()),
                serves: [...new Set(SHARD_RESIDENCY)],
              },
            }
            : {}),
        });
      } catch (why) {
        console.error("[sweep]", why);
      }
    })();
    ctx.waitUntil(work);
    await work;
  },
};

export { APPS, LEGAL, PLANS };
