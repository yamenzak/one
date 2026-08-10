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

import type { AnyOperation, AppSpec, BindingSpec, Caller, Instant, RegionId, SqlHandle, TenantId } from "@one/kernel";
import { check, nothing, operation, PUBLIC, s, toolNameFor, toolsFor, UNIVERSAL_RESERVED } from "@one/kernel";
import { placeTenant } from "./directory.js";
import { invite } from "./membership.js";

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

/** `hello`, `my-gym`, `north-clinic` — a DNS label, and never a door. */
export function slugProblem(slug: string, reserved: readonly string[]): string | null {
  if (!/^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])?$/.test(slug)) return "not a valid address";
  /*
    ⚠️ THE RESERVED LIST IS A SECURITY CONTROL, NOT TIDINESS. A workspace at
    `admin` is the operator console; at `autodiscover` it is mail configuration;
    at `_acme-challenge` it is certificate issuance. Each is a takeover with a
    friendly name.
  */
  if (UNIVERSAL_RESERVED.includes(slug) || reserved.includes(slug)) return "that address is taken";
  return null;
}

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
    input: s.object({ slug: s.text({ min: 2, max: 32 }), region: s.optional(s.text({ max: 16 })) }),
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
    fails: ["platform.invalid", "platform.conflict"],
    /*
      ⚠️ NOT REACHABLE BY A TOOL. An assistant that can mint tenants can mint
      them in a loop, and every one is a real address somebody else can no longer
      have. Exposure is opt-out everywhere else; this is where opting out is
      worth the sentence.
    */
    tool: false,
    async handler(ctx, input: { slug: string; region?: string }) {
      const directory = (ctx as unknown as DirectoryCarrier)[DIRECTORY];
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
        /*
          ⚠️ A NEW WORKSPACE IS `active`, NOT `incomplete`. A parking status is a
          default, and a gate that reads a default as a verdict holds every
          workspace read-only on a deployment that has no payment rail at all —
          which is every self-host, and every test.
        */
        standing: { standing: "active", reason: "ok" },
        domains: [],
      });

      /*
        ⚠️ THE CREATOR IS ITS FIRST MEMBER, WRITTEN HERE OR NOWHERE. A workspace
        whose creator has no membership is a workspace nobody can enter: the
        directory row is correct, the tables exist, and every request answers 403
        because the caller belongs to nothing. There is no later step that could
        fix it either — inviting somebody requires being a member.
      */
      const founder = (ctx as unknown as FounderCarrier)[FOUNDER];
      const owner = foundingRole(app);
      if (owner && founder?.email) {
        await invite(
          await founder.sessionsIn(region),
          tenantId,
          { email: founder.email, role: owner, invitedBy: founder.userId as never },
          ctx.now() as Instant,
        );
      }
      return { tenantId, slug: input.slug, region };
    },
  });

  return [createWorkspace as unknown as AnyOperation];
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
