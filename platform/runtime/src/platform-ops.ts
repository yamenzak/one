/**
 * OPERATIONS THE PLATFORM OWNS, because no app could implement them.
 *
 * ⚠️ CREATING A WORKSPACE WRITES THE DIRECTORY, WHICH IS NOT A REGIONAL STORE.
 * A handler cannot reach it — that is the whole design of `ctx.bind`, and
 * relaxing it for one operation would relax it for every operation. So the
 * operation lives here, where the directory does, and every app gets the same
 * one rather than each writing a version that decides slug rules for itself.
 *
 * The consequence worth stating: an app cannot make a tenant. It can only ask
 * for one, on the setup door, through a surface whose reserved-label rules,
 * region validation and standing default are the platform's.
 */

import type { AnyOperation, AppSpec, BindingSpec, Caller, Instant, RegionId, SqlHandle, TenantId, UserId } from "@one/kernel";
import { check, nothing, operation, PUBLIC, s, slugProblem, toolNameFor, toolsFor } from "@one/kernel";
import { placeTenant } from "./directory.js";
import { writeSetting } from "./settings.js";
import { claim, invite } from "./membership.js";
import { BRANDING, EVERY_PRODUCT, grantOpens, mayCreateHere, setupDoorFor, type Product } from "@one/kernel";
import { sameSecret, type ProvisioningStore } from "./provisioning.js";

/**
 * ⚠️ A SYMBOL, so an app cannot reach it by writing the property name.
 *
 * Platform operations need the directory; app operations must not have it. A
 * string key on `Ctx` would be reachable from any handler with a cast and would
 * appear in autocomplete, which is an invitation. This is the narrowest way to
 * hand one capability to code the platform wrote without widening the contract
 * every app codes against.
 */
export const DIRECTORY = Symbol.for("one.runtime.directory");

export interface DirectoryCarrier { readonly [DIRECTORY]: SqlHandle }

/**
 * ⚠️ THE NEW WORKSPACE'S OWN REGION, not the caller's.
 *
 * A workspace is created on the setup door, which resolved whatever region that
 * door defaults to — and the creator may have asked for a different one. Writing
 * the founding membership into `ctx.bind` would put it in the region the DOOR
 * resolved, so the workspace would be created in Frankfurt and its only member
 * recorded in Virginia. Nobody could enter it, and the row would look correct in
 * both places.
 */
export const FOUNDER = Symbol.for("one.runtime.founder");

export interface FounderDeps {
  /**
   * The regional store for a named region — BOOTED, then resolved.
   *
   * ⚠️ THE FIRST WRITE A REGION EVER TAKES IS THIS ONE, and until it happened
   * nothing had ever made the runtime open that database. Booting is lazy and
   * keyed on the region a REQUEST resolved to, so creating a workspace in a
   * region nobody is in yet reaches a store with no tables in it. The founding
   * membership is what finds that, because it is the first row anybody writes.
   */
  sessionsIn(region: RegionId): Promise<SqlHandle>;
  readonly email: string | null;
  readonly userId: string | null;
}

export interface FounderCarrier { readonly [FOUNDER]: FounderDeps }

/**
 * WHO MAY BE LET INTO THIS PRODUCT, AND WHO MAY SAY SO.
 *
 * ⚠️ A SYMBOL FOR THE SAME REASON THE DIRECTORY IS ONE. Reading a grant is a
 * platform question; WRITING one is a machine lane with a shared secret behind
 * it, and neither belongs on the contract an app's handlers code against.
 */
export const PROVISION = Symbol.for("one.runtime.provision");

export interface ProvisionDeps {
  readonly store: ProvisioningStore;
  /**
   * ⚠️ THE KEY THE COMPANY'S OWN WEBSITE PRESENTS, from the shared config store.
   * Absent — the ordinary state of a fresh deployment — means the lane is CLOSED
   * rather than open: a missing secret that admitted everybody would be the worst
   * possible default for the one endpoint that opens products to addresses.
   */
  readonly key: string;
  /** What the caller presented, if anything. Never logged. */
  readonly presented: string | null;
  /**
   * ⚠️ EVERY PRODUCT ON THIS DEPLOYMENT, from the module every worker imports.
   * Absent is a self-host with one product and nothing to choose between.
   */
  readonly products: readonly Product[];
}

