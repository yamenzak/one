/**
 * REQUEST RESOLUTION — hostname → door → tenant → region → bindings, in that
 * order, with no step skippable.
 *
 * Layer 3. Imports primitives, bindings, problem, doors, standing, directory.
 *
 * This is the whole reason PLAN.md §4.1 says regions must be right before the
 * first table. Every store access in the platform hangs off the end of this
 * pipeline, so the pipeline decides whether a second region is a configuration
 * change or a rewrite.
 */

import type { BindingSpec, Handle, ResolvedBindings } from "./bindings.js";
import type { Directory, DirectoryEntry, ResolvedRegion } from "./directory.js";
import { resolveRegion } from "./directory.js";
import type { Door, DoorConfig, HostShape } from "./doors.js";
import { classifyHost, TENANT_DOORS } from "./doors.js";
import type { RegionId } from "./primitives.js";
import type { Problem } from "./problem.js";
import type { StandingGate } from "./standing.js";
import { gateFor } from "./standing.js";

/** Everything decided before a handler runs. */
export interface Resolved {
  readonly host: HostShape;
  readonly door: Door;
  /** Null on a tenantless door. Not an error — `setup` has no tenant by design. */
  readonly tenant: DirectoryEntry | null;
  readonly region: ResolvedRegion;
  readonly gate: StandingGate;
}

export type Resolution = { readonly ok: true; readonly at: Resolved } | { readonly ok: false; readonly problem: Omit<Problem, "ref"> };

export interface ResolveConfig extends DoorConfig {
  /** Where a tenantless request reads from. Routing data only. */
  readonly directoryRegion: RegionId;
}

/**
 * Resolve a request, or refuse it.
 *
 * ⚠️ THE ORDER IS THE SECURITY MODEL. The tenancy is pinned from the hostname
 * before any session is read, so a session pointed at the wrong tenant grants
 * nothing — it is not that the session is rejected, it is that the tenancy was
 * never taken from it.
 *
 * The directory read happens BEFORE any regional store is touched, which is what
 * makes it possible to touch the right one at all.
 */
export async function resolveRequest(hostname: string, cfg: ResolveConfig, directory: Directory): Promise<Resolution> {
  const host = classifyHost(hostname, cfg);

  if (host.door === "invalid") {
    return { ok: false, problem: { code: "platform.not_found", status: 404, title: "Not found", retryable: false } };
  }

  /*
    ⚠️ `unclaimed` is a DISTINCT answer from `invalid`, and the distinction is
    worth a branch. A well-formed subdomain nobody owns must not be told apart
    from a reserved one by an outsider probing for names — but the product needs
    to tell them apart internally to explain a refused signup. Same status, same
    body, different `door`.
  */
  if (host.door === "unclaimed") {
    return { ok: false, problem: { code: "platform.not_found", status: 404, title: "Not found", retryable: false } };
  }

  if (!TENANT_DOORS.includes(host.door)) {
    // Root, setup, admin, device: served, with no tenant and no regional store.
    return {
      ok: true,
      at: {
        host,
        door: host.door,
        tenant: null,
        region: cfg.directoryRegion as ResolvedRegion,
        gate: { reads: true, writes: true, app: true },
      },
    };
  }

  const entry = host.door === "custom" ? await directory.byDomain(host.hostname) : await directory.bySlug(host.slug ?? "");
  if (!entry) {
    return { ok: false, problem: { code: "platform.not_found", status: 404, title: "Not found", retryable: false } };
  }

  return {
    ok: true,
    at: {
      host,
      door: host.door,
      tenant: entry,
      region: resolveRegion(entry, cfg.directoryRegion),
      gate: gateFor(entry.standing),
    },
  };
}

/* --------------------------------------------------------------- bindings --- */

/**
 * Turns a declaration into handles, for one region.
 *
 * ⚠️ IT TAKES A `ResolvedRegion`, WHICH ONLY `resolveRegion` CAN PRODUCE.
 *
 * That single constraint is what makes "no handler ever sees a raw binding" a
 * compile error rather than a code-review habit. A handler cannot guess a
 * region, default to one, or read one from a header: it can only be handed the
 * one its request resolved to. In the legacy tree this rule is a lint over
 * source text; here it is the type system.
 */
export interface RegionalBindings<B extends BindingSpec> {
  for(region: ResolvedRegion): ResolvedBindings<B>;
}

/**
 * Stage 1 wiring is a stub, and deliberately so: the SHAPE is what stage 0's
 * findings said to prove first. What matters here is the signature — a region
 * that came from a lookup goes in, opaque handles come out, and nothing in
 * between is reachable from an app.
 */
export function regionalBindings<B extends BindingSpec>(spec: B): RegionalBindings<B> {
  return {
    for(_region: ResolvedRegion): ResolvedBindings<B> {
      const out: Record<string, Handle<never>> = {};
      for (const key of Object.keys(spec)) out[key] = {} as Handle<never>;
      return out as ResolvedBindings<B>;
    },
  };
}

/*
  DEFER(one-004) stage:1 — turn `regionalBindings` into a real resolver over
  Cloudflare's per-region D1, R2 and durable-object namespaces. The SHAPE is
  proved and mutation-tested; the wiring is not written. See test/FINDINGS.md §8.
*/
