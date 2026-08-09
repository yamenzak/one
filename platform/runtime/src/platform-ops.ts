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

import type { AnyOperation, AppSpec, BindingSpec, Caller, RegionId, SqlHandle, TenantId } from "@one/kernel";
import { check, nothing, operation, PUBLIC, s, toolNameFor, toolsFor, UNIVERSAL_RESERVED } from "@one/kernel";
import { placeTenant } from "./directory.js";

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
    outcome: { message: "Workspace created", tone: "success", invalidates: ["workspaces"] },
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