export interface ProvisionCarrier { readonly [PROVISION]: ProvisionDeps }

/**
 * Which role the person who creates a workspace holds in it.
 *
 * ⚠️ THE ONE THAT CAN MANAGE MEMBERS, chosen by what it can DO rather than by
 * what it is called. An app is free to call its administrators anything —
 * `owner`, `principal`, `admin` — and a platform that matched on the word would
 * silently found workspaces whose creator cannot invite anybody.
 *
 * Null when no role can, which is a real app: one where every workspace is
 * provisioned by an operator rather than created by its own members.
 */
export function foundingRole<B extends BindingSpec>(app: AppSpec<B>): string | null {
  return Object.entries(app.access.roles).find(([, keys]) => keys.includes("member:manage"))?.[0] ?? null;
}

export function platformOperations<B extends BindingSpec>(app: AppSpec<B>): readonly AnyOperation[] {
  /**
   * WHAT THIS PERSON MAY OPEN, AND WHERE.
   *
   * ⚠️ ANSWERED FROM THE DEPLOYMENT'S OWN LIST OF PRODUCTS, not from what this
   * worker happens to be. The account centre is served by one app and the answer
   * is about all of them — which is exactly why the list is declared once, in a
   * module every worker imports, rather than assembled from whichever manifest is
   * in scope.
   *
   * ⚠️ AND A PRODUCT WITH AN OPEN FRONT DOOR IS ALWAYS IN THE ANSWER. Somebody
   * with no grant at all may still open a workspace in a self-serve product, and
   * an account centre that only listed granted ones would hide the free one.
   */
  const mayOpen = operation({
    id: "me.products",
    kind: "read",
    summary: "The products you can open a workspace in.",
    input: nothing(),
    output: s.object({ products: s.json() }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    /* ⚠️ Not a tool: it is a shopping list keyed to one person's entitlements. */
    tool: false,
    async handler(ctx) {
      const founder = (ctx as unknown as FounderCarrier)[FOUNDER];
      const provision = (ctx as unknown as ProvisionCarrier)[PROVISION];
      if (!founder?.email) return { products: [] };
      const held = await provision.store.read(founder.email);
      return {
        products: (provision.products ?? [])
          .filter((p) => p.open === true || grantOpens(held, p.id))
          /* ⚠️ THE ADDRESS IS DERIVED, so the account centre and the product
             cannot disagree about the one thing that has to be right. */
          .map((p) => ({ id: p.id, name: p.name, does: p.does, setupAt: setupDoorFor(p) })),
      };
    },
  });

  /**
   * LETTING SOMEBODY IN — the one machine lane on this deployment.
   *
   * ⚠️ IT IS CALLED BY OUR OWN WEBSITE AND BY NOTHING ELSE. Somebody types their
   * address on the company's site, and the product they bought is opened for that
   * address here — before they have an account, which is the ordinary case and
   * the reason the grant is written against an address.
   *
   * ⚠️ AUTHENTICATED BY A SHARED SECRET, IN CONSTANT TIME, AND CLOSED WHEN THERE
   * IS NONE. A missing key admitting everybody is the worst available default for
   * the one endpoint that opens products to arbitrary addresses — so absent means
   * refused, which is also the state of every fresh deployment.
   *
   * ⚠️ AND IT SAYS NOTHING BACK. Not whether the address has an account, not
   * whether it already held a grant: an endpoint somebody can call with a stolen
   * key should not also be an oracle about who our customers are.
   */
  const provisionGrant = operation({
    id: "platform.provisioning.grant",
    kind: "write",
    summary: "Let an address open a workspace in one or more products.",
    input: s.object({
      email: s.text({ min: 3, max: 320 }),
      /* ⚠️ Named products, or the wildcard. Absent is every product this
         deployment sells, which is what a single-product site will send. */
      apps: s.optional(s.array(s.text({ max: 40 }))),
    }),
    output: s.object({ granted: s.bool() }),
    permission: PUBLIC,
    /* ⚠️ Natural on the address: the same purchase retried is one grant. */
    idempotency: { mode: "natural", key: "email" },
    audit: (i: { email: string }) => ({ subject: i.email, verb: "provision" }),
    fails: ["platform.forbidden", "platform.invalid"],
    /* ⚠️ A model that can provision can provision anybody. */
    tool: false,
    async handler(ctx, input: { email: string; apps?: readonly string[] }) {
      const provision = (ctx as unknown as ProvisionCarrier)[PROVISION];
      if (!provision.presented || !sameSecret(provision.presented, provision.key)) {
        ctx.fail("platform.forbidden", { reason: "not a provisioning caller" });
      }
      const email = input.email.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) ctx.fail("platform.invalid", { field: "email" });
      const apps = input.apps?.length ? input.apps : [EVERY_PRODUCT];
      await provision.store.grant(email, apps, "website", ctx.now() as Instant);
      return { granted: true as const };
    },
  });

  /** ⚠️ A switch with no off is not a switch — a refund is the ordinary case. */
  const provisionRevoke = operation({
    id: "platform.provisioning.revoke",
    kind: "write",
    summary: "Stop an address opening new workspaces in one or more products.",
    input: s.object({ email: s.text({ min: 3, max: 320 }), apps: s.optional(s.array(s.text({ max: 40 }))) }),
    output: s.object({ revoked: s.bool() }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    audit: (i: { email: string }) => ({ subject: i.email, verb: "unprovision" }),
    fails: ["platform.forbidden"],
    tool: false,
    async handler(ctx, input: { email: string; apps?: readonly string[] }) {
      const provision = (ctx as unknown as ProvisionCarrier)[PROVISION];
      if (!provision.presented || !sameSecret(provision.presented, provision.key)) {
        ctx.fail("platform.forbidden", { reason: "not a provisioning caller" });
      }
      /*
        ⚠️ IT TAKES AWAY THE ABILITY TO OPEN A NEW ONE AND NOTHING ELSE. Workspaces
        that exist keep existing, with their members, their records and their bill:
        a refund is not a reason for somebody else's studio to disappear, and an
        endpoint a website can call must never be able to make that happen.
      */
      await provision.store.revoke(input.email, input.apps?.length ? input.apps : null);
      return { revoked: true as const };
    },
  });

  const createWorkspace = operation({
    /*
      ⚠️ ON THE `identity` LANE, which survives every rung of the standing
      ladder. There is no other lane it could be on: a workspace is created
      before anything has been paid for, which is the only state this is ever
      called in.
    */
    id: "identity.workspace.create",
    kind: "write",
    summary: "Create a workspace at a given address.",
    /*
      ⚠️ THE NAME IS TAKEN HERE BECAUSE THIS IS THE ONLY MOMENT IT IS FREE. It is
      `brand.name`, which the directory row carries — so it reaches `/api/host`
      on the very first request and the sign-in screen wears the business's own
      name from a cold start. Collected on a settings screen afterwards instead,
      the first thing every customer sees on their own address is the product's
      name where theirs should be, and most never go and change it.
    */
    input: s.object({ slug: s.text({ min: 2, max: 32 }), name: s.optional(s.text({ max: 80 })), region: s.optional(s.text({ max: 16 })) }),
    output: s.object({ tenantId: s.text(), slug: s.text(), region: s.text() }),
    permission: "workspace:create",
    idempotency: { mode: "natural", key: "slug" },
    audit: (i: { slug: string }) => ({ subject: i.slug, verb: "create" }),
    /*
      ⚠️ THE ONE ARRIVAL A PRODUCT GETS. Everything after this is somebody using
      the thing; this is the moment they have one — which is exactly the kind of
      event the vocabulary exists for, and exactly the kind a product forgets to
      mark because the code path is a `INSERT`.
    */
    outcome: { message: "Workspace created", tone: "success", moment: "welcome", invalidates: ["workspaces"] },
    emits: ["workspace.created"],
    fails: ["platform.invalid", "platform.conflict", "platform.not_provisioned"],
    /*
      ⚠️ NOT REACHABLE BY A TOOL. An assistant that can mint tenants can mint
      them in a loop, and every one is a real address somebody else can no longer
      have. Exposure is opt-out everywhere else; this is where opting out is
      worth the sentence.
    */
    tool: false,
    async handler(ctx, input: { slug: string; name?: string; region?: string }) {
      const directory = (ctx as unknown as DirectoryCarrier)[DIRECTORY];
      const name = (input.name ?? "").trim();
      /*
        ⚠️ THE GRANT IS CHECKED HERE, NOT IN THE SCREEN THAT OFFERS THE BUTTON. A
        control the account centre does not draw is a decoration: this route is in
        the API document, in the typed client and in every tool catalogue, and
        anybody signed in holds `workspace:create` on a tenantless door by
        construction. An app that sells its way in says so in its manifest, and
        this is the line that makes the saying true.

        ⚠️ AND IT IS ON THE ADDRESS THE SESSION PROVES, never on one in the body.
        A grant looked up by an input field is a grant anybody can borrow by
        typing somebody else's address.
      */
      if (app.tenancy.creation === "granted") {
        const founder = (ctx as unknown as FounderCarrier)[FOUNDER];
        const provision = (ctx as unknown as ProvisionCarrier)[PROVISION];
        const held = founder?.email ? await provision.store.read(founder.email) : null;
        if (!mayCreateHere(app.tenancy.creation, held, app.id)) ctx.fail("platform.not_provisioned", { product: app.name });
      }
      const bad = slugProblem(input.slug, app.tenancy.reservedSlugs);
      if (bad) ctx.fail("platform.invalid", { field: "slug", reason: bad });

      const region = (input.region ?? app.tenancy.defaultRegion) as RegionId;
      /*
        ⚠️ A REGION IS CHECKED AGAINST WHAT THIS DEPLOYMENT ACTUALLY HAS. An
        unknown one placed in the directory routes every later request to a
        binding that does not exist, and the tenant is unreachable from the
        moment it is created — with the row looking perfectly correct.
      */
      if (!app.tenancy.regions.includes(region)) ctx.fail("platform.invalid", { field: "region", reason: "not available" });

      const taken = await directory.first<{ slug: string }>(`SELECT slug FROM tenant_directory WHERE slug = ?`, input.slug);
      if (taken) ctx.fail("platform.conflict", { field: "slug", reason: "that address is taken" });

      const tenantId = `t_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}` as TenantId;
      await placeTenant(directory, {
        tenantId,
        slug: input.slug,
        region,
        /* ⚠️ THE APP THAT MADE IT, recorded once and never inferred. It is what
           lets the account centre match a workspace to the declaration of what
           its product wants to know — a workspace with no app is one the vault
           cannot speak for. */
        appId: app.id,
        /*
          ⚠️ A NEW WORKSPACE IS `active`, NOT `incomplete`. A parking status is a
          default, and a gate that reads a default as a verdict holds every
          workspace read-only on a deployment that has no payment rail at all —
          which is every self-host, and every test.
        */
        standing: { standing: "active", reason: "ok" },
        domains: [],
        /*
          ⚠️ THE NAME IF THERE IS ONE, AND NOTHING ELSE. The mark and the accent
          are chosen later; an empty string here would be a value, and every
          consumer reads an absent key as "the product's own" while reading a
          blank one as a name that is blank.
        */
        branding: name ? { "brand.name": name } : {},
      });

      const founder = (ctx as unknown as FounderCarrier)[FOUNDER];

      /*
        ⚠️ THE NAME IS WRITTEN TO THE WORKSPACE'S OWN STORE, NOT ONLY TO THE
        DIRECTORY COPY — and this is the half that would have gone missing
        silently. `branding` on the directory row is a COPY, republished from the
        regional `tenant_settings` on every settings write; written only there, the
        name a business typed here would survive until the first time anybody
        changed their logo or their colour, and then be replaced by the copy of a
        row that never existed. Nothing would report it: the settings screen would
        show an empty name field, which is exactly what an un-named workspace
        looks like.
      */
      if (name && founder) {
        const store = await founder.sessionsIn(region);
        await writeSetting(store, BRANDING, tenantId, "brand.name", name, ctx.now());
      }

      /*
        ⚠️ THE CREATOR IS ITS FIRST MEMBER, WRITTEN HERE OR NOWHERE. A workspace
        whose creator has no membership is a workspace nobody can enter: the
        directory row is correct, the tables exist, and every request answers 403
        because the caller belongs to nothing. There is no later step that could
        fix it either — inviting somebody requires being a member.
      */
      const owner = foundingRole(app);
      if (owner && founder?.email) {
        const store = await founder.sessionsIn(region);
        await invite(
          store,
          tenantId,
          { email: founder.email, role: owner, invitedBy: founder.userId as never },
          ctx.now() as Instant,
        );
        /*
          ⚠️ AND IT IS THEIRS IMMEDIATELY, because they are standing here. `invite`
          writes an address with no account behind it — right for an invitation,
          where the person may not have signed up yet — and every cross-workspace
          question is asked by ACCOUNT: which workspaces am I in, where am I the
          last administrator, what may I leave. Left unclaimed, somebody who made
          a workspace from the setup door and had not yet visited it was absent
          from their own account centre, and closing their account would have
          stranded a workspace nothing could see they were alone in.

          ⚠️ IT STILL GOES THROUGH `claim`, whose `account_id IS NULL` predicate is
          what stops an address that has changed hands from being taken over. The
          row was written a statement ago, so the claim is theirs by construction
          rather than by permission.
        */
        if (founder.userId) {
          await claim(store, tenantId, founder.userId as UserId, founder.email, ctx.now() as Instant);
        }
      }
      return { tenantId, slug: input.slug, region };
    },
  });

  return [createWorkspace, mayOpen, provisionGrant, provisionRevoke] as unknown as readonly AnyOperation[];
}

/* ------------------------------------------------------------------ tools --- */

/** ⚠️ A symbol, so an app cannot reach the registry by writing a property name. */
export const TOOLS = Symbol.for("one.runtime.tools");

export interface ToolDeps {
  readonly operations: readonly AnyOperation[];
  readonly caller: Caller;
  dispatch(op: AnyOperation, input: unknown): Promise<unknown>;
}
export interface ToolCarrier { readonly [TOOLS]: ToolDeps }

/**
 * THE AI'S SURFACE, WHICH IS THE ROUTE SURFACE MASKED BY THE CALLER.
 *
 * ⚠️ THE SAFETY ARGUMENT IS THAT THERE IS NO SECOND LIST. `toolsFor` filters the
 * one operation registry with the same `check` the router uses, so an
 * assistant's reach IS the operator's reach by construction. Two registries kept
 * in step by hand is how a product ships an agent that can do more than the
 * person driving it, with nothing failing anywhere.
 */
export function toolOperations(): readonly AnyOperation[] {
  const list = operation({
    id: "tools.list",
    kind: "read",
    summary: "The operations this caller may drive.",
    input: nothing(),
    output: s.object({ tools: s.json() }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    async handler(ctx) {
      const t = (ctx as unknown as ToolCarrier)[TOOLS];
      return { tools: toolsFor(t.operations, t.caller) };
    },
  });

  const call = operation({
    id: "tools.call",
    kind: "write",
    summary: "Run one of the operations this caller may drive.",
    input: s.object({ name: s.text({ max: 120 }), input: s.optional(s.json()) }),
    output: s.object({ result: s.json() }),
    permission: PUBLIC,
    // vocabulary-exempt: the HTTP caller supplies the key, because only whoever
    // is retrying knows that two attempts are one intent.
    idempotency: { mode: "client-supplied" },
    fails: ["platform.not_found", "platform.forbidden"],
    /*
      ⚠️ THE TOOL TRANSPORT IS NOT ITSELF A TOOL. Exposing it would let a model
      call itself, which is a loop with a budget attached and no new capability
      at the end of it.
    */
    tool: false,
    async handler(ctx, input: { name: string; input?: unknown }) {
      const t = (ctx as unknown as ToolCarrier)[TOOLS];
      const target = t.operations.find((op) => toolNameFor(op) === input.name);

      /*
        ⚠️ RE-CHECKED HERE, NEVER TRUSTED BECAUSE IT CAME FROM THE CATALOGUE. The
        catalogue was computed for a caller at a moment; a call arrives later,
        possibly naming something that was never offered. `tool !== false` is
        checked with it, so an operation withheld from every model cannot be
        reached by spelling its name correctly.
      */
      if (!target || target.tool === false) ctx.fail("platform.not_found");
      const verdict = check(target!, t.caller);
      if (!verdict.allowed) ctx.fail("platform.forbidden", { refusal: verdict.refusal });

      return { result: await t.dispatch(target!, input.input ?? {}) };
    },
  });

  return [list, call] as unknown as readonly AnyOperation[];
}
