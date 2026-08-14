/**
 * THE HOST IS THE TENANCY.
 *
 * ⚠️ WHICH DOOR A REQUEST ARRIVED AT IS A SECURITY DECISION, NOT ROUTING. The
 * operator console answers on one hostname and nowhere else; a workspace's slug
 * is what pins its tenancy, so a session pointed at the wrong workspace grants
 * nothing. Deciding this from a path or a header instead would make it something
 * a request can influence.
 *
 * ⚠️ AND AN UNRECOGNISED HOST IS NOTHING, NEVER A DEFAULT. Falling back to "the
 * first tenant" or "the marketing site" is how a hostname somebody points at us
 * becomes an address for a workspace they do not own.
 *
 * Layer 1. Imports primitives.
 */

import { RESERVED_SLUGS, slugOk } from "./primitives.js";

/**
 *   signpost  the bare root. Not an application: it says what this is and sends
 *             people to their own address. It never issues a sign-in code,
 *             because there is no tenancy for one to be about.
 *   account   one identity across every product. Yours, everywhere.
 *   operator  the deployment itself. `/api/admin/*` answers here and nowhere.
 *   setup     the only place a workspace is created.
 *   tenant    a workspace, at its slug or at a domain of its own.
 *   device    a pinned origin for hardware that has no session and resolves no
 *             tenant from its host — the tenancy arrives from its pairing.
 */
export type DoorKind = "signpost" | "account" | "operator" | "setup" | "tenant" | "device" | "none";

export type Door =
  | { readonly kind: Exclude<DoorKind, "tenant"> }
  | { readonly kind: "tenant"; readonly slug: string | null; readonly host: string };

export interface Roots {
  /** `quad.4dl.app`. Everything under it is ours. */
  readonly root: string;
  /** Hosts that belong to one workspace and are not under the root. */
  readonly custom?: (host: string) => boolean;
  /** ⚠️ Opt-in per deployment: `play` is a slug somebody could otherwise hold. */
  readonly device?: boolean;
}

const LABELS: Readonly<Record<string, DoorKind>> = {
  id: "account",
  admin: "operator",
  setup: "setup",
  play: "device",
};

/**
 * Which door this is.
 *
 * ⚠️ A CUSTOM DOMAIN IS THE SAME WORKSPACE AND CARRIES NO SLUG. Its tenancy is
 * resolved from the domain itself, which is why the tenant door reports the host
 * as well: one of the two is always the answer, and the caller must not have to
 * guess which.
 */
export function doorFor(host: string, roots: Roots): Door {
  const name = host.toLowerCase().split(":")[0] ?? "";
  if (!name) return { kind: "none" };

  if (name === roots.root) return { kind: "signpost" };

  if (name.endsWith(`.${roots.root}`)) {
    const label = name.slice(0, -(roots.root.length + 1));
    /* ⚠️ One label only. `a.b.quad.4dl.app` is not a workspace called "a.b" —
       it is a host we do not serve, and treating it as one would make every
       wildcard certificate a way to invent addresses. */
    if (label.includes(".")) return { kind: "none" };

    const known = LABELS[label];
    if (known === "device") return roots.device ? { kind: "device" } : { kind: "none" };
    if (known === "account" || known === "operator" || known === "setup") return { kind: known };

    /* ⚠️ A RESERVED LABEL IS NOT A WORKSPACE, and this is a takeover check
       rather than tidiness: a workspace at `admin` or `autodiscover` answers on
       a door it does not own. */
    if (!slugOk(label) || RESERVED_SLUGS.includes(label)) return { kind: "none" };
    return { kind: "tenant", slug: label, host: name };
  }

  if (roots.custom?.(name)) return { kind: "tenant", slug: null, host: name };
  return { kind: "none" };
}

/** ⚠️ Where a request that resolves no tenancy may still be answered. */
export const needsTenant = (door: Door): boolean => door.kind === "tenant";
